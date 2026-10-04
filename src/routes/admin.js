import { Hono } from 'hono';
import Rut from '../../public/js/rut.js';
import * as S from '../lib/slots.js';
import * as B from '../lib/bookings.js';
import * as mailer from '../lib/mailer.js';
import * as auth from '../lib/auth.js';
import { all, first, run, nowIso, getSettings, dayBounds, parseOverride, hit, DEFAULT_SETTINGS } from '../db.js';
import { HttpError, cleanText, isEmail } from '../lib/util.js';
import { TZ, dateStrTz, minutesTz } from '../lib/tz.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const originOf = (c) => new URL(c.req.url).origin;
const bool = (r, ...keys) => { for (const k of keys) if (k in r) r[k] = !!r[k]; return r; };

function validRanges(ranges){
  if (!Array.isArray(ranges)) return null;
  const out = [];
  for (const r of ranges){
    if (!r || !TIME_RE.test(r.start) || !TIME_RE.test(r.end) || S.toMin(r.end) <= S.toMin(r.start)) return null;
    out.push({ start: r.start, end: r.end });
  }
  return out.sort((a, b) => S.toMin(a.start) - S.toMin(b.start));
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const pesoOf = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 9999) throw new HttpError(400, 'Peso inválido.');
  return n;
};

export default function adminRoutes(preset){
  const r = new Hono();

  r.post('/login', async (c) => {
    const ip = c.req.header('cf-connecting-ip') || 'local';
    if (!(await hit(c.env.DB, `login:${ip}`, 10, 900))) throw new HttpError(429, 'Demasiados intentos. Espera 15 minutos.');
    const { email, password } = await c.req.json().catch(() => ({}));
    if (!(await auth.checkCredentials(c.env, email, password))) return c.json({ error: 'Correo o contraseña incorrectos.' }, 401);
    await auth.startSession(c);
    return c.json({ ok: true });
  });

  r.post('/logout', (c) => { auth.endSession(c); return c.json({ ok: true }); });

  r.get('/session', async (c) => c.json({ admin: await auth.isAdmin(c), negocio: preset.negocio }));

  r.use('*', auth.requireAdmin);

  // ---------- Agenda ----------
  r.get('/bookings', async (c) => {
    const from = String(c.req.query('from') || S.dateStr(new Date()));
    const to = String(c.req.query('to') || from);
    if (!S.isValidDateStr(from) || !S.isValidDateStr(to)) throw new HttpError(400, 'Fechas inválidas.');
    const [a, b] = dayBounds(from, to);
    const rows = await all(c.env.DB,
      `SELECT b.id, b.start_at, b.end_at, b.status, b.motivo,
              s.id AS service_id, s.nombre AS servicio,
              m.id AS mascota_id, m.nombre AS mascota, m.especie,
              t.id AS tutor_id, t.nombre AS tutor, t.rut, t.telefono, t.email, t.strikes, t.blocked,
              v.id AS visita_id, v.estado AS visita_estado, v.peso_kg, v.observaciones
       FROM booking b
       JOIN service s ON s.id = b.service_id
       JOIN mascota m ON m.id = b.mascota_id
       JOIN tutor t ON t.id = b.tutor_id
       LEFT JOIN visita v ON v.booking_id = b.id
       WHERE b.start_at >= ?1 AND b.start_at < ?2 AND b.status <> 'expired'
       ORDER BY b.start_at`, a, b);
    return c.json({ from, to, bookings: rows.map((x) => bool(x, 'blocked')) });
  });

  r.patch('/bookings/:id', async (c) => {
    const db = c.env.DB, id = Number(c.req.param('id')) || 0;
    const body = await c.req.json().catch(() => ({}));
    const status = String(body.status || '');
    if (!['confirmed', 'cancelled', 'no_show', 'done'].includes(status)) throw new HttpError(400, 'Estado inválido.');
    const settings = await getSettings(db);
    const peso = pesoOf(body.peso_kg);
    const observaciones = cleanText(body.observaciones, 2000);
    const bk = await first(db, 'SELECT id, status, tutor_id, start_at, block_end_at FROM booking WHERE id = ?1', id);
    if (!bk) throw new HttpError(404, 'Reserva no encontrada.');
    if (status === 'cancelled'){
      const ok = await B.cancelBooking(db, id);
      if (ok && body.notify !== false) c.executionCtx.waitUntil(B.bookingDetails(db, id).then((d) => mailer.sendCancellation(c.env, originOf(c), preset.negocio, d)));
      return c.json({ ok: true });
    }
    // volver a "confirmada" no puede chocar con otra hora activa
    const res = status === 'confirmed'
      ? await run(db, `UPDATE booking SET status = ?2, hold_expires_at = NULL WHERE id = ?1 AND NOT ${B.overlapSql(1, 3, 4, 5)}`, id, status, nowIso(), bk.block_end_at, bk.start_at)
      : await run(db, 'UPDATE booking SET status = ?2, hold_expires_at = NULL WHERE id = ?1', id, status);
    if (!res.meta.changes) throw new HttpError(409, 'Esa hora choca con otra reserva activa.');
    await B.syncVisita(db, id, status, { peso_kg: peso, observaciones });
    if (status === 'no_show' && bk.status !== 'no_show'){
      await run(db, 'UPDATE tutor SET strikes = strikes + 1, blocked = CASE WHEN blocked = 1 OR strikes + 1 >= ?2 THEN 1 ELSE 0 END WHERE id = ?1', bk.tutor_id, Number(settings.strikes_to_block));
    }
    return c.json({ ok: true });
  });

  // ---------- Horario por defecto ----------
  r.get('/schedule', async (c) => {
    const rows = await all(c.env.DB, 'SELECT weekday, start_time AS "start", end_time AS "end" FROM weekly_schedule ORDER BY weekday, start_time');
    return c.json({ items: rows });
  });

  r.put('/schedule', async (c) => {
    const db = c.env.DB;
    const { items = [] } = await c.req.json().catch(() => ({}));
    if (!Array.isArray(items)) throw new HttpError(400, 'Formato inválido.');
    for (const it of items){
      const wd = Number(it.weekday);
      if (!Number.isInteger(wd) || wd < 0 || wd > 6) throw new HttpError(400, 'Día inválido.');
      if (!validRanges([{ start: it.start, end: it.end }])) throw new HttpError(400, `Rango inválido: ${it.start}–${it.end}`);
    }
    await db.batch([
      db.prepare('DELETE FROM weekly_schedule'),
      ...items.map((it) => db.prepare('INSERT INTO weekly_schedule(weekday, start_time, end_time) VALUES (?1,?2,?3)').bind(Number(it.weekday), it.start, it.end)),
    ]);
    return c.json({ ok: true });
  });

  // ---------- Días especiales ----------
  r.get('/overrides', async (c) => {
    const rows = await all(c.env.DB, 'SELECT id, date_from, date_to, closed, ranges, nota FROM schedule_override WHERE date_to >= ?1 ORDER BY date_from, id', S.dateStr(new Date()));
    return c.json({ items: rows.map(parseOverride) });
  });

  r.post('/overrides', async (c) => {
    const db = c.env.DB;
    const b = await c.req.json().catch(() => ({}));
    const from = String(b.date_from || '');
    const to = String(b.date_to || from);
    if (!S.isValidDateStr(from) || !S.isValidDateStr(to) || to < from) throw new HttpError(400, 'Fechas inválidas.');
    const closed = !!b.closed;
    const ranges = closed ? [] : validRanges(b.ranges);
    if (!closed && (!ranges || !ranges.length)) throw new HttpError(400, 'Agrega al menos un rango de horas válido.');
    const item = await first(db,
      'INSERT INTO schedule_override(date_from, date_to, closed, ranges, nota, created_at) VALUES (?1,?2,?3,?4,?5,?6) RETURNING *',
      from, to, closed ? 1 : 0, JSON.stringify(ranges), cleanText(b.nota, 200), nowIso());

    // Horas activas que quedan fuera del nuevo horario (para avisar al dueño)
    const [a, z] = dayBounds(from, to);
    const active = await all(db,
      `SELECT b.id, b.start_at, b.end_at, m.nombre AS mascota, t.nombre AS tutor
       FROM booking b JOIN mascota m ON m.id = b.mascota_id JOIN tutor t ON t.id = b.tutor_id
       WHERE b.status IN ('pending','confirmed') AND b.start_at >= ?1 AND b.start_at < ?2 ORDER BY b.start_at`, a, z);
    const affected = active.filter((bk) => {
      if (closed) return true;
      const sm = minutesTz(new Date(bk.start_at)), em = minutesTz(new Date(bk.end_at));
      return !ranges.some((x) => sm >= S.toMin(x.start) && em <= S.toMin(x.end));
    });
    return c.json({ item: parseOverride(item), affected }, 201);
  });

  r.delete('/overrides/:id', async (c) => {
    await run(c.env.DB, 'DELETE FROM schedule_override WHERE id = ?1', Number(c.req.param('id')) || 0);
    return c.json({ ok: true });
  });

  // ---------- Ajustes ----------
  r.get('/settings', async (c) => c.json(await getSettings(c.env.DB)));

  r.put('/settings', async (c) => {
    const db = c.env.DB;
    const b = await c.req.json().catch(() => ({}));
    const stmts = [];
    for (const key of Object.keys(DEFAULT_SETTINGS)){
      if (!(key in b)) continue;
      let value;
      if (key === 'agenda_open') value = !!b[key];
      else {
        value = Number(b[key]);
        if (!Number.isInteger(value) || value < 0 || value > 10000) throw new HttpError(400, `Valor inválido para ${key}.`);
      }
      stmts.push(db.prepare('INSERT INTO settings(key, value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)));
    }
    if (stmts.length) await db.batch(stmts);
    return c.json(await getSettings(db));
  });

  // ---------- Servicios ----------
  r.get('/services', async (c) => {
    const rows = await all(c.env.DB, 'SELECT * FROM service ORDER BY orden, id');
    return c.json({ items: rows.map((s) => bool(s, 'es_urgencia', 'activo')) });
  });

  function serviceFields(b, partial){
    const f = {};
    if (!partial || 'nombre' in b){
      f.nombre = cleanText(b.nombre, 80);
      if (!f.nombre) throw new HttpError(400, 'El servicio necesita un nombre.');
    }
    if ('descripcion' in b) f.descripcion = cleanText(b.descripcion, 200);
    if ('icono' in b) f.icono = cleanText(b.icono, 40);
    for (const k of ['duracion_min', 'buffer_min', 'orden']){
      if (!partial && k === 'duracion_min' && !(k in b)) throw new HttpError(400, 'Indica la duración.');
      if (k in b){
        const n = Number(b[k]);
        if (!Number.isInteger(n) || n < (k === 'duracion_min' ? 5 : 0) || n > 600) throw new HttpError(400, `Valor inválido: ${k}.`);
        f[k] = n;
      }
    }
    for (const k of ['es_urgencia', 'activo']) if (k in b) f[k] = b[k] ? 1 : 0;
    return f;
  }

  r.post('/services', async (c) => {
    const f = serviceFields(await c.req.json().catch(() => ({})), false);
    const keys = Object.keys(f);
    const item = await first(c.env.DB, `INSERT INTO service(${keys.join(',')}) VALUES (${keys.map((_, i) => '?' + (i + 1)).join(',')}) RETURNING *`, ...keys.map((k) => f[k]));
    return c.json({ item: bool(item, 'es_urgencia', 'activo') }, 201);
  });

  r.patch('/services/:id', async (c) => {
    const f = serviceFields(await c.req.json().catch(() => ({})), true);
    const keys = Object.keys(f);
    if (!keys.length) throw new HttpError(400, 'Nada que actualizar.');
    const item = await first(c.env.DB, `UPDATE service SET ${keys.map((k, i) => `${k} = ?${i + 2}`).join(', ')} WHERE id = ?1 RETURNING *`,
      Number(c.req.param('id')) || 0, ...keys.map((k) => f[k]));
    if (!item) throw new HttpError(404, 'Servicio no encontrado.');
    return c.json({ item: bool(item, 'es_urgencia', 'activo') });
  });

  // ---------- Tutores y mascotas ----------
  r.get('/tutores', async (c) => {
    const db = c.env.DB;
    const q = String(c.req.query('q') || '').trim();
    if (q.length < 2) return c.json({ items: [] });
    const rutQ = Rut.validate(q) ? Rut.normalize(q) : null;
    const digits = Rut.clean(q);
    const rutPrefix = /^\d{3,}/.test(digits) ? `${digits}%` : null;
    const like = `%${q}%`;
    const tutors = await all(db,
      `SELECT t.id, t.rut, t.nombre, t.email, t.telefono, t.strikes, t.blocked FROM tutor t
       WHERE t.anonymized = 0 AND (
         t.rut = ?1 OR t.nombre LIKE ?2 OR t.rut LIKE ?3 OR t.email LIKE ?2
         OR EXISTS (SELECT 1 FROM mascota mm WHERE mm.tutor_id = t.id AND mm.nombre LIKE ?2))
       ORDER BY t.nombre LIMIT 30`, rutQ, like, rutPrefix);
    const ids = tutors.map((t) => t.id);
    const pets = ids.length ? await all(db, `SELECT id, tutor_id, nombre, especie FROM mascota WHERE activo = 1 AND tutor_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ...ids) : [];
    return c.json({ items: tutors.map((t) => ({ ...bool(t, 'blocked'), mascotas: pets.filter((p) => p.tutor_id === t.id).map(({ id, nombre, especie }) => ({ id, nombre, especie })) })) });
  });

  async function tutorFull(db, id){
    const tutor = await first(db, 'SELECT * FROM tutor WHERE id = ?1', id);
    if (!tutor) throw new HttpError(404, 'Tutor no encontrado.');
    const [mascotas, visitas] = await Promise.all([
      all(db, 'SELECT * FROM mascota WHERE tutor_id = ?1 ORDER BY created_at, id', id),
      all(db, `SELECT v.id, v.booking_id, v.mascota_id, v.fecha, v.servicio, v.estado, v.peso_kg, v.observaciones
               FROM visita v JOIN mascota m ON m.id = v.mascota_id WHERE m.tutor_id = ?1 ORDER BY v.fecha DESC`, id),
    ]);
    return {
      tutor: bool(tutor, 'blocked', 'anonymized'),
      mascotas: mascotas.map((m) => ({ ...bool(m, 'activo'), visitas: visitas.filter((v) => v.mascota_id === m.id) })),
    };
  }

  r.get('/tutores/:id', async (c) => c.json(await tutorFull(c.env.DB, Number(c.req.param('id')) || 0)));

  r.patch('/tutores/:id', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const f = {};
    if ('nombre' in b) f.nombre = cleanText(b.nombre, 80);
    if ('email' in b){
      if (!isEmail(b.email)) throw new HttpError(400, 'Correo inválido.');
      f.email = String(b.email).trim().toLowerCase();
    }
    if ('telefono' in b) f.telefono = cleanText(b.telefono, 30);
    if ('blocked' in b) f.blocked = b.blocked ? 1 : 0;
    if ('strikes' in b) f.strikes = Math.max(0, Number(b.strikes) || 0);
    const keys = Object.keys(f).filter((k) => f[k] !== null || k === 'telefono');
    if (!keys.length) throw new HttpError(400, 'Nada que actualizar.');
    const res = await run(c.env.DB, `UPDATE tutor SET ${keys.map((k, i) => `${k} = ?${i + 2}`).join(', ')} WHERE id = ?1`, Number(c.req.param('id')) || 0, ...keys.map((k) => f[k]));
    if (!res.meta.changes) throw new HttpError(404, 'Tutor no encontrado.');
    return c.json({ ok: true });
  });

  // Derecho de acceso / portabilidad
  r.get('/tutores/:id/export', async (c) => {
    const db = c.env.DB, id = Number(c.req.param('id')) || 0;
    const data = await tutorFull(db, id);
    const reservas = await all(db,
      `SELECT b.id, b.start_at, b.end_at, b.status, b.motivo, s.nombre AS servicio, b.created_at
       FROM booking b JOIN service s ON s.id = b.service_id WHERE b.tutor_id = ?1 ORDER BY b.start_at`, id);
    c.header('Content-Disposition', `attachment; filename="tutor-${id}.json"`);
    return c.json({ exportado: nowIso(), responsable: preset.negocio.razon_social, ...data, reservas });
  });

  r.post('/tutores/:id/anonymize', async (c) => {
    await B.anonymizeTutor(c.env.DB, Number(c.req.param('id')) || 0);
    return c.json({ ok: true });
  });

  r.delete('/tutores/:id', async (c) => {
    await run(c.env.DB, 'DELETE FROM tutor WHERE id = ?1', Number(c.req.param('id')) || 0);
    return c.json({ ok: true });
  });

  r.patch('/mascotas/:id', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const f = {};
    if ('nombre' in b){
      f.nombre = cleanText(b.nombre, 40);
      if (!f.nombre) throw new HttpError(400, 'Nombre inválido.');
    }
    if ('especie' in b){
      if (!preset.especies.some((e) => e.id === b.especie)) throw new HttpError(400, 'Especie inválida.');
      f.especie = b.especie;
    }
    for (const k of ['raza', 'sexo', 'edad_aprox']) if (k in b) f[k] = cleanText(b[k], 40);
    if ('notas' in b) f.notas = cleanText(b.notas, 1000);
    if ('activo' in b) f.activo = b.activo ? 1 : 0;
    const keys = Object.keys(f);
    if (!keys.length) throw new HttpError(400, 'Nada que actualizar.');
    await run(c.env.DB, `UPDATE mascota SET ${keys.map((k, i) => `${k} = ?${i + 2}`).join(', ')} WHERE id = ?1`, Number(c.req.param('id')) || 0, ...keys.map((k) => f[k]));
    return c.json({ ok: true });
  });

  r.patch('/visitas/:id', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    await run(c.env.DB, 'UPDATE visita SET peso_kg = ?2, observaciones = ?3, updated_at = ?4 WHERE id = ?1',
      Number(c.req.param('id')) || 0, pesoOf(b.peso_kg), cleanText(b.observaciones, 2000), nowIso());
    return c.json({ ok: true });
  });

  // Exportar visitas a CSV (Excel en español usa ';')
  r.get('/visitas.csv', async (c) => {
    const today = S.dateStr(new Date());
    const from = String(c.req.query('from') || S.addDays(today, -30));
    const to = String(c.req.query('to') || today);
    if (!S.isValidDateStr(from) || !S.isValidDateStr(to)) throw new HttpError(400, 'Fechas inválidas.');
    const [a, b] = dayBounds(from, to);
    const rows = await all(c.env.DB,
      `SELECT v.fecha, m.nombre AS mascota, m.especie, t.nombre AS tutor, t.rut, t.telefono, v.servicio, v.estado, v.peso_kg, v.observaciones
       FROM visita v JOIN mascota m ON m.id = v.mascota_id JOIN tutor t ON t.id = m.tutor_id
       WHERE v.fecha >= ?1 AND v.fecha < ?2 ORDER BY v.fecha`, a, b);
    const horaFmt = new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
    const header = ['fecha', 'hora', 'mascota', 'especie', 'tutor', 'rut', 'telefono', 'servicio', 'estado', 'peso_kg', 'observaciones'];
    const lines = rows.map((x) => {
      const d = new Date(x.fecha);
      const row = { ...x, fecha: dateStrTz(d), hora: horaFmt.format(d) };
      return header.map((h) => csvCell(row[h])).join(';');
    });
    const csv = '﻿' + [header.join(';'), ...lines].join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="visitas_${from}_${to}.csv"` } });
  });

  return r;
}

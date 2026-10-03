const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const Rut = require('../../public/js/rut.js');
const S = require('../lib/slots');
const B = require('../lib/bookings');
const mailer = require('../lib/mailer');
const auth = require('../middleware/adminAuth');
const { HttpError, ah, cleanText, isEmail } = require('../lib/util');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validRanges(ranges) {
  if (!Array.isArray(ranges)) return null;
  const out = [];
  for (const r of ranges) {
    if (!r || !TIME_RE.test(r.start) || !TIME_RE.test(r.end) || S.toMin(r.end) <= S.toMin(r.start)) return null;
    out.push({ start: r.start, end: r.end });
  }
  return out.sort((a, b) => S.toMin(a.start) - S.toMin(b.start));
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

module.exports = function adminRoutes(preset) {
  const r = express.Router();

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Demasiados intentos. Espera 15 minutos.' } });

  r.post('/login', loginLimiter, (req, res) => {
    const { email, password } = req.body || {};
    if (!auth.checkCredentials(email, password)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    auth.startSession(res);
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => {
    auth.endSession(res);
    res.json({ ok: true });
  });

  r.get('/session', (req, res) => res.json({ admin: auth.isAdmin(req), negocio: preset.negocio }));

  r.use(auth.requireAdmin);

  // ---------- Agenda ----------
  r.get('/bookings', ah(async (req, res) => {
    const from = String(req.query.from || S.dateStr(new Date()));
    const to = String(req.query.to || from);
    if (!S.isValidDateStr(from) || !S.isValidDateStr(to)) throw new HttpError(400, 'Fechas inválidas.');
    const { rows } = await db.query(
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
       WHERE b.start_at >= $1::date AND b.start_at < ($2::date + 1) AND b.status <> 'expired'
       ORDER BY b.start_at`,
      [from, to]
    );
    res.json({ from, to, bookings: rows });
  }));

  r.patch('/bookings/:id', ah(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const status = String((req.body && req.body.status) || '');
    if (!['confirmed', 'cancelled', 'no_show', 'done'].includes(status)) throw new HttpError(400, 'Estado inválido.');
    const settings = await db.getSettings();
    const pesoRaw = req.body.peso_kg;
    const peso = pesoRaw === '' || pesoRaw == null ? null : Number(String(pesoRaw).replace(',', '.'));
    if (peso != null && (!Number.isFinite(peso) || peso < 0 || peso > 9999)) throw new HttpError(400, 'Peso inválido.');
    const observaciones = cleanText(req.body.observaciones, 2000);

    const prev = await db.tx(async (c) => {
      const bk = (await c.query('SELECT id, status, tutor_id FROM booking WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!bk) throw new HttpError(404, 'Reserva no encontrada.');
      if (status === 'cancelled') {
        await B.cancelBooking(c, id);
        return bk;
      }
      try {
        await c.query('UPDATE booking SET status = $2, hold_expires_at = NULL WHERE id = $1', [id, status]);
      } catch (err) {
        if (err.code === '23P01') throw new HttpError(409, 'Esa hora choca con otra reserva activa.');
        throw err;
      }
      await B.syncVisita(c, id, status, { peso_kg: peso, observaciones });
      if (status === 'no_show' && bk.status !== 'no_show') {
        await c.query('UPDATE tutor SET strikes = strikes + 1, blocked = blocked OR (strikes + 1 >= $2) WHERE id = $1', [bk.tutor_id, Number(settings.strikes_to_block)]);
      }
      return bk;
    });
    if (status === 'cancelled' && ['pending', 'confirmed'].includes(prev.status) && req.body.notify !== false) {
      mailer.sendCancellation(preset.negocio, await B.bookingDetails(id));
    }
    res.json({ ok: true });
  }));

  // ---------- Horario por defecto ----------
  r.get('/schedule', ah(async (req, res) => {
    const { rows } = await db.query(
      `SELECT weekday, to_char(start_time,'HH24:MI') AS "start", to_char(end_time,'HH24:MI') AS "end"
       FROM weekly_schedule ORDER BY weekday, start_time`
    );
    res.json({ items: rows });
  }));

  r.put('/schedule', ah(async (req, res) => {
    const items = (req.body && req.body.items) || [];
    if (!Array.isArray(items)) throw new HttpError(400, 'Formato inválido.');
    for (const it of items) {
      const wd = Number(it.weekday);
      if (!Number.isInteger(wd) || wd < 0 || wd > 6) throw new HttpError(400, 'Día inválido.');
      if (!validRanges([{ start: it.start, end: it.end }])) throw new HttpError(400, `Rango inválido: ${it.start}–${it.end}`);
    }
    await db.tx(async (c) => {
      await c.query('DELETE FROM weekly_schedule');
      for (const it of items) {
        await c.query('INSERT INTO weekly_schedule(weekday, start_time, end_time) VALUES ($1,$2,$3)', [Number(it.weekday), it.start, it.end]);
      }
    });
    res.json({ ok: true });
  }));

  // ---------- Días especiales ----------
  r.get('/overrides', ah(async (req, res) => {
    const { rows } = await db.query(
      'SELECT id, date_from, date_to, closed, ranges, nota FROM schedule_override WHERE date_to >= CURRENT_DATE ORDER BY date_from, id'
    );
    res.json({ items: rows });
  }));

  r.post('/overrides', ah(async (req, res) => {
    const b = req.body || {};
    const from = String(b.date_from || '');
    const to = String(b.date_to || from);
    if (!S.isValidDateStr(from) || !S.isValidDateStr(to) || to < from) throw new HttpError(400, 'Fechas inválidas.');
    const closed = !!b.closed;
    const ranges = closed ? [] : validRanges(b.ranges);
    if (!closed && (!ranges || !ranges.length)) throw new HttpError(400, 'Agrega al menos un rango de horas válido.');
    const { rows } = await db.query(
      'INSERT INTO schedule_override(date_from, date_to, closed, ranges, nota) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [from, to, closed, JSON.stringify(ranges), cleanText(b.nota, 200)]
    );

    // Horas activas que quedan fuera del nuevo horario (para avisar al dueño)
    const { rows: active } = await db.query(
      `SELECT b.id, b.start_at, b.end_at, m.nombre AS mascota, t.nombre AS tutor
       FROM booking b JOIN mascota m ON m.id = b.mascota_id JOIN tutor t ON t.id = b.tutor_id
       WHERE b.status IN ('pending','confirmed') AND b.start_at >= $1::date AND b.start_at < ($2::date + 1)
       ORDER BY b.start_at`,
      [from, to]
    );
    const affected = active.filter((bk) => {
      if (closed) return true;
      const s = new Date(bk.start_at);
      const e = new Date(bk.end_at);
      const sm = s.getHours() * 60 + s.getMinutes();
      const em = e.getHours() * 60 + e.getMinutes();
      return !ranges.some((x) => sm >= S.toMin(x.start) && em <= S.toMin(x.end));
    });
    res.status(201).json({ item: rows[0], affected });
  }));

  r.delete('/overrides/:id', ah(async (req, res) => {
    await db.query('DELETE FROM schedule_override WHERE id = $1', [Number(req.params.id) || 0]);
    res.json({ ok: true });
  }));

  // ---------- Ajustes ----------
  r.get('/settings', ah(async (req, res) => res.json(await db.getSettings())));

  r.put('/settings', ah(async (req, res) => {
    const b = req.body || {};
    const updates = [];
    for (const key of Object.keys(db.DEFAULT_SETTINGS)) {
      if (!(key in b)) continue;
      if (key === 'agenda_open') {
        updates.push([key, !!b[key]]);
      } else {
        const n = Number(b[key]);
        if (!Number.isInteger(n) || n < 0 || n > 10000) throw new HttpError(400, `Valor inválido para ${key}.`);
        updates.push([key, n]);
      }
    }
    for (const [key, value] of updates) {
      await db.query('INSERT INTO settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
    }
    res.json(await db.getSettings());
  }));

  // ---------- Servicios ----------
  r.get('/services', ah(async (req, res) => {
    const { rows } = await db.query('SELECT * FROM service ORDER BY orden, id');
    res.json({ items: rows });
  }));

  function serviceFields(b, partial) {
    const f = {};
    if (!partial || 'nombre' in b) {
      f.nombre = cleanText(b.nombre, 80);
      if (!f.nombre) throw new HttpError(400, 'El servicio necesita un nombre.');
    }
    if ('descripcion' in b) f.descripcion = cleanText(b.descripcion, 200);
    if ('icono' in b) f.icono = cleanText(b.icono, 40);
    for (const k of ['duracion_min', 'buffer_min', 'orden']) {
      if (!partial && k === 'duracion_min' && !(k in b)) throw new HttpError(400, 'Indica la duración.');
      if (k in b) {
        const n = Number(b[k]);
        if (!Number.isInteger(n) || n < (k === 'duracion_min' ? 5 : 0) || n > 600) throw new HttpError(400, `Valor inválido: ${k}.`);
        f[k] = n;
      }
    }
    for (const k of ['es_urgencia', 'activo']) if (k in b) f[k] = !!b[k];
    return f;
  }

  r.post('/services', ah(async (req, res) => {
    const f = serviceFields(req.body || {}, false);
    const keys = Object.keys(f);
    const { rows } = await db.query(
      `INSERT INTO service(${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
      keys.map((k) => f[k])
    );
    res.status(201).json({ item: rows[0] });
  }));

  r.patch('/services/:id', ah(async (req, res) => {
    const f = serviceFields(req.body || {}, true);
    const keys = Object.keys(f);
    if (!keys.length) throw new HttpError(400, 'Nada que actualizar.');
    const { rows } = await db.query(
      `UPDATE service SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [Number(req.params.id) || 0, ...keys.map((k) => f[k])]
    );
    if (!rows[0]) throw new HttpError(404, 'Servicio no encontrado.');
    res.json({ item: rows[0] });
  }));

  // ---------- Tutores y mascotas ----------
  r.get('/tutores', ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ items: [] });
    const rutQ = Rut.validate(q) ? Rut.normalize(q) : null;
    const digits = Rut.clean(q);
    const rutPrefix = /^\d{3,}/.test(digits) ? `${digits}%` : null;
    const { rows } = await db.query(
      `SELECT t.id, t.rut, t.nombre, t.email, t.telefono, t.strikes, t.blocked,
         COALESCE(json_agg(json_build_object('id', m.id, 'nombre', m.nombre, 'especie', m.especie) ORDER BY m.id)
           FILTER (WHERE m.id IS NOT NULL), '[]') AS mascotas
       FROM tutor t LEFT JOIN mascota m ON m.tutor_id = t.id AND m.activo
       WHERE NOT t.anonymized AND (
         t.rut = $1 OR t.nombre ILIKE $2 OR t.rut LIKE $3 OR t.email ILIKE $2
         OR EXISTS (SELECT 1 FROM mascota mm WHERE mm.tutor_id = t.id AND mm.nombre ILIKE $2)
       )
       GROUP BY t.id ORDER BY t.nombre LIMIT 30`,
      [rutQ, `%${q}%`, rutPrefix]
    );
    res.json({ items: rows });
  }));

  async function tutorFull(id) {
    const { rows: t } = await db.query('SELECT * FROM tutor WHERE id = $1', [id]);
    if (!t[0]) throw new HttpError(404, 'Tutor no encontrado.');
    const { rows: mascotas } = await db.query(
      `SELECT m.*,
         COALESCE(json_agg(json_build_object('id', v.id, 'booking_id', v.booking_id, 'fecha', v.fecha, 'servicio', v.servicio,
           'estado', v.estado, 'peso_kg', v.peso_kg, 'observaciones', v.observaciones) ORDER BY v.fecha DESC)
           FILTER (WHERE v.id IS NOT NULL), '[]') AS visitas
       FROM mascota m LEFT JOIN visita v ON v.mascota_id = m.id
       WHERE m.tutor_id = $1 GROUP BY m.id ORDER BY m.created_at, m.id`,
      [id]
    );
    return { tutor: t[0], mascotas };
  }

  r.get('/tutores/:id', ah(async (req, res) => res.json(await tutorFull(Number(req.params.id) || 0))));

  r.patch('/tutores/:id', ah(async (req, res) => {
    const b = req.body || {};
    const f = {};
    if ('nombre' in b) f.nombre = cleanText(b.nombre, 80);
    if ('email' in b) {
      if (!isEmail(b.email)) throw new HttpError(400, 'Correo inválido.');
      f.email = String(b.email).trim().toLowerCase();
    }
    if ('telefono' in b) f.telefono = cleanText(b.telefono, 30);
    if ('blocked' in b) f.blocked = !!b.blocked;
    if ('strikes' in b) f.strikes = Math.max(0, Number(b.strikes) || 0);
    const keys = Object.keys(f).filter((k) => f[k] !== null || k === 'telefono');
    if (!keys.length) throw new HttpError(400, 'Nada que actualizar.');
    const { rowCount } = await db.query(
      `UPDATE tutor SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [Number(req.params.id) || 0, ...keys.map((k) => f[k])]
    );
    if (!rowCount) throw new HttpError(404, 'Tutor no encontrado.');
    res.json({ ok: true });
  }));

  // Derecho de acceso / portabilidad
  r.get('/tutores/:id/export', ah(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const data = await tutorFull(id);
    const { rows: reservas } = await db.query(
      `SELECT b.id, b.start_at, b.end_at, b.status, b.motivo, s.nombre AS servicio, b.created_at
       FROM booking b JOIN service s ON s.id = b.service_id WHERE b.tutor_id = $1 ORDER BY b.start_at`,
      [id]
    );
    res.setHeader('Content-Disposition', `attachment; filename="tutor-${id}.json"`);
    res.json({ exportado: new Date().toISOString(), responsable: preset.negocio.razon_social, ...data, reservas });
  }));

  r.post('/tutores/:id/anonymize', ah(async (req, res) => {
    await db.tx((c) => B.anonymizeTutor(c, Number(req.params.id) || 0));
    res.json({ ok: true });
  }));

  r.delete('/tutores/:id', ah(async (req, res) => {
    await db.query('DELETE FROM tutor WHERE id = $1', [Number(req.params.id) || 0]);
    res.json({ ok: true });
  }));

  r.patch('/mascotas/:id', ah(async (req, res) => {
    const b = req.body || {};
    const f = {};
    if ('nombre' in b) {
      f.nombre = cleanText(b.nombre, 40);
      if (!f.nombre) throw new HttpError(400, 'Nombre inválido.');
    }
    if ('especie' in b) {
      if (!preset.especies.some((e) => e.id === b.especie)) throw new HttpError(400, 'Especie inválida.');
      f.especie = b.especie;
    }
    for (const k of ['raza', 'sexo', 'edad_aprox']) if (k in b) f[k] = cleanText(b[k], 40);
    if ('notas' in b) f.notas = cleanText(b.notas, 1000);
    if ('activo' in b) f.activo = !!b.activo;
    const keys = Object.keys(f);
    if (!keys.length) throw new HttpError(400, 'Nada que actualizar.');
    await db.query(`UPDATE mascota SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [Number(req.params.id) || 0, ...keys.map((k) => f[k])]);
    res.json({ ok: true });
  }));

  r.patch('/visitas/:id', ah(async (req, res) => {
    const b = req.body || {};
    const peso = b.peso_kg === '' || b.peso_kg == null ? null : Number(String(b.peso_kg).replace(',', '.'));
    if (peso != null && (!Number.isFinite(peso) || peso < 0 || peso > 9999)) throw new HttpError(400, 'Peso inválido.');
    await db.query('UPDATE visita SET peso_kg = $2, observaciones = $3, updated_at = now() WHERE id = $1', [
      Number(req.params.id) || 0,
      peso,
      cleanText(b.observaciones, 2000),
    ]);
    res.json({ ok: true });
  }));

  // Exportar visitas a CSV (Excel en español usa ';')
  r.get('/visitas.csv', ah(async (req, res) => {
    const from = String(req.query.from || S.addDays(S.dateStr(new Date()), -30));
    const to = String(req.query.to || S.dateStr(new Date()));
    if (!S.isValidDateStr(from) || !S.isValidDateStr(to)) throw new HttpError(400, 'Fechas inválidas.');
    const { rows } = await db.query(
      `SELECT to_char(v.fecha, 'YYYY-MM-DD') AS fecha, to_char(v.fecha, 'HH24:MI') AS hora,
              m.nombre AS mascota, m.especie, t.nombre AS tutor, t.rut, t.telefono,
              v.servicio, v.estado, v.peso_kg, v.observaciones
       FROM visita v JOIN mascota m ON m.id = v.mascota_id JOIN tutor t ON t.id = m.tutor_id
       WHERE v.fecha >= $1::date AND v.fecha < ($2::date + 1)
       ORDER BY v.fecha`,
      [from, to]
    );
    const header = ['fecha', 'hora', 'mascota', 'especie', 'tutor', 'rut', 'telefono', 'servicio', 'estado', 'peso_kg', 'observaciones'];
    const csv = '﻿' + [header.join(';'), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(';'))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="visitas_${from}_${to}.csv"`);
    res.send(csv);
  }));

  return r;
};

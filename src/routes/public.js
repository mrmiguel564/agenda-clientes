import { Hono } from 'hono';
import Rut from '../../public/js/rut.js';
import * as S from '../lib/slots.js';
import * as mailer from '../lib/mailer.js';
import * as otp from '../lib/otp.js';
import * as B from '../lib/bookings.js';
import { all, first, run, nowIso, getSettings, getScheduleData, dayBounds, hit } from '../db.js';
import { ensureDevice, linkDevice } from '../lib/auth.js';
import { HttpError, maskName, maskEmail, isEmail, cleanText, randomToken, fechaLarga, hora } from '../lib/util.js';

const HOUR = 3600;
const otpEnabled = (env) => String(env.OTP_ENABLED || 'false') === 'true';
const ipOf = (c) => c.req.header('cf-connecting-ip') || 'local';
const originOf = (c) => new URL(c.req.url).origin;

async function limit(c, name, max){
  if (!(await hit(c.env.DB, `${name}:${ipOf(c)}`, max, HOUR))) throw new HttpError(429, 'Demasiados intentos. Espera un momento e intenta de nuevo.');
}

export default function publicRoutes(preset){
  const r = new Hono();
  const especies = preset.especies.map((e) => e.id);

  async function getService(db, id){
    const s = await first(db, 'SELECT * FROM service WHERE id = ?1 AND activo = 1', Number(id) || 0);
    if (!s) throw new HttpError(400, 'Servicio no disponible.');
    return s;
  }

  // Configuración pública de la landing
  r.get('/config', async (c) => {
    const db = c.env.DB;
    const today = S.dateStr(new Date());
    const [settings, services, data] = await Promise.all([
      getSettings(db),
      all(db, 'SELECT id, nombre, descripcion, icono, duracion_min, es_urgencia FROM service WHERE activo = 1 ORDER BY orden, id'),
      getScheduleData(db, today, today),
    ]);
    const hoy = S.rangesForDate(today, data.weekly, data.overrides);
    return c.json({
      vertical: preset.id,
      negocio: preset.negocio,
      hero: preset.hero,
      especies: preset.especies,
      modales: preset.modales,
      pasos: preset.pasos,
      faq: preset.faq,
      services: services.map((s) => ({ ...s, es_urgencia: !!s.es_urgencia })),
      weekly: data.weekly,
      hoy: { closed: hoy.closed, ranges: hoy.ranges.map((x) => ({ start: S.minToTime(x.start), end: S.minToTime(x.end) })), nota: hoy.nota },
      agenda_open: !!settings.agenda_open,
      otp_enabled: otpEnabled(c.env),
    });
  });

  // Días con cupo para un servicio
  r.get('/availability/days', async (c) => {
    const db = c.env.DB;
    const service = await getService(db, c.req.query('service_id'));
    const settings = await getSettings(db);
    const now = new Date();
    const today = S.dateStr(now);
    const last = S.addDays(today, Number(settings.max_days_ahead));
    const data = await getScheduleData(db, today, last);
    const days = [];
    for (let d = today; d <= last; d = S.addDays(d, 1)){
      const n = S.getSlots({ date: d, service, ...data, settings, now }).length;
      if (n) days.push({ date: d, count: n });
    }
    return c.json({ agenda_open: !!settings.agenda_open, days });
  });

  // Horas libres de un día
  r.get('/availability', async (c) => {
    const db = c.env.DB;
    const date = String(c.req.query('date') || '');
    if (!S.isValidDateStr(date)) throw new HttpError(400, 'Fecha inválida.');
    const service = await getService(db, c.req.query('service_id'));
    const [settings, data] = await Promise.all([getSettings(db), getScheduleData(db, date, date)]);
    return c.json({ date, slots: S.getSlots({ date, service, ...data, settings, now: new Date() }) });
  });

  // RUT -> mascotas (modo híbrido: completo en dispositivo conocido, enmascarado en uno nuevo)
  r.post('/tutor/lookup', async (c) => {
    await limit(c, 'lookup', Number(c.env.RATE_LIMIT_LOOKUP || 20));
    const { rut } = await c.req.json().catch(() => ({}));
    if (!Rut.validate(rut)) throw new HttpError(400, 'RUT inválido.');
    const db = c.env.DB;
    const t = await first(db, 'SELECT id, nombre, email, telefono, blocked FROM tutor WHERE rut = ?1 AND anonymized = 0', Rut.normalize(rut));
    if (!t) return c.json({ exists: false });
    const dev = c.get('device');
    const known = !!(dev && dev.tutor_id === t.id);
    const pets = await all(db, 'SELECT id, nombre, especie FROM mascota WHERE tutor_id = ?1 AND activo = 1 ORDER BY created_at, id', t.id);
    return c.json({
      exists: true,
      known,
      blocked: !!t.blocked,
      tutor: known ? { nombre: t.nombre, email: t.email, telefono: t.telefono } : { email_masked: maskEmail(t.email) },
      mascotas: pets.map((p) => ({ id: p.id, especie: p.especie, nombre: known ? p.nombre : maskName(p.nombre) })),
    });
  });

  // Crear reserva
  r.post('/bookings', async (c) => {
    await limit(c, 'booking', Number(c.env.RATE_LIMIT_BOOKING || 20));
    const db = c.env.DB;
    const b = await c.req.json().catch(() => ({}));
    // Honeypot y tiempo mínimo de llenado (anti-bots)
    if (b.website || (b.elapsed_ms != null && Number(b.elapsed_ms) < 3000)) throw new HttpError(400, 'No pudimos procesar la reserva. Intenta nuevamente.');
    if (!Rut.validate(b.rut)) throw new HttpError(400, 'RUT inválido.');
    if (!b.consent) throw new HttpError(400, 'Debes aceptar la política de privacidad.');
    const rut = Rut.normalize(b.rut);
    const service = await getService(db, b.service_id);
    const start = new Date(b.start);
    if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Hora inválida.');
    const settings = await getSettings(db);
    const date = S.dateStr(start);
    const now = nowIso();

    // 1. La hora debe seguir disponible según el horario vigente
    const data = await getScheduleData(db, date, date);
    const slots = S.getSlots({ date, service, ...data, settings, now: new Date() });
    if (!slots.some((s) => s.start === start.toISOString())) throw new HttpError(409, 'Esa hora ya no está disponible. Elige otra.');

    const device = await ensureDevice(c);

    // 2. Tutor
    let tutor = await first(db, 'SELECT * FROM tutor WHERE rut = ?1', rut);
    let isNewTutor = false;
    const known = !!tutor && device.tutor_id === tutor.id;
    const email = isEmail(b.email) ? String(b.email).trim().toLowerCase() : null;
    const nombre = cleanText(b.nombre, 80);
    const telefono = cleanText(b.telefono, 30);
    if (!tutor){
      if (!nombre) throw new HttpError(400, 'Ingresa tu nombre.');
      if (!email) throw new HttpError(400, 'Ingresa un correo válido.');
      tutor = await first(db,
        `INSERT INTO tutor(rut, nombre, email, telefono, consent_at, created_at, last_seen) VALUES (?1,?2,?3,?4,?5,?5,?5)
         ON CONFLICT(rut) DO NOTHING RETURNING *`, rut, nombre, email, telefono, now);
      if (!tutor) throw new HttpError(409, 'Intenta nuevamente.');
      isNewTutor = true;
    } else {
      if (tutor.blocked) throw new HttpError(403, 'Este RUT no puede agendar en línea. Contáctanos por teléfono o WhatsApp.');
      // Anti-suplantación: los datos de contacto solo se cambian desde un dispositivo conocido
      tutor = await first(db,
        `UPDATE tutor SET last_seen = ?6, consent_at = COALESCE(consent_at, ?6),
           nombre = CASE WHEN ?2 THEN COALESCE(?3, nombre) ELSE nombre END,
           email = CASE WHEN ?2 THEN COALESCE(?4, email) ELSE email END,
           telefono = CASE WHEN ?2 THEN COALESCE(?5, telefono) ELSE telefono END
         WHERE id = ?1 RETURNING *`, tutor.id, known ? 1 : 0, nombre, email, telefono, now);
    }

    // 3. Mascota: existente (verificando que sea del tutor) o nueva
    let mascota;
    let newPet = false;
    if (b.mascota_id){
      mascota = await first(db, 'SELECT id, nombre, especie FROM mascota WHERE id = ?1 AND tutor_id = ?2 AND activo = 1', Number(b.mascota_id) || 0, tutor.id);
      if (!mascota) throw new HttpError(400, 'Mascota no encontrada. Elige otra o registra una nueva.');
    } else {
      const m = b.mascota || {};
      const mNombre = cleanText(m.nombre, 40);
      if (!mNombre) throw new HttpError(400, 'Ingresa el nombre de tu mascota.');
      if (!especies.includes(m.especie)) throw new HttpError(400, 'Elige la especie de tu mascota.');
      mascota = await first(db,
        'INSERT INTO mascota(tutor_id, nombre, especie, raza, edad_aprox, created_at) VALUES (?1,?2,?3,?4,?5,?6) RETURNING id, nombre, especie',
        tutor.id, mNombre, m.especie, cleanText(m.raza, 40), cleanText(m.edad_aprox, 20), now);
      newPet = true;
    }

    // 4. Límites
    const [dayStart, dayEnd] = dayBounds(date);
    const lim = await first(db,
      `SELECT
         sum(CASE WHEN tutor_id = ?1 AND start_at > ?4 THEN 1 ELSE 0 END) AS fut_tutor,
         sum(CASE WHEN tutor_id = ?1 AND start_at >= ?2 AND start_at < ?3 THEN 1 ELSE 0 END) AS day_tutor,
         sum(CASE WHEN device_id = ?5 AND start_at > ?4 THEN 1 ELSE 0 END) AS fut_device
       FROM booking WHERE status = 'confirmed' OR (status = 'pending' AND hold_expires_at > ?4)`,
      tutor.id, dayStart, dayEnd, now, device.id);
    if ((lim.fut_tutor || 0) >= Number(settings.max_future_per_rut)) throw new HttpError(429, `Ya tienes ${lim.fut_tutor} horas agendadas. Cancela alguna o contáctanos.`);
    if ((lim.day_tutor || 0) >= Number(settings.max_per_day_per_rut)) throw new HttpError(429, 'Alcanzaste el máximo de horas para ese día.');
    if ((lim.fut_device || 0) >= Number(settings.max_future_per_device)) throw new HttpError(429, 'Este dispositivo alcanzó el máximo de horas agendadas.');

    // 5. Reserva: el INSERT solo ocurre si la hora sigue libre (atómico en SQLite). La visita se crea en el mismo batch.
    const OTP = otpEnabled(c.env);
    const end = new Date(start.getTime() + service.duracion_min * 60000);
    const blockEnd = new Date(end.getTime() + service.buffer_min * 60000);
    const status = OTP ? 'pending' : 'confirmed';
    const holdExpires = OTP ? new Date(Date.now() + otp.OTP_TTL_MIN * 60000).toISOString() : null;
    const token = randomToken();
    const insert = db.prepare(
      `INSERT INTO booking(tutor_id, mascota_id, service_id, start_at, end_at, block_end_at, status, motivo, device_id, ip, hold_expires_at, cancel_token, created_at)
       SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13
       WHERE NOT ${B.overlapSql(14, 13, 6, 4)}`
    ).bind(tutor.id, mascota.id, service.id, start.toISOString(), end.toISOString(), blockEnd.toISOString(), status,
      cleanText(b.motivo, 200), device.id, ipOf(c), holdExpires, token, now, 0);
    const visita = db.prepare(
      `INSERT INTO visita(booking_id, mascota_id, fecha, servicio, estado, created_at, updated_at)
       SELECT b.id, b.mascota_id, b.start_at, s.nombre, 'agendada', ?2, ?2
       FROM booking b JOIN service s ON s.id = b.service_id WHERE b.cancel_token = ?1 AND b.status = 'confirmed'`
    ).bind(token, now);
    const [ins] = await db.batch([insert, visita]);
    if (!ins.meta.changes) throw new HttpError(409, 'Esa hora acaba de ser tomada. Elige otra.');
    const booking = await first(db, 'SELECT * FROM booking WHERE cancel_token = ?1', token);

    if (isNewTutor) await linkDevice(db, device.id, tutor.id);

    // El correo siempre va al email registrado del tutor (no al ingresado desde un dispositivo nuevo)
    let code = null;
    if (OTP){
      code = otp.generate();
      await run(db, 'INSERT INTO otp(booking_id, code_hash, expires_at) VALUES (?1,?2,?3)', booking.id, await otp.hash(booking.id, code, c.env.COOKIE_SECRET), holdExpires);
      c.executionCtx.waitUntil(mailer.sendOtp(c.env, preset.negocio, tutor.email, code));
    } else {
      const details = await B.bookingDetails(db, booking.id);
      c.executionCtx.waitUntil(mailer.sendConfirmation(c.env, originOf(c), preset.negocio, details));
    }

    const showFull = known || isNewTutor || newPet;
    return c.json({
      id: booking.id,
      status: booking.status,
      otp_required: !!code,
      resumen: {
        servicio: service.nombre,
        fecha: fechaLarga(booking.start_at),
        hora: hora(booking.start_at),
        mascota: showFull ? mascota.nombre : maskName(mascota.nombre),
        email_masked: maskEmail(tutor.email),
      },
    }, 201);
  });

  // Verificar código (solo si OTP_ENABLED=true)
  r.post('/bookings/:id/verify', async (c) => {
    if (!otpEnabled(c.env)) throw new HttpError(404, 'No disponible.');
    await limit(c, 'otp', 20);
    const dev = c.get('device');
    if (!dev) throw new HttpError(403, 'Abre el código en el mismo dispositivo donde agendaste.');
    const db = c.env.DB;
    const id = Number(c.req.param('id')) || 0;
    const { code } = await c.req.json().catch(() => ({}));
    const bk = await first(db,
      `SELECT b.id, b.status, b.device_id, b.tutor_id, b.hold_expires_at, o.code_hash, o.attempts
       FROM booking b JOIN otp o ON o.booking_id = b.id WHERE b.id = ?1`, id);
    if (!bk || bk.device_id !== dev.id) throw new HttpError(404, 'Reserva no encontrada.');
    if (bk.status !== 'pending') throw new HttpError(409, 'Esta reserva ya no está pendiente.');
    if (bk.hold_expires_at < nowIso()) throw new HttpError(410, 'El código venció. Vuelve a agendar.');
    if (bk.attempts >= otp.OTP_MAX_ATTEMPTS) throw new HttpError(429, 'Demasiados intentos. Vuelve a agendar.');
    if (!(await otp.check(id, String(code || ''), bk.code_hash, c.env.COOKIE_SECRET))){
      await run(db, 'UPDATE otp SET attempts = attempts + 1 WHERE booking_id = ?1', id);
      throw new HttpError(400, `Código incorrecto. Te quedan ${Math.max(otp.OTP_MAX_ATTEMPTS - bk.attempts - 1, 0)} intentos.`);
    }
    const res = await run(db, "UPDATE booking SET status = 'confirmed', hold_expires_at = NULL WHERE id = ?1 AND status = 'pending'", id);
    if (!res.meta.changes) throw new HttpError(409, 'Esta reserva ya no está pendiente.');
    await db.batch([db.prepare('DELETE FROM otp WHERE booking_id = ?1').bind(id), B.createVisitaStmt(db, id), db.prepare('UPDATE device SET tutor_id = ?2 WHERE id = ?1').bind(dev.id, bk.tutor_id)]);
    const details = await B.bookingDetails(db, id);
    c.executionCtx.waitUntil(mailer.sendConfirmation(c.env, originOf(c), preset.negocio, details));
    return c.json({ ok: true, status: 'confirmed' });
  });

  // "Mis horas": datos del tutor vinculado a este dispositivo
  r.get('/me', async (c) => {
    const dev = c.get('device');
    if (!dev || !dev.tutor_id) return c.json({ linked: false });
    const db = c.env.DB, tid = dev.tutor_id;
    const [t, proximas, mascotas, visitas] = await Promise.all([
      first(db, 'SELECT nombre FROM tutor WHERE id = ?1', tid),
      all(db,
        `SELECT b.id, b.start_at, b.status, s.nombre AS servicio, m.nombre AS mascota, m.especie
         FROM booking b JOIN service s ON s.id = b.service_id JOIN mascota m ON m.id = b.mascota_id
         WHERE b.tutor_id = ?1 AND b.status IN ('pending','confirmed') AND b.start_at > ?2 ORDER BY b.start_at`, tid, nowIso()),
      all(db, 'SELECT id, nombre, especie FROM mascota WHERE tutor_id = ?1 AND activo = 1 ORDER BY created_at, id', tid),
      all(db,
        `SELECT v.mascota_id, v.fecha, v.servicio, v.estado FROM visita v JOIN mascota m ON m.id = v.mascota_id
         WHERE m.tutor_id = ?1 ORDER BY v.fecha DESC`, tid),
    ]);
    if (!t) return c.json({ linked: false });
    return c.json({
      linked: true,
      tutor: { nombre: t.nombre },
      proximas: proximas.map((p) => ({ ...p, fecha: fechaLarga(p.start_at), hora: hora(p.start_at) })),
      mascotas: mascotas.map((m) => ({ ...m, visitas: visitas.filter((v) => v.mascota_id === m.id).map(({ fecha, servicio, estado }) => ({ fecha, servicio, estado })) })),
    });
  });

  r.post('/me/bookings/:id/cancel', async (c) => {
    const dev = c.get('device');
    if (!dev || !dev.tutor_id) throw new HttpError(403, 'No autorizado.');
    const db = c.env.DB, id = Number(c.req.param('id')) || 0;
    const bk = await first(db, 'SELECT id FROM booking WHERE id = ?1 AND tutor_id = ?2 AND start_at > ?3', id, dev.tutor_id, nowIso());
    if (!bk) throw new HttpError(404, 'Reserva no encontrada.');
    const ok = await B.cancelBooking(db, id);
    if (ok) c.executionCtx.waitUntil(B.bookingDetails(db, id).then((d) => mailer.sendCancellation(c.env, originOf(c), preset.negocio, d)));
    return c.json({ ok });
  });

  // Link del correo: ver/cancelar la hora. Abrirlo vincula este dispositivo al tutor (prueba de acceso al correo).
  async function byToken(db, token){
    const row = await first(db, 'SELECT id FROM booking WHERE cancel_token = ?1', String(token || ''));
    if (!row) throw new HttpError(404, 'No encontramos esta reserva.');
    return B.bookingDetails(db, row.id);
  }

  r.get('/r/:token', async (c) => {
    const db = c.env.DB;
    const d = await byToken(db, c.req.param('token'));
    const device = await ensureDevice(c);
    await linkDevice(db, device.id, d.tutor_id);
    const cancelable = ['pending', 'confirmed'].includes(d.status) && d.start_at > nowIso();
    return c.json({
      booking: { servicio: d.servicio, mascota: d.mascota, especie: d.especie, fecha: fechaLarga(d.start_at), hora: hora(d.start_at), status: d.status, cancelable },
      negocio: preset.negocio,
    });
  });

  r.post('/r/:token/cancel', async (c) => {
    const db = c.env.DB;
    const d = await byToken(db, c.req.param('token'));
    if (d.start_at <= nowIso()) throw new HttpError(409, 'Esta hora ya pasó.');
    const ok = await B.cancelBooking(db, d.id);
    if (ok) c.executionCtx.waitUntil(mailer.sendCancellation(c.env, originOf(c), preset.negocio, d));
    return c.json({ ok });
  });

  return r;
}

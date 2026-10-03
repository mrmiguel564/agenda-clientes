const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const Rut = require('../../public/js/rut.js');
const S = require('../lib/slots');
const mailer = require('../lib/mailer');
const otp = require('../lib/otp');
const B = require('../lib/bookings');
const { ensureDevice, linkDevice } = require('../middleware/device');
const { HttpError, ah, maskName, maskEmail, isEmail, cleanText, randomToken, fechaLarga, hora } = require('../lib/util');

const OTP_ENABLED = String(process.env.OTP_ENABLED || 'false') === 'true';
const HOUR = 60 * 60 * 1000;

const limiter = (limit, windowMs = HOUR) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera un momento e intenta de nuevo.' },
  });

module.exports = function publicRoutes(preset) {
  const r = express.Router();
  const lookupLimiter = limiter(Number(process.env.RATE_LIMIT_LOOKUP || 20));
  const bookingLimiter = limiter(Number(process.env.RATE_LIMIT_BOOKING || 20));
  const otpLimiter = limiter(20);
  const especies = preset.especies.map((e) => e.id);

  async function getService(id) {
    const { rows } = await db.query('SELECT * FROM service WHERE id = $1 AND activo', [Number(id) || 0]);
    if (!rows[0]) throw new HttpError(400, 'Servicio no disponible.');
    return rows[0];
  }

  // Configuración pública de la landing
  r.get('/config', ah(async (req, res) => {
    const settings = await db.getSettings();
    const today = S.dateStr(new Date());
    const [{ rows: services }, data] = await Promise.all([
      db.query('SELECT id, nombre, descripcion, icono, duracion_min, es_urgencia FROM service WHERE activo ORDER BY orden, id'),
      db.getScheduleData(today, today),
    ]);
    const hoy = S.rangesForDate(today, data.weekly, data.overrides);
    res.json({
      vertical: preset.id,
      negocio: preset.negocio,
      hero: preset.hero,
      especies: preset.especies,
      modales: preset.modales,
      pasos: preset.pasos,
      faq: preset.faq,
      services,
      weekly: data.weekly,
      hoy: { closed: hoy.closed, ranges: hoy.ranges.map((x) => ({ start: S.minToTime(x.start), end: S.minToTime(x.end) })), nota: hoy.nota },
      agenda_open: !!settings.agenda_open,
      otp_enabled: OTP_ENABLED,
    });
  }));

  // Días con cupo para un servicio
  r.get('/availability/days', ah(async (req, res) => {
    const service = await getService(req.query.service_id);
    const settings = await db.getSettings();
    const now = new Date();
    const today = S.dateStr(now);
    const last = S.addDays(today, Number(settings.max_days_ahead));
    const data = await db.getScheduleData(today, last);
    const days = [];
    for (let d = today; d <= last; d = S.addDays(d, 1)) {
      const n = S.getSlots({ date: d, service, ...data, settings, now }).length;
      if (n) days.push({ date: d, count: n });
    }
    res.json({ agenda_open: !!settings.agenda_open, days });
  }));

  // Horas libres de un día
  r.get('/availability', ah(async (req, res) => {
    const date = String(req.query.date || '');
    if (!S.isValidDateStr(date)) throw new HttpError(400, 'Fecha inválida.');
    const service = await getService(req.query.service_id);
    const settings = await db.getSettings();
    const data = await db.getScheduleData(date, date);
    res.json({ date, slots: S.getSlots({ date, service, ...data, settings, now: new Date() }) });
  }));

  // RUT -> mascotas (modo híbrido: completo en dispositivo conocido, enmascarado en uno nuevo)
  r.post('/tutor/lookup', lookupLimiter, ah(async (req, res) => {
    const rut = req.body && req.body.rut;
    if (!Rut.validate(rut)) throw new HttpError(400, 'RUT inválido.');
    const { rows } = await db.query('SELECT id, nombre, email, telefono, blocked FROM tutor WHERE rut = $1 AND NOT anonymized', [Rut.normalize(rut)]);
    const t = rows[0];
    if (!t) return res.json({ exists: false });
    const known = !!(req.device && req.device.tutor_id === t.id);
    const { rows: pets } = await db.query('SELECT id, nombre, especie FROM mascota WHERE tutor_id = $1 AND activo ORDER BY created_at, id', [t.id]);
    res.json({
      exists: true,
      known,
      blocked: t.blocked,
      tutor: known ? { nombre: t.nombre, email: t.email, telefono: t.telefono } : { email_masked: maskEmail(t.email) },
      mascotas: pets.map((p) => ({ id: p.id, especie: p.especie, nombre: known ? p.nombre : maskName(p.nombre) })),
    });
  }));

  // Crear reserva
  r.post('/bookings', bookingLimiter, ah(async (req, res) => {
    const b = req.body || {};
    // Honeypot y tiempo mínimo de llenado (anti-bots)
    if (b.website || (b.elapsed_ms != null && Number(b.elapsed_ms) < 3000)) {
      throw new HttpError(400, 'No pudimos procesar la reserva. Intenta nuevamente.');
    }
    if (!Rut.validate(b.rut)) throw new HttpError(400, 'RUT inválido.');
    if (!b.consent) throw new HttpError(400, 'Debes aceptar la política de privacidad.');
    const rut = Rut.normalize(b.rut);
    const service = await getService(b.service_id);
    const start = new Date(b.start);
    if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Hora inválida.');
    const settings = await db.getSettings();
    const date = S.dateStr(start);
    const device = await ensureDevice(req, res);

    const result = await db.tx(async (c) => {
      // 1. La hora debe seguir disponible según el horario vigente
      const data = await db.getScheduleData(date, date, c);
      const slots = S.getSlots({ date, service, ...data, settings, now: new Date() });
      if (!slots.some((s) => s.start === start.toISOString())) {
        throw new HttpError(409, 'Esa hora ya no está disponible. Elige otra.');
      }

      // 2. Tutor
      let tutor = (await c.query('SELECT * FROM tutor WHERE rut = $1 FOR UPDATE', [rut])).rows[0];
      let isNewTutor = false;
      const known = !!tutor && device.tutor_id === tutor.id;
      const email = isEmail(b.email) ? String(b.email).trim().toLowerCase() : null;
      const nombre = cleanText(b.nombre, 80);
      const telefono = cleanText(b.telefono, 30);
      if (!tutor) {
        if (!nombre) throw new HttpError(400, 'Ingresa tu nombre.');
        if (!email) throw new HttpError(400, 'Ingresa un correo válido.');
        try {
          tutor = (await c.query(
            'INSERT INTO tutor(rut, nombre, email, telefono, consent_at) VALUES ($1,$2,$3,$4, now()) RETURNING *',
            [rut, nombre, email, telefono]
          )).rows[0];
        } catch (err) {
          if (err.code === '23505') throw new HttpError(409, 'Intenta nuevamente.');
          throw err;
        }
        isNewTutor = true;
      } else {
        if (tutor.blocked) {
          throw new HttpError(403, 'Este RUT no puede agendar en línea. Contáctanos por teléfono o WhatsApp.');
        }
        // Anti-suplantación: los datos de contacto solo se cambian desde un dispositivo conocido
        tutor = (await c.query(
          `UPDATE tutor SET last_seen = now(), consent_at = COALESCE(consent_at, now()),
             nombre = CASE WHEN $2 THEN COALESCE($3, nombre) ELSE nombre END,
             email = CASE WHEN $2 THEN COALESCE($4, email) ELSE email END,
             telefono = CASE WHEN $2 THEN COALESCE($5, telefono) ELSE telefono END
           WHERE id = $1 RETURNING *`,
          [tutor.id, known, nombre, email, telefono]
        )).rows[0];
      }

      // 3. Mascota: existente (verificando que sea del tutor) o nueva
      let mascota;
      let newPet = false;
      if (b.mascota_id) {
        mascota = (await c.query('SELECT id, nombre, especie FROM mascota WHERE id = $1 AND tutor_id = $2 AND activo', [Number(b.mascota_id) || 0, tutor.id])).rows[0];
        if (!mascota) throw new HttpError(400, 'Mascota no encontrada. Elige otra o registra una nueva.');
      } else {
        const m = b.mascota || {};
        const mNombre = cleanText(m.nombre, 40);
        if (!mNombre) throw new HttpError(400, 'Ingresa el nombre de tu mascota.');
        if (!especies.includes(m.especie)) throw new HttpError(400, 'Elige la especie de tu mascota.');
        mascota = (await c.query(
          'INSERT INTO mascota(tutor_id, nombre, especie, raza, edad_aprox) VALUES ($1,$2,$3,$4,$5) RETURNING id, nombre, especie',
          [tutor.id, mNombre, m.especie, cleanText(m.raza, 40), cleanText(m.edad_aprox, 20)]
        )).rows[0];
        newPet = true;
      }

      // 4. Límites
      const lim = (await c.query(
        `SELECT
           count(*) FILTER (WHERE tutor_id = $1 AND start_at > now())::int AS fut_tutor,
           count(*) FILTER (WHERE tutor_id = $1 AND start_at::date = $2::date)::int AS day_tutor,
           count(*) FILTER (WHERE device_id = $3 AND start_at > now())::int AS fut_device
         FROM booking WHERE status IN ('pending','confirmed')`,
        [tutor.id, date, device.id]
      )).rows[0];
      if (lim.fut_tutor >= Number(settings.max_future_per_rut)) {
        throw new HttpError(429, `Ya tienes ${lim.fut_tutor} horas agendadas. Cancela alguna o contáctanos.`);
      }
      if (lim.day_tutor >= Number(settings.max_per_day_per_rut)) {
        throw new HttpError(429, 'Alcanzaste el máximo de horas para ese día.');
      }
      if (lim.fut_device >= Number(settings.max_future_per_device)) {
        throw new HttpError(429, 'Este dispositivo alcanzó el máximo de horas agendadas.');
      }

      // 5. Reserva (la constraint EXCLUDE impide choques entre reservas simultáneas)
      const end = new Date(start.getTime() + service.duracion_min * 60000);
      const blockEnd = new Date(end.getTime() + service.buffer_min * 60000);
      const status = OTP_ENABLED ? 'pending' : 'confirmed';
      const holdExpires = OTP_ENABLED ? new Date(Date.now() + otp.OTP_TTL_MIN * 60000) : null;
      let booking;
      try {
        booking = (await c.query(
          `INSERT INTO booking(tutor_id, mascota_id, service_id, start_at, end_at, block_end_at, status, motivo, device_id, ip, hold_expires_at, cancel_token)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [tutor.id, mascota.id, service.id, start, end, blockEnd, status, cleanText(b.motivo, 200), device.id, req.ip, holdExpires, randomToken()]
        )).rows[0];
      } catch (err) {
        if (err.code === '23P01') throw new HttpError(409, 'Esa hora acaba de ser tomada. Elige otra.');
        throw err;
      }

      if (isNewTutor) await linkDevice(c, device.id, tutor.id);

      let code = null;
      if (OTP_ENABLED) {
        code = otp.generate();
        await c.query('INSERT INTO otp(booking_id, code_hash, expires_at) VALUES ($1,$2,$3)', [booking.id, otp.hash(booking.id, code), holdExpires]);
      } else {
        await B.createVisita(c, booking.id);
      }
      return { booking, tutor, mascota, code, showFull: known || isNewTutor || newPet };
    });

    const { booking, tutor, mascota, code, showFull } = result;
    // El correo siempre va al email registrado del tutor (no al ingresado desde un dispositivo nuevo)
    if (code) {
      await mailer.sendOtp(preset.negocio, tutor.email, code);
    } else {
      const details = await B.bookingDetails(booking.id);
      await mailer.sendConfirmation(preset.negocio, details);
    }

    res.status(201).json({
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
    });
  }));

  // Verificar código (solo si OTP_ENABLED=true)
  r.post('/bookings/:id/verify', otpLimiter, ah(async (req, res) => {
    if (!OTP_ENABLED) throw new HttpError(404, 'No disponible.');
    if (!req.device) throw new HttpError(403, 'Abre el código en el mismo dispositivo donde agendaste.');
    const id = Number(req.params.id) || 0;
    const code = String((req.body && req.body.code) || '').trim();

    const out = await db.tx(async (c) => {
      const bk = (await c.query(
        `SELECT b.id, b.status, b.device_id, b.tutor_id, b.hold_expires_at, o.code_hash, o.attempts
         FROM booking b JOIN otp o ON o.booking_id = b.id WHERE b.id = $1 FOR UPDATE OF b`,
        [id]
      )).rows[0];
      if (!bk || bk.device_id !== req.device.id) throw new HttpError(404, 'Reserva no encontrada.');
      if (bk.status !== 'pending') throw new HttpError(409, 'Esta reserva ya no está pendiente.');
      if (new Date(bk.hold_expires_at) < new Date()) throw new HttpError(410, 'El código venció. Vuelve a agendar.');
      if (bk.attempts >= otp.OTP_MAX_ATTEMPTS) throw new HttpError(429, 'Demasiados intentos. Vuelve a agendar.');
      if (!otp.check(id, code, bk.code_hash)) {
        await c.query('UPDATE otp SET attempts = attempts + 1 WHERE booking_id = $1', [id]);
        return { ok: false, left: otp.OTP_MAX_ATTEMPTS - bk.attempts - 1 };
      }
      await c.query("UPDATE booking SET status = 'confirmed', hold_expires_at = NULL WHERE id = $1", [id]);
      await c.query('DELETE FROM otp WHERE booking_id = $1', [id]);
      await B.createVisita(c, id);
      await linkDevice(c, req.device.id, bk.tutor_id);
      return { ok: true };
    });
    if (!out.ok) throw new HttpError(400, `Código incorrecto. Te quedan ${Math.max(out.left, 0)} intentos.`);

    const details = await B.bookingDetails(id);
    await mailer.sendConfirmation(preset.negocio, details);
    res.json({ ok: true, status: 'confirmed' });
  }));

  // "Mis horas": datos del tutor vinculado a este dispositivo
  r.get('/me', ah(async (req, res) => {
    if (!req.device || !req.device.tutor_id) return res.json({ linked: false });
    const tid = req.device.tutor_id;
    const [{ rows: t }, { rows: proximas }, { rows: mascotas }] = await Promise.all([
      db.query('SELECT nombre FROM tutor WHERE id = $1', [tid]),
      db.query(
        `SELECT b.id, b.start_at, b.status, s.nombre AS servicio, m.nombre AS mascota, m.especie
         FROM booking b JOIN service s ON s.id = b.service_id JOIN mascota m ON m.id = b.mascota_id
         WHERE b.tutor_id = $1 AND b.status IN ('pending','confirmed') AND b.start_at > now()
         ORDER BY b.start_at`,
        [tid]
      ),
      db.query(
        `SELECT m.id, m.nombre, m.especie,
           COALESCE(json_agg(json_build_object('fecha', v.fecha, 'servicio', v.servicio, 'estado', v.estado) ORDER BY v.fecha DESC)
             FILTER (WHERE v.id IS NOT NULL), '[]') AS visitas
         FROM mascota m LEFT JOIN visita v ON v.mascota_id = m.id
         WHERE m.tutor_id = $1 AND m.activo
         GROUP BY m.id ORDER BY m.created_at, m.id`,
        [tid]
      ),
    ]);
    if (!t[0]) return res.json({ linked: false });
    res.json({
      linked: true,
      tutor: { nombre: t[0].nombre },
      proximas: proximas.map((p) => ({ ...p, fecha: fechaLarga(p.start_at), hora: hora(p.start_at) })),
      mascotas,
    });
  }));

  r.post('/me/bookings/:id/cancel', ah(async (req, res) => {
    if (!req.device || !req.device.tutor_id) throw new HttpError(403, 'No autorizado.');
    const id = Number(req.params.id) || 0;
    const ok = await db.tx(async (c) => {
      const bk = (await c.query('SELECT id FROM booking WHERE id = $1 AND tutor_id = $2 AND start_at > now() FOR UPDATE', [id, req.device.tutor_id])).rows[0];
      if (!bk) throw new HttpError(404, 'Reserva no encontrada.');
      return B.cancelBooking(c, id);
    });
    if (ok) mailer.sendCancellation(preset.negocio, await B.bookingDetails(id));
    res.json({ ok });
  }));

  // Link del correo: ver/cancelar la hora. Abrirlo vincula este dispositivo al tutor (prueba de acceso al correo).
  async function byToken(token) {
    const { rows } = await db.query('SELECT id FROM booking WHERE cancel_token = $1', [String(token || '')]);
    if (!rows[0]) throw new HttpError(404, 'No encontramos esta reserva.');
    return B.bookingDetails(rows[0].id);
  }

  r.get('/r/:token', ah(async (req, res) => {
    const d = await byToken(req.params.token);
    const device = await ensureDevice(req, res);
    await linkDevice(db, device.id, d.tutor_id);
    const cancelable = ['pending', 'confirmed'].includes(d.status) && new Date(d.start_at) > new Date();
    res.json({
      booking: { servicio: d.servicio, mascota: d.mascota, especie: d.especie, fecha: fechaLarga(d.start_at), hora: hora(d.start_at), status: d.status, cancelable },
      negocio: preset.negocio,
    });
  }));

  r.post('/r/:token/cancel', ah(async (req, res) => {
    const d = await byToken(req.params.token);
    if (new Date(d.start_at) <= new Date()) throw new HttpError(409, 'Esta hora ya pasó.');
    const ok = await db.tx((c) => B.cancelBooking(c, d.id));
    if (ok) mailer.sendCancellation(preset.negocio, d);
    res.json({ ok });
  }));

  return r;
};

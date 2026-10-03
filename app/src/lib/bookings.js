// Operaciones de dominio compartidas entre la API pública, el admin y los jobs.
const db = require('../db');

// Estado de la reserva -> estado de la visita
const VISITA_ESTADO = {
  pending: null,
  confirmed: 'agendada',
  done: 'atendida',
  no_show: 'no_asistio',
  cancelled: 'cancelada',
  expired: null,
};

async function createVisita(client, bookingId) {
  await client.query(
    `INSERT INTO visita(booking_id, mascota_id, fecha, servicio, estado)
     SELECT b.id, b.mascota_id, b.start_at, s.nombre, 'agendada'
     FROM booking b JOIN service s ON s.id = b.service_id
     WHERE b.id = $1
     ON CONFLICT (booking_id) DO NOTHING`,
    [bookingId]
  );
}

async function syncVisita(client, bookingId, status, extra = {}) {
  const estado = VISITA_ESTADO[status];
  if (!estado) return;
  await createVisita(client, bookingId);
  await client.query(
    `UPDATE visita SET estado = $2,
       peso_kg = COALESCE($3, peso_kg),
       observaciones = COALESCE($4, observaciones),
       updated_at = now()
     WHERE booking_id = $1`,
    [bookingId, estado, extra.peso_kg ?? null, extra.observaciones ?? null]
  );
}

async function cancelBooking(client, bookingId) {
  const { rowCount } = await client.query(
    "UPDATE booking SET status = 'cancelled', hold_expires_at = NULL WHERE id = $1 AND status IN ('pending','confirmed')",
    [bookingId]
  );
  if (rowCount) await syncVisita(client, bookingId, 'cancelled');
  return rowCount > 0;
}

// Datos para correos y resúmenes
async function bookingDetails(bookingId, client = db) {
  const { rows } = await client.query(
    `SELECT b.id, b.start_at, b.end_at, b.status, b.cancel_token, b.tutor_id,
            s.nombre AS servicio, m.nombre AS mascota, m.especie,
            t.nombre AS tutor_nombre, t.email
     FROM booking b
     JOIN service s ON s.id = b.service_id
     JOIN mascota m ON m.id = b.mascota_id
     JOIN tutor t ON t.id = b.tutor_id
     WHERE b.id = $1`,
    [bookingId]
  );
  return rows[0] || null;
}

// Ley 21.719: anonimiza al tutor conservando el historial clínico de la mascota
async function anonymizeTutor(client, tutorId) {
  const { rows } = await client.query(
    "SELECT id FROM booking WHERE tutor_id = $1 AND status IN ('pending','confirmed') AND start_at > now()",
    [tutorId]
  );
  for (const r of rows) await cancelBooking(client, r.id);
  await client.query('UPDATE device SET tutor_id = NULL WHERE tutor_id = $1', [tutorId]);
  await client.query(
    `UPDATE tutor SET rut = 'ANON-' || id, nombre = 'Anónimo', email = '', telefono = NULL,
       anonymized = true, blocked = false
     WHERE id = $1`,
    [tutorId]
  );
}

module.exports = { createVisita, syncVisita, cancelBooking, bookingDetails, anonymizeTutor, VISITA_ESTADO };

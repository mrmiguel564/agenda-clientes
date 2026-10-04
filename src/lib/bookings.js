// Operaciones de dominio compartidas entre la API pública, el admin y las tareas programadas.
import { all, first, run, nowIso } from '../db.js';

// Estado de la reserva -> estado de la visita
export const VISITA_ESTADO = { pending: null, confirmed: 'agendada', done: 'atendida', no_show: 'no_asistio', cancelled: 'cancelada', expired: null };

export const createVisitaStmt = (db, bookingId) => db.prepare(
  `INSERT INTO visita(booking_id, mascota_id, fecha, servicio, estado, created_at, updated_at)
   SELECT b.id, b.mascota_id, b.start_at, s.nombre, 'agendada', ?2, ?2
   FROM booking b JOIN service s ON s.id = b.service_id
   WHERE b.id = ?1
   ON CONFLICT(booking_id) DO NOTHING`).bind(bookingId, nowIso());

export async function syncVisita(db, bookingId, status, extra = {}){
  const estado = VISITA_ESTADO[status];
  if (!estado) return;
  await db.batch([
    createVisitaStmt(db, bookingId),
    db.prepare(
      `UPDATE visita SET estado = ?2,
         peso_kg = COALESCE(?3, peso_kg),
         observaciones = COALESCE(?4, observaciones),
         updated_at = ?5
       WHERE booking_id = ?1`).bind(bookingId, estado, extra.peso_kg ?? null, extra.observaciones ?? null, nowIso()),
  ]);
}

export async function cancelBooking(db, bookingId){
  const res = await run(db, "UPDATE booking SET status = 'cancelled', hold_expires_at = NULL WHERE id = ?1 AND status IN ('pending','confirmed')", bookingId);
  const ok = res.meta.changes > 0;
  if (ok) await syncVisita(db, bookingId, 'cancelled');
  return ok;
}

// Datos para correos y resúmenes
export function bookingDetails(db, bookingId){
  return first(db,
    `SELECT b.id, b.start_at, b.end_at, b.status, b.cancel_token, b.tutor_id,
            s.nombre AS servicio, m.nombre AS mascota, m.especie,
            t.nombre AS tutor_nombre, t.email
     FROM booking b
     JOIN service s ON s.id = b.service_id
     JOIN mascota m ON m.id = b.mascota_id
     JOIN tutor t ON t.id = b.tutor_id
     WHERE b.id = ?1`, bookingId);
}

// Ley 21.719: anonimiza al tutor conservando el historial clínico de la mascota
export async function anonymizeTutor(db, tutorId){
  const rows = await all(db, "SELECT id FROM booking WHERE tutor_id = ?1 AND status IN ('pending','confirmed') AND start_at > ?2", tutorId, nowIso());
  for (const r of rows) await cancelBooking(db, r.id);
  await db.batch([
    db.prepare('UPDATE device SET tutor_id = NULL WHERE tutor_id = ?1').bind(tutorId),
    db.prepare(
      `UPDATE tutor SET rut = 'ANON-' || id, nombre = 'Anónimo', email = '', telefono = NULL, anonymized = 1, blocked = 0
       WHERE id = ?1`).bind(tutorId),
  ]);
}

// Condición SQL "choca con alguna reserva activa". Recibe los números de parámetro (?n) de:
// id a excluir, ahora, fin con margen (block_end) e inicio. Reemplaza a la constraint EXCLUDE de Postgres:
// usada dentro de un solo INSERT/UPDATE, SQLite la evalúa de forma atómica.
export const overlapSql = (x, n, e, s) => `EXISTS (SELECT 1 FROM booking o
  WHERE o.id <> ?${x} AND (o.status = 'confirmed' OR (o.status = 'pending' AND o.hold_expires_at > ?${n}))
    AND o.start_at < ?${e} AND o.block_end_at > ?${s})`;

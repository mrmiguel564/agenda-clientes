// Tareas periódicas
const db = require('./db');
const B = require('./lib/bookings');

async function expirePending() {
  const { rowCount } = await db.query(
    "UPDATE booking SET status = 'expired' WHERE status = 'pending' AND hold_expires_at < now()"
  );
  if (rowCount) console.log(`[jobs] ${rowCount} reserva(s) sin confirmar liberadas`);
}

// Ley 21.719: anonimiza tutores sin actividad por 24 meses y sin horas futuras
async function anonymizeInactive() {
  const { rows } = await db.query(
    `SELECT t.id FROM tutor t
     WHERE NOT t.anonymized AND t.last_seen < now() - interval '24 months'
       AND NOT EXISTS (SELECT 1 FROM booking b WHERE b.tutor_id = t.id AND b.start_at > now() AND b.status IN ('pending','confirmed'))`
  );
  for (const r of rows) await db.tx((c) => B.anonymizeTutor(c, r.id));
  if (rows.length) console.log(`[jobs] ${rows.length} tutor(es) inactivo(s) anonimizado(s)`);
}

function safe(fn) {
  return () => fn().catch((err) => console.error(`[jobs] ${fn.name}:`, err.message));
}

function start() {
  safe(expirePending)();
  safe(anonymizeInactive)();
  setInterval(safe(expirePending), 60 * 1000);
  setInterval(safe(anonymizeInactive), 6 * 60 * 60 * 1000);
}

module.exports = { start, expirePending, anonymizeInactive };

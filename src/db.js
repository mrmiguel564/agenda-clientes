// Acceso a D1. Sin transacciones interactivas: lo que debe ser atómico va en un solo INSERT/UPDATE condicional o en db.batch().
import { SCHEMA } from './schema.js';
import { zonedToUtc } from './lib/tz.js';
import { addDays } from './lib/slots.js';

export const DEFAULT_SETTINGS = {
  agenda_open: true,
  max_days_ahead: 30,
  min_notice_min: 120,
  slot_step_min: 30,
  max_future_per_rut: 3,
  max_per_day_per_rut: 2,
  max_future_per_device: 5,
  strikes_to_block: 3,
};

export const nowIso = () => new Date().toISOString();

export async function all(db, sql, ...params){
  const { results } = await db.prepare(sql).bind(...params).all();
  return results || [];
}
export async function first(db, sql, ...params){
  return (await db.prepare(sql).bind(...params).first()) || null;
}
export async function run(db, sql, ...params){
  return db.prepare(sql).bind(...params).run();
}

// Instantes UTC (ISO) del inicio de un día local y del día siguiente
export function dayBounds(from, to = from){
  return [zonedToUtc(from, 0).toISOString(), zonedToUtc(addDays(to, 1), 0).toISOString()];
}

let initialized = false;
export async function init(db, preset){
  if (initialized) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  await db.batch(Object.entries(DEFAULT_SETTINGS).map(([k, v]) =>
    db.prepare('INSERT INTO settings(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO NOTHING').bind(k, JSON.stringify(v))));
  const svc = await first(db, 'SELECT count(*) AS n FROM service');
  if (!svc.n){
    await db.batch(preset.servicios.map((s, i) =>
      db.prepare('INSERT INTO service(nombre, descripcion, icono, duracion_min, buffer_min, es_urgencia, orden) VALUES (?1,?2,?3,?4,?5,?6,?7)')
        .bind(s.nombre, s.descripcion || null, s.icono || null, s.duracion_min, s.buffer_min || 0, s.es_urgencia ? 1 : 0, i)));
  }
  const ws = await first(db, 'SELECT count(*) AS n FROM weekly_schedule');
  if (!ws.n){
    const stmts = [];
    for (const day of preset.horario_default){
      for (const [start, end] of day.ranges) stmts.push(db.prepare('INSERT INTO weekly_schedule(weekday, start_time, end_time) VALUES (?1,?2,?3)').bind(day.weekday, start, end));
    }
    await db.batch(stmts);
  }
  initialized = true;
}

export async function getSettings(db){
  const rows = await all(db, 'SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = JSON.parse(r.value);
  return s;
}

// Datos que necesita el motor de slots para un rango de fechas (locales)
export async function getScheduleData(db, dateFrom, dateTo){
  const [startIso, endIso] = dayBounds(dateFrom, dateTo);
  const [weekly, overrides, bookings] = await Promise.all([
    all(db, 'SELECT weekday, start_time, end_time FROM weekly_schedule ORDER BY weekday, start_time'),
    all(db, 'SELECT id, date_from, date_to, closed, ranges, nota FROM schedule_override WHERE date_to >= ?1 AND date_from <= ?2', dateFrom, dateTo),
    all(db,
      `SELECT start_at, block_end_at FROM booking
       WHERE (status = 'confirmed' OR (status = 'pending' AND hold_expires_at > ?3))
         AND block_end_at >= ?1 AND start_at < ?2`,
      startIso, endIso, nowIso()),
  ]);
  return { weekly, overrides: overrides.map(parseOverride), bookings };
}

export function parseOverride(o){
  return { ...o, closed: !!o.closed, ranges: typeof o.ranges === 'string' ? JSON.parse(o.ranges) : o.ranges };
}

// Límite simple por clave en una ventana de tiempo (guardado en D1)
export async function hit(db, key, max, windowSec){
  const now = Math.floor(Date.now() / 1000);
  const row = await first(db,
    `INSERT INTO rate_limit(k, n, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN reset_at < ?3 THEN 1 ELSE n + 1 END,
       reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
     RETURNING n`,
    key, now + windowSec, now);
  return row.n <= max;
}

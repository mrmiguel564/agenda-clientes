const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// DATE como texto 'YYYY-MM-DD' (evita corrimientos por zona horaria)
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c timezone=${process.env.TZ || 'America/Santiago'}`,
});

const DEFAULT_SETTINGS = {
  agenda_open: true,
  max_days_ahead: 30,
  min_notice_min: 120,
  slot_step_min: 30,
  max_future_per_rut: 3,
  max_per_day_per_rut: 2,
  max_future_per_device: 5,
  strikes_to_block: 3,
};

function query(text, params) {
  return pool.query(text, params);
}

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`[db] esperando a PostgreSQL (${i + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('No se pudo conectar a PostgreSQL');
}

async function init(preset) {
  await waitForDb();
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query('INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]);
  }

  const { rows: svc } = await pool.query('SELECT count(*)::int AS n FROM service');
  if (svc[0].n === 0) {
    let orden = 0;
    for (const s of preset.servicios) {
      await pool.query(
        `INSERT INTO service(nombre, descripcion, icono, duracion_min, buffer_min, es_urgencia, orden)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [s.nombre, s.descripcion || null, s.icono || null, s.duracion_min, s.buffer_min || 0, !!s.es_urgencia, orden++]
      );
    }
    console.log(`[db] ${preset.servicios.length} servicios cargados desde el preset "${preset.id}"`);
  }

  const { rows: ws } = await pool.query('SELECT count(*)::int AS n FROM weekly_schedule');
  if (ws[0].n === 0) {
    for (const day of preset.horario_default) {
      for (const [start, end] of day.ranges) {
        await pool.query('INSERT INTO weekly_schedule(weekday, start_time, end_time) VALUES ($1,$2,$3)', [day.weekday, start, end]);
      }
    }
    console.log('[db] horario por defecto cargado desde el preset');
  }
}

async function getSettings(client = pool) {
  const { rows } = await client.query('SELECT key, value FROM settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

// Datos que necesita el motor de slots para un rango de fechas
async function getScheduleData(dateFrom, dateTo, client = pool) {
  const [weekly, overrides, bookings] = await Promise.all([
    client.query("SELECT weekday, to_char(start_time,'HH24:MI') AS start_time, to_char(end_time,'HH24:MI') AS end_time FROM weekly_schedule ORDER BY weekday, start_time"),
    client.query('SELECT id, date_from, date_to, closed, ranges, nota FROM schedule_override WHERE date_to >= $1 AND date_from <= $2', [dateFrom, dateTo]),
    client.query(
      `SELECT start_at, block_end_at FROM booking
       WHERE status IN ('pending','confirmed')
         AND block_end_at >= ($1::date)::timestamptz
         AND start_at < ($2::date + 1)::timestamptz`,
      [dateFrom, dateTo]
    ),
  ]);
  return { weekly: weekly.rows, overrides: overrides.rows, bookings: bookings.rows };
}

module.exports = { pool, query, tx, init, getSettings, getScheduleData, DEFAULT_SETTINGS };

// Esquema D1 (SQLite), idempotente: se aplica solo la primera vez que el Worker atiende una petición.
// Fechas y horas: texto ISO en UTC ('2026-10-09T13:30:00.000Z'), que se ordena y compara como texto.
// Booleanos: 0/1. JSON: texto.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tutor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    telefono TEXT,
    strikes INTEGER NOT NULL DEFAULT 0,
    blocked INTEGER NOT NULL DEFAULT 0,
    anonymized INTEGER NOT NULL DEFAULT 0,
    consent_at TEXT,
    created_at TEXT NOT NULL,
    last_seen TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mascota (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id INTEGER NOT NULL REFERENCES tutor(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    especie TEXT NOT NULL CHECK (especie IN ('perro','gato','exotico','otro')),
    raza TEXT, sexo TEXT, edad_aprox TEXT, notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS mascota_tutor_idx ON mascota(tutor_id)',
  `CREATE TABLE IF NOT EXISTS device (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    tutor_id INTEGER REFERENCES tutor(id) ON DELETE SET NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    last_seen TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS service (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    icono TEXT,
    duracion_min INTEGER NOT NULL CHECK (duracion_min > 0),
    buffer_min INTEGER NOT NULL DEFAULT 0 CHECK (buffer_min >= 0),
    es_urgencia INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1,
    orden INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS weekly_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    CHECK (end_time > start_time)
  )`,
  `CREATE TABLE IF NOT EXISTS schedule_override (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_from TEXT NOT NULL,
    date_to TEXT NOT NULL,
    closed INTEGER NOT NULL DEFAULT 0,
    ranges TEXT NOT NULL DEFAULT '[]',
    nota TEXT,
    created_at TEXT NOT NULL,
    CHECK (date_to >= date_from)
  )`,
  `CREATE TABLE IF NOT EXISTS booking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id INTEGER NOT NULL REFERENCES tutor(id) ON DELETE CASCADE,
    mascota_id INTEGER NOT NULL REFERENCES mascota(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES service(id),
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    block_end_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled','no_show','done','expired')),
    motivo TEXT,
    device_id INTEGER REFERENCES device(id) ON DELETE SET NULL,
    ip TEXT,
    hold_expires_at TEXT,
    cancel_token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS booking_start_idx ON booking(start_at)',
  'CREATE INDEX IF NOT EXISTS booking_tutor_idx ON booking(tutor_id)',
  `CREATE TABLE IF NOT EXISTS visita (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL UNIQUE REFERENCES booking(id) ON DELETE CASCADE,
    mascota_id INTEGER NOT NULL REFERENCES mascota(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    servicio TEXT NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('agendada','atendida','no_asistio','cancelada')),
    peso_kg REAL,
    observaciones TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS visita_mascota_idx ON visita(mascota_id)',
  `CREATE TABLE IF NOT EXISTS otp (
    booking_id INTEGER PRIMARY KEY REFERENCES booking(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS rate_limit (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL)',
];

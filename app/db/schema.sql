-- Esquema idempotente: se aplica cada vez que inicia la app.

CREATE TABLE IF NOT EXISTS tutor (
  id          SERIAL PRIMARY KEY,
  rut         TEXT NOT NULL UNIQUE,              -- normalizado: 12345678-5
  nombre      TEXT NOT NULL,
  email       TEXT NOT NULL,
  telefono    TEXT,
  strikes     INT NOT NULL DEFAULT 0,
  blocked     BOOLEAN NOT NULL DEFAULT false,
  anonymized  BOOLEAN NOT NULL DEFAULT false,
  consent_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mascota (
  id          SERIAL PRIMARY KEY,
  tutor_id    INT NOT NULL REFERENCES tutor(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  especie     TEXT NOT NULL CHECK (especie IN ('perro','gato','exotico','otro')),
  raza        TEXT,
  sexo        TEXT,
  edad_aprox  TEXT,
  notas       TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mascota_tutor_idx ON mascota(tutor_id);

CREATE TABLE IF NOT EXISTS device (
  id          SERIAL PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  tutor_id    INT REFERENCES tutor(id) ON DELETE SET NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  icono         TEXT,
  duracion_min  INT NOT NULL CHECK (duracion_min > 0),
  buffer_min    INT NOT NULL DEFAULT 0 CHECK (buffer_min >= 0),
  es_urgencia   BOOLEAN NOT NULL DEFAULT false,
  activo        BOOLEAN NOT NULL DEFAULT true,
  orden         INT NOT NULL DEFAULT 0
);

-- Horario por defecto: varios rangos por día (0 = domingo ... 6 = sábado)
CREATE TABLE IF NOT EXISTS weekly_schedule (
  id          SERIAL PRIMARY KEY,
  weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CHECK (end_time > start_time)
);

-- Horario especial: reemplaza al horario por defecto en esas fechas
CREATE TABLE IF NOT EXISTS schedule_override (
  id          SERIAL PRIMARY KEY,
  date_from   DATE NOT NULL,
  date_to     DATE NOT NULL,
  closed      BOOLEAN NOT NULL DEFAULT false,
  ranges      JSONB NOT NULL DEFAULT '[]',        -- [{"start":"08:00","end":"14:00"}]
  nota        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE TABLE IF NOT EXISTS booking (
  id               SERIAL PRIMARY KEY,
  tutor_id         INT NOT NULL REFERENCES tutor(id) ON DELETE CASCADE,
  mascota_id       INT NOT NULL REFERENCES mascota(id) ON DELETE CASCADE,
  service_id       INT NOT NULL REFERENCES service(id),
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  block_end_at     TIMESTAMPTZ NOT NULL,          -- end_at + buffer del servicio
  status           TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled','no_show','done','expired')),
  motivo           TEXT,
  device_id        INT REFERENCES device(id) ON DELETE SET NULL,
  ip               TEXT,
  hold_expires_at  TIMESTAMPTZ,
  cancel_token     TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Imposible tener dos horas activas que se crucen
  CONSTRAINT booking_no_overlap EXCLUDE USING gist (tstzrange(start_at, block_end_at) WITH &&)
    WHERE (status IN ('pending','confirmed'))
);
CREATE INDEX IF NOT EXISTS booking_start_idx ON booking(start_at);
CREATE INDEX IF NOT EXISTS booking_tutor_idx ON booking(tutor_id);

-- Registro de visitas por mascota (1 por reserva confirmada)
CREATE TABLE IF NOT EXISTS visita (
  id             SERIAL PRIMARY KEY,
  booking_id     INT NOT NULL UNIQUE REFERENCES booking(id) ON DELETE CASCADE,
  mascota_id     INT NOT NULL REFERENCES mascota(id) ON DELETE CASCADE,
  fecha          TIMESTAMPTZ NOT NULL,
  servicio       TEXT NOT NULL,
  estado         TEXT NOT NULL CHECK (estado IN ('agendada','atendida','no_asistio','cancelada')),
  peso_kg        NUMERIC(6,2),
  observaciones  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visita_mascota_idx ON visita(mascota_id);

CREATE TABLE IF NOT EXISTS otp (
  booking_id  INT PRIMARY KEY REFERENCES booking(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);

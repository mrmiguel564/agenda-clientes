// Cookie técnica de dispositivo: se crea en silencio al reservar.
// Sirve para prellenar datos, "Mis horas" y límites por dispositivo.
const db = require('../db');
const { sha256, randomToken } = require('../lib/util');

const COOKIE = 'did';
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;
const secure = String(process.env.PUBLIC_URL || '').startsWith('https://');

async function loadDevice(req, res, next) {
  req.device = null;
  const token = req.signedCookies && req.signedCookies[COOKIE];
  if (token) {
    try {
      const { rows } = await db.query('UPDATE device SET last_seen = now() WHERE token_hash = $1 RETURNING id, tutor_id', [sha256(token)]);
      req.device = rows[0] || null;
    } catch (err) {
      return next(err);
    }
  }
  next();
}

async function ensureDevice(req, res) {
  if (req.device) return req.device;
  const token = randomToken(32);
  const { rows } = await db.query('INSERT INTO device(token_hash, user_agent) VALUES ($1, $2) RETURNING id, tutor_id', [
    sha256(token),
    String(req.get('user-agent') || '').slice(0, 300),
  ]);
  res.cookie(COOKIE, token, { signed: true, httpOnly: true, sameSite: 'lax', secure, maxAge: ONE_YEAR });
  req.device = rows[0];
  return req.device;
}

// Vincula el dispositivo a un tutor. Solo cuando hay prueba de identidad:
// tutor recién creado desde este dispositivo, código OTP correcto o link del correo.
async function linkDevice(client, deviceId, tutorId) {
  await client.query('UPDATE device SET tutor_id = $2 WHERE id = $1', [deviceId, tutorId]);
}

module.exports = { loadDevice, ensureDevice, linkDevice };

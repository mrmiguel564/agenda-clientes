// Cookies firmadas: dispositivo (se crea en silencio al reservar) y sesión del panel admin.
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { first, run, nowIso } from '../db.js';
import { sha256, randomToken, safeEqual } from './util.js';

const DEVICE = 'did';
const ADMIN = 'adm';
const ONE_YEAR = 365 * 24 * 60 * 60;
const SESSION = 12 * 60 * 60;

const secret = (c) => c.env.COOKIE_SECRET || 'agenda-dev-secret';
// la sesión admin se firma también con la contraseña: si cambia, todas las sesiones caducan
const adminSecret = (c) => `${c.env.COOKIE_SECRET || ''}:${c.env.ADMIN_PASSWORD || ''}`;
const isHttps = (c) => new URL(c.req.url).protocol === 'https:';

export async function loadDevice(c, next){
  c.set('device', null);
  const token = await getSignedCookie(c, secret(c), DEVICE);
  if (token){
    const row = await first(c.env.DB, 'UPDATE device SET last_seen = ?2 WHERE token_hash = ?1 RETURNING id, tutor_id', await sha256(token), nowIso());
    c.set('device', row);
  }
  await next();
}

export async function ensureDevice(c){
  const cur = c.get('device');
  if (cur) return cur;
  const token = randomToken(32);
  const row = await first(c.env.DB,
    'INSERT INTO device(token_hash, user_agent, created_at, last_seen) VALUES (?1, ?2, ?3, ?3) RETURNING id, tutor_id',
    await sha256(token), String(c.req.header('user-agent') || '').slice(0, 300), nowIso());
  await setSignedCookie(c, DEVICE, token, secret(c), { httpOnly: true, sameSite: 'Lax', secure: isHttps(c), maxAge: ONE_YEAR, path: '/' });
  c.set('device', row);
  return row;
}

// Vincula el dispositivo a un tutor. Solo cuando hay prueba de identidad:
// tutor recién creado desde este dispositivo, código OTP correcto o link del correo.
export function linkDevice(db, deviceId, tutorId){
  return run(db, 'UPDATE device SET tutor_id = ?2 WHERE id = ?1', deviceId, tutorId);
}

export async function checkCredentials(env, email, password){
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return false;
  const okEmail = await safeEqual(String(email || '').trim().toLowerCase(), env.ADMIN_EMAIL.trim().toLowerCase());
  const okPass = await safeEqual(String(password || ''), env.ADMIN_PASSWORD);
  return okEmail && okPass;
}

export function startSession(c){
  return setSignedCookie(c, ADMIN, String(Date.now() + SESSION * 1000), adminSecret(c), { httpOnly: true, sameSite: 'Strict', secure: isHttps(c), maxAge: SESSION, path: '/' });
}

export function endSession(c){
  deleteCookie(c, ADMIN, { path: '/' });
}

export async function isAdmin(c){
  if (!c.env.ADMIN_PASSWORD) return false;
  const v = await getSignedCookie(c, adminSecret(c), ADMIN);
  return !!v && Number(v) > Date.now();
}

export async function requireAdmin(c, next){
  if (await isAdmin(c)) return next();
  return c.json({ error: 'Sesión expirada. Ingresa nuevamente.' }, 401);
}

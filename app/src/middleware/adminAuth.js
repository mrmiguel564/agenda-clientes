const { safeEqual } = require('../lib/util');

const COOKIE = 'adm';
const SESSION_MS = 12 * 60 * 60 * 1000;
const secure = String(process.env.PUBLIC_URL || '').startsWith('https://');

function checkCredentials(email, password) {
  const E = process.env.ADMIN_EMAIL;
  const P = process.env.ADMIN_PASSWORD;
  if (!E || !P) return false;
  const okEmail = safeEqual(String(email || '').trim().toLowerCase(), E.trim().toLowerCase());
  const okPass = safeEqual(String(password || ''), P);
  return okEmail && okPass;
}

function startSession(res) {
  const exp = Date.now() + SESSION_MS;
  res.cookie(COOKIE, String(exp), { signed: true, httpOnly: true, sameSite: 'strict', secure, maxAge: SESSION_MS });
}

function endSession(res) {
  res.clearCookie(COOKIE);
}

function isAdmin(req) {
  const v = req.signedCookies && req.signedCookies[COOKIE];
  return !!v && Number(v) > Date.now();
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Sesión expirada. Ingresa nuevamente.' });
}

module.exports = { checkCredentials, startSession, endSession, isAdmin, requireAdmin };

const crypto = require('crypto');

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

function safeEqual(a, b) {
  const ha = Buffer.from(sha256(a));
  const hb = Buffer.from(sha256(b));
  return crypto.timingSafeEqual(ha, hb);
}

// "Luna" -> "L••a", "Al" -> "A•"
function maskName(name) {
  const n = String(name || '').trim();
  if (n.length <= 2) return n.charAt(0) + '•';
  return n.charAt(0) + '•'.repeat(Math.min(n.length - 2, 4)) + n.charAt(n.length - 1);
}

// "camila@gmail.com" -> "c*****@gmail.com"
function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '';
  return user.charAt(0) + '*****@' + domain;
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

function cleanText(v, max = 120) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
}

const fechaFmt = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
const horaFmt = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
const fechaLarga = (d) => fechaFmt.format(new Date(d));
const hora = (d) => horaFmt.format(new Date(d));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Envuelve handlers async para que los errores lleguen al middleware de errores
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { sha256, randomToken, safeEqual, maskName, maskEmail, isEmail, cleanText, fechaLarga, hora, HttpError, ah };

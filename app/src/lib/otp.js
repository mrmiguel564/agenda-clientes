const crypto = require('crypto');
const { sha256 } = require('./util');

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;

function generate() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// El hash incluye el id de la reserva para que un mismo código no sirva en otra reserva
const hash = (bookingId, code) => sha256(`${bookingId}:${String(code).trim()}:${process.env.COOKIE_SECRET || ''}`);

function check(bookingId, code, codeHash) {
  const a = Buffer.from(hash(bookingId, code));
  const b = Buffer.from(String(codeHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { generate, hash, check, OTP_TTL_MIN, OTP_MAX_ATTEMPTS };

import { sha256 } from './util.js';

export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generate(){
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

// El hash incluye el id de la reserva para que un mismo código no sirva en otra reserva
export const hash = (bookingId, code, secret) => sha256(`${bookingId}:${String(code).trim()}:${secret || ''}`);

export async function check(bookingId, code, codeHash, secret){
  const h = await hash(bookingId, code, secret);
  let diff = h.length ^ String(codeHash).length;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ String(codeHash).charCodeAt(i);
  return diff === 0;
}

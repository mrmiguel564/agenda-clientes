import { TZ } from './tz.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(v){
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(String(v))));
}

export function randomToken(bytes = 24){
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Comparación en tiempo constante (sobre hashes de igual largo)
export async function safeEqual(a, b){
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

// "Luna" -> "L••a", "Al" -> "A•"
export function maskName(name){
  const n = String(name || '').trim();
  if (n.length <= 2) return n.charAt(0) + '•';
  return n.charAt(0) + '•'.repeat(Math.min(n.length - 2, 4)) + n.charAt(n.length - 1);
}

// "camila@gmail.com" -> "c*****@gmail.com"
export function maskEmail(email){
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '';
  return user.charAt(0) + '*****@' + domain;
}

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

export function cleanText(v, max = 120){
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
}

const fechaFmt = new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const horaFmt = new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
export const fechaLarga = (d) => fechaFmt.format(new Date(d));
export const hora = (d) => horaFmt.format(new Date(d));

export class HttpError extends Error {
  constructor(status, message){
    super(message);
    this.status = status;
  }
}

// UTF-8 -> base64 (adjuntos de correo)
export function b64utf8(s){
  const bytes = enc.encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

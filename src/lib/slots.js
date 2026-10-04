// Motor de disponibilidad. Funciones puras: reciben los datos, no tocan la BD.
// Fechas 'YYYY-MM-DD' y horas 'HH:MM' en la hora local del negocio (America/Santiago).
import { zonedToUtc, dateStrTz } from './tz.js';

const pad = (n) => String(n).padStart(2, '0');

export function toMin(time){
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min){
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

// Date -> 'YYYY-MM-DD' en hora local del negocio
export const dateStr = (d) => dateStrTz(d);

function parseDate(str){
  const [y, m, d] = str.split('-').map(Number);
  return { y, m, d };
}

export function addDays(str, n){
  const { y, m, d } = parseDate(str);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function daysBetween(a, b){
  const pa = parseDate(a), pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

export function weekdayOf(str){
  const { y, m, d } = parseDate(str);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Fecha + minutos del día (hora local del negocio) -> instante
export const localDate = (str, min) => zonedToUtc(str, min);

export function isValidDateStr(str){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str))) return false;
  const { y, m, d } = parseDate(str);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Rangos de atención de un día: el horario especial manda sobre el semanal.
export function rangesForDate(date, weekly, overrides){
  const ov = (overrides || [])
    .filter((o) => o.date_from <= date && o.date_to >= date)
    .sort((a, b) => b.id - a.id)[0];
  let ranges;
  if (ov){
    if (ov.closed) return { source: 'override', closed: true, ranges: [], nota: ov.nota || null };
    ranges = (ov.ranges || []).map((r) => ({ start: toMin(r.start), end: toMin(r.end) }));
  } else {
    const wd = weekdayOf(date);
    ranges = (weekly || [])
      .filter((w) => Number(w.weekday) === wd)
      .map((w) => ({ start: toMin(w.start_time), end: toMin(w.end_time) }));
  }
  ranges = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  return { source: ov ? 'override' : 'weekly', closed: ranges.length === 0, ranges, nota: ov ? ov.nota || null : null };
}

// Horas disponibles de un servicio en una fecha.
// bookings: reservas activas [{start_at, block_end_at}] (Date o ISO)
export function getSlots({ date, service, weekly, overrides, bookings, settings, now = new Date() }){
  if (!settings.agenda_open) return [];
  if (!isValidDateStr(date)) return [];
  const today = dateStr(now);
  if (date < today) return [];
  if (daysBetween(today, date) > Number(settings.max_days_ahead)) return [];

  const { ranges } = rangesForDate(date, weekly, overrides);
  const dur = Number(service.duracion_min);
  const buffer = Number(service.buffer_min || 0);
  const step = Number(settings.slot_step_min) > 0 ? Number(settings.slot_step_min) : dur;
  const minStart = now.getTime() + Number(settings.min_notice_min || 0) * 60000;
  const busy = (bookings || []).map((b) => [new Date(b.start_at).getTime(), new Date(b.block_end_at).getTime()]);

  const slots = [];
  for (const r of ranges){
    for (let t = r.start; t + dur <= r.end; t += step){
      const start = localDate(date, t).getTime();
      const blockEnd = start + (dur + buffer) * 60000;
      if (start < minStart) continue;
      if (busy.some(([bs, be]) => start < be && bs < blockEnd)) continue;
      slots.push({ time: minToTime(t), start: new Date(start).toISOString() });
    }
  }
  return slots;
}

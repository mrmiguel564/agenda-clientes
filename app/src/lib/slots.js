// Motor de disponibilidad. Funciones puras: reciben los datos, no tocan la BD.
// Fechas como 'YYYY-MM-DD', horas como 'HH:MM'. Las horas se interpretan en la zona
// horaria del proceso (TZ=America/Santiago en Docker).

const pad = (n) => String(n).padStart(2, '0');

function toMin(time) {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
}

function minToTime(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return { y, m, d };
}

function addDays(str, n) {
  const { y, m, d } = parseDate(str);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function daysBetween(a, b) {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

function weekdayOf(str) {
  const { y, m, d } = parseDate(str);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Fecha + minutos del día -> Date en hora local
function localDate(str, min) {
  const { y, m, d } = parseDate(str);
  return new Date(y, m - 1, d, Math.floor(min / 60), min % 60, 0, 0);
}

function isValidDateStr(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str))) return false;
  const { y, m, d } = parseDate(str);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Rangos de atención de un día: el horario especial manda sobre el semanal.
// weekly: [{weekday, start_time, end_time}]
// overrides: [{id, date_from, date_to, closed, ranges:[{start,end}]}]
function rangesForDate(date, weekly, overrides) {
  const ov = (overrides || [])
    .filter((o) => o.date_from <= date && o.date_to >= date)
    .sort((a, b) => b.id - a.id)[0];
  let ranges;
  if (ov) {
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
// bookings: reservas activas [{start_at: Date, block_end_at: Date}]
// settings: {agenda_open, max_days_ahead, min_notice_min, slot_step_min}
function getSlots({ date, service, weekly, overrides, bookings, settings, now = new Date() }) {
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

  const slots = [];
  for (const r of ranges) {
    for (let t = r.start; t + dur <= r.end; t += step) {
      const start = localDate(date, t);
      const blockEnd = new Date(start.getTime() + (dur + buffer) * 60000);
      if (start.getTime() < minStart) continue;
      const taken = (bookings || []).some(
        (b) => start < new Date(b.block_end_at) && new Date(b.start_at) < blockEnd
      );
      if (taken) continue;
      slots.push({ time: minToTime(t), start: start.toISOString() });
    }
  }
  return slots;
}

module.exports = {
  toMin,
  minToTime,
  dateStr,
  addDays,
  daysBetween,
  weekdayOf,
  localDate,
  isValidDateStr,
  rangesForDate,
  getSlots,
};

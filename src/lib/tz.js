// Zona horaria del negocio. Los Workers corren en UTC, así que todas las conversiones son explícitas.
export const TZ = 'America/Santiago';

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function parts(date){
  const p = {};
  for (const x of dtf.formatToParts(date)) p[x.type] = x.value;
  return p;
}

// Minutos de diferencia entre la hora local del negocio y UTC en ese instante (Chile: -180 o -240)
function offsetMin(date){
  const p = parts(date);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// 'YYYY-MM-DD' + minutos del día (hora local del negocio) -> Date (instante UTC)
export function zonedToUtc(dateStr, min){
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
  let off = offsetMin(new Date(guess));
  let ts = guess - off * 60000;
  const off2 = offsetMin(new Date(ts));
  if (off2 !== off) ts = guess - off2 * 60000;
  return new Date(ts);
}

// Date -> 'YYYY-MM-DD' en la zona del negocio
export function dateStrTz(date){
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

// Date -> minutos del día en la zona del negocio
export function minutesTz(date){
  const p = parts(date);
  return +p.hour * 60 + +p.minute;
}

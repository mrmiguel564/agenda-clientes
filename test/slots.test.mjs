import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/lib/slots.js';

// Lunes 2026-10-05
const MONDAY = '2026-10-05';
const NOW = S.localDate('2026-10-01', 9 * 60); // jueves 1 oct 09:00 (hora de Chile)

const weekly = [
  { weekday: 1, start_time: '08:00', end_time: '13:00' },
  { weekday: 1, start_time: '14:00', end_time: '18:00' },
  { weekday: 6, start_time: '09:00', end_time: '13:00' },
];
const service = { duracion_min: 30, buffer_min: 0 };
const settings = { agenda_open: true, max_days_ahead: 30, min_notice_min: 120, slot_step_min: 30 };
const base = { date: MONDAY, service, weekly, overrides: [], bookings: [], settings, now: NOW };

const times = (slots) => slots.map((s) => s.time);

test('horario semanal: genera slots en ambos rangos', () => {
  const t = times(S.getSlots(base));
  assert.equal(t[0], '08:00');
  assert.equal(t.at(-1), '17:30');
  assert.ok(!t.includes('13:00'));
  assert.ok(t.includes('14:00'));
  assert.equal(t.length, 10 + 8);
});

test('día sin horario (domingo) no tiene slots', () => {
  assert.deepEqual(S.getSlots({ ...base, date: '2026-10-04' }), []);
});

test('agenda cerrada no tiene slots', () => {
  assert.deepEqual(S.getSlots({ ...base, settings: { ...settings, agenda_open: false } }), []);
});

test('horario especial cerrado', () => {
  const overrides = [{ id: 1, date_from: MONDAY, date_to: MONDAY, closed: true, ranges: [] }];
  assert.deepEqual(S.getSlots({ ...base, overrides }), []);
});

test('horario especial con horas propias reemplaza al semanal', () => {
  const overrides = [{ id: 1, date_from: '2026-10-01', date_to: '2026-10-10', closed: false, ranges: [{ start: '08:00', end: '10:00' }] }];
  assert.deepEqual(times(S.getSlots({ ...base, overrides })), ['08:00', '08:30', '09:00', '09:30']);
});

test('el override más reciente gana', () => {
  const overrides = [
    { id: 1, date_from: MONDAY, date_to: MONDAY, closed: true, ranges: [] },
    { id: 2, date_from: MONDAY, date_to: MONDAY, closed: false, ranges: [{ start: '09:00', end: '10:00' }] },
  ];
  assert.deepEqual(times(S.getSlots({ ...base, overrides })), ['09:00', '09:30']);
});

test('reservas existentes y buffer bloquean slots', () => {
  const bookings = [{ start_at: S.localDate(MONDAY, 9 * 60), block_end_at: S.localDate(MONDAY, 9 * 60 + 45) }];
  const t = times(S.getSlots({ ...base, bookings }));
  assert.ok(!t.includes('09:00'));
  assert.ok(!t.includes('09:30')); // cae dentro del buffer
  assert.ok(t.includes('08:30'));
  assert.ok(t.includes('10:00'));

  const withBuffer = { duracion_min: 30, buffer_min: 15 };
  const t2 = times(S.getSlots({ ...base, service: withBuffer, bookings }));
  assert.ok(!t2.includes('08:30')); // 08:30 + 30 + 15 = 09:15 choca con la reserva de las 09:00
  assert.ok(t2.includes('08:00'));
});

test('anticipación mínima', () => {
  const now = S.localDate(MONDAY, 9 * 60 + 10); // lunes 09:10
  const t = times(S.getSlots({ ...base, now }));
  assert.equal(t[0], '11:30'); // 09:10 + 120 min = 11:10 -> primer slot 11:30
});

test('no permite fechas pasadas ni más allá de max_days_ahead', () => {
  assert.deepEqual(S.getSlots({ ...base, date: '2026-09-28' }), []);
  assert.deepEqual(S.getSlots({ ...base, date: '2026-11-02', settings: { ...settings, max_days_ahead: 30 } }), []);
  assert.ok(S.getSlots({ ...base, date: '2026-10-31' }).length > 0); // sábado dentro del rango
});

test('servicio que no cabe al final del rango', () => {
  const t = times(S.getSlots({ ...base, service: { duracion_min: 60, buffer_min: 0 } }));
  assert.ok(t.includes('12:00'));
  assert.ok(!t.includes('12:30'));
  assert.equal(t.at(-1), '17:00');
});

test('slot_step 0 usa la duración del servicio', () => {
  const t = times(S.getSlots({ ...base, service: { duracion_min: 60, buffer_min: 0 }, settings: { ...settings, slot_step_min: 0 } }));
  assert.deepEqual(t.slice(0, 3), ['08:00', '09:00', '10:00']);
});

test('helpers de fecha', () => {
  assert.equal(S.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(S.daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.equal(S.weekdayOf(MONDAY), 1);
  assert.equal(S.isValidDateStr('2026-02-30'), false);
  assert.equal(S.isValidDateStr('2026-02-28'), true);
});

test('zona horaria de Chile: verano (UTC-3) e invierno (UTC-4)', () => {
  assert.equal(S.localDate('2026-10-05', 8 * 60).toISOString(), '2026-10-05T11:00:00.000Z');
  assert.equal(S.localDate('2026-06-01', 8 * 60).toISOString(), '2026-06-01T12:00:00.000Z');
  assert.equal(S.dateStr(new Date('2026-10-06T02:30:00.000Z')), '2026-10-05'); // 23:30 del lunes en Chile
});

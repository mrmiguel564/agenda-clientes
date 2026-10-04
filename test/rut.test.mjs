import test from 'node:test';
import assert from 'node:assert/strict';
import Rut from '../public/js/rut.js';

test('calcula el dígito verificador', () => {
  assert.equal(Rut.computeDv('12345678'), '5');
  assert.equal(Rut.computeDv('10000013'), 'K');
  assert.equal(Rut.computeDv('10000004'), '0');
});

test('valida RUT con y sin formato', () => {
  assert.equal(Rut.validate('12.345.678-5'), true);
  assert.equal(Rut.validate('12345678-5'), true);
  assert.equal(Rut.validate('123456785'), true);
  assert.equal(Rut.validate('10.000.013-k'), true);
  assert.equal(Rut.validate('10000004-0'), true);
});

test('rechaza RUT inválidos', () => {
  assert.equal(Rut.validate('12.345.678-9'), false);
  assert.equal(Rut.validate(''), false);
  assert.equal(Rut.validate('abc'), false);
  assert.equal(Rut.validate('1-9'), false);
  assert.equal(Rut.validate('11.111.111-1'), false); // dígitos repetidos
  assert.equal(Rut.validate(null), false);
});

test('normaliza y formatea', () => {
  assert.equal(Rut.normalize('12.345.678-5'), '12345678-5');
  assert.equal(Rut.normalize('10000013k'), '10000013-K');
  assert.equal(Rut.format('123456785'), '12.345.678-5');
  assert.equal(Rut.format('1234567'), '123.456-7');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { migrateData } = require('../src/migrate');

function tmp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ectodo-mig-'));
  return { root, from: path.join(root, 'taskghost'), to: path.join(root, 'ectodo') };
}

test('copia los datos de la carpeta vieja a una nueva sin datos', () => {
  const { root, from, to } = tmp();
  fs.mkdirSync(from);
  fs.writeFileSync(path.join(from, 'state.json'), '{"a":1}');
  fs.writeFileSync(path.join(from, 'intervals.jsonl'), '{}\n');
  fs.mkdirSync(path.join(to, 'Cache'), { recursive: true }); // Chromium ya creo la carpeta: igual se migra
  assert.deepEqual(migrateData(from, to).sort(), ['intervals.jsonl', 'state.json']);
  assert.equal(fs.readFileSync(path.join(to, 'state.json'), 'utf8'), '{"a":1}');
  assert.ok(fs.existsSync(path.join(from, 'state.json')), 'la vieja queda de respaldo');
  fs.rmSync(root, { recursive: true });
});

test('no pisa datos que ya existen en la carpeta nueva', () => {
  const { root, from, to } = tmp();
  fs.mkdirSync(from);
  fs.mkdirSync(to);
  fs.writeFileSync(path.join(from, 'state.json'), 'viejo');
  fs.writeFileSync(path.join(to, 'config.json'), 'nuevo');
  assert.deepEqual(migrateData(from, to), []);
  assert.ok(!fs.existsSync(path.join(to, 'state.json')));
  fs.rmSync(root, { recursive: true });
});

test('sin carpeta vieja no hace nada', () => {
  const { root, from, to } = tmp();
  assert.deepEqual(migrateData(from, to), []);
  assert.ok(!fs.existsSync(to));
  fs.rmSync(root, { recursive: true });
});

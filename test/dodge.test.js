'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/dodge');

const WA = { x: 0, y: 0, width: 1920, height: 1040 };
const ZONE = { x: 1584, y: 16, width: 320, height: 80 }; // arriba a la derecha, como defaultPosition()
const IN = { x: 1700, y: 50 };
const OUT = { x: 900, y: 500 };

test('targetFor: de la derecha va al borde izquierdo a la misma altura, y viceversa', () => {
  assert.deepEqual(D.targetFor(ZONE, WA, 16), { x: 16, y: 16 });
  assert.deepEqual(D.targetFor({ x: 16, y: 300, width: 320, height: 80 }, WA, 16), { x: 1584, y: 300 });
});

test('targetFor: usa el area de trabajo de su pantalla (segundo monitor a la izquierda)', () => {
  const wa = { x: -1280, y: 0, width: 1280, height: 984 };
  assert.deepEqual(D.targetFor({ x: -336, y: 16, width: 320, height: 80 }, wa, 16), { x: -1264, y: 16 });
});

test('inRect: borde derecho/inferior excluido y margen opcional', () => {
  assert.ok(D.inRect({ x: 1584, y: 16 }, ZONE));
  assert.equal(D.inRect({ x: 1904, y: 50 }, ZONE), false);
  assert.ok(D.inRect({ x: 1910, y: 50 }, ZONE, 24));
});

test('frame: arranca en el origen, termina en el destino y nunca se pasa', () => {
  const from = { x: 1584, y: 16 };
  const to = { x: 16, y: 16 };
  assert.deepEqual(D.frame(from, to, 0), from);
  assert.deepEqual(D.frame(from, to, 1), to);
  assert.deepEqual(D.frame(from, to, 3), to);
  let prev = from.x;
  for (let t = 0.1; t <= 1; t += 0.1) { const x = D.frame(from, to, t).x; assert.ok(x <= prev); prev = x; }
});

test('se aparta solo si el cursor se queda DWELL_MS en la zona', () => {
  const d = D.createDodge();
  assert.equal(d.step(IN, ZONE, 0), null);
  assert.equal(d.step(IN, ZONE, D.DWELL_MS - 1), null);
  assert.equal(d.step(IN, ZONE, D.DWELL_MS), 'away');
  assert.ok(d.isAway());
  assert.equal(d.step(IN, ZONE, D.DWELL_MS + 80), null); // sigue apartado, sin repetir la orden
});

test('pasar de largo no lo mueve: salir reinicia la espera', () => {
  const d = D.createDodge();
  d.step(IN, ZONE, 0);
  d.step(OUT, ZONE, 80);
  assert.equal(d.step(IN, ZONE, 160), null);
  assert.equal(d.step(IN, ZONE, 200), null);
  assert.equal(d.step(IN, ZONE, 280), 'away');
});

test('vuelve recien cuando el cursor supera el margen de salida', () => {
  const d = D.createDodge();
  d.step(IN, ZONE, 0);
  d.step(IN, ZONE, 200);
  const edge = { x: ZONE.x - 10, y: 50 }; // fuera de la zona pero dentro del margen
  assert.equal(d.step(edge, ZONE, 300), null);
  assert.equal(d.step({ x: ZONE.x - D.EXIT_PAD - 1, y: 50 }, ZONE, 400), 'home');
  assert.equal(d.isAway(), false);
});

test('reset vuelve al estado inicial y descarta la espera en curso', () => {
  const d = D.createDodge();
  d.step(IN, ZONE, 0);
  d.reset();
  assert.equal(d.step(IN, ZONE, 200), null); // la espera empieza de nuevo
  d.step(IN, ZONE, 400);
  assert.ok(d.isAway());
  d.reset();
  assert.equal(d.isAway(), false);
});

test('desarmado (al cerrar el panel con el cursor encima) no se aparta hasta que el cursor salga una vez', () => {
  const d = D.createDodge();
  d.disarm();
  assert.equal(d.step(IN, ZONE, 0), null);
  assert.equal(d.step(IN, ZONE, 1000), null);
  d.step(OUT, ZONE, 1100);
  d.step(IN, ZONE, 1200);
  assert.equal(d.step(IN, ZONE, 1200 + D.DWELL_MS), 'away');
});

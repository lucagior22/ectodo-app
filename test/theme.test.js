'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/ui/theme');

test('isHex solo acepta #rrggbb', () => {
  assert.ok(T.isHex('#3dff7a'));
  assert.ok(T.isHex('#ABCDEF'));
  for (const bad of ['3dff7a', '#3dff7', '#3dff7aa', 'red', '', null, undefined, 12]) assert.equal(T.isHex(bad), false);
});

test('contrast: negro/blanco 21:1 y simetrico', () => {
  assert.ok(Math.abs(T.contrast('#000000', '#ffffff') - 21) < 0.01);
  assert.equal(T.contrast('#123456', '#fedcba'), T.contrast('#fedcba', '#123456'));
});

test('accentFor deja intacto un acento que ya contrasta', () => {
  assert.equal(T.accentFor('dark', '#3DFF7A'), '#3dff7a');
  assert.equal(T.accentFor('light', '#0a5a2a'), '#0a5a2a');
});

test('accentFor siempre garantiza 4.5:1 contra el fondo del tema, para cualquier color', () => {
  const colors = [...T.PRESETS.map((p) => p[1]), '#000000', '#ffffff', '#0000ff', '#ff0000', '#808080', '#123456', '#ffff00'];
  for (const theme of ['dark', 'light']) {
    for (const c of colors) {
      const a = T.accentFor(theme, c);
      assert.ok(T.contrast(a, T.BG[theme]) >= 4.5, `${theme} ${c} -> ${a} = ${T.contrast(a, T.BG[theme]).toFixed(2)}`);
    }
  }
});

test('accentFor: invalido cae al acento por defecto; en claro oscurece, en oscuro aclara', () => {
  assert.equal(T.accentFor('dark', 'nada'), T.accentFor('dark', T.DEFAULT_ACCENT));
  const light = T.accentFor('light', '#3dff7a');
  assert.ok(T.contrast(light, T.BG.light) >= 4.5);
  assert.notEqual(light, '#3dff7a');
  const dark = T.accentFor('dark', '#0000ff');
  assert.ok(T.contrast(dark, T.BG.dark) >= 4.5);
});

test('onAccent: blanco sobre el relleno si alcanza 3:1 (etiquetas semibold), si no el de mayor contraste', () => {
  for (const theme of ['dark', 'light']) {
    for (const [, c] of T.PRESETS) {
      const f = T.fillFor(theme, c);
      assert.ok(T.contrast(f, T.onAccent(f)) >= 3, `${theme} ${f}`);
    }
  }
  assert.equal(T.onAccent(T.fillFor('light', '#0088ff')), '#ffffff');
  assert.equal(T.onAccent('#ffd60a'), '#111113');
});

test('fillFor: los colores de sistema usan su variante del tema; uno propio queda igual', () => {
  assert.equal(T.fillFor('light', '#0088ff'), '#0088ff');
  assert.equal(T.fillFor('dark', '#0088ff'), '#0091ff');
  assert.equal(T.fillFor('light', '#0091FF'), '#0088ff');
  assert.equal(T.fillFor('dark', '#04ff00'), '#04ff00');
  assert.equal(T.fillFor('dark', 'nada'), T.fillFor('dark', T.DEFAULT_ACCENT));
});

test('apply escribe las variables CSS', () => {
  const vars = {};
  const el = { style: { setProperty: (k, v) => { vars[k] = v; } } };
  const a = T.apply(el, 'dark', '#ffb454');
  assert.equal(vars['--accent'], a);
  assert.equal(vars['--accent-text'], T.accentFor('dark', '#ffb454'));
  assert.match(vars['--accent-rgb'], /^\d+,\d+,\d+$/);
  assert.match(vars['--on-accent'], /^#[0-9a-f]{6}$/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/ui/stats');

const H = 3600 * 1000;

test('splitByDay no parte un tramo dentro del mismo dia', () => {
  const a = new Date(2026, 0, 10, 9).getTime();
  const segs = S.splitByDay(a, a + 2 * H);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].end - segs[0].start, 2 * H);
});

test('splitByDay parte un tramo que cruza medianoche', () => {
  const a = new Date(2026, 0, 10, 23).getTime();
  const b = new Date(2026, 0, 11, 2).getTime();
  const segs = S.splitByDay(a, b);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].end - segs[0].start, 1 * H);
  assert.equal(segs[1].end - segs[1].start, 2 * H);
  assert.equal(segs[1].day, new Date(2026, 0, 11).getTime());
});

test('msByDayProject agrupa por dia y proyecto', () => {
  const d1 = new Date(2026, 0, 10, 10).getTime();
  const d2 = new Date(2026, 0, 11, 10).getTime();
  const ivs = [
    { taskId: 'a', start: d1, end: d1 + H },
    { taskId: 'b', start: d1 + H, end: d1 + 3 * H },
    { taskId: 'a', start: d2, end: d2 + H },
  ];
  const out = S.msByDayProject(ivs, (id) => (id === 'a' ? 'web' : 'ops'));
  assert.equal(out[S.startOfDay(d1)].web, H);
  assert.equal(out[S.startOfDay(d1)].ops, 2 * H);
  assert.equal(S.sumMs(out[S.startOfDay(d2)]), H);
});

test('weekStart devuelve el lunes', () => {
  const sunday = new Date(2026, 0, 11, 15).getTime();
  assert.equal(new Date(S.weekStart(sunday)).getDay(), 1);
  assert.equal(S.weekStart(sunday), new Date(2026, 0, 5).getTime());
});

test('dur formatea minutos y horas', () => {
  assert.equal(S.dur(0), '0m');
  assert.equal(S.dur(45 * 60000), '45m');
  assert.equal(S.dur(65 * 60000), '1h 05m');
});

test('human escribe duraciones como una persona', () => {
  assert.equal(S.human(0), '0 min');
  assert.equal(S.human(-5), '0 min');
  assert.equal(S.human(45 * 1000), '45 s');
  assert.equal(S.human(59.7 * 1000), '1 min');
  assert.equal(S.human(60 * 1000), '1 min');
  assert.equal(S.human(42 * 60000), '42 min');
  assert.equal(S.human(59 * 60000 + 40000), '1 h');
  assert.equal(S.human(60 * 60000), '1 h');
  assert.equal(S.human(72 * 60000), '1 h 12 min');
  assert.equal(S.human(3 * H), '3 h');
  assert.equal(S.human(10 * H + 5 * 60000), '10 h 5 min');
});

test('humanParts da numero y unidad por separado', () => {
  assert.deepEqual(S.humanParts(174 * 60000), [[2, 'h'], [54, 'min']]);
  assert.deepEqual(S.humanParts(0), [[0, 'min']]);
  assert.deepEqual(S.humanParts(3 * H), [[3, 'h']]);
});

test('clock: m:ss y h:mm:ss sin ceros a la izquierda en las horas', () => {
  assert.equal(S.clock(0), '0:00');
  assert.equal(S.clock(5000), '0:05');
  assert.equal(S.clock(42 * 60000 + 5000), '42:05');
  assert.equal(S.clock(H + 2 * 60000 + 5000), '1:02:05');
  assert.equal(S.clock(10 * H), '10:00:00');
  assert.equal(S.clock(-1), '0:00');
});

test('avgDaily promedia los dias anteriores sin contar hoy', () => {
  const today = S.startOfDay(new Date(2026, 9, 1, 15).getTime());
  assert.equal(S.avgDaily({}, today), 0);
  // solo hoy: sin historial
  assert.equal(S.avgDaily({ [today]: 5 * H }, today), 0);
  // 7 dias anteriores completos: 1h..7h -> 4h
  const full = {};
  for (let i = 1; i <= 7; i++) full[S.addDays(today, -i)] = i * H;
  assert.equal(S.avgDaily(full, today), 4 * H);
  // un dia mas viejo que la ventana no cuenta
  full[S.addDays(today, -8)] = 100 * H;
  assert.equal(S.avgDaily(full, today), 4 * H);
  // quien empezo ayer: promedio de un dia, no de siete
  assert.equal(S.avgDaily({ [S.addDays(today, -1)]: 2 * H }, today), 2 * H);
  // desde hace 3 dias, con un hueco: 3 dias en el divisor
  assert.equal(S.avgDaily({ [S.addDays(today, -3)]: 3 * H, [S.addDays(today, -1)]: 3 * H }, today), 2 * H);
  // acepta el mapa por proyecto de msByDayProject
  assert.equal(S.avgDaily({ [S.addDays(today, -1)]: { a: H, b: 2 * H } }, today), 3 * H);
});

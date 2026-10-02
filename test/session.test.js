'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, parseTitle } = require('../src/session');

const S = 1000;
const MIN = 60 * S;
const T0 = 1_000_000_000_000;

function make(opts) {
  const intervals = [];
  const sessions = [];
  const discards = [];
  const e = new Engine({}, [], {
    onInterval: (iv) => intervals.push(iv),
    onSession: (r) => sessions.push(r),
    onDiscard: (id) => discards.push(id),
  }, opts);
  return { e, intervals, sessions, discards };
}

test('parseTitle extrae #proyecto y limpia el titulo', () => {
  assert.deepEqual(parseTitle('arreglar login #Ectodo'), { title: 'arreglar login', project: 'ectodo' });
  assert.deepEqual(parseTitle('#web hacer deploy'), { title: 'hacer deploy', project: 'web' });
  assert.deepEqual(parseTitle('  sin tag  '), { title: 'sin tag', project: null });
  assert.deepEqual(parseTitle('issue#12 no es tag'), { title: 'issue#12 no es tag', project: null });
  assert.equal(parseTitle('#solo').title, '');
});

test('addTask crea proyecto con color y rechaza titulos vacios', () => {
  const { e } = make();
  assert.equal(e.addTask('   ', T0), null);
  assert.equal(e.addTask('#solo', T0), null);
  const t = e.addTask('hacer algo #work', T0);
  assert.equal(t.project, 'work');
  assert.equal(e.projects.length, 1);
  assert.match(e.projects[0].color, /^#[0-9a-f]{6}$/i);
  e.addTask('otra #work', T0);
  assert.equal(e.projects.length, 1);
});

test('la primera tarea queda activa y la sesion abre un intervalo', () => {
  const { e, intervals } = make();
  const a = e.addTask('A', T0);
  assert.equal(e.activeTaskId, a.id);
  e.startSession(T0);
  e.pause(T0 + 10 * MIN);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].end - intervals[0].start, 10 * MIN);
  assert.equal(e.totals[a.id], 10 * MIN);
});

test('los timers no cuentan el tiempo en pausa', () => {
  const { e } = make();
  e.addTask('A', T0);
  e.startSession(T0);
  e.pause(T0 + 10 * MIN);
  assert.equal(e.sessionMs(T0 + 50 * MIN), 10 * MIN);
  e.resume(T0 + 60 * MIN);
  assert.equal(e.sessionMs(T0 + 65 * MIN), 15 * MIN);
  const snap = e.snapshot(T0 + 65 * MIN);
  assert.equal(snap.taskMs[e.activeTaskId], 15 * MIN);
  assert.equal(snap.session.pauses, 1);
});

test('cambiar de tarea cierra el intervalo y reparte el tiempo', () => {
  const { e, intervals } = make();
  const a = e.addTask('A', T0);
  const b = e.addTask('B', T0);
  e.startSession(T0);
  e.setActive(b.id, T0 + 5 * MIN);
  e.pause(T0 + 12 * MIN);
  assert.equal(e.totals[a.id], 5 * MIN);
  assert.equal(e.totals[b.id], 7 * MIN);
  assert.deepEqual(intervals.map((i) => i.taskId), [a.id, b.id]);
});

test('completar la tarea activa pasa a la siguiente y sigue contando', () => {
  const { e } = make();
  const a = e.addTask('A', T0);
  const b = e.addTask('B', T0);
  const c = e.addTask('C', T0);
  e.startSession(T0);
  e.completeCurrent(T0 + 3 * MIN);
  assert.equal(e.activeTaskId, b.id);
  e.completeTask(b.id, T0 + 4 * MIN);
  assert.equal(e.activeTaskId, c.id);
  e.completeCurrent(T0 + 5 * MIN);
  assert.equal(e.activeTaskId, null);
  assert.equal(e.totals[a.id], 3 * MIN);
  assert.equal(e.totals[b.id], 1 * MIN);
  assert.equal(e.snapshot(T0 + 9 * MIN).open, null);
});

test('completar vuelve a la primera abierta dando la vuelta a la lista', () => {
  const { e } = make();
  const a = e.addTask('A', T0);
  e.addTask('B', T0);
  const c = e.addTask('C', T0);
  e.startSession(T0);
  e.setActive(c.id, T0 + MIN);
  e.completeCurrent(T0 + 2 * MIN);
  assert.equal(e.activeTaskId, a.id);
});

test('tareas agregadas con la sesion corriendo y sin activa se activan', () => {
  const { e } = make();
  const a = e.addTask('A', T0);
  e.startSession(T0);
  e.completeCurrent(T0 + MIN);
  assert.equal(e.activeTaskId, null);
  const b = e.addTask('B', T0 + 2 * MIN);
  assert.equal(e.activeTaskId, b.id);
  e.pause(T0 + 5 * MIN);
  assert.equal(e.totals[b.id], 3 * MIN);
  assert.equal(e.totals[a.id], 1 * MIN);
});

test('endSession archiva hechas, registra la sesion y limpia el estado', () => {
  const { e, sessions } = make();
  const a = e.addTask('A', T0);
  const b = e.addTask('B', T0);
  e.startSession(T0);
  e.completeCurrent(T0 + 10 * MIN);
  const rec = e.endSession(T0 + 25 * MIN);
  assert.equal(e.session, null);
  assert.equal(rec.duration, 25 * MIN);
  assert.deepEqual(rec.tasks, { [a.id]: 10 * MIN, [b.id]: 15 * MIN });
  assert.equal(sessions.length, 1);
  assert.equal(e.tasks.find((t) => t.id === a.id).archived, true);
  assert.equal(e.tasks.find((t) => t.id === b.id).archived, false);
});

test('endSession estando pausada no suma tiempo extra', () => {
  const { e } = make();
  const a = e.addTask('A', T0);
  e.addTask('B', T0);
  e.startSession(T0);
  e.completeTask(a.id, T0 + 4 * MIN);
  e.pause(T0 + 10 * MIN);
  const rec = e.endSession(T0 + 90 * MIN);
  assert.equal(rec.duration, 10 * MIN);
  assert.equal(rec.pauses, 1);
});

test('tramos de menos de 1s se descartan', () => {
  const { e, intervals } = make();
  const a = e.addTask('A', T0);
  const b = e.addTask('B', T0);
  e.startSession(T0);
  e.setActive(b.id, T0 + 300);
  e.pause(T0 + 10 * S);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].taskId, b.id);
  assert.equal(e.totals[a.id], undefined);
});

test('eliminar la tarea activa pasa a otra; eliminar la unica deja sin activa', () => {
  const { e } = make();
  const a = e.addTask('A', T0);
  const b = e.addTask('B', T0);
  e.startSession(T0);
  e.deleteTask(a.id, T0 + MIN);
  assert.equal(e.activeTaskId, b.id);
  e.deleteTask(b.id, T0 + 2 * MIN);
  assert.equal(e.activeTaskId, null);
  assert.equal(e.tasks.length, 0);
  assert.equal(e.session.taskStart, null);
});

test('reabrir una tarea hecha la saca del archivo', () => {
  const { e } = make({ minSessionMs: 0 });
  const a = e.addTask('A', T0);
  e.startSession(T0);
  e.completeCurrent(T0 + MIN);
  e.endSession(T0 + 2 * MIN);
  assert.equal(a.archived, true);
  e.reopenTask(a.id, T0 + 3 * MIN);
  assert.equal(a.done, false);
  assert.equal(a.archived, false);
});

test('moveTask intercambia dentro del grupo abierto/hecho', () => {
  const { e } = make();
  const a = e.addTask('A', T0);
  const b = e.addTask('B', T0);
  const c = e.addTask('C', T0);
  e.completeTask(b.id, T0);
  e.moveTask(c.id, -1);
  assert.deepEqual(e.tasks.map((t) => t.title), ['C', 'B', 'A']);
  e.moveTask(c.id, -1);
  assert.deepEqual(e.tasks.map((t) => t.title), ['C', 'B', 'A']);
});

test('updateTask con #tag cambia proyecto; titulo vacio se ignora', () => {
  const { e } = make();
  const a = e.addTask('A', T0);
  e.updateTask(a.id, { title: 'Nuevo #foo' }, T0);
  assert.equal(a.title, 'Nuevo');
  assert.equal(a.project, 'foo');
  e.updateTask(a.id, { title: '   ' }, T0);
  assert.equal(a.title, 'Nuevo');
  e.updateTask(a.id, { project: '' }, T0);
  assert.equal(a.project, null);
});

test('setProjectColor valida el formato', () => {
  const { e } = make();
  e.addTask('A #x', T0);
  e.setProjectColor('x', '#112233');
  assert.equal(e.projects[0].color, '#112233');
  e.setProjectColor('x', 'rojo');
  assert.equal(e.projects[0].color, '#112233');
});

test('el estado sobrevive a un ciclo JSON (persistencia)', () => {
  const { e } = make();
  e.addTask('A #x', T0);
  e.startSession(T0);
  const restored = new Engine(JSON.parse(JSON.stringify(e.toJSON())), []);
  restored.pause(T0 + 5 * MIN);
  assert.equal(restored.sessionMs(T0 + 9 * MIN), 5 * MIN);
  assert.equal(restored.totals[restored.activeTaskId], 5 * MIN);
});

// ---------- descarte de sesiones ----------

test('una sesion demasiado corta no se guarda, ni sus tramos', () => {
  const { e, sessions, discards } = make();
  const a = e.addTask('A', T0);
  e.addTask('B', T0);
  e.startSession(T0);
  e.completeCurrent(T0 + 2 * MIN);
  assert.match(e.discardReason(T0 + 3 * MIN), /menos de 5 min/);
  const res = e.endSession(T0 + 3 * MIN);
  assert.equal(res.discarded, true);
  assert.equal(sessions.length, 0);
  assert.equal(discards.length, 1);
  assert.equal(e.session, null);
  assert.equal(e.intervals.length, 0);
  assert.equal(e.totals[a.id], 0);
});

test('una sesion larga sin tareas completadas no se guarda', () => {
  const { e, sessions } = make();
  e.addTask('A', T0);
  e.startSession(T0);
  assert.match(e.discardReason(T0 + 60 * MIN), /ninguna tarea/);
  const res = e.endSession(T0 + 60 * MIN);
  assert.equal(res.discarded, true);
  assert.equal(sessions.length, 0);
  assert.equal(e.intervals.length, 0);
});

test('larga y con una tarea completada se guarda', () => {
  const { e, sessions } = make();
  e.addTask('A', T0);
  e.startSession(T0);
  e.completeCurrent(T0 + 20 * MIN);
  assert.equal(e.discardReason(T0 + 30 * MIN), null);
  const rec = e.endSession(T0 + 30 * MIN);
  assert.equal(rec.discarded, undefined);
  assert.equal(rec.completed, 1);
  assert.equal(sessions.length, 1);
  assert.equal(e.intervals.length, 1);
});

test('reabrir la unica tarea completada vuelve a dejar la sesion descartable', () => {
  const { e } = make();
  const a = e.addTask('A', T0);
  e.startSession(T0);
  e.completeTask(a.id, T0 + 10 * MIN);
  assert.equal(e.discardReason(T0 + 20 * MIN), null);
  e.reopenTask(a.id, T0 + 11 * MIN);
  assert.match(e.discardReason(T0 + 20 * MIN), /ninguna tarea/);
});

test('descartar una sesion no toca los tramos de sesiones anteriores', () => {
  const first = make({ minSessionMs: 0 });
  const a = first.e.addTask('A', T0);
  first.e.startSession(T0);
  first.e.completeCurrent(T0 + 10 * MIN);
  first.e.endSession(T0 + 10 * MIN);
  first.e.reopenTask(a.id, T0 + 20 * MIN);

  const e2 = new Engine(first.e.toJSON(), first.e.intervals, {}, { minSessionMs: 10 * MIN });
  e2.startSession(T0 + 30 * MIN);
  e2.pause(T0 + 33 * MIN);
  const res = e2.endSession(T0 + 34 * MIN);
  assert.equal(res.discarded, true);
  assert.equal(e2.intervals.length, 1);
  assert.equal(e2.totals[a.id], 10 * MIN);
});

test('los minimos son configurables', () => {
  const { e, sessions } = make({ minSessionMs: 0, requireCompleted: false });
  e.addTask('A', T0);
  e.startSession(T0);
  const rec = e.endSession(T0 + 5 * S);
  assert.equal(rec.discarded, undefined);
  assert.equal(sessions.length, 1);
});

// ---------- una sesion, un proyecto ----------

test('la sesion queda fijada al proyecto de la tarea activa', () => {
  const { e } = make();
  e.addTask('A #web', T0);
  e.addTask('B #ops', T0);
  e.startSession(T0);
  assert.equal(e.session.project, 'web');
  assert.equal(e.snapshot(T0).session.project, 'web');
});

test('startSession con taskId fija ese proyecto y activa esa tarea', () => {
  const { e } = make();
  e.addTask('A #web', T0);
  const b = e.addTask('B #ops', T0);
  e.startSession(T0, b.id);
  assert.equal(e.session.project, 'ops');
  assert.equal(e.activeTaskId, b.id);
});

test('tareas sin proyecto forman su propio grupo', () => {
  const { e } = make();
  const a = e.addTask('A', T0);
  const b = e.addTask('B #web', T0);
  e.startSession(T0);
  assert.equal(e.session.project, null);
  e.setActive(b.id, T0 + MIN);
  assert.equal(e.activeTaskId, a.id);
});

test('no se puede activar una tarea de otro proyecto durante la sesion', () => {
  const { e } = make();
  const a = e.addTask('A #web', T0);
  const b = e.addTask('B #ops', T0);
  e.startSession(T0);
  e.setActive(b.id, T0 + MIN);
  assert.equal(e.activeTaskId, a.id);
  e.pause(T0 + 2 * MIN);
  assert.equal(e.totals[b.id], undefined);
});

test('al completar, salta solo a tareas del mismo proyecto', () => {
  const { e } = make();
  const a = e.addTask('A #web', T0);
  e.addTask('X #ops', T0);
  const c = e.addTask('C #web', T0);
  e.startSession(T0);
  e.completeTask(a.id, T0 + MIN);
  assert.equal(e.activeTaskId, c.id);
  e.completeTask(c.id, T0 + 2 * MIN);
  assert.equal(e.activeTaskId, null);
});

test('una tarea nueva sin tag hereda el proyecto de la sesion; un tag explicito manda', () => {
  const { e } = make();
  e.addTask('A #web', T0);
  e.startSession(T0);
  assert.equal(e.addTask('B', T0 + MIN).project, 'web');
  assert.equal(e.addTask('C #ops', T0 + MIN).project, 'ops');
  assert.equal(e.addTask('D', T0, null).project, null);
  assert.equal(e.addTask('E', T0, 'Docs').project, 'docs');
});

test('sin sesion, una tarea sin tag queda sin proyecto', () => {
  const { e } = make();
  assert.equal(e.addTask('A', T0).project, null);
});

test('si la tarea activa cambia de proyecto, la sesion pasa a otra del suyo', () => {
  const { e } = make();
  const a = e.addTask('A #web', T0);
  const b = e.addTask('B #web', T0);
  e.startSession(T0);
  e.updateTask(a.id, { project: 'ops' }, T0 + 3 * MIN);
  assert.equal(e.activeTaskId, b.id);
  assert.equal(e.totals[a.id], 3 * MIN);
});

test('sin tareas abiertas no se puede iniciar sesion', () => {
  const { e } = make();
  assert.equal(e.startSession(T0), false);
  assert.equal(e.session, null);
  const a = e.addTask('A', T0);
  e.completeTask(a.id, T0);
  assert.equal(e.startSession(T0), false);
});

test('una sesion con formato viejo (sin project) no restringe', () => {
  const { e } = make();
  e.addTask('A #web', T0);
  const b = e.addTask('B #ops', T0);
  e.startSession(T0);
  delete e.session.project;
  e.setActive(b.id, T0 + MIN);
  assert.equal(e.activeTaskId, b.id);
});

// ---- deshacer y ciclar tarea activa ----

test('undo revierte agregar, completar, borrar, mover y limpiar; no toca el tiempo', () => {
  const { e, intervals } = make({ minSessionMs: 0, requireCompleted: false });
  const a = e.addTask('a', T0);
  const b = e.addTask('b', T0);
  assert.equal(e.snapshot(T0).undo, 2);
  assert.ok(e.undo(T0)); // deshace "b"
  assert.deepEqual(e.tasks.map((t) => t.title), ['a']);
  assert.ok(e.undo(T0)); // deshace "a"
  assert.equal(e.tasks.length, 0);
  assert.equal(e.activeTaskId, null);
  assert.equal(e.undo(T0), false);

  const x = e.addTask('x', T0);
  const y = e.addTask('y', T0);
  e.startSession(T0);
  e.completeCurrent(T0 + 5 * MIN); // x hecha, pasa a y
  assert.equal(e.activeTaskId, y.id);
  assert.ok(e.undo(T0 + 6 * MIN));
  assert.equal(e.tasks.find((t) => t.id === x.id).done, false);
  assert.equal(e.activeTaskId, x.id);
  assert.equal(e.session.completed.length, 0);
  // lo trabajado sigue registrado aunque se deshaga la accion: 5 min en x y el minuto que estuvo activa y
  assert.equal(intervals.length, 2);
  assert.equal(e.totals[x.id], 5 * MIN);
  assert.equal(e.totals[y.id], MIN);

  e.deleteTask(y.id, T0 + 7 * MIN);
  assert.equal(e.tasks.length, 1);
  e.undo(T0 + 7 * MIN);
  assert.deepEqual(e.tasks.map((t) => t.title), ['x', 'y']);

  e.moveTask(y.id, -1);
  assert.deepEqual(e.tasks.map((t) => t.title), ['y', 'x']);
  e.undo(T0 + 8 * MIN);
  assert.deepEqual(e.tasks.map((t) => t.title), ['x', 'y']);
});

test('undo sigue contando en la tarea activa restaurada', () => {
  const { e, intervals } = make({ minSessionMs: 0, requireCompleted: false });
  const a = e.addTask('a', T0);
  e.addTask('b', T0);
  e.startSession(T0);
  e.completeCurrent(T0 + 10 * MIN); // a hecha, activa b
  e.undo(T0 + 12 * MIN); // vuelve a activa a; los 2 min de b quedan registrados
  e.pause(T0 + 15 * MIN);
  const ofA = intervals.filter((i) => i.taskId === a.id).reduce((s, i) => s + i.end - i.start, 0);
  assert.equal(ofA, 10 * MIN + 3 * MIN);
});

test('no se apilan acciones que no cambian nada', () => {
  const { e } = make();
  e.addTask('a', T0);
  const n = e.snapshot(T0).undo;
  e.deleteTask('no-existe', T0);
  e.clearDone();
  e.moveTask('no-existe', 1);
  assert.equal(e.snapshot(T0).undo, n);
});

test('iniciar o terminar sesion limpia la pila de deshacer', () => {
  const { e } = make({ minSessionMs: 0, requireCompleted: false });
  e.addTask('a', T0);
  assert.equal(e.snapshot(T0).undo, 1);
  e.startSession(T0);
  assert.equal(e.snapshot(T0).undo, 0);
  e.addTask('b', T0);
  e.endSession(T0 + MIN);
  assert.equal(e.snapshot(T0).undo, 0);
  assert.equal(e.undo(T0), false);
});

test('cycleActive recorre las abiertas dando la vuelta y respeta el proyecto de la sesion', () => {
  const { e } = make();
  const a = e.addTask('a #w', T0);
  const b = e.addTask('b #w', T0);
  const c = e.addTask('c #w', T0);
  e.addTask('z #otro', T0);
  e.completeTask(b.id, T0);
  e.cycleActive(1, T0);
  assert.equal(e.activeTaskId, c.id);
  e.cycleActive(1, T0);
  assert.equal(e.activeTaskId, e.tasks.find((t) => t.title === 'z').id);
  e.startSession(T0, a.id); // fija el proyecto "w": "z" queda fuera
  assert.equal(e.activeTaskId, a.id);
  e.cycleActive(1, T0);
  assert.equal(e.activeTaskId, c.id);
  e.cycleActive(1, T0); // da la vuelta y se salta "z"
  assert.equal(e.activeTaskId, a.id);
  e.cycleActive(-1, T0);
  assert.equal(e.activeTaskId, c.id);
});

// ---------- proyecto del widget ----------

test('con proyecto elegido, las tareas sin tag van a ese proyecto', () => {
  const { e } = make();
  e.setProject('Web', T0);
  assert.equal(e.project, 'web');
  assert.equal(e.addTask('A', T0).project, 'web');
  assert.equal(e.addTask('B #ops', T0).project, 'ops');
  assert.equal(e.addTask('C', T0, null).project, null);
});

test('cambiar de proyecto activa una tarea del nuevo; iniciar usa solo tareas del proyecto', () => {
  const { e } = make();
  e.addTask('A #web', T0);
  const b = e.addTask('B #ops', T0);
  e.setProject('ops', T0);
  assert.equal(e.activeTaskId, b.id);
  assert.ok(e.startSession(T0));
  assert.equal(e.session.project, 'ops');
});

test('sin tareas abiertas en el proyecto no se inicia sesion', () => {
  const { e } = make();
  e.addTask('A #web', T0);
  e.setProject('ops', T0);
  assert.equal(e.activeTaskId, null);
  assert.equal(e.startSession(T0), false);
});

test('no se cambia de proyecto con una sesion en curso', () => {
  const { e } = make();
  e.setProject('web', T0);
  e.addTask('A', T0);
  e.startSession(T0);
  assert.equal(e.setProject('ops', T0), false);
  assert.equal(e.project, 'web');
});

test('sin sesion, activar o iniciar con una tarea de otro proyecto lleva el widget a ese proyecto', () => {
  const { e } = make();
  e.setProject('web', T0);
  e.addTask('A', T0);
  const b = e.addTask('B #ops', T0);
  e.setActive(b.id, T0);
  assert.equal(e.project, 'ops');
  assert.equal(e.activeTaskId, b.id);
  const c = e.addTask('C #doc', T0);
  e.startSession(T0, c.id);
  assert.equal(e.project, 'doc');
  assert.equal(e.session.project, 'doc');
});

test('el proyecto del widget se persiste y cambiarlo se puede deshacer', () => {
  const { e } = make();
  e.setProject('web', T0);
  e.setProject('ops', T0);
  assert.equal(JSON.parse(JSON.stringify(e)).project, 'ops');
  e.undo(T0);
  assert.equal(e.project, 'web');
});

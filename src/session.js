'use strict';

// Logica pura de sesion/tareas/proyectos. Sin Electron, sin I/O: todo recibe `now`.

const PALETTE = ['#6ea8fe', '#7ee0a3', '#f7b267', '#f28482', '#c39bf7', '#5ed0d8', '#f4d35e', '#ff9ecd'];
const DEFAULT_OPTS = { minSessionMs: 5 * 60 * 1000, requireCompleted: true };
const noop = () => {};
let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_-]+)/u;
const TAG_RE_ALL = /(?:^|\s)#[\p{L}\p{N}_-]+/gu;

// "arreglar login #ectodo" -> { title: "arreglar login", project: "ectodo" }
function parseTitle(raw) {
  const str = String(raw == null ? '' : raw);
  const m = str.match(TAG_RE);
  return {
    title: str.replace(TAG_RE_ALL, ' ').replace(/\s+/g, ' ').trim(),
    project: m ? m[1].toLowerCase() : null,
  };
}

const normProject = (p) => (p ? String(p).trim().toLowerCase() : null) || null;

class Engine {
  constructor(data = {}, intervals = [], hooks = {}, opts = {}) {
    this.tasks = data.tasks || [];
    this.projects = data.projects || [];
    this.activeTaskId = data.activeTaskId || null;
    this.session = data.session || null;
    // Proyecto del widget: todo se trabaja en uno solo. undefined = sin elegir (no restringe).
    this.project = data.project;
    this.intervals = intervals;
    this.opts = { ...DEFAULT_OPTS, ...opts };
    this.onInterval = hooks.onInterval || noop;
    this.onSession = hooks.onSession || noop;
    this.onDiscard = hooks.onDiscard || noop;
    this._undo = [];
    this._txDepth = 0;
    this.totals = {};
    for (const iv of intervals) this.totals[iv.taskId] = (this.totals[iv.taskId] || 0) + (iv.end - iv.start);
  }

  toJSON() {
    return { tasks: this.tasks, projects: this.projects, activeTaskId: this.activeTaskId, session: this.session, project: this.project };
  }

  // ---- deshacer: solo la lista de tareas; el tiempo ya trabajado nunca se revierte ----

  _capture() {
    const s = this.session;
    return JSON.stringify({
      tasks: this.tasks, projects: this.projects, activeTaskId: this.activeTaskId, project: this.project,
      completed: s ? (s.completed || []) : null,
    });
  }

  // Ejecuta una accion deshacible; apila el estado previo solo si algo cambio.
  _tx(fn) {
    if (this._txDepth) return fn();
    const before = this._capture();
    this._txDepth++;
    try { return fn(); } finally {
      this._txDepth--;
      if (this._capture() !== before) {
        this._undo.push(before);
        if (this._undo.length > 50) this._undo.shift();
      }
    }
  }

  undo(now) {
    const prev = this._undo.pop();
    if (!prev) return false;
    const st = JSON.parse(prev);
    this._closeInterval(now);
    this.tasks = st.tasks;
    this.projects = st.projects;
    this.activeTaskId = st.activeTaskId;
    if (!this.session) this.project = st.project;
    if (this.session && st.completed) this.session.completed = st.completed;
    this._openInterval(now);
    return true;
  }

  // ---- intervalos (tramos trabajados) ----

  _openInterval(now) {
    const s = this.session;
    if (s && s.status === 'running' && this.activeTaskId) s.taskStart = now;
  }

  _closeInterval(now) {
    const s = this.session;
    if (!s || s.taskStart == null) return;
    const ms = now - s.taskStart;
    if (this.activeTaskId && ms >= 1000) {
      const iv = { id: uid(), taskId: this.activeTaskId, sessionId: s.id, start: s.taskStart, end: now };
      this.intervals.push(iv);
      this.totals[iv.taskId] = (this.totals[iv.taskId] || 0) + ms;
      s.taskMs[iv.taskId] = (s.taskMs[iv.taskId] || 0) + ms;
      this.onInterval(iv);
    }
    s.taskStart = null;
  }

  // ---- alcance de proyecto: el widget (y la sesion) trabajan en un solo proyecto ----

  // El de la sesion en curso, si no el del widget. undefined = sin restriccion (formato viejo / sin elegir).
  scope() {
    const s = this.session;
    return s ? s.project : this.project;
  }

  _inScope(t) {
    const p = this.scope();
    return p === undefined || (t.project || null) === p;
  }

  // Cambia el proyecto del widget ('' / null = sin proyecto). No se puede con una sesion en curso.
  setProject(name, now) {
    if (this.session) return false;
    this._tx(() => {
      this.project = normProject(name);
      this._ensureProject(this.project);
      this._ensureActiveInScope(now);
      if (!this._get(this.activeTaskId)) this.activeTaskId = this._nextOpen(null);
    });
    return true;
  }

  _ensureActiveInScope(now) {
    const a = this._get(this.activeTaskId);
    if (!a || this._inScope(a)) return;
    this._closeInterval(now);
    this.activeTaskId = this._nextOpen(null);
    this._openInterval(now);
  }

  // ---- sesion ----

  // Arranca una sesion. El proyecto queda fijado por la tarea con la que se empieza
  // (`taskId` si es valida, y el widget pasa a su proyecto; si no, la activa; si no, la primera abierta
  // del proyecto del widget). Sin tareas abiertas no inicia.
  startSession(now, taskId) {
    if (this.session) return false;
    const valid = (t) => t && !t.done && !t.archived;
    const inScope = (t) => valid(t) && this._inScope(t);
    const pick = this._get(taskId);
    const cand = valid(pick) ? pick : [this._get(this.activeTaskId)].find(inScope) || this.tasks.find(inScope);
    if (!cand) return false;
    if (this.project !== undefined) this.project = cand.project || null;
    this.session = {
      id: uid(), startedAt: now, status: 'running', segStart: now, accumulated: 0, pauses: 0,
      taskStart: null, taskMs: {}, project: cand.project || null, completed: [],
    };
    this.activeTaskId = cand.id;
    this._undo = [];
    this._openInterval(now);
    return true;
  }

  pause(now) {
    const s = this.session;
    if (!s || s.status !== 'running') return;
    this._closeInterval(now);
    s.accumulated += now - s.segStart;
    s.segStart = null;
    s.status = 'paused';
    s.pauses += 1;
  }

  resume(now) {
    const s = this.session;
    if (!s || s.status !== 'paused') return;
    s.status = 'running';
    s.segStart = now;
    this._openInterval(now);
  }

  // Motivo por el que la sesion NO se guardaria si terminara ahora (o null si se guarda).
  discardReason(now) {
    const s = this.session;
    if (!s) return null;
    if (this.sessionMs(now) < this.opts.minSessionMs) {
      return `dura menos de ${Math.round(this.opts.minSessionMs / 60000)} min`;
    }
    if (this.opts.requireCompleted && !(s.completed || []).length) return 'no se completó ninguna tarea';
    return null;
  }

  // Devuelve el registro guardado, o { discarded: true, reason } si la sesion no cumple los minimos.
  endSession(now) {
    const s = this.session;
    if (!s) return null;
    this._undo = [];
    const reason = this.discardReason(now);
    if (reason) {
      // Se descarta todo: tramos de esta sesion incluidos, asi no ensucian totales ni graficos.
      for (const iv of this.intervals) {
        if (iv.sessionId === s.id) this.totals[iv.taskId] = (this.totals[iv.taskId] || 0) - (iv.end - iv.start);
      }
      this.intervals = this.intervals.filter((iv) => iv.sessionId !== s.id);
      this.session = null;
      this.onDiscard(s.id, this.intervals);
      return { discarded: true, reason };
    }
    this._closeInterval(now);
    if (s.status === 'running') s.accumulated += now - s.segStart;
    const record = {
      id: s.id, startedAt: s.startedAt, endedAt: now, duration: s.accumulated, pauses: s.pauses,
      project: s.project === undefined ? null : s.project, completed: (s.completed || []).length, tasks: s.taskMs,
    };
    for (const t of this.tasks) if (t.done) t.archived = true;
    this.session = null;
    this.onSession(record);
    return record;
  }

  // ---- tareas ----

  _get(id) {
    return id ? this.tasks.find((t) => t.id === id) || null : null;
  }

  // Siguiente tarea abierta (dentro del proyecto de la sesion) despues de `afterId`, dando la vuelta.
  _nextOpen(afterId) {
    const open = (t) => !t.done && !t.archived && this._inScope(t);
    const idx = afterId ? this.tasks.findIndex((t) => t.id === afterId) : -1;
    const next = this.tasks.find((t, i) => i > idx && open(t)) || this.tasks.find(open);
    return next ? next.id : null;
  }

  _ensureProject(name) {
    if (name && !this.projects.some((p) => p.name === name)) {
      this.projects.push({ name, color: PALETTE[this.projects.length % PALETTE.length] });
    }
  }

  // `defaultProject`: undefined = heredar el de la sesion o el del widget; null/'' = sin proyecto; 'x' = proyecto x.
  // Un #tag en el texto siempre manda.
  addTask(raw, now, defaultProject) {
    return this._tx(() => this._addTask(raw, now, defaultProject));
  }

  _addTask(raw, now, defaultProject) {
    const parsed = parseTitle(raw);
    if (!parsed.title) return null;
    let project = parsed.project;
    if (project == null) {
      if (defaultProject !== undefined) project = normProject(defaultProject);
      else if (this.scope() !== undefined) project = this.scope();
    }
    this._ensureProject(project);
    const task = { id: uid(), title: parsed.title, project: project || null, done: false, archived: false, createdAt: now, doneAt: null };
    this.tasks.push(task);
    if (!this._get(this.activeTaskId) && this._inScope(task)) {
      this.activeTaskId = task.id;
      this._openInterval(now);
    }
    return task;
  }

  updateTask(id, patch, now) {
    const t = this._get(id);
    if (!t) return;
    if ('title' in patch) {
      const p = parseTitle(patch.title);
      if (p.title) t.title = p.title;
      if (p.project) t.project = p.project;
    }
    if ('project' in patch) t.project = normProject(patch.project);
    this._ensureProject(t.project);
    this._ensureActiveInScope(now);
  }

  // Sin sesion, activar una tarea de otro proyecto lleva el widget a ese proyecto.
  setActive(id, now) {
    const t = this._get(id);
    if (!t || t.done || t.archived || id === this.activeTaskId) return;
    if (!this._inScope(t)) {
      if (this.session) return;
      this.project = t.project || null;
    }
    this._closeInterval(now);
    this.activeTaskId = id;
    this._openInterval(now);
  }

  completeTask(id, now) {
    this._tx(() => this._completeTask(id, now));
  }

  _completeTask(id, now) {
    const t = this._get(id);
    if (!t || t.done) return;
    const wasActive = id === this.activeTaskId;
    if (wasActive) this._closeInterval(now);
    t.done = true;
    t.doneAt = now;
    const s = this.session;
    if (s) {
      s.completed = s.completed || [];
      if (!s.completed.includes(id)) s.completed.push(id);
    }
    if (wasActive) {
      this.activeTaskId = this._nextOpen(id);
      this._openInterval(now);
    }
  }

  completeCurrent(now) {
    if (this.activeTaskId) this.completeTask(this.activeTaskId, now);
  }

  reopenTask(id, now) {
    this._tx(() => this._reopenTask(id, now));
  }

  _reopenTask(id, now) {
    const t = this._get(id);
    if (!t || !t.done) return;
    t.done = false;
    t.doneAt = null;
    t.archived = false;
    if (this.session && this.session.completed) this.session.completed = this.session.completed.filter((x) => x !== id);
    if (!this._get(this.activeTaskId) && this._inScope(t)) {
      this.activeTaskId = t.id;
      this._openInterval(now);
    }
  }

  toggleDone(id, now) {
    this._tx(() => {
      const t = this._get(id);
      if (t) (t.done ? this.reopenTask(id, now) : this.completeTask(id, now));
    });
  }

  deleteTask(id, now) {
    this._tx(() => this._deleteTask(id, now));
  }

  _deleteTask(id, now) {
    const t = this._get(id);
    if (!t) return;
    if (id === this.activeTaskId) {
      this._closeInterval(now);
      this.activeTaskId = this._nextOpen(id);
      if (this.activeTaskId === id) this.activeTaskId = null;
    }
    this.tasks = this.tasks.filter((x) => x.id !== id);
    if (this.session && this.session.completed) this.session.completed = this.session.completed.filter((x) => x !== id);
    if (this.activeTaskId) this._openInterval(now);
  }

  // Mueve dentro de su grupo (abiertas / hechas) entre las visibles.
  moveTask(id, dir) {
    this._tx(() => this._moveTask(id, dir));
  }

  _moveTask(id, dir) {
    const t = this._get(id);
    if (!t) return;
    const group = this.tasks.filter((x) => !x.archived && x.done === t.done);
    const j = group.indexOf(t) + dir;
    if (j < 0 || j >= group.length) return;
    const a = this.tasks.indexOf(t);
    const b = this.tasks.indexOf(group[j]);
    [this.tasks[a], this.tasks[b]] = [this.tasks[b], this.tasks[a]];
  }

  clearDone() {
    this._tx(() => { for (const t of this.tasks) if (t.done) t.archived = true; });
  }

  // Activa la tarea abierta siguiente (dir > 0) o anterior (dir < 0), dando la vuelta, dentro del alcance de la sesion.
  cycleActive(dir, now) {
    const open = this.tasks.filter((t) => !t.done && !t.archived && this._inScope(t));
    if (!open.length) return;
    const i = open.findIndex((t) => t.id === this.activeTaskId);
    const n = i < 0 ? (dir < 0 ? open.length - 1 : 0) : (i + (dir < 0 ? -1 : 1) + open.length) % open.length;
    this.setActive(open[n].id, now);
  }

  setProjectColor(name, color) {
    const p = this.projects.find((x) => x.name === name);
    if (p && /^#[0-9a-f]{6}$/i.test(color)) p.color = color;
  }

  // ---- lectura ----

  sessionMs(now) {
    const s = this.session;
    if (!s) return 0;
    return s.accumulated + (s.status === 'running' ? now - s.segStart : 0);
  }

  snapshot(now) {
    const s = this.session;
    const running = !!s && s.status === 'running';
    const taskMs = { ...this.totals };
    let open = null;
    if (running && s.taskStart != null && this.activeTaskId) {
      open = { taskId: this.activeTaskId, start: s.taskStart };
      taskMs[open.taskId] = (taskMs[open.taskId] || 0) + (now - s.taskStart);
    }
    return {
      at: now,
      tasks: this.tasks,
      projects: this.projects,
      activeTaskId: this.activeTaskId,
      project: this.project,
      undo: this._undo.length,
      running,
      opts: this.opts,
      session: s ? {
        id: s.id, startedAt: s.startedAt, status: s.status, pauses: s.pauses, ms: this.sessionMs(now),
        project: s.project === undefined ? undefined : s.project, completed: (s.completed || []).length,
      } : null,
      taskMs,
      open,
    };
  }
}

module.exports = { Engine, parseTitle, PALETTE, DEFAULT_OPTS };

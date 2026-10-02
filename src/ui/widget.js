(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  // Sin horas en cero: 42:05 · 1:02:05
  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  };
  const fmtShort = (ms) => {
    const m = Math.floor(ms / 60000);
    if (m < 1) return ms >= 1000 ? `${Math.floor(ms / 1000)}s` : '';
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${pad(m % 60)}`;
  };
  const motionOk = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'; // = --ease-out

  const api = window.api;
  const input = $('#new');

  let snap = null;
  let mode = 'ghost'; // ghost | active | capture
  let selId = null;
  let theme = 'dark';
  let notice = null; // { text, until }
  let ins = false; // modo INSERT (el input tiene el foco); si no, NORMAL
  let help = false;
  let pending = null; // prefijo de dos teclas: 'b' (borrar), 't' (terminar)
  let pendingTimer = null;
  let leaderOn = false;
  let shortcuts = {};

  // El widget trabaja en un solo proyecto: el de la sesion en curso, si no el elegido. undefined = sin restriccion.
  const scope = () => (snap.session ? snap.session.project : snap.project);
  function inScope(t) {
    const p = scope();
    return p === undefined || (t.project || null) === p;
  }

  // Abiertas primero, hechas al final (mismo orden relativo que en el motor).
  function ordered() {
    const v = snap.tasks.filter((t) => !t.archived && inScope(t));
    return [...v.filter((t) => !t.done), ...v.filter((t) => t.done)];
  }
  const hiddenCount = () => snap.tasks.filter((t) => !t.archived && !t.done && !inScope(t)).length;
  const colorOf = (name) => (snap.projects.find((p) => p.name === name) || {}).color || '#8d95a6';
  const delta = () => (snap.open ? Date.now() - snap.at : 0);
  const activeTask = () => snap.tasks.find((t) => t.id === snap.activeTaskId);
  const projLabel = (p) => (p ? `#${p}` : 'sin proyecto');

  // Tarea con la que arrancaria una sesion nueva: la seleccionada, si no la activa, si no la primera abierta del proyecto.
  function startTask() {
    const open = (t) => t && !t.done && !t.archived && inScope(t);
    const byId = (id) => snap.tasks.find((t) => t.id === id);
    return [byId(selId), activeTask()].find(open) || snap.tasks.find(open) || null;
  }

  // Misma regla que el motor: por que la sesion no se guardaria si terminara ahora.
  function discardReason() {
    const s = snap.session;
    if (!s) return null;
    const ms = s.ms + (snap.running ? Date.now() - snap.at : 0);
    if (ms < snap.opts.minSessionMs) return `dura menos de ${Math.round(snap.opts.minSessionMs / 60000)} min`;
    if (snap.opts.requireCompleted && !s.completed) return 'no se completó ninguna tarea';
    return null;
  }

  const flash = (text, ms = 2500) => { notice = { text, until: Date.now() + ms }; if (snap) renderCur(); };

  // ---- HUD: cápsula de 2,5 s sobre la barra de estado tras completar, borrar o limpiar (deshacible con Ctrl+Z) ----

  let hudTimer = null;
  function hudShow(text) {
    $('#hud-t').textContent = text;
    $('#hud').classList.add('on');
    $('#status').classList.add('hud');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(hudHide, 2500);
  }
  function hudHide() {
    clearTimeout(hudTimer);
    $('#hud').classList.remove('on');
    $('#status').classList.remove('hud');
  }

  // ---- render ----

  function renderTitle() {
    const s = snap && snap.session;
    const p = snap && scope();
    $('#ttl-l').textContent = 'taskghost' + (p ? ` · #${p}` : '');
    const r = $('#ttl-r');
    r.className = leaderOn || !s ? '' : s.status === 'running' ? 'run' : 'pause';
    r.textContent = leaderOn ? 'líder' : !s ? 'sin sesión' : s.status === 'running' ? 'en curso' : 'pausada';
  }

  function renderCur() {
    const s = snap.session;
    const cur = $('#cur');
    if (notice && Date.now() < notice.until) {
      cur.classList.add('notice'); // visible tambien durante la tecla lider
      cur.innerHTML = `<span class="bad">${esc(notice.text)}</span>`;
      return;
    }
    notice = null;
    cur.classList.remove('notice');
    const t = activeTask();
    const title = t ? esc(t.title) : 'sin tarea activa';
    cur.classList.toggle('paused', !!s && s.status === 'paused');
    cur.innerHTML = !s
      ? 'sin sesión · <b>Ctrl+Alt+T</b> abre el panel'
      : `${Icons.svg(s.status === 'paused' ? 'pause' : 'play')}<b>${title}</b>`;
  }

  function renderControls() {
    const s = snap.session;
    const btn = $('#btn-session');
    if (!s) {
      const st = startTask();
      btn.innerHTML = st ? U('Iniciar') : 'Sin tareas abiertas';
      btn.disabled = !st;
      btn.title = st ? 'Iniciar sesión (i)' : 'Agregá una tarea para iniciar';
      btn.className = 'btn fill';
    } else {
      btn.disabled = false;
      const running = s.status === 'running';
      btn.innerHTML = U(running ? 'Pausar' : 'Reanudar');
      btn.title = running ? 'Pausar (p)' : 'Reanudar (r)';
      btn.className = running ? 'btn tint' : 'btn fill';
    }

    const end = $('#btn-end');
    end.style.display = s ? 'inline-flex' : 'none';
    const why = discardReason();
    end.innerHTML = U('Terminar'); // la tecla es t: con la sesion por descartarse sigue siendo "Terminar", en ambar
    end.className = why ? 'btn warn' : 'btn';
    end.title = why ? `No se guardará: ${why} (tt)` : 'Terminar y guardar la sesión (tt)';
    const warn = $('#warn');
    warn.style.display = why ? 'flex' : 'none';
    warn.innerHTML = why ? `${Icons.svg('warn')}<span>No se guardará: ${esc(why)}</span>` : '';

    const p = scope();
    const chip = $('#proj-chip');
    chip.style.display = p !== undefined ? 'inline-block' : 'none';
    chip.textContent = projLabel(p);
    chip.style.setProperty('--c', p ? colorOf(p) : '#8d95a6');
    chip.classList.toggle('locked', !!s);
    chip.title = s ? 'Proyecto de la sesión (se cambia al terminarla)' : 'Cambiar de proyecto (#)';

    const hidden = hiddenCount();
    const note = $('#hidden-note');
    note.style.display = hidden ? 'block' : 'none';
    note.textContent = hidden ? `${hidden} de otros proyectos oculta${hidden > 1 ? 's' : ''} · # cambia` : '';
  }

  // Regla de teclas: la letra es la primera de la accion (subrayada en la interfaz); las mas frecuentes mandan
  // y las que tienen tecla estandar la usan (Ctrl+Z, Supr, Espacio, flechas).
  const U = (w) => `<u>${w[0]}</u>${w.slice(1)}`;
  const SEP = '<span class="sp">·</span>';
  const HELP = [
    ['mover', [['↑ ↓', 'elegir'], ['Home End', 'inicio/fin'], ['1-9', 'por n°'], ['Alt+↑↓', 'reordenar']]],
    ['tarea', [['n', 'nueva'], ['h Espacio', 'hecha'], ['Enter a', 'activar'], ['b b · Supr', 'borrar'], ['Ctrl+Z', 'deshacer'], ['l', 'limpiar hechas']]],
    ['sesión', [['i', 'iniciar'], ['p', 'pausar'], ['r', 'reanudar'], ['t t', 'terminar']]],
    ['otros', [['#', 'proyecto'], ['c', 'claro/oscuro'], ['d', 'dashboard'], ['esc', 'salir']]],
  ];
  const acc = (a) => String(a || '—').replace('Control', 'ctrl').replace('Space', 'espacio').toLowerCase();
  const helpHtml = () => [...HELP, ['global', [[acc(shortcuts.togglePanel), 'panel'], [acc(shortcuts.capture), 'captura'], [acc(shortcuts.leader), 'líder']]]]
    .map(([label, items]) => `<div class="hr"><b>${label}</b><span>${items.map(([k, d]) => `<span class="it"><kbd>${k}</kbd> <span>${d}</span></span>`).join('')}</span></div>`).join('');
  // la leyenda aparece por grupos con fundido escalonado (--i x 30 ms)
  const LEGEND_HTML = [
    '<span class="g lead" style="--i:0">Líder</span>',
    `<span class="g" style="--i:1"><kbd>↑↓</kbd> tarea ${['hecha', 'pausa', 'reanudar'].map(U).join(' ')}</span>`,
    `<span class="g" style="--i:2">${['iniciar', 'terminar', 'nueva'].map(U).join(' ')}</span>`,
    `<span class="g" style="--i:3">${['abrir', 'dash', 'claro'].map(U).join(' ')} <kbd>^Z</kbd> deshacer <kbd>esc</kbd> salir</span>`,
  ].join('');

  function renderHint() {
    const tag = $('#mode-tag');
    const hint = $('#hint');
    document.body.classList.toggle('ins', mode === 'active' && ins);
    document.body.classList.toggle('help', mode === 'active' && help);
    const s = snap && snap.session;
    const p = snap && scope();
    const base = p ? `Nueva tarea en #${p}…  (#otro solo: cambia)` : 'Nueva tarea…  (#proyecto solo: cambia)';
    input.placeholder = ins || mode === 'capture' ? base : 'n escribe una tarea · # proyecto';
    if (mode === 'capture') { tag.textContent = 'NUEVA'; hint.innerHTML = '<kbd>enter</kbd> agrega · <kbd>esc</kbd> cancela'; return; }
    if (help) { tag.textContent = 'AYUDA'; hint.innerHTML = '<kbd>?</kbd> o <kbd>esc</kbd> cierra'; return; }
    if (ins) { tag.textContent = 'INSERT'; hint.innerHTML = '<kbd>enter</kbd> agrega · <kbd>esc</kbd> normal'; return; }
    tag.textContent = 'NORMAL';
    if (pending) {
      const what = { b: 'otra <kbd>b</kbd> borra', t: 'otra <kbd>t</kbd> termina' }[pending];
      hint.innerHTML = `<span class="pend">${pending}-</span> ${what} · <kbd>esc</kbd>`;
      return;
    }
    // la pista muestra solo lo que aplica al estado de la sesion; la letra subrayada es la tecla
    const items = ['hecha', 'borrar', 'nueva'].map(U);
    if (!s) items.push(U('iniciar'));
    else items.push(U(s.status === 'running' ? 'pausa' : 'reanudar'), U('terminar'));
    if (snap && snap.undo) items.push('<kbd>Ctrl+Z</kbd> deshacer');
    items.push('<kbd>?</kbd>');
    hint.innerHTML = items.join(` ${SEP} `);
  }

  // ---- lista: se reconcilia por data-id (nodos reusados) para que haya un antes y un después que animar ----

  const rows = new Map(); // id -> <li>
  const optimistic = new Map(); // id -> done: lo que se ve mientras el check anima y todavia no se despacho
  const busy = new Set(); // ids con una animacion en curso (evita acciones dobles)
  let lastListSig = '';
  const DONE_MS = 300; // lo que tarda en verse el check lleno + tachado antes de despachar
  const GONE_MS = 220; // colapso de la fila al borrar

  function rowEl(id) {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.id = id;
    li.innerHTML = '<div class="rw"><div class="task">'
      + '<span class="n"></span>'
      + '<button class="chk" data-act="done" title="Hecha / reabrir (h)"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3 5 8.6l4.6-5.2"/></svg></button>'
      + '<span class="title" data-act="active"><span class="tt"></span></span>'
      + '<span class="tag" hidden></span><span class="now"></span><span class="ms"></span>'
      + `<button class="x" data-act="del" title="Eliminar (bb)">${Icons.svg('x')}</button>`
      + '</div></div>';
    return li;
  }

  function patchRow(li, x) {
    const task = li.firstElementChild.firstElementChild;
    if (task.className !== x.cls) task.className = x.cls;
    if (li._sig !== x.sig) {
      li._sig = x.sig;
      const t = x.t;
      const title = task.querySelector('.title');
      title.title = t.title;
      task.querySelector('.tt').textContent = t.title;
      const tag = task.querySelector('.tag');
      tag.hidden = !x.tag;
      tag.textContent = x.tag ? `#${x.tag}` : '';
      if (x.tag) tag.style.setProperty('--c', colorOf(x.tag));
    }
    const n = task.querySelector('.n');
    if (n.textContent !== x.n) n.textContent = x.n;
    const ms = task.querySelector('.ms');
    if (ms.textContent !== x.ms) ms.textContent = x.ms;
  }

  // Devuelve true si la lista cambió. FLIP: las filas que cambian de lugar se deslizan 200 ms; las nuevas entran con fundido.
  function renderList(list) {
    const items = list.map((t, i) => {
      const done = optimistic.has(t.id) ? optimistic.get(t.id) : t.done;
      const tag = t.project && t.project !== scope() ? t.project : '';
      return {
        t, tag,
        cls: `task${done ? ' done' : ''}${t.id === snap.activeTaskId ? ' active' : ''}${t.id === selId ? ' sel' : ''}`,
        n: i < 9 ? String(i + 1) : '',
        ms: fmtShort(snap.taskMs[t.id] || 0),
        sig: `${t.title}|${tag}`,
      };
    });
    const sig = items.map((x) => `${x.t.id}|${x.cls}|${x.n}|${x.ms}|${x.sig}`).join('\n');
    if (sig === lastListSig) return false;
    lastListSig = sig;

    const L = $('#list');
    const animate = motionOk() && !document.body.classList.contains('ghost') && rows.size > 0;
    const before = new Map();
    if (animate) for (const [id, li] of rows) before.set(id, li.getBoundingClientRect().top);

    const ids = new Set(items.map((x) => x.t.id));
    for (const [id, li] of rows) if (!ids.has(id)) { li.remove(); rows.delete(id); }
    const fresh = [];
    let ref = L.firstElementChild;
    for (const x of items) {
      let li = rows.get(x.t.id);
      if (!li) { li = rowEl(x.t.id); rows.set(x.t.id, li); fresh.push(li); }
      patchRow(li, x);
      if (li === ref) ref = ref.nextElementSibling;
      else L.insertBefore(li, ref);
    }

    if (animate) {
      const anim = { duration: 200, easing: EASE_OUT };
      for (const [id, top] of before) {
        const li = rows.get(id);
        const dy = li ? top - li.getBoundingClientRect().top : 0;
        if (Math.abs(dy) > 1) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], anim);
      }
      if (fresh.length <= 3) for (const li of fresh) li.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE_OUT });
    }
    return true;
  }

  function render() {
    if (!snap) return;
    const list = ordered();
    if (!list.some((t) => t.id === selId)) selId = (list.find((t) => t.id === snap.activeTaskId) || list[0] || {}).id || null;

    // Rehacer la lista cuesta layout completo: solo si cambio (un cambio de modo, p. ej., no la toca).
    const listChanged = renderList(list);

    renderControls();
    renderCur();
    renderTitle();
    renderHint();
    tick();
    // el alto lo informa el ResizeObserver; el scroll espera al frame para no forzar un layout sincronico aca
    if (listChanged) requestAnimationFrame(revealSel);
  }

  // Como scrollIntoView pero solo mueve la lista: con el panel oculto fuera de la ventana, scrollIntoView
  // desplazaria el body entero (overflow:hidden igual es desplazable por codigo).
  function revealSel() {
    const el = $('.task.sel');
    if (!el) return;
    const L = $('#list');
    const l = L.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < l.top) L.scrollTop += r.top - l.top;
    else if (r.bottom > l.bottom) L.scrollTop += r.bottom - l.bottom;
  }

  // ---- acciones de la lista con su animación (después de animar se despacha) ----

  const animating = () => motionOk() && document.body.classList.contains('active');

  // Completar / reabrir: el check se llena, se dibuja y se traza el tachado en la fila existente; recién ahí se despacha.
  function toggleDone(id) {
    const t = snap.tasks.find((x) => x.id === id);
    if (!t || busy.has(id)) return;
    const to = !t.done;
    busy.add(id);
    optimistic.set(id, to);
    render();
    const go = () => {
      if (to) hudShow('Tarea hecha');
      dispatch('toggleDone', { id }).finally(() => { busy.delete(id); optimistic.delete(id); });
    };
    if (animating()) setTimeout(go, DONE_MS); else go();
  }

  // Borrar: la fila colapsa (1fr → 0fr + fundido) y después se despacha.
  function deleteRow(id) {
    const li = rows.get(id);
    if (!li || busy.has(id)) return;
    busy.add(id);
    const go = () => { hudShow('Tarea borrada'); dispatch('deleteTask', { id }).finally(() => busy.delete(id)); };
    if (animating()) { li.classList.add('gone'); setTimeout(go, GONE_MS); } else go();
  }

  function clearDone() {
    const done = ordered().filter((t) => t.done);
    if (!done.length) return;
    const go = () => { hudShow(done.length > 1 ? `${done.length} tareas archivadas` : 'Tarea archivada'); dispatch('clearDone'); };
    if (animating()) { for (const t of done) { const li = rows.get(t.id); if (li) li.classList.add('gone'); } setTimeout(go, GONE_MS); } else go();
  }

  // ---- reloj ----

  // En reposo el reloj no "tickea" cada segundo: avanza de a 5 s.
  const isResting = () => mode === 'ghost' && !document.body.classList.contains('peek') && !leaderOn;
  const QUANTUM = 5000;

  // Reloj grande: una celda por cifra. Las de minutos/horas ruedan al cambiar (translateY + blur, spring snappy);
  // los segundos cambian sin animar. Solo se toca el DOM si cambió el texto (el tick corre 4 veces por segundo).
  function setDigits(el, str, roll) {
    const prev = el._s || '';
    if (str === prev) return;
    el._s = str;
    if (str.length !== prev.length) {
      el.innerHTML = [...str].map((c) => (c === ':' ? '<span class="colon">:</span>' : `<span class="dg"><i>${c}</i></span>`)).join('');
      return;
    }
    const colon = str.lastIndexOf(':');
    [...str].forEach((c, i) => {
      if (c === prev[i] || c === ':') return;
      const slot = el.children[i];
      if (!roll || i > colon) { slot.innerHTML = `<i>${c}</i>`; return; }
      const old = slot.querySelector('i:not(.out)');
      if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 260); }
      const n = document.createElement('i');
      n.className = 'in';
      n.textContent = c;
      slot.appendChild(n);
    });
  }

  function setClock(el, ms, resting) {
    const v = resting ? Math.floor(ms / QUANTUM) * QUANTUM : ms;
    // rueda solo con el paso natural del tiempo: un salto (otra tarea, otra sesion) cambia directo
    const natural = el._v !== undefined && v >= el._v && v - el._v < 130000;
    el._v = v;
    setDigits(el, fmt(v), natural && motionOk());
  }

  let lastReason = null;
  function tick() {
    if (!snap) return;
    const resting = isResting();
    const s = snap.session;
    const t = activeTask();
    setClock($('#t-task'), t ? (snap.taskMs[t.id] || 0) + delta() : 0, resting);
    const sess = $('#t-sess');
    if (sess.hidden === !!s) sess.hidden = !s;
    const stext = s ? `sesión ${fmt(resting ? Math.floor((s.ms + (snap.running ? Date.now() - snap.at : 0)) / QUANTUM) * QUANTUM : s.ms + (snap.running ? Date.now() - snap.at : 0))}` : '';
    if (sess.textContent !== stext) sess.textContent = stext;
    document.body.classList.toggle('running', !!snap.running);
    // tick corre 4 veces por segundo: solo se escribe el DOM si algo cambio (cada escritura invalida estilo)
    const state = !s ? 'var(--label-3)' : s.status === 'running' ? 'var(--accent)' : 'var(--orange)';
    if (state !== lastState) { lastState = state; document.documentElement.style.setProperty('--state', state); }
    const row = $('.task.active .ms');
    if (row && t) { const text = fmtShort((snap.taskMs[t.id] || 0) + delta()); if (row.textContent !== text) row.textContent = text; }
    // el umbral de minutos se cruza con el paso del tiempo, sin que llegue un estado nuevo
    const why = discardReason();
    if (why !== lastReason) { lastReason = why; renderControls(); }
    if (notice && Date.now() >= notice.until) renderCur();
  }
  let lastState = null;

  // Alto de la ventana = alto de #app (la tarjeta; main suma el margen de la sombra). Lo informa el ResizeObserver
  // (corre despues del layout, sin forzarlo); pushHeight devuelve una promesa que se cumple cuando la ventana ya tiene el alto nuevo.
  let lastH = 0;
  let heightDone = Promise.resolve();
  function pushHeight(h) {
    if (h !== lastH) { lastH = h; heightDone = api.setHeight(h); }
    return heightDone; // si ya se pidio este alto, espera a esa misma respuesta
  }
  const appHeight = () => Math.ceil($('#app').getBoundingClientRect().height);

  const dispatch = (action, payload) => api.dispatch(action, payload);

  function moveSel(dir) {
    const list = ordered();
    const i = list.findIndex((t) => t.id === selId);
    const n = list[Math.min(list.length - 1, Math.max(0, i + dir))];
    if (n) { selId = n.id; render(); }
  }

  function selectAt(i) {
    const list = ordered();
    const n = list[Math.min(list.length - 1, Math.max(0, i))];
    if (n) { selId = n.id; render(); }
  }

  function applyConfig(c) {
    const next = c.theme === 'light' ? 'light' : 'dark';
    const apply = () => {
      theme = next;
      document.documentElement.dataset.theme = theme;
      window.Theme.apply(document.documentElement, theme, c.accent);
      $('#btn-theme').innerHTML = Icons.svg(theme === 'light' ? 'sun' : 'moon');
    };
    shortcuts = c.shortcuts || {};
    // cambio de tema: crossfade de 250 ms (View Transitions); la primera vez y con movimiento reducido, directo
    if (snap && next !== theme && motionOk() && document.startViewTransition) {
      const vt = document.startViewTransition(apply);
      vt.ready.catch(() => {}); vt.finished.catch(() => {}); // sin renderizado (ventana oculta) se omite y el callback igual corre
    }
    else apply();
    const g = typeof c.ghostOpacity === 'number' ? c.ghostOpacity : 0.55;
    document.documentElement.style.setProperty('--ghost-a', String(0.5 + 0.5 * g));
    const dot = c.ghostStyle === 'dot' && api.platform !== 'linux';
    document.body.classList.toggle('style-dot', dot);
    if (!dot) document.body.classList.remove('peek');
    if (snap) tick();
  }

  // estilo circulo: el hover sobre el logo muestra el rectangulo y se cierra solo a los pocos segundos.
  // La ventana es click-through (eventos reenviados): el mouseleave no es confiable, asi que el cierre lo decide
  // un temporizador que solo se renueva mientras el mouse se sigue moviendo encima.
  const PEEK_MS = 3500;
  const MORPH_MS = 320; // = transicion de clip-path del estilo circulo en widget.css
  const OPEN_MS = 460; // = --d-open (spring snappy)
  const CLOSE_MS = 260; // = --d-close
  let peekTimer = null;
  let peekClosedAt = 0;
  const peeking = () => document.body.classList.contains('peek');
  const armPeek = (ms) => { clearTimeout(peekTimer); peekTimer = setTimeout(() => setPeek(false), ms); };
  const setPeek = (on) => {
    clearTimeout(peekTimer);
    if (!on && peeking()) peekClosedAt = Date.now();
    document.body.classList.toggle('peek', on);
    tick();
    if (on) armPeek(PEEK_MS);
  };
  // sin el enfriamiento, el circulo que reaparece bajo el cursor lo volveria a abrir en plena animacion
  $('#dot').addEventListener('mouseenter', () => { if (mode === 'ghost' && Date.now() - peekClosedAt > MORPH_MS + 100) setPeek(true); });
  $('#pill').addEventListener('mousemove', () => { if (peeking()) armPeek(PEEK_MS); });
  $('#pill').addEventListener('mouseleave', () => { if (peeking()) armPeek(250); });

  // En modo activo la ventana recibe clics, pero el margen transparente de la sombra no debe bloquear las apps de atras:
  // fuera de la superficie la ventana deja pasar los clics (los movimientos se siguen reenviando para detectar el regreso).
  let passing = false;
  const setPass = (on) => { if (on !== passing) { passing = on; api.setPassthrough(on); } };
  document.addEventListener('mousemove', (e) => { if (mode !== 'ghost') setPass(!e.target.closest('#surface')); });
  document.documentElement.addEventListener('mouseleave', () => { if (mode !== 'ghost') setPass(true); });

  // ---- modos (NORMAL / INSERT / ayuda) ----

  function sync() { renderHint(); }

  function setIns(v) {
    ins = v;
    if (v) { help = false; input.focus(); } else input.blur();
    sync();
  }

  function setHelp(v) {
    help = v;
    if (v) { ins = false; input.blur(); $('#help').innerHTML = helpHtml(); }
    sync();
  }

  function setPending(k) {
    clearTimeout(pendingTimer);
    pending = k;
    if (k) pendingTimer = setTimeout(() => setPending(null), 1200);
    sync();
  }

  // clic en el input = INSERT; perder el foco del input = NORMAL
  input.addEventListener('focus', () => { if (mode === 'active' && !ins) { ins = true; help = false; sync(); } });
  input.addEventListener('blur', () => { if (mode === 'active' && ins) { ins = false; sync(); } });

  // ---- eventos de mouse ----

  $('#list').addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = el.closest('.row').dataset.id;
    selId = id;
    const act = el.dataset.act;
    if (act === 'done') toggleDone(id);
    else if (act === 'active') { dispatch('setActive', { id }); render(); }
    else if (act === 'del') deleteRow(id);
  });

  function startOrResume() {
    if (!snap.session) { const st = startTask(); if (st) dispatch('startSession', { taskId: st.id }); }
    else if (snap.session.status === 'paused') dispatch('resume');
  }

  $('#btn-session').addEventListener('click', () => {
    if (snap.session) dispatch('togglePause');
    else startOrResume();
  });
  $('#btn-end').addEventListener('click', () => dispatch('endSession'));
  $('#proj-chip').addEventListener('click', () => { if (mode === 'active') pickProject(); });
  $('#btn-clear').addEventListener('click', clearDone);
  $('#btn-dash').addEventListener('click', () => api.openDashboard());
  $('#btn-theme').addEventListener('click', () => api.setTheme(theme === 'light' ? 'dark' : 'light'));

  // ---- teclado ----

  function undo() {
    if (!snap.undo) { flash('nada que deshacer'); return; }
    hudHide();
    dispatch('undo');
    flash('deshecho');
  }

  function deleteSelected() {
    if (!selId) return;
    const list = ordered();
    const i = list.findIndex((t) => t.id === selId);
    const next = (list[i + 1] || list[i - 1] || {}).id || null;
    const id = selId;
    selId = next;
    deleteRow(id);
    render();
  }

  // "#nombre" solo (o "#" solo = sin proyecto) cambia el proyecto del widget; cualquier otra cosa es una tarea.
  const PROJ_ONLY = /^#([\p{L}\p{N}_-]*)$/u;
  const TAG = /(?:^|\s)#([\p{L}\p{N}_-]+)/u;

  function addFromInput() {
    const text = input.value.trim();
    if (!text) return false;
    input.value = '';
    const only = text.match(PROJ_ONLY);
    if (only) {
      if (snap.session) { flash('Terminá la sesión para cambiar de proyecto'); return true; }
      dispatch('setProject', { name: only[1] });
      flash(`Proyecto: ${projLabel(only[1].toLowerCase())}`);
      return true;
    }
    dispatch('addTask', { title: text });
    const tag = text.match(TAG);
    if (tag && tag[1].toLowerCase() !== scope()) flash(`Agregada a #${tag[1].toLowerCase()} (no se ve en este proyecto)`);
    return true;
  }

  // Abre INSERT con "#" escrito: se completa el nombre y Enter cambia de proyecto.
  function pickProject() {
    if (snap.session) { flash('Terminá la sesión para cambiar de proyecto'); return; }
    setIns(true);
    input.value = '#';
  }

  function captureKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); input.value = ''; api.exitActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); addFromInput(); api.exitActive(); }
  }

  function insertKey(e) {
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); setIns(false); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      const dir = k === 'ArrowUp' ? -1 : 1;
      if (e.altKey) { if (selId) dispatch('moveTask', { id: selId, dir }); } else moveSel(dir);
    } else if (k === 'Enter') {
      e.preventDefault();
      if (!addFromInput()) setIns(false); // Enter vacio vuelve a NORMAL
    } else if (e.ctrlKey && k.toLowerCase() === 'd') {
      e.preventDefault();
      if (selId) toggleDone(selId);
    }
  }

  function normalKey(e) {
    const k = e.key;
    if (k === '#' && !help) { e.preventDefault(); pickProject(); return; } // en teclados es/latam sale con AltGr (= Ctrl+Alt)
    if (e.ctrlKey || e.metaKey) {
      if (e.altKey) return; // Ctrl+Alt (AltGr) son atajos globales: nunca acciones del panel
      if (k.toLowerCase() === 'd') { e.preventDefault(); if (selId) toggleDone(selId); }
      else if (k.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      return;
    }
    if (help) { if (k === 'Escape' || k === '?') { e.preventDefault(); setHelp(false); } return; }
    if (k === 'Escape') { if (pending) setPending(null); else api.exitActive(); return; }
    if (pending) {
      const p = pending;
      setPending(null);
      if (k === p) {
        e.preventDefault();
        if (p === 'b') deleteSelected();
        else if (p === 't') dispatch('endSession');
        return;
      }
    }
    if (e.altKey) {
      if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); if (selId) dispatch('moveTask', { id: selId, dir: k === 'ArrowUp' ? -1 : 1 }); }
      return;
    }
    if (/^[1-9]$/.test(k)) { e.preventDefault(); selectAt(Number(k) - 1); return; }
    const s = snap.session;
    switch (k) {
      case 'ArrowDown': e.preventDefault(); moveSel(1); break;
      case 'ArrowUp': e.preventDefault(); moveSel(-1); break;
      case 'Home': e.preventDefault(); selectAt(0); break;
      case 'End': e.preventDefault(); selectAt(ordered().length - 1); break;
      case 'Enter': case 'a': e.preventDefault(); if (selId) dispatch('setActive', { id: selId }); break;
      case 'h': case ' ': e.preventDefault(); if (selId) toggleDone(selId); break;
      case 'b': e.preventDefault(); setPending('b'); break;
      case 'Delete': e.preventDefault(); deleteSelected(); break;
      case 'n': e.preventDefault(); setIns(true); break;
      case 'l': e.preventDefault(); clearDone(); break;
      case 'i': e.preventDefault(); if (!s) startOrResume(); break;
      case 'p': e.preventDefault(); if (s && s.status === 'running') dispatch('pause'); break;
      case 'r': e.preventDefault(); if (s && s.status === 'paused') dispatch('resume'); break;
      case 't': e.preventDefault(); if (s) setPending('t'); break;
      case 'c': e.preventDefault(); api.setTheme(theme === 'light' ? 'dark' : 'light'); break;
      case 'd': e.preventDefault(); api.openDashboard(); break;
      case '?': e.preventDefault(); setHelp(true); break;
      default: break;
    }
  }

  // los botones no toman foco: si no, Enter/Espacio los "clickearian" ademas de la accion de teclado
  document.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });

  document.addEventListener('keydown', (e) => {
    if (mode === 'ghost' || !snap) return;
    if (mode === 'capture') captureKey(e);
    else if (ins) insertKey(e);
    else normalKey(e);
  });

  // ---- mensajes del proceso principal ----

  api.onState((s) => { snap = s; render(); });
  api.onNotice((text) => { flash(text, 6000); });
  // Morph reposo <-> panel (estilo píldora: la superficie se estira; estilo círculo: crece desde el logo).
  // Regla: la ventana nunca cambia de tamaño durante la animacion (redimensionar una ventana transparente cuesta un
  // frame largo en el proceso principal y en la GPU).
  //  - abrir: se arma el panel con el recorte colapsado, la ventana crece al alto final y recien ahi se suelta el recorte
  //    (spring snappy 460 ms) mientras el contenido entra escalonado;
  //  - cerrar: se recorta hacia la píldora con el layout del panel intacto (260 ms) y despues se pasa a reposo (y la ventana achica).
  let morphTimer = null;
  let morphSeq = 0;
  function afterMorph(ms, fn) {
    const surface = $('#surface');
    let done = false;
    const go = () => { if (done) return; done = true; surface.removeEventListener('transitionend', onEnd); fn(); };
    const onEnd = (e) => { if (e.target === surface && e.propertyName === 'clip-path') go(); };
    surface.addEventListener('transitionend', onEnd);
    morphTimer = setTimeout(go, ms + 150); // por si la transicion no corre (p. ej. se interrumpe)
  }
  const dotStyle = () => document.body.classList.contains('style-dot');
  api.onMode((m) => {
    clearTimeout(morphTimer);
    const seq = ++morphSeq;
    const B = document.body.classList;
    const wasResting = isResting();
    B.remove('collapsing', 'morph-open', 'morph-close');
    const shrink = m === 'ghost' && mode !== 'ghost' && motionOk();
    const grow = m !== 'ghost' && wasResting && motionOk();
    mode = m;
    hudHide();
    passing = false; // main acaba de dejar la ventana recibiendo clics (o en click-through)
    if (shrink) {
      input.blur();
      B.add('collapsing', 'morph-close');
      // al terminar la transicion (no con un timer de la misma duracion: el achique de la ventana pisaria el ultimo frame)
      afterMorph(dotStyle() ? MORPH_MS : CLOSE_MS, () => { if (seq !== morphSeq) return; B.remove('collapsing', 'morph-close'); applyMode(m); });
      return;
    }
    if (grow) B.add('collapsing');
    applyMode(m);
    if (!grow) return;
    requestAnimationFrame(async () => {
      await pushHeight(appHeight());
      // un frame mas para que el compositor ya dibuje con el tamaño nuevo
      requestAnimationFrame(() => {
        if (seq !== morphSeq) return;
        B.add('morph-open');
        B.remove('collapsing');
        afterMorph(dotStyle() ? MORPH_MS : OPEN_MS, () => { if (seq === morphSeq) B.remove('morph-open'); });
      });
    });
  });
  function applyMode(m) {
    document.body.classList.remove('ghost', 'active', 'capture', 'peek', 'help');
    document.body.classList.add(m);
    help = false;
    pending = null;
    ins = m === 'capture' || (m === 'active' && !!snap && ordered().length === 0); // sin tareas: directo a escribir
    if (m === 'ghost') input.blur();
    render();
    if (ins) setTimeout(() => input.focus(), 30);
  }
  api.onLeader((on) => {
    leaderOn = on;
    document.body.classList.toggle('leader', on);
    $('#legend').innerHTML = LEGEND_HTML;
    renderTitle();
    tick();
  });
  api.onConfig(applyConfig);

  api.getConfig().then(applyConfig);
  api.getState().then((s) => { snap = s; render(); });
  setInterval(tick, 250);
  // #app = la tarjeta (alto de la ventana sin el margen); #pill = alto al que se recorta el morph (--pill-h)
  const surface = $('#surface');
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const h = Math.ceil(e.borderBoxSize[0].blockSize);
      if (e.target.id === 'app') pushHeight(h);
      else surface.style.setProperty('--pill-h', `${h}px`);
    }
  });
  ro.observe($('#app'));
  ro.observe($('#pill'));
})();

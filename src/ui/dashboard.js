(() => {
  const S = window.Stats;
  const I = window.Icons;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ic = (name, cls) => I.svg(name, cls);
  const NONE = '(sin proyecto)';
  const GREY = '#8d95a6';

  // la ventana avisa si hay Mica (barra lateral translúcida) y si la página dibuja su propia barra de título
  const params = new URLSearchParams(location.search);
  document.body.classList.toggle('mica', params.get('mica') === '1');
  document.body.classList.toggle('tb', params.get('titlebar') === '1');
  I.fill();

  let snap = null;
  let hist = { intervals: [], sessions: [] };
  let view = 'hoy';
  let dirty = false;
  let charts = [];
  let hero = null; // datos de "Hoy" que usa el tic para animar el anillo y las barras sin recalcular nada
  let tlMinute = 0; // minuto en que se dibujo la linea de tiempo
  let entering = true; // la animación de entrada (anillo, barras, gráficos) corre una sola vez al abrir la vista
  const filters = { project: '', status: 'open' };
  const form = { title: '', project: undefined, newProject: '', bulk: '' };
  let focusTitle = false;
  let theme = 'dark';
  let appliedTheme = null;
  let cfg = { shortcuts: {} };
  let noticeTimer = null;
  let hudTimer = null;
  let curId = null; // fila elegida con el teclado en la vista de tareas
  let pending = null; // prefijo de dos teclas: 'b' (borrar)
  let pendingTimer = null;
  let helpOpen = false;
  let menu = null; // menú desplegable abierto
  const ctlPrev = {}; // estado previo de switches y perillas: al repintar Ajustes se deslizan desde ahí
  const VIEW_ORDER = ['hoy', 'tareas', 'proyectos', 'sesiones', 'graficos', 'ajustes'];
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const slug = (v) => String(v || '').trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // proyecto en el que trabaja el widget (el de la sesion en curso, si hay)
  const widgetProject = () => ((snap.session ? snap.session.project : snap.project) || '');
  const inScope = (t) => !snap.session || snap.session.project === undefined || (t.project || null) === snap.session.project;

  const api = window.api;
  const taskById = () => Object.fromEntries(snap.tasks.map((t) => [t.id, t]));
  const projectOf = (id) => (taskById()[id] || {}).project || NONE;
  const colorOf = (name) => (snap.projects.find((p) => p.name === name) || {}).color || GREY;
  const chip = (name) => (name && name !== NONE ? `<span class="chip" style="--c:${colorOf(name)}">#${esc(name)}</span>` : '');
  // número grande con la unidad más chica: 2 h 54 min
  const humanHtml = (ms) => S.humanParts(ms).map(([n, u]) => `${n}<small>${u}</small>`).join(' ');
  const setText = (el, t) => { if (el._t !== t) { el.textContent = t; el._t = t; } };
  const setHtml = (el, h) => { if (el._h !== h) { el.innerHTML = h; el._h = h; } };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const head = (title, sub) => `<header class="vh"><h1>${title}</h1><p>${sub}</p></header>`;
  const note = (html, kind, icon) => `<div class="note ${kind || ''}">${ic(icon || 'warn')}<div>${html}</div></div>`;

  // Intervalos cerrados + el que esta corriendo ahora (para ver datos en vivo).
  function intervalsNow() {
    const out = hist.intervals.slice();
    if (snap.open) out.push({ taskId: snap.open.taskId, start: snap.open.start, end: Date.now() });
    return out;
  }

  // ---------- vistas ----------

  function viewHoy() {
    const now = Date.now();
    const t0 = S.startOfDay(now);
    // días anteriores: intervalos cerrados + la parte de ayer del que sigue corriendo; hoy se suma en vivo desde tick()
    const ivs = hist.intervals.slice();
    if (snap.open && snap.open.start < t0) ivs.push({ taskId: snap.open.taskId, start: snap.open.start, end: t0 });
    const byDay = S.msByDayProject(ivs, () => 'x');
    const days = Array.from({ length: 7 }, (_, i) => S.addDays(t0, i - 6));
    hero = { t0, closed: S.sumMs(byDay[t0]), prior: days.slice(0, 6).map((d) => S.sumMs(byDay[d])), avg: S.avgDaily(byDay, t0, 7) };

    const sessToday = hist.sessions.filter((s) => s.endedAt >= t0);
    const sessMs = sessToday.reduce((a, s) => a + s.duration, 0);
    const sessN = sessToday.length + (snap.session ? 1 : 0);
    const doneToday = snap.tasks.filter((t) => t.doneAt && t.doneAt >= t0).length;
    const active = snap.tasks.find((t) => t.id === snap.activeTaskId);
    const d = new Date(now);
    const row = (l, v) => `<div class="row"><span class="l">${l}</span><span class="v">${v}</span></div>`;

    return `${head('Hoy', `${cap(DAYS[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`)}
    <div class="hero">
      <div class="tile"><div class="ringwrap">
        <svg class="ring" viewBox="0 0 76 76" aria-hidden="true"><circle class="bgc" cx="38" cy="38" r="32"/><circle class="fg" id="ring-fg" cx="38" cy="38" r="32"/><circle class="fg2" id="ring-fg2" cx="38" cy="38" r="32"/></svg>
        <div><div class="k">En tareas hoy</div><div class="big" data-live="today"></div><div class="k" id="ring-pct"></div></div>
      </div></div>
      <div class="tile bars-tile"><div class="k">Últimos 7 días</div>
        <div class="bars" id="bars">${days.map((_, i) => `<i class="${i === 6 ? 't' : ''}" style="--n:${i}"></i>`).join('')}<span class="avg" id="bars-avg"><span></span></span></div>
        <div class="days">${days.map((x, i) => `<span class="${i === 6 ? 't' : ''}">${'DLMXJVS'[new Date(x).getDay()]}</span>`).join('')}</div>
      </div>
    </div>
    <div class="glist">
      ${row('Tarea activa', active ? `<span class="ttl">${esc(active.title)}</span> · <span data-live="task:${active.id}"></span>` : 'Ninguna')}
      ${row('Sesiones de hoy', sessN ? `<b>${sessN}</b>${sessMs ? ` · ${S.human(sessMs)} cerradas` : ''}${snap.session ? ` · <span data-live="session"></span> en curso` : ''}` : 'Ninguna')}
      ${row('Tareas cerradas hoy', `<b>${doneToday}</b>`)}
      ${snap.session && snap.session.project !== undefined ? row('Proyecto de la sesión', snap.session.project ? chip(snap.session.project) : 'Sin proyecto') : ''}
    </div>
    <h2>Línea de tiempo</h2><div class="tile" id="timeline">${timelineHtml()}</div>`;
  }

  const C_RING = 2 * Math.PI * 32;

  // Anillo, número y barras de "Hoy": se actualizan en el sitio cada segundo (sin animar; la entrada ya corrió al abrir la vista).
  function paintHero(now) {
    const fg = $('#ring-fg');
    if (!fg || !hero) return;
    const open = snap.open ? Math.max(0, now - Math.max(snap.open.start, hero.t0)) : 0;
    const today = hero.closed + open;
    const frac = hero.avg > 0 ? today / hero.avg : 0;
    const f1 = Math.min(frac, 1);
    const f2 = Math.min(Math.max(frac - 1, 0), 1); // segunda vuelta, más oscura, si supera el 100 %
    fg.style.strokeDashoffset = C_RING * (1 - f1);
    fg.style.opacity = f1 > 0.003 ? 1 : 0;
    const fg2 = $('#ring-fg2');
    fg2.style.strokeDashoffset = C_RING * (1 - f2);
    fg2.style.opacity = f2 > 0.003 ? 1 : 0;
    setHtml($('[data-live="today"]'), humanHtml(today));
    setText($('#ring-pct'), hero.avg > 0 ? `${Math.round(frac * 100)} % de tu promedio` : 'Sin historial para comparar');
    const vals = [...hero.prior, today];
    const max = Math.max(1, hero.avg, ...vals);
    document.querySelectorAll('#bars i').forEach((b, i) => { b.style.height = `${(vals[i] / max) * 100}%`; });
    const avg = $('#bars-avg');
    avg.style.display = hero.avg > 0 ? '' : 'none';
    avg.style.bottom = `${(hero.avg / max) * 100}%`;
    setText(avg.firstChild, `promedio ${S.human(hero.avg)}`);
  }

  // Un carril por tarea (en orden de inicio) + banda de sesiones arriba + linea de "ahora".
  // Se redibuja sola cada minuto desde tick() para que avance sin esperar un cambio de estado.
  function timelineHtml() {
    const now = Date.now();
    tlMinute = Math.floor(now / 60e3);
    const t0 = S.startOfDay(now);
    const ivs = [];
    for (const iv of intervalsNow()) {
      for (const seg of S.splitByDay(iv.start, iv.end)) if (seg.day === t0) ivs.push({ taskId: iv.taskId, start: seg.start, end: seg.end });
    }
    const sess = hist.sessions.filter((s) => s.endedAt >= t0).map((s) => ({ start: Math.max(s.startedAt, t0), end: s.endedAt }));
    if (snap.session) sess.push({ start: Math.max(snap.session.startedAt, t0), end: now });
    if (!ivs.length && !sess.length) return '<div class="empty">Todavía no trabajaste en ninguna tarea hoy.</div>';

    const H = 3600e3;
    const lo = Math.floor(Math.min(...ivs.map((i) => i.start), ...sess.map((s) => s.start), now - H) / H) * H;
    const hi = Math.max(Math.ceil(now / H) * H, lo + 4 * H);
    const pct = (ts) => ((ts - lo) / (hi - lo)) * 100;
    const hm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const seg = (cls, a, b, c, title) => `<div class="${cls}" style="left:${pct(a)}%;width:${Math.max(0.4, pct(b) - pct(a))}%${c ? `;--c:${c}` : ''}" title="${title}"></div>`;

    const T = taskById();
    const lanes = new Map(); // taskId -> intervalos, en orden de primer inicio
    for (const i of ivs.sort((a, b) => a.start - b.start)) {
      if (!lanes.has(i.taskId)) lanes.set(i.taskId, []);
      lanes.get(i.taskId).push(i);
    }

    // filas explicitas: 1 = "ahora", 2 = sesiones, 3.. = tareas, ultima = horas (las capas de grilla/ahora ocupan la columna 2 y el auto-placement las esquivaria)
    const sessMs = sess.reduce((a, s) => a + s.end - s.start, 0);
    let rows = `<div class="tl-name sess dim" style="grid-row:2">Sesiones · ${sess.length}</div><div class="tl-lane sess" style="grid-row:2">${sess.map((s) => seg('tl-sess', s.start, s.end, '', `Sesión · ${hm(s.start)}–${hm(s.end)} · ${S.human(s.end - s.start)}`)).join('')}</div>
      <div class="tl-total sess dim" style="grid-row:2">${S.human(sessMs)}</div>`;
    let r = 2;
    for (const [id, list] of lanes) {
      r++;
      const name = esc((T[id] || { title: '(eliminada)' }).title);
      const c = colorOf(projectOf(id));
      const on = id === snap.activeTaskId ? ' on' : '';
      rows += `<div class="tl-name${on}" style="grid-row:${r}" title="${name}">${name}</div><div class="tl-lane${on}" style="grid-row:${r}">${list.map((i) => seg('tl-seg', i.start, i.end, c, `${name} · ${hm(i.start)}–${hm(i.end)} · ${S.human(i.end - i.start)}`)).join('')}</div>
        <div class="tl-total${on}" style="grid-row:${r}">${S.human(list.reduce((a, i) => a + i.end - i.start, 0))}</div>`;
    }

    let grid = '', axis = '';
    for (let t = lo; t <= hi; t += H) {
      if (t > lo && t < hi) grid += `<i style="left:${pct(t)}%"></i>`;
      const hour = new Date(t).getHours();
      const near = Math.abs(pct(t) - pct(now)) < 4; // no tapar la hora de "ahora"
      if (!near && ((hi - lo) / H <= 10 || hour % 2 === 0)) axis += `<span style="left:${pct(t)}%">${pad(hour)}</span>`;
    }
    return `<div class="tl" style="grid-template-rows:22px 34px repeat(${r - 2}, 28px) 22px"><div class="tl-grid" style="grid-row:2 / ${r + 1}">${grid}</div>${rows}
      <div class="tl-now" style="grid-row:1 / ${r + 1}"><b style="left:${pct(now)}%">${hm(now)}</b><i style="left:${pct(now)}%"></i></div>
      <div class="tl-axis" style="grid-row:${r + 1}">${axis}</div></div>`;
  }

  function viewTareas() {
    const T = snap.tasks.filter((t) => {
      if (filters.project === NONE ? t.project : filters.project && t.project !== filters.project) return false;
      if (filters.status === 'open') return !t.done;
      if (filters.status === 'done') return t.done;
      return true;
    });
    const nOpen = snap.tasks.filter((t) => !t.done && (filters.project === NONE ? !t.project : !filters.project || t.project === filters.project)).length;
    const scope = filters.project === NONE ? 'sin proyecto' : filters.project ? `#${esc(filters.project)}` : 'todos los proyectos';
    const projLabel = filters.project === '' ? 'Todos los proyectos' : filters.project === NONE ? NONE : `#${filters.project}`;
    const stLabel = menuOpts('status').find(([v]) => v === filters.status)[1];
    const effective = form.newProject ? slug(form.newProject) : (form.project !== undefined ? form.project : widgetProject());
    const chipBtn = (name, label, color) => `<button class="chip-btn ${!form.newProject && effective === name ? 'on' : ''}" data-proj="${esc(name)}" style="--c:${color}">${label}</button>`;
    const banner = snap.session && snap.session.project !== undefined
      ? note(`Sesión en curso limitada a <b>${snap.session.project ? '#' + esc(snap.session.project) : 'tareas sin proyecto'}</b>: las tareas de otros proyectos se ven acá, pero no se pueden activar hasta terminar la sesión.`) : '';
    return `${head('Tareas', `${nOpen} ${nOpen === 1 ? 'abierta' : 'abiertas'} · ${scope}`)}${banner}
      <div class="create">
        <div class="tile">
          <h3>Nueva tarea</h3>
          <input type="text" id="nt-title" class="big" placeholder="¿Qué hay que hacer?" autocomplete="off" value="${esc(form.title)}">
          <div class="lbl">Proyecto</div>
          <div class="chips">${chipBtn('', 'sin proyecto', GREY)}${snap.projects.map((p) => chipBtn(p.name, '#' + esc(p.name), p.color)).join('')}</div>
          <input type="text" id="nt-new" placeholder="…o escribí un proyecto nuevo" autocomplete="off" value="${esc(form.newProject)}">
          <div class="actions">
            <button class="btn primary" id="nt-add">Agregar tarea</button>
            <span class="hint">Enter también agrega · un #tag en el título tiene prioridad</span>
          </div>
        </div>
        <div class="tile">
          <h3>Agregar varias</h3>
          <textarea id="nt-bulk" placeholder="Una tarea por línea.&#10;Cada una va al proyecto elegido,&#10;o escribí #proyecto en la línea.">${esc(form.bulk)}</textarea>
          <div class="actions">
            <button class="btn" id="nt-bulk-add">Agregar todas</button>
            <span class="hint">Proyecto: ${effective ? '#' + esc(effective) : 'sin proyecto'}</span>
          </div>
        </div>
      </div>
      <div class="filters">
        <button class="menu-btn" id="f-project" data-menu="project" aria-haspopup="listbox">${esc(projLabel)}${ic('chevrons')}</button>
        <button class="menu-btn" id="f-status" data-menu="status" aria-haspopup="listbox">${stLabel}${ic('chevrons')}</button>
      </div>
      <datalist id="projects">${snap.projects.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
      ${T.length ? `<div class="glist tblw"><table><thead><tr><th style="width:34px"></th><th>Tarea</th><th style="width:150px">Proyecto</th><th class="num" style="width:96px">Tiempo</th><th style="width:84px">Creada</th><th style="width:112px"></th></tr></thead><tbody>
      ${T.map((t) => `<tr data-id="${t.id}" class="${t.done ? 'done' : ''} ${t.id === snap.activeTaskId ? 'active' : ''} ${inScope(t) ? '' : 'out'}">
        <td><button class="chk" role="checkbox" aria-checked="${t.done ? 'true' : 'false'}" aria-label="Hecha" data-act="done">${ic('check')}</button></td>
        <td class="t"><input class="cell" data-f="title" value="${esc(t.title)}"></td>
        <td><input class="cell" data-f="project" list="projects" value="${esc(t.project || '')}" placeholder="—"></td>
        <td class="num" data-live="taskh:${t.id}">${S.human(snap.taskMs[t.id] || 0)}</td>
        <td class="muted">${new Date(t.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}${t.archived ? ' · arch.' : ''}</td>
        <td><div class="row-actions">
          ${t.done ? '' : `<button class="ib" data-act="active" ${inScope(t) ? 'title="Hacer activa"' : 'disabled title="Es de otro proyecto que la sesión en curso"'}>${ic('play', 'f')}</button>`}
          <button class="ib" data-act="up" title="Subir">${ic('up')}</button><button class="ib" data-act="down" title="Bajar">${ic('down')}</button>
          <button class="ib" data-act="del" title="Eliminar">${ic('x')}</button>
        </div></td></tr>`).join('')}</tbody></table></div>` : '<div class="tile empty">No hay tareas con este filtro.</div>'}`;
  }

  function viewProyectos() {
    const T = taskById();
    const agg = {};
    const get = (n) => (agg[n] = agg[n] || { ms: 0, open: 0, done: 0 });
    for (const t of snap.tasks) get(t.project || NONE)[t.done ? 'done' : 'open'] += 1;
    for (const iv of intervalsNow()) get((T[iv.taskId] || {}).project || NONE).ms += iv.end - iv.start;
    const names = Object.keys(agg).sort((a, b) => agg[b].ms - agg[a].ms);
    const max = Math.max(1, ...names.map((n) => agg[n].ms));
    if (!names.length) return `${head('Proyectos', 'Sin proyectos todavía')}<div class="tile empty">Creá tareas con #proyecto para verlos acá.</div>`;
    const cur = widgetProject() || NONE;
    const useBtn = (n) => (n === cur ? '<span class="muted">en el widget</span>'
      : `<button class="btn" data-use="${esc(n === NONE ? '' : n)}" ${snap.session ? 'disabled title="Terminá la sesión para cambiar de proyecto"' : 'title="Trabajar en este proyecto desde el widget"'}>Usar</button>`);
    const total = names.reduce((a, n) => a + agg[n].ms, 0);
    return `${head('Proyectos', `${names.length} ${names.length === 1 ? 'proyecto' : 'proyectos'} · ${S.human(total)} en total`)}
      <div class="glist tblw"><table><thead><tr><th style="width:36px"></th><th>Proyecto</th><th class="num">Abiertas</th><th class="num">Hechas</th><th class="num">Tiempo total</th><th style="width:28%">Reparto</th><th style="width:100px"></th></tr></thead><tbody>
      ${names.map((n) => `<tr class="sel">
        <td>${n === NONE ? '' : `<input type="color" data-color="${esc(n)}" value="${colorOf(n)}" title="Color del proyecto">`}</td>
        <td>${n === NONE ? `<span class="muted">${NONE}</span>` : `#${esc(n)}`}</td>
        <td class="num">${agg[n].open}</td><td class="num">${agg[n].done}</td><td class="num">${S.human(agg[n].ms)}</td>
        <td><div class="bar-track"><div class="bar-fill" style="--c:${colorOf(n)};width:${(agg[n].ms / max) * 100}%"></div></div></td>
        <td style="text-align:right">${useBtn(n)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function viewSesiones() {
    const T = taskById();
    const list = hist.sessions.slice().sort((a, b) => b.startedAt - a.startedAt);
    const min = Math.round((snap.opts.minSessionMs || 0) / 60000);
    const rule = note(`Solo se guardan las sesiones de al menos <b>${min} min</b>${snap.opts.requireCompleted ? ' con <b>al menos una tarea completada</b>' : ''}. Se cambia en Ajustes.`, 'info', 'clock');
    const total = list.reduce((a, s) => a + s.duration, 0);
    const sub = list.length ? `${list.length} ${list.length === 1 ? 'sesión' : 'sesiones'} · ${S.human(total)} en total` : 'Sin sesiones guardadas';
    if (!list.length) return `${head('Sesiones', sub)}${rule}<div class="tile empty">Las sesiones terminadas aparecen acá.</div>`;
    const time = (ts) => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${head('Sesiones', sub)}${rule}<div class="glist tblw"><table><thead><tr><th>Fecha</th><th>Horario</th><th>Proyecto</th><th class="num">Duración</th><th class="num">Pausas</th><th style="padding-left:24px">Tareas</th></tr></thead><tbody>
      ${list.map((s) => `<tr class="sel">
        <td class="nw">${new Date(s.startedAt).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
        <td class="muted nw num-t">${time(s.startedAt)} – ${time(s.endedAt)}</td>
        <td>${s.project ? chip(s.project) : '<span class="muted">—</span>'}</td>
        <td class="num">${S.human(s.duration)}</td><td class="num">${s.pauses}</td>
        <td class="tm" style="padding-left:24px"><div class="tasks-mini">${Object.entries(s.tasks || {}).sort((a, b) => b[1] - a[1]).map(([id, ms]) => `<span><b>${esc((T[id] || { title: '(eliminada)' }).title)}</b> ${S.human(ms)}</span>`).join('') || '<span>—</span>'}</div></td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- gráficos (Chart.js con la gramática de Swift Charts) ----------

  let gm = null; // modelo de datos de la vista de gráficos
  const hrs = (ms) => Math.round((ms / 3600e3) * 100) / 100;
  const pname = (p) => (p === NONE ? NONE : `#${p}`);

  function chartModel() {
    const byDay = S.msByDayProject(intervalsNow(), projectOf);
    const today = S.startOfDay(Date.now());
    const days = Array.from({ length: 14 }, (_, i) => S.addDays(today, i - 13));
    const projects = [...new Set(days.flatMap((d) => Object.keys(byDay[d] || {})))];
    const since = S.addDays(today, -29);
    const share = {};
    for (const [d, m] of Object.entries(byDay)) if (+d >= since) for (const [p, ms] of Object.entries(m)) share[p] = (share[p] || 0) + ms;
    const names = Object.keys(share);
    const w0 = S.weekStart(Date.now());
    const weeks = Array.from({ length: 8 }, (_, i) => S.addDays(w0, (i - 7) * 7));
    const perWeek = Object.fromEntries(weeks.map((w) => [w, 0]));
    for (const [d, m] of Object.entries(byDay)) { const w = S.weekStart(+d); if (w in perWeek) perWeek[w] += S.sumMs(m); }
    return { byDay, days, projects, share, names, weeks, perWeek };
  }

  const legendHtml = (items) => `<div class="legend">${items.map(([label, c, extra]) => `<span style="--c:${c}">${esc(label)}${extra ? ` <em style="font-style:normal;color:var(--label-3)">${extra}</em>` : ''}</span>`).join('')}</div>`;

  function viewGraficos() {
    if (!intervalsNow().length) return `${head('Gráficos', 'Sin datos todavía')}<div class="tile empty">Todavía no hay datos: iniciá una sesión y trabajá en una tarea.</div>`;
    gm = chartModel();
    const total14 = gm.days.reduce((a, d) => a + S.sumMs(gm.byDay[d]), 0);
    return `${head('Gráficos', `${S.human(total14)} en los últimos 14 días`)}<div class="charts">
      <div class="tile"><h3>Horas por día · 14 días</h3><div class="chart-box"><canvas id="c-days"></canvas></div>${legendHtml(gm.projects.map((p) => [pname(p), colorOf(p)]))}</div>
      <div class="tile"><h3>Por proyecto · 30 días</h3><div class="chart-box dn"><canvas id="c-proj"></canvas></div>${legendHtml(gm.names.map((p) => [pname(p), colorOf(p), S.human(gm.share[p])]))}</div>
      <div class="tile wide"><h3>Tendencia semanal · horas por semana</h3><div class="chart-box"><canvas id="c-weeks"></canvas></div></div>
    </div>`;
  }

  // Tooltip propio con material: título, una fila por serie (con su punto) y total si hay varias.
  function externalTip(titleOf, sum) {
    return ({ chart, tooltip }) => {
      const box = chart.canvas.parentNode;
      let el = box.querySelector('.ctip');
      if (!el) { el = document.createElement('div'); el.className = 'ctip'; box.appendChild(el); }
      if (tooltip.opacity === 0) { el.style.opacity = 0; return; }
      const pts = tooltip.dataPoints.filter((p) => p.raw > 0);
      if (!pts.length) { el.style.opacity = 0; return; }
      const colorFor = (p) => { const c = p.dataset.backgroundColor; return Array.isArray(c) ? c[p.dataIndex] : (typeof c === 'string' ? c : cssVar('--accent')); };
      el.innerHTML = `<div class="tt">${esc(titleOf(pts[0]))}</div>${pts.slice().reverse().map((p) => `<div class="tr"><i style="--c:${colorFor(p)}"></i><em>${esc(p.dataset.label)}</em><b>${S.human(p.raw * 3600e3)}</b></div>`).join('')}${sum && pts.length > 1 ? `<div class="tr sum"><em>Total</em><b>${S.human(pts.reduce((a, p) => a + p.raw, 0) * 3600e3)}</b></div>` : ''}`;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let left = tooltip.caretX + 14;
      if (left + w > box.clientWidth) left = tooltip.caretX - w - 14;
      el.style.left = `${Math.max(0, left)}px`;
      el.style.top = `${Math.min(Math.max(0, tooltip.caretY - h / 2), Math.max(0, box.clientHeight - h))}px`;
      el.style.opacity = 1;
    };
  }

  function drawCharts(animate) {
    const C = window.Chart;
    const sans = cssVar('--sans');
    const label = cssVar('--label');
    const label2 = cssVar('--label-2');
    const accent = cssVar('--accent');
    C.defaults.color = label2;
    C.defaults.borderColor = cssVar('--sep');
    C.defaults.font.family = sans;
    C.defaults.font.size = 11;
    // animación solo al abrir la vista (600 ms); al cambiar de tema o repintar por un cambio de estado, ninguna
    const base = { maintainAspectRatio: false, animation: animate ? { duration: 600, easing: 'easeOutQuart' } : false, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
    const hLabel = (v) => (v === 0 ? '0' : `${String(v).replace('.', ',')} h`);
    const { byDay, days, projects, share, names, weeks, perWeek } = gm;
    const fmtDay = (d) => new Date(d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

    // barras apiladas: radio solo en el segmento de arriba de cada día
    const data = projects.map((p) => days.map((d) => hrs((byDay[d] || {})[p] || 0)));
    const topIdx = days.map((_, i) => { for (let k = projects.length - 1; k >= 0; k--) if (data[k][i] > 0) return k; return -1; });
    charts.push(new C($('#c-days'), {
      type: 'bar',
      data: {
        labels: days.map((d) => `${'DLMXJVS'[new Date(d).getDay()]} ${new Date(d).getDate()}`),
        datasets: projects.map((p, k) => ({
          label: pname(p), backgroundColor: colorOf(p), data: data[k], stack: 's', borderWidth: 0, borderSkipped: false,
          borderRadius: (c) => (c.datasetIndex === topIdx[c.dataIndex] ? { topLeft: 5, topRight: 5 } : 0),
          categoryPercentage: 0.7, barPercentage: 0.9,
        })),
      },
      options: {
        ...base,
        interaction: { mode: 'index', intersect: false },
        plugins: { ...base.plugins, tooltip: { enabled: false, external: externalTip((p) => fmtDay(days[p.dataIndex]), true) } },
        scales: {
          x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 6 } },
          y: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: cssVar('--sep'), drawTicks: false }, ticks: { maxTicksLimit: 4, padding: 8, callback: hLabel } },
        },
      },
    }));

    // dona fina con el total en el centro
    const totalMs = names.reduce((a, p) => a + share[p], 0);
    const center = {
      id: 'center',
      afterDraw(chart) {
        const { ctx, chartArea: a } = chart;
        const x = (a.left + a.right) / 2;
        const y = (a.top + a.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = label;
        ctx.font = `650 17px ${sans}`;
        ctx.fillText(S.human(totalMs), x, y - 7);
        ctx.fillStyle = label2;
        ctx.font = `500 11px ${sans}`;
        ctx.fillText('en 30 días', x, y + 12);
        ctx.restore();
      },
    };
    charts.push(new C($('#c-proj'), {
      type: 'doughnut',
      data: { labels: names.map(pname), datasets: [{ data: names.map((p) => hrs(share[p])), backgroundColor: names.map(colorOf), borderWidth: 0, spacing: 2, borderRadius: 4 }] },
      options: { ...base, cutout: '72%', plugins: { ...base.plugins, tooltip: { enabled: false, external: externalTip((p) => names.length ? pname(names[p.dataIndex]) : '', false) } } },
      plugins: [center],
    }));

    // tendencia: línea recta entre puntos (tension 0: nada de picos que no están en los datos) y área en gradiente del acento
    const rgb = cssVar('--accent-rgb');
    charts.push(new C($('#c-weeks'), {
      type: 'line',
      data: {
        labels: weeks.map((w) => new Date(w).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })),
        datasets: [{
          label: 'Horas', data: weeks.map((w) => hrs(perWeek[w])), borderColor: accent, borderWidth: 2.5, tension: 0, fill: true,
          backgroundColor: (c) => {
            const a = c.chart.chartArea;
            if (!a) return 'transparent';
            const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
            g.addColorStop(0, `rgba(${rgb}, 0.22)`);
            g.addColorStop(1, `rgba(${rgb}, 0)`);
            return g;
          },
          pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 24, pointHoverBackgroundColor: accent, pointHoverBorderColor: cssVar('--bg-2'), pointHoverBorderWidth: 2,
          borderCapStyle: 'round', borderJoinStyle: 'round',
        }],
      },
      options: {
        ...base,
        interaction: { mode: 'index', intersect: false },
        plugins: { ...base.plugins, tooltip: { enabled: false, external: externalTip((p) => `Semana del ${new Date(weeks[p.dataIndex]).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}`, false) } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: cssVar('--sep'), drawTicks: false }, ticks: { maxTicksLimit: 4, padding: 8, callback: hLabel } },
        },
      },
    }));
  }

  // ---------- ajustes ----------

  // control segmentado con perilla que se desliza: se pinta desde la posición anterior y se mueve en el siguiente cuadro
  function seg(key, options, current, disabledFn) {
    const idx = Math.max(0, options.findIndex(([v]) => String(v) === String(current)));
    const from = key in ctlPrev ? ctlPrev[key] : idx;
    return `<div class="seg" style="--n:${options.length}"><i class="th" style="--i:${from}" data-ctl="${key}" data-to="${idx}"></i>${options.map(([v, label]) =>
      `<button data-cfg="${key}" data-val="${v}" class="${String(current) === String(v) ? 'on' : ''}" ${disabledFn && disabledFn(v) ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
  }

  function toggle(key, on) {
    const from = key in ctlPrev ? ctlPrev[key] : String(on);
    return `<button class="switch" role="switch" aria-checked="${from}" data-ctl="${key}" data-to="${on}" data-cfg="${key}" data-val="${!on}"></button>`;
  }

  // las perillas y los switches se mueven desde donde estaban hasta donde deben estar
  function settleCtls() {
    const els = [...document.querySelectorAll('#view [data-ctl][data-to]')];
    if (!els.length) return;
    els.forEach((el) => { ctlPrev[el.dataset.ctl] = el.dataset.to; });
    requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((el) => {
      if (!el.isConnected) return;
      if (el.getAttribute('role') === 'switch') el.setAttribute('aria-checked', el.dataset.to);
      else el.style.setProperty('--i', el.dataset.to);
    })));
  }

  function viewAjustes() {
    const linux = api.platform === 'linux';
    const accent = (cfg.accent || window.Theme.DEFAULT_ACCENT).toLowerCase();
    const sys = window.Theme.SYSTEM;
    const custom = !sys.some(([, l, d]) => l === accent || d === accent);
    const op = Number(cfg.ghostOpacity);
    const group = (rows) => `<div class="glist">${rows.map(([what, desc, ctl]) => `<div class="row set-row"><div class="what"><b>${what}</b><span>${desc}</span></div>${ctl}</div>`).join('')}</div>`;
    return `${head('Ajustes', 'Apariencia, widget y sesiones')}
      <div class="gh">Apariencia</div>
      ${group([
        ['Tema', 'Se aplica al widget y al dashboard.', seg('theme', [['dark', 'Oscuro'], ['light', 'Claro']], cfg.theme)],
        ['Color de acento', 'Resalta la selección, el reloj y los estados. Se ajusta solo para mantener un contraste legible en cada tema.',
          `<div class="swatches">${sys.map(([name, l, d]) => `<button class="sw ${!custom && (l === accent || d === accent) ? 'on' : ''}" data-accent="${l}" style="--c:${theme === 'light' ? l : d}" title="${name}" aria-label="${name}"></button>`).join('')}<span class="sw multi ${custom ? 'custom on' : ''}" style="--c:${accent}" title="Otro color"><input type="color" id="cfg-accent" value="${accent}" aria-label="Otro color"></span></div>`],
      ])}
      <div class="gh">Widget</div>
      ${group([
        ['Widget en reposo', `<strong>Píldora:</strong> solo el reloj de la tarea, que avanza de a 5 s.<br><strong>Círculo:</strong> solo el logo arriba a la derecha; al pasar el mouse aparece el panel con ambos relojes en vivo.${linux ? '<br>El círculo no está disponible en Linux: el mouse no se detecta a través de una ventana transparente.' : ''}`,
          seg('ghostStyle', [['pill', 'Píldora'], ['dot', 'Círculo']], cfg.ghostStyle, (v) => v === 'dot' && linux)],
        ['Opacidad del fondo en reposo', 'Qué tan visible es el fondo del widget cuando no lo usás. El texto siempre se ve opaco.',
          `<input type="range" id="cfg-opacity" min="0.2" max="1" step="0.05" value="${op}" style="--p:${((op - 0.2) / 0.8) * 100}%">`],
      ])}
      <div class="gh">Sesiones</div>
      ${group([
        ['Duración mínima de una sesión', 'Las sesiones más cortas no se guardan (minutos; 0 para guardarlas todas).',
          `<input type="number" id="cfg-min" min="0" max="240" step="1" value="${cfg.minSessionMinutes}">`],
        ['Exigir una tarea completada', 'Una sesión sin ninguna tarea completada no se guarda, sin importar cuánto dure.', toggle('requireCompletedTask', cfg.requireCompletedTask !== false)],
      ])}
      <h2>Atajos de teclado</h2>
      ${note('Los atajos globales se editan en <code>config.json</code> (clave <code>shortcuts</code>; hace falta reiniciar). Las teclas del panel y del dashboard son fijas. <kbd>?</kbd> abre esta hoja en cualquier momento.', 'info', 'keyboard')}
      <div class="tile keymap">${keymapHtml()}</div>`;
  }

  // ---------- mapa de teclas (Ajustes y hoja de ayuda) ----------

  const accel = (a) => esc(String(a || '—').replace('Control', 'Ctrl'));
  function keymap() {
    const sc = cfg.shortcuts || {};
    // Regla: la letra es la primera de la accion (las mas frecuentes mandan); las que tienen tecla estandar la usan.
    return [
      ['Globales (desde cualquier programa)', [[accel(sc.togglePanel), 'abrir / cerrar el panel'], [accel(sc.capture), 'captura rápida: agregar una tarea'], [accel(sc.leader), 'tecla líder (2 s de teclas sueltas)'], [accel(sc.completeCurrent), 'completar la tarea actual'], [accel(sc.togglePause), 'iniciar / pausar sesión'], [accel(sc.dashboard), 'abrir el dashboard']]],
      ['Tecla líder', [['↑ / ↓', 'tarea anterior / siguiente'], ['h', 'completar la actual'], ['p / r', 'pausar / reanudar'], ['i', 'iniciar sesión'], ['t', 'terminar sesión (dos veces si se descarta)'], ['n', 'nueva tarea'], ['Ctrl+Z', 'deshacer'], ['a / d', 'abrir panel / dashboard'], ['c', 'claro / oscuro'], ['Esc', 'cancelar']]],
      ['Panel · modo NORMAL', [['↑ ↓', 'elegir'], ['Home End · 1-9', 'inicio / fin · por número'], ['Alt+↑↓', 'reordenar'], ['n', 'nueva tarea (INSERT)'], ['h Espacio', 'hecha / reabrir'], ['Enter a', 'activar'], ['b b · Supr', 'borrar'], ['Ctrl+Z', 'deshacer'], ['l', 'limpiar hechas'], ['i p r t t', 'iniciar · pausar · reanudar · terminar'], ['c d ?', 'claro/oscuro · dashboard · ayuda'], ['Esc', 'salir']]],
      ['Dashboard', [['F1–F6 · 1–6', 'cambiar de vista'], ['↑ ↓', 'fila / desplazar'], ['Home End', 'inicio / fin'], ['h Espacio', 'hecha / reabrir'], ['a Enter', 'activar'], ['b b', 'borrar'], ['Alt+↑↓', 'reordenar'], ['r', 'renombrar'], ['n', 'nueva tarea'], ['p e', 'filtro: proyecto · estado'], ['Ctrl+Z', 'deshacer'], ['c ?', 'claro/oscuro · ayuda'], ['Esc', 'salir del campo']]],
    ];
  }
  const keymapHtml = () => keymap().map(([title, rows]) => `<div><h3>${title}</h3><div class="shortcuts">${rows.map(([k, d]) => `<span class="kbd">${k}</span><span>${d}</span>`).join('')}</div></div>`).join('');

  const VIEWS = { ajustes: viewAjustes, hoy: viewHoy, tareas: viewTareas, proyectos: viewProyectos, sesiones: viewSesiones, graficos: viewGraficos };

  // ---------- render / live ----------

  function render() {
    if (!snap) return;
    dirty = false;
    const enter = entering;
    entering = false;
    charts.forEach((c) => c.destroy());
    charts = [];
    const main = $('#view');
    const scroll = main.scrollTop;
    main.innerHTML = `<div class="page${enter ? ' enter' : ''}">${VIEWS[view]()}</div>`;
    main.scrollTop = scroll;
    if (view === 'graficos' && $('#c-days')) document.fonts.ready.then(() => { if ($('#c-days') && !charts.length) drawCharts(enter); }); // el canvas no redibuja si la fuente llega tarde
    if (view === 'ajustes') settleCtls();
    if (focusTitle && $('#nt-title')) { $('#nt-title').focus(); focusTitle = false; }
    document.querySelectorAll('#nav button').forEach((b) => { const on = b.dataset.view === view; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    applyCursor();
    renderHint();
    tick();
  }

  // ---------- cursor de teclado en la tabla de tareas ----------

  const rowsEl = () => [...document.querySelectorAll('#view tr[data-id]')];

  function applyCursor() {
    document.querySelectorAll('tr.cur').forEach((r) => r.classList.remove('cur'));
    if (view !== 'tareas' || !curId) return;
    const row = rowsEl().find((r) => r.dataset.id === curId);
    if (row) row.classList.add('cur'); else curId = null;
  }

  function moveCur(delta, absolute) {
    const rows = rowsEl();
    if (!rows.length) return;
    let i = rows.findIndex((r) => r.dataset.id === curId);
    i = absolute !== undefined ? absolute : (i < 0 ? (delta > 0 ? 0 : rows.length - 1) : i + delta);
    i = Math.min(rows.length - 1, Math.max(0, i));
    curId = rows[i].dataset.id;
    applyCursor();
    rows[i].scrollIntoView({ block: 'nearest' });
  }

  function tick() {
    if (!snap) return;
    const now = Date.now();
    const d = snap.open ? now - snap.at : 0;
    if (view === 'hoy' && hero && hero.t0 !== S.startOfDay(now)) { render(); return; } // cruzó la medianoche
    document.querySelectorAll('[data-live]').forEach((el) => {
      const [kind, id] = el.dataset.live.split(':');
      if (kind === 'session') setText(el, S.clock(snap.session ? snap.session.ms + (snap.running ? now - snap.at : 0) : 0));
      else if (kind === 'task') setText(el, S.clock((snap.taskMs[id] || 0) + (snap.open && snap.open.taskId === id ? d : 0)));
      else if (kind === 'taskh') setText(el, S.human((snap.taskMs[id] || 0) + (snap.open && snap.open.taskId === id ? d : 0)));
    });
    if (view === 'hoy') paintHero(now);
    const tl = view === 'hoy' && $('#timeline');
    if (tl && Math.floor(now / 60e3) !== tlMinute) tl.innerHTML = timelineHtml();
    const s = snap.session;
    $('#live').dataset.s = !s ? 'none' : s.status === 'running' ? 'run' : 'pause';
    setText($('#live-t'), !s ? 'Sin sesión' : s.status === 'running' ? 'En curso' : 'Pausada');
    setText($('#live-v'), s ? S.clock(s.ms + (snap.running ? now - snap.at : 0)) : '');
  }

  const editing = () => { const a = document.activeElement; return a && $('#view').contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName); };

  async function refresh() {
    [snap, hist] = await Promise.all([api.getState(), api.getHistory()]);
    if (editing()) dirty = true; else render();
  }

  // ---------- transiciones (View Transitions: cambio de vista y de tema) ----------

  function transition(fn, ms, isView) {
    const root = document.documentElement;
    if (!document.startViewTransition || reduced()) { fn(); return; }
    root.style.setProperty('--vt', `${ms}ms`);
    root.classList.toggle('vt-view', !!isView);
    const t = document.startViewTransition(fn);
    t.ready.catch(() => {});
    t.finished.catch(() => {}).then(() => root.classList.remove('vt-view'));
  }

  // ---------- menú desplegable ----------

  function menuOpts(kind) {
    return kind === 'project'
      ? [['', 'Todos los proyectos'], [NONE, NONE], ...snap.projects.map((p) => [p.name, `#${p.name}`])]
      : [['open', 'Abiertas'], ['done', 'Hechas'], ['all', 'Todas']];
  }

  function closeMenu() {
    if (!menu) return;
    menu.el.remove();
    menu.btn.classList.remove('open');
    menu = null;
  }

  function menuHi(i) {
    menu.idx = Math.min(menu.opts.length - 1, Math.max(0, i));
    [...menu.el.children].forEach((c, k) => c.classList.toggle('hi', k === menu.idx));
    menu.el.children[menu.idx].scrollIntoView({ block: 'nearest' });
  }

  function pickMenu(i) {
    const { opts, pick } = menu;
    closeMenu();
    pick(opts[i][0]);
  }

  // el menú nace desde el botón: escala .96 → 1 + opacidad, con el origen en el disparador
  function openMenu(btn, opts, current, pick) {
    closeMenu();
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'listbox');
    el.innerHTML = opts.map(([v, l]) => `<div class="mi" role="option" aria-selected="${v === current}"><span class="ck">${v === current ? ic('check') : ''}</span><span>${esc(l)}</span></div>`).join('');
    document.body.appendChild(el);
    const r = btn.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8));
    let top = r.bottom + 6;
    const up = top + el.offsetHeight > innerHeight - 8;
    if (up) top = Math.max(8, r.top - 6 - el.offsetHeight);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.setProperty('--ox', `${r.left + 16 - left}px`);
    el.style.setProperty('--oy', up ? '100%' : '0');
    btn.classList.add('open');
    menu = { el, btn, opts, pick, idx: 0 };
    menuHi(Math.max(0, opts.findIndex(([v]) => v === current)));
    el.addEventListener('mousemove', (e) => { const k = [...el.children].indexOf(e.target.closest('.mi')); if (k >= 0 && k !== menu.idx) menuHi(k); });
    el.addEventListener('click', (e) => { const k = [...el.children].indexOf(e.target.closest('.mi')); if (k >= 0) pickMenu(k); });
  }

  function menuKey(e) {
    const k = e.key;
    if (k === 'ArrowDown') menuHi(menu.idx + 1);
    else if (k === 'ArrowUp') menuHi(menu.idx - 1);
    else if (k === 'Home') menuHi(0);
    else if (k === 'End') menuHi(menu.opts.length - 1);
    else if (k === 'Enter' || k === ' ') pickMenu(menu.idx);
    else if (k === 'Escape' || k === 'Tab') closeMenu();
    if (k !== 'Tab') e.preventDefault();
  }

  document.addEventListener('mousedown', (e) => {
    if (menu && !menu.el.contains(e.target) && !menu.btn.contains(e.target)) closeMenu();
  });
  window.addEventListener('blur', closeMenu);

  // ---------- avisos: aviso de la toolbar y HUD ----------

  function showNotice(text, ms = 7000) {
    const n = $('#notice');
    n.style.setProperty('--icon-cut', 'var(--bg)');
    n.innerHTML = `${ic('warn')}<span>${esc(text)}</span>`;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { n.innerHTML = ''; }, ms);
  }
  api.onNotice((text) => showNotice(text));

  // cápsula abajo al centro; si llega otra reemplaza a la anterior sin apilarse
  function showHud(text, icon, undo) {
    const h = $('#hud');
    h.innerHTML = `${icon ? ic(icon) : ''}<span class="t">${esc(text)}</span>${undo ? '<span class="hk"><kbd>Ctrl</kbd><kbd>Z</kbd></span>' : ''}`;
    h.classList.add('show');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => h.classList.remove('show'), 2800);
  }

  // ---------- eventos ----------

  // las acciones que se pueden deshacer con Ctrl+Z lo avisan en el HUD
  function dispatch(a, p) {
    if (a === 'deleteTask') showHud('Tarea borrada', 'trash', true);
    else if (a === 'toggleDone') {
      const t = snap.tasks.find((x) => x.id === p.id);
      if (t) showHud(t.done ? 'Tarea reabierta' : 'Tarea completada', 'check', true);
    }
    return api.dispatch(a, p);
  }

  function go(v) {
    if (!VIEWS[v]) return;
    closeMenu();
    const change = v !== view;
    transition(() => {
      view = v;
      entering = change;
      if (change) Object.keys(ctlPrev).forEach((k) => delete ctlPrev[k]);
      curId = null;
      setPending(null);
      render();
      $('#view').scrollTop = 0;
    }, 200, true);
  }

  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) go(b.dataset.view);
  });

  const main = $('#view');
  main.addEventListener('scroll', () => $('#toolbar').classList.toggle('scrolled', main.scrollTop > 4), { passive: true });

  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const id = b.closest('tr').dataset.id;
    if (b.dataset.act === 'done') dispatch('toggleDone', { id });
    else if (b.dataset.act === 'active') dispatch('setActive', { id });
    else if (b.dataset.act === 'up') dispatch('moveTask', { id, dir: -1 });
    else if (b.dataset.act === 'down') dispatch('moveTask', { id, dir: 1 });
    else if (b.dataset.act === 'del' && confirm('¿Eliminar esta tarea? El tiempo registrado se conserva en el historial.')) dispatch('deleteTask', { id });
  });

  main.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'cfg-opacity') { api.setConfig({ ghostOpacity: Number(el.value) }); return; }
    if (el.id === 'cfg-accent') { api.setConfig({ accent: el.value }); return; }
    if (el.id === 'cfg-min') { api.setConfig({ minSessionMinutes: Math.min(240, Math.max(0, Math.round(Number(el.value) || 0))) }); return; }
    const row = el.closest('tr');
    if (el.dataset.f === 'title') dispatch('updateTask', { id: row.dataset.id, title: el.value });
    else if (el.dataset.f === 'project') dispatch('updateTask', { id: row.dataset.id, project: el.value.replace(/^#/, '').trim() });
    else if (el.dataset.color) dispatch('setProjectColor', { name: el.dataset.color, color: el.value });
  });

  // proyecto elegido en el formulario ('' = sin proyecto)
  const formProject = () => (form.newProject ? slug(form.newProject) : (form.project !== undefined ? form.project : widgetProject()));

  function addOne() {
    const title = form.title.trim();
    if (!title) { $('#nt-title').focus(); return; }
    const project = formProject() || null;
    form.title = '';
    form.newProject = '';
    form.project = project || '';
    focusTitle = true;
    dispatch('addTask', { title, project });
  }

  function addMany() {
    const titles = form.bulk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!titles.length) { $('#nt-bulk').focus(); return; }
    const project = formProject() || null;
    form.bulk = '';
    form.newProject = '';
    form.project = project || '';
    dispatch('addTasks', { titles, project });
  }

  main.addEventListener('input', (e) => {
    if (e.target.id === 'nt-title') form.title = e.target.value;
    else if (e.target.id === 'nt-new') form.newProject = e.target.value;
    else if (e.target.id === 'nt-bulk') form.bulk = e.target.value;
    else if (e.target.id === 'cfg-opacity') e.target.style.setProperty('--p', `${((e.target.value - 0.2) / 0.8) * 100}%`);
  });

  main.addEventListener('keydown', (e) => {
    if ((e.target.id === 'nt-title' || e.target.id === 'nt-new') && e.key === 'Enter') { e.preventDefault(); addOne(); }
    else if (e.target.id === 'nt-bulk' && e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); addMany(); }
    else if (e.key === 'Enter' && e.target.dataset.f) e.target.blur();
  });

  main.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-menu]');
    if (mb) {
      if (menu && menu.btn === mb) { closeMenu(); return; }
      const kind = mb.dataset.menu;
      const key = kind === 'project' ? 'project' : 'status';
      openMenu(mb, menuOpts(kind), filters[key], (v) => { filters[key] = v; render(); });
      return;
    }
    const seg = e.target.closest('[data-cfg]');
    if (seg && !seg.disabled) {
      const v = seg.dataset.val;
      api.setConfig({ [seg.dataset.cfg]: v === 'true' ? true : v === 'false' ? false : v });
      return;
    }
    const sw = e.target.closest('[data-accent]');
    if (sw) { api.setConfig({ accent: sw.dataset.accent }); return; }
    const use = e.target.closest('[data-use]');
    if (use && !use.disabled) { dispatch('setProject', { name: use.dataset.use }); return; }
    const chipEl = e.target.closest('[data-proj]');
    if (chipEl) { form.project = chipEl.dataset.proj; form.newProject = ''; render(); return; }
    if (e.target.id === 'nt-add') addOne();
    else if (e.target.id === 'nt-bulk-add') addMany();
  });

  $('#theme-btn').addEventListener('click', () => api.setTheme(theme === 'light' ? 'dark' : 'light'));

  function applyConfig(c) {
    const next = c.theme === 'light' ? 'light' : 'dark';
    const change = appliedTheme !== null && appliedTheme !== next;
    appliedTheme = next;
    cfg = c;
    theme = next;
    const apply = () => {
      document.documentElement.dataset.theme = next;
      window.Theme.apply(document.documentElement, next, c.accent);
      $('#theme-btn').innerHTML = ic(next === 'light' ? 'moon' : 'sun');
      $('#theme-btn').title = next === 'light' ? 'Cambiar a tema oscuro (c)' : 'Cambiar a tema claro (c)';
      render(); // los graficos leen los colores del tema
      if (helpOpen) $('#dhelp').innerHTML = helpHtml();
    };
    if (change) transition(apply, 250, false); else apply();
  }

  // ---------- teclado ----------

  const isTyping = () => {
    const a = document.activeElement;
    return !!a && a.matches('input:not([type=checkbox]):not([type=range]):not([type=color]), select, textarea');
  };

  const sepDot = '<span class="d">·</span>';
  function renderHint() {
    const typing = isTyping();
    document.body.classList.toggle('typing', typing);
    document.body.classList.toggle('help', helpOpen);
    $('#dmode').textContent = helpOpen ? 'AYUDA' : typing ? 'INSERT' : 'NORMAL';
    const h = $('#dhint');
    if (helpOpen) { h.innerHTML = '<kbd>?</kbd> o <kbd>esc</kbd> cierra'; return; }
    if (typing) { h.innerHTML = `<kbd>esc</kbd> vuelve a normal ${sepDot} <kbd>enter</kbd> confirma`; return; }
    if (pending) { h.innerHTML = `<span class="pend">${pending}-</span> otra <kbd>${pending}</kbd> borra ${sepDot} <kbd>esc</kbd>`; return; }
    const items = view === 'tareas'
      ? ['<kbd>↑↓</kbd> fila', '<u>h</u>echa', '<u>b</u>orrar', '<u>a</u>ctivar', '<u>n</u>ueva', '<u>r</u>enombrar', '<u>p</u>royecto', '<u>e</u>stado', '<kbd>Ctrl+Z</kbd> deshacer']
      : ['<kbd>F1-F6</kbd> vistas', '<kbd>↑↓</kbd> desplazar', '<kbd>c</kbd> claro/oscuro'];
    // #dhint es flex: cada pista en su span, si no la letra subrayada queda separada de su palabra por el gap
    h.innerHTML = items.map((x) => `<span>${x}</span>`).join(sepDot);
  }

  function setPending(k) {
    clearTimeout(pendingTimer);
    pending = k;
    if (k) pendingTimer = setTimeout(() => setPending(null), 1200);
    renderHint();
  }

  const helpHtml = () => `<div class="box"><h1>Atajos</h1><div class="keymap">${keymapHtml()}</div></div>`;
  function setHelp(on) {
    helpOpen = on;
    if (on) $('#dhelp').innerHTML = helpHtml();
    renderHint();
  }

  function cycle(list, cur) { return list[(Math.max(0, list.indexOf(cur)) + 1) % list.length]; }

  function deleteCur() {
    const rows = rowsEl();
    const i = rows.findIndex((r) => r.dataset.id === curId);
    if (i < 0) return;
    const next = (rows[i + 1] || rows[i - 1] || {}).dataset;
    dispatch('deleteTask', { id: curId });
    curId = next ? next.id : null;
  }

  function tasksKey(e) {
    const k = e.key;
    const id = curId;
    if (pending) {
      const p = pending;
      setPending(null);
      if (k === p) {
        e.preventDefault();
        deleteCur();
        return true;
      }
    }
    switch (k) {
      case 'ArrowDown': moveCur(1); break;
      case 'ArrowUp': moveCur(-1); break;
      case 'Home': moveCur(0, 0); break;
      case 'End': moveCur(0, rowsEl().length - 1); break;
      case 'b': if (id) setPending('b'); break;
      case 'h': case ' ': {
        if (!id) break;
        // con el filtro abierto/hechas la fila desaparece al marcarla: el cursor pasa a la vecina
        const t = snap.tasks.find((x) => x.id === id);
        if (t && ((filters.status === 'open' && !t.done) || (filters.status === 'done' && t.done))) {
          const rows = rowsEl();
          const i = rows.findIndex((r) => r.dataset.id === id);
          const next = rows[i + 1] || rows[i - 1];
          curId = next ? next.dataset.id : null;
        }
        dispatch('toggleDone', { id });
        break;
      }
      case 'a': case 'Enter': if (id) dispatch('setActive', { id }); break;
      case 'r': { const inp = document.querySelector('tr.cur input[data-f="title"]'); if (inp) { inp.focus(); inp.select(); } break; }
      case 'n': { const inp = $('#nt-title'); if (inp) { inp.focus(); inp.scrollIntoView({ block: 'nearest' }); } break; }
      case 'p': filters.project = cycle(['', NONE, ...snap.projects.map((p) => p.name)], filters.project); render(); break;
      case 'e': filters.status = cycle(['open', 'done', 'all'], filters.status); render(); break;
      default: return false;
    }
    e.preventDefault();
    return true;
  }

  document.addEventListener('keydown', (e) => {
    if (/^F[1-6]$/.test(e.key)) { e.preventDefault(); go(VIEW_ORDER[Number(e.key.slice(1)) - 1]); return; }
    if (menu) { menuKey(e); return; }
    if (helpOpen) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); setHelp(false); } return; }
    if (isTyping()) { if (e.key === 'Escape') { e.preventDefault(); document.activeElement.blur(); } return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); api.dispatch('undo'); showHud('Deshecho', 'undo', false); return; }
    // Alt+flecha reordena la fila con el cursor (Ctrl+Alt = AltGr queda fuera)
    if (e.altKey && !e.ctrlKey && !e.metaKey && view === 'tareas' && curId && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      dispatch('moveTask', { id: curId, dir: e.key === 'ArrowUp' ? -1 : 1 });
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey || !snap) return;
    const k = e.key;
    if (k === 'Escape') { setPending(null); curId = null; applyCursor(); return; }
    if (/^[1-6]$/.test(k)) { e.preventDefault(); go(VIEW_ORDER[Number(k) - 1]); return; }
    if (k === '?') { e.preventDefault(); setHelp(true); return; }
    if (k === 'c') { e.preventDefault(); api.setTheme(theme === 'light' ? 'dark' : 'light'); return; }
    if (view === 'tareas' && tasksKey(e)) return;
    // otras vistas: desplazar
    const main = $('#view');
    if (k === 'ArrowDown') { main.scrollBy(0, 56); e.preventDefault(); }
    else if (k === 'ArrowUp') { main.scrollBy(0, -56); e.preventDefault(); }
    else if (k === 'Home') { main.scrollTop = 0; e.preventDefault(); }
    else if (k === 'End') { main.scrollTop = main.scrollHeight; e.preventDefault(); }
  });
  document.addEventListener('focusin', renderHint);
  document.addEventListener('focusout', () => setTimeout(renderHint, 0));
  api.onConfig(applyConfig);
  api.getConfig().then(applyConfig);

  main.addEventListener('focusout', () => setTimeout(() => { if (dirty && !editing()) refresh(); }, 50));

  api.onState(() => refresh());
  refresh();
  setInterval(tick, 1000);
})();

'use strict';

const os = require('os');
const path = require('path');
const {
  app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, screen, powerMonitor, nativeImage, nativeTheme, systemPreferences,
} = require('electron');
const { Engine } = require('./session');
const { Store } = require('./store');
const { ANIM_MS, targetFor, frame, createDodge } = require('./dodge');

const { migrateData } = require('./migrate');

const SMOKE = process.env.ECTODO_SMOKE;
const PERF = process.env.ECTODO_PERF;
if (process.env.ECTODO_DATA) app.setPath('userData', process.env.ECTODO_DATA);
else {
  // Carpeta fija en minuscula (igual en desarrollo y empaquetada); la de cuando se llamaba taskghost se migra.
  const appData = app.getPath('appData');
  app.setPath('userData', path.join(appData, 'ectodo'));
  try {
    const copied = migrateData(path.join(appData, 'taskghost'), app.getPath('userData'));
    if (copied.length) console.log('[ectodo] datos migrados de taskghost:', copied.join(', '));
  } catch (e) { console.error('[ectodo] no se pudieron migrar los datos de taskghost:', e); }
}
// En Linux always-on-top y posicionamiento absoluto solo son confiables bajo X11/XWayland.
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11');
const CARD = 320; // ancho visual del widget
const M = 24; // margen transparente alrededor de la tarjeta: ahi vive la sombra (= --M de widget.css)
const WIDTH = CARD + 2 * M; // ancho de la ventana
const MARGIN = 16; // distancia de la tarjeta al borde de la pantalla
const ASSETS = path.join(__dirname, '..', 'assets');
const ICON = path.join(ASSETS, 'icon.png');
// Material Mica del sistema (Windows 11 22H2+) para el dashboard; en el resto, colores sólidos.
const WIN = process.platform === 'win32';
const MICA = WIN && Number(os.release().split('.')[2] || 0) >= 22621;

let store, engine, config, sessions;
let widget = null;
let dashboard = null;
let tray = null;
let mode = 'ghost';
let activatedAt = 0;
let savedPos = null;
let quitting = false;

// ---------- estado y persistencia ----------

function persist() {
  store.saveState({ version: 1, savedAt: Date.now(), ...engine.toJSON(), window: savedPos });
}

function windows() {
  return [widget, dashboard].filter((w) => w && !w.isDestroyed());
}

function broadcast() {
  const snap = engine.snapshot(Date.now());
  for (const w of windows()) w.webContents.send('state', snap);
  rebuildTray();
}

function notify(text) {
  for (const w of windows()) w.webContents.send('notice', text);
}

// Ajustes editables desde la UI: solo estas claves, con su validacion.
const CONFIG_RULES = {
  theme: (v) => v === 'dark' || v === 'light',
  ghostStyle: (v) => v === 'pill' || v === 'dot',
  ghostOpacity: (v) => typeof v === 'number' && v >= 0.2 && v <= 1,
  accent: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
  minSessionMinutes: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 240,
  requireCompletedTask: (v) => typeof v === 'boolean',
};

function setConfig(patch) {
  for (const [k, v] of Object.entries(patch || {})) if (CONFIG_RULES[k] && CONFIG_RULES[k](v)) config[k] = v;
  engine.opts.minSessionMs = Math.round(config.minSessionMinutes * 60000);
  engine.opts.requireCompleted = config.requireCompletedTask !== false;
  store.saveConfig(config);
  applyNativeTheme();
  for (const w of windows()) w.webContents.send('config', config);
  broadcast();
}

const setTheme = (theme) => setConfig({ theme });

// El tema de la app manda sobre el del sistema: tiñe el Mica y los controles de ventana del dashboard.
const overlayFor = (theme) => ({ color: '#00000000', symbolColor: theme === 'light' ? '#1d1d1f' : '#f5f5f7', height: 44 });
function applyNativeTheme() {
  nativeTheme.themeSource = config.theme === 'light' ? 'light' : 'dark';
  if (WIN && dashboard && !dashboard.isDestroyed()) dashboard.setTitleBarOverlay(overlayFor(config.theme));
}

// Termina la sesion y avisa si no se guardo por no cumplir los minimos.
function endSession(now) {
  const res = engine.endSession(now);
  if (res && res.discarded) notify(`Sesión descartada: ${res.reason}`);
}

function commit(fn) {
  fn();
  persist();
  broadcast();
}

// ---------- ventana fantasma ----------

// Las posiciones (guardada, por defecto, de origen del esquive) son las de la TARJETA, no las de la ventana:
// la ventana es M mas grande por lado, asi las posiciones guardadas de antes del margen siguen sirviendo.
function defaultPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - CARD - MARGIN, y: wa.y + MARGIN };
}

function validPosition(p) {
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return false;
  return screen.getAllDisplays().some((d) => {
    const b = d.workArea;
    return p.x + 40 > b.x && p.x < b.x + b.width - 40 && p.y >= b.y - 10 && p.y < b.y + b.height - 40;
  });
}

function createWidget() {
  const pos = validPosition(savedPos) ? savedPos : defaultPosition();
  widget = new BrowserWindow({
    x: pos.x - M, y: pos.y - M, width: WIDTH, height: 80 + 2 * M,
    frame: false, transparent: true, hasShadow: false, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false, title: 'Ectodo',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  widget.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform !== 'win32') widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widget.setIgnoreMouseEvents(true, { forward: true });
  widget.loadFile(path.join(__dirname, 'ui', 'index.html'));
  widget.once('ready-to-show', () => widget.showInactive());
  widget.webContents.on('did-finish-load', () => {
    widget.webContents.send('config', config);
    widget.webContents.send('mode', mode);
    widget.webContents.send('state', engine.snapshot(Date.now()));
  });

  let moveTimer = null;
  widget.on('move', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (widget.isDestroyed() || dodgeHome) return; // apartado del cursor: no es la posicion del usuario
      const [x, y] = widget.getPosition();
      savedPos = { x: x + M, y: y + M };
      persist();
    }, 500);
  });
  startDodge();
  widget.on('blur', () => {
    // Ignora el blur inmediato posterior a activar (Windows a veces tarda en dar foco).
    if (mode !== 'ghost' && Date.now() - activatedAt > 400) setMode('ghost');
  });
}

// mode: 'ghost' (reposo, sin foco) | 'active' (panel) | 'capture' (solo la linea para agregar una tarea)
function setMode(next) {
  if (!widget || widget.isDestroyed() || next === mode) return;
  if (next !== 'ghost') endLeader(); // la lider registra teclas sueltas: nunca conviven con una ventana que escribe
  mode = next;
  if (mode !== 'ghost') {
    stopDodge(); // antes de show/focus: el panel aparece en su lugar, sin la animacion de vuelta
    activatedAt = Date.now();
    widget.setFocusable(true);
    widget.setIgnoreMouseEvents(false);
    widget.show();
    widget.focus();
    widget.webContents.focus(); // el teclado va a la pagina aunque ningun elemento tenga foco (modo NORMAL)
    setTimeout(() => { if (mode !== 'ghost' && !widget.isFocused()) widget.focus(); }, 80);
  } else {
    widget.setIgnoreMouseEvents(true, { forward: true });
    widget.setFocusable(false);
    dodge.disarm();
    startDodge();
  }
  widget.webContents.send('mode', mode);
}

// ---------- esquivar el cursor ----------
// En reposo (estilo pildora) el widget se va al otro lado de la pantalla si el cursor se queda sobre su lugar,
// y vuelve cuando sale. La ventana es click-through y ademas se va de abajo del cursor: el renderer no puede saber
// cuando el cursor deja la esquina, asi que el proceso principal consulta la posicion del cursor.

const DODGE_POLL_MS = 80;
const dodge = createDodge();
let dodgeHome = null; // lugar de origen mientras esta apartado o volviendo; null = en su lugar
let dodgePoll = null;
let dodgeAnim = null;
let cursorAt = () => screen.getCursorScreenPoint(); // el smoke lo reemplaza

// En estilo circulo el hover sobre el logo ya abre el rectangulo: ahi no se aparta.
const dodgeEnabled = () => mode === 'ghost' && !(config.ghostStyle === 'dot' && process.platform !== 'linux');

function stopAnim() {
  clearInterval(dodgeAnim);
  dodgeAnim = null;
}

function richAnimation() {
  try { return systemPreferences.getAnimationSettings().shouldRenderRichAnimation; } catch { return true; }
}

// Mover (no redimensionar) la ventana transparente es barato: un setPosition por frame.
function animateTo(to, onDone) {
  stopAnim();
  const [x, y] = widget.getPosition();
  const from = { x, y };
  const done = () => { stopAnim(); if (onDone) onDone(); };
  if (!richAnimation()) { widget.setPosition(to.x, to.y); done(); return; }
  const t0 = Date.now();
  dodgeAnim = setInterval(() => {
    if (widget.isDestroyed()) { stopAnim(); return; }
    const t = (Date.now() - t0) / ANIM_MS;
    const p = frame(from, to, t);
    widget.setPosition(p.x, p.y);
    if (t >= 1) done();
  }, 16);
}

function dodgeTick() {
  if (!widget || widget.isDestroyed()) return;
  if (!dodgeEnabled()) { if (dodgeHome) resetDodge(); return; }
  const [width, height] = widget.getSize();
  let home = dodgeHome; // posicion de la VENTANA de origen
  if (!home) { const [x, y] = widget.getPosition(); home = { x, y }; }
  // la zona es la tarjeta (la ventana sin el margen de la sombra): el cursor sobre la sombra no cuenta
  const zone = { x: home.x + M, y: home.y + M, width: width - 2 * M, height: height - 2 * M };
  const act = dodge.step(cursorAt(), zone, Date.now());
  if (act === 'away') {
    dodgeHome = home;
    const to = targetFor(zone, screen.getDisplayMatching(zone).workArea, MARGIN); // destino de la tarjeta -> de la ventana
    animateTo({ x: to.x - M, y: to.y - M });
  } else if (act === 'home') {
    animateTo(dodgeHome, () => { dodgeHome = null; });
  }
}

// Vuelve a su lugar sin animar (abrir el panel, cambio de pantallas, cambio de estilo).
function resetDodge() {
  stopAnim();
  dodge.reset();
  if (dodgeHome && widget && !widget.isDestroyed()) widget.setPosition(dodgeHome.x, dodgeHome.y);
  dodgeHome = null;
}

function startDodge() {
  if (!dodgePoll) dodgePoll = setInterval(dodgeTick, DODGE_POLL_MS);
}

function stopDodge() {
  clearInterval(dodgePoll);
  dodgePoll = null;
  resetDodge();
}

// ---------- dashboard ----------

function openDashboard() {
  if (dashboard && !dashboard.isDestroyed()) {
    if (dashboard.isMinimized()) dashboard.restore();
    dashboard.show();
    dashboard.focus();
    return;
  }
  setMode('ghost');
  // Barra de título unificada con la toolbar (como en Mac): la página dibuja la barra y Windows solo los controles.
  dashboard = new BrowserWindow({
    width: 1120, height: 780, minWidth: 820, minHeight: 560, title: 'Ectodo',
    backgroundColor: MICA ? '#00000000' : config.theme === 'light' ? '#ffffff' : '#1c1c1e', autoHideMenuBar: true, icon: ICON,
    ...(WIN ? { titleBarStyle: 'hidden', titleBarOverlay: overlayFor(config.theme) } : {}),
    ...(MICA ? { backgroundMaterial: 'mica' } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  // la página sabe si hay material de sistema (barra lateral translúcida) y si dibuja la barra de título
  dashboard.loadFile(path.join(__dirname, 'ui', 'dashboard.html'), { query: { mica: MICA ? '1' : '0', titlebar: WIN ? '1' : '0' } });
  dashboard.on('closed', () => { dashboard = null; });
}

// ---------- acciones (IPC) ----------

const ACTIONS = {
  addTask: (p, now) => engine.addTask(p.title, now, 'project' in p ? p.project : undefined),
  addTasks: (p, now) => {
    for (const title of Array.isArray(p.titles) ? p.titles.slice(0, 200) : []) engine.addTask(title, now, 'project' in p ? p.project : undefined);
  },
  updateTask: (p, now) => engine.updateTask(p.id, p, now),
  toggleDone: (p, now) => engine.toggleDone(p.id, now),
  setActive: (p, now) => engine.setActive(p.id, now),
  deleteTask: (p, now) => engine.deleteTask(p.id, now),
  moveTask: (p) => engine.moveTask(p.id, p.dir < 0 ? -1 : 1),
  clearDone: () => engine.clearDone(),
  setProjectColor: (p) => engine.setProjectColor(p.name, p.color),
  setProject: (p, now) => {
    if (!engine.setProject(p.name, now)) notify('Terminá la sesión para cambiar de proyecto');
  },
  startSession: (p, now) => {
    if (!engine.startSession(now, p.taskId)) notify('Agregá una tarea abierta para iniciar una sesión');
  },
  pause: (p, now) => engine.pause(now),
  resume: (p, now) => engine.resume(now),
  togglePause: (p, now) => {
    if (!engine.session) { if (!engine.startSession(now)) notify('Agregá una tarea abierta para iniciar una sesión'); }
    else if (engine.session.status === 'running') engine.pause(now);
    else engine.resume(now);
  },
  endSession: (p, now) => endSession(now),
  completeCurrent: (p, now) => engine.completeCurrent(now),
  cycleActive: (p, now) => engine.cycleActive(p.dir < 0 ? -1 : 1, now),
  undo: (p, now) => engine.undo(now),
};

function registerIpc() {
  ipcMain.handle('config:get', () => config);
  ipcMain.handle('config:set', (_e, patch) => { setConfig(patch); return config; });
  ipcMain.handle('state:get', () => engine.snapshot(Date.now()));
  ipcMain.handle('history:get', () => ({ intervals: engine.intervals, sessions }));
  ipcMain.handle('dispatch', (_e, action, payload) => {
    const fn = ACTIONS[action];
    if (!fn) throw new Error(`accion desconocida: ${action}`);
    commit(() => fn(payload || {}, Date.now()));
    return engine.snapshot(Date.now());
  });
  // invoke (no send): el widget espera la respuesta para no animar mientras la ventana cambia de tamaño
  ipcMain.handle('widget:height', (e, h) => {
    if (!widget || widget.isDestroyed() || e.sender !== widget.webContents) return false;
    const height = Math.min(900, Math.max(40, Math.ceil(Number(h) || 0))) + 2 * M; // h = alto de la tarjeta
    const [, cur] = widget.getContentSize();
    if (cur !== height) widget.setContentSize(WIDTH, height);
    return true;
  });
  // Modo activo: fuera de la superficie (margen de la sombra) la ventana deja pasar los clics a las apps de atras;
  // los movimientos se siguen reenviando para que el renderer note cuando el puntero vuelve. En reposo siempre es click-through.
  ipcMain.on('widget:passthrough', (e, on) => {
    if (!widget || widget.isDestroyed() || e.sender !== widget.webContents || mode === 'ghost') return;
    if (on) widget.setIgnoreMouseEvents(true, { forward: true });
    else widget.setIgnoreMouseEvents(false);
  });
  ipcMain.on('widget:exit', () => setMode('ghost'));
  ipcMain.on('dashboard:open', openDashboard);
}

// ---------- atajos, bandeja, energia ----------

// ---- tecla lider: Ctrl+Alt+L habilita ~2 s de teclas sueltas (↑ ↓ h p r i t Ctrl+Z c n a d Esc) sin darle foco al widget ----

const LEADER_MS = 2000;
let leaderOn = false;
let leaderTimer = null;
let leaderKeys = [];
let endArmed = false; // "e" dos veces para descartar una sesion que no se guardaria

function sendLeader(on) {
  if (widget && !widget.isDestroyed()) widget.webContents.send('leader', on);
}

// Siempre libera las teclas: un timeout, un error o una ventana que toma foco no pueden dejar una "j" global robada.
function endLeader() {
  clearTimeout(leaderTimer);
  leaderTimer = null;
  for (const k of leaderKeys) { try { globalShortcut.unregister(k); } catch { /* ya liberada */ } }
  leaderKeys = [];
  endArmed = false;
  if (leaderOn) { leaderOn = false; sendLeader(false); }
}

function leaderEnd() {
  if (!engine.session) return;
  const why = engine.discardReason(Date.now());
  if (why && !endArmed) {
    endArmed = true;
    notify(`Terminar descarta la sesión (${why}). Pulsá t otra vez para confirmar.`);
    return;
  }
  endArmed = false;
  commit(() => endSession(Date.now()));
}

// Regla: la letra es la primera de la accion (las mas frecuentes mandan); deshacer usa la tecla estandar Ctrl+Z.
const LEADER_ACTIONS = {
  Up: () => commit(() => engine.cycleActive(-1, Date.now())),
  Down: () => commit(() => engine.cycleActive(1, Date.now())),
  h: () => commit(() => engine.completeCurrent(Date.now())),
  p: () => commit(() => { if (engine.session && engine.session.status === 'running') engine.pause(Date.now()); }),
  r: () => commit(() => { if (engine.session && engine.session.status === 'paused') engine.resume(Date.now()); }),
  i: () => commit(() => { if (!engine.session) ACTIONS.startSession({}, Date.now()); }),
  t: leaderEnd,
  'Control+Z': () => commit(() => { if (!engine.undo(Date.now())) notify('Nada que deshacer'); }),
  c: () => setTheme(config.theme === 'light' ? 'dark' : 'light'),
  n: () => { endLeader(); setMode('capture'); },
  a: () => { endLeader(); setMode('active'); },
  d: () => { endLeader(); openDashboard(); },
  Escape: () => endLeader(),
};

function startLeader() {
  if (leaderOn || mode !== 'ghost') return;
  leaderOn = true;
  for (const [name, fn] of Object.entries(LEADER_ACTIONS)) {
    const accel = name.length === 1 ? name.toUpperCase() : name; // 'h' -> 'H'; 'Up', 'Control+Z', 'Escape' tal cual
    const run = () => {
      try { fn(); } catch (e) { console.error('[ectodo] lider:', e); }
      if (leaderOn) { clearTimeout(leaderTimer); leaderTimer = setTimeout(endLeader, LEADER_MS); } // cada tecla renueva la ventana
    };
    try { if (globalShortcut.register(accel, run)) leaderKeys.push(accel); } catch { /* tecla no disponible */ }
  }
  leaderTimer = setTimeout(endLeader, LEADER_MS);
  sendLeader(true);
}

function registerShortcuts() {
  const sc = config.shortcuts;
  const failed = [];
  const bind = (accel, fn) => {
    if (!accel) return;
    let ok = false;
    try { ok = globalShortcut.register(accel, fn); } catch { /* acelerador invalido */ }
    if (!ok) { failed.push(accel); console.warn(`[ectodo] no se pudo registrar el atajo ${accel}`); }
  };
  // Un atajo tomado por otra app falla en silencio: se avisa en el widget para que se cambie en config.json.
  setTimeout(() => {
    if (failed.length) notify(`No se pudo registrar ${failed.join(', ')}: lo usa otra app. Cambialo en config.json (shortcuts).`);
  }, 2500);
  bind(sc.togglePanel, () => setMode(mode === 'ghost' ? 'active' : 'ghost'));
  bind(sc.completeCurrent, () => commit(() => engine.completeCurrent(Date.now())));
  bind(sc.togglePause, () => commit(() => ACTIONS.togglePause({}, Date.now())));
  bind(sc.dashboard, openDashboard);
  bind(sc.capture, () => setMode('capture'));
  bind(sc.leader, () => (leaderOn ? endLeader() : startLeader()));
}

function rebuildTray() {
  if (!tray) return;
  const s = engine.session;
  const items = [
    { label: 'Mostrar panel', click: () => setMode('active') },
    { label: 'Nueva tarea', click: () => setMode('capture') },
    { label: 'Abrir dashboard', click: openDashboard },
    { type: 'separator' },
    { label: !s ? 'Iniciar sesión' : s.status === 'running' ? 'Pausar' : 'Reanudar', click: () => commit(() => ACTIONS.togglePause({}, Date.now())) },
  ];
  if (s) items.push({ label: 'Terminar sesión', click: () => commit(() => endSession(Date.now())) });
  items.push(
    { type: 'separator' },
    { label: config.theme === 'light' ? 'Modo oscuro' : 'Modo claro', click: () => setTheme(config.theme === 'light' ? 'dark' : 'light') },
    { label: 'Salir', click: () => app.quit() },
  );
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// Silueta de una tinta según el color de la barra de tareas (no el del tema de la app).
function trayImage() {
  const dark = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI !== undefined
    ? nativeTheme.shouldUseDarkColorsForSystemIntegratedUI : nativeTheme.shouldUseDarkColors;
  return nativeImage.createFromPath(path.join(ASSETS, dark ? 'tray-dark.png' : 'tray-light.png'));
}

function createTray() {
  tray = new Tray(trayImage());
  nativeTheme.on('updated', () => { if (tray && !tray.isDestroyed()) tray.setImage(trayImage()); });
  tray.setToolTip('Ectodo');
  tray.on('click', () => setMode('active'));
  rebuildTray();
}

function registerPower() {
  const autoPause = () => commit(() => engine.pause(Date.now()));
  powerMonitor.on('suspend', autoPause);
  powerMonitor.on('lock-screen', autoPause);
  powerMonitor.on('resume', resetDodge);
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, resetDodge);
}

function onQuit() {
  if (quitting) return;
  quitting = true;
  endLeader();
  stopDodge(); // si estaba apartado, se guarda el lugar de origen
  if (engine) {
    engine.pause(Date.now()); // el tiempo con la app cerrada no cuenta
    persist();
    store.flush();
  }
}

// ---------- arranque ----------

function init() {
  store = new Store(app.getPath('userData'));
  config = store.loadConfig();
  const saved = store.loadState();
  sessions = store.loadSessions();
  engine = new Engine(saved, store.loadIntervals(), {
    onInterval: (iv) => store.appendInterval(iv),
    onSession: (rec) => { sessions.push(rec); store.appendSession(rec); },
    onDiscard: (id, remaining) => store.rewriteIntervals(remaining),
  }, {
    minSessionMs: Math.max(0, Number(config.minSessionMinutes) || 0) * 60000,
    requireCompleted: config.requireCompletedTask !== false,
  });
  savedPos = saved.window || null;
  applyNativeTheme();

  // Estado viejo sin proyecto del widget: se toma el de la sesion, o el de la tarea activa, o el de la primera abierta.
  if (engine.project === undefined) {
    const t = engine.tasks.find((x) => x.id === engine.activeTaskId) || engine.tasks.find((x) => !x.done && !x.archived);
    engine.project = engine.session && engine.session.project !== undefined ? engine.session.project : (t && t.project) || null;
  }

  // Recuperacion de crash: si el ultimo guardado es viejo, la sesion se pausa en ese instante.
  const last = saved.savedAt || Date.now();
  if (engine.session && engine.session.status === 'running' && Date.now() - last > 120000) engine.pause(last);

  registerIpc();
  createWidget();
  createTray();
  registerShortcuts();
  registerPower();
  setInterval(() => { persist(); }, 30000);

  if (SMOKE) {
    require('./smoke')({
      engine, commit, setMode, openDashboard, sessions,
      leader: { start: startLeader, end: endLeader, on: () => leaderOn, keys: () => leaderKeys },
      dodge: { margin: M, setCursor: (fn) => { cursorAt = fn || (() => screen.getCursorScreenPoint()); }, home: () => dodgeHome, savedPos: () => savedPos },
      getWidget: () => widget, getDashboard: () => dashboard, out: SMOKE,
    }).catch((e) => { console.error(e); app.exit(1); });
  }
  if (PERF) {
    require('./perf')({ setMode, getWidget: () => widget, dispatchConfig: async (p) => setConfig(p), out: PERF })
      .catch((e) => { console.error(e); app.exit(1); });
  }
}

if (!SMOKE && !PERF && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(init);
  app.on('second-instance', () => setMode('active'));
  app.on('window-all-closed', () => { /* vive en la bandeja */ });
  app.on('before-quit', onQuit);
  app.on('will-quit', () => globalShortcut.unregisterAll());
}

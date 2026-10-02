'use strict';

// Modo de verificacion (TASKGHOST_SMOKE=<carpeta>): siembra datos, saca capturas y sale.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function smoke(ctx) {
  const { engine, commit, out } = ctx;
  fs.mkdirSync(out, { recursive: true });
  const shot = async (win, name) => {
    let img;
    for (let i = 0; ; i++) {
      try { img = await win.webContents.capturePage(); break; } catch (e) {
        if (i >= 6) throw e;
        if (!win.isVisible()) win.show();
        await wait(500);
      }
    }
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    console.log(`[smoke] captura ${name} ${img.getSize().width}x${img.getSize().height}`);
  };
  // con un fondo de color detras del widget (transparente): la sombra se ve y se nota si la ventana la recorta
  const shotBg = async (win, name, color = '#5f7f9f') => {
    await win.webContents.executeJavaScript(`document.documentElement.style.background = '${color}'`);
    await wait(80);
    await shot(win, name);
    await win.webContents.executeJavaScript(`document.documentElement.style.background = ''`);
  };
  const js0 = (w, code) => w.webContents.executeJavaScript(code);
  const log = (w, name) => w.webContents.on('console-message', (_e, level, msg) => console.log(`[${name}:${level}] ${msg}`));

  await wait(1500);
  const widget = ctx.getWidget();
  log(widget, 'widget');

  // historial sintetico de los ultimos dias para los graficos
  const H = 3600e3;
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const a = engine.addTask('Revisar PR del login #work', Date.now());
  const b = engine.addTask('Escribir tests de sesión #taskghost', Date.now());
  engine.addTask('Comprar café', Date.now());
  engine.addTask('Deploy a staging #work', Date.now());
  for (let d = 1; d <= 12; d++) {
    const day = new Date(base); day.setDate(day.getDate() - d);
    const start = day.getTime() + 9 * H;
    const id = d % 3 === 0 ? b.id : a.id;
    engine.intervals.push({ id: `s${d}a`, taskId: id, sessionId: `ss${d}`, start, end: start + (1 + (d % 4)) * H });
    engine.intervals.push({ id: `s${d}b`, taskId: b.id, sessionId: `ss${d}`, start: start + 5 * H, end: start + 6.5 * H });
    ctx.sessions.push({ id: `ss${d}`, startedAt: start, endedAt: start + 7 * H, duration: (2 + (d % 4)) * H, pauses: d % 3, tasks: { [a.id]: (1 + (d % 4)) * H, [b.id]: 1.5 * H } });
  }

  commit(() => engine.startSession(Date.now() - 42 * 60e3));
  await wait(800);
  await shot(widget, 'widget-ghost');
  await shotBg(widget, 'widget-ghost-bg');

  // --- esquivar el cursor: se aparta al otro lado, vuelve, y nunca guarda la posicion apartada ---
  {
    const [hx, hy] = widget.getPosition();
    const [ww, wh] = widget.getSize();
    ctx.dodge.setCursor(() => ({ x: -99999, y: -99999 })); // fuera: arma la deteccion
    await wait(200);
    ctx.dodge.setCursor(() => ({ x: hx + ww / 2, y: hy + wh / 2 }));
    await wait(700);
    const [ax] = widget.getPosition();
    await wait(600); // mas que el debounce de 'move' (500 ms)
    console.log('[smoke] esquivar: se aparta', hx, '->', ax, '| home', JSON.stringify(ctx.dodge.home()), '| no guarda la posicion apartada:', !ctx.dodge.savedPos() || ctx.dodge.savedPos().x - ctx.dodge.margin !== ax);
    ctx.dodge.setCursor(() => ({ x: -99999, y: -99999 }));
    await wait(700);
    console.log('[smoke] esquivar: vuelve a', widget.getPosition().join(','), '(origen', `${hx},${hy})`, '| home:', ctx.dodge.home());
    ctx.dodge.setCursor(() => ({ x: hx + ww / 2, y: hy + wh / 2 }));
    await wait(700);
    ctx.setMode('active'); // abrir el panel estando apartado lo devuelve a su lugar al instante
    console.log('[smoke] esquivar: abrir el panel apartado vuelve a', widget.getPosition().join(','), '| home:', ctx.dodge.home());
    ctx.setMode('ghost');
    await wait(700);
    console.log('[smoke] esquivar: al cerrar el panel con el cursor encima no se aparta:', widget.getPosition()[0] === hx);
    ctx.dodge.setCursor(null);
  }

  // modo activo: el margen transparente deja pasar los clics (setIgnoreMouseEvents) y el panel recibe los suyos
  const ignoreCalls = [];
  const origIgnore = widget.setIgnoreMouseEvents.bind(widget);
  widget.setIgnoreMouseEvents = (...a) => { ignoreCalls.push(JSON.stringify(a)); return origIgnore(...a); };
  ctx.setMode('active');
  await wait(800);
  await shot(widget, 'widget-active');
  await shotBg(widget, 'widget-active-bg');
  {
    const [, wh] = widget.getSize();
    const rect = JSON.parse(await js0(widget, `JSON.stringify(document.querySelector('#surface').getBoundingClientRect())`));
    console.log('[smoke] ventana', widget.getSize().join('x'), '| tarjeta', Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height), '| alto = tarjeta + 2M:', wh === Math.round(rect.height) + 2 * ctx.dodge.margin);
    ignoreCalls.length = 0;
    await js0(widget, `document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))`);
    await js0(widget, `document.querySelector('#pill').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))`);
    await js0(widget, `document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))`);
    await wait(150);
    console.log('[smoke] click-through fuera de la superficie (esperado: true, false, true):', ignoreCalls.join(' '));
    await js0(widget, `document.querySelector('#pill').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))`);
    await wait(100);
  }

  ctx.openDashboard();
  await wait(1500);
  const dash = ctx.getDashboard();
  log(dash, 'dash');
  // Las View Transitions no avanzan mientras la ventana no se dibuja en primer plano: con "reducir movimiento"
  // el cambio de vista es instantáneo y las capturas muestran siempre el estado final.
  try {
    dash.webContents.debugger.attach('1.3');
    await dash.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  } catch (e) { console.log('[smoke] no se pudo emular reduced-motion:', e.message); }
  for (const view of ['hoy', 'tareas', 'proyectos', 'sesiones', 'graficos']) {
    await dash.webContents.executeJavaScript(`document.querySelector('[data-view="${view}"]').click()`);
    await wait(700);
    await shot(dash, `dash-${view}`);
  }
  // capturePage no incluye el material del sistema (Mica): la miniatura de la ventana sí, porque la compone Windows
  try {
    const { desktopCapturer } = require('electron');
    dash.show(); dash.focus();
    await dash.webContents.executeJavaScript(`document.querySelector('[data-view="hoy"]').click()`);
    await wait(900);
    const srcs = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1120, height: 780 } });
    const src = srcs.find((x) => x.id === dash.getMediaSourceId());
    if (src) { fs.writeFileSync(path.join(out, 'dash-hoy-sistema.png'), src.thumbnail.toPNG()); console.log('[smoke] captura dash-hoy-sistema (con Mica)'); }
    else console.log('[smoke] no se encontró la ventana del dashboard para la captura del sistema');
  } catch (e) { console.log('[smoke] captura del sistema fallo:', e.message); }
  // --- crear tareas desde el formulario del dashboard (simula tipeo real) ---
  const js = (w, code) => w.webContents.executeJavaScript(code);
  console.log('[smoke] fuente Inter empaquetada cargada:', await js(widget, `document.fonts.ready.then(() => document.fonts.check('600 13px "Inter Variable"') && [...document.fonts].some((f) => f.family.includes('Inter') && f.status === 'loaded'))`));
  await js(dash, `document.querySelector('[data-view="tareas"]').click()`);
  await wait(400);
  await js(dash, `(() => { const t = document.querySelector('#nt-title'); t.value = 'Probar formulario del dashboard'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await js(dash, `document.querySelector('[data-proj="taskghost"]').click()`);
  await wait(300);
  await js(dash, `document.querySelector('#nt-add').click()`);
  await wait(500);
  await js(dash, `(() => { const t = document.querySelector('#nt-bulk'); t.value = 'Primera de lote\\nSegunda de lote #ops\\n\\nTercera de lote'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await js(dash, `document.querySelector('#nt-bulk-add').click()`);
  await wait(600);
  console.log('[smoke] tareas:', engine.tasks.map((t) => `${t.title}[${t.project}]`).join(' | '));
  await shot(dash, 'dash-tareas-crear');

  // --- tema claro (se persiste en config.json) ---
  await js(dash, `api.setTheme('light')`);
  await wait(110);
  await shot(widget, 'widget-theme-xfade'); // crossfade de tema a mitad de camino
  await wait(500);
  await shot(dash, 'dash-tareas-light');
  await shot(widget, 'widget-active-light');
  await js(dash, `document.querySelector('[data-view="graficos"]').click()`);
  await wait(600);
  await shot(dash, 'dash-graficos-light');
  const cfgFile = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
  console.log('[smoke] theme en config.json:', cfgFile.theme);

  // --- ajustes + estilo circulo ---
  await js(dash, `api.setTheme('dark')`);
  await js(dash, `document.querySelector('[data-view="ajustes"]').click()`);
  await wait(500);
  await shot(dash, 'dash-ajustes');
  await js(dash, `document.querySelector('[data-cfg="ghostStyle"][data-val="dot"]').click()`);
  await wait(600);
  ctx.setMode('ghost');
  await wait(400);
  await shot(widget, 'widget-dot');
  await js(widget, `document.querySelector('#dot').dispatchEvent(new MouseEvent('mouseenter'))`);
  await wait(500);
  await shot(widget, 'widget-dot-peek');
  await wait(3800);
  await shot(widget, 'widget-dot-autoclose'); // debe volver a ser solo el circulo
  ctx.setMode('active');
  await wait(150);
  await shot(widget, 'widget-dot-morph-open');
  await wait(400);
  ctx.setMode('ghost');
  await wait(150);
  console.log('[smoke] recorte a mitad del cierre:', await js(widget, `document.body.className + ' | ' + getComputedStyle(document.querySelector('#surface')).clipPath`));
  await shot(widget, 'widget-dot-morph-close');
  await wait(400);
  console.log('[smoke] clases tras cerrar el panel:', await js(widget, 'document.body.className'));
  console.log('[smoke] ghostStyle en config.json:', JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8')).ghostStyle);
  await js(dash, `api.setConfig({ ghostStyle: 'pill', minSessionMinutes: 999, ghostOpacity: 5, theme: 'rojo' })`);
  await wait(400);
  const cfg2 = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
  console.log('[smoke] validacion de config (999/5/rojo deben rechazarse):', cfg2.minSessionMinutes, cfg2.ghostOpacity, cfg2.theme, cfg2.ghostStyle);
  await shot(widget, 'widget-ghost-pill');

  // --- morph pildora <-> panel: capturas a mitad de camino ---
  {
    const cls = () => js(widget, 'document.body.className');
    ctx.setMode('ghost');
    await wait(500);
    ctx.setMode('active');
    await wait(60);
    await shot(widget, 'widget-morph-open-a');
    console.log('[smoke] morph abrir (60 ms):', await cls(), '|', await js(widget, `getComputedStyle(document.querySelector('#surface')).clipPath.slice(0, 90)`));
    await shot(widget, 'widget-morph-open-b');
    await wait(150);
    await shot(widget, 'widget-morph-open-c');
    await wait(700);
    console.log('[smoke] morph abrir (fin):', await cls());
    ctx.setMode('ghost');
    await wait(90);
    await shot(widget, 'widget-morph-close-a');
    console.log('[smoke] morph cerrar (90 ms):', await cls());
    await wait(600);
    console.log('[smoke] morph cerrar (fin):', await cls(), '| ventana', widget.getSize().join('x'));
  }

  // --- terminar una sesion que no cumple los minimos: debe descartarse ---
  const before = engine.intervals.length;
  await js(widget, `api.dispatch('endSession')`);
  await wait(600);
  console.log('[smoke] sesion tras terminar:', engine.session, '| tramos antes/despues:', before, engine.intervals.length, '| sesiones guardadas:', ctx.sessions.length);
  await shot(widget, 'widget-descartada');
  const onDisk = fs.readFileSync(path.join(app.getPath('userData'), 'intervals.jsonl'), 'utf8').split('\n').filter(Boolean).length;
  console.log('[smoke] lineas en intervals.jsonl:', onDisk);

  const { globalShortcut } = require('electron');
  const readCfg = () => JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
  const keyIn = (w, k, extra = {}) => js(w, `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, ...${JSON.stringify(extra)} }))`);
  const nTasks = () => engine.tasks.filter((t) => !t.archived).length;

  // --- acento configurable (y su ajuste de contraste por tema) ---
  await js(dash, `api.setConfig({ accent: '#f5a524' })`);
  await wait(500);
  ctx.setMode('active');
  await wait(700);
  await shot(widget, 'widget-active-amber');
  console.log('[smoke] accent aplicado en widget:', await js(widget, `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`), '| config.json:', readCfg().accent);
  await js(dash, `api.setConfig({ accent: 'verde' })`);
  await wait(300);
  console.log('[smoke] accent invalido rechazado (debe seguir #f5a524):', readCfg().accent);
  await js(dash, `api.setConfig({ theme: 'light', accent: '#3ecf8e' })`);
  await wait(600);
  await shot(widget, 'widget-active-light-green');
  // el relleno queda vivo; lo que se oscurece para contrastar es el acento de TEXTO
  console.log('[smoke] verde en tema claro: relleno / texto:', await js(widget, `['--accent', '--accent-text'].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()).join(' / ')`));
  await js(dash, `document.querySelector('[data-view="ajustes"]').click()`);
  await wait(500);
  await shot(dash, 'dash-ajustes-light');
  await js(dash, `api.setConfig({ theme: 'dark', accent: '#7c83ff' })`);
  await wait(500);

  // --- panel modal: NORMAL / INSERT / ayuda, deshacer ---
  console.log('[smoke] modo al abrir:', await js(widget, `document.querySelector('#mode-tag').textContent`));
  const sel = () => js(widget, `(document.querySelector('.task.sel') || {}).closest && document.querySelector('.task.sel').closest('[data-id]').dataset.id`);
  const hintText = () => js(widget, `document.querySelector('#hint').textContent`);
  const s0 = await sel();
  // tecla REAL (pasa por el pipeline de entrada de Electron, no un evento sintetico): con el panel en NORMAL y sin nada enfocado
  widget.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
  widget.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
  await wait(300);
  console.log('[smoke] tecla real flecha abajo (sendInputEvent) mueve la seleccion:', s0 !== (await sel()), '| foco en:', await js(widget, `document.activeElement.tagName + '#' + document.activeElement.id`), '| ventana enfocada:', widget.isFocused());
  await keyIn(widget, 'ArrowDown');
  await wait(200);
  console.log('[smoke] flecha abajo mueve la seleccion:', s0 !== (await sel()));
  await keyIn(widget, 'ArrowUp');
  await keyIn(widget, 'ArrowDown');
  await wait(200);
  const selId = await sel();
  const doneBefore = engine.tasks.find((t) => t.id === selId).done;
  await keyIn(widget, 'h');
  await wait(60);
  await shot(widget, 'widget-done-anim'); // check lleno + tachado a mitad de camino
  await wait(500);
  console.log('[smoke] h alterna hecha:', doneBefore, '->', engine.tasks.find((t) => t.id === selId).done, '| HUD:', await js(widget, `document.querySelector('#hud').className + ' "' + document.querySelector('#hud-t').textContent + '"'`));
  await shot(widget, 'widget-toast');
  await keyIn(widget, 'z', { ctrlKey: true });
  await wait(300);
  console.log('[smoke] Ctrl+Z deshace:', engine.tasks.find((t) => t.id === selId).done === doneBefore);
  await keyIn(widget, 'x');
  await wait(200);
  console.log('[smoke] x ya no hace nada (la tecla es h):', engine.tasks.find((t) => t.id === selId).done === doneBefore);
  console.log('[smoke] barra NORMAL (sin sesion):', await hintText());
  const n0 = nTasks();
  await keyIn(widget, 'b');
  await wait(100);
  console.log('[smoke] prefijo b pendiente:', await hintText());
  await keyIn(widget, 'b');
  await wait(40);
  await shot(widget, 'widget-delete-anim'); // fila colapsando
  await wait(500);
  console.log('[smoke] bb borra:', n0, '->', nTasks(), '| HUD:', await js(widget, `document.querySelector('#hud-t').textContent`));
  await keyIn(widget, 'z', { ctrlKey: true });
  await wait(300);
  console.log('[smoke] Ctrl+Z restaura lo borrado:', nTasks() === n0);
  await keyIn(widget, 'Delete');
  await wait(600);
  console.log('[smoke] Supr borra:', n0, '->', nTasks());
  await keyIn(widget, 'z', { ctrlKey: true });
  await wait(300);
  console.log('[smoke] Ctrl+Z restaura tras Supr:', nTasks() === n0);
  await keyIn(widget, 'n');
  await wait(200);
  console.log('[smoke] n entra a INSERT:', await js(widget, `document.querySelector('#mode-tag').textContent + ' foco en input: ' + (document.activeElement.id === 'new')`));
  await js(widget, `document.querySelector('#new').value = 'Tarea desde INSERT #work'`);
  await keyIn(widget, 'Enter');
  await wait(300);
  console.log('[smoke] Enter en INSERT agrega:', nTasks() === n0 + 1);
  await shot(widget, 'widget-insert');
  await keyIn(widget, 'Escape');
  await wait(200);
  console.log('[smoke] Esc vuelve a:', await js(widget, `document.querySelector('#mode-tag').textContent`));

  // sesion con el teclado: i inicia, p pausa, r reanuda, tt termina
  const sess = () => (engine.session ? engine.session.status : null);
  await keyIn(widget, 'i');
  await wait(300);
  console.log('[smoke] i inicia la sesion:', sess());
  console.log('[smoke] barra NORMAL (en curso):', await hintText());
  await shot(widget, 'widget-normal-sesion');
  await keyIn(widget, 'p');
  await wait(300);
  console.log('[smoke] p pausa:', sess(), '| barra:', await hintText());
  await keyIn(widget, 'r');
  await wait(300);
  console.log('[smoke] r reanuda:', sess());
  await keyIn(widget, 't');
  await wait(100);
  console.log('[smoke] prefijo t pendiente:', await hintText());
  await keyIn(widget, 't');
  await wait(400);
  console.log('[smoke] tt termina la sesion:', sess());

  await keyIn(widget, '?');
  await wait(300);
  await shot(widget, 'widget-help');
  await keyIn(widget, 'Escape');
  await wait(200);

  // --- dashboard con teclado ---
  await keyIn(dash, 'F2');
  await wait(400);
  await keyIn(dash, 'ArrowDown');
  await keyIn(dash, 'ArrowDown');
  await wait(300);
  console.log('[smoke] dashboard F2 -> vista tareas, fila con cursor:', await js(dash, `!!document.querySelector('tr.cur') && document.querySelector('#nav button.on').dataset.view`));
  await shot(dash, 'dash-tareas-cursor');
  // menú desplegable propio de los filtros (en lugar del <select> nativo)
  await js(dash, `document.querySelector('#f-project').click()`);
  await wait(300);
  await shot(dash, 'dash-menu-filtro');
  console.log('[smoke] menu de filtro abierto:', await js(dash, `!!document.querySelector('[role="listbox"]')`));
  await keyIn(dash, 'Escape');
  await wait(200);
  console.log('[smoke] Esc cierra el menu:', await js(dash, `!document.querySelector('[role="listbox"]')`));
  // borrar con el teclado en el dashboard: bb y deshacer con Ctrl+Z
  const curRow = () => js(dash, `(document.querySelector('tr.cur') || {}).dataset && document.querySelector('tr.cur').dataset.id`);
  const d0 = nTasks();
  const delId = await curRow();
  await keyIn(dash, 'b');
  await wait(100);
  console.log('[smoke] dashboard prefijo b pendiente:', await js(dash, `document.querySelector('#dhint').textContent`));
  await keyIn(dash, 'b');
  await wait(400);
  console.log('[smoke] dashboard bb borra:', d0, '->', nTasks(), '| tarea borrada:', !engine.tasks.find((t) => t.id === delId && !t.archived), '| cursor pasa a otra fila:', (await curRow()) !== delId && !!(await curRow()));
  await shot(dash, 'dash-tareas-borrada');
  await keyIn(dash, 'z', { ctrlKey: true });
  await wait(400);
  console.log('[smoke] dashboard Ctrl+Z restaura:', nTasks() === d0);
  const row1 = await curRow();
  await keyIn(dash, 'h');
  await wait(400);
  console.log('[smoke] dashboard h marca hecha (la fila sale del filtro "abiertas"):', engine.tasks.find((t) => t.id === row1).done);
  await keyIn(dash, 'z', { ctrlKey: true });
  await wait(300);
  await keyIn(dash, '?');
  await wait(300);
  console.log('[smoke] ayuda del dashboard abierta:', await js(dash, `document.body.className + ' | ' + document.querySelector('#dmode').textContent + ' | html=' + document.querySelector('#dhelp').innerHTML.length + ' | display=' + getComputedStyle(document.querySelector('#dhelp')).display`));
  await shot(dash, 'dash-ayuda');
  await keyIn(dash, 'Escape');
  await keyIn(dash, 'F5');
  await wait(700);
  await shot(dash, 'dash-graficos-dark');
  await keyIn(dash, 'F1');
  await wait(400);

  // --- captura rapida y tecla lider ---
  ctx.setMode('ghost');
  await wait(300);
  ctx.leader.start();
  await wait(400);
  console.log('[smoke] lider activa:', ctx.leader.on(), '| teclas:', ctx.leader.keys().join(','), '| H registrada:', globalShortcut.isRegistered('H'));
  await shot(widget, 'widget-leader');
  await wait(2700);
  console.log('[smoke] lider expirada (todo liberado):', !ctx.leader.on(), '| H registrada:', globalShortcut.isRegistered('H'), '| teclas:', ctx.leader.keys().length);
  ctx.leader.start();
  ctx.setMode('active'); // al abrir una ventana que escribe, la lider debe soltar las teclas
  await wait(300);
  console.log('[smoke] abrir el panel libera la lider:', !ctx.leader.on(), '| H registrada:', globalShortcut.isRegistered('H'));
  ctx.setMode('capture');
  await wait(600);
  await shot(widget, 'widget-capture');
  console.log('[smoke] captura (morph) clases:', await js(widget, 'document.body.className'));
  const n1 = nTasks();
  await js(widget, `document.querySelector('#new').value = 'Tarea por captura rapida #work'`);
  await keyIn(widget, 'Enter');
  await wait(500);
  console.log('[smoke] captura agrega y vuelve a fantasma:', nTasks() === n1 + 1, '| focusable:', ctx.getWidget().isFocusable());
  console.log('[smoke] atajos nuevos registrados:', globalShortcut.isRegistered(readCfg().shortcuts.capture), globalShortcut.isRegistered(readCfg().shortcuts.leader));

  const sc = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8')).shortcuts;
  for (const [name, accel] of Object.entries(sc)) console.log(`[smoke] atajo ${name} ${accel}: ${globalShortcut.isRegistered(accel)}`);
  // --- proyecto del widget: '#' abre INSERT con '#', '#ops' + Enter cambia; las tareas nuevas van ahi sin tag ---
  if (engine.session) commit(() => engine.endSession(Date.now()));
  ctx.setMode('active');
  await wait(400);
  await keyIn(widget, '#', { ctrlKey: true, altKey: true }); // AltGr+3 en teclado es/latam
  await wait(200);
  console.log('[smoke] # abre INSERT con #:', await js(widget, `document.querySelector('#mode-tag').textContent + ' ' + document.querySelector('#new').value`));
  await js(widget, `document.querySelector('#new').value = '#ops'`);
  await keyIn(widget, 'Enter');
  await wait(400);
  await js(widget, `document.querySelector('#new').value = 'Rotar logs'`);
  await keyIn(widget, 'Enter');
  await wait(400);
  const rot = engine.tasks.find((t) => t.title === 'Rotar logs');
  console.log('[smoke] proyecto del widget:', engine.project, '| tarea sin tag va a:', rot && rot.project,
    '| lista solo #ops:', await js(widget, `[...document.querySelectorAll('.task .title')].map((e) => e.textContent).join(', ')`),
    '| nota:', await js(widget, `document.querySelector('#hidden-note').textContent`));
  await keyIn(widget, 'Escape');
  await wait(200);
  await shot(widget, 'widget-proyecto-ops');

  // --- microinteracciones: reordenar (FLIP), completar, limpiar y filas nuevas ---
  {
    const titles = () => js(widget, `[...document.querySelectorAll('#list .task .title')].map((e) => e.textContent).join(' | ')`);
    const rowAnims = () => js(widget, `document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('row')).length`);
    console.log('[smoke] filas:', await titles());
    await keyIn(widget, 'Home');
    await keyIn(widget, 'ArrowDown', { altKey: true });
    await wait(40);
    console.log('[smoke] Alt+Abajo reordena: animaciones de fila (FLIP):', await rowAnims(), '|', await titles());
    await shot(widget, 'widget-flip');
    await wait(400);
    await keyIn(widget, 'h');
    await wait(500);
    console.log('[smoke] h completa y la fila baja (FLIP):', await rowAnims(), '|', await titles(), '| HUD:', await js(widget, `document.querySelector('#hud-t').textContent`));
    await wait(300);
    await keyIn(widget, 'l');
    await wait(60);
    await shot(widget, 'widget-clear-anim');
    await wait(500);
    console.log('[smoke] l limpia con colapso:', await titles(), '| HUD:', await js(widget, `document.querySelector('#hud-t').textContent`));
    await keyIn(widget, 'z', { ctrlKey: true });
    await wait(60);
    console.log('[smoke] Ctrl+Z (la fila vuelve con entrada; el HUD se va):', await rowAnims(), '|', await titles(), '| HUD:', await js(widget, `document.querySelector('#hud').className`));
    await wait(400);
  }
  commit(() => engine.startSession(Date.now() - 58300)); // a 1,7 s de que el reloj pase de 0:58 a 1:00: los minutos ruedan
  await wait(300);
  {
    const probe = await js(widget, `new Promise((r) => { const t0 = Date.now(); const t = setInterval(() => { const el = document.querySelector('#t-task'); if (el.textContent.startsWith('1:0') || Date.now() - t0 > 3500) { clearInterval(t); r(el.textContent + ' | entrando ' + el.querySelectorAll('i.in').length + ' saliendo ' + el.querySelectorAll('i.out').length); } }, 16); })`);
    console.log('[smoke] reloj al cambiar el minuto:', probe);
    await shot(widget, 'widget-clock-roll');
    const slot = await js(widget, `(() => { const a = document.querySelector('#t-task .dg'); return new Promise((r) => setTimeout(() => r(a === document.querySelector('#t-task .dg')), 1200)); })()`);
    console.log('[smoke] los segundos no recrean las celdas del reloj:', slot);
  }
  console.log('[smoke] sesion en el proyecto del widget:', engine.session && engine.session.project);
  await keyIn(widget, '#');
  await wait(200);
  console.log('[smoke] # con sesion en curso avisa:', await js(widget, `document.querySelector('#cur').textContent`));

  console.log('[smoke] widget alwaysOnTop:', ctx.getWidget().isAlwaysOnTop(), '| modo:', 'active');
  ctx.setMode('ghost');
  await wait(200);
  console.log('[smoke] focusable tras volver a fantasma:', ctx.getWidget().isFocusable());
  const err = await dash.webContents.executeJavaScript('typeof window.Chart + " " + typeof window.Stats + " " + typeof window.api');
  console.log('[smoke] globals dashboard:', err);
  app.exit(0);
};

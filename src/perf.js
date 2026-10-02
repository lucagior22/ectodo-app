'use strict';

// Banco de animaciones (ECTODO_PERF=<carpeta>): repite las transiciones del widget y mide cada frame.
// Sirve para comparar antes/despues de tocar animaciones: node + electron, sin dependencias.
//   ECTODO_PERF_REPS=n     repeticiones (6)
//   ECTODO_PERF_TRACE=1    ademas graba trace.json (abrir en chrome://tracing o ui.perfetto.dev)
const fs = require('fs');
const path = require('path');
const { app, contentTracing } = require('electron');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REPS = Number(process.env.ECTODO_PERF_REPS) || 6;

// Se inyecta en el widget. Registra el momento de cada frame y cuando corre la transicion del morph
// (transitionstart/transitionend del clip-path de #app), para separar la latencia previa de la animacion.
const RECORDER = `(() => {
  if (window.__perf) return;
  const P = window.__perf = { on: false };
  new PerformanceObserver((l) => { if (P.on) for (const e of l.getEntries()) P.long.push(Math.round(e.duration)); })
    .observe({ entryTypes: ['longtask'] });
  const app = document.querySelector('#surface');
  const isMorph = (e) => e.target === app && e.propertyName === 'clip-path';
  app.addEventListener('transitionstart', (e) => { if (P.on && isMorph(e) && !P.animStart) P.animStart = performance.now(); });
  app.addEventListener('transitionend', (e) => { if (P.on && isMorph(e)) P.animEnd = performance.now(); });
  const loop = (t) => { if (P.on) P.times.push(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  P.start = () => { Object.assign(P, { times: [], long: [], animStart: 0, animEnd: 0, t0: performance.now(), on: true }); };
  P.stop = () => { P.on = false; return { times: P.times, long: P.long, t0: P.t0, animStart: P.animStart, animEnd: P.animEnd }; };
})()`;

function summarize(gaps, hz) {
  const budget = 1000 / hz;
  const sorted = [...gaps].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  return {
    frames: gaps.length,
    perdidos: gaps.reduce((n, f) => n + Math.max(0, Math.round(f / budget) - 1), 0),
    p95: +pct(0.95).toFixed(1),
    max: +(sorted[sorted.length - 1] || 0).toFixed(1),
  };
}

module.exports = async function perf(ctx) {
  const { setMode, out } = ctx;
  fs.mkdirSync(out, { recursive: true });
  await wait(1500);
  const widget = ctx.getWidget();
  const js = (code) => widget.webContents.executeJavaScript(code, true);

  // cuenta los redimensionados de la ventana y el costo sincrono de setMode en el proceso principal
  let resizes = 0;
  const origSize = widget.setContentSize.bind(widget);
  widget.setContentSize = (...a) => { resizes++; return origSize(...a); };
  let mainMs = 0;
  const timedMode = (m) => { const t = performance.now(); setMode(m); mainMs += performance.now() - t; };

  await ctx.dispatchConfig({ ghostStyle: 'dot' });
  setMode('ghost');
  await wait(800);
  await js(RECORDER);
  const hz = await js('new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => (++n < 60 ? requestAnimationFrame(f) : r(Math.round(60000 / (performance.now() - t0)))); requestAnimationFrame(f); })');

  const scenarios = {
    'circulo -> rectangulo (hover)': () => js(`document.querySelector('#dot').dispatchEvent(new MouseEvent('mouseenter'))`),
    'rectangulo -> circulo (auto)': () => js(`document.querySelector('#pill').dispatchEvent(new MouseEvent('mouseleave'))`),
    'circulo -> panel': () => timedMode('active'),
    'panel -> circulo': () => timedMode('ghost'),
  };

  const trace = process.env.ECTODO_PERF_TRACE;
  if (trace) await contentTracing.startRecording({ included_categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu', 'viz'] });

  const results = {};
  for (let rep = 0; rep < REPS; rep++) {
    for (const [name, run] of Object.entries(scenarios)) {
      resizes = 0; mainMs = 0;
      await js(`console.timeStamp('perf:${name}'); __perf.start()`);
      await run();
      await wait(900);
      const r = await js('__perf.stop()');
      const acc = results[name] || (results[name] = { pre: [], anim: [], lat: [], long: [], resizes: 0, mainMs: 0, sinAnim: 0, peorPorRep: [] });
      if (!r.animStart) { acc.sinAnim++; continue; }
      const end = r.animEnd || r.animStart + 400;
      for (let i = 1; i < r.times.length; i++) {
        const gap = r.times[i] - r.times[i - 1];
        if (r.times[i] <= r.animStart) acc.pre.push(gap);
        else if (r.times[i - 1] < end) acc.anim.push(gap);
      }
      acc.peorPorRep.push(Math.round(Math.max(0, ...r.times.slice(1).map((t, i) => (t > r.animStart && r.times[i] < end ? t - r.times[i] : 0)))));
      acc.lat.push(r.animStart - r.t0);
      acc.long.push(...r.long);
      acc.resizes += resizes;
      acc.mainMs += mainMs;
      await wait(300);
    }
  }
  if (trace) console.log('[perf] traza:', await contentTracing.stopRecording(path.join(out, 'trace.json')));

  const report = { hz, reps: REPS, electron: process.versions.electron, scenarios: {} };
  for (const [name, r] of Object.entries(results)) {
    const a = summarize(r.anim, hz);
    report.scenarios[name] = {
      'latencia ms': +(r.lat.reduce((s, x) => s + x, 0) / Math.max(1, r.lat.length)).toFixed(1),
      'perdidos antes': summarize(r.pre, hz).perdidos,
      'perdidos en anim': a.perdidos,
      'anim p95': a.p95,
      'anim max': a.max,
      'tareas >50ms': r.long.length,
      'resize/vez': +(r.resizes / REPS).toFixed(1),
      'main ms/vez': +(r.mainMs / REPS).toFixed(1),
      'peor frame por rep': r.peorPorRep.join(' '),
      ...(r.sinAnim ? { 'sin animacion': r.sinAnim } : {}),
    };
  }
  fs.writeFileSync(path.join(out, 'perf.json'), JSON.stringify(report, null, 2));
  console.log(`[perf] ${hz} Hz · Electron ${report.electron} · ${REPS} repeticiones (frames en ms)`);
  console.table(report.scenarios);
  app.exit(0);
};

// Agregaciones del dashboard. Funciona en el navegador (window.Stats) y en Node (tests).
(function (root) {
  const pad = (n) => String(n).padStart(2, '0');

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function addDays(ts, n) {
    const d = new Date(ts);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  // Lunes 00:00 de la semana de `ts`.
  function weekStart(ts) {
    const d = new Date(startOfDay(ts));
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }

  // Parte un tramo [start, end) en segmentos que no cruzan medianoche local.
  function splitByDay(start, end) {
    const out = [];
    let cur = start;
    while (cur < end) {
      const next = addDays(startOfDay(cur), 1);
      const e = Math.min(end, next);
      out.push({ day: startOfDay(cur), start: cur, end: e });
      cur = e;
    }
    return out;
  }

  // { [dayStart]: { [project]: ms } }
  function msByDayProject(intervals, projectOf) {
    const out = {};
    for (const iv of intervals) {
      const p = projectOf(iv.taskId);
      for (const seg of splitByDay(iv.start, iv.end)) {
        const day = (out[seg.day] = out[seg.day] || {});
        day[p] = (day[p] || 0) + (seg.end - seg.start);
      }
    }
    return out;
  }

  function sumMs(obj) {
    return Object.values(obj || {}).reduce((a, b) => a + b, 0);
  }

  function dur(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return ms >= 1000 ? `${Math.round(ms / 1000)}s` : '0m';
    const h = Math.floor(m / 60);
    return h ? `${h}h ${pad(m % 60)}m` : `${m}m`;
  }

  // Duración como la escribe una persona, en partes [número, unidad]: 0 → [0,'min'] · 45 s · 42 min · 1 h 12 min · 3 h.
  function humanParts(ms) {
    if (!(ms > 0)) return [[0, 'min']];
    const s = Math.round(ms / 1000);
    if (s < 60) return [[s, 's']];
    const m = Math.round(ms / 60000);
    const h = Math.floor(m / 60);
    if (!h) return [[m, 'min']];
    return m % 60 ? [[h, 'h'], [m % 60, 'min']] : [[h, 'h']];
  }

  function human(ms) {
    return humanParts(ms).map(([n, u]) => `${n} ${u}`).join(' ');
  }

  // Reloj en vivo: m:ss, y h:mm:ss desde la primera hora (sin ceros de relleno a la izquierda de las horas).
  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const ss = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    return h ? `${h}:${ss}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
  }

  // Promedio diario de los `n` días anteriores a `today` (medianoche local de hoy). `byDay`: { [dayStart]: ms | { [project]: ms } }.
  // Cuenta desde el primer día con datos, para no castigar a quien recién empezó. 0 si no hay historial.
  function avgDaily(byDay, today, n = 7) {
    const total = (d) => { const v = byDay[d]; return typeof v === 'number' ? v : sumMs(v); };
    let span = 0;
    let sum = 0;
    for (let i = n; i >= 1; i--) {
      const v = total(addDays(today, -i));
      if (v > 0 && !span) span = i;
      sum += v;
    }
    return span ? sum / span : 0;
  }

  const api = { startOfDay, addDays, weekStart, splitByDay, msByDayProject, sumMs, dur, humanParts, human, clock, avgDaily };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Stats = api;
})(typeof window !== 'undefined' ? window : globalThis);

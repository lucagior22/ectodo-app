'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  shortcuts: {
    togglePanel: 'Control+Alt+T',
    completeCurrent: 'Control+Alt+H',
    togglePause: 'Control+Alt+P',
    dashboard: 'Control+Alt+D',
    capture: 'Control+Alt+N',
    leader: 'Control+Alt+L',
  },
  ghostOpacity: 0.55,
  accent: '#0088ff',
  theme: 'dark',
  ghostStyle: 'pill',
  minSessionMinutes: 5,
  requireCompletedTask: true,
};

// Atajos predeterminados anteriores: si config.json todavia tiene uno tal cual, se reemplaza (uno personalizado no se toca).
const LEGACY_SHORTCUTS = { completeCurrent: 'Control+Alt+D', dashboard: 'Control+Alt+B' };
// Acentos predeterminados anteriores (Consola, índigo minimalista): si siguen tal cual, pasan al azul de sistema.
const LEGACY_ACCENTS = ['#3dff7a', '#7c83ff'];

// Persistencia en archivos locales: state.json (atomico), intervals.jsonl y sessions.jsonl (append).
class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.stateFile = path.join(dir, 'state.json');
    this.intervalsFile = path.join(dir, 'intervals.jsonl');
    this.sessionsFile = path.join(dir, 'sessions.jsonl');
    this.configFile = path.join(dir, 'config.json');
    this._pending = null;
    this._timer = null;
  }

  _readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        try { fs.renameSync(file, file.replace(/\.json$/, `.corrupt-${Date.now()}.json`)); } catch { /* ignorar */ }
      }
      return fallback;
    }
  }

  _readLines(file) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const out = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      try { out.push(JSON.parse(line)); } catch { /* linea truncada por un crash: se ignora */ }
    }
    return out;
  }

  loadConfig() {
    const user = this._readJson(this.configFile, null);
    if (!user) fs.writeFileSync(this.configFile, JSON.stringify(DEFAULT_CONFIG, null, 2));
    const shortcuts = { ...DEFAULT_CONFIG.shortcuts, ...((user || {}).shortcuts || {}) };
    for (const [name, old] of Object.entries(LEGACY_SHORTCUTS)) if (shortcuts[name] === old) shortcuts[name] = DEFAULT_CONFIG.shortcuts[name];
    const cfg = { ...DEFAULT_CONFIG, ...(user || {}), shortcuts };
    if (LEGACY_ACCENTS.includes(String(cfg.accent).toLowerCase())) cfg.accent = DEFAULT_CONFIG.accent;
    return cfg;
  }

  saveConfig(cfg) {
    const tmp = this.configFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, this.configFile);
  }

  rewriteIntervals(intervals) {
    const tmp = this.intervalsFile + '.tmp';
    fs.writeFileSync(tmp, intervals.map((iv) => JSON.stringify(iv) + '\n').join(''));
    fs.renameSync(tmp, this.intervalsFile);
  }

  loadState() { return this._readJson(this.stateFile, {}); }
  loadIntervals() { return this._readLines(this.intervalsFile); }
  loadSessions() { return this._readLines(this.sessionsFile); }

  appendInterval(iv) { fs.appendFileSync(this.intervalsFile, JSON.stringify(iv) + '\n'); }
  appendSession(rec) { fs.appendFileSync(this.sessionsFile, JSON.stringify(rec) + '\n'); }

  saveState(obj) {
    this._pending = obj;
    if (!this._timer) this._timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    if (!this._pending) return;
    const tmp = this.stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._pending));
    fs.renameSync(tmp, this.stateFile);
    this._pending = null;
  }
}

module.exports = { Store, DEFAULT_CONFIG };

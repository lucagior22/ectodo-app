'use strict';

// El widget en reposo se aparta cuando el cursor se queda sobre su lugar y vuelve cuando el cursor sale.
// Sin Electron: main.js le pasa el cursor, el rectangulo de origen y la hora, y mueve la ventana.

const DWELL_MS = 120; // el cursor tiene que quedarse este tiempo: pasar de largo (p. ej. hacia la X de otra ventana) no lo mueve
const EXIT_PAD = 24; // para volver, el cursor tiene que alejarse este margen extra: evita el ida y vuelta en el borde
const ANIM_MS = 260;

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); // easeOutCubic

function inRect(p, r, pad = 0) {
  return p.x >= r.x - pad && p.x < r.x + r.width + pad && p.y >= r.y - pad && p.y < r.y + r.height + pad;
}

// Al lado opuesto de su pantalla (respecto del centro del widget), a la misma altura.
function targetFor(b, wa, margin) {
  const right = b.x + b.width / 2 > wa.x + wa.width / 2;
  return { x: right ? wa.x + margin : wa.x + wa.width - b.width - margin, y: b.y };
}

function frame(from, to, t) {
  const k = ease(t);
  return { x: Math.round(from.x + (to.x - from.x) * k), y: Math.round(from.y + (to.y - from.y) * k) };
}

// home -> (cursor dentro de la zona DWELL_MS) -> 'away' -> (cursor fuera de la zona + EXIT_PAD) -> 'home'
function createDodge({ dwellMs = DWELL_MS, exitPad = EXIT_PAD } = {}) {
  let away = false;
  let enteredAt = null;
  let armed = true; // desarmado: no se aparta hasta que el cursor salga de la zona una vez
  return {
    isAway: () => away,
    // zone: rectangulo del lugar de origen (no donde esta la ventana ahora). Devuelve 'away' | 'home' | null.
    step(p, zone, now) {
      if (away) {
        if (inRect(p, zone, exitPad)) return null;
        away = false;
        return 'home';
      }
      if (!inRect(p, zone)) { enteredAt = null; armed = true; return null; }
      if (!armed) return null;
      if (enteredAt === null) enteredAt = now;
      if (now - enteredAt < dwellMs) return null;
      away = true;
      enteredAt = null;
      return 'away';
    },
    reset() { away = false; enteredAt = null; },
    // Al cerrar el panel el cursor suele quedar encima: sin esto el widget saldria disparado apenas se cierra.
    disarm() { armed = false; enteredAt = null; },
  };
}

module.exports = { DWELL_MS, EXIT_PAD, ANIM_MS, ease, inRect, targetFor, frame, createDodge };

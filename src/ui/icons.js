// Íconos SVG con la gramática de SF Symbols (caja de 16, trazo 1,5, terminaciones redondeadas; rellenos para lo activo).
// Uso: Icons.svg('play') -> markup; o <span data-icon="play"></span> en el HTML (se completa al cargar).
// Los trazos heredan currentColor; tamaño 1.1em (escala con el texto). Clases en tokens.css (.i, .i.f).
(function (root) {
  const P = {
    // rellenos (estado / acción principal)
    play: ['f', '<path d="M5.2 3.1v9.8a.6.6 0 0 0 .92.5l7.5-4.9a.6.6 0 0 0 0-1L6.12 2.6a.6.6 0 0 0-.92.5Z"/>'],
    pause: ['f', '<rect x="4" y="3" width="2.9" height="10" rx="1"/><rect x="9.1" y="3" width="2.9" height="10" rx="1"/>'],
    stop: ['f', '<rect x="3.5" y="3.5" width="9" height="9" rx="2"/>'],
    folder: ['f', '<path d="M1.8 4.5c0-.7.5-1.2 1.2-1.2h3.1l1.5 1.5H13c.7 0 1.2.5 1.2 1.2v5.9c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2V4.5Z"/>'],
    chart: ['f', '<rect x="2.4" y="8" width="2.8" height="5.6" rx="1"/><rect x="6.6" y="4.6" width="2.8" height="9" rx="1"/><rect x="10.8" y="2.4" width="2.8" height="11.2" rx="1"/>'],
    dot: ['f', '<circle cx="8" cy="8" r="3.2"/>'],
    warn: ['f', '<path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.6 9.8a1 1 0 0 1-.87 1.5H2.4a1 1 0 0 1-.87-1.5l5.6-9.8Z"/><path d="M8 6.2v3.1" stroke="var(--icon-cut, #000)" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.3" r=".85" fill="var(--icon-cut, #000)"/>'],
    // trazos
    moon: ['', '<path d="M13.3 10.1A5.7 5.7 0 0 1 5.9 2.7a5.7 5.7 0 1 0 7.4 7.4Z"/>'],
    sun: ['', '<circle cx="8" cy="8" r="2.9"/><path d="M8 1.4v1.4M8 13.2v1.4M1.4 8h1.4M13.2 8h1.4M3.3 3.3l1 1M11.7 11.7l1 1M3.3 12.7l1-1M11.7 4.3l1-1"/>'],
    grid: ['', '<rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1.3"/><rect x="9" y="2.4" width="4.6" height="4.6" rx="1.3"/><rect x="2.4" y="9" width="4.6" height="4.6" rx="1.3"/><rect x="9" y="9" width="4.6" height="4.6" rx="1.3"/>'],
    plus: ['', '<path d="M8 3v10M3 8h10"/>'],
    check: ['', '<path d="M3.4 8.4 6.6 11.4 12.6 4.8"/>'],
    x: ['', '<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"/>'],
    up: ['', '<path d="M8 13V3.4M4 7.2 8 3.2l4 4"/>'],
    down: ['', '<path d="M8 3v9.6M4 8.8l4 4 4-4"/>'],
    chevrons: ['', '<path d="M5 6.2 8 3.4l3 2.8M5 9.8l3 2.8 3-2.8"/>'],
    chevronDown: ['', '<path d="M4 6l4 4 4-4"/>'],
    list: ['', '<path d="M6 4.5h7M6 8h7M6 11.5h7"/><circle cx="3" cy="4.5" r=".4"/><circle cx="3" cy="8" r=".4"/><circle cx="3" cy="11.5" r=".4"/>'],
    clock: ['', '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8v3.4l2.2 1.4"/>'],
    gear: ['', '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.7v1.7M8 12.6v1.7M1.7 8h1.7M12.6 8h1.7M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M3.5 12.5l1.2-1.2M11.3 4.7l1.2-1.2"/>'],
    today: ['', '<rect x="2.2" y="3" width="11.6" height="10.8" rx="2.4"/><path d="M2.2 6.4h11.6M5.4 1.6v2.6M10.6 1.6v2.6"/><circle cx="8" cy="10" r="1.1" fill="currentColor" stroke="none"/>'],
    undo: ['', '<path d="M5.6 3.4 2.6 6.4l3 3"/><path d="M2.8 6.4h6.6a3.6 3.6 0 0 1 0 7.2H6.8"/>'],
    trash: ['', '<path d="M3 4.4h10M6.4 4.4V3c0-.4.3-.7.7-.7h1.8c.4 0 .7.3.7.7v1.4M4.4 4.4l.6 8.4c0 .6.5 1 1.1 1h3.8c.6 0 1.1-.4 1.1-1l.6-8.4"/>'],
    keyboard: ['', '<rect x="1.6" y="3.8" width="12.8" height="8.4" rx="2"/><path d="M4.4 6.6h.01M6.8 6.6h.01M9.2 6.6h.01M11.6 6.6h.01M5 9.4h6"/>'],
  };

  function svg(name, cls = '') {
    const p = P[name];
    if (!p) return '';
    return `<svg class="i${p[0] ? ' f' : ''}${cls ? ' ' + cls : ''}" viewBox="0 0 16 16" aria-hidden="true">${p[1]}</svg>`;
  }

  function fill(scope) {
    (scope || document).querySelectorAll('[data-icon]').forEach((el) => {
      if (!el.firstElementChild || el.firstElementChild.tagName.toLowerCase() !== 'svg') el.insertAdjacentHTML('afterbegin', svg(el.dataset.icon));
    });
  }

  root.Icons = { svg, fill, names: Object.keys(P) };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fill());
    else fill();
  }
})(typeof window !== 'undefined' ? window : globalThis);

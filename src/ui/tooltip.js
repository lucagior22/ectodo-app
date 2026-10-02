// Tooltips propios (estilo macOS) en lugar del title nativo de Windows. Compartido por el widget y el dashboard.
// Uso: data-tip="Texto" (+ data-key="h" para mostrar la tecla) en cualquier elemento. Un title="Texto (h)" existente
// también sirve: se convierte al pasar el mouse (el "(h)" final pasa a ser la tecla) y deja de mostrarse el nativo.
// Comportamiento de macOS: aparece tras una pausa; si ya había uno abierto hace poco, el siguiente aparece al instante.
(function () {
  const DELAY_MS = 550;
  const WARM_MS = 400; // después de cerrar uno, el siguiente aparece sin esperar
  const GAP = 6;
  const EDGE = 6;

  let tip = null;
  let target = null;
  let showTimer = null;
  let hiddenAt = 0;
  let watch = null; // mientras hay uno visible: cierra si su elemento se redibujó y refresca valores en vivo
  let shown = ''; // último contenido escrito (innerHTML no sirve para comparar: el navegador reserializa)

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "Ctrl+Z", "b b", "F1–F6": cada parte separada por espacio es una keycap
  const keys = (k) => k.trim().split(/\s+/).map((p) => `<kbd>${esc(p)}</kbd>`).join('');

  // title nativo -> data-tip (+ data-key si termina en "(x)"); los íconos sin texto conservan su nombre accesible
  function adopt(el) {
    const t = el.getAttribute('title');
    if (t === null) return;
    el.removeAttribute('title');
    if (!t.trim()) return;
    const m = t.match(/^(.*?)\s*\(([^()]{1,14})\)$/);
    el.dataset.tip = m ? m[1] : t;
    if (m && !el.dataset.key) el.dataset.key = m[2];
    if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', el.dataset.tip);
  }

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    return tip;
  }

  function place(el) {
    const r = el.getBoundingClientRect();
    // offsetWidth/Height: el tamaño real, sin el scale(.97) de la entrada (getBoundingClientRect lo achica)
    const t = { width: tip.offsetWidth, height: tip.offsetHeight };
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let top = r.bottom + GAP;
    let below = true;
    if (top + t.height > vh - EDGE && r.top - GAP - t.height >= EDGE) { top = r.top - GAP - t.height; below = false; }
    const left = Math.min(vw - EDGE - t.width, Math.max(EDGE, r.left + r.width / 2 - t.width / 2));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.classList.toggle('above', !below);
  }

  const content = (el) => `<span>${esc(el.dataset.tip)}</span>${el.dataset.key ? `<span class="k">${keys(el.dataset.key)}</span>` : ''}`;

  function show(el) {
    if (!el.isConnected || !el.dataset.tip) return;
    ensureTip();
    tip.innerHTML = shown = content(el);
    clearInterval(watch);
    watch = setInterval(() => {
      if (!target || !target.isConnected || !target.dataset.tip) { hide(); return; }
      const html = content(target);
      if (html !== shown) { tip.innerHTML = shown = html; place(target); }
    }, 250);
    tip.classList.remove('on');
    tip.style.display = 'flex';
    place(el);
    requestAnimationFrame(() => { if (target === el) tip.classList.add('on'); });
  }

  function hide() {
    clearTimeout(showTimer);
    clearInterval(watch);
    if (tip && tip.classList.contains('on')) hiddenAt = Date.now();
    target = null;
    if (tip) { tip.classList.remove('on'); tip.style.display = 'none'; }
  }

  // el widget en reposo es click-through: ahí no hay tooltips
  const enabled = () => !document.body.classList.contains('ghost');

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[title], [data-tip]');
    if (!el || el === target) return;
    adopt(el);
    if (!el.dataset.tip || !enabled()) return;
    hide();
    target = el;
    const warm = Date.now() - hiddenAt < WARM_MS;
    showTimer = setTimeout(() => show(el), warm ? 0 : DELAY_MS);
  });
  document.addEventListener('pointerout', (e) => {
    if (target && !(e.relatedTarget && target.contains(e.relatedTarget))) hide();
  });
  // cualquier interacción lo cierra (como en macOS); también el desplazamiento y perder el foco de la ventana
  for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, hide, true);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
})();

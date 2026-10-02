// Color de acento: valida, resuelve los colores de sistema (variante clara/oscura), ajusta al tema para que el
// texto en acento contraste y lo aplica como variables CSS. Funciona en el navegador (window.Theme) y en Node (tests).
(function (root) {
  // Colores de sistema de Apple (HIG 2025): [nombre, claro, oscuro]. El acento se guarda con el valor claro.
  const SYSTEM = [
    ['azul', '#0088ff', '#0091ff'],
    ['índigo', '#6155f5', '#6d7cff'],
    ['morado', '#cb30e0', '#db34f2'],
    ['rosa', '#ff2d55', '#ff375f'],
    ['naranja', '#ff8d28', '#ff9230'],
    ['verde', '#34c759', '#30d158'],
    ['grafito', '#8e8e93', '#98989d'],
  ];
  const DEFAULT_ACCENT = SYSTEM[0][1];
  const PRESETS = SYSTEM.map(([name, light]) => [name, light]);
  // Fondos sobre los que va texto en acento (los mismos que usa tokens.css).
  const BG = { dark: '#1c1c1e', light: '#ffffff' };
  const MIN_CONTRAST = 4.5;
  // Etiquetas semibold de 13 px+ sobre un relleno: alcanza 3:1 (criterio WCAG de texto en negrita), como hace Apple.
  const ON_FILL_MIN = 3;

  const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

  function luminance(hex) {
    const [r, g, b] = toRgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a, b) {
    const x = luminance(a);
    const y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  function toHsl(hex) {
    const [r, g, b] = toRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }

  function fromHsl(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
  }

  // Color de relleno (botón primario, selección, checks): el de sistema tal cual, en su variante del tema.
  // Un color propio se usa sin tocar. Un valor invalido cae al acento por defecto.
  function fillFor(theme, hex) {
    const base = isHex(hex) ? hex.toLowerCase() : DEFAULT_ACCENT;
    const sys = SYSTEM.find(([, light, dark]) => light === base || dark === base);
    if (!sys) return base;
    return theme === 'light' ? sys[1] : sys[2];
  }

  // Acento para TEXTO o íconos sobre el fondo neutro: el relleno ajustado hasta contrastar >= 4.5:1
  // (aclara en oscuro, oscurece en claro).
  function accentFor(theme, hex) {
    const base = fillFor(theme, hex);
    const bg = BG[theme === 'light' ? 'light' : 'dark'];
    if (contrast(base, bg) >= MIN_CONTRAST) return base;
    const [h, s, l] = toHsl(base);
    const dir = theme === 'light' ? -1 : 1;
    let out = base;
    for (let i = 1; i <= 100 && contrast(out, bg) < MIN_CONTRAST; i++) out = fromHsl(h, s, Math.min(1, Math.max(0, l + dir * i * 0.01)));
    return out;
  }

  // Texto que va SOBRE el relleno: blanco siempre que alcance (estilo Apple), si no el oscuro.
  function onAccent(hex) {
    const dark = '#111113';
    const light = '#ffffff';
    if (contrast(hex, light) >= ON_FILL_MIN) return light;
    return contrast(hex, dark) >= contrast(hex, light) ? dark : light;
  }

  function apply(el, theme, hex) {
    const fill = fillFor(theme, hex);
    const text = accentFor(theme, hex);
    el.style.setProperty('--accent', fill);
    el.style.setProperty('--accent-rgb', toRgb(fill).join(','));
    el.style.setProperty('--accent-text', text);
    el.style.setProperty('--on-accent', onAccent(fill));
    return fill;
  }

  const api = { DEFAULT_ACCENT, PRESETS, SYSTEM, BG, isHex, contrast, fillFor, accentFor, onAccent, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Theme = api;
})(typeof window !== 'undefined' ? window : globalThis);

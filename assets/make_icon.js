'use strict';

// Regenera los íconos a partir de logo.svg y glyph.svg (una sola fuente de verdad).
// Uso: npx electron assets/make_icon.js
//  - icon.png  512 px, rejilla de macOS (squircle de 824/1024): Linux y ventanas
//  - icon.ico  16–256 px con menos margen (en Windows los íconos llenan más el lienzo)
//  - tray-dark.png / tray-light.png (+ @2x): silueta de una tinta para barras de tareas oscuras / claras
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const DIR = __dirname;
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const ICO_SCALE = 1.1457; // squircle de 824 -> 944 px: margen de 40 en lugar de 100

const svgUrl = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

// El navegador rasteriza el vector directo al tamaño pedido (sin reescalar un bitmap).
async function rasterize(win, svg, w, h = w) {
  const url = await win.webContents.executeJavaScript(`new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = ${w}; c.height = ${h};
      c.getContext('2d').drawImage(img, 0, 0, ${w}, ${h});
      ok(c.toDataURL('image/png'));
    };
    img.onerror = () => fail(new Error('svg invalido'));
    img.src = ${JSON.stringify(svgUrl(svg))};
  })`);
  return Buffer.from(url.split(',')[1], 'base64');
}

// ICO con entradas PNG (Windows Vista en adelante).
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<body></body>');

  const logo = fs.readFileSync(path.join(DIR, 'logo.svg'), 'utf8');
  const tight = logo.replace('<g id="art">', `<g id="art" transform="translate(${(512 * (1 - ICO_SCALE)).toFixed(2)} ${(512 * (1 - ICO_SCALE)).toFixed(2)}) scale(${ICO_SCALE})">`);
  const glyph = fs.readFileSync(path.join(DIR, 'glyph.svg'), 'utf8');

  fs.writeFileSync(path.join(DIR, 'icon.png'), await rasterize(win, logo, 512));
  const pngs = [];
  for (const size of ICO_SIZES) pngs.push({ size, data: await rasterize(win, tight, size) });
  fs.writeFileSync(path.join(DIR, 'icon.ico'), ico(pngs));

  // la silueta (530x610) centrada en un cuadrado, con un poco de aire
  const tray = (color) => {
    const g = glyph.replace('fill="#000"', `fill="${color}"`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><image href="${svgUrl(g)}" x="55" y="15" width="530" height="610"/></svg>`;
  };
  for (const [name, color] of [['tray-dark', '#ffffff'], ['tray-light', '#000000']]) {
    fs.writeFileSync(path.join(DIR, `${name}.png`), await rasterize(win, tray(color), 16));
    fs.writeFileSync(path.join(DIR, `${name}@2x.png`), await rasterize(win, tray(color), 32));
  }
  console.log('[make_icon] icon.png, icon.ico, tray-dark/light(.png, @2x) listos');
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });

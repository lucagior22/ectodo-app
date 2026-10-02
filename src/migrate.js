'use strict';

const fs = require('fs');
const path = require('path');

// Archivos de datos propios de la app (el resto de la carpeta es cache de Chromium).
const DATA_FILES = ['state.json', 'intervals.jsonl', 'sessions.jsonl', 'config.json'];

// La app se llamaba taskghost: si la carpeta nueva todavia no tiene datos y la vieja si, se copian.
// Copia (no mueve): la carpeta vieja queda de respaldo. Devuelve los archivos copiados.
function migrateData(fromDir, toDir) {
  if (DATA_FILES.some((f) => fs.existsSync(path.join(toDir, f)))) return [];
  const found = DATA_FILES.filter((f) => fs.existsSync(path.join(fromDir, f)));
  if (!found.length) return [];
  fs.mkdirSync(toDir, { recursive: true });
  for (const f of found) fs.copyFileSync(path.join(fromDir, f), path.join(toDir, f));
  return found;
}

module.exports = { migrateData, DATA_FILES };

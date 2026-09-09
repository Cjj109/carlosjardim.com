#!/usr/bin/env node
/**
 * Sube la versión de la calculadora en los sitios donde hay que subirla.
 *
 * Son seis, repartidos en tres archivos, y hay que tocarlos todos a la vez:
 *
 *   calculadora.html   ?r=N en variables.css, calculadora.css y calculadora.js
 *                      el sello "vN" del pie
 *   sw-calculadora.js  VERSION ('tasas-vN') y REVISION (N)
 *   acceso.html        ?r=N en acceso.js
 *
 * Olvidar uno no da ningún error: el service worker guarda los archivos por
 * su dirección y sirve de memoria lo que ya tiene, así que un cambio sin
 * subir la versión sencillamente no llega —ni a la app instalada ni al
 * navegador— y todo parece funcionar. Pasó durante el desarrollo: se probó
 * un arreglo contra el código anterior sin notarlo.
 *
 * Uso:
 *   node scripts/version-calculadora.mjs        # sube una
 *   node scripts/version-calculadora.mjs 25     # pone la 25
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(raiz, 'calculadora.html');
const SW = join(raiz, 'sw-calculadora.js');
/* acceso.html va con los demas.
   Estuvo fuera y se quedo con ?r=1 fijo mientras su codigo cambiaba ocho
   veces en un dia: el navegador y el service worker siguieron sirviendo la
   primera version, y la casilla de invitar no aparecia. Es exactamente el
   fallo silencioso del que avisa la cabecera de este archivo, cometido por
   dejar una pagina fuera de la lista. */
const ACCESO = join(raiz, 'acceso.html');

const html = readFileSync(HTML, 'utf8');
const sw = readFileSync(SW, 'utf8');
const acceso = readFileSync(ACCESO, 'utf8');

const actual = Number(sw.match(/const REVISION = (\d+);/)?.[1]);
if (!Number.isInteger(actual)) {
  console.error('No se encontró REVISION en sw-calculadora.js');
  process.exit(1);
}

const nueva = process.argv[2] ? Number(process.argv[2]) : actual + 1;
if (!Number.isInteger(nueva) || nueva <= 0) {
  console.error(`Versión no válida: ${process.argv[2]}`);
  process.exit(1);
}

const cambios = [];

let htmlNuevo = html.replace(/\?r=\d+/g, () => {
  cambios.push('?r=');
  return `?r=${nueva}`;
});
htmlNuevo = htmlNuevo.replace(/(title="Versión de la app instalada">)v\d+/, (_, pre) => {
  cambios.push('sello del pie');
  return `${pre}v${nueva}`;
});

const accesoNuevo = acceso.replace(/\?r=\d+/g, () => {
  cambios.push('acceso.html ?r=');
  return `?r=${nueva}`;
});

const swNuevo = sw
  .replace(/const VERSION = 'tasas-v\d+';/, () => {
    cambios.push('VERSION');
    return `const VERSION = 'tasas-v${nueva}';`;
  })
  .replace(/const REVISION = \d+;/, () => {
    cambios.push('REVISION');
    return `const REVISION = ${nueva};`;
  });

// Que no queden versiones sueltas: si una se escapa, el fallo es silencioso
const sueltas = [
  ...[...htmlNuevo.matchAll(/\?r=(\d+)/g)].map((m) => m[1]),
  ...[...accesoNuevo.matchAll(/\?r=(\d+)/g)].map((m) => m[1]),
  ...[...swNuevo.matchAll(/tasas-v(\d+)|REVISION = (\d+)/g)].map((m) => m[1] ?? m[2]),
].filter((v) => Number(v) !== nueva);

if (sueltas.length) {
  console.error(`✗ Quedaron versiones sin subir: ${[...new Set(sueltas)].join(', ')}`);
  process.exit(1);
}

writeFileSync(HTML, htmlNuevo);
writeFileSync(SW, swNuevo);
writeFileSync(ACCESO, accesoNuevo);

console.log(`✓ v${actual} → v${nueva}  (${cambios.length} sitios: ${cambios.join(', ')})`);

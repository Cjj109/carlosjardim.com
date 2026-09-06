#!/usr/bin/env node
/**
 * Pone la huella del contenido en las direcciones de las fuentes.
 *
 * POR QUÉ HACE FALTA
 *
 * _headers sirve /fonts/*.woff2 con `immutable, max-age=31536000`, y esa
 * cabecera es una promesa: "este archivo no va a cambiar nunca; no vuelvas a
 * preguntar en un año". Los navegadores la cumplen al pie de la letra — ni
 * siquiera revalidan.
 *
 * Al recortar las fuentes se cambió el contenido dejando la misma dirección,
 * o sea que se rompió la promesa. Resultado comprobado en producción:
 *
 *   cf-cache-status: HIT   age: 3148   tamaño: 48432   (la vieja, sin recortar)
 *
 * El recorte no llegaba a nadie, ni al CDN ni a quien ya hubiera abierto la
 * página. Y así habría seguido un año.
 *
 * La solución de un archivo inmutable es que su dirección dependa de su
 * contenido: si cambia el contenido, cambia la dirección, y entonces
 * `immutable` vuelve a ser verdad. Aquí va como ?v=<huella> en vez de meterla
 * en el nombre, para no dejar archivos huérfanos por el repo cada vez.
 *
 * Se ejecuta solo, al final de subset-fuentes.sh. A mano:
 *   node scripts/huella-fuentes.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// Los archivos donde se nombran las fuentes. Si aparece otro, va aquí.
const REFERENCIAS = [
  'css/variables.css',
  'calculadora.html',
  'sw-calculadora.js',
];

const fuentes = readdirSync(join(raiz, 'fonts')).filter((f) => f.endsWith('.woff2'));

const huellas = new Map();
for (const f of fuentes) {
  const hash = createHash('sha256')
    .update(readFileSync(join(raiz, 'fonts', f)))
    .digest('hex')
    .slice(0, 8);
  huellas.set(f, hash);
}

let tocados = 0;

for (const ruta of REFERENCIAS) {
  const completa = join(raiz, ruta);
  const antes = readFileSync(completa, 'utf8');
  let despues = antes;

  for (const [archivo, hash] of huellas) {
    // Con ?v= previo o sin él, siempre acaba con el actual
    const patron = new RegExp(`/fonts/${archivo.replace('.', '\\.')}(\\?v=[0-9a-f]+)?`, 'g');
    despues = despues.replace(patron, `/fonts/${archivo}?v=${hash}`);
  }

  if (despues !== antes) {
    writeFileSync(completa, despues);
    tocados += 1;
  }
}

for (const [archivo, hash] of huellas) {
  console.log(`  ${archivo.padEnd(28)} ?v=${hash}`);
}
console.log(`\n✓ ${tocados} archivo(s) de referencias actualizados`);

// Que no quede ninguna sin huella: una sola se queda servida desde la caché
// vieja durante un año, y el fallo es completamente silencioso.
const sinHuella = [];
for (const ruta of REFERENCIAS) {
  const texto = readFileSync(join(raiz, ruta), 'utf8');
  for (const m of texto.matchAll(/\/fonts\/([\w.-]+\.woff2)(\?v=([0-9a-f]+))?/g)) {
    if (m[3] !== huellas.get(m[1])) sinHuella.push(`${ruta}: ${m[0]}`);
  }
}

if (sinHuella.length) {
  console.error(`\n✗ Referencias sin la huella correcta:\n   ${sinHuella.join('\n   ')}`);
  process.exit(1);
}

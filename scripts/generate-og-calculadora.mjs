/**
 * Genera calculadora/og.png (1200x630), la tarjeta que se ve al compartir
 * el enlace por WhatsApp, Telegram o redes.
 *
 * A proposito NO lleva las tasas del momento: WhatsApp cachea la imagen
 * durante dias, asi que quedaria congelada en cifras viejas y enganaria a
 * quien la viera. Lo que dice es lo que no cambia.
 *
 * Uso:  SHARP_PATH=/ruta/a/sharp node scripts/generate-og-calculadora.mjs
 */
import { createRequire } from 'module';

// sharp no es dependencia de este repo: se indica donde esta con SHARP_PATH
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'sharp');
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200;
const H = 630;

const COLORES = { usd: '#5b93ff', eur: '#f5b544', usdt: '#2ecc71' };

const barra = (y, ancho, color) =>
  `<rect x="96" y="${y}" width="${ancho}" height="26" rx="13" fill="${color}"/>`;

const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fondo" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141824"/>
      <stop offset="100%" stop-color="#0a0b0f"/>
    </linearGradient>
    <radialGradient id="brillo" cx="15%" cy="0%" r="70%">
      <stop offset="0%" stop-color="#5b93ff" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#5b93ff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#fondo)"/>
  <rect width="${W}" height="${H}" fill="url(#brillo)"/>

  ${barra(150, 150, COLORES.usd)}
  ${barra(190, 210, COLORES.eur)}
  ${barra(230, 262, COLORES.usdt)}

  <text x="96" y="360" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="70" font-weight="bold" fill="#e8e9ee">Calculadora de tasas</text>

  <text x="96" y="425" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="34" fill="#9aa0ae">Dólar BCV · Euro BCV · USDT paralelo</text>

  <text x="96" y="500" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="27" fill="#626878">Cuánto vale un monto según cada tasa, y cuánto vender</text>

  <rect x="96" y="540" width="360" height="2" fill="#2a2f3d"/>

  <text x="96" y="580" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="25" fill="#2ecc71">carlosjardim.com/calculadora</text>
</svg>`;

// JPEG sin transparencia: WhatsApp descarta algunas imagenes con canal alfa
await sharp(Buffer.from(svg))
  .flatten({ background: '#0a0b0f' })
  .jpeg({ quality: 88 })
  .toFile(join(raiz, 'calculadora-app', 'og.jpg'));

console.log('calculadora-app/og.jpg generado (1200x630)');

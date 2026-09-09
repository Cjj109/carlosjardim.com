/**
 * La aritmética del 60 IQ, sin pasar por el modelo.
 *
 * El modelo decide QUÉ cuenta hacer; la cuenta la hace resolver(). Probar eso
 * a solas es barato y es donde estaba el fallo: una comparación con un precio
 * en bolívares los multiplicaba por la tasa, así que "15000 bs" salían por
 * doce millones y el ahorro era de once cifras.
 *
 *   node scripts/probar-60iq.mjs
 */
import { resolver } from '../functions/api/60iq.js';

// Las tasas del día en que se encontró el fallo
const tasas = { usd: 820.10, eur: 953.60, usdt: 960.21, zelle: 932.00 };

let fallos = 0;
const ok = (t, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) fallos++;
  console.log(`  ${bien ? '✓' : '✗'} ${t.padEnd(50)} ${JSON.stringify(real)}${bien ? '' : ` (esperado ${JSON.stringify(esp)})`}`);
};

console.log('\nEL CASO QUE FALLABA: 15 USDT CONTRA 15.000 BOLÍVARES');
{
  const r = resolver({
    tipo: 'comparar',
    pulla: 'x',
    opciones: [
      { monto: 15, tasa: 'usdt', moneda: 'divisa', etiqueta: 'en USDT' },
      { monto: 15000, tasa: 'usd', moneda: 'bs', etiqueta: 'a BCV' },
    ],
  }, tasas);

  // 15 × 960,21 = 14.403,15 Bs frente a 15.000 Bs tal cual
  ok('gana el USDT', r.partes.veredicto.includes('USDT'), true);
  ok('los bolívares NO se multiplican', r.partes.lineas[1].salida, '15.000,00 Bs.');
  ok('y se dicen tal cual', r.partes.lineas[1].detalle, 'en bolívares, tal cual');
  ok('el USDT sí se convierte', r.partes.lineas[0].detalle.startsWith('14.403,15 Bs.'), true);
  ok('el ahorro es de tres cifras, no de doce', r.partes.operacion, 'Te ahorras 596,85 Bs.');
}

console.log('\nLO DE SIEMPRE SIGUE BIEN: 65 $ A BCV CONTRA 60 USDT');
{
  const r = resolver({
    tipo: 'comparar',
    pulla: 'x',
    opciones: [
      { monto: 65, tasa: 'usd', moneda: 'divisa', etiqueta: 'a BCV' },
      { monto: 60, tasa: 'usdt', moneda: 'divisa', etiqueta: 'en USDT' },
    ],
  }, tasas);
  // 65 × 820,10 = 53.306,50   ·   60 × 960,21 = 57.612,60
  ok('gana el BCV', r.partes.veredicto.includes('$'), true);
  ok('con sus dos conversiones', r.partes.lineas.map((l) => l.salida), ['65,00 $', '60,00 USDT']);
  ok('y el ahorro también en la moneda que pierde', r.partes.operacion.includes('USDT'), true);
}

console.log('\nDOS PRECIOS LOS DOS EN BOLÍVARES');
{
  const r = resolver({
    tipo: 'comparar',
    pulla: 'x',
    opciones: [
      { monto: 15000, tasa: 'usd', moneda: 'bs', etiqueta: 'en la tienda A' },
      { monto: 14000, tasa: 'usdt', moneda: 'bs', etiqueta: 'en la tienda B' },
    ],
  }, tasas);
  ok('gana el más barato, sin convertir nada', r.partes.operacion, 'Te ahorras 1.000,00 Bs.');
}

console.log(fallos ? `\n${fallos} FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);

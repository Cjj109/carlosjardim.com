/**
 * El prompt del 60 IQ, contra el modelo de verdad.
 *
 * Las demás pruebas son puras: la aritmética, la memoria, el contexto. Esta no.
 * Esta le pregunta al modelo y mira QUÉ DECIDE, que es lo único que el prompt
 * controla y lo único que ninguna prueba vigilaba.
 *
 * POR QUÉ HACÍA FALTA
 *
 * El prompt se cambió cuatro veces en un día —el tono, la vía de conversación,
 * que no hace falta nombrar el producto— y cada cambio salió a producción
 * comprobado a mano, con dos preguntas. El fallo apareció en el teléfono del
 * dueño: "es mejor 7.5 en divisas o 8.5 BCV" devolvía una respuesta vacía
 * porque el modelo quería que le dijeran qué se compraba. Una pasada de esto
 * lo habría cazado antes de subirlo.
 *
 * QUÉ SE COMPRUEBA Y QUÉ NO
 *
 * La DECISIÓN, no las palabras: qué tipo, qué tasa, qué operación. El chiste
 * cambia en cada llamada y no se puede fijar sin volver la prueba inútil. Lo
 * que sí se exige siempre es que haya chiste —la pulla nunca vacía—, porque
 * cuando falta, la app se queda sin nada que enseñar.
 *
 * Donde una pregunta admite dos lecturas razonables, se aceptan las dos: una
 * prueba que exige la respuesta que a uno le gusta convierte el prompt en un
 * concurso de adivinar al que la escribió.
 *
 * CÓMO SE USA
 *
 * Cuesta unos céntimos por pasada: son ~25 llamadas a un modelo barato. La
 * clave no se escribe aquí ni se pega en ningún sitio, se lee del entorno:
 *
 *   export OPENROUTER_API_KEY_CALCULADORA=...
 *   node scripts/probar-modelo.mjs
 *   node scripts/probar-modelo.mjs --modelo=google/gemini-3.5-flash
 *   node scripts/probar-modelo.mjs --solo=insulto
 */
import { armarMensajes, ESQUEMA, MODELO_POR_DEFECTO } from '../functions/api/60iq.js';

const CLAVE = process.env.OPENROUTER_API_KEY_CALCULADORA || process.env.OPENROUTER_API_KEY;
if (!CLAVE) {
  console.error(`
  Falta la clave. Esta prueba habla con el modelo de verdad, así que necesita
  la misma clave que usa el servidor:

    export OPENROUTER_API_KEY_CALCULADORA=la-que-tengas-en-cloudflare
    node scripts/probar-modelo.mjs
`);
  process.exit(2);
}

const opciones = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = true] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);
const MODELO = opciones.modelo || MODELO_POR_DEFECTO;
const A_LA_VEZ = Number(opciones.tanda || 4);

/* Las tasas de un día cualquiera, fijas. Con las de verdad, la misma prueba
   diría una cosa hoy y otra mañana, y entonces no prueba el prompt: prueba el
   mercado. El orden importa: aquí el USDT está por encima del BCV, como suele. */
const TASAS = { usd: 842.21, eur: 955.03, usdt: 956.66, zelle: 961.2, facebank: 980.5, wally: 993.7, zinli: 1010.1 };

const u = (texto) => ({ role: 'user', content: texto });
const a = (texto) => ({ role: 'assistant', content: texto });

/* Cada caso: la pregunta y lo que tiene que DECIDIR.
   Un valor puede ser una lista: entonces vale cualquiera de ellos. */
const CASOS = [
  // ---- Lo básico, que es lo que más se usa
  { nombre: 'vender para tener bolívares', pregunta: 'Necesito 15.000 bolívares, ¿cuántos dólares vendo?',
    espera: { tipo: 'calculo', tasa: 'usdt', operacion: 'dividir', monto: 15000 },
    porque: 'nadie consigue bolívares a tasa BCV: vender es el mercado p2p' },

  { nombre: 'a secas, sin decir moneda', pregunta: '¿Cuánto son 15 mil bolívares?',
    espera: { tipo: 'calculo', tasa: 'todas', monto: 15000 },
    porque: 'quien pregunta a secas quiere comparar, no que elijas por él' },

  { nombre: 'un número pelado', pregunta: 'Tengo 350',
    espera: { tipo: 'calculo', tasa: 'todas', monto: 350 } },

  { nombre: 'nombra el BCV', pregunta: '¿Cuánto son 80 dólares a tasa BCV?',
    espera: { tipo: 'calculo', tasa: 'usd', operacion: 'multiplicar', monto: 80 } },

  { nombre: 'nombra Zelle', pregunta: 'Vendo 100 por Zelle, ¿cuánto me dan?',
    espera: { tipo: 'calculo', tasa: 'zelle', operacion: 'multiplicar', monto: 100 } },

  { nombre: 'nombra Zinli', pregunta: 'Vendo 100 de Zinli',
    espera: { tipo: 'calculo', tasa: 'zinli', monto: 100 },
    porque: 'Zinli es su propia tasa, no el USDT' },

  { nombre: 'euros', pregunta: '¿Cuánto son 40 euros?',
    espera: { tipo: 'calculo', tasa: ['eur', 'todas'], monto: 40 } },

  // ---- Dos pasos: la pregunta más común y la que más se falla
  { nombre: 'dos pasos con destino', pregunta: '130 dólares a BCV, ¿cuántos USDT debo vender?',
    espera: { tipo: 'calculo', tasa: 'usd', tasa_destino: 'usdt', monto: 130 },
    porque: 'son dos cuentas: a bolívares por BCV, y esos bolívares entre el USDT' },

  { nombre: 'un precio fijado a BCV', pregunta: 'Me cobran 500 $ a tasa BCV, ¿qué pago?',
    espera: { tipo: 'calculo', tasa: 'usd', tasa_destino: ['todas', 'usdt'], monto: 500 } },

  { nombre: 'precio en euros, pago por Zelle', pregunta: 'Un precio de 80 € del BCV, ¿cuánto es en Zelle?',
    espera: { tipo: 'calculo', tasa: 'eur', tasa_destino: 'zelle', monto: 80 } },

  // ---- Comparar, que es donde apareció el fallo de esta semana
  { nombre: 'comparar con producto', pregunta: 'Un control vale 65 $ a BCV o 60 USDT, ¿cómo conviene pagarlo?',
    espera: { tipo: 'comparar', opciones: 2 } },

  { nombre: 'comparar SIN producto', pregunta: 'Es mejor 7.5 en divisas o 8.5 BCV',
    espera: { tipo: 'comparar', opciones: 2 },
    porque: 'el fallo del 17/9: se quedaba mudo esperando a que le dijeran qué se compra' },

  { nombre: 'comparar sin producto, otra forma', pregunta: '¿Qué me conviene, 12 en USDT o 13 a BCV?',
    espera: { tipo: 'comparar', opciones: 2 } },

  { nombre: 'comparar con un precio en bolívares', pregunta: 'Me cobran 15 USDT o 15.000 bs a BCV, ¿qué pago?',
    espera: { tipo: 'comparar', opciones: 2, monedas: ['divisa', 'bs'] },
    porque: 'quince mil bolívares no son quince mil dólares: si falla, salen doce millones' },

  { nombre: 'comparar tres', pregunta: 'Lo mismo cuesta 20 en Zelle, 21 en Zinli o 19.5 en USDT, ¿cuál?',
    espera: { tipo: 'comparar', opciones: 3 } },

  // ---- Que le hablen a él
  { nombre: 'insulto', pregunta: 'Cállese que usted se mea',
    espera: { tipo: ['charla', 'fuera_de_tema'] },
    porque: 'tiene permiso para devolverlo, pero nunca para quedarse mudo' },

  { nombre: 'por qué insultas', pregunta: '¿Por qué me estás insultando?',
    espera: { tipo: ['charla', 'fuera_de_tema'] } },

  { nombre: 'gracias', pregunta: 'Gracias, muy amable',
    espera: { tipo: ['charla', 'fuera_de_tema'] } },

  { nombre: 'qué sabes de mí', pregunta: '¿Qué sabes de mí?',
    espera: { tipo: ['charla', 'fuera_de_tema'] } },

  { nombre: 'fuera de tema', pregunta: '¿Quién ganó el mundial del 78?',
    espera: { tipo: ['fuera_de_tema', 'charla'] } },

  // ---- La conversación que sigue
  { nombre: 'sigue la conversación', pregunta: '¿Y a todas las tasas?',
    turnos: [u('¿Cuánto son 350 dólares en USDT?'), a('334.904,50 Bs.')],
    espera: { tipo: 'calculo', tasa: 'todas', monto: 350 },
    porque: 'el monto ya lo dio: volver a pedirlo es no haber escuchado' },

  { nombre: 'y a bcv', pregunta: 'Y a bcv',
    turnos: [u('Tengo 200'), a('Van 200 a todas las tasas')],
    espera: { tipo: 'calculo', tasa: 'usd', monto: 200 } },

  // ---- Lo que tiene en pantalla
  { nombre: 'usa el modo abierto', pregunta: '¿Cuánto es 15000?',
    contexto: { modo: 'bs', monto: 15000 },
    espera: { tipo: 'calculo', operacion: 'dividir', monto: 15000 },
    porque: 'en el modo Bolívares, un número suelto son bolívares' },

  // ---- Que no se invente lo que no tiene
  { nombre: 'una tasa que no existe', pregunta: '¿Cuánto son 100 en Binance Pay?',
    espera: { tipo: ['calculo', 'falta_tasa', 'charla', 'fuera_de_tema'] },
    porque: 'no hay tasa para eso: lo que no vale es inventarse una' },
];

const soloEste = opciones.solo ? String(opciones.solo).toLowerCase() : null;
const aCorrer = soloEste ? CASOS.filter((c) => c.nombre.includes(soloEste)) : CASOS;

/** ¿El valor que devolvió encaja con lo que se esperaba? */
const encaja = (real, esperado) =>
  Array.isArray(esperado) ? esperado.includes(real) : real === esperado;

async function preguntar(caso) {
  const cuerpo = {
    model: MODELO,
    max_tokens: 700,
    temperature: 0.3,
    response_format: { type: 'json_schema', json_schema: { name: 'decision', strict: true, schema: ESQUEMA } },
    messages: armarMensajes({
      pregunta: caso.pregunta,
      tasas: TASAS,
      contexto: caso.contexto || null,
      // Con nombre, que el prompt dice que lo use y así se ve si lo usa
      quienEs: '\n\nHABLAS CON: Carlos.',
      turnos: caso.turnos || [],
    }),
  };

  const arranque = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLAVE}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://carlosjardim.com/calculadora',
      'X-Title': 'Calculadora de Tasas - pruebas del prompt',
    },
    body: JSON.stringify(cuerpo),
  });

  const tarda = Date.now() - arranque;
  if (!r.ok) return { fallo: `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`, tarda };

  const datos = await r.json();
  const crudo = datos?.choices?.[0]?.message?.content;
  if (!crudo) return { fallo: 'el modelo no devolvió nada', tarda };

  try {
    return { decision: JSON.parse(crudo), tarda };
  } catch {
    return { fallo: `no devolvió JSON: ${String(crudo).slice(0, 120)}`, tarda };
  }
}

/** Qué falla de este caso, si es que falla algo */
function revisar(caso, decision) {
  const quejas = [];
  const { espera } = caso;

  // La pulla nunca vacía: cuando falta, la app se queda sin nada que enseñar
  if (!String(decision.pulla ?? '').trim()) quejas.push('la pulla vino vacía');

  if (espera.tipo && !encaja(decision.tipo, espera.tipo)) {
    quejas.push(`tipo ${decision.tipo}, se esperaba ${JSON.stringify(espera.tipo)}`);
  }

  // En las vías sin cuenta, lo demás no aplica: no hay monto ni tasa que mirar
  const sinCuenta = decision.tipo === 'charla' || decision.tipo === 'fuera_de_tema';
  if (sinCuenta) return quejas;

  if (espera.tasa && !encaja(decision.tasa, espera.tasa)) {
    quejas.push(`tasa ${decision.tasa}, se esperaba ${JSON.stringify(espera.tasa)}`);
  }
  if (espera.tasa_destino && !encaja(decision.tasa_destino, espera.tasa_destino)) {
    quejas.push(`destino ${decision.tasa_destino}, se esperaba ${JSON.stringify(espera.tasa_destino)}`);
  }
  if (espera.operacion && !encaja(decision.operacion, espera.operacion)) {
    quejas.push(`operación ${decision.operacion}, se esperaba ${JSON.stringify(espera.operacion)}`);
  }
  if (espera.monto != null && Number(decision.monto) !== espera.monto && decision.tipo !== 'comparar') {
    quejas.push(`monto ${decision.monto}, se esperaba ${espera.monto}`);
  }
  if (espera.opciones != null) {
    const cuantas = Array.isArray(decision.opciones) ? decision.opciones.length : 0;
    if (cuantas < espera.opciones) quejas.push(`${cuantas} opciones, se esperaban ${espera.opciones}`);
  }
  if (espera.monedas) {
    const monedas = (decision.opciones || []).map((o) => o?.moneda);
    for (const m of espera.monedas) {
      if (!monedas.includes(m)) quejas.push(`faltó una opción en "${m}" (vinieron: ${monedas.join(', ') || 'ninguna'})`);
    }
  }
  return quejas;
}

console.log(`\n  ${aCorrer.length} preguntas · ${MODELO}\n`);

let fallos = 0;
let tiempos = [];

// De cuatro en cuatro: en fila tarda dos minutos y de golpe se come el límite
for (let i = 0; i < aCorrer.length; i += A_LA_VEZ) {
  const tanda = aCorrer.slice(i, i + A_LA_VEZ);
  const resultados = await Promise.all(tanda.map(preguntar));

  tanda.forEach((caso, j) => {
    const { decision, fallo, tarda } = resultados[j];
    tiempos.push(tarda);

    if (fallo) {
      fallos++;
      console.log(`  ✗ ${caso.nombre.padEnd(34)} ${fallo}`);
      return;
    }

    const quejas = revisar(caso, decision);
    if (quejas.length) {
      fallos++;
      console.log(`  ✗ ${caso.nombre.padEnd(34)} ${quejas.join(' · ')}`);
      if (caso.porque) console.log(`      ${caso.porque}`);
      console.log(`      dijo: "${String(decision.pulla ?? '').slice(0, 70)}"`);
    } else {
      console.log(`  ✓ ${caso.nombre.padEnd(34)} ${(tarda / 1000).toFixed(1)}s  "${String(decision.pulla ?? '').slice(0, 44)}"`);
    }
  });
}

const media = tiempos.reduce((s, t) => s + t, 0) / (tiempos.length || 1);
console.log(`\n  ${aCorrer.length - fallos}/${aCorrer.length} · ${(media / 1000).toFixed(1)}s de media\n`);
process.exit(fallos ? 1 : 0);

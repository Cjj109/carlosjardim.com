/**
 * Comprobacion de la vigencia de la tasa, de punta a punta.
 *
 *   node scripts/probar-vigencia.mjs
 *
 * Este sitio no tiene infraestructura de tests: es estatico mas funciones de
 * Pages. Pero la vigencia de la tasa es la pieza donde equivocarse sale caro,
 * asi que aqui esta el equivalente: se llama a la funcion REAL de
 * /api/bcv con una base SQLite en memoria y un BCV de mentira, y se recorre
 * una linea temporal completa.
 *
 * Los casos son los que importan y los que un arreglo a ojo se salta:
 *
 *   - El fin de semana. El BCV publica el viernes con fecha valor del LUNES,
 *     pero la tasa se aplica desde el sabado.
 *   - El feriado, con la fecha valor saltando dos dias o mas.
 *   - EL PARPADEO. Al publicar, la pagina del BCV va y viene entre la vieja y
 *     la nueva. El miedo es que el sistema tome la vieja por nueva.
 *
 * Requiere Node 22.13 o mas nuevo: antes de esa version node:sqlite
 * necesita --experimental-sqlite, y antes de la 22.5 no existe.
 */
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet } from '../functions/api/bcv.js';

const ESQUEMA = `
  CREATE TABLE bcv_vigencias (
    fecha    TEXT PRIMARY KEY,
    usd      REAL,
    eur      REAL,
    visto_en TEXT NOT NULL DEFAULT (datetime('now')),
    desde    TEXT
  );
`;

function nuevaD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(ESQUEMA);
  const envolver = (sql, params = []) => ({
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => sqlite.prepare(sql).run(...params),
  });
  return {
    prepare: (sql) => ({ ...envolver(sql), bind: (...p) => envolver(sql, p) }),
    batch: async (s) => Promise.all(s.map((x) => x.run())),
    filas: () => sqlite.prepare('SELECT fecha, usd, desde FROM bcv_vigencias ORDER BY fecha').all(),
  };
}

/** El HTML del BCV, con su formato real: coma decimal y fecha en el atributo */
const htmlBCV = (usd, eur, fechaValor) => `
  <div class="pull-right dinpro center"> Fecha Valor:
    <span class="date-display-single" content="${fechaValor}T00:00:00-04:00">x</span>
  </div>
  <div id="euro"><div class="col-sm-6 centrado textp"><strong class="strong-tb">${eur
    .toFixed(8)
    .replace('.', ',')}</strong></div></div>
  <div id="dolar"><div class="col-sm-6 centrado textp"><strong class="strong-tb">${usd
    .toFixed(8)
    .replace('.', ',')}</strong></div></div>`;

/**
 * Congela el reloj.
 *
 * Se sustituye Date entero, no solo now(): hoyCaracas() construye un Date sin
 * argumentos y luego lo formatea con Intl, asi que parchear solo now() no
 * bastaria.
 */
const DateReal = Date;
function reloj(iso) {
  const fijo = new DateReal(iso).getTime();
  globalThis.Date = class extends DateReal {
    constructor(...args) {
      super(...(args.length ? args : [fijo]));
    }
    static now() { return fijo; }
  };
}

/** El BCV responde ese HTML; DolarAPI lo que se le diga; el resto, caido */
function red(html, dolarapi = null) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('https://www.bcv.org.ve')) {
      if (!html) throw new Error('caido');
      return { ok: true, text: async () => html };
    }
    if (u.includes('dolarapi.com/v1/dolares/oficial')) {
      if (!dolarapi) throw new Error('caido');
      return { ok: true, json: async () => dolarapi };
    }
    throw new Error('caido');
  };
}

/** Un instante: pide /api/bcv y devuelve lo que se serviria */
async function pedir(db) {
  const res = await onRequestGet({
    request: new Request('https://carlosjardim.com/api/bcv'),
    env: { MONTOS: db },
  });
  const d = await res.json();
  return { usd: d.usd?.rate ?? null, desde: d.usd?.date ?? null, proxima: d.usd?.proxima ?? null };
}

/** Momento: son las X, el BCV enseña Y */
async function momento(db, ahora, usd, eur, fechaValor, dolarapi = null) {
  reloj(`${ahora}-04:00`);
  red(usd == null ? null : htmlBCV(usd, eur, fechaValor), dolarapi);
  return pedir(db);
}

let fallos = 0;
function comprobar(titulo, real, esperado) {
  const ok = real === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${titulo.padEnd(52)} ${real}${ok ? '' : `  (esperado ${esperado})`}`);
}

console.log('\nFIN DE SEMANA, CON EL BCV PARPADEANDO AL PUBLICAR');
{
  const db = nuevaD1();
  comprobar('jueves 10, rige 820', (await momento(db, '2026-09-10T09:00:00', 820, 900, '2026-09-10')).usd, 820);
  comprobar('viernes 11 mañana', (await momento(db, '2026-09-11T09:00:00', 820, 900, '2026-09-10')).usd, 820);
  comprobar('viernes 16:02, sale 830 para el lunes', (await momento(db, '2026-09-11T16:02:00', 830, 910, '2026-09-14')).usd, 820);
  comprobar('viernes 16:04, la página vuelve a la vieja', (await momento(db, '2026-09-11T16:04:00', 820, 900, '2026-09-10')).usd, 820);
  comprobar('viernes 16:07, otra vez la nueva', (await momento(db, '2026-09-11T16:07:00', 830, 910, '2026-09-14')).usd, 820);
  comprobar('viernes 16:09, otra vez la vieja', (await momento(db, '2026-09-11T16:09:00', 820, 900, '2026-09-10')).usd, 820);
  comprobar('viernes 23:58', (await momento(db, '2026-09-11T23:58:00', 830, 910, '2026-09-14')).usd, 820);
  comprobar('sábado 00:01, leyendo la VIEJA por parpadeo', (await momento(db, '2026-09-12T00:01:00', 820, 900, '2026-09-10')).usd, 830);
  comprobar('domingo 13', (await momento(db, '2026-09-13T10:00:00', 830, 910, '2026-09-14')).usd, 830);
  comprobar('lunes 14', (await momento(db, '2026-09-14T10:00:00', 830, 910, '2026-09-14')).usd, 830);

  const filas = db.filas();
  comprobar('dos filas, cada tasa en la suya', filas.length, 2);
  comprobar('  la vieja, en la fila del 10', `${filas[0].fecha}=${filas[0].usd}`, '2026-09-10=820');
  comprobar('  la nueva, en la del 14, desde el 12', `${filas[1].fecha}=${filas[1].usd}/${filas[1].desde}`, '2026-09-14=830/2026-09-12');
}

console.log('\nFERIADO: LA FECHA VALOR SALTA AL MARTES');
{
  const db = nuevaD1();
  await momento(db, '2026-09-10T09:00:00', 820, 900, '2026-09-10');
  comprobar('viernes, publica para el martes 15', (await momento(db, '2026-09-11T16:30:00', 830, 910, '2026-09-15')).usd, 820);
  for (const dia of ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15']) {
    comprobar(`${dia}`, (await momento(db, `${dia}T10:00:00`, 830, 910, '2026-09-15')).usd, 830);
  }
}

console.log('\nCORRECCIÓN DEL BCV SOBRE LA MISMA FECHA VALOR');
{
  const db = nuevaD1();
  await momento(db, '2026-09-11T16:00:00', 830, 910, '2026-09-14');
  await momento(db, '2026-09-11T18:00:00', 831, 911, '2026-09-14');
  comprobar('sábado: manda la corregida', (await momento(db, '2026-09-12T10:00:00', 831, 911, '2026-09-14')).usd, 831);
}

console.log('\nEL BCV CAÍDO');
{
  const db = nuevaD1();
  await momento(db, '2026-09-10T09:00:00', 820, 900, '2026-09-10');
  await momento(db, '2026-09-11T16:00:00', 830, 910, '2026-09-14');
  comprobar('sábado, todo caído: lo apuntado', (await momento(db, '2026-09-12T10:00:00', null, null, null)).usd, 830);

  // Dos semanas después, con DolarAPI vivo y por delante de todo lo apuntado
  const conDolarapi = { promedio: 900, fechaActualizacion: '2026-09-25T00:00:00-04:00' };
  comprobar('dos semanas caído: entra DolarAPI', (await momento(db, '2026-09-25T10:00:00', null, null, null, conDolarapi)).usd, 900);

  // Pero un fin de semana normal, DolarAPI NO puede tumbar la del sábado
  const db2 = nuevaD1();
  await momento(db2, '2026-09-10T09:00:00', 820, 900, '2026-09-10');
  await momento(db2, '2026-09-11T16:00:00', 830, 910, '2026-09-14');
  const atrasado = { promedio: 820, fechaActualizacion: '2026-09-13T00:00:00-04:00' };
  comprobar('domingo: DolarAPI atrasado no manda', (await momento(db2, '2026-09-13T10:00:00', 830, 910, '2026-09-14', atrasado)).usd, 830);
}

console.log('\nCUANDO NO HAY NINGUNA NUEVA PUBLICADA');
{
  // Lunes por la mañana: la del lunes ya entró y el BCV todavía no publica la
  // del martes. Son unas dieciséis horas al día en ese estado, así que no es
  // un caso raro: es la mañana.
  const db = nuevaD1();
  await momento(db, '2026-09-11T16:00:00', 830, 910, '2026-09-14');
  const lunes = await momento(db, '2026-09-14T09:00:00', 830, 910, '2026-09-14');
  comprobar('se cobra la que entró', lunes.usd, 830);
  comprobar('  y no se anuncia ninguna próxima', lunes.proxima, null);

  // Esa misma tarde publica la del martes
  const tarde = await momento(db, '2026-09-14T16:30:00', 840, 920, '2026-09-15');
  comprobar('por la tarde ya hay una que viene', `${tarde.proxima?.rate}@${tarde.proxima?.date}`, '840@2026-09-15');
}

console.log('\nLA PRÓXIMA SE ANUNCIA CON EL DÍA EN QUE ENTRA');
{
  const db = nuevaD1();
  await momento(db, '2026-09-10T09:00:00', 820, 900, '2026-09-10');
  const r = await momento(db, '2026-09-11T16:00:00', 830, 910, '2026-09-14');
  comprobar('viernes: se cobra 820', r.usd, 820);
  comprobar('  y se anuncia 830 para el 12, no el 14', `${r.proxima?.rate}@${r.proxima?.date}`, '830@2026-09-12');
}

globalThis.Date = DateReal;
console.log(fallos ? `\n${fallos} COMPROBACIONES FALLIDAS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);

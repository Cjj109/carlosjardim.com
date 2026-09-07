/**
 * Todas las fuentes de tasa, cada una con lo que da ahora mismo.
 *
 * Sirve para que en la calculadora se puedan comparar y elegir cuál usar, en
 * vez de tener que fiarse de la que alguien decidió por defecto. Las fuentes
 * se caen y se retrasan sin avisar —en este mismo sitio se murieron dos APIs
 * sin que nadie lo notara durante meses—, y verlas juntas es la manera de
 * enterarse el mismo día.
 */

import { hoyCaracas, guardarVigencia, vigenteEn, proximaTras, snapshotEstatico } from './_vigencia.js';

const PUENTE_P2P = 'https://tasa-p2p.vercel.app/api/p2p';
const PUENTE_BCV = 'https://bcv-puente.vercel.app/api/bcv';
const COTIZAVE = 'https://api.cotizave.com/v1/fx/rates';
const DOLARAPI_OFICIAL = 'https://ve.dolarapi.com/v1/dolares/oficial';
const DOLARAPI_PARALELO = 'https://ve.dolarapi.com/v1/dolares/paralelo';
const BCV_URL = 'https://www.bcv.org.ve/';

const CACHE = 120;

// Mas generoso que el de /api/bcv (6 s): este endpoint solo se pide al abrir
// el panel, y ahi esperar medio segundo mas es preferible a informar de que
// una fuente esta caida cuando lo unico que pasaba es que iba lenta. El panel
// existe para saber quien esta vivo; equivocarse en eso lo hace inutil.
const TIMEOUT = 8000;

const soloFecha = (v) => (v ? String(v).split('T')[0] : null);

function aNumero(texto) {
  return parseFloat(String(texto).trim().replace(/\./g, '').replace(',', '.'));
}

/**
 * Con tope por defecto, sobreescribible.
 *
 * Va aqui y no en cada llamada: por este helper pasan cuatro de las seis
 * fuentes, incluida la del p2p, que es la lenta de verdad. Ponerlo en un solo
 * sitio evita que la proxima que se anada se quede sin el.
 */
async function json(url, opciones = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { Accept: 'application/json' },
    ...opciones,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Página oficial del BCV: dólar y euro */
async function leerBCV() {
  const res = await fetch(BCV_URL, {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; carlosjardim.com/1.0)' },
    cf: { cacheTtl: CACHE, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const valor = (id) => {
    const i = html.indexOf(`id="${id}"`);
    if (i === -1) return null;
    const m = html.slice(i, i + 600).match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/);
    if (!m) return null;
    const n = aNumero(m[1]);
    return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
  };

  const fechaISO = html.match(/date-display-single[^>]*content="(\d{4}-\d{2}-\d{2})/);
  return { usd: valor('dolar'), eur: valor('euro'), fecha: fechaISO ? fechaISO[1] : null };
}

/** Los siete mercados p2p que publica Cotizave */
async function leerCotizave(clave) {
  if (!clave) throw new Error('sin clave');
  const datos = await json(COTIZAVE, { headers: { 'X-API-Key': clave, Accept: 'application/json' } });
  const tasas = datos.rates || [];

  const p2p = tasas.filter((r) => r.type === 'p2p' && r.mid > 0).map((r) => r.mid).sort((a, b) => a - b);
  const medio = Math.floor(p2p.length / 2);

  return {
    oficial: tasas.find((r) => r.market === 'reference') || null,
    binance: tasas.find((r) => r.market === 'binance') || null,
    consenso: p2p.length
      ? (p2p.length % 2 ? p2p[medio] : (p2p[medio - 1] + p2p[medio]) / 2)
      : null,
    mercados: p2p.length,
  };
}

export async function onRequestGet(context) {
  const clave = context.env?.COTIZAVE_API_KEY;

  const [bcvRes, cotizaveRes, puenteRes, puenteBcvRes, oficialRes, paraleloRes] = await Promise.allSettled([
    leerBCV(),
    leerCotizave(clave),
    json(PUENTE_P2P),
    json(PUENTE_BCV),
    json(DOLARAPI_OFICIAL),
    json(DOLARAPI_PARALELO),
  ]);

  const dato = (r) => (r.status === 'fulfilled' ? r.value : null);

  /**
   * Por que fallo una fuente, para que el panel no confunda "lenta" con
   * "muerta": las dos se pintaban igual, como un hueco sin numero, y de ahi
   * se concluye que algo esta roto cuando solo iba despacio.
   */
  const motivo = (r) => {
    if (r.status === 'fulfilled') return null;
    const m = r.reason?.name === 'TimeoutError' || /abort|timeout/i.test(r.reason?.message || '')
      ? 'tardo demasiado'
      : r.reason?.message || 'sin respuesta';
    return m;
  };
  /**
   * El origen contestó, pero esa cifra concreta no viene.
   *
   * Pasaba con "Binance · compra" cuando ese lado del libro trae menos de
   * ocho anuncios: el puente responde 200 y bien, pero sin `compra`. El panel
   * lo pintaba como "sin respuesta" —o sea, caído— que es justo la confusión
   * entre lenta y muerta que este campo vino a quitar.
   */
  const sinEsaCifra = (respondio) => (respondio ? 'respondió sin ese dato' : null);

  const motivoBcv = motivo(bcvRes);
  const motivoPuenteBcv = motivo(puenteBcvRes);
  const motivoPuente = motivo(puenteRes);
  const motivoCotizave = motivo(cotizaveRes);
  const motivoOficial = motivo(oficialRes);
  const motivoParalelo = motivo(paraleloRes);
  const bcv = dato(bcvRes);
  const cotizave = dato(cotizaveRes);
  const puente = dato(puenteRes);
  const puenteBcv = dato(puenteBcvRes);
  const oficial = dato(oficialRes);
  const paralelo = dato(paraleloRes);

  /* Lo que este panel enseña es lo que se va a usar para calcular: elegir una
     ficha sustituye la tasa de la calculadora. Así que las dos que leen la
     página del BCV enseñan la que YA SE APLICA, no la que el BCV acaba de
     colgar, y la que viene se anuncia aparte en `proxima`. Sin esto, elegir
     "Página del BCV" una tarde de publicación convertía con una tasa que aún
     no había entrado.

     Manda la tabla y no la lectura: un sábado el BCV sigue enseñando la fecha
     valor del lunes, pero esa tasa ya se aplica desde el sábado. */
  const hoy = hoyCaracas();
  // Los dos leen la misma página, así que comparten fecha valor
  await guardarVigencia(
    context.env?.MONTOS,
    bcv?.fecha ?? puenteBcv?.fecha,
    bcv?.usd ?? puenteBcv?.usd,
    bcv?.eur ?? puenteBcv?.eur,
    hoy
  );

  const aplicando =
    (await vigenteEn(context.env?.MONTOS, hoy)) ??
    (await snapshotEstatico(context.request.url, hoy));
  const siguiente = await proximaTras(context.env?.MONTOS, hoy);

  /** Cambia la lectura por la que ya se aplica, si es que son distintas */
  const vigente = (lectura) => {
    if (!lectura || !aplicando) return lectura;
    if (aplicando.fecha === lectura.fecha) return lectura;

    return {
      usd: aplicando.usd ?? lectura.usd,
      eur: aplicando.eur ?? lectura.eur,
      fecha: aplicando.desde ?? aplicando.fecha,
      proxima: siguiente
        ? { rate: siguiente.usd, eur: siguiente.eur, date: siguiente.desde ?? siguiente.fecha }
        : null,
    };
  };

  const bcvHoy = vigente(bcv);
  const puenteHoy = vigente(puenteBcv);

  const fuentes = [
    {
      id: 'bcv',
      grupo: 'bcv',
      nombre: 'Página del BCV',
      detalle: 'La fuente oficial. Lo que publica por la tarde entra al día siguiente.',
      rate: bcvHoy?.usd ?? null,
      eur: bcvHoy?.eur ?? null,
      date: bcvHoy?.fecha ?? null,
      proxima: bcvHoy?.proxima ?? null,
      motivo: motivoBcv ?? sinEsaCifra(bcv),
    },
    {
      id: 'bcv-puente',
      grupo: 'bcv',
      nombre: 'BCV vía Vercel',
      detalle: 'La misma página del BCV, leída desde otro sitio. Es el respaldo del euro.',
      rate: puenteHoy?.usd ?? null,
      eur: puenteHoy?.eur ?? null,
      date: puenteHoy?.fecha ?? null,
      proxima: puenteHoy?.proxima ?? null,
      motivo: motivoPuenteBcv ?? sinEsaCifra(puenteBcv),
    },
    {
      id: 'dolarapi',
      grupo: 'bcv',
      nombre: 'DolarAPI',
      detalle: 'Publica la tasa el día en que entra en vigor, no antes.',
      rate: oficial?.promedio ?? null,
      date: soloFecha(oficial?.fechaActualizacion),
      motivo: motivoOficial,
    },
    {
      id: 'cotizave-oficial',
      grupo: 'bcv',
      nombre: 'Cotizave',
      detalle: 'Misma medición que DolarAPI, por otra vía.',
      rate: cotizave?.oficial?.mid ?? null,
      date: soloFecha(cotizave?.oficial?.updated_at),
      motivo: motivoCotizave,
    },
    // Los dos lados del libro de Binance y su punto medio. Antes era una sola
    // entrada con la media, que es un precio al que no ejecuta nadie: se veía
    // una cifra y se cobraba otra. El orden importa —la venta va primera— por
    // dos razones: es la que usa la calculadora, y a quien tenga guardada la
    // vieja 'binance' se le cae a la primera del grupo, que es justo esta.
    {
      id: 'binance-venta',
      grupo: 'paralelo',
      nombre: 'Binance · venta',
      detalle: puente?.ads_venta
        ? `Lo que te pagan por vender. ${puente.ads_venta} anuncios, sin los extremos.`
        : 'Lo que te pagan si vendes USDT.',
      rate: puente?.venta ?? puente?.rate ?? null,
      date: soloFecha(puente?.updated_at),
      motivo: motivoPuente ?? sinEsaCifra(puente),
    },
    {
      id: 'binance-compra',
      grupo: 'paralelo',
      nombre: 'Binance · compra',
      detalle: puente?.ads_compra
        ? `Lo que pagas por comprar. ${puente.ads_compra} anuncios, sin los extremos.`
        : 'Lo que pagas si compras USDT.',
      rate: puente?.compra ?? null,
      date: soloFecha(puente?.updated_at),
      motivo: motivoPuente ?? sinEsaCifra(puente),
    },
    {
      id: 'binance-media',
      grupo: 'paralelo',
      nombre: 'Binance · media',
      detalle: puente?.spread
        ? `El punto medio del spread, que hoy es de ${puente.spread} Bs. Es la cifra que publican los bots.`
        : 'El punto medio entre compra y venta.',
      rate: puente?.media ?? puente?.rate ?? null,
      date: soloFecha(puente?.updated_at),
      motivo: motivoPuente ?? sinEsaCifra(puente),
    },
    {
      id: 'consenso',
      grupo: 'paralelo',
      nombre: 'Consenso p2p',
      detalle: cotizave?.mercados ? `Mediana de ${cotizave.mercados} casas de cambio.` : 'Mediana de varias casas p2p.',
      rate: cotizave?.consenso ?? null,
      date: null,
      motivo: motivoCotizave ?? sinEsaCifra(cotizave),
    },
    {
      id: 'cotizave-binance',
      grupo: 'paralelo',
      nombre: 'Binance vía Cotizave',
      detalle: 'Lo que Cotizave reporta del mercado de Binance.',
      rate: cotizave?.binance?.mid ?? null,
      date: soloFecha(cotizave?.binance?.updated_at),
      motivo: motivoCotizave ?? sinEsaCifra(cotizave),
    },
    {
      // Grupo propio y no 'paralelo': es una tasa distinta, no otra medición
      // de la misma. Puesta entre las paralelas, elegirla reemplazaba la del
      // USDT y la calculadora mostraba el mismo número dos veces.
      id: 'zelle',
      grupo: 'zelle',
      nombre: 'Zelle',
      detalle: puente?.zelle_por_usdt
        ? `Un USDT cuesta ${puente.zelle_por_usdt} en Zelle, de ${puente.zelle_ads} anuncios.`
        : 'Calculado desde el libro de Binance.',
      // Del lado de venta, no de la media: es la misma razón que en el USDT
      // —lo que importa es a cuánto cobras, no el punto medio del spread.
      rate: (puente?.venta ?? puente?.rate) && puente?.zelle_por_usdt
        ? Math.round(((puente.venta ?? puente.rate) / puente.zelle_por_usdt) * 100) / 100
        : null,
      date: soloFecha(puente?.updated_at),
      motivo: motivoPuente ?? sinEsaCifra(puente),
    },
    {
      id: 'dolarapi-paralelo',
      grupo: 'paralelo',
      nombre: 'DolarAPI · mercado',
      detalle: 'Otra medición distinta al p2p. Se actualiza una vez al día.',
      rate: paralelo?.promedio ?? null,
      date: soloFecha(paralelo?.fechaActualizacion),
      motivo: motivoParalelo,
    },
  ];

  return new Response(JSON.stringify({ fuentes, eur: bcvHoy?.eur ?? null, eurFecha: bcvHoy?.fecha ?? null }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE}, s-maxage=${CACHE}`,
    },
  });
}

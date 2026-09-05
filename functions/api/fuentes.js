/**
 * Todas las fuentes de tasa, cada una con lo que da ahora mismo.
 *
 * Sirve para que en la calculadora se puedan comparar y elegir cuál usar, en
 * vez de tener que fiarse de la que alguien decidió por defecto. Las fuentes
 * se caen y se retrasan sin avisar —en este mismo sitio se murieron dos APIs
 * sin que nadie lo notara durante meses—, y verlas juntas es la manera de
 * enterarse el mismo día.
 */

const PUENTE_P2P = 'https://tasa-p2p.vercel.app/api/p2p';
const COTIZAVE = 'https://api.cotizave.com/v1/fx/rates';
const DOLARAPI_OFICIAL = 'https://ve.dolarapi.com/v1/dolares/oficial';
const DOLARAPI_PARALELO = 'https://ve.dolarapi.com/v1/dolares/paralelo';
const BCV_URL = 'https://www.bcv.org.ve/';

const CACHE = 120;

const soloFecha = (v) => (v ? String(v).split('T')[0] : null);

function aNumero(texto) {
  return parseFloat(String(texto).trim().replace(/\./g, '').replace(',', '.'));
}

async function json(url, opciones = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, ...opciones });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Página oficial del BCV: dólar y euro */
async function leerBCV() {
  const res = await fetch(BCV_URL, {
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

  const [bcvRes, cotizaveRes, puenteRes, oficialRes, paraleloRes] = await Promise.allSettled([
    leerBCV(),
    leerCotizave(clave),
    json(PUENTE_P2P),
    json(DOLARAPI_OFICIAL),
    json(DOLARAPI_PARALELO),
  ]);

  const dato = (r) => (r.status === 'fulfilled' ? r.value : null);
  const bcv = dato(bcvRes);
  const cotizave = dato(cotizaveRes);
  const puente = dato(puenteRes);
  const oficial = dato(oficialRes);
  const paralelo = dato(paraleloRes);

  const fuentes = [
    {
      id: 'bcv',
      grupo: 'bcv',
      nombre: 'Página del BCV',
      detalle: 'La fuente oficial. Publica la tasa del próximo día hábil.',
      rate: bcv?.usd ?? null,
      eur: bcv?.eur ?? null,
      date: bcv?.fecha ?? null,
    },
    {
      id: 'dolarapi',
      grupo: 'bcv',
      nombre: 'DolarAPI',
      detalle: 'Publica la tasa el día en que entra en vigor, no antes.',
      rate: oficial?.promedio ?? null,
      date: soloFecha(oficial?.fechaActualizacion),
    },
    {
      id: 'cotizave-oficial',
      grupo: 'bcv',
      nombre: 'Cotizave',
      detalle: 'Misma medición que DolarAPI, por otra vía.',
      rate: cotizave?.oficial?.mid ?? null,
      date: soloFecha(cotizave?.oficial?.updated_at),
    },
    {
      id: 'binance',
      grupo: 'paralelo',
      nombre: 'Libro de Binance',
      detalle: puente?.ads ? `Promedio de ${puente.ads} anuncios, sin los extremos.` : 'Lectura directa del libro p2p.',
      rate: puente?.rate ?? null,
      date: soloFecha(puente?.updated_at),
    },
    {
      id: 'consenso',
      grupo: 'paralelo',
      nombre: 'Consenso p2p',
      detalle: cotizave?.mercados ? `Mediana de ${cotizave.mercados} casas de cambio.` : 'Mediana de varias casas p2p.',
      rate: cotizave?.consenso ?? null,
      date: null,
    },
    {
      id: 'cotizave-binance',
      grupo: 'paralelo',
      nombre: 'Binance vía Cotizave',
      detalle: 'Lo que Cotizave reporta del mercado de Binance.',
      rate: cotizave?.binance?.mid ?? null,
      date: soloFecha(cotizave?.binance?.updated_at),
    },
    {
      id: 'zelle',
      grupo: 'paralelo',
      nombre: 'Zelle',
      detalle: puente?.zelle_por_usdt
        ? `Un USDT cuesta ${puente.zelle_por_usdt} en Zelle, de ${puente.zelle_ads} anuncios.`
        : 'Calculado desde el libro de Binance.',
      rate: puente?.rate && puente?.zelle_por_usdt
        ? Math.round((puente.rate / puente.zelle_por_usdt) * 100) / 100
        : null,
      date: soloFecha(puente?.updated_at),
    },
    {
      id: 'dolarapi-paralelo',
      grupo: 'paralelo',
      nombre: 'Paralelo DolarAPI',
      detalle: 'Otra medición distinta al p2p. Se actualiza una vez al día.',
      rate: paralelo?.promedio ?? null,
      date: soloFecha(paralelo?.fechaActualizacion),
    },
  ];

  return new Response(JSON.stringify({ fuentes, eur: bcv?.eur ?? null, eurFecha: bcv?.fecha ?? null }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE}, s-maxage=${CACHE}`,
    },
  });
}

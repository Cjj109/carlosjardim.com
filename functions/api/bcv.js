/**
 * Cloudflare Pages Function: tasas BCV (USD, EUR) y USDT paralelo.
 *
 * El USD y el EUR se leen de la página del BCV, que es la fuente oficial.
 * Antes venían de bcvapi.tech, que dejó de responder (el dominio resuelve
 * pero el servidor no contesta) y por eso la web estaba devolviendo
 * "usd": null y "eur": null sin que nada avisara.
 *
 * El USDT sale del p2p de Binance vía Cotizave: el "paralelo" de DolarAPI
 * venía de otra medición que se actualiza una vez de madrugada, así que a
 * media mañana ya iba 13 bolívares por detrás del p2p real.
 *
 * Nota: bcv.org.ve entrega la cadena de certificados incompleta y ni Node ni
 * workerd local la aceptan, pero la red de Cloudflare en producción sí — que
 * es donde corre esto. Si algún día fallara, queda DolarAPI de respaldo.
 *
 * Cache: 5 minutos en el CDN.
 */

const BCV_URL = 'https://www.bcv.org.ve/';
const USD_RESPALDO = 'https://ve.dolarapi.com/v1/dolares/oficial';
// Binance rechaza las peticiones que salen de la red de Cloudflare, asi que
// la lectura del libro se hace desde una funcion propia en Vercel, cuyas IP
// si acepta. Comprobado: mismo codigo, desde aqui devuelve vacio y desde
// alli 82 anuncios.
const PUENTE_P2P = 'https://tasa-p2p.vercel.app/api/p2p';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchConCabeceras(url, opciones = {}) {
  return fetch(url, opciones);
}

/**
 * Tasa p2p leida del libro de Binance a traves del puente.
 *
 * Devuelve el promedio recortado de hasta 80 anuncios de los dos lados del
 * mercado. El puente cachea un minuto, asi que preguntar seguido no castiga
 * a Binance.
 */
async function leerUsdtBinance() {
  const res = await fetch(PUENTE_P2P, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const datos = await res.json();
  if (!datos.rate || datos.rate <= 0) return null;

  return {
    rate: datos.rate,
    date: (datos.updated_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
    anuncios: datos.ads,
  };
}

/**
 * USDT p2p con verificacion cruzada.
 *
 * Binance bloquea las IP de Cloudflare, asi que desde aqui no se puede leer
 * su libro directamente (comprobado: funciona desde una maquina normal y
 * falla en produccion, con cabeceras de navegador incluidas). Cotizave si lo
 * lee y publica ocho mercados p2p distintos, asi que en vez de fiarnos de una
 * sola cifra se contrasta la de Binance con la mediana de todas.
 *
 * Si Binance se aparta mas de un 2% del consenso, manda el consenso: un
 * mercado puede tener un anuncio raro o quedarse colgado, ocho a la vez no.
 *
 * Para una medicion propia del libro de Binance esta scripts/fetch_p2p.py,
 * que se ejecuta a mano desde cualquier maquina que Binance no bloquee.
 */
async function leerUsdtP2P(clave) {
  if (!clave) return null;

  const res = await fetchConCabeceras(COTIZAVE_API, {
    headers: { 'X-API-Key': clave, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const datos = await res.json();
  const mercados = (datos.rates || []).filter((r) => r.type === 'p2p' && r.mid > 0);
  if (!mercados.length) return null;

  const precios = mercados.map((m) => m.mid).sort((a, b) => a - b);
  const medio = Math.floor(precios.length / 2);
  const consenso = precios.length % 2
    ? precios[medio]
    : (precios[medio - 1] + precios[medio]) / 2;

  const binance = mercados.find((m) => m.market === 'binance');
  const seDesvia = binance && Math.abs(binance.mid - consenso) / consenso > 0.02;

  const elegido = binance && !seDesvia ? binance.mid : consenso;
  const origen = binance && !seDesvia ? 'binance' : 'consenso-p2p';

  return {
    rate: Math.round(elegido * 100) / 100,
    date: new Date((binance || mercados[0]).updated_at || Date.now()).toISOString().split('T')[0],
    market: origen,
    mercados: mercados.length,
  };
}

/** "945,65085917" -> 945.65085917 */
function aNumero(texto) {
  return parseFloat(String(texto).trim().replace(/\./g, '').replace(',', '.'));
}

/** Extrae el valor de una moneda del bloque que le corresponde en el HTML */
function leerMoneda(html, id) {
  const inicio = html.indexOf(`id="${id}"`);
  if (inicio === -1) return null;

  const encontrado = html.slice(inicio, inicio + 600).match(/<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/);
  if (!encontrado) return null;

  const valor = aNumero(encontrado[1]);
  // Si el HTML cambia y se lee cualquier cosa, mejor null que un disparate
  return Number.isFinite(valor) && valor > 0 && valor < 1_000_000 ? valor : null;
}

/** Fecha de vigencia; el BCV la trae exacta en un atributo */
function leerFecha(html) {
  const iso = html.match(/date-display-single[^>]*content="(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : new Date().toISOString().split('T')[0];
}

async function leerBCV() {
  const res = await fetch(BCV_URL, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Mozilla/5.0 (compatible; carlosjardim.com/1.0)',
    },
    cf: { cacheTtl: CACHE_MAX_AGE, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  return {
    usd: leerMoneda(html, 'dolar'),
    eur: leerMoneda(html, 'euro'),
    fecha: leerFecha(html),
  };
}

export async function onRequestGet(context) {
  const hoy = new Date().toISOString().split('T')[0];
  const conDiagnostico = new URL(context.request.url).searchParams.has('debug');

  try {
    const [bcvRes, binanceRes, usdtRes, usdtRespaldoRes, respaldoRes] = await Promise.allSettled([
      leerBCV(),
      leerUsdtBinance(),
      leerUsdtP2P(context.env?.COTIZAVE_API_KEY),
      fetchJson(USDT_RESPALDO),
      fetchJson(USD_RESPALDO),
    ]);

    const bcv = bcvRes.status === 'fulfilled' ? bcvRes.value : null;
    const binance = binanceRes.status === 'fulfilled' ? binanceRes.value : null;
    const usdt = usdtRes.status === 'fulfilled' ? usdtRes.value : null;
    const usdtRespaldo = usdtRespaldoRes.status === 'fulfilled' ? usdtRespaldoRes.value : null;
    const respaldo = respaldoRes.status === 'fulfilled' ? respaldoRes.value : null;

    // El respaldo solo entra si el BCV no dio dólar
    const usdRate = bcv?.usd ?? (respaldo?.promedio ? parseFloat(respaldo.promedio) : null);
    // El p2p en Venezuela siempre esta por encima del oficial. Si sale por
    // debajo o desorbitado, algo se leyo mal y se prefiere el respaldo.
    const binanceValido = binance && (!bcv?.usd || (binance.rate > bcv.usd * 0.9 && binance.rate < bcv.usd * 5));

    const usdFecha = bcv?.usd
      ? bcv.fecha
      : respaldo?.fechaActualizacion?.split('T')[0] ?? hoy;

    const output = {
      last_updated: new Date().toISOString(),
      eur: bcv?.eur ? { rate: bcv.eur, date: bcv.fecha, symbol: '€' } : null,
      usd: usdRate ? { rate: usdRate, date: usdFecha, symbol: '$' } : null,
      usdt: binanceValido
        ? { rate: binance.rate, date: binance.date, symbol: '₮', live: true, market: 'binance-p2p', anuncios: binance.anuncios }
        : usdt
        ? { rate: usdt.rate, date: usdt.date, symbol: '₮', live: true, market: usdt.market, mercados: usdt.mercados }
        : usdtRespaldo
          ? {
              rate: parseFloat(usdtRespaldo.promedio) || 0,
              date: usdtRespaldo.fechaActualizacion ? usdtRespaldo.fechaActualizacion.split('T')[0] : hoy,
              symbol: '₮',
              live: true,
              market: 'paralelo',
            }
          : null,
    };

    if (conDiagnostico) {
      output.diagnostico = {
        binanceDirecto: binanceRes.status === 'fulfilled' && binanceRes.value
          ? `ok (${binanceRes.value.anuncios} anuncios)`
          : `falla: ${binanceRes.reason?.message || 'sin datos'}`,
        cotizave: usdtRes.status === 'fulfilled' && usdtRes.value
          ? `ok (${usdtRes.value.mercados} mercados)`
          : `falla: ${usdtRes.reason?.message || 'sin datos'}`,
        bcv: bcvRes.status === 'fulfilled' ? 'ok' : `falla: ${bcvRes.reason?.message}`,
      };
    }

    return new Response(JSON.stringify(output), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=60`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch rates', message: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

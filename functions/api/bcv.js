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
const BINANCE_P2P = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const COTIZAVE_API = 'https://api.cotizave.com/v1/fx/rates';
const USDT_RESPALDO = 'https://ve.dolarapi.com/v1/dolares/paralelo';

const CACHE_MAX_AGE = 300;

async function fetchConCabeceras(url, opciones = {}) {
  return fetch(url, opciones);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

/**
 * Promedio recortado: se descarta el 20% de los extremos a cada lado y se
 * promedia el resto. En el p2p siempre hay anuncios disparatados arriba y
 * abajo, y esto los deja fuera sin tener que juzgarlos uno a uno.
 */
function promedioRecortado(valores, recorte = 0.2) {
  if (!valores.length) return null;

  const ordenados = [...valores].sort((a, b) => a - b);
  const fuera = Math.floor(ordenados.length * recorte);
  const centro = ordenados.slice(fuera, ordenados.length - fuera);
  const muestra = centro.length ? centro : ordenados;

  return muestra.reduce((a, b) => a + b, 0) / muestra.length;
}

/** Una pagina del libro p2p de Binance (20 anuncios) */
async function leerPaginaBinance(tradeType, page) {
  // Binance rechaza lo que no parece venir de su web, asi que se mandan las
  // cabeceras y el cuerpo que envia su propia pagina.
  const res = await fetch(BINANCE_P2P, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': 'es,en;q=0.9',
      Origin: 'https://p2p.binance.com',
      Referer: 'https://p2p.binance.com/es/trade/all-payments/USDT?fiat=VES',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'clienttype': 'web',
    },
    body: JSON.stringify({
      asset: 'USDT',
      fiat: 'VES',
      tradeType,
      page,
      rows: 20,
      payTypes: [],
      countries: [],
      publisherType: null,
      proMerchantAds: false,
      shieldMerchantAds: false,
      filterType: 'all',
      periods: [],
      additionalKycVerifyFilter: 0,
      classifies: ['mass', 'profession', 'fiat_trade'],
    }),
    // Sin opciones de cache: Cloudflare solo cachea GET, y ponerselas a un
    // POST hacia fallar la peticion entera.
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const datos = await res.json();
  return (datos.data || [])
    .map((x) => parseFloat(x?.adv?.price))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * USDT p2p leido directamente del libro de Binance.
 *
 * Es la fuente de la que beben los demas, asi que se pregunta ahi primero. Se
 * toman las dos primeras paginas de los dos lados del libro —hasta 80
 * anuncios— y se calcula el promedio recortado. Los dos lados juntos dan el
 * precio medio de mercado: la punta de venta y la de compra se separan un
 * poco y quedarse con una sola sesgaria el dato.
 *
 * Si Binance no responde queda Cotizave, y detras el paralelo de DolarAPI.
 */
async function leerUsdtBinance() {
  const peticiones = [];
  for (const tradeType of ['SELL', 'BUY']) {
    for (const page of [1, 2]) {
      peticiones.push(leerPaginaBinance(tradeType, page));
    }
  }

  const respuestas = await Promise.allSettled(peticiones);
  const precios = respuestas
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  // Con menos de diez anuncios el promedio no es representativo
  if (precios.length < 10) return null;

  const precio = promedioRecortado(precios);
  if (!Number.isFinite(precio) || precio <= 0) return null;

  return {
    rate: Math.round(precio * 100) / 100,
    date: new Date().toISOString().split('T')[0],
    anuncios: precios.length,
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

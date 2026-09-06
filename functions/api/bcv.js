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
 * EL LÍO DEL CERTIFICADO DE bcv.org.ve
 *
 * Aquí decía que el BCV "entrega la cadena de certificados incompleta". No es
 * eso, y la diferencia importa a la hora de diagnosticar:
 *
 *   El certificado de *.bcv.org.ve lo emite
 *     "Sectigo Public Server Authentication CA DV R36"
 *   pero el servidor entrega como intermedio
 *     "Sectigo RSA Domain Validation Secure Server CA"
 *
 * Son CAs distintas. No falta un eslabón: el que manda es EQUIVOCADO, un
 * sobrante de un certificado anterior, y el bueno no viaja en la conexión.
 *
 * Los navegadores y la red de Cloudflare lo salvan haciendo AIA fetching:
 * leen la extensión "CA Issuers" del propio certificado, que apunta a
 * http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt, se
 * bajan el intermedio que falta y cierran la cadena solos. Node no hace eso,
 * y por eso en local —y en cualquier runtime de Node— falla con
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 *
 * En producción esto corre en Cloudflare, así que funciona. Si el dólar
 * fallara queda DolarAPI de respaldo; el euro no tiene otro sitio de donde
 * salir, y por eso existe el puente de Vercel (vercel/bcv-puente), que sí
 * completa la cadena a mano.
 *
 * El certificado del BCV caduca el 20/11/2026: cuando lo renueven, esto puede
 * arreglarse solo o romperse de otra forma.
 *
 * Cache: 5 minutos en el CDN.
 */

const BCV_URL = 'https://www.bcv.org.ve/';
const USD_RESPALDO = 'https://ve.dolarapi.com/v1/dolares/oficial';
const USDT_RESPALDO = 'https://ve.dolarapi.com/v1/dolares/paralelo';
const COTIZAVE_API = 'https://api.cotizave.com/v1/fx/rates';

const CACHE_MAX_AGE = 300;
// Binance rechaza las peticiones que salen de la red de Cloudflare, asi que
// la lectura del libro se hace desde una funcion propia en Vercel, cuyas IP
// si acepta. Comprobado: mismo codigo, desde aqui devuelve vacio y desde
// alli 82 anuncios.
const PUENTE_P2P = 'https://tasa-p2p.vercel.app/api/p2p';

// El mismo BCV, leído desde Vercel completando a mano la cadena de
// certificados. Va de RESPALDO, no de principal, y esto está medido: leerlo
// desde aquí tarda ~555 ms haciendo además otras cuatro consultas en
// paralelo, mientras que pasar por Vercel cuesta ~680 ms él solo. Ponerlo
// primero sería meter un salto de red extra y un tercero del que depender
// para arreglar algo que hoy no está roto.
//
// Se pide en paralelo con todo lo demás, así que estar ahí no cuesta tiempo:
// solo se usa si el BCV directo falla. Y cubre el hueco de verdad, que es el
// euro: DolarAPI no lo publica, así que sin esto el euro no tenía respaldo.
const PUENTE_BCV = 'https://bcv-puente.vercel.app/api/bcv';

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
 * Devuelve el promedio recortado de hasta 80 anuncios, ahora con cada lado del
 * mercado por separado. El puente cachea un minuto, asi que preguntar seguido
 * no castiga a Binance.
 *
 * Se usa la VENTA, no la media. La media es el punto medio del spread y a ese
 * precio no ejecuta nadie: quien abre esta calculadora casi siempre quiere
 * saber cuanto le dan por vender, y eso es el lado de venta. Con el spread de
 * hoy —unos 9,4 bolivares, un 1%— usar la media decia medio por ciento de mas
 * en cada cuenta de "cuanto tengo que vender".
 *
 * El ?? mantiene el puente viejo funcionando: si todavia no devuelve `venta`,
 * se sigue con `rate` como hasta ahora.
 */
async function leerUsdtBinance() {
  const res = await fetch(PUENTE_P2P, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const datos = await res.json();
  const venta = datos.venta ?? datos.rate;
  if (!venta || venta <= 0) return null;

  return {
    rate: venta,
    venta,
    compra: datos.compra ?? null,
    media: datos.media ?? datos.rate ?? null,
    spread: datos.spread ?? null,
    date: (datos.updated_at || '').split('T')[0] || new Date().toISOString().split('T')[0],
    anuncios: datos.ads,
    anunciosVenta: datos.ads_venta ?? null,
    anunciosCompra: datos.ads_compra ?? null,
    // Cuantos dolares Zelle cuesta un USDT: de ahi sale la tasa del Zelle
    zellePorUsdt: datos.zelle_por_usdt || null,
    zelleAnuncios: datos.zelle_ads || 0,
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

// El puente va en paralelo con todo lo demás, y Promise.allSettled espera a
// que TODAS terminen: sin un tope, un arranque en frío de Vercel arrastraría
// al endpoint entero. Con 2,5 s basta —el puente responde en ~680 ms— y si
// tarda más, ya da igual: el BCV directo hace rato que contestó.
const TIMEOUT_PUENTE = 2500;

/** El mismo BCV, por el puente de Vercel. Solo se usa si el directo falla. */
async function leerBCVPuente() {
  const res = await fetch(PUENTE_BCV, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_PUENTE),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const datos = await res.json();
  if (!datos.usd && !datos.eur) return null;

  return { usd: datos.usd ?? null, eur: datos.eur ?? null, fecha: datos.fecha ?? null };
}

export async function onRequestGet(context) {
  const hoy = new Date().toISOString().split('T')[0];
  const conDiagnostico = new URL(context.request.url).searchParams.has('debug');

  try {
    const [bcvRes, puenteBcvRes, binanceRes, usdtRes, usdtRespaldoRes, respaldoRes] = await Promise.allSettled([
      leerBCV(),
      leerBCVPuente(),
      leerUsdtBinance(),
      leerUsdtP2P(context.env?.COTIZAVE_API_KEY),
      fetchJson(USDT_RESPALDO),
      fetchJson(USD_RESPALDO),
    ]);

    const directo = bcvRes.status === 'fulfilled' ? bcvRes.value : null;
    const puenteBcv = puenteBcvRes.status === 'fulfilled' ? puenteBcvRes.value : null;
    const binance = binanceRes.status === 'fulfilled' ? binanceRes.value : null;
    const usdt = usdtRes.status === 'fulfilled' ? usdtRes.value : null;
    const usdtRespaldo = usdtRespaldoRes.status === 'fulfilled' ? usdtRespaldoRes.value : null;
    const respaldo = respaldoRes.status === 'fulfilled' ? respaldoRes.value : null;

    // El BCV, moneda a moneda y no en bloque: si el directo lee el dólar pero
    // se atraganta con el euro, el euro lo pone el puente y el dólar se queda
    // con el bueno. Cogerlo entero obligaría a elegir entre los dos.
    const bcv = {
      usd: directo?.usd ?? puenteBcv?.usd ?? null,
      eur: directo?.eur ?? puenteBcv?.eur ?? null,
      fecha: directo?.fecha ?? puenteBcv?.fecha ?? hoy,
    };

    // DolarAPI es el último recurso, y solo sirve para el dólar
    const usdRate = bcv.usd ?? (respaldo?.promedio ? parseFloat(respaldo.promedio) : null);
    // El p2p en Venezuela siempre esta por encima del oficial. Si sale por
    // debajo o desorbitado, algo se leyo mal y se prefiere el respaldo.
    const binanceValido = binance && (!bcv.usd || (binance.rate > bcv.usd * 0.9 && binance.rate < bcv.usd * 5));

    const usdFecha = bcv.usd
      ? bcv.fecha
      : respaldo?.fechaActualizacion?.split('T')[0] ?? hoy;

    const output = {
      last_updated: new Date().toISOString(),
      // `via` dice de dónde salió cada una, que si no es imposible saber
      // desde fuera si el camino principal está caído
      eur: bcv.eur
        ? { rate: bcv.eur, date: bcv.fecha, symbol: '€', via: directo?.eur ? 'bcv' : 'puente' }
        : null,
      usd: usdRate
        ? {
            rate: usdRate,
            date: usdFecha,
            symbol: '$',
            via: directo?.usd ? 'bcv' : puenteBcv?.usd ? 'puente' : 'dolarapi',
          }
        : null,
      // El Zelle vale menos que el USDT porque quien lo recibe asume mas
      // riesgo. El sobreprecio se lee del libro de Binance, no se inventa.
      zelle: binanceValido && binance.zellePorUsdt
        ? {
            rate: Math.round((binance.rate / binance.zellePorUsdt) * 100) / 100,
            date: binance.date,
            symbol: 'Z',
            live: true,
            por_usdt: binance.zellePorUsdt,
            anuncios: binance.zelleAnuncios,
          }
        : null,
      usdt: binanceValido
        ? {
            rate: binance.rate,
            date: binance.date,
            symbol: '₮',
            live: true,
            market: 'binance-p2p',
            anuncios: binance.anuncios,
            // El otro lado y el punto medio, por si la interfaz quiere
            // enseñar el spread sin tener que preguntar otra vez
            lado: 'venta',
            compra: binance.compra,
            media: binance.media,
            spread: binance.spread,
          }
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

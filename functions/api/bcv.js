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
 * LO PUBLICADO NO ES LO VIGENTE
 *
 * El BCV cuelga por la tarde la tasa del día SIGUIENTE. Aquí se sirve la que
 * rige hoy —hoy en Caracas, no en UTC— y la recién publicada va aparte, en
 * `proxima`. La memoria de cuál regía antes está en _vigencia.js.
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

import { hoyCaracas, esFutura, guardarVigencia, vigenteEn, snapshotEstatico } from './_vigencia.js';

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

/**
 * Presupuesto de tiempo de TODA fuente externa.
 *
 * Promise.allSettled espera a que terminen todas, así que este endpoint tarda
 * lo que tarde la más lenta. Antes solo el puente del BCV tenía tope, que era
 * justo la equivocada: el puente responde en menos de un segundo, mientras
 * que el del p2p puede tardar 15 —tiene maxDuration 15, recorre dos hosts de
 * Binance en serie y encima espera al Zelle— y no tenía ninguno. Con Binance
 * lento, que es la razón misma de que ese puente exista, la calculadora se
 * quedaba en blanco quince segundos.
 *
 * 6 s para todas: generoso con un BCV lento —que es cuando el puente hace
 * falta— y aun así acota el endpoint entero.
 */
const TIMEOUT = 6000;

/** fetch con tope. Sin él, una sola fuente lenta arrastra a las cinco demás. */
function fetchConTope(url, opciones = {}) {
  // El signal va DESPUÉS del spread: puesto antes, cualquier llamada que
  // pasara el suyo propio anulaba el tope en silencio, y todo el presupuesto
  // de latencia de este endpoint depende de que ninguna fuente se quede sin
  // él. Hoy nadie lo pasa, pero fetchJson reenvía opciones arbitrarias.
  return fetch(url, { ...opciones, signal: opciones.signal ?? AbortSignal.timeout(TIMEOUT) });
}

async function fetchJson(url, opciones = {}) {
  const res = await fetchConTope(url, {
    headers: { Accept: 'application/json' },
    ...opciones,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
  const res = await fetchConTope(PUENTE_P2P, { headers: { Accept: 'application/json' } });
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

  const res = await fetchConTope(COTIZAVE_API, {
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
  const res = await fetchConTope(BCV_URL, {
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

/**
 * El mismo BCV, por el puente de Vercel. Solo se usa si el directo falla.
 *
 * Con el presupuesto comun y no uno mas corto, aunque sea "solo" un respaldo.
 * Tuvo 2,5 s y estaba mal pensado: los dos caminos leen el MISMO origen, asi
 * que cuando bcv.org.ve va lento van lentos los dos, y el puente se abortaba
 * precisamente en el apagon para el que existe. Y el euro depende de el:
 * DolarAPI y Cotizave no publican euro, asi que si este cae, la tarjeta del
 * euro se queda vacia sin nada detras.
 */
async function leerBCVPuente() {
  const res = await fetchConTope(PUENTE_BCV, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const datos = await res.json();
  if (!datos.usd && !datos.eur) return null;

  return { usd: datos.usd ?? null, eur: datos.eur ?? null, fecha: datos.fecha ?? null };
}

export async function onRequestGet(context) {
  const hoy = hoyCaracas();
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
    //
    // Y cada una se lleva SU fecha. Antes había una sola para las dos, así que
    // un euro venido del puente se sellaba con la fecha de la lectura directa:
    // la tarjeta anunciaba una vigencia que nunca acompañó a ese número, que
    // es el mismo tipo de etiqueta engañosa que `via` vino a evitar.
    const elegirMoneda = (campo) => {
      if (directo?.[campo] != null) return { rate: directo[campo], date: directo.fecha, via: 'bcv' };
      if (puenteBcv?.[campo] != null) return { rate: puenteBcv[campo], date: puenteBcv.fecha, via: 'puente' };
      return { rate: null, date: null, via: null };
    };

    const bcvUsd = elegirMoneda('usd');
    const bcvEur = elegirMoneda('eur');

    /* PUBLICADA NO ES VIGENTE

       El BCV cuelga por la tarde la tasa del día SIGUIENTE, y esa fecha valor
       viene en el propio HTML. Hasta aquí se cogía el número recién publicado
       y se convertía con él en el acto: el 7 de septiembre por la noche la
       calculadora ya cobraba a 814,6908, que no regía hasta el 8. El aviso
       del pie lo decía —"BCV rige 08/09"— pero la cuenta se hacía igual.

       Así que la publicada se apunta con su fecha valor, y mientras esa fecha
       no llegue se sirve la anterior. La memoria vive en D1 (_vigencia.js);
       al pasar la medianoche de Caracas la de mañana pasa a ser la de hoy
       sola, sin desplegar nada. */
    const publicada = { usd: bcvUsd.rate, eur: bcvEur.rate, fecha: bcvUsd.date ?? bcvEur.date ?? null };
    await guardarVigencia(context.env?.MONTOS, publicada.fecha, publicada.usd, publicada.eur);

    const adelantada = esFutura(publicada.fecha, hoy);
    const anterior = adelantada
      ? (await vigenteEn(context.env?.MONTOS, hoy)) ?? (await snapshotEstatico(context.request.url, hoy))
      : null;

    /**
     * La que rige hoy, y aparte la que ya está publicada para después.
     *
     * Si el BCV se adelantó y no hay memoria de la anterior —el primer
     * despliegue, o la base caída— se sigue con la publicada: es lo único que
     * hay, y es lo que se venía haciendo. En ese caso `date` sigue delatando
     * que la vigencia es futura.
     */
    const resolver = (campo, publicado) => {
      if (!adelantada || !anterior?.[campo]) return { ...publicado, proxima: null };
      return {
        // 'vigencia' y no 'bcv': el número sale de la memoria, no de la
        // lectura de ahora. Es la misma honestidad que `via` vino a dar.
        via: 'vigencia',
        rate: anterior[campo],
        date: anterior.fecha,
        proxima: { rate: publicado.rate, date: publicada.fecha },
      };
    };

    const usdBcv = resolver('usd', bcvUsd);
    const eurBcv = resolver('eur', bcvEur);

    // DolarAPI es el último recurso, y solo sirve para el dólar. Publica el
    // día en que la tasa entra en vigor, así que no se adelanta nunca.
    const usdRate = usdBcv.rate ?? (respaldo?.promedio ? parseFloat(respaldo.promedio) : null);
    // El p2p en Venezuela siempre esta por encima del oficial. Si sale por
    // debajo o desorbitado, algo se leyo mal y se prefiere el respaldo.
    const binanceValido = binance && (!usdRate || (binance.rate > usdRate * 0.9 && binance.rate < usdRate * 5));

    const usdFecha = usdBcv.rate
      ? usdBcv.date ?? hoy
      : respaldo?.fechaActualizacion?.split('T')[0] ?? hoy;

    const output = {
      last_updated: new Date().toISOString(),
      // `via` dice de dónde salió cada una, que si no es imposible saber
      // desde fuera si el camino principal está caído
      eur: eurBcv.rate
        ? {
            rate: eurBcv.rate,
            date: eurBcv.date ?? hoy,
            symbol: '€',
            via: eurBcv.via,
            // La que ya está publicada y todavía no rige, para que la
            // interfaz pueda anunciarla sin convertir con ella
            proxima: eurBcv.proxima,
          }
        : null,
      usd: usdRate
        ? {
            rate: usdRate,
            date: usdFecha,
            symbol: '$',
            via: usdBcv.via ?? 'dolarapi',
            proxima: usdBcv.proxima,
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
        // Faltaba, y es el unico respaldo del euro: si se cae en silencio, la
        // tarjeta del euro se vacia sin que nada lo explique. Es exactamente
        // el fallo que este archivo dice en su cabecera que vino a resolver.
        puenteBcv: puenteBcvRes.status === 'fulfilled' && puenteBcvRes.value
          ? 'ok'
          : `falla: ${puenteBcvRes.reason?.message || 'sin datos'}`,
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

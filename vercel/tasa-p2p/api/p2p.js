/**
 * Tasa p2p de USDT/VES leída del libro de Binance.
 *
 * Existe porque Binance rechaza las peticiones que salen de la red de
 * Cloudflare, donde vive carlosjardim.com. Desde Vercel sí responde, así que
 * esta función hace de puente: la web la consulta y recibe la medición.
 *
 * Método: dos páginas de cada lado del mercado (hasta 80 anuncios) y promedio
 * recortado descartando el 20% de los extremos, que es donde están los
 * anuncios disparatados.
 *
 * CADA LADO POR SEPARADO, y esto es lo importante. Antes se echaban los dos
 * lados en el mismo saco y se sacaba un promedio, con la idea de que quedarse
 * con uno sesgaba el precio. Dos problemas con aquello:
 *
 *   1. El número que salía no era ni la compra ni la venta, sino un punto
 *      medio al que no ejecuta nadie. Y la calculadora lo usaba para decirte
 *      cuánto te dan por vender, que es medio por ciento menos.
 *
 *   2. Ni siquiera era un punto medio fiable. Al mezclar y recortar sobre el
 *      total, el resultado se pondera por cuántos anuncios trae cada lado: si
 *      Binance devuelve 41 de un lado y 20 del otro, la cifra se desplaza
 *      hacia el lado más poblado sin que el mercado se haya movido.
 *
 * Ahora salen los tres números y quien consume elige: `venta` es lo que te
 * pagan, `compra` lo que pagas, y `media` el punto medio de verdad —la media
 * de los dos, sin ponderar— para quien quiera comparar con los bots que
 * publican esa cifra.
 *
 * Ojo con el tradeType, que es donde se confunde todo el mundo: es la acción
 * de QUIEN PREGUNTA, no la del anunciante. Pedir tradeType=SELL devuelve
 * anuncios con adv.tradeType=BUY, o sea gente que te compra: ese es el precio
 * al que tú vendes, y es el más bajo de los dos.
 */

const HOSTS = [
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
  'https://www.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
];

const CABECERAS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'Accept-Language': 'es,en;q=0.9',
  Origin: 'https://p2p.binance.com',
  Referer: 'https://p2p.binance.com/es/trade/all-payments/USDT?fiat=VES',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  clienttype: 'web',
};

// Por debajo de esto la muestra de un lado no da para un recortado con sentido
const MINIMO_POR_LADO = 8;

// Tope de cada peticion a Binance.
//
// No habia ninguno, y esta funcion tiene maxDuration 15: recorre dos hosts en
// serie y luego espera al Zelle, asi que con Binance lento se comia los quince
// segundos enteros. Quien la llama —carlosjardim.com— espera en paralelo a
// otras cinco fuentes con Promise.allSettled, de modo que ese tapon dejaba la
// calculadora en blanco todo ese rato. Y Binance yendo lento es precisamente
// la razon de que este puente exista.
const TIMEOUT_MS = 4000;

function cuerpo(tradeType, page, fiat = 'VES', payTypes = []) {
  return JSON.stringify({
    asset: 'USDT',
    fiat,
    tradeType,
    page,
    rows: 20,
    payTypes,
    countries: [],
    publisherType: null,
    proMerchantAds: false,
    shieldMerchantAds: false,
    filterType: 'all',
    periods: [],
    additionalKycVerifyFilter: 0,
    classifies: ['mass', 'profession', 'fiat_trade'],
  });
}

async function leerPagina(url, tradeType, page, fiat, payTypes) {
  const res = await fetch(url, {
    method: 'POST',
    headers: CABECERAS,
    body: cuerpo(tradeType, page, fiat, payTypes),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const datos = await res.json();
  return (datos.data || [])
    .map((x) => parseFloat(x?.adv?.price))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function promedioRecortado(valores, recorte = 0.2) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const fuera = Math.floor(ordenados.length * recorte);
  const centro = ordenados.slice(fuera, ordenados.length - fuera);
  const muestra = centro.length ? centro : ordenados;
  return muestra.reduce((a, b) => a + b, 0) / muestra.length;
}

const dosDecimales = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

/** Lee los dos lados del libro contra un host, cada uno por su cuenta */
async function leerLibro(url) {
  const peticiones = [];
  for (const tradeType of ['SELL', 'BUY']) {
    for (const page of [1, 2]) {
      peticiones.push(
        leerPagina(url, tradeType, page).then((precios) => ({ tradeType, precios }))
      );
    }
  }

  const respuestas = await Promise.allSettled(peticiones);
  const fallos = respuestas
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message);

  const lados = { SELL: [], BUY: [] };
  for (const r of respuestas) {
    if (r.status === 'fulfilled') lados[r.value.tradeType].push(...r.value.precios);
  }

  return { lados, fallos };
}

/**
 * Cuantos dolares de un medio de pago —Zelle, Facebank— cuesta un USDT.
 *
 * Esos dolares no se cambian uno a uno con el USDT: quien los recibe asume
 * mas riesgo y cobra por ello, asi que hace falta algo mas de un dolar Zelle
 * para comprar un USDT. Ese sobreprecio se lee del mismo libro de Binance, en
 * el mercado de USDT contra dolares con ese metodo de pago. Facebank se mide
 * igual y por la misma razon: es otro banco en dolares que se vende en p2p.
 *
 * Aqui si se mezclan los dos lados a proposito: es un factor de correccion
 * pequeño, no un precio de ejecucion, y la muestra por lado es demasiado
 * corta para partirla en dos.
 *
 * @param metodo  el identificador de Binance: 'Zelle', 'Facebank'
 */
async function leerDolaresPor(metodo) {
  // Con respaldo de host, igual que el libro principal. Solo miraba HOSTS[0],
  // así que si ese era justo el bloqueado —la razón misma de tener dos— el
  // Zelle desaparecía entero mientras el resto de tasas se veían sanas.
  //
  // Y los dos lados, no el primero que conteste. Se conformaba con seis
  // precios de donde fuera, y si un lado se caía se quedaba con el otro: en
  // el Zelle un lado va a 1,06-1,10 y el otro a 1,015-1,03, así que la cifra
  // se desviaba un par de puntos sin avisar. Ahora al segundo host se le pide
  // solo el lado que falta.
  const lados = { SELL: [], BUY: [] };
  for (const url of HOSTS) {
    const faltan = ['SELL', 'BUY'].filter((tradeType) => !lados[tradeType].length);
    if (!faltan.length) break;
    const respuestas = await Promise.allSettled(
      faltan.map((tradeType) =>
        leerPagina(url, tradeType, 1, 'USD', [metodo]).then((p) => [tradeType, p])
      )
    );
    for (const r of respuestas) {
      if (r.status === 'fulfilled') lados[r.value[0]].push(...r.value[1]);
    }
  }
  // Si aun así solo hay un lado, se usa: es lo que se hacía siempre, y una
  // cifra algo desviada sirve más que una tarjeta vacía
  const precios = [...lados.SELL, ...lados.BUY];

  if (precios.length < 6) return null;

  const ratio = promedioRecortado(precios);
  // Salvaguarda: fuera de esta horquilla algo se leyo mal
  if (!Number.isFinite(ratio) || ratio < 0.8 || ratio > 1.5) return null;

  return { ratio: Math.round(ratio * 10000) / 10000, ads: precios.length };
}

/* Los medios de pago en dólares que se venden en p2p, con su nombre en
   Binance. La clave es el id que usa la calculadora. */
const METODOS = { zelle: 'Zelle', facebank: 'Facebank', wally: 'WallyTech', zinli: 'Zinli' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Un minuto en el borde de Vercel: el p2p se mueve, pero no tanto como
  // para pedirle el libro a Binance en cada visita.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  // Los dolares de cada medio no dependen del libro, asi que se piden a la
  // vez que el y no despues, cada uno por su lado para que si uno falla no
  // se lleve a los demas.
  //
  // Pero de dos en dos, no los cuatro juntos. Con los cuatro eran doce
  // peticiones simultaneas contando las del libro, y Binance dejaba de
  // contestar a la mitad: medido, seis de ocho se quedaban sin respuesta. De
  // dos en dos son como mucho ocho a la vez, que es lo que ya aguantaba con
  // el Zelle y Facebank.
  const metodosEnVuelo = (async () => {
    const pares = Object.entries(METODOS);
    const leidos = [];
    for (let i = 0; i < pares.length; i += 2) {
      leidos.push(
        ...(await Promise.all(
          pares.slice(i, i + 2).map(async ([id, enBinance]) => [id, await leerDolaresPor(enBinance).catch(() => null)])
        ))
      );
    }
    return leidos;
  })();

  let lados = { SELL: [], BUY: [] };
  let fallos = [];

  for (const url of HOSTS) {
    const leido = await leerLibro(url);
    // Se acumula, no se reemplaza. Antes, si el primer host traía 9 anuncios
    // —justo por debajo del umbral— y el segundo estaba limitado, los 9 se
    // tiraban y el endpoint respondía 502 con la muestra en la mano.
    lados.SELL.push(...leido.lados.SELL);
    lados.BUY.push(...leido.lados.BUY);
    fallos.push(...leido.fallos);
    if (lados.SELL.length + lados.BUY.length >= 10) break;
  }

  const todos = [...lados.SELL, ...lados.BUY];

  if (todos.length < 10) {
    return res.status(502).json({
      error: 'Muestra insuficiente',
      anuncios: todos.length,
      fallos: [...new Set(fallos)].slice(0, 3),
    });
  }

  // tradeType=SELL son los anuncios de quien te compra: ahi vendes tu
  const venta = lados.SELL.length >= MINIMO_POR_LADO
    ? dosDecimales(promedioRecortado(lados.SELL))
    : null;
  const compra = lados.BUY.length >= MINIMO_POR_LADO
    ? dosDecimales(promedioRecortado(lados.BUY))
    : null;

  // La media de los dos lados, sin ponderar por cuantos anuncios trae cada
  // uno. Si falta un lado, se cae al recortado del conjunto, que es lo que
  // se hacia antes.
  const media = venta != null && compra != null
    ? dosDecimales((venta + compra) / 2)
    : dosDecimales(promedioRecortado(todos));

  const ordenados = [...todos].sort((a, b) => a - b);
  // Ya lanzado arriba, en paralelo con el libro: esperarlo en serie sumaba su
  // latencia entera a la de la lectura principal sin ninguna necesidad.
  const metodos = Object.fromEntries(await metodosEnVuelo);
  const zelle = metodos.zelle;
  const facebank = metodos.facebank;

  return res.status(200).json({
    // `rate` sigue siendo la media, que es lo que devolvia antes: hay clientes
    // desplegados leyendola y no se les cambia el numero bajo los pies.
    rate: media,
    ads: todos.length,
    min: ordenados[0],
    max: ordenados[ordenados.length - 1],

    // Los precios a los que se ejecuta de verdad
    venta,
    compra,
    media,
    ads_venta: lados.SELL.length,
    ads_compra: lados.BUY.length,
    spread: venta != null && compra != null ? dosDecimales(compra - venta) : null,

    // Cuantos dolares Zelle vale un USDT: sirve para sacar la tasa del Zelle
    zelle_por_usdt: zelle?.ratio ?? null,
    zelle_ads: zelle?.ads ?? 0,
    // Lo mismo para Facebank
    facebank_por_usdt: facebank?.ratio ?? null,
    facebank_ads: facebank?.ads ?? 0,
    // Todos los medios en dólares con la misma forma, Wally y Zinli
    // incluidos. Los dos de arriba se quedan por los clientes que ya los leen.
    metodos: Object.fromEntries(
      Object.entries(metodos).map(([id, m]) => [id, { por_usdt: m?.ratio ?? null, ads: m?.ads ?? 0 }])
    ),
    source: 'binance-p2p',
    updated_at: new Date().toISOString(),
  });
}

/**
 * Todas las fuentes de tasa, cada una con lo que da ahora mismo.
 *
 * Sirve para que en la calculadora se puedan comparar y elegir cuál usar, en
 * vez de tener que fiarse de la que alguien decidió por defecto. Las fuentes
 * se caen y se retrasan sin avisar —en este mismo sitio se murieron dos APIs
 * sin que nadie lo notara durante meses—, y verlas juntas es la manera de
 * enterarse el mismo día.
 */

import {
  hoyCaracas,
  guardarVigencia,
  vigenteEn,
  proximaTras,
  vigenteSegunFechaValor,
  proximaSegunFechaValor,
  snapshotEstatico,
} from './_vigencia.js';
import { tasasCotizave } from './_cotizave.js';

const PUENTE_P2P = 'https://tasa-p2p.vercel.app/api/p2p';
const PUENTE_BCV = 'https://bcv-puente.vercel.app/api/bcv';
const DOLARAPI_OFICIAL = 'https://ve.dolarapi.com/v1/dolares/oficial';
const DOLARAPI_PARALELO = 'https://ve.dolarapi.com/v1/dolares/paralelo';
const BCV_URL = 'https://www.bcv.org.ve/';

const CACHE = 120;

// Los dólares que se venden en p2p, cada uno con su ficha y su grupo
const METODOS = [
  ['zelle', 'Zelle'],
  ['facebank', 'Facebank'],
  ['wally', 'Wally'],
  ['zinli', 'Zinli'],
];

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
async function leerCotizave(clave, base) {
  // Con caché y con pausa ante un 429: el panel se pide cada minuto a quien
  // tiene una fuente propia elegida, y sin freno eso también gastaba cuota
  const datos = await tasasCotizave(clave, base, TIMEOUT);
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

  // Cotizave no va aquí: es respaldo y se pide más abajo, solo si hace falta
  const [bcvRes, puenteRes, puenteBcvRes, oficialRes, paraleloRes] = await Promise.allSettled([
    leerBCV(),
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
  const motivoOficial = motivo(oficialRes);
  const motivoParalelo = motivo(paraleloRes);
  const bcv = dato(bcvRes);
  const puente = dato(puenteRes);
  const puenteBcv = dato(puenteBcvRes);
  const oficial = dato(oficialRes);
  const paralelo = dato(paraleloRes);

  /* COTIZAVE, SOLO DE RESPALDO
     Se consultaba siempre, para enseñarla en el panel junto a las demás, y
     entre esto y /api/bcv se gastó el límite mensual del plan gratis. Ahora
     es lo que es: un respaldo. Se pregunta solo cuando lo nuestro falla —la
     página del BCV y su puente para la oficial, el puente de Binance para el
     USDT— y sus fichas salen solo entonces. Si lo nuestro va bien, ni se
     consulta ni aparece. */
  const fallaNuestroBcv = bcv?.usd == null && puenteBcv?.usd == null;
  const fallaNuestroP2p = (puente?.venta ?? puente?.rate) == null;

  const cotizaveRes = fallaNuestroBcv || fallaNuestroP2p
    ? await leerCotizave(clave, context.request.url).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      )
    : { status: 'fulfilled', value: null };
  const motivoCotizave = motivo(cotizaveRes);
  const cotizave = dato(cotizaveRes);

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

  // Lo mismo por fecha valor, para la ficha de Farmatodo
  const farmatodo = await vigenteSegunFechaValor(context.env?.MONTOS, hoy);
  const siguienteFarmatodo = await proximaSegunFechaValor(context.env?.MONTOS, hoy);

  // Si Farmatodo cobra hoy otra cifra que la nuestra: solo entonces tiene
  // ficha (ver abajo). Con las dos cifras delante; si falta una, no se sabe.
  const distinta = (a, b) => a != null && b != null && a !== b;
  const farmatodoDifiere =
    !!farmatodo && !!aplicando &&
    (distinta(farmatodo.usd, aplicando.usd) || distinta(farmatodo.eur, aplicando.eur));

  /**
   * Cambia la lectura por la que ya se aplica.
   *
   * Siempre, aunque la fila y la lectura sean la misma tasa: la ficha tiene
   * que enseñar la fecha DESDE la que se aplica, no la fecha valor. Un sábado
   * son distintas —12/09 y 14/09— y poner la del BCV ahí, junto a un número
   * que ya se está cobrando, decía que aún no había entrado.
   */
  const vigente = (lectura) => {
    if (!lectura || !aplicando) return lectura;

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
    /* La que el BCV ya publicó y todavía no entra.
       Va como una ficha más, elegible, y no como una nota al pie: si tienes
       que pagarle a alguien que ya cobra con ella, la quieres en la
       calculadora, no solo enterarte de que existe. La elección se guarda en
       el navegador de cada quien, como las demás.

       Cuando entra en vigor, esta ficha desaparece —ya no hay "siguiente"— y
       quien la tuviera elegida cae en la primera del grupo, que es la del
       BCV, y que para entonces ya trae ese mismo número. */
    siguiente && {
      id: 'bcv-proxima',
      grupo: 'bcv',
      nombre: 'BCV · la que viene',
      detalle: 'Publicada y todavía sin entrar. Elígela si tienes que pagar a quien ya cobra con ella.',
      rate: siguiente.usd ?? null,
      eur: siguiente.eur ?? null,
      date: siguiente.desde ?? siguiente.fecha,
      motivo: null,
    },
    /* La de Farmatodo: la que viene, pero al revés.
       Aquella se adelanta a lo que rige; esta se queda atrás, porque hay
       comercios que no cobran la tasa nueva hasta su día hábil. La regla está
       en _vigencia.js.

       Solo sale cuando cobra OTRA cifra que la nuestra: el fin de semana o
       el feriado en que nuestra tasa ya entró y la de ellos todavía no.
       Nosotros aplicamos la última publicada desde el día siguiente; ellos,
       desde su fecha valor. Entre semana es la misma, y una ficha que repite
       el número del BCV es ruido en el panel —así lo pidió el dueño—. Antes
       estaba siempre, con un "hoy coincide con la del BCV".

       Quien la tenga elegida no la pierde: la elección vive en su navegador.
       Entre semana cae en la primera del grupo, la del BCV, que es la misma
       cifra; y en cuanto la ficha vuelve, el sábado, vuelve a mandar ella sin
       tocar nada. Sin memoria de tasas no se puede saber si difiere, así que
       tampoco sale. */
    farmatodoDifiere && {
      id: 'bcv-farmatodo',
      grupo: 'bcv',
      nombre: 'BCV · Farmatodo',
      detalle: 'Como cobran Farmatodo y otros comercios: la tasa nueva no entra hasta su día hábil, aunque el BCV ya la haya movido.',
      rate: farmatodo.usd ?? null,
      eur: farmatodo.eur ?? null,
      date: farmatodo.fecha ?? null,
      proxima: siguienteFarmatodo
        ? { rate: siguienteFarmatodo.usd, eur: siguienteFarmatodo.eur, date: siguienteFarmatodo.fecha }
        : null,
      motivo: null,
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
    // Las tres de Cotizave salen solo cuando lo suyo falla: ver arriba
    fallaNuestroBcv && {
      id: 'cotizave-oficial',
      grupo: 'bcv',
      nombre: 'Cotizave',
      detalle: 'De respaldo: sale porque la página del BCV no respondió.',
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
    fallaNuestroP2p && {
      id: 'consenso',
      grupo: 'paralelo',
      nombre: 'Consenso p2p',
      detalle: cotizave?.mercados
        ? `De respaldo, porque Binance no respondió. Mediana de ${cotizave.mercados} casas de cambio.`
        : 'De respaldo, porque Binance no respondió. Mediana de varias casas p2p.',
      rate: cotizave?.consenso ?? null,
      date: null,
      motivo: motivoCotizave ?? sinEsaCifra(cotizave),
    },
    fallaNuestroP2p && {
      id: 'cotizave-binance',
      grupo: 'paralelo',
      nombre: 'Binance vía Cotizave',
      detalle: 'De respaldo: lo que Cotizave reporta del mercado de Binance.',
      rate: cotizave?.binance?.mid ?? null,
      date: soloFecha(cotizave?.binance?.updated_at),
      motivo: motivoCotizave ?? sinEsaCifra(cotizave),
    },
    /* Zelle, Facebank, Wally y Zinli: cada uno en su grupo y no entre las
       paralelas, porque son tasas distintas y no otras mediciones de la
       misma. Puesto el Zelle entre las paralelas, elegirlo reemplazaba la del
       USDT y la calculadora mostraba el mismo número dos veces. */
    ...METODOS.map(([id, nombre]) => {
      const porUsdt = puente?.metodos?.[id]?.por_usdt ?? puente?.[`${id}_por_usdt`] ?? null;
      const anuncios = puente?.metodos?.[id]?.ads ?? puente?.[`${id}_ads`] ?? 0;
      return {
        id,
        grupo: id,
        nombre,
        detalle: porUsdt
          ? `Un USDT cuesta ${porUsdt} en ${nombre}, de ${anuncios} anuncios.`
          : 'Calculado desde el libro de Binance.',
        // Del lado de venta, no de la media: es la misma razón que en el USDT
        // —lo que importa es a cuánto cobras, no el punto medio del spread.
        rate: (puente?.venta ?? puente?.rate) && porUsdt
          ? Math.round(((puente.venta ?? puente.rate) / porUsdt) * 100) / 100
          : null,
        date: soloFecha(puente?.updated_at),
        motivo: motivoPuente ?? sinEsaCifra(puente),
      };
    }),
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

  // El .filter quita la ficha de "la que viene" cuando no hay ninguna
  const salida = { fuentes: fuentes.filter(Boolean), eur: bcvHoy?.eur ?? null, eurFecha: bcvHoy?.fecha ?? null };

  return new Response(JSON.stringify(salida), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE}, s-maxage=${CACHE}`,
    },
  });
}

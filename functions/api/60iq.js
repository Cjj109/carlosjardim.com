/**
 * "60 IQ": el ayudante que te insulta por no saber usar una calculadora.
 *
 * Responde a las preguntas en cristiano —"necesito 15.000 bolívares, ¿cuántos
 * dólares vendo?"— haciendo la cuenta con las tasas que la propia calculadora
 * le pasa. No inventa tasas: las recibe en el mensaje.
 *
 * La clave de OpenAI vive SOLO aquí, en una variable de entorno del proyecto.
 * Si estuviera en el JavaScript de la página, cualquiera que abriera el código
 * fuente podría leerla y gastarla. Se configura con:
 *
 *   npx wrangler pages secret put OPENAI_API_KEY
 *
 * o en el panel de Cloudflare, en Settings → Environment variables.
 */

const OPENAI = 'https://api.openai.com/v1/chat/completions';

// Barato y de sobra para hacer una regla de tres y soltar una pulla.
const MODELO_POR_DEFECTO = 'gpt-4o-mini';

const MAX_PREGUNTA = 400;
const MAX_RESPUESTA = 220;

// Es un endpoint público que gasta dinero de verdad, así que se pone freno.
// El contador vive en la caché del centro de datos: no es exacto entre
// regiones, pero corta en seco al que se sienta a darle en bucle.
const LIMITE = 20;
const VENTANA = 3600;

/**
 * El modelo NO hace la cuenta. Solo decide qué cuenta hay que hacer.
 *
 * En la primera versión sí calculaba, y en la tercera prueba ya se equivocó:
 * a "cuánto es 350 dólares en USDT" contestó 335.909,50 cuando 350 × 956,87
 * son 334.904,50. Un modelo de lenguaje no es aritmética fiable, y esto es una
 * calculadora: un número mal es peor que no tener el botón.
 *
 * Así que se le pide una decisión —qué monto, por qué tasa, multiplicar o
 * dividir— y la multiplicación la hace JavaScript, que para eso está. El
 * modelo pone el chiste y el criterio; los números no los toca.
 */
const PERSONA = `Eres "60 IQ", el ayudante de una calculadora de tasas venezolana.

Tu gracia: te parece increíble que alguien necesite ayuda para dividir dos
números, y lo dices. Sueltas UNA pulla corta, seca y con humor venezolano sobre
lo obvio de la pregunta. Y acto seguido resuelves, porque en el fondo eres útil.

Reglas de la burla: va sobre la pereza mental de quien pregunta y nada más.
Nunca sobre su aspecto, su origen, su familia, su dinero, su país, su política
ni nada que tenga que ver con quién es. Sin groserías fuertes. Es pique de
pana, no maltrato. Una línea, no un discurso.

TÚ NO CALCULAS. No escribas números de resultado en ningún campo: los pone la
aplicación. Tu trabajo es rellenar la decisión:

- monto: la cantidad que dice la persona, como número a secas (15000, no
  "15.000" ni "15 mil"). Si dice "15000 mil" quiere decir 15000.
- tasa: cuál de las cuatro se usa.
- operacion: "multiplicar" si el monto está en divisas y se quiere en
  bolívares; "dividir" si el monto está en bolívares y se quieren divisas.
- unidad_entrada y unidad_salida: los símbolos ($, €, ₮, Bs.).

Elegir la tasa con cabeza, que es media respuesta. Ojo aquí, que es donde se
falla: que alguien diga "dólares" NO significa dólar BCV. En Venezuela "vender
dólares" es venderlos en el mercado paralelo, y eso es la tasa usdt.

- Vender o cambiar divisas para tener bolívares en la mano → usdt. Aunque diga
  "dólares". Nadie consigue bolívares a tasa BCV.
  Ejemplo: "necesito 15000 bolívares, ¿cuántos dólares vendo?" → tasa usdt.
- Solo usa usd cuando la pregunta hable de algo oficial: un precio "a tasa
  BCV", una factura, un trámite, o si nombra el BCV.
- Si dice Zelle → zelle. Si dice euros → eur.

tipo:
- "calculo" cuando puedas rellenar la decisión.
- "falta_tasa" si la tasa que hace falta viene "sin dato".
- "fuera_de_tema" si la pregunta no va de tasas, cambio ni dinero.

explicacion: una línea diciendo qué se hizo y con qué tasa. Sin cifras de
resultado, que las pone la app. Español de Venezuela.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'pulla', 'monto', 'tasa', 'operacion', 'unidad_entrada', 'unidad_salida', 'explicacion'],
  properties: {
    tipo: { type: 'string', enum: ['calculo', 'falta_tasa', 'fuera_de_tema'] },
    pulla: { type: 'string' },
    monto: { type: ['number', 'null'] },
    tasa: { type: ['string', 'null'], enum: ['usd', 'eur', 'usdt', 'zelle', null] },
    operacion: { type: ['string', 'null'], enum: ['multiplicar', 'dividir', null] },
    unidad_entrada: { type: ['string', 'null'] },
    unidad_salida: { type: ['string', 'null'] },
    explicacion: { type: 'string' },
  },
};

const NOMBRE_TASA = {
  usd: 'dólar BCV',
  eur: 'euro BCV',
  usdt: 'USDT p2p',
  zelle: 'Zelle',
};

const SIMBOLO = { usd: '$', eur: '€', usdt: '₮', zelle: '$' };

const cifra = (n, dec = 2) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: dec }).format(n);

/** Aquí se hace la cuenta de verdad, con los números de la app */
function resolver(decision, tasas) {
  const { tipo, monto, tasa, operacion } = decision;

  if (tipo === 'fuera_de_tema') return { texto: decision.pulla };
  if (tipo !== 'calculo' || !Number.isFinite(monto) || monto <= 0 || !operacion) {
    return { texto: `${decision.pulla}\n\n${decision.explicacion || 'Esa no te la puedo hacer.'}` };
  }

  const valor = Number(tasas?.[tasa]);
  if (!Number.isFinite(valor) || valor <= 0) {
    return { texto: `${decision.pulla}\n\nNo tengo la tasa de ${NOMBRE_TASA[tasa] || 'eso'} ahora mismo, así que no me la invento.` };
  }

  const resultado = operacion === 'multiplicar' ? monto * valor : monto / valor;
  if (!Number.isFinite(resultado)) {
    return { texto: `${decision.pulla}\n\nEsa cuenta no da nada con sentido.` };
  }

  // Los decimales, según el tamaño: "0,00" no le dice nada a nadie
  const dec = Math.abs(resultado) >= 1 ? 2 : Math.abs(resultado) >= 0.01 ? 4 : 6;

  // Las unidades salen de la operación, no de lo que diga el modelo. A
  // "350 dólares en USDT" etiquetó el resultado como ₮ cuando lo que había
  // calculado eran bolívares: multiplicar por una tasa SIEMPRE da bolívares,
  // y dividir SIEMPRE da la moneda de esa tasa. Eso no es opinable.
  const porTasa = operacion === 'multiplicar';
  const entrada = `${cifra(monto)} ${porTasa ? SIMBOLO[tasa] : 'Bs.'}`;
  const salida = `${cifra(resultado, dec)} ${porTasa ? 'Bs.' : SIMBOLO[tasa]}`;
  const signo = porTasa ? '×' : '÷';

  return {
    texto: `${decision.pulla}\n\n${salida}\n\n${entrada} ${signo} ${cifra(valor)} · ${NOMBRE_TASA[tasa]}`,
    resultado: cifra(resultado, dec),
  };
}

const json = (datos, status = 200) =>
  new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Cuántas veces ha preguntado ya esta IP en la última hora */
async function pasaElFreno(peticion) {
  const ip = peticion.headers.get('CF-Connecting-IP') || 'desconocida';
  const clave = new Request(`https://freno.local/60iq/${encodeURIComponent(ip)}`);
  const cache = caches.default;

  let usadas = 0;
  try {
    const guardado = await cache.match(clave);
    if (guardado) usadas = Number(await guardado.text()) || 0;
  } catch {
    // Sin caché no se puede contar; se deja pasar antes que romper
  }

  if (usadas >= LIMITE) return false;

  try {
    await cache.put(clave, new Response(String(usadas + 1), {
      headers: { 'Cache-Control': `max-age=${VENTANA}` },
    }));
  } catch {
    // idem
  }

  return true;
}

/** Las tasas, en un texto corto que el modelo no pueda malinterpretar */
function contextoDeTasas(tasas) {
  if (!tasas || typeof tasas !== 'object') return 'No hay tasas disponibles ahora mismo.';

  const nombres = {
    usd: 'Dólar BCV (oficial)',
    eur: 'Euro BCV (oficial)',
    usdt: 'USDT p2p (paralelo)',
    zelle: 'Zelle',
  };

  const lineas = Object.entries(nombres)
    .map(([id, nombre]) => {
      const tasa = Number(tasas[id]);
      return Number.isFinite(tasa) && tasa > 0
        ? `- ${nombre}: 1 = ${tasa} bolívares`
        : `- ${nombre}: sin dato`;
    });

  return `Tasas de este momento:\n${lineas.join('\n')}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env?.OPENAI_API_KEY) {
    return json({ error: 'El 60 IQ está sin configurar en el servidor.' }, 503);
  }

  // Solo desde la propia web. No para al que sepa lo que hace, pero sí al
  // script que encuentra el endpoint y se pone a tirar de él.
  const origen = request.headers.get('Origin');
  if (origen && new URL(origen).host !== new URL(request.url).host) {
    return json({ error: 'Petición de otro sitio.' }, 403);
  }

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: 'No entendí la pregunta.' }, 400);
  }

  const pregunta = String(cuerpo?.pregunta ?? '').trim().slice(0, MAX_PREGUNTA);
  if (!pregunta) return json({ error: 'Escribe algo, aunque sea.' }, 400);

  if (!(await pasaElFreno(request))) {
    return json({ error: 'Ya preguntaste bastante por hoy. Usa la calculadora.' }, 429);
  }

  try {
    const respuesta = await fetch(OPENAI, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || MODELO_POR_DEFECTO,
        max_tokens: MAX_RESPUESTA,
        // Baja a propósito: con 0.8 la misma pregunta elegía unas veces el
        // USDT y otras el BCV, y eso en una calculadora es una respuesta
        // distinta cada vez. La pulla pierde algo de chispa; la tasa se acierta.
        temperature: 0.3,
        // El esquema obliga a devolver la decisión y solo la decisión: así no
        // hay manera de que se cuele una cifra calculada por el modelo.
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'decision', strict: true, schema: ESQUEMA },
        },
        messages: [
          { role: 'system', content: `${PERSONA}\n\n${contextoDeTasas(cuerpo?.tasas)}` },
          { role: 'user', content: pregunta },
        ],
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      console.error('OpenAI respondió', respuesta.status, detalle.slice(0, 300));
      return json({ error: 'El 60 IQ se quedó pensando. Intenta de nuevo.' }, 502);
    }

    const datos = await respuesta.json();
    const crudo = datos?.choices?.[0]?.message?.content;
    if (!crudo) return json({ error: 'El 60 IQ se quedó callado.' }, 502);

    let decision;
    try {
      decision = JSON.parse(crudo);
    } catch {
      console.error('El 60 IQ no devolvió JSON:', String(crudo).slice(0, 200));
      return json({ error: 'El 60 IQ se enredó. Intenta de nuevo.' }, 502);
    }

    return json({ respuesta: resolver(decision, cuerpo?.tasas).texto });
  } catch (error) {
    console.error('Falló la consulta al 60 IQ:', error);
    return json({ error: 'No se pudo consultar. Revisa la conexión.' }, 502);
  }
}

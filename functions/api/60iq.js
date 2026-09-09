/**
 * "60 IQ": el ayudante que te insulta por no saber usar una calculadora.
 *
 * Responde a las preguntas en cristiano —"necesito 15.000 bolívares, ¿cuántos
 * dólares vendo?"— haciendo la cuenta con las tasas que la propia calculadora
 * le pasa. No inventa tasas: las recibe en el mensaje.
 *
 * POR QUÉ OPENROUTER Y NO OPENAI DIRECTAMENTE
 *
 * Esto corre en el borde de Cloudflare, y el borde corre en el centro de datos
 * más cercano a quien usa la app. Para alguien en Venezuela, eso es un PoP
 * venezolano — y la petición a OpenAI sale desde ahí, desde donde OpenAI
 * bloquea. Se veía como un fallo intermitente y difícil de explicar: funciona
 * probándolo desde fuera y no funciona para quien vive allí.
 *
 * OpenRouter no tiene ese bloqueo, y de paso deja cambiar de modelo sin tocar
 * código. Se mantiene la salida estructurada, que es de lo que depende todo el
 * diseño: el modelo no calcula, solo decide qué cuenta hacer.
 *
 * La clave vive SOLO aquí, en una variable de entorno del proyecto. Si
 * estuviera en el JavaScript de la página, cualquiera que abriera el código
 * fuente podría leerla y gastarla.
 *
 *   npx wrangler pages secret put OPENROUTER_API_KEY
 */

const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

// Gemini 3.5 Flash Lite: barato de sobra para una regla de tres y una pulla,
// y admite structured_outputs, que aquí no es opcional.
const MODELO_POR_DEFECTO = 'google/gemini-3.5-flash-lite';

const MAX_PREGUNTA = 400;

// Cuantos turnos anteriores se le pasan. Sin esto cada pregunta iba suelta y
// un "a todas las tasas" no tenia a que referirse: contestaba con una broma
// porque literalmente no sabia de que se le hablaba.
const MAX_TURNOS = 6;
// 220 se quedaba corto desde que el esquema admite comparaciones: la decisión
// con dos opciones no cabía y el JSON llegaba cortado a la mitad, con un
// "El 60 IQ se enredó" como toda respuesta. El modelo es barato; el tope
// existe para acotar un disparate, no para apretar.
const MAX_RESPUESTA = 700;

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
dólares" es venderlos en el mercado p2p, y eso es la tasa usdt.

- Vender o cambiar divisas para tener bolívares en la mano → usdt. Aunque diga
  "dólares". Nadie consigue bolívares a tasa BCV.
  Ejemplo: "necesito 15000 bolívares, ¿cuántos dólares vendo?" → tasa usdt.
- Solo usa usd cuando la pregunta hable de algo oficial: un precio "a tasa
  BCV", una factura, un trámite, o si nombra el BCV.
- Si dice Zelle → zelle. Si dice euros → eur.

- Si pide "a todas", "en todas las tasas", "comparar" o algo así → tasa
  "todas". La app las calcula todas y las pone en lista.

POR DEFECTO, "todas". Y esta manda sobre las reglas de arriba: si la persona
NO nombra una tasa ni una moneda de destino, das "todas". Ejemplos:

  "cuánto son 15 mil bolívares"        → todas. No dijo en qué quiere verlo.
  "cuánto son 15 mil bolívares en USDT" → usdt. Ahí sí lo dijo.
  "tengo 350"                           → todas.
  "y a bcv"                             → usd. Lo nombró.
  "necesito 15000 Bs, cuánto vendo"     → usdt. "Vender" ya dice cuál es.

La razón: cuando alguien pregunta a secas, lo que quiere es comparar. Darle
una sola tasa elegida por ti le obliga a preguntar otra vez, y encima parece
que le escondes el resto.

PREGUNTAS DE DOS PASOS, que son las más comunes y las que más se fallan.

"130 dólares a BCV, ¿cuántos USDT debo vender?" no es una cuenta, son dos:
primero los 130 $ a bolívares por la tasa BCV, y después esos bolívares entre
la tasa del USDT. Contestar solo los bolívares es dejar sin responder justo lo
que se preguntó.

Para eso está tasa_destino:
  tasa         = la tasa a la que está FIJADO el precio (aquí, usd)
  tasa_destino = lo que la persona va a vender o pagar (aquí, usdt)

  "130 dólares a BCV, cuántos USDT vendo"   → tasa usd, tasa_destino usdt
  "me cobran 500 $ a tasa BCV, qué pago"    → tasa usd, tasa_destino todas
  "un precio de 80 € del BCV en Zelle"      → tasa eur, tasa_destino zelle

Si la pregunta es una sola conversión, deja tasa_destino en null.

COMPARAR DOS PRECIOS DE LO MISMO. Esta es la pregunta que más se falla.

"Un mismo control vale 65 $ a BCV o 60 USDT, ¿cómo conviene pagarlo?"

Convertir uno de los dos y parar ahí NO es la respuesta. Es el paso correcto
a medias: quien pregunta quiere saber CUÁL sale mejor, y decirle "65 $ a BCV
son 55,23 USDT" le deja el trabajo de compararlo con los 60 él mismo.

Para eso está tipo "comparar" con el campo opciones, una entrada por precio:

  tipo: "comparar"
  opciones: [
    { monto: 65, tasa: "usd",  moneda: "divisa", etiqueta: "a BCV" },
    { monto: 60, tasa: "usdt", moneda: "divisa", etiqueta: "en USDT" }
  ]

MONEDA es en qué está escrito ESE precio, y hay que acertarla:

  "divisa"  el precio va en la moneda de su tasa: 65 dólares, 60 USDT, 40 €
  "bs"      el precio ya viene en bolívares: "15000 bs", "quince mil a BCV"

"Me cobran 15 USDT o 15000 bs a BCV" son { 15, usdt, divisa } y
{ 15000, usd, bs }: lo segundo son quince mil BOLÍVARES, no quince mil
dólares. Poner "divisa" ahí convierte quince mil bolívares en doce millones y
la respuesta queda ridícula. La tasa sigue haciendo falta aunque el precio ya
esté en bolívares, porque es la que dice de qué mercado se habla.

La app las lleva a bolívares, las compara y dice cuál gana y por cuánto. Tú
solo pones los dos precios, su tasa y una etiqueta corta que ayude a
reconocer cada uno ("en la tienda A", "a BCV", "por Zelle").

Sirve para cualquier "¿qué me conviene?", "¿cuál es más barato?", "¿pago con
esto o con lo otro?", y admite más de dos opciones si las da.

LA CONVERSACIÓN SIGUE. Lo que se dijo antes cuenta: si preguntó por un monto
y ahora dice "y a todas las tasas" o "¿y en euros?", se refiere a ESE monto.
No lo vuelvas a pedir, que ya te lo dio.

USA LO QUE TIENE EN PANTALLA. Más abajo va el modo que tiene abierto. Si suelta
un número sin decir la moneda, es la de ese modo: en Bolívares, "15000" son
quince mil bolívares. Preguntar "¿y de qué moneda?" cuando está escrito en su
pantalla te deja a ti de tonto, no a él.

tipo:
- "calculo" cuando puedas rellenar la decisión. Es lo normal; agota esta vía
  antes que ninguna otra.
- "falta_tasa" SOLO si la tasa que hace falta aparece arriba como "sin dato".
  Ponla en tasa_que_falta. Si están las cuatro, esto no es una salida: no
  digas que falta una tasa cuando las tienes delante, porque es mentira y se
  nota. Si dudas de cuál usar, elige con las reglas de arriba.
- "fuera_de_tema" si la pregunta no va de tasas, cambio ni dinero.

No uses la palabra "paralelo" ni "paralela" en ningún texto que escribas.
Esa tasa se llama "USDT p2p" o simplemente "USDT".

explicacion: una línea diciendo qué se hizo y con qué tasa. Sin cifras de
resultado, que las pone la app. Español de Venezuela.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'pulla', 'monto', 'tasa', 'tasa_destino', 'tasa_que_falta', 'opciones', 'operacion', 'unidad_entrada', 'unidad_salida', 'explicacion'],
  properties: {
    tipo: { type: 'string', enum: ['calculo', 'comparar', 'falta_tasa', 'fuera_de_tema'] },
    // Comparar dos precios de lo mismo en monedas distintas: "vale 65 $ a BCV
    // o 60 USDT, ¿cuál me conviene?". Antes esto no se podía expresar, así
    // que convertía uno de los dos y ahí se quedaba, sin contestar cuál sale
    // mejor, que era toda la pregunta.
    opciones: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['monto', 'tasa', 'etiqueta', 'moneda'],
        properties: {
          monto: { type: 'number' },
          /* En qué está escrito ese precio.
             Faltaba, y la app daba por hecho que todo venía en divisa: a
             "15 USDT o 15000 bs" convertía los bolívares como si fueran
             quince mil dólares y salían doce millones. El veredicto acertaba
             de casualidad y las cifras eran un disparate. */
          moneda: { type: 'string', enum: ['divisa', 'bs'] },
          tasa: { type: 'string', enum: ['usd', 'eur', 'usdt', 'zelle'] },
          etiqueta: { type: 'string' },
        },
      },
    },
    // Cual falta, en vez de un "falta la tasa" a secas. Si resulta que esa si
    // esta, el servidor lo detecta y no deja pasar la excusa.
    tasa_que_falta: { type: ['string', 'null'], enum: ['usd', 'eur', 'usdt', 'zelle', null] },
    pulla: { type: 'string' },
    monto: { type: ['number', 'null'] },
    // "todas" es una respuesta legitima y antes no habia forma de decirla:
    // preguntar "¿a cuanto sale a todas las tasas?" es de lo mas normal.
    tasa: { type: ['string', 'null'], enum: ['usd', 'eur', 'usdt', 'zelle', 'todas', null] },
    // El segundo paso. "130 dolares a BCV, cuantos USDT vendo" son DOS
    // cuentas encadenadas y el esquema solo sabia expresar una: contestaba el
    // primer paso —los bolivares— y se quedaba ahi, dejando sin responder
    // justo lo que se preguntaba.
    tasa_destino: { type: ['string', 'null'], enum: ['usd', 'eur', 'usdt', 'zelle', 'todas', null] },
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

// "USDT" y no "₮": el símbolo de Tether no lo reconoce nadie de un vistazo,
// y encima es el glifo que obliga a bajar el subconjunto latin-ext de la
// fuente. Escrito se lee solo.
//
// El Zelle igual, y aquí importa más: son dólares, así que llevaba "$" y no
// se distinguía del dólar BCV. En la lista comparada el nombre está al lado,
// pero cuando la respuesta es una sola cifra grande no hay etiqueta ninguna
// —"441,86 $" a secas— y son dos tasas con casi cuarenta bolívares de
// diferencia entre ellas.
const SIMBOLO = { usd: '$', eur: '€', usdt: 'USDT', zelle: 'Zelle' };

const cifra = (n, dec = 2) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: dec }).format(n);

const hay = (tasas, id) => {
  const v = Number(tasas?.[id]);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** Una línea de resultado: "334.904,50 Bs. — 350,00 ₮ × 956,87 · USDT p2p" */
function lineaResultado(monto, tasa, valor, operacion) {
  const resultado = operacion === 'multiplicar' ? monto * valor : monto / valor;
  if (!Number.isFinite(resultado)) return null;

  const dec = Math.abs(resultado) >= 1 ? 2 : Math.abs(resultado) >= 0.01 ? 4 : 6;
  const porTasa = operacion === 'multiplicar';

  return {
    resultado,
    // Las unidades salen de la operación, no de lo que diga el modelo:
    // multiplicar por una tasa SIEMPRE da bolívares, dividir SIEMPRE da la
    // moneda de esa tasa. Eso no es opinable.
    entrada: `${cifra(monto)} ${porTasa ? SIMBOLO[tasa] : 'Bs.'}`,
    salida: `${cifra(resultado, dec)} ${porTasa ? 'Bs.' : SIMBOLO[tasa]}`,
    signo: porTasa ? '×' : '÷',
    valor,
  };
}

/**
 * Aquí se hace la cuenta de verdad, con los números de la app.
 *
 * Exportada para poder probarla sin gastar una llamada al modelo: lo que
 * decide el modelo es QUÉ cuenta hacer, y la cuenta la hace esto. Poder
 * comprobarla a solas es lo que permitió cazar que una comparación con un
 * precio en bolívares salía por doce millones.
 */
export function resolver(decision, tasas) {
  const { tipo, monto, tasa, operacion } = decision;

  if (tipo === 'fuera_de_tema') return { texto: decision.pulla };

  /* COMPARAR DOS PRECIOS DE LO MISMO.
     "Un control vale 65 $ a BCV o 60 USDT, ¿cómo conviene pagarlo?"

     Antes esto se resolvía a medias: convertía los 65 $ a 55,23 USDT y ahí se
     paraba. Es el paso correcto pero no la respuesta: quien pregunta quiere
     saber CUÁL sale mejor, y ese "55,23 contra 60" hay que rematarlo.

     Se llevan las dos a bolívares, que es el único terreno donde se pueden
     comparar, y gana la más barata. La diferencia se da en bolívares y en la
     moneda del que pierde, que es como se piensa: "me ahorro cinco dólares". */
  if (tipo === 'comparar') {
    const ops = (decision.opciones || [])
      .map((o) => ({ ...o, valor: hay(tasas, o.tasa), monto: Number(o.monto) }))
      .filter((o) => o.valor && Number.isFinite(o.monto) && o.monto > 0)
      /* A bolívares, que es el único terreno donde se comparan. Lo que ya
         está en bolívares se queda como está; lo que está en divisa se
         multiplica por su tasa. Antes se multiplicaba siempre. */
      .map((o) => ({ ...o, enBs: o.moneda === 'bs' ? o.monto : o.monto * o.valor }));

    if (ops.length < 2) {
      return { texto: `${decision.pulla}\n\n${decision.explicacion || 'Dime los dos precios y con qué tasa va cada uno.'}` };
    }

    const ordenadas = [...ops].sort((a, b) => a.enBs - b.enBs);
    const gana = ordenadas[0];
    const pierde = ordenadas[ordenadas.length - 1];
    const ahorroBs = pierde.enBs - gana.enBs;

    const lineas = ops.map((o) => ({
      // Un precio en bolívares se enseña en bolívares, no con el símbolo de
      // su tasa: poner "15.000,00 $" a quince mil bolívares es mentir.
      salida: o.moneda === 'bs' ? `${cifra(o.monto)} Bs.` : `${cifra(o.monto)} ${SIMBOLO[o.tasa]}`,
      detalle:
        o.moneda === 'bs'
          ? `en bolívares, tal cual`
          : `${cifra(o.enBs)} Bs. · ${NOMBRE_TASA[o.tasa]}`,
      gana: o === gana,
    }));

    // Empate real, que con dos tasas parecidas pasa
    if (ahorroBs < 0.01) {
      return {
        texto: `${decision.pulla}\n\nDa igual: las dos salen por lo mismo.\n${lineas.map((l) => `${l.salida} = ${l.detalle}`).join('\n')}`,
        partes: { pulla: decision.pulla, veredicto: 'Da igual: las dos salen por lo mismo', lineas },
      };
    }

    /* El ahorro también en la moneda del que pierde, que es como se piensa:
       "me ahorro cinco dólares". Salvo que el que pierde ya esté en bolívares:
       ahí decirlo dos veces no aclara nada. */
    const ahorro =
      pierde.moneda === 'bs'
        ? `Te ahorras ${cifra(ahorroBs)} Bs.`
        : `Te ahorras ${cifra(ahorroBs)} Bs. · unos ${cifra(ahorroBs / pierde.valor)} ${SIMBOLO[pierde.tasa]}`;
    const veredicto = `Conviene pagar ${cifra(gana.monto)} ${SIMBOLO[gana.tasa]}${gana.etiqueta ? ` (${gana.etiqueta})` : ''}`;

    return {
      texto: `${decision.pulla}\n\n${veredicto}\n${lineas.map((l) => `${l.gana ? '→ ' : '  '}${l.salida} = ${l.detalle}`).join('\n')}\n\n${ahorro}`,
      partes: { pulla: decision.pulla, veredicto, lineas, operacion: ahorro },
    };
  }

  // "Falta la tasa" solo cuela si de verdad falta. Dijo eso teniendo las
  // cuatro, y era la escapatoria fácil cuando dudaba de cuál usar; ahora
  // tiene que decir CUÁL falta, y si esa está, no se le acepta la excusa.
  if (tipo === 'falta_tasa') {
    const cual = decision.tasa_que_falta;
    if (cual && !hay(tasas, cual)) {
      return { texto: `${decision.pulla}\n\nNo tengo la tasa de ${NOMBRE_TASA[cual]} ahora mismo, así que no me la invento.` };
    }
    return { texto: `${decision.pulla}\n\n${decision.explicacion || 'Dime en qué moneda y te la hago.'}` };
  }

  if (tipo !== 'calculo' || !Number.isFinite(monto) || monto <= 0 || !operacion) {
    return { texto: `${decision.pulla}\n\n${decision.explicacion || 'Esa no te la puedo hacer.'}` };
  }

  // DOS PASOS: un precio fijado a una tasa, y cuánto hay que vender de otra
  // cosa para pagarlo. "130 dólares a BCV, ¿cuántos USDT vendo?" es eso, y
  // antes se contestaba solo el primer paso —los bolívares— dejando sin
  // responder justo lo que se preguntaba. Es el modo "Precio BCV" de la
  // calculadora, que existe porque es la pregunta más común de todas.
  if (decision.tasa_destino) {
    const origen = hay(tasas, tasa);
    if (!origen) {
      return { texto: `${decision.pulla}\n\nNo tengo la tasa de ${NOMBRE_TASA[tasa] || 'eso'} ahora mismo, así que no me la invento.` };
    }

    // Respetando la operación, que aquí se daba por hecho que era multiplicar.
    // Con "tengo 15.000 Bs, ¿cuánto me dan en cada tasa?" el modelo manda
    // dividir, y multiplicar convertía quince mil bolívares en catorce
    // millones antes de repartirlos: un error del tamaño de una tasa al
    // cuadrado. Es el único sitio del archivo que no la miraba.
    const enBs = operacion === 'dividir' ? monto : monto * origen;
    const destinos = decision.tasa_destino === 'todas'
      ? ['usdt', 'zelle', 'usd', 'eur'].filter((id) => id !== tasa && hay(tasas, id))
      : [decision.tasa_destino].filter((id) => hay(tasas, id));

    if (!destinos.length) {
      return { texto: `${decision.pulla}\n\nNo tengo la tasa de ${NOMBRE_TASA[decision.tasa_destino] || 'eso'} ahora mismo, así que no me la invento.` };
    }

    const lineas = destinos.map((id) => {
      const v = hay(tasas, id);
      const cuanto = enBs / v;
      const dec = Math.abs(cuanto) >= 1 ? 2 : 4;
      return { salida: `${cifra(cuanto, dec)} ${SIMBOLO[id]}`, detalle: `${NOMBRE_TASA[id]} a ${cifra(v)}` };
    });

    const enBsTexto = `${cifra(enBs)} Bs.`;
    const paso = operacion === 'dividir'
      ? `${enBsTexto} de partida`
      : `${cifra(monto)} ${SIMBOLO[tasa]} × ${cifra(origen)} = ${enBsTexto} · ${NOMBRE_TASA[tasa]}`;

    return {
      texto: `${decision.pulla}\n\n${lineas.map((l) => `${l.salida}  ·  ${l.detalle}`).join('\n')}\n\n${paso}`,
      partes: {
        pulla: decision.pulla,
        // Un solo destino: el número grande. Varios: la lista comparable.
        ...(lineas.length === 1
          ? { resultado: lineas[0].salida }
          : { encabezado: `${enBsTexto} son:`, lineas }),
        operacion: lineas.length === 1
          ? `${paso}\n${enBsTexto} ÷ ${cifra(hay(tasas, destinos[0]))} · ${NOMBRE_TASA[destinos[0]]}`
          : paso,
      },
    };
  }

  // Todas las tasas a la vez, que es una pregunta de lo más normal
  if (tasa === 'todas') {
    const lineas = ['usd', 'usdt', 'zelle', 'eur']
      .map((id) => [id, hay(tasas, id)])
      .filter(([, v]) => v)
      .map(([id, v]) => {
        const l = lineaResultado(monto, id, v, operacion);
        return l && { salida: l.salida, detalle: `${NOMBRE_TASA[id]} a ${cifra(v)}` };
      })
      .filter(Boolean);

    if (!lineas.length) return { texto: `${decision.pulla}\n\nNo tengo ninguna tasa ahora mismo.` };

    /* La etiqueta del monto de partida.
       Salía de la primera tasa con dato —o sea, de 'usd' casi siempre— así
       que "350 USDT en todas las tasas" encabezaba con "350,00 $". Un número
       con la moneda equivocada al lado, en el mismo archivo que insiste en
       que las unidades no se adivinan.
       Dividiendo, la entrada son bolívares y no hay duda. Multiplicando no
       hay UNA moneda de partida —esa es la gracia de "todas"—, así que se usa
       la que dijo la persona, y si no dijo ninguna, ninguna. */
    const entrada = operacion === 'dividir'
      ? `${cifra(monto)} Bs.`
      : `${cifra(monto)}${decision.unidad_entrada ? ` ${decision.unidad_entrada}` : ''}`;

    return {
      texto: `${decision.pulla}\n\n${entrada} es:\n${lineas.map((l) => `${l.salida}  ·  ${l.detalle}`).join('\n')}`,
      partes: {
        pulla: decision.pulla,
        encabezado: `${entrada} es:`,
        lineas,
      },
    };
  }

  const valor = hay(tasas, tasa);
  if (!valor) {
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

  const operacionTexto = `${entrada} ${signo} ${cifra(valor)} · ${NOMBRE_TASA[tasa]}`;

  return {
    texto: `${decision.pulla}\n\n${salida}\n\n${operacionTexto}`,
    // En partes para que el cliente le dé a cada una su tamaño: la pulla se
    // lee, el resultado se mira y la operación solo se comprueba.
    partes: {
      pulla: decision.pulla,
      resultado: salida,
      operacion: operacionTexto,
    },
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

const NOMBRE_MODO = {
  divisa: 'Divisas — el campo son divisas y se quiere saber cuantos bolivares son',
  bs: 'Bolivares — el campo son BOLIVARES y se quiere saber cuantas divisas salen',
  bcv: 'Precio BCV — un precio fijado a tasa BCV y se quiere saber que hay que pagar',
  usdt: 'USDT — el campo son USDT y se quiere saber cuanto es y a cuanto equivale',
};

/**
 * Lo que la persona tiene delante mientras pregunta.
 *
 * Sin esto, "cuanto son 15000" no tenia respuesta posible: 15000 de que. Y la
 * respuesta estaba en la pantalla, en el modo que tiene abierto. Si esta en
 * Bolivares, son bolivares.
 */
function contextoDeLaApp(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';

  const partes = [];
  if (NOMBRE_MODO[ctx.modo]) {
    partes.push(`Tiene abierto el modo: ${NOMBRE_MODO[ctx.modo]}.`);
    partes.push('Si dice un numero sin decir la moneda, es la de ese modo. No preguntes lo que ya esta en la pantalla.');
  }
  const monto = Number(ctx.monto);
  if (Number.isFinite(monto) && monto > 0) {
    partes.push(`En la caja tiene escrito: ${monto}.`);
  }

  return partes.length ? `\n\nLo que tiene delante ahora mismo:\n${partes.join('\n')}` : '';
}

/** Las tasas, en un texto corto que el modelo no pueda malinterpretar */
function contextoDeTasas(tasas) {
  if (!tasas || typeof tasas !== 'object') return 'No hay tasas disponibles ahora mismo.';

  const nombres = {
    usd: 'Dólar BCV (oficial)',
    eur: 'Euro BCV (oficial)',
    usdt: 'USDT p2p',
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

/**
 * ¿La petición viene de la propia web?
 *
 * `new URL(origen)` reventaba con Origin: null —un iframe en zona de
 * pruebas, una cadena de redirecciones, algunos navegadores dentro de apps— y
 * como la llamada estaba fuera del try, el endpoint devolvía un 500 en vez
 * del 403 que se pretendía. Comprobado en producción: HTTP 500, error 1101.
 */
function mismoSitio(peticion) {
  const origen = peticion.headers.get('Origin');
  if (!origen) return true;
  try {
    return new URL(origen).host === new URL(peticion.url).host;
  } catch {
    // Un Origin opaco no es la propia web
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const clave = env?.OPENROUTER_API_KEY;
  if (!clave) {
    return json({ error: 'El 60 IQ está sin configurar en el servidor.' }, 503);
  }

  // Solo desde la propia web. No para al que sepa lo que hace, pero sí al
  // script que encuentra el endpoint y se pone a tirar de él.
  if (!mismoSitio(request)) {
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

  // Los turnos anteriores, recortados y saneados. Vienen del cliente, así que
  // no se confía en su forma: solo se aceptan los dos roles válidos y se
  // limita el largo, para que nadie use este campo como cuña.
  const turnos = Array.isArray(cuerpo?.historial)
    ? cuerpo.historial
        .slice(-MAX_TURNOS)
        .filter((m) => m && (m.rol === 'user' || m.rol === 'assistant') && typeof m.texto === 'string')
        .map((m) => ({ role: m.rol, content: m.texto.slice(0, MAX_PREGUNTA) }))
    : [];

  if (!(await pasaElFreno(request))) {
    return json({ error: 'Ya preguntaste bastante por hoy. Usa la calculadora.' }, 429);
  }

  try {
    const respuesta = await fetch(OPENROUTER, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clave}`,
        'Content-Type': 'application/json',
        // OpenRouter los usa para las estadísticas de la cuenta
        'HTTP-Referer': 'https://carlosjardim.com/calculadora',
        // Solo ASCII: la raya em de antes hacía que la cabecera se enviara
        // como UTF-8 crudo, y en un navegador eso es un TypeError.
        'X-Title': 'Calculadora de Tasas - 60 IQ',
      },
      body: JSON.stringify({
        model: env.IQ_MODELO || MODELO_POR_DEFECTO,
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
          {
            role: 'system',
            content: `${PERSONA}\n\n${contextoDeTasas(cuerpo?.tasas)}${contextoDeLaApp(cuerpo?.contexto)}`,
          },
          // Sin los turnos anteriores, un "a todas las tasas" no tenía a qué
          // referirse y contestaba con una broma, porque literalmente no sabía
          // de qué se le hablaba.
          ...turnos,
          { role: 'user', content: pregunta },
        ],
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      console.error('OpenRouter respondió', respuesta.status, detalle.slice(0, 300));
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

    const resuelto = resolver(decision, cuerpo?.tasas);
    return json({ respuesta: resuelto.texto, partes: resuelto.partes ?? null });
  } catch (error) {
    console.error('Falló la consulta al 60 IQ:', error);
    return json({ error: 'No se pudo consultar. Revisa la conexión.' }, 502);
  }
}

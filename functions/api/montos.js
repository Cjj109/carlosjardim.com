/**
 * Los montos que más se teclean en cada modo de la calculadora.
 *
 * Sirve para que los cinco botones de atajo dejen de ser una lista fija que
 * alguien eligió una vez. Los dos primeros no se mueven; los otros tres salen
 * de lo que la gente usa de verdad, y van cambiando con ello.
 *
 * QUÉ SE GUARDA, QUE ES POCO A PROPÓSITO
 *
 * El modo y el monto redondeado a dos cifras significativas. Nada más: ni IP,
 * ni identificador, ni fecha por persona, ni el importe exacto de nadie. El
 * redondeo no es solo por privacidad —también es lo que hace útil el dato:
 * nadie repite "15.234", pero mucha gente ronda los quince mil, y un botón de
 * atajo tiene que ofrecer números redondos.
 *
 * Quien no quiera aportar, no aporta: el cliente respeta doNotTrack y el
 * Global Privacy Control, y hay un interruptor en el panel de ajustes.
 *
 * SIN BASE DE DATOS NO PASA NADA
 *
 * Si falta el binding MONTOS, el GET devuelve vacío y el POST no hace nada.
 * La calculadora entonces usa el historial de cada quien y, si tampoco hay,
 * los valores por defecto de cada modo. Es decir: esto se puede desplegar
 * antes de crear la base, y encenderla después no requiere tocar código.
 *
 * Para crearla:
 *   npx wrangler d1 create calculadora-montos
 *   npx wrangler d1 execute calculadora-montos --remote --file=./migrations/0001_montos.sql
 * y luego atar el binding MONTOS a la base en Settings → Functions → D1.
 */

const MODOS = ['divisa', 'bs', 'bcv', 'usdt'];

// Cuántos se devuelven por modo. Tres, que son los huecos que se adaptan.
const CUANTOS = 3;

// Un monto por debajo o por encima de esto no es un cálculo real, es alguien
// probando o un error de tecleo.
const MINIMO = 0.01;
const MAXIMO = 1e12;

// Solo cuenta lo usado en los últimos meses: la idea es que la lista siga al
// uso actual, y con la inflación de por medio lo de hace un año no dice nada.
const DIAS_VIGENTES = 60;

// Freno por IP. Es un endpoint público de escritura: sin esto, cualquiera
// puede sesgar los botones de todo el mundo a base de darle en bucle.
const LIMITE = 60;
const VENTANA = 3600;

const json = (datos, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },
  });

/** Dos cifras significativas: 347 → 350, 15.234 → 15.000 */
function redondear(n) {
  if (!Number.isFinite(n) || n < MINIMO || n > MAXIMO) return null;
  const magnitud = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / magnitud) * magnitud;
}

async function pasaElFreno(peticion) {
  const ip = peticion.headers.get('CF-Connecting-IP') || 'desconocida';
  const clave = new Request(`https://freno.local/montos/${encodeURIComponent(ip)}`);
  const cache = caches.default;

  let usadas = 0;
  try {
    const guardado = await cache.match(clave);
    if (guardado) usadas = Number(await guardado.text()) || 0;
  } catch {
    return true; // sin caché no se puede contar; mejor dejar pasar que romper
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

export async function onRequestGet(context) {
  const db = context.env?.MONTOS;
  // Sin base de datos, una respuesta vacía y válida: el cliente se queda con
  // el historial de cada quien y con los valores por defecto.
  if (!db) return json({ montos: {} }, 200, 'public, max-age=300');

  try {
    const desde = new Date(Date.now() - DIAS_VIGENTES * 86400_000).toISOString().split('T')[0];

    const { results } = await db
      .prepare(
        `SELECT modo, monto, n FROM montos
          WHERE visto >= ?
          ORDER BY modo, n DESC`
      )
      .bind(desde)
      .all();

    const montos = {};
    for (const fila of results || []) {
      const lista = (montos[fila.modo] ??= []);
      if (lista.length < CUANTOS) lista.push(fila.monto);
    }

    // Cinco minutos: esto se mueve despacio y no hay ninguna prisa
    return json({ montos }, 200, 'public, max-age=300, s-maxage=300');
  } catch (error) {
    console.error('No se pudieron leer los montos:', error);
    return json({ montos: {} }, 200, 'no-store');
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env?.MONTOS;
  if (!db) return json({ ok: true, guardado: false });

  const origen = request.headers.get('Origin');
  if (origen && new URL(origen).host !== new URL(request.url).host) {
    return json({ error: 'Petición de otro sitio.' }, 403);
  }

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: 'Cuerpo no válido.' }, 400);
  }

  const modo = String(cuerpo?.modo ?? '');
  const monto = redondear(Number(cuerpo?.monto));

  if (!MODOS.includes(modo) || monto === null) {
    return json({ error: 'Modo o monto no válido.' }, 400);
  }

  if (!(await pasaElFreno(request))) {
    return json({ error: 'Demasiadas aportaciones.' }, 429);
  }

  try {
    const hoy = new Date().toISOString().split('T')[0];

    // UPSERT y no leer-sumar-escribir: el incremento tiene que ser atómico
    // porque esto lo escriben muchos a la vez, y un read-modify-write pierde
    // votos en cuanto hay dos peticiones solapadas.
    await db
      .prepare(
        `INSERT INTO montos (modo, monto, n, visto) VALUES (?, ?, 1, ?)
           ON CONFLICT(modo, monto) DO UPDATE SET n = n + 1, visto = excluded.visto`
      )
      .bind(modo, monto, hoy)
      .run();

    return json({ ok: true, guardado: true });
  } catch (error) {
    console.error('No se pudo guardar el monto:', error);
    // Que falle no le importa a nadie: es una estadística, no el cálculo
    return json({ ok: true, guardado: false });
  }
}

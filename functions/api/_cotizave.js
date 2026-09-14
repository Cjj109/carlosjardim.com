/**
 * Cotizave, con freno.
 *
 * El 14 de septiembre de 2026 llegó el aviso: la cuenta había gastado el
 * límite mensual del plan gratis, las consultas de más ya volvían con 429, y
 * si el tráfico seguía podían bloquear la clave. La culpa era de aquí:
 * /api/bcv le preguntaba en CADA petición —cada minuto por cada calculadora
 * abierta— aunque su respuesta solo se usa si el puente de Binance falla, que
 * casi nunca pasa. Cientos de consultas al día para tirarlas.
 *
 * Tres frenos, de más a menos importante:
 *
 *   1. /api/bcv ya solo la llama cuando hace falta (ver bcv.js).
 *   2. La respuesta se guarda cinco minutos en la caché del borde: haya las
 *      pestañas que haya, como mucho una consulta cada cinco minutos.
 *   3. Un 429 la pone en pausa seis horas. Seguir insistiendo después de que
 *      te han dicho que no es justo el tráfico por el que avisaron.
 *
 * La caché es la de Cloudflare (caches.default), que es por centro de datos.
 * La pausa se apunta ahí y además en memoria: si la caché no está —en local,
 * por ejemplo— se sigue frenando dentro del mismo proceso.
 */

const URL_COTIZAVE = 'https://api.cotizave.com/v1/fx/rates';
const VIVE = 300;
const PAUSA = 6 * 3600;

let pausaHasta = 0;

/** La dirección con la que se guarda en la caché. Nunca se pide a la red. */
const llave = (base) => new Request(new URL('/__cache/cotizave', base || 'https://carlosjardim.com'));

async function guardar(cache, base, cuerpo, segundos, extra = {}) {
  if (!cache) return;
  try {
    await cache.put(
      llave(base),
      new Response(cuerpo, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${segundos}`, ...extra },
      })
    );
  } catch {
    // Sin caché se sigue: el primer freno y la memoria siguen en pie
  }
}

/**
 * Las tasas de Cotizave, tal como las devuelve su API.
 *
 * @param base  la URL de la petición en curso, para la llave de la caché
 */
export async function tasasCotizave(clave, base, tope = 6000) {
  if (!clave) throw new Error('sin clave');
  if (Date.now() < pausaHasta) throw new Error('en pausa por el límite del plan');

  const cache = globalThis.caches?.default;
  if (cache) {
    const guardada = await cache.match(llave(base)).catch(() => null);
    if (guardada?.headers.get('X-Pausa')) throw new Error('en pausa por el límite del plan');
    if (guardada) return guardada.json();
  }

  const res = await fetch(URL_COTIZAVE, {
    headers: { 'X-API-Key': clave, Accept: 'application/json' },
    signal: AbortSignal.timeout(tope),
  });

  if (res.status === 429) {
    pausaHasta = Date.now() + PAUSA * 1000;
    await guardar(cache, base, '{}', PAUSA, { 'X-Pausa': '1' });
    throw new Error('límite del plan alcanzado (429)');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const datos = await res.json();
  await guardar(cache, base, JSON.stringify(datos), VIVE);
  return datos;
}

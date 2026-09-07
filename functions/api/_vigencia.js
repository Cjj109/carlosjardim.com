/**
 * Desde cuándo rige cada tasa del BCV.
 *
 * El BCV publica por la tarde la tasa del día SIGUIENTE. El 7 de septiembre,
 * ya de noche, su página decía 814,6908 con fecha valor 2026-09-08, mientras
 * lo que regía ese día seguía siendo 813,7361. La web cogía el número recién
 * publicado y convertía con él en el acto: media tarde cobrando con la tasa
 * de mañana, y el aviso del pie diciéndolo —"BCV rige 08/09"— sin que eso
 * cambiara la cuenta.
 *
 * Aquí se separan las dos cosas que antes eran una:
 *
 *   - Lo que el BCV PUBLICA, que trae su propia fecha valor.
 *   - Lo que RIGE hoy, que es la fecha valor más alta que ya haya llegado.
 *
 * Toda tasa leída se guarda con su fecha valor, así que al pasar la
 * medianoche de Caracas la de mañana pasa a ser la de hoy sola, sin que haga
 * falta volver a leer nada ni desplegar nada.
 *
 * Y "hoy" es hoy en Caracas, no en UTC. Con `toISOString()` el día cambiaba a
 * las ocho de la noche hora de Venezuela, que es justo el rato en que el BCV
 * acaba de publicar: la tasa de mañana habría entrado cuatro horas antes de
 * tiempo. El usuario lo pidió expresamente.
 */

/** El día de hoy en Caracas, "AAAA-MM-DD" */
export function hoyCaracas(ahora = new Date()) {
  // en-CA da directamente el orden ISO
  const enCaracas = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  if (/^\d{4}-\d{2}-\d{2}$/.test(enCaracas)) return enCaracas;

  // Sin datos de zona horaria, a mano: Venezuela es UTC-4 todo el año, no
  // cambia la hora en verano.
  return new Date(ahora.getTime() - 4 * 3600_000).toISOString().slice(0, 10);
}

export const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** true si esa fecha valor todavía no ha llegado */
export const esFutura = (fecha, hoy) => esFecha(fecha) && fecha > hoy;

const usable = (n) => Number.isFinite(n) && n > 0 && n < 1_000_000;

/**
 * Apunta una tasa con su fecha valor.
 *
 * Se escribe en cada lectura que llega al origen —el endpoint se cachea cinco
 * minutos en el borde, así que son unas pocas al día— y por eso el fallo se
 * traga: esto es memoria de apoyo, no la fuente. Si la base no está atada o
 * da error, lo único que se pierde es saber cuál era la tasa anterior.
 */
export async function guardarVigencia(db, fecha, usd, eur) {
  if (!db || !esFecha(fecha)) return;
  if (!usable(usd) && !usable(eur)) return;

  try {
    await db
      .prepare(
        `INSERT INTO bcv_vigencias (fecha, usd, eur) VALUES (?, ?, ?)
         ON CONFLICT(fecha) DO UPDATE SET
           usd = COALESCE(excluded.usd, usd),
           eur = COALESCE(excluded.eur, eur),
           visto_en = datetime('now')`
      )
      .bind(fecha, usable(usd) ? usd : null, usable(eur) ? eur : null)
      .run();
  } catch (e) {
    console.warn('[bcv] no se pudo guardar la vigencia:', e.message);
  }
}

/** La tasa apuntada más reciente que ya haya entrado en vigor */
export async function vigenteEn(db, hoy) {
  if (!db) return null;

  try {
    const fila = await db
      .prepare('SELECT fecha, usd, eur FROM bcv_vigencias WHERE fecha <= ? ORDER BY fecha DESC LIMIT 1')
      .bind(hoy)
      .first();

    return fila && (usable(fila.usd) || usable(fila.eur)) ? fila : null;
  } catch (e) {
    console.warn('[bcv] no se pudo leer la vigencia:', e.message);
    return null;
  }
}

/**
 * Último recurso: la foto que deja el workflow en data/bcv-rates.json.
 *
 * Solo hace falta si la base no responde o todavía no ha visto ninguna tasa
 * ya vigente —el primer despliegue, por ejemplo—. Es el mismo archivo al que
 * ya se cae la calculadora de la portada cuando /api/bcv falla, y como ese
 * workflow lee este endpoint a las nueve de la mañana de Caracas, lo que
 * guarda es siempre una tasa ya en vigor.
 */
export async function snapshotEstatico(url, hoy) {
  try {
    const res = await fetch(new URL('/data/bcv-rates.json', url), {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;

    const datos = await res.json();
    const fecha = datos?.usd?.date ?? datos?.eur?.date;
    // Si la foto es de una tasa que tampoco ha entrado aún, no sirve de nada
    if (!esFecha(fecha) || esFutura(fecha, hoy)) return null;

    return { fecha, usd: datos?.usd?.rate ?? null, eur: datos?.eur?.rate ?? null };
  } catch {
    return null;
  }
}

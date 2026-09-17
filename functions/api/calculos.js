/**
 * Los cálculos de cada quien, guardados para que el 60 IQ no dependa del
 * aparato.
 *
 * Sus notas y su conversación ya viajaban —viven en la base— así que al
 * cambiar de teléfono el asistente te reconocía pero no se acordaba de nada de
 * lo que habías calculado. Medio conocido. Esto cierra esa mitad.
 *
 * El historial de la pantalla NO se toca: sigue en el navegador, que es lo que
 * hace que el panel abra instantáneo y funcione sin señal. Esto es una copia
 * para el asistente, no su sustituto.
 *
 * QUÉ SE GUARDA
 *
 * El cálculo, no la pantalla: cuándo, en qué modo, cuánto y contra qué tasa.
 * Ni el color de la fila ni nada de lo que solo sirve para pintar.
 *
 * Es un registro de comportamiento atado a un nombre, y se guarda a
 * conciencia: lo mismo que se decidió en la migración 0008 y por las mismas
 * razones. Se borra entero con "que lo olvide" (ver iq-memoria.js) y se
 * recorta a los últimos por persona: esto es memoria de trabajo, no un archivo
 * de por vida.
 */
import { sesionDe, json } from '../_acceso.js';

/* Cuántos se guardan por persona. Treinta es lo mismo que enseña el panel del
   navegador, y de ahí el 60 IQ solo mira los ocho últimos: el resto está para
   que cambiar de teléfono no borre la semana pasada. */
const GUARDADOS = 30;

const MODOS = ['divisa', 'bs', 'bcv', 'usdt'];
const MAX_TEXTO = 40;

/* La misma comprobación de origen que el resto de endpoints que escriben. La
   cookie es SameSite=Lax y ya no viaja en peticiones de otras webs; esto es el
   segundo cerrojo. */
function mismoSitio(peticion) {
  const origen = peticion.headers.get('Origin');
  if (!origen) return true;
  try {
    return new URL(origen).host === new URL(peticion.url).host;
  } catch {
    return false;
  }
}

const unaLinea = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO) : null);

/** Los últimos cálculos de esta persona, del más nuevo al más viejo */
export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: false, error: 'No autorizado' }, 401);

  try {
    const r = await db
      .prepare('SELECT fecha, modo, monto, destino, resultado FROM calculos WHERE persona_id = ? ORDER BY id DESC LIMIT ?')
      .bind(sesion.id, GUARDADOS)
      .all();
    return json({ ok: true, calculos: r?.results || [] });
  } catch (e) {
    // Sin tabla —desplegado antes de la migración 0011— no hay historial y ya:
    // el navegador tiene el suyo y la app funciona igual
    console.warn('[calculos] no se pudo leer:', e?.message);
    return json({ ok: true, calculos: [] });
  }
}

/** Apunta uno. Lo manda el navegador cada vez que apunta en su historial. */
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: false, error: 'No autorizado' }, 401);
  if (!mismoSitio(request)) return json({ ok: false, error: 'Petición de otro sitio.' }, 403);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ ok: false, error: 'Cuerpo no válido.' }, 400);
  }

  const monto = Number(cuerpo?.monto);
  const modo = MODOS.includes(cuerpo?.modo) ? cuerpo.modo : null;
  if (!modo || !Number.isFinite(monto) || monto <= 0) {
    return json({ ok: false, error: 'Eso no es un cálculo.' }, 400);
  }

  // La fecha la pone el aparato porque es cuándo se calculó, no cuándo llegó
  // aquí; pero si viene rara, la de ahora, que es mejor que una inventada.
  const fecha = typeof cuerpo?.fecha === 'string' && !Number.isNaN(Date.parse(cuerpo.fecha))
    ? cuerpo.fecha
    : new Date().toISOString();

  try {
    await db
      .prepare('INSERT INTO calculos (persona_id, fecha, modo, monto, destino, resultado) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(sesion.id, fecha, modo, monto, unaLinea(cuerpo?.destino), unaLinea(cuerpo?.resultado))
      .run();

    /* Y se recorta, como iq_turnos. Sin esto la tabla crece sin fin para
       guardar cálculos que nadie va a mirar: el 60 IQ usa los ocho últimos. */
    await db
      .prepare(
        `DELETE FROM calculos WHERE persona_id = ? AND id NOT IN (
           SELECT id FROM calculos WHERE persona_id = ? ORDER BY id DESC LIMIT ?
         )`
      )
      .bind(sesion.id, sesion.id, GUARDADOS)
      .run();

    return json({ ok: true });
  } catch (e) {
    /* Que no se pueda guardar no es motivo para molestar a nadie: el cálculo
       ya está hecho y en el historial del navegador. Se dice que no se guardó
       y se sigue. */
    console.warn('[calculos] no se pudo guardar:', e?.message);
    return json({ ok: true, guardado: false });
  }
}

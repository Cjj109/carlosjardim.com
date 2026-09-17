/**
 * Lo que el 60 IQ guarda de cada persona: verlo, corregirlo y borrarlo.
 *
 * Borrar aquí es olvidar de verdad: se van las observaciones aprendidas y la
 * conversación guardada, las dos. "Olvídame" dejando doce turnos apuntados no
 * es olvidar.
 *
 * El botón "Borrar" de la pantalla NO llega hasta aquí: ese solo despeja la
 * vista para seguir hablando, y llevarse la memoria por ordenar la pantalla
 * sería castigar el orden.
 *
 * CORREGIR, QUE ANTES NO SE PODÍA
 *
 * Las notas las escribía solo el modelo y lo único que se podía hacer con
 * ellas era perderlas todas. Una nota equivocada —"paga siempre en Zelle"
 * cuando ya no— se le cuela en cada respuesta a partir de entonces, y la única
 * cura era la amnesia: perder también lo que sí estaba bien. Ahora se tacha la
 * línea que sobra (DELETE con una línea) y se le puede decir lo que tiene que
 * saber (POST con una nota), sin esperar a que lo deduzca.
 *
 * EL TONO TAMBIÉN ES DE CADA QUIEN
 *
 * PUT guarda cómo quiere que le hablen. Vive en otra tabla y no se va con el
 * olvido a propósito: quien pide "olvídate de mí" no está pidiendo que además
 * le empiecen a gritar.
 *
 * Cada quien ve y cambia lo suyo. No hay forma de mirar lo de otro.
 */
import { sesionDe, json } from '../_acceso.js';
import { anadirNota, quitarNota, tonoDe, TONOS_VALIDOS } from './60iq.js';

const MAX_NOTA = 200;

/* La misma comprobación que el chat y el 60 IQ. La cookie es SameSite=Lax, o
   sea que ya no viaja en un POST de otra web; esto es el segundo cerrojo, que
   cuesta tres líneas y cubre el día que alguien cambie aquella marca sin
   acordarse de esto. */
function mismoSitio(peticion) {
  const origen = peticion.headers.get('Origin');
  if (!origen) return true;
  try {
    return new URL(origen).host === new URL(peticion.url).host;
  } catch {
    return false;
  }
}

/** Las notas de esta persona, tal cual están guardadas */
async function notasDe(db, personaId) {
  const fila = await db.prepare('SELECT notas, actualizado FROM iq_notas WHERE persona_id = ?').bind(personaId).first();
  return { notas: fila?.notas || '', actualizado: fila?.actualizado || null };
}

/** Guarda el texto entero de las notas, ya recortado por quien llame */
const guardarNotas = (db, personaId, notas) =>
  db
    .prepare(
      `INSERT INTO iq_notas (persona_id, notas) VALUES (?, ?)
       ON CONFLICT(persona_id) DO UPDATE SET notas = excluded.notas, actualizado = datetime('now')`
    )
    .bind(personaId, notas)
    .run();

/* Las notas van también en lista, una por línea, porque la pantalla necesita
   poder tachar UNA. El texto entero se sigue mandando: lo usa el modelo y lo
   enseñaba la versión anterior de la app, que puede seguir instalada. */
const enLineas = (notas) =>
  String(notas || '')
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: false, error: 'No autorizado' }, 401);

  try {
    const { notas, actualizado } = await notasDe(db, sesion.id);
    const cuantos = await db.prepare('SELECT COUNT(*) AS n FROM iq_turnos WHERE persona_id = ?').bind(sesion.id).first();

    return json({
      ok: true,
      nombre: sesion.nombre,
      notas,
      lineas: enLineas(notas),
      tono: await tonoDe(db, sesion.id),
      tonos: TONOS_VALIDOS,
      actualizado,
      turnosGuardados: cuantos?.n || 0,
    });
  } catch (e) {
    console.error('[60iq] error leyendo la memoria:', e?.message);
    return json({ ok: false, error: 'No se pudo leer la memoria' }, 503);
  }
}

/** Una nota dicha a mano: "recuérdame que cobro por Zelle" */
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

  const nota = String(cuerpo?.nota ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTA);
  if (!nota) return json({ ok: false, error: 'Escribe qué quieres que recuerde.' }, 400);

  try {
    const { notas } = await notasDe(db, sesion.id);
    const nuevas = anadirNota(notas, nota);
    await guardarNotas(db, sesion.id, nuevas);
    return json({ ok: true, notas: nuevas, lineas: enLineas(nuevas) });
  } catch (e) {
    console.error('[60iq] error guardando una nota:', e?.message);
    return json({ ok: false, error: 'No se pudo guardar' }, 503);
  }
}

/** Cómo quiere que le hablen */
export async function onRequestPut(context) {
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

  const tono = String(cuerpo?.tono ?? '');
  if (!TONOS_VALIDOS.includes(tono)) return json({ ok: false, error: 'Ese tono no existe.' }, 400);

  try {
    await db
      .prepare(
        `INSERT INTO iq_ajustes (persona_id, tono) VALUES (?, ?)
         ON CONFLICT(persona_id) DO UPDATE SET tono = excluded.tono, actualizado = datetime('now')`
      )
      .bind(sesion.id, tono)
      .run();
    return json({ ok: true, tono });
  } catch (e) {
    /* Casi siempre: la migración 0009 todavía no se ha corrido. Decir "listo"
       y seguir hablando igual sería mentir en lo único que se pidió. */
    console.error('[60iq] error guardando el tono:', e?.message);
    return json({ ok: false, error: 'No se pudo guardar el tono' }, 503);
  }
}

/**
 * Sin cuerpo: que lo olvide todo. Con una línea: tachar esa nota y nada más.
 *
 * El borrado entero sigue llevándose las dos tablas juntas, que es lo que
 * significa "olvídame". Lo que no se lleva es el tono: eso lo eligió la
 * persona, no lo aprendió el modelo.
 */
export async function onRequestDelete(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: false, error: 'No autorizado' }, 401);
  if (!mismoSitio(request)) return json({ ok: false, error: 'Petición de otro sitio.' }, 403);

  // El DELETE de "olvídalo todo" va sin cuerpo, así que no leerlo no es un error
  let cuerpo = null;
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = null;
  }

  const linea = cuerpo?.linea;
  if (linea != null) {
    if (!Number.isInteger(linea) || linea < 0) return json({ ok: false, error: 'Esa nota no existe.' }, 400);
    try {
      const { notas } = await notasDe(db, sesion.id);
      const nuevas = quitarNota(notas, linea);
      await guardarNotas(db, sesion.id, nuevas);
      return json({ ok: true, notas: nuevas, lineas: enLineas(nuevas) });
    } catch (e) {
      console.error('[60iq] error tachando una nota:', e?.message);
      return json({ ok: false, error: 'No se pudo borrar esa nota' }, 503);
    }
  }

  try {
    await db.batch([
      db.prepare('DELETE FROM iq_notas WHERE persona_id = ?').bind(sesion.id),
      db.prepare('DELETE FROM iq_turnos WHERE persona_id = ?').bind(sesion.id),
      // También los cálculos guardados: olvidar dejando apuntado que mueves
      // 350 dólares los viernes no es olvidar.
      db.prepare('DELETE FROM calculos WHERE persona_id = ?').bind(sesion.id),
    ]);
  } catch (e) {
    // Decir "listo, olvidado" cuando no se borró nada sería mentir en lo único
    // que la persona vino a pedir.
    console.error('[60iq] error olvidando:', e?.message);
    return json({ ok: false, error: 'No se pudo borrar la memoria' }, 503);
  }

  return json({ ok: true });
}

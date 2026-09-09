/**
 * Lo que el 60 IQ guarda de cada persona: verlo y borrarlo.
 *
 * Borrar aquí es olvidar de verdad: se van las observaciones aprendidas y la
 * conversación guardada, las dos. "Olvídame" dejando doce turnos apuntados no
 * es olvidar.
 *
 * El botón "Borrar" de la pantalla NO llega hasta aquí: ese solo despeja la
 * vista para seguir hablando, y llevarse la memoria por ordenar la pantalla
 * sería castigar el orden.
 *
 * Cada quien ve y borra lo suyo. No hay forma de mirar lo de otro.
 */
import { sesionDe, json } from '../_acceso.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: false, error: 'No autorizado' }, 401);

  try {
    const notas = await db.prepare('SELECT notas, actualizado FROM iq_notas WHERE persona_id = ?').bind(sesion.id).first();
    const cuantos = await db.prepare('SELECT COUNT(*) AS n FROM iq_turnos WHERE persona_id = ?').bind(sesion.id).first();

    return json({
      ok: true,
      nombre: sesion.nombre,
      notas: notas?.notas || '',
      actualizado: notas?.actualizado || null,
      turnosGuardados: cuantos?.n || 0,
    });
  } catch (e) {
    console.error('[60iq] error leyendo la memoria:', e?.message);
    return json({ ok: false, error: 'No se pudo leer la memoria' }, 503);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: false, error: 'No autorizado' }, 401);

  try {
    await db.batch([
      db.prepare('DELETE FROM iq_notas WHERE persona_id = ?').bind(sesion.id),
      db.prepare('DELETE FROM iq_turnos WHERE persona_id = ?').bind(sesion.id),
    ]);
  } catch (e) {
    // Decir "listo, olvidado" cuando no se borró nada sería mentir en lo único
    // que la persona vino a pedir.
    console.error('[60iq] error olvidando:', e?.message);
    return json({ ok: false, error: 'No se pudo borrar la memoria' }, 503);
  }

  return json({ ok: true });
}

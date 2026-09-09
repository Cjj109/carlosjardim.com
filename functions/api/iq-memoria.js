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

  const notas = await db.prepare('SELECT notas, actualizado FROM iq_notas WHERE persona_id = ?').bind(sesion.id).first();
  const cuantos = await db.prepare('SELECT COUNT(*) AS n FROM iq_turnos WHERE persona_id = ?').bind(sesion.id).first();

  return json({
    ok: true,
    nombre: sesion.nombre,
    notas: notas?.notas || '',
    actualizado: notas?.actualizado || null,
    turnosGuardados: cuantos?.n || 0,
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: false, error: 'No autorizado' }, 401);

  await db.batch([
    db.prepare('DELETE FROM iq_notas WHERE persona_id = ?').bind(sesion.id),
    db.prepare('DELETE FROM iq_turnos WHERE persona_id = ?').bind(sesion.id),
  ]);

  return json({ ok: true });
}

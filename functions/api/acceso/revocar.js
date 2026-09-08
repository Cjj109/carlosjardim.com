/**
 * Quita una passkey.
 *
 * Hace falta para lo de siempre: se pierde un teléfono, se vende, se cambia.
 * Sin esto, la llave de un aparato que ya no tienes sigue abriendo la puerta
 * para siempre.
 *
 * Cada quien revoca las suyas. Quitarle el acceso a otra persona no se hace
 * desde aquí: eso es una decisión más seria y se hace en la base, a mano y a
 * conciencia.
 */
import { sesionDe, json } from '../../_acceso.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  if (!db) return json({ ok: false, error: 'Acceso no configurado' }, 503);

  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: false, error: 'No autorizado' }, 401);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ ok: false, error: 'Petición ilegible' }, 400);
  }

  const id = String(cuerpo?.id || '');
  if (!id) return json({ ok: false, error: 'Falta cuál' }, 400);

  /* No se deja borrar la última: quien lo hiciera se quedaría fuera de su
     propio sitio con un clic y sin aviso. Para irse del todo hay otra
     conversación, no un botón junto a los demás. */
  const cuantas = await db
    .prepare('SELECT COUNT(*) AS n FROM llaves WHERE persona_id = ?')
    .bind(sesion.id)
    .first();
  if ((cuantas?.n || 0) <= 1) {
    return json({ ok: false, error: 'Es tu única llave: añade otra antes de quitar esta' }, 400);
  }

  const fuera = await db
    .prepare('DELETE FROM llaves WHERE id = ? AND persona_id = ? RETURNING id')
    .bind(id, sesion.id)
    .first();
  if (!fuera) return json({ ok: false, error: 'Esa llave no es tuya' }, 404);

  return json({ ok: true });
}

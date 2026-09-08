/**
 * Da de alta una passkey.
 *
 * Dos caminos, y el mismo código sirve para los dos:
 *
 *   con invitación  persona nueva. La invitación se gasta aquí.
 *   con sesión      otro aparato de quien ya está dentro. Es lo que resuelve
 *                   tener un Samsung y un iPhone: las passkeys no cruzan de
 *                   iCloud a Google, así que cada aparato lleva la suya y las
 *                   dos apuntan a la misma persona.
 */
import { revisarClientData, crearSesion, sesionDe, identidadDelSitio, aleatorio, huellaCorreo, json } from '../../_acceso.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  if (!db) return json({ ok: false, error: 'Acceso no configurado' }, 503);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ ok: false, error: 'Petición ilegible' }, 400);
  }

  const { codigo, credencial, clavePublica, algoritmo, clientData, apodo, correo } = cuerpo || {};
  if (!credencial || !clavePublica || !clientData || typeof algoritmo !== 'number') {
    return json({ ok: false, error: 'Faltan datos del alta' }, 400);
  }

  const { origen } = identidadDelSitio(request);
  const revision = await revisarClientData(db, clientData, 'webauthn.create', origen);
  if (!revision.ok) return json({ ok: false, error: revision.error }, 400);

  const sesion = await sesionDe(db, request);
  let personaId;

  if (sesion) {
    personaId = sesion.id;
  } else {
    if (!codigo) return json({ ok: false, error: 'Hace falta una invitación' }, 403);

    // La invitación se marca usada en la misma sentencia que la comprueba: si
    // dos peticiones llegan a la vez, solo una encuentra la fila sin usar.
    const gastada = await db
      .prepare(
        `UPDATE invitaciones SET usada_en = datetime('now')
         WHERE codigo = ? AND usada_en IS NULL AND expira_en > datetime('now')
         RETURNING para`
      )
      .bind(codigo)
      .first();
    if (!gastada) return json({ ok: false, error: 'Invitación no válida o ya usada' }, 403);

    /* El correo solo se pide a quien se da de alta, no al añadir un aparato:
       la persona ya existe y su huella no cambia. */
    const huella = await huellaCorreo(correo);
    if (!huella) return json({ ok: false, error: 'Hace falta un correo válido' }, 400);

    const yaEsta = await db.prepare('SELECT 1 FROM personas WHERE correo_hash = ?').bind(huella).first();
    if (yaEsta) return json({ ok: false, error: 'Ese correo ya tiene acceso' }, 409);

    personaId = aleatorio(16);
    await db
      .prepare('INSERT INTO personas (id, nombre, correo_hash) VALUES (?, ?, ?)')
      .bind(personaId, gastada.para, huella)
      .run();
    await db.prepare('UPDATE invitaciones SET persona_id = ? WHERE codigo = ?').bind(personaId, codigo).run();
  }

  try {
    await db
      .prepare('INSERT INTO llaves (id, persona_id, clave_publica, algoritmo, apodo) VALUES (?, ?, ?, ?, ?)')
      .bind(credencial, personaId, clavePublica, algoritmo, (apodo || '').slice(0, 60) || null)
      .run();
  } catch (e) {
    // La misma llave dos veces no es un fallo que haya que contarle a nadie
    if (!String(e.message).includes('UNIQUE')) throw e;
  }

  const cookie = await crearSesion(db, personaId);
  return json({ ok: true, nueva: !sesion }, 200, { 'Set-Cookie': cookie });
}

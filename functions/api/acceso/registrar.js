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
import { revisarClientData, crearSesion, sesionDe, identidadDelSitio, aleatorio, json } from '../../_acceso.js';

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

  const { codigo, credencial, clavePublica, algoritmo, clientData, apodo } = cuerpo || {};
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
         RETURNING para, persona_id, creada_por`
      )
      .bind(codigo)
      .first();
    if (!gastada) return json({ ok: false, error: 'Invitación no válida o ya usada' }, 403);

    /* Si la invitación viene atada a una persona, es un enlace que alguien se
       mandó a sí mismo para su segundo teléfono: la llave va a su cuenta y no
       se crea a nadie. Sin eso, quien tuviera dos aparatos acabaría siendo dos
       personas distintas en la lista. */
    if (gastada.persona_id) {
      const suya = await db
        .prepare('SELECT id FROM personas WHERE id = ? AND activa = 1')
        .bind(gastada.persona_id)
        .first();
      if (!suya) return json({ ok: false, error: 'Esa cuenta ya no está activa' }, 403);
      personaId = gastada.persona_id;
    } else {
      personaId = aleatorio(16);
      /* Quien entra por la clave maestra es el dueño, y es el único que
         reparte accesos. Se deduce de por dónde entró, no se marca a mano. */
      const esDueno = gastada.creada_por === 'clave maestra' ? 1 : 0;
      await db
        .prepare('INSERT INTO personas (id, nombre, puede_invitar) VALUES (?, ?, ?)')
        .bind(personaId, gastada.para, esDueno)
        .run();
      await db.prepare('UPDATE invitaciones SET persona_id = ? WHERE codigo = ?').bind(personaId, codigo).run();
    }
  }

  /* Se actualiza si ya existe, pero solo si es de esta misma persona.
     Antes se hacía un INSERT y se tragaba el error de clave duplicada, y eso
     escondía un caso feo: si el guardado fallaba, la persona salía con sesión
     abierta —o sea, "funcionó"— y al día siguiente no podía entrar porque su
     llave no estaba en ninguna parte. Un fallo que solo aparece mañana.

     Registrar dos veces en el mismo aparato sí es normal, y ahí se actualiza.
     Que la llave sea de otra persona no puede pasar sin tener su clave
     privada, pero si pasara, callarlo sería lo peor. */
  const guardada = await db
    .prepare(
      `INSERT INTO llaves (id, persona_id, clave_publica, algoritmo, apodo) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         clave_publica = excluded.clave_publica,
         algoritmo = excluded.algoritmo,
         apodo = COALESCE(excluded.apodo, llaves.apodo)
       WHERE llaves.persona_id = excluded.persona_id
       RETURNING id`
    )
    .bind(credencial, personaId, clavePublica, algoritmo, (apodo || '').slice(0, 60) || null)
    .first();

  if (!guardada) return json({ ok: false, error: 'Esa llave ya está en uso' }, 409);

  const cookie = await crearSesion(db, personaId, credencial);
  return json({ ok: true, nueva: !sesion }, 200, { 'Set-Cookie': cookie });
}

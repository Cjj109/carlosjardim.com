/**
 * Entrar con una passkey.
 *
 * Aquí es donde se comprueba todo. El orden importa poco salvo en una cosa:
 * el reto se consume dentro de revisarClientData y se borra acierte o falle,
 * para que no se pueda probar dos veces.
 */
import { revisarClientData, authDataValida, firmaValida, crearSesion, identidadDelSitio, json } from '../../_acceso.js';

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

  const { credencial, clientData, authData, firma } = cuerpo || {};
  if (!credencial || !clientData || !authData || !firma) {
    return json({ ok: false, error: 'Faltan datos de la entrada' }, 400);
  }

  const { rpId, origen } = identidadDelSitio(request);

  const revision = await revisarClientData(db, clientData, 'webauthn.get', origen);
  if (!revision.ok) return json({ ok: false, error: revision.error }, 401);

  const llave = await db
    .prepare(
      `SELECT l.id, l.persona_id, l.clave_publica, l.algoritmo, l.contador
       FROM llaves l JOIN personas p ON p.id = l.persona_id
       WHERE l.id = ? AND p.activa = 1`
    )
    .bind(credencial)
    .first();
  if (!llave) return json({ ok: false, error: 'Esa llave no tiene acceso' }, 401);

  const auth = await authDataValida(authData, rpId);
  if (!auth.ok) return json({ ok: false, error: auth.error }, 401);

  if (!(await firmaValida(llave, authData, clientData, firma))) {
    return json({ ok: false, error: 'La firma no es válida' }, 401);
  }

  /* El contador delata una credencial clonada: el autenticador lo sube en
     cada uso, así que uno igual o menor significa que la firma vino de una
     copia. Hay autenticadores que siempre mandan 0 —las passkeys sincronizadas
     de Apple y Google, entre ellos— y para esos la especificación dice que no
     se compruebe. */
  if (llave.contador > 0 && auth.contador > 0 && auth.contador <= llave.contador) {
    return json({ ok: false, error: 'Esa llave parece duplicada' }, 401);
  }

  await db
    .prepare("UPDATE llaves SET contador = ?, ultimo_uso = datetime('now') WHERE id = ?")
    .bind(auth.contador, llave.id)
    .run();

  const cookie = await crearSesion(db, llave.persona_id, llave.id);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}

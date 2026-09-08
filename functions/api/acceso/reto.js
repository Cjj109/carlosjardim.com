/**
 * Reparte el reto que hay que firmar.
 *
 * Para entrar lo puede pedir cualquiera: sin reto no se puede ni intentar, y
 * el reto por sí solo no abre nada —hace falta la clave privada, que no sale
 * del aparato—. Para darse de alta hay que traer una invitación sin usar o
 * venir ya con la sesión puesta, que es como se añade un segundo aparato.
 */
import { crearReto, sesionDe, huellaCorreo, json } from '../../_acceso.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  if (!db) return json({ ok: false, error: 'Acceso no configurado' }, 503);

  const tipo = new URL(request.url).searchParams.get('tipo') === 'alta' ? 'alta' : 'entrada';

  if (tipo === 'alta') {
    const codigo = new URL(request.url).searchParams.get('codigo');
    const sesion = await sesionDe(db, request);

    if (!sesion) {
      if (!codigo) return json({ ok: false, error: 'Hace falta una invitación' }, 403);
      const inv = await db
        .prepare("SELECT para FROM invitaciones WHERE codigo = ? AND usada_en IS NULL AND expira_en > datetime('now')")
        .bind(codigo)
        .first();
      if (!inv) return json({ ok: false, error: 'Invitación no válida o ya usada' }, 403);
      /* El usuarioId va al alta y el autenticador lo usa para saber si esta
         passkey sustituye a otra suya o es nueva. Para una persona que aún no
         existe sirve el código de la invitación, que ya es único; al añadir un
         aparato va el id de la persona, y así registrarse otra vez en el mismo
         teléfono reemplaza la llave en lugar de dejar dos. */
      return json({ ok: true, reto: await crearReto(db, 'alta'), para: inv.para, usuarioId: codigo, nuevo: true });
    }

    // Con sesión: se está añadiendo otro aparato a la misma persona
    return json({
      ok: true,
      reto: await crearReto(db, 'alta'),
      para: sesion.nombre,
      usuarioId: sesion.id,
      nuevo: false,
    });
  }

  /* Entrar con el correo es el camino de repuesto.
     Lo normal es que el navegador enseñe solo las llaves de este sitio y se
     entre con un gesto, sin escribir nada. Pero hay navegadores y situaciones
     —una ventana privada, un Android viejo— donde ese listado no aparece y la
     persona se queda mirando un botón que no hace nada. Escribiendo el correo
     se le dice al navegador exactamente qué llave pedir.

     Con un correo desconocido se devuelve un reto igual, sin llaves y sin
     decir que no existe: contestar distinto convertiría esto en una forma de
     averiguar quién tiene acceso, que es justo la lista que no queremos que
     se pueda reconstruir. */
  const correo = new URL(request.url).searchParams.get('correo');
  if (correo) {
    const huella = await huellaCorreo(correo);
    const llaves = huella
      ? await db
          .prepare(
            `SELECT l.id FROM llaves l JOIN personas p ON p.id = l.persona_id
             WHERE p.correo_hash = ? AND p.activa = 1`
          )
          .bind(huella)
          .all()
      : { results: [] };

    return json({
      ok: true,
      reto: await crearReto(db, 'entrada'),
      llaves: (llaves.results || []).map((l) => l.id),
    });
  }

  return json({ ok: true, reto: await crearReto(db, 'entrada') });
}

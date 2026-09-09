/**
 * Reparte el reto que hay que firmar.
 *
 * Para entrar lo puede pedir cualquiera: sin reto no se puede ni intentar, y
 * el reto por sí solo no abre nada —hace falta la clave privada, que no sale
 * del aparato—. Para darse de alta hay que traer una invitación sin usar o
 * venir ya con la sesión puesta, que es como se añade un segundo aparato.
 */
import { crearReto, sesionDe, json } from '../../_acceso.js';

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

  return json({ ok: true, reto: await crearReto(db, 'entrada') });
}

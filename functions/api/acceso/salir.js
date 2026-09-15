/** Cierra la sesión de este aparato. Las passkeys y los demás no se tocan. */
import { COOKIE, leerCookie, cerrarCookie, json } from '../../_acceso.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const testigo = leerCookie(request, COOKIE);

  /* Borrar la sesión de la base, con su try. Sin él, si la base fallaba
     justo ahora, el error saltaba antes de llegar a borrar la cookie: no se
     podía salir mientras durara el fallo. La cookie se borra siempre, que es
     lo que de verdad saca a este aparato; la fila, si se queda, caduca sola. */
  if (db && testigo) {
    try {
      const bytes = new TextEncoder().encode(testigo);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      await db.prepare('DELETE FROM sesiones WHERE hash = ?').bind(hash).run();
    } catch (e) {
      console.error('[acceso] no se pudo borrar la sesión al salir:', e?.message);
    }
  }

  return json({ ok: true }, 200, { 'Set-Cookie': cerrarCookie() });
}

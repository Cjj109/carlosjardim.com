/** Cierra la sesión de este aparato. Las passkeys y los demás no se tocan. */
import { COOKIE, leerCookie, cerrarCookie, json } from '../../_acceso.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const testigo = leerCookie(request, COOKIE);

  if (db && testigo) {
    const bytes = new TextEncoder().encode(testigo);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await db.prepare('DELETE FROM sesiones WHERE hash = ?').bind(hash).run();
  }

  return json({ ok: true }, 200, { 'Set-Cookie': cerrarCookie() });
}

/**
 * Cloudflare Pages Function: Admin Login
 * Verifies credentials against env.ADMIN_USER and env.ADMIN_PASS
 * Set these in Cloudflare Dashboard > Pages > Settings > Environment variables
 */

import { igualesEnTiempoConstante } from '../../_acceso.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const adminUser = env.ADMIN_USER;
  const adminPass = env.ADMIN_PASS;

  if (!adminUser || !adminPass) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Admin not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { user, pass } = body || {};

    /* Comparación en tiempo constante. Con `===` el navegador puede medir
       por dónde falla la cadena y sacar la contraseña letra a letra, y esto
       es una puerta abierta a cualquiera y sin freno de intentos.

       Dicho lo importante: detrás de esta puerta no hay nada. El panel que
       abre solo cambia el tema del sitio, y lo guarda en el localStorage de
       ese navegador —no toca el servidor ni lo ve nadie más—. Lo que sí es
       real es que esto dice si un usuario y una contraseña son los buenos,
       a quien pregunte y las veces que quiera. Si esa contraseña se parece a
       alguna otra tuya, lo suyo es borrar este endpoint entero. */
    if (igualesEnTiempoConstante(String(user ?? ''), adminUser)
        && igualesEnTiempoConstante(String(pass ?? ''), adminPass)) {
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: 'Credenciales incorrectas' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid request' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

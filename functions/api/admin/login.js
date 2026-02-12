/**
 * Cloudflare Pages Function: Admin Login
 * Verifies credentials against env.ADMIN_USER and env.ADMIN_PASS
 * Set these in Cloudflare Dashboard > Pages > Settings > Environment variables
 */

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

    if (user === adminUser && pass === adminPass) {
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

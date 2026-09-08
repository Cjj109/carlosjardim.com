/**
 * Crea una invitación de un solo uso.
 *
 * Quien ya está dentro puede invitar. Y para el primero, cuando todavía no
 * hay nadie dentro, vale ACCESO_BOOTSTRAP: una clave que se pone a mano en
 * las variables de Cloudflare y se borra en cuanto entra el primero. Así no
 * hay ninguna credencial escrita en el repositorio ni en la página.
 *
 * El código es aleatorio de 256 bits, así que no se adivina probando. Caduca
 * en tres días: una invitación que se queda viva para siempre es una puerta
 * abierta de la que nadie se acuerda.
 */
import { sesionDe, aleatorio, igualesEnTiempoConstante, json } from '../../_acceso.js';

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

  const para = String(cuerpo?.para || '').trim().slice(0, 60);
  if (!para) return json({ ok: false, error: 'Falta para quién es' }, 400);

  const sesion = await sesionDe(db, request);
  let quien = sesion?.nombre;

  if (!sesion) {
    const maestra = env.ACCESO_BOOTSTRAP;
    // Sin la variable puesta, esta puerta no existe: no es que falle, es que
    // no se puede usar. Así el día que se borre queda cerrada de verdad.
    if (!maestra || !igualesEnTiempoConstante(String(cuerpo?.maestra || ''), maestra)) {
      return json({ ok: false, error: 'No autorizado' }, 403);
    }
    const hayGente = await db.prepare('SELECT 1 FROM personas WHERE activa = 1 LIMIT 1').first();
    if (hayGente) {
      return json({ ok: false, error: 'Ya hay personas dadas de alta: invita desde dentro' }, 403);
    }
    quien = 'bootstrap';
  }

  const codigo = aleatorio(32);
  await db
    .prepare("INSERT INTO invitaciones (codigo, para, creada_por, expira_en) VALUES (?, ?, ?, datetime('now', '+3 days'))")
    .bind(codigo, para, quien || null)
    .run();

  const url = new URL(request.url);
  return json({ ok: true, para, enlace: `${url.origin}/acceso?codigo=${codigo}`, caduca: '3 días' });
}

/**
 * Crea una invitación de un solo uso.
 *
 * Quien ya está dentro puede invitar.
 *
 * LA CLAVE MAESTRA ES UN ROMPER-EL-CRISTAL
 *
 * ACCESO_BOOTSTRAP vale siempre que esté puesta en las variables de
 * Cloudflare, no solo la primera vez. La primera versión solo la aceptaba
 * cuando no había nadie dado de alta, y eso dejaba una trampa: quien perdiera
 * su único aparato se quedaba fuera de su propio sitio, sin más salida que
 * entrar a la base de datos a mano.
 *
 * Que valga siempre no la debilita, porque la variable no existe salvo que
 * alguien la ponga: es una llave que se saca del cajón, se usa y se guarda.
 * El modo de uso es ese —ponerla, invitarse, quitarla— y está escrito en la
 * página de acceso para que no dependa de acordarse.
 *
 * No hay ninguna credencial escrita en el repositorio ni en la página.
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
    quien = 'clave maestra';
  }

  const codigo = aleatorio(32);
  await db
    .prepare("INSERT INTO invitaciones (codigo, para, creada_por, expira_en) VALUES (?, ?, ?, datetime('now', '+3 days'))")
    .bind(codigo, para, quien || null)
    .run();

  const url = new URL(request.url);
  return json({ ok: true, para, enlace: `${url.origin}/acceso?codigo=${codigo}`, caduca: '3 días' });
}

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

const INVITACIONES_VIVAS_MAX = 10;

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

  const sesion = await sesionDe(db, request);

  /* Un enlace para MI otro aparato.
     Sin esto, quien tiene dos teléfonos tenía que pedir una segunda
     invitación, y esa creaba una persona nueva: el mismo Miguel salía dos
     veces en la lista y no podía ver sus dos aparatos juntos. La otra salida
     era el código QR entre dispositivos, que funciona pero es un baile.

     Con la invitación atada a la persona, se abre el enlace en el segundo
     teléfono y la llave nueva cae en la misma cuenta. */
  const paraMiOtroAparato = !!cuerpo?.paraMi && !!sesion;

  const para = paraMiOtroAparato
    ? sesion.nombre
    : String(cuerpo?.para || '').trim().slice(0, 60);
  if (!para) return json({ ok: false, error: 'Falta para quién es' }, 400);

  let quien = sesion?.nombre;

  /* Invitar a OTRA persona es una facultad; añadir un aparato propio no.
     Antes bastaba con estar dentro, y entonces quien entraba podía invitar, y
     su invitado también: el círculo crecía solo sin que nadie lo decidiera.
     Añadir tu segundo teléfono sigue abierto para todos, porque eso no mete
     a nadie nuevo. */
  if (sesion && !paraMiOtroAparato) {
    const puede = await db
      .prepare('SELECT puede_invitar FROM personas WHERE id = ?')
      .bind(sesion.id)
      .first();
    if (!puede?.puede_invitar) {
      return json({ ok: false, error: 'Solo el dueño puede invitar a otras personas' }, 403);
    }
  }

  if (!sesion) {
    const maestra = env.ACCESO_BOOTSTRAP;
    // Sin la variable puesta, esta puerta no existe: no es que falle, es que
    // no se puede usar. Así el día que se borre queda cerrada de verdad.
    if (!maestra || !igualesEnTiempoConstante(String(cuerpo?.maestra || ''), maestra)) {
      return json({ ok: false, error: 'No autorizado' }, 403);
    }
    quien = 'clave maestra';
  }

  /* Un tope de invitaciones vivas por persona.
     Cada invitación es una puerta abierta tres días. Sin tope, un botón que
     se puede pulsar mil veces deja mil puertas, y las de `paraMi` las puede
     crear cualquiera que esté dentro. Diez a la vez sobran para el uso real
     —un segundo teléfono, un par de personas— y las usadas no cuentan. */
  const vivas = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM invitaciones
        WHERE usada_en IS NULL AND expira_en > datetime('now')
          AND creada_por IS ?`
    )
    .bind(quien || null)
    .first();
  if ((vivas?.n || 0) >= INVITACIONES_VIVAS_MAX) {
    return json(
      { ok: false, error: 'Tienes demasiadas invitaciones sin usar. Espera a que caduquen o que las usen.' },
      429
    );
  }

  const codigo = aleatorio(32);
  await db
    .prepare(
      `INSERT INTO invitaciones (codigo, para, creada_por, persona_id, expira_en)
       VALUES (?, ?, ?, ?, datetime('now', '+3 days'))`
    )
    .bind(codigo, para, quien || null, paraMiOtroAparato ? sesion.id : null)
    .run();

  const url = new URL(request.url);
  return json({
    ok: true,
    para,
    paraMi: paraMiOtroAparato,
    enlace: `${url.origin}/acceso?codigo=${codigo}`,
    caduca: '3 días',
  });
}

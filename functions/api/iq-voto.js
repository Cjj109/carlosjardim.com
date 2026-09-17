/**
 * "Esto me sirvió" / "esto no": el voto de quien preguntó.
 *
 * El banco de preguntas de scripts/probar-modelo.mjs son casos inventados por
 * quien lo escribió. Están bien, pero son suposiciones. Esto recoge lo que se
 * pregunta de verdad y si la respuesta valía, que es lo único que dice si el
 * prompt está mejorando o solo cambiando.
 *
 * Un voto negativo es más valioso que diez positivos: es un caso de prueba
 * ya escrito, con sus palabras reales, listo para meter en el banco.
 *
 * Se guarda con dueño para que se pueda borrar cuando alguien pide que lo
 * olviden. Anónimo sería más cómodo de justificar, pero entonces no habría
 * forma de cumplir esa petición.
 */
import { sesionDe, json } from '../_acceso.js';

const MAX_TEXTO = 600;

/* La misma comprobación de origen que el resto de endpoints que escriben. */
function mismoSitio(peticion) {
  const origen = peticion.headers.get('Origin');
  if (!origen) return true;
  try {
    return new URL(origen).host === new URL(peticion.url).host;
  } catch {
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.MONTOS;
  const sesion = await sesionDe(db, request);
  if (!sesion) return json({ ok: false, error: 'No autorizado' }, 401);
  if (!mismoSitio(request)) return json({ ok: false, error: 'Petición de otro sitio.' }, 403);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ ok: false, error: 'Cuerpo no válido.' }, 400);
  }

  const pregunta = String(cuerpo?.pregunta ?? '').trim().slice(0, MAX_TEXTO);
  const respuesta = String(cuerpo?.respuesta ?? '').trim().slice(0, MAX_TEXTO);
  // Estricto a propósito: un voto sin las dos cosas no sirve para repetir el
  // caso, y guardar un voto que no se puede reproducir es guardar ruido.
  if (!pregunta || !respuesta || typeof cuerpo?.acerto !== 'boolean') {
    return json({ ok: false, error: 'Falta qué se preguntó o qué se contestó.' }, 400);
  }

  try {
    await db
      .prepare('INSERT INTO iq_votos (persona_id, pregunta, respuesta, acerto) VALUES (?, ?, ?, ?)')
      .bind(sesion.id, pregunta, respuesta, cuerpo.acerto ? 1 : 0)
      .run();
    return json({ ok: true });
  } catch (e) {
    /* Que no se pueda guardar el voto no es motivo para molestar a nadie: la
       respuesta ya se dio y el voto es un extra. Se dice que no se guardó y la
       pantalla lo deja pasar en silencio. */
    console.warn('[60iq] no se pudo guardar el voto:', e?.message);
    return json({ ok: true, guardado: false });
  }
}

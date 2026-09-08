/**
 * La puerta. Se ejecuta antes que nada, en todas las peticiones del sitio.
 *
 * QUÉ SE CIERRA Y POR QUÉ ASÍ
 *
 * Cerrar solo /calculadora no habría servido de nada: los datos los sirve
 * /api/bcv, y quien los quisiera los pediría ahí directamente sin pasar por
 * la página. Una puerta delante de la vista y ninguna delante del dato es
 * sensación de seguridad, no seguridad. Así que se cierran los dos.
 *
 * La lista es de lo que SE CIERRA, no de lo que se abre. Al revés —una lista
 * de excepciones y todo lo demás cerrado— sería más estricto, pero este sitio
 * tiene una portada pública que debe seguir siéndolo, y una lista de permitidos
 * que se olvida de un archivo tumba la web entera sin avisar.
 *
 * Lo que queda fuera de la puerta a propósito:
 *   /acceso y /api/acceso/*   la propia puerta, que si no no se podría abrir
 *   /                          la portada, que sigue pública
 *   estilos, fuentes, iconos   los necesita la página de acceso
 */
import { sesionDe } from './_acceso.js';

/* /api/montos queda dentro aunque no sea una tasa: dice qué cantidades teclea
   la gente, y eso también es información de uso de la calculadora. */
const CERRADO = [
  /^\/calculadora(\/|$|\.html$)/,
  /^\/api\/bcv$/,
  /^\/api\/fuentes$/,
  /^\/api\/60iq$/,
  /^\/api\/montos$/,
];

const esCerrado = (ruta) => CERRADO.some((re) => re.test(ruta));

export async function onRequest(context) {
  const { request, env, next } = context;
  const ruta = new URL(request.url).pathname;

  if (!esCerrado(ruta)) return next();

  const db = env.MONTOS;
  const sesion = db ? await sesionDe(db, request) : null;

  if (sesion) {
    const respuesta = await next();
    // Nada de lo que hay detrás de la puerta se guarda en cachés
    // intermedias: no es público y no debe quedar copiado por el camino.
    const conCabeceras = new Response(respuesta.body, respuesta);
    conCabeceras.headers.set('Cache-Control', 'private, no-store');
    conCabeceras.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return conCabeceras;
  }

  /* A una petición de datos se le contesta con un 401 y no con una
     redirección: quien la hace es el JavaScript de la página, y una
     redirección le devolvería el HTML del acceso como si fuera la respuesta,
     que es un error de los que cuesta media tarde entender. */
  if (ruta.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false, error: 'Hace falta iniciar sesión' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const destino = new URL(request.url);
  return Response.redirect(`${destino.origin}/acceso?volver=${encodeURIComponent(ruta)}`, 302);
}

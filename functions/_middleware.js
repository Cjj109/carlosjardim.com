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
   la gente, y eso también es información de uso de la calculadora.

   Y los archivos de /data. Esto es lo que casi se me escapa: la puerta estaba
   puesta en la página y en los endpoints, pero las mismas tasas estaban
   además en tres archivos estáticos que Pages sirve tal cual. Uno traía la
   tasa del día, otro el USDT del p2p y el tercero UN AÑO de histórico. Toda
   la puerta se rodeaba escribiendo la dirección del archivo.

   bcv-liquidity.json se queda fuera de la lista a propósito: es masa
   monetaria que publica el propio banco central, no una tasa, y lo usa la
   portada pública. */
const CERRADO = [
  /^\/calculadora(\.html)?$/,
  /^\/api\/bcv$/,
  /^\/api\/fuentes$/,
  /^\/api\/60iq$/,
  /^\/api\/montos$/,
  /^\/data\/bcv-rates(-history)?\.json$/,
  /^\/data\/p2p\.json$/,
];

/**
 * Las formas en que se puede escribir la misma ruta.
 *
 * Aquí había dos agujeros de verdad, encontrados probando a rodear la puerta:
 * `/api/bcv/` con barra final y `/API/BCV` en mayúsculas devolvían las tasas
 * enteras sin sesión. Las expresiones exigían coincidencia exacta, pero
 * Cloudflare Pages enruta sin distinguir mayúsculas y tolera la barra: la
 * función se ejecutaba igual y el filtro no la reconocía.
 *
 * Como esta lista es de lo que se CIERRA, comparar contra más formas solo
 * puede cerrar más, nunca abrir de más. Por eso también se prueba la ruta
 * descodificada: si alguna vez Pages resolviera `%62` como `b`, ya está
 * cubierto.
 */
function variantes(ruta) {
  const limpiar = (r) => r.toLowerCase().replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  const formas = new Set([limpiar(ruta)]);
  try {
    formas.add(limpiar(decodeURIComponent(ruta)));
  } catch {
    // Mal codificada: con la cruda basta, y no vamos a rechazarla por eso
  }
  return [...formas];
}

const esCerrado = (ruta) => variantes(ruta).some((r) => CERRADO.some((re) => re.test(r)));

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
  if (ruta.toLowerCase().startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false, error: 'Hace falta iniciar sesión' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const destino = new URL(request.url);
  return Response.redirect(`${destino.origin}/acceso?volver=${encodeURIComponent(ruta)}`, 302);
}

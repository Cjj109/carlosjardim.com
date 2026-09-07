/**
 * Service worker de la calculadora.
 *
 * Dos politicas distintas, a proposito:
 *
 *   La app (html, css, js, fuentes, iconos) se guarda y se sirve desde
 *   memoria, para que abra al instante y funcione sin senal.
 *
 *   Las tasas se piden SIEMPRE a la red. Una tasa guardada es una tasa vieja,
 *   y en esto una cifra desactualizada es peor que ninguna. Solo si la red
 *   falla se recurre a la ultima respuesta, y la app avisa de cuando es.
 */

const VERSION = 'tasas-v50';

// Las direcciones llevan ?r=<version>, asi que esta lista tiene que ir a la
// par del HTML. Antes se precargaba /css/variables.css sin el parametro: la
// entrada guardada no coincidia con lo que la pagina pedia y nunca se usaba.
const REVISION = 50;
const APP = [
  '/calculadora',
  `/css/variables.css?r=${REVISION}`,
  `/css/calculadora.css?r=${REVISION}`,
  `/js/calculadora.js?r=${REVISION}`,
  '/fonts/inter-latin.woff2?v=175a01e7',
  // El ₮ del USDT sale en Inter desde que los números son Inter 800, así que
  // esta cara SÍ se pide: sin ella, sin conexión el símbolo caía a la fuente
  // del sistema al lado de números que sí tenían la suya.
  '/fonts/inter-latin-ext.woff2?v=35e36b76',
  '/fonts/jetbrains-mono-latin.woff2?v=cf32987d',
  '/fonts/jetbrains-mono-latin-ext.woff2?v=c9d70a4d',
  '/calculadora-app/icon-192.png',
  '/calculadora-app/icon-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      // addAll es todo o nada: si un solo archivo falla, la instalacion entera
      // se cae y la app se queda con la version anterior. Se guarda uno a uno
      // para que un icono que falte no tumbe el resto.
      .then((cache) => Promise.all(
        APP.map((url) => cache.add(url).catch(
          (error) => console.warn('No se pudo guardar', url, error)
        ))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

/** Guarda una copia, pero solo si la respuesta sirve */
function guardar(peticion, respuesta) {
  // Sin este filtro se guardaban tambien los 500 y los 404: una pagina de
  // error acababa en memoria y era lo que se servia despues sin senal.
  if (!respuesta || !respuesta.ok || respuesta.type === 'opaque') return;

  const copia = respuesta.clone();
  caches.open(VERSION)
    .then((cache) => cache.put(peticion, copia))
    .catch(() => { /* almacenamiento lleno: no pasa nada, se sigue con la red */ });
}

const sinConexion = () => new Response(
  JSON.stringify({ error: 'sin conexion' }),
  { status: 503, headers: { 'Content-Type': 'application/json' } }
);

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;

  const url = new URL(evento.request.url);
  if (url.origin !== self.location.origin) return;

  // Las tasas: red primero, y la copia solo como red de seguridad.
  //
  // La clave de la copia va sin los parametros de consulta. La app llevaba un
  // ?t=<milisegundos> para saltarse la cache, asi que cada peticion creaba una
  // entrada nueva: la memoria crecia sin freno —una por minuto— y la copia de
  // emergencia no se encontraba jamas, porque se buscaba por una direccion que
  // solo habia existido una vez.
  if (url.pathname.startsWith('/api/')) {
    const clave = new Request(url.origin + url.pathname);

    evento.respondWith(
      fetch(evento.request)
        .then((respuesta) => {
          guardar(clave, respuesta);
          return respuesta;
        })
        .catch(() => caches.match(clave).then((guardada) => guardada || sinConexion()))
    );
    return;
  }

  // La pantalla principal: red primero.
  //
  // Antes se servia de memoria y se actualizaba por detras, asi que un cambio
  // en la interfaz tardaba dos aperturas en verse: la primera devolvia lo
  // guardado. Para una app que se actualiza seguido eso confunde. Ahora se
  // pide a la red y solo se recurre a lo guardado si no hay senal, que es
  // justo cuando hace falta.
  if (evento.request.mode === 'navigate' || evento.request.destination === 'document') {
    evento.respondWith(
      fetch(evento.request)
        .then((respuesta) => {
          guardar(evento.request, respuesta);
          return respuesta;
        })
        .catch(() => caches.match(evento.request)
          .then((g) => g || caches.match('/calculadora'))
          .then((g) => g || Response.error()))
    );
    return;
  }

  // Lo demas —estilos, codigo, fuentes, iconos— si de memoria: lleva version
  // en la direccion, asi que cuando cambia, cambia la direccion.
  evento.respondWith(
    caches.match(evento.request).then((guardada) => {
      if (guardada) return guardada;

      return fetch(evento.request)
        .then((respuesta) => {
          guardar(evento.request, respuesta);
          return respuesta;
        })
        .catch(() => Response.error());
    })
  );
});

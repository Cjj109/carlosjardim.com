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

const VERSION = 'tasas-v63';

// Las direcciones llevan ?r=<version>, asi que esta lista tiene que ir a la
// par del HTML. Antes se precargaba /css/variables.css sin el parametro: la
// entrada guardada no coincidia con lo que la pagina pedia y nunca se usaba.
const REVISION = 63;
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

/**
 * Borra de memoria lo que hay detras de la puerta.
 *
 * Cerrar sesion mataba la cookie y dejaba el resto donde estaba: las ultimas
 * tasas, la pantalla de la calculadora y lo que el 60 IQ hubiera contestado
 * seguian guardados en el telefono. Sin senal, la copia de /calculadora se
 * servia igual —el 302 a /acceso no llega si no hay red— y quien tuviera el
 * aparato veia los datos de quien acababa de salir.
 *
 * La app (estilos, codigo, fuentes) no se toca: no dice nada de nadie y
 * volver a bajarla seria pagar el arranque otra vez.
 */
async function olvidarLoPrivado() {
  const cache = await caches.open(VERSION);
  const claves = await cache.keys();
  await Promise.all(
    claves
      .filter((p) => {
        const { pathname } = new URL(p.url);
        return pathname.startsWith('/api/') || pathname === '/calculadora';
      })
      .map((p) => cache.delete(p))
  );
}

self.addEventListener('message', (evento) => {
  if (evento.data !== 'salir') return;
  // El puerto de vuelta: la pagina espera a que esto termine antes de
  // recargar, porque recargar primero deja la purga a medias.
  evento.waitUntil(
    olvidarLoPrivado().then(() => evento.ports?.[0]?.postMessage('listo'))
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

  /* La puerta, nunca de memoria.
     Servir una pagina de acceso guardada es servir una version vieja del
     mecanismo que decide quien entra, y eso ya paso: el codigo de /acceso se
     quedo cacheado con la primera version del dia mientras cambiaba ocho
     veces, y la casilla de invitar no aparecia por eso. Una pantalla de
     entrada tiene que venir de la red siempre; si no hay red, no hay entrada,
     que es lo correcto. */
  if (url.pathname === '/acceso' || url.pathname.startsWith('/js/acceso.js')) return;

  // Las tasas: red primero, y la copia solo como red de seguridad.
  //
  // La clave de la copia va sin los parametros de consulta. La app llevaba un
  // ?t=<milisegundos> para saltarse la cache, asi que cada peticion creaba una
  // entrada nueva: la memoria crecia sin freno —una por minuto— y la copia de
  // emergencia no se encontraba jamas, porque se buscaba por una direccion que
  // solo habia existido una vez.
  if (url.pathname.startsWith('/api/')) {
    /* La memoria del 60 IQ no se guarda nunca.
       Son las notas que la maquina se apunta sobre una persona. Sin senal no
       hacen ninguna falta —no hay modelo al que preguntarle—, asi que
       guardarlas solo consigue dejarlas escritas en el disco del telefono. */
    if (url.pathname.startsWith('/api/iq-memoria')) return;

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

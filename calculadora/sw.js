/**
 * Service worker de la calculadora.
 *
 * Dos politicas distintas, a proposito:
 *
 *   La app (html, css, js, iconos) se guarda y se sirve desde memoria, para
 *   que abra al instante y funcione sin senal.
 *
 *   Las tasas se piden SIEMPRE a la red. Una tasa guardada es una tasa vieja,
 *   y en esto una cifra desactualizada es peor que ninguna. Solo si la red
 *   falla se recurre a la ultima respuesta, y la app avisa de cuando es.
 */

const VERSION = 'tasas-v1';
const APP = [
  '/calculadora/',
  '/calculadora/index.html',
  '/css/variables.css',
  '/css/calculadora.css?r=5',
  '/js/calculadora.js?r=5',
  '/calculadora/icon-192.png',
  '/calculadora/icon-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(APP))
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

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  if (evento.request.method !== 'GET') return;

  // Las tasas: red primero, y la copia solo como red de seguridad
  if (url.pathname.startsWith('/api/')) {
    evento.respondWith(
      fetch(evento.request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(evento.request, copia));
          return respuesta;
        })
        .catch(() => caches.match(evento.request))
    );
    return;
  }

  // La app: se sirve de memoria y se actualiza por detras
  if (url.origin === self.location.origin) {
    evento.respondWith(
      caches.match(evento.request).then((guardada) => {
        const desdeRed = fetch(evento.request)
          .then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              caches.open(VERSION).then((cache) => cache.put(evento.request, copia));
            }
            return respuesta;
          })
          .catch(() => guardada);

        return guardada || desdeRed;
      })
    );
  }
});

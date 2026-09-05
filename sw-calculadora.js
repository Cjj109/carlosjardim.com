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

const VERSION = 'tasas-v11';
const APP = [
  '/calculadora',
  '/css/variables.css',
  '/css/calculadora.css?r=15',
  '/js/calculadora.js?r=15',
  '/calculadora-app/icon-192.png',
  '/calculadora-app/icon-512.png',
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
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(evento.request, copia));
          return respuesta;
        })
        .catch(() => caches.match(evento.request).then((g) => g || caches.match('/calculadora')))
    );
    return;
  }

  // Lo demas —estilos, codigo, iconos— si de memoria: lleva version en la
  // direccion, asi que cuando cambia, cambia la direccion.
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

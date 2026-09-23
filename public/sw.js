// Trabajador de servicio mínimo, exigido por Chrome para poder instalar la
// aplicación desde el navegador.
//
// A propósito NO guarda nada en caché. La aplicación es de datos vivos: la
// planificación, las confirmaciones y las noticias cambian a diario, y una caché
// mal afinada serviría páginas viejas sin que nadie se diera cuenta. El manejador
// de `fetch` existe porque el criterio de instalación lo requiere, pero no llama a
// `respondWith`, así que cada petición sigue su camino normal por la red.
//
// Si algún día se quiere funcionamiento sin conexión, hay que diseñar la caché
// aparte, con versionado y una estrategia explícita por tipo de recurso.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', () => {});

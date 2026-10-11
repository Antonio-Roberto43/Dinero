// Service worker de Cuentas claras.
// Estrategia: red primero (siempre ves la última versión) y, si no hay conexión, la copia guardada.
// Solo toca archivos de este mismo sitio; Supabase y las librerías externas van siempre directas a la red.
// Si cambias archivos de la web, no hace falta tocar nada: se actualizan solos al abrir la app con conexión.
const CACHE = 'cuentas-claras-v1';
const BASE = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(r)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(r, copia)); }
        return res;
      })
      .catch(() => caches.match(r).then((m) => m || caches.match('index.html')))
  );
});

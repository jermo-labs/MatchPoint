/* Service worker — rend MatchPoint jouable hors-ligne une fois installé.

   Stratégie « cache puis mise à jour » : on répond tout de suite depuis le
   cache (lancement instantané, même sans réseau) et on rafraîchit la copie
   en arrière-plan ; la nouvelle version s'affiche au lancement suivant. */

const CACHE = "matchpoint-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/main.js",
  "./js/engine.js",
  "./js/data.js",
  "./manifest.webmanifest",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Une navigation vers le dossier de l'app est servie par index.html.
      const cached = (await cache.match(request)) || (request.mode === "navigate" ? await cache.match("./index.html") : undefined);
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return refresh;
    })
  );
});

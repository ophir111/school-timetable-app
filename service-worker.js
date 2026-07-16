const CACHE_NAME = "timetable-app-v6";

const APP_FILES = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_FILES);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(
            (name) => name !== CACHE_NAME
          )
          .map((name) => {
            return caches.delete(name);
          })
      );
    })
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
   * Timetable data must always come from the network.
   * The browser can still use its ordinary HTTP cache,
   * but the service worker will not trap old copies.
   */
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(fetch(request));
    return;
  }

  /*
   * For application files, prefer the network so updates
   * become available quickly. Use the cache offline.
   */
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          url.origin === self.location.origin
        ) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(
            (cache) => {
              cache.put(request, copy);
            }
          );
        }

        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});
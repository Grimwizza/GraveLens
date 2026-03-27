const CACHE_NAME = "gravelens-v2";
const STATIC_ASSETS = ["/", "/archive", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        // Tell every open tab that a new version is live so they can reload.
        self.clients.matchAll({ type: "window" }).then((clients) =>
          clients.forEach((client) =>
            client.postMessage({ type: "SW_UPDATED" })
          )
        )
      )
  );
});

self.addEventListener("fetch", (event) => {
  // Skip non-GET and API requests
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Cache successful navigation responses
          if (
            response.ok &&
            event.request.destination === "document"
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) =>
              cache.put(event.request, clone)
            );
          }
          return response;
        })
        .catch((error) => {
          console.error("SW fetch failed:", error);
          if (event.request.destination === "document") {
            return caches.match("/");
          }
          // For non-document requests, return a 408 Request Timeout
          return new Response("Network error", {
            status: 408,
            headers: { "Content-Type": "text/plain" },
          });
        });
    })
  );
});

/// <reference lib="WebWorker" />
/// <reference types="@serwist/next/typings" />

const MANIFEST = self.__SW_MANIFEST;

const precacheCacheName = `serwist-precache-${self.location.hostname}`;
const runtimeCacheName = `serwist-runtime-${self.location.hostname}`;

// Install event - precache assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(precacheCacheName);
      const urls = MANIFEST.map((entry) => (typeof entry === "string" ? entry : entry.url));
      await cache.addAll(urls);
      self.skipWaiting();
    })(),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith("serwist-") &&
              name !== precacheCacheName &&
              name !== runtimeCacheName,
          )
          .map((name) => caches.delete(name)),
      );
      self.clients.claim();
    })(),
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip for non-GET requests
  if (request.method !== "GET") return;

  // Skip for chrome extensions, etc.
  if (!url.protocol.startsWith("http")) return;

  // Skip for Next.js internal requests
  if (url.pathname.startsWith("/_next/")) return;

  event.respondWith(
    (async () => {
      // Try cache first
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise fetch from network
      try {
        const networkResponse = await fetch(request);
        // Cache the response for future
        const cache = await caches.open(runtimeCacheName);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch {
        // Network failed, try to return cached response even if expired
        return await caches.match(request);
      }
    })(),
  );
});

// Skip waiting on message
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

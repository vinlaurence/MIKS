const CACHE_NAME = "miks-shell-v54";
const APP_SHELL = [
  "/",
  "/index.html",
  "/favicon.ico",
  "/theme-init.js",
  "/styles.css",
  "/dist/app.js",
  "/dist/firebase-config.js",
  "/dist/firebase-service.js",
  "/dist/firebase-password-reset.js",
  "/icons/miks-logo.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
  "/404.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (asset) => {
      try {
        const response = await fetch(new Request(asset, { cache: "reload" }));
        if (response.ok) await cache.put(asset, response);
      } catch { /* Keep installing the remaining shell assets. */ }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const refreshFromNetwork = event.request.mode === "navigate" || url.pathname === "/dist/app.js" || url.pathname === "/styles.css" || url.pathname === "/favicon.ico";
  if (refreshFromNetwork) {
    event.respondWith(fetch(new Request(event.request, { cache: "reload" })).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(event.request)) || (await cache.match("/index.html")) || cache.match("/404.html");
    }));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached?.ok) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) void cache.put(event.request, response.clone());
      return response;
    } catch {
      return (await cache.match("/404.html")) || Response.error();
    }
  })());
});

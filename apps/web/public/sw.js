const messages = {
  en: {
    title: "Unable to connect",
    description: "Reconnect to the internet and try again.",
    retry: "Try again",
  },
  zh: {
    title: "暂时无法连接",
    description: "恢复网络连接后重试。",
    retry: "重试",
  },
};

function offlinePage() {
  const lang = self.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  const copy = messages[lang];
  return new Response(
    `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${copy.title} · Raypx</title>
  <style>
    :root { color-scheme: light dark; font: 16px system-ui, sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { box-sizing: border-box; display: grid; place-content: center; justify-items: center;
      gap: 1rem; min-height: 100vh; min-height: 100dvh; max-width: 28rem; margin: auto;
      padding: 1.5rem; text-align: center; }
    .offline-icon { display: grid; place-items: center; box-sizing: border-box;
      width: 3rem; height: 3rem; border-radius: .75rem;
      background: color-mix(in srgb, CanvasText 7%, Canvas); }
    .message { display: grid; gap: .5rem; }
    h1 { margin: 0; font-size: 1.5rem; font-weight: 600; }
    p { margin: 0; line-height: 1.5; }
    a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 1rem;
      border-radius: .5rem; background: CanvasText; color: Canvas; font-size: .875rem;
      font-weight: 500; text-decoration: none; }
    @media (hover: hover) {
      a:hover { background: color-mix(in srgb, CanvasText 80%, Canvas); }
    }
    @media (prefers-reduced-motion: no-preference) {
      a { transition: background-color 150ms ease-out, transform 150ms ease-out; }
      a:active { transform: translateY(1px); }
    }
    a:focus-visible { outline: 2px solid CanvasText; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <div class="offline-icon" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8.5 14.5c1.12-1.11 2.46-1.61 4-1.48m6-1.52A10.75 10.75 0 0 0 13.5 9m-8 2.5A10.7 10.7 0 0 1 9 9.5m13-1a15 15 0 0 0-12.5-3.76M2 8.5A15 15 0 0 1 5.5 6M2 2l20 20"/>
        <circle cx="12" cy="18" r="1.5"/>
      </svg>
    </div>
    <div class="message">
      <h1>${copy.title}</h1>
      <p>${copy.description}</p>
    </div>
    <a href="">${copy.retry}</a>
  </main>
</body>
</html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}

// The fallback is embedded. Activating the worker does not replace any app assets.
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (
    request.mode !== "navigate" ||
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(fetch(request).catch(offlinePage));
});

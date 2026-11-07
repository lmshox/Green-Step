// Yashil Qadam service worker: lets the site open and work without internet.
// Strategy: always try the network first (so updates show up straight away),
// and fall back to the saved copy when offline.
const CACHE = "yq-shell-v2";
const SHELL = [
  "./", "index.html", "app.html", "manifest.webmanifest",
  "css/styles.css", "css/app.css",
  "js/i18n.js", "js/site.js", "js/story.js", "js/app.js", "js/backend.js", "js/yq-data.js",
  "js/firebase-config.js", "js/vendor/firebase.js",
  "assets/logo.svg", "assets/icon-192.png", "assets/icon-512.png",
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return; // Firebase etc. handle their own offline mode

  e.respondWith(
    // "no-cache" checks with the server every time (cheap when nothing changed), so updates show immediately.
    fetch(sameOrigin ? new Request(req, { cache: "no-cache" }) : req)
      .then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) =>
          hit || (req.mode === "navigate" ? caches.match("app.html") : undefined)
        )
      )
  );
});

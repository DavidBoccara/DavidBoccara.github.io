// Service worker de Plane GO : l'appli s'ouvre même sans réseau, et un clic sur une
// notification ouvre la fiche de l'avion.
const CACHE = "planego-1f6a21aa7a579fc699648a541e769adcc0a33e7b";
const SHELL = [
  "./",
  "icons/apple-touch-icon.png",
  "icons/avatar.svg",
  "icons/badge-96.png",
  "icons/badge.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon.svg",
  "icons/logo.svg",
  "icons/maskable-512.png",
  "index.html",
  "js/app.js",
  "js/catalog-data.js",
  "js/census.js",
  "js/cloud.js",
  "js/compass.js",
  "js/config.js",
  "fonts/ibm-plex-sans-latin-400-normal.woff2",
  "fonts/ibm-plex-sans-latin-500-normal.woff2",
  "fonts/ibm-plex-sans-latin-600-normal.woff2",
  "fonts/ibm-plex-mono-latin-400-normal.woff2",
  "fonts/ibm-plex-mono-latin-500-normal.woff2",
  "js/data.js",
  "js/game.js",
  "js/native.js",
  "js/net.js",
  "js/quizkit.js",
  "js/radar.js",
  "js/screens/aircraft.js",
  "js/screens/auth.js",
  "js/screens/catalog.js",
  "js/screens/collection.js",
  "js/screens/comments.js",
  "js/screens/contest.js",
  "js/screens/daily.js",
  "js/screens/feed.js",
  "js/screens/friends.js",
  "js/screens/grades.js",
  "js/screens/hangar.js",
  "js/screens/practice.js",
  "js/screens/privacy.js",
  "js/screens/legal.js",
  "js/ads.js",
  "js/wikiquiz.js",
  "js/screens/profile.js",
  "js/screens/quiz.js",
  "js/screens/scanner.js",
  "js/store.js",
  "js/supa.js",
  "js/ui.js",
  "js/sharecard.js",
  "js/update.js",
  "js/camera.js",
  "js/photorules.js",
  "js/contact.js",
  "pages.css",
  "js/screens/flyby.js",
  "js/worldmap.js",
  "js/worldmap-data.js",
  "js/report.js",
  "js/blocks.js",
  "js/credits.js",
  "js/util.js",
  "js/sound.js",
  "js/i18n.js",
  "js/en.js",
  "js/verify.js",
  "js/skynet.js",
  "js/skyworker.js",
  "models/sky-ege.json",
  "models/sky-ege.bin",
  "models/LICENSE-sky.txt",
  "manifest.webmanifest",
  "styles.css",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Fichiers de l'appli : réseau d'abord (toujours la dernière version), cache si hors ligne.
// Données (ADS-B, Supabase, Wikipédia…) : jamais mises en cache ici.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/__camera/")) return; // photos de l'appareil photo, servies par l'appli Android
  // « no-cache » : toujours redemander au serveur s'il y a plus récent (GitHub Pages garde sinon les fichiers 10 min
  // dans le navigateur, et l'ancienne version restait affichée après une mise à jour)
  const fresh = e.request.mode === "navigate" ? fetch(e.request.url, { cache: "no-cache", credentials: "same-origin", redirect: "manual" })
    : fetch(e.request, { cache: "no-cache" });
  e.respondWith(fresh.then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./"))));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hex = e.notification.data?.hex;
  const target = hex ? "ac/" + hex : "scanner";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const c = list[0];
    if (c) { c.postMessage({ open: target }); return c.focus(); }
    return self.clients.openWindow("./#" + target);
  }));
});

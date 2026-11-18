// Service worker de Jeudi Sherboy :
// 1. garde une copie de l'app pour qu'elle s'ouvre vite, même avec un mauvais réseau;
// 2. affiche les notifications des rappels quand l'app est fermée.
importScripts("config.js");
const CACHE = "jeudi-sherboy-v2";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "data.js", "gazette.js", "poker.js", "gages.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord pour avoir toujours la dernière version; la copie sert seulement hors ligne.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // « no-cache » : on demande toujours au serveur si le fichier a changé, pour que tout le monde ait la dernière version.
  e.respondWith(fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});

// Ouvre l'app quand on touche une notification.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && (e.notification.data.FCM_MSG?.notification?.click_action || e.notification.data.link)) || self.registration.scope;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope) && "focus" in w) return w.focus();
    return clients.openWindow(url);
  }));
});

const cfg = self.JS_CONFIG;
if (cfg && !JSON.stringify(cfg.firebase).includes("A_REMPLIR")) {
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
                "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
  firebase.initializeApp(cfg.firebase);
  firebase.messaging(); // affiche automatiquement les notifications envoyées par les rappels
}

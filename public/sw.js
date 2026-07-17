/* Minimaler Service Worker — installierbare App-Shell, offline-fähig, aber ohne
   aggressive Offline-Logik (Geräte sind praktisch immer online):
   - HTML/Navigation: network-first → neue Deploys (mit neuen Asset-Hashes) laden
     sofort; offline fällt es auf die zwischengespeicherte Shell zurück.
   - Statische Assets (content-hashed, immutable): cache-first, sonst holen+cachen.
   Kein Datenpfad, keine API-Caches (Git-Sync läuft nie über den SW). */
const CACHE = "kd-shell-v1";

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // nie fremde Origins (v. a. api.github.com)

  const istHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (istHTML) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE); c.put(req, res.clone()); return res;
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match(req)) || (await c.match("./")) || (await c.match("index.html")) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) return hit;
    try { const res = await fetch(req); if (res && res.ok) c.put(req, res.clone()); return res; }
    catch { return hit || Response.error(); }
  })());
});

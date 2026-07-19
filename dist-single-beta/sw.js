/* Minimaler Service Worker — installierbare App-Shell, offline-fähig, aber ohne
   aggressive Offline-Logik (Geräte sind praktisch immer online):
   - HTML/Navigation: network-first → neue Deploys (mit neuen Asset-Hashes) laden
     sofort; offline fällt es auf die zwischengespeicherte Shell zurück.
   - .json-Datendateien (programm.json, streaming_*.json — ungehasht, ändern sich
     bei jedem Daten-Job): ebenfalls network-first. Cache-first würde sie nach dem
     ersten Fetch dauerhaft einfrieren.
   - Statische Assets (content-hashed, immutable): cache-first, sonst holen+cachen.
   Kein API-Cache (Git-Sync/api.github.com läuft nie über den SW).
   Cache-Name versioniert: Bump räumt beim activate alle Altbestände weg. */
const CACHE = "kd-shell-v2";

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
  const istDaten = url.pathname.endsWith(".json"); // ungehashte Datendateien
  if (istHTML || istDaten) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        // Nur echte Erfolge cachen — eine 404-/Fehlerseite darf nie zum Offline-Fallback werden.
        if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
        return res;
      } catch {
        const c = await caches.open(CACHE);
        const hit = await c.match(req);
        if (hit) return hit;
        if (istHTML) return (await c.match("./")) || (await c.match("index.html")) || Response.error();
        return Response.error();
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

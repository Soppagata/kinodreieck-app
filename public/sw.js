/* Minimaler Service Worker — installierbare App-Shell, offline-fähig, aber ohne
   aggressive Offline-Logik (Geräte sind praktisch immer online):
   - HTML/Navigation: network-first → neue Deploys (mit neuen Asset-Hashes) laden
     sofort; offline fällt es auf die zwischengespeicherte Shell zurück.
   - .json-Datendateien (programm.json, streaming_*.json — ungehasht, ändern sich
     bei jedem Daten-Job): ebenfalls network-first. Cache-first würde sie nach dem
     ersten Fetch dauerhaft einfrieren.
   - Statische Assets (content-hashed, immutable): cache-first, sonst holen+cachen.
   Kein API-, Auth- oder Download-Cache. Fremde App-Caches (zum Beispiel der
   getrennte Katalog-Fallback) werden beim Update nicht gelöscht.
   Cache-Name wird beim Online-Build an den Commit gebunden: jeder Deploy hat
   genau eine App-Shell, alte Shells werden beim Aktivieren entfernt. */
const CACHE_PREFIX = "kd-shell-";
const BUILD_VERSION = "__KD_BUILD_VERSION__";
const CACHE = `kd-shell-v3-${BUILD_VERSION}`;
/* Nutzerinitiierte Android-Diagnose: Diese eine markierte Anfrage darf das
   Netzwerk absichtlich nicht berühren. So wird nach einem erfolgreichen
   Online-Lauf geprüft, ob die aufgelöste Start-URL wirklich aus der App-Shell
   beantwortet werden kann; eine bloße Cache-API-Verfügbarkeit genügt nicht. */
const OFFLINE_PROBE_HEADER = "x-kd-offline-probe";
/* Der Online-Build ergänzt hier die gehashten CSS-/JS-Dateien aus index.html. */
const PRECACHE = ["./", "index.html", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const scope = self.registration.scope;
    const shell = PRECACHE.map((pfad) => new URL(pfad, scope));
    await Promise.all(shell.map(async (url) => {
      try {
        const res = await fetch(url);
        if (res && res.ok) await c.put(url, res.clone());
      } catch { /* Erstinstallation bleibt auch bei kurzem Offline-Zustand möglich. */ }
    }));
    /* Der neue Worker darf übernehmen; die bereits geladene Seite navigiert
       jedoch erst nach dem sichtbaren Aktualisieren-Hinweis neu. */
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    fenster.forEach((client) => client.postMessage({
      type: "KD_BUILD_ACTIVATED",
      buildVersion: BUILD_VERSION,
    }));
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // nie fremde Origins (z. B. Datenbank- und Auth-Endpunkte)

  const istHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  const istOfflineProbe = req.headers.get(OFFLINE_PROBE_HEADER) === "1";
  const istDaten = url.pathname.endsWith(".json"); // ungehashte Datendateien
  const istBuildMeta = url.pathname.endsWith("/build-meta.json");
  const istNetzwerkNur = istBuildMeta
    || /\/(?:api|auth|download)\//.test(url.pathname)
    || req.headers.has("authorization")
    || req.headers.has("apikey")
    || (req.headers.get("cache-control") || "").includes("no-store");
  if (istOfflineProbe) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(url.href);
      if (hit) return hit;
      if (istHTML) return (await c.match("./")) || (await c.match("index.html")) || Response.error();
      return Response.error();
    })());
    return;
  }
  if (istNetzwerkNur) {
    e.respondWith(fetch(req));
    return;
  }
  if (istHTML || istDaten) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        // Nur echte Erfolge cachen — eine 404-/Fehlerseite darf nie zum Offline-Fallback werden.
        if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); return res; } // KD-025
        // KD-025: erreichbarer, aber fehlerhafter Server (404/500/captive-portal) hebelt sonst den Offline-Fallback aus — gueltige Cache-Kopie schlaegt die Fehler-Response.
        const c = await caches.open(CACHE);
        const hit = await c.match(req);
        return hit || res;
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
    // KD-026: stale-while-revalidate — Cache-Treffer sofort liefern, parallel im Hintergrund neu holen und den Cache aktualisieren (Netzwerkfehler ignorieren), damit ungehashte public-Assets (Icons, manifest) nicht bis zum Cache-Bump stale bleiben. Gehashte Vite-Assets liefern dabei identische Bytes.
    const netz = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null); // KD-026
    if (hit) { e.waitUntil(netz); return hit; } // KD-026: Treffer sofort, Revalidierung laeuft im Hintergrund weiter
    return (await netz) || Response.error();
  })());
});

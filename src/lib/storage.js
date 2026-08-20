/* ---------- Storage: Treiber-Modell (Phase 3a) ----------
   `store` behält die bisherige async-Signatur (get/set/delete/list) exakt bei —
   jeder Aufrufer bleibt unverändert. Intern delegiert `store` an den AKTIVEN
   Treiber. Default ist der lokale Treiber (localStorage) = heutiges Verhalten.
   Phase 3b hängt hier einen Git-Treiber ein, ohne einen einzigen Aufrufer zu
   ändern. Die async-Signatur ist der Ankerpunkt: der portierte Code awaitet
   bereits, ein Netzwerk-Treiber passt damit ohne Umbau dahinter. */

/* Lokaler Treiber: exakt das bisherige localStorage-Verhalten. */
export const localDriver = {
  name: "lokal",
  owner: "guest-local",
  async get(k) {
    const v = localStorage.getItem(k);
    return v === null ? null : { key: k, value: v };
  },
  async set(k, v) {
    localStorage.setItem(k, v);
    return { key: k, value: v };
  },
  async delete(k) {
    localStorage.removeItem(k);
    return { key: k, deleted: true };
  },
  async list(prefix = "") {
    return { keys: Object.keys(localStorage).filter((x) => x.startsWith(prefix)) };
  },
};

let activeDriver = localDriver;
let storageContextGeneration = 0;
const storageContextListeners = new Set();

function storageContextError() {
  const error = new Error("Der Speicherkontext hat sich während des Auftrags geändert.");
  error.code = "STORAGE_CONTEXT_CHANGED";
  return error;
}

/* Ein asynchroner Mehrschritt-Auftrag darf nicht erst beim späteren Abarbeiten
   neu entscheiden, welcher Treiber gemeint ist. Der Kontext bindet ihn an den
   beim Start aktiven Treiber UND dessen Aktivierungsgeneration. Die Prüfung
   nach dem await verhindert außerdem, dass ein bestätigter Stand aus Konto A
   nach einem Wechsel noch in die Anzeige von Konto B übernommen wird. */
export function captureStorageContext() {
  const driver = activeDriver;
  const generation = storageContextGeneration;
  const isCurrent = () => activeDriver === driver && storageContextGeneration === generation;
  const run = async (method, args) => {
    if (!isCurrent() || typeof driver?.[method] !== "function") throw storageContextError();
    const result = await driver[method](...args);
    if (!isCurrent()) throw storageContextError();
    return result;
  };
  return Object.freeze({
    generation,
    name: driver?.name || "unbekannt",
    owner: String(driver?.owner || `driver:${driver?.name || "unbekannt"}`),
    isCurrent,
    get: (key) => run("get", [key]),
    set: (key, value) => run("set", [key, value]),
    delete: (key) => run("delete", [key]),
    list: (prefix = "") => run("list", [prefix]),
    /* Auch ein frischer Pull gehört zu demselben gebundenen Auftrag. Ohne
       diese Grenze könnte ein Konto-/Treiberwechsel zwischen Pull und Reads
       zwei persönliche Datenräume in ein Backup mischen. */
    pull: () => {
      if (typeof driver?.pull === "function") return run("pull", []);
      if (!isCurrent()) return Promise.reject(storageContextError());
      return Promise.resolve({ ok: true, noop: true });
    },
  });
}

export function storageContextGenerationSnapshot() { return storageContextGeneration; }
export function storageOwnerKennung() {
  return String(activeDriver?.owner || `driver:${activeDriver?.name || "unbekannt"}`);
}
export function subscribeStorageContext(listener) {
  storageContextListeners.add(listener);
  return () => storageContextListeners.delete(listener);
}

/* Treiber wechseln (Phase 3b). null/undefined => zurück auf lokal. */
export function setStorageDriver(driver) {
  activeDriver = driver || localDriver;
  storageContextGeneration++;
  for (const listener of [...storageContextListeners]) {
    try { listener(); } catch { /* Ein Beobachter darf den Treiberwechsel nie blockieren. */ }
  }
}
export function storageDriverName() {
  return activeDriver.name;
}

/* Driver-agnostischer Sync-Status: liefert den Status des AKTIVEN Treibers, damit
   Chip/Vertrauens-Zeile Git ODER Supabase anzeigen, ohne einen Treiber hart zu
   importieren. Treiber ohne Sync (lokal): neutraler Default. */
export function activeSyncStatus() {
  try {
    if (activeDriver && typeof activeDriver.status === "function") return activeDriver.status();
  } catch { /* Treiber-Status best effort */ }
  return { lastPull: null, lastCommit: null, pending: [], conflict: [], stale: [], configured: false };
}

/* Driver-agnostischer Pull: erzwingt einen frischen Pull des AKTIVEN Treibers
   (z.B. vor dem Backup-Export). Treiber ohne Sync (lokal): No-op. */
export async function activePull() {
  try { if (activeDriver && typeof activeDriver.pull === "function") return await activeDriver.pull(); }
  catch (e) { return { ok: false, error: String(e) }; }
  return { ok: true, noop: true };
}

/* Explizite Dauerhaftigkeitsbarriere für Mehrtopf-Operationen wie Restore.
   Normale UI-Schreibvorgänge bleiben weiterhin sofort lokal und übertragen im
   Hintergrund. */
export async function activeSyncFlush() {
  try {
    if (activeDriver && typeof activeDriver.syncFlush === "function") {
      return { ok: true, ergebnisse: await activeDriver.syncFlush() };
    }
  } catch (e) { return { ok: false, error: String(e), ergebnisse: [] }; }
  return { ok: true, noop: true, ergebnisse: [] };
}

/* Read-only Inventur der aktiven Kontoablage. Treiber ohne Konto-Inventur
   melden einen ehrlichen No-op statt eine scheinbar verifizierte Übertragung. */
export async function activeSyncInventur() {
  try {
    if (activeDriver && typeof activeDriver.inventur === "function") {
      return await activeDriver.inventur();
    }
  } catch (e) { return { ok: false, error: String(e), zeilen: {} }; }
  return { ok: true, noop: true, zeilen: {} };
}

/* Treiber-Wahl (Block 2): "git" | "supabase" | null(=bisheriges Verhalten). */
export function getTreiber() { try { return localStorage.getItem("kd:treiber"); } catch { return null; } }
export function setTreiber(name) {
  try { if (name) localStorage.setItem("kd:treiber", name); else localStorage.removeItem("kd:treiber"); }
  catch { /* Storage best effort */ }
}

/* Fassade: unveränderte Signatur, delegiert an den aktiven Treiber. */
export const store = {
  get(k) { return activeDriver.get(k); },
  set(k, v) { return activeDriver.set(k, v); },
  delete(k) { return activeDriver.delete(k); },
  list(prefix = "") {
    return activeDriver.list ? activeDriver.list(prefix) : Promise.resolve({ keys: [] });
  },
};

/* ---------- Storage-Keys ---------- */
export const K = {
  master: "kd:master",
  programm: "kd:programm-cache",
  artikel: "kd:artikel",             // Blog-Bereich (Phase 2)
  streamingDienste: "kd:streaming-dienste", // Anzeigefilter (Checkboxen) — Fetch steuert streaming_config.json
  merkliste: "kd:merkliste",         // Entdecken-Merkliste (Übergabepunkt an den Daten-Chat)
  exportStand: "kd:export-stand",    // Export-Wächter: wann zuletzt Master/Artikel exportiert
  zeitgrenze: "kd:zeitgrenze",       // Kino-Tab: Zeitfilter für "Läuft auch" (Default 14:00)
  kinoPins: "kd:kino-pins",          // Angepinnte Kinotermine [{t,j,z,seit}] — Basis fürs Dashboard-Pinboard
  wochenplan: "kd:wochenplan",        // Persönlicher Folgen-/Staffelkalender {version,eintraege[]}
  radar: "kd:radar",                  // Lokaler Event-Radar: Gastabos oder accountgebundener Cache/Outbox/Receipts
  autorName: "kd:autor-name",        // Teilen & Tauschen: steht in jedem Paket-Export und im KI-Prompt
  entdeckenStatus: "kd:entdecken-status", // {watchmode_id: "gesehen"|"erstellt"} — Erledigtes im Entdecken ausblenden
  einstellungen: "kd:einstellungen",  // {theme, startTab, schrift, modus, entdeckenTaeglich}
  filterMediathek: "kd:filter-mediathek", // Mediathek-Filtermenü auf/zu (Sicht-Präferenz, "0"=zu)
  filterKino: "kd:filter-kino",       // Kino-Filtermenü auf/zu (Sicht-Präferenz, "0"=zu)
  filterStreaming: "kd:filter-streaming", // Streaming-Filterleiste auf/zu (Sicht-Präferenz, "0"=zu)
  vokabular: "kd:vokabular",          // eigene Stimmungswörter für die Suche [{wort, genres[], tags[]}]
  mustwatch: "kd:mustwatch",          // Must-Watch-Liste (eigener persönlicher Topf) — ersetzt das must_watch-Flag
  start: "kd:start",                  // Beta-Startwahl: "demo" (Schaufenster) | "clean" (leer) — steuert Boot-Fallback & Reset
  startVersion: "kd:start-version",   // bestätigt, dass die Wahl im aktuellen Demo-Onboarding bewusst getroffen wurde
  startAuftrag: "kd:start-auftrag",   // zuletzt verbrauchter Installer-Token — verhindert erneutes Löschen beim Reload
  einstieg: "kd:einstieg",            // versionierter Ersteinstieg {version, abgeschlossen, weg}
  treiber: "kd:treiber",              // Storage-Treiber-Wahl: "git" | "supabase" (fehlt => bisheriges Verhalten)
  achievements: "kd:achievements",    // Egg-Achievements (eigener Sync-/Backup-Topf, Block 3): Set freigeschalteter Egg-IDs
  katalogKey: "kd:katalog:key",       // vom Tester eingegebener Supabase-Publishable-Key (nur Lesen)
  katalogUrl: "kd:katalog:url",       // lokaler URL-Fallback; im Pages-Build vorbelegt
  demoSeed: "kd:demo-seed",           // IDs/Schlüssel der geladenen Demo-Beilage für gezieltes Entfernen
  geschmacksprofil: "kd:geschmacksprofil", // Etappe 7: strukturiertes, versioniertes Geschmacksprofil (Sync-Topf; Register: personalDataRegistry)
};

export const PROGRAMM_TTL_MS = 24 * 60 * 60 * 1000; // 24h

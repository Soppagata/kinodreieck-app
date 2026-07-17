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

/* Treiber wechseln (Phase 3b). null/undefined => zurück auf lokal. */
export function setStorageDriver(driver) {
  activeDriver = driver || localDriver;
}
export function storageDriverName() {
  return activeDriver.name;
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
  autorName: "kd:autor-name",        // Teilen & Tauschen: steht in jedem Paket-Export und im KI-Prompt
  entdeckenStatus: "kd:entdecken-status", // {watchmode_id: "gesehen"|"erstellt"} — Erledigtes im Entdecken ausblenden
  einstellungen: "kd:einstellungen",  // {theme, startTab, schrift, kurosawa}
  filterMediathek: "kd:filter-mediathek", // Mediathek-Filtermenü auf/zu (Sicht-Präferenz, "0"=zu)
  filterKino: "kd:filter-kino",       // Kino-Filtermenü auf/zu (Sicht-Präferenz, "0"=zu)
  vokabular: "kd:vokabular",          // eigene Stimmungswörter für die Suche [{wort, genres[], tags[]}]
  start: "kd:start",                  // Beta-Startwahl: "demo" (Schaufenster) | "clean" (leer) — steuert Boot-Fallback & Reset
  startAuftrag: "kd:start-auftrag",   // zuletzt verbrauchter Installer-Token — verhindert erneutes Löschen beim Reload
};

export const PROGRAMM_TTL_MS = 24 * 60 * 60 * 1000; // 24h

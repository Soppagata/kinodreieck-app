/* SessionCoordinator — reine Zustandsprüfung ohne Netz.
   Belegt die Grenze zwischen „angemeldet“ und „Kontospeicher bestätigt“:
   Vor der Übernahme bleibt der Alltagsspeicher lokal; Ablauf und Logout
   deaktivieren ihn zuverlässig. */

const { createSessionCoordinator, STORAGE_SESSION_STATES } =
  await import("./src/services/sessionCoordinator.js");

let ok = 0;
function check(name, value) {
  if (!value) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

function session(id = null) {
  return id
    ? { mode: "account", state: "ready", account: { id } }
    : { mode: "guest", state: "ready", account: null };
}

function aufbau({
  start = session(),
  initializeTo = null,
  signInTo = null,
  refreshTo = null,
  owner = null,
  confirmed = [],
  signOutThrows = false,
  syncStatus = { pending: [], conflict: [], zuGross: [] },
} = {}) {
  let snapshot = start;
  const listeners = new Set();
  const calls = [];
  let active = false;
  let prepared = null;

  const auth = {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async initialize() {
      if (initializeTo) snapshot = initializeTo;
      listeners.forEach((fn) => fn(snapshot));
      return snapshot;
    },
    async signIn() {
      snapshot = signInTo || session("konto-login");
      listeners.forEach((fn) => fn(snapshot));
      return snapshot;
    },
    async signOut() {
      calls.push(["auth-signout"]);
      snapshot = session();
      listeners.forEach((fn) => fn(snapshot));
      if (signOutThrows) throw new Error("logout-netz");
      return snapshot;
    },
    async refresh() {
      if (refreshTo) snapshot = refreshTo;
      listeners.forEach((fn) => fn(snapshot));
      return snapshot;
    },
    async changePassword(value) { return { ok: true, value }; },
  };
  const storage = {
    prepare(id) { calls.push(["prepare", id]); prepared = id; active = false; },
    confirm(id) { calls.push(["confirm", id]); prepared = id; active = true; },
    deactivate() { calls.push(["deactivate"]); prepared = null; active = false; },
    active: () => active,
    preparedAccountId: () => prepared,
    cacheOwner: () => owner,
    async pull() { calls.push(["pull"]); return { ok: true }; },
    async flush() { calls.push(["flush"]); return []; },
    status: () => syncStatus,
  };
  const coordinator = createSessionCoordinator({
    auth,
    storage,
    adoption: {
      isConfirmed: (id) => confirmed.includes(id),
      restoreGuest: (id) => calls.push(["restore", id]),
    },
  });
  return { coordinator, calls, storage, auth };
}

{
  const a = aufbau({
    start: session("konto-A"),
    owner: "konto-A",
    confirmed: ["konto-A"],
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  await a.coordinator.signOut();
  check("Logout sendet ausstehende Kontoänderungen und stellt danach den Gastcache her",
    JSON.stringify(a.calls) === JSON.stringify([
      ["flush"], ["auth-signout"], ["deactivate"], ["restore", "konto-A"],
    ]));
}

{
  const a = aufbau({
    start: session("konto-A"),
    owner: "konto-A",
    confirmed: ["konto-A"],
    syncStatus: { pending: ["kd:master"], conflict: [], zuGross: [] },
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  let geworfen = false;
  try { await a.coordinator.signOut(); } catch { geworfen = true; }
  check("Ungesicherte Kontoänderungen blockieren den Logout ohne Cacheverlust",
    geworfen
      && JSON.stringify(a.calls) === JSON.stringify([["flush"]])
      && a.coordinator.getSnapshot().mode === "account");
}

{
  const a = aufbau({ start: session("konto-A"), owner: null, confirmed: [] });
  await a.coordinator.initialize();
  a.calls.length = 0;
  await a.coordinator.signOut();
  check("Ein noch nicht übernommener lokaler Gaststand wird beim Logout nicht gelöscht",
    !a.calls.some(([name]) => name === "restore")
      && a.calls.some(([name]) => name === "deactivate"));
}

{
  const a = aufbau({ initializeTo: session() });
  await a.coordinator.initialize();
  check("Gaststart deaktiviert jeden Kontotreiber",
    a.calls.some(([name]) => name === "deactivate")
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.GUEST);
}

{
  const a = aufbau({ initializeTo: session(), owner: "altes-konto" });
  await a.coordinator.initialize();
  check("Gaststart bereinigt einen vom alten Logout verwaisten Kontocache",
    JSON.stringify(a.calls) === JSON.stringify([
      ["deactivate"], ["restore", "altes-konto"],
    ])
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.GUEST);
}

{
  const a = aufbau({ initializeTo: session("konto-A"), owner: null, confirmed: [] });
  await a.coordinator.initialize();
  check("Unbestätigtes Konto wird nur für die Inventur vorbereitet",
    JSON.stringify(a.calls) === JSON.stringify([["prepare", "konto-A"]])
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.AWAITING_ADOPTION);
}

{
  const a = aufbau({
    initializeTo: session("konto-A"),
    owner: "konto-A",
    confirmed: ["konto-A"],
  });
  await a.coordinator.initialize();
  check("Bestätigtes Konto wird beim Boot aktiviert und einmal abgeglichen",
    JSON.stringify(a.calls) === JSON.stringify([
      ["prepare", "konto-A"], ["confirm", "konto-A"], ["pull"],
    ])
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.READY);
}

{
  const a = aufbau({
    start: session("konto-A"),
    refreshTo: session(),
    owner: "konto-A",
    confirmed: ["konto-A"],
  });
  await a.coordinator.refresh();
  check("Abgelaufene Sitzung deaktiviert den Kontospeicher und trennt den Kontocache",
    JSON.stringify(a.calls) === JSON.stringify([
      ["deactivate"], ["restore", "konto-A"],
    ])
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.GUEST);
}

{
  const a = aufbau({
    start: session("konto-A"),
    signInTo: session("konto-B"),
    owner: "konto-A",
    confirmed: ["konto-A"],
  });
  await a.coordinator.signIn("b", "pw");
  check("Kontowechsel bereitet B vor, bestätigt oder pullt aber nicht automatisch",
    JSON.stringify(a.calls) === JSON.stringify([["prepare", "konto-B"]])
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.AWAITING_ADOPTION);
}

{
  const a = aufbau({
    start: session("konto-A"),
    owner: "konto-A",
    confirmed: ["konto-A"],
    signOutThrows: true,
  });
  await a.coordinator.signOut().catch(() => {});
  check("Logout deaktiviert den Kontospeicher auch bei einem Serverfehler",
    a.calls.some(([name]) => name === "deactivate")
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.GUEST);
}

/* Durchstich durch die echte Storage-Fassade: Vorbereiten darf den Besitzer
   nicht umschreiben und den normalen Store nicht auf Accountbetrieb schalten. */
{
  const daten = new Map();
  globalThis.localStorage = {
    getItem: (key) => daten.has(key) ? daten.get(key) : null,
    setItem: (key, value) => void daten.set(key, String(value)),
    removeItem: (key) => void daten.delete(key),
    key: (index) => [...daten.keys()][index] ?? null,
    get length() { return daten.size; },
  };
  const storage = await import("./src/services/storage.js");
  const accountDriver = await import("./src/lib/accountDriver.js");
  accountDriver.setCacheOwner("konto-A");
  storage.bereiteKontoTreiberVor("konto-B");
  await storage.storageService.set("kd:master", "LOKAL-B");
  check("Echte Storage-Fassade bleibt vor der Entscheidung lokal und bewahrt Besitzer A",
    storage.cacheOwner() === "konto-A"
    && storage.storageService.mode === "guest-local"
    && storage.istKontoTreiberVorbereitet()
    && !storage.istKontoTreiberAktiv()
    && daten.get("kd:master") === "LOKAL-B");
  storage.deaktiviereKontoTreiber();
}

console.log(`SESSION-COORDINATOR-TEST BESTANDEN (${ok}/${ok})`);

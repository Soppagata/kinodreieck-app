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

async function rejects(promise) {
  try { await promise; return false; } catch { return true; }
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
  restoreThrows = false,
  quarantineFails = false,
  orphanCleanupFails = false,
  initializeThrows = false,
  hasOpenChanges = false,
  maskedStart = false,
  syncStatus = { pending: [], conflict: [], zuGross: [] },
} = {}) {
  let snapshot = start;
  const listeners = new Set();
  const calls = [];
  let active = false;
  let prepared = null;
  let masked = maskedStart;

  const auth = {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async initialize() {
      if (initializeThrows) throw new Error("auth-init-fehler");
      if (initializeTo) snapshot = initializeTo;
      listeners.forEach((fn) => fn(snapshot));
      return snapshot;
    },
    async signIn() {
      snapshot = signInTo || session("konto-login");
      listeners.forEach((fn) => fn(snapshot));
      return snapshot;
    },
    async signOut({ beforeGuest = null } = {}) {
      calls.push(["auth-signout"]);
      if (signOutThrows) throw new Error("logout-netz");
      await beforeGuest?.();
      snapshot = session();
      listeners.forEach((fn) => fn(snapshot));
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
    deactivate() { calls.push(["deactivate"]); prepared = null; active = false; masked = false; },
    mask() { calls.push(["mask"]); prepared = null; active = false; masked = true; },
    unlockForSameOwnerAccount(id) {
      calls.push(["unlock-owner", id]);
      if (id !== owner) return false;
      masked = false;
      return true;
    },
    masked: () => masked,
    cleanupOrphanMetadata() {
      if (orphanCleanupFails) calls.push(["cleanup-orphan"]);
      return !orphanCleanupFails;
    },
    active: () => active,
    preparedAccountId: () => prepared,
    cacheOwner: () => owner,
    hasOpenChanges: () => hasOpenChanges,
    async pull() { calls.push(["pull"]); return { ok: true }; },
    async flush() { calls.push(["flush"]); return []; },
    status: () => syncStatus,
  };
  const coordinator = createSessionCoordinator({
    auth,
    storage,
    adoption: {
      isConfirmed: (id) => confirmed.includes(id),
      restoreGuest: (id) => {
        calls.push(["restore", id]);
        if (restoreThrows) throw new Error("gaststand-quota");
        return { ok: true, quelle: "gast-rueckholpunkt" };
      },
      quarantine: (id) => {
        calls.push(["quarantine", id]);
        return quarantineFails
          ? { ok: false, grund: "remove-blockiert" }
          : { ok: true, quelle: "konto-cache-quarantaene", warnung: "Gaststand fehlt; Kontocache entfernt." };
      },
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
  const logout = await a.coordinator.signOut();
  check("Logout sendet ausstehende Kontoänderungen und tauscht den Cache vor dem sichtbaren Gastmodus",
    JSON.stringify(a.calls) === JSON.stringify([
      ["flush"], ["auth-signout"], ["restore", "konto-A"], ["deactivate"],
    ]) && logout.mode === "guest" && logout.gaststand?.quelle === "gast-rueckholpunkt");
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
      ["restore", "altes-konto"], ["deactivate"],
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
      ["restore", "konto-A"], ["deactivate"],
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
  check("Kontowechsel trennt zuerst A und bereitet danach B ohne automatischen Pull vor",
    JSON.stringify(a.calls) === JSON.stringify([
      ["restore", "konto-A"], ["deactivate"], ["prepare", "konto-B"],
    ])
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.AWAITING_ADOPTION);
}

{
  const a = aufbau({
    start: session("konto-A"),
    owner: "konto-A",
    confirmed: ["konto-A"],
    signOutThrows: true,
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  let geworfen = false;
  try { await a.coordinator.signOut(); } catch { geworfen = true; }
  check("Auth-Logout-Fehler lässt Konto-Sitzung und Kontocache gemeinsam aktiv",
    geworfen
    && JSON.stringify(a.calls) === JSON.stringify([["flush"], ["auth-signout"]])
    && a.coordinator.getSnapshot().mode === "account"
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.READY);
}

{
  const a = aufbau({
    start: session("konto-A"),
    owner: "konto-A",
    confirmed: ["konto-A"],
    restoreThrows: true,
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  const logout = await a.coordinator.signOut();
  check("Restore-Fehler quarantänisiert den Kontocache vor dem sichtbaren Gastmodus",
    JSON.stringify(a.calls) === JSON.stringify([
      ["flush"], ["auth-signout"], ["restore", "konto-A"],
      ["quarantine", "konto-A"], ["deactivate"],
    ])
    && logout.mode === "guest"
    && logout.gaststand?.quelle === "konto-cache-quarantaene"
    && /Kontocache entfernt/.test(logout.gaststand?.warnung || "")
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.GUEST);
}

{
  const a = aufbau({
    start: session("konto-A"),
    owner: "konto-A",
    confirmed: ["konto-A"],
    restoreThrows: true,
    quarantineFails: true,
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  const geworfen = await rejects(a.coordinator.signOut());
  check("Restore- und Quarantänefehler veröffentlichen niemals eine Gast-Sitzung",
    geworfen && a.calls.some(([name]) => name === "mask")
    && !a.calls.some(([name]) => name === "deactivate")
    && a.coordinator.getSnapshot().mode === "account"
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED);
}

{
  const a = aufbau({
    start: session("konto-A"),
    refreshTo: session(),
    owner: "konto-A",
    confirmed: ["konto-A"],
    restoreThrows: true,
    quarantineFails: true,
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  const sichtbar = [];
  a.coordinator.subscribe((snapshot) => sichtbar.push(snapshot.mode));
  const geworfen = await rejects(a.coordinator.refresh());
  check("Sessionablauf veröffentlicht bei doppeltem Privacyfehler nie Guest und maskiert persönliche Daten",
    geworfen
    && sichtbar.length > 0 && sichtbar.every((mode) => mode === "account")
    && a.coordinator.getSnapshot().mode === "account"
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED
    && a.calls.some(([name]) => name === "mask"));
}

{
  const a = aufbau({
    initializeTo: session(),
    owner: "konto-A",
    restoreThrows: true,
    quarantineFails: true,
  });
  const geworfen = await rejects(a.coordinator.initialize());
  check("Reload mit verwaistem Accountcache fällt vor dem App-Render in die Privacy-Maske",
    geworfen
    && a.coordinator.getSnapshot().mode === "guest"
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED
    && a.calls.some(([name]) => name === "mask"));
}

{
  const a = aufbau({ initializeTo: session(), owner: null, orphanCleanupFails: true });
  const geworfen = await rejects(a.coordinator.initialize());
  check("Ownerloser, nicht entfernbarer Accountsnapshot sperrt den Guest-Boot fail-closed",
    geworfen
    && a.calls.some(([name]) => name === "cleanup-orphan")
    && a.calls.some(([name]) => name === "mask")
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED);
}

{
  const a = aufbau({
    start: session("konto-A"),
    refreshTo: session(),
    owner: "konto-A",
    confirmed: ["konto-A"],
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  const sichtbar = [];
  a.coordinator.subscribe((snapshot) => sichtbar.push(snapshot.mode));
  await a.coordinator.handleExternalStorageEvent({
    key: "kd:acct:transition",
    newValue: JSON.stringify({ accountId: "konto-A", token: "tab-A" }),
  });
  const waehrend = a.coordinator.getStorageState();
  await a.coordinator.handleExternalStorageEvent({ key: "kd:acct:transition", newValue: null });
  check("Storage-Event maskiert den zweiten Tab bis zum geprüften Guest-Re-Align",
    waehrend === STORAGE_SESSION_STATES.PRIVACY_LOCKED
    && sichtbar[0] === "account"
    && sichtbar.at(-1) === "guest"
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.GUEST);
}

{
  const a = aufbau({
    start: session("konto-A"), refreshTo: session(), owner: "konto-A",
    confirmed: ["konto-A"], hasOpenChanges: true,
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  const geworfen = await rejects(a.coordinator.refresh());
  check("Passiver Ablauf bewahrt persistente offene Kontoänderungen hinter der Privacy-Maske",
    geworfen
    && a.calls.some(([name]) => name === "mask")
    && !a.calls.some(([name]) => name === "restore" || name === "quarantine")
    && a.coordinator.getSnapshot().mode === "account"
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED);
}

{
  const a = aufbau({
    start: session("konto-A"), signInTo: session("konto-B"), owner: "konto-A",
    confirmed: ["konto-A"], hasOpenChanges: true,
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  const geworfen = await rejects(a.coordinator.signIn("b", "pw"));
  check("Konto B darf offene Änderungen des ownergebundenen Kontos A weder trennen noch sehen",
    geworfen
    && a.calls.some(([name]) => name === "mask")
    && !a.calls.some(([name]) => name === "restore" || name === "prepare")
    && a.coordinator.getSnapshot().account?.id === "konto-A"
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED);
}

{
  const a = aufbau({ initializeThrows: true, owner: "konto-A" });
  const geworfen = await rejects(a.coordinator.initialize());
  check("Auth-Initialize-Fehler mit ownergebundenem Cache rendert niemals unmaskierten Guest",
    geworfen && a.calls.some(([name]) => name === "mask")
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED);
}

{
  let owner = "konto-A";
  let marker = { accountId: "konto-A", zweck: "konto-adoption", token: "crash-token" };
  let prepared = null;
  let masked = true;
  const calls = [];
  const coordinator = createSessionCoordinator({
    auth: {
      getSnapshot: () => session("konto-A"),
      initialize: async () => session("konto-A"),
    },
    storage: {
      cacheOwner: () => owner, currentTransition: () => marker,
      beginTransition: (_id, _zweck, optionen) => optionen?.uebernehmeBestehend ? marker : null,
      transitionFence: async () => calls.push("fence"),
      endTransition: (token) => {
        calls.push("end");
        if (token !== marker?.token) return false;
        marker = null; return true;
      },
      unlockAfterPrivacyCleanup() { calls.push("unlock"); masked = false; },
      prepare(id) { calls.push("prepare:" + id); prepared = id; },
      confirm() {}, pull: async () => ({}), active: () => false,
      preparedAccountId: () => prepared, masked: () => masked,
      mask() { masked = true; }, cleanupOrphanMetadata: () => true,
    },
    adoption: {
      isConfirmed: () => false,
      restoreGuest(_id, optionen) {
        calls.push(optionen?.behalteTransition ? "restore-retain" : "restore-early-remove");
        owner = null;
        return { ok: true, quelle: "gast-rueckholpunkt" };
      },
      quarantine: () => ({ ok: false }),
    },
    eventTarget: null,
  });
  await coordinator.initialize();
  check("Boot übernimmt einen gecrashten same-owner Adoptionmarker, rollt sicher zurück und bleibt bedienbar",
    marker === null && !masked
    && calls.join("|") === "fence|restore-retain|end|unlock|prepare:konto-A"
    && coordinator.getStorageState() === STORAGE_SESSION_STATES.AWAITING_ADOPTION);
}

{
  const a = aufbau({
    start: session(), signInTo: session("konto-A"), owner: "konto-A",
    confirmed: ["konto-A"], maskedStart: true,
  });
  const neu = await a.coordinator.signIn("a", "pw");
  check("Nur dasselbe Konto entsperrt einen geschützten ownergebundenen Cache wieder",
    neu.account?.id === "konto-A"
    && JSON.stringify(a.calls) === JSON.stringify([
      ["unlock-owner", "konto-A"], ["prepare", "konto-A"],
      ["confirm", "konto-A"], ["pull"],
    ])
    && a.coordinator.getStorageState() === STORAGE_SESSION_STATES.READY);
}

{
  const a = aufbau({
    start: session("konto-A"), refreshTo: session("konto-B"), owner: "konto-A",
    confirmed: ["konto-A"],
  });
  await a.coordinator.initialize();
  a.calls.length = 0;
  await a.coordinator.handleExternalStorageEvent({ key: "kd:auth:session", newValue: "konto-B" });
  check("Auth-Key-Wechsel maskiert synchron, trennt A und richtet erst danach B aus",
    a.calls[0]?.[0] === "mask"
    && a.calls.some(([name, id]) => name === "restore" && id === "konto-A")
    && a.calls.at(-1)?.[0] === "prepare" && a.calls.at(-1)?.[1] === "konto-B"
    && a.coordinator.getSnapshot().account?.id === "konto-B");
}

{
  let snapshot = session("konto-A");
  let owner = "konto-A";
  let marker = null;
  let credentialVorhanden = true;
  let grenzeErreicht;
  let commitFreigeben;
  const grenze = new Promise((resolve) => { grenzeErreicht = resolve; });
  const commit = new Promise((resolve) => { commitFreigeben = resolve; });
  const calls = [];
  let masked = false;
  const auth = {
    getSnapshot: () => snapshot,
    async signOut({ beforeGuest }) {
      calls.push("auth-server");
      await beforeGuest();
      calls.push("cache-getrennt");
      grenzeErreicht();
      await commit;
      credentialVorhanden = false;
      calls.push("credential-entfernt");
      snapshot = session();
      return snapshot;
    },
  };
  const storage = {
    active: () => false,
    status: () => ({ pending: [], conflict: [], zuGross: [], schemaVeraltet: [] }),
    cacheOwner: () => owner,
    currentTransition: () => marker,
    beginTransition(id) {
      marker = { accountId: id, token: "logout-token" };
      calls.push("marker-gesetzt"); masked = true;
      return marker;
    },
    transitionFence: async () => { calls.push("fence"); },
    endTransition(token) {
      calls.push("marker-entfernt");
      if (credentialVorhanden || token !== marker?.token) return false;
      marker = null; return true;
    },
    unlockAfterPrivacyCleanup() { calls.push("entsperrt"); masked = false; },
    deactivate() {}, mask() { masked = true; calls.push("hart-maskiert"); },
    masked: () => masked, cleanupOrphanMetadata: () => true,
    preparedAccountId: () => null,
  };
  const coordinator = createSessionCoordinator({
    auth, storage,
    adoption: {
      isConfirmed: () => true,
      restoreGuest(_id, optionen) {
        calls.push(optionen?.behalteTransition ? "restore-marker-behalten" : "restore-marker-verloren");
        owner = null;
        return { ok: true, quelle: "gast-rueckholpunkt" };
      },
      quarantine: () => ({ ok: false }),
    },
    eventTarget: null,
  });
  const lauf = coordinator.signOut();
  await grenze;
  const zwischenstand = marker?.token === "logout-token"
    && credentialVorhanden && !calls.includes("marker-entfernt");
  commitFreigeben();
  const logout = await lauf;
  check("Logout hält den geräteweiten Marker bis nach bestätigter Credential-Löschung",
    zwischenstand && logout.mode === "guest"
    && calls.indexOf("restore-marker-behalten") < calls.indexOf("credential-entfernt")
    && calls.indexOf("credential-entfernt") < calls.indexOf("marker-entfernt")
    && calls.at(-1) === "entsperrt" && marker === null && !masked);
}

{
  let marker = null;
  let owner = "konto-A";
  let masked = false;
  let endCalls = 0;
  const auth = {
    getSnapshot: () => session("konto-A"),
    async signOut({ beforeGuest }) {
      await beforeGuest();
      const error = new Error("Credential blieb persistent");
      error.code = "AUTH_CREDENTIAL_PERSISTENCE_FAILED";
      throw error;
    },
  };
  const storage = {
    active: () => false, status: () => ({}), cacheOwner: () => owner,
    currentTransition: () => marker,
    beginTransition(id) { marker = { accountId: id, token: "bleibt" }; return marker; },
    transitionFence: async () => {},
    endTransition() { endCalls++; marker = null; return true; },
    mask() { masked = true; }, masked: () => masked,
    cleanupOrphanMetadata: () => true, preparedAccountId: () => null,
  };
  const coordinator = createSessionCoordinator({
    auth, storage, eventTarget: null,
    adoption: {
      isConfirmed: () => true,
      restoreGuest() { owner = null; return { ok: true }; },
      quarantine: () => ({ ok: false }),
    },
  });
  const geworfen = await rejects(coordinator.signOut());
  check("Credential-Persistenzfehler hält Marker und Maske statt Guest freizugeben",
    geworfen && marker?.token === "bleibt" && endCalls === 0 && masked
    && coordinator.getSnapshot().mode === "account"
    && coordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED);
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

  daten.set("kd:master", "ACCOUNT-A");
  storage.maskierePersoenlichenSpeicher();
  const maskiert = await storage.storageService.get("kd:master");
  const writeGesperrt = await rejects(storage.storageService.set("kd:master", "GAST"));
  check("Privacy-Maske liefert keine Accountdaten und bestätigt keine Gastwrites",
    maskiert === null && writeGesperrt && daten.get("kd:master") === "ACCOUNT-A");
  storage.entsperrePersoenlichenSpeicherNachTrennung();

  daten.set(accountDriver.ACCT_KEYS.owner, "konto-A");
  daten.set(accountDriver.ACCT_KEYS.snap, "ACCOUNT-A-SNAPSHOT");
  const removeNormal = globalThis.localStorage.removeItem;
  globalThis.localStorage.removeItem = (key) => {
    if (key === accountDriver.ACCT_KEYS.snap) throw new Error("snap-gesperrt");
    removeNormal(key);
  };
  const prepareGesperrt = await rejects(Promise.resolve().then(() => storage.bereiteKontoTreiberVor("konto-B")));
  check("Fremdaccount-Prepare sperrt bei nicht entfernbarer alter Snapshot-Metadatei",
    prepareGesperrt
    && storage.istPersoenlicherSpeicherMaskiert()
    && daten.get(accountDriver.ACCT_KEYS.owner) === "konto-A"
    && daten.get("kd:master") === "ACCOUNT-A");
  globalThis.localStorage.removeItem = removeNormal;
  daten.delete(accountDriver.ACCT_KEYS.snap);
  accountDriver.setCacheOwner(null);
  storage.entsperrePersoenlichenSpeicherNachTrennung();

  daten.clear();
  storage.bereiteKontoTreiberVor("konto-A");
  daten.set(accountDriver.ACCT_KEYS.transition, JSON.stringify({
    accountId: "konto-A", zweck: "fremder-tab", token: "fremd", t: "2026-08-08T13:00:00Z",
  }));
  const sameIdGesperrt = await rejects(Promise.resolve().then(() => storage.bereiteKontoTreiberVor("konto-A")));
  check("Bestehender Same-ID-Treiber wird bei fremdem Transitionmarker nicht erneut aktiviert",
    sameIdGesperrt && storage.istPersoenlicherSpeicherMaskiert());
  daten.delete(accountDriver.ACCT_KEYS.transition);
  storage.entsperrePersoenlichenSpeicherNachTrennung();
}

{
  const { readFileSync } = await import("node:fs");
  const main = readFileSync(new URL("./src/main.jsx", import.meta.url), "utf8");
  check("Main-Gate hängt bei Privacy-Lock den App-Baum samt geladenem Account-State aus",
    /STORAGE_SESSION_STATES\.PRIVACY_LOCKED/.test(main)
    && /Persönliche Daten sind geschützt/.test(main)
    && /renderSicherenBaum/.test(main));
}

console.log(`SESSION-COORDINATOR-TEST BESTANDEN (${ok}/${ok})`);

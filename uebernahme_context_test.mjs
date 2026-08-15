/* Kontoübernahme-Kontext: Rein lokale Mocks, keine Netz-/Anbieteraufrufe. */
import assert from "node:assert/strict";

const werte = new Map();
globalThis.localStorage = {
  getItem: (key) => (werte.has(key) ? werte.get(key) : null),
  setItem: (key, value) => void werte.set(key, String(value)),
  removeItem: (key) => void werte.delete(key),
  clear: () => werte.clear(),
};

const {
  bindePersistentenAccountCache, erstelleGebundenenAccountContext,
  istGebundenerAccountCacheAktiv, warteAccountTransitionZaun,
} = await import("./src/services/storage.js");
const {
  kontoUebernehmen, starteKontoCacheAdoption, uebernahmeBestaetigen,
  uebernahmeStarten, uebernahmeZuruecknehmen,
} = await import("./src/services/uebernahme.js");
const {
  bindeRueckholpunktAnKonto, sichereRueckholpunkt,
  stelleGaststandNachAbmeldungWiederHer, UEBERNAHME_SNAP, UEBERNOMMEN_KEY,
} = await import("./src/lib/uebernahme.js");
const { createAccountDriver } = await import("./src/lib/accountDriver.js");
const { ACCT_KEYS } = await import("./src/lib/accountStorageKeys.js");

let checks = 0;
function check(wert, text) {
  assert.ok(wert, text);
  checks++;
  console.log("✓ " + text);
}
function blockade() {
  let gestartet, loese;
  return {
    gestartet: new Promise((resolve) => { gestartet = resolve; }),
    warten: new Promise((resolve) => { loese = resolve; }),
    meldeStart: gestartet,
    loese,
  };
}

let aktiv = "A";
const aCalls = [];
const bCalls = [];
const startPush = blockade();
const driverAStart = {
  async uebernehmeKey(key) {
    aCalls.push(`push:${key}`);
    startPush.meldeStart();
    await startPush.warten;
    return { ok: true, angelegt: true };
  },
  async inventur() { aCalls.push("inventur"); return { ok: true, zeilen: {} }; },
  async pull() { aCalls.push("pull"); return { ok: true }; },
  async loescheRemote(key) { aCalls.push(`delete:${key}`); return { ok: true }; },
};
const driverB = {
  async uebernehmeKey(key) { bCalls.push(`push:${key}`); return { ok: true }; },
  async inventur() { bCalls.push("inventur"); return { ok: true, zeilen: {} }; },
  async pull() { bCalls.push("pull"); return { ok: true }; },
  async loescheRemote(key) { bCalls.push(`delete:${key}`); return { ok: true }; },
};
const contextAStart = erstelleGebundenenAccountContext({
  driver: driverAStart, accountId: "A", generation: 1, isCurrent: () => aktiv === "A",
});
const contextB = erstelleGebundenenAccountContext({
  driver: driverB, accountId: "B", generation: 2, isCurrent: () => aktiv === "B",
});

const startLauf = uebernahmeStarten({
  lokaleWerte: { "kd:master": JSON.stringify({ filme: [{ id: "a" }] }), "kd:artikel": JSON.stringify({ artikel: [] }) },
  accountBindung: contextAStart.bindung,
}, {
  captureAccountContext: () => contextAStart,
  startAdoption: async () => ({
    token: "test-push",
    lokaleWerte: { "kd:master": JSON.stringify({ filme: [{ id: "a" }] }), "kd:artikel": JSON.stringify({ artikel: [] }) },
  }),
  abortAdoption: () => ({ ok: true }),
});
await startPush.gestartet;
aktiv = "B";
startPush.loese();
await assert.rejects(startLauf, (error) => error?.code === "ACCOUNT_CONTEXT_CHANGED");
check(aCalls.filter((call) => call.startsWith("push:")).length === 1
  && !aCalls.includes("inventur") && bCalls.length === 0,
"Übernahme A stoppt nach dem Kontextwechsel und führt keinen Folgeschritt gegen B aus");

aktiv = "A";
aCalls.length = 0; bCalls.length = 0;
const pullBlockade = blockade();
const driverAPull = {
  ...driverAStart,
  async pull() {
    aCalls.push("pull");
    pullBlockade.meldeStart();
    await pullBlockade.warten;
    return { ok: true };
  },
};
const contextAPull = erstelleGebundenenAccountContext({
  driver: driverAPull, accountId: "A", generation: 3, isCurrent: () => aktiv === "A",
});
const pullLauf = kontoUebernehmen(
  { "kd:master": JSON.stringify({ filme: [] }) },
  { accountBindung: contextAPull.bindung },
  {
    captureAccountContext: () => contextAPull,
    bindeCacheVorPull: () => ({ token: "test-adoption" }),
    transitionFence: async () => {},
    abbruchCachePull: () => ({ ok: true }),
  },
);
await pullBlockade.gestartet;
aktiv = "B";
pullBlockade.loese();
await assert.rejects(pullLauf, (error) => error?.code === "ACCOUNT_CONTEXT_CHANGED");
check(aCalls.join("|") === "pull" && bCalls.length === 0,
  "Konto-Pull bleibt an A gebunden und fällt nach A→B geschlossen aus");

/* Rücknahme mit mehreren Keys: Der erste A-Delete wartet. Nach dem Wechsel
   darf weder der zweite Key noch irgendein B-Key remote gelöscht werden. */
aktiv = "A";
aCalls.length = 0; bCalls.length = 0;
werte.set(UEBERNAHME_SNAP, JSON.stringify({
  t: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  werte: { "kd:master": "gast-master", "kd:artikel": "gast-artikel" },
}));
werte.set(UEBERNOMMEN_KEY, JSON.stringify({ accountId: "A" }));
const deleteBlockade = blockade();
let ersterDelete = true;
const driverADelete = {
  ...driverAStart,
  async loescheRemote(key) {
    aCalls.push(`delete:${key}`);
    if (ersterDelete) {
      ersterDelete = false;
      deleteBlockade.meldeStart();
      await deleteBlockade.warten;
    }
    return { ok: true };
  },
};
const contextADelete = erstelleGebundenenAccountContext({
  driver: driverADelete, accountId: "A", generation: 4, isCurrent: () => aktiv === "A",
});
const storageContextA = {
  isCurrent: () => aktiv === "A",
  async set(key, value) {
    if (aktiv !== "A") throw new Error("Storage-Kontext gewechselt");
    werte.set(key, value);
  },
  async delete(key) {
    if (aktiv !== "A") throw new Error("Storage-Kontext gewechselt");
    werte.delete(key);
  },
};
const ruecklauf = uebernahmeZuruecknehmen(
  ["kd:master", "kd:artikel"],
  contextADelete.bindung,
  { captureAccountContext: () => contextADelete, storageContext: storageContextA },
);
await deleteBlockade.gestartet;
aktiv = "B";
deleteBlockade.loese();
await assert.rejects(ruecklauf, (error) => error?.code === "UEBERNAHME_ROLLBACK_UNVOLLSTAENDIG");
check(aCalls.filter((call) => call.startsWith("delete:")).length === 1 && bCalls.length === 0,
  "laufende A-Rücknahme löscht nach dem Wechsel keinen zweiten Key und niemals B-Daten");
check(werte.has(UEBERNAHME_SNAP) && werte.has(UEBERNOMMEN_KEY),
  "unvollständige Rücknahme bleibt ehrlich wiederholbar und behält Rückholpunkt sowie Marker");

const bDeletesVorher = bCalls.length;
await assert.rejects(
  uebernahmeZuruecknehmen(
    ["kd:master"],
    contextADelete.bindung,
    { captureAccountContext: () => contextB, storageContext: storageContextA },
  ),
  (error) => error?.code === "ACCOUNT_CONTEXT_CHANGED",
);
check(bCalls.length === bDeletesVorher,
  "ein erst nach A→B ausgelöster alter Rücknahme-Callback wird vor jedem B-Delete abgewiesen");

/* Zwei Tabs teilen localStorage, besitzen aber getrennte In-Memory-Treiber.
   Tab B bindet sich an Owner+Epoch E1. Marker, Ownerverlust und ein späteres
   Same-Account-Re-Login mit E2 müssen ihn jeweils dauerhaft sperren. */
werte.clear();
werte.set(ACCT_KEYS.owner, "A");
werte.set(ACCT_KEYS.epoch, JSON.stringify({ accountId: "A", token: "E1" }));
werte.set("kd:master", "ACCOUNT-A");
const aktivB = () => istGebundenerAccountCacheAktiv({ accountId: "A", epoch: "E1" });
const driverTabB = createAccountDriver({ isActive: aktivB });
werte.set(ACCT_KEYS.transition, JSON.stringify({
  accountId: "A", zweck: "konto-zu-gast", token: "TA", t: "2026-08-08T12:00:00Z",
}));
await warteAccountTransitionZaun();
werte.set("kd:master", "GUEST");
await assert.rejects(driverTabB.set("kd:master", "STALE-ACCOUNT-A"),
  (error) => error?.code === "ACCOUNT_CONTEXT_CHANGED");
check(werte.get("kd:master") === "GUEST",
  "staler Tab-B-Write nach Transitionmarker überschreibt den Gaststand nicht");

werte.delete(ACCT_KEYS.transition);
werte.delete(ACCT_KEYS.owner);
await assert.rejects(driverTabB.set("kd:master", "STALE-NACH-LOGOUT"));
check(werte.get("kd:master") === "GUEST",
  "staler Tab B bleibt nach Ownerentfernung gesperrt");

werte.set(ACCT_KEYS.owner, "A");
werte.set(ACCT_KEYS.epoch, JSON.stringify({ accountId: "A", token: "E2" }));
await assert.rejects(driverTabB.set("kd:master", "STALE-NACH-RELOGIN"));
check(werte.get("kd:master") === "GUEST",
  "Same-Account-Re-Login mit neuer Epoch reaktiviert keinen alten Tab-Treiber");

/* Ein bereits laufender B-Pull wartet im Fetch. A setzt den Marker, lässt den
   Propagationszaun verstreichen und restauriert GUEST. Die Post-Await-Prüfung
   verwirft die späte Remoteantwort vor jeder lokalen Mutation. */
werte.set(ACCT_KEYS.owner, "A");
werte.set(ACCT_KEYS.epoch, JSON.stringify({ accountId: "A", token: "E1" }));
werte.delete(ACCT_KEYS.transition);
werte.set("kd:master", "ACCOUNT-A");
const pullFetch = blockade();
const pullDriverB = createAccountDriver({
  config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_publishable_test" },
  getAccessToken: async () => "token-B",
  isActive: aktivB,
  fetchImpl: async () => {
    pullFetch.meldeStart();
    await pullFetch.warten;
    return {
      ok: true, status: 200,
      json: async () => [{ key: "kd:master", value: "REMOTE-ACCOUNT-A", revision: 2 }],
    };
  },
});
const spaeterPull = pullDriverB.pull();
await pullFetch.gestartet;
werte.set(ACCT_KEYS.transition, JSON.stringify({
  accountId: "A", zweck: "konto-zu-gast", token: "TA2", t: "2026-08-08T12:01:00Z",
}));
await warteAccountTransitionZaun();
werte.set("kd:master", "GUEST-NACH-PULLSTART");
pullFetch.loese();
const pullErgebnis = await spaeterPull;
check(pullErgebnis?.inactive === true && werte.get("kd:master") === "GUEST-NACH-PULLSTART",
  "laufender Tab-B-Pull verwirft seine Antwort nach A-Transition vor dem Gastcache");

/* Owner-Schreiben wird nicht mehr best effort behauptet. */
werte.clear();
const setNormal = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = (key, value) => {
  if (key !== ACCT_KEYS.owner) setNormal(key, value);
};
const ownerBindung = bindePersistentenAccountCache("A", { epoch: "E-noop" });
globalThis.localStorage.setItem = setNormal;
check(ownerBindung === null && !werte.has(ACCT_KEYS.owner),
  "Owner-set no-op kann keinen bestätigten Kontocache aktivieren");

/* Crash direkt nach einem Account-Pull: Owner und gebundener Gast-Snapshot
   existieren bereits, daher stellt ein Guest-Boot den Gast statt Accountwerte her. */
werte.clear();
werte.set("kd:master", "GUEST-VOR-PULL");
await sichereRueckholpunkt({ "kd:master": "GUEST-VOR-PULL" });
check(bindeRueckholpunktAnKonto("A"), "Crash-Repro bindet den Rückholpunkt vor dem Pull an A");
check(!!bindePersistentenAccountCache("A", { epoch: "E-crash" }),
  "Crash-Repro bestätigt Owner und Epoch vor dem Pull");
werte.set("kd:master", "ACCOUNT-A-NACH-PULL");
const crashRestore = stelleGaststandNachAbmeldungWiederHer("A");
check(crashRestore.ok && werte.get("kd:master") === "GUEST-VOR-PULL",
  "Guest-Recovery nach Crash zwischen Pull und Confirm gibt nie Accountwerte frei");

/* Push-Richtung: Marker und Tab-Zaun kommen vor dem maßgeblichen Snapshot.
   Ein Edit während des Zauns muss exakt so im Rückholpunkt UND Remote-Push
   landen; der alte Inventurwert ist niemals die Schreibgrundlage. */
werte.clear();
let stabil = "ALT-AUS-INVENTUR";
const reihenfolge = [];
const gepusht = [];
const stableDriver = {
  async uebernehmeKey(key, value) {
    reihenfolge.push("push"); gepusht.push([key, value]);
    return { ok: true, angelegt: true };
  },
  async inventur() {
    return { ok: true, zeilen: { "kd:master": { value: stabil, revision: 1 } } };
  },
};
const stableContext = erstelleGebundenenAccountContext({
  driver: stableDriver, accountId: "A", generation: 20, isCurrent: () => true,
});
const stabilLauf = await uebernahmeStarten({
  lokaleWerte: { "kd:master": "ALT-AUS-INVENTUR" },
  nurSchluessel: ["kd:master"], accountBindung: stableContext.bindung,
}, {
  captureAccountContext: () => stableContext,
  startAdoption: (id) => starteKontoCacheAdoption(id, {
    beginAdoption: () => { reihenfolge.push("marker"); return { accountId: id, token: "T-stabil" }; },
    transitionFence: async () => { reihenfolge.push("fence"); stabil = "EDIT-NACH-INVENTUR"; },
    bindGuestSnapshot: () => { reihenfolge.push("snapshot"); return { werte: { "kd:master": stabil } }; },
    bindAdoption: () => { reihenfolge.push("owner-epoch"); return { accountId: id, token: "T-stabil", epoch: "E-stabil" }; },
  }),
  abortAdoption: () => ({ ok: true }),
});
check(reihenfolge.join("|") === "marker|fence|snapshot|owner-epoch|push"
  && gepusht[0]?.[1] === "EDIT-NACH-INVENTUR" && stabilLauf.vollstaendig,
"Push verwendet nach Marker+Fence den stabil neu gelesenen Gaststand statt der Inventurkopie");

/* Auch der explizit autorisierte pre-confirm Pull braucht Marker UND
   Owner/Epoch über jede Async-Grenze. Fremdes Entfernen stoppt ihn. */
werte.clear();
werte.set(ACCT_KEYS.owner, "A");
werte.set(ACCT_KEYS.epoch, JSON.stringify({ accountId: "A", token: "E-pre" }));
werte.set(ACCT_KEYS.transition, JSON.stringify({
  accountId: "A", zweck: "konto-adoption", token: "T-pre", t: "2026-08-08T14:00:00Z",
}));
werte.set("kd:master", "GUEST-STABIL");
const preFetch = blockade();
const preDriver = createAccountDriver({
  config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_publishable_test" },
  getAccessToken: async () => "token-A",
  isActive: () => istGebundenerAccountCacheAktiv({
    accountId: "A", epoch: "E-pre", lokalerToken: "T-pre", driverErlaubt: true,
  }),
  fetchImpl: async () => {
    preFetch.meldeStart(); await preFetch.warten;
    return { ok: true, status: 200, json: async () => [{ key: "kd:master", value: "ACCOUNT-A", revision: 3 }] };
  },
});
const prePull = preDriver.pull();
await preFetch.gestartet;
werte.delete(ACCT_KEYS.transition);
preFetch.loese();
const preErgebnis = await prePull;
check(preErgebnis?.inactive === true && werte.get("kd:master") === "GUEST-STABIL",
  "Fremdes Entfernen des Adoptionmarkers stoppt einen blockierten pre-confirm Pull vor lokaler Mutation");

/* Eine stale Rücknahme darf ohne ihren same-account Marker nicht einmal den
   ersten Remote-Key löschen. */
werte.clear();
let staleDeletes = 0;
const staleContext = erstelleGebundenenAccountContext({
  accountId: "A", generation: 21, isCurrent: () => true,
  driver: { async loescheRemote() { staleDeletes++; return { ok: true }; } },
});
await assert.rejects(
  uebernahmeZuruecknehmen(["kd:master"], staleContext.bindung, {
    captureAccountContext: () => staleContext,
  }),
  (error) => error?.code === "ACCOUNT_CONTEXT_CHANGED",
);
check(staleDeletes === 0,
  "Rücknahme ohne aktiven same-account Marker löscht keine Remote-Zeile");

/* Der bestätigte Marker muss VOR dem finalen Transition-Ende rückgelesen
   persistiert sein. Ein stilles No-op rollt lokal zurück und aktiviert nie. */
let confirmCalls = 0;
let confirmAborts = 0;
const confirmContext = erstelleGebundenenAccountContext({
  accountId: "A", generation: 22, isCurrent: () => true, driver: {},
});
await assert.rejects(
  uebernahmeBestaetigen("A", confirmContext.bindung, {
    captureAccountContext: () => confirmContext,
    currentTransition: () => ({ accountId: "A", token: "T-confirm" }),
    isLocalTransition: () => true,
    markConfirmed: () => false,
    confirmDriver: () => { confirmCalls++; },
    abortAdoption: () => { confirmAborts++; },
  }),
  /nicht dauerhaft bestätigt/,
);
check(confirmCalls === 0 && confirmAborts === 1,
  "Confirmation-set-No-op endet den Marker nicht und aktiviert keinen Accounttreiber");

let fremdMarkiert = 0;
await assert.rejects(
  uebernahmeBestaetigen("A", confirmContext.bindung, {
    captureAccountContext: () => confirmContext,
    currentTransition: () => null,
    startAdoption: async () => ({ token: "T-weg" }),
    isLocalTransition: () => false,
    markConfirmed: () => { fremdMarkiert++; return true; },
    confirmDriver: () => { confirmCalls++; },
    abortAdoption: () => { confirmAborts++; },
  }),
  (error) => error?.code === "ACCOUNT_CONTEXT_CHANGED",
);
check(fremdMarkiert === 0 && confirmAborts === 2,
  "Fremd entferntes eigenes Adoptionmarker rollt zurück und kann weder bestätigen noch aktivieren");

console.log(`\nUEBERNAHME-KONTEXT-TEST BESTANDEN (${checks}/${checks})`);

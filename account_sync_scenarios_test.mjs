/* E2 / PR-03+PR-04: deterministische Kontosync-Szenarien.

   Ist-Stand, den dieser Test bewusst wiederverwendet:
   - personalDataRegistry definiert die persönlichen Töpfe;
   - accountDriver spiegelt sie revisionsgebunden nach kd_personal;
   - SessionCoordinator trennt Login/Logout und Cachefreigabe;
   - Owner + Epoch + Transition schützen den lokalen Kontocache.

   Der Test baut kein zweites Sync-, Backup- oder Konfliktsystem. Sein
   PostgREST-Mock bildet nur RLS-Kontotrennung und den servermonotonen
   revision-Trigger nach. */

import assert from "node:assert/strict";

function browserSpeicher(start = {}) {
  const daten = new Map(Object.entries(start).map(([key, value]) => [key, String(value)]));
  const storage = {
    getItem: (key) => (daten.has(key) ? daten.get(key) : null),
    setItem: (key, value) => void daten.set(key, String(value)),
    removeItem: (key) => void daten.delete(key),
    clear: () => daten.clear(),
    key: (index) => [...daten.keys()][index] ?? null,
    get length() { return daten.size; },
  };
  return { daten, storage };
}

const bootstrap = browserSpeicher();
globalThis.localStorage = bootstrap.storage;

const {
  ACCT_KEYS,
  createAccountDriver,
} = await import("./src/lib/accountDriver.js");
const {
  bindePersistentenAccountCache,
  hatOffeneKontoCacheAenderungen,
  istGebundenerAccountCacheAktiv,
} = await import("./src/services/storage.js");
const {
  createSessionCoordinator,
  STORAGE_SESSION_STATES,
} = await import("./src/services/sessionCoordinator.js");
const { kontoSicherAutomatischLaden } = await import("./src/services/uebernahme.js");
const { PERSONAL_DATA_KEYS } = await import("./src/lib/personalDataRegistry.js");

const CONFIG = Object.freeze({
  supabaseUrl: "https://projekt.supabase.co",
  supabasePublishableKey: "sb_publishable_test",
});
const TOKEN_ACCOUNT = Object.freeze({
  "token-A-1": "konto-A",
  "token-A-2": "konto-A",
  "token-A-relogin": "konto-A",
  "token-B-1": "konto-B",
});

let server = new Map();
let requests = [];
const offlineTokens = new Set();

function antwort(status, data) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function serverId(accountId, key) { return `${accountId}|${key}`; }
function serverZeile(accountId, key) { return server.get(serverId(accountId, key)) || null; }
function seed(accountId, key, value, revision = 1) {
  server.set(serverId(accountId, key), { account_id: accountId, key, value: String(value), revision });
}

async function postgrestMock(url, optionen = {}) {
  const headers = optionen.headers || {};
  const token = String(headers.Authorization || "").replace(/^Bearer /, "");
  const accountId = TOKEN_ACCOUNT[token] || null;
  const method = optionen.method || "GET";
  const body = optionen.body ? JSON.parse(optionen.body) : null;
  const parsed = new URL(String(url));
  const key = String(parsed.searchParams.get("key") || "").replace(/^eq\./, "");
  const revisionRaw = parsed.searchParams.get("revision");
  const revision = revisionRaw == null ? null : Number(String(revisionRaw).replace(/^eq\./, ""));
  requests.push({ accountId, method, key, body });

  if (offlineTokens.has(token)) throw new TypeError("offline");
  if (!accountId) return antwort(401, { message: "invalid token" });

  if (method === "GET") {
    let rows = [...server.values()].filter((row) => row.account_id === accountId);
    if (key) rows = rows.filter((row) => row.key === key);
    return antwort(200, rows.map((row) => ({ ...row })));
  }
  if (method === "POST") {
    assert.equal(Object.hasOwn(body || {}, "account_id"), false,
      "Der Client darf keine Account-ID in kd_personal schreiben");
    const id = serverId(accountId, body.key);
    if (server.has(id)) return antwort(409, { code: "23505" });
    const row = { account_id: accountId, key: body.key, value: String(body.value), revision: 1 };
    server.set(id, row);
    return antwort(201, [{ ...row }]);
  }
  if (method === "PATCH") {
    assert.equal(Object.hasOwn(body || {}, "account_id"), false,
      "Der Client darf keine Account-ID in kd_personal schreiben");
    const row = serverZeile(accountId, key);
    if (!row || (revision != null && row.revision !== revision)) return antwort(200, []);
    row.value = String(body.value);
    row.revision += 1;
    return antwort(200, [{ ...row }]);
  }
  return antwort(405, {});
}

function aufGeraetSync(geraet, auftrag) {
  const vorher = globalThis.localStorage;
  globalThis.localStorage = geraet.storage;
  try { return auftrag(); }
  finally { globalThis.localStorage = vorher; }
}

async function aufGeraet(geraet, auftrag) {
  const vorher = globalThis.localStorage;
  globalThis.localStorage = geraet.storage;
  try { return await auftrag(); }
  finally { globalThis.localStorage = vorher; }
}

function binde(geraet, accountId, epoch) {
  const bindung = aufGeraetSync(
    geraet,
    () => bindePersistentenAccountCache(accountId, { epoch }),
  );
  assert.deepEqual(bindung, { accountId, epoch });
}

function treiber(geraet, accountId, epoch, token) {
  return createAccountDriver({
    config: CONFIG,
    getAccessToken: async () => token,
    fetchImpl: postgrestMock,
    owner: `account:${accountId}`,
    isActive: () => globalThis.localStorage === geraet.storage
      && istGebundenerAccountCacheAktiv({ accountId, epoch }),
  });
}

function revisionsstand(geraet, key) {
  try { return JSON.parse(geraet.daten.get(ACCT_KEYS.ver) || "{}")[key] ?? null; }
  catch { return null; }
}

const RealDate = globalThis.Date;
async function mitUhr(iso, auftrag) {
  const jetzt = RealDate.parse(iso);
  class TestDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [jetzt])); }
    static now() { return jetzt; }
  }
  globalThis.Date = TestDate;
  try { return await auftrag(); }
  finally { globalThis.Date = RealDate; }
}

let checks = 0;
function check(name, pruefung) {
  assert.ok(pruefung, name);
  checks += 1;
  console.log(`✓ ${name}`);
}

/* 1. Zwei Geräte desselben Kontos landen nach Sync und Reload am selben
   serverautoritativen Stand. */
{
  server = new Map(); requests = []; offlineTokens.clear();
  const mac = browserSpeicher();
  const iphone = browserSpeicher();
  binde(mac, "konto-A", "epoch-mac");
  binde(iphone, "konto-A", "epoch-iphone");
  const macDriver = treiber(mac, "konto-A", "epoch-mac", "token-A-1");
  const iphoneDriver = treiber(iphone, "konto-A", "epoch-iphone", "token-A-2");

  await aufGeraet(mac, async () => {
    await macDriver.set("kd:master", "A-LIVESTAND-1");
    await macDriver.syncFlush();
  });
  await aufGeraet(iphone, () => iphoneDriver.pull());

  await aufGeraet(mac, async () => {
    await macDriver.set("kd:master", "A-LIVESTAND-2");
    await macDriver.syncFlush();
  });
  const iphoneNachReload = treiber(iphone, "konto-A", "epoch-iphone", "token-A-2");
  await aufGeraet(iphone, () => iphoneNachReload.pull());

  check("Zwei Geräte desselben Kontos sehen nach Sync und Reload denselben Server-Livestand",
    serverZeile("konto-A", "kd:master")?.value === "A-LIVESTAND-2"
      && mac.daten.get("kd:master") === "A-LIVESTAND-2"
      && iphone.daten.get("kd:master") === "A-LIVESTAND-2"
      && revisionsstand(mac, "kd:master") === 2
      && revisionsstand(iphone, "kd:master") === 2);
}

/* 2. Derselbe Key darf für A und B weder Wert noch Revision vermischen. */
{
  server = new Map(); requests = []; offlineTokens.clear();
  seed("konto-A", "kd:artikel", "ARTIKEL-A", 3);
  seed("konto-B", "kd:artikel", "ARTIKEL-B", 8);
  const geraetA = browserSpeicher();
  const geraetB = browserSpeicher();
  binde(geraetA, "konto-A", "epoch-A");
  binde(geraetB, "konto-B", "epoch-B");
  const driverA = treiber(geraetA, "konto-A", "epoch-A", "token-A-1");
  const driverB = treiber(geraetB, "konto-B", "epoch-B", "token-B-1");
  await aufGeraet(geraetA, () => driverA.pull());
  await aufGeraet(geraetB, () => driverB.pull());
  await aufGeraet(geraetA, async () => {
    await driverA.set("kd:artikel", "ARTIKEL-A-NEU");
    await driverA.syncFlush();
  });

  check("Konto A und B bleiben einschließlich Revisionen strikt getrennt",
    geraetA.daten.get("kd:artikel") === "ARTIKEL-A-NEU"
      && geraetB.daten.get("kd:artikel") === "ARTIKEL-B"
      && serverZeile("konto-A", "kd:artikel")?.revision === 4
      && serverZeile("konto-B", "kd:artikel")?.revision === 8
      && revisionsstand(geraetA, "kd:artikel") === 4
      && revisionsstand(geraetB, "kd:artikel") === 8);
}

/* 3. SessionCoordinator trennt beim Logout den Kontocache. Der reale
   Kontoautoladeweg zieht beim Relogin ausschließlich kd_personal zurück. */
{
  server = new Map(); requests = []; offlineTokens.clear();
  seed("konto-A", "kd:master", "A-NACH-RELOGIN", 11);
  const geraet = browserSpeicher({ "kd:master": "A-ALT" });
  binde(geraet, "konto-A", "epoch-vor-logout");
  let currentDriver = treiber(geraet, "konto-A", "epoch-vor-logout", "token-A-1");
  let snapshot = {
    mode: "account", state: "ready", account: { id: "konto-A", role: "member" },
    capabilities: { remoteStorage: true, personalAi: false },
  };
  const guestWert = "GAST-BLEIBT-GETRENNT";
  const confirmed = new Set(["konto-A"]);
  let prepared = "konto-A";
  let active = true;
  let masked = false;
  const auth = {
    getSnapshot: () => snapshot,
    initialize: async () => snapshot,
    async signOut({ beforeGuest }) {
      await beforeGuest?.();
      snapshot = { mode: "guest", state: "ready", account: null };
      return snapshot;
    },
    async signIn() {
      snapshot = {
        mode: "account", state: "ready", account: { id: "konto-A", role: "member" },
        capabilities: { remoteStorage: true, personalAi: false },
      };
      return snapshot;
    },
    refresh: async () => snapshot,
    changePassword: async () => ({ ok: true }),
  };
  const storage = {
    prepare(id, _optionen) { prepared = id; active = false; },
    async confirm(id, _optionen) { prepared = id; active = true; },
    deactivate() { prepared = null; active = false; masked = false; },
    mask() { prepared = null; active = false; masked = true; },
    masked: () => masked,
    active: () => active,
    preparedAccountId: () => prepared,
    cacheOwner: () => geraet.daten.get(ACCT_KEYS.owner) || null,
    currentTransition: () => null,
    cleanupOrphanMetadata: () => true,
    hasOpenChanges: () => aufGeraetSync(geraet, () => hatOffeneKontoCacheAenderungen()),
    pull: () => aufGeraet(geraet, () => currentDriver.pull()),
    flush: () => aufGeraet(geraet, () => currentDriver.syncFlush()),
    status: () => aufGeraetSync(geraet, () => currentDriver.status()),
  };
  const coordinator = createSessionCoordinator({
    auth,
    storage,
    adoption: {
      isConfirmed: (id) => confirmed.has(id),
      restoreGuest() {
        for (const key of PERSONAL_DATA_KEYS) geraet.daten.delete(key);
        for (const key of Object.values(ACCT_KEYS)) geraet.daten.delete(key);
        geraet.daten.set("kd:master", guestWert);
        confirmed.delete("konto-A");
        return { ok: true, quelle: "gast-rueckholpunkt" };
      },
      quarantine: () => ({ ok: false }),
    },
    eventTarget: null,
  });

  await coordinator.initialize();
  await coordinator.signOut();
  assert.equal(geraet.daten.get("kd:master"), guestWert);
  await coordinator.signIn("max", "passwort");
  assert.equal(coordinator.getStorageState(), STORAGE_SESSION_STATES.AWAITING_ADOPTION);

  const inventurDriver = createAccountDriver({
    config: CONFIG,
    getAccessToken: async () => "token-A-relogin",
    fetchImpl: postgrestMock,
    isActive: () => globalThis.localStorage === geraet.storage,
  });
  await kontoSicherAutomatischLaden("konto-A", {
    inventur: async () => {
      const inv = await aufGeraet(geraet, () => inventurDriver.inventur());
      return { ...inv, erreichbar: true, lokaleWerte: { "kd:master": guestWert } };
    },
    kontoLaden: async () => {
      binde(geraet, "konto-A", "epoch-nach-relogin");
      currentDriver = treiber(
        geraet, "konto-A", "epoch-nach-relogin", "token-A-relogin",
      );
      return aufGeraet(geraet, () => currentDriver.pull());
    },
    bestaetigen: async (id) => { confirmed.add(id); active = true; prepared = id; },
  });
  await coordinator.refresh();

  check("Logout und Relogin führen über SessionCoordinator zum richtigen getrennten Kontostand",
    coordinator.getStorageState() === STORAGE_SESSION_STATES.READY
      && geraet.daten.get("kd:master") === "A-NACH-RELOGIN"
      && serverZeile("konto-A", "kd:master")?.value === "A-NACH-RELOGIN");
}

/* 4. Beide Geräte kennen Revision 5. Gerät 1 gewinnt Revision 6; Gerät 2
   darf mit der alten Revision weder blind noch implizit überschreiben. */
{
  server = new Map(); requests = []; offlineTokens.clear();
  seed("konto-A", "kd:mustwatch", "AUSGANG", 5);
  const eins = browserSpeicher();
  const zwei = browserSpeicher();
  binde(eins, "konto-A", "epoch-eins");
  binde(zwei, "konto-A", "epoch-zwei");
  const driverEins = treiber(eins, "konto-A", "epoch-eins", "token-A-1");
  const driverZwei = treiber(zwei, "konto-A", "epoch-zwei", "token-A-2");
  await aufGeraet(eins, () => driverEins.pull());
  await aufGeraet(zwei, () => driverZwei.pull());
  await aufGeraet(eins, async () => {
    await driverEins.set("kd:mustwatch", "GERAET-EINS");
    await driverEins.syncFlush();
  });
  await aufGeraet(zwei, async () => {
    await driverZwei.set("kd:mustwatch", "GERAET-ZWEI");
    await driverZwei.syncFlush();
  });
  const statusZwei = aufGeraetSync(zwei, () => driverZwei.status());
  const snapshotsZwei = aufGeraetSync(
    zwei,
    () => driverZwei.getSnapshots("kd:mustwatch"),
  );

  check("Eine konkurrierende Revision wird erkannt und nicht überschrieben",
    serverZeile("konto-A", "kd:mustwatch")?.value === "GERAET-EINS"
      && serverZeile("konto-A", "kd:mustwatch")?.revision === 6
      && zwei.daten.get("kd:mustwatch") === "GERAET-ZWEI"
      && statusZwei.conflict.includes("kd:mustwatch")
      && snapshotsZwei.some((entry) => entry.value === "GERAET-ZWEI"));
}

/* 5. Sieben Tage werden über eine injizierte Uhr und einen vorgerückten
   Server-Revisionsstand hergestellt, nicht durch Wartezeit. */
{
  server = new Map(); requests = []; offlineTokens.clear();
  const tag0 = "2026-09-01T08:00:00.000Z";
  const tag7 = "2026-09-08T08:00:00.000Z";
  seed("konto-A", "kd:vokabular", "SERVER-R4", 4);
  const offlineGeraet = browserSpeicher();
  binde(offlineGeraet, "konto-A", "epoch-offline");
  const driver = treiber(offlineGeraet, "konto-A", "epoch-offline", "token-A-1");
  await mitUhr(tag0, () => aufGeraet(offlineGeraet, () => driver.pull()));
  offlineGeraet.daten.set(ACCT_KEYS.snap, JSON.stringify({
    "kd:vokabular": [{ t: tag0, value: "ALTER-RUECKHOLPUNKT" }],
  }));
  offlineTokens.add("token-A-1");
  await mitUhr(tag0, () => aufGeraet(offlineGeraet, async () => {
    await driver.set("kd:vokabular", "SIEBEN-TAGE-LOKAL");
    await driver.syncFlush();
  }));
  offlineTokens.delete("token-A-1");
  seed("konto-A", "kd:vokabular", "SERVER-R5", 5);
  await mitUhr(tag7, () => aufGeraet(offlineGeraet, () => driver.pull()));
  const snapshots = await mitUhr(
    tag7,
    () => aufGeraet(offlineGeraet, () => driver.getSnapshots("kd:vokabular")),
  );
  const status = aufGeraetSync(offlineGeraet, () => driver.status());

  check("Ein sieben Tage alter nicht abgeglichener Stand wird deterministisch als Revisionskonflikt geschützt",
    offlineGeraet.daten.get("kd:vokabular") === "SIEBEN-TAGE-LOKAL"
      && serverZeile("konto-A", "kd:vokabular")?.value === "SERVER-R5"
      && status.conflict.includes("kd:vokabular")
      && status.lastPull === tag7
      && snapshots.length === 1
      && snapshots[0]?.t === tag7
      && snapshots[0]?.value === "SIEBEN-TAGE-LOKAL");
}

/* 6. Beschädigte Status-, Owner- oder Epoch-Metadaten öffnen keinen Cache
   und lösen auch keinen Request mit womöglich fremdem Kontext aus. */
{
  server = new Map(); requests = []; offlineTokens.clear();
  seed("konto-A", "kd:master", "SERVER-A", 2);
  seed("konto-B", "kd:master", "SERVER-B", 9);
  const kaputt = browserSpeicher({
    "kd:master": "LOKAL-A-UNGESICHERT",
    [ACCT_KEYS.owner]: "konto-A",
    [ACCT_KEYS.epoch]: "{",
    [ACCT_KEYS.bindingSchema]: JSON.stringify({ v: 1, accountId: "konto-A" }),
    [ACCT_KEYS.status]: "{",
  });
  let masked = false;
  let restoreCalls = 0;
  const privacyCoordinator = createSessionCoordinator({
    auth: {
      getSnapshot: () => ({ mode: "guest", state: "ready", account: null }),
      initialize: async () => ({ mode: "guest", state: "ready", account: null }),
    },
    storage: {
      cacheOwner: () => kaputt.daten.get(ACCT_KEYS.owner),
      currentTransition: () => null,
      hasOpenChanges: () => aufGeraetSync(kaputt, () => hatOffeneKontoCacheAenderungen()),
      mask() { masked = true; },
      masked: () => masked,
      cleanupOrphanMetadata: () => true,
      active: () => false,
      preparedAccountId: () => null,
    },
    adoption: {
      isConfirmed: () => false,
      restoreGuest() { restoreCalls += 1; return { ok: true }; },
      quarantine: () => ({ ok: false }),
    },
    eventTarget: null,
  });
  await assert.rejects(
    privacyCoordinator.initialize(),
    (error) => error?.code === "PERSONAL_DATA_PRIVACY_LOCKED",
  );

  const requestsVorher = requests.length;
  const epochKaputtDriver = treiber(kaputt, "konto-A", "epoch-erwartet", "token-A-1");
  await assert.rejects(
    aufGeraet(kaputt, () => epochKaputtDriver.set("kd:master", "DARF-NICHT")),
    (error) => error?.code === "ACCOUNT_CONTEXT_CHANGED",
  );
  kaputt.daten.set(ACCT_KEYS.epoch, JSON.stringify({ accountId: "konto-A", token: "epoch-erwartet" }));
  kaputt.daten.set(ACCT_KEYS.owner, "konto-B");
  const ownerFalsch = await aufGeraet(kaputt, () => epochKaputtDriver.pull());

  check("Beschädigter Cache, Owner oder Epoch fällt ohne fremde oder still verlorene Daten geschlossen aus",
    masked && restoreCalls === 0
      && privacyCoordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED
      && ownerFalsch.inactive === true
      && requests.length === requestsVorher
      && kaputt.daten.get("kd:master") === "LOKAL-A-UNGESICHERT"
      && serverZeile("konto-A", "kd:master")?.value === "SERVER-A"
      && serverZeile("konto-B", "kd:master")?.value === "SERVER-B");
}

console.log(`\nACCOUNT-SYNC-SZENARIEN BESTANDEN (${checks}/${checks})`);

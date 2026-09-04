import assert from "node:assert/strict";

const browserStore = new Map();
globalThis.localStorage = {
  getItem: (key) => browserStore.has(key) ? browserStore.get(key) : null,
  setItem: (key, value) => { browserStore.set(key, String(value)); },
  removeItem: (key) => { browserStore.delete(key); },
  clear: () => browserStore.clear(),
  key: (index) => [...browserStore.keys()][index] ?? null,
  get length() { return browserStore.size; },
};

const {
  baueBackup,
  pruefeLokaleBackupVollstaendigkeit,
} = await import("./src/lib/backup.js");
const { PERSONAL_DATA_ENTRIES } = await import("./src/lib/personalDataRegistry.js");
const {
  ladeGebundeneSicherheitskopieHerunter,
} = await import("./src/controllers/useBackupExportController.js");
const {
  LOCAL_DATA_SAFETY_ERROR,
  createLocalDataSafetyController,
} = await import("./src/controllers/localDataSafetyController.js");
const {
  AUTH_SESSION_KEY,
  AUTH_ZUSTAND,
  createAuthDriver,
  hatGespeicherteSitzung,
} = await import("./src/lib/authDriver.js");
const {
  createSessionCoordinator,
  sicherePrivacyRecoveryFehler,
} = await import("./src/services/sessionCoordinator.js");

let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`✓ ${name}`);
}

function localContext(initial = []) {
  const values = new Map(initial);
  let generation = 1;
  const context = {
    name: "lokal",
    owner: "guest-local",
    get generation() { return generation; },
    isCurrent: () => generation === 1,
    async get(key) { return values.has(key) ? { key, value: values.get(key) } : null; },
    async set(key, value) { values.set(key, String(value)); return { key, value: String(value) }; },
    async delete(key) { values.delete(key); return { key, deleted: true }; },
    async pull() { return { ok: true, noop: true }; },
  };
  return { context, values, switchContext: () => { generation++; } };
}

async function localDownload(context, overrides = {}) {
  return ladeGebundeneSicherheitskopieHerunter({
    storageContext: context,
    createBlob: (text) => text,
    createObjectURL: () => "blob:b1",
    revokeObjectURL: () => {},
    createAnchor: () => ({ click() {} }),
    now: () => new Date("2026-09-04T12:00:00.000Z"),
    ...overrides,
  });
}

await check("R-01: leeres, aber vollständiges Register übersteht JSON- und Restore-Roundtrip", async () => {
  const { context } = localContext();
  const backup = await baueBackup({ pull: false, storageContext: context });
  const beleg = pruefeLokaleBackupVollstaendigkeit(backup);
  assert.equal(beleg.ok, true);
  assert.equal(beleg.registryEntries, PERSONAL_DATA_ENTRIES.length);
  assert.equal(backup._vollstaendigkeit.status, "VOLLSTAENDIG");
  for (const entry of PERSONAL_DATA_ENTRIES) {
    assert.ok(Object.prototype.hasOwnProperty.call(JSON.parse(JSON.stringify(backup)), entry.backupField));
  }
});

await check("R-01: Warnung oder fehlendes Registry-Feld kann keine Löschfreigabe erzeugen", async () => {
  const { context } = localContext([["kd:master", "{kaputt"]]);
  const result = await localDownload(context);
  assert.equal(result.clicked, true);
  assert.equal(result.vollstaendigkeit.ok, false);
  assert.ok(result.vollstaendigkeit.fehler.includes("warnungen"));

  const controller = createLocalDataSafetyController({
    captureContext: () => context,
    getSession: () => ({ mode: "guest", state: "ready", account: null }),
    downloadSafetyCopy: () => Promise.resolve(result),
    reload: () => assert.fail("Löschung darf nicht beginnen"),
  });
  await assert.rejects(
    () => controller.download(),
    (error) => error?.code === LOCAL_DATA_SAFETY_ERROR.SAFETY_COPY_FAILED
      && /Löschung bleibt gesperrt/.test(error.message),
  );
  await assert.rejects(
    () => controller.deleteLocalContents(null),
    (error) => error?.code === LOCAL_DATA_SAFETY_ERROR.SAFETY_COPY_REQUIRED,
  );
});

await check("R-01: bloßer Klickbeleg und fehlgeschlagene Serialisierung bleiben geschlossen", async () => {
  const { context } = localContext();
  const nurKlick = createLocalDataSafetyController({
    captureContext: () => context,
    getSession: () => ({ mode: "guest", account: null }),
    downloadSafetyCopy: async () => ({ clicked: true }),
  });
  await assert.rejects(
    () => nurKlick.download(),
    (error) => error?.code === LOCAL_DATA_SAFETY_ERROR.SAFETY_COPY_FAILED,
  );
  let klicks = 0;
  await assert.rejects(() => localDownload(context, {
    buildBackup: async () => ({ format: "kinodreieck-backup", version: 1, unmoeglich: 1n }),
    createAnchor: () => ({ click: () => { klicks++; } }),
  }), TypeError);
  assert.equal(klicks, 0);
});

await check("R-01: Änderung nach vollständigem Download sperrt die Löschung vor dem ersten Delete", async () => {
  const { context, values } = localContext([["kd:autor-name", "Vorher"]]);
  const controller = createLocalDataSafetyController({
    captureContext: () => context,
    getSession: () => ({ mode: "guest", state: "ready", account: null }),
    downloadSafetyCopy: (options) => localDownload(options.storageContext),
    reload: () => assert.fail("Löschung darf nicht beginnen"),
  });
  const receipt = await controller.download();
  values.set("kd:autor-name", "Nachher");
  await assert.rejects(
    () => controller.deleteLocalContents(receipt),
    (error) => error?.code === LOCAL_DATA_SAFETY_ERROR.SAFETY_COPY_STALE,
  );
  assert.equal(values.get("kd:autor-name"), "Nachher");
});

const AUTH_CONFIG = {
  supabaseUrl: "https://projekt.supabase.co",
  supabasePublishableKey: "sb_publishable_b1",
};
let authNow = 1_800_000_000_000;
let authMode = "valid";
function response(status, data) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
function tokenPayload(overrides = {}) {
  return {
    access_token: "access-b1",
    refresh_token: "refresh-b1",
    expires_in: 3600,
    user: { id: "konto-b1", email: "max@login.kinodreieck.at" },
    ...overrides,
  };
}
async function authFetch(url) {
  const path = String(url).replace(AUTH_CONFIG.supabaseUrl, "");
  if (path.startsWith("/auth/v1/token?grant_type=password")) {
    if (authMode === "missing-access") return response(200, tokenPayload({ access_token: "" }));
    if (authMode === "missing-refresh") return response(200, tokenPayload({ refresh_token: "" }));
    if (authMode === "missing-user") return response(200, tokenPayload({ user: { id: "", email: "" } }));
    if (authMode === "wrong-email") return response(200, tokenPayload({ user: { id: "konto-b1", email: "fremd@login.kinodreieck.at" } }));
    if (authMode === "wrong-account") return response(200, tokenPayload({ user: { id: "konto-fremd", email: "max@login.kinodreieck.at" } }));
    if (authMode === "invalid-expiry") return response(200, tokenPayload({ expires_in: 0 }));
    if (authMode === "past-expiry") return response(200, tokenPayload({ expires_at: (authNow / 1000) - 1 }));
    return response(200, tokenPayload());
  }
  if (path.startsWith("/auth/v1/token?grant_type=refresh_token")) {
    if (authMode === "malformed-refresh") return response(200, tokenPayload({ user: null }));
    return response(200, tokenPayload({ access_token: "access-neu", refresh_token: "refresh-neu" }));
  }
  if (path.startsWith("/auth/v1/logout")) return response(204, null);
  return response(404, {});
}

await check("R-05: Login validiert Access, Refresh, Identität, E-Mail und Expiry vor Persistenz", async () => {
  browserStore.clear();
  authMode = "valid";
  const driver = createAuthDriver({ config: AUTH_CONFIG, fetchImpl: authFetch, jetzt: () => authNow });
  await driver.signIn("max", "passwort");
  const vorher = browserStore.get(AUTH_SESSION_KEY);
  for (const mode of [
    "missing-access", "missing-refresh", "missing-user", "wrong-email",
    "invalid-expiry", "past-expiry",
  ]) {
    authMode = mode;
    await assert.rejects(
      () => driver.signIn("max", "passwort"),
      (error) => error?.code === "invalid-response"
        && error?.reason === "incomplete-session-contract",
    );
    assert.equal(browserStore.get(AUTH_SESSION_KEY), vorher);
  }
});

await check("R-05: malformed Refresh und Reauth überschreiben die alte Sitzung nicht", async () => {
  browserStore.clear();
  authMode = "valid";
  const driver = createAuthDriver({ config: AUTH_CONFIG, fetchImpl: authFetch, jetzt: () => authNow });
  await driver.signIn("max", "passwort");
  const vorher = browserStore.get(AUTH_SESSION_KEY);
  for (const mode of ["missing-user", "wrong-account", "wrong-email"]) {
    authMode = mode;
    await assert.rejects(
      () => driver.reauthenticate("passwort"),
      (error) => error?.code === "invalid-response",
    );
    assert.equal(browserStore.get(AUTH_SESSION_KEY), vorher);
  }

  authNow += 3600_000;
  authMode = "malformed-refresh";
  assert.equal(await driver.getAccessToken(), "access-b1");
  assert.equal(driver.getZustand(), AUTH_ZUSTAND.DEGRADIERT);
  assert.equal(browserStore.get(AUTH_SESSION_KEY), vorher);
});

await check("R-05: unvollständige persistierte Altsitzung wird nicht als Anmeldung geladen", async () => {
  browserStore.clear();
  browserStore.set(AUTH_SESSION_KEY, JSON.stringify({
    v: 1, access_token: "a", refresh_token: "r", gueltigBis: authNow + 10_000,
    kontoId: "", mail: "",
  }));
  const driver = createAuthDriver({ config: AUTH_CONFIG, fetchImpl: authFetch, jetzt: () => authNow });
  assert.equal(driver.konto(), null);
  assert.equal(hatGespeicherteSitzung(), false);
  assert.equal((await driver.loadSession()).mode, "guest");
});

await check("R-13: Privacy-Recovery behält Codes, entfernt aber interne Ursache und Details", async () => {
  const intern = new Error("ROHDETAIL_4711", {
    cause: new Error("CAUSE_DETAIL_815"),
  });
  intern.code = "ACCOUNT_LOAD_FAILED";
  const sicher = sicherePrivacyRecoveryFehler(intern);
  assert.equal(sicher.code, "ACCOUNT_LOAD_FAILED");
  assert.match(sicher.message, /erneut/);
  assert.ok(!sicher.message.includes("ROHDETAIL_4711"));
  assert.equal(sicher.cause, undefined);

  const account = {
    mode: "account", state: "ready", account: { id: "konto-b1" },
    capabilities: { remoteStorage: true, personalAi: false },
  };
  const coordinator = createSessionCoordinator({
    auth: {
      getSnapshot: () => ({ mode: "guest", state: "ready", account: null }),
      signIn: async () => account,
    },
    storage: {
      cacheOwner: () => "",
      hasOpenChanges: () => false,
      currentTransition: () => null,
      masked: () => true,
      accessBlocked: () => false,
      prepare() { throw new Error("ROHDETAIL_STORAGE_922"); },
      cleanupOrphanMetadata: () => true,
      active: () => false,
      preparedAccountId: () => null,
    },
    adoption: { isConfirmed: () => false },
    eventTarget: null,
  });
  await assert.rejects(
    () => coordinator.signIn("max", "passwort"),
    (error) => error?.code === "PERSONAL_DATA_PRIVACY_LOCKED"
      && /Persönliche Daten bleiben geschützt/.test(error.message)
      && !/ROHDETAIL|STORAGE/i.test(error.message)
      && error.cause === undefined,
  );
});

console.log(`\nCLEANUP-B1-TEST BESTANDEN (${checks}/${checks})`);

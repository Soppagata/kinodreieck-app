/* Upgrade-Regressionsgate: frischer Modulgraph pro Fall, ausschließlich lokale
   localStorage-Mocks. Keine Netzwerk- oder Anbieteraufrufe. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

async function childMain() {
  const cfg = JSON.parse(process.env.KD_EPOCH_SCENARIO || "{}");
  const daten = new Map();
  const kontoId = cfg.authId || "konto-A";
  daten.set("kd:auth:session", JSON.stringify({
    v: 1,
    access_token: "lokaler-test-token",
    refresh_token: "lokaler-test-refresh",
    gueltigBis: Date.now() + 60 * 60 * 1000,
    kontoId,
    mail: `${kontoId}@login.kinodreieck.at`,
    benutzername: kontoId,
  }));
  if (cfg.owner !== null) daten.set("kd:acct:owner", cfg.owner || "konto-A");
  if (cfg.confirmed !== false) {
    daten.set("kd:acct:uebernommen", cfg.confirmedRaw
      || JSON.stringify({ accountId: cfg.confirmedId || "konto-A" }));
  }
  if (Object.hasOwn(cfg, "epochRaw")) daten.set("kd:acct:epoch", cfg.epochRaw);
  if (Object.hasOwn(cfg, "bindingRaw")) daten.set("kd:acct:binding-schema", cfg.bindingRaw);
  if (Object.hasOwn(cfg, "transitionRaw")) daten.set("kd:acct:transition", cfg.transitionRaw);
  daten.set("kd:master", "LEGACY-ACCOUNT-A");
  daten.set("kd:acct:status", cfg.statusRaw || JSON.stringify({ pending: {}, conflict: {} }));
  daten.set("kd:acct:snap", "LEGACY-SNAPSHOT-A");

  const unveraenderlich = [
    "kd:acct:owner", "kd:acct:uebernommen", "kd:master", "kd:acct:status", "kd:acct:snap",
  ];
  const vorher = Object.fromEntries(unveraenderlich.map((key) => [key, daten.get(key) ?? null]));
  globalThis.localStorage = {
    getItem(key) {
      if (cfg.getThrowKey === key) throw new Error("get-blockiert");
      return daten.has(key) ? daten.get(key) : null;
    },
    setItem(key, value) {
      if (cfg.setThrowKey === key) throw new Error("set-blockiert");
      if (cfg.setNoopKey !== key) daten.set(key, String(value));
    },
    removeItem(key) {
      if (cfg.removeThrowKey === key) throw new Error("remove-blockiert");
      if (cfg.removeNoopKey !== key) daten.delete(key);
    },
    clear() { daten.clear(); },
    key(index) { return [...daten.keys()][index] ?? null; },
    get length() { return daten.size; },
  };
  globalThis.fetch = async () => { throw new Error("Netz im Upgrade-Test verboten"); };

  const { createSessionCoordinator } = await import("./src/services/sessionCoordinator.js");
  const accessSession = Object.freeze({
    mode: "account", state: "ready",
    account: Object.freeze({ id: kontoId, displayName: kontoId, role: "member" }),
    capabilities: Object.freeze({ remoteStorage: true, personalAi: false }),
    access: Object.freeze({ status: "resolved", role: "member" }),
  });
  const auth = {
    getSnapshot: () => accessSession,
    initialize: async () => accessSession,
  };
  const sessionCoordinator = createSessionCoordinator({ auth, eventTarget: null });
  let session = null;
  let error = null;
  try { session = await sessionCoordinator.initialize(); }
  catch (cause) { error = { code: cause?.code || null, message: cause?.message || String(cause) }; }
  const nachher = Object.fromEntries(unveraenderlich.map((key) => [key, daten.get(key) ?? null]));
  console.log("@@EPOCH_RESULT@@" + JSON.stringify({
    error,
    session,
    auth: auth.getSnapshot(),
    storageState: sessionCoordinator.getStorageState(),
    epochRaw: daten.get("kd:acct:epoch") ?? null,
    bindingRaw: daten.get("kd:acct:binding-schema") ?? null,
    transitionRaw: daten.get("kd:acct:transition") ?? null,
    vorher,
    nachher,
  }));
}

const CHILD_SOURCE = `(${childMain.toString()})()`;
function szenario(config = {}) {
  const lauf = spawnSync(process.execPath, ["--input-type=module", "--eval", CHILD_SOURCE], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, KD_EPOCH_SCENARIO: JSON.stringify(config) },
  });
  assert.equal(lauf.status, 0, lauf.stderr || lauf.stdout);
  const zeile = lauf.stdout.split(/\r?\n/).find((wert) => wert.startsWith("@@EPOCH_RESULT@@"));
  assert.ok(zeile, lauf.stdout || "Upgrade-Test lieferte kein Ergebnis");
  return JSON.parse(zeile.slice("@@EPOCH_RESULT@@".length));
}

let checks = 0;
function check(name, pruefung) {
  assert.ok(pruefung, name);
  checks++;
  console.log("✓ " + name);
}

{
  const r = szenario();
  const epoch = JSON.parse(r.epochRaw);
  const bindung = JSON.parse(r.bindingRaw);
  check("Bestätigter Same-Owner-Legacycache erhält genau eine Epoch und wird READY",
    !r.error && r.session?.mode === "account" && r.storageState === "account-ready"
      && epoch.accountId === "konto-A" && !!epoch.token
      && bindung.v === 1 && bindung.accountId === "konto-A"
      && r.transitionRaw === null);
  check("Legacy-Migration verändert Owner, Bestätigung und persönliche Rohwerte nicht",
    JSON.stringify(r.vorher) === JSON.stringify(r.nachher));
}

{
  const statusRaw = JSON.stringify({ pending: { "kd:master": true }, conflict: { "kd:artikel": true } });
  const r = szenario({ statusRaw });
  check("Offene Legacy-Metadaten bleiben bytegleich und blockieren die Same-Owner-Migration nicht",
    !r.error && r.storageState === "account-ready" && r.nachher["kd:acct:status"] === statusRaw);
}

{
  const epochRaw = JSON.stringify({ accountId: "konto-A", token: "bestehende-epoch" });
  const r = szenario({ epochRaw });
  check("Bestehende gültige Epoch wird beim Schema-Upgrade nicht rotiert",
    !r.error && r.storageState === "account-ready" && r.epochRaw === epochRaw
      && JSON.parse(r.bindingRaw).accountId === "konto-A");
}

{
  const r = szenario({ confirmed: false });
  check("Unbestätigter Same-Owner-Bestand bleibt im Übernahme-Assistenten und erhält keine Epoch",
    !r.error && r.storageState === "account-awaiting-adoption"
      && r.epochRaw === null && r.bindingRaw === null && r.transitionRaw === null);
}

{
  const r = szenario({ epochRaw: "{kaputt" });
  check("Beschädigte Epoch wird nicht als fehlend überschrieben",
    r.error?.code === "PERSONAL_DATA_PRIVACY_LOCKED" && r.epochRaw === "{kaputt"
      && r.bindingRaw === null && r.storageState === "privacy-locked");
}

{
  const bindingRaw = JSON.stringify({ v: 1, accountId: "konto-A" });
  const r = szenario({ bindingRaw });
  check("Fehlende Epoch nach bereits belegter Migration gilt als Korruption",
    r.error?.code === "PERSONAL_DATA_PRIVACY_LOCKED" && r.epochRaw === null
      && r.bindingRaw === bindingRaw && r.storageState === "privacy-locked");
}

{
  const r = szenario({ setNoopKey: "kd:acct:transition" });
  check("Nicht persistierbarer Migrationsmarker aktiviert keinen Kontotreiber",
    r.error?.code === "PERSONAL_DATA_PRIVACY_LOCKED" && r.epochRaw === null
      && r.bindingRaw === null && r.transitionRaw === null && r.storageState === "privacy-locked");
}

{
  const r = szenario({ setNoopKey: "kd:acct:epoch" });
  check("Nicht bestätigter Epoch-Write bleibt mit Marker fail-closed",
    r.error?.code === "PERSONAL_DATA_PRIVACY_LOCKED" && r.epochRaw === null
      && r.bindingRaw === null && !!r.transitionRaw && r.storageState === "privacy-locked");
}

{
  const r = szenario({ removeNoopKey: "kd:acct:transition" });
  check("Nicht entfernbarer Marker lässt auch eine geschriebene Epoch gesperrt",
    r.error?.code === "PERSONAL_DATA_PRIVACY_LOCKED" && !!r.epochRaw
      && !!r.bindingRaw && !!r.transitionRaw && r.storageState === "privacy-locked");
}

const crashMarker = JSON.stringify({
  accountId: "konto-A",
  zweck: "legacy-epoch-migration",
  token: "legacy-crash-marker",
  t: "2026-08-08T12:00:00.000Z",
});

{
  const r = szenario({ transitionRaw: crashMarker });
  check("Crash direkt nach dem Migrationsmarker wird idempotent fortgesetzt",
    !r.error && r.storageState === "account-ready" && !!r.epochRaw && !!r.bindingRaw
      && r.transitionRaw === null && JSON.stringify(r.vorher) === JSON.stringify(r.nachher));
}

{
  const epochRaw = JSON.stringify({ accountId: "konto-A", token: "epoch-vor-crash" });
  const r = szenario({ transitionRaw: crashMarker, epochRaw });
  check("Crash nach dem Epoch-Write ergänzt nur das Bindungsschema",
    !r.error && r.storageState === "account-ready" && r.epochRaw === epochRaw
      && JSON.parse(r.bindingRaw).accountId === "konto-A" && r.transitionRaw === null
      && JSON.stringify(r.vorher) === JSON.stringify(r.nachher));
}

{
  const epochRaw = JSON.stringify({ accountId: "konto-A", token: "epoch-vor-confirm" });
  const bindingRaw = JSON.stringify({ v: 1, accountId: "konto-A" });
  const r = szenario({ transitionRaw: crashMarker, epochRaw, bindingRaw });
  check("Crash vor dem Confirm übernimmt die bestehende Bindung ohne Rotation",
    !r.error && r.storageState === "account-ready" && r.epochRaw === epochRaw
      && r.bindingRaw === bindingRaw && r.transitionRaw === null
      && JSON.stringify(r.vorher) === JSON.stringify(r.nachher));
}

{
  const r = szenario({ transitionRaw: "{kaputt" });
  check("Ein beschädigter Transitionmarker wird niemals als Legacy-Migration übernommen",
    r.error?.code === "PERSONAL_DATA_PRIVACY_LOCKED" && r.epochRaw === null
      && r.bindingRaw === null && r.transitionRaw === "{kaputt"
      && r.storageState === "privacy-locked");
}

console.log(`ACCOUNT-EPOCH-UPGRADE-TEST BESTANDEN (${checks}/${checks})`);

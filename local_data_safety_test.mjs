import assert from "node:assert/strict";
import {
  LOCAL_CONTENT_DELETE_KEYS,
  LOCAL_DATA_SAFETY_ERROR,
  createLocalDataSafetyController,
} from "./src/controllers/localDataSafetyController.js";
import { ACCOUNT_CACHE_METADATA_KEYS } from "./src/lib/accountStorageKeys.js";
import { baueBackup, pruefeLokaleBackupVollstaendigkeit } from "./src/lib/backup.js";
import { createEmptyLocalRadar } from "./src/lib/localEventRadar.js";
import { LOCAL_RETENTION_KEYS } from "./src/lib/localRetention.js";
import { PERSONAL_DATA_KEYS, VERALTETE_PRIVACY_KEYS } from "./src/lib/personalDataRegistry.js";
import { K } from "./src/lib/storage.js";
import { UEBERNOMMEN_KEY } from "./src/lib/uebernahme.js";

let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log("✓ " + name);
}

function harness({ deleteNoopKey = null } = {}) {
  const values = new Map();
  let generation = 1;
  let session = { mode: "guest", state: "ready", account: null };
  let reloads = 0;
  let downloads = 0;
  const captureContext = () => {
    const captured = generation;
    const context = {
      generation: captured,
      name: "lokal",
      owner: "guest-local",
      isCurrent: () => captured === generation,
      async get(key) {
        if (!context.isCurrent()) throw Object.assign(new Error("context changed"), { code: "STORAGE_CONTEXT_CHANGED" });
        return values.has(key) ? { key, value: values.get(key) } : null;
      },
      async set(key, value) {
        if (!context.isCurrent()) throw Object.assign(new Error("context changed"), { code: "STORAGE_CONTEXT_CHANGED" });
        values.set(key, value);
        return { key, value };
      },
      async delete(key) {
        if (!context.isCurrent()) throw Object.assign(new Error("context changed"), { code: "STORAGE_CONTEXT_CHANGED" });
        if (key !== deleteNoopKey) values.delete(key);
        return { key, deleted: key !== deleteNoopKey };
      },
    };
    return context;
  };
  const controller = createLocalDataSafetyController({
    captureContext,
    getSession: () => session,
    async downloadSafetyCopy({ storageContext }) {
      assert.equal(storageContext.generation, generation);
      downloads++;
      const backup = await baueBackup({ pull: false, storageContext });
      return {
        ok: true,
        clicked: true,
        backup,
        vollstaendigkeit: pruefeLokaleBackupVollstaendigkeit(backup),
      };
    },
    reload: () => { reloads++; },
    now: () => 1234,
  });
  return {
    values,
    controller,
    get downloads() { return downloads; },
    get reloads() { return reloads; },
    setSession(next) { session = next; },
    switchContext() { generation++; },
  };
}

function fuelleGueltigenLoeschstand(h, prefix) {
  for (const key of LOCAL_CONTENT_DELETE_KEYS) h.values.set(key, `${prefix}:${key}`);
  const registryRohwerte = new Map([
    [K.master, JSON.stringify({ filme: [], gespeichertAm: 1 })],
    [K.artikel, JSON.stringify({ artikel: [], gespeichertAm: 1 })],
    [K.kinoPins, "[]"],
    [K.wochenplan, JSON.stringify({ version: 1, eintraege: [] })],
    [K.radar, JSON.stringify(createEmptyLocalRadar({ authority: "guest" }))],
    [K.merkliste, "[]"],
    [K.vokabular, "[]"],
    [K.einstellungen, "{}"],
    [K.entdeckenStatus, "{}"],
    [K.autorName, `Test ${prefix}`],
    [K.streamingDienste, "{}"],
    [K.mustwatch, JSON.stringify({ eintraege: [], gespeichertAm: 1 })],
    [K.achievements, "{}"],
    [K.zeitgrenze, "14:00"],
    [K.filterMediathek, "0"],
    [K.filterKino, "0"],
    [K.filterStreaming, "0"],
    [K.geschmacksprofil, "{}"],
  ]);
  for (const [key, value] of registryRohwerte) h.values.set(key, value);
  return new Map(h.values);
}

const erwarteteSchluessel = new Set([
  ...PERSONAL_DATA_KEYS,
  ...Object.values(LOCAL_RETENTION_KEYS),
  ...ACCOUNT_CACHE_METADATA_KEYS,
  ...VERALTETE_PRIVACY_KEYS,
  UEBERNOMMEN_KEY,
  K.exportStand,
  K.demoSeed,
]);
check("Löschvertrag enthält genau persönliche Töpfe, Rückholpunkte und freigegebene lokale Metadaten",
  LOCAL_CONTENT_DELETE_KEYS.length === erwarteteSchluessel.size
  && LOCAL_CONTENT_DELETE_KEYS.every((key) => erwarteteSchluessel.has(key)));
check("Auth, Katalog/PWA und größerer Browserreset liegen außerhalb des Löschvertrags",
  !LOCAL_CONTENT_DELETE_KEYS.includes("kd:auth:session")
  && !LOCAL_CONTENT_DELETE_KEYS.includes(K.programm)
  && !LOCAL_CONTENT_DELETE_KEYS.includes(K.katalogKey)
  && !LOCAL_CONTENT_DELETE_KEYS.includes(K.einstieg));

{
  const h = harness();
  await assert.rejects(
    () => h.controller.deleteLocalContents(null),
    (error) => error?.code === LOCAL_DATA_SAFETY_ERROR.SAFETY_COPY_REQUIRED,
  );
  check("Ohne bestätigten Download bleibt die lokale Löschung gesperrt", h.downloads === 0 && h.reloads === 0);
}

{
  const h = harness();
  fuelleGueltigenLoeschstand(h, "wert");
  h.values.set("kd:auth:session", "auth-bleibt");
  h.values.set(K.programm, "katalog-bleibt");
  h.values.set(K.einstieg, "einstieg-bleibt");
  const receipt = await h.controller.download();
  const result = await h.controller.deleteLocalContents(receipt);
  check("Erst Download, dann getrennte Löschung entfernt jeden freigegebenen lokalen Schlüssel",
    result.ok === true && LOCAL_CONTENT_DELETE_KEYS.every((key) => !h.values.has(key)));
  check("Auth-, Katalog- und Einstiegszustand bleiben unangetastet",
    h.values.get("kd:auth:session") === "auth-bleibt"
    && h.values.get(K.programm) === "katalog-bleibt"
    && h.values.get(K.einstieg) === "einstieg-bleibt");
  check("Erfolg wird erst nach Rücklesen gemeldet und lädt die App genau einmal neu",
    result.restKeys.length === 0 && h.reloads === 1 && h.downloads === 1);
}

{
  const h = harness();
  const vorher = fuelleGueltigenLoeschstand(h, "vorher");
  const receipt = await h.controller.download();
  h.switchContext();
  await assert.rejects(
    () => h.controller.deleteLocalContents(receipt),
    (error) => error?.code === LOCAL_DATA_SAFETY_ERROR.CONTEXT_CHANGED,
  );
  check("A/B- oder Treiberwechsel nach dem Download bricht vor jeder Löschung fail-closed ab",
    LOCAL_CONTENT_DELETE_KEYS.every((key) => h.values.get(key) === vorher.get(key)) && h.reloads === 0);
}

{
  const blockiert = LOCAL_CONTENT_DELETE_KEYS[Math.floor(LOCAL_CONTENT_DELETE_KEYS.length / 2)];
  const h = harness({ deleteNoopKey: blockiert });
  const vorher = fuelleGueltigenLoeschstand(h, "vorher");
  const receipt = await h.controller.download();
  await assert.rejects(
    () => h.controller.deleteLocalContents(receipt),
    (error) => error?.code === LOCAL_DATA_SAFETY_ERROR.DELETE_INCOMPLETE && error?.rollback?.ok === true,
  );
  check("Ein stiller Teilfehler wird rückgelesen, nie als Erfolg gemeldet und vollständig zurückgerollt",
    LOCAL_CONTENT_DELETE_KEYS.every((key) => h.values.get(key) === vorher.get(key)) && h.reloads === 0);
}

{
  const h = harness();
  const vorher = fuelleGueltigenLoeschstand(h, "vorher");
  const receipt = await h.controller.download();
  h.setSession({ mode: "account", state: "ready", account: { id: "konto-b" } });
  await assert.rejects(
    () => h.controller.deleteLocalContents(receipt),
    (error) => error?.code === LOCAL_DATA_SAFETY_ERROR.GUEST_CONTEXT_REQUIRED,
  );
  check("Ein Sitzungswechsel zum Konto sperrt die lokale Löschung ohne Remote- oder Local-Write",
    LOCAL_CONTENT_DELETE_KEYS.every((key) => h.values.get(key) === vorher.get(key)) && h.reloads === 0);
}

console.log(`\nLOCAL-DATA-SAFETY-TEST BESTANDEN (${checks}/${checks})`);

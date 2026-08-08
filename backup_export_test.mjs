import assert from "node:assert/strict";
import {
  istArtikelUngesichert,
  istMasterUngesichert,
  starteEinzelExportDownload,
  starteGesamtBackupDownload,
} from "./src/controllers/backupExportController.js";
import { naechsteLokaleMasterHerkunft } from "./src/controllers/masterOriginController.js";
import { brauchtArtikelRevisionMigration } from "./src/controllers/useArticleController.js";
import { baueBackup } from "./src/lib/backup.js";
import { setStorageDriver } from "./src/lib/storage.js";

let checks = 0;
const ok = (bedingung, text) => {
  assert.ok(bedingung, text);
  checks++;
  console.log("✓ " + text);
};

const ablauf = [];
starteGesamtBackupDownload(
  { click: () => ablauf.push("download") },
  (feld, stand) => ablauf.push(`mark:${feld}:${stand}`),
  { master: 11, artikel: 12 },
);
ok(ablauf.join("|") === "download|mark:master:11|mark:artikel:12", "Gesamt-Backup markiert beide enthaltenen Topfstände erst nach erfolgreichem Download-Klick");

const fehlerAblauf = [];
assert.throws(() => starteGesamtBackupDownload(
  { click: () => { fehlerAblauf.push("download"); throw new Error("blockiert"); } },
  (feld) => fehlerAblauf.push(`mark:${feld}`),
  { master: 11, artikel: 12 },
), /blockiert/);
ok(fehlerAblauf.join("|") === "download", "fehlgeschlagener Download-Klick markiert keinen Topf als gesichert");

/* Master wird zuerst gelesen. Während ein späterer Artikel-Read blockiert,
   entsteht ein neuer Masterstand. Das fertige Backup darf nur die tatsächlich
   eingeschlossene Revision 10 markieren, nicht seinen späteren Erstellzeitpunkt. */
const werte = new Map([
  ["kd:master", JSON.stringify({ filme: [{ id: "alt", titel: "Alt" }], gespeichertAm: 10 })],
  ["kd:artikel", JSON.stringify({ artikel: [], gespeichertAm: 12 })],
]);
let loeseArtikel, meldeArtikel;
const artikelGestartet = new Promise((resolve) => { meldeArtikel = resolve; });
const artikelBlockade = new Promise((resolve) => { loeseArtikel = resolve; });
const speicher = {
  async get(key) {
    if (key === "kd:artikel") { meldeArtikel(); await artikelBlockade; }
    const value = werte.get(key);
    return value == null ? null : { key, value };
  },
};
const backupLauf = baueBackup({ pull: false, speicher });
await artikelGestartet;
werte.set("kd:master", JSON.stringify({ filme: [{ id: "neu", titel: "Neu" }], gespeichertAm: 20 }));
loeseArtikel();
const backup = await backupLauf;
ok(backup.masterliste.filme[0].id === "alt" && backup._exportStaende.master === 10,
  "Backup liefert die Revision des tatsächlich gelesenen Masters");

const exportStand = { master: 0, artikel: 0 };
starteGesamtBackupDownload({ click() {} }, (feld, stand) => {
  exportStand[feld] = Math.max(exportStand[feld], stand);
}, backup._exportStaende);
ok(exportStand.master === 10 && JSON.parse(werte.get("kd:master")).gespeichertAm > exportStand.master,
  "ein nach dem Master-Snapshot entstandener Stand bleibt trotz späterem Download ungesichert");

const nurGueltig = [];
starteGesamtBackupDownload({ click() {} }, (feld) => nurGueltig.push(feld), { master: "20", artikel: null });
ok(nurGueltig.length === 0, "fehlende oder nichtnumerische Snapshotstände werden nicht als gesichert markiert");

/* Einzel-Export: während der sichtbare Stand 30 exportiert wird, wartet bereits
   ein Write auf Revision 40. Der Klick darf nur 30 markieren. */
let einzelExportStand = 0;
let sichtbareRevision = 30;
let bestaetigeWrite;
const blockierterWrite = new Promise((resolve) => { bestaetigeWrite = resolve; }).then(() => { sichtbareRevision = 40; });
starteEinzelExportDownload(
  { click() {} },
  (_feld, stand) => { einzelExportStand = Math.max(einzelExportStand, stand); },
  "artikel",
  sichtbareRevision,
);
bestaetigeWrite();
await blockierterWrite;
ok(einzelExportStand === 30 && sichtbareRevision === 40 && sichtbareRevision > einzelExportStand,
  "Einzel-Export markiert bei blockiertem Write nur die tatsächlich sichtbare Revision");

const einzelFehler = [];
assert.throws(() => starteEinzelExportDownload(
  { click() { throw new Error("download blockiert"); } },
  () => einzelFehler.push("markiert"),
  "master",
  40,
), /download blockiert/);
ok(einzelFehler.length === 0, "fehlgeschlagener Einzel-Download markiert keine Revision");

ok(istArtikelUngesichert([{ id: "legacy" }], 0, 0)
  && brauchtArtikelRevisionMigration([{ id: "legacy" }], 0),
"Legacy-Artikel ohne Revision bleiben ungesichert und werden beim Laden migriert");

const nachManuellemEdit = naechsteLokaleMasterHerkunft({ typ: "manuell", zeit: 20 }, 50);
ok(nachManuellemEdit.typ === "storage" && nachManuellemEdit.basis === "Manueller Import"
  && istMasterUngesichert(nachManuellemEdit, 20),
"manueller Import wird beim nächsten lokalen Edit zu einem sichtbar ungesicherten Storage-Stand");

/* Ein Treiberwechsel während des ersten blockierten Reads darf niemals mit
   dem neuen Treiber weiterlaufen und so A-/B-Töpfe in einem Export mischen. */
let masterReadGestartet;
let loeseMasterRead;
const masterReadStart = new Promise((resolve) => { masterReadGestartet = resolve; });
const masterReadBlockade = new Promise((resolve) => { loeseMasterRead = resolve; });
const driverA = {
  name: "backup-a",
  async get(key) {
    if (key === "kd:master") {
      masterReadGestartet();
      await masterReadBlockade;
      return { key, value: JSON.stringify({ filme: [{ id: "a", titel: "A" }], gespeichertAm: 10 }) };
    }
    return null;
  },
  async set() {}, async delete() {}, async list() { return { keys: [] }; },
};
const driverB = {
  name: "backup-b",
  async get(key) { return { key, value: JSON.stringify({ filme: [{ id: "b", titel: "B" }] }) }; },
  async set() {}, async delete() {}, async list() { return { keys: [] }; },
};
setStorageDriver(driverA);
const wechselBackup = baueBackup({ pull: false });
await masterReadStart;
setStorageDriver(driverB);
loeseMasterRead();
await assert.rejects(wechselBackup, (error) => error?.code === "STORAGE_CONTEXT_CHANGED");
ok(true, "Treiberwechsel während eines blockierten Reads bricht das gesamte Backup fail-closed ab");
setStorageDriver(null);

console.log(`\nBACKUP-EXPORT-TEST BESTANDEN (${checks}/${checks})`);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  istArtikelUngesichert,
  istMasterUngesichert,
  starteEinzelExportDownload,
  starteGesamtBackupDownload,
} from "./src/controllers/backupExportController.js";
import { naechsteLokaleMasterHerkunft } from "./src/controllers/masterOriginController.js";
import { brauchtArtikelRevisionMigration } from "./src/controllers/useArticleController.js";
import { baueBackup } from "./src/lib/backup.js";
import {
  ACCOUNT_EXPORT_REQUIRED_SCOPE,
  ACCOUNT_EXPORT_SCOPE_VERSION,
} from "./src/lib/privatePilotOps.js";
import { setStorageDriver } from "./src/lib/storage.js";
import {
  ladeGebundeneSicherheitskopieHerunter,
  ladeVollstaendigenKontoexportHerunter,
} from "./src/controllers/useBackupExportController.js";

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
ok(backup.hinweis.includes("keinen Restore- oder Reimportweg")
  && !backup.hinweis.includes("Backup wiederherstellen"),
"Gerätesicherheitsdatei verspricht keinen im Release verborgenen Restore- oder Reimportweg");

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

const gebundenerKontext = {
  generation: 3,
  name: "lokal",
  owner: "guest-local",
  isCurrent: () => true,
};
const lokalerDownloadAblauf = [];
const lokalerDownload = await ladeGebundeneSicherheitskopieHerunter({
  storageContext: gebundenerKontext,
  async buildBackup({ storageContext, remoteOwnData }) {
    assert.equal(storageContext, gebundenerKontext);
    assert.equal(remoteOwnData, null);
    return { format: "kinodreieck-backup", version: 1, _exportStaende: { master: 41 } };
  },
  markiereExport: (feld, stand) => lokalerDownloadAblauf.push(`mark:${feld}:${stand}`),
  createBlob: (text) => { lokalerDownloadAblauf.push("blob"); return text; },
  createObjectURL: () => { lokalerDownloadAblauf.push("url"); return "blob:lokal"; },
  revokeObjectURL: () => lokalerDownloadAblauf.push("revoke"),
  createAnchor: () => ({ click: () => lokalerDownloadAblauf.push("click") }),
  now: () => new Date("2026-09-01T08:00:00.000Z"),
});
ok(lokalerDownload.clicked === true
  && lokalerDownload.dateiname === "kinodreieck_sicherheitskopie_geraet_2026-09-01.json"
  && !Object.prototype.hasOwnProperty.call(lokalerDownload.backup, "konto_serverdaten")
  && lokalerDownloadAblauf.join("|") === "blob|url|click|mark:master:41|revoke",
"Geräte-Sicherheitskopie bleibt serverdatenfrei und bestätigt den Stand erst nach dem Anchor-Klick");

const blockierterLokalerDownload = [];
await assert.rejects(() => ladeGebundeneSicherheitskopieHerunter({
  storageContext: gebundenerKontext,
  buildBackup: async () => ({ format: "kinodreieck-backup", version: 1, _exportStaende: { master: 42 } }),
  markiereExport: () => blockierterLokalerDownload.push("mark"),
  createBlob: (text) => text,
  createObjectURL: () => "blob:blockiert",
  revokeObjectURL: () => blockierterLokalerDownload.push("revoke"),
  createAnchor: () => ({ click() { blockierterLokalerDownload.push("click"); throw new Error("anchor blockiert"); } }),
}), /anchor blockiert/);
ok(blockierterLokalerDownload.join("|") === "click|revoke",
  "Blockierter Anchor-Klick gibt weder Löschfreigabe noch Exportmarkierung vor");

let ownDataCalls = 0;
await assert.rejects(() => ladeVollstaendigenKontoexportHerunter({
  aktiviert: false,
  storageContext: gebundenerKontext,
  getValidatedOwnData: async () => { ownDataCalls++; return {}; },
}), (error) => error?.code === "ACCOUNT_EXPORT_DISABLED");
ok(ownDataCalls === 0, "Deaktivierter vollständiger Kontoexport fragt den Own-Data-Endpunkt nicht an");

await assert.rejects(() => ladeVollstaendigenKontoexportHerunter({
  aktiviert: true,
  storageContext: gebundenerKontext,
  getValidatedOwnData: async () => { ownDataCalls++; return {}; },
}), (error) => error?.code === "ACCOUNT_EXPORT_SCOPE_UNPROVEN");
ok(ownDataCalls === 0, "Unbelegter Releaseumfang stoppt vor dem Own-Data-Endpunkt trotz aktivem Runtime-Flag");

const vollstaendigerVertrag = Object.freeze({
  schemaVersion: ACCOUNT_EXPORT_SCOPE_VERSION,
  status: "VERIFIED",
  dataClasses: Object.freeze(ACCOUNT_EXPORT_REQUIRED_SCOPE.map((entry) => entry.id)),
});
for (const [name, dataClasses] of [
  ["fehlender Klasse", vollstaendigerVertrag.dataClasses.slice(0, -1)],
  ["zusätzlicher Klasse", [...vollstaendigerVertrag.dataClasses, "unbelegte-zusatzklasse"]],
]) {
  await assert.rejects(() => ladeVollstaendigenKontoexportHerunter({
    aktiviert: true,
    vollstaendigkeitsVertrag: {
      ...vollstaendigerVertrag,
      dataClasses,
    },
    storageContext: gebundenerKontext,
    getValidatedOwnData: async () => { ownDataCalls++; return {}; },
  }), (error) => error?.code === "ACCOUNT_EXPORT_SCOPE_UNPROVEN");
  ok(ownDataCalls === 0, `Umfangsvertrag mit ${name} bleibt vor jedem Own-Data-Aufruf geschlossen`);
}

await assert.rejects(() => ladeVollstaendigenKontoexportHerunter({
  aktiviert: true,
  vollstaendigkeitsVertrag: vollstaendigerVertrag,
  storageContext: gebundenerKontext,
  getValidatedOwnData: async () => ({ personal: [] }),
}), (error) => error?.code === "ACCOUNT_EXPORT_NOT_VALIDATED");
ok(true, "Unvollständige Own-Data-Antwort erzeugt keine als vollständig bezeichnete Datei");

const validierteOwnData = {
  auth: {}, access: {}, personal: [], aiLogs: [], seriesWatch: [], sharedArticles: [],
  sharedClaims: [], radar: { textFindings: [] }, retention: [], deletion: {},
};
let kontoDownloadKlicks = 0;
const kontoDownload = await ladeVollstaendigenKontoexportHerunter({
  aktiviert: true,
  vollstaendigkeitsVertrag: vollstaendigerVertrag,
  storageContext: gebundenerKontext,
  getValidatedOwnData: async () => validierteOwnData,
  async buildBackup({ remoteOwnData }) {
    assert.equal(remoteOwnData, validierteOwnData);
    return { format: "kinodreieck-backup", version: 1, konto_serverdaten: remoteOwnData };
  },
  createBlob: (text) => text,
  createObjectURL: () => "blob:konto",
  revokeObjectURL: () => {},
  createAnchor: () => ({ click: () => { kontoDownloadKlicks++; } }),
  now: () => new Date("2026-09-01T08:00:00.000Z"),
});
ok(kontoDownload.clicked === true && kontoDownloadKlicks === 1
  && kontoDownload.backup.konto_serverdaten === validierteOwnData
  && kontoDownload.dateiname === "kinodreieck_kontoexport_2026-09-01.json",
"Vollständiger Kontoexport entsteht nur aus aktivem, validiertem Own-Data-Stand");

const datenTabQuelle = readFileSync(new URL("./src/tabs/DatenTab.jsx", import.meta.url), "utf8");
ok(!datenTabQuelle.includes("RestoreImport")
  && datenTabQuelle.includes('titel="Sicherheitskopie dieses Geräts"')
  && datenTabQuelle.includes("Serverweite Konto-Eigendaten")
  && datenTabQuelle.includes("sind nicht enthalten"),
"Privatrelease-UI zeigt nur den präzisen Geräte-Download und keinen Restore-Einstieg");

console.log(`\nBACKUP-EXPORT-TEST BESTANDEN (${checks}/${checks})`);

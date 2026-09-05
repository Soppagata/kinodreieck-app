import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_EXPORT_RELEASE_CONTRACT,
  ACCOUNT_EXPORT_REQUIRED_SCOPE,
  ACCOUNT_EXPORT_SCOPE_VERSION,
  istKontoExportVertragVollstaendig,
} from "./src/lib/privatePilotOps.js";

const lies = (pfad) => readFileSync(new URL(pfad, import.meta.url), "utf8");
const sichtbar = {
  app: lies("./src/App.jsx"),
  mediathek: lies("./src/tabs/MediathekTab.jsx"),
  konto: lies("./src/components/KontoBereich.jsx"),
  kontoUebernahme: lies("./src/components/KontoUebernahme.jsx"),
  fehlergrenze: lies("./src/components/AppErrorBoundary.jsx"),
  hilfe: lies("./src/lib/hilfeInhalte.js"),
  datenschutz: lies("./src/lib/privatePilotOps.js"),
  datenTab: lies("./src/tabs/DatenTab.jsx"),
  lokaleSicherheit: lies("./src/components/LocalDataSafety.jsx"),
  backup: lies("./src/lib/backup.js"),
};
const selfService = lies("./src/components/PrivatePilotOps.jsx");
const exportController = lies("./src/controllers/useBackupExportController.js");
const rechteStart = selfService.indexOf("export function ManuellerDatenrechteWeg");
const rechteEnde = selfService.indexOf("function BestaetigteSupportDaten", rechteStart);
const rechteWeg = selfService.slice(rechteStart, rechteEnde);

let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log("✓ " + name);
}

for (const [name, quelle] of Object.entries(sichtbar)) {
  check(`${name}: normaler Release-Pfad enthält keinen alten Gesamt-Backup-Claim`,
    !quelle.includes("vollständiges Datei-Backup")
    && !quelle.includes("lokales Gesamt-Backup"));
}

check("Leere Mediathek verweist präzise auf getrennten Geräte-Sync und Gerätesicherheitskopie",
  sichtbar.mediathek.includes("Ein aktives Konto führt davon getrennt seinen eigenen Geräte-Sync")
  && sichtbar.mediathek.includes("Settings → Sicherheitskopie dieses Geräts")
  && sichtbar.mediathek.includes("als JSON-Datei fest"));

check("Sync-Größenhinweis und Kontoübernahme versprechen keinen vollständigen Kontoexport",
  sichtbar.konto.includes("lade die Sicherheitskopie dieses Geräts herunter")
  && sichtbar.kontoUebernahme.includes("Eine Sicherheitskopie dieses Geräts")
  && !sichtbar.kontoUebernahme.includes("vollständiges Datei-Backup"));

check("Fehlergrenze benennt Text, Status, Knopf und Dateinamen als lokale Gerätesicherung",
  sichtbar.fehlergrenze.includes("Lokale Sicherheitskopie wird vorbereitet")
  && sichtbar.fehlergrenze.includes("wurde als Download ausgelöst")
  && !sichtbar.fehlergrenze.includes("wurde heruntergeladen")
  && sichtbar.fehlergrenze.includes("Sicherheitskopie dieses Geräts versuchen")
  && sichtbar.fehlergrenze.includes("kinodreieck_notfall_sicherheitskopie_geraet_")
  && !sichtbar.fehlergrenze.includes("kinodreieck_notfall_backup_"));

check("Geräte-Download bleibt sichtbar vom Kontoexport getrennt und verspricht keinen Restore",
  sichtbar.datenTab.includes('id="gesamt-backup" titel="Konto, Daten & Sicherung"')
  && sichtbar.datenTab.includes("Sicherheitskopie dieses Geräts")
  && sichtbar.datenTab.includes("Serverweite Konto-Eigendaten")
  && sichtbar.datenTab.includes("keinen Restore- oder Reimportweg")
  && sichtbar.lokaleSicherheit.includes("Sie ist kein Server- oder Kontoexport")
  && sichtbar.lokaleSicherheit.includes("keinen Restore- oder Reimportweg")
  && sichtbar.backup.includes("keinen Restore- oder Reimportweg")
  && !sichtbar.backup.includes("Backup wiederherstellen")
  && !sichtbar.datenschutz.includes("sicherer Restore"));

check("Manueller Rechteweg ist verständlich auffindbar und erfindet weder Adresse noch Versand",
  sichtbar.hilfe.includes('id: "datenrechte-anfragen"')
  && sichtbar.hilfe.includes("Datenschutz & Datenübersicht")
  && rechteWeg.includes('data-manual-data-rights="private-contact"')
  && rechteWeg.includes("Auskunft")
  && rechteWeg.includes("Berichtigung")
  && rechteWeg.includes("Übertragbarkeit")
  && rechteWeg.includes("Löschung")
  && rechteWeg.includes("privaten Kontaktweg")
  && rechteWeg.includes("versendet keine Anfrage automatisch")
  && !rechteWeg.includes("mailto:")
  && !/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(rechteWeg));

check("Aktueller Releasevertrag hält Kontoexport unabhängig von Runtime-Flags geschlossen",
  ACCOUNT_EXPORT_RELEASE_CONTRACT.status === "UNPROVEN"
  && ACCOUNT_EXPORT_RELEASE_CONTRACT.dataClasses.length === 0
  && !istKontoExportVertragVollstaendig(ACCOUNT_EXPORT_RELEASE_CONTRACT)
  && exportController.includes("ACCOUNT_EXPORT_SCOPE_UNPROVEN"));

const exakt = {
  schemaVersion: ACCOUNT_EXPORT_SCOPE_VERSION,
  status: "VERIFIED",
  dataClasses: ACCOUNT_EXPORT_REQUIRED_SCOPE.map((entry) => entry.id),
};
check("Nur der exakt vollständige versionierte Umfangsvertrag öffnet die dritte Exportgrenze",
  ACCOUNT_EXPORT_REQUIRED_SCOPE.some((entry) => entry.id === "radar-text-findings")
  && istKontoExportVertragVollstaendig(exakt)
  && !istKontoExportVertragVollstaendig({ ...exakt, dataClasses: exakt.dataClasses.slice(0, -1) })
  && !istKontoExportVertragVollstaendig({ ...exakt, dataClasses: [...exakt.dataClasses, "extra"] })
  && !istKontoExportVertragVollstaendig({ ...exakt, schemaVersion: "alt" }));

check("Vollständiger Exportwortlaut liegt nur hinter Flags und exakter Umfangsprüfung",
  selfService.includes("function kontoExportIstFreigegeben")
  && selfService.includes("config.privateSelfServiceEnabled === true")
  && selfService.includes("config.accountDeleteEnabled === true")
  && selfService.includes("accountExportEnabled")
  && selfService.includes("istKontoExportVertragVollstaendig(accountExportContract)")
  && selfService.includes("Exakten Exportumfang anzeigen")
  && selfService.includes("ACCOUNT_EXPORT_REQUIRED_SCOPE.map")
  && selfService.includes("{accountExportEnabled && ("));

check("Nur die Datenschutzübersicht erhält den tatsächlichen Exportstatus für den manuellen Rechteweg",
  (selfService.match(/<ManuellerDatenrechteWeg/g) || []).length === 1
  && (selfService.match(/Der Kontoexport ist in diesem Release nicht als Self-Service freigeschaltet/g) || []).length === 1
  && selfService.includes("<ManuellerDatenrechteWeg kontoExportFreigegeben={accountExportEnabled} />")
  && selfService.includes('data-account-rights-location="privacy-overview"')
  && sichtbar.datenTab.includes("<DatenschutzUebersicht accountActive={kontoAktiv} exportAccountData={kontoExportVollstaendig} />"));

check("Belegter Exportvertrag reaktiviert keinen alten Konto-Self-Delete",
  !selfService.includes("deleteCurrentAccount")
  && !selfService.includes("runCurrentAccountDeletion")
  && !selfService.includes('type="password"')
  && !selfService.includes("Konto endgültig löschen"));

console.log(`\nDATA-SAFETY-WORDING-TEST BESTANDEN (${checks}/${checks})`);

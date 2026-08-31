import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
};
const selfService = lies("./src/components/PrivatePilotOps.jsx");

let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log("✓ " + name);
}

for (const [name, quelle] of Object.entries(sichtbar)) {
  check(`${name}: normaler Release-Pfad enthält keinen alten Gesamt-Backup-Claim`,
    !quelle.includes("Gesamt-Backup")
    && !quelle.includes("vollständiges Datei-Backup")
    && !quelle.includes("lokales Gesamt-Backup"));
}

check("Startmodus und leere Mediathek verweisen präzise auf die Gerätesicherheitskopie",
  sichtbar.app.includes("Lade vorher die Sicherheitskopie dieses Geräts herunter")
  && sichtbar.mediathek.includes("Ein aktives Konto führt davon getrennt seinen eigenen Geräte-Sync")
  && !sichtbar.mediathek.includes("können optional über den Geräte-Sync abgeglichen werden")
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

check("Hilfe und Datenschutzübersicht verwenden denselben sichtbaren Begriff",
  sichtbar.hilfe.includes("Öffne Settings → Sicherheitskopie dieses Geräts.")
  && sichtbar.datenschutz.includes('export: "Sicherheitskopie dieses Geräts (kein Server-/Kontoexport)"')
  && sichtbar.datenschutz.includes("lokale Inhaltslöschung"));

check("Normale Settings trennen Gerätesicherung und vollständigen Kontoexport auch an den Props",
  sichtbar.datenTab.includes('titel="Sicherheitskopie dieses Geräts"')
  && sichtbar.datenTab.includes("onBackupWunsch={sicherheitskopieGeraet}")
  && sichtbar.datenTab.includes("exportBeforeDelete={kontoExportVollstaendig}"));

check("Vollständiger Exportwortlaut bleibt ausschließlich hinter beiden Self-Service-Freigaben",
  selfService.includes("Vollständiges Gesamt-Backup herunterladen")
  && selfService.includes("config.privateSelfServiceEnabled === true")
  && selfService.includes("config.accountDeleteEnabled === true")
  && selfService.includes("{deleteEnabled && ("));

console.log(`\nDATA-SAFETY-WORDING-TEST BESTANDEN (${checks}/${checks})`);

/* ---------- Gesamt-Backup bauen (treiber-agnostisch, DB-fähig) ----------
   Baut das `kinodreieck-backup`-Objekt (Format v1, unverändert). Reihenfolge:
   1) erzwungener frischer Pull des AKTIVEN Treibers (bei localDriver No-op) — so
      trägt das Backup den DB-Stand, nicht veralteten React-State (die v2-Falle);
   2) alle registrierten persönlichen Töpfe über `store` lesen (nicht aus
      React-State).
   Enthält nur Owner-Daten, nie Demo/Tester. Der lokale Datei-Export bleibt der
   robusteste Notweg (funktioniert ohne Netz/Schlüssel — der Pull ist dann best effort). */

import { captureStorageContext } from "./storage.js";
import { PERSONAL_DATA_ENTRIES } from "./personalDataRegistry.js";
import { privateOpsExportStatus } from "./privatePilotOps.js";

export const LOCAL_BACKUP_COMPLETENESS_SCHEMA = 1;

const REGISTRY_CONTRACT = Object.freeze(PERSONAL_DATA_ENTRIES.map((entry) => Object.freeze({
  key: entry.key,
  backupField: entry.backupField,
})));

function gleichesJson(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

/* Die Löschfreigabe braucht mehr als einen gelungenen Anchor-Klick. Dieser
   rein lokale Beleg prüft, dass jedes Registry-Feld in der tatsächlich
   serialisierbaren Datei steckt und weiterhin vom Restorevertrag verstanden
   wird. Warnungen sind absichtlich terminal für die Löschfreigabe. */
export function pruefeLokaleBackupVollstaendigkeit(backup) {
  const fehler = [];
  let roundtrip = null;
  try {
    const serialisiert = JSON.stringify(backup);
    if (!serialisiert) throw new Error("leer");
    roundtrip = JSON.parse(serialisiert);
  } catch { fehler.push("serialisierung"); }

  if (roundtrip?.format !== "kinodreieck-backup" || roundtrip?.version !== 1) {
    fehler.push("format");
  }
  if (Array.isArray(roundtrip?._warnungen) && roundtrip._warnungen.length) {
    fehler.push("warnungen");
  }

  const beleg = roundtrip?._vollstaendigkeit;
  const belegRegister = Array.isArray(beleg?.register) ? beleg.register : [];
  if (beleg?.schemaVersion !== LOCAL_BACKUP_COMPLETENESS_SCHEMA
      || beleg?.status !== "VOLLSTAENDIG"
      || belegRegister.length !== REGISTRY_CONTRACT.length
      || !REGISTRY_CONTRACT.every((entry, index) => (
        belegRegister[index]?.key === entry.key
        && belegRegister[index]?.backupField === entry.backupField
      ))) {
    fehler.push("registry-beleg");
  }

  for (const entry of PERSONAL_DATA_ENTRIES) {
    if (!Object.prototype.hasOwnProperty.call(roundtrip || {}, entry.backupField)) {
      fehler.push(`feld:${entry.backupField}`);
      continue;
    }
    try { entry.restorePlan(roundtrip[entry.backupField], 1); }
    catch { fehler.push(`restore:${entry.backupField}`); }
  }

  return Object.freeze({
    ok: fehler.length === 0,
    schemaVersion: LOCAL_BACKUP_COMPLETENESS_SCHEMA,
    registryEntries: REGISTRY_CONTRACT.length,
    fehler: Object.freeze([...new Set(fehler)]),
  });
}

/* Zweiter Beleg direkt an der Löschgrenze: Seit dem Dateibau darf sich kein
   persönlicher Topf geändert haben. Die Werte verlassen diese Funktion nie;
   verglichen wird nur ihre Registry-Projektion. */
export async function pruefeLokalesBackupGegenSpeicher(backup, storageContext) {
  const struktur = pruefeLokaleBackupVollstaendigkeit(backup);
  if (!struktur.ok || storageContext?.isCurrent?.() !== true) {
    return Object.freeze({ ok: false, grund: struktur.ok ? "kontext" : "backup" });
  }
  for (const entry of PERSONAL_DATA_ENTRIES) {
    let roh = null;
    const warnungen = [];
    try {
      const gelesen = await storageContext.get(entry.key);
      roh = gelesen?.value ?? null;
    } catch { return Object.freeze({ ok: false, grund: "lesen" }); }
    if (storageContext.isCurrent?.() !== true) {
      return Object.freeze({ ok: false, grund: "kontext" });
    }
    let projiziert;
    try {
      projiziert = entry.backupAusRoh(roh, (bereich, grund) => warnungen.push({ bereich, grund }));
    } catch { return Object.freeze({ ok: false, grund: "projektion" }); }
    if (warnungen.length || !gleichesJson(projiziert, backup[entry.backupField])) {
      return Object.freeze({ ok: false, grund: "stand-geaendert" });
    }
  }
  return Object.freeze({ ok: true, grund: "registry-roundtrip-bestaetigt" });
}

export async function baueBackup({
  pull = true, speicher = null, storageContext = null, remoteOwnData = null,
} = {}) {
  /* Der Produktionspfad bindet zu Beginn Treiber + Generation. Ein explizit
     injizierter Speicher ist ein isoliertes Test-/Werkzeug-Backend und gilt
     für die Dauer dieses Aufrufs als bereits gebunden. */
  const kontext = storageContext || (speicher ? {
    ...speicher,
    isCurrent: () => true,
    pull: async () => ({ ok: true, noop: true }),
  } : captureStorageContext());
  const kontextGewechselt = (error) => error?.code === "STORAGE_CONTEXT_CHANGED"
    || kontext.isCurrent?.() !== true;
  const pruefeKontext = () => {
    if (kontext.isCurrent?.() !== true) {
      const error = new Error("Backup abgebrochen: Der Speicherkontext hat sich während des Exports geändert.");
      error.code = "STORAGE_CONTEXT_CHANGED";
      throw error;
    }
  };
  // 1) Frischer Pull des aktiven Treibers. Offline/ohne Schlüssel: Export aus lokalem Cache.
  // KD-011: Pull-Ergebnis auswerten statt verschlucken — activePull() wirft nicht, sondern
  // liefert {ok:false,...} bzw. ein Ergebnis mit konflikt[]; ein fehlgeschlagener oder
  // konfligierter Pull darf nicht unbemerkt zu einem „aktuell" aussehenden Backup führen.
  const warnungen = [];
  if (pull) {
    try {
      const pr = await kontext.pull();
      if (pr && pr.ok === false) warnungen.push({ bereich: "pull", grund: "Frischer Pull fehlgeschlagen — Daten stammen evtl. aus veraltetem lokalem Cache." });
      else if (pr && Array.isArray(pr.konflikt) && pr.konflikt.length) warnungen.push({ bereich: "pull", grund: "Offene Sync-Konflikte (" + pr.konflikt.join(", ") + ") — Backup kann lokale, nicht abgeglichene Stände enthalten." });
    } catch (e) {
      if (kontextGewechselt(e)) throw e;
      warnungen.push({ bereich: "pull", grund: "Pull-Fehler: " + String((e && e.message) || e) });
    }
  }
  pruefeKontext();

  // 2) Alles über das gemeinsame Register lesen und ins stabile Backup-v1-Feld
  // projizieren. Ein legitim leerer Topf bleibt ohne Warnung leer; echte Lese-,
  // JSON- oder Formfehler werden im Backup sichtbar protokolliert.
  const backup = {
    format: "kinodreieck-backup", version: 1, erstellt: new Date().toISOString(),
    hinweis: "Portable JSON-Sicherheitskopie dieses Geräts zur eigenen Aufbewahrung; dieser Release bietet dafür keinen Restore- oder Reimportweg.",
  };
  const exportStaende = {};
  const geleseneStaende = new Map();
  for (const entry of PERSONAL_DATA_ENTRIES) {
    let roh = null;
    try {
      const r = await kontext.get(entry.key);
      roh = r ? r.value : null;
    } catch (error) {
      if (kontextGewechselt(error)) throw error;
      warnungen.push({ bereich: entry.key, grund: "Lesefehler — als leer gesichert." });
    }
    pruefeKontext();
    geleseneStaende.set(entry.key, roh);
    backup[entry.backupField] = entry.backupAusRoh(
      roh,
      (bereich, grund) => warnungen.push({ bereich, grund }),
    );
    /* C1: Nicht `erstellt`/Date.now markieren. Ein später im sequenziellen
       Backup-Lauf veränderter, bereits gelesener Topf ist gerade NICHT mehr
       vollständig enthalten. Nur der Zeitstempel aus exakt dem gelesenen,
       gültigen Wrapper darf deshalb als Sicherungsgrenze zurückkommen. */
    if (entry.backupField === "masterliste" || entry.backupField === "artikel") {
      try {
        const wrapper = JSON.parse(roh);
        const gueltigeForm = entry.backupField === "masterliste"
          ? wrapper && !Array.isArray(wrapper) && Array.isArray(wrapper.filme)
          : wrapper && !Array.isArray(wrapper) && Array.isArray(wrapper.artikel);
        if (gueltigeForm && Number.isFinite(wrapper.gespeichertAm)) {
          exportStaende[entry.backupField === "masterliste" ? "master" : "artikel"] = wrapper.gespeichertAm;
        }
      } catch { /* Legacy-/Leerstand besitzt bewusst keine Sicherungsgrenze. */ }
    }
  }
  /* Jeder Topf wird nach der Projektion bytegenau rückgelesen. Eine Änderung
     während des sequenziellen Exports macht die Datei weiterhin nützlich,
     aber nicht ausreichend für eine anschließende Löschung. */
  for (const entry of PERSONAL_DATA_ENTRIES) {
    try {
      const erneut = await kontext.get(entry.key);
      if ((erneut?.value ?? null) !== geleseneStaende.get(entry.key)) {
        warnungen.push({ bereich: entry.key, grund: "Während der Sicherung geändert — Löschfreigabe gesperrt." });
      }
    } catch (error) {
      if (kontextGewechselt(error)) throw error;
      warnungen.push({ bereich: entry.key, grund: "Kontrolllesen fehlgeschlagen — Löschfreigabe gesperrt." });
    }
    pruefeKontext();
  }
  /* Optionales Diagnosefeld bewusst zuletzt: ältere Wiederherstellungen
     ignorieren es, Menschen sehen Probleme aber direkt im Export. */
  if (warnungen.length) backup._warnungen = warnungen;
  if (Object.keys(exportStaende).length) backup._exportStaende = exportStaende;
  if (remoteOwnData && typeof remoteOwnData === "object" && !Array.isArray(remoteOwnData)) {
    backup.konto_serverdaten = remoteOwnData;
  }
  backup._privateOps = privateOpsExportStatus({ remoteIncluded: !!backup.konto_serverdaten });
  backup._vollstaendigkeit = Object.freeze({
    schemaVersion: LOCAL_BACKUP_COMPLETENESS_SCHEMA,
    status: warnungen.length ? "UNVOLLSTAENDIG" : "VOLLSTAENDIG",
    register: REGISTRY_CONTRACT,
  });
  pruefeKontext();
  return backup;
}

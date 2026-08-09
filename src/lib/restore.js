/* Gesamt-Backup wiederherstellen.

   Sicherheitsreihenfolge:
   1. das vollständige Backup gegen das PersonalDataRegistry dekodieren,
   2. alle bisherigen registrierten Töpfe lesen,
   3. einen rücklesbaren Rollback-Snapshot sichern,
   4. den vorbereiteten Plan schreiben,
   5. bei jedem Teilfehler den lokalen Vorherstand automatisch zurückspielen,
   6. im Kontobetrieb alle Commits abwarten und bitgleich verifizieren.

   Restore ersetzt nur Felder, die im Backup vorhanden sind. Ältere Backups
   löschen daher keine später hinzugekommenen persönlichen Töpfe. */

import {
  activeSyncStatus, activeSyncFlush, activeSyncInventur,
  captureStorageContext, storageOwnerKennung,
} from "./storage.js";
import {
  PERSONAL_DATA_ENTRIES, PERSONAL_DATA_KEYS, baueRestorePlan,
} from "./personalDataRegistry.js";
import { purgeExpiredLocalData } from "./localRetention.js";

const RESTORE_SNAP = "kd:restore:vorher";
const RESTORE_SNAP_VERSION = 2;

function kontextFehler() {
  const error = new Error("Wiederherstellung abgebrochen: Der Speicherkontext hat sich während des Vorgangs geändert.");
  error.code = "STORAGE_CONTEXT_CHANGED";
  return error;
}

function starteRestoreLauf() {
  const kontext = captureStorageContext();
  const owner = storageOwnerKennung();
  if (!kontext?.isCurrent?.() || kontext.owner !== owner) throw kontextFehler();
  return { kontext, owner };
}

function pruefeRestoreLauf(lauf) {
  if (!lauf?.kontext?.isCurrent?.()
    || lauf.kontext.owner !== lauf.owner
    || storageOwnerKennung() !== lauf.owner) {
    throw kontextFehler();
  }
}

function istKontextFehler(error, lauf) {
  return error?.code === "STORAGE_CONTEXT_CHANGED"
    || !lauf?.kontext?.isCurrent?.()
    || storageOwnerKennung() !== lauf?.owner;
}

async function gebundenerGlobalerSchritt(lauf, schritt) {
  pruefeRestoreLauf(lauf);
  const ergebnis = await schritt();
  pruefeRestoreLauf(lauf);
  return ergebnis;
}

function nowIso() {
  try { return new Date().toISOString(); } catch { return String(Date.now()); }
}

async function leseVorherstand(lauf) {
  const vorher = {};
  for (const key of PERSONAL_DATA_KEYS) {
    try {
      const r = await lauf.kontext.get(key);
      vorher[key] = r ? r.value : null;
    } catch (error) {
      if (istKontextFehler(error, lauf)) throw kontextFehler();
      throw new Error(`Vorherstand von ${key} konnte nicht gelesen werden — Restore abgebrochen, es wurde nichts überschrieben.`, { cause: error });
    }
  }
  pruefeRestoreLauf(lauf);
  return vorher;
}

function sichereSnapshot(vorher, lauf) {
  pruefeRestoreLauf(lauf);
  purgeExpiredLocalData();
  try {
    const paket = JSON.stringify({
      version: RESTORE_SNAP_VERSION,
      owner: lauf.owner,
      t: nowIso(),
      werte: vorher,
    });
    localStorage.setItem(RESTORE_SNAP, paket);
    const bestaetigt = localStorage.getItem(RESTORE_SNAP) === paket;
    pruefeRestoreLauf(lauf);
    return bestaetigt;
  } catch (error) {
    if (istKontextFehler(error, lauf)) throw kontextFehler();
    return false;
  }
}

async function spieleWerte(wertMap, lauf, keys = PERSONAL_DATA_KEYS) {
  const fehler = [];
  for (const key of [...keys].reverse()) {
    try {
      const wert = wertMap[key] ?? null;
      if (wert === null) await lauf.kontext.delete(key);
      else await lauf.kontext.set(key, wert);
    } catch (error) {
      if (istKontextFehler(error, lauf)) throw kontextFehler();
      fehler.push({ key, error });
    }
  }
  pruefeRestoreLauf(lauf);
  return fehler;
}

async function verifiziereKonto(plan, lauf) {
  const flush = await gebundenerGlobalerSchritt(lauf, activeSyncFlush);
  if (!flush.ok) return { ok: false, grund: "Konto-Übertragung konnte nicht abgeschlossen werden." };

  const inventur = await gebundenerGlobalerSchritt(lauf, activeSyncInventur);
  if (!inventur?.ok || inventur.noop) {
    return { ok: false, grund: "Konto-Stand konnte nach der Wiederherstellung nicht geprüft werden." };
  }
  const abweichend = [];
  for (const schritt of plan) {
    const remote = inventur.zeilen?.[schritt.key];
    if (!remote || String(remote.value ?? "") !== schritt.wert) abweichend.push(schritt.key);
  }
  return abweichend.length
    ? { ok: false, grund: `Nicht bitgleich im Konto angekommen: ${abweichend.join(", ")}`, abweichend }
    : { ok: true };
}

export async function restoreBackup(backup) {
  purgeExpiredLocalData();
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new Error("Kein gültiges Backup-Objekt.");
  }
  if (backup.format !== "kinodreieck-backup") {
    throw new Error('Falsches Format — erwartet format: "kinodreieck-backup".');
  }
  const warnung = (backup.version !== undefined && backup.version !== 1)
    ? `Backup-Version ${backup.version} (erwartet 1) — wird tolerant eingelesen.`
    : null;

  /* Vollständiges Decode/Validate VOR dem ersten Storage-Zugriff. Ein kaputtes
     späteres Feld kann dadurch nicht mehr einen halbfertigen Restore auslösen. */
  const { plan, bericht } = baueRestorePlan(backup, Date.now());
  const lauf = starteRestoreLauf();
  const vorher = await leseVorherstand(lauf);
  if (!sichereSnapshot(vorher, lauf)) {
    throw new Error("Rollback-Snapshot konnte nicht gesichert werden (Speicher voll oder blockiert) — Restore abgebrochen, es wurde nichts überschrieben.");
  }

  const geschrieben = [];
  try {
    for (const schritt of plan) {
      await lauf.kontext.set(schritt.key, schritt.wert);
      geschrieben.push(schritt.key);
    }
  } catch (error) {
    if (istKontextFehler(error, lauf)) throw kontextFehler();
    const rollbackFehler = await spieleWerte(vorher, lauf, geschrieben);
    await gebundenerGlobalerSchritt(lauf, activeSyncFlush);
    if (rollbackFehler.length) {
      const e = new Error(
        `Restore und automatische Rücknahme sind fehlgeschlagen (${rollbackFehler.map((f) => f.key).join(", ")}). Der gesicherte Rückholpunkt bleibt erhalten.`,
        { cause: error },
      );
      e.code = "restore-rollback-failed";
      throw e;
    }
    const e = new Error("Restore ist beim Schreiben fehlgeschlagen und wurde vollständig auf den vorherigen lokalen Stand zurückgesetzt.", { cause: error });
    e.code = "restore-rolled-back";
    throw e;
  }

  let dbHinweis = null;
  let dbWarnung = false;
  let remoteVerifiziert = null;
  try {
    pruefeRestoreLauf(lauf);
    const drv = lauf.kontext.name;
    if (drv === "konto") {
      const st = activeSyncStatus();
      if (!st.configured) {
        dbWarnung = true;
        remoteVerifiziert = false;
        dbHinweis = "Konto-Verbindung nicht eingerichtet: Die Wiederherstellung ist lokal vollständig, aber noch nicht im Konto gespeichert.";
      } else {
        const pruefung = await verifiziereKonto(plan, lauf);
        remoteVerifiziert = pruefung.ok;
        dbWarnung = !pruefung.ok;
        dbHinweis = pruefung.ok
          ? "Konto aktiv: Alle wiederhergestellten Bereiche wurden übertragen und bitgleich geprüft."
          : `${pruefung.grund} Die lokale Wiederherstellung bleibt vollständig erhalten; bitte „Ausstehende Änderungen erneut senden“ versuchen.`;
      }
    } else if (drv && drv !== "lokal") {
      const st = activeSyncStatus();
      if (st.configured) {
        await gebundenerGlobalerSchritt(lauf, activeSyncFlush);
        dbHinweis = `Treiber „${drv}" aktiv: Die registrierten Bereiche wurden lokal wiederhergestellt und die Übertragung angestoßen.`;
      } else {
        dbWarnung = true;
        dbHinweis = `Treiber „${drv}" ist nicht vollständig konfiguriert: Die Daten liegen nur LOKAL, NICHT in der Datenbank.`;
      }
    }
  } catch (error) {
    if (istKontextFehler(error, lauf)) throw kontextFehler();
    dbWarnung = true;
    remoteVerifiziert = false;
    dbHinweis = `Die lokale Wiederherstellung ist vollständig; die Konto-Verifikation ist fehlgeschlagen (${String(error?.message || error)}).`;
  }

  pruefeRestoreLauf(lauf);

  return {
    ok: true,
    warnung,
    bericht,
    dbHinweis,
    dbWarnung,
    remoteVerifiziert,
  };
}

/* Rückgängig verwendet dieselbe geschlossene Registry-Liste; fremde Schlüssel
   aus einer manipulierten Snapshot-Datei werden niemals geschrieben. */
export async function restoreRueckgaengig() {
  purgeExpiredLocalData();
  const lauf = starteRestoreLauf();
  let snap;
  try { snap = JSON.parse(localStorage.getItem(RESTORE_SNAP) || "null"); }
  catch { snap = null; }
  if (!snap || snap.version !== RESTORE_SNAP_VERSION
    || snap.owner !== lauf.owner
    || !snap.werte || typeof snap.werte !== "object" || Array.isArray(snap.werte)) {
    throw new Error("Kein Restore-Snapshot für diesen Datenbestand vorhanden.");
  }
  const fehler = await spieleWerte(snap.werte, lauf);
  await gebundenerGlobalerSchritt(lauf, activeSyncFlush);
  if (fehler.length) {
    throw new Error(`Restore-Rücknahme unvollständig: ${fehler.map((f) => f.key).join(", ")}.`);
  }
  return { ok: true, t: snap.t };
}

export function hatRestoreSnapshot() {
  purgeExpiredLocalData();
  try {
    const snap = JSON.parse(localStorage.getItem(RESTORE_SNAP) || "null");
    return !!snap
      && snap.version === RESTORE_SNAP_VERSION
      && snap.owner === storageOwnerKennung()
      && !!snap.werte && typeof snap.werte === "object" && !Array.isArray(snap.werte);
  }
  catch { return false; }
}

/* Benannter Export für Architekturtests und Diagnose, ohne eine zweite Liste. */
export const RESTORE_KEYS = PERSONAL_DATA_ENTRIES.map((e) => e.key);

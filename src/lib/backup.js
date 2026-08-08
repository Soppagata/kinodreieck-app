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

export async function baueBackup({ pull = true, speicher = null, storageContext = null } = {}) {
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
    hinweis: "Wiederherstellen: über Settings → Backup wiederherstellen (oder masterliste/artikel einzeln über die Import-Felder).",
  };
  const exportStaende = {};
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
  /* Optionales Diagnosefeld bewusst zuletzt: ältere Wiederherstellungen
     ignorieren es, Menschen sehen Probleme aber direkt im Export. */
  if (warnungen.length) backup._warnungen = warnungen;
  if (Object.keys(exportStaende).length) backup._exportStaende = exportStaende;
  pruefeKontext();
  return backup;
}

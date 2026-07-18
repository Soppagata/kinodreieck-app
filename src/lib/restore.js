/* ---------- Restore-Import (Datenmigration alt → neu) ----------
   Spielt ein `kinodreieck-backup`-JSON (Gesamt-Backup) in die 10 Sync-Töpfe der
   App ein, damit der Git-Treiber sie beim ersten Commit als 10 Dateien schreibt.
   Rein lokal, deterministisch, kein Netz, kein LLM, kein Merge (Restore =
   ERSETZEN). Snapshot vor dem Überschreiben (rückgängig machbar).
   Läuft VOR dem Git-Verbinden (Storage-Treiber ist dann lokal → keine Commits). */

import { store, K } from "./storage.js";
import { ensureIds } from "./match.js";

const RESTORE_SNAP = "kd:restore:vorher"; // Rollback-Snapshot (nicht in SYNC_MAP)

function nowIso() { try { return new Date().toISOString(); } catch { return "" + Date.now(); } }

/* Alle Zieltöpfe + wie das Backup-Feld heißt. Storage-Wrapper exakt wie die App
   liest (verifiziert an persistMaster/persistArtikel/persistPins/… im Bestand). */
export async function restoreBackup(backup) {
  if (!backup || typeof backup !== "object") throw new Error("Kein gültiges Backup-Objekt.");
  if (backup.format !== "kinodreieck-backup") throw new Error('Falsches Format — erwartet format: "kinodreieck-backup".');
  const warnung = (backup.version !== undefined && backup.version !== 1)
    ? `Backup-Version ${backup.version} (erwartet 1) — wird tolerant eingelesen.` : null;

  // 1) Snapshot des bisherigen Standes ALLER Zieltöpfe VOR dem Überschreiben.
  const keys = [K.master, K.artikel, K.kinoPins, K.merkliste, K.vokabular, K.einstellungen, K.entdeckenStatus, K.autorName, K.streamingDienste, K.mustwatch];
  const vorher = {};
  for (const k of keys) { try { const r = await store.get(k); vorher[k] = r ? r.value : null; } catch { vorher[k] = null; } }
  try { localStorage.setItem(RESTORE_SNAP, JSON.stringify({ t: nowIso(), werte: vorher })); } catch { /* Snapshot best effort */ }

  const bericht = [];
  const now = Date.now();
  const add = (topf, status, count) => bericht.push({ topf, status, count });

  // 2) Masterliste — ensureIds + App-Ablageformat {meta, filme, herkunft, gespeichertAm}
  if (backup.masterliste && Array.isArray(backup.masterliste.filme)) {
    const filme = ensureIds(backup.masterliste.filme);
    const meta = backup.masterliste.meta || null;
    await store.set(K.master, JSON.stringify({ meta, filme, herkunft: { typ: "storage", zeit: now, basis: "Restore-Import" }, gespeichertAm: now }));
    add("Masterliste", "übernommen", filme.length);
  } else add("Masterliste", "übersprungen (fehlte)", 0);

  // 3) Blog-Artikel — Wrapper {artikel, gespeichertAm}
  if (Array.isArray(backup.artikel)) {
    await store.set(K.artikel, JSON.stringify({ artikel: backup.artikel, gespeichertAm: now }));
    add("Blog-Artikel", "übernommen", backup.artikel.length);
  } else add("Blog-Artikel", "übersprungen (fehlte)", 0);

  // 4) Kino-Pins — Array
  if (Array.isArray(backup.kino_pins)) {
    await store.set(K.kinoPins, JSON.stringify(backup.kino_pins));
    add("Kino-Pins", "übernommen", backup.kino_pins.length);
  } else add("Kino-Pins", "übersprungen (fehlte)", 0);

  // 5) Merkliste — Array
  if (Array.isArray(backup.merkliste)) {
    await store.set(K.merkliste, JSON.stringify(backup.merkliste));
    add("Merkliste", "übernommen", backup.merkliste.length);
  } else add("Merkliste", "übersprungen (fehlte)", 0);

  // 6) Vokabular — Array
  if (Array.isArray(backup.vokabular)) {
    await store.set(K.vokabular, JSON.stringify(backup.vokabular));
    add("Vokabular", "übernommen", backup.vokabular.length);
  } else add("Vokabular", "übersprungen (fehlte)", 0);

  // 7) Einstellungen — Objekt
  if (backup.einstellungen && typeof backup.einstellungen === "object") {
    await store.set(K.einstellungen, JSON.stringify(backup.einstellungen));
    add("Einstellungen", "übernommen", 1);
  } else add("Einstellungen", "übersprungen (fehlte)", 0);

  // 8) Entdecken-Status — Objekt {watchmode_id: status}
  if (backup.entdecken_status && typeof backup.entdecken_status === "object") {
    await store.set(K.entdeckenStatus, JSON.stringify(backup.entdecken_status));
    add("Entdecken-Status", "übernommen", Object.keys(backup.entdecken_status).length);
  } else add("Entdecken-Status", "übersprungen (fehlte)", 0);

  // 9) Autor-Name — roher String
  if (typeof backup.autor === "string" && backup.autor.length) {
    await store.set(K.autorName, backup.autor);
    add("Autor-Name", "übernommen", 1);
  } else add("Autor-Name", "übersprungen (fehlte)", 0);

  // 10) Streaming-Dienste — optional; im Alt-Backup meist NICHT enthalten (Export-Lücke)
  if (backup.streaming_dienste && typeof backup.streaming_dienste === "object") {
    await store.set(K.streamingDienste, JSON.stringify(backup.streaming_dienste));
    add("Streaming-Dienste", "übernommen", 1);
  } else add("Streaming-Dienste", "ÜBERSPRUNGEN — nicht im Backup: Abos bitte manuell setzen", 0);

  // 11) Must-Watch-Liste — Wrapper {eintraege, gespeichertAm} (10. Topf, seit 18.07.2026)
  if (Array.isArray(backup.must_watch_liste)) {
    await store.set(K.mustwatch, JSON.stringify({ eintraege: backup.must_watch_liste, gespeichertAm: now }));
    add("Must-Watch-Liste", "übernommen", backup.must_watch_liste.length);
  } else add("Must-Watch-Liste", "übersprungen (fehlte)", 0);

  return { ok: true, warnung, bericht };
}

/* Rückgängig: den vor dem letzten Restore gesicherten Stand zurückschreiben. */
export async function restoreRueckgaengig() {
  let snap; try { snap = JSON.parse(localStorage.getItem(RESTORE_SNAP) || "null"); } catch { snap = null; }
  if (!snap || !snap.werte) throw new Error("Kein Restore-Snapshot vorhanden.");
  for (const [k, v] of Object.entries(snap.werte)) {
    try { if (v === null) await store.delete(k); else await store.set(k, v); } catch { /* einzelner Topf */ }
  }
  return { ok: true, t: snap.t };
}

export function hatRestoreSnapshot() {
  try { return !!JSON.parse(localStorage.getItem(RESTORE_SNAP) || "null"); } catch { return false; }
}

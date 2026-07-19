/* ---------- Gesamt-Backup bauen (treiber-agnostisch, DB-fähig) ----------
   Baut das `kinodreieck-backup`-Objekt (Format v1, unverändert). Reihenfolge:
   1) erzwungener frischer Pull des AKTIVEN Treibers (bei localDriver No-op) — so
      trägt das Backup den DB-Stand, nicht veralteten React-State (die v2-Falle);
   2) ALLE 10 Owner-Schlüssel über `store` lesen (nicht aus React-State).
   Enthält nur Owner-Daten, nie Demo/Tester. Der lokale Datei-Export bleibt der
   robusteste Notweg (funktioniert ohne Netz/Schlüssel — der Pull ist dann best effort). */

import { store, K, activePull } from "./storage.js";

export async function baueBackup({ pull = true } = {}) {
  // 1) Frischer Pull des aktiven Treibers. Offline/ohne Schlüssel: Export aus lokalem Cache.
  if (pull) { try { await activePull(); } catch { /* best effort: lokaler Cache */ } }

  // 2) Alles über store lesen (verbatim-String -> gezielt entpacken).
  const roh = async (key) => { try { const r = await store.get(key); return r ? r.value : null; } catch { return null; } };
  const obj = async (key) => { const v = await roh(key); if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };

  const master = await obj(K.master);         // {meta, filme, herkunft, gespeichertAm}
  const artikel = await obj(K.artikel);       // {artikel, gespeichertAm}
  const mustwatch = await obj(K.mustwatch);   // {eintraege, gespeichertAm}

  return {
    format: "kinodreieck-backup", version: 1, erstellt: new Date().toISOString(),
    hinweis: "Wiederherstellen: über Einstellungen → Backup wiederherstellen (oder masterliste/artikel einzeln über die Import-Felder).",
    masterliste: { meta: (master && master.meta) || null, filme: (master && Array.isArray(master.filme)) ? master.filme : [] },
    artikel: (artikel && Array.isArray(artikel.artikel)) ? artikel.artikel : [],
    kino_pins: (await obj(K.kinoPins)) || [],
    merkliste: await obj(K.merkliste),
    entdecken_status: await obj(K.entdeckenStatus),
    /* streaming_dienste seit 18.07.2026 im Backup (sonst ginge die Abo-Auswahl beim Restore verloren). */
    streaming_dienste: await obj(K.streamingDienste),
    must_watch_liste: (mustwatch && Array.isArray(mustwatch.eintraege)) ? mustwatch.eintraege : [],
    vokabular: await obj(K.vokabular),
    einstellungen: await obj(K.einstellungen),
    autor: await roh(K.autorName),   // roher String (kein JSON)
  };
}

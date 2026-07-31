/* Zentrales Register aller persönlichen, accountgebundenen Datentöpfe.

   Ein Eintrag beschreibt genau einmal:
   - den localStorage-/DB-Schlüssel,
   - das Feld im rückwärtskompatiblen Backup v1,
   - Anzeige und Zählweise für Übernahme/Restore,
   - die Projektion zwischen internem Topf und Backup.

   Sync, Backup, Restore und Kontoübernahme leiten ihre Listen daraus ab. Ein
   neuer persönlicher Topf kann dadurch nicht mehr versehentlich nur an zwei
   von vier Stellen auftauchen. Gerätezustand, Katalogcache, Demo-Marken und
   Auth-Sitzung gehören ausdrücklich nicht in dieses Register. */

import { K } from "./storage.js";
import { ensureIds } from "./match.js";

const istObjekt = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const vorhanden = (v) => v !== undefined && v !== null;

function jsonEintrag({
  key, backupField, label, einheit = "", backupFallback = null,
  pruefe, zuBackup = (v) => v, zuTopf = (v) => v, zaehle = () => 1,
  fehltStatus = "übersprungen (fehlte)",
}) {
  return {
    key, backupField, label, einheit, fehltStatus,
    backupAusRoh(roh, warne) {
      if (roh == null) return backupFallback;
      let wert;
      try { wert = JSON.parse(roh); }
      catch {
        warne?.(key, "nicht parsebar (JSON beschädigt) — als leer gesichert.");
        return backupFallback;
      }
      if (!pruefe(wert)) {
        warne?.(key, "unerwartete Datenform — als leer gesichert.");
        return backupFallback;
      }
      return zuBackup(wert);
    },
    restorePlan(wert, now) {
      if (!vorhanden(wert)) return null;
      if (!pruefe(wert)) throw new Error(`${label}: unerwartete Datenform im Backup.`);
      const topfWert = zuTopf(wert, now);
      return { key, label, wert: JSON.stringify(topfWert), count: zaehle(wert) };
    },
    zaehleRoh(roh) {
      if (roh == null) return 0;
      try {
        const wert = JSON.parse(roh);
        return pruefe(wert) ? zaehle(zuBackup(wert)) : 1;
      } catch { return 1; }
    },
  };
}

function rohEintrag({ key, backupField, label, fehltStatus = "übersprungen (fehlte)" }) {
  return {
    key, backupField, label, einheit: "", fehltStatus,
    backupAusRoh: (roh) => roh ?? null,
    restorePlan(wert) {
      if (!vorhanden(wert)) return null;
      if (typeof wert !== "string") throw new Error(`${label}: erwartet Text im Backup.`);
      if (!wert.length) return null;
      return { key, label, wert, count: 1 };
    },
    zaehleRoh: (roh) => (roh == null || !String(roh).length ? 0 : 1),
  };
}

export const PERSONAL_DATA_ENTRIES = Object.freeze([
  jsonEintrag({
    key: K.master,
    backupField: "masterliste",
    label: "Masterliste",
    einheit: "Filme",
    backupFallback: { meta: null, filme: [] },
    pruefe: (v) => istObjekt(v) && Array.isArray(v.filme),
    zuBackup: (v) => ({ meta: v.meta || null, filme: v.filme }),
    zuTopf: (v, now) => ({
      meta: v.meta || null,
      filme: ensureIds(v.filme),
      herkunft: { typ: "storage", zeit: now, basis: "Restore-Import" },
      gespeichertAm: now,
    }),
    zaehle: (v) => v.filme.length,
  }),
  jsonEintrag({
    key: K.artikel,
    backupField: "artikel",
    label: "Blog-Artikel",
    einheit: "Artikel",
    backupFallback: [],
    pruefe: (v) => Array.isArray(v) || (istObjekt(v) && Array.isArray(v.artikel)),
    zuBackup: (v) => Array.isArray(v) ? v : v.artikel,
    zuTopf: (v, now) => ({ artikel: Array.isArray(v) ? v : v.artikel, gespeichertAm: now }),
    zaehle: (v) => (Array.isArray(v) ? v : v.artikel).length,
  }),
  jsonEintrag({
    key: K.kinoPins,
    backupField: "kino_pins",
    label: "Kino-Pins",
    einheit: "Pins",
    backupFallback: [],
    pruefe: Array.isArray,
    zaehle: (v) => v.length,
  }),
  jsonEintrag({
    key: K.merkliste,
    backupField: "merkliste",
    label: "Merkliste",
    einheit: "Einträge",
    pruefe: Array.isArray,
    zaehle: (v) => v.length,
  }),
  jsonEintrag({
    key: K.vokabular,
    backupField: "vokabular",
    label: "Suche-Vokabular",
    einheit: "Wörter",
    pruefe: Array.isArray,
    zaehle: (v) => v.length,
  }),
  jsonEintrag({
    key: K.einstellungen,
    backupField: "einstellungen",
    label: "Einstellungen",
    pruefe: istObjekt,
  }),
  jsonEintrag({
    key: K.entdeckenStatus,
    backupField: "entdecken_status",
    label: "Entdecken-Status",
    einheit: "Markierungen",
    pruefe: istObjekt,
    zaehle: (v) => Object.keys(v).length,
  }),
  rohEintrag({
    key: K.autorName,
    backupField: "autor",
    label: "Autor-Name",
  }),
  jsonEintrag({
    key: K.streamingDienste,
    backupField: "streaming_dienste",
    label: "Streaming-Dienste",
    pruefe: istObjekt,
    fehltStatus: "ÜBERSPRUNGEN — nicht im Backup: Abos bitte manuell setzen",
  }),
  jsonEintrag({
    key: K.mustwatch,
    backupField: "must_watch_liste",
    label: "Must-Watch-Liste",
    einheit: "Einträge",
    backupFallback: [],
    pruefe: (v) => Array.isArray(v) || (istObjekt(v) && Array.isArray(v.eintraege)),
    zuBackup: (v) => Array.isArray(v) ? v : v.eintraege,
    zuTopf: (v, now) => ({ eintraege: Array.isArray(v) ? v : v.eintraege, gespeichertAm: now }),
    zaehle: (v) => (Array.isArray(v) ? v : v.eintraege).length,
  }),
  jsonEintrag({
    key: K.achievements,
    backupField: "achievements",
    label: "Achievements",
    einheit: "freigeschaltet",
    pruefe: istObjekt,
    zaehle: (v) => Array.isArray(v.eggs) ? v.eggs.length : 0,
  }),
  rohEintrag({
    key: K.zeitgrenze,
    backupField: "zeitgrenze",
    label: "Kino-Zeitfilter",
  }),
  rohEintrag({
    key: K.filterMediathek,
    backupField: "filter_mediathek",
    label: "Filtermenü Mediathek",
  }),
  rohEintrag({
    key: K.filterKino,
    backupField: "filter_kino",
    label: "Filtermenü Kino",
  }),
  rohEintrag({
    key: K.filterStreaming,
    backupField: "filter_streaming",
    label: "Filtermenü Streaming",
  }),
  jsonEintrag({
    key: K.geschmacksprofil,
    backupField: "geschmacksprofil",
    label: "Geschmacksprofil",
    einheit: "Signale",
    pruefe: istObjekt,
    zaehle: (v) => Array.isArray(v.signale) ? v.signale.length : 0,
  }),
]);

export const PERSONAL_DATA_KEYS = Object.freeze(PERSONAL_DATA_ENTRIES.map((e) => e.key));

const NACH_KEY = new Map(PERSONAL_DATA_ENTRIES.map((e) => [e.key, e]));
const NACH_BACKUP = new Map(PERSONAL_DATA_ENTRIES.map((e) => [e.backupField, e]));

export function personalDataEntry(key) { return NACH_KEY.get(key) || null; }
export function personalDataEntryByBackupField(field) { return NACH_BACKUP.get(field) || null; }

export function baueRestorePlan(backup, now = Date.now()) {
  const plan = [];
  const bericht = [];
  for (const entry of PERSONAL_DATA_ENTRIES) {
    const hatFeld = Object.prototype.hasOwnProperty.call(backup, entry.backupField);
    const schritt = hatFeld ? entry.restorePlan(backup[entry.backupField], now) : null;
    if (schritt) {
      plan.push(schritt);
      bericht.push({ topf: entry.label, status: "übernommen", count: schritt.count });
    } else {
      bericht.push({ topf: entry.label, status: entry.fehltStatus, count: 0 });
    }
  }
  return { plan, bericht };
}

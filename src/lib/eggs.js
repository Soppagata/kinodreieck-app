/* ---------- Eastereggs: Eligibility & Achievement-Modell (Block 3) ----------
   Deterministisch: kein Netz, kein LLM, kein Fuzzy. Match = normalisierter
   `titel` ODER `originaltitel` + `jahr` gegen die kuratierten Referenzlisten
   (eastereggs_config.json, gebündelt, nur PERSONAL_MODE).

   Achievement = Unlock (Einbahn): ist die Schwelle qualifizierter Mediathek-
   Einträge einmal erreicht, bleibt das Egg freigeschaltet. WAS beim Feuern
   gezeigt wird, ist eine Live-Auswahl (qualifiziert ∩ aktuell verfügbar) —
   Unlock ≠ Inhalt (Spec §2). Persistenz: kd:achievements (11. Sync-/Backup-
   Artefakt, additiv; Blob pro Schlüssel → kein Schema-Eingriff). */

import config from "../data/eastereggs_config.json" with { type: "json" };
import { norm } from "./match.js";
import { hatPhysischeQuelle } from "./quellen.js";
import { sichtbareDienste } from "./dienste.js";
import { store, K } from "./storage.js";

const jahrKey = (j) => (j === 0 || j ? String(j) : "");
const refKey = (titel, jahr) => norm(titel) + "|" + jahrKey(jahr);

/* Schwellen-Eggs mit vorberechnetem Match-Index (einmalig beim Modul-Load):
   ein Set aller `norm(titel|originaltitel)+"|"+jahr`-Schlüssel je Egg. */
export const SCHWELLEN_EGGS = (config.schwellenEggs || []).map((egg) => {
  const keys = new Set();
  for (const r of egg.referenz || []) {
    if (r.titel) keys.add(refKey(r.titel, r.jahr));
    if (r.originaltitel) keys.add(refKey(r.originaltitel, r.jahr));
  }
  return { id: egg.id, name: egg.name, schwelle: egg.schwelle, referenz: egg.referenz || [], _keys: keys };
});

export const EGG_NAME = Object.fromEntries(SCHWELLEN_EGGS.map((e) => [e.id, e.name]));

/* Qualifiziert ein Mediathek-Eintrag für ein Egg?
   Treffer, wenn norm(titel) ODER norm(originaltitel) + jahr in der Referenz steckt.
   Kein Fuzzy, kein Prefix — exakte normalisierte Gleichheit; Jahr disambiguiert Remakes. */
export function qualifiziert(film, egg) {
  if (!film || !egg) return false;
  const j = film.jahr;
  if (film.titel && egg._keys.has(refKey(film.titel, j))) return true;
  if (film.originaltitel && egg._keys.has(refKey(film.originaltitel, j))) return true;
  return false;
}

/* Alle qualifizierten Einträge eines Eggs aus der Mediathek. */
export function qualifizierteEintraege(master, egg) {
  return (master || []).filter((f) => qualifiziert(f, egg));
}

/* Zähle qualifizierte Einträge je Egg → { eggId: anzahl }. */
export function zaehleQualifiziert(master) {
  const out = {};
  for (const egg of SCHWELLEN_EGGS) out[egg.id] = qualifizierteEintraege(master, egg).length;
  return out;
}

/* Welche Schwellen-Eggs erreichen mit dem aktuellen Master ihre Schwelle?
   → Set von Egg-IDs (Unlock-Kandidaten; die Einbahn-Union macht der Aufrufer). */
export function berechneUnlocks(master) {
  const s = new Set();
  for (const egg of SCHWELLEN_EGGS) {
    if (qualifizierteEintraege(master, egg).length >= egg.schwelle) s.add(egg.id);
  }
  return s;
}

/* Verfügbarkeit (Live-Pool-Gate, Hybrid Unlock ≠ Inhalt):
   verfügbar = physischer Besitz ∨ streambar auf angehaktem Abo ∨ im aktuellen Kinoprogramm.
   ctx: { auswahl:[], dienstePro:Map(film.id→dienste[]), kinoIds:Set(film.id) } — alle optional. */
export function istVerfuegbar(film, ctx = {}) {
  if (!film) return false;
  if (hatPhysischeQuelle(film.quelle)) return true;
  if (ctx.kinoIds && ctx.kinoIds.has(film.id)) return true;
  if (ctx.dienstePro) {
    const d = ctx.dienstePro.get(film.id);
    if (d && sichtbareDienste(d, ctx.auswahl || []).length) return true;
  }
  return false;
}

/* Live-Vertreter eines Eggs: qualifiziert ∩ aktuell verfügbar (fürs Feuern in B3
   und die Vorführmodus-Zahlen). */
export function liveVertreter(master, egg, ctx = {}) {
  return qualifizierteEintraege(master, egg).filter((f) => istVerfuegbar(f, ctx));
}

/* ---------- Achievement-Persistenz: kd:achievements ----------
   Set freigeschalteter Egg-IDs, additiv (Einbahn). Tolerant beim Lesen
   (Array ODER {eggs:[...]}), damit alte/rohe Stände nicht kippen. */
export function parseAchievements(value) {
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(v)) return new Set(v);
    if (v && Array.isArray(v.eggs)) return new Set(v.eggs);
  } catch { /* leer/kaputt → leeres Set */ }
  return new Set();
}
export function serialisiereAchievements(set) {
  return JSON.stringify({ eggs: [...(set || [])], gespeichertAm: Date.now() });
}
export async function ladeAchievements() {
  try { const r = await store.get(K.achievements); return parseAchievements(r ? r.value : null); }
  catch { return new Set(); }
}
export async function speichereAchievements(set) {
  try { await store.set(K.achievements, serialisiereAchievements(set)); return true; }
  catch { return false; }
}

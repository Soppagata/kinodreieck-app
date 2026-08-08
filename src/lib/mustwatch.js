/* ---------- Must-Watch-Liste + Besitz-Nachtrag (reine Logik, testbar) ----------
   Die Must-Watch-Liste ist ein EIGENER Datentopf (kd:mustwatch, 10. Sync-Datei) —
   KEIN Filter über die Mediathek. Sie ERSETZT das frühere must_watch-Flag der
   Master (Entscheidung 18.07.2026): das Flag-Feld bleibt in den Daten erhalten
   (Kompatibilität), wird aber im UI nirgends mehr angeboten — die Liste ist die
   einzige Wahrheit.

   Eintrag: { id, titel, jahr?, typ?, im_besitz, beschreibung, notiz,
              verknuepfung: null | {ziel: "master"|"programm"|"streaming", id},
              erstellt_am }
   `jahr` und `typ` sind seit dem Noch-sehen-Redesign optional ergänzbar. Alte
   Einträge ohne diese Felder bleiben gültig: fehlendes Jahr bleibt null,
   unbekannter Typ bleibt unbekannt — nichts wird zu "film" umgedeutet.
   IDs tragen den Prefix "mw_" — eigener Namensraum, kollidiert nie mit den
   slug_jahr-IDs der Master (wichtig fürs gemeinsame Blog-Referenz-Universum).

   Alles hier ist deterministisch, idempotent und ohne LLM. */

import { norm, slugId } from "./match.js";
import { hatPhysischeQuelle } from "./quellen.js";

export const MW_PREFIX = "mw_";
export const istMustwatchId = (id) => typeof id === "string" && id.startsWith(MW_PREFIX);

/* Neue Must-Watch-ID: mw_ + slug(titel); Kollision -> Suffix _2, _3 … */
export function neueMustwatchId(titel, vorhandene) {
  const basis = MW_PREFIX + (slugId(titel, null) || "eintrag");
  const ids = new Set((vorhandene || []).map((e) => e.id));
  let id = basis, n = 2;
  while (ids.has(id)) { id = basis + "_" + n; n++; }
  return id;
}

/* Wrapper lesen/schreiben (Ablageform im Topf: {eintraege, gespeichertAm}) */
export function parseMustwatch(rohText) {
  try {
    const p = JSON.parse(rohText);
    if (Array.isArray(p)) return p; // tolerant: nackte Liste
    return Array.isArray(p.eintraege) ? p.eintraege : [];
  } catch { return []; }
}

/* ================= Noch-sehen-Projektionen (rein, ohne Persistenz) =================
   Diese Funktionen berechnen ausschließlich ANSICHTEN über den vorhandenen
   Bestand. Sie schreiben nichts, migrieren nichts und speichern insbesondere
   keinen Verfügbarkeitsstatus: Verfügbarkeit ist immer eine Ableitung aus einer
   ausdrücklich gesetzten stabilen Verknüpfung plus dem gerade geladenen
   Kandidatenbestand. Fehlt der Bestand, gibt es keine Aussage — und nicht die
   Behauptung "nicht verfügbar". */

/* Optionaler Typ. Nur eindeutig belegte Werte ergeben film/serie; alles andere
   (fehlend, leer, unbekannt, "filmreihe", Zahl) bleibt bewusst null. */
export function mustwatchTyp(typ) {
  const wert = String(typ ?? "").trim().toLowerCase();
  if (["serie", "series", "tv_series", "tv series", "show"].includes(wert)) return "serie";
  if (["film", "movie"].includes(wert)) return "film";
  return null;
}

/* Optionales Jahr. Freitext aus dem Formular darf nie ein erfundenes Jahr
   erzeugen; nur eine plausible ganze Jahreszahl wird übernommen. */
export function mustwatchJahr(jahr) {
  const roh = typeof jahr === "string" ? jahr.trim() : jahr;
  if (roh === "" || roh === null || roh === undefined) return null;
  const zahl = Number(roh);
  return Number.isInteger(zahl) && zahl >= 1870 && zahl <= 2999 ? zahl : null;
}

/* Durchsuchbar sind Titel, Jahr, Notiz UND die bestehende Beschreibung — das
   Beschreibungsfeld bleibt damit auffindbar, obwohl die Karte beide Texte
   getrennt hält. */
export function mustwatchSuchtext(eintrag) {
  return [eintrag?.titel, eintrag?.jahr, eintrag?.notiz, eintrag?.beschreibung]
    .map((wert) => norm(String(wert ?? "")))
    .filter(Boolean)
    .join(" ");
}

export function passtZuMustwatchSuche(eintrag, suche) {
  const nq = norm(String(suche ?? ""));
  if (!nq) return true;
  return mustwatchSuchtext(eintrag).includes(nq);
}

const STATUS_LABEL = { master: "MEDIATHEK", programm: "IM KINO", streaming: "STREAMING" };

/* Verfügbarkeit ausschließlich aus expliziter stabiler Verknüpfung + aktuell
   geladenem Kandidatenbestand. Kein Titelvergleich, kein Fuzzy, kein Rateweg.
   IDs werden tolerant als String verglichen (watchmode_id ist eine Zahl,
   film_at_id kommt je nach Quelle als Zahl oder String). */
export function mustwatchVerfuegbarkeit(eintrag, kandidaten = {}) {
  const ref = eintrag?.verknuepfung;
  if (!ref || !STATUS_LABEL[ref.ziel] || ref.id == null || String(ref.id).trim() === "") return null;
  const liste = Array.isArray(kandidaten?.[ref.ziel]) ? kandidaten[ref.ziel] : [];
  const kandidat = liste.find((k) => k && k.id != null && String(k.id) === String(ref.id));
  if (!kandidat) return null;
  return {
    ziel: ref.ziel,
    label: STATUS_LABEL[ref.ziel],
    /* "Jetzt verfügbar" meint eine laufende externe Abspielgelegenheit. Ein
       Mediathek-Treffer ist Besitz, keine aktuelle Vorstellung. */
    aktuell: ref.ziel === "programm" || ref.ziel === "streaming",
    titel: kandidat.titel ?? null,
    jahr: kandidat.jahr ?? null,
    kandidat,
  };
}

/* Eine einzige Sortierung für Dashboard UND Vollansicht: aktuell verfügbar,
   dann zuletzt gemerkt, dann Titel. Rein und ohne Mutation der Eingabe. */
export function sortiereMustwatch(eintraege, kandidaten = {}) {
  return [...(Array.isArray(eintraege) ? eintraege : [])].sort((a, b) => {
    const ra = mustwatchVerfuegbarkeit(a, kandidaten)?.aktuell ? 0 : 1;
    const rb = mustwatchVerfuegbarkeit(b, kandidaten)?.aktuell ? 0 : 1;
    const za = Date.parse(a?.erstellt_am || "") || 0;
    const zb = Date.parse(b?.erstellt_am || "") || 0;
    return ra - rb || zb - za
      || String(a?.titel || "").localeCompare(String(b?.titel || ""), "de");
  });
}

export const MUSTWATCH_FILTER = ["alle", "jetzt", "film", "serie"];

export function passtZuMustwatchFilter(eintrag, filter, kandidaten = {}) {
  if (filter === "jetzt") return mustwatchVerfuegbarkeit(eintrag, kandidaten)?.aktuell === true;
  if (filter === "film" || filter === "serie") return mustwatchTyp(eintrag?.typ) === filter;
  return true;
}

/* Gemeinsame Projektion für beide Ansichten: filtern, suchen, sortieren. */
export function projiziereMustwatch(eintraege, { filter = "alle", suche = "" } = {}, kandidaten = {}) {
  const gefiltert = (Array.isArray(eintraege) ? eintraege : []).filter((e) =>
    passtZuMustwatchFilter(e, filter, kandidaten) && passtZuMustwatchSuche(e, suche));
  return sortiereMustwatch(gefiltert, kandidaten);
}

/* ---------- Migration: must_watch-Flag -> Liste (einmalig, idempotent) ----------
   Pro Master-Eintrag mit must_watch: true entsteht ein Listeneintrag mit
   Verknüpfung auf die Master-ID. im_besitz wird aus der quelle abgeleitet:
   mindestens eine PHYSISCHE Quelle (nicht nur "dvd" — deckt Kombis/Blu-ray ab).
   Idempotent: existiert bereits ein Eintrag mit Verknüpfung auf dieselbe
   Master-ID, wird übersprungen. Wiederholung ändert nichts. */
export function migriereFlags(master, mustwatch, jetztIso) {
  const verlinkt = new Set((mustwatch || [])
    .filter((e) => e.verknuepfung && e.verknuepfung.ziel === "master")
    .map((e) => e.verknuepfung.id));
  const neue = [];
  let uebersprungen = 0;
  const alle = [...(mustwatch || [])];
  for (const f of master || []) {
    if (!f.must_watch) continue;
    if (verlinkt.has(f.id)) { uebersprungen++; continue; }
    const eintrag = {
      id: neueMustwatchId(f.titel, alle),
      titel: f.titel,
      im_besitz: hatPhysischeQuelle(f.quelle),
      beschreibung: "",
      notiz: "",
      verknuepfung: { ziel: "master", id: f.id },
      erstellt_am: jetztIso || new Date().toISOString(),
    };
    alle.push(eintrag);
    neue.push(eintrag);
    verlinkt.add(f.id);
  }
  return { neue, uebersprungen };
}

/* Wie viele Flags sind noch nicht migriert? (steuert die Sichtbarkeit des Knopfs) */
export function offeneFlagAnzahl(master, mustwatch) {
  const verlinkt = new Set((mustwatch || [])
    .filter((e) => e.verknuepfung && e.verknuepfung.ziel === "master")
    .map((e) => e.verknuepfung.id));
  return (master || []).filter((f) => f.must_watch && !verlinkt.has(f.id)).length;
}

/* ---------- Besitz-Nachtrag-Import (deterministisch, idempotent) ----------
   Nimmt eine Import-Datei {format: "kinodreieck-besitz-import", eintraege: [...]}
   und erzeugt UNBEWERTETE Besitz-Einträge für die Master. Guard: exakte
   slug_jahr-ID-Kollision mit dem Bestand -> überspringen + berichten (fängt auch
   Duplikate innerhalb der Datei). KEIN Fuzzy-Matching. Wiederholter Lauf: alle
   IDs kollidieren -> nichts ändert sich; Wiederholung nur über die Fehlmenge. */
export const BESITZ_IMPORT_FORMAT = "kinodreieck-besitz-import";

export function parseBesitzImport(text) {
  let p;
  try { p = JSON.parse(text); } catch { throw new Error("Keine gültige JSON-Datei."); }
  if (p.format !== BESITZ_IMPORT_FORMAT) throw new Error('Falsches Format — erwartet format: "' + BESITZ_IMPORT_FORMAT + '".');
  if (!Array.isArray(p.eintraege)) throw new Error("Import ohne 'eintraege'-Liste.");
  return p;
}

export function wendeBesitzImportAn(importDatei, master, jetztIso) {
  const vorhandeneIds = new Set((master || []).map((f) => f.id));
  const neue = [];
  const bericht = [];
  for (const k of importDatei.eintraege || []) {
    const titel = String(k.titel || "").trim();
    if (!titel) { bericht.push({ titel: "(leer)", status: "übersprungen", grund: "kein Titel" }); continue; }
    const jahr = Number.isInteger(k.jahr) ? k.jahr : null;
    const id = slugId(titel, jahr); // jahr null -> Slug ohne Jahres-Suffix (nichts erfinden)
    if (vorhandeneIds.has(id)) {
      bericht.push({ titel, jahr, id, status: "übersprungen", grund: "ID existiert bereits (Master oder Duplikat in der Datei)" });
      continue;
    }
    vorhandeneIds.add(id);
    neue.push({
      id,
      titel,
      originaltitel: titel,
      jahr,
      jahr_bis: null,
      typ: k.typ === "serie" ? "serie" : "film",
      quelle: k.quelle || "dvd",
      must_watch: false, // Kompatibilitäts-Feld — die Liste ist die Wahrheit
      kategorie: null,
      bewertet_von: null,
      bewertung: null, // unbewertet — Max bewertet selbst in der App
      genre: [],
      tags: [],
      begruendung: "",
      notiz: k.notiz || "",
      status: "gesetzt",
      import_am: (jetztIso || new Date().toISOString()).slice(0, 10),
    });
    bericht.push({ titel, jahr, id, status: "übernommen" });
  }
  return { neue, bericht };
}

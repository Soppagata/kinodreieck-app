/* ---------- Titel-Normalisierung, Matching, IDs, Ranking ---------- */
import { normalisiereTyp } from "./typen.js";

const ARTIKEL = ["the","der","die","das","ein","eine","le","la","les","el","il","lo","los","a","an"];

/* Akzentvarianten lateinischer Titel sollen robust matchen, Markierungen in
   anderen Schriften koennen dagegen selbst bedeutungstragend sein (z.B.
   japanische Dakuten). Deshalb entfernen wir Marks nur direkt nach einem
   lateinischen Grundzeichen und setzen die uebrigen Zeichen wieder zusammen. */
function falteTitel(s) {
  return String(s).toLocaleLowerCase("de").normalize("NFKD")
    .replace(/ß/g, "ss")
    .replace(/(\p{Script=Latin})\p{Mark}+/gu, "$1")
    .normalize("NFC");
}

export function norm(s) {
  if (!s) return "";
  let t = falteTitel(s);
  t = t.replace(/[^\p{Letter}\p{Number}\p{Mark} ]+/gu, " ").replace(/\s+/g, " ").trim();
  const parts = t.split(" ");
  if (parts.length > 1 && ARTIKEL.includes(parts[0])) t = parts.slice(1).join(" ");
  return t;
}

const EDITION_REST_RE = /^(the\s+)?(final|director|directors|ultimate|extended|special|anniversary|remastered|restored|uncut|redux|4k|imax)\b/;

/* Programm-Titel gegen Masterliste (Titel-basiert — Programmdaten haben keine IDs).
   Gehärtet gegen False Positives (Pi→Pippi, Furious→Fast&Furious):
   1. Exakte norm-Gleichheit hat Vorrang.
   2. Teiltreffer nur an Wortgrenzen (Prefix), nie Substring mitten im Wort.
   3. Substanzschwelle: kürzere Seite braucht 2+ Wörter UND 8+ Zeichen.
   4. Jahres-Guard: sind beide Jahre bekannt und >2 auseinander (jahr_bis
      berücksichtigt), ist es kein Treffer.
   Wird obsolet, sobald film_at_id in der Masterliste hinterlegt ist (exakter
   ID-Vergleich); bleibt dann Fallback für Einträge ohne ID. */
export function jahrPasst(m, progJahr) {
  if (!progJahr || !m.jahr) return true; // ohne Jahr keine Aussage — nicht blocken
  const bis = m.jahr_bis || m.jahr;
  return progJahr >= m.jahr - 2 && progJahr <= bis + 2;
}
export function wortPrefix(lang, kurz) {
  // "blade runner final cut" ↔ "blade runner": Prefix und danach Wortgrenze
  return !!lang && !!kurz && lang !== kurz && lang.startsWith(kurz) && lang[kurz.length] === " ";
}
export function substanz(s) {
  return s.length >= 8 && s.split(" ").length >= 2;
}
export function matchFilm(progTitel, progJahr, master) {
  const p = norm(progTitel);
  if (!p) return null;
  let candidates = master.filter((m) =>
    (norm(m.titel) === p || norm(m.originaltitel) === p) && jahrPasst(m, progJahr));
  if (candidates.length === 0) {
    candidates = master.filter((m) => {
      if (!jahrPasst(m, progJahr)) return false;
      const a = norm(m.titel), b = norm(m.originaltitel);
      const kandidaten = [a, b].filter(Boolean);
      return kandidaten.some((t) => {
        const kurz = t.length <= p.length ? t : p;
        if (!substanz(kurz)) return false;
        if (wortPrefix(t, p)) return true; // Master-Titel länger (Programm sucht die Kurzform) — sicher
        if (wortPrefix(p, t)) {
          // Programm-Titel länger: "Blade Runner – Final Cut" = Edition (ok),
          // "Evil Dead Burn" = ANDERER Film (Sequel-Falle!). Nur zulassen,
          // wenn der Zusatz ein Editions-Marker ist oder ein Programm-Jahr
          // existiert (dann hat der Jahres-Guard bereits geprüft).
          const rest = p.slice(t.length + 1);
          return EDITION_REST_RE.test(rest) || progJahr != null;
        }
        return false;
      });
    });
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (progJahr) {
    candidates.sort((a, b) => Math.abs((a.jahr || 0) - progJahr) - Math.abs((b.jahr || 0) - progJahr));
  }
  return candidates[0];
}

/* ---------- Stabile IDs ----------
   Konvention (identisch zum Generator der Masterliste v3.1): slug(titel)_jahr.
   Die ID ist der Schlüssel — nicht der Titel. Einmal vergeben, nie geändert. */
export function slugId(titel, jahr) {
  const original = String(titel || "");
  const entfaltet = falteTitel(original);
  let t = entfaltet.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  /* Reines ASCII-Slugging liess nicht-lateinische Titel bisher alle auf ""
     kollabieren. Ein kurzer stabiler FNV-1a-Fingerabdruck bewahrt die bisherige
     lesbare ID-Konvention, trennt aber Titel, deren Schrift im ASCII-Anteil
     verloren geht. Bereits gespeicherte IDs werden von ensureIds nie geaendert. */
  if (/[^\x00-\x7f]/.test(entfaltet)) {
    let hash = 0x811c9dc5;
    for (const zeichen of original.normalize("NFC")) {
      hash ^= zeichen.codePointAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    t = `${t || "titel"}_${hash.toString(36)}`;
  }
  return t + (jahr ? "_" + jahr : "");
}

export const ERSTES_FILMJAHR = 1888;
export const ERSTES_SERIENJAHR = 1928;
/* Rückwärtskompatibler Name: bezeichnete historisch die Film-Untergrenze. */
export const ERSTES_PLAUSIBLES_JAHR = ERSTES_FILMJAHR;

/* Film und Serie haben medienhistorisch sinnvolle Untergrenzen. Bei Musik und
   Sonstigem (u.a. Buch, Theater, Person) sowie untypisierten Blogreferenzen
   sind auch fruehere positive Jahre gueltig. Jahr 0/BCE wird vom bestehenden
   Datenmodell nicht abgebildet. */
export function plausiblerJahresbereich(typ = null, aktuellesJahr = new Date().getUTCFullYear()) {
  const kanonischerTyp = typ ? normalisiereTyp(typ) : null;
  const min = kanonischerTyp === "film"
    ? ERSTES_FILMJAHR
    : kanonischerTyp === "serie" ? ERSTES_SERIENJAHR : 1;
  return { min, max: aktuellesJahr + 10 };
}

/* Leer ist ein gueltiger unbekannter Wert; alles andere muss eine positive,
   ganze und fuer den konkreten Medientyp plausible Jahreszahl sein. */
export function lesePlausiblesJahr(wert, { typ = null, aktuellesJahr = new Date().getUTCFullYear() } = {}) {
  const roh = String(wert ?? "").trim();
  if (!roh) return { ok: true, jahr: null };
  const { min, max } = plausiblerJahresbereich(typ, aktuellesJahr);
  if (!/^\d{1,4}$/.test(roh)) return { ok: false, jahr: null };
  const jahr = Number(roh);
  return Number.isInteger(jahr) && jahr >= min && jahr <= max
    ? { ok: true, jahr }
    : { ok: false, jahr: null };
}

/* Selbstheilung für ältere Exporte/Importe ohne id-Feld:
   fehlende IDs deterministisch ergänzen, Kollisionen mit Suffix auflösen.
   Migration: kategorie_frei (alter Feldname, nur sonstiges) -> art (musik+sonstiges). */
export function ensureIds(filme) {
  /* seen = alle schon existierenden IDs (damit NEU erzeugte IDs nicht mit
     ihnen kollidieren). vergeben = in DIESEM Durchlauf bereits benutzte IDs —
     trägt den Dublettenschutz (KD-005). */
  const seen = new Set(filme.filter((f) => f.id).map((f) => f.id));
  const vergeben = new Set();
  const eindeutig = (basis) => {
    const base = basis || "id";
    let id = base, n = 2;
    while (seen.has(id) || vergeben.has(id)) { id = base + "_" + n; n++; }
    return id;
  };
  return filme.map((roh) => {
    let f = roh;
    if (f.kategorie_frei && !f.art) {
      const { kategorie_frei, ...rest } = f;
      f = { ...rest, art: kategorie_frei };
    }
    /* Feld-Migration 2026-07: scope_note -> notiz (freies Notizfeld für
       jeden Eintrag) — greift auch bei alten Browser-Storage-Ständen. */
    if (f.scope_note !== undefined && f.notiz === undefined) {
      const { scope_note, ...rest } = f;
      f = { ...rest, notiz: scope_note };
    }
    /* Nicht mehr angebotene Typen bleiben beim Laden kompatibel und werden auf
       die heutigen Typen abgebildet. Neue Eingaben erzeugen sie nicht mehr. */
    const typ = normalisiereTyp(f.typ);
    if (typ !== (f.typ || "film")) f = { ...f, typ };
    /* KD-005: eine bereits im selben Import/Restore vergebene ID wird NICHT
       durchgereicht (das erzeugte sonst echte Doppel-IDs → bricht React-Keys,
       Update-by-ID, Matching, Sync). Erste Verwendung behält ihre ID, jede
       weitere bekommt deterministisch eine neue eindeutige. */
    if (f.id) {
      if (!vergeben.has(f.id)) { vergeben.add(f.id); return f; }
      const neuId = eindeutig(slugId(f.titel, f.jahr) || f.id);
      vergeben.add(neuId);
      return { ...f, id: neuId };
    }
    const id = eindeutig(slugId(f.titel, f.jahr));
    vergeben.add(id);
    return { id, ...f };
  });
}

/* ---------- Ranking ---------- */
export function score(film) {
  const bw = film.bewertung || {};
  let s = (bw.wie ?? 0) + (bw.was ?? 0) + (bw.warum ?? 0);
  if (film.kategorie === "immer_gut" || film.kategorie === "sicher_gut") s += 2;
  else if (["kult", "kult_klassiker", "wahrscheinlich_passend"].includes(film.kategorie)) s += 1;
  else if (film.kategorie === "echter_schrott") s -= 2;
  return s;
}

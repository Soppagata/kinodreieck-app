/* ---------- Titel-Normalisierung, Matching, IDs, Ranking ---------- */
const ARTIKEL = ["the","der","die","das","ein","eine","le","la","les","el","il","lo","los","a","an"];

export function norm(s) {
  if (!s) return "";
  let t = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
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
  let t = String(titel || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return t + (jahr ? "_" + jahr : "");
}

/* Selbstheilung für ältere Exporte/Importe ohne id-Feld:
   fehlende IDs deterministisch ergänzen, Kollisionen mit Suffix auflösen.
   Migration: kategorie_frei (alter Feldname, nur sonstiges) -> art (musik+sonstiges). */
export function ensureIds(filme) {
  const seen = new Set(filme.filter((f) => f.id).map((f) => f.id));
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
    /* typ-Bereinigung 2026-07: trilogie/franchise gestrichen (0x belegt) —
       filmreihe/serie decken sie ab; alte Importe werden normalisiert. */
    if (f.typ === "trilogie") f = { ...f, typ: "filmreihe" };
    if (f.typ === "filmreihe") f = { ...f, typ: "film" }; // Filmreihe 2026-07 gestrichen -> Film
    if (f.typ === "franchise") f = { ...f, typ: "serie" };
    if (f.id) return f;
    const base = slugId(f.titel, f.jahr);
    let id = base, n = 2;
    while (seen.has(id)) { id = base + "_" + n; n++; }
    seen.add(id);
    return { id, ...f };
  });
}

/* ---------- Ranking ---------- */
export function schlagseite(bw) {
  if (!bw) return null;
  const v = [bw.wie ?? 0, bw.was ?? 0, bw.warum ?? 0];
  const mx = Math.max(...v), mn = Math.min(...v);
  if (mx - mn < 2) return null;
  return ["wie", "was", "warum"][v.indexOf(mx)];
}

export function score(film) {
  const bw = film.bewertung || {};
  let s = (bw.wie ?? 0) + (bw.was ?? 0) + (bw.warum ?? 0);
  if (schlagseite(bw)) s += 1.5;
  if (film.kategorie === "immer_gut" || film.kategorie === "sicher_gut") s += 2;
  else if (["kult", "kult_klassiker", "wahrscheinlich_passend"].includes(film.kategorie)) s += 1;
  else if (film.kategorie === "echter_schrott") s -= 2;
  return s;
}

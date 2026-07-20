/* ============================================================
   Blog: Artikel-Schema & Abgleich-Engine (deterministisch)
   ------------------------------------------------------------
   Schema: { id, titel, autor, text, geordnet, status, erstellt_am,
             liste: [{ eingabe, jahr, typ, ref }] }  (max 15 Einträge)
   - eingabe = was Max getippt hat (bleibt für die Anzeige erhalten)
   - ref     = aufgelöste Mediathek-ID; die eigentliche, stabile Verbindung.
               Der Titel ist NICHT der Schlüssel.
   - ref: null = Rotlink — blockiert die Freigabe NIE.
   Abgleich pro Eintrag, drei Ausgänge:
   - genau ein Exakt-Treffer  -> verlinkt
   - kein Treffer, aber Fuzzy-Kandidaten -> "mehrfach" (blockiert Freigabe,
     Auswahl inkl. "Keiner davon -> Rotlink")
   - gar nichts -> rotlink (frei)
   ============================================================ */
import { norm, slugId, jahrPasst, wortPrefix, substanz } from "./match.js";

export const MAX_LISTE = 15;

export function neueArtikelId(titel, vorhandene) {
  const basis = slugId(titel, null) || "artikel";
  const ids = new Set((vorhandene || []).map((a) => a.id));
  let id = basis, n = 2;
  while (ids.has(id)) { id = basis + "_" + n; n++; }
  return id;
}

/* Einen Listeneintrag gegen die Masterliste abgleichen. */
export function gleicheEintragAb(le, master) {
  const ne = norm(le.eingabe);
  if (!ne) return { status: "rotlink", ref: null, kandidaten: [] };
  const passtTyp = (f) => !le.typ || (f.typ || "film") === le.typ;
  const passtJahr = (f) => jahrPasst(f, le.jahr || null);

  // 1) Exakt (norm-Gleichheit auf Titel/Originaltitel)
  let exakt = master.filter((f) => passtTyp(f) && passtJahr(f) &&
    (norm(f.titel) === ne || norm(f.originaltitel) === ne));
  if (exakt.length > 1 && le.jahr) {
    const genau = exakt.filter((f) => f.jahr === le.jahr);
    if (genau.length === 1) exakt = genau;
  }
  if (exakt.length === 1) return { status: "verlinkt", ref: exakt[0].id, kandidaten: [] };
  if (exakt.length > 1) return { status: "mehrfach", ref: null, kandidaten: exakt.map(kandidat) };

  // 2) Fuzzy: Wortgrenzen-Prefix + Substanzschwelle -> Vorschläge, NIE automatisch
  const fuzzy = master.filter((f) => {
    if (!passtTyp(f) || !passtJahr(f)) return false;
    return [norm(f.titel), norm(f.originaltitel)].filter(Boolean).some((t) => {
      const kurz = t.length <= ne.length ? t : ne;
      return substanz(kurz) && (wortPrefix(ne, t) || wortPrefix(t, ne));
    });
  });
  if (fuzzy.length) return { status: "mehrfach", ref: null, kandidaten: fuzzy.map(kandidat) };

  // 3) Token-Overlap — bewusst großzügig: lieber einen Vorschlag zu viel als
  //    eine versehentliche Dublette über "+ Neu anlegen". Liefert NUR
  //    Mehrfachauswahl-Kandidaten, nie einen Auto-Link.
  //    "star wars episode 1" findet "Star Wars Episode I–VI" (1 <-> I römisch).
  const eTok = tokenListe(ne);
  if (eTok.length) {
    const bewertet = [];
    for (const f of master) {
      if (!passtTyp(f) || !passtJahr(f)) continue;
      const tSet = new Set([...tokenListe(norm(f.titel)), ...tokenListe(norm(f.originaltitel || ""))]);
      const gemeinsam = eTok.filter((t) => tSet.has(t)).length;
      const anteil = gemeinsam / eTok.length;
      if ((gemeinsam >= 2 && anteil >= 0.6) || (eTok.length <= 2 && gemeinsam >= 1 && anteil >= 0.5)) {
        bewertet.push([anteil, f]);
      }
    }
    if (bewertet.length) {
      bewertet.sort((a, b) => b[0] - a[0]);
      return { status: "mehrfach", ref: null, kandidaten: bewertet.slice(0, 6).map((x) => kandidat(x[1])) };
    }
  }
  return { status: "rotlink", ref: null, kandidaten: [] };
}

const ROEMISCH = { "1": "i", "2": "ii", "3": "iii", "4": "iv", "5": "v", "6": "vi", "7": "vii", "8": "viii", "9": "ix", "10": "x" };
const STOPP = new Set(["the", "der", "die", "das", "of", "a", "an", "und", "and", "le", "la", "ein", "eine"]);
function tokenListe(s) {
  return s.split(" ").filter((t) => t && !STOPP.has(t)).map((t) => ROEMISCH[t] || t);
}

const kandidat = (f) => ({ id: f.id, titel: f.titel, jahr: f.jahr, typ: f.typ });

/* Ganzen Artikel abgleichen. Bereits gesetzte refs bleiben unangetastet
   (Re-Abgleich nach Bearbeitung: nur ungelöste/neue Einträge). */
export function gleicheArtikelAb(artikel, master) {
  const masterIds = new Set(master.map((f) => f.id));
  const liste = artikel.liste.map((le) => {
    if (le.ref && masterIds.has(le.ref)) return { ...le, abgleich: { status: "verlinkt", ref: le.ref, kandidaten: [] } };
    // "Keiner davon -> Rotlink" wurde bewusst gewählt: blockiert nicht mehr.
    if (le.rotlink_ok) return { ...le, ref: null, abgleich: { status: "rotlink", ref: null, kandidaten: [] } };
    const erg = gleicheEintragAb(le, master);
    return { ...le, ref: erg.status === "verlinkt" ? erg.ref : null, abgleich: erg };
  });
  const stat = { verlinkt: 0, rotlink: 0, mehrfach: 0 };
  for (const le of liste) stat[le.abgleich.status]++;
  return { ...artikel, liste, abgleichStat: stat };
}

/* Beim Bearbeiten: refs unveränderter Einträge in die neue Liste übernehmen.
   "Unverändert" = gleiche eingabe + jahr + typ. */
export function uebernehmeRefs(neueListe, alteListe) {
  const key = (le) => norm(le.eingabe) + "|" + (le.jahr || "") + "|" + (le.typ || "");
  const alt = new Map((alteListe || []).map((le) => [key(le), le.ref]));
  return neueListe.map((le) => (le.ref ? le : { ...le, ref: alt.get(key(le)) || null }));
}

/* Rotlink-Heilung: Wenn ein Mediathek-Eintrag NEU angelegt wird, alle
   offenen refs rescannen. Nur EINDEUTIGE Exakt-Treffer werden gesetzt —
   nichts wird geraten. Rückgabe: [neueArtikelListe, anzahlGeheilt]. */
export function heileRotlinks(artikelListe, master) {
  let geheilt = 0;
  const neu = artikelListe.map((a) => {
    let geaendert = false;
    const liste = a.liste.map((le) => {
      if (le.ref) return le;
      const erg = gleicheEintragAb(le, master);
      if (erg.status === "verlinkt") { geheilt++; geaendert = true; return { ...le, ref: erg.ref }; }
      return le;
    });
    return geaendert ? { ...a, liste } : a;
  });
  return [neu, geheilt];
}

/* Alle offenen Referenzen (ref: null) über alle Artikel — die Sammelstelle
   im Mediathek-Bereich. Reiner Laufzeit-Filter, wird nicht gepflegt. */
export function offeneReferenzen(artikelListe) {
  const offen = [];
  for (const a of artikelListe || []) {
    for (const le of a.liste || []) {
      if (!le.ref) offen.push({ artikelId: a.id, artikelTitel: a.titel, eingabe: le.eingabe, jahr: le.jahr, typ: le.typ });
    }
  }
  return offen;
}

/* "Kommt vor in": ref -> Artikel (nur freigegebene). Laufzeit-berechnet. */
export function kommtVorIn(artikelListe) {
  const map = {};
  for (const a of artikelListe || []) {
    if (a.status !== "freigegeben") continue;
    for (const le of a.liste || []) {
      if (le.ref) (map[le.ref] = map[le.ref] || []).push({ id: a.id, titel: a.titel });
    }
  }
  return map;
}

/* ============================================================
   Shared-Blogs: Ziehen & Reconciliation (deterministisch)
   ============================================================ */

/* Einen geteilten Blog (aus ladeSharedBlogs: { db_owner, db_key, author, artikel })
   in einen lokalen, "gezogenen" Artikel umwandeln:
   - neue lokale ID (kollisionsfrei gegen die vorhandenen)
   - Herkunft markiert (db_owner/db_key) — Basis für die Start-Reconciliation
   - refs bewusst zurückgesetzt und gegen DIE EIGENE Masterliste neu aufgelöst;
     was der ziehende Nutzer nicht hat, wird automatisch zum Rotlink.
   nowIso: injizierbar (Tests deterministisch). */
export function blogZuArtikel(sharedBlog, vorhandene, master, nowIso) {
  const q = (sharedBlog && sharedBlog.artikel) || {};
  const id = neueArtikelId(q.titel || "geteilter-artikel", vorhandene || []);
  const roh = {
    id,
    titel: q.titel || "(ohne Titel)",
    autor: (sharedBlog && sharedBlog.author) || q.autor || "?",
    text: q.text || "",
    geordnet: !!q.geordnet,
    erstellt_am: q.erstellt_am || (nowIso ? nowIso : new Date().toISOString()),
    status: "freigegeben",          // gezogene Blogs sind sofort lesbar
    geteilt: false,                 // die lokale Kopie ist NICHT (re-)publiziert
    herkunft: "gezogen",
    db_owner: sharedBlog ? sharedBlog.db_owner : null,
    db_key: sharedBlog ? sharedBlog.db_key : null,
    liste: (q.liste || []).slice(0, MAX_LISTE).map((le) => ({
      eingabe: le.eingabe, jahr: le.jahr == null ? null : le.jahr, typ: le.typ || null, ref: null,
    })),
  };
  const abg = gleicheArtikelAb(roh, master || []);
  // Abgleich-Felder abstreifen (wie beim Erstellen): nur stabile refs bleiben.
  return { ...abg, liste: abg.liste.map(({ abgleich, ...rest }) => rest), abgleichStat: undefined };
}

/* Reconciliation beim Start: NUR gezogene Artikel, deren DB-Original nicht mehr in
   der aktuellen shared-Menge liegt, werden still entfernt (der Autor hat gelöscht).
   Selbst geschriebene und manuell importierte Artikel sind geschützt.
   sharedKeys = Set der Strings "<db_owner>|<db_key>".
   Rückgabe: [neueListe, entferntAnzahl]. */
export function reconcileGezogene(artikelListe, sharedKeys) {
  let entfernt = 0;
  const next = (artikelListe || []).filter((a) => {
    if (!a || a.herkunft !== "gezogen") return true;          // geschützt
    const k = (a.db_owner || "") + "|" + (a.db_key || "");
    const vorhanden = sharedKeys.has(k);
    if (!vorhanden) entfernt++;
    return vorhanden;
  });
  return [entfernt > 0 ? next : artikelListe, entfernt];
}

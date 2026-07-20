import { norm } from "./match.js";
import korrekturenDatei from "../data/programm_korrekturen.json"; // manuelle film.at-Korrekturen (film_at_id -> {jahr, titel})
const KORREKTUREN = korrekturenDatei.korrekturen || {};

/* ---------- Nonstop-Agenda-Parser (deterministisch, KEIN KI-Call) ----------
   Max speichert nonstopkino.at/programm im Browser (Strg+S, "nur HTML") und lädt
   die Datei in die App. Jede Vorstellung steckt in <article class="event"> mit
   data-Attributen (venue, weekday=ISO, location, language) — pures Parsen. */
export function parseNonstopHtml(html) {
  const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const bloecke = String(html).split('<article class="event"').slice(1);
  const idx = {}; const filme = [];
  let gesamt = 0, wien = 0;
  for (const b of bloecke) {
    gesamt++;
    const kopf = b.slice(0, b.indexOf(">"));
    const attr = (n) => { const m = new RegExp(n + '="([^"]*)"').exec(kopf); return m ? m[1] : ""; };
    if (attr("data-location") !== "wien") continue;
    wien++;
    const datumIso = attr("data-weekday"); // "2026-07-07"
    const titelRoh = (/<h3>([\s\S]*?)<\/h3>/.exec(b) || [])[1] || "";
    const titel = titelRoh.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/<[^>]+>/g, "").trim();
    if (!titel || !datumIso) continue;
    const uhr = (/class="big">\s*(\d{1,2}:\d{2})/.exec(b) || [])[1] || "";
    const locBlock = (/class="location">([\s\S]*?)<\/div>/.exec(b) || [])[1] || "";
    const kino = locBlock.split(/<br\s*\/?>/)[0].replace(/<[^>]+>/g, "").trim();
    const sprache = (/<abbr[^>]*>([^<]*)<\/abbr>/.exec(b) || [])[1] || "";
    const special = (/class="highlight"[^>]*>([^<]*)</.exec(b) || [])[1] || "";
    const d = new Date(datumIso + "T12:00:00");
    const zeit = WT[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + "." + (uhr ? " " + uhr : "") + (kino ? " · " + kino : "");
    const key = norm(titel);
    if (idx[key]) {
      const e = idx[key];
      if (kino && !e.k.includes(kino)) e.k.push(kino);
      if (!e.z.includes(zeit)) e.z.push(zeit);
      if (!e.f && sprache) e.f = sprache;
      if (!e.s && special) e.s = special;
    } else {
      const eintrag = { t: titel, j: null, k: kino ? [kino] : [], z: [zeit], f: sprache, s: special };
      idx[key] = eintrag; filme.push(eintrag);
    }
  }
  if (!gesamt) throw new Error('Keine <article class="event">-Blöcke gefunden — ist das die gespeicherte Programmseite?');
  return { filme, statistik: { gesamt, wien, titel: filme.length } };
}

/* ---------- Programm-Normalisierung ----------
   Akzeptiert drei Formate und liefert immer das interne Anzeigeformat
   {stand, quelle_hinweis, filme:[{t,j,k,z,f,s, film_at_id?, im_abo?}], events, demnaechst}:
   1. Altformat direkt: {stand, filme:[{t,j,k,z,f,s}]}
   2. Alt-Wrapper: {erstellt, data:{...wie 1...}}
   3. film.at-Format (programm_snapshot.js): {erstellt, zeitraum, filme:[{film_at_id,
      titel, jahr, vorstellungen:[{kino, zeit, fassung, im_abo, tags}]}]}
   Beim film.at-Format wird auf das Dashboard-Fenster (heute + 3 Tage) gefiltert —
   das Roh-JSON behält den vollen Zeitraum. */
const ANZEIGE_TAGE = 4;
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/* Termin-String fürs UI (Etappe 4, gemeinsamer Helper fürs Dashboard):
   Anzeige-Strings aus normalisiereProgramm ("Fr 17.7. 20:00 · Kino") gehen
   unverändert durch; rohe ISO-Zeiten ("2026-07-20T21:30:00+02:00" — z. B.
   aus alten/fremd geseedeten Pins) werden in dasselbe Format gebracht wie
   der z-Builder oben (String-basiert, keine TZ-Fallen). */
export function formatiereTermin(z) {
  const s = String(z ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  const d = new Date(s.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return s;
  const uhr = (s.match(/T(\d{2}:\d{2})/) || [])[1] || "";
  return WT[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + "." + (uhr ? " " + uhr : "");
}

/* Datum aus Altformat-Zeitstring ("Di 8.7. 20:30 · Filmcasino") ziehen.
   Jahr wird angenommen (aktuelles Jahr) — Snapshots sind Tage alt, nicht Monate.
   KD-020: Über den Jahreswechsel bricht die Jahres-Annahme (Dez-Snapshot listet
   Jan-Termine, Jan-Snapshot listet Dez-Termine). Rollover-Heuristik wie in den
   Termin-/Pin-Helfern (KinoTab.terminWert, App.pinAbgelaufen): liegt das Datum
   weit vor der Referenz (>300 Tage), ist es das Folgejahr; weit danach, das Vorjahr.
   Ohne parsebares Datum -> null (Eintrag wird dann nie weggefiltert). */
function parseAltDatum(s, refJahr, ref = new Date()) {
  const m = /(\d{1,2})\.(\d{1,2})\./.exec(String(s));
  if (!m) return null;
  const monat = Number(m[2]) - 1, tag = Number(m[1]);
  const TAG = 86400000;
  const bezug = (ref instanceof Date ? ref : new Date()).getTime();
  let d = new Date(refJahr, monat, tag);
  if (bezug - d.getTime() > 300 * TAG) d = new Date(refJahr + 1, monat, tag);       // weit vor Referenz -> Folgejahr
  else if (d.getTime() - bezug > 300 * TAG) d = new Date(refJahr - 1, monat, tag);  // weit nach Referenz -> Vorjahr
  return d;
}

/* Altformat aufräumen: vergangene Vorstellungen raus (der Snapshot deckt oft
   eine ganze Woche ab, auch rückwärts), Rest chronologisch sortieren, Kino-
   Liste aus den verbleibenden Zeiten neu ableiten. Filme ohne verbleibende
   Vorstellung fliegen raus. */
export function bereinigeAltFormat(data) {
  const jetzt = new Date();
  const h0 = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
  let entfernteZeiten = 0, entfernteFilme = 0;
  const filme = [];
  for (const f of data.filme) {
    const z = f.z || [];
    const bewertet = z.map((s) => ({ s, d: parseAltDatum(s, jetzt.getFullYear(), jetzt) })); // KD-020: jetzt als Rollover-Referenz
    const rest = bewertet.filter((x) => !x.d || x.d >= h0);
    entfernteZeiten += z.length - rest.length;
    if (!rest.length && z.length) { entfernteFilme++; continue; }
    rest.sort((a, b) => (a.d ? a.d.getTime() : Infinity) - (b.d ? b.d.getTime() : Infinity));
    // Kinos aus verbleibenden Zeiten neu ableiten ("… · Kino"), sonst Original behalten
    const kinos = [...new Set(rest.map((x) => (x.s.split(" · ")[1] || "").trim()).filter(Boolean))];
    filme.push({ ...f, z: rest.map((x) => x.s), k: kinos.length ? kinos : f.k });
  }
  if (!entfernteZeiten && !entfernteFilme) return data;
  const hinweis = (data.quelle_hinweis ? data.quelle_hinweis + " · " : "")
    + entfernteZeiten + " vergangene Vorstellung(en) ausgeblendet"
    + (entfernteFilme ? ", " + entfernteFilme + " Filme ganz vorbei" : "");
  return { ...data, filme, quelle_hinweis: hinweis };
}

export function normalisiereProgramm(parsed) {
  const data = parsed && parsed.data && Array.isArray(parsed.data.filme) ? parsed.data : parsed;
  if (!data || !Array.isArray(data.filme)) throw new Error("Kein 'filme'-Array gefunden.");
  if (!data.filme.length || !data.filme[0].vorstellungen) return bereinigeAltFormat(data); // Format 1/2

  // Format 3: film.at — Anzeige-Fenster bestimmen (lokale Zeit, String-basiert, keine TZ-Fallen)
  const heute = new Date();
  const tagStr = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const fenster = new Set();
  for (let i = 0; i < ANZEIGE_TAGE; i++) fenster.add(tagStr(new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + i)));
  const heuteStr = tagStr(heute);

  const baueFilm = (f, nurFenster) => {
    const vs = (f.vorstellungen || []).filter((v) => {
      const tag = String(v.zeit).slice(0, 10);
      if (tag < heuteStr) return false;            // Vergangenes IMMER raus — Abgleich mit Systemzeit bei jedem Öffnen
      return !nurFenster || fenster.has(tag);      // im Primärlauf zusätzlich aufs Anzeige-Fenster begrenzen
    });
    if (!vs.length) return null;
    const kinos = [...new Set(vs.map((v) => v.kino).filter(Boolean))];
    const z = vs.map((v) => {
      const iso = String(v.zeit);
      const d = new Date(iso.slice(0, 10) + "T12:00:00");
      const uhr = (iso.match(/T(\d{2}:\d{2})/) || [])[1] || "";
      return WT[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + "." + (uhr ? " " + uhr : "")
        + (v.kino ? " · " + v.kino : "") + (v.fassung ? " (" + v.fassung + ")" : "") + (v.im_abo ? " ✓Abo" : "");
    });
    const tags = [...new Set(vs.flatMap((v) => v.tags || []))];
    const korr = KORREKTUREN[String(f.film_at_id)] || {}; // film.at-Datenfehler manuell überschreiben
    return {
      t: korr.titel ?? f.titel, j: korr.jahr ?? f.jahr ?? null, k: kinos, z,
      ot: f.originaltitel ?? null, // Originaltitel (Phase 3, film.at-Detailseite) — Anzeige + Matching
      f: [...new Set(vs.map((v) => v.fassung).filter(Boolean))].join("/"),
      s: tags.join(", "),
      film_at_id: f.film_at_id ?? null,
      im_abo: vs.some((v) => v.im_abo),
      b: f.beschreibung || null,   // film.at-Beschreibung (Detailseite; Textzeile im Kino-Tab)
      g: f.genres || [],           // Genres — Vorbefüllung für "Eintrag erstellen"
    };
  };

  let filme = data.filme.map((f) => baueFilm(f, true)).filter(Boolean);
  const gesamt = data.filme.length;
  let hinweis = "film.at API" + (data.zeitraum ? " · Zeitraum " + data.zeitraum.von + "–" + data.zeitraum.bis : "");
  if (!filme.length) {
    // Fenster leer (z.B. Snapshot nur für spätere Tage) — ungefiltert zeigen statt leerem Dashboard
    filme = data.filme.map((f) => baueFilm(f, false)).filter(Boolean);
    hinweis += " · außerhalb des 4-Tage-Fensters, alle Termine gezeigt";
  } else {
    hinweis += " · Anzeige: heute + " + (ANZEIGE_TAGE - 1) + " Tage (" + filme.length + " von " + gesamt + " Filmen)";
  }
  if (Array.isArray(data.warnungen) && data.warnungen.length) hinweis += " · " + data.warnungen.length + " Warnung(en) im JSON";
  return {
    stand: (data.erstellt || parsed.erstellt || "").slice(0, 10) || null,
    quelle_hinweis: hinweis,
    filme,
    events: [],
    demnaechst: [],
  };
}

/* ---------- Zeitfilter (Kino-Tab Standardansicht) ---------- */
export function grenzeInMinuten(str) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(str || "");
  if (!m) return 14 * 60; // ungültige Eingabe -> Default 14:00
  return Number(m[1]) * 60 + Number(m[2]);
}

/* Hat der Programm-Film mindestens eine Vorstellung ab der Grenze? */
export function hatVorstellungAb(pf, grenzMin) {
  for (const s of pf.z || []) {
    const re = /(\d{1,2}):(\d{2})/g;
    let m;
    while ((m = re.exec(String(s)))) {
      if (Number(m[1]) * 60 + Number(m[2]) >= grenzMin) return true;
    }
  }
  return false;
}

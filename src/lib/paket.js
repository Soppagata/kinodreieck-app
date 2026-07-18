/* ============================================================
   Austauschformat "kinodreieck-paket" v1 — Teilen, Tauschen, Ingestion
   ------------------------------------------------------------
   EIN Format, ZWEI Erzeuger:
   1. Export aus einer Kinodreieck-Instanz (Bewertungen/Blogs teilen)
   2. Fremde KI über den Ingestion-Prompt (gebunchte, annotierte Listen)
   EIN Importer: Vorschau -> Auswahl auf Bereichs-Ebene -> Abgleich gegen
   die eigene Mediathek -> Übernahme. Regeln:
   - Eigene Einträge werden NIE überschrieben (Duplikate: überspringen).
   - Übernommene Einträge tragen bewertet_von = Paket-Autor. Damit bleibt
     sichtbar, wessen Urteil man liest — das Autoren-Feld wird scharf.
   - Artikel-Referenzen werden gegen die EIGENE Mediathek neu abgeglichen
     (fremde IDs gelten hier nicht); Unauflösbares wird Rotlink.
   ============================================================ */
import { norm, slugId, matchFilm } from "./match.js";
import { TYP_GRUPPEN, tabVonTyp, hatDreieck } from "./typen.js";
import { neueArtikelId, gleicheArtikelAb } from "./artikel.js";
import { QUELLEN, quelleZuArray } from "./quellen.js";

const QUELLE_KEYS = new Set(QUELLEN.map((q) => q.key));

export const PAKET_FORMAT = "kinodreieck-paket";
export const PAKET_VERSION = 1;
export const BEREICHE = ["filme", "serien", "musik", "sonstiges", "artikel"];
export const BEREICH_LABELS = { filme: "Filme", serien: "Serien", musik: "Musik", sonstiges: "Sonstiges", artikel: "Blog-Artikel" };

/* ---------- Export: Paket aus dem eigenen Bestand bauen ---------- */
export function bauePaket({ master, artikel, bereiche, autor }) {
  const paket = {
    format: PAKET_FORMAT,
    version: PAKET_VERSION,
    autor: (autor || "unbekannt").trim(),
    erstellt: new Date().toISOString(),
    quelle: "kinodreieck-export",
    hinweis: "Austauschdatei — in einer Kinodreieck-Instanz über 'Paket importieren' laden. Vor der Übernahme wird gefragt, welche Bereiche übernommen werden.",
    bereiche: {},
  };
  for (const b of bereiche) {
    if (b === "artikel") {
      paket.bereiche.artikel = (artikel || [])
        .filter((a) => a.status === "freigegeben")
        .map((a) => ({
          titel: a.titel, autor: a.autor || paket.autor, text: a.text,
          geordnet: !!a.geordnet, erstellt_am: a.erstellt_am || null,
          // refs bewusst NICHT mitgeben — IDs sind instanzlokal. Der Empfänger
          // gleicht eingabe/jahr/typ gegen die eigene Mediathek ab.
          liste: (a.liste || []).map(({ eingabe, jahr, typ }) => ({ eingabe, jahr: jahr ?? null, typ: typ || "film" })),
        }));
    } else {
      paket.bereiche[b] = (master || [])
        .filter((f) => TYP_GRUPPEN[b].includes(f.typ || "film"))
        .map((f) => ({
          titel: f.titel, originaltitel: f.originaltitel || f.titel,
          jahr: f.jahr ?? null, jahr_bis: f.jahr_bis ?? null, typ: f.typ || "film",
          kategorie: f.kategorie || null,
          bewertung: hatDreieck(f.typ) ? (f.bewertung || null) : null,
          genre: f.genre || [], tags: f.tags || [],
          begruendung: f.begruendung || "",
          beschreibung: f.beschreibung || undefined, // Musik/Sonstiges: Freitext
          art: f.art || undefined, // Musik/Sonstiges: freie Art (≤40 Zeichen)
          film_at_id: f.film_at_id ?? undefined, // universelle Kino-ID — darf mitreisen
          bewertet_von: f.bewertet_von || paket.autor,
        }));
    }
  }
  return paket;
}

/* ---------- Import Schritt 1: Parsen & Validieren ---------- */
export function parsePaket(text) {
  let p;
  try { p = JSON.parse(text); } catch { throw new Error("Keine gültige JSON-Datei."); }
  if (p.format !== PAKET_FORMAT) throw new Error("Kein Kinodreieck-Paket (format-Feld fehlt oder fremd). Für Masterlisten/artikel.json die normalen Import-Felder nutzen.");
  if (Number(p.version) > PAKET_VERSION) throw new Error("Paket-Version " + p.version + " ist neuer als diese App versteht (" + PAKET_VERSION + ").");
  if (!p.bereiche || typeof p.bereiche !== "object") throw new Error("Paket ohne 'bereiche'.");
  const autor = String(p.autor || "unbekannt").trim() || "unbekannt";
  return { ...p, autor };
}

/* ---------- Import Schritt 2: Analyse (Vorschau, nichts wird verändert) ----------
   Pro Bereich: neu / schon vorhanden (Titel+Jahr-Match gegen die Mediathek).
   Artikel: vorhanden = gleicher Titel + gleicher Autor. */
export function analysierePaket(paket, master, artikelListe) {
  const analyse = { autor: paket.autor, erstellt: paket.erstellt || null, quelle: paket.quelle || "unbekannt", bereiche: [] };
  for (const b of BEREICHE) {
    const roh = paket.bereiche[b];
    if (!Array.isArray(roh) || !roh.length) continue;
    if (b === "artikel") {
      const key = (t, a) => norm(t) + "|" + norm(a || "");
      const eigene = new Set((artikelListe || []).map((a) => key(a.titel, a.autor)));
      const eintraege = roh.map((a) => ({
        eintrag: a,
        status: eigene.has(key(a.titel, a.autor || paket.autor)) ? "vorhanden" : "neu",
        anzeige: (a.titel || "ohne Titel") + " — " + (a.autor || paket.autor) + " (" + (a.liste || []).length + " Referenzen)",
      }));
      analyse.bereiche.push({ name: b, eintraege, neu: eintraege.filter((e) => e.status === "neu").length, vorhanden: eintraege.filter((e) => e.status === "vorhanden").length });
    } else {
      const eintraege = roh
        .filter((f) => f && f.titel && TYP_GRUPPEN[b].includes(f.typ || "film"))
        .map((f) => {
          const treffer = matchFilm(f.titel, f.jahr ?? null, master || []);
          return {
            eintrag: f,
            status: treffer ? "vorhanden" : "neu",
            trefferId: treffer ? treffer.id : null,
            anzeige: f.titel + (f.jahr ? " (" + f.jahr + ")" : "") + (f.bewertet_von && f.bewertet_von !== paket.autor ? " · bewertet von " + f.bewertet_von : ""),
          };
        });
      if (eintraege.length) analyse.bereiche.push({ name: b, eintraege, neu: eintraege.filter((e) => e.status === "neu").length, vorhanden: eintraege.filter((e) => e.status === "vorhanden").length });
    }
  }
  return analyse;
}

/* ---------- Import Schritt 3: Übernahme bauen ----------
   Liefert {neueFilme, neueArtikel, report} — die App persistiert selbst
   (ein Bulk-Write, keine Einzel-Races). Eigenes wird nie überschrieben. */
export function bauePaketUebernahme(analyse, gewaehlteBereiche, master, artikelListe) {
  const report = { uebernommen: {}, uebersprungen: {}, rotlinks: 0, verlinkt: 0 };
  const neueFilme = [];
  const vergebeneIds = new Set((master || []).map((f) => f.id));
  const neueArtikel = [];

  for (const bereich of analyse.bereiche) {
    if (!gewaehlteBereiche.includes(bereich.name)) continue;
    let uebernommen = 0, uebersprungen = 0;

    if (bereich.name === "artikel") {
      for (const { eintrag, status } of bereich.eintraege) {
        if (status === "vorhanden") { uebersprungen++; continue; }
        const roh = {
          titel: eintrag.titel || "Ohne Titel",
          autor: eintrag.autor || analyse.autor,
          text: eintrag.text || "",
          geordnet: !!eintrag.geordnet,
          liste: (eintrag.liste || []).slice(0, 15).map((le) => ({ eingabe: le.eingabe || "", jahr: le.jahr ?? null, typ: le.typ || "film", ref: null })),
          status: "wartet", // Importiertes durchläuft denselben Freigabe-Flow wie Eigenes
          erstellt_am: eintrag.erstellt_am || new Date().toISOString(),
          importiert_am: new Date().toISOString(),
        };
        const id = neueArtikelId(roh.titel, [...(artikelListe || []), ...neueArtikel]);
        // Referenzen gegen die EIGENE Mediathek (inkl. gerade übernommener Filme)
        const abg = gleicheArtikelAb({ ...roh, id }, [...(master || []), ...neueFilme]);
        report.verlinkt += abg.abgleichStat.verlinkt;
        report.rotlinks += abg.abgleichStat.rotlink + abg.abgleichStat.mehrfach;
        neueArtikel.push({ ...abg, liste: abg.liste.map(({ abgleich, ...rest }) => rest), abgleichStat: undefined });
        uebernommen++;
      }
    } else {
      for (const { eintrag, status } of bereich.eintraege) {
        if (status === "vorhanden") { uebersprungen++; continue; } // Eigenes gewinnt immer
        let id = slugId(eintrag.titel, eintrag.jahr ?? null);
        while (vergebeneIds.has(id)) id += "_x"; // Kollision (gleicher Slug, anderer Eintrag)
        vergebeneIds.add(id);
        // Quelle: bei KI-Ingestion (deine eigene Liste) nutzt den LLM-Wert, validiert
        // gegen die Quellen-Liste; Unbekanntes/"unklar" -> markieren (später gesammelt
        // klären). Fremde Pakete behaupten nie Besitz -> "import".
        let quelleWert = "import";
        let quelleUnklar = false;
        if (analyse.quelle === "ki-ingestion" && hatDreieck(eintrag.typ)) {
          const gueltig = (eintrag.quelle ? quelleZuArray(eintrag.quelle) : []).filter((k) => QUELLE_KEYS.has(k));
          if (eintrag.quelle && eintrag.quelle !== "unklar" && gueltig.length) quelleWert = gueltig.join("+");
          else { quelleWert = "unklar"; quelleUnklar = true; } // neutral: sichtbar in „alle", nicht Wunschliste
        } else if (!hatDreieck(eintrag.typ)) { quelleWert = undefined; }
        neueFilme.push({
          id,
          titel: eintrag.titel,
          originaltitel: eintrag.originaltitel || eintrag.titel,
          jahr: eintrag.jahr ?? null, jahr_bis: eintrag.jahr_bis ?? null,
          typ: eintrag.typ || "film",
          quelle: quelleWert,
          quelle_unklar: quelleUnklar || undefined,
          /* Fehlende Bewertung bei Dreieck-Typen bleibt null (= unbewertet) —
             vorher wurde sie still zu {0,0,0} gemünzt und sah wie eine echte
             Nullwertung aus. Kategorie folgt: ohne Bewertung keine erfundene. */
          kategorie: hatDreieck(eintrag.typ) && !eintrag.bewertung ? (eintrag.kategorie || null) : (eintrag.kategorie || "sehenswert"),
          bewertet_von: hatDreieck(eintrag.typ) && !eintrag.bewertung ? null : (eintrag.bewertet_von || analyse.autor), // Das Autoren-Feld wird scharf
          bewertung: hatDreieck(eintrag.typ) ? (eintrag.bewertung ?? null) : null,
          genre: Array.isArray(eintrag.genre) ? eintrag.genre : [],
          tags: Array.isArray(eintrag.tags) ? eintrag.tags : [],
          begruendung: eintrag.begruendung || "",
          beschreibung: eintrag.beschreibung || undefined,
          art: eintrag.art || undefined,
          film_at_id: eintrag.film_at_id ?? null,
          notiz: "", // Notizen sind privat — Pakete transportieren sie nicht
          status: "gesetzt",
          import_von: analyse.autor,
          import_am: new Date().toISOString().slice(0, 10),
        });
        uebernommen++;
      }
    }
    report.uebernommen[bereich.name] = uebernommen;
    report.uebersprungen[bereich.name] = uebersprungen;
  }
  return { neueFilme, neueArtikel, report };
}

/* ---------- Ingestion-Prompt (tokensparend, Autor wird eingesetzt) ----------
   Für eine fremde KI: Titel entgegennehmen, Jahr+Genre per Websuche
   verifizieren, den Nutzer einige Titel selbst bewerten lassen, für den
   Rest grobe personalisierte Reviews schätzen, EIN JSON im Paketformat. */
export function ingestionPrompt(autor) {
  const a = (autor || "").trim() || "unbekannt";
  const phys = QUELLEN.filter((q) => q.art === "physisch").map((q) => q.key).join(", ");
  const virt = QUELLEN.filter((q) => q.art === "virtuell").map((q) => q.key).join(", ");
  return `Du erstellst eine Import-Datei für meine private Film-App "Kinodreieck". Antworte knapp, keine Erklärtexte.

ABLAUF
1) Ich gebe dir Titel (roh, unsortiert, auch Serien/Musik/Sonstiges).
2) Recherchiere per Websuche pro Titel: Jahr (Erstveröffentlichung) und 1-3 Genres. typ: film|serie|musik|sonstiges (im Zweifel film). Unsicheres Jahr: "jahr_unsicher":true. Erfinde nichts.
   Für Filme/Serien zusätzlich "quelle": wo der Titel typischerweise verfügbar ist — ein oder mehrere Keys mit "+" verbunden. Physisch: ${phys}. Virtuell (Abos/Shops): ${virt}. Weißt du es nicht oder unsicher: "quelle":"unklar" (kläre ich dann selbst).
3) Bitte mich dann, 5-10 Titel selbst zu bewerten. Mein Format je Titel: WIE x/5 (Handwerk) · WAS x/5 (Substanz) · WARUM x/5 (persönlicher Zünder) · Kategorie aus [immer_gut, kult, kult_klassiker, daemlich_aber_herrlich, trash, sehenswert, echter_schrott] · 1-2 Sätze Begründung.
4) Leite daraus meinen Geschmack ab und schreibe für die RESTLICHEN Titel: geschätzte Bewertung, Kategorie, 1-2 Sätze "begruendung" in meinem Ton. Markiere Geschätztes mit "geschaetzt":true.
5) Gib am Ende GENAU EINEN JSON-Codeblock aus:

{"format":"kinodreieck-paket","version":1,"autor":"${a}","quelle":"ki-ingestion","bereiche":{"filme":[{"titel":"","jahr":2000,"typ":"film","quelle":"unklar","kategorie":"sehenswert","bewertung":{"wie":0,"was":0,"warum":0},"genre":[],"tags":[],"begruendung":"","geschaetzt":true}],"serien":[],"musik":[],"sonstiges":[]}}

REGELN: jahr ist Pflicht. musik/sonstiges ohne "bewertung" (null). Titel in den Bereich passend zum typ. Keine weiteren Felder, kein Text außerhalb des Codeblocks.`;
}

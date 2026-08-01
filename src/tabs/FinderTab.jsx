import { useState, useEffect } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import {
  parseAnfrage, sucheFinder, sucheEntdecken, sucheKino, ohneStimmung, filmHerkunft,
  jahrGrenzen, sigAusSchema, bekannteWerte, alleStimmungen,
} from "../lib/finder.js";
import { aiService } from "../services/ai.js";
import { errorText } from "../services/errors.js";
import { schlagseiten } from "../lib/match.js";
import { kiAn } from "../lib/kiSchalter.js";
import { sichtbareDienste } from "../lib/dienste.js";
import { AxisChips, KategorieTag, Chip, Dreieck } from "../components/ui.jsx";
import { FilmForm } from "../components/EintragForm.jsx";
import { appHilfeAntwort } from "../lib/appHilfe.js";

/* Sperre gegen zwei gleichzeitige, bezahlte KI-Deutungen. Bewusst im
   Modul-Scope: der Finder-Tab wird beim Wechseln auf einen anderen Tab
   abgebaut, und React-State geht dabei mit. Der laufende fetch aber nicht — er
   schreibt beim Zurueckkommen ganz normal in den Verlauf (der liegt in App).
   Eine Sperre, die den Abbau nicht ueberlebt, ist keine.

   Dazu ein Abonnenten-Satz. Der Modul-Wert allein reichte nicht: loest der
   Aufruf auf, WAEHREND die Komponente abgebaut ist, laeuft das `setState` des
   `finally` in die abgebaute Instanz. Die Modulvariable wurde geleert, die neu
   aufgebaute Instanz liest sie aber nur EINMAL beim Aufbau — und blieb mit
   einem gesperrten Knopf zurueck, obwohl nichts mehr laeuft. Wer sich
   eintraegt, wird bei jeder Aenderung nachgezogen. */
let laufendeDeutung = null;
const sperrAbonnenten = new Set();
function setzeLaufendeDeutung(wert) {
  laufendeDeutung = wert;
  for (const melde of sperrAbonnenten) melde(wert);
}

/* Stabile Kennung je Verlaufseintrag. Der Index taugt dafuer nicht: er
   verschiebt sich, sobald der Verlauf geleert wird oder ein Eintrag dazukommt.
   Eine bezahlte Deutung, die nach so einer Verschiebung zurueckkommt, hat sich
   sonst an den falschen Eintrag geheftet — samt dessen offenen Woertern. */
let verlaufZaehler = 0;
const neueEintragId = () => "vl" + (++verlaufZaehler);

export function kinoGenresAusMatches(kinoMatches) {
  const genres = new Set();
  for (const pf of (kinoMatches && kinoMatches.rest) || []) for (const genre of pf.g || []) genres.add(genre);
  for (const match of (kinoMatches && kinoMatches.matched) || []) for (const genre of (match.prog.g || [])) genres.add(genre);
  return [...genres];
}

/* Eine globale Anfrage durchsucht immer alle lokalen Datenquellen. Der
   bevorzugte Bereich ist nur Anzeige-Priorität; er darf Treffer aus einem
   anderen Bereich nie wieder abschneiden. Damit bleibt die Suche auch bei
   ausgeschalteter KI vollständig deterministisch. */
export function erstelleFinderAntwort({
  text, sig: vorhandeneSignale = null, bevorzugterBereich = "alles",
  master = [], kinoMatches, streamingBekannt, streamingEntdecken,
  artikel = [],
}) {
  const frage = String(text || "").trim();
  const sig = vorhandeneSignale || parseAnfrage(frage, master, kinoGenresAusMatches(kinoMatches));
  const nq = frage.toLocaleLowerCase("de-AT");
  const artikelTreffer = nq
    ? (artikel || []).filter((eintrag) => [
      eintrag.titel, eintrag.text,
      ...(eintrag.liste || []).flatMap((zeile) => [zeile.eingabe, zeile.notiz]),
    ].some((wert) => String(wert || "").toLocaleLowerCase("de-AT").includes(nq))).slice(0, 10)
    : [];
  return {
    sig,
    scope: bevorzugterBereich || "alles",
    hilfe: appHilfeAntwort(frage),
    treffer: sucheFinder(sig, { master: master || [], kinoMatches, streamingBekannt }),
    entdecken: sucheEntdecken(sig, streamingEntdecken),
    kino: sucheKino(sig, (kinoMatches && kinoMatches.rest) || []),
    artikel: artikelTreffer,
  };
}

const BEREICH_LABEL = Object.freeze({
  mediathek: "Mediathek", kino: "Kino", streaming: "Streaming", blog: "Blog", daten: "App-Hilfe",
});

export function kompakteFinderTreffer(antwort, bevorzugterBereich = "alles", limit = 5) {
  const gruppen = { mediathek: [], kino: [], streaming: [], blog: [], daten: [] };
  if (antwort?.hilfe) {
    gruppen.daten.push({
      key: "hilfe:" + (antwort.hilfe.ziel || antwort.hilfe.titel), typ: "hilfe",
      ziel: antwort.hilfe.ziel, titel: antwort.hilfe.titel, meta: antwort.hilfe.text,
    });
  }
  for (const treffer of antwort?.treffer || []) {
    const film = treffer.film;
    const quellen = new Set(antwort?.sig?.quellen || []);
    const hatKino = !!treffer.herkunft?.kino;
    const hatStreaming = !!treffer.herkunft?.streaming;
    /* Ein Seitenkontext ist nur Priorität. Gibt es dort keine Herkunft, folgt
       das Ziel der tatsächlichen Verfügbarkeit beziehungsweise einer explizit
       genannten Quelle. So öffnet ein Kinofilm aus einer Streaming-Anfrage nicht
       fälschlich seine Mediathek-Karte. */
    const bereich = quellen.has("kino") && hatKino ? "kino"
      : quellen.has("streaming") && hatStreaming ? "streaming"
        : bevorzugterBereich === "kino" && hatKino ? "kino"
          : bevorzugterBereich === "streaming" && hatStreaming ? "streaming"
            : hatKino ? "kino"
              : hatStreaming ? "streaming"
                : "mediathek";
    gruppen[bereich].push({
      key: `film:${bereich}:${film.id}`, typ: "film", ref: film.id, titel: film.titel,
      meta: [film.jahr, film.typ && film.typ !== "film" ? film.typ : null].filter(Boolean).join(" · "),
    });
  }
  for (const treffer of antwort?.kino || []) gruppen.kino.push({
    key: "kino:" + (treffer.pf.film_at_id || treffer.pf.t), typ: "kino",
    ref: treffer.pf.film_at_id || treffer.pf.t, titel: treffer.pf.t,
    meta: [treffer.pf.j, ...(treffer.pf.k || []).slice(0, 2)].filter(Boolean).join(" · "),
  });
  for (const titel of antwort?.entdecken || []) gruppen.streaming.push({
    key: "streaming:" + (titel.watchmode_id || `${titel.titel}:${titel.jahr || ""}`), typ: "streaming",
    ref: titel.watchmode_id || `${titel.titel}:${titel.jahr || ""}`, titel: titel.titel,
    meta: [titel.jahr, ...(titel.dienste || []).slice(0, 2)].filter(Boolean).join(" · "),
  });
  for (const artikel of antwort?.artikel || []) gruppen.blog.push({
    key: "blog:" + artikel.id, typ: "blog", ref: artikel.id, titel: artikel.titel, meta: "Blogbeitrag",
  });

  const standard = ["mediathek", "kino", "streaming", "blog", "daten"];
  const reihenfolge = standard.includes(bevorzugterBereich)
    ? [bevorzugterBereich, ...standard.filter((bereich) => bereich !== bevorzugterBereich)]
    : standard;
  const alle = reihenfolge.flatMap((bereich) => gruppen[bereich].map((item) => ({
    ...item, bereich, bereichLabel: BEREICH_LABEL[bereich],
  })));
  return { items: alle.slice(0, limit), gesamt: alle.length };
}

/* ================= FINDER =================
   Deterministischer Film-Chat: kein LLM, keine API. Der Parser liest
   Signale aus dem Text (Vokabular-Datenmodul), das Ranking ist
   Dreieck-Score + transparente Boosts. Erkannte Signale sind sichtbar
   und per Chip abwählbar. Entdecken (ungeprüft) nur auf explizite
   Anfrage ("was Neues", "kenn ich nicht").
   Phase 4a: Fragt man nach EINEM Titel -> volle Meta-Karte (samt Bewertung);
   bei Mehrfachtreffer -> Rückfrage-Liste, deren Klick den Titel absendet. */

const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, get color() { return T.rauch; } }; // Getter: Theme-Wechsel

/* Statischer Meta-Chip (nicht klickbar) für die Detailansicht. */
function MetaChip({ children, color }) {
  return (
    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: color || T.rauch, border: "1px solid " + (color || T.rauch), borderRadius: 3, padding: "2px 7px" }}>
      {children}
    </span>
  );
}

/* Chips in vier Klassen, damit „nur diese" und „lieber diese" unterscheidbar
   bleiben (Entscheidung E-2/E-16):
     hart        schränkt die Treffermenge ein
     weich       sortiert nur um
     ausschluss  wirft heraus bzw. wertet ab
     info        wirkt nicht, wird aber ehrlich benannt
   Jede Jahresgrenze ist EINZELN abwählbar — auch die, die aus einer Stimmung
   abgeleitet ist. Vorher war sie ein nicht klickbarer Hinweis, obwohl das
   Abnahmekriterium „Filter sind sichtbar und änderbar" verlangt. */
function SignalChips({ sig, onToggle, versteckeTitel, stumm }) {
  const explizitMax = sig.jahrExplizitMax != null;
  const explizitMin = sig.jahrExplizitMin != null;
  const chips = [
    // Bei Mehrfach-Titel (Disambiguierung) sind die Titel-Chips redundant zur Liste -> aus.
    ...(versteckeTitel ? [] : (sig.titel || []).map((t) => ["titel", t.id, "Titel: " + t.label, "hart"])),
    ...sig.genres.map((g) => ["genres", g, "Genre: " + g, "hart"]),
    ...sig.kategorien.map((k) => ["kategorien", k, k.replace(/_/g, " "), "hart"]),
    ...sig.dekaden.map((d) => ["dekaden", d, d + "er", "hart"]),
    ...sig.quellen.map((q) => ["quellen", q, "Quelle: " + q, "hart"]),
    ...sig.zeit.map((z) => ["zeit", z, z, "hart"]),
    ...(sig.jahrMax ? [[explizitMax ? "jahrExplizitMax" : "jahrStimmungMax", null, "bis " + sig.jahrMax, "hart"]] : []),
    ...(sig.jahrMin ? [[explizitMin ? "jahrExplizitMin" : "jahrStimmungMin", null, "ab " + sig.jahrMin, "hart"]] : []),
    ...sig.stimmungen.map((s) => ["stimmungen", s, "Stimmung: " + s, "weich"]),
    ...sig.achsen.map((a) => ["achsen", a, a.toUpperCase() + "-lastig", "weich"]),
    /* "hart", nicht "weich": ein Reihen-Signal schränkt die Treffer ein
       (`sucheFinder`: `if (!istTitelTreffer && !treff.length) continue`). Der
       Chip hat "sortiert nur um" behauptet und damit das Gegenteil von dem
       gesagt, was er tut. Auf der Schema-Seite ist `reihen` deshalb am 26.07.
       von `weiche_wuensche` nach `harte_filter` gewandert. */
    ...(sig.reihen || []).map((r) => ["reihen", r.name, (r.typ === "regie" ? "Regie: " : r.typ === "franchise" ? "Franchise: " : "Reihe: ") + r.name, "hart"]),
    ...(sig.genresAusschluss || []).map((g) => ["genresAusschluss", g, "ohne " + g, "ausschluss"]),
    ...(sig.dekadenAusschluss || []).map((d) => ["dekadenAusschluss", d, "ohne " + d + "er", "ausschluss"]),
    ...(sig.kategorienAusschluss || []).map((k) => ["kategorienAusschluss", k, "ohne " + k.replace(/_/g, " "), "ausschluss"]),
    ...(sig.stimmungenAbschlag || []).map((s) => ["stimmungenAbschlag", s, "nicht " + s, "ausschluss"]),
    ...(sig.achsenAbschlag || []).map((a) => ["achsenAbschlag", a, "nicht " + a.toUpperCase() + "-lastig", "ausschluss"]),
    ...(sig.entdecken ? [["entdecken", true, "Entdecken (ungeprüft)", "hart"]] : []),
  ];
  /* `info` war im Kommentarkopf als vierte Klasse beschrieben, kam hier aber
     nicht vor — `farbe.info` wäre undefiniert und der Tooltip-Ternär unten hat
     ALLES, was nicht hart oder weich ist, auf „Ausschluss" abgebildet. Ein
     künftiger info-Chip wäre also farblos und falsch beschriftet gewesen.
     Heute emittiert die Liste keinen; die Klasse ist trotzdem vollständig
     definiert, damit die Falle nicht auf den Nächsten wartet. */
  const farbe = { hart: T.leinwandTief, weich: T.wolfram, ausschluss: T.warum, info: T.rauch };
  const wirkungslos = sig.jahrMax != null && explizitMax && sig.stimmungen.some((s) => (alleStimmungen()[s] || {}).jahr_max);
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {chips.length > 0 && <span style={mono}>Verstanden:</span>}
      {chips.map(([feld, wert, label, art], i) => (
        <Chip key={i} active onClick={() => onToggle(feld, wert)} title={
          art === "hart" ? "Harter Filter — schränkt die Treffer ein"
            : art === "weich" ? "Weicher Wunsch — sortiert nur um"
              : art === "ausschluss" ? "Ausschluss — wirft heraus oder wertet ab"
                : "Hinweis — wirkt nicht auf die Treffer"
        }>
          <span style={{ color: farbe[art] }}>{art === "ausschluss" ? "− " : ""}</span>{label} ×
        </Chip>
      ))}
      {(sig.negiertIgnoriert || []).length > 0 && (
        <span style={{ ...mono, color: T.wolfram }}>
          nicht filterbar: {sig.negiertIgnoriert.join(", ")}
        </span>
      )}
      {wirkungslos && (
        <span style={{ ...mono, color: T.wolfram }}>
          (Stimmungsgrenze wird von der genannten Jahresgrenze überstimmt)
        </span>
      )}
      {!stumm && (!chips.length || (sig.nichtZugeordnet && sig.nichtZugeordnet.length > 0)) && (
        <span style={mono}>
          {chips.length === 0 ? "Keine Signale erkannt. " : ""}
          {sig.nichtZugeordnet && sig.nichtZugeordnet.length > 0 ? "Nicht zugeordnet: " + sig.nichtZugeordnet.join(", ") : ""}
        </span>
      )}
    </span>
  );
}

/* Was die KI gedeutet hat, jenseits der Chips: ihre Zusammenfassung, die nicht
   umsetzbaren Wünsche und die Werte, die es in DIESEN Daten nicht gibt. Alle
   drei müssen sichtbar sein — ein stumm geschluckter Wunsch wäre die
   schlechteste Variante, weil der Nutzer ihn für berücksichtigt hielte. */
function KiDeutung({ ki, onMerken, merkbar }) {
  if (!ki) return null;
  return (
    <div style={{ ...mono, marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
      {ki.klartext && <span style={{ color: T.rauch }}>KI-Deutung: {ki.klartext}</span>}
      {(ki.nichtUnterstuetzt || []).length > 0 && (
        <span style={{ color: T.warum }}>
          Nicht umsetzbar: {ki.nichtUnterstuetzt.map((e) => e.wunsch + (e.grund ? " (" + e.grund + ")" : "")).join(" · ")}
        </span>
      )}
      {(ki.nichtInDaten || []).length > 0 && (
        <span style={{ color: T.warum }}>
          Nicht in deinen Daten: {ki.nichtInDaten.map((e) => e.art + " „" + e.name + "“").join(" · ")}
        </span>
      )}
      {merkbar.length > 0 && (
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: T.rauch }}>Künftig ohne KI finden:</span>
          {merkbar.map((w) => (
            <Chip key={w} onClick={() => onMerken(w)} title="Als eigene Vokabel merken — dann findet die normale Suche das Wort selbst">
              „{w}“ merken
            </Chip>
          ))}
        </span>
      )}
    </div>
  );
}

/* Kompakte Treffer-Zeile (Filter-Ergebnisliste, kein direkter Titel-Treffer). */
function TrefferZeile({ t, onSpringeZuFilm, auswahl }) {
  const f = t.film;
  const h = t.herkunft;
  return (
    <div onClick={() => onSpringeZuFilm && onSpringeZuFilm(f.id)}
      style={{ background: T.saalHoch, borderRadius: 6, padding: "10px 12px", cursor: "pointer" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.02em" }}>
          {f.titel}
        </span>
        <span style={mono}>{f.jahr}{f.typ !== "film" ? " · " + f.typ : ""}</span>
        <AxisChips bw={f.bewertung} />
        <KategorieTag k={f.kategorie} />
        <span style={{ ...mono, color: T.wolfram }}>{t.wert}</span>
      </div>
      <div style={{ marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
        {h.kino && (
          <span style={{ ...mono, color: T.wolfram }}>
            KINO {h.kino.zeiten.length ? "· " + h.kino.zeiten.join(" / ") : "· " + (h.kino.kinos || []).slice(0, 2).join(", ")}
          </span>
        )}
        {h.dvd && <span style={{ ...mono, color: T.leinwandTief }}>DVD</span>}
        {h.streaming && sichtbareDienste(h.streaming.dienste, auswahl).map((d) => (
          <span key={d} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "1px 6px" }}>{d}</span>
        ))}
        {t.gruende.length > 0 && <span style={mono}>({t.gruende.join(" · ")})</span>}
      </div>
    </div>
  );
}

/* Volle Meta-Karte für EINEN Film (Phase 4a) — "gesamte Metainfos samt Bewertung". */
function FilmDetail({ film: f, herkunft: h, onSpringeZuFilm, mustwatchIds, auswahl }) {
  /* Anzeige über schlagseiten(): geteilte Spitze nennt beide Achsen. */
  const ssListe = schlagseiten(f.bewertung);
  const ss = ssListe[0] || null;
  /* Joyn-Fix: nur Dienste der Abo-Auswahl zeigen; ist danach nichts übrig,
     entfällt der ganze STREAMING-Block (kein leeres Label). */
  const streamingDienste = h && h.streaming ? sichtbareDienste(h.streaming.dienste, auswahl) : [];
  /* Farbe nur bei EINDEUTIGER Spitze. T.wie/was/warum sind in dieser App
     Achsensprache (AxisChips, Glyph, Regler-accentColor) — ein blauer Chip
     SAGT WIE. Bei geteilter Spitze haette die Bevorzugung, die aus dem Text
     entfernt wurde, still in der Farbe weitergelebt. */
  const ssCol = ssListe.length === 1 ? { wie: T.wie, was: T.was, warum: T.warum }[ssListe[0]] : T.wolfram;
  const ot = (f.originaltitel && f.originaltitel !== f.titel)
    ? f.originaltitel
    : (h && h.kino && h.kino.ot && h.kino.ot !== f.titel ? h.kino.ot : null);
  const beschreibung = h && h.kino ? h.kino.beschreibung : null;
  const hatQuelle = h && (h.kino || h.dvd || h.streaming);
  return (
    <div style={{ background: T.saalHoch, borderRadius: 8, padding: "16px 18px", border: "1px solid " + T.rauch }}>
      {/* Kopf: Signatur-Dreieck + Titel/OT/Jahr */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Dreieck bw={f.bewertung} size={52} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 24, textTransform: "uppercase", letterSpacing: "0.02em", lineHeight: 1.1 }}>
            {f.titel}
          </div>
          <div style={{ ...mono, marginTop: 3 }}>
            {ot ? ot + " · " : ""}{f.jahr || "Jahr unbekannt"}{f.jahr_bis ? "–" + f.jahr_bis : ""}{f.typ && f.typ !== "film" ? " · " + f.typ : ""}
          </div>
        </div>
      </div>
      {/* Bewertung: Achsen + Kategorie + Schlagseite + Wunschliste */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <AxisChips bw={f.bewertung} />
        <KategorieTag k={f.kategorie} />
        {ss && <MetaChip color={ssCol}>{ssListe.map((a) => a.toUpperCase()).join("/")}-lastig</MetaChip>}
        {/* Must-Watch kommt aus der LISTE (kd:mustwatch), nicht mehr aus dem Flag. */}
        {mustwatchIds && mustwatchIds.has(f.id) && <MetaChip color={T.warum}>★ Must-Watch</MetaChip>}
      </div>
      {/* Genres + Tags */}
      {((f.genre || []).length > 0 || (f.tags || []).length > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {(f.genre || []).map((g) => <MetaChip key={"g" + g} color={T.leinwandTief}>{g}</MetaChip>)}
          {(f.tags || []).map((t) => <MetaChip key={"t" + t}>#{t}</MetaChip>)}
        </div>
      )}
      {/* Reihe / Franchise / Regie (Wikidata-Sidecar, Phase 4b) */}
      {((f.reihe || []).length > 0 || (f.franchise || []).length > 0 || (f.regie || []).length > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {(f.reihe || []).map((r) => <MetaChip key={"r" + r} color={T.wie}>Reihe: {r}</MetaChip>)}
          {(f.franchise || []).map((r) => <MetaChip key={"fr" + r} color={T.was}>Franchise: {r}</MetaChip>)}
          {(f.regie || []).map((r) => <MetaChip key={"rg" + r} color={T.warum}>Regie: {r}</MetaChip>)}
        </div>
      )}
      {/* Begründung (Max' "Warum"-Text) */}
      {f.begruendung && <p style={{ fontSize: 14, lineHeight: 1.55, color: T.leinwand, margin: "12px 0 0" }}>{f.begruendung}</p>}
      {/* film.at-Beschreibung (nur wenn aktuell im Kino) */}
      {beschreibung && <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, lineHeight: 1.55, color: T.wolfram, margin: "8px 0 0" }}>{beschreibung}</p>}
      {/* Notiz */}
      {f.notiz && <p style={{ ...mono, margin: "8px 0 0" }}>Notiz: {f.notiz}</p>}
      {/* Wo läuft / liegt es */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {h && h.kino && (
          <div style={{ ...mono, color: T.wolfram }}>
            <strong style={{ color: T.leinwand }}>KINO</strong>{" · "}{(h.kino.kinos || []).join(", ")}
            {h.kino.zeitenAlle && h.kino.zeitenAlle.length > 0 && (
              <div style={{ marginTop: 3 }}>{h.kino.zeitenAlle.map((z, i) => <div key={i}>· {z}</div>)}</div>
            )}
          </div>
        )}
        {h && h.dvd && <div style={{ ...mono, color: T.leinwandTief }}><strong>DVD</strong> · in deiner Sammlung</div>}
        {streamingDienste.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <strong style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.leinwand }}>STREAMING</strong>
            {streamingDienste.map((d) => (
              <span key={d} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "1px 6px" }}>{d}</span>
            ))}
          </div>
        )}
        {!hatQuelle && <div style={mono}>Aktuell keine Kino-, DVD- oder Streaming-Quelle bekannt.</div>}
      </div>
      {onSpringeZuFilm && (
        <button onClick={() => onSpringeZuFilm(f.id)} style={{ ...btnStyle(false), marginTop: 14 }}>Zum Eintrag →</button>
      )}
    </div>
  );
}

/* Rückfrage bei Mehrfachtreffer (Phase 4a): klickbare Titel-Liste;
   Klick setzt den Titel in die Eingabe und schickt ihn ab. */
function DisambigListe({ sig, master, onWaehle }) {
  const byId = new Map((master || []).map((f) => [f.id, f]));
  const filme = (sig.titel || []).map((t) => byId.get(t.id)).filter(Boolean);
  return (
    <div>
      <div style={{ ...mono, marginBottom: 6 }}>Mehrere Treffer — welchen meinst du?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filme.map((f) => (
          <button key={f.id} onClick={() => onWaehle(f)}
            style={{ textAlign: "left", background: T.saalHoch, border: "1px solid " + T.rauch, borderRadius: 6, padding: "8px 12px", cursor: "pointer", display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, textTransform: "uppercase", color: T.leinwand }}>{f.titel}</span>
            <span style={mono}>{f.jahr || "?"}{f.originaltitel && f.originaltitel !== f.titel ? " · " + f.originaltitel : ""}{f.typ && f.typ !== "film" ? " · " + f.typ : ""}</span>
            <KategorieTag k={f.kategorie} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function FinderTab({
  master, kinoMatches, streamingBekannt, streamingEntdecken, mustwatchIds,
  auswahl = [], onSpringeZuFilm, addFilm, addFilmMitPrognose,
  vorbewertungAktiv = false, prognoseSperrgrund = null,
  verlauf, setVerlauf, eingabe, setEingabe,
  vokabular = [], saveVokabular,
  suchauftrag = null, onSuchauftragVerbraucht,
  scopeArtikel = [], onArtikelKlick, onNavigiere,
}) {
  const [formFuer, setFormFuer] = useState(null); // id der Karte mit offener "Eintrag erstellen"-Maske
  /* Index des Verlaufseintrags, der gerade gedeutet wird. Der Wahrheitswert
     liegt im Modul (laufendeDeutung), NICHT hier: dieser Tab wird beim
     Tab-Wechsel abgebaut, und mit ihm ging die Sperre verloren. Danach liess
     sich ein zweiter Aufruf starten, waehrend der erste noch unterwegs war —
     zwei bezahlte Deutungen fuer einen Klick. Der Verlauf selbst liegt in App
     und ueberlebt den Wechsel; die Sperre muss das auch.
     Beim Neuladen der Seite ist das Modul neu und die Sperre offen — richtig,
     denn ein laufender fetch stirbt mit der Seite. */
  const [kiLaeuft, setKiLaeuftState] = useState(laufendeDeutung);
  const setKiLaeuft = (v) => setzeLaufendeDeutung(v);
  /* Beim Aufbau eintragen, beim Abbau austragen — und dabei den Modulwert noch
     einmal lesen. Loest der Aufruf zwischen Abbau und Aufbau auf, ist die
     Sperre schon offen und dieser Abgleich holt das nach. */
  useEffect(() => {
    setKiLaeuftState(laufendeDeutung);
    sperrAbonnenten.add(setKiLaeuftState);
    return () => { sperrAbonnenten.delete(setKiLaeuftState); };
  }, []);
  const [loeschenGefragt, setLoeschenGefragt] = useState(false); // "Neue Suche": Rückfrage bei bezahlter Deutung
  /* Kein `kiFehler`-State mehr. Die Meldung gehoert in den Verlaufseintrag:
     dort ueberlebt sie den Tab-Wechsel, und sie kann sich konstruktionsbedingt
     nicht an den falschen Eintrag heften. Vorher hing sie an einem Index —
     eine neue Suche erbte die alte Fehlermeldung, obwohl sie nie gedeutet
     wurde, und ein Tab-Wechsel loeschte sie ersatzlos. */
  /* film.at-Genres aus dem Kinoprogramm -> Vokabular (parseAnfrage erkennt sie),
     damit z.B. "Sci-Fi im Kino" auch ohne passenden Master-Eintrag greift. */
  const suche = (sig, scope = "alles", text = "") => {
    return erstelleFinderAntwort({
      text, sig, bevorzugterBereich: scope, master, kinoMatches,
      streamingBekannt, streamingEntdecken, artikel: scopeArtikel,
    });
  };

  const fuehreFrageAus = (text, scope = "alles", suchauftragId = null) => {
    const frageText = String(text || "").trim();
    if (!frageText) return;
    const sig = parseAnfrage(frageText, master || [], kinoGenresAusMatches(kinoMatches));
    setVerlauf((v) => {
      if (suchauftragId && v.some((eintrag) => eintrag.suchauftragId === suchauftragId)) return v;
      return [...v, {
        id: neueEintragId(), frage: frageText,
        ...(suchauftragId ? { suchauftragId } : {}),
        ...suche(sig, scope, frageText),
      }];
    });
    setEingabe("");
    setLoeschenGefragt(false);
  };

  const frage = () => {
    fuehreFrageAus(eingabe, "alles");
  };

  useEffect(() => {
    if (!suchauftrag?.id) return;
    if (verlauf.some((eintrag) => eintrag.suchauftragId === suchauftrag.id)) return;
    fuehreFrageAus(suchauftrag.text, suchauftrag.scope || "alles", suchauftrag.id);
    // Der Auftrag bleibt erhalten, bis sein Verlaufseintrag wirklich gerendert
    // wurde. So kann React das Einfügen und das Leeren nicht in einem Batch
    // verschlucken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suchauftrag?.id, verlauf]);

  useEffect(() => {
    if (!suchauftrag?.id || !verlauf.some((eintrag) => eintrag.suchauftragId === suchauftrag.id)) return;
    onSuchauftragVerbraucht?.();
  }, [suchauftrag?.id, verlauf, onSuchauftragVerbraucht]);

  /* Disambiguierungs-Klick: exakt diesen Film als Titel-Frage absenden.
     sig.titel wird auf genau diese ID gepinnt (robust auch bei gleichnamigen
     Filmen), der Titel erscheint in der Eingabe. */
  const waehleTitel = (film) => {
    const sig = parseAnfrage(film.titel, master || [], kinoGenresAusMatches(kinoMatches));
    sig.titel = [{ id: film.id, label: film.titel }];
    setVerlauf((v) => [...v, { id: neueEintragId(), frage: film.titel, ...suche(sig, "alles", film.titel) }]);
    setEingabe(film.titel);
  };

  /* Signal-Chip abwählen -> letzte Antwort wird neu berechnet (korrigierbar statt raterisch) */
  const toggleSignal = (idx, feld, wert) => {
    setVerlauf((v) => v.map((e, i) => {
      if (i !== idx) return e;
      let sig = { ...e.sig };
      if (feld === "entdecken") sig.entdecken = false;
      else if (feld === "stimmungen") sig = ohneStimmung(sig, wert);
      else if (feld === "titel") sig.titel = (sig.titel || []).filter((x) => x.id !== wert);
      else if (feld === "reihen") sig.reihen = (sig.reihen || []).filter((x) => x.name !== wert);
      else if (feld === "jahrExplizitMin") sig.jahrExplizitMin = null;
      else if (feld === "jahrExplizitMax") sig.jahrExplizitMax = null;
      /* Eine aus einer Stimmung abgeleitete Grenze wird unterdrückt, nicht
         gelöscht — die Stimmung selbst bleibt als weicher Wunsch stehen (E-2). */
      else if (feld === "jahrStimmungMin") sig.jahrUnterdrueckt = { ...(sig.jahrUnterdrueckt || {}), min: true };
      else if (feld === "jahrStimmungMax") sig.jahrUnterdrueckt = { ...(sig.jahrUnterdrueckt || {}), max: true };
      /* `|| []` statt sig[feld] direkt: ein von der KI gebautes Signalobjekt
         kann ein Feld gar nicht haben, und ein Chip-Klick darf nicht abstürzen. */
      else sig[feld] = (sig[feld] || []).filter((x) => x !== wert);
      /* Wirksame Jahresgrenzen nach JEDER Änderung neu ableiten, sonst bliebe
         eine abgewählte Grenze in jahrMin/jahrMax stehen. */
      sig = { ...sig, ...jahrGrenzen(sig) };
      /* `...e` statt nur `frage`: sonst verliert der Eintrag beim ersten
         Chip-Klick die KI-Deutung samt der nicht umsetzbaren Wünsche. */
      return { ...e, ...suche(sig, e.scope || "alles", e.frage) };
    }));
  };

  /* ---- KI-Deutung (Etappe 6) ------------------------------------------------
     Angeboten wird sie nur bei unklarer Anfrage (E1): entweder blieben Wörter
     unzugeordnet, oder es wurde überhaupt kein Signal erkannt. Kein Dauerknopf,
     kein automatischer Aufruf, kein stiller Wiederholversuch — jeder Aufruf
     kostet Geld, und das soll eine bewusste Entscheidung bleiben. */
  const hatSignale = (sig) => !!((sig.titel || []).length || sig.genres.length || sig.stimmungen.length
    || sig.achsen.length || sig.kategorien.length || sig.dekaden.length || sig.quellen.length
    || sig.zeit.length || sig.jahrMin || sig.jahrMax || (sig.reihen || []).length
    || (sig.genresAusschluss || []).length || (sig.dekadenAusschluss || []).length
    || (sig.kategorienAusschluss || []).length || (sig.stimmungenAbschlag || []).length
    || (sig.achsenAbschlag || []).length || sig.entdecken);
  const istUnklar = (sig) => (sig.nichtZugeordnet || []).length > 0 || !hatSignale(sig);

  /* Fehlermeldung am Verlaufseintrag statt an einem Index im Tab-State. */
  const setzeKiFehler = (id, text) => setVerlauf((v) => v.map((x) => (x.id === id ? { ...x, kiFehler: text } : x)));

  /* Die Deutung haftet an der KENNUNG des Eintrags, nicht an seiner Position.
     Der Index verschiebt sich, sobald „Neue Suche" den Verlauf leert oder ein
     Eintrag dazukommt — und die Antwort kommt erst nach einer Netzrunde. Vorher
     landete die BEZAHLTE Deutung dann samt der offenen Wörter auf einem
     fremden Eintrag, während ein nie gedeuteter „deutet …" anzeigte. */
  const deuteMitKi = async (idx) => {
    const e = verlauf[idx];
    if (!e || laufendeDeutung !== null) return;   // ein laufender Aufruf genügt
    const id = e.id;
    /* Längengrenze hier statt am Endpunkt: der weist zu lange Sätze zwar ab,
       aber sein Code `invalid-response` liest sich als „der Server hat Müll
       geliefert" — dabei war es die Eingabe. Lieber gar nicht erst zahlen und
       ehrlich sagen, was los ist. */
    if (e.frage.length > 300) {
      setzeKiFehler(id, `Die Anfrage ist mit ${e.frage.length} Zeichen zu lang für die KI-Deutung (höchstens 300).`);
      return;
    }
    setKiLaeuft(id);
    setzeKiFehler(id, null);
    /* Die unzugeordneten Wörter VOR dem Ersetzen sichern: das gedeutete
       Signalobjekt trägt keine mehr, aber genau sie sind der Stoff für den
       Lern-Kreislauf. */
    const offeneWoerter = e.sig.nichtZugeordnet || [];
    try {
      const listen = bekannteWerte(master || [], kinoGenresAusMatches(kinoMatches));
      const antwort = await aiService.runTask("intelligent-search", { suchsatz: e.frage, listen });
      const gedeutet = sigAusSchema(antwort && antwort.data, master || [], kinoGenresAusMatches(kinoMatches));
      setVerlauf((v) => v.map((x) => (x.id === id
        ? { ...x, ...suche(gedeutet.sig, x.scope || "alles", x.frage), ki: { ...gedeutet, offeneWoerter }, kiFehler: null }
        : x)));
    } catch (fehler) {
      /* Die deterministische Antwort bleibt unangetastet. Bei Fehler, Zeitgrenze
         oder erreichtem Limit verliert der Nutzer nichts — er hat nur keine
         Deutung, und die Meldung sagt ihm ehrlich, warum. */
      setzeKiFehler(id, errorText(fehler));
    } finally {
      setKiLaeuft(null);
    }
  };

  /* Lern-Kreislauf (E15): Was die KI einmal bezahlt gedeutet hat, findet die
     normale Suche danach kostenlos — sobald das Wort als eigene Vokabel steht.
     Die Zuordnung kommt aus der Deutung selbst: erkannte Genres direkt, dazu
     Genres und Tags der erkannten Stimmungen. */
  const merkVorschlag = (sig) => {
    const genres = [...(sig.genres || [])];
    const tags = [];
    for (const s of sig.stimmungen || []) {
      const def = alleStimmungen()[s] || {};
      for (const g of def.genres || []) if (!genres.includes(g)) genres.push(g);
      for (const t of def.tags || []) if (!tags.includes(t)) tags.push(t);
    }
    return { genres, tags };
  };
  const merkbareWoerter = (e) => {
    if (!e.ki || !saveVokabular) return [];
    const { genres, tags } = merkVorschlag(e.sig);
    if (!genres.length && !tags.length) return [];   // ohne Zuordnung gibt es nichts zu lernen
    const schon = new Set((vokabular || []).map((v) => String(v.wort || "").toLowerCase()));
    return (e.ki.offeneWoerter || []).filter((w) => w.length >= 3 && !schon.has(w.toLowerCase()));
  };
  const merken = (e, wort) => {
    const { genres, tags } = merkVorschlag(e.sig);
    saveVokabular([...(vokabular || []), { wort, genres, tags }]);
  };

  /* Detailansicht für genau einen Titel-Treffer: Herkunft aus dem Treffer-Objekt
     (falls vorhanden) oder frisch berechnet. */
  const detailFuer = (e, id) => {
    const t = e.treffer.find((x) => x.film.id === id);
    const film = t ? t.film : (master || []).find((f) => f.id === id);
    if (!film) return null;
    const herkunft = t ? t.herkunft : filmHerkunft(film, { kinoMatches, streamingBekannt });
    return <FilmDetail film={film} herkunft={herkunft} onSpringeZuFilm={onSpringeZuFilm} mustwatchIds={mustwatchIds} auswahl={auswahl} />;
  };

  return (
    <section>
      <div style={{ ...mono, marginBottom: 10 }}>
        Deterministische Suche — keine KI: Titel werden direkt gefunden, erkannte Signale steuern Filter & Ranking (abwählbar per Klick).
        Beispiele: „Wo spielt es Crank?“ · „Star Wars“ · „was Stylisches aus den 80ern im Kino“ · „was Neues, das ich nicht kenne“
      </div>
      {/* Eingabe OBEN, neueste Antwort direkt darunter — kein Scroll-Springen. */}
      <div className="kd-finder-eingabe" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={eingabe} onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") frage(); }}
          placeholder="Titel, Genre, Stimmung, Jahrzehnt, Quelle …"
          style={{ ...inputStyle, flex: 1 }} />
        <button style={btnStyle(true)} onClick={frage}>Suchen</button>
        {verlauf.length > 0 && (
          /* Zweistufig, sobald eine bezahlte Deutung im Verlauf steht: der
             Knopf hat sie vorher ohne Nachfrage weggeworfen, und sie ist das
             einzige im Verlauf, was Geld gekostet hat und sich nicht kostenlos
             wiederherstellen lässt. Ohne KI-Deutung bleibt es ein Klick — für
             kostenlose Ergebnisse wäre eine Rückfrage nur im Weg. */
          <button
            style={btnStyle(loeschenGefragt)}
            onClick={() => {
              if (verlauf.some((x) => x.ki) && !loeschenGefragt) { setLoeschenGefragt(true); return; }
              setVerlauf([]); setEingabe(""); setLoeschenGefragt(false);
            }}
            title={loeschenGefragt
              ? "Nochmal klicken löscht den Verlauf samt der bezahlten KI-Deutung"
              : "Verlauf leeren, neue Suche beginnen"}
          >
            {loeschenGefragt ? "KI-Deutung mitlöschen?" : "Neue Suche"}
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
        {verlauf.map((e, idx) => ({ e, i: idx })).reverse().map(({ e, i }) => {
          const titelSig = e.sig.titel || [];
          const hatErgebnisse = !!e.hilfe || e.treffer.length > 0 || (e.entdecken && e.entdecken.length > 0)
            || (e.kino && e.kino.length > 0) || (e.artikel && e.artikel.length > 0);
          return (
            <div key={i}>
              <div style={{ background: T.leinwand, color: T.tinte, borderRadius: 6, padding: "8px 12px", fontSize: 14, marginBottom: 8, maxWidth: 560 }}>
                {e.frage}
              </div>
              {!e.hilfe && <div style={{ marginBottom: 8 }}>
                <SignalChips sig={e.sig} versteckeTitel={titelSig.length > 1} stumm={hatErgebnisse} onToggle={(feld, wert) => toggleSignal(i, feld, wert)} />
                {/* Angebot statt Automatik: erscheint nur bei unklarer Anfrage und
                    nur, solange noch keine Deutung vorliegt.
                    Etappe 7: zusaetzlich hinter dem KI-Schalter. Bei KI=aus
                    existiert der Knopf nicht -- kein Fehlertext nach dem Klick,
                    keine Erklaerung. Die deterministische Suche ist an dieser
                    Stelle laengst gelaufen; der Finder bleibt vollwertig.
                    Nebenwirkung, die eine echte Luecke schliesst: Der Knopf
                    wurde bisher auch Gaesten angeboten, obwohl `aiService` ein
                    Konto verlangt -- der Fehlschlag kam erst NACH dem Klick. */}
                {kiAn("suche") && !e.ki && istUnklar(e.sig) && (
                  <div style={{ marginTop: 6 }}>
                    <button style={btnStyle(false)} disabled={kiLaeuft !== null}
                      onClick={() => deuteMitKi(i)}
                      title="Schickt nur diesen Satz und die Liste deiner Genres und Stimmungen an die KI — nie deine Filme, nie deine Notizen">
                      {kiLaeuft === e.id ? "deutet …" : "Mit KI deuten"}
                    </button>
                    <span style={{ ...mono, marginLeft: 8 }}>
                      kostet einen Aufruf · die normale Suche bleibt erhalten
                    </span>
                  </div>
                )}
                {e.kiFehler && (
                  <div style={{ ...mono, color: T.warum, marginTop: 6 }}>
                    {e.kiFehler} Die Suche oben bleibt unverändert.
                  </div>
                )}
                <KiDeutung ki={e.ki} merkbar={merkbareWoerter(e)} onMerken={(w) => merken(e, w)} />
              </div>}
              {e.hilfe && (
                <div className="kd-apphilfe-antwort">
                  <strong>{e.hilfe.titel}</strong>
                  <p>{e.hilfe.text}</p>
                  {e.hilfe.ziel && onNavigiere && (
                    <button style={btnStyle(true)} onClick={() => onNavigiere(e.hilfe.ziel)}>
                      {e.hilfe.ziel === "daten" ? "Settings öffnen" : "Bereich öffnen"}
                    </button>
                  )}
                </div>
              )}
              {!e.hilfe && (titelSig.length === 1 ? (
                /* Genau ein Titel gemeint -> volle Meta-Karte */
                detailFuer(e, titelSig[0].id)
              ) : titelSig.length > 1 ? (
                /* Mehrere Titel -> Rückfrage-Liste */
                <DisambigListe sig={e.sig} master={master} onWaehle={waehleTitel} />
              ) : (
                /* Filter-Frage -> gerankte Trefferliste */
                <>
                  {e.treffer.length === 0 && !hatErgebnisse && <div style={{ color: T.rauch, fontSize: 14 }}>Kein Treffer — probier einen Titel, ein Genre oder ein Jahrzehnt.</div>}
                  {e.treffer.length === 0 && hatErgebnisse && <div style={{ ...mono }}>Nichts in deiner Liste — aber:</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {e.treffer.map((t) => <TrefferZeile key={t.film.id} t={t} onSpringeZuFilm={onSpringeZuFilm} auswahl={auswahl} />)}
                  </div>
                </>
              ))}
              {!e.hilfe && e.artikel && e.artikel.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...mono, color: T.leinwandTief, marginBottom: 6 }}>Treffer im Blog:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {e.artikel.map((artikel) => (
                      <button key={artikel.id} onClick={() => onArtikelKlick?.(artikel.id)}
                        style={{ ...btnStyle(false), textAlign: "left", justifyContent: "flex-start" }}>
                        {artikel.titel}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Phase 4c: aktuelle Kinofilme (film.at), Kino zuerst — mit Eintrag-erstellen */}
              {!e.hilfe && titelSig.length <= 1 && e.kino && e.kino.length > 0 && (
                <>
                  <div style={{ ...mono, color: T.leinwandTief, margin: "12px 0 6px" }}>Läuft im Kino — noch nicht in deiner Liste:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {e.kino.map((k) => {
                      const kid = "k:" + (k.pf.film_at_id || k.pf.t);
                      return (
                        <div key={kid} style={{ background: T.saalHoch, borderRadius: 6, padding: "9px 12px" }}>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.02em" }}>{k.pf.t}</span>
                          <span style={{ ...mono, marginLeft: 8 }}>{k.pf.j || ""}</span>
                          <div style={{ ...mono, marginTop: 2 }}>
                            {(k.pf.k || []).length ? "KINO · " + (k.pf.k || []).slice(0, 3).join(", ") : ""}
                            {(k.pf.g || []).length ? "  ·  " + (k.pf.g || []).slice(0, 3).join(", ") : ""}
                          </div>
                          {addFilm && formFuer !== kid && (
                            <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", marginTop: 8 }} onClick={() => setFormFuer(kid)}>Eintrag erstellen</button>
                          )}
                          {formFuer === kid && (
                            <div style={{ marginTop: 8 }} onClick={(ev) => ev.stopPropagation()}>
                              <FilmForm startOffen initial={{
                                titel: k.pf.t, jahr: k.pf.j, quelle: "must_watch",
                                genre: (k.pf.g || []).join(", "), film_at_id: k.pf.film_at_id,
                              }}
                                onAdd={(f) => addFilm(f)}
                                onAddMitPrognose={addFilmMitPrognose}
                                prognoseAktiv={vorbewertungAktiv}
                                prognoseSperrgrund={prognoseSperrgrund}
                                onDone={() => setFormFuer(null)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {!e.hilfe && titelSig.length <= 1 && e.entdecken.length > 0 && (
                <>
                  <div style={{ ...mono, color: T.leinwandTief, margin: "12px 0 6px" }}>Zum Streamen — noch nicht in deiner Liste:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {e.entdecken.map((t) => {
                      const sid = "s:" + t.watchmode_id;
                      return (
                        <div key={sid} style={{ background: T.saalHoch, borderRadius: 6, padding: "9px 12px" }}>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.02em" }}>{t.titel}</span>
                          <span style={{ ...mono, marginLeft: 8 }}>{t.jahr || ""}</span>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            {sichtbareDienste(t.dienste, auswahl).map((d) => <span key={d} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "1px 6px" }}>{d}</span>)}
                          </div>
                          {addFilm && formFuer !== sid && (
                            <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", marginTop: 8 }} onClick={() => setFormFuer(sid)}>Eintrag erstellen</button>
                          )}
                          {formFuer === sid && (
                            <div style={{ marginTop: 8 }} onClick={(ev) => ev.stopPropagation()}>
                              <FilmForm startOffen typOptionen={t.typ === "tv_series" ? ["serie"] : ["film"]}
                                kennungenBearbeitbar={false}
                                initial={{
                                  titel: t.titel, jahr: t.jahr, quelle: "must_watch",
                                  genre: (t.genres || []).join(", "), watchmode_id: t.watchmode_id,
                                  imdb_id: t.imdb_id, tmdb_id: t.tmdb_id,
                                }}
                                onAdd={(f) => addFilm(f)}
                                onAddMitPrognose={addFilmMitPrognose}
                                prognoseAktiv={vorbewertungAktiv}
                                prognoseSperrgrund={prognoseSperrgrund}
                                onDone={() => setFormFuer(null)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

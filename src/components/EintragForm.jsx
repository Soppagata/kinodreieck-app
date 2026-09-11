import { useEffect, useMemo, useRef, useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { ALLE_TYPEN, hatDreieck, normalisiereTyp } from "../lib/typen.js";
import { quelleZuArray, arrayZuQuelle } from "../lib/quellen.js";
import { BEWERTUNGSKATEGORIEN } from "../lib/kategorien.js";
import { normalisiereFilmkennung } from "../lib/filmwissen.js";
import { lesePlausiblesJahr, plausiblerJahresbereich } from "../lib/match.js";
import { QuellenWahl } from "./QuellenWahl.jsx";
import { PrognoseBereich } from "./PrognoseBereich.jsx";
import { setzePrognoseStatus } from "../lib/prognose.js";

function prognoseIdentitaet(f) {
  return JSON.stringify([
    String(f.titel || "").trim(), String(f.originaltitel || "").trim(),
    String(f.jahr || "").trim(), f.typ, String(f.genre || "").trim(),
    String(f.imdbId || "").trim(), String(f.tmdbId || "").trim(),
    String(f.wikidataId || "").trim(),
  ]);
}

function prognosePasstZurBewertung(prognose, eintrag) {
  const vorschlag = prognose?.ergebnis;
  const bewertung = eintrag?.bewertung;
  return !!vorschlag && !!bewertung
    && vorschlag.achsen?.wie === bewertung.wie
    && vorschlag.achsen?.was === bewertung.was
    && vorschlag.achsen?.warum === bewertung.warum
    && vorschlag.kategorie_vorschlag === eintrag.kategorie
    && (vorschlag.begruendung || "") === (eintrag.begruendung || "");
}

/* ---------- Adaptive Eingabemaske ----------
   EIN Formular für alle Typen. Der Typ-Dropdown steuert die Felder:
   - Film / Serie  -> Dreieck-Bewertung (WIE/WAS/WARUM), Quelle, Genre, Begründung.
   - Musik / Sonstiges -> schlichte Maske (Art, ggf. Rolle, Beschreibung), KEIN Dreieck.
   Der Eintrag landet automatisch in der richtigen Gruppe (Zuordnung über typ).
   typOptionen kommt vom Aufrufer; der erste Eintrag ist der Default-Typ.
   Rückwärtskompatibel: nur bewertbare Typen -> reines Film-Formular wie zuvor. */
export function FilmForm({
  typOptionen: roheTypOptionen = ALLE_TYPEN,
  onAdd,
  onAddMitPrognose,
  prognoseAktiv = false,
  prognoseSperrgrund = null,
  initial = null,
  startOffen = false,
  onDone,
  autorName,
  kennungenBearbeitbar = false,
}) { // KD-030: optionaler autorName
  /* Auch ein alter Blog-Rotlink darf beim Neuanlegen keinen abgeschafften
     Typ erneut speichern. Reihenfolge erhalten, normalisierte Dubletten raus. */
  const typOptionen = [...new Set(roheTypOptionen.map(normalisiereTyp))];
  const [open, setOpen] = useState(startOffen);
  const leer = {
    titel: (initial && initial.titel) || "",
    jahr: initial && initial.jahr ? String(initial.jahr) : "",
    typ: typOptionen[0],
    // Film/Serie
    originaltitel: (initial && initial.originaltitel) || "",
    quellen: quelleZuArray(initial && initial.quelle), kategorie: "sehenswert",
    wie: 0, was: 0, warum: 0, genre: (initial && initial.genre) || "", begruendung: (initial && initial.begruendung) || "",
    imdbId: (initial && (initial.imdb_id || initial.imdbId)) || "",
    tmdbId: (initial && (initial.tmdb_id || initial.tmdbId)) || "",
    wikidataId: (initial && (initial.wikidata_id || initial.wikidataId)) || "",
    // Musik/Sonstiges
    art: "", sub: "", beschreibung: "",
  };
  const [f, setF] = useState(leer);
  const [fehler, setFehler] = useState("");
  const [speicherLauf, setSpeicherLauf] = useState(false);
  const speicherLaufRef = useRef(false);
  const [prognoseLauf, setPrognoseLauf] = useState(false);
  const prognoseLaufRef = useRef(false);
  const prognoseAnfrageRef = useRef(0);
  const gemountetRef = useRef(true);
  const [prognoseEntwurf, setPrognoseEntwurf] = useState(null);
  const [prognoseHinweis, setPrognoseHinweis] = useState(null);
  const [filmwissenEntwurf, setFilmwissenEntwurf] = useState(null);
  /* Unbewertet speichern (Besitz erfassen, Dreieck kommt später): blendet
     Kategorie + Achsen aus; gespeichert wird bewertung: null. */
  const [ohneBewertung, setOhneBewertung] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const clamp = (v) => Math.max(0, Math.min(5, Number(v) || 0));
  const bewertbar = hatDreieck(f.typ);
  const aktuellePrognoseIdentitaet = useMemo(() => prognoseIdentitaet(f), [f]);
  const prognoseIdentitaetRef = useRef(aktuellePrognoseIdentitaet);
  prognoseIdentitaetRef.current = aktuellePrognoseIdentitaet;
  const letztePrognoseIdentitaetRef = useRef(aktuellePrognoseIdentitaet);
  const artOptionen = f.typ === "musik"
    ? ["Album", "Soundtrack", "Konzert", "Single", "Sonstiges"]
    : ["Persönlichkeit", "Studio", "Videospiel", "Theaterstück", "Interview", "Buch", "Podcast", "Sonstiges"];
  const rollen = ["Regisseur:In", "Schauspieler:In", "Komponist:In", "Drehbuch:In", "Sonstige"];

  useEffect(() => {
    gemountetRef.current = true;
    return () => {
      gemountetRef.current = false;
      prognoseAnfrageRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (letztePrognoseIdentitaetRef.current !== aktuellePrognoseIdentitaet) {
      letztePrognoseIdentitaetRef.current = aktuellePrognoseIdentitaet;
      setPrognoseEntwurf(null);
      setPrognoseHinweis(null);
      setFilmwissenEntwurf(null);
    }
  }, [aktuellePrognoseIdentitaet]);

  if (!open) {
    return <button className="kd-mediathek-hinzufuegen" style={btnStyle(false)} onClick={() => setOpen(true)}>+ Eintrag hinzufügen</button>;
  }

  const baueFilmEintrag = ({ unbewertet = false } = {}) => {
    if (!f.titel.trim()) { setFehler("Titel ist Pflicht."); return; }
    if (bewertbar && !f.jahr.trim()) { setFehler("Jahr ist Pflicht (Schlüssel & Abgleich)."); return; }
    // KD-018: nicht-leeres Jahr muss ganzzahlig und medientypspezifisch
    // plausibel sein, sonst wird z.B. "abc" still zu NaN→null.
    const jahrEingabe = lesePlausiblesJahr(f.jahr, { typ: f.typ });
    if (!jahrEingabe.ok) {
      const { min, max } = plausiblerJahresbereich(f.typ);
      setFehler(`Jahr muss eine ganze Zahl zwischen ${min} und ${max} sein.`);
      return;
    }
    const externeKennungen = {
      imdb: f.imdbId ? normalisiereFilmkennung("imdb", f.imdbId) : null,
      tmdb: f.tmdbId ? normalisiereFilmkennung("tmdb", f.tmdbId) : null,
      wikidata: f.wikidataId ? normalisiereFilmkennung("wikidata", f.wikidataId) : null,
    };
    if (kennungenBearbeitbar && ((f.imdbId && !externeKennungen.imdb)
        || (f.tmdbId && !externeKennungen.tmdb)
        || (f.wikidataId && !externeKennungen.wikidata))) {
      setFehler("Eine optionale Film-ID hat nicht das erwartete Format. Leere das betreffende Feld oder prüfe die ID bei IMDb, TMDB beziehungsweise Wikidata.");
      return;
    }
    return {
      titel: f.titel.trim(),
      originaltitel: f.originaltitel.trim() || f.titel.trim(),
      jahr: jahrEingabe.jahr,
      jahr_bis: null,
      typ: f.typ,
      quelle: arrayZuQuelle(f.quellen),
      kategorie: unbewertet ? null : f.kategorie,
      bewertet_von: unbewertet ? null : (autorName || "max"),
      bewertung: unbewertet ? null : { wie: f.wie, was: f.was, warum: f.warum },
      genre: f.genre.split(",").map((g) => g.trim()).filter(Boolean),
      tags: [],
      begruendung: unbewertet ? "" : f.begruendung.trim(),
      notiz: (initial && initial.notiz) || "",
      status: "gesetzt",
      ...(initial?.film_at_id ? { film_at_id: initial.film_at_id } : {}),
      ...(initial?.watchmode_id ? { watchmode_id: initial.watchmode_id } : {}),
      ...(externeKennungen.imdb ? { imdb_id: externeKennungen.imdb } : {}),
      ...(externeKennungen.tmdb ? { tmdb_id: externeKennungen.tmdb } : {}),
      ...(externeKennungen.wikidata ? { wikidata_id: externeKennungen.wikidata } : {}),
    };
  };

  const startePrognoseEntwurf = async () => {
    if (prognoseLaufRef.current || speicherLaufRef.current || !onAddMitPrognose) return;
    const kandidat = baueFilmEintrag({ unbewertet: true });
    if (!kandidat) return;
    if (prognoseEntwurf && !window.confirm("Die angezeigte KI-Bewertung neu berechnen?")) return;
    const startIdentitaet = prognoseIdentitaetRef.current;
    const anfrage = ++prognoseAnfrageRef.current;
    setFehler("");
    setPrognoseHinweis(null);
    prognoseLaufRef.current = true;
    setPrognoseLauf(true);
    let ergebnis;
    try {
      ergebnis = await onAddMitPrognose(kandidat);
    } catch (error) {
      ergebnis = { status: "fehler", fehler: error?.message || "KI-Bewertung konnte nicht erstellt werden." };
    }
    prognoseLaufRef.current = false;
    if (gemountetRef.current) setPrognoseLauf(false);
    if (!gemountetRef.current || prognoseAnfrageRef.current !== anfrage) return;
    if (prognoseIdentitaetRef.current !== startIdentitaet) {
      setFehler("Die Angaben wurden während der KI-Anfrage geändert. Die alte Antwort wurde verworfen; dein Entwurf bleibt erhalten.");
      return;
    }
    if (ergebnis?.status === "bereit" && ergebnis.prognose) {
      setPrognoseEntwurf(ergebnis.prognose);
      setFilmwissenEntwurf(ergebnis.filmwissen || null);
      setPrognoseHinweis(ergebnis.hinweis
        ? { art: "hinweis", text: ergebnis.hinweis }
        : null);
      return;
    }
    if (ergebnis?.status === "hinweis") {
      setPrognoseEntwurf(null);
      setFilmwissenEntwurf(ergebnis.filmwissen || null);
      setPrognoseHinweis({ art: "hinweis", text: ergebnis.text });
      return;
    }
    if (ergebnis?.status === "veraltet") {
      setFehler("Der Kontostand hat während der KI-Anfrage gewechselt. Die Antwort wurde verworfen; dein Entwurf bleibt erhalten.");
      return;
    }
    setFilmwissenEntwurf(ergebnis?.filmwissen || null);
    setFehler(ergebnis?.fehler || "KI-Bewertung konnte nicht erstellt werden. Dein Entwurf bleibt erhalten.");
  };

  const uebernehmePrognoseInFormular = () => {
    const ergebnis = prognoseEntwurf?.ergebnis;
    if (!ergebnis || [ergebnis.achsen?.wie, ergebnis.achsen?.was, ergebnis.achsen?.warum].some((wert) => wert == null)
        || !ergebnis.kategorie_vorschlag) return;
    setOhneBewertung(false);
    setF((aktuell) => ({
      ...aktuell,
      wie: ergebnis.achsen.wie,
      was: ergebnis.achsen.was,
      warum: ergebnis.achsen.warum,
      kategorie: ergebnis.kategorie_vorschlag,
      begruendung: ergebnis.begruendung || aktuell.begruendung,
    }));
  };

  const speichern = async () => {
    if (speicherLaufRef.current) return;
    const validierterFilm = baueFilmEintrag({ unbewertet: ohneBewertung });
    if (!validierterFilm) return;
    setFehler("");
    speicherLaufRef.current = true;
    setSpeicherLauf(true);
    // KD-019: Rückgabewert von onAdd/addFilm auswerten (null/false = Dublette).
    let ergebnis;
    try {
      if (bewertbar) {
        let eintrag = validierterFilm;
        if (prognoseEntwurf) {
          const zielStatus = prognosePasstZurBewertung(prognoseEntwurf, eintrag)
            ? "angenommen"
            : eintrag.bewertung ? "korrigiert" : null;
          const wechsel = zielStatus ? setzePrognoseStatus(prognoseEntwurf, zielStatus) : null;
          eintrag = { ...eintrag, prognose: wechsel?.ok ? wechsel.prognose : prognoseEntwurf };
        }
        ergebnis = await onAdd(eintrag);
      } else {
        // Musik/Sonstiges — schlichte Struktur, hart kein Dreieck.
        ergebnis = await onAdd({
          titel: f.titel.trim(),
          jahr: validierterFilm.jahr,
          typ: f.typ,
          art: f.art === "Persönlichkeit" ? ("Persönlichkeit" + (f.sub ? " · " + f.sub : "")) : (f.art || null),
          kategorie: f.art === "Persönlichkeit" ? "person" : (f.art === "Studio" ? "studio" : null),
          beschreibung: f.beschreibung.trim(),
          bewertung: { wie: null, was: null, warum: null },
          bewertet_von: null,
        });
      }
    } catch (error) {
      setFehler(error?.message || "Eintrag konnte nicht gespeichert werden.");
      return;
    } finally {
      speicherLaufRef.current = false;
      setSpeicherLauf(false);
    }
    // KD-019: nur bei Erfolg zurücksetzen/schließen; Dublette (null/false) lässt
    // das Formular offen und bewahrt die Eingabe.
    if (ergebnis === null || ergebnis === false) {
      setFehler("Eintrag existiert bereits (Titel + Jahr) — nichts gespeichert, Eingabe bleibt erhalten.");
      return;
    }
    prognoseAnfrageRef.current += 1;
    setF(leer); setOhneBewertung(false); setPrognoseEntwurf(null); setPrognoseHinweis(null); setFilmwissenEntwurf(null);
    setOpen(false); setFehler("");
    if (onDone) onDone();
  };

  return (
    <div className="kd-mediathek-neuformular" style={{ background: T.saalHoch, borderRadius: "var(--kd-radius-karte)", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Zeile 1: Titel, (Originaltitel nur bewertbar), Jahr */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Titel *" value={f.titel} onChange={set("titel")} style={{ ...inputStyle, flex: 2, minWidth: 160 }} />
        {bewertbar && <input placeholder="Originaltitel" value={f.originaltitel} onChange={set("originaltitel")} style={{ ...inputStyle, flex: 2, minWidth: 160 }} />}
        <input placeholder={bewertbar ? "Jahr *" : "Jahr"} value={f.jahr} onChange={set("jahr")}
          inputMode="numeric" aria-invalid={!!f.jahr.trim() && !lesePlausiblesJahr(f.jahr, { typ: f.typ }).ok}
          style={{ ...inputStyle, width: 80 }} />
      </div>

      {/* Zeile 2: Typ + typ-abhängige Felder */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={f.typ} onChange={set("typ")} style={{ ...inputStyle, padding: "9px 6px" }} title="Typ">
          {typOptionen.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {bewertbar ? (
          <>
            {!ohneBewertung && (
              <>
                <select value={f.kategorie} onChange={set("kategorie")} style={{ ...inputStyle, padding: "9px 6px" }}>
                  {BEWERTUNGSKATEGORIEN.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.wie }}>WIE</span>
                <input type="number" min="0" max="5" value={f.wie} onChange={(e) => setF({ ...f, wie: clamp(e.target.value) })} style={{ ...inputStyle, width: 54 }} />
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.was }}>WAS</span>
                <input type="number" min="0" max="5" value={f.was} onChange={(e) => setF({ ...f, was: clamp(e.target.value) })} style={{ ...inputStyle, width: 54 }} />
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.warum }}>WARUM</span>
                <input type="number" min="0" max="5" value={f.warum} onChange={(e) => setF({ ...f, warum: clamp(e.target.value) })} style={{ ...inputStyle, width: 54 }} />
              </>
            )}
            <input placeholder="Genres, kommagetrennt" value={f.genre} onChange={set("genre")} style={{ ...inputStyle, flex: 1, minWidth: 150 }} />
          </>
        ) : (
          <>
            <select value={f.art} onChange={set("art")} title="Kategorie" style={{ ...inputStyle, flex: 2, minWidth: 180 }}>
              <option value="">Kategorie …</option>
              {artOptionen.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            {f.art === "Persönlichkeit" && (
              <select value={f.sub} onChange={set("sub")} title="Rolle" style={{ ...inputStyle, width: "auto", minWidth: 150 }}>
                <option value="">Rolle …</option>
                {rollen.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </>
        )}
      </div>

      {/* Unbewertet-Schalter: Besitz jetzt erfassen, Dreieck später vergeben. */}
      {bewertbar && (
        <label className="kd-touch-checkbox" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.leinwandTief, cursor: "pointer" }}>
          <input type="checkbox" checked={ohneBewertung} onChange={() => setOhneBewertung(!ohneBewertung)} />
          Ohne Bewertung speichern (Eintrag bleibt „unbewertet“ — Dreieck kommt später)
        </label>
      )}

      {/* Quelle: wiederverwendbare Wahl-Komponente (Vorfilter + Combobox + Chips). */}
      {bewertbar && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>Quelle</span>
          <QuellenWahl quellen={f.quellen} onChange={(arr) => setF({ ...f, quellen: arr })} />
        </div>
      )}

      {bewertbar && kennungenBearbeitbar && (
        <details>
          <summary style={{ cursor: "pointer", color: T.tinteWeich, fontSize: 12 }}>
            Filmkennung verknüpfen (optional, für belegtes Filmwissen)
          </summary>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <input placeholder="IMDb · tt0078748" value={f.imdbId} onChange={set("imdbId")}
              style={{ ...inputStyle, flex: "1 1 150px" }} />
            <input placeholder="TMDB · 348" value={f.tmdbId} onChange={set("tmdbId")}
              style={{ ...inputStyle, flex: "1 1 120px" }} />
            <input placeholder="Wikidata · Q24962" value={f.wikidataId} onChange={set("wikidataId")}
              style={{ ...inputStyle, flex: "1 1 140px" }} />
          </div>
          <p style={{ margin: "6px 0 0", color: T.rauch, fontSize: 11 }}>
            Nur eindeutige IDs; Kinodreieck rät nie anhand von Titel und Jahr.
          </p>
        </details>
      )}

      {/* Zeile 3: Freitext (Begründung bei Film/Serie, sonst Beschreibung) */}
      {bewertbar ? (
        <textarea placeholder="Begründung (in deiner Stimme, 1–3 Sätze)" rows={2}
          value={f.begruendung} onChange={set("begruendung")} style={{ ...inputStyle, boxSizing: "border-box" }} />
      ) : (
        <textarea placeholder={f.art === "Persönlichkeit" ? "Freitext (Rolle, Werke, Notizen …)" : "Beschreibung"} rows={2}
          value={f.beschreibung} onChange={set("beschreibung")} style={{ ...inputStyle, boxSizing: "border-box" }} />
      )}

      {fehler && <div style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btnStyle(true)} disabled={speicherLauf || prognoseLauf} onClick={speichern}>{speicherLauf ? "Speichert …" : "Hinzufügen"}</button>
        {bewertbar && prognoseAktiv && onAddMitPrognose && (
          <button style={btnStyle(false)} disabled={speicherLauf || prognoseLauf || !!prognoseSperrgrund}
            title="Erstellt eine unverbindliche Vorschau; gespeichert wird erst mit Hinzufügen"
            onClick={startePrognoseEntwurf}>
            {prognoseLauf ? "KI-Bewertung wird erstellt …" : prognoseEntwurf ? "KI-Bewertung neu berechnen" : "KI-Bewertung erstellen"}
          </button>
        )}
        <button style={btnStyle(false)} disabled={speicherLauf} onClick={() => {
          prognoseAnfrageRef.current += 1;
          setOpen(false); setFehler(""); setPrognoseEntwurf(null); setPrognoseHinweis(null); setFilmwissenEntwurf(null);
          if (onDone) onDone();
        }}>Abbrechen</button>
      </div>
      {bewertbar && prognoseAktiv && onAddMitPrognose && (
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.rauch }}>
          {prognoseSperrgrund
            ? prognoseSperrgrund
            : "Die persönliche KI-Bewertung erscheint hier im Entwurf. Erst Hinzufügen speichert den Eintrag und deine geprüften Werte."}
        </span>
      )}
      {bewertbar && (prognoseLauf || prognoseEntwurf || prognoseHinweis || filmwissenEntwurf) && (
        <div className="kd-rating-prognose-entwurf" onClick={(event) => event.stopPropagation()}>
          <PrognoseBereich
            film={{
              id: "prognose-entwurf",
              titel: f.titel.trim(),
              jahr: Number(f.jahr) || null,
              typ: f.typ,
              prognose: prognoseEntwurf,
            }}
            laeuft={prognoseLauf}
            fehler={prognoseHinweis}
            erstellenMoeglich={!prognoseSperrgrund}
            sperrgrund={prognoseSperrgrund}
            onUebernehmen={prognoseEntwurf ? uebernehmePrognoseInFormular : null}
            uebernehmenLabel="Vorschlag in Eingabe übernehmen"
            onVerwerfen={prognoseEntwurf ? () => { setPrognoseEntwurf(null); setPrognoseHinweis(null); } : null}
            filmwissen={filmwissenEntwurf}
          />
        </div>
      )}
    </div>
  );
}

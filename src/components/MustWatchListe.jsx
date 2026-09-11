import { useEffect, useMemo, useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { norm } from "../lib/match.js";
import { Chip } from "./ui.jsx";
import { SelectionControl } from "./SelectionControl.jsx";
import { TitelKartenAktionen } from "./TitelKartenAktionen.jsx";
import { createEntdeckenPin, isEntdeckenPinned } from "../lib/entdeckenPins.js";
import { mitBestaetigterStringId } from "../controllers/confirmedIdController.js";
import {
  MUSTWATCH_FILTER, mustwatchJahr, mustwatchTyp, mustwatchVerfuegbarkeit, projiziereMustwatch,
} from "../lib/mustwatch.js";

/* ---------- Must-Watch: die persönliche Noch-sehen-Liste ----------
   Eigener Datentopf, KEIN Filter über die Mediathek: eigene Einträge mit
   Titel · optionalem Jahr · Film/Serie · im Besitz · Beschreibung · Notiz ·
   optionaler Verknüpfung. Verknüpfen NUR über den expliziten Picker
   (Suchfeld + Klick) — kein Auto-Matching, nie.
   Die Verfügbarkeitsanzeige ist eine reine Ableitung aus dieser expliziten
   Verknüpfung und dem gerade geladenen Kandidatenbestand (src/lib/mustwatch.js);
   es wird kein Status gespeichert. Sortierung und Filter kommen aus derselben
   reinen Projektion der Vollansicht. Die Startseite verwendet davon getrennt
   ihre tägliche lokale Auswahl passender Kandidaten.
   kommtVorIn: Blog-Backlinks (Must-Watch-Einträge sind referenzierbar). */

const ZIEL_LABEL = { master: "Mediathek", programm: "Kinoprogramm", streaming: "Streaming" };
const TYP_LABEL = { film: "Film", serie: "Serie" };
const FILTER_LABEL = { alle: "Alle", jetzt: "Jetzt verfügbar", film: "Filme", serie: "Serien" };

const monoKlein = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };

/* Jahr und Art werden im Formular und in der Karte identisch angeboten, damit
   nachträgliches Ergänzen genauso aussieht wie das Anlegen. */
function MetaFelder({ jahr, typ, onJahr, onTyp, farbeAufKarte = false }) {
  const feldStil = farbeAufKarte
    ? { ...inputStyle, background: T.leinwandTief, color: T.tinte }
    : inputStyle;
  return (
    <>
      <input value={jahr} onChange={(e) => onJahr(e.target.value)}
        className="kd-mustwatch-jahr"
        inputMode="numeric" placeholder="Jahr (optional)" aria-label="Jahr (optional)"
        style={{ ...feldStil, width: 150, minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }} />
      <select value={typ} onChange={(e) => onTyp(e.target.value)} aria-label="Art"
        className="kd-mustwatch-art"
        style={{ ...feldStil, width: 150, minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
        <option value="">Art offen lassen</option>
        <option value="film">Film</option>
        <option value="serie">Serie</option>
      </select>
    </>
  );
}

/* Ein geoeffnetes Textfeld kann laenger leben als sein Server-/Storage-Stand.
   Der Editor merkt sich deshalb die Basis seines Entwurfs und prueft sie noch
   einmal innerhalb der serialisierten Must-Watch-Schreibqueue. Ein Sync darf
   einen unberuehrten Editor aktualisieren; bei einem echten Parallelkonflikt
   entscheidet dagegen sichtbar der Mensch, welcher Text gelten soll. */
function KonfliktTextfeld({ eintrag, feld, placeholder, rows, onUpdate }) {
  const aktuell = String(eintrag?.[feld] ?? "");
  const [entwurf, setEntwurf] = useState(aktuell);
  const [basis, setBasis] = useState(aktuell);
  const [geaendert, setGeaendert] = useState(false);
  const [konflikt, setKonflikt] = useState(false);
  const [fehler, setFehler] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!geaendert) {
      setEntwurf(aktuell);
      setBasis(aktuell);
      setKonflikt(false);
      setFehler("");
    } else if (aktuell !== basis) {
      setKonflikt(true);
      setFehler("Inzwischen wurde eine neuere Version geladen. Bitte entscheide, welcher Text bleiben soll.");
    }
  }, [aktuell, basis, geaendert]);

  const bestaetigeErfolg = () => {
    setBasis(entwurf);
    setGeaendert(false);
    setKonflikt(false);
    setFehler("");
  };
  const speichere = async ({ ueberschreiben = false } = {}) => {
    if (!geaendert || speichert) return;
    if (!ueberschreiben && (konflikt || aktuell !== basis)) {
      setKonflikt(true);
      setFehler("Inzwischen wurde eine neuere Version geladen. Bitte entscheide, welcher Text bleiben soll.");
      return;
    }
    setSpeichert(true);
    let queueKonflikt = false;
    try {
      const changes = ueberschreiben
        ? { [feld]: entwurf }
        : (stand) => {
          if (String(stand?.[feld] ?? "") !== basis) {
            queueKonflikt = true;
            return null;
          }
          return { [feld]: entwurf };
        };
      const ok = await onUpdate(eintrag.id, changes);
      if (queueKonflikt) {
        setKonflikt(true);
        setFehler("Inzwischen wurde eine neuere Version gespeichert. Dein Entwurf wurde nicht automatisch darübergeschrieben.");
      } else if (ok === false) {
        setFehler("Text konnte nicht bestätigt gespeichert werden. Dein Entwurf bleibt erhalten.");
      } else {
        bestaetigeErfolg();
      }
    } catch {
      setFehler("Text konnte nicht gespeichert werden. Dein Entwurf bleibt erhalten.");
    } finally {
      setSpeichert(false);
    }
  };
  const ladeNeuereVersion = () => {
    setEntwurf(aktuell);
    setBasis(aktuell);
    setGeaendert(false);
    setKonflikt(false);
    setFehler("");
  };

  return (
    <div>
      <textarea value={entwurf} rows={rows} placeholder={placeholder}
        disabled={speichert}
        onChange={(ev) => { setEntwurf(ev.target.value); setGeaendert(true); setFehler(""); }}
        onBlur={() => { void speichere(); }}
        aria-invalid={konflikt || !!fehler}
        style={{ ...inputStyle, width: "100%", boxSizing: "border-box", background: T.leinwandTief, color: T.tinte }} />
      {fehler && <div role="alert" style={{ color: T.gefahr, fontSize: 12, marginTop: 4 }}>{fehler}</div>}
      {konflikt && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          <button type="button" style={{ ...btnStyle(false), fontSize: 11, padding: "5px 9px" }}
            onClick={ladeNeuereVersion}>Neuere Version laden</button>
          <button type="button" style={{ ...btnStyle(false), fontSize: 11, padding: "5px 9px" }}
            disabled={speichert} onClick={() => { void speichere({ ueberschreiben: true }); }}>
            Meinen Entwurf übernehmen
          </button>
        </div>
      )}
    </div>
  );
}

/* Picker: durchsucht die drei Kandidaten-Gruppen per norm-Substring; Auswahl
   ausschließlich per Klick. Max 6 Treffer pro Gruppe. */
function VerknuepfungsPicker({ kandidaten, onWaehle, onAbbrechen }) {
  const [suche, setSuche] = useState("");
  const treffer = useMemo(() => {
    const nq = norm(suche);
    if (!nq) return [];
    const gruppen = [];
    for (const [ziel, liste] of [["master", kandidaten.master], ["programm", kandidaten.programm], ["streaming", kandidaten.streaming]]) {
      const hits = (liste || []).filter((k) => k?.id != null && norm(k.titel).includes(nq)).slice(0, 6);
      if (hits.length) gruppen.push({ ziel, hits });
    }
    return gruppen;
  }, [suche, kandidaten]);
  return (
    <div style={{ background: T.saal, borderRadius: 4, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input autoFocus value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder="Titel suchen (Mediathek · Kinoprogramm · Streaming) …"
          style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        <button style={{ ...btnStyle(false), padding: "5px 10px" }} onClick={onAbbrechen}>Abbrechen</button>
      </div>
      {treffer.map((g) => (
        <div key={g.ziel}>
          <div style={{ ...monoKlein, fontSize: 10, textTransform: "uppercase", margin: "4px 0 2px" }}>{ZIEL_LABEL[g.ziel]}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {g.hits.map((k) => (
              <button key={g.ziel + k.id} style={{ ...btnStyle(false), padding: "5px 10px", textAlign: "left" }}
                onClick={() => onWaehle({ ziel: g.ziel, id: k.id }, k.titel)}>
                {k.titel}{k.jahr ? " (" + k.jahr + ")" : ""}
              </button>
            ))}
          </div>
        </div>
      ))}
      {suche.trim() && treffer.length === 0 && (
        <div style={{ ...monoKlein }}>Keine Treffer — Verknüpfung bleibt leer (kein Auto-Anlegen).</div>
      )}
    </div>
  );
}

function MustWatchForm({ onAdd, onDone, kandidaten }) {
  const [titel, setTitel] = useState("");
  const [jahr, setJahr] = useState("");
  const [typ, setTyp] = useState("");
  const [imBesitz, setImBesitz] = useState(false);
  const [beschreibung, setBeschreibung] = useState("");
  const [notiz, setNotiz] = useState("");
  const [verkn, setVerkn] = useState(null); // {ziel, id}
  const [verknTitel, setVerknTitel] = useState("");
  const [pickerOffen, setPickerOffen] = useState(false);
  const [fehler, setFehler] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const speichern = async () => {
    if (!titel.trim()) { setFehler("Titel ist Pflicht."); return; }
    setFehler(""); setSpeichert(true);
    try {
      const ok = await onAdd({
        titel: titel.trim(), jahr, typ, im_besitz: imBesitz,
        beschreibung: beschreibung.trim(), notiz: notiz.trim(), verknuepfung: verkn,
      });
      if (ok !== false && onDone) onDone();
      else setFehler("Der Eintrag wurde nicht gespeichert. Bitte erneut versuchen.");
    } catch {
      setFehler("Der Eintrag wurde nicht gespeichert. Bitte erneut versuchen.");
    } finally { setSpeichert(false); }
  };
  return (
    <div className="kd-mustwatch-form" style={{ background: T.saalHoch, borderRadius: "var(--kd-radius-karte)", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="kd-mustwatch-form-hauptfelder" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Titel *" value={titel} onChange={(e) => setTitel(e.target.value)} style={{ ...inputStyle, flex: 2, minWidth: 180 }} />
        <MetaFelder jahr={jahr} typ={typ} onJahr={setJahr} onTyp={setTyp} />
        <SelectionControl checked={imBesitz} onCheckedChange={setImBesitz}
          label="Im Besitz" className="kd-mustwatch-besitzwahl" />
      </div>
      <textarea placeholder="Beschreibung (worum geht's / warum drauf?)" rows={2} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} style={{ ...inputStyle, boxSizing: "border-box" }} />
      <textarea placeholder="Notiz (frei)" rows={1} value={notiz} onChange={(e) => setNotiz(e.target.value)} style={{ ...inputStyle, boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...monoKlein, color: T.tinteWeich }}>Verknüpfung:</span>
        {verkn
          ? <Chip active onClick={() => { setVerkn(null); setVerknTitel(""); }}>{ZIEL_LABEL[verkn.ziel]}: {verknTitel} ✕</Chip>
          : <button style={{ ...btnStyle(false), padding: "5px 10px" }} onClick={() => setPickerOffen(!pickerOffen)}>{pickerOffen ? "Picker schließen" : "… wählen (optional)"}</button>}
      </div>
      {pickerOffen && !verkn && (
        <VerknuepfungsPicker kandidaten={kandidaten}
          onWaehle={(v, t) => { setVerkn(v); setVerknTitel(t); setPickerOffen(false); }}
          onAbbrechen={() => setPickerOffen(false)} />
      )}
      {fehler && <div style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btnStyle(true)} disabled={speichert} onClick={speichern}>{speichert ? "Speichert …" : "Für später merken"}</button>
        <button style={btnStyle(false)} onClick={onDone}>Abbrechen</button>
      </div>
    </div>
  );
}

export function MustWatchListe({
  eintraege, onAdd, onUpdate, onDelete, kandidaten, kommtVorInMap, onArtikelKlick,
  onSpringeZuRef, onAddFilm, recommendationPins = [], onRecommendationPinToggle,
  pinOwnerKey = null,
}) {
  const [formOffen, setFormOffen] = useState(false);
  const [offenId, setOffenId] = useState(null);
  const [pickerFuer, setPickerFuer] = useState(null); // Eintrag-ID mit offenem Picker
  const [suche, setSuche] = useState("");
  const [filter, setFilter] = useState("alle");
  const [markierteIds, setMarkierteIds] = useState(() => new Set());
  const [nurMarkierte, setNurMarkierte] = useState(false);
  const [gesehenFrage, setGesehenFrage] = useState(null);
  const [gesehenSpeichert, setGesehenSpeichert] = useState(null);
  const [gesehenFehler, setGesehenFehler] = useState("");

  const titelZu = (v) => {
    if (!v) return "";
    const liste = kandidaten[v.ziel] || [];
    const k = liste.find((x) => String(x.id) === String(v.id));
    return k ? k.titel : v.id;
  };
  /* Reine Such-/Filterprojektion der vollständigen Must-Watch-Ansicht. */
  const projektion = useMemo(
    () => projiziereMustwatch(eintraege, { filter, suche }, kandidaten),
    [eintraege, filter, suche, kandidaten],
  );
  const sichtbar = useMemo(
    () => nurMarkierte ? projektion.filter((e) => markierteIds.has(String(e.id))) : projektion,
    [markierteIds, nurMarkierte, projektion],
  );
  const jetztAnzahl = useMemo(
    () => (eintraege || []).filter((e) => mustwatchVerfuegbarkeit(e, kandidaten)?.aktuell).length,
    [eintraege, kandidaten],
  );
  const eingeschraenkt = filter !== "alle" || !!suche.trim() || nurMarkierte;

  useEffect(() => {
    const vorhanden = new Set((eintraege || []).map((e) => String(e.id)));
    setMarkierteIds((aktuell) => {
      const sauber = new Set([...aktuell].filter((id) => vorhanden.has(id)));
      return sauber.size === aktuell.size ? aktuell : sauber;
    });
  }, [eintraege]);

  const schalteMarkierungUm = (id) => {
    const key = String(id);
    setMarkierteIds((aktuell) => {
      const next = new Set(aktuell);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* Ein bereits gesetzter oeffentlicher Pin aus der ersten Kartenwelle bleibt
     erkennbar und entfernbar. Neue Must-Watch-Pins nutzen jedoch immer die
     eigene stabile ID plus Datenkontext; Titel, Jahr und Art sind keine Identität. */
  const pinKandidatFuer = (eintrag) => {
    const lokal = pinOwnerKey
      ? { mustwatchId: eintrag.id, pinOwnerKey, titel: eintrag.titel,
        jahr: eintrag.jahr, typ: eintrag.typ }
      : null;
    if (lokal && isEntdeckenPinned(recommendationPins, lokal)) return lokal;
    const ref = eintrag?.verknuepfung;
    if (["programm", "streaming"].includes(ref?.ziel) && ref.id != null) {
      const kandidat = (kandidaten?.[ref.ziel] || [])
        .find((item) => item?.id != null && String(item.id) === String(ref.id));
      if (kandidat && ref.ziel === "streaming") {
        const extern = {
          ...kandidat,
          titel: kandidat.titel || eintrag.titel,
          jahr: kandidat.jahr ?? eintrag.jahr,
          typ: kandidat.typ ?? kandidat.type ?? eintrag.typ,
          watchmode_id: kandidat.watchmode_id ?? kandidat.id,
        };
        if (createEntdeckenPin(extern, 0) && isEntdeckenPinned(recommendationPins, extern)) return extern;
      }
      if (kandidat) {
        const extern = {
          ...kandidat,
          titel: kandidat.titel || eintrag.titel,
          jahr: kandidat.jahr ?? eintrag.jahr,
          typ: "film",
          film_at_id: kandidat.film_at_id ?? kandidat.id,
        };
        if (createEntdeckenPin(extern, 0) && isEntdeckenPinned(recommendationPins, extern)) return extern;
      }
    }
    return lokal;
  };

  const filmDatenFuer = (eintrag) => {
    const status = mustwatchVerfuegbarkeit(eintrag, kandidaten);
    const kandidat = status?.kandidat || null;
    const typ = mustwatchTyp(eintrag?.typ ?? kandidat?.typ ?? kandidat?.type);
    const jahr = mustwatchJahr(eintrag?.jahr ?? kandidat?.jahr ?? kandidat?.year);
    if (!typ || jahr == null) return null;
    return {
      titel: eintrag.titel,
      originaltitel: eintrag.originaltitel || kandidat?.originaltitel || eintrag.titel,
      jahr, jahr_bis: null, typ, quelle: "must_watch", kategorie: null,
      bewertet_von: null, bewertung: null, genre: kandidat?.genres || [], tags: [],
      begruendung: "", notiz: eintrag.notiz || "", status: "gesetzt",
      ...(kandidat?.watchmode_id != null ? { watchmode_id: kandidat.watchmode_id } : {}),
      ...(kandidat?.imdb_id ? { imdb_id: kandidat.imdb_id } : {}),
      ...(kandidat?.tmdb_id ? { tmdb_id: kandidat.tmdb_id } : {}),
    };
  };

  const entferneAlsGesehen = async (eintrag) => {
    if (gesehenSpeichert != null) return;
    setGesehenSpeichert(eintrag.id);
    setGesehenFehler("");
    try {
      if (typeof onDelete !== "function") throw new Error("delete-unavailable");
      const ok = await onDelete(eintrag.id);
      if (ok === false) throw new Error("delete-not-confirmed");
      setGesehenFrage(null);
    } catch {
      setGesehenFehler("Der Must-Watch-Eintrag konnte nicht bestätigt abgeschlossen werden.");
    } finally {
      setGesehenSpeichert(null);
    }
  };

  const uebernehmeUndSchliesseAb = async (eintrag) => {
    const daten = filmDatenFuer(eintrag);
    if (!daten || typeof onAddFilm !== "function" || gesehenSpeichert != null) return;
    setGesehenSpeichert(eintrag.id);
    setGesehenFehler("");
    let filmId = null;
    try {
      const abgeschlossen = await mitBestaetigterStringId(
        () => onAddFilm(daten),
        async (bestaetigteId) => {
          filmId = bestaetigteId;
          if (typeof onDelete !== "function") return false;
          return await onDelete(eintrag.id) !== false;
        },
      );
      if (!abgeschlossen) throw new Error(filmId ? "delete-not-confirmed" : "add-not-confirmed");
      setGesehenFrage(null);
    } catch {
      /* War die Mediathek-Anlage bereits bestätigt, aber das Entfernen aus dem
         separaten Must-Watch-Topf nicht, wird die neue starke ID ausschließlich
         bei unverändertem Eintrag explizit gebunden. Ein erneuter Klick legt
         dadurch keinen zweiten Mediathek-Eintrag an. */
      if (filmId) {
        try {
          await onUpdate?.(eintrag.id, (aktuell) => {
            const aktuelleRef = aktuell?.verknuepfung;
            const basisRef = eintrag.verknuepfung;
            const unveraendert = aktuelleRef === basisRef
              || (!!aktuelleRef && !!basisRef && aktuelleRef.ziel === basisRef.ziel
                && String(aktuelleRef.id) === String(basisRef.id));
            if (!unveraendert) return null;
            return { verknuepfung: { ziel: "master", id: filmId } };
          });
        } catch { /* Der sichtbare Restdatensatz bleibt die fail-closed Grenze. */ }
      }
      setGesehenFehler("Die Übernahme konnte nicht vollständig bestätigt werden. Der Must-Watch-Eintrag bleibt sichtbar, damit nichts verloren geht.");
    } finally {
      setGesehenSpeichert(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ ...monoKlein, fontSize: 10, color: T.wolfram, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Deine persönliche Noch-sehen-Liste
        </div>
        <p style={{ margin: 0, fontSize: 14, color: T.leinwandTief, lineHeight: 1.55, maxWidth: 620 }}>
          Filme und Serien, die du selbst noch sehen möchtest. Verknüpfst du einen Eintrag ausdrücklich
          mit Mediathek, Kinoprogramm oder Streaming, zeigt die Karte, wo er gerade zu haben ist.
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel oder Notiz durchsuchen …" style={{ ...inputStyle, flex: 1, minWidth: 170 }} />
        {!formOffen && <button style={btnStyle(true)} onClick={() => setFormOffen(true)}>+ Für später merken</button>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {MUSTWATCH_FILTER.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{FILTER_LABEL[f]}</Chip>
        ))}
        <Chip active={nurMarkierte} onClick={() => setNurMarkierte((aktiv) => !aktiv)}>
          Markiert ({markierteIds.size})
        </Chip>
      </div>
      {formOffen && <div style={{ marginBottom: 12 }}><MustWatchForm onAdd={onAdd} onDone={() => setFormOffen(false)} kandidaten={kandidaten} /></div>}
      <div style={{ ...monoKlein, marginBottom: 10 }}>
        {sichtbar.length} von {(eintraege || []).length} vorgemerkt
        {jetztAnzahl > 0 ? " · " + jetztAnzahl + " jetzt verfügbar" : ""}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sichtbar.map((e) => {
          const offen = offenId === e.id;
          const backlinks = kommtVorInMap && kommtVorInMap[e.id];
          const status = mustwatchVerfuegbarkeit(e, kandidaten);
          const typ = mustwatchTyp(e.typ);
          const meta = [e.jahr || null, typ ? TYP_LABEL[typ] : null].filter(Boolean).join(" · ");
          return (
            <div key={e.id} id={"mw-" + e.id} className="kd-karte kd-mustwatch-karte kd-titelaktionskarte" onClick={() => setOffenId(offen ? null : e.id)}
              style={{ background: T.leinwand, color: T.tinte, borderRadius: "var(--kd-radius-karte)", padding: "16px", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.45)", borderLeft: status?.aktuell ? "4px solid " + T.wolfram : "4px solid transparent" }}>
              <div className="kd-mustwatch-kartenkopf">
                <span className="kd-mustwatch-titel" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "calc(22px * var(--kd-schriftfaktor, 1))", lineHeight: 1.2, textTransform: "none", letterSpacing: 0, flex: 1, minWidth: 160, overflowWrap: "anywhere" }}>
                  {e.titel}
                </span>
                <div className="kd-mustwatch-statuszeile">
                  {/* Statusbadge NUR bei belegter aktueller Verknüpfung — ohne
                      geladenen Katalog wird nichts behauptet. */}
                  {status && (
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.08em", padding: "3px 7px", borderRadius: 3, whiteSpace: "nowrap", border: "1px solid " + (status.aktuell ? T.wolfram : T.tinteWeich), background: status.aktuell ? T.wolfram : "transparent", color: status.aktuell ? T.tinte : T.tinteWeich }}>
                      {status.label}
                    </span>
                  )}
                  <div onClick={(ev) => ev.stopPropagation()}>
                    <SelectionControl checked={!!e.im_besitz}
                      onCheckedChange={() => onUpdate(e.id, (aktuell) => ({ im_besitz: !aktuell.im_besitz }))}
                      label="Im Besitz" className="kd-mustwatch-besitzwahl kd-mustwatch-besitzwahl--karte" />
                  </div>
                </div>
              </div>
              {meta && (
                <div style={{ marginTop: 3, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>{meta}</div>
              )}
              {(e.notiz || e.beschreibung) && !offen && (
                <div style={{ marginTop: 5, fontSize: 13, color: T.tinteWeich, overflowWrap: "anywhere" }}>
                  {e.notiz || e.beschreibung}
                </div>
              )}
              {e.verknuepfung && (
                <div style={{ marginTop: 4, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>
                  ↪ {ZIEL_LABEL[e.verknuepfung.ziel] || e.verknuepfung.ziel}:{" "}
                  {["master", "programm", "streaming"].includes(e.verknuepfung.ziel) && onSpringeZuRef
                    ? <a href="#" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onSpringeZuRef(e.verknuepfung, e); }}
                        style={{ color: T.tinte, textDecorationColor: T.wolfram, textUnderlineOffset: 3 }}>{titelZu(e.verknuepfung)}</a>
                    : titelZu(e.verknuepfung)}
                </div>
              )}
              {gesehenFrage === e.id && (
                <div className="kd-entdecken-frage kd-mustwatch-frage" onClick={(ev) => ev.stopPropagation()}>
                  <strong>„{e.titel}“ als gesehen abschließen?</strong>
                  <div>
                    {e.verknuepfung?.ziel === "master"
                      ? <button style={btnStyle(true)} disabled={gesehenSpeichert != null}
                          onClick={() => void entferneAlsGesehen(e)}>Ja, Must-Watch abschließen</button>
                      : <button style={btnStyle(true)} disabled={!filmDatenFuer(e) || typeof onAddFilm !== "function" || gesehenSpeichert != null}
                          onClick={() => void uebernehmeUndSchliesseAb(e)}>In Mediathek übernehmen und abschließen</button>}
                    {e.verknuepfung?.ziel !== "master" && (
                      <button style={btnStyle(false)} disabled={gesehenSpeichert != null}
                        onClick={() => void entferneAlsGesehen(e)}>Nur Must-Watch abschließen</button>
                    )}
                    <button style={btnStyle(false)} disabled={gesehenSpeichert != null}
                      onClick={() => setGesehenFrage(null)}>Abbrechen</button>
                  </div>
                  {!filmDatenFuer(e) && e.verknuepfung?.ziel !== "master" && (
                    <small>Für die direkte Mediathek-Übernahme zuerst Jahr und Art ergänzen oder ausdrücklich verknüpfen.</small>
                  )}
                  {gesehenFehler && <div role="alert" style={{ color: T.gefahr, fontSize: 12, marginTop: 6 }}>{gesehenFehler}</div>}
                </div>
              )}
              {offen && (
                <div onClick={(ev) => ev.stopPropagation()} style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <MetaFelder farbeAufKarte
                      jahr={e.jahr == null ? "" : String(e.jahr)}
                      typ={typ || ""}
                      onJahr={(wert) => { if (wert !== (e.jahr == null ? "" : String(e.jahr))) onUpdate(e.id, { jahr: wert }); }}
                      onTyp={(wert) => onUpdate(e.id, { typ: wert })} />
                  </div>
                  <KonfliktTextfeld eintrag={e} feld="beschreibung" rows={2} placeholder="Beschreibung" onUpdate={onUpdate} />
                  <KonfliktTextfeld eintrag={e} feld="notiz" rows={1} placeholder="Notiz (frei)" onUpdate={onUpdate} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {e.verknuepfung
                      ? <button style={{ ...btnStyle(false), padding: "5px 10px", color: T.tinte, borderColor: T.tinteWeich }}
                          onClick={() => onUpdate(e.id, { verknuepfung: null })}>Verknüpfung lösen</button>
                      : <button style={{ ...btnStyle(false), padding: "5px 10px", color: T.tinte, borderColor: T.tinteWeich }}
                          onClick={() => setPickerFuer(pickerFuer === e.id ? null : e.id)}>{pickerFuer === e.id ? "Picker schließen" : "Verknüpfen …"}</button>}
                    <button style={{ ...btnStyle(false), padding: "5px 10px", borderColor: T.gefahr, color: T.gefahr }}
                      onClick={() => { if (window.confirm('"' + e.titel + '" aus der Must-Watch-Liste löschen?')) onDelete(e.id); }}>
                      Entfernen
                    </button>
                  </div>
                  {pickerFuer === e.id && !e.verknuepfung && (
                    <VerknuepfungsPicker kandidaten={kandidaten}
                      onWaehle={(v) => { onUpdate(e.id, { verknuepfung: v }); setPickerFuer(null); }}
                      onAbbrechen={() => setPickerFuer(null)} />
                  )}
                  {backlinks && backlinks.length > 0 && (
                    <div style={{ padding: "8px 10px", background: T.leinwandTief, borderRadius: 4, fontSize: 13 }}>
                      <strong>Kommt vor in:</strong>
                      {backlinks.map((a) => (
                        <div key={a.id} style={{ marginTop: 4 }}>
                          {onArtikelKlick
                            ? <a href="#" onClick={(ev) => { ev.preventDefault(); onArtikelKlick(a.id); }}
                                style={{ color: T.tinte, textDecorationColor: T.wolfram, textUnderlineOffset: 3 }}>→ {a.titel}</a>
                            : <span style={{ color: T.tinteWeich }}>→ {a.titel}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(() => {
                const pinKandidat = pinKandidatFuer(e);
                const pinAktiv = pinKandidat ? isEntdeckenPinned(recommendationPins, pinKandidat) : false;
                const markiert = markierteIds.has(String(e.id));
                const pinLabel = pinKandidat
                  ? (pinAktiv ? `${e.titel} vom Pinboard lösen` : `${e.titel} am Pinboard anpinnen`)
                  : `${e.titel}: Pin erst nach geladenem Datenkontext verfügbar`;
                return <TitelKartenAktionen
                  pinAktiv={pinAktiv} pinDisabled={!pinKandidat} pinLabel={pinLabel}
                  onPin={() => onRecommendationPinToggle?.(pinKandidat)}
                  markiert={markiert}
                  markierLabel={markiert ? `${e.titel}: Markierung entfernen` : `${e.titel}: markieren`}
                  onMarkieren={() => schalteMarkierungUm(e.id)}
                  gesehen={gesehenFrage === e.id}
                  gesehenLabel={`${e.titel} als gesehen abschließen`}
                  onGesehen={() => { setGesehenFrage(gesehenFrage === e.id ? null : e.id); setGesehenFehler(""); }} />;
              })()}
            </div>
          );
        })}
        {sichtbar.length === 0 && (
          <p style={{ color: T.rauch, fontSize: 14 }}>
            {eingeschraenkt
              ? "Keine Treffer für diese Auswahl. Setz die Suche zurück oder wähle „Alle“."
              : "Noch nichts vorgemerkt. „+ Für später merken“ — oder in den Settings die Must-Watch-Migration ausführen (übernimmt die alten Wunschlisten-Flags)."}
          </p>
        )}
      </div>
    </div>
  );
}

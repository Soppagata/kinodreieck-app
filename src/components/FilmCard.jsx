import { useRef, useState } from "react";
import { T, btnStyle, lightInput } from "../lib/tokens.js";
import { hatDreieck } from "../lib/typen.js";
import { Dreieck, AxisChips, KategorieTag, UnbewertetTag, IconDelete } from "./ui.jsx";
import { EditPanel } from "./EditPanel.jsx";
import { PrognoseBereich } from "./PrognoseBereich.jsx";
import { FilmwissenBereich } from "./FilmwissenBereich.jsx";
import { setzePrognoseStatus } from "../lib/prognose.js";

/* Einfacher Editor für Einträge ohne Dreieck (musik/sonstiges):
   Beschreibung + Notiz — die Notiz ist bei JEDEM Eintrag editierbar. */
function BeschreibungEditor({ eintrag, onSave, onCancel, speichert, fehler }) {
  const [besch, setBesch] = useState(eintrag.beschreibung || "");
  const [notiz, setNotiz] = useState(eintrag.notiz || "");
  return (
    <div className="kd-beschreibung-editor" onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, padding: 12, background: T.leinwandTief, borderRadius: 4, display: "flex", flexDirection: "column", gap: 10 }}>
      <textarea value={besch} onChange={(e) => setBesch(e.target.value)} rows={3}
        placeholder="Beschreibung" style={{ ...lightInput, width: "100%", boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif" }} />
      <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={2}
        placeholder="Notiz (Edition, Fassung, Sehstand … — frei)" style={{ ...lightInput, width: "100%", boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif" }} />
      {fehler && <div role="alert" style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={speichert} style={{ ...btnStyle(true), fontSize: 14, padding: "7px 14px" }} onClick={() => onSave({ beschreibung: besch, notiz })}>{speichert ? "Speichert …" : "Speichern"}</button>
        <button disabled={speichert} style={{ ...btnStyle(false), fontSize: 14, padding: "7px 14px", color: T.tinte, borderColor: T.tinteWeich }} onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}

/* ---------- Karte für Mediathek-Einträge ----------
   Dreieck-Typen: volle Karte (Glyph, Achsen, Kategorie, EditPanel).
   musik/sonstiges: reduzierte Karte (kein Dreieck — Modell ist auf
   Filmwirkung kalibriert), Beschreibung statt Begründung.
   kommtVorIn: Artikel-Referenzen aus dem Blog (Phase 2), Laufzeit-berechnet. */
export function FilmCard({
  film, kinoInfo, streamBadge, expanded, onToggle, onSave, onDelete, kommtVorIn, onArtikelKlick,
  vorbewertung = null, filmwissen = null,
  auswahlmodus = false, auswaehlbar = true, ausgewaehlt = false, onAuswahl = null,
}) {
  const [editing, setEditing] = useState(false);
  const [prognoseEntwurf, setPrognoseEntwurf] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const speichertRef = useRef(false);
  const [speicherFehler, setSpeicherFehler] = useState("");
  const dreieck = hatDreieck(film.typ);
  /* unbewertet = bewertung fehlt komplett (null). 0/0/0 ist eine ECHTE Bewertung. */
  const unbewertet = dreieck && film.bewertung == null;
  /* Schneller Bewerten-Einstieg: Karte aufklappen + direkt ins EditPanel. */
  const jetztBewerten = (e) => {
    e.stopPropagation();
    if (!expanded && onToggle) onToggle();
    setSpeicherFehler("");
    setEditing(true);
  };
  const speichereAenderungen = async (changes) => {
    if (speichertRef.current) return false;
    speichertRef.current = true;
    setSpeichert(true); setSpeicherFehler("");
    try {
      const ok = await onSave(changes);
      if (!ok) { setSpeicherFehler("Änderung konnte nicht bestätigt gespeichert werden; deine Eingabe bleibt erhalten."); return false; }
      setPrognoseEntwurf(false); setEditing(false);
      return true;
    } catch (error) {
      setSpeicherFehler(error?.message || "Änderung konnte nicht gespeichert werden.");
      return false;
    } finally { speichertRef.current = false; setSpeichert(false); }
  };
  const kartenAktion = auswahlmodus ? (auswaehlbar ? onAuswahl : null) : onToggle;
  const kartenRolle = auswahlmodus ? "checkbox" : (kartenAktion ? "button" : undefined);
  return (
    <div
      onClick={kartenAktion}
      // KD-027: Tastatur-Zugang für die klickbare Karte (Enter/Space wie onClick), nur der Karten-Root
      role={kartenRolle}
      aria-checked={auswahlmodus ? ausgewaehlt : undefined}
      aria-disabled={auswahlmodus && !auswaehlbar ? true : undefined}
      aria-label={auswahlmodus
        ? `${film.titel || "Eintrag"} ${auswaehlbar ? "auswählen" : "nicht auswählbar: keine eindeutige Eintrags-ID"}`
        : undefined}
      tabIndex={kartenAktion ? 0 : undefined}
      onKeyDown={kartenAktion ? (e) => {
        if (e.target !== e.currentTarget) return; // innere Buttons/Felder nicht doppelt auslösen
        if (e.key === "Enter" || e.key === " ") { if (e.key === " ") e.preventDefault(); kartenAktion(); }
      } : undefined}
      className={`kd-karte${auswahlmodus ? " kd-auswahl-karte" : ""}${ausgewaehlt ? " kd-auswahl-karte--aktiv" : ""}`}
      style={{
        background: T.leinwand, color: T.tinte, borderRadius: 6, padding: "14px 16px",
        cursor: kartenAktion ? "pointer" : "default",
        boxShadow: ausgewaehlt ? `0 0 0 3px ${T.wolfram}, 0 2px 10px rgba(0,0,0,0.45)` : "0 2px 10px rgba(0,0,0,0.45)",
        opacity: auswahlmodus && !auswaehlbar ? 0.62 : 1,
      }}
    >
      <div className="kd-filmkopf" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {auswahlmodus && (
          <span className="kd-auswahl-marke" aria-hidden="true">
            {auswaehlbar ? (ausgewaehlt ? "✓" : "") : "–"}
          </span>
        )}
        {dreieck && <Dreieck bw={unbewertet ? null : film.bewertung} />}
        <div className="kd-filmhaupt" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", alignItems: "baseline" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, lineHeight: 1.1, textTransform: "uppercase", letterSpacing: "0.02em" }}>
              {film.titel}
            </span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.tinteWeich }}>
              {film.jahr}{film.jahr_bis ? "–" + film.jahr_bis : ""}{film.typ !== "film" ? (film.jahr ? " · " : "") + film.typ : ""}
              {film.art || film.kategorie_frei ? " · " + (film.art || film.kategorie_frei) : ""}
              {film.bewertet_von === "max" ? " · ✓ von dir"
                : String(film.bewertet_von || "").startsWith("KI-Prognose") ? " · KI-Vorschlag übernommen"
                : film.import_von ? " · bewertet von " + (film.bewertet_von || film.import_von)
                : ""}
            </span>
          </div>
          {dreieck && (
            <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              {unbewertet ? (
                <>
                  <UnbewertetTag />
                  {onSave && (
                    <button style={{ ...btnStyle(false), fontSize: 12, padding: "4px 10px", color: T.tinte, borderColor: T.tinteWeich }}
                      onClick={jetztBewerten}>✎ Jetzt bewerten</button>
                  )}
                </>
              ) : (
                <>
                  <AxisChips bw={film.bewertung} />
                  <KategorieTag k={film.kategorie} />
                </>
              )}
              {streamBadge}
            </div>
          )}
          {kinoInfo && (
            <div style={{ marginTop: 8, fontFamily: "'Space Mono', monospace", fontSize: 13, lineHeight: 1.6 }}>{kinoInfo}</div>
          )}
          {expanded && !editing && (
            <div style={{ marginTop: 10, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 400, fontSize: 14, lineHeight: 1.55 }}>
              {dreieck
                ? (film.begruendung || "Keine Begründung hinterlegt.")
                : (film.beschreibung || "Keine Beschreibung hinterlegt.")}
              {/* Notiz (persistiertes Freifeld) und "Kommt vor in" (Laufzeit-
                 Backlink aus dem Blog) sind bewusst ZWEI getrennte Blöcke —
                 der Backlink wird nie gespeichert. */}
              {film.notiz ? (
                <div style={{ marginTop: 8, padding: "8px 10px", background: T.leinwandTief, borderLeft: "3px solid " + T.wolfram, fontSize: 13 }}>
                  <strong>Notiz:</strong> {film.notiz}
                </div>
              ) : null}
              {kommtVorIn && kommtVorIn.length > 0 && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: T.leinwandTief, borderRadius: 4, fontSize: 13 }}>
                  <strong>Kommt vor in:</strong>
                  {kommtVorIn.map((a) => (
                    <div key={a.id} style={{ marginTop: 4 }}>
                      {onArtikelKlick ? (
                        <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onArtikelKlick(a.id); }}
                          style={{ color: T.tinte, textDecorationColor: T.wolfram, textUnderlineOffset: 3 }}>→ {a.titel}</a>
                      ) : <span style={{ color: T.tinteWeich }}>→ {a.titel}</span>}
                    </div>
                  ))}
                </div>
              )}
              {(onSave || onDelete) && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {onSave && (
                  <button style={{ ...btnStyle(false), fontSize: 13, padding: "6px 12px", color: T.tinte, borderColor: T.tinteWeich }}
                    onClick={(e) => { e.stopPropagation(); setSpeicherFehler(""); setPrognoseEntwurf(false); setEditing(true); }}>
                    ✎ {dreieck ? "Bewertung bearbeiten" : "Beschreibung bearbeiten"}
                  </button>
                  )}
                  {onDelete && (
                    <button className="kd-film-loeschen" style={{ ...btnStyle(false), width: 36, minWidth: 36, padding: 0, color: T.gefahr, borderColor: T.gefahr, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                      aria-label="Eintrag löschen" title="Eintrag löschen"
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                      <IconDelete size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {expanded && !editing && unbewertet && filmwissen && (
            <div onClick={(e) => e.stopPropagation()}
              style={{ marginTop: 12, background: T.saalHoch, borderRadius: 6, padding: 10 }}>
              <FilmwissenBereich
                phase={filmwissen.phase}
                daten={filmwissen.daten}
                fehler={filmwissen.fehler}
                rechercheLaeuft={filmwissen.rechercheLaeuft}
                rechercheMoeglich={filmwissen.rechercheMoeglich}
                onRecherchieren={filmwissen.onRecherchieren}
              />
            </div>
          )}
        </div>
      </div>
      {expanded && !editing && vorbewertung && (unbewertet || film.prognose) && (
        <div className="kd-film-prognose-breit" onClick={(e) => e.stopPropagation()}
          style={{ width: "100%", boxSizing: "border-box", marginTop: 12, background: T.saalHoch, borderRadius: 6, padding: 10 }}>
          <PrognoseBereich
            film={film}
            laeuft={vorbewertung.laeuft}
            fehler={vorbewertung.fehler}
            erstellenMoeglich={!vorbewertung.sperrgrund}
            sperrgrund={vorbewertung.sperrgrund}
            aktuelleProfilVersion={vorbewertung.aktuelleProfilVersion}
            onErstellen={vorbewertung.onErstellen}
            onAnnehmen={vorbewertung.onAnnehmen}
            onVerwerfen={vorbewertung.onVerwerfen}
            onKorrigieren={() => { setSpeicherFehler(""); setPrognoseEntwurf(false); setEditing(true); }}
            onUebernehmen={onSave ? () => { setSpeicherFehler(""); setPrognoseEntwurf(true); setEditing(true); } : null}
          />
        </div>
      )}
      {expanded && editing && (
        <div className="kd-film-editor-shell">
          {dreieck ? (
            <EditPanel key={prognoseEntwurf ? "prognose" : "manuell"}
              film={prognoseEntwurf ? {
                ...film,
                bewertung: film.prognose?.ergebnis?.achsen || null,
                kategorie: film.prognose?.ergebnis?.kategorie_vorschlag || null,
                begruendung: film.prognose?.ergebnis?.begruendung || "",
              } : film}
              autorName={prognoseEntwurf ? "KI-Prognose (übernommen)" : undefined}
              herkunftHinweis={prognoseEntwurf ? "KI-Prognose vorausgefüllt – prüfe alle Werte. Erst Speichern macht daraus eine Bewertung." : null}
              speichert={speichert} fehler={speicherFehler}
              onCancel={() => { if (!speichert) { setPrognoseEntwurf(false); setEditing(false); } }}
              onSave={async (changes) => {
                let next = changes;
                if (changes?.bewertung != null && film.prognose?.status === "offen") {
                  const wechsel = setzePrognoseStatus(film.prognose, prognoseEntwurf ? "angenommen" : "korrigiert");
                  if (wechsel.ok) next = { ...changes, prognose: wechsel.prognose };
                } else if (changes?.bewertung != null && film.prognose?.status === "angenommen" && !prognoseEntwurf) {
                  const wechsel = setzePrognoseStatus(film.prognose, "korrigiert");
                  if (wechsel.ok) next = { ...changes, prognose: wechsel.prognose };
                }
                return speichereAenderungen(next);
              }} />
          ) : (
            <BeschreibungEditor eintrag={film} speichert={speichert} fehler={speicherFehler}
              onCancel={() => { if (!speichert) setEditing(false); }} onSave={speichereAenderungen} />
          )}
        </div>
      )}
    </div>
  );
}

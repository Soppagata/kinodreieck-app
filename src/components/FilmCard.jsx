import { useState } from "react";
import { T, btnStyle, lightInput } from "../lib/tokens.js";
import { schlagseite, score } from "../lib/match.js";
import { hatDreieck } from "../lib/typen.js";
import { Dreieck, AxisChips, KategorieTag, UnbewertetTag } from "./ui.jsx";
import { EditPanel } from "./EditPanel.jsx";

/* Einfacher Editor für Einträge ohne Dreieck (musik/sonstiges):
   Beschreibung + Notiz — die Notiz ist bei JEDEM Eintrag editierbar. */
function BeschreibungEditor({ eintrag, onSave, onCancel }) {
  const [besch, setBesch] = useState(eintrag.beschreibung || "");
  const [notiz, setNotiz] = useState(eintrag.notiz || "");
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, padding: 12, background: T.leinwandTief, borderRadius: 4, display: "flex", flexDirection: "column", gap: 10 }}>
      <textarea value={besch} onChange={(e) => setBesch(e.target.value)} rows={3}
        placeholder="Beschreibung" style={{ ...lightInput, width: "100%", boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif" }} />
      <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={2}
        placeholder="Notiz (Edition, Fassung, Sehstand … — frei)" style={{ ...lightInput, width: "100%", boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ ...btnStyle(true), fontSize: 14, padding: "7px 14px" }} onClick={() => onSave({ beschreibung: besch, notiz })}>Speichern</button>
        <button style={{ ...btnStyle(false), fontSize: 14, padding: "7px 14px", color: T.tinte, borderColor: T.tinteWeich }} onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}

/* ---------- Karte für Mediathek-Einträge ----------
   Dreieck-Typen: volle Karte (Glyph, Achsen, Kategorie, Score, EditPanel).
   musik/sonstiges: reduzierte Karte (kein Dreieck — Modell ist auf
   Filmwirkung kalibriert), Beschreibung statt Begründung.
   kommtVorIn: Artikel-Referenzen aus dem Blog (Phase 2), Laufzeit-berechnet. */
export function FilmCard({ film, kinoInfo, streamBadge, expanded, onToggle, onSave, kommtVorIn, onArtikelKlick }) {
  const [editing, setEditing] = useState(false);
  const dreieck = hatDreieck(film.typ);
  /* unbewertet = bewertung fehlt komplett (null). 0/0/0 ist eine ECHTE Bewertung. */
  const unbewertet = dreieck && film.bewertung == null;
  const ss = dreieck && !unbewertet ? schlagseite(film.bewertung) : null;
  /* Schneller Bewerten-Einstieg: Karte aufklappen + direkt ins EditPanel. */
  const jetztBewerten = (e) => {
    e.stopPropagation();
    if (!expanded && onToggle) onToggle();
    setEditing(true);
  };
  return (
    <div
      onClick={onToggle}
      className="kd-karte"
      style={{ background: T.leinwand, color: T.tinte, borderRadius: 6, padding: "14px 16px", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.45)" }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {dreieck && <Dreieck bw={unbewertet ? null : film.bewertung} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", alignItems: "baseline" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, lineHeight: 1.1, textTransform: "uppercase", letterSpacing: "0.02em" }}>
              {film.titel}
            </span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.tinteWeich }}>
              {film.jahr}{film.jahr_bis ? "–" + film.jahr_bis : ""}{film.typ !== "film" ? (film.jahr ? " · " : "") + film.typ : ""}
              {film.art || film.kategorie_frei ? " · " + (film.art || film.kategorie_frei) : ""}
              {film.bewertet_von === "max" ? " · ✓ von dir"
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
                  {ss && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>▸ Schlagseite: {ss.toUpperCase()}</span>}
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
              {onSave && (
                <div style={{ marginTop: 10 }}>
                  <button style={{ ...btnStyle(false), fontSize: 13, padding: "6px 12px", color: T.tinte, borderColor: T.tinteWeich }}
                    onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
                    ✎ {dreieck ? "Bewertung bearbeiten" : "Beschreibung bearbeiten"}
                  </button>
                </div>
              )}
            </div>
          )}
          {expanded && editing && (
            dreieck ? (
              <EditPanel film={film} onCancel={() => setEditing(false)}
                onSave={(changes) => { setEditing(false); onSave(changes); }} />
            ) : (
              <BeschreibungEditor eintrag={film} onCancel={() => setEditing(false)}
                onSave={(changes) => { setEditing(false); onSave(changes); }} />
            )
          )}
        </div>
        {dreieck && (
          <div style={{ textAlign: "right", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.tinteWeich, whiteSpace: "nowrap" }}>
            {unbewertet ? "—" : score(film).toFixed(1)}
            <div style={{ fontSize: 10 }}>SCORE</div>
          </div>
        )}
      </div>
    </div>
  );
}

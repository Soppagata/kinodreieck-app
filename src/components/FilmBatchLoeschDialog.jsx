import { useEffect, useRef } from "react";
import { btnStyle } from "../lib/tokens.js";
import { sperreDokumentScroll } from "../lib/documentScrollLock.js";

const FOKUSZIELE = [
  "button:not([disabled])", "[href]", "input:not([disabled])", "select:not([disabled])",
  "textarea:not([disabled])", '[tabindex]:not([tabindex="-1"])',
].join(",");

function anzahlText(anzahl, singular, plural) {
  return `${anzahl} ${anzahl === 1 ? singular : plural}`;
}

export function FilmBatchLoeschDialog({ dialog, onAbbrechen, onBestaetigen }) {
  const dialogRef = useRef(null);
  const abbrechenRef = useRef(null);
  const { snapshot, plan, pending, fehler, verbraucht } = dialog;
  const anzahl = snapshot.ids.length;

  useEffect(() => {
    abbrechenRef.current?.focus();
  }, []);

  useEffect(() => {
    return sperreDokumentScroll();
  }, []);

  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return undefined;
    const beiTaste = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pending) onAbbrechen();
        return;
      }
      if (event.key !== "Tab") return;
      const ziele = [...element.querySelectorAll(FOKUSZIELE)]
        .filter((ziel) => !ziel.hidden && ziel.getAttribute("aria-hidden") !== "true");
      if (!ziele.length) {
        event.preventDefault();
        element.focus();
        return;
      }
      const erstes = ziele[0], letztes = ziele[ziele.length - 1];
      if (event.shiftKey && document.activeElement === erstes) {
        event.preventDefault(); letztes.focus();
      } else if (!event.shiftKey && document.activeElement === letztes) {
        event.preventDefault(); erstes.focus();
      }
    };
    element.addEventListener("keydown", beiTaste);
    return () => element.removeEventListener("keydown", beiTaste);
  }, [onAbbrechen, pending]);

  return (
    <div className="kd-film-batch-dialog-layer">
      <div className="kd-film-batch-dialog-scrim" aria-hidden="true" />
      <div ref={dialogRef} className="kd-film-batch-dialog" role="dialog" aria-modal="true"
        aria-labelledby="kd-film-batch-dialog-titel"
        aria-describedby="kd-film-batch-dialog-beschreibung kd-film-batch-dialog-grenzen"
        tabIndex={-1}>
        <header>
          <span>Mehrfachlöschen</span>
          <h2 id="kd-film-batch-dialog-titel">
            {anzahlText(anzahl, "sichtbaren Eintrag", "sichtbare Einträge")} löschen?
          </h2>
        </header>
        <p id="kd-film-batch-dialog-beschreibung">
          Nur diese beim Prüfen sichtbare Auswahl wird gelöscht. Artikel und Must-Watch-Einträge bleiben bestehen;
          E12 bereinigt ausschließlich Master, Artikelverweise und Must-Watch-Masterlinks.
        </p>
        <p id="kd-film-batch-dialog-grenzen">
          Der Vorgang ist lokal kompensierend und referenziell abgesichert/fail-safe, aber keine crash-, server-
          oder geräteübergreifend atomare/ACID-Transaktion.
        </p>

        <ul className="kd-film-batch-ziel-liste" aria-label="Zu löschende Einträge">
          {snapshot.ziele.map((ziel) => (
            <li key={ziel.id}>
              <strong>{ziel.titel}</strong>{ziel.jahr ? <span> ({ziel.jahr})</span> : null}
            </li>
          ))}
        </ul>

        <section className="kd-film-batch-folgen" aria-label="Genaue Folgen">
          <h3>Folgen</h3>
          <ul>
            <li>{anzahlText(plan.folgen.masterEintraege || 0, "Masterlöschung", "Masterlöschungen")}</li>
            <li>{plan.folgen.artikelRefs || 0} {(plan.folgen.artikelRefs || 0) === 1 ? "Blogref wird" : "Blogrefs werden"} zu Rotlinks</li>
            <li>{plan.folgen.mustwatchRefs || 0} {(plan.folgen.mustwatchRefs || 0) === 1 ? "Must-Watch-Masterlink wird" : "Must-Watch-Masterlinks werden"} gelöst</li>
          </ul>
        </section>

        {snapshot.verborgeneAnzahl > 0 && (
          <p className="kd-film-batch-verborgen">
            {anzahlText(snapshot.verborgeneAnzahl, "weiterer verborgener ausgewählter Eintrag ist", "weitere verborgene ausgewählte Einträge sind")}
            {" "}
            <strong>nicht Ziel und {snapshot.verborgeneAnzahl === 1 ? "wird" : "werden"} nicht gelöscht.</strong>
          </p>
        )}
        {pending && <p className="kd-film-batch-pending" role="status">Löschung läuft … Bitte warten.</p>}
        {fehler && <p className="kd-film-batch-fehler" role="alert">{fehler}</p>}

        <div className="kd-film-batch-aktionen">
          <button ref={abbrechenRef} type="button" style={btnStyle(false)} disabled={pending}
            onClick={onAbbrechen}>Abbrechen</button>
          <button type="button" className="kd-film-batch-bestaetigen"
            style={{ ...btnStyle(false), borderColor: "var(--gefahr,#d96a5a)", color: "var(--gefahr,#d96a5a)" }}
            disabled={pending || verbraucht} onClick={onBestaetigen}>
            {pending ? "Löscht …" : `${anzahl} löschen`}
          </button>
        </div>
      </div>
    </div>
  );
}

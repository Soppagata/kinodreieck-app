import { useEffect, useRef } from "react"; // KD-028
import { createPortal } from "react-dom";
import { T, btnStyle } from "../lib/tokens.js";

/* ---------- Startwahl (Beta) ----------
   Erscheint beim allerersten Öffnen, wenn weder ein Storage-Stand noch eine
   frühere Wahl (kd:start) noch ein ?start=-Parameter vorliegt. Zwei Wege,
   eindeutig benannt und erklärt — NICHT im Tutorial versteckt (§7.4):

     clean  = leerer Start, eigene Mediathek über die Tour aufbauen (Default)
     demo   = Schaufenster mit einer fremden Beispiel-Liste (Bewertungen sind
              nicht deine, Besitz bewusst leer)

   onWaehle("clean"|"demo") schreibt die Wahl weg und lädt entsprechend.
   Umkehrbar über den Einstellungen-Tab ("Startart wechseln") — deshalb ist die
   Entscheidung hier bewusst leichtgewichtig. */
export function StartWahl({ onWaehle, aktuelle, onClose }) { // KD-028: optionaler onClose (Escape)
  const dialogRef = useRef(null); // KD-028
  // KD-028: Fokus-Eintritt + Fokus-Falle + Escape + Fokus-Rückgabe (Muster aus TourOverlay)
  useEffect(() => {
    const el = dialogRef.current; if (!el) return;
    const vorherFokus = document.activeElement;
    const focusables = () => [...el.querySelectorAll("button, [href], input, [tabindex]")].filter((n) => !n.disabled);
    const f = focusables(); if (f.length) f[0].focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); if (onClose) onClose(); return; }
      if (e.key === "Tab") {
        const list = focusables(); if (!list.length) return;
        const erst = list[0], letzt = list[list.length - 1];
        if (!el.contains(document.activeElement)) { e.preventDefault(); erst.focus(); return; }
        if (e.shiftKey && document.activeElement === erst) { e.preventDefault(); letzt.focus(); }
        else if (!e.shiftKey && document.activeElement === letzt) { e.preventDefault(); erst.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (vorherFokus && vorherFokus.focus) vorherFokus.focus(); // Fokus-Rückgabe
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const overlay = {
    position: "fixed", inset: 0, zIndex: 10002, background: "rgba(23,21,26,0.92)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto",
  };
  const box = {
    background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 8,
    maxWidth: 560, width: "100%", padding: "26px 28px", boxShadow: "0 10px 48px rgba(0,0,0,0.6)",
    maxHeight: "90dvh", overflowY: "auto", overscrollBehavior: "contain",
  };
  const h = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 6px" };
  const karte = {
    background: T.saal, border: "1px solid " + T.wolfram, borderRadius: 6,
    padding: "16px 18px", margin: "14px 0 0", display: "flex", flexDirection: "column", gap: 8,
  };
  const kTitel = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 19, letterSpacing: "0.05em", textTransform: "uppercase", color: T.leinwand, margin: 0 };
  const kText = { fontSize: 13.5, color: T.leinwandTief, lineHeight: 1.6, margin: 0 };

  return createPortal(
    <div ref={dialogRef} style={overlay} role="dialog" aria-modal="true" aria-label="Wie möchtest du starten?">
      <div style={box}>
        <h2 style={h}>Wie möchtest du starten?</h2>
        <p style={{ fontSize: 14, color: T.rauch, lineHeight: 1.6, margin: "0 0 4px" }}>
          Zwei Wege. Du kannst später jederzeit wechseln (Einstellungen → Startart).
        </p>

        <div style={karte} data-tour="startwahl-clean">
          <h3 style={kTitel}>Leer starten <span style={{ color: T.wolfram, fontSize: 13 }}>· empfohlen</span></h3>
          <p style={kText}>
            Nichts ist vorbelegt. Du baust deine eigene Mediathek Schritt für Schritt
            auf — eine kurze Tour zeigt dir, wie. Der ehrliche Weg, um die App
            kennenzulernen.
          </p>
          <div>
            <button style={btnStyle(true)} onClick={() => onWaehle("clean")}>Leer starten</button>
          </div>
        </div>

        <div style={karte} data-tour="startwahl-demo">
          <h3 style={kTitel}>Demo ansehen</h3>
          <p style={kText}>
            Lädt Max' echte Sammlung (255 Titel) als Schaufenster — seine Bewertungen,
            sein Besitz, damit du eine mögliche Ordnung und Logik siehst, statt bei null
            anzufangen. Du kannst alles ansehen und frei editieren; das Original bleibt
            bei Max. Zum Kennenlernen der App mit echtem Inhalt.
          </p>
          <div>
            <button style={btnStyle(false)} onClick={() => onWaehle("demo")}>Demo ansehen</button>
          </div>
        </div>

        {aktuelle && (
          <p style={{ fontSize: 11, color: T.rauch, fontFamily: "'Space Mono', monospace", margin: "14px 0 0" }}>
            Aktuell aktiv: {aktuelle === "demo" ? "Demo" : "Leerer Start"}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}

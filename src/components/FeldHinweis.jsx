import { useState, useRef, useEffect } from "react";
import { T } from "../lib/tokens.js";
import { FELD } from "../lib/hinweise.js";
import { istTourOffen } from "../lib/tour.js";

/* ---------- Feld-Tooltip (Teil B) ----------
   Kleines „?“ neben einem Label. Öffnet bei mouseenter | focus | Klick,
   schließt bei mouseleave | blur | Escape (focus zwingend für Tastatur).
   Tooltip: saalHoch, Rahmen tinteWeich, Text rauch, max 240px, über oder unter
   dem Auslöser je nach Platz, nie aus dem Viewport. Eigene, sehr kleine
   Komponente statt native title (die erscheinen spät, nicht per Tastatur, un-
   stylebar). Aus, solange ein Tutorial-Overlay offen ist (Kollision Teil A). */
export function FeldHinweis({ feld, text }) {
  const inhalt = text || FELD[feld];
  const [offen, setOffen] = useState(false);
  const [pos, setPos] = useState({ oben: false, rechts: false });
  const wrapRef = useRef(null);
  if (!inhalt) return null;

  const oeffnen = () => { if (!istTourOffen()) setOffen(true); };
  const schliessen = () => setOffen(false);

  useEffect(() => {
    if (!offen) return;
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      const vh = window.innerHeight || 800, vw = window.innerWidth || 1000;
      setPos({ oben: r.bottom + 130 > vh, rechts: r.left + 248 > vw });
    }
    const onEsc = (e) => { if (e.key === "Escape") setOffen(false); };
    document.addEventListener("keydown", onEsc, true);
    return () => document.removeEventListener("keydown", onEsc, true);
  }, [offen]);

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onMouseEnter={oeffnen} onMouseLeave={schliessen}>
      <button type="button" aria-label={"Was bedeutet dieses Feld? " + feld}
        onFocus={oeffnen} onBlur={schliessen} onClick={(e) => { e.stopPropagation(); e.preventDefault(); offen ? schliessen() : oeffnen(); }}
        style={{
          width: 16, height: 16, borderRadius: 8, border: "1px solid " + T.rauch, background: "transparent",
          color: T.rauch, fontSize: 11, lineHeight: "14px", cursor: "help", padding: 0, marginLeft: 5,
          fontFamily: "'Space Grotesk', sans-serif", display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>?</button>
      {offen && (
        <span role="tooltip" style={{
          position: "absolute", zIndex: 9999,
          [pos.oben ? "bottom" : "top"]: 22,
          [pos.rechts ? "right" : "left"]: 0,
          width: 240, maxWidth: "70vw",
          background: T.saalHoch, border: "1px solid " + T.tinteWeich, borderRadius: 4,
          padding: "8px 10px", color: T.rauch, fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 13, lineHeight: 1.5, boxShadow: "0 6px 24px rgba(0,0,0,0.5)", pointerEvents: "none",
          whiteSpace: "normal", textTransform: "none", letterSpacing: 0,
        }}>{inhalt}</span>
      )}
    </span>
  );
}

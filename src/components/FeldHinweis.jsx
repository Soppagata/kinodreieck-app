import { useState, useRef, useEffect, useId } from "react";
import { T } from "../lib/tokens.js";
import { FELD } from "../lib/hinweise.js";

/* ---------- Feld-Tooltip (Teil B) ----------
   Kleines „?“ neben einem Label. Öffnet bei mouseenter | focus | Klick,
   schließt bei mouseleave | blur | Escape (focus zwingend für Tastatur).
   Tooltip: saalHoch, Rahmen tinteWeich, Text rauch, max 240px, über oder unter
   dem Auslöser je nach Platz, nie aus dem Viewport. Eigene, sehr kleine
   Komponente statt native title (die erscheinen spät, nicht per Tastatur, un-
   stylebar). */
export function FeldHinweis({ feld, text }) {
  const inhalt = text || FELD[feld];
  const [offen, setOffen] = useState(false);
  const [pos, setPos] = useState({ oben: false, rechts: false });
  const wrapRef = useRef(null);
  const festRef = useRef(false);
  const tooltipId = useId();

  const oeffnen = () => setOffen(true);
  const schliessen = () => { festRef.current = false; setOffen(false); };
  const schliesseVorschau = () => { if (!festRef.current) setOffen(false); };

  useEffect(() => {
    if (!offen) return;
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      const vh = window.innerHeight || 800, vw = window.innerWidth || 1000;
      setPos({ oben: r.bottom + 130 > vh, rechts: r.left + 248 > vw });
    }
    const onEsc = (e) => { if (e.key === "Escape") schliessen(); };
    const onAussen = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) schliessen(); };
    document.addEventListener("keydown", onEsc, true);
    document.addEventListener("pointerdown", onAussen, true);
    return () => {
      document.removeEventListener("keydown", onEsc, true);
      document.removeEventListener("pointerdown", onAussen, true);
    };
  }, [offen]);

  if (!inhalt) return null;

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onMouseEnter={oeffnen} onMouseLeave={schliesseVorschau}>
      <button type="button" aria-label={"Was bedeutet dieses Feld? " + feld}
        aria-expanded={offen} aria-describedby={offen ? tooltipId : undefined}
        onFocus={oeffnen} onBlur={schliessen} onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (e.detail === 0) { oeffnen(); return; }
          festRef.current = !festRef.current;
          setOffen(festRef.current);
        }}
        style={{
          width: 32, height: 32, borderRadius: 16, border: "1px solid " + T.rauch, background: "transparent",
          color: T.rauch, fontSize: 13, lineHeight: "30px", cursor: "help", padding: 0, marginLeft: 5,
          fontFamily: "'Space Grotesk', sans-serif", display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>?</button>
      {offen && (
        <span id={tooltipId} role="tooltip" style={{
          position: "absolute", zIndex: 9999,
          [pos.oben ? "bottom" : "top"]: 38,
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

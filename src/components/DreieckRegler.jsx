import { useState } from "react";
import { T } from "../lib/tokens.js";
import { Dreieck } from "./ui.jsx";
import { schlagseite } from "../lib/match.js";

/* ---------- DreieckRegler ----------
   Interaktives Dreieck mit drei Reglern (WIE/WAS/WARUM) + abgeleiteter Kategorie.
   Rendert nur den Inhalt (kein eigener Rahmen) — der Aufrufer umschließt.
   Verwendet in der Willkommen-Box und auf dem Dashboard. */

function kategorieLabel(bw) {
  const s = schlagseite(bw);
  if (!s) return "Ausgewogen";
  return { wie: "WIE-lastig", was: "WAS-lastig", warum: "WARUM-lastig" }[s];
}
/* Kurzformel je Schlagseite — die alte, greifbare Erklärung, jetzt live. */
function kategorieFormel(bw) {
  const s = schlagseite(bw);
  return { wie: "Handwerk vor Stoff", was: "Stoff vor Handwerk", warum: "Wirkung vor Machart" }[s] || "alle drei im Gleichgewicht";
}

export function DreieckRegler({ start = { wie: 4, was: 2, warum: 5 }, scale = 2.1, size = 54 }) {
  const [bw, setBw] = useState(start);
  const slider = (achse, key, col) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "7px 0" }}>
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", color: col, width: 66 }}>{achse}</span>
      <input type="range" min="0" max="5" step="1" value={bw[key]} aria-label={achse}
        onChange={(e) => setBw({ ...bw, [key]: Number(e.target.value) })}
        style={{ flex: 1, accentColor: col, cursor: "pointer" }} />
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: T.leinwandTief, width: 14, textAlign: "right" }}>{bw[key]}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
      <div style={{ flexShrink: 0, width: 120, display: "flex", justifyContent: "center" }}>
        <div style={{ transform: "scale(" + scale + ")" }}><Dreieck bw={bw} size={size} /></div>
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        {slider("WIE", "wie", T.wie)}
        {slider("WAS", "was", T.was)}
        {slider("WARUM", "warum", T.warum)}
        <div style={{ marginTop: 12, fontFamily: "'Space Mono', monospace", fontSize: 12.5, color: T.rauch, lineHeight: 1.5 }}>
          Kategorie: <span style={{ color: T.wolfram }}>{kategorieLabel(bw)}</span>
          <span style={{ color: T.leinwandTief }}> — {kategorieFormel(bw)}</span>
        </div>
      </div>
    </div>
  );
}

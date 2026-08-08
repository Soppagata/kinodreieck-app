import { useState } from "react";
import { T } from "../lib/tokens.js";
import { Dreieck } from "./ui.jsx";

/* ---------- DreieckRegler ----------
   Interaktives Dreieck mit drei Reglern (WIE/WAS/WARUM) und live gezeichneter Form.
   Rendert nur den Inhalt (kein eigener Rahmen) — der Aufrufer umschließt.
   Verwendet in Erklaerstuecke und im Geschmacks-Onboarding. */

/* GESTEUERT ODER UNGESTEUERT — beides, aus Rücksicht auf die Bestandsnutzer.
   In der Willkommens-Box und in `Erklaerstuecke` ist der Regler ein
   Erklärstück: Er soll spielbar sein und niemanden nach außen stören, also
   hält er seinen Zustand selbst. Im Geschmacks-Onboarding (Etappe 7, 2c)
   erhebt er dagegen eine Angabe, die ins Profil wandert — dort muss der
   Aufrufer den Wert besitzen.

   Gesteuert ist er nur, wenn BEIDES da ist: `wert` UND `onChange`. Hinge es
   allein an `wert`, ergäbe ein vergessener `onChange` einen Regler, der sich
   nicht bewegen lässt und das nirgends sagt — die unauffälligste Art, eine
   Erhebung stumm zu schalten.

   Der innere Zustand wird im gesteuerten Betrieb NICHT mitgeführt: Er bliebe
   auf `start` stehen, und ein Regler, der von gesteuert auf ungesteuert
   zurückfiele, spränge sichtbar zurück. Ein zweiter Speicherort, der
   abweichen kann, ist schlimmer als gar keiner. */
export function DreieckRegler({ start = { wie: 4, was: 2, warum: 5 }, scale = 2.1, size = 54, wert = null, onChange = null }) {
  const [eigen, setEigen] = useState(start);
  const gesteuert = !!wert && typeof onChange === "function";
  const bw = gesteuert ? wert : eigen;
  const setBw = (f) => {
    const neu = typeof f === "function" ? f(bw) : f;
    if (!gesteuert) setEigen(neu);
    /* Dieselbe Prüfung wie in `gesteuert`, nicht die schwächere Optionalkette:
       `?.` fängt nur `null`/`undefined`. Ein `onChange`, das truthy und keine
       Funktion ist, fiel durch `gesteuert` in den ungesteuerten Betrieb und
       warf hier bei der ersten Reglerbewegung. Zwei verschiedene Maßstäbe
       für dieselbe Frage im selben Modul sind genau die Asymmetrie, die
       solche Fälle erzeugt. */
    if (typeof onChange === "function") onChange(neu);
  };
  const slider = (achse, key, col) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "7px 0" }}>
      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", color: col, width: 66 }}>{achse}</span>
      {/* funktionales Update: `{ ...bw }` liest aus dem Render-Closure. Heute
          folgenlos, weil React diskrete Events einzeln flusht — kippt aber,
          sobald der Zustand nach außen gehoben oder gebatcht wird. */}
      <input type="range" min="0" max="5" step="1" value={bw[key]} aria-label={achse}
        onChange={(e) => { const n = Number(e.target.value); setBw((v) => ({ ...v, [key]: n })); }}
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
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { btnStyle } from "../lib/tokens.js";

/* ---- Easter-Egg „Choose Life" — Der Teppich (Block 3) ----
   Trainspotting-Sturz: beim Mediathek-Scrollen selten „durch den Boden fallen".
   Man blickt in einen rechteckigen Schacht: ein scharfkantiges Fenster sinkt zentral
   weg (kleiner + tiefer, wie ein Sarg ins Grab), und vier Kanten verbinden JEDE
   Bildschirm-Ecke mit der zugehörigen Ecke des sinkenden Fensters (raumtiefer Schacht).
   Roter, flauschiger Teppich als Wand. `prefers-reduced-motion` → direkt der Endzustand.
   Test-Hooks: window.__teppich.{film,gefallen}. */

const setzeHook = (patch) => { try { window.__teppich = { ...(window.__teppich || {}), ...patch }; } catch { /* */ } };

export function Teppich({ filme = [], onClose, reduced = false, herkunftVon, onZeigeEintrag }) {
  const film = useMemo(() => (filme.length ? filme[Math.floor(Math.random() * filme.length)] : null), [filme]);
  const [gefallen, setGefallen] = useState(reduced);
  const oeffnungRef = useRef(null);
  const kantenRef = useRef(null);

  useEffect(() => {
    setzeHook({ film: film ? (film.titel || "") : "", gefallen: reduced });
    if (!film) { if (onClose) onClose(); return; }
    if (reduced) return;
    const t = setTimeout(() => { setGefallen(true); setzeHook({ gefallen: true }); }, 1500);
    return () => clearTimeout(t);
  }, [film, reduced, onClose]);

  /* Schachtkanten frame-genau an die (per CSS-Transform animierten) Fenster-Ecken hängen:
     jede Bildschirm-Ecke → zugehörige Ecke des sinkenden Fensters. */
  useEffect(() => {
    if (!film) return;
    let raf = 0;
    const tick = () => {
      const el = oeffnungRef.current, svg = kantenRef.current;
      if (el && svg) {
        const r = el.getBoundingClientRect();
        const W = window.innerWidth || 0, H = window.innerHeight || 0;
        const ln = svg.querySelectorAll("line");
        const pts = [[0, 0, r.left, r.top], [W, 0, r.right, r.top], [W, H, r.right, r.bottom], [0, H, r.left, r.bottom]];
        for (let i = 0; i < ln.length && i < 4; i++) {
          ln[i].setAttribute("x1", pts[i][0]); ln[i].setAttribute("y1", pts[i][1]);
          ln[i].setAttribute("x2", pts[i][2]); ln[i].setAttribute("y2", pts[i][3]);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [film]);

  if (!film) return null;
  const h = herkunftVon ? herkunftVon(film) : null;

  return (
    <div className="kd-teppich-scrim" role="dialog" aria-label="Der Teppich" onClick={gefallen ? onClose : undefined}>
      <div className="kd-teppich-flausch" aria-hidden="true" />
      <div className="kd-teppich-schacht" aria-hidden="true" />
      <svg className="kd-teppich-kanten" ref={kantenRef} aria-hidden="true">
        <line /><line /><line /><line />
      </svg>
      <div className={"kd-teppich-oeffnung" + (gefallen ? " weg" : "")} ref={oeffnungRef} aria-hidden="true" />
      <div className={"kd-teppich-karte" + (gefallen ? " da" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="kd-teppich-kicker">Choose a Film. Choose life</div>
        <div className="kd-teppich-titel">{film.titel}</div>
        <p className="kd-teppich-jahr">{film.jahr ? film.jahr + " · " : ""}Du bist durch den Boden gefallen.</p>
        {h && h.text && <p className="kd-teppich-verf">{h.text}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
          {onZeigeEintrag && <button onClick={() => onZeigeEintrag(film, h ? h.tab : "mediathek")} style={btnStyle(true)}>Zum Eintrag</button>}
          <button onClick={onClose} style={btnStyle(false)}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

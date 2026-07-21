import React, { useEffect, useMemo, useRef, useState } from "react";
import { btnStyle } from "../lib/tokens.js";

/* ---- Easter-Egg „Choose Life" — Der Teppich (Block 3) ----
   Ich-Perspektive des Sinkens: Man liegt selbst unten im offenen, abwärtsfahrenden
   Sarg/Schacht und blickt nach oben. Die helle rechteckige Öffnung zieht sich weg;
   vier perspektivische Kanten binden sie an die Viewport-Ecken. Bewusst KEINE
   dargestellte Person. `prefers-reduced-motion` → direkt der Endzustand.
   Im expliziten Vorführmodus bleibt die Szene auch ohne verfügbaren Film sichtbar.
   Test-Hooks: window.__teppich.{film,gefallen}. */

const setzeHook = (patch) => { try { window.__teppich = { ...(window.__teppich || {}), ...patch }; } catch { /* */ } };

export function Teppich({ filme = [], onClose, reduced = false, herkunftVon, onZeigeEintrag, vorschau = false }) {
  const film = useMemo(() => (filme.length ? filme[Math.floor(Math.random() * filme.length)] : null), [filme]);
  const [gefallen, setGefallen] = useState(reduced);
  const oeffnungRef = useRef(null);
  const kantenRef = useRef(null);
  const sichtbar = !!film || vorschau;

  useEffect(() => {
    setzeHook({ film: film ? (film.titel || "") : "", gefallen: reduced });
    if (!sichtbar) { if (onClose) onClose(); return; }
    if (reduced) return;
    const t = setTimeout(() => { setGefallen(true); setzeHook({ gefallen: true }); }, 1150);
    return () => clearTimeout(t);
  }, [film, sichtbar, reduced, onClose]);

  /* Schachtkanten frame-genau an die transformierte Öffnung hängen:
     jede Bildschirm-Ecke → zugehörige Ecke des wegziehenden Rechtecks. */
  useEffect(() => {
    if (!sichtbar) return;
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
  }, [sichtbar]);

  if (!sichtbar) return null;
  const h = film && herkunftVon ? herkunftVon(film) : null;

  return (
    <div className="kd-teppich-scrim" role="dialog" aria-label="Der Teppich" onClick={gefallen ? onClose : undefined}>
      <div className="kd-teppich-flausch" aria-hidden="true" />
      <div className="kd-teppich-schacht" aria-hidden="true" />
      <svg className="kd-teppich-kanten" ref={kantenRef} aria-hidden="true">
        <line /><line /><line /><line />
      </svg>
      <div className={"kd-teppich-oeffnung" + (gefallen ? " weg" : "")} ref={oeffnungRef} aria-hidden="true">
        <i /><b /><span />
      </div>
      <div className={"kd-teppich-karte" + (gefallen ? " da" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="kd-teppich-kicker">Choose a Film. Choose life.</div>
        <div className="kd-teppich-titel">{film ? film.titel : "Der Teppich"}</div>
        <p className="kd-teppich-jahr">
          {film && film.jahr ? film.jahr + " · " : ""}{film ? "Du sinkst tiefer." : "Szenen-Vorschau ohne verfügbaren Film."}
        </p>
        {h && h.text && <p className="kd-teppich-verf">{h.text}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
          {film && onZeigeEintrag && <button onClick={() => onZeigeEintrag(film, h ? h.tab : "mediathek")} style={btnStyle(true)}>Zum Eintrag</button>}
          <button onClick={onClose} style={btnStyle(false)}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

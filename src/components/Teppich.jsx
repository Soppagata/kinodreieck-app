import React, { useEffect, useMemo, useState } from "react";
import { btnStyle } from "../lib/tokens.js";

/* ---- Easter-Egg „Choose Life" — Der Teppich (Block 3) ----
   Trainspotting-Kamerafahrt: beim Mediathek-Scrollen selten auf dem roten Teppich
   landen. Die reglose Figur liegt zunächst nah unter der Kamera; dann fährt der Blick
   senkrecht nach oben, bis Teppich, Zimmerkanten und Körper zur Totalen werden.
   `prefers-reduced-motion` → direkt der Endzustand.
   Test-Hooks: window.__teppich.{film,gefallen}. */

const setzeHook = (patch) => { try { window.__teppich = { ...(window.__teppich || {}), ...patch }; } catch { /* */ } };

export function Teppich({ filme = [], onClose, reduced = false, herkunftVon, onZeigeEintrag }) {
  const film = useMemo(() => (filme.length ? filme[Math.floor(Math.random() * filme.length)] : null), [filme]);
  const [gefallen, setGefallen] = useState(reduced);

  useEffect(() => {
    setzeHook({ film: film ? (film.titel || "") : "", gefallen: reduced });
    if (!film) { if (onClose) onClose(); return; }
    if (reduced) return;
    const t = setTimeout(() => { setGefallen(true); setzeHook({ gefallen: true }); }, 1500);
    return () => clearTimeout(t);
  }, [film, reduced, onClose]);

  if (!film) return null;
  const h = herkunftVon ? herkunftVon(film) : null;

  return (
    <div className="kd-teppich-scrim" role="dialog" aria-label="Der Teppich" onClick={gefallen ? onClose : undefined}>
      <div className="kd-teppich-flausch" aria-hidden="true" />
      <div className={"kd-teppich-zimmer" + (gefallen ? " weit" : "")} aria-hidden="true" />
      <svg className={"kd-teppich-figur" + (gefallen ? " weit" : "")} viewBox="0 0 280 660" aria-hidden="true">
        <ellipse className="kd-teppich-schatten" cx="112" cy="330" rx="116" ry="303" />
        <path className="kd-teppich-hose" d="M80 422 C79 501 57 572 48 650 H119 L142 462 L159 650 H230 C220 563 201 497 198 423 Z" />
        <path className="kd-teppich-hemd" d="M70 181 C93 157 118 148 140 148 C165 148 193 160 214 185 L205 428 C170 448 109 450 72 427 Z" />
        <path className="kd-teppich-arm" d="M76 194 C47 249 30 318 21 403 C18 425 30 440 43 420 L87 273 Z M207 194 C231 249 247 315 258 401 C261 424 249 439 236 420 L194 271 Z" />
        <path className="kd-teppich-kragen" d="M103 166 L138 214 L91 192 Z M177 165 L140 214 L191 191 Z" />
        <path className="kd-teppich-krawatte" d="M136 199 L148 199 L154 224 L143 329 L129 225 Z" />
        <ellipse className="kd-teppich-kopf" cx="140" cy="99" rx="65" ry="78" />
        <path className="kd-teppich-haar" d="M80 100 C77 44 103 16 144 17 C189 18 211 53 204 106 C188 63 159 47 121 55 C101 60 88 75 80 100 Z" />
        <path className="kd-teppich-gesicht" d="M106 96 Q119 88 131 98 M150 98 Q164 88 177 96 M139 102 L135 126 L145 128 M126 147 Q141 158 157 146" />
        <circle className="kd-teppich-pupille" cx="120" cy="99" r="3" /><circle className="kd-teppich-pupille" cx="162" cy="99" r="3" />
        <path className="kd-teppich-zigarette" d="M154 149 L188 158" />
      </svg>
      <div className={"kd-teppich-karte" + (gefallen ? " da" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="kd-teppich-kicker">Choose life. Choose a Film.</div>
        <div className="kd-teppich-titel">{film.titel}</div>
        <p className="kd-teppich-jahr">{film.jahr ? film.jahr + " · " : ""}Du bist auf dem Teppich gelandet.</p>
        {h && h.text && <p className="kd-teppich-verf">{h.text}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
          {onZeigeEintrag && <button onClick={() => onZeigeEintrag(film, h ? h.tab : "mediathek")} style={btnStyle(true)}>Zum Eintrag</button>}
          <button onClick={onClose} style={btnStyle(false)}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

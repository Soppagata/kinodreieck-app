import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { btnStyle } from "../lib/tokens.js";

/* ---- Easter-Egg „A? B! C! D!…" — Das Cage-Alphabet (Block 3) ----
   Vampire's-Kiss-Stakkato: goldene Karte tippen → eskalierendes Buchstaben-
   Stakkato (Barlow, jeder Buchstabe größer/schiefer), landet auf einem VERFÜGBAREN
   Cage-Film mit dem Anfangsbuchstaben. Nur echte A–Z-Anfänge zählen (deutsche
   Titel wie „8MM"/„2 Millionen…" weichen auf den Originaltitel aus; hat keiner
   einen Buchstaben, fällt der Film raus). `prefers-reduced-motion` → direkt zum
   Ergebnis. Test-Hooks: window.__cage.{stakkato,ergebnis}. */

const setzeHook = (patch) => { try { window.__cage = { ...(window.__cage || {}), ...patch }; } catch { /* */ } };

/* Liefert {b, titel} — den A–Z-Anfangsbuchstaben und den dazu passenden Titel
   (bevorzugt der angezeigte titel; sonst der originaltitel). null = kein Buchstabe. */
function buchstabeUndTitel(f) {
  const tA = (f.titel || "").trim(), tB = (f.originaltitel || "").trim();
  const a = tA.charAt(0).toUpperCase(), b = tB.charAt(0).toUpperCase();
  if (a >= "A" && a <= "Z") return { b: a, titel: tA, jahr: f.jahr, film: f };
  if (b >= "A" && b <= "Z") return { b, titel: tB, jahr: f.jahr, film: f };
  return null;
}

export function CageAlphabet({ filme = [], onClose, reduced = false, herkunftVon, onZeigeEintrag }) {
  const [phase, setPhase] = useState("karte");   // karte | stakkato | ergebnis
  const [flash, setFlash] = useState(null);       // { b, i }
  const [treffer, setTreffer] = useState(null);   // { b, titel, jahr }
  const timers = useRef([]);

  const proBuchstabe = useMemo(() => {
    const m = new Map();
    for (const f of filme) {
      const e = buchstabeUndTitel(f);
      if (!e) continue;
      if (!m.has(e.b)) m.set(e.b, []);
      m.get(e.b).push(e);
    }
    return m;
  }, [filme]);
  const buchstaben = useMemo(() => [...proBuchstabe.keys()].sort(), [proBuchstabe]);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clear(), []);

  const waehleTreffer = useCallback(() => {
    if (!buchstaben.length) return null;
    const b = buchstaben[Math.floor(Math.random() * buchstaben.length)];
    const pool = proBuchstabe.get(b);
    return pool[Math.floor(Math.random() * pool.length)];
  }, [buchstaben, proBuchstabe]);

  const landung = useCallback((e) => {
    setTreffer(e); setPhase("ergebnis");
    setzeHook({ ergebnis: e ? (e.titel || "") : "" });
  }, []);

  const start = useCallback(() => {
    setPhase((p) => {
      if (p !== "karte") return p;
      const ziel = waehleTreffer();
      if (!ziel) { if (onClose) onClose(); return p; }
      if (reduced) { landung(ziel); return "ergebnis"; }
      const N = 15;
      let i = 0;
      setzeHook({ stakkato: 0 });
      const step = () => {
        const last = i >= N - 1;
        const b = last ? ziel.b : buchstaben[Math.floor(Math.random() * buchstaben.length)];
        setFlash({ b, i });
        setzeHook({ stakkato: i + 1 });
        i++;
        if (last) { timers.current.push(setTimeout(() => landung(ziel), 420)); return; }
        const t = 150 - (150 - 55) * (i / N);   // 150 → 55 ms, beschleunigend
        timers.current.push(setTimeout(step, t));
      };
      step();
      return "stakkato";
    });
  }, [waehleTreffer, reduced, landung, buchstaben, onClose]);

  const schliessen = () => { clear(); if (onClose) onClose(); };

  return (
    <div className="kd-cage-scrim" role="dialog" aria-label="Cage-Alphabet"
      style={{ position: "fixed", inset: 0, zIndex: 11200, display: "flex", alignItems: "center", justifyContent: "center", padding: 22, background: "rgba(10,8,4,0.78)" }}
      onClick={phase === "ergebnis" ? schliessen : undefined}>
      <div className="kd-cage-karte"
        onClick={(e) => { e.stopPropagation(); if (phase === "karte") start(); }}
        style={{ position: "relative", width: "100%", maxWidth: 360, minHeight: 300, borderRadius: 14, padding: "30px 26px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, cursor: phase === "karte" ? "pointer" : "default" }}>

        {phase === "karte" && (
          <>
            <div className="kd-cage-titel" style={{ fontSize: 44 }}>A? B! C! D!…</div>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: "#3A2A08", margin: 0, lineHeight: 1.6 }}>Ein Buchstabe. Ein Cage. Tippen.</p>
          </>
        )}

        {phase === "stakkato" && flash && (
          <div className="kd-cage-flash" style={{ fontSize: Math.min(150, 64 + flash.i * 6), transform: `rotate(${(flash.i % 2 ? -1 : 1) * (2 + flash.i * 0.8)}deg)` }}>{flash.b}</div>
        )}

        {phase === "ergebnis" && treffer && (() => {
          const h = herkunftVon ? herkunftVon(treffer.film) : null;
          return (
            <>
              <div className="kd-cage-flash" style={{ fontSize: 108 }}>{treffer.b}</div>
              <div className="kd-cage-titel" style={{ fontSize: 24, lineHeight: 1.12 }}>{treffer.titel}</div>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#3A2A08", margin: "2px 0 0" }}>{treffer.jahr ? treffer.jahr + " · " : ""}Er kann alles sein.</p>
              {h && h.text && <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A4212", margin: "7px 0 0", letterSpacing: ".02em" }}>{h.text}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
                {onZeigeEintrag && <button onClick={() => onZeigeEintrag(treffer.film, h ? h.tab : "mediathek")} style={{ ...btnStyle(true), background: "#2A1E06", color: "#F3D072" }}>Zum Eintrag</button>}
                <button onClick={schliessen} style={{ ...btnStyle(false), borderColor: "#5A4212", color: "#2A1E06" }}>Schließen</button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

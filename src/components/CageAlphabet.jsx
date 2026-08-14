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

const istFokusziel = (node) => {
  if (!(node instanceof HTMLElement) || node.disabled || node.hidden) return false;
  if (node.getAttribute("tabindex") === "-1") return false;
  const style = window.getComputedStyle(node);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return true;
};

export function CageAlphabet({ filme = [], onClose, reduced = false, herkunftVon, onZeigeEintrag }) {
  const [phase, setPhase] = useState("karte");   // karte | stakkato | ergebnis
  const [flash, setFlash] = useState(null);       // { b, i }
  const [treffer, setTreffer] = useState(null);   // { b, titel, jahr }
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const aufrufRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const dismissed = useRef(false);
  const onCloseRef = useRef(onClose);
  const timers = useRef([]);
  const gestartet = useRef(false);

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

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  onCloseRef.current = onClose;

  useEffect(() => {
    aufrufRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      clear();
    };
  }, []);

  const focusTargets = useCallback(() => {
    if (!panelRef.current) return [];
    return [...panelRef.current.querySelectorAll("button")].filter(istFokusziel);
  }, []);

  const restoreFocus = useCallback(() => {
    const ausloeser = aufrufRef.current;
    if (ausloeser && document.body.contains(ausloeser)) {
      ausloeser.focus({ preventScroll: true });
    }
  }, []);

  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    clear();
    gestartet.current = false;
    restoreFocus();
    if (onCloseRef.current) onCloseRef.current();
  }, [restoreFocus]);

  const waehleTreffer = useCallback(() => {
    if (!buchstaben.length) return null;
    const b = buchstaben[Math.floor(Math.random() * buchstaben.length)];
    const pool = proBuchstabe.get(b);
    return pool[Math.floor(Math.random() * pool.length)];
  }, [buchstaben, proBuchstabe]);

  const landung = useCallback((e) => {
    if (dismissed.current) return;
    setTreffer(e);
    setPhase("ergebnis");
    setzeHook({ ergebnis: e ? (e.titel || "") : "" });
    gestartet.current = false;
  }, []);

  const start = useCallback(() => {
    if (phase !== "karte" || gestartet.current || dismissed.current) return;
    gestartet.current = true;
    const ziel = waehleTreffer();
    if (!ziel) {
      dismiss();
      return;
    }
    if (reduced) {
      landung(ziel);
      return;
    }
    setPhase("stakkato");
    const N = 15;
    let i = 0;
    setzeHook({ stakkato: 0 });
    const step = () => {
      if (dismissed.current) return;
      const last = i >= N - 1;
      const b = last ? ziel.b : buchstaben[Math.floor(Math.random() * buchstaben.length)];
      setFlash({ b, i });
      setzeHook({ stakkato: i + 1 });
      i++;
      if (last) {
        timers.current.push(setTimeout(() => {
          if (!dismissed.current) landung(ziel);
        }, 420));
        return;
      }
      const t = 150 - (150 - 55) * (i / N);   // 150 → 55 ms, beschleunigend
      timers.current.push(setTimeout(step, t));
    };
    step();
  }, [phase, waehleTreffer, reduced, landung, buchstaben, dismiss]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;

      const fokusziele = focusTargets();
      if (!fokusziele.length) {
        event.preventDefault();
        return;
      }
      const current = document.activeElement;
      const index = fokusziele.indexOf(current);
      const next = event.shiftKey
        ? (index <= 0 ? fokusziele[fokusziele.length - 1] : fokusziele[index - 1])
        : (index === -1 || index === fokusziele.length - 1 ? fokusziele[0] : fokusziele[index + 1]);
      event.preventDefault();
      next.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [dismiss, focusTargets]);

  useEffect(() => {
    if (dismissed.current) return;
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [phase]);

  const schliessen = useCallback((event) => {
    event?.stopPropagation();
    event?.preventDefault();
    dismiss();
  }, [dismiss]);

  const closeButtonStyle = useMemo(() => ({
    ...btnStyle(false),
    minWidth: 44,
    minHeight: 44,
    borderColor: "#5A4212",
    color: "#2A1E06",
  }), []);

  return (
    <div className="kd-cage-scrim" role="dialog" aria-label="Cage-Alphabet" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 11200, display: "flex", alignItems: "center", justifyContent: "center", padding: 22, background: "rgba(10,8,4,0.78)" }}
      onClick={schliessen}>
      <div className="kd-cage-karte" ref={panelRef}
        onClick={(e) => { e.stopPropagation(); if (phase === "karte") start(); }}
        style={{ position: "relative", width: "100%", maxWidth: 360, minHeight: 300, borderRadius: 14, padding: "30px 26px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, cursor: phase === "karte" ? "pointer" : "default" }}>

        {phase !== "ergebnis" && (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={schliessen}
            style={{ ...closeButtonStyle, position: "absolute", top: 10, right: 10 }}
          >
            Schließen
          </button>
        )}

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
                {onZeigeEintrag && <button type="button" onClick={() => onZeigeEintrag(treffer.film, h ? h.tab : "mediathek")} style={{ ...btnStyle(true), background: "#2A1E06", color: "#F3D072" }}>Zum Eintrag</button>}
                <button ref={closeButtonRef} type="button" onClick={schliessen} style={closeButtonStyle}>Schließen</button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

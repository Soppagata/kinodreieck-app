import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { T, btnStyle } from "../lib/tokens.js";
import { boxPlatzierung } from "../lib/tourbox.js";

/* ---------- TourOverlay (Tutorial Teil A, Phase 3) ----------
   Spotlight für Just-in-Time-Hinweise — jetzt DIREKT am Element:
   - Der Rahmen + das Dimmen ringsum sind ein box-shadow AUF dem Ziel-Element
     selbst ("0 0 0 3px ring, 0 0 0 9999px dim"). Dadurch sitzt der Rahmen per
     Konstruktion exakt am Element — keine getBoundingClientRect-Messung, kein
     Koordinaten-/Zoom-/Scroll-Versatz mehr (der alte SVG-Overlay-Weg sass daneben).
   - Ein transparenter Klick-Fänger (über dem Element, unter der Textbox) friert
     die Interaktion ein; Klick daneben schliesst (ausser Wächter, keinEscape).
   - Genau EINE Textbox, ein Absatz pro Ziel. Fest hell, unabhängig vom Theme.
   - Fokus wandert in die Box und bleibt gefangen (Tab). Escape schliesst (ausser
     Wächter). Ziel fehlt -> onClose({skip:true}). */

const Z_ELEMENT = 100000, Z_FANG = 100001, Z_BOX = 100002;

export function TourOverlay({ hinweis, onClose, onExport }) {
  const ziele = hinweis.absaetze.map((a) => a.ziel);
  const [boxStil, setBoxStil] = useState(null);
  const boxRef = useRef(null);
  const restore = useRef([]);

  useEffect(() => {
    const els = ziele.map((z) => document.querySelector('[data-tour="' + z + '"]')).filter(Boolean);
    if (!els.length) { onClose({ skip: true }); return; }
    const dim = "rgba(23,21,26,0.84)";
    const ring = hinweis.gefahr ? T.gefahr : T.wolfram;
    // Spotlight direkt aufs Element hängen (aligned by construction).
    restore.current = els.map((el) => {
      const prev = { position: el.style.position, zIndex: el.style.zIndex, boxShadow: el.style.boxShadow, borderRadius: el.style.borderRadius, transition: el.style.transition, width: el.style.width, maxWidth: el.style.maxWidth };
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      el.style.zIndex = String(Z_ELEMENT);
      if (!el.style.borderRadius) el.style.borderRadius = "6px";
      // Breite auf den Inhalt schrumpfen — aber NUR, wenn der Inhalt die Breite
      // nicht ohnehin füllt. Sonst (flex:1-Kind wie das Kino-Suchfeld, oder
      // justify-content: space-between wie im Blog-Header) würde fit-content das
      // Layout verschieben und den Button aus seiner Position ziehen. Voll
      // gefüllte Zeilen behalten ihre Breite (dort ist der volle Rahmen korrekt);
      // schmale Button-Reihen (Mediathek/Streaming) schrumpfen sauber auf ihre Buttons.
      const cs = getComputedStyle(el);
      const fuelltBreite = /space-|center|end|right/.test(cs.justifyContent || "")
        || [...el.children].some((c) => parseFloat(getComputedStyle(c).flexGrow || "0") > 0);
      if (!fuelltBreite) { el.style.width = "fit-content"; el.style.maxWidth = "100%"; }
      // Ring mit Luft: ~9px Abstand (gedimmt), dann 3px Ring, dann Dimmen ringsum.
      el.style.boxShadow = "0 0 0 9px " + dim + ", 0 0 0 12px " + ring + ", 0 0 0 9999px " + dim;
      el.style.transition = "box-shadow .15s ease";
      return { el, prev };
    });

    // Textbox platzieren. Nur die Box nutzt noch Koordinaten (der Rahmen sitzt
    // per Konstruktion). Box liegt AUSSERHALB des Rahmens; echte Höhe gemessen,
    // damit sie nur bei fehlendem Platz (Streaming-Quellen) in die Ecke geht.
    const platziere = (sichtbar = true) => {
      const r = els[0].getBoundingClientRect();
      const vh = window.innerHeight || 800, vw = window.innerWidth || 400;
      const basis = {
        position: "fixed", width: Math.min(400, vw - 24), maxWidth: "calc(100vw - 24px)", maxHeight: "70vh", overflowY: "auto",
        background: "#ECE8DF", color: "#1C1A1E", border: "2px solid " + ring, borderRadius: 6,
        padding: "18px 20px", boxShadow: "0 12px 48px rgba(0,0,0,0.55)", zIndex: Z_BOX,
        visibility: sichtbar ? "visible" : "hidden",
      };
      const boxH = (boxRef.current && boxRef.current.offsetHeight) || (150 + hinweis.absaetze.length * 74); // gemessen, sonst geschätzt
      const p = boxPlatzierung(r, vh, boxH);
      const stil = p.modus === "ecke"
        ? { ...basis, top: 16, right: 16 } // Element füllt den Viewport -> Ecke (nur Streaming-Quellen)
        : { ...basis, left: "50%", transform: "translateX(-50%)", top: p.top };
      setBoxStil(stil);
    };
    // Erst mit Schätzhöhe unsichtbar rendern, dann real gemessen sichtbar setzen (kein Springen).
    const raf = requestAnimationFrame(() => { platziere(false); requestAnimationFrame(() => platziere(true)); });
    const onRe = () => platziere(true);
    window.addEventListener("resize", onRe);
    window.addEventListener("scroll", onRe, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onRe);
      window.removeEventListener("scroll", onRe, true);
      restore.current.forEach(({ el, prev }) => {
        el.style.position = prev.position; el.style.zIndex = prev.zIndex;
        el.style.boxShadow = prev.boxShadow; el.style.borderRadius = prev.borderRadius; el.style.transition = prev.transition;
        el.style.width = prev.width; el.style.maxWidth = prev.maxWidth;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fokus in die Box + Fokus-Falle
  useEffect(() => {
    if (!boxStil) return;
    const box = boxRef.current; if (!box) return;
    const focusables = () => [...box.querySelectorAll("button, [href], input, [tabindex]")].filter((e) => !e.disabled);
    const f = focusables(); if (f.length) f[f.length - 1].focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !hinweis.keinEscape) { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab") {
        const list = focusables(); if (!list.length) return;
        const erst = list[0], letzt = list[list.length - 1];
        if (e.shiftKey && document.activeElement === erst) { e.preventDefault(); letzt.focus(); }
        else if (!e.shiftKey && document.activeElement === letzt) { e.preventDefault(); erst.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [boxStil, hinweis.keinEscape, onClose]);

  if (!boxStil) return null;

  return createPortal(
    <div className="kd-tour">
      {/* Klick-Fänger: über dem hervorgehobenen Element, unter der Box. Fängt alle
          Klicks (Freeze). Klick daneben schliesst, ausser beim Wächter. */}
      <div onClick={() => { if (!hinweis.keinEscape) onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: Z_FANG, cursor: hinweis.keinEscape ? "default" : "pointer" }} />
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label={hinweis.titel} style={boxStil}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "0.04em", textTransform: "uppercase", color: hinweis.gefahr ? T.gefahr : "#1C1A1E", marginBottom: 10 }}>
          {hinweis.titel}
        </div>
        {hinweis.absaetze.map((a, i) => (
          <p key={i} style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, lineHeight: 1.6, margin: i ? "10px 0 0" : "0", color: "#1C1A1E" }}>{a.text}</p>
        ))}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
          {hinweis.export && onExport && (
            <button onClick={() => { onExport(); onClose(); }}
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", padding: "9px 16px", borderRadius: 4, border: "none", background: T.gefahr, color: "#fff", cursor: "pointer" }}>Jetzt exportieren</button>
          )}
          <button onClick={() => onClose()}
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", padding: "9px 16px", borderRadius: 4, border: "1px solid #1C1A1E", background: "transparent", color: "#1C1A1E", cursor: "pointer" }}>Verstanden</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

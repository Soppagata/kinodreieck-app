import { useState, useEffect, useRef } from "react"; // KD-028
import { createPortal } from "react-dom";
import { T, btnStyle } from "../lib/tokens.js";
import { DreieckRegler } from "./DreieckRegler.jsx";

/* ---------- Willkommen (Tutorial Teil A, Phase 2) ----------
   Einmalig nach abgeschlossener Einrichtung: zwei Karten, mittig, kein
   Spotlight. Erklärt NUR das Dreieck — das Modell, auf dem die App steht.
   Karte 2 ist interaktiv: drei Regler verziehen live das Dreieck (DreieckRegler,
   auch auf dem Dashboard eingebunden), darunter folgt die Kategorie. */

export function Willkommen({ onClose }) {
  const [karte, setKarte] = useState(1);
  const dialogRef = useRef(null); // KD-028
  // KD-028: Fokus-Eintritt + Fokus-Falle + Escape + Fokus-Rückgabe (Muster aus TourOverlay)
  useEffect(() => {
    const el = dialogRef.current; if (!el) return;
    const vorherFokus = document.activeElement;
    const focusables = () => [...el.querySelectorAll("button, [href], input, [tabindex]")].filter((n) => !n.disabled);
    const f = focusables(); if (f.length) f[0].focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); if (onClose) onClose(); return; }
      if (e.key === "Tab") {
        const list = focusables(); if (!list.length) return;
        const erst = list[0], letzt = list[list.length - 1];
        if (!el.contains(document.activeElement)) { e.preventDefault(); erst.focus(); return; }
        if (e.shiftKey && document.activeElement === erst) { e.preventDefault(); letzt.focus(); }
        else if (!e.shiftKey && document.activeElement === letzt) { e.preventDefault(); erst.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (vorherFokus && vorherFokus.focus) vorherFokus.focus(); // Fokus-Rückgabe
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlay = {
    position: "fixed", inset: 0, zIndex: 10001, background: "rgba(23,21,26,0.9)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto",
  };
  const box = {
    background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 8,
    maxWidth: 560, width: "100%", padding: "26px 28px", boxShadow: "0 10px 48px rgba(0,0,0,0.6)",
    maxHeight: "90dvh", overflowY: "auto", overscrollBehavior: "contain",
  };
  const h = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.04em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 14px" };
  const p = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, color: T.leinwand, lineHeight: 1.7, margin: "0 0 12px" };

  return createPortal(
    <div ref={dialogRef} style={overlay} role="dialog" aria-modal="true" aria-label="Willkommen bei Kinodreieck">
      <div style={box}>
        {karte === 1 ? (
          <>
            <h2 style={h}>Willkommen bei Kinodreieck.</h2>
            <p style={p}>Die App gleicht das Wiener Kinoprogramm gegen deine Liste ab, verwaltet deinen Bestand und schlägt dir vor, was zu dir passt.</p>
            <p style={p}>Bevor du losläufst, ein Blick auf das Modell dahinter — es steckt im Namen und taucht überall wieder auf. Danach erklärt sich die App von selbst: Hinweise erscheinen genau dann, wenn du das erste Mal an der passenden Stelle stehst.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button style={btnStyle(true)} onClick={() => setKarte(2)}>Weiter</button>
            </div>
          </>
        ) : (
          <>
            <h2 style={h}>Das Dreieck</h2>
            <p style={p}>Jeder Eintrag bekommt drei Werte von 0 bis 5. Zusammen ergeben sie kein Urteil, sondern ein Profil.</p>

            <div style={{ background: T.saal, borderRadius: 6, padding: "18px 18px 14px", margin: "4px 0 16px" }}>
              <DreieckRegler start={{ wie: 4, was: 2, warum: 5 }} scale={2.1} size={54} />
            </div>

            <p style={{ ...p, margin: "0 0 10px" }}><strong style={{ color: T.wie }}>WIE — wie ist es gemacht?</strong><br />Alles Handwerkliche und Ästhetische. Kameraarbeit, Schnitt, Szenenbild, Ton, Licht. Wie sich der Film anfühlt, bevor er irgendetwas erzählt hat. Ein Film kann hier stark sein und sonst fast nichts anbieten — das ist kein Widerspruch, das ist eine Schlagseite.</p>
            <p style={{ ...p, margin: "0 0 10px" }}><strong style={{ color: T.was }}>WAS — was erzählt es?</strong><br />Der Stoff selbst. Handlung, Figuren, Dialoge, das Universum, das aufgemacht wird, und wie tief es trägt. Hier entscheidet sich, ob ein Film etwas zu sagen hat — nicht, ob er es schön sagt.</p>
            <p style={{ ...p, margin: "0 0 10px" }}><strong style={{ color: T.warum }}>WARUM — warum sollte man ihn gesehen haben?</strong><br />Seine filmhistorische und popkulturelle Relevanz: Was hat er geprägt, ermöglicht oder ikonisch gemacht? Wie oft wird er zitiert, weitergedacht oder als Bezugspunkt gebraucht? Persönliche Bedeutung darf mitschwingen, bleibt aber ein Nebenfaktor.</p>
            <p style={{ ...p, margin: "0 0 10px" }}><strong>Wichtig:</strong> Eine 0 heißt nicht „schlecht“. Sie heißt nur, dass diese Achse kaum ausgeprägt ist. Beim WARUM reicht die Skala von keiner erkennbaren Folgewirkung bis zum grundlegenden, kanonischen Werk.</p>
            <p style={{ ...p, margin: "0 0 10px" }}><strong>Und: Schlagseite schlägt Ausgewogenheit.</strong> Ein Film mit 1/1/5 kann als kultureller Bezugspunkt entscheidender sein als ein rundes 3/3/3.</p>
            <p style={p}>Die <strong>Kategorie</strong> darunter tippst du nicht ein — sie folgt aus den drei Werten. Zieh die Regler und sieh zu.</p>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <button style={{ ...btnStyle(false), fontSize: 13, padding: "8px 14px" }} onClick={() => setKarte(1)}>Zurück</button>
              <button style={btnStyle(true)} onClick={onClose}>Los geht's</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

import { useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { Logo } from "./ui.jsx";
import { DreieckRegler } from "./DreieckRegler.jsx";
import { HILFE_BEREICHE } from "../lib/hilfeInhalte.js";

/* ================= Erklärstücke =================
   Hero („LOKALE FILM-PLATTFORM"), Dreieck-Erklärung (eine Karte pro Ecke)
   und die eingebaute Anleitung (DokuAnsicht). Sie liegen hinter dem
   „Über"-Einstieg in den Einstellungen, weil das Start-Dashboard die
   Erklärinhalte nicht selbst trägt.
   Styles werden pro Render berechnet (T ist theme-reaktiv). */

const h2Of = () => ({ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 10px" });
const monoOf = () => ({ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch });

export const ECKEN = [
  {
    achse: "WIE", frage: "Wie ist es gemacht?",
    farbe: (t) => t.wie,
    text: "Das Handwerk: Regie, Kamera, Schnitt, Schauspiel, Ton. Ein Film kann inhaltlich banal sein und trotzdem meisterhaft gebaut — das WIE misst genau das, unabhängig vom Stoff.",
  },
  {
    achse: "WAS", frage: "Was erzählt es?",
    farbe: (t) => t.was,
    text: "Die Substanz: Stoff, Ideen, Themen, Fallhöhe. Trägt die Geschichte? Hat sie etwas zu sagen? Das WAS bewertet den Gehalt — auch wenn die Umsetzung wackelt.",
  },
  {
    achse: "WARUM", frage: "Warum sollte man ihn gesehen haben?",
    farbe: (t) => t.warum,
    text: "Die Relevanz: Einfluss auf spätere Filme, Genres, Karrieren und Bildsprachen — oder darauf, was Popkultur bis heute zitiert und weitererzählt. Persönliche Bedeutung darf ergänzen, ersetzt diese Wirkung aber nicht.",
  },
];

/* ---- Hero ---- */
export function ErklaerHero() {
  const mono = monoOf();
  return (
    <div style={{ textAlign: "center", padding: "34px 16px 10px", position: "relative" }}>
      <div style={{ display: "inline-block", margin: "8px 0 30px", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.45))" }}>
        <Logo size={132} />
      </div>
      <div style={{ ...mono, letterSpacing: "0.3em", color: T.rauch, marginBottom: 8 }}>LOKALE FILM-PLATTFORM</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "clamp(38px, 8vw, 46px)", letterSpacing: "0.14em", textTransform: "uppercase", lineHeight: 1 }}>
        Kinodreieck
      </div>
      <div style={{ width: 120, height: 2, margin: "16px auto 0", background: "linear-gradient(90deg, transparent, " + T.wolfram + ", transparent)" }} />
      <p style={{ fontSize: 15, color: T.leinwandTief, maxWidth: 520, margin: "18px auto 0", lineHeight: 1.65 }}>
        Deine Filme, dein Kino, dein Urteil — eine persönliche Plattform für Programm,
        Mediathek, Streaming und Entdecken. Deine Daten bleiben im Browser und können optional
        zwischen Geräten synchronisiert werden. Keine Telemetrie, kein Verkaufsalgorithmus.
      </p>
    </div>
  );
}

/* ---- Das Dreieck: eine Karte pro Ecke ---- */
export function DreieckErklaerung() {
  const h2 = h2Of(); const mono = monoOf();
  return (
    <div>
      <h2 style={h2}>Das Dreieck</h2>
      <p style={{ fontSize: 14, color: T.leinwandTief, margin: "0 0 12px", lineHeight: 1.6 }}>
        Jeder Film wird auf drei Achsen bewertet (je 0–5). Die Form des Dreiecks
        IST das Urteil — ein Blick zeigt, ob ein Film Können, Gehalt oder Relevanz ist.
      </p>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 330px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {ECKEN.map((e) => (
            <div key={e.achse} style={{ background: T.saalHoch, borderRadius: 6, padding: "14px 16px", borderLeft: "3px solid " + e.farbe(T) }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: "0.08em", color: e.farbe(T) }}>
                {e.achse}
              </div>
              <div style={{ ...mono, margin: "2px 0 8px", color: T.leinwandTief }}>{e.frage}</div>
              <p style={{ fontSize: 13, fontWeight: 400, color: T.leinwand, lineHeight: 1.6, margin: 0 }}>{e.text}</p>
            </div>
          ))}
        </div>
        {/* Rechts: interaktives Dreieck — Regler ziehen und die Form vergleichen */}
        <div style={{ flex: "1 1 320px", minWidth: 280, alignSelf: "stretch", background: T.saalHoch, borderRadius: 6, padding: "18px 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
          <DreieckRegler start={{ wie: 5, was: 2, warum: 4 }} scale={1.7} size={44} />
          <div style={{ ...mono, textAlign: "center", lineHeight: 1.6 }}>Zieh die Regler — jede Achse verändert die Form des Dreiecks.</div>
        </div>
      </div>
      <p style={{ ...mono, marginTop: 8 }}>
        Die drei Werte stehen unabhängig nebeneinander: WIE für die Machart, WAS für den Stoff und WARUM für die Wirkung. Das Dreieck macht ihr Verhältnis sichtbar, ohne daraus eine zusätzliche Kategorie abzuleiten.
      </p>
    </div>
  );
}

/* ---- „Über"-Einstieg für die Einstellungen: Hero, Dreieck, Anleitung. ---- */
export function UeberKinodreieck() {
  const [dokuOffen, setDokuOffen] = useState(false);
  const h2 = h2Of(); const mono = monoOf();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 16 }}>
      <ErklaerHero />
      <DreieckErklaerung />
      <div>
        <button style={btnStyle(false)} onClick={() => setDokuOffen(!dokuOffen)}>
          {dokuOffen ? "Anleitung zuklappen" : "Anleitung & Hilfe öffnen"}
        </button>
        {dokuOffen && <DokuAnsicht h2={h2} mono={mono} />}
      </div>
    </div>
  );
}

/* ---------- Eingebaute Anleitung ---------- */
export function DokuAnsicht({ h2, mono }) {
  return (
    <div className="kd-doku-hilfe">
      <section className="kd-doku-verzeichnis">
        <h2 style={h2}>Verzeichnis der Bereiche</h2>
        <p className="kd-doku-einleitung" style={mono}>
          Öffne einen Bereich für die ausführliche Beschreibung.
        </p>
        <div className="kd-doku-bereiche">
          {HILFE_BEREICHE.map((bereich) => (
            <details key={bereich.id} className="kd-doku-bereich" data-hilfe-ziel={bereich.ziel}>
              <summary>
                <h3>{bereich.titel}</h3>
              </summary>
              <div className="kd-doku-details">
                <p className="kd-doku-kurztext">{bereich.kurztext}</p>
                {bereich.details.map((text) => <p key={text}>{text}</p>)}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

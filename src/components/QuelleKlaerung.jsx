import { useState } from "react";
import { createPortal } from "react-dom";
import { T, btnStyle } from "../lib/tokens.js";
import { QuellenWahl } from "./QuellenWahl.jsx";
import { arrayZuQuelle } from "../lib/quellen.js";

/* ---------- Quellen-Klärung (nach KI-Import) ----------
   Die KI konnte für diese Titel keine sichere Quelle bestimmen. Der Nutzer
   entscheidet sie gesammelt (volle Combobox pro Titel). „Später" ist erlaubt —
   Ungeklärtes bleibt „Quelle offen" und taucht beim nächsten KI-Import wieder auf.
   Portal nach document.body (sonst verrutscht fixed im zoom-behafteten Wrapper). */
export function QuelleKlaerung({ eintraege, onFertig, onSpaeter }) {
  const [wahl, setWahl] = useState(() => Object.fromEntries(eintraege.map((e) => [e.id, []])));
  const setQ = (id, arr) => setWahl((w) => ({ ...w, [id]: arr }));

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Quellen klären"
      style={{ position: "fixed", inset: 0, zIndex: 100001, background: "rgba(23,21,26,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto" }}>
      <div style={{ background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 8, maxWidth: 620, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: "22px 24px", boxShadow: "0 12px 48px rgba(0,0,0,0.6)" }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 24, letterSpacing: "0.04em", textTransform: "uppercase", color: T.wolfram, marginBottom: 8 }}>
          Quellen klären ({eintraege.length})
        </div>
        <p style={{ fontSize: 14, color: T.leinwandTief, lineHeight: 1.6, margin: "0 0 16px" }}>
          Die KI konnte hier keine sichere Quelle bestimmen. Wähle, wo du den Titel hast — leer lassen = Wunschliste. Nicht Geklärtes bleibt „Quelle offen“ und kommt beim nächsten KI-Import wieder.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {eintraege.map((e) => (
            <div key={e.id} style={{ background: T.saal, borderRadius: 6, padding: "12px 14px" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 17, color: T.leinwand, marginBottom: 8 }}>
                {e.titel}{e.jahr ? " (" + e.jahr + ")" : ""}
              </div>
              <QuellenWahl quellen={wahl[e.id]} onChange={(arr) => setQ(e.id, arr)} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
          <button style={btnStyle(false)} onClick={onSpaeter}>Später</button>
          <button style={btnStyle(true)} onClick={() => onFertig(Object.fromEntries(eintraege.map((e) => [e.id, arrayZuQuelle(wahl[e.id])])))}>Übernehmen</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

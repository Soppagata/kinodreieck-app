import { useState } from "react";
import { T, btnStyle, lightInput } from "../lib/tokens.js";
import { BEWERTUNGSKATEGORIEN } from "../lib/kategorien.js";

/* ---------- Inline-Editor für Bewertungen ---------- */
export function EditPanel({ film, onSave, onCancel, autorName, herkunftHinweis = null }) { // KD-030: optionaler autorName
  // Rohstring im State: leeres Feld bleibt leer, kein erzwungenes 0
  const [wie, setWie] = useState(String(film.bewertung?.wie ?? ""));
  const [was, setWas] = useState(String(film.bewertung?.was ?? ""));
  const [warum, setWarum] = useState(String(film.bewertung?.warum ?? ""));
  const [kat, setKat] = useState(film.kategorie || (herkunftHinweis ? "" : "sehenswert"));
  const [beg, setBeg] = useState(film.begruendung || "");
  const [notiz, setNotiz] = useState(film.notiz || ""); // freies Feld, bei jedem Eintrag editierbar
  const onAxis = (set) => (e) => {
    const raw = e.target.value;
    if (raw === "") { set(""); return; }             // leer bleibt leer
    const n = Math.floor(Number(raw));
    if (Number.isNaN(n)) return;                      // Nicht-Zahlen ignorieren
    set(String(Math.max(0, Math.min(5, n))));         // nur 0–5
  };
  const toNum = (s) => (s === "" ? 0 : Number(s));    // erst beim Speichern casten
  /* Alle drei Achsen leer = unbewertet (bewertung null, keine Kategorie, kein
     bewertet_von). Sobald EINE Achse gesetzt ist, gilt leer = 0 wie bisher —
     der frühere stille 0/0/0-Default aus leeren Feldern ist damit weg. */
  const alleLeer = wie === "" && was === "" && warum === "";
  const prognoseUnvollstaendig = !!herkunftHinweis && (wie === "" || was === "" || warum === "" || !kat);
  const axisInput = (label, val, set, col) => (
    <label className="kd-edit-achse" style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "'Space Mono', monospace", fontSize: 11, color: col }}>
      {label}
      <input type="number" min="0" max="5" value={val} onChange={onAxis(set)} style={{ ...lightInput, width: 56 }} />
    </label>
  );
  return (
    <div className="kd-editpanel" onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, padding: "12px 12px", background: T.leinwandTief, borderRadius: 4, display: "flex", flexDirection: "column", gap: 10 }}>
      {herkunftHinweis && (
        <div role="status" style={{ padding: "8px 10px", borderLeft: `3px solid ${T.wolfram}`, background: T.saalHoch, color: T.leinwand, fontSize: 12, lineHeight: 1.5 }}>
          {herkunftHinweis}
        </div>
      )}
      <div className="kd-edit-werte" data-tour="bewertung-slider" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        {axisInput("WIE", wie, setWie, T.wie)}
        {axisInput("WAS", was, setWas, T.was)}
        {axisInput("WARUM", warum, setWarum, T.warum)}
        <label className="kd-edit-kategorie" style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>
          KATEGORIE
          <select value={kat} onChange={(e) => setKat(e.target.value)} style={{ ...lightInput, padding: "7px 6px" }}>
            {herkunftHinweis && <option value="">Kategorie auswählen …</option>}
            {BEWERTUNGSKATEGORIEN.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
      </div>
      <textarea value={beg} onChange={(e) => setBeg(e.target.value)} rows={3}
        placeholder="Begründung (in deiner Stimme, 1–3 Sätze)"
        style={{ ...lightInput, width: "100%", boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif" }} />
      <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={2}
        placeholder="Notiz (Edition, Fassung, Reihen-Abdeckung, Sehstand … — frei)"
        style={{ ...lightInput, width: "100%", boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif" }} />
      <div className="kd-edit-aktionen" style={{ display: "flex", gap: 8 }}>
        <button disabled={prognoseUnvollstaendig}
          style={{ ...btnStyle(true), fontSize: 14, padding: "7px 14px", opacity: prognoseUnvollstaendig ? 0.5 : 1 }}
          onClick={() => onSave(alleLeer
            ? { bewertung: null, kategorie: null, begruendung: beg, notiz, bewertet_von: null }
            : { bewertung: { wie: toNum(wie), was: toNum(was), warum: toNum(warum) }, kategorie: kat, begruendung: beg, notiz, bewertet_von: autorName || "max" /* KD-030 */ })}>
          {alleLeer ? "Als unbewertet speichern" : herkunftHinweis ? "Vorschlag übernehmen" : "Speichern"}
        </button>
        <button style={{ ...btnStyle(false), fontSize: 14, padding: "7px 14px", color: T.tinte, borderColor: T.tinteWeich }} onClick={onCancel}>
          Abbrechen
        </button>
      </div>
      <div className="kd-edit-hinweis" style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinteWeich }}>
        {prognoseUnvollstaendig
          ? "Zum Übernehmen müssen alle drei Achsen und die Kategorie geprüft und ausgefüllt sein."
          : alleLeer
          ? "Alle drei Achsen leer = Eintrag bleibt unbewertet (Kategorie wird ignoriert)."
          : "Speichern übernimmt deine Änderungen sofort."}
      </div>
    </div>
  );
}

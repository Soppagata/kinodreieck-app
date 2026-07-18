import { useState } from "react";
import { T, btnStyle, lightInput } from "../lib/tokens.js";

/* ---------- Inline-Editor für Bewertungen ---------- */
export function EditPanel({ film, onSave, onCancel }) {
  // Rohstring im State: leeres Feld bleibt leer, kein erzwungenes 0
  const [wie, setWie] = useState(String(film.bewertung?.wie ?? ""));
  const [was, setWas] = useState(String(film.bewertung?.was ?? ""));
  const [warum, setWarum] = useState(String(film.bewertung?.warum ?? ""));
  const [kat, setKat] = useState(film.kategorie || "sehenswert");
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
  const axisInput = (label, val, set, col) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "'Space Mono', monospace", fontSize: 11, color: col }}>
      {label}
      <input type="number" min="0" max="5" value={val} onChange={onAxis(set)} style={{ ...lightInput, width: 56 }} />
    </label>
  );
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, padding: "12px 12px", background: T.leinwandTief, borderRadius: 4, display: "flex", flexDirection: "column", gap: 10 }}>
      <div data-tour="bewertung-slider" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        {axisInput("WIE", wie, setWie, T.wie)}
        {axisInput("WAS", was, setWas, T.was)}
        {axisInput("WARUM", warum, setWarum, T.warum)}
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>
          KATEGORIE
          <select value={kat} onChange={(e) => setKat(e.target.value)} style={{ ...lightInput, padding: "7px 6px" }}>
            {["immer_gut", "kult", "kult_klassiker", "daemlich_aber_herrlich", "trash", "sehenswert", "echter_schrott"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      </div>
      <textarea value={beg} onChange={(e) => setBeg(e.target.value)} rows={3}
        placeholder="Begründung (in deiner Stimme, 1–3 Sätze)"
        style={{ ...lightInput, width: "100%", boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif" }} />
      <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={2}
        placeholder="Notiz (Edition, Fassung, Reihen-Abdeckung, Sehstand … — frei)"
        style={{ ...lightInput, width: "100%", boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ ...btnStyle(true), fontSize: 14, padding: "7px 14px" }}
          onClick={() => onSave(alleLeer
            ? { bewertung: null, kategorie: null, begruendung: beg, notiz, bewertet_von: null }
            : { bewertung: { wie: toNum(wie), was: toNum(was), warum: toNum(warum) }, kategorie: kat, begruendung: beg, notiz, bewertet_von: "max" })}>
          {alleLeer ? "Als unbewertet speichern" : "Speichern"}
        </button>
        <button style={{ ...btnStyle(false), fontSize: 14, padding: "7px 14px", color: T.tinte, borderColor: T.tinteWeich }} onClick={onCancel}>
          Abbrechen
        </button>
      </div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinteWeich }}>
        {alleLeer
          ? "Alle drei Achsen leer = Eintrag bleibt unbewertet (Kategorie wird ignoriert)."
          : 'Speichern setzt bewertet_von = "max". Export im Einstellungen-Tab hält deine JSON-Datei synchron.'}
      </div>
    </div>
  );
}

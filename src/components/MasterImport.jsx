import { useState } from "react";
import { btnStyle, inputStyle } from "../lib/tokens.js";
import { IconImport } from "./ui.jsx";
import { FeldHinweis } from "./FeldHinweis.jsx";

/* ---------- Import-Baustein (Master / Programm-Snapshot / Nonstop-HTML) ---------- */
export function MasterImport({ onImport, hasMaster, labelNeu, labelErsetzen, hinweis, accept }) {
  const [text, setText] = useState("");
  // KD-004: vorhandener Bestand (hasMaster) wird erst nach Rückfrage ersetzt. Der Master-/Artikel-Import
  // sichert App-seitig zusätzlich einen Rollback-Snapshot; hier die letzte Bestätigung vor dem Überschreiben.
  const sicherImport = (payload) => {
    if (hasMaster && typeof window !== "undefined" && !window.confirm("Der vorhandene Bestand wird ersetzt. Fortfahren?")) return;
    onImport(payload);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={hinweis || 'JSON hier einfügen ({"meta":…,"filme":[…]})'}
        rows={4}
        style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontFamily: "'Space Mono', monospace", fontSize: 12 }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button style={{ ...btnStyle(false), display: "inline-flex", alignItems: "center", gap: 7 }} onClick={() => text.trim() && sicherImport(text)}>
          <IconImport size={15} />{hasMaster ? (labelErsetzen || "Master ersetzen") : (labelNeu || "Master importieren")}
        </button>
        <FeldHinweis feld="import_datei" />
        <label style={{ ...btnStyle(false), display: "inline-block" }}>
          Datei wählen
          <input type="file" accept={accept || ".json"} style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const r = new FileReader();
              r.onload = () => sicherImport(String(r.result));
              r.readAsText(file);
            }} />
        </label>
      </div>
    </div>
  );
}

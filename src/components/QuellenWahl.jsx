import { useState, useId } from "react";
import { T, inputStyle } from "../lib/tokens.js";
import { Chip } from "./ui.jsx";
import { WUNSCH, quellenNachArt, keyVonLabel, quelleLabel } from "../lib/quellen.js";

/* ---------- QuellenWahl (wiederverwendbar) ----------
   Vorfilter physisch/virtuell + Combobox (Textfeld mit Datalist) zum Hinzufügen;
   gewählte Quellen als entfernbare Chips. Arbeitet auf einem Key-Array; keine
   Quelle = Wunschliste. Genutzt im Eintragsformular UND im Klärungs-Popup. */
export function QuellenWahl({ quellen, onChange }) {
  const [art, setArt] = useState("virtuell");
  const [eingabe, setEingabe] = useState("");
  const uid = useId();
  const dlId = "kd-ql-" + uid.replace(/[:]/g, "") + "-" + art;
  const gewaehlt = (quellen || []).filter((k) => k && k !== WUNSCH);

  const entfernen = (key) => onChange(gewaehlt.filter((k) => k !== key));
  const hinzu = (key) => { if (key && !gewaehlt.includes(key)) onChange([...gewaehlt, key]); setEingabe(""); };
  const onEingabe = (val) => { setEingabe(val); const key = keyVonLabel(val); if (key) hinzu(key); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {gewaehlt.map((k) => <Chip key={k} active onClick={() => entfernen(k)}>{quelleLabel(k)} ✕</Chip>)}
        {gewaehlt.length === 0 && <span style={{ fontSize: 12, color: T.rauch }}>keine gewählt = Wunschliste</span>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Chip active={art === "physisch"} onClick={() => { setArt("physisch"); setEingabe(""); }}>Physisch</Chip>
        <Chip active={art === "virtuell"} onClick={() => { setArt("virtuell"); setEingabe(""); }}>Virtuell</Chip>
        <input list={dlId} value={eingabe} onChange={(e) => onEingabe(e.target.value)}
          placeholder={(art === "physisch" ? "Format" : "Plattform") + " wählen/suchen …"}
          style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <datalist id={dlId}>{quellenNachArt(art).map((q) => <option key={q.key} value={q.label} />)}</datalist>
      </div>
    </div>
  );
}

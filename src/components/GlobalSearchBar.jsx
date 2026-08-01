import { useState } from "react";

const FILTER_BEREICHE = new Set(["kino", "mediathek", "streaming"]);
const LABELS = Object.freeze({
  start: "Alles", kino: "Kino", mediathek: "Mediathek", streaming: "Streaming",
  blog: "Blog", finder: "Alles", daten: "Settings",
});

export function GlobalSearchBar({ bereich, onSuchen }) {
  const [text, setText] = useState("");
  const [umfang, setUmfang] = useState("bereich");
  const hatKontext = !["start", "finder"].includes(bereich);
  const scope = umfang === "alles" || !hatKontext ? "alles" : bereich;
  const absenden = (event) => {
    event.preventDefault();
    const frage = text.trim();
    if (!frage) return;
    onSuchen?.({ text: frage, scope });
    setText("");
  };
  const filterOeffnen = () => {
    window.dispatchEvent(new CustomEvent("kd:toggle-bereichsfilter", { detail: { bereich } }));
  };

  return (
    <form className="kd-globalsuche" onSubmit={absenden} role="search" aria-label="Globale Suche">
      {hatKontext && (
        <select value={umfang} onChange={(event) => setUmfang(event.target.value)} aria-label="Suchbereich">
          <option value="bereich">{LABELS[bereich]}</option>
          <option value="alles">Alles</option>
        </select>
      )}
      <input value={text} onChange={(event) => setText(event.target.value)}
        aria-label="Sucheingabe"
        placeholder={bereich === "daten" ? "Wo finde ich …?" : `${LABELS[bereich] || "Alles"} durchsuchen …`} />
      {umfang === "bereich" && FILTER_BEREICHE.has(bereich) && (
        <button type="button" className="kd-globalsuche-filter" onClick={filterOeffnen}>Filter</button>
      )}
      <button type="submit" className="kd-globalsuche-los" aria-label="Suchen">⌕</button>
    </form>
  );
}

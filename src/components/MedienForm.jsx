import { useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";

/* ---------- Eingabemaske für Musik & Sonstiges ----------
   Bewusst schlicht: NUR Titel, Jahr, Art (Freitext, max 40), Beschreibung.
   Kein Dreieck, keine Film-Kategorien — eine CD braucht kein Rating.
   typ kommt vom aktiven Tab (musik|sonstiges), kein Dropdown. */
export function MedienForm({ typ, onAdd, initial = null, startOffen = false, onDone }) {
  const [open, setOpen] = useState(startOffen);
  const leer = {
    titel: (initial && initial.titel) || "",
    jahr: initial && initial.jahr ? String(initial.jahr) : "",
    art: "", beschreibung: "",
  };
  const [f, setF] = useState(leer);
  const [fehler, setFehler] = useState("");
  const [sub, setSub] = useState((initial && initial.sub) || ""); // Unterkategorie (nur Persönlichkeit)
  const kategorien = typ === "musik"
    ? ["Album", "Soundtrack", "Konzert", "Single", "Sonstiges"]
    : ["Persönlichkeit", "Studio", "Videospiel", "Theaterstück", "Interview", "Buch", "Podcast", "Sonstiges"];
  const rollen = ["Regisseur:In", "Schauspieler:In", "Komponist:In", "Drehbuch:In", "Sonstige"];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (!open) {
    return <button style={btnStyle(false)} onClick={() => setOpen(true)}>+ {typ === "musik" ? "Musik" : "Eintrag"} hinzufügen</button>;
  }
  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Titel *" value={f.titel} onChange={set("titel")} style={{ ...inputStyle, flex: 2, minWidth: 160 }} />
        <input placeholder="Jahr" value={f.jahr} onChange={set("jahr")} style={{ ...inputStyle, width: 80 }} />
        <select value={f.art} onChange={set("art")} title="Kategorie" style={{ ...inputStyle, flex: 2, minWidth: 180 }}>
          <option value="">Kategorie …</option>
          {kategorien.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        {f.art === "Persönlichkeit" && (
          <select value={sub} onChange={(e) => setSub(e.target.value)} title="Unterkategorie" style={{ ...inputStyle, width: "auto", minWidth: 150 }}>
            <option value="">Rolle …</option>
            {rollen.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
      <textarea placeholder={f.art === "Persönlichkeit" ? "Freitext (Rolle, Werke, Notizen …)" : "Beschreibung"} rows={2} value={f.beschreibung} onChange={set("beschreibung")}
        style={{ ...inputStyle, boxSizing: "border-box" }} />
      {fehler && <div style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btnStyle(true)} onClick={() => {
          if (!f.titel.trim()) { setFehler("Titel ist Pflicht."); return; }
          onAdd({
            titel: f.titel.trim(),
            jahr: f.jahr ? Number(f.jahr) : null,
            typ,
            art: f.art === "Persönlichkeit" ? ("Persönlichkeit" + (sub ? " · " + sub : "")) : (f.art || null),
            kategorie: f.art === "Persönlichkeit" ? "person" : (f.art === "Studio" ? "studio" : null),
            beschreibung: f.beschreibung.trim(),
            bewertung: { wie: null, was: null, warum: null }, // hart null — kein Dreieck
            bewertet_von: null,
          });
          setF(leer); setSub(""); setOpen(false); setFehler("");
          if (onDone) onDone();
        }}>Hinzufügen</button>
        <button style={btnStyle(false)} onClick={() => { setOpen(false); setFehler(""); if (onDone) onDone(); }}>Abbrechen</button>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { arrayZuQuelle, WUNSCH } from "../lib/quellen.js";
import { QuellenWahl } from "./QuellenWahl.jsx";

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
  const [speichert, setSpeichert] = useState(false);
  const speichertRef = useRef(false);
  const [sub, setSub] = useState((initial && initial.sub) || ""); // Unterkategorie (nur Persönlichkeit)
  const [quellen, setQuellen] = useState([]); // optional: Besitz/Verfügbarkeit (z.B. CD)
  const kategorien = typ === "musik"
    ? ["Album", "Soundtrack", "Konzert", "Single", "Sonstiges"]
    : ["Persönlichkeit", "Studio", "Videospiel", "Theaterstück", "Interview", "Buch", "Podcast", "Sonstiges"];
  const rollen = ["Regisseur:In", "Schauspieler:In", "Komponist:In", "Drehbuch:In", "Sonstige"];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const speichern = async () => {
    if (speichertRef.current) return;
    if (!f.titel.trim()) { setFehler("Titel ist Pflicht."); return; }
    speichertRef.current = true; setSpeichert(true);
    try {
      const q = arrayZuQuelle(quellen);
      const id = await onAdd({
        titel: f.titel.trim(),
        jahr: f.jahr ? Number(f.jahr) : null,
        typ,
        art: f.art === "Persönlichkeit" ? ("Persönlichkeit" + (sub ? " · " + sub : "")) : (f.art || null),
        kategorie: f.art === "Persönlichkeit" ? "person" : (f.art === "Studio" ? "studio" : null),
        beschreibung: f.beschreibung.trim(),
        ...(q !== WUNSCH ? { quelle: q } : {}),
        bewertung: { wie: null, was: null, warum: null },
        bewertet_von: null,
      });
      if (id === null || id === false || id === undefined) {
        setFehler("Eintrag konnte nicht bestätigt gespeichert werden; die Eingabe bleibt erhalten.");
        return;
      }
      setF(leer); setSub(""); setQuellen([]); setOpen(false); setFehler("");
      if (onDone) onDone();
    } catch (error) {
      setFehler(error?.message || "Eintrag konnte nicht gespeichert werden.");
    } finally { speichertRef.current = false; setSpeichert(false); }
  };

  if (!open) {
    return <button className="kd-mediathek-hinzufuegen" style={btnStyle(false)} onClick={() => setOpen(true)}>+ {typ === "musik" ? "Musik" : "Eintrag"} hinzufügen</button>;
  }
  return (
    <div className="kd-mediathek-neuformular" style={{ background: T.saalHoch, borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>Quelle (optional — z.B. CD für Besitz)</span>
        <QuellenWahl quellen={quellen} onChange={setQuellen} />
      </div>
      <textarea placeholder={f.art === "Persönlichkeit" ? "Freitext (Rolle, Werke, Notizen …)" : "Beschreibung"} rows={2} value={f.beschreibung} onChange={set("beschreibung")}
        style={{ ...inputStyle, boxSizing: "border-box" }} />
      {fehler && <div style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btnStyle(true)} disabled={speichert} onClick={() => void speichern()}>{speichert ? "Speichert …" : "Hinzufügen"}</button>
        <button style={btnStyle(false)} disabled={speichert} onClick={() => { setOpen(false); setFehler(""); if (onDone) onDone(); }}>Abbrechen</button>
      </div>
    </div>
  );
}

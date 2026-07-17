import { useState } from "react";
import { feuere } from "../lib/tour.js";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { hatDreieck } from "../lib/typen.js";
import { quelleZuArray, arrayZuQuelle } from "../lib/quellen.js";
import { QuellenWahl } from "./QuellenWahl.jsx";

/* ---------- Adaptive Eingabemaske ----------
   EIN Formular für alle Typen. Der Typ-Dropdown steuert die Felder:
   - Film / Serie  -> Dreieck-Bewertung (WIE/WAS/WARUM), Quelle, Genre, Begründung.
   - Musik / Sonstiges -> schlichte Maske (Art, ggf. Rolle, Beschreibung), KEIN Dreieck.
   Der Eintrag landet automatisch in der richtigen Gruppe (Zuordnung über typ).
   typOptionen kommt vom Aufrufer; der erste Eintrag ist der Default-Typ.
   Rückwärtskompatibel: nur bewertbare Typen -> reines Film-Formular wie zuvor. */
export function FilmForm({ typOptionen = ["film", "serie", "musik", "sonstiges"], onAdd, initial = null, startOffen = false, onDone }) {
  const [open, setOpen] = useState(startOffen);
  const leer = {
    titel: (initial && initial.titel) || "",
    jahr: initial && initial.jahr ? String(initial.jahr) : "",
    typ: typOptionen[0],
    // Film/Serie
    originaltitel: "", quellen: quelleZuArray(initial && initial.quelle), kategorie: "sehenswert",
    wie: 0, was: 0, warum: 0, genre: (initial && initial.genre) || "", begruendung: (initial && initial.begruendung) || "",
    // Musik/Sonstiges
    art: "", sub: "", beschreibung: "",
  };
  const [f, setF] = useState(leer);
  const [fehler, setFehler] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const clamp = (v) => Math.max(0, Math.min(5, Number(v) || 0));
  const bewertbar = hatDreieck(f.typ);
  const artOptionen = f.typ === "musik"
    ? ["Album", "Soundtrack", "Konzert", "Single", "Sonstiges"]
    : ["Persönlichkeit", "Studio", "Videospiel", "Theaterstück", "Interview", "Buch", "Podcast", "Sonstiges"];
  const rollen = ["Regisseur:In", "Schauspieler:In", "Komponist:In", "Drehbuch:In", "Sonstige"];

  if (!open) {
    return <button style={btnStyle(false)} onClick={() => { setOpen(true); feuere("eintrag"); }}>+ Eintrag hinzufügen</button>;
  }

  const speichern = () => {
    if (!f.titel.trim()) { setFehler("Titel ist Pflicht."); return; }
    if (bewertbar && !f.jahr) { setFehler("Jahr ist Pflicht (Schlüssel & Abgleich)."); return; }
    setFehler("");
    if (bewertbar) {
      onAdd({
        titel: f.titel.trim(),
        originaltitel: f.originaltitel.trim() || f.titel.trim(),
        jahr: Number(f.jahr),
        jahr_bis: null,
        typ: f.typ,
        quelle: arrayZuQuelle(f.quellen),
        kategorie: f.kategorie,
        bewertet_von: "max",
        bewertung: { wie: f.wie, was: f.was, warum: f.warum },
        genre: f.genre.split(",").map((g) => g.trim()).filter(Boolean),
        tags: [],
        begruendung: f.begruendung.trim(),
        notiz: (initial && initial.notiz) || "",
        status: "gesetzt",
      });
    } else {
      // Musik/Sonstiges — schlichte Struktur, hart kein Dreieck.
      onAdd({
        titel: f.titel.trim(),
        jahr: f.jahr ? Number(f.jahr) : null,
        typ: f.typ,
        art: f.art === "Persönlichkeit" ? ("Persönlichkeit" + (f.sub ? " · " + f.sub : "")) : (f.art || null),
        kategorie: f.art === "Persönlichkeit" ? "person" : (f.art === "Studio" ? "studio" : null),
        beschreibung: f.beschreibung.trim(),
        bewertung: { wie: null, was: null, warum: null },
        bewertet_von: null,
      });
    }
    setF(leer); setOpen(false); setFehler("");
    if (onDone) onDone();
  };

  return (
    <div data-tour="eintrag-form" style={{ background: T.saalHoch, borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Zeile 1: Titel, (Originaltitel nur bewertbar), Jahr */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Titel *" value={f.titel} onChange={set("titel")} style={{ ...inputStyle, flex: 2, minWidth: 160 }} />
        {bewertbar && <input placeholder="Originaltitel" value={f.originaltitel} onChange={set("originaltitel")} style={{ ...inputStyle, flex: 2, minWidth: 160 }} />}
        <input placeholder={bewertbar ? "Jahr *" : "Jahr"} value={f.jahr} onChange={set("jahr")} style={{ ...inputStyle, width: 80 }} />
      </div>

      {/* Zeile 2: Typ + typ-abhängige Felder */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={f.typ} onChange={set("typ")} style={{ ...inputStyle, padding: "9px 6px" }} title="Typ">
          {typOptionen.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {bewertbar ? (
          <>
            <select value={f.kategorie} onChange={set("kategorie")} style={{ ...inputStyle, padding: "9px 6px" }}>
              {["immer_gut", "kult", "kult_klassiker", "daemlich_aber_herrlich", "trash", "sehenswert", "echter_schrott"].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.wie }}>WIE</span>
            <input type="number" min="0" max="5" value={f.wie} onChange={(e) => setF({ ...f, wie: clamp(e.target.value) })} style={{ ...inputStyle, width: 54 }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.was }}>WAS</span>
            <input type="number" min="0" max="5" value={f.was} onChange={(e) => setF({ ...f, was: clamp(e.target.value) })} style={{ ...inputStyle, width: 54 }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.warum }}>WARUM</span>
            <input type="number" min="0" max="5" value={f.warum} onChange={(e) => setF({ ...f, warum: clamp(e.target.value) })} style={{ ...inputStyle, width: 54 }} />
            <input placeholder="Genres, kommagetrennt" value={f.genre} onChange={set("genre")} style={{ ...inputStyle, flex: 1, minWidth: 150 }} />
          </>
        ) : (
          <>
            <select value={f.art} onChange={set("art")} title="Kategorie" style={{ ...inputStyle, flex: 2, minWidth: 180 }}>
              <option value="">Kategorie …</option>
              {artOptionen.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            {f.art === "Persönlichkeit" && (
              <select value={f.sub} onChange={set("sub")} title="Rolle" style={{ ...inputStyle, width: "auto", minWidth: 150 }}>
                <option value="">Rolle …</option>
                {rollen.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </>
        )}
      </div>

      {/* Quelle: wiederverwendbare Wahl-Komponente (Vorfilter + Combobox + Chips). */}
      {bewertbar && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>Quelle</span>
          <QuellenWahl quellen={f.quellen} onChange={(arr) => setF({ ...f, quellen: arr })} />
        </div>
      )}

      {/* Zeile 3: Freitext (Begründung bei Film/Serie, sonst Beschreibung) */}
      {bewertbar ? (
        <textarea placeholder="Begründung (in deiner Stimme, 1–3 Sätze)" rows={2}
          value={f.begruendung} onChange={set("begruendung")} style={{ ...inputStyle, boxSizing: "border-box" }} />
      ) : (
        <textarea placeholder={f.art === "Persönlichkeit" ? "Freitext (Rolle, Werke, Notizen …)" : "Beschreibung"} rows={2}
          value={f.beschreibung} onChange={set("beschreibung")} style={{ ...inputStyle, boxSizing: "border-box" }} />
      )}

      {fehler && <div style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btnStyle(true)} onClick={speichern}>Hinzufügen</button>
        <button style={btnStyle(false)} onClick={() => { setOpen(false); setFehler(""); if (onDone) onDone(); }}>Abbrechen</button>
      </div>
    </div>
  );
}

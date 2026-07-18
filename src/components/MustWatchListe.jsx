import { useState, useMemo } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { norm } from "../lib/match.js";
import { Chip } from "./ui.jsx";

/* ---------- Must-Watch-Liste (eigener Datentopf, 10. Sync-Datei) ----------
   KEIN Filter über die Mediathek: eigene Einträge mit Titel · im Besitz ·
   Beschreibung · Notiz · optionaler Verknüpfung. Verknüpfen NUR über den
   expliziten Picker (Suchfeld + Klick) — kein Auto-Matching, nie.
   kommtVorIn: Blog-Backlinks (Must-Watch-Einträge sind referenzierbar). */

const ZIEL_LABEL = { master: "Mediathek", programm: "Kinoprogramm", streaming: "Streaming" };

/* Picker: durchsucht die drei Kandidaten-Gruppen per norm-Substring; Auswahl
   ausschließlich per Klick. Max 6 Treffer pro Gruppe. */
function VerknuepfungsPicker({ kandidaten, onWaehle, onAbbrechen }) {
  const [suche, setSuche] = useState("");
  const treffer = useMemo(() => {
    const nq = norm(suche);
    if (!nq) return [];
    const gruppen = [];
    for (const [ziel, liste] of [["master", kandidaten.master], ["programm", kandidaten.programm], ["streaming", kandidaten.streaming]]) {
      const hits = (liste || []).filter((k) => norm(k.titel).includes(nq)).slice(0, 6);
      if (hits.length) gruppen.push({ ziel, hits });
    }
    return gruppen;
  }, [suche, kandidaten]);
  return (
    <div style={{ background: T.saal, borderRadius: 4, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input autoFocus value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder="Titel suchen (Mediathek · Kinoprogramm · Streaming) …"
          style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }} onClick={onAbbrechen}>Abbrechen</button>
      </div>
      {treffer.map((g) => (
        <div key={g.ziel}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.rauch, textTransform: "uppercase", margin: "4px 0 2px" }}>{ZIEL_LABEL[g.ziel]}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {g.hits.map((k) => (
              <button key={g.ziel + k.id} style={{ ...btnStyle(false), fontSize: 13, padding: "5px 10px", textAlign: "left" }}
                onClick={() => onWaehle({ ziel: g.ziel, id: k.id }, k.titel)}>
                {k.titel}{k.jahr ? " (" + k.jahr + ")" : ""}
              </button>
            ))}
          </div>
        </div>
      ))}
      {suche.trim() && treffer.length === 0 && (
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}>Keine Treffer — Verknüpfung bleibt leer (kein Auto-Anlegen).</div>
      )}
    </div>
  );
}

function MustWatchForm({ onAdd, onDone, kandidaten }) {
  const [titel, setTitel] = useState("");
  const [imBesitz, setImBesitz] = useState(false);
  const [beschreibung, setBeschreibung] = useState("");
  const [notiz, setNotiz] = useState("");
  const [verkn, setVerkn] = useState(null); // {ziel, id}
  const [verknTitel, setVerknTitel] = useState("");
  const [pickerOffen, setPickerOffen] = useState(false);
  const [fehler, setFehler] = useState("");
  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Titel *" value={titel} onChange={(e) => setTitel(e.target.value)} style={{ ...inputStyle, flex: 2, minWidth: 180 }} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: T.leinwandTief, cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={imBesitz} onChange={() => setImBesitz(!imBesitz)} /> im Besitz
        </label>
      </div>
      <textarea placeholder="Beschreibung (worum geht's / warum drauf?)" rows={2} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} style={{ ...inputStyle, boxSizing: "border-box" }} />
      <textarea placeholder="Notiz (frei)" rows={1} value={notiz} onChange={(e) => setNotiz(e.target.value)} style={{ ...inputStyle, boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>Verknüpfung:</span>
        {verkn
          ? <Chip active onClick={() => { setVerkn(null); setVerknTitel(""); }}>{ZIEL_LABEL[verkn.ziel]}: {verknTitel} ✕</Chip>
          : <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }} onClick={() => setPickerOffen(!pickerOffen)}>{pickerOffen ? "Picker schließen" : "… wählen (optional)"}</button>}
      </div>
      {pickerOffen && !verkn && (
        <VerknuepfungsPicker kandidaten={kandidaten}
          onWaehle={(v, t) => { setVerkn(v); setVerknTitel(t); setPickerOffen(false); }}
          onAbbrechen={() => setPickerOffen(false)} />
      )}
      {fehler && <div style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btnStyle(true)} onClick={() => {
          if (!titel.trim()) { setFehler("Titel ist Pflicht."); return; }
          onAdd({ titel: titel.trim(), im_besitz: imBesitz, beschreibung: beschreibung.trim(), notiz: notiz.trim(), verknuepfung: verkn });
          if (onDone) onDone();
        }}>Hinzufügen</button>
        <button style={btnStyle(false)} onClick={onDone}>Abbrechen</button>
      </div>
    </div>
  );
}

export function MustWatchListe({ eintraege, onAdd, onUpdate, onDelete, kandidaten, kommtVorInMap, onArtikelKlick, onSpringeZuRef }) {
  const [formOffen, setFormOffen] = useState(false);
  const [offenId, setOffenId] = useState(null);
  const [pickerFuer, setPickerFuer] = useState(null); // Eintrag-ID mit offenem Picker
  const [suche, setSuche] = useState("");

  const titelZu = (v) => {
    if (!v) return "";
    const liste = kandidaten[v.ziel] || [];
    const k = liste.find((x) => x.id === v.id);
    return k ? k.titel : v.id;
  };
  const sichtbar = useMemo(() => {
    let l = eintraege;
    if (suche.trim()) { const nq = norm(suche); l = l.filter((e) => norm(e.titel).includes(nq)); }
    return [...l].sort((a, b) => (a.titel || "").localeCompare(b.titel || "", "de"));
  }, [eintraege, suche]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Must-Watch durchsuchen …" style={{ ...inputStyle, flex: 1, minWidth: 170 }} />
        {!formOffen && <button style={btnStyle(true)} onClick={() => setFormOffen(true)}>+ Eintrag</button>}
      </div>
      {formOffen && <div style={{ marginBottom: 12 }}><MustWatchForm onAdd={onAdd} onDone={() => setFormOffen(false)} kandidaten={kandidaten} /></div>}
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch, marginBottom: 10 }}>
        {sichtbar.length} {sichtbar.length === 1 ? "Eintrag" : "Einträge"} · eigene Liste (kein Mediathek-Filter) · synct als 10. Datei
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sichtbar.map((e) => {
          const offen = offenId === e.id;
          const backlinks = kommtVorInMap && kommtVorInMap[e.id];
          return (
            <div key={e.id} id={"mw-" + e.id} onClick={() => setOffenId(offen ? null : e.id)}
              style={{ background: T.leinwand, color: T.tinte, borderRadius: 6, padding: "12px 14px", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.45)" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, lineHeight: 1.1, textTransform: "uppercase", letterSpacing: "0.02em", flex: 1, minWidth: 160 }}>
                  {e.titel}
                </span>
                <label onClick={(ev) => ev.stopPropagation()} style={{ display: "flex", gap: 5, alignItems: "center", fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={!!e.im_besitz} onChange={() => onUpdate(e.id, { im_besitz: !e.im_besitz })} /> im Besitz
                </label>
              </div>
              {e.verknuepfung && (
                <div style={{ marginTop: 4, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>
                  ↪ {ZIEL_LABEL[e.verknuepfung.ziel] || e.verknuepfung.ziel}:{" "}
                  {e.verknuepfung.ziel === "master" && onSpringeZuRef
                    ? <a href="#" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onSpringeZuRef(e.verknuepfung.id); }}
                        style={{ color: T.tinte, textDecorationColor: T.wolfram, textUnderlineOffset: 3 }}>{titelZu(e.verknuepfung)}</a>
                    : titelZu(e.verknuepfung)}
                </div>
              )}
              {offen && (
                <div onClick={(ev) => ev.stopPropagation()} style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Bewusst unkontrolliert + onBlur: jeder onUpdate persistiert (und
                      erzeugt am Git-Sync einen Commit) — pro Tastendruck wäre das
                      Commit-Spam. Speichern beim Verlassen des Felds reicht. */}
                  <textarea defaultValue={e.beschreibung || ""} rows={2} placeholder="Beschreibung"
                    onBlur={(ev) => { if (ev.target.value !== (e.beschreibung || "")) onUpdate(e.id, { beschreibung: ev.target.value }); }}
                    style={{ ...inputStyle, boxSizing: "border-box", background: T.leinwandTief, color: T.tinte }} />
                  <textarea defaultValue={e.notiz || ""} rows={1} placeholder="Notiz (frei)"
                    onBlur={(ev) => { if (ev.target.value !== (e.notiz || "")) onUpdate(e.id, { notiz: ev.target.value }); }}
                    style={{ ...inputStyle, boxSizing: "border-box", background: T.leinwandTief, color: T.tinte }} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {e.verknuepfung
                      ? <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", color: T.tinte, borderColor: T.tinteWeich }}
                          onClick={() => onUpdate(e.id, { verknuepfung: null })}>Verknüpfung lösen</button>
                      : <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", color: T.tinte, borderColor: T.tinteWeich }}
                          onClick={() => setPickerFuer(pickerFuer === e.id ? null : e.id)}>{pickerFuer === e.id ? "Picker schließen" : "Verknüpfen …"}</button>}
                    <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", borderColor: T.gefahr, color: T.gefahr }}
                      onClick={() => { if (window.confirm('"' + e.titel + '" aus der Must-Watch-Liste löschen?')) onDelete(e.id); }}>
                      Löschen
                    </button>
                  </div>
                  {pickerFuer === e.id && !e.verknuepfung && (
                    <VerknuepfungsPicker kandidaten={kandidaten}
                      onWaehle={(v) => { onUpdate(e.id, { verknuepfung: v }); setPickerFuer(null); }}
                      onAbbrechen={() => setPickerFuer(null)} />
                  )}
                  {backlinks && backlinks.length > 0 && (
                    <div style={{ padding: "8px 10px", background: T.leinwandTief, borderRadius: 4, fontSize: 13 }}>
                      <strong>Kommt vor in:</strong>
                      {backlinks.map((a) => (
                        <div key={a.id} style={{ marginTop: 4 }}>
                          {onArtikelKlick
                            ? <a href="#" onClick={(ev) => { ev.preventDefault(); onArtikelKlick(a.id); }}
                                style={{ color: T.tinte, textDecorationColor: T.wolfram, textUnderlineOffset: 3 }}>→ {a.titel}</a>
                            : <span style={{ color: T.tinteWeich }}>→ {a.titel}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sichtbar.length === 0 && (
          <p style={{ color: T.rauch, fontSize: 14 }}>
            {suche.trim() ? "Keine Treffer." : "Noch leer. „+ Eintrag“ — oder in den Einstellungen die Must-Watch-Migration ausführen (übernimmt die alten Wunschlisten-Flags)."}
          </p>
        )}
      </div>
    </div>
  );
}

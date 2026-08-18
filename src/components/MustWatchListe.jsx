import { useState, useMemo } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { norm } from "../lib/match.js";
import { Chip } from "./ui.jsx";
import {
  MUSTWATCH_FILTER, mustwatchTyp, mustwatchVerfuegbarkeit, projiziereMustwatch,
} from "../lib/mustwatch.js";

/* ---------- Must-Watch: die persönliche Noch-sehen-Liste ----------
   Eigener Datentopf, KEIN Filter über die Mediathek: eigene Einträge mit
   Titel · optionalem Jahr · Film/Serie · im Besitz · Beschreibung · Notiz ·
   optionaler Verknüpfung. Verknüpfen NUR über den expliziten Picker
   (Suchfeld + Klick) — kein Auto-Matching, nie.
   Die Verfügbarkeitsanzeige ist eine reine Ableitung aus dieser expliziten
   Verknüpfung und dem gerade geladenen Kandidatenbestand (src/lib/mustwatch.js);
   es wird kein Status gespeichert. Sortierung und Filter kommen aus derselben
   reinen Projektion wie das Dashboard.
   kommtVorIn: Blog-Backlinks (Must-Watch-Einträge sind referenzierbar). */

const ZIEL_LABEL = { master: "Mediathek", programm: "Kinoprogramm", streaming: "Streaming" };
const TYP_LABEL = { film: "Film", serie: "Serie" };
const FILTER_LABEL = { alle: "Alle", jetzt: "Jetzt verfügbar", film: "Filme", serie: "Serien" };

const monoKlein = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };

/* Jahr und Art werden im Formular und in der Karte identisch angeboten, damit
   nachträgliches Ergänzen genauso aussieht wie das Anlegen. */
function MetaFelder({ jahr, typ, onJahr, onTyp, farbeAufKarte = false }) {
  const feldStil = farbeAufKarte
    ? { ...inputStyle, background: T.leinwandTief, color: T.tinte }
    : inputStyle;
  return (
    <>
      <input value={jahr} onChange={(e) => onJahr(e.target.value)}
        className="kd-mustwatch-jahr"
        inputMode="numeric" placeholder="Jahr (optional)" aria-label="Jahr (optional)"
        style={{ ...feldStil, width: 150, minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }} />
      <select value={typ} onChange={(e) => onTyp(e.target.value)} aria-label="Art"
        className="kd-mustwatch-art"
        style={{ ...feldStil, width: 150, minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
        <option value="">Art offen lassen</option>
        <option value="film">Film</option>
        <option value="serie">Serie</option>
      </select>
    </>
  );
}

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
          <div style={{ ...monoKlein, fontSize: 10, textTransform: "uppercase", margin: "4px 0 2px" }}>{ZIEL_LABEL[g.ziel]}</div>
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
        <div style={{ ...monoKlein }}>Keine Treffer — Verknüpfung bleibt leer (kein Auto-Anlegen).</div>
      )}
    </div>
  );
}

function MustWatchForm({ onAdd, onDone, kandidaten }) {
  const [titel, setTitel] = useState("");
  const [jahr, setJahr] = useState("");
  const [typ, setTyp] = useState("");
  const [imBesitz, setImBesitz] = useState(false);
  const [beschreibung, setBeschreibung] = useState("");
  const [notiz, setNotiz] = useState("");
  const [verkn, setVerkn] = useState(null); // {ziel, id}
  const [verknTitel, setVerknTitel] = useState("");
  const [pickerOffen, setPickerOffen] = useState(false);
  const [fehler, setFehler] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const speichern = async () => {
    if (!titel.trim()) { setFehler("Titel ist Pflicht."); return; }
    setFehler(""); setSpeichert(true);
    try {
      const ok = await onAdd({
        titel: titel.trim(), jahr, typ, im_besitz: imBesitz,
        beschreibung: beschreibung.trim(), notiz: notiz.trim(), verknuepfung: verkn,
      });
      if (ok !== false && onDone) onDone();
      else setFehler("Der Eintrag wurde nicht gespeichert. Bitte erneut versuchen.");
    } catch {
      setFehler("Der Eintrag wurde nicht gespeichert. Bitte erneut versuchen.");
    } finally { setSpeichert(false); }
  };
  return (
    <div className="kd-mustwatch-form" style={{ background: T.saalHoch, borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="kd-mustwatch-form-hauptfelder" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Titel *" value={titel} onChange={(e) => setTitel(e.target.value)} style={{ ...inputStyle, flex: 2, minWidth: 180 }} />
        <MetaFelder jahr={jahr} typ={typ} onJahr={setJahr} onTyp={setTyp} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: T.leinwandTief, cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={imBesitz} onChange={() => setImBesitz(!imBesitz)} /> im Besitz
        </label>
      </div>
      <textarea placeholder="Beschreibung (worum geht's / warum drauf?)" rows={2} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} style={{ ...inputStyle, boxSizing: "border-box" }} />
      <textarea placeholder="Notiz (frei)" rows={1} value={notiz} onChange={(e) => setNotiz(e.target.value)} style={{ ...inputStyle, boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...monoKlein, color: T.tinteWeich }}>Verknüpfung:</span>
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
        <button style={btnStyle(true)} disabled={speichert} onClick={speichern}>{speichert ? "Speichert …" : "Für später merken"}</button>
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
  const [filter, setFilter] = useState("alle");

  const titelZu = (v) => {
    if (!v) return "";
    const liste = kandidaten[v.ziel] || [];
    const k = liste.find((x) => String(x.id) === String(v.id));
    return k ? k.titel : v.id;
  };
  /* Genau dieselbe reine Projektion, die auch das Dashboard verwendet. */
  const sichtbar = useMemo(
    () => projiziereMustwatch(eintraege, { filter, suche }, kandidaten),
    [eintraege, filter, suche, kandidaten],
  );
  const jetztAnzahl = useMemo(
    () => (eintraege || []).filter((e) => mustwatchVerfuegbarkeit(e, kandidaten)?.aktuell).length,
    [eintraege, kandidaten],
  );
  const eingeschraenkt = filter !== "alle" || !!suche.trim();

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ ...monoKlein, fontSize: 10, color: T.wolfram, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
          Deine persönliche Noch-sehen-Liste
        </div>
        <p style={{ margin: 0, fontSize: 14, color: T.leinwandTief, lineHeight: 1.55, maxWidth: 620 }}>
          Filme und Serien, die du selbst noch sehen möchtest. Verknüpfst du einen Eintrag ausdrücklich
          mit Mediathek, Kinoprogramm oder Streaming, zeigt die Karte, wo er gerade zu haben ist.
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel oder Notiz durchsuchen …" style={{ ...inputStyle, flex: 1, minWidth: 170 }} />
        {!formOffen && <button style={btnStyle(true)} onClick={() => setFormOffen(true)}>+ Für später merken</button>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {MUSTWATCH_FILTER.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{FILTER_LABEL[f]}</Chip>
        ))}
      </div>
      {formOffen && <div style={{ marginBottom: 12 }}><MustWatchForm onAdd={onAdd} onDone={() => setFormOffen(false)} kandidaten={kandidaten} /></div>}
      <div style={{ ...monoKlein, marginBottom: 10 }}>
        {sichtbar.length} von {(eintraege || []).length} vorgemerkt
        {jetztAnzahl > 0 ? " · " + jetztAnzahl + " jetzt verfügbar" : ""}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sichtbar.map((e) => {
          const offen = offenId === e.id;
          const backlinks = kommtVorInMap && kommtVorInMap[e.id];
          const status = mustwatchVerfuegbarkeit(e, kandidaten);
          const typ = mustwatchTyp(e.typ);
          const meta = [e.jahr || null, typ ? TYP_LABEL[typ] : null].filter(Boolean).join(" · ");
          return (
            <div key={e.id} id={"mw-" + e.id} onClick={() => setOffenId(offen ? null : e.id)}
              style={{ background: T.leinwand, color: T.tinte, borderRadius: 6, padding: "12px 14px", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.45)", borderLeft: status?.aktuell ? "4px solid " + T.wolfram : "4px solid transparent" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, lineHeight: 1.1, textTransform: "uppercase", letterSpacing: "0.02em", flex: 1, minWidth: 160, overflowWrap: "anywhere" }}>
                  {e.titel}
                </span>
                {/* Statusbadge NUR bei belegter aktueller Verknüpfung — ohne
                    geladenen Katalog wird nichts behauptet. */}
                {status && (
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.08em", padding: "3px 7px", borderRadius: 3, whiteSpace: "nowrap", border: "1px solid " + (status.aktuell ? T.wolfram : T.tinteWeich), background: status.aktuell ? T.wolfram : "transparent", color: status.aktuell ? T.tinte : T.tinteWeich }}>
                    {status.label}
                  </span>
                )}
                <label onClick={(ev) => ev.stopPropagation()} style={{ display: "flex", gap: 5, alignItems: "center", fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={!!e.im_besitz} onChange={() => onUpdate(e.id, (aktuell) => ({ im_besitz: !aktuell.im_besitz }))} /> im Besitz
                </label>
              </div>
              {meta && (
                <div style={{ marginTop: 3, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>{meta}</div>
              )}
              {(e.notiz || e.beschreibung) && !offen && (
                <div style={{ marginTop: 5, fontSize: 13, color: T.tinteWeich, overflowWrap: "anywhere" }}>
                  {e.notiz || e.beschreibung}
                </div>
              )}
              {e.verknuepfung && (
                <div style={{ marginTop: 4, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.tinteWeich }}>
                  ↪ {ZIEL_LABEL[e.verknuepfung.ziel] || e.verknuepfung.ziel}:{" "}
                  {["master", "programm", "streaming"].includes(e.verknuepfung.ziel) && onSpringeZuRef
                    ? <a href="#" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onSpringeZuRef(e.verknuepfung, e); }}
                        style={{ color: T.tinte, textDecorationColor: T.wolfram, textUnderlineOffset: 3 }}>{titelZu(e.verknuepfung)}</a>
                    : titelZu(e.verknuepfung)}
                </div>
              )}
              {offen && (
                <div onClick={(ev) => ev.stopPropagation()} style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <MetaFelder farbeAufKarte
                      jahr={e.jahr == null ? "" : String(e.jahr)}
                      typ={typ || ""}
                      onJahr={(wert) => { if (wert !== (e.jahr == null ? "" : String(e.jahr))) onUpdate(e.id, { jahr: wert }); }}
                      onTyp={(wert) => onUpdate(e.id, { typ: wert })} />
                  </div>
                  {/* Bewusst unkontrolliert + onBlur: jeder onUpdate persistiert
                      und kann einen Konto-Sync auslösen. Speichern beim Verlassen
                      des Felds vermeidet unnötige Schreibvorgänge pro Tastendruck. */}
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
                      Entfernen
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
            {eingeschraenkt
              ? "Keine Treffer für diese Auswahl. Setz die Suche zurück oder wähle „Alle“."
              : "Noch nichts vorgemerkt. „+ Für später merken“ — oder in den Settings die Must-Watch-Migration ausführen (übernimmt die alten Wunschlisten-Flags)."}
          </p>
        )}
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect } from "react";
import { MasterImport } from "../components/MasterImport.jsx";
import { T, ROTLINK, btnStyle, inputStyle } from "../lib/tokens.js";
import { gleicheArtikelAb, MAX_LISTE } from "../lib/artikel.js";
import { ladeSharedBlogs } from "../lib/supabaseDriver.js";
import { hatDreieck, ALLE_TYPEN } from "../lib/typen.js";
import { FilmForm } from "../components/EintragForm.jsx";
import { MedienForm } from "../components/MedienForm.jsx";

/* ================= BLOG =================
   Flow (Spec): "Erstellen" speichert sofort mit status "wartet" -> Abgleich
   -> Popup. Rotlinks blockieren die Freigabe NIE; offene Mehrfachtreffer
   schon. Wartende Artikel sind ausgegraut, Klick führt zurück ins Popup.
   Bearbeiten nach Freigabe: Maske vorbefüllt, Speichern -> wartet,
   unveränderte refs bleiben stabil. */

const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", get color() { return T.wolfram; }, margin: "0 0 10px" };
const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, get color() { return T.rauch; } };
/* ---------- Eingabemaske ---------- */
function ArtikelMaske({ vorlage, onErstellen, onAbbrechen }) {
  const [titel, setTitel] = useState(vorlage ? vorlage.titel : "");
  const [autor, setAutor] = useState(vorlage ? vorlage.autor : "Max");
  const [text, setText] = useState(vorlage ? vorlage.text : "");
  const [geordnet, setGeordnet] = useState(vorlage ? !!vorlage.geordnet : false);
  const gezogen = !!(vorlage && vorlage.herkunft === "gezogen");
  const [geteilt, setGeteilt] = useState(vorlage ? !!vorlage.geteilt : false);
  const [liste, setListe] = useState(vorlage ? vorlage.liste.map((l) => ({ eingabe: l.eingabe, jahr: l.jahr ? String(l.jahr) : "", typ: l.typ || "" })) : []);
  const [fehler, setFehler] = useState("");

  const setzeZeile = (i, k, v) => setListe(liste.map((z, j) => (j === i ? { ...z, [k]: v } : z)));

  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={h2}>{vorlage ? "Artikel bearbeiten" : "Neuer Artikel"}</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Titel *" value={titel} onChange={(e) => setTitel(e.target.value)} style={{ ...inputStyle, flex: 2, minWidth: 220 }} />
        <input placeholder="Autor *" value={autor} onChange={(e) => setAutor(e.target.value)} style={{ ...inputStyle, width: 120 }} />
      </div>
      <textarea placeholder="Text * (beliebig lang — Absätze per Leerzeile)" rows={10} value={text} onChange={(e) => setText(e.target.value)}
        style={{ ...inputStyle, boxSizing: "border-box", lineHeight: 1.6 }} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.leinwandTief, cursor: "pointer" }}>
        <input type="checkbox" checked={geordnet} onChange={() => setGeordnet(!geordnet)} />
        Liste ist eine Reihenfolge (nummeriert — z.B. Watch-Order) statt einer Sammlung
      </label>
      {!gezogen && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.wolfram, cursor: "pointer" }}>
          <input type="checkbox" checked={geteilt} onChange={() => setGeteilt(!geteilt)} />
          Shared — bei Freigabe im geteilten Ordner „Blogs für alle“ veröffentlichen
        </label>
      )}
      <div style={mono}>Referenzen ({liste.length}/{MAX_LISTE}) — Titel Pflicht, Typ/Jahr optional. Der Abgleich läuft nach „Erstellen“.</div>
      {liste.map((z, i) => (
        <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Titel *" value={z.eingabe} onChange={(e) => setzeZeile(i, "eingabe", e.target.value)} style={{ ...inputStyle, flex: 2, minWidth: 180 }} />
          <select value={z.typ} onChange={(e) => setzeZeile(i, "typ", e.target.value)} style={{ ...inputStyle, padding: "9px 6px" }}>
            <option value="">Typ (optional)</option>
            {ALLE_TYPEN.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input placeholder="Jahr" value={z.jahr} onChange={(e) => setzeZeile(i, "jahr", e.target.value)} style={{ ...inputStyle, width: 70 }} />
          <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 9px" }} onClick={() => setListe(liste.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {liste.length < MAX_LISTE && (
        <button style={{ ...btnStyle(false), alignSelf: "flex-start", fontSize: 13, padding: "6px 12px" }}
          onClick={() => setListe([...liste, { eingabe: "", jahr: "", typ: "" }])}>+ Referenz</button>
      )}
      {fehler && <div style={{ color: T.gefahr, fontSize: 12 }}>{fehler}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btnStyle(true)} onClick={() => {
          if (!titel.trim() || !autor.trim() || !text.trim()) { setFehler("Titel, Autor und Text sind Pflicht."); return; }
          const l = liste.filter((z) => z.eingabe.trim()).map((z) => ({
            eingabe: z.eingabe.trim(), jahr: z.jahr ? Number(z.jahr) : null, typ: z.typ || null, ref: null,
          }));
          onErstellen({ titel: titel.trim(), autor: autor.trim(), text, geordnet, geteilt, liste: l });
        }}>{vorlage ? "Speichern & neu abgleichen" : "Erstellen"}</button>
        <button style={btnStyle(false)} onClick={onAbbrechen}>Abbrechen</button>
      </div>
    </div>
  );
}

/* ---------- Abgleich-Popup ---------- */
function AbgleichPopup({ artikel, master, onSetzeRef, onFreigeben, onLoeschen, onSchliessen, onAddFilm }) {
  const [neuFuer, setNeuFuer] = useState(null); // Index des Eintrags, für den neu angelegt wird
  const [neuTyp, setNeuTyp] = useState("film");
  const abg = useMemo(() => gleicheArtikelAb(artikel, master), [artikel, master]);
  const s = abg.abgleichStat;
  const frei = s.mehrfach === 0;

  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px", border: "1px solid " + T.wolfram }}>
      <h2 style={h2}>Abgleich abgeschlossen — „{artikel.titel}“</h2>
      <div style={{ fontSize: 14, marginBottom: 10, color: T.leinwandTief }}>
        {s.mehrfach > 0
          ? <>Es gibt <strong style={{ color: T.wolfram }}>{s.mehrfach} offene Mehrfachtreffer</strong> — Freigabe erst nach Entscheidung.</>
          : s.rotlink > 0
            ? <>{s.rotlink} Rotlink(s) — <strong>blockieren die Freigabe nicht</strong>, jederzeit ergänzbar.</>
            : <strong style={{ color: T.wolfram }}>Alles sauber!</strong>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {abg.liste.map((le, i) => (
          <div key={i} style={{ background: T.saal, borderRadius: 4, padding: "8px 10px" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
              <span style={{
                fontFamily: "'Space Mono', monospace", fontSize: 11, padding: "2px 7px", borderRadius: 3,
                color: T.tinte, background: le.abgleich.status === "verlinkt" ? T.wolfram : le.abgleich.status === "rotlink" ? ROTLINK : T.rauch,
              }}>
                {le.abgleich.status === "verlinkt" ? "✓ verlinkt" : le.abgleich.status === "rotlink" ? "Rotlink" : "Mehrfach?"}
              </span>
              <span style={{ flex: 1, minWidth: 160 }}>{le.eingabe}{le.jahr ? " (" + le.jahr + ")" : ""}</span>
              {le.abgleich.status === "verlinkt" && <span style={mono}>{le.ref}</span>}
            </div>
            {le.abgleich.status !== "verlinkt" && (
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {le.abgleich.kandidaten.length > 0 && (
                  <select defaultValue="" onChange={(e) => {
                    if (e.target.value === "__rot__") onSetzeRef(artikel.id, i, null, true);
                    else if (e.target.value) onSetzeRef(artikel.id, i, e.target.value, false);
                  }} style={{ ...inputStyle, padding: "7px 6px", fontSize: 13 }}>
                    <option value="" disabled>Kandidat wählen …</option>
                    {le.abgleich.kandidaten.map((k) => <option key={k.id} value={k.id}>{k.titel} ({k.jahr}){k.typ !== "film" ? " · " + k.typ : ""}</option>)}
                    <option value="__rot__">Keiner davon → Rotlink</option>
                  </select>
                )}
                <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }}
                  onClick={() => { setNeuFuer(neuFuer === i ? null : i); setNeuTyp(le.typ || "film"); }}>
                  {neuFuer === i ? "Schließen" : "+ Neu anlegen"}
                </button>
              </div>
            )}
            {neuFuer === i && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <span style={mono}>Typ des neuen Eintrags:</span>
                  <select value={neuTyp} onChange={(e) => setNeuTyp(e.target.value)} style={{ ...inputStyle, padding: "6px", fontSize: 12 }}>
                    {ALLE_TYPEN.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {hatDreieck(neuTyp) ? (
                  <FilmForm startOffen typOptionen={[neuTyp]} initial={{ titel: le.eingabe, jahr: le.jahr || "" }}
                    onAdd={(film) => { const id = onAddFilm(film); if (id) onSetzeRef(artikel.id, i, id, false); }}
                    onDone={() => setNeuFuer(null)} />
                ) : (
                  <MedienForm typ={neuTyp} startOffen initial={{ titel: le.eingabe, jahr: le.jahr || "" }}
                    onAdd={(m) => { const id = onAddFilm(m); if (id) onSetzeRef(artikel.id, i, id, false); }}
                    onDone={() => setNeuFuer(null)} />
                )}
              </div>
            )}
          </div>
        ))}
        {abg.liste.length === 0 && <div style={mono}>Keine Referenzen erfasst.</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={{ ...btnStyle(true), opacity: frei ? 1 : 0.4, cursor: frei ? "pointer" : "not-allowed" }}
          disabled={!frei} title={frei ? "" : "Erst alle Mehrfachtreffer entscheiden"}
          onClick={() => onFreigeben(artikel.id)}>Freigeben</button>
        <button style={btnStyle(false)} onClick={onSchliessen}>Später (bleibt wartend)</button>
        <button style={{ ...btnStyle(false), borderColor: T.gefahr, color: T.gefahr }}
          onClick={() => { if (window.confirm("Nach Abbruch gehen alle Eingaben dieses Artikels verloren. Sicher?")) onLoeschen(artikel.id); }}>
          Abbrechen & löschen
        </button>
      </div>
    </div>
  );
}

/* ---------- Lese-Ansicht ---------- */
function LeseAnsicht({ artikel, master, onZurueck, onBearbeiten, onSpringeZuFilm, onAddFilm, onSetzeRef }) {
  const [rotFuer, setRotFuer] = useState(null);
  const [rotTyp, setRotTyp] = useState("film");
  const proId = useMemo(() => new Map(master.map((f) => [f.id, f])), [master]);
  return (
    <div style={{ background: T.leinwand, color: T.tinte, borderRadius: 6, padding: "26px 30px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", marginBottom: 6 }}>
        <button style={{ ...btnStyle(false), color: T.tinte, borderColor: T.tinteWeich, fontSize: 13, padding: "6px 12px" }} onClick={onZurueck}>← Blog</button>
        <button style={{ ...btnStyle(false), color: T.tinte, borderColor: T.tinteWeich, fontSize: 13, padding: "6px 12px" }} onClick={() => onBearbeiten(artikel.id)}>✎ Bearbeiten</button>
      </div>
      <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 32, lineHeight: 1.15, textTransform: "uppercase", letterSpacing: "0.02em", margin: "6px 0 4px" }}>
        {artikel.titel}
      </h1>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.tinteWeich, marginBottom: 18 }}>
        {artikel.autor}{artikel.erstellt_am ? " · " + artikel.erstellt_am.slice(0, 10) : ""}
      </div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, lineHeight: 1.75 }}>
        {artikel.text.split(/\n\s*\n/).map((abs, i) => <p key={i} style={{ margin: "0 0 14px" }}>{abs}</p>)}
      </div>
      {artikel.liste.length > 0 && (
        <div style={{ marginTop: 22, borderTop: "2px solid " + T.tinte, paddingTop: 12 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Referenzen{artikel.geordnet ? " (Reihenfolge)" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {artikel.liste.map((le, i) => {
              const f = le.ref && proId.get(le.ref);
              return (
                <div key={i} style={{ fontSize: 15 }}>
                  {artikel.geordnet && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.tinteWeich, marginRight: 8 }}>{i + 1}.</span>}
                  {f ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); onSpringeZuFilm(f.id); }}
                      style={{ color: T.tinte, textDecorationColor: T.wolfram, textUnderlineOffset: 3, fontWeight: 600 }}>
                      {f.titel}{f.jahr ? " (" + f.jahr + ")" : ""}
                    </a>
                  ) : (
                    <>
                      <a href="#" onClick={(e) => { e.preventDefault(); setRotFuer(rotFuer === i ? null : i); setRotTyp(le.typ || "film"); }}
                        style={{ color: ROTLINK, textDecorationColor: ROTLINK, textUnderlineOffset: 3, fontWeight: 600 }}
                        title="Eintrag existiert noch nicht in der Mediathek — klicken zum Ergänzen">
                        {le.eingabe}{le.jahr ? " (" + le.jahr + ")" : ""}
                      </a>
                      {rotFuer === i && (
                        <div style={{ margin: "8px 0", padding: 10, background: T.leinwandTief, borderRadius: 4 }}>
                          <div style={{ fontSize: 12, color: T.tinteWeich, marginBottom: 6 }}>
                            Eintrag existiert noch nicht — hier ergänzen:
                            <select value={rotTyp} onChange={(e) => setRotTyp(e.target.value)} style={{ marginLeft: 8, fontSize: 12 }}>
                              {ALLE_TYPEN.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          {hatDreieck(rotTyp) ? (
                            <FilmForm startOffen typOptionen={[rotTyp]} initial={{ titel: le.eingabe, jahr: le.jahr || "" }}
                              onAdd={(film) => { const id = onAddFilm(film); if (id) onSetzeRef(artikel.id, i, id, false); }}
                              onDone={() => setRotFuer(null)} />
                          ) : (
                            <MedienForm typ={rotTyp} startOffen initial={{ titel: le.eingabe, jahr: le.jahr || "" }}
                              onAdd={(m) => { const id = onAddFilm(m); if (id) onSetzeRef(artikel.id, i, id, false); }}
                              onDone={() => setRotFuer(null)} />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- "Blogs entdecken": geteilte Blogs aus dem DB-Ordner ---------- */
function EntdeckenAnsicht({ vorhandene, onZiehe, onZurueck }) {
  const [zustand, setZustand] = useState({ lade: true, fehler: "", blogs: [] });
  const [offen, setOffen] = useState(null);            // aufgeklappter Blog-Key
  const [gezogenLokal, setGezogenLokal] = useState({}); // frisch gezogene (key -> true)

  useEffect(() => {
    let ab = false;
    ladeSharedBlogs().then((r) => {
      if (ab) return;
      if (!r.ok) setZustand({ lade: false, fehler: r.message || "Konnte den geteilten Ordner nicht laden — ist der Sync eingerichtet?", blogs: [] });
      else setZustand({ lade: false, fehler: "", blogs: r.blogs || [] });
    }).catch((e) => { if (!ab) setZustand({ lade: false, fehler: String(e), blogs: [] }); });
    return () => { ab = true; };
  }, []);

  const schonLokal = useMemo(() => {
    const s = new Set();
    for (const a of vorhandene || []) if (a.herkunft === "gezogen" && a.db_key) s.add((a.db_owner || "") + "|" + a.db_key);
    return s;
  }, [vorhandene]);

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <h2 style={{ ...h2, margin: 0 }}>Blogs entdecken{zustand.blogs.length ? " (" + zustand.blogs.length + ")" : ""}</h2>
        <button style={btnStyle(false)} onClick={onZurueck}>← Blog</button>
      </div>
      {zustand.lade && <p style={{ color: T.rauch, fontSize: 14 }}>Lade geteilte Blogs …</p>}
      {zustand.fehler && <p style={{ color: T.gefahr, fontSize: 13 }}>{zustand.fehler}</p>}
      {!zustand.lade && !zustand.fehler && zustand.blogs.length === 0 && (
        <p style={{ color: T.rauch, fontSize: 14 }}>Noch keine geteilten Blogs im Ordner.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {zustand.blogs.map((b) => {
          const key = (b.db_owner || "") + "|" + b.db_key;
          const q = b.artikel || {};
          const auf = offen === key;
          const drin = schonLokal.has(key) || !!gezogenLokal[key];
          return (
            <div key={key} style={{ background: T.saalHoch, borderRadius: 6, padding: "12px 14px" }}>
              <div onClick={() => setOffen(auf ? null : key)} style={{ cursor: "pointer" }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 19, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  {q.titel || "(ohne Titel)"}
                </div>
                <div style={{ ...mono, marginTop: 3 }}>
                  {b.author}{b.updated_at ? " · " + String(b.updated_at).slice(0, 10) : ""} · {(q.liste || []).length} Referenzen{drin ? " · in deiner Mediathek" : ""}
                </div>
              </div>
              {auf && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, lineHeight: 1.7 }}>
                    {(q.text || "").split(/\n\s*\n/).map((abs, i) => <p key={i} style={{ margin: "0 0 12px" }}>{abs}</p>)}
                  </div>
                  {(q.liste || []).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                      {q.liste.map((le, i) => (
                        <span key={i} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, padding: "2px 7px", borderRadius: 3, border: "1px solid " + T.rauch, color: T.rauch }}>
                          {le.eingabe}{le.jahr ? " (" + le.jahr + ")" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button style={{ ...btnStyle(true), fontSize: 13, padding: "7px 14px", opacity: drin ? 0.5 : 1, cursor: drin ? "default" : "pointer" }}
                      disabled={drin}
                      onClick={() => { onZiehe(b); setGezogenLokal((g) => ({ ...g, [key]: true })); }}>
                      {drin ? "✓ In deiner Mediathek" : "In meine Mediathek ziehen"}
                    </button>
                    <span style={mono}>Referenzen, die du nicht hast, werden zu Rotlinks.</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Haupt-Tab ---------- */
export function BlogTab({ artikel, master, fokusId, onFokusVerbraucht,
  onErstellen, onAktualisieren, onSetzeRef, onFreigeben, onLoeschen, onAddFilm, onSpringeZuFilm,
  exportArtikel, importArtikel, onZiehe }) {
  const [ansicht, setAnsicht] = useState({ typ: "liste" });
  const [offenId, setOffenId] = useState(null); // aufgeklappte Karte in der Hub-Liste
  const [loeschFuer, setLoeschFuer] = useState(null); // Artikel-ID mit offener Lösch-Bestätigung
  const [loeschName, setLoeschName] = useState("");
  /* Sprung von außen ("Kommt vor in", offene Referenzen): wartend -> Popup,
     freigegeben -> Lese-Ansicht. Als Effekt — nie während des Renderns. */
  useEffect(() => {
    if (!fokusId) return;
    const a = artikel.find((x) => x.id === fokusId);
    setAnsicht(a ? (a.status === "freigegeben" ? { typ: "lese", id: a.id } : { typ: "popup", id: a.id }) : { typ: "liste" });
    if (onFokusVerbraucht) onFokusVerbraucht();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokusId]);

  /* KD-029: Zeigt die aktive Ansicht (Popup/Lese) auf einen fehlenden Artikel —
     z.B. gelöscht oder per Import ersetzt —, Reset auf die Liste. Als Effekt,
     NIE während des Renders (sonst Render-Phase-Update / StrictMode-Warnung). */
  useEffect(() => {
    if ((ansicht.typ === "popup" || ansicht.typ === "lese") && !artikel.find((x) => x.id === ansicht.id)) {
      setAnsicht({ typ: "liste" });
    }
  }, [ansicht, artikel]);

  const aktiv = (id) => artikel.find((a) => a.id === id);

  if (ansicht.typ === "maske") {
    return <ArtikelMaske vorlage={ansicht.id ? aktiv(ansicht.id) : null}
      onErstellen={(daten) => {
        const id = ansicht.id ? onAktualisieren(ansicht.id, daten) : onErstellen(daten);
        setAnsicht({ typ: "popup", id });
      }}
      onAbbrechen={() => setAnsicht(ansicht.id ? { typ: "lese", id: ansicht.id } : { typ: "liste" })} />;
  }
  if (ansicht.typ === "popup") {
    const a = aktiv(ansicht.id);
    if (!a) return null; // KD-029: Reset läuft im Effekt, hier nur nichts rendern
    return <AbgleichPopup artikel={a} master={master}
      onSetzeRef={onSetzeRef}
      onFreigeben={(id) => { onFreigeben(id); setAnsicht({ typ: "lese", id }); }}
      onLoeschen={(id) => { onLoeschen(id); setAnsicht({ typ: "liste" }); }}
      onSchliessen={() => setAnsicht({ typ: "liste" })}
      onAddFilm={onAddFilm} />;
  }
  if (ansicht.typ === "lese") {
    const a = aktiv(ansicht.id);
    if (!a) return null; // KD-029: Reset läuft im Effekt, hier nur nichts rendern
    return <LeseAnsicht artikel={a} master={master}
      onZurueck={() => setAnsicht({ typ: "liste" })}
      onBearbeiten={(id) => setAnsicht({ typ: "maske", id })}
      onSpringeZuFilm={onSpringeZuFilm} onAddFilm={onAddFilm} onSetzeRef={onSetzeRef} />;
  }
  if (ansicht.typ === "entdecken") {
    return <EntdeckenAnsicht vorhandene={artikel} onZiehe={onZiehe} onZurueck={() => setAnsicht({ typ: "liste" })} />;
  }

  /* Liste — der Hub: Karten klappen auf (Auszug + Referenz-Chips), erst der
     zweite Klick öffnet Lesen/Abgleich. Hält den Bereich bei vielen Artikeln
     überschaubar. */
  return (
    <section>
      <div data-tour="blog" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <h2 style={{ ...h2, margin: 0 }}>Blog ({artikel.length})</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnStyle(false)} onClick={() => setAnsicht({ typ: "entdecken" })}>Blogs entdecken</button>
          <button style={btnStyle(true)} onClick={() => setAnsicht({ typ: "maske" })}>+ Neuer Artikel</button>
        </div>
      </div>
      {artikel.length === 0 && (
        <p style={{ color: T.rauch, fontSize: 14 }}>Noch keine Artikel. „+ Neuer Artikel“ — der Abgleich mit der Mediathek läuft nach dem Erstellen automatisch.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {artikel.map((a) => {
          const wartend = a.status !== "freigegeben";
          const rot = a.liste.filter((le) => !le.ref).length;
          const offen = offenId === a.id;
          const auszug = a.text.length > 280 ? a.text.slice(0, 280).replace(/\s+\S*$/, "") + " …" : a.text;
          return (
            <div key={a.id} onClick={() => setOffenId(offen ? null : a.id)}
              // KD-027: Tastatur-Zugang für die klickbare Karte (Enter/Space wie onClick), nur der Karten-Root
              role="button" tabIndex={0}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return; // innere Buttons nicht doppelt auslösen
                if (e.key === "Enter" || e.key === " ") { if (e.key === " ") e.preventDefault(); setOffenId(offen ? null : a.id); }
              }}
              style={{ background: T.saalHoch, borderRadius: 6, padding: "12px 14px", cursor: "pointer", opacity: wartend ? 0.6 : 1 }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 19, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {a.titel}{wartend && <span style={{ color: T.wolfram, fontSize: 13, marginLeft: 10 }}>· WARTET</span>}
              </div>
              <div style={{ ...mono, marginTop: 3 }}>
                {a.autor}{a.erstellt_am ? " · " + a.erstellt_am.slice(0, 10) : ""} · {a.liste.length} Referenzen{rot > 0 ? " · " + rot + " offen" : ""}{a.geordnet ? " · Reihenfolge" : ""}
              </div>
              {offen && (
                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: T.leinwandTief }}>{auszug}</div>
                  {a.liste.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {a.liste.map((le, i) => (
                        <span key={i} style={{
                          fontFamily: "'Space Mono', monospace", fontSize: 10, padding: "2px 7px", borderRadius: 3,
                          border: "1px solid " + (le.ref ? T.wolfram : ROTLINK), color: le.ref ? T.wolfram : ROTLINK,
                        }}>{le.eingabe}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {wartend
                      ? <button style={{ ...btnStyle(true), fontSize: 13, padding: "7px 14px" }} onClick={() => setAnsicht({ typ: "popup", id: a.id })}>Abgleich öffnen</button>
                      : <button style={{ ...btnStyle(true), fontSize: 13, padding: "7px 14px" }} onClick={() => setAnsicht({ typ: "lese", id: a.id })}>Lesen</button>}
                    <button style={{ ...btnStyle(false), fontSize: 13, padding: "7px 14px" }} onClick={() => setAnsicht({ typ: "maske", id: a.id })}>✎ Bearbeiten</button>
                    <button style={{ ...btnStyle(false), fontSize: 13, padding: "7px 14px", borderColor: T.gefahr, color: T.gefahr }}
                      onClick={() => { setLoeschFuer(loeschFuer === a.id ? null : a.id); setLoeschName(""); }}>
                      Löschen …
                    </button>
                  </div>
                  {loeschFuer === a.id && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: T.saal, borderRadius: 4, border: "1px solid " + T.gefahr }}>
                      <div style={{ fontSize: 12, color: T.rauch, marginBottom: 6, lineHeight: 1.5 }}>
                        Löscht den Artikel restlos — inklusive seiner Rotlinks (offene Referenzen verschwinden mit).
                        Bereits angelegte Mediathek-Einträge bleiben unberührt.
                        Zur Bestätigung den Autorennamen (<strong>{a.autor}</strong>) eintippen:
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input value={loeschName} onChange={(e) => setLoeschName(e.target.value)} placeholder="Autor"
                          style={{ ...inputStyle, width: 140, padding: "6px 9px", fontSize: 13 }} />
                        <button
                          disabled={loeschName.trim().toLowerCase() !== a.autor.trim().toLowerCase()}
                          style={{ ...btnStyle(true), fontSize: 13, padding: "7px 14px", background: T.gefahr,
                            opacity: loeschName.trim().toLowerCase() === a.autor.trim().toLowerCase() ? 1 : 0.35 }}
                          onClick={() => { onLoeschen(a.id); setLoeschFuer(null); setOffenId(null); }}>
                          Endgültig löschen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- Daten-Leiste im Bereich: Artikel sichern/ersetzen (Punkt 6).
           Pakete (Teilen/Tauschen) liegen in Mediathek & Einstellungen. ---- */}
      {exportArtikel && (
        <details style={{ marginTop: 26 }}>
          <summary style={{ cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: T.rauch }}>
            Daten (Artikel exportieren · importieren)
          </summary>
          <div style={{ background: T.saalHoch, borderRadius: 6, padding: "14px 16px", marginTop: 12 }}>
            <button style={{ ...btnStyle(true), marginBottom: 10 }} onClick={exportArtikel}>Artikel exportieren (JSON)</button>
            <MasterImport onImport={importArtikel} hasMaster={(artikel || []).length > 0}
              labelNeu="Artikel importieren" labelErsetzen="Artikel ersetzen (überschreibt!)"
              hinweis='artikel.json hier einfügen ({"artikel":[…]})' />
          </div>
        </details>
      )}
    </section>
  );
}

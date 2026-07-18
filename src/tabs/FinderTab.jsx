import { useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { parseAnfrage, sucheFinder, sucheEntdecken, sucheKino, ohneStimmung, filmHerkunft } from "../lib/finder.js";
import { schlagseite } from "../lib/match.js";
import { sichtbareDienste } from "../lib/dienste.js";
import { AxisChips, KategorieTag, Chip, Dreieck } from "../components/ui.jsx";
import { FilmForm } from "../components/EintragForm.jsx";

/* ================= FINDER =================
   Deterministischer Film-Chat: kein LLM, keine API. Der Parser liest
   Signale aus dem Text (Vokabular-Datenmodul), das Ranking ist
   Dreieck-Score + transparente Boosts. Erkannte Signale sind sichtbar
   und per Chip abwählbar. Entdecken (ungeprüft) nur auf explizite
   Anfrage ("was Neues", "kenn ich nicht").
   Phase 4a: Fragt man nach EINEM Titel -> volle Meta-Karte (samt Bewertung);
   bei Mehrfachtreffer -> Rückfrage-Liste, deren Klick den Titel absendet. */

const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, get color() { return T.rauch; } }; // Getter: Theme-Wechsel

/* Statischer Meta-Chip (nicht klickbar) für die Detailansicht. */
function MetaChip({ children, color }) {
  return (
    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: color || T.rauch, border: "1px solid " + (color || T.rauch), borderRadius: 3, padding: "2px 7px" }}>
      {children}
    </span>
  );
}

function SignalChips({ sig, onToggle, versteckeTitel, stumm }) {
  const chips = [
    // Bei Mehrfach-Titel (Disambiguierung) sind die Titel-Chips redundant zur Liste -> aus.
    ...(versteckeTitel ? [] : (sig.titel || []).map((t) => ["titel", t.id, "Titel: " + t.label])),
    ...sig.genres.map((g) => ["genres", g, "Genre: " + g]),
    ...sig.stimmungen.map((s) => ["stimmungen", s, "Stimmung: " + s + (sig.jahrMax && !sig.jahrMin ? "" : "")]),
    ...(sig.reihen || []).map((r) => ["reihen", r.name, (r.typ === "regie" ? "Regie: " : r.typ === "franchise" ? "Franchise: " : "Reihe: ") + r.name]),
    ...sig.achsen.map((a) => ["achsen", a, a.toUpperCase() + "-lastig"]),
    ...sig.kategorien.map((k) => ["kategorien", k, k.replace(/_/g, " ")]),
    ...sig.dekaden.map((d) => ["dekaden", d, d + "er"]),
    ...(sig.jahrMax ? [["_info", null, "bis " + sig.jahrMax]] : []),
    ...(sig.jahrMin ? [["_info", null, "ab " + sig.jahrMin]] : []),
    ...sig.quellen.map((q) => ["quellen", q, "Quelle: " + q]),
    ...sig.zeit.map((z) => ["zeit", z, z]),
    ...(sig.entdecken ? [["entdecken", true, "Entdecken (ungeprüft)"]] : []),
  ];
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {chips.length > 0 && <span style={mono}>Verstanden:</span>}
      {chips.map(([feld, wert, label], i) => (
        feld === "_info"
          ? <span key={i} style={{ ...mono, color: T.wolfram }}>{label}</span>
          : <Chip key={i} active onClick={() => onToggle(feld, wert)}>{label} ×</Chip>
      ))}
      {!stumm && (!chips.length || (sig.nichtZugeordnet && sig.nichtZugeordnet.length > 0)) && (
        <span style={mono}>
          {chips.length === 0 ? "Keine Signale erkannt. " : ""}
          {sig.nichtZugeordnet && sig.nichtZugeordnet.length > 0 ? "Nicht zugeordnet: " + sig.nichtZugeordnet.join(", ") + " (Vokabular erweiterbar — sag Bescheid)" : ""}
        </span>
      )}
    </span>
  );
}

/* Kompakte Treffer-Zeile (Filter-Ergebnisliste, kein direkter Titel-Treffer). */
function TrefferZeile({ t, onSpringeZuFilm, auswahl }) {
  const f = t.film;
  const h = t.herkunft;
  return (
    <div onClick={() => onSpringeZuFilm && onSpringeZuFilm(f.id)}
      style={{ background: T.saalHoch, borderRadius: 6, padding: "10px 12px", cursor: "pointer" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.02em" }}>
          {f.titel}
        </span>
        <span style={mono}>{f.jahr}{f.typ !== "film" ? " · " + f.typ : ""}</span>
        <AxisChips bw={f.bewertung} />
        <KategorieTag k={f.kategorie} />
        <span style={{ ...mono, color: T.wolfram }}>{t.wert}</span>
      </div>
      <div style={{ marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
        {h.kino && (
          <span style={{ ...mono, color: T.wolfram }}>
            KINO {h.kino.zeiten.length ? "· " + h.kino.zeiten.join(" / ") : "· " + (h.kino.kinos || []).slice(0, 2).join(", ")}
          </span>
        )}
        {h.dvd && <span style={{ ...mono, color: T.leinwandTief }}>DVD</span>}
        {h.streaming && sichtbareDienste(h.streaming.dienste, auswahl).map((d) => (
          <span key={d} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "1px 6px" }}>{d}</span>
        ))}
        {t.gruende.length > 0 && <span style={mono}>({t.gruende.join(" · ")})</span>}
      </div>
    </div>
  );
}

/* Volle Meta-Karte für EINEN Film (Phase 4a) — "gesamte Metainfos samt Bewertung". */
function FilmDetail({ film: f, herkunft: h, onSpringeZuFilm, mustwatchIds, auswahl }) {
  const ss = schlagseite(f.bewertung);
  /* Joyn-Fix: nur Dienste der Abo-Auswahl zeigen; ist danach nichts übrig,
     entfällt der ganze STREAMING-Block (kein leeres Label). */
  const streamingDienste = h && h.streaming ? sichtbareDienste(h.streaming.dienste, auswahl) : [];
  const ssCol = ss ? { wie: T.wie, was: T.was, warum: T.warum }[ss] : T.rauch;
  const ot = (f.originaltitel && f.originaltitel !== f.titel)
    ? f.originaltitel
    : (h && h.kino && h.kino.ot && h.kino.ot !== f.titel ? h.kino.ot : null);
  const beschreibung = h && h.kino ? h.kino.beschreibung : null;
  const hatQuelle = h && (h.kino || h.dvd || h.streaming);
  return (
    <div style={{ background: T.saalHoch, borderRadius: 8, padding: "16px 18px", border: "1px solid " + T.rauch }}>
      {/* Kopf: Signatur-Dreieck + Titel/OT/Jahr */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Dreieck bw={f.bewertung} size={52} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 24, textTransform: "uppercase", letterSpacing: "0.02em", lineHeight: 1.1 }}>
            {f.titel}
          </div>
          <div style={{ ...mono, marginTop: 3 }}>
            {ot ? ot + " · " : ""}{f.jahr || "Jahr unbekannt"}{f.jahr_bis ? "–" + f.jahr_bis : ""}{f.typ && f.typ !== "film" ? " · " + f.typ : ""}
          </div>
        </div>
      </div>
      {/* Bewertung: Achsen + Kategorie + Schlagseite + Wunschliste */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <AxisChips bw={f.bewertung} />
        <KategorieTag k={f.kategorie} />
        {ss && <MetaChip color={ssCol}>{ss.toUpperCase()}-lastig</MetaChip>}
        {/* Must-Watch kommt aus der LISTE (kd:mustwatch), nicht mehr aus dem Flag. */}
        {mustwatchIds && mustwatchIds.has(f.id) && <MetaChip color={T.warum}>★ Must-Watch</MetaChip>}
      </div>
      {/* Genres + Tags */}
      {((f.genre || []).length > 0 || (f.tags || []).length > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {(f.genre || []).map((g) => <MetaChip key={"g" + g} color={T.leinwandTief}>{g}</MetaChip>)}
          {(f.tags || []).map((t) => <MetaChip key={"t" + t}>#{t}</MetaChip>)}
        </div>
      )}
      {/* Reihe / Franchise / Regie (Wikidata-Sidecar, Phase 4b) */}
      {((f.reihe || []).length > 0 || (f.franchise || []).length > 0 || (f.regie || []).length > 0) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {(f.reihe || []).map((r) => <MetaChip key={"r" + r} color={T.wie}>Reihe: {r}</MetaChip>)}
          {(f.franchise || []).map((r) => <MetaChip key={"fr" + r} color={T.was}>Franchise: {r}</MetaChip>)}
          {(f.regie || []).map((r) => <MetaChip key={"rg" + r} color={T.warum}>Regie: {r}</MetaChip>)}
        </div>
      )}
      {/* Begründung (Max' "Warum"-Text) */}
      {f.begruendung && <p style={{ fontSize: 14, lineHeight: 1.55, color: T.leinwand, margin: "12px 0 0" }}>{f.begruendung}</p>}
      {/* film.at-Beschreibung (nur wenn aktuell im Kino) */}
      {beschreibung && <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, lineHeight: 1.55, color: T.wolfram, margin: "8px 0 0" }}>{beschreibung}</p>}
      {/* Notiz */}
      {f.notiz && <p style={{ ...mono, margin: "8px 0 0" }}>Notiz: {f.notiz}</p>}
      {/* Wo läuft / liegt es */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {h && h.kino && (
          <div style={{ ...mono, color: T.wolfram }}>
            <strong style={{ color: T.leinwand }}>KINO</strong>{" · "}{(h.kino.kinos || []).join(", ")}
            {h.kino.zeitenAlle && h.kino.zeitenAlle.length > 0 && (
              <div style={{ marginTop: 3 }}>{h.kino.zeitenAlle.map((z, i) => <div key={i}>· {z}</div>)}</div>
            )}
          </div>
        )}
        {h && h.dvd && <div style={{ ...mono, color: T.leinwandTief }}><strong>DVD</strong> · in deiner Sammlung</div>}
        {streamingDienste.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <strong style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.leinwand }}>STREAMING</strong>
            {streamingDienste.map((d) => (
              <span key={d} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "1px 6px" }}>{d}</span>
            ))}
          </div>
        )}
        {!hatQuelle && <div style={mono}>Aktuell keine Kino-, DVD- oder Streaming-Quelle bekannt.</div>}
      </div>
      {onSpringeZuFilm && (
        <button onClick={() => onSpringeZuFilm(f.id)} style={{ ...btnStyle(false), marginTop: 14 }}>Zum Eintrag →</button>
      )}
    </div>
  );
}

/* Rückfrage bei Mehrfachtreffer (Phase 4a): klickbare Titel-Liste;
   Klick setzt den Titel in die Eingabe und schickt ihn ab. */
function DisambigListe({ sig, master, onWaehle }) {
  const byId = new Map((master || []).map((f) => [f.id, f]));
  const filme = (sig.titel || []).map((t) => byId.get(t.id)).filter(Boolean);
  return (
    <div>
      <div style={{ ...mono, marginBottom: 6 }}>Mehrere Treffer — welchen meinst du?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filme.map((f) => (
          <button key={f.id} onClick={() => onWaehle(f)}
            style={{ textAlign: "left", background: T.saalHoch, border: "1px solid " + T.rauch, borderRadius: 6, padding: "8px 12px", cursor: "pointer", display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, textTransform: "uppercase", color: T.leinwand }}>{f.titel}</span>
            <span style={mono}>{f.jahr || "?"}{f.originaltitel && f.originaltitel !== f.titel ? " · " + f.originaltitel : ""}{f.typ && f.typ !== "film" ? " · " + f.typ : ""}</span>
            <KategorieTag k={f.kategorie} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function FinderTab({ master, kinoMatches, streamingBekannt, streamingEntdecken, mustwatchIds, auswahl = [], onSpringeZuFilm, addFilm, verlauf, setVerlauf, eingabe, setEingabe }) {
  const [formFuer, setFormFuer] = useState(null); // id der Karte mit offener "Eintrag erstellen"-Maske
  /* film.at-Genres aus dem Kinoprogramm -> Vokabular (parseAnfrage erkennt sie),
     damit z.B. "Sci-Fi im Kino" auch ohne passenden Master-Eintrag greift. */
  const kinoGenres = () => {
    const s = new Set();
    for (const pf of (kinoMatches && kinoMatches.rest) || []) for (const g of pf.g || []) s.add(g);
    for (const m of (kinoMatches && kinoMatches.matched) || []) for (const g of (m.prog.g || [])) s.add(g);
    return [...s];
  };
  const suche = (sig) => ({
    sig,
    treffer: sucheFinder(sig, { master: master || [], kinoMatches, streamingBekannt }),
    entdecken: sucheEntdecken(sig, streamingEntdecken),   // findbar über Genre/Titel/Jahrzehnt (self-gated)
    kino: sucheKino(sig, (kinoMatches && kinoMatches.rest) || []),   // unbewertete Kinofilme (Phase 4c)
  });

  const frage = () => {
    const text = eingabe.trim();
    if (!text) return;
    const sig = parseAnfrage(text, master || [], kinoGenres());
    setVerlauf((v) => [...v, { frage: text, ...suche(sig) }]);
    setEingabe("");
  };

  /* Disambiguierungs-Klick: exakt diesen Film als Titel-Frage absenden.
     sig.titel wird auf genau diese ID gepinnt (robust auch bei gleichnamigen
     Filmen), der Titel erscheint in der Eingabe. */
  const waehleTitel = (film) => {
    const sig = parseAnfrage(film.titel, master || [], kinoGenres());
    sig.titel = [{ id: film.id, label: film.titel }];
    setVerlauf((v) => [...v, { frage: film.titel, ...suche(sig) }]);
    setEingabe(film.titel);
  };

  /* Signal-Chip abwählen -> letzte Antwort wird neu berechnet (korrigierbar statt raterisch) */
  const toggleSignal = (idx, feld, wert) => {
    setVerlauf((v) => v.map((e, i) => {
      if (i !== idx) return e;
      let sig = { ...e.sig };
      if (feld === "entdecken") sig.entdecken = false;
      else if (feld === "stimmungen") sig = ohneStimmung(sig, wert);
      else if (feld === "titel") sig.titel = (sig.titel || []).filter((x) => x.id !== wert);
      else if (feld === "reihen") sig.reihen = (sig.reihen || []).filter((x) => x.name !== wert);
      else sig[feld] = sig[feld].filter((x) => x !== wert);
      return { frage: e.frage, ...suche(sig) };
    }));
  };

  /* Detailansicht für genau einen Titel-Treffer: Herkunft aus dem Treffer-Objekt
     (falls vorhanden) oder frisch berechnet. */
  const detailFuer = (e, id) => {
    const t = e.treffer.find((x) => x.film.id === id);
    const film = t ? t.film : (master || []).find((f) => f.id === id);
    if (!film) return null;
    const herkunft = t ? t.herkunft : filmHerkunft(film, { kinoMatches, streamingBekannt });
    return <FilmDetail film={film} herkunft={herkunft} onSpringeZuFilm={onSpringeZuFilm} mustwatchIds={mustwatchIds} auswahl={auswahl} />;
  };

  return (
    <section>
      <div style={{ ...mono, marginBottom: 10 }}>
        Deterministische Suche — keine KI: Titel werden direkt gefunden, erkannte Signale steuern Filter & Ranking (abwählbar per Klick).
        Beispiele: „Wo spielt es Crank?“ · „Star Wars“ · „was Stylisches aus den 80ern im Kino“ · „was Neues, das ich nicht kenne“
      </div>
      {/* Eingabe OBEN, neueste Antwort direkt darunter — kein Scroll-Springen. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={eingabe} onChange={(e) => setEingabe(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") frage(); }}
          placeholder="Titel, Genre, Stimmung, Jahrzehnt, Quelle …"
          style={{ ...inputStyle, flex: 1 }} />
        <button style={btnStyle(true)} onClick={frage}>Suchen</button>
        {verlauf.length > 0 && (
          <button style={btnStyle(false)} onClick={() => { setVerlauf([]); setEingabe(""); }} title="Verlauf leeren, neue Suche beginnen">Neue Suche</button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
        {verlauf.map((e, idx) => ({ e, i: idx })).reverse().map(({ e, i }) => {
          const titelSig = e.sig.titel || [];
          const hatErgebnisse = e.treffer.length > 0 || (e.entdecken && e.entdecken.length > 0) || (e.kino && e.kino.length > 0);
          return (
            <div key={i}>
              <div style={{ background: T.leinwand, color: T.tinte, borderRadius: 6, padding: "8px 12px", fontSize: 14, marginBottom: 8, maxWidth: 560 }}>
                {e.frage}
              </div>
              <div style={{ marginBottom: 8 }}>
                <SignalChips sig={e.sig} versteckeTitel={titelSig.length > 1} stumm={hatErgebnisse} onToggle={(feld, wert) => toggleSignal(i, feld, wert)} />
              </div>
              {titelSig.length === 1 ? (
                /* Genau ein Titel gemeint -> volle Meta-Karte */
                detailFuer(e, titelSig[0].id)
              ) : titelSig.length > 1 ? (
                /* Mehrere Titel -> Rückfrage-Liste */
                <DisambigListe sig={e.sig} master={master} onWaehle={waehleTitel} />
              ) : (
                /* Filter-Frage -> gerankte Trefferliste */
                <>
                  {e.treffer.length === 0 && !hatErgebnisse && <div style={{ color: T.rauch, fontSize: 14 }}>Kein Treffer — probier einen Titel, ein Genre oder ein Jahrzehnt.</div>}
                  {e.treffer.length === 0 && hatErgebnisse && <div style={{ ...mono }}>Nichts in deiner Liste — aber:</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {e.treffer.map((t) => <TrefferZeile key={t.film.id} t={t} onSpringeZuFilm={onSpringeZuFilm} auswahl={auswahl} />)}
                  </div>
                </>
              )}
              {/* Phase 4c: aktuelle Kinofilme (film.at), Kino zuerst — mit Eintrag-erstellen */}
              {titelSig.length <= 1 && e.kino && e.kino.length > 0 && (
                <>
                  <div style={{ ...mono, color: T.leinwandTief, margin: "12px 0 6px" }}>Läuft im Kino — noch nicht in deiner Liste:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {e.kino.map((k) => {
                      const kid = "k:" + (k.pf.film_at_id || k.pf.t);
                      return (
                        <div key={kid} style={{ background: T.saalHoch, borderRadius: 6, padding: "9px 12px" }}>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.02em" }}>{k.pf.t}</span>
                          <span style={{ ...mono, marginLeft: 8 }}>{k.pf.j || ""}</span>
                          <div style={{ ...mono, marginTop: 2 }}>
                            {(k.pf.k || []).length ? "KINO · " + (k.pf.k || []).slice(0, 3).join(", ") : ""}
                            {(k.pf.g || []).length ? "  ·  " + (k.pf.g || []).slice(0, 3).join(", ") : ""}
                          </div>
                          {addFilm && formFuer !== kid && (
                            <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", marginTop: 8 }} onClick={() => setFormFuer(kid)}>Eintrag erstellen</button>
                          )}
                          {formFuer === kid && (
                            <div style={{ marginTop: 8 }} onClick={(ev) => ev.stopPropagation()}>
                              <FilmForm startOffen initial={{ titel: k.pf.t, jahr: k.pf.j, quelle: "must_watch", genre: (k.pf.g || []).join(", ") }}
                                onAdd={(f) => addFilm(f)} onDone={() => setFormFuer(null)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {titelSig.length <= 1 && e.entdecken.length > 0 && (
                <>
                  <div style={{ ...mono, color: T.leinwandTief, margin: "12px 0 6px" }}>Zum Streamen — noch nicht in deiner Liste:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {e.entdecken.map((t) => {
                      const sid = "s:" + t.watchmode_id;
                      return (
                        <div key={sid} style={{ background: T.saalHoch, borderRadius: 6, padding: "9px 12px" }}>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.02em" }}>{t.titel}</span>
                          <span style={{ ...mono, marginLeft: 8 }}>{t.jahr || ""}</span>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            {sichtbareDienste(t.dienste, auswahl).map((d) => <span key={d} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "1px 6px" }}>{d}</span>)}
                          </div>
                          {addFilm && formFuer !== sid && (
                            <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", marginTop: 8 }} onClick={() => setFormFuer(sid)}>Eintrag erstellen</button>
                          )}
                          {formFuer === sid && (
                            <div style={{ marginTop: 8 }} onClick={(ev) => ev.stopPropagation()}>
                              <FilmForm startOffen typOptionen={t.typ === "tv_series" ? ["serie"] : ["film"]}
                                initial={{ titel: t.titel, jahr: t.jahr, quelle: "must_watch", genre: (t.genres || []).join(", ") }}
                                onAdd={(f) => addFilm(f)} onDone={() => setFormFuer(null)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

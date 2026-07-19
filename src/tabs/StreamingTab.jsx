import { useState, useMemo, useCallback, useEffect } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { feuere } from "../lib/tour.js";
import { store, K } from "../lib/storage.js";
import { norm, schlagseite, score } from "../lib/match.js";
import { sichtbareDienste } from "../lib/dienste.js";
import { Chip, ChipReihe, SegmentedControl } from "../components/ui.jsx";
import { FilmCard } from "../components/FilmCard.jsx";
import { FilmForm } from "../components/EintragForm.jsx";

/* ================= STREAMING =================
   Liest NUR Dateien (streaming_bekannt/entdecken.json) — kein API-Call
   im Frontend, kein Key im Browser, kein Auto-Fetch beim Öffnen.
   Quellen-Auswahl: dynamisch — nach Phase 0 kommen alle AT-Quellen mit,
   davor dient quellen_default.json (Max' Abo-Liste) als Basis.
   Die Auswahl steuert (a) sofort die Anzeige und (b) via Config-Export,
   welche Kataloge der Job abruft (Credit-Hebel). */

function download(dateiname, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = dateiname; a.click();
  URL.revokeObjectURL(url);
}

function DienstBadges({ dienste, webUrls, auswahl }) {
  /* Joyn-Fix: Badges UND web_urls-Links nur für Dienste der Abo-Auswahl
     (leere Auswahl = alle) — der Link hängt am Dienst, fliegt also mit. */
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {sichtbareDienste(dienste, auswahl).map((d) => {
        const url = webUrls && webUrls[d];
        const stil = {
          fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.05em",
          color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "2px 7px",
          textDecoration: "none", display: "inline-block", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        };
        return url
          ? <a key={d} href={url} target="_blank" rel="noopener noreferrer" style={stil} onClick={(e) => e.stopPropagation()} title={"Bei " + d + " öffnen"}>{d}&thinsp;↗</a>
          : <span key={d} style={{ ...stil, background: "transparent", color: T.wolfram, border: "1px solid " + T.wolfram }}>{d}</span>;
      })}
    </span>
  );
}

export function StreamingTab({ bekannt, entdecken, auswahl, merkliste = [], toggleMerk, addFilm, master, updateFilm, mustwatchIds, datenGesperrt = false }) {
  const [ansicht, setAnsicht] = useState("programm");
  useEffect(() => { if (ansicht === "entdecken") feuere("entdecken"); }, [ansicht]); // Entdecken -> Just-in-Time-Hinweis
  const [expandedId, setExpandedId] = useState(null);
  const [axis, setAxis] = useState(null);
  const [katF, setKatF] = useState(null);
  const [nurWunsch, setNurWunsch] = useState(false);
  const [suche, setSuche] = useState("");
  const [sortE, setSortE] = useState("relevanz");
  const [genreE, setGenreE] = useState(null);
  const [dekadeE, setDekadeE] = useState(null);
  const [typE, setTypE] = useState(null);
  /* Merkliste kommt jetzt als Prop (in App-State geliftet) — Streaming und Dashboard live synchron. */
  /* Erledigtes im Entdecken: gesehen (kennst du schon) / erstellt (jetzt in
     der Mediathek) — beides fliegt aus der Liste, bis man es einblendet. */
  const [entdeckenStatus, setEntdeckenStatus] = useState(() => {
    try { return JSON.parse(localStorage.getItem(K.entdeckenStatus) || "{}"); } catch { return {}; }
  });
  const [zeigeErledigte, setZeigeErledigte] = useState(true);
  const [sichtbarE, setSichtbarE] = useState(200); // Entdecken: wie viele Einträge gerendert (Paginierung)
  const [nurRelevant, setNurRelevant] = useState(false);
  const [formFuer, setFormFuer] = useState(null); // watchmode_id mit offener Eingabemaske
  /* View-Schnellfilter: temporär auf EINEN gewählten Dienst einschränken —
     mutiert die Master-Auswahl (auswahl / Einstellungen) NICHT. */
  const [schnellDienst, setSchnellDienst] = useState(null);
  /* Filterleiste auf/zu — pro Session, Default ZUGEKLAPPT (gilt für Programm & Entdecken). */
  const [streamFilterOffen, setStreamFilterOffen] = useState(() => {
    try { return sessionStorage.getItem("kd:filter-streaming") === "1"; } catch { return false; }
  });
  const toggleStreamFilter = () => setStreamFilterOffen((v) => {
    const nv = !v; try { sessionStorage.setItem("kd:filter-streaming", nv ? "1" : "0"); } catch { /* egal */ } return nv;
  });
  const setzeStatus = (t, wert) => {
    setEntdeckenStatus((prev) => {
      const next = { ...prev };
      if (next[t.watchmode_id] === wert) delete next[t.watchmode_id]; // Toggle
      else next[t.watchmode_id] = wert;
      store.set(K.entdeckenStatus, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const datenDa = !!(bekannt && bekannt.stand);
  const entdeckenDa = !!(entdecken && entdecken.stand);
  const stand = datenDa ? new Date(bekannt.stand) : null;
  const alterTage = stand ? (Date.now() - stand.getTime()) / 86400000 : null;

  /* Anzeige-Filter: leere Auswahl = alles zeigen */
  const dienstOk = useCallback((t) => !auswahl.length || (t.dienste || []).some((d) => auswahl.includes(d)), [auswahl]);
  /* Chips in den Listen: nur Quellen, die im Katalog tatsächlich vorkommen */
  const katalogQuellen = useMemo(() => (datenDa && bekannt.dienste) || [], [bekannt, datenDa]);
  /* Schnellfilter-Optionen = gewählte Dienste, ABER nur solche mit Titeln im Katalog
     (tote Auswahl wie „Crunchyroll (Via Prime)" ohne Daten fliegt raus); ohne Auswahl
     die Katalog-Dienste. */
  const schnellOptionen = useMemo(() => {
    const gefiltert = (auswahl || []).filter((d) => katalogQuellen.includes(d));
    return gefiltert.length ? gefiltert : katalogQuellen;
  }, [auswahl, katalogQuellen]);
  const schnellOk = useCallback((t) => !schnellDienst || (t.dienste || []).includes(schnellDienst), [schnellDienst]);

  const programm = useMemo(() => {
    if (!datenDa) return [];
    let l = bekannt.titel.filter((t) => dienstOk(t) && schnellOk(t));
    if (axis) l = l.filter((f) => schlagseite(f.bewertung) === axis);
    if (katF) l = l.filter((f) => f.kategorie === katF);
    /* Must-Watch-Filter liest die LISTE (Verknüpfung auf Master-ID) — nicht mehr
       das eingebackene must_watch-Flag aus dem Katalog-Job (kann veraltet sein). */
    if (nurWunsch) l = l.filter((f) => mustwatchIds && mustwatchIds.has(f.id));
    if (suche.trim()) { const nq = norm(suche); l = l.filter((f) => norm(f.titel || "").includes(nq)); }
    return [...l].sort((a, b) => score(b) - score(a));
  }, [bekannt, datenDa, dienstOk, schnellOk, axis, katF, nurWunsch, mustwatchIds, suche]);

  const genresE = useMemo(() => {
    if (!entdeckenDa) return [];
    const c = {};
    entdecken.titel.forEach((t) => (t.genres || []).forEach((g) => (c[g] = (c[g] || 0) + 1)));
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g]) => g);
  }, [entdecken, entdeckenDa]);

  /* "Könnte dir gefallen": dynamische Schwelle — 55% des Relevanz-Maximums.
     Skaliert mit, wenn die Heuristik reicher wird (Namen-Liste, Tags). */
  const relevanzSchwelle = useMemo(() => {
    if (!entdeckenDa) return 0;
    let max = 0;
    for (const t of entdecken.titel) if (t.relevanz != null && t.relevanz > max) max = t.relevanz;
    return max * 0.55;
  }, [entdecken, entdeckenDa]);
  const erledigtAnzahl = useMemo(() => {
    if (!entdeckenDa) return 0;
    return entdecken.titel.filter((t) => entdeckenStatus[t.watchmode_id]).length;
  }, [entdecken, entdeckenDa, entdeckenStatus]);

  const entdeckenListe = useMemo(() => {
    if (!entdeckenDa) return [];
    let l = entdecken.titel.filter((t) => dienstOk(t) && schnellOk(t));
    if (!zeigeErledigte) l = l.filter((t) => !entdeckenStatus[t.watchmode_id]);
    if (nurRelevant) l = l.filter((t) => (t.relevanz ?? -1) >= relevanzSchwelle);
    if (genreE) l = l.filter((t) => (t.genres || []).includes(genreE));
    if (dekadeE != null) l = l.filter((t) => t.jahr && Math.floor(t.jahr / 10) * 10 === dekadeE);
    if (typE) l = l.filter((t) => (t.typ || "") === typE);
    if (suche.trim()) { const nq = norm(suche); l = l.filter((t) => norm(t.titel || "").includes(nq)); }
    const s = {
      relevanz: (a, b) => (b.relevanz ?? -1) - (a.relevanz ?? -1),
      jahr: (a, b) => (b.jahr || 0) - (a.jahr || 0),
      score: (a, b) => (b.user_score || 0) - (a.user_score || 0),
      titel: (a, b) => (a.titel || "").localeCompare(b.titel || "", "de"),
    };
    return [...l].sort(s[sortE] || s.relevanz);
  }, [entdecken, entdeckenDa, dienstOk, schnellOk, genreE, dekadeE, typE, suche, sortE, entdeckenStatus, zeigeErledigte, nurRelevant, relevanzSchwelle]);
  // Bei Filterwechsel wieder bei 200 anfangen (sonst würden Tausende gerendert).
  useEffect(() => { setSichtbarE(200); }, [entdeckenListe]);

  const dekaden = useMemo(() => {
    if (!entdeckenDa) return [];
    const s = new Set();
    entdecken.titel.forEach((t) => t.jahr && s.add(Math.floor(t.jahr / 10) * 10));
    return [...s].sort((a, b) => b - a);
  }, [entdecken, entdeckenDa]);

  const gemerkt = (t) => merkliste.some((m) => m.watchmode_id === t.watchmode_id);

  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 10px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };

  if (datenGesperrt) return (
    <section>
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "18px 20px", fontSize: 14, color: T.rauch, lineHeight: 1.7 }}>
        <strong style={{ color: T.wolfram }}>Clean ohne Terminal-Installation.</strong> Streaming-Kataloge und Anbieterlisten bleiben gesperrt. Starte <code style={{ color: T.wolfram }}>Installation-Mac.command</code> oder <code style={{ color: T.wolfram }}>Installation-Windows.bat</code> – oder wechsle zur Demo.
      </div>
    </section>
  );

  return (
    <section>
      {/* dataTour="streaming-views" bleibt am SegmentedControl-Container — Tour-Anker. */}
      <SegmentedControl dataTour="streaming-views" value={ansicht} onChange={setAnsicht}
        options={[
          { id: "programm", label: "Mein Programm", badge: datenDa ? programm.length : undefined },
          { id: "entdecken", label: "Entdecken", badge: entdeckenDa ? entdeckenListe.length : undefined },
        ]} />

      {!datenDa && (
        <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px", fontSize: 14, color: T.rauch, lineHeight: 1.7 }}>
          <strong style={{ color: T.wolfram }}>Streaming-Tab leer.</strong> Zwei mögliche Ursachen — die App kann sie unter <code style={{ color: T.wolfram }}>file://</code> nicht unterscheiden (sie liest nur die fertigen Katalog-Dateien, nie die API):
          <br />1. <strong>Kein Watchmode-Key</strong> in <code style={{ color: T.wolfram }}>Programmdateien/System/.env</code> — nachtragbar über Installation.html (Schritt „Watchmode-API-Key") oder <code style={{ color: T.wolfram }}>Installation-Mac.command</code> erneut. Ohne Key bleibt nur dieser Tab leer.
          <br />2. <strong>Key da, aber noch kein Katalog-Lauf.</strong> Im Ordner <code style={{ color: T.wolfram }}>KinoFilm/Programmdateien/System</code>:
          <br /><code style={{ color: T.wolfram }}>node streaming_phase0_test.js</code> → <code style={{ color: T.wolfram }}>node map_masterliste.js</code> → <code style={{ color: T.wolfram }}>node fetch_streaming_katalog.js</code> → <code style={{ color: T.wolfram }}>node build_streaming_ansicht.js</code>
          <br />Jeder Schritt meldet im Terminal die genaue Ursache (fehlender Key, HTTP 401/429, Region AT nicht gesetzt, Quota erschöpft). Vorher unter Einstellungen die Abos anhaken und die Config exportieren.
        </div>
      )}

      {datenDa && alterTage > 35 && (
        <div style={{ background: "rgba(217,106,90,0.12)", border: "1px solid " + T.gefahr, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>
          Katalog ist {Math.floor(alterTage)} Tage alt — Refresh fällig (Einstellungen).
        </div>
      )}

      {datenDa && bekannt.demo && (
        <div style={{ background: "rgba(227,166,59,0.12)", border: "1px solid " + T.wolfram, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: T.leinwandTief }}>
          <strong style={{ color: T.wolfram }}>Demo-Beispieldaten</strong> — die Titel hier sind Platzhalter. Der echte Katalog kommt mit dem ersten Watchmode-Lauf.
        </div>
      )}

      {/* ===== Mein Programm ===== */}
      {ansicht === "programm" && datenDa && (
        <>
          <div className="kd-kompakt" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel suchen …" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
            <span style={mono}>Stand {stand.toLocaleDateString("de-AT")}</span>
            <button onClick={toggleStreamFilter} title={streamFilterOffen ? "Filter einklappen" : "Filter ausklappen"}
              style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }}>
              {streamFilterOffen ? "▾ Filter" : "▸ Filter"}
            </button>
          </div>
          {streamFilterOffen && (
            <>
              <ChipReihe>
                {schnellOptionen.map((d) => (
                  <Chip key={d} active={schnellDienst === d} onClick={() => setSchnellDienst(schnellDienst === d ? null : d)}>{d}</Chip>
                ))}
                {schnellOptionen.length > 0 && <span style={{ width: 12 }} />}
                <Chip active={axis === "wie"} color={T.wie} onClick={() => setAxis(axis === "wie" ? null : "wie")}>WIE-lastig</Chip>
                <Chip active={axis === "was"} color={T.was} onClick={() => setAxis(axis === "was" ? null : "was")}>WAS-lastig</Chip>
                <Chip active={axis === "warum"} color={T.warum} onClick={() => setAxis(axis === "warum" ? null : "warum")}>WARUM-lastig</Chip>
                <Chip active={nurWunsch} onClick={() => setNurWunsch(!nurWunsch)}>Nur Must-Watch</Chip>
              </ChipReihe>
              <ChipReihe style={{ gap: 6, marginBottom: 14 }}>
                {[["immer_gut", "Immer gut"], ["kult", "Kult"], ["kult_klassiker", "Kult-Klassiker"], ["daemlich_aber_herrlich", "Dämlich aber herrlich"], ["trash", "Trash"], ["sehenswert", "Sehenswert"]].map(([k, l]) => (
                  <Chip key={k} active={katF === k} onClick={() => setKatF(katF === k ? null : k)}>{l}</Chip>
                ))}
              </ChipReihe>
            </>
          )}
          {programm.length === 0 && <p style={{ color: T.rauch, fontSize: 14 }}>Kein Titel deiner Liste auf den gewählten Diensten.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {programm.map((f) => {
              /* Editierbar: den Master-Eintrag überlagern (frische Begründung/Bewertung),
                 Streaming-Felder behalten. onSave schreibt in die Masterliste. */
              const mf = master && master.find((m) => m.id === f.id);
              return (
                <FilmCard key={f.id} film={mf ? { ...mf, dienste: f.dienste, web_urls: f.web_urls } : f}
                  expanded={expandedId === "s" + f.id}
                  onToggle={() => setExpandedId(expandedId === "s" + f.id ? null : "s" + f.id)}
                  onSave={updateFilm && mf ? (changes) => updateFilm(f.id, changes) : undefined}
                  kinoInfo={<DienstBadges dienste={f.dienste} webUrls={f.web_urls} auswahl={auswahl} />}
                />
              );
            })}
          </div>
        </>
      )}

      {/* ===== Entdecken ===== */}
      {ansicht === "entdecken" && datenDa && (
        <>
          <div style={{ background: T.saalHoch, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: T.rauch }}>
            Ungeprüft — Heuristik-Sortierung{entdecken && entdecken.heuristik === false ? " (abgeschaltet)" : ""}. Kein Dreieck, keine Bewertung. Merkliste = Übergabe an die Bewertung.
          </div>
          <div className="kd-kompakt" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel suchen …" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
            {/* data-tour auf dem Wrapper, NICHT dem <select>: native Form-Controls
                schlucken den box-shadow-Rahmen, dann käme der Hinweis ohne Rahmen. */}
            <span data-tour="entdecken-relevanz" style={{ display: "inline-flex" }}>
              <select value={sortE} onChange={(e) => setSortE(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                <option value="relevanz">Sortierung: Relevanz</option>
                <option value="jahr">Jahr</option>
                <option value="score">User-Score</option>
                <option value="titel">Titel A–Z</option>
              </select>
            </span>
            <button style={{ ...btnStyle(false), fontSize: 13, padding: "7px 12px" }}
              onClick={() => download("merkliste.json", { exportiert_am: new Date().toISOString(), eintraege: merkliste })}
              title="Übergabepunkt an den Daten-Chat — die Plattform bewertet nichts selbst.">
              Merkliste ({merkliste.length}) exportieren
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={toggleStreamFilter} title={streamFilterOffen ? "Filter einklappen" : "Filter ausklappen"}
              style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }}>
              {streamFilterOffen ? "▾ Filter" : "▸ Filter"}
            </button>
          </div>
          {streamFilterOffen && (
            <>
              <ChipReihe style={{ gap: 6 }}>
                {schnellOptionen.map((d) => <Chip key={d} active={schnellDienst === d} onClick={() => setSchnellDienst(schnellDienst === d ? null : d)}>{d}</Chip>)}
                {schnellOptionen.length > 0 && <span style={{ width: 12 }} />}
                <Chip active={typE === "movie"} onClick={() => setTypE(typE === "movie" ? null : "movie")}>Filme</Chip>
                <Chip active={typE === "tv_series"} onClick={() => setTypE(typE === "tv_series" ? null : "tv_series")}>Serien</Chip>
                <span style={{ width: 12 }} />
                <Chip active={nurRelevant} color={T.wolfram} onClick={() => setNurRelevant(!nurRelevant)}>Könnte dir gefallen</Chip>
                {erledigtAnzahl > 0 && (
                  <Chip active={zeigeErledigte} onClick={() => setZeigeErledigte(!zeigeErledigte)}>
                    Erledigte zeigen ({erledigtAnzahl})
                  </Chip>
                )}
              </ChipReihe>
              <ChipReihe style={{ gap: 6 }}>
                {genresE.map((g) => <Chip key={g} active={genreE === g} onClick={() => setGenreE(genreE === g ? null : g)}>{g}</Chip>)}
              </ChipReihe>
              <ChipReihe style={{ gap: 6, marginBottom: 14 }}>
                {dekaden.map((d) => <Chip key={d} active={dekadeE === d} onClick={() => setDekadeE(dekadeE === d ? null : d)}>{d}er</Chip>)}
              </ChipReihe>
            </>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entdeckenListe.slice(0, sichtbarE).map((t) => (
              <div key={t.watchmode_id} onClick={() => setExpandedId(expandedId === "e" + t.watchmode_id ? null : "e" + t.watchmode_id)}
                style={{ background: T.saalHoch, borderRadius: 6, padding: "10px 12px", cursor: "pointer" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <button onClick={(e) => { e.stopPropagation(); toggleMerk(t); }}
                    title={gemerkt(t) ? "Von der Merkliste nehmen" : "Auf die Merkliste"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: gemerkt(t) ? T.wolfram : T.rauch, padding: "0 2px" }}>
                    {gemerkt(t) ? "★" : "☆"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setzeStatus(t, "gesehen"); }}
                    title={entdeckenStatus[t.watchmode_id] === "gesehen" ? "Gesehen-Markierung entfernen" : "Als gesehen markieren (fliegt aus der Liste)"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: entdeckenStatus[t.watchmode_id] === "gesehen" ? T.wolfram : T.rauch, padding: "0 2px" }}>
                    ✓
                  </button>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 17, flex: 1, minWidth: 160 }}>
                    {t.titel}{t.jahr ? " (" + t.jahr + ")" : ""}{t.typ === "tv_series" ? " · Serie" : ""}
                    {entdeckenStatus[t.watchmode_id] && (
                      <span style={{ ...mono, color: T.wolfram, marginLeft: 8 }}>
                        {entdeckenStatus[t.watchmode_id] === "erstellt" ? "in deiner Mediathek" : "gesehen"}
                      </span>
                    )}
                  </span>
                  <DienstBadges dienste={t.dienste} auswahl={auswahl} />
                  {t.relevanz != null && <span style={{ ...mono, color: T.wolfram }} title="Heuristik-Vorsortierung, keine Bewertung">Relevanz {t.relevanz}</span>}
                  {typeof t.user_score === "number" && <span style={mono}>Score {t.user_score}</span>}
                </div>
                {expandedId === "e" + t.watchmode_id && (
                  <div style={{ marginTop: 6, fontSize: 12, color: T.rauch }} onClick={(e) => e.stopPropagation()}>
                    {(t.genres || []).length > 0 && <span>{t.genres.join(", ")}</span>}
                    {addFilm && formFuer !== t.watchmode_id && !entdeckenStatus[t.watchmode_id] && (
                      <button style={{ ...btnStyle(true), fontSize: 12, padding: "6px 11px", marginTop: 8 }}
                        onClick={() => setFormFuer(t.watchmode_id)}>
                        Eintrag erstellen
                      </button>
                    )}
                    {formFuer === t.watchmode_id && (
                      <div style={{ marginTop: 8 }}>
                        <FilmForm startOffen
                          typOptionen={t.typ === "tv_series" ? ["serie"] : ["film"]}
                          initial={{ titel: t.titel, jahr: t.jahr, quelle: "must_watch", genre: (t.genres || []).join(", ") }}
                          onAdd={(f) => { const id = addFilm(f); if (id) setEntdeckenStatus((prev) => { const next = { ...prev, [t.watchmode_id]: "erstellt" }; store.set(K.entdeckenStatus, JSON.stringify(next)).catch(() => {}); return next; }); }}
                          onDone={() => setFormFuer(null)} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {entdeckenListe.length > sichtbarE && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                <button style={{ ...btnStyle(true), fontSize: 13, padding: "8px 14px" }}
                  onClick={() => setSichtbarE((n) => n + 100)}>
                  Weitere 100 laden
                </button>
                <span style={mono}>{sichtbarE} von {entdeckenListe.length} · noch {entdeckenListe.length - sichtbarE}</span>
              </div>
            )}
          </div>
        </>
      )}

    </section>
  );
}

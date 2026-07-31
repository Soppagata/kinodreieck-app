import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { feuere } from "../lib/tour.js";
import { store, K } from "../services/storage.js";
import { ERROR_CODES } from "../services/errors.js";
import { norm, schlagseite, schlagseiten, score } from "../lib/match.js";
import { sichtbareDienste } from "../lib/dienste.js";
import { BEWERTUNGSKATEGORIEN } from "../lib/kategorien.js";
import { Chip, ChipReihe, SegmentedControl } from "../components/ui.jsx";
import { FilmCard } from "../components/FilmCard.jsx";
import { FilmForm } from "../components/EintragForm.jsx";
import {
  statusVon, neuerGesehenEintrag, initialisiereStaffelstaende,
  neueStaffeln, bestaetigeStaffel,
} from "../lib/staffeln.js";
import { filmwissenRechercheKennung } from "../lib/filmwissen.js";

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

export function StreamingTab({
  bekannt, entdecken, auswahl, merkliste = [], toggleMerk, addFilm, master, updateFilm,
  addFilmMitPrognose, vorbewertungAktiv = false, prognoseLaufId = null,
  prognoseSperrgrund = null, prognoseFehler = {}, aktuelleProfilVersion = null,
  onPrognoseErstellen, onPrognoseStatus,
  filmwissenAktiv = false, filmwissenRechercheAktiv = false,
  filmwissenProFilm = {}, filmwissenRechercheLaufId = null,
  onFilmwissenLaden, onFilmwissenRecherchieren,
  mustwatchIds, datenGesperrt = false, katalogInfo = null, angemeldet = false,
}) {
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
  const entdeckenStatusRef = useRef(entdeckenStatus);
  entdeckenStatusRef.current = entdeckenStatus;
  const schreibeEntdeckenStatus = useCallback((berechne) => {
    const vorher = entdeckenStatusRef.current;
    const next = typeof berechne === "function" ? berechne(vorher) : berechne;
    if (next === vorher) return vorher;
    entdeckenStatusRef.current = next;
    setEntdeckenStatus(next);
    store.set(K.entdeckenStatus, JSON.stringify(next)).catch(() => {});
    return next;
  }, []);
  const [zeigeErledigte, setZeigeErledigte] = useState(false); // KD-021: gesehene/erledigte Titel standardmaessig ausgeblendet (Tooltip/Copy sagen genau das)
  const [sichtbarE, setSichtbarE] = useState(200); // Entdecken: wie viele Einträge gerendert (Paginierung)
  const [nurRelevant, setNurRelevant] = useState(false);
  const [formFuer, setFormFuer] = useState(null); // watchmode_id mit offener Eingabemaske
  const markiereAlsErstellt = useCallback((watchmodeId, id) => {
    if (!id) return id;
    schreibeEntdeckenStatus((prev) => ({ ...prev, [watchmodeId]: "erstellt" }));
    return id;
  }, [schreibeEntdeckenStatus]);
  /* View-Schnellfilter: temporär auf EINEN gewählten Dienst einschränken —
     mutiert die Master-Auswahl (auswahl / Einstellungen) NICHT. */
  const [schnellDienst, setSchnellDienst] = useState(null);
  /* Filterleiste auf/zu — Default ZUGEKLAPPT (gilt für Programm & Entdecken).
     Seit Etappe 3 dauerhafte Sicht-Präferenz im Datentopf statt sessionStorage. */
  const [streamFilterOffen, setStreamFilterOffen] = useState(false);
  const streamFilterOffenRef = useRef(streamFilterOffen);
  streamFilterOffenRef.current = streamFilterOffen;
  useEffect(() => {
    let aktiv = true;
    store.get(K.filterStreaming).then((r) => {
      if (aktiv && r?.value === "1") {
        streamFilterOffenRef.current = true;
        setStreamFilterOffen(true);
      }
    }).catch(() => {});
    return () => { aktiv = false; };
  }, []);
  const toggleStreamFilter = () => {
    const nv = !streamFilterOffenRef.current;
    streamFilterOffenRef.current = nv;
    setStreamFilterOffen(nv);
    store.set(K.filterStreaming, nv ? "1" : "0").catch(() => {});
  };
  const setzeStatus = (t, wert) => {
    schreibeEntdeckenStatus((prev) => {
      const next = { ...prev };
      if (statusVon(next[t.watchmode_id]) === wert) delete next[t.watchmode_id]; // Toggle
      else next[t.watchmode_id] = wert === "gesehen" && t.typ === "tv_series" ? neuerGesehenEintrag(t) : wert;
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
  /* Schnellfilter-Optionen = ALLE angehakten Dienste — auch ohne Katalog-Titel (Max, 19.07.):
     die Abo-Auswahl soll im Filter sichtbar sein, ein leerer Treffer ist ok. Früher auf
     bekannt.dienste gegatet; das ist aber unzuverlässig (führt z. B. Joyn NICHT, obwohl Titel
     Joyn getaggt sind, und listet umgekehrt titel-lose Dienste). Ohne Auswahl: die Katalog-Dienste. */
  const schnellOptionen = useMemo(() => (auswahl && auswahl.length ? auswahl : katalogQuellen), [auswahl, katalogQuellen]);
  const schnellOk = useCallback((t) => !schnellDienst || (t.dienste || []).includes(schnellDienst), [schnellDienst]);

  const programm = useMemo(() => {
    if (!datenDa) return [];
    let l = bekannt.titel.filter((t) => dienstOk(t) && schnellOk(t));
    /* schlagseiten(), nicht schlagseite(): Die Karte darunter nennt bei
       geteilter Spitze BEIDE Achsen ("WIE/WARUM"). Einwertig gefiltert
       verschwand Sin City (4/2/4) beim Klick auf "WARUM-lastig", obwohl die
       Karte eine Zeile hoeher WARUM behauptet. Der Filterchip ist eine
       explizite Nutzerabfrage, keine Rangfrage — Ranking (score, finder.js)
       bleibt bewusst einwertig. */
    if (axis) l = l.filter((f) => schlagseiten(f.bewertung).includes(axis));
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

  /* Alte String-Häkchen bekommen beim ersten real gelieferten Staffelwert nur
     einen Ausgangsstand. Dadurch entsteht kein rückwirkender „neu“-Alarm. */
  useEffect(() => {
    if (!entdeckenDa) return;
    schreibeEntdeckenStatus((prev) => {
      const next = initialisiereStaffelstaende(prev, entdecken.titel);
      return next;
    });
  }, [entdecken, entdeckenDa, schreibeEntdeckenStatus]);

  const staffelHinweise = useMemo(() => {
    if (!entdeckenDa) return [];
    return neueStaffeln(entdecken.titel, entdeckenStatus);
  }, [entdecken, entdeckenDa, entdeckenStatus]);

  const bestaetigeHinweis = (hinweis) => {
    const t = entdecken && entdecken.titel.find((x) => x.watchmode_id === hinweis.watchmode_id);
    if (!t) return;
    schreibeEntdeckenStatus((prev) => ({
      ...prev,
      [t.watchmode_id]: bestaetigeStaffel(prev[t.watchmode_id], t),
    }));
  };

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
        <strong style={{ color: T.wolfram }}>Datenbank noch nicht verbunden.</strong> Gib den mitgeschickten Leseschlüssel im Verbindungsfenster oder unter Einstellungen ein. Die App selbst ruft Watchmode nie live auf.
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
          {katalogInfo?.code === ERROR_CODES.NO_DEMO_DATA ? (
            /* Noch nichts veröffentlicht ist weder ein Server- noch ein
               Anmeldungsproblem — und schon gar keine „ungültige Antwort". */
            <><strong style={{ color: T.wolfram }}>Für den öffentlichen Zugang sind noch keine Beispieldaten veröffentlicht.</strong> Der
              laufende Streamingkatalog steht nach der Anmeldung unter Einstellungen → Konto bereit.</>
          ) : katalogInfo?.code === ERROR_CODES.INVALID_KEY ? (
            <><strong style={{ color: T.wolfram }}>Der Zugangsschlüssel wird nicht akzeptiert.</strong> Die Datenbank weist den
              hinterlegten Leseschlüssel ab — prüfe ihn unter Einstellungen → Datenmodus &amp; Verbindung.
              Eine Anmeldung hilft hier nicht.</>
          ) : katalogInfo?.anmeldungNoetig ? (
            <><strong style={{ color: T.wolfram }}>Für den aktuellen Streamingkatalog ist eine Anmeldung nötig.</strong> Melde
              dich unter Einstellungen → Konto an. Ohne Anmeldung zeigt die App den Demo-Schnappschuss —
              der steht für diesen Zugang gerade nicht bereit.</>
          ) : katalogInfo?.fehler ? (
            <><strong style={{ color: T.wolfram }}>Streamingkatalog konnte nicht geladen werden.</strong> {katalogInfo.fehler}
              {" "}Der Katalog wird nicht live abgefragt, sondern vorbereitet ausgeliefert; du kannst ihn unter
              Einstellungen → Datenmodus &amp; Verbindung erneut anfordern.
              {!angemeldet && " Als Gast siehst du ohnehin nur den Demo-Schnappschuss; angemeldet käme der laufende Katalog."}</>
          ) : (
            <><strong style={{ color: T.wolfram }}>Streaming-Tab leer.</strong> Die App liest ausschließlich den
              vorbereiteten Datenbank-Katalog und ruft Watchmode nie live auf. Für diesen Zugang ist noch
              kein Katalog hinterlegt. Prüfe unter Einstellungen → Datenmodus &amp; Verbindung den Status.</>
          )}
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

      {/* Ein abgelaufener Schnappschuss ist kein aktueller Katalog — sagen statt zeigen. */}
      {datenDa && katalogInfo?.abgelaufen && (
        <div style={{ background: "rgba(217,106,90,0.12)", border: "1px solid " + T.gefahr, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: T.leinwandTief }}>
          <strong style={{ color: T.gefahr }}>Abgelaufener Schnappschuss</strong> — diese Verfügbarkeiten galten bis
          {" "}{new Date(katalogInfo.gueltigBis).toLocaleDateString("de-AT")} und stimmen heute nicht mehr zwingend.
          {katalogInfo.variante === "demo" ? " Mit einer Anmeldung siehst du den laufenden Katalog." : ""}
        </div>
      )}
      {datenDa && katalogInfo?.ausCache && (
        <div style={{ background: "rgba(227,166,59,0.12)", border: "1px solid " + T.wolfram, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: T.leinwandTief }}>
          <strong style={{ color: T.wolfram }}>Aus dem Browser-Speicher</strong> — die Datenbank war beim letzten Versuch nicht erreichbar. Angezeigt wird der zuletzt geladene Stand.
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
                {BEWERTUNGSKATEGORIEN.map((k) => (
                  <Chip key={k.id} active={katF === k.id} onClick={() => setKatF(katF === k.id ? null : k.id)}>{k.label}</Chip>
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
              const kartenFilm = mf
                ? { ...f, ...mf, dienste: f.dienste, web_urls: f.web_urls }
                : f;
              return (
                <FilmCard key={f.id} film={kartenFilm}
                  expanded={expandedId === "s" + f.id}
                  onToggle={() => {
                    const key = "s" + f.id;
                    const oeffnen = expandedId !== key;
                    setExpandedId(oeffnen ? key : null);
                    if (oeffnen) onFilmwissenLaden?.(kartenFilm);
                  }}
                  onSave={updateFilm && mf ? (changes) => updateFilm(f.id, changes) : undefined}
                  vorbewertung={vorbewertungAktiv && mf ? {
                    laeuft: prognoseLaufId === f.id,
                    fehler: prognoseFehler[f.id] || null,
                    sperrgrund: prognoseSperrgrund,
                    aktuelleProfilVersion,
                    onErstellen: () => onPrognoseErstellen?.(kartenFilm),
                    onAnnehmen: () => onPrognoseStatus?.(mf, "angenommen"),
                    onVerwerfen: () => onPrognoseStatus?.(mf, "verworfen"),
                  } : null}
                  filmwissen={filmwissenAktiv && mf ? {
                    ...(filmwissenProFilm[f.id] || { phase: "idle", daten: null, fehler: null }),
                    rechercheLaeuft: filmwissenRechercheLaufId === String(f.id),
                    rechercheMoeglich: filmwissenRechercheAktiv
                      && !!filmwissenRechercheKennung(kartenFilm),
                    onRecherchieren: () => onFilmwissenRecherchieren?.(kartenFilm),
                  } : null}
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
          {staffelHinweise.length > 0 && (
            <div className="kd-staffelhinweise" style={{ marginBottom: 14 }}>
              <div style={{ ...h2, marginBottom: 8 }}>Neue Staffeln</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {staffelHinweise.map((h) => (
                  <div key={h.watchmode_id} className="kd-staffelhinweis" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "rgba(216,160,61,.12)", border: "1px solid " + T.wolfram, borderRadius: 6, padding: "10px 12px" }}>
                    <span aria-hidden="true" style={{ color: T.wolfram, fontSize: 18 }}>★</span>
                    <span style={{ flex: 1, minWidth: 180 }}>
                      <strong style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17 }}>{h.titel}</strong>
                      <span style={{ ...mono, color: T.wolfram, marginLeft: 8 }}>Staffel {h.staffel_verfuegbar} verfügbar</span>
                      {h.dienste.length > 0 && <span style={{ ...mono, display: "block", marginTop: 2 }}>{h.dienste.join(", ")}</span>}
                    </span>
                    <button style={{ ...btnStyle(true), fontSize: 12, padding: "6px 10px" }} onClick={() => bestaetigeHinweis(h)}>
                      Als neuen Stand bestätigen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                    title={statusVon(entdeckenStatus[t.watchmode_id]) === "gesehen" ? "Gesehen-Markierung entfernen" : "Als gesehen markieren (fliegt aus der Liste)"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: statusVon(entdeckenStatus[t.watchmode_id]) === "gesehen" ? T.wolfram : T.rauch, padding: "0 2px" }}>
                    ✓
                  </button>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 17, flex: 1, minWidth: 160 }}>
                    {t.titel}{t.jahr ? " (" + t.jahr + ")" : ""}{t.typ === "tv_series" ? " · Serie" : ""}
                    {entdeckenStatus[t.watchmode_id] && (
                      <span style={{ ...mono, color: T.wolfram, marginLeft: 8 }}>
                        {statusVon(entdeckenStatus[t.watchmode_id]) === "erstellt" ? "in deiner Mediathek" : "gesehen"}
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
                          initial={{
                            titel: t.titel, jahr: t.jahr, quelle: "must_watch",
                            genre: (t.genres || []).join(", "), watchmode_id: t.watchmode_id,
                            imdb_id: t.imdb_id, tmdb_id: t.tmdb_id,
                          }}
                          onAdd={(f) => markiereAlsErstellt(t.watchmode_id, addFilm(f))}
                          onAddMitPrognose={async (f) => markiereAlsErstellt(
                            t.watchmode_id,
                            await addFilmMitPrognose?.(f),
                          )}
                          prognoseAktiv={vorbewertungAktiv}
                          prognoseSperrgrund={prognoseSperrgrund}
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

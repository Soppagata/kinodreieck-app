import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { feuere } from "../lib/tour.js";
import { store, K } from "../services/storage.js";
import { ERROR_CODES } from "../services/errors.js";
import { norm } from "../lib/match.js";
import { gruppiereDienstBadges, sichtbareDienste } from "../lib/dienste.js";
import { Chip, ChipReihe, SegmentedControl } from "../components/ui.jsx";
import { FilmCard } from "../components/FilmCard.jsx";
import { FilmForm } from "../components/EintragForm.jsx";
import {
  statusVon, mediathekIdVon, mitMediathekEintrag, gleicheMediathekStatusAb,
  istBeobachtet, neuerGesehenEintrag, setzeSerienBeobachtung,
  neueStaffeln, bestaetigeStaffel,
} from "../lib/staffeln.js";
import { filmwissenRechercheKennung } from "../lib/filmwissen.js";
import { sortiereStreamingTitel } from "../lib/streamingSort.js";

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

function DienstBadges({ dienste, webUrls, auswahl, kompakt = false, className }) {
  /* Joyn-Fix: Badges UND web_urls-Links nur für Dienste der Abo-Auswahl
     (leere Auswahl = alle) — der Link hängt am Dienst, fliegt also mit. */
  return (
    <span className={className} style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {gruppiereDienstBadges(sichtbareDienste(dienste, auswahl), { kompakt }).map(({ label, rohnamen }) => {
        const d = rohnamen[0];
        const url = rohnamen.map((name) => webUrls && webUrls[name]).find(Boolean);
        const stil = {
          fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.05em",
          color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "2px 7px",
          border: "1px solid " + T.wolfram, textDecoration: "none", display: "inline-block",
          maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        };
        return url
          ? <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={stil} onClick={(e) => e.stopPropagation()} title={"Bei " + rohnamen.join(", ") + " öffnen"}>{label}&thinsp;↗</a>
          : <span key={label} title={rohnamen.join(", ")} style={stil}>{label}</span>;
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
  fokusTreffer = null, onFokusVerbraucht,
  entdeckenStatus = {}, schreibeEntdeckenStatus = () => {},
}) {
  const bereichRef = useRef(null);
  const [ansicht, setAnsicht] = useState("programm");
  useEffect(() => { if (ansicht === "entdecken") feuere("entdecken"); }, [ansicht]); // Entdecken -> Just-in-Time-Hinweis
  const [expandedId, setExpandedId] = useState(null);
  const [nurWunsch, setNurWunsch] = useState(false);
  const [suche, setSuche] = useState("");
  const [sortP, setSortP] = useState("titel");
  const [sortRichtungP, setSortRichtungP] = useState("auf");
  const [sortE, setSortE] = useState("titel");
  const [sortRichtungE, setSortRichtungE] = useState("auf");
  const [genreE, setGenreE] = useState(null);
  const [dekadeE, setDekadeE] = useState(null);
  const [typE, setTypE] = useState(null);
  /* Merkliste kommt jetzt als Prop (in App-State geliftet) — Streaming und Dashboard live synchron. */
  /* Erledigtes im Entdecken: gesehen (kennst du schon) / erstellt (jetzt in
     der Mediathek) — beides fliegt aus der Liste, bis man es einblendet. */
  const entdeckenStatusRef = useRef(entdeckenStatus);
  entdeckenStatusRef.current = entdeckenStatus;
  const [zeigeErledigte, setZeigeErledigte] = useState(true); // Erledigte bleiben standardmäßig sichtbar; der Chip kann sie bewusst ausblenden.
  const [sichtbarE, setSichtbarE] = useState(200); // Entdecken: wie viele Einträge gerendert (Paginierung)
  const [formFuer, setFormFuer] = useState(null); // watchmode_id mit offener Eingabemaske
  const [gesehenFrage, setGesehenFrage] = useState(null);
  const [fokusOverride, setFokusOverride] = useState(null);
  const markiereAlsErstellt = useCallback((t, id) => {
    if (!id) return id;
    schreibeEntdeckenStatus((prev) => ({
      ...prev,
      [t.watchmode_id]: mitMediathekEintrag(prev[t.watchmode_id], t, id),
    }));
    return id;
  }, [schreibeEntdeckenStatus]);
  useEffect(() => {
    if (!fokusTreffer) return undefined;
    setFokusOverride({ art: fokusTreffer.art, ref: String(fokusTreffer.ref) });
    setAnsicht(fokusTreffer.art === "entdecken" ? "entdecken" : "programm");
    setSuche(fokusTreffer.art === "programm" ? (fokusTreffer.titel || "") : "");
    setSchnellDienst(null); setNurWunsch(false);
    setGenreE(null); setDekadeE(null); setTypE(null);
    setZeigeErledigte(true); setSichtbarE(200);
    setExpandedId((fokusTreffer.art === "entdecken" ? "e" : "s") + fokusTreffer.ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokusTreffer]);
  /* Erst NACH dem durch den Auftrag ausgelösten Ansichts-/Filter-Render
     fokussieren. Der Auftrag wird nur verbraucht, wenn sein DOM-Ziel wirklich
     existiert; ein langsamer Katalog-Render kann ihn daher nicht verlieren. */
  useEffect(() => {
    if (!fokusTreffer) return undefined;
    const erwarteteAnsicht = fokusTreffer.art === "entdecken" ? "entdecken" : "programm";
    if (ansicht !== erwarteteAnsicht) return undefined;
    let bestaetigung = 0;
    const frame = requestAnimationFrame(() => {
      const schluessel = `${fokusTreffer.art}:${fokusTreffer.ref}`;
      const ziel = [...(bereichRef.current?.querySelectorAll("[data-streaming-suchtreffer]") || [])]
        .find((element) => element.dataset.streamingSuchtreffer === schluessel);
      if (!ziel) return;
      ziel.scrollIntoView?.({ behavior: "smooth", block: "center" });
      ziel.focus?.({ preventScroll: true });
      /* Der Tab-Effekt kann unmittelbar danach noch die Vollkatalog-Ansicht
         einsetzen. Nach diesem letzten Render den Fokus einmal bestätigen und
         erst dann den Auftrag verbrauchen. */
      bestaetigung = window.setTimeout(() => {
        const aktuell = [...(bereichRef.current?.querySelectorAll("[data-streaming-suchtreffer]") || [])]
          .find((element) => element.dataset.streamingSuchtreffer === schluessel);
        if (!aktuell) return;
        aktuell.focus?.({ preventScroll: true });
        onFokusVerbraucht?.();
      }, 120);
    });
    return () => { cancelAnimationFrame(frame); window.clearTimeout(bestaetigung); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokusTreffer, ansicht, expandedId, suche, fokusOverride, bekannt, entdecken]);
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
  useEffect(() => {
    const vonGlobalerLeiste = (event) => {
      if (event.detail?.bereich === "streaming") toggleStreamFilter();
    };
    window.addEventListener("kd:toggle-bereichsfilter", vonGlobalerLeiste);
    return () => window.removeEventListener("kd:toggle-bereichsfilter", vonGlobalerLeiste);
  });
  const setzeStatus = (t, wert) => {
    schreibeEntdeckenStatus((prev) => {
      const next = { ...prev };
      const roh = next[t.watchmode_id];
      const basis = roh && typeof roh === "object" ? roh : {};
      if (statusVon(roh) === wert) {
        const { status: _status, gesehen_am: _gesehenAm, ...rest } = basis;
        if (rest.beobachtet || rest.mediathek_id) next[t.watchmode_id] = rest;
        else delete next[t.watchmode_id];
      } else next[t.watchmode_id] = wert === "gesehen"
        ? { ...basis, ...neuerGesehenEintrag(t) }
        : { ...basis, status: wert };
      return next;
    });
  };
  const toggleGesehen = (t) => {
    const roh = entdeckenStatusRef.current[t.watchmode_id];
    if (statusVon(roh) === "gesehen") {
      schreibeEntdeckenStatus((prev) => {
        const next = { ...prev };
        const basis = next[t.watchmode_id] && typeof next[t.watchmode_id] === "object" ? { ...next[t.watchmode_id] } : {};
        const verknuepft = mediathekIdVon(basis);
        delete basis.gesehen_am;
        if (verknuepft) basis.status = "erstellt";
        else delete basis.status;
        if (basis.beobachtet || basis.mediathek_id) next[t.watchmode_id] = basis;
        else delete next[t.watchmode_id];
        return next;
      });
      return;
    }
    if (mediathekIdVon(roh)) {
      schreibeEntdeckenStatus((prev) => ({
        ...prev,
        [t.watchmode_id]: mitMediathekEintrag({ ...(roh && typeof roh === "object" ? roh : {}), ...neuerGesehenEintrag(t) }, t, mediathekIdVon(roh)),
      }));
      return;
    }
    setExpandedId("e" + t.watchmode_id);
    setGesehenFrage(t.watchmode_id);
  };

  const toggleBeobachten = (t) => {
    schreibeEntdeckenStatus((prev) => {
      const next = { ...prev };
      const wert = setzeSerienBeobachtung(prev[t.watchmode_id], t, !istBeobachtet(prev[t.watchmode_id]));
      if (wert) next[t.watchmode_id] = wert;
      else delete next[t.watchmode_id];
      return next;
    });
  };

  const uebernehmeGesehen = (t) => {
    const id = addFilm?.({
      titel: t.titel,
      originaltitel: t.titel,
      jahr: t.jahr ?? null,
      jahr_bis: null,
      typ: t.typ === "tv_series" ? "serie" : "film",
      quelle: "must_watch",
      kategorie: null,
      bewertet_von: null,
      bewertung: null,
      genre: t.genres || [],
      tags: [],
      begruendung: "",
      notiz: "",
      status: "gesetzt",
      watchmode_id: t.watchmode_id,
      ...(t.imdb_id ? { imdb_id: t.imdb_id } : {}),
      ...(t.tmdb_id ? { tmdb_id: t.tmdb_id } : {}),
    });
    if (!id) return;
    schreibeEntdeckenStatus((prev) => ({
      ...prev,
      [t.watchmode_id]: mitMediathekEintrag({ ...(prev[t.watchmode_id] && typeof prev[t.watchmode_id] === "object" ? prev[t.watchmode_id] : {}), ...neuerGesehenEintrag(t) }, t, id),
    }));
    setGesehenFrage(null);
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
    let l = bekannt.titel.filter((t) => (
      fokusOverride?.art === "programm" && String(t.id) === fokusOverride.ref
    ) || (dienstOk(t) && schnellOk(t)));
    /* Must-Watch-Filter liest die LISTE (Verknüpfung auf Master-ID) — nicht mehr
       das eingebackene must_watch-Flag aus dem Katalog-Job (kann veraltet sein). */
    if (nurWunsch) l = l.filter((f) => mustwatchIds && mustwatchIds.has(f.id));
    if (suche.trim()) { const nq = norm(suche); l = l.filter((f) => norm(f.titel || "").includes(nq)); }
    return sortiereStreamingTitel(l, sortP, sortRichtungP);
  }, [bekannt, datenDa, dienstOk, schnellOk, nurWunsch, mustwatchIds, suche, sortP, sortRichtungP, fokusOverride]);

  const genresE = useMemo(() => {
    if (!entdeckenDa) return [];
    const c = {};
    entdecken.titel.forEach((t) => (t.genres || []).forEach((g) => (c[g] = (c[g] || 0) + 1)));
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g]) => g);
  }, [entdecken, entdeckenDa]);

  const erledigtAnzahl = useMemo(() => {
    if (!entdeckenDa) return 0;
    return entdecken.titel.filter((t) => statusVon(entdeckenStatus[t.watchmode_id]) || mediathekIdVon(entdeckenStatus[t.watchmode_id])).length;
  }, [entdecken, entdeckenDa, entdeckenStatus]);

  /* Starke Katalogkennungen gleichen Entdecken bidirektional mit der Mediathek
     ab. Vorhanden bedeutet ausdrücklich NICHT automatisch gesehen: Eine
     Mediathek kann auch ungesehene und Must-Watch-Einträge enthalten. */
  useEffect(() => {
    if (!Array.isArray(master)) return;
    schreibeEntdeckenStatus((prev) => gleicheMediathekStatusAb(prev, entdecken?.titel, master));
  }, [master, entdecken, schreibeEntdeckenStatus]);

  const staffelHinweise = useMemo(() => {
    const titel = [...((bekannt && bekannt.titel) || []), ...((entdecken && entdecken.titel) || [])];
    return neueStaffeln(titel, entdeckenStatus);
  }, [bekannt, entdecken, entdeckenStatus]);

  const bestaetigeHinweis = (hinweis) => {
    const t = [...((bekannt && bekannt.titel) || []), ...((entdecken && entdecken.titel) || [])]
      .find((x) => x.watchmode_id === hinweis.watchmode_id);
    if (!t) return;
    schreibeEntdeckenStatus((prev) => ({
      ...prev,
      [t.watchmode_id]: bestaetigeStaffel(prev[t.watchmode_id], t),
    }));
  };

  const entdeckenListe = useMemo(() => {
    if (!entdeckenDa) return [];
    let l = entdecken.titel.filter((t) => (
      fokusOverride?.art === "entdecken" && String(t.watchmode_id) === fokusOverride.ref
    ) || (dienstOk(t) && schnellOk(t)));
    if (!zeigeErledigte) l = l.filter((t) => !statusVon(entdeckenStatus[t.watchmode_id]) && !mediathekIdVon(entdeckenStatus[t.watchmode_id]));
    if (genreE) l = l.filter((t) => (t.genres || []).includes(genreE));
    if (dekadeE != null) l = l.filter((t) => t.jahr && Math.floor(t.jahr / 10) * 10 === dekadeE);
    if (typE) l = l.filter((t) => (t.typ || "") === typE);
    return sortiereStreamingTitel(l, sortE, sortRichtungE);
  }, [entdecken, entdeckenDa, dienstOk, schnellOk, genreE, dekadeE, typE, sortE, sortRichtungE, entdeckenStatus, zeigeErledigte, fokusOverride]);
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
    <section ref={bereichRef}>
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "18px 20px", fontSize: 14, color: T.rauch, lineHeight: 1.7 }}>
        <strong style={{ color: T.wolfram }}>Datenbank noch nicht verbunden.</strong> Gib den mitgeschickten Leseschlüssel im Verbindungsfenster oder unter Settings ein. Die App selbst ruft Watchmode nie live auf.
      </div>
    </section>
  );

  return (
    <section ref={bereichRef}>
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
              laufende Streamingkatalog steht nach der Anmeldung unter Settings → Konto bereit.</>
          ) : katalogInfo?.code === ERROR_CODES.INVALID_KEY ? (
            <><strong style={{ color: T.wolfram }}>Der Zugangsschlüssel wird nicht akzeptiert.</strong> Die Datenbank weist den
              hinterlegten Leseschlüssel ab — prüfe ihn unter Settings → Datenmodus &amp; Verbindung.
              Eine Anmeldung hilft hier nicht.</>
          ) : katalogInfo?.anmeldungNoetig ? (
            <><strong style={{ color: T.wolfram }}>Für den aktuellen Streamingkatalog ist eine Anmeldung nötig.</strong> Melde
              dich unter Settings → Konto an. Ohne Anmeldung zeigt die App den Demo-Schnappschuss —
              der steht für diesen Zugang gerade nicht bereit.</>
          ) : katalogInfo?.fehler ? (
            <><strong style={{ color: T.wolfram }}>Streamingkatalog konnte nicht geladen werden.</strong> {katalogInfo.fehler}
              {" "}Der Katalog wird nicht live abgefragt, sondern vorbereitet ausgeliefert; du kannst ihn unter
              Settings → Datenmodus &amp; Verbindung erneut anfordern.
              {!angemeldet && " Als Gast siehst du ohnehin nur den Demo-Schnappschuss; angemeldet käme der laufende Katalog."}</>
          ) : (
            <><strong style={{ color: T.wolfram }}>Streaming-Tab leer.</strong> Die App liest ausschließlich den
              vorbereiteten Datenbank-Katalog und ruft Watchmode nie live auf. Für diesen Zugang ist noch
              kein Katalog hinterlegt. Prüfe unter Settings → Datenmodus &amp; Verbindung den Status.</>
          )}
        </div>
      )}

      {datenDa && alterTage > 35 && (
        <div style={{ background: "rgba(217,106,90,0.12)", border: "1px solid " + T.gefahr, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>
          Katalog ist {Math.floor(alterTage)} Tage alt — Refresh fällig (Settings).
        </div>
      )}

      {datenDa && bekannt.demo && katalogInfo?.variante !== "live" && (
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
            <span style={{ display: "inline-flex" }}>
              <select value={sortP} onChange={(e) => setSortP(e.target.value)} aria-label="Mein Programm sortieren"
                style={{ ...inputStyle, width: "auto" }}>
                <option value="titel">Titel</option>
                <option value="jahr">Jahr</option>
                <option value="anbieter">Anbieter</option>
              </select>
              <button type="button" style={{ ...btnStyle(false), minWidth: 42, padding: "7px 10px" }}
                onClick={() => setSortRichtungP((r) => r === "ab" ? "auf" : "ab")}
                aria-label={sortRichtungP === "ab" ? "Absteigend sortiert; aufsteigend wechseln" : "Aufsteigend sortiert; absteigend wechseln"}
                title={sortRichtungP === "ab" ? "Absteigend" : "Aufsteigend"}>
                {sortRichtungP === "ab" ? "↓" : "↑"}
              </button>
            </span>
            <button className="kd-seitenfilter" onClick={toggleStreamFilter} title={streamFilterOffen ? "Filter einklappen" : "Filter ausklappen"}
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
                <Chip active={nurWunsch} onClick={() => setNurWunsch(!nurWunsch)}>Nur Must-Watch</Chip>
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
                <div key={f.id} className="kd-suchfokus" tabIndex={-1}
                  data-streaming-suchtreffer={`programm:${f.id}`}>
                <FilmCard film={kartenFilm}
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
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ===== Entdecken ===== */}
      {ansicht === "entdecken" && datenDa && (
        <>
          <div style={{ background: T.saalHoch, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: T.rauch }}>
            Ungeprüfte Katalogtitel — kein Dreieck und keine Bewertung. Sortiert wird nur nach den sichtbaren Metadaten.
          </div>
          {staffelHinweise.length > 0 && (
            <div className="kd-staffelhinweise" style={{ marginBottom: 14 }}>
              <div style={{ ...h2, marginBottom: 8 }}>Serien-Updates</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {staffelHinweise.map((h) => (
                  <div key={h.watchmode_id} className="kd-staffelhinweis" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "rgba(216,160,61,.12)", border: "1px solid " + T.wolfram, borderRadius: 6, padding: "10px 12px" }}>
                    <span aria-hidden="true" style={{ color: T.wolfram, fontSize: 18 }}>★</span>
                    <span style={{ flex: 1, minWidth: 180 }}>
                      <strong style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17 }}>{h.titel}</strong>
                      <span style={{ ...mono, color: T.wolfram, marginLeft: 8 }}>
                        {h.staffel_neu ? `Staffel ${h.staffel_verfuegbar} verfügbar` : "Neue Folge erkannt"}
                        {h.folge_aktuell ? ` · Folge ${h.folge_aktuell}` : ""}
                      </span>
                      {h.dienste.length > 0 && <span style={{ ...mono, display: "block", marginTop: 2 }}>{gruppiereDienstBadges(h.dienste).map((d) => d.label).join(", ")}</span>}
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
            {/* data-tour auf dem Wrapper, NICHT dem <select>: native Form-Controls
                schlucken den box-shadow-Rahmen, dann käme der Hinweis ohne Rahmen. */}
            <span data-tour="entdecken-sortierung" style={{ display: "inline-flex" }}>
              <select value={sortE} onChange={(e) => setSortE(e.target.value)} aria-label="Entdecken sortieren"
                style={{ ...inputStyle, width: "auto" }}>
                <option value="titel">Titel</option>
                <option value="jahr">Jahr</option>
                <option value="art">Art</option>
                <option value="anbieter">Anbieter</option>
              </select>
              <button type="button" style={{ ...btnStyle(false), minWidth: 42, padding: "7px 10px" }}
                onClick={() => setSortRichtungE((r) => r === "ab" ? "auf" : "ab")}
                aria-label={sortRichtungE === "ab" ? "Absteigend sortiert; aufsteigend wechseln" : "Aufsteigend sortiert; absteigend wechseln"}
                title={sortRichtungE === "ab" ? "Absteigend" : "Aufsteigend"}>
                {sortRichtungE === "ab" ? "↓" : "↑"}
              </button>
            </span>
            <button className="kd-nur-desktop" style={{ ...btnStyle(false), fontSize: 13, padding: "7px 12px" }}
              onClick={() => download("merkliste.json", { exportiert_am: new Date().toISOString(), eintraege: merkliste })}
              title="Merkliste als JSON-Datei exportieren">
              Merkliste ({merkliste.length}) exportieren
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="kd-seitenfilter" onClick={toggleStreamFilter} title={streamFilterOffen ? "Filter einklappen" : "Filter ausklappen"}
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
                {erledigtAnzahl > 0 && (
                  <Chip active={zeigeErledigte} onClick={() => setZeigeErledigte(!zeigeErledigte)}>
                    Erledigte {zeigeErledigte ? "ausblenden" : "zeigen"} ({erledigtAnzahl})
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
              <div key={t.watchmode_id} className="kd-entdecken-karte kd-suchfokus" tabIndex={-1}
                data-streaming-suchtreffer={`entdecken:${t.watchmode_id}`}
                onClick={() => setExpandedId(expandedId === "e" + t.watchmode_id ? null : "e" + t.watchmode_id)}
                style={{ background: T.saalHoch, borderRadius: 6, padding: "10px 12px", cursor: "pointer" }}>
                <div className="kd-entdecken-kopf">
                  <div className="kd-entdecken-aktionen">
                  <button onClick={(e) => { e.stopPropagation(); toggleMerk(t); }}
                    title={gemerkt(t) ? "Von der Merkliste nehmen" : "Auf die Merkliste"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: gemerkt(t) ? T.wolfram : T.rauch, padding: "0 2px" }}>
                    {gemerkt(t) ? "★" : "☆"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); toggleGesehen(t); }}
                    title={statusVon(entdeckenStatus[t.watchmode_id]) === "gesehen" ? "Gesehen-Markierung entfernen" : "Als gesehen markieren"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: statusVon(entdeckenStatus[t.watchmode_id]) === "gesehen" ? T.wolfram : T.rauch, padding: "0 2px" }}>
                    ✓
                  </button>
                  </div>
                  <div className="kd-entdecken-inhalt">
                  <div className="kd-entdecken-titel" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 17 }}>
                    {t.titel}{t.jahr ? " (" + t.jahr + ")" : ""}{t.typ === "tv_series" ? " · Serie" : ""}
                    {entdeckenStatus[t.watchmode_id] && (
                      <span style={{ ...mono, color: T.wolfram, marginLeft: 8 }}>
                        {statusVon(entdeckenStatus[t.watchmode_id]) === "gesehen" ? "gesehen" : ""}
                        {mediathekIdVon(entdeckenStatus[t.watchmode_id]) ? `${statusVon(entdeckenStatus[t.watchmode_id]) === "gesehen" ? " · " : ""}in deiner Mediathek` : ""}
                        {istBeobachtet(entdeckenStatus[t.watchmode_id]) ? `${statusVon(entdeckenStatus[t.watchmode_id]) === "gesehen" || mediathekIdVon(entdeckenStatus[t.watchmode_id]) ? " · " : ""}⚑ beobachtet` : ""}
                      </span>
                    )}
                  </div>
                  </div>
                </div>
                {gesehenFrage === t.watchmode_id && (
                  <div className="kd-entdecken-frage" onClick={(e) => e.stopPropagation()}>
                    <strong>Auch als unbewerteten Eintrag in die Mediathek übernehmen?</strong>
                    <div>
                      <button style={btnStyle(true)} onClick={() => uebernehmeGesehen(t)}>Ja, in die Mediathek</button>
                      <button style={btnStyle(false)} onClick={() => { setzeStatus(t, "gesehen"); setGesehenFrage(null); }}>Nur als gesehen markieren</button>
                      <button style={btnStyle(false)} onClick={() => setGesehenFrage(null)}>Abbrechen</button>
                    </div>
                  </div>
                )}
                {expandedId === "e" + t.watchmode_id && (
                  <div style={{ marginTop: 6, fontSize: 12, color: T.rauch }} onClick={(e) => e.stopPropagation()}>
                    {(t.genres || []).length > 0 && <span>{t.genres.join(", ")}</span>}
                    {t.typ === "tv_series" && (
                      <div className="kd-entdecken-beobachten">
                        <button type="button" className={istBeobachtet(entdeckenStatus[t.watchmode_id]) ? "aktiv" : ""}
                          aria-pressed={istBeobachtet(entdeckenStatus[t.watchmode_id])}
                          title={istBeobachtet(entdeckenStatus[t.watchmode_id]) ? "Serie nicht mehr beobachten" : "Serie beobachten und im Pinboard verfolgen"}
                          onClick={() => toggleBeobachten(t)}>
                          ⚑ {istBeobachtet(entdeckenStatus[t.watchmode_id]) ? "Beobachtet" : "Beobachten"}
                        </button>
                        <span>Unabhängig davon, ob du die Serie schon gesehen hast.</span>
                      </div>
                    )}
                    {addFilm && formFuer !== t.watchmode_id && !mediathekIdVon(entdeckenStatus[t.watchmode_id]) && (
                      <button style={{ ...btnStyle(true), fontSize: 12, padding: "6px 11px", marginTop: 8 }}
                        onClick={() => setFormFuer(t.watchmode_id)}>
                        {statusVon(entdeckenStatus[t.watchmode_id]) === "gesehen" ? "In Mediathek übernehmen" : "Eintrag erstellen"}
                      </button>
                    )}
                    {formFuer === t.watchmode_id && (
                      <div style={{ marginTop: 8 }}>
                        <FilmForm startOffen
                          kennungenBearbeitbar={false}
                          typOptionen={t.typ === "tv_series" ? ["serie"] : ["film"]}
                          initial={{
                            titel: t.titel, jahr: t.jahr, quelle: "must_watch",
                            genre: (t.genres || []).join(", "), watchmode_id: t.watchmode_id,
                            imdb_id: t.imdb_id, tmdb_id: t.tmdb_id,
                          }}
                          onAdd={(f) => markiereAlsErstellt(t, addFilm(f))}
                          onAddMitPrognose={async (f) => markiereAlsErstellt(
                            t,
                            await addFilmMitPrognose?.(f),
                          )}
                          prognoseAktiv={vorbewertungAktiv}
                          prognoseSperrgrund={prognoseSperrgrund}
                          onDone={() => setFormFuer(null)} />
                      </div>
                    )}
                  </div>
                )}
                <div className="kd-entdecken-meta">
                  <DienstBadges className="kd-entdecken-dienste" dienste={t.dienste} auswahl={auswahl} kompakt={expandedId !== "e" + t.watchmode_id} />
                </div>
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

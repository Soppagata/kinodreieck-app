import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { ERROR_CODES } from "../services/errors.js";
import { norm } from "../lib/match.js";
import { gruppiereDienstBadges, sichtbareDienste } from "../lib/dienste.js";
import { Chip, ChipReihe, SegmentedControl, IconArrowRight } from "../components/ui.jsx";
import { FilmCard } from "../components/FilmCard.jsx";
import { FilmForm } from "../components/EintragForm.jsx";
import { TitelKartenAktionen } from "../components/TitelKartenAktionen.jsx";
import { KatalogRegler } from "../components/KatalogRegler.jsx";
import {
  statusVon, mediathekIdVon, mitMediathekEintrag, gleicheMediathekStatusAb,
  neuerGesehenEintrag, toggleGesehenInStatus,
} from "../lib/staffeln.js";
import { filmwissenRechercheKennung } from "../lib/filmwissen.js";
import {
  sortiereStreamingTitel, streamingAnfangsbuchstabe,
  streamingJahrzehnte, streamingJahrzehntBereich, streamingGenreFilterSichtbar,
  passtInJahrzehntMitKulanz,
} from "../lib/streamingSort.js";
import { mitBestaetigterStringId } from "../controllers/confirmedIdController.js";
import { formatPresentationDate } from "../lib/presentationDate.js";
import { formatTitleFactsDate } from "../lib/titleFacts.js";
import { runtimeConfig } from "../config/runtime.js";
import { isEntdeckenPinned } from "../lib/entdeckenPins.js";
import { projiziereStreamingAnsichten, streamingTitelKennung as streamingId, gleicheStreamingTitel, streamingStatus } from "../lib/streamingProjection.js";
import { StreamingPageWindow, STREAMING_PAGE_PORTION } from "../components/StreamingPageWindow.jsx";
import "../styles/library-followup.css";
import "../styles/streaming-progressive.css";

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

const istStreamingSerie = (titel) => ["tv_series", "serie", "series"]
  .includes(String(titel?.typ || titel?.type || "").toLowerCase());

export function bestaetigteMediathekNavigationId({ titel, master, statusMap, bekannteId = null }) {
  const filme = Array.isArray(master) ? master : [];
  const findeId = (id) => id == null || id === true ? null : filme.find((film) => (
    film?.id != null && String(film.id) === String(id)
  )) || null;

  /* `streaming_bekannt` ist bereits streng einem Masterwerk zugeordnet. Auch
     diese Zuordnung navigiert nur, solange die konkrete Master-ID noch lebt. */
  const bekanntesWerk = findeId(bekannteId);
  if (bekanntesWerk) return bekanntesWerk.id;

  /* Der bestehende Resolver bleibt die Wahrheit für starke Watchmode-/IMDb-/
     TMDb-Identitäten. Eine bloß gespeicherte, inzwischen fremde ID genügt nie. */
  const abgeglichen = gleicheMediathekStatusAb(statusMap, [titel], filme);
  const kandidat = findeId(mediathekIdVon(abgeglichen?.[streamingId(titel)]));
  if (!kandidat) return null;
  const gleicheKennung = [
    [titel?.watchmode_id, kandidat.watchmode_id],
    [titel?.imdb_id, kandidat.imdb_id],
    [titel?.tmdb_id, kandidat.tmdb_id],
  ].some(([links, rechts]) => links != null && rechts != null && String(links) === String(rechts));
  return gleicheKennung ? kandidat.id : null;
}

function DienstBadges({ dienste, webUrls, auswahl, kompakt = false, className }) {
  /* Badges UND web_urls-Links folgen der bereits geprüften Abo-Auswahl der
     sichtbaren Karte; der Link hängt am Dienst und fliegt mit ihm. */
  return (
    <span className={className} style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {gruppiereDienstBadges(sichtbareDienste(dienste, auswahl), { kompakt }).map(({ label, rohnamen }) => {
        const d = rohnamen[0];
        const url = rohnamen.map((name) => webUrls && webUrls[name]).find(Boolean);
        const stil = {
          fontFamily: "'Space Grotesk', sans-serif", fontSize: "calc(12px * var(--kd-schriftfaktor, 1))", lineHeight: 1.45,
          color: T.kartenTextWeich, background: "transparent", borderRadius: 5, padding: "2px 7px",
          border: "1px solid " + T.kartenTextWeich, textDecoration: "none", display: "inline-block",
          maxWidth: "100%", overflowWrap: "anywhere", whiteSpace: "normal",
        };
        return url
          ? <a key={label} href={url} target="_blank" rel="noopener noreferrer" style={{ ...stil, display: "inline-flex", alignItems: "center", minHeight: 44 }} onClick={(e) => e.stopPropagation()} title={"Bei " + rohnamen.join(", ") + " öffnen"}>{label}<span aria-hidden="true" style={{ display: "inline-flex", marginLeft: 4, transform: "rotate(-45deg)" }}><IconArrowRight size={12} /></span></a>
          : <span key={label} title={rohnamen.join(", ")} style={stil}>{label}</span>;
      })}
    </span>
  );
}

export function TitleFactsDetails({ titel, includeDescription = true }) {
  const description = String(titel?.beschreibung ?? titel?.description ?? "").trim();
  const runtime = Number(titel?.laufzeit_minuten ?? titel?.runtimeMinutes);
  const hasRuntime = Number.isInteger(runtime) && runtime > 0;
  const genres = Array.isArray(titel?.genres) ? titel.genres : [];
  const evidence = titel?.descriptionEvidence;
  const source = evidence?.source === "watchmode" ? "Watchmode" : evidence?.source === "flixpatrol" ? "FlixPatrol" : null;
  const checked = formatTitleFactsDate(evidence?.checkedAt ?? evidence?.fetchedAt);
  if (!description && !hasRuntime && !genres.length && !source) return null;
  return <div data-title-facts="title-facts-projection-v1" style={{ marginTop: 8, lineHeight: 1.55 }}>
    {includeDescription && description ? <div>{description}</div> : null}
    <div style={{ marginTop: includeDescription && description ? 6 : 0 }}>
      {hasRuntime ? <span>{runtime} Minuten</span> : null}
      {hasRuntime && genres.length ? <span> · </span> : null}
      {genres.length ? <span>{genres.join(", ")}</span> : null}
    </div>
    {runtimeConfig.appEnvironment !== "production" && source
      ? <small>Beschreibung: {source}{checked ? ` · geprüft ${checked}` : ""}</small> : null}
  </div>;
}

function PlattformFilter({ wert, optionen, onChange, name }) {
  return (
    <label className="kd-streamfilter-plattform">
      <span>Plattform</span>
      <select value={wert || ""} onChange={(event) => onChange(event.target.value || null)}
        aria-label={`${name}: Plattform filtern`}>
        <option value="">Alle Plattformen</option>
        {optionen.map((dienst) => <option key={dienst} value={dienst}>{dienst}</option>)}
      </select>
    </label>
  );
}

function SortierFilter({ feld, richtung, onFeld, onRichtung, name, entdecken = false }) {
  return (
    <div className="kd-streamfilter-sortierung" {...(entdecken ? { "data-tour": "entdecken-sortierung" } : {})}>
      <label>
        <span>Sortieren nach</span>
        <select value={feld} onChange={(event) => onFeld(event.target.value)}
          aria-label={`${name}: Sortierfeld`}>
          <option value="titel">Titel</option>
          <option value="jahr">Jahr</option>
          {entdecken && <option value="art">Art</option>}
          <option value="anbieter">Anbieter</option>
        </select>
      </label>
      <label>
        <span>Richtung</span>
        <select value={richtung} onChange={(event) => onRichtung(event.target.value)}
          aria-label={`${name}: Sortierrichtung`}>
          <option value="auf">Aufsteigend</option>
          <option value="ab">Absteigend</option>
        </select>
      </label>
    </div>
  );
}

export function StreamingTab({
  bekannt, entdecken, auswahl, auswahlGeladen = true, merkliste = [], toggleMerk, addFilm, master, updateFilm,
  addFilmMitPrognose, vorbewertungAktiv = false, prognoseLaufId = null,
  prognoseSperrgrund = null, prognoseFehler = {}, aktuelleProfilVersion = null,
  onPrognoseErstellen, onPrognoseStatus,
  filmwissenAktiv = false, filmwissenRechercheAktiv = false,
  filmwissenProFilm = {}, filmwissenRechercheLaufId = null,
  onFilmwissenLaden, onFilmwissenRecherchieren,
  mustwatchIds, datenGesperrt = false, katalogInfo = null, angemeldet = false,
  fokusTreffer = null, onFokusVerbraucht,
  onAllesKatalogLaden,
  recommendationPins = [], onRecommendationPinToggle,
  streamingNeu = { status: "idle", neueIds: [] },
  entdeckenStatus = {}, schreibeEntdeckenStatus = async () => false,
  onEintragKlick,
  streamingPage = null, onStreamingPageQuery,
}) {
  const progressiveEnabled = streamingPage?.enabled === true;
  const initialProgressiveView = streamingPage?.view === "all" ? "entdecken"
    : streamingPage?.view === "new" ? "neu" : "programm";
  const initialProgressiveState = useMemo(() => {
    if (!progressiveEnabled || !streamingPage?.queryKey || typeof sessionStorage === "undefined") return {};
    try { return JSON.parse(sessionStorage.getItem(`kd:streaming-ui:${streamingPage.queryKey}`) || "{}"); }
    catch { return {}; }
  }, []);
  const bereichRef = useRef(null);
  const [ansicht, setAnsicht] = useState(() => progressiveEnabled
    ? (initialProgressiveState.ansicht || initialProgressiveView) : "programm");
  const [expandedId, setExpandedId] = useState(null);
  const [nurWunsch, setNurWunsch] = useState(initialProgressiveState.nurWunsch === true);
  const [suche, setSuche] = useState(initialProgressiveState.suche || "");
  const [sortP, setSortP] = useState(initialProgressiveState.sortP || "titel");
  const [sortRichtungP, setSortRichtungP] = useState(initialProgressiveState.sortRichtungP || "auf");
  const [sortE, setSortE] = useState(initialProgressiveState.sortE || "titel");
  const [sortRichtungE, setSortRichtungE] = useState(initialProgressiveState.sortRichtungE || "auf");
  const [genreE, setGenreE] = useState(initialProgressiveState.genreE || null);
  const [dekadeE, setDekadeE] = useState(initialProgressiveState.dekadeE || null);
  const [typE, setTypE] = useState(initialProgressiveState.typE || null);
  const [plattformP, setPlattformP] = useState(initialProgressiveState.plattformP || null);
  const [nurBewertet, setNurBewertet] = useState(initialProgressiveState.nurBewertet === true);
  const [buchstabeP, setBuchstabeP] = useState(initialProgressiveState.buchstabeP || null);
  const [dekadeP, setDekadeP] = useState(initialProgressiveState.dekadeP || null);
  const [plattformE, setPlattformE] = useState(initialProgressiveState.plattformE || null);
  const [statusFilterE, setStatusFilterE] = useState(initialProgressiveState.statusFilterE || null);
  const [buchstabeE, setBuchstabeE] = useState(initialProgressiveState.buchstabeE || null);
  /* Merkliste bleibt der separate Exportpfad; Dashboard-Pins laufen ausschliesslich
     ueber recommendationPins und den bestehenden Entdecken-Pinboardvertrag. */
  const entdeckenStatusRef = useRef(entdeckenStatus);
  entdeckenStatusRef.current = entdeckenStatus;
  /* `bekannt.titel` enthält ausschließlich bereits streng einem Masterwerk
     zugeordnete Titel. Diese Zuordnung ist stärker als der spätere reine
     External-ID-Abgleich und steht deshalb auch ohne ursprüngliche externe
     Kennung des Masterwerks sofort für Alles und Neu bereit. */
  const progressivePageItems = progressiveEnabled && Array.isArray(streamingPage?.items) ? streamingPage.items : [];
  const bekannteMediathekIds = useMemo(() => new Map((progressiveEnabled ? progressivePageItems : (bekannt?.titel || []))
    .filter((titel) => streamingId(titel) != null && (progressiveEnabled
      ? (typeof titel?.library_id === "string" || typeof titel?.library_id === "number")
      : (typeof titel?.id === "string" || typeof titel?.id === "number")))
    .map((titel) => [String(streamingId(titel)), progressiveEnabled ? titel.library_id : titel.id])),
  [progressiveEnabled, progressivePageItems, bekannt]);
  const bekannteMediathekIdFuer = useCallback(
    (titel) => streamingId(titel) == null ? null : bekannteMediathekIds.get(String(streamingId(titel))) ?? null,
    [bekannteMediathekIds],
  );
  const mediathekIdFuer = useCallback((titel) => (
    mediathekIdVon(streamingStatus(entdeckenStatus, titel)) ?? bekannteMediathekIdFuer(titel)
  ), [entdeckenStatus, bekannteMediathekIdFuer]);
  const masterIndex = useMemo(() => new Map((Array.isArray(master) ? master : [])
    .filter((film) => film?.id != null).map((film) => [String(film.id), film])), [master]);
  const bestaetigteMediathekIdFuer = useCallback((titel) => {
    if (progressiveEnabled) {
      const id = bekannteMediathekIdFuer(titel);
      return id != null && masterIndex.has(String(id)) ? id : null;
    }
    return bestaetigteMediathekNavigationId({
      titel, master, statusMap: entdeckenStatus, bekannteId: bekannteMediathekIdFuer(titel),
    });
  }, [progressiveEnabled, masterIndex, master, entdeckenStatus, bekannteMediathekIdFuer]);
  const [sichtbarP, setSichtbarP] = useState(Math.max(STREAMING_PAGE_PORTION, Number(initialProgressiveState.visible) || STREAMING_PAGE_PORTION));
  const [sichtbarE, setSichtbarE] = useState(progressiveEnabled
    ? Math.max(STREAMING_PAGE_PORTION, Number(initialProgressiveState.visible) || STREAMING_PAGE_PORTION) : 200);
  const [formFuer, setFormFuer] = useState(null); // watchmode_id mit offener Eingabemaske
  const [gesehenFrage, setGesehenFrage] = useState(null);
  const [gesehenSpeichert, setGesehenSpeichert] = useState(null);
  const gesehenSpeichertRef = useRef(false);
  const [fokusOverride, setFokusOverride] = useState(null);
  const markiereAlsErstellt = useCallback(async (t, id) => {
    if (typeof id !== "string" || !id) return null;
    const gespeichert = await schreibeEntdeckenStatus((prev) => ({
      ...prev,
      [streamingId(t)]: mitMediathekEintrag(prev[streamingId(t)], t, id),
    }));
    return gespeichert === false || gespeichert == null ? null : id;
  }, [schreibeEntdeckenStatus]);
  useEffect(() => {
    if (!fokusTreffer) return undefined;
    setFokusOverride({ art: fokusTreffer.art, ref: String(fokusTreffer.ref) });
    setAnsicht(fokusTreffer.art === "entdecken" ? "entdecken" : "programm");
    setSuche(fokusTreffer.art === "programm" ? (fokusTreffer.titel || "") : "");
    setPlattformP(null); setNurBewertet(false); setBuchstabeP(null); setDekadeP(null); setNurWunsch(false);
    setPlattformE(null); setStatusFilterE(null); setBuchstabeE(null);
    setGenreE(null); setDekadeE(null); setTypE(null);
    setSichtbarE(progressiveEnabled ? STREAMING_PAGE_PORTION : 200);
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
      ziel.focus?.({ preventScroll: true });
      ziel.scrollIntoView?.({ behavior: "auto", block: "center" });
      /* Nach dem Ansichts-/Filter-Render die endgültige Geometrie bestätigen.
         Ein unmittelbarer Sprung ist hier absichtlich verlässlicher als eine
         Smooth-Scroll-Animation, die iOS bei Layoutänderungen abbrechen kann. */
      bestaetigung = window.setTimeout(() => {
        const aktuell = [...(bereichRef.current?.querySelectorAll("[data-streaming-suchtreffer]") || [])]
          .find((element) => element.dataset.streamingSuchtreffer === schluessel);
        if (!aktuell) return;
        aktuell.focus?.({ preventScroll: true });
        aktuell.scrollIntoView?.({ behavior: "auto", block: "center" });
        onFokusVerbraucht?.();
      }, 120);
    });
    return () => { cancelAnimationFrame(frame); window.clearTimeout(bestaetigung); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokusTreffer, ansicht, expandedId, suche, fokusOverride, bekannt, entdecken]);
  /* Filter-Panel startet bewusst immer zu. Persönliche Filterwerte bleiben
     stehen; der Sichtzustand lebt ausschließlich pro Tab-Instanz. */
  const [streamFilterOffen, setStreamFilterOffen] = useState(false);
  const toggleStreamFilter = () => setStreamFilterOffen((offen) => !offen);
  const setzeStatus = async (t, wert) => {
    const gespeichert = await schreibeEntdeckenStatus((prev) => {
      const next = { ...prev };
      const roh = next[streamingId(t)];
      const basis = roh && typeof roh === "object" ? roh : {};
      if (statusVon(roh) === wert) {
        const { status: _status, gesehen_am: _gesehenAm, ...rest } = basis;
        if (Object.keys(rest).length) next[streamingId(t)] = rest;
        else delete next[streamingId(t)];
      } else next[streamingId(t)] = wert === "gesehen"
        ? { ...basis, ...neuerGesehenEintrag(t) }
        : { ...basis, status: wert };
      return next;
    });
    return gespeichert !== false && gespeichert != null;
  };
  const toggleGesehen = async (t) => {
    const roh = streamingStatus(entdeckenStatusRef.current, t);
    const bekannteId = bekannteMediathekIdFuer(t);
    if (statusVon(roh) === "gesehen" || mediathekIdVon(roh) || bekannteId) {
      return await schreibeEntdeckenStatus((prev) => {
        const aktuell = prev?.[streamingId(t)];
        const mediathekId = mediathekIdVon(aktuell) ?? bekannteId;
        const mitSichererZuordnung = mediathekIdVon(aktuell) != null || mediathekId == null
          ? prev
          : { ...(prev || {}), [streamingId(t)]: mitMediathekEintrag(aktuell, t, mediathekId) };
        return toggleGesehenInStatus(mitSichererZuordnung, t);
      });
    }
    setExpandedId("e" + streamingId(t));
    setGesehenFrage(streamingId(t));
  };

  const uebernehmeGesehen = async (t) => {
    if (gesehenSpeichertRef.current) return false;
    gesehenSpeichertRef.current = true;
    setGesehenSpeichert(streamingId(t));
    try {
      const id = await mitBestaetigterStringId(() => addFilm?.({
        titel: t.titel, originaltitel: t.titel, jahr: t.jahr ?? null, jahr_bis: null,
        typ: istStreamingSerie(t) ? "serie" : "film", quelle: "must_watch",
        kategorie: null, bewertet_von: null, bewertung: null, genre: t.genres || [], tags: [],
        begruendung: "", notiz: "", status: "gesetzt", watchmode_id: t.watchmode_id, streaming_id: t.streaming_id, motn_id: t.motn_id,
        ...(t.imdb_id ? { imdb_id: t.imdb_id } : {}),
        ...(t.tmdb_id ? { tmdb_id: t.tmdb_id } : {}),
      }), async (bestaetigteId) => {
        const gespeichert = await schreibeEntdeckenStatus((prev) => ({
          ...prev,
          [streamingId(t)]: mitMediathekEintrag({ ...(prev[streamingId(t)] && typeof prev[streamingId(t)] === "object" ? prev[streamingId(t)] : {}), ...neuerGesehenEintrag(t) }, t, bestaetigteId),
        }));
        return gespeichert !== false && gespeichert != null;
      });
      if (!id) return false;
      setGesehenFrage(null);
      return true;
    } finally { gesehenSpeichertRef.current = false; setGesehenSpeichert(null); }
  };

  const markiereNurGesehen = async (t) => {
    if (gesehenSpeichertRef.current) return false;
    gesehenSpeichertRef.current = true;
    setGesehenSpeichert(streamingId(t));
    try {
      const ok = await setzeStatus(t, "gesehen");
      if (ok) setGesehenFrage(null);
      return ok;
    } finally { gesehenSpeichertRef.current = false; setGesehenSpeichert(null); }
  };

  const pageItems = progressivePageItems;
  const datenDa = progressiveEnabled || !!(bekannt && bekannt.stand);
  const entdeckenDa = !!(entdecken && entdecken.stand);
  const projektion = useMemo(() => progressiveEnabled ? {
    meinProgramm: [], alleTitel: [], ausgewaehlt: [], vollstaendig: true,
  } : projiziereStreamingAnsichten({
    bekannt, entdecken, auswahl, auswahlGeladen,
  }), [progressiveEnabled, bekannt, entdecken, auswahl, auswahlGeladen]);
  const entdeckenVollstaendig = projektion.vollstaendig;
  /* Eine leere, bereits geladene Auswahl bedeutet ausdrücklich: keine
     Dienste. Während des Ladens wird ebenfalls kein alter Kontostand gezeigt. */
  const dienstOk = useCallback((t) => auswahlGeladen && auswahl.length > 0
    && (t.dienste || []).some((d) => auswahl.includes(d)), [auswahl, auswahlGeladen]);
  /* Plattform-Optionen = ALLE angehakten Dienste — auch ohne Katalog-Titel (Max, 19.07.):
     die Abo-Auswahl soll im Filter sichtbar sein, ein leerer Treffer ist ok. Früher auf
     bekannt.dienste gegatet; das ist aber unzuverlässig (führt z. B. Joyn NICHT, obwohl Titel
     Joyn getaggt sind, und listet umgekehrt titel-lose Dienste). Ohne Auswahl: die Katalog-Dienste. */
  const plattformOptionenP = useMemo(() => {
    if (progressiveEnabled) return [...(auswahl || [])].sort((a, b) => a.localeCompare(b, "de"));
    if (auswahl && auswahl.length) return [...auswahl].sort((a, b) => a.localeCompare(b, "de"));
    const dienste = new Set([...(bekannt?.dienste || [])]);
    for (const titel of bekannt?.titel || []) for (const dienst of titel.dienste || []) dienste.add(dienst);
    return [...dienste].sort((a, b) => a.localeCompare(b, "de"));
  }, [progressiveEnabled, auswahl, bekannt]);
  const plattformOptionenE = useMemo(() => {
    if (progressiveEnabled) return [...(auswahl || [])].sort((a, b) => a.localeCompare(b, "de"));
    if (auswahl && auswahl.length) return [...auswahl].sort((a, b) => a.localeCompare(b, "de"));
    const dienste = new Set([...(entdecken?.dienste || []), ...(bekannt?.dienste || [])]);
    for (const titel of [...(bekannt?.titel || []), ...(entdecken?.titel || [])]) {
      for (const dienst of titel.dienste || []) dienste.add(dienst);
    }
    return [...dienste].sort((a, b) => a.localeCompare(b, "de"));
  }, [progressiveEnabled, auswahl, bekannt, entdecken]);
  const plattformOkP = useCallback((t) => !plattformP || (t.dienste || []).includes(plattformP), [plattformP]);
  const plattformOkE = useCallback((t) => !plattformE || (t.dienste || []).includes(plattformE), [plattformE]);

  const programm = useMemo(() => {
    if (progressiveEnabled) return pageItems.map((titel) => ({
      ...titel, id: titel.library_id ?? titel.id,
    }));
    if (!datenDa || !auswahlGeladen) return [];
    let l = projektion.meinProgramm.filter((t) => plattformOkP(t));
    /* Must-Watch-Filter liest die LISTE (Verknüpfung auf Master-ID) — nicht mehr
       das eingebackene must_watch-Flag aus dem Katalog-Job (kann veraltet sein). */
    if (nurWunsch) l = l.filter((f) => mustwatchIds && mustwatchIds.has(f.id));
    if (nurBewertet) l = l.filter((f) => f.bewertung != null);
    if (buchstabeP) l = l.filter((f) => streamingAnfangsbuchstabe(f.titel) === buchstabeP);
    if (streamingJahrzehntBereich(dekadeP)) l = l.filter((f) => passtInJahrzehntMitKulanz(f.jahr, dekadeP));
    if (suche.trim()) { const nq = norm(suche); l = l.filter((f) => norm(f.titel || "").includes(nq)); }
    return sortiereStreamingTitel(l, sortP, sortRichtungP);
  }, [progressiveEnabled, pageItems, datenDa, auswahlGeladen, projektion.meinProgramm, plattformOkP, nurWunsch, nurBewertet, buchstabeP, dekadeP, mustwatchIds, suche, sortP, sortRichtungP]);

  const vollKatalogTitel = projektion.alleTitel;
  const neuIdSet = useMemo(() => new Set((streamingNeu?.neueIds || []).map(String)), [streamingNeu]);
  const neuTitel = useMemo(() => streamingNeu?.status === "ready"
    ? projektion.ausgewaehlt.filter((titel) => neuIdSet.has(String(streamingId(titel))))
    : [], [projektion.ausgewaehlt, neuIdSet, streamingNeu?.status]);
  const filterQuelleE = progressiveEnabled ? pageItems : (ansicht === "neu" ? neuTitel : projektion.ausgewaehlt);

  const genresE = useMemo(() => {
    const gruppen = new Map();
    filterQuelleE.forEach((titel) => (titel.genres || []).forEach((genre) => {
      const label = String(genre || "").trim();
      const key = norm(label);
      if (!key) return;
      const bisher = gruppen.get(key) || { key, label, anzahl: 0 };
      bisher.anzahl += 1;
      gruppen.set(key, bisher);
    }));
    return [...gruppen.values()].sort((a, b) => b.anzahl - a.anzahl || a.label.localeCompare(b.label, "de"));
  }, [filterQuelleE]);
  const genreFilterSichtbarE = useMemo(() => streamingGenreFilterSichtbar(filterQuelleE), [filterQuelleE]);
  useEffect(() => {
    if (!genreFilterSichtbarE && genreE) setGenreE(null);
  }, [genreFilterSichtbarE, genreE]);

  const statusAnzahlenE = useMemo(() => {
    return filterQuelleE.reduce((anzahl, titel) => {
      const status = streamingStatus(entdeckenStatus, titel);
      return anzahl + (statusVon(status) === "gesehen" ? 1 : 0);
    }, 0);
  }, [filterQuelleE, entdeckenStatus]);

  /* Starke Katalogkennungen gleichen Entdecken bidirektional mit der Mediathek
     ab. Vorhanden bedeutet ausdrücklich NICHT automatisch gesehen: Eine
     Mediathek kann auch ungesehene und Must-Watch-Einträge enthalten. */
  useEffect(() => {
    if (progressiveEnabled || !Array.isArray(master)) return;
    void schreibeEntdeckenStatus((prev) => gleicheMediathekStatusAb(prev, vollKatalogTitel, master));
  }, [progressiveEnabled, master, vollKatalogTitel, schreibeEntdeckenStatus]);

  const katalogListe = useMemo(() => {
    if (progressiveEnabled) return pageItems;
    if (ansicht === "entdecken" && !entdeckenDa) return [];
    if (ansicht === "neu" && streamingNeu?.status !== "ready") return [];
    let l = filterQuelleE.filter((t) => (
      ansicht === "entdecken" && fokusOverride?.art === "entdecken" && String(streamingId(t)) === fokusOverride.ref
    ) || (dienstOk(t) && plattformOkE(t)));
    if (statusFilterE === "gesehen") l = l.filter((t) => statusVon(streamingStatus(entdeckenStatus, t)) === "gesehen");
    if (buchstabeE) l = l.filter((t) => streamingAnfangsbuchstabe(t.titel) === buchstabeE);
    if (genreFilterSichtbarE && genreE) l = l.filter((t) => (t.genres || []).some((genre) => norm(genre) === genreE));
    if (streamingJahrzehntBereich(dekadeE)) l = l.filter((t) => passtInJahrzehntMitKulanz(t.jahr, dekadeE));
    if (typE === "movie") l = l.filter((t) => !istStreamingSerie(t));
    if (typE === "tv_series") l = l.filter(istStreamingSerie);
    return sortiereStreamingTitel(l, sortE, sortRichtungE);
  }, [progressiveEnabled, pageItems, ansicht, entdeckenDa, streamingNeu?.status, filterQuelleE, dienstOk, plattformOkE,
    statusFilterE, buchstabeE, genreE, genreFilterSichtbarE, dekadeE, typE,
    sortE, sortRichtungE, entdeckenStatus, fokusOverride]);
  // Bei Filterwechsel wieder bei 200 anfangen (sonst würden Tausende gerendert).
  const windowQueryKeyRef = useRef(streamingPage?.queryKey || "");
  useEffect(() => {
    const nextKey = streamingPage?.queryKey || "";
    if (windowQueryKeyRef.current === nextKey) return;
    windowQueryKeyRef.current = nextKey;
    setSichtbarP(STREAMING_PAGE_PORTION);
    setSichtbarE(progressiveEnabled ? STREAMING_PAGE_PORTION : 200);
  }, [progressiveEnabled, streamingPage?.queryKey]);
  const sichtbareKatalogTitel = useMemo(() => {
    const basis = katalogListe.slice(0, sichtbarE);
    if (ansicht !== "entdecken" || fokusOverride?.art !== "entdecken") return basis;
    const ziel = katalogListe.find((titel) => String(streamingId(titel)) === fokusOverride.ref);
    if (!ziel || basis.some((titel) => String(streamingId(titel)) === fokusOverride.ref)) return basis;
    /* Der konkrete Navigationsauftrag muss auch dann ein DOM-Ziel erhalten,
       wenn seine sortierte Position hinter der 200er-Paginierungsgrenze liegt.
       Nur diese eine Karte wird ergänzt; der übrige Vollkatalog bleibt billig. */
    return [...basis, ziel];
  }, [ansicht, katalogListe, sichtbarE, fokusOverride]);

  const dekadenP = useMemo(() => streamingJahrzehnte(progressiveEnabled ? pageItems : (bekannt?.titel || [])), [progressiveEnabled, pageItems, bekannt]);
  const dekadenE = useMemo(() => streamingJahrzehnte(filterQuelleE), [filterQuelleE]);

  const gemerkt = (t) => merkliste.some((m) => gleicheStreamingTitel(m,t));
  const pinButton = (t) => {
    const gepinnt = isEntdeckenPinned(recommendationPins, t);
    const titel = t.titel || t.title || "Titel";
    return <button type="button" className={`kd-entdecken-pin${gepinnt ? " aktiv" : ""}`}
      aria-label={gepinnt ? `${titel} vom Pinboard lösen` : `${titel} am Pinboard anpinnen`}
      aria-pressed={gepinnt} title={gepinnt ? "Vom Pinboard lösen" : "Am Pinboard anpinnen"}
      onClick={(event) => { event.stopPropagation(); onRecommendationPinToggle?.(t); }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill={gepinnt ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4h8l-1 6 3 3v1H6v-1l3-3-1-6Z" /><path d="M12 14v6" />
      </svg>
    </button>;
  };
  const katalogAktionen = (t) => {
    const gepinnt = isEntdeckenPinned(recommendationPins, t);
    const titel = t.titel || t.title || "Titel";
    const gesehen = statusVon(streamingStatus(entdeckenStatus, t)) === "gesehen";
    return <TitelKartenAktionen
      pinAktiv={gepinnt}
      pinLabel={gepinnt ? `${titel} vom Pinboard lösen` : `${titel} am Pinboard anpinnen`}
      onPin={() => onRecommendationPinToggle?.(t)}
      markiert={gemerkt(t)}
      markierLabel={gemerkt(t) ? "Von der Merkliste nehmen" : "Auf die Merkliste"}
      onMarkieren={() => toggleMerk(t)}
      gesehen={gesehen}
      gesehenLabel={gesehen ? "Gesehen-Markierung entfernen" : "Als gesehen markieren"}
      onGesehen={() => { void toggleGesehen(t); }} />;
  };
  const aendereFilter = (setter, wert) => {
    setFokusOverride(null);
    setter(wert);
  };
  const aendereDekadeP = (wert) => {
    aendereFilter(setDekadeP, streamingJahrzehntBereich(wert) ? wert : null);
    setSortP("jahr");
    setSortRichtungP("auf");
  };
  const aendereDekadeE = (wert) => {
    aendereFilter(setDekadeE, streamingJahrzehntBereich(wert) ? wert : null);
    setSortE("jahr");
    setSortRichtungE("auf");
  };
  const aendereAnsicht = (naechsteAnsicht) => {
    setAnsicht(naechsteAnsicht);
    if (!progressiveEnabled && (naechsteAnsicht === "entdecken" || naechsteAnsicht === "neu")) void onAllesKatalogLaden?.();
  };
  const aktiveFilterP = Number(!!plattformP) + Number(nurBewertet) + Number(nurWunsch)
    + Number(!!buchstabeP) + Number(!!streamingJahrzehntBereich(dekadeP));
  const aktiveFilterE = Number(!!plattformE) + Number(!!statusFilterE) + Number(!!typE)
    + Number(genreFilterSichtbarE && !!genreE) + Number(!!streamingJahrzehntBereich(dekadeE)) + Number(!!buchstabeE);
  /* Die bestehende zugängliche Filterkennung bleibt für gespeicherte
     Bedienhilfen stabil; der sichtbare Ansichtsname lautet weiterhin Alles. */
  const katalogAnsicht = ansicht === "neu" ? "Neu" : "Entdecken";
  const katalogAnsichtBereit = progressiveEnabled || (ansicht === "neu"
    ? streamingNeu?.status === "ready"
    : entdeckenDa && entdeckenVollstaendig && auswahlGeladen);
  const allesAnzahlFuerAuswahl = projektion.ausgewaehlt.length;
  const neuAnzahlFuerAuswahl = useMemo(
    () => neuTitel.filter(dienstOk).length,
    [neuTitel, dienstOk],
  );

  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 10px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };

  const progressiveView = ansicht === "entdecken" ? "all" : ansicht === "neu" ? "new" : "library";
  const progressiveFilters = {
    suche: ansicht === "programm" ? suche : "",
    plattform: ansicht === "programm" ? plattformP : plattformE,
    typ: ansicht === "programm" ? null : typE,
    genre: ansicht === "programm" ? null : genreE,
    dekade: ansicht === "programm" ? dekadeP : dekadeE,
    buchstabe: ansicht === "programm" ? buchstabeP : buchstabeE,
    sort: ansicht === "programm" ? sortP : sortE,
    richtung: ansicht === "programm" ? sortRichtungP : sortRichtungE,
    status: ansicht === "programm" ? null : statusFilterE,
    nurWunsch: ansicht === "programm" && nurWunsch,
    nurBewertet: ansicht === "programm" && nurBewertet,
  };
  const progressiveQuerySignature = progressiveEnabled ? JSON.stringify([progressiveView, progressiveFilters]) : "";
  const lastProgressiveQueryRef = useRef("");
  useEffect(() => {
    if (!progressiveEnabled || typeof onStreamingPageQuery !== "function") return;
    if (lastProgressiveQueryRef.current === progressiveQuerySignature) return;
    lastProgressiveQueryRef.current = progressiveQuerySignature;
    onStreamingPageQuery({ view: progressiveView, filters: progressiveFilters });
  }, [progressiveEnabled, onStreamingPageQuery, progressiveQuerySignature]);

  const progressiveUiSnapshotRef = useRef(null);
  progressiveUiSnapshotRef.current = {
    ansicht, sichtbarP, sichtbarE, suche, sortP, sortRichtungP, sortE, sortRichtungE,
    genreE, dekadeE, typE, plattformP, nurBewertet, nurWunsch, buchstabeP,
    dekadeP, plattformE, statusFilterE, buchstabeE,
  };

  useEffect(() => {
    if (!progressiveEnabled || !streamingPage?.queryKey || typeof sessionStorage === "undefined") return undefined;
    const storageKey = `kd:streaming-ui:${streamingPage.queryKey}`;
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        const savedView = saved.ansicht === "entdecken" ? "all" : saved.ansicht === "neu" ? "new" : "library";
        if (savedView === progressiveView) {
          setSichtbarP(Math.max(STREAMING_PAGE_PORTION, Number(saved.visible) || STREAMING_PAGE_PORTION));
          setSichtbarE(Math.max(STREAMING_PAGE_PORTION, Number(saved.visible) || STREAMING_PAGE_PORTION));
          requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, Number(saved.scrollY) || 0), behavior: "auto" }));
        }
      } catch { /* ungültigen kleinen UI-Zustand ignorieren */ }
    }
    return () => {
      const state = progressiveUiSnapshotRef.current || {};
      const visible = state.ansicht === "programm" ? state.sichtbarP : state.sichtbarE;
      try { sessionStorage.setItem(storageKey, JSON.stringify({ ...state, visible, scrollY: window.scrollY })); }
      catch { /* Sitzungszustand ist Komfort; Karten und Query bleiben nutzbar. */ }
    };
  }, [progressiveEnabled, streamingPage?.queryKey]);

  if (datenGesperrt) return (
    <section ref={bereichRef} className="kd-streaming-tab">
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "18px 20px", fontSize: 14, color: T.rauch, lineHeight: 1.7 }}>
        <strong style={{ color: T.wolfram }}>Datenbankzugang nicht eingerichtet.</strong> Melde dich an und öffne Settings → Verbindung wiederherstellen.
      </div>
    </section>
  );

  return (
    <section ref={bereichRef} className="kd-streaming-tab">
      {/* dataTour="streaming-views" bleibt am SegmentedControl-Container — Tour-Anker. */}
      <SegmentedControl className="kd-streaming-ansichten" dataTour="streaming-views" value={ansicht} onChange={aendereAnsicht}
        options={[
          { id: "programm", label: "Mein Programm", badge: progressiveEnabled ? streamingPage?.counts?.library : (datenDa && auswahlGeladen ? programm.length : undefined) },
          { id: "entdecken", label: "Alles", badge: progressiveEnabled ? streamingPage?.counts?.all : (entdeckenVollstaendig && auswahlGeladen ? (ansicht === "entdecken" ? katalogListe.length : allesAnzahlFuerAuswahl) : undefined) },
          { id: "neu", label: "Neu", badge: progressiveEnabled ? streamingPage?.counts?.new : (streamingNeu?.status === "ready" ? (ansicht === "neu" ? katalogListe.length : neuAnzahlFuerAuswahl) : undefined) },
        ]} />

      {progressiveEnabled && typeof streamingPage?.total === "number" ? <div className="kd-streaming-page-summary" aria-live="polite">
        <strong>{streamingPage.total} Treffer</strong><span>für diese Ansicht und Filter</span>
        {streamingPage.fromCache ? <span>· {runtimeConfig.appEnvironment === "production" ? "zuletzt verfügbare Titel" : "aus dem Browser-Speicher"}</span> : null}
        {streamingPage.nextExpiryAt ? <span>· Neu sichtbar bis {formatPresentationDate(streamingPage.nextExpiryAt)}</span> : null}
      </div> : null}

      {!datenDa && (
        <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px", fontSize: 14, color: T.rauch, lineHeight: 1.7 }}>
          {katalogInfo?.code === ERROR_CODES.NO_DEMO_DATA ? (
            /* Noch nichts veröffentlicht ist weder ein Server- noch ein
               Anmeldungsproblem — und schon gar keine „ungültige Antwort". */
            <><strong style={{ color: T.wolfram }}>Für den öffentlichen Zugang sind noch keine Beispieldaten veröffentlicht.</strong> Der
              laufende Streamingkatalog steht nach der Anmeldung unter Settings → Konto bereit.</>
          ) : katalogInfo?.code === ERROR_CODES.INVALID_KEY ? (
            <><strong style={{ color: T.wolfram }}>Der Datenbankzugang wird nicht akzeptiert.</strong> Öffne
              Settings → Verbindung wiederherstellen. Eine erneute Anmeldung allein behebt diesen Fehler nicht.</>
          ) : katalogInfo?.anmeldungNoetig ? (
            <><strong style={{ color: T.wolfram }}>Für den aktuellen Streamingkatalog ist eine Anmeldung nötig.</strong> Melde
              dich unter Settings → Konto an. Ohne Anmeldung zeigt die App den Demo-Schnappschuss —
              der steht für diesen Zugang gerade nicht bereit.</>
          ) : katalogInfo?.fehler ? (
            <><strong style={{ color: T.wolfram }}>Streamingkatalog konnte nicht geladen werden.</strong> {katalogInfo.fehler}
              {" "}Der Katalog wird vorbereitet ausgeliefert; unter Settings → Verbindung wiederherstellen kannst du ihn neu laden.
              {!angemeldet && " Als Gast siehst du ohnehin nur den Demo-Schnappschuss; angemeldet käme der laufende Katalog."}</>
          ) : (
            <><strong style={{ color: T.wolfram }}>Streaming-Tab leer.</strong> Für diesen Zugang ist noch
              kein Katalog hinterlegt. Öffne Settings → Verbindung wiederherstellen und lade den Katalog neu.</>
          )}
        </div>
      )}

      {datenDa && bekannt?.demo && katalogInfo?.variante !== "live" && (
        <div style={{ background: "rgba(227,166,59,0.12)", border: "1px solid " + T.wolfram, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: T.leinwandTief }}>
          <strong style={{ color: T.wolfram }}>Demo-Beispieldaten</strong> — die Titel hier sind Platzhalter. Echte Inhalte erscheinen, sobald ein Katalog verfügbar ist.
        </div>
      )}

      {/* Ein abgelaufener Schnappschuss ist kein aktueller Katalog — sagen statt zeigen. */}
      {datenDa && katalogInfo?.abgelaufen && (
        <div style={{ background: "rgba(217,106,90,0.12)", border: "1px solid " + T.gefahr, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: T.leinwandTief }}>
          <strong style={{ color: T.gefahr }}>Verfügbarkeiten nicht mehr aktuell.</strong>
          {katalogInfo.variante === "demo" ? " Mit einer Anmeldung siehst du den laufenden Katalog." : ""}
        </div>
      )}
      {datenDa && katalogInfo?.ausCache && (
        <div style={{ background: "rgba(227,166,59,0.12)", border: "1px solid " + T.wolfram, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: T.leinwandTief }}>
          <strong style={{ color: T.wolfram }}>Gespeicherte Titel</strong> — die Verbindung ist gerade nicht erreichbar. Die vorhandenen Karten bleiben verfügbar.
        </div>
      )}

      {/* ===== Mein Programm ===== */}
      {ansicht === "programm" && datenDa && (
        <>
          <div className="kd-kompakt" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input value={suche} onChange={(e) => { setFokusOverride(null); setSuche(e.target.value); }} placeholder="Titel suchen …" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
            <button className="kd-streamfilter-knopf" onClick={toggleStreamFilter} title={streamFilterOffen ? "Filter und Sortierung einklappen" : "Filter und Sortierung ausklappen"}
              style={{ ...btnStyle(false), padding: "5px 10px" }}>
              {streamFilterOffen ? "▾" : "▸"} Filter &amp; Sortierung{aktiveFilterP ? ` (${aktiveFilterP})` : ""}
            </button>
          </div>
          {streamFilterOffen && (
            <div className="kd-streamfilter-panel">
              <SortierFilter name="Mein Programm" feld={sortP} richtung={sortRichtungP}
                onFeld={setSortP} onRichtung={setSortRichtungP} />
              <PlattformFilter name="Mein Programm" wert={plattformP} optionen={plattformOptionenP}
                onChange={(wert) => aendereFilter(setPlattformP, wert)} />
              <div className="kd-streamfilter-gruppe">
                <span>Liste</span>
                <ChipReihe style={{ marginBottom: 0 }}>
                  <Chip active={nurBewertet} onClick={() => aendereFilter(setNurBewertet, !nurBewertet)}>Bewertet</Chip>
                  <Chip active={nurWunsch} onClick={() => aendereFilter(setNurWunsch, !nurWunsch)}>Nur Must-Watch</Chip>
                </ChipReihe>
              </div>
            </div>
          )}
          <KatalogRegler name="Mein Programm" buchstabe={buchstabeP}
            onBuchstabe={(wert) => aendereFilter(setBuchstabeP, wert)}
            jahrzehnt={dekadeP} jahrzehnte={dekadenP} onJahrzehnt={aendereDekadeP} />
          {programm.length === 0 && <p style={{ color: T.rauch, fontSize: 14 }}>Kein Titel deiner Liste auf den gewählten Diensten.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(progressiveEnabled ? programm.slice(0, sichtbarP) : programm).map((f) => {
              /* Editierbar: den Master-Eintrag überlagern (frische Begründung/Bewertung),
                 Streaming-Felder behalten. onSave schreibt in die Masterliste. */
              const mf = masterIndex.get(String(f.id));
              const persoenlicheGenres = Array.isArray(mf?.genres) ? mf.genres
                : Array.isArray(mf?.genre) ? mf.genre : [];
              const kartenGenres = [...new Map([
                ...persoenlicheGenres, ...(Array.isArray(f.genres) ? f.genres : []),
              ].map((genre) => [String(genre).toLocaleLowerCase("de-AT"), genre])).values()];
              const persoenlicherText = String(mf?.beschreibung ?? mf?.description ?? "").trim();
              const neutralerText = persoenlicherText
                ? "" : String(f.beschreibung ?? f.description ?? "").trim();
              /* Der editierbare Film bleibt ausschließlich der persönliche
                 Datensatz. Neutrale Fakten liegen nur in der Anzeigeprojektion
                 und können dadurch beim Speichern keiner Notiz mitwandern. */
              const kartenFilm = mf
                ? {
                  ...f, ...mf, dienste: f.dienste, web_urls: f.web_urls,
                  genres: persoenlicheGenres,
                  beschreibung: mf.beschreibung ?? mf.description ?? null,
                  laufzeit_minuten: mf.laufzeit_minuten ?? mf.runtimeMinutes ?? null,
                  descriptionEvidence: null,
                  titleFacts: null,
                }
                : f;
              const factsAnzeige = {
                ...kartenFilm,
                beschreibung: persoenlicherText || neutralerText || null,
                genres: kartenGenres,
                laufzeit_minuten: mf?.laufzeit_minuten ?? mf?.runtimeMinutes
                  ?? f.laufzeit_minuten ?? f.runtimeMinutes ?? null,
                descriptionEvidence: persoenlicherText ? null : f.descriptionEvidence || null,
                titleFacts: f.titleFacts || null,
              };
              return (
                <div key={f.id} className="kd-suchfokus" tabIndex={-1}
                  data-streaming-suchtreffer={`programm:${f.id}`}>
                <FilmCard film={kartenFilm}
                  beschreibungAnzeige={persoenlicherText || neutralerText || null}
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
                    onRecherchieren: (optionen) => onFilmwissenRecherchieren?.(kartenFilm, optionen),
                  } : null}
                  kinoInfo={<>
                    <DienstBadges dienste={f.dienste} webUrls={f.web_urls} auswahl={auswahl} />
                    {expandedId === "s" + f.id ? <TitleFactsDetails titel={factsAnzeige} includeDescription={false} /> : null}
                  </>}
                  headerAction={pinButton(kartenFilm)}
                  />
                </div>
              );
            })}
          </div>
          {progressiveEnabled ? <StreamingPageWindow items={programm} visible={sichtbarP} onVisibleChange={setSichtbarP}
            hasMore={streamingPage?.hasMore} backgroundLoading={streamingPage?.backgroundLoading}
            status={streamingPage?.status} error={streamingPage?.error} total={streamingPage?.total}>
            {() => null}
          </StreamingPageWindow> : null}
        </>
      )}

      {/* ===== Alles / Neu ===== */}
      {(ansicht === "entdecken" || ansicht === "neu") && datenDa && (
        <>
          <div style={{ background: T.saalHoch, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: T.rauch }}>
            {ansicht === "neu"
              ? "Neu im Katalog deiner ausgewählten Dienste erkannt. Jeder Titel bleibt ab seiner Erkennung 14 Tage sichtbar."
              : "Alle Werke im aktuellen Angebot deiner ausgewählten Dienste, einschließlich deiner Titel aus Mein Programm."}
          </div>
          {!katalogAnsichtBereit ? (
            <p style={{ color: T.rauch, fontSize: 14 }} role="status">
              {!auswahlGeladen
                ? "Deine Streaming-Auswahl wird geladen …"
                : ansicht === "neu" && streamingNeu?.status === "baseline"
                  ? "Für mindestens einen ausgewählten Dienst liegt noch kein erfolgreicher Vorhervergleich vor. Dieser Stand ist die Baseline; daraus werden keine alten Titel als neu behauptet."
                  : ansicht === "neu" && streamingNeu?.status === "unavailable"
                    ? "Die gelieferten Vergleichsbelege sind nicht verlässlich genug für eine Neu-Anzeige."
                    : "Der vollständige Katalog wird geladen …"}
            </p>
          ) : <>
          <div className="kd-kompakt kd-streaming-werkzeuge" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="kd-streamfilter-knopf" onClick={toggleStreamFilter} title={streamFilterOffen ? "Filter und Sortierung einklappen" : "Filter und Sortierung ausklappen"}
              style={{ ...btnStyle(false), padding: "5px 10px" }}>
              {streamFilterOffen ? "▾" : "▸"} Filter &amp; Sortierung{aktiveFilterE ? ` (${aktiveFilterE})` : ""}
            </button>
            {ansicht === "entdecken" && <button className="kd-nur-desktop" style={{ ...btnStyle(false), padding: "7px 12px" }}
              onClick={() => download("merkliste.json", { exportiert_am: new Date().toISOString(), eintraege: merkliste })}
              title="Merkliste als JSON-Datei exportieren">
              Merkliste ({merkliste.length}) exportieren
            </button>}
          </div>
          {streamFilterOffen && (
            <div className="kd-streamfilter-panel">
              {/* data-tour umfasst Feld und Richtung gemeinsam; native Controls bleiben selbst bedienbar. */}
              <SortierFilter name={katalogAnsicht} feld={sortE} richtung={sortRichtungE}
                onFeld={setSortE} onRichtung={setSortRichtungE} entdecken />
              <PlattformFilter name={katalogAnsicht} wert={plattformE} optionen={plattformOptionenE}
                onChange={(wert) => aendereFilter(setPlattformE, wert)} />
              <div className="kd-streamfilter-gruppe">
                <span>Status</span>
                <ChipReihe style={{ gap: 6, marginBottom: 0 }}>
                  <Chip active={statusFilterE === "gesehen"}
                    onClick={() => aendereFilter(setStatusFilterE, statusFilterE === "gesehen" ? null : "gesehen")}>
                    {progressiveEnabled ? "Gesehen" : `Gesehen (${statusAnzahlenE})`}
                  </Chip>
                </ChipReihe>
              </div>
              <div className="kd-streamfilter-gruppe">
                <span>Art</span>
                <ChipReihe style={{ gap: 6, marginBottom: 0 }}>
                  <Chip active={typE === "movie"} onClick={() => aendereFilter(setTypE, typE === "movie" ? null : "movie")}>Filme</Chip>
                  <Chip active={typE === "tv_series"} onClick={() => aendereFilter(setTypE, typE === "tv_series" ? null : "tv_series")}>Serien</Chip>
                </ChipReihe>
              </div>
              {genreFilterSichtbarE && <div className="kd-streamfilter-gruppe kd-streamfilter-genre">
                <span>Genre</span>
                <ChipReihe style={{ gap: 6, marginBottom: 0 }}>
                  {genresE.map((genre) => (
                    <Chip key={genre.key} active={genreE === genre.key}
                      onClick={() => aendereFilter(setGenreE, genreE === genre.key ? null : genre.key)}>
                      {genre.label} ({genre.anzahl})
                    </Chip>
                  ))}
                </ChipReihe>
              </div>}
            </div>
          )}
          <KatalogRegler name={katalogAnsicht} buchstabe={buchstabeE}
            onBuchstabe={(wert) => aendereFilter(setBuchstabeE, wert)}
            jahrzehnt={dekadeE} jahrzehnte={dekadenE} onJahrzehnt={aendereDekadeE} />
          {auswahlGeladen && auswahl.length === 0 && (
            <p style={{ color: T.rauch, fontSize: 14 }}>Keine Streaming-Dienste ausgewählt.</p>
          )}
          {ansicht === "neu" && auswahl.length > 0 && katalogListe.length === 0 && streamingNeu?.vergleich === "verifiziert-leer" && (
            <p style={{ color: T.rauch, fontSize: 14 }}>In den letzten 14 Tagen sind keine neuen Titel für diese Auswahl hinzugekommen.</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(progressiveEnabled ? katalogListe.slice(0, sichtbarE) : sichtbareKatalogTitel).map((t) => (
              <div key={streamingId(t)} className="kd-entdecken-karte kd-suchfokus kd-streaming-neu-karte kd-titelaktionskarte" tabIndex={-1}
                data-streaming-suchtreffer={ansicht === "entdecken" ? `entdecken:${streamingId(t)}` : undefined}
                onClick={() => setExpandedId(expandedId === "e" + streamingId(t) ? null : "e" + streamingId(t))}
                style={{ background: T.leinwand, color: T.tinte, borderRadius: "var(--kd-radius-karte)", padding: "16px", cursor: "pointer" }}>
                <div className="kd-entdecken-kopf">
                  <div className="kd-entdecken-inhalt">
                    <div className="kd-entdecken-titel" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "calc(22px * var(--kd-schriftfaktor, 1))", lineHeight: 1.2 }}>
                      {t.titel}{t.jahr ? " (" + t.jahr + ")" : ""}{istStreamingSerie(t) ? " · Serie" : ""}
                      {(streamingStatus(entdeckenStatus, t) || bekannteMediathekIdFuer(t)) && (
                        <span style={{ ...mono, color: T.kartenTextWeich, marginLeft: 8 }}>
                          {statusVon(streamingStatus(entdeckenStatus, t)) === "gesehen" ? "gesehen" : ""}
                          {bestaetigteMediathekIdFuer(t) && typeof onEintragKlick === "function" ? (
                            <button type="button" className="kd-streaming-mediathek-link"
                              onClick={(event) => {
                                event.stopPropagation();
                                const zielId = bestaetigteMediathekIdFuer(t);
                                if (zielId != null) onEintragKlick(zielId);
                              }}>
                              {statusVon(streamingStatus(entdeckenStatus, t)) === "gesehen" ? " · " : ""}in deiner Mediathek · Zum Eintrag
                            </button>
                          ) : bestaetigteMediathekIdFuer(t)
                            ? `${statusVon(streamingStatus(entdeckenStatus, t)) === "gesehen" ? " · " : ""}in deiner Mediathek`
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="kd-entdecken-meta kd-streaming-neu-dienste">
                  <DienstBadges className="kd-entdecken-dienste" dienste={t.dienste} webUrls={t.web_urls}
                    auswahl={auswahl} kompakt={false} />
                </div>
                {gesehenFrage === streamingId(t) && (
                  <div className="kd-entdecken-frage" onClick={(e) => e.stopPropagation()}>
                    <strong>Auch als unbewerteten Eintrag in die Mediathek übernehmen?</strong>
                    <div>
                      <button style={btnStyle(true)} disabled={gesehenSpeichert != null} onClick={() => void uebernehmeGesehen(t)}>
                        {gesehenSpeichert === streamingId(t) ? "Speichert …" : "Ja, in die Mediathek"}
                      </button>
                      <button style={btnStyle(false)} disabled={gesehenSpeichert != null} onClick={() => void markiereNurGesehen(t)}>Nur als gesehen markieren</button>
                      <button style={btnStyle(false)} disabled={gesehenSpeichert != null} onClick={() => setGesehenFrage(null)}>Abbrechen</button>
                    </div>
                  </div>
                )}
                {expandedId === "e" + streamingId(t) && (
                  <div style={{ marginTop: 6, fontSize: 12, color: T.kartenTextWeich }} onClick={(e) => e.stopPropagation()}>
                    <TitleFactsDetails titel={t} />
                    {addFilm && formFuer !== streamingId(t) && !mediathekIdFuer(t) && (
                      <button style={{ ...btnStyle(true), padding: "6px 11px", marginTop: 8 }}
                        onClick={() => setFormFuer(streamingId(t))}>
                        {statusVon(streamingStatus(entdeckenStatus, t)) === "gesehen" ? "In Mediathek übernehmen" : "Eintrag erstellen"}
                      </button>
                    )}
                    {formFuer === streamingId(t) && (
                      <div style={{ marginTop: 8 }}>
                        <FilmForm startOffen
                          kennungenBearbeitbar={false}
                          typOptionen={istStreamingSerie(t) ? ["serie"] : ["film"]}
                          initial={{
                            titel: t.titel, jahr: t.jahr, quelle: "must_watch",
                            genre: (t.genres || []).join(", "), watchmode_id: t.watchmode_id, streaming_id: t.streaming_id, motn_id: t.motn_id,
                            imdb_id: t.imdb_id, tmdb_id: t.tmdb_id,
                          }}
                          onAdd={async (f) => markiereAlsErstellt(t, await addFilm(f))}
                          onAddMitPrognose={addFilmMitPrognose}
                          prognoseAktiv={vorbewertungAktiv}
                          prognoseSperrgrund={prognoseSperrgrund}
                          onDone={() => setFormFuer(null)} />
                      </div>
                    )}
                  </div>
                )}
                {katalogAktionen(t)}
              </div>
            ))}
            {!progressiveEnabled && katalogListe.length > sichtbarE && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                <button style={{ ...btnStyle(true), padding: "8px 14px" }}
                  onClick={() => setSichtbarE((n) => n + 100)}>
                  Weitere 100 laden
                </button>
                <span style={mono}>{sichtbarE} von {katalogListe.length} · noch {katalogListe.length - sichtbarE}</span>
              </div>
            )}
            {progressiveEnabled ? <StreamingPageWindow items={katalogListe} visible={sichtbarE} onVisibleChange={setSichtbarE}
              hasMore={streamingPage?.hasMore} backgroundLoading={streamingPage?.backgroundLoading}
              status={streamingPage?.status} error={streamingPage?.error} total={streamingPage?.total}>
              {() => null}
            </StreamingPageWindow> : null}
          </div>
          </>}
        </>
      )}

    </section>
  );
}

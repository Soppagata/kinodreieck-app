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
import {
  sortiereStreamingTitel, STREAMING_ALPHABET, streamingAnfangsbuchstabe,
  streamingJahrzehnte, passtInJahrzehntMitKulanz,
} from "../lib/streamingSort.js";

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

function AlphabetFilter({ wert, onChange, name }) {
  const index = wert ? STREAMING_ALPHABET.indexOf(wert) + 1 : 0;
  return (
    <div className="kd-streamfilter-abc" data-aktiv={wert ? "1" : "0"}>
      <div className="kd-streamfilter-abc-kopf">
        <span>Anfangsbuchstabe</span>
        <strong aria-live="polite">{wert || "Alle"}</strong>
        <button type="button" onClick={() => onChange(null)} disabled={!wert}>Alle</button>
      </div>
      <input type="range" min="0" max={STREAMING_ALPHABET.length} step="1" value={index}
        onChange={(event) => {
          const naechsterIndex = Number(event.target.value);
          onChange(naechsterIndex === 0 ? null : STREAMING_ALPHABET[naechsterIndex - 1]);
        }}
        aria-label={`${name}: Anfangsbuchstaben filtern`}
        aria-valuetext={wert ? `Buchstabe ${wert}` : "Alle Anfangsbuchstaben"} />
      <div className="kd-streamfilter-abc-skala" aria-hidden="true">
        <span className={!wert ? "aktiv alle" : "alle"}>•</span>
        {STREAMING_ALPHABET.map((buchstabe) => (
          <span key={buchstabe} className={wert === buchstabe ? "aktiv" : ""}>{buchstabe}</span>
        ))}
      </div>
    </div>
  );
}

function JahrzehntFilter({ wert, optionen, onChange, name }) {
  if (!optionen.length) return null;
  const index = wert == null ? 0 : Math.max(0, optionen.indexOf(wert) + 1);
  return (
    <div className="kd-streamfilter-abc kd-streamfilter-dekade" data-aktiv={wert != null ? "1" : "0"}>
      <div className="kd-streamfilter-abc-kopf">
        <span>Jahrzehnt · ±10 Jahre</span>
        <strong aria-live="polite">{wert == null ? "Alle" : `${wert}er`}</strong>
        <button type="button" onClick={() => onChange(null)} disabled={wert == null}>Alle</button>
      </div>
      <input type="range" min="0" max={optionen.length} step="1" value={index}
        onChange={(event) => {
          const naechsterIndex = Number(event.target.value);
          onChange(naechsterIndex === 0 ? null : optionen[naechsterIndex - 1]);
        }}
        aria-label={`${name}: Jahrzehnt filtern`}
        aria-valuetext={wert == null ? "Alle Jahrzehnte" : `${wert}er, mit zehn Jahren Kulanz davor und danach`} />
      <div className="kd-streamfilter-dekade-skala" aria-hidden="true"
        style={{ gridTemplateColumns: `repeat(${optionen.length + 1}, minmax(0, 1fr))` }}>
        <span className={wert == null ? "aktiv alle" : "alle"}>•</span>
        {optionen.map((jahrzehnt) => (
          <span key={jahrzehnt} className={wert === jahrzehnt ? "aktiv" : ""}>{jahrzehnt}</span>
        ))}
      </div>
    </div>
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
  const [plattformP, setPlattformP] = useState(null);
  const [nurBewertet, setNurBewertet] = useState(false);
  const [buchstabeP, setBuchstabeP] = useState(null);
  const [dekadeP, setDekadeP] = useState(null);
  const [plattformE, setPlattformE] = useState(null);
  const [statusFilterE, setStatusFilterE] = useState(null);
  const [buchstabeE, setBuchstabeE] = useState(null);
  /* Merkliste kommt jetzt als Prop (in App-State geliftet) — Streaming und Dashboard live synchron. */
  const entdeckenStatusRef = useRef(entdeckenStatus);
  entdeckenStatusRef.current = entdeckenStatus;
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
    setPlattformP(null); setNurBewertet(false); setBuchstabeP(null); setDekadeP(null); setNurWunsch(false);
    setPlattformE(null); setStatusFilterE(null); setBuchstabeE(null);
    setGenreE(null); setDekadeE(null); setTypE(null);
    setSichtbarE(200);
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
  /* Plattform-Optionen = ALLE angehakten Dienste — auch ohne Katalog-Titel (Max, 19.07.):
     die Abo-Auswahl soll im Filter sichtbar sein, ein leerer Treffer ist ok. Früher auf
     bekannt.dienste gegatet; das ist aber unzuverlässig (führt z. B. Joyn NICHT, obwohl Titel
     Joyn getaggt sind, und listet umgekehrt titel-lose Dienste). Ohne Auswahl: die Katalog-Dienste. */
  const plattformOptionenP = useMemo(() => {
    if (auswahl && auswahl.length) return [...auswahl].sort((a, b) => a.localeCompare(b, "de"));
    const dienste = new Set([...(bekannt?.dienste || [])]);
    for (const titel of bekannt?.titel || []) for (const dienst of titel.dienste || []) dienste.add(dienst);
    return [...dienste].sort((a, b) => a.localeCompare(b, "de"));
  }, [auswahl, bekannt]);
  const plattformOptionenE = useMemo(() => {
    if (auswahl && auswahl.length) return [...auswahl].sort((a, b) => a.localeCompare(b, "de"));
    const dienste = new Set([...(entdecken?.dienste || [])]);
    for (const titel of entdecken?.titel || []) for (const dienst of titel.dienste || []) dienste.add(dienst);
    return [...dienste].sort((a, b) => a.localeCompare(b, "de"));
  }, [auswahl, entdecken]);
  const plattformOkP = useCallback((t) => !plattformP || (t.dienste || []).includes(plattformP), [plattformP]);
  const plattformOkE = useCallback((t) => !plattformE || (t.dienste || []).includes(plattformE), [plattformE]);

  const programm = useMemo(() => {
    if (!datenDa) return [];
    let l = bekannt.titel.filter((t) => (
      fokusOverride?.art === "programm" && String(t.id) === fokusOverride.ref
    ) || (dienstOk(t) && plattformOkP(t)));
    /* Must-Watch-Filter liest die LISTE (Verknüpfung auf Master-ID) — nicht mehr
       das eingebackene must_watch-Flag aus dem Katalog-Job (kann veraltet sein). */
    if (nurWunsch) l = l.filter((f) => mustwatchIds && mustwatchIds.has(f.id));
    if (nurBewertet) l = l.filter((f) => f.bewertung != null);
    if (buchstabeP) l = l.filter((f) => streamingAnfangsbuchstabe(f.titel) === buchstabeP);
    if (dekadeP != null) l = l.filter((f) => passtInJahrzehntMitKulanz(f.jahr, dekadeP));
    if (suche.trim()) { const nq = norm(suche); l = l.filter((f) => norm(f.titel || "").includes(nq)); }
    return sortiereStreamingTitel(l, sortP, sortRichtungP);
  }, [bekannt, datenDa, dienstOk, plattformOkP, nurWunsch, nurBewertet, buchstabeP, dekadeP, mustwatchIds, suche, sortP, sortRichtungP, fokusOverride]);

  const genresE = useMemo(() => {
    if (!entdeckenDa) return [];
    const gruppen = new Map();
    entdecken.titel.forEach((titel) => (titel.genres || []).forEach((genre) => {
      const label = String(genre || "").trim();
      const key = norm(label);
      if (!key) return;
      const bisher = gruppen.get(key) || { key, label, anzahl: 0 };
      bisher.anzahl += 1;
      gruppen.set(key, bisher);
    }));
    return [...gruppen.values()].sort((a, b) => b.anzahl - a.anzahl || a.label.localeCompare(b.label, "de"));
  }, [entdecken, entdeckenDa]);

  const statusAnzahlenE = useMemo(() => {
    if (!entdeckenDa) return { gesehen: 0, beobachtet: 0 };
    return entdecken.titel.reduce((anzahlen, titel) => {
      const status = entdeckenStatus[titel.watchmode_id];
      if (statusVon(status) === "gesehen") anzahlen.gesehen += 1;
      if (istBeobachtet(status)) anzahlen.beobachtet += 1;
      return anzahlen;
    }, { gesehen: 0, beobachtet: 0 });
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
    ) || (dienstOk(t) && plattformOkE(t)));
    if (statusFilterE === "gesehen") l = l.filter((t) => statusVon(entdeckenStatus[t.watchmode_id]) === "gesehen");
    if (statusFilterE === "beobachtet") l = l.filter((t) => istBeobachtet(entdeckenStatus[t.watchmode_id]));
    if (buchstabeE) l = l.filter((t) => streamingAnfangsbuchstabe(t.titel) === buchstabeE);
    if (genreE) l = l.filter((t) => (t.genres || []).some((genre) => norm(genre) === genreE));
    if (dekadeE != null) l = l.filter((t) => passtInJahrzehntMitKulanz(t.jahr, dekadeE));
    if (typE) l = l.filter((t) => (t.typ || "") === typE);
    return sortiereStreamingTitel(l, sortE, sortRichtungE);
  }, [entdecken, entdeckenDa, dienstOk, plattformOkE, statusFilterE, buchstabeE, genreE, dekadeE, typE, sortE, sortRichtungE, entdeckenStatus, fokusOverride]);
  // Bei Filterwechsel wieder bei 200 anfangen (sonst würden Tausende gerendert).
  useEffect(() => { setSichtbarE(200); }, [entdeckenListe]);
  const sichtbareEntdeckenTitel = useMemo(() => {
    const basis = entdeckenListe.slice(0, sichtbarE);
    if (fokusOverride?.art !== "entdecken") return basis;
    const ziel = entdeckenListe.find((titel) => String(titel.watchmode_id) === fokusOverride.ref);
    if (!ziel || basis.some((titel) => String(titel.watchmode_id) === fokusOverride.ref)) return basis;
    /* Der konkrete Navigationsauftrag muss auch dann ein DOM-Ziel erhalten,
       wenn seine sortierte Position hinter der 200er-Paginierungsgrenze liegt.
       Nur diese eine Karte wird ergänzt; der übrige Vollkatalog bleibt billig. */
    return [...basis, ziel];
  }, [entdeckenListe, sichtbarE, fokusOverride]);

  const dekadenP = useMemo(() => streamingJahrzehnte(bekannt?.titel || []), [bekannt]);
  const dekadenE = useMemo(() => streamingJahrzehnte(entdecken?.titel || []), [entdecken]);

  const gemerkt = (t) => merkliste.some((m) => m.watchmode_id === t.watchmode_id);
  const aendereFilter = (setter, wert) => {
    setFokusOverride(null);
    setter(wert);
  };
  const aktiveFilterP = Number(!!plattformP) + Number(nurBewertet) + Number(nurWunsch)
    + Number(!!buchstabeP) + Number(dekadeP != null);
  const aktiveFilterE = Number(!!plattformE) + Number(!!statusFilterE) + Number(!!typE)
    + Number(!!genreE) + Number(dekadeE != null) + Number(!!buchstabeE);

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
            <input value={suche} onChange={(e) => { setFokusOverride(null); setSuche(e.target.value); }} placeholder="Titel suchen …" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
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
            <button className="kd-streamfilter-knopf" onClick={toggleStreamFilter} title={streamFilterOffen ? "Filter einklappen" : "Filter ausklappen"}
              style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }}>
              {streamFilterOffen ? "▾" : "▸"} Filter{aktiveFilterP ? ` (${aktiveFilterP})` : ""}
            </button>
          </div>
          {streamFilterOffen && (
            <div className="kd-streamfilter-panel">
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
          <div className="kd-streamfilter-regler">
            <AlphabetFilter name="Mein Programm" wert={buchstabeP}
              onChange={(wert) => aendereFilter(setBuchstabeP, wert)} />
            <JahrzehntFilter name="Mein Programm" wert={dekadeP} optionen={dekadenP}
              onChange={(wert) => aendereFilter(setDekadeP, wert)} />
          </div>
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
          <div className="kd-kompakt kd-streaming-werkzeuge" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
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
            <button className="kd-streamfilter-knopf" onClick={toggleStreamFilter} title={streamFilterOffen ? "Filter einklappen" : "Filter ausklappen"}
              style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }}>
              {streamFilterOffen ? "▾" : "▸"} Filter{aktiveFilterE ? ` (${aktiveFilterE})` : ""}
            </button>
            <button className="kd-nur-desktop" style={{ ...btnStyle(false), fontSize: 13, padding: "7px 12px" }}
              onClick={() => download("merkliste.json", { exportiert_am: new Date().toISOString(), eintraege: merkliste })}
              title="Merkliste als JSON-Datei exportieren">
              Merkliste ({merkliste.length}) exportieren
            </button>
          </div>
          {streamFilterOffen && (
            <div className="kd-streamfilter-panel">
              <PlattformFilter name="Entdecken" wert={plattformE} optionen={plattformOptionenE}
                onChange={(wert) => aendereFilter(setPlattformE, wert)} />
              <div className="kd-streamfilter-gruppe">
                <span>Status</span>
                <ChipReihe style={{ gap: 6, marginBottom: 0 }}>
                  <Chip active={statusFilterE === "gesehen"}
                    onClick={() => aendereFilter(setStatusFilterE, statusFilterE === "gesehen" ? null : "gesehen")}>
                    Gesehen ({statusAnzahlenE.gesehen})
                  </Chip>
                  <Chip active={statusFilterE === "beobachtet"}
                    onClick={() => aendereFilter(setStatusFilterE, statusFilterE === "beobachtet" ? null : "beobachtet")}>
                    Beobachtet ({statusAnzahlenE.beobachtet})
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
              <div className="kd-streamfilter-gruppe kd-streamfilter-genre">
                <span>Genre</span>
                <ChipReihe style={{ gap: 6, marginBottom: 0 }}>
                  {genresE.map((genre) => (
                    <Chip key={genre.key} active={genreE === genre.key}
                      onClick={() => aendereFilter(setGenreE, genreE === genre.key ? null : genre.key)}>
                      {genre.label} ({genre.anzahl})
                    </Chip>
                  ))}
                </ChipReihe>
              </div>
            </div>
          )}
          <div className="kd-streamfilter-regler">
            <AlphabetFilter name="Entdecken" wert={buchstabeE}
              onChange={(wert) => aendereFilter(setBuchstabeE, wert)} />
            <JahrzehntFilter name="Entdecken" wert={dekadeE} optionen={dekadenE}
              onChange={(wert) => aendereFilter(setDekadeE, wert)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sichtbareEntdeckenTitel.map((t) => (
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

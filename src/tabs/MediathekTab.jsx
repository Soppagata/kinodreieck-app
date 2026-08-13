import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { T, ROTLINK, btnStyle, inputStyle } from "../lib/tokens.js";
import { norm, score } from "../lib/match.js";
import { store, K } from "../services/storage.js";
import { offeneReferenzen } from "../lib/artikel.js";
import { TYP_GRUPPEN, TAB_LABELS, ALLE_TYPEN, tabVonTyp, hatDreieck } from "../lib/typen.js";
import { hatPhysischeQuelle } from "../lib/quellen.js";
import { istMustwatchId } from "../lib/mustwatch.js";
import { BEWERTUNGSKATEGORIEN } from "../lib/kategorien.js";
import { filmwissenRechercheKennung } from "../lib/filmwissen.js";
import {
  analysiereAuswaehlbareIds, ausgewaehlteSichtbareEintraege, bereinigeAuswahl,
  erstelleTitelliste, kanonischeStabileId, schalteAuswahlUm,
} from "../lib/mediathekSelection.js";
import { Chip, ChipReihe, IconClose, QuellenBadges, SegmentedControl } from "../components/ui.jsx";
import { FilmCard } from "../components/FilmCard.jsx";
import { FilmForm } from "../components/EintragForm.jsx";
import { MedienForm } from "../components/MedienForm.jsx";
import { MustWatchListe } from "../components/MustWatchListe.jsx";

/* ================= MEDIATHEK =================
   Drei Ansichten über EINEN Umschalter (kein 8. Nav-Bereich):
   - Bestand: die klassische Mediathek (typ als Diskriminator, Tabs = Filter).
   - Im Besitz: NUR Einträge mit mindestens einer physischen Quelle
     (quellen.js-Art — Prime/Apple-Käufe zählen NICHT als Besitz).
     Unbewertete Einträge sind hier erstklassige Bürger (Filter + Badge).
   - Must-Watch: eigener persönlicher Datentopf, KEIN Master-Filter.
   artikel: Blog-Artikel (Phase 2) für die "Kommt vor in:"-Anzeige. */
export function MediathekTab({ master, nachtragFlach, expandedId, setExpandedId, updateFilm, deleteFilm, addFilm, badgeFuer, artikel = [], onArtikelKlick, fokusFilmId, onFokusVerbraucht,
  mustwatch = [], addMustwatch, updateMustwatch, deleteMustwatch, mwKandidaten = { master: [], programm: [], streaming: [] }, onSpringeZuMustwatchRef,
  addFilmMitPrognose, vorbewertungAktiv = false, prognoseLaufId = null,
  prognoseSperrgrund = null, prognoseFehler = {}, aktuelleProfilVersion = null,
  onPrognoseErstellen, onPrognoseStatus,
  filmwissenAktiv = false, filmwissenRechercheAktiv = false,
  filmwissenProFilm = {}, filmwissenRechercheLaufId = null,
  onFilmwissenLaden, onFilmwissenRecherchieren, datenKontextKey = "gast" }) {
  const [ansicht, setAnsicht] = useState("bestand"); // bestand | besitz | mustwatch
  const [typTab, setTypTab] = useState("filme");
  const [nurUnbewertet, setNurUnbewertet] = useState(false); // Besitz-Ansicht: nur unbewertete zeigen
  const [bewerteTitel, setBewerteTitel] = useState(null); // Nachtrag-Titel, der gerade bewertet wird
  const [auswahlmodus, setAuswahlmodus] = useState(false);
  const [auswahlIds, setAuswahlIds] = useState(() => new Set());
  const [titellisteSichtbar, setTitellisteSichtbar] = useState(false);
  const [kopierStatus, setKopierStatus] = useState(null);
  const titellisteRef = useRef(null);
  const letzterMasterRef = useRef(master);
  const letzterDatenKontextRef = useRef(datenKontextKey);
  const letzteTitellisteRef = useRef("");
  const unsichereRenderKeysRef = useRef({ map: new WeakMap(), naechster: 0 });

  const beendeAuswahl = useCallback(() => {
    setAuswahlmodus(false);
    setAuswahlIds(new Set());
    setTitellisteSichtbar(false);
    setKopierStatus(null);
  }, []);

  const starteAuswahl = useCallback(() => {
    setAuswahlIds(new Set());
    setTitellisteSichtbar(false);
    setKopierStatus(null);
    setAuswahlmodus(true);
  }, []);

  /* Eine Auswahl gehört genau zum gesamten Datenkontext. Master-Ersetzung
     (inkl. Restore/Sync) und Account-/Sessionwechsel beenden sie vollständig.
     Suche, Filter, Typ und Sortierung verändern dagegen nur die sichtbare
     Schnittmenge; die global gewählten stabilen IDs bleiben erhalten. */
  useEffect(() => {
    if (letzterMasterRef.current !== master) beendeAuswahl();
    letzterMasterRef.current = master;
  }, [master, beendeAuswahl]);
  useEffect(() => {
    if (letzterDatenKontextRef.current !== datenKontextKey) beendeAuswahl();
    letzterDatenKontextRef.current = datenKontextKey;
  }, [datenKontextKey, beendeAuswahl]);

  /* Sprung aus dem Blog: Must-Watch-Refs (mw_…) öffnen die Must-Watch-Ansicht,
     Master-Refs die Bestand-Ansicht (dort ist jeder Eintrag sicher sichtbar). */
  useEffect(() => {
    if (!fokusFilmId) return;
    beendeAuswahl();
    if (istMustwatchId(fokusFilmId)) {
      setAnsicht("mustwatch");
      const t = setTimeout(() => {
        const el = document.getElementById("mw-" + fokusFilmId);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (onFokusVerbraucht) onFokusVerbraucht();
      }, 150);
      return () => clearTimeout(t);
    }
    if (!master) return;
    setAnsicht("bestand");
    const f = master.find((x) => x.id === fokusFilmId);
    if (f) setTypTab(tabVonTyp(f.typ));
    const t = setTimeout(() => {
      const el = document.getElementById("film-" + fokusFilmId);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (onFokusVerbraucht) onFokusVerbraucht();
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokusFilmId, master]);

  const offeneRefs = useMemo(() => offeneReferenzen(artikel), [artikel]);
  /* Offene Referenzen typ-bewusst: Musik-Rotlinks im Musik-Tab ergänzen,
     Serien im Serien-Tab. Ohne Typ-Angabe -> Filme-Tab (Default-Annahme). */
  const offeneRefsTab = useMemo(() => offeneRefs.filter((o) => TYP_GRUPPEN[typTab].includes(o.typ || "film")), [offeneRefs, typTab]);
  const [refAnlegen, setRefAnlegen] = useState(null); // Index der offenen Referenz mit geöffneter Maske
  const [besitz, setBesitz] = useState("alle");
  const [genreF, setGenreF] = useState(null);
  const [katF, setKatF] = useState(null);
  const [suche, setSuche] = useState("");
  const [sortier, setSortier] = useState("score");
  /* Filtermenü (Chip-Filter) auf/zu — Default ZUGEKLAPPT. Seit Etappe 3 eine
     dauerhafte Sicht-Präferenz im Datentopf (vorher nur sessionStorage): sie
     überlebt den App-Neustart und wandert bei angemeldetem Konto mit. */
  const [filterMenueOffen, setFilterMenueOffen] = useState(false);
  const filterMenueOffenRef = useRef(filterMenueOffen);
  filterMenueOffenRef.current = filterMenueOffen;
  useEffect(() => {
    let aktiv = true;
    store.get(K.filterMediathek).then((r) => {
      if (aktiv && r?.value === "1") {
        filterMenueOffenRef.current = true;
        setFilterMenueOffen(true);
      }
    }).catch(() => {});
    return () => { aktiv = false; };
  }, []);
  const toggleFilterMenue = () => {
    const nv = !filterMenueOffenRef.current;
    filterMenueOffenRef.current = nv;
    setFilterMenueOffen(nv);
    store.set(K.filterMediathek, nv ? "1" : "0").catch(() => {});
  };
  const dreieckTab = typTab === "filme" || typTab === "serien";
  const HAUPTTYP = { filme: "film", serien: "serie", musik: "musik", sonstiges: "sonstiges" };
  const typReihe = [HAUPTTYP[typTab]].concat(ALLE_TYPEN.filter((t) => t !== HAUPTTYP[typTab]));

  /* "Kommt vor in:" — Laufzeit-berechnet, ein Durchlauf über alle Artikel.
     Wird nicht gepflegt, sonst existiert die Verbindung zweimal. */
  const kommtVorInMap = useMemo(() => {
    const map = {};
    for (const a of artikel) {
      if (a.status !== "freigegeben") continue;
      for (const le of a.liste || []) {
        if (!le.ref) continue;
        (map[le.ref] = map[le.ref] || []).push({ id: a.id, titel: a.titel });
      }
    }
    return map;
  }, [artikel]);

  /* Basisbestand je Ansicht: Besitz = nur physische Quellen (Array-Prüfung,
     kein Substring — Prime-/Apple-only fällt hier beweisbar raus). */
  const basis = useMemo(() => {
    if (!master) return [];
    return ansicht === "besitz" ? master.filter((f) => hatPhysischeQuelle(f.quelle)) : master;
  }, [master, ansicht]);
  const besitzAnzahl = useMemo(() => (master || []).filter((f) => hatPhysischeQuelle(f.quelle)).length, [master]);
  const unbewertetAnzahl = useMemo(() => basis.filter((f) => hatDreieck(f.typ) && f.bewertung == null).length, [basis]);

  const counts = useMemo(() => {
    const c = { filme: 0, serien: 0, musik: 0, sonstiges: 0 };
    basis.forEach((f) => { c[tabVonTyp(f.typ)]++; });
    return c;
  }, [basis]);

  const genres = useMemo(() => {
    const c = {};
    basis.forEach((f) => (f.genre || []).forEach((g) => (c[g] = (c[g] || 0) + 1)));
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g]) => g);
  }, [basis]);

  const mediathek = useMemo(() => {
    if (!basis.length) return [];
    let list = basis.filter((f) => TYP_GRUPPEN[typTab].includes(f.typ || "film"));
    if (ansicht === "besitz" && nurUnbewertet) list = list.filter((f) => hatDreieck(f.typ) && f.bewertung == null);
    if (dreieckTab) {
      if (ansicht === "bestand") {
        list = list.filter((f) => {
          const q = f.quelle || "";
          if (besitz === "dvd") return q.includes("dvd");
          if (besitz === "prime") return q.includes("prime"); // Prime-Snapshot (Watchmode)
          if (besitz === "apple") return q.includes("apple");
          if (besitz === "wunsch") return q === "must_watch";
          return true; // "alle" = wirklich alle (Besitz UND Wunschliste)
        });
      }
      if (genreF) list = list.filter((f) => (f.genre || []).includes(genreF));
      if (katF) list = list.filter((f) => f.kategorie === katF);
    }
    if (suche.trim()) {
      const nq = norm(suche);
      list = list.filter((f) => norm(f.titel || "").includes(nq) || norm(f.originaltitel || "").includes(nq));
    }
    const sortierer = {
      score: (a, b) => score(b) - score(a),
      titel: (a, b) => (a.titel || "").localeCompare(b.titel || "", "de"),
      jahr_neu: (a, b) => (b.jahr || 0) - (a.jahr || 0),
      jahr_alt: (a, b) => (a.jahr || 9999) - (b.jahr || 9999),
      wie: (a, b) => (((b.bewertung || {}).wie) || 0) - (((a.bewertung || {}).wie) || 0),
      was: (a, b) => (((b.bewertung || {}).was) || 0) - (((a.bewertung || {}).was) || 0),
      warum: (a, b) => (((b.bewertung || {}).warum) || 0) - (((a.bewertung || {}).warum) || 0),
    };
    const aktiv = dreieckTab ? (sortierer[sortier] || sortierer.score)
      : (["titel", "jahr_neu", "jahr_alt"].includes(sortier) ? sortierer[sortier] : sortierer.titel);
    return list.sort(aktiv);
  }, [basis, ansicht, nurUnbewertet, typTab, dreieckTab, besitz, genreF, katF, suche, sortier]);

  const idAnalyse = useMemo(() => analysiereAuswaehlbareIds(master || []), [master]);
  /* Nur IDs, die aus dem gesamten aktuellen Master verschwinden oder dort
     nicht mehr eindeutig sind, werden bereinigt. Sichtfilter sind ausdrücklich
     keine Besitzgrenze für die Auswahl. */
  useEffect(() => {
    if (!auswahlmodus) return;
    setAuswahlIds((aktuell) => {
      const sauber = bereinigeAuswahl(aktuell, idAnalyse.auswaehlbareIds);
      if (sauber.size === aktuell.size && [...sauber].every((id) => aktuell.has(id))) return aktuell;
      return sauber;
    });
  }, [auswahlmodus, idAnalyse.auswaehlbareIds]);

  const sichtbareAuswahl = useMemo(
    () => ausgewaehlteSichtbareEintraege(mediathek, auswahlIds, idAnalyse.auswaehlbareIds),
    [mediathek, auswahlIds, idAnalyse],
  );

  const titelliste = useMemo(
    () => erstelleTitelliste(mediathek, auswahlIds, idAnalyse.auswaehlbareIds),
    [mediathek, auswahlIds, idAnalyse],
  );
  useEffect(() => {
    if (!auswahlmodus) {
      letzteTitellisteRef.current = "";
      return;
    }
    if (letzteTitellisteRef.current !== titelliste) setKopierStatus(null);
    letzteTitellisteRef.current = titelliste;
  }, [auswahlmodus, titelliste]);
  const auswahlZaehlerText = sichtbareAuswahl.length === auswahlIds.size
    ? `${auswahlIds.size} ausgewählt`
    : `${auswahlIds.size} ausgewählt · ${sichtbareAuswahl.length} sichtbar`;
  const problematischeIds = idAnalyse.ungueltigeAnzahl + idAnalyse.doppelteIds.size;
  const renderKeyFuer = useCallback((eintrag) => {
    const id = kanonischeStabileId(eintrag);
    if (id != null && idAnalyse.auswaehlbareIds.has(id)) return `id:${id}`;
    /* Ausschließlich React-Reconciliation für gemeldete, nicht auswählbare
       Problemrecords. Dieser flüchtige Key wird niemals zur Auswahl-ID. */
    if (eintrag && typeof eintrag === "object") {
      const stand = unsichereRenderKeysRef.current;
      if (!stand.map.has(eintrag)) stand.map.set(eintrag, `nicht-auswaehlbar:${++stand.naechster}`);
      return stand.map.get(eintrag);
    }
    return `nicht-auswaehlbar:${String(eintrag)}`;
  }, [idAnalyse]);

  const leereAuswahl = useCallback(() => {
    setAuswahlIds(new Set());
    setTitellisteSichtbar(false);
    setKopierStatus(null);
  }, []);

  const kopiereTitelliste = useCallback(async () => {
    if (!titelliste) return;
    setTitellisteSichtbar(true);
    setKopierStatus({ art: "laeuft", text: "Titelliste wird kopiert …" });
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
      await globalThis.navigator.clipboard.writeText(titelliste);
      setKopierStatus({ art: "erfolg", text: "Titelliste kopiert." });
    } catch {
      setKopierStatus({
        art: "fehler",
        text: "Kopieren war nicht möglich. Die Titelliste bleibt unten sichtbar und kann manuell kopiert werden.",
      });
      requestAnimationFrame(() => {
        titellisteRef.current?.focus();
        titellisteRef.current?.select();
      });
    }
  }, [titelliste]);

  const wechsleAnsicht = useCallback((id) => {
    beendeAuswahl();
    setAnsicht(id);
    setExpandedId(null);
  }, [beendeAuswahl, setExpandedId]);

  return (
    <section>
      {/* Ansicht-Umschalter: Einträge · Im Besitz · Must-Watch (immer sichtbar).
          Interner Key bleibt "bestand" — nur das Label heißt Einträge (Max, 18.07.). */}
      <SegmentedControl className="kd-mediathek-ansichten" value={ansicht} onChange={wechsleAnsicht}
        options={[
          { id: "bestand", label: "Einträge" },
          { id: "besitz", label: "Im Besitz", badge: besitzAnzahl },
          { id: "mustwatch", label: "Must-Watch", badge: mustwatch.length },
        ]} />

      {/* ===== Must-Watch: eigener Datentopf, eigene Liste ===== */}
      {ansicht === "mustwatch" && (
        <MustWatchListe eintraege={mustwatch}
          onAdd={addMustwatch} onUpdate={updateMustwatch} onDelete={deleteMustwatch}
          kandidaten={mwKandidaten} kommtVorInMap={kommtVorInMap} onArtikelKlick={onArtikelKlick}
          onSpringeZuRef={onSpringeZuMustwatchRef} />
      )}

      {ansicht !== "mustwatch" && (<>
      <div className="kd-auswahl-werkzeuge" aria-label="Mediathek-Auswahl">
        <button type="button" className="kd-auswahl-modus" style={btnStyle(auswahlmodus)}
          aria-pressed={auswahlmodus} onClick={auswahlmodus ? beendeAuswahl : starteAuswahl}>
          {auswahlmodus ? "Auswahl beenden" : "Auswählen"}
        </button>
        {auswahlmodus && (<>
          <strong className="kd-auswahl-zaehler" aria-live="polite">{auswahlZaehlerText}</strong>
          <button type="button" style={btnStyle(false)} disabled={auswahlIds.size === 0} onClick={leereAuswahl}>
            Auswahl leeren
          </button>
          <button type="button" className="kd-auswahl-kopieren" style={btnStyle(true)}
            disabled={!titelliste} onClick={kopiereTitelliste}>
            Titelliste kopieren
          </button>
        </>)}
      </div>
      {auswahlmodus && problematischeIds > 0 && (
        <p className="kd-auswahl-idwarnung" role="status">
          {idAnalyse.ungueltigeAnzahl > 0 ? `${idAnalyse.ungueltigeAnzahl} ohne stabile ID` : ""}
          {idAnalyse.ungueltigeAnzahl > 0 && idAnalyse.doppelteIds.size > 0 ? " · " : ""}
          {idAnalyse.doppelteIds.size > 0 ? `${idAnalyse.doppelteIds.size} doppelte ${idAnalyse.doppelteIds.size === 1 ? "ID" : "IDs"}` : ""}
          {" — nicht auswählbar"}
        </p>
      )}
      {auswahlmodus && titellisteSichtbar && (
        <div className="kd-titelliste-ausgabe">
          {titelliste ? (<>
            <label htmlFor="kd-titelliste-text">Titelliste</label>
            <textarea id="kd-titelliste-text" ref={titellisteRef} readOnly value={titelliste}
              rows={Math.min(8, Math.max(2, sichtbareAuswahl.length))} />
          </>) : (
            <p className="kd-titelliste-leer" role="status">
              Keine ausgewählten Einträge sind in der aktuellen Ansicht sichtbar.
            </p>
          )}
          {kopierStatus && (
            <p role={kopierStatus.art === "fehler" ? "alert" : "status"} className={`kd-kopierstatus kd-kopierstatus--${kopierStatus.art}`}>
              {kopierStatus.text}
            </p>
          )}
        </div>
      )}
      {/* Typ-Tabs (Filter auf typ) */}
      <SegmentedControl className="kd-mediathek-typen" value={typTab} onChange={(t) => { setTypTab(t); setExpandedId(null); }}
        options={Object.keys(TYP_GRUPPEN).map((t) => ({ id: t, label: TAB_LABELS[t], badge: counts[t] }))} />

      <div className="kd-kompakt" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input className="kd-lokalsuche" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel oder Originaltitel suchen …"
          style={{ ...inputStyle, flex: 1, minWidth: 170 }} />
        {suche && <button type="button" className="kd-lokalsuche-loeschen" aria-label="Mediatheksuche leeren" title="Mediatheksuche leeren"
          style={{ ...btnStyle(false), fontSize: 13, padding: "6px 11px" }} onClick={() => setSuche("")}><IconClose /></button>}
        <select value={sortier} onChange={(e) => setSortier(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {dreieckTab && <option value="score">Bewertung: WIE · WAS · WARUM</option>}
          <option value="titel">Titel A–Z</option>
          <option value="jahr_neu">Jahr: neueste zuerst</option>
          <option value="jahr_alt">Jahr: älteste zuerst</option>
          {dreieckTab && <option value="wie">WIE absteigend</option>}
          {dreieckTab && <option value="was">WAS absteigend</option>}
          {dreieckTab && <option value="warum">WARUM absteigend</option>}
        </select>
      </div>

      {/* Besitz-Ansicht: unbewertet-Filter prominent (nicht im eingeklappten Menü) */}
      {ansicht === "besitz" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <Chip active={nurUnbewertet} onClick={() => setNurUnbewertet(!nurUnbewertet)}>nur unbewertete ({unbewertetAnzahl})</Chip>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.rauch }}>
            Besitz = physische Quellen (DVD · Blu-ray · CD …) — Prime-/Apple-Käufe zählen nicht
          </span>
        </div>
      )}

      {dreieckTab && (
        <>
          <button className="kd-seitenfilter" onClick={toggleFilterMenue} title={filterMenueOffen ? "Filter einklappen" : "Filter ausklappen"}
            style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", marginBottom: 8 }}>
            {filterMenueOffen ? "▾ Filter" : "▸ Filter"}
          </button>
          {filterMenueOffen && (
          <>
          <ChipReihe>
            {ansicht === "bestand" && (
              <>
                <Chip active={besitz === "alle"} onClick={() => setBesitz("alle")}>Besitz: alle</Chip>
                <Chip active={besitz === "dvd"} onClick={() => setBesitz("dvd")}>DVD</Chip>
                <Chip active={besitz === "prime"} onClick={() => setBesitz("prime")}>Prime (Snapshot)</Chip>
                <Chip active={besitz === "apple"} onClick={() => setBesitz("apple")}>Apple</Chip>
                <Chip active={besitz === "wunsch"} onClick={() => setBesitz("wunsch")}>Wunschliste</Chip>
                <span style={{ width: 12 }} />
              </>
            )}
          </ChipReihe>
          <ChipReihe style={{ gap: 6 }}>
            {BEWERTUNGSKATEGORIEN.map((k) => (
              <Chip key={k.id} active={katF === k.id} onClick={() => setKatF(katF === k.id ? null : k.id)}>{k.label}</Chip>
            ))}
          </ChipReihe>
          <ChipReihe style={{ gap: 6, marginBottom: 14 }}>
            {genres.map((g) => (
              <Chip key={g} active={genreF === g} onClick={() => setGenreF(genreF === g ? null : g)}>{g}</Chip>
            ))}
          </ChipReihe>
          </>
          )}
        </>
      )}

      {(master || []).length === 0 && (
        <div style={{ background: "rgba(217,106,90,0.10)", border: "1px solid " + T.gefahr, borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: T.leinwandTief, lineHeight: 1.6 }}>
          <strong style={{ color: T.gefahr }}>Bevor du loslegst:</strong> Deine Einträge werden im
          Browser gespeichert und können optional über den Geräte-Sync abgeglichen werden.
          Sichere den vollständigen Stand trotzdem regelmäßig über
          <strong> Settings → Gesamt-Backup herunterladen</strong>.
        </div>
      )}
      {/* Eingabemaske pro Tab: Dreieck-Typen -> FilmForm, Musik/Sonstiges ->
          schlichte MedienForm. key=typTab: Tab-Wechsel klappt das Formular zu. */}
      <div data-tour="eintrag-neu" hidden={auswahlmodus} aria-hidden={auswahlmodus || undefined}
        style={{ marginBottom: 16 }}>
        {hatDreieck(HAUPTTYP[typTab])
          ? <FilmForm key={typTab} typOptionen={typReihe} onAdd={addFilm}
              onAddMitPrognose={addFilmMitPrognose} prognoseAktiv={vorbewertungAktiv}
              prognoseSperrgrund={prognoseSperrgrund} />
          : <MedienForm key={typTab} typ={HAUPTTYP[typTab]} onAdd={addFilm} />}
      </div>

      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch, marginBottom: 10 }}>
        {mediathek.length} {mediathek.length === 1 ? "Eintrag" : "Einträge"} · {auswahlmodus ? "Karte antippen zum Auswählen" : "Karte antippen für Details & Bearbeiten"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mediathek.map((f) => (
          <div key={renderKeyFuer(f)} id={"film-" + f.id} data-film-id={String(f.id)}>
            <FilmCard
              film={f}
              streamBadge={dreieckTab && badgeFuer ? badgeFuer(f) : null}
              expanded={expandedId === "b" + f.id}
              onToggle={auswahlmodus ? null : () => {
                const key = "b" + f.id;
                const oeffnen = expandedId !== key;
                setExpandedId(oeffnen ? key : null);
                if (oeffnen) onFilmwissenLaden?.(f);
              }}
              onSave={auswahlmodus ? null : (changes) => updateFilm(f.id, changes)}
              onDelete={auswahlmodus ? null : () => deleteFilm?.(f.id)}
              kinoInfo={(dreieckTab || ansicht === "besitz") && f.quelle ? <QuellenBadges quelle={f.quelle} /> : null}
              kommtVorIn={kommtVorInMap[f.id]}
              onArtikelKlick={auswahlmodus ? null : onArtikelKlick}
              auswahlmodus={auswahlmodus}
              auswaehlbar={idAnalyse.auswaehlbareIds.has(kanonischeStabileId(f))}
              ausgewaehlt={auswahlIds.has(kanonischeStabileId(f))}
              onAuswahl={() => setAuswahlIds((aktuell) => schalteAuswahlUm(aktuell, f, idAnalyse.auswaehlbareIds))}
              vorbewertung={!auswahlmodus && vorbewertungAktiv && hatDreieck(f.typ) ? {
                laeuft: prognoseLaufId === f.id,
                fehler: prognoseFehler[f.id] || null,
                sperrgrund: prognoseSperrgrund,
                aktuelleProfilVersion,
                onErstellen: () => onPrognoseErstellen?.(f),
                onAnnehmen: () => onPrognoseStatus?.(f, "angenommen"),
                onVerwerfen: () => onPrognoseStatus?.(f, "verworfen"),
              } : null}
              filmwissen={!auswahlmodus && filmwissenAktiv && hatDreieck(f.typ) ? {
                ...(filmwissenProFilm[f.id] || { phase: "idle", daten: null, fehler: null }),
                rechercheLaeuft: filmwissenRechercheLaufId === String(f.id),
                rechercheMoeglich: filmwissenRechercheAktiv && !!filmwissenRechercheKennung(f),
                onRecherchieren: () => onFilmwissenRecherchieren?.(f),
              } : null}
            />
          </div>
        ))}
      </div>

      {/* Offene Blog-Referenzen: Sammelstelle für "Später"-geklickte Rotlinks.
          Reiner Laufzeit-Filter über die Artikel — wird nicht gepflegt. */}
      {!auswahlmodus && ansicht === "bestand" && offeneRefsTab.length > 0 && (
        <details style={{ marginTop: 26 }} open>
          <summary style={{ cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: ROTLINK }}>
            Offene Blog-Referenzen ({offeneRefsTab.length}) — {TAB_LABELS[typTab]} ohne Mediathek-Eintrag
          </summary>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {offeneRefsTab.map((o, i) => {
              const zielTyp = o.typ || (typTab === "musik" ? "musik" : typTab === "sonstiges" ? "sonstiges" : typTab === "serien" ? "serie" : "film");
              const aktiv = refAnlegen === i;
              return (
                <div key={i} style={{ borderBottom: "1px solid " + T.saalHoch, padding: "6px 2px" }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: T.leinwandTief, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: ROTLINK, flex: 1, minWidth: 160 }}>{o.eingabe}{o.jahr ? " (" + o.jahr + ")" : ""}{o.typ ? " · " + o.typ : ""}</span>
                    <span style={{ color: T.rauch }}>aus „{o.artikelTitel}“</span>
                    <button style={{ ...btnStyle(false), fontSize: 12, padding: "4px 10px" }} onClick={() => setRefAnlegen(aktiv ? null : i)}>
                      {aktiv ? "Schließen" : "✎ Anlegen"}
                    </button>
                    {onArtikelKlick && (
                      <button style={{ ...btnStyle(false), fontSize: 12, padding: "4px 10px" }} onClick={() => onArtikelKlick(o.artikelId)}>→ Artikel</button>
                    )}
                  </div>
                  {aktiv && (
                    <div style={{ marginTop: 8 }}>
                      {/* Nach dem Anlegen heilt die automatische Rotlink-Heilung die
                          Referenz — die Zeile verschwindet von selbst. */}
                      {hatDreieck(zielTyp)
                        ? <FilmForm startOffen typOptionen={[zielTyp]} initial={{ titel: o.eingabe, jahr: o.jahr || "" }} onAdd={addFilm} onDone={() => setRefAnlegen(null)} />
                        : <MedienForm typ={zielTyp} startOffen initial={{ titel: o.eingabe, jahr: o.jahr || "" }} onAdd={addFilm} onDone={() => setRefAnlegen(null)} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Unbewerteter Besitz (Nachtrag) — nur im Filme-Tab relevant */}
      {!auswahlmodus && ansicht === "bestand" && typTab === "filme" && nachtragFlach.length > 0 && (
        <details style={{ marginTop: 26 }}>
          <summary style={{ cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: T.rauch }}>
            Unbewerteter Besitz ({nachtragFlach.length}) — noch ohne Dreieck
          </summary>
          <div style={{ marginTop: 8, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}>
            Aus DVD-Sammlung & Prime-Snapshot, nicht in der Masterliste. Bewerten heißt: als Eintrag aufnehmen (Formular oben).
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {nachtragFlach.map((n, i) => {
              const q = n.quellen || [];
              const teile = ["dvd", "prime", "apple"].filter((x) => q.includes(x));
              const quelle = teile.length ? teile.join("+") : "must_watch";
              const aktiv = bewerteTitel === n.titel;
              return (
                <div key={i} style={{ borderBottom: "1px solid " + T.saalHoch, padding: "6px 2px" }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: T.leinwandTief, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: T.leinwand, flex: 1, minWidth: 180 }}>{n.titel}{n.jahr ? " (" + n.jahr + ")" : ""}</span>
                    <span style={{ color: T.wolfram }}>{q.join("+")}</span>
                    {n.edition && <span style={{ color: T.rauch }}>{n.edition}</span>}
                    <button style={{ ...btnStyle(false), fontSize: 12, padding: "4px 10px" }}
                      onClick={() => setBewerteTitel(aktiv ? null : n.titel)}>
                      {aktiv ? "Schließen" : "✎ Bewerten"}
                    </button>
                  </div>
                  {aktiv && (
                    <div style={{ marginTop: 8 }}>
                      {/* Vorbefüllt: Titel, Jahr, Besitz-Quelle, Edition als Scope.
                          Dreieck/Kategorie/Genres trägt Max selbst ein. Nach dem
                          Hinzufügen verschwindet der Titel automatisch aus dem
                          Nachtrag (Laufzeit-Abgleich gegen die Master). */}
                      <FilmForm
                        startOffen
                        typOptionen={["film", "serie"]}
                        initial={{ titel: n.titel, jahr: n.jahr || "", quelle, notiz: n.edition ? "Edition: " + n.edition : "" }}
                        onAdd={addFilm}
                        onDone={() => setBewerteTitel(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      </>)}
    </section>
  );
}

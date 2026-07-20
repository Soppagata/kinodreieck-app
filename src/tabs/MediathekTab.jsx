import { useState, useMemo, useEffect } from "react";
import { T, ROTLINK, btnStyle, inputStyle } from "../lib/tokens.js";
import { norm, schlagseite, score } from "../lib/match.js";
import { store, K } from "../lib/storage.js";
import { offeneReferenzen } from "../lib/artikel.js";
import { TYP_GRUPPEN, TAB_LABELS, tabVonTyp, hatDreieck } from "../lib/typen.js";
import { quelleText, hatPhysischeQuelle } from "../lib/quellen.js";
import { istMustwatchId } from "../lib/mustwatch.js";
import { Chip, ChipReihe, SegmentedControl, IconExport } from "../components/ui.jsx";
import { FeldHinweis } from "../components/FeldHinweis.jsx";
import { FilmCard } from "../components/FilmCard.jsx";
import { FilmForm } from "../components/EintragForm.jsx";
import { MedienForm } from "../components/MedienForm.jsx";
import { MasterImport } from "../components/MasterImport.jsx";
import { TeilenBlock } from "../components/TeilenBlock.jsx";
import { MustWatchListe } from "../components/MustWatchListe.jsx";

/* ================= MEDIATHEK =================
   Drei Ansichten über EINEN Umschalter (kein 8. Nav-Bereich):
   - Bestand: die klassische Mediathek (typ als Diskriminator, Tabs = Filter).
   - Im Besitz: NUR Einträge mit mindestens einer physischen Quelle
     (quellen.js-Art — Prime/Apple-Käufe zählen NICHT als Besitz).
     Unbewertete Einträge sind hier erstklassige Bürger (Filter + Badge).
   - Must-Watch: eigener Datentopf (10. Sync-Datei), KEIN Master-Filter.
   artikel: Blog-Artikel (Phase 2) für die "Kommt vor in:"-Anzeige. */
export function MediathekTab({ master, nachtragFlach, expandedId, setExpandedId, updateFilm, addFilm, badgeFuer, artikel = [], onArtikelKlick, fokusFilmId, onFokusVerbraucht,
  exportMaster, importMaster, autorName, saveAutorName, uebernehmePaket, setErr,
  mustwatch = [], addMustwatch, updateMustwatch, deleteMustwatch, mwKandidaten = { master: [], programm: [], streaming: [] } }) {
  const [ansicht, setAnsicht] = useState("bestand"); // bestand | besitz | mustwatch
  const [typTab, setTypTab] = useState("filme");
  const [nurUnbewertet, setNurUnbewertet] = useState(false); // Besitz-Ansicht: nur unbewertete zeigen
  const [bewerteTitel, setBewerteTitel] = useState(null); // Nachtrag-Titel, der gerade bewertet wird

  /* Sprung aus dem Blog: Must-Watch-Refs (mw_…) öffnen die Must-Watch-Ansicht,
     Master-Refs die Bestand-Ansicht (dort ist jeder Eintrag sicher sichtbar). */
  useEffect(() => {
    if (!fokusFilmId) return;
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
  const [axis, setAxis] = useState(null);
  const [genreF, setGenreF] = useState(null);
  const [katF, setKatF] = useState(null);
  const [suche, setSuche] = useState("");
  const [sortier, setSortier] = useState("score");
  /* Filtermenü (Chip-Filter) auf/zu — pro Session, Default ZUGEKLAPPT.
     sessionStorage: jedes Neu-Öffnen der App startet zu; innerhalb der Session gemerkt. */
  const [filterMenueOffen, setFilterMenueOffen] = useState(() => {
    try { return sessionStorage.getItem("kd:filter-mediathek") === "1"; } catch { return false; }
  });
  const toggleFilterMenue = () => setFilterMenueOffen((v) => {
    const nv = !v; try { sessionStorage.setItem("kd:filter-mediathek", nv ? "1" : "0"); } catch { /* egal */ } return nv;
  });

  const dreieckTab = typTab === "filme" || typTab === "serien";
  const HAUPTTYP = { filme: "film", serien: "serie", musik: "musik", sonstiges: "sonstiges" };
  const typReihe = [HAUPTTYP[typTab]].concat(["film", "serie", "musik", "sonstiges"].filter((t) => t !== HAUPTTYP[typTab]));

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
      if (axis) list = list.filter((f) => schlagseite(f.bewertung) === axis);
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
  }, [basis, ansicht, nurUnbewertet, typTab, dreieckTab, besitz, axis, genreF, katF, suche, sortier]);

  return (
    <section>
      {/* Ansicht-Umschalter: Einträge · Im Besitz · Must-Watch (immer sichtbar).
          Interner Key bleibt "bestand" — nur das Label heißt Einträge (Max, 18.07.). */}
      <SegmentedControl value={ansicht} onChange={(id) => { setAnsicht(id); setExpandedId(null); }}
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
          onSpringeZuRef={(id) => {
            setAnsicht("bestand");
            const f = (master || []).find((x) => x.id === id);
            if (f) setTypTab(tabVonTyp(f.typ));
            setTimeout(() => {
              const el = document.getElementById("film-" + id);
              if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 150);
          }} />
      )}

      {ansicht !== "mustwatch" && (<>
      {/* Typ-Tabs (Filter auf typ) */}
      <SegmentedControl value={typTab} onChange={(t) => { setTypTab(t); setExpandedId(null); }}
        options={Object.keys(TYP_GRUPPEN).map((t) => ({ id: t, label: TAB_LABELS[t], badge: counts[t] }))} />

      <div className="kd-kompakt" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Titel oder Originaltitel suchen …"
          style={{ ...inputStyle, flex: 1, minWidth: 170 }} />
        {suche && <button style={{ ...btnStyle(false), fontSize: 13, padding: "6px 11px" }} onClick={() => setSuche("")}>×</button>}
        <select value={sortier} onChange={(e) => setSortier(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {dreieckTab && <option value="score">Sortierung: Dreieck-Score</option>}
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
          <button onClick={toggleFilterMenue} title={filterMenueOffen ? "Filter einklappen" : "Filter ausklappen"}
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
            <Chip active={axis === "wie"} color={T.wie} onClick={() => setAxis(axis === "wie" ? null : "wie")}>WIE-lastig</Chip>
            <Chip active={axis === "was"} color={T.was} onClick={() => setAxis(axis === "was" ? null : "was")}>WAS-lastig</Chip>
            <Chip active={axis === "warum"} color={T.warum} onClick={() => setAxis(axis === "warum" ? null : "warum")}>WARUM-lastig</Chip>
          </ChipReihe>
          <ChipReihe style={{ gap: 6 }}>
            {[["immer_gut", "Immer gut"], ["kult", "Kult"], ["kult_klassiker", "Kult-Klassiker"], ["daemlich_aber_herrlich", "Dämlich aber herrlich"], ["trash", "Trash"], ["sehenswert", "Sehenswert"], ["echter_schrott", "Echter Schrott"]].map(([k, l]) => (
              <Chip key={k} active={katF === k} onClick={() => setKatF(katF === k ? null : k)}>{l}</Chip>
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
          <strong> Einstellungen → Gesamt-Backup herunterladen</strong>.
        </div>
      )}
      {/* Eingabemaske pro Tab: Dreieck-Typen -> FilmForm, Musik/Sonstiges ->
          schlichte MedienForm. key=typTab: Tab-Wechsel klappt das Formular zu. */}
      <div data-tour="eintrag-neu" style={{ marginBottom: 16 }}>
        <FilmForm key={typTab} typOptionen={typReihe} onAdd={addFilm} />
      </div>

      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch, marginBottom: 10 }}>
        {mediathek.length} {mediathek.length === 1 ? "Eintrag" : "Einträge"} · Karte antippen für Details & Bearbeiten
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mediathek.map((f) => (
          <div key={f.id} id={"film-" + f.id}>
            <FilmCard
              film={f}
              streamBadge={dreieckTab && badgeFuer ? badgeFuer(f) : null}
              expanded={expandedId === "b" + f.id}
              onToggle={() => setExpandedId(expandedId === "b" + f.id ? null : "b" + f.id)}
              onSave={(changes) => updateFilm(f.id, changes)}
              kinoInfo={(dreieckTab || ansicht === "besitz") && f.quelle ? <span style={{ color: T.tinteWeich }}>{quelleText(f.quelle)}</span> : null}
              kommtVorIn={kommtVorInMap[f.id]}
              onArtikelKlick={onArtikelKlick}
            />
          </div>
        ))}
      </div>

      {/* Offene Blog-Referenzen: Sammelstelle für "Später"-geklickte Rotlinks.
          Reiner Laufzeit-Filter über die Artikel — wird nicht gepflegt. */}
      {ansicht === "bestand" && offeneRefsTab.length > 0 && (
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
      {ansicht === "bestand" && typTab === "filme" && nachtragFlach.length > 0 && (
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

      {/* ---- Daten & Teilen direkt im Bereich (Punkt 6): Export/Import der
           Filmliste + komplettes Teilen/KI-Ingestion, ohne Tab-Wechsel. ---- */}
      {ansicht === "bestand" && exportMaster && (
        <details style={{ marginTop: 26 }}>
          <summary style={{ cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: T.rauch }}>
            Daten & Teilen (Export · Import · KI-Listen)
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
            <div data-tour="master-import" style={{ background: T.saalHoch, borderRadius: 6, padding: "14px 16px" }}>
              <button style={{ ...btnStyle(true), marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 8 }} onClick={exportMaster}><IconExport size={16} />Filmliste exportieren (JSON)</button>
              <FeldHinweis feld="export_liste" />
              <MasterImport onImport={importMaster} hasMaster={!!master} />
            </div>
            {uebernehmePaket && (
              <TeilenBlock master={master} artikel={artikel}
                autorName={autorName} saveAutorName={saveAutorName}
                uebernehmePaket={uebernehmePaket} setErr={setErr} />
            )}
          </div>
        </details>
      )}
      </>)}
    </section>
  );
}

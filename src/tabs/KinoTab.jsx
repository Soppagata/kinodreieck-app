import { useState, useMemo } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { matchFilm, norm } from "../lib/match.js";
import { istImAbo } from "../lib/kinos.js";
import { store, K } from "../lib/storage.js";
import { Chip, ChipReihe, IconDelete } from "../components/ui.jsx";
import { FilmCard } from "../components/FilmCard.jsx";
import { KinoLinks } from "../components/KinoLinks.jsx";
import { FilmForm } from "../components/EintragForm.jsx";

/* ================= KINO (Dashboard) =================
   Programmquellen: public/programm.json (Job) · Nonstop-HTML-Import ·
   Snapshot-Import. Suche + Filter (Kino / Tag / Abo / Fassung) wirken
   auf BEIDE Sektionen — Treffer und "Läuft auch". */

const tagKey = (s) => { const m = /(\d{1,2})\.(\d{1,2})\./.exec(String(s)); return m ? m[1] + "." + m[2] + "." : null; };

export function KinoTab({
  programm, progStand, master, kinoMatches, restSichtbar,
  zeitgrenze, saveZeitgrenze, zeigeAlles, setZeigeAlles,
  expandedId, setExpandedId, updateFilm, addFilm, badgeFuer, loading, ladeProgrammDatei,
  kinoPins = [], toggleKinoPin, datenGesperrt = false,
}) {
  const istGepinnt = (t, z) => kinoPins.some((p) => p.t === t && p.z === z);
  /* Pins chronologisch: Monat/Tag/Uhrzeit aus dem Terminstring */
  const pinSort = (p) => {
    const d = /(\d{1,2})\.(\d{1,2})\./.exec(String(p.z));
    const u = /(\d{1,2}):(\d{2})/.exec(String(p.z));
    return (d ? Number(d[2]) * 1000000 + Number(d[1]) * 10000 : 99999999) + (u ? Number(u[1]) * 100 + Number(u[2]) : 0);
  };
  const pinsSortiert = [...kinoPins].sort((a, b) => pinSort(a) - pinSort(b));
  const [sucheK, setSucheK] = useState("");
  const [kinoF, setKinoF] = useState("");
  const [tagF, setTagF] = useState(null);
  const [aboFilter, setAboFilter] = useState("alle"); // "alle" | "nonstop" | "kein" (Nonstop-Abo)
  const aboLabel = { alle: "Abo: alle", nonstop: "Nur NonStop", kein: "Kein NonStop" }[aboFilter];
  const aboCycle = () => setAboFilter((v) => (v === "alle" ? "nonstop" : v === "nonstop" ? "kein" : "alle"));
  const [fassungF, setFassungF] = useState(null);
  const [zeigeMehr, setZeigeMehr] = useState(false);
  /* Filtermenü auf/zu — pro Session, Default ZUGEKLAPPT. Suche bleibt sichtbar.
     sessionStorage: jedes Neu-Öffnen der App startet zu; innerhalb der Session gemerkt. */
  const [filterMenueOffen, setFilterMenueOffen] = useState(() => {
    try { return sessionStorage.getItem("kd:filter-kino") === "1"; } catch { return false; }
  });
  const toggleFilterMenue = () => setFilterMenueOffen((v) => {
    const nv = !v; try { sessionStorage.setItem("kd:filter-kino", nv ? "1" : "0"); } catch { /* egal */ } return nv;
  });

  /* Verfügbare Kinos / Tage / Fassungen aus den Daten ableiten */
  const alleProg = useMemo(() => [...kinoMatches.matched.map((m) => m.prog), ...kinoMatches.rest], [kinoMatches]);
  const kinos = useMemo(() => [...new Set(alleProg.flatMap((pf) => pf.k || []))].sort((a, b) => a.localeCompare(b, "de")), [alleProg]);
  const tage = useMemo(() => {
    const gesehen = new Map(); // key -> sortwert
    for (const pf of alleProg) for (const z of pf.z || []) {
      const k = tagKey(z);
      if (k && !gesehen.has(k)) {
        const [t, m] = k.split(".").map(Number);
        gesehen.set(k, m * 100 + t);
      }
    }
    return [...gesehen.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k).slice(0, 8);
  }, [alleProg]);
  const fassungenDa = useMemo(() => alleProg.some((pf) => pf.f), [alleProg]);

  /* Ein Programm-Film gegen alle aktiven Filter (Suche separat pro Sektion) */
  const passtFilter = (pf) => {
    if (kinoF && !(pf.k || []).includes(kinoF)) return false;
    if (tagF && !(pf.z || []).some((z) => tagKey(z) === tagF)) return false;
    if (aboFilter !== "alle") {
      const abo = pf.im_abo ?? (pf.k || []).some(istImAbo);
      if (aboFilter === "nonstop" && !abo) return false;
      if (aboFilter === "kein" && abo) return false;
    }
    if (fassungF && !(String(pf.f || "").includes(fassungF) || (pf.z || []).some((z) => z.includes("(" + fassungF)))) return false;
    return true;
  };
  /* Bei aktivem Tag-/Kino-Filter nur die passenden Termine zeigen */
  const zeitenGefiltert = (pf) => {
    let z = pf.z || [];
    if (tagF) z = z.filter((s) => tagKey(s) === tagF);
    if (kinoF) {
      const nurKino = z.filter((s) => s.includes(kinoF));
      if (nurKino.length) z = nurKino; // Altformate ohne Kino im Zeitstring: alle behalten
    }
    return z;
  };
  /* Nächster Termin (früheste noch anstehende Vorstellung) als Sortierwert —
     chronologische Programm-Reihenfolge: nächster oben, weitester unten.
     Jahres-Rollover (Dez->Jan) wird berücksichtigt. */
  const terminWert = (zeiten) => {
    const jetzt = Date.now(); const jahr = new Date().getFullYear();
    let min = Infinity;
    for (const s of zeiten || []) {
      const md = /(\d{1,2})\.(\d{1,2})\./.exec(s); if (!md) continue;
      const hm = /(\d{1,2}):(\d{2})/.exec(s);
      const mk = (y) => new Date(y, Number(md[2]) - 1, Number(md[1]), hm ? Number(hm[1]) : 0, hm ? Number(hm[2]) : 0).getTime();
      let t = mk(jahr); if (t < jetzt - 2 * 86400000) t = mk(jahr + 1);
      if (t < min) min = t;
    }
    return min;
  };
  const nachTermin = (za, zb) => terminWert(za) - terminWert(zb);

  const nq = norm(sucheK);
  // Chronologisch — nächster Termin oben, wie das übrige Programm.
  const matchedGefiltert = useMemo(() =>
    kinoMatches.matched.filter(({ prog, film }) =>
      passtFilter(prog) && (!nq || norm(prog.t).includes(nq) || norm(film.titel).includes(nq) || norm(film.originaltitel || "").includes(nq)))
      .sort((a, b) => nachTermin(zeitenGefiltert(a.prog), zeitenGefiltert(b.prog))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kinoMatches, kinoF, tagF, aboFilter, fassungF, nq]);
  const restGefiltert = useMemo(() =>
    restSichtbar.filter((pf) => passtFilter(pf) && (!nq || norm(pf.t).includes(nq)))
      .sort((a, b) => nachTermin(zeitenGefiltert(a), zeitenGefiltert(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restSichtbar, kinoF, tagF, aboFilter, fassungF, nq]);

  const filterAktiv = sucheK || kinoF || tagF || aboFilter !== "alle" || fassungF;

  return (
    <section>
      <ChipReihe style={{ gap: 10, marginBottom: 12 }}>
        {/* Nur sinnvoll über einen Server: per Doppelklick (file://) blockiert der
            Browser jeden Datei-fetch. Beim Doppelklick liefert der tägliche Job den
            frischen Stand über den Neubau — nicht über diesen Button. */}
        {(typeof location === "undefined" || location.protocol !== "file:") && (
          <button style={btnStyle(false)} disabled={loading === "programm"} onClick={() => ladeProgrammDatei(true)}
            title="Liest public/programm.json neu ein (nur wenn die App über einen Server läuft).">
            {loading === "programm" ? "Lade programm.json …" : "programm.json neu laden"}
          </button>
        )}
        <a href="https://www.nonstopkino.at/programm" target="_blank" rel="noopener noreferrer"
          style={{ ...btnStyle(false), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          title="Verlässlicher Fallback: Seite öffnen → Strg+S („nur HTML“) → Datei im Einstellungen-Tab einspielen.">
          Nonstop-Seite ↗
        </a>
        {progStand && (
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}>
            Stand {new Date(progStand).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{programm?.quelle_hinweis ? " · " + programm.quelle_hinweis : ""}
          </span>
        )}
      </ChipReihe>

      {/* ---- Angepinnte Termine (überleben Programm-Refreshs, Boot räumt Vergangenes auf) ---- */}
      {pinsSortiert.length > 0 && (
        <div style={{ background: T.saalHoch, borderRadius: 6, padding: "10px 14px", marginBottom: 14, borderLeft: "3px solid " + T.wolfram }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, letterSpacing: "0.06em", textTransform: "uppercase", color: T.wolfram, marginBottom: 4 }}>
            Angepinnt ({pinsSortiert.length})
          </div>
          {pinsSortiert.map((p) => (
            <div key={p.t + "|" + p.z} style={{ display: "flex", gap: 10, alignItems: "baseline", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, padding: "3px 0" }}>
              <span onClick={() => setSucheK(p.t)} title="Im Programm zu diesem Film springen"
                style={{ color: T.leinwand, fontWeight: 700, cursor: "pointer" }}>{p.t}</span>
              {p.j ? <span style={{ color: T.rauch }}>({p.j})</span> : null}
              <span style={{ flex: 1 }}>{p.z}</span>
              <button onClick={() => toggleKinoPin(p.t, p.j, p.z)} title="Pin lösen" className="kd-del"
                style={{ background: "none", border: "none", color: T.gefahr, cursor: "pointer", fontSize: 13, padding: "0 2px" }}><IconDelete size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {!programm && loading !== "programm" && (
        <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px", fontSize: 14, color: T.rauch, lineHeight: 1.6 }}>
          {datenGesperrt ? (
            <><strong style={{ color: T.wolfram }}>Clean ohne Terminal-Installation.</strong> Die beigepackten Kinodaten bleiben gesperrt. Starte <code style={{ color: T.wolfram }}>Installation-Mac.command</code> oder <code style={{ color: T.wolfram }}>Installation-Windows.bat</code>, wechsle zur Demo oder importiere bewusst eigene Programm-/Nonstop-Daten.</>
          ) : (
            <>Kein Kinoprogramm geladen. Zwei Wege:
              <br />1. <strong style={{ color: T.leinwand }}>programm.json</strong> in den <code style={{ color: T.wolfram }}>public/</code>-Ordner legen (geplanter Job) und oben neu laden.
              <br />2. Nonstop-Seite öffnen (Button oben), mit Strg+S speichern („nur HTML“) und im Einstellungen-Tab einspielen.</>
          )}
        </div>
      )}

      {programm && (
        <>
          {/* ---- Suche (immer sichtbar) & Filter (einklappbar, P1.4) ---- */}
          <div data-tour="kino-filter" className="kd-kompakt" style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={sucheK} onChange={(e) => setSucheK(e.target.value)} placeholder="Programm durchsuchen …"
              style={{ ...inputStyle, flex: 1, minWidth: 170 }} />
            {sucheK && <button style={{ ...btnStyle(false), fontSize: 13, padding: "6px 11px" }} onClick={() => setSucheK("")}>×</button>}
            <button onClick={toggleFilterMenue} title={filterMenueOffen ? "Filter einklappen" : "Filter ausklappen"}
              style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }}>
              {filterMenueOffen ? "▾ Filter" : "▸ Filter"}
            </button>
          </div>
          {filterMenueOffen && (
            <>
              <ChipReihe>
                <select value={kinoF} onChange={(e) => setKinoF(e.target.value)} style={{ ...inputStyle, width: "auto", maxWidth: 220 }}>
                  <option value="">Alle Kinos</option>
                  {kinos.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <Chip active={aboFilter !== "alle"} onClick={aboCycle}>{aboLabel}</Chip>
                {fassungenDa && ["OmU", "OV", "DF"].map((fs) => (
                  <Chip key={fs} active={fassungF === fs} onClick={() => setFassungF(fassungF === fs ? null : fs)}>{fs}</Chip>
                ))}
              </ChipReihe>
              <ChipReihe style={{ gap: 6 }}>
                {tage.map((t) => <Chip key={t} active={tagF === t} onClick={() => setTagF(tagF === t ? null : t)}>{t}</Chip>)}
                <span style={{ width: 12 }} />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}
                  title='Zeitgrenze für „Läuft auch": Filme ohne Vorstellung ab dieser Uhrzeit werden ausgeblendet. Deine Treffer sind nie betroffen.'>
                  Rest ab
                  <input value={zeitgrenze} onChange={(e) => saveZeitgrenze(e.target.value)} placeholder="14:00"
                    style={{ ...inputStyle, width: 52, padding: "5px 7px", fontFamily: "'Space Mono', monospace", fontSize: 12, textAlign: "center" }} />
                </label>
                <button
                  style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px", borderColor: zeigeAlles ? T.wolfram : T.rauch, color: zeigeAlles ? T.wolfram : T.leinwand }}
                  onClick={() => setZeigeAlles(!zeigeAlles)}>
                  {zeigeAlles ? "Zeitfilter an" : "Ganzes Tagesprogramm"}
                </button>
                {filterAktiv && (
                  <button style={{ ...btnStyle(false), fontSize: 12, padding: "5px 10px" }}
                    onClick={() => { setSucheK(""); setKinoF(""); setTagF(null); setAboFilter("alle"); setFassungF(null); }}>
                    Filter zurücksetzen
                  </button>
                )}
              </ChipReihe>
            </>
          )}

          {/* Pin-Hinweis, solange noch nichts gepinnt ist (Entdeckbarkeit) */}
          {pinsSortiert.length === 0 && (
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch, marginBottom: 10 }}>
              ◇ vor einem Termin = anpinnen — Gepinntes sammelt sich oben im Tab und übersteht den täglichen Programm-Wechsel.
            </div>
          )}

          {/* ---- Treffer ---- */}
          {master && (
            <>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "10px 0 10px" }}>
                Läuft & passt zu dir ({matchedGefiltert.length}{matchedGefiltert.length !== kinoMatches.matched.length ? " von " + kinoMatches.matched.length : ""})
              </h2>
              {matchedGefiltert.length === 0 && (
                <p style={{ color: T.rauch, fontSize: 14 }}>{filterAktiv ? "Kein Treffer mit diesen Filtern." : "Kein Titel aus deiner Liste im aktuellen Programm."}</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {matchedGefiltert.map(({ prog, film }) => {
                  const z = zeitenGefiltert(prog);
                  return (
                    <FilmCard
                      key={film.id}
                      film={film}
                      streamBadge={badgeFuer ? badgeFuer(film) : null}
                      expanded={expandedId === "k" + film.id}
                      onToggle={() => setExpandedId(expandedId === "k" + film.id ? null : "k" + film.id)}
                      onSave={(changes) => updateFilm(film.id, changes)}
                      kinoInfo={
                        <>
                          <span style={{ fontWeight: 700 }}><KinoLinks kinos={kinoF ? [kinoF] : prog.k} /></span>
                          {"  "}
                          {z.slice(0, 5).map((zi, zIdx) => (
                            <span key={zi}>
                              {zIdx > 0 && " / "}
                              <span data-tour="pin"
                                onClick={(e) => { e.stopPropagation(); toggleKinoPin && toggleKinoPin(prog.t, prog.j ?? film.jahr, zi); }}
                                title={istGepinnt(prog.t, zi) ? "Pin lösen" : "Termin anpinnen"}
                                style={{ cursor: "pointer", color: istGepinnt(prog.t, zi) ? T.wolfram : undefined, fontWeight: istGepinnt(prog.t, zi) ? 700 : undefined }}>
                                {istGepinnt(prog.t, zi) ? "◆ " : "◇ "}{zi}
                              </span>
                            </span>
                          ))}
                          {z.length > 5 ? <span style={{ color: T.rauch }}> · +{z.length - 5} weitere Termine</span> : ""}
                          {prog.f ? "  · " + prog.f : ""}
                          {prog.s ? <span style={{ color: T.gefahr }}> · {prog.s}</span> : ""}
                        </>
                      }
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* ---- Events / Demnächst (unverändert, nur wenn ungefiltert) ---- */}
          {!filterAktiv && programm.events?.length > 0 && (
            <>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "26px 0 10px" }}>
                Events & Sondervorstellungen
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {programm.events.map((ev, i) => (
                  <div key={i} style={{ background: T.saalHoch, borderRadius: 6, padding: "12px 14px", borderLeft: "3px solid " + T.wolfram }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 18, textTransform: "uppercase", letterSpacing: "0.03em" }}>{ev.t}</div>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.rauch, marginTop: 3 }}>{ev.k} · {ev.d}</div>
                    {ev.info && <div style={{ fontSize: 13, marginTop: 5, color: T.leinwandTief }}>{ev.info}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
          {!filterAktiv && programm.demnaechst?.length > 0 && (
            <>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "26px 0 10px" }}>
                Demnächst angekündigt
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {programm.demnaechst.map((n, i) => {
                  const m = master ? matchFilm(n.t, n.j, master) : null;
                  return (
                    <div key={i} style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: T.leinwandTief, padding: "6px 2px", borderBottom: "1px solid " + T.saalHoch, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ color: m ? T.wolfram : T.leinwand, flex: 1, minWidth: 160 }}>
                        {m ? "★ " : ""}{n.t}{n.j ? " (" + n.j + ")" : ""}
                      </span>
                      {n.k && <KinoLinks kinos={[n.k]} />}
                      <span style={{ color: T.rauch }}>{n.d || ""}</span>
                      {m && <span style={{ color: T.wolfram }}>in deiner Liste</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ---- Läuft auch: gefilterte Liste statt zugeklapptem Block ---- */}
          {kinoMatches.rest.length > 0 && (
            <>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: T.rauch, margin: "26px 0 8px" }}>
                Läuft auch{master ? ", nicht in deiner Liste" : ""} ({restGefiltert.length}{restGefiltert.length < kinoMatches.rest.length ? " von " + kinoMatches.rest.length : ""})
              </h2>
              {restSichtbar.length < kinoMatches.rest.length && !zeigeAlles && (
                <div style={{ marginBottom: 8, fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}>
                  Filme ohne Vorstellung ab {zeitgrenze} sind ausgeblendet — „Ganzes Tagesprogramm" hebt das auf.
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(zeigeMehr ? restGefiltert : restGefiltert.slice(0, 40)).map((pf) => (
                  <KompaktEintrag key={pf.film_at_id || pf.t}
                    pf={pf} zeiten={zeitenGefiltert(pf)} kinos={kinoF ? [kinoF] : pf.k}
                    addFilm={addFilm} istGepinnt={istGepinnt} togglePin={toggleKinoPin}
                    master={master} updateFilm={updateFilm} />
                ))}
              </div>
              {restGefiltert.length > 40 && (
                <button style={{ ...btnStyle(false), fontSize: 13, padding: "7px 12px", marginTop: 10 }} onClick={() => setZeigeMehr(!zeigeMehr)}>
                  {zeigeMehr ? "Weniger zeigen" : `Alle ${restGefiltert.length} zeigen`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- Kompakter Programm-Eintrag (nicht in der Liste) ----------
   Look der bewerteten Karten, nur wesentlich niedriger: helle Titelzeile,
   darunter Jahr, darunter Kino & Termine — ohne Dreieck, ohne Scoring.
   Rechts klappt der Pfeil auf: film.at-Beschreibung (falls der Snapshot eine
   liefert), Genres, pinnbare Termine und "Eintrag erstellen" — die FilmForm
   startet mit Titel/Jahr/Genres/Beschreibung vorbefüllt, damit niemand bei
   null anfängt. Nach dem Anlegen matcht der Film und wandert automatisch
   in "Läuft & passt zu dir". */
function KompaktEintrag({ pf, zeiten, kinos, addFilm, istGepinnt, togglePin, master, updateFilm }) {
  const [offen, setOffen] = useState(false);
  const [formAn, setFormAn] = useState(false);
  const [zeigeAlle, setZeigeAlle] = useState(false);
  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "8px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        onClick={() => { setOffen(!offen); if (offen) setFormAn(false); }}
        title={offen ? "Zuklappen" : "Details & Eintrag erstellen"}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: T.leinwand, fontSize: 14, fontWeight: 600 }}>
            {pf.t}
            {pf.s ? <span style={{ color: T.wolfram, fontSize: 11, marginLeft: 8, fontFamily: "'Space Mono', monospace" }}>{pf.s}</span> : null}
            {pf.im_abo ? <span style={{ color: T.wolfram, fontSize: 11, marginLeft: 8, fontFamily: "'Space Mono', monospace" }}>✓Abo</span> : null}
          </div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch, margin: "1px 0" }}>{pf.j || "Jahr unbekannt"}{pf.ot && pf.ot !== pf.t ? " · " + pf.ot : ""}</div>
          {/* Collapsed: kompakt in EINER Zeile. Bei vielen Kinos nur die Anzahl (Max 2026-07-19:
              die volle Kinoliste sprengte die Zeile). Kinos + Termine stehen aufgeklappt. */}
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {kinos.length <= 2
              ? <span onClick={(e) => e.stopPropagation()}><KinoLinks kinos={kinos} /></span>
              : <span style={{ color: T.rauch }}>{kinos.length} Kinos</span>}
            {zeiten.length ? <span style={{ color: T.rauch }}>{" · "}{zeiten.length} Termin{zeiten.length > 1 ? "e" : ""}</span> : null}
          </div>
          {pf.b && (
            // Collapsed dezent (wie gehabt); aufgeklappt heller + abgesetzt, damit die
            // Beschreibung nicht zwischen Kino-Zeile und Terminen untergeht.
            <div style={{ fontSize: 12, lineHeight: 1.45, marginTop: 3, color: offen ? T.leinwandTief : T.rauch,
              ...(offen ? { paddingTop: 6, marginTop: 6, borderTop: "1px dashed " + T.saal } : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{pf.b}</div>
          )}
        </div>
        <span style={{ color: offen ? T.wolfram : T.rauch, fontSize: 15, flexShrink: 0, transform: offen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </div>
      {offen && (
        <div style={{ marginTop: 8, borderTop: "1px solid " + T.saal, paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {(pf.g || []).length > 0 && (
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}>{pf.g.join(" · ")}</div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(zeigeAlle ? zeiten : zeiten.slice(0, 16)).map((z) => (
              <button key={z} onClick={() => togglePin && togglePin(pf.t, pf.j, z)}
                title={istGepinnt(pf.t, z) ? "Pin lösen" : "Termin anpinnen"}
                style={{
                  ...btnStyle(false), fontSize: 11, padding: "4px 9px", fontFamily: "'Space Mono', monospace", textTransform: "none", letterSpacing: 0,
                  borderColor: istGepinnt(pf.t, z) ? T.wolfram : T.saal, color: istGepinnt(pf.t, z) ? T.wolfram : T.leinwandTief,
                }}>
                {istGepinnt(pf.t, z) ? "◆" : "◇"} {z}
              </button>
            ))}
          </div>
          {zeiten.length > 16 && (
            <button onClick={() => setZeigeAlle((v) => !v)}
              style={{ ...btnStyle(false), fontSize: 12, padding: "5px 11px", alignSelf: "flex-start" }}>
              {zeigeAlle ? "Weniger Termine" : `Alle ${zeiten.length} Termine zeigen`}
            </button>
          )}
          {!formAn ? (
            addFilm && (
              <div>
                <button style={{ ...btnStyle(true), fontSize: 13, padding: "7px 12px" }} onClick={() => setFormAn(true)}>
                  Eintrag erstellen
                </button>
              </div>
            )
          ) : (
            <FilmForm startOffen typOptionen={["film"]}
              initial={{ titel: pf.t, jahr: pf.j, quelle: "must_watch", genre: (pf.g || []).join(", "), begruendung: pf.b || "" }}
              onAdd={(f) => addFilm(f)} onDone={() => setFormAn(false)} />
          )}
          {/* Übersetzungsfälle ("Das siebente Siegel" vs. "The Seventh Seal")
             erkennt keine Heuristik — hier von Hand verknüpfen: setzt die
             film_at_id in deinen Eintrag (exaktes Matching für immer) und
             übernimmt optional den deutschen Verleihtitel. */}
          {master && updateFilm && !formAn && (
            <details>
              <summary style={{ cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}>
                Schon in deiner Liste? Eintrag verknüpfen …
              </summary>
              <VerknuepfenSuche pf={pf} master={master} updateFilm={updateFilm} />
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Programm-Film mit vorhandenem Mediathek-Eintrag verknüpfen ---------- */
function VerknuepfenSuche({ pf, master, updateFilm }) {
  const [q, setQ] = useState("");
  const [titelUebernehmen, setTitelUebernehmen] = useState(true);
  const nq = norm(q);
  const kandidaten = nq.length >= 2
    ? master.filter((f) => !["musik", "sonstiges"].includes(f.typ || "film")
        && (norm(f.titel).includes(nq) || norm(f.originaltitel || "").includes(nq))).slice(0, 6)
    : [];
  const verknuepfe = (f) => {
    const changes = {};
    if (pf.film_at_id) changes.film_at_id = pf.film_at_id;
    if (titelUebernehmen && norm(pf.t) !== norm(f.titel)) {
      changes.titel = pf.t; // deutscher Verleihtitel wird Anzeige-Titel
      // Der bisherige Titel bleibt als Originaltitel erhalten — außer dort
      // steht schon ein echter Originaltitel (z.B. der schwedische).
      if (!f.originaltitel || norm(f.originaltitel) === norm(f.titel)) changes.originaltitel = f.titel;
    }
    if (!Object.keys(changes).length) return;
    updateFilm(f.id, changes); // Film wandert sofort hoch zu "Läuft & passt zu dir"
  };
  return (
    <div style={{ padding: "8px 0 2px", display: "flex", flexDirection: "column", gap: 6 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="In deiner Mediathek suchen (auch Originaltitel) …"
        style={{ ...inputStyle, maxWidth: 340, fontSize: 13 }} />
      {norm(pf.t) && (
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch, cursor: "pointer" }}>
          <input type="checkbox" checked={titelUebernehmen} onChange={() => setTitelUebernehmen(!titelUebernehmen)} />
          Programm-Titel „{pf.t}" als Anzeige-Titel übernehmen (bisheriger wandert in die Metadaten)
        </label>
      )}
      {kandidaten.map((f) => (
        <button key={f.id} onClick={() => verknuepfe(f)}
          title="Verknüpfen — setzt die film.at-ID in diesen Eintrag"
          style={{ ...btnStyle(false), textAlign: "left", textTransform: "none", letterSpacing: 0, fontSize: 13, padding: "6px 10px" }}>
          {f.titel}{f.jahr ? " (" + f.jahr + ")" : ""}
          {f.originaltitel && norm(f.originaltitel) !== norm(f.titel) ? <span style={{ color: T.rauch }}> · {f.originaltitel}</span> : null}
          {f.bewertet_von === "max" ? <span style={{ color: T.wolfram }}> · ✓ bewertet</span> : null}
        </button>
      ))}
      {nq.length >= 2 && !kandidaten.length && (
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}>Kein Eintrag gefunden.</span>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { T } from "../lib/tokens.js";
import { useSyncStatus } from "../components/SyncStatusChip.jsx";
import { formatiereTermin } from "../lib/programm.js";
import { Wochenplan } from "../components/Wochenplan.jsx";
import { findeKinoPinImKatalog } from "../lib/wochenplan.js";
import { projectDailyMustwatch, viennaCalendarDay } from "../lib/mustwatch.js";
import { localRecommendationCandidates, webDiscoveryFeedCards } from "../lib/entdeckenUi.js";
import { resolveEntdeckenPins } from "../lib/entdeckenPins.js";
import { projectRecentPersonalEntries } from "../lib/personalEntryChronology.js";
import { formatPresentationDate } from "../lib/presentationDate.js";

/* ================= START =================
   Das Dashboard ist die einzige Startansicht. Alle Module entstehen
   deterministisch aus dem vorhandenen App-State; leere Module verschwinden
   und jede Karte verlinkt in ihren Fachbereich. */

export function StartTab(props) {
  return <StartDashboard {...props} />;
}

/* Pin-Sortierung (nächster Termin zuerst). */
const pinSortWert = (p) => {
  const d = /(\d{1,2})\.(\d{1,2})\./.exec(String(p.z));
  const u = /(\d{1,2}):(\d{2})/.exec(String(p.z));
  return (d ? Number(d[2]) * 1000000 + Number(d[1]) * 10000 : 99999999) + (u ? Number(u[1]) * 100 + Number(u[2]) : 0);
};

/* ==================== DASHBOARD ====================
   Modul-Reihenfolge und -Zuschnitt: Entscheidung Max 18.07.2026.
   Datenquellen (alles vorhandener App-State, keine neuen Fetches, kein LLM):
   · Vertrauens-Zeile: useSyncStatus (Muster SyncStatusChip) + progStand + streamingBekannt
   · Pinboard:         Entdecken-Titel + kinoPins
   · Deine Woche:      persönliche Reminder + Kinopins + passende Kinovorschläge
                       rollierende sieben Tage
   · Must-Watch:       täglich stabile Auswahl aktuell passender Listeneinträge
   · Zuletzt hinzugefügt: ausschließlich neue, rollierend markierte Mastereinträge. */

/* Nächster Termin aus den Zeit-Strings eines Programm-Films — gleiche
   Parse-Logik wie KinoTab.terminWert (Jahres-Rollover, 2-Tage-Kulanz). */
function naechsterTermin(zeiten) {
  const jetzt = Date.now(); const jahr = new Date().getFullYear();
  let min = Infinity, label = null;
  for (const s of zeiten || []) {
    const md = /(\d{1,2})\.(\d{1,2})\./.exec(s); if (!md) continue;
    const hm = /(\d{1,2}):(\d{2})/.exec(s);
    const mk = (y) => new Date(y, Number(md[2]) - 1, Number(md[1]), hm ? Number(hm[1]) : 0, hm ? Number(hm[2]) : 0).getTime();
    let t = mk(jahr); if (t < jetzt - 2 * 86400000) t = mk(jahr + 1);
    if (t < min) { min = t; label = s; }
  }
  return Number.isFinite(min) ? { wert: min, label } : null;
}

/* Der Wochenplan speichert Kinotermine als lokale Kalenderzeit. `toISOString`
   würde daraus UTC machen und die sichtbare Beginnzeit je nach Laufzeitumgebung
   verschieben. */
function lokaleIsoMinute(zeitwert) {
  const d = new Date(zeitwert);
  if (!Number.isFinite(d.getTime())) return "";
  const zwei = (wert) => String(wert).padStart(2, "0");
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}T${zwei(d.getHours())}:${zwei(d.getMinutes())}:00`;
}

/* Modul-Rahmen: editorialer Kopf (Mono-Kicker + →-Link zum Bereich), Optik in index.css. */
function Modul({ name, ziel, linkLabel, onNavigiere, tour, children }) {
  return (
    <section className="kd-dash-modul" data-tour={tour}>
      <div className="kd-dash-kopf">
        <span className="kd-dash-kopfname">{name}</span>
        <button className="kd-dash-kopflink" onClick={() => onNavigiere && onNavigiere(ziel)}>{linkLabel} →</button>
      </div>
      {children}
    </section>
  );
}

/* Vertrauens-Zeile (FIX): Programm-Stand, Katalog-Stand, Sync-Status. Einziger
   Sync-Ort seit Etappe 4 (Griff-Punkt entfernt). Ohne Git-Konfiguration bewusst
   KEIN Sync-Segment. Klasse .kd-vertrauen ist Test-Kanarie (personalmodus_test B/G).
   B13: Fehlende Programm-/Katalogdaten werden NICHT mehr ausgeblendet — eine
   Vertrauenszeile, die bei fehlenden Daten verschwindet, ist das Gegenteil von
   Vertrauen. Fehlt etwas, steht das hier. */
function VertrauensZeile({ progStand, streamingBekannt, programmInfo = null, streamingInfo = null }) {
  const s = useSyncStatus();
  const sync = !s || !s.configured ? null
    : (s.conflict && s.conflict.length) ? { farbe: T.gefahr, text: "Konflikt" }
    : (s.pending && s.pending.length) ? { farbe: T.wolfram, text: "ausstehend " + s.pending.length }
    : (s.stale && s.stale.length) ? { farbe: T.wolfram, text: "nicht aktuell" }
    : { farbe: T.ok, text: "synchron" };
  const fmt = (ms) => formatPresentationDate(ms, { includeTime: true, fallback: "—" });
  const katalog = streamingBekannt && streamingBekannt.stand ? (streamingBekannt.titel || []).length : null;
  const fehltText = (info) => (info?.anmeldungNoetig ? "Anmeldung nötig" : info?.fehler ? "nicht geladen" : "noch nicht geladen");
  const zusatz = programmInfo?.abgelaufen ? " · abgelaufen"
    : programmInfo?.ausCache ? " · aus dem Browser-Speicher" : "";
  return (
    <div className="kd-vertrauen">
      {sync && (
        <span className="kd-vertrauen-seg" title="Geräte-Sync" style={{ color: sync.farbe }}>
          <span className="kd-vertrauen-dot" style={{ background: sync.farbe }} />{sync.text}
        </span>
      )}
      {progStand
        ? <span className="kd-vertrauen-seg" style={programmInfo?.abgelaufen ? { color: T.gefahr } : undefined}>Programm: {fmt(progStand)}{zusatz}</span>
        : <span className="kd-vertrauen-seg" style={{ color: T.gefahr }}>Programm: {fehltText(programmInfo)}</span>}
      {katalog != null
        ? <span className="kd-vertrauen-seg">Katalog: {katalog} Titel</span>
        : <span className="kd-vertrauen-seg" style={{ color: T.gefahr }}>Katalog: {fehltText(streamingInfo)}</span>}
    </div>
  );
}

function StartDashboard({
  kinoPins = [], onNavigiere, zeigeEintrag,
  entdeckenPins = [], webDiscoveryFeed = null, onEntdeckenPinsBereinigen, onSpringeZuEntdecken,
  kinoMatches = { matched: [] }, mustwatch = [], mwKandidaten = null, auswahl = [],
  streamingEntdecken = null, streamingBekannt = null, progStand = null,
  programmInfo = null, streamingInfo = null, onHilfe,
  wochenplan, onWochenplanAendern, entdeckenStatus = {},
  master = [], onSpringeZuStreaming, onSpringeZuKino, onFilmAnlegen, toggleKinoPin,
  onStreamingKatalogLaden,
}) {
  /* Klick auf einen Titel springt zum konkreten Eintrag (springeZuFilm fokussiert den
     Mediathek-/Must-Watch-Eintrag), nicht bloß in den Bereich. Fallback: Tab wechseln. */
  const zuEintrag = (id, fallbackTab) => { if (id && zeigeEintrag) zeigeEintrag(id); else if (onNavigiere) onNavigiere(fallbackTab); };

  /* Die drei stärksten passenden Filme sitzen nicht mehr in einem eigenen
     Dashboard-Modul, sondern als Vorschläge direkt an ihrem Kalendertag. */
  const kinoVorschlaege = useMemo(() => (kinoMatches.matched || [])
    .map((m) => ({ ...m, termin: naechsterTermin((m.prog.z || []).map(formatiereTermin)) }))
    .filter((m) => m.termin)
    .slice(0, 3)
    .map(({ prog, film, termin }) => ({
      t: film.titel || prog.t,
      j: film.jahr ?? prog.j ?? null,
      kino: (prog.k || [])[0] || "",
      z: termin.label,
      termin_iso: lokaleIsoMinute(termin.wert),
      film_ref: film.id ?? null,
      prog_ref: prog.film_at_id ?? prog.id ?? null,
    })), [kinoMatches]);

  const kinoKatalog = useMemo(() => [
    ...(kinoMatches.matched || []).map(({ prog, film }, index) => ({
      id: `kino:treffer:${prog.film_at_id ?? prog.id ?? prog.t}:${(prog.k || []).join("|")}:${index}`,
      titel: prog.t,
      originaltitel: prog.ot,
      jahr: prog.j ?? film.jahr,
      kinos: prog.k || [],
      termine: prog.z || [],
      programm_ref: prog.film_at_id ?? prog.id ?? prog.t,
      film_ref: film.id,
    })),
    ...(kinoMatches.rest || []).map((prog, index) => ({
      id: `kino:programm:${prog.film_at_id ?? prog.id ?? prog.t}:${(prog.k || []).join("|")}:${index}`,
      titel: prog.t,
      originaltitel: prog.ot,
      jahr: prog.j,
      kinos: prog.k || [],
      termine: prog.z || [],
      programm_ref: prog.film_at_id ?? prog.id ?? prog.t,
    })),
  ], [kinoMatches]);
  const aktiveKinoPins = useMemo(() => {
    if (!progStand) return kinoPins;
    return kinoPins.flatMap((pin) => {
      const treffer = findeKinoPinImKatalog(pin, kinoKatalog);
      if (!treffer) return [];
      return [{
        ...pin,
        programm_ref: treffer.programm_ref ?? treffer.id ?? null,
        ...(treffer.film_ref != null ? { film_ref: treffer.film_ref } : {}),
      }];
    });
  }, [kinoPins, kinoKatalog, progStand]);

  /* Must-Watch: innerhalb eines Wiener Kalendertags stabil, am Tageswechsel
     neu berechnet. Der Timer liest nur die Uhr und löst keinerlei Außenwirkung aus. */
  const mwKandidatenSicher = useMemo(() => mwKandidaten || {}, [mwKandidaten]);
  const [mwTag, setMwTag] = useState(() => viennaCalendarDay());
  useEffect(() => {
    const aktualisieren = () => setMwTag((bisher) => {
      const heute = viennaCalendarDay();
      return heute === bisher ? bisher : heute;
    });
    const timer = window.setInterval(aktualisieren, 30000);
    window.addEventListener("focus", aktualisieren);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", aktualisieren); };
  }, []);
  const mwTop = useMemo(
    () => projectDailyMustwatch({
      entries: mustwatch, candidates: mwKandidatenSicher, selectedServices: auswahl, day: mwTag,
    }),
    [auswahl, mustwatch, mwKandidatenSicher, mwTag],
  );

  /* Pinboard: nächster Termin zuerst (Sortierung auf dem formatierten String). */
  const pins = useMemo(() => aktiveKinoPins
    .map((p) => ({ ...p, zAnzeige: formatiereTermin(p.z) }))
    .sort((a, b) => pinSortWert({ z: a.zAnzeige }) - pinSortWert({ z: b.zAnzeige }))
    .slice(0, 5), [aktiveKinoPins]);

  const serienKatalog = useMemo(() => [
    ...((((streamingEntdecken || {}).titel) || []).map((titel) => ({ ...titel, wochen_bereich: "entdecken" }))),
    ...((((streamingBekannt || {}).titel) || []).map((titel) => ({ ...titel, wochen_bereich: "programm" }))),
  ], [streamingBekannt, streamingEntdecken]);
  const empfehlungsKatalog = useMemo(() => localRecommendationCandidates(streamingEntdecken, {
    streamingKnown: streamingBekannt, selectedServices: [], entdeckenStatus, includeSeenForMatching: true,
  }), [entdeckenStatus, streamingBekannt, streamingEntdecken]);
  const aktuelleEmpfehlungen = useMemo(() => webDiscoveryFeedCards({
    webDiscoveryFeed, catalogCandidates: empfehlungsKatalog,
  }), [empfehlungsKatalog, webDiscoveryFeed]);
  const entdeckenPinAufloesung = useMemo(() => resolveEntdeckenPins(entdeckenPins, {
    recommendations: aktuelleEmpfehlungen,
    streaming: serienKatalog,
    cinema: kinoKatalog.map((entry) => ({ ...entry, type: "film" })),
    recommendationReady: !!webDiscoveryFeed,
    streamingReady: !!streamingEntdecken && !!streamingBekannt,
    cinemaReady: !!progStand,
  }), [aktuelleEmpfehlungen, entdeckenPins, kinoKatalog, progStand, serienKatalog,
    streamingBekannt, streamingEntdecken, webDiscoveryFeed]);
  useEffect(() => {
    if (entdeckenPinAufloesung.discardedPinIds.length) {
      onEntdeckenPinsBereinigen?.(entdeckenPinAufloesung.discardedPinIds);
    }
  }, [entdeckenPinAufloesung.discardedPinIds, onEntdeckenPinsBereinigen]);
  const titelPins = entdeckenPinAufloesung.resolved;
  const zuletzt = useMemo(() => projectRecentPersonalEntries({ master, limit: 5 }), [master]);

  const datum = formatPresentationDate(new Date(), { format: "long" });

  /* Theme-Tokens als CSS-Variablen an die Dashboard-Wurzel (setzeTheme kennt keine
     :root-Vars) — pro Render aus T, damit dunkel/hell/showa/neon-noir korrekt durchschlagen. */
  const themeVars = {
    "--kd-saal": T.saal, "--kd-saalHoch": T.saalHoch, "--kd-leinwand": T.leinwand,
    "--kd-leinwandTief": T.leinwandTief, "--kd-tinte": T.tinte, "--kd-tinteWeich": T.tinteWeich,
    "--kd-rauch": T.rauch, "--kd-wolfram": T.wolfram, "--kd-gefahr": T.gefahr,
  };

  return (
    <section className="kd-dash" style={themeVars}>
      {/* ---- Marquee-Kopf ---- */}
      <header className="kd-dash-hero">
        <span className="kd-dash-bulbs" aria-hidden="true" />
        <div className="kd-dash-datum">{datum} · Wien</div>
        <h1 className="kd-dash-headline">Dein Abend</h1>
        <VertrauensZeile progStand={progStand} streamingBekannt={streamingBekannt}
          programmInfo={programmInfo} streamingInfo={streamingInfo} />
      </header>

      <span className="kd-dash-strip" aria-hidden="true" />

      <div className="kd-dash-grid">
        {/* ---- 1 · Gemeinsames Pinboard: Titelpins und Kinotermine ---- */}
        <Modul name="Pinboard" ziel="streaming" linkLabel="Streaming" onNavigiere={onNavigiere} tour="pinboard">
          {titelPins.length > 0 || pins.length > 0 ? (
            <div className="kd-dash-karte kd-pinboard-radar">
              {titelPins.map((pin) => (
                <button key={`entdecken-${pin.pinId}`} className="kd-dash-zeile kd-pinboard-titel" onClick={() => {
                  if (pin.destination === "streaming") onSpringeZuStreaming?.(pin.target);
                  else if (pin.destination === "kino") onSpringeZuKino?.(pin.target);
                  else onSpringeZuEntdecken?.(pin.target);
                }}>
                  <span className="kd-pinboard-kino-titel">
                    <span className="kd-pinboard-kino-marker" aria-hidden="true">◆</span>
                    <span className="kd-pinboard-kino-name">{pin.title}
                      {pin.year ? <span className="kd-pinboard-kino-jahr"> ({pin.year})</span> : null}
                    </span>
                  </span>
                  <span className="kd-pinboard-kino-meta">{pin.label}</span>
                </button>
              ))}
              {pins.map((p) => (
                <button key={`kino-${p.t}|${p.z}`} className="kd-dash-zeile kd-pinboard-kino" onClick={() => {
                  if (p.programm_ref != null) onSpringeZuKino?.({ ...p, titel: p.t });
                  else onNavigiere?.("kino");
                }}>
                  <span className="kd-pinboard-kino-titel">
                    <span className="kd-pinboard-kino-marker" aria-hidden="true">◇</span>
                    <span className="kd-pinboard-kino-name">
                      {p.t}
                      {p.j && !String(p.t).includes(String(p.j)) ? <span className="kd-pinboard-kino-jahr"> ({p.j})</span> : null}
                    </span>
                  </span>
                  <span className="kd-pinboard-kino-meta">{p.zAnzeige}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="kd-dash-leer">Noch leer. Titel pinnst du in Entdecken mit dem Pin-Symbol; Kinotermine mit ◇.</p>
          )}
        </Modul>

        {/* ---- 2 · Deine Woche: heute plus sechs Folgetage und Kinovorschläge ---- */}
        <Wochenplan
          plan={wochenplan} onPlanAendern={onWochenplanAendern}
          kinoPins={aktiveKinoPins} kinoVorschlaege={kinoVorschlaege} kinoKatalog={kinoKatalog}
          onKinoPinLoeschen={(pin) => toggleKinoPin?.(pin.t, pin.j, pin.z)}
          katalog={serienKatalog} master={master}
          onStreamingKatalogLaden={onStreamingKatalogLaden}
          onSpringeZuFilm={zeigeEintrag} onSpringeZuStreaming={onSpringeZuStreaming}
          onKinoVorschlagAnsehen={(eintrag) => {
            if (onSpringeZuKino) onSpringeZuKino(eintrag);
            else onNavigiere?.("kino");
          }}
          onFilmAnlegen={onFilmAnlegen}
        />

        {/* ---- 3 · Must-Watch (Klick pro Zeile -> Must-Watch-Eintrag) ---- */}
        <Modul name="Must-Watch" ziel="mediathek" linkLabel="Mediathek" onNavigiere={onNavigiere}>
          {mwTop.length > 0 ? (
            <div className="kd-dash-karte">
              {mwTop.map(({ entry: e, reasons }, i) => (
                  <button type="button" key={e.id} className="kd-dash-zeile" onClick={() => zuEintrag(e.id, "mediathek")}>
                    <span className="kd-dash-rang">{i + 1}</span>
                    <span className="kd-dash-ztitel">{e.titel}{e.jahr ? " (" + e.jahr + ")" : ""}</span>
                    {reasons.streaming.map((dienst) => <span key={dienst} className="kd-dash-badge kd-dash-badge--neu">{dienst}</span>)}
                    {reasons.cinema && <span className="kd-dash-badge kd-dash-badge--neu">IM KINO</span>}
                    {reasons.owned && <span className="kd-dash-badge">IM BESITZ</span>}
                  </button>
              ))}
            </div>
          ) : <p className="kd-dash-leer">Gerade ist kein Must-Watch-Titel bei deinen gewählten Diensten, im Kino oder im Besitz.</p>}
        </Modul>

        {/* ---- 4 · Zuletzt hinzugefügt: nur rollierend markierte Neuanlagen ---- */}
        <Modul name="Zuletzt hinzugefügt" ziel="mediathek" linkLabel="Mediathek" onNavigiere={onNavigiere}>
          {zuletzt.length > 0 ? (
            <div className="kd-dash-karte">
              {zuletzt.map((z) => (
                <button type="button" key={z.key} className="kd-dash-zeile kd-dash-log" onClick={() => zuEintrag(z.ref, "mediathek")}>
                  <span className="kd-dash-ztitel">{z.label}</span>
                  <span className="kd-dash-badge" aria-label={`Ticker ${z.ticker}`}>{z.ticker}</span>
                </button>
              ))}
            </div>
          ) : <p className="kd-dash-leer">Die nächsten neu angelegten Mediathek-Einträge erscheinen hier.</p>}
        </Modul>
      </div>
      <footer className="kd-start-service">
        <button onClick={(event) => { event.currentTarget.focus(); onHilfe(); }}>? Anleitung &amp; Hilfe</button>
      </footer>
    </section>
  );
}

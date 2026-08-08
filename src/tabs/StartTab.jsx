import { useMemo } from "react";
import { T } from "../lib/tokens.js";
import { useSyncStatus } from "../components/SyncStatusChip.jsx";
import { formatiereTermin } from "../lib/programm.js";
import { useInstallationsStatus } from "../lib/installation.js";
import { Wochenplan } from "../components/Wochenplan.jsx";
import { beobachteteSerien, neueStaffeln } from "../lib/staffeln.js";
import { findeKinoPinImKatalog, folgenstandText } from "../lib/wochenplan.js";
import { mustwatchVerfuegbarkeit, sortiereMustwatch } from "../lib/mustwatch.js";

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
   · Pinboard & Radar: kinoPins + ausdrücklich beobachtete Serien; Updates zuerst
   · Deine Woche:      persönliche Reminder + Kinopins + passende Kinovorschläge,
                       rollierende sieben Tage
   · Must-Watch:       mustwatch (oberste 5 = Listenreihenfolge)
   · Zuletzt hinzugefügt: NUR belegbare Zeitstempel — Must-Watch erstellt_am +
     Merkliste hinzugefuegt_am. Master-Einträge bewusst NICHT dabei: die Liste
     trägt kein Datum, und ihre Array-Ordnung ist nach einem Voll-Import
     (importMaster/Restore ersetzt die Liste in Datei-Reihenfolge) nicht
     nachweislich chronologisch. Kein neues Datenfeld, kein neuer Topf. */

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
  const fmt = (ms) => {
    const d = new Date(ms);
    const z = (n) => String(n).padStart(2, "0");
    return z(d.getDate()) + "." + z(d.getMonth() + 1) + ". " + z(d.getHours()) + ":" + z(d.getMinutes());
  };
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
  kinoPins = [], merkliste = [], onNavigiere, zeigeEintrag,
  kinoMatches = { matched: [] }, mustwatch = [], mwKandidaten = null,
  streamingEntdecken = null, streamingBekannt = null, progStand = null,
  programmInfo = null, streamingInfo = null, onHilfe,
  wochenplan, onWochenplanAendern, entdeckenStatus = {}, onEntdeckenStatusAendern,
  master = [], onSpringeZuStreaming, onSpringeZuKino, onFilmAnlegen, toggleKinoPin,
  onStreamingKatalogLaden,
}) {
  const installation = useInstallationsStatus();
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

  /* Must-Watch: dieselbe reine Projektion wie die Vollansicht (aktuell
     verfügbar, dann zuletzt gemerkt, dann Titel), danach auf fünf gekürzt. */
  const mwKandidatenSicher = useMemo(() => mwKandidaten || {}, [mwKandidaten]);
  const mwTop = useMemo(
    () => sortiereMustwatch(mustwatch, mwKandidatenSicher).slice(0, 5),
    [mustwatch, mwKandidatenSicher],
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
  const serienRadar = useMemo(() => neueStaffeln(serienKatalog, entdeckenStatus), [serienKatalog, entdeckenStatus]);
  const serienRadarMap = useMemo(() => new Map(serienRadar.map((hinweis) => [String(hinweis.watchmode_id), hinweis])), [serienRadar]);
  const serienPins = useMemo(() => beobachteteSerien(entdeckenStatus, serienKatalog)
    .map((serie) => ({ ...serie, radar: serienRadarMap.get(String(serie.watchmode_id)) || null }))
    .sort((a, b) => Number(!!b.radar) - Number(!!a.radar) || String(a.titel).localeCompare(String(b.titel), "de")),
  [entdeckenStatus, serienKatalog, serienRadarMap]);

  /* Zuletzt hinzugefügt: nur belegbare Zeitstempel; ref = Sprung-Ziel (Must-Watch-ID). */
  const zuletzt = useMemo(() => {
    const mw = (mustwatch || []).filter((e) => e.erstellt_am).map((e) => ({
      key: "mw" + e.id, label: e.titel, quelle: "MUST-WATCH", ziel: "mediathek", ref: e.id, zeit: Date.parse(e.erstellt_am) || 0,
    }));
    const mk = (merkliste || []).filter((m) => m.hinzugefuegt_am).map((m) => ({
      key: "merk" + m.watchmode_id, label: m.titel + (m.jahr ? " (" + m.jahr + ")" : ""), quelle: "MERKLISTE", ziel: "streaming", ref: null, zeit: Date.parse(m.hinzugefuegt_am) || 0,
    }));
    return [...mw, ...mk].sort((a, b) => b.zeit - a.zeit).slice(0, 5);
  }, [mustwatch, merkliste]);

  const datum = new Date().toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" });
  const fmtTag = (ms) => { const d = new Date(ms); const z = (n) => String(n).padStart(2, "0"); return z(d.getDate()) + "." + z(d.getMonth() + 1) + "."; };

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
        {/* ---- 1 · Gemeinsames Pinboard: Serien-Updates vor Kinoterminen ---- */}
        <Modul name="Pinboard & Serienradar" ziel="streaming" linkLabel="Streaming" onNavigiere={onNavigiere} tour="pinboard">
          {serienPins.length > 0 || pins.length > 0 ? (
            <div className="kd-dash-karte kd-pinboard-radar">
              {serienPins.map((serie) => {
                const hinweis = serie.radar;
                const kommendeStaffel = !hinweis && serie.naechste_staffel_am && new Date(serie.naechste_staffel_am).getTime() >= Date.now();
                const status = hinweis?.staffel_neu ? `Neue Staffel ${hinweis.staffel_verfuegbar}`
                  : hinweis?.folgen_neu ? `Neue Folge${hinweis.folge_aktuell ? ` ${hinweis.folge_aktuell}` : ""}`
                    : kommendeStaffel ? `Staffel ab ${new Date(serie.naechste_staffel_am).toLocaleDateString("de-AT")}`
                      : "Beobachtet";
                return (
                  <div key={`serie-${serie.watchmode_id}`} className={`kd-dash-zeile kd-pinboard-serie${hinweis ? " ist-neu" : ""}`}>
                    <button className="kd-pinboard-ziel" onClick={() => onSpringeZuStreaming?.({ art: "entdecken", ref: serie.watchmode_id, titel: serie.titel })}>
                      <span className="kd-dash-ztitel">⚑ {serie.titel}</span>
                      {folgenstandText(serie) && <span className="kd-pinboard-meta">{folgenstandText(serie)}</span>}
                    </button>
                    <span className={`kd-dash-badge${hinweis ? " kd-dash-badge--neu" : ""}`}>{status}</span>
                    {hinweis && <button className="kd-pinboard-bestaetigen" onClick={() => onEntdeckenStatusAendern?.(serie.watchmode_id, hinweis)}>Stand bestätigen</button>}
                  </div>
                );
              })}
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
            <p className="kd-dash-leer">Noch leer. Kinotermine pinnst du mit ◇; Serien setzt du im ausgeklappten Streaming-Eintrag auf ⚑ Beobachten.</p>
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
              {mwTop.map((e, i) => {
                /* Derselbe abgeleitete Status wie in der Vollansicht — ohne
                   geladenen Katalog bleibt die Zeile bewusst ohne Aussage. */
                const status = mustwatchVerfuegbarkeit(e, mwKandidatenSicher);
                return (
                  <div key={e.id} className="kd-dash-zeile" onClick={() => zuEintrag(e.id, "mediathek")}>
                    <span className="kd-dash-rang">{i + 1}</span>
                    <span className="kd-dash-ztitel">{e.titel}{e.jahr ? " (" + e.jahr + ")" : ""}</span>
                    {status && <span className={"kd-dash-badge" + (status.aktuell ? " kd-dash-badge--neu" : "")}>{status.label}</span>}
                    {e.im_besitz && <span className="kd-dash-badge">IM BESITZ</span>}
                  </div>
                );
              })}
            </div>
          ) : <p className="kd-dash-leer">Noch kein Titel auf deiner Must-Watch-Liste.</p>}
        </Modul>

        {/* ---- 4 · Zuletzt hinzugefügt (Must-Watch-Zeilen -> Eintrag, Merkliste -> Bereich) ---- */}
        <Modul name="Zuletzt hinzugefügt" ziel="mediathek" linkLabel="Mediathek" onNavigiere={onNavigiere}>
          {zuletzt.length > 0 ? (
            <div className="kd-dash-karte">
              {zuletzt.map((z) => (
                <div key={z.key} className="kd-dash-zeile kd-dash-log" onClick={() => zuEintrag(z.ref, z.ziel)}>
                  <span className="kd-dash-ztitel">{z.label}</span>
                  <span className="kd-dash-tag">{fmtTag(z.zeit)}</span>
                  <span className="kd-dash-badge">{z.quelle}</span>
                </div>
              ))}
            </div>
          ) : <p className="kd-dash-leer">Neue Must-Watch- und Merkliste-Einträge erscheinen hier.</p>}
        </Modul>
      </div>
      <footer className="kd-start-service">
        <button onClick={onHilfe}>? Anleitung &amp; Hilfe</button>
        {!installation.datei && !installation.standalone && <a href={import.meta.env.BASE_URL + "download/"}>App installieren &amp; Einzeldatei</a>}
      </footer>
    </section>
  );
}

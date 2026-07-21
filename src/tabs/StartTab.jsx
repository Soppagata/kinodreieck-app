import { useMemo, useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { IconDelete } from "../components/ui.jsx";
import { PERSONAL_MODE } from "../lib/modus.js";
import { useSyncStatus } from "../components/SyncStatusChip.jsx";
import { ErklaerHero, DreieckErklaerung, DokuAnsicht } from "../components/Erklaerstuecke.jsx";
import { sichtbareDienste } from "../lib/dienste.js";
import { score } from "../lib/match.js";
import { formatiereTermin } from "../lib/programm.js";

/* ================= START =================
   Etappe 4 (Verzweigung, Max 18.07.2026):
   · PERSONAL_MODE=true  -> Start-Dashboard (Schablone start_dashboard_schablone.html):
     Vertrauens-Zeile · Kino für dich · Must-Watch · Jetzt streambar · Pinboard ·
     Zuletzt hinzugefügt. Alle Module deterministisch aus vorhandenem App-State,
     leere Module verschwinden, jede Karte verlinkt in ihren Bereich.
     Erklärinhalte (Hero, Dreieck, Anleitung) leben jetzt hinter dem „Über"-
     Einstieg in den Einstellungen (Erklaerstuecke.jsx).
   · PERSONAL_MODE=false -> die HEUTIGE Landing, unverändert (Beta-Kulisse).
   Reine Anzeige-Schicht — alle Daten kommen als Props aus dem App-State. */

export function StartTab(props) {
  return PERSONAL_MODE ? <StartDashboard {...props} /> : <StartLanding {...props} />;
}

/* Pin-Sortierung (nächster Termin zuerst) — unverändert aus der Landing,
   gehoisted, damit Landing UND Dashboard sie teilen. */
const pinSortWert = (p) => {
  const d = /(\d{1,2})\.(\d{1,2})\./.exec(String(p.z));
  const u = /(\d{1,2}):(\d{2})/.exec(String(p.z));
  return (d ? Number(d[2]) * 1000000 + Number(d[1]) * 10000 : 99999999) + (u ? Number(u[1]) * 100 + Number(u[2]) : 0);
};

/* ==================== LANDING (Beta, PERSONAL_MODE=false) ====================
   Rendert zu 100 % die bisherige Startseite: Hero + Dreieck-Erklärung
   (ausgelagert nach Erklaerstuecke.jsx, Inhalt identisch), Pinboard,
   Quicklinks, Anleitung. */
function StartLanding({ kinoPins = [], toggleKinoPin, merkliste = [], toggleMerk, onNavigiere, onTutorialNeu }) {
  const [dokuOffen, setDokuOffen] = useState(false);
  /* Merkliste kommt jetzt als Prop (in App-State geliftet) — live synchron mit dem Streaming-Tab. */
  const pins = [...kinoPins].sort((a, b) => pinSortWert(a) - pinSortWert(b));

  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 10px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ---- Hero + Dreieck-Erklärstück (Erklaerstuecke.jsx, Inhalt unverändert) ---- */}
      <ErklaerHero />
      <DreieckErklaerung />

      {/* ---- Pinboard ---- */}
      <div data-tour="pinboard">
        <h2 style={h2}>Pinboard</h2>
        {pins.length === 0 && merkliste.length === 0 && (
          <p style={{ fontSize: 13, color: T.rauch, margin: 0, lineHeight: 1.6 }}>
            Noch leer. Termine pinnst du im Kino-Tab (◇ vor der Uhrzeit),
            Filme und Serien merkst du dir im Entdecken-Bereich (★).
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {pins.length > 0 && (
            <div style={{ background: T.saalHoch, borderRadius: 6, padding: "12px 14px", borderLeft: "3px solid " + T.wolfram }}>
              <div style={{ ...mono, textTransform: "uppercase", letterSpacing: "0.06em", color: T.wolfram, marginBottom: 6 }}>Kinotermine ({pins.length})</div>
              {pins.map((p) => (
                <div key={p.t + "|" + p.z} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, padding: "3px 0" }}>
                  <span onClick={() => onNavigiere && onNavigiere("kino")} title="Zum Kino-Programm"
                    style={{ color: T.leinwand, fontWeight: 700, cursor: "pointer" }}>{p.t}</span>
                  <span style={{ flex: 1 }}>{p.z}</span>
                  {toggleKinoPin && (
                    <button onClick={() => toggleKinoPin(p.t, p.j, p.z)} title="Pin lösen" className="kd-del"
                      style={{ background: "none", border: "none", color: T.gefahr, cursor: "pointer", fontSize: 13 }}><IconDelete size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
          {merkliste.length > 0 && (
            <div style={{ background: T.saalHoch, borderRadius: 6, padding: "12px 14px", borderLeft: "3px solid " + T.rauch }}>
              <div style={{ ...mono, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Gemerkt im Entdecken ({merkliste.length})</div>
              {merkliste.map((m) => (
                <div key={m.watchmode_id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, padding: "3px 0" }}>
                  <span onClick={() => onNavigiere && onNavigiere("streaming")} title="Zum Entdecken-Bereich"
                    style={{ color: T.leinwand, flex: 1, cursor: "pointer" }}>★ {m.titel}{m.jahr ? " (" + m.jahr + ")" : ""}</span>
                  <button onClick={() => toggleMerk(m)} title="Von der Merkliste nehmen" className="kd-del"
                    style={{ background: "none", border: "none", color: T.gefahr, cursor: "pointer", fontSize: 13 }}><IconDelete size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- Quicklinks ---- */}
      <div>
        <h2 style={h2}>Direkt hinein</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            ["kino", "Kino", "Wiener Programm mit Abo-Wahrheit, Pins und deinen Treffern"],
            ["mediathek", "Mediathek", "Bestand, Bewertungen, Besitz und Must-Watch"],
            ["streaming", "Streaming", "Was läuft auf deinen Diensten? Plus Entdecken"],
            ["blog", "Blog", "Artikel schreiben, Filme verlinken, freigeben"],
            ["finder", "Suche", "»Traurige Komödie auf Netflix« — frag einfach"],
            ["daten", "Einstellungen", "Darstellung, Import/Export, Backup, Vokabular"],
          ].map(([id, label, be]) => (
            <button key={id} onClick={() => onNavigiere && onNavigiere(id)}
              style={{ background: T.saalHoch, border: "1px solid transparent", borderRadius: 6, padding: "12px 14px", cursor: "pointer", textAlign: "left", color: T.leinwand }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: T.wolfram }}>{label}</div>
              <div style={{ fontSize: 12, color: T.rauch, marginTop: 3, lineHeight: 1.5 }}>{be}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ---- Doku ---- */}
      <div>
        <button style={btnStyle(false)} onClick={() => setDokuOffen(!dokuOffen)}>
          {dokuOffen ? "Anleitung zuklappen" : "Anleitung & Hilfe öffnen"}
        </button>
        {dokuOffen && <DokuAnsicht h2={h2} mono={mono} onTutorialNeu={onTutorialNeu} />}
      </div>
    </section>
  );
}

/* ==================== DASHBOARD (PERSONAL_MODE=true) ====================
   Modul-Reihenfolge und -Zuschnitt: Entscheidung Max 18.07.2026.
   Datenquellen (alles vorhandener App-State, keine neuen Fetches, kein LLM):
   · Vertrauens-Zeile: useSyncStatus (Muster SyncStatusChip) + progStand + streamingBekannt
   · Kino für dich:    kinoMatches.matched (bereits Besitz-Rang -> Dreieck-Score sortiert)
   · Must-Watch:       mustwatch (oberste 5 = Listenreihenfolge)
   · Jetzt streambar:  merkliste ∩ angehakte Abos (Dienste je watchmode_id aus streamingEntdecken)
   · Pinboard:         kinoPins (nächster Termin zuerst)
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
   KEIN Sync-Segment. Klasse .kd-vertrauen ist Test-Kanarie (personalmodus_test B/G). */
function VertrauensZeile({ progStand, streamingBekannt }) {
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
  if (!sync && !progStand && katalog == null) return null;
  return (
    <div className="kd-vertrauen">
      {sync && (
        <span className="kd-vertrauen-seg" title="Geräte-Sync" style={{ color: sync.farbe }}>
          <span className="kd-vertrauen-dot" style={{ background: sync.farbe }} />{sync.text}
        </span>
      )}
      {progStand ? <span className="kd-vertrauen-seg">Programm: {fmt(progStand)}</span> : null}
      {katalog != null && <span className="kd-vertrauen-seg">Katalog: {katalog} Titel</span>}
    </div>
  );
}

function StartDashboard({
  kinoPins = [], merkliste = [], onNavigiere, zeigeEintrag,
  kinoMatches = { matched: [] }, mustwatch = [], auswahl = [],
  streamingEntdecken = null, streamingBekannt = null, progStand = null,
}) {
  /* Klick auf einen Titel springt zum konkreten Eintrag (springeZuFilm fokussiert den
     Mediathek-/Must-Watch-Eintrag), nicht bloß in den Bereich. Fallback: Tab wechseln. */
  const zuEintrag = (id, fallbackTab) => { if (id && zeigeEintrag) zeigeEintrag(id); else if (onNavigiere) onNavigiere(fallbackTab); };

  /* Kino für dich: Top 3 der (vor-)sortierten Treffer, nur mit nächstem Termin. */
  const kinoTop = useMemo(() => (kinoMatches.matched || [])
    .map((m) => ({ ...m, termin: naechsterTermin((m.prog.z || []).map(formatiereTermin)) }))
    .filter((m) => m.termin)
    .slice(0, 3), [kinoMatches]);

  /* Must-Watch: oberste 5 in Listenreihenfolge. */
  const mwTop = (mustwatch || []).slice(0, 5);

  /* Jetzt streambar: Merkliste ∩ angehakte Abos (leere Auswahl = alles zählt). */
  const streambar = useMemo(() => {
    const map = new Map((((streamingEntdecken || {}).titel) || []).map((t) => [t.watchmode_id, t]));
    return (merkliste || []).map((m) => {
      const t = map.get(m.watchmode_id);
      const dienste = t ? sichtbareDienste(t.dienste, auswahl) : [];
      return dienste.length ? { ...m, dienst: dienste[0] } : null;
    }).filter(Boolean).slice(0, 5);
  }, [merkliste, streamingEntdecken, auswahl]);

  /* Pinboard: nächster Termin zuerst (Sortierung auf dem formatierten String). */
  const pins = useMemo(() => kinoPins
    .map((p) => ({ ...p, zAnzeige: formatiereTermin(p.z) }))
    .sort((a, b) => pinSortWert({ z: a.zAnzeige }) - pinSortWert({ z: b.zAnzeige }))
    .slice(0, 5), [kinoPins]);

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

  const leer = !kinoTop.length && !mwTop.length && !streambar.length && !pins.length && !zuletzt.length;
  const datum = new Date().toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" });
  const fmtTag = (ms) => { const d = new Date(ms); const z = (n) => String(n).padStart(2, "0"); return z(d.getDate()) + "." + z(d.getMonth() + 1) + "."; };

  /* Theme-Tokens als CSS-Variablen an die Dashboard-Wurzel (setzeTheme kennt keine
     :root-Vars) — pro Render aus T, damit dunkel/hell/showa/nerv korrekt durchschlagen. */
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
        <VertrauensZeile progStand={progStand} streamingBekannt={streamingBekannt} />
      </header>

      <span className="kd-dash-strip" aria-hidden="true" />

      {leer && (
        <p className="kd-dash-leer">
          Noch leer. Kino-Treffer, Must-Watch, Merkliste und angepinnte Termine
          erscheinen hier, sobald es sie gibt — Termine pinnst du im Kino-Tab
          (◇ vor der Uhrzeit), gemerkt wird im Entdecken-Bereich (★).
        </p>
      )}

      <div className="kd-dash-grid">
        {/* ---- 1 · Kino für dich (Ticket-Stub, Klick -> Film-Eintrag) ---- */}
        {kinoTop.length > 0 && (
          <Modul name="Kino für dich" ziel="kino" linkLabel="Kino" onNavigiere={onNavigiere}>
            {kinoTop.map(({ prog, film, termin }, i) => (
              <div key={(prog.film_at_id || prog.t) + "|" + i} className="kd-dash-ticket" onClick={() => zuEintrag(film.id, "kino")}>
                <div className="kd-dash-stub">
                  <b className="kd-dash-stamp">{score(film)}</b>
                  <span className="kd-dash-stamp-lbl">MATCH</span>
                </div>
                <div className="kd-dash-tbody">
                  <div className="kd-dash-film">{film.titel}</div>
                  <div className="kd-dash-meta">{[film.jahr, (prog.k || [])[0]].filter(Boolean).join(" · ")}</div>
                  <div className="kd-dash-showtime">◷ {termin.label}</div>
                </div>
              </div>
            ))}
          </Modul>
        )}

        {/* ---- 2 · Must-Watch (Klick pro Zeile -> Must-Watch-Eintrag) ---- */}
        {mwTop.length > 0 && (
          <Modul name="Must-Watch" ziel="mediathek" linkLabel="Mediathek" onNavigiere={onNavigiere}>
            <div className="kd-dash-karte">
              {mwTop.map((e, i) => (
                <div key={e.id} className="kd-dash-zeile" onClick={() => zuEintrag(e.id, "mediathek")}>
                  <span className="kd-dash-rang">{i + 1}</span>
                  <span className="kd-dash-ztitel">{e.titel}</span>
                  {e.im_besitz && <span className="kd-dash-badge">IM BESITZ</span>}
                </div>
              ))}
            </div>
          </Modul>
        )}

        {/* ---- 3 · Jetzt streambar (Streaming-Entdecken hat keinen Einzel-Fokus -> Bereich) ---- */}
        {streambar.length > 0 && (
          <Modul name="Jetzt streambar" ziel="streaming" linkLabel="Streaming" onNavigiere={onNavigiere}>
            <div className="kd-dash-karte" onClick={() => onNavigiere && onNavigiere("streaming")}>
              {streambar.map((m) => (
                <div key={m.watchmode_id} className="kd-dash-zeile">
                  <span className="kd-dash-ztitel">{m.titel}{m.jahr ? " (" + m.jahr + ")" : ""}</span>
                  <span className="kd-dash-jetzt">▶ {String(m.dienst).toUpperCase()}</span>
                </div>
              ))}
            </div>
          </Modul>
        )}

        {/* ---- 4 · Pinboard — stabiles Modul: immer sichtbar, leer -> Hinweis (Max 2026-07-19) ---- */}
        {!leer && (
          <Modul name="Pinboard" ziel="kino" linkLabel="Kino" onNavigiere={onNavigiere} tour="pinboard">
            {pins.length > 0 ? (
              <div className="kd-dash-karte" onClick={() => onNavigiere && onNavigiere("kino")}>
                {pins.map((p) => (
                  <div key={p.t + "|" + p.z} className="kd-dash-zeile">
                    <span className="kd-dash-ztitel">◇ {p.t}</span>
                    <span className="kd-dash-showtime">{p.zAnzeige}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="kd-dash-leer">Noch nichts gepinnt — Termine pinnst du im Kino-Tab (◇ vor der Uhrzeit).</p>
            )}
          </Modul>
        )}

        {/* ---- 5 · Zuletzt hinzugefügt (Must-Watch-Zeilen -> Eintrag, Merkliste -> Bereich) ---- */}
        {zuletzt.length > 0 && (
          <Modul name="Zuletzt hinzugefügt" ziel="mediathek" linkLabel="Mediathek" onNavigiere={onNavigiere}>
            <div className="kd-dash-karte">
              {zuletzt.map((z) => (
                <div key={z.key} className="kd-dash-zeile kd-dash-log" onClick={() => zuEintrag(z.ref, z.ziel)}>
                  <span className="kd-dash-ztitel">{z.label}</span>
                  <span className="kd-dash-tag">{fmtTag(z.zeit)}</span>
                  <span className="kd-dash-badge">{z.quelle}</span>
                </div>
              ))}
            </div>
          </Modul>
        )}
      </div>
    </section>
  );
}

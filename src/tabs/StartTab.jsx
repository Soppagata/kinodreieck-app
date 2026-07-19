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
            ["mediathek", "Mediathek", "Bestand, Bewertungen, Nachtrag — und Daten & Teilen"],
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

/* Karten-/Modul-Stile nach start_dashboard_schablone.html (helle Karte auf
   Saal-Grund; theme-reaktiv, daher Funktionen statt Konstanten). */
const monoStil = () => ({ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch });
const karteStil = () => ({ background: T.leinwand, color: T.tinte, borderRadius: 6, padding: "12px 14px", boxShadow: "0 2px 10px rgba(0,0,0,0.45)", cursor: "pointer" });
const titelStil = (px = 20) => ({ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: px, lineHeight: 1.1, textTransform: "uppercase", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
const metaStil = () => ({ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.rauch, marginTop: 3 });
const zeileStil = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };
const terminStil = () => ({ fontFamily: "'Space Mono', monospace", fontSize: 11, whiteSpace: "nowrap", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", color: T.tinte, background: "rgba(227,166,59,0.28)", border: "1px solid " + T.wolfram, borderRadius: 3, padding: "3px 7px" });
const badgeStil = (an) => ({ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.08em", borderRadius: 3, padding: "2px 6px", whiteSpace: "nowrap", border: "1px solid " + (an ? T.wolfram : T.rauch), color: an ? T.tinte : T.rauch, background: an ? "rgba(227,166,59,0.28)" : "transparent" });

function Modul({ name, ziel, linkLabel, onNavigiere, tour, children }) {
  return (
    <div data-tour={tour}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <span style={{ ...monoStil(), letterSpacing: "0.14em", textTransform: "uppercase" }}>{name}</span>
        <button onClick={() => onNavigiere && onNavigiere(ziel)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram }}>
          → {linkLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

/* Vertrauens-Zeile (FIX): Programm-Stand, Katalog-Stand, Sync-Status.
   Einziger Sync-Ort seit Etappe 4 — der Übergangs-Punkt am Griff (NavBand)
   ist entfernt. Entscheidungs-Log: kein Zeitfenster ohne sichtbaren Sync-Status.
   Sync-Semantik (wie SyncStatusChip.ableiten): OHNE Git-Konfiguration bewusst
   KEIN Sync-Segment — „nicht verbunden" wäre Dauer-Rauschen ohne Handlung.
   Sobald Sync konfiguriert ist, erscheint immer genau einer der vier Zustände
   synchron / ausstehend n / nicht aktuell / Konflikt (useSyncStatus, 3s-Poll). */
function VertrauensZeile({ progStand, streamingBekannt }) {
  const s = useSyncStatus();
  const sync = !s || !s.configured ? null
    : (s.conflict && s.conflict.length) ? { farbe: T.gefahr, text: "Konflikt" }
    : (s.pending && s.pending.length) ? { farbe: T.wolfram, text: "ausstehend " + s.pending.length }
    : (s.stale && s.stale.length) ? { farbe: T.wolfram, text: "nicht aktuell" }
    : { farbe: "#6fce8f", text: "synchron" };
  const fmt = (ms) => {
    const d = new Date(ms);
    const z = (n) => String(n).padStart(2, "0");
    return z(d.getDate()) + "." + z(d.getMonth() + 1) + ". " + z(d.getHours()) + ":" + z(d.getMinutes());
  };
  const katalog = streamingBekannt && streamingBekannt.stand ? (streamingBekannt.titel || []).length : null;
  if (!sync && !progStand && katalog == null) return null;
  return (
    <div className="kd-vertrauen" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", ...monoStil() }}>
      {sync && (
        <span title="Geräte-Sync" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: sync.farbe }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: sync.farbe, display: "inline-block" }} />{sync.text}
        </span>
      )}
      {progStand ? <span>Programm: {fmt(progStand)}</span> : null}
      {katalog != null && <span>Katalog: {katalog} Titel</span>}
    </div>
  );
}

function StartDashboard({
  kinoPins = [], merkliste = [], onNavigiere,
  kinoMatches = { matched: [] }, mustwatch = [], auswahl = [],
  streamingEntdecken = null, streamingBekannt = null, progStand = null,
}) {
  /* Kino für dich: Top 3 der (vor-)sortierten Treffer, nur mit nächstem Termin.
     Termin-Strings laufen durch formatiereTermin (gemeinsamer Helper, auch
     Pinboard) — ISO-Rohzeiten werden lesbar, Anzeige-Strings bleiben wie sie sind. */
  const kinoTop = useMemo(() => (kinoMatches.matched || [])
    .map((m) => ({ ...m, termin: naechsterTermin((m.prog.z || []).map(formatiereTermin)) }))
    .filter((m) => m.termin)
    .slice(0, 3), [kinoMatches]);

  /* Must-Watch: oberste 5 in Listenreihenfolge. */
  const mwTop = (mustwatch || []).slice(0, 5);

  /* Jetzt streambar: Merkliste ∩ angehakte Abos (Konvention wie dienstOk /
     sichtbareDienste: leere Auswahl = alles zählt). */
  const streambar = useMemo(() => {
    const map = new Map((((streamingEntdecken || {}).titel) || []).map((t) => [t.watchmode_id, t]));
    return (merkliste || []).map((m) => {
      const t = map.get(m.watchmode_id);
      const dienste = t ? sichtbareDienste(t.dienste, auswahl) : [];
      return dienste.length ? { ...m, dienst: dienste[0] } : null;
    }).filter(Boolean).slice(0, 5);
  }, [merkliste, streamingEntdecken, auswahl]);

  /* Pinboard: nächster Termin zuerst — Termin über denselben Helper formatiert
     wie im Kino-für-dich-Modul (Sortierung auf dem formatierten String, damit
     auch ISO-Pins richtig einsortiert werden). */
  const pins = useMemo(() => kinoPins
    .map((p) => ({ ...p, zAnzeige: formatiereTermin(p.z) }))
    .sort((a, b) => pinSortWert({ z: a.zAnzeige }) - pinSortWert({ z: b.zAnzeige }))
    .slice(0, 5), [kinoPins]);

  /* Zuletzt hinzugefügt: nur belegbare Zeitstempel (siehe Kopfkommentar). */
  const zuletzt = useMemo(() => {
    const mw = (mustwatch || []).filter((e) => e.erstellt_am).map((e) => ({
      key: "mw" + e.id, label: e.titel, quelle: "MUST-WATCH", ziel: "mediathek", zeit: Date.parse(e.erstellt_am) || 0,
    }));
    const mk = (merkliste || []).filter((m) => m.hinzugefuegt_am).map((m) => ({
      key: "merk" + m.watchmode_id, label: m.titel + (m.jahr ? " (" + m.jahr + ")" : ""), quelle: "MERKLISTE", ziel: "streaming", zeit: Date.parse(m.hinzugefuegt_am) || 0,
    }));
    return [...mw, ...mk].sort((a, b) => b.zeit - a.zeit).slice(0, 5);
  }, [mustwatch, merkliste]);

  const mono = monoStil();
  const leer = !kinoTop.length && !mwTop.length && !streambar.length && !pins.length && !zuletzt.length;
  const datum = new Date().toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" });
  const fmtTag = (ms) => { const d = new Date(ms); const z = (n) => String(n).padStart(2, "0"); return z(d.getDate()) + "." + z(d.getMonth() + 1) + "."; };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ---- Kopf ---- */}
      <div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>Start</div>
        <div style={{ ...mono, marginTop: 4, textTransform: "uppercase" }}>{datum} · Dein Abend</div>
      </div>

      {/* ---- Vertrauens-Zeile (FIX, schmal) ---- */}
      <VertrauensZeile progStand={progStand} streamingBekannt={streamingBekannt} />

      {leer && (
        <p style={{ fontSize: 13, color: T.rauch, margin: 0, lineHeight: 1.6 }}>
          Noch leer. Kino-Treffer, Must-Watch, Merkliste und angepinnte Termine
          erscheinen hier, sobald es sie gibt — Termine pinnst du im Kino-Tab
          (◇ vor der Uhrzeit), gemerkt wird im Entdecken-Bereich (★).
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px 18px" }}>
        {/* ---- 1 · Kino für dich ---- */}
        {kinoTop.length > 0 && (
          <Modul name="Kino für dich" ziel="kino" linkLabel="Kino" onNavigiere={onNavigiere}>
            {kinoTop.map(({ prog, film, termin }, i) => (
              <div key={(prog.film_at_id || prog.t) + "|" + i} onClick={() => onNavigiere && onNavigiere("kino")}
                style={{ ...karteStil(), marginTop: i ? 8 : 0 }}>
                <div style={zeileStil}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={titelStil()}>{film.titel}</div>
                    <div style={metaStil()}>{[film.jahr, (prog.k || [])[0]].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.rauch, textAlign: "right", whiteSpace: "nowrap" }}>
                    <b style={{ display: "block", fontSize: 15, color: T.tinte }}>{score(film)}</b>MATCH
                  </div>
                </div>
                <div style={{ ...zeileStil, marginTop: 8 }}>
                  <span style={metaStil()}>{prog.f || ""}</span>
                  <span style={terminStil()}>{termin.label}</span>
                </div>
              </div>
            ))}
          </Modul>
        )}

        {/* ---- 2 · Must-Watch ---- */}
        {mwTop.length > 0 && (
          <Modul name="Must-Watch" ziel="mediathek" linkLabel="Mediathek" onNavigiere={onNavigiere}>
            <div style={karteStil()} onClick={() => onNavigiere && onNavigiere("mediathek")}>
              {mwTop.map((e, i) => (
                <div key={e.id} style={{ ...zeileStil, marginTop: i ? 10 : 0 }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, color: T.rauch, width: 22 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0, ...titelStil(18) }}>{e.titel}</div>
                  {e.im_besitz && <span style={badgeStil(false)}>IM BESITZ</span>}
                </div>
              ))}
            </div>
          </Modul>
        )}

        {/* ---- 3 · Jetzt streambar (Merkliste ∩ Abos) ---- */}
        {streambar.length > 0 && (
          <Modul name="Jetzt streambar" ziel="streaming" linkLabel="Streaming" onNavigiere={onNavigiere}>
            <div style={karteStil()} onClick={() => onNavigiere && onNavigiere("streaming")}>
              {streambar.map((m, i) => (
                <div key={m.watchmode_id} style={{ ...zeileStil, marginTop: i ? 10 : 0 }}>
                  <div style={{ flex: 1, minWidth: 0, ...titelStil(18) }}>{m.titel}{m.jahr ? " (" + m.jahr + ")" : ""}</div>
                  <span style={badgeStil(true)}>JETZT AUF {String(m.dienst).toUpperCase()}</span>
                </div>
              ))}
            </div>
          </Modul>
        )}

        {/* ---- 4 · Pinboard ---- */}
        {pins.length > 0 && (
          <Modul name="Pinboard" ziel="kino" linkLabel="Kino" onNavigiere={onNavigiere} tour="pinboard">
            <div style={karteStil()} onClick={() => onNavigiere && onNavigiere("kino")}>
              {pins.map((p, i) => (
                <div key={p.t + "|" + p.z} style={{ ...zeileStil, marginTop: i ? 10 : 0 }}>
                  <div style={{ flex: 1, minWidth: 0, ...titelStil(18) }}>{p.t}</div>
                  <span style={terminStil()}>{p.zAnzeige}</span>
                </div>
              ))}
            </div>
          </Modul>
        )}

        {/* ---- 5 · Zuletzt hinzugefügt (Kandidat, angenommen) ---- */}
        {zuletzt.length > 0 && (
          <Modul name="Zuletzt hinzugefügt" ziel="mediathek" linkLabel="Mediathek" onNavigiere={onNavigiere}>
            <div style={karteStil()} onClick={() => onNavigiere && onNavigiere("mediathek")}>
              {zuletzt.map((z, i) => (
                <div key={z.key} onClick={(e) => { e.stopPropagation(); onNavigiere && onNavigiere(z.ziel); }}
                  style={{ ...zeileStil, marginTop: i ? 8 : 0, fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.tinte }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.label}</span>
                  <span style={{ color: T.rauch }}>{fmtTag(z.zeit)}</span>
                  <span style={badgeStil(false)}>{z.quelle}</span>
                </div>
              ))}
            </div>
          </Modul>
        )}
      </div>
    </section>
  );
}

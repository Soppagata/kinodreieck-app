import { useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { MasterImport } from "../components/MasterImport.jsx";
import { IconExport, Klappe, SegmentedControl } from "../components/ui.jsx";
import { FeldHinweis } from "../components/FeldHinweis.jsx";
import { StreamingEinstellungen } from "../components/StreamingEinstellungen.jsx";
import { RestoreImport } from "../components/RestoreImport.jsx";
import { UeberKinodreieck } from "../components/Erklaerstuecke.jsx";

/* ================= EINSTELLUNGEN =================
   Tester-Oberfläche in stabiler Reihenfolge. Persönliche Daten, der gemeinsame
   Katalog und manuelle Wartung bleiben bewusst getrennte Bereiche. */
export function DatenTab({
  master, masterMeta, masterHerkunft, nachtragCount,
  exportMaster, importMaster, importProgramm, importNonstop,
  programm, clearProgrammCache,
  startWahl = null, onDemoEntfernen,
  katalogVerbunden = false, onKatalogVerbinden, onKatalogRefresh,
  ungesichertMaster = false, ungesichertArtikel = false,
  einstellungen = {}, setzeEinstellung, waehleModus, backupGesamt,
  vokabular = [], saveVokabular,
  streamingBekannt, streamingEntdecken, auswahl, toggleQuelle,
  datenGesperrt = false,
  offeneFlags = 0, migriereMustwatch, migrationsBericht = null,
  importiereBesitz, besitzImportBericht = null,
}) {
  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 8px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };
  const kasten = { background: T.saalHoch, borderRadius: 6, padding: "16px 18px" };
  const [eggOffen, setEggOffen] = useState(false);
  const [ueberOffen, setUeberOffen] = useState(false);

  /* Im hellen Grundmodus öffnet der unklare Knopf Showa, im dunklen NERV.
     Bei aktivem Spezialmodus bleibt sein Ziel stabil, damit derselbe Knopf ihn
     wieder beendet. Namen und Bedingungen werden in der UI nicht verraten. */
  const eggZiel = einstellungen.modus || ((einstellungen.basisTheme || einstellungen.theme) === "hell" ? "showa" : "nerv");
  const eggAktiv = einstellungen.modus === eggZiel;
  const eggLabel = eggZiel === "showa" ? "Mit Stil" : "Weils cool ist";
  const eggToggle = () => {
    if (!waehleModus) return;
    if (eggAktiv) waehleModus(einstellungen.basisTheme === "hell" ? "foyer" : "saal");
    else waehleModus(eggZiel);
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1 — Darstellung */}
      {setzeEinstellung && (
        <Klappe titel="Darstellung & Verhalten" offen>
          <div style={kasten}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="kd-einstellzeile" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>Erscheinung</span>
                <SegmentedControl style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
                  value={einstellungen.modus ? null : (einstellungen.theme === "hell" ? "foyer" : "saal")}
                  onChange={(id) => waehleModus?.(id)}
                  options={[{ id: "saal", label: "Saal (dunkel)" }, { id: "foyer", label: "Foyer (hell)" }]} />
              </div>
              <div className="kd-einstellzeile" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>Schriftgröße</span>
                <SegmentedControl style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
                  value={einstellungen.schrift || "normal"}
                  onChange={(id) => setzeEinstellung("schrift", id)}
                  options={[{ id: "klein", label: "Klein" }, { id: "normal", label: "Normal" }, { id: "gross", label: "Groß" }]} />
              </div>
              <div className="kd-einstellzeile" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>Bedienhand</span>
                <SegmentedControl style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
                  value={einstellungen.linkshaender ? "links" : "rechts"}
                  onChange={(id) => setzeEinstellung("linkshaender", id === "links")}
                  options={[{ id: "rechts", label: "Rechts" }, { id: "links", label: "Links" }]} />
                <span style={mono}>spiegelt Griff & Menü am Handy</span>
              </div>
              <div className="kd-kompakt" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>Startbereich</span>
                <select value={einstellungen.startTab || "start"} onChange={(e) => setzeEinstellung("startTab", e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                  {[["start", "Start (Dashboard)"], ["kino", "Kino"], ["mediathek", "Mediathek"], ["streaming", "Streaming"], ["blog", "Blog"], ["finder", "Suche"]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </Klappe>
      )}

      {/* 2 — Datenmodus */}
      <Klappe titel="Datenmodus & Verbindung">
        <div style={kasten}>
          <h2 style={h2}>{startWahl === "demo" ? "Demo-Modus" : "Clean Mode"}</h2>
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
            Kino- und Streamingprogramm sind ein gemeinsamer, schreibgeschützter Katalog. Deine Mediathek, Merkliste und Einstellungen bleiben nur in diesem Browser. Datenbankzugang: <strong style={{ color: katalogVerbunden ? T.wolfram : T.gefahr }}>{katalogVerbunden ? "verbunden" : "nicht verbunden"}</strong>.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onKatalogVerbinden && <button style={btnStyle(false)} onClick={onKatalogVerbinden}>{katalogVerbunden ? "Datenbankzugang prüfen/ändern" : "Datenbank verbinden"}</button>}
            {startWahl === "demo" && onDemoEntfernen && (
              <button style={{ ...btnStyle(false), color: T.gefahr, borderColor: T.gefahr }} onClick={() => {
                if (window.confirm("Max’ Demo-Einträge entfernen?\n\nDas gemeinsame Kino- und Streamingprogramm bleibt erhalten. Eigene, später ergänzte Einträge bleiben ebenfalls erhalten.")) onDemoEntfernen();
              }}>Demo-Daten entfernen</button>
            )}
          </div>
        </div>
      </Klappe>

      {/* 3 — Masterliste */}
      <Klappe titel="Masterliste" tour="daten-export">
        <div style={kasten}>
          <h2 style={h2}>Deine Mediathek als Rohdaten</h2>
          {master ? (
            <>
              <p style={{ fontSize: 14, color: T.leinwandTief, margin: "0 0 12px", lineHeight: 1.6 }}>
                <strong>{master.length} Einträge</strong>{masterMeta?.version ? " · v" + masterMeta.version : ""}{nachtragCount > 0 ? " · " + nachtragCount + " unbewertete Besitz-Titel" : ""}
                {masterHerkunft?.basis ? " · Basis: " + masterHerkunft.basis : ""}
              </p>
              <button style={{ ...btnStyle(true), display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14 }} onClick={exportMaster}><IconExport size={16} />Masterliste exportieren</button>
            </>
          ) : (
            <p style={{ fontSize: 14, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>Noch keine Einträge. Du kannst deine Mediathek einzeln aufbauen oder eine vorhandene Masterliste importieren.</p>
          )}
          <MasterImport onImport={importMaster} hasMaster={!!master}
            labelNeu="Masterliste importieren" labelErsetzen="Masterliste ersetzen" />
        </div>
      </Klappe>

      {/* 4 — Backup */}
      <Klappe titel="Gesamt-Backup">
        <div style={kasten}>
          {(ungesichertMaster || ungesichertArtikel) && (
            <p data-tour="daten-waechter" style={{ color: T.wolfram, fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
              Es gibt ungesicherte Änderungen im Browser. Ein Gesamt-Backup schützt Mediathek, Blog, Listen und Einstellungen gemeinsam.
            </p>
          )}
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>Lädt den vollständigen persönlichen App-Stand als Datei herunter. Der gemeinsame Kino- und Streamingkatalog wird nicht dupliziert.</p>
          {backupGesamt && <button style={{ ...btnStyle(true), display: "inline-flex", alignItems: "center", gap: 8 }} onClick={backupGesamt}><IconExport size={16} />Gesamt-Backup herunterladen</button>}
          <FeldHinweis feld="backup" />
          <div className="kd-nur-desktop" style={{ marginTop: 14 }}><RestoreImport ohneKopf /></div>
        </div>
      </Klappe>

      {/* 5 — Streaming-Quellen */}
      {toggleQuelle && <StreamingEinstellungen bekannt={streamingBekannt} entdecken={streamingEntdecken}
        auswahl={auswahl} toggleQuelle={toggleQuelle} teil="quellen" datenGesperrt={datenGesperrt} />}

      {/* 6 — Such-Vokabular */}
      {saveVokabular && (
        <Klappe titel="Suche-Vokabular" tour="daten-vokabular">
          <VokabularEditor vokabular={vokabular} saveVokabular={saveVokabular} mono={mono} />
        </Klappe>
      )}

      {/* 7 — Katalog-Status */}
      <StreamingEinstellungen bekannt={streamingBekannt} entdecken={streamingEntdecken}
        auswahl={auswahl} toggleQuelle={toggleQuelle} teil="status" datenGesperrt={datenGesperrt} />

      {/* 8 — Erweitert, direkt nach dem Katalog-Status; Refresh gehört hinein. */}
      <div data-tour="erweitert">
        <Klappe titel="Erweitert — manuelle Aktualisierung & Wartung">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={kasten}>
              <h2 style={h2}>Katalog aus der Datenbank</h2>
              <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>Lädt Kino- und Streamingstand neu, ohne selbst Watchmode-Requests auszulösen.</p>
              {onKatalogRefresh && <button style={btnStyle(true)} onClick={onKatalogRefresh}>Katalog jetzt neu laden</button>}
            </div>
            <div style={kasten}>
              <h2 style={h2}>Programm manuell importieren</h2>
              <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>Nur als Notfallweg: einen Programm-Snapshot oder gespeichertes Nonstop-HTML lokal einspielen.</p>
              <div data-tour="programm-import"><MasterImport onImport={importProgramm} hasMaster={!!programm}
                labelNeu="Programm-Snapshot importieren" labelErsetzen="Programm-Snapshot ersetzen"
                hinweis='Programm-JSON einfügen ({"erstellt":…, "data":{"filme":[…]}})' /></div>
              <div style={{ marginTop: 12 }}><MasterImport onImport={importNonstop} hasMaster={!!programm}
                labelNeu="Nonstop-Seite (HTML) laden" labelErsetzen="Nonstop-Seite (HTML) laden"
                hinweis="HTML-Quelltext der Nonstop-Programmseite einfügen" accept=".html,.htm,.txt" /></div>
            </div>
            {(offeneFlags > 0 || migrationsBericht || besitzImportBericht) && (
              <div style={kasten}>
                <h2 style={h2}>Einmalige Datenmigration</h2>
                {migriereMustwatch && offeneFlags > 0 && <button style={btnStyle(false)} onClick={migriereMustwatch}>{offeneFlags} alte Must-Watch-Flags migrieren</button>}
                {migrationsBericht && <p style={mono}>Migration: {migrationsBericht.angelegt} angelegt · {migrationsBericht.uebersprungen} übersprungen.</p>}
                {importiereBesitz && <div style={{ marginTop: 12 }}>
                  <input type="file" accept=".json,application/json" onChange={(e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const rd = new FileReader(); rd.onload = () => importiereBesitz(String(rd.result || "")); rd.readAsText(f); e.target.value = "";
                  }} style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwand }} />
                  {besitzImportBericht && <p style={mono}>Import: {besitzImportBericht.uebernommen} übernommen · {besitzImportBericht.uebersprungen} übersprungen.</p>}
                </div>}
              </div>
            )}
            <div style={kasten}>
              <h2 style={h2}>Lokaler Cache</h2>
              <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>Verwirft den lokal gemerkten Programmstand. Beim nächsten Laden wird wieder die Datenbank verwendet.</p>
              <button style={btnStyle(false)} onClick={clearProgrammCache}>Programm-Cache leeren</button>
            </div>
          </div>
        </Klappe>
      </div>

      {/* 9 — Rechtliches + absichtlich unklarer versteckter Modusknopf. */}
      <Klappe titel="Über & Rechtliches">
        <div style={kasten}>
          <p style={{ fontSize: 12, color: T.rauch, lineHeight: 1.7, margin: 0 }}>
            Kinodreieck — privates, nicht-kommerzielles Projekt. Persönliche Daten liegen im Browser; die App verwendet keine Telemetrie. Programmdaten: film.at &amp; nonstopkino.at · Streaming-Kataloge: Watchmode. Alle Angaben ohne Gewähr — verbindlich sind die Kino- bzw. Anbieterseiten. Bewertungen und Texte sind persönliche Meinungen ihrer Autoren.
            <br />© {new Date().getFullYear()} <span onClick={() => setEggOffen((v) => !v)} title="…" style={{ color: T.wolfram, cursor: "pointer", textDecorationLine: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>Max</span> — Nutzung auf eigene Verantwortung.
          </p>
          {eggOffen && waehleModus && <div style={{ marginTop: 12 }}><button onClick={eggToggle} style={btnStyle(eggAktiv)}>{eggLabel}</button></div>}
          <div style={{ marginTop: 14 }}>
            <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={() => setUeberOffen((v) => !v)}>{ueberOffen ? "Anleitung zuklappen" : "Über Kinodreieck & Anleitung"}</button>
            {ueberOffen && <UeberKinodreieck />}
          </div>
        </div>
      </Klappe>
    </section>
  );
}

function VokabularEditor({ vokabular, saveVokabular, mono }) {
  const [wort, setWort] = useState("");
  const [genres, setGenres] = useState("");
  const [tags, setTags] = useState("");
  const teile = (s) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const hinzufuegen = () => {
    const w = wort.trim().toLowerCase();
    if (!w) return;
    const g = teile(genres), t = teile(tags);
    if (!g.length && !t.length) return;
    saveVokabular([...vokabular.filter((v) => v.wort !== w), { wort: w, genres: g, tags: t }]);
    setWort(""); setGenres(""); setTags("");
  };
  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
      <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>Bring der Suche eigene Wörter bei: ein Stichwort und passende Genres oder Tags, jeweils kommagetrennt.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={wort} onChange={(e) => setWort(e.target.value)} placeholder="Wort (z. B. gemütlich)" style={{ ...inputStyle, width: 160 }} />
        <input value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="Genres, kommagetrennt" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, kommagetrennt" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
        <button style={btnStyle(true)} onClick={hinzufuegen} disabled={!wort.trim() || (!genres.trim() && !tags.trim())}>Merken</button>
      </div>
      {vokabular.length === 0 ? <p style={mono}>Noch keine eigenen Wörter.</p> : vokabular.map((v) => (
        <div key={v.wort} style={{ display: "flex", gap: 10, alignItems: "baseline", fontFamily: "'Space Mono', monospace", fontSize: 12, padding: "3px 0", color: T.leinwandTief }}>
          <strong style={{ color: T.wolfram }}>{v.wort}</strong>
          <span style={{ flex: 1 }}>{v.genres.length ? "Genres: " + v.genres.join(", ") : ""}{v.genres.length && v.tags.length ? " · " : ""}{v.tags.length ? "Tags: " + v.tags.join(", ") : ""}</span>
          <button onClick={() => saveVokabular(vokabular.filter((x) => x.wort !== v.wort))} title="Wort entfernen" style={{ background: "none", border: "none", color: T.gefahr, cursor: "pointer", fontSize: 13 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

import { useState, useMemo } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { MasterImport } from "../components/MasterImport.jsx";
import { IconExport, Klappe, SegmentedControl } from "../components/ui.jsx";
import { FeldHinweis } from "../components/FeldHinweis.jsx";
import { StreamingEinstellungen } from "../components/StreamingEinstellungen.jsx";
import { TeilenBlock } from "../components/TeilenBlock.jsx";
import { GitSyncEinstellungen } from "../components/GitSyncEinstellungen.jsx";
import { SupabaseSyncEinstellungen } from "../components/SupabaseSyncEinstellungen.jsx";
import { RestoreImport } from "../components/RestoreImport.jsx";
import { UeberKinodreieck } from "../components/Erklaerstuecke.jsx";
import { PERSONAL_MODE } from "../lib/modus.js";
import { SCHWELLEN_EGGS, zaehleQualifiziert } from "../lib/eggs.js";

/* ================= EINSTELLUNGEN (früher "Daten") =================
   Darstellung/Verhalten, Datenbestand, Teilen & Tauschen, Vokabular,
   Backup, Rechtliches. Datenquellen bewusst schlank: film.at + Nonstop
   (Kino), Watchmode (Streaming). Kein TMDB (ausgebaut Juli 2026). */
export function DatenTab({
  master, masterMeta, masterHerkunft, nachtragCount,
  exportMaster, importMaster, importProgramm, importNonstop,
  programm, setErr, clearProgrammCache, resetMaster,
  startWahl = null, onStartartWechseln,
  artikelAnzahl = 0, exportArtikel, importArtikel,
  ungesichertMaster = false, ungesichertArtikel = false,
  artikelListe = [], autorName = "", saveAutorName, uebernehmePaket,
  einstellungen = {}, setzeEinstellung, waehleModus, backupGesamt, zeigeCage, zeigeTeppich,
  zeigeCrawl, zeigeKlaatu, /* B4-Egg: Moment-Egg-Vorführknöpfe */
  may4Vorschau = false, setMay4Vorschau,
  vokabular = [], saveVokabular,
  streamingBekannt, streamingEntdecken, auswahl, toggleQuelle, heuristikAn, setHeuristikAn,
  resetTag = null, setResetTag,
  datenGesperrt = false,
  offeneFlags = 0, migriereMustwatch, migrationsBericht = null,
  importiereBesitz, besitzImportBericht = null,
  achievements = [],
}) {
  const h2Style = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 6px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };
  const wahlKnopf = (aktiv) => ({ ...btnStyle(false), fontSize: 13, padding: "7px 13px", borderColor: aktiv ? T.wolfram : T.rauch, color: aktiv ? T.wolfram : T.leinwand });
  /* Easter-Egg-Modi: versteckt unter dem „Max"-Link. Zwei Dauer-Modi (Showa/NERV),
     je ein Toggle-Knopf — theme-unabhängig (beide bringen ihre eigene Palette mit). */
  const [eggAn, setEggAn] = useState(false);
  /* „Über"-Einstieg (Etappe 4, nur PERSONAL_MODE): das Start-Dashboard trägt
     die Erklärinhalte nicht mehr — Hero, Dreieck-Erklärung und Anleitung
     (Erklaerstuecke.jsx, Inhalte unverändert) öffnen hier auf Knopfdruck.
     Im Beta-Build zeigt weiterhin die Landing selbst alles (kein Doppel). */
  const [ueberOffen, setUeberOffen] = useState(false);
  const eggModus = (wahl) => { if (waehleModus) waehleModus(einstellungen.modus === wahl ? "saal" : wahl); };
  /* Vorführmodus-Zahlen: qualifizierte Mediathek-Einträge je Schwellen-Egg. */
  const zaehlung = useMemo(() => zaehleQualifiziert(master || []), [master]);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ---- Darstellung & Verhalten ----
          Etappe 2: Hauptblöcke als <details>-Accordions (Klappe) — dieser
          startet als einziger OFFEN; konditionale Blöcke (Migration, Wächter-
          Banner) bleiben bewusst Kästen/Banner und wandern NICHT in Klappen. */}
      {setzeEinstellung && (
        <Klappe titel="Darstellung & Verhalten" offen>
        <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Exklusive Umschalter als SegmentedControl (Etappe 2, Nachbesserung):
                keine zweizeiligen Knopf-Stapel mehr auf 390px — die Reihe wischt.
                Optionstexte bleiben EXAKT (Tests: /Foyer \(hell\)/, /^Groß$/).
                Aktiver Modus (Showa/NERV) -> value null, kein Knopf aktiv
                (entspricht der alten wahlKnopf-Bedingung !einstellungen.modus). */}
            <div className="kd-einstellzeile" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>Erscheinung</span>
              <SegmentedControl style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
                value={einstellungen.modus ? null : (einstellungen.theme === "hell" ? "foyer" : "saal")}
                onChange={(id) => waehleModus && waehleModus(id)}
                options={[{ id: "saal", label: "Saal (dunkel)" }, { id: "foyer", label: "Foyer (hell)" }]} />
            </div>
            <div className="kd-einstellzeile" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>Schriftgröße</span>
              <SegmentedControl style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
                value={einstellungen.schrift || "normal"}
                onChange={(w) => setzeEinstellung("schrift", w)}
                options={[["klein", "Klein"], ["normal", "Normal"], ["gross", "Groß"]].map(([w, l]) => ({ id: w, label: l }))} />
            </div>
            {/* Etappe 3: Linkshänder-Option — invertiert am Handy Griff UND
                Menü-Popup (kd-links am Wrapper). Persistiert als linkshaender
                in kd:einstellungen (synct via einstellungen.json). */}
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
              <select value={einstellungen.startTab || "kino"} onChange={(e) => setzeEinstellung("startTab", e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                {[["start", "Start (Dashboard)"], ["kino", "Kino"], ["mediathek", "Mediathek"], ["streaming", "Streaming"], ["blog", "Blog"], ["finder", "Suche"]].map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
              <span style={mono}>öffnet sich beim Start der App</span>
            </div>
            {/* Modi (Showa/NERV) liegen als Easter-Egg unter „Über & Rechtliches" (Klick auf „Max"). */}
          </div>
        </div>
        </Klappe>
      )}
      {/* ---- Vorführmodus (Block 3, nur PERSONAL_MODE): Eggs erzwingen + reale Vertreter-Zahlen ---- */}
      {PERSONAL_MODE && setzeEinstellung && (
        <Klappe titel="Vorführmodus (Test)">
          <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
            <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
              Setzt automatische Egg-Chancen im passenden Kontext auf 100 %. Die Knöpfe darunter
              öffnen jede Optik sofort; fehlt ein verfügbarer Vertreter, erscheint eine neutrale Vorschau.
              Nur für dich sichtbar — im Beta-Build gibt es weder Eggs noch diesen Schalter.
            </p>
            <div data-testid="egg-vorfuehr" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>Eggs erzwingen</span>
              <SegmentedControl style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
                value={einstellungen.vorfuehr ? "an" : "aus"}
                onChange={(id) => {
                  const an = id === "an";
                  setzeEinstellung("vorfuehr", an);
                  if (setMay4Vorschau) setMay4Vorschau(an);
                }}
                options={[{ id: "aus", label: "Aus" }, { id: "an", label: "An" }]} />
            </div>
            <div data-testid="may4-vorschau" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>4.-Mai-Theme</span>
              <SegmentedControl style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
                value={may4Vorschau ? "an" : "aus"}
                onChange={(id) => setMay4Vorschau && setMay4Vorschau(id === "an")}
                options={[{ id: "aus", label: "Aus" }, { id: "an", label: "An" }]} />
              <span style={mono}>ganze App · ohne Crawl</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SCHWELLEN_EGGS.map((egg) => {
                const anzahl = zaehlung[egg.id] || 0;
                const frei = achievements.includes(egg.id);
                return (
                  <div key={egg.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, borderTop: "1px solid " + T.saal, paddingTop: 8 }}>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: "0.04em", textTransform: "uppercase", color: T.leinwand }}>{egg.name}</span>
                    <span style={{ ...mono, whiteSpace: "nowrap" }}>{anzahl}/{egg.schwelle} · {frei ? "freigeschaltet" : "gesperrt"}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {zeigeCage && <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={zeigeCage}>Cage-Alphabet zeigen</button>}
              {zeigeTeppich && <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={zeigeTeppich}>Teppich zeigen</button>}
              {/* B4-Egg: die zwei Moment-Eggs erzwingen (nur PERSONAL_MODE, dieser Block ist ohnehin gegatet). */}
              {zeigeCrawl && <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={zeigeCrawl}>Star-Wars-Crawl zeigen</button>}
              {zeigeKlaatu && <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={zeigeKlaatu}>Klaatu/Necronomicon zeigen</button>}
            </div>
          </div>
        </Klappe>
      )}
      {/* ---- Must-Watch-Migration + Besitz-Nachtrag (einmalige, idempotente Läufe) ---- */}
      {/* B6: nur zeigen, wenn wirklich etwas offen ist oder berichtet wird — vorher hing der
          Guard an der immer-truthy Funktion importiereBesitz, sodass die Box dauerhaft stand. */}
      {(offeneFlags > 0 || migrationsBericht || besitzImportBericht) && (
        <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
          <h2 style={h2Style}>Must-Watch-Migration & Besitz-Nachtrag</h2>
          {migriereMustwatch && offeneFlags > 0 && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>
                <strong style={{ color: T.leinwand }}>{offeneFlags}</strong> Einträge tragen noch das alte
                Wunschlisten-Flag. Die Migration legt sie einmalig als Must-Watch-Einträge an
                (mit Verknüpfung auf den Mediathek-Eintrag; „im Besitz" aus den physischen Quellen abgeleitet).
                Mehrfaches Ausführen ändert nichts.
              </p>
              <button style={btnStyle(true)} onClick={migriereMustwatch}>Flags in die Must-Watch-Liste migrieren</button>
            </div>
          )}
          {migrationsBericht && (
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, margin: "0 0 14px" }}>
              Migration: {migrationsBericht.angelegt} angelegt · {migrationsBericht.uebersprungen} übersprungen (bereits verknüpft).
            </p>
          )}
          {importiereBesitz && (
            <div>
              <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>
                <strong style={{ color: T.leinwand }}>Besitz-Nachtrag importieren:</strong> spielt die
                vorbereitete Kandidaten-Datei (Format <code style={{ color: T.wolfram }}>kinodreieck-besitz-import</code>)
                als UNBEWERTETE Besitz-Einträge ein. Bereits vorhandene IDs werden übersprungen und
                berichtet — wiederholtes Einspielen ändert nichts.
              </p>
              <input type="file" accept=".json,application/json"
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0]; if (!f) return;
                  const rd = new FileReader();
                  rd.onload = () => importiereBesitz(String(rd.result || ""));
                  rd.readAsText(f);
                  e.target.value = "";
                }}
                style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwand }} />
              {besitzImportBericht && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwandTief, margin: "0 0 6px" }}>
                    Import: {besitzImportBericht.uebernommen} übernommen · {besitzImportBericht.uebersprungen} übersprungen.
                  </p>
                  {besitzImportBericht.uebersprungen > 0 && (
                    <details>
                      <summary style={{ cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}>Übersprungene zeigen</summary>
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                        {besitzImportBericht.zeilen.filter((z) => z.status !== "übernommen").map((z, i) => (
                          <div key={i} style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.wolfram }}>
                            {z.titel}{z.jahr ? " (" + z.jahr + ")" : ""} — {z.grund}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Export-Wächter: Browser-Speicher ist KEIN Backup */}
      {(ungesichertMaster || ungesichertArtikel) && (
        <div data-tour="daten-waechter" style={{ background: "rgba(227,166,59,0.12)", border: "1px solid " + T.wolfram, borderRadius: 6, padding: "12px 16px", fontSize: 14, lineHeight: 1.6 }}>
          <strong style={{ color: T.wolfram }}>Ungesicherte Änderungen im Browser-Speicher:</strong>
          {ungesichertMaster && <> Masterliste (Bewertungen/Einträge)</>}
          {ungesichertMaster && ungesichertArtikel && <> und</>}
          {ungesichertArtikel && <> Blog-Artikel</>}
          {" "}— seit dem letzten separaten Rohdaten-Export geändert. Der Browser-Speicher kann verloren gehen (Cache leeren, Browserwechsel).
          {" "}Das Gesamt-Backup unten sichert den vollständigen App-Stand; externe Archive der Daten-Jobs ersetzen es nicht.
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {ungesichertMaster && exportMaster && <button style={{ ...btnStyle(true), fontSize: 13, padding: "7px 13px", display: "inline-flex", alignItems: "center", gap: 7 }} onClick={exportMaster}><IconExport size={15} />Filmlisten-Rohdaten jetzt exportieren</button>}
            {ungesichertArtikel && exportArtikel && <button style={{ ...btnStyle(false), fontSize: 13, padding: "7px 13px", display: "inline-flex", alignItems: "center", gap: 7 }} onClick={exportArtikel}><IconExport size={15} />Artikel-Rohdaten jetzt exportieren</button>}
          </div>
        </div>
      )}

      {/* ---- Vokabular: eigene Stimmungswörter für die Suche ---- */}
      {saveVokabular && (
        <Klappe titel="Suche-Vokabular" tour="daten-vokabular">
          <VokabularEditor vokabular={vokabular} saveVokabular={saveVokabular} mono={mono} />
        </Klappe>
      )}

      {/* Teilen & Tauschen: Paket-Export/Import + KI-Ingestion (Phase A).
          data-tour wandert an die Klappe — der Tour-Anker existiert auch zugeklappt. */}
      {master && uebernehmePaket && (
        <Klappe titel="Teilen & Tauschen" tour="teilen">
          <TeilenBlock ohneKopf master={master} artikel={artikelListe}
            autorName={autorName} saveAutorName={saveAutorName}
            uebernehmePaket={uebernehmePaket} setErr={setErr} />
        </Klappe>
      )}

      {/* ---- Vollständiger App-Stand: Backup + Wiederherstellung ---- */}
      <Klappe titel="Gesamt-Backup" tour="daten-export">
        {backupGesamt && (
        <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
            Ein Klick sichert ALLES aus der App (Filmliste, Artikel, Pins, Merkliste,
            Einstellungen, Vokabular) in eine Datei. Sie landet in deinen Downloads —
            am besten in einen eigenen <strong style={{ color: T.leinwand }}>Backup</strong>-Ordner
            verschieben. Archive der externen Kino- und Streaming-Jobs enthalten nur deren
            Dateien und ersetzen dieses persönliche Gesamt-Backup nicht.
          </p>
          <button style={{ ...btnStyle(true), display: "inline-flex", alignItems: "center", gap: 8 }} onClick={backupGesamt}><IconExport size={16} />Gesamt-Backup herunterladen</button>
          <FeldHinweis feld="backup" />
        </div>
        )}
        {/* Restore bleibt aus Sicherheitsgründen am Desktop; die bestehende
            Importlogik und ihre Sicherheitshinweise bleiben unverändert. */}
        <div className="kd-nur-desktop" style={{ marginTop: backupGesamt ? 14 : 0 }}>
          <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
            <h2 style={{ ...h2Style, margin: "0 0 10px" }}>Backup wiederherstellen</h2>
            <RestoreImport ohneKopf />
          </div>
        </div>
      </Klappe>

      {/* ---- Erweitert: Sync, Rohdaten und Wartung — bewusst eingeklappt. ---- */}
      <details>
        <summary style={{ cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: T.rauch, padding: "4px 0" }}>
          Erweitert — Sync, Rohdaten & Wartung
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 12 }}>
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <h2 style={{ ...h2Style, margin: "0 0 8px" }}>Geräte-Sync verwalten</h2>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
          Die normale Einrichtung erfolgt beim ersten Öffnen. Hier kannst du eine
          bestehende Verbindung später prüfen oder ändern.
        </p>
        {/* Supabase ist der aktive Treiber. Git bleibt am Desktop als Fallback-UI;
            Treiber und Sicherheitstexte werden durch diese Gruppierung nicht geändert. */}
        <div className="kd-nur-desktop">
          <Klappe titel="Geräte-Sync (Git)">
            <GitSyncEinstellungen ohneKopf />
          </Klappe>
        </div>
        <Klappe titel="Geräte-Sync (Supabase)">
          <SupabaseSyncEinstellungen ohneKopf />
        </Klappe>
      </div>

      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <h2 style={{ ...h2Style, margin: "0 0 10px" }}>Rohdaten: Filmliste (Masterliste)</h2>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>
          Das Herz der App: alle Einträge und Bewertungen. Der aktive Stand liegt im
          Browser und kann optional über den Geräte-Sync abgeglichen werden. Der JSON-Export
          ist eine separate Rohdatenkopie für Archivierung, Kontrolle und Kompatibilität.
        </p>
        {master ? (
          <>
            {masterHerkunft && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "5px 10px", borderRadius: 4, background: T.saal, border: "1px solid " + T.wolfram }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.wolfram, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Quelle: {masterHerkunft.typ === "storage" ? "Storage (Browser)" : masterHerkunft.typ === "demo" ? "Demo-Liste (Schaufenster)" : masterHerkunft.typ === "bundled" ? "Mitgelieferte Projektdatei" : "Manuell importiert"}
                </span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch }}>
                  {(masterHerkunft.typ === "bundled" || masterHerkunft.typ === "demo")
                    ? (masterHerkunft.typ === "demo" ? "fremde Beispiel-Bewertungen · " : "") + (masterHerkunft.zeit ? "Stand " + masterHerkunft.zeit : "") + " · noch nicht im Storage — erste Bearbeitung speichert"
                    : "zuletzt geladen " + (typeof masterHerkunft.zeit === "number" ? new Date(masterHerkunft.zeit).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : String(masterHerkunft.zeit || ""))}
                  {masterHerkunft.basis ? " · basiert auf " + masterHerkunft.basis : ""}
                </span>
              </div>
            )}
            <p style={{ fontSize: 14, color: T.leinwandTief, margin: "0 0 12px" }}>
              Geladen: <strong>{master.length} Einträge</strong>
              {masterMeta?.version ? " · v" + masterMeta.version : ""}
              {" · "}von dir geprüft: {master.filter((f) => f.bewertet_von === "max").length}
              {" · "}DVD: {master.filter((f) => (f.quelle || "").includes("dvd")).length}
              {" · "}Prime-Snapshot: {master.filter((f) => (f.quelle || "").includes("prime")).length}
              {" · "}Apple: {master.filter((f) => (f.quelle || "").includes("apple")).length}
              {nachtragCount > 0 && <> {" · "}Nachtrag: {nachtragCount} unbewertete Besitz-Titel</>}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <button style={{ ...btnStyle(true), display: "inline-flex", alignItems: "center", gap: 8 }} onClick={exportMaster}>
                <IconExport size={16} />Filmliste als Rohdaten exportieren (JSON)
              </button>
              {resetMaster && (
                <button style={{ ...btnStyle(false), borderColor: T.gefahr, color: T.gefahr }}
                  title={"Wirft den im Browser gespeicherten Stand weg und lädt den gewählten Start neu (" + (startWahl === "demo" ? "Demo-Liste" : "leerer Start") + "). Nutzen, wenn die Mediathek alte/falsche Daten zeigt (file://-Speicher wird von allen lokalen HTMLs geteilt)."}
                  onClick={() => {
                    /* KD-003: unter aktivem Geräte-Sync holt der Boot-Pull synchronisierte Daten zurück — ehrlicher Wortlaut statt „gehen verloren". */
                    if (window.confirm("Browser-Stand verwerfen und den gewählten Start neu laden?\n\nNur der lokale Browser-Stand wird geleert. Bei aktivem Geräte-Sync werden synchronisierte Daten beim nächsten Laden wieder vom Server geholt — nur NICHT synchronisierte und nie exportierte Änderungen gehen verloren.")) resetMaster();
                  }}>
                  Browser-Stand verwerfen → {startWahl === "demo" ? "Demo neu laden" : "leeren"}
                </button>
              )}
              {!PERSONAL_MODE && onStartartWechseln && (
                <button style={btnStyle(false)}
                  title="Zwischen leerem Start und Demo-Liste wechseln. Verwirft den Browser-Stand — vorher exportieren, falls nötig."
                  onClick={() => {
                    if (window.confirm("Startart wechseln (leer ⇄ Demo)?\n\nDer aktuelle Browser-Stand wird verworfen — nicht exportierte Einträge gehen verloren.")) onStartartWechseln();
                  }}>
                  Startart wechseln (leer ⇄ Demo)
                </button>
              )}
            </div>
            <p style={{ fontSize: 12, color: T.rauch, margin: "0 0 12px" }}>
              Der JSON-Export ist eine Momentaufnahme des aktuellen Browser-Stands; spätere
              Änderungen aktualisieren diese Datei nicht automatisch. Zeigt „Quelle: Storage (Browser)"
              einen veralteten Stand, hilft der rote Knopf.
            </p>
          </>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 14, color: T.rauch, margin: "0 0 10px" }}>
              Leerer Start — noch keine Liste geladen. Du baust deine Mediathek über Kino, Streaming und Suche auf,
              oder spielst unten eine JSON-Masterliste ein (wird dauerhaft gespeichert).
            </p>
            {!PERSONAL_MODE && onStartartWechseln && (
              <button style={{ ...btnStyle(false), fontSize: 13, padding: "6px 12px" }}
                title="Beispiel-Liste laden, um zu sehen, wie die App mit Inhalt aussieht."
                onClick={() => { if (window.confirm("Zur Demo-Liste wechseln? Zeigt eine fremde Beispiel-Liste nur zum Anschauen.")) onStartartWechseln(); }}>
                Demo-Liste ansehen
              </button>
            )}
          </div>
        )}
        <MasterImport onImport={importMaster} hasMaster={!!master}
          labelNeu="Filmlisten-Rohdaten importieren" labelErsetzen="Filmlisten-Rohdaten ersetzen" />
        <div style={{ height: 1, background: T.saal, margin: "16px 0" }} />
        <h2 style={h2Style}>Programm-Snapshot</h2>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.5 }}>
          Programm-JSON hier einspielen — gilt 7 Tage. Der geplante Weg: ein Job legt <code style={{ color: T.wolfram }}>programm.json</code> in den <code style={{ color: T.wolfram }}>public/</code>-Ordner, die App lädt sie beim Start automatisch.
        </p>
        <div data-tour="programm-import">
          <MasterImport onImport={importProgramm} hasMaster={!!programm}
            labelNeu="Programm-Snapshot importieren" labelErsetzen="Programm-Snapshot ersetzen"
            hinweis='Programm-JSON hier einfügen ({"erstellt":…,"data":{"filme":[…]}})' />
        </div>
        <p style={{ fontSize: 13, color: T.rauch, margin: "14px 0 10px", lineHeight: 1.5 }}>
          <strong style={{ color: T.wolfram }}>Oder deterministisch ohne API-Abhängigkeit:</strong> nonstopkino.at/programm im Browser öffnen, Seite speichern (Strg+S, „nur HTML“) und die Datei hier laden — die App parst daraus die Wiener Abo-Vorstellungen der Woche. Demnächst-Einträge bleiben dabei erhalten.
        </p>
        <MasterImport onImport={importNonstop} hasMaster={!!programm}
          labelNeu="Nonstop-Seite (HTML) laden" labelErsetzen="Nonstop-Seite (HTML) laden"
          hinweis="Alternativ: HTML-Quelltext der Nonstop-Programmseite hier einfügen"
          accept=".html,.htm,.txt" />
      </div>

      {exportArtikel && (
        <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
          <h2 style={h2Style}>Blog-Artikel</h2>
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.5 }}>
            {artikelAnzahl} Artikel im Browser-Speicher. Wie bei der Masterliste gilt:
            regelmäßig exportieren und die Datei sichern — der Browser-Speicher ist kein Backup.
          </p>
          <button style={{ ...btnStyle(true), marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 8 }} onClick={exportArtikel}><IconExport size={16} />Artikel als Rohdaten exportieren (JSON)</button>
          <MasterImport onImport={importArtikel} hasMaster={artikelAnzahl > 0}
            labelNeu="Artikel importieren" labelErsetzen="Artikel ersetzen (überschreibt!)"
            hinweis='artikel.json hier einfügen ({"artikel":[…]})' />
        </div>
      )}

      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <h2 style={h2Style}>Cache</h2>
        <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px" }}>
          Kinoprogramm 24h (Snapshots 7 Tage).
        </p>
        <button style={btnStyle(false)} onClick={clearProgrammCache}>Programm-Cache leeren & neu laden</button>
      </div>

        </div>
      </details>

      {/* ---- Streaming: Quellen / Katalog / Refresh (aus dem Streaming-Tab hierher) ---- */}
      {toggleQuelle && (
        <StreamingEinstellungen bekannt={streamingBekannt} entdecken={streamingEntdecken}
          auswahl={auswahl} toggleQuelle={toggleQuelle} heuristikAn={heuristikAn} setHeuristikAn={setHeuristikAn}
          resetTag={resetTag} setResetTag={setResetTag}
          datenGesperrt={datenGesperrt} />
      )}

      {/* ---- Über & Rechtliches ---- */}
      <Klappe titel="Über & Rechtliches">
      <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
        <p style={{ fontSize: 12, color: T.rauch, lineHeight: 1.7, margin: 0 }}>
          Kinodreieck — privates, nicht-kommerzielles Projekt. Persönliche Daten liegen
          im Browser und können optional über Git oder Supabase zwischen Geräten
          synchronisiert werden; die App verwendet keine Telemetrie.
          Programmdaten: film.at &amp; nonstopkino.at · Streaming-Kataloge: Watchmode.
          Alle Angaben ohne Gewähr — verbindlich sind die Kino- bzw. Anbieterseiten.
          Genannte Marken und Dienste gehören ihren jeweiligen Eigentümern.
          Bewertungen und Texte sind persönliche Meinungen ihrer Autoren.
          <br />© {new Date().getFullYear()} <span onClick={() => setEggAn((v) => !v)} title="…"
            style={{ color: T.wolfram, cursor: "pointer", textDecorationLine: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>Max</span> — Nutzung der Software auf eigene
          Verantwortung; keine Haftung für Datenverluste oder Fahrten zu ausverkauften
          Vorstellungen.
        </p>
        {eggAn && waehleModus && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => eggModus("showa")} style={wahlKnopf(einstellungen.modus === "showa")}>Showa</button>
            <button onClick={() => eggModus("nerv")} style={wahlKnopf(einstellungen.modus === "nerv")}>NERV</button>
          </div>
        )}
        {PERSONAL_MODE && (
          <div style={{ marginTop: 14 }}>
            <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={() => setUeberOffen((v) => !v)}>
              {ueberOffen ? "Über Kinodreieck zuklappen" : "Über Kinodreieck & Anleitung"}
            </button>
            {ueberOffen && <UeberKinodreieck />}
          </div>
        )}
      </div>
      </Klappe>
    </section>
  );
}

/* ---------- Vokabular-Editor: eigene Wörter fürs Such-Verständnis ----------
   Beispiel: "gemütlich" → Genres "komödie, animation" + Tags "wohlfühlfilm".
   Die Suche behandelt eigene Wörter wie eingebaute Stimmungen (weicher
   Boost auf passende Genres/Tags, kein harter Filter). */
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
      <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>
        Bring der Suche deine eigenen Wörter bei: ein Stichwort und worauf es zeigen
        soll (Genres und/oder Tags deiner Einträge, kommagetrennt). „Zeig mir was
        Gemütliches" findet dann, was du unter gemütlich verstehst.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={wort} onChange={(e) => setWort(e.target.value)} placeholder="Wort (z.B. gemütlich)" style={{ ...inputStyle, width: 160 }} />
        <input value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="Genres, kommagetrennt" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, kommagetrennt" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
        <button style={btnStyle(true)} onClick={hinzufuegen} disabled={!wort.trim() || (!genres.trim() && !tags.trim())}>Merken</button>
      </div>
      {vokabular.length === 0
        ? <p style={mono}>Noch keine eigenen Wörter.</p>
        : vokabular.map((v) => (
          <div key={v.wort} style={{ display: "flex", gap: 10, alignItems: "baseline", fontFamily: "'Space Mono', monospace", fontSize: 12, padding: "3px 0", color: T.leinwandTief }}>
            <strong style={{ color: T.wolfram }}>{v.wort}</strong>
            <span style={{ flex: 1 }}>
              {v.genres.length ? "Genres: " + v.genres.join(", ") : ""}
              {v.genres.length && v.tags.length ? " · " : ""}
              {v.tags.length ? "Tags: " + v.tags.join(", ") : ""}
            </span>
            <button onClick={() => saveVokabular(vokabular.filter((x) => x.wort !== v.wort))} title="Wort entfernen"
              style={{ background: "none", border: "none", color: T.gefahr, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>
        ))}
    </div>
  );
}

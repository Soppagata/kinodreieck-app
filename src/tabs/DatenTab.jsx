import { useMemo, useRef, useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { MasterImport } from "../components/MasterImport.jsx";
import { IconDelete, IconExport, Klappe, SegmentedControl } from "../components/ui.jsx";
import { FeldHinweis } from "../components/FeldHinweis.jsx";
import { StreamingEinstellungen } from "../components/StreamingEinstellungen.jsx";
import { RestoreImport } from "../components/RestoreImport.jsx";
import { UeberKinodreieck } from "../components/Erklaerstuecke.jsx";
import { StapelImport } from "../components/StapelImport.jsx";
import { KontoBereich } from "../components/KontoBereich.jsx";
import { GeschmackBereich } from "../components/GeschmackBereich.jsx";
import { DatenschutzUebersicht, KontoLoeschung, SupportDaten } from "../components/PrivatePilotOps.jsx";
import { alleStimmungen, bekannteWerte, sigAusSchema } from "../lib/finder.js";
import { hatOfflineDefinition, vokabularEintragAusDeutung } from "../lib/vokabular.js";
/* Ohne diesen Import warf der Einstellungs-Tab bei KI=an einen
   ReferenceError. Die App hat keine Fehlergrenze — React raeumt den Baum ab,
   der Nutzer sieht eine weisse Seite. Durch alle Gates gerutscht, weil kein
   Test `DatenTab` je gerendert hat; `geschmackui_test.mjs` tut es jetzt. */
import { KI_FUNKTIONEN, istEinzelfunktionAn } from "../lib/kiSchalter.js";
import { ERROR_CODES } from "../services/errors.js";
import { errorText } from "../services/errors.js";
import { aiService } from "../services/ai.js";

const normalisiereAnzeige = (wert) => {
  if (typeof wert !== "string") return "";
  return wert.trim();
};

const normalisiereTagDedupe = (wert) => {
  if (typeof wert !== "string") return "";
  return wert.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
};

/* ================= EINSTELLUNGEN =================
   Tester-Oberfläche in stabiler Reihenfolge. Persönliche Daten, der gemeinsame
   Katalog und manuelle Wartung bleiben bewusst getrennte Bereiche. */
export function DatenTab({
  master, masterMeta, masterHerkunft, nachtragCount,
  exportMaster, importMaster, importProgramm, importNonstop,
  programm, clearProgrammCache,
  startWahl = null, demoAktiv = false, onStartWahl,
  katalogVerbunden = false, onKatalogVerbinden, onKatalogRefresh, onTechnikKatalogRefresh,
  programmInfo = null,
  ungesichertMaster = false, ungesichertArtikel = false,
  einstellungen = {}, setzeEinstellung, waehleModus, backupGesamt,
  /* Etappe 7: Der KI-Schalter liegt NICHT in `einstellungen` (das ist ein
     Sync-Topf), sondern in `kd:ki`. Stand und Setter kommen deshalb als
     eigene Props von App. */
  kiStand = { global: null, funktionen: {} }, onKiGlobal, onKiFunktion,
  /* Der persönliche KI-Pfad verlangt ein bereites Konto mit der Fähigkeit
     `personalAi`. App besitzt den reaktiven Sitzungssnapshot und reicht nur
     diese fachliche Aussage weiter — DatenTab soll weder Auth-Zustände
     nachbauen noch erst nach dem Ausfüllen des Freitextformulars scheitern. */
  kiProfilFaehig = false,
  vokabular = [], saveVokabular,
  speicher = null,
  ai = aiService,
  streamingBekannt, streamingEntdecken, streamingInfo = null, auswahl, toggleQuelle,
  datenGesperrt = false,
  offeneFlags = 0, migriereMustwatch, migrationsBericht = null,
  importiereBesitz, besitzImportBericht = null,
  artikelListe = [], autorName = "", saveAutorName, uebernehmePaket, setErr = () => {},
  addFilm, addFilme,
  onKontoDatenGeaendert,
  kontoAktiv = false,
  kontoModus = false,
  kontoId = "",
  kontoEmail = "",
  onKontoGeloescht,
  ownerTechnikBestaetigt = false,
  einzeldatei = typeof location !== "undefined" && location.protocol === "file:",
}) {
  const sicherungOffen = ungesichertMaster || ungesichertArtikel;
  /* Hinterlegte Zugangsdaten heißen seit der Zugriffstrennung NICHT, dass
     das Programm auch da ist (anon sieht die Live-Zeilen nicht). Beides wird
     deshalb getrennt gemeldet. */
  const programmStatus = !programmInfo
    ? { ok: false, text: "noch nicht geladen" }
    : programmInfo.code === ERROR_CODES.INVALID_KEY ? { ok: false, text: "Zugangsschlüssel wird abgelehnt" }
    : programmInfo.code === ERROR_CODES.NO_DEMO_DATA ? { ok: false, text: "noch keine Beispieldaten veröffentlicht" }
    : programmInfo.anmeldungNoetig ? { ok: false, text: "Anmeldung nötig" }
    : programmInfo.fehler ? { ok: false, text: "nicht geladen" }
    : programmInfo.abgelaufen ? { ok: false, text: "abgelaufener Schnappschuss" }
    : programmInfo.ausCache ? { ok: false, text: "aus dem Browser-Speicher" }
    : programm?.status?.archiviert ? { ok: false, text: "archiviertes Offline-Beispiel" }
    : programmInfo.variante === "demo" ? { ok: true, text: "Demo-Schnappschuss" }
    /* Der Notfallweg beschreibt sich selbst: ein eingespieltes Programm ist da,
       stammt aber nicht aus der Datenbank — „aktuell geladen" wäre die Aussage
       eines Datenbankstands, den es hier nicht gibt. */
    : programmInfo.art === "manuell" ? { ok: true, text: "manuell eingespielt" }
    : { ok: true, text: "aktuell geladen" };
  const verbindungBrauchtHilfe = !katalogVerbunden
    || programmInfo?.code === ERROR_CODES.INVALID_KEY
    || programmInfo?.anmeldungNoetig === true
    || !!programmInfo?.fehler
    || programmInfo?.abgelaufen === true
    || programmInfo?.ausCache === true;
  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: T.wolfram, margin: "0 0 8px" };
  const mono = { fontFamily: "'Space Mono', monospace", fontSize: 11, color: T.rauch };
  const kasten = { background: T.saalHoch, borderRadius: 6, padding: "16px 18px" };
  const [eggOffen, setEggOffen] = useState(false);
  const [ueberOffen, setUeberOffen] = useState(false);

  /* Dieselbe Wertelisten-Logik wie die intelligente Suche. `bekannteWerte`
     bewahrt die echte Anzeigeschreibweise und entdoppelt robust; eine zweite
     Genre-Normalisierung hier würde früher oder später abweichen.

     Die Masterliste ist die verlässlichste Quelle. Programm und Streaming
     ergänzen sie, weil ein neues/noch leeres Konto sonst trotz geladenem
     Katalog keine KI-Extraktion starten könnte. Die Quellen führen das Feld
     historisch unter `genre`, `genres` oder `g`, deshalb wird diese kleine
     Formgrenze hier einmal tolerant gelesen. */
  const bekannteGenres = useMemo(() => {
    const zusaetzlich = [];
    const nimm = (quelle) => {
      const filme = Array.isArray(quelle) ? quelle
        : Array.isArray(quelle?.titel) ? quelle.titel
        : Array.isArray(quelle?.filme) ? quelle.filme
        : [];
      for (const film of filme) {
        const genres = film?.genre ?? film?.genres ?? film?.g;
        if (Array.isArray(genres)) zusaetzlich.push(...genres);
        else if (typeof genres === "string") zusaetzlich.push(genres);
      }
    };
    nimm(programm);
    nimm(streamingBekannt);
    nimm(streamingEntdecken);
    return bekannteWerte(Array.isArray(master) ? master : [], zusaetzlich).genres;
  }, [master, programm, streamingBekannt, streamingEntdecken]);

  const bekannteTags = useMemo(() => {
    const ausgang = [];
    const gesehen = new Set();
    const genresSet = new Set((bekannteGenres || [])
      .map((e) => normalisiereTagDedupe(e))
      .filter(Boolean));

    for (const eintrag of Array.isArray(master) ? master : []) {
      const rohTags = Array.isArray(eintrag?.tags) ? eintrag.tags : [];
      for (const tag of rohTags) {
        const sauber = normalisiereAnzeige(tag);
        if (!sauber) continue;
        const deduplikat = normalisiereTagDedupe(sauber);
        if (genresSet.has(deduplikat) || gesehen.has(deduplikat)) continue;
        gesehen.add(deduplikat);
        ausgang.push(sauber);
      }
    }

    return ausgang;
  }, [bekannteGenres, master]);

  /* Im hellen Grundmodus öffnet der unklare Knopf Showa, im dunklen Neon Noir.
     Bei aktivem Spezialmodus bleibt sein Ziel stabil, damit derselbe Knopf ihn
     wieder beendet. Namen und Bedingungen werden in der UI nicht verraten. */
  const eggZiel = einstellungen.modus || ((einstellungen.basisTheme || einstellungen.theme) === "hell" ? "showa" : "neon-noir");
  const eggAktiv = einstellungen.modus === eggZiel;
  const eggLabel = eggZiel === "showa" ? "Classix" : "Schon kuhl";
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
              <div className="kd-kompakt" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>Startbereich</span>
                <select value={einstellungen.startTab || "start"} onChange={(e) => setzeEinstellung("startTab", e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                  {[["start", "Start (Dashboard)"], ["kino", "Kino"], ["mediathek", "Mediathek"], ["streaming", "Streaming"], ["blog", "Entdecken"]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </Klappe>
      )}

      {/* Betriebsdetails existieren nur für die frisch serverbestätigte
          Ownerrolle. Die frühere Demo-Löschfläche wird nicht mehr projiziert;
          normale Nutzer erhalten bei fehlender oder gestörter Verbindung
          ausschließlich einen kleinen, verständlichen Recoveryweg. */}
      {ownerTechnikBestaetigt && <Klappe titel="Datenmodus & Verbindung">
        <div style={kasten}>
          <h2 style={h2}>{demoAktiv || startWahl === "demo" ? "Demo-Modus" : "Clean Mode"}</h2>
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
            Kino- und Streamingprogramm sind ein gemeinsamer, schreibgeschützter Katalog. Deine Mediathek, Merkliste und Settings bleiben geschützt. {einzeldatei ? "Datenquelle" : "Datenbankzugang"}: <strong style={{ color: katalogVerbunden ? T.wolfram : T.gefahr }}>{einzeldatei ? "eingebettete Offline-Beispiele" : katalogVerbunden ? "Zugangsdaten hinterlegt" : "nicht eingerichtet"}</strong>.
            {" "}Kinoprogramm: <strong style={{ color: programmStatus.ok ? T.wolfram : T.gefahr }}>{programmStatus.text}</strong>.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onKatalogVerbinden && <button style={btnStyle(false)} onClick={onKatalogVerbinden}>{einzeldatei ? "Online-Katalog verbinden" : katalogVerbunden ? "Datenbankzugang prüfen/ändern" : "Datenbank verbinden"}</button>}
            {onStartWahl && !demoAktiv && !(master && master.length) && <button style={btnStyle(false)} onClick={onStartWahl}>Startmodus wählen</button>}
          </div>
        </div>
      </Klappe>}
      {!ownerTechnikBestaetigt && verbindungBrauchtHilfe && <Klappe titel="Verbindung wiederherstellen">
        <div style={kasten}>
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
            Das Kinoprogramm ist derzeit <strong style={{ color: T.gefahr }}>{programmStatus.text}</strong>. Deine persönlichen Inhalte bleiben davon unberührt.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onKatalogVerbinden && <button style={btnStyle(false)} onClick={onKatalogVerbinden}>{einzeldatei ? "Online-Katalog verbinden" : "Datenbankzugang prüfen"}</button>}
            {onKatalogRefresh && <button style={btnStyle(false)} onClick={onKatalogRefresh}>Katalog neu laden</button>}
          </div>
        </div>
      </Klappe>}

      {/* 2b — Konto & Geräte-Sync (Etappe 3) */}
      {/* KI-Funktionen (Etappe 7). Steht VOR dem Konto-Block, weil die
          Grundentscheidung ohne Konto getroffen wird und den Rest praegt.
          Der Schalter ist geraetelokal (kd:ki) -- deshalb der Hinweis, dass
          er nicht mitreist. */}
      <Klappe titel="KI-Funktionen">
        <div style={kasten}>
          <p style={{ ...mono, margin: "0 0 10px", lineHeight: 1.6 }}>
            Ohne KI funktioniert alles — Suche, Sammlung, Bewertungen — vollständig
            und kostenlos auf diesem Gerät. Mit KI kommen Deutungs- und
            Profil-Funktionen dazu.
          </p>
          <div className="kd-einstellzeile" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ ...mono, width: 110, textTransform: "uppercase" }}>KI insgesamt</span>
            <SegmentedControl style={{ marginBottom: 0, flex: 1, minWidth: 160 }}
              value={kiStand.global === true ? "an" : "aus"}
              onChange={(id) => onKiGlobal?.(id === "an")}
              options={[{ id: "an", label: "Mit KI" }, { id: "aus", label: "Ohne KI" }]} />
          </div>

          {/* Einzelschalter nur bei offenem Dach: Sie unter einem
              geschlossenen Dach anzuboten haette suggeriert, sie wuerden
              etwas bewirken. */}
          {kiStand.global === true && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 4, borderLeft: "2px solid " + T.saalHoch }}>
              {Object.entries(KI_FUNKTIONEN).map(([id, f]) => (
                <div key={id} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <SegmentedControl style={{ marginBottom: 0, minWidth: 120 }}
                    value={istEinzelfunktionAn(id, kiStand) ? "an" : "aus"}
                    onChange={(w) => onKiFunktion?.(id, w === "an")}
                    options={[{ id: "an", label: "An" }, { id: "aus", label: "Aus" }]} />
                  <div style={{ flex: "1 1 220px" }}>
                    <div style={{ ...mono, color: T.leinwand }}>{f.label}</div>
                    <div style={{ ...mono, opacity: 0.75 }}>{f.beschreibung}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p style={{ ...mono, opacity: 0.75, margin: "12px 0 0", lineHeight: 1.6 }}>
            Diese Wahl gilt nur für dieses Gerät und reist nicht mit dem Konto mit —
            auf einem zweiten Gerät entscheidest du erneut. KI-Funktionen brauchen
            außerdem ein Konto.
          </p>
        </div>
      </Klappe>

      {/* Geschmacksprofil (Etappe 7, Phase 2c). Steht NACH dem KI-Block,
          weil der Schalter die Rahmenentscheidung ist — aber ausdrücklich
          NICHT unter ihm: Der deterministische Weg ist vollwertig und muss
          auch bei KI=aus erreichbar sein. Ein Profil-Block, der sich mit
          dem KI-Schalter versteckt, hätte den Abnahme-Anker der Etappe
          („ein KI-loser Start ist vollwertig") in der Oberfläche
          zurückgenommen. */}
      <Klappe titel="Geschmacksprofil">
        <div style={kasten}>
          <GeschmackBereich
            bekannteTitel={Array.isArray(master) ? master : []}
            bekannteGenres={bekannteGenres}
            bekannteTags={bekannteTags}
            artikelListe={artikelListe}
            vokabular={vokabular}
            kontoId={kontoId}
            onVokabularSpeichern={saveVokabular}
            speicher={speicher}
            ai={ai}
            kiAktiv={kiProfilFaehig
              && kiStand.global === true
              && kiStand.funktionen?.profil !== false
              && bekannteGenres.length > 0}
            kiGeraeteweiseAus={kiStand.global !== true}
            onFehler={(e) => setErr?.(e)}
          />
        </div>
      </Klappe>

      <Klappe titel="Konto & Geräte-Sync">
        <div style={kasten}>
          <h2 style={h2}>Zwischen Handy und Rechner</h2>
          <KontoBereich demoAktiv={demoAktiv}
            onDatenGeaendert={onKontoDatenGeaendert} onBackupWunsch={backupGesamt} />
        </div>
      </Klappe>

      {kontoModus && <Klappe titel="Konto löschen">
        <div style={kasten}>
          <KontoLoeschung accountActive={kontoAktiv} accountId={kontoId} accountEmail={kontoEmail}
            exportBeforeDelete={backupGesamt} onAccountDeleted={onKontoGeloescht} />
        </div>
      </Klappe>}

      <Klappe titel="Stapelimport" tour="ki-ingestion">
        <div style={kasten}>
          <h2 style={h2}>Eigene Mediathek stapelweise erfassen</h2>
          <StapelImport master={master || []}
            addFilm={addFilm} addFilme={addFilme} autorName={autorName}
            kiAktiv={kiProfilFaehig && kiStand.global === true && kiStand.funktionen?.stapelimport !== false}
            setErr={setErr} />
        </div>
      </Klappe>

      {/* 3 — Masterliste */}
      <div className="kd-nur-desktop">
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
      </div>

      {/* 4 — Backup */}
      <Klappe id="gesamt-backup" titel="Gesamt-Backup" offen={sicherungOffen}
        markiert={sicherungOffen} status={sicherungOffen ? "Sicherung offen" : null}>
        <div style={kasten}>
          {sicherungOffen && (
            <p role="status" data-tour="daten-waechter" style={{ color: T.wolfram, fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
              Es gibt ungesicherte Änderungen im Browser. Ein Gesamt-Backup schützt Mediathek, Blog, Listen und Settings gemeinsam.
            </p>
          )}
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>Lädt den vollständigen persönlichen App-Stand als Datei herunter. Der gemeinsame Kino- und Streamingkatalog wird nicht dupliziert.</p>
          {backupGesamt && <button style={{ ...btnStyle(true), display: "inline-flex", alignItems: "center", gap: 8 }} onClick={backupGesamt}><IconExport size={16} />Gesamt-Backup herunterladen</button>}
          <FeldHinweis feld="backup" />
          {/* Der Download ist gerade am Handy wichtig; nur das riskantere
              vollständige Einspielen einer Datei bleibt Desktop-Wartung. */}
          <div className="kd-nur-desktop" style={{ marginTop: 14 }}><RestoreImport ohneKopf /></div>
        </div>
      </Klappe>

      {/* 5 — Streaming-Quellen */}
      {toggleQuelle && <StreamingEinstellungen bekannt={streamingBekannt} entdecken={streamingEntdecken}
        katalogInfo={streamingInfo} auswahl={auswahl} toggleQuelle={toggleQuelle} teil="quellen" datenGesperrt={datenGesperrt} />}

      {/* 6 — Such-Vokabular */}
      {saveVokabular && (
        <Klappe titel="KI-Vokabular" tour="daten-vokabular">
          <VokabularEditor vokabular={vokabular} saveVokabular={saveVokabular} mono={mono}
            master={master || []} bekannteGenres={bekannteGenres}
            ai={ai}
            kiAktiv={kiProfilFaehig && kiStand.global === true && kiStand.funktionen?.suche !== false}
            kiSperrgrund={kiStand.global !== true
              ? "Aktiviere zuerst KI-Funktionen. Bereits gespeicherte Wörter funktionieren trotzdem offline."
              : kiStand.funktionen?.suche === false
                ? "Aktiviere die KI-Suche. Bereits gespeicherte Wörter funktionieren trotzdem offline."
                : !kiProfilFaehig
                  ? "Zum Deuten neuer Wörter brauchst du ein angemeldetes KI-fähiges Konto. Gespeicherte Wörter bleiben offline verfügbar."
                  : null} />
        </Klappe>
      )}

      {/* Technische DOM-Zweige entstehen ausschließlich für die bestätigte
          Ownerrolle; bloßes Verbergen per CSS wäre keine Rechteprojektion. */}
      {ownerTechnikBestaetigt && <>
      <Klappe titel="Technik & Support">
        <div style={kasten}><SupportDaten ownerBestaetigt={ownerTechnikBestaetigt} /></div>
      </Klappe>
      <Klappe titel="Kinoprogramm-Status">
        <div style={kasten}>
          {programm ? (() => {
            const rohStand = programmInfo?.stand || programm.stand || null;
            const stand = rohStand ? new Date(rohStand) : null;
            const demoStand = programmInfo?.variante === "demo" || programmInfo?.art === "snapshot" || demoAktiv || startWahl === "demo";
            const s = programm.status || {};
            const details = String(programm.quelle_hinweis || "").split(" · ").filter(Boolean);
            return (
              <>
                {demoStand && (
                  <p style={{ margin: "0 0 12px", color: T.wolfram, fontSize: 13, lineHeight: 1.55 }}>
                    <strong>Öffentliche Beispieldaten.</strong> Der unten ausgewiesene Stand ist bewusst eingefroren. Ein archiviertes Offline-Beispiel zeigt synthetische alte Termine und ausdrücklich kein laufendes Kinoprogramm; das aktuelle Konto-Programm wird nach der Anmeldung geladen.
                  </p>
                )}
                <dl className="kd-statusliste">
                  <div><dt>Betriebsart</dt><dd>{demoStand ? "Demo" : programmInfo?.art === "manuell" ? "Manueller Notfallimport" : "Aktuelles Konto-Programm"}</dd></div>
                  <div><dt>Stand</dt><dd style={{ color: programmInfo?.abgelaufen ? T.gefahr : undefined }}>{stand && !Number.isNaN(stand.getTime())
                    ? stand.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "unbekannt"}</dd></div>
                  <div><dt>Quelle</dt><dd>{s.quelle || details[0] || "unbekannt"}</dd></div>
                  <div><dt>Zeitraum</dt><dd>{s.zeitraum || details.find((x) => x.startsWith("Zeitraum "))?.replace(/^Zeitraum /, "") || "nicht gemeldet"}</dd></div>
                  <div><dt>Anzeige</dt><dd>{Number.isFinite(s.angezeigt) && Number.isFinite(s.gesamt)
                    ? `${s.angezeigt} von ${s.gesamt} Filmen · ${s.fensterTage || 4} Tage`
                    : details.find((x) => x.startsWith("Anzeige:"))?.replace(/^Anzeige:\s*/, "") || `${programm.filme?.length || 0} Filme`}</dd></div>
                  <div><dt>Speicher</dt><dd>{s.archiviert ? "eingebettetes Archivbeispiel" : programmInfo?.art === "manuell" ? "manuell eingespielt" : programmInfo?.ausCache ? "Browser-Cache" : "frisch aus dem Katalog"}{programmInfo?.abgelaufen ? " · abgelaufen" : ""}</dd></div>
                </dl>
              </>
            );
          })() : <p style={{ ...mono, margin: 0 }}>Noch kein Kinoprogramm geladen.</p>}
        </div>
      </Klappe>
      <StreamingEinstellungen bekannt={streamingBekannt} entdecken={streamingEntdecken}
        katalogInfo={streamingInfo} auswahl={auswahl} toggleQuelle={toggleQuelle} teil="status" datenGesperrt={datenGesperrt} />

      {/* 8 — Erweitert, direkt nach dem Katalog-Status; Refresh gehört hinein. */}
      <div className="kd-nur-desktop" data-tour="erweitert">
        <Klappe titel="Erweitert — manuelle Aktualisierung & Wartung">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={kasten}>
              <h2 style={h2}>Katalog aus der Datenbank</h2>
              <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>Lädt Kino- und Streamingstand neu, ohne selbst Watchmode-Requests auszulösen.</p>
              {onTechnikKatalogRefresh && <button style={btnStyle(true)} onClick={onTechnikKatalogRefresh}>Katalog jetzt neu laden</button>}
            </div>
            <div style={kasten}>
              <h2 style={h2}>Programm manuell importieren</h2>
              <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 10px", lineHeight: 1.6 }}>Nur als Notfallweg: einen Programm-Snapshot oder gespeichertes Nonstop-HTML lokal einspielen.</p>
              {importProgramm && <div data-tour="programm-import"><MasterImport onImport={importProgramm} hasMaster={!!programm}
                labelNeu="Programm-Snapshot importieren" labelErsetzen="Programm-Snapshot ersetzen"
                hinweis='Programm-JSON einfügen ({"erstellt":…, "data":{"filme":[…]}})' /></div>}
              {importNonstop && <div style={{ marginTop: 12 }}><MasterImport onImport={importNonstop} hasMaster={!!programm}
                labelNeu="Nonstop-Seite (HTML) laden" labelErsetzen="Nonstop-Seite (HTML) laden"
                hinweis="HTML-Quelltext der Nonstop-Programmseite einfügen" accept=".html,.htm,.txt" /></div>}
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
              {clearProgrammCache && <button style={btnStyle(false)} onClick={clearProgrammCache}>Programm-Cache leeren</button>}
            </div>
          </div>
        </Klappe>
      </div>
      </>}

      {/* 9 — Rechtliches + absichtlich unklarer versteckter Modusknopf. */}
      <Klappe titel="Über & Rechtliches">
        <div style={kasten}>
          <p style={{ fontSize: 12, color: T.rauch, lineHeight: 1.7, margin: 0 }}>
            Kinodreieck — privates, nicht-kommerzielles Projekt. Persönliche Daten liegen lokal und bei aktiviertem Kontospeicher zusätzlich im eigenen Konto; die App verwendet keine allgemeine Telemetrie. Programmdaten: film.at &amp; nonstopkino.at · Streaming-Kataloge: Watchmode. Alle Angaben ohne Gewähr — verbindlich sind die Kino- bzw. Anbieterseiten. Bewertungen und Texte sind persönliche Meinungen ihrer Autoren.
            <br />© {new Date().getFullYear()} <span onClick={() => setEggOffen((v) => !v)} title="…" style={{ color: T.wolfram, cursor: "pointer", textDecorationLine: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>Max</span> — Nutzung auf eigene Verantwortung.
          </p>
          {eggOffen && waehleModus && <div style={{ marginTop: 12 }}><button onClick={eggToggle} style={btnStyle(eggAktiv)}>{eggLabel}</button></div>}
          <div style={{ marginTop: 14 }}>
            <button style={{ ...btnStyle(false), fontSize: 13 }} onClick={() => setUeberOffen((v) => !v)}>{ueberOffen ? "Anleitung zuklappen" : "Über Kinodreieck & Anleitung"}</button>
            {typeof location !== "undefined" && location.protocol !== "file:" && (
              <a className="kd-nur-desktop" href={import.meta.env.BASE_URL + "download/"} style={{ ...btnStyle(false), display: "inline-block", marginLeft: 8, fontSize: 13, textDecoration: "none" }}>
                Einzeldatei herunterladen
              </a>
            )}
            {ueberOffen && <UeberKinodreieck />}
          </div>
          <details style={{ marginTop: 18 }}>
            <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: T.rauch, fontSize: 13 }}>Datenschutz & Datenübersicht</summary>
            <div style={{ marginTop: 10 }}><DatenschutzUebersicht accountActive={kontoAktiv} /></div>
          </details>
        </div>
      </Klappe>
    </section>
  );
}

function VokabularEditor({
  vokabular, saveVokabular, mono, master, bekannteGenres, kiAktiv, kiSperrgrund,
  ai = aiService,
}) {
  const [wort, setWort] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [vorschlag, setVorschlag] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [schreiben, setSchreiben] = useState(false);
  const [fehler, setFehler] = useState("");
  const [status, setStatus] = useState("");
  const speicherLock = useRef(false);

  const deuten = async () => {
    const w = wort.trim().toLowerCase();
    const bedeutung = beschreibung.trim();
    if (!kiAktiv || !w || !bedeutung || laeuft) return;
    if (bedeutung.length > 300) {
      setFehler(`Die Beschreibung ist mit ${bedeutung.length} Zeichen zu lang (höchstens 300).`);
      return;
    }
    setLaeuft(true); setFehler(""); setStatus(""); setVorschlag(null);
    try {
      const listen = bekannteWerte(master || [], bekannteGenres || []);
      const antwort = await ai.runTask("intelligent-search", { suchsatz: bedeutung, listen });
      const deutung = sigAusSchema(antwort?.data, master || [], bekannteGenres || []);
      const eintrag = vokabularEintragAusDeutung({
        wort: w,
        beschreibung: bedeutung,
        deutung,
        master,
        stimmungen: alleStimmungen(),
      });
      if (!hatOfflineDefinition(eintrag)) {
        setFehler("Die KI konnte daraus noch keine verlässliche Offline-Regel bilden. Beschreibe Genres, Stimmung oder konkrete Beispiele etwas genauer.");
      } else setVorschlag(eintrag);
    } catch (error) {
      setFehler(errorText(error) + " Es wurde nichts gespeichert und es gibt keinen automatischen Wiederholungsversuch.");
    } finally {
      setLaeuft(false);
    }
  };
  const speichern = async () => {
    if (speicherLock.current || schreiben || !hatOfflineDefinition(vorschlag) || typeof saveVokabular !== "function") return;
    speicherLock.current = true;
    setSchreiben(true);
    setFehler("");
    setStatus("Definition wird gespeichert …");
    try {
      const ok = await saveVokabular([...vokabular.filter((v) => v.wort !== vorschlag.wort), vorschlag]);
      if (ok) {
        setWort("");
        setBeschreibung("");
        setVorschlag(null);
        setStatus("Definition gespeichert.");
        return;
      }
      setStatus("");
      setFehler("Die Definition konnte nicht gespeichert werden. Bitte erneut versuchen.");
    } catch {
      setStatus("");
      setFehler("Die Definition konnte nicht gespeichert werden. Bitte erneut versuchen.");
    } finally {
      setSchreiben(false);
      speicherLock.current = false;
    }
  };
  return (
    <div style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
      {kiAktiv && (
        <>
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
            Gib der KI deinen eigenen Ausdruck und erkläre frei, was er für dich bedeutet. Die KI deutet ihn genau einmal. Gespeichert wird danach nur eine kleine lokale Genre-/Tag-Regel — die Suche verwendet sie deterministisch und offline.
          </p>
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            <input value={wort} onChange={(e) => { setWort(e.target.value); setVorschlag(null); setStatus(""); }}
              placeholder="Begriff (z. B. kuhl)" maxLength={40}
              disabled={schreiben}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            <textarea value={beschreibung} onChange={(e) => { setBeschreibung(e.target.value); setVorschlag(null); setStatus(""); }}
              placeholder="Was bedeutet der Begriff für dich? Beispiele, Stimmung, Genres …"
              disabled={schreiben}
              maxLength={300} rows={4} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button style={btnStyle(true)} onClick={deuten}
                disabled={laeuft || schreiben || !wort.trim() || !beschreibung.trim()}>
                {laeuft ? "KI deutet …" : "Mit KI deuten"}
              </button>
              <span style={mono}>ein bewusster KI-Aufruf · keine automatische Wiederholung</span>
            </div>
          </div>
        </>
      )}
      {kiSperrgrund && <p style={{ ...mono, color: T.warum, lineHeight: 1.6 }}>{kiSperrgrund}</p>}
      {fehler && <p role="alert" style={{ ...mono, color: T.gefahr, lineHeight: 1.6 }}>{fehler}</p>}
      {status && <p role="status" aria-live="polite" style={{ ...mono, lineHeight: 1.6, color: T.wolfram }}>{status}</p>}
      {vorschlag && (
        <div style={{ border: "1px solid " + T.wolfram, borderRadius: 6, padding: 12, margin: "12px 0" }}>
          <strong style={{ color: T.wolfram }}>{vorschlag.wort}</strong>
          {vorschlag.interpretation && <p style={{ fontSize: 13, margin: "5px 0 8px", lineHeight: 1.5 }}>{vorschlag.interpretation}</p>}
          <p style={{ ...mono, margin: "0 0 10px", lineHeight: 1.6 }}>
            Offline-Regel: {[...vorschlag.genres, ...vorschlag.tags].join(" · ")}
          </p>
          <button style={btnStyle(true)}
            disabled={schreiben || !hatOfflineDefinition(vorschlag)}
            onClick={speichern}>
            {schreiben ? "Definition wird gespeichert …" : "Definition speichern"}
          </button>
        </div>
      )}
      {vokabular.length === 0 ? <p style={mono}>Noch keine eigenen Wörter.</p> : vokabular.map((v) => (
        <div key={v.wort} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: "'Space Mono', monospace", fontSize: 12, padding: "7px 0", color: T.leinwandTief }}>
          <strong style={{ color: T.wolfram }}>{v.wort}</strong>
          <span style={{ flex: 1 }}>{v.beschreibung ? v.beschreibung + " · " : ""}{v.genres?.length ? "Genres: " + v.genres.join(", ") : ""}{v.genres?.length && v.tags?.length ? " · " : ""}{v.tags?.length ? "Tags: " + v.tags.join(", ") : ""}</span>
          <button onClick={() => saveVokabular(vokabular.filter((x) => x.wort !== v.wort))}
            aria-label={`Vokabel ${v.wort} entfernen`} title="Wort entfernen"
            style={{ background: "none", border: "none", color: T.gefahr, cursor: "pointer", padding: 3 }}><IconDelete size={14} /></button>
        </div>
      ))}
    </div>
  );
}

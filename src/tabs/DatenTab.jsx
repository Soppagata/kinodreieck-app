import { useId, useMemo, useRef, useState } from "react";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import { IconDelete, IconExport, Klappe, SegmentedControl } from "../components/ui.jsx";
import { FeldHinweis } from "../components/FeldHinweis.jsx";
import { StreamingEinstellungen } from "../components/StreamingEinstellungen.jsx";
import { UeberKinodreieck } from "../components/Erklaerstuecke.jsx";
import { KontoBereich } from "../components/KontoBereich.jsx";
import { GeschmackBereich } from "../components/GeschmackBereich.jsx";
import { KatalogAuditStatus } from "../components/KatalogAuditStatus.jsx";
import { DatenschutzUebersicht, KontoDatenrechte } from "../components/PrivatePilotOps.jsx";
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
import { runtimeConfig } from "../config/runtime.js";

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
  master,
  programm,
  demoAktiv = false,
  katalogVerbunden = false, onKatalogVerbinden, onKatalogRefresh,
  programmInfo = null,
  ungesichertMaster = false, ungesichertArtikel = false,
  einstellungen = {}, setzeEinstellung, waehleModus,
  sicherheitskopieGeraet, kontoExportVollstaendig,
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
  streamingBekannt, streamingEntdecken, streamingInfo = null, auswahl, auswahlGeladen = true,
  streamingNeu, toggleQuelle,
  datenGesperrt = false,
  artikelListe = [], setErr = () => {},
  onKontoDatenGeaendert,
  kontoAktiv = false,
  kontoModus = false,
  kontoId = "",
  kontoEmail = "",
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
  const verbindungBrauchtHilfe = !einzeldatei && (!katalogVerbunden
    || programmInfo?.code === ERROR_CODES.INVALID_KEY
    || programmInfo?.anmeldungNoetig === true
    || !!programmInfo?.fehler
    || programmInfo?.abgelaufen === true
    || programmInfo?.ausCache === true);
  const h2 = { fontFamily: "'Barlow Condensed', sans-serif", fontSize: "calc(22px * var(--kd-schriftfaktor, 1))", fontWeight: 600, lineHeight: 1.2, letterSpacing: 0, textTransform: "none", color: T.leinwand, margin: "0 0 8px" };
  const mono = { fontFamily: "'Space Grotesk', sans-serif", fontSize: "calc(12px * var(--kd-schriftfaktor, 1))", color: T.rauch };
  const kasten = { background: T.saalHoch, borderRadius: "var(--kd-radius-karte)", padding: "16px" };
  const showKatalogbestand = runtimeConfig.appEnvironment !== "production";
  const [eggOffen, setEggOffen] = useState(false);
  const eggBereichId = useId();

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

  /* Der versteckte Knopf richtet sich nach dem Grundtheme. Im Spezialmodus
     bleibt sein Ziel stabil, damit derselbe Knopf zum Grundtheme zurückführt. */
  const eggZiel = einstellungen.modus || ((einstellungen.basisTheme || einstellungen.theme) === "hell" ? "showa" : "neon-noir");
  const eggAktiv = einstellungen.modus === eggZiel;
  const eggLabel = eggZiel === "showa" ? "Classix" : "Schon kuhl";
  const eggToggle = () => {
    if (!waehleModus) return;
    if (eggAktiv) waehleModus(einstellungen.basisTheme === "hell" ? "foyer" : "saal");
    else waehleModus(eggZiel);
  };

  return (
    <section className="kd-daten-tab">
      {/* 1 — Darstellung */}
      {setzeEinstellung && (
        <Klappe titel="Darstellung & Verhalten" offen>
          <div style={kasten}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="kd-einstellzeile">
                <span style={{ ...mono }}>Erscheinung</span>
                <SegmentedControl className="kd-einstelloptionen kd-einstelloptionen--2" style={{ marginBottom: 0 }}
                  value={einstellungen.modus ? null : (einstellungen.theme === "hell" ? "foyer" : "saal")}
                  onChange={(id) => waehleModus?.(id)}
                  options={[{ id: "saal", label: "Saal (dunkel)" }, { id: "foyer", label: "Foyer (hell)" }]} />
              </div>
              <div className="kd-einstellzeile">
                <span style={{ ...mono }}>Schriftgröße</span>
                <SegmentedControl className="kd-einstelloptionen kd-einstelloptionen--3" style={{ marginBottom: 0 }}
                  value={einstellungen.schrift || "normal"}
                  onChange={(id) => setzeEinstellung("schrift", id)}
                  options={[{ id: "klein", label: "Klein" }, { id: "normal", label: "Normal" }, { id: "gross", label: "Groß" }]} />
              </div>
              <div className="kd-kompakt kd-startbereich-zeile">
                <span style={{ ...mono }}>Startbereich</span>
                <select value={einstellungen.startTab || "start"} onChange={(e) => setzeEinstellung("startTab", e.target.value)} style={inputStyle}>
                  {[["start", "Start (Dashboard)"], ["kino", "Kino"], ["mediathek", "Mediathek"], ["streaming", "Streaming"], ["blog", "Entdecken"]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
              <label className="kd-einstellcheck kd-touch-checkbox">
                <input type="checkbox" checked={einstellungen.entdeckenTaeglich === true}
                  onChange={(event) => setzeEinstellung("entdeckenTaeglich", event.target.checked)} />
                <span><strong>Täglich neue Entdecken-Auswahl</strong><small>Wählt pro Tag stabil aus den 20 besten Passungen.</small></span>
              </label>
            </div>
          </div>
        </Klappe>
      )}

      {verbindungBrauchtHilfe && <Klappe titel="Verbindung wiederherstellen">
        <div style={kasten}>
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>
            Das Kinoprogramm ist derzeit <strong style={{ color: T.gefahr }}>{programmStatus.text}</strong>. Deine persönlichen Inhalte bleiben davon unberührt.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onKatalogVerbinden && <button style={btnStyle(false)} onClick={onKatalogVerbinden}>Datenbankzugang prüfen</button>}
            {onKatalogRefresh && <button style={btnStyle(false)} onClick={onKatalogRefresh}>Katalog neu laden</button>}
          </div>
        </div>
      </Klappe>}

      {/* 2 — Streaming-Anbieter */}
      {toggleQuelle && <StreamingEinstellungen bekannt={streamingBekannt} entdecken={streamingEntdecken}
        katalogInfo={streamingInfo} auswahl={auswahl} auswahlGeladen={auswahlGeladen}
        toggleQuelle={toggleQuelle} teil="quellen" datenGesperrt={datenGesperrt} />}
      {showKatalogbestand && <Klappe titel="Streaming-Katalogbestand">
        <div style={kasten}>
          <KatalogAuditStatus bekannt={streamingBekannt} entdecken={streamingEntdecken}
            auswahl={auswahl} auswahlGeladen={auswahlGeladen} streamingNeu={streamingNeu} />
        </div>
      </Klappe>}

      {/* 3 — Personalisierung & KI (Etappe 7). */}
      {/* KI-Funktionen (Etappe 7). Steht VOR dem Konto-Block, weil die
          Grundentscheidung ohne Konto getroffen wird und den Rest prägt.
          Der Schalter ist geraetelokal (kd:ki) -- deshalb der Hinweis, dass
          er nicht mitreist. */}
      <Klappe titel="Personalisierung & KI">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={kasten}>
          <h2 style={h2}>KI-Funktionen</h2>
          <p style={{ ...mono, margin: "0 0 10px", lineHeight: 1.6 }}>
            Ohne KI funktioniert alles — Suche, Sammlung, Bewertungen — vollständig
            und kostenlos auf diesem Gerät. Mit KI kommen Deutungs- und
            Profil-Funktionen dazu.
          </p>
          <div className="kd-einstellzeile" style={{ marginBottom: 12 }}>
            <span style={{ ...mono }}>KI insgesamt</span>
            <SegmentedControl className="kd-einstelloptionen kd-einstelloptionen--2" style={{ marginBottom: 0 }}
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
                  <SegmentedControl style={{ marginBottom: 0, minWidth: 0 }}
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

      {/* Geschmacksprofil (Etappe 7, Phase 2c). Steht NACH dem KI-Block,
          weil der Schalter die Rahmenentscheidung ist — aber ausdrücklich
          NICHT unter ihm: Der deterministische Weg ist vollwertig und muss
          auch bei KI=aus erreichbar sein. Ein Profil-Block, der sich mit
          dem KI-Schalter versteckt, hätte den Abnahme-Anker der Etappe
          („ein KI-loser Start ist vollwertig") in der Oberfläche
          zurückgenommen. */}
      <div style={kasten}>
          <h2 style={h2}>Geschmacksprofil</h2>
          <GeschmackBereich
            bekannteTitel={Array.isArray(master) ? master : []}
            bekannteGenres={bekannteGenres}
            bekannteTags={bekannteTags}
            artikelListe={artikelListe}
            vokabular={vokabular}
            kontoId={kontoId}
            onVokabularSpeichern={saveVokabular}
            blogProfilAnalyseSichtbar={false}
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

      {saveVokabular && (
        <div data-tour="daten-vokabular">
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
        </div>
      )}
        </div>
      </Klappe>

      {/* 4 — Konto, Daten & Sicherung */}
      <Klappe id="gesamt-backup" titel="Konto, Daten & Sicherung" offen={sicherungOffen}
        markiert={sicherungOffen} status={sicherungOffen ? "Sicherung offen" : null}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={kasten}>
          <h2 style={h2}>Konto & Geräte-Sync</h2>
          <KontoBereich demoAktiv={demoAktiv}
            onDatenGeaendert={onKontoDatenGeaendert} onBackupWunsch={sicherheitskopieGeraet} />
        </div>

      {kontoModus && <div style={kasten}>
          <h2 style={h2}>Datenrechte & Konto</h2>
          <KontoDatenrechte accountActive={kontoAktiv} exportAccountData={kontoExportVollstaendig} />
      </div>}

      <div style={kasten}>
          <h2 style={h2}>Sicherheitskopie dieses Geräts</h2>
          {sicherungOffen && (
            <p role="status" data-tour="daten-waechter" style={{ color: T.wolfram, fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
              Es gibt ungesicherte Änderungen im Browser. Die Sicherheitskopie hält Mediathek, Blog, Listen und Settings dieses Geräts gemeinsam in einer Datei fest.
            </p>
          )}
          <p style={{ fontSize: 13, color: T.rauch, margin: "0 0 12px", lineHeight: 1.6 }}>Lädt den gebundenen persönlichen App-Stand dieses Browsers als portable JSON-Datei herunter. Serverweite Konto-Eigendaten und der gemeinsame Kino- und Streamingkatalog sind nicht enthalten.</p>
          {sicherheitskopieGeraet && <button style={{ ...btnStyle(true), display: "inline-flex", alignItems: "center", gap: 8 }} onClick={sicherheitskopieGeraet}><IconExport size={16} />Sicherheitskopie dieses Geräts herunterladen</button>}
          <FeldHinweis feld="backup" text="Enthält den gebundenen persönlichen App-Stand dieses Geräts, aber keine serverweiten Konto-Eigendaten." />
      </div>
        </div>
      </Klappe>

      {/* 5 — Eine kanonische Hilfe, getrennt von Datenschutz und Rechtlichem. */}
      <Klappe titel="Hilfe & Anleitung">
        <div style={kasten}>
          <UeberKinodreieck />
        </div>
      </Klappe>

      <Klappe titel="Datenschutz & Rechtliches">
        <div style={kasten}>
          <p style={{ fontSize: 12, color: T.rauch, lineHeight: 1.7, margin: 0 }}>
            Kinodreieck — privates, nicht-kommerzielles Projekt. Persönliche Daten liegen lokal und bei aktiviertem Kontospeicher zusätzlich im eigenen Konto; die App verwendet keine allgemeine Telemetrie. Spielzeiten stammen von film.at und nonstopkino.at, Streaming-Verfügbarkeiten von Watchmode. Entdecken nutzt eigene Quellen des Österreichischen Filminstituts und von Netflix sowie FlixPatrol für neutrale Österreich-Charts und Titelfakten. Ein Chartplatz ist weder Geschmacksurteil noch Abo-Verfügbarkeit. Alle Angaben ohne Gewähr — verbindlich sind die Kino- bzw. Anbieterseiten. Bewertungen und Texte sind persönliche Meinungen ihrer Autoren.
            <br />© {new Date().getFullYear()} <button type="button"
              aria-expanded={eggOffen} aria-controls={eggBereichId}
              onClick={() => setEggOffen((offen) => !offen)}
              style={{ color: T.wolfram, background: "transparent", border: 0,
                font: "inherit", minWidth: 44, minHeight: 44, padding: "0 6px", cursor: "pointer",
                textDecorationLine: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>Max</button> — Nutzung auf eigene Verantwortung.
          </p>
          <div id={eggBereichId} hidden={!eggOffen} style={{ marginTop: 12 }}>
            {eggOffen && waehleModus && <button type="button" onClick={eggToggle}
              aria-pressed={eggAktiv} style={btnStyle(eggAktiv)}>{eggLabel}</button>}
          </div>
          <div style={{ marginTop: 18 }}>
            <DatenschutzUebersicht accountActive={kontoAktiv} exportAccountData={kontoExportVollstaendig} />
          </div>
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

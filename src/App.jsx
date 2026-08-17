import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ============================================================
   KINODREIECK · WIEN — v4 (Webapp, Vite)
   ------------------------------------------------------------
   Port aus dem Artifact v3.3. Änderungen:
   - Lokale Plattform: localStorage statt window.storage
   - KI komplett raus (Architekturentscheidung): kein Auto-Rating,
     kein Smart-Chat, kein KI-Programmabruf. Deterministisch.
   - Masterliste v3.1 (251 Einträge, stabile IDs) als Datenmodul
     gebündelt statt Embed-Slot. Schlüssel überall: film.id.
   - Programm: public/programm.json (Autoload) + Nonstop-HTML-
     Import + Snapshot-Import.
   - Diagnose-Tab entfernt (testete den Artifact-Proxy).
   Datenquellen bewusst schlank: film.at + Nonstop (Kino),
   Watchmode (Streaming). Kein TMDB (ausgebaut Juli 2026).
   ============================================================ */

import { T, btnStyle, setzeTheme } from "./lib/tokens.js";
import { initSetup, setupUeberspringen } from "./lib/tutorial.js";
import { ladeStand as ladeKiStand, setzeGlobal as setzeKiGlobalRoh, setzeFunktion as setzeKiFunktionRoh } from "./lib/kiSchalter.js";
import { QuelleKlaerung } from "./components/QuelleKlaerung.jsx";
import { StartWahl } from "./components/StartWahl.jsx";
import { KatalogZugang } from "./components/KatalogZugang.jsx";
import {
  store, K, PROGRAMM_TTL_MS, storageService, storageOwnerKennung,
} from "./services/storage.js";
import { catalogService } from "./services/catalog.js";
import { sessionCoordinator } from "./services/sessionCoordinator.js";
import { sharedArticlesService } from "./services/sharedArticles.js";
import { errorText, ERROR_CODES } from "./services/errors.js";
import {
  liesStartWahl,
  startWahlBestaetigt,
  verbraucheFrischenStart,
  liesFrischenStartWarnung,
  snapshotsFrei,
  START_WAHL_VERSION,
} from "./controllers/onboardingController.js";
import {
  zeitpunkt,
  IMPORT_INFO,
  demoLadung,
  streamingPayloadMitMetadaten,
  ladeEntdeckenBeilage,
  streamingBekanntSnapshot,
  streamingEntdeckenSnapshot,
  programmSnapshot,
} from "./controllers/catalogController.js";
import { useIntelligenceController } from "./controllers/useIntelligenceController.js";
import { useMustwatchController } from "./controllers/useMustwatchController.js";
import { useArticleController, useMasterPersistenceController } from "./controllers/useArticleController.js";
import { useErrorQueue } from "./controllers/useErrorQueue.js";
import { useMasterStateController } from "./controllers/useMasterStateController.js";
import { useBackupExportController } from "./controllers/useBackupExportController.js";
import { useEntdeckenRadarController } from "./controllers/useEntdeckenRadarController.js";
import { starteEinzelExportDownload } from "./controllers/backupExportController.js";
import { naechsteLokaleMasterHerkunft } from "./controllers/masterOriginController.js";
import { useConfirmedStorageState } from "./controllers/useConfirmedStorageState.js";
import { ERROR_SCOPE } from "./controllers/appErrorScopes.js";
import { bereiteStartwahlVor, erstellePersonalDataTransactionController } from "./controllers/personalDataTransactionController.js";
import {
  gueltigerArtikel,
  baueRefUniversum,
  baueKinoMatches,
  reicheFinderMasterAn,
  sichtbarerNachtrag,
  planeFilmLoeschung,
  planeMustwatchSprung,
} from "./controllers/libraryController.js";
import { useEggController } from "./controllers/useEggController.js";
import { deepSpaceOwnerKey, useDeepSpaceHorror } from "./controllers/useDeepSpaceHorror.js";
import { ensureIds, slugId } from "./lib/match.js";
import { parseNonstopHtml, grenzeInMinuten, hatVorstellungAb, normalisiereProgramm } from "./lib/programm.js";
import { Logo } from "./components/ui.jsx";
import { neueArtikelId, gleicheArtikelAb, uebernehmeRefs, heileRotlinks, blogZuArtikel, normalisiereArtikelTypen } from "./lib/artikel.js";
import {
  SHARED_PUBLICATION_ACTION,
  beginPublication,
  completePublication,
  failPublication,
  needsRemoteRemoval,
  publicationOperationId,
  publicationRetryAction,
  publicationState,
} from "./lib/sharedPublication.js";
import { parseMustwatch, parseBesitzImport, wendeBesitzImportAn } from "./lib/mustwatch.js";
import { gruppiereDienstBadges, sichtbareDienste } from "./lib/dienste.js";
import { StartTab } from "./tabs/StartTab.jsx";
import { KinoTab } from "./tabs/KinoTab.jsx";
import { MediathekTab } from "./tabs/MediathekTab.jsx";
import { StreamingTab } from "./tabs/StreamingTab.jsx";
import { EntdeckenTab } from "./tabs/EntdeckenTab.jsx";
import { FinderTab, erstelleFinderAntwort, kompakteFinderTreffer } from "./tabs/FinderTab.jsx";
import { DatenTab } from "./tabs/DatenTab.jsx";
import { EGGS_ENABLED } from "./lib/modus.js";
import { SyncStatusChip } from "./components/SyncStatusChip.jsx";
import { MobileNavigation, NAVIGATION } from "./components/AppNavigation.jsx";
import { HilfeSheet } from "./components/HilfeSheet.jsx";
import { ModusFx } from "./components/ModusOverlay.jsx";
import { ZurueckObenKnopf } from "./components/ZurueckObenKnopf.jsx";
import { CageAlphabet } from "./components/CageAlphabet.jsx";
import { BereichsHero } from "./components/BereichsHero.jsx";
import { GlobalSearchBar } from "./components/GlobalSearchBar.jsx";
import { GlobalErrorQueue } from "./components/GlobalErrorQueue.jsx";
import { RadarSubscriptionPreview } from "./components/RadarSubscriptionPreview.jsx";
import { normalisiereWochenplan, LEERER_WOCHENPLAN } from "./lib/wochenplan.js";
import { bestaetigeStaffel, initialisiereStaffelstaende, serienBeobachten } from "./lib/staffeln.js";
import { seriesWatchService } from "./services/seriesWatch.js";
import { useVokabularController } from "./controllers/useVokabularController.js";

const normalisiereEntdeckenStatus = (wert) => (
  wert && typeof wert === "object" && !Array.isArray(wert) ? wert : {}
);
const SCHRIFTWERTE = new Set(["klein", "normal", "gross"]);
const normalisiereSchrift = (wert) => (SCHRIFTWERTE.has(wert) ? wert : "normal");
export const LEERER_MEDIATHEK_MASTER = Object.freeze([]);
export default function App() {
  /* Lokale Animationswerkstatt: nur der Vite-Entwicklungsserver wertet den
     Query-Parameter aus. Der Modus schreibt weder Settings noch Rhythmus und
     kann deshalb keinen echten Deep-Space-Eintritt verbrauchen. */
  const deepSpaceTestmodusAktiv = import.meta.env.DEV
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("deep-space-test") === "1";
  const [session, setSession] = useState(() => sessionCoordinator.getSnapshot());
  useEffect(() => sessionCoordinator.subscribe(setSession), []);
  /* Rollen-v1: technische Anmeldung und fachlich aktiver Kontozugriff sind
     getrennt. Alte, unvollständige oder degradierte Sessions sind hier
     ausdrücklich nicht optimistisch freigeschaltet. */
  const remoteKontoAktiv = session.mode === "account" && session.state === "ready"
    && session.capabilities?.remoteStorage === true;
  const [frischerStart] = useState(() => verbraucheFrischenStart());
  const [frischerStartWarnung] = useState(() => liesFrischenStartWarnung());
  const { errors, reportError, resolveError, dismissError, setErr } = useErrorQueue(
    frischerStartWarnung ? [{ scope: ERROR_SCOPE.FRISCHER_START, text: frischerStartWarnung }] : [],
  );
  const [tab, setTab] = useState("start");
  /* Der offene Tab als Ref: Effekte, die nicht bei jedem Tabwechsel neu laufen
     sollen, dürfen ihn trotzdem lesen (z. B. „ist der Streaming-Tab offen?"). */
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const [mehrOffen, setMehrOffen] = useState(false);
  const [hilfeOffen, setHilfeOffen] = useState(false);
  const toggleMehr = useCallback(() => setMehrOffen((offen) => !offen), []);
  const schliesseHilfe = useCallback(() => setHilfeOffen(false), []);
  const scrollProBereichRef = useRef(new Map([["start", 0]]));
  const aktuelleScrolltiefe = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return 0;
    /* Das Popup sperrt iOS-Scroll über einen fixierten Body. In diesem Zustand
       ist scrollY nicht zuverlässig; body.top enthält aber die echte Tiefe. */
    if (document.body.style.position === "fixed") {
      const bodyTop = Number.parseFloat(document.body.style.top || "0");
      if (Number.isFinite(bodyTop)) return Math.max(0, -bodyTop);
    }
    return Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  }, []);
  const stelleScrolltiefeHer = useCallback((id, ueberschreiben = null) => {
    const ziel = ueberschreiben ?? scrollProBereichRef.current.get(id) ?? 0;
    /* Zwei Frames: erst darf die Scrollsperre des ausgebauten Popup-Menüs ihren
       alten Stand freigeben, danach gewinnt die bereichseigene Position. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { window.scrollTo({ top: ziel, left: 0, behavior: "auto" }); } catch { window.scrollTo(0, ziel); }
    }));
  }, []);
  const navigiere = useCallback((id) => {
    scrollProBereichRef.current.set(tabRef.current, aktuelleScrolltiefe());
    setTab(id);
    setMehrOffen(false);
    stelleScrolltiefeHer(id);
  }, [aktuelleScrolltiefe, stelleScrolltiefeHer]);
  const nachObenAusMenu = useCallback(() => {
    scrollProBereichRef.current.set(tabRef.current, 0);
    setMehrOffen(false);
    stelleScrolltiefeHer(tabRef.current, 0);
  }, [stelleScrolltiefeHer]);
  const {
    master, setMaster, masterRef, masterMeta, setMasterMeta, masterMetaRef,
    masterHerkunft, setMasterHerkunft, masterHerkunftRef, commitMaster,
  } = useMasterStateController();
  const [programm, setProgramm] = useState(null);
  const [programmArt, setProgrammArt] = useState(null);
  const [progStand, setProgStand] = useState(null);
  /* Datenwahrheit (Etappe 4): woher das angezeigte Programm bzw. der Katalog
     stammt und was daran gerade nicht stimmt. Reine Beschreibung des Zustands —
     die Tabs formulieren daraus ihren Text, sie raten nicht mehr.
     { art, variante, stand, gueltigBis, abgelaufen, ausCache, anmeldungNoetig, fehler, code }
     `code` ist der stabile Fehlercode der Grenzschicht (services/errors.js) —
     damit unterscheiden die Tabs „Anmeldung nötig" von „Schlüssel abgelehnt"
     und „noch keine Beispieldaten", ohne Texte zu deuten. */
  const [programmInfo, setProgrammInfo] = useState(null);
  const [streamingInfo, setStreamingInfo] = useState(null);
  const [streamingBekannt, setStreamingBekannt] = useState(null);
  const [streamingEntdecken, setStreamingEntdecken] = useState(null);
  /* Dieser Zustand wird bereits vom Boot und von der gezielten
     Demo-Bereinigung gebraucht; seine Grenze muss deshalb vor diesen
     Callbacks liegen. */
  const ALTE_SLUGS = { netflix: "Netflix", disney_plus: "Disney+", prime_video: "Prime Video" };
  const [auswahl, setAuswahlRoh] = useState([]);
  const [heuristikAn, setHeuristikAn] = useState(true);
  const streamingCfgJson = (quellen, heuristik) => JSON.stringify({ quellen, heuristik });
  useEffect(() => {
    store.get(K.streamingDienste).then((r) => {
      if (r && r.value) {
        try {
          const v = JSON.parse(r.value);
          if (Array.isArray(v.quellen)) setAuswahlRoh(v.quellen);
          else if (Array.isArray(v.dienste)) setAuswahlRoh(v.dienste.map((d) => ALTE_SLUGS[d] || d));
          if (typeof v.heuristik === "boolean") setHeuristikAn(v.heuristik);
        } catch { /* Default */ }
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loading, setLoading] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [bootDone, setBootDone] = useState(false);
  const [zeitgrenze, setZeitgrenze] = useState("14:00"); // Filter für "Läuft auch" (einstellbar, persistiert)
  const [zeigeAlles, setZeigeAlles] = useState(false);   // "Ganzes Tagesprogramm zeigen" (Session-flüchtig)
  /* Der Storage-Boot gehört ausschließlich zum ersten Render. Gast/Konto-
     Wechsel werden weiter unten gezielt behandelt; ein erneutes Einlesen hier
     würde dabei einen gerade verworfenen, alten Anzeigestand zurückholen. */
  const storageBootGestartet = useRef(false);
  const autoFetched = useRef(false);
  /* Der Boot hat einen Anzeigestand übernommen, der trotzdem nachgeladen gehört
     (abgelaufener Schnappschuss). Der Autoload feuert sonst nur bei leerem
     `programm` und würde den alten Stand ewig stehen lassen. */
  const nachladenNoetig = useRef(false);
  /* Betriebsart der letzten Beobachtung ("live"/"demo"). Der erste beobachtete
     Wert ist der Startzustand, KEIN Wechsel — sonst lädt der Start doppelt. */
  const letzteBetriebsart = useRef(null);
  /* Zähler der Betriebsart-Wechsel. JEDER Katalog-Ladevorgang merkt sich beim
     Start den Stand und schreibt weder State noch Topf, wenn er beim Eintreffen
     seiner Antwort nicht mehr stimmt. Ein Abbruch-Flag im Wechsel-Effekt genügt
     dafür NICHT: der Effekt bricht dann zwar seinen eigenen Ablauf ab, die
     bereits laufenden Lader (Autoload, Streaming-Tab, der Lauf der vorigen
     Betriebsart) rufen ihre setProgramm/store.set aber ungebremst weiter auf —
     und eine langsame Live-Antwort landete so nach dem Abmelden als „aktueller
     Stand" im Topf. */
  const betriebsartGen = useRef(0);
  const streamingGeladen = useRef(false);
  const entdeckenGeladen = useRef(false); // KD-031: Voll-Katalog getrennt vom leichten Boot-Nachladen
  const streamingRohRef = useRef(null);
  const streamingBekanntLaufRef = useRef(null);
  const streamingEntdeckenLaufRef = useRef(null);

  const saveZeitgrenze = useCallback(async (v) => {
    setZeitgrenze(v);
    try { await store.set(K.zeitgrenze, v); } catch { /* nicht fatal */ }
  }, []);

  /* ---- Einstellungen: Theme, Startbereich, Schriftgröße, Darstellungsmodus ----
     Ein Objekt im Storage; setzeTheme tauscht die Token-Werte, der
     State-Wechsel rendert alles neu — Komponenten bleiben unangetastet. */
  const [einstellungen, setEinstellungenState] = useState({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" });
  const effektiveSchrift = normalisiereSchrift(einstellungen.schrift);
  useEffect(() => {
    const root = document.documentElement;
    const vorher = root.getAttribute("data-kd-schrift");
    root.dataset.kdSchrift = effektiveSchrift;
    return () => {
      if (root.dataset.kdSchrift !== effektiveSchrift) return;
      if (vorher == null) delete root.dataset.kdSchrift;
      else root.dataset.kdSchrift = vorher;
    };
  }, [effektiveSchrift]);
  const [neonEintrittSerial, setNeonEintrittSerial] = useState(0);
  const bereinigteEinstellungen = useCallback((wert) => {
    const next = { ...wert, schrift: normalisiereSchrift(wert?.schrift) };
    delete next.linkshaender;
    return next;
  }, []);
  const setzeEinstellung = useCallback((k, v) => {
    const next = bereinigteEinstellungen({ ...einstellungen, [k]: v });
    setEinstellungenState(next);
    if (k === "theme") setzeTheme(v);
    store.set(K.einstellungen, JSON.stringify(next)).catch(() => {});
  }, [einstellungen, bereinigteEinstellungen]);
  /* ---- Darstellungs-Modi: Saal/Foyer/Showa/Neon Noir in EINER Gruppe.
     Die Spezialmodi erzwingen jeweils ihr dunkles Theme;
     Saal/Foyer schalten den Modus ab und setzen das Theme direkt. ---- */
  const waehleModus = useCallback((wahl) => {
    if (wahl === "neon-noir" && einstellungen.modus !== "neon-noir") {
      setNeonEintrittSerial((stand) => stand + 1);
    }
    let next;
    if (wahl === "showa" || wahl === "neon-noir") {
      const basisTheme = einstellungen.modus
        ? (einstellungen.basisTheme || "dunkel")
        : einstellungen.theme;
      next = {
        ...einstellungen,
        modus: wahl,
        basisTheme,
        theme: "dunkel",
      };
    } else if (wahl === "foyer") {
      next = {
        ...einstellungen,
        modus: "",
        basisTheme: undefined,
        theme: "hell",
      };
    } else {
      next = {
        ...einstellungen,
        modus: "",
        basisTheme: undefined,
        theme: "dunkel",
      };
    }
    next = bereinigteEinstellungen(next);
    setEinstellungenState(next);
    setzeTheme(next.modus || next.theme);
    store.set(K.einstellungen, JSON.stringify(next)).catch(() => {});
  }, [einstellungen, bereinigteEinstellungen]);

  /* ---- Eigenes Suche-Vokabular: [{wort, genres[], tags[]}] ---- */
  const { vokabular, setVokabular, saveVokabular } = useVokabularController({ setErr });

  /* ---- Kinotermin-Pins ----
     Pin = {t, j, z, seit} — z ist der komplette Terminstring inkl. Kino.
     Vergangene Termine werden beim Boot aufgeräumt (Jahres-Wrap beachtet:
     ein im Dezember gepinnter Januar-Termin gehört ins Folgejahr). */
  const [kinoPins, setKinoPins] = useState([]);
  const wochenplanInitial = useMemo(() => {
    try { return normalisiereWochenplan(JSON.parse(localStorage.getItem(K.wochenplan) || "null")); }
    catch { return LEERER_WOCHENPLAN; }
  }, []);
  const {
    wert: wochenplan,
    uebernehmeBestaetigt: setWochenplan,
    schreibe: persistWochenplan,
  } = useConfirmedStorageState({
    key: K.wochenplan,
    initial: wochenplanInitial,
    normalisiere: normalisiereWochenplan,
    setErr,
    fehlermeldung: "Wochenplan konnte nicht gespeichert werden. Die Änderung wurde nicht übernommen.",
  });
  const entdeckenStatusInitial = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(K.entdeckenStatus) || "{}"); } catch { return {}; }
  }, []);
  const {
    wert: entdeckenStatus,
    wertRef: entdeckenStatusRef,
    uebernehmeBestaetigt: setEntdeckenStatus,
    schreibe: schreibeEntdeckenStatus,
  } = useConfirmedStorageState({
    key: K.entdeckenStatus,
    initial: entdeckenStatusInitial,
    normalisiere: normalisiereEntdeckenStatus,
    setErr,
    fehlermeldung: "Streaming-Status konnte nicht gespeichert werden. Die Änderung wurde nicht übernommen.",
  });
  /* Initialisiert ausschließlich den Tutorial-Speicher. Ein Terminal-Installer
     ist für die DB-basierte Tester-PWA nicht mehr Teil des Starts. */
  const [setupWarnung] = useState(() => {
    try { initSetup(); } catch { /* Tutorial-Speicher optional */ }
    return false;
  });
  const [snapshotFreigabe, setSnapshotFreigabe] = useState(() => snapshotsFrei());
  const snapshotFreigabeRef = useRef(snapshotFreigabe);
  snapshotFreigabeRef.current = snapshotFreigabe;
  const [startTick, setStartTick] = useState(0); // bump nach Startwahl -> abgeleitete Gates/Zustände neu lesen
  /* Etappe 7: KI-Schalter. Geraetelokal (kd:ki), deshalb eigener State statt
     `einstellungen` -- und ein Tick, damit die Gates (kiAn) nach einer
     Aenderung neu gelesen werden; sie werden beim Render abgefragt, nicht
     abonniert. */
  const [kiStand, setKiStand] = useState(() => ladeKiStand());
  const setzeKiGlobal = useCallback((an) => {
    const { stand, gespeichert } = setzeKiGlobalRoh(an, new Date().toISOString());
    setKiStand(stand); setStartTick((x) => x + 1);
    if (!gespeichert) setErr("Die KI-Wahl konnte auf diesem Gerät nicht gespeichert werden. KI bleibt vorsichtshalber aus.");
  }, []);
  const setzeKiFunktion = useCallback((name, an) => {
    const { stand, gespeichert } = setzeKiFunktionRoh(name, an);
    setKiStand(stand); setStartTick((x) => x + 1);
    if (!gespeichert) setErr("Die KI-Wahl konnte auf diesem Gerät nicht gespeichert werden. KI bleibt vorsichtshalber aus.");
  }, []);
  /* Fehlende Katalogverbindung blockiert den Einstieg nicht mehr automatisch.
     Der Zustand bleibt inline sichtbar und kann bewusst in Einstellungen
     verbunden werden; nur ein ausdrücklich geöffneter Dialog wird modal. */
  const [katalogZugangOffen, setKatalogZugangOffen] = useState(false);
  const pinAbgelaufen = (pin, jetzt = new Date()) => {
    const m = /(\d{1,2})\.(\d{1,2})\./.exec(String(pin.z));
    if (!m) return false; // unparsebar -> nie automatisch wegwerfen
    let d = new Date(jetzt.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    if (jetzt - d > 180 * 86400000) d = new Date(jetzt.getFullYear() + 1, Number(m[2]) - 1, Number(m[1]));
    const heute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
    return heute - d > 1 * 86400000; // gestern gesehen? Heute noch stehen lassen.
  };
  const persistPins = useCallback(async (pins) => {
    try { await store.set(K.kinoPins, JSON.stringify(pins)); } catch { /* nicht fatal */ }
  }, []);
  const toggleKinoPin = useCallback((t, j, z) => {
    const ohne = kinoPins.filter((p) => !(p.t === t && p.z === z));
    const next = ohne.length < kinoPins.length
      ? ohne
      : [...kinoPins, { t, j: j ?? null, z, seit: Date.now() }];
    setKinoPins(next);
    void persistPins(next);
  }, [kinoPins, persistPins]);

  /* ---- Entdecken-Merkliste (in den App-State geliftet, damit Streaming und
     Dashboard live synchron sind — vorher zwei getrennte localStorage-Leser).
     Struktur: {watchmode_id, titel, jahr, hinzugefuegt_am}. ---- */
  const [merkliste, setMerkliste] = useState(() => {
    try { return JSON.parse(localStorage.getItem(K.merkliste) || "[]"); } catch { return []; }
  });
  const persistMerk = useCallback(async (l) => {
    try { await store.set(K.merkliste, JSON.stringify(l)); } catch { /* nicht fatal */ }
  }, []);
  const toggleMerk = useCallback((t) => {
    const drin = merkliste.some((m) => m.watchmode_id === t.watchmode_id);
    const next = drin
      ? merkliste.filter((m) => m.watchmode_id !== t.watchmode_id)
      : [
        ...merkliste,
        {
          watchmode_id: t.watchmode_id,
          titel: t.titel,
          jahr: t.jahr ?? null,
          hinzugefuegt_am: new Date().toISOString().slice(0, 10),
        },
      ];
    setMerkliste(next);
    void persistMerk(next);
  }, [merkliste, persistMerk]);

  /* ---- Herkunft der geladenen Liste ----
     typ: "storage" | "demo" | "manuell" · zeit: ms oder Datums-String · basis: optionaler Vermerk */
  const demoAktiv = useMemo(() => {
    if (masterHerkunft?.typ === "demo") return true;
    try { return !!localStorage.getItem(K.demoSeed); } catch { return false; }
  }, [masterHerkunft, startTick]);
  /* Startwahl-Modal (Beta): sichtbar, wenn beim Erststart weder Storage-Stand
     noch frühere Wahl noch ?start-Parameter vorliegt. Boot entscheidet. */
  const [startModalOffen, setStartModalOffen] = useState(false);

  /* ---- Master persistieren: innerster Lock der Mehrtopf-Reihenfolge ---- */
  const { mutiereMaster, transaktionMaster, loescheMaster } = useMasterPersistenceController({
    setErr, masterRef, commitMaster,
  });

  /* ---- Kinoprogramm direkt aus dem zentralen Supabase-Katalog laden ---- */
  const ladeProgrammDatei = useCallback(async (manuell) => {
    /* Betriebsart-Stand beim Start dieses Laufs. Wechselt die Betriebsart,
       während die Antwort unterwegs ist, gehört sie zu einer überholten Zeile
       und darf weder Anzeige noch Topf berühren (siehe betriebsartGen). */
    const gen = betriebsartGen.current;
    const veraltet = () => betriebsartGen.current !== gen;
    setLoading("programm");
    try {
      /* Der manuelle Knopf bleibt ein DB-Refresh; Dateiimporte besitzen ihre
         eigenen Funktionen weiter unten. Welche Zeile (live/demo) gelesen wird,
         entscheidet die Service-Grenze anhand der Sitzung. */
      const r = await catalogService.loadArea("programm");
      const data = normalisiereProgramm(r.payload); // Alt- und film.at-Format
      if (veraltet()) return false;
      if (!manuell && !snapshotFreigabeRef.current) return false;
      const ausCache = r.quelle === "cache";
      /* Der Stand kommt aus den Daten, NIE aus der Uhr des Geräts: sonst sähe
         ein Cache-Treffer von vorletzter Woche aus wie frisch geladen. */
      const stand = zeitpunkt(r.stand) ?? (ausCache ? r.gecachtAm : Date.now());
      const gueltigBis = zeitpunkt(r.gueltigBis);
      const art = ausCache ? "cache" : manuell ? "db-refresh" : "datenbank";
      setProgramm(data);
      setProgrammArt(art);
      setProgStand(stand);
      setProgrammInfo({
        art, variante: r.variante, stand, gueltigBis,
        abgelaufen: !!r.abgelaufen, ausCache, anmeldungNoetig: !!r.anmeldungNoetig, fehler: null,
        code: ausCache ? (r.code || null) : null,
      });
      if (ausCache) {
        reportError(ERROR_SCOPE.PROGRAMM, r.anmeldungNoetig
          ? "Kinoprogramm aus dem letzten Browser-Stand — für das aktuelle Programm ist eine Anmeldung nötig."
          : r.code === ERROR_CODES.INVALID_KEY
            ? "Kinoprogramm aus dem letzten Browser-Stand — der hinterlegte Zugangsschlüssel wird gerade abgelehnt (Settings → Datenmodus & Verbindung)."
            : "Kinoprogramm aus dem letzten Browser-Stand geladen (Datenbank derzeit nicht erreichbar).");
      } else if (r.abgelaufen) {
        reportError(ERROR_SCOPE.PROGRAMM, "Dieser Programm-Schnappschuss ist abgelaufen und zeigt nicht mehr das laufende Kinoprogramm.");
      } else resolveError(ERROR_SCOPE.PROGRAMM);
      try {
        /* `gueltigBis` und `variante` MÜSSEN mit in den Topf: ohne sie hielte der
           nächste Start einen abgelaufenen Schnappschuss für frisches Programm
           und eine Live-Payload für den Stand eines Gastes. */
        await store.set(K.programm, JSON.stringify({
          fetchedAt: Date.now(), stand, gueltigBis, art, variante: r.variante, data,
        }));
      } catch { /* Cache-Fehler nicht fatal */ }
      return !ausCache;
    } catch (e) {
      /* Auch der FEHLER gehört zur alten Betriebsart: sonst überschriebe ein
         spät eintreffendes „Anmeldung nötig" die Meldung des neuen Standes. */
      if (veraltet()) return false;
      const dateiNetz = typeof location !== "undefined" && location.protocol === "file:"
        && programmSnapshot && (Array.isArray(programmSnapshot.filme) || (programmSnapshot.data && Array.isArray(programmSnapshot.data.filme)));
      if (!manuell && dateiNetz) {
        // Autoload gescheitert (nur file://) -> eingebetteter Snapshot vom Bauzeitpunkt.
        // Bewusst NICHT gecached, damit ein späterer fetch/Import gewinnt.
        try {
          const d = normalisiereProgramm(programmSnapshot);
          const stand = zeitpunkt(programmSnapshot.erstellt);
          setProgramm({ ...d, quelle_hinweis: (d.quelle_hinweis || "") + " · eingebettet beim Bauen" });
          setProgrammArt("snapshot");
          setProgStand(stand);
          setProgrammInfo({ art: "snapshot", variante: null, stand, gueltigBis: null, abgelaufen: false, ausCache: false, anmeldungNoetig: false, fehler: null, code: null });
          resolveError(ERROR_SCOPE.PROGRAMM);
          return false;
        } catch { /* Snapshot unbrauchbar — dann eben der ehrliche Fehler unten */ }
      }
      /* B6: Auch der stille Autoload meldet jetzt. Ein leerer Kino-Tab ohne
         jede Erklärung war der eigentliche Fehler. Jeder Zustand bekommt seinen
         eigenen Satz — „Anmeldung nötig" ist nicht dasselbe wie ein abgelehnter
         Schlüssel und nicht dasselbe wie fehlende Beispieldaten. */
      const code = e?.code || null;
      const anmeldungNoetig = code === ERROR_CODES.UNAUTHENTICATED;
      const text = anmeldungNoetig
        ? "Für das aktuelle Kinoprogramm ist eine Anmeldung nötig — melde dich unter Settings → Konto an."
        : code === ERROR_CODES.NO_DEMO_DATA
          ? "Für den öffentlichen Zugang sind noch keine Beispieldaten veröffentlicht. Mit einer Anmeldung siehst du das laufende Kinoprogramm."
          : code === ERROR_CODES.INVALID_KEY
            ? "Der hinterlegte Zugangsschlüssel wird von der Datenbank nicht akzeptiert — prüfe ihn unter Settings → Datenmodus & Verbindung."
            : (manuell ? "Programmdaten nicht aktualisierbar: " : "Kinoprogramm nicht ladbar: ") + errorText(e);
      reportError(ERROR_SCOPE.PROGRAMM, text);
      /* Dieser Zweig räumt `programm`, `programmArt` und `progStand` NICHT weg —
         der bisherige Stand bleibt also sichtbar. Dann muss auch seine
         BESCHREIBUNG stehen bleiben: `programmInfo` ist seit Etappe 4 die
         einzige Quelle für „Demo-Schnappschuss", „abgelaufen" und „aus dem
         Browser-Speicher". Ein reines Fehlerobjekt an dieser Stelle nähme den
         weiterhin angezeigten Daten ihre Warnetiketten — ein abgelaufener
         Demo-Stand stünde danach in Normalfarbe als gültiges Programm da.
         Ehrlicher als das Wegräumen der Daten ist das Ergänzen: das Programm
         wegzuwerfen, weil eine Aktualisierung scheiterte, nähme dem Nutzer
         ausgerechnet im Störungsfall die letzte Kopie — auch die manuell
         eingespielte. Der Fehler kommt also DAZU, er ersetzt die Beschreibung
         nicht. Nur wenn nichts angezeigt wird (kein früherer Stand, art null),
         ist das reine Fehlerobjekt die ganze Wahrheit. */
      /* N1/N2/N3: Die Diagnose des JÜNGSTEN Versuchs gilt — `anmeldungNoetig`
         und `code` werden übernommen, nicht mit dem alten Wert verodert bzw.
         hinterfangen. Sonst bliebe „Anmeldung nötig" kleben, nachdem die
         Ursache längst ein 503 ist, und ein erneutes Anmelden heilte es nicht.
         `abgelaufen` wird beim Ergänzen neu bewertet: der Stand kann zwischen
         Ladung und Fehlversuch abgelaufen sein. */
      setProgrammInfo((vorher) => (vorher && vorher.art
        ? {
          ...vorher,
          abgelaufen: Number.isFinite(vorher.gueltigBis) ? vorher.gueltigBis < Date.now() : vorher.abgelaufen,
          anmeldungNoetig, fehler: text, code,
        }
        : {
          art: null, variante: null, stand: null, gueltigBis: null,
          abgelaufen: false, ausCache: false, anmeldungNoetig, fehler: text, code,
        }));
      return false;
    } finally {
      /* C3: auch dieser Schreibzugriff gehört der Generation dieses Laufs. Ein
         überholter Lauf räumte sonst die Ladeanzeige des GERADE laufenden neuen
         Laufs ab — der Knopf „Kinoprogramm neu laden" würde wieder aktiv, ein
         dritter paralleler Request wäre einen Klick entfernt.
         Hängen bleibt die Anzeige dadurch nicht: die Generation steigt einzig im
         Betriebsart-Effekt, und der startet danach entweder sofort (synchron,
         vor dem ersten await) einen neuen Programm-Lauf, der die Anzeige in
         seinem eigenen finally wieder freigibt — oder er räumt sie in seinem
         frühen Ausstieg selbst ab. */
      if (!veraltet()) setLoading("");
    }
  }, [reportError, resolveError]);

  /* ---- Boot: Storage → gebündelte Projektdatei → leer (manueller Import) ---- */
  useEffect(() => {
    if (storageBootGestartet.current) return undefined;
    storageBootGestartet.current = true;
    (async () => {
      let m = null, meta = null, herkunft = null, cachedProg = null, startModalNoetig = false;
      try {
        const r = await store.get(K.master);
        if (r) {
          const p = JSON.parse(r.value);
          m = ensureIds(p.filme || []);
          meta = p.meta || null;
          herkunft = { typ: "storage", zeit: p.gespeichertAm || Date.now(), basis: p.herkunft && p.herkunft.basis };
        }
      } catch { /* kein Master im Storage */ }
      if (!m) {
        // Kein Storage-Stand -> Beta-Startwahl entscheidet (§6.1: NICHT mehr
        // automatisch Echtdaten laden). demo lädt die bereinigte Liste (nicht
        // persistiert bis Bearbeitung), clean bleibt leer, keine Wahl -> Modal.
        const wahl = frischerStart || (startWahlBestaetigt() ? liesStartWahl() : null);
        if (wahl === "demo") {
          try {
            const d = await demoLadung();
            m = d.filme; meta = d.meta; herkunft = d.herkunft;
            try {
              localStorage.setItem("kd:start", "demo");
              const seed = { masterIds: d.filme.map((f) => f.id), artikelIds: [], geladenAm: new Date().toISOString() };
              if (d.streaming && Array.isArray(d.streaming.quellen)) {
                localStorage.setItem(K.streamingDienste, JSON.stringify(d.streaming));
                setAuswahlRoh(d.streaming.quellen);
                if (typeof d.streaming.heuristik === "boolean") setHeuristikAn(d.streaming.heuristik);
                seed.streamingQuellen = [...d.streaming.quellen];
              }
              if (d.artikel) {
                const al = normalisiereArtikelTypen(Array.isArray(d.artikel) ? d.artikel : d.artikel.artikel || []);
                artikelListeRef.current = al;
                setArtikelListe(al);
                localStorage.setItem(K.artikel, JSON.stringify({ artikel: al, gespeichertAm: Date.now() }));
                seed.artikelIds = al.map((a) => a.id);
              }
              if (Array.isArray(d.pins)) {
                setKinoPins(d.pins); localStorage.setItem(K.kinoPins, JSON.stringify(d.pins));
                seed.pinKeys = d.pins.map((p) => String(p.t || "") + "|" + String(p.z || ""));
              }
              if (d.mustwatch) {
                const mw = parseMustwatch(JSON.stringify(d.mustwatch));
                localStorage.setItem(K.mustwatch, JSON.stringify({ eintraege: mw, gespeichertAm: Date.now() })); setMustwatch(mw);
                seed.mustwatchIds = mw.map((e) => e.id);
              }
              if (Array.isArray(d.merkliste)) {
                setMerkliste(d.merkliste); localStorage.setItem(K.merkliste, JSON.stringify(d.merkliste));
                seed.merklisteIds = d.merkliste.map((m) => String(m.watchmode_id));
              }
              localStorage.setItem(K.demoSeed, JSON.stringify(seed));
            } catch { /* Seed-State bleibt mindestens in React erhalten */ }
          } catch (e) {
            setErr("Demo-Daten nicht ladbar: " + e.message);
            setKatalogZugangOffen(true);
          }
        } else if (wahl === "clean") {
          try { localStorage.setItem("kd:start", "clean"); } catch { /* */ }
        } else if (session.mode !== "account") {
          startModalNoetig = true;
        }
      }
      try {
        const r = await store.get(K.programm);
        if (r) {
          const p = JSON.parse(r.value);
          const frisch = Date.now() - p.fetchedAt < (p.art === "datenbank" || p.art === "db-refresh" ? 7 * PROGRAMM_TTL_MS : PROGRAMM_TTL_MS);
          if (frisch && (snapshotFreigabe || p.art === "manuell")) cachedProg = p;
        }
      } catch { /* kein Cache */ }
      /* Welche Zeile die App JETZT lesen dürfte — allein daran misst sich, ob ein
         gespeicherter Topf noch ein gültiger Anzeigestand ist.
         Bewusst der TOKENFREIE Weg (storedVariant, synchron): activeVariant()
         holt ein Zugriffstoken und stößt bei fast abgelaufener Sitzung eine
         Erneuerung mit 10-Sekunden-Zeitgrenze an — der Boot stünde dann bei
         hängender Verbindung minutenlang vor der Startseite. Für dieses Urteil
         genügt die Frage, ob überhaupt eine gespeicherte Sitzung vorliegt. */
      let betriebsartJetzt = "demo";
      try { betriebsartJetzt = catalogService.storedVariant(); } catch { /* Gast ist die sichere Annahme */ }
      try {
        const r = await store.get(K.zeitgrenze);
        if (r && r.value) setZeitgrenze(r.value);
      } catch { /* Default 14:00 */ }
      try {
        const r = await store.get(K.kinoPins);
        if (r && r.value) {
          const alle = JSON.parse(r.value);
          const frisch = alle.filter((p) => !pinAbgelaufen(p));
          setKinoPins(frisch);
          if (frisch.length < alle.length) persistPins(frisch); // Abgelaufene still aufräumen
        }
      } catch { /* keine Pins */ }
      try {
        const r = await store.get(K.wochenplan);
        setWochenplan(normalisiereWochenplan(r?.value ? JSON.parse(r.value) : null));
      } catch { setWochenplan({ version: 1, eintraege: [] }); }
      try {
        const r = await store.get(K.entdeckenStatus);
        if (r?.value) {
          const status = JSON.parse(r.value);
          setEntdeckenStatus(status);
        }
      } catch { /* keine Entdecken-Markierungen */ }
      try {
        const r = await store.get(K.einstellungen);
        if (r && r.value) {
          const roh = JSON.parse(r.value);
          const hatteVeralteteEinstellung = Object.prototype.hasOwnProperty.call(roh, "linkshaender")
            || Object.prototype.hasOwnProperty.call(roh, "kurosawa")
            || ["kurosawa", "grindhouse", "nerv"].includes(roh.modus)
            || normalisiereSchrift(roh.schrift) !== roh.schrift;
          const e = { theme: "dunkel", startTab: "start", modus: "", ...roh,
            schrift: normalisiereSchrift(roh.schrift) };
          delete e.linkshaender;                                  // veraltete Menüpräferenz wird nicht mehr ausgewertet
          delete e.kurosawa;                                     // uralter Bool, längst durch modus ersetzt
          if (e.modus === "kurosawa" || e.modus === "grindhouse") e.modus = ""; // v1-Modi zurückgezogen
          if (e.modus === "nerv") e.modus = "neon-noir";        // veröffentlichbarer Ersatz bewahrt die dunkle Egg-Wahl
          setEinstellungenState(e);
          setzeTheme(e.modus || e.theme);                        // Spezialmodus überschreibt die Basis-Palette
          if (e.startTab && e.startTab !== "start" && NAVIGATION.some((n) => n.id === e.startTab)) setTab(e.startTab); // Nur weiterhin angebotene Navigationsziele als Startbereich übernehmen
          if (hatteVeralteteEinstellung) await store.set(K.einstellungen, JSON.stringify(e));
        }
      } catch { /* Defaults */ }
      try {
        const r = await store.get(K.vokabular);
        if (r && r.value) {
          const v = JSON.parse(r.value);
          if (Array.isArray(v)) setVokabular(v);
        }
      } catch { /* kein eigenes Vokabular */ }
      if (m) { setMaster(m); setMasterMeta(meta); setMasterHerkunft(herkunft); }
      if (cachedProg) {
        // Auch gecachte Programme durch die Normalisierung: filtert inzwischen
        // vergangene Vorstellungen raus (Cache kann bis 7 Tage alt sein).
        try {
          const art = cachedProg.art || "snapshot";
          const stand = zeitpunkt(cachedProg.stand) ?? cachedProg.fetchedAt;
          const gueltigBis = zeitpunkt(cachedProg.gueltigBis);
          /* Dieselbe Ablaufprüfung wie beim frischen Laden — sonst gilt ein
             abgelaufener Schnappschuss nach einem Neustart als aktuelles
             Programm (Töpfe ohne das Feld: gueltigBis = null = kein Urteil). */
          const abgelaufen = gueltigBis != null && gueltigBis < Date.now();
          /* Und dieselbe Betriebsart: ein als „live" gespeicherter Topf ist für
             einen Gast kein gültiger Anzeigestand (und umgekehrt). Dann lieber
             nichts zeigen und neu laden, als Fremdes als frisch etikettieren.
             Importe/Snapshots tragen keine Variante und bleiben unberührt. */
          const passt = !cachedProg.variante || cachedProg.variante === betriebsartJetzt;
          if (!passt) {
            /* Nicht anzeigen. Der Autoload greift, weil `programm` null bleibt. */
          } else {
            setProgramm(normalisiereProgramm(cachedProg.data));
            setProgrammArt(art);
            setProgStand(stand);
            setProgrammInfo({
              art, variante: cachedProg.variante || null, stand, gueltigBis,
              abgelaufen, ausCache: art === "cache", anmeldungNoetig: false, fehler: null, code: null,
            });
            /* Cache macht den ersten Bildaufbau schnell, ersetzt aber keine
               Revalidierung. Die Mac-Pipeline kann zwischen zwei App-Starts
               einen neuen Stand veröffentlicht haben; bisher blieb ein einmal
               geladener DB-Stand bis zu sieben Tage stehen, ohne die DB noch
               einmal zu fragen. */
            if (["datenbank", "db-refresh", "cache"].includes(art)) {
              nachladenNoetig.current = true;
            }
            if (abgelaufen) {
              reportError(ERROR_SCOPE.PROGRAMM, "Dieser Programm-Schnappschuss ist abgelaufen und zeigt nicht mehr das laufende Kinoprogramm.");
              /* Anzeigen UND nachladen: ohne das bliebe der abgelaufene Stand
                 bis zum nächsten Klick stehen (der Autoload feuert nur bei
                 leerem `programm`). */
              nachladenNoetig.current = true;
            }
          }
        }
        catch { /* Cache unbrauchbar — Autoload übernimmt */ }
      }
      setStartModalOffen(startModalNoetig);
      setBootDone(true);
    })();
    return undefined;
  }, [frischerStart, session.mode]);

  /* ---- Autoload: ohne frischen Cache einmalig programm.json probieren ----
     Zusätzlicher Anlass: der Boot hat zwar etwas angezeigt, es aber als
     nachladebedürftig markiert (abgelaufener Schnappschuss). */
  useEffect(() => {
    if (bootDone && snapshotFreigabe && (!programm || nachladenNoetig.current) && !autoFetched.current) {
      autoFetched.current = true;
      nachladenNoetig.current = false;
      /* B6: `autoFetched` heißt „es wurde etwas geladen", nicht „es wurde
         einmal versucht". Ein erfolgloser Versuch gibt das Flag deshalb wieder
         frei — sonst bliebe der Autoload für den Rest der Sitzung stillgelegt,
         obwohl nie etwas angekommen ist. Eine Ladeschleife entsteht dadurch
         nicht: dieser Effekt läuft nur bei einer Änderung von [bootDone,
         programm, snapshotFreigabe] erneut, und ein gescheiterter Versuch
         lässt `programm` unverändert auf null. */
      const gen = betriebsartGen.current;
      ladeProgrammDatei(false).then((ok) => {
        if (!ok && betriebsartGen.current === gen) autoFetched.current = false;
      });
    }
  }, [bootDone, programm, snapshotFreigabe, ladeProgrammDatei]);

  /* ---- Programm-Snapshot-Import ---- */
  const importProgramm = useCallback(async (text) => {
    try {
      const parsed = JSON.parse(text);
      const data = normalisiereProgramm(parsed); // Alt- und film.at-Format
      const jetzt = Date.now();
      setProgramm(data);
      setProgrammArt("manuell");
      setProgStand(jetzt);
      setProgrammInfo(IMPORT_INFO(jetzt));      // eigenes Etikett statt des geerbten
      try {
        await store.set(K.programm, JSON.stringify({ fetchedAt: jetzt, art: "manuell", data }));
      } catch { /* Cache-Fehler nicht fatal */ }
      resolveError(ERROR_SCOPE.IMPORT_PROGRAMM);
      setTab("kino");
    } catch (e) {
      reportError(ERROR_SCOPE.IMPORT_PROGRAMM, "Programm-Import fehlgeschlagen: " + e.message);
    }
  }, [reportError, resolveError]);

  /* ---- Nonstop-HTML-Import: deterministisch geparst, kein KI-Call ---- */
  const importNonstop = useCallback(async (html) => {
    try {
      const p = parseNonstopHtml(html);
      if (!p.filme.length) throw new Error("Geparst, aber keine Wiener Vorstellungen enthalten.");
      const data = normalisiereProgramm({
        stand: new Date().toISOString().slice(0, 10),
        quelle_hinweis: "Nonstop-Agenda-Import: " + p.statistik.titel + " Filme / " + p.statistik.wien + " Wiener Vorstellungen (alle Abo-Kinos, ~1 Woche)",
        filme: p.filme,
        events: (programm && programm.events) || [],
        demnaechst: (programm && programm.demnaechst) || [], // Demnächst bleibt erhalten
      });
      const jetzt = Date.now();
      setProgramm(data);
      setProgrammArt("manuell");
      setProgStand(jetzt);
      setProgrammInfo(IMPORT_INFO(jetzt));      // eigenes Etikett statt des geerbten
      try {
        await store.set(K.programm, JSON.stringify({ fetchedAt: jetzt, art: "manuell", data }));
      } catch { /* Cache-Fehler nicht fatal */ }
      resolveError(ERROR_SCOPE.IMPORT_NONSTOP);
      setTab("kino");
    } catch (e) {
      reportError(ERROR_SCOPE.IMPORT_NONSTOP, "Nonstop-Import fehlgeschlagen: " + e.message);
    }
  }, [programm, reportError, resolveError]);

  /* ---- Film aktualisieren / hinzufügen ----
     Schlüssel ist film.id (stabil, aus der Masterliste). Erste Bearbeitung
     einer gebündelten Liste überführt sie in den Storage (mit Basis-Vermerk). */
  const naechsteHerkunft = useCallback(() => {
    return naechsteLokaleMasterHerkunft(masterHerkunftRef.current);
  }, []);

  /* ================= MUST-WATCH-LISTE (eigener persönlicher Topf) ================= */
  const {
    mustwatch, setMustwatch, mustwatchGeladen, ersetzeMustwatch,
    mustwatchRef, transaktionMustwatchVorbereitet,
    addMustwatch: persistiereNeuesMustwatch, updateMustwatch,
    mustwatchMasterIds, offeneFlags, migriereMustwatch, migrationsBericht,
  } = useMustwatchController({ master, masterRef, setErr });

  const {
    artikelListe, artikelListeRef, artikelGeladen, artikelGespeichertAm,
    setArtikelListe, schreibeArtikel, transaktionArtikel,
  } = useArticleController({ setErr });

  const personalDataTransaktionen = useMemo(() => erstellePersonalDataTransactionController({
    transaktionMustwatchVorbereitet,
    transaktionArtikel,
    transaktionMaster,
    masterRef,
  }), [
    transaktionMustwatchVorbereitet, transaktionArtikel, transaktionMaster,
  ]);
  const deleteMustwatch = personalDataTransaktionen.loescheMustwatch;

  /* Vollständiger Masterimport über alle drei Referenztöpfe. Die gekoppelte
     Transaktion rollt Teilfehler zurück; State und Navigation wechseln erst
     nach bestätigtem Artikel-, MW- und Masterstand. */
  const importMaster = useCallback(async (text) => {
    try {
      if (!mustwatchGeladen || !artikelGeladen) {
        throw new Error("Must-Watch und Artikel sind noch nicht sicher geladen — nichts überschrieben.");
      }
      const parsed = JSON.parse(text);
      const filme = Array.isArray(parsed) ? parsed : parsed.filme;
      if (!Array.isArray(filme) || filme.length === 0) throw new Error("Kein 'filme'-Array gefunden.");
      const mitIds = ensureIds(filme);
      const meta = Array.isArray(parsed) ? null : parsed.meta || null;
      const herkunft = { typ: "manuell", zeit: Date.now() };
      if (!await personalDataTransaktionen.ersetzeMaster(mitIds, { meta, herkunft })) {
        throw new Error("gekoppelte Speicherung fehlgeschlagen; der vorherige Stand wurde soweit möglich wiederhergestellt.");
      }
      resolveError(ERROR_SCOPE.IMPORT_MASTER);
      setTab("kino");
      return true;
    } catch (e) {
      reportError(ERROR_SCOPE.IMPORT_MASTER, "Master-Import fehlgeschlagen: " + e.message);
      return false;
    }
  }, [
    artikelGeladen, mustwatchGeladen, personalDataTransaktionen, reportError, resolveError,
  ]);

  /* Blog-Referenz-Universum = Master ∪ Must-Watch. */
  const mitMustwatch = baueRefUniversum;
  const refUniversum = useMemo(() => mitMustwatch(master, mustwatch), [master, mustwatch, mitMustwatch]);
  /* ================= BLOG: Artikel-Status & CRUD =================
     Artikel leben im Browser-Storage (kd:artikel) + Export im Einstellungen-Tab.
     "Erstellen" speichert sofort mit status "wartet" — nichts geht verloren. */
  const ohneAbgleichFelder = (a) => ({ ...a, liste: a.liste.map(({ abgleich, ...rest }) => rest), abgleichStat: undefined });

  const erstelleArtikel = useCallback(async (daten) => {
    let id = null;
    const ok = await schreibeArtikel((prev) => {
      id = neueArtikelId(daten.titel, prev);
      const universum = mitMustwatch(masterRef.current || [], mustwatchRef.current || []);
      const abg = gleicheArtikelAb({
        ...daten, id, status: "wartet", erstellt_am: new Date().toISOString(),
      }, universum);
      return [...prev, ohneAbgleichFelder(abg)];
    });
    return ok ? id : null;
  }, [mitMustwatch, mustwatchRef, schreibeArtikel]);

  const aktualisiereArtikel = useCallback(async (id, daten) => {
    const ok = await schreibeArtikel((prev) => {
      const alt = prev.find((a) => a.id === id);
      if (!alt) return prev;
      // Unveränderte Referenzen behalten ihre stabile ref; nur Neues wird abgeglichen.
      const liste = uebernehmeRefs(daten.liste, alt.liste);
      /* Ein vor dem neuen Zustandsmodell geteilter Artikel darf seine öffentliche
         Existenz beim Abschalten des Schalters nicht vergessen. */
      const publikation = alt.publikation || (alt.geteilt ? publicationState(alt) : undefined);
      const universum = mitMustwatch(masterRef.current || [], mustwatchRef.current || []);
      const abg = gleicheArtikelAb({ ...alt, ...daten, liste, status: "wartet", publikation }, universum);
      return prev.map((a) => (a.id === id ? ohneAbgleichFelder(abg) : a));
    });
    return ok ? id : null;
  }, [mitMustwatch, mustwatchRef, schreibeArtikel]);

  /* ---- Must-Watch CRUD (Liste ist die einzige Wahrheit) ---- */
  const addMustwatch = useCallback((daten) => persistiereNeuesMustwatch(daten, (next) => {
    /* Erst nach bestätigtem lokalem Speichern darf der neue Eintrag Blog-
       Rotlinks heilen; bei einem Rollback bliebe sonst eine Phantom-Referenz. */
    void schreibeArtikel((alist) => {
      const [geheilt, n] = heileRotlinks(alist, mitMustwatch(master, next));
      return n > 0 ? geheilt : alist;
    });
  }), [master, mitMustwatch, persistiereNeuesMustwatch, schreibeArtikel]);

  /* ---- Besitz-Nachtrag-Import (deterministisch, idempotent; queue-zeitig) ---- */
  const [besitzImportBericht, setBesitzImportBericht] = useState(null);
  const importiereBesitz = useCallback(async (text) => {
    try {
      const datei = parseBesitzImport(text);
      let auswertung = null, bestaetigterMaster = null;
      const gespeichert = await mutiereMaster((aktuell) => {
        auswertung = wendeBesitzImportAn(datei, aktuell, new Date().toISOString());
        if (!auswertung.neue.length) return { master: aktuell, unveraendert: true };
        bestaetigterMaster = ensureIds([...aktuell, ...auswertung.neue]);
        return { master: bestaetigterMaster, meta: masterMetaRef.current, herkunft: naechsteHerkunft() };
      });
      if (!gespeichert || !auswertung) throw new Error("bestätigtes Speichern fehlgeschlagen.");
      if (bestaetigterMaster && !await schreibeArtikel((prev) => {
        const [geheilt, n] = heileRotlinks(prev, mitMustwatch(bestaetigterMaster, mustwatchRef.current));
        return n > 0 ? geheilt : prev;
      })) throw new Error("Mediathek wurde gespeichert, aber Blog-Rotlinks konnten nicht geheilt werden.");
      const { bericht } = auswertung;
      setBesitzImportBericht({
        uebernommen: bericht.filter((b) => b.status === "übernommen").length,
        uebersprungen: bericht.filter((b) => b.status !== "übernommen").length,
        zeilen: bericht,
      });
      resolveError(ERROR_SCOPE.IMPORT_BESITZ);
    } catch (e) { reportError(ERROR_SCOPE.IMPORT_BESITZ, "Besitz-Import fehlgeschlagen: " + e.message); }
  }, [mitMustwatch, mustwatchRef, mutiereMaster, naechsteHerkunft, reportError, resolveError, schreibeArtikel]);

  const setzeArtikelRef = useCallback((id, index, ref, rotlinkOk) => (
    schreibeArtikel((prev) => (
      prev.map((a) => a.id !== id ? a : {
        ...a, liste: a.liste.map((le, i) => (i === index ? { ...le, ref: ref || null, rotlink_ok: !!rotlinkOk } : le)),
      })
    ))
  ), [schreibeArtikel]);

  /* Publish, Unpublish und „öffentlich entfernen, dann lokal löschen“ teilen
     genau einen beständigen Vorgang. Lokales Löschen geschieht erst nach
     bestätigtem Unpublish; Fehler bleiben am Artikel sichtbar und wiederholbar. */
  const fuehrePublikationsAktion = useCallback(async (artikel, aktion) => {
    if (!artikel || artikel.herkunft === "gezogen") return false;
    const vorgangId = publicationOperationId();
    if (!await schreibeArtikel((prev) => (
      prev.map((a) => a.id === artikel.id
        ? beginPublication(a, aktion, vorgangId)
        : a)
    ))) return false;
    try {
      const result = aktion === SHARED_PUBLICATION_ACTION.PUBLISH
        ? await sharedArticlesService.publish(artikel)
        : await sharedArticlesService.unpublish(artikel.id);
      return await schreibeArtikel((prev) => {
        const aktuell = prev.find((a) => a.id === artikel.id);
        /* Eine neuere Nutzeraktion besitzt eine andere Vorgangs-ID. Dann ist
           diese verspätete Antwort fachlich überholt und bleibt wirkungslos. */
        if (!aktuell || publicationState(aktuell).operationId !== vorgangId) return prev;
        return aktion === SHARED_PUBLICATION_ACTION.DELETE
          ? prev.filter((a) => a.id !== artikel.id)
          : prev.map((a) => a.id === artikel.id ? completePublication(a, vorgangId, result) : a);
      });
    } catch (error) {
      await schreibeArtikel((prev) => {
        const next = prev.map((a) => a.id === artikel.id
          ? failPublication(a, vorgangId, error?.code)
          : a);
        return next.some((a, i) => a !== prev[i]) ? next : prev;
      });
      setErr(
        aktion === SHARED_PUBLICATION_ACTION.PUBLISH
          ? "Veröffentlichen fehlgeschlagen: " + errorText(error)
          : "Öffentliches Entfernen fehlgeschlagen: " + errorText(error),
      );
      return false;
    }
  }, [schreibeArtikel]);

  const freigebeArtikel = useCallback(async (id) => {
    let freigegeben = null;
    const ok = await schreibeArtikel((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      freigegeben = { ...a, status: "freigegeben" };
      return freigegeben;
    }));
    if (!ok || !freigegeben) return false;
    if (freigegeben.herkunft === "gezogen") return true;
    const darfPublizieren = remoteKontoAktiv;
    if (freigegeben.geteilt && darfPublizieren) {
      void fuehrePublikationsAktion(freigegeben, SHARED_PUBLICATION_ACTION.PUBLISH);
    } else if (needsRemoteRemoval(freigegeben) && darfPublizieren) {
      void fuehrePublikationsAktion(freigegeben, SHARED_PUBLICATION_ACTION.UNPUBLISH);
    }
    return true;
  }, [schreibeArtikel, fuehrePublikationsAktion, remoteKontoAktiv]);

  const loescheArtikel = useCallback(async (id) => {
    const artikel = artikelListe.find((a) => a.id === id);
    if (!artikel) return false;
    if (needsRemoteRemoval(artikel)) {
      if (!remoteKontoAktiv) {
        setErr("Der Artikel besitzt noch eine öffentliche Kopie. Dafür ist ein aktiver Kontozugriff nötig, damit sie vor dem lokalen Löschen sicher entfernt werden kann.");
        return false;
      }
      return fuehrePublikationsAktion(artikel, SHARED_PUBLICATION_ACTION.DELETE);
    }
    return schreibeArtikel((prev) => prev.filter((a) => a.id !== id));
  }, [artikelListe, schreibeArtikel, fuehrePublikationsAktion, remoteKontoAktiv, setErr]);

  const wiederholePublikation = useCallback((id) => {
    const artikel = artikelListe.find((a) => a.id === id);
    const aktion = publicationRetryAction(artikel);
    if (artikel && aktion && remoteKontoAktiv) {
      void fuehrePublikationsAktion(artikel, aktion);
    }
  }, [artikelListe, fuehrePublikationsAktion, remoteKontoAktiv]);

  /* Einen geteilten Blog in die eigene Mediathek ziehen: lokale Kopie mit Herkunft,
     Referenzen gegen die eigene Master neu aufgelöst (fehlende = Rotlink). */
  const zieheSharedBlog = useCallback(async (sharedBlog) => {
    let art = null;
    const ok = await schreibeArtikel((prev) => {
      const universum = mitMustwatch(masterRef.current || [], mustwatchRef.current || []);
      art = blogZuArtikel(sharedBlog, prev, universum);
      return [...prev, art];
    });
    return ok ? art.id : null;
  }, [mitMustwatch, mustwatchRef, schreibeArtikel]);

  /* ---- Export-Wächter: ungesicherte Browser-Änderungen sichtbar machen ----
     Browser-Speicher ist kein Backup. Sobald der Storage-Stand jünger ist
     als der letzte Export, markiert Settings den zuständigen Backup-Bereich. */
  const { markiereExport, backupGesamt, ungesichertMaster, ungesichertArtikel } = useBackupExportController({
    masterHerkunft,
    artikelListe,
    artikelGespeichertAm,
    owner: storageOwnerKennung(),
    onFehler: setErr,
  });
  const sicherungOffen = ungesichertMaster || ungesichertArtikel;
  const oeffneSicherung = useCallback(() => {
    navigiere("daten");
    /* Die normale Bereichsnavigation stellt ihre alte Scrollposition nach zwei
       Frames wieder her. Derselbe Takt springt anschließend bewusst genauer
       zum markierten Arbeitsort, statt nur oben in Settings zu landen. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ziel = document.getElementById("gesamt-backup");
      const reduzierteBewegung = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
      ziel?.scrollIntoView?.({ block: "start", behavior: reduzierteBewegung ? "auto" : "smooth" });
      ziel?.querySelector("summary")?.focus?.({ preventScroll: true });
    }));
  }, [navigiere]);

  /* Hilfe ist nun ausschließlich nutzerinitiiert. Die frühere automatische
     Tour bei Tabwechseln und Scrollereignissen ist aus dem Laufzeitpfad entfernt. */
  const [klaerung, setKlaerung] = useState(null); // Quellen-Klärung nach KI-Import

  /* ---- Artikel-Export/-Import (Sicherung, analog Master) ---- */
  const exportArtikel = useCallback(() => {
    const blob = new Blob([JSON.stringify({ exportiert_am: new Date().toISOString(), artikel: artikelListe }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "artikel.json";
    try { starteEinzelExportDownload(a, markiereExport, "artikel", artikelGespeichertAm); }
    finally { URL.revokeObjectURL(url); }
  }, [artikelGespeichertAm, artikelListe, markiereExport]);
  const importArtikel = useCallback(async (text) => {
    try {
      const p = JSON.parse(text);
      const liste = Array.isArray(p) ? p : p.artikel;
      if (!Array.isArray(liste)) throw new Error("Kein 'artikel'-Array gefunden.");
      // KD-006: Schema-Müll ablehnen statt zu persistieren (sonst Blog-Crash an a.liste.map/a.text).
      if (!liste.every(gueltigerArtikel)) throw new Error("Datei enthält ungültige Artikel (id/titel/text/liste) — nicht importiert.");
      if (!await schreibeArtikel(() => {
        const universum = mitMustwatch(masterRef.current || [], mustwatchRef.current || []);
        return liste.map((artikel) => ohneAbgleichFelder(gleicheArtikelAb(artikel, universum)));
      })) throw new Error("bestätigtes Speichern fehlgeschlagen.");
      resolveError(ERROR_SCOPE.IMPORT_ARTIKEL);
      return true;
    } catch (e) { reportError(ERROR_SCOPE.IMPORT_ARTIKEL, "Artikel-Import fehlgeschlagen: " + e.message); }
    return false;
  }, [mitMustwatch, mustwatchRef, reportError, resolveError, schreibeArtikel]);

  /* ---- Teilen & Tauschen (Phase A): Autorname + Bulk-Übernahme ---- */
  const [autorName, setAutorName] = useState("");
  useEffect(() => {
    store.get(K.autorName).then((r) => { if (r && r.value) setAutorName(r.value); }).catch(() => {});
  }, []);
  const saveAutorName = useCallback((v) => {
    setAutorName(v);
    store.set(K.autorName, v).catch(() => {});
  }, []);

  /* Paket-Übernahme als EIN Commit: Master einmal persistieren, Artikel
     anhängen, danach Rotlink-Heilung über ALLE Artikel (neue Filme können
     auch alte Rotlinks schließen). */
  const uebernehmePaket = useCallback(async ({ neueFilme, neueArtikel }) => {
    let neuerMaster = masterRef.current || [];
    if (neueFilme.length) {
      const gespeichert = await mutiereMaster((aktuell) => {
        const ids = new Set(aktuell.map((film) => film.id));
        const wirklichNeu = neueFilme.filter((film) => film?.id && !ids.has(film.id) && ids.add(film.id));
        if (!wirklichNeu.length) { neuerMaster = aktuell; return { master: aktuell, unveraendert: true }; }
        neuerMaster = ensureIds([...aktuell, ...wirklichNeu]);
        return { master: neuerMaster, meta: masterMetaRef.current, herkunft: naechsteHerkunft() };
      });
      if (!gespeichert) return false;
      if (neueFilme.some((f) => f.quelle_unklar)) {
        setKlaerung(neuerMaster.filter((f) => f.quelle_unklar).map((f) => ({ id: f.id, titel: f.titel, jahr: f.jahr })));
      }
    }
    return schreibeArtikel((prev) => {
      let next = neueArtikel.length ? [...prev, ...neueArtikel] : prev;
      const [geheilt, n] = heileRotlinks(next, mitMustwatch(neuerMaster, mustwatchRef.current));
      if (n > 0) next = geheilt;
      return next;
    });
  }, [mitMustwatch, mustwatchRef, mutiereMaster, naechsteHerkunft, schreibeArtikel]);

  /* Kandidaten für den Must-Watch-Verknüpfungs-Picker (explizit, kein Auto-Match):
     Master (id) · Kinoprogramm (film_at_id — nur Einträge MIT stabiler ID) ·
     Streaming-Entdecken (watchmode_id). */
  const mwKandidaten = useMemo(() => ({
    master: (master || []).map((f) => ({ id: f.id, titel: f.titel, jahr: f.jahr })),
    programm: ((programm && programm.filme) || []).filter((pf) => pf.film_at_id).map((pf) => ({ id: pf.film_at_id, titel: pf.t, jahr: pf.j })),
    streaming: ((streamingEntdecken && streamingEntdecken.titel) || []).map((t) => ({ id: t.watchmode_id, titel: t.titel, jahr: t.jahr })),
  }), [master, programm, streamingEntdecken]);

  /* ---- Navigation zwischen Blog und Mediathek ---- */
  const [blogFokus, setBlogFokus] = useState(null);
  const [mediathekFokus, setMediathekFokus] = useState(null);
  const [kinoFokus, setKinoFokus] = useState(null);
  const [streamingFokus, setStreamingFokus] = useState(null);
  const ladeStreamingDateienRef = useRef(null), streamingSprungLaufRef = useRef(0);
  const springeZuFilm = useCallback((ref) => { setMediathekFokus(ref); setExpandedId("b" + ref); setTab("mediathek"); }, []);
  const springeZuStreaming = useCallback(async (fokus) => {
    const lauf = ++streamingSprungLaufRef.current; setTab("streaming");
    /* Erst den Vollkatalog übernehmen; sonst verschiebt sein Render die bereits fokussierte Snapshot-Karte. */
    try { await ladeStreamingDateienRef.current?.(true); } catch { /* Tab bleibt nutzbar */ }
    if (streamingSprungLaufRef.current !== lauf) return;
    setStreamingFokus({ ...fokus, auftrag: lauf });
  }, []);
  const springeZuMustwatchRef = useCallback((verknuepfung, eintrag) => {
    const plan = planeMustwatchSprung(verknuepfung, eintrag, master);
    if (plan?.bereich === "mediathek") return springeZuFilm(plan.fokus);
    if (plan?.bereich === "kino") {
      setZeigeAlles(plan.zeigeAlles); setKinoFokus(plan.fokus);
      navigiere("kino");
    } else if (plan?.bereich === "streaming") void springeZuStreaming(plan.fokus);
  }, [master, navigiere, springeZuFilm, springeZuStreaming]);
  const springeZuArtikel = useCallback((id) => { setBlogFokus(id); setTab("blog"); }, []);

  const updateFilm = useCallback((id, changes) => mutiereMaster((aktuell) => {
    if (!aktuell.some((film) => film.id === id)) return { abgebrochen: true };
    return {
      master: ensureIds(aktuell.map((film) => film.id === id ? { ...film, ...changes } : film)),
      meta: masterMetaRef.current, herkunft: naechsteHerkunft(),
    };
  }), [mutiereMaster, naechsteHerkunft]);
  const deleteFilm = useCallback(async (id) => {
    if (!mustwatchGeladen || !artikelGeladen) {
      setErr("Eintrag kann erst gelöscht werden, wenn Must-Watch und Artikel sicher geladen sind. Es wurde nichts verändert.");
      return false;
    }
    const aktuell = masterRef.current || [];
    const film = aktuell.find((eintrag) => eintrag.id === id);
    if (!film) return false;
    const vorschau = planeFilmLoeschung(aktuell, artikelListeRef.current, mustwatchRef.current, id);
    const teile = [];
    if (vorschau.folgen.artikelRefs) teile.push(`${vorschau.folgen.artikelRefs} Blog-Verweis${vorschau.folgen.artikelRefs === 1 ? " wird" : "e werden"} wieder zum Rotlink`);
    if (vorschau.folgen.mustwatchRefs) teile.push(`${vorschau.folgen.mustwatchRefs} Must-Watch-Verknüpfung${vorschau.folgen.mustwatchRefs === 1 ? " wird" : "en werden"} gelöst`);
    const folgeText = teile.length ? `\n\n${teile.join("; ")}.` : "";
    if (!window.confirm(`„${film.titel}“ wirklich aus der Mediathek löschen?${folgeText}`)) return false;
    const ok = await personalDataTransaktionen.loescheFilm(id, {
      meta: masterMeta,
      herkunft: naechsteHerkunft(),
    });
    if (!ok) return false;
    setExpandedId(null);
    return true;
  }, [
    artikelGeladen, masterMeta, mustwatchGeladen, mustwatchRef, naechsteHerkunft,
    personalDataTransaktionen,
  ]);
  const planeFilmBatchLoeschung = useCallback((ids) => { if (!mustwatchGeladen || !artikelGeladen) { setErr("Mehrfachlöschen ist erst möglich, wenn Must-Watch und Artikel sicher geladen sind. Es wurde nichts verändert."); return null; } try { return personalDataTransaktionen.planeFilmLoeschungen(ids); } catch { setErr("Die Löschfolgen konnten nicht sicher geprüft werden. Es wurde nichts verändert."); return null; } }, [artikelGeladen, mustwatchGeladen, personalDataTransaktionen]);
  const fuehreFilmBatchLoeschungAus = useCallback(async (ids, plan) => { if (!mustwatchGeladen || !artikelGeladen) { setErr("Mehrfachlöschen ist erst möglich, wenn Must-Watch und Artikel sicher geladen sind. Es wurde nichts verändert."); return false; } try { return await personalDataTransaktionen.loescheFilme(ids, { plan, meta: masterMetaRef.current, herkunft: naechsteHerkunft() }); } catch { return false; } }, [artikelGeladen, mustwatchGeladen, naechsteHerkunft, personalDataTransaktionen]);
  const uebernehmeQuellenKlaerung = useCallback(async (map) => {
    const ok = await mutiereMaster((aktuell) => ({
      master: aktuell.map((film) => map[film.id] !== undefined
        ? { ...film, quelle: map[film.id], quelle_unklar: undefined }
        : film),
      meta: masterMetaRef.current, herkunft: naechsteHerkunft(),
    }));
    if (ok) setKlaerung(null);
  }, [mutiereMaster, naechsteHerkunft]);
  /* Gibt die neue ID zurück (Blog-Rotlink-Anlage setzt damit sofort die ref).
     Nach jedem neuen Eintrag: automatische Rotlink-Heilung über alle Artikel —
     nur eindeutige Exakt-Treffer, nichts wird geraten. */
  const addFilm = useCallback(async (film) => {
    const id = film.id || slugId(film.titel, film.jahr);
    let next = null, doppelt = false;
    const ok = await mutiereMaster((aktuell) => {
      if (aktuell.some((eintrag) => eintrag.id === id)) {
        doppelt = true;
        return { abgebrochen: true };
      }
      next = [...aktuell, ensureIds([{ ...film, id }])[0]];
      return { master: next, meta: masterMetaRef.current, herkunft: naechsteHerkunft() };
    });
    if (!ok) {
      if (doppelt) {
      setErr("Eintrag existiert bereits: " + film.titel + (film.jahr ? " (" + film.jahr + ")" : ""));
      }
      return null;
    }
    await schreibeArtikel((prev) => {
      const [geheilt, n] = heileRotlinks(prev, mitMustwatch(next, mustwatchRef.current));
      if (n > 0) return geheilt;
      return prev;
    });
    return id;
  }, [mitMustwatch, mustwatchRef, mutiereMaster, naechsteHerkunft, schreibeArtikel, setErr]);

  const addFilme = useCallback(async (filme) => {
    let next = null, neue = [];
    const ok = await mutiereMaster((aktuell) => {
      const ids = new Set(aktuell.map((film) => film.id));
      neue = [];
      for (const film of filme || []) {
        const id = film.id || slugId(film.titel, film.jahr);
        if (!id || ids.has(id)) continue;
        ids.add(id);
        neue.push(ensureIds([{ ...film, id }])[0]);
      }
      if (!neue.length) return { master: aktuell, unveraendert: true };
      next = [...aktuell, ...neue];
      return { master: next, meta: masterMetaRef.current, herkunft: naechsteHerkunft() };
    });
    if (!ok) return null;
    if (!neue.length) return [];
    await schreibeArtikel((prev) => {
      const [geheilt, n] = heileRotlinks(prev, mitMustwatch(next, mustwatchRef.current));
      return n > 0 ? geheilt : prev;
    });
    return neue.map((f) => f.id);
  }, [mitMustwatch, mustwatchRef, mutiereMaster, naechsteHerkunft, schreibeArtikel]);

  const serienKatalog = useMemo(() => [
    ...((streamingBekannt && streamingBekannt.titel) || []),
    ...((streamingEntdecken && streamingEntdecken.titel) || []),
  ], [streamingBekannt, streamingEntdecken]);

  /* Ausdrücklich beobachtete Serien erhalten den ersten verfügbaren Staffel-/
     Folgenstand still als Basis. „Gesehen“ allein aktiviert den Radar nicht. */
  useEffect(() => {
    if (!serienKatalog.length) return;
    schreibeEntdeckenStatus((prev) => initialisiereStaffelstaende(prev, serienKatalog));
  }, [serienKatalog, schreibeEntdeckenStatus]);

  /* Nur bei fachlich aktivem Kontozugriff: deduplizierte Watchmode-IDs für den
     bestehenden planmäßigen Kataloglauf bereitstellen. Dies ist kein
     Watchmode-Aufruf und erzeugt weder Radar-Regeln noch Präferenzen. */
  const letzterSerienWatchSync = useRef("");
  useEffect(() => {
    if (!remoteKontoAktiv || !bootDone) return undefined;
    const expectedAccountId = String(session.account?.id || "");
    if (!expectedAccountId) return undefined;
    const ids = serienBeobachten(entdeckenStatus, serienKatalog).map((e) => e.watchmode_id);
    /* Die Deduplizierung ist kontogebunden: A und B dürfen selbst bei
       identischen beobachteten IDs niemals denselben Erfolgsmarker teilen. */
    const signatur = expectedAccountId + "|" + JSON.stringify(ids);
    if (signatur === letzterSerienWatchSync.current) return undefined;
    const timer = setTimeout(() => {
      seriesWatchService.setObserved(ids, expectedAccountId).then((r) => {
        if (r?.ok) letzterSerienWatchSync.current = signatur;
      }).catch(() => { /* lokaler Status bleibt; späterer Zustandswechsel versucht erneut */ });
    }, 800);
    return () => clearTimeout(timer);
  }, [remoteKontoAktiv, session.account?.id, bootDone, entdeckenStatus, serienKatalog]);

  const bestaetigeSerienHinweis = useCallback((watchmodeId) => {
    const t = serienKatalog.find((x) => String(x.watchmode_id) === String(watchmodeId));
    if (!t) return;
    schreibeEntdeckenStatus((prev) => ({ ...prev, [watchmodeId]: bestaetigeStaffel(prev[watchmodeId], t) }));
  }, [serienKatalog, schreibeEntdeckenStatus]);
  const { radarAuthority, sichtbarerRadarState, radarPreviewTarget, setRadarPreviewTarget, schliesseRadarPreview,
    aendereSerienBeobachtung, aendereRadar, aendereRadarShare, bestaetigeRadarVorschau,
    beobachteteWatchmodeIds, radarTargetIds, fuehreGlobaleSuchaktionAus,
    radarPilotClientEnabled, radarPilotActive, radarPilotEvents, radarReview, radarPilotSyncStatus,
    fuehreRadarPilotReceipt, fuehreRadarPilotImport, fuehreRadarPilotSync, } = useEntdeckenRadarController({
    session, remoteKontoAktiv, bootDone, master, streamingKnown: streamingBekannt, streamingDiscover: streamingEntdecken,
    entdeckenStatus, entdeckenStatusRef, schreibeEntdeckenStatus, serienKatalog, setErr, });
  const {
    accountId,
    vorbewertungAktiv,
    vorbewertungSperrgrund,
    prognoseLaufId,
    prognoseFehler,
    aktuelleProfilVersion,
    starteVorbewertung,
    setzeFilmPrognoseStatus,
    addFilmMitPrognose,
    filmwissenLesenAktiv,
    filmwissenRechercheAktiv,
    filmwissenProFilm,
    filmwissenRechercheLaufId,
    ladeFilmwissen,
    recherchiereFilmwissen,
  } = useIntelligenceController({
    tab,
    session,
    master,
    masterMeta,
    mustwatch,
    mitMustwatch,
    naechsteHerkunft,
    mutiereMaster,
    schreibeArtikel,
    setErr,
  });

  /* ---- Startwahl treffen/ändern (Modal & Einstellungen-Tab) ----
     Schreibt kd:start und lädt entsprechend. "Startart wechseln" (Einstellungen-Tab)
     verwirft dabei den Browser-Stand — beide Wege ohne Datei-Gefummel. */
  const waehleStart = useCallback(async (wahl) => {
    if (wahl !== "clean" && wahl !== "demo") return;
    /* Etappe 3: Im Kontobetrieb würde ein Startart-Wechsel den lokalen Bestand
       leeren — der nächste Abgleich holte ihn aber sofort aus dem Konto zurück.
       Statt dieses verwirrende Hin und Her: sauber sperren und erklären. */
    if (session.mode === "account") {
      setErr("Startart wechseln geht nur ohne Konto. Melde dich unter Settings → Konto ab; deine Daten auf diesem Gerät bleiben dabei erhalten.");
      setStartModalOffen(false);
      return;
    }
    let aktuelle = null;
    try { aktuelle = localStorage.getItem(K.start); } catch { /* */ }
    if (startWahlBestaetigt() && aktuelle === wahl) {
      setStartModalOffen(false);
      if (!snapshotsFrei()) setKatalogZugangOffen(true);
      return;
    }
    const hatPersoenlicheDaten = !!((master && master.length) || artikelListe.length || mustwatch.length || merkliste.length || kinoPins.length);
    const istWechsel = startWahlBestaetigt() && aktuelle && aktuelle !== wahl;
    const brauchtGekoppelteLeerung = istWechsel || hatPersoenlicheDaten;
    if (brauchtGekoppelteLeerung && hatPersoenlicheDaten
      && !window.confirm("Startmodus wechseln?\n\nDabei wird die aktuelle Mediathek im Browser verworfen. Lade vorher ein Gesamt-Backup herunter, wenn du sie behalten möchtest.")) return;
    if (brauchtGekoppelteLeerung) {
      if (!mustwatchGeladen || !artikelGeladen) {
        setErr("Startmodus kann erst gewechselt werden, wenn Must-Watch und Artikel sicher geladen sind. Es wurde nichts verändert.");
        return;
      }
    }
    const startwahl = bereiteStartwahlVor({
      storage: localStorage, wahl,
      startKey: K.start, versionKey: K.startVersion, seedKey: K.demoSeed,
      version: START_WAHL_VERSION,
    });
    if (!startwahl.ok) {
      setErr("Startmodus konnte auf diesem Gerät nicht gespeichert werden. Es wurde nichts verändert.");
      return;
    }
    const grunddatenOk = brauchtGekoppelteLeerung
      ? await personalDataTransaktionen.ersetzeMaster([], {
        meta: null, herkunft: null, loeschen: true,
      })
      : await loescheMaster();
    if (!grunddatenOk) {
      startwahl.rollback();
      setErr(brauchtGekoppelteLeerung
        ? "Startmodus konnte nicht sicher gewechselt werden. Der bisherige Stand bleibt soweit möglich erhalten."
        : "Startmodus konnte nicht sicher vorbereitet werden.");
      return;
    }
    try { setupUeberspringen(); } catch { /* Einstieg bleibt im Zweifel sichtbar. */ }
    setStartModalOffen(false);
    if (!snapshotsFrei()) {
      setKatalogZugangOffen(true);
      return;
    }
    /* Ein Reload hält den Start atomar: Demo-Seeds werden vor allen übrigen
       Storage-Effekten geladen, Clean startet garantiert ohne Alt-Master. */
    try { location.reload(); } catch { setSnapshotFreigabe(true); setStartTick((t) => t + 1); }
  }, [
    artikelGeladen, artikelListe, kinoPins, loescheMaster, master, merkliste,
    mustwatch, mustwatchGeladen, personalDataTransaktionen, session.mode,
  ]);
  const oeffneStartWahl = useCallback(() => setStartModalOffen(true), []);

  /* Entfernt ausschließlich die beim Demo-Start protokollierten Beilagen.
     Standardisiertes Kino-/Streamingprogramm und spätere Tester-Einträge bleiben. */
  const entferneDemoDaten = useCallback(async () => {
    /* Wie beim Startart-Wechsel: lokales Entfernen käme beim nächsten Abgleich
       aus dem Konto zurück. Erst abmelden, dann aufräumen. */
    if (session.mode === "account") {
      setErr("Demo-Daten entfernen geht nur ohne Konto. Melde dich unter Settings → Konto ab; deine Daten auf diesem Gerät bleiben dabei erhalten.");
      return;
    }
    if (!mustwatchGeladen || !artikelGeladen) {
      setErr("Demo-Daten können erst entfernt werden, wenn Must-Watch und Artikel sicher geladen sind. Es wurde nichts verändert.");
      return;
    }
    let seed = {};
    try { seed = JSON.parse(localStorage.getItem(K.demoSeed) || "{}"); } catch { /* */ }
    /* Kompatibilität mit einem kurz ausgelieferten Seed-Format, das diese drei
       Bereiche nur als Boolean protokollierte: Demo erneut read-only laden und
       daraus exakte IDs bilden. Scheitert das Netz, wird lieber zu wenig als ein
       später vom Tester ergänzter Eintrag gelöscht. */
    const legacyPins = seed.pins && !Array.isArray(seed.pinKeys);
    const legacyMerkliste = seed.merkliste && !Array.isArray(seed.merklisteIds);
    const legacyStreaming = seed.streaming && !Array.isArray(seed.streamingQuellen);
    if (legacyPins || legacyMerkliste || legacyStreaming) {
      try {
        const alt = await demoLadung();
        if (legacyPins) {
          if (!Array.isArray(alt.pins)) throw new Error("Demo-Pins fehlen");
          seed.pinKeys = alt.pins.map((p) => String(p.t || "") + "|" + String(p.z || ""));
        }
        if (legacyMerkliste) {
          if (!Array.isArray(alt.merkliste)) throw new Error("Demo-Merkliste fehlt");
          seed.merklisteIds = alt.merkliste.map((m) => String(m.watchmode_id));
        }
        if (legacyStreaming) {
          if (!Array.isArray(alt.streaming?.quellen)) throw new Error("Demo-Streamingdienste fehlen");
          seed.streamingQuellen = [...alt.streaming.quellen];
        }
      } catch {
        setErr("Alte Demo-Daten können gerade nicht sicher zugeordnet werden. Bitte Datenbankverbindung prüfen und erneut versuchen; es wurde nichts gelöscht.");
        return;
      }
    }
    const masterIds = new Set(seed.masterIds || []);
    const mwIds = new Set(seed.mustwatchIds || []);
    const artIds = new Set(seed.artikelIds || []);
    const grunddatenOk = await personalDataTransaktionen.transformiereGrunddaten({
      berechneMaster: (liste) => liste.filter((film) => !masterIds.has(film.id)),
      berechneMustwatch: (liste) => liste.filter((eintrag) => !mwIds.has(eintrag.id)),
      berechneArtikel: (liste) => liste.filter((artikel) => !artIds.has(artikel.id)),
      meta: masterMeta,
      herkunft: (next) => next.length
        ? { typ: "storage", zeit: Date.now(), basis: "Clean nach Demo" }
        : null,
    });
    if (!grunddatenOk) return;
    if (Array.isArray(seed.pinKeys)) {
      const demoPins = new Set(seed.pinKeys.map(String));
      const nextPins = kinoPins.filter((p) => !demoPins.has(String(p.t || "") + "|" + String(p.z || "")));
      setKinoPins(nextPins);
      persistPins(nextPins);
    }
    if (Array.isArray(seed.merklisteIds)) {
      const demoMerker = new Set(seed.merklisteIds.map(String));
      const nextMerkliste = merkliste.filter((m) => !demoMerker.has(String(m.watchmode_id)));
      setMerkliste(nextMerkliste);
      persistMerk(nextMerkliste);
    }
    if (Array.isArray(seed.streamingQuellen)) {
      const demoQuellen = new Set(seed.streamingQuellen.map(String));
      const nextAuswahl = auswahl.filter((q) => !demoQuellen.has(String(q)));
      setAuswahlRoh(nextAuswahl);
      store.set(K.streamingDienste, JSON.stringify({ quellen: nextAuswahl, heuristik: true })).catch(() => {});
      setHeuristikAn(true);
    }
    try {
      localStorage.setItem(K.start, "clean");
      localStorage.setItem(K.startVersion, START_WAHL_VERSION);
      localStorage.removeItem(K.demoSeed);
    } catch { /* */ }
    setErr(""); setStartTick((t) => t + 1);
  }, [
    session.mode, masterMeta, artikelListe, artikelGeladen, mustwatchGeladen, kinoPins, merkliste, auswahl,
    persistPins, persistMerk, personalDataTransaktionen,
  ]);

  /* ---- Master-Export (hält Max' Datei synchron) ---- */
  const exportMaster = useCallback(() => {
    const meta = { ...(masterMeta || {}), export_am: new Date().toISOString().slice(0, 10), anzahl_eintraege: master.length };
    const blob = new Blob([JSON.stringify({ meta, filme: master }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "max_filmguide_masterliste_export.json";
    try { starteEinzelExportDownload(a, markiereExport, "master", masterHerkunft?.zeit); }
    finally { URL.revokeObjectURL(url); }
  }, [master, masterHerkunft?.zeit, masterMeta, markiereExport]);

  const kinoMatches = useMemo(
    () => baueKinoMatches(programm, master),
    [programm, master],
  );
  /* ---- Finder-Master: Master + Wikidata-Sidecar (Reihe/Franchise/Regie als Namen).
     Additiv, read-only respektiert — nur für die Suche/Detailkarte angereichert.
     Bei fehlendem Sidecar (leer) oder fremden IDs (Tester) bleibt f unverändert. ---- */
  const finderMaster = useMemo(() => reicheFinderMasterAn(master), [master]);

  /* ---- "Läuft auch": nur Filme mit Vorstellung ab Zeitgrenze ---- */
  const restSichtbar = useMemo(() => {
    if (zeigeAlles) return kinoMatches.rest;
    const g = grenzeInMinuten(zeitgrenze);
    return kinoMatches.rest.filter((pf) => hatVorstellungAb(pf, g));
  }, [kinoMatches, zeitgrenze, zeigeAlles]);

  /* ---- Nachtrag: nur Titel zeigen, die (noch) nicht in der Master sind ----
     Laufzeit-Abgleich statt Datenpflege — heilt sich selbst, wenn Titel
     aus dem Nachtrag in die Master übernommen werden. */
  const nachtragSichtbar = useMemo(() => sichtbarerNachtrag(master), [master]);

  /* ---- Streaming-Daten direkt aus dem Katalog. „Mein Programm" wird lokal
     gegen die aktive Masterliste gebaut. ---- */
  /* Finder-Suchverlauf im App-State halten -> überlebt Tab-Wechsel (App bleibt
     montiert; FinderTab wird beim Tab-Wechsel ab-/wieder-montiert). */
  const [finderVerlauf, setFinderVerlauf] = useState([]);
  const [finderEingabe, setFinderEingabe] = useState("");
  const [finderSuchauftrag, setFinderSuchauftrag] = useState(null);
  const [globaleSuchantwort, setGlobaleSuchantwort] = useState(null);
  const globaleSucheLaufRef = useRef(0);
  const starteGlobaleSuche = useCallback(async ({ text, scope }) => {
    const lauf = ++globaleSucheLaufRef.current;
    const bevorzugterBereich = scope || tabRef.current || "alles";
    /* Eine globale Suche verspricht alle Bereiche. Deshalb vor der Antwort den
       Entdecken-Vollkatalog laden und den Rückgabewert direkt benutzen: auf den
       asynchronen React-State des nächsten Renders zu warten wäre ein Race und
       würde außerhalb des Streaming-Tabs weiter nur den Top-Snapshot suchen. */
    const geladeneAnsichten = await ladeStreamingDateienRef.current?.(true);
    if (lauf !== globaleSucheLaufRef.current) return;
    const antwort = erstelleFinderAntwort({
      text, bevorzugterBereich, master: finderMaster || [], kinoMatches,
      streamingBekannt: geladeneAnsichten?.bekannt || streamingBekannt,
      streamingEntdecken: geladeneAnsichten?.entdecken || streamingEntdecken,
      artikel: artikelListe,
    });
    setGlobaleSuchantwort({
      frage: text, bevorzugterBereich,
      ...kompakteFinderTreffer(antwort, bevorzugterBereich),
    });
  }, [finderMaster, kinoMatches, streamingBekannt, streamingEntdecken, artikelListe]);
  const oeffneAusfuehrlicheSuche = useCallback(() => {
    if (!globaleSuchantwort?.frage) return;
    const { frage: text, bevorzugterBereich: scope } = globaleSuchantwort;
    setFinderEingabe(text);
    setFinderSuchauftrag({ id: Date.now() + ":" + Math.random(), text, scope });
    setGlobaleSuchantwort(null);
    navigiere("finder");
  }, [globaleSuchantwort, navigiere]);
  const oeffneGlobalenTreffer = useCallback((treffer) => {
    setGlobaleSuchantwort(null);
    if (treffer.typ === "film" && treffer.bereich === "kino") {
      setZeigeAlles(true);
      setExpandedId("k" + treffer.ref);
      setKinoFokus({ art: treffer.zielArt || "film", ref: treffer.ref, titel: treffer.titel });
      navigiere("kino");
    } else if (treffer.typ === "film" && treffer.bereich === "streaming") {
      void springeZuStreaming({ art: treffer.zielArt || "programm", ref: treffer.ref, titel: treffer.titel });
    } else if (treffer.typ === "film") springeZuFilm(treffer.ref);
    else if (treffer.typ === "blog") springeZuArtikel(treffer.ref);
    else if (treffer.typ === "hilfe" && treffer.ziel) navigiere(treffer.ziel);
    else if (treffer.typ === "kino") {
      setZeigeAlles(true);
      setKinoFokus({ art: treffer.zielArt || "programm", ref: treffer.ref, titel: treffer.titel });
      navigiere("kino");
    } else if (treffer.typ === "streaming") {
      void springeZuStreaming({ art: treffer.zielArt || "entdecken", ref: treffer.ref, titel: treffer.titel });
    }
  }, [navigiere, springeZuArtikel, springeZuFilm, springeZuStreaming]);
  const toggleGlobalesMenu = useCallback(() => {
    setGlobaleSuchantwort(null);
    toggleMehr();
  }, [toggleMehr]);
  const navigiereAusGlobalemMenu = useCallback((ziel) => {
    setGlobaleSuchantwort(null);
    if (ziel === "daten" && sicherungOffen) oeffneSicherung();
    else navigiere(ziel);
  }, [navigiere, oeffneSicherung, sicherungOffen]);
  /* KD-031: `vollKatalog` trennt das leichte Boot-Nachladen vom teuren
     Entdecken-Katalog. Ohne Flag (Boot/Badges): nur die leichte streaming_bekannt
     + der schon gebündelte Top-500-Snapshot als Ersatz fürs Dashboard. Mit Flag
     (Streaming-Tab offen): der volle 3,8-MB-Entdecken-Katalog wird gefetcht/geparst. */
  const ladeStreamingDateien = useCallback(async (vollKatalog = false) => {
    if (!snapshotFreigabe) return;
    /* Wie beim Programm: eine Antwort, die zu einer inzwischen überholten
       Betriebsart gehört, darf die Anzeige nicht mehr anfassen. */
    const gen = betriebsartGen.current;
    const veraltet = () => betriebsartGen.current !== gen;
    const holeEinmal = async (ref, bereich, timeout) => {
      if (ref.current) return ref.current;
      const lauf = catalogService.loadArea(bereich, { timeout });
      ref.current = lauf;
      try { return await lauf; }
      finally { if (ref.current === lauf) ref.current = null; }
    };
    const uebernehmeInfo = (r, scope) => {
      const ausCache = r.quelle === "cache";
      setStreamingInfo({
        art: ausCache ? "cache" : "datenbank", variante: r.variante,
        stand: zeitpunkt(r.stand) ?? (ausCache ? r.gecachtAm : Date.now()),
        gueltigBis: zeitpunkt(r.gueltigBis), abgelaufen: !!r.abgelaufen,
        ausCache, anmeldungNoetig: !!r.anmeldungNoetig, fehler: null,
        code: ausCache ? (r.code || null) : null,
      });
      if (ausCache && r.code === ERROR_CODES.INVALID_KEY) reportError(scope, "Streamingkatalog aus dem letzten Browser-Stand — der hinterlegte Zugangsschlüssel wird gerade abgelehnt (Settings → Datenmodus & Verbindung).");
      else if (ausCache && r.warnung) reportError(scope, "Streamingkatalog aus dem letzten Browser-Stand geladen (DB derzeit nicht erreichbar).");
      else if (r.abgelaufen) reportError(scope, "Dieser Streaming-Schnappschuss ist abgelaufen und zeigt nicht mehr die aktuelle Verfügbarkeit.");
      else resolveError(scope);
    };
    const meldeFehler = (e, scope, entdeckenTeil = false) => {
      const code = e?.code || null;
      const anmeldungNoetig = code === ERROR_CODES.UNAUTHENTICATED;
      const text = anmeldungNoetig
        ? "Für den aktuellen Streamingkatalog ist eine Anmeldung nötig — melde dich unter Settings → Konto an."
        : code === ERROR_CODES.NO_DEMO_DATA
          ? "Für den öffentlichen Zugang sind noch keine Beispieldaten veröffentlicht. Mit einer Anmeldung siehst du den laufenden Streamingkatalog."
          : code === ERROR_CODES.INVALID_KEY
            ? "Der hinterlegte Zugangsschlüssel wird von der Datenbank nicht akzeptiert — prüfe ihn unter Settings → Datenmodus & Verbindung."
            : (entdeckenTeil ? "Entdecken-Katalog" : "Streamingkatalog") + " nicht ladbar: " + errorText(e);
      reportError(scope, text);
      setStreamingInfo((vorher) => (vorher && vorher.art
        ? {
          ...vorher,
          abgelaufen: Number.isFinite(vorher.gueltigBis) ? vorher.gueltigBis < Date.now() : vorher.abgelaufen,
          anmeldungNoetig, fehler: text, code,
        }
        : { art: null, variante: null, stand: null, gueltigBis: null, abgelaufen: false, ausCache: false, anmeldungNoetig, fehler: text, code }));
    };

    let roh = streamingRohRef.current || { bekannt: null, entdecken: null };
    if (!streamingGeladen.current || !roh.bekannt) {
      try {
        const r = await holeEinmal(streamingBekanntLaufRef, "streamingBekannt", 15000);
        if (veraltet() || !snapshotFreigabeRef.current) return;
        roh = { ...roh, bekannt: streamingPayloadMitMetadaten(r) };
        streamingRohRef.current = roh;
        streamingGeladen.current = true;
        uebernehmeInfo(r, ERROR_SCOPE.STREAMING_KNOWN);
      } catch (e) {
        if (veraltet()) return;
        streamingGeladen.current = false;
        const file = typeof location !== "undefined" && location.protocol === "file:";
        if (!file) { meldeFehler(e, ERROR_SCOPE.STREAMING_KNOWN); return; }
        const dateiRoh = {
          bekannt: streamingBekanntSnapshot,
          entdecken: (await ladeEntdeckenBeilage()) || streamingEntdeckenSnapshot,
        };
        if (veraltet()) return;
        streamingRohRef.current = dateiRoh;
        streamingGeladen.current = true;
        entdeckenGeladen.current = true;
        const a = catalogService.buildStreamingViews(dateiRoh, master || []);
        setStreamingBekannt(a.bekannt); setStreamingEntdecken(a.entdecken);
        setStreamingInfo({ art: "snapshot", variante: null, stand: null, gueltigBis: null, abgelaufen: false, ausCache: false, anmeldungNoetig: false, fehler: null, code: null });
        resolveError(ERROR_SCOPE.STREAMING_KNOWN);
        resolveError(ERROR_SCOPE.STREAMING_DISCOVER);
        return a;
      }
    }

    if (vollKatalog && (!entdeckenGeladen.current || !roh.entdecken)) {
      try {
        const r = await holeEinmal(streamingEntdeckenLaufRef, "streamingEntdecken", 20000);
        if (veraltet() || !snapshotFreigabeRef.current) return;
        roh = { ...roh, entdecken: streamingPayloadMitMetadaten(r) };
        streamingRohRef.current = roh;
        entdeckenGeladen.current = true;
        uebernehmeInfo(r, ERROR_SCOPE.STREAMING_DISCOVER);
      } catch (e) {
        if (veraltet()) return;
        entdeckenGeladen.current = false;
        meldeFehler(e, ERROR_SCOPE.STREAMING_DISCOVER, true);
      }
    }

    const anzeigeRoh = {
      bekannt: roh.bekannt,
      entdecken: (vollKatalog && roh.entdecken) ? roh.entdecken : streamingEntdeckenSnapshot,
    };
    const a = catalogService.buildStreamingViews(anzeigeRoh, master || []);
    setStreamingBekannt(a.bekannt);
    setStreamingEntdecken(a.entdecken);
    return a;
  }, [snapshotFreigabe, master, reportError, resolveError]);
  ladeStreamingDateienRef.current = ladeStreamingDateien;
  useEffect(() => { if (tab === "streaming") ladeStreamingDateien(true); }, [tab, ladeStreamingDateien]); // KD-031: Voll-Katalog erst beim Öffnen

  /* Quellen-Auswahl (Namen, persistiert): steuert Anzeige sofort und via
     Config-Export, welche Kataloge der Job abruft. Default: Kern-Abos. */
  const toggleQuelle = useCallback((name) => {
    const next = auswahl.includes(name) ? auswahl.filter((d) => d !== name) : [...auswahl, name];
    setAuswahlRoh(next);
    store.set(K.streamingDienste, streamingCfgJson(next, heuristikAn)).catch(() => {});
  }, [auswahl, heuristikAn]);

  /* ---- Streaming-Badges für Mediathek & Kino (aus streaming_bekannt) ---- */
  const streamingMap = useMemo(() => {
    const m = new Map();
    if (streamingBekannt && streamingBekannt.stand) {
      for (const t of streamingBekannt.titel) m.set(t.id, t);
    }
    return m;
  }, [streamingBekannt]);
  const badgeFuer = useCallback((film) => {
    const t = film && streamingMap.get(film.id);
    if (!t) return null; // keine Daten oder nicht verfügbar -> kein Badge (Besitz-Feld quelle bleibt unberührt)
    /* Joyn-Fix: nur Dienste der Abo-Auswahl taggen (leere Auswahl = alle);
       bleibt nichts übrig -> gar kein Badge. */
    const dienste = gruppiereDienstBadges(sichtbareDienste(t.dienste, auswahl), { kompakt: true });
    if (!dienste.length) return null;
    return (
      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
        {dienste.slice(0, 3).map(({ label }) => (
          <span key={label} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "2px 6px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </span>
        ))}
        {dienste.length > 3 && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.rauch }}>+{dienste.length - 3}</span>}
      </span>
    );
  }, [streamingMap, auswahl]);
  /* Badges/Mein-Programm/Katalog-Zähler brauchen die LEICHTE bekannt-Datei auch
     außerhalb des Streaming-Tabs -> am Boot nachladen (KD-031: ohne Voll-Katalog). */
  useEffect(() => { if (bootDone && snapshotFreigabe) ladeStreamingDateien(); }, [bootDone, snapshotFreigabe, ladeStreamingDateien]);

  /* ---- Betriebsart-Wechsel (Demo ↔ fachlich aktives Konto): Katalog neu laden ----
     An-/Abmelden, Freischaltung und Widerruf ändern, welche Zeile der
     Katalogpfad überhaupt lesen darf.
     Ohne dieses Nachladen bliebe der Stand der alten Betriebsart stehen — nach
     dem Anmelden stünde im Kino-Tab weiter „Anmeldung nötig", nach dem Abmelden
     die Live-Payload als frischer Stand. Der ERSTE beobachtete Wert ist der
     Startzustand und damit kein Wechsel; der Autoload wird für die Dauer des
     Wechsels stillgelegt, damit nicht zweimal geladen wird.

     Dieser Effekt LÖSCHT NICHTS. Das ist bewusst und war früher anders:
       · Der Katalog-Cache ist nach ZEILENNAMEN geschlüsselt (cacheUrl(name) in
         lib/katalog.js) — `programm` und `programm_demo` liegen unter
         verschiedenen Einträgen und können sich gar nicht überlagern. Ein
         Demo-Read fällt also nie auf einen Live-Cache zurück; das Verwerfen
         beim Wechsel wäre reiner Verlust.
       · Der gespeicherte Programm-Topf wird beim nächsten Start ohnehin gegen
         die dann geltende Betriebsart geprüft (Varianten-Abgleich im Boot) und
         als Anzeigestand verworfen, wenn er nicht passt. Ihn hier zu löschen
         bringt nichts — kostet aber im Fehlerfall alles: ein über den
         Notfallweg eingespieltes Programm (art "manuell", ohne variante) ist
         die EINZIGE Kopie auf dem Gerät und ausgerechnet die Quelle für den
         Fall, dass die Datenbank nicht liefert.
     Ehrlich bleibt der Wechsel trotzdem: die ANZEIGE wird zurückgesetzt, der
     Nutzer sieht nach dem Wechsel nie mehr den Stand der alten Betriebsart.
     Scheitert das Nachladen (heutiger Produktionsfall: die Zeilen
     programm_demo/streaming_demo sind noch nicht veröffentlicht), sieht er den
     ehrlichen Fehlertext — und nichts ist unwiederbringlich weg.

     Rollen-v1 hält dafür nur noch eine Wahrheit: `remoteStorage === true` in
     einer bereiten Account-Session. Degradiert, inaktiv, fehlend und unbekannt
     sind wie im Service der öffentliche Demo-Pfad. */
  useEffect(() => {
    if (!bootDone) return undefined;
    const jetzt = remoteKontoAktiv ? "live" : "demo";
    if (letzteBetriebsart.current === null) { letzteBetriebsart.current = jetzt; return undefined; }
    if (letzteBetriebsart.current === jetzt) return undefined;
    letzteBetriebsart.current = jetzt;
    /* Generation hochzählen, BEVOR irgendetwas geladen wird: alles, was aus der
       alten Betriebsart noch unterwegs ist, ist ab hier veraltet und schreibt
       weder Anzeige noch Topf. */
    const gen = ++betriebsartGen.current;
    autoFetched.current = true;          // dieser Effekt lädt selbst
    nachladenNoetig.current = false;
    streamingGeladen.current = false;
    entdeckenGeladen.current = false;
    streamingRohRef.current = null;
    streamingBekanntLaufRef.current = null;
    streamingEntdeckenLaufRef.current = null;
    /* Der bisherige ANZEIGESTAND gehört der anderen Betriebsart — verwerfen
       statt umetikettieren. Persönliche Daten und der gespeicherte Topf bleiben
       unberührt. Synchron, damit zwischen Wechsel und Reset nichts Altes mehr
       gerendert wird. */
    setProgramm(null); setProgrammArt(null); setProgStand(null); setProgrammInfo(null);
    setStreamingBekannt(null); setStreamingEntdecken(null); setStreamingInfo(null);
    /* Ohne Datenbankzugang lädt dieser Wechsel nichts nach. Dann muss er die
       Ladeanzeige selbst freigeben: ein noch laufender Programm-Lauf der alten
       Betriebsart überspringt sein `setLoading("")` seit C3 (er ist veraltet),
       und ein neuer Lauf, der sie freigäbe, startet hier nicht. */
    if (!snapshotFreigabeRef.current) { autoFetched.current = false; setLoading(""); return undefined; }
    (async () => {
      /* N4: `ladeStreamingDateien` kann in seinem eigenen Fehlerzweig noch
         werfen (file://-Beilage). Ohne Auffangnetz bräche die IIFE ab und gäbe
         `autoFetched` nie wieder frei — der Autoload wäre für den Rest der
         Sitzung tot. Der Programm-Lauf zählt allein für die Freigabe. */
      const [programmErgebnis] = await Promise.allSettled([
        ladeProgrammDatei(false),
        ladeStreamingDateien(tabRef.current === "streaming"),
      ]);
      const programmOk = programmErgebnis.status === "fulfilled" && programmErgebnis.value;
      /* Ein weiterer Wechsel ist dazwischengekommen — dessen Effekt führt. */
      if (betriebsartGen.current !== gen) return;
      /* B6: Brachte dieser Lauf keinen frischen Datenbankstand, darf der
         Autoload nicht für den Rest der Sitzung stillgelegt bleiben. Freigeben
         ist gefahrlos: der Autoload-Effekt hängt an [bootDone, programm,
         snapshotFreigabe] und feuert erst wieder, wenn sich einer davon ändert
         — ein erfolgloser Versuch lässt `programm` auf null und erzeugt daher
         keine Schleife; ein Cache-Treffer hat `programm` gefüllt, womit die
         Bedingung des Autoloads ohnehin nicht mehr greift. */
      if (!programmOk) autoFetched.current = false;
    })();
    return undefined;
  }, [remoteKontoAktiv, bootDone, snapshotFreigabe, ladeProgrammDatei, ladeStreamingDateien]);

  const {
    achievements,
    toasts,
    cageFilmeRef,
    cageOffen,
    setCageOffen,
    reducedMotion,
    zeigeCage,
    eggHerkunft,
    eggZeigeEintrag,
  } = useEggController({
    master,
    kinoMatches,
    streamingBekannt,
    auswahl,
    bootDone,
    setupWarnung,
    startModalOffen,
    setTab,
    springeZuFilm,
  });

  const deepSpaceOwner = deepSpaceOwnerKey(session);
  const { deepSpaceAktiv } = useDeepSpaceHorror({
    achievements,
    bootDone,
    neonNoirAktiv: !deepSpaceTestmodusAktiv && einstellungen.modus === "neon-noir",
    manuellerEintritt: neonEintrittSerial,
    ownerKey: deepSpaceOwner,
  });
  const deepSpaceSichtbar = deepSpaceTestmodusAktiv
    || (deepSpaceAktiv && einstellungen.modus === "neon-noir");
  const effektiverModus = deepSpaceSichtbar ? "deep-space-horror" : einstellungen.modus;

  const clearProgrammCache = useCallback(async () => {
    try { await store.delete(K.programm); } catch { /* war leer */ }
    /* Der Programm-Topf war nur die halbe Miete: ohne den Cache-Storage-Eintrag
       gewann beim nächsten fehlgeschlagenen Direkt-Read wieder derselbe alte
       Stand — „neu laden" hätte nichts verworfen. */
    try { await catalogService.discardCache("programm"); } catch { /* Cache ist Komfort */ }
    setProgramm(null); setProgrammArt(null); setProgStand(null); setProgrammInfo(null);
    autoFetched.current = false;
  }, []);

  const refreshKatalog = useCallback(async () => {
    /* Laufende Antworten gehören ab hier zum alten manuellen Ladeversuch. */
    betriebsartGen.current++;
    streamingGeladen.current = false;
    entdeckenGeladen.current = false;
    streamingRohRef.current = null;
    streamingBekanntLaufRef.current = null;
    streamingEntdeckenLaufRef.current = null;
    await Promise.all([ladeProgrammDatei(true), ladeStreamingDateien(true)]);
  }, [ladeProgrammDatei, ladeStreamingDateien]);

  const wrap = {
    minHeight: "100dvh",
    background: T.saal,
    color: T.leinwand,
    fontFamily: "'Space Grotesk', sans-serif",
    padding: "0 0 60px",
  };

  return (
    <div style={wrap}
      data-kd-effect={deepSpaceSichtbar ? "deep-space-horror" : undefined}
      data-kd-deep-space-test={deepSpaceTestmodusAktiv ? "aktiv" : undefined}
      className={"kd-wrap kd-schrift-" + effektiveSchrift
        + (einstellungen.modus === "showa" ? " kd-showa" : einstellungen.modus === "neon-noir" || deepSpaceTestmodusAktiv ? " kd-neon-noir" : "")
        + (deepSpaceSichtbar ? " kd-deep-space-horror" : "")}>
      <ModusFx modus={effektiverModus} deepSpaceTest={deepSpaceTestmodusAktiv} />
      <div className="kd-app" data-session-mode={session.mode}>
      {startModalOffen && (
        <StartWahl onWaehle={waehleStart}
          aktuelle={(() => { try { return localStorage.getItem("kd:start"); } catch { return null; } })()}
          onClose={startWahlBestaetigt() ? () => setStartModalOffen(false) : undefined} />
      )}
      {katalogZugangOffen && !startModalOffen && (
        <KatalogZugang zwingend={!catalogService.hasConnection()}
          onAbbrechen={() => setKatalogZugangOffen(false)}
          onFertig={() => {
            setKatalogZugangOffen(false);
            setSnapshotFreigabe(true); snapshotFreigabeRef.current = true;
            try { setupUeberspringen(); location.reload(); }
            catch {
              autoFetched.current = false;
              streamingGeladen.current = false;
              entdeckenGeladen.current = false;
              streamingRohRef.current = null;
              streamingBekanntLaufRef.current = null;
              streamingEntdeckenLaufRef.current = null;
              setStartTick((t) => t + 1);
            }
          }} />
      )}
      {hilfeOffen && <HilfeSheet onClose={schliesseHilfe} />}
      {klaerung && klaerung.length > 0 && (
        <QuelleKlaerung eintraege={klaerung}
          onSpaeter={() => setKlaerung(null)}
          onFertig={uebernehmeQuellenKlaerung} />
      )}
      <header style={{ padding: "26px 22px 12px", maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size={34} />
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: "calc(34px * var(--kd-schriftfaktor, 1))", letterSpacing: "0.1em", margin: 0, textTransform: "uppercase" }}>
            Kinodreieck
          </h1>
          <div className="kd-syncchip-head" style={{ marginLeft: "auto" }}><SyncStatusChip /></div>
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg, " + T.wolfram + ", transparent 70%)", marginTop: 14 }} />
      </header>
      <nav className="kd-menu" style={{ position: "sticky", top: 0, background: T.saal, borderBottom: "1px solid " + T.saalHoch }} aria-label="Hauptnavigation">
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 22px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {NAVIGATION.map(({ id, label }) => (
            <button key={id} className={tab === id ? "kd-nav-aktiv" : undefined}
              aria-label={id === "daten" && sicherungOffen ? label : undefined}
              aria-description={id === "daten" && sicherungOffen ? "Sicherung offen" : undefined}
              onClick={() => id === "daten" && sicherungOffen ? oeffneSicherung() : navigiere(id)}
              style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "calc(17px * var(--kd-schriftfaktor, 1))",
                letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "8px 16px", border: "none", cursor: "pointer", borderRadius: "4px 4px 0 0",
                background: tab === id ? T.leinwand : "transparent",
                color: tab === id ? T.tinte : T.rauch,
                position: "relative",
              }}>
              {label}
              {id === "daten" && sicherungOffen && (
                <span aria-hidden="true" title="Ungesicherte Änderungen im Browser — bitte exportieren"
                  style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4, background: T.gefahr, display: "inline-block" }} />
              )}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "20px 22px 0" }}>
        {tab !== "start" && <BereichsHero bereich={tab} />}
        <GlobalErrorQueue errors={errors} onDismiss={dismissError} />

        {bootDone && loading === "programm" && !progStand && (
          <div style={{ background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: "calc(14px * var(--kd-schriftfaktor, 1))", color: T.leinwandTief, lineHeight: 1.6 }}>
            <strong style={{ color: T.wolfram }}>Erststart —</strong> Kinoprogramm und Streaming-Kataloge werden frisch geladen.
            Das kann einen Moment dauern; bitte nicht abbrechen. Die App füllt sich, sobald die Daten da sind.
          </div>
        )}

        {!bootDone ? (
          <p style={{ color: T.rauch }}>Lade gespeicherte Daten …</p>
        ) : !master && tab !== "daten" && tab !== "mediathek" ? (
          <div style={{ background: T.saalHoch, borderRadius: 6, padding: 24, textAlign: "center", marginBottom: 16 }}>
            <p style={{ fontSize: 15, color: T.rauch, margin: "0 0 14px" }}>
              Deine Mediathek ist noch leer. Du kannst Einträge selbst anlegen oder importieren.
              {!snapshotFreigabe ? " Verbinde den gemeinsamen Kino- und Streamingkatalog mit dem mitgeschickten Leseschlüssel." : " Kino, Streaming und Suche funktionieren; nur der Abgleich mit deinem Geschmack fehlt."}
            </p>
            <button style={btnStyle(true)} onClick={() => setTab("mediathek")}>Ersten Eintrag anlegen</button>
          </div>
        ) : null}

        {tab === "start" && bootDone && (
          <StartTab kinoPins={kinoPins} toggleKinoPin={toggleKinoPin} merkliste={merkliste} toggleMerk={toggleMerk} onNavigiere={navigiere} zeigeEintrag={springeZuFilm} onHilfe={() => setHilfeOffen(true)}
            wochenplan={wochenplan} onWochenplanAendern={persistWochenplan}
            entdeckenStatus={entdeckenStatus} onEntdeckenStatusAendern={bestaetigeSerienHinweis}
            master={master || []} onSpringeZuStreaming={springeZuStreaming} onFilmAnlegen={addFilm}
            onStreamingKatalogLaden={ladeStreamingDateien}
            onSpringeZuKino={(eintrag) => {
              setZeigeAlles(true);
              setKinoFokus(eintrag?.film_ref != null
                ? { art: "film", ref: eintrag.film_ref, titel: eintrag?.titel || "" }
                : { art: "programm", ref: eintrag?.programm_ref ?? eintrag?.ref ?? null, titel: eintrag?.titel || "" });
              navigiere("kino");
            }}
            /* Dashboard-Datenquellen (Etappe 4) — alles vorhandener App-State,
               keine neuen Fetches: Matches, Must-Watch, Abo-Auswahl, Kataloge,
               Programm-Stand. Der Beta-Pfad (Landing) ignoriert diese Props. */
            kinoMatches={kinoMatches} mustwatch={mustwatch} mwKandidaten={mwKandidaten} auswahl={auswahl}
            streamingEntdecken={streamingEntdecken} streamingBekannt={streamingBekannt}
            progStand={progStand} programmInfo={programmInfo} streamingInfo={streamingInfo} />
        )}

        {tab === "kino" && bootDone && (
          <KinoTab
            programm={programm} progStand={progStand} master={master}
            kinoMatches={kinoMatches} restSichtbar={restSichtbar}
            zeitgrenze={zeitgrenze} saveZeitgrenze={saveZeitgrenze}
            zeigeAlles={zeigeAlles} setZeigeAlles={setZeigeAlles}
            expandedId={expandedId} setExpandedId={setExpandedId}
            updateFilm={updateFilm} addFilm={addFilm} badgeFuer={badgeFuer}
            addFilmMitPrognose={addFilmMitPrognose}
            vorbewertungAktiv={vorbewertungAktiv}
            prognoseSperrgrund={vorbewertungSperrgrund}
            prognoseLaufId={prognoseLaufId}
            prognoseFehler={prognoseFehler}
            aktuelleProfilVersion={aktuelleProfilVersion}
            onPrognoseErstellen={starteVorbewertung}
            onPrognoseStatus={setzeFilmPrognoseStatus}
            filmwissenAktiv={filmwissenLesenAktiv}
            filmwissenRechercheAktiv={filmwissenRechercheAktiv}
            filmwissenProFilm={filmwissenProFilm}
            filmwissenRechercheLaufId={filmwissenRechercheLaufId}
            onFilmwissenLaden={ladeFilmwissen}
            onFilmwissenRecherchieren={recherchiereFilmwissen}
            loading={loading}
            kinoPins={kinoPins} toggleKinoPin={toggleKinoPin}
            fokusTreffer={kinoFokus} onFokusVerbraucht={() => setKinoFokus(null)}
            datenGesperrt={!snapshotFreigabe}
            programmInfo={programmInfo} angemeldet={remoteKontoAktiv}
            autorName={autorName} /* KD-030: echter Autor für neue Bewertungen (EintragForm/EditPanel) */
          />
        )}

        {tab === "mediathek" && bootDone && (
          <MediathekTab
            master={master ?? LEERER_MEDIATHEK_MASTER} nachtragFlach={master ? nachtragSichtbar : []}
            expandedId={expandedId} setExpandedId={setExpandedId}
            updateFilm={updateFilm} deleteFilm={deleteFilm} addFilm={addFilm} badgeFuer={badgeFuer}
            onFilmBatchVorschau={planeFilmBatchLoeschung} onFilmBatchLoeschen={fuehreFilmBatchLoeschungAus}
            addFilmMitPrognose={addFilmMitPrognose}
            vorbewertungAktiv={vorbewertungAktiv}
            prognoseSperrgrund={vorbewertungSperrgrund}
            prognoseLaufId={prognoseLaufId}
            prognoseFehler={prognoseFehler}
            aktuelleProfilVersion={aktuelleProfilVersion}
            onPrognoseErstellen={starteVorbewertung}
            onPrognoseStatus={setzeFilmPrognoseStatus}
            filmwissenAktiv={filmwissenLesenAktiv}
            filmwissenRechercheAktiv={filmwissenRechercheAktiv}
            filmwissenProFilm={filmwissenProFilm}
            filmwissenRechercheLaufId={filmwissenRechercheLaufId}
            onFilmwissenLaden={ladeFilmwissen}
            onFilmwissenRecherchieren={recherchiereFilmwissen}
            artikel={artikelListe} onArtikelKlick={springeZuArtikel}
            fokusFilmId={mediathekFokus} onFokusVerbraucht={() => setMediathekFokus(null)}
            mustwatch={mustwatch} addMustwatch={addMustwatch}
            updateMustwatch={updateMustwatch} deleteMustwatch={deleteMustwatch}
            mwKandidaten={mwKandidaten} onSpringeZuMustwatchRef={springeZuMustwatchRef} datenKontextKey={`${session.mode}:${session.state}:${session.account?.id || ""}`}
          />
        )}

        {tab === "blog" && (
          <EntdeckenTab
            fokusId={blogFokus} radarState={sichtbarerRadarState} seriesCatalog={serienKatalog} entdeckenStatus={entdeckenStatus}
            master={master || []} streamingKnown={streamingBekannt} streamingDiscover={streamingEntdecken}
            accountMode={radarAuthority === "account-cache"} radarPilotClientEnabled={radarPilotClientEnabled}
            radarPilotActive={radarPilotActive} radarPilotEvents={radarPilotEvents} radarReview={radarReview}
            syncStatus={radarPilotSyncStatus} onObserveToggle={aendereSerienBeobachtung} onRadarChange={aendereRadar}
            onRadarPreview={setRadarPreviewTarget} onShareChange={aendereRadarShare}
            onRadarPilotReceipt={fuehreRadarPilotReceipt} onRadarPilotImport={fuehreRadarPilotImport} onRadarPilotSync={fuehreRadarPilotSync}
            blogProps={{
              artikel: artikelListe, master: refUniversum, angemeldet: remoteKontoAktiv,
              onFokusVerbraucht: () => setBlogFokus(null),
              onErstellen: erstelleArtikel, onAktualisieren: aktualisiereArtikel,
              onSetzeRef: setzeArtikelRef, onFreigeben: freigebeArtikel, onLoeschen: loescheArtikel,
              onRetryPublication: wiederholePublikation, onAddFilm: addFilm, onSpringeZuFilm: springeZuFilm,
              exportArtikel, importArtikel, onZiehe: zieheSharedBlog,
            }}
          />
        )}

        {tab === "streaming" && (
          <StreamingTab
            bekannt={streamingBekannt} entdecken={streamingEntdecken}
            addFilm={addFilm} master={master} updateFilm={updateFilm}
            addFilmMitPrognose={addFilmMitPrognose}
            vorbewertungAktiv={vorbewertungAktiv}
            prognoseSperrgrund={vorbewertungSperrgrund}
            prognoseLaufId={prognoseLaufId}
            prognoseFehler={prognoseFehler}
            aktuelleProfilVersion={aktuelleProfilVersion}
            onPrognoseErstellen={starteVorbewertung}
            onPrognoseStatus={setzeFilmPrognoseStatus}
            filmwissenAktiv={filmwissenLesenAktiv}
            filmwissenRechercheAktiv={filmwissenRechercheAktiv}
            filmwissenProFilm={filmwissenProFilm}
            filmwissenRechercheLaufId={filmwissenRechercheLaufId}
            onFilmwissenLaden={ladeFilmwissen}
            onFilmwissenRecherchieren={recherchiereFilmwissen}
            mustwatchIds={mustwatchMasterIds}
            auswahl={auswahl} toggleQuelle={toggleQuelle}
            merkliste={merkliste} toggleMerk={toggleMerk}
            entdeckenStatus={entdeckenStatus} schreibeEntdeckenStatus={schreibeEntdeckenStatus}
            heuristikAn={heuristikAn} setHeuristikAn={(v) => { setHeuristikAn(v); store.set(K.streamingDienste, streamingCfgJson(auswahl, v)).catch(() => {}); }}
            datenGesperrt={!snapshotFreigabe}
            katalogInfo={streamingInfo} angemeldet={remoteKontoAktiv}
            fokusTreffer={streamingFokus} onFokusVerbraucht={() => setStreamingFokus(null)}
          />
        )}

        {tab === "finder" && (
          <FinderTab
            vokabular={vokabular} saveVokabular={saveVokabular}
            master={finderMaster || []} kinoMatches={kinoMatches}
            streamingBekannt={streamingBekannt} streamingEntdecken={streamingEntdecken}
            streamingInfo={streamingInfo}
            mustwatchIds={mustwatchMasterIds}
            auswahl={auswahl}
            onSpringeZuFilm={springeZuFilm} addFilm={addFilm}
            addFilmMitPrognose={addFilmMitPrognose}
            vorbewertungAktiv={vorbewertungAktiv}
            prognoseSperrgrund={vorbewertungSperrgrund}
            verlauf={finderVerlauf} setVerlauf={setFinderVerlauf}
            eingabe={finderEingabe} setEingabe={setFinderEingabe}
            suchauftrag={finderSuchauftrag}
            onSuchauftragVerbraucht={() => setFinderSuchauftrag(null)}
            scopeArtikel={artikelListe}
            onArtikelKlick={springeZuArtikel}
            onNavigiere={navigiere}
            kiVerfuegbar={session.mode === "account" && session.state === "ready"
              && session.capabilities?.personalAi === true}
          />
        )}

        {tab === "daten" && (
          <DatenTab
            master={master} masterMeta={masterMeta} masterHerkunft={masterHerkunft}
            nachtragCount={nachtragSichtbar.length}
            exportMaster={exportMaster} importMaster={importMaster}
            importProgramm={importProgramm} importNonstop={importNonstop}
            programm={programm}
            setErr={setErr} clearProgrammCache={clearProgrammCache}
            kiStand={kiStand} onKiGlobal={setzeKiGlobal} onKiFunktion={setzeKiFunktion}
            kiProfilFaehig={session.mode === "account" && session.state === "ready"
              && session.capabilities?.personalAi === true}
            startWahl={(() => { try { return localStorage.getItem("kd:start"); } catch { return null; } })()}
            demoAktiv={demoAktiv}
            onStartWahl={oeffneStartWahl}
            onDemoEntfernen={entferneDemoDaten}
            katalogVerbunden={snapshotFreigabe}
            programmInfo={programmInfo}
            onKatalogVerbinden={() => setKatalogZugangOffen(true)}
            onKatalogRefresh={refreshKatalog}
            artikelAnzahl={artikelListe.length} exportArtikel={exportArtikel} importArtikel={importArtikel}
            ungesichertMaster={ungesichertMaster} ungesichertArtikel={ungesichertArtikel}
            artikelListe={artikelListe} autorName={autorName} saveAutorName={saveAutorName}
            uebernehmePaket={uebernehmePaket}
            addFilm={addFilm} addFilme={addFilme}
            einstellungen={einstellungen} setzeEinstellung={setzeEinstellung} waehleModus={waehleModus}
            streamingBekannt={streamingBekannt} streamingEntdecken={streamingEntdecken}
            streamingInfo={streamingInfo}
            auswahl={auswahl} toggleQuelle={toggleQuelle} heuristikAn={heuristikAn}
            setHeuristikAn={(v) => { setHeuristikAn(v); store.set(K.streamingDienste, streamingCfgJson(auswahl, v)).catch(() => {}); }}
            datenGesperrt={!snapshotFreigabe}
            backupGesamt={backupGesamt} vokabular={vokabular} saveVokabular={saveVokabular}
            offeneFlags={offeneFlags} migriereMustwatch={migriereMustwatch} migrationsBericht={migrationsBericht}
            importiereBesitz={importiereBesitz} besitzImportBericht={besitzImportBericht}
            onKontoDatenGeaendert={() => { try { location.reload(); } catch { setStartTick((t) => t + 1); } }} kontoAktiv={session.mode === "account" && session.state === "ready"} kontoId={session.account?.id || ""} kontoEmail={session.account?.email || ""} onKontoGeloescht={async () => { await sessionCoordinator.finalizeDeletedAccount(); try { location.reload(); } catch { setStartTick((t) => t + 1); } }}
          />
        )}
      </main>
      <MobileNavigation aktiv={tab} mehrOffen={mehrOffen} sicherungOffen={sicherungOffen} onMehr={toggleMehr}
        onNavigate={navigiereAusGlobalemMenu} onNachOben={nachObenAusMenu} />
      <GlobalSearchBar bereich={tab} onSuchen={starteGlobaleSuche}
        antwort={globaleSuchantwort}
        onAntwortSchliessen={() => setGlobaleSuchantwort(null)}
        onTreffer={oeffneGlobalenTreffer}
        onSuchaktion={fuehreGlobaleSuchaktionAus} beobachteteIds={beobachteteWatchmodeIds} radarTargetIds={radarTargetIds}
        onAlleErgebnisse={oeffneAusfuehrlicheSuche}
        menuOffen={mehrOffen} onMenu={toggleGlobalesMenu} />
      </div>{/* .kd-app */}
      {radarPreviewTarget && (<RadarSubscriptionPreview target={radarPreviewTarget} radarState={sichtbarerRadarState}
          accountMode={radarAuthority === "account-cache"} accountActive={remoteKontoAktiv} onConfirm={bestaetigeRadarVorschau} onClose={schliesseRadarPreview} />
      )}
      {EGGS_ENABLED && toasts.length > 0 && (
        <div className="kd-toast-wrap" aria-live="polite" role="status">
          {toasts.map((t) => (
            <div key={t.id} className="kd-toast" style={{ background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 8, padding: "10px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.5)" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", color: T.wolfram }}>{t.text}</div>
              {t.sub ? <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: T.leinwand, marginTop: 2 }}>{t.sub}</div> : null}
            </div>
          ))}
        </div>
      )}
      {EGGS_ENABLED && cageOffen && (
        <CageAlphabet filme={cageFilmeRef.current} reduced={reducedMotion} herkunftVon={eggHerkunft}
          onZeigeEintrag={eggZeigeEintrag} onClose={() => setCageOffen(false)} />
      )}
      <ZurueckObenKnopf verdeckt={mehrOffen || hilfeOffen} />
    </div>
  );
}

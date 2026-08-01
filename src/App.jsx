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
  store, K, PROGRAMM_TTL_MS, storageService,
} from "./services/storage.js";
import { baueBackup } from "./lib/backup.js";
import { catalogService } from "./services/catalog.js";
import { sessionCoordinator } from "./services/sessionCoordinator.js";
import { sharedArticlesService } from "./services/sharedArticles.js";
import { errorText, ERROR_CODES } from "./services/errors.js";
import {
  liesStartWahl,
  startWahlBestaetigt,
  verbraucheFrischenStart,
  snapshotsFrei,
  START_WAHL_VERSION,
} from "./controllers/onboardingController.js";
import {
  zeitpunkt,
  IMPORT_INFO,
  demoLadung,
  ladeEntdeckenBeilage,
  streamingBekanntSnapshot,
  streamingEntdeckenSnapshot,
  programmSnapshot,
} from "./controllers/catalogController.js";
import { useIntelligenceController } from "./controllers/useIntelligenceController.js";
import {
  schreibeImportSnapshot,
  gueltigerArtikel,
  baueRefUniversum,
  baueKinoMatches,
  reicheFinderMasterAn,
  sichtbarerNachtrag,
  planeFilmLoeschung,
} from "./controllers/libraryController.js";
import { useEggController } from "./controllers/useEggController.js";
import { ensureIds, slugId } from "./lib/match.js";
import { parseNonstopHtml, grenzeInMinuten, hatVorstellungAb, normalisiereProgramm } from "./lib/programm.js";
import { Logo } from "./components/ui.jsx";
import { neueArtikelId, gleicheArtikelAb, uebernehmeRefs, heileRotlinks, blogZuArtikel } from "./lib/artikel.js";
import {
  SHARED_PUBLICATION_ACTION,
  beginPublication,
  completePublication,
  failPublication,
  needsRemoteRemoval,
  publicationOperationId,
  recoverInterruptedPublication,
  publicationRetryAction,
  publicationState,
} from "./lib/sharedPublication.js";
import { neueMustwatchId, parseMustwatch, migriereFlags, offeneFlagAnzahl, parseBesitzImport, wendeBesitzImportAn } from "./lib/mustwatch.js";
import { setzeEigeneStimmungen } from "./lib/finder.js";
import { vokabularZuMap } from "./lib/vokabular.js";
import { sichtbareDienste } from "./lib/dienste.js";
import { StartTab } from "./tabs/StartTab.jsx";
import { KinoTab } from "./tabs/KinoTab.jsx";
import { MediathekTab } from "./tabs/MediathekTab.jsx";
import { StreamingTab } from "./tabs/StreamingTab.jsx";
import { BlogTab } from "./tabs/BlogTab.jsx";
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

export default function App() {
  const [session, setSession] = useState(() => sessionCoordinator.getSnapshot());
  useEffect(() => sessionCoordinator.subscribe(setSession), []);
  const [frischerStart] = useState(() => verbraucheFrischenStart());
  const [tab, setTab] = useState("start");
  /* Der offene Tab als Ref: Effekte, die nicht bei jedem Tabwechsel neu laufen
     sollen, dürfen ihn trotzdem lesen (z. B. „ist der Streaming-Tab offen?"). */
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const [mehrOffen, setMehrOffen] = useState(false);
  const [hilfeOffen, setHilfeOffen] = useState(false);
  const toggleMehr = useCallback(() => setMehrOffen((offen) => !offen), []);
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
  const [master, setMaster] = useState(null);
  const masterRef = useRef(master);
  masterRef.current = master;
  const [masterMeta, setMasterMeta] = useState(null);
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
  const [err, setErr] = useState("");
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
  const bereinigteEinstellungen = useCallback((wert) => {
    const next = { ...wert };
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
  const [vokabular, setVokabular] = useState([]);
  const saveVokabular = useCallback((liste) => {
    setVokabular(liste);
    setzeEigeneStimmungen(vokabularZuMap(liste));
    store.set(K.vokabular, JSON.stringify(liste)).catch(() => {});
  }, []);

  /* ---- Kinotermin-Pins ----
     Pin = {t, j, z, seit} — z ist der komplette Terminstring inkl. Kino.
     Vergangene Termine werden beim Boot aufgeräumt (Jahres-Wrap beachtet:
     ein im Dezember gepinnter Januar-Termin gehört ins Folgejahr). */
  const [kinoPins, setKinoPins] = useState([]);
  /* Initialisiert ausschließlich den Tutorial-Speicher. Ein Terminal-Installer
     ist für die DB-basierte Tester-PWA nicht mehr Teil des Starts. */
  const [setupWarnung] = useState(() => {
    try { initSetup(); } catch { /* Tutorial-Speicher optional */ }
    return false;
  });
  const [snapshotFreigabe, setSnapshotFreigabe] = useState(() => snapshotsFrei());
  const snapshotFreigabeRef = useRef(snapshotFreigabe);
  snapshotFreigabeRef.current = snapshotFreigabe;
  const [startTick, setStartTick] = useState(0); // bump nach Startwahl -> Tour-Effekte neu binden
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
  const [masterHerkunft, setMasterHerkunft] = useState(null);
  const demoAktiv = useMemo(() => {
    if (masterHerkunft?.typ === "demo") return true;
    try { return !!localStorage.getItem(K.demoSeed); } catch { return false; }
  }, [masterHerkunft, startTick]);
  /* Startwahl-Modal (Beta): sichtbar, wenn beim Erststart weder Storage-Stand
     noch frühere Wahl noch ?start-Parameter vorliegt. Boot entscheidet. */
  const [startModalOffen, setStartModalOffen] = useState(false);

  /* ---- Master persistieren ---- */
  const persistMaster = useCallback(async (filme, meta, herkunft) => {
    try {
      const h = herkunft || { typ: "storage", zeit: Date.now() };
      await store.set(K.master, JSON.stringify({ meta, filme, herkunft: h, gespeichertAm: Date.now() }));
      return true;
    } catch {
      setErr("Speichern der Masterliste fehlgeschlagen.");
      return false;
    }
  }, []);

  /* ---- Kinoprogramm direkt aus dem zentralen Supabase-Katalog laden ---- */
  const ladeProgrammDatei = useCallback(async (manuell) => {
    /* Betriebsart-Stand beim Start dieses Laufs. Wechselt die Betriebsart,
       während die Antwort unterwegs ist, gehört sie zu einer überholten Zeile
       und darf weder Anzeige noch Topf berühren (siehe betriebsartGen). */
    const gen = betriebsartGen.current;
    const veraltet = () => betriebsartGen.current !== gen;
    setErr("");
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
        setErr(r.anmeldungNoetig
          ? "Kinoprogramm aus dem letzten Browser-Stand — für das aktuelle Programm ist eine Anmeldung nötig."
          : r.code === ERROR_CODES.INVALID_KEY
            ? "Kinoprogramm aus dem letzten Browser-Stand — der hinterlegte Zugangsschlüssel wird gerade abgelehnt (Settings → Datenmodus & Verbindung)."
            : "Kinoprogramm aus dem letzten Browser-Stand geladen (Datenbank derzeit nicht erreichbar).");
      } else if (r.abgelaufen) {
        setErr("Dieser Programm-Schnappschuss ist abgelaufen und zeigt nicht mehr das laufende Kinoprogramm.");
      }
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
      setErr(text);
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
  }, []);

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
                const al = Array.isArray(d.artikel) ? d.artikel : d.artikel.artikel || [];
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
                setMustwatch(mw); localStorage.setItem(K.mustwatch, JSON.stringify({ eintraege: mw, gespeichertAm: Date.now() }));
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
        const r = await store.get(K.einstellungen);
        if (r && r.value) {
          const roh = JSON.parse(r.value);
          const hatteVeralteteEinstellung = Object.prototype.hasOwnProperty.call(roh, "linkshaender")
            || Object.prototype.hasOwnProperty.call(roh, "kurosawa")
            || ["kurosawa", "grindhouse", "nerv"].includes(roh.modus);
          const e = { theme: "dunkel", startTab: "start", schrift: "normal", modus: "", ...roh };
          delete e.linkshaender;                                  // veraltete Menüpräferenz wird nicht mehr ausgewertet
          delete e.kurosawa;                                     // uralter Bool, längst durch modus ersetzt
          if (e.modus === "kurosawa" || e.modus === "grindhouse") e.modus = ""; // v1-Modi zurückgezogen
          if (e.modus === "nerv") e.modus = "neon-noir";        // veröffentlichbarer Ersatz bewahrt die dunkle Egg-Wahl
          setEinstellungenState(e);
          setzeTheme(e.modus || e.theme);                        // Spezialmodus überschreibt die Basis-Palette
          if (e.startTab && e.startTab !== "start") setTab(e.startTab);
          if (hatteVeralteteEinstellung) await store.set(K.einstellungen, JSON.stringify(e));
        }
      } catch { /* Defaults */ }
      try {
        const r = await store.get(K.vokabular);
        if (r && r.value) {
          const v = JSON.parse(r.value);
          setVokabular(v);
          setzeEigeneStimmungen(vokabularZuMap(v));
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
              setErr("Dieser Programm-Schnappschuss ist abgelaufen und zeigt nicht mehr das laufende Kinoprogramm.");
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

  /* ---- Master-Import ---- */
  const importMaster = useCallback(async (text) => {
    setErr("");
    try {
      const parsed = JSON.parse(text);
      const filme = Array.isArray(parsed) ? parsed : parsed.filme;
      if (!Array.isArray(filme) || filme.length === 0) throw new Error("Kein 'filme'-Array gefunden.");
      // KD-004: bestehende Masterliste wird ersetzt -> Rollback-Snapshot ZUERST (fail-closed).
      if (master && master.length && !schreibeImportSnapshot("kd:import:vorher:master", { meta: masterMeta, filme: master, herkunft: masterHerkunft }))
        throw new Error("Sicherungs-Snapshot vor dem Ersetzen fehlgeschlagen (Speicher voll/blockiert) — nichts überschrieben.");
      const mitIds = ensureIds(filme);
      const meta = Array.isArray(parsed) ? null : parsed.meta || null;
      const h = { typ: "manuell", zeit: Date.now() };
      setMaster(mitIds);
      setMasterMeta(meta);
      setMasterHerkunft(h);
      await persistMaster(mitIds, meta, h);
      setTab("kino");
    } catch (e) {
      setErr("Master-Import fehlgeschlagen: " + e.message);
    }
  }, [persistMaster, master, masterMeta, masterHerkunft]);

  /* ---- Programm-Snapshot-Import ---- */
  const importProgramm = useCallback(async (text) => {
    setErr("");
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
      setTab("kino");
    } catch (e) {
      setErr("Programm-Import fehlgeschlagen: " + e.message);
    }
  }, []);

  /* ---- Nonstop-HTML-Import: deterministisch geparst, kein KI-Call ---- */
  const importNonstop = useCallback(async (html) => {
    setErr("");
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
      setTab("kino");
    } catch (e) {
      setErr("Nonstop-Import fehlgeschlagen: " + e.message);
    }
  }, [programm]);

  /* ---- Film aktualisieren / hinzufügen ----
     Schlüssel ist film.id (stabil, aus der Masterliste). Erste Bearbeitung
     einer gebündelten Liste überführt sie in den Storage (mit Basis-Vermerk). */
  const naechsteHerkunft = useCallback(() => (
    masterHerkunft && (masterHerkunft.typ === "demo" || masterHerkunft.typ === "bundled")
      ? { typ: "storage", zeit: Date.now(), basis: "Demo-Liste" }
      : { typ: (masterHerkunft && masterHerkunft.typ) || "storage", zeit: Date.now(), basis: masterHerkunft && masterHerkunft.basis }
  ), [masterHerkunft]);

  /* ================= MUST-WATCH-LISTE (eigener Topf, 10. Sync-Datei) =================
     Ersetzt das must_watch-Flag (Entscheidung 18.07.2026): die Liste ist die
     einzige Wahrheit; das Flag-Feld bleibt in den Daten (Kompatibilität), wird
     aber im UI nirgends mehr angeboten. Ablageform: {eintraege, gespeichertAm}. */
  const [mustwatch, setMustwatch] = useState([]);
  useEffect(() => {
    store.get(K.mustwatch).then((r) => { if (r && r.value) setMustwatch(parseMustwatch(r.value)); }).catch(() => {});
  }, []);
  const persistMustwatch = useCallback((liste) => {
    store.set(K.mustwatch, JSON.stringify({ eintraege: liste, gespeichertAm: Date.now() })).catch(() => setErr("Must-Watch-Speichern fehlgeschlagen."));
  }, []);

  /* Blog-Referenz-Universum = Master ∪ Must-Watch. */
  const mitMustwatch = baueRefUniversum;
  const refUniversum = useMemo(() => mitMustwatch(master, mustwatch), [master, mustwatch, mitMustwatch]);
  /* Master-IDs, die auf der Must-Watch-Liste stehen (FinderTab-Chip + Streaming-Filter
     lesen die LISTE, nicht mehr das Flag). */
  const mustwatchMasterIds = useMemo(() => new Set(
    mustwatch.filter((e) => e.verknuepfung && e.verknuepfung.ziel === "master").map((e) => e.verknuepfung.id)
  ), [mustwatch]);

  /* ================= BLOG: Artikel-Status & CRUD =================
     Artikel leben im Browser-Storage (kd:artikel) + Export im Einstellungen-Tab.
     "Erstellen" speichert sofort mit status "wartet" — nichts geht verloren. */
  const [artikelListe, setArtikelListe] = useState([]);
  useEffect(() => {
    store.get(K.artikel).then((r) => {
      if (r && r.value) {
        try {
          const p = JSON.parse(r.value);
          const geladen = Array.isArray(p) ? p : p.artikel || [];
          const artikel = geladen.map((a) => recoverInterruptedPublication(a));
          artikelListeRef.current = artikel;
          setArtikelListe(artikel);
          if (p.gespeichertAm) setArtikelGespeichertAm(p.gespeichertAm);
          if (artikel.some((a, i) => a !== geladen[i])) {
            const gespeichertAm = Date.now();
            setArtikelGespeichertAm(gespeichertAm);
            store.set(K.artikel, JSON.stringify({ artikel, gespeichertAm }))
              .catch(() => setErr("Artikel-Speichern fehlgeschlagen."));
          }
        } catch { /* leer */ }
      }
    }).catch(() => {});
  }, []);
  const persistArtikel = useCallback((liste) => {
    const jetzt = Date.now();
    setArtikelGespeichertAm(jetzt);
    store.set(K.artikel, JSON.stringify({ artikel: liste, gespeichertAm: jetzt })).catch(() => setErr("Artikel-Speichern fehlgeschlagen."));
  }, []);
  const artikelListeRef = useRef(artikelListe);
  artikelListeRef.current = artikelListe;
  const schreibeArtikel = useCallback((berechne) => {
    const vorher = artikelListeRef.current;
    const next = typeof berechne === "function" ? berechne(vorher) : berechne;
    if (next === vorher) return vorher;
    artikelListeRef.current = next;
    setArtikelListe(next);
    persistArtikel(next);
    return next;
  }, [persistArtikel]);
  const ohneAbgleichFelder = (a) => ({ ...a, liste: a.liste.map(({ abgleich, ...rest }) => rest), abgleichStat: undefined });

  const erstelleArtikel = useCallback((daten) => {
    const id = neueArtikelId(daten.titel, artikelListe);
    const abg = gleicheArtikelAb({ ...daten, id, status: "wartet", erstellt_am: new Date().toISOString() }, refUniversum);
    const art = ohneAbgleichFelder(abg);
    schreibeArtikel((prev) => [...prev, art]);
    return id;
  }, [artikelListe, refUniversum, schreibeArtikel]);

  const aktualisiereArtikel = useCallback((id, daten) => {
    schreibeArtikel((prev) => {
      const alt = prev.find((a) => a.id === id);
      if (!alt) return prev;
      // Unveränderte Referenzen behalten ihre stabile ref; nur Neues wird abgeglichen.
      const liste = uebernehmeRefs(daten.liste, alt.liste);
      /* Ein vor dem neuen Zustandsmodell geteilter Artikel darf seine öffentliche
         Existenz beim Abschalten des Schalters nicht vergessen. */
      const publikation = alt.publikation || (alt.geteilt ? publicationState(alt) : undefined);
      const abg = gleicheArtikelAb({ ...alt, ...daten, liste, status: "wartet", publikation }, refUniversum);
      return prev.map((a) => (a.id === id ? ohneAbgleichFelder(abg) : a));
    });
    return id;
  }, [refUniversum, schreibeArtikel]);

  /* ---- Must-Watch CRUD (Liste ist die einzige Wahrheit) ---- */
  const addMustwatch = useCallback((daten) => {
    const eintrag = {
      id: neueMustwatchId(daten.titel, mustwatch),
      titel: daten.titel,
      im_besitz: !!daten.im_besitz,
      beschreibung: daten.beschreibung || "",
      notiz: daten.notiz || "",
      verknuepfung: daten.verknuepfung || null,
      erstellt_am: new Date().toISOString(),
    };
    const next = [...mustwatch, eintrag];
    setMustwatch(next);
    void persistMustwatch(next);
    // Rotlink-Heilung: ein neuer Must-Watch-Eintrag kann offene Blog-Refs
    // schließen — nur eindeutige Exakt-Treffer, nichts wird geraten.
    schreibeArtikel((alist) => {
      const [geheilt, n] = heileRotlinks(alist, mitMustwatch(master, next));
      return n > 0 ? geheilt : alist;
    });
  }, [mustwatch, persistMustwatch, master, mitMustwatch, schreibeArtikel]);
  const updateMustwatch = useCallback((id, changes) => {
    const next = mustwatch.map((e) => (e.id === id ? { ...e, ...changes } : e));
    setMustwatch(next);
    void persistMustwatch(next);
  }, [mustwatch, persistMustwatch]);
  const deleteMustwatch = useCallback((id) => {
    const next = mustwatch.filter((e) => e.id !== id);
    setMustwatch(next);
    void persistMustwatch(next);
  }, [mustwatch, persistMustwatch]);

  /* ---- Migration must_watch-Flag -> Liste (einmalig, idempotent, mit Bericht) ---- */
  const [migrationsBericht, setMigrationsBericht] = useState(null);
  const offeneFlags = useMemo(() => offeneFlagAnzahl(master, mustwatch), [master, mustwatch]);
  const migriereMustwatch = useCallback(() => {
    const { neue, uebersprungen } = migriereFlags(master || [], mustwatch, new Date().toISOString());
    if (neue.length) {
      const next = [...mustwatch, ...neue];
      setMustwatch(next);
      persistMustwatch(next);
    }
    setMigrationsBericht({ angelegt: neue.length, uebersprungen });
  }, [master, mustwatch, persistMustwatch]);

  /* ---- Besitz-Nachtrag-Import (deterministisch, idempotent; NUR über die
     App-eigenen Pfade ensureIds + persistMaster — nie roh) ---- */
  const [besitzImportBericht, setBesitzImportBericht] = useState(null);
  const importiereBesitz = useCallback(async (text) => {
    setErr("");
    try {
      const datei = parseBesitzImport(text);
      const { neue, bericht } = wendeBesitzImportAn(datei, master || [], new Date().toISOString());
      if (neue.length) {
        const next = ensureIds([...(master || []), ...neue]);
        const h = naechsteHerkunft();
        setMasterHerkunft(h);
        setMaster(next);
        await persistMaster(next, masterMeta, h);
        schreibeArtikel((prev) => {
          const [geheilt, n] = heileRotlinks(prev, mitMustwatch(next, mustwatch));
          return n > 0 ? geheilt : prev;
        });
      }
      setBesitzImportBericht({
        uebernommen: bericht.filter((b) => b.status === "übernommen").length,
        uebersprungen: bericht.filter((b) => b.status !== "übernommen").length,
        zeilen: bericht,
      });
    } catch (e) { setErr("Besitz-Import fehlgeschlagen: " + e.message); }
  }, [master, masterMeta, mustwatch, naechsteHerkunft, persistMaster, schreibeArtikel, mitMustwatch]);

  const setzeArtikelRef = useCallback((id, index, ref, rotlinkOk) => {
    schreibeArtikel((prev) => (
      prev.map((a) => a.id !== id ? a : {
        ...a, liste: a.liste.map((le, i) => (i === index ? { ...le, ref: ref || null, rotlink_ok: !!rotlinkOk } : le)),
      })
    ));
  }, [schreibeArtikel]);

  /* Publish, Unpublish und „öffentlich entfernen, dann lokal löschen“ teilen
     genau einen beständigen Vorgang. Lokales Löschen geschieht erst nach
     bestätigtem Unpublish; Fehler bleiben am Artikel sichtbar und wiederholbar. */
  const fuehrePublikationsAktion = useCallback(async (artikel, aktion) => {
    if (!artikel || artikel.herkunft === "gezogen") return;
    const vorgangId = publicationOperationId();
    schreibeArtikel((prev) => (
      prev.map((a) => a.id === artikel.id
        ? beginPublication(a, aktion, vorgangId)
        : a)
    ));
    try {
      const result = aktion === SHARED_PUBLICATION_ACTION.PUBLISH
        ? await sharedArticlesService.publish(artikel)
        : await sharedArticlesService.unpublish(artikel.id);
      schreibeArtikel((prev) => {
        const aktuell = prev.find((a) => a.id === artikel.id);
        /* Eine neuere Nutzeraktion besitzt eine andere Vorgangs-ID. Dann ist
           diese verspätete Antwort fachlich überholt und bleibt wirkungslos. */
        if (!aktuell || publicationState(aktuell).operationId !== vorgangId) return prev;
        return aktion === SHARED_PUBLICATION_ACTION.DELETE
          ? prev.filter((a) => a.id !== artikel.id)
          : prev.map((a) => a.id === artikel.id ? completePublication(a, vorgangId, result) : a);
      });
    } catch (error) {
      schreibeArtikel((prev) => {
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
    }
  }, [schreibeArtikel]);

  const freigebeArtikel = useCallback((id) => {
    const artikel = artikelListe.find((a) => a.id === id);
    if (!artikel) return;
    const freigegeben = { ...artikel, status: "freigegeben" };
    schreibeArtikel((prev) => (
      prev.map((a) => (a.id === id ? { ...a, status: "freigegeben" } : a))
    ));
    if (freigegeben.herkunft === "gezogen") return;
    if (freigegeben.geteilt) {
      void fuehrePublikationsAktion(freigegeben, SHARED_PUBLICATION_ACTION.PUBLISH);
    } else if (needsRemoteRemoval(freigegeben)) {
      void fuehrePublikationsAktion(freigegeben, SHARED_PUBLICATION_ACTION.UNPUBLISH);
    }
  }, [artikelListe, schreibeArtikel, fuehrePublikationsAktion]);

  const loescheArtikel = useCallback(async (id) => {
    const artikel = artikelListe.find((a) => a.id === id);
    if (!artikel) return;
    if (needsRemoteRemoval(artikel)) {
      await fuehrePublikationsAktion(artikel, SHARED_PUBLICATION_ACTION.DELETE);
      return;
    }
    schreibeArtikel((prev) => prev.filter((a) => a.id !== id));
  }, [artikelListe, schreibeArtikel, fuehrePublikationsAktion]);

  const wiederholePublikation = useCallback((id) => {
    const artikel = artikelListe.find((a) => a.id === id);
    const aktion = publicationRetryAction(artikel);
    if (artikel && aktion) void fuehrePublikationsAktion(artikel, aktion);
  }, [artikelListe, fuehrePublikationsAktion]);

  /* Einen geteilten Blog in die eigene Mediathek ziehen: lokale Kopie mit Herkunft,
     Referenzen gegen die eigene Master neu aufgelöst (fehlende = Rotlink). */
  const zieheSharedBlog = useCallback((sharedBlog) => {
    const art = blogZuArtikel(
      sharedBlog,
      artikelListeRef.current,
      refUniversum,
    );
    schreibeArtikel((prev) => [...prev, art]);
    return art.id;
  }, [refUniversum, schreibeArtikel]);

  /* ---- Export-Wächter: ungesicherte Browser-Änderungen sichtbar machen ----
     Browser-Speicher ist kein Backup. Sobald der Storage-Stand jünger ist
     als der letzte Export, erscheint ein roter Punkt am Einstellungen-Tab + Banner. */
  const [exportStand, setExportStand] = useState({ master: 0, artikel: 0 });
  const exportStandRef = useRef(exportStand);
  exportStandRef.current = exportStand;
  const [artikelGespeichertAm, setArtikelGespeichertAm] = useState(0);
  useEffect(() => {
    store.get(K.exportStand).then((r) => {
      if (r && r.value) {
        try {
          const next = { master: 0, artikel: 0, ...JSON.parse(r.value) };
          exportStandRef.current = next;
          setExportStand(next);
        } catch { /* Default */ }
      }
    }).catch(() => {});
  }, []);
  const markiereExport = useCallback((feld) => {
    const next = { ...exportStandRef.current, [feld]: Date.now() };
    exportStandRef.current = next;
    setExportStand(next);
    store.set(K.exportStand, JSON.stringify(next)).catch(() => {});
  }, []);
  const ungesichertMaster = masterHerkunft && masterHerkunft.typ === "storage"
    && typeof masterHerkunft.zeit === "number" && masterHerkunft.zeit > exportStand.master;
  const ungesichertArtikel = artikelListe.length > 0 && artikelGespeichertAm > exportStand.artikel;

  /* Hilfe ist nun ausschließlich nutzerinitiiert. Die frühere automatische
     Tour bei Tabwechseln und Scrollereignissen ist aus dem Laufzeitpfad entfernt. */
  const [klaerung, setKlaerung] = useState(null); // Quellen-Klärung nach KI-Import

  /* ---- Artikel-Export/-Import (Sicherung, analog Master) ---- */
  const exportArtikel = useCallback(() => {
    const blob = new Blob([JSON.stringify({ exportiert_am: new Date().toISOString(), artikel: artikelListe }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "artikel.json"; a.click();
    URL.revokeObjectURL(url);
    markiereExport("artikel");
  }, [artikelListe, markiereExport]);
  const importArtikel = useCallback((text) => {
    setErr("");
    try {
      const p = JSON.parse(text);
      const liste = Array.isArray(p) ? p : p.artikel;
      if (!Array.isArray(liste)) throw new Error("Kein 'artikel'-Array gefunden.");
      // KD-006: Schema-Müll ablehnen statt zu persistieren (sonst Blog-Crash an a.liste.map/a.text).
      if (!liste.every(gueltigerArtikel)) throw new Error("Datei enthält ungültige Artikel (id/titel/text/liste) — nicht importiert.");
      // KD-004: bestehende Artikel werden ersetzt -> Rollback-Snapshot ZUERST (fail-closed).
      if (artikelListe.length && !schreibeImportSnapshot("kd:import:vorher:artikel", artikelListe))
        throw new Error("Sicherungs-Snapshot vor dem Ersetzen fehlgeschlagen (Speicher voll/blockiert) — nichts überschrieben.");
      schreibeArtikel(liste);
    } catch (e) { setErr("Artikel-Import fehlgeschlagen: " + e.message); }
  }, [artikelListe, schreibeArtikel]);

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
  const uebernehmePaket = useCallback(({ neueFilme, neueArtikel }) => {
    let neuerMaster = master || [];
    if (neueFilme.length) {
      neuerMaster = [...neuerMaster, ...neueFilme];
      const h = naechsteHerkunft();
      setMasterHerkunft(h);
      setMaster(neuerMaster);
      persistMaster(neuerMaster, masterMeta, h);
      // KI-Import mit unklaren Quellen -> gesammelt klären (alle offenen, auch früher vertagte)
      if (neueFilme.some((f) => f.quelle_unklar)) {
        setKlaerung(neuerMaster.filter((f) => f.quelle_unklar).map((f) => ({ id: f.id, titel: f.titel, jahr: f.jahr })));
      }
    }
    schreibeArtikel((prev) => {
      let next = neueArtikel.length ? [...prev, ...neueArtikel] : prev;
      const [geheilt, n] = heileRotlinks(next, mitMustwatch(neuerMaster, mustwatch));
      if (n > 0) next = geheilt;
      return next;
    });
  }, [master, masterMeta, mustwatch, mitMustwatch, naechsteHerkunft, persistMaster, schreibeArtikel]);

  /* ---- Gesamt-Backup als Download (treiber-agnostisch: frischer Pull + Lesen über store) ----
     Liest NICHT mehr aus React-State (v2-Falle), sondern nach einem erzwungenen frischen
     Pull des aktiven Treibers alle 10 Schlüssel über `store` (backup.js). */
  const backupGesamt = useCallback(async () => {
    const b = await baueBackup();
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kinodreieck_backup_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

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
  const springeZuFilm = useCallback((ref) => { setMediathekFokus(ref); setExpandedId("b" + ref); setTab("mediathek"); }, []);
  const springeZuArtikel = useCallback((id) => { setBlogFokus(id); setTab("blog"); }, []);

  const updateFilm = useCallback((id, changes) => {
    const next = (master || []).map((f) => (f.id === id ? { ...f, ...changes } : f));
    const h = naechsteHerkunft();
    setMasterHerkunft(h);
    setMaster(next);
    persistMaster(next, masterMeta, h);
  }, [master, persistMaster, masterMeta, naechsteHerkunft]);

  const deleteFilm = useCallback(async (id) => {
    const aktuell = masterRef.current || [];
    const film = aktuell.find((eintrag) => eintrag.id === id);
    if (!film) return false;
    const plan = planeFilmLoeschung(aktuell, artikelListeRef.current, mustwatch, id);
    const teile = [];
    if (plan.folgen.artikelRefs) teile.push(`${plan.folgen.artikelRefs} Blog-Verweis${plan.folgen.artikelRefs === 1 ? " wird" : "e werden"} wieder zum Rotlink`);
    if (plan.folgen.mustwatchRefs) teile.push(`${plan.folgen.mustwatchRefs} Must-Watch-Verknüpfung${plan.folgen.mustwatchRefs === 1 ? " wird" : "en werden"} gelöst`);
    const folgeText = teile.length ? `\n\n${teile.join("; ")}.` : "";
    if (!window.confirm(`„${film.titel}“ wirklich aus der Mediathek löschen?${folgeText}`)) return false;

    const herkunft = naechsteHerkunft();
    /* Laufende KI-Antworten sehen den Film ab jetzt nicht mehr und können ihn
       nicht nach der Bestätigung wieder in die Liste schreiben. */
    masterRef.current = plan.master;
    if (!await persistMaster(plan.master, masterMeta, herkunft)) {
      masterRef.current = aktuell;
      return false;
    }
    setMasterHerkunft(herkunft);
    setMaster(plan.master);
    if (plan.folgen.artikelRefs) schreibeArtikel(plan.artikel);
    if (plan.folgen.mustwatchRefs) {
      setMustwatch(plan.mustwatch);
      persistMustwatch(plan.mustwatch);
    }
    setExpandedId(null);
    return true;
  }, [masterMeta, mustwatch, naechsteHerkunft, persistMaster, persistMustwatch, schreibeArtikel]);

  const uebernehmeQuellenKlaerung = useCallback((map) => {
    const next = (master || []).map((f) => (
      map[f.id] !== undefined
        ? { ...f, quelle: map[f.id], quelle_unklar: undefined }
        : f
    ));
    const h = naechsteHerkunft();
    setMasterHerkunft(h);
    setMaster(next);
    persistMaster(next, masterMeta, h);
    setKlaerung(null);
  }, [master, masterMeta, naechsteHerkunft, persistMaster]);

  /* Gibt die neue ID zurück (Blog-Rotlink-Anlage setzt damit sofort die ref).
     Nach jedem neuen Eintrag: automatische Rotlink-Heilung über alle Artikel —
     nur eindeutige Exakt-Treffer, nichts wird geraten. */
  const addFilm = useCallback((film) => {
    const id = film.id || slugId(film.titel, film.jahr);
    if ((master || []).some((f) => f.id === id)) {
      setErr("Eintrag existiert bereits: " + film.titel + (film.jahr ? " (" + film.jahr + ")" : ""));
      return null;
    }
    const next = [...(master || []), { id, ...film }];
    const h = naechsteHerkunft();
    setMasterHerkunft(h);
    setMaster(next);
    persistMaster(next, masterMeta, h);
    schreibeArtikel((prev) => {
      const [geheilt, n] = heileRotlinks(prev, mitMustwatch(next, mustwatch));
      if (n > 0) return geheilt;
      return prev;
    });
    return id;
  }, [master, mustwatch, mitMustwatch, persistMaster, masterMeta, naechsteHerkunft, schreibeArtikel]);

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
    masterRef,
    masterMeta,
    mustwatch,
    mitMustwatch,
    naechsteHerkunft,
    persistMaster,
    setMaster,
    setMasterHerkunft,
    schreibeArtikel,
    setErr,
  });

  /* ---- Startwahl treffen/ändern (Modal & Einstellungen-Tab) ----
     Schreibt kd:start und lädt entsprechend. "Startart wechseln" (Einstellungen-Tab)
     verwirft dabei den Browser-Stand — beide Wege ohne Datei-Gefummel. */
  const waehleStart = useCallback((wahl) => {
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
      if (!catalogService.hasConnection()) setKatalogZugangOffen(true);
      return;
    }
    const hatPersoenlicheDaten = !!((master && master.length) || artikelListe.length || mustwatch.length || merkliste.length || kinoPins.length);
    if (startWahlBestaetigt() && aktuelle && aktuelle !== wahl && hatPersoenlicheDaten
      && !window.confirm("Startmodus wechseln?\n\nDabei wird die aktuelle Mediathek im Browser verworfen. Lade vorher ein Gesamt-Backup herunter, wenn du sie behalten möchtest.")) return;
    store.delete(K.master).catch(() => {});
    try {
      localStorage.setItem(K.start, wahl);
      localStorage.setItem(K.startVersion, START_WAHL_VERSION);
      localStorage.removeItem(K.demoSeed);
      setupUeberspringen();
    } catch { /* */ }
    setStartModalOffen(false);
    if (!catalogService.hasConnection()) {
      setKatalogZugangOffen(true);
      return;
    }
    /* Ein Reload hält den Start atomar: Demo-Seeds werden vor allen übrigen
       Storage-Effekten geladen, Clean startet garantiert ohne Alt-Master. */
    try { location.reload(); } catch {
      setMaster(null); setMasterMeta(null); setMasterHerkunft(null);
      setSnapshotFreigabe(true); setStartTick((t) => t + 1);
    }
  }, [master, artikelListe, mustwatch, merkliste, kinoPins, session.mode]);
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
    const nextMaster = (master || []).filter((f) => !masterIds.has(f.id));
    if (nextMaster.length) {
      const h = { typ: "storage", zeit: Date.now(), basis: "Clean nach Demo" };
      setMaster(nextMaster); setMasterHerkunft(h); await persistMaster(nextMaster, masterMeta, h);
    } else {
      try { await store.delete(K.master); } catch { /* */ }
      setMaster(null); setMasterMeta(null); setMasterHerkunft(null);
    }
    const artIds = new Set(seed.artikelIds || []);
    schreibeArtikel((prev) => prev.filter((a) => !artIds.has(a.id)));
    const mwIds = new Set(seed.mustwatchIds || []);
    const nextMustwatch = mustwatch.filter((e) => !mwIds.has(e.id));
    setMustwatch(nextMustwatch);
    persistMustwatch(nextMustwatch);
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
    session.mode, master, masterMeta, artikelListe, mustwatch, kinoPins, merkliste, auswahl,
    persistMaster, persistMustwatch, persistPins, persistMerk, schreibeArtikel,
  ]);

  /* ---- Master-Export (hält Max' Datei synchron) ---- */
  const exportMaster = useCallback(() => {
    const meta = { ...(masterMeta || {}), export_am: new Date().toISOString().slice(0, 10), anzahl_eintraege: master.length };
    const blob = new Blob([JSON.stringify({ meta, filme: master }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "max_filmguide_masterliste_export.json";
    a.click();
    URL.revokeObjectURL(url);
    markiereExport("master");
  }, [master, masterMeta, markiereExport]);

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
  const ladeStreamingDateienRef = useRef(null);
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
      setKinoFokus({ art: "film", ref: treffer.ref, titel: treffer.titel });
      navigiere("kino");
    } else if (treffer.typ === "film" && treffer.bereich === "streaming") {
      setExpandedId("s" + treffer.ref);
      setStreamingFokus({ art: "programm", ref: treffer.ref, titel: treffer.titel });
      navigiere("streaming");
    } else if (treffer.typ === "film") springeZuFilm(treffer.ref);
    else if (treffer.typ === "blog") springeZuArtikel(treffer.ref);
    else if (treffer.typ === "hilfe" && treffer.ziel) navigiere(treffer.ziel);
    else if (treffer.typ === "kino") {
      setZeigeAlles(true);
      setKinoFokus({ art: "programm", ref: treffer.ref, titel: treffer.titel });
      navigiere("kino");
    } else if (treffer.typ === "streaming") {
      setStreamingFokus({ art: "entdecken", ref: treffer.ref, titel: treffer.titel });
      navigiere("streaming");
    }
  }, [navigiere, springeZuArtikel, springeZuFilm]);
  const toggleGlobalesMenu = useCallback(() => {
    setGlobaleSuchantwort(null);
    toggleMehr();
  }, [toggleMehr]);
  const navigiereAusGlobalemMenu = useCallback((ziel) => {
    setGlobaleSuchantwort(null);
    navigiere(ziel);
  }, [navigiere]);
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
    const uebernehmeInfo = (r) => {
      const ausCache = r.quelle === "cache";
      setStreamingInfo({
        art: ausCache ? "cache" : "datenbank", variante: r.variante,
        stand: zeitpunkt(r.stand) ?? (ausCache ? r.gecachtAm : Date.now()),
        gueltigBis: zeitpunkt(r.gueltigBis), abgelaufen: !!r.abgelaufen,
        ausCache, anmeldungNoetig: !!r.anmeldungNoetig, fehler: null,
        code: ausCache ? (r.code || null) : null,
      });
      if (ausCache && r.code === ERROR_CODES.INVALID_KEY) setErr("Streamingkatalog aus dem letzten Browser-Stand — der hinterlegte Zugangsschlüssel wird gerade abgelehnt (Settings → Datenmodus & Verbindung).");
      else if (ausCache && r.warnung) setErr("Streamingkatalog aus dem letzten Browser-Stand geladen (DB derzeit nicht erreichbar).");
      else if (r.abgelaufen) setErr("Dieser Streaming-Schnappschuss ist abgelaufen und zeigt nicht mehr die aktuelle Verfügbarkeit.");
    };
    const meldeFehler = (e, entdeckenTeil = false) => {
      const code = e?.code || null;
      const anmeldungNoetig = code === ERROR_CODES.UNAUTHENTICATED;
      const text = anmeldungNoetig
        ? "Für den aktuellen Streamingkatalog ist eine Anmeldung nötig — melde dich unter Settings → Konto an."
        : code === ERROR_CODES.NO_DEMO_DATA
          ? "Für den öffentlichen Zugang sind noch keine Beispieldaten veröffentlicht. Mit einer Anmeldung siehst du den laufenden Streamingkatalog."
          : code === ERROR_CODES.INVALID_KEY
            ? "Der hinterlegte Zugangsschlüssel wird von der Datenbank nicht akzeptiert — prüfe ihn unter Settings → Datenmodus & Verbindung."
            : (entdeckenTeil ? "Entdecken-Katalog" : "Streamingkatalog") + " nicht ladbar: " + errorText(e);
      setErr(text);
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
        roh = { ...roh, bekannt: r.payload };
        streamingRohRef.current = roh;
        streamingGeladen.current = true;
        uebernehmeInfo(r);
      } catch (e) {
        if (veraltet()) return;
        streamingGeladen.current = false;
        const file = typeof location !== "undefined" && location.protocol === "file:";
        if (!file) { meldeFehler(e); return; }
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
        return a;
      }
    }

    if (vollKatalog && (!entdeckenGeladen.current || !roh.entdecken)) {
      try {
        const r = await holeEinmal(streamingEntdeckenLaufRef, "streamingEntdecken", 20000);
        if (veraltet() || !snapshotFreigabeRef.current) return;
        roh = { ...roh, entdecken: r.payload };
        streamingRohRef.current = roh;
        entdeckenGeladen.current = true;
        uebernehmeInfo(r);
      } catch (e) {
        if (veraltet()) return;
        entdeckenGeladen.current = false;
        meldeFehler(e, true);
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
  }, [snapshotFreigabe, master]);
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
    const dienste = sichtbareDienste(t.dienste, auswahl);
    if (!dienste.length) return null;
    return (
      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
        {dienste.slice(0, 3).map((d) => (
          <span key={d} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "2px 6px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d}
          </span>
        ))}
        {dienste.length > 3 && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.rauch }}>+{dienste.length - 3}</span>}
      </span>
    );
  }, [streamingMap, auswahl]);
  /* Badges/Mein-Programm/Katalog-Zähler brauchen die LEICHTE bekannt-Datei auch
     außerhalb des Streaming-Tabs -> am Boot nachladen (KD-031: ohne Voll-Katalog). */
  useEffect(() => { if (bootDone && snapshotFreigabe) ladeStreamingDateien(); }, [bootDone, snapshotFreigabe, ladeStreamingDateien]);

  /* ---- Betriebsart-Wechsel (Gast ↔ Konto): Katalog wirklich neu laden ----
     An- und Abmelden ändert, welche Zeile der Katalogpfad überhaupt lesen darf.
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

     B7 (nur vermerkt, KEIN Umbau): „Betriebsart" hat hier zwei Definitionen.
     Dieser Effekt entscheidet an `session.mode`, alle Leser (activeVariant,
     loadArea, die Boot-Prüfung) am Vorhandensein einer Sitzung bzw. eines
     Tokens. Bei einer degradierten Sitzung (mode "account", Server nicht
     erreichbar) fallen die auseinander. Heute folgenlos, weil beide Seiten
     dann dasselbe Ergebnis liefern — aber eine Doppel-Wahrheit, die bei der
     nächsten Änderung an der Sitzungslogik zuerst zu prüfen ist. */
  useEffect(() => {
    if (!bootDone) return undefined;
    const jetzt = session.mode === "account" ? "live" : "demo";
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
  }, [session.mode, bootDone, snapshotFreigabe, ladeProgrammDatei, ladeStreamingDateien]);

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
    willkommenOffen: false,
    setTab,
    springeZuFilm,
  });

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
    const [programmOk] = await Promise.all([ladeProgrammDatei(true), ladeStreamingDateien(true)]);
    if (programmOk) setErr("");
  }, [ladeProgrammDatei, ladeStreamingDateien]);

  const wrap = {
    minHeight: "100dvh",
    background: T.saal,
    color: T.leinwand,
    fontFamily: "'Space Grotesk', sans-serif",
    padding: "0 0 60px",
  };

  return (
    <div style={wrap} className={"kd-wrap kd-schrift-" + (einstellungen.schrift || "normal") + (einstellungen.modus === "showa" ? " kd-showa" : einstellungen.modus === "neon-noir" ? " kd-neon-noir" : "")}>
      <ModusFx modus={einstellungen.modus} />
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
      {hilfeOffen && <HilfeSheet onClose={() => setHilfeOffen(false)} />}
      {klaerung && klaerung.length > 0 && (
        <QuelleKlaerung eintraege={klaerung}
          onSpaeter={() => setKlaerung(null)}
          onFertig={uebernehmeQuellenKlaerung} />
      )}
      <header style={{ padding: "26px 22px 12px", maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size={34} />
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 34, letterSpacing: "0.1em", margin: 0, textTransform: "uppercase" }}>
            Kinodreieck
          </h1>
          <div className="kd-syncchip-head" style={{ marginLeft: "auto" }}><SyncStatusChip /></div>
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg, " + T.wolfram + ", transparent 70%)", marginTop: 14 }} />
      </header>
      <nav className="kd-menu" style={{ position: "sticky", top: 0, background: T.saal, borderBottom: "1px solid " + T.saalHoch }} aria-label="Hauptnavigation">
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 22px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {NAVIGATION.map(({ id, label }) => (
            <button key={id} className={tab === id ? "kd-nav-aktiv" : undefined} onClick={() => navigiere(id)}
              style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 17,
                letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "8px 16px", border: "none", cursor: "pointer", borderRadius: "4px 4px 0 0",
                background: tab === id ? T.leinwand : "transparent",
                color: tab === id ? T.tinte : T.rauch,
                position: "relative",
              }}>
              {label}
              {id === "daten" && (ungesichertMaster || ungesichertArtikel) && (
                <span title="Ungesicherte Änderungen im Browser — bitte exportieren"
                  style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4, background: T.gefahr, display: "inline-block" }} />
              )}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "20px 22px 0" }}>
        {tab !== "start" && <BereichsHero bereich={tab} />}
        {(ungesichertMaster || ungesichertArtikel) && (
          <aside className="kd-backup-hinweis kd-nur-desktop" role="status">
            <span><strong>Noch nicht gesichert.</strong> Browser-Speicher ist kein Backup.</span>
            <button onClick={() => navigiere("daten")}>Sicherung öffnen</button>
          </aside>
        )}
        {err && (
          <div style={{ background: "rgba(217,106,90,0.12)", border: "1px solid " + T.gefahr, borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>
            {err}
          </div>
        )}

        {bootDone && loading === "programm" && !progStand && (
          <div style={{ background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 14, color: T.leinwandTief, lineHeight: 1.6 }}>
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
            /* Dashboard-Datenquellen (Etappe 4) — alles vorhandener App-State,
               keine neuen Fetches: Matches, Must-Watch, Abo-Auswahl, Kataloge,
               Programm-Stand. Der Beta-Pfad (Landing) ignoriert diese Props. */
            kinoMatches={kinoMatches} mustwatch={mustwatch} auswahl={auswahl}
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
            programmInfo={programmInfo} angemeldet={session.mode === "account"}
            autorName={autorName} /* KD-030: echter Autor für neue Bewertungen (EintragForm/EditPanel) */
          />
        )}

        {tab === "mediathek" && bootDone && (
          <MediathekTab
            master={master || []} nachtragFlach={master ? nachtragSichtbar : []}
            expandedId={expandedId} setExpandedId={setExpandedId}
            updateFilm={updateFilm} deleteFilm={deleteFilm} addFilm={addFilm} badgeFuer={badgeFuer}
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
            mwKandidaten={mwKandidaten}
          />
        )}

        {tab === "blog" && (
          <BlogTab
            artikel={artikelListe} master={refUniversum}
            fokusId={blogFokus} onFokusVerbraucht={() => setBlogFokus(null)}
            onErstellen={erstelleArtikel} onAktualisieren={aktualisiereArtikel}
            onSetzeRef={setzeArtikelRef} onFreigeben={freigebeArtikel} onLoeschen={loescheArtikel}
            onRetryPublication={wiederholePublikation}
            onAddFilm={addFilm} onSpringeZuFilm={springeZuFilm}
            exportArtikel={exportArtikel} importArtikel={importArtikel}
            onZiehe={zieheSharedBlog}
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
            heuristikAn={heuristikAn} setHeuristikAn={(v) => { setHeuristikAn(v); store.set(K.streamingDienste, streamingCfgJson(auswahl, v)).catch(() => {}); }}
            datenGesperrt={!snapshotFreigabe}
            katalogInfo={streamingInfo} angemeldet={session.mode === "account"}
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
            mustwatch={mustwatch} addFilm={addFilm} addMustwatch={addMustwatch}
            einstellungen={einstellungen} setzeEinstellung={setzeEinstellung} waehleModus={waehleModus}
            achievements={achievements ? [...achievements] : []}
            streamingBekannt={streamingBekannt} streamingEntdecken={streamingEntdecken}
            streamingInfo={streamingInfo}
            auswahl={auswahl} toggleQuelle={toggleQuelle} heuristikAn={heuristikAn}
            setHeuristikAn={(v) => { setHeuristikAn(v); store.set(K.streamingDienste, streamingCfgJson(auswahl, v)).catch(() => {}); }}
            datenGesperrt={!snapshotFreigabe}
            backupGesamt={backupGesamt} vokabular={vokabular} saveVokabular={saveVokabular}
            offeneFlags={offeneFlags} migriereMustwatch={migriereMustwatch} migrationsBericht={migrationsBericht}
            importiereBesitz={importiereBesitz} besitzImportBericht={besitzImportBericht}
            onKontoDatenGeaendert={() => { try { location.reload(); } catch { setStartTick((t) => t + 1); } }}
          />
        )}
      </main>
      <MobileNavigation aktiv={tab} mehrOffen={mehrOffen} onMehr={toggleMehr}
        onNavigate={navigiereAusGlobalemMenu} onNachOben={nachObenAusMenu} />
      <GlobalSearchBar bereich={tab} onSuchen={starteGlobaleSuche}
        antwort={globaleSuchantwort}
        onAntwortSchliessen={() => setGlobaleSuchantwort(null)}
        onTreffer={oeffneGlobalenTreffer}
        onAlleErgebnisse={oeffneAusfuehrlicheSuche}
        menuOffen={mehrOffen} onMenu={toggleGlobalesMenu} />
      </div>{/* .kd-app */}
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

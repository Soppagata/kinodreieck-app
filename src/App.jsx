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
import { initSetup, getSetup, getTutorial, setWillkommen, resetTutorial, istGesehen, markGesehen, setupUeberspringen } from "./lib/tutorial.js";
import { Willkommen } from "./components/Willkommen.jsx";
import { baueHinweis, onTour, SICHTBAR_TRIGGER, setTourOffen } from "./lib/tour.js";
import { TourOverlay } from "./components/TourOverlay.jsx";
import { QuelleKlaerung } from "./components/QuelleKlaerung.jsx";
import { StartWahl } from "./components/StartWahl.jsx";
import { KatalogZugang } from "./components/KatalogZugang.jsx";
import { store, K, PROGRAMM_TTL_MS } from "./lib/storage.js";
import { baueBackup } from "./lib/backup.js";
import { ladeDemoBlobs, publishBlog, unpublishBlog, ladeSharedBlogs } from "./lib/supabaseDriver.js";
import { hatKatalogZugang, ladeKatalogAsset, baueStreamingAnsichten } from "./lib/katalog.js";
import { matchFilm, ensureIds, slugId, score, norm } from "./lib/match.js";
import { hatPhysischeQuelle } from "./lib/quellen.js"; // B4: kanonisches Besitz-Modell (physische Quelle)
import { parseNonstopHtml, grenzeInMinuten, hatVorstellungAb, normalisiereProgramm } from "./lib/programm.js";
import { Logo } from "./components/ui.jsx";
import { neueArtikelId, gleicheArtikelAb, uebernehmeRefs, heileRotlinks, blogZuArtikel, reconcileGezogene } from "./lib/artikel.js";
import { neueMustwatchId, parseMustwatch, migriereFlags, offeneFlagAnzahl, parseBesitzImport, wendeBesitzImportAn } from "./lib/mustwatch.js";
import { setzeEigeneStimmungen, filmHerkunft } from "./lib/finder.js";
import { sichtbareDienste } from "./lib/dienste.js";
import { StartTab } from "./tabs/StartTab.jsx";
import { KinoTab } from "./tabs/KinoTab.jsx";
import { MediathekTab } from "./tabs/MediathekTab.jsx";
import { StreamingTab } from "./tabs/StreamingTab.jsx";
import { BlogTab } from "./tabs/BlogTab.jsx";
import { FinderTab } from "./tabs/FinderTab.jsx";
import { DatenTab } from "./tabs/DatenTab.jsx";

import nachtragDatei from "./data/nachtrag.json";
import { PERSONAL_MODE, EGGS_ENABLED } from "./lib/modus.js";
import { SyncStatusChip } from "./components/SyncStatusChip.jsx";
import { NavBand } from "./components/NavBand.jsx";
import { ModusFx, NervLogo } from "./components/ModusOverlay.jsx";
import { berechneUnlocks, ladeAchievements, speichereAchievements, liveVertreter, SCHWELLEN_EGGS } from "./lib/eggs.js";
import { ZurueckObenKnopf } from "./components/ZurueckObenKnopf.jsx";
import { CageAlphabet } from "./components/CageAlphabet.jsx";
import { Teppich } from "./components/Teppich.jsx";
import { Crawl } from "./components/Crawl.jsx";                       // B4-Egg
import { NecronomiconRand } from "./components/NecronomiconRand.jsx"; // B4-Egg
import { wuerfleTag, schonGefeuertHeute, markiereGefeuert, istVorbeiGescrollt, tagesSchluessel } from "./lib/eggFrequenz.js";
import { crawlHeute, istVierterMai } from "./lib/momentEggs.js";       // B4-Egg

/* ---- Beta-Startwahl: Clean (leer, KEINE Daten in der Datei) vs. Demo ----
   Die ausgelieferte Kinodreieck.html enthält bewusst KEINE Masterdaten. Die
   Demo lädt eine Beilage `Programmdateien/System/demo_masterliste.js` (klassisches
   Script, setzt globales __KD_DEMO_MASTER__). So bleibt die Clean-Datei spurenfrei;
   die Beilage liegt zwei Ebenen tiefer im Paket. file://-Grund: klassische
   <script src>-Ladung aus Unterordnern funktioniert, fetch() würde blockiert. */
function liesStartWahl() {
  try {
    const url = (typeof location !== "undefined") ? (location.search + location.hash) : "";
    const m = /[?&#]start=(demo|clean)/.exec(url);
    if (m) return m[1];
  } catch { /* */ }
  try {
    const v = localStorage.getItem("kd:start");
    if (v === "demo" || v === "clean") return v;
  } catch { /* */ }
  return null;
}

/* Ein Installer-Auftrag ist absichtlich destruktiv, aber nur genau einmal. Der
   Token wird VOR dem Löschen als verbraucht markiert. Bei einem Reload derselben
   URL bleibt ein danach neu aufgebauter Browser-Stand deshalb erhalten. */
let frischerStartMemo;
function verbraucheFrischenStart() {
  /* Personal-Modus: Der destruktive Installer-Pfad (?start=…&fresh=…) gehört zur
     Tester-Kulisse. Ohne diesen Guard würde jeder alte Installer-/Bookmark-Link
     8 persönliche Datentöpfe löschen — auf einem Gerät ohne Git-Sync unwiderruflich. */
  if (PERSONAL_MODE) { frischerStartMemo = null; return null; }
  if (frischerStartMemo !== undefined) return frischerStartMemo;
  frischerStartMemo = null;
  try {
    const url = (typeof location !== "undefined") ? (location.search + location.hash) : "";
    const startMatch = /[?&#]start=(demo|clean)(?:[&#]|$)/.exec(url);
    const tokenMatch = /[?&#]fresh=([^&#]+)/.exec(url);
    if (!startMatch || !tokenMatch) return null;
    const token = decodeURIComponent(tokenMatch[1]);
    if (!/^[A-Za-z0-9._~-]{8,160}$/.test(token)) return null;
    if (localStorage.getItem(K.startAuftrag) === token) return null;

    localStorage.setItem(K.startAuftrag, token);
    localStorage.setItem(K.start, startMatch[1]);
    const persoenlich = [K.master, K.artikel, K.merkliste, K.kinoPins,
      K.entdeckenStatus, K.vokabular, K.exportStand, K.autorName];
    persoenlich.forEach((key) => localStorage.removeItem(key));
    frischerStartMemo = startMatch[1];
  } catch { /* Storage blockiert: normaler, nicht-destruktiver Boot */ }
  return frischerStartMemo;
}

/* Willkommen und Tour werden erst nach einer bestätigten Einrichtung oder dem
   bewussten Überspringen des Installers freigeschaltet. */
function tutorialFrei() {
  try { return !!liesStartWahl(); } catch { return false; }
}

function snapshotsFrei() {
  return hatKatalogZugang();
}

/* Demo-Beilage bei Bedarf laden (einmalig, idempotent). Tests setzen
   window.__KD_DEMO_MASTER__ direkt -> kein Script-Load nötig. */
let demoLadePromise = null;
function ladeDemoGlobal() {
  if (typeof window !== "undefined" && window.__KD_DEMO_MASTER__) return Promise.resolve(window.__KD_DEMO_MASTER__);
  if (demoLadePromise) return demoLadePromise;
  demoLadePromise = new Promise((resolve, reject) => {
    try {
      const s = document.createElement("script");
      s.src = "Programmdateien/System/demo_masterliste.js"; // relativ zur HTML (Unterordner; file://-tauglich)
      s.onload = () => (window.__KD_DEMO_MASTER__ ? resolve(window.__KD_DEMO_MASTER__) : reject(new Error("demo_masterliste.js geladen, aber leer.")));
      s.onerror = () => { demoLadePromise = null; reject(new Error("demo_masterliste.js nicht ladbar — fehlt Programmdateien/System/demo_masterliste.js im Paket?")); };
      document.head.appendChild(s);
    } catch (e) { demoLadePromise = null; reject(e); }
  });
  return demoLadePromise;
}
async function demoLadung() {
  /* Phase 5: Demo-Masterliste per anon-Read aus Supabase (scope=demo) statt der
     synthetischen Beilage. Fallback auf die Beilage/__KD_DEMO_MASTER__ (Tests bzw.
     wenn keine Demo-Quelle konfiguriert ist). Wie zuvor: NICHT persistiert bis zur
     Bearbeitung — die Demo lebt in React-State, nicht im Storage. */
  try {
    const blobs = await ladeDemoBlobs();
    const roh = blobs && blobs["kd:master"];
    if (roh) {
      const d = JSON.parse(roh);
      const parse = (key, fallback = null) => {
        try { return blobs[key] ? JSON.parse(blobs[key]) : fallback; } catch { return fallback; }
      };
      return {
        filme: ensureIds(d.filme || []), meta: d.meta || null,
        herkunft: { typ: "demo", zeit: (d.meta && d.meta.erstellt_am) || null },
        streaming: parse("kd:streaming-dienste"),
        artikel: parse("kd:artikel"),
        pins: parse("kd:kino-pins", []),
        mustwatch: parse("kd:mustwatch"),
        merkliste: parse("kd:merkliste", []),
      };
    }
  } catch (e) {
    /* Tests und die alte file://-Ausgabe besitzen weiterhin die Beilage. In der
       gehosteten PWA darf ein DB-Fehler nicht unbemerkt synthetische Daten laden. */
    const file = typeof location !== "undefined" && location.protocol === "file:";
    const test = typeof window !== "undefined" && !!window.__KD_DEMO_MASTER__;
    if (!file && !test) throw e;
  }
  const d = await ladeDemoGlobal();
  return {
    filme: ensureIds(d.filme || []),
    meta: d.meta || null,
    herkunft: { typ: "demo", zeit: (d.meta && d.meta.erstellt_am) || null },
  };
}
/* Legacy-Beilage für die alte Single-File-/file://-Ausgabe laden, optional.
   Die gehostete PWA lädt zuerst public/streaming_entdecken.json; dieser Sidecar-Pfad
   bleibt nur für alte Kinodreieck.html-Pakete bestehen und wird dort von
   build_streaming_ansicht.js erzeugt. Fehlt er, greift der eingebettete Snapshot.
   Tests setzen window.__KD_STREAMING_ENTDECKEN__ direkt. */
let entdeckenBeilagePromise = null;
function ladeEntdeckenBeilage() {
  if (typeof window !== "undefined" && window.__KD_STREAMING_ENTDECKEN__) return Promise.resolve(window.__KD_STREAMING_ENTDECKEN__);
  if (entdeckenBeilagePromise) return entdeckenBeilagePromise;
  entdeckenBeilagePromise = new Promise((resolve) => {
    try {
      const s = document.createElement("script");
      s.src = "Programmdateien/System/streaming_entdecken.js"; // relativ zur HTML
      s.onload = () => resolve(window.__KD_STREAMING_ENTDECKEN__ || null);
      s.onerror = () => { entdeckenBeilagePromise = null; resolve(null); }; // fehlt -> Fallback Top 500
      document.head.appendChild(s);
    } catch { entdeckenBeilagePromise = null; resolve(null); }
  });
  return entdeckenBeilagePromise;
}
/* Streaming-Snapshots: beim Bauen eingebettet (Single-File/file://-Fallback);
   im Serve-Betrieb gewinnen die frischen public/-Dateien. */
import streamingBekanntSnapshot from "./data/streaming_bekannt_snapshot.json";
import streamingEntdeckenSnapshot from "./data/streaming_entdecken_snapshot.json";
/* Beim Bauen eingebetteter Programm-Snapshot: Fallback, wenn public/programm.json
   nicht erreichbar ist (z.B. Doppelklick-Nutzung der Single-File-Version, file://). */
import programmSnapshot from "./data/programm-snapshot.json";
import masterWikidata from "./data/master_wikidata.json"; // Sidecar (Phase 4b): id -> {reihe,franchise,regie} Namen

/* Nachtrag flach: [{titel, jahr, quellen[], edition}] */
const NACHTRAG_FLACH = [].concat(nachtragDatei.beide || [], nachtragDatei.nur_dvd || [], nachtragDatei.nur_prime || [], nachtragDatei.nur_apple || []);

/* KD-004: Fail-closed Rollback-Snapshot vor einem destruktiven Import (analog
   restore.js KD-008). Schreibt den aktuellen Stand nach kd:import:vorher:* und
   liest zurück (fängt stille No-op-Writes/vollen Speicher). Ohne gesicherten
   Snapshot wird der Import NICHT ausgeführt — sonst ginge ein Fehlimport
   unwiederbringlich verloren. */
function schreibeImportSnapshot(key, wert) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: new Date().toISOString(), wert }));
    return localStorage.getItem(key) != null;
  } catch { return false; }
}

/* KD-006: struktursicherer Blog-Artikel (Schema artikel.js: {id,titel,text,liste[]}).
   Der Blog rendert a.liste.map(...) und a.text — ein Array-loses `liste` oder ein
   Nicht-String-`text` crasht die Ansicht. Nur diese harten Felder werden geprüft;
   der Rest bleibt tolerant. */
function gueltigerArtikel(a) {
  return !!a && typeof a === "object"
    && typeof a.id === "string" && a.id.length > 0
    && typeof a.titel === "string"
    && Array.isArray(a.liste)
    && a.liste.every((le) => !!le && typeof le === "object")
    && (a.text === undefined || a.text === null || typeof a.text === "string");
}

export default function App() {
  const [frischerStart] = useState(() => verbraucheFrischenStart());
  const [tab, setTab] = useState("start");
  const [navOffen, setNavOffen] = useState(false); // Mobile-Nav-Drawer offen?
  const navRef = useRef(null);
  const griffRef = useRef(null);
  const drawerWarOffen = useRef(false);
  // Drawer-a11y gilt nur am Handy: dort ist .kd-menu das Popup; am Desktop (>760px)
  // ist dasselbe Element die Sticky-Leiste und muss bedienbar bleiben (kein inert).
  // jsdom-Tests laufen mit innerWidth 1024 = Desktop -> keine Verhaltensänderung dort.
  const [istMobil, setIstMobil] = useState(() => typeof window !== "undefined" && window.innerWidth <= 760);
  useEffect(() => {
    if (!navOffen) return;
    const onKey = (e) => { if (e.key === "Escape") setNavOffen(false); };
    window.addEventListener("keydown", onKey);
    // Hintergrund-Scroll sperren, solange der Drawer offen ist (Wisch auf dem Scrim).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [navOffen]);
  // Viewport beobachten (Drawer-a11y gilt nur am Handy).
  useEffect(() => {
    const onResize = () => setIstMobil(window.innerWidth <= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Fokus-Management (nur Handy): beim Öffnen auf den ersten Menüpunkt, beim Schließen
  // zurück auf den Griff — kein Tastatur-/SR-Fokus im inerten, verborgenen Popup.
  useEffect(() => {
    if (!istMobil) { drawerWarOffen.current = navOffen; return; }
    if (navOffen && !drawerWarOffen.current) navRef.current?.querySelector("button")?.focus();
    else if (!navOffen && drawerWarOffen.current) griffRef.current?.focus();
    drawerWarOffen.current = navOffen;
  }, [navOffen, istMobil]);
  const [master, setMaster] = useState(null);
  const [masterMeta, setMasterMeta] = useState(null);
  const [programm, setProgramm] = useState(null);
  const [programmArt, setProgrammArt] = useState(null);
  const [progStand, setProgStand] = useState(null);
  const [streamingBekannt, setStreamingBekannt] = useState(null);
  const [streamingEntdecken, setStreamingEntdecken] = useState(null);
  const [loading, setLoading] = useState("");
  const [err, setErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [bootDone, setBootDone] = useState(false);
  const [zeitgrenze, setZeitgrenze] = useState("14:00"); // Filter für "Läuft auch" (einstellbar, persistiert)
  const [zeigeAlles, setZeigeAlles] = useState(false);   // "Ganzes Tagesprogramm zeigen" (Session-flüchtig)
  const autoFetched = useRef(false);
  const streamingGeladen = useRef(false);
  const entdeckenGeladen = useRef(false); // KD-031: Voll-Katalog getrennt vom leichten Boot-Nachladen
  const streamingRohRef = useRef(null);

  const saveZeitgrenze = useCallback(async (v) => {
    setZeitgrenze(v);
    try { await store.set(K.zeitgrenze, v); } catch { /* nicht fatal */ }
  }, []);

  /* ---- Einstellungen: Theme, Startbereich, Schriftgröße, Darstellungsmodus ----
     Ein Objekt im Storage; setzeTheme tauscht die Token-Werte, der
     State-Wechsel rendert alles neu — Komponenten bleiben unangetastet. */
  const [einstellungen, setEinstellungenState] = useState({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "" });
  const setzeEinstellung = useCallback((k, v) => {
    setEinstellungenState((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "theme") setzeTheme(v);
      store.set(K.einstellungen, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  /* ---- Darstellungs-Modi: Saal/Foyer/Showa/NERV in EINER Gruppe.
     Die Spezialmodi erzwingen jeweils ihr dunkles Theme;
     Saal/Foyer schalten den Modus ab und setzen das Theme direkt. ---- */
  const modusWrapRef = useRef(null);
  const waehleModus = useCallback((wahl) => {
    setEinstellungenState((prev) => {
      let next;
      if (wahl === "showa" || wahl === "nerv") {
        const basisTheme = prev.modus ? (prev.basisTheme || "dunkel") : prev.theme;
        next = { ...prev, modus: wahl, basisTheme, theme: "dunkel" };
      } else if (wahl === "foyer") next = { ...prev, modus: "", basisTheme: undefined, theme: "hell" };
      else next = { ...prev, modus: "", basisTheme: undefined, theme: "dunkel" };
      setzeTheme(next.modus || next.theme);
      store.set(K.einstellungen, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  /* NERV-Glitch-Takt: seltener, kurzer Klassensprung am Wrapper (der Rest ist
     reines CSS). Showa braucht keinen JS-Takt — Korn/Vignette/Skyline/Kaiju laufen
     als CSS-Overlays. prefers-reduced-motion => gar kein Takt. */
  useEffect(() => {
    if (einstellungen.modus !== "nerv") return;
    let reduziert = false;
    try { reduziert = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* */ }
    if (reduziert) return;
    const timers = [];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const puls = () => {
      const w = modusWrapRef.current;
      if (w) { w.classList.add("kd-glitch"); timers.push(setTimeout(() => w.classList.remove("kd-glitch"), rnd(90, 220))); }
      timers.push(setTimeout(puls, rnd(4200, 11000)));
    };
    timers.push(setTimeout(puls, rnd(2600, 6000)));
    return () => { timers.forEach(clearTimeout); if (modusWrapRef.current) modusWrapRef.current.classList.remove("kd-glitch"); };
  }, [einstellungen.modus]);

  /* ---- Eastereggs (Block 3, nur PERSONAL_MODE): Achievement-Topf + Toast ----
     kd:achievements = Set freigeschalteter Egg-IDs (Einbahn). Der Check läuft als
     Effekt über `master`: der erste volle Durchlauf ist der stille Backfill (setzt
     den Anfangs-Unlock-Stand OHNE Toast), danach feuert jeder NEUE Unlock einen
     4-s-Toast. Verfügbarkeit gatet erst das Feuern (B3), nicht den Unlock. */
  const [achievements, setAchievements] = useState(null);
  const backfillRef = useRef(false);
  const toastSeq = useRef(0);
  const [toasts, setToasts] = useState([]);
  const zeigeToast = useCallback((text, sub) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, text, sub }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  useEffect(() => {
    if (!EGGS_ENABLED) return;
    ladeAchievements().then((s) => setAchievements(s)).catch(() => setAchievements(new Set()));
  }, []);
  useEffect(() => {
    if (!EGGS_ENABLED) return;
    if (achievements == null || master == null) return;
    const neu = [...berechneUnlocks(master)].filter((id) => !achievements.has(id));
    if (neu.length === 0) { backfillRef.current = true; return; }
    const naechste = new Set([...achievements, ...neu]);
    setAchievements(naechste);
    speichereAchievements(naechste);
    if (backfillRef.current) zeigeToast("Easteregg freigeschalten");
    backfillRef.current = true;
  }, [master, achievements, zeigeToast]);

  /* ---- Cage-Alphabet-Egg (B3): goldene Karte → Buchstaben-Stakkato → verfügbarer
     Cage-Film. v1-Auslöser: Vorführmodus (zeigeCage). Verfügbarkeit vorerst über
     physischen Besitz (leerer ctx); Abo/Kino-ctx ist ein Nachzug. Auto-Trigger
     „selten beim App-Start" kommt mit einer test-sicheren Frequenz-Naht später. */
  const [cageEgg] = useState(() => SCHWELLEN_EGGS.find((e) => e.id === "cage-alphabet"));
  const cageFilmeRef = useRef([]);
  const [cageOffen, setCageOffen] = useState(false);
  const [reducedMotion] = useState(() => {
    try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { return false; }
  });
  const [teppichEgg] = useState(() => SCHWELLEN_EGGS.find((e) => e.id === "teppich"));
  const teppichFilmeRef = useRef([]);
  const [teppichOffen, setTeppichOffen] = useState(false);
  const [teppichVorschau, setTeppichVorschau] = useState(false);
  // zeigeCage/zeigeTeppich/eggCtx: weiter unten definiert (brauchen kinoMatches/
  // streamingBekannt/auswahl für echte Verfügbarkeit + Sprung-Link).
  // B4-Egg: Moment-Eggs (Star-Wars-Crawl am 4. Mai, Klaatu→Necronomicon). Wie
  // Cage/Teppich ausschließlich im Personal-Modus gemountet (Mount + Vorführknopf
  // + Trigger hinter PERSONAL_MODE) — der Beta-Build bleibt egg-frei.
  const crawlMatchesRef = useRef([]);
  const [crawlOffen, setCrawlOffen] = useState(false);
  const [necroAktiv, setNecroAktiv] = useState(false);
  const [may4Aktiv, setMay4Aktiv] = useState(() => EGGS_ENABLED && istVierterMai(new Date()));
  const may4Vorschau = false;
  useEffect(() => {
    if (!EGGS_ENABLED) return;
    const aktualisieren = () => setMay4Aktiv(istVierterMai(new Date()));
    aktualisieren();
    const timer = setInterval(aktualisieren, 60_000);
    return () => clearInterval(timer);
  }, []);

  /* ---- Eigenes Suche-Vokabular: [{wort, genres[], tags[]}] ---- */
  const [vokabular, setVokabular] = useState([]);
  const vokabularZuMap = (liste) => {
    const map = {};
    for (const v of liste || []) if (v.wort) map[v.wort.trim().toLowerCase()] = { genres: v.genres || [], tags: v.tags || [] };
    return map;
  };
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
  /* Willkommen (Tutorial): einmalig nach abgeschlossener Einrichtung. Sichtbarkeit
     aus kd:setup/kd:tutorial; initSetup() (oben) hat beide bereits angelegt. */
  const [willkommenOffen, setWillkommenOffen] = useState(() => {
    try { return tutorialFrei() && !getTutorial().willkommen; } catch { return false; }
  });
  const syncOnboardingOffen = false; // Login-/Geräte-Sync ist nicht Teil der Demo-PWA.
  const [snapshotFreigabe, setSnapshotFreigabe] = useState(() => snapshotsFrei());
  const snapshotFreigabeRef = useRef(snapshotFreigabe);
  snapshotFreigabeRef.current = snapshotFreigabe;
  const [startTick, setStartTick] = useState(0); // bump nach Startwahl -> Tour-Effekte neu binden
  const [katalogZugangOffen, setKatalogZugangOffen] = useState(() => !!liesStartWahl() && !hatKatalogZugang());
  const pinAbgelaufen = (pin, jetzt = new Date()) => {
    const m = /(\d{1,2})\.(\d{1,2})\./.exec(String(pin.z));
    if (!m) return false; // unparsebar -> nie automatisch wegwerfen
    let d = new Date(jetzt.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    if (jetzt - d > 180 * 86400000) d = new Date(jetzt.getFullYear() + 1, Number(m[2]) - 1, Number(m[1]));
    return jetzt - d > 1 * 86400000; // gestern gesehen? Heute noch stehen lassen.
  };
  const persistPins = useCallback(async (pins) => {
    try { await store.set(K.kinoPins, JSON.stringify(pins)); } catch { /* nicht fatal */ }
  }, []);
  const toggleKinoPin = useCallback((t, j, z) => {
    setKinoPins((prev) => {
      const ohne = prev.filter((p) => !(p.t === t && p.z === z));
      const next = ohne.length < prev.length ? ohne : [...prev, { t, j: j ?? null, z, seit: Date.now() }];
      persistPins(next);
      return next;
    });
  }, [persistPins]);

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
    setMerkliste((prev) => {
      const drin = prev.some((m) => m.watchmode_id === t.watchmode_id);
      const next = drin ? prev.filter((m) => m.watchmode_id !== t.watchmode_id)
        : [...prev, { watchmode_id: t.watchmode_id, titel: t.titel, jahr: t.jahr ?? null, hinzugefuegt_am: new Date().toISOString().slice(0, 10) }];
      persistMerk(next);
      return next;
    });
  }, [persistMerk]);

  /* ---- Herkunft der geladenen Liste ----
     typ: "storage" | "demo" | "manuell" · zeit: ms oder Datums-String · basis: optionaler Vermerk */
  const [masterHerkunft, setMasterHerkunft] = useState(null);
  /* Startwahl-Modal (Beta): sichtbar, wenn beim Erststart weder Storage-Stand
     noch frühere Wahl noch ?start-Parameter vorliegt. Boot entscheidet. */
  const [startModalOffen, setStartModalOffen] = useState(false);

  /* ---- Master persistieren ---- */
  const persistMaster = useCallback(async (filme, meta, herkunft) => {
    try {
      const h = herkunft || { typ: "storage", zeit: Date.now() };
      await store.set(K.master, JSON.stringify({ meta, filme, herkunft: h, gespeichertAm: Date.now() }));
    } catch {
      setErr("Speichern der Masterliste fehlgeschlagen.");
    }
  }, []);

  /* ---- Kinoprogramm direkt aus dem zentralen Supabase-Katalog laden ---- */
  const ladeProgrammDatei = useCallback(async (manuell) => {
    setErr("");
    setLoading("programm");
    try {
      let parsed;
      if (manuell) {
        /* Der manuelle Knopf bleibt ein DB-Refresh; Dateiimporte besitzen ihre
           eigenen Funktionen weiter unten. */
        parsed = (await ladeKatalogAsset("programm")).payload;
      } else {
        parsed = (await ladeKatalogAsset("programm")).payload;
      }
      const data = normalisiereProgramm(parsed); // Alt- und film.at-Format
      if (!manuell && !snapshotFreigabeRef.current) return false;
      setProgramm(data);
      setProgrammArt(manuell ? "db-refresh" : "datenbank");
      setProgStand(Date.now());
      try {
        await store.set(K.programm, JSON.stringify({ fetchedAt: Date.now(), art: manuell ? "db-refresh" : "datenbank", data }));
      } catch { /* Cache-Fehler nicht fatal */ }
      return true;
    } catch (e) {
      if (manuell) {
        setErr("Programmdaten nicht aktualisierbar: " + e.message);
      } else if (typeof location !== "undefined" && location.protocol === "file:" && programmSnapshot && (Array.isArray(programmSnapshot.filme) || (programmSnapshot.data && Array.isArray(programmSnapshot.data.filme)))) {
        // Autoload gescheitert (z.B. file://) -> eingebetteter Snapshot vom Bauzeitpunkt.
        // Bewusst NICHT gecached, damit ein späterer fetch/Import gewinnt.
        try {
          const d = normalisiereProgramm(programmSnapshot);
          setProgramm({ ...d, quelle_hinweis: (d.quelle_hinweis || "") + " · eingebettet beim Bauen" });
          setProgrammArt("snapshot");
          setProgStand(programmSnapshot.erstellt ? new Date(programmSnapshot.erstellt).getTime() : Date.now());
        } catch { /* Snapshot unbrauchbar — dann eben leer */ }
      }
      return false;
    } finally {
      setLoading("");
    }
  }, []);

  /* ---- Boot: Storage → gebündelte Projektdatei → leer (manueller Import) ---- */
  useEffect(() => {
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
        const wahl = frischerStart || liesStartWahl();
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
                seed.streaming = true;
              }
              if (d.artikel) {
                const al = Array.isArray(d.artikel) ? d.artikel : d.artikel.artikel || [];
                setArtikelListe(al);
                localStorage.setItem(K.artikel, JSON.stringify({ artikel: al, gespeichertAm: Date.now() }));
                seed.artikelIds = al.map((a) => a.id);
              }
              if (Array.isArray(d.pins)) { setKinoPins(d.pins); localStorage.setItem(K.kinoPins, JSON.stringify(d.pins)); seed.pins = true; }
              if (d.mustwatch) {
                const mw = parseMustwatch(JSON.stringify(d.mustwatch));
                setMustwatch(mw); localStorage.setItem(K.mustwatch, JSON.stringify({ eintraege: mw, gespeichertAm: Date.now() }));
                seed.mustwatchIds = mw.map((e) => e.id);
              }
              if (Array.isArray(d.merkliste)) { setMerkliste(d.merkliste); localStorage.setItem(K.merkliste, JSON.stringify(d.merkliste)); seed.merkliste = true; }
              localStorage.setItem(K.demoSeed, JSON.stringify(seed));
            } catch { /* Seed-State bleibt mindestens in React erhalten */ }
          } catch (e) {
            setErr("Demo-Daten nicht ladbar: " + e.message);
            setKatalogZugangOffen(true);
          }
        } else if (wahl === "clean") {
          try { localStorage.setItem("kd:start", "clean"); } catch { /* */ }
        } else if (PERSONAL_MODE) {
          // Personal-Modus: keine Demo/Clean-Wahl — leerer Start, echte Daten
          // kommen per Restore-Import bzw. Git-Sync.
          try { localStorage.setItem("kd:start", "clean"); } catch { /* */ }
        } else {
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
          const e = { theme: "dunkel", startTab: "start", schrift: "normal", modus: "", ...JSON.parse(r.value) };
          delete e.kurosawa;                                     // uralter Bool, längst durch modus ersetzt
          if (e.modus === "kurosawa" || e.modus === "grindhouse") e.modus = ""; // v1-Modi zurückgezogen (Showa/NERV lösen sie ab)
          setEinstellungenState(e);
          setzeTheme(e.modus || e.theme);                        // Modus (showa/nerv) überschreibt die Basis-Palette
          if (e.startTab && e.startTab !== "start") setTab(e.startTab);
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
        try { setProgramm(normalisiereProgramm(cachedProg.data)); setProgrammArt(cachedProg.art || "snapshot"); setProgStand(cachedProg.fetchedAt); }
        catch { /* Cache unbrauchbar — Autoload übernimmt */ }
      }
      setStartModalOffen(startModalNoetig);
      setBootDone(true);
    })();
  }, [frischerStart]);

  /* ---- Autoload: ohne frischen Cache einmalig programm.json probieren ---- */
  useEffect(() => {
    if (bootDone && snapshotFreigabe && !programm && !autoFetched.current) {
      autoFetched.current = true;
      ladeProgrammDatei(false);
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
      setProgramm(data);
      setProgrammArt("manuell");
      setProgStand(Date.now());
      try {
        await store.set(K.programm, JSON.stringify({ fetchedAt: Date.now(), art: "manuell", data }));
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
      setProgramm(data);
      setProgrammArt("manuell");
      setProgStand(Date.now());
      try {
        await store.set(K.programm, JSON.stringify({ fetchedAt: Date.now(), art: "manuell", data }));
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

  /* Blog-Referenz-Universum = Master ∪ Must-Watch. Ohne diese Erweiterung würde
     gleicheArtikelAb eine mw_-ref beim nächsten Artikel-Edit still löschen
     (masterIds-Check). Must-Watch-Pseudoeinträge: {id, titel, jahr: null, typ film}. */
  const mitMustwatch = useCallback((masterArr, mwArr) => ([
    ...(masterArr || []),
    ...(mwArr || []).map((e) => ({ id: e.id, titel: e.titel, jahr: null, typ: "film" })),
  ]), []);
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
      if (r && r.value) { try { const p = JSON.parse(r.value); setArtikelListe(Array.isArray(p) ? p : p.artikel || []); if (p.gespeichertAm) setArtikelGespeichertAm(p.gespeichertAm); } catch { /* leer */ } }
    }).catch(() => {});
  }, []);
  const persistArtikel = useCallback((liste) => {
    const jetzt = Date.now();
    setArtikelGespeichertAm(jetzt);
    store.set(K.artikel, JSON.stringify({ artikel: liste, gespeichertAm: jetzt })).catch(() => setErr("Artikel-Speichern fehlgeschlagen."));
  }, []);
  const ohneAbgleichFelder = (a) => ({ ...a, liste: a.liste.map(({ abgleich, ...rest }) => rest), abgleichStat: undefined });

  const erstelleArtikel = useCallback((daten) => {
    const id = neueArtikelId(daten.titel, artikelListe);
    const abg = gleicheArtikelAb({ ...daten, id, status: "wartet", erstellt_am: new Date().toISOString() }, refUniversum);
    const art = ohneAbgleichFelder(abg);
    setArtikelListe((prev) => { const next = [...prev, art]; persistArtikel(next); return next; });
    return id;
  }, [artikelListe, refUniversum, persistArtikel]);

  const aktualisiereArtikel = useCallback((id, daten) => {
    setArtikelListe((prev) => {
      const alt = prev.find((a) => a.id === id);
      if (!alt) return prev;
      // Unveränderte Referenzen behalten ihre stabile ref; nur Neues wird abgeglichen.
      const liste = uebernehmeRefs(daten.liste, alt.liste);
      const abg = gleicheArtikelAb({ ...alt, ...daten, liste, status: "wartet" }, refUniversum);
      const next = prev.map((a) => (a.id === id ? ohneAbgleichFelder(abg) : a));
      persistArtikel(next);
      return next;
    });
    return id;
  }, [refUniversum, persistArtikel]);

  /* ---- Must-Watch CRUD (Liste ist die einzige Wahrheit) ---- */
  const addMustwatch = useCallback((daten) => {
    setMustwatch((prev) => {
      const eintrag = {
        id: neueMustwatchId(daten.titel, prev),
        titel: daten.titel,
        im_besitz: !!daten.im_besitz,
        beschreibung: daten.beschreibung || "",
        notiz: daten.notiz || "",
        verknuepfung: daten.verknuepfung || null,
        erstellt_am: new Date().toISOString(),
      };
      const next = [...prev, eintrag];
      persistMustwatch(next);
      // Rotlink-Heilung: ein neuer Must-Watch-Eintrag kann offene Blog-Refs
      // schließen — nur eindeutige Exakt-Treffer, nichts wird geraten.
      setArtikelListe((alist) => {
        const [geheilt, n] = heileRotlinks(alist, mitMustwatch(master, next));
        if (n > 0) { persistArtikel(geheilt); return geheilt; }
        return alist;
      });
      return next;
    });
  }, [persistMustwatch, master, mitMustwatch, persistArtikel]);
  const updateMustwatch = useCallback((id, changes) => {
    setMustwatch((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...changes } : e));
      persistMustwatch(next);
      return next;
    });
  }, [persistMustwatch]);
  const deleteMustwatch = useCallback((id) => {
    setMustwatch((prev) => {
      const next = prev.filter((e) => e.id !== id);
      persistMustwatch(next);
      return next;
    });
  }, [persistMustwatch]);

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
        setArtikelListe((prev) => {
          const [geheilt, n] = heileRotlinks(prev, mitMustwatch(next, mustwatch));
          if (n > 0) { persistArtikel(geheilt); return geheilt; }
          return prev;
        });
      }
      setBesitzImportBericht({
        uebernommen: bericht.filter((b) => b.status === "übernommen").length,
        uebersprungen: bericht.filter((b) => b.status !== "übernommen").length,
        zeilen: bericht,
      });
    } catch (e) { setErr("Besitz-Import fehlgeschlagen: " + e.message); }
  }, [master, masterMeta, mustwatch, naechsteHerkunft, persistMaster, persistArtikel, mitMustwatch]);

  const setzeArtikelRef = useCallback((id, index, ref, rotlinkOk) => {
    setArtikelListe((prev) => {
      const next = prev.map((a) => a.id !== id ? a : {
        ...a, liste: a.liste.map((le, i) => (i === index ? { ...le, ref: ref || null, rotlink_ok: !!rotlinkOk } : le)),
      });
      persistArtikel(next);
      return next;
    });
  }, [persistArtikel]);

  const freigebeArtikel = useCallback((id) => {
    setArtikelListe((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, status: "freigegeben" } : a));
      persistArtikel(next);
      // Bei Freigabe den DB-Ordner mit dem "geteilt"-Schalter synchronisieren.
      // Gezogene Fremd-Blogs werden nie (re-)publiziert.
      const art = next.find((a) => a.id === id);
      if (art && art.herkunft !== "gezogen") {
        if (art.geteilt) publishBlog(art).then((r) => { if (!r.ok) setErr("Veröffentlichen fehlgeschlagen: " + (r.message || r.status || "")); });
        else unpublishBlog(art.id).catch(() => {});   // war evtl. geteilt -> idempotent aus DB nehmen
      }
      return next;
    });
  }, [persistArtikel]);

  const loescheArtikel = useCallback((id) => {
    setArtikelListe((prev) => {
      const art = prev.find((a) => a.id === id);
      // Eigener geteilter Blog: auch aus dem DB-Ordner (Autor-Delete). Gezogener: nur lokal.
      if (art && art.geteilt && art.herkunft !== "gezogen") unpublishBlog(art.id).catch(() => {});
      const next = prev.filter((a) => a.id !== id);
      persistArtikel(next);
      return next;
    });
  }, [persistArtikel]);

  /* Einen geteilten Blog in die eigene Mediathek ziehen: lokale Kopie mit Herkunft,
     Referenzen gegen die eigene Master neu aufgelöst (fehlende = Rotlink). */
  const zieheSharedBlog = useCallback((sharedBlog) => {
    let neueId = null;
    setArtikelListe((prev) => {
      const art = blogZuArtikel(sharedBlog, prev, refUniversum);
      neueId = art.id;
      const next = [...prev, art];
      persistArtikel(next);
      return next;
    });
    return neueId;
  }, [refUniversum, persistArtikel]);

  /* Start-Reconciliation: gezogene Blogs gegen den DB-Ordner abgleichen. Läuft nach
     dem Boot; verschwundene Originale (der Autor hat gelöscht) fliegen still raus.
     Selbst geschriebene und importierte Artikel bleiben unberührt. */
  useEffect(() => {
    if (!bootDone) return;
    let abbruch = false;
    ladeSharedBlogs().then((r) => {
      if (abbruch || !r.ok) return;
      const keys = new Set((r.blogs || []).map((b) => b.db_owner + "|" + b.db_key));
      setArtikelListe((prev) => {
        const [next, entfernt] = reconcileGezogene(prev, keys);
        if (entfernt > 0) persistArtikel(next);
        return next;
      });
    }).catch(() => {});
    return () => { abbruch = true; };
  }, [bootDone, persistArtikel]);

  /* ---- Export-Wächter: ungesicherte Browser-Änderungen sichtbar machen ----
     Browser-Speicher ist kein Backup. Sobald der Storage-Stand jünger ist
     als der letzte Export, erscheint ein roter Punkt am Einstellungen-Tab + Banner. */
  const [exportStand, setExportStand] = useState({ master: 0, artikel: 0 });
  const [artikelGespeichertAm, setArtikelGespeichertAm] = useState(0);
  useEffect(() => {
    store.get(K.exportStand).then((r) => {
      if (r && r.value) { try { setExportStand({ master: 0, artikel: 0, ...JSON.parse(r.value) }); } catch { /* Default */ } }
    }).catch(() => {});
  }, []);
  const markiereExport = useCallback((feld) => {
    setExportStand((prev) => {
      const next = { ...prev, [feld]: Date.now() };
      store.set(K.exportStand, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const ungesichertMaster = masterHerkunft && masterHerkunft.typ === "storage"
    && typeof masterHerkunft.zeit === "number" && masterHerkunft.zeit > exportStand.master;
  const ungesichertArtikel = artikelListe.length > 0 && artikelGespeichertAm > exportStand.artikel;

  /* ---- Tour (Tutorial Teil A, Phase 3): Just-in-Time-Hinweise ----
     Ein Overlay + Spotlight zeigt genau dann einen Hinweis, wenn der Nutzer das
     erste Mal an der passenden Stelle steht. Modus wird währenddessen aus-
     geschaltet (Filter bricht die Rect-Koordinaten). */
  const [aktiverHinweis, setAktiverHinweis] = useState(null);
  const [klaerung, setKlaerung] = useState(null); // Quellen-Klärung nach KI-Import
  const aktiverHinweisRef = useRef(null);
  const modusVorHinweis = useRef(null);
  const overflowVorHinweis = useRef("");
  const tourBesuche = useRef({});
  const waechterGefeuert = useRef(false);

  const zeigeHinweis = useCallback((id) => {
    try {
      if (!tutorialFrei()) return;               // Tour ab abgeschlossener Einrichtung ODER getroffener Startwahl
      if (aktiverHinweisRef.current) return;     // nicht stapeln — feuert beim nächsten Mal erneut
      if (istGesehen(id)) return;
      const h = baueHinweis(id, getSetup().skip || []);
      if (!h) return false;                       // nichts zu zeigen (z.B. Einstellungen ohne skip)
      /* Ein Hinweis zählt erst, wenn alle seine Ziele wirklich im DOM stehen.
         Zugeklappte/noch nicht gerenderte Bereiche werden beim nächsten passenden
         Besuch erneut geprüft und nicht versehentlich für immer übersprungen. */
      if (h.absaetze.some((a) => !document.querySelector('[data-tour="' + a.ziel + '"]'))) return false;
      markGesehen(id);                            // jeder tatsächlich sichtbare Hinweis feuert genau einmal
      if (einstellungen.modus) {                  // A7.1: Modus aus, sonst sitzt das Spotlight daneben
        modusVorHinweis.current = einstellungen.modus;
        waehleModus(einstellungen.basisTheme === "hell" ? "foyer" : "saal");
      }
      // Scroll SOFORT einfrieren (synchron beim Auslösen) — sonst trägt schnelles
      // Scrollen das Element weiter, bevor der Overlay misst, und der Rahmen sitzt daneben.
      try { overflowVorHinweis.current = document.body.style.overflow; document.body.style.overflow = "hidden"; } catch { /* */ }
      setTourOffen(true); // Feld-Tooltips (Teil B) währenddessen aus
      aktiverHinweisRef.current = h;
      setAktiverHinweis(h);
      return true;
    } catch { return false; }
  }, [einstellungen.modus, einstellungen.basisTheme, waehleModus]);

  const zeigeHinweisRef = useRef(zeigeHinweis);
  zeigeHinweisRef.current = zeigeHinweis;

  const schliesseHinweis = useCallback(() => {
    aktiverHinweisRef.current = null;
    setAktiverHinweis(null);
    setTourOffen(false);
    try { document.body.style.overflow = overflowVorHinweis.current || ""; } catch { /* */ }
    if (modusVorHinweis.current) { waehleModus(modusVorHinweis.current); modusVorHinweis.current = null; }
  }, [waehleModus]);

  useEffect(() => onTour((id) => zeigeHinweisRef.current && zeigeHinweisRef.current(id)), []);

  // Tab-Besuche: Kino/Streaming/Einstellungen 1×; Mediathek 1. Besuch vs. ab dem 2.
  useEffect(() => {
    tourBesuche.current[tab] = (tourBesuche.current[tab] || 0) + 1;
    if (tab === "kino") zeigeHinweisRef.current("kino");
    else if (tab === "mediathek") zeigeHinweisRef.current("mediathek");
    else if (tab === "streaming") zeigeHinweisRef.current("streaming");
    else if (tab === "blog") zeigeHinweisRef.current("blog");
    // Einstellungen: keine Sammel-Erklärung mehr — die Bereiche feuern per
    // Sichtbar-Anker (Vokabular / Streaming-Quellen / Erweitert).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, bootDone, startTick]);

  // Sichtbar-Anker (Pinboard, Vokabular, Streaming-Quellen, Erweitert): der Rahmen
  // triggert, wenn der MITTELPUNKT des Elements zwischen 35% und 55% der Höhe
  // steht (kurz vor/über der oberen Bildschirmhälfte) UND der Scroll langsam ist
  // (< ~35% eines schnellen Flicks). IntersectionObserver liefert Sichtbarkeit +
  // Rect (auch im Test), ein Scroll-Listener die Geschwindigkeit.
  useEffect(() => {
    if (typeof document === "undefined" || typeof IntersectionObserver === "undefined") return;
    if (!tutorialFrei()) return;
    const anker = Object.keys(SICHTBAR_TRIGGER)
      .map((k) => document.querySelector('[data-tour="' + k + '"]'))
      .filter((el) => el && !istGesehen(SICHTBAR_TRIGGER[el.getAttribute("data-tour")]));
    if (!anker.length) return;

    const perfNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const vh = () => (typeof window !== "undefined" && window.innerHeight) || 800;
    // "Mittelpunkt kurz vor der oberen Hälfte": Elementmitte in [35%, 55%] der Höhe.
    // Hohes Element (höher als der Schirm): sobald sein oberer Teil die Mitte deckt.
    const imBand = (r, id) => {
      const h = vh(), mitte = r.top + r.height / 2;
      // Große Einstellungsblöcke feuern später (Oberkante nähert sich dem oberen Rand).
      // — die Box ist groß und triggerte sonst zu früh.
      const spaet = id === "streaming-quellen" || id === "erweitert";
      if (r.height > h) return r.top <= (spaet ? 0 : h * 0.15) && r.bottom >= h * 0.5;
      const oben = spaet ? h * 0.2 : h * 0.35, unten = spaet ? h * 0.4 : h * 0.55;
      return mitte >= oben && mitte <= unten;
    };
    const rects = new Map();                 // target -> zuletzt bekannte Rect (IO oder live)
    let vLetzte = 0, tScroll = 0, lastY = (typeof window !== "undefined" ? window.scrollY : 0), lastT = perfNow(), stopT = null;
    // langsam = kein kürzlicher Scroll (gestoppt) ODER Geschwindigkeit unter Schwelle.
    // ~1.0 px/ms ≈ 35% eines schnellen Flicks (grob 3 px/ms).
    const langsam = () => (perfNow() - tScroll > 130) || vLetzte <= 1.0;
    const rectVon = (el) => {
      const live = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      return (live && live.height) ? live : rects.get(el); // jsdom: keine Layout-Größe -> Rect aus IO-Eintrag
    };
    const io = new IntersectionObserver((eintraege) => {
      for (const e of eintraege) {
        if (e.isIntersecting) rects.set(e.target, e.boundingClientRect);
        else rects.delete(e.target);
      }
      pruefe();
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    const feuer = (el) => {
      const id = SICHTBAR_TRIGGER[el.getAttribute("data-tour")];
      io.unobserve(el); rects.delete(el);
      if (zeigeHinweisRef.current) zeigeHinweisRef.current(id);
    };
    const pruefe = () => {
      if (aktiverHinweisRef.current || !langsam()) return;
      for (const [el] of rects) {
        if (!el.isConnected || istGesehen(SICHTBAR_TRIGGER[el.getAttribute("data-tour")])) continue;
        const r = rectVon(el);
        if (r && imBand(r, el.getAttribute("data-tour"))) { feuer(el); break; }
      }
    };
    const onScroll = () => {
      const now = perfNow(), y = window.scrollY, dt = now - lastT, dy = Math.abs(y - lastY);
      vLetzte = dt > 0 ? dy / dt : 0; lastY = y; lastT = now; tScroll = now;
      pruefe();
      clearTimeout(stopT); stopT = setTimeout(pruefe, 130); // nach dem Stoppen nochmal (v -> 0)
    };
    anker.forEach((a) => io.observe(a));
    window.addEventListener("scroll", onScroll, { passive: true });
    const initId = setTimeout(pruefe, 80); // beim Öffnen: evtl. schon im Band + Scroll ruht
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); clearTimeout(stopT); clearTimeout(initId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, bootDone, startTick]);

  // Wächter (A8): sobald die erste ungesicherte Änderung entsteht
  useEffect(() => {
    if ((ungesichertMaster || ungesichertArtikel) && !waechterGefeuert.current) {
      waechterGefeuert.current = !!zeigeHinweisRef.current("waechter");
    }
  }, [ungesichertMaster, ungesichertArtikel, tab, bootDone]);

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
      setArtikelListe(liste);
      persistArtikel(liste);
    } catch (e) { setErr("Artikel-Import fehlgeschlagen: " + e.message); }
  }, [persistArtikel, artikelListe]);

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
    setArtikelListe((prev) => {
      let next = neueArtikel.length ? [...prev, ...neueArtikel] : prev;
      const [geheilt, n] = heileRotlinks(next, mitMustwatch(neuerMaster, mustwatch));
      if (n > 0) next = geheilt;
      if (next !== prev) persistArtikel(next);
      return next;
    });
  }, [master, masterMeta, mustwatch, mitMustwatch, naechsteHerkunft, persistMaster, persistArtikel]);

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
  const springeZuFilm = useCallback((ref) => { setMediathekFokus(ref); setExpandedId("b" + ref); setTab("mediathek"); }, []);
  const springeZuArtikel = useCallback((id) => { setBlogFokus(id); setTab("blog"); }, []);

  const updateFilm = useCallback((id, changes) => {
    setMaster((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, ...changes } : f));
      const h = naechsteHerkunft();
      setMasterHerkunft(h);
      persistMaster(next, masterMeta, h);
      return next;
    });
  }, [persistMaster, masterMeta, naechsteHerkunft]);

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
    setArtikelListe((prev) => {
      const [geheilt, n] = heileRotlinks(prev, mitMustwatch(next, mustwatch));
      if (n > 0) { persistArtikel(geheilt); return geheilt; }
      return prev;
    });
    return id;
  }, [master, mustwatch, mitMustwatch, persistMaster, masterMeta, naechsteHerkunft, persistArtikel]);

  /* ---- Browser-Stand verwerfen: zurück zum zuletzt gewählten Start ----
     Rettungsanker gegen file://-localStorage-Geister (alle lokalen HTMLs
     teilen sich denselben Speicher-Schlüssel). Reset lädt den gewählten
     Start neu: demo -> Demo-Liste, clean -> leer (§7.4 Umkehrbarkeit). */
  const resetMaster = useCallback(async () => {
    try { await store.delete(K.master); } catch { /* war leer */ }
    let wahl = "clean";
    try { wahl = localStorage.getItem("kd:start") || "clean"; } catch { /* */ }
    if (wahl === "demo") {
      try {
        const d = await demoLadung();
        setMaster(d.filme); setMasterMeta(d.meta); setMasterHerkunft(d.herkunft); setErr("");
      } catch (e) {
        setMaster(null); setMasterMeta(null); setMasterHerkunft(null);
        setErr("Demo-Daten nicht ladbar: " + e.message);
      }
    } else {
      setMaster(null); setMasterMeta(null); setMasterHerkunft(null); setErr("");
    }
  }, []);

  /* ---- Startwahl treffen/ändern (Modal & Einstellungen-Tab) ----
     Schreibt kd:start und lädt entsprechend. "Startart wechseln" (Einstellungen-Tab)
     verwirft dabei den Browser-Stand — beide Wege ohne Datei-Gefummel. */
  const waehleStart = useCallback((wahl) => {
    store.delete(K.master).catch(() => {});
    try {
      localStorage.setItem(K.start, wahl);
      localStorage.removeItem(K.demoSeed);
      setupUeberspringen();
    } catch { /* */ }
    setStartModalOffen(false);
    if (!hatKatalogZugang()) {
      setKatalogZugangOffen(true);
      return;
    }
    /* Ein Reload hält den Start atomar: Demo-Seeds werden vor allen übrigen
       Storage-Effekten geladen, Clean startet garantiert ohne Alt-Master. */
    try { location.reload(); } catch {
      setMaster(null); setMasterMeta(null); setMasterHerkunft(null);
      setSnapshotFreigabe(true); setWillkommenOffen(true); setStartTick((t) => t + 1);
    }
  }, []);
  const oeffneStartWahl = useCallback(() => setStartModalOffen(true), []);

  /* Entfernt ausschließlich die beim Demo-Start protokollierten Beilagen.
     Standardisiertes Kino-/Streamingprogramm und spätere Tester-Einträge bleiben. */
  const entferneDemoDaten = useCallback(async () => {
    let seed = {};
    try { seed = JSON.parse(localStorage.getItem(K.demoSeed) || "{}"); } catch { /* */ }
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
    setArtikelListe((prev) => { const next = prev.filter((a) => !artIds.has(a.id)); persistArtikel(next); return next; });
    const mwIds = new Set(seed.mustwatchIds || []);
    setMustwatch((prev) => { const next = prev.filter((e) => !mwIds.has(e.id)); persistMustwatch(next); return next; });
    if (seed.pins) { setKinoPins([]); persistPins([]); }
    if (seed.merkliste) { setMerkliste([]); persistMerk([]); }
    if (seed.streaming) {
      setAuswahlRoh([]); setHeuristikAn(true);
      try { await store.set(K.streamingDienste, JSON.stringify({ quellen: [], heuristik: true })); } catch { /* */ }
    }
    try { localStorage.setItem(K.start, "clean"); localStorage.removeItem(K.demoSeed); } catch { /* */ }
    setErr(""); setStartTick((t) => t + 1);
  }, [master, masterMeta, persistMaster, persistArtikel, persistMustwatch, persistPins, persistMerk]);

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

  /* ---- Kino-Matching: film_at_id zuerst (exakt), dann Titel+Jahr, dann
     Originaltitel+Jahr (Phase 3). matchFilm nutzt das Jahr als harten Guard —
     seit der film.at-Anreicherung ist pf.j/pf.ot befüllt, der Abgleich also scharf. ---- */
  const kinoMatches = useMemo(() => {
    if (!programm?.filme || !master) return { matched: [], rest: programm?.filme || [] };
    const proFilmAtId = new Map(master.filter((f) => f.film_at_id).map((f) => [f.film_at_id, f]));
    const matched = [], rest = [];
    for (const pf of programm.filme) {
      const m = (pf.film_at_id && proFilmAtId.get(pf.film_at_id))
        || matchFilm(pf.t, pf.j, master)
        || (pf.ot && pf.ot !== pf.t ? matchFilm(pf.ot, pf.j, master) : null);
      if (m) matched.push({ prog: pf, film: m });
      else rest.push(pf);
    }
    // Besitz vor must_watch, innerhalb dessen Dreieck-Score.
    // Master-Treffer werden IMMER angezeigt — kein Zeitfilter auf matched.
    // B4: kanonisches Besitz-Modell (physische Quelle) statt Substring /(dvd|prime)/
    // — digitale Käufe (prime) zählen nicht als Besitz (Entscheidung 18.07.2026).
    const besitzRang = (f) => (hatPhysischeQuelle(f.quelle) ? 0 : 1);
    matched.sort((a, b) =>
      besitzRang(a.film) - besitzRang(b.film) || score(b.film) - score(a.film)
    );
    return { matched, rest };
  }, [programm, master]);

  /* ---- Finder-Master: Master + Wikidata-Sidecar (Reihe/Franchise/Regie als Namen).
     Additiv, read-only respektiert — nur für die Suche/Detailkarte angereichert.
     Bei fehlendem Sidecar (leer) oder fremden IDs (Tester) bleibt f unverändert. ---- */
  const finderMaster = useMemo(() => {
    const ein = (masterWikidata && masterWikidata.eintraege) || {};
    if (!master || !Object.keys(ein).length) return master;
    return master.map((f) => {
      const w = ein[f.id];
      return w ? { ...f, reihe: w.reihe || [], franchise: w.franchise || [], regie: w.regie || [] } : f;
    });
  }, [master]);

  /* ---- "Läuft auch": nur Filme mit Vorstellung ab Zeitgrenze ---- */
  const restSichtbar = useMemo(() => {
    if (zeigeAlles) return kinoMatches.rest;
    const g = grenzeInMinuten(zeitgrenze);
    return kinoMatches.rest.filter((pf) => hatVorstellungAb(pf, g));
  }, [kinoMatches, zeitgrenze, zeigeAlles]);

  /* ---- Nachtrag: nur Titel zeigen, die (noch) nicht in der Master sind ----
     Laufzeit-Abgleich statt Datenpflege — heilt sich selbst, wenn Titel
     aus dem Nachtrag in die Master übernommen werden. */
  const nachtragSichtbar = useMemo(() => {
    if (!master) return NACHTRAG_FLACH;
    const masterNorms = [...new Set(master.flatMap((f) => [norm(f.titel), norm(f.originaltitel)]).filter(Boolean))];
    const vorhanden = new Set(masterNorms);
    // Editions-/Box-Titel ("… The Complete Murder Sessions", "… Vol. 04") gelten
    // als derselbe Eintrag — Sequels ("… 2", "… Rise") NICHT: eigene Filme.
    const EDITION_RE = /^(the\s+)?(complete|collection|collector|edition|box|vol(ume)?\b)/;
    return NACHTRAG_FLACH.filter((n) => {
      const nt = norm(n.titel);
      if (vorhanden.has(nt)) return false;
      return !masterNorms.some((t) =>
        t.length >= 8 && nt.startsWith(t + " ") && EDITION_RE.test(nt.slice(t.length + 1)));
    });
  }, [master]);

  /* ---- Streaming-Daten direkt aus Supabase. Die DB liefert beide bisherigen
     Ansichten; „Mein Programm" wird lokal gegen die aktive Masterliste gebaut. */
  /* Finder-Suchverlauf im App-State halten -> überlebt Tab-Wechsel (App bleibt
     montiert; FinderTab wird beim Tab-Wechsel ab-/wieder-montiert). */
  const [finderVerlauf, setFinderVerlauf] = useState([]);
  const [finderEingabe, setFinderEingabe] = useState("");
  /* KD-031: `vollKatalog` trennt das leichte Boot-Nachladen vom teuren
     Entdecken-Katalog. Ohne Flag (Boot/Badges): nur die leichte streaming_bekannt
     + der schon gebündelte Top-500-Snapshot als Ersatz fürs Dashboard. Mit Flag
     (Streaming-Tab offen): der volle 3,8-MB-Entdecken-Katalog wird gefetcht/geparst. */
  const ladeStreamingDateien = useCallback(async (vollKatalog = false) => {
    if (!snapshotFreigabe) return;
    if (streamingGeladen.current && streamingRohRef.current) {
      const a = baueStreamingAnsichten(streamingRohRef.current, master || []);
      setStreamingBekannt(a.bekannt); setStreamingEntdecken(a.entdecken); return;
    }
    streamingGeladen.current = true;
    try {
      const r = await ladeKatalogAsset("streaming", { timeout: vollKatalog ? 20000 : 15000 });
      if (!snapshotFreigabeRef.current) return;
      streamingRohRef.current = r.payload;
      const a = baueStreamingAnsichten(r.payload, master || []);
      setStreamingBekannt(a.bekannt); setStreamingEntdecken(a.entdecken);
      entdeckenGeladen.current = true;
      if (r.quelle === "cache" && r.warnung) setErr("Streamingkatalog aus dem letzten Browser-Stand geladen (DB derzeit nicht erreichbar).");
    } catch (e) {
      streamingGeladen.current = false;
      const file = typeof location !== "undefined" && location.protocol === "file:";
      if (file) {
        const roh = { bekannt: streamingBekanntSnapshot, entdecken: (await ladeEntdeckenBeilage()) || streamingEntdeckenSnapshot };
        streamingRohRef.current = roh;
        const a = baueStreamingAnsichten(roh, master || []);
        setStreamingBekannt(a.bekannt); setStreamingEntdecken(a.entdecken);
      } else setErr("Streamingkatalog nicht ladbar: " + e.message);
    }
  }, [snapshotFreigabe, master]);
  useEffect(() => { if (tab === "streaming") ladeStreamingDateien(true); }, [tab, ladeStreamingDateien]); // KD-031: Voll-Katalog erst beim Öffnen

  /* Quellen-Auswahl (Namen, persistiert): steuert Anzeige sofort und via
     Config-Export, welche Kataloge der Job abruft. Default: Kern-Abos. */
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
          else if (Array.isArray(v.dienste)) setAuswahlRoh(v.dienste.map((d) => ALTE_SLUGS[d] || d)); // Migration Altformat
          if (typeof v.heuristik === "boolean") setHeuristikAn(v.heuristik);
        } catch { /* Default */ }
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleQuelle = useCallback((name) => {
    setAuswahlRoh((prev) => {
      const next = prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name];
      store.set(K.streamingDienste, streamingCfgJson(next, heuristikAn)).catch(() => {});
      return next;
    });
  }, [heuristikAn]);

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

  /* ---- Egg-Verfügbarkeit + Sprung-Link (B3, für Cage & Teppich) ----
     „Verfügbar" = physischer Besitz ∨ aktives Abo (streamingBekannt ∩ auswahl) ∨
     aktuelles Kinoprogramm (kinoMatches). Damit spielen die Eggs NUR Filme aus, die
     Max wirklich sehen kann. eggHerkunft = Wo-schaue-ich-das; eggZeigeEintrag springt
     zum (immer vorhandenen) Mediathek-Eintrag, wo Kino-/Streaming-Badges hängen. */
  const eggCtx = useMemo(() => ({
    auswahl,
    kinoIds: new Set((kinoMatches?.matched || []).map((m) => m.film.id)),
    dienstePro: new Map(((streamingBekannt && streamingBekannt.titel) || []).map((t) => [t.id, t.dienste || []])),
  }), [auswahl, kinoMatches, streamingBekannt]);
  const zeigeCage = useCallback(() => {
    cageFilmeRef.current = cageEgg ? liveVertreter(master || [], cageEgg, eggCtx) : [];
    setCageOffen(true);
  }, [cageEgg, master, eggCtx]);
  const zeigeTeppich = useCallback(() => {
    teppichFilmeRef.current = teppichEgg ? liveVertreter(master || [], teppichEgg, eggCtx) : [];
    setTeppichVorschau(false);
    setTeppichOffen(true);
  }, [teppichEgg, master, eggCtx]);
  /* B4-Egg: Star-Wars-Crawl — die realen Kino-Treffer (kinoMatches, dieselbe Quelle
     wie „Läuft auch") in die von Crawl.jsx gelesene Form {titel,jahr,kinos[],zeiten[]}
     bringen: film liefert Titel/Jahr, das Programm (m.prog) die Kinos (k) und Zeiten (z). */
  const crawlMatchesBauen = useCallback(() => (
    (kinoMatches?.matched || []).map((m) => ({
      titel: (m.film && m.film.titel) || (m.prog && m.prog.t) || "Unbekannter Film",
      jahr: (m.film && m.film.jahr) || (m.prog && m.prog.j) || null,
      kinos: Array.isArray(m.prog && m.prog.k) ? m.prog.k : [],
      zeiten: Array.isArray(m.prog && m.prog.z) ? m.prog.z : [],
    }))
  ), [kinoMatches]);
  const zeigeCrawl = useCallback(() => {
    crawlMatchesRef.current = crawlMatchesBauen();
    setCrawlOffen(true);
  }, [crawlMatchesBauen]);
  /* B4-Egg: Klaatu→Necronomicon — dekorativen Buchrand über dem AKTUELLEN Tab
     einblenden. Bleibt tabübergreifend bis zum sichtbaren X oder globalem Escape;
     nur In-Memory-State, nach Reload sicher weg. Zusätzlich zur Mount-Gatterung
     hier hart auf PERSONAL_MODE. */
  const zeigeKlaatu = useCallback(() => {
    if (!EGGS_ENABLED) return;
    setNecroAktiv(true);
  }, []);
  const eggHerkunft = useCallback((film) => {
    const h = filmHerkunft(film, { kinoMatches, streamingBekannt });
    if (h.kino) return { text: "Läuft gerade im Kino", tab: "kino" };
    const d = h.streaming ? sichtbareDienste(h.streaming.dienste, auswahl) : [];
    if (d.length) return { text: "Streamst du auf " + d.slice(0, 2).join(" / "), tab: "streaming" };
    if (h.dvd) return { text: "In deinem Besitz", tab: "mediathek" };
    return { text: "In deiner Mediathek", tab: "mediathek" };
  }, [kinoMatches, streamingBekannt, auswahl]);
  const eggZeigeEintrag = useCallback((film, tab) => {
    setCageOffen(false); setTeppichOffen(false);
    if (tab === "kino") setTab("kino");
    else if (tab === "streaming") setTab("streaming");
    else if (film) springeZuFilm(film.id);
  }, [springeZuFilm]);

  /* ---- Egg-Auto-Trigger: in jedem Tester-Modus, sobald freigeschaltet. ----
     Test-sicher: gewürfelt wird NUR wenn das Egg freigeschaltet ist (Tests schalten
     nichts frei) — plus injizierbare Uhr/RNG in eggFrequenz.js. Cage: 1:30/Tag beim
     Start. Teppich: 1:10/Tag beim Vorbeiscrollen an einem passenden Live-Film.
     Der Teppich braucht zusätzlich die echte Scroll-Situation und einen passenden
     verfügbaren Film. */
  const cageAutoRef = useRef(false);
  useEffect(() => {
    if (!EGGS_ENABLED || !bootDone || achievements == null || master == null) return;
    if (!achievements.has("cage-alphabet") || cageAutoRef.current) return;
    if (cageOffen || teppichOffen || setupWarnung || startModalOffen || willkommenOffen || syncOnboardingOffen) return;
    cageAutoRef.current = true;
    if (!schonGefeuertHeute("cage") && wuerfleTag("cage", 1 / 30)) { markiereGefeuert("cage"); zeigeCage(); }
  }, [bootDone, achievements, master, cageOffen, teppichOffen, setupWarnung, startModalOffen, willkommenOffen, syncOnboardingOffen, zeigeCage]);

  /* ---- B4-Egg: Star-Wars-Crawl Auto-Trigger (nur PERSONAL_MODE) ----
     Deterministisch statt Würfel: crawlHeute() ist den gesamten 4. Mai wahr —
     ohne Film-/Kino-Bedingung. Feuert genau EINMAL pro Tag
     (schonGefeuertHeute/markiereGefeuert wie Cage) und nur, wenn kein anderes
     Overlay/Modal offen ist. An allen anderen Tagen liefert crawlHeute false. */
  const crawlAutoRef = useRef(false);
  useEffect(() => {
    if (!EGGS_ENABLED || !bootDone || master == null) return;
    if (crawlAutoRef.current) return;
    if (crawlOffen || cageOffen || teppichOffen || setupWarnung || startModalOffen || willkommenOffen || syncOnboardingOffen) return;
    if (!crawlHeute({ jetzt: new Date() })) return;
    crawlAutoRef.current = true;
    if (!schonGefeuertHeute("crawl")) { markiereGefeuert("crawl"); zeigeCrawl(); }
  }, [bootDone, master, kinoMatches, crawlOffen, cageOffen, teppichOffen, setupWarnung, startModalOffen, willkommenOffen, syncOnboardingOffen, zeigeCrawl]);

  /* Nachfreigabe: dauerhaft, aber nie gefangen. Escape bleibt global erreichbar,
     weil der rein dekorative Rand selbst weder fokussierbar noch interaktiv ist. */
  useEffect(() => {
    if (!EGGS_ENABLED || !necroAktiv) return;
    const schliessenMitEsc = (e) => { if (e.key === "Escape") setNecroAktiv(false); };
    window.addEventListener("keydown", schliessenMitEsc);
    return () => window.removeEventListener("keydown", schliessenMitEsc);
  }, [necroAktiv]);

  const teppichPassiertRef = useRef(new Set());
  const teppichLetztesYRef = useRef(0);
  const teppichTagRef = useRef(tagesSchluessel());
  useEffect(() => {
    if (!EGGS_ENABLED || !bootDone || tab !== "mediathek" || achievements == null || master == null) return;
    if (!achievements.has("teppich") || schonGefeuertHeute("teppich") || !teppichEgg) return;
    const zielIds = new Set(liveVertreter(master, teppichEgg, eggCtx).map((f) => String(f.id)));
    if (!zielIds.size) return;
    teppichLetztesYRef.current = window.scrollY || 0;

    /* Karten, die beim Betreten bereits oberhalb der Lesezone liegen, gelten nicht
       nachträglich als „vorbeigescrollt". Erst eine neue Abwärtsbewegung zählt. */
    for (const el of document.querySelectorAll("[data-film-id]")) {
      const id = el.dataset.filmId;
      if (zielIds.has(id) && istVorbeiGescrollt(el.getBoundingClientRect(), {
        viewportHoehe: window.innerHeight, scrolltAbwaerts: true,
      })) teppichPassiertRef.current.add(id);
    }

    const onScroll = () => {
      const tag = tagesSchluessel();
      if (teppichTagRef.current !== tag) {
        teppichTagRef.current = tag;
        teppichPassiertRef.current.clear();
      }
      const jetztY = window.scrollY || 0;
      const scrolltAbwaerts = jetztY > teppichLetztesYRef.current;
      teppichLetztesYRef.current = jetztY;
      if (!scrolltAbwaerts || schonGefeuertHeute("teppich")) return;
      for (const el of document.querySelectorAll("[data-film-id]")) {
        const id = el.dataset.filmId;
        if (!zielIds.has(id) || teppichPassiertRef.current.has(id)) continue;
        if (!istVorbeiGescrollt(el.getBoundingClientRect(), { viewportHoehe: window.innerHeight, scrolltAbwaerts })) continue;
        teppichPassiertRef.current.add(id);
        if (wuerfleTag("teppich", 1 / 10)) {
          markiereGefeuert("teppich");
          zeigeTeppich();
        }
        break; // wuerfleTag garantiert genau eine gespeicherte Tageschance.
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [bootDone, tab, achievements, master, teppichEgg, eggCtx, zeigeTeppich]);

  /* Scroll-Sperre, solange ein Egg-Overlay offen ist → die Liste bleibt an ihrer
     Position stehen; Schließen bringt genau dorthin zurück (Antwort auf „was passiert
     beim Weiterscrollen"). */
  useEffect(() => {
    if (!EGGS_ENABLED || !(cageOffen || teppichOffen || crawlOffen)) return;
    let vorher = "";
    try { vorher = document.body.style.overflow; document.body.style.overflow = "hidden"; } catch { /* */ }
    return () => { try { document.body.style.overflow = vorher; } catch { /* */ } };
  }, [cageOffen, teppichOffen, crawlOffen]);

  const clearProgrammCache = useCallback(async () => {
    try { await store.delete(K.programm); } catch { /* war leer */ }
    setProgramm(null); setProgrammArt(null); setProgStand(null); autoFetched.current = false;
  }, []);

  const refreshKatalog = useCallback(async () => {
    streamingGeladen.current = false;
    entdeckenGeladen.current = false;
    streamingRohRef.current = null;
    const [programmOk] = await Promise.all([ladeProgrammDatei(true), ladeStreamingDateien(true)]);
    if (programmOk) setErr("");
  }, [ladeProgrammDatei, ladeStreamingDateien]);

  const wrap = {
    minHeight: "100dvh",
    background: T.saal,
    color: T.leinwand,
    fontFamily: "'Space Grotesk', sans-serif",
    padding: "0 0 60px",
    zoom: einstellungen.schrift === "gross" ? 1.12 : einstellungen.schrift === "klein" ? 0.9 : 1,
  };

  return (
    <div ref={modusWrapRef} style={wrap} className={"kd-wrap" + (einstellungen.modus === "showa" ? " kd-showa" : einstellungen.modus === "nerv" ? " kd-nerv" : "") + (einstellungen.linkshaender ? " kd-links" : "") + ((may4Aktiv || may4Vorschau) && !einstellungen.modus ? " kd-may4" : "")}>
      <ModusFx modus={einstellungen.modus} />
      <div className="kd-app">
      {startModalOffen && (
        <StartWahl onWaehle={waehleStart}
          aktuelle={(() => { try { return localStorage.getItem("kd:start"); } catch { return null; } })()} />
      )}
      {katalogZugangOffen && !startModalOffen && (
        <KatalogZugang zwingend={!hatKatalogZugang()}
          onAbbrechen={() => setKatalogZugangOffen(false)}
          onFertig={() => {
            setKatalogZugangOffen(false);
            setSnapshotFreigabe(true); snapshotFreigabeRef.current = true;
            try { setupUeberspringen(); location.reload(); }
            catch { autoFetched.current = false; streamingGeladen.current = false; setStartTick((t) => t + 1); }
          }} />
      )}
      {willkommenOffen && !startModalOffen && !katalogZugangOffen && (
        <Willkommen onClose={() => { try { setWillkommen(true); } catch { /* */ } setWillkommenOffen(false); }} />
      )}
      {aktiverHinweis && (
        <TourOverlay hinweis={aktiverHinweis} onClose={schliesseHinweis}
          onExport={aktiverHinweis.export ? () => { try { exportMaster(); } catch { /* */ } setTab("daten"); } : undefined} />
      )}
      {klaerung && klaerung.length > 0 && (
        <QuelleKlaerung eintraege={klaerung}
          onSpaeter={() => setKlaerung(null)}
          onFertig={(map) => {
            setMaster((prev) => {
              const next = prev.map((f) => (map[f.id] !== undefined ? { ...f, quelle: map[f.id], quelle_unklar: undefined } : f));
              const hh = naechsteHerkunft(); setMasterHerkunft(hh); persistMaster(next, masterMeta, hh); return next;
            });
            setKlaerung(null);
          }} />
      )}
      <header style={{ padding: "26px 22px 12px", maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {einstellungen.modus === "nerv" ? <NervLogo size={38} /> : <Logo size={34} />}
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 34, letterSpacing: "0.1em", margin: 0, textTransform: "uppercase" }}>
            Kinodreieck
          </h1>
          <div className="kd-syncchip-head" style={{ marginLeft: "auto" }}><SyncStatusChip /></div>
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg, " + T.wolfram + ", transparent 70%)", marginTop: 14 }} />
      </header>
      {/* Menü angepinnt: bleibt beim Scrollen oben (sticky). Bewusst NICHT im
          <header> — ein sticky-Element klebt nur, solange sein Eltern-Element
          sichtbar ist; als direktes Kind von .kd-app (volle Seitenhöhe) hält es
          über die ganze Seite. */}
      <NavBand ref={griffRef} offen={navOffen} onToggle={() => setNavOffen((o) => !o)} />
      <div className={"kd-scrim" + (navOffen ? " offen" : "")} onClick={() => setNavOffen(false)} aria-hidden="true" />
      {/* z-index bewusst NICHT inline: Inline-Styles schlagen CSS ohne !important —
          ein inline zIndex hier hat den Drawer unter den Scrim (58) gedrückt.
          Ebenen liegen in index.css: Desktop 40, Handy 60 (.kd-menu). */}
      <nav ref={navRef} className={"kd-menu" + (navOffen ? " offen" : "")} inert={istMobil && !navOffen} style={{ position: "sticky", top: 0, background: T.saal, borderBottom: "1px solid " + T.saalHoch }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 22px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* DOM-Reihenfolge = bottom-up-Wichtigkeit (Etappe 3, Max 18.07.):
              das Mobile-Popup stapelt per column-reverse von unten — Kino als
              1. DOM-Kind landet daumennah. Labels/Handler bleiben unverändert
              (Tests klicken per Text). */}
          {[["kino", "Kino"], ["streaming", "Streaming"], ["mediathek", "Mediathek"], ["finder", "Suche"], ["blog", "Blog"], ["start", "Start"], ["daten", "Einstellungen"]].map(([id, label]) => (
            <button key={id} className={tab === id ? "kd-nav-aktiv" : undefined} onClick={() => { setTab(id); setNavOffen(false); try { window.scrollTo(0, 0); } catch { /* */ } }}
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
          <StartTab kinoPins={kinoPins} toggleKinoPin={toggleKinoPin} merkliste={merkliste} toggleMerk={toggleMerk} onNavigiere={setTab} zeigeEintrag={springeZuFilm} onTutorialNeu={() => { try { resetTutorial(); } catch { /* */ } setWillkommenOffen(true); }}
            /* Dashboard-Datenquellen (Etappe 4) — alles vorhandener App-State,
               keine neuen Fetches: Matches, Must-Watch, Abo-Auswahl, Kataloge,
               Programm-Stand. Der Beta-Pfad (Landing) ignoriert diese Props. */
            kinoMatches={kinoMatches} mustwatch={mustwatch} auswahl={auswahl}
            streamingEntdecken={streamingEntdecken} streamingBekannt={streamingBekannt}
            progStand={progStand} />
        )}

        {tab === "kino" && bootDone && (
          <KinoTab
            programm={programm} progStand={progStand} master={master}
            kinoMatches={kinoMatches} restSichtbar={restSichtbar}
            zeitgrenze={zeitgrenze} saveZeitgrenze={saveZeitgrenze}
            zeigeAlles={zeigeAlles} setZeigeAlles={setZeigeAlles}
            expandedId={expandedId} setExpandedId={setExpandedId}
            updateFilm={updateFilm} addFilm={addFilm} badgeFuer={badgeFuer}
            loading={loading} ladeProgrammDatei={ladeProgrammDatei}
            kinoPins={kinoPins} toggleKinoPin={toggleKinoPin}
            datenGesperrt={!snapshotFreigabe}
            autorName={autorName} /* KD-030: echter Autor für neue Bewertungen (EintragForm/EditPanel) */
          />
        )}

        {tab === "mediathek" && bootDone && (
          <MediathekTab
            master={master || []} nachtragFlach={master ? nachtragSichtbar : []}
            expandedId={expandedId} setExpandedId={setExpandedId}
            updateFilm={updateFilm} addFilm={addFilm} badgeFuer={badgeFuer}
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
            onAddFilm={addFilm} onSpringeZuFilm={springeZuFilm}
            exportArtikel={exportArtikel} importArtikel={importArtikel}
            onZiehe={zieheSharedBlog}
          />
        )}

        {tab === "streaming" && (
          <StreamingTab
            bekannt={streamingBekannt} entdecken={streamingEntdecken}
            addFilm={addFilm} master={master} updateFilm={updateFilm}
            mustwatchIds={mustwatchMasterIds}
            auswahl={auswahl} toggleQuelle={toggleQuelle}
            merkliste={merkliste} toggleMerk={toggleMerk}
            heuristikAn={heuristikAn} setHeuristikAn={(v) => { setHeuristikAn(v); store.set(K.streamingDienste, streamingCfgJson(auswahl, v)).catch(() => {}); }}
            datenGesperrt={!snapshotFreigabe}
          />
        )}

        {tab === "finder" && master && (
          <FinderTab
            master={finderMaster} kinoMatches={kinoMatches}
            streamingBekannt={streamingBekannt} streamingEntdecken={streamingEntdecken}
            mustwatchIds={mustwatchMasterIds}
            auswahl={auswahl}
            onSpringeZuFilm={springeZuFilm} addFilm={addFilm}
            verlauf={finderVerlauf} setVerlauf={setFinderVerlauf}
            eingabe={finderEingabe} setEingabe={setFinderEingabe}
            onKlaatu={EGGS_ENABLED ? zeigeKlaatu : undefined}
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
            resetMaster={resetMaster}
            startWahl={(() => { try { return localStorage.getItem("kd:start"); } catch { return null; } })()}
            onDemoEntfernen={entferneDemoDaten}
            katalogVerbunden={snapshotFreigabe}
            onKatalogVerbinden={() => setKatalogZugangOffen(true)}
            onKatalogRefresh={refreshKatalog}
            artikelAnzahl={artikelListe.length} exportArtikel={exportArtikel} importArtikel={importArtikel}
            ungesichertMaster={ungesichertMaster} ungesichertArtikel={ungesichertArtikel}
            artikelListe={artikelListe} autorName={autorName} saveAutorName={saveAutorName}
            uebernehmePaket={uebernehmePaket}
            einstellungen={einstellungen} setzeEinstellung={setzeEinstellung} waehleModus={waehleModus}
            achievements={achievements ? [...achievements] : []}
            streamingBekannt={streamingBekannt} streamingEntdecken={streamingEntdecken}
            auswahl={auswahl} toggleQuelle={toggleQuelle} heuristikAn={heuristikAn}
            setHeuristikAn={(v) => { setHeuristikAn(v); store.set(K.streamingDienste, streamingCfgJson(auswahl, v)).catch(() => {}); }}
            datenGesperrt={!snapshotFreigabe}
            backupGesamt={backupGesamt} vokabular={vokabular} saveVokabular={saveVokabular}
            offeneFlags={offeneFlags} migriereMustwatch={migriereMustwatch} migrationsBericht={migrationsBericht}
            importiereBesitz={importiereBesitz} besitzImportBericht={besitzImportBericht}
          />
        )}
      </main>
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
      {EGGS_ENABLED && teppichOffen && (
        <Teppich filme={teppichFilmeRef.current} vorschau={teppichVorschau} reduced={reducedMotion} herkunftVon={eggHerkunft}
          onZeigeEintrag={eggZeigeEintrag} onClose={() => { setTeppichOffen(false); setTeppichVorschau(false); }} />
      )}
      {/* B4-Egg: Moment-Eggs — exakt wie Cage/Teppich hinter PERSONAL_MODE gegatet,
          also im Beta-Build (PERSONAL_MODE=false) weder gerendert noch triggerbar. */}
      {EGGS_ENABLED && crawlOffen && (
        <Crawl matches={crawlMatchesRef.current} onSkip={() => setCrawlOffen(false)} reduced={reducedMotion} />
      )}
      {EGGS_ENABLED && necroAktiv && <NecronomiconRand onClose={() => setNecroAktiv(false)} />}
      <ZurueckObenKnopf />
    </div>
  );
}

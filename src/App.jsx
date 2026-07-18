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
import { store, K, PROGRAMM_TTL_MS } from "./lib/storage.js";
import { matchFilm, ensureIds, slugId, score, norm } from "./lib/match.js";
import { parseNonstopHtml, grenzeInMinuten, hatVorstellungAb, normalisiereProgramm } from "./lib/programm.js";
import { Logo } from "./components/ui.jsx";
import { neueArtikelId, gleicheArtikelAb, uebernehmeRefs, heileRotlinks } from "./lib/artikel.js";
import { neueMustwatchId, parseMustwatch, migriereFlags, offeneFlagAnzahl, parseBesitzImport, wendeBesitzImportAn } from "./lib/mustwatch.js";
import { setzeEigeneStimmungen } from "./lib/finder.js";
import { StartTab } from "./tabs/StartTab.jsx";
import { KinoTab } from "./tabs/KinoTab.jsx";
import { MediathekTab } from "./tabs/MediathekTab.jsx";
import { StreamingTab } from "./tabs/StreamingTab.jsx";
import { BlogTab } from "./tabs/BlogTab.jsx";
import { FinderTab } from "./tabs/FinderTab.jsx";
import { DatenTab } from "./tabs/DatenTab.jsx";

import nachtragDatei from "./data/nachtrag.json";
import { PERSONAL_MODE } from "./lib/modus.js";
import { SyncStatusChip } from "./components/SyncStatusChip.jsx";
import { NavBand } from "./components/NavBand.jsx";

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
  /* Personal-Modus: Tour & kontextuelle Hinweise bewusst aus — explizit, damit
     kein localStorage-Rückstand eines Beta-Builds (kd:setup.done) sie doch aktiviert. */
  if (PERSONAL_MODE) return false;
  try { return !!getSetup().done; } catch { return false; }
}

function snapshotsFrei() {
  /* Personal-Modus: Daten sind IMMER frei. Das Beta-Gate (Terminal-Installer/
     Demo-Wahl) hat im Personal-Modus keinen Freischalt-Pfad — ohne diese Zeile
     blieben Kino/Streaming/Programm-Autoload dauerhaft gesperrt. */
  if (PERSONAL_MODE) return true;
  try { if (liesStartWahl() === "demo") return true; } catch { /* */ }
  try { return getSetup().installiert === true; } catch { return false; }
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
  const d = await ladeDemoGlobal();
  return {
    filme: ensureIds(d.filme || []),
    meta: d.meta || null,
    herkunft: { typ: "demo", zeit: (d.meta && d.meta.erstellt_am) || null },
  };
}
/* Streaming-Entdecken-Beilage (VOLLER Katalog) laden — file://-tauglich, optional.
   Fehlt sie, wird null geliefert (App fällt auf die eingebackenen Top 500 zurück).
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

export default function App() {
  const [frischerStart] = useState(() => verbraucheFrischenStart());
  const [tab, setTab] = useState("start");
  const [navOffen, setNavOffen] = useState(false); // Mobile-Nav-Drawer offen?
  useEffect(() => {
    if (!navOffen) return;
    const onKey = (e) => { if (e.key === "Escape") setNavOffen(false); };
    window.addEventListener("keydown", onKey);
    // Hintergrund-Scroll sperren, solange der Drawer offen ist (Wisch auf dem Scrim).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [navOffen]);
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

  const saveZeitgrenze = useCallback(async (v) => {
    setZeitgrenze(v);
    try { await store.set(K.zeitgrenze, v); } catch { /* nicht fatal */ }
  }, []);

  /* ---- Einstellungen: Theme, Startbereich, Schriftgröße, Kurosawa ----
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
  /* ---- Darstellungs-Modi: Saal/Foyer/Kurosawa/Grindhouse in EINER Gruppe.
     Der Modus erzwingt sein Theme (Kurosawa->hell, Grindhouse->dunkel),
     Saal/Foyer schalten den Modus ab und setzen das Theme direkt. ---- */
  const modusRegenRef = useRef(null), modusHalmeRef = useRef(null), modusNoboriRef = useRef(null), modusNobori2Ref = useRef(null), modusWrapRef = useRef(null);
  const waehleModus = useCallback((wahl) => {
    setEinstellungenState((prev) => {
      let next;
      if (wahl === "kurosawa") next = { ...prev, modus: "kurosawa", theme: "hell" };
      else if (wahl === "grindhouse") next = { ...prev, modus: "grindhouse", theme: "dunkel" };
      else if (wahl === "foyer") next = { ...prev, modus: "", theme: "hell" };
      else next = { ...prev, modus: "", theme: "dunkel" };
      setzeTheme(next.theme);
      store.set(K.einstellungen, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  /* Regen (102 Striche), Horizont (320 Halme in 3 Lagen + Nobori), Grindhouse-
     Klebesprünge (setTimeout, zufälliges Intervall) — Port aus modi-demo-v13.html. */
  useEffect(() => {
    const modus = einstellungen.modus;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const timers = [];
    function baueRegen(regen) {
      if (!regen) return; regen.innerHTML = "";
      for (let i = 0; i < 102; i++) {
        const t = document.createElement("div"); t.className = "kd-tropfen";
        t.style.left = rnd(-5, 102) + "%"; t.style.height = rnd(30, 100) + "px";
        t.style.opacity = rnd(.18, .9).toFixed(2);
        t.style.width = (Math.random() < .25 ? 4 : 2.5) + "px";
        const d = rnd(.38, .85);
        t.style.animationDuration = d + "s"; t.style.animationDelay = (-rnd(0, d)) + "s";
        regen.appendChild(t);
      }
    }
    function baueNobori(nobori, links) {
      if (!nobori) return;
      const H = 158;
      if (links === undefined) links = Math.random() < .5;
      nobori.style[links ? "left" : "right"] = rnd(6, 15) + "%";
      nobori.style[links ? "right" : "left"] = "auto";
      const schief = links ? rnd(3, 7) : -rnd(3, 7);
      nobori.style.setProperty("--a1", (schief - 3.6).toFixed(1) + "deg");   // kräftigeres Wehen
      nobori.style.setProperty("--a2", (schief + 4.4).toFixed(1) + "deg");
      nobori.style.animationDuration = rnd(4.2, 6.4).toFixed(1) + "s";        // eigener Takt
      const L = [15, 66], R = [41, 66], S = [28, 42], Z = [28, 60];
      const p = (a, b, c) => "M" + a[0] + " " + a[1] + " L" + b[0] + " " + b[1] + " L" + c[0] + " " + c[1] + " Z";
      nobori.innerHTML =
        '<svg width="58" height="' + H + '" viewBox="0 0 58 ' + H + '">' +
        '<line x1="8" y1="3" x2="8" y2="' + H + '" stroke="#2E2B27" stroke-width="2.8" stroke-linecap="round"/>' +
        '<line x1="6" y1="6" x2="48" y2="6" stroke="#2E2B27" stroke-width="2.2" stroke-linecap="round"/>' +
        '<g class="tuch">' +
        '<path d="M10 8 h38 v96 q-10 5 -19 0 q-9 -5 -19 0 Z" fill="#6E6960" opacity="0.97"/>' +
        '<path d="M10 8 h38 v96 q-10 5 -19 0 q-9 -5 -19 0 Z" fill="none" stroke="#3A3630" stroke-width="1" opacity="0.8"/>' +
        '<g><path d="' + p(L, S, Z) + '" fill="#C9C4B9"/><path d="' + p(S, R, Z) + '" fill="#F2EFE8"/><path d="' + p(R, L, Z) + '" fill="#AEA99E"/></g>' +
        '</g></svg>';
    }
    function baueHorizont(halme, nobori, nobori2) {
      if (!halme) return; halme.innerHTML = "";
      const lagen = [
        { n: 150, h: [16, 34], op: [.10, .20], w: [.8, 1.3], dur: [3.6, 6.0], amp: .6, b: [16, 30] },
        { n: 110, h: [28, 58], op: [.18, .34], w: [1.0, 1.9], dur: [2.8, 4.6], amp: 1, b: [10, 22] },
        { n: 60, h: [50, 92], op: [.30, .55], w: [1.6, 2.6], dur: [2.2, 3.8], amp: 1.4, b: [2, 14] },
      ];
      lagen.forEach((La) => {
        for (let i = 0; i < La.n; i++) {
          const h = rnd(La.h[0], La.h[1]), bieg = rnd(-30, 30) * La.amp;
          const d = document.createElement("div"); d.className = "kd-halm";
          d.style.left = rnd(-2, 100) + "%";
          d.style.bottom = rnd(La.b[0], La.b[1]) + "px";
          d.style.opacity = rnd(La.op[0], La.op[1]).toFixed(2);
          d.style.setProperty("--a1", (rnd(-8, -2) * La.amp).toFixed(1) + "deg");
          d.style.setProperty("--a2", (rnd(3, 10) * La.amp).toFixed(1) + "deg");
          d.style.setProperty("--s1", (rnd(-2.5, 0) * La.amp).toFixed(1) + "deg");
          d.style.setProperty("--s2", (rnd(1, 4) * La.amp).toFixed(1) + "deg");
          d.style.animationDuration = rnd(La.dur[0], La.dur[1]).toFixed(2) + "s";
          d.style.animationDelay = (-rnd(0, 4)).toFixed(2) + "s";
          const w = rnd(La.w[0], La.w[1]);
          d.innerHTML = '<svg width="70" height="' + h + '" viewBox="0 0 70 ' + h + '">' +
            '<path d="M35 ' + h + ' C 35 ' + (h * .62) + ', ' + (35 + bieg * .4) + ' ' + (h * .34) + ', ' + (35 + bieg) + ' 2" stroke-width="' + w.toFixed(1) + '"/></svg>';
          halme.appendChild(d);
        }
      });
      const links1 = Math.random() < .5;
      baueNobori(nobori, links1);
      baueNobori(nobori2, !links1);   // zweiter Banner: andere Seite, gegengeneigt
    }
    if (modus === "kurosawa") {
      baueRegen(modusRegenRef.current);
      baueHorizont(modusHalmeRef.current, modusNoboriRef.current, modusNobori2Ref.current);
    } else if (modus === "grindhouse") {
      const sprung = () => { const w = modusWrapRef.current; if (!w) return; w.classList.add("kd-riss"); timers.push(setTimeout(() => w.classList.remove("kd-riss"), rnd(70, 150))); };
      const takt = () => { sprung(); timers.push(setTimeout(takt, rnd(3500, 14000))); };
      timers.push(setTimeout(takt, rnd(2500, 7000)));
    }
    return () => {
      timers.forEach(clearTimeout);
      if (modusRegenRef.current) modusRegenRef.current.innerHTML = "";
      if (modusHalmeRef.current) modusHalmeRef.current.innerHTML = "";
      if (modusWrapRef.current) modusWrapRef.current.classList.remove("kd-riss");
    };
  }, [einstellungen.modus]);

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
  /* Einrichtungsstatus ist pro Beta-Version. Alte Legacy-Flags dürfen den Hinweis
     nicht unterdrücken; initSetup verarbeitet auch den Finish-Link des Installers. */
  const [setupWarnung, setSetupWarnung] = useState(() => {
    if (PERSONAL_MODE) return false; // Personal-Modus: kein Installer-Hinweis
    try {
      /* Die Terminal-Installer öffnen die App am Ende mit
         ?setup=done&install=command[&skip=…]. Der Prozess kann localStorage nicht schreiben —
         initSetup liest die EIGENE URL und schreibt kd:setup/kd:tutorial.
         Rückgabe .done steuert die Warnung. */
      return !initSetup().done;
    } catch { return false; }
  });
  /* Willkommen (Tutorial): einmalig nach abgeschlossener Einrichtung. Sichtbarkeit
     aus kd:setup/kd:tutorial; initSetup() (oben) hat beide bereits angelegt. */
  const [willkommenOffen, setWillkommenOffen] = useState(() => {
    if (PERSONAL_MODE) return false; // Personal-Modus: kein Willkommens-/Tutorial-Popup
    try { return tutorialFrei() && !getTutorial().willkommen; } catch { return false; }
  });
  const [snapshotFreigabe, setSnapshotFreigabe] = useState(() => snapshotsFrei());
  const snapshotFreigabeRef = useRef(snapshotFreigabe);
  snapshotFreigabeRef.current = snapshotFreigabe;
  const [startTick, setStartTick] = useState(0); // bump nach Startwahl -> Tour-Effekte neu binden
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

  /* ---- programm.json aus public/ laden (geplanter Job legt sie dort ab) ---- */
  const ladeProgrammDatei = useCallback(async (manuell) => {
    setErr("");
    setLoading("programm");
    try {
      // BASE_URL statt absolutem "/…": auf GitHub Pages liegt die App unter einem
      // Unterpfad (…/kinodreieck-app/) — "/programm.json" zielte auf die Domain-Root.
      const res = await fetch(import.meta.env.BASE_URL + "programm.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();
      if (!ct.includes("json") && !text.trim().startsWith("{")) throw new Error("keine JSON-Datei gefunden");
      const parsed = JSON.parse(text);
      const data = normalisiereProgramm(parsed); // Alt- und film.at-Format
      if (!manuell && !snapshotFreigabeRef.current) return false;
      setProgramm(data);
      setProgrammArt(manuell ? "manuell" : "snapshot");
      setProgStand(Date.now());
      try {
        await store.set(K.programm, JSON.stringify({ fetchedAt: Date.now(), art: manuell ? "manuell" : "snapshot", data }));
      } catch { /* Cache-Fehler nicht fatal */ }
      return true;
    } catch (e) {
      if (manuell) {
        setErr("programm.json nicht ladbar (" + e.message + "). Datei nach public/ legen — oder Nonstop-HTML im Einstellungen-Tab einspielen.");
      } else if (snapshotFreigabeRef.current && programmSnapshot && (Array.isArray(programmSnapshot.filme) || (programmSnapshot.data && Array.isArray(programmSnapshot.data.filme)))) {
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
            try { localStorage.setItem("kd:start", "demo"); } catch { /* */ }
          } catch (e) {
            setErr("Demo-Daten nicht ladbar: " + e.message);
            startModalNoetig = true; // zurück zur Wahl
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
          const frisch = Date.now() - p.fetchedAt < (p.art === "snapshot" ? 7 * PROGRAMM_TTL_MS : PROGRAMM_TTL_MS);
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
          if (e.kurosawa && !e.modus) { e.modus = "kurosawa"; e.theme = "hell"; } // Migration: alter Bool -> Modus
          delete e.kurosawa;
          setEinstellungenState(e);
          setzeTheme(e.theme);
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
  }, [persistMaster]);

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
    setArtikelListe((prev) => { const next = prev.map((a) => (a.id === id ? { ...a, status: "freigegeben" } : a)); persistArtikel(next); return next; });
  }, [persistArtikel]);

  const loescheArtikel = useCallback((id) => {
    setArtikelListe((prev) => { const next = prev.filter((a) => a.id !== id); persistArtikel(next); return next; });
  }, [persistArtikel]);

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
      markGesehen(id);                            // jeder Hinweis feuert genau einmal
      if (!h) return;                             // nichts zu zeigen (z.B. Einstellungen ohne skip)
      if (einstellungen.modus) {                  // A7.1: Modus aus, sonst sitzt das Spotlight daneben
        modusVorHinweis.current = einstellungen.modus;
        waehleModus(einstellungen.theme === "hell" ? "foyer" : "saal");
      }
      // Scroll SOFORT einfrieren (synchron beim Auslösen) — sonst trägt schnelles
      // Scrollen das Element weiter, bevor der Overlay misst, und der Rahmen sitzt daneben.
      try { overflowVorHinweis.current = document.body.style.overflow; document.body.style.overflow = "hidden"; } catch { /* */ }
      setTourOffen(true); // Feld-Tooltips (Teil B) währenddessen aus
      aktiverHinweisRef.current = h;
      setAktiverHinweis(h);
    } catch { /* nicht fatal */ }
  }, [einstellungen.modus, einstellungen.theme, waehleModus]);

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
    // Sichtbar-Anker (Teilen & Tauschen / Vokabular / Streaming-Quellen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, bootDone, startTick]);

  // Sichtbar-Anker (Pinboard, Teilen, Vokabular, Streaming-Quellen): der Rahmen
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
      // Streaming-Quellen feuert später (Oberkante muss den oberen Rand erreichen)
      // — die Box ist groß und triggerte sonst zu früh.
      const spaet = id === "streaming-quellen";
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
        if (r && imBand(r)) { feuer(el); break; }
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
      waechterGefeuert.current = true;
      zeigeHinweisRef.current("waechter");
    }
  }, [ungesichertMaster, ungesichertArtikel]);

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
      setArtikelListe(liste);
      persistArtikel(liste);
    } catch (e) { setErr("Artikel-Import fehlgeschlagen: " + e.message); }
  }, [persistArtikel]);

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

  /* ---- Gesamt-Backup als Download (Datei in den eigenen Backup-Ordner legen) ---- */
  const backupGesamt = useCallback(async () => {
    const sammle = async (key) => { try { const r = await store.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; } };
    const b = {
      format: "kinodreieck-backup", version: 1, erstellt: new Date().toISOString(),
      hinweis: "Wiederherstellen: über Einstellungen → Backup wiederherstellen (oder masterliste/artikel einzeln über die Import-Felder).",
      masterliste: { meta: masterMeta, filme: master || [] },
      artikel: artikelListe,
      kino_pins: kinoPins,
      merkliste: await sammle(K.merkliste),
      entdecken_status: await sammle(K.entdeckenStatus),
      /* streaming_dienste fehlte hier bis 18.07.2026 — ein Restore eines
         Gesamt-Backups hätte die Abo-Auswahl verloren. Jetzt dabei. */
      streaming_dienste: await sammle(K.streamingDienste),
      must_watch_liste: mustwatch,
      vokabular, einstellungen, autor: autorName,
    };
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kinodreieck_backup_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }, [master, masterMeta, artikelListe, kinoPins, mustwatch, vokabular, einstellungen, autorName]);

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
    // Alten Storage-Stand entfernen, sonst überschreibt der beim nächsten Boot
    // die Wahl (Storage gewinnt vor kd:start). Idempotent, wenn nichts da war.
    store.delete(K.master).catch(() => {});
    try { localStorage.setItem("kd:start", wahl); } catch { /* */ }
    const frei = wahl === "demo" || (() => {
      try { return getSetup().installiert === true; } catch { return false; }
    })();
    setSnapshotFreigabe(frei);
    snapshotFreigabeRef.current = frei;
    streamingGeladen.current = false;
    if (frei) {
      autoFetched.current = false;
    } else {
      setStreamingBekannt(null); setStreamingEntdecken(null);
      if (programmArt !== "manuell") {
        setProgramm(null); setProgrammArt(null); setProgStand(null);
      }
    }
    if (wahl === "demo") {
      setStartModalOffen(false); setErr(""); setLoading("demo");
      demoLadung().then((d) => {
        setMaster(d.filme); setMasterMeta(d.meta); setMasterHerkunft(d.herkunft); setLoading("");
      }).catch((e) => {
        setLoading(""); setErr("Demo-Daten nicht ladbar: " + e.message); setStartModalOffen(true);
      });
    } else {
      setMaster(null); setMasterMeta(null); setMasterHerkunft(null);
      setStartModalOffen(false);
    }
    // Tutorial auch OHNE Installer starten (dieser Button ist der Auslöser beim
    // Leer-/Demo-Start): Willkommen einmalig zeigen + Tour-Trigger aktivieren.
    try { if (!getTutorial().willkommen) setWillkommenOffen(true); } catch { /* */ }
    setStartTick((t) => t + 1);
  }, [programmArt]);
  const oeffneStartWahl = useCallback(() => setStartModalOffen(true), []);

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
    // Besitz (dvd/prime) vor must_watch, innerhalb dessen Dreieck-Score.
    // Master-Treffer werden IMMER angezeigt — kein Zeitfilter auf matched.
    const besitzRang = (f) => (/(dvd|prime)/.test(f.quelle || "") ? 0 : 1);
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

  /* ---- Streaming-Daten (Watchmode-Jobs schreiben public/*.json) ----
     KEIN API-Call im Frontend — nur Dateien lesen. Lazy beim ersten
     Öffnen des Streaming-Tabs; Fallback: eingebettete Snapshots. */
  /* Finder-Suchverlauf im App-State halten -> überlebt Tab-Wechsel (App bleibt
     montiert; FinderTab wird beim Tab-Wechsel ab-/wieder-montiert). */
  const [finderVerlauf, setFinderVerlauf] = useState([]);
  const [finderEingabe, setFinderEingabe] = useState("");
  const ladeStreamingDateien = useCallback(async () => {
    if (!snapshotFreigabe) return;
    if (streamingGeladen.current) return;
    streamingGeladen.current = true;
    const hol = async (pfad, fallback) => {
      try {
        const res = await fetch(pfad, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = JSON.parse(await res.text());
        if (j && j.stand) return j;
        throw new Error("leer");
      } catch { return fallback && fallback.stand ? fallback : null; }
    };
    const bekannt = await hol(import.meta.env.BASE_URL + "streaming_bekannt.json", streamingBekanntSnapshot);
    if (!snapshotFreigabeRef.current) return;
    setStreamingBekannt(bekannt);
    // Entdecken: served public/ (voll) -> externe Beilage (voll, file://) -> eingebackene Top 500
    const entdeckenServed = await hol(import.meta.env.BASE_URL + "streaming_entdecken.json", null);
    if (!snapshotFreigabeRef.current) return;
    if (entdeckenServed) setStreamingEntdecken(entdeckenServed);
    else {
      const beilage = await ladeEntdeckenBeilage();
      if (!snapshotFreigabeRef.current) return;
      setStreamingEntdecken(beilage && beilage.stand ? beilage : streamingEntdeckenSnapshot);
    }
  }, [snapshotFreigabe]);
  useEffect(() => { if (tab === "streaming") ladeStreamingDateien(); }, [tab, ladeStreamingDateien]);

  /* Quellen-Auswahl (Namen, persistiert): steuert Anzeige sofort und via
     Config-Export, welche Kataloge der Job abruft. Default: Kern-Abos. */
  const ALTE_SLUGS = { netflix: "Netflix", disney_plus: "Disney+", prime_video: "Prime Video" };
  const [auswahl, setAuswahlRoh] = useState(["Netflix", "Disney+", "Prime Video"]);
  const [heuristikAn, setHeuristikAn] = useState(true);
  /* Watchmode-Abrechnungstag (1–28): Tag im Monat, an dem die Credits real
     zurückgesetzt werden. Grundlage der Reset-Anzeige (StreamingEinstellungen). */
  const [resetTag, setResetTagRoh] = useState(null);
  const streamingCfgJson = (quellen, heuristik, reset) =>
    JSON.stringify({ quellen, heuristik, ...(Number.isInteger(reset) && reset >= 1 && reset <= 28 ? { reset_tag: reset } : {}) });
  useEffect(() => {
    store.get(K.streamingDienste).then((r) => {
      if (r && r.value) {
        try {
          const v = JSON.parse(r.value);
          if (Array.isArray(v.quellen)) setAuswahlRoh(v.quellen);
          else if (Array.isArray(v.dienste)) setAuswahlRoh(v.dienste.map((d) => ALTE_SLUGS[d] || d)); // Migration Altformat
          if (typeof v.heuristik === "boolean") setHeuristikAn(v.heuristik);
          if (Number.isInteger(v.reset_tag) && v.reset_tag >= 1 && v.reset_tag <= 28) setResetTagRoh(v.reset_tag);
        } catch { /* Default */ }
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleQuelle = useCallback((name) => {
    setAuswahlRoh((prev) => {
      const next = prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name];
      store.set(K.streamingDienste, streamingCfgJson(next, heuristikAn, resetTag)).catch(() => {});
      return next;
    });
  }, [heuristikAn, resetTag]);
  const setResetTag = useCallback((tag) => {
    const v = (Number.isInteger(tag) && tag >= 1 && tag <= 28) ? tag : null;
    setResetTagRoh(v);
    store.set(K.streamingDienste, streamingCfgJson(auswahl, heuristikAn, v)).catch(() => {});
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
    return (
      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
        {t.dienste.slice(0, 3).map((d) => (
          <span key={d} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.tinte, background: T.wolfram, borderRadius: 3, padding: "2px 6px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d}
          </span>
        ))}
        {t.dienste.length > 3 && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: T.rauch }}>+{t.dienste.length - 3}</span>}
      </span>
    );
  }, [streamingMap]);
  /* Badges brauchen die Daten auch außerhalb des Streaming-Tabs -> einmalig nachladen */
  useEffect(() => { if (bootDone && snapshotFreigabe) ladeStreamingDateien(); }, [bootDone, snapshotFreigabe, ladeStreamingDateien]);

  const clearProgrammCache = useCallback(async () => {
    try { await store.delete(K.programm); } catch { /* war leer */ }
    setProgramm(null); setProgrammArt(null); setProgStand(null); autoFetched.current = false;
  }, []);

  const wrap = {
    minHeight: "100dvh",
    background: T.saal,
    color: T.leinwand,
    fontFamily: "'Space Grotesk', sans-serif",
    padding: "0 0 60px",
    zoom: einstellungen.schrift === "gross" ? 1.12 : einstellungen.schrift === "klein" ? 0.9 : 1,
  };

  return (
    <div ref={modusWrapRef} style={wrap} className={"kd-wrap" + (einstellungen.modus === "kurosawa" ? " kd-kurosawa" : einstellungen.modus === "grindhouse" ? " kd-grindhouse" : "")}>
      {einstellungen.modus ? (
        <div className="kd-fx">
          <div className="grade" /><div className="grade2" /><div className="korn" /><div className="kratzer" /><div className="knitter" />
          <div className="regen" ref={modusRegenRef} />
        </div>
      ) : null}
      {einstellungen.modus === "grindhouse" && (
        <>
          <div className="kd-perfo l" /><div className="kd-perfo r" />
          <div className="kd-kantenriss l" /><div className="kd-kantenriss r" />
          <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
            <filter id="fransig">
              <feTurbulence type="fractalNoise" baseFrequency="0.03 0.14" numOctaves="4" seed="3" result="t" />
              <feDisplacementMap in="SourceGraphic" in2="t" scale="26" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </svg>
        </>
      )}
      <div className="kd-app">
      {startModalOffen && !setupWarnung && (
        <StartWahl onWaehle={waehleStart}
          aktuelle={(() => { try { return localStorage.getItem("kd:start"); } catch { return null; } })()} />
      )}
      {setupWarnung && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(23,21,26,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: T.saalHoch, border: "1px solid " + T.gefahr, borderRadius: 8, maxWidth: 440, padding: "22px 24px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase", color: T.gefahr, marginBottom: 10 }}>
              Installation noch nicht abgeschlossen
            </div>
            <p style={{ fontSize: 14, color: T.leinwandTief, lineHeight: 1.6, margin: "0 0 16px" }}>
              Die Terminal-Installation wurde noch nicht bestätigt. Ohne <strong>Installation-Mac.command</strong> beziehungsweise <strong>Installation-Windows.bat</strong> bleiben die beigepackten Kino- und Streamingdaten im leeren Start gesperrt. Mediathek, Blog und manuelle Eingabe funktionieren trotzdem; Demo zeigt auch die Datenbeilagen.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href="Installation.html" style={{ ...btnStyle(true), textDecoration: "none" }}>Zur Installation</a>
              <button style={btnStyle(false)} onClick={() => {
                try { setupUeberspringen(); } catch { /* */ }
                setSetupWarnung(false);
                let wahl = null;
                try { wahl = localStorage.getItem(K.start); } catch { /* */ }
                if (wahl === "demo" || wahl === "clean") {
                  try { if (!getTutorial().willkommen) setWillkommenOffen(true); } catch { /* */ }
                } else {
                  setStartModalOffen(true);
                }
                setStartTick((t) => t + 1);
              }}>Trotzdem fortfahren</button>
            </div>
          </div>
        </div>
      )}
      {willkommenOffen && (
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
          <Logo size={34} />
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
      <NavBand offen={navOffen} onToggle={() => setNavOffen((o) => !o)} />
      <div className={"kd-scrim" + (navOffen ? " offen" : "")} onClick={() => setNavOffen(false)} aria-hidden="true" />
      {/* z-index bewusst NICHT inline: Inline-Styles schlagen CSS ohne !important —
          ein inline zIndex hier hat den Drawer unter den Scrim (58) gedrückt.
          Ebenen liegen in index.css: Desktop 40, Handy 60 (.kd-menu). */}
      <nav className={"kd-menu" + (navOffen ? " offen" : "")} style={{ position: "sticky", top: 0, background: T.saal, borderBottom: "1px solid " + T.saalHoch }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 22px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["start", "Start"], ["kino", "Kino"], ["mediathek", "Mediathek"], ["streaming", "Streaming"], ["blog", "Blog"], ["finder", "Suche"], ["daten", "Einstellungen"]].map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setNavOffen(false); try { window.scrollTo(0, 0); } catch { /* */ } }}
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
          <div style={{ background: T.saalHoch, border: "1px solid " + T.wolfram, borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 13.5, color: T.leinwandTief, lineHeight: 1.6 }}>
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
              {!snapshotFreigabe ? " Beigepacktes Kinoprogramm und Streaming bleiben bis zum Terminal-Installer oder bis zur Demo-Wahl gesperrt." : " Kino, Streaming und Suche funktionieren; nur der Abgleich mit deinem Geschmack fehlt."}
            </p>
            <button style={btnStyle(true)} onClick={() => setTab("mediathek")}>Ersten Eintrag anlegen</button>
          </div>
        ) : null}

        {tab === "start" && bootDone && (
          <StartTab kinoPins={kinoPins} toggleKinoPin={toggleKinoPin} merkliste={merkliste} toggleMerk={toggleMerk} onNavigiere={setTab} onTutorialNeu={() => { try { resetTutorial(); } catch { /* */ } setWillkommenOffen(true); }} />
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
          />
        )}

        {tab === "mediathek" && bootDone && (
          <MediathekTab
            master={master || []} nachtragFlach={master ? nachtragSichtbar : []}
            expandedId={expandedId} setExpandedId={setExpandedId}
            updateFilm={updateFilm} addFilm={addFilm} badgeFuer={badgeFuer}
            artikel={artikelListe} onArtikelKlick={springeZuArtikel}
            fokusFilmId={mediathekFokus} onFokusVerbraucht={() => setMediathekFokus(null)}
            exportMaster={exportMaster} importMaster={importMaster}
            autorName={autorName} saveAutorName={saveAutorName}
            uebernehmePaket={uebernehmePaket} setErr={setErr}
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
          />
        )}

        {tab === "streaming" && (
          <StreamingTab
            bekannt={streamingBekannt} entdecken={streamingEntdecken}
            addFilm={addFilm} master={master} updateFilm={updateFilm}
            mustwatchIds={mustwatchMasterIds}
            auswahl={auswahl} toggleQuelle={toggleQuelle}
            merkliste={merkliste} toggleMerk={toggleMerk}
            heuristikAn={heuristikAn} setHeuristikAn={(v) => { setHeuristikAn(v); store.set(K.streamingDienste, streamingCfgJson(auswahl, v, resetTag)).catch(() => {}); }}
            datenGesperrt={!snapshotFreigabe}
          />
        )}

        {tab === "finder" && master && (
          <FinderTab
            master={finderMaster} kinoMatches={kinoMatches}
            streamingBekannt={streamingBekannt} streamingEntdecken={streamingEntdecken}
            mustwatchIds={mustwatchMasterIds}
            onSpringeZuFilm={springeZuFilm} addFilm={addFilm}
            verlauf={finderVerlauf} setVerlauf={setFinderVerlauf}
            eingabe={finderEingabe} setEingabe={setFinderEingabe}
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
            onStartartWechseln={oeffneStartWahl}
            artikelAnzahl={artikelListe.length} exportArtikel={exportArtikel} importArtikel={importArtikel}
            ungesichertMaster={ungesichertMaster} ungesichertArtikel={ungesichertArtikel}
            artikelListe={artikelListe} autorName={autorName} saveAutorName={saveAutorName}
            uebernehmePaket={uebernehmePaket}
            einstellungen={einstellungen} setzeEinstellung={setzeEinstellung} waehleModus={waehleModus}
            streamingBekannt={streamingBekannt} streamingEntdecken={streamingEntdecken}
            auswahl={auswahl} toggleQuelle={toggleQuelle} heuristikAn={heuristikAn}
            setHeuristikAn={(v) => { setHeuristikAn(v); store.set(K.streamingDienste, streamingCfgJson(auswahl, v, resetTag)).catch(() => {}); }}
            resetTag={resetTag} setResetTag={setResetTag}
            datenGesperrt={!snapshotFreigabe}
            backupGesamt={backupGesamt} vokabular={vokabular} saveVokabular={saveVokabular}
            offeneFlags={offeneFlags} migriereMustwatch={migriereMustwatch} migrationsBericht={migrationsBericht}
            importiereBesitz={importiereBesitz} besitzImportBericht={besitzImportBericht}
          />
        )}
      </main>
      </div>{/* .kd-app */}
      {einstellungen.modus === "kurosawa" && (
        <div id="kd-horizont">
          <div className="boden" />
          <div id="kd-halme" ref={modusHalmeRef} />
          <div id="kd-nobori" ref={modusNoboriRef} />
          <div id="kd-nobori2" ref={modusNobori2Ref} />
        </div>
      )}
    </div>
  );
}

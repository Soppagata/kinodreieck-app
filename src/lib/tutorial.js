/* ---------- Tutorial- & Setup-Persistenz (Phase 1: Fundament) ----------
   Zwei localStorage-Schlüssel plus Legacy-Flag:
     kd:setup    = { done:bool, installiert:bool, skip:string[], am:'YYYY-MM-DD'|null, version:string }
     kd:tutorial = { willkommen:bool, gesehen:string[] }
     kd:setup-done = "true"  (Legacy — wird nur noch kompatibel mitgeschrieben)

   initSetup() liest die EIGENE URL der App (?setup=done[&skip=api,automatik,bestand]),
   schreibt kd:setup und legt kd:tutorial an, falls es fehlt. Ein Versionswechsel
   setzt Einrichtung und Tutorial genau einmal zurück; Installer-Re-Runs innerhalb
   derselben Beta lassen bereits gesehene Hinweise unangetastet. */

const K_SETUP = "kd:setup";
const K_TUT = "kd:tutorial";
const K_LEGACY = "kd:setup-done";
const SKIP_ERLAUBT = ["api", "automatik", "bestand"];
export const SETUP_VERSION = "beta-2026-07-datenfreigabe-2";

function ls() {
  try { return (typeof localStorage !== "undefined") ? localStorage : null; } catch { return null; }
}
function readJSON(key, fallback) {
  const s = ls(); if (!s) return fallback;
  try { const v = s.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(key, obj) {
  const s = ls(); if (!s) return;
  try { s.setItem(key, JSON.stringify(obj)); } catch { /* Speicher voll/blockiert — nicht fatal */ }
}
function heute() { return new Date().toISOString().slice(0, 10); }

const leeresSetup = () => ({ done: false, installiert: false, skip: [], am: null, version: SETUP_VERSION });

/* Beim App-Start aufrufen. "installiert" wird nur durch den Marker gesetzt,
   den die beiden Terminal-Installer an Installation.html übergeben. */
export function initSetup(urlRoh) {
  const url = urlRoh != null ? urlRoh
    : (typeof location !== "undefined" ? (location.search + location.hash) : "");
  const s = ls();
  let setup = readJSON(K_SETUP, null);
  const neueVersion = !setup || setup.version !== SETUP_VERSION;

  if (neueVersion) {
    setup = leeresSetup();
    writeJSON(K_SETUP, setup);
    writeJSON(K_TUT, { willkommen: false, gesehen: [] });
  }

  if (/[?&#]setup=done(?:[&#]|$)/.test(url)) {
    const m = /[?&#]skip=([^&#]*)/.exec(url);
    const skip = m
      ? decodeURIComponent(m[1]).split(",").map((x) => x.trim()).filter((x) => SKIP_ERLAUBT.includes(x))
      : [];
    const vomTerminal = /[?&#]install=command(?:[&#]|$)/.test(url);
    setup = {
      done: true,
      installiert: !!(vomTerminal || (setup && setup.installiert)),
      skip,
      am: heute(),
      version: SETUP_VERSION,
    };
    writeJSON(K_SETUP, setup);
    if (s) { try { s.setItem(K_LEGACY, "true"); } catch { /* */ } }
  }

  if (!readJSON(K_TUT, null)) writeJSON(K_TUT, { willkommen: false, gesehen: [] });

  return setup || leeresSetup();
}

export function getSetup() {
  const setup = readJSON(K_SETUP, null);
  return setup && setup.version === SETUP_VERSION ? setup : leeresSetup();
}
export function setupUeberspringen() {
  const alt = getSetup();
  const setup = { done: true, installiert: !!alt.installiert, skip: alt.skip || [], am: heute(), version: SETUP_VERSION };
  writeJSON(K_SETUP, setup);
  const s = ls();
  if (s) { try { s.setItem(K_LEGACY, "true"); } catch { /* */ } }
  return setup;
}
export function skipHat(was) { return getSetup().skip.includes(was); }

export function getTutorial() { return readJSON(K_TUT, { willkommen: false, gesehen: [] }); }
export function istGesehen(id) { return getTutorial().gesehen.includes(id); }
export function markGesehen(id) {
  const t = getTutorial();
  if (!t.gesehen.includes(id)) { t.gesehen.push(id); writeJSON(K_TUT, t); }
  return t;
}
export function setWillkommen(v = true) {
  const t = getTutorial(); t.willkommen = !!v; writeJSON(K_TUT, t); return t;
}
/* "Tutorial neu starten" (Anleitung & Hilfe): Willkommen + alle Hinweise zurück. */
export function resetTutorial() { writeJSON(K_TUT, { willkommen: false, gesehen: [] }); }

/* Start-, Installations- und Tutorial-Lebenszyklus.
   App.jsx konsumiert nur Entscheidungen; URL-/Storage-Regeln und der einmalige
   destruktive Installerauftrag liegen hier gebündelt. */

import { K } from "../services/storage.js";
import {
  PERSONAL_DATA_KEYS, bereinigeVeralteteImportSnapshots,
} from "../lib/personalDataRegistry.js";
import { catalogService } from "../services/catalog.js";

export const START_WAHL_VERSION = "demo-v1";
export const EINSTIEG_VERSION = "mobile-v1";

function lokalerSpeicher() {
  try { return typeof localStorage !== "undefined" ? localStorage : null; }
  catch { return null; }
}

export function liesEinstieg() {
  const storage = lokalerSpeicher();
  if (!storage) return null;
  try {
    const wert = JSON.parse(storage.getItem(K.einstieg) || "null");
    return wert && typeof wert === "object" ? wert : null;
  } catch { return null; }
}

export function hatBestehendenLokalenStand() {
  const storage = lokalerSpeicher();
  if (!storage) return false;
  try {
    return startWahlBestaetigt() || PERSONAL_DATA_KEYS.some((key) => storage.getItem(key) !== null);
  } catch { return false; }
}

export function speichereEinstieg({ abgeschlossen, weg, grund } = {}) {
  const storage = lokalerSpeicher();
  const zustand = {
    version: EINSTIEG_VERSION,
    abgeschlossen: !!abgeschlossen,
    weg: weg === "konto" ? "konto" : "gast",
    ...(grund ? { grund } : {}),
  };
  if (storage) {
    try { storage.setItem(K.einstieg, JSON.stringify(zustand)); }
    catch { /* blockierter Gerätespeicher: Zustand bleibt für diese Sitzung nutzbar */ }
  }
  return zustand;
}

export function schliesseEinstieg(weg) {
  return speichereEinstieg({ abgeschlossen: true, weg });
}

export function fordereEinstiegNachAbmeldung() {
  return speichereEinstieg({ abgeschlossen: false, weg: "gast", grund: "abmeldung" });
}

/* Bestehende Nutzer werden still auf die neue Version gehoben. Ein explizit
   offener Zustand (nach Abmeldung) gewinnt dagegen vor der Bestandsmigration. */
export function einstiegNoetig(session) {
  const bisher = liesEinstieg();
  if (session?.mode === "account") {
    schliesseEinstieg("konto");
    return false;
  }
  if (bisher?.version === EINSTIEG_VERSION) return !bisher.abgeschlossen;
  if (hatBestehendenLokalenStand()) {
    schliesseEinstieg("gast");
    return false;
  }
  return true;
}

export function liesStartWahl() {
  try {
    const url = (typeof location !== "undefined") ? location.search + location.hash : "";
    const m = /[?&#]start=(demo|clean)/.exec(url);
    if (m) return m[1];
  } catch { /* */ }
  try {
    const v = localStorage.getItem(K.start);
    if (v === "demo" || v === "clean") return v;
  } catch { /* */ }
  return null;
}

export function startWahlBestaetigt() {
  try {
    const url = (typeof location !== "undefined") ? location.search + location.hash : "";
    if (/[?&#]start=(demo|clean)(?:[&#]|$)/.test(url)) return true;
    return localStorage.getItem(K.startVersion) === START_WAHL_VERSION;
  } catch { return false; }
}

export function pruefeFrischenStartUrl(url) {
  const startMatch = /[?&#]start=(demo|clean)(?:[&#]|$)/.exec(String(url || ""));
  const tokenMatch = /[?&#]fresh=([^&#]*)/.exec(String(url || ""));
  if (!tokenMatch) return { art: "keiner" };
  if (!startMatch) return { art: "ungueltig", grund: "Startart fehlt" };
  let token;
  try { token = decodeURIComponent(tokenMatch[1]); }
  catch { return { art: "ungueltig", grund: "Token ist nicht lesbar" }; }
  if (!/^[A-Za-z0-9._~-]{8,160}$/.test(token)) {
    return { art: "ungueltig", grund: "Tokenform ist ungültig" };
  }
  return { art: "auftrag", start: startMatch[1], token };
}

let frischerStartMemo;
let frischerStartWarnungMemo = "";
export function liesFrischenStartWarnung() { return frischerStartWarnungMemo; }
export function verbraucheFrischenStart() {
  if (frischerStartMemo !== undefined) return frischerStartMemo;
  frischerStartMemo = null;
  frischerStartWarnungMemo = "";
  try {
    const url = (typeof location !== "undefined") ? location.search + location.hash : "";
    const pruefung = pruefeFrischenStartUrl(url);
    if (pruefung.art === "keiner") return null;
    if (pruefung.art === "ungueltig") {
      frischerStartWarnungMemo = `Der Reset-Link ist ungültig (${pruefung.grund}); es wurden keine Daten gelöscht.`;
      return null;
    }
    const { token, start } = pruefung;
    if (localStorage.getItem(K.startAuftrag) === token) return null;

    /* Den Auftrag vor dem Löschen verbrauchen: ein Reload derselben URL darf
       keinen danach neu aufgebauten Stand erneut vernichten. */
    localStorage.setItem(K.startAuftrag, token);
    localStorage.setItem(K.start, start);
    /* Beta-Total-Reset: neben den persönlichen Töpfen auch die Gerätemarken
       räumen, die sonst als Restzustand weiterwirkten (Demo-Seed, Programm-
       Cache, Einstiegs-/Tutorial-/Setup-Marken). Effekt: beim nächsten Boot
       ohne ?start= kommt das EinstiegsGate wieder — gewünscht. kd:ki bleibt
       BEWUSST stehen: die KI-Wahl ist eine Grundsatzentscheidung über einen
       bezahlten Pfad, kein Testrest. */
    const geraetemarken = [K.demoSeed, K.programm, K.einstieg, "kd:tutorial", "kd:setup", "kd:setup-done"];
    if (!bereinigeVeralteteImportSnapshots(localStorage)) {
      throw new Error("Veraltete Import-Sicherungen konnten nicht entfernt werden.");
    }
    for (const key of [...PERSONAL_DATA_KEYS, K.exportStand, ...geraetemarken]) {
      localStorage.removeItem(key);
    }
    frischerStartMemo = start;
  } catch {
    frischerStartWarnungMemo = "Der Reset-Link konnte nicht vollständig ausgeführt werden. Prüfe deinen Datenstand und lade im Zweifel dein letztes Backup wiederher; einzelne lokale Daten können bereits entfernt worden sein.";
    /* Storage kann erst mitten in der sequenziellen Bereinigung ausfallen.
       Deshalb weder vollständigen Erfolg noch einen unveränderten Stand behaupten. */
  }
  return frischerStartMemo;
}

export function tutorialFrei() {
  try { return !!liesStartWahl() && startWahlBestaetigt(); }
  catch { return false; }
}

export function snapshotsFrei() {
  /* Die Doppelklick-Datei bringt ihren geprüften Archiv-/Demo-Bestand selbst
     mit. Sie darf deshalb nicht an denselben Zugangsschlüssel-Gate geraten wie
     der Online-Katalog; dessen Live-Daten bleiben weiterhin verbindungsgebunden. */
  const einzeldatei = typeof location !== "undefined" && location.protocol === "file:";
  return einzeldatei || catalogService.hasConnection();
}

/* Start-, Installations- und Tutorial-Lebenszyklus.
   App.jsx konsumiert nur Entscheidungen; URL-/Storage-Regeln und der einmalige
   destruktive Installerauftrag liegen hier gebündelt. */

import { K } from "../services/storage.js";
import {
  PERSONAL_DATA_KEYS,
} from "../lib/personalDataRegistry.js";
import { catalogService } from "../services/catalog.js";

export const START_WAHL_VERSION = "local-v1";
export const EINSTIEG_VERSION = "private-v1";

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
    try {
      storage.setItem(K.einstieg, JSON.stringify(zustand));
      return { ...zustand, gespeichert: storage.getItem(K.einstieg) === JSON.stringify(zustand) };
    } catch { /* Ein gescheiterter Write darf keinen bestätigten Einstieg vortäuschen. */ }
  }
  return { ...zustand, gespeichert: false };
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

export function liesStartWahl() { return "clean"; }

export function startWahlBestaetigt() {
  try {
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

let frischerStartWarnungMemo = "";
export function liesFrischenStartWarnung() { return frischerStartWarnungMemo; }
export function verbraucheFrischenStart() {
  /* Historische Reset-URLs sind keine Autorisierung für eine Gesamtlöschung. */
  try {
    const url = typeof location !== "undefined" ? location.search + location.hash : "";
    frischerStartWarnungMemo = /[?&#]fresh=/.test(url)
      ? "Reset-Links sind deaktiviert; es wurden keine Daten gelöscht." : "";
  } catch { /* keine URL verfügbar */ }
  return null;
}

export function tutorialFrei() {
  try { return !!liesStartWahl() && startWahlBestaetigt(); }
  catch { return false; }
}

export function snapshotsFrei() { return catalogService.storedVariant() === "live"; }

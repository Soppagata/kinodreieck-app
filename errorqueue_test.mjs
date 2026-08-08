import assert from "node:assert/strict";
import {
  MAX_GLOBALE_FEHLER,
  fehlerQueueReducer,
  initialisiereFehlerQueue,
  normalisiereFehlerText,
} from "./src/controllers/useErrorQueue.js";

let checks = 0;
const ok = (bedingung, text) => {
  assert.ok(bedingung, text);
  checks++;
  console.log("✓ " + text);
};
const report = (state, scope, text, id = `${scope}:${text}`) => (
  fehlerQueueReducer(state, { type: "report", scope, text, id })
);

let state = initialisiereFehlerQueue({ scope: "fresh-url", text: "Reset-Link ungültig" });
ok(state.length === 1 && state[0].scope === "fresh-url", "eine Startwarnung wird sofort sichtbar initialisiert");
ok(normalisiereFehlerText(new Error("Import kaputt")) === "Import kaputt", "Legacy-Adapter bewahrt die Meldung eines Error-Objekts");

state = report(state, "programm-load", "Kino nicht ladbar", "p1");
state = report(state, "streaming-known", "Streaming nicht ladbar", "s1");
ok(state.length === 3, "gleichzeitige Fehler verschiedener Produzenten bleiben nebeneinander erhalten");

state = report(state, "programm-load", "Kino weiterhin nicht ladbar", "p2");
ok(state.length === 3, "ein Produzent aktualisiert seinen Eintrag statt die Queue zu vervielfachen");
ok(state.find((e) => e.scope === "programm-load")?.id === "p1", "ein aktualisierter Eintrag behält seine stabile ID");
ok(state.at(-1)?.text === "Kino weiterhin nicht ladbar", "die jüngste Diagnose steht am Ende");

const unveraendert = report(state, "programm-load", "Kino weiterhin nicht ladbar", "p3");
ok(unveraendert === state, "identische Wiederholungen werden ohne neuen Zustand dedupliziert");

state = fehlerQueueReducer(state, { type: "resolve", scope: "programm-load" });
ok(!state.some((e) => e.scope === "programm-load"), "Erfolg löst nur den eigenen Produzenten auf");
ok(state.some((e) => e.scope === "streaming-known"), "ein paralleler Streamingfehler bleibt beim Kino-Erfolg stehen");

const streamingId = state.find((e) => e.scope === "streaming-known").id;
state = fehlerQueueReducer(state, { type: "dismiss", id: streamingId });
ok(!state.some((e) => e.id === streamingId), "Schließen entfernt genau den gewählten Eintrag");
ok(state.some((e) => e.scope === "fresh-url"), "Schließen lässt unabhängige Warnungen unangetastet");

state = [];
for (let i = 0; i < MAX_GLOBALE_FEHLER + 2; i++) state = report(state, `scope-${i}`, `Fehler ${i}`);
ok(state.length === MAX_GLOBALE_FEHLER, "die Queue ist hart begrenzt");
ok(state[0].scope === "scope-2", "bei Überlauf bleiben die fünf jüngsten Produzenten sichtbar");

const vorLeer = state;
state = report(state, "", "")
ok(state === vorLeer, "leere Meldungen verändern die Queue nicht");

console.log(`\nERRORQUEUE-TEST BESTANDEN (${checks}/${checks})`);

/* E17A: lokale React-/JSDOM-Vertragsprüfung. Alle Umgebungseffekte sind
   injiziert; kein Netz, Anbieter, echter Storage oder Live-Test. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { erteileEinwilligung } from "./src/lib/profil.js";

const wurzel = path.dirname(fileURLToPath(import.meta.url));
const ladeEsbuild = async () => {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
};
const ausgabeDir = path.join(wurzel, `.blogprofilanalyse-ui-tmp-${process.pid}`);
const ausgabe = path.join(ausgabeDir, "bundle.mjs");
fs.mkdirSync(ausgabeDir, { recursive: true });
process.on("exit", () => { try { fs.rmSync(ausgabeDir, { recursive: true, force: true }); } catch {} });
const esbuild = await ladeEsbuild();
await esbuild.build({
  stdin: {
    contents: 'export { BlogProfilAnalyse } from "./src/components/BlogProfilAnalyse.jsx";',
    loader: "js",
    resolveDir: wurzel,
  },
  bundle: true,
  format: "esm",
  outfile: ausgabe,
  jsx: "automatic",
  target: "es2022",
  logLevel: "warning",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of [
  "window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement",
  "Element", "Event", "MouseEvent", "Node", "NodeList", "AbortController", "getComputedStyle",
  "localStorage", "sessionStorage",
]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name],
    configurable: true,
    writable: true,
  });
}
let echteFetches = 0;
globalThis.fetch = async () => {
  echteFetches++;
  throw new Error("NETZ_IM_UI_TEST_VERBOTEN");
};
dom.window.fetch = globalThis.fetch;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h, StrictMode } = React;
const { createRoot } = await import("react-dom/client");
const { BlogProfilAnalyse } = await import(ausgabe);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const warten = async (ms = 0) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

let checks = 0;
const check = (wert, text) => {
  assert.ok(wert, text);
  checks++;
  console.log("✓ " + text);
};
const knopf = (container, text) => [...container.querySelectorAll("button")]
  .find((element) => element.textContent.includes(text));
const anzahlBezahlteAufrufe = (setup) => setup.ai.calls.filter((call) => call.task === "blog-profile-extract").length;
const probeSchluessel = (marker) => [...marker.map.keys()].filter((key) => key.includes("kd-blogprofilanalyse-marker-probe"));
const setzeWert = (element, wert) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  setter.call(element, wert);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const HASH = "a".repeat(64);
const ZEIT = "2026-08-17T08:15:30.000Z";
const GENRES = ["Drama", "Noir", "Action"];
const TAGS = ["präzise", "düster", "schnell"];
const BELEG = "Dieser präzise Satz ist der sichere Beleg im eigenen Artikel.";
const ARTIKEL = {
  id: "eigener_artikel",
  herkunft: "eigene_quelle",
  titel: "Mein genauer Blick auf den Film",
  text: `Auftakt. ${BELEG} Danach folgt ein ruhiger Schluss.`,
};
const ARTIKEL_2 = {
  id: "zweiter_artikel",
  titel: "Ein zweiter eigener Text",
  text: `Beginn. ${BELEG} Und Ende.`,
};
const MODELL = {
  geschmackszuege: [{
    art: "genre", wert: "Drama", richtung: "zieht_an", staerke: 4, sicherheit: "hoch", beleg: BELEG,
  }],
  vokabular: [{
    wort: "Nachtkino", beschreibung: "Dunkle, genaue Filmstimmung", genres: ["Drama"], tags: ["düster"], beleg: BELEG,
  }],
};
const HEALTH = {
  ok: true,
  task: "health",
  vorgangId: "00000000-0000-4000-8000-000000000001",
  phase: "etappe-5",
  contractVersion: "ai-task-v5",
  buildVersion: "ui-test",
  laufzeit: { deno: "2", region: "eu" },
  schluesselHerkunft: { oeffentlich: "gesetzt", geheim: "gesetzt" },
  anbieterSecretGesetzt: true,
  aufrufer: { rolle: "authenticated", fachrolle: "owner", weg: "token", accountIdVorhanden: true },
  activation: {
    gate: "KD_AI_TASK_ENABLED",
    requiredValue: "true",
    enabled: true,
    userTasks: [
      "intelligent-search",
      "profile-extract",
      "film-forecast",
      "filmwissen-synthese",
      "media-batch-extract",
      "blog-profile-extract",
    ],
  },
  betrieb: { aiAktiv: true },
  zeit: ZEIT,
  capabilities: {
    blogProfileExtract: {
      ready: true,
      task: "blog-profile-extract",
      promptVersion: "blog-profile-v1",
      modelAlias: "klein",
      maxTokens: 2048,
      taskMaxReservationUsdCent: 5,
    },
  },
};

const profilBasis = () => erteileEinwilligung(null, ZEIT, "v1");
const markerMock = () => {
  const map = new Map();
  return {
    map,
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};
const markerSetFail = () => {
  const marker = markerMock();
  return {
    ...marker,
    setItem: () => { throw new Error("quota"); },
  };
};
const markerReadFailProbe = () => {
  const marker = markerMock();
  return {
    ...marker,
    getItem: (key) => {
      if (key.includes("kd-blogprofilanalyse-marker-probe")) return null;
      return marker.getItem(key);
    },
  };
};
const markerRemoveFail = () => {
  const marker = markerMock();
  return {
    ...marker,
    removeItem: () => { throw new Error("quota"); },
  };
};
const markerNoRemove = () => {
  const marker = markerMock();
  const { removeItem, ...ohne } = marker;
  return ohne;
};

const pruefeKeinenBezahltenAufrufBeiProbeFehler = async ({ label, markerStorage, expected }) => {
  const setup = standardProps({ markerStorage });
  const fixture = await mounte(setup);
  const textFeld = knopf(fixture.container, "analysieren");
  if (!setup.props.markerStorage.removeItem) {
    check(!textFeld && setup.ai.calls.every((call) => call.task === "health"),
      `${label}: fehlendes removeItem blockt vor runTask`);
    await fixture.cleanup();
    return;
  }
  const checkbox = fixture.container.querySelector('input[type="checkbox"]');
  await act(async () => { checkbox.click(); await tick(); });
  await act(async () => { textFeld.click(); await tick(); });
  const status = fixture.container.querySelector('[aria-live="polite"], [role="status"]');
  check(anzahlBezahlteAufrufe(setup) === 0,
    `${label}: kein KI-Aufruf bei Markerprobe`);
  check(!probeSchluessel(setup.marker).length,
    `${label}: Probe-Schlüssel bleiben nach Fehltest nicht zurück`);
  check(status?.textContent.includes(expected), `${label}: präzise Fehlertext`);
  check(!status?.textContent.includes(ARTIKEL.text)
    && !status?.textContent.includes(ARTIKEL.titel)
    && !status?.textContent.includes(BELEG),
    `${label}: Fehler bleibt inhaltsfrei`);
  check(setup.marker.map.get("vorprobe") === "bleiben",
    `${label}: vorhandener Marker bleibt unverändert`);
  await fixture.cleanup();
};

const kontextMock = () => {
  const zustand = { current: true, captures: 0 };
  return {
    zustand,
    capture: () => {
      zustand.captures++;
      return { owner: "testkonto", generation: 1, isCurrent: () => zustand.current };
    },
  };
};
const aiMock = ({ health = HEALTH, analyse = () => ({ data: structuredClone(MODELL) }) } = {}) => {
  const calls = [];
  return {
    calls,
    api: {
      runTask(task, payload, options) {
        calls.push({ task, payload: structuredClone(payload), options });
        return Promise.resolve(task === "health" ? structuredClone(health) : analyse({ task, payload, options }));
      },
    },
  };
};

const standardProps = (overrides = {}) => {
  const marker = overrides.markerStorage || markerMock();
  const kontext = overrides.kontext || kontextMock();
  const ai = overrides.aiObj || aiMock();
  return {
    props: {
      artikelListe: [ARTIKEL],
      bekannteGenres: GENRES,
      bekannteTags: TAGS,
      profil: profilBasis(),
      vokabular: [],
      accountId: ACCOUNT_A,
      aktiv: true,
      ai: ai.api,
      markerStorage: marker,
      sessionStorage: { getItem: () => { throw new Error("falscher Storage"); } },
      digest: async () => HASH,
      clock: () => ZEIT,
      captureContext: kontext.capture,
      onProfilSpeichern: async () => true,
      onVokabularSpeichern: async () => true,
      onFehler: () => {},
      ...overrides.props,
    },
    marker,
    kontext,
    ai,
  };
};

async function mounte(setup) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let props = setup.props;
  const element = () => setup.strict
    ? h(StrictMode, null, h(BlogProfilAnalyse, props))
    : h(BlogProfilAnalyse, props);
  await act(async () => { root.render(element()); await tick(); await tick(); });
  return {
    container,
    setup,
    async render(patch = {}) {
      props = { ...props, ...patch };
      await act(async () => { root.render(element()); await tick(); await tick(); });
    },
    async cleanup() { await act(async () => { root.unmount(); await tick(); }); container.remove(); },
  };
}

async function bestaetigeUndKlicke(fixture) {
  const checkbox = fixture.container.querySelector('input[type="checkbox"]');
  await act(async () => { checkbox.click(); await tick(); });
  const analyse = knopf(fixture.container, "analysieren");
  await act(async () => { analyse.click(); await tick(); });
}

/* Capability ist exakt und fail-closed. */
const altHealth = structuredClone(HEALTH);
delete altHealth.contractVersion;
const alt = await mounte(standardProps({ aiObj: aiMock({ health: altHealth }) }));
check(!knopf(alt.container, "analysieren"), "altes Health ohne ai-task-v5 schaltet den Kostenknopf nicht frei");
check(alt.setup.ai.calls.length === 1 && alt.setup.ai.calls[0].task === "health"
  && Object.keys(alt.setup.ai.calls[0].payload).length === 0,
"Health wird providerfrei mit leerem Payload abgefragt");
await alt.cleanup();

const kaputtHealth = structuredClone(HEALTH);
kaputtHealth.capabilities.blogProfileExtract.maxTokens = "2048";
const kaputt = await mounte(standardProps({ aiObj: aiMock({ health: kaputtHealth }) }));
check(!knopf(kaputt.container, "analysieren"), "kaputte Capability-Feldtypen bleiben fail-closed");
await kaputt.cleanup();

/* Partiell gerettete Einzelitems bleiben Vorschau. Erst die ausdrücklich
   gewählte Gruppe erreicht ihren bestehenden Writer. Dieser neue senkrechte
   Pfad läuft vor den historischen Recovery-Proben des großen Harnesses. */
const partialHealth = structuredClone(HEALTH);
partialHealth.activation = {
  gate: "KD_AI_TASK_ENABLED",
  requiredValue: "true",
  enabled: true,
  userTasks: [
    "intelligent-search", "profile-extract", "film-forecast",
    "filmwissen-synthese", "media-batch-extract", "blog-profile-extract",
  ],
};
const partialProfilWrites = [];
const partialVokabularWrites = [];
const partial = await mounte(standardProps({
  aiObj: aiMock({
    health: partialHealth,
    analyse: () => ({
      ok: true,
      data: structuredClone(MODELL),
      responseMode: "partial",
      displayText: "Die Bloganalyse war teilweise unvollständig. Nur einzeln belegte Vorschläge werden angezeigt.",
      warnings: ["json-extracted-from-text", "invalid-items-ignored"],
    }),
  }),
  props: {
    onProfilSpeichern: async (wert) => { partialProfilWrites.push(wert); return true; },
    onVokabularSpeichern: async (wert) => { partialVokabularWrites.push(wert); return true; },
  },
}));
await bestaetigeUndKlicke(partial);
await warten();
check(partial.container.querySelectorAll("[data-status]").length === 2
  && partial.container.textContent.includes("Nur einzeln belegte Vorschläge werden angezeigt"),
"partial zeigt genau die zwei geretteten Vorschläge samt bereinigtem Hinweis");
check(partialProfilWrites.length === 0 && partialVokabularWrites.length === 0,
  "die partial-Vorschau schreibt vor Bestätigung weder Profil noch Vokabular");
await act(async () => {
  knopf(partial.container, "Geschmacksprofil speichern").click();
  await tick(); await tick();
});
check(partialProfilWrites.length === 1
  && partialProfilWrites[0].signale.some((signal) => signal.art === "genre" && signal.wert === "Drama")
  && partialVokabularWrites.length === 0,
"selektive Bestätigung übernimmt nur den gewählten Profilvorschlag über den bestehenden Profilweg");
await partial.cleanup();

const degradedProfilWrites = [];
const degradedVokabularWrites = [];
const degraded = await mounte(standardProps({
  aiObj: aiMock({
    health: partialHealth,
    analyse: () => ({
      ok: true,
      data: null,
      responseMode: "degraded",
      displayText: "Die Antwort blieb lesbar, aber ohne sicher belegte Vorschläge.",
      warnings: ["unstructured-provider-text"],
    }),
  }),
  props: {
    onProfilSpeichern: async (wert) => { degradedProfilWrites.push(wert); return true; },
    onVokabularSpeichern: async (wert) => { degradedVokabularWrites.push(wert); return true; },
  },
}));
await bestaetigeUndKlicke(degraded);
await warten();
check(!degraded.container.querySelector(".kd-blogprofilanalyse-vorschau")
  && degraded.container.textContent.includes("ohne sicher belegte Vorschläge"),
  "degraded zeigt nur den bereinigten Hinweis und keine Profilvorschau");
check(degradedProfilWrites.length === 0 && degradedVokabularWrites.length === 0
  && degraded.setup.marker.map.size === 0
  && degraded.container.querySelector('input[type="checkbox"]').checked === false,
  "degraded schreibt weder Profil, Vokabular noch Analysenachweis und verlangt für einen neuen Lauf erneut Zustimmung");
await degraded.cleanup();

for (const [name, captureContext] of [
  ["fehlend", () => ({})],
  ["formfremd", () => ({ isCurrent: "ja" })],
  ["werfend", () => ({ isCurrent: () => { throw new Error("kaputt"); } })],
]) {
  const setup = standardProps({ props: { captureContext } });
  const fixture = await mounte(setup);
  check(!knopf(fixture.container, "analysieren")
    && setup.ai.calls.length >= 1
    && setup.ai.calls.every((call) => call.task === "health"),
  `malformed capture (${name}) lässt ausschließlich Health und null paid request zu`);
  await fixture.cleanup();
}

let contextNachHealthGueltig = true;
const startFenceSetup = standardProps({
  props: {
    captureContext: () => contextNachHealthGueltig ? { isCurrent: () => true } : {},
  },
});
const startFence = await mounte(startFenceSetup);
contextNachHealthGueltig = false;
await bestaetigeUndKlicke(startFence);
check(startFenceSetup.ai.calls.every((call) => call.task === "health")
  && startFence.container.textContent.includes("nicht sicher gestartet"),
"nach Health formfremder Capture sperrt vor blog-profile-extract");
await startFence.cleanup();

const awaitContext = { isCurrent: () => true };
const awaitOffen = deferred();
const awaitAi = aiMock({ analyse: () => awaitOffen.promise });
const awaitSetup = standardProps({
  aiObj: awaitAi,
  props: { captureContext: () => awaitContext },
});
const awaitFence = await mounte(awaitSetup);
await bestaetigeUndKlicke(awaitFence);
awaitContext.isCurrent = "ja";
await act(async () => { awaitOffen.resolve({ data: structuredClone(MODELL) }); await tick(); await tick(); });
check(!awaitFence.container.querySelector(".kd-blogprofilanalyse-vorschau") && awaitSetup.marker.map.size === 0,
  "nach Await formfremder Capture verhindert Vorschau- und Marker-Erfolg");
await awaitFence.cleanup();

const strictSetup = standardProps();
strictSetup.strict = true;
const strictMode = await mounte(strictSetup);
check(!!knopf(strictMode.container, "analysieren") && strictSetup.ai.calls.filter((call) => call.task === "health").length >= 2,
  "StrictMode-Probe setzt mounted im Effect-Setup zurück und verwirft spätere Async-Ergebnisse nicht dauerhaft");
await strictMode.cleanup();

const markerFehler = markerSetFail();
markerFehler.map.set("vorprobe", "bleiben");
await pruefeKeinenBezahltenAufrufBeiProbeFehler({
  label: "marker.setItem",
  markerStorage: markerFehler,
  expected: "Der sichere Analysenachweis konnte nicht geprüft werden.",
});

const markerReadFail = markerReadFailProbe();
markerReadFail.map.set("vorprobe", "bleiben");
await pruefeKeinenBezahltenAufrufBeiProbeFehler({
  label: "marker.readback",
  markerStorage: markerReadFail,
  expected: "Der sichere Analysenachweis konnte nicht geprüft werden.",
});

const markerRemoveFehler = markerRemoveFail();
markerRemoveFehler.map.set("vorprobe", "bleiben");
await pruefeKeinenBezahltenAufrufBeiProbeFehler({
  label: "marker.removeItem",
  markerStorage: markerRemoveFehler,
  expected: "Der sichere Analysenachweis konnte nicht geprüft werden.",
});

const markerKeinRemove = standardProps({ markerStorage: markerNoRemove() });
const markerNoRemoveFixture = await mounte(markerKeinRemove);
check(!knopf(markerNoRemoveFixture.container, "analysieren")
  && markerNoRemoveFixture.container.textContent.includes("kein sicherer lokaler Analysenachweis"),
  "fehlendes removeItem sperrt den potenziell zahlenden Start vor runTask");
check(anzahlBezahlteAufrufe(markerKeinRemove) === 0,
  "fehlendes removeItem startet keinen KI-Aufruf");
await markerNoRemoveFixture.cleanup();

const abortOffen = deferred();
const abortAi = aiMock({ analyse: () => abortOffen.promise });
const abortSetup = standardProps({ aiObj: abortAi });
const abortFixture = await mounte(abortSetup);
await bestaetigeUndKlicke(abortFixture);
const abortCall = abortAi.calls.find((call) => call.task === "blog-profile-extract");
await act(async () => { knopf(abortFixture.container, "Laufende Analyse abbrechen").click(); await tick(); });
check(abortCall.options.signal.aborted
  && abortFixture.container.textContent.includes("Analyse wurde abgebrochen"),
"sichtbare Abbruchaktion abortiert den laufenden Controller");
await act(async () => { abortOffen.resolve({ data: structuredClone(MODELL) }); await tick(); await tick(); });
check(abortAi.calls.filter((call) => call.task === "blog-profile-extract").length === 1
  && !abortFixture.container.querySelector(".kd-blogprofilanalyse-vorschau")
  && abortSetup.marker.map.size === 0,
"manueller Abbruch übernimmt keine Vorschau, schreibt keinen Marker und startet keinen neuen Auftrag");
await abortFixture.cleanup();

/* Artikelfilter, Hinweis, Checkbox, Payload, Doppelklick, strict response.data und Marker. */
const analyseOffen = deferred();
const analyseAi = aiMock({ analyse: () => analyseOffen.promise });
const filterSetup = standardProps({
  aiObj: analyseAi,
  props: {
    artikelListe: [
      ARTIKEL,
      { ...ARTIKEL_2, herkunft: "gezogen" },
      { ...ARTIKEL_2, id: "doppelt" },
      { ...ARTIKEL_2, id: "doppelt", titel: "Dublette" },
      { ...ARTIKEL_2, id: "zu_lang", text: "x".repeat(18001) },
      { ...ARTIKEL_2, id: "Ungültig" },
    ],
  },
});
const haupt = await mounte(filterSetup);
const optionen = [...haupt.container.querySelectorAll("#blogprofilanalyse-artikel option")];
check(optionen.length === 1 && optionen[0].value === ARTIKEL.id,
  "nur exakt einmalige, eigene und grenzgültige Artikel sind auswählbar");
check(haupt.container.textContent.includes("Einmalig an den KI-Anbieter gesendet:"),
  "sichtbarer Einmal-Hinweis steht unmittelbar vor dem Auftrag");
const consentFeld = haupt.container.querySelector(".kd-blogprofilanalyse-consent-felder");
check(!!consentFeld
  && consentFeld.textContent.includes(`Titel: ${ARTIKEL.titel}`)
  && consentFeld.textContent.includes(`Artikeltext: ${ARTIKEL.text}`)
  && consentFeld.textContent.includes(`Genres: ${JSON.stringify(GENRES)}`)
  && consentFeld.textContent.includes(`Tags: ${JSON.stringify(TAGS)}`),
  "Consent zeigt exakt Titel, Artikeltext und vollständige Genre-/Tag-Listen");
const checkbox = haupt.container.querySelector('input[type="checkbox"]');
const analyseKnopf = knopf(haupt.container, "analysieren");
check(checkbox && analyseKnopf.disabled, "Kostenknopf bleibt bis zur ausdrücklichen Checkbox gesperrt");
await act(async () => { checkbox.click(); await tick(); });
await act(async () => { analyseKnopf.click(); analyseKnopf.click(); await tick(); });
const bezahlteCalls = () => analyseAi.calls.filter((call) => call.task === "blog-profile-extract");
check(bezahlteCalls().length === 1 && analyseKnopf.disabled, "harter Ref-Lock macht Doppelklick zu exakt einem Auftrag");
const auftrag = bezahlteCalls()[0];
check(Object.keys(auftrag.payload).sort().join(",") === "artikel,listen"
  && Object.keys(auftrag.payload.artikel).sort().join(",") === "id,text,titel"
  && Object.keys(auftrag.payload.listen).sort().join(",") === "genres,tags",
"Anbieterauftrag enthält exakt das validierte Artikelpayload");
check(!("prompt" in auftrag.payload) && !("provider" in auftrag.payload) && !("model" in auftrag.payload)
  && !Object.keys(auftrag.options).some((key) => /prompt|provider|model/i.test(key)),
"Browser sendet weder Prompt, Provider noch Modell");
check(auftrag.options.signal instanceof dom.window.AbortSignal, "Auftrag führt ein AbortSignal");
await act(async () => {
  analyseOffen.resolve({
    geschmackszuege: [{ ...MODELL.geschmackszuege[0], beleg: "falsche obere Hülle" }],
    data: structuredClone(MODELL),
  });
  await tick(); await tick();
});
check(haupt.container.textContent.includes("Geschmackszüge") && haupt.container.textContent.includes("Vokabular"),
  "ausschließlich response.data erzeugt die getrennte Vorschau");
check(haupt.container.querySelector('[aria-label="Beleg Geschmackszug 1"]').value === BELEG,
  "strikte Belegvalidierung übernimmt nur einen Nachweis aus dem Artikelsnapshot");
const markerWerte = [...filterSetup.marker.map.values()];
const markerSchluessel = [...filterSetup.marker.map.keys()];
check(markerWerte.length === 1 && !markerWerte[0].includes(ARTIKEL.text)
  && !markerWerte[0].includes(ARTIKEL.titel) && !markerWerte[0].includes(BELEG),
  "account-namespaced Marker speichert niemals Artikeltext, Titel oder Beleg");
check(markerSchluessel.length === 1 && !probeSchluessel(filterSetup.marker).length
  && markerSchluessel[0].endsWith(ACCOUNT_A)
  && !markerSchluessel[0].includes(ARTIKEL.text)
  && !markerSchluessel[0].includes(ARTIKEL.titel),
  "Probe-Key wird entfernt; Analysemarker ist nicht payload-sensitiv und nur auf Konto gebunden");
check(haupt.container.textContent.includes("unveränderte Artikel wurde bereits analysiert"),
  "unveränderter bereits analysierter Artikel wird sichtbar gekennzeichnet");

/* Edit, Revalidierung und getrennte lokale Writer. */
const profilWrites = [];
const vokWrites = [];
let vokVersuch = 0;
await haupt.render({
  onProfilSpeichern: async (wert) => { profilWrites.push(wert); return true; },
  onVokabularSpeichern: async (wert) => { vokWrites.push(wert); vokVersuch++; return vokVersuch === 1 ? false : vokVersuch === 2 ? null : true; },
});
const belegInput = haupt.container.querySelector('[aria-label="Beleg Geschmackszug 1"]');
await act(async () => { setzeWert(belegInput, "Dieser Beleg steht nicht im Artikeltext."); await tick(); });
await act(async () => { knopf(haupt.container, "Geschmacksprofil speichern").click(); await tick(); await tick(); });
check(profilWrites.length === 0 && haupt.container.textContent.includes("Vorschau bleibt erhalten"),
  "ungültiger Edit scheitert an Revalidierung und bewahrt die Vorschau");
await act(async () => { setzeWert(belegInput, BELEG); await tick(); });
await act(async () => { knopf(haupt.container, "Geschmacksprofil speichern").click(); await tick(); await tick(); });
check(profilWrites.length === 1 && knopf(haupt.container, "Geschmacksprofil gespeichert").disabled,
  "Profilgruppe schreibt nach gültigem Edit genau einmal und markiert nur sich als gespeichert");
check(!knopf(haupt.container, "Vokabular speichern").disabled,
  "erfolgreicher Profilwrite blockiert den getrennten Vokabularweg nicht");
await act(async () => { knopf(haupt.container, "Vokabular speichern").click(); await tick(); await tick(); });
check(vokWrites.length === 1 && knopf(haupt.container, "Vokabular lokal erneut speichern"),
  "false bleibt ehrlich als lokaler Teilfehler mit Retry stehen");
const aiVorRetries = bezahlteCalls().length;
await act(async () => { knopf(haupt.container, "Vokabular lokal erneut speichern").click(); await tick(); await tick(); });
check(vokWrites.length === 2 && bezahlteCalls().length === aiVorRetries
  && knopf(haupt.container, "Vokabular lokal erneut speichern"),
"null-Retry ruft nur den fehlenden lokalen Writer auf und behält die Vorschau");
await act(async () => { knopf(haupt.container, "Vokabular lokal erneut speichern").click(); await tick(); await tick(); });
check(vokWrites.length === 3 && profilWrites.length === 1 && bezahlteCalls().length === aiVorRetries,
  "erfolgreicher Retry startet weder KI noch bereits erfolgreichen Profilwriter erneut");
check(haupt.container.textContent.includes("Beide Gruppen wurden gespeichert") && knopf(haupt.container, "Analyse schließen"),
  "klarer Abschluss erscheint erst nach beiden bestätigten Gruppenwrites");

/* Expliziter Rerun: kein Auto-Run nach Marker, erneut Checkbox plus Klick. */
const rerunCheckbox = haupt.container.querySelector('input[type="checkbox"]');
check(knopf(haupt.container, "ausdrücklich erneut analysieren").disabled,
  "Marker startet keinen automatischen Rerun");
await act(async () => { rerunCheckbox.click(); await tick(); });
await act(async () => { knopf(haupt.container, "ausdrücklich erneut analysieren").click(); await tick(); await tick(); });
check(bezahlteCalls().length === aiVorRetries + 1, "unveränderter Artikel läuft nur nach neuer Checkbox und neuem Klick erneut");
await haupt.cleanup();

/* Response.data bleibt strikt: ungültiger Beleg in data darf nicht auf die Bühne. */
const schlechteDaten = structuredClone(MODELL);
schlechteDaten.geschmackszuege[0].beleg = "nicht im eigenen Text vorhandener Beleg";
const strict = await mounte(standardProps({
  aiObj: aiMock({ analyse: () => ({ data: schlechteDaten, ...MODELL }) }),
}));
await bestaetigeUndKlicke(strict);
await warten();
check(!strict.container.querySelector(".kd-blogprofilanalyse-vorschau")
  && strict.container.textContent.includes("sicheren Analyseformat"),
"formfremdes response.data wird trotz brauchbarer oberer Hülle strikt verworfen");
await strict.cleanup();

/* Ein belegtes Nullergebnis bleibt ein vollständiges data-Objekt und erreicht
   den App-Consumer; es wird nicht mit fehlenden oder malformed Daten verwechselt. */
const leer = await mounte(standardProps({
  aiObj: aiMock({ analyse: () => ({ data: { geschmackszuege: [], vokabular: [] } }) }),
}));
await bestaetigeUndKlicke(leer);
await warten();
check(!!leer.container.querySelector(".kd-blogprofilanalyse-vorschau")
  && leer.container.querySelectorAll(".kd-blogprofilanalyse-vorschau fieldset").length === 0
  && !!knopf(leer.container, "Geschmacksprofil speichern")
  && !!knopf(leer.container, "Vokabular speichern"),
"explizit leeres data-Objekt erreicht den App-Consumer als wohldefinierte leere Vorschau");
await leer.cleanup();

/* Konflikte sperren nur ihre Gruppe bis zum Edit; Dedupe bleibt sichtbar. */
const konfliktProfil = profilBasis();
konfliktProfil.signale.push({
  art: "genre", wert: "Drama", richtung: "stoesst_ab", staerke: 2, sicherheit: "mittel",
  quelle: "schlagwort", beleg: "Drama", bestaetigt: ZEIT,
});
const konflikt = await mounte(standardProps({
  props: {
    profil: konfliktProfil,
    vokabular: [{ wort: "Nachtkino", genres: ["Noir"], tags: ["präzise"] }],
  },
}));
await bestaetigeUndKlicke(konflikt);
await warten();
check(konflikt.container.querySelectorAll('[data-status="konflikt"]').length === 2,
  "Dedupe-/Konfliktstatus wird für Profil und Vokabular getrennt sichtbar");
check(knopf(konflikt.container, "Geschmacksprofil speichern").disabled
  && knopf(konflikt.container, "Vokabular speichern").disabled,
"Konflikt sperrt zunächst nur den jeweiligen Gruppenwrite");
await act(async () => {
  setzeWert(konflikt.container.querySelector('[aria-label="Richtung Geschmackszug 1"]'), "stoesst_ab");
  setzeWert(konflikt.container.querySelector('[aria-label="Wort Vokabular 1"]'), "Dunkelkino");
  await tick();
});
check(!knopf(konflikt.container, "Geschmacksprofil speichern").disabled
  && !knopf(konflikt.container, "Vokabular speichern").disabled,
"Bearbeitung öffnet beide Gruppen wieder für die strikte Revalidierung");
await konflikt.cleanup();

/* Teilfehler in Gegenrichtung: Reject im Profil, Vokabular bleibt erfolgreich; Retry nur lokal. */
let profilVersuche = 0;
let vokErfolge = 0;
const gegen = await mounte(standardProps({
  props: {
    onProfilSpeichern: async () => { profilVersuche++; if (profilVersuche === 1) throw new Error("privat"); return true; },
    onVokabularSpeichern: async () => { vokErfolge++; return true; },
  },
}));
await bestaetigeUndKlicke(gegen);
await warten();
await act(async () => { knopf(gegen.container, "Geschmacksprofil speichern").click(); await tick(); await tick(); });
await act(async () => { knopf(gegen.container, "Vokabular speichern").click(); await tick(); await tick(); });
check(profilVersuche === 1 && vokErfolge === 1
  && knopf(gegen.container, "Geschmacksprofil lokal erneut speichern")
  && knopf(gegen.container, "Vokabular gespeichert").disabled,
"Reject im Profil blockiert den unabhängigen erfolgreichen Vokabularwrite nicht");
const gegenAiVorher = gegen.setup.ai.calls.filter((call) => call.task === "blog-profile-extract").length;
await act(async () => { knopf(gegen.container, "Geschmacksprofil lokal erneut speichern").click(); await tick(); await tick(); });
check(profilVersuche === 2 && vokErfolge === 1
  && gegen.setup.ai.calls.filter((call) => call.task === "blog-profile-extract").length === gegenAiVorher,
"Reject-Retry wiederholt ausschließlich den fehlenden Profilwriter");
await gegen.cleanup();

/* Pending Writer: nur seine Gruppe friert ein, Ref-Lock bleibt exakt einmal. */
const saveOffen = deferred();
let saveWriterCalls = 0;
const saveSetup = standardProps({
  props: {
    onProfilSpeichern: () => { saveWriterCalls++; return saveOffen.promise; },
  },
});
const savePending = await mounte(saveSetup);
await bestaetigeUndKlicke(savePending);
await warten();
await act(async () => {
  const speichern = knopf(savePending.container, "Geschmacksprofil speichern");
  speichern.click(); speichern.click(); await tick();
});
const profilGruppe = savePending.container.querySelector('[aria-labelledby="blogprofilanalyse-profil"]');
const vokabularGruppe = savePending.container.querySelector('[aria-labelledby="blogprofilanalyse-vokabular"]');
  const analyseSperreVorher = anzahlBezahlteAufrufe(saveSetup);
  const artikelWahlProfil = savePending.container.querySelector("#blogprofilanalyse-artikel");
  const einwilligungProfil = savePending.container.querySelector('input[type="checkbox"]');
  const analyseKnopfProfil = knopf(savePending.container, "analysieren");
  const alteAuswahlProfil = artikelWahlProfil.value;
  await act(async () => {
    knopf(savePending.container, "analysieren").click();
    await tick();
  });
  check(saveWriterCalls === 1
  && [...profilGruppe.querySelectorAll("input,select")].every((feld) => feld.disabled)
  && [...vokabularGruppe.querySelectorAll("input,select")].every((feld) => !feld.disabled),
  "pending Profilwriter sperrt exakt seine Felder und Doppelklick bleibt ein Write");
  check(artikelWahlProfil.disabled && einwilligungProfil.disabled && analyseKnopfProfil.disabled,
    "während laufendem Profilwriter ist keine neue Analyseauslösung möglich");
  await act(async () => { setzeWert(artikelWahlProfil, ARTIKEL_2.id); await tick(); });
  check(artikelWahlProfil.value === alteAuswahlProfil
    && anzahlBezahlteAufrufe(saveSetup) === analyseSperreVorher,
    "während laufendem Profilwriter ist Auswahl/weiterer Auftrag blockiert");
  await act(async () => {
    await savePending.render({ accountId: ACCOUNT_B });
  });
  check(!savePending.container.querySelector(".kd-blogprofilanalyse-vorschau")
    && anzahlBezahlteAufrufe(saveSetup) === analyseSperreVorher
    && !knopf(savePending.container, "Geschmacksprofil gespeichert")
    && !knopf(savePending.container, "Geschmacksprofil lokal erneut speichern"),
    "Accountwechsel leert sofort alte Vorschau und entfernt gespeicherten/Retry-Status bei offener Profil-Writer-Run");
  await act(async () => {
    await savePending.render({ artikelListe: [{ ...ARTIKEL, text: `${ARTIKEL.text} — kontoübergreifend neu` }, ARTIKEL_2] });
  });
  check(!savePending.container.querySelector(".kd-blogprofilanalyse-vorschau")
    && anzahlBezahlteAufrufe(saveSetup) === analyseSperreVorher
    && !knopf(savePending.container, "Geschmacksprofil gespeichert")
    && !knopf(savePending.container, "Geschmacksprofil lokal erneut speichern"),
    "Payloadwechsel leert sofort alte Vorschau und entfernt gespeicherten/Retry-Status bei offener Profil-Writer-Run");
  await act(async () => {
    await savePending.render({ artikelListe: [ARTIKEL, ARTIKEL_2] });
  });
  await act(async () => { knopf(savePending.container, "analysieren").click(); await tick(); });
  check(anzahlBezahlteAufrufe(saveSetup) === analyseSperreVorher,
    "Laufender Profilwriter blockiert direkte neue Analyseaufrufe auch nach Externpayloadwechsel");
  await act(async () => { saveOffen.resolve(true); await tick(); await tick(); });
  check(!savePending.container.querySelector(".kd-blogprofilanalyse-vorschau")
    && !knopf(savePending.container, "Geschmacksprofil gespeichert")
    && !knopf(savePending.container, "Geschmacksprofil lokal erneut speichern"),
    "alte Profil-Completion setzt keine neue Vorschau oder gespeicherte Gruppe nach Kontextwechsel");
  await act(async () => { setzeWert(savePending.container.querySelector("#blogprofilanalyse-artikel"), ARTIKEL_2.id); await tick(); });
  await act(async () => { savePending.container.querySelector('input[type="checkbox"]').click(); await tick(); });
  const profilNachLock = knopf(savePending.container, "analysieren");
  await act(async () => { profilNachLock.click(); profilNachLock.click(); await tick(); });
  check(anzahlBezahlteAufrufe(saveSetup) === analyseSperreVorher + 1,
    "alte Writercompletion verhindert keine neue Analyse nach Abschluss, startet jedoch neue Aufträge korrekt");
  const profilNachRun = saveSetup.ai.calls.filter((call) => call.task === "blog-profile-extract").at(-1)?.payload?.artikel?.id;
  check(profilNachRun === ARTIKEL_2.id,
    "neue Analyse wird erst nach Writerabschluss und korrekter aktueller Artikelauswahl gestartet");
  await savePending.cleanup();

const vokOffen = deferred();
let vokabularSaveCalls = 0;
const vokabularSaveSetup = standardProps({
  props: {
    onVokabularSpeichern: () => { vokabularSaveCalls++; return vokOffen.promise; },
  },
});
const vokabularPending = await mounte(vokabularSaveSetup);
await bestaetigeUndKlicke(vokabularPending);
await warten();
await act(async () => {
  const speichern = knopf(vokabularPending.container, "Vokabular speichern");
  speichern.click(); speichern.click(); await tick();
});
const vokabularProfilGruppe = vokabularPending.container.querySelector('[aria-labelledby="blogprofilanalyse-profil"]');
const vokabularVokabularGruppe = vokabularPending.container.querySelector('[aria-labelledby="blogprofilanalyse-vokabular"]');
const analyseSperreVorherVok = anzahlBezahlteAufrufe(vokabularSaveSetup);
const artikelWahlVok = vokabularPending.container.querySelector("#blogprofilanalyse-artikel");
const einwilligungVok = vokabularPending.container.querySelector('input[type="checkbox"]');
const analyseKnopfVok = knopf(vokabularPending.container, "analysieren");
const alteAuswahlVok = artikelWahlVok.value;
check(vokabularSaveCalls === 1
  && [...vokabularProfilGruppe.querySelectorAll("input,select")].every((feld) => !feld.disabled)
  && [...vokabularVokabularGruppe.querySelectorAll("input,select")].every((feld) => feld.disabled),
  "pending Vokabularwriter sperrt exakt seine Felder und Doppelklick bleibt ein Write");
check(artikelWahlVok.disabled && einwilligungVok.disabled && analyseKnopfVok.disabled,
  "während laufendem Vokabularwriter ist keine neue Analyseauslösung möglich");
await act(async () => { setzeWert(artikelWahlVok, ARTIKEL_2.id); await tick(); });
check(artikelWahlVok.value === alteAuswahlVok
  && anzahlBezahlteAufrufe(vokabularSaveSetup) === analyseSperreVorherVok,
  "während laufendem Vokabularwriter ist Auswahl/weiterer Auftrag blockiert");
await act(async () => {
  await vokabularPending.render({ accountId: ACCOUNT_B });
});
check(!vokabularPending.container.querySelector(".kd-blogprofilanalyse-vorschau")
  && anzahlBezahlteAufrufe(vokabularSaveSetup) === analyseSperreVorherVok
  && !knopf(vokabularPending.container, "Vokabular gespeichert")
  && !knopf(vokabularPending.container, "Vokabular lokal erneut speichern"),
  "Accountwechsel leert sofort alte Vorschau und entfernt gespeicherten/Retry-Status bei offener Vokabular-Writer-Run");
await act(async () => {
  await vokabularPending.render({ artikelListe: [{ ...ARTIKEL, text: `${ARTIKEL.text} — kontoübergreifend neu` }, ARTIKEL_2] });
});
check(!vokabularPending.container.querySelector(".kd-blogprofilanalyse-vorschau")
  && anzahlBezahlteAufrufe(vokabularSaveSetup) === analyseSperreVorherVok
  && !knopf(vokabularPending.container, "Vokabular gespeichert")
  && !knopf(vokabularPending.container, "Vokabular lokal erneut speichern"),
  "Payloadwechsel leert sofort alte Vorschau und entfernt gespeicherten/Retry-Status bei offener Vokabular-Writer-Run");
await act(async () => {
  await vokabularPending.render({ artikelListe: [ARTIKEL, ARTIKEL_2] });
});
await act(async () => { vokOffen.resolve(true); await tick(); await tick(); });
const vokabularCompletionVorschau = vokabularPending.container.querySelector('.kd-blogprofilanalyse-vorschau');
check(vokabularSaveCalls === 1 && !vokabularCompletionVorschau,
  "alte Vokabular-Completion überschreibt keine neue Vorschau bei Kontextwechsel");
await act(async () => { await vokabularPending.render({ artikelListe: [ARTIKEL, ARTIKEL_2] }); });
await act(async () => { knopf(vokabularPending.container, "analysieren").click(); await tick(); });
check(anzahlBezahlteAufrufe(vokabularSaveSetup) === analyseSperreVorherVok,
  "Laufender Vokabularwriter blockiert direkte neue Analyseaufrufe auch nach Externpayloadwechsel");
await act(async () => { setzeWert(vokabularPending.container.querySelector("#blogprofilanalyse-artikel"), ARTIKEL_2.id); await tick(); });
await act(async () => { vokabularPending.container.querySelector('input[type="checkbox"]').click(); await tick(); });
const vokabularNachLock = knopf(vokabularPending.container, "analysieren");
await act(async () => { vokabularNachLock.click(); vokabularNachLock.click(); await tick(); });
check(anzahlBezahlteAufrufe(vokabularSaveSetup) === analyseSperreVorherVok + 1,
  "neue Analyse startet erst nach Vokabular-Writerabschluss nur mit aktivierter Consent und aktueller Auswahl");
const vokNachRun = vokabularSaveSetup.ai.calls.filter((call) => call.task === "blog-profile-extract").at(-1)?.payload?.artikel?.id;
check(vokNachRun === ARTIKEL_2.id,
  "neue Vokabularanalyse wird nach Abschluss mit zweiter Artikelauswahl korrekt gestartet");
await vokabularPending.cleanup();

/* P1: Ein fehlgeschlagener Retry darf keinen inzwischen neueren Basisstand überschreiben. */
let p1WriterCalls = 0;
const p1Setup = standardProps({
  props: { onVokabularSpeichern: async () => { p1WriterCalls++; return false; } },
});
const p1 = await mounte(p1Setup);
await bestaetigeUndKlicke(p1);
await warten();
const p1AiVorher = p1Setup.ai.calls.filter((call) => call.task === "blog-profile-extract").length;
await act(async () => { knopf(p1.container, "Vokabular speichern").click(); await tick(); await tick(); });
check(p1WriterCalls === 1 && knopf(p1.container, "Vokabular lokal erneut speichern"),
  "fehlgeschlagener Gruppenwrite bietet einen lokalen Retry an");
const inzwischenNeu = [{ wort: "Parallel", genres: ["Action"], tags: ["schnell"] }];
await p1.render({ vokabular: inzwischenNeu });
await act(async () => { knopf(p1.container, "Vokabular lokal erneut speichern").click(); await tick(); await tick(); });
check(p1WriterCalls === 1
  && p1Setup.ai.calls.filter((call) => call.task === "blog-profile-extract").length === p1AiVorher
  && p1.container.textContent.includes("lokale Datenstand hat sich geändert")
  && p1.container.querySelector(".kd-blogprofilanalyse-vorschau"),
"Retry stoppt bei geänderter Basis sichtbar fail-closed, ohne alten Vollstand oder neue KI");
await p1.cleanup();

/* Async-Fences: Account, Artikel, aktiv, Capability, Context und Unmount. */
async function pruefeAnalyseFence(name, mutiere) {
  const offen = deferred();
  const mock = aiMock({ analyse: () => offen.promise });
  const setup = standardProps({ aiObj: mock });
  const fixture = await mounte(setup);
  await bestaetigeUndKlicke(fixture);
  const signal = mock.calls.find((call) => call.task === "blog-profile-extract").options.signal;
  await mutiere({ fixture, setup, mock });
  await warten(35);
  await act(async () => { offen.resolve({ data: structuredClone(MODELL) }); await tick(); await tick(); });
  check(signal.aborted && !fixture.container.querySelector(".kd-blogprofilanalyse-vorschau")
    && setup.marker.map.size === 0, `${name} bricht ab und verwirft die stale Antwort ohne Marker`);
  await fixture.cleanup();
}

await pruefeAnalyseFence("Accountwechsel", ({ fixture }) => fixture.render({ accountId: ACCOUNT_B }));
await pruefeAnalyseFence("Artikelwechsel", ({ fixture }) => fixture.render({ artikelListe: [ARTIKEL, ARTIKEL_2] })
  .then(() => act(async () => {
    setzeWert(fixture.container.querySelector("#blogprofilanalyse-artikel"), ARTIKEL_2.id);
    await tick();
  })));
await pruefeAnalyseFence("aktiv-Widerruf", ({ fixture }) => fixture.render({ aktiv: false }));
await pruefeAnalyseFence("Capabilitywiderruf", ({ fixture }) => {
  const bad = aiMock({ health: altHealth });
  return fixture.render({ ai: bad.api });
});
await pruefeAnalyseFence("Storagekontext-Wechsel", ({ setup }) => { setup.kontext.zustand.current = false; });

const unmountOffen = deferred();
const unmountAi = aiMock({ analyse: () => unmountOffen.promise });
const unmountSetup = standardProps({ aiObj: unmountAi });
const unmountFixture = await mounte(unmountSetup);
await bestaetigeUndKlicke(unmountFixture);
const unmountSignal = unmountAi.calls.find((call) => call.task === "blog-profile-extract").options.signal;
await unmountFixture.cleanup();
await act(async () => { unmountOffen.resolve({ data: structuredClone(MODELL) }); await tick(); });
check(unmountSignal.aborted && unmountSetup.marker.map.size === 0, "Unmount abortiert und verwirft die späte Antwort");

/* Account-/Storagekontext nach lokalem await: kein Scheinerfolg. */
const writeOffen = deferred();
const writeSetup = standardProps({
  props: { onProfilSpeichern: () => writeOffen.promise },
});
const writeFence = await mounte(writeSetup);
await bestaetigeUndKlicke(writeFence);
await warten();
await act(async () => { knopf(writeFence.container, "Geschmacksprofil speichern").click(); await tick(); });
writeSetup.kontext.zustand.current = false;
await act(async () => { writeOffen.resolve(true); await tick(); await tick(); });
check(!knopf(writeFence.container, "Geschmacksprofil gespeichert"),
  "Storagekontext-Wechsel nach await erzeugt keinen Scheinerfolg");
await writeFence.cleanup();

const accountWriteOffen = deferred();
const accountWrite = await mounte(standardProps({
  props: { onVokabularSpeichern: () => accountWriteOffen.promise },
}));
await bestaetigeUndKlicke(accountWrite);
await warten();
await act(async () => { knopf(accountWrite.container, "Vokabular speichern").click(); await tick(); });
await accountWrite.render({ accountId: ACCOUNT_B });
await act(async () => { accountWriteOffen.resolve(true); await tick(); await tick(); });
check(!accountWrite.container.textContent.includes("Vokabular gespeichert"),
  "Accountwechsel nach await erzeugt keinen Erfolg im neuen Konto");
await accountWrite.cleanup();

check(echteFetches === 0 && localStorage.length === 0 && sessionStorage.length === 0,
  "Mocklauf verursacht null echte Fetch-/localStorage-/sessionStorage-Nebeneffekte");

console.log(`\nBlogProfilAnalyse UI: ${checks} Prüfungen grün.`);

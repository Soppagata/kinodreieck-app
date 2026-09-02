import { readFileSync } from "node:fs";
import vm from "node:vm";

const listeners = {};
const speicher = new Map();
const schluessel = (req) => String(req?.url || req);

class FakeCache {
  constructor() { this.eintraege = new Map(); }
  async match(req) { return this.eintraege.get(schluessel(req))?.clone(); }
  async put(req, res) { this.eintraege.set(schluessel(req), res.clone()); }
}

const caches = {
  async open(name) {
    if (!speicher.has(name)) speicher.set(name, new FakeCache());
    return speicher.get(name);
  },
  async keys() { return [...speicher.keys()]; },
  async delete(name) { return speicher.delete(name); },
};

let fetchImpl = async () => { throw new Error("fetch nicht gesetzt"); };
let skipWaitingAufrufe = 0;
let claimAufrufe = 0;
const clientNachrichten = [];
const self = {
  location: { origin: "https://kino.example" },
  registration: { scope: "https://kino.example/" },
  addEventListener(name, fn) { listeners[name] = fn; },
  async skipWaiting() { skipWaitingAufrufe++; },
  clients: {
    async claim() { claimAufrufe++; },
    async matchAll() { return [{ postMessage(nachricht) { clientNachrichten.push(nachricht); } }]; },
  },
};

vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
  self, caches, fetch: (...args) => fetchImpl(...args),
  URL, Response, Request, Headers, Promise, console,
});

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

function anfrage(url, { accept = "", headers = {} } = {}) {
  return {
    url, method: "GET", mode: "same-origin",
    headers: new Headers({ ...(accept ? { Accept: accept } : {}), ...headers }),
  };
}

async function fetchEvent(req) {
  let antwort;
  const hintergrund = [];
  listeners.fetch({
    request: req,
    respondWith(p) { antwort = Promise.resolve(p); },
    waitUntil(p) { hintergrund.push(Promise.resolve(p)); },
  });
  const response = antwort ? await antwort : undefined;
  await Promise.all(hintergrund);
  return response;
}

const AKTUELLER_CACHE = "kd-shell-v3-__KD_BUILD_VERSION__";
fetchImpl = async () => new Response("shell", { status: 200 });
let installation;
listeners.install({ waitUntil(p) { installation = Promise.resolve(p); } });
await installation;
check("Install legt die aktuelle Shell an und übernimmt den Worker ohne Seitennavigation",
  speicher.has(AKTUELLER_CACHE) && skipWaitingAufrufe === 1);

speicher.set("kd-shell-v2-alt", new FakeCache());
speicher.set("kinodreieck-katalog-v1", new FakeCache());
let aktivierung;
listeners.activate({ waitUntil(p) { aktivierung = Promise.resolve(p); } });
await aktivierung;
check("Activate löscht alte App-Shell-Caches und bewahrt nur den aktuellen Build",
  !speicher.has("kd-shell-v2-alt") && speicher.has(AKTUELLER_CACHE));
check("Activate entwertet den alten öffentlichen Katalog-Fallback",
  !speicher.has("kinodreieck-katalog-v1"));
check("Activate übernimmt Clients und meldet die aktive Build-Version",
  claimAufrufe === 1 && clientNachrichten.length === 1
  && clientNachrichten[0].type === "KD_BUILD_ACTIVATED"
  && clientNachrichten[0].buildVersion === "__KD_BUILD_VERSION__");

const shell = await caches.open(AKTUELLER_CACHE);
const jsonReq = anfrage("https://kino.example/programm.json");
await shell.put(jsonReq, new Response('{"stand":"alt"}'));
fetchImpl = async () => new Response('{"stand":"neu"}', { status: 200 });
let res = await fetchEvent(jsonReq);
check("Aktuelle JSON-Daten sind network-only", (await res.json()).stand === "neu");
check("JSON-Antworten überschreiben keinen historischen Shell-Eintrag",
  (await (await shell.match(jsonReq)).json()).stand === "alt");

fetchImpl = async () => { throw new Error("offline"); };
let jsonOfflineFehler = null;
try { await fetchEvent(jsonReq); } catch (error) { jsonOfflineFehler = error; }
check("JSON fällt offline nicht auf einen alten öffentlichen Cache zurück",
  jsonOfflineFehler?.message === "offline");

const metaReq = anfrage("https://kino.example/build-meta.json?kd-check=1");
await shell.put(metaReq, new Response('{"buildVersion":"alt"}'));
fetchImpl = async () => new Response('{"buildVersion":"neu"}', { status: 200 });
res = await fetchEvent(metaReq);
check("Build-Metadaten sind immer network-only", (await res.json()).buildVersion === "neu");
check("Build-Metadaten werden nie in der alten Shell festgehalten",
  (await (await shell.match(metaReq)).json()).buildVersion === "alt");

const apiReq = anfrage("https://kino.example/api/session", {
  headers: { Authorization: "Bearer browser-session" },
});
await shell.put(apiReq, new Response("veraltet"));
fetchImpl = async () => new Response("frisch", { status: 200 });
res = await fetchEvent(apiReq);
check("Auth/API-Anfragen sind network-only", (await res.text()) === "frisch");
check("Auth/API-Antworten landen nicht im Shell-Cache",
  (await (await shell.match(apiReq)).text()) === "veraltet");

/* Etappe 3: beide Erkennungswege getrennt prüfen. Der Fall oben erfüllt Pfad UND
   Header gleichzeitig — fiele einer der beiden Zweige weg, bliebe er trotzdem grün. */
const authPfad = anfrage("https://kino.example/auth/v1/token");
await shell.put(authPfad, new Response("veraltet"));
fetchImpl = async () => new Response("frisch", { status: 200 });
res = await fetchEvent(authPfad);
check("Anmeldepfade sind auch ohne Auth-Header network-only", (await res.text()) === "frisch");
check("Anmeldeantworten landen nicht im Shell-Cache",
  (await (await shell.match(authPfad)).text()) === "veraltet");

const apikeyReq = anfrage("https://kino.example/daten.json", { headers: { apikey: "sb_publishable_test" } });
await shell.put(apikeyReq, new Response("veraltet"));
res = await fetchEvent(apikeyReq);
check("Anfragen mit Datenbank-Schlüssel sind network-only", (await res.text()) === "frisch");

const offlineStart = anfrage("https://kino.example/", {
  accept: "text/html",
  headers: { "x-kd-offline-probe": "1", "cache-control": "no-store" },
});
await shell.put("https://kino.example/", new Response("offline-shell", { status: 200 }));
let offlineNetzaufrufe = 0;
fetchImpl = async () => { offlineNetzaufrufe++; throw new Error("offline-probe-must-not-fetch"); };
res = await fetchEvent(offlineStart);
check("Android-Diagnose lädt die Start-URL kontrolliert nur aus der App-Shell",
  (await res.text()) === "offline-shell" && offlineNetzaufrufe === 0);

const fremd = await fetchEvent(anfrage("https://api.github.com/repos/demo"));
check("Fremde Origins werden vom Service Worker nicht abgefangen", fremd === undefined);
const fremdAuth = await fetchEvent(anfrage("https://projekt.supabase.co/auth/v1/token"));
check("Die Anmeldung beim Datenbankanbieter läuft am Service Worker vorbei", fremdAuth === undefined);

console.log(`SERVICE-WORKER-TEST BESTANDEN (${ok}/${ok})`);

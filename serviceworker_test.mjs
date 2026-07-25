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
const self = {
  location: { origin: "https://kino.example" },
  registration: { scope: "https://kino.example/" },
  addEventListener(name, fn) { listeners[name] = fn; },
  async skipWaiting() {},
  clients: { async claim() {} },
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

speicher.set("kd-shell-v2", new FakeCache());
speicher.set("kd-shell-v3", new FakeCache());
speicher.set("kinodreieck-katalog-v1", new FakeCache());
let aktivierung;
listeners.activate({ waitUntil(p) { aktivierung = Promise.resolve(p); } });
await aktivierung;
check("Activate löscht nur alte App-Shell-Caches",
  !speicher.has("kd-shell-v2") && speicher.has("kd-shell-v3"));
check("Activate bewahrt den getrennten Katalog-Fallback",
  speicher.has("kinodreieck-katalog-v1"));

const shell = await caches.open("kd-shell-v3");
const jsonReq = anfrage("https://kino.example/programm.json");
await shell.put(jsonReq, new Response('{"stand":"alt"}'));
fetchImpl = async () => new Response('{"stand":"neu"}', { status: 200 });
let res = await fetchEvent(jsonReq);
check("Aktuelle JSON-Daten sind network-first", (await res.json()).stand === "neu");

fetchImpl = async () => { throw new Error("offline"); };
res = await fetchEvent(jsonReq);
check("JSON fällt offline auf den letzten gültigen Stand zurück", (await res.json()).stand === "neu");

const apiReq = anfrage("https://kino.example/api/session", {
  headers: { Authorization: "Bearer browser-session" },
});
await shell.put(apiReq, new Response("veraltet"));
fetchImpl = async () => new Response("frisch", { status: 200 });
res = await fetchEvent(apiReq);
check("Auth/API-Anfragen sind network-only", (await res.text()) === "frisch");
check("Auth/API-Antworten landen nicht im Shell-Cache",
  (await (await shell.match(apiReq)).text()) === "veraltet");

const fremd = await fetchEvent(anfrage("https://api.github.com/repos/demo"));
check("Fremde Origins werden vom Service Worker nicht abgefangen", fremd === undefined);

console.log(`SERVICE-WORKER-TEST BESTANDEN (${ok}/${ok})`);

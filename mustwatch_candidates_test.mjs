import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { runtimeConfig } from "./src/config/runtime.js";
import {
  buildMustwatchProgramCandidates, candidateRefreshDelay, collectMustwatchStreamingIds,
  useMustwatchCandidatesController,
} from "./src/controllers/useMustwatchCandidatesController.js";
import { createMustwatchCandidatesService } from "./src/services/mustwatchCandidates.js";

function createAuth(accountId = "account-a") {
  let snapshot = {
    mode: "account", state: "ready", account: { id: accountId },
    capabilities: { remoteStorage: true },
  };
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setAccount(id) {
      snapshot = id ? { ...snapshot, account: { id } }
        : { mode: "guest", state: "ready", account: null, capabilities: { remoteStorage: false } };
      for (const listener of listeners) listener(snapshot);
    },
  };
}

const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; },
});

let now = Date.parse("2026-09-14T10:00:00.000Z");
const baseUrl = runtimeConfig.supabaseUrl || "https://kinodreieck.test";
const auth = createAuth();
const calls = [];
const pending = new Map();
const fetchImpl = async (_url, options) => {
  const request = JSON.parse(options.body).p_request;
  calls.push({ request, authorization: options.headers.Authorization });
  if (request.query.startsWith("slow") || request.ids.includes("slow-id")) {
    return await new Promise((resolve, reject) => {
      const finish = () => reject(abortError());
      options.signal?.addEventListener("abort", finish, { once: true });
      pending.set(request.query || request.ids[0], { resolve, reject });
    });
  }
  const ids = request.ids.length ? request.ids : [`search:${request.query}`];
  return response({
    format: 1, status: "ready", version: "fixture-1",
    expiresAt: new Date(now + 1000).toISOString(),
    items: ids.map((id) => ({
      id, titel: `Titel ${id}`, dienste: ["MUBI"],
      streaming_aliases: id === "legacy" ? ["legacy"] : [],
      notiz: "darf die Grenze nicht verlassen", bewertung: 5,
    })),
  });
};
const service = createMustwatchCandidatesService({
  auth,
  driver: { getAccessToken: async ({ erwarteteKontoId }) => `token-${erwarteteKontoId}` },
  getConnection: () => ({ url: baseUrl, key: "public-test-key" }),
  fetchImpl,
  now: () => now,
});

assert.deepEqual(collectMustwatchStreamingIds([
  { verknuepfung: { ziel: "streaming", id: 7 } },
  { verknuepfung: { ziel: "master", id: "x" } },
  { verknuepfung: { ziel: "streaming", id: "7" } },
  { verknuepfung: null },
]), ["7"]);
assert.equal(candidateRefreshDelay({ status: "unavailable", expiresAt: new Date(now - 1).toISOString() }, now), null);
assert.equal(candidateRefreshDelay({ status: "ready", expiresAt: new Date(now + 123).toISOString() }, now), 123);
assert.deepEqual(buildMustwatchProgramCandidates({ filme: [{ t: "Ohne ID", j: 2026 }] }), [{
  t: "Ohne ID", j: 2026, id: null, projection_id: "auto:ohne_id_2026",
  titel: "Ohne ID", originaltitel: undefined, jahr: 2026,
}]);

const ids = Array.from({ length: 501 }, (_, index) => `id-${index}`);
const first = await service.loadByIds(ids);
assert.equal(first.items.length, 501);
assert.equal(calls.length, 2, "501 IDs werden in genau zwei seriellen RPCs geladen");
assert.deepEqual(calls.map((call) => call.request.ids.length), [500, 1]);
assert.ok(calls.every((call) => call.request.query === "" && call.request.limit === 6));
assert.ok(calls.every((call) => call.authorization === "Bearer token-account-a"));
assert.equal(Object.hasOwn(first.items[0], "notiz"), false);
assert.equal(Object.hasOwn(first.items[0], "bewertung"), false);

await service.loadByIds(ids);
assert.equal(calls.length, 2, "frischer kontogebundener Sitzungscache vermeidet Doppelreads");
now += 2000;
await service.loadByIds([ids[0]]);
assert.equal(calls.length, 3, "abgelaufene Antworten werden nicht aus dem Sitzungscache behauptet");

const searchOne = await service.search("Solaris");
assert.equal(searchOne.items[0].id, "search:Solaris");
const afterSearch = calls.length;
await service.search("Solaris");
assert.equal(calls.length, afterSearch, "identische frische Pickersuche nutzt den begrenzten Querycache");
assert.deepEqual(calls.at(-1).request, { format: 1, ids: [], query: "Solaris", limit: 6 });

const slowSearch = service.search("slow-a");
await Promise.resolve();
const fastSearch = service.search("Stalker");
await assert.rejects(slowSearch, (error) => error?.reason === "timeout");
assert.equal((await fastSearch).items[0].id, "search:Stalker");

const accountBound = service.loadByIds(["slow-id"]);
await Promise.resolve();
auth.setAccount("account-b");
await assert.rejects(accountBound);
const accountB = await service.loadByIds(["account-b-id"]);
assert.equal(accountB.items[0].id, "account-b-id");
assert.equal(calls.at(-1).authorization, "Bearer token-account-b");

service.destroy();

let ttlNow = now;
let ttlCalls = 0;
const ttlService = createMustwatchCandidatesService({
  auth: createAuth("ttl-account"),
  driver: { getAccessToken: async () => "token" },
  getConnection: () => ({ url: baseUrl, key: "public-test-key" }),
  now: () => ttlNow,
  cacheTtlMs: 50,
  fetchImpl: async (_url, options) => {
    ttlCalls += 1;
    const id = JSON.parse(options.body).p_request.ids[0];
    return response({
      format: 1, status: "ready", version: "ttl-v1",
      expiresAt: new Date(ttlNow + 86_400_000).toISOString(),
      items: [{ id, titel: "TTL", dienste: [] }],
    });
  },
});
await ttlService.loadByIds(["ttl-id"]);
ttlNow += 49;
await ttlService.loadByIds(["ttl-id"]);
assert.equal(ttlCalls, 1, "Remote-Frische verlängert den lokalen Sitzungscache nicht");
ttlNow += 2;
await ttlService.loadByIds(["ttl-id"]);
assert.equal(ttlCalls, 2, "Lokale Cachefrist erzwingt bei Rückkehr eine neue Prüfung");
await assert.rejects(
  ttlService.loadByIds(Array.from({ length: 5001 }, (_, index) => `zu-viel-${index}`)),
  (error) => error?.reason === "mustwatch-ids-bounded" && error?.retryable === false,
);
assert.equal(ttlCalls, 2, "Mehr als 5000 IDs werden nicht still teilweise angefragt");
ttlService.destroy();

let versionCalls = 0;
const versionService = createMustwatchCandidatesService({
  auth: createAuth("version-account"),
  driver: { getAccessToken: async () => "token" },
  getConnection: () => ({ url: baseUrl, key: "public-test-key" }),
  fetchImpl: async (_url, options) => {
    versionCalls += 1;
    const request = JSON.parse(options.body).p_request;
    const version = request.ids.includes("version-500") ? "catalog-v2" : "catalog-v1";
    return response({
      format: 1, status: "ready", version,
      expiresAt: "2099-01-01T00:00:00.000Z",
      items: request.ids.map((id) => ({ id, titel: id, dienste: [] })),
    });
  },
});
await assert.rejects(
  versionService.loadByIds(Array.from({ length: 501 }, (_, index) => `version-${index}`)),
  (error) => error?.reason === "catalog-version-mismatch",
);
await versionService.loadByIds(["version-0"]);
assert.equal(versionCalls, 3, "Versionsmischung verwirft bereits geladene Chunks statt sie weiterzugeben");
versionService.destroy();

let aliasCalls = 0;
const aliasService = createMustwatchCandidatesService({
  auth: createAuth("alias-account"),
  driver: { getAccessToken: async () => "token" },
  getConnection: () => ({ url: baseUrl, key: "public-test-key" }),
  fetchImpl: async (_url, options) => {
    aliasCalls += 1;
    const requested = JSON.parse(options.body).p_request.ids[0];
    const items = requested === "exakt" ? [
      { id: "alias-zuerst", titel: "Falsch", dienste: [], streaming_aliases: ["exakt"] },
      { id: "exakt", titel: "Richtig", dienste: [], streaming_aliases: [] },
    ] : requested === "geteilt" ? [
      { id: "eins", titel: "Eins", dienste: [], streaming_aliases: ["geteilt"] },
      { id: "zwei", titel: "Zwei", dienste: [], streaming_aliases: ["geteilt"] },
    ] : [{ id: "kanonisch", titel: "Kanonisch", dienste: [], streaming_aliases: ["ungefragt"] }];
    return response({
      format: 1, status: "ready", version: "alias-v1",
      expiresAt: "2099-01-01T00:00:00.000Z", items,
    });
  },
});
assert.deepEqual((await aliasService.loadByIds(["exakt"])).items.map((item) => item.titel), ["Richtig"]);
assert.deepEqual((await aliasService.loadByIds(["geteilt"])).items, [], "Mehrdeutige Aliase bleiben negativ");
await aliasService.loadByIds(["angefragt"]);
await aliasService.loadByIds(["ungefragt"]);
assert.equal(aliasCalls, 4, "Unangefragte Aliase werden nicht blind positiv gecacht");
aliasService.destroy();

const stubborn = new Map();
let stubbornCalls = 0;
const stubbornService = createMustwatchCandidatesService({
  auth: createAuth("stubborn-account"),
  driver: { getAccessToken: async () => "token" },
  getConnection: () => ({ url: baseUrl, key: "public-test-key" }),
  fetchImpl: async (_url, options) => {
    stubbornCalls += 1;
    const query = JSON.parse(options.body).p_request.query;
    return await new Promise((resolve) => stubborn.set(query, resolve));
  },
});
const alteSuche = stubbornService.search("alt");
await Promise.resolve();
const neueSuche = stubbornService.search("neu");
await Promise.resolve();
stubborn.get("neu")(response({
  format: 1, status: "ready", version: "stubborn-v1", expiresAt: "2099-01-01T00:00:00.000Z",
  items: [{ id: "neu", titel: "Neu", dienste: [] }],
}));
assert.equal((await neueSuche).items[0].id, "neu");
stubborn.get("alt")(response({
  format: 1, status: "ready", version: "stubborn-v1", expiresAt: "2099-01-01T00:00:00.000Z",
  items: [{ id: "alt", titel: "Alt", dienste: [] }],
}));
await assert.rejects(alteSuche);
const altNochmal = stubbornService.search("alt");
await Promise.resolve();
assert.equal(stubbornCalls, 3, "Verspätete abgebrochene Suche schreibt keinen Querycache");
stubborn.get("alt")(response({
  format: 1, status: "ready", version: "stubborn-v1", expiresAt: "2099-01-01T00:00:00.000Z",
  items: [{ id: "alt", titel: "Alt", dienste: [] }],
}));
await altNochmal;
stubbornService.destroy();

const dom = new JSDOM("<!doctype html><html><body><main id='app'></main></body></html>", {
  url: "https://kinodreieck.test/",
});
for (const name of ["window", "document", "HTMLElement", "Element", "Node"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let controllerLoads = 0;
const retryService = {
  async loadByIds() {
    controllerLoads += 1;
    if (controllerLoads === 1) return {
      status: "ready", expiresAt: new Date(Date.now() + 25).toISOString(),
      items: [{ id: "controller-id", titel: "Controller", dienste: [] }],
    };
    return { status: "unavailable", expiresAt: new Date(Date.now() - 1000).toISOString(), items: [] };
  },
  async search() { return { status: "ready", items: [] }; },
};
function Probe(props) {
  const result = useMustwatchCandidatesController(props);
  return React.createElement("output", {
    "data-streaming": result.kandidaten.streaming.map((item) => item.id).join(","),
    "data-programm": result.kandidaten.programm.map((item) => item.projection_id).join(","),
  });
}
const root = createRoot(document.getElementById("app"));
const controllerProps = {
  entries: [{ verknuepfung: { ziel: "streaming", id: "controller-id" } }],
  contextKey: "account:closed", service: retryService,
};
await act(async () => {
  root.render(React.createElement(Probe, { ...controllerProps, active: false }));
  await new Promise((resolve) => setTimeout(resolve, 5));
});
assert.equal(controllerLoads, 0, "Geschlossener Must-Watch-Bereich startet keinen Hintergrund-RPC");
await act(async () => {
  root.render(React.createElement(Probe, { ...controllerProps, active: true }));
  await Promise.resolve();
});
assert.equal(controllerLoads, 1);
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 45)); });
assert.equal(controllerLoads, 2, "Ablauf einer ready-Antwort revalidiert genau einmal");
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 35)); });
assert.equal(controllerLoads, 2, "Unavailable mit vergangenem Ablauf startet keine Wiederholschleife");

await act(async () => {
  root.render(React.createElement(Probe, {
    entries: [], contextKey: "account:programm", active: false, service: retryService,
    programm: { filme: [{ t: "Nur Projektion", j: 2026 }] },
    programmExpiresAt: Date.now() + 25,
  }));
  await Promise.resolve();
});
assert.equal(document.querySelector("output").dataset.programm, "auto:nur_projektion_2026");
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 35)); });
assert.equal(document.querySelector("output").dataset.programm, "",
  "Offenes Programm läuft anhand gueltigBis aus, ohne Auto-Slug als stabile ID zu verwenden");

const stalePending = new Map();
const staleService = {
  loadByIds(ids) { return new Promise((resolve) => stalePending.set(ids[0], resolve)); },
  async search() { return { status: "ready", items: [] }; },
};
await act(async () => {
  root.render(React.createElement(Probe, {
    entries: [{ verknuepfung: { ziel: "streaming", id: "alt-id" } }],
    contextKey: "account:alt", active: true, service: staleService,
  }));
  await Promise.resolve();
});
await act(async () => {
  root.render(React.createElement(Probe, {
    entries: [{ verknuepfung: { ziel: "streaming", id: "neu-id" } }],
    contextKey: "account:neu", active: true, service: staleService,
  }));
  await Promise.resolve();
});
await act(async () => {
  stalePending.get("neu-id")({ status: "ready", expiresAt: null, items: [{ id: "neu-id", titel: "Neu", dienste: [] }] });
  await Promise.resolve();
});
assert.equal(document.querySelector("output").dataset.streaming, "neu-id");
await act(async () => {
  stalePending.get("alt-id")({ status: "ready", expiresAt: null, items: [{ id: "alt-id", titel: "Alt", dienste: [] }] });
  await Promise.resolve();
});
assert.equal(document.querySelector("output").dataset.streaming, "neu-id",
  "Verspätete alte Lookups überschreiben den neueren Konto-/Querykontext nicht");
await act(async () => { root.unmount(); await Promise.resolve(); });
dom.window.close();

const missingService = createMustwatchCandidatesService({
  auth,
  driver: { getAccessToken: async () => "token" },
  getConnection: () => ({ url: baseUrl, key: "public-test-key" }),
  fetchImpl: async () => response({
    code: "PGRST202", message: "Could not find kd_mustwatch_streaming_candidates in the schema cache",
  }, 404),
});
await assert.rejects(
  missingService.loadByIds(["one"]),
  (error) => error?.code === "not-implemented" && error?.reason === "mustwatch-candidates-rpc-missing",
);
missingService.destroy();

console.log("Must-Watch-Kandidaten-Service und -Controller: fokussierte Checks bestanden.");

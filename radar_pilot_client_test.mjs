import assert from "node:assert/strict";
import fs from "node:fs";

const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.has(key) ? local.get(key) : null,
  setItem: (key, value) => { local.set(key, String(value)); },
  removeItem: (key) => { local.delete(key); },
};

const C = await import("./src/lib/radarPilotContracts.js");
const R = await import("./src/lib/localEventRadar.js");
const S = await import("./src/services/radarPilot.js");

let checks = 0;
async function check(name, run) {
  await run();
  checks += 1;
  console.log(`✓ ${name}`);
}

const instant = "2026-08-14T08:00:00.000Z";
const later = "2026-08-14T08:01:00.000Z";
const checksumA = "a".repeat(64);
const checksumB = "b".repeat(64);
const operationId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const eventVersionId = "33333333-3333-4333-8333-333333333333";
const targetId = "work:tmdb:550";

const subscriptionAck = (extra = {}) => ({
  operationId, targetId, status: "active", revision: 1, checksum: checksumA, ...extra,
});
const event = (extra = {}) => ({
  eventId, eventVersionId, targetId, eventType: "kinostart_at", date: "2026-08-20",
  region: "AT", platform: "-", lifecycleStatus: "scheduled", verificationStatus: "confirmed",
  ...extra,
});
const feed = (extra = {}) => ({
  format: "kd-radar-pilot-feed-v1", revision: 1, checksum: checksumA,
  reconciledAt: instant,
  subscriptions: [{
    targetId, targetType: "work", title: "Fight Club", region: "AT", scope: "all",
    status: "active", updatedAt: instant,
  }],
  events: [event()], receipts: [], operationAcks: [], radarReview: false, ...extra,
});
const importPayload = (extra = {}) => ({
  targetKey: targetId, eventType: "kinostart_at", date: "2026-08-20", region: "AT", platform: "-",
  evidence: [
    { sourceId: "source:official", url: "https://example.test/official", retrievedAt: instant },
    { sourceId: "source:editorial", url: "https://example.test/editorial", retrievedAt: later },
  ],
  ...extra,
});
const importResult = (extra = {}) => ({
  eventId, eventVersionId, targetId, eventType: "kinostart_at", date: "2026-08-20",
  region: "AT", platform: "-", ...extra,
});

await check("Alle Pilot-Dokumente verlangen exakt ihre kanonischen Keysets", () => {
  assert.equal(C.validateRadarPilotSubscriptionAck(subscriptionAck()).ok, true);
  assert.equal(C.validateRadarPilotSubscriptionAck(subscriptionAck({ accountId: "verboten" })).ok, false);
  assert.equal(C.validateRadarPilotImportPayload(importPayload()).ok, true);
  assert.equal(C.validateRadarPilotImportPayload(importPayload({ provider: "verboten" })).ok, false);
  assert.equal(C.validateRadarPilotImportResult(importResult()).ok, true);
  assert.equal(C.validateRadarPilotImportResult(importResult({ evidence: [] })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed()).ok, true);
  assert.equal(C.validateRadarPilotFeed(feed({ subscriberId: "verboten" })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({
    subscriptions: [{ ...feed().subscriptions[0], accountId: "verboten" }],
  })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({ events: [{ ...event(), publisher: "verboten" }] })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({
    receipts: [{ eventVersionId, status: "seen", updatedAt: instant, evidence: [] }],
  })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({
    operationAcks: [{ ...subscriptionAck(), title: "verboten" }],
  })).ok, false);
});

await check("Importplattform folgt exakt dem E16A1-Eventtypvertrag", () => {
  assert.equal(C.validateRadarPilotImportPayload(importPayload({
    eventType: "streamingstart_at", platform: "Netflix",
  })).ok, true);
  assert.equal(C.validateRadarPilotImportPayload(importPayload({
    eventType: "streamingstart_at", platform: "-",
  })).ok, false);
  assert.equal(C.validateRadarPilotImportPayload(importPayload({ platform: "Netflix" })).ok, false);
  assert.equal(C.validateRadarPilotImportPayload(importPayload({ evidence: [importPayload().evidence[0]] })).ok, false);
});

function queuedAccountState() {
  return R.queueAccountRadarChange(R.createEmptyLocalRadar({ authority: "account-cache" }), {
    operationId, action: "upsert",
    target: { targetId, targetType: "work", targetStatus: "active", title: "Fight Club", canonical: true },
    now: instant,
  }).state;
}

function response(status, payload, { bodyHook = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      if (bodyHook) await bodyHook();
      return payload === undefined ? "" : JSON.stringify(payload);
    },
  };
}

function harness({
  enabled = true, mode = "account", state = queuedAccountState(), fetchImpl = null,
  tokenHook = null, persistHook = null,
} = {}) {
  const enabledFlag = Object.hasOwn(arguments[0] || {}, "enabled") ? arguments[0].enabled : true;
  let current = state;
  let session = Object.freeze({ mode, state: "ready", account: mode === "account" ? { id: "account-a" } : null });
  let accountId = mode === "account" ? "account-a" : null;
  let driver = "account-driver-a";
  let generation = 7;
  let tokenBinding = "token-a";
  const calls = [];
  let activeFetches = 0;
  let maxFetches = 0;
  const transport = fetchImpl || (async (url, init) => {
    calls.push({ url, init, rpc: url.split("/").at(-1), body: JSON.parse(init.body) });
    activeFetches += 1;
    maxFetches = Math.max(maxFetches, activeFetches);
    activeFetches -= 1;
    if (url.endsWith("kd_radar_pilot_set_subscription")) return response(200, subscriptionAck());
    if (url.endsWith("kd_radar_pilot_feed")) return response(200, feed());
    if (url.endsWith("kd_radar_pilot_set_receipt")) return response(204, undefined);
    if (url.endsWith("kd_radar_pilot_import_event")) return response(200, importResult());
    throw new Error("unexpected rpc");
  });
  const context = {
    generation,
    name: driver,
    owner: "account:account-a",
    isCurrent: () => driver === context.name && generation === context.generation,
  };
  const service = S.createRadarPilotService({
    config: {
      radarPilotClientEnabled: enabledFlag,
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable-test-key",
    },
    auth: { getSnapshot: () => session },
    getAccount: () => accountId ? { id: accountId } : null,
    getAccessToken: async ({ erwarteteKontoId }) => {
      assert.equal(erwarteteKontoId, "account-a");
      if (tokenHook) await tokenHook();
      return "token-a";
    },
    captureContext: () => context,
    isTokenCurrent: (token, expectedAccountId) => token === tokenBinding && expectedAccountId === accountId,
    fetchImpl: transport,
    now: () => instant,
  });
  const persist = async (next) => {
    const beforePersist = { session, accountId, driver, generation, tokenBinding };
    if (persistHook) await persistHook();
    if (session !== beforePersist.session || accountId !== beforePersist.accountId
        || driver !== beforePersist.driver || generation !== beforePersist.generation
        || tokenBinding !== beforePersist.tokenBinding) return false;
    current = next;
    return true;
  };
  return {
    service, calls, persist, get state() { return current; }, get maxFetches() { return maxFetches; },
    changeSession() { session = Object.freeze({ ...session }); },
    changeAccount(value = "account-b") { accountId = value; },
    changeDriver() { driver = "account-driver-b"; },
    changeGeneration() { generation += 1; },
    changeToken() { tokenBinding = "token-b"; },
  };
}

for (const enabled of [false, undefined]) {
  await check(`Flag ${String(enabled)} erzeugt trotz Outbox null Aufrufe aller vier Pilot-RPCs`, async () => {
    const h = harness({ enabled });
    const result = await h.service.sync({ state: h.state, persist: h.persist });
    assert.equal(result.status, "disabled");
    assert.equal(h.calls.length, 0);
    for (const rpc of S.RADAR_PILOT_RPCS) assert.equal(h.calls.some((call) => call.rpc === rpc), false);
  });
}

await check("Gast erzeugt null Aufrufe aller vier Pilot-RPCs", async () => {
  const h = harness({ mode: "guest" });
  const result = await h.service.sync({ state: h.state, persist: h.persist });
  assert.equal(result.status, "guest");
  assert.equal(h.calls.length, 0);
  for (const rpc of S.RADAR_PILOT_RPCS) assert.equal(h.calls.some((call) => call.rpc === rpc), false);
});

await check("Subscription-Outbox läuft seriell mit maximaler Parallelität eins", async () => {
  let state = queuedAccountState();
  state = R.queueAccountRadarChange(state, {
    operationId: "44444444-4444-4444-8444-444444444444", action: "pause",
    target: { targetId: "series:tmdb:1396", targetType: "series", targetStatus: "active", title: "Breaking Bad", canonical: true },
    now: later,
  }).state;
  const bodies = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const h = harness({
    state,
    fetchImpl: async (url, init) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      const body = JSON.parse(init.body); bodies.push({ url, body });
      if (url.endsWith("kd_radar_pilot_set_subscription")) {
        activeRequests -= 1;
        return response(200, subscriptionAck({
          operationId: body.p_operation_id, targetId: body.p_target_key,
          status: body.p_status, revision: bodies.length, checksum: checksumA,
        }));
      }
      activeRequests -= 1;
      return response(200, feed({ subscriptions: [], events: [] }));
    },
  });
  const result = await h.service.sync({ state: h.state, persist: h.persist });
  assert.equal(result.status, "ready");
  assert.equal(maxActiveRequests, 1);
  assert.equal(bodies.filter((entry) => entry.url.endsWith("set_subscription")).length, 2);
  assert.equal(h.state.outbox.length, 0);
});

await check("Verlorene Antwort hält dieselbe operationId pending und Feed-Ack schließt sie später", async () => {
  const ids = [];
  let first = true;
  const h = harness({
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      if (url.endsWith("kd_radar_pilot_set_subscription")) {
        ids.push(body.p_operation_id);
        if (first) { first = false; throw new TypeError("network lost"); }
        return response(200, subscriptionAck());
      }
      return response(200, feed({ operationAcks: first ? [] : [subscriptionAck()] }));
    },
  });
  const lost = await h.service.sync({ state: h.state, persist: h.persist });
  assert.equal(lost.status, "pending");
  assert.equal(h.state.outbox[0].operationId, operationId);
  const recovered = await h.service.sync({ state: h.state, persist: h.persist });
  assert.equal(recovered.status, "ready");
  assert.deepEqual(ids, [operationId]);
  assert.equal(h.state.outbox.length, 0);
});

for (const [name, mutate, stage] of [
  ["Sitzungszaun", (h) => h.changeSession(), "fetch"],
  ["Accountzaun", (h) => h.changeAccount(), "fetch"],
  ["Treiberzaun", (h) => h.changeDriver(), "body"],
  ["Generationszaun", (h) => h.changeGeneration(), "persist"],
  ["Tokenzaun", (h) => h.changeToken(), "token"],
]) {
  await check(`${name} verwirft Kontextwechsel während await ohne Cachemutation`, async () => {
    let h;
    const before = queuedAccountState();
    const hook = async () => { mutate(h); };
    h = harness({
      state: before,
      tokenHook: stage === "token" ? hook : null,
      persistHook: stage === "persist" ? hook : null,
      fetchImpl: async (url, init) => {
        h.calls.push({ url, init, rpc: url.split("/").at(-1), body: JSON.parse(init.body) });
        if (stage === "fetch") await hook();
        return response(200, url.endsWith("kd_radar_pilot_feed") ? feed() : subscriptionAck(), {
          bodyHook: stage === "body" ? hook : null,
        });
      },
    });
    const result = await h.service.sync({ state: h.state, persist: h.persist });
    assert.equal(result.status, "context-changed");
    assert.equal(h.state, before);
  });
}

await check("Terminale Fachablehnung markiert nur die Operation rejected", async () => {
  const h = harness({ fetchImpl: async (url) => url.endsWith("kd_radar_pilot_feed")
    ? response(200, feed())
    : response(400, { code: "23514", message: "radar_quota_exceeded" }) });
  const result = await h.service.sync({ state: h.state, persist: h.persist });
  assert.equal(result.status, "rejected");
  assert.equal(h.state.outbox[0].status, "rejected");
  assert.equal(h.state.outbox[0].reason, "radar_quota_exceeded");
});

for (const [name, reply] of [
  ["5xx", async () => response(503, { code: "server" })],
  ["unbekannte Antwort", async () => response(400, { mystery: true })],
  ["Netzfehler", async () => { throw new TypeError("offline"); }],
]) {
  await check(`${name} erhält pending und stoppt den Lauf`, async () => {
    const h = harness({ fetchImpl: async (url) => url.endsWith("kd_radar_pilot_feed")
      ? response(200, feed())
      : reply() });
    const result = await h.service.sync({ state: h.state, persist: h.persist });
    assert.equal(result.status, "pending");
    assert.equal(h.state.outbox[0].status, "pending");
  });
}

await check("Fehlender RPC wird pilot-unavailable ohne Outboxlöschung", async () => {
  const h = harness({ fetchImpl: async () => response(404, { code: "PGRST202", message: "function not found" }) });
  const result = await h.service.sync({ state: h.state, persist: h.persist });
  assert.equal(result.status, "pilot-unavailable");
  assert.equal(h.state.pilot.status, "pilot-unavailable");
  assert.equal(h.state.outbox[0].status, "pending");
});

await check("Staler, checksum-konfliktärer oder malformed Feed mutiert nichts", async () => {
  let state = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed({ revision: 2, checksum: checksumB })).state;
  for (const invalid of [
    feed({ revision: 1 }),
    feed({ revision: 2, checksum: checksumA }),
    feed({ events: [{ ...event(), accountId: "verboten" }] }),
  ]) {
    const result = R.reconcileAccountRadarPilotFeed(state, invalid);
    assert.equal(result.ok, false);
    assert.equal(result.state, state);
  }
});

await check("Feed-Ack darf keine fremde Operation oder Zielprojektion bestätigen", () => {
  const state = queuedAccountState();
  const conflict = R.reconcileAccountRadarPilotFeed(state, feed({
    operationAcks: [subscriptionAck({ targetId: "work:tmdb:999" })],
  }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "pilot-feed-ack-conflict");
  assert.equal(conflict.state, state);
});

await check("Receipt bleibt pending unsichtbar und wird erst nach HTTP-Ack sichtbar", async () => {
  let state = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed()).state;
  state = R.queueAccountRadarPilotReceipt(state, {
    eventId, eventVersionId, status: "seen", now: instant,
  }).state;
  assert.equal(state.receipts.length, 0);
  assert.equal(state.pilot.receiptOutbox[0].state, "pending");
  const h = harness({ state });
  await h.service.sync({ state: h.state, persist: h.persist });
  assert.equal(h.state.receipts[0].status, "seen");
  assert.equal(h.state.pilot.receiptOutbox.length, 0);
});

await check("Import sendet genau eine exakte E16A1-Payload und akzeptiert nur die strikte Antwort", async () => {
  let state = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed({ radarReview: true })).state;
  state = R.queueAccountRadarPilotImport(state, { operationId, payload: importPayload(), now: instant }).state;
  const h = harness({ state });
  await h.service.sync({ state: h.state, persist: h.persist });
  const request = h.calls.find((call) => call.rpc === "kd_radar_pilot_import_event");
  assert.deepEqual(Object.keys(request.body).sort(), ["p_operation_id", "p_payload"]);
  assert.deepEqual(request.body.p_payload, importPayload());
  assert.equal(h.state.pilot.importOutbox.length, 0);
  assert.equal(h.state.pilot.events.some((entry) => entry.eventVersionId === eventVersionId), true);
});

await check("Controllerprojektion ersetzt Fixtures nur im aktiven Kontopilot", async () => {
  const account = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed({ radarReview: true })).state;
  const localRows = Object.freeze([{ eventId: "fixture:event:one", title: "Fixture" }]);
  const projected = C.projectEntdeckenRadarPilot({ clientEnabled: true, radarAuthority: "account-cache", radarState: account, localEvents: localRows });
  assert.equal(projected.events[0].eventId, eventId);
  assert.equal(projected.radarReview, true);
  assert.equal(C.projectEntdeckenRadarPilot({
    clientEnabled: false, radarAuthority: "account-cache", radarState: account, localEvents: localRows,
  }).events, localRows);
  const guest = C.projectEntdeckenRadarPilot({ radarAuthority: "guest", radarState: R.createEmptyLocalRadar(), localEvents: localRows });
  assert.equal(guest.events, localRows);
  assert.equal(guest.radarReview, false);
});

await check("Clientquellen leiten Freischaltung nicht aus Settings, Proposal, Share oder Provider ab", () => {
  const sources = [
    fs.readFileSync("src/services/radarPilot.js", "utf8"),
    fs.readFileSync("src/lib/radarPilotContracts.js", "utf8"),
  ].join("\n");
  assert.doesNotMatch(sources, /kd_radar_settings|radar_aktiv|proposal_import|radar_proposal_import_aktiv/i);
  assert.doesNotMatch(sources, /from\s+["'][^"']*(?:provider|share|scheduler)|\b(?:create|set|get|queue).*(?:provider|share|scheduler)\s*\(/i);
  assert.doesNotMatch(sources, /@login\.|service[_-]?role|p_account_id|p_actor_id/i);
  assert.doesNotMatch(sources, /setInterval|setTimeout|WebSocket/);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("RADAR-PILOT-CLIENT-TEST BESTANDEN");

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
const nogaTargetId = "work:imdb:tt41955949";
const nogaDate = "2026-08-21";
const comparePilotEvidence = (left, right) => {
  if (left.sourceId < right.sourceId) return -1;
  if (left.sourceId > right.sourceId) return 1;
  if (left.url < right.url) return -1;
  if (left.url > right.url) return 1;
  if (left.retrievedAt < right.retrievedAt) return -1;
  if (left.retrievedAt > right.retrievedAt) return 1;
  return 0;
};
const buildEvidence = (override = []) => (override.length ? override : [
  { sourceId: "source:official", sourceDomain: "example.com", url: "https://example.com/official", retrievedAt: instant },
  { sourceId: "source:editorial", sourceDomain: "news.example.com", url: "https://news.example.com/editorial", retrievedAt: later },
].sort(comparePilotEvidence));

const subscriptionAck = (extra = {}) => ({
  operationId, targetId, status: "active", revision: 1, checksum: checksumA, ...extra,
});
const event = (extra = {}) => ({
  eventId, eventVersionId, targetId, eventType: "kinostart_at", date: "2026-08-20",
  region: "AT", platform: "-", lifecycleStatus: "scheduled", verificationStatus: "confirmed",
  evidence: buildEvidence(),
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
const importPayloadNogaWWW = (extra = {}) => importPayload({
  targetKey: nogaTargetId, eventType: "kinostart_at", date: nogaDate, region: "AT", platform: "-",
  evidence: [
    { sourceId: "votivkino_at", url: "https://www.votivkino.at/film/noga/", retrievedAt: instant },
    { sourceId: "filminstitut_at", url: "https://filminstitut.at/filme/noga", retrievedAt: later },
  ],
  ...extra,
});
const importPayloadNogaBaseDomain = (extra = {}) => importPayload({
  targetKey: nogaTargetId, eventType: "kinostart_at", date: nogaDate, region: "AT", platform: "-",
  evidence: [
    { sourceId: "votivkino_at", url: "https://votivkino.at/film/noga/", retrievedAt: instant },
    { sourceId: "filminstitut_at", url: "https://filminstitut.at/filme/noga", retrievedAt: later },
  ],
  ...extra,
});
const importResult = (extra = {}) => ({
  eventId, eventVersionId, targetId, eventType: "kinostart_at", date: "2026-08-20",
  region: "AT", platform: "-", ...extra,
});
const importResultNoga = (extra = {}) => importResult({
  eventId: "55555555-5555-4555-8555-555555555555",
  eventVersionId: "55555555-5555-4666-8666-666666666666",
  targetId: nogaTargetId,
  date: nogaDate,
  ...extra,
});
const nogaFeedEvent = (extra = {}) => event({
  eventId: "55555555-5555-4555-8555-555555555555",
  eventVersionId: "55555555-5555-4666-8666-666666666666",
  evidence: [
    { sourceId: "filminstitut_at", sourceDomain: "filminstitut.at", url: "https://filminstitut.at/filme/noga", retrievedAt: later },
    { sourceId: "votivkino_at", sourceDomain: "votivkino.at", url: "https://votivkino.at/film/noga/", retrievedAt: instant },
  ].sort(comparePilotEvidence),
  targetId: nogaTargetId,
  date: nogaDate,
  ...extra,
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

await check("Pilot-Event-Evidence trägt ein oder zwei sichere, eindeutige Quellen-Objekte", () => {
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({
    evidence: [{ sourceId: "source:official", sourceDomain: "example.com", url: "https://example.com/official", retrievedAt: instant }],
  })] })).ok, true);
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({ evidence: [] })] })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({
    evidence: [
      { sourceId: "source:official", sourceDomain: "example.com", url: "https://evil.test", retrievedAt: instant },
      { sourceId: "source:editorial", sourceDomain: "example.com", url: "http://example.com/editorial", retrievedAt: later },
    ],
  })] })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({
    evidence: [
      { sourceId: "source:official", sourceDomain: "example.com", url: "https://wrong.test", retrievedAt: instant },
      { sourceId: "source:editorial", sourceDomain: "example.com", url: "https://sub.example.com/editorial", retrievedAt: later },
    ],
  })] })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({
    evidence: [
      { sourceId: "source:official", sourceDomain: "example.com", url: "https://example.com/official", retrievedAt: instant },
      { sourceId: "source:official", sourceDomain: "example.com", url: "https://example.com/editorial", retrievedAt: later },
    ],
  })] })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({
    evidence: [
      { sourceId: "source:official", sourceDomain: "example.com", url: "https://example.com/official", retrievedAt: instant },
      { sourceId: "source:editorial", sourceDomain: "example.com", url: "https://example.com/official", retrievedAt: later },
    ],
  })] })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({
    evidence: [
      { sourceId: "source:official", sourceDomain: "example.com", url: "https://user:pass@example.com/official", retrievedAt: instant },
      { sourceId: "source:editorial", sourceDomain: "news.example.com", url: "https://news.example.com/editorial", retrievedAt: later },
    ],
  })] })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({
    evidence: [
      { sourceId: "source:official", sourceDomain: "example.com", url: "https://example.com:443/official", retrievedAt: instant },
      { sourceId: "source:editorial", sourceDomain: "news.example.com", url: "https://news.example.com/editorial", retrievedAt: later },
    ],
  })] })).ok, false);
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({
    evidence: [
      { sourceId: "source:official", sourceDomain: "example.com", url: "https://example.com:8443/official", retrievedAt: instant },
      { sourceId: "source:editorial", sourceDomain: "news.example.com", url: "https://news.example.com/editorial", retrievedAt: later },
    ],
  })] })).ok, false);
  const canonicalEvidence = buildEvidence();
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({ evidence: canonicalEvidence })] })).ok, true);
  const reorderedEvidence = [...canonicalEvidence].reverse();
  assert.equal(C.validateRadarPilotFeed(feed({ events: [event({ evidence: reorderedEvidence })] })).ok, false);
  const originalState = R.createEmptyLocalRadar({ authority: "account-cache" });
  const reorderedResult = R.reconcileAccountRadarPilotFeed(
    originalState,
    feed({ events: [event({ evidence: reorderedEvidence })] }),
  );
  assert.equal(reorderedResult.ok, false);
  assert.equal(reorderedResult.state, originalState);
  assert.equal(reorderedResult.reason, "pilot-feed-invalid");
});
await check("Pilot-Event-Evidence akzeptiert portlose Subdomain-URLs und erzwingt eindeutige Quelle/Domain in Kanonreihenfolge", () => {
  const subdomainEvidence = [
    { sourceId: "source:editorial", sourceDomain: "example.com", url: "https://sub.example.com/editorial", retrievedAt: later },
    { sourceId: "source:official", sourceDomain: "news.example.com", url: "https://news.example.com/official", retrievedAt: instant },
  ];
  const canonicalSubdomainEvidence = [...subdomainEvidence].sort(comparePilotEvidence);
  const reversedSubdomainEvidence = [...canonicalSubdomainEvidence].reverse();
  assert.equal(
    C.validateRadarPilotFeed(feed({ events: [event({ evidence: canonicalSubdomainEvidence })] })).ok,
    true,
  );
  assert.equal(
    C.validateRadarPilotFeed(feed({ events: [event({ evidence: reversedSubdomainEvidence })] })).ok,
    false,
  );
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

await check("Pilotverträge akzeptieren Textfelder nur als echte JSON-Strings", () => {
  for (const invalid of [
    subscriptionAck({ targetId: 550 }),
    subscriptionAck({ targetId: { key: targetId } }),
  ]) assert.equal(C.validateRadarPilotSubscriptionAck(invalid).ok, false);
  for (const invalid of [
    importPayload({ targetKey: 550 }),
    importPayload({ targetKey: { key: targetId } }),
    importPayload({ eventType: "streamingstart_at", platform: 42 }),
    importPayload({ eventType: "streamingstart_at", platform: { name: "Netflix" } }),
    importPayload({ evidence: [
      { ...importPayload().evidence[0], sourceId: 7 }, importPayload().evidence[1],
    ] }),
    importPayload({ evidence: [
      { ...importPayload().evidence[0], sourceId: { id: "source:official" } }, importPayload().evidence[1],
    ] }),
    importPayload({ evidence: [
      { ...importPayload().evidence[0], url: 7 }, importPayload().evidence[1],
    ] }),
    importPayload({ evidence: [
      { ...importPayload().evidence[0], url: { href: "https://example.test" } }, importPayload().evidence[1],
    ] }),
    importPayload({ evidence: [
      { ...importPayload().evidence[0], retrievedAt: 1_723_622_400_000 }, importPayload().evidence[1],
    ] }),
    importPayload({ evidence: [
      { ...importPayload().evidence[0], retrievedAt: { iso: instant } }, importPayload().evidence[1],
    ] }),
  ]) assert.equal(C.validateRadarPilotImportPayload(invalid).ok, false);
  for (const invalid of [
    feed({ subscriptions: [{ ...feed().subscriptions[0], title: 7 }] }),
    feed({ subscriptions: [{ ...feed().subscriptions[0], title: { text: "Fight Club" } }] }),
    feed({ reconciledAt: 1_723_622_400_000 }),
    feed({ subscriptions: [{ ...feed().subscriptions[0], updatedAt: { iso: instant } }] }),
    feed({ events: [{ ...event(), targetId: { key: targetId } }] }),
    feed({ events: [{ ...event(), evidence: [7, 8] }] }),
    feed({ events: [{ ...event(), evidence: [
      { sourceId: "x", sourceDomain: "bad", url: "https://bad", retrievedAt: instant },
      { sourceId: "y", sourceDomain: "also-bad", url: "https://also-bad", retrievedAt: later },
    ] }] }),
  ]) assert.equal(C.validateRadarPilotFeed(invalid).ok, false);
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
  tokenHook = null, beforeStorageSetHook = null, storageSetHook = null,
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
  const storageWrites = new Map();
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
    async set(key, value) {
      if (beforeStorageSetHook) await beforeStorageSetHook();
      if (!context.isCurrent()) {
        const error = new Error("storage context changed");
        error.code = "STORAGE_CONTEXT_CHANGED";
        throw error;
      }
      const boundDriver = context.name;
      if (storageSetHook) await storageSetHook({ key, value });
      storageWrites.set(boundDriver, (storageWrites.get(boundDriver) || 0) + 1);
      if (!context.isCurrent()) {
        const error = new Error("storage context changed");
        error.code = "STORAGE_CONTEXT_CHANGED";
        throw error;
      }
      return { key, value };
    },
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
  const commit = (next) => {
    current = next;
    return true;
  };
  return {
    service, calls, commit,
    get state() { return current; }, get maxFetches() { return maxFetches; },
    writes(name) { return storageWrites.get(name) || 0; },
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
    const result = await h.service.sync({ state: h.state, commit: h.commit });
    assert.equal(result.status, "disabled");
    assert.equal(h.calls.length, 0);
    assert.equal(h.writes("account-driver-a"), 0);
    assert.equal(h.writes("account-driver-b"), 0);
    for (const rpc of S.RADAR_PILOT_RPCS) assert.equal(h.calls.some((call) => call.rpc === rpc), false);
  });
}

await check("Gast erzeugt null Aufrufe aller vier Pilot-RPCs", async () => {
  const h = harness({ mode: "guest" });
  const result = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(result.status, "guest");
  assert.equal(h.calls.length, 0);
  assert.equal(h.writes("account-driver-a"), 0);
  assert.equal(h.writes("account-driver-b"), 0);
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
  const result = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(result.status, "ready");
  assert.equal(maxActiveRequests, 1);
  assert.equal(bodies.filter((entry) => entry.url.endsWith("set_subscription")).length, 2);
  assert.equal(h.state.outbox.length, 0);
});

await check("Überlappende explizite Syncs senden dieselbe Operation instanzweit nur einmal", async () => {
  let releaseFirstFetch;
  let markFirstFetchStarted;
  const firstFetchStarted = new Promise((resolve) => { markFirstFetchStarted = resolve; });
  const blocked = new Promise((resolve) => { releaseFirstFetch = resolve; });
  let first = true;
  let activeFetches = 0;
  let maxActiveFetches = 0;
  const sentOperationIds = [];
  const h = harness({
    fetchImpl: async (url, init) => {
      activeFetches += 1;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
      if (first) {
        first = false;
        markFirstFetchStarted();
        await blocked;
      }
      const body = JSON.parse(init.body);
      if (url.endsWith("kd_radar_pilot_set_subscription")) sentOperationIds.push(body.p_operation_id);
      activeFetches -= 1;
      return url.endsWith("kd_radar_pilot_feed") ? response(200, feed()) : response(200, subscriptionAck());
    },
  });
  const firstRun = h.service.sync({ state: h.state, commit: h.commit });
  await firstFetchStarted;
  const secondRun = h.service.sync({ state: h.state, commit: h.commit });
  await Promise.resolve();
  assert.equal(maxActiveFetches, 1);
  releaseFirstFetch();
  const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);
  assert.equal(firstResult.status, "ready");
  assert.equal(secondResult.status, "busy");
  assert.deepEqual(sentOperationIds, [operationId]);
  const thirdResult = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(thirdResult.status, "ready");
  assert.deepEqual(sentOperationIds, [operationId]);
});

await check("Busy-Sync bewahrt eine während des aktiven Laufs lokal ergänzte Operation", async () => {
  const operationId2 = "55555555-5555-4555-8555-555555555555";
  let releaseFeed;
  let markFeedStarted;
  const feedStarted = new Promise((resolve) => { markFeedStarted = resolve; });
  const feedBlocked = new Promise((resolve) => { releaseFeed = resolve; });
  const rpcCalls = [];
  const primed = R.reconcileAccountRadarPilotFeed(queuedAccountState(), feed({ radarReview: true }));
  assert.equal(primed.ok, true);
  const h = harness({
    state: primed.state,
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      rpcCalls.push({ rpc: url.split("/").at(-1), body });
      if (url.endsWith("kd_radar_pilot_feed")) {
        markFeedStarted();
        await feedBlocked;
        return response(200, feed());
      }
      return response(200, subscriptionAck({ operationId: body.p_operation_id }));
    },
  });

  const firstRun = h.service.sync({ state: h.state, commit: h.commit });
  await feedStarted;
  const queued = R.queueAccountRadarChange(h.state, {
    operationId: operationId2, action: "pause",
    target: { targetId: "series:tmdb:1396", targetType: "series", targetStatus: "active", title: "Breaking Bad", canonical: true },
    now: later,
  });
  assert.equal(queued.ok, true);
  assert.equal(h.commit(queued.state), true);
  const receiptQueued = R.queueAccountRadarPilotReceipt(h.state, {
    eventId, eventVersionId, status: "seen", now: later,
  });
  assert.equal(receiptQueued.ok, true);
  assert.equal(h.commit(receiptQueued.state), true);
  const importQueued = R.queueAccountRadarPilotImport(h.state, {
    operationId: "66666666-6666-4666-8666-666666666666", payload: importPayload(), now: later,
  });
  assert.equal(importQueued.ok, true);
  assert.equal(h.commit(importQueued.state), true);
  const secondRun = h.service.sync({ state: h.state, commit: h.commit });
  releaseFeed();

  const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);
  assert.equal(firstResult.status, "ready");
  assert.equal(secondResult.status, "busy");
  assert.deepEqual(h.state.outbox.map((entry) => ({
    operationId: entry.operationId, status: entry.status,
  })), [{ operationId: operationId2, status: "pending" }]);
  assert.deepEqual(h.state.pilot.receiptOutbox.map((entry) => ({
    eventVersionId: entry.eventVersionId, state: entry.state,
  })), [{ eventVersionId, state: "pending" }]);
  assert.deepEqual(h.state.pilot.importOutbox.map((entry) => ({
    operationId: entry.operationId, status: entry.status,
  })), [{ operationId: "66666666-6666-4666-8666-666666666666", status: "pending" }]);
  assert.deepEqual(rpcCalls.map((call) => call.rpc), [
    "kd_radar_pilot_feed", "kd_radar_pilot_set_subscription",
  ]);
  assert.deepEqual(rpcCalls.filter((call) => call.rpc === "kd_radar_pilot_set_subscription")
    .map((call) => call.body.p_operation_id), [operationId]);
});

await check("Busy-Sync während Storage-await landet im Resultat und im dauerhaften JSON-State", async () => {
  const operationId2 = "55555555-5555-4555-8555-555555555555";
  const importOperationId = "66666666-6666-4666-8666-666666666666";
  let releaseFirstStorage;
  let markFirstStorageStarted;
  const firstStorageStarted = new Promise((resolve) => { markFirstStorageStarted = resolve; });
  const firstStorageBlocked = new Promise((resolve) => { releaseFirstStorage = resolve; });
  const durableStates = [];
  let firstStorage = true;
  const rpcCalls = [];
  const primed = R.reconcileAccountRadarPilotFeed(queuedAccountState(), feed({ radarReview: true }));
  assert.equal(primed.ok, true);
  const h = harness({
    state: primed.state,
    storageSetHook: async ({ value }) => {
      if (firstStorage) {
        firstStorage = false;
        markFirstStorageStarted();
        await firstStorageBlocked;
      }
      durableStates.push(JSON.parse(value));
    },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      rpcCalls.push({ rpc: url.split("/").at(-1), body });
      return url.endsWith("kd_radar_pilot_feed")
        ? response(200, feed())
        : response(200, subscriptionAck({ operationId: body.p_operation_id }));
    },
  });

  const firstRun = h.service.sync({ state: h.state, commit: h.commit });
  await firstStorageStarted;
  let concurrent = R.queueAccountRadarChange(h.state, {
    operationId: operationId2, action: "pause",
    target: { targetId: "series:tmdb:1396", targetType: "series", targetStatus: "active", title: "Breaking Bad", canonical: true },
    now: later,
  });
  assert.equal(concurrent.ok, true);
  concurrent = R.queueAccountRadarPilotReceipt(concurrent.state, {
    eventId, eventVersionId, status: "seen", now: later,
  });
  assert.equal(concurrent.ok, true);
  concurrent = R.queueAccountRadarPilotImport(concurrent.state, {
    operationId: importOperationId, payload: importPayload(), now: later,
  });
  assert.equal(concurrent.ok, true);
  assert.equal(h.commit(concurrent.state), true);
  const busyResult = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(busyResult.status, "busy");
  releaseFirstStorage();

  const firstResult = await firstRun;
  assert.equal(firstResult.status, "ready");
  assert.equal(durableStates.length, 3);
  const durable = durableStates.at(-1);
  for (const state of [firstResult.state, h.state, durable]) {
    assert.deepEqual(state.outbox.map((entry) => ({
      operationId: entry.operationId, status: entry.status,
    })), [{ operationId: operationId2, status: "pending" }]);
    assert.deepEqual(state.pilot.receiptOutbox.map((entry) => ({
      eventVersionId: entry.eventVersionId, state: entry.state,
    })), [{ eventVersionId, state: "pending" }]);
    assert.deepEqual(state.pilot.importOutbox.map((entry) => ({
      operationId: entry.operationId, status: entry.status,
    })), [{ operationId: importOperationId, status: "pending" }]);
  }
  assert.deepEqual(rpcCalls.map((call) => call.rpc), [
    "kd_radar_pilot_feed", "kd_radar_pilot_set_subscription",
  ]);
});

await check("NOGA-Busy-Race: Konkurrierender Sync bleibt ohne Doppel-RPC, Folge-Sync verarbeitet exakt einen Import", async () => {
  let releaseFirstFeed;
  let markFirstFeed;
  const firstFeedStarted = new Promise((resolve) => { markFirstFeed = resolve; });
  const firstFeedBlocked = new Promise((resolve) => { releaseFirstFeed = resolve; });
  const calls = [];
  let feedCalls = 0;
  const state = R.reconcileAccountRadarPilotFeed(
    R.createEmptyLocalRadar({ authority: "account-cache" }),
    feed({ radarReview: true, subscriptions: [], events: [], receipts: [] }),
  ).state;
  const h = harness({
    state,
    fetchImpl: async (url, init) => {
      const rpc = String(url).split("/").at(-1);
      const body = JSON.parse(init.body);
      calls.push({ rpc, body });
      if (rpc === "kd_radar_pilot_feed") {
        feedCalls += 1;
        if (feedCalls === 1) markFirstFeed();
        await firstFeedBlocked;
        return response(200, feedCalls === 1
          ? { ...feed({ radarReview: true }), events: [], operationAcks: [] }
          : { ...feed({ radarReview: true }), events: [nogaFeedEvent()], operationAcks: [] });
      }
      if (rpc === "kd_radar_pilot_import_event") {
        assert.equal(body.p_payload.evidence[0].url, "https://votivkino.at/film/noga/");
        return response(200, importResultNoga());
      }
      throw new Error("unexpected rpc");
    },
  });

  const active = h.service.sync({ state: h.state, commit: h.commit });
  await firstFeedStarted;
  const queued = R.queueAccountRadarPilotImport(h.state, {
    operationId: "99999999-9999-4999-8999-999999999999",
    payload: importPayloadNogaBaseDomain(),
    now: instant,
  });
  assert.equal(queued.ok, true);
  assert.equal(h.commit(queued.state), true);

  const concurrent = h.service.sync({ state: h.state, commit: h.commit });
  const busy = await concurrent;
  assert.equal(busy.status, "busy");
  assert.equal(calls.filter((entry) => entry.rpc === "kd_radar_pilot_import_event").length, 0);

  releaseFirstFeed();
  const done = await active;
  assert.equal(done.status, "ready");

  const followUp = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(followUp.status, "ready");
  assert.equal(calls.filter((entry) => entry.rpc === "kd_radar_pilot_feed").length, 3);
  assert.equal(calls.filter((entry) => entry.rpc === "kd_radar_pilot_import_event").length, 1);
  assert.deepEqual(calls.map((entry) => entry.rpc), [
    "kd_radar_pilot_feed",
    "kd_radar_pilot_feed",
    "kd_radar_pilot_import_event",
    "kd_radar_pilot_feed",
  ]);
  assert.equal(h.state.pilot.importOutbox.length, 0);
  assert.equal(feedCalls, 3);
});

await check("Späterer Busy-Sync mit Basisstate entfernt keinen zuvor gemerkten Queue-Zuwachs", async () => {
  const operationId2 = "55555555-5555-4555-8555-555555555555";
  let releaseFeed;
  let markFeedStarted;
  const feedStarted = new Promise((resolve) => { markFeedStarted = resolve; });
  const feedBlocked = new Promise((resolve) => { releaseFeed = resolve; });
  const rpcCalls = [];
  const h = harness({
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      rpcCalls.push({ rpc: url.split("/").at(-1), body });
      if (url.endsWith("kd_radar_pilot_feed")) {
        markFeedStarted();
        await feedBlocked;
        return response(200, feed());
      }
      return response(200, subscriptionAck({ operationId: body.p_operation_id }));
    },
  });
  const baseState = h.state;
  const firstRun = h.service.sync({ state: baseState, commit: h.commit });
  await feedStarted;
  const queued = R.queueAccountRadarChange(baseState, {
    operationId: operationId2, action: "pause",
    target: { targetId: "series:tmdb:1396", targetType: "series", targetStatus: "active", title: "Breaking Bad", canonical: true },
    now: later,
  });
  assert.equal(queued.ok, true);
  assert.equal((await h.service.sync({ state: queued.state, commit: h.commit })).status, "busy");
  assert.equal((await h.service.sync({ state: baseState, commit: h.commit })).status, "busy");
  releaseFeed();

  const firstResult = await firstRun;
  assert.equal(firstResult.status, "ready");
  assert.deepEqual(firstResult.state.outbox.map((entry) => ({
    operationId: entry.operationId, status: entry.status,
  })), [{ operationId: operationId2, status: "pending" }]);
  assert.deepEqual(rpcCalls.map((call) => call.rpc), [
    "kd_radar_pilot_feed", "kd_radar_pilot_set_subscription",
  ]);
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
  const lost = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(lost.status, "pending");
  assert.equal(h.state.outbox[0].operationId, operationId);
  const recovered = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(recovered.status, "ready");
  assert.deepEqual(ids, [operationId]);
  assert.equal(h.state.outbox.length, 0);
});

for (const [name, mutate, stage] of [
  ["Sitzungszaun", (h) => h.changeSession(), "fetch"],
  ["Accountzaun", (h) => h.changeAccount(), "fetch"],
  ["Treiberzaun", (h) => h.changeDriver(), "body"],
  ["Generationszaun", (h) => h.changeGeneration(), "storage"],
  ["Tokenzaun", (h) => h.changeToken(), "token"],
]) {
  await check(`${name} verwirft Kontextwechsel während await ohne Cachemutation`, async () => {
    let h;
    const before = queuedAccountState();
    const hook = async () => { mutate(h); };
    h = harness({
      state: before,
      tokenHook: stage === "token" ? hook : null,
      storageSetHook: stage === "storage" ? hook : null,
      fetchImpl: async (url, init) => {
        h.calls.push({ url, init, rpc: url.split("/").at(-1), body: JSON.parse(init.body) });
        if (stage === "fetch") await hook();
        return response(200, url.endsWith("kd_radar_pilot_feed") ? feed() : subscriptionAck(), {
          bodyHook: stage === "body" ? hook : null,
        });
      },
    });
    const result = await h.service.sync({ state: h.state, commit: h.commit });
    assert.equal(result.status, "context-changed");
    assert.equal(h.state, before);
  });
}

await check("Terminale Fachablehnung markiert nur die Operation rejected", async () => {
  const h = harness({ fetchImpl: async (url) => url.endsWith("kd_radar_pilot_feed")
    ? response(200, feed())
    : response(400, { code: "23514", message: "radar_quota_exceeded" }) });
  const result = await h.service.sync({ state: h.state, commit: h.commit });
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
    const result = await h.service.sync({ state: h.state, commit: h.commit });
    assert.equal(result.status, "pending");
    assert.equal(h.state.outbox[0].status, "pending");
  });
}

await check("Fehlender RPC wird pilot-unavailable ohne Outboxlöschung", async () => {
  const h = harness({ fetchImpl: async () => response(404, { code: "PGRST202", message: "function not found" }) });
  const result = await h.service.sync({ state: h.state, commit: h.commit });
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

await check("Feed-Ack darf eine lokal rejected Operation nicht bestätigen", () => {
  const pending = queuedAccountState();
  const rejected = R.rejectAccountRadarChange(pending, operationId, "radar_quota_exceeded").state;
  const conflict = R.reconcileAccountRadarPilotFeed(rejected, feed({
    operationAcks: [subscriptionAck()],
  }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "pilot-feed-ack-conflict");
  assert.equal(conflict.state, rejected);
  assert.equal(conflict.state.outbox[0].status, "rejected");
});

await check("Receipt bleibt pending unsichtbar und wird erst nach HTTP-Ack sichtbar", async () => {
  let state = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed()).state;
  state = R.queueAccountRadarPilotReceipt(state, {
    eventId, eventVersionId, status: "seen", now: instant,
  }).state;
  assert.equal(state.receipts.length, 0);
  assert.equal(state.pilot.receiptOutbox[0].state, "pending");
  const h = harness({ state });
  await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(h.state.receipts[0].status, "seen");
  assert.equal(h.state.pilot.receiptOutbox.length, 0);

  let nullState = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed()).state;
  nullState = R.queueAccountRadarPilotReceipt(nullState, {
    eventId, eventVersionId, status: "seen", now: instant,
  }).state;
  const nullAck = harness({
    state: nullState,
    fetchImpl: async (url) => url.endsWith("kd_radar_pilot_feed")
      ? response(200, feed())
      : response(200, null),
  });
  await nullAck.service.sync({ state: nullAck.state, commit: nullAck.commit });
  assert.equal(nullAck.state.receipts[0].status, "seen");
  assert.equal(nullAck.state.pilot.receiptOutbox.length, 0);
});

await check("Receipt-void-Ack akzeptiert nur leeren oder JSON-null Body", async () => {
  for (const payload of [{ unexpected: true }, [], "ok"]) {
    let state = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed()).state;
    state = R.queueAccountRadarPilotReceipt(state, {
      eventId, eventVersionId, status: "seen", now: instant,
    }).state;
    const h = harness({
      state,
      fetchImpl: async (url) => url.endsWith("kd_radar_pilot_feed")
        ? response(200, feed())
        : response(200, payload),
    });
    const result = await h.service.sync({ state: h.state, commit: h.commit });
    assert.equal(result.status, "pending");
    assert.equal(h.state.receipts.length, 0);
    assert.equal(h.state.pilot.receiptOutbox[0].state, "pending");
  }
});

for (const [name, hookName, expectedAWrites] of [
  ["direkt vor gebundenem Storage-set", "beforeStorageSetHook", 0],
  ["während gebundenem Storage-set", "storageSetHook", 1],
]) {
  await check(`Treiberwechsel ${name} schreibt nie in Cache B und committet nicht sichtbar`, async () => {
    let h;
    const before = queuedAccountState();
    h = harness({
      state: before,
      [hookName]: async () => h.changeDriver(),
    });
    const result = await h.service.sync({ state: h.state, commit: h.commit });
    assert.equal(result.status, "context-changed");
    assert.equal(h.writes("account-driver-a"), expectedAWrites);
    assert.equal(h.writes("account-driver-b"), 0);
    assert.equal(h.state, before);
    assert.equal(h.state.outbox[0].status, "pending");
  });
}

await check("Import sendet genau eine exakte E16A1-Payload und akzeptiert nur die strikte Antwort", async () => {
  let state = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed({ radarReview: true })).state;
  state = R.queueAccountRadarPilotImport(state, { operationId, payload: importPayload(), now: instant }).state;
  const h = harness({ state });
  await h.service.sync({ state: h.state, commit: h.commit });
  const request = h.calls.find((call) => call.rpc === "kd_radar_pilot_import_event");
  assert.deepEqual(Object.keys(request.body).sort(), ["p_operation_id", "p_payload"]);
  assert.deepEqual(request.body.p_payload, importPayload());
  assert.equal(h.state.pilot.importOutbox.length, 0);
  assert.equal(h.state.pilot.events.some((entry) => entry.eventVersionId === eventVersionId), true);
});

await check("Import-Ack darf keinen quellenlosen Event-Zustand nachrüsten", async () => {
  const baseState = R.reconcileAccountRadarPilotFeed(
    R.createEmptyLocalRadar({ authority: "account-cache" }),
    feed({ radarReview: true }),
  ).state;
  const queued = R.queueAccountRadarPilotImport(baseState, {
    operationId, payload: importPayload(), now: instant,
  });
  assert.equal(queued.ok, true);
  const rpcCalls = [];
  const h = harness({
    state: queued.state,
    fetchImpl: async (url) => {
      const rpc = String(url).split("/").at(-1);
      rpcCalls.push(rpc);
      if (url.endsWith("kd_radar_pilot_feed")) return response(200, feed({ events: [], radarReview: true }));
      if (url.endsWith("kd_radar_pilot_import_event")) return response(200, importResult());
      throw new Error("unexpected rpc");
    },
  });
  const result = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(result.status, "pending");
  assert.equal(result.reason, "pilot-import-event-not-visible");
  assert.equal(rpcCalls.filter((rpc) => rpc === "kd_radar_pilot_import_event").length, 1);
  assert.equal(h.state.pilot.importOutbox.length, 0);
  assert.equal(h.state.pilot.events.length, 0);
});

await check("www-votivkino Rejection bleibt terminal im importOutbox und wird durch späteren leeren Feed nicht überschrieben", async () => {
  const baseState = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed({ radarReview: true })).state;
  const queued = R.queueAccountRadarPilotImport(baseState, {
    operationId: "55555555-5555-4555-8555-555555555555",
    payload: importPayloadNogaWWW(),
    now: instant,
  });
  assert.equal(queued.ok, true);
  const rpcCalls = [];
  const h = harness({
    state: queued.state,
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      const rpc = String(url).split("/").at(-1);
      rpcCalls.push({ rpc, body });
      if (url.endsWith("kd_radar_pilot_feed")) return response(200, feed({ events: [], radarReview: true }));
      if (url.endsWith("kd_radar_pilot_import_event")) {
        assert.equal(body.p_payload.evidence[0].url, "https://www.votivkino.at/film/noga/");
        assert.equal(body.p_payload.evidence[1].sourceId, "filminstitut_at");
        return response(400, { code: "23514", message: "radar_evidence_url_mismatch" });
      }
      throw new Error("unexpected rpc");
    },
  });
  const first = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(first.status, "rejected");
  assert.deepEqual(rpcCalls.map((entry) => entry.rpc), [
    "kd_radar_pilot_feed",
    "kd_radar_pilot_import_event",
  ]);
  assert.deepEqual(h.state.pilot.importOutbox.map((entry) => ({
    operationId: entry.operationId,
    status: entry.status,
    reason: entry.reason,
  })), [{ operationId: "55555555-5555-4555-8555-555555555555", status: "rejected", reason: "radar_evidence_url_mismatch" }]);
  assert.equal(h.state.pilot.events.length, 0);

  const hAfterEmptyFeedCalls = [];
  const hAfterEmptyFeed = harness({
    state: h.state,
    fetchImpl: async (url) => {
      hAfterEmptyFeedCalls.push("kd_radar_pilot_feed");
      if (!url.endsWith("kd_radar_pilot_feed")) throw new Error("unexpected rpc");
      return response(200, feed({ events: [], radarReview: true }));
    },
  });
  const after = await hAfterEmptyFeed.service.sync({ state: hAfterEmptyFeed.state, commit: hAfterEmptyFeed.commit });
  assert.equal(after.status, "ready");
  assert.deepEqual(hAfterEmptyFeed.state.pilot.importOutbox.map((entry) => ({
    operationId: entry.operationId,
    status: entry.status,
    reason: entry.reason,
  })), [{ operationId: "55555555-5555-4555-8555-555555555555", status: "rejected", reason: "radar_evidence_url_mismatch" }]);
  assert.equal(hAfterEmptyFeed.state.pilot.events.length, 0);
  assert.deepEqual(hAfterEmptyFeedCalls, ["kd_radar_pilot_feed"]);
});

await check("Base-Domain-NOGA-Import macht genau einen Import-RPC und genau einen Folge-Feed; Event erscheint dann aus Feed", async () => {
  const baseState = R.reconcileAccountRadarPilotFeed(
    R.createEmptyLocalRadar({ authority: "account-cache" }),
    feed({ radarReview: true }),
  ).state;
  const queued = R.queueAccountRadarPilotImport(baseState, {
    operationId: "66666666-6666-4666-8666-666666666666",
    payload: importPayloadNogaBaseDomain(),
    now: instant,
  });
  assert.equal(queued.ok, true);
  let feedCalls = 0;
  const calls = [];
  const h = harness({
    state: queued.state,
    fetchImpl: async (url, init) => {
      const rpc = String(url).split("/").at(-1);
      const body = JSON.parse(init.body);
      calls.push({ rpc, body });
      if (rpc === "kd_radar_pilot_feed") {
        feedCalls += 1;
        return response(200, feedCalls === 1
          ? { ...feed({ radarReview: true }), events: [], operationAcks: [] }
          : { ...feed({ radarReview: true }), events: [nogaFeedEvent()], operationAcks: [] });
      }
      if (rpc === "kd_radar_pilot_import_event") {
        assert.equal(body.p_operation_id, "66666666-6666-4666-8666-666666666666");
        assert.equal(body.p_payload.evidence[0].url, "https://votivkino.at/film/noga/");
        assert.equal(body.p_payload.evidence[1].sourceId, "filminstitut_at");
        return response(200, importResultNoga());
      }
      throw new Error("unexpected rpc");
    },
  });
  const result = await h.service.sync({ state: h.state, commit: h.commit });
  assert.equal(result.status, "ready");
  assert.deepEqual(calls.map((entry) => entry.rpc), [
    "kd_radar_pilot_feed",
    "kd_radar_pilot_import_event",
    "kd_radar_pilot_feed",
  ]);
  assert.deepEqual(calls[0].body.p_operation_ids, []);
  assert.deepEqual(calls[2].body.p_operation_ids, []);
  assert.equal(calls[1].body.p_operation_id, "66666666-6666-4666-8666-666666666666");
  assert.equal(feedCalls, 2);
  assert.equal(h.state.pilot.importOutbox.length, 0);
  const event = h.state.pilot.events.find((entry) => entry.eventId === "55555555-5555-4555-8555-555555555555");
  assert.equal(!!event, true);
  assert.deepEqual((event.evidence || []).map((entry) => entry.sourceId).sort(), ["filminstitut_at", "votivkino_at"].sort());
  assert.deepEqual(
    (event.evidence || []).map((entry) => entry.sourceDomain).sort(),
    ["filminstitut.at", "votivkino.at"].sort(),
  );
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
await check("Projektions-Kontopfad liefert tiefe Kopie und Deep-Freeze im aktiven Kontokontext", () => {
  const account = R.reconcileAccountRadarPilotFeed(R.createEmptyLocalRadar({ authority: "account-cache" }), feed({ radarReview: true })).state;
  const projected = C.projectEntdeckenRadarPilot({
    clientEnabled: true,
    radarAuthority: "account-cache",
    radarState: account,
    localEvents: [],
  });
  const projectedEvent = projected.events[0];
  const sourceEvent = account.pilot.events[0];
  const sourceEvidence = sourceEvent.evidence;

  assert.equal(projected.active, true);
  assert.equal(projected.radarReview, true);
  assert.equal(Object.isFrozen(projected), true);
  assert.equal(Object.isFrozen(projected.events), true);
  assert.equal(Object.isFrozen(projectedEvent), true);
  assert.equal(Object.isFrozen(projectedEvent.evidence), true);
  assert.equal(Object.isFrozen(projectedEvent.evidence[0]), true);
  assert.equal(Object.isFrozen(projectedEvent.evidence[1]), true);
  assert.equal(projected.events.length, 1);
  assert.equal(projectedEvent.evidence.length, sourceEvidence.length);
  assert.notStrictEqual(projected.events, account.pilot.events);
  assert.notStrictEqual(projectedEvent, sourceEvent);
  assert.notStrictEqual(projectedEvent.evidence, sourceEvidence);
  assert.notStrictEqual(projectedEvent.evidence[0], sourceEvidence[0]);
  assert.notStrictEqual(projectedEvent.evidence[1], sourceEvidence[1]);
  assert.deepEqual(projected.events, account.pilot.events);
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

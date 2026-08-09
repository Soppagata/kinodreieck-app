/* Etappe 9b: vollständig lokaler Ausfall-Trockenlauf. Kein echter Plattform-
   oder Anbieterrequest; 503, Timeout und Wiederkehr entstehen im Adapter. */
const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => void values.set(key, String(value)),
  removeItem: (key) => void values.delete(key),
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};

const { createAccountDriver } = await import("./src/lib/accountDriver.js");
const { createSessionCoordinator, STORAGE_SESSION_STATES } = await import("./src/services/sessionCoordinator.js");
const { accountSession, SESSION_STATES } = await import("./src/services/auth.js");
const { providerActivationDecision } = await import("./src/lib/privatePilotOps.js");
const { buildSupportBundle } = await import("./src/lib/supportBundle.js");

let passed = 0;
const check = (name, condition) => {
  if (!condition) throw new Error(`Fehlgeschlagen: ${name}`);
  passed += 1;
  console.log(`✓ ${name}`);
};
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const waitQueue = () => new Promise((resolve) => setTimeout(resolve, 30));

let mode = "503";
let networkCalls = 0;
let remoteValue = null;
const fetchImpl = async (_url, init = {}) => {
  networkCalls += 1;
  if (mode === "timeout") throw Object.assign(new Error("simulated timeout"), { name: "AbortError" });
  if (mode === "503") return response(503, { code: "simulated_unavailable" });
  const body = JSON.parse(String(init.body || "{}"));
  if (String(init.method || "GET") === "POST") {
    remoteValue = body.value;
    return response(201, [{ key: body.key, value: body.value, revision: 1 }]);
  }
  return response(200, []);
};
const driver = createAccountDriver({
  config: { supabaseUrl: "https://outage-test.supabase.co", supabasePublishableKey: "sb_publishable_test" },
  getAccessToken: async () => "synthetic-token",
  fetchImpl,
  owner: "account:synthetic",
});

await driver.set("kd:master", "LOCAL_DURING_503");
await waitQueue();
check("503 bewahrt den lokalen Wert", values.get("kd:master") === "LOCAL_DURING_503");
check("503 bleibt sichtbar und wiederaufnehmbar", driver.status().pending.includes("kd:master"));
check("503 meldet keinen falschen Commit", remoteValue === null);

mode = "timeout";
await driver.syncFlush();
check("Timeout bewahrt Pending und Daten", driver.status().pending.includes("kd:master") && values.get("kd:master") === "LOCAL_DURING_503");

mode = "ok";
await driver.syncFlush();
check("Wiederkehr synchronisiert exakt den ausstehenden Wert", remoteValue === "LOCAL_DURING_503");
check("Erfolgreiche Wiederaufnahme räumt Pending", !driver.status().pending.includes("kd:master"));
const callsAfterRecovery = networkCalls;
await driver.syncFlush();
check("Erneuter Flush ist idempotent", networkCalls === callsAfterRecovery && remoteValue === "LOCAL_DURING_503");

let providerCalls = 0;
const providerDecision = providerActivationDecision({ registryRow: null, featureEnabled: true });
if (providerDecision.ok) providerCalls += 1;
check("Provider-Ausfall/fehlende Registry erzeugt keinen Anbieterrequest", !providerDecision.ok && providerCalls === 0 && providerDecision.code === "PROVIDER_REGISTRY_OFF");

let blockedAccount = null;
const degraded = accountSession({
  id: "11111111-2222-3333-4444-555555555555",
  state: SESSION_STATES.DEGRADED,
  capabilities: { remoteStorage: false, personalAi: false },
  access: { status: "unavailable" },
});
const coordinator = createSessionCoordinator({
  auth: { getSnapshot: () => degraded, initialize: async () => degraded, refresh: async () => degraded },
  storage: {
    blockAccess: (id) => { blockedAccount = id; return true; },
    accessBlocked: () => true,
    masked: () => false,
    active: () => false,
    preparedAccountId: () => null,
    cacheOwner: () => null,
    currentTransition: () => null,
    hasOpenChanges: () => false,
    cleanupOrphanMetadata: () => true,
  },
  adoption: { isConfirmed: () => false },
  eventTarget: null,
});
await coordinator.initialize();
check("Unklare Remote-Freigabe bleibt als Account sichtbar", coordinator.getSnapshot().mode === "account");
check("Unklare Remote-Freigabe schließt den Kontospeicher", blockedAccount === degraded.account.id && coordinator.getStorageState() === STORAGE_SESSION_STATES.ACCESS_BLOCKED);

const support = buildSupportBundle({ checks: [
  { id: "database", code: "DATABASE_UNAVAILABLE", payload: "PRIVATE_TITLE" },
  { id: "provider", code: "PROVIDER_REGISTRY_OFF", accountId: degraded.account.id },
] });
const serialized = JSON.stringify(support);
check("Supportcodes belegen Ausfall und Not-Aus ohne Payload", support.checks.length === 2 && !serialized.includes("PRIVATE_TITLE") && !serialized.includes(degraded.account.id));
check("Trockenlauf benutzte nur den synthetischen Supabase-Adapter", networkCalls >= 3 && providerCalls === 0);

console.log(`PRIVATE-PILOT-AUSFALL-TROCKENLAUF BESTANDEN (${passed}/${passed})`);

import fs from "node:fs";
import path from "node:path";

const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.has(key) ? local.get(key) : null,
  setItem: (key, value) => void local.set(key, String(value)),
  removeItem: (key) => void local.delete(key),
  clear: () => local.clear(),
};

const {
  APP_ENVIRONMENTS, createRuntimeConfig, validateRuntimeConfig, RUNTIME_SCHEMA_VERSION,
} = await import("./src/config/runtime.js");
const {
  BoundaryError, ERROR_CODES, errorFromStatus, errorText, normalizeBoundaryError,
} = await import("./src/services/errors.js");
const {
  SESSION_MODES, accountSession, createAuthService, guestSession,
} = await import("./src/services/auth.js");
const { createAiService } = await import("./src/services/ai.js");
const { publicSupabaseHeaders, istSupabaseProjektUrl } = await import("./src/lib/supabasePublic.js");
const { storageService } = await import("./src/services/storage.js");
const { catalogService } = await import("./src/services/catalog.js");

let ok = 0;
const check = (name, value) => {
  if (!value) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
};

const config = createRuntimeConfig({
  VITE_APP_ENV: "staging",
  VITE_APP_URL: " https://kino.example/app/ ",
  VITE_SUPABASE_URL: "https://projekt.supabase.co/",
  VITE_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_test ",
  VITE_AI_ENDPOINT_NAME: "ai-v1",
  VITE_BUILD_VERSION: "abc123",
});
check("Runtime-Konfiguration enthält den vollständigen öffentlichen Vertrag",
  config.appEnvironment === APP_ENVIRONMENTS.STAGING
  && config.appUrl === "https://kino.example/app"
  && config.supabaseUrl === "https://projekt.supabase.co"
  && config.supabasePublishableKey === "sb_publishable_test"
  && config.aiEndpointName === "ai-v1"
  && config.buildVersion === "abc123"
  && config.schemaVersion === RUNTIME_SCHEMA_VERSION);
check("Runtime-Konfiguration ist unveränderlich", Object.isFrozen(config));
check("Runtime-Konfiguration enthält keine geheimen Vertragsfelder",
  !Object.keys(config).some((key) => /secret|service.?role|provider.?key|sync.?key|token/i.test(key)));
check("Leere Runtime-Werte bleiben sicher und lokal funktionsfähig",
  createRuntimeConfig({}).appEnvironment === APP_ENVIRONMENTS.LOCAL
  && createRuntimeConfig({}).supabaseUrl === ""
  && createRuntimeConfig({}).buildVersion === "dev"
  && validateRuntimeConfig(createRuntimeConfig({})).ok);
check("Staging und Produktion verlangen vollständige öffentliche Konfiguration",
  !validateRuntimeConfig(createRuntimeConfig({ VITE_APP_ENV: "staging" })).ok
  && !validateRuntimeConfig(createRuntimeConfig({ VITE_APP_ENV: "production" })).ok);
check("Ungültige Runtime-Werte werden strukturiert gemeldet",
  !validateRuntimeConfig(createRuntimeConfig({
    VITE_APP_URL: "http://unsicher.example",
    VITE_SUPABASE_URL: "https://evil.example",
    VITE_AI_ENDPOINT_NAME: "../secret",
  })).ok);

check("Supabase-Projekt-URL wird streng validiert",
  istSupabaseProjektUrl("https://abc-123.supabase.co") && !istSupabaseProjektUrl("https://evil.example"));
check("Publishable-Key wird nie als Bearer gesendet",
  publicSupabaseHeaders("sb_publishable_test").apikey === "sb_publishable_test"
  && !publicSupabaseHeaders("sb_publishable_test").Authorization);
const jwt = "eyJ" + "x".repeat(40);
check("Legacy-JWT erhält weiterhin den nötigen Bearer-Header",
  publicSupabaseHeaders(jwt).Authorization === "Bearer " + jwt);

check("HTTP-Fehler werden auf die sechs stabilen Codes abgebildet",
  errorFromStatus(401).code === ERROR_CODES.UNAUTHENTICATED
  && errorFromStatus(403).code === ERROR_CODES.FORBIDDEN
  && errorFromStatus(429).code === ERROR_CODES.LIMIT
  && errorFromStatus(503).code === ERROR_CODES.SERVER
  && errorFromStatus(400).code === ERROR_CODES.INVALID_RESPONSE);
check("Netzwerkfehler werden als offline und retryable normalisiert", (() => {
  const error = normalizeBoundaryError(new TypeError("Failed to fetch"), { source: "catalog" });
  return error.code === ERROR_CODES.OFFLINE && error.retryable;
})());
check("Ungültige Payload wird als invalid-response normalisiert",
  normalizeBoundaryError(new Error("ungültige Payload")).code === ERROR_CODES.INVALID_RESPONSE);
check("UI-Fehlertext verrät keinen rohen Servertext", (() => {
  const error = new BoundaryError(ERROR_CODES.SERVER, { message: "interne Tabelle kd_secret" });
  return !errorText(error).includes("kd_secret");
})());

catalogService.setConnection({
  url: "https://architekturtest.supabase.co",
  key: "sb_publishable_architekturtest",
});
globalThis.fetch = async () => ({
  ok: false,
  status: 500,
  json: async () => ({ message: "INTERNAL_TABLE_DETAIL" }),
});
let catalogError = null;
try { await catalogService.testConnection(); } catch (error) { catalogError = error; }
check("Katalog-Service normalisiert Result-Envelopes zu BoundaryError",
  catalogError?.code === ERROR_CODES.SERVER);
check("Katalog-Verbindungsfehler leakt keine Backenddetails in UI-Texte",
  !errorText(catalogError).includes("INTERNAL_TABLE_DETAIL")
  && !catalogError.message.includes("INTERNAL_TABLE_DETAIL"));

const guest = guestSession();
check("Gast ist ein gültiger betriebsbereiter Sessionzustand",
  guest.mode === SESSION_MODES.GUEST && guest.state === "ready" && guest.account === null);
check("Gast-Snapshot enthält keine Tokens",
  !Object.keys(guest).some((key) => /token/i.test(key)));
let invalidAccountRejected = false;
try { accountSession({}); } catch (error) {
  invalidAccountRejected = error.code === ERROR_CODES.INVALID_RESPONSE;
}
check("Accountmodus verlangt eine verifizierte Account-ID", invalidAccountRejected);

let subscriptionCalls = 0;
const auth = createAuthService({
  loadSession: async () => ({
    mode: "account",
    account: { id: "konto-1", displayName: "Max" },
    capabilities: { remoteStorage: true, personalAi: true },
  }),
});
const unsubscribe = auth.subscribe(() => { subscriptionCalls++; });
await auth.initialize();
unsubscribe();
check("Accountstatus bewahrt serverseitige Identität und Capabilities",
  auth.getSnapshot().account.id === "konto-1"
  && auth.getSnapshot().capabilities.remoteStorage
  && auth.getSnapshot().capabilities.personalAi
  && subscriptionCalls === 1);

let guestBlocked = false;
try {
  await createAiService({
    auth: createAuthService(),
    config,
    transport: async () => ({ ok: true }),
  }).runTask("intelligent-search", { query: "Alien" });
} catch (error) {
  guestBlocked = error.code === ERROR_CODES.UNAUTHENTICATED;
}
check("Gastzugriff auf persönliche KI endet kontrolliert unauthenticated", guestBlocked);

let transportRequest = null;
const ai = createAiService({
  auth,
  config,
  transport: async (request) => {
    transportRequest = request;
    return { ok: true, data: { title: "Alien" } };
  },
});
const aiResult = await ai.runTask("intelligent-search", { query: "Alien" });
check("KI-Transport ist mockbar und kennt nur internen Endpoint plus Account-ID",
  aiResult.ok && transportRequest.endpointName === "ai-v1"
  && transportRequest.accountId === "konto-1"
  && !Object.keys(transportRequest).some((key) => /provider|secret|api.?key/i.test(key)));
let limitMapped = false;
try {
  await createAiService({
    auth, config, transport: async () => ({ ok: false, status: 429 }),
  }).runTask("masterlist-enrichment", { id: "alien" });
} catch (error) { limitMapped = error.code === ERROR_CODES.LIMIT; }
check("KI-Limit wird einheitlich als limit gemeldet", limitMapped);

await storageService.set("kd:architekturtest", "lokal");
check("Persönliche lokale Ablage bleibt im Gastmodus unverändert nutzbar",
  (await storageService.get("kd:architekturtest"))?.value === "lokal"
  && storageService.mode === "guest-local");
await storageService.delete("kd:architekturtest");
let publishError = null;
try { await storageService.publishSharedArticle({ id: "test", titel: "Test" }); }
catch (error) { publishError = error; }
check("Storage-Service normalisiert auch alte Result-Envelopes ohne Rohmeldung",
  publishError instanceof BoundaryError
  && !publishError.message.includes("Sync-Schlüssel")
  && publishError.source === "storage");

const uiRoots = ["src/App.jsx", "src/components", "src/tabs"];
const jsFiles = [];
for (const root of uiRoots) {
  const stat = fs.statSync(root);
  if (stat.isFile()) jsFiles.push(root);
  else {
    for (const name of fs.readdirSync(root)) {
      if (/\.[cm]?[jt]sx?$/.test(name)) jsFiles.push(path.join(root, name));
    }
  }
}
const uiSource = jsFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
check("UI importiert keine Legacy-Netzwerk- oder Storage-Treiber direkt",
  !/from\s+["'][^"']*lib\/(?:gitDriver|supabaseDriver|katalog|storage)\.js["']/.test(uiSource));
check("Aktive UI kennt keine treiberspezifischen Service-Namen",
  !/\b(?:git|supabase)SyncService\b/.test(uiSource));
check("UI führt keine direkten Netzwerkaufrufe aus",
  !/\bfetch\s*\(/.test(uiSource.replace(/fetch\(\) würde blockiert/g, "")));
check("App macht Gast- und Accountmodus technisch unterscheidbar",
  /data-session-mode=\{session\.mode\}/.test(fs.readFileSync("src/App.jsx", "utf8")));
check("Katalogzugang spiegelt keine Credentials in persönlichen Sync",
  !/setSupabaseConfig/.test(fs.readFileSync("src/components/KatalogZugang.jsx", "utf8")));

console.log(`\n${ok} Architekturgrenzen-Checks bestanden.`);

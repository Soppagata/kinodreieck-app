/* Öffentliche Build-/Laufzeitkonfiguration.
   Alles in diesem Objekt darf im Browser-Bundle sichtbar sein. Persönliche
   Sync-Schlüssel, Service-Role- oder KI-Anbieter-Keys gehören nie hierher. */

export const RUNTIME_SCHEMA_VERSION = 2;
export const APP_ENVIRONMENTS = Object.freeze({
  LOCAL: "local",
  STAGING: "staging",
  PRODUCTION: "production",
});

const STANDARD = Object.freeze({
  appEnvironment: APP_ENVIRONMENTS.LOCAL,
  appUrl: "",
  supabaseUrl: "",
  supabasePublishableKey: "",
  aiEndpointName: "ai-task",
  accountSelfServiceEndpointName: "account-self-service",
  privateMailEndpointName: "",
  privateSelfServiceEnabled: false,
  accountDeleteEnabled: false,
  privateMailEnabled: false,
  radarPilotClientEnabled: false,
  entdeckenDailyFeedEnabled: false,
  buildVersion: "dev",
  schemaVersion: RUNTIME_SCHEMA_VERSION,
});

function text(wert) { return String(wert == null ? "" : wert).trim(); }
function url(wert) { return text(wert).replace(/\/+$/, ""); }
function endpoint(wert) {
  const v = text(wert);
  return /^[a-z0-9][a-z0-9_-]*$/i.test(v) ? v : "";
}

export function createRuntimeConfig(env = {}) {
  const aiWert = text(env.VITE_AI_ENDPOINT_NAME);
  const selfServiceWert = text(env.VITE_ACCOUNT_SELF_SERVICE_ENDPOINT_NAME);
  const privateMailWert = text(env.VITE_PRIVATE_MAIL_ENDPOINT_NAME);
  return Object.freeze({
    appEnvironment: text(env.VITE_APP_ENV) || STANDARD.appEnvironment,
    appUrl: url(env.VITE_APP_URL),
    supabaseUrl: url(env.VITE_SUPABASE_URL),
    supabasePublishableKey: text(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    aiEndpointName: aiWert ? endpoint(aiWert) : STANDARD.aiEndpointName,
    accountSelfServiceEndpointName: selfServiceWert ? endpoint(selfServiceWert) : STANDARD.accountSelfServiceEndpointName,
    privateMailEndpointName: privateMailWert ? endpoint(privateMailWert) : STANDARD.privateMailEndpointName,
    privateSelfServiceEnabled: text(env.VITE_PRIVATE_SELF_SERVICE_ENABLED) === "true",
    accountDeleteEnabled: text(env.VITE_ACCOUNT_DELETE_ENABLED) === "true",
    privateMailEnabled: text(env.VITE_PRIVATE_MAIL_ENABLED) === "true",
    radarPilotClientEnabled: text(env.VITE_RADAR_PILOT_CLIENT_ENABLED) === "true",
    entdeckenDailyFeedEnabled: text(env.VITE_ENTDECKEN_DAILY_FEED_ENABLED) === "true",
    buildVersion: text(env.VITE_BUILD_VERSION) || STANDARD.buildVersion,
    schemaVersion: RUNTIME_SCHEMA_VERSION,
  });
}

export function validateRuntimeConfig(config = STANDARD) {
  const fehler = [];
  const online = config.appEnvironment === APP_ENVIRONMENTS.STAGING
    || config.appEnvironment === APP_ENVIRONMENTS.PRODUCTION;
  if (!Object.values(APP_ENVIRONMENTS).includes(config.appEnvironment)) {
    fehler.push({ feld: "appEnvironment", code: "invalid-environment" });
  }
  if (online && !config.appUrl) fehler.push({ feld: "appUrl", code: "required" });
  if (online && !config.supabaseUrl) fehler.push({ feld: "supabaseUrl", code: "required" });
  if (online && !config.supabasePublishableKey) {
    fehler.push({ feld: "supabasePublishableKey", code: "required" });
  }
  if (config.appUrl && !/^https:\/\/[^\s]+$/i.test(config.appUrl)) fehler.push({ feld: "appUrl", code: "invalid-url" });
  if (config.supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl)) fehler.push({ feld: "supabaseUrl", code: "invalid-url" });
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(config.aiEndpointName || "")) fehler.push({ feld: "aiEndpointName", code: "invalid-endpoint" });
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(config.accountSelfServiceEndpointName || "")) fehler.push({ feld: "accountSelfServiceEndpointName", code: "invalid-endpoint" });
  if (config.privateMailEnabled === true
      && !/^[a-z0-9][a-z0-9_-]*$/i.test(config.privateMailEndpointName || "")) {
    fehler.push({ feld: "privateMailEndpointName", code: "invalid-endpoint" });
  }
  if (Number(config.schemaVersion) !== RUNTIME_SCHEMA_VERSION) fehler.push({ feld: "schemaVersion", code: "unsupported-schema" });
  return Object.freeze({ ok: fehler.length === 0, fehler: Object.freeze(fehler) });
}

/* Eine einzige, fail-closed Capability fuer alle sichtbaren Radar-Einstiege.
   Das Featureflag allein ist keine Laufbereitschaft: Der Browser braucht auch
   die oeffentliche Supabase-Verbindung und einen fertigen Kontokontext. */
export function radarClientRuntimeAvailable(config = STANDARD, {
  singleFile = false,
  remoteAccountReady = false,
  accountCacheAuthority = false,
  clientEnabled = config?.radarPilotClientEnabled,
} = {}) {
  return singleFile !== true
    && remoteAccountReady === true
    && accountCacheAuthority === true
    && clientEnabled === true
    && /^https:\/\/[a-z0-9-]+\.supabase\.co$/iu.test(url(config?.supabaseUrl))
    && text(config?.supabasePublishableKey).length > 0;
}

const viteEnv = (typeof import.meta.env !== "undefined" && import.meta.env) || {};
export const runtimeConfig = createRuntimeConfig(viteEnv);

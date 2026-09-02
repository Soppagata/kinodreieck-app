import { createRuntimeConfig, validateRuntimeConfig } from "../src/config/runtime.js";

const ziel = String(process.env.DEPLOY_TARGET || "").trim();
if (!["staging", "production"].includes(ziel)) {
  throw new Error("DEPLOY_TARGET muss staging oder production sein.");
}

const config = createRuntimeConfig(process.env);
const validierung = validateRuntimeConfig(config);
if (config.appEnvironment !== ziel) {
  throw new Error(`VITE_APP_ENV=${config.appEnvironment} passt nicht zu DEPLOY_TARGET=${ziel}.`);
}
if (!validierung.ok) {
  throw new Error("Ungültige öffentliche Deployment-Konfiguration: "
    + validierung.fehler.map(({ feld, code }) => `${feld}:${code}`).join(", "));
}
if (config.supabasePublishableKey.length < 20) {
  throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY ist leer oder unplausibel kurz.");
}
if (!config.buildVersion || config.buildVersion === "dev") {
  throw new Error("VITE_BUILD_VERSION muss den ausgelieferten Commit bezeichnen.");
}
if (ziel === "staging"
    && (config.privateMailEnabled !== true
      || config.privateMailEndpointName !== "private-mail-request")) {
  throw new Error("Staging muss den privaten Mailweg über private-mail-request aktivieren.");
}
if (ziel === "production"
    && (config.privateMailEnabled !== false || config.privateMailEndpointName !== "")) {
  throw new Error("Production muss den privaten Mailweg ohne nutzbaren Endpoint deaktivieren.");
}

const ERLAUBTE_VITE_KEIN_SECRET = new Set([
  "VITE_PRIVATE_SELF_SERVICE_ENABLED",
  "VITE_PRIVATE_MAIL_ENABLED",
  "VITE_PRIVATE_MAIL_ENDPOINT_NAME",
]);
const verboteneViteNamen = Object.keys(process.env).filter((name) =>
  name.startsWith("VITE_")
  && !ERLAUBTE_VITE_KEIN_SECRET.has(name)
  && /(secret|service.?role|private|provider.?key|api.?token|access.?token)/i.test(name));
if (verboteneViteNamen.length) {
  throw new Error("Secrets dürfen nie VITE_-Variablen sein: " + verboteneViteNamen.join(", "));
}

console.log(`Öffentliche ${ziel}-Konfiguration ist vollständig und secret-frei klassifiziert.`);

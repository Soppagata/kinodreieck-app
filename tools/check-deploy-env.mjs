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

const verboteneViteNamen = Object.keys(process.env).filter((name) =>
  name.startsWith("VITE_")
  && /(secret|service.?role|private|provider.?key|api.?token|access.?token)/i.test(name));
if (verboteneViteNamen.length) {
  throw new Error("Secrets dürfen nie VITE_-Variablen sein: " + verboteneViteNamen.join(", "));
}

console.log(`Öffentliche ${ziel}-Konfiguration ist vollständig und secret-frei klassifiziert.`);

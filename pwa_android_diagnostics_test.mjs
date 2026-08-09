import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("public/download/pwa-diagnostics.js", "utf8");
const context = { URL, Response, Request, Headers, Date, Promise, console, setTimeout, clearTimeout };
vm.runInNewContext(source, context, { filename: "public/download/pwa-diagnostics.js" });
const D = context.KdPwaDiagnostics;

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`✓ ${name}`);
};

await check("Alle stabilen Android-Diagnosecodes besitzen feste Texte und Maßnahmen", () => {
  assert.deepEqual(Object.keys(D.DEFINITIONS), [
    "KD-PWA-ANDROID-000", "KD-PWA-ANDROID-010", "KD-PWA-ANDROID-020",
    "KD-PWA-ANDROID-021", "KD-PWA-ANDROID-022", "KD-PWA-ANDROID-030",
    "KD-PWA-ANDROID-031", "KD-PWA-ANDROID-032", "KD-PWA-ANDROID-033",
    "KD-PWA-ANDROID-040", "KD-PWA-ANDROID-041", "KD-PWA-ANDROID-042",
    "KD-PWA-ANDROID-050", "KD-PWA-ANDROID-060", "KD-PWA-ANDROID-090",
  ]);
  assert.equal(Object.values(D.DEFINITIONS).every((entry) => (
    ["pass", "warning", "error"].includes(entry.severity)
    && entry.message.length > 10 && entry.nextAction.length > 10
  )), true);
});

await check("Browserklassifikation gibt nur Familie und grobe Hauptversionen aus", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(D.browserSummary("Mozilla/5.0 (Linux; Android 15; Geheimmodell) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile"))),
    { family: "chrome", major: 132, androidMajor: 15 },
  );
});

await check("Positiv-Allowlist entfernt Token, Query, Hash, Stack und überlange freie Werte vollständig", () => {
  const secret = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature";
  const report = D.sanitizeReport({
    createdAt: "2026-08-09T20:00:00.000Z",
    build: secret,
    pageUrl: `https://kino.example/download/?token=${secret}#stacktrace`,
    browser: { family: "chrome", major: 132, androidMajor: 15, rawUserAgent: `Modell ${secret}` },
    capabilities: { secureContext: true, manifest: true, prompt: false, token: secret },
    checks: { secureContext: "pass", promptStatus: "missing", stack: `Error: ${secret}` },
    findings: [{ code: "KD-PWA-ANDROID-040", message: secret, stack: secret }],
    token: secret,
  });
  const json = JSON.stringify(report);
  assert.equal(report.build, "unknown");
  assert.deepEqual(JSON.parse(JSON.stringify(report.page)), { origin: "https://kino.example", path: "/download/" });
  assert.equal(json.includes(secret), false);
  assert.equal(json.includes("token="), false);
  assert.equal(json.includes("stacktrace"), false);
  assert.deepEqual(Object.keys(report), [
    "format", "version", "createdAt", "build", "page", "browser",
    "capabilities", "checks", "primaryCode", "findings",
  ]);
});

const manifest = {
  name: "Kinodreieck",
  short_name: "Kinodreieck",
  start_url: ".",
  scope: ".",
  display: "standalone",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
  ],
};

await check("Manifestvertrag löst Start, Scope und beide Pflichticons auf", () => {
  const result = D.manifestAssessment(
    manifest, "https://kino.example/manifest.webmanifest", "https://kino.example/download/",
  );
  assert.equal(result.ok, true);
  assert.equal(result.startUrl.href, "https://kino.example/");
  assert.equal(result.scopeUrl.href, "https://kino.example/");
});

await check("Unbrauchbare Manifestidentität und fehlendes 512-Icon bleiben getrennte Findings", () => {
  const result = D.manifestAssessment(
    { ...manifest, name: "", short_name: "", display: "browser", icons: manifest.icons.slice(0, 1) },
    "https://kino.example/manifest.webmanifest", "https://kino.example/download/",
  );
  assert.deepEqual([...result.findings].sort(), ["KD-PWA-ANDROID-021", "KD-PWA-ANDROID-022"]);
});

function fakeCaches() {
  const stores = new Map();
  return {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(key, response) { store.set(String(key), response.clone()); },
        async match(key) { return store.get(String(key))?.clone(); },
      };
    },
    async delete(name) { return stores.delete(name); },
  };
}

function diagnosticEnvironment({ prompt = false, offlineOk = true } = {}) {
  const registration = { scope: "https://kino.example/", active: {} };
  const serviceWorker = {
    controller: {},
    ready: Promise.resolve(registration),
    async register() { return registration; },
  };
  const fetch = async (url, init = {}) => {
    if (url.endsWith("build-meta.json")) {
      return new Response(JSON.stringify({ buildVersion: "abcdef1234567" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("manifest.webmanifest")) {
      return new Response(JSON.stringify(manifest), {
        status: 200, headers: { "content-type": "application/manifest+json" },
      });
    }
    if (url.endsWith("icon-192.png") || url.endsWith("icon-512.png")) return new Response("icon", { status: 200 });
    if (url === "https://kino.example/") {
      const isOfflineProbe = init?.headers?.[D.OFFLINE_PROBE_HEADER] === "1";
      if (isOfflineProbe && !offlineOk) return new Response("", { status: 503 });
      return new Response(isOfflineProbe ? "offline-shell" : "online-shell", { status: 200 });
    }
    throw new Error("unexpected-url");
  };
  return {
    window: { isSecureContext: true },
    isSecureContext: true,
    location: {
      href: "https://kino.example/download/", origin: "https://kino.example", pathname: "/download/",
    },
    navigator: {
      serviceWorker, storage: {},
      userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/132.0.0.0 Mobile",
    },
    caches: fakeCaches(), fetch,
    promptState: { available: prompt, standalone: false, installed: false },
  };
}

await check("Grüne App-Prüfung ohne Prompt bleibt ehrlich Browserhinweis 040", async () => {
  const report = await D.runDiagnostics(diagnosticEnvironment());
  assert.equal(report.primaryCode, "KD-PWA-ANDROID-040");
  assert.equal(report.checks.offline, "pass");
  assert.equal(report.checks.controller, "pass");
  assert.equal(report.capabilities.prompt, false);
});

await check("Grüne App-Prüfung mit Prompt liefert 000", async () => {
  const report = await D.runDiagnostics(diagnosticEnvironment({ prompt: true }));
  assert.equal(report.primaryCode, "KD-PWA-ANDROID-000");
  assert.equal(report.findings.length, 1);
});

await check("Online-Erfolg ersetzt keinen fehlgeschlagenen kontrollierten Offline-Start", async () => {
  const report = await D.runDiagnostics(diagnosticEnvironment({ prompt: true, offlineOk: false }));
  assert.equal(report.primaryCode, "KD-PWA-ANDROID-050");
  assert.equal(report.checks.offline, "fail");
  assert.equal(report.findings.some((entry) => entry.code === "KD-PWA-ANDROID-000"), false);
});

await check("Unsicherer Kontext hat Vorrang und bleibt fail-closed", async () => {
  const env = diagnosticEnvironment({ prompt: true });
  env.window.isSecureContext = false;
  env.isSecureContext = false;
  const report = await D.runDiagnostics(env);
  assert.equal(report.primaryCode, "KD-PWA-ANDROID-010");
  assert.equal(report.checks.secureContext, "fail");
});

await check("Prompt-Ablehnung, ausstehende Annahme und appinstalled werden stabil fortgeschrieben", async () => {
  const report = await D.runDiagnostics(diagnosticEnvironment({ prompt: true }));
  assert.equal(D.withPromptOutcome(report, "dismissed").primaryCode, "KD-PWA-ANDROID-041");
  assert.equal(D.withPromptOutcome(report, "accepted").primaryCode, "KD-PWA-ANDROID-042");
  assert.equal(D.withPromptOutcome(report, "installed").primaryCode, "KD-PWA-ANDROID-000");
});

await check("Diagnose persistiert keine Historie und kennt keinen Fremdtransport", () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest/);
  assert.doesNotMatch(source, /https?:\/\/(?!kino\.example)/);
  assert.match(source, /resolved\.origin !== pageOrigin/);
});

console.log(`PWA-ANDROID-DIAGNOSE-TEST BESTANDEN (${checks}/${checks})`);

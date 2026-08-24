#!/usr/bin/env node
/* Ausschliesslich lokale Mocks: kein Keychain-, Auth-, Supabase- oder
   Anbieteraufruf. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DeploymentEffectContractError,
  pruefeStagingWorkflowDeploymentEffects,
} from "./tools/deployment_effect_contract.mjs";
import {
  LiveFunctionReadbackFehler,
  bestaetigeFunctionDeploymentReadback,
  liesOwnerFunctionBuildMarker,
} from "./tools/live_function_readback.mjs";
import {
  ENTDECKEN_DAILY_ONCE_ENV,
  KEYCHAIN_ACCOUNTS,
  OWNER_CORE_SIX_GUARD_ENV,
  OWNER_SERVER_BUDGET_ENV,
  RADAR_WEBSEARCH_ONCE_ENV,
  baueOwnerReadbackUmgebung,
} from "./tools/keychain_runner.mjs";

const BUILD = "3de89519efda6840d2b6d741ad63bb2efb9e68fd";
const PROJECT = "projektref123";
const OWNER_PASS = "owner-secret-darf-nie-in-fehler";
const VORGANG = "11111111-1111-4111-8111-111111111111";
const PUBLIC = Object.freeze({
  KD_SB_URL: `https://${PROJECT}.supabase.co`,
  KD_SB_ANON: "sb_publishable_modern_public_key_1234567890",
  KD_OWNER_USER: "owner-lokal",
  KD_MAIL_DOMAIN: "login.kinodreieck.at",
  KD_AI_FUNKTION: "ai-task",
  KD_ORIGIN: "https://staging.kinodreieck.at",
});

function antwort(status, daten) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return daten; },
  };
}

let tests = 0;
async function test(name, fn) {
  await fn();
  tests += 1;
  console.log(`✓ ${name}`);
}

await test("providerfreier Owner-Readback braucht keine Acht-Pfade-Vorlaufkonfiguration", async () => {
  const env = baueOwnerReadbackUmgebung({
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser: () => OWNER_PASS,
  });
  assert.equal(env.KD_TESTA_USER, PUBLIC.KD_OWNER_USER);
  assert.equal(env.KD_TESTA_PASS, OWNER_PASS);
  assert.equal(env[OWNER_SERVER_BUDGET_ENV], undefined);
  assert.equal(env[OWNER_CORE_SIX_GUARD_ENV], undefined);
  assert.equal(env[ENTDECKEN_DAILY_ONCE_ENV], undefined);
  assert.equal(env[RADAR_WEBSEARCH_ONCE_ENV], undefined);
  assert.equal(env.KD_FILMWISSEN_TARGET_ID, undefined);
  assert.equal(env.KD_RADAR_TARGET_ID, undefined);
});

await test("lokaler Ownername plus Mail-Domain nutzt den normalen Keychain-/Authpfad", async () => {
  const keychainRufe = [];
  const netzRufe = [];
  const build = await liesOwnerFunctionBuildMarker({
    expectedBuildVersion: BUILD,
    expectedProjectRef: PROJECT,
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      keychainRufe.push(account);
      return OWNER_PASS;
    },
    vorgangId: VORGANG,
    async fetchImpl(url, optionen) {
      netzRufe.push({ url, optionen });
      if (url.endsWith("/auth/v1/token?grant_type=password")) {
        return antwort(200, { access_token: "owner-session" });
      }
      return antwort(200, { ok: true, buildVersion: BUILD });
    },
  });

  assert.equal(build, BUILD);
  assert.deepEqual(keychainRufe, [KEYCHAIN_ACCOUNTS.owner]);
  assert.equal(netzRufe.length, 2);
  const login = JSON.parse(netzRufe[0].optionen.body);
  assert.equal(login.email, "owner-lokal@login.kinodreieck.at");
  assert.equal(login.password, OWNER_PASS);
  assert.equal(netzRufe[0].optionen.headers.apikey, PUBLIC.KD_SB_ANON);
  const health = JSON.parse(netzRufe[1].optionen.body);
  assert.deepEqual(health, { task: "health", vorgangId: VORGANG });
  assert.equal(netzRufe[1].optionen.headers.Authorization, "Bearer owner-session");
});

await test("falsche Projektbindung stoppt vor Keychain und Netzwerk", async () => {
  let keychain = 0;
  let netz = 0;
  await assert.rejects(
    liesOwnerFunctionBuildMarker({
      expectedBuildVersion: BUILD,
      expectedProjectRef: "anderesprojekt1",
      lokaleKonfig: PUBLIC,
      keychainLeser() { keychain += 1; return OWNER_PASS; },
      async fetchImpl() { netz += 1; return antwort(500, null); },
    }),
    (error) => error instanceof LiveFunctionReadbackFehler
      && error.code === "LIVE_CONFIG_INVALID",
  );
  assert.equal(keychain, 0);
  assert.equal(netz, 0);
});

await test("Authfehler bleibt sanitisiert und erreicht Health nicht", async () => {
  let netz = 0;
  let fehler;
  try {
    await liesOwnerFunctionBuildMarker({
      expectedBuildVersion: BUILD,
      expectedProjectRef: PROJECT,
      lokaleKonfig: PUBLIC,
      keychainLeser: () => OWNER_PASS,
      async fetchImpl() {
        netz += 1;
        return antwort(401, { message: `roh ${OWNER_PASS}` });
      },
    });
  } catch (error) {
    fehler = error;
  }
  assert.equal(netz, 1);
  assert.equal(fehler?.code, "OWNER_AUTH_READBACK_FAILED");
  assert.doesNotMatch(String(fehler?.message), new RegExp(OWNER_PASS));
});

await test("abweichender Health-Buildmarker stoppt getrennt vom Authpfad", async () => {
  let netz = 0;
  await assert.rejects(
    liesOwnerFunctionBuildMarker({
      expectedBuildVersion: BUILD,
      expectedProjectRef: PROJECT,
      lokaleKonfig: PUBLIC,
      keychainLeser: () => OWNER_PASS,
      async fetchImpl(url) {
        netz += 1;
        return url.includes("/auth/v1/")
          ? antwort(200, { access_token: "owner-session" })
          : antwort(200, { ok: true, buildVersion: "0".repeat(40) });
      },
    }),
    (error) => error instanceof LiveFunctionReadbackFehler
      && error.code === "BUILD_MARKER_READBACK_FAILED",
  );
  assert.equal(netz, 2);
});

const MANAGEMENT = Object.freeze([
  Object.freeze({ slug: "ai-task", status: "ACTIVE", verify_jwt: true, version: 59 }),
  Object.freeze({ slug: "radar-websearch-task", status: "ACTIVE", verify_jwt: true, version: 31 }),
  Object.freeze({ slug: "entdecken-daily-task", status: "ACTIVE", verify_jwt: false, version: 29 }),
]);
const SOURCES = Object.freeze([
  Object.freeze({
    slug: "ai-task", status: "downloaded",
    localFiles: [{ path: "index.ts", bytes: "ai-v1" }],
    downloadedFiles: [{ path: "index.ts", bytes: "ai-v1" }],
  }),
  Object.freeze({
    slug: "radar-websearch-task", status: "downloaded",
    localFiles: [
      { path: "index.ts", bytes: "radar-index" },
      { path: "runner.js", bytes: Buffer.from("radar-runner") },
    ],
    downloadedFiles: [
      { path: "runner.js", bytes: Buffer.from("radar-runner") },
      { path: "index.ts", bytes: "radar-index" },
    ],
  }),
  Object.freeze({
    slug: "entdecken-daily-task", status: "downloaded",
    localFiles: [{ path: "index.ts", bytes: "entdecken-v1" }],
    downloadedFiles: [{ path: "index.ts", bytes: "entdecken-v1" }],
  }),
]);

await test("ACTIVE/JWT plus Marker und Byteabschluss bestaetigen alle drei Functions", async () => {
  const proof = bestaetigeFunctionDeploymentReadback({
    expectedBuildVersion: BUILD,
    healthBuildVersion: BUILD,
    managementFunctions: MANAGEMENT,
    sourceReadbacks: SOURCES,
  });
  assert.equal(proof.ok, true);
  assert.deepEqual(proof.functions.map(({ slug, version }) => ({ slug, version })), [
    { slug: "ai-task", version: 59 },
    { slug: "radar-websearch-task", version: 31 },
    { slug: "entdecken-daily-task", version: 29 },
  ]);
  assert.ok(proof.functions.every(({ sourceSha256 }) => /^[a-f0-9]{64}$/.test(sourceSha256)));
});

await test("Management-Versionsspruenge allein sind weder Drift- noch Quellbeleg", async () => {
  assert.throws(
    () => bestaetigeFunctionDeploymentReadback({
      expectedBuildVersion: BUILD,
      healthBuildVersion: BUILD,
      managementFunctions: MANAGEMENT,
      sourceReadbacks: SOURCES.map((entry) => (
        entry.slug === "radar-websearch-task" ? { ...entry, status: "unconfirmed" } : entry
      )),
    }),
    (error) => error instanceof LiveFunctionReadbackFehler
      && error.code === "FUNCTION_SOURCE_UNCONFIRMED",
  );
});

await test("abweichende Downloadbytes werden nie durch ACTIVE oder Version akzeptiert", async () => {
  assert.throws(
    () => bestaetigeFunctionDeploymentReadback({
      expectedBuildVersion: BUILD,
      healthBuildVersion: BUILD,
      managementFunctions: MANAGEMENT,
      sourceReadbacks: SOURCES.map((entry) => (
        entry.slug === "entdecken-daily-task"
          ? { ...entry, downloadedFiles: [{ path: "index.ts", bytes: "entdecken-drift" }] }
          : entry
      )),
    }),
    (error) => error instanceof LiveFunctionReadbackFehler
      && error.code === "FUNCTION_SOURCE_DRIFT",
  );
});

await test("ein Staging-Workflow darf genau Preview plus Staging und kein Production melden", async () => {
  const effects = pruefeStagingWorkflowDeploymentEffects({
    expectedHead: BUILD,
    expectedRunId: 12345,
    records: [
      { head: BUILD, runId: 12345, environment: "preview", state: "success" },
      { head: BUILD, runId: 12345, environment: "staging", state: "success" },
    ],
  });
  assert.deepEqual(effects, {
    ok: true, head: BUILD, runId: "12345", preview: 1, staging: 1, production: 0,
  });
  assert.throws(
    () => pruefeStagingWorkflowDeploymentEffects({
      expectedHead: BUILD,
      expectedRunId: 12345,
      records: [
        { head: BUILD, runId: 12345, environment: "preview", state: "success" },
        { head: BUILD, runId: 12345, environment: "production", state: "success" },
      ],
    }),
    (error) => error instanceof DeploymentEffectContractError
      && error.code === "WORKFLOW_EFFECT_DRIFT",
  );
});

await test("Pages-Workflow erklaert zwei Deployment-Metadaten, aber keinen Functiondeploy", async () => {
  const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
  const staging = workflow.match(/\n  deploy-staging:[\s\S]*?\n  deploy-production:/)?.[0] || "";
  assert.match(staging, /environment:\s*\n\s+name: staging/);
  assert.match(staging, /uses: cloudflare\/wrangler-action@v3/);
  assert.match(staging, /gitHubToken: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(staging, /pages deploy dist[\s\S]*?--branch=staging/);
  assert.doesNotMatch(workflow, /supabase\s+functions\s+deploy|functions\s+deploy\s+(?:ai-task|radar-websearch-task|entdecken-daily-task)/);
});

console.log(`\n${tests}/${tests} Live-Function-Readback-Tests bestanden.`);

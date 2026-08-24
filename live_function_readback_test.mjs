#!/usr/bin/env node
/* Ausschliesslich lokale Mocks: kein Keychain-, Auth-, Supabase- oder
   Anbieteraufruf. */

import assert from "node:assert/strict";
import {
  LiveFunctionReadbackFehler,
  liesOwnerFunctionBuildMarker,
} from "./tools/live_function_readback.mjs";
import { KEYCHAIN_ACCOUNTS } from "./tools/keychain_runner.mjs";

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
  KD_FILMWISSEN_TARGET_ID: "imdb:tt0081505",
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

console.log(`\n${tests}/${tests} Live-Function-Readback-Tests bestanden.`);

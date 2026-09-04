import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createRuntimeConfig,
  radarClientRuntimeAvailable,
} from "./src/config/runtime.js";
import {
  ENTDECKEN_JOYN_SOURCE_ID,
  ENTDECKEN_MIXED_MARKET_COUNTS,
  ENTDECKEN_MIXED_POOL_SIZE,
  ENTDECKEN_MIXED_SOURCE_COUNTS,
  ENTDECKEN_MIXED_SOURCE_REQUESTS,
  ENTDECKEN_OEFI_SOURCE_ID,
} from "./supabase/functions/entdecken-daily-task/publicMixAdapter.js";
import {
  evaluateReleaseManifestParity,
  localMigrationIds,
  RELEASE_CRITICAL_FUNCTIONS,
  RELEASE_MANIFEST_FORMAT,
} from "./tools/release-compatibility.mjs";
import {
  MIXED_DISCOVERY_MARKET_COUNTS,
  MIXED_DISCOVERY_POOL_SIZE,
  MIXED_DISCOVERY_SOURCE_IDS,
} from "./src/lib/webDiscoveryFeed.js";

const root = process.cwd();
const source = (path) => readFileSync(resolve(root, path), "utf8");
let checks = 0;
function check(name, test) {
  test();
  checks += 1;
  console.log(`✓ ${name}`);
}

check("R-02: dieselbe fail-closed Runtime-Capability steuert alle Radar-Einstiege", () => {
  const config = createRuntimeConfig({
    VITE_APP_ENV: "production",
    VITE_APP_URL: "https://kinodreieck.at",
    VITE_SUPABASE_URL: "https://fixture.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
    VITE_RADAR_PILOT_CLIENT_ENABLED: "true",
  });
  const ready = {
    singleFile: false,
    remoteAccountReady: true,
    accountCacheAuthority: true,
    clientEnabled: true,
  };
  assert.equal(radarClientRuntimeAvailable(config, ready), true);
  for (const unavailable of [
    { ...ready, singleFile: true },
    { ...ready, remoteAccountReady: false },
    { ...ready, accountCacheAuthority: false },
    { ...ready, clientEnabled: false },
  ]) assert.equal(radarClientRuntimeAvailable(config, unavailable), false);
  assert.equal(radarClientRuntimeAvailable({ ...config, supabasePublishableKey: "" }, ready), false);

  const app = source("src/App.jsx");
  const tab = source("src/tabs/EntdeckenTab.jsx");
  assert.match(app, /const radarRuntimeAvailable = radarClientRuntimeAvailable\(/u);
  assert.match(app, /radarAvailable=\{radarRuntimeAvailable\}/u);
  assert.match(app, /onSuchaktion=\{fuehreGlobaleSuchaktionAus\}/u);
  assert.match(app, /radarRuntimeAvailable \? kompakt\.items : kompakt\.items\.map/u);
  assert.match(tab, /const sichtbareAnsichten = radarAvailable/u);
  assert.match(tab, /\{radarAvailable && ansicht === "radar"/u);
  assert.match(tab, /\{radarAvailable \? <section>/u);
});

check("R-03: Function, Response und committed Format 6 teilen exakt den 50er Vertrag", () => {
  assert.equal(ENTDECKEN_MIXED_POOL_SIZE, 50);
  assert.equal(ENTDECKEN_MIXED_SOURCE_REQUESTS, 3);
  assert.deepEqual(ENTDECKEN_MIXED_MARKET_COUNTS, {
    cinema: 15,
    streamingFilm: 18,
    streamingSeries: 17,
  });
  assert.deepEqual(ENTDECKEN_MIXED_SOURCE_COUNTS, {
    [ENTDECKEN_OEFI_SOURCE_ID]: 15,
    [ENTDECKEN_JOYN_SOURCE_ID]: 35,
  });
  assert.equal(MIXED_DISCOVERY_POOL_SIZE, ENTDECKEN_MIXED_POOL_SIZE);
  assert.deepEqual(MIXED_DISCOVERY_MARKET_COUNTS, ENTDECKEN_MIXED_MARKET_COUNTS);
  assert.deepEqual([...MIXED_DISCOVERY_SOURCE_IDS].sort(), [
    ENTDECKEN_JOYN_SOURCE_ID, ENTDECKEN_OEFI_SOURCE_ID,
  ].sort());
  const migration = source("supabase/migrations/20260828180000_entdecken_mixed_pool_format_6.sql");
  assert.match(migration, /jsonb_array_length\(p_payload->'items'\) is distinct from 50/u);
  assert.match(migration, /v_cinema is distinct from 15/u);
  assert.match(migration, /v_streaming_film is distinct from 18/u);
  assert.match(migration, /v_streaming_series is distinct from 17/u);
  assert.match(migration, /'chart:joyn-at','chart:oefi-weekend-at'/u);
  const responseContract = source("supabase/functions/entdecken-daily-task/responseContract.js");
  assert.match(responseContract, /ENTDECKEN_PUBLIC_SOURCE_REQUESTS, ENTDECKEN_MIXED_SOURCE_REQUESTS/u);
});

check("R-14: die Online-UI verspricht keinen umgeleiteten Einzeldatei-Download", () => {
  const visibleSurfaces = [
    "src/tabs/StartTab.jsx",
    "src/tabs/DatenTab.jsx",
    "src/components/InstallationCard.jsx",
  ].map(source).join("\n");
  assert.doesNotMatch(visibleSurfaces, /href\s*=\s*["'{][^\n}]*\/download/iu);
  assert.doesNotMatch(visibleSurfaces, /Einzeldatei herunterladen|App installieren & Einzeldatei/iu);
  assert.match(source("public/_redirects"), /^\/download(?:\/\*)? \/ 302$/mu);
  assert.equal(existsSync(resolve(root, "build-single.mjs")), true);
});

check("R-15: Webcommit, sechs Functions und kompletter Migrationssatz failen geschlossen", () => {
  const webCommit = "a".repeat(40);
  const functions = RELEASE_CRITICAL_FUNCTIONS.map((name, index) => ({
    name,
    version: index + 1,
    sourceSha256: String(index + 1).padStart(64, "0"),
  }));
  const migrations = localMigrationIds(root);
  const expected = {
    format: RELEASE_MANIFEST_FORMAT,
    webCommit,
    functions,
    requiredMigrations: migrations,
  };
  const observed = {
    format: RELEASE_MANIFEST_FORMAT,
    webCommit,
    functions,
    migrations,
  };
  assert.equal(evaluateReleaseManifestParity({
    expected, observed, localWebCommit: webCommit, localMigrations: migrations,
  }).ok, true);

  const wrongCommit = evaluateReleaseManifestParity({
    expected, observed: { ...observed, webCommit: "b".repeat(40) },
    localWebCommit: webCommit, localMigrations: migrations,
  });
  assert.equal(wrongCommit.ok, false);
  assert.ok(wrongCommit.errors.includes("web-commit-match"));

  const wrongHashFunctions = functions.map((entry, index) => index === 0
    ? { ...entry, sourceSha256: "f".repeat(64) } : entry);
  const wrongHash = evaluateReleaseManifestParity({
    expected, observed: { ...observed, functions: wrongHashFunctions },
    localWebCommit: webCommit, localMigrations: migrations,
  });
  assert.equal(wrongHash.ok, false);
  assert.ok(wrongHash.errors.includes(`function:${RELEASE_CRITICAL_FUNCTIONS[0]}`));

  const wrongVersionFunctions = functions.map((entry, index) => index === 0
    ? { ...entry, version: entry.version + 1 } : entry);
  const wrongVersion = evaluateReleaseManifestParity({
    expected, observed: { ...observed, functions: wrongVersionFunctions },
    localWebCommit: webCommit, localMigrations: migrations,
  });
  assert.equal(wrongVersion.ok, false);
  assert.ok(wrongVersion.errors.includes(`function:${RELEASE_CRITICAL_FUNCTIONS[0]}`));

  const missingMigration = evaluateReleaseManifestParity({
    expected, observed: { ...observed, migrations: migrations.slice(1) },
    localWebCommit: webCommit, localMigrations: migrations,
  });
  assert.equal(missingMigration.ok, false);
  assert.ok(missingMigration.errors.includes("migration-set-match"));

  const incompleteFunctions = evaluateReleaseManifestParity({
    expected, observed: { ...observed, functions: functions.slice(1) },
    localWebCommit: webCommit, localMigrations: migrations,
  });
  assert.deepEqual(incompleteFunctions.errors, ["OBSERVED_FUNCTIONS_INCOMPLETE"]);
  assert.deepEqual(incompleteFunctions.checks, []);
});

check("R-17: masterlist-enrichment ist nicht mehr als aktive Clientaufgabe registriert", () => {
  const ai = source("src/services/ai.js");
  const taskRegistry = ai.match(/export const AI_TASKS = Object\.freeze\(\[([\s\S]*?)\]\);/u)?.[1];
  assert.ok(taskRegistry);
  assert.doesNotMatch(taskRegistry, /masterlist-enrichment/u);
  assert.match(taskRegistry, /film-forecast/u);
});

console.log(`\n${checks} B2-Vertragsprüfungen bestanden.`);

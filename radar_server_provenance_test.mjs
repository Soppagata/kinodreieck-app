/* Fokussierter, vollstaendig lokaler Radar-v5-Provenienz- und Servicecheck.
   Kein Netz, keine DB, kein Provider, kein Scheduler und kein Retry. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  acknowledgeAccountRadarPilotReceipt,
  createEmptyLocalRadar,
  queueAccountRadarPilotReceipt,
  reconcileAccountRadarPilotFeed,
} from "./src/lib/localEventRadar.js";
import { projectEntdeckenRadarPilot } from "./src/lib/radarPilotContracts.js";
import { resolveCanonicalFranchiseRadarTarget } from "./src/lib/titleGroupRadar.js";
import { createRadarWebsearchService } from "./src/services/radarWebsearch.js";
import {
  ENTDECKEN_WEEKLY_SOURCE_BUNDLE_SHA256,
  RADAR_DAILY_COMMIT,
  RADAR_DAILY_FILES,
  RADAR_DAILY_MIGRATION,
  RADAR_DAILY_RELEASE_SHA256,
  RADAR_DAILY_SOURCE_BUNDLE_SHA256,
  RADAR_DAILY_WORKFLOW,
  RADAR_ENTDECKEN_V6_RELEASE_MIGRATIONS,
  RADAR_ENTDECKEN_V6_RELEASE_SHA256,
  RADAR_TEXT_TARGET_COMMIT,
  RADAR_TEXT_TARGET_FILES,
  RADAR_TEXT_TARGET_ORIGIN_COMMIT,
  RADAR_TEXT_TARGET_RELEASE_MIGRATIONS,
  RADAR_TEXT_TARGET_RELEASE_SHA256,
  RADAR_TEXT_TARGET_SOURCE_BUNDLE_SHA256,
  RADAR_V6_SOURCE_BUNDLE_SHA256,
  requireRadarDeployedV5Provenance,
  requireRadarDailyReleaseProvenance,
  requireRadarEntdeckenV6ReleaseProvenance,
  requireRadarTextTargetReleaseProvenance,
} from "./tools/radar_websearch_remote_start.mjs";

let checks = 0;
async function check(name, run) {
  await run();
  checks += 1;
  console.log(`✓ ${name}`);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function fileSha(path) { return sha256(fs.readFileSync(path)); }

const deployedV5 = Object.freeze({
  acceptedBaselineCommit: "02852ece7f6fe1c3e63b8910b0faf93cea307479",
  sourceCommit: "e2154483b2c378bb54a63b3101c30a389d451997",
  bundleSha256: "52f2e82d9909b36bd209b73e52eeb0d112ee4473ace30cb632913742e10d2bad",
  closureSha256: "841e395b80dd2580d21a10620b55da1f139908c767154ffaeb587404beb09e6f",
  files: Object.freeze([
    ["supabase/functions/radar-websearch-task/anthropicAdapter.js", "abd64082191434eb91892303ca655926fc75916ddf4148ba2629082c1c52efcc"],
    ["supabase/functions/radar-websearch-task/contract.js", "248da1034f320b6bed48e98f02c3e42b4a2899473e0a4232ef46b02bdfe5f2c8"],
    ["supabase/functions/radar-websearch-task/index.ts", "6a79fab4386a6c634530fb7db936b70995786be02c9cab2c47ab3e2401c065ac"],
    ["supabase/functions/radar-websearch-task/mockAdapter.js", "a7e02f1b98f7aa48ae0b0838a474071409cce9613c8758562a968aa29555a9c3"],
    ["supabase/functions/radar-websearch-task/runner.js", "7e51264964f11a697178ad0d6fd319709132611764f3cfaafa636d5de44eab03"],
  ]),
  migrations: Object.freeze([
    ["supabase/migrations/20260819220000_radar_person_server_candidate.sql", "d23f80f7073deb1197fdcb0b5a73f4abd1ad002e0b3bded6ee08c691d937f658"],
    ["supabase/migrations/20260821120000_radar_person_catalog_repair.sql", "8d2624a4ee34dae6b8080ba1bdb74f402c8144328815d21c99762cc22c6af765"],
    ["supabase/migrations/20260821130000_radar_title_group.sql", "6e1b7b8a638536f223d82fd62220b80e130da0ba20e855336145d5afc31b228c"],
  ]),
});
function fileAtAcceptedV5(pathname) {
  return execFileSync("/usr/bin/git", [
    "show", `${deployedV5.acceptedBaselineCommit}:${pathname}`,
  ], { cwd: process.cwd(), encoding: null });
}
const radarEntdeckenV6BaselineCommit = "8b1f4aa654bf4c272514a8e9fb4918dda42eac0b";
function fileAtAcceptedV6(pathname) {
  return execFileSync("/usr/bin/git", [
    "show", `${radarEntdeckenV6BaselineCommit}:${pathname}`,
  ], { cwd: process.cwd(), encoding: null });
}
function fileAtRadarTextSource(pathname) {
  return execFileSync("/usr/bin/git", [
    "show", `${RADAR_TEXT_TARGET_COMMIT}:${pathname}`,
  ], { cwd: process.cwd(), encoding: null });
}
function provenancePath(absolutePath) {
  return path.relative(process.cwd(), String(absolutePath)).split(path.sep).join("/");
}

await check("Deployte v5-Function bleibt im angenommenen Baselinecommit bytegenau gebunden und blockiert v6-Rollback", () => {
  const closureRows = deployedV5.files.map(([path, expected]) => {
    const actual = sha256(fileAtAcceptedV5(path));
    assert.equal(actual, expected, path);
    return { path, sha256: actual };
  });
  assert.equal(sha256(JSON.stringify(closureRows)), deployedV5.closureSha256);
  for (const [path, expected] of deployedV5.migrations) assert.equal(fileSha(path), expected, path);
  assert.match(deployedV5.sourceCommit, /^[a-f0-9]{40}$/);
  assert.match(deployedV5.bundleSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(requireRadarDeployedV5Provenance({
    readFile(absolutePath) {
      return fileAtAcceptedV5(path.relative(process.cwd(), String(absolutePath)).split(path.sep).join("/"));
    },
  }), {
    bundleSha256: deployedV5.bundleSha256,
    closureSha256: deployedV5.closureSha256,
    files: closureRows,
  });
  assert.throws(() => requireRadarDeployedV5Provenance(), (error) => (
    error?.code === "RADAR_V5_PROVENANCE_DRIFT"
  ));
});

await check("Neuer Deployzaun bindet Radar v6, Entdecken-Wochenfeed und alle vier Forward-Migrationen bytegenau", () => {
  const release = requireRadarEntdeckenV6ReleaseProvenance({
    readFile(absolutePath) {
      return fileAtAcceptedV6(provenancePath(absolutePath));
    },
  });
  assert.equal(release.releaseSha256, RADAR_ENTDECKEN_V6_RELEASE_SHA256);
  assert.equal(
    sha256(JSON.stringify(release.functions.radar)),
    RADAR_V6_SOURCE_BUNDLE_SHA256,
  );
  assert.equal(
    sha256(JSON.stringify(release.functions.entdecken)),
    ENTDECKEN_WEEKLY_SOURCE_BUNDLE_SHA256,
  );
  assert.deepEqual(
    release.migrations.map(({ version, name, sha256: digest }) => ({ version, name, sha256: digest })),
    RADAR_ENTDECKEN_V6_RELEASE_MIGRATIONS.map(({ version, name, sha256: digest }) => ({ version, name, sha256: digest })),
  );
  assert.notEqual(RADAR_V6_SOURCE_BUNDLE_SHA256, deployedV5.closureSha256);

  const migrationPath = RADAR_ENTDECKEN_V6_RELEASE_MIGRATIONS[1].path;
  assert.throws(() => requireRadarEntdeckenV6ReleaseProvenance({
    readFile(absolutePath) {
      const pathname = provenancePath(absolutePath);
      const bytes = fileAtAcceptedV6(pathname);
      return pathname === migrationPath ? Buffer.concat([bytes, Buffer.from("\n-- drift")]) : bytes;
    },
  }), (error) => error?.code === "RADAR_V6_RELEASE_PROVENANCE_DRIFT");
});

await check("Aktueller Radar-Text-Target-Zaun bindet Quellcommit, sechs Runtime-Dateien und Forward-Migration bytegenau", () => {
  assert.equal(RADAR_TEXT_TARGET_ORIGIN_COMMIT, "3c3482041c9036eefa3cd6f8b2d25a48549fcdf8");
  assert.equal(RADAR_TEXT_TARGET_COMMIT, "e312deea826efc53dd7281edf74f10cd42b17ffc");
  assert.deepEqual(RADAR_TEXT_TARGET_FILES.map(({ path: pathname }) => pathname), [
    "supabase/functions/radar-websearch-task/anthropicAdapter.js",
    "supabase/functions/radar-websearch-task/contract.js",
    "supabase/functions/radar-websearch-task/index.ts",
    "supabase/functions/radar-websearch-task/runner.js",
    "supabase/functions/_shared/providerDiagnostic.js",
    "supabase/functions/_shared/providerText.js",
  ]);
  assert.equal(RADAR_TEXT_TARGET_FILES.some(({ path: pathname }) => pathname.endsWith("/mockAdapter.js")), false);
  for (const { path: pathname, sha256: digest } of RADAR_TEXT_TARGET_FILES) {
    assert.equal(sha256(fileAtRadarTextSource(pathname)), digest, pathname);
  }
  const release = requireRadarTextTargetReleaseProvenance({
    readFile(absolutePath) {
      return fileAtRadarTextSource(provenancePath(absolutePath));
    },
  });
  assert.equal(release.releaseSha256, RADAR_TEXT_TARGET_RELEASE_SHA256);
  assert.deepEqual(release.functions.radar, RADAR_TEXT_TARGET_FILES);
  assert.equal(
    sha256(JSON.stringify(release.functions.radar)),
    RADAR_TEXT_TARGET_SOURCE_BUNDLE_SHA256,
  );
  assert.deepEqual(
    release.migrations.map(({ version, name, sha256: digest }) => ({ version, name, sha256: digest })),
    RADAR_TEXT_TARGET_RELEASE_MIGRATIONS.map(({ version, name, sha256: digest }) => ({ version, name, sha256: digest })),
  );

  const migrationPath = RADAR_TEXT_TARGET_RELEASE_MIGRATIONS[0].path;
  assert.throws(() => requireRadarTextTargetReleaseProvenance({
    readFile(absolutePath) {
      const pathname = provenancePath(absolutePath);
      const bytes = fileAtRadarTextSource(pathname);
      return pathname === migrationPath ? Buffer.concat([bytes, Buffer.from("\n-- drift")]) : bytes;
    },
  }), (error) => error?.code === "RADAR_TEXT_TARGET_RELEASE_PROVENANCE_DRIFT");

  const sharedPath = "supabase/functions/_shared/providerText.js";
  assert.throws(() => requireRadarTextTargetReleaseProvenance({
    readFile(absolutePath) {
      const pathname = provenancePath(absolutePath);
      const bytes = fileAtRadarTextSource(pathname);
      return pathname === sharedPath ? Buffer.concat([bytes, Buffer.from("\n// drift")]) : bytes;
    },
  }), (error) => error?.code === "RADAR_TEXT_TARGET_RELEASE_PROVENANCE_DRIFT");
});

await check("Historischer Radar-Tagesrelease bleibt belegbar, sein ersetzter Workflow ist lokal entfernt", () => {
  assert.equal(RADAR_DAILY_COMMIT, "4ce2f4b0664ff56e90ebf7a825e4eac7c205714f");
  assert.deepEqual(RADAR_DAILY_FILES.map(({ path: pathname }) => pathname), [
    "supabase/functions/radar-websearch-task/anthropicAdapter.js",
    "supabase/functions/radar-websearch-task/contract.js",
    "supabase/functions/radar-websearch-task/index.ts",
    "supabase/functions/radar-websearch-task/runner.js",
    "supabase/functions/_shared/providerDiagnostic.js",
    "supabase/functions/_shared/providerReceipt.js",
    "supabase/functions/_shared/providerText.js",
  ]);
  for (const { path: pathname, sha256: digest } of [
    ...RADAR_DAILY_FILES,
    RADAR_DAILY_MIGRATION,
    RADAR_DAILY_WORKFLOW,
  ]) {
    const committed = execFileSync("/usr/bin/git", [
      "show", `${RADAR_DAILY_COMMIT}:${pathname}`,
    ], { cwd: process.cwd(), encoding: null });
    assert.equal(sha256(committed), digest, pathname);
  }
  const release = requireRadarDailyReleaseProvenance({
    stat() {
      return { isFile: () => true, isSymbolicLink: () => false };
    },
    readFile(absolutePath) {
      return execFileSync("/usr/bin/git", [
        "show", `${RADAR_DAILY_COMMIT}:${provenancePath(absolutePath)}`,
      ], { cwd: process.cwd(), encoding: null });
    },
  });
  assert.equal(release.releaseSha256, RADAR_DAILY_RELEASE_SHA256);
  assert.equal(sha256(JSON.stringify(release.files)), RADAR_DAILY_SOURCE_BUNDLE_SHA256);
  assert.deepEqual(release.migration, RADAR_DAILY_MIGRATION);
  assert.deepEqual(release.workflow, RADAR_DAILY_WORKFLOW);
  assert.throws(() => requireRadarDailyReleaseProvenance(), (error) => (
    ["RADAR_DAILY_RELEASE_PROVENANCE_DRIFT", "CLOSURE_FILE_MISSING"].includes(error?.code)
  ));
});

const franchiseCatalog = Object.freeze([
  Object.freeze({ targetId: "watchmode:71001", targetType: "work", title: "Star Wars: Episode I", year: 1999, franchiseId: "wikidata:Q462" }),
  Object.freeze({ targetId: "watchmode:71004", targetType: "work", title: "Star Wars: Episode IV", year: 1977, franchiseId: "wikidata:Q462" }),
  Object.freeze({ targetId: "watchmode:79999", targetType: "work", title: "Star Wards", year: 2026, franchiseId: "wikidata:Q999999" }),
]);
const starWars = resolveCanonicalFranchiseRadarTarget({ name: "Star Wars", catalog: franchiseCatalog });

await check("Produktlogik loest keinen eingebauten Reihenbeispielvertrag mehr auf", () => {
  assert.equal(starWars.status, "unresolved");
  assert.equal(starWars.franchise, null);
  assert.equal(starWars.target, null);
  assert.equal(resolveCanonicalFranchiseRadarTarget({ name: "Star Wards", catalog: franchiseCatalog }).status, "unresolved");
});
const legacyTitleGroupTarget = Object.freeze({
  targetId: "title-group:v1:star-wars",
  targetType: "franchise",
  title: "Star Wars",
  titleGroup: Object.freeze({
    format: "kd-radar-title-group-v1",
    queryVersion: "title-group-query-v1",
    queryKey: "star wars",
    displayName: "Star Wars",
    members: Object.freeze(franchiseCatalog.slice(0, 2).map(({ franchiseId, ...member }) => Object.freeze(member))),
  }),
});

const checkedAt = "2026-08-20T08:01:00.000Z";
const personIdentity = Object.freeze({
  targetId: "person:wikidata:Q42869:actor",
  personExternalId: "wikidata:Q42869",
  name: "Nicolas Cage",
  role: "actor",
  canonical: true,
});
const personResult = Object.freeze({
  targetId: personIdentity.targetId,
  status: "confirmed",
  checkedAt,
  windowStart: "2026-08-14",
  windowEnd: "2026-08-20",
  person: Object.freeze({
    personExternalId: personIdentity.personExternalId,
    name: personIdentity.name,
    role: personIdentity.role,
    canonical: true,
  }),
  candidates: Object.freeze([]),
});
const serviceCalls = [];
const serverService = createRadarWebsearchService({
  config: {
    radarPilotClientEnabled: true,
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "publishable-mock-key",
  },
  auth: { getSnapshot: () => accountSession },
  getAccount: () => ({ id: "account-a" }),
  getAccessToken: async () => "token-mock",
  fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    serviceCalls.push({ url, body });
    const payload = body.targetId === personIdentity.targetId
      ? { ok: true, status: "confirmed", writes: 1, providerRequests: 1, searchRequests: 1, personResult }
      : { ok: true, status: "confirmed", writes: 1, providerRequests: 1, searchRequests: 1 };
    return { ok: true, status: 200, async json() { return payload; } };
  },
  singleFile: false,
});
const accountSession = Object.freeze({ mode: "account", state: "ready", account: Object.freeze({ id: "account-a" }) });

await check("Person und Star-Wars-Reihe gehen mit ausschließlich der starken Ziel-ID über den Serverservice", async () => {
  const person = await serverService.checkPersonNow(personIdentity);
  const franchise = await serverService.checkNow(legacyTitleGroupTarget.targetId);
  assert.equal(person.status, "confirmed");
  assert.equal(franchise.status, "confirmed");
  assert.deepEqual(serviceCalls.map((entry) => entry.body), [
    { targetId: personIdentity.targetId },
    { targetId: legacyTitleGroupTarget.targetId },
  ]);
  assert.ok(serviceCalls.every((entry) => entry.url.endsWith("/functions/v1/radar-websearch-task")));
});

const evidence = Object.freeze([Object.freeze({
  sourceId: "source:official",
  sourceDomain: "example.com",
  url: "https://example.com/radar/termin",
  retrievedAt: "2026-08-20T08:00:00.000Z",
})]);
const personEventId = "11111111-1111-4111-8111-111111111111";
const personVersionId = "22222222-2222-4222-8222-222222222222";
const franchiseEventId = "33333333-3333-4333-8333-333333333333";
const franchiseVersionId = "44444444-4444-4444-8444-444444444444";
const subscriptions = Object.freeze([
  Object.freeze({
    targetId: personIdentity.targetId, targetType: "person", title: personIdentity.name,
    region: "AT", scope: "all", status: "active", updatedAt: checkedAt,
    personExternalId: personIdentity.personExternalId, personRole: personIdentity.role,
  }),
  Object.freeze({
    targetId: legacyTitleGroupTarget.targetId, targetType: "franchise", title: "Star Wars",
    region: "AT", scope: "all", status: "active", updatedAt: checkedAt,
    titleGroup: legacyTitleGroupTarget.titleGroup,
  }),
]);
const events = Object.freeze([
  Object.freeze({
    eventId: personEventId, eventVersionId: personVersionId, targetId: "watchmode:101",
    eventType: "kinostart_at", date: "2026-08-20", region: "AT", platform: "-",
    lifecycleStatus: "scheduled", verificationStatus: "confirmed", evidence,
  }),
  Object.freeze({
    eventId: franchiseEventId, eventVersionId: franchiseVersionId, targetId: "watchmode:71004",
    eventType: "streamingstart_at", date: "2026-08-20", region: "AT", platform: "Teststream",
    lifecycleStatus: "scheduled", verificationStatus: "confirmed", evidence,
  }),
]);
const fullPersonResult = Object.freeze({
  ...personResult,
  candidates: Object.freeze([Object.freeze({
    targetId: "watchmode:101", targetType: "work", title: "Neues Cage-Projekt", year: 2026,
    role: "actor", eventType: "kinostart_at", date: "2026-08-20", region: "AT", platform: "-", evidence,
  })]),
});
const feed = Object.freeze({
  format: "kd-radar-pilot-feed-v2",
  revision: 1,
  checksum: "a".repeat(64),
  reconciledAt: checkedAt,
  subscriptions,
  events,
  receipts: Object.freeze([]),
  operationAcks: Object.freeze([]),
  radarReview: true,
  personResults: Object.freeze([fullPersonResult]),
});

await check("Nur belegte neue Events werden idempotent projiziert; Pin entsteht erst durch Nutzeraktion", () => {
  const first = reconcileAccountRadarPilotFeed(createEmptyLocalRadar({ authority: "account-cache" }), feed);
  assert.equal(first.ok, true, first.errors?.join(","));
  const projection = projectEntdeckenRadarPilot({
    clientEnabled: true, radarAuthority: "account-cache", radarState: first.state,
  });
  assert.equal(projection.events.length, 2);
  assert.ok(projection.events.every((entry) => entry.verificationStatus === "confirmed" && entry.evidence.length >= 1));
  assert.equal(first.state.receipts.length, 0);
  assert.equal(first.state.pilot.receiptOutbox.length, 0);

  const repeated = reconcileAccountRadarPilotFeed(first.state, feed);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.state.pilot.events.length, 2);

  const queued = queueAccountRadarPilotReceipt(repeated.state, {
    eventId: franchiseEventId,
    eventVersionId: franchiseVersionId,
    status: "accepted_week",
    now: checkedAt,
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.state.receipts.length, 0);
  assert.equal(queued.state.pilot.receiptOutbox.length, 1);
  const pinned = acknowledgeAccountRadarPilotReceipt(queued.state, franchiseVersionId, checkedAt);
  assert.equal(pinned.ok, true);
  assert.deepEqual(pinned.state.receipts.map(({ versionId, status }) => ({ versionId, status })), [
    { versionId: franchiseVersionId, status: "accepted_week" },
  ]);

  const invalidFeed = { ...feed, events: [{ ...events[0], evidence: [] }] };
  const rejected = reconcileAccountRadarPilotFeed(pinned.state, invalidFeed);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.state, pinned.state);
});

await check("Nur explizites neues Textsave startet initial; Boot und gefenceter Scheduler bleiben getrennt", () => {
  const source = fs.readFileSync("src/controllers/useEntdeckenRadarController.js", "utf8");
  const functionSource = fs.readFileSync("supabase/functions/radar-websearch-task/index.ts", "utf8");
  assert.doesNotMatch(source, /radarServerService|\.checkPersonNow\(/);
  assert.equal((source.match(/\.checkNow\(/g) || []).length, 1);
  const start = source.indexOf("const fuegeRadarFreitextHinzu = useCallback");
  const end = source.indexOf("const localPersonRadarAvailable", start);
  assert.doesNotMatch(source.slice(0,start) + source.slice(end), /\.checkNow\(/);
  assert.match(source.slice(start,end), /const canSearch = newlyAdded && active/);
  assert.match(source.slice(start,end), /if \(!canSearch\) return[\s\S]*\.checkNow\(targetId, normalizedTargetText, \{ initial: true \}\)/);
  assert.match(functionSource, /admin\.rpc\("kd_radar_initial_claim"/);
  assert.match(functionSource, /admin\.rpc\("kd_radar_daily_claim"\)/);
  assert.match(functionSource, /await assertDailyLease\(\)/);
  assert.match(functionSource, /runRadarWebsearchCheck\(/);
  assert.match(functionSource, /admin\.rpc\("kd_radar_daily_finish"/);
});

console.log(`\n${checks} Radar-Serverprovenienz-Checks bestanden.`);
console.log("Betrieb: lokale Mocks · kein Netz · keine DB · kein Anbieter · kein Retry");

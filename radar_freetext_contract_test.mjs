import assert from "node:assert/strict";
import fs from "node:fs";
import {
  changeLocalTextRadarSubscription,
  createEmptyLocalRadar,
  createLocalTextRadarTargetId,
  queueAccountTextRadarChange,
  queueUnsyncedAccountTextRadarTargets,
} from "./src/lib/localEventRadar.js";
import {
  RADAR_WEBSEARCH_FEE_USD_CENT,
  RADAR_WEBSEARCH_MAX_TOKENS,
  RADAR_WEBSEARCH_TASK_CAP_USD_CENT,
  buildAnthropicRadarWebsearchBody,
} from "./supabase/functions/radar-websearch-task/anthropicAdapter.js";
import {
  evaluateTextRadarWebsearchResponse,
} from "./supabase/functions/radar-websearch-task/contract.js";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const checkedAt = "2026-08-30T10:00:00.000Z";
const source = Object.freeze({
  sourceId: "press-at",
  domain: "press.example",
  publisherFamily: "press-example",
  sourceClass: "official",
  subdomainsAllowed: false,
  active: true,
  attributionApproved: true,
  rightsStatus: "approved",
});
const targetText = "Unbekannte Alpenkrimis mit Fortsetzung";
const request = Object.freeze({
  kind: "text",
  targetId: createLocalTextRadarTargetId(targetText),
  targetText,
  region: "AT",
  scopes: Object.freeze(["cinema", "streaming", "series_start", "season_start"]),
});
const setup = Object.freeze({
  radarEnabled: true,
  radarProviderEnabled: true,
  radarSchedulerEnabled: false,
  providerAllowed: true,
  modelAlias: "klein",
  model: "claude-haiku-4-5",
  maxTokens: RADAR_WEBSEARCH_MAX_TOKENS,
  taskCapUsdCent: RADAR_WEBSEARCH_TASK_CAP_USD_CENT,
  searchFeeUsdCent: RADAR_WEBSEARCH_FEE_USD_CENT,
  globalRequestCapUsdCent: 500,
  timeoutMs: 30_000,
  inputPriceUsdCentPerMtok: 100,
  outputPriceUsdCentPerMtok: 500,
  sourceRegistry: [source],
});
const proof = Object.freeze({
  url: "https://press.example/ankuendigung",
  sourceDomain: "press.example",
  sourceTitle: "Terminankündigung",
  claim: "Österreichischer Start am 15. Oktober 2032.",
  publishedAt: "2026-08-29",
});
const relationProof = Object.freeze({
  url: "https://press.example/werkbezug",
  sourceDomain: "press.example",
  sourceTitle: "Werkbezug",
  claim: "Das angekündigte Werk gehört eindeutig zum gespeicherten Freitextziel.",
  publishedAt: "2026-08-28",
});

function candidate(patch = {}) {
  const basis = {
    targetId: "imdb:tt1234567",
    targetType: "series",
    title: "Alpenglühen",
    year: 2032,
    eventType: "serienstart",
    eventDate: "2032-10-15",
    region: "AT",
    platform: "-",
    seasonNumber: null,
    relationEvidence: [relationProof],
    evidence: [proof],
    ...patch,
  };
  return basis;
}

function envelope(candidates) {
  return {
    searchResultCount: 2,
    response: {
      status: "confirmed",
      checkedAt,
      textTarget: { targetId: request.targetId, targetText },
      candidates,
    },
  };
}

check("Beliebiger Nichtleertext wird providerfrei in die Konto-Outbox gelegt", () => {
  for (const [index, value] of [targetText, "Animationsfilme aus Tirol", "Neue historische Miniserien"].entries()) {
    const result = queueAccountTextRadarChange(createEmptyLocalRadar({ authority: "account-cache" }), {
      operationId: `81000000-0000-4000-8000-00000000000${index}`,
      action: "upsert",
      targetText: value,
      now: checkedAt,
    });
    assert.equal(result.ok, true);
    assert.equal(result.createsProviderJob, false);
    assert.equal(result.state.outbox[0].title, value);
    assert.equal(result.state.outbox[0].targetId, createLocalTextRadarTargetId(value));
  }
});

check("Bestehendes lokales Freitextziel wird im Kontomodus genau einmal providerfrei zur Synchronisation eingereiht", () => {
  const local = changeLocalTextRadarSubscription(
    createEmptyLocalRadar({ authority: "account-cache" }),
    { targetText, action: "upsert", now: checkedAt },
  );
  assert.equal(local.ok, true);
  let operationCounter = 0;
  const prepared = queueUnsyncedAccountTextRadarTargets(local.state, {
    createOperationId() {
      operationCounter += 1;
      return "82000000-0000-4000-8000-000000000001";
    },
    now: checkedAt,
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.changed, true);
  assert.equal(prepared.createsProviderJob, false);
  assert.equal(prepared.state.outbox.length, 1);
  assert.deepEqual(prepared.state.outbox[0], {
    operationId: "82000000-0000-4000-8000-000000000001",
    action: "upsert",
    targetId: createLocalTextRadarTargetId(targetText),
    targetType: "text",
    title: targetText,
    region: "AT",
    scope: "all",
    status: "pending",
    createdAt: checkedAt,
    reason: null,
  });
  const repeated = queueUnsyncedAccountTextRadarTargets(prepared.state, {
    createOperationId() {
      operationCounter += 1;
      return "82000000-0000-4000-8000-000000000002";
    },
    now: checkedAt,
  });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.state.outbox.length, 1);
  assert.equal(operationCounter, 1);
});

check("Additive Browser-RPC ist auth.uid-gebunden, kontingentiert und providerfrei", () => {
  const migration = fs.readFileSync(
    "./supabase/migrations/20260830130000_radar_freetext_subscription.sql",
    "utf8",
  );
  assert.equal(
    (migration.match(/create function public\.kd_radar_pilot_set_text_subscription\s*\(/gi) || []).length,
    1,
  );
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/);
  assert.match(migration, /not public\.kd_radar_pilot_allowed\(\)/);
  assert.match(migration, /v_target_key := public\.kd_radar_text_target_key\(p_target_text\)/);
  assert.match(migration, /capability\.radar_unlimited/);
  assert.match(migration, /v_active_others >= 10/);
  assert.match(migration, /operation\.account_id = v_actor_id/);
  assert.match(migration, /subscription\.account_id = v_actor_id/);
  assert.match(migration, /'AT', 'all'/);
  assert.match(migration, /grant execute[\s\S]*to authenticated;/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(migration, /\bp_account_id\b|\bp_target_key\b|\bp_scope\b/i);
  assert.doesNotMatch(
    migration,
    /kd_radar_websearch_|kd_ai_|net\.http|http_post|anthropic|cron\./i,
  );
});

check("Providerquery entsteht ausschließlich aus dem gespeicherten Freitext", () => {
  const body = buildAnthropicRadarWebsearchBody(request, setup);
  const input = JSON.parse(body.messages[0].content);
  assert.equal(input.targetText, targetText);
  assert.equal(input.searchQuery, `${targetText} neuer Film neue Serie Start Österreich`);
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].max_uses, 1);
});

check("Interne starke Werk-ID bleibt aus der sichtbaren Fundkarte heraus", () => {
  const result = evaluateTextRadarWebsearchResponse(envelope([candidate()]), request, [source]);
  assert.equal(result.status, "confirmed", result.errors.join(","));
  assert.equal(result.textResult.candidates[0].targetId, "imdb:tt1234567");
  assert.deepEqual(Object.keys(result.textResult.candidates[0]).filter((key) => (
    ["title", "date", "targetType", "platform"].includes(key)
  )), ["targetType", "title", "date", "platform"]);
});

check("Ein aktueller Beleg erlaubt einen glaubhaften Zukunftstermin, sein Artikeldatum bleibt intern", () => {
  const result = evaluateTextRadarWebsearchResponse(envelope([candidate()]), request, [source]);
  assert.equal(result.status, "confirmed", result.errors.join(","));
  assert.equal(result.textResult.candidates[0].date, "2032-10-15");
  assert.equal(result.textResult.candidates[0].evidence[0].publishedAt, "2026-08-29");
  assert.notEqual(result.textResult.candidates[0].date, result.textResult.candidates[0].evidence[0].publishedAt);
});

check("Ein Artikeldatum kann ein fehlendes Inhalts-Startdatum nicht ersetzen", () => {
  const result = evaluateTextRadarWebsearchResponse(envelope([candidate({ eventDate: undefined })]), request, [source]);
  assert.equal(result.status, "insufficient_evidence");
  assert.deepEqual(result.textResult.candidates, []);
});

check("Mehrdeutige Datumsvarianten derselben Composite-Identität blockieren deterministisch", () => {
  const first = candidate();
  const second = candidate({ eventDate: "2032-10-16", targetId: first.targetId });
  const result = evaluateTextRadarWebsearchResponse(envelope([first, second]), request, [source]);
  assert.equal(result.status, "insufficient_evidence");
  assert.ok(result.errors.includes("response-text-candidate-ambiguous"));
});

console.log(`\n${checks} Freitext-Radar-Vertragschecks bestanden.`);

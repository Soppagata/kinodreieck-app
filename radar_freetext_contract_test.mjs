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
  parseAnthropicRadarWebsearchResponse,
  createAnthropicRadarWebsearchAdapter,
  estimateRadarWebsearchReservation,
} from "./supabase/functions/radar-websearch-task/anthropicAdapter.js";
import {
  evaluateTextRadarWebsearchResponse,
  createTextRadarReleaseId,
} from "./supabase/functions/radar-websearch-task/contract.js";
import { runRadarWebsearchCheck } from "./supabase/functions/radar-websearch-task/runner.js";
import { validateRadarPilotEvent } from "./src/lib/radarPilotContracts.js";

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
  assert.equal(input.discoveryQueries.length, 2);
  assert.ok(input.discoveryQueries.every((query) => query.startsWith(targetText) && !query.includes("Österreich")));
  assert.ok(input.englishFallback.startsWith(targetText));
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].max_uses, 4);
  assert.equal("allowed_domains" in body.tools[0], false);
});

check("Interne starke Werk-ID bleibt aus der sichtbaren Fundkarte heraus", () => {
  const result = evaluateTextRadarWebsearchResponse(envelope([candidate()]), request, [source]);
  assert.equal(result.status, "confirmed", result.errors.join(","));
  assert.match(result.textResult.candidates[0].targetId, /^release:v1:/);
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

check("Widersprüchliche Starttermine derselben Kategorie werden nicht geraten", () => {
  const first = candidate();
  const second = candidate({ eventDate: "2032-10-16", targetId: first.targetId });
  const result = evaluateTextRadarWebsearchResponse(envelope([first, second]), request, [source]);
  assert.equal(result.status, "insufficient_evidence");
  assert.ok(result.errors.includes("response-text-candidate-ambiguous"));
});

function minimal(patch = {}) {
  return { title: "Neues Alpenlicht", eventType: "serienstart", eventDate: "2026-10-15", evidence: [proof], ...patch };
}

check("Minimum ohne externe ID, Jahr, zweite Beleggruppe oder Plattform bleibt ein belegter Fund", () => {
  const editorial = { ...source, sourceClass: "editorial" };
  const evaluated = evaluateTextRadarWebsearchResponse(envelope([minimal()]), request, [editorial]);
  assert.equal(evaluated.status, "confirmed");
  const found = evaluated.textResult.candidates[0];
  assert.match(found.targetId, /^release:v1:[a-f0-9]{16}$/);
  assert.equal(found.targetType, "series");
  assert.equal(found.year, null);
  assert.equal(found.platform, "-");
  assert.equal(found.evidence.length, 1);
  const streaming=evaluateTextRadarWebsearchResponse(envelope([minimal({eventType:"streamingstart_at",category:"film"})]),request,[]);
  assert.equal(streaming.status,"confirmed"); assert.equal(streaming.textResult.candidates[0].targetType,"work");
});

check("Composite-Release-ID trennt Datum und Kategorie und matcht nie nur den Titel", () => {
  const value = { ...minimal(), targetType: "series" };
  const key = createTextRadarReleaseId(value);
  assert.equal(key, createTextRadarReleaseId({ ...value, title: "NEUES  ALPENLICHT" }));
  assert.notEqual(key, createTextRadarReleaseId({ ...value, eventDate: "2026-10-16" }));
  assert.notEqual(key, createTextRadarReleaseId({ ...value, eventType: "staffelstart" }));
  assert.notEqual(key, createTextRadarReleaseId({ ...value, targetType: "work" }));
});

check("Valide Ergebnisse überleben veraltete und kaputte Geschwister desselben Werks", () => {
  const stale = candidate({ eventDate: "2020-10-15" });
  const valid = candidate({ eventDate: "2026-10-15" });
  const evaluated = evaluateTextRadarWebsearchResponse(envelope([
    stale, { ...valid, evidence: "kaputt" }, null, valid,
  ]), request, [source]);
  assert.equal(evaluated.status, "confirmed", evaluated.errors.join(","));
  assert.equal(evaluated.textResult.candidates.length, 1);
  assert.equal(evaluated.textResult.candidates[0].date, "2026-10-15");
});

check("Optionale Plattform bleibt bei Film, Serie und Staffel bis zum Feed gültig", () => {
  for (const eventType of ["kinostart_at", "streamingstart_at", "serienstart", "staffelstart"]) {
    for (const platform of [undefined, "Beispiel+"]) {
      const item = minimal({ eventType, targetType: eventType === "kinostart_at" ? "work" : "series", ...(platform ? { platform } : {}) });
      const evaluated = evaluateTextRadarWebsearchResponse(envelope([item]), request, [source]);
      assert.equal(evaluated.status, "confirmed", `${eventType}: ${evaluated.errors}`);
      const found = evaluated.textResult.candidates[0];
      const event = {
        eventId: "83000000-0000-4000-8000-000000000001",
        eventVersionId: "83000000-0000-4000-8000-000000000002",
        targetId: found.targetId, targetType: found.targetType, title: found.title,
        eventType, date: found.date, region: "AT", platform: found.platform,
        lifecycleStatus: "scheduled", verificationStatus: "confirmed",
        evidence: found.evidence.map(({ sourceId, sourceDomain, url, retrievedAt }) => ({ sourceId, sourceDomain, url, retrievedAt })),
      };
      assert.equal(event.platform, platform || "-");
      assert.equal(validateRadarPilotEvent(event).ok, true, validateRadarPilotEvent(event).errors.join(","));
      assert.equal(validateRadarPilotEvent({...event,targetId:123,region:"global"}).ok,false);
      if (eventType === "serienstart" && platform) {
        assert.equal(validateRadarPilotEvent({...event,targetId:"imdb:tt1234567"}).ok,false);
      }
    }
  }
});

function providerMessage(candidates, urls = [proof.url]) {
  return {
    model: setup.model, stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 100, server_tool_use: { web_search_requests: 1 } },
    content: [
      { type: "server_tool_use", name: "web_search", id: "tool1", input: { query: targetText } },
      { type: "web_search_tool_result", tool_use_id: "tool1", content: urls.map((url) => ({ type: "web_search_result", url, title: "Starttermin" })) },
      { type: "text", text: JSON.stringify({ status: candidates.length ? "confirmed" : "no_change", candidates }) },
    ],
  };
}

check("Providerparser akzeptiert eine wirkliche Toolresult-URL ohne zusätzliche Citation- oder Relationsgruppe", () => {
  const parsed = parseAnthropicRadarWebsearchResponse(providerMessage([minimal()]), request, setup, checkedAt);
  const evaluated = evaluateTextRadarWebsearchResponse(parsed.envelope, request, [source]);
  assert.equal(evaluated.status, "confirmed");
  assert.equal(evaluated.textResult.candidates[0].date, "2026-10-15");
  const invented = parseAnthropicRadarWebsearchResponse(providerMessage([minimal()], []), request, setup, checkedAt);
  assert.equal(invented.envelope.response.candidates.length, 0);
  const empty = parseAnthropicRadarWebsearchResponse(providerMessage([] , []), request, setup, checkedAt);
  assert.equal(empty.envelope.response.status, "no_change");
});

{
  const saved = [];
  let calls = 0;
  const repo = {
    async loadAuthorizedTarget() { return request; },
    async resolveSources() { return [source]; },
    async upsertConfirmedEvent({ event }) {
      if (event.title === "Erster Fund") throw new Error("invalid-single-record");
      saved.push(event); return { status: "confirmed" };
    },
    async loadFeed() { return { subscriptions: [{ targetId: request.targetId, title: targetText }], events: saved }; },
  };
  const result = await runRadarWebsearchCheck({
    accountId: "test-account", targetId: request.targetId, repository: repo,
    adapter: { async search() { calls += 1; return envelope([
      minimal({ title: "Erster Fund" }), { evidence: "kaputt" }, minimal({ title: "Zweiter Fund" }),
    ]); } },
  });
  check("Ein fehlerhafter Speicherrecord blockiert weder gültige Geschwister noch Ziel-/Fundtrennung", () => {
    assert.equal(calls, 1);
    assert.equal(result.status, "confirmed");
    assert.equal(result.responseMode, "partial");
    assert.equal(result.writes, 1);
    assert.equal(result.feed.events[0].title, "Zweiter Fund");
    assert.equal(result.feed.subscriptions.length, 1);
    assert.equal(result.feed.subscriptions[0].title, targetText);
  });
}

check("RPC-Übergabe hält den Werkschlüssel getrennt vom eingegebenen Textziel", () => {
  const index = fs.readFileSync("./supabase/functions/radar-websearch-task/index.ts", "utf8");
  assert.match(index, /targetKey: event\.targetKey/);
  assert.match(index, /textTargetKey: textContext\.targetId/);
});

check("Offene mehrstufige Suche liest auch spätere Domains und benötigt keine Zusatzquelle", () => {
  const external = { ...proof, url:"https://independent.example/season", sourceDomain:"independent.example", publishedAt:"2020-01-01" };
  const message = providerMessage([minimal({evidence:[external],category:"special"})]);
  message.usage.server_tool_use.web_search_requests=3;
  message.content.splice(2,0,
    {type:"server_tool_use",name:"web_search",id:"tool2",input:{query:"complementary discovery"}},
    {type:"web_search_tool_result",tool_use_id:"tool2",content:Array.from({length:8},(_,i) => ({type:"web_search_result",url:`https://other.example/${i}`}))},
    {type:"server_tool_use",name:"web_search",id:"tool3",input:{query:"specific title start date"}},
    {type:"web_search_tool_result",tool_use_id:"tool3",content:[{type:"web_search_result",url:external.url}]},
  );
  const parsed=parseAnthropicRadarWebsearchResponse(message,request,{...setup,sourceRegistry:[]},checkedAt);
  const evaluated=evaluateTextRadarWebsearchResponse(parsed.envelope,request,[]);
  assert.equal(evaluated.status,"confirmed");
  assert.equal(evaluated.textResult.candidates[0].category,"special");
  assert.equal(evaluated.textResult.candidates[0].evidence[0].publishedAt,"2020-01-01");
  assert.equal(evaluated.textResult.candidates[0].region,"unspecified");
  message.usage.server_tool_use.web_search_requests=5;
  assert.throws(() => parseAnthropicRadarWebsearchResponse(message,request,setup,checkedAt),/provider-usage-invalid/);
});

check("Personen-, Franchise- und Staffelsuche bleiben generische Textziele, US-only bleibt ausgeschlossen", () => {
  for (const value of ["Person Ada Beispiel", "Synthetische Sternenreihe", "Berggeschichten nächste Staffel"]) {
    const ownRequest={...request,targetText:value,targetId:createLocalTextRadarTargetId(value)};
    const body=buildAnthropicRadarWebsearchBody(ownRequest,{...setup,sourceRegistry:[]});
    assert.equal(JSON.parse(body.messages[0].content).targetText,value);
    const env={...envelope([minimal({region:"US"}),minimal({title:"Gültige Staffel",eventType:"staffelstart",platform:"Beispiel+"})]),
      response:{...envelope([]).response,textTarget:{targetId:ownRequest.targetId,targetText:value},
        candidates:[minimal({region:"US"}),minimal({title:"Gültige Staffel",eventType:"staffelstart",platform:"Beispiel+"})]}};
    const result=evaluateTextRadarWebsearchResponse(env,ownRequest,[]);
    assert.equal(result.status,"confirmed"); assert.equal(result.textResult.candidates.length,1);
    assert.equal(result.textResult.candidates[0].category,"season");
  }
});

{
  let fetches=0; let reserved; let settled;
  const currentSetup={...setup,maxTokens:2400,taskCapUsdCent:20,sourceRegistry:[]};
  const adapter=createAnthropicRadarWebsearchAdapter({
    apiKey:"mock-key",loadSetup:async () => currentSetup,
    reserveCost:async (input) => {reserved=input;return {ok:true,logId:4};},
    settleCost:async (input) => {settled=input;},
    fetchImpl:async () => {fetches++;return new Response(JSON.stringify(providerMessage([minimal()])));},
    now:() => checkedAt,
  });
  const body=buildAnthropicRadarWebsearchBody(request,currentSetup);
  await adapter.search(request);
  check("Vollständige Einzelquelle beendet den einen Providerrequest innerhalb fester Reservierung",() => {
    assert.equal(fetches,1); assert.equal(reserved.searchRequests,4); assert.ok(reserved.reservationUsdCent<=20);
    assert.equal(reserved.reservationUsdCent,estimateRadarWebsearchReservation(body,currentSetup));
    assert.equal(body.max_tokens,2400); assert.equal(settled.status,"fertig");
  });
  await assert.rejects(() => adapter.search(request),/already-used/);
  let providerCalls=0;
  const rejected=await runRadarWebsearchCheck({accountId:"foreign",targetId:request.targetId,
    adapter:{async search(){providerCalls++;}},repository:{
      async loadAuthorizedTarget(){throw new Error("forbidden");},async resolveSources(){},async upsertConfirmedEvent(){},async loadFeed(){},
    }});
  check("Fehlende Eigentümerautorisierung stoppt vor Anbieter und Write",() => {
    assert.equal(rejected.status,"forbidden");assert.equal(providerCalls,0);
  });
}

console.log(`\n${checks} Freitext-Radar-Vertragschecks bestanden.`);

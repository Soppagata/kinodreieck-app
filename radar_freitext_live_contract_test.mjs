/* Reiner Harnessvertrag fuer den normalen Radar-Freitextpfad.
   Kein Netz, keine Datenbank, kein Anbieter und keine Kostenwirkung. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RADAR_FREITEXT_LIVE_TARGET_TEXT,
  bewerteRadarFreitextLiveReadback,
  erfasseRadarFreitextFeedSnapshot,
  erstelleRadarFreitextLiveSzenario,
} from "./tools/radar_freitext_live_contract.mjs";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const szenario = erstelleRadarFreitextLiveSzenario();
const instant = "2030-01-01T10:00:00.000Z";
const checksum = "a".repeat(64);

function subscription() {
  return {
    targetId: szenario.targetId,
    targetType: "text",
    title: szenario.targetText,
    region: "AT",
    scope: "all",
    status: "active",
    updatedAt: instant,
  };
}

function event() {
  return {
    eventId: "10000000-0000-4000-8000-000000000001",
    eventVersionId: "20000000-0000-4000-8000-000000000001",
    targetId: "imdb:tt12345678",
    title: "Star Wars: Starfighter",
    eventType: "kinostart_at",
    date: "2030-01-02",
    region: "AT",
    platform: "-",
    lifecycleStatus: "scheduled",
    verificationStatus: "confirmed",
    evidence: [{
      sourceId: "official-studio",
      sourceDomain: "studio.example",
      url: "https://studio.example/starfighter",
      retrievedAt: instant,
    }],
  };
}

function feed({ subscriptions = [], events = [], revision = 0 } = {}) {
  return {
    format: "kd-radar-pilot-feed-v2",
    revision,
    checksum: revision === 0 ? null : checksum,
    reconciledAt: instant,
    subscriptions,
    events,
    receipts: [],
    operationAcks: [],
    radarReview: true,
    personResults: [],
  };
}

function response(status, writes) {
  return {
    ok: true,
    status,
    writes,
    providerRequests: 1,
    searchRequests: 1,
    phaseCode: "provider-complete",
    responseMode: "structured",
    displayText: null,
    warnings: [],
  };
}

await check("Fixture ist einfacher unveränderter Freitext mit lokal abgeleiteter interner ID", () => {
  assert.equal(RADAR_FREITEXT_LIVE_TARGET_TEXT.includes("2030"), false);
  assert.equal(szenario.targetText, RADAR_FREITEXT_LIVE_TARGET_TEXT);
  assert.match(szenario.targetId, /^text:[a-f0-9]{16}$/);
  assert.deepEqual(szenario.requestBody, {
    targetId: szenario.targetId,
    targetText: RADAR_FREITEXT_LIVE_TARGET_TEXT,
  });
});

await check("Bestaetigter Functionwrite ist nur mit neuem Feed-Event samt Datum und Quelle PROVEN", () => {
  const result = bewerteRadarFreitextLiveReadback({
    httpStatus: 200,
    body: response("confirmed", 1),
    feedVorher: erfasseRadarFreitextFeedSnapshot(feed()),
    feedNachher: erfasseRadarFreitextFeedSnapshot(feed({
      subscriptions: [subscription()], events: [event()], revision: 1,
    })),
    szenario,
  });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "proven-event");
  assert.equal(result.newEventCount, 1);
});

await check("Insufficient evidence bleibt ein sichtbares degraded Ergebnis ohne Eventwrite", () => {
  const result = bewerteRadarFreitextLiveReadback({
    httpStatus: 200,
    body: response("insufficient_evidence", 0),
    feedVorher: erfasseRadarFreitextFeedSnapshot(feed()),
    feedNachher: erfasseRadarFreitextFeedSnapshot(feed({
      subscriptions: [subscription()], revision: 1,
    })),
    szenario,
  });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "degraded");
  assert.equal(result.visibleText, "Kein belegter neuer Fund.");
  assert.equal(result.newEventCount, 0);
});

await check("Confirmed ohne neuen sicheren Eventreadback bleibt rot", () => {
  const result = bewerteRadarFreitextLiveReadback({
    httpStatus: 200,
    body: response("confirmed", 1),
    feedVorher: erfasseRadarFreitextFeedSnapshot(feed()),
    feedNachher: erfasseRadarFreitextFeedSnapshot(feed({
      subscriptions: [subscription()], revision: 1,
    })),
    szenario,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("confirmed-event-readback-invalid"));
});

await check("Acht-Pfade-Hook sendet Freitext und prüft den normalen Feedreadback", () => {
  const smoke = readFileSync(new URL("./tools/ai_smoke.mjs", import.meta.url), "utf8");
  assert.match(smoke, /erstelleRadarFreitextLiveSzenario/);
  assert.match(smoke, /koerper:\s*RADAR_FREITEXT_SZENARIO\.requestBody/);
  assert.match(smoke, /bewerteRadarFreitextLiveReadback/);
  assert.doesNotMatch(smoke, /koerper:\s*\{\s*targetId:\s*RADAR_TARGET_ID\s*\}/);
});

console.log(`${checks} Radar-Freitext-Livevertrag-Checks bestanden.`);

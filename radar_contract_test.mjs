import assert from "node:assert/strict";
import fs from "node:fs";
import {
  RADAR_TARGET_TYPES,
  RADAR_TARGET_STATUSES,
  RADAR_SUBSCRIPTION_STATUSES,
  RADAR_EVENT_TYPES,
  RADAR_VERIFICATION_STATUSES,
  RADAR_LIFECYCLE_STATUSES,
  RADAR_RECEIPT_STATUSES,
  RADAR_CHECK_WEEKDAYS,
  RADAR_NORMAL_ACTIVE_LIMIT,
  validateRadarTarget,
  createSearchActionDraft,
  validateRadarSubscription,
  countActiveRadarEntries,
  evaluateRadarQuota,
  createRadarCheckKey,
  createRadarEventIdentity,
  validateRadarEventVersion,
  createRadarShareDraft,
  projectCuratedRadarShare,
  isRadarCheckWeekday,
} from "./src/lib/radarContracts.js";
import {
  createEntdeckenFlags,
  ENTDECKEN_PARKED_FLAGS,
  RADAR_SERVER_FLAG_NAMES,
} from "./src/config/entdeckenFlags.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`✓ ${name}`);
};
const fixture = JSON.parse(fs.readFileSync(new URL("./src/data/entdecken_phase1_fixtures.json", import.meta.url), "utf8"));
const target = (targetType = "work", extra = {}) => ({
  targetId: `fixture:target:${targetType}-test`, targetType, targetStatus: "active",
  title: `Test ${targetType}`, canonical: true, ...extra,
});

check("Statuslisten sind geschlossen und trennen Ziel, Abo, Event, Verifikation und Receipt", () => {
  assert.deepEqual(RADAR_TARGET_TYPES, ["work", "series", "franchise"]);
  assert.deepEqual(RADAR_TARGET_STATUSES, ["active", "ambiguous", "retired"]);
  assert.deepEqual(RADAR_SUBSCRIPTION_STATUSES, ["active", "paused", "pending", "rejected"]);
  assert.deepEqual(RADAR_EVENT_TYPES, ["kinostart_at", "streamingstart_at", "serienstart", "staffelstart"]);
  assert.deepEqual(RADAR_VERIFICATION_STATUSES, ["candidate", "corroborated", "confirmed", "ambiguous"]);
  assert.deepEqual(RADAR_LIFECYCLE_STATUSES, ["announced", "scheduled", "retracted"]);
  assert.deepEqual(RADAR_RECEIPT_STATUSES, ["new", "seen", "dismissed", "accepted_week", "exported_ics"]);
});

check("Alle synthetischen Werk-/Serien-/Franchiseziele bestehen den Vertrag", () => {
  assert.equal(fixture.meta.fixtureOnly, true);
  assert.deepEqual(fixture.targets.map((entry) => entry.targetType), ["work", "series", "franchise"]);
  for (const entry of fixture.targets) assert.equal(validateRadarTarget(entry).ok, true);
});

check("Ein aktives Ziel muss kanonisch sein", () => {
  const invalid = validateRadarTarget(target("work", { canonical: false }));
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes("active-target-not-canonical"));
});

check("Beobachten akzeptiert ausschließlich Serien mit positiver Watchmode-ID", () => {
  const action = createSearchActionDraft({ intent: "watch", target: target("series"), watchmodeId: 42 });
  assert.equal(action.ok, true);
  assert.deepEqual({
    intent: action.action.intent,
    targetType: action.action.targetType,
    setsObserved: action.action.setsObserved,
    setsRadar: action.action.setsRadar,
    createsProviderJob: action.action.createsProviderJob,
  }, { intent: "watch", targetType: "series", setsObserved: true, setsRadar: false, createsProviderJob: false });
  assert.equal(createSearchActionDraft({ intent: "watch", target: target("work"), watchmodeId: 42 }).ok, false);
  assert.equal(createSearchActionDraft({ intent: "watch", target: target("series"), watchmodeId: -1 }).ok, false);
});

check("Werk, Serie und Franchise teilen den Intent, bleiben intern typisiert", () => {
  for (const type of RADAR_TARGET_TYPES) {
    const draft = createSearchActionDraft({ intent: "radar", target: target(type) });
    assert.equal(draft.ok, true);
    assert.equal(draft.action.intent, "radar");
    assert.equal(draft.action.targetType, type);
    assert.equal(draft.action.requiresConfirmation, true);
    assert.equal(draft.action.shareEnabled, false);
    assert.equal(draft.action.setsObserved, false);
    assert.equal(draft.action.setsRadar, false);
    assert.equal(draft.action.createsProviderJob, false);
  }
});

check("Mehrdeutige Radarziele schreiben nicht", () => {
  const ambiguous = target("work", { targetStatus: "ambiguous", canonical: false });
  assert.equal(validateRadarTarget(ambiguous).ok, true);
  assert.equal(createSearchActionDraft({ intent: "radar", target: ambiguous }).ok, false);
});

check("Subscriptions enthalten weder Notiz noch Geschmackssignal", () => {
  for (const subscription of fixture.subscriptions) assert.equal(validateRadarSubscription(subscription).ok, true);
  assert.equal(validateRadarSubscription({ ...fixture.subscriptions[0], tasteSignal: "action" }).ok, false);
  assert.equal(validateRadarSubscription({ ...fixture.subscriptions[0], note: "privat" }).ok, false);
});

const nineEvents = Array.from({ length: 9 }, (_, index) => ({
  targetId: `fixture:target:quota-${index}`, targetType: "work", status: "active",
}));
const onePerson = [{ personExternalId: "fixture:person:quota-actor", role: "actor", status: "active" }];

check("Event- und Discovery-Abos teilen atomar das Zehnerlimit", () => {
  assert.equal(RADAR_NORMAL_ACTIVE_LIMIT, 10);
  assert.equal(countActiveRadarEntries({ eventSubscriptions: nineEvents, discoverySubscriptions: onePerson }), 10);
  const decision = evaluateRadarQuota({
    eventSubscriptions: nineEvents,
    discoverySubscriptions: onePerson,
    candidate: { kind: "event", targetId: "fixture:target:quota-eleven", status: "active" },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.activeAfter, 11);
});

check("Duplikate und pausierte Abos verbrauchen keinen zusätzlichen Slot", () => {
  const decision = evaluateRadarQuota({
    eventSubscriptions: [...nineEvents, { ...nineEvents[0] }, { targetId: "fixture:target:paused", targetType: "work", status: "paused" }],
    discoverySubscriptions: onePerson,
    candidate: { kind: "event", targetId: nineEvents[0].targetId, status: "active" },
  });
  assert.equal(decision.activeBefore, 10);
  assert.equal(decision.increment, 0);
  assert.equal(decision.allowed, true);
});

check("Nur radar_unlimited hebt das Fachlimit auf; owner wird ignoriert", () => {
  const base = {
    eventSubscriptions: nineEvents,
    discoverySubscriptions: onePerson,
    candidate: { kind: "discovery", personExternalId: "fixture:person:quota-director", role: "director", status: "active" },
  };
  assert.equal(evaluateRadarQuota({ ...base, capabilities: { role: "owner" } }).allowed, false);
  const unlimited = evaluateRadarQuota({ ...base, capabilities: { radar_unlimited: true } });
  assert.equal(unlimited.allowed, true);
  assert.equal(unlimited.limit, null);
});

check("Eine formfremde Quota-Anfrage bleibt fail-closed", () => {
  const decision = evaluateRadarQuota({
    eventSubscriptions: [], discoverySubscriptions: [],
    candidate: { kind: "event", targetId: "?", status: "active" },
    capabilities: { radar_unlimited: true },
  });
  assert.equal(decision.candidateValid, false);
  assert.equal(decision.allowed, false);
});

check("Der globale Check-Key dedupliziert exakt und versioniert Query/Provider", () => {
  const input = {
    targetId: "fixture:target:dedupe", region: "AT", scope: "all",
    queryVersion: "q1", providerVersion: "p1",
  };
  assert.equal(createRadarCheckKey(input), createRadarCheckKey({ ...input }));
  assert.notEqual(createRadarCheckKey(input), createRadarCheckKey({ ...input, queryVersion: "q2" }));
  assert.equal(createRadarCheckKey({ ...input, region: "US" }), null);
});

check("Eventidentität enthält niemals das Datum", () => {
  const base = { canonicalWorkId: "fixture:target:event-work", eventType: "kinostart_at", region: "AT", platform: "kino" };
  assert.equal(
    createRadarEventIdentity({ ...base, date: "2026-09-01" }),
    createRadarEventIdentity({ ...base, date: "2027-01-10" }),
  );
});

check("Synthetische Eventversionen beginnen als Kandidat und sind unveränderlich identifizierbar", () => {
  for (const version of fixture.eventVersions) assert.equal(validateRadarEventVersion(version).ok, true);
  assert.equal(validateRadarEventVersion({ ...fixture.eventVersions[0], verificationStatus: "changed" }).ok, false);
  assert.equal(validateRadarEventVersion({ ...fixture.eventVersions[0], date: "2026-02-30" }).ok, false);
});

check("Share ist privat als Default und die Kreisprojektion entfernt Identität", () => {
  assert.deepEqual(createRadarShareDraft("fixture:target:share"), {
    targetId: "fixture:target:share", shareEnabled: false, requiresExplicitOptIn: true,
  });
  const projected = projectCuratedRadarShare({
    targetId: "fixture:target:share", title: "Geteilt", targetType: "work", year: 2026,
    accountId: "secret", author: "Max", shareId: "secret", sharedAt: "secret", subscriberCount: 7,
    event: {
      eventId: "fixture:event:share", eventType: "kinostart_at", lifecycleStatus: "scheduled",
      date: "2026-09-01", verificationStatus: "confirmed", accountId: "secret", evidenceQuery: "secret",
    },
  });
  assert.deepEqual(projected, {
    targetId: "fixture:target:share", title: "Geteilt", targetType: "work", year: 2026,
    event: {
      eventId: "fixture:event:share", eventType: "kinostart_at", lifecycleStatus: "scheduled",
      date: "2026-09-01", verificationStatus: "confirmed",
    },
  });
});

check("Radar prüft Montag und Freitag, nicht täglich", () => {
  assert.deepEqual(RADAR_CHECK_WEEKDAYS, ["monday", "friday"]);
  assert.equal(isRadarCheckWeekday("Monday"), true);
  assert.equal(isRadarCheckWeekday("friday"), true);
  assert.equal(isRadarCheckWeekday("wednesday"), false);
});

check("Browserflags sind vollständig fail-closed und Serverflags getrennt benannt", () => {
  assert.deepEqual(createEntdeckenFlags({}), {
    radarUi: false, radarPeople: false, radarShares: false, recommendations: false, popularity: false,
  });
  assert.equal(createEntdeckenFlags({ VITE_RADAR_UI_ENABLED: "TRUE" }).radarUi, false);
  assert.equal(createEntdeckenFlags({ VITE_RADAR_UI_ENABLED: "true" }).radarUi, true);
  assert.deepEqual(ENTDECKEN_PARKED_FLAGS, ["radarPeople"]);
  assert.equal(createEntdeckenFlags({ VITE_RADAR_PEOPLE_ENABLED: "true" }).radarPeople, false);
  assert.deepEqual(RADAR_SERVER_FLAG_NAMES, [
    "radar_aktiv", "radar_scheduler_aktiv", "radar_provider_aktiv", "radar_discovery_aktiv", "radar_shares_aktiv",
  ]);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("RADAR-CONTRACT-TEST BESTANDEN");

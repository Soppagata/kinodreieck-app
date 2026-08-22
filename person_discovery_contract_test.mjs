import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PERSON_DISCOVERY_ROLES,
  createPersonIdentityKey,
  validatePersonIdentity,
  createPersonRadarDraft,
  validateDiscoveryCandidate,
  createCandidateRadarDraft,
  matchPersonWorkCandidate,
  validatePersonRadarCheckResult,
  personDiscoveryFallback,
} from "./src/lib/personDiscoveryContracts.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const fixture = JSON.parse(fs.readFileSync(new URL("./src/data/person_discovery_phase1_fixtures.json", import.meta.url), "utf8"));

check("Personenrollen sind ausschließlich Schauspiel und Regie", () => {
  assert.deepEqual(PERSON_DISCOVERY_ROLES, ["actor", "director"]);
});

check("Nicolas Cage und Robert Rodriguez sind ehrlich nur synthetisch fixiert", () => {
  const [cage, rodriguez] = fixture.requiredNameCases;
  assert.equal(cage.identity.name, "Nicolas Cage");
  assert.equal(cage.identity.role, "actor");
  assert.equal(cage.identity.personExternalId, "fixture:person:nicolas-cage");
  assert.deepEqual(cage.expectedCandidates, []);
  assert.equal(cage.productionExpectation, "blocked_unresolved");
  assert.equal(rodriguez.identity.name, "Robert Rodriguez");
  assert.equal(rodriguez.identity.role, "director");
  assert.equal(rodriguez.identity.personExternalId, "fixture:person:robert-rodriguez");
  assert.deepEqual(rodriguez.expectedCandidates, []);
  assert.equal(rodriguez.productionExpectation, "blocked_unresolved");
});

check("Fixture-Identitäten gelten im Test, aber nie im Produktionsvalidator", () => {
  for (const testCase of fixture.requiredNameCases) {
    assert.equal(validatePersonIdentity(testCase.identity, { mode: "fixture" }).ok, true);
    const production = validatePersonIdentity(testCase.identity, { mode: "production" });
    assert.equal(production.ok, false);
    assert.ok(production.errors.includes("fixture-person-forbidden"));
  }
});

check("Fehlende oder mehrdeutige externe Identität blockiert", () => {
  assert.equal(validatePersonIdentity({ personExternalId: null, role: "actor", name: "Nicolas Cage", canonical: false }).ok, false);
  assert.equal(validatePersonIdentity({ personExternalId: "wikidata:test", role: "writer", name: "Test", canonical: true }).ok, false);
  assert.equal(createPersonRadarDraft({ personExternalId: null, role: "director", name: "Robert Rodriguez", canonical: false }).ok, false);
});

check("Dieselbe Person in zwei Rollen bleibt zwei getrennte Discovery-Identitäten", () => {
  const actor = createPersonIdentityKey({ personExternalId: "fixture:person:multi-role", role: "actor" });
  const director = createPersonIdentityKey({ personExternalId: "fixture:person:multi-role", role: "director" });
  assert.ok(actor);
  assert.ok(director);
  assert.notEqual(actor, director);
});

check("Ein Personen-Radarentwurf erzeugt nie Event, Check, Werk-Abo oder Geschmack", () => {
  for (const testCase of fixture.requiredNameCases) {
    const draft = createPersonRadarDraft(testCase.identity, { mode: "fixture" });
    assert.equal(draft.ok, true);
    assert.equal(draft.action.kind, "person_discovery");
    assert.equal(draft.action.requiresConfirmation, true);
    assert.equal(draft.action.shareEnabled, false);
    assert.equal(draft.action.createsEvent, false);
    assert.equal(draft.action.createsEventVersion, false);
    assert.equal(draft.action.createsCheck, false);
    assert.equal(draft.action.createsWorkSubscription, false);
    assert.equal(draft.action.createsTasteSignal, false);
  }
});

check("Synthetische Kandidaten sind kostenneutral und ausschließlich im Fixturemodus gültig", () => {
  for (const testCase of fixture.syntheticPositiveCases) {
    assert.equal(validateDiscoveryCandidate(testCase.candidate, { mode: "fixture" }).ok, true);
    const production = validateDiscoveryCandidate(testCase.candidate, { mode: "production" });
    assert.equal(production.ok, false);
    assert.ok(production.errors.includes("fixture-candidate-forbidden") || production.errors.includes("candidate-person-invalid"));
  }
});

check("Ein Kandidat erzeugt nur eine neue Werk-ins-Radar-Vorschau", () => {
  const candidate = fixture.syntheticPositiveCases[0].candidate;
  const draft = createCandidateRadarDraft(candidate, { mode: "fixture" });
  assert.equal(draft.ok, true);
  assert.equal(draft.action.kind, "event_target_preview");
  assert.equal(draft.action.requiresConfirmation, true);
  assert.equal(draft.action.subscriptionCreated, false);
  assert.equal(draft.action.eventCreated, false);
  assert.equal(draft.action.checkCreated, false);
  assert.equal(draft.action.shareEnabled, false);
});

check("Mehrdeutige, aktive oder kostenfähige Kandidaten sind nicht übernehmbar", () => {
  const candidate = fixture.syntheticPositiveCases[0].candidate;
  assert.equal(createCandidateRadarDraft({ ...candidate, status: "ambiguous" }, { mode: "fixture" }).ok, false);
  assert.equal(validateDiscoveryCandidate({ ...candidate, active: true }, { mode: "fixture" }).ok, false);
  assert.equal(validateDiscoveryCandidate({ ...candidate, costBearing: true }, { mode: "fixture" }).ok, false);
  assert.equal(validateDiscoveryCandidate({ ...candidate, createsCheck: true }, { mode: "fixture" }).ok, false);
});

check("Featureflag-/Quellenfallback bleibt ehrlich und blockiert den Event-Radar nicht", () => {
  const disabled = personDiscoveryFallback({ enabled: false });
  assert.equal(disabled.visible, false);
  assert.equal(disabled.writable, false);
  const existing = personDiscoveryFallback({ enabled: true, identityResolved: true, sourceAvailable: false, existing: true });
  assert.equal(existing.visible, true);
  assert.equal(existing.writable, false);
  assert.equal(existing.message, "Noch keine bestätigten Projekte");
  assert.deepEqual(existing.candidates, []);
});

check("Personenfixtures enthalten weder URL noch Providerpayload", () => {
  const source = fs.readFileSync(new URL("./src/data/person_discovery_phase1_fixtures.json", import.meta.url), "utf8");
  assert.equal(fixture.meta.providerPayload, false);
  assert.doesNotMatch(source, /https?:\/\//i);
});

const productionIdentity = Object.freeze({
  personExternalId: "wikidata:Q42869", name: "Nicolas Cage", role: "actor", canonical: true,
});
const catalog = Object.freeze([
  { targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023 },
  { targetId: "catalog:longlegs", targetType: "work", title: "Longlegs", year: 2024 },
]);

check("Gemeinsame starke Werk-ID gewinnt nur ohne widersprechende Fakten", () => {
  assert.equal(matchPersonWorkCandidate({
    targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023,
  }, catalog).status, "matched");
  assert.equal(matchPersonWorkCandidate({
    targetId: "watchmode:101", targetType: "work", title: "Anderer Film", year: 2023,
  }, catalog).status, "ambiguous");
  assert.equal(matchPersonWorkCandidate({
    targetId: "watchmode:999", targetType: "work", title: "Dream Scenario", year: 2023,
  }, catalog).status, "no_match");
});

check("Fallback verlangt substantiellen exakten Titel plus Jahr, Typ und Eindeutigkeit", () => {
  assert.equal(matchPersonWorkCandidate({ targetId: null, targetType: "work", title: "Dream Scenario", year: 2023 }, catalog).status, "matched");
  assert.equal(matchPersonWorkCandidate({ targetId: null, targetType: "work", title: "Dream Scenario", year: 2024 }, catalog).status, "no_match");
  assert.equal(matchPersonWorkCandidate({ targetId: null, targetType: "work", title: "Up", year: 2009 }, [
    { targetId: "catalog:up", targetType: "work", title: "Up", year: 2009 },
  ]).status, "no_match");
  assert.equal(matchPersonWorkCandidate({ targetId: null, targetType: "work", title: "Dream Scenario", year: 2023 }, [
    ...catalog,
    { targetId: "catalog:dream-duplicate", targetType: "work", title: "Dream Scenario", year: 2023 },
  ]).status, "ambiguous");
  assert.equal(matchPersonWorkCandidate({ targetId: null, title: "Dream Scenario", year: 2023 }, catalog).status, "no_match");
  assert.equal(matchPersonWorkCandidate({ targetId: null, targetType: "series", title: "Dream Scenario", year: 2023 }, catalog).status, "no_match");
});

check("Personen-Check ist auf sechs Kandidaten begrenzt und erzeugt nie automatisch Werk-Abos", () => {
  const checked = validatePersonRadarCheckResult({
    status: "confirmed",
    checkedAt: "2026-08-18T10:00:00.000Z",
    person: productionIdentity,
    candidates: [{ targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023 }],
  }, { identity: productionIdentity, catalog });
  assert.equal(checked.ok, true);
  assert.equal(checked.result.decisions[0].status, "matched");
  assert.equal(checked.result.createsWorkSubscription, false);
  assert.equal(checked.result.createsEvent, false);
  assert.equal(validatePersonRadarCheckResult({
    status: "confirmed", checkedAt: "2026-08-18T10:00:00.000Z", person: productionIdentity,
    candidates: Array.from({ length: 7 }, () => ({ title: "Dream Scenario", year: 2023 })),
  }, { identity: productionIdentity, catalog }).ok, false);
});

check("Confirmed ohne deterministischen Treffer und fremde Identität stoppen fail-closed", () => {
  assert.equal(validatePersonRadarCheckResult({
    status: "confirmed", checkedAt: "2026-08-18T10:00:00.000Z", person: productionIdentity,
    candidates: [{ title: "Unbekanntes Werk", year: 2026 }],
  }, { identity: productionIdentity, catalog }).ok, false);
  assert.equal(validatePersonRadarCheckResult({
    status: "no_change", checkedAt: "2026-08-18T10:00:00.000Z",
    person: { ...productionIdentity, role: "director" }, candidates: [],
  }, { identity: productionIdentity, catalog }).ok, false);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("PERSON-DISCOVERY-CONTRACT-TEST BESTANDEN");

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  LOCAL_PROPOSAL_MAX_BYTES,
  canonicalizeProposalUrl,
  decodeAndValidateLocalProposal,
  validateLocalProposal,
  validateProposalSourceRegistry,
} from "./src/lib/radarProposalValidator.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("./src/data/radar_phase2_fixtures.json", import.meta.url), "utf8",
));
const copy = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`✓ ${name}`);
};
const options = (proposal = fixture.radarProposal) => ({
  sourceRegistry: fixture.sourceRegistry,
  catalog: fixture.catalog,
  expectedInputHash: proposal.inputHash,
});

check("Synthetische Quellenregistry ist geschlossen, rechtegeprüft und eindeutig", () => {
  assert.equal(validateProposalSourceRegistry(fixture.sourceRegistry).ok, true);
  const duplicate = [...fixture.sourceRegistry, fixture.sourceRegistry[0]];
  assert.equal(validateProposalSourceRegistry(duplicate).ok, false);
  assert.equal(validateProposalSourceRegistry([
    fixture.sourceRegistry[0],
    { ...fixture.sourceRegistry[1], domain: fixture.sourceRegistry[0].domain },
  ]).ok, false);
  assert.equal(validateProposalSourceRegistry([
    { ...fixture.sourceRegistry[0], allowedProposalKinds: [] },
  ]).ok, false);
  assert.equal(validateProposalSourceRegistry([
    { ...fixture.sourceRegistry[0], active: true, rightsStatus: "blocked" },
  ]).ok, false);
});

check("URL-Normalisierung akzeptiert nur HTTPS und entfernt Tracking/Fragmente", () => {
  assert.equal(
    canonicalizeProposalUrl("https://Official.Example/path?utm_source=x&b=2&a=1#stelle"),
    "https://official.example/path?a=1&b=2",
  );
  assert.equal(canonicalizeProposalUrl("http://official.example/path"), null);
  assert.equal(canonicalizeProposalUrl("https://user:secret@official.example/path"), null);
  assert.equal(canonicalizeProposalUrl("https://official.example:444/path"), null);
});

check("Zwei unabhängige belastbare Quellen bestätigen den Radar-Termin", () => {
  const result = validateLocalProposal(fixture.radarProposal, options());
  assert.equal(result.ok, true);
  assert.equal(result.status, "preview-ready");
  assert.equal(result.summary.matched, 1);
  assert.equal(result.summary.calendarEligible, 1);
  assert.equal(result.items[0].normalized.verificationStatus, "confirmed");
  assert.equal(result.items[0].normalized.evidence.length, 2);
  assert.deepEqual(result.items[0].normalized.sourceFamilies, ["publisher:editorial", "publisher:official"]);
});

check("Validator erzeugt nur Vorschau und aktiviert weder Write noch Routine", () => {
  const result = validateLocalProposal(fixture.radarProposal, options());
  assert.equal(result.writes, false);
  assert.equal(result.routineActivated, false);
  assert.equal(result.automaticRetry, false);
  assert.equal(result.items[0].normalized.requiresPreview, true);
});

check("Zwei Domains derselben Publisherfamilie zählen nur als eine Stimme", () => {
  const proposal = copy(fixture.radarProposal);
  proposal.items[0].evidence[0].sourceId = "fixture:source:editorial";
  proposal.items[0].evidence[0].url = "https://editorial.example/work-01-original";
  proposal.items[0].evidence[1].sourceId = "fixture:source:syndicated";
  proposal.items[0].evidence[1].url = "https://syndicated.example/work-01";
  const result = validateLocalProposal(proposal, options());
  assert.equal(result.items[0].status, "matched");
  assert.equal(result.items[0].normalized.verificationStatus, "corroborated");
  assert.equal(result.items[0].normalized.calendarEligible, false);
});

check("Doppelte URL oder Fingerprint vervielfacht die Evidenz nicht", () => {
  const proposal = copy(fixture.radarProposal);
  proposal.items[0].evidence[1] = {
    ...proposal.items[0].evidence[0],
    evidenceId: "fixture:evidence:duplicate-url",
    url: "https://news.official.example/releases/work-01?utm_campaign=duplicate",
  };
  const result = validateLocalProposal(proposal, options());
  assert.equal(result.items[0].normalized.evidence.length, 1);
  assert.equal(result.items[0].normalized.verificationStatus, "corroborated");
});

check("Unbekannte Quellenklasse kann Hinweis, aber keine Bestätigung sein", () => {
  const proposal = copy(fixture.radarProposal);
  proposal.items[0].evidence = [{
    ...proposal.items[0].evidence[0],
    evidenceId: "fixture:evidence:unknown",
    sourceId: "fixture:source:unknown",
    url: "https://unknown.example/work-01",
  }];
  const result = validateLocalProposal(proposal, options());
  assert.equal(result.items[0].status, "matched");
  assert.equal(result.items[0].normalized.verificationStatus, "candidate");
  assert.equal(result.items[0].normalized.calendarEligible, false);
});

check("Gesperrte oder nicht registrierte Quelle blockiert das ganze Item", () => {
  const blocked = copy(fixture.radarProposal);
  blocked.items[0].evidence[0].sourceId = "fixture:source:blocked";
  blocked.items[0].evidence[0].url = "https://blocked.example/work-01";
  assert.equal(validateLocalProposal(blocked, options()).items[0].status, "blocked");
  const unknown = copy(fixture.radarProposal);
  unknown.items[0].evidence[0].sourceId = "fixture:source:not-registered";
  assert.equal(validateLocalProposal(unknown, options()).items[0].status, "blocked");
});

check("Quell-ID kann keine fremde Domain einschleusen", () => {
  const proposal = copy(fixture.radarProposal);
  proposal.items[0].evidence[0].url = "https://attacker.example/work-01";
  const result = validateLocalProposal(proposal, options());
  assert.ok(result.items[0].errors.includes("evidence-url-invalid"));
});

check("Artikel-, Regions-, Event- oder Plattformkonflikt blockiert fail-closed", () => {
  for (const [field, value, error] of [
    ["claimedDate", "2026-08-11", "evidence-date-conflict"],
    ["region", "US", "evidence-region-conflict"],
    ["eventType", "serienstart", "evidence-event-type-conflict"],
    ["platform", "anderer-dienst", "evidence-platform-conflict"],
  ]) {
    const proposal = copy(fixture.radarProposal);
    proposal.items[0].evidence[0][field] = value;
    const result = validateLocalProposal(proposal, options());
    assert.equal(result.items[0].status, "blocked");
    assert.ok(result.items[0].errors.includes(error));
  }
});

check("Starke ID muss den kanonischen Katalogdatensatz treffen", () => {
  const conflict = copy(fixture.radarProposal);
  conflict.items[0].externalIds.watchmode = "fixture-watchmode-wrong";
  assert.ok(validateLocalProposal(conflict, options()).items[0].errors.includes("strong-id-conflict:watchmode"));
  const titleOnly = copy(fixture.radarProposal);
  titleOnly.items[0].externalIds = {};
  assert.ok(validateLocalProposal(titleOnly, options()).items[0].errors.includes("strong-id-required"));
  const structured = copy(fixture.radarProposal);
  structured.items[0].externalIds.watchmode = { injected: true };
  assert.ok(validateLocalProposal(structured, options()).items[0].errors.includes("strong-id-required"));
  const missing = copy(fixture.radarProposal);
  missing.items[0].targetId = "fixture:target:not-in-catalog";
  assert.ok(validateLocalProposal(missing, options()).items[0].errors.includes("target-unmatched"));
});

check("Expliziter Gegenbeleg hält einen sonst starken Termin mehrdeutig", () => {
  const proposal = copy(fixture.radarProposal);
  proposal.items[0].conflicts = ["Abweichender Termin in Gegenquelle"];
  const result = validateLocalProposal(proposal, options());
  assert.equal(result.items[0].status, "ambiguous");
  assert.equal(result.items[0].normalized.verificationStatus, "ambiguous");
  assert.equal(result.items[0].normalized.calendarEligible, false);
});

check("Doppeltes Event im selben Proposal wird nicht zweimal übernommen", () => {
  const proposal = copy(fixture.radarProposal);
  proposal.items.push({
    ...copy(proposal.items[0]),
    itemId: "fixture:proposal-item:radar-duplicate",
    eventVersionId: "fixture:event-version:radar-duplicate",
  });
  const result = validateLocalProposal(proposal, options());
  assert.equal(result.summary.matched, 1);
  assert.equal(result.summary.blocked, 1);
  assert.ok(result.items[1].errors.includes("proposal-event-duplicate"));
});

check("Proposal-ID und Eingabehash schützen idempotent vor Doppellauf", () => {
  const byId = validateLocalProposal(fixture.radarProposal, {
    ...options(), seenProposalIds: [fixture.radarProposal.proposalId],
  });
  assert.equal(byId.status, "duplicate");
  assert.equal(byId.items.length, 0);
  const byHash = validateLocalProposal(fixture.radarProposal, {
    ...options(), seenInputHashes: [fixture.radarProposal.inputHash],
  });
  assert.equal(byHash.status, "duplicate");
});

check("Eingabehash muss separat bekannt und exakt gebunden sein", () => {
  const missing = validateLocalProposal(fixture.radarProposal, {
    sourceRegistry: fixture.sourceRegistry,
    catalog: fixture.catalog,
  });
  assert.deepEqual(missing.errors, ["proposal-input-hash-unverified"]);
  const wrong = validateLocalProposal(fixture.radarProposal, {
    ...options(), expectedInputHash: "f".repeat(64),
  });
  assert.deepEqual(wrong.errors, ["proposal-input-hash-unverified"]);
});

check("Unbekannte Envelope-Felder und ungültiges JSON werden abgewiesen", () => {
  const extra = { ...copy(fixture.radarProposal), prompt: "darf nicht reisen" };
  assert.equal(validateLocalProposal(extra, options()).ok, false);
  assert.equal(decodeAndValidateLocalProposal("{kaputt", options()).ok, false);
  assert.equal(decodeAndValidateLocalProposal("x".repeat(LOCAL_PROPOSAL_MAX_BYTES + 1), options()).ok, false);
  assert.equal(decodeAndValidateLocalProposal("ä".repeat((LOCAL_PROPOSAL_MAX_BYTES / 2) + 1), options()).ok, false);
});

check("Popularity-Proposal prüft Schema, starke ID, AT, Zeitraum und Rang", () => {
  const result = validateLocalProposal(fixture.popularityProposal, options(fixture.popularityProposal));
  assert.equal(result.ok, true);
  assert.equal(result.summary.matched, 1);
  assert.equal(result.items[0].normalized.targetId, "fixture:target:popularity-work-01");
  assert.equal(result.items[0].normalized.requiresPreview, true);
});

check("Popularity ohne bestätigte AT-Verfügbarkeit bleibt blockiert", () => {
  const proposal = copy(fixture.popularityProposal);
  proposal.items[0].atAvailabilityConfirmed = false;
  const result = validateLocalProposal(proposal, options(proposal));
  assert.equal(result.items[0].status, "blocked");
  assert.ok(result.items[0].errors.includes("popularity-not-displayable"));
});

check("Popularity-Zeitraum über 31 Tage und Rang außerhalb 1..100 blockieren", () => {
  const long = copy(fixture.popularityProposal);
  long.items[0].periodStart = "2026-06-01";
  assert.ok(validateLocalProposal(long, options(long)).items[0].errors.includes("popularity-period-invalid"));
  const rank = copy(fixture.popularityProposal);
  rank.items[0].rank = 101;
  assert.ok(validateLocalProposal(rank, options(rank)).items[0].errors.includes("popularity-rank-invalid"));
});

check("Doppelter Popularity-Rang derselben Periode wird blockiert", () => {
  const proposal = copy(fixture.popularityProposal);
  proposal.items.push({
    ...copy(proposal.items[0]),
    itemId: "fixture:proposal-item:popularity-duplicate",
  });
  const result = validateLocalProposal(proposal, options(proposal));
  assert.equal(result.summary.matched, 1);
  assert.equal(result.summary.blocked, 1);
  assert.ok(result.items[1].errors.includes("proposal-popularity-key-duplicate"));
  assert.ok(result.items[1].errors.includes("proposal-rank-duplicate"));
});

check("Validator mutiert weder Proposal, Quellenregistry noch Katalog", () => {
  const proposal = copy(fixture.radarProposal);
  const sources = copy(fixture.sourceRegistry);
  const catalog = copy(fixture.catalog);
  const before = JSON.stringify({ proposal, sources, catalog });
  validateLocalProposal(proposal, {
    sourceRegistry: sources, catalog, expectedInputHash: proposal.inputHash,
  });
  assert.equal(JSON.stringify({ proposal, sources, catalog }), before);
});

check("Phase-2-Fixtures sind synthetisch und enthalten keinen Providerpayload", () => {
  assert.equal(fixture.meta.fixtureOnly, true);
  assert.equal(fixture.meta.providerPayload, false);
  const source = fs.readFileSync(new URL("./src/lib/radarProposalValidator.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|WebSocket|service[_-]?role|setInterval\s*\(/i);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("RADAR-PROPOSAL-VALIDATOR-TEST BESTANDEN");

import assert from "node:assert/strict";
import fs from "node:fs";

const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.has(key) ? local.get(key) : null,
  setItem: (key, value) => { local.set(key, String(value)); },
  removeItem: (key) => { local.delete(key); },
  clear: () => local.clear(),
};

const R = await import("./src/lib/localEventRadar.js");
const C = await import("./src/lib/radarContracts.js");
const E = await import("./src/lib/entdeckenUi.js");

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`✓ ${name}`);
};
const instant = "2026-08-09T12:00:00.000Z";
const checksumA = "a".repeat(64);
const checksumB = "b".repeat(64);
const target = (index = "01", extra = {}) => ({
  targetId: `fixture:target:local-${index}`,
  targetType: "work",
  targetStatus: "active",
  title: `Lokales Testwerk ${index}`,
  canonical: true,
  ...extra,
});
const serverSnapshot = ({
  revision = 1,
  checksum = checksumA,
  reconciledAt = instant,
  subscriptions = [],
  shares = [],
  acknowledgedOperationIds = [],
  acknowledgedShareOperationIds = [],
} = {}) => ({
  revision,
  checksum,
  reconciledAt,
  subscriptions,
  shares,
  acknowledgedOperationIds,
  acknowledgedShareOperationIds,
});

await check("Fehlender Topf ist gültig leer; beschädigter Topf bleibt erkennbar", () => {
  const missing = R.decodeLocalRadar(null, { authority: "guest" });
  assert.equal(missing.ok, true);
  assert.equal(missing.status, "missing");
  assert.equal(missing.state.subscriptions.length, 0);
  const corrupt = R.decodeLocalRadar("{kaputt", { authority: "guest" });
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.status, "corrupt");
  assert.equal(corrupt.state, null);
});

await check("Radar-v1 wird verlustfrei nur beim Lesen auf v2 projiziert", () => {
  const v1 = JSON.parse(JSON.stringify(R.createEmptyLocalRadar({ authority: "guest" })));
  v1.version = 1;
  delete v1.personSubscriptions;
  delete v1.personResults;
  v1.subscriptions = [{
    targetId: "fixture:target:legacy", targetType: "work", region: "AT", scope: "all",
    status: "active", authority: "local", serverRevision: null, serverChecksum: null, updatedAt: instant,
  }];
  const raw = JSON.stringify(v1);
  const decoded = R.decodeLocalRadar(raw, { authority: "guest" });
  assert.equal(decoded.ok, true);
  assert.equal(decoded.migratedFromVersion, 1);
  assert.equal(decoded.state.version, 2);
  assert.equal(decoded.state.subscriptions[0].targetId, "fixture:target:legacy");
  assert.equal(decoded.state.subscriptions[0].title, null);
  assert.deepEqual(decoded.state.personSubscriptions, []);
  assert.equal(JSON.stringify(v1), raw);
});

await check("Gast- und Account-Cache-Autorität werden nie still vertauscht", () => {
  const guest = R.createEmptyLocalRadar({ authority: "guest" });
  const mismatch = R.decodeLocalRadar(JSON.stringify(guest), { authority: "account-cache" });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.status, "authority-mismatch");
  assert.equal(R.decodeLocalRadar(null, { authority: "unbekannt" }).status, "authority-invalid");
});

await check("Gast-Abo ist lokal wirksam, erzeugt aber niemals Providerarbeit", () => {
  const result = R.upsertGuestRadarSubscription(R.createEmptyLocalRadar(), { target: target(), now: instant });
  assert.equal(result.ok, true);
  assert.equal(result.state.subscriptions[0].authority, "local");
  assert.equal(result.state.subscriptions[0].status, "active");
  assert.equal(result.state.subscriptions[0].title, "Lokales Testwerk 01");
  assert.equal(result.createsProviderJob, false);
});

const titleGroupIndex = E.createRadarCatalogIndex({ streamingDiscover: { titel: [
  { watchmode_id: 71001, titel: "Star Wars: Episode I", jahr: 1999, typ: "movie" },
  { watchmode_id: 71004, titel: "Star Wars: Episode IV", jahr: 1977, typ: "movie" },
] } });
const titleGroup = E.createTitleGroupRadarTarget(titleGroupIndex, "Star Wars").target;

await check("Eine Titelgruppe bleibt als genau ein lokales Radarziel mit konkreten Mitgliedern erhalten", () => {
  const saved = R.upsertGuestRadarSubscription(R.createEmptyLocalRadar(), {
    target: titleGroup, now: instant,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.state.subscriptions.length, 1);
  assert.equal(saved.state.subscriptions[0].targetType, "franchise");
  assert.equal(saved.state.subscriptions[0].titleGroup.queryKey, "star wars");
  assert.deepEqual(saved.state.subscriptions[0].titleGroup.members.map((entry) => entry.targetId), [
    "watchmode:71001", "watchmode:71004",
  ]);
  const reloaded = R.decodeLocalRadar(JSON.stringify(saved.state), { authority: "guest" });
  assert.equal(reloaded.ok, true);
  assert.deepEqual(reloaded.state.subscriptions[0].titleGroup, saved.state.subscriptions[0].titleGroup);
});

await check("Eine Account-Titelgruppe bleibt ein Outbox-Ziel und verliert ihre Auflösung nicht", () => {
  const queued = R.queueAccountRadarChange(R.createEmptyLocalRadar({ authority: "account-cache" }), {
    operationId: "fixture:operation:title-group", action: "upsert", target: titleGroup, now: instant,
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.state.outbox.length, 1);
  assert.equal(queued.state.outbox[0].targetId, "title-group:v1:star-wars");
  assert.deepEqual(queued.state.outbox[0].titleGroup.members, titleGroup.titleGroup.members);
});

await check("Personen-Abo hält Schauspiel und Regie getrennt und erzeugt kein Werk-Abo", () => {
  const identity = { personExternalId: "wikidata:Q42869", name: "Nicolas Cage", role: "actor", canonical: true };
  const actor = R.upsertGuestPersonRadarSubscription(R.createEmptyLocalRadar(), { identity, now: instant });
  assert.equal(actor.ok, true);
  const director = R.upsertGuestPersonRadarSubscription(actor.state, {
    identity: { ...identity, role: "director" }, now: "2026-08-09T12:01:00.000Z",
  });
  assert.equal(director.ok, true);
  assert.equal(director.state.personSubscriptions.length, 2);
  assert.equal(director.state.subscriptions.length, 0);
  assert.equal(director.createsWorkSubscription, false);
});

await check("Validierter Personen-Treffer bleibt im Cache und erzeugt keinen Auto-Fan-out", () => {
  const identity = { personExternalId: "wikidata:Q42869", name: "Nicolas Cage", role: "actor", canonical: true };
  const subscribed = R.upsertGuestPersonRadarSubscription(R.createEmptyLocalRadar(), { identity, now: instant });
  const applied = R.applyPersonRadarCheckResult(subscribed.state, {
    identity,
    catalog: [{ targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023 }],
    response: {
      status: "confirmed", checkedAt: "2026-08-09T12:02:00.000Z",
      windowStart: "2026-08-09", windowEnd: "2026-08-15", person: identity,
      candidates: [{
        targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023,
        role: "actor", eventType: "streamingstart_at", date: "2026-08-12", region: "AT", platform: "Netflix",
        evidence: [{
          sourceId: "netflix-at", sourceDomain: "netflix.example", url: "https://netflix.example/dream-scenario",
          retrievedAt: "2026-08-09T12:02:00.000Z",
        }],
      }],
    },
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.state.personResults[0].decisions[0].status, "matched");
  assert.equal(applied.state.subscriptions.length, 0);
  assert.equal(applied.createsWorkSubscription, false);
  const reloaded = R.decodeLocalRadar(JSON.stringify(applied.state), { authority: "guest" });
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.state.personResults[0].decisions[0].work.title, "Dream Scenario");
});

await check("Personen und unkanonische Ziele bleiben aus dem lokalen Event-Radar", () => {
  const empty = R.createEmptyLocalRadar();
  assert.equal(R.upsertGuestRadarSubscription(empty, { target: target("person", { targetType: "person" }), now: instant }).ok, false);
  assert.equal(R.upsertGuestRadarSubscription(empty, { target: target("amb", { canonical: false, targetStatus: "ambiguous" }), now: instant }).ok, false);
});

await check("Gastlimit stoppt den elften unterschiedlichen Event-Target", () => {
  let state = R.createEmptyLocalRadar();
  for (let index = 0; index < 10; index++) {
    const next = R.upsertGuestRadarSubscription(state, { target: target(`quota-${index}`), now: instant });
    assert.equal(next.ok, true);
    state = next.state;
  }
  const blocked = R.upsertGuestRadarSubscription(state, { target: target("quota-10"), now: instant });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "quota-exceeded");
  assert.equal(state.subscriptions.length, 10);
});

await check("Scope-Änderung desselben Gastziels verbraucht keinen zweiten Slot", () => {
  const first = R.upsertGuestRadarSubscription(R.createEmptyLocalRadar(), { target: target(), scope: "all", now: instant });
  const second = R.upsertGuestRadarSubscription(first.state, { target: target(), scope: "cinema", now: "2026-08-09T12:01:00.000Z" });
  assert.equal(second.ok, true);
  assert.equal(second.state.subscriptions.length, 1);
  assert.equal(second.state.subscriptions[0].scope, "cinema");
});

await check("Gast kann ein Ziel lokal entfernen, ohne Receipts oder Providerarbeit zu erzeugen", () => {
  let state = R.upsertGuestRadarSubscription(R.createEmptyLocalRadar(), { target: target("remove"), now: instant }).state;
  state = R.setLocalRadarReceipt(state, {
    eventId: "fixture:event:remove", versionId: "fixture:event-version:remove", status: "seen", now: instant,
  }).state;
  const removed = R.removeGuestRadarSubscription(state, "fixture:target:local-remove");
  assert.equal(removed.ok, true);
  assert.equal(removed.state.subscriptions.length, 0);
  assert.equal(removed.state.receipts.length, 1);
  assert.equal(removed.createsProviderJob, false);
  const again = R.removeGuestRadarSubscription(removed.state, "fixture:target:local-remove");
  assert.equal(again.ok, true);
  assert.equal(again.reason, "already-missing");
});

await check("Accountänderung landet nur in der Outbox und aktiviert kein Abo", () => {
  const queued = R.queueAccountRadarChange(R.createEmptyLocalRadar({ authority: "account-cache" }), {
    operationId: "fixture:operation:account-01", action: "upsert", target: target(), now: instant,
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.state.outbox.length, 1);
  assert.equal(queued.state.subscriptions.length, 0);
  assert.equal(queued.createsProviderJob, false);
});

await check("Personenänderung nutzt dieselbe Outbox mit geschlossenem ID- und Rollen-Discriminator", () => {
  const identity = { personExternalId: "wikidata:Q42869", name: "Nicolas Cage", role: "actor", canonical: true };
  const queued = R.queueAccountPersonRadarChange(R.createEmptyLocalRadar({ authority: "account-cache" }), {
    operationId: "fixture:operation:person-01", action: "upsert", identity,
    targetId: "person:wikidata:Q42869:actor", now: instant,
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.state.outbox.length, 1);
  assert.equal(queued.state.outbox[0].targetType, "person");
  assert.equal(queued.state.outbox[0].personExternalId, "wikidata:Q42869");
  assert.equal(queued.state.outbox[0].personRole, "actor");
  assert.equal(queued.state.subscriptions.length, 0);
  assert.equal(queued.state.personSubscriptions.length, 0);
  assert.equal(queued.createsProviderJob, false);
  assert.equal(R.queueAccountPersonRadarChange(queued.state, {
    operationId: "fixture:operation:person-role-conflict", action: "upsert", identity,
    targetId: "person:wikidata:Q42869:director", now: instant,
  }).ok, false);
});

await check("Outbox-Vorgangs-ID ist idempotent und kollisionsfest", () => {
  const input = { operationId: "fixture:operation:idempotent", action: "upsert", target: target(), now: instant };
  const first = R.queueAccountRadarChange(R.createEmptyLocalRadar({ authority: "account-cache" }), input);
  const repeated = R.queueAccountRadarChange(first.state, input);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.reason, "idempotent");
  const conflict = R.queueAccountRadarChange(first.state, { ...input, action: "pause" });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "operation-id-conflict");
});

await check("Quota-Ablehnung bleibt sichtbar und wiederaufnehmbar", () => {
  const queued = R.queueAccountRadarChange(R.createEmptyLocalRadar({ authority: "account-cache" }), {
    operationId: "fixture:operation:reject", action: "upsert", target: target(), now: instant,
  });
  const rejected = R.rejectAccountRadarChange(queued.state, "fixture:operation:reject", "quota-exceeded");
  assert.equal(rejected.ok, true);
  assert.equal(rejected.state.outbox[0].status, "rejected");
  assert.equal(rejected.state.outbox[0].reason, "quota-exceeded");
});

await check("Reconciliation ersetzt nur Servercache und bestätigte Outboxmenge", () => {
  let state = R.createEmptyLocalRadar({ authority: "account-cache" });
  state = R.queueAccountRadarChange(state, {
    operationId: "fixture:operation:ack", action: "upsert", target: target("ack"), now: instant,
  }).state;
  state = R.queueAccountRadarChange(state, {
    operationId: "fixture:operation:open", action: "upsert", target: target("open"), now: instant,
  }).state;
  state = R.setLocalRadarReceipt(state, {
    eventId: "fixture:event:receipt", versionId: "fixture:event-version:receipt", status: "seen", now: instant,
  }).state;
  const reconciled = R.reconcileAccountRadarSnapshot(state, serverSnapshot({
    revision: 1,
    checksum: checksumA,
    reconciledAt: instant,
    subscriptions: [{
      targetId: "fixture:target:local-ack", targetType: "work", region: "AT",
      scope: "all", status: "active", updatedAt: instant,
    }],
    acknowledgedOperationIds: ["fixture:operation:ack"],
  }));
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.state.subscriptions[0].authority, "server");
  assert.deepEqual(reconciled.state.outbox.map((entry) => entry.operationId), ["fixture:operation:open"]);
  assert.equal(reconciled.state.receipts[0].status, "seen");
});

await check("Alte oder widersprüchliche Serverrevision überschreibt nichts", () => {
  const base = R.reconcileAccountRadarSnapshot(
    R.createEmptyLocalRadar({ authority: "account-cache" }),
    serverSnapshot({ revision: 2 }),
  ).state;
  assert.equal(R.reconcileAccountRadarSnapshot(base, serverSnapshot({ revision: 1 })).reason, "snapshot-stale");
  assert.equal(R.reconcileAccountRadarSnapshot(base, serverSnapshot({ revision: 2, checksum: checksumB })).reason, "snapshot-revision-conflict");
});

await check("Leerer erster Serversnapshot darf Revision null ohne erfundene Checksumme haben", () => {
  const empty = R.reconcileAccountRadarSnapshot(
    R.createEmptyLocalRadar({ authority: "account-cache" }),
    serverSnapshot({ revision: 0, checksum: null }),
  );
  assert.equal(empty.ok, true);
  assert.equal(empty.state.server.revision, 0);
  assert.equal(empty.state.server.checksum, null);
  const impossible = R.reconcileAccountRadarSnapshot(
    R.createEmptyLocalRadar({ authority: "account-cache" }),
    serverSnapshot({
      revision: 0,
      checksum: null,
      subscriptions: [{
        targetId: "fixture:target:zero", targetType: "work", region: "AT",
        scope: "all", status: "active", updatedAt: instant,
      }],
    }),
  );
  assert.equal(impossible.ok, false);
});

await check("Kreisfreigabe besitzt eine eigene Outbox und erzeugt keine Providerarbeit", () => {
  const account = R.reconcileAccountRadarSnapshot(
    R.createEmptyLocalRadar({ authority: "account-cache" }),
    serverSnapshot({
      subscriptions: [{
        targetId: "fixture:target:local-share", targetType: "work", region: "AT",
        scope: "all", status: "active", updatedAt: instant,
      }],
    }),
  ).state;
  const queued = R.queueAccountRadarShareChange(account, {
    operationId: "fixture:operation:share", targetId: "fixture:target:local-share",
    shareEnabled: true, now: instant,
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.state.outbox.length, 0);
  assert.equal(queued.state.shareOutbox.length, 1);
  assert.equal(queued.createsProviderJob, false);
  assert.equal(R.queueAccountRadarShareChange(R.createEmptyLocalRadar(), {
    operationId: "fixture:operation:guest-share", targetId: "fixture:target:local-share",
    shareEnabled: true, now: instant,
  }).ok, false);
});

await check("Aktive Freigabe verlangt ein aktives eigenes Abo und Serverbestätigung", () => {
  const emptyAccount = R.createEmptyLocalRadar({ authority: "account-cache" });
  const blocked = R.queueAccountRadarShareChange(emptyAccount, {
    operationId: "fixture:operation:share-blocked", targetId: "fixture:target:local-share",
    shareEnabled: true, now: instant,
  });
  assert.equal(blocked.reason, "active-subscription-required");
  const inconsistent = R.reconcileAccountRadarSnapshot(emptyAccount, serverSnapshot({
    shares: [{ targetId: "fixture:target:local-share", status: "active", updatedAt: instant }],
  }));
  assert.equal(inconsistent.ok, false);
  assert.equal(inconsistent.reason, "snapshot-invalid");
});

await check("Share-Reconciliation bestätigt nur die eigene Share-Outbox", () => {
  let state = R.reconcileAccountRadarSnapshot(
    R.createEmptyLocalRadar({ authority: "account-cache" }),
    serverSnapshot({
      subscriptions: [{
        targetId: "fixture:target:local-share", targetType: "work", region: "AT",
        scope: "all", status: "active", updatedAt: instant,
      }],
    }),
  ).state;
  state = R.queueAccountRadarShareChange(state, {
    operationId: "fixture:operation:share-ack", targetId: "fixture:target:local-share",
    shareEnabled: true, now: instant,
  }).state;
  const reconciled = R.reconcileAccountRadarSnapshot(state, serverSnapshot({
    revision: 2,
    subscriptions: [{
      targetId: "fixture:target:local-share", targetType: "work", region: "AT",
      scope: "all", status: "active", updatedAt: instant,
    }],
    shares: [{ targetId: "fixture:target:local-share", status: "active", updatedAt: instant }],
    acknowledgedShareOperationIds: ["fixture:operation:share-ack"],
  }));
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.state.shareOutbox.length, 0);
  assert.equal(reconciled.state.shares[0].authority, "server");
  assert.equal(reconciled.state.shares[0].status, "active");
});

await check("Lokaler Store bestätigt Writes per Readback und repariert Korruption nicht", async () => {
  const memory = new Map();
  const storage = {
    async get(key) { return memory.has(key) ? { key, value: memory.get(key) } : null; },
    async set(key, value) { memory.set(key, String(value)); return { key, value: String(value) }; },
  };
  const repository = R.createLocalEventRadarStore({ storage, key: "fixture:radar", authority: "guest" });
  assert.equal((await repository.save(R.createEmptyLocalRadar())).ok, true);
  assert.equal((await repository.save(R.createEmptyLocalRadar({ authority: "account-cache" }))).reason, "authority-mismatch");
  assert.equal((await repository.load()).status, "loaded");
  memory.set("fixture:radar", "kaputt");
  const corrupt = await repository.load();
  assert.equal(corrupt.ok, false);
  assert.equal(memory.get("fixture:radar"), "kaputt");
});

await check("Eventkandidat startet unbestätigt mit stabiler Identität ohne Datum", () => {
  const staged = R.stageLocalEventCandidate(R.createEmptyLocalEventLedger(), {
    target: target(), eventType: "kinostart_at", date: "2026-08-12",
    versionId: "fixture:event-version:01",
  });
  assert.equal(staged.ok, true);
  assert.equal(C.isRadarEventIdentity(staged.eventId), true);
  assert.equal(staged.ledger.versions[0].verificationStatus, "candidate");
  assert.equal(staged.ledger.events[0].currentConfirmedVersionId, null);
});

await check("Bestätigung verlangt mindestens zwei Evidenz-IDs", () => {
  const staged = R.stageLocalEventCandidate(R.createEmptyLocalEventLedger(), {
    target: target(), eventType: "kinostart_at", date: "2026-08-12",
    versionId: "fixture:event-version:01",
  });
  const blocked = R.applyLocalEvidenceDecision(staged.ledger, {
    eventId: staged.eventId, versionId: "fixture:event-version:01",
    verificationStatus: "confirmed", evidenceIds: ["fixture:evidence:one"],
    independentSourceFamilies: ["fixture:publisher:one"],
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "confirmation-evidence-insufficient");
});

let confirmedLedger;
let confirmedEventId;
await check("Bestätigte Terminversion setzt erst nach eigenem Gate den Zeiger", () => {
  const staged = R.stageLocalEventCandidate(R.createEmptyLocalEventLedger(), {
    target: target(), eventType: "kinostart_at", date: "2026-08-12",
    versionId: "fixture:event-version:01",
  });
  const confirmed = R.applyLocalEvidenceDecision(staged.ledger, {
    eventId: staged.eventId, versionId: "fixture:event-version:01",
    verificationStatus: "confirmed",
    evidenceIds: ["fixture:evidence:one", "fixture:evidence:two"],
    independentSourceFamilies: ["fixture:publisher:one", "fixture:publisher:two"],
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.ledger.events[0].currentConfirmedVersionId, "fixture:event-version:01");
  assert.deepEqual(confirmed.ledger.versions[0].history, ["candidate", "confirmed"]);
  confirmedLedger = confirmed.ledger;
  confirmedEventId = staged.eventId;
});

await check("Terminänderung erbt weder Evidenz noch bestätigten Zeiger", () => {
  const changed = R.stageLocalEventCandidate(confirmedLedger, {
    target: target(), eventType: "kinostart_at", date: "2026-08-13",
    versionId: "fixture:event-version:02",
  });
  assert.equal(changed.ok, true);
  assert.equal(changed.ledger.events[0].currentCandidateVersionId, "fixture:event-version:02");
  assert.equal(changed.ledger.events[0].currentConfirmedVersionId, "fixture:event-version:01");
  assert.deepEqual(changed.ledger.versions[1].evidenceIds, []);
  assert.equal(changed.ledger.versions[1].verificationStatus, "candidate");
  confirmedLedger = changed.ledger;
});

await check("Korroborierter neuer Termin ersetzt den alten bestätigten Termin nicht", () => {
  const result = R.applyLocalEvidenceDecision(confirmedLedger, {
    eventId: confirmedEventId, versionId: "fixture:event-version:02",
    verificationStatus: "corroborated", evidenceIds: ["fixture:evidence:three"],
    independentSourceFamilies: ["fixture:publisher:three"],
  });
  assert.equal(result.ok, true);
  assert.equal(result.ledger.events[0].currentConfirmedVersionId, "fixture:event-version:01");
  confirmedLedger = result.ledger;
});

await check("Bestätigte Terminversion ist gegen stilles Downgrade geschützt", () => {
  const result = R.applyLocalEvidenceDecision(confirmedLedger, {
    eventId: confirmedEventId, versionId: "fixture:event-version:01",
    verificationStatus: "ambiguous",
    evidenceIds: ["fixture:evidence:one", "fixture:evidence:two"],
    independentSourceFamilies: ["fixture:publisher:one", "fixture:publisher:two"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "confirmed-version-immutable");
});

await check("Neuer Kandidat ändert einen bestehenden Lifecycle nicht nebenbei", () => {
  const first = R.stageLocalEventCandidate(R.createEmptyLocalEventLedger(), {
    target: target("lifecycle"), eventType: "kinostart_at", date: "2026-08-12",
    versionId: "fixture:event-version:lifecycle-01", lifecycleStatus: "retracted",
  });
  const second = R.stageLocalEventCandidate(first.ledger, {
    target: target("lifecycle"), eventType: "kinostart_at", date: "2026-08-13",
    versionId: "fixture:event-version:lifecycle-02", lifecycleStatus: "scheduled",
  });
  assert.equal(second.ok, true);
  assert.equal(second.ledger.events[0].lifecycleStatus, "retracted");
});

await check("Manipulierte Ledger-Zeiger blockieren Mutation und Projektion", () => {
  const corrupt = JSON.parse(JSON.stringify(confirmedLedger));
  corrupt.events[0].currentConfirmedVersionId = "fixture:event-version:not-found";
  assert.equal(R.validateLocalEventLedger(corrupt).ok, false);
  assert.equal(R.stageLocalEventCandidate(corrupt, {
    target: target(), eventType: "kinostart_at", date: "2026-08-14",
    versionId: "fixture:event-version:corrupt",
  }).reason, "ledger-invalid");
  assert.deepEqual(R.projectLocalRadarWeek({
    state: R.createEmptyLocalRadar(), ledger: corrupt, startDate: "2026-08-09",
  }), []);
});

await check("Formfremde bestätigte Version wird abgewiesen statt den Validator zu werfen", () => {
  const corrupt = JSON.parse(JSON.stringify(confirmedLedger));
  corrupt.versions[0].evidenceIds = null;
  assert.doesNotThrow(() => R.validateLocalEventLedger(corrupt));
  assert.equal(R.validateLocalEventLedger(corrupt).ok, false);
});

let guestWithSubscription;
await check("Wochenprojektion zeigt nur bestätigte abonnierte Termine read-only", () => {
  guestWithSubscription = R.upsertGuestRadarSubscription(R.createEmptyLocalRadar(), { target: target(), now: instant }).state;
  const rows = R.projectLocalRadarWeek({ state: guestWithSubscription, ledger: confirmedLedger, startDate: "2026-08-09" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].versionId, "fixture:event-version:01");
  assert.equal(rows[0].readOnly, true);
  assert.equal(rows[0].createsReminder, false);
  assert.equal(rows[0].createsCalendarEntry, false);
});

await check("Verworfenes Receipt blendet nur dieselbe Terminversion aus", () => {
  const dismissed = R.setLocalRadarReceipt(guestWithSubscription, {
    eventId: confirmedEventId, versionId: "fixture:event-version:01", status: "dismissed", now: instant,
  }).state;
  assert.deepEqual(R.projectLocalRadarWeek({ state: dismissed, ledger: confirmedLedger, startDate: "2026-08-09" }), []);
});

await check("Wochenübernahme bleibt ein bestätigungspflichtiger Entwurf ohne Write", () => {
  const [row] = R.projectLocalRadarWeek({ state: guestWithSubscription, ledger: confirmedLedger, startDate: "2026-08-09" });
  assert.deepEqual(R.createLocalWeekAcceptanceDraft(row), {
    eventId: confirmedEventId,
    eventVersionId: "fixture:event-version:01",
    requiresConfirmation: true,
    reminderCreated: false,
    calendarWritten: false,
  });
});

await check("Optionaler Kontopilot verändert den Flag-false-Leerstand nicht", () => {
  const account = R.createEmptyLocalRadar({ authority: "account-cache" });
  assert.equal(Object.hasOwn(account, "pilot"), false);
  assert.equal(JSON.stringify(R.decodeLocalRadar(JSON.stringify(account), { authority: "account-cache" }).state), JSON.stringify(account));
});

await check("Pilotfeed reconciliiert atomar und erhält ungeklärte lokale Vorgänge", () => {
  let account = R.queueAccountRadarChange(R.createEmptyLocalRadar({ authority: "account-cache" }), {
    operationId: "11111111-1111-4111-8111-111111111111", action: "upsert", target: target("pilot"), now: instant,
  }).state;
  const reconciled = R.reconcileAccountRadarPilotFeed(account, {
    format: "kd-radar-pilot-feed-v1",
    revision: 1,
    checksum: checksumA,
    reconciledAt: "2026-08-09T14:00:00+02:00",
    subscriptions: [{
      targetId: "work:imdb:tt0137523", targetType: "work", title: "Fight Club",
      region: "AT", scope: "all", status: "active", updatedAt: instant,
    }],
    events: [],
    receipts: [],
    operationAcks: [],
    radarReview: false,
  });
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.state.outbox.length, 1);
  assert.equal(reconciled.state.server.reconciledAt, "2026-08-09T12:00:00.000Z");
  assert.equal(reconciled.state.pilot.status, "ready");
  assert.equal(reconciled.state.subscriptions[0].title, "Fight Club");
  const reloaded = R.decodeLocalRadar(JSON.stringify(reconciled.state), { authority: "account-cache" });
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.state.subscriptions[0].title, "Fight Club");
  const technicalTitle = JSON.parse(JSON.stringify(reconciled.state));
  technicalTitle.subscriptions[0].title = technicalTitle.subscriptions[0].targetId;
  assert.equal(R.decodeLocalRadar(JSON.stringify(technicalTitle), { authority: "account-cache" }).ok, false);
});

await check("Persönlicher Topf enthält keine globale Target-, Event- oder Evidence-Wahrheit", () => {
  const source = fs.readFileSync(new URL("./src/lib/localEventRadar.js", import.meta.url), "utf8");
  const state = R.createEmptyLocalRadar();
  assert.equal(Object.hasOwn(state, "targets"), false);
  assert.equal(Object.hasOwn(state, "events"), false);
  assert.equal(Object.hasOwn(state, "evidence"), false);
  assert.doesNotMatch(source, /\bfetch\s*\(|WebSocket|service[_-]?role|setInterval\s*\(/i);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("RADAR-LOCAL-TEST BESTANDEN");

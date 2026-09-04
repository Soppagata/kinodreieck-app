#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CATALOG_COMPARISON_PHASES,
  PRIVATE_RELEASE_CATALOG_AUDIT,
  buildPrivateReleaseCatalogAudit,
} from "./src/lib/catalogAudit.js";
import {
  ENTDECKEN_CURRENT_REFRESH_INTERVAL_HOURS,
  ENTDECKEN_TARGET_REFRESH_SLA_HOURS,
  MANDALORIAN_GROGU_TRACE,
  RADAR_REFRESH_INTERVAL_HOURS,
  buildEntdeckenTitleGateTrace,
  entdeckenFeedFreshness,
} from "./src/lib/entdeckenFreshness.js";
import { radarSubscriptionForEvent } from "./src/lib/entdeckenUi.js";
import { projectRadarNews } from "./src/lib/radarNews.js";

const read = (path) => readFileSync(path, "utf8");

test("U-14 bilanziert beide Snapshot-Lanes und alle acht Phasen ohne Marktclaim", () => {
  const audit = PRIVATE_RELEASE_CATALOG_AUDIT;
  assert.equal(audit.previous.discover, 12_540);
  assert.equal(audit.previous.known, 100);
  assert.equal(audit.previous.total, 12_640);
  assert.equal(audit.current.discover, 11_049);
  assert.equal(audit.current.known, 103);
  assert.equal(audit.current.total, 11_152);
  assert.deepEqual(audit.comparison, {
    scope: "Discover-Lane",
    retained: 10_695,
    removed: 1_845,
    added: 354,
    reidentified: 7,
    strongIdDuplicates: 0,
    serviceCount: 6,
    sameServiceSet: true,
    netDiscoverChange: -1_491,
    netTotalChange: -1_488,
  });
  assert.equal(audit.snapshotCoverage, "full");
  assert.equal(audit.pipelineCoverage, "limited");
  assert.deepEqual(audit.phases.map((phase) => phase.id), CATALOG_COMPARISON_PHASES.map((phase) => phase.id));
  assert.deepEqual(audit.phases.slice(0, 2).map((phase) => phase.status), ["unknown", "unknown"]);
  assert.equal(audit.phases.find((phase) => phase.id === "consumption").status, "unknown");
  assert.equal(audit.interpretation.marketLossProven, false);
});

test("U-14 verwirft rechnerisch ungeschlossene oder unvollständige Vergleiche", () => {
  const valid = {
    previous: { date: "2026-07-22", discover: 10, known: 1 },
    current: { date: "2026-09-04", discover: 9, known: 1 },
    comparison: { retained: 8, removed: 2, added: 1, reidentified: 0,
      strongIdDuplicates: 0, serviceCount: 6, sameServiceSet: true },
  };
  assert.doesNotThrow(() => buildPrivateReleaseCatalogAudit(valid));
  assert.throws(() => buildPrivateReleaseCatalogAudit({
    ...valid, comparison: { ...valid.comparison, removed: 1 },
  }), /identity-balance-invalid/u);
  assert.throws(() => buildPrivateReleaseCatalogAudit({
    ...valid, current: { date: "2026-09-04", discover: 9 },
  }), /identity-balance-invalid/u);
});

test("D-06 verfolgt Mandalorian & Grogu durch Freshness, Quelle und Profil", () => {
  const trace = MANDALORIAN_GROGU_TRACE;
  assert.equal(trace.title, "Mandalorian & Grogu");
  assert.equal(trace.conclusion, "explainable-source-exclusion");
  assert.equal(trace.marketAbsenceProven, false);
  assert.equal(trace.gates.find((gate) => gate.id === "catalog-identity").status, "passed");
  assert.equal(trace.gates.find((gate) => gate.id === "at-availability").status, "passed");
  assert.equal(trace.gates.find((gate) => gate.id === "feed-freshness").status, "expired");
  assert.equal(trace.gates.find((gate) => gate.id === "feed-intake").status, "absent");
  assert.equal(trace.gates.find((gate) => gate.id === "source-coverage").status, "excluded");
  assert.equal(trace.gates.find((gate) => gate.id === "profile").status, "absent");
  assert.equal(trace.gates.find((gate) => gate.id === "personal").status, "passed");
  assert.equal(trace.gates.find((gate) => gate.id === "last-attempt").status, "unknown");
  assert.equal(trace.gates.find((gate) => gate.id === "last-success").status, "unknown");
});

test("D-06 bewertet Tagespräzision für die 24h-Ziel-SLA fail-closed", () => {
  assert.deepEqual(entdeckenFeedFreshness({ refreshedOn: "2026-09-04", validUntil: "2026-09-10" }, "2026-09-04"), {
    status: "within_sla", ageDays: 0, label: "Heute aktualisiert",
  });
  assert.equal(entdeckenFeedFreshness({ refreshedOn: "2026-09-03", validUntil: "2026-09-09" }, "2026-09-04").status, "sla_unproven");
  assert.equal(entdeckenFeedFreshness({ refreshedOn: "2026-08-28", validUntil: "2026-09-03" }, "2026-09-04").status, "expired");
  assert.equal(entdeckenFeedFreshness({ refreshedOn: "kaputt", validUntil: "2026-09-03" }, "2026-09-04").status, "unknown");
});

test("U-06 bildet den autorisiert authored, aber nicht angewandten 24h-Kandidaten ehrlich ab", () => {
  assert.equal(ENTDECKEN_CURRENT_REFRESH_INTERVAL_HOURS, 24);
  assert.equal(ENTDECKEN_TARGET_REFRESH_SLA_HOURS, 24);
  assert.equal(RADAR_REFRESH_INTERVAL_HOURS, 144);
  assert.equal(MANDALORIAN_GROGU_TRACE.migrationState, "authorized-authored-not-applied");
  const cadence = read("supabase/migrations/20260904140000_entdecken_daily_refresh_interval.sql");
  const radar = read("supabase/migrations/20260830120000_radar_six_day_schedule.sql");
  assert.match(cadence, /v_anchor \+ interval '24 hours'/u);
  assert.match(cadence, /not provider_enabled and not commercial_enabled/u);
  assert.doesNotMatch(cadence, /kd_radar_|radar_scheduler_interval_hours/u);
  assert.match(radar, /radar_scheduler_interval_hours integer not null default 144/u);
});

test("U-07 bindet direkte und gruppierte Neuigkeiten nur über starke Zielbeziehungen", () => {
  const target = { targetId: "imdb:tt1234567", targetType: "work", title: "Beispielziel", status: "active" };
  const direct = { targetId: target.targetId, title: "Fund" };
  assert.equal(radarSubscriptionForEvent(direct, [target]), target);
  assert.equal(radarSubscriptionForEvent({ ...direct, targetId: "imdb:tt7654321" }, [target]), null);

  const episode = (number) => ({
    eventVersionId: `episode-${number}`,
    title: `Beispielziel Staffel 2 Folge ${number}`,
    eventType: "staffelstart",
    targetType: "series",
    category: "series",
    seasonNumber: 2,
    verificationStatus: "confirmed",
    date: `2026-09-0${number}`,
    platform: "Beispiel+",
    region: "AT",
    targetId: target.targetId,
    sourceTargetKey: `work:${target.targetId}`,
    sourceTargetKind: "work",
  });
  const [season] = projectRadarNews([episode(5), episode(6)], "2026-09-04");
  assert.equal(season.targetId, target.targetId);
  assert.equal(season.sourceTargetKey, `work:${target.targetId}`);
  assert.equal(radarSubscriptionForEvent(season, [target]), target);
});

test("D-06/U-07/U-14 sind in Support- und UI-Artefakten sichtbar, Unbekanntes bleibt benannt", () => {
  const component = read("src/components/KatalogAuditStatus.jsx");
  const tab = read("src/tabs/DatenTab.jsx");
  const radarUi = read("src/tabs/EntdeckenTab.jsx");
  const auditDoc = read("docs/ENTDECKEN_KATALOG_AUDIT_2026-09-04.md");
  assert.match(tab, /titel="Streaming-Katalogstand"/u);
  assert.match(component, /Snapshotvergleich <strong>voll<\/strong>.*Pipeline.*<strong>limitiert<\/strong>/su);
  assert.match(component, /keinen Marktabgang/u);
  assert.match(component, /Warum fehlt „Mandalorian &amp; Grogu“\?/u);
  assert.match(radarUi, /Ziel: \{target/u);
  assert.match(radarUi, /nicht eindeutig zugeordnet/u);
  for (const phrase of ["Rohquellen", "AT-Verfügbarkeit", "Filter", "Deduplizierung",
    "Sortierung", "Begrenzung", "Auslieferung", "Nutzersicht", "ausdrücklich unbekannt",
    "autorisiert lokal erstellt, aber nicht angewandt"]) assert.match(`${component}\n${auditDoc}`, new RegExp(phrase, "u"));
});

test("Trace-Builder erfindet ohne Belege weder Identität noch Ausschluss", () => {
  const trace = buildEntdeckenTitleGateTrace({ title: "Unbekannt", checkedOn: "2026-09-04" });
  assert.equal(trace.conclusion, "freshness-unproven");
  assert.equal(trace.marketAbsenceProven, false);
  assert.equal(trace.gates.find((gate) => gate.id === "catalog-identity").status, "unknown");
  assert.equal(trace.gates.find((gate) => gate.id === "source-coverage").status, "unknown");
});

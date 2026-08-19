/* Dauerhafter, rein lokaler Oracle-Test fuer die Personen-Kandidaten-Surface. */
import assert from "node:assert/strict";
import {
  RADAR_PERSON_CANDIDATE_RLS_TABLES,
  RADAR_PERSON_CANDIDATE_SURFACE_COMPARISONS,
  RadarE18ProcessStop,
  buildRadarPersonCandidateSurfaceSql,
  validateRadarPersonCandidateSurface,
} from "./tools/radar_e18_process_executor.mjs";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

function fixture() {
  return {
    personTargets: 5,
    curatedTarget: 1,
    personColumns: 2,
    rpc: true,
    upsert: true,
    feed: true,
    authRpc: true,
    anonRpc: false,
    authFeed: true,
    anonFeed: false,
    rls: Object.fromEntries(RADAR_PERSON_CANDIDATE_RLS_TABLES.map((table) => [
      table,
      { enabled: true, forced: false },
    ])),
  };
}

function setComparison(value, name, next) {
  const parts = name.split(".");
  let target = value;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = next;
}

check("SQL-Projektion trennt RLS-Aktivierung und FORCE fuer jede allowlistete Tabelle", () => {
  const sql = buildRadarPersonCandidateSurfaceSql();
  assert.match(sql, /relrowsecurity/);
  assert.match(sql, /relforcerowsecurity/);
  assert.doesNotMatch(sql, /relrowsecurity\s+and\s+[^\n]*relforcerowsecurity/i);
  for (const table of RADAR_PERSON_CANDIDATE_RLS_TABLES) {
    assert.equal(sql.includes(`c.relname='${table}'`), true, table);
  }
});

check("belegte Backup-Surface ist mit enabled=true und forced=false exakt gruen", () => {
  const output = [];
  assert.equal(validateRadarPersonCandidateSurface(
    fixture(),
    { fehlerAusgabe: (line) => output.push(line) },
  ), true);
  assert.deepEqual(output, []);
});

check("jeder Vergleich stoppt geordnet am exakten allowlisteten Wert", () => {
  assert.deepEqual(RADAR_PERSON_CANDIDATE_SURFACE_COMPARISONS, [
    "personTargets",
    "curatedTarget",
    "personColumns",
    "rpc",
    "upsert",
    "feed",
    "authRpc",
    "anonRpc",
    "authFeed",
    "anonFeed",
    ...RADAR_PERSON_CANDIDATE_RLS_TABLES.flatMap((table) => [
      `rls.${table}.enabled`,
      `rls.${table}.forced`,
    ]),
  ]);
  for (const name of RADAR_PERSON_CANDIDATE_SURFACE_COMPARISONS) {
    const value = fixture();
    const parts = name.split(".");
    let current = value;
    for (const part of parts) current = current[part];
    const observed = typeof current === "boolean" ? !current : current + 1;
    setComparison(value, name, observed);
    const output = [];
    let stopped;
    try {
      validateRadarPersonCandidateSurface(value, {
        fehlerAusgabe: (line) => output.push(line),
      });
    } catch (error) {
      stopped = error;
    }
    assert.equal(stopped instanceof RadarE18ProcessStop, true, name);
    assert.equal(stopped.code, "CANDIDATE_SURFACE_DRIFT", name);
    assert.deepEqual(stopped.candidateSurfaceEvidence, {
      name,
      expected: current,
      observed,
    });
    assert.equal(Object.isFrozen(stopped.candidateSurfaceEvidence), true);
    assert.deepEqual(output.map(JSON.parse), [stopped.candidateSurfaceEvidence]);
  }
});

check("Formdrift und Mehrfachdrift geben keine fremden Inhalte aus", () => {
  const rawMarker = "raw_private_secret_payload_access_token";
  const malformed = { ...fixture(), rawPayload: rawMarker };
  const shapeOutput = [];
  assert.throws(
    () => validateRadarPersonCandidateSurface(malformed, {
      fehlerAusgabe: (line) => shapeOutput.push(line),
    }),
    (error) => error instanceof RadarE18ProcessStop
      && error.code === "CANDIDATE_SURFACE_DRIFT"
      && error.candidateSurfaceEvidence.name === "shape",
  );
  assert.deepEqual(shapeOutput.map(JSON.parse), [{
    name: "shape", expected: true, observed: false,
  }]);
  assert.doesNotMatch(shapeOutput.join("\n"), /raw_private|secret|payload|token/i);

  const multiple = fixture();
  multiple.personTargets = 6;
  multiple.rls.kd_radar_subscriptions.enabled = false;
  assert.throws(
    () => validateRadarPersonCandidateSurface(multiple, { fehlerAusgabe() {} }),
    (error) => error instanceof RadarE18ProcessStop
      && error.candidateSurfaceEvidence.name === "personTargets",
  );
});

console.log(`${checks} Kandidaten-Surface-Offlinechecks bestanden.`);

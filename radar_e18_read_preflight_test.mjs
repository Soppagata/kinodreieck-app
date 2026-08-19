/* Dauerhafte E18-Read-Preflight-Diagnose: ausschliesslich lokale Fakes. */
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import {
  RADAR_E18_READ_PREFLIGHT_SUBCODES,
  RadarE18ProcessStop,
  validateRadarE18ReadPreflight,
} from "./tools/radar_e18_process_executor.mjs";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

function fixture() {
  const ledger = [
    { version: "20260817120000", name: "blog_profile_extract_config" },
    { version: "20260817180000", name: "radar_websearch_mvp_package_a" },
    { version: "20260817190000", name: "radar_websearch_mvp_package_b" },
  ];
  return {
    expectedLedger: structuredClone(ledger),
    observed: {
      ledger,
      flags: {
        radar: { radar: false, provider: false, shares: false, scheduler: false, proposal: false },
        private: { requests: false, scheduler: false },
        provider: {
          feature: false, rights: true, dpa: true, retention: true,
          price: true, legal: "APPROVED", current: true,
        },
      },
      limits: { model: "klein", tokens: 1200, taskCap: 5, searchFee: 1, requestCap: 500 },
      sources: { eligible: 2, official: 1, families: 1 },
      account: { role: "owner", active: true, personalAi: true, pilot: true, review: true },
      surface: {
        candidateLedger: false, personColumn: false, personRpc: false,
        personUpsert: false, personTarget: 0,
      },
      writers: { sessions: 0, locks: 0 },
    },
  };
}

check("alle Subcodes stoppen geordnet mit sanitisiertem 0600-Beleg", () => {
  const rawMarker = "raw_private_secret_payload_access_token";
  const cases = [
    ["READ_PREFLIGHT_SHAPE_DRIFT", (value) => { value.rawPayload = rawMarker; }],
    ["READ_PREFLIGHT_LEDGER_SHAPE_DRIFT", (value) => { value.ledger[0].rawPayload = rawMarker; }],
    ["READ_PREFLIGHT_LEDGER_COUNT_DRIFT", (value) => { value.ledger.pop(); }],
    ["READ_PREFLIGHT_LEDGER_DIGEST_DRIFT", (value) => { value.ledger[0].name = rawMarker; }],
    ["READ_PREFLIGHT_FLAGS_DRIFT", (value) => { value.flags.radar.radar = true; }],
    ["READ_PREFLIGHT_LIMITS_DRIFT", (value) => { value.limits.model = rawMarker; }],
    ["READ_PREFLIGHT_SOURCES_DRIFT", (value) => { value.sources.eligible = 0; }],
    ["READ_PREFLIGHT_ACCOUNT_ROLE_DRIFT", (value) => { value.account.role = "member"; }],
    ["READ_PREFLIGHT_ACCOUNT_CAPABILITIES_DRIFT", (value) => { value.account.review = false; }],
    ["READ_PREFLIGHT_SURFACE_DRIFT", (value) => { value.surface.personTarget = 1; }],
    ["READ_PREFLIGHT_WRITERS_DRIFT", (value) => { value.writers.sessions = 1; }],
  ];
  assert.deepEqual(cases.map(([code]) => code), RADAR_E18_READ_PREFLIGHT_SUBCODES);
  const root = mkdtempSync("/private/tmp/kinodreieck-read-preflight-test-");
  const payloads = new Map();
  chmodSync(root, 0o700);
  try {
    for (const [index, [code, mutate]] of cases.entries()) {
      const state = fixture();
      mutate(state.observed);
      const runDir = join(root, String(index));
      mkdirSync(runDir, { mode: 0o700 });
      const evidencePath = join(runDir, "read-preflight-stop.json");
      const output = [];
      let stopped;
      try {
        validateRadarE18ReadPreflight({
          ...state,
          evidencePath,
          fehlerAusgabe: (line) => output.push(line),
        });
      } catch (error) {
        stopped = error;
      }
      assert.equal(stopped instanceof RadarE18ProcessStop, true, code);
      assert.equal(stopped.code, code);
      assert.equal(Object.isFrozen(stopped.readPreflightEvidence), true);
      assert.equal(output.length, 1);
      assert.equal(lstatSync(evidencePath).mode & 0o077, 0);
      const payload = JSON.parse(readFileSync(evidencePath, "utf8"));
      payloads.set(code, payload);
      assert.deepEqual(payload, stopped.readPreflightEvidence);
      assert.deepEqual(JSON.parse(output[0]), payload);
      assert.deepEqual(Object.keys(payload).sort(), ["code", "expected", "observed"]);
      const serialized = `${output[0]}\n${readFileSync(evidencePath, "utf8")}\n${stopped.message}`;
      assert.doesNotMatch(serialized, /raw_private|secret|payload|api[_-]?key|access[_-]?token|bearer|@[A-Za-z]|https?:|[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    }
    const count = payloads.get("READ_PREFLIGHT_LEDGER_COUNT_DRIFT");
    assert.deepEqual([count.expected, count.observed], [3, 2]);
    const digest = payloads.get("READ_PREFLIGHT_LEDGER_DIGEST_DRIFT");
    assert.match(digest.expected, /^[0-9a-f]{64}$/);
    assert.match(digest.observed, /^[0-9a-f]{64}$/);
    const flags = payloads.get("READ_PREFLIGHT_FLAGS_DRIFT");
    assert.equal(Object.values(flags.expected).every((value) => typeof value === "boolean"), true);
    assert.equal(Object.values(flags.observed).every((value) => typeof value === "boolean"), true);
    assert.deepEqual(payloads.get("READ_PREFLIGHT_ACCOUNT_ROLE_DRIFT"), {
      code: "READ_PREFLIGHT_ACCOUNT_ROLE_DRIFT", expected: "owner", observed: "member",
    });
    assert.deepEqual(payloads.get("READ_PREFLIGHT_WRITERS_DRIFT").observed, {
      locks: 0, sessions: 1,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("nur der erste Drift erscheint; gruen erzeugt keinen Beleg", () => {
  const root = mkdtempSync("/private/tmp/kinodreieck-read-preflight-order-");
  chmodSync(root, 0o700);
  try {
    const first = fixture();
    first.observed.flags.radar.radar = true;
    first.observed.account.role = "member";
    first.observed.writers.sessions = 3;
    const evidencePath = join(root, "read-preflight-stop.json");
    assert.throws(
      () => validateRadarE18ReadPreflight({ ...first, evidencePath, fehlerAusgabe() {} }),
      (error) => error instanceof RadarE18ProcessStop
        && error.code === "READ_PREFLIGHT_FLAGS_DRIFT",
    );
    rmSync(evidencePath, { force: false });
    const output = [];
    assert.equal(validateRadarE18ReadPreflight({
      ...fixture(), evidencePath, fehlerAusgabe: (line) => output.push(line),
    }), true);
    assert.deepEqual(output, []);
    assert.equal(existsSync(evidencePath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("Ledger-Digest kanonisiert JSONB-Schluessel und haelt den Kandidaten aus PRE", () => {
  const root = mkdtempSync("/private/tmp/kinodreieck-read-preflight-ledger-");
  chmodSync(root, 0o700);
  try {
    const state = fixture();
    state.observed.ledger = state.observed.ledger.map(({ version, name }) => ({ name, version }));
    const evidencePath = join(root, "read-preflight-stop.json");
    assert.equal(validateRadarE18ReadPreflight({
      ...state, evidencePath, fehlerAusgabe() {},
    }), true);
    assert.equal(existsSync(evidencePath), false);

    state.observed.ledger.push({
      name: "radar_person_server_candidate",
      version: "20260819220000",
    });
    assert.throws(
      () => validateRadarE18ReadPreflight({
        ...state, evidencePath, fehlerAusgabe() {},
      }),
      (error) => error instanceof RadarE18ProcessStop
        && error.code === "READ_PREFLIGHT_LEDGER_COUNT_DRIFT",
    );
    assert.deepEqual(JSON.parse(readFileSync(evidencePath, "utf8")), {
      code: "READ_PREFLIGHT_LEDGER_COUNT_DRIFT",
      expected: 3,
      observed: 4,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("Persistenz bleibt auf leeren privaten Tempraum begrenzt", () => {
  const state = fixture();
  state.observed.account.role = "member";
  assert.throws(
    () => validateRadarE18ReadPreflight({
      ...state,
      evidencePath: "/private/tmp/not-allowlisted.json",
      fehlerAusgabe() {},
    }),
    (error) => error instanceof RadarE18ProcessStop
      && error.code === "READ_PREFLIGHT_EVIDENCE_PATH_INVALID",
  );
  assert.equal(existsSync("/private/tmp/not-allowlisted.json"), false);
});

console.log(`${checks} Read-Preflight-Offlinechecks bestanden.`);

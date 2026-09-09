#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("tools/rls_test_personal.mjs", "utf8");
const functionSource = source.match(
  /function evaluateRlsAccessPreflight\([\s\S]*?\n\}/u,
)?.[0] || "";
const evaluateRlsAccessPreflight = Function(
  `"use strict"; ${functionSource}; return evaluateRlsAccessPreflight;`,
)();
const permissionFunctionSource = source.match(
  /function postgresRechtVerweigert\([\s\S]*?\n\}/u,
)?.[0] || "";
const postgresRechtVerweigert = Function(
  `"use strict"; ${permissionFunctionSource}; return postgresRechtVerweigert;`,
)();

const access = (active, accountId = "account-b") => ({
  status: 200,
  data: active === null ? [] : [{ account_id: accountId, role: "member", active, personal_ai: false }],
});
const helper = (value) => ({ status: 200, data: value });
const preflight = (mode, accessB, helperB, accessA = access(true, "account-a"), helperA = helper(true)) => (
  evaluateRlsAccessPreflight(mode, "account-a", accessA, helperA, "account-b", accessB, helperB)
);

test("Live-RLS-Modus ist zwingend explizit und besitzt keinen active-Default", () => {
  assert.match(source, /const ACCESS_MODE = \(process\.env\.KD_RLS_ACCESS_MODE \|\| ""\)/u);
  assert.doesNotMatch(source, /KD_RLS_ACCESS_MODE \|\| "active"/u);
  assert.match(source, /\["active", "inactive", "missing"\]\.includes\(ACCESS_MODE\)/u);
});

test("Rollen-Vorbedingung erkennt active, inactive und missing exakt", () => {
  assert.deepEqual(
    preflight("active", access(true), helper(true)),
    { ok: true, observedA: "active", observedB: "active" },
  );
  assert.deepEqual(
    preflight("inactive", access(false), helper(false)),
    { ok: true, observedA: "active", observedB: "inactive" },
  );
  assert.deepEqual(
    preflight("missing", access(null), helper(false)),
    { ok: true, observedA: "active", observedB: "missing" },
  );
});

test("Falscher Kontostand und widersprüchlicher Helper stoppen fail-closed", () => {
  assert.equal(
    preflight("active", access(false), helper(false)).ok,
    false,
  );
  assert.equal(
    preflight("inactive", access(false), helper(true)).ok,
    false,
  );
  assert.equal(
    preflight("missing", access(null), helper(false), access(false, "account-a"), helper(false)).ok,
    false,
  );
});

test("Active und inactive brauchen genau eine gültige B-Zeile, missing genau null", () => {
  const duplicate = access(true);
  duplicate.data.push({ ...duplicate.data[0] });
  assert.equal(preflight("active", duplicate, helper(true)).ok, false);
  assert.equal(preflight("inactive", { status: 200, data: [] }, helper(false)).ok, false);
  assert.equal(preflight("missing", access(false), helper(false)).ok, false);
  assert.equal(preflight("active", access(true, "wrong-account"), helper(true)).ok, false);
  assert.equal(preflight("active", {
    status: 200,
    data: [{ account_id: "account-b", role: "admin", active: true, personal_ai: false }],
  }, helper(true)).ok, false);
  assert.equal(preflight("missing", { status: 503, data: [] }, helper(false)).ok, false);
});

test("Vorbedingungsstopp liegt vor jedem mutierenden Testpfad", () => {
  const guard = source.indexOf("RLS_PRECONDITION_MISMATCH");
  const firstWrite = source.indexOf("const accessWrite =");
  assert.ok(guard >= 0 && firstWrite > guard);
  assert.match(source.slice(guard, firstWrite), /process\.exit\(2\)/u);
  assert.match(source, /Kein Schreibtest gestartet/u);
});

test("Live-Suite erwartet die wirksame Privatrelease-Grenze statt alte anonyme Demo-Rechte", () => {
  assert.match(source, /T11a anon darf kd_store scope=demo im Privatrelease nicht lesen/u);
  assert.match(source, /T11c anon erhält auf kd_catalog einen Rechtefehler und keine Zeile/u);
  assert.match(source, /T11j anon darf demo_seed im Privatrelease nicht lesen/u);
  assert.match(source, /T15d aktives Konto liest die Projektion über die schmale RPC/u);
  assert.match(source, /const t15d = await rest\("POST", "\/rpc\/kd_list_shared_articles", \{ token: A\.token/u);
  assert.doesNotMatch(source, /anon liest weiterhin kd_store|anon sieht genau einen validierten demo_seed/u);
});

test("T11 akzeptiert nur den belegten PostgreSQL-Rechtefehler", () => {
  assert.equal(postgresRechtVerweigert({ status: 401, data: { code: "42501" } }), true);
  assert.equal(postgresRechtVerweigert({ status: 403, data: { code: "42501" } }), true);
  assert.equal(postgresRechtVerweigert({ status: 401, data: { code: "PGRST301" } }), false);
  assert.equal(postgresRechtVerweigert({ status: 401, data: null }), false);
  assert.equal(postgresRechtVerweigert({ status: 400, data: { code: "42501" } }), false);
  for (const name of ["t11a", "t11b", "t11cat", "t11seed"]) {
    assert.match(source, new RegExp(`postgresRechtVerweigert\\(${name}\\)`));
  }
  assert.equal((source.match(/postgresRechtVerweigert\(t11cat\)/gu) || []).length, 4);
  assert.equal((source.match(/postgresRechtVerweigert\(t11seed\)/gu) || []).length, 2);
});

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

const access = (active) => ({
  status: 200,
  data: active === null ? [] : [{ role: "member", active, personal_ai: false }],
});
const helper = (value) => ({ status: 200, data: value });

test("Live-RLS-Modus ist zwingend explizit und besitzt keinen active-Default", () => {
  assert.match(source, /const ACCESS_MODE = \(process\.env\.KD_RLS_ACCESS_MODE \|\| ""\)/u);
  assert.doesNotMatch(source, /KD_RLS_ACCESS_MODE \|\| "active"/u);
  assert.match(source, /\["active", "inactive", "missing"\]\.includes\(ACCESS_MODE\)/u);
});

test("Rollen-Vorbedingung erkennt active, inactive und missing exakt", () => {
  assert.deepEqual(
    evaluateRlsAccessPreflight("active", access(true), helper(true), access(true), helper(true)),
    { ok: true, observedA: "active", observedB: "active" },
  );
  assert.deepEqual(
    evaluateRlsAccessPreflight("inactive", access(true), helper(true), access(false), helper(false)),
    { ok: true, observedA: "active", observedB: "inactive" },
  );
  assert.deepEqual(
    evaluateRlsAccessPreflight("missing", access(true), helper(true), access(null), helper(false)),
    { ok: true, observedA: "active", observedB: "missing" },
  );
});

test("Falscher Kontostand und widersprüchlicher Helper stoppen fail-closed", () => {
  assert.equal(
    evaluateRlsAccessPreflight("active", access(true), helper(true), access(false), helper(false)).ok,
    false,
  );
  assert.equal(
    evaluateRlsAccessPreflight("inactive", access(true), helper(true), access(false), helper(true)).ok,
    false,
  );
  assert.equal(
    evaluateRlsAccessPreflight("missing", access(false), helper(false), access(null), helper(false)).ok,
    false,
  );
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

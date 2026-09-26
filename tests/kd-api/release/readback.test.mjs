import assert from "node:assert/strict";
import test from "node:test";
import {
  parseKdApiReadbackArgs,
  readKdApiVersion,
} from "../../../tools/kd-api-readback.mjs";

const commit = "c".repeat(40);
const expected = {
  functionSlug: "kd-api",
  contractVersion: "kd-api-v1",
  sourceCommit: commit,
  releaseId: "e5-readback",
  enabled: false,
};

function response(body = expected, { status = 200, contentType = "application/json" } = {}) {
  return { status, headers: { get: () => contentType }, async json() { return body; } };
}

test("Readback verlangt exakt fünf gebundene Versionsfelder und folgt keiner Umleitung", async () => {
  const calls = [];
  const result = await readKdApiVersion({
    baseUrl: "https://example.supabase.co/functions/v1/kd-api",
    expectedSourceCommit: commit,
    expectedReleaseId: "e5-readback",
    expectEnabled: false,
    fetchImpl: async (url, options) => { calls.push([url, options]); return response(); },
  });
  assert.equal(result.sourceCommit, commit);
  assert.equal(calls[0][0], "https://example.supabase.co/functions/v1/kd-api/_meta/version");
  assert.equal(calls[0][1].redirect, "manual");

  await assert.rejects(() => readKdApiVersion({
    baseUrl: "https://example.supabase.co/functions/v1/kd-api",
    expectedSourceCommit: commit,
    expectedReleaseId: "e5-readback",
    expectEnabled: false,
    fetchImpl: async () => response({ ...expected, projectId: "secret-ish" }),
  }), /FIELDS_INVALID/);
  await assert.rejects(() => readKdApiVersion({
    baseUrl: "https://example.supabase.co/functions/v1/kd-api",
    expectedSourceCommit: commit,
    expectedReleaseId: "e5-readback",
    expectEnabled: false,
    fetchImpl: async () => response(expected, { status: 302 }),
  }), /REDIRECT_REJECTED/);
});

test("Readback-CLI bindet URL, Commit, Release und Gate", () => {
  const parsed = parseKdApiReadbackArgs([
    "--base-url", "https://example.supabase.co/functions/v1/kd-api/",
    "--expected-source-commit", commit,
    "--expected-release-id", "release-1",
    "--expect-enabled", "true",
  ]);
  assert.equal(parsed.baseUrl, "https://example.supabase.co/functions/v1/kd-api");
  assert.equal(parsed.expectEnabled, true);
  assert.throws(() => parseKdApiReadbackArgs([
    "--base-url", "https://example.supabase.co/functions/v1/other",
    "--expected-source-commit", commit,
    "--expected-release-id", "release-1",
    "--expect-enabled", "false",
  ]), /NOT_KD_API/);
});

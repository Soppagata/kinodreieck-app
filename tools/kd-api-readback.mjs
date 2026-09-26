#!/usr/bin/env node
/* Read-only, bytegenauer Versions-Readback der ausgelieferten kd-api-Function. */

import { pathToFileURL } from "node:url";
import { KD_API_CONTRACT_VERSION, KD_API_FUNCTION_SLUG } from "./kd-api-release-info.mjs";

const COMMIT = /^[a-f0-9]{40}$/;
const RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const EXACT_FIELDS = Object.freeze([
  "functionSlug", "contractVersion", "sourceCommit", "releaseId", "enabled",
]);

function exactObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === EXACT_FIELDS.length
    && Object.keys(value).every((key) => EXACT_FIELDS.includes(key));
}

export function parseKdApiReadbackArgs(argv) {
  const expectedNames = [
    "--base-url", "--expected-source-commit", "--expected-release-id", "--expect-enabled",
  ];
  if (argv.length !== 8 || expectedNames.some((name, index) => argv[index * 2] !== name)) {
    throw new Error("Aufruf: node tools/kd-api-readback.mjs --base-url <function-entry> --expected-source-commit <40hex> --expected-release-id <id> --expect-enabled <true|false>");
  }
  let base;
  try { base = new URL(argv[1]); } catch { throw new Error("BASE_URL_INVALID"); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("BASE_URL_INVALID");
  }
  const normalizedPath = base.pathname.replace(/\/+$/, "");
  if (!normalizedPath.endsWith(`/functions/v1/${KD_API_FUNCTION_SLUG}`)) {
    throw new Error("BASE_URL_NOT_KD_API_FUNCTION_ENTRY");
  }
  base.pathname = normalizedPath;
  const sourceCommit = argv[3];
  const releaseId = argv[5];
  if (!COMMIT.test(sourceCommit)) throw new Error("EXPECTED_SOURCE_COMMIT_INVALID");
  if (!RELEASE_ID.test(releaseId)) throw new Error("EXPECTED_RELEASE_ID_INVALID");
  if (argv[7] !== "true" && argv[7] !== "false") throw new Error("EXPECTED_ENABLED_INVALID");
  return Object.freeze({
    baseUrl: base.href.replace(/\/$/, ""),
    expectedSourceCommit: sourceCommit,
    expectedReleaseId: releaseId,
    expectEnabled: argv[7] === "true",
  });
}

export async function readKdApiVersion({
  baseUrl,
  expectedSourceCommit,
  expectedReleaseId,
  expectEnabled,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  const endpoint = `${baseUrl}/_meta/version`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(error?.name === "AbortError" ? "KD_API_READBACK_TIMEOUT" : "KD_API_READBACK_TRANSPORT_ERROR");
  } finally {
    clearTimeout(timer);
  }
  if (response.status >= 300 && response.status < 400) throw new Error("KD_API_READBACK_REDIRECT_REJECTED");
  if (response.status !== 200) throw new Error(`KD_API_READBACK_HTTP_${response.status}`);
  const contentType = response.headers?.get?.("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new Error("KD_API_READBACK_CONTENT_TYPE_INVALID");
  let body;
  try { body = await response.json(); } catch { throw new Error("KD_API_READBACK_JSON_INVALID"); }
  if (!exactObject(body)) throw new Error("KD_API_READBACK_FIELDS_INVALID");
  const expected = {
    functionSlug: KD_API_FUNCTION_SLUG,
    contractVersion: KD_API_CONTRACT_VERSION,
    sourceCommit: expectedSourceCommit,
    releaseId: expectedReleaseId,
    enabled: expectEnabled,
  };
  for (const field of EXACT_FIELDS) {
    if (body[field] !== expected[field]) throw new Error(`KD_API_READBACK_MISMATCH_${field}`);
  }
  return Object.freeze({ ...body, endpoint });
}

export async function runKdApiReadbackCli(argv = process.argv.slice(2), dependencies = {}) {
  return readKdApiVersion({ ...parseKdApiReadbackArgs(argv), ...dependencies });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const result = await runKdApiReadbackCli();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

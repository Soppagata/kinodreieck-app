#!/usr/bin/env node
/* Read-only Management-Postflight fuer den zusammen deployten API-Functionsatz.
   Commitmarker werden getrennt ueber ai-task Health und kd-api Meta gelesen. */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const KD_API_REQUIRED_FUNCTIONS = Object.freeze([
  Object.freeze({ slug: "ai-task", verifyJwt: true }),
  Object.freeze({ slug: "kd-api", verifyJwt: false }),
]);

function rows(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.functions)) return value.functions;
  throw new Error("FUNCTION_SET_SNAPSHOT_INVALID");
}

export function verifyKdApiFunctionSetSnapshot(value) {
  const snapshot = rows(value);
  const functions = KD_API_REQUIRED_FUNCTIONS.map((target) => {
    const matches = snapshot.filter((entry) => entry?.slug === target.slug);
    if (matches.length !== 1) throw new Error(`FUNCTION_SET_MISSING_${target.slug}`);
    const entry = matches[0];
    const verifyJwt = Object.hasOwn(entry, "verify_jwt") ? entry.verify_jwt : entry.verifyJwt;
    if (entry.status !== "ACTIVE" || verifyJwt !== target.verifyJwt
        || !Number.isSafeInteger(entry.version) || entry.version < 1) {
      throw new Error(`FUNCTION_SET_INVALID_${target.slug}`);
    }
    return Object.freeze({
      slug: target.slug,
      status: entry.status,
      verifyJwt,
      version: entry.version,
    });
  });
  return Object.freeze({ ok: true, functions: Object.freeze(functions) });
}

export function runKdApiFunctionSetReadbackCli(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== "--snapshot") {
    throw new Error("Aufruf: node tools/kd-api-function-set-readback.mjs --snapshot <functions.json>");
  }
  let value;
  try { value = JSON.parse(readFileSync(argv[1], "utf8")); }
  catch { throw new Error("FUNCTION_SET_SNAPSHOT_UNREADABLE"); }
  return verifyKdApiFunctionSetSnapshot(value);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    console.log(JSON.stringify(runKdApiFunctionSetReadbackCli(), null, 2));
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

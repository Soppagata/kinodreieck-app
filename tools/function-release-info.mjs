#!/usr/bin/env node
/* Erzeugt keine Deployments und liest keine Secrets. Es beschreibt lediglich
   den exakt aus Git reproduzierbaren ai-task-Quellstand für Review/Runbook. */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const DATEIEN = Object.freeze([
  "supabase/functions/ai-task/index.ts",
  "supabase/functions/ai-task/providerContract.ts",
  "supabase/functions/ai-task/requestContract.ts",
  "supabase/functions/account-self-service/index.ts",
  "supabase/functions/filmwissen-task/quellen.ts",
  "supabase/functions/filmwissen-task/vertrag.ts",
]);

export function releaseInfo({
  git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim(),
} = {}) {
  const commit = git(["rev-parse", "HEAD"]);
  const status = git(["status", "--short", "--", ...DATEIEN]);
  if (status) {
    throw new Error(
      "Function-Quellen sind nicht committed. Erst prüfen und committen, dann deployen.",
    );
  }
  const hash = createHash("sha256");
  for (const datei of DATEIEN) {
    const inhalt = git(["show", `${commit}:${datei}`]);
    hash.update(datei);
    hash.update("\0");
    hash.update(inhalt);
    hash.update("\0");
  }
  return {
    commit,
    buildVersion: commit,
    sourceSha256: hash.digest("hex"),
    dateien: [...DATEIEN],
  };
}

const direkt = process.argv[1]
  && new URL(`file://${process.argv[1]}`).href === import.meta.url;
if (direkt) {
  try {
    console.log(JSON.stringify(releaseInfo(), null, 2));
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}

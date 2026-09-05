#!/usr/bin/env node

import assert from "node:assert/strict";
import { bestaetigeFunctionDeploymentReadback } from "./tools/live_function_readback.mjs";

const build = "f08ae9077d0d2a875e94d00cae1f088eb1449b60";
const managementFunctions = [
  { slug: "ai-task", status: "ACTIVE", verify_jwt: true, version: 59 },
  { slug: "radar-websearch-task", status: "ACTIVE", verify_jwt: false, version: 57 },
  { slug: "entdecken-daily-task", status: "ACTIVE", verify_jwt: false, version: 31 },
];
const sourceReadbacks = managementFunctions.map(({ slug }) => ({
  slug,
  status: "downloaded",
  localFiles: [{ path: "index.ts", bytes: `${slug}-source` }],
  downloadedFiles: [{ path: "index.ts", bytes: `${slug}-source` }],
}));

const proof = bestaetigeFunctionDeploymentReadback({
  expectedBuildVersion: build,
  healthBuildVersion: build,
  managementFunctions,
  sourceReadbacks,
});
assert.equal(proof.ok, true);
assert.equal(proof.functions.find(({ slug }) => slug === "radar-websearch-task")?.verifyJwt, false);

assert.throws(() => bestaetigeFunctionDeploymentReadback({
  expectedBuildVersion: build,
  healthBuildVersion: build,
  managementFunctions: managementFunctions.map((entry) => entry.slug === "radar-websearch-task"
    ? { ...entry, verify_jwt: true } : entry),
  sourceReadbacks,
}), (error) => error?.code === "FUNCTION_MANAGEMENT_UNCONFIRMED");

console.log("RELEASE-OPS-AUDIT-LIVE-FUNCTION-READBACK BESTANDEN (3/3)");

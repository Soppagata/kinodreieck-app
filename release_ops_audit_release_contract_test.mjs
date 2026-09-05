#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMetaFehler } from "./tools/deployment_contract.mjs";

const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const staging = workflow.match(/\n  deploy-staging:[\s\S]*?\n  deploy-production:/)?.[0] || "";
const production = workflow.match(/\n  deploy-production:[\s\S]*$/)?.[0] || "";

assert.match(staging,
  /github\.event_name == 'workflow_dispatch' &&\s+github\.ref_name == 'staging' && inputs\.target == 'staging'/,
  "Ein manueller Staging-Deploy darf nur den staging-Ref ausliefern.");
assert.match(production,
  /github\.ref_name == 'main'[\s\S]*?github\.event_name == 'workflow_dispatch' && inputs\.target == 'production'/,
  "Ein manueller Production-Deploy bleibt an main gebunden.");

const version = "f08ae9077d0d2a875e94d00cae1f088eb1449b60";
assert.equal(buildMetaFehler({ format: 1, buildVersion: version, appEnvironment: "staging" }, version, "staging"), null);
assert.match(buildMetaFehler({ format: 1, buildVersion: version, appEnvironment: "production" }, version, "staging"), /Umgebung production/);
assert.match(buildMetaFehler({ format: 1, buildVersion: version }, version, "staging"), /unvollständige Build-Metadaten/);

const smoke = readFileSync("tools/smoke-deployment.mjs", "utf8");
assert.match(smoke, /buildMetaFehler\(meta, erwarteteVersion, erwarteteUmgebung\)/);
assert.match(smoke, /DEPLOY_TARGET muss staging oder production sein/);

const workflowQuellen = ["deploy.yml", "private-ops-monitor.yml"]
  .map((name) => readFileSync(`.github/workflows/${name}`, "utf8"))
  .join("\n");
assert.doesNotMatch(workflowQuellen, /actions\/(?:checkout|setup-node)@v4|actions\/cache@v4/);
assert.match(workflowQuellen, /actions\/checkout@v7/);
assert.match(workflowQuellen, /actions\/setup-node@v7/);
assert.match(workflowQuellen, /actions\/cache@v6/);

console.log("RELEASE-OPS-AUDIT-RELEASE-CONTRACT BESTANDEN (11/11)");

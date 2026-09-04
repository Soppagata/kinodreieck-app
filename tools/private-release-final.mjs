#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* Dieses ist das einzige gemeinsame Abschlussgate. Jeder Schritt laeuft genau
   einmal; ein frueher Fehler darf spaetere, unabhaengige Beweise nicht
   verschlucken. Echte AI-/Providerbefehle gehoeren absichtlich nicht hinein. */
export const PRIVATE_RELEASE_FINAL_STEPS = Object.freeze([
  Object.freeze({ id: "mock-suite", command: "npm", args: Object.freeze(["test"]) }),
  Object.freeze({ id: "function-suite", command: "npm", args: Object.freeze(["run", "test:function"]) }),
  Object.freeze({ id: "account-ready-browsers", command: "npm", args: Object.freeze(["run", "test:private-v1"]) }),
  Object.freeze({ id: "vite-build", command: "npm", args: Object.freeze(["run", "build"]) }),
  Object.freeze({ id: "single-file-build", command: "npm", args: Object.freeze(["run", "build:single"]) }),
  Object.freeze({
    id: "candidate-integrity",
    command: process.execPath,
    args: Object.freeze(["tools/private-release-integrity.mjs", "--base", "origin/main"]),
  }),
]);

const FORBIDDEN_COMMAND = /(?:test:ai(?::|\b)|ai-live|ai-eval|owner-approved-server-budget|confirm-paid)/iu;

export function validateFinalGatePlan(steps = PRIVATE_RELEASE_FINAL_STEPS) {
  const errors = [];
  const expected = [
    "npm test",
    "npm run test:function",
    "npm run test:private-v1",
    "npm run build",
    "npm run build:single",
    `${process.execPath} tools/private-release-integrity.mjs --base origin/main`,
  ];
  const observed = steps.map((step) => [step?.command, ...(step?.args || [])].join(" "));
  if (observed.length !== expected.length || observed.some((entry, index) => entry !== expected[index])) {
    errors.push("final-gate-plan-mismatch");
  }
  if (new Set(steps.map((step) => step?.id)).size !== steps.length) errors.push("final-gate-step-id-duplicate");
  if (observed.some((entry) => FORBIDDEN_COMMAND.test(entry))) errors.push("paid-provider-command-forbidden");
  if (observed.some((entry) => /(?:^|\s)(?:--retries?|retry)(?:\s|=|$)/iu.test(entry))) {
    errors.push("retry-command-forbidden");
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function normalisiereErgebnis(step, result) {
  const code = Number.isInteger(result?.status) ? result.status : 1;
  const detail = result?.error
    ? `Startfehler: ${result.error.code || result.error.message || "unbekannt"}`
    : result?.signal ? `Signal: ${result.signal}` : code === 0 ? "bestanden" : `Exit ${code}`;
  return Object.freeze({ id: step.id, ok: code === 0 && !result?.signal && !result?.error, code, detail });
}

export function runFinalGate({
  steps = PRIVATE_RELEASE_FINAL_STEPS,
  cwd = REPOSITORY_ROOT,
  runner = (command, args, options) => spawnSync(command, args, options),
  log = console.log,
  error = console.error,
} = {}) {
  const plan = validateFinalGatePlan(steps);
  if (!plan.ok) {
    error(`[PRIVATE_RELEASE_FINAL] ungueltiger Gateplan: ${plan.errors.join(", ")}`);
    return Object.freeze({ ok: false, plan, results: Object.freeze([]) });
  }

  const results = [];
  for (const step of steps) {
    log(`\n[PRIVATE_RELEASE_FINAL] START ${step.id}`);
    let raw;
    try {
      raw = runner(step.command, [...step.args], {
        cwd,
        env: process.env,
        stdio: "inherit",
        shell: false,
      });
    } catch (cause) {
      raw = { status: 1, error: cause };
    }
    const result = normalisiereErgebnis(step, raw);
    results.push(result);
    (result.ok ? log : error)(`[PRIVATE_RELEASE_FINAL] ${result.ok ? "OK" : "FEHLER"} ${step.id}: ${result.detail}`);
  }

  log("\n[PRIVATE_RELEASE_FINAL] Zusammenfassung");
  for (const result of results) log(`- ${result.id}: ${result.ok ? "OK" : "FEHLER"} (${result.detail})`);
  const ok = results.every((result) => result.ok);
  return Object.freeze({ ok, plan, results: Object.freeze(results) });
}

function istDirekterAufruf() {
  const aufruf = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
  return aufruf === import.meta.url;
}

if (istDirekterAufruf()) {
  const ergebnis = runFinalGate();
  if (!ergebnis.ok) process.exitCode = 1;
}

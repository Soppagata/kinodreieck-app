#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TOKEN_RULES = Object.freeze([
  Object.freeze({ id: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/gu }),
  Object.freeze({ id: "github-fine-grained-token", pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/gu }),
  Object.freeze({ id: "openai-token", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/gu }),
  Object.freeze({ id: "anthropic-token", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/gu }),
  Object.freeze({ id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu }),
  Object.freeze({ id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gu }),
  Object.freeze({ id: "google-api-key", pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/gu }),
]);

const ASSIGNMENT_PATTERN = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|service[_-]?role[_-]?key|password|passwd)\b\s*[:=]\s*["'`]([^"'`\n]{8,})["'`]/giu;
const SAFE_VALUE = /^(?:synthetic|fixture|test|example|dummy|placeholder|fake|not-a-secret|redacted)(?:[-_:].*)?$/iu;
const ENV_REFERENCE = /(?:\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}|(?:process|Deno)\.env|import\.meta\.env|\$[A-Z][A-Z0-9_]*)/u;

function privateKeyPattern() {
  return new RegExp(["-----BEGIN", "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"].join(" "), "gu");
}

function patchAdditions(diff) {
  const additions = [];
  let path = null;
  let line = 0;
  for (const raw of String(diff || "").split("\n")) {
    if (raw.startsWith("+++ b/")) { path = raw.slice(6); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (!path || raw.startsWith("diff --git ") || raw.startsWith("--- ") || raw.startsWith("+++ ")) continue;
    if (raw.startsWith("+")) {
      additions.push(Object.freeze({ path, line, text: raw.slice(1) }));
      line += 1;
    } else if (!raw.startsWith("-")) line += 1;
  }
  return additions;
}

function sichererTestmarker(value, path = "") {
  const normalized = String(value || "").trim();
  return SAFE_VALUE.test(String(value || "").trim())
    || ENV_REFERENCE.test(normalized)
    || (/(?:^|\/)(?:tests\/|[^/]*(?:_test|\.spec)\.(?:mjs|js|ts|tsx))$/iu.test(path)
      && /^(?:access|refresh)-(?:b1|neu)$/iu.test(normalized));
}

/* Rueckgabe nennt absichtlich nur Regel und Position. Ein gefundenes Secret
   darf auch im Fehlerfall nie in Log oder Chat kopiert werden. */
export function scanAddedCommittedDiff(diff) {
  const findings = [];
  for (const addition of patchAdditions(diff)) {
    const privateKey = privateKeyPattern();
    if (privateKey.test(addition.text)) {
      findings.push(Object.freeze({ rule: "private-key", path: addition.path, line: addition.line }));
    }
    for (const rule of TOKEN_RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of addition.text.matchAll(rule.pattern)) {
        if (!sichererTestmarker(match[0], addition.path)) {
          findings.push(Object.freeze({ rule: rule.id, path: addition.path, line: addition.line }));
        }
      }
    }
    ASSIGNMENT_PATTERN.lastIndex = 0;
    for (const match of addition.text.matchAll(ASSIGNMENT_PATTERN)) {
      if (!sichererTestmarker(match[2], addition.path)) {
        findings.push(Object.freeze({ rule: `hardcoded-${match[1].toLowerCase()}`, path: addition.path, line: addition.line }));
      }
    }
  }
  return Object.freeze(findings);
}

function filesBelow(root) {
  if (!existsSync(root)) return [];
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...filesBelow(path));
    else result.push(path);
  }
  return result;
}

export function validateBuiltArtifacts(root = REPOSITORY_ROOT) {
  const errors = [];
  const dist = resolve(root, "dist");
  const indexPath = join(dist, "index.html");
  const assets = filesBelow(join(dist, "assets"));
  const js = assets.filter((path) => /\.js$/u.test(path));
  const css = assets.filter((path) => /\.css$/u.test(path));
  if (!existsSync(indexPath)) errors.push("dist-index-missing");
  else {
    const index = readFileSync(indexPath, "utf8");
    if (!/<div\s+id=["']root["']/iu.test(index)) errors.push("dist-root-marker-missing");
    const references = [...index.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/giu)]
      .map((match) => match[1]);
    if (!references.length) errors.push("dist-asset-reference-missing");
    for (const reference of references) {
      if (!existsSync(resolve(dist, `.${reference}`))) errors.push(`dist-asset-target-missing:${reference}`);
    }
  }
  if (!js.length) errors.push("dist-javascript-missing");
  if (!css.length) errors.push("dist-css-missing");
  if (!existsSync(join(dist, "sw.js"))) errors.push("dist-service-worker-missing");

  const singlePath = resolve(root, "dist-single", "Kinodreieck.html");
  if (!existsSync(singlePath)) errors.push("single-file-missing");
  else {
    const html = readFileSync(singlePath, "utf8");
    for (const marker of [
      "data-kd-einzeldatei-seed", "window.__KD_DEMO_SEED__",
      "Der letzte Vorführer", "Sommer der Kometen", "Der stille Zeuge",
    ]) if (!html.includes(marker)) errors.push(`single-file-marker-missing:${marker}`);
    if (/<script\s+type=["']module["']/iu.test(html)) errors.push("single-file-module-script-present");
    if (/\bimport\s*\(|import\.meta/u.test(html)) errors.push("single-file-module-runtime-present");
    if (/<(?:script|link)[^>]*(?:src|href)=["'](?!data:)[^"']+["'][^>]*>/iu.test(html)) {
      errors.push("single-file-external-script-or-link-present");
    }
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function scanVisibleSingleFilePromises(root = REPOSITORY_ROOT) {
  const findings = [];
  const promise = /(?:\/download\/|Einzeldatei.{0,80}(?:herunterladen|download)|(?:herunterladen|download).{0,80}Einzeldatei)/giu;
  for (const path of filesBelow(resolve(root, "src")).filter((entry) => /\.(?:js|jsx|ts|tsx|html)$/u.test(entry))) {
    const text = readFileSync(path, "utf8");
    if (promise.test(text)) findings.push(relative(root, path));
    promise.lastIndex = 0;
  }
  /* `public/download` bleibt als lokaler Builder technisch bestehen, ist aber
     in Production redirectet. Geprueft wird deshalb nur die aktive gehostete
     Einstiegseite samt Hauptbundle, nicht diese bewusst inaktive Unterseite. */
  const activeDist = [resolve(root, "dist", "index.html"),
    ...filesBelow(resolve(root, "dist", "assets")).filter((entry) => /\.js$/u.test(entry))];
  for (const path of activeDist.filter(existsSync)) {
    const text = readFileSync(path, "utf8");
    if (/["'`]\/download\//iu.test(text)) findings.push(relative(root, path));
  }
  return Object.freeze(findings);
}

function git(args, root) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
}

export function runIntegrityCheck({ root = REPOSITORY_ROOT, base = "origin/main", log = console.log, error = console.error } = {}) {
  const failures = [];
  const diffCheck = git(["diff", "--check", `${base}...HEAD`], root);
  if (diffCheck.status !== 0 || diffCheck.error || diffCheck.signal) failures.push("git-diff-check-failed");

  const committedDiff = git(["diff", "--unified=0", "--no-ext-diff", "--no-color", `${base}...HEAD`], root);
  if (committedDiff.status !== 0 || committedDiff.error || committedDiff.signal) failures.push("git-committed-diff-unreadable");
  else {
    const secrets = scanAddedCommittedDiff(committedDiff.stdout);
    for (const finding of secrets) failures.push(`secret:${finding.rule}:${finding.path}:${finding.line}`);
  }

  const artifacts = validateBuiltArtifacts(root);
  failures.push(...artifacts.errors.map((entry) => `artifact:${entry}`));
  failures.push(...scanVisibleSingleFilePromises(root).map((path) => `visible-single-file-promise:${path}`));

  if (failures.length) {
    error("[PRIVATE_RELEASE_INTEGRITY] FEHLER");
    for (const failure of failures) error(`- ${failure}`);
  } else log("[PRIVATE_RELEASE_INTEGRITY] OK: Diff, Artefakte, sichtbare Single-File-Wahrheit und Added-Delta-Leakscan bestanden.");
  return Object.freeze({ ok: failures.length === 0, failures: Object.freeze(failures) });
}

function parseArgs(argv) {
  const index = argv.indexOf("--base");
  if (index < 0 || !argv[index + 1] || argv.length !== 2) return null;
  return { base: argv[index + 1] };
}

function istDirekterAufruf() {
  const aufruf = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
  return aufruf === import.meta.url;
}

if (istDirekterAufruf()) {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error("Aufruf: node tools/private-release-integrity.mjs --base <git-ref>");
    process.exitCode = 2;
  } else if (!runIntegrityCheck(args).ok) process.exitCode = 1;
}

#!/usr/bin/env node
/* Erzeugt keine Deployments und liest keine Secrets. Es beschreibt lediglich
   den exakt aus Git reproduzierbaren ai-task-Quellstand für Review/Runbook. */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

import { createRequire } from "node:module";
import { posix } from "node:path";

// Reuse the parser shipped by our declared Vite React plugin; no new package.
const reactRequire = createRequire(import.meta.resolve("@vitejs/plugin-react"));
const { parseSync } = reactRequire("@babel/core");
const ENTRY_DATEI = "supabase/functions/ai-task/index.ts";

export function localImportClosure(leseInhalt, entry = ENTRY_DATEI) {
  const visited = new Set();
  const visit = (datei) => {
    if (visited.has(datei)) return;
    visited.add(datei);
    if (datei.endsWith(".json")) return;
    const ast = parseSync(toBuffer(leseInhalt(datei)).toString("utf8"), {
      filename: datei, configFile: false, babelrc: false, sourceType: "module",
      parserOpts: { plugins: ["typescript", "importAttributes"] },
    });
    const imports = new Set();
    const add = (source) => {
      if (source?.type !== "StringLiteral") {
        throw new Error(`Nicht statisch auflösbarer Import in ${datei}`);
      }
      const specifier = source.value;
      if (/^(?:npm:|jsr:|https?:|node:)/.test(specifier)) return;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        throw new Error(`Nicht relativer lokaler Import in ${datei}: ${specifier}`);
      }
      const dependency = posix.normalize(posix.join(posix.dirname(datei), specifier));
      if (dependency.startsWith("../") || /[?#]/.test(dependency)) {
        throw new Error(`Import außerhalb des Quellvertrags: ${specifier}`);
      }
      imports.add(dependency);
    };
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)
          && node.source) add(node.source);
      if (node.type === "ImportExpression") add(node.source);
      if (node.type === "CallExpression" && node.callee?.type === "Import") add(node.arguments[0]);
      if (node.type === "TSImportType") add(node.argument);
      if (node.type === "TSExternalModuleReference") add(node.expression);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object") walk(value);
      }
    };
    walk(ast);
    for (const dependency of [...imports].sort()) visit(dependency);
  };
  visit(entry);
  return [...visited].sort();
}
const CONFIG_DATEI = "supabase/config.toml";
const DEPLOY_CONTRACT_VERSION = "release-contract-v1";

function toBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
}

function updateFramed(hash, bytes) {
  const payload = toBuffer(bytes);
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(payload.length));
  hash.update(length);
  hash.update(payload);
}

function parseTomlStringOrThrow(value) {
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    return value.slice(1, -1);
  }
  if (value.length >= 2 && value[0] === "'" && value[value.length - 1] === "'") {
    return value.slice(1, -1);
  }
  throw new Error("Config-Formatfehler: project_id erwartet als TOML-String");
}

function stripTomlComments(line) {
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let escape = false;
  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inDoubleQuotes) {
      escape = true;
      continue;
    }
    if (ch === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }
    if (ch === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }
    if (ch === "#" && !inSingleQuotes && !inDoubleQuotes) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseConfigBlob(configBlob) {
  const source = new TextDecoder("utf8", { fatal: true }).decode(configBlob);
  const lines = source.split(/\r?\n/);
  const sectionRegex = /^\s*\[([^\]]+)\]\s*$/;
  const assignmentRegex = /^\s*([A-Za-z0-9_]+)\s*=\s*(.+)\s*$/;

  let projectIdCount = 0;
  let projectId;
  let verifyJwtCount = 0;
  let verifyJwt = null;
  let functionSectionCount = 0;
  let inAiTaskSection = false;
  let currentSection = null;

  for (const line of lines) {
    const raw = stripTomlComments(line).trim();
    if (!raw) continue;

    const sectionMatch = raw.match(sectionRegex);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      inAiTaskSection = currentSection === "functions.ai-task";
      if (inAiTaskSection) {
        functionSectionCount += 1;
        continue;
      }
      continue;
    }

    const assignmentMatch = raw.match(assignmentRegex);
    if (!assignmentMatch) {
      throw new Error(`Config-Formatfehler: unerwartete Zeile "${raw}"`);
    }

    const key = assignmentMatch[1];
    const value = assignmentMatch[2];
    if (currentSection === null && key === "project_id") {
      projectIdCount += 1;
      if (projectIdCount > 1) {
        throw new Error("Config-Fehler: project_id darf nur einmal vorkommen");
      }
      projectId = parseTomlStringOrThrow(value);
      continue;
    }

    if (inAiTaskSection && key === "verify_jwt") {
      verifyJwtCount += 1;
      if (verifyJwtCount > 1) {
        throw new Error("Config-Fehler: verify_jwt in [functions.ai-task] darf nur einmal vorkommen");
      }
      if (value !== "true" && value !== "false") {
        throw new Error("Config-Fehler: verify_jwt muss ein boolescher TOML-Wert sein");
      }
      verifyJwt = value === "true";
    }
  }

  if (projectIdCount !== 1) {
    throw new Error("Config-Fehler: project_id muss genau einmal gesetzt sein");
  }
  if (projectId !== "bscjgwcntapobyxsiyce") {
    throw new Error("Config-Fehler: project_id ist nicht die erwartete Ziel-ID");
  }
  if (functionSectionCount !== 1) {
    throw new Error("Config-Fehler: [functions.ai-task] fehlt oder ist mehrdeutig");
  }
  if (verifyJwtCount !== 1 || verifyJwt !== true) {
    throw new Error("Config-Fehler: verify_jwt in [functions.ai-task] muss true sein");
  }

  return {
    projectId,
    verifyJwt,
  };
}

export function sourceHash(dateien, leseInhalt) {
  const hash = createHash("sha256");
  hash.update("release-source-v1\0", "utf8");
  updateFramed(hash, Buffer.from(String(dateien.length), "ascii"));
  for (const datei of dateien) {
    updateFramed(hash, Buffer.from(datei, "utf8"));
    updateFramed(hash, leseInhalt(datei));
  }
  return hash.digest("hex");
}

export function deployContractHash({
  projectId,
  functionName,
  verifyJwt,
  sourceSha256,
  configSha256,
}) {
  const deployContractBytes = [
    `version=${DEPLOY_CONTRACT_VERSION}\n`,
    `projectId=${projectId}\n`,
    `functionName=${functionName}\n`,
    `verifyJwt=${verifyJwt}\n`,
    `sourceSha256=${sourceSha256}\n`,
    `configSha256=${configSha256}\n`,
  ].join("");
  return createHash("sha256").update(deployContractBytes, "utf8").digest("hex");
}

function runGit(git, args, encoding) {
  const output = git(args, { encoding });
  if (Buffer.isBuffer(output)) return output;
  return Buffer.from(String(output), encoding || "utf8");
}

function runGitText(git, args) {
  return runGit(git, args, "utf8").toString("utf8").trim();
}

export function releaseInfo({
  git = (args, opts) =>
    execFileSync("git", args, {
      ...(opts?.encoding === null ? {} : { encoding: opts?.encoding || "utf8" }),
    }),
} = {}) {
  const commit = runGitText(git, ["rev-parse", "HEAD"]);
  const blobs = new Map();
  const leseBlob = (datei) => {
    if (!blobs.has(datei)) blobs.set(datei, runGit(git, ["show", `${commit}:${datei}`], null));
    return blobs.get(datei);
  };
  const dateien = localImportClosure(leseBlob);
  const status = runGitText(git, ["status", "--short", "--", ...dateien, CONFIG_DATEI]);
  if (status) {
    throw new Error(
      "Function-Quellen sind nicht committed. Erst prüfen und committen, dann deployen.",
    );
  }
  const sourceSha256 = sourceHash(
    dateien,
    leseBlob,
  );
  const configBlob = runGit(git, ["show", `${commit}:${CONFIG_DATEI}`], null);
  const configSha256 = createHash("sha256").update(configBlob).digest("hex");
  const { projectId, verifyJwt } = parseConfigBlob(configBlob);
  const configDatei = CONFIG_DATEI;
  const functionName = "ai-task";
  const deployContractSha256 = deployContractHash({
    projectId,
    functionName,
    verifyJwt,
    sourceSha256,
    configSha256,
  });
  return {
    commit,
    buildVersion: commit,
    sourceSha256,
    configSha256,
    deployContractSha256,
    projectId,
    functionName,
    verifyJwt,
    configDatei,
    dateien,
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

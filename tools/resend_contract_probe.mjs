#!/usr/bin/env node
/*
 * Einmaliges Instrument zum Belegen des Resend-Rohvertrags.
 *
 * Dieser Pfad ist kein Produktadapter und wird von keiner Standardsuite
 * ausgefuehrt. Ohne den exakten Einmalmarker liest er weder den Schluesselbund
 * noch erzeugt er Dateien oder Netzwerkverkehr. Response-Bodies werden nicht
 * interpretiert, sondern bytegetreu ausserhalb des Repositories abgelegt.
 */

import { randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const EXECUTION_MARKER = "--execute-resend-contract-probe-once";
export const MAX_REQUESTS = 3;
export const REQUEST_TIMEOUT_MS = 20_000;

export const RESEND_KEYCHAIN = Object.freeze({
  service: "at.kinodreieck.resend-contract-probe",
  account: "RESEND_API_KEY",
});

export const EXIT = Object.freeze({
  OK: 0,
  NOT_STARTED: 64,
  KEYCHAIN_MISSING: 66,
  NETWORK_FAILED: 69,
  NON_2XX: 70,
  PRIVATE_CAPTURE_FAILED: 73,
  SENSITIVE_ECHO: 77,
});

export const FIXED_PROBE_PAYLOAD = Object.freeze({
  from: "onboarding@resend.dev",
  to: Object.freeze(["delivered@resend.dev"]),
  subject: "Kinodreieck Resend Vertragsprobe",
  text: "Synthetische Vertragsprobe A.",
  html: "<p>Synthetische Vertragsprobe A.</p>",
});

const USER_AGENT = "Kinodreieck-Resend-Contract-Probe/1.0";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

export class ResendProbeFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "ResendProbeFailure";
    this.code = code;
  }
}

function removeOneLineEnding(value) {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

export function readResendApiKey({
  platform = process.platform,
  securityRun = spawnSync,
} = {}) {
  if (platform !== "darwin") {
    throw new ResendProbeFailure("RESEND_KEYCHAIN_UNAVAILABLE");
  }

  const result = securityRun(
    "/usr/bin/security",
    [
      "find-generic-password",
      "-s",
      RESEND_KEYCHAIN.service,
      "-a",
      RESEND_KEYCHAIN.account,
      "-w",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    },
  );

  if (result?.error || result?.signal || result?.status !== 0) {
    throw new ResendProbeFailure("RESEND_KEYCHAIN_UNAVAILABLE");
  }

  const stdout = typeof result.stdout === "string"
    ? result.stdout
    : Buffer.from(result.stdout || "").toString("utf8");
  const apiKey = removeOneLineEnding(stdout);
  if (!apiKey) {
    throw new ResendProbeFailure("RESEND_KEYCHAIN_UNAVAILABLE");
  }
  return apiKey;
}

function isInsideRepository(path) {
  const delta = relative(REPOSITORY_ROOT, path);
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== "..");
}

function createPrivateCaptureDirectory(outputRoot) {
  let root;
  try {
    root = realpathSync(outputRoot);
  } catch {
    throw new ResendProbeFailure("PRIVATE_CAPTURE_FAILED");
  }
  if (isInsideRepository(root)) {
    throw new ResendProbeFailure("PRIVATE_CAPTURE_FAILED");
  }

  try {
    const directory = mkdtempSync(join(root, "kinodreieck-resend-contract-probe-"));
    chmodSync(directory, 0o700);
    return directory;
  } catch {
    throw new ResendProbeFailure("PRIVATE_CAPTURE_FAILED");
  }
}

function contains(buffer, value) {
  return buffer.includes(Buffer.from(value, "utf8"));
}

function assertNoSensitiveEcho({ body, headers, statusText, apiKey, requestKey }) {
  const metadata = Buffer.from(JSON.stringify({ statusText, headers }), "utf8");
  if (
    contains(body, apiKey)
    || contains(body, requestKey)
    || contains(metadata, apiKey)
    || contains(metadata, requestKey)
  ) {
    throw new ResendProbeFailure("SENSITIVE_ECHO");
  }
}

function writePrivateFile(path, contents) {
  try {
    writeFileSync(path, contents, { flag: "wx", mode: 0o600 });
    chmodSync(path, 0o600);
  } catch {
    throw new ResendProbeFailure("PRIVATE_CAPTURE_FAILED");
  }
}

async function captureRawResponse({
  response,
  requestNumber,
  captureDirectory,
  apiKey,
  requestKey,
}) {
  let body;
  let headers;
  try {
    body = Buffer.from(await response.arrayBuffer());
    headers = [...response.headers.entries()];
  } catch {
    throw new ResendProbeFailure("NETWORK_FAILED");
  }

  assertNoSensitiveEcho({
    body,
    headers,
    statusText: response.statusText,
    apiKey,
    requestKey,
  });

  const stem = `response-${String(requestNumber).padStart(2, "0")}`;
  const metadata = Buffer.from(`${JSON.stringify({
    status: response.status,
    statusText: response.statusText,
    headers,
  }, null, 2)}\n`, "utf8");

  writePrivateFile(join(captureDirectory, `${stem}.meta.json`), metadata);
  writePrivateFile(join(captureDirectory, `${stem}.body.raw`), body);
}

function requestBodies() {
  const original = JSON.stringify(FIXED_PROBE_PAYLOAD);
  const changed = JSON.stringify({
    ...FIXED_PROBE_PAYLOAD,
    text: "Synthetische Vertragsprobe B.",
  });
  return Object.freeze([original, original, changed]);
}

export async function runResendContractProbe({
  apiKey,
  fetchImpl = globalThis.fetch,
  uuidFactory = randomUUID,
  outputRoot = tmpdir(),
  signalFactory = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS),
} = {}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new ResendProbeFailure("RESEND_KEYCHAIN_UNAVAILABLE");
  }
  if (typeof fetchImpl !== "function") {
    throw new ResendProbeFailure("NETWORK_FAILED");
  }

  const requestKey = uuidFactory();
  if (typeof requestKey !== "string" || !UUID_PATTERN.test(requestKey)) {
    throw new ResendProbeFailure("REQUEST_KEY_INVALID");
  }

  const bodies = requestBodies();
  if (bodies.length !== MAX_REQUESTS) {
    throw new ResendProbeFailure("REQUEST_PLAN_INVALID");
  }
  const captureDirectory = createPrivateCaptureDirectory(outputRoot);

  for (let index = 0; index < bodies.length; index += 1) {
    let response;
    try {
      response = await fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
          "User-Agent": USER_AGENT,
        },
        body: bodies[index],
        redirect: "error",
        signal: signalFactory(),
      });
    } catch {
      throw new ResendProbeFailure("NETWORK_FAILED");
    }

    await captureRawResponse({
      response,
      requestNumber: index + 1,
      captureDirectory,
      apiKey,
      requestKey,
    });

    if (response.status < 200 || response.status >= 300) {
      return Object.freeze({
        exitCode: EXIT.NON_2XX,
        responseCount: index + 1,
        captureDirectory,
      });
    }
  }

  return Object.freeze({
    exitCode: EXIT.OK,
    responseCount: MAX_REQUESTS,
    captureDirectory,
  });
}

export async function main(argv = process.argv.slice(2), {
  keychainReader = readResendApiKey,
  fetchImpl = globalThis.fetch,
  uuidFactory = randomUUID,
  outputRoot = tmpdir(),
  signalFactory = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  log = (line) => console.log(line),
  logError = (line) => console.error(line),
} = {}) {
  if (argv.length !== 1 || argv[0] !== EXECUTION_MARKER) {
    logError(`RESEND_PROBE_NOT_STARTED: exakter Einmalmarker ${EXECUTION_MARKER} fehlt.`);
    return EXIT.NOT_STARTED;
  }

  let apiKey;
  try {
    apiKey = await keychainReader();
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new ResendProbeFailure("RESEND_KEYCHAIN_UNAVAILABLE");
    }
  } catch {
    logError("RESEND_PROBE_NOT_STARTED: lokaler Schluesselbund-Eintrag fehlt oder ist nicht lesbar.");
    return EXIT.KEYCHAIN_MISSING;
  }

  try {
    const result = await runResendContractProbe({
      apiKey,
      fetchImpl,
      uuidFactory,
      outputRoot,
      signalFactory,
    });
    if (result.exitCode === EXIT.NON_2XX) {
      logError(`RESEND_PROBE_STOPPED_NON_2XX: ${result.responseCount} Rohantwort(en) in ${result.captureDirectory}.`);
    } else {
      log(`RESEND_PROBE_CAPTURED: ${result.responseCount} Rohantwort(en) in ${result.captureDirectory}.`);
    }
    return result.exitCode;
  } catch (error) {
    if (error instanceof ResendProbeFailure && error.code === "SENSITIVE_ECHO") {
      logError("RESEND_PROBE_STOPPED: Providerantwort enthielt sensibles Requestmaterial; nichts davon wurde persistiert.");
      return EXIT.SENSITIVE_ECHO;
    }
    if (error instanceof ResendProbeFailure && error.code === "PRIVATE_CAPTURE_FAILED") {
      logError("RESEND_PROBE_STOPPED: private Rohablage konnte nicht sicher erzeugt werden.");
      return EXIT.PRIVATE_CAPTURE_FAILED;
    }
    logError("RESEND_PROBE_STOPPED: Netzwerk- oder Response-Lesefehler; kein Retry.");
    return EXIT.NETWORK_FAILED;
  }
}

function isDirectExecution() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  process.exitCode = await main();
}

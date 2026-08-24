/* Private Senke fuer echte Providerantworten des einmaligen Owner-Audits.
   Kein Inhalt wird geloggt oder ins Repository geschrieben. */

import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import {
  PROVIDER_DIAGNOSTIC_FIELD,
  PROVIDER_DIAGNOSTIC_HEADER,
  PROVIDER_DIAGNOSTIC_HEADER_VALUE,
} from "../supabase/functions/_shared/providerDiagnostic.js";

export const OWNER_CORE_SIX_GUARD_ENV = "KD_AI_OWNER_CORE_SIX_GUARD";
export const OWNER_CORE_SIX_GUARD_VALUE = "keychain-owner-core-six-v1";
export const PROVIDER_RAW_CAPTURE_GUARD_ENV = "KD_PROVIDER_RAW_CAPTURE_GUARD";
export const PROVIDER_RAW_CAPTURE_GUARD_VALUE = "keychain-owner-live-v1";
export const PROVIDER_RAW_CAPTURE_DIR_ENV = "KD_PROVIDER_RAW_CAPTURE_DIR";

const FILE_NAME_FORM = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/;
const MAX_RAW_BYTES = 8 * 1024 * 1024;
const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_DIAGNOSTIC_FORM = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;

function kurzeSichereDiagnose(value, fallback = null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return SAFE_DIAGNOSTIC_FORM.test(normalized) ? normalized : fallback;
}

const PROVIDER_CAPTURE_PATH_BY_FILE = Object.freeze({
  "01-intelligent-search.json": Object.freeze({ task: "intelligent-search", vorgangId: true }),
  "02-profile-extract.json": Object.freeze({ task: "profile-extract", vorgangId: true }),
  "03-film-forecast.json": Object.freeze({ task: "film-forecast", vorgangId: true }),
  "04-filmwissen-synthese.json": Object.freeze({ task: "filmwissen-synthese", vorgangId: true }),
  "05-blog-profile-extract.json": Object.freeze({ task: "blog-profile-extract", vorgangId: true }),
  "06-media-batch-extract.json": Object.freeze({ task: "media-batch-extract", vorgangId: true }),
  "07-entdecken-weekly-websearch.json": Object.freeze({ task: "entdecken-daily-task", vorgangId: false }),
  "08-radar-websearch.json": Object.freeze({ task: "radar-websearch-task", vorgangId: false }),
});

function pendingProviderCapture(
  body,
  fileName,
  responseStatus,
  expectedTask,
  expectedVorgangId,
) {
  const path = PROVIDER_CAPTURE_PATH_BY_FILE[fileName];
  if (!path
      || expectedTask !== path.task
      || (path.vorgangId && !UUID_FORM.test(expectedVorgangId || ""))) {
    return null;
  }
  const responseBody = body && typeof body === "object" && !Array.isArray(body)
    ? body
    : {};
  const data = responseBody.data
      && typeof responseBody.data === "object"
      && !Array.isArray(responseBody.data)
    ? body.data
    : {};
  return Object.freeze({
    captureState: "pending-no-raw",
    proofState: "pending",
    task: path.task,
    filePath: null,
    bytes: 0,
    providerRequests: null,
    attemptedProviderRequests: 1,
    potentialProviderRequests: 1,
    provenProviderRequests: 0,
    httpStatus: Number.isInteger(responseStatus) ? responseStatus : null,
    fachstatus: kurzeSichereDiagnose(
      data.status ?? responseBody.status ?? responseBody.code,
      "unbekannt",
    ),
    fachgrund: kurzeSichereDiagnose(data.grund ?? responseBody.grund),
  });
}

function expectedCapturePath(fileName, expectedTask, expectedVorgangId) {
  const path = PROVIDER_CAPTURE_PATH_BY_FILE[fileName];
  if (!path || (expectedTask !== null && expectedTask !== path.task)
      || (expectedTask !== null && path.vorgangId
        && !UUID_FORM.test(expectedVorgangId || ""))) {
    throw new Error("Provider-Capture ist nicht an den erwarteten Live-Pfad gebunden.");
  }
  return path;
}

function modeBits(stats) {
  return stats.mode & 0o777;
}

function assertOwned(stats, label) {
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new Error(`${label} gehoert nicht dem laufenden Nutzer.`);
  }
}

export function createPrivateProviderRawDirectory({ baseDir = tmpdir() } = {}) {
  const directory = mkdtempSync(join(resolve(baseDir), "kinodreieck-provider-raw-"));
  chmodSync(directory, 0o700);
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink() || modeBits(stats) !== 0o700) {
    throw new Error("Privates Provider-Verzeichnis konnte nicht sicher angelegt werden.");
  }
  assertOwned(stats, "Provider-Verzeichnis");
  return realpathSync(directory);
}

export function providerRawCaptureEnabled(env = process.env) {
  return env?.[PROVIDER_RAW_CAPTURE_GUARD_ENV] === PROVIDER_RAW_CAPTURE_GUARD_VALUE;
}

export function providerDiagnosticHeaders(env = process.env) {
  if (!providerRawCaptureEnabled(env)) return Object.freeze({});
  const directory = String(env?.[PROVIDER_RAW_CAPTURE_DIR_ENV] || "");
  if (!directory) throw new Error("Privates Provider-Verzeichnis fehlt.");
  return Object.freeze({
    [PROVIDER_DIAGNOSTIC_HEADER]: PROVIDER_DIAGNOSTIC_HEADER_VALUE,
  });
}

function assertPrivateDirectory(directory, repoRoot) {
  if (!directory || resolve(directory) !== directory) {
    throw new Error("Provider-Verzeichnis muss absolut sein.");
  }
  const linkStats = lstatSync(directory);
  if (!linkStats.isDirectory() || linkStats.isSymbolicLink()) {
    throw new Error("Provider-Verzeichnis ist kein echtes Verzeichnis.");
  }
  const directoryReal = realpathSync(directory);
  const repoReal = realpathSync(repoRoot);
  if (directoryReal === repoReal || directoryReal.startsWith(repoReal + sep)) {
    throw new Error("Provider-Verzeichnis darf nicht im Repository liegen.");
  }
  const stats = statSync(directoryReal);
  if (modeBits(stats) !== 0o700) {
    throw new Error("Provider-Verzeichnis hat nicht Modus 0700.");
  }
  assertOwned(stats, "Provider-Verzeichnis");
  return directoryReal;
}

export function captureProviderRawResponse(
  body,
  fileName,
  {
    env = process.env,
    repoRoot,
    responseStatus = null,
    expectedTask = null,
    expectedVorgangId = null,
  } = {},
) {
  if (!providerRawCaptureEnabled(env)) return null;
  if (!repoRoot) throw new Error("Repositorywurzel fuer Provider-Capture fehlt.");
  if (!FILE_NAME_FORM.test(fileName) || basename(fileName) !== fileName) {
    throw new Error("Provider-Dateiname ist nicht fest begrenzt.");
  }
  const path = expectedCapturePath(fileName, expectedTask, expectedVorgangId);
  const responseBody = body && typeof body === "object" && !Array.isArray(body)
    ? body
    : null;
  const diagnostic = responseBody?.[PROVIDER_DIAGNOSTIC_FIELD];
  const diagnosticGueltig = !!diagnostic
    && typeof diagnostic === "object"
    && !Array.isArray(diagnostic)
    && Object.keys(diagnostic).sort().join(",") === "rawResponse"
    && typeof diagnostic.rawResponse === "string"
    && diagnostic.rawResponse.length > 0;
  if (responseBody) delete responseBody[PROVIDER_DIAGNOSTIC_FIELD];
  if (!diagnosticGueltig) {
    const pending = pendingProviderCapture(
      body,
      fileName,
      responseStatus,
      expectedTask,
      expectedVorgangId,
    );
    if (pending) return pending;
  }
  if (!diagnosticGueltig) {
    throw new Error("Function-Antwort enthaelt keine gueltige private Providerdiagnose.");
  }
  const bytes = Buffer.byteLength(diagnostic.rawResponse, "utf8");
  if (bytes > MAX_RAW_BYTES) {
    throw new Error("Private Providerdiagnose ueberschreitet die lokale Groessengrenze.");
  }

  const directory = assertPrivateDirectory(
    String(env?.[PROVIDER_RAW_CAPTURE_DIR_ENV] || ""),
    repoRoot,
  );
  const filePath = join(directory, fileName);
  writeFileSync(filePath, diagnostic.rawResponse, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
  const stats = lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink() || modeBits(stats) !== 0o600) {
    throw new Error("Private Providerdatei wurde nicht mit Modus 0600 geschrieben.");
  }
  assertOwned(stats, "Providerdatei");
  return Object.freeze({
    captureState: "raw",
    proofState: "proven",
    task: path.task,
    filePath,
    bytes,
    providerRequests: 1,
    attemptedProviderRequests: 1,
    potentialProviderRequests: 1,
    provenProviderRequests: 1,
    httpStatus: Number.isInteger(responseStatus) ? responseStatus : null,
    fachstatus: null,
    fachgrund: null,
  });
}

export function finalizeProviderCapture(capture, measuredCostUsdCent) {
  if (capture?.captureState !== "pending-no-raw") return capture;
  if (!Number.isFinite(measuredCostUsdCent) || measuredCostUsdCent !== 0) {
    throw new Error("Fehlender Providerrohpayload war kostenfuehrend oder nicht messbar.");
  }
  return Object.freeze({
    ...capture,
    proofState: "unproven",
    measuredCostUsdCent: 0,
  });
}

export function isZeroCostUnprovenCapture(capture) {
  return capture?.proofState === "unproven"
    && capture.captureState === "pending-no-raw"
    && capture.measuredCostUsdCent === 0
    && capture.providerRequests === null
    && capture.attemptedProviderRequests === 1
    && capture.potentialProviderRequests === 1
    && capture.provenProviderRequests === 0;
}

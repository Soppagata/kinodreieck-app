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
  { env = process.env, repoRoot } = {},
) {
  if (!providerRawCaptureEnabled(env)) return null;
  if (!repoRoot) throw new Error("Repositorywurzel fuer Provider-Capture fehlt.");
  if (!FILE_NAME_FORM.test(fileName) || basename(fileName) !== fileName) {
    throw new Error("Provider-Dateiname ist nicht fest begrenzt.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Function-Antwort enthaelt keine private Providerdiagnose.");
  }

  const diagnostic = body[PROVIDER_DIAGNOSTIC_FIELD];
  delete body[PROVIDER_DIAGNOSTIC_FIELD];
  if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic)
      || Object.keys(diagnostic).sort().join(",") !== "rawResponse"
      || typeof diagnostic.rawResponse !== "string"
      || diagnostic.rawResponse.length === 0) {
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
  return Object.freeze({ filePath, bytes });
}

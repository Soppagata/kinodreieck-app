/* Repo-gebundener, providerfreier Owner-Readback fuer kontrollierte
   Function-Releases. Er verwendet exakt denselben oeffentlichen
   Konfigurations-, Keychain- und Loginpfad wie `npm run test:ai:live`.

   Wichtig: Dieses Modul pusht/deployed nichts und startet keinen KI-Anbieter.
   Ein autorisierter Einmal-Runner darf es nach seinem Deployment nur fuer den
   normalen ai-task-Health-/Buildmarker-Readback aufrufen. */

import { createHash } from "node:crypto";
import {
  KEYCHAIN_ACCOUNTS,
  KeychainFehler,
  baueOwnerReadbackUmgebung,
  liesKeychainEintrag,
  liesLokaleKonfig,
} from "./keychain_runner.mjs";
import {
  holeHealthAntwort,
  liesBudgetVerbindung,
  meldeTestkontoAn,
} from "./ai_budget_guard.mjs";

const COMMIT_FORM = /^[0-9a-f]{40}$/;
const PROJECT_REF_FORM = /^[a-z0-9]{10,40}$/;
const FUNCTION_SOURCE_PATH_FORM = /^[A-Za-z0-9._/-]{1,240}$/;
const FUNCTION_READBACK_TARGETS = Object.freeze([
  Object.freeze({ slug: "ai-task", verifyJwt: true }),
  Object.freeze({ slug: "radar-websearch-task", verifyJwt: true }),
  Object.freeze({ slug: "entdecken-daily-task", verifyJwt: false }),
]);

export class LiveFunctionReadbackFehler extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LiveFunctionReadbackFehler";
    this.code = code;
  }
}

function stop(code, message) {
  throw new LiveFunctionReadbackFehler(code, message);
}

function pruefeProjektbindung(lokaleKonfig, expectedProjectRef) {
  if (!PROJECT_REF_FORM.test(expectedProjectRef)) {
    stop("LIVE_CONFIG_INVALID", "Das erwartete Live-Projekt ist formfremd.");
  }
  let url;
  try {
    url = new URL(String(lokaleKonfig?.KD_SB_URL || "").trim());
  } catch {
    stop("LIVE_CONFIG_INVALID", "Die oeffentliche Live-URL ist ungueltig.");
  }
  if (url.protocol !== "https:"
      || url.hostname !== `${expectedProjectRef}.supabase.co`
      || url.pathname !== "/" || url.search || url.hash) {
    stop("LIVE_CONFIG_INVALID", "Die oeffentliche Live-URL ist nicht projektgebunden.");
  }
}

function framed(hash, value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : (value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(String(value), "utf8"));
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(length);
  hash.update(bytes);
}

function pruefeSourceDateien(dateien) {
  if (!Array.isArray(dateien) || dateien.length < 1) {
    stop("FUNCTION_SOURCE_UNCONFIRMED", "Heruntergeladene Function-Quellen sind nicht bestaetigt.");
  }
  const normalisiert = dateien.map((entry) => {
    const path = typeof entry?.path === "string" ? entry.path : "";
    const pathTeile = path.split("/");
    const bytesOk = typeof entry?.bytes === "string"
      || Buffer.isBuffer(entry?.bytes) || entry?.bytes instanceof Uint8Array;
    if (!FUNCTION_SOURCE_PATH_FORM.test(path) || path.startsWith("/")
        || pathTeile.some((teil) => !teil || teil === "." || teil === "..")
        || !bytesOk) {
      stop("FUNCTION_SOURCE_UNCONFIRMED", "Function-Quellabschluss ist formfremd.");
    }
    return { path, bytes: entry.bytes };
  }).sort((a, b) => a.path.localeCompare(b.path, "en"));
  if (new Set(normalisiert.map(({ path }) => path)).size !== normalisiert.length) {
    stop("FUNCTION_SOURCE_UNCONFIRMED", "Function-Quellabschluss ist mehrdeutig.");
  }
  const hash = createHash("sha256");
  hash.update("function-source-byte-closure-v1\0", "utf8");
  framed(hash, String(normalisiert.length));
  for (const entry of normalisiert) {
    framed(hash, entry.path);
    framed(hash, entry.bytes);
  }
  return Object.freeze({
    sha256: hash.digest("hex"),
    fileCount: normalisiert.length,
    paths: Object.freeze(normalisiert.map(({ path }) => path)),
  });
}

/* Reiner Postflight-Vertrag. Eine Management-Version ist nur Metadatum: Sie
   darf steigen, beweist aber weder Drift noch Bytegleichheit. Akzeptiert wird
   der Release erst mit ACTIVE/JWT, erneut gelesenem ai-task-Buildmarker und
   bytegleichem Download aller drei Function-Quellabschluesse. */
export function bestaetigeFunctionDeploymentReadback({
  expectedBuildVersion,
  healthBuildVersion,
  managementFunctions,
  sourceReadbacks,
} = {}) {
  if (!COMMIT_FORM.test(String(expectedBuildVersion || ""))
      || healthBuildVersion !== expectedBuildVersion) {
    stop("BUILD_MARKER_READBACK_FAILED", "Der Function-Buildmarker ist nicht erneut bestaetigt.");
  }
  if (!Array.isArray(managementFunctions) || !Array.isArray(sourceReadbacks)) {
    stop("FUNCTION_READBACK_INVALID", "Function-Postflight ist formfremd.");
  }

  const proof = [];
  for (const target of FUNCTION_READBACK_TARGETS) {
    const management = managementFunctions.filter((row) => row?.slug === target.slug);
    if (management.length !== 1) {
      stop("FUNCTION_MANAGEMENT_UNCONFIRMED", "Function-Managementstatus ist nicht eindeutig.");
    }
    const row = management[0];
    const verifyJwt = Object.hasOwn(row, "verify_jwt") ? row.verify_jwt : row.verifyJwt;
    if (row.status !== "ACTIVE" || verifyJwt !== target.verifyJwt
        || !Number.isSafeInteger(row.version) || row.version < 1) {
      stop("FUNCTION_MANAGEMENT_UNCONFIRMED", "Function ist nicht ACTIVE/JWT-konform bestaetigt.");
    }

    const readbacks = sourceReadbacks.filter((entry) => entry?.slug === target.slug);
    if (readbacks.length !== 1 || readbacks[0].status !== "downloaded") {
      stop("FUNCTION_SOURCE_UNCONFIRMED", "Function-Source-Download ist nicht bestaetigt.");
    }
    const lokal = pruefeSourceDateien(readbacks[0].localFiles);
    const remote = pruefeSourceDateien(readbacks[0].downloadedFiles);
    if (lokal.sha256 !== remote.sha256
        || lokal.fileCount !== remote.fileCount
        || JSON.stringify(lokal.paths) !== JSON.stringify(remote.paths)) {
      stop("FUNCTION_SOURCE_DRIFT", "Heruntergeladene Function-Quellen sind nicht bytegleich.");
    }
    proof.push(Object.freeze({
      slug: target.slug,
      status: row.status,
      verifyJwt,
      version: row.version,
      sourceSha256: lokal.sha256,
      sourceFileCount: lokal.fileCount,
    }));
  }

  return Object.freeze({
    ok: true,
    buildVersion: expectedBuildVersion,
    functions: Object.freeze(proof),
  });
}

export async function liesOwnerFunctionBuildMarker({
  expectedBuildVersion,
  expectedProjectRef,
  lokaleKonfig = null,
  keychainLeser = liesKeychainEintrag,
  fetchImpl = fetch,
  vorgangId = crypto.randomUUID(),
} = {}) {
  if (!COMMIT_FORM.test(String(expectedBuildVersion || ""))) {
    stop("BUILD_MARKER_EXPECTATION_INVALID", "Der erwartete Buildmarker ist formfremd.");
  }

  let oeffentlicheKonfig;
  try {
    oeffentlicheKonfig = lokaleKonfig ?? liesLokaleKonfig();
  } catch {
    stop("LIVE_CONFIG_INVALID", "Die oeffentliche lokale Live-Konfiguration ist nicht lesbar.");
  }

  /* Zielbindung kommt absichtlich vor dem ersten Keychain-Read. */
  pruefeProjektbindung(oeffentlicheKonfig, expectedProjectRef);

  let env;
  try {
    env = baueOwnerReadbackUmgebung({
      ambientEnv: {},
      lokaleKonfig: oeffentlicheKonfig,
      keychainLeser,
    });
  } catch (error) {
    if (error instanceof KeychainFehler) {
      stop("OWNER_KEYCHAIN_MISSING", `Der normale ${KEYCHAIN_ACCOUNTS.owner}-Pfad ist nicht lesbar.`);
    }
    stop("LIVE_CONFIG_INVALID", "Die normale oeffentliche Live-Konfiguration ist ungueltig.");
  }

  let verbindung;
  try {
    verbindung = liesBudgetVerbindung(env);
  } catch {
    stop("LIVE_CONFIG_INVALID", "Die normale Owner-Live-Verbindung ist ungueltig.");
  }

  let token;
  try {
    token = await meldeTestkontoAn(verbindung, fetchImpl);
  } catch {
    stop("OWNER_AUTH_READBACK_FAILED", "Die normale Owner-Sitzung war nicht lesbar.");
  }

  let health;
  try {
    health = await holeHealthAntwort({ verbindung, token, fetchImpl, vorgangId });
  } catch {
    stop("BUILD_MARKER_READBACK_FAILED", "Der normale Function-Health-Readback war nicht lesbar.");
  }
  if (!health.ok || health.daten?.ok !== true
      || health.daten?.buildVersion !== expectedBuildVersion) {
    stop("BUILD_MARKER_READBACK_FAILED", "Der normale Function-Health-Readback meldet nicht den erwarteten Buildmarker.");
  }
  return health.daten.buildVersion;
}

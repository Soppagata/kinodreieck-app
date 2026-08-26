#!/usr/bin/env node
/* Genau eine minimale Anthropic-Messages-Trennprobe aus derselben Staging-
   Runtime und mit demselben Secret wie Entdecken. Kein Websearch, kein Feed-,
   Lease- oder Empfehlungswrite, kein Retry. Providertext bleibt nur in einer
   kurzlebigen privaten Datei und wird vor Prozessende sicher entfernt. */

import { lstatSync, readFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  BUDGET_FETCH_TIMEOUT_MS,
  BUDGET_UNBEKANNT_EXIT,
  ENTDECKEN_LAUF_LIMIT_USD_CENT,
  LiveLaufWache,
  LiveSicherheitsStopp,
  fetchMitZeitgrenze,
  holeBudgetStand,
  liesBudgetVerbindung,
  liesJsonOderNull,
  meldeTestkontoAn,
} from "./ai_budget_guard.mjs";
import {
  ENTDECKEN_PROVIDER_PROBE_ONCE_ENV,
} from "./keychain_runner.mjs";
import { pruefeEntdeckenOwnerZugang } from "./entdecken_daily_live.mjs";
import {
  captureProviderRawResponse,
  createPrivateProviderRawDirectory,
  finalizeProviderCapture,
  finalizeProviderFreeCapture,
  isProviderFreeCapture,
  isZeroCostUnprovenCapture,
  PROVIDER_RAW_CAPTURE_DIR_ENV,
  PROVIDER_RAW_CAPTURE_GUARD_ENV,
  PROVIDER_RAW_CAPTURE_GUARD_VALUE,
  providerDiagnosticHeaders,
} from "./provider_raw_capture.mjs";
import {
  ENTDECKEN_PROVIDER_PROBE_HEADER,
  ENTDECKEN_PROVIDER_PROBE_HEADER_VALUE,
  validateEntdeckenProviderProbePublicResult,
  validateEntdeckenProviderProbeRawEvidence,
} from "../supabase/functions/entdecken-daily-task/providerProbe.js";

const FUNCTION_NAME = "entdecken-daily-task";
const GUARD_VALUE = "keychain-budget-guard-v1";
const REFRESH_HEADER = "X-KD-Entdecken-Refresh";
const OWNER_REFRESH_VALUE = "owner-v1";
const CAPTURE_FILE = "09-entdecken-provider-probe.json";
export const ENTDECKEN_PROVIDER_PROBE_PRODUCT_EXIT = 1;

const PRODUCT_STOP_CODES = new Set([
  "PROVIDER_COST_ACCOUNTING_MISMATCH",
  "PROVIDER_ERROR_COST_ACTUAL",
  "PROVIDER_ERROR_COST_RESERVED",
  "PROVIDER_PROBE_NOT_STARTED",
  "PROVIDER_PROBE_RESULT_INVALID",
  "PROVIDER_PROOF_UNSAFE",
  "RAW_CAPTURE_MISSING",
  "RAW_CAPTURE_CLEANUP_FAILED",
]);

export class EntdeckenProviderProbeProductStopp extends Error {
  constructor(code, message, safe = null) {
    super(message);
    this.name = "EntdeckenProviderProbeProductStopp";
    this.code = PRODUCT_STOP_CODES.has(code) ? code : "PROVIDER_PROBE_RESULT_INVALID";
    this.safe = safe;
    this.exitCode = ENTDECKEN_PROVIDER_PROBE_PRODUCT_EXIT;
  }
}

export function createEntdeckenProviderProbeRawLifecycle({
  exitImpl = (code) => process.exit(code),
  processImpl = process,
  removeImpl = (directory) => rmSync(directory, { recursive: true, force: true }),
  errorOutput = console.error,
} = {}) {
  let directory = null;
  let closed = false;
  const cleanup = () => {
    if (!directory) return;
    const target = directory;
    removeImpl(target);
    directory = null;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    processImpl.off("SIGINT", stopForSignal);
    processImpl.off("SIGTERM", stopForSignal);
  };
  const stopForSignal = () => {
    try { cleanup(); }
    catch {
      errorOutput("RAW_CAPTURE_CLEANUP_FAILED: Privater Providerbeleg konnte bei Signal nicht sicher entfernt werden.");
    }
    close();
    exitImpl(BUDGET_UNBEKANNT_EXIT);
  };
  processImpl.once("SIGINT", stopForSignal);
  processImpl.once("SIGTERM", stopForSignal);
  return Object.freeze({
    setDirectory(value) {
      if (closed || directory !== null || typeof value !== "string" || !value) {
        throw new LiveSicherheitsStopp(
          "unbekannt", "Privater Providerbeleg besitzt keinen sicheren Lebenszyklus.",
        );
      }
      directory = value;
    },
    cleanup,
    close,
  });
}

function safeFunctionResult(response, body) {
  if (!response?.ok || response.status !== 200 || !body
      || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).sort().join(",") !== "ok,probe,status"
      || body.status !== "provider_probe"
      || typeof body.ok !== "boolean") {
    return null;
  }
  const probe = validateEntdeckenProviderProbePublicResult(body.probe);
  if (!probe || body.ok !== (probe.cause === "authenticated")) return null;
  return probe;
}

function isSafePreProviderRejection(response, body) {
  return response?.status === 403
    && response.ok === false
    && body
    && typeof body === "object"
    && !Array.isArray(body)
    && Object.keys(body).sort().join(",") === "feed,ok,status"
    && body.ok === false
    && body.status === "disabled"
    && body.feed === null;
}

function safeMeasuredFailure({
  code,
  cause,
  costStatus,
  costUsdCent,
  functionHttpStatus,
  providerHttpStatus = null,
  providerReached,
  providerRequests,
}) {
  return Object.freeze({
    cause,
    code,
    costStatus,
    costUsdCent,
    functionHttpStatus,
    productWrites: 0,
    providerHttpStatus,
    providerReached,
    providerRequests,
  });
}

function outputMeasuredFailure(safe, ausgabe) {
  ausgabe(
    "ENTDECKEN-PROVIDER-PROBE: "
      + `functionHttpStatus=${safe.functionHttpStatus ?? "none"}`
      + ` · providerHttpStatus=${safe.providerHttpStatus ?? "none"}`
      + ` · cause=${safe.cause}`
      + ` · costStatus=${safe.costStatus}`
      + ` · costUsdCent=${safe.costUsdCent.toFixed(4)}`
      + ` · providerReached=${safe.providerReached}`
      + ` · providerRequests=${safe.providerRequests ?? "unproven"}`
      + " · productWrites=0",
  );
}

function productStop(code, message, safe = null) {
  throw new EntdeckenProviderProbeProductStopp(code, message, safe);
}

export async function runEntdeckenProviderProbeOnce({
  env = process.env,
  fetchImpl = fetch,
  ausgabe = console.log,
} = {}) {
  if (env[ENTDECKEN_PROVIDER_PROBE_ONCE_ENV] !== GUARD_VALUE) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "Entdecken-Providerprobe darf nur ueber den exakten npm-Budgetweg starten.",
    );
  }
  const verbindung = liesBudgetVerbindung(env);
  const token = await meldeTestkontoAn(verbindung, fetchImpl);
  await pruefeEntdeckenOwnerZugang({ verbindung, token, fetchImpl });
  const laufWache = new LiveLaufWache({
    maxAnbieterRequests: 1,
    laufLimitUsdCent: ENTDECKEN_LAUF_LIMIT_USD_CENT,
    standLeser: () => holeBudgetStand({ verbindung, token, fetchImpl }),
  });
  const initialStand = await laufWache.initialisiere();

  let captureDirectory = null;
  const rawLifecycle = createEntdeckenProviderProbeRawLifecycle();
  let response = null;
  let body = null;
  let requestError = null;
  let capture = null;
  let captureError = null;
  try {
    const markierung = await laufWache.vorAnbieterRequest("Entdecken-Providerprobe einmalig");
    captureDirectory = createPrivateProviderRawDirectory();
    rawLifecycle.setDirectory(captureDirectory);
    const captureEnv = {
      ...env,
      [PROVIDER_RAW_CAPTURE_DIR_ENV]: captureDirectory,
      [PROVIDER_RAW_CAPTURE_GUARD_ENV]: PROVIDER_RAW_CAPTURE_GUARD_VALUE,
    };
    try {
      response = await fetchMitZeitgrenze(
        `${verbindung.urlBasis}/functions/v1/${FUNCTION_NAME}`,
        {
          method: "POST",
          redirect: "error",
          headers: {
            Origin: verbindung.origin,
            apikey: verbindung.anon,
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            [REFRESH_HEADER]: OWNER_REFRESH_VALUE,
            [ENTDECKEN_PROVIDER_PROBE_HEADER]: ENTDECKEN_PROVIDER_PROBE_HEADER_VALUE,
            ...providerDiagnosticHeaders(captureEnv),
          },
        },
        { fetchImpl, timeoutMs: initialStand.anbieterRequestTimeoutMs },
      );
      body = await liesJsonOderNull(response);
      capture = captureProviderRawResponse(body, CAPTURE_FILE, {
        env: captureEnv,
        repoRoot: new URL("..", import.meta.url).pathname.replace(/\/$/, ""),
        responseStatus: response.status,
        expectedTask: "entdecken-provider-probe",
      });
    } catch (error) {
      requestError = error;
    }

    const costs = await laufWache.nachAnbieterRequest(markierung, null);
    if (requestError) {
      throw requestError instanceof LiveSicherheitsStopp
        ? requestError
        : new LiveSicherheitsStopp(
          "unbekannt",
          "Entdecken-Providerprobe wurde ohne geschlossenen Vor-Provider-Beleg unterbrochen.",
        );
    }
    const probe = safeFunctionResult(response, body);
    if (capture?.captureState === "pending-no-raw") {
      if (isSafePreProviderRejection(response, body)
          && costs.requestKostenUsdCent === 0) {
        const providerFree = finalizeProviderFreeCapture(capture, 0);
        if (!isProviderFreeCapture(providerFree, "provider-probe-not-started")) {
          productStop(
            "PROVIDER_PROBE_RESULT_INVALID",
            "Providerfreier Vor-Provider-Beleg ist intern inkonsistent.",
          );
        }
        const safe = safeMeasuredFailure({
          code: "PROVIDER_PROBE_NOT_STARTED",
          cause: "staging_prerequisite_rejected",
          costStatus: "zero",
          costUsdCent: 0,
          functionHttpStatus: response.status,
          providerReached: false,
          providerRequests: 0,
        });
        outputMeasuredFailure(safe, ausgabe);
        productStop(
          safe.code,
          "Die Staging-Voraussetzung hat die Probe vor dem Provider gestoppt.",
          safe,
        );
      }
      let finalized = null;
      try { finalized = finalizeProviderCapture(capture, costs.requestKostenUsdCent); }
      catch { /* positive Kosten bleiben unten terminal und werden nicht als Rawbeleg erfunden */ }
      const exactZeroUnproven = isZeroCostUnprovenCapture(finalized);
      const safe = safeMeasuredFailure({
        code: "RAW_CAPTURE_MISSING",
        cause: "provider_provenance_unproven",
        costStatus: exactZeroUnproven ? "zero" : "accounted",
        costUsdCent: costs.requestKostenUsdCent,
        functionHttpStatus: response?.status ?? null,
        providerReached: "unproven",
        providerRequests: null,
      });
      outputMeasuredFailure(safe, ausgabe);
      productStop(
        safe.code,
        "Entdecken-Providerprobe besitzt nach lesbarer Kostenmessung keinen sicheren privaten Rohbeleg.",
        safe,
      );
    }
    if (!probe || capture?.captureState !== "raw" || typeof capture.filePath !== "string") {
      const safe = safeMeasuredFailure({
        code: "PROVIDER_PROBE_RESULT_INVALID",
        cause: "provider_result_contract_invalid",
        costStatus: costs.requestKostenUsdCent === 0 ? "zero" : "accounted",
        costUsdCent: costs.requestKostenUsdCent,
        functionHttpStatus: response?.status ?? null,
        providerReached: capture?.captureState === "raw",
        providerRequests: capture?.captureState === "raw" ? 1 : null,
      });
      outputMeasuredFailure(safe, ausgabe);
      productStop(
        safe.code,
        "Entdecken-Providerprobe lieferte ein ungueltiges sicheres Ergebnis.",
        safe,
      );
    }
    const info = lstatSync(capture.filePath);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
      const safe = safeMeasuredFailure({
        code: "PROVIDER_PROOF_UNSAFE",
        cause: "provider_raw_file_protection_invalid",
        costStatus: probe.costStatus,
        costUsdCent: costs.requestKostenUsdCent,
        functionHttpStatus: response.status,
        providerHttpStatus: probe.providerHttpStatus,
        providerReached: true,
        providerRequests: 1,
      });
      outputMeasuredFailure(safe, ausgabe);
      productStop(
        safe.code,
        "Privater Providerbeleg besitzt nicht den erwarteten Dateischutz.",
        safe,
      );
    }
    const rawResponse = readFileSync(capture.filePath, "utf8");
    if (!validateEntdeckenProviderProbeRawEvidence(rawResponse, probe)) {
      const safe = safeMeasuredFailure({
        code: "PROVIDER_PROBE_RESULT_INVALID",
        cause: "provider_raw_evidence_mismatch",
        costStatus: probe.costStatus,
        costUsdCent: costs.requestKostenUsdCent,
        functionHttpStatus: response.status,
        providerHttpStatus: probe.providerHttpStatus,
        providerReached: true,
        providerRequests: 1,
      });
      outputMeasuredFailure(safe, ausgabe);
      productStop(
        safe.code,
        "Providerrohbeleg und sichere Diagnose stimmen nicht ueberein.",
        safe,
      );
    }
    if (Math.abs(costs.requestKostenUsdCent - probe.costUsdCent) > 0.00005) {
      const safe = safeMeasuredFailure({
        code: "PROVIDER_COST_ACCOUNTING_MISMATCH",
        cause: "provider_cost_accounting_mismatch",
        costStatus: "accounted",
        costUsdCent: costs.requestKostenUsdCent,
        functionHttpStatus: response.status,
        providerHttpStatus: probe.providerHttpStatus,
        providerReached: true,
        providerRequests: 1,
      });
      outputMeasuredFailure(safe, ausgabe);
      productStop(
        safe.code,
        "Serverseitiges Laufdelta und Probe-Kostenstatus stimmen nicht ueberein.",
        safe,
      );
    }

    ausgabe(
      "ENTDECKEN-PROVIDER-PROBE: "
        + `functionHttpStatus=${response.status}`
        + ` · providerHttpStatus=${probe.providerHttpStatus ?? "none"}`
        + ` · providerErrorType=${probe.providerErrorType ?? "none"}`
        + ` · cause=${probe.cause}`
        + ` · usageKnown=${probe.usageKnown}`
        + ` · costStatus=${probe.costStatus}`
        + ` · costUsdCent=${probe.costUsdCent.toFixed(4)}`
        + ` · organizationHeaderPresent=${probe.organizationHeaderPresent}`
        + ` · workspaceHeaderPresent=${probe.workspaceHeaderPresent}`
        + " · providerReached=true · providerRequests=1 · productWrites=0",
    );
    if (probe.cause !== "authenticated" || probe.costKnown !== true) {
      const code = probe.costStatus === "reserved"
        ? "PROVIDER_ERROR_COST_RESERVED" : "PROVIDER_ERROR_COST_ACTUAL";
      productStop(
        code,
        "Die minimale Providerprobe hat Authentifizierung nicht bestaetigt; die Kosten sind serverseitig verbucht.",
        safeMeasuredFailure({
          code,
          cause: probe.cause,
          costStatus: probe.costStatus,
          costUsdCent: probe.costUsdCent,
          functionHttpStatus: response.status,
          providerHttpStatus: probe.providerHttpStatus,
          providerReached: true,
          providerRequests: 1,
        }),
      );
    }
    return Object.freeze({ ...probe, laufKostenUsdCent: costs.laufKostenUsdCent });
  } finally {
    try { rawLifecycle.cleanup(); }
    catch { captureError = true; }
    rawLifecycle.close();
    if (captureError) {
      productStop(
        "RAW_CAPTURE_CLEANUP_FAILED",
        "Privater Providerbeleg konnte nicht sicher entfernt werden.",
      );
    }
  }
}

export async function main() {
  try {
    await runEntdeckenProviderProbeOnce();
    console.log("PROVIDER-PROBE-STOPP: Diagnose abgeschlossen; kein Entdecken-Folgelauf.");
    return 0;
  } catch (error) {
    const stopp = error instanceof LiveSicherheitsStopp
      || error instanceof EntdeckenProviderProbeProductStopp
      ? error
      : new EntdeckenProviderProbeProductStopp(
        "PROVIDER_PROBE_RESULT_INVALID", "Entdecken-Providerprobe ist fehlgeschlagen.",
      );
    const kennung = stopp instanceof EntdeckenProviderProbeProductStopp
      ? stopp.code
      : (stopp.exitCode === BUDGET_UNBEKANNT_EXIT
        ? "BUDGET_UNBEKANNT" : "AUTONOMIE_STOPP");
    console.error(`${kennung}: ${stopp.message}`);
    console.error("PROVIDER-PROBE-STOPP: kein Retry und kein Entdecken-Folgelauf.");
    return stopp.exitCode;
  }
}

const direktGestartet = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direktGestartet) process.exitCode = await main();

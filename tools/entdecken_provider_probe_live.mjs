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
      errorOutput("BUDGET_UNBEKANNT: Privater Providerbeleg konnte bei Signal nicht sicher entfernt werden.");
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
          "unbekannt", "Entdecken-Providerprobe war nicht verlaesslich erreichbar.",
        );
    }
    const probe = safeFunctionResult(response, body);
    if (!probe || capture?.captureState !== "raw" || typeof capture.filePath !== "string") {
      throw new LiveSicherheitsStopp(
        "unbekannt", "Entdecken-Providerprobe lieferte keinen sicheren privaten Rohbeleg.",
      );
    }
    const info = lstatSync(capture.filePath);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
      throw new LiveSicherheitsStopp(
        "unbekannt", "Privater Providerbeleg besitzt nicht den erwarteten Dateischutz.",
      );
    }
    const rawResponse = readFileSync(capture.filePath, "utf8");
    if (!validateEntdeckenProviderProbeRawEvidence(rawResponse, probe)) {
      throw new LiveSicherheitsStopp(
        "unbekannt", "Providerrohbeleg und sichere Diagnose stimmen nicht ueberein.",
      );
    }
    if (Math.abs(costs.requestKostenUsdCent - probe.costUsdCent) > 0.00005) {
      throw new LiveSicherheitsStopp(
        "unbekannt", "Serverseitiges Laufdelta und Probe-Kostenstatus stimmen nicht ueberein.",
      );
    }

    ausgabe(
      "ENTDECKEN-PROVIDER-PROBE: "
        + `providerHttpStatus=${probe.providerHttpStatus ?? "none"}`
        + ` · providerErrorType=${probe.providerErrorType ?? "none"}`
        + ` · cause=${probe.cause}`
        + ` · usageKnown=${probe.usageKnown}`
        + ` · costStatus=${probe.costStatus}`
        + ` · costUsdCent=${probe.costUsdCent.toFixed(4)}`
        + ` · organizationHeaderPresent=${probe.organizationHeaderPresent}`
        + ` · workspaceHeaderPresent=${probe.workspaceHeaderPresent}`
        + " · providerRequests=1 · productWrites=0",
    );
    if (probe.cause !== "authenticated" || probe.costKnown !== true) {
      throw new LiveSicherheitsStopp(
        "unbekannt",
        "Die minimale Providerprobe hat Authentifizierung und Istkosten nicht bestaetigt.",
      );
    }
    return Object.freeze({ ...probe, laufKostenUsdCent: costs.laufKostenUsdCent });
  } finally {
    try { rawLifecycle.cleanup(); }
    catch { captureError = true; }
    rawLifecycle.close();
    if (captureError) {
      throw new LiveSicherheitsStopp(
        "unbekannt", "Privater Providerbeleg konnte nicht sicher entfernt werden.",
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
      ? error
      : new LiveSicherheitsStopp("unbekannt", "Entdecken-Providerprobe ist fehlgeschlagen.");
    const kennung = stopp.exitCode === BUDGET_UNBEKANNT_EXIT
      ? "BUDGET_UNBEKANNT" : "AUTONOMIE_STOPP";
    console.error(`${kennung}: ${stopp.message}`);
    console.error("PROVIDER-PROBE-STOPP: kein Retry und kein Entdecken-Folgelauf.");
    return stopp.exitCode;
  }
}

const direktGestartet = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direktGestartet) process.exitCode = await main();

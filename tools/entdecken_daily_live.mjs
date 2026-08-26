#!/usr/bin/env node
/* Einmalige praktische Abnahme des privaten Entdecken-Tagesfeeds.
   Dieser Pfad wird nur vom fest verdrahteten Keychain-/Budgetweg gestartet.
   Er macht genau einen expliziten Refresh-POST, danach einen read-only GET-
   Persistenzreadback und keinen Retry. */

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
import { ENTDECKEN_DAILY_ONCE_ENV } from "./keychain_runner.mjs";
import {
  formatiereEntdeckenLiveDiagnose,
  pruefeEntdeckenLiveAntwort,
} from "./entdecken_live_proof.mjs";
import {
  captureProviderRawResponse,
  providerDiagnosticHeaders,
  providerRawCaptureEnabled,
} from "./provider_raw_capture.mjs";

const FUNCTION_NAME = "entdecken-daily-task";
const GUARD_VALUE = "keychain-budget-guard-v1";
const REFRESH_HEADER = "X-KD-Entdecken-Refresh";
const OWNER_REFRESH_VALUE = "owner-v1";
const OWNER_ACCESS_KEYS = Object.freeze(["active", "personal_ai", "role"]);

export async function pruefeEntdeckenOwnerZugang({
  verbindung,
  token,
  fetchImpl = fetch,
}) {
  let response;
  let body;
  try {
    response = await fetchMitZeitgrenze(
      `${verbindung.urlBasis}/rest/v1/kd_account_access?select=role%2Cactive%2Cpersonal_ai&limit=2`,
      {
        method: "GET",
        headers: {
          apikey: verbindung.anon,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      { fetchImpl, timeoutMs: BUDGET_FETCH_TIMEOUT_MS },
    );
    body = await liesJsonOderNull(response);
  } catch (error) {
    throw error instanceof LiveSicherheitsStopp
      ? error
      : new LiveSicherheitsStopp("unbekannt", "Entdecken-Owner-Zugang war nicht verlaesslich lesbar.");
  }

  const row = Array.isArray(body) && body.length === 1 ? body[0] : null;
  if (!response?.ok || !row || typeof row !== "object" || Array.isArray(row)
      || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(OWNER_ACCESS_KEYS)
      || row.role !== "owner" || row.active !== true || row.personal_ai !== true) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "Kein bestaetigter Owner-Credentialpfad; Provider-Qualitaetssmoke wurde nicht gestartet.",
    );
  }
  return Object.freeze({ status: "owner-confirmed" });
}

function validateFunctionResponse(response, body, readbackBody, measuredCostUsdCent) {
  if (!response?.ok) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      `Entdecken-Tagesfeed endete ohne bestaetigten Einzelwrite (HTTP ${response?.status ?? "?"}).`,
    );
  }
  try {
    return pruefeEntdeckenLiveAntwort(body, {
      measuredCostUsdCent,
      readbackResponse: readbackBody,
    });
  } catch (error) {
    const diagnostic = formatiereEntdeckenLiveDiagnose(error?.diagnostic);
    throw new LiveSicherheitsStopp(
      "unbekannt",
      `Entdecken-Tagesfeed endete ohne bestaetigten Einzelwrite (${error?.code || "LIVE_PROOF"})`
        + `${diagnostic ? `: ${diagnostic}` : "."}`,
    );
  }
}

export async function runEntdeckenDailyOnce({
  env = process.env,
  fetchImpl = fetch,
  ausgabe = console.log,
} = {}) {
  if (env[ENTDECKEN_DAILY_ONCE_ENV] !== GUARD_VALUE) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "Entdecken-Livepfad darf nur ueber den fest verdrahteten npm-Budgetweg starten.",
    );
  }
  const verbindung = liesBudgetVerbindung(env);
  let diagnosticHeaders = Object.freeze({});
  try { diagnosticHeaders = providerDiagnosticHeaders(env); }
  catch {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "Entdecken hat keine sichere private Provider-Capture-Senke.",
    );
  }
  const token = await meldeTestkontoAn(verbindung, fetchImpl);
  await pruefeEntdeckenOwnerZugang({ verbindung, token, fetchImpl });
  const laufWache = new LiveLaufWache({
    maxAnbieterRequests: 1,
    laufLimitUsdCent: ENTDECKEN_LAUF_LIMIT_USD_CENT,
    standLeser: () => holeBudgetStand({ verbindung, token, fetchImpl }),
  });
  const initialStand = await laufWache.initialisiere();
  const markierung = await laufWache.vorAnbieterRequest("Entdecken-Tagesfeed einmalig");

  let response = null;
  let body = null;
  let requestError = null;
  try {
    response = await fetchMitZeitgrenze(
      `${verbindung.urlBasis}/functions/v1/${FUNCTION_NAME}`,
      {
        method: "POST",
        headers: {
          Origin: verbindung.origin,
          apikey: verbindung.anon,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          [REFRESH_HEADER]: OWNER_REFRESH_VALUE,
          ...diagnosticHeaders,
        },
      },
      { fetchImpl, timeoutMs: initialStand.anbieterRequestTimeoutMs },
    );
    body = await liesJsonOderNull(response);
  } catch (error) {
    requestError = error;
  }

  let captureError = null;
  if (!requestError && providerRawCaptureEnabled(env)) {
    try {
      captureProviderRawResponse(body, "07-entdecken-weekly-websearch.json", {
        env,
        repoRoot: new URL("..", import.meta.url).pathname.replace(/\/$/, ""),
      });
    } catch {
      captureError = new LiveSicherheitsStopp(
        "unbekannt",
        "Entdecken-Providerpayload wurde nicht sicher privat erfasst.",
      );
    }
  }

  const costs = await laufWache.nachAnbieterRequest(markierung, null);
  if (requestError) {
    throw requestError instanceof LiveSicherheitsStopp
      ? requestError
      : new LiveSicherheitsStopp("unbekannt", "Entdecken-Function war nicht verlaesslich erreichbar.");
  }
  if (captureError) throw captureError;
  let readbackResponse;
  let readbackBody;
  try {
    readbackResponse = await fetchMitZeitgrenze(
      `${verbindung.urlBasis}/functions/v1/${FUNCTION_NAME}`,
      {
        method: "GET",
        headers: {
          Origin: verbindung.origin,
          apikey: verbindung.anon,
          Accept: "application/json",
        },
      },
      { fetchImpl, timeoutMs: BUDGET_FETCH_TIMEOUT_MS },
    );
    readbackBody = await liesJsonOderNull(readbackResponse);
  } catch {
    readbackResponse = null;
    readbackBody = null;
  }
  if (!readbackResponse?.ok) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "Entdecken-Persistenzreadback war nach dem Einzelwrite nicht verlaesslich lesbar.",
    );
  }
  const proof = validateFunctionResponse(
    response,
    body,
    readbackBody,
    costs.laufKostenUsdCent,
  );
  ausgabe(
    `ENTDECKEN-TAGESFEED-EINMAL: fresh · 1 Providerrequest · 1 Suchrequest · 1 Write · Laufdelta ${costs.laufKostenUsdCent.toFixed(4)} US-Cent`,
  );
  return Object.freeze({
    status: proof.status,
    providerRequests: body.providerRequests,
    searchRequests: body.searchRequests,
    writes: body.writes,
    laufKostenUsdCent: costs.laufKostenUsdCent,
  });
}

export async function main() {
  try {
    await runEntdeckenDailyOnce();
    return 0;
  } catch (error) {
    const stopp = error instanceof LiveSicherheitsStopp
      ? error
      : new LiveSicherheitsStopp("unbekannt", "Entdecken-Tagesfeed-Abnahme ist fehlgeschlagen.");
    const kennung = stopp.exitCode === BUDGET_UNBEKANNT_EXIT
      ? "BUDGET_UNBEKANNT" : "AUTONOMIE_STOPP";
    console.error(`${kennung}: ${stopp.message}`);
    console.error("Keine automatische Wiederholung; keine weiteren echten KI-Requests.");
    return stopp.exitCode;
  }
}

const direktGestartet = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direktGestartet) process.exitCode = await main();

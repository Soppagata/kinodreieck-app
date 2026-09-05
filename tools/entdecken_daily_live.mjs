#!/usr/bin/env node
/* Einmalige praktische Abnahme des privaten Entdecken-Tagesfeeds.
   Dieser Pfad wird nur vom fest verdrahteten Keychain-/Budgetweg gestartet.
   Er macht genau einen GET zur Discovery-Function und keinen Retry. */

import { pathToFileURL } from "node:url";
import {
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
import { validateEntdeckenDailyFeed } from "../supabase/functions/entdecken-daily-task/contract.js";

const FUNCTION_NAME = "entdecken-daily-task";
const GUARD_VALUE = "keychain-budget-guard-v1";
const RESPONSE_KEYS = Object.freeze([
  "feed", "ok", "providerRequests", "searchRequests", "status", "writes",
]);

function validateFunctionResponse(response, body) {
  const checkedFeed = validateEntdeckenDailyFeed(body?.feed);
  if (!response?.ok || !body || typeof body !== "object" || Array.isArray(body)
      || JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(RESPONSE_KEYS)
      || body.ok !== true || body.status !== "fresh" || body.writes !== 1
      || body.providerRequests !== 1 || body.searchRequests !== 1
      || !checkedFeed.ok) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      `Entdecken-Tagesfeed endete ohne bestaetigten Einzelwrite (HTTP ${response?.status ?? "?"}).`,
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
  const token = await meldeTestkontoAn(verbindung, fetchImpl);
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
        method: "GET",
        headers: {
          Origin: verbindung.origin,
          apikey: verbindung.anon,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      { fetchImpl, timeoutMs: initialStand.anbieterRequestTimeoutMs },
    );
    body = await liesJsonOderNull(response);
  } catch (error) {
    requestError = error;
  }

  const costs = await laufWache.nachAnbieterRequest(markierung, null);
  if (requestError) {
    throw requestError instanceof LiveSicherheitsStopp
      ? requestError
      : new LiveSicherheitsStopp("unbekannt", "Entdecken-Function war nicht verlaesslich erreichbar.");
  }
  validateFunctionResponse(response, body);
  ausgabe(
    `ENTDECKEN-TAGESFEED-EINMAL: fresh · 1 Providerrequest · 1 Suchrequest · 1 Write · Laufdelta ${costs.laufKostenUsdCent.toFixed(4)} US-Cent`,
  );
  return Object.freeze({
    status: body.status,
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

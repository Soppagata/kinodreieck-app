#!/usr/bin/env node
/* Einmalige praktische Radar-Websearch-Abnahme.
   ================================================================
   Dieser Pfad ist absichtlich NICHT direkt aufrufbar. Er wird nur durch

     npm run test:ai:live -- --radar-websearch-once

   hinter Keychain-Loader, Prozess-Lock und aeusserer Budgetmessung gestartet.
   Er ruft genau einmal die dedizierte Staging-Function auf; keine Rauchprobe,
   Modelldiagnose, Wiederholung oder zweite Radar-Anfrage wird mitgestartet.
   ================================================================ */

import { pathToFileURL } from "node:url";
import {
  BUDGET_UNBEKANNT_EXIT,
  LiveLaufWache,
  LiveSicherheitsStopp,
  fetchMitZeitgrenze,
  holeBudgetStand,
  liesBudgetVerbindung,
  liesJsonOderNull,
  meldeTestkontoAn,
} from "./ai_budget_guard.mjs";
import { RADAR_WEBSEARCH_ONCE_ENV } from "./keychain_runner.mjs";
import { validateRadarPilotFeed } from "../src/lib/radarPilotContracts.js";
import {
  captureProviderRawResponse,
  providerDiagnosticHeaders,
  providerRawCaptureEnabled,
} from "./provider_raw_capture.mjs";

const RADAR_FUNCTION = "radar-websearch-task";
const GUARD_VALUE = "keychain-budget-guard-v1";
const TARGET_FORM = /^[a-z][a-z0-9_-]{1,31}:[^\s]{1,150}$/i;

function validTarget(value) {
  return typeof value === "string" && value === value.trim()
    && TARGET_FORM.test(value) && !/^(?:fixture|synthetic):/i.test(value);
}

function validateFunctionResponse(response, body) {
  if (!response?.ok || !body || typeof body !== "object" || Array.isArray(body)
      || body.ok !== true || !["confirmed","no_change","insufficient_evidence"].includes(body.status)
      || !Number.isInteger(body.writes) || body.writes < 0 || body.writes > 6
      || body.providerRequests !== 1 || !Number.isInteger(body.searchRequests)
      || body.searchRequests < 1 || body.searchRequests > 4) {
    throw new RadarProofError("RADAR_RESULT_UNPROVEN");
  }
}

class RadarProofError extends Error {}

export async function runRadarWebsearchOnce({
  env = process.env,
  fetchImpl = fetch,
  ausgabe = console.log,
} = {}) {
  if (env[RADAR_WEBSEARCH_ONCE_ENV] !== GUARD_VALUE) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "Radar-Websearch-Livepfad darf nur ueber den fest verdrahteten npm-Budgetweg starten.",
    );
  }
  let targetId = String(env.KD_RADAR_TARGET_ID || "").trim();
  if (targetId && !validTarget(targetId)) throw new RadarProofError("RADAR_TARGET_INVALID");

  const verbindung = liesBudgetVerbindung(env);
  let diagnosticHeaders = Object.freeze({});
  try { diagnosticHeaders = providerDiagnosticHeaders(env); }
  catch {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "Radar-Websearch hat keine sichere private Provider-Capture-Senke.",
    );
  }
  const token = await meldeTestkontoAn(verbindung, fetchImpl);
  let textSubscription = null;
  let previousVersionIds = new Set();
  const readFeed = async () => {
    const response = await fetchMitZeitgrenze(`${verbindung.urlBasis}/rest/v1/rpc/kd_radar_pilot_feed`, {
      method:"POST", headers:{apikey:verbindung.anon,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({p_operation_ids:[]}),
    }, {fetchImpl,timeoutMs:20_000});
    const feed = await liesJsonOderNull(response);
    if (!response.ok || !validateRadarPilotFeed(feed).ok) throw new RadarProofError("RADAR_FEED_UNPROVEN");
    return feed;
  };
  if (!targetId || targetId.startsWith("text:")) {
    const feed = await readFeed();
    previousVersionIds = new Set(feed.events.map((item) => item.eventVersionId));
    textSubscription = feed.subscriptions.filter((item) => item.targetType === "text"
      && item.status === "active" && (!targetId || item.targetId === targetId))
      .sort((a,b) => a.targetId.localeCompare(b.targetId))[0];
    if (!textSubscription) throw new RadarProofError("RADAR_OWN_TEXT_TARGET_MISSING");
    targetId = textSubscription.targetId;
  }
  const laufWache = new LiveLaufWache({
    maxAnbieterRequests: 1,
    standLeser: () => holeBudgetStand({ verbindung, token, fetchImpl }),
  });
  const initialStand = await laufWache.initialisiere();
  const markierung = await laufWache.vorAnbieterRequest("Radar-Websearch einmalig");

  let response = null;
  let body = null;
  let requestError = null;
  try {
    response = await fetchMitZeitgrenze(
      `${verbindung.urlBasis}/functions/v1/${RADAR_FUNCTION}`,
      {
        method: "POST",
        headers: {
          Origin: verbindung.origin,
          apikey: verbindung.anon,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...diagnosticHeaders,
        },
        body: JSON.stringify({ targetId, ...(textSubscription ? {targetText:textSubscription.title} : {}) }),
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
      captureProviderRawResponse(body, "08-radar-websearch.json", {
        env,
        repoRoot: new URL("..", import.meta.url).pathname.replace(/\/$/, ""),
      });
    } catch {
      captureError = new LiveSicherheitsStopp(
        "unbekannt",
        "Radar-Websearch-Providerpayload wurde nicht sicher privat erfasst.",
      );
    }
  }

  await laufWache.nachAnbieterRequest(markierung, null);
  if (requestError) {
    throw requestError instanceof LiveSicherheitsStopp
      ? requestError
      : new LiveSicherheitsStopp("unbekannt", "Radar-Function war nicht verlaesslich erreichbar.");
  }
  if (captureError) throw captureError;
  validateFunctionResponse(response, body);
  if (textSubscription) {
    const readback = await readFeed();
    const own = readback.subscriptions.find((item) => item.targetId === targetId);
    if (!own || own.title !== textSubscription.title || own.status !== "active") throw new RadarProofError("RADAR_TARGET_READBACK_FAILED");
    const returned = body.feed?.events?.filter((item) => item.targetId.startsWith("release:v1:")
      && !previousVersionIds.has(item.eventVersionId)) || [];
    if (body.writes > 0 && (returned.length < body.writes || returned.some((item) => !readback.events.some((row) => row.eventVersionId === item.eventVersionId)))) {
      throw new RadarProofError("RADAR_FINDING_READBACK_FAILED");
    }
  }
  ausgabe(`RADAR-WEBSEARCH-EINMAL: ${body.status} · 1 Providerrequest · ${body.searchRequests} Suchrequests · ${body.writes} Writes${textSubscription ? " · Feed rückgelesen" : ""}`);
  return Object.freeze({
    status: body.status,
    providerRequests: body.providerRequests,
    searchRequests: body.searchRequests,
    writes: body.writes,
  });
}

export async function main() {
  try {
    await runRadarWebsearchOnce();
    return 0;
  } catch (error) {
    if (error instanceof RadarProofError) {
      console.error(`${error.message}: Kein automatischer Retry.`);
      return 1;
    }
    const stopp = error instanceof LiveSicherheitsStopp
      ? error
      : new LiveSicherheitsStopp("unbekannt", "Radar-Websearch-Abnahme ist fehlgeschlagen.");
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

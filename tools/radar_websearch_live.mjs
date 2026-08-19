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
import { validatePersonRadarCheckResult } from "../src/lib/personDiscoveryContracts.js";

const RADAR_FUNCTION = "radar-websearch-task";
const GUARD_VALUE = "keychain-budget-guard-v1";
const TARGET_FORM = /^[a-z][a-z0-9_-]{1,31}:[^\s]{1,150}$/i;
const RESPONSE_KEYS = Object.freeze([
  "ok", "phaseCode", "providerRequests", "reservationDecision",
  "reservationStatus", "reservationUsdCent", "searchRequests", "status", "writes",
]);
const PERSON_RESPONSE_KEYS = Object.freeze([...RESPONSE_KEYS, "personResult"].sort());
const PERSON_RESULT_KEYS = Object.freeze([
  "status", "checkedAt", "windowStart", "windowEnd", "person", "candidates",
]);
const PERSON_KEYS = Object.freeze(["personExternalId", "name", "role", "canonical"]);
const PERSON_ROLES = Object.freeze(["actor", "director"]);
const PHASE_CODES = new Set([
  "runtime-setup",
  "cost-reservation",
  "provider-request",
  "provider-complete",
]);

function validTarget(value) {
  return typeof value === "string" && value === value.trim()
    && TARGET_FORM.test(value) && !/^(?:fixture|synthetic):/i.test(value);
}

function exactKeys(value, keys) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function personTargetIdentity(targetId) {
  if (!validTarget(targetId) || !targetId.startsWith("person:")) return null;
  for (const role of PERSON_ROLES) {
    const suffix = `:${role}`;
    if (!targetId.endsWith(suffix)) continue;
    const personExternalId = targetId.slice("person:".length, -suffix.length);
    return validTarget(personExternalId)
        && targetId === `person:${personExternalId}:${role}`
      ? Object.freeze({ personExternalId, role })
      : null;
  }
  return null;
}

function validPersonResult(value, targetIdentity) {
  if (!targetIdentity || !exactKeys(value, PERSON_RESULT_KEYS)
      || value.status !== "confirmed" || !exactKeys(value.person, PERSON_KEYS)
      || value.person.personExternalId !== targetIdentity.personExternalId
      || value.person.role !== targetIdentity.role
      || !Array.isArray(value.candidates) || value.candidates.length < 1
      || value.candidates.length > 3) return false;
  const catalog = value.candidates.map((candidate) => ({
    targetId: candidate?.targetId,
    targetType: candidate?.targetType,
    title: candidate?.title,
    year: candidate?.year,
  }));
  const checked = validatePersonRadarCheckResult(value, {
    identity: {
      personExternalId: targetIdentity.personExternalId,
      name: value.person.name,
      role: targetIdentity.role,
      canonical: true,
    },
    catalog,
    mode: "production",
  });
  return checked.ok && checked.result.decisions.length === value.candidates.length
    && checked.result.decisions.every((decision) => decision.status === "matched" && decision.work);
}

export function validateFunctionResponse(response, body, targetId = null) {
  const phaseCode = PHASE_CODES.has(body?.phaseCode) ? body.phaseCode : "unknown";
  const reservationDecision = ["limit", "disabled", "forbidden", "server"].includes(body?.reservationDecision)
    ? body.reservationDecision : "unknown";
  if (body?.reservationStatus === "rejected") {
    throw new LiveSicherheitsStopp(
      reservationDecision === "limit" ? "limit" : "unbekannt",
      `Radar-Websearch-Reservierung wurde sicher abgelehnt (${reservationDecision}, Phase ${phaseCode}).`,
    );
  }
  const hasPersonResult = !!body && typeof body === "object" && !Array.isArray(body)
    && Object.prototype.hasOwnProperty.call(body, "personResult");
  const targetIdentity = personTargetIdentity(targetId);
  const responseKeys = hasPersonResult ? PERSON_RESPONSE_KEYS : RESPONSE_KEYS;
  if (!response?.ok || !body || typeof body !== "object" || Array.isArray(body)
      || JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(responseKeys)
      || (targetIdentity ? !hasPersonResult : hasPersonResult)
      || (hasPersonResult && !validPersonResult(body.personResult, targetIdentity))
      || !PHASE_CODES.has(body.phaseCode)
      || body.ok !== true || body.status !== "confirmed" || body.writes !== 1
      || body.providerRequests !== 1 || body.searchRequests !== 1
      || body.phaseCode !== "provider-complete"
      || body.reservationStatus !== "reserved"
      || body.reservationDecision !== "accepted"
      || typeof body.reservationUsdCent !== "number"
      || !Number.isFinite(body.reservationUsdCent)
      || body.reservationUsdCent <= 0 || body.reservationUsdCent > 5) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      `Radar-Websearch-Abnahme endete ohne bestaetigten Einzelwrite (HTTP ${response?.status ?? "?"}, Phase ${phaseCode}).`,
    );
  }
}

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
  const targetId = String(env.KD_RADAR_TARGET_ID || "").trim();
  if (!validTarget(targetId)) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "KD_RADAR_TARGET_ID fehlt oder ist kein starkes reales Ziel.",
    );
  }

  const verbindung = liesBudgetVerbindung(env);
  const token = await meldeTestkontoAn(verbindung, fetchImpl);
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
        },
        body: JSON.stringify({ targetId }),
      },
      { fetchImpl, timeoutMs: initialStand.anbieterRequestTimeoutMs },
    );
    body = await liesJsonOderNull(response);
  } catch (error) {
    requestError = error;
  }

  await laufWache.nachAnbieterRequest(markierung, null);
  if (requestError) {
    throw requestError instanceof LiveSicherheitsStopp
      ? requestError
      : new LiveSicherheitsStopp("unbekannt", "Radar-Function war nicht verlaesslich erreichbar.");
  }
  validateFunctionResponse(response, body, targetId);
  ausgabe("RADAR-WEBSEARCH-EINMAL: confirmed · 1 Providerrequest · 1 Suchrequest · 1 Write");
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

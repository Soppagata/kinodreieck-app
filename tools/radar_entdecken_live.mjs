#!/usr/bin/env node
/* Einziger serieller Produkt-Smoke fuer das kontrollierte Remote-Fenster.
   Er laeuft ausschliesslich hinter demselben npm-/Keychain-/Budgetpfad wie die
   bisherigen Einzelproben und ruft Entdecken und danach Radar je genau einmal
   auf. Ein Fehler stoppt vor jedem weiteren Schritt; es gibt keinen Retry. */

import { pathToFileURL } from "node:url";
import {
  BUDGET_UNBEKANNT_EXIT,
  LiveSicherheitsStopp,
} from "./ai_budget_guard.mjs";
import { runEntdeckenDailyOnce } from "./entdecken_daily_live.mjs";
import {
  ENTDECKEN_DAILY_ONCE_ENV,
  RADAR_WEBSEARCH_ONCE_ENV,
} from "./keychain_runner.mjs";
import { runRadarWebsearchOnce } from "./radar_websearch_live.mjs";

const GUARD_VALUE = "keychain-budget-guard-v1";

export async function runRadarEntdeckenOnce({
  env = process.env,
  runEntdecken = runEntdeckenDailyOnce,
  runRadar = runRadarWebsearchOnce,
  ausgabe = console.log,
} = {}) {
  if (env[ENTDECKEN_DAILY_ONCE_ENV] !== GUARD_VALUE
      || env[RADAR_WEBSEARCH_ONCE_ENV] !== GUARD_VALUE) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "Kombinierter Produkt-Smoke darf nur ueber den fest verdrahteten npm-Budgetweg starten.",
    );
  }
  const entdecken = await runEntdecken({ env, ausgabe });
  const radar = await runRadar({ env, ausgabe });
  ausgabe("RADAR+ENTDECKEN-EINMAL: 2 serielle Produktrequests · kein Retry");
  return Object.freeze({ entdecken, radar });
}

export async function main() {
  try {
    await runRadarEntdeckenOnce();
    return 0;
  } catch (error) {
    const stopp = error instanceof LiveSicherheitsStopp
      ? error
      : new LiveSicherheitsStopp("unbekannt", "Kombinierter Produkt-Smoke ist fehlgeschlagen.");
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

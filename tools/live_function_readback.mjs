/* Repo-gebundener, providerfreier Owner-Readback fuer kontrollierte
   Function-Releases. Er verwendet exakt denselben oeffentlichen
   Konfigurations-, Keychain- und Loginpfad wie `npm run test:ai:live`.

   Wichtig: Dieses Modul pusht/deployed nichts und startet keinen KI-Anbieter.
   Ein autorisierter Einmal-Runner darf es nach seinem Deployment nur fuer den
   normalen ai-task-Health-/Buildmarker-Readback aufrufen. */

import {
  KEYCHAIN_ACCOUNTS,
  KeychainFehler,
  baueKindUmgebung,
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

export async function liesOwnerFunctionBuildMarker({
  expectedBuildVersion,
  expectedProjectRef,
  lokaleKonfig = liesLokaleKonfig(),
  keychainLeser = liesKeychainEintrag,
  fetchImpl = fetch,
  vorgangId = crypto.randomUUID(),
} = {}) {
  if (!COMMIT_FORM.test(String(expectedBuildVersion || ""))) {
    stop("BUILD_MARKER_EXPECTATION_INVALID", "Der erwartete Buildmarker ist formfremd.");
  }

  /* Zielbindung kommt absichtlich vor dem ersten Keychain-Read. */
  pruefeProjektbindung(lokaleKonfig, expectedProjectRef);

  let env;
  try {
    env = baueKindUmgebung({
      modus: "ai-live",
      ambientEnv: {},
      lokaleKonfig,
      keychainLeser,
      ownerApprovedServerBudget: true,
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

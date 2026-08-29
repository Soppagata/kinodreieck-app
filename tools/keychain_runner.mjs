#!/usr/bin/env node
/* Sichere lokale Brücke vom macOS-Schlüsselbund zu den Infrastrukturtests.
   ==========================================================================
   Die fest gebundenen Testpasswörter bleiben im Login-Schlüsselbund. Dieses Programm
   liest nur die fest benannten Einträge und reicht sie ausschließlich an
   fest verdrahtete Testwege weiter. Es gibt keine freie Befehlsausführung.

   Öffentliche Zielwerte liegen in `.env.live.local`; Geheimnisse und
   Kostenfreigaben sind dort ausdrücklich verboten.
   ========================================================================== */

import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  OWNER_CORE_SIX_GUARD_ENV,
  OWNER_CORE_SIX_GUARD_VALUE,
  PROVIDER_RAW_CAPTURE_DIR_ENV,
  PROVIDER_RAW_CAPTURE_GUARD_ENV,
  PROVIDER_RAW_CAPTURE_GUARD_VALUE,
} from "./provider_raw_capture.mjs";
import {
  FILMWISSEN_TARGET_ID_ENV,
  FILMWISSEN_TARGET_IDS_ENV,
  liesFilmwissenLiveTargets,
} from "./filmwissen_live_target.mjs";

export {
  OWNER_CORE_SIX_GUARD_ENV,
  OWNER_CORE_SIX_GUARD_VALUE,
  PROVIDER_RAW_CAPTURE_DIR_ENV,
  PROVIDER_RAW_CAPTURE_GUARD_ENV,
  PROVIDER_RAW_CAPTURE_GUARD_VALUE,
} from "./provider_raw_capture.mjs";

export const KEYCHAIN_SERVICE = "at.kinodreieck.codex.live-tests.shared";
export const KEYCHAIN_ACCOUNTS = Object.freeze({
  testa: "KD_TESTA_PASS",
  testb: "KD_TESTB_PASS",
  owner: "KD_OWNER_PASS",
});

export const EXIT_KONFIG = 64;
export const EXIT_KEYCHAIN = 73;
export const EXIT_START = 70;
export const OWNER_SERVER_BUDGET_FLAG = "--owner-approved-server-budget";
export const OWNER_SERVER_BUDGET_ENV = "KD_AI_OWNER_APPROVED_SERVER_BUDGET";
export const RADAR_WEBSEARCH_ONCE_FLAG = "--radar-websearch-once";
export const RADAR_WEBSEARCH_ONCE_ENV = "KD_RADAR_WEBSEARCH_ONCE_GUARD";
export const RADAR_TARGET_AUTO_RESOLVE_ENV = "KD_RADAR_TARGET_AUTO_RESOLVE_GUARD";
export const RADAR_TARGET_AUTO_RESOLVE_VALUE = "owner-session-feed-v1";
export const RADAR_ENTDECKEN_ONCE_FLAG = "--radar-entdecken-once";
export const ENTDECKEN_DAILY_ONCE_FLAG = "--entdecken-daily-once";
export const ENTDECKEN_DAILY_ONCE_ENV = "KD_ENTDECKEN_DAILY_ONCE_GUARD";
export const ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG = "--entdecken-provider-probe-once";
export const ENTDECKEN_PROVIDER_PROBE_ONCE_ENV = "KD_ENTDECKEN_PROVIDER_PROBE_ONCE_GUARD";
export const ENTDECKEN_FACTS_ONCE_FLAG = "--entdecken-facts-once";
export const ENTDECKEN_FACTS_ONCE_ENV = "KD_ENTDECKEN_FACTS_ONCE_GUARD";

const DATEI = fileURLToPath(import.meta.url);
export const REPO_ROOT = resolve(dirname(DATEI), "..");
export const LOKALE_KONFIG = resolve(REPO_ROOT, ".env.live.local");
export const LIVE_LOCK_PATH = resolve(tmpdir(), "kinodreieck-ai-provider-tests.lock");

const OEFFENTLICHE_NAMEN = new Set([
  "KD_SB_URL",
  "KD_SB_ANON",
  "KD_TESTA_USER",
  "KD_TESTB_USER",
  "KD_OWNER_USER",
  "KD_MAIL_DOMAIN",
  "KD_AI_FUNKTION",
  "KD_ORIGIN",
  "KD_RADAR_TARGET_ID",
  FILMWISSEN_TARGET_ID_ENV,
  FILMWISSEN_TARGET_IDS_ENV,
]);

const VERBOTENE_LOKALE_NAMEN = new Set([
  "KD_TESTA_PASS",
  "KD_TESTB_PASS",
  "KD_OWNER_PASS",
  "KD_AI_AUTONOM_LIMIT_USD_CENT",
  OWNER_SERVER_BUDGET_ENV,
  RADAR_WEBSEARCH_ONCE_ENV,
  RADAR_TARGET_AUTO_RESOLVE_ENV,
  ENTDECKEN_DAILY_ONCE_ENV,
  ENTDECKEN_PROVIDER_PROBE_ONCE_ENV,
  ENTDECKEN_FACTS_ONCE_ENV,
  OWNER_CORE_SIX_GUARD_ENV,
  PROVIDER_RAW_CAPTURE_DIR_ENV,
  PROVIDER_RAW_CAPTURE_GUARD_ENV,
  "KD_EVAL_JA",
]);

const HARMLOSE_PROZESSWERTE = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "NO_COLOR",
  "FORCE_COLOR",
  "CI",
];
const RLS_ACCESS_MODI = new Set(["active", "inactive", "missing"]);
const RADAR_TARGET_FORM = /^[a-z][a-z0-9_-]{1,31}:[^\s]{1,150}$/i;
const RADAR_AUTO_TARGET_TYPES = new Set(["work", "series", "person", "franchise"]);

const SKRIPT = (name) => resolve(REPO_ROOT, "tools", name);

export async function pruefeEntdeckenDailyOnceProvenienz() {
  const { requireEntdeckenMixedPoolSingleLiveReleaseProvenance } = await import(
    "./radar_websearch_remote_start.mjs"
  );
  return requireEntdeckenMixedPoolSingleLiveReleaseProvenance();
}

export async function pruefeEntdeckenProviderProbeProvenienz({
  requireCleanVerifier = false,
} = {}) {
  const { requireEntdeckenProviderProbeReleaseProvenance } = await import(
    "./radar_websearch_remote_start.mjs"
  );
  return requireEntdeckenProviderProbeReleaseProvenance({ requireCleanVerifier });
}

export const MODI = Object.freeze({
  "budget-check": {
    accounts: [KEYCHAIN_ACCOUNTS.testa],
    argv: [SKRIPT("ai_budget_guard.mjs"), "--check"],
  },
  "ai-live": {
    accounts: [KEYCHAIN_ACCOUNTS.testa],
    argv: [
      SKRIPT("ai_budget_guard.mjs"),
      "--",
      process.execPath,
      SKRIPT("filmwissen_live_target.mjs"),
    ],
    radarWebsearchOnceArgv: [
      SKRIPT("ai_budget_guard.mjs"),
      "--",
      process.execPath,
      SKRIPT("radar_websearch_live.mjs"),
    ],
    entdeckenDailyOnceArgv: [
      SKRIPT("ai_budget_guard.mjs"),
      "--",
      process.execPath,
      SKRIPT("entdecken_daily_live.mjs"),
    ],
    entdeckenProviderProbeOnceArgv: [
      SKRIPT("ai_budget_guard.mjs"),
      "--",
      process.execPath,
      SKRIPT("entdecken_provider_probe_live.mjs"),
    ],
    entdeckenFactsOnceArgv: [
      SKRIPT("ai_budget_guard.mjs"),
      "--",
      process.execPath,
      SKRIPT("entdecken_facts_live.mjs"),
    ],
    radarEntdeckenOnceArgv: [
      SKRIPT("ai_budget_guard.mjs"),
      "--",
      process.execPath,
      SKRIPT("radar_entdecken_live.mjs"),
    ],
  },
  "profile-contract": {
    accounts: [KEYCHAIN_ACCOUNTS.testa],
    argv: [
      SKRIPT("ai_budget_guard.mjs"),
      "--",
      process.execPath,
      SKRIPT("profile_extract_contract.mjs"),
    ],
  },
  "ai-eval": {
    accounts: [KEYCHAIN_ACCOUNTS.testa],
    argv: [
      SKRIPT("ai_budget_guard.mjs"),
      "--",
      process.execPath,
      SKRIPT("ai_eval_etappe6.mjs"),
      "--holen",
    ],
    bezahlt: true,
  },
  rls: {
    accounts: [KEYCHAIN_ACCOUNTS.testa, KEYCHAIN_ACCOUNTS.testb],
    argv: [SKRIPT("rls_test_personal.mjs")],
  },
});

export class KeychainFehler extends Error {
  constructor(message) {
    super(message);
    this.name = "KeychainFehler";
  }
}

export function reserviereLiveLauf({
  lockPath = LIVE_LOCK_PATH,
  pid = process.pid,
} = {}) {
  let fd;
  try {
    fd = openSync(lockPath, "wx", 0o600);
    writeFileSync(fd, String(pid), "utf8");
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* bestmoegliche Aufraeumung */ }
      try { unlinkSync(lockPath); } catch { /* bestmoegliche Aufraeumung */ }
    }
    if (error?.code === "EEXIST") {
      /* Keine autonome Stale-Bereinigung: Zwei Starter koennten denselben
         alten Lock lesen, einer ersetzt ihn, der andere loescht danach den
         gerade neu erworbenen Lock. Ein vorhandener Lock ist deshalb immer
         ein fail-closed Stopp und muss nach manueller Prozesspruefung entfernt
         werden. */
      throw new Error(
        `Ein echter KI-Test laeuft oder der Lock ${lockPath} muss manuell geprueft werden; Start gesperrt.`,
      );
    }
    throw error;
  }
  closeSync(fd);
  let frei = false;
  return () => {
    if (frei) return;
    frei = true;
    try {
      if (String(readFileSync(lockPath, "utf8")).trim() === String(pid)) {
        unlinkSync(lockPath);
      }
    } catch { /* Lock ist bereits fort. */ }
  };
}

function entferneGenauEinenZeilenabschluss(wert) {
  return wert.endsWith("\r\n")
    ? wert.slice(0, -2)
    : (wert.endsWith("\n") ? wert.slice(0, -1) : wert);
}

export function liesKeychainEintrag(
  account,
  {
    platform = process.platform,
    securityRun = spawnSync,
  } = {},
) {
  if (!Object.values(KEYCHAIN_ACCOUNTS).includes(account)) {
    throw new KeychainFehler("Nicht erlaubter Schlüsselbund-Eintrag.");
  }
  if (platform !== "darwin") {
    throw new KeychainFehler("Der lokale Schlüsselbund-Loader benötigt macOS.");
  }

  const ergebnis = securityRun(
    "/usr/bin/security",
    [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    },
  );

  if (ergebnis?.error || ergebnis?.signal || ergebnis?.status !== 0) {
    throw new KeychainFehler(`Schlüsselbund-Eintrag ${account} ist nicht lesbar.`);
  }

  const roh = typeof ergebnis.stdout === "string"
    ? ergebnis.stdout
    : Buffer.from(ergebnis.stdout || "").toString("utf8");
  const geheimnis = entferneGenauEinenZeilenabschluss(roh);
  if (!geheimnis) {
    throw new KeychainFehler(`Schlüsselbund-Eintrag ${account} ist leer.`);
  }
  return geheimnis;
}

function entferneAussenQuotes(wert) {
  if (wert.length >= 2) {
    const anfang = wert[0];
    const ende = wert[wert.length - 1];
    if ((anfang === "\"" && ende === "\"") || (anfang === "'" && ende === "'")) {
      return wert.slice(1, -1);
    }
  }
  return wert;
}

export function parseLokaleKonfig(text) {
  const config = {};
  String(text).split(/\r?\n/).forEach((zeile, index) => {
    const sauber = zeile.trim();
    if (!sauber || sauber.startsWith("#")) return;

    const treffer = sauber.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!treffer) {
      throw new Error(`Ungültige Zeile ${index + 1} in .env.live.local.`);
    }
    const [, name, roh] = treffer;
    if (VERBOTENE_LOKALE_NAMEN.has(name)) {
      throw new Error(`${name} darf nicht in .env.live.local stehen.`);
    }
    if (!OEFFENTLICHE_NAMEN.has(name)) {
      throw new Error(`${name} ist keine erlaubte lokale Live-Konfiguration.`);
    }
    config[name] = entferneAussenQuotes(roh.trim());
  });
  return config;
}

export function liesLokaleKonfig({
  pfad = LOKALE_KONFIG,
  readFile = readFileSync,
} = {}) {
  try {
    return parseLokaleKonfig(readFile(pfad, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(".env.live.local fehlt (nur öffentliche Zielwerte, keine Passwörter).");
    }
    throw error;
  }
}

function harmloseBasis(ambientEnv) {
  const env = {};
  for (const name of HARMLOSE_PROZESSWERTE) {
    if (typeof ambientEnv?.[name] === "string") env[name] = ambientEnv[name];
  }
  return env;
}

function pruefeOeffentlicheKonfig(env) {
  const url = String(env.KD_SB_URL || "").trim();
  const anon = String(env.KD_SB_ANON || "").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error("KD_SB_URL fehlt oder ist keine gültige Supabase-Projekt-URL.");
  }
  if (!anon || anon.length < 20) {
    throw new Error("KD_SB_ANON fehlt oder ist unplausibel kurz.");
  }
}

export class RadarTargetFehler extends Error {
  constructor(message = "Kein eindeutig berechtigtes starkes Radarziel lesbar.") {
    super(message);
    this.name = "RadarTargetFehler";
  }
}

export function normalisiereStarkesRadarZiel(wert) {
  const targetId = typeof wert === "string" ? wert.trim() : "";
  return RADAR_TARGET_FORM.test(targetId) && !/^(?:fixture|synthetic):/i.test(targetId)
    ? targetId
    : null;
}

function enthaeltAccountIdentitaet(wert) {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) return false;
  return ["accountId", "account_id", "actorId", "actor_id", "ownerId", "owner_id", "userId", "user_id"]
    .some((name) => Object.prototype.hasOwnProperty.call(wert, name));
}

function istAutoRadarZielBerechtigt(abo) {
  if (!abo || typeof abo !== "object" || Array.isArray(abo)
      || enthaeltAccountIdentitaet(abo)
      || abo.status !== "active" || abo.region !== "AT"
      || (Object.prototype.hasOwnProperty.call(abo, "targetStatus")
        && abo.targetStatus !== "active")
      || !RADAR_AUTO_TARGET_TYPES.has(abo.targetType)) return false;
  const targetId = normalisiereStarkesRadarZiel(abo.targetId);
  if (!targetId || targetId !== abo.targetId) return false;
  if (abo.targetType === "work") {
    return ["all", "cinema", "streaming"].includes(abo.scope);
  }
  if (abo.targetType === "series") {
    return ["all", "streaming"].includes(abo.scope);
  }
  if (abo.targetType === "person") {
    const personId = typeof abo.personExternalId === "string" ? abo.personExternalId.trim() : "";
    const rolle = typeof abo.personRole === "string" ? abo.personRole.trim() : "";
    return abo.scope === "all" && !!personId && ["actor", "director"].includes(rolle)
      && targetId === `person:${personId}:${rolle}`;
  }
  return abo.scope === "all" && /^title-group:v1:[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(targetId)
    && !!abo.titleGroup && typeof abo.titleGroup === "object" && !Array.isArray(abo.titleGroup);
}

export async function loeseStarkesOwnerRadarZiel({
  override = "",
  autoResolveGuard = "",
  feedLeser,
} = {}) {
  const overrideRoh = typeof override === "string" ? override.trim() : "";
  if (overrideRoh) {
    const targetId = normalisiereStarkesRadarZiel(overrideRoh);
    if (!targetId) throw new RadarTargetFehler("Radarziel-Override ist nicht stark und real.");
    return targetId;
  }
  if (autoResolveGuard !== RADAR_TARGET_AUTO_RESOLVE_VALUE || typeof feedLeser !== "function") {
    throw new RadarTargetFehler();
  }

  let antwort;
  try {
    antwort = await feedLeser();
  } catch {
    throw new RadarTargetFehler();
  }
  const feed = antwort?.daten;
  if (antwort?.status !== 200 || !feed || typeof feed !== "object" || Array.isArray(feed)
      || enthaeltAccountIdentitaet(feed) || feed.radarReview !== true
      || !Array.isArray(feed.subscriptions)) {
    throw new RadarTargetFehler();
  }

  const kandidaten = feed.subscriptions
    .filter(istAutoRadarZielBerechtigt)
    .map((abo) => abo.targetId)
    .sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));
  if (kandidaten.length === 0
      || kandidaten.some((targetId, index) => index > 0 && targetId === kandidaten[index - 1])) {
    throw new RadarTargetFehler();
  }
  return kandidaten.slice(0, 1)[0];
}

/* Providerfreier Auth-Transport fuer kontrollierte Health-/Buildmarker-
   Readbacks. Er nutzt dieselbe oeffentliche Zielkonfiguration und denselben
   Owner-Keychain-Eintrag wie der freigegebene Live-Lauf, aktiviert aber weder
   dessen Budgetoverride noch Filmwissen-, Radar- oder Entdecken-Guards. */
export function baueOwnerReadbackUmgebung({
  ambientEnv = process.env,
  lokaleKonfig = liesLokaleKonfig(),
  keychainLeser = liesKeychainEintrag,
} = {}) {
  const env = harmloseBasis(ambientEnv);
  for (const name of OEFFENTLICHE_NAMEN) {
    const wert = ambientEnv?.[name] ?? lokaleKonfig?.[name];
    if (typeof wert === "string" && wert !== "") env[name] = wert;
  }
  pruefeOeffentlicheKonfig(env);

  const ownerUser = String(env.KD_OWNER_USER || "").trim();
  if (!ownerUser || !/^[a-z0-9._-]+$/i.test(ownerUser)) {
    throw new Error("KD_OWNER_USER fehlt oder ist ungueltig.");
  }
  let ownerPass;
  try {
    ownerPass = keychainLeser(KEYCHAIN_ACCOUNTS.owner);
  } catch {
    throw new KeychainFehler(
      `Schluesselbund-Eintrag ${KEYCHAIN_ACCOUNTS.owner} ist nicht lesbar.`,
    );
  }
  if (typeof ownerPass !== "string" || ownerPass === "") {
    throw new KeychainFehler(
      `Schluesselbund-Eintrag ${KEYCHAIN_ACCOUNTS.owner} ist nicht lesbar.`,
    );
  }

  env.KD_TESTA_USER = ownerUser;
  env.KD_TESTA_PASS = ownerPass;
  delete env.KD_OWNER_USER;
  delete env.KD_RADAR_TARGET_ID;
  delete env[FILMWISSEN_TARGET_ID_ENV];
  delete env[FILMWISSEN_TARGET_IDS_ENV];
  delete env[OWNER_SERVER_BUDGET_ENV];
  delete env[OWNER_CORE_SIX_GUARD_ENV];
  delete env[RADAR_WEBSEARCH_ONCE_ENV];
  delete env[ENTDECKEN_DAILY_ONCE_ENV];
  delete env[ENTDECKEN_PROVIDER_PROBE_ONCE_ENV];
  delete env[ENTDECKEN_FACTS_ONCE_ENV];
  return env;
}

export function baueKindUmgebung({
  modus,
  ambientEnv = process.env,
  lokaleKonfig = liesLokaleKonfig(),
  keychainLeser = liesKeychainEintrag,
  confirmPaid = false,
  ownerApprovedServerBudget = false,
  radarWebsearchOnce = false,
  entdeckenDailyOnce = false,
  entdeckenProviderProbeOnce = false,
  entdeckenFactsOnce = false,
  radarEntdeckenOnce = false,
  ownerCoreSix = false,
}) {
  const definition = MODI[modus];
  if (!definition) throw new Error("Unbekannter Schlüsselbund-Lauf.");
  if (ownerApprovedServerBudget && !["ai-live", "ai-eval"].includes(modus)) {
    throw new Error("Die Owner-Budgetfreigabe gilt nur für Rauchprobe und Eval.");
  }
  if (radarWebsearchOnce && modus !== "ai-live") {
    throw new Error("Der einmalige Radar-Websearch ist nur im AI-Live-Pfad erlaubt.");
  }
  if (entdeckenDailyOnce && (modus !== "ai-live" || !ownerApprovedServerBudget
      || radarWebsearchOnce || radarEntdeckenOnce || entdeckenProviderProbeOnce)) {
    throw new Error("Der einmalige Entdecken-Lauf braucht den AI-Live-Pfad und die exakte Owner-Budgetfreigabe.");
  }
  if (entdeckenProviderProbeOnce && (modus !== "ai-live" || !ownerApprovedServerBudget
      || radarWebsearchOnce || entdeckenDailyOnce || radarEntdeckenOnce || entdeckenFactsOnce)) {
    throw new Error("Die einmalige Entdecken-Providerprobe braucht den exklusiven AI-Live-Pfad und die exakte Owner-Budgetfreigabe.");
  }
  if (entdeckenFactsOnce && (modus !== "ai-live" || !ownerApprovedServerBudget
      || radarWebsearchOnce || entdeckenDailyOnce || radarEntdeckenOnce
      || entdeckenProviderProbeOnce)) {
    throw new Error("Der einmalige Entdecken-Faktenlauf braucht den exklusiven AI-Live-Pfad und die exakte Owner-Budgetfreigabe.");
  }
  if (radarEntdeckenOnce && (modus !== "ai-live" || !ownerApprovedServerBudget
      || radarWebsearchOnce || entdeckenDailyOnce || entdeckenProviderProbeOnce)) {
    throw new Error("Der kombinierte Radar-/Entdecken-Lauf braucht den exklusiven AI-Live-Pfad und die exakte Owner-Budgetfreigabe.");
  }
  const effectiveOwnerCoreSix = ownerCoreSix
    || (modus === "ai-live" && ownerApprovedServerBudget
      && !radarWebsearchOnce && !entdeckenDailyOnce
      && !entdeckenProviderProbeOnce && !entdeckenFactsOnce && !radarEntdeckenOnce);
  if (effectiveOwnerCoreSix && (modus !== "ai-live" || !ownerApprovedServerBudget
      || radarWebsearchOnce || entdeckenDailyOnce
      || entdeckenProviderProbeOnce || entdeckenFactsOnce || radarEntdeckenOnce)) {
    throw new Error("Die Owner-Kernphase braucht den exklusiven AI-Live-Pfad und die exakte Owner-Budgetfreigabe.");
  }
  const ownerCredentialLane = modus === "ai-live"
    && (effectiveOwnerCoreSix || entdeckenDailyOnce
      || entdeckenProviderProbeOnce || entdeckenFactsOnce || radarEntdeckenOnce);

  const env = harmloseBasis(ambientEnv);
  for (const name of OEFFENTLICHE_NAMEN) {
    const wert = ambientEnv?.[name] ?? lokaleKonfig?.[name];
    if (typeof wert === "string" && wert !== "") env[name] = wert;
  }
  if (!effectiveOwnerCoreSix && !radarWebsearchOnce && !radarEntdeckenOnce) {
    delete env.KD_RADAR_TARGET_ID;
  }
  if (modus === "rls" && typeof ambientEnv?.KD_RLS_ACCESS_MODE === "string") {
    const accessModus = ambientEnv.KD_RLS_ACCESS_MODE.trim().toLowerCase();
    if (!RLS_ACCESS_MODI.has(accessModus)) {
      throw new Error("KD_RLS_ACCESS_MODE muss active, inactive oder missing sein.");
    }
    env.KD_RLS_ACCESS_MODE = accessModus;
  }
  pruefeOeffentlicheKonfig(env);

  if (ownerCredentialLane) {
    const ownerUser = String(env.KD_OWNER_USER || "").trim();
    if (!ownerUser || /[\0\r\n]/.test(ownerUser)) {
      throw new Error("KD_OWNER_USER fehlt oder ist ungültig.");
    }
    try {
      const ownerPass = keychainLeser(KEYCHAIN_ACCOUNTS.owner);
      if (typeof ownerPass !== "string" || ownerPass === "") throw new Error("leer");
      env.KD_TESTA_USER = ownerUser;
      env.KD_TESTA_PASS = ownerPass;
    } catch {
      throw new KeychainFehler(
        `Schlüsselbund-Eintrag ${KEYCHAIN_ACCOUNTS.owner} ist nicht lesbar.`,
      );
    }
  } else {
    for (const account of definition.accounts) {
      try {
        env[account] = keychainLeser(account);
      } catch {
        throw new KeychainFehler(`Schlüsselbund-Eintrag ${account} ist nicht lesbar.`);
      }
    }
  }
  delete env.KD_OWNER_USER;
  if (definition.bezahlt) {
    if (!confirmPaid) throw new Error("KI-Eval braucht die ausdrückliche Lauf-Freigabe --confirm-paid.");
    env.KD_EVAL_JA = "1";
  }
  if (ownerApprovedServerBudget) env[OWNER_SERVER_BUDGET_ENV] = "1";
  if (effectiveOwnerCoreSix) {
    const targets = liesFilmwissenLiveTargets({
      einzel: env[FILMWISSEN_TARGET_ID_ENV],
      liste: env[FILMWISSEN_TARGET_IDS_ENV],
    });
    if (typeof env[FILMWISSEN_TARGET_IDS_ENV] === "string") {
      env[FILMWISSEN_TARGET_IDS_ENV] = targets
        .map((target) => `${target.namespace}:${target.kennung}`).join(",");
      delete env[FILMWISSEN_TARGET_ID_ENV];
    } else {
      env[FILMWISSEN_TARGET_ID_ENV] =
        `${targets[0].namespace}:${targets[0].kennung}`;
      delete env[FILMWISSEN_TARGET_IDS_ENV];
    }
    env[OWNER_CORE_SIX_GUARD_ENV] = OWNER_CORE_SIX_GUARD_VALUE;
  } else {
    delete env[FILMWISSEN_TARGET_ID_ENV];
    delete env[FILMWISSEN_TARGET_IDS_ENV];
  }
  if (effectiveOwnerCoreSix || radarWebsearchOnce || radarEntdeckenOnce) {
    const targetRoh = String(env.KD_RADAR_TARGET_ID || "").trim();
    const targetId = normalisiereStarkesRadarZiel(targetRoh);
    if (targetRoh && !targetId) {
      throw new Error("KD_RADAR_TARGET_ID ist kein starkes reales Ziel.");
    }
    if (!targetId && !effectiveOwnerCoreSix) {
      throw new Error("KD_RADAR_TARGET_ID fehlt oder ist kein starkes reales Ziel.");
    }
    if (targetId) env.KD_RADAR_TARGET_ID = targetId;
    else delete env.KD_RADAR_TARGET_ID;
    if (effectiveOwnerCoreSix) {
      env[RADAR_TARGET_AUTO_RESOLVE_ENV] = RADAR_TARGET_AUTO_RESOLVE_VALUE;
    }
    env[RADAR_WEBSEARCH_ONCE_ENV] = "keychain-budget-guard-v1";
  }
  if (entdeckenDailyOnce) env[ENTDECKEN_DAILY_ONCE_ENV] = "keychain-budget-guard-v1";
  if (entdeckenProviderProbeOnce) {
    env[ENTDECKEN_PROVIDER_PROBE_ONCE_ENV] = "keychain-budget-guard-v1";
  }
  if (entdeckenFactsOnce) env[ENTDECKEN_FACTS_ONCE_ENV] = "keychain-budget-guard-v1";
  if (radarEntdeckenOnce) env[ENTDECKEN_DAILY_ONCE_ENV] = "keychain-budget-guard-v1";
  if (effectiveOwnerCoreSix) env[ENTDECKEN_DAILY_ONCE_ENV] = "keychain-budget-guard-v1";
  return env;
}

export async function starteModus({
  modus,
  ambientEnv = process.env,
  lokaleKonfig = liesLokaleKonfig(),
  keychainLeser = liesKeychainEintrag,
  spawnImpl = spawn,
  confirmPaid = false,
  ownerApprovedServerBudget = false,
  radarWebsearchOnce = false,
  entdeckenDailyOnce = false,
  entdeckenProviderProbeOnce = false,
  entdeckenFactsOnce = false,
  radarEntdeckenOnce = false,
  requireCleanProbeProvenance = false,
}) {
  const definition = MODI[modus];
  if (!definition) throw new Error("Unbekannter Schlüsselbund-Lauf.");
  if (entdeckenDailyOnce) await pruefeEntdeckenDailyOnceProvenienz();
  if (entdeckenProviderProbeOnce) {
    await pruefeEntdeckenProviderProbeProvenienz({
      requireCleanVerifier: requireCleanProbeProvenance,
    });
  }
  const ownerCoreSix = modus === "ai-live" && ownerApprovedServerBudget
    && !radarWebsearchOnce && !entdeckenDailyOnce
    && !entdeckenProviderProbeOnce && !entdeckenFactsOnce && !radarEntdeckenOnce;
  const env = baueKindUmgebung({
    modus,
    ambientEnv,
    lokaleKonfig,
    keychainLeser,
    confirmPaid,
    ownerApprovedServerBudget,
    radarWebsearchOnce,
    entdeckenDailyOnce,
    entdeckenProviderProbeOnce,
    entdeckenFactsOnce,
    radarEntdeckenOnce,
    ownerCoreSix,
  });
  const gibLiveLaufFrei = ["ai-live", "ai-eval"].includes(modus)
    ? reserviereLiveLauf()
    : () => {};
  try {
    const code = await new Promise((resolveCode) => {
      const argv = radarWebsearchOnce
        ? definition.radarWebsearchOnceArgv
        : (entdeckenDailyOnce
          ? definition.entdeckenDailyOnceArgv
          : (entdeckenProviderProbeOnce
            ? definition.entdeckenProviderProbeOnceArgv
            : (entdeckenFactsOnce
              ? definition.entdeckenFactsOnceArgv
              : (radarEntdeckenOnce ? definition.radarEntdeckenOnceArgv : definition.argv))));
      const kind = spawnImpl(process.execPath, argv, {
        cwd: REPO_ROOT,
        env,
        stdio: "inherit",
        shell: false,
      });
      kind.once("error", () => resolveCode(EXIT_START));
      kind.once("exit", (code, signal) => {
        resolveCode(signal ? EXIT_START : (Number.isInteger(code) ? code : EXIT_START));
      });
    });
    return code;
  } finally {
    gibLiveLaufFrei();
  }
}

export async function main(
  argv = process.argv.slice(2),
  {
    ausgabe = console.log,
    fehlerAusgabe = console.error,
    keychainLeser = liesKeychainEintrag,
  } = {},
) {
  if (argv.length === 1 && argv[0] === "keychain-check") {
    try {
      keychainLeser(KEYCHAIN_ACCOUNTS.testa);
      keychainLeser(KEYCHAIN_ACCOUNTS.testb);
      ausgabe("Schlüsselbund bereit: beide begrenzten Testkonten sind verfügbar.");
      return 0;
    } catch (error) {
      fehlerAusgabe("SCHLUESSELBUND_FEHLT: Ein oder beide Testkonten sind nicht lesbar.");
      return EXIT_KEYCHAIN;
    }
  }

  const modus = argv[0];
  const rest = argv.slice(1);
  const bezahlt = MODI[modus]?.bezahlt === true;
  const ownerApprovedServerBudget = rest.includes(OWNER_SERVER_BUDGET_FLAG);
  const radarWebsearchOnce = rest.includes(RADAR_WEBSEARCH_ONCE_FLAG);
  const entdeckenDailyOnce = rest.includes(ENTDECKEN_DAILY_ONCE_FLAG);
  const entdeckenProviderProbeOnce = rest.includes(ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG);
  const entdeckenFactsOnce = rest.includes(ENTDECKEN_FACTS_ONCE_FLAG);
  const radarEntdeckenOnce = rest.includes(RADAR_ENTDECKEN_ONCE_FLAG);
  const entdeckenBefehlExakt = modus === "ai-live"
    && rest.length === 2
    && rest[0] === ENTDECKEN_DAILY_ONCE_FLAG
    && rest[1] === OWNER_SERVER_BUDGET_FLAG;
  const entdeckenProviderProbeBefehlExakt = modus === "ai-live"
    && rest.length === 2
    && rest[0] === ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG
    && rest[1] === OWNER_SERVER_BUDGET_FLAG;
  const entdeckenFactsBefehlExakt = modus === "ai-live"
    && rest.length === 2
    && rest[0] === ENTDECKEN_FACTS_ONCE_FLAG
    && rest[1] === OWNER_SERVER_BUDGET_FLAG;
  /* Der exakte Ownerbefehl ohne Sonderflag startet einen einzigen Smoke mit
     der Sechser-Kernphase sowie je genau einem Entdecken- und Radar-Pfad. */
  const ohneSonderflags = rest.filter((arg) => (
    arg !== OWNER_SERVER_BUDGET_FLAG && arg !== RADAR_WEBSEARCH_ONCE_FLAG
      && arg !== ENTDECKEN_DAILY_ONCE_FLAG && arg !== RADAR_ENTDECKEN_ONCE_FLAG
      && arg !== ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG
      && arg !== ENTDECKEN_FACTS_ONCE_FLAG
  ));
  const confirmPaid = bezahlt
    && ohneSonderflags.length === 1
    && ohneSonderflags[0] === "--confirm-paid";
  const flagErlaubt = !ownerApprovedServerBudget
    || ["ai-live", "ai-eval"].includes(modus);
  const radarFlagErlaubt = !radarWebsearchOnce || modus === "ai-live";
  const entdeckenFlagErlaubt = !entdeckenDailyOnce
    || (ownerApprovedServerBudget && entdeckenBefehlExakt);
  const entdeckenProviderProbeFlagErlaubt = !entdeckenProviderProbeOnce
    || (ownerApprovedServerBudget && entdeckenProviderProbeBefehlExakt);
  const entdeckenFactsFlagErlaubt = !entdeckenFactsOnce
    || (ownerApprovedServerBudget && entdeckenFactsBefehlExakt);
  const combinedFlagErlaubt = !radarEntdeckenOnce || modus === "ai-live";
  const liveSonderpfade = [
    radarWebsearchOnce, entdeckenDailyOnce, entdeckenProviderProbeOnce, entdeckenFactsOnce,
    radarEntdeckenOnce,
  ].filter(Boolean).length;
  const argumenteGueltig = bezahlt
    ? confirmPaid && ohneSonderflags.length === 1
    : ohneSonderflags.length === 0;
  if (!MODI[modus] || !flagErlaubt || !radarFlagErlaubt || !entdeckenFlagErlaubt
    || !entdeckenProviderProbeFlagErlaubt || !entdeckenFactsFlagErlaubt || !combinedFlagErlaubt
    || !argumenteGueltig || liveSonderpfade > 1
    || rest.filter((arg) => arg === OWNER_SERVER_BUDGET_FLAG).length > 1
    || rest.filter((arg) => arg === RADAR_WEBSEARCH_ONCE_FLAG).length > 1
    || rest.filter((arg) => arg === ENTDECKEN_DAILY_ONCE_FLAG).length > 1
    || rest.filter((arg) => arg === ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG).length > 1
    || rest.filter((arg) => arg === ENTDECKEN_FACTS_ONCE_FLAG).length > 1
    || rest.filter((arg) => arg === RADAR_ENTDECKEN_ONCE_FLAG).length > 1) {
    fehlerAusgabe(
      `Erlaubt: keychain-check | budget-check | ai-live [${RADAR_WEBSEARCH_ONCE_FLAG}|${ENTDECKEN_DAILY_ONCE_FLAG}|${ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG}|${ENTDECKEN_FACTS_ONCE_FLAG}|${RADAR_ENTDECKEN_ONCE_FLAG}] `
      + `[${OWNER_SERVER_BUDGET_FLAG}] | `
      + "profile-contract | "
      + `ai-eval --confirm-paid [${OWNER_SERVER_BUDGET_FLAG}] | rls`,
    );
    return EXIT_KONFIG;
  }

  try {
    return await starteModus({
      modus,
      keychainLeser,
      confirmPaid,
      ownerApprovedServerBudget,
      radarWebsearchOnce,
      entdeckenDailyOnce,
      entdeckenProviderProbeOnce,
      entdeckenFactsOnce,
      radarEntdeckenOnce,
      requireCleanProbeProvenance: entdeckenProviderProbeOnce,
    });
  } catch (error) {
    const keychain = error instanceof KeychainFehler;
    fehlerAusgabe(
      `${keychain ? "SCHLUESSELBUND_FEHLT" : "LIVE_KONFIG_FEHLT"}: `
      + `${error?.message || "Lauf konnte nicht vorbereitet werden."}`,
    );
    return keychain ? EXIT_KEYCHAIN : EXIT_KONFIG;
  }
}

const direktGestartet = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direktGestartet) {
  main().then((code) => { process.exitCode = code; });
}

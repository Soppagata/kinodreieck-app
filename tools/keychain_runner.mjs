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
  createPrivateProviderRawDirectory,
} from "./provider_raw_capture.mjs";

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
export const RADAR_ENTDECKEN_ONCE_FLAG = "--radar-entdecken-once";
export const ENTDECKEN_DAILY_ONCE_REQUEST_ENV = "KD_ENTDECKEN_DAILY_ONCE_REQUEST";
export const ENTDECKEN_DAILY_ONCE_ENV = "KD_ENTDECKEN_DAILY_ONCE_GUARD";

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
  "KD_FILMWISSEN_TARGET_ID",
]);

const VERBOTENE_LOKALE_NAMEN = new Set([
  "KD_TESTA_PASS",
  "KD_TESTB_PASS",
  "KD_OWNER_PASS",
  "KD_AI_AUTONOM_LIMIT_USD_CENT",
  OWNER_SERVER_BUDGET_ENV,
  RADAR_WEBSEARCH_ONCE_ENV,
  ENTDECKEN_DAILY_ONCE_REQUEST_ENV,
  ENTDECKEN_DAILY_ONCE_ENV,
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

const SKRIPT = (name) => resolve(REPO_ROOT, "tools", name);

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
      SKRIPT("ai_smoke.mjs"),
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

export function baueKindUmgebung({
  modus,
  ambientEnv = process.env,
  lokaleKonfig = liesLokaleKonfig(),
  keychainLeser = liesKeychainEintrag,
  confirmPaid = false,
  ownerApprovedServerBudget = false,
  radarWebsearchOnce = false,
  entdeckenDailyOnce = false,
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
      || radarWebsearchOnce || radarEntdeckenOnce)) {
    throw new Error("Der einmalige Entdecken-Lauf braucht den AI-Live-Pfad und die exakte Owner-Budgetfreigabe.");
  }
  if (radarEntdeckenOnce && (modus !== "ai-live" || !ownerApprovedServerBudget
      || radarWebsearchOnce || entdeckenDailyOnce)) {
    throw new Error("Der kombinierte Radar-/Entdecken-Lauf braucht den exklusiven AI-Live-Pfad und die exakte Owner-Budgetfreigabe.");
  }
  const effectiveOwnerCoreSix = ownerCoreSix
    || (modus === "ai-live" && ownerApprovedServerBudget
      && !radarWebsearchOnce && !entdeckenDailyOnce && !radarEntdeckenOnce);
  if (effectiveOwnerCoreSix && (modus !== "ai-live" || !ownerApprovedServerBudget
      || radarWebsearchOnce || entdeckenDailyOnce || radarEntdeckenOnce)) {
    throw new Error("Der Sechser-Einmallauf braucht den exklusiven AI-Live-Pfad und die exakte Owner-Budgetfreigabe.");
  }
  const ownerCredentialLane = modus === "ai-live"
    && (effectiveOwnerCoreSix || entdeckenDailyOnce || radarEntdeckenOnce);

  const env = harmloseBasis(ambientEnv);
  for (const name of OEFFENTLICHE_NAMEN) {
    const wert = ambientEnv?.[name] ?? lokaleKonfig?.[name];
    if (typeof wert === "string" && wert !== "") env[name] = wert;
  }
  if (!radarWebsearchOnce && !radarEntdeckenOnce) delete env.KD_RADAR_TARGET_ID;
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
    const target = String(env.KD_FILMWISSEN_TARGET_ID || "").trim();
    if (!/^(?:imdb|tmdb|wikidata):[^\s:]{1,150}$/i.test(target)) {
      throw new Error("KD_FILMWISSEN_TARGET_ID fehlt oder ist keine starke reale Filmkennung.");
    }
    env[OWNER_CORE_SIX_GUARD_ENV] = OWNER_CORE_SIX_GUARD_VALUE;
  } else {
    delete env.KD_FILMWISSEN_TARGET_ID;
  }
  if (radarWebsearchOnce || radarEntdeckenOnce) {
    const targetId = String(env.KD_RADAR_TARGET_ID || "").trim();
    if (!/^[a-z][a-z0-9_-]{1,31}:[^\s]{1,150}$/i.test(targetId)
        || /^(?:fixture|synthetic):/i.test(targetId)) {
      throw new Error("KD_RADAR_TARGET_ID fehlt oder ist kein starkes reales Ziel.");
    }
    env[RADAR_WEBSEARCH_ONCE_ENV] = "keychain-budget-guard-v1";
  }
  if (entdeckenDailyOnce) env[ENTDECKEN_DAILY_ONCE_ENV] = "keychain-budget-guard-v1";
  if (radarEntdeckenOnce) env[ENTDECKEN_DAILY_ONCE_ENV] = "keychain-budget-guard-v1";
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
  radarEntdeckenOnce = false,
  rawCaptureDirectoryFactory = createPrivateProviderRawDirectory,
  ausgabe = console.log,
}) {
  const definition = MODI[modus];
  if (!definition) throw new Error("Unbekannter Schlüsselbund-Lauf.");
  const ownerCoreSix = modus === "ai-live" && ownerApprovedServerBudget
    && !radarWebsearchOnce && !entdeckenDailyOnce && !radarEntdeckenOnce;
  const env = baueKindUmgebung({
    modus,
    ambientEnv,
    lokaleKonfig,
    keychainLeser,
    confirmPaid,
    ownerApprovedServerBudget,
    radarWebsearchOnce,
    entdeckenDailyOnce,
    radarEntdeckenOnce,
    ownerCoreSix,
  });
  const gibLiveLaufFrei = ["ai-live", "ai-eval"].includes(modus)
    ? reserviereLiveLauf()
    : () => {};
  try {
    let rawCaptureDirectory = null;
    if (ownerCoreSix || radarEntdeckenOnce) {
      rawCaptureDirectory = rawCaptureDirectoryFactory();
      env[PROVIDER_RAW_CAPTURE_DIR_ENV] = rawCaptureDirectory;
      env[PROVIDER_RAW_CAPTURE_GUARD_ENV] = PROVIDER_RAW_CAPTURE_GUARD_VALUE;
    }
    const code = await new Promise((resolveCode) => {
      const argv = radarWebsearchOnce
        ? definition.radarWebsearchOnceArgv
        : (entdeckenDailyOnce
          ? definition.entdeckenDailyOnceArgv
          : (radarEntdeckenOnce ? definition.radarEntdeckenOnceArgv : definition.argv));
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
    if (rawCaptureDirectory) {
      ausgabe(`Privates Provider-Rohpayload-Verzeichnis: ${rawCaptureDirectory}`);
    }
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
  const radarEntdeckenOnce = rest.includes(RADAR_ENTDECKEN_ONCE_FLAG);
  /* Der exakte Ownerbefehl ohne Sonderflag ist der einmalige Sechserlauf.
     Entdecken bleibt nur ueber seinen internen Remote-Fenster-Request oder den
     expliziten kombinierten Radar-/Entdecken-Modus erreichbar. */
  const entdeckenDailyOnce = process.env[ENTDECKEN_DAILY_ONCE_REQUEST_ENV]
    === "remote-window-v1";
  const ohneSonderflags = rest.filter((arg) => (
    arg !== OWNER_SERVER_BUDGET_FLAG && arg !== RADAR_WEBSEARCH_ONCE_FLAG
      && arg !== RADAR_ENTDECKEN_ONCE_FLAG
  ));
  const confirmPaid = bezahlt
    && ohneSonderflags.length === 1
    && ohneSonderflags[0] === "--confirm-paid";
  const flagErlaubt = !ownerApprovedServerBudget
    || ["ai-live", "ai-eval"].includes(modus);
  const radarFlagErlaubt = !radarWebsearchOnce || modus === "ai-live";
  const combinedFlagErlaubt = !radarEntdeckenOnce || modus === "ai-live";
  const argumenteGueltig = bezahlt
    ? confirmPaid && ohneSonderflags.length === 1
    : ohneSonderflags.length === 0;
  if (!MODI[modus] || !flagErlaubt || !radarFlagErlaubt || !combinedFlagErlaubt
    || !argumenteGueltig || (radarWebsearchOnce && radarEntdeckenOnce)
    || rest.filter((arg) => arg === OWNER_SERVER_BUDGET_FLAG).length > 1
    || rest.filter((arg) => arg === RADAR_WEBSEARCH_ONCE_FLAG).length > 1
    || rest.filter((arg) => arg === RADAR_ENTDECKEN_ONCE_FLAG).length > 1) {
    fehlerAusgabe(
      `Erlaubt: keychain-check | budget-check | ai-live [${RADAR_WEBSEARCH_ONCE_FLAG}|${RADAR_ENTDECKEN_ONCE_FLAG}] `
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
      radarEntdeckenOnce,
      ausgabe,
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

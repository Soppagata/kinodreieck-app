#!/usr/bin/env node
/* Sichere lokale Brücke vom macOS-Schlüsselbund zu den Infrastrukturtests.
   ==========================================================================
   Die beiden Testpasswörter bleiben im Login-Schlüsselbund. Dieses Programm
   liest nur die fest benannten Einträge und reicht sie ausschließlich an
   fest verdrahtete Testwege weiter. Es gibt keine freie Befehlsausführung.

   Öffentliche Zielwerte liegen in `.env.live.local`; Geheimnisse und
   Kostenfreigaben sind dort ausdrücklich verboten.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const KEYCHAIN_SERVICE = "at.kinodreieck.codex.live-tests.shared";
export const KEYCHAIN_ACCOUNTS = Object.freeze({
  testa: "KD_TESTA_PASS",
  testb: "KD_TESTB_PASS",
});

export const EXIT_KONFIG = 64;
export const EXIT_KEYCHAIN = 73;
export const EXIT_START = 70;

const DATEI = fileURLToPath(import.meta.url);
export const REPO_ROOT = resolve(dirname(DATEI), "..");
export const LOKALE_KONFIG = resolve(REPO_ROOT, ".env.live.local");

const OEFFENTLICHE_NAMEN = new Set([
  "KD_SB_URL",
  "KD_SB_ANON",
  "KD_TESTA_USER",
  "KD_TESTB_USER",
  "KD_MAIL_DOMAIN",
  "KD_AI_FUNKTION",
  "KD_ORIGIN",
]);

const VERBOTENE_LOKALE_NAMEN = new Set([
  "KD_TESTA_PASS",
  "KD_TESTB_PASS",
  "KD_AI_AUTONOM_LIMIT_USD_CENT",
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
}) {
  const definition = MODI[modus];
  if (!definition) throw new Error("Unbekannter Schlüsselbund-Lauf.");

  const env = harmloseBasis(ambientEnv);
  for (const name of OEFFENTLICHE_NAMEN) {
    const wert = ambientEnv?.[name] ?? lokaleKonfig?.[name];
    if (typeof wert === "string" && wert !== "") env[name] = wert;
  }
  pruefeOeffentlicheKonfig(env);

  for (const account of definition.accounts) {
    try {
      env[account] = keychainLeser(account);
    } catch {
      throw new KeychainFehler(`Schlüsselbund-Eintrag ${account} ist nicht lesbar.`);
    }
  }
  if (definition.bezahlt) {
    if (!confirmPaid) throw new Error("KI-Eval braucht die ausdrückliche Lauf-Freigabe --confirm-paid.");
    env.KD_EVAL_JA = "1";
  }
  return env;
}

export async function starteModus({
  modus,
  ambientEnv = process.env,
  lokaleKonfig = liesLokaleKonfig(),
  keychainLeser = liesKeychainEintrag,
  spawnImpl = spawn,
  confirmPaid = false,
}) {
  const definition = MODI[modus];
  if (!definition) throw new Error("Unbekannter Schlüsselbund-Lauf.");
  const env = baueKindUmgebung({
    modus,
    ambientEnv,
    lokaleKonfig,
    keychainLeser,
    confirmPaid,
  });

  return await new Promise((resolveCode) => {
    const kind = spawnImpl(process.execPath, definition.argv, {
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
  const confirmPaid = modus === "ai-eval"
    && rest.length === 1
    && rest[0] === "--confirm-paid";
  if (!MODI[modus] || (rest.length > 0 && !confirmPaid)) {
    fehlerAusgabe(
      "Erlaubt: keychain-check | budget-check | ai-live | "
      + "profile-contract | ai-eval --confirm-paid | rls",
    );
    return EXIT_KONFIG;
  }

  try {
    return await starteModus({ modus, keychainLeser, confirmPaid });
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

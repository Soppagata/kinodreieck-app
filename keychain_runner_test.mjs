import { EventEmitter } from "node:events";
import {
  EXIT_KEYCHAIN,
  EXIT_KONFIG,
  KEYCHAIN_ACCOUNTS,
  KEYCHAIN_SERVICE,
  MODI,
  REPO_ROOT,
  baueKindUmgebung,
  liesKeychainEintrag,
  main,
  parseLokaleKonfig,
  starteModus,
} from "./tools/keychain_runner.mjs";

let bestanden = 0;
let gesamt = 0;
function pruefe(name, bedingung) {
  gesamt++;
  const ok = typeof bedingung === "function" ? bedingung() : bedingung;
  if (ok) bestanden++;
  else console.error("FEHLER:", name);
}

const PUBLIC = {
  KD_SB_URL: "https://projekt-ref.supabase.co",
  KD_SB_ANON: "sb_publishable_test_1234567890",
  KD_ORIGIN: "https://staging.kinodreieck.at",
};
const SONDERGEHEIMNIS = " -x ; $() `ticks` \"quote\" 'leer' \nzweite-zeile";

{
  const rufe = [];
  const wert = liesKeychainEintrag(KEYCHAIN_ACCOUNTS.testa, {
    platform: "darwin",
    securityRun(programm, argv, optionen) {
      rufe.push({ programm, argv, optionen });
      return { status: 0, stdout: SONDERGEHEIMNIS + "\n", stderr: "" };
    },
  });
  pruefe("security wird über den absoluten Pfad gerufen", rufe[0].programm === "/usr/bin/security");
  pruefe("security erhält nur ein Argumentarray", Array.isArray(rufe[0].argv)
    && rufe[0].argv.join("|") === `find-generic-password|-s|${KEYCHAIN_SERVICE}|-a|KD_TESTA_PASS|-w`);
  pruefe("security läuft ohne Shell", rufe[0].optionen.shell === false);
  pruefe("genau der angehängte Zeilenabschluss wird entfernt", wert === SONDERGEHEIMNIS);
}

{
  let meldung = "";
  try {
    liesKeychainEintrag(KEYCHAIN_ACCOUNTS.testa, {
      platform: "darwin",
      securityRun: () => ({
        status: 44,
        stdout: "",
        stderr: "Rohfehler mit " + SONDERGEHEIMNIS,
      }),
    });
  } catch (error) {
    meldung = String(error.message);
  }
  pruefe("Keychain-Rohfehler und Secret werden nie weitergegeben",
    meldung.includes("KD_TESTA_PASS")
      && !meldung.includes(SONDERGEHEIMNIS)
      && !meldung.includes("Rohfehler"));
}

{
  const config = parseLokaleKonfig(`
    # nur öffentliche Werte
    KD_SB_URL=${PUBLIC.KD_SB_URL}
    KD_SB_ANON="${PUBLIC.KD_SB_ANON}"
    KD_ORIGIN='${PUBLIC.KD_ORIGIN}'
  `);
  pruefe("öffentliche lokale Konfiguration wird gelesen",
    config.KD_SB_URL === PUBLIC.KD_SB_URL
      && config.KD_SB_ANON === PUBLIC.KD_SB_ANON
      && config.KD_ORIGIN === PUBLIC.KD_ORIGIN);
  for (const name of ["KD_TESTA_PASS", "KD_AI_AUTONOM_LIMIT_USD_CENT", "KD_EVAL_JA"]) {
    let abgelehnt = false;
    try { parseLokaleKonfig(`${name}=verboten`); } catch { abgelehnt = true; }
    pruefe(`${name} ist in der lokalen Datei verboten`, abgelehnt);
  }
}

{
  const gelesen = [];
  const env = baueKindUmgebung({
    modus: "ai-live",
    ambientEnv: {
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "niemals-vererben",
      SUPABASE_SERVICE_ROLE_KEY: "niemals-vererben",
      CLOUDFLARE_API_TOKEN: "niemals-vererben",
      KD_TESTA_PASS: "ambient-ist-nicht-vertrauensquelle",
      KD_AI_AUTONOM_LIMIT_USD_CENT: "999999",
      KD_EVAL_JA: "1",
    },
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      gelesen.push(account);
      return SONDERGEHEIMNIS;
    },
  });
  pruefe("AI-Lauf liest nur Testkonto A", gelesen.join(",") === KEYCHAIN_ACCOUNTS.testa);
  pruefe("Keychain überschreibt ein ambient gesetztes Testpasswort",
    env.KD_TESTA_PASS === SONDERGEHEIMNIS);
  pruefe("hochprivilegierte Ambient-Secrets werden nicht vererbt",
    !("ANTHROPIC_API_KEY" in env)
      && !("SUPABASE_SERVICE_ROLE_KEY" in env)
      && !("CLOUDFLARE_API_TOKEN" in env));
  pruefe("Budgetoverride und Eval-Freigabe werden nicht ambient vererbt",
    !("KD_AI_AUTONOM_LIMIT_USD_CENT" in env) && !("KD_EVAL_JA" in env));
}

{
  const gelesen = [];
  const env = baueKindUmgebung({
    modus: "rls",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      gelesen.push(account);
      return account + "-geheim";
    },
  });
  pruefe("RLS liest ausschließlich A und B",
    gelesen.join(",") === `${KEYCHAIN_ACCOUNTS.testa},${KEYCHAIN_ACCOUNTS.testb}`);
  pruefe("RLS erhält beide Passwörter nur im Kind-Env",
    env.KD_TESTA_PASS === "KD_TESTA_PASS-geheim"
      && env.KD_TESTB_PASS === "KD_TESTB_PASS-geheim");
}

{
  let ohneFreigabe = false;
  try {
    baueKindUmgebung({
      modus: "ai-eval",
      ambientEnv: {},
      lokaleKonfig: PUBLIC,
      keychainLeser: () => SONDERGEHEIMNIS,
    });
  } catch { ohneFreigabe = true; }
  pruefe("bezahltes Eval startet ohne exakte Freigabe nicht", ohneFreigabe);

  const env = baueKindUmgebung({
    modus: "ai-eval",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser: () => SONDERGEHEIMNIS,
    confirmPaid: true,
  });
  pruefe("exakte Eval-Freigabe wird nur für diesen Kindprozess gesetzt", env.KD_EVAL_JA === "1");
}

{
  const starts = [];
  const spawnImpl = (programm, argv, optionen) => {
    starts.push({ programm, argv, optionen });
    const kind = new EventEmitter();
    queueMicrotask(() => kind.emit("exit", 75, null));
    return kind;
  };
  const code = await starteModus({
    modus: "ai-live",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser: () => SONDERGEHEIMNIS,
    spawnImpl,
  });
  pruefe("Kindprozess ist fest verdrahtet und läuft ohne Shell",
    starts.length === 1
      && starts[0].programm === process.execPath
      && starts[0].optionen.cwd === REPO_ROOT
      && starts[0].optionen.shell === false
      && starts[0].argv.join("|") === MODI["ai-live"].argv.join("|"));
  pruefe("Secret erscheint nie in Programm oder argv",
    !starts[0].programm.includes(SONDERGEHEIMNIS)
      && !starts[0].argv.join(" ").includes(SONDERGEHEIMNIS));
  pruefe("Budget-Stopcode 75 wird unverändert propagiert", code === 75);
}

{
  const starts = [];
  const spawnImpl = (programm, argv, optionen) => {
    starts.push({ programm, argv, optionen });
    const kind = new EventEmitter();
    queueMicrotask(() => kind.emit("exit", 0, null));
    return kind;
  };
  const code = await starteModus({
    modus: "profile-contract",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser: () => SONDERGEHEIMNIS,
    spawnImpl,
  });
  pruefe("Profil-Remoteprobe ist fest hinter dem Budgetwächter verdrahtet",
    code === 0
      && starts.length === 1
      && starts[0].argv.join("|") === MODI["profile-contract"].argv.join("|")
      && starts[0].argv.some((arg) => arg.endsWith("/ai_budget_guard.mjs"))
      && starts[0].argv.some((arg) => arg.endsWith("/profile_extract_contract.mjs")));
}

{
  const aus = [];
  const err = [];
  const code = await main(["keychain-check"], {
    ausgabe: (x) => aus.push(String(x)),
    fehlerAusgabe: (x) => err.push(String(x)),
    keychainLeser: () => SONDERGEHEIMNIS,
  });
  pruefe("reiner Schlüsselbundcheck startet keinen Test", code === 0 && aus.length === 1);
  pruefe("reiner Schlüsselbundcheck gibt kein Secret aus",
    !aus.join("").includes(SONDERGEHEIMNIS) && !err.join("").includes(SONDERGEHEIMNIS));
}

{
  const aus = [];
  const err = [];
  const code = await main(["keychain-check"], {
    ausgabe: (x) => aus.push(String(x)),
    fehlerAusgabe: (x) => err.push(String(x)),
    keychainLeser: () => { throw new Error("Rohfehler " + SONDERGEHEIMNIS); },
  });
  pruefe("fehlender Keychain-Eintrag stoppt fail-closed", code === EXIT_KEYCHAIN);
  pruefe("Check gibt auch bei unerwartetem Leserfehler kein Secret aus",
    !aus.join("").includes(SONDERGEHEIMNIS) && !err.join("").includes(SONDERGEHEIMNIS));
}

{
  const err = [];
  const code = await main(["ai-live", "--", "beliebig"], {
    fehlerAusgabe: (x) => err.push(String(x)),
  });
  pruefe("freie oder zusätzliche Argumente werden abgelehnt", code === EXIT_KONFIG);
}

console.log(`KEYCHAIN-RUNNER-TEST: ${bestanden}/${gesamt}`);
if (bestanden !== gesamt) process.exit(1);

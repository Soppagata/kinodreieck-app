import { EventEmitter } from "node:events";
import {
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  EXIT_KEYCHAIN,
  EXIT_KONFIG,
  ENTDECKEN_DAILY_ONCE_ENV,
  ENTDECKEN_DAILY_ONCE_REQUEST_ENV,
  KEYCHAIN_ACCOUNTS,
  KeychainFehler,
  KEYCHAIN_SERVICE,
  LIVE_LOCK_PATH,
  MODI,
  OWNER_SERVER_BUDGET_ENV,
  OWNER_SERVER_BUDGET_FLAG,
  OWNER_CORE_SIX_GUARD_ENV,
  OWNER_CORE_SIX_GUARD_VALUE,
  PROVIDER_RAW_CAPTURE_DIR_ENV,
  PROVIDER_RAW_CAPTURE_GUARD_ENV,
  PROVIDER_RAW_CAPTURE_GUARD_VALUE,
  RADAR_ENTDECKEN_ONCE_FLAG,
  RADAR_WEBSEARCH_ONCE_ENV,
  RADAR_WEBSEARCH_ONCE_FLAG,
  REPO_ROOT,
  baueKindUmgebung,
  liesKeychainEintrag,
  main,
  parseLokaleKonfig,
  reserviereLiveLauf,
  starteModus,
} from "./tools/keychain_runner.mjs";
import {
  assertProviderCaptureCost,
  captureProviderRawResponse,
  createPrivateProviderRawDirectory,
} from "./tools/provider_raw_capture.mjs";

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
  KD_TESTA_USER: "testa",
  KD_OWNER_USER: "owner-lokal",
  KD_ORIGIN: "https://staging.kinodreieck.at",
  KD_RADAR_TARGET_ID: "imdb:tt0137523",
  KD_FILMWISSEN_TARGET_ID: "imdb:tt0081505",
};
const SONDERGEHEIMNIS = " -x ; $() `ticks` \"quote\" 'leer' \nzweite-zeile";
const OWNER_GEHEIMNIS = `owner:${SONDERGEHEIMNIS}`;

{
  const lockPath = `${LIVE_LOCK_PATH}.${process.pid}.test`;
  const gibFrei = reserviereLiveLauf({ lockPath, pid: 111 });
  let parallelGesperrt = false;
  try {
    reserviereLiveLauf({ lockPath, pid: 222 });
  } catch { parallelGesperrt = true; }
  gibFrei();
  pruefe("prozessuebergreifender Live-Lock sperrt einen parallelen zweiten Lauf",
    parallelGesperrt);
}

{
  const lockPath = `${LIVE_LOCK_PATH}.${process.pid}.stale-test`;
  writeFileSync(lockPath, "999999", { encoding: "utf8", mode: 0o600 });
  let staleGesperrt = false;
  try { reserviereLiveLauf({ lockPath, pid: 333 }); } catch { staleGesperrt = true; }
  const unveraendert = readFileSync(lockPath, "utf8") === "999999";
  unlinkSync(lockPath);
  pruefe("auch ein mutmasslich alter Lock stoppt fail-closed und wird nie autonom geloescht",
    staleGesperrt && unveraendert);
}

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
  const rufe = [];
  const wert = liesKeychainEintrag(KEYCHAIN_ACCOUNTS.owner, {
    platform: "darwin",
    securityRun(programm, argv, optionen) {
      rufe.push({ programm, argv, optionen });
      return { status: 0, stdout: OWNER_GEHEIMNIS + "\n", stderr: "" };
    },
  });
  pruefe("Ownerpasswort ist als eng benannter Account desselben Services erlaubt",
    rufe.length === 1
      && rufe[0].programm === "/usr/bin/security"
      && rufe[0].argv.join("|")
        === `find-generic-password|-s|${KEYCHAIN_SERVICE}|-a|KD_OWNER_PASS|-w`
      && rufe[0].optionen.shell === false
      && wert === OWNER_GEHEIMNIS);
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
    KD_OWNER_USER=${PUBLIC.KD_OWNER_USER}
    KD_ORIGIN='${PUBLIC.KD_ORIGIN}'
  `);
  pruefe("öffentliche lokale Konfiguration wird gelesen",
    config.KD_SB_URL === PUBLIC.KD_SB_URL
      && config.KD_SB_ANON === PUBLIC.KD_SB_ANON
      && config.KD_OWNER_USER === PUBLIC.KD_OWNER_USER
      && config.KD_ORIGIN === PUBLIC.KD_ORIGIN);
  for (const name of [
    "KD_TESTA_PASS", "KD_OWNER_PASS", "KD_AI_AUTONOM_LIMIT_USD_CENT", OWNER_SERVER_BUDGET_ENV,
    ENTDECKEN_DAILY_ONCE_REQUEST_ENV, ENTDECKEN_DAILY_ONCE_ENV,
    OWNER_CORE_SIX_GUARD_ENV, PROVIDER_RAW_CAPTURE_DIR_ENV,
    PROVIDER_RAW_CAPTURE_GUARD_ENV, "KD_EVAL_JA",
  ]) {
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
      KD_RLS_ACCESS_MODE: "missing",
    },
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      gelesen.push(account);
      return SONDERGEHEIMNIS;
    },
  });
  pruefe("AI-Lauf liest nur Testkonto A", gelesen.join(",") === KEYCHAIN_ACCOUNTS.testa);
  pruefe("Normaler AI-Lauf bleibt vollständig auf Testkonto A",
    env.KD_TESTA_USER === PUBLIC.KD_TESTA_USER
      && env.KD_TESTA_PASS === SONDERGEHEIMNIS
      && !("KD_OWNER_USER" in env)
      && !("KD_OWNER_PASS" in env));
  pruefe("hochprivilegierte Ambient-Secrets werden nicht vererbt",
    !("ANTHROPIC_API_KEY" in env)
      && !("SUPABASE_SERVICE_ROLE_KEY" in env)
      && !("CLOUDFLARE_API_TOKEN" in env));
  pruefe("Budgetoverride und Eval-Freigabe werden nicht ambient vererbt",
    !("KD_AI_AUTONOM_LIMIT_USD_CENT" in env)
      && !(OWNER_SERVER_BUDGET_ENV in env) && !("KD_EVAL_JA" in env));
  pruefe("RLS-Modus wird nicht an KI-Läufe vererbt",
    !("KD_RLS_ACCESS_MODE" in env));
}

{
  const directory = createPrivateProviderRawDirectory();
  const body = {
    ok: true,
    providerDiagnostic: { rawResponse: '{"private":"provider-raw"}' },
  };
  const written = captureProviderRawResponse(body, "01-intelligent-search.json", {
    env: {
      [PROVIDER_RAW_CAPTURE_DIR_ENV]: directory,
      [PROVIDER_RAW_CAPTURE_GUARD_ENV]: PROVIDER_RAW_CAPTURE_GUARD_VALUE,
    },
    repoRoot: REPO_ROOT,
  });
  pruefe("Providerrohtext wird ausserhalb des Repos exakt mit Modus 0600 geschrieben",
    readFileSync(written.filePath, "utf8") === '{"private":"provider-raw"}'
      && (statSync(written.filePath).mode & 0o777) === 0o600
      && (statSync(directory).mode & 0o777) === 0o700
      && !written.filePath.startsWith(REPO_ROOT + "/")
      && written.providerRequests === 1
      && written.fachstatus === null
      && written.fachgrund === null);
  pruefe("Providerdiagnose wird vor jeder weiteren Antwortverarbeitung entfernt",
    !("providerDiagnostic" in body));
  unlinkSync(written.filePath);
  rmdirSync(directory);
}

{
  const directory = createPrivateProviderRawDirectory();
  const basis = {
    ok: true,
    task: "filmwissen-synthese",
    vorgangId: "11111111-1111-4111-8111-111111111111",
  };
  const fachstatusAntworten = [
    { ...basis, data: { status: "neuer_fachstatus", grund: "quellen-vor-ki-stopp" } },
    { ...basis, data: { status: "mehr\nzeilig", grund: "nicht sicher loggbar" } },
  ];
  const ergebnisse = fachstatusAntworten.map((body) => captureProviderRawResponse(
    body,
    "04-filmwissen-synthese.json",
    {
      env: {
        [PROVIDER_RAW_CAPTURE_DIR_ENV]: directory,
        [PROVIDER_RAW_CAPTURE_GUARD_ENV]: PROVIDER_RAW_CAPTURE_GUARD_VALUE,
      },
      repoRoot: REPO_ROOT,
      responseStatus: 200,
      expectedTask: basis.task,
      expectedVorgangId: basis.vorgangId,
    },
  ));
  pruefe("Jede erfolgreiche Filmwissen-Nullproviderhülle wird statusunabhängig sicher diagnostiziert",
    ergebnisse[0].fachstatus === "neuer_fachstatus"
      && ergebnisse[0].fachgrund === "quellen-vor-ki-stopp"
      && ergebnisse[1].fachstatus === "unbekannt"
      && ergebnisse[1].fachgrund === null
      && ergebnisse.every((ergebnis) => ergebnis.providerRequests === 0
        && ergebnis.filePath === null
        && ergebnis.bytes === 0)
      && assertProviderCaptureCost(ergebnisse[0], 0) === ergebnisse[0]);

  const kostenAntwortOhneRohpayloadGesperrt = [null, { kostenUsdCent: 0.1 }]
    .every((verbrauch) => {
      try {
      captureProviderRawResponse(
        {
          ...basis,
          data: { status: "beliebig" },
          verbrauch,
        },
        "04-filmwissen-synthese.json",
        {
          env: {
            [PROVIDER_RAW_CAPTURE_DIR_ENV]: directory,
            [PROVIDER_RAW_CAPTURE_GUARD_ENV]: PROVIDER_RAW_CAPTURE_GUARD_VALUE,
          },
          repoRoot: REPO_ROOT,
          responseStatus: 200,
          expectedTask: basis.task,
          expectedVorgangId: basis.vorgangId,
        },
      );
        return false;
      } catch { return true; }
    });
  let gemesseneKostenOhneRohpayloadGesperrt = false;
  try { assertProviderCaptureCost(ergebnisse[0], 0.0001); }
  catch { gemesseneKostenOhneRohpayloadGesperrt = true; }
  pruefe("Verbrauchshülle oder gemessene Kosten ohne Providerrohpayload bleiben fail-closed",
    kostenAntwortOhneRohpayloadGesperrt && gemesseneKostenOhneRohpayloadGesperrt);
  rmdirSync(directory);
}

{
  const gelesen = [];
  const env = baueKindUmgebung({
    modus: "ai-live",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser: (account) => { gelesen.push(account); return OWNER_GEHEIMNIS; },
    ownerApprovedServerBudget: true,
  });
  pruefe("exakte Owner-Freigabe bindet den Sechserlauf an Owner, Budget und starke Filmkennung",
    env[OWNER_SERVER_BUDGET_ENV] === "1"
      && env[OWNER_CORE_SIX_GUARD_ENV] === OWNER_CORE_SIX_GUARD_VALUE
      && env.KD_FILMWISSEN_TARGET_ID === PUBLIC.KD_FILMWISSEN_TARGET_ID
      && env.KD_TESTA_USER === PUBLIC.KD_OWNER_USER
      && env.KD_TESTA_PASS === OWNER_GEHEIMNIS
      && gelesen.join(",") === KEYCHAIN_ACCOUNTS.owner
      && !("KD_AI_AUTONOM_LIMIT_USD_CENT" in env));
  let falscherModus = false;
  try {
    baueKindUmgebung({
      modus: "rls", ambientEnv: {}, lokaleKonfig: PUBLIC,
      keychainLeser: () => SONDERGEHEIMNIS, ownerApprovedServerBudget: true,
    });
  } catch { falscherModus = true; }
  pruefe("Owner-Budgetfreigabe ist für nicht bezahlende Fremdmodi gesperrt", falscherModus);

  let budgetcheckGesperrt = false;
  try {
    baueKindUmgebung({
      modus: "budget-check", ambientEnv: {}, lokaleKonfig: PUBLIC,
      keychainLeser: () => SONDERGEHEIMNIS, ownerApprovedServerBudget: true,
    });
  } catch { budgetcheckGesperrt = true; }
  pruefe("Owner-Budgetfreigabe kann auch nicht an einen reinen Budgetcheck gehaengt werden",
    budgetcheckGesperrt);
}

{
  const gelesen = [];
  const env = baueKindUmgebung({
    modus: "ai-live",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      gelesen.push(account);
      return account === KEYCHAIN_ACCOUNTS.owner ? OWNER_GEHEIMNIS : SONDERGEHEIMNIS;
    },
    ownerApprovedServerBudget: true,
    entdeckenDailyOnce: true,
  });
  pruefe("Ownerpflichtiger Entdecken-Lauf liest ausschließlich den Owner-Account",
    gelesen.join(",") === KEYCHAIN_ACCOUNTS.owner);
  pruefe("Owner-Credentials werden nur auf die bestehende TestA-Kindschnittstelle gemappt",
    env.KD_TESTA_USER === PUBLIC.KD_OWNER_USER
      && env.KD_TESTA_PASS === OWNER_GEHEIMNIS
      && !("KD_OWNER_USER" in env)
      && !("KD_OWNER_PASS" in env));
}

{
  const ohneOwnerUser = { ...PUBLIC };
  delete ohneOwnerUser.KD_OWNER_USER;
  let keychainGelesen = false;
  let fehlermeldung = "";
  try {
    baueKindUmgebung({
      modus: "ai-live",
      ambientEnv: {},
      lokaleKonfig: ohneOwnerUser,
      keychainLeser: () => { keychainGelesen = true; return OWNER_GEHEIMNIS; },
      ownerApprovedServerBudget: true,
      entdeckenDailyOnce: true,
    });
  } catch (error) { fehlermeldung = String(error?.message || ""); }
  pruefe("Ownerpfad stoppt bei fehlendem öffentlichen Owner-Nutzer vor dem Keychain-Read",
    fehlermeldung === "KD_OWNER_USER fehlt oder ist ungültig." && !keychainGelesen);
}

{
  let fehler = null;
  try {
    baueKindUmgebung({
      modus: "ai-live",
      ambientEnv: {},
      lokaleKonfig: PUBLIC,
      keychainLeser: () => { throw new Error(`Rohfehler ${OWNER_GEHEIMNIS}`); },
      ownerApprovedServerBudget: true,
      radarEntdeckenOnce: true,
    });
  } catch (error) { fehler = error; }
  pruefe("Ownerpfad stoppt bei fehlendem Owner-Keychain-Eintrag sanitisiert",
    fehler instanceof KeychainFehler
      && String(fehler.message).includes(KEYCHAIN_ACCOUNTS.owner)
      && !String(fehler.message).includes(OWNER_GEHEIMNIS)
      && !String(fehler.message).includes("Rohfehler"));
}

{
  let ohneOwnerFreigabeGesperrt = false;
  try {
    baueKindUmgebung({
      modus: "ai-live",
      ambientEnv: {},
      lokaleKonfig: PUBLIC,
      keychainLeser: () => SONDERGEHEIMNIS,
      entdeckenDailyOnce: true,
    });
  } catch { ohneOwnerFreigabeGesperrt = true; }
  pruefe("Entdecken-Einmallauf ist ohne exakte Owner-Budgetfreigabe gesperrt",
    ohneOwnerFreigabeGesperrt);
}

{
  let ohneOwnerFreigabeGesperrt = false;
  try {
    baueKindUmgebung({
      modus: "ai-live",
      ambientEnv: {},
      lokaleKonfig: PUBLIC,
      keychainLeser: () => SONDERGEHEIMNIS,
      radarEntdeckenOnce: true,
    });
  } catch { ohneOwnerFreigabeGesperrt = true; }
  pruefe("Kombinierter Produkt-Smoke ist ohne exakte Owner-Budgetfreigabe gesperrt",
    ohneOwnerFreigabeGesperrt);
}

{
  const gelesen = [];
  const env = baueKindUmgebung({
    modus: "rls",
    ambientEnv: { KD_RLS_ACCESS_MODE: " InAcTiVe " },
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
  pruefe("RLS erhält den validierten Access-Modus im Kind-Env",
    env.KD_RLS_ACCESS_MODE === "inactive");

  let ungueltigerModusGesperrt = false;
  try {
    baueKindUmgebung({
      modus: "rls",
      ambientEnv: { KD_RLS_ACCESS_MODE: "irgendwas" },
      lokaleKonfig: PUBLIC,
      keychainLeser: () => SONDERGEHEIMNIS,
    });
  } catch { ungueltigerModusGesperrt = true; }
  pruefe("RLS-Runner sperrt einen unbekannten Access-Modus vor dem Start",
    ungueltigerModusGesperrt);
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
  const gelesen = [];
  const spawnImpl = (programm, argv, optionen) => {
    starts.push({ programm, argv, optionen });
    const kind = new EventEmitter();
    queueMicrotask(() => kind.emit("exit", 0, null));
    return kind;
  };
  const code = await starteModus({
    modus: "ai-live",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      gelesen.push(account);
      return account === KEYCHAIN_ACCOUNTS.owner ? OWNER_GEHEIMNIS : SONDERGEHEIMNIS;
    },
    spawnImpl,
    ownerApprovedServerBudget: true,
    rawCaptureDirectoryFactory: () => "/private/tmp/keychain-runner-core-six-test",
    ausgabe: () => {},
  });
  pruefe("Exakte Owner-Variante startet den Sechserlauf hinter dem Budgetwächter",
    code === 0
      && starts.length === 1
      && starts[0].argv.join("|") === MODI["ai-live"].argv.join("|")
      && starts[0].optionen.env[OWNER_CORE_SIX_GUARD_ENV] === OWNER_CORE_SIX_GUARD_VALUE
      && starts[0].optionen.env[PROVIDER_RAW_CAPTURE_DIR_ENV]
        === "/private/tmp/keychain-runner-core-six-test"
      && starts[0].optionen.env[PROVIDER_RAW_CAPTURE_GUARD_ENV]
        === PROVIDER_RAW_CAPTURE_GUARD_VALUE);
  pruefe("Owner-Sechservariante mappt ausschließlich Owner auf TestA",
    gelesen.join(",") === KEYCHAIN_ACCOUNTS.owner
      && starts[0].optionen.env.KD_TESTA_USER === PUBLIC.KD_OWNER_USER
      && starts[0].optionen.env.KD_TESTA_PASS === OWNER_GEHEIMNIS
      && !("KD_OWNER_USER" in starts[0].optionen.env)
      && !("KD_OWNER_PASS" in starts[0].optionen.env));
}

{
  const starts = [];
  const gelesen = [];
  const spawnImpl = (programm, argv, optionen) => {
    starts.push({ programm, argv, optionen });
    const kind = new EventEmitter();
    queueMicrotask(() => kind.emit("exit", 0, null));
    return kind;
  };
  const code = await starteModus({
    modus: "ai-live",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      gelesen.push(account);
      return account === KEYCHAIN_ACCOUNTS.testa ? SONDERGEHEIMNIS : OWNER_GEHEIMNIS;
    },
    spawnImpl,
    ownerApprovedServerBudget: true,
    radarWebsearchOnce: true,
  });
  pruefe("Radar-Einmallauf startet nur sein fest verdrahtetes Skript hinter dem Budgetwächter",
    code === 0
      && starts.length === 1
      && starts[0].argv.join("|") === MODI["ai-live"].radarWebsearchOnceArgv.join("|")
      && starts[0].argv.some((arg) => arg.endsWith("/radar_websearch_live.mjs"))
      && !starts[0].argv.some((arg) => arg.endsWith("/ai_smoke.mjs")));
  pruefe("Radar-Einmallauf erhält nur den internen Guard und das starke öffentliche Ziel",
    starts[0].optionen.env[RADAR_WEBSEARCH_ONCE_ENV] === "keychain-budget-guard-v1"
      && starts[0].optionen.env.KD_RADAR_TARGET_ID === PUBLIC.KD_RADAR_TARGET_ID
      && gelesen.join(",") === KEYCHAIN_ACCOUNTS.testa
      && starts[0].optionen.env.KD_TESTA_USER === PUBLIC.KD_TESTA_USER
      && starts[0].optionen.env.KD_TESTA_PASS === SONDERGEHEIMNIS
      && !("KD_OWNER_USER" in starts[0].optionen.env)
      && !("KD_OWNER_PASS" in starts[0].optionen.env));
}

{
  const starts = [];
  const gelesen = [];
  const spawnImpl = (programm, argv, optionen) => {
    starts.push({ programm, argv, optionen });
    const kind = new EventEmitter();
    queueMicrotask(() => kind.emit("exit", 0, null));
    return kind;
  };
  const code = await starteModus({
    modus: "ai-live",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      gelesen.push(account);
      return account === KEYCHAIN_ACCOUNTS.owner ? OWNER_GEHEIMNIS : SONDERGEHEIMNIS;
    },
    spawnImpl,
    ownerApprovedServerBudget: true,
    entdeckenDailyOnce: true,
  });
  pruefe("Entdecken-Einmallauf startet nur sein fest verdrahtetes Skript hinter dem Budgetwächter",
    code === 0
      && starts.length === 1
      && starts[0].argv.join("|") === MODI["ai-live"].entdeckenDailyOnceArgv.join("|")
      && starts[0].argv.some((arg) => arg.endsWith("/entdecken_daily_live.mjs"))
      && !starts[0].argv.some((arg) => arg.endsWith("/ai_smoke.mjs")));
  pruefe("Entdecken-Einmallauf erhält nur internen Guard und Owner-Serverbudgetfreigabe",
    starts[0].optionen.env[ENTDECKEN_DAILY_ONCE_ENV] === "keychain-budget-guard-v1"
      && starts[0].optionen.env[OWNER_SERVER_BUDGET_ENV] === "1"
      && gelesen.join(",") === KEYCHAIN_ACCOUNTS.owner
      && starts[0].optionen.env.KD_TESTA_USER === PUBLIC.KD_OWNER_USER
      && starts[0].optionen.env.KD_TESTA_PASS === OWNER_GEHEIMNIS
      && !starts[0].argv.join(" ").includes(OWNER_GEHEIMNIS)
      && !("KD_OWNER_USER" in starts[0].optionen.env)
      && !("KD_OWNER_PASS" in starts[0].optionen.env));
}

{
  const starts = [];
  const gelesen = [];
  const spawnImpl = (programm, argv, optionen) => {
    starts.push({ programm, argv, optionen });
    const kind = new EventEmitter();
    queueMicrotask(() => kind.emit("exit", 0, null));
    return kind;
  };
  const code = await starteModus({
    modus: "ai-live",
    ambientEnv: {},
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      gelesen.push(account);
      return account === KEYCHAIN_ACCOUNTS.owner ? OWNER_GEHEIMNIS : SONDERGEHEIMNIS;
    },
    spawnImpl,
    ownerApprovedServerBudget: true,
    radarEntdeckenOnce: true,
    rawCaptureDirectoryFactory: () => "/private/tmp/keychain-runner-combined-test",
    ausgabe: () => {},
  });
  pruefe("Kombinierter Produkt-Smoke startet genau ein fest verdrahtetes Kind hinter dem Budgetwächter",
    code === 0
      && starts.length === 1
      && starts[0].argv.join("|") === MODI["ai-live"].radarEntdeckenOnceArgv.join("|")
      && starts[0].argv.some((arg) => arg.endsWith("/radar_entdecken_live.mjs"))
      && !starts[0].argv.some((arg) => arg.endsWith("/ai_smoke.mjs")));
  pruefe("Kombinierter Produkt-Smoke erhält beide internen Guards, Ziel und Ownerfreigabe",
    starts[0].optionen.env[ENTDECKEN_DAILY_ONCE_ENV] === "keychain-budget-guard-v1"
      && starts[0].optionen.env[RADAR_WEBSEARCH_ONCE_ENV] === "keychain-budget-guard-v1"
      && starts[0].optionen.env.KD_RADAR_TARGET_ID === PUBLIC.KD_RADAR_TARGET_ID
      && starts[0].optionen.env[OWNER_SERVER_BUDGET_ENV] === "1"
      && starts[0].optionen.env[PROVIDER_RAW_CAPTURE_DIR_ENV]
        === "/private/tmp/keychain-runner-combined-test"
      && starts[0].optionen.env[PROVIDER_RAW_CAPTURE_GUARD_ENV]
        === PROVIDER_RAW_CAPTURE_GUARD_VALUE
      && gelesen.join(",") === KEYCHAIN_ACCOUNTS.owner
      && starts[0].optionen.env.KD_TESTA_USER === PUBLIC.KD_OWNER_USER
      && starts[0].optionen.env.KD_TESTA_PASS === OWNER_GEHEIMNIS
      && !starts[0].argv.join(" ").includes(OWNER_GEHEIMNIS)
      && !("KD_OWNER_USER" in starts[0].optionen.env)
      && !("KD_OWNER_PASS" in starts[0].optionen.env));
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
  const gelesen = [];
  const code = await main(["keychain-check"], {
    ausgabe: (x) => aus.push(String(x)),
    fehlerAusgabe: (x) => err.push(String(x)),
    keychainLeser: (account) => { gelesen.push(account); return SONDERGEHEIMNIS; },
  });
  pruefe("reiner Schlüsselbundcheck startet keinen Test", code === 0 && aus.length === 1);
  pruefe("bestehender Schlüsselbundcheck bleibt exakt auf TestA und TestB begrenzt",
    gelesen.join(",") === `${KEYCHAIN_ACCOUNTS.testa},${KEYCHAIN_ACCOUNTS.testb}`);
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

{
  const err = [];
  const code = await main(["ai-live", RADAR_WEBSEARCH_ONCE_FLAG, RADAR_ENTDECKEN_ONCE_FLAG], {
    fehlerAusgabe: (x) => err.push(String(x)),
  });
  pruefe("Einzel- und Kombinations-Smoke sind gegenseitig exklusiv",
    code === EXIT_KONFIG && err.length > 0);
}

{
  const err = [];
  const code = await main(["ai-eval", "--confirm-paid", RADAR_WEBSEARCH_ONCE_FLAG], {
    fehlerAusgabe: (x) => err.push(String(x)),
  });
  pruefe("Radar-Einmalflag ist außerhalb von ai-live gesperrt",
    code === EXIT_KONFIG && err.length > 0);
}

{
  const err = [];
  const code = await main(["profile-live", "--confirm-paid", OWNER_SERVER_BUDGET_FLAG], {
    fehlerAusgabe: (x) => err.push(String(x)),
    keychainLeser: () => SONDERGEHEIMNIS,
  });
  pruefe("alter bezahlter Profil-Sonderweg ist vollstaendig stillgelegt",
    code === EXIT_KONFIG && err.length > 0);
}

{
  const altSkript = readFileSync(new URL("./tools/profile_extract_live.mjs", import.meta.url), "utf8");
  pruefe("historisches Profil-Live-Skript kann keinen Netzaufruf mehr ausloesen",
    altSkript.includes("LIVE_PROFIL_STILLGELEGT")
      && !/\bfetch\s*\(/.test(altSkript));
}

console.log(`KEYCHAIN-RUNNER-TEST: ${bestanden}/${gesamt}`);
if (bestanden !== gesamt) process.exit(1);

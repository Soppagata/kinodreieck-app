import { EventEmitter } from "node:events";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  EXIT_KEYCHAIN,
  EXIT_KONFIG,
  ENTDECKEN_DAILY_ONCE_ENV,
  ENTDECKEN_DAILY_ONCE_FLAG,
  ENTDECKEN_PROVIDER_PROBE_ONCE_ENV,
  ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG,
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
  RADAR_TARGET_AUTO_RESOLVE_ENV,
  RADAR_TARGET_AUTO_RESOLVE_VALUE,
  RADAR_ENTDECKEN_ONCE_FLAG,
  RADAR_WEBSEARCH_ONCE_ENV,
  RADAR_WEBSEARCH_ONCE_FLAG,
  RadarTargetFehler,
  REPO_ROOT,
  baueKindUmgebung,
  liesKeychainEintrag,
  loeseStarkesOwnerRadarZiel,
  main,
  normalisiereStarkesRadarZiel,
  parseLokaleKonfig,
  reserviereLiveLauf,
  starteModus,
} from "./tools/keychain_runner.mjs";
import {
  FILMWISSEN_TARGET_IDS_ENV,
} from "./tools/filmwissen_live_target.mjs";
import {
  captureProviderRawResponse,
  createPrivateProviderRawDirectory,
  finalizeProviderCapture,
  finalizeProviderFreeCapture,
  isProviderFreeCapture,
  isZeroCostUnprovenCapture,
  providerDiagnosticHeaders,
} from "./tools/provider_raw_capture.mjs";
import {
  erstelleAnbieterPfadBelege,
} from "./tools/ai_smoke_contract.mjs";
import {
  PROVIDER_DIAGNOSTIC_ENV,
  PROVIDER_DIAGNOSTIC_FIELD,
  PROVIDER_DIAGNOSTIC_HEADER,
  PROVIDER_DIAGNOSTIC_HEADER_VALUE,
  providerDiagnosticAccess,
  providerDiagnosticField,
} from "./supabase/functions/_shared/providerDiagnostic.js";

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
const PACKAGE = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
pruefe("der einzige Standard-Livebefehl bleibt exakt auf den Keychain-Runner verdrahtet",
  PACKAGE.scripts?.["test:ai:live"] === "node tools/keychain_runner.mjs ai-live");

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
    ENTDECKEN_DAILY_ONCE_ENV,
    ENTDECKEN_PROVIDER_PROBE_ONCE_ENV,
    RADAR_TARGET_AUTO_RESOLVE_ENV,
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
    expectedTask: "intelligent-search",
    expectedVorgangId: "11111111-1111-4111-8111-111111111111",
  });
  pruefe("Providerrohtext wird ausserhalb des Repos exakt mit Modus 0600 geschrieben",
    readFileSync(written.filePath, "utf8") === '{"private":"provider-raw"}'
      && (statSync(written.filePath).mode & 0o777) === 0o600
      && (statSync(directory).mode & 0o777) === 0o700
      && !written.filePath.startsWith(REPO_ROOT + "/")
      && written.captureState === "raw"
      && written.task === "intelligent-search"
      && written.providerRequests === 1
      && written.attemptedProviderRequests === 1
      && written.potentialProviderRequests === 1
      && written.provenProviderRequests === 1
      && written.fachstatus === null
      && written.fachgrund === null);
  pruefe("Providerdiagnose wird vor jeder weiteren Antwortverarbeitung entfernt",
    !("providerDiagnostic" in body));
  unlinkSync(written.filePath);
  rmdirSync(directory);
}

{
  const directory = createPrivateProviderRawDirectory();
  const env = {
    [PROVIDER_RAW_CAPTURE_DIR_ENV]: directory,
    [PROVIDER_RAW_CAPTURE_GUARD_ENV]: PROVIDER_RAW_CAPTURE_GUARD_VALUE,
  };
  const envVorher = JSON.stringify(env);
  let pending;
  let finalisiert;
  let naechsterPfadLaeufe = 0;
  let positiveKostenGesperrt = false;
  let unbekannteKostenGesperrt = false;
  let keineDateiGeschrieben = false;
  let cleanupOk = false;
  try {
    pending = captureProviderRawResponse(
      { ok: true, data: { nichtAlsProviderbelegAuswerten: true } },
      "01-intelligent-search.json",
      {
        env,
        repoRoot: REPO_ROOT,
        responseStatus: 200,
        expectedTask: "intelligent-search",
        expectedVorgangId: "22222222-2222-4222-8222-222222222222",
      },
    );
    finalisiert = finalizeProviderCapture(pending, 0);
    naechsterPfadLaeufe += 1;
    positiveKostenGesperrt = [0.0001, 1].every((kosten) => {
      try { finalizeProviderCapture(pending, kosten); return false; }
      catch { return true; }
    });
    unbekannteKostenGesperrt = [null, undefined, Number.NaN].every((kosten) => {
      try { finalizeProviderCapture(pending, kosten); return false; }
      catch { return true; }
    });
    keineDateiGeschrieben = readdirSync(directory).length === 0;
  } finally {
    rmdirSync(directory);
    cleanupOk = !existsSync(directory);
  }
  pruefe("P12 ohne Rawpayload bleibt bis zur serverseitigen Nachmessung pending",
    pending?.captureState === "pending-no-raw"
      && pending?.proofState === "pending"
      && pending?.providerRequests === null);
  pruefe("Alter Rawcapture-Helfer bleibt bei exaktem Nulldelta unbelegt und blockiert keinen Aufrufer",
    isZeroCostUnprovenCapture(finalisiert)
      && naechsterPfadLaeufe === 1);
  const providerfrei = finalizeProviderFreeCapture(pending, 0);
  pruefe("Nur der explizite Vor-Provider-Abschluss macht ein Nulldelta providerfrei",
    isProviderFreeCapture(providerfrei, "provider-probe-not-started")
      && !isZeroCostUnprovenCapture(providerfrei));
  pruefe("P12 mit positiven Kosten ohne Rawpayload stoppt weiterhin fail-closed",
    positiveKostenGesperrt);
  pruefe("P12 mit unbekannten Kosten ohne Rawpayload stoppt weiterhin fail-closed",
    unbekannteKostenGesperrt);
  pruefe("P12-Mock schreibt kein Rohpayload, veraendert keine Guards und raeumt lokal auf",
    keineDateiGeschrieben && JSON.stringify(env) === envVorher && cleanupOk);
}

{
  const directory = createPrivateProviderRawDirectory();
  const basis = {
    ok: true,
    task: "filmwissen-synthese",
    vorgangId: "11111111-1111-4111-8111-111111111111",
  };
  const ungewoehnlicheAntworten = [
    { status: 503, body: { ok: false, code: "server", grund: "quellen-vor-ki-stopp" } },
    { status: 418, body: { antwortForm: ["ungewoehnlich"] } },
  ];
  const pending = ungewoehnlicheAntworten.map(({ body, status }) =>
    captureProviderRawResponse(
      body,
      "04-filmwissen-synthese.json",
      {
        env: {
          [PROVIDER_RAW_CAPTURE_DIR_ENV]: directory,
          [PROVIDER_RAW_CAPTURE_GUARD_ENV]: PROVIDER_RAW_CAPTURE_GUARD_VALUE,
        },
        repoRoot: REPO_ROOT,
        responseStatus: status,
        expectedTask: basis.task,
        expectedVorgangId: basis.vorgangId,
      },
    ));
  const ergebnisse = pending.map((capture) => finalizeProviderCapture(capture, 0));
  pruefe("P18-Nulldelta ohne Raw bleibt wie jeder Pfad unbelegt",
    pending.every((capture) => capture.captureState === "pending-no-raw"
        && capture.providerRequests === null)
      && ergebnisse[0].httpStatus === 503
      && ergebnisse[0].fachstatus === "server"
      && ergebnisse[0].fachgrund === "quellen-vor-ki-stopp"
      && ergebnisse[1].httpStatus === 418
      && ergebnisse[1].fachstatus === "unbekannt"
      && ergebnisse.every((ergebnis) => isZeroCostUnprovenCapture(ergebnis)
        && ergebnis.filePath === null
        && ergebnis.bytes === 0));

  const kostenmessungGesperrt = [0.0001, null].every((kosten) => {
    try { finalizeProviderCapture(pending[0], kosten); return false; }
    catch { return true; }
  });
  pruefe("Positive oder unbekannte Kosten ohne Providerrohpayload bleiben fail-closed",
    kostenmessungGesperrt);
  rmdirSync(directory);
}

{
  let potentialzaunGesperrt = false;
  try {
    erstelleAnbieterPfadBelege(
      Array.from({ length: 10 }, (_, index) => `pfad-${index + 1}`),
      { maxPotentialRequests: 9 },
    );
  } catch (error) {
    potentialzaunGesperrt = /Potentialzaun/.test(String(error?.message));
  }
  pruefe("Ein Zehn-Pfade-Vertrag kann den festen Neuner-Potentialzaun nicht überbuchen",
    potentialzaunGesperrt);
}

{
  const keychainSource = readFileSync(new URL("./tools/keychain_runner.mjs", import.meta.url), "utf8");
  const smokeSource = readFileSync(new URL("./tools/ai_smoke.mjs", import.meta.url), "utf8");
  const functionSources = [
    readFileSync(new URL("./supabase/functions/ai-task/index.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./supabase/functions/entdecken-daily-task/index.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./supabase/functions/radar-websearch-task/index.ts", import.meta.url), "utf8"),
  ];
  const headers = providerDiagnosticHeaders({
    [PROVIDER_RAW_CAPTURE_DIR_ENV]: "/private/tmp/static-provider-capture-preflight",
    [PROVIDER_RAW_CAPTURE_GUARD_ENV]: PROVIDER_RAW_CAPTURE_GUARD_VALUE,
  });
  pruefe("Alter Diagnosehelfer bleibt verfuegbar, ist aber keine Belegpflicht des normalen Smoke mehr",
    Object.keys(headers).join(",") === PROVIDER_DIAGNOSTIC_HEADER
      && headers[PROVIDER_DIAGNOSTIC_HEADER] === PROVIDER_DIAGNOSTIC_HEADER_VALUE
      && providerDiagnosticField("raw")[PROVIDER_DIAGNOSTIC_FIELD].rawResponse === "raw"
      && !smokeSource.includes("providerDiagnosticHeaders(process.env)")
      && !smokeSource.includes("captureProviderRawResponse(")
      && smokeSource.includes("providerReceiptBelegAusAntwort(")
      && smokeSource.includes("erfasseProviderReceipt("));
  pruefe("Diagnosezugang braucht gleichzeitig Header, temporäres Serverflag und Ownerrolle",
    providerDiagnosticAccess({
      headerValue: PROVIDER_DIAGNOSTIC_HEADER_VALUE,
      enabled: true,
      owner: true,
    }).allowed === true
      && [
        { headerValue: null, enabled: true, owner: true },
        { headerValue: PROVIDER_DIAGNOSTIC_HEADER_VALUE, enabled: false, owner: true },
        { headerValue: PROVIDER_DIAGNOSTIC_HEADER_VALUE, enabled: true, owner: false },
      ].every((fall) => providerDiagnosticAccess(fall).allowed === false));
  pruefe("Alle drei Functions erwarten statisch Serverflag, Ownerbindung und privates Antwortfeld",
    PROVIDER_DIAGNOSTIC_ENV === "KD_PROVIDER_LIVE_DIAGNOSTICS_ENABLED"
      && functionSources.every((source) => source.includes("Deno.env.get(PROVIDER_DIAGNOSTIC_ENV) === \"true\"")
        && source.includes("providerDiagnosticAccess({")
        && source.includes("providerDiagnosticField("))
      && functionSources[0].includes('owner: fachfreigabe.rolle === "owner"')
      && functionSources[1].includes("owner: ownerRefreshConfirmed")
      && functionSources[2].includes('access?.role === "owner"'));
  const runnerSources = `${keychainSource}\n${smokeSource}`;
  pruefe("Aktueller Runner verwaltet weder Diagnoseflag noch private Rawcapture-Senke",
    !runnerSources.includes(PROVIDER_DIAGNOSTIC_ENV)
      && !/supabase\s+secrets\s+(?:set|unset)/.test(runnerSources)
      && !keychainSource.includes("createPrivateProviderRawDirectory")
      && !keychainSource.includes("rawCaptureDirectoryFactory")
      && !smokeSource.includes(PROVIDER_DIAGNOSTIC_HEADER));
  pruefe("Entdecken-Einmallauf besitzt keinen versteckten Environment-Einstieg mehr",
    !keychainSource.includes("KD_ENTDECKEN_DAILY_ONCE_REQUEST"));
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
  pruefe("exakte Owner-Freigabe bindet Combined Eight an Owner, Budget und beide Produktguards",
    env[OWNER_SERVER_BUDGET_ENV] === "1"
      && env[OWNER_CORE_SIX_GUARD_ENV] === OWNER_CORE_SIX_GUARD_VALUE
      && env[ENTDECKEN_DAILY_ONCE_ENV] === "keychain-budget-guard-v1"
      && env[RADAR_WEBSEARCH_ONCE_ENV] === "keychain-budget-guard-v1"
      && env[RADAR_TARGET_AUTO_RESOLVE_ENV] === RADAR_TARGET_AUTO_RESOLVE_VALUE
      && env.KD_RADAR_TARGET_ID === PUBLIC.KD_RADAR_TARGET_ID
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
  const ohneRadarOverride = { ...PUBLIC };
  delete ohneRadarOverride.KD_RADAR_TARGET_ID;
  const env = baueKindUmgebung({
    modus: "ai-live",
    ambientEnv: {},
    lokaleKonfig: ohneRadarOverride,
    keychainLeser: () => OWNER_GEHEIMNIS,
    ownerApprovedServerBudget: true,
  });
  pruefe("fehlendes Radar-Override aktiviert nur im Owner-Combined-Eight die accountgebundene Autoauflösung",
    !("KD_RADAR_TARGET_ID" in env)
      && env[RADAR_TARGET_AUTO_RESOLVE_ENV] === RADAR_TARGET_AUTO_RESOLVE_VALUE
      && env[RADAR_WEBSEARCH_ONCE_ENV] === "keychain-budget-guard-v1");

  let ungueltigesOverrideGesperrt = false;
  try {
    baueKindUmgebung({
      modus: "ai-live",
      ambientEnv: {},
      lokaleKonfig: { ...ohneRadarOverride, KD_RADAR_TARGET_ID: "fixture:radar-ziel" },
      keychainLeser: () => OWNER_GEHEIMNIS,
      ownerApprovedServerBudget: true,
    });
  } catch { ungueltigesOverrideGesperrt = true; }
  pruefe("ein vorhandenes schwaches Radar-Override fällt nie auf Autoauflösung zurück",
    ungueltigesOverrideGesperrt);
}

{
  const abo = (targetId, extra = {}) => ({
    targetId,
    targetType: "work",
    title: "Echtes Ziel",
    region: "AT",
    scope: "all",
    status: "active",
    updatedAt: "2026-08-24T10:00:00.000Z",
    ...extra,
  });
  const feed = (subscriptions, extra = {}) => ({
    status: 200,
    daten: { radarReview: true, subscriptions, ...extra },
  });

  let overrideReads = 0;
  const override = await loeseStarkesOwnerRadarZiel({
    override: ` ${PUBLIC.KD_RADAR_TARGET_ID} `,
    autoResolveGuard: RADAR_TARGET_AUTO_RESOLVE_VALUE,
    feedLeser: async () => { overrideReads += 1; throw new Error("darf nicht lesen"); },
  });
  pruefe("gültiger KD_RADAR_TARGET_ID-Override gewinnt ohne Produktpreflight-Read",
    override === PUBLIC.KD_RADAR_TARGET_ID && overrideReads === 0);

  let autoReads = 0;
  const automatisch = await loeseStarkesOwnerRadarZiel({
    autoResolveGuard: RADAR_TARGET_AUTO_RESOLVE_VALUE,
    feedLeser: async () => {
      autoReads += 1;
      return feed([
        abo("tmdb:movie:603"),
        abo("imdb:tt0133093"),
      ]);
    },
  });
  pruefe("Autoauflösung liest genau einmal und wählt stabil das erste eligible starke Ziel",
    autoReads === 1 && automatisch === "imdb:tt0133093");

  const stoppFaelle = [
    ["falsches Konto", feed([abo("imdb:tt0133093")], { accountId: "konto-fremd" })],
    ["inaktives Ziel", feed([abo("imdb:tt0133093", { status: "paused" })])],
    ["mehrdeutiger Zielstatus", feed([abo("imdb:tt0133093", { targetStatus: "ambiguous" })])],
    ["schwaches Ziel", feed([abo("fixture:radar-ziel")])],
    ["kein Ziel", feed([])],
    ["mehrdeutiges Ziel", feed([abo("imdb:tt0133093"), abo("imdb:tt0133093")])],
  ];
  for (const [name, antwort] of stoppFaelle) {
    let error = null;
    let reads = 0;
    try {
      await loeseStarkesOwnerRadarZiel({
        autoResolveGuard: RADAR_TARGET_AUTO_RESOLVE_VALUE,
        feedLeser: async () => { reads += 1; return antwort; },
      });
    } catch (caught) { error = caught; }
    pruefe(`${name} stoppt nach genau einem read fail-closed`,
      reads === 1 && error instanceof RadarTargetFehler
        && !String(error.message).includes("konto-fremd")
        && !String(error.message).includes("imdb:tt0133093"));
  }

  const identitaetsMarker = "private-owner-zielbezeichnung";
  const logs = [];
  const altesLog = console.log;
  const alterFehler = console.error;
  console.log = (...teile) => { logs.push(teile.join(" ")); };
  console.error = (...teile) => { logs.push(teile.join(" ")); };
  try {
    await loeseStarkesOwnerRadarZiel({
      autoResolveGuard: RADAR_TARGET_AUTO_RESOLVE_VALUE,
      feedLeser: async () => feed([abo("imdb:tt0133093", { title: identitaetsMarker })]),
    });
  } finally {
    console.log = altesLog;
    console.error = alterFehler;
  }
  pruefe("Autoauflösung loggt weder Ziel-ID noch private Bezeichnung oder Accountidentität",
    logs.length === 0
      && normalisiereStarkesRadarZiel("fixture:radar-ziel") === null
      && normalisiereStarkesRadarZiel("imdb:tt0133093") === "imdb:tt0133093");
}

{
  const ohneFilmwissenOverride = { ...PUBLIC };
  delete ohneFilmwissenOverride.KD_FILMWISSEN_TARGET_ID;
  let fehlendesZielGesperrt = false;
  try {
    baueKindUmgebung({
      modus: "ai-live",
      ambientEnv: {},
      lokaleKonfig: ohneFilmwissenOverride,
      keychainLeser: () => OWNER_GEHEIMNIS,
      ownerApprovedServerBudget: true,
    });
  } catch { fehlendesZielGesperrt = true; }
  pruefe("fehlendes Filmwissen-Liveziel stoppt die Owner-Rauchprobe vor dem Smoke",
    fehlendesZielGesperrt);

  const zielListe = `${PUBLIC.KD_FILMWISSEN_TARGET_ID},wikidata:Q103569`;
  const listenEnv = baueKindUmgebung({
    modus: "ai-live",
    ambientEnv: {},
    lokaleKonfig: {
      ...ohneFilmwissenOverride,
      [FILMWISSEN_TARGET_IDS_ENV]: zielListe,
    },
    keychainLeser: () => OWNER_GEHEIMNIS,
    ownerApprovedServerBudget: true,
  });
  pruefe("begrenzte Filmwissen-Zielliste wird nur fuer den Owner-Preflight weitergereicht",
    listenEnv[FILMWISSEN_TARGET_IDS_ENV] === zielListe
      && !("KD_FILMWISSEN_TARGET_ID" in listenEnv)
      && listenEnv[OWNER_CORE_SIX_GUARD_ENV] === OWNER_CORE_SIX_GUARD_VALUE);

  let ungueltigesOverrideGesperrt = false;
  try {
    baueKindUmgebung({
      modus: "ai-live",
      ambientEnv: {},
      lokaleKonfig: { ...PUBLIC, KD_FILMWISSEN_TARGET_ID: "tt0133093" },
      keychainLeser: () => OWNER_GEHEIMNIS,
      ownerApprovedServerBudget: true,
    });
  } catch { ungueltigesOverrideGesperrt = true; }
  pruefe("ein vorhandenes Filmwissen-Override muss weiterhin eine starke Kennung sein",
    ungueltigesOverrideGesperrt);
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
  const gelesen = [];
  const env = baueKindUmgebung({
    modus: "ai-live",
    ambientEnv: {
      [ENTDECKEN_PROVIDER_PROBE_ONCE_ENV]: "ambient-verboten",
      [PROVIDER_RAW_CAPTURE_GUARD_ENV]: "ambient-verboten",
      [PROVIDER_RAW_CAPTURE_DIR_ENV]: "/private/tmp/ambient-verboten",
    },
    lokaleKonfig: PUBLIC,
    keychainLeser(account) {
      gelesen.push(account);
      return OWNER_GEHEIMNIS;
    },
    ownerApprovedServerBudget: true,
    entdeckenProviderProbeOnce: true,
  });
  pruefe("Schmale Providerprobe liest ausschliesslich den Owner und setzt nur ihren internen Guard",
    gelesen.join(",") === KEYCHAIN_ACCOUNTS.owner
      && env.KD_TESTA_USER === PUBLIC.KD_OWNER_USER
      && env.KD_TESTA_PASS === OWNER_GEHEIMNIS
      && env[OWNER_SERVER_BUDGET_ENV] === "1"
      && env[ENTDECKEN_PROVIDER_PROBE_ONCE_ENV] === "keychain-budget-guard-v1"
      && !(ENTDECKEN_DAILY_ONCE_ENV in env)
      && !(RADAR_WEBSEARCH_ONCE_ENV in env)
      && !(PROVIDER_RAW_CAPTURE_GUARD_ENV in env)
      && !(PROVIDER_RAW_CAPTURE_DIR_ENV in env)
      && !(OWNER_CORE_SIX_GUARD_ENV in env));
  let gemischtGesperrt = false;
  try {
    baueKindUmgebung({
      modus: "ai-live", ambientEnv: {}, lokaleKonfig: PUBLIC,
      keychainLeser: () => OWNER_GEHEIMNIS,
      ownerApprovedServerBudget: true,
      entdeckenProviderProbeOnce: true,
      entdeckenDailyOnce: true,
    });
  } catch { gemischtGesperrt = true; }
  pruefe("Providerprobe und Produktlauf sind auch bei direkter Umgebungsbildung exklusiv",
    gemischtGesperrt);
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
  });
  pruefe("Exakte Owner-Variante startet Combined Eight als genau einen Smoke-Kindprozess",
    code === 0
      && starts.length === 1
      && starts[0].argv.join("|") === MODI["ai-live"].argv.join("|")
      && starts[0].argv.some((arg) => arg.endsWith("/filmwissen_live_target.mjs"))
      && !starts[0].argv.some((arg) => arg.endsWith("/ai_smoke.mjs"))
      && !starts[0].argv.some((arg) => arg.endsWith("/radar_entdecken_live.mjs"))
      && starts[0].optionen.env[OWNER_CORE_SIX_GUARD_ENV] === OWNER_CORE_SIX_GUARD_VALUE
      && starts[0].optionen.env[ENTDECKEN_DAILY_ONCE_ENV] === "keychain-budget-guard-v1"
      && starts[0].optionen.env[RADAR_WEBSEARCH_ONCE_ENV] === "keychain-budget-guard-v1"
      && starts[0].optionen.env[RADAR_TARGET_AUTO_RESOLVE_ENV]
        === RADAR_TARGET_AUTO_RESOLVE_VALUE
      && starts[0].optionen.env.KD_RADAR_TARGET_ID === PUBLIC.KD_RADAR_TARGET_ID
      && !(PROVIDER_RAW_CAPTURE_DIR_ENV in starts[0].optionen.env)
      && !(PROVIDER_RAW_CAPTURE_GUARD_ENV in starts[0].optionen.env));
  pruefe("Owner-Combined-Eight mappt ausschließlich Owner auf TestA",
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
  pruefe("Entdecken-Einmallauf bleibt fest auf seinen einzelnen Client verdrahtet",
    MODI["ai-live"].entdeckenDailyOnceArgv.some((arg) => arg.endsWith("/entdecken_daily_live.mjs"))
      && !MODI["ai-live"].entdeckenDailyOnceArgv.some((arg) => arg.endsWith("/ai_smoke.mjs")));
  pruefe("Format-6-Einmallauf startet nach additivem Bytevertrag nur den providerfreien Client",
    code === 0
      && starts.length === 1
      && gelesen.join(",") === KEYCHAIN_ACCOUNTS.owner
      && starts[0].argv.join("|") === MODI["ai-live"].entdeckenDailyOnceArgv.join("|")
      && starts[0].optionen.env[ENTDECKEN_DAILY_ONCE_ENV] === "keychain-budget-guard-v1"
      && starts[0].optionen.env.KD_TESTA_USER === PUBLIC.KD_OWNER_USER
      && starts[0].optionen.env.KD_TESTA_PASS === OWNER_GEHEIMNIS
      && !("KD_OWNER_USER" in starts[0].optionen.env));
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
  let stopp = null;
  try {
    await starteModus({
      modus: "ai-live",
      ambientEnv: {},
      lokaleKonfig: PUBLIC,
      keychainLeser(account) {
        gelesen.push(account);
        return OWNER_GEHEIMNIS;
      },
      spawnImpl,
      ownerApprovedServerBudget: true,
      entdeckenProviderProbeOnce: true,
    });
  } catch (error) { stopp = error; }
  pruefe("Providerprobe bleibt fest auf ihren einzelnen Client verdrahtet",
    MODI["ai-live"].entdeckenProviderProbeOnceArgv.some((arg) => arg.endsWith("/entdecken_provider_probe_live.mjs"))
      && !MODI["ai-live"].entdeckenProviderProbeOnceArgv.some((arg) => arg.endsWith("/entdecken_daily_live.mjs"))
      && !MODI["ai-live"].entdeckenProviderProbeOnceArgv.some((arg) => arg.endsWith("/ai_smoke.mjs")));
  pruefe("Providerprobe stoppt am nicht deployten Function-Bytevertrag vor Keychain und Spawn",
    stopp?.code === "ENTDECKEN_HTTP_DIAGNOSTIC_PROVENANCE_DRIFT"
      && starts.length === 0 && gelesen.length === 0);
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
      && !(PROVIDER_RAW_CAPTURE_DIR_ENV in starts[0].optionen.env)
      && !(PROVIDER_RAW_CAPTURE_GUARD_ENV in starts[0].optionen.env)
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
  const code = await main(["ai-live", ENTDECKEN_DAILY_ONCE_FLAG], {
    fehlerAusgabe: (x) => err.push(String(x)),
  });
  pruefe("Entdecken-Einmalflag ist ohne exakte Owner-Budgetfreigabe gesperrt",
    code === EXIT_KONFIG && err.length === 1);
}

{
  const err = [];
  const code = await main(["ai-live", ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG], {
    fehlerAusgabe: (x) => err.push(String(x)),
  });
  pruefe("Providerprobe ist ohne exakte Owner-Budgetfreigabe gesperrt",
    code === EXIT_KONFIG && err.length === 1);
}

{
  const err = [];
  const code = await main([
    "ai-live", OWNER_SERVER_BUDGET_FLAG, ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG,
  ], { fehlerAusgabe: (x) => err.push(String(x)) });
  pruefe("Providerprobe akzeptiert nur die exakt freigegebene Reihenfolge",
    code === EXIT_KONFIG && err.length === 1);
}

{
  const err = [];
  const code = await main([
    "ai-live", ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG,
    ENTDECKEN_PROVIDER_PROBE_ONCE_FLAG, OWNER_SERVER_BUDGET_FLAG,
  ], { fehlerAusgabe: (x) => err.push(String(x)) });
  pruefe("Providerprobe darf nicht doppelt vorkommen",
    code === EXIT_KONFIG && err.length === 1);
}

{
  const err = [];
  const code = await main([
    "ai-live", OWNER_SERVER_BUDGET_FLAG, ENTDECKEN_DAILY_ONCE_FLAG,
  ], { fehlerAusgabe: (x) => err.push(String(x)) });
  pruefe("Entdecken-Einmalflag akzeptiert nur die exakt freigegebene Reihenfolge",
    code === EXIT_KONFIG && err.length === 1);
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
  const code = await main([
    "ai-live", RADAR_WEBSEARCH_ONCE_FLAG, ENTDECKEN_DAILY_ONCE_FLAG,
    OWNER_SERVER_BUDGET_FLAG,
  ], { fehlerAusgabe: (x) => err.push(String(x)) });
  pruefe("Radar- und Entdecken-Einzelpfad sind gegenseitig exklusiv",
    code === EXIT_KONFIG && err.length > 0);
}

{
  const err = [];
  const code = await main([
    "ai-live", ENTDECKEN_DAILY_ONCE_FLAG, ENTDECKEN_DAILY_ONCE_FLAG,
    OWNER_SERVER_BUDGET_FLAG,
  ], { fehlerAusgabe: (x) => err.push(String(x)) });
  pruefe("Entdecken-Einmalflag darf nicht doppelt vorkommen",
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
  const code = await main([
    "ai-eval", "--confirm-paid", ENTDECKEN_DAILY_ONCE_FLAG,
    OWNER_SERVER_BUDGET_FLAG,
  ], { fehlerAusgabe: (x) => err.push(String(x)) });
  pruefe("Entdecken-Einmalflag ist außerhalb von ai-live gesperrt",
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

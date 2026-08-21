#!/usr/bin/env node
/* Kostenfreie Modultests für tools/ai_budget_guard.mjs.
   Kein Test meldet sich an, kein Test ruft Supabase oder einen Anbieter auf. */

import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import {
  fremdeEvalWerte,
  hatWirkendeEvalDeutung,
} from "./tools/ai_eval_contract.mjs";

import {
  ANBIETER_REQUEST_LIMIT_USD_CENT,
  AUTONOMIE_STOPP_EXIT,
  BUDGET_UNBEKANNT_EXIT,
  BudgetKonfigFehler,
  ENTDECKEN_LAUF_LIMIT_USD_CENT,
  EVAL_MAX_ANBIETER_REQUESTS,
  LAUF_LIMIT_USD_CENT,
  LIVE_PROCESS_TIMEOUT_MS,
  LiveLaufWache,
  LiveSicherheitsStopp,
  SMOKE_MAX_ANBIETER_REQUESTS,
  STANDARD_LIMIT_USD_CENT,
  beurteileLaufBudget,
  beurteileBudget,
  fetchMitZeitgrenze,
  formatiereUsdCent,
  holeBudgetStand,
  liesBudgetLimit,
  liesBudgetVerbindung,
  main,
  meldeTestkontoAn,
  starteBefehl,
  wirksamesBudgetLimit,
} from "./tools/ai_budget_guard.mjs";

let ok = 0;
const fehler = [];
function check(name, bedingung) {
  if (bedingung) {
    ok += 1;
    console.log("✓ " + name);
  } else {
    fehler.push(name);
    console.log("✗ " + name);
  }
}

function fakeAntwort(status, daten) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return daten; },
  };
}

const BASIS_ENV = {
  KD_SB_URL: "https://projekt.supabase.co",
  KD_SB_ANON: "sb_publishable_test",
  KD_TESTA_PASS: "streng-geheim",
};

check("Standardgrenze sind 500 US-Cent",
  liesBudgetLimit({}) === STANDARD_LIMIT_USD_CENT && STANDARD_LIMIT_USD_CENT === 500);
check("eine ausdrückliche kleinere Grenze wird als Zahl gelesen",
  liesBudgetLimit({ KD_AI_AUTONOM_LIMIT_USD_CENT: "125.5" }) === 125.5);

for (const wert of ["0", "-1", "NaN", "Infinity", "1000001"]) {
  let geworfen = false;
  try { liesBudgetLimit({ KD_AI_AUTONOM_LIMIT_USD_CENT: wert }); } catch (e) {
    geworfen = e instanceof BudgetKonfigFehler;
  }
  check(`ungültige Budgetgrenze ${wert} wird fail-closed abgewiesen`, geworfen);
}

const verbindung = liesBudgetVerbindung(BASIS_ENV);
check("Verbindung nutzt ausschließlich erwartete öffentliche Werte und das Testkonto",
  verbindung.urlBasis === BASIS_ENV.KD_SB_URL
  && verbindung.anon === BASIS_ENV.KD_SB_ANON
  && verbindung.passwort === BASIS_ENV.KD_TESTA_PASS
  && verbindung.benutzer === "testa"
  && verbindung.funktion === "ai-task");
const ownerVerbindung = liesBudgetVerbindung({ ...BASIS_ENV, KD_AI_OWNER_APPROVED_SERVER_BUDGET: "1" });
check("explizite Owner-Freigabe ersetzt nur die lokale Ersatzgrenze durch den Serverdeckel",
  ownerVerbindung.nutzeServerBudget === true
  && wirksamesBudgetLimit({ serverLimitUsdCent: 1000 }, ownerVerbindung) === 1000
  && wirksamesBudgetLimit({ serverLimitUsdCent: 1000 }, verbindung) === 500);
let kaputteOwnerFreigabe = false;
try { liesBudgetVerbindung({ ...BASIS_ENV, KD_AI_OWNER_APPROVED_SERVER_BUDGET: "ja" }); } catch (e) {
  kaputteOwnerFreigabe = e instanceof BudgetKonfigFehler;
}
check("formfremde Owner-Freigabe stoppt fail-closed", kaputteOwnerFreigabe);

let ohnePasswort = false;
try { liesBudgetVerbindung({ ...BASIS_ENV, KD_TESTA_PASS: "" }); } catch (e) {
  ohnePasswort = e instanceof BudgetKonfigFehler && !e.message.includes("streng-geheim");
}
check("fehlendes Passwort stoppt, ohne einen Geheimwert zu spiegeln", ohnePasswort);

const loginRufe = [];
const token = await meldeTestkontoAn(verbindung, async (url, optionen) => {
  loginRufe.push({ url, optionen });
  return fakeAntwort(200, { access_token: "sitzung-token" });
});
check("Testkonto-Anmeldung liefert die Sitzung", token === "sitzung-token");
check("Testkonto-Anmeldung sendet das Passwort nur im POST-Körper",
  loginRufe.length === 1
  && loginRufe[0].optionen.method === "POST"
  && JSON.parse(loginRufe[0].optionen.body).password === BASIS_ENV.KD_TESTA_PASS
  && !loginRufe[0].url.includes(BASIS_ENV.KD_TESTA_PASS));

const gesundRufe = [];
const stand = await holeBudgetStand({
  verbindung,
  token,
  fetchImpl: async (url, optionen) => {
    gesundRufe.push({ url, optionen });
    return fakeAntwort(200, {
      ok: true,
      betrieb: {
        monatsbudgetUsdCent: 1000,
        anbieterRequestMaxUsdCent: 500,
        anbieterRequestOwnerMaxUsdCent: 500,
        anbieterRequestTimeoutMs: 120000,
        anbieterRequestTimeoutOwnerMaxMs: 135000,
        stand: {
          monatVerbrauchtUsdCent: 12.345678,
          budgetErschoepft: false,
        },
      },
    });
  },
});
check("Budgetstand übernimmt den serverseitig gebuchten Istwert",
  stand.verbrauchtUsdCent === 12.345678
  && stand.serverLimitUsdCent === 1000
  && stand.anbieterRequestLimitUsdCent === 500
  && stand.anbieterRequestTimeoutMs === 120000
  && stand.globalesBudgetErschoepft === false);
check("Budgetstand nutzt ausschließlich die kostenfreie health-Aufgabe",
  gesundRufe.length === 1
  && JSON.parse(gesundRufe[0].optionen.body).task === "health"
  && gesundRufe[0].optionen.headers.Authorization === "Bearer sitzung-token");

const darunter = beurteileBudget(
  { verbrauchtUsdCent: 499.999999, globalesBudgetErschoepft: false },
  500,
);
check("knapp unter der Grenze darf ein weiterer serieller Test beginnen",
  darunter.erlaubt === true && darunter.restUsdCent > 0);
check("exakt an der Grenze gilt AUTONOMIE_STOPP",
  beurteileBudget(
    { verbrauchtUsdCent: 500, globalesBudgetErschoepft: false },
    500,
  ).autonomErschoepft === true);
check("über der Grenze gilt AUTONOMIE_STOPP",
  beurteileBudget(
    { verbrauchtUsdCent: 501, globalesBudgetErschoepft: false },
    500,
  ).erlaubt === false);
check("der globale Serverdeckel stoppt auch unter der Agentengrenze",
  beurteileBudget(
    { verbrauchtUsdCent: 1, globalesBudgetErschoepft: true },
    500,
  ).globalErschoepft === true);

let kaputterStand = false;
try {
  await holeBudgetStand({
    verbindung,
    token,
    fetchImpl: async () => fakeAntwort(200, {
      ok: true,
      betrieb: {
        monatsbudgetUsdCent: 1000,
        anbieterRequestMaxUsdCent: 500,
        anbieterRequestOwnerMaxUsdCent: 500,
        anbieterRequestTimeoutMs: 120000,
        anbieterRequestTimeoutOwnerMaxMs: 135000,
        stand: { monatVerbrauchtUsdCent: "12.3", budgetErschoepft: false },
      },
    }),
  });
} catch (e) {
  kaputterStand = /nicht verlässlich lesbar/.test(e.message);
}
check("ein formfremder Kostenstand wird nicht still umgedeutet", kaputterStand);
check("US-Cent werden ohne falsche Euro-Behauptung formatiert",
  formatiereUsdCent(0.0337) === "0,0337");
check("eigene Exit-Codes unterscheiden Stopp und unbekannten Stand",
  AUTONOMIE_STOPP_EXIT === 75 && BUDGET_UNBEKANNT_EXIT === 74);

check("unveraenderliche Live-Grenzen bilden 500 Cent je Request und 1500 Cent je Lauf ab",
  ANBIETER_REQUEST_LIMIT_USD_CENT === 500
  && LAUF_LIMIT_USD_CENT === 1500
  && ENTDECKEN_LAUF_LIMIT_USD_CENT === 900
  && SMOKE_MAX_ANBIETER_REQUESTS === 9
  && EVAL_MAX_ANBIETER_REQUESTS === 20
  && LIVE_PROCESS_TIMEOUT_MS === 15 * 60_000);

check("Laufdelta wird aus zwei serverseitigen Messstaenden gebildet",
  beurteileLaufBudget(
    { verbrauchtUsdCent: 20 },
    { verbrauchtUsdCent: 34.5 },
  ).verbrauchtUsdCent === 14.5);

let kostenStand = 100;
const laufWache = new LiveLaufWache({
  maxAnbieterRequests: 2,
  standLeser: async () => ({
    verbrauchtUsdCent: kostenStand,
    globalesBudgetErschoepft: false,
    anbieterRequestLimitUsdCent: 500,
    anbieterRequestTimeoutMs: 120000,
  }),
});
await laufWache.initialisiere();
const request1 = await laufWache.vorAnbieterRequest("Probe 1");
kostenStand = 104.25;
const request1Stand = await laufWache.nachAnbieterRequest(request1, 4.25);
check("serielle Laufwache misst Request- und Laufkosten nach jedem Provideraufruf",
  request1Stand.requestKostenUsdCent === 4.25
  && request1Stand.laufKostenUsdCent === 4.25);

const request2 = await laufWache.vorAnbieterRequest("Probe 2");
kostenStand = 105;
await laufWache.nachAnbieterRequest(request2, 0.75);
let requestzahlStoppt = false;
try { await laufWache.vorAnbieterRequest("Probe 3"); } catch (error) {
  requestzahlStoppt = error instanceof LiveSicherheitsStopp
    && error.exitCode === AUTONOMIE_STOPP_EXIT;
}
check("feste Anbieterrequest-Zahl stoppt eine unkontrollierte Wiederholung",
  requestzahlStoppt);

let pufferStand = 0;
const pufferWache = new LiveLaufWache({
  maxAnbieterRequests: 2,
  standLeser: async () => ({
    verbrauchtUsdCent: pufferStand,
    globalesBudgetErschoepft: false,
    anbieterRequestLimitUsdCent: 500,
    anbieterRequestTimeoutMs: 120000,
  }),
});
await pufferWache.initialisiere();
pufferStand = 1000.000001;
let laufPufferStoppt = false;
try { await pufferWache.vorAnbieterRequest("zu teuer"); } catch (error) {
  laufPufferStoppt = error instanceof LiveSicherheitsStopp
    && error.exitCode === AUTONOMIE_STOPP_EXIT;
}
check("vor jedem Request bleiben 500 Cent Puffer unter dem 1500-Cent-Laufdeckel",
  laufPufferStoppt);

let entdeckenPufferStand = 0;
const entdeckenPufferWache = new LiveLaufWache({
  maxAnbieterRequests: 1,
  laufLimitUsdCent: ENTDECKEN_LAUF_LIMIT_USD_CENT,
  standLeser: async () => ({
    verbrauchtUsdCent: entdeckenPufferStand,
    globalesBudgetErschoepft: false,
    anbieterRequestLimitUsdCent: 500,
    anbieterRequestTimeoutMs: 120000,
  }),
});
await entdeckenPufferWache.initialisiere();
entdeckenPufferStand = 400.000001;
let entdeckenPufferStoppt = false;
try { await entdeckenPufferWache.vorAnbieterRequest("Entdecken"); } catch (error) {
  entdeckenPufferStoppt = error instanceof LiveSicherheitsStopp
    && error.exitCode === AUTONOMIE_STOPP_EXIT;
}
check("Entdecken-Livepfad erzwingt vorab seinen niedrigeren 900-Cent-Laufdeckel",
  entdeckenPufferStoppt);

let requestStand = 0;
const requestWache = new LiveLaufWache({
  maxAnbieterRequests: 1,
  standLeser: async () => ({
    verbrauchtUsdCent: requestStand,
    globalesBudgetErschoepft: false,
    anbieterRequestLimitUsdCent: 500,
    anbieterRequestTimeoutMs: 120000,
  }),
});
await requestWache.initialisiere();
const teurerRequest = await requestWache.vorAnbieterRequest("Ausreisser");
requestStand = 500.000001;
let einzelStoppt = false;
try { await requestWache.nachAnbieterRequest(teurerRequest, 500.000001); } catch (error) {
  einzelStoppt = error instanceof LiveSicherheitsStopp
    && error.exitCode === AUTONOMIE_STOPP_EXIT;
}
check("ein gemessener Request ueber 500 Cent stoppt sofort", einzelStoppt);

let timeoutStoppt = false;
try {
  await fetchMitZeitgrenze("https://projekt.supabase.co/haengt", {}, {
    fetchImpl: async () => await new Promise(() => {}),
    timeoutMs: 5,
  });
} catch (error) {
  timeoutStoppt = error instanceof LiveSicherheitsStopp
    && error.exitCode === BUDGET_UNBEKANNT_EXIT;
}
check("Request-Timeout stoppt auch ein Fetch, das Abort ignoriert", timeoutStoppt);

let koerperTimeoutStoppt = false;
try {
  const haengendeAntwort = await fetchMitZeitgrenze("https://projekt.supabase.co/koerper", {}, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() { return await new Promise(() => {}); },
    }),
    timeoutMs: 5,
  });
  await haengendeAntwort.json();
} catch (error) {
  koerperTimeoutStoppt = error instanceof LiveSicherheitsStopp
    && error.exitCode === BUDGET_UNBEKANNT_EXIT;
}
check("Request-Timeout umfasst auch einen haengenden Antwortkoerper",
  koerperTimeoutStoppt);

const signale = [];
const prozessErgebnis = await starteBefehl("fest-verdrahtet", [], {
  timeoutMs: 5,
  killGraceMs: 5,
  spawnImpl() {
    const kind = new EventEmitter();
    kind.kill = (signal) => {
      signale.push(signal);
      queueMicrotask(() => kind.emit("exit", null, signal));
      return true;
    };
    return kind;
  },
});
check("feste Prozesszeitgrenze beendet den Kindlauf ohne Neustart",
  prozessErgebnis.zeitUeberschritten === true
  && prozessErgebnis.exitCode === 1
  && signale[0] === "SIGTERM");

const ignorierteSignale = [];
const erzwungenesProzessErgebnis = await starteBefehl("fest-verdrahtet", [], {
  timeoutMs: 5,
  killGraceMs: 5,
  spawnImpl() {
    const kind = new EventEmitter();
    kind.kill = (signal) => {
      ignorierteSignale.push(signal);
      return true;
    };
    return kind;
  },
});
check("Prozesszeitgrenze endet fail-closed, auch wenn nach SIGKILL kein exit kommt",
  erzwungenesProzessErgebnis.zeitUeberschritten === true
  && erzwungenesProzessErgebnis.exitCode === 1
  && ignorierteSignale.join(",") === "SIGTERM,SIGKILL");

const kostenMigration = readFileSync(
  "supabase/migrations/20260808120000_ai_anbieter_request_kostenzaun.sql",
  "utf8",
);
const releaseDoku = readFileSync("docs/FUNCTION_RELEASES.md", "utf8");
const functionIndex = readFileSync("supabase/functions/ai-task/index.ts", "utf8");
const smokeSkript = readFileSync("tools/ai_smoke.mjs", "utf8");
const evalSkript = readFileSync("tools/ai_eval_etappe6.mjs", "utf8");
const p8Abschnitt = smokeSkript.slice(
  smokeSkript.indexOf("/* --- P8:"),
  smokeSkript.indexOf("/* --- P9:"),
);
const p8Position = smokeSkript.indexOf("const p8 = await ruf(");
const p5CapabilityPos = smokeSkript.indexOf('pruefeBlogProfilCapabilityAbschnitt("P5", p5);');
const p22Start = smokeSkript.indexOf("P22: Synthetische Ein-Artikel-Blog-Profilextraktion (bewacht)");
const p22AbschnittsEnde = p22Start >= 0
  ? smokeSkript.indexOf("\n/* ===========================================================================", p22Start + 1)
  : -1;
const p22Abschnitt = p22Start >= 0 && p22AbschnittsEnde > p22Start
  ? smokeSkript.slice(p22Start, p22AbschnittsEnde)
  : "";
check("Migration erzwingt den 500-Cent-Zaun atomar vor der Anbieter-RPC",
  /anbieter_request_max_usd_cent/.test(kostenMigration)
  && /::numeric > 500/.test(kostenMigration)
  && /claude-sonnet-5[\s\S]{0,1200}300[\s\S]{0,1200}1500/.test(kostenMigration)
  && /filmwissen-synthese[\s\S]{0,1200}greatest[\s\S]{0,800}6::numeric[\s\S]{0,200}500::numeric/.test(kostenMigration)
  && /media-batch-extract[\s\S]{0,900}4::numeric/.test(kostenMigration)
  && /p_reservierung > v_wirksam/.test(kostenMigration)
  && /p_task = 'filmwissen-synthese'[\s\S]{0,100}p_modell_alias is distinct from 'gross'/.test(kostenMigration)
  && /kd_ai_auftrag_starten_ohne_task_cap/.test(kostenMigration));
const functionDeployPosition = releaseDoku.indexOf(
  "./node_modules/.bin/supabase functions deploy ai-task --project-ref bscjgwcntapobyxsiyce",
);
const buildSecretPosition = releaseDoku.indexOf(
  "./node_modules/.bin/supabase secrets set KD_FUNCTION_BUILD_VERSION=\"$KD_FUNCTION_COMMIT\" --project-ref bscjgwcntapobyxsiyce",
);
check("Release-Reihenfolge deployt Code vor Secret und hält die Migrationen geordnet",
  functionDeployPosition >= 0
  && buildSecretPosition > functionDeployPosition
  && releaseDoku.indexOf("20260801194500_stapelimport_medien.sql")
    < releaseDoku.indexOf("20260808120000_ai_anbieter_request_kostenzaun.sql"));
check("Function prueft denselben Kostenzaun vor kd_ai_auftrag_starten und meldet ihn in health",
  functionIndex.indexOf("pruefeAnbieterKostenzaun(")
    < functionIndex.indexOf('admin.rpc(\n    "kd_ai_auftrag_starten"')
  && /anbieterRequestOwnerMaxUsdCent: ANBIETER_REQUEST_MAX_USD_CENT/.test(functionIndex));
check("Rauchprobe verdrahtet genau neun bewachte Pfade durch dieselbe Laufwache",
  (smokeSkript.match(/await rufAnbieterBewacht\(/g) || []).length === 9
  && (smokeSkript.match(/await rufAnbieterBewachtMitCapability\(/g) || []).length === 0
  && (smokeSkript.match(/task: "anbieter-modelle"/g) || []).length === 1
  && /maxAnbieterRequests: SMOKE_MAX_ANBIETER_REQUESTS/.test(smokeSkript)
  && /async function ruf[\s\S]{0,350}fetchMitZeitgrenze/.test(smokeSkript)
  && (p8Abschnitt.match(/const p8 = await ruf\(/g) || []).length === 1
  && !/\b(?:for|while)\s*\(/.test(p8Abschnitt)
  && !/await Promise\.all\(/.test(smokeSkript));
check("P5-Capability-Guard liegt vor P8 im Smoke auf der vorhandenen P5-Healthantwort",
  /pruefeBlogProfilCapabilityAbschnitt\("P5", p5\);/.test(smokeSkript)
  && p5CapabilityPos >= 0
  && p8Position > p5CapabilityPos
  && /import \{ hatBlogProfileAnalyseCapability \} from "\.\.\/src\/lib\/blogProfilAnalyse\.js"/.test(smokeSkript)
  && /pruefeBlogProfilCapabilityAbschnitt\(/.test(smokeSkript));
check("Rauchprobe ersetzt P22 durch genau einen Ein-Artikel-Blog-Capability-Aufruf",
  (smokeSkript.match(/task: "blog-profile-extract"/g) || []).length === 1
  && !/task: "profile-extract"/.test(smokeSkript)
  && /const BLOG_PROFILE_ARTIKEL =/.test(smokeSkript)
  && /artikel:\s*BLOG_PROFILE_ARTIKEL/.test(p22Abschnitt)
  && /await rufAnbieterBewacht\(\s*"P22 blog-profile-extract"/.test(smokeSkript));
check("Kein Health-Vorab-Call pro bewachtem Pfad, stattdessen genau ein P5-Guard",
  !/rufAnbieterBewachtMitCapability\(/.test(smokeSkript)
  && !/pruefeHealthVorBewachtemPfad\(/.test(smokeSkript));
check("Eval ist eine feste serielle 20er-Schleife ohne Promise-All oder Retry-Schleife",
  /ANFRAGEN\.length !== EVAL_MAX_ANBIETER_REQUESTS/.test(evalSkript)
  && /for \(const anfrage of ANFRAGEN\)/.test(evalSkript)
  && /vorAnbieterRequest\(`Eval/.test(evalSkript)
  && !/Promise\.all|\bwhile\s*\(/.test(evalSkript));
check("Smoke und Eval lesen die aktuelle Finder-Taxonomie statt alter Zwischenwerte",
  [smokeSkript, evalSkript].every((skript) =>
    /finder_vokabular\.json/.test(skript)
    && /Object\.keys\(FINDER_VOKABULAR\.kategorien/.test(skript)
    && /Object\.keys\(FINDER_VOKABULAR\.stimmungen/.test(skript))
  && !/\["sicher_gut", "wahrscheinlich_passend", "referenz", "zu_pruefen"\]/
    .test(smokeSkript + evalSkript));
const evalListen = {
  genres: ["horror"], kategorien: ["immer_gut"],
  stimmungen: ["duster"], quellen: ["kino"], zeit: ["morgen"],
};
check("Eval prueft Whitelists feldspezifisch statt ueber eine gemeinsame Union",
  fremdeEvalWerte({ harte_filter: { kategorien: ["horror"] } }, evalListen)
    .includes("harte_filter.kategorien=horror")
  && fremdeEvalWerte({ harte_filter: { genres: ["horror"] } }, evalListen).length === 0);
check("Eval verbietet bei ausserhalb-Faellen zugleich jeden wirkenden Filter oder Titel",
  hatWirkendeEvalDeutung({ harte_filter: { titel: ["Scary Movie 1"] } }) === true
  && hatWirkendeEvalDeutung({ entdecken: true }) === true
  && hatWirkendeEvalDeutung({
    harte_filter: {}, weiche_wuensche: {}, ausschluesse: {}, entdecken: false,
  }) === false);

const alteUmgebung = {
  KD_SB_URL: process.env.KD_SB_URL,
  KD_SB_ANON: process.env.KD_SB_ANON,
  KD_TESTA_PASS: process.env.KD_TESTA_PASS,
};
delete process.env.KD_SB_URL;
delete process.env.KD_SB_ANON;
delete process.env.KD_TESTA_PASS;
const fehlerAusgabe = [];
const altesConsoleError = console.error;
console.error = (...teile) => { fehlerAusgabe.push(teile.join(" ")); };
const ohneZugangExit = await main([
  "--",
  process.execPath,
  "-e",
  "process.exit(99)",
]);
console.error = altesConsoleError;
for (const [name, wert] of Object.entries(alteUmgebung)) {
  if (wert === undefined) delete process.env[name];
  else process.env[name] = wert;
}
check("ohne messbaren Budgetstand startet der nachgeschaltete Befehl nicht",
  ohneZugangExit === BUDGET_UNBEKANNT_EXIT
  && fehlerAusgabe.some((zeile) => zeile.includes("Fail-closed")));

console.log(`\n${ok}/${ok + fehler.length} Budget-Agent-Checks bestanden.`);
if (fehler.length) {
  console.log("BUDGET-AGENT-TEST FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("BUDGET-AGENT-TEST BESTANDEN (0 echte KI-Aufrufe)");

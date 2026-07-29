#!/usr/bin/env node
/* Kostenfreie Modultests für tools/ai_budget_guard.mjs.
   Kein Test meldet sich an, kein Test ruft Supabase oder einen Anbieter auf. */

import {
  AUTONOMIE_STOPP_EXIT,
  BUDGET_UNBEKANNT_EXIT,
  BudgetKonfigFehler,
  STANDARD_LIMIT_USD_CENT,
  beurteileBudget,
  formatiereUsdCent,
  holeBudgetStand,
  liesBudgetLimit,
  liesBudgetVerbindung,
  main,
  meldeTestkontoAn,
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

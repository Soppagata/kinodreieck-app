#!/usr/bin/env node
/* Kostenwächter für ECHTE KI-Tests.
   ==========================================================================
   Normale Projekt- und Function-Tests mocken den Anbieter und kosten nichts.
   Dieser Wächter gehört ausschließlich vor Live-Rauchproben und Live-Evals:

     node tools/ai_budget_guard.mjs -- node tools/ai_smoke.mjs

   Er meldet sich mit dem begrenzten Testkonto an und liest über die kostenfreie
   `health`-Aufgabe den serverseitig gebuchten Monatsverbrauch. Der geprüfte
   Befehl läuft nur, wenn dieser Stand lesbar und unter der Grenze ist. Danach
   wird erneut gelesen und die Differenz ausgegeben.

   Die Datenbank führt US-Cent. Deshalb ist die technische Standardgrenze
   500 US-Cent. Das ist eine bewusst konservative Ersatzgrenze für Max'
   gewünschte 5-Euro-Autonomiegrenze, keine Wechselkurs- oder Rechnungszusage.
   Überschreiben nur nach ausdrücklicher Freigabe:

     KD_AI_AUTONOM_LIMIT_USD_CENT=500

   Exit 75 + AUTONOMIE_STOPP bedeutet für jeden Agenten:
   keine weiteren echten KI-Tests; im Chat melden und Freigabe abwarten.

   Zugang ausschließlich über Umgebungsvariablen, nie über Argumente:
   KD_SB_URL, KD_SB_ANON, KD_TESTA_PASS; optional KD_TESTA_USER,
   KD_MAIL_DOMAIN, KD_AI_FUNKTION, KD_ORIGIN.
   ========================================================================== */

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const STANDARD_LIMIT_USD_CENT = 500;
export const AUTONOMIE_STOPP_EXIT = 75;
export const BUDGET_UNBEKANNT_EXIT = 74;

const URL_FORM = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
const FUNKTION_FORM = /^[a-z0-9][a-z0-9-]{0,62}$/i;

export class BudgetKonfigFehler extends Error {
  constructor(message) {
    super(message);
    this.name = "BudgetKonfigFehler";
  }
}

export function liesBudgetLimit(env = process.env) {
  const roh = String(env.KD_AI_AUTONOM_LIMIT_USD_CENT ?? "").trim();
  if (!roh) return STANDARD_LIMIT_USD_CENT;
  const wert = Number(roh);
  if (!Number.isFinite(wert) || wert <= 0 || wert > 1_000_000) {
    throw new BudgetKonfigFehler(
      "KD_AI_AUTONOM_LIMIT_USD_CENT muss eine endliche positive Zahl sein.",
    );
  }
  return wert;
}

export function liesBudgetVerbindung(env = process.env) {
  const urlBasis = String(env.KD_SB_URL ?? "").trim().replace(/\/+$/, "");
  const anon = String(env.KD_SB_ANON ?? "").trim();
  const passwort = String(env.KD_TESTA_PASS ?? "");
  const benutzer = String(env.KD_TESTA_USER ?? "testa").trim();
  const mailDomain = String(env.KD_MAIL_DOMAIN ?? "login.kinodreieck.at").trim();
  const funktion = String(env.KD_AI_FUNKTION ?? "ai-task").trim();
  const origin = String(env.KD_ORIGIN ?? "https://kinodreieck.at").trim();

  if (!URL_FORM.test(urlBasis) || !anon || !passwort) {
    throw new BudgetKonfigFehler(
      "Budgetprüfung braucht KD_SB_URL, KD_SB_ANON und KD_TESTA_PASS.",
    );
  }
  if (!benutzer || !/^[a-z0-9._-]+$/i.test(benutzer)
    || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(mailDomain)
    || !FUNKTION_FORM.test(funktion)
    || !/^https:\/\/[^/\s]+$/i.test(origin)) {
    throw new BudgetKonfigFehler(
      "Benutzer, Mail-Domain, Function-Name oder Origin der Budgetprüfung sind ungültig.",
    );
  }

  return {
    urlBasis,
    anon,
    passwort,
    benutzer,
    mailDomain,
    funktion,
    origin,
    limitUsdCent: liesBudgetLimit(env),
  };
}

export async function meldeTestkontoAn(verbindung, fetchImpl = fetch) {
  const antwort = await fetchImpl(
    `${verbindung.urlBasis}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: verbindung.anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: `${verbindung.benutzer}@${verbindung.mailDomain}`,
        password: verbindung.passwort,
      }),
    },
  );
  const daten = await antwort.json().catch(() => null);
  if (!antwort.ok || typeof daten?.access_token !== "string" || !daten.access_token) {
    throw new Error(`Budget-Testkonto nicht erreichbar (HTTP ${antwort.status}).`);
  }
  return daten.access_token;
}

export async function holeBudgetStand({
  verbindung,
  token,
  fetchImpl = fetch,
}) {
  if (typeof token !== "string" || !token) {
    throw new Error("Budgetprüfung hat keine gültige Testkonto-Sitzung.");
  }
  const antwort = await fetchImpl(
    `${verbindung.urlBasis}/functions/v1/${verbindung.funktion}`,
    {
      method: "POST",
      headers: {
        Origin: verbindung.origin,
        apikey: verbindung.anon,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: "health",
        vorgangId: crypto.randomUUID(),
      }),
    },
  );
  const daten = await antwort.json().catch(() => null);
  const stand = daten?.betrieb?.stand;
  const verbraucht = stand?.monatVerbrauchtUsdCent;
  const serverLimit = daten?.betrieb?.monatsbudgetUsdCent;
  if (!antwort.ok || daten?.ok !== true
    || typeof verbraucht !== "number" || !Number.isFinite(verbraucht) || verbraucht < 0
    || typeof stand?.budgetErschoepft !== "boolean"
    || typeof serverLimit !== "number" || !Number.isFinite(serverLimit) || serverLimit < 0) {
    throw new Error(
      `Budgetstand nicht verlässlich lesbar (HTTP ${antwort.status}).`,
    );
  }
  return {
    verbrauchtUsdCent: verbraucht,
    globalesBudgetErschoepft: stand.budgetErschoepft,
    serverLimitUsdCent: serverLimit,
  };
}

export function beurteileBudget(stand, limitUsdCent) {
  const verbraucht = Number(stand?.verbrauchtUsdCent);
  const limit = Number(limitUsdCent);
  if (!Number.isFinite(verbraucht) || verbraucht < 0
    || !Number.isFinite(limit) || limit <= 0) {
    throw new Error("Budgeturteil hat keinen verlässlichen Zahlenstand.");
  }
  const autonomErschoepft = verbraucht >= limit;
  const globalErschoepft = stand?.globalesBudgetErschoepft === true;
  return {
    erlaubt: !autonomErschoepft && !globalErschoepft,
    autonomErschoepft,
    globalErschoepft,
    restUsdCent: Math.max(0, limit - verbraucht),
  };
}

export function formatiereUsdCent(wert) {
  const zahl = Number(wert);
  if (!Number.isFinite(zahl)) return "?";
  return zahl.toFixed(4).replace(".", ",");
}

export function druckeBudgetStand({
  label,
  stand,
  limitUsdCent,
  vorher = null,
  ausgabe = console.log,
}) {
  const delta = vorher
    ? Math.max(0, stand.verbrauchtUsdCent - vorher.verbrauchtUsdCent)
    : null;
  const zusatz = delta === null
    ? ""
    : ` · seit letzter Prüfung +${formatiereUsdCent(delta)} US-Cent`;
  ausgabe(
    `BUDGET-STAND [${label}]: ${formatiereUsdCent(stand.verbrauchtUsdCent)}`
      + ` / ${formatiereUsdCent(limitUsdCent)} US-Cent im Testkonto-Monat${zusatz}`,
  );
}

export function druckeAutonomieStopp(urteil, ausgabe = console.error) {
  const grund = urteil.globalErschoepft
    ? "Das globale Serverbudget ist ausgeschöpft."
    : "Die autonome Testgrenze ist erreicht.";
  ausgabe(`AUTONOMIE_STOPP: ${grund}`);
  ausgabe("Keine weiteren echten KI-Tests. Im Chat melden und Freigabe abwarten.");
}

async function pruefeStand({ verbindung, token, label, vorher = null, fetchImpl = fetch }) {
  const stand = await holeBudgetStand({ verbindung, token, fetchImpl });
  druckeBudgetStand({ label, stand, limitUsdCent: verbindung.limitUsdCent, vorher });
  const urteil = beurteileBudget(stand, verbindung.limitUsdCent);
  if (!urteil.erlaubt) druckeAutonomieStopp(urteil);
  return { stand, urteil };
}

async function starteBefehl(befehl, argumente) {
  return await new Promise((resolve, reject) => {
    const kind = spawn(befehl, argumente, {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    kind.once("error", reject);
    kind.once("exit", (code, signal) => {
      resolve(signal ? 1 : (Number.isInteger(code) ? code : 1));
    });
  });
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Live-Test mit Budgetwache:");
    console.log("  node tools/ai_budget_guard.mjs -- <befehl> [argumente]");
    console.log("Nur prüfen:");
    console.log("  node tools/ai_budget_guard.mjs --check");
    return 0;
  }

  let verbindung;
  let token;
  try {
    verbindung = liesBudgetVerbindung();
    token = await meldeTestkontoAn(verbindung);
  } catch (e) {
    console.error(`BUDGET_UNBEKANNT: ${e?.message || "Konfiguration oder Anmeldung fehlgeschlagen."}`);
    console.error("Fail-closed: kein echter KI-Test gestartet.");
    return BUDGET_UNBEKANNT_EXIT;
  }

  let vorher;
  try {
    vorher = await pruefeStand({
      verbindung,
      token,
      label: argv[0] === "--check" ? "Kontrolle" : "vor Live-Test",
    });
  } catch (e) {
    console.error(`BUDGET_UNBEKANNT: ${e?.message || "Stand nicht lesbar."}`);
    console.error("Fail-closed: kein echter KI-Test gestartet.");
    return BUDGET_UNBEKANNT_EXIT;
  }
  if (!vorher.urteil.erlaubt) return AUTONOMIE_STOPP_EXIT;
  if (argv[0] === "--check" && argv.length === 1) return 0;

  const trenner = argv.indexOf("--");
  const befehl = trenner >= 0 ? argv[trenner + 1] : null;
  const argumente = trenner >= 0 ? argv.slice(trenner + 2) : [];
  if (!befehl) {
    console.error("Kein Live-Test angegeben. Erwartet: -- <befehl> [argumente]");
    return 2;
  }

  let befehlExit = 1;
  try {
    befehlExit = await starteBefehl(befehl, argumente);
  } catch (e) {
    console.error(`Live-Test konnte nicht gestartet werden: ${e?.message || "unbekannt"}`);
  }

  try {
    const nachher = await pruefeStand({
      verbindung,
      token,
      label: "nach Live-Test",
      vorher: vorher.stand,
    });
    if (!nachher.urteil.erlaubt) return AUTONOMIE_STOPP_EXIT;
  } catch (e) {
    console.error(`BUDGET_UNBEKANNT: ${e?.message || "Stand nach dem Test nicht lesbar."}`);
    console.error("Keine weiteren echten KI-Tests. Im Chat melden und Freigabe abwarten.");
    return BUDGET_UNBEKANNT_EXIT;
  }

  return befehlExit;
}

const direktGestartet = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direktGestartet) process.exit(await main());

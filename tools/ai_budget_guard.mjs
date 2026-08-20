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
   Im finalen Audit kann nur der fest verdrahtete Schlüsselbund-Runner die
   lokale Monatsersatzgrenze bis zum gelesenen Serverdeckel freigeben. Davon
   unberührt bleiben: maximal 500 US-Cent Reservierung je Anbieterrequest,
   maximal 1500 serverseitig gemessene US-Cent je Lauf, feste Requestzahlen,
   Request-/Prozesszeitgrenzen und keine automatischen Wiederholungen.

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
export const OWNER_SERVER_BUDGET_ENV = "KD_AI_OWNER_APPROVED_SERVER_BUDGET";
export const ANBIETER_REQUEST_LIMIT_USD_CENT = 500;
export const LAUF_LIMIT_USD_CENT = 1500;
export const ENTDECKEN_LAUF_LIMIT_USD_CENT = 900;
export const LIVE_REQUEST_TIMEOUT_MS = 135_000;
export const LIVE_PROCESS_TIMEOUT_MS = 15 * 60_000;
export const BUDGET_FETCH_TIMEOUT_MS = 20_000;
export const SMOKE_MAX_ANBIETER_REQUESTS = 9;
export const EVAL_MAX_ANBIETER_REQUESTS = 20;

const URL_FORM = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
const FUNKTION_FORM = /^[a-z0-9][a-z0-9-]{0,62}$/i;

export class BudgetKonfigFehler extends Error {
  constructor(message) {
    super(message);
    this.name = "BudgetKonfigFehler";
  }
}

export class LiveSicherheitsStopp extends Error {
  constructor(art, message) {
    super(message);
    this.name = "LiveSicherheitsStopp";
    this.art = art;
    this.exitCode = art === "limit" ? AUTONOMIE_STOPP_EXIT : BUDGET_UNBEKANNT_EXIT;
  }
}

/* Eine echte Zeitgrenze umfasst auch das Lesen des Antwortkoerpers. `fetch`
   allein loest bereits nach den Headern auf; deshalb bleibt der Abbruch-Timer
   bis zu json()/text()/arrayBuffer() aktiv. Die zusaetzliche Promise-Grenze
   stoppt auch eine fehlerhafte Fetch-Attrappe, die das AbortSignal ignoriert. */
export async function fetchMitZeitgrenze(
  eingabe,
  optionen = {},
  {
    fetchImpl = fetch,
    timeoutMs = LIVE_REQUEST_TIMEOUT_MS,
  } = {},
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > LIVE_PROCESS_TIMEOUT_MS) {
    throw new LiveSicherheitsStopp("unbekannt", "Request-Zeitgrenze ist ungueltig.");
  }
  const controller = new AbortController();
  let fertig = false;
  let timer;
  const raeumeAuf = () => {
    if (fertig) return;
    fertig = true;
    clearTimeout(timer);
  };
  const zeitfehler = new LiveSicherheitsStopp(
    "unbekannt",
    `Request-Zeitgrenze von ${timeoutMs} ms erreicht.`,
  );
  const zeitPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      raeumeAuf();
      reject(zeitfehler);
    }, timeoutMs);
  });

  let antwort;
  try {
    antwort = await Promise.race([
      Promise.resolve(fetchImpl(eingabe, { ...optionen, signal: controller.signal })),
      zeitPromise,
    ]);
  } catch (error) {
    raeumeAuf();
    if (error === zeitfehler || error?.name === "AbortError") throw zeitfehler;
    throw error;
  }

  if ((typeof antwort !== "object" && typeof antwort !== "function") || antwort === null) {
    raeumeAuf();
    throw new LiveSicherheitsStopp("unbekannt", "Fetch lieferte keine Antwort.");
  }

  const koerperMethoden = new Set(["arrayBuffer", "blob", "formData", "json", "text"]);
  return new Proxy(antwort, {
    get(ziel, eigenschaft) {
      const wert = Reflect.get(ziel, eigenschaft, ziel);
      if (typeof wert !== "function") return wert;
      if (!koerperMethoden.has(eigenschaft)) return wert.bind(ziel);
      return async (...argumente) => {
        try {
          return await Promise.race([
            Promise.resolve(wert.apply(ziel, argumente)),
            zeitPromise,
          ]);
        } finally {
          raeumeAuf();
        }
      };
    },
  });
}

export async function liesJsonOderNull(antwort) {
  try {
    return await antwort.json();
  } catch (error) {
    if (error instanceof LiveSicherheitsStopp) throw error;
    return null;
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
  const serverBudgetFreigabe = String(env[OWNER_SERVER_BUDGET_ENV] ?? "").trim();

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
  if (serverBudgetFreigabe && serverBudgetFreigabe !== "1") {
    throw new BudgetKonfigFehler(`${OWNER_SERVER_BUDGET_ENV} hat keinen erlaubten Wert.`);
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
    nutzeServerBudget: serverBudgetFreigabe === "1",
  };
}

export function wirksamesBudgetLimit(stand, verbindung) {
  const limit = verbindung?.nutzeServerBudget
    ? stand?.serverLimitUsdCent
    : verbindung?.limitUsdCent;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("Wirksames Budgetlimit ist nicht verlässlich lesbar.");
  }
  return limit;
}

export async function meldeTestkontoAn(verbindung, fetchImpl = fetch) {
  const antwort = await fetchMitZeitgrenze(
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
    { fetchImpl, timeoutMs: BUDGET_FETCH_TIMEOUT_MS },
  );
  const daten = await liesJsonOderNull(antwort);
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
  const antwort = await fetchMitZeitgrenze(
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
    { fetchImpl, timeoutMs: BUDGET_FETCH_TIMEOUT_MS },
  );
  const daten = await liesJsonOderNull(antwort);
  const stand = daten?.betrieb?.stand;
  const verbraucht = stand?.monatVerbrauchtUsdCent;
  const serverLimit = daten?.betrieb?.monatsbudgetUsdCent;
  const anbieterRequestLimit = daten?.betrieb?.anbieterRequestMaxUsdCent;
  const anbieterRequestOwnerLimit = daten?.betrieb?.anbieterRequestOwnerMaxUsdCent;
  const anbieterRequestTimeout = daten?.betrieb?.anbieterRequestTimeoutMs;
  const anbieterRequestOwnerTimeout = daten?.betrieb?.anbieterRequestTimeoutOwnerMaxMs;
  if (!antwort.ok || daten?.ok !== true
    || typeof verbraucht !== "number" || !Number.isFinite(verbraucht) || verbraucht < 0
    || typeof stand?.budgetErschoepft !== "boolean"
    || typeof serverLimit !== "number" || !Number.isFinite(serverLimit) || serverLimit < 0
    || typeof anbieterRequestLimit !== "number" || !Number.isFinite(anbieterRequestLimit)
    || anbieterRequestLimit <= 0 || anbieterRequestLimit > ANBIETER_REQUEST_LIMIT_USD_CENT
    || anbieterRequestOwnerLimit !== ANBIETER_REQUEST_LIMIT_USD_CENT
    || !Number.isInteger(anbieterRequestTimeout) || anbieterRequestTimeout < 1
    || anbieterRequestTimeout > LIVE_REQUEST_TIMEOUT_MS
    || anbieterRequestOwnerTimeout !== LIVE_REQUEST_TIMEOUT_MS) {
    throw new Error(
      `Budgetstand nicht verlässlich lesbar (HTTP ${antwort.status}).`,
    );
  }
  return {
    verbrauchtUsdCent: verbraucht,
    globalesBudgetErschoepft: stand.budgetErschoepft,
    serverLimitUsdCent: serverLimit,
    anbieterRequestLimitUsdCent: anbieterRequestLimit,
    anbieterRequestTimeoutMs: anbieterRequestTimeout,
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

export function laufVerbrauchUsdCent(vorher, nachher) {
  const vor = Number(vorher?.verbrauchtUsdCent);
  const nach = Number(nachher?.verbrauchtUsdCent);
  if (!Number.isFinite(vor) || vor < 0 || !Number.isFinite(nach) || nach < vor) {
    throw new LiveSicherheitsStopp(
      "unbekannt",
      "Serverseitiger Laufverbrauch ist nicht monoton und verlaesslich messbar.",
    );
  }
  return nach - vor;
}

export function beurteileLaufBudget(vorher, nachher) {
  const verbrauchtUsdCent = laufVerbrauchUsdCent(vorher, nachher);
  return {
    erlaubt: verbrauchtUsdCent <= LAUF_LIMIT_USD_CENT,
    verbrauchtUsdCent,
    restUsdCent: Math.max(0, LAUF_LIMIT_USD_CENT - verbrauchtUsdCent),
  };
}

export class LiveLaufWache {
  constructor({ standLeser, maxAnbieterRequests, laufLimitUsdCent = LAUF_LIMIT_USD_CENT }) {
    if (typeof standLeser !== "function") {
      throw new LiveSicherheitsStopp("unbekannt", "Laufmessung besitzt keinen Standleser.");
    }
    if (!Number.isInteger(maxAnbieterRequests) || maxAnbieterRequests < 1 || maxAnbieterRequests > 100) {
      throw new LiveSicherheitsStopp("unbekannt", "Maximale Anbieterrequest-Zahl ist ungueltig.");
    }
    if (!Number.isFinite(laufLimitUsdCent)
        || laufLimitUsdCent < ANBIETER_REQUEST_LIMIT_USD_CENT
        || laufLimitUsdCent > LAUF_LIMIT_USD_CENT) {
      throw new LiveSicherheitsStopp("unbekannt", "Laufdelta-Deckel ist ungueltig.");
    }
    this.standLeser = standLeser;
    this.maxAnbieterRequests = maxAnbieterRequests;
    this.laufLimitUsdCent = laufLimitUsdCent;
    this.anzahl = 0;
    this.basis = null;
    this.offen = null;
  }

  async liesStand() {
    let stand;
    try {
      stand = await this.standLeser();
    } catch (error) {
      if (error instanceof LiveSicherheitsStopp) throw error;
      throw new LiveSicherheitsStopp(
        "unbekannt",
        `Serverseitige Kostenmessung fehlgeschlagen: ${error?.message || "unbekannt"}`,
      );
    }
    if (!Number.isFinite(stand?.verbrauchtUsdCent) || stand.verbrauchtUsdCent < 0
      || typeof stand?.globalesBudgetErschoepft !== "boolean"
      || !Number.isFinite(stand?.anbieterRequestLimitUsdCent)
      || stand.anbieterRequestLimitUsdCent <= 0
      || stand.anbieterRequestLimitUsdCent > ANBIETER_REQUEST_LIMIT_USD_CENT
      || !Number.isInteger(stand?.anbieterRequestTimeoutMs)
      || stand.anbieterRequestTimeoutMs < 1
      || stand.anbieterRequestTimeoutMs > LIVE_REQUEST_TIMEOUT_MS) {
      throw new LiveSicherheitsStopp(
        "unbekannt",
        "Serverseitige Kosten- oder Einzelrequest-Grenze ist nicht verlaesslich lesbar.",
      );
    }
    if (stand.globalesBudgetErschoepft) {
      throw new LiveSicherheitsStopp("limit", "Das globale Serverbudget ist ausgeschoepft.");
    }
    return stand;
  }

  async initialisiere() {
    if (this.basis) {
      throw new LiveSicherheitsStopp("unbekannt", "Laufwache wurde doppelt initialisiert.");
    }
    this.basis = await this.liesStand();
    return this.basis;
  }

  async vorAnbieterRequest(label = "KI-Anfrage") {
    if (!this.basis || this.offen) {
      throw new LiveSicherheitsStopp("unbekannt", "Laufwache ist nicht bereit oder nicht seriell.");
    }
    if (this.anzahl >= this.maxAnbieterRequests) {
      throw new LiveSicherheitsStopp(
        "limit",
        `Feste Maximalzahl von ${this.maxAnbieterRequests} Anbieterrequests erreicht.`,
      );
    }
    const vorher = await this.liesStand();
    const bisher = laufVerbrauchUsdCent(this.basis, vorher);
    /* Der naechste Request darf laut Server maximal 500 Cent reservieren. Mit
       diesem Vorab-Puffer kann der Laufdeckel nicht erst nachtraeglich um einen
       ganzen Request ueberschritten werden. */
    if (bisher + ANBIETER_REQUEST_LIMIT_USD_CENT > this.laufLimitUsdCent) {
      throw new LiveSicherheitsStopp(
        "limit",
        `Laufdelta-Deckel ${this.laufLimitUsdCent} US-Cent: vor ${label} fehlt der 500-Cent-Sicherheitspuffer.`,
      );
    }
    this.anzahl += 1;
    this.offen = { label, vorher, nummer: this.anzahl };
    return this.offen;
  }

  async nachAnbieterRequest(markierung, antwortKostenUsdCent = null) {
    if (!this.basis || !this.offen || markierung !== this.offen) {
      throw new LiveSicherheitsStopp("unbekannt", "Anbieterrequest wurde nicht seriell abgeschlossen.");
    }
    if (antwortKostenUsdCent !== null
      && (!Number.isFinite(antwortKostenUsdCent) || antwortKostenUsdCent < 0)) {
      throw new LiveSicherheitsStopp("unbekannt", "Antwortkosten sind nicht verlaesslich lesbar.");
    }
    const nachher = await this.liesStand();
    const requestKosten = laufVerbrauchUsdCent(markierung.vorher, nachher);
    const laufKosten = laufVerbrauchUsdCent(this.basis, nachher);
    this.offen = null;
    if (requestKosten > ANBIETER_REQUEST_LIMIT_USD_CENT
      || (antwortKostenUsdCent !== null
        && antwortKostenUsdCent > ANBIETER_REQUEST_LIMIT_USD_CENT)) {
      throw new LiveSicherheitsStopp("limit", "Einzelrequest-Grenze von 500 US-Cent erreicht.");
    }
    if (laufKosten > this.laufLimitUsdCent) {
      throw new LiveSicherheitsStopp("limit", `Laufdelta-Deckel ${this.laufLimitUsdCent} US-Cent erreicht.`);
    }
    return { requestKostenUsdCent: requestKosten, laufKostenUsdCent: laufKosten };
  }
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
  const limitUsdCent = wirksamesBudgetLimit(stand, verbindung);
  druckeBudgetStand({
    label: verbindung.nutzeServerBudget ? `${label}; Owner-Freigabe bis Serverdeckel` : label,
    stand,
    limitUsdCent,
    vorher,
  });
  const urteil = beurteileBudget(stand, limitUsdCent);
  if (!urteil.erlaubt) druckeAutonomieStopp(urteil);
  return { stand, urteil };
}

export async function starteBefehl(
  befehl,
  argumente,
  {
    spawnImpl = spawn,
    timeoutMs = LIVE_PROCESS_TIMEOUT_MS,
    killGraceMs = 2_000,
  } = {},
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > LIVE_PROCESS_TIMEOUT_MS
    || !Number.isInteger(killGraceMs) || killGraceMs < 0 || killGraceMs > 10_000) {
    throw new Error("Live-Prozesszeitgrenze ist ungueltig.");
  }
  return await new Promise((resolve, reject) => {
    const kind = spawnImpl(befehl, argumente, {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    let zeitUeberschritten = false;
    let killTimer = null;
    let abschlussTimer = null;
    let erledigt = false;
    let prozessTimer = null;
    const raeumeTimerAuf = () => {
      if (prozessTimer) clearTimeout(prozessTimer);
      if (killTimer) clearTimeout(killTimer);
      if (abschlussTimer) clearTimeout(abschlussTimer);
    };
    const loeseEinmal = (ergebnis) => {
      if (erledigt) return;
      erledigt = true;
      raeumeTimerAuf();
      resolve(ergebnis);
    };
    prozessTimer = setTimeout(() => {
      zeitUeberschritten = true;
      kind.kill?.("SIGTERM");
      killTimer = setTimeout(() => {
        kind.kill?.("SIGKILL");
        /* Ein defekter Spawn-Adapter oder Kindprozess darf den Waechter auch
           dann nicht endlos festhalten, wenn nach SIGKILL kein `exit`-Event
           mehr kommt. Ein echtes Exit-Event derselben Runde gewinnt; danach
           erzwingt dieser letzte lokale Timer den fail-closed Abschluss. */
        abschlussTimer = setTimeout(() => loeseEinmal({
          exitCode: 1,
          zeitUeberschritten: true,
        }), 0);
      }, killGraceMs);
    }, timeoutMs);
    kind.once("error", (error) => {
      if (erledigt) return;
      erledigt = true;
      raeumeTimerAuf();
      reject(error);
    });
    kind.once("exit", (code, signal) => {
      loeseEinmal({
        exitCode: signal ? 1 : (Number.isInteger(code) ? code : 1),
        zeitUeberschritten,
      });
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

  let befehlErgebnis = { exitCode: 1, zeitUeberschritten: false };
  try {
    befehlErgebnis = await starteBefehl(befehl, argumente);
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
    const laufUrteil = beurteileLaufBudget(vorher.stand, nachher.stand);
    console.log(
      `LAUF-BUDGET: ${formatiereUsdCent(laufUrteil.verbrauchtUsdCent)}`
      + ` / ${formatiereUsdCent(LAUF_LIMIT_USD_CENT)} US-Cent`,
    );
    if (!laufUrteil.erlaubt) {
      console.error("AUTONOMIE_STOPP: 15-Euro-Naeherungsgrenze des Laufs erreicht.");
      return AUTONOMIE_STOPP_EXIT;
    }
  } catch (e) {
    console.error(`BUDGET_UNBEKANNT: ${e?.message || "Stand nach dem Test nicht lesbar."}`);
    console.error("Keine weiteren echten KI-Tests. Im Chat melden und Freigabe abwarten.");
    return BUDGET_UNBEKANNT_EXIT;
  }

  if (befehlErgebnis.zeitUeberschritten) {
    console.error(
      `BUDGET_UNBEKANNT: Live-Test nach ${LIVE_PROCESS_TIMEOUT_MS} ms beendet.`,
    );
    console.error("Keine Wiederholung; keine weiteren echten KI-Tests.");
    return BUDGET_UNBEKANNT_EXIT;
  }
  return befehlErgebnis.exitCode;
}

const direktGestartet = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direktGestartet) process.exit(await main());

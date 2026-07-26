/* Etappe 5 — der geschützte KI-Pfad, festgenagelt.
   ===========================================================================
   Drei Schichten, drei Zusagen:

     lib/aiDriver.js    Was geht über die Leitung? (Account-ID: nein.
                        Token: nur ans eigene Projekt. Hängen: nie.)
     services/ai.js     Wie heißt der Fehler, den der Nutzer sieht?
                        Der gemeldete GRUND schlägt den HTTP-Status.
     services/errors.js Haben die drei neuen Zustände überhaupt eine Stimme?

   Dieser Test läuft ALLE Checks durch und meldet am Ende „N/M". Ein einzelner
   roter Check soll die übrigen Befunde nicht verdecken — der Exit-Code ist
   trotzdem 1, sobald einer fehlschlägt.
   =========================================================================== */

const speicher = new Map();
globalThis.localStorage = {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => void speicher.set(k, String(v)),
  removeItem: (k) => void speicher.delete(k),
  clear: () => speicher.clear(),
};

const {
  AI_TIMEOUT_MS, aiTokenErlaubt, baueAiEndpunktUrl, createAiTransport,
} = await import("./src/lib/aiDriver.js");
const { AI_PROMPT_VERSION, AI_TASKS, createAiService } = await import("./src/services/ai.js");
const {
  BoundaryError, ERROR_CODES, errorFromStatus, errorText,
} = await import("./src/services/errors.js");
const { createAuthService } = await import("./src/services/auth.js");

let ok = 0;
const rot = [];
const check = (name, bedingung) => {
  if (bedingung) { ok++; console.log("✓ " + name); return; }
  rot.push(name);
  console.log("✗ FEHLGESCHLAGEN: " + name);
};

/* ===========================================================================
   Attrappen
   =========================================================================== */
const PROJEKT = "https://projekt-a.supabase.co";
const PUBKEY = "sb_publishable_ai_test";
const TOKEN = "test-sitzungstoken-ai-platzhalter";
/* Die Account-ID ist absichtlich ein wiedererkennbarer Fremdkörper: nur so lässt
   sich im gesendeten Body-String belegen, dass sie NICHT drinsteht. */
const KONTO_ID = "konto-4711-darf-nicht-raus";
const NUTZLAST_MARKE = "nutzlast-marke-7f3a";
const KONFIG = Object.freeze({ supabaseUrl: PROJEKT, supabasePublishableKey: PUBKEY });

function abbruchFehler() {
  const e = new Error("Abgebrochen (Test)");
  e.name = "AbortError";
  return e;
}
function spur(url, opts) {
  return {
    url: String(url),
    methode: opts?.method || null,
    headers: opts?.headers || {},
    body: typeof opts?.body === "string" ? opts.body : null,
    signal: opts?.signal || null,
  };
}
function jsonAntwort(status, koerper) {
  return { ok: status >= 200 && status < 300, status, json: async () => koerper };
}
function kaputteAntwort(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { throw new SyntaxError("Unexpected token '<' (Test)"); },
  };
}
/* Antwortet sofort — wie ein gesunder Server. */
function antwortendesFetch(rufe, antwort) {
  return async (url, opts = {}) => {
    rufe.push(spur(url, opts));
    if (opts.signal?.aborted) throw abbruchFehler();
    return typeof antwort === "function" ? antwort() : antwort;
  };
}
/* Antwortet NIE — wie ein hängender Anbieter. Bricht nur auf das Signal hin ab,
   genau wie echtes fetch. */
function haengendesFetch(rufe) {
  return (url, opts = {}) => {
    rufe.push(spur(url, opts));
    return new Promise((_, ablehnen) => {
      const s = opts.signal;
      if (s?.aborted) { ablehnen(abbruchFehler()); return; }
      s?.addEventListener?.("abort", () => ablehnen(abbruchFehler()), { once: true });
    });
  };
}
const STANDARD_RUF = Object.freeze({
  endpointName: "ai-task", task: "health", schemaVersion: 2, promptVersion: "v1",
  profilVersion: null, vorgangId: "11111111-2222-4333-8444-555555555555",
  accountId: KONTO_ID, payload: { marke: NUTZLAST_MARKE },
});

/* ===========================================================================
   TREIBER — reine Regeln (ohne Netz prüfbar)
   =========================================================================== */
console.log("\n--- Treiber: Endpunkt-URL und Projektbindung ---");

check("Die Endpunkt-URL ist exakt <supabaseUrl>/functions/v1/<endpointName>",
  baueAiEndpunktUrl(PROJEKT, "ai-task") === "https://projekt-a.supabase.co/functions/v1/ai-task");
check("Schrägstriche am Ende und Leerraum ändern die Endpunkt-URL nicht",
  baueAiEndpunktUrl("  https://projekt-a.supabase.co///  ", "  ai-task  ")
  === "https://projekt-a.supabase.co/functions/v1/ai-task");
check("Ohne Projekt-URL oder ohne Endpunktnamen entsteht gar keine URL",
  baueAiEndpunktUrl("", "ai-task") === null
  && baueAiEndpunktUrl(PROJEKT, "") === null
  && baueAiEndpunktUrl(PROJEKT, null) === null
  && baueAiEndpunktUrl(null, null) === null);
check("aiTokenErlaubt gilt nur für die Projektform https://<ref>.supabase.co",
  aiTokenErlaubt(PROJEKT) === true
  && aiTokenErlaubt("https://ki.example.org") === false
  && aiTokenErlaubt("https://projekt-a.supabase.co.angreifer.example") === false
  && aiTokenErlaubt("http://projekt-a.supabase.co") === false
  && aiTokenErlaubt("") === false);
check("AI_TIMEOUT_MS ist gesetzt und großzügiger als die Serverzeitgrenze von 30 s",
  Number.isFinite(AI_TIMEOUT_MS) && AI_TIMEOUT_MS > 30000);

/* ===========================================================================
   T1/T4/T5 — was wirklich über die Leitung geht
   =========================================================================== */
console.log("\n--- Treiber: der gesendete Request ---");

const rufe1 = [];
let tokenGriffe1 = 0;
const transport1 = createAiTransport({
  config: KONFIG,
  getAccessToken: async () => { tokenGriffe1++; return TOKEN; },
  fetchImpl: antwortendesFetch(rufe1, jsonAntwort(200, { ok: true, daten: { treffer: [] } })),
});
const erg1 = await transport1({ ...STANDARD_RUF });
const ruf1 = rufe1[0] || {};
const koerper1 = ruf1.body ? JSON.parse(ruf1.body) : {};

/* Eichung zuerst: eine Suche im Body-String muss überhaupt etwas finden können,
   sonst wäre jedes „steht nicht drin" wertlos. */
check("T1-Eichung: der gesendete Body ist echtes JSON und trägt die Nutzlast-Marke",
  rufe1.length === 1 && typeof ruf1.body === "string"
  && ruf1.body.includes(NUTZLAST_MARKE)
  && koerper1.payload?.marke === NUTZLAST_MARKE
  && koerper1.task === "health");
check("T1: die Account-ID steht NICHT im gesendeten Body",
  !ruf1.body.includes(KONTO_ID) && !/account/i.test(ruf1.body));
check("T1: die Account-ID steht auch nicht in der URL oder in den Kopfzeilen",
  !ruf1.url.includes(KONTO_ID) && !JSON.stringify(ruf1.headers).includes(KONTO_ID));
check("T1: gesendet werden genau die sechs vereinbarten Felder — kein Feld mehr",
  Object.keys(koerper1).sort().join(",")
  === "payload,profilVersion,promptVersion,schemaVersion,task,vorgangId");
/* Dass der Aufrufer die Account-ID überhaupt mitgibt, steht in STANDARD_RUF und
   wird weiter unten am echten Aufrufvertrag der Fassade nachgewiesen
   („Die Fassade übergibt dem Transport die Account-ID …“) — ohne den wäre T1
   eine Aussage über nichts. */
check("T4: der Request geht an genau <supabaseUrl>/functions/v1/<endpointName>",
  ruf1.url === "https://projekt-a.supabase.co/functions/v1/ai-task");
check("T4: es ist ein POST mit JSON-Kopf",
  ruf1.methode === "POST" && ruf1.headers["Content-Type"] === "application/json");

/* Gegenprobe: der Endpunktname kommt wirklich aus dem Aufruf, nicht aus einer
   Konstanten im Treiber. */
const rufe1b = [];
await createAiTransport({
  config: KONFIG,
  getAccessToken: async () => TOKEN,
  fetchImpl: antwortendesFetch(rufe1b, jsonAntwort(200, { ok: true })),
})({ ...STANDARD_RUF, endpointName: "ai-v2-probe" });
check("T4-Gegenprobe: der Endpunktname kommt aus dem Aufruf, nicht aus einer Konstanten im Treiber",
  rufe1b[0]?.url === "https://projekt-a.supabase.co/functions/v1/ai-v2-probe");

check("T5: der Authorization-Kopf trägt genau „Bearer <token>“",
  ruf1.headers.Authorization === "Bearer " + TOKEN);
check("T5: das Token taucht sonst nirgends auf — apikey bleibt der Publishable-Key",
  ruf1.headers.apikey === PUBKEY
  && !ruf1.url.includes(TOKEN)
  && !ruf1.body.includes(TOKEN));
check("T5: das Token wird genau einmal geholt",
  tokenGriffe1 === 1);
check("Eine Erfolgsantwort wird unverändert durchgereicht",
  erg1?.ok === true && Array.isArray(erg1.daten?.treffer));

/* ===========================================================================
   T2 — ohne Token wird nicht gesendet
   =========================================================================== */
console.log("\n--- Treiber: kein Token, kein Request ---");

const rufe2 = [];
const erg2 = await createAiTransport({
  config: KONFIG,
  getAccessToken: async () => null,
  fetchImpl: antwortendesFetch(rufe2, jsonAntwort(200, { ok: true })),
})({ ...STANDARD_RUF });
check("T2: ohne Sitzungstoken wird gar nicht erst gesendet — kein einziger fetch",
  rufe2.length === 0);
check("T2: ohne Sitzungstoken kommt status 401 / code „unauthenticated“ zurück",
  erg2?.ok === false && erg2.status === 401
  && erg2.code === "unauthenticated" && erg2.code === ERROR_CODES.UNAUTHENTICATED
  && erg2.grund === "kein-sitzungstoken");

const rufe2b = [];
const erg2b = await createAiTransport({
  config: KONFIG,
  getAccessToken: async () => { throw new Error("Erneuerung fehlgeschlagen (Test)"); },
  fetchImpl: antwortendesFetch(rufe2b, jsonAntwort(200, { ok: true })),
})({ ...STANDARD_RUF });
check("T2: scheitert die Token-Beschaffung, wird ebenfalls nicht gesendet",
  rufe2b.length === 0 && erg2b?.status === 401 && erg2b.code === ERROR_CODES.UNAUTHENTICATED);

const rufe2c = [];
await createAiTransport({
  config: KONFIG,
  getAccessToken: async () => TOKEN,
  fetchImpl: antwortendesFetch(rufe2c, jsonAntwort(200, { ok: true })),
})({ ...STANDARD_RUF });
check("T2-Eichung: derselbe Aufbau sendet MIT Token sehr wohl",
  rufe2c.length === 1);

/* ===========================================================================
   T3 — das Token geht nur ans eigene Projekt
   =========================================================================== */
console.log("\n--- Treiber: Projektbindung des Tokens ---");

const fremdeUrls = [
  "https://ki.example.org",
  "https://projekt-a.supabase.co.angreifer.example",
  "http://projekt-a.supabase.co",
  "https://supabase.co",
];
const rufe3 = [];
let tokenGriffe3 = 0;
const ergebnisse3 = [];
for (const fremd of fremdeUrls) {
  ergebnisse3.push(await createAiTransport({
    config: { supabaseUrl: fremd, supabasePublishableKey: PUBKEY },
    getAccessToken: async () => { tokenGriffe3++; return TOKEN; },
    fetchImpl: antwortendesFetch(rufe3, jsonAntwort(200, { ok: true })),
  })({ ...STANDARD_RUF }));
}
check("T3: bei unplausibler Projekt-URL geht kein einziger Request hinaus",
  rufe3.length === 0);
check("T3: dabei wird das Token nicht einmal aus dem Auth-Treiber geholt",
  tokenGriffe3 === 0);
check("T3: jede unplausible Projekt-URL meldet sich als Konfigurationsfehler",
  ergebnisse3.length === fremdeUrls.length
  && ergebnisse3.every((e) => e?.ok === false && e.status === 500 && e.code === "server"
    && e.grund === "projekt-url-unplausibel"));
check("T3-Eichung: die plausible Projekt-URL gibt denselben Request frei",
  rufe2c.length === 1 && rufe2c[0].headers.Authorization === "Bearer " + TOKEN);

const rufe3b = [];
const erg3b = await createAiTransport({
  config: { supabaseUrl: "", supabasePublishableKey: PUBKEY },
  getAccessToken: async () => TOKEN,
  fetchImpl: antwortendesFetch(rufe3b, jsonAntwort(200, { ok: true })),
})({ ...STANDARD_RUF });
check("T3: ohne konfigurierte Projekt-URL gibt es weder Request noch Token",
  rufe3b.length === 0 && erg3b?.status === 500 && erg3b.grund === "kein-endpunkt-konfiguriert");

/* ===========================================================================
   T6/T7 — ein Aufruf hängt nie
   =========================================================================== */
console.log("\n--- Treiber: Zeitgrenze und Abbruch ---");

const rufe6 = [];
let geworfen6 = null;
let erg6 = null;
try {
  erg6 = await createAiTransport({
    config: KONFIG, getAccessToken: async () => TOKEN,
    fetchImpl: haengendesFetch(rufe6), timeoutMs: 25,
  })({ ...STANDARD_RUF });
} catch (e) { geworfen6 = e; }
check("T6: eine Zeitüberschreitung wirft NICHT, sondern liefert eine Antworthülle",
  geworfen6 === null && !!erg6 && typeof erg6 === "object");
check("T6: die Zeitüberschreitung ergibt status 504 mit grund „zeitgrenze“",
  erg6?.ok === false && erg6.status === 504 && erg6.grund === "zeitgrenze" && erg6.code === "server");
check("T6-Eichung: der Abbruch traf wirklich das an fetch übergebene Signal",
  rufe6.length === 1 && rufe6[0].signal?.aborted === true);

/* Die eigene Zeitgrenze steht hier auf 20 s. Kommt das Ergebnis in unter 3 s,
   kann NUR das Signal des Aufrufers es ausgelöst haben — das ist die eigentliche
   Aussage von T7 und deshalb Teil des Checks, nicht bloß einer Eichung. */
const EIGENE_GRENZE_MS = 20000;
const rufe7 = [];
const abbrecher = new AbortController();
const start7 = Date.now();
const versprechen7 = createAiTransport({
  config: KONFIG, getAccessToken: async () => TOKEN,
  fetchImpl: haengendesFetch(rufe7), timeoutMs: EIGENE_GRENZE_MS,
})({ ...STANDARD_RUF, signal: abbrecher.signal });
setTimeout(() => abbrecher.abort(), 10);
let geworfen7 = null;
let erg7 = null;
try { erg7 = await versprechen7; } catch (e) { geworfen7 = e; }
const dauer7 = Date.now() - start7;
/* Nachgezogen nach dem Review (N8): Ein Abbruch DURCH DEN AUFRUFER ist keine
   Zeitgrenze des Servers und wird seither auch nicht mehr als solche gemeldet
   (`grund: "abgebrochen"`, kein 504). Die tragende Aussage bleibt unveraendert:
   der Aufruf endet sofort und haengt nicht bis zur eigenen Zeitgrenze. */
check("T7: ein vom Aufrufer mitgegebenes Signal bricht den laufenden Aufruf ab — lange vor der eigenen Zeitgrenze",
  geworfen7 === null && erg7?.grund === "abgebrochen" && erg7.status === 0
  && dauer7 < 3000 && EIGENE_GRENZE_MS >= 20000);
check("T7: ein Aufrufer-Abbruch wird NICHT als Server-Zeitgrenze ausgegeben",
  erg7?.grund !== "zeitgrenze" && erg7?.status !== 504);
check("T7-Eichung: der Abbruch erreichte das an fetch übergebene Signal",
  rufe7.length === 1 && rufe7[0].signal?.aborted === true);

const rufe7b = [];
const schonAb = new AbortController();
schonAb.abort();
const start7b = Date.now();
const erg7b = await createAiTransport({
  config: KONFIG, getAccessToken: async () => TOKEN,
  fetchImpl: haengendesFetch(rufe7b), timeoutMs: EIGENE_GRENZE_MS,
})({ ...STANDARD_RUF, signal: schonAb.signal });
check("T7: ein bereits abgebrochenes Signal beendet den Aufruf sofort",
  erg7b?.grund === "abgebrochen" && erg7b.status === 0 && (Date.now() - start7b) < 3000);

const rufe7c = [];
const nieBenutzt = new AbortController();
const erg7c = await createAiTransport({
  config: KONFIG, getAccessToken: async () => TOKEN,
  fetchImpl: antwortendesFetch(rufe7c, jsonAntwort(200, { ok: true, quelle: "durchgelaufen" })),
  timeoutMs: 60000,
})({ ...STANDARD_RUF, signal: nieBenutzt.signal });
check("T7-Gegenprobe: ein nicht ausgelöstes Signal stört den normalen Lauf nicht",
  erg7c?.ok === true && erg7c.quelle === "durchgelaufen" && rufe7c.length === 1);

/* ===========================================================================
   T8 — der gemeldete code wird durchgereicht
   =========================================================================== */
console.log("\n--- Treiber: Fehlerantworten des Servers ---");

async function treiberAntwort(antwort) {
  const rufe = [];
  const ergebnis = await createAiTransport({
    config: KONFIG, getAccessToken: async () => TOKEN,
    fetchImpl: antwortendesFetch(rufe, antwort),
  })({ ...STANDARD_RUF });
  return { ergebnis, rufe };
}

const t8a = await treiberAntwort(jsonAntwort(429, {
  code: "server", grund: "anbieter-ueberlastet", vorgangId: "vorgang-abc",
}));
check("T8: bei HTTP-Fehler reicht der Treiber den gemeldeten code durch",
  t8a.ergebnis?.ok === false && t8a.ergebnis.status === 429
  && t8a.ergebnis.code === "server" && t8a.ergebnis.grund === "anbieter-ueberlastet");
check("T8: der Treiber reicht auch die Vorgangs-ID des Servers durch",
  t8a.ergebnis.vorgangId === "vorgang-abc");

const t8b = await treiberAntwort(jsonAntwort(503, { code: "ai-disabled", grund: "not-aus" }));
check("T8: derselbe Weg reicht auch einen der neuen Codes unverändert durch",
  t8b.ergebnis?.status === 503 && t8b.ergebnis.code === "ai-disabled");

const t8c = await treiberAntwort(jsonAntwort(500, {}));
check("T8: ohne gemeldeten code erfindet der Treiber keinen",
  t8c.ergebnis?.status === 500 && t8c.ergebnis.code === null && t8c.ergebnis.grund === null);

const t8d = await treiberAntwort(jsonAntwort(500, { code: 42, grund: { tief: true } }));
check("T8: nicht-textliche code/grund-Felder werden verworfen, nicht durchgereicht",
  t8d.ergebnis?.code === null && t8d.ergebnis.grund === null);

const t8e = await treiberAntwort(kaputteAntwort(200));
check("HTTP 200 ohne JSON-Körper ergibt status 502 / invalid-response",
  t8e.ergebnis?.ok === false && t8e.ergebnis.status === 502
  && t8e.ergebnis.code === "invalid-response" && t8e.ergebnis.grund === "kein-json");

const rufeNetz = [];
const ergNetz = await createAiTransport({
  config: KONFIG, getAccessToken: async () => TOKEN,
  fetchImpl: async (url, opts = {}) => { rufeNetz.push(spur(url, opts)); throw new TypeError("Failed to fetch (Test)"); },
})({ ...STANDARD_RUF });
check("Ein echter Netzfehler (kein Abbruch) ergibt status 0 mit grund „netzwerk“",
  ergNetz?.ok === false && ergNetz.status === 0 && ergNetz.grund === "netzwerk" && ergNetz.code === null);
check("Zeitgrenze und Netzfehler sind unterscheidbar — 504/„zeitgrenze“ gegen 0/„netzwerk“",
  erg6.status !== ergNetz.status && erg6.grund !== ergNetz.grund);

/* ===========================================================================
   FASSADE — Sitzungen
   =========================================================================== */
console.log("\n--- Fassade: Sitzung und Berechtigung ---");

const FASSADEN_KONFIG = Object.freeze({ aiEndpointName: "ai-task", schemaVersion: 2 });

async function machAuth(capabilities) {
  const dienst = createAuthService({
    loadSession: async () => ({
      mode: "account",
      account: { id: KONTO_ID, displayName: "max" },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      capabilities,
    }),
  });
  await dienst.initialize();
  return dienst;
}
const authKi = await machAuth({ remoteStorage: true, personalAi: true });
const authOhneKi = await machAuth({ remoteStorage: true, personalAi: false });

function dienstMit(antwort, { auth = authKi, config = FASSADEN_KONFIG } = {}) {
  const rufe = [];
  const dienst = createAiService({
    auth, config,
    transport: async (request) => {
      rufe.push(request);
      if (typeof antwort === "function") return antwort(request);
      return antwort;
    },
  });
  return { dienst, rufe };
}
async function laufe(dienst, task = "intelligent-search", payload = { query: "Alien" }, options) {
  try { return { fehler: null, ergebnis: await dienst.runTask(task, payload, options) }; }
  catch (fehler) { return { fehler, ergebnis: null }; }
}
async function fehlerBei(antwort, optionen) {
  const { dienst, rufe } = dienstMit(antwort, optionen);
  const lauf = await laufe(dienst);
  return { ...lauf, rufe };
}

const gast = dienstMit({ ok: true }, { auth: createAuthService() });
const gastLauf = await laufe(gast.dienst);
check("T13: ein Gast erreicht die persönliche KI nicht — UNAUTHENTICATED",
  gastLauf.fehler?.code === ERROR_CODES.UNAUTHENTICATED);
check("T13: beim Gast wird der Transport gar nicht erst gerufen",
  gast.rufe.length === 0);

const ohneKi = dienstMit({ ok: true }, { auth: authOhneKi });
const ohneKiLauf = await laufe(ohneKi.dienst);
check("T13: eine Sitzung ohne personalAi endet FORBIDDEN — mit vermerkter Fähigkeit",
  ohneKiLauf.fehler?.code === ERROR_CODES.FORBIDDEN && ohneKiLauf.fehler?.reason === "personalAi");
check("T13: auch ohne Berechtigung wird der Transport nicht gerufen",
  ohneKi.rufe.length === 0);

const freigabe = dienstMit({ ok: true, daten: { titel: "Alien" } });
const freigabeLauf = await laufe(freigabe.dienst);
check("T13-Gegenprobe: mit personalAi läuft genau derselbe Aufruf durch",
  freigabeLauf.fehler === null && freigabeLauf.ergebnis?.ok === true && freigabe.rufe.length === 1);

/* Die Freischaltung selbst (Etappe 5): der produktive Auth-Treiber projiziert
   eine gespeicherte Sitzung jetzt MIT personalAi. */
const { AUTH_SESSION_KEY } = await import("./src/lib/authDriver.js");
const { authDriver } = await import("./src/services/auth.js");
localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
  v: 1, access_token: TOKEN, refresh_token: "test-erneuerungswert-platzhalter",
  gueltigBis: Date.now() + 3600000, kontoId: "konto-1",
  mail: "tester@login.kinodreieck.at", benutzername: "tester",
}));
const projektion = await authDriver.loadSession();
localStorage.removeItem(AUTH_SESSION_KEY);
check("Etappe 5: der produktive Auth-Treiber projiziert personalAi jetzt als true",
  projektion?.mode === "account" && projektion.capabilities?.personalAi === true
  && projektion.capabilities?.remoteStorage === true);

const authMitTreiber = createAuthService({
  driver: {
    signIn: async () => ({ id: "konto-1", benutzername: "max", gueltigBis: Date.now() + 3600000 }),
    loadSession: async () => null,
    signOut: async () => {},
    refresh: async () => {},
  },
});
const nachAnmeldung = await authMitTreiber.signIn("max", "geheim");
check("Etappe 5: auch die frische Anmeldung schaltet personalAi frei",
  nachAnmeldung.capabilities.personalAi === true);

/* ===========================================================================
   T9/T10 — der gemeldete Grund schlägt den Status
   =========================================================================== */
console.log("\n--- Fassade: Grund schlägt Status (Kernaussage der Etappe) ---");

const engpass = await fehlerBei({ ok: false, status: 429, code: "server", grund: "anbieter-ueberlastet" });
const kontingent = await fehlerBei({ ok: false, status: 429 });

check("T9: 429 mit gemeldetem code „server“ wird SERVER — ein Anbieter-Engpass",
  engpass.fehler?.code === ERROR_CODES.SERVER
  && engpass.fehler?.status === 429
  && engpass.fehler?.reason === "anbieter-ueberlastet");
check("T10: 429 OHNE gemeldeten code bleibt LIMIT",
  kontingent.fehler?.code === ERROR_CODES.LIMIT && kontingent.fehler?.status === 429);
check("Kernaussage: DERSELBE Status 429 führt je nach gemeldetem Grund zu zwei verschiedenen Urteilen",
  engpass.fehler.status === kontingent.fehler.status
  && engpass.fehler.code !== kontingent.fehler.code
  && engpass.fehler.code === ERROR_CODES.SERVER
  && kontingent.fehler.code === ERROR_CODES.LIMIT);
check("Und der Nutzer liest dadurch zwei verschiedene Sätze",
  errorText(engpass.fehler) !== errorText(kontingent.fehler)
  && !/limit/i.test(errorText(engpass.fehler)));

/* ===========================================================================
   T11 — die drei neuen Codes kommen unverändert an
   =========================================================================== */
console.log("\n--- Fassade: die drei neuen Zustände ---");

const neueFaelle = [
  { code: ERROR_CODES.AI_DISABLED, status: 503, grund: "not-aus" },
  { code: ERROR_CODES.AI_REFUSED, status: 422, grund: "modell-hat-abgelehnt" },
  { code: ERROR_CODES.NOT_IMPLEMENTED, status: 501, grund: "kommt-in-etappe-6" },
];
for (const fall of neueFaelle) {
  const lauf = await fehlerBei({ ok: false, status: fall.status, code: fall.code, grund: fall.grund });
  check(`T11: „${fall.code}“ kommt unverändert beim Aufrufer an (samt Status und Grund)`,
    lauf.fehler?.code === fall.code && lauf.fehler?.status === fall.status
    && lauf.fehler?.reason === fall.grund);
  check(`T11: „${fall.code}“ entsteht aus dem Grund — der Status ${fall.status} allein ergäbe „${errorFromStatus(fall.status).code}“`,
    lauf.fehler?.code !== errorFromStatus(fall.status).code);
}

/* ===========================================================================
   T12 — unbekannter code fällt auf den Status zurück
   =========================================================================== */
const unbekannt403 = await fehlerBei({ ok: false, status: 403, code: "quota-warp-drive", grund: "erfunden" });
const unbekannt429 = await fehlerBei({ ok: false, status: 429, code: "quota-warp-drive", grund: "erfunden" });
check("T12: ein unbekannter code wird nicht durchgereicht — derselbe code ergibt je nach Status FORBIDDEN bzw. LIMIT",
  unbekannt403.fehler?.code === ERROR_CODES.FORBIDDEN
  && unbekannt429.fehler?.code === ERROR_CODES.LIMIT);
check("T12: der gemeldete GRUND reist trotzdem mit — verworfen wird nur der unbekannte code",
  unbekannt403.fehler.reason === "erfunden" && unbekannt429.fehler.reason === "erfunden");

/* ===========================================================================
   T16 — status 0 ist OFFLINE, nicht SERVER
   =========================================================================== */
const nullStatus = await fehlerBei({ ok: false, status: 0, grund: "netzwerk" });
const fuenfhundert = await fehlerBei({ ok: false, status: 500, grund: "netzwerk" });
check("T16: status 0 (das Netz kam nicht hinaus) ergibt OFFLINE",
  nullStatus.fehler?.code === ERROR_CODES.OFFLINE && nullStatus.fehler?.reason === "netzwerk");
check("T16-Gegenprobe: derselbe grund „netzwerk“ mit status 500 ergibt SERVER",
  fuenfhundert.fehler?.code === ERROR_CODES.SERVER
  && fuenfhundert.fehler.code !== nullStatus.fehler.code);

const geworfenerTypeError = await fehlerBei(() => { throw new TypeError("Failed to fetch (Test)"); });
check("Ein geworfener Netzfehler des Transports wird ebenfalls zu OFFLINE",
  geworfenerTypeError.fehler?.code === ERROR_CODES.OFFLINE);
const geworfenerGrenzfehler = await fehlerBei(() => {
  throw new BoundaryError(ERROR_CODES.AI_REFUSED, { source: "ai", operation: "task.run", reason: "geworfen" });
});
check("Ein geworfener BoundaryError bleibt unverändert — auch mit neuem Code",
  geworfenerGrenzfehler.fehler?.code === ERROR_CODES.AI_REFUSED
  && geworfenerGrenzfehler.fehler?.reason === "geworfen");

for (const murks of [null, [], "text", 42]) {
  const lauf = await fehlerBei(murks);
  check(`Eine Nicht-Objekt-Antwort (${JSON.stringify(murks)}) des Transports ergibt INVALID_RESPONSE`,
    lauf.fehler?.code === ERROR_CODES.INVALID_RESPONSE);
}

const ohneTransport = await laufe(createAiService({ auth: authKi, config: FASSADEN_KONFIG }));
check("Ohne konfigurierten Transport meldet die Fassade SERVER mit vermerktem Grund",
  ohneTransport.fehler?.code === ERROR_CODES.SERVER
  && ohneTransport.fehler?.reason === "transport-not-configured");

/* ===========================================================================
   T15 — unbekannte Aufgabe erreicht den Transport nicht
   =========================================================================== */
console.log("\n--- Fassade: Aufgabenprüfung vor dem Transport ---");

check("Die Etappe kennt genau vier registrierte Aufgaben",
  AI_TASKS.length === 4
  && ["health", "echo-struct", "intelligent-search", "masterlist-enrichment"]
    .every((t) => AI_TASKS.includes(t)));

const unbekannteAufgabe = dienstMit({ ok: true });
const ua = await laufe(unbekannteAufgabe.dienst, "weltherrschaft", { x: 1 });
check("T15: eine unbekannte Aufgabe erreicht den Transport gar nicht",
  unbekannteAufgabe.rufe.length === 0
  && ua.fehler?.code === ERROR_CODES.INVALID_RESPONSE
  && ua.fehler?.reason === "invalid-task-or-payload");

const kaputteNutzlast = dienstMit({ ok: true });
const nutzlastUrteile = [];
/* `undefined` bewusst über den direkten Aufruf — über `laufe()` würde dessen
   Standardwert einspringen und der Check liefe ins Leere. */
for (const nutzlast of [null, [], "text", 7]) {
  nutzlastUrteile.push((await laufe(kaputteNutzlast.dienst, "health", nutzlast)).fehler?.code);
}
try { await kaputteNutzlast.dienst.runTask("health"); nutzlastUrteile.push("KEIN-FEHLER"); }
catch (e) { nutzlastUrteile.push(e?.code); }
check("T15: auch eine fehlende oder falsch geformte Nutzlast erreicht den Transport nicht",
  kaputteNutzlast.rufe.length === 0
  && nutzlastUrteile.length === 5
  && nutzlastUrteile.every((c) => c === ERROR_CODES.INVALID_RESPONSE));

const alleAufgaben = dienstMit({ ok: true });
for (const task of AI_TASKS) await laufe(alleAufgaben.dienst, task, { x: 1 });
check("T15-Eichung: jede registrierte Aufgabe erreicht den Transport sehr wohl",
  alleAufgaben.rufe.length === AI_TASKS.length
  && alleAufgaben.rufe.map((r) => r.task).join(",") === AI_TASKS.join(","));

/* ===========================================================================
   Aufrufvertrag der Fassade an den Transport
   =========================================================================== */
console.log("\n--- Fassade: was der Transport überhaupt zu sehen bekommt ---");

const vertrag = dienstMit({ ok: true });
const vertragsSignal = new AbortController().signal;
await vertrag.dienst.runTask("intelligent-search", { query: "Alien" }, { signal: vertragsSignal });
const anfrage = vertrag.rufe[0] || {};
check("Die Fassade übergibt dem Transport die Account-ID — genau die, die er nicht senden darf",
  anfrage.accountId === KONTO_ID);
check("Die Fassade übergibt Endpunktname, Schemaversion und Prompt-Version aus der Konfiguration",
  anfrage.endpointName === "ai-task" && anfrage.schemaVersion === 2
  && anfrage.promptVersion === AI_PROMPT_VERSION && AI_PROMPT_VERSION === "v1");
check("Ein Abbruchsignal des Aufrufers wird an den Transport durchgereicht",
  anfrage.signal === vertragsSignal);
check("Im Aufrufobjekt steht kein Anbieter-, Schlüssel- oder Tokenfeld",
  !Object.keys(anfrage).some((k) => /provider|secret|api.?key|token|passwor|model|anbieter/i.test(k)));

const eigeneVersionen = dienstMit({ ok: true });
await eigeneVersionen.dienst.runTask("health", { x: 1 }, { promptVersion: "v9", profilVersion: "p3" });
check("Aufrufer-eigene Prompt-/Profilversionen werden übernommen",
  eigeneVersionen.rufe[0]?.promptVersion === "v9" && eigeneVersionen.rufe[0]?.profilVersion === "p3");

/* ===========================================================================
   T14 — Vorgangs-ID
   =========================================================================== */
console.log("\n--- Fassade: Vorgangs-ID ---");

const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const vorgaenge = dienstMit({ ok: true });
await vorgaenge.dienst.runTask("health", { x: 1 });
await vorgaenge.dienst.runTask("health", { x: 2 });
check("T14: jeder Aufruf trägt eine Vorgangs-ID in UUID-Form",
  vorgaenge.rufe.length === 2
  && UUID_FORM.test(String(vorgaenge.rufe[0].vorgangId))
  && UUID_FORM.test(String(vorgaenge.rufe[1].vorgangId)));
check("T14: zwei Aufrufe tragen verschiedene Vorgangs-IDs",
  vorgaenge.rufe[0].vorgangId !== vorgaenge.rufe[1].vorgangId);

const eigenerVorgang = dienstMit({ ok: true });
await eigenerVorgang.dienst.runTask("health", { x: 1 }, { vorgangId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
check("T14: eine vom Aufrufer vorgegebene Vorgangs-ID wird übernommen",
  eigenerVorgang.rufe[0]?.vorgangId === "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");

/* Der Ersatzweg ohne WebCrypto muss dieselbe Form liefern — die Serverspalte
   verlangt eine echte UUID. */
const cryptoBeschreibung = Object.getOwnPropertyDescriptor(globalThis, "crypto");
let ersatzIds = null;
try {
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
  const ohneCrypto = dienstMit({ ok: true });
  await ohneCrypto.dienst.runTask("health", { x: 1 });
  await ohneCrypto.dienst.runTask("health", { x: 2 });
  ersatzIds = ohneCrypto.rufe.map((r) => String(r.vorgangId));
} finally {
  if (cryptoBeschreibung) Object.defineProperty(globalThis, "crypto", cryptoBeschreibung);
}
check("T14: ohne WebCrypto liefert der Ersatzweg dieselbe UUID-Form und ebenfalls verschiedene Werte",
  Array.isArray(ersatzIds) && ersatzIds.length === 2
  && ersatzIds.every((id) => UUID_FORM.test(id))
  && ersatzIds[0] !== ersatzIds[1]);
check("T14-Eichung: WebCrypto ist danach wieder da",
  typeof globalThis.crypto?.randomUUID === "function");

/* ===========================================================================
   T17/T18 — Fehlerklassen
   =========================================================================== */
console.log("\n--- Fehlerklassen: eigene Stimme für die drei neuen Zustände ---");

const NEUE_CODES = [ERROR_CODES.AI_DISABLED, ERROR_CODES.AI_REFUSED, ERROR_CODES.NOT_IMPLEMENTED];
const SERVER_TEXT = errorText({ code: ERROR_CODES.SERVER });

check("Die drei neuen Codes sind eigene, unterscheidbare Werte",
  new Set(NEUE_CODES).size === 3
  && NEUE_CODES.every((c) => typeof c === "string" && c.length > 0)
  && NEUE_CODES.join(",") === "ai-disabled,ai-refused,not-implemented");

check("T17-Eichung: errorText() vergibt sehr wohl eigene Texte — INVALID_KEY und NO_DEMO_DATA haben welche",
  errorText({ code: ERROR_CODES.INVALID_KEY }) !== SERVER_TEXT
  && errorText({ code: ERROR_CODES.NO_DEMO_DATA }) !== SERVER_TEXT
  && errorText({ code: "gibt-es-nicht" }) === SERVER_TEXT);

const neueTexte = NEUE_CODES.map((c) => errorText({ code: c }));
check("T17: jeder der drei neuen Codes hat einen eigenen, nicht-leeren deutschen Text (nicht den Serverfehler-Text)",
  neueTexte.every((t) => typeof t === "string" && t.trim().length > 0 && t !== SERVER_TEXT)
  && new Set(neueTexte).size === 3);
check("T17: auch die Fehlermeldung selbst trägt nicht den Serverfehler-Satz",
  NEUE_CODES.every((c) => new BoundaryError(c).message !== SERVER_TEXT));

const STATI = [0, 200, 301, 400, 401, 403, 404, 409, 422, 429, 500, 501, 502, 503, 504];
check("T18: errorFromStatus() erzeugt KEINEN der drei neuen Codes",
  STATI.every((s) => !NEUE_CODES.includes(errorFromStatus(s).code)));
check("T18-Eichung: errorFromStatus() bleibt bei den sechs Ursprungscodes",
  errorFromStatus(401).code === ERROR_CODES.UNAUTHENTICATED
  && errorFromStatus(403).code === ERROR_CODES.FORBIDDEN
  && errorFromStatus(429).code === ERROR_CODES.LIMIT
  && errorFromStatus(500).code === ERROR_CODES.SERVER
  && errorFromStatus(503).code === ERROR_CODES.SERVER
  && errorFromStatus(422).code === ERROR_CODES.INVALID_RESPONSE);
check("T18: errorFromStatus() erzeugt auch INVALID_KEY/NO_DEMO_DATA nicht — dieselbe Regel wie in Etappe 4",
  STATI.every((s) => ![ERROR_CODES.INVALID_KEY, ERROR_CODES.NO_DEMO_DATA].includes(errorFromStatus(s).code)));

check("Die drei neuen Zustände gelten nicht als wiederholbar — erneut probieren hilft nicht",
  NEUE_CODES.every((c) => new BoundaryError(c).retryable === false));

/* =========================================================================== */
const gesamt = ok + rot.length;
if (rot.length) {
  console.log("\nBEFUNDE am Produktionscode (nicht behoben — siehe Bericht):");
  for (const name of rot) console.log("  ✗ " + name);
}
console.log(`\n${ok}/${gesamt} Checks bestanden.`);
process.exit(rot.length ? 1 : 0);

/* Kinodreieck — Tests für den geschützten KI-Endpunkt (Etappe 6)
   ===========================================================================
   `supabase/functions/ai-task/index.ts` hatte bis heute KEINEN einzigen
   automatisierten Test: geprüft wurde nur mit `tools/ai_smoke.mjs` gegen die
   deployte Fassung — und jeder Lauf kostet echtes Geld. Diese Datei ist das
   Sicherheitsnetz, das dabei fehlte: sie fährt den Handler ohne Netz und ohne
   Anbieterkosten.

   Bauart (aus dem Prüfgestell /tmp/probe/harness.ts):
     1) KD_KEIN_SERVER=1 VOR dem Import — sonst startet Deno.serve und der
        Test hängt.
     2) globalThis.fetch VOR dem Import ersetzen. Über diese EINE Attrappe
        laufen supabase-js (Auth, PostgREST, RPC) und der Anbieter.
     3) Die Attrappe ist steuerbar (pro Testfall konfigurierbare Antworten in
        `z`) und mitschreibend (`aufrufe`) — nur so lässt sich prüfen, WELCHE
        Aufrufe mit WELCHEM Körper rausgingen. Genau das ist die Kernfrage bei
        `kd_ai_auftrag_beenden`.

   Aufruf: npm run test:function
   =========================================================================== */

Deno.env.set("KD_KEIN_SERVER", "1");
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "anon-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-test");
Deno.env.set("ANTHROPIC_API_KEY", "sk-test");

/* ---------- kleine Prüfhilfen (bewusst ohne fremde Abhängigkeit) ------------ */
function gleich(ist: unknown, soll: unknown, was = "Wert") {
  if (!Object.is(ist, soll)) {
    throw new Error(`${was}: erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`);
  }
}
function wahr(bedingung: unknown, was: string) {
  if (!bedingung) throw new Error("nicht erfüllt: " + was);
}
function falsch(bedingung: unknown, was: string) {
  if (bedingung) throw new Error("hätte nicht zutreffen dürfen: " + was);
}

/* ---------- Attrappe -------------------------------------------------------- */
type Netzaufruf = { url: string; pfad: string; methode: string; koerper: Record<string, unknown> | null };

const KONTO = "11111111-2222-3333-4444-555555555555";
const LOG_ID = 42;

const aufrufe: Netzaufruf[] = [];

function antwort(koerper: unknown, status = 200): Response {
  return new Response(koerper === null ? "null" : JSON.stringify(koerper), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const STANDARD_KONFIG = (): Record<string, unknown> => ({
  ai_aktiv: true,
  monatsbudget_usd_cent: 1000,
  tageslimit_auftraege: 50,
  parallel_max: 2,
  timeout_ms: 30000,
  request_max_bytes: 32768,
  antwort_max_bytes: 262144,
  modell_alias: { klein: "claude-haiku-4-5-20251001", gross: "claude-sonnet-5" },
  task_modell: { "echo-struct": "klein", "intelligent-search": "gross" },
  task_max_tokens: { "echo-struct": 256, "intelligent-search": 1024 },
  preise_usd_cent_pro_mtok: {
    "claude-haiku-4-5-20251001": { in: 100, out: 500 },
    "claude-sonnet-5": { in: 200, out: 1000 },
  },
});

/* Regelbare Anbieterantwort: end_turn mit gültigem Echo-JSON. */
function anbieterErfolg(inhalt: unknown = { echo: "Kinodreieck", zeichen: 11 }) {
  return antwort({
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    content: [{ type: "text", text: typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt) }],
    usage: { input_tokens: 100, output_tokens: 20 },
  });
}

/* Anbieterantwort mit einem stop_reason, der KEIN Ergebnis liefert — aber
   abgerechnete Tokens trägt. */
function anbieterStop(stopReason: string, extra: Record<string, unknown> = {}) {
  return antwort({
    model: "claude-haiku-4-5-20251001",
    stop_reason: stopReason,
    content: [{ type: "text", text: '{"echo":"Kino' }],
    usage: { input_tokens: 100, output_tokens: 20 },
    ...extra,
  });
}

const z = {
  konfig: STANDARD_KONFIG(),
  konfigLesbar: true,
  nutzer: { id: KONTO, role: "authenticated" } as Record<string, unknown>,
  nutzerStatus: 200,
  start: { ok: true, log_id: LOG_ID, modell_alias: "klein" } as unknown,
  startHttpFehler: null as null | { status: number; koerper: unknown },
  stand: { heute: 0 } as unknown,
  anbieter: ((_init?: RequestInit) => anbieterErfolg()) as (init?: RequestInit) => Response | Promise<Response>,
  modelle: (() => antwort({ data: [{ id: "claude-sonnet-5", display_name: "Sonnet 5" }] })) as () => Response,
};

function stelleZurueck() {
  aufrufe.length = 0;
  z.konfig = STANDARD_KONFIG();
  z.konfigLesbar = true;
  z.nutzer = { id: KONTO, role: "authenticated" };
  z.nutzerStatus = 200;
  z.start = { ok: true, log_id: LOG_ID, modell_alias: "klein" };
  z.startHttpFehler = null;
  z.stand = { heute: 0 };
  z.anbieter = () => anbieterErfolg();
  z.modelle = () => antwort({ data: [{ id: "claude-sonnet-5", display_name: "Sonnet 5" }] });
}

globalThis.fetch = (async (eingabe: string | URL | Request, init?: RequestInit) => {
  const url = String(typeof eingabe === "object" && eingabe !== null && "url" in eingabe
    ? (eingabe as Request).url
    : eingabe);
  let koerper: Record<string, unknown> | null = null;
  if (typeof init?.body === "string") {
    try { koerper = JSON.parse(init.body); } catch { koerper = { rohtext: init.body }; }
  }
  aufrufe.push({
    url,
    pfad: url.replace("https://test.supabase.co", "").split("?")[0],
    methode: String(init?.method ?? "GET").toUpperCase(),
    koerper,
  });

  if (url.includes("/auth/v1/user")) {
    return z.nutzerStatus === 200
      ? antwort(z.nutzer)
      : antwort({ error: "unauthorized", message: "abgelehnt" }, z.nutzerStatus);
  }
  if (url.includes("/auth/v1/")) return antwort({ error: "nicht-unterstuetzt" }, 400);

  if (url.includes("/rest/v1/kd_ai_limits")) {
    if (!z.konfigLesbar) {
      return antwort({ code: "42501", message: "permission denied", details: null, hint: null }, 403);
    }
    return antwort(Object.entries(z.konfig).map(([schluessel, wert]) => ({ schluessel, wert })));
  }
  if (url.includes("/rest/v1/rpc/kd_ai_auftrag_starten")) {
    if (z.startHttpFehler) return antwort(z.startHttpFehler.koerper, z.startHttpFehler.status);
    return antwort(z.start);
  }
  if (url.includes("/rest/v1/rpc/kd_ai_auftrag_beenden")) return antwort(null);
  if (url.includes("/rest/v1/rpc/kd_ai_stand")) return antwort(z.stand);

  if (url.includes("api.anthropic.com/v1/messages")) return await z.anbieter(init);
  if (url.includes("api.anthropic.com/v1/models")) return z.modelle();

  return antwort({ unerwartet: url }, 500);
}) as typeof fetch;

/* ---------- Handler laden (erst JETZT, nach der Attrappe) ------------------- */
const { handhabeAnfrage, AUFGABEN } = await import(
  new URL("./supabase/functions/ai-task/index.ts", import.meta.url).href
) as {
  handhabeAnfrage: (req: Request) => Promise<Response>;
  // deno-lint-ignore no-explicit-any
  AUFGABEN: Record<string, any>;
};

/* ---------- Aufruf-Hilfen ---------------------------------------------------- */
function neueVorgangId() { return crypto.randomUUID(); }

async function ruf(
  koerper: Record<string, unknown>,
  opt: { kopf?: Record<string, string>; ohneToken?: boolean; methode?: string; origin?: string } = {},
) {
  const kopf: Record<string, string> = { "content-type": "application/json", ...(opt.kopf ?? {}) };
  if (!opt.ohneToken && !kopf.Authorization) kopf.Authorization = "Bearer tok";
  if (opt.origin) kopf.Origin = opt.origin;
  const req = new Request("https://test.supabase.co/functions/v1/ai-task", {
    method: opt.methode ?? "POST",
    headers: kopf,
    body: opt.methode && opt.methode !== "POST" ? undefined : JSON.stringify(koerper),
  });
  const antw = await handhabeAnfrage(req);
  const text = await antw.text();
  let daten: Record<string, unknown> = {};
  try { daten = text ? JSON.parse(text) : {}; } catch { daten = { rohtext: text }; }
  return { status: antw.status, kopf: antw.headers, daten };
}

const echoRuf = (zusatz: Record<string, unknown> = {}) =>
  ruf({ task: "echo-struct", vorgangId: neueVorgangId(), payload: { wort: "Kinodreieck" }, ...zusatz });

const rpc = (name: string) => aufrufe.filter((a) => a.pfad === "/rest/v1/rpc/" + name);
const anbieterAufrufe = () => aufrufe.filter((a) => a.url.includes("api.anthropic.com/v1/messages"));
const beenden = () => rpc("kd_ai_auftrag_beenden");
const starten = () => rpc("kd_ai_auftrag_starten");

/* Genau ein Abschluss, und zwar für die reservierte Zeile. */
function genauEinAbschluss(): Record<string, unknown> {
  gleich(beenden().length, 1, "Zahl der Abschlüsse (kd_ai_auftrag_beenden)");
  const k = beenden()[0].koerper as Record<string, unknown>;
  gleich(k.p_id, LOG_ID, "abgeschlossene Protokollzeile");
  return k;
}

/* Die Protokolltabelle führt ausdrücklich KEINE Inhalte: eine Fehlerklasse ist
   eine Kennung oder gar nichts. Ein Leerzeichen genügt als Beweis für ein Leck —
   ein Satzfragment kommt nie ohne aus.

   DREI Abschnitte nach der Basis, nicht zwei: der längste vorkommende Fall ist
   `server:anbieterfehler:400:invalid_request_error`. Mit nur zwei Abschnitten
   fiel er auf `unklassifiziert`, und damit war jeder Anbieter-HTTP-Fehler außer
   429/529 im Protokoll diagnostisch blind (Befund vom 26.07., behoben). */
const KENNUNG = /^[a-z][a-z0-9-]{0,39}(:[a-z0-9][a-z0-9._-]{0,39}){0,3}$/;

function pruefeFehlerklasseSauber(koerper: Record<string, unknown>) {
  const k = koerper.p_fehlerklasse;
  if (k === null || k === undefined) return;
  wahr(typeof k === "string", "Fehlerklasse ist ein String oder null");
  const s = k as string;
  falsch(/\s/.test(s), `Fehlerklasse ohne Leerzeichen (war: ${JSON.stringify(s)})`);
  wahr(KENNUNG.test(s), `Fehlerklasse hat Kennungsform (war: ${JSON.stringify(s)})`);
}

/* Nichts aus dem Auftrag darf irgendwo in der Protokollzeile auftauchen. */
function pruefeKeinInhaltImProtokoll(verboteneStuecke: string[]) {
  for (const a of beenden()) {
    const roh = JSON.stringify(a.koerper ?? {});
    for (const stueck of verboteneStuecke) {
      falsch(roh.includes(stueck), `Protokollzeile enthält Auftragsinhalt ${JSON.stringify(stueck)}: ${roh}`);
    }
    pruefeFehlerklasseSauber(a.koerper as Record<string, unknown>);
  }
}

function test(name: string, fn: () => Promise<void> | void) {
  Deno.test(name, async () => {
    stelleZurueck();
    await fn();
  });
}

/* ===========================================================================
   A. Aufgaben-Auflösung (der Refactor von Etappe 6)
   =========================================================================== */

test("A1 AUFGABEN enthält die gebaute Aufgabe echo-struct", () => {
  wahr(AUFGABEN && typeof AUFGABEN === "object", "AUFGABEN ist exportiert");
  wahr("echo-struct" in AUFGABEN, "echo-struct ist in der Aufgaben-Tabelle");
  wahr(typeof AUFGABEN["echo-struct"].bauAuftrag === "function", "echo-struct baut einen Auftrag");
  wahr(typeof AUFGABEN["echo-struct"].pruefeErgebnis === "function", "echo-struct prüft sein Ergebnis");
  /* Registriert, aber noch nicht gebaut — sie dürfen NICHT in AUFGABEN stehen,
     sonst liefen sie ohne Umsetzung in den zahlenden Pfad. */
  falsch("intelligent-search" in AUFGABEN, "intelligent-search ist noch nicht gebaut");
  falsch("masterlist-enrichment" in AUFGABEN, "masterlist-enrichment ist noch nicht gebaut");
});

test("A1b Wächter: keine Aufgabe darf health oder anbieter-modelle heißen", async () => {
  /* Beide Namen werden VOR dem Nachschlag in AUFGABEN abgefangen. Eine so
     benannte Aufgabe wäre unerreichbar — sie würde nie gerufen, nie
     protokolliert, nie abgerechnet, und niemandem fiele es auf. Genau die
     Klasse stiller Fehler, die diese Etappe dreimal hatte. */
  for (const reserviert of ["health", "anbieter-modelle"]) {
    falsch(reserviert in AUFGABEN, `"${reserviert}" ist ein reservierter Name und keine Aufgabe`);
  }
  /* Und der Beweis, dass die Abfangung wirklich vorher greift: eine Aufgabe
     unter reserviertem Namen käme nicht zum Zug. */
  let gerufen = 0;
  AUFGABEN["health"] = {
    bauAuftrag() { gerufen++; return { system: "s", nutzertext: "n", schema: null }; },
    pruefeErgebnis() { return null; },
  };
  try {
    const r = await ruf({ task: "health", vorgangId: neueVorgangId() });
    gleich(r.daten.task, "health", "der reservierte Pfad antwortet");
    gleich(gerufen, 0, "die gleichnamige Aufgabe wird nie gerufen — deshalb der Wächter");
  } finally {
    delete AUFGABEN["health"];
  }
});

test("A2 eine gebaute Aufgabe läuft durch den gemeinsamen Rumpf", async () => {
  const r = await echoRuf();
  gleich(r.status, 200, "Status echo-struct");
  gleich(starten().length, 1, "genau eine Reservierung");
  gleich(anbieterAufrufe().length, 1, "genau ein Anbieteraufruf");
  genauEinAbschluss();
});

test("A3 intelligent-search meldet 501 kommt-in-etappe-6", async () => {
  const r = await ruf({ task: "intelligent-search", vorgangId: neueVorgangId(), payload: {} });
  gleich(r.status, 501, "Status");
  gleich(r.daten.code, "not-implemented", "Code");
  gleich(r.daten.grund, "kommt-in-etappe-6", "Grund");
  gleich(starten().length, 0, "keine Reservierung");
  gleich(anbieterAufrufe().length, 0, "kein Anbieteraufruf");
});

test("A4 masterlist-enrichment meldet 501 kommt-in-etappe-6", async () => {
  const r = await ruf({ task: "masterlist-enrichment", vorgangId: neueVorgangId(), payload: {} });
  gleich(r.status, 501, "Status");
  gleich(r.daten.grund, "kommt-in-etappe-6", "Grund");
  gleich(starten().length, 0, "keine Reservierung");
});

test("A5 unbekannte Aufgabe meldet 501 unbekannte-aufgabe", async () => {
  const r = await ruf({ task: "gibt-es-nicht", vorgangId: neueVorgangId(), payload: {} });
  gleich(r.status, 501, "Status");
  gleich(r.daten.grund, "unbekannte-aufgabe", "Grund");
  gleich(starten().length, 0, "keine Reservierung");
});

test("A6 fehlendes task meldet 501 kein-task", async () => {
  const r = await ruf({ vorgangId: neueVorgangId(), payload: {} });
  gleich(r.status, 501, "Status");
  gleich(r.daten.grund, "kein-task", "Grund");
});

/* ===========================================================================
   B. echo-struct unverändert — das Sicherheitsnetz des Umbaus
   =========================================================================== */

test("B1 Erfolgsfall liefert die vollständige Hülle", async () => {
  const vorgang = neueVorgangId();
  const r = await ruf({ task: "echo-struct", vorgangId: vorgang, payload: { wort: "Kinodreieck" } });
  gleich(r.status, 200, "Status");
  gleich(r.daten.ok, true, "ok");
  gleich(r.daten.task, "echo-struct", "task");
  gleich(r.daten.vorgangId, vorgang, "vorgangId gespiegelt");
  gleich(r.daten.modellAlias, "klein", "modellAlias");
  const d = r.daten.data as Record<string, unknown>;
  gleich(d.echo, "Kinodreieck", "data.echo");
  gleich(d.zeichen, 11, "data.zeichen");
  const v = r.daten.verbrauch as Record<string, unknown>;
  wahr(v && typeof v === "object", "verbrauch vorhanden");
  gleich(v.inputTokens, 100, "verbrauch.inputTokens");
  gleich(v.outputTokens, 20, "verbrauch.outputTokens");
  gleich(v.stopReason, "end_turn", "verbrauch.stopReason");
  wahr(typeof v.dauerMs === "number", "verbrauch.dauerMs ist eine Zahl");
  /* Der Blocker aus Etappe 5: ein stiller Nullpreis hätte das Monatsbudget nie
     hochgezählt. Eine Zahl allein genügt deshalb NICHT. */
  wahr(typeof v.kostenUsdCent === "number", "kostenUsdCent ist eine Zahl");
  wahr((v.kostenUsdCent as number) > 0, `kostenUsdCent > 0 (war ${v.kostenUsdCent})`);
});

test("B2 Erfolgsfall bucht Istverbrauch und Kosten über null", async () => {
  await echoRuf();
  const k = genauEinAbschluss();
  gleich(k.p_status, "fertig", "Status der Protokollzeile");
  gleich(k.p_modell, "claude-haiku-4-5-20251001", "gebuchtes Modell");
  gleich(k.p_input_tokens, 100, "gebuchte Eingabetokens");
  gleich(k.p_output_tokens, 20, "gebuchte Ausgabetokens");
  wahr(typeof k.p_kosten === "number" && (k.p_kosten as number) > 0, `Kosten > 0 (war ${k.p_kosten})`);
  gleich(k.p_fehlerklasse, null, "Erfolg trägt keine Fehlerklasse");
});

test("B3 unbekannter Modellpreis wird geschätzt, nie still auf null gesetzt", async () => {
  z.anbieter = () => antwort({
    model: "fremdmodell-9",
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ echo: "Kinodreieck", zeichen: 11 }) }],
    usage: { input_tokens: 100, output_tokens: 20 },
  });
  const r = await echoRuf();
  gleich(r.status, 200, "Status");
  const k = genauEinAbschluss();
  wahr((k.p_kosten as number) > 0, `geschätzte Kosten > 0 (war ${k.p_kosten})`);
  wahr(
    typeof k.p_fehlerklasse === "string" && (k.p_fehlerklasse as string).startsWith("kosten-geschaetzt"),
    `Schätzung ist vermerkt (war ${JSON.stringify(k.p_fehlerklasse)})`,
  );
  pruefeFehlerklasseSauber(k);
});

test("B4 die Reservierung geht mit einer Kostenschätzung über null raus", async () => {
  await echoRuf();
  gleich(starten().length, 1, "genau eine Reservierung");
  const k = starten()[0].koerper as Record<string, unknown>;
  gleich(k.p_task, "echo-struct", "reservierte Aufgabe");
  gleich(k.p_modell_alias, "klein", "reservierter Alias");
  wahr(typeof k.p_reservierung === "number" && (k.p_reservierung as number) > 0,
    `Reservierung > 0 (war ${k.p_reservierung})`);
});

test("B5 eine im Körper mitgeschickte Konto-ID wird nie gelesen", async () => {
  await echoRuf({ accountId: "99999999-9999-9999-9999-999999999999", account: "fremd" });
  const k = starten()[0].koerper as Record<string, unknown>;
  gleich(k.p_account, KONTO, "Konto stammt aus dem Token, nicht aus dem Körper");
});

/* ===========================================================================
   C. Aufrufer und Grenzen
   =========================================================================== */

test("C1 ohne Authorization-Header: 401, ohne jeden Netzaufruf", async () => {
  const r = await ruf({ task: "echo-struct", payload: {} }, { ohneToken: true });
  gleich(r.status, 401, "Status");
  gleich(r.daten.code, "unauthenticated", "Code");
  gleich(r.daten.grund, "kein-bearer-token", "Grund");
  gleich(aufrufe.length, 0, "kein einziger Netzaufruf");
});

test("C2 Rolle ungleich authenticated: 401", async () => {
  z.nutzer = { id: KONTO, role: "anon" };
  const r = await echoRuf();
  gleich(r.status, 401, "Status");
  gleich(r.daten.code, "unauthenticated", "Code");
  gleich(r.daten.grund, "rolle-nicht-authenticated", "Grund");
  gleich(starten().length, 0, "keine Reservierung");
  gleich(anbieterAufrufe().length, 0, "kein Anbieteraufruf");
});

test("C3 sub ohne UUID-Form: 401", async () => {
  z.nutzer = { id: "service-account", role: "authenticated" };
  const r = await echoRuf();
  gleich(r.status, 401, "Status");
  gleich(r.daten.grund, "subject-keine-konto-id", "Grund");
  gleich(starten().length, 0, "keine Reservierung");
});

test("C3b sub wird exakt geprüft, nicht bloß auf 36 Zeichen Hex", async () => {
  /* Die alte Fassung nahm `^[0-9a-f-]{36}$` — 36 Zeichen Hex und Bindestriche
     in BELIEBIGER Anordnung. Ein formfremdes `sub` ging dann als `p_account` an
     einen uuid-Parameter und kam als nichtssagendes
     `auftrag-start-fehlgeschlagen:22P02` zurück statt als ehrliches 401. */
  z.nutzer = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "authenticated" };
  gleich((await echoRuf()).status, 200, "eine echte UUID passiert");

  for (const laxe of [
    "----------------------------------aa", // 36 Zeichen, Bindestriche an falscher Stelle
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", // 36 Zeichen Hex ganz ohne Bindestriche
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa-aaa", // 36 Zeichen, ein Bindestrich zu viel
  ]) {
    stelleZurueck();
    z.nutzer = { id: laxe, role: "authenticated" };
    const r = await echoRuf();
    gleich(r.status, 401, `laxe Form ${JSON.stringify(laxe)} wird abgewiesen`);
    gleich(r.daten.grund, "subject-keine-konto-id", "Grund");
    gleich(starten().length, 0, "nichts erreicht die Datenbank");
  }
});

test("C4 nicht verifizierbares Token: 401", async () => {
  z.nutzerStatus = 401;
  const r = await echoRuf();
  gleich(r.status, 401, "Status");
  gleich(r.daten.grund, "token-nicht-verifizierbar", "Grund");
});

test("C5 Körper größer als request_max_bytes: 413", async () => {
  z.konfig.request_max_bytes = 400;
  const r = await echoRuf({ payload: { wort: "K", fuellung: "x".repeat(600) } });
  gleich(r.status, 413, "Status");
  gleich(r.daten.grund, "auftrag-zu-gross", "Grund");
  gleich(starten().length, 0, "keine Reservierung");
  gleich(anbieterAufrufe().length, 0, "kein Anbieteraufruf");
});

test("C6 Körper knapp unter der Grenze läuft durch", async () => {
  z.konfig.request_max_bytes = 4000;
  const r = await echoRuf({ payload: { wort: "K", fuellung: "x".repeat(200) } });
  gleich(r.status, 200, "Status");
});

test("C7 vorgangId ohne UUID-Form: 400 vorgangid-keine-uuid", async () => {
  const r = await ruf({ task: "echo-struct", vorgangId: "vorgang-17", payload: {} });
  gleich(r.status, 400, "Status");
  gleich(r.daten.grund, "vorgangid-keine-uuid", "Grund");
  gleich(starten().length, 0, "keine Reservierung");
});

test("C8 OPTIONS: 204 mit CORS-Kopf, erlaubter Origin wird gespiegelt", async () => {
  const req = new Request("https://test.supabase.co/functions/v1/ai-task", {
    method: "OPTIONS",
    headers: { Origin: "https://kinodreieck.at" },
  });
  const antw = await handhabeAnfrage(req);
  gleich(antw.status, 204, "Status");
  gleich(antw.headers.get("Access-Control-Allow-Origin"), "https://kinodreieck.at", "gespiegelter Origin");
  wahr(antw.headers.get("Access-Control-Allow-Methods")?.includes("POST"), "POST ist erlaubt");
  wahr(antw.headers.get("Access-Control-Allow-Headers")?.includes("authorization"), "authorization ist erlaubt");
  gleich(antw.headers.get("Vary"), "Origin", "Vary: Origin");
});

test("C9 fremder Origin wird NICHT zurückgespiegelt", async () => {
  const req = new Request("https://test.supabase.co/functions/v1/ai-task", {
    method: "OPTIONS",
    headers: { Origin: "https://boeser-nachbar.example" },
  });
  const antw = await handhabeAnfrage(req);
  gleich(antw.status, 204, "Status");
  gleich(antw.headers.get("Access-Control-Allow-Origin"), null, "kein Allow-Origin für fremden Origin");
  /* Auch die Fachantwort darf ihn nicht spiegeln. */
  const r = await echoRuf({}) as unknown as { kopf: Headers };
  gleich(r.kopf.get("Access-Control-Allow-Origin"), null, "keine Spiegelung ohne Origin-Kopf");
});

test("C10 erlaubter Origin wird auch in der Fachantwort gespiegelt", async () => {
  const r = await ruf(
    { task: "echo-struct", vorgangId: neueVorgangId(), payload: {} },
    { origin: "http://localhost:5173" },
  );
  gleich(r.status, 200, "Status");
  gleich(r.kopf.get("Access-Control-Allow-Origin"), "http://localhost:5173", "gespiegelter Origin");
});

test("C11 Nicht-POST: 405", async () => {
  const r = await ruf({}, { methode: "GET" });
  gleich(r.status, 405, "Status");
  gleich(r.daten.grund, "nur-post", "Grund");
  gleich(aufrufe.length, 0, "kein Netzaufruf");
});

test("C12 unlesbarer Körper: 400 kein-json", async () => {
  const req = new Request("https://test.supabase.co/functions/v1/ai-task", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer tok" },
    body: "{kein json",
  });
  const antw = await handhabeAnfrage(req);
  gleich(antw.status, 400, "Status");
  gleich((await antw.json()).grund, "kein-json", "Grund");
});

/* ===========================================================================
   D. Protokoll-Hygiene — kd_ai_log führt ausdrücklich KEINE Inhalte
   =========================================================================== */

test("D1 gültige Versionsangaben laufen durch und landen in der Reservierung", async () => {
  const r = await echoRuf({ promptVersion: "v1", profilVersion: "v1" });
  gleich(r.status, 200, "Status");
  const k = starten()[0].koerper as Record<string, unknown>;
  gleich(k.p_prompt_version, "v1", "promptVersion durchgereicht");
  gleich(k.p_profil_version, "v1", "profilVersion durchgereicht");
});

test("D2 promptVersion mit Leerzeichen (ein ganzer Suchsatz): 400", async () => {
  const satz = "melancholisch aber kein liebesfilm";
  const r = await echoRuf({ promptVersion: satz });
  gleich(r.status, 400, "Status");
  /* ÜBERGANGSZUSTAND, bewusst NICHT festgeschrieben: der Code lautet heute
     `invalid-response` — derselbe wie für eine unbrauchbare Modellantwort.
     Nach „Grund vor Status" kann ein Client damit „deine Eingabe war falsch"
     nicht von „das Modell hat Müll geliefert" unterscheiden. Die Aufteilung in
     einen eigenen Code samt Nutzertext gehört zur Client-Naht in Phase 3
     (src/services/errors.js). Geprüft wird deshalb nur das Dauerhafte: es ist
     ein Fehler, und der GRUND ist die stabile Kennung. */
  gleich(r.daten.ok, false, "ok:false");
  gleich(r.daten.grund, "versionsangabe-ungueltig", "Grund");
  gleich(starten().length, 0, "keine Reservierung — nichts erreicht das Protokoll");
  gleich(beenden().length, 0, "keine Protokollzeile");
  falsch(JSON.stringify(aufrufe).includes("melancholisch"), "der Suchsatz verlässt den Endpunkt nicht");
});

test("D3 profilVersion mit Leerzeichen: 400", async () => {
  const r = await echoRuf({ profilVersion: "profil vom 26.07. mit lieblingsregisseur" });
  gleich(r.status, 400, "Status");
  gleich(r.daten.grund, "versionsangabe-ungueltig", "Grund");
  gleich(starten().length, 0, "keine Reservierung");
  falsch(JSON.stringify(aufrufe).includes("lieblingsregisseur"), "kein Inhalt im Netzverkehr");
});

test("D4 zu lange promptVersion (21 Zeichen): 400", async () => {
  gleich((await echoRuf({ promptVersion: "v".repeat(21) })).status, 400, "21 Zeichen abgewiesen");
  stelleZurueck();
  gleich((await echoRuf({ promptVersion: "v".repeat(20) })).status, 200, "20 Zeichen erlaubt");
});

test("D5 zu lange profilVersion: 400", async () => {
  const r = await echoRuf({ profilVersion: "p".repeat(64) });
  gleich(r.status, 400, "Status");
  gleich(r.daten.grund, "versionsangabe-ungueltig", "Grund");
});

test("D6 leere Versionsangabe wird abgewiesen, fehlende ist erlaubt", async () => {
  gleich((await echoRuf({ promptVersion: "" })).status, 400, "leerer String ist keine Version");
  stelleZurueck();
  const r = await echoRuf({});
  gleich(r.status, 200, "ohne Versionsangabe läuft es");
  gleich((starten()[0].koerper as Record<string, unknown>).p_prompt_version, null, "null statt Leerstring");
});

/* --- Der schärfste Test: ein Angriff auf p_fehlerklasse ------------------------
   Der gefährlichste Weg ist nicht der Normalfall, sondern ein „hilfreicher"
   fachlicher Prüfgrund, der den Nutzerwert mitnimmt (`schema:genre-unbekannt:
   <wert>`). Genau diesen Weg baue ich hier nach: eine Aufgabe, die den Payload
   des Nutzers in ihren Prüfgrund schreibt. Der Rumpf muss ihn KOMPLETT
   verwerfen — säubern genügte nicht, aus einem Suchsatz bliebe sonst ein
   lesbares Wortband. */
test("D7 Angriff: fachlicher Prüfgrund mit Nutzerinhalt wird komplett verworfen", async () => {
  const geheim = "melancholisch aber kein liebesfilm mit tom hanks";
  AUFGABEN["test-leck"] = {
    // deno-lint-ignore no-explicit-any
    bauAuftrag(payload: any) {
      return { system: "s", nutzertext: String(payload.suche ?? ""), schema: null };
    },
    pruefeErgebnis() {
      /* Der „hilfreiche" Grund, vor dem die Doku warnt. */
      return "schema:genre-unbekannt:" + geheim;
    },
  };
  try {
    const r = await ruf({ task: "test-leck", vorgangId: neueVorgangId(), payload: { suche: geheim } });
    gleich(r.status, 502, "Status invalid-response");
    gleich(r.daten.grund, "antwort-verletzt-schema", "Grund enthält keine Nutzereingabe");
    const k = genauEinAbschluss();
    gleich(k.p_status, "fehler", "Zeile als Fehler abgeschlossen");
    gleich(k.p_fehlerklasse, "unklassifiziert", "komplett verworfen statt gesäubert");
    pruefeKeinInhaltImProtokoll([geheim, "melancholisch", "liebesfilm", "tom hanks", "genre-unbekannt"]);
  } finally {
    delete AUFGABEN["test-leck"];
  }
});

test("D8 Angriff: Anbieter meldet einen Fehlertyp im Klartext", async () => {
  const geheim = "Suche nach melancholisch aber kein liebesfilm";
  z.anbieter = () => antwort({ error: { type: geheim, message: geheim } }, 400);
  const r = await echoRuf();
  gleich(r.status, 500, "Status server");
  const k = genauEinAbschluss();
  pruefeKeinInhaltImProtokoll([geheim, "melancholisch", "Suche nach"]);
  /* Die Form lässt seit dem 26.07. drei Abschnitte durch, damit der harmlose
     Anbieterfehler diagnostizierbar bleibt. Ein Fehlertyp im Klartext muss
     trotzdem KOMPLETT fallen — geprüft, nicht gesäubert. */
  gleich(k.p_fehlerklasse, "unklassifiziert", "verworfen statt gesäubert");
});

/* --- Die erweiterte Form ist eine Erweiterung, keine Öffnung ---------------- */
test("D8b harmloser Anbieterfehler kommt vollständig ins Protokoll", async () => {
  z.anbieter = () => antwort({ error: { type: "invalid_request_error" } }, 400);
  await echoRuf();
  const k = genauEinAbschluss();
  gleich(k.p_fehlerklasse, "server:anbieterfehler:400:invalid_request_error",
    "drei Abschnitte passieren — sonst wäre jeder Anbieter-HTTP-Fehler blind");
  pruefeFehlerklasseSauber(k);
});

test("D8c vier Abschnitte fallen weiter auf unklassifiziert", async () => {
  /* GENAU ein Abschnitt zu viel — sonst prüft der Test die Grenze nicht.
     `server:anbieterfehler:400:invalid_request_error:genre` hat vier Abschnitte
     nach der Basis; drei sind erlaubt. Die Form wurde um einen Abschnitt
     erweitert, nicht aufgehoben. Ein Fall mit fünf Abschnitten würde auch eine
     versehentlich auf vier geöffnete Form noch passieren lassen und die
     Erweiterung damit unbemerkt durchgehen. */
  z.anbieter = () => antwort({ error: { type: "invalid_request_error:genre" } }, 400);
  await echoRuf();
  const k = genauEinAbschluss();
  gleich(k.p_fehlerklasse, "unklassifiziert", "vier Abschnitte sind einer zu viel");
  falsch(String(k.p_fehlerklasse).includes("genre"), "kein Bruchstück bleibt übrig");
});

test("D9 Angriff: Verweigerungskategorie im Klartext", async () => {
  const geheim = "policy violation: user asked about tom hanks";
  z.anbieter = () => anbieterStop("refusal", { stop_details: { type: geheim } });
  const r = await echoRuf();
  gleich(r.status, 422, "Status");
  gleich(r.daten.grund, "modell-hat-abgelehnt", "Kategorie im Klartext wird gar nicht erst übernommen");
  const k = genauEinAbschluss();
  pruefeKeinInhaltImProtokoll([geheim, "tom hanks", "policy violation"]);
});

test("D10 Angriff: Modell-ID im Klartext (Preisvermerk)", async () => {
  const geheim = "modell für melancholisch aber kein liebesfilm";
  z.anbieter = () => antwort({
    model: geheim,
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ echo: "Kinodreieck", zeichen: 11 }) }],
    usage: { input_tokens: 100, output_tokens: 20 },
  });
  const r = await echoRuf();
  gleich(r.status, 200, "Status");
  const k = genauEinAbschluss();
  /* p_modell ist eine eigene Spalte für die Modell-ID — sie darf den Wert
     tragen; die FEHLERKLASSE darf ihn nicht als Fragment übernehmen. */
  pruefeFehlerklasseSauber(k);
  gleich(k.p_fehlerklasse, "unklassifiziert", "Vermerk mit Freitext wird verworfen");
});

test("D11 über alle Fehlerpfade: keine Fehlerklasse mit Leerzeichen", async () => {
  const faelle: Array<[string, () => void]> = [
    ["refusal", () => { z.anbieter = () => anbieterStop("refusal", { stop_details: { type: "harmful content!" } }); }],
    ["max_tokens", () => { z.anbieter = () => anbieterStop("max_tokens"); }],
    ["kontext", () => { z.anbieter = () => anbieterStop("model_context_window_exceeded"); }],
    ["pause", () => { z.anbieter = () => anbieterStop("pause_turn"); }],
    ["429", () => { z.anbieter = () => antwort({ error: { type: "rate limit hit for org" } }, 429); }],
    ["529", () => { z.anbieter = () => antwort({ error: { type: "overloaded, retry later" } }, 529); }],
    ["400", () => { z.anbieter = () => antwort({ error: { type: "invalid request: field x" } }, 400); }],
    ["500", () => { z.anbieter = () => antwort({ error: { type: "server exploded" } }, 500); }],
    ["kein-json", () => { z.anbieter = () => anbieterErfolg("das ist kein json, sondern ein satz"); }],
    ["schemabruch", () => { z.anbieter = () => anbieterErfolg({ falsch: "feld" }); }],
    ["netz", () => { z.anbieter = () => { throw new TypeError("connection refused"); }; }],
  ];
  for (const [name, stellen] of faelle) {
    stelleZurueck();
    stellen();
    await echoRuf();
    gleich(beenden().length, 1, `Abschluss im Fall ${name}`);
    pruefeFehlerklasseSauber(beenden()[0].koerper as Record<string, unknown>);
  }
});

/* ===========================================================================
   E. Anbieter-Verhalten (stop_reason und HTTP-Fehler)
   =========================================================================== */

test("E1 refusal: 422 ai-refused", async () => {
  z.anbieter = () => anbieterStop("refusal");
  const r = await echoRuf();
  gleich(r.status, 422, "Status");
  gleich(r.daten.code, "ai-refused", "Code");
  gleich(r.daten.grund, "modell-hat-abgelehnt", "Grund");
});

test("E2 refusal mit stop_details: die Kategorie steht in der Fehlerklasse", async () => {
  z.anbieter = () => anbieterStop("refusal", { stop_details: { type: "harmful_content" } });
  const r = await echoRuf();
  gleich(r.status, 422, "Status");
  gleich(r.daten.grund, "modell-hat-abgelehnt:harmful_content", "Grund mit Kategorie");
  const k = genauEinAbschluss();
  wahr(String(k.p_fehlerklasse).includes("harmful_content"), `Kategorie im Protokoll (war ${k.p_fehlerklasse})`);
  pruefeFehlerklasseSauber(k);
});

test("E2b Verweigerungskategorie in Großschreibung erhält die Diagnose", async () => {
  /* Die Kategorie ist ein Enum des Anbieters; er darf sie jederzeit in
     Großschreibung liefern. Vorher löschte das die GANZE Fehlerklasse (samt
     Code) auf `unklassifiziert` — also genau die Diagnose, für die die
     Kategorie überhaupt mitgenommen wird. */
  z.anbieter = () => anbieterStop("refusal", { stop_details: { type: "Harmful_Content" } });
  const r = await echoRuf();
  gleich(r.status, 422, "Status");
  const k = genauEinAbschluss();
  gleich(k.p_fehlerklasse, "ai-refused:modell-hat-abgelehnt:harmful_content",
    "kleingeschrieben übernommen statt komplett verworfen");
  pruefeFehlerklasseSauber(k);
});

test("E3 refusal bucht den abgerechneten Verbrauch", async () => {
  z.anbieter = () => anbieterStop("refusal");
  await echoRuf();
  const k = genauEinAbschluss();
  gleich(k.p_status, "fehler", "Status");
  gleich(k.p_input_tokens, 100, "Eingabetokens gebucht");
  gleich(k.p_output_tokens, 20, "Ausgabetokens gebucht");
  wahr((k.p_kosten as number) > 0, `Kosten > 0 (war ${k.p_kosten})`);
});

test("E4 max_tokens: 502 antwort-abgeschnitten, nicht 'kein JSON'", async () => {
  z.anbieter = () => anbieterStop("max_tokens");
  const r = await echoRuf();
  gleich(r.status, 502, "Status");
  gleich(r.daten.code, "invalid-response", "Code");
  gleich(r.daten.grund, "antwort-abgeschnitten", "eigene Kennung statt antwort-kein-json");
  const k = genauEinAbschluss();
  wahr(String(k.p_fehlerklasse).includes("antwort-abgeschnitten"), "Kennung im Protokoll");
  wahr((k.p_kosten as number) > 0, `Verbrauch gebucht, Kosten > 0 (war ${k.p_kosten})`);
});

test("E5 model_context_window_exceeded: eigene Kennung", async () => {
  z.anbieter = () => anbieterStop("model_context_window_exceeded");
  const r = await echoRuf();
  gleich(r.status, 502, "Status");
  gleich(r.daten.code, "invalid-response", "Code");
  gleich(r.daten.grund, "kontextfenster-ueberschritten", "eigene Kennung");
  const k = genauEinAbschluss();
  wahr((k.p_kosten as number) > 0, `Verbrauch gebucht, Kosten > 0 (war ${k.p_kosten})`);
});

test("E6 pause_turn: eigene Kennung", async () => {
  z.anbieter = () => anbieterStop("pause_turn");
  const r = await echoRuf();
  gleich(r.status, 502, "Status");
  gleich(r.daten.grund, "antwort-pausiert", "eigene Kennung");
  const k = genauEinAbschluss();
  wahr((k.p_kosten as number) > 0, `Verbrauch gebucht, Kosten > 0 (war ${k.p_kosten})`);
});

test("E7 Anbieter-429 ist server, nicht limit", async () => {
  z.anbieter = () => antwort({ error: { type: "rate_limit_error" } }, 429);
  const r = await echoRuf();
  gleich(r.daten.code, "server", "Code — ein Engpass beim Anbieter ist nicht das Kontingent des Kontos");
  falsch(r.daten.code === "limit", "keinesfalls limit");
  gleich(r.status, 500, "Status");
  wahr(String(r.daten.grund).startsWith("anbieter-ueberlastet"), `Grund (war ${r.daten.grund})`);
  genauEinAbschluss();
});

test("E8 Anbieter-529 ist server, nicht limit", async () => {
  z.anbieter = () => antwort({ error: { type: "overloaded_error" } }, 529);
  const r = await echoRuf();
  gleich(r.daten.code, "server", "Code");
  falsch(r.status === 429, "nicht als Kontingentfehler");
  wahr(String(r.daten.grund).startsWith("anbieter-ueberlastet"), `Grund (war ${r.daten.grund})`);
  genauEinAbschluss();
});

test("E9 Anbieter-400 mit Schema-Kompilierfehler: schema-zu-komplex", async () => {
  z.anbieter = () => antwort({
    error: { type: "invalid_request_error", message: "Failed to compile output schema: too complex" },
  }, 400);
  const r = await echoRuf();
  gleich(r.daten.code, "server", "Code");
  gleich(r.daten.grund, "schema-zu-komplex", "unser Programmierfehler, kein Anbieterausfall");
  falsch(String(r.daten.grund).startsWith("anbieterfehler"), "nicht als Anbieterausfall gemeldet");
  genauEinAbschluss();
});

test("E10 Anbieter-400 ohne Schemabezug bleibt anbieterfehler:400", async () => {
  z.anbieter = () => antwort({ error: { type: "invalid_request_error", message: "max_tokens too large" } }, 400);
  const r = await echoRuf();
  gleich(r.daten.code, "server", "Code");
  wahr(String(r.daten.grund).startsWith("anbieterfehler:400"), `Grund (war ${r.daten.grund})`);
  genauEinAbschluss();
});

test("E11 abgelehnter Anbieterschlüssel und fehlendes Guthaben", async () => {
  z.anbieter = () => antwort({ error: { type: "authentication_error" } }, 401);
  let r = await echoRuf();
  gleich(r.daten.grund, "anbieterschluessel-abgelehnt", "401 des Anbieters");
  genauEinAbschluss();
  stelleZurueck();
  z.anbieter = () => antwort({ error: { type: "billing_error" } }, 402);
  r = await echoRuf();
  gleich(r.daten.grund, "anbieter-guthaben", "402 des Anbieters");
  genauEinAbschluss();
});

test("E12 Anbieter nicht erreichbar: server, Reservierung bleibt stehen", async () => {
  z.anbieter = () => { throw new TypeError("connection refused"); };
  const r = await echoRuf();
  gleich(r.daten.code, "server", "Code");
  gleich(r.daten.grund, "anbieter-nicht-erreichbar", "Grund");
  const k = genauEinAbschluss();
  /* Kein Verbrauch bekannt: die Reservierung bleibt gebucht statt auf 0 zu
     fallen (Doktrin aus Etappe 5 — lieber zu viel buchen als blind). */
  gleich(k.p_kosten, null, "keine Istkosten, die Reservierung bleibt stehen");
});

test("E13 Zeitgrenze: der Vorgang wird trotzdem abgeschlossen", async () => {
  z.konfig.timeout_ms = 30;
  z.anbieter = (init?: RequestInit) => new Promise<Response>((_loese, weise) => {
    const signal = init?.signal;
    if (signal) {
      signal.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        weise(e);
      });
    }
  });
  const r = await echoRuf();
  gleich(r.daten.code, "server", "Code");
  gleich(r.daten.grund, "anbieter-zeitgrenze", "Grund");
  genauEinAbschluss();
});

test("E14 Antwort ist kein JSON: 502 antwort-kein-json", async () => {
  z.anbieter = () => anbieterErfolg("Hier ist dein Ergebnis!");
  const r = await echoRuf();
  gleich(r.status, 502, "Status");
  gleich(r.daten.grund, "antwort-kein-json", "Grund");
  const k = genauEinAbschluss();
  wahr((k.p_kosten as number) > 0, "Verbrauch gebucht");
});

test("E15 Antwort verletzt das Fachschema: 502 antwort-verletzt-schema", async () => {
  z.anbieter = () => anbieterErfolg({ echo: "Kinodreieck" });
  const r = await echoRuf();
  gleich(r.status, 502, "Status");
  gleich(r.daten.grund, "antwort-verletzt-schema", "Grund");
  const k = genauEinAbschluss();
  wahr(String(k.p_fehlerklasse).includes("schema"), `Kennung (war ${k.p_fehlerklasse})`);
  wahr((k.p_kosten as number) > 0, "Verbrauch gebucht");
});

test("E16 Antwort größer als antwort_max_bytes: 502 antwort-zu-gross", async () => {
  z.konfig.antwort_max_bytes = 100;
  z.anbieter = () => anbieterErfolg({ echo: "K".repeat(500), zeichen: 500 });
  const r = await echoRuf();
  gleich(r.status, 502, "Status");
  gleich(r.daten.grund, "antwort-zu-gross", "Grund");
  const k = genauEinAbschluss();
  wahr((k.p_kosten as number) > 0, "Verbrauch gebucht");
});

/* ===========================================================================
   F. Grenzen aus der Datenbank — Durchreichung von kd_ai_auftrag_starten
   =========================================================================== */

const DURCHREICHUNG: Array<[string, string, number]> = [
  ["ai-disabled", "not-aus-gesetzt", 503],
  ["limit", "tageslimit-erreicht", 429],
  ["limit", "monatsbudget-erschoepft", 429],
  ["ai-duplicate", "vorgang-bereits-gestartet", 409],
  ["server", "limitkonfiguration-unvollstaendig", 500],
];

for (const [code, grund, status] of DURCHREICHUNG) {
  test(`F ${code}/${grund} wird als ${status} durchgereicht`, async () => {
    z.start = { ok: false, code, grund };
    const r = await echoRuf();
    gleich(r.status, status, "Status");
    gleich(r.daten.code, code, "Code");
    gleich(r.daten.grund, grund, "Grund");
    gleich(anbieterAufrufe().length, 0, "kein Anbieteraufruf — es wurde nichts reserviert");
    gleich(beenden().length, 0, "kein Abschluss — es gibt keine Zeile");
  });
}

test("F6 die Reservierungs-RPC scheitert hart: 500 mit Postgres-Code", async () => {
  z.startHttpFehler = {
    status: 404,
    koerper: { code: "PGRST202", message: "function not found", details: null, hint: null },
  };
  const r = await echoRuf();
  gleich(r.status, 500, "Status");
  gleich(r.daten.code, "server", "Code");
  wahr(String(r.daten.grund).startsWith("auftrag-start-fehlgeschlagen"), `Grund (war ${r.daten.grund})`);
  wahr(String(r.daten.grund).includes("PGRST202"), "der Postgres-Code ist diagnostizierbar mitgegeben");
  gleich(anbieterAufrufe().length, 0, "kein Anbieteraufruf");
});

test("F7 Konfiguration nicht lesbar: 500, kein Anbieteraufruf", async () => {
  z.konfigLesbar = false;
  const r = await echoRuf();
  gleich(r.status, 500, "Status");
  gleich(r.daten.code, "server", "Code");
  gleich(r.daten.grund, "konfiguration-nicht-lesbar", "Grund");
  gleich(anbieterAufrufe().length, 0, "kein Anbieteraufruf");
});

/* ===========================================================================
   G. Keine Geisterzeile — jeder Abbruchpfad nach der Reservierung schließt ab
   Laut Etappe-5-Doku die häufigste Fehlerquelle beim Nachbauen des Zyklus:
   ein Vorgang ohne Ende blockiert den Parallelzähler bis zur Zeitgrenze und
   lässt die Reservierung dauerhaft gebucht. Deshalb JEDER Pfad einzeln.
   =========================================================================== */

const ABBRUCHPFADE: Array<[string, () => void, "mit-kosten" | "ohne-kosten"]> = [
  ["refusal", () => { z.anbieter = () => anbieterStop("refusal"); }, "mit-kosten"],
  ["max_tokens", () => { z.anbieter = () => anbieterStop("max_tokens"); }, "mit-kosten"],
  ["kontextfenster", () => { z.anbieter = () => anbieterStop("model_context_window_exceeded"); }, "mit-kosten"],
  ["pause_turn", () => { z.anbieter = () => anbieterStop("pause_turn"); }, "mit-kosten"],
  ["anbieter-429", () => { z.anbieter = () => antwort({ error: { type: "rate_limit_error" } }, 429); }, "ohne-kosten"],
  ["anbieter-529", () => { z.anbieter = () => antwort({ error: { type: "overloaded_error" } }, 529); }, "ohne-kosten"],
  ["anbieter-400", () => { z.anbieter = () => antwort({ error: { type: "invalid_request_error" } }, 400); }, "ohne-kosten"],
  ["anbieter-500", () => { z.anbieter = () => antwort({ error: { type: "api_error" } }, 500); }, "ohne-kosten"],
  ["schema-zu-komplex", () => {
    z.anbieter = () => antwort({ error: { type: "invalid_request_error", message: "schema failed to compile" } }, 400);
  }, "ohne-kosten"],
  ["netzfehler", () => { z.anbieter = () => { throw new TypeError("connection refused"); }; }, "ohne-kosten"],
  ["antwort-kein-json", () => { z.anbieter = () => anbieterErfolg("kein json"); }, "mit-kosten"],
  ["antwort-verletzt-schema", () => { z.anbieter = () => anbieterErfolg({ falsch: 1 }); }, "mit-kosten"],
  ["antwort-zu-gross", () => {
    z.konfig.antwort_max_bytes = 50;
    z.anbieter = () => anbieterErfolg({ echo: "K".repeat(400), zeichen: 400 });
  }, "mit-kosten"],
];

for (const [name, stellen, kostenart] of ABBRUCHPFADE) {
  test(`G Abbruchpfad ${name} hinterlässt keine Geisterzeile`, async () => {
    stellen();
    const r = await echoRuf();
    falsch(r.status === 200, "der Pfad bricht wirklich ab");
    gleich(starten().length, 1, "genau eine Reservierung");
    const k = genauEinAbschluss();
    gleich(k.p_status, "fehler", "die Zeile wird als Fehler geschlossen");
    if (kostenart === "mit-kosten") {
      wahr(typeof k.p_kosten === "number" && (k.p_kosten as number) > 0,
        `abgerechnete Tokens werden gebucht (war ${k.p_kosten})`);
    } else {
      gleich(k.p_kosten, null, "ohne bekannten Verbrauch bleibt die Reservierung stehen");
    }
    pruefeFehlerklasseSauber(k);
  });
}

test("G14 der Erfolgspfad schließt die Zeile ebenfalls genau einmal", async () => {
  await echoRuf();
  const k = genauEinAbschluss();
  gleich(k.p_status, "fertig", "Status");
});

/* Der Pfad, der die Geisterzeile erzeugte (Befund vom 26.07., behoben): eine
   Ausnahme in `pruefeErgebnis` flog am Abschluss vorbei, die Zeile blieb auf
   `laufend`, blockierte den Parallelzähler bis zur Zeitgrenze und ließ die
   Reservierung dauerhaft gebucht — und der Client bekam einen nackten 500 ohne
   `code`, den er nach der Doktrin „Grund vor Status" gar nicht übersetzen kann.
   Für `echo-struct` unmöglich, ab Etappe 6 aber die naheliegendste Fehlerquelle:
   jede neue Aufgabe bringt eigenen Prüfcode mit. */
test("G15 eine werfende Aufgabenprüfung schließt die Zeile und meldet sauber", async () => {
  AUFGABEN["test-wirft"] = {
    bauAuftrag() { return { system: "s", nutzertext: "n", schema: null }; },
    pruefeErgebnis() { throw new Error("Programmierfehler in der Aufgabe"); },
  };
  try {
    let geflogen: string | null = null;
    let r: Awaited<ReturnType<typeof ruf>> | null = null;
    try {
      r = await ruf({ task: "test-wirft", vorgangId: neueVorgangId(), payload: {} });
    } catch (e) {
      geflogen = (e as Error).message;
    }
    gleich(geflogen, null, "die Ausnahme verlässt den Handler nicht");
    gleich(starten().length, 1, "genau eine Reservierung");
    gleich(r!.status, 502, "Status");
    /* Kein nackter 500: der Client übersetzt nach `code`. */
    gleich(r!.daten.code, "invalid-response", "stabiler Code statt Absturz");
    gleich(r!.daten.grund, "antwort-verletzt-schema", "Grund ohne Nutzerinhalt");
    const k = genauEinAbschluss();
    gleich(k.p_status, "fehler", "die Zeile ist geschlossen — keine Geisterzeile");
    gleich(k.p_fehlerklasse, "invalid-response:pruefung-abgestuerzt",
      "der Absturz ist als eigene Kennung unterscheidbar, nicht als Schemabruch getarnt");
    wahr((k.p_kosten as number) > 0, "die abgerechneten Tokens werden trotzdem gebucht");
  } finally {
    delete AUFGABEN["test-wirft"];
  }
});

/* ===========================================================================
   H. Kostenlose Pfade
   =========================================================================== */

test("H1 health: 200, ohne Reservierung und ohne Anbieteraufruf", async () => {
  const r = await ruf({ task: "health", vorgangId: neueVorgangId() });
  gleich(r.status, 200, "Status");
  gleich(r.daten.ok, true, "ok");
  gleich(r.daten.task, "health", "task");
  gleich(starten().length, 0, "keine Reservierung — health kostet nichts");
  gleich(beenden().length, 0, "keine Protokollzeile");
  gleich(anbieterAufrufe().length, 0, "kein Anbieteraufruf");
  const betrieb = r.daten.betrieb as Record<string, unknown>;
  gleich(betrieb.aiAktiv, true, "betrieb.aiAktiv");
});

test("H2 health braucht trotzdem ein gültiges Token", async () => {
  const r = await ruf({ task: "health" }, { ohneToken: true });
  gleich(r.status, 401, "Status");
  gleich(aufrufe.length, 0, "kein Netzaufruf");
});

test("H3 health läuft auch bei gesetztem Not-Aus (reine Diagnose ohne Anbieter)", async () => {
  z.konfig.ai_aktiv = false;
  const r = await ruf({ task: "health", vorgangId: neueVorgangId() });
  gleich(r.status, 200, "Status");
  gleich((r.daten.betrieb as Record<string, unknown>).aiAktiv, false, "der Not-Aus wird berichtet");
  gleich(anbieterAufrufe().length, 0, "kein Anbieteraufruf");
});

test("H4 anbieter-modelle bei gesetztem Not-Aus: 503, kein Anbieteraufruf", async () => {
  z.konfig.ai_aktiv = false;
  let modelleGerufen = 0;
  z.modelle = () => { modelleGerufen++; return antwort({ data: [] }); };
  const r = await ruf({ task: "anbieter-modelle", vorgangId: neueVorgangId() });
  gleich(r.status, 503, "Status");
  gleich(r.daten.code, "ai-disabled", "Code");
  gleich(r.daten.grund, "not-aus-gesetzt", "Grund");
  /* Auch eine tokenfreie Diagnose verbraucht das Ratenkontingent des echten
     Schlüssels — der Not-Aus muss sie deshalb genauso stoppen. */
  gleich(modelleGerufen, 0, "der echte Schlüssel wird nicht angefasst");
  gleich(starten().length, 0, "keine Reservierung");
});

test("H5 anbieter-modelle bei aktivem Betrieb: 200 mit Liste, keine Protokollzeile", async () => {
  const r = await ruf({ task: "anbieter-modelle", vorgangId: neueVorgangId() });
  gleich(r.status, 200, "Status");
  const liste = r.daten.modelle as Array<Record<string, unknown>>;
  wahr(Array.isArray(liste) && liste.length > 0, "Liste vorhanden");
  gleich(liste[0].id, "claude-sonnet-5", "Modell-ID");
  gleich(starten().length, 0, "keine Reservierung");
  gleich(beenden().length, 0, "keine Protokollzeile");
});

test("H6 anbieter-modelle meldet nur den Fehlertyp, nie die Anbietermeldung", async () => {
  const geheim = "your organization has been flagged: contact support";
  z.modelle = () => antwort({ error: { type: "permission_error", message: geheim } }, 403);
  const r = await ruf({ task: "anbieter-modelle", vorgangId: neueVorgangId() });
  gleich(r.status, 500, "Status");
  gleich(r.daten.diagnose, "permission_error", "nur der Fehlertyp (ein Enum)");
  falsch(JSON.stringify(r.daten).includes("flagged"), "die Anbietermeldung erscheint nicht");
});

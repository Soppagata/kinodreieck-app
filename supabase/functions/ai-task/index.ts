/* Kinodreieck — geschützter KI-Endpunkt (Etappe 5)
   ===========================================================================
   Ein Endpunkt für genau definierte KI-Aufgaben. Der Anbieterschlüssel, die
   Kostenkontrolle und die Identitätsprüfung liegen hier — nie im Browser.

   Dieser Stand enthält BEWUSST KEINE fachliche KI-Funktion. `intelligent-search`
   und `masterlist-enrichment` sind registriert und melden `not-implemented`;
   sie entstehen in Etappe 6 und danach auf genau diesem Unterbau.

   Ablauf jedes Aufrufs, in dieser Reihenfolge:
     Aufrufer prüfen -> Größe prüfen -> Konfiguration lesen
     -> Not-Aus/Limits prüfen UND Protokollzeile anlegen (atomar, in der DB)
     -> Anbieter mit Zeitgrenze rufen -> Antwort strukturell prüfen
     -> Protokollzeile abschließen -> antworten.
   Jeder Abbruchpfad ab der Protokollzeile schließt sie ebenfalls ab; ein
   Vorgang ohne Ende bliebe sonst als Geist im Parallelzähler stehen.

   Belegte Laufzeitfakten (Spike vom 26.07.2026, echte Antwort der Plattform):
     Runtime   supabase-edge-runtime-1.74.2 (kompatibel mit Deno v2.1.4)
     Region    eu-central-1
     Env       SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEYS,
               SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEYS, SUPABASE_JWKS,
               SUPABASE_DB_URL, ANTHROPIC_API_KEY, SB_REGION, SB_EXECUTION_ID
     Schlüssel SUPABASE_PUBLISHABLE_KEYS ist ein JSON-Objekt mit Schlüssel
               "default" — nicht etwa ein roher String
     Claims    getClaims(token) liefert u. a. sub, role, exp, session_id
     Wichtig   Der öffentliche Projektschlüssel PASSIERT die Plattformprüfung
               (verify_jwt) und erreicht diesen Code. Gestoppt wird er erst von
               der eigenen Prüfung unten. Die Plattformprüfung ist damit
               nachweislich eine Vorhut und kein Beweis — diese Funktion darf
               sich niemals allein auf sie verlassen.

   Alles bleibt in EINER Datei: der Deploy lädt ausweislich seiner Ausgabe
   `index.ts` als Asset hoch; Nachbarmodule wären ein unnötiges Risiko.
   =========================================================================== */

import { createClient } from "npm:@supabase/supabase-js@2";

const ANBIETER_URL = "https://api.anthropic.com/v1/messages";
const ANBIETER_MODELLE_URL = "https://api.anthropic.com/v1/models";
const ANBIETER_VERSION = "2023-06-01";

/* ---------- CORS ------------------------------------------------------------
   Allowlist statt Wildcard. Ehrlich eingeordnet: CORS ist hier keine
   Sicherheitsgrenze — das Sitzungstoken liegt im localStorage und wird nicht
   automatisch mitgeschickt. Die echte Grenze ist die Tokenprüfung. */
const ERLAUBTE_ORIGINS = new Set([
  "https://kinodreieck.at",
  "https://staging.kinodreieck.at",
  "http://localhost:5173",
]);

function corsKopf(origin: string | null): Record<string, string> {
  const kopf: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ERLAUBTE_ORIGINS.has(origin)) kopf["Access-Control-Allow-Origin"] = origin;
  return kopf;
}

/* ---------- Fehlerklassen ---------------------------------------------------
   Dieselben stabilen Codes wie in src/services/errors.js. Der Client übersetzt
   nach `code`, nicht nach Status (Lehre aus Etappe 4: Grund vor Status). */
const CODES = {
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  LIMIT: "limit",
  SERVER: "server",
  INVALID_RESPONSE: "invalid-response",
  AI_DISABLED: "ai-disabled",
  AI_REFUSED: "ai-refused",
  NOT_IMPLEMENTED: "not-implemented",
  AI_DUPLICATE: "ai-duplicate",
} as const;

const STATUS: Record<string, number> = {
  [CODES.UNAUTHENTICATED]: 401,
  [CODES.FORBIDDEN]: 403,
  [CODES.LIMIT]: 429,
  [CODES.AI_DISABLED]: 503,
  [CODES.AI_REFUSED]: 422,
  [CODES.INVALID_RESPONSE]: 502,
  [CODES.NOT_IMPLEMENTED]: 501,
  [CODES.AI_DUPLICATE]: 409,
  [CODES.SERVER]: 500,
};

const FACHAUFGABEN = new Set(["intelligent-search", "masterlist-enrichment"]);

function jsonAntwort(koerper: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...corsKopf(origin), "Content-Type": "application/json" },
  });
}

function fehlerAntwort(
  code: string,
  origin: string | null,
  extra: { grund?: string; vorgangId?: string | null; status?: number; diagnose?: unknown } = {},
) {
  const koerper: Record<string, unknown> = {
    ok: false,
    code,
    grund: extra.grund ?? null,
    vorgangId: extra.vorgangId ?? null,
  };
  if (extra.diagnose !== undefined) koerper.diagnose = extra.diagnose;
  return jsonAntwort(koerper, extra.status ?? STATUS[code] ?? 500, origin);
}

/* ---------- Schlüssel aus der Umgebung --------------------------------------
   Form im Spike belegt: die neuen Schlüsselvariablen sind JSON-Objekte mit dem
   Eintrag "default". Die Legacy-Variablen sind rohe Strings und weiterhin
   gesetzt. Bevorzugt wird die neue Form; welche tatsächlich getragen hat,
   meldet der Gesundheitsbericht — nichts davon geschieht still. */
function loeseSchluessel(neuName: string, legacyName: string): { schluessel: string | null; herkunft: string | null } {
  const roh = Deno.env.get(neuName);
  if (roh) {
    try {
      const dict = JSON.parse(roh);
      const kandidat = dict?.default ?? (dict && typeof dict === "object" ? Object.values(dict)[0] : null);
      if (typeof kandidat === "string" && kandidat.length > 0) return { schluessel: kandidat, herkunft: neuName };
    } catch { /* Form gemeldet über den Gesundheitsbericht */ }
  }
  const legacy = Deno.env.get(legacyName);
  if (legacy) return { schluessel: legacy, herkunft: legacyName };
  return { schluessel: null, herkunft: null };
}

const oeffentlich = () => loeseSchluessel("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const geheim = () => loeseSchluessel("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const { schluessel } = geheim();
  if (!url || !schluessel) return null;
  return createClient(url, schluessel, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* ---------- Aufruferprüfung -------------------------------------------------- */
class AufrufFehler extends Error {
  code: string;
  grund: string;
  /* Ein Fehlschlag kann Geld gekostet haben: eine Verweigerung kommt mit
     abgerechneten Tokens, eine Zeitgrenze ebenfalls. Der Verbrauch reist
     deshalb am Fehler mit, statt verloren zu gehen. */
  verbrauch: { modell?: string; inputTokens?: number; outputTokens?: number } | null;
  constructor(code: string, grund: string, verbrauch: AufrufFehler["verbrauch"] = null) {
    super(grund);
    this.code = code;
    this.grund = grund;
    this.verbrauch = verbrauch;
  }
}

type Aufrufer = { accountId: string; rolle: string; claimsSchluessel: string[]; weg: string };

async function pruefeAufrufer(req: Request): Promise<Aufrufer> {
  const treffer = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!treffer) throw new AufrufFehler(CODES.UNAUTHENTICATED, "kein-bearer-token");
  const token = treffer[1];

  const url = Deno.env.get("SUPABASE_URL");
  const { schluessel } = oeffentlich();
  if (!url || !schluessel) throw new AufrufFehler(CODES.SERVER, "projektkonfiguration-unvollstaendig");

  const supabase = createClient(url, schluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* Das Token wird AUSDRÜCKLICH übergeben. Im Spike belegt: `getClaims()` ohne
     Argument prüft die Sitzung des Clients — die ist hier leer, und der
     Authorization-Header wird dabei nicht herangezogen. */
  let claims: Record<string, unknown> | null = null;
  let weg = "";

  try {
    const { data, error } = await supabase.auth.getClaims(token);
    const kandidat = (data as Record<string, unknown> | null)?.claims;
    if (!error && kandidat && typeof kandidat === "object") {
      claims = kandidat as Record<string, unknown>;
      weg = "getClaims";
    }
  } catch { /* Ersatzweg unten */ }

  /* Ersatzweg mit Netz-Rückfrage. Der Spike hat `getClaims` als tragend
     belegt; dieser Weg bleibt als Netz für den Fall, dass eine neue Fassung
     der Bibliothek die Form ändert. Welcher Weg griff, steht im Bericht —
     ein stiller Wechsel ist damit ausgeschlossen. */
  if (!claims) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) throw new AufrufFehler(CODES.UNAUTHENTICATED, "token-nicht-verifizierbar");
    claims = { sub: data.user.id, role: data.user.role ?? "authenticated" };
    weg = "getUser";
  }

  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const rolle = typeof claims.role === "string" ? claims.role : "";

  /* Der eigentliche Schutz. Im Spike belegt wirksam: der öffentliche
     Projektschlüssel kommt an der Plattformprüfung vorbei und wird erst hier
     gestoppt. */
  if (rolle !== "authenticated") throw new AufrufFehler(CODES.UNAUTHENTICATED, "rolle-nicht-authenticated");
  if (!/^[0-9a-f-]{36}$/i.test(sub)) throw new AufrufFehler(CODES.UNAUTHENTICATED, "subject-keine-konto-id");

  return { accountId: sub, rolle, claimsSchluessel: Object.keys(claims), weg };
}

/* ---------- Konfiguration ----------------------------------------------------- */
type Konfig = Record<string, unknown>;

async function ladeKonfig(admin: ReturnType<typeof adminClient>): Promise<Konfig> {
  if (!admin) throw new AufrufFehler(CODES.SERVER, "kein-admin-zugang");
  const { data, error } = await admin.from("kd_ai_limits").select("schluessel,wert");
  if (error) throw new AufrufFehler(CODES.SERVER, "konfiguration-nicht-lesbar");
  const k: Konfig = {};
  for (const zeile of data ?? []) k[(zeile as { schluessel: string }).schluessel] = (zeile as { wert: unknown }).wert;
  return k;
}

function zahl(k: Konfig, name: string, ersatz: number): number {
  const w = k[name];
  return typeof w === "number" && Number.isFinite(w) ? w : ersatz;
}

/* ---------- Anbieter ------------------------------------------------------------ */
type AnbieterErgebnis = {
  text: string;
  modell: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
};

async function rufeAnbieter(
  modell: string,
  system: string,
  nutzertext: string,
  maxTokens: number,
  timeoutMs: number,
  schema: Record<string, unknown> | null,
): Promise<AnbieterErgebnis> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new AufrufFehler(CODES.SERVER, "anbieterschluessel-fehlt");

  const koerper: Record<string, unknown> = {
    model: modell,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: nutzertext }],
  };
  /* Striktes Antwortschema (GA, kein Beta-Header nötig). Feldform aus der
     Anbieterdoku vom 26.07.2026; der erste echte Aufruf belegt sie. */
  if (schema) koerper.output_config = { format: { type: "json_schema", schema } };

  const uhr = new AbortController();
  const stopp = setTimeout(() => uhr.abort(), timeoutMs);
  let antwort: Response;
  try {
    antwort = await fetch(ANBIETER_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": ANBIETER_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(koerper),
      signal: uhr.signal,
    });
  } catch (e) {
    throw new AufrufFehler(
      CODES.SERVER,
      (e as Error)?.name === "AbortError" ? "anbieter-zeitgrenze" : "anbieter-nicht-erreichbar",
    );
  } finally {
    clearTimeout(stopp);
  }

  const daten = await antwort.json().catch(() => null);

  if (!antwort.ok) {
    const typ = (daten as { error?: { type?: string } } | null)?.error?.type ?? "unbekannt";
    /* Ein Engpass beim Anbieter ist NICHT das Kontingent des Kontos. Würde man
       429/529 als LIMIT durchreichen, hielte der Nutzer sein Tageskontingent
       für aufgebraucht. */
    if (antwort.status === 429 || antwort.status === 529) {
      throw new AufrufFehler(CODES.SERVER, "anbieter-ueberlastet:" + typ);
    }
    if (antwort.status === 401 || antwort.status === 403) {
      throw new AufrufFehler(CODES.SERVER, "anbieterschluessel-abgelehnt");
    }
    if (antwort.status === 402) throw new AufrufFehler(CODES.SERVER, "anbieter-guthaben");
    throw new AufrufFehler(CODES.SERVER, "anbieterfehler:" + antwort.status + ":" + typ);
  }

  const stopReason = (daten as { stop_reason?: string } | null)?.stop_reason ?? "";
  const inhalt = (daten as { content?: Array<{ type?: string; text?: string }> } | null)?.content ?? [];
  const text = inhalt.filter((t) => t?.type === "text").map((t) => t.text ?? "").join("");
  const usage = (daten as { usage?: { input_tokens?: number; output_tokens?: number } } | null)?.usage ?? {};
  const modellAusAntwort = (daten as { model?: string } | null)?.model ?? modell;

  /* Eine Verweigerung kommt als reguläre Antwort mit Status 200 — sie ist kein
     Serverfehler und darf nicht als solcher erscheinen. Der Verbrauch wird
     VORHER ausgelesen: diese Tokens sind abgerechnet, auch wenn nichts
     Brauchbares herauskam. */
  if (stopReason === "refusal") {
    throw new AufrufFehler(CODES.AI_REFUSED, "modell-hat-abgelehnt", {
      modell: modellAusAntwort,
      inputTokens: Number(usage.input_tokens ?? 0),
      outputTokens: Number(usage.output_tokens ?? 0),
    });
  }

  return {
    text,
    modell: modellAusAntwort,
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    stopReason,
  };
}

/* Preis eines Modells. Der Anbieter antwortet mit der AUFGELÖSTEN, datierten
   Modell-ID (`claude-haiku-4-5-20251001`), konfiguriert ist aber der Alias
   (`claude-haiku-4-5`). Ein exakter Nachschlag ging deshalb ins Leere und die
   alte Fassung buchte stillschweigend 0 — das Monatsbudget wäre nie
   hochgezählt und die Grenze nie wirksam geworden. Deshalb: exakt, sonst über
   das Präfix, sonst der teuerste bekannte Preis als konservative Schätzung
   PLUS ein Vermerk in der Fehlerklasse. Lieber zu viel buchen als blind. */
function preisFuer(k: Konfig, modell: string): { in: number; out: number; sicher: boolean } {
  const preise = (k["preise_usd_cent_pro_mtok"] ?? {}) as Record<string, { in?: number; out?: number }>;
  const genau = preise[modell];
  if (genau) return { in: Number(genau.in ?? 0), out: Number(genau.out ?? 0), sicher: true };
  for (const [name, p] of Object.entries(preise)) {
    if (name && modell.startsWith(name)) return { in: Number(p.in ?? 0), out: Number(p.out ?? 0), sicher: true };
  }
  let teuerstesIn = 0;
  let teuerstesOut = 0;
  for (const p of Object.values(preise)) {
    teuerstesIn = Math.max(teuerstesIn, Number(p.in ?? 0));
    teuerstesOut = Math.max(teuerstesOut, Number(p.out ?? 0));
  }
  return { in: teuerstesIn, out: teuerstesOut, sicher: false };
}

function kostenAus(preis: { in: number; out: number }, ein: number, aus: number): number {
  return (ein / 1_000_000) * preis.in + (aus / 1_000_000) * preis.out;
}

/* ---------- Einstieg -------------------------------------------------------------- */
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const beginn = Date.now();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsKopf(origin) });
  if (req.method !== "POST") {
    return fehlerAntwort(CODES.INVALID_RESPONSE, origin, { grund: "nur-post", status: 405 });
  }

  const rohtext = await req.text().catch(() => "");
  let koerper: Record<string, unknown> = {};
  try {
    koerper = rohtext ? JSON.parse(rohtext) : {};
  } catch {
    return fehlerAntwort(CODES.INVALID_RESPONSE, origin, { grund: "kein-json", status: 400 });
  }

  const task = typeof koerper.task === "string" ? koerper.task : "";
  const vorgangId = typeof koerper.vorgangId === "string" ? koerper.vorgangId : null;
  const promptVersion = typeof koerper.promptVersion === "string" ? koerper.promptVersion : null;
  const profilVersion = typeof koerper.profilVersion === "string" ? koerper.profilVersion : null;
  const payload = (koerper.payload && typeof koerper.payload === "object" && !Array.isArray(koerper.payload))
    ? koerper.payload as Record<string, unknown>
    : {};

  /* 1) Größe zuerst. Sie ist die einzige Prüfung ohne Netzrunde — ein
        aufgeblähter Auftrag soll nicht erst zwei Abfragen auslösen.
        (Die Grenze aus der Konfiguration wird unten noch einmal exakt geprüft;
        hier steht eine großzügige Notbremse, die ohne Konfiguration auskommt.) */
  if (new TextEncoder().encode(rohtext).length > 1_000_000) {
    return fehlerAntwort(CODES.INVALID_RESPONSE, origin, { grund: "auftrag-zu-gross", status: 413, vorgangId });
  }

  /* 2) Aufrufer. Eine im Körper mitgeschickte Account-ID wird nie gelesen. */
  let aufrufer: Aufrufer;
  try {
    aufrufer = await pruefeAufrufer(req);
  } catch (e) {
    const f = e as AufrufFehler;
    return fehlerAntwort(f.code ?? CODES.UNAUTHENTICATED, origin, { grund: f.grund, vorgangId });
  }

  /* N1: Ein nicht UUID-förmiges Feld ließ den uuid-Parameter in Postgres
     scheitern — der Nutzer las dann „Der Server ist vorübergehend nicht
     verfügbar", obwohl seine Eingabe schuld war. */
  if (vorgangId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vorgangId)) {
    return fehlerAntwort(CODES.INVALID_RESPONSE, origin, { grund: "vorgangid-keine-uuid", status: 400, vorgangId: null });
  }

  const admin = adminClient();
  if (!admin) return fehlerAntwort(CODES.SERVER, origin, { grund: "kein-admin-zugang", vorgangId });

  let konfig: Konfig;
  try {
    konfig = await ladeKonfig(admin);
  } catch (e) {
    const f = e as AufrufFehler;
    return fehlerAntwort(CODES.SERVER, origin, { grund: f.grund ?? "konfiguration", vorgangId });
  }

  /* 3) Größe nach Konfiguration — die eigentliche, enge Grenze. */
  const maxBytes = zahl(konfig, "request_max_bytes", 32768);
  if (new TextEncoder().encode(rohtext).length > maxBytes) {
    return fehlerAntwort(CODES.INVALID_RESPONSE, origin, { grund: "auftrag-zu-gross", status: 413, vorgangId });
  }

  /* ---- health: kostet nichts, legt keine Zeile an, zählt auf kein Limit ---- */
  if (task === "health") {
    const { herkunft: pubHerkunft } = oeffentlich();
    const { herkunft: secHerkunft } = geheim();
    let stand: unknown = null;
    const { data } = await admin.rpc("kd_ai_stand", { p_account: aufrufer.accountId });
    stand = data ?? null;
    return jsonAntwort({
      ok: true,
      task: "health",
      vorgangId,
      phase: "etappe-5",
      laufzeit: {
        deno: (Deno as unknown as { version?: { deno?: string } }).version?.deno ?? null,
        region: Deno.env.get("SB_REGION") ?? null,
      },
      schluesselHerkunft: { oeffentlich: pubHerkunft, geheim: secHerkunft },
      anbieterSecretGesetzt: !!Deno.env.get("ANTHROPIC_API_KEY"),
      aufrufer: { rolle: aufrufer.rolle, weg: aufrufer.weg, accountIdVorhanden: !!aufrufer.accountId },
      betrieb: {
        aiAktiv: konfig["ai_aktiv"] === true,
        monatsbudgetUsdCent: zahl(konfig, "monatsbudget_usd_cent", 0),
        tageslimit: zahl(konfig, "tageslimit_auftraege", 0),
        parallelMax: zahl(konfig, "parallel_max", 0),
        modellAlias: konfig["modell_alias"] ?? null,
        stand,
      },
      zeit: new Date().toISOString(),
    }, 200, origin);
  }

  /* ---- anbieter-modelle: Diagnose. Belegt die gültigen Modell-IDs am echten
          Anbieter, statt sie aus der Doku zu glauben. Verbraucht keine Tokens. */
  if (task === "anbieter-modelle") {
    /* W1: auch eine tokenfreie Diagnose ruft den Anbieter mit dem echten
       Schlüssel und verbraucht dessen Ratenkontingent. Der Not-Aus muss sie
       deshalb genauso stoppen — sonst schaltet er eben nicht alles ab. */
    if (konfig["ai_aktiv"] !== true) {
      return fehlerAntwort(CODES.AI_DISABLED, origin, { grund: "not-aus-gesetzt", vorgangId });
    }
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return fehlerAntwort(CODES.SERVER, origin, { grund: "anbieterschluessel-fehlt", vorgangId });
    const antwort = await fetch(ANBIETER_MODELLE_URL, {
      headers: { "x-api-key": key, "anthropic-version": ANBIETER_VERSION },
    }).catch(() => null);
    if (!antwort) return fehlerAntwort(CODES.SERVER, origin, { grund: "anbieter-nicht-erreichbar", vorgangId });
    const daten = await antwort.json().catch(() => null);
    if (!antwort.ok) {
      return fehlerAntwort(CODES.SERVER, origin, {
        grund: "anbieterfehler:" + antwort.status,
        vorgangId,
        /* Nur der Fehlertyp (ein Enum), nie die Meldung des Anbieters. */
        diagnose: (daten as { error?: { type?: string } } | null)?.error?.type ?? null,
      });
    }
    const liste = ((daten as { data?: Array<{ id?: string; display_name?: string }> } | null)?.data ?? [])
      .map((m) => ({ id: m.id ?? null, name: m.display_name ?? null }));
    return jsonAntwort({ ok: true, task, vorgangId, modelle: liste }, 200, origin);
  }

  /* ---- Fachaufgaben: registriert, noch nicht gebaut ---- */
  if (FACHAUFGABEN.has(task)) {
    return fehlerAntwort(CODES.NOT_IMPLEMENTED, origin, { grund: "kommt-in-etappe-6", vorgangId });
  }

  if (task !== "echo-struct") {
    return fehlerAntwort(CODES.NOT_IMPLEMENTED, origin, { grund: task ? "unbekannte-aufgabe" : "kein-task", vorgangId });
  }

  /* ---- echo-struct: der Kettenbeweis. Kleinster möglicher echter Aufruf mit
          striktem Antwortschema — ohne jede persönliche Angabe. ---- */
  const wort = typeof payload.wort === "string" ? payload.wort.slice(0, 40) : "Kinodreieck";
  const strikt = payload.strikt !== false;

  const aliasse = (konfig["modell_alias"] ?? {}) as Record<string, string>;
  const taskModell = (konfig["task_modell"] ?? {}) as Record<string, string>;
  const alias = taskModell[task] ?? "klein";
  const modell = aliasse[alias];
  if (!modell) return fehlerAntwort(CODES.SERVER, origin, { grund: "kein-modell-fuer-alias:" + alias, vorgangId });

  const maxTokensJeTask = (konfig["task_max_tokens"] ?? {}) as Record<string, number>;
  const maxTokens = Number(maxTokensJeTask[task] ?? 256);
  const timeoutMs = zahl(konfig, "timeout_ms", 30000);

  /* 4) Not-Aus, Budget, Tageslimit, Parallelität — geprüft UND protokolliert in
        einer Transaktion. Zwei gleichzeitige Aufrufe können die Grenze damit
        nicht gemeinsam überschreiten.

        Mitgegeben wird eine KOSTENSCHÄTZUNG. Ohne sie prüfte das Monatsbudget
        nur abgeschlossene Läufe; alles gerade Unterwegs war unsichtbar, und
        genügend gleichzeitige Aufrufe konnten den Deckel um ein Vielfaches
        überschreiten. Die Schätzung wird beim Abschluss durch den Istwert
        ersetzt — und bleibt stehen, wenn der Lauf abstürzt. */
  const preis = preisFuer(konfig, modell);
  const geschaetzteEingabe = Math.ceil(rohtext.length / 3) + 300;
  const reservierung = kostenAus(preis, geschaetzteEingabe, maxTokens);

  const { data: startRoh, error: startFehler } = await admin.rpc("kd_ai_auftrag_starten", {
    p_account: aufrufer.accountId,
    p_task: task,
    p_vorgang: vorgangId ?? crypto.randomUUID(),
    p_modell_alias: alias,
    p_prompt_version: promptVersion,
    p_profil_version: profilVersion,
    p_reservierung: reservierung,
  });
  if (startFehler) {
    /* Den Postgres-Fehlercode mitgeben: „auftrag-start-fehlgeschlagen" allein
       war beim ersten Auftreten nicht diagnostizierbar — die Ursache war eine
       nicht eingespielte Migration (Signatur ohne Reservierung). Der Code ist
       Schema-Information, keine Nutzerdaten. */
    return fehlerAntwort(CODES.SERVER, origin, {
      grund: "auftrag-start-fehlgeschlagen:" + ((startFehler as { code?: string }).code ?? "?"),
      vorgangId,
    });
  }
  const start = startRoh as { ok?: boolean; code?: string; grund?: string; log_id?: number } | null;
  if (!start?.ok) {
    return fehlerAntwort(start?.code ?? CODES.LIMIT, origin, { grund: start?.grund ?? "abgelehnt", vorgangId });
  }
  const logId = Number(start.log_id);

  async function beende(status: "fertig" | "fehler", felder: Record<string, unknown>) {
    /* try/catch statt .catch(): der Abfragebauer von supabase-js ist zwar
       awaitbar, hat aber keine Promise-Methode `catch`. Der Aufruf davon warf
       eine TypeError — ausgerechnet im Fehlerpfad, sodass jeder Anbieterfehler
       als nackter „Internal Server Error" statt als saubere Fehlerklasse
       ankam. Im Spike belegt (P9, 26.07.). */
    try {
      await admin!.rpc("kd_ai_auftrag_beenden", {
        p_id: logId,
        p_status: status,
        p_modell: felder.modell ?? null,
        p_input_tokens: felder.inputTokens ?? null,
        p_output_tokens: felder.outputTokens ?? null,
        p_kosten: felder.kosten ?? null,
        p_fehlerklasse: felder.fehlerklasse ?? null,
      });
    } catch {
      /* Protokollieren darf den Aufruf nie zum Absturz bringen. */
    }
  }

  const SCHEMA = {
    type: "object",
    properties: {
      echo: { type: "string" },
      zeichen: { type: "integer" },
    },
    required: ["echo", "zeichen"],
    additionalProperties: false,
  };

  let ergebnis: AnbieterErgebnis;
  try {
    ergebnis = await rufeAnbieter(
      modell,
      "Du bist ein Testendpunkt. Antworte ausschliesslich mit JSON nach dem vorgegebenen Schema, ohne weiteren Text.",
      `Gib das Wort "${wort}" unveraendert als Feld "echo" zurueck und seine Zeichenzahl als "zeichen".`,
      maxTokens,
      timeoutMs,
      strikt ? SCHEMA : null,
    );
  } catch (e) {
    const f = e as AufrufFehler;
    const klasse = f.code ?? CODES.SERVER;
    /* Auch ein Fehlschlag kann abgerechnet sein. Liegt ein Verbrauch vor, wird
       er gebucht; sonst bleibt die Reservierung stehen — nie 0. */
    const v = f.verbrauch;
    const istPreis = v?.modell ? preisFuer(konfig, v.modell) : preis;
    await beende("fehler", {
      fehlerklasse: klasse + ":" + (f.grund ?? ""),
      modell: v?.modell ?? null,
      inputTokens: v?.inputTokens ?? null,
      outputTokens: v?.outputTokens ?? null,
      kosten: v ? kostenAus(istPreis, v.inputTokens ?? 0, v.outputTokens ?? 0) : null,
    });
    return fehlerAntwort(klasse, origin, { grund: f.grund, vorgangId });
  }

  const istPreis = preisFuer(konfig, ergebnis.modell);
  const kosten = kostenAus(istPreis, ergebnis.inputTokens, ergebnis.outputTokens);
  /* B1: Ein unbekannter Modellpreis darf nicht still zu 0 werden. Er wird
     konservativ geschätzt UND in der Fehlerklasse vermerkt, damit es auffällt. */
  const preisVermerk = istPreis.sicher ? null : "kosten-geschaetzt:" + ergebnis.modell;

  /* 4) Fachliche Prüfung NACH der strukturellen. Ein technisch gültiges JSON
        ist noch kein brauchbares Ergebnis. */
  const antwortBytes = new TextEncoder().encode(ergebnis.text).length;
  if (antwortBytes > zahl(konfig, "antwort_max_bytes", 262144)) {
    await beende("fehler", { modell: ergebnis.modell, inputTokens: ergebnis.inputTokens, outputTokens: ergebnis.outputTokens, kosten, fehlerklasse: CODES.INVALID_RESPONSE + ":zu-gross" });
    return fehlerAntwort(CODES.INVALID_RESPONSE, origin, { grund: "antwort-zu-gross", vorgangId });
  }

  let inhalt: unknown = null;
  try {
    inhalt = JSON.parse(ergebnis.text);
  } catch {
    await beende("fehler", { modell: ergebnis.modell, inputTokens: ergebnis.inputTokens, outputTokens: ergebnis.outputTokens, kosten, fehlerklasse: CODES.INVALID_RESPONSE + ":kein-json" });
    return fehlerAntwort(CODES.INVALID_RESPONSE, origin, { grund: "antwort-kein-json", vorgangId });
  }
  const geprueft = inhalt as { echo?: unknown; zeichen?: unknown };
  if (typeof geprueft?.echo !== "string" || typeof geprueft?.zeichen !== "number") {
    await beende("fehler", { modell: ergebnis.modell, inputTokens: ergebnis.inputTokens, outputTokens: ergebnis.outputTokens, kosten, fehlerklasse: CODES.INVALID_RESPONSE + ":schema" });
    return fehlerAntwort(CODES.INVALID_RESPONSE, origin, { grund: "antwort-verletzt-schema", vorgangId });
  }

  await beende("fertig", {
    modell: ergebnis.modell,
    inputTokens: ergebnis.inputTokens,
    outputTokens: ergebnis.outputTokens,
    kosten,
    fehlerklasse: preisVermerk,
  });

  return jsonAntwort({
    ok: true,
    task,
    vorgangId,
    modellAlias: alias,
    data: geprueft,
    verbrauch: {
      inputTokens: ergebnis.inputTokens,
      outputTokens: ergebnis.outputTokens,
      kostenUsdCent: Number(kosten.toFixed(6)),
      dauerMs: Date.now() - beginn,
      stopReason: ergebnis.stopReason,
    },
  }, 200, origin);
});

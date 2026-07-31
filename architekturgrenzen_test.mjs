import fs from "node:fs";
import path from "node:path";

const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.has(key) ? local.get(key) : null,
  setItem: (key, value) => void local.set(key, String(value)),
  removeItem: (key) => void local.delete(key),
  clear: () => local.clear(),
};

const {
  APP_ENVIRONMENTS, createRuntimeConfig, validateRuntimeConfig, RUNTIME_SCHEMA_VERSION,
} = await import("./src/config/runtime.js");
const {
  BoundaryError, ERROR_CODES, errorFromStatus, errorText, normalizeBoundaryError,
} = await import("./src/services/errors.js");
const {
  SESSION_MODES, accountSession, createAuthService, guestSession,
} = await import("./src/services/auth.js");
const { createAiService } = await import("./src/services/ai.js");
const { publicSupabaseHeaders, istSupabaseProjektUrl } = await import("./src/lib/supabasePublic.js");
const { storageService } = await import("./src/services/storage.js");
const { catalogService } = await import("./src/services/catalog.js");

let ok = 0;
const check = (name, value) => {
  if (!value) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
};

const config = createRuntimeConfig({
  VITE_APP_ENV: "staging",
  VITE_APP_URL: " https://kino.example/app/ ",
  VITE_SUPABASE_URL: "https://projekt.supabase.co/",
  VITE_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_test ",
  VITE_AI_ENDPOINT_NAME: "ai-v1",
  VITE_BUILD_VERSION: "abc123",
});
check("Runtime-Konfiguration enthält den vollständigen öffentlichen Vertrag",
  config.appEnvironment === APP_ENVIRONMENTS.STAGING
  && config.appUrl === "https://kino.example/app"
  && config.supabaseUrl === "https://projekt.supabase.co"
  && config.supabasePublishableKey === "sb_publishable_test"
  && config.aiEndpointName === "ai-v1"
  && config.buildVersion === "abc123"
  && config.schemaVersion === RUNTIME_SCHEMA_VERSION);
check("Runtime-Konfiguration ist unveränderlich", Object.isFrozen(config));
check("Runtime-Konfiguration enthält keine geheimen Vertragsfelder",
  !Object.keys(config).some((key) => /secret|service.?role|provider.?key|sync.?key|token/i.test(key)));
check("Leere Runtime-Werte bleiben sicher und lokal funktionsfähig",
  createRuntimeConfig({}).appEnvironment === APP_ENVIRONMENTS.LOCAL
  && createRuntimeConfig({}).supabaseUrl === ""
  && createRuntimeConfig({}).buildVersion === "dev"
  && validateRuntimeConfig(createRuntimeConfig({})).ok);
check("Staging und Produktion verlangen vollständige öffentliche Konfiguration",
  !validateRuntimeConfig(createRuntimeConfig({ VITE_APP_ENV: "staging" })).ok
  && !validateRuntimeConfig(createRuntimeConfig({ VITE_APP_ENV: "production" })).ok);
check("Ungültige Runtime-Werte werden strukturiert gemeldet",
  !validateRuntimeConfig(createRuntimeConfig({
    VITE_APP_URL: "http://unsicher.example",
    VITE_SUPABASE_URL: "https://evil.example",
    VITE_AI_ENDPOINT_NAME: "../secret",
  })).ok);

check("Supabase-Projekt-URL wird streng validiert",
  istSupabaseProjektUrl("https://abc-123.supabase.co") && !istSupabaseProjektUrl("https://evil.example"));
check("Publishable-Key wird nie als Bearer gesendet",
  publicSupabaseHeaders("sb_publishable_test").apikey === "sb_publishable_test"
  && !publicSupabaseHeaders("sb_publishable_test").Authorization);
const jwt = "eyJ" + "x".repeat(40);
check("Legacy-JWT erhält weiterhin den nötigen Bearer-Header",
  publicSupabaseHeaders(jwt).Authorization === "Bearer " + jwt);

check("HTTP-Fehler werden auf die sechs stabilen Codes abgebildet",
  errorFromStatus(401).code === ERROR_CODES.UNAUTHENTICATED
  && errorFromStatus(403).code === ERROR_CODES.FORBIDDEN
  && errorFromStatus(429).code === ERROR_CODES.LIMIT
  && errorFromStatus(503).code === ERROR_CODES.SERVER
  && errorFromStatus(400).code === ERROR_CODES.INVALID_RESPONSE);
check("Netzwerkfehler werden als offline und retryable normalisiert", (() => {
  const error = normalizeBoundaryError(new TypeError("Failed to fetch"), { source: "catalog" });
  return error.code === ERROR_CODES.OFFLINE && error.retryable;
})());
check("Ungültige Payload wird als invalid-response normalisiert",
  normalizeBoundaryError(new Error("ungültige Payload")).code === ERROR_CODES.INVALID_RESPONSE);
check("UI-Fehlertext verrät keinen rohen Servertext", (() => {
  const error = new BoundaryError(ERROR_CODES.SERVER, { message: "interne Tabelle kd_secret" });
  return !errorText(error).includes("kd_secret");
})());

catalogService.setConnection({
  url: "https://architekturtest.supabase.co",
  key: "sb_publishable_architekturtest",
});
globalThis.fetch = async () => ({
  ok: false,
  status: 500,
  json: async () => ({ message: "INTERNAL_TABLE_DETAIL" }),
});
let catalogError = null;
try { await catalogService.testConnection(); } catch (error) { catalogError = error; }
check("Katalog-Service normalisiert Result-Envelopes zu BoundaryError",
  catalogError?.code === ERROR_CODES.SERVER);
check("Katalog-Verbindungsfehler leakt keine Backenddetails in UI-Texte",
  !errorText(catalogError).includes("INTERNAL_TABLE_DETAIL")
  && !catalogError.message.includes("INTERNAL_TABLE_DETAIL"));

/* Der Check oben deckt nur den GEWORFENEN Fehler ab. testConnection() kann aber
   auch erfolgreich zurückkehren und den Backendtext im Ergebnis mitführen:
   manifest ist anon lesbar, nur die geprüfte Zeile scheitert. Genau dieses
   `asset`-Objekt rendert die Oberfläche (KatalogZugang/Katalog-Status). */
const fetchVorher = globalThis.fetch;
globalThis.fetch = async (url) => {
  const name = new URL(String(url)).searchParams.get("name")?.replace(/^eq\./, "");
  if (name === "manifest") {
    return {
      ok: true,
      status: 200,
      json: async () => [{ payload: { stand: "2026-07-22T12:00:00Z" }, updated_at: "2026-07-22T12:00:00Z", stand: "2026-07-22T12:00:00Z", gueltig_bis: null, quelle: "manifest" }],
    };
  }
  return { ok: false, status: 500, json: async () => ({ message: "INTERNAL_TABLE_DETAIL" }) };
};
/* Alles einsammeln, was eine Oberfläche aus dem Ergebnis anzeigen könnte.
   `cause`/`stack` sind bewusst ausgenommen: die Diagnosekette darf den rohen
   Text behalten, nur nichts Anzeigbares. */
function anzeigbareTexte(wert, tiefe = 0, gesehen = new Set()) {
  if (wert == null || tiefe > 5) return [];
  if (typeof wert === "string") return [wert];
  if (typeof wert !== "object" || gesehen.has(wert)) return [];
  gesehen.add(wert);
  const raus = wert instanceof Error ? [String(wert.message || "")] : [];
  for (const [k, v] of Object.entries(wert)) {
    if (k === "cause" || k === "stack") continue;
    raus.push(...anzeigbareTexte(v, tiefe + 1, gesehen));
  }
  return raus;
}
const assetPruefung = await catalogService.testConnection({ bereich: "programm", variante: "demo" });
const assetTexte = anzeigbareTexte(assetPruefung.asset);
check("Katalog-Assetprüfung meldet den Fehlzustand überhaupt (sonst prüfte der Leak-Check nichts)",
  assetPruefung.ok === true && assetPruefung.asset?.ok === false
  && assetPruefung.asset.code === ERROR_CODES.SERVER && assetTexte.length > 0);
/* Das frühere dritte Glied (`asset.message === undefined`) war leer: ein Feld
   `message` setzt testeKatalogZugang() auf `asset` nirgends, die Bedingung
   konnte also gar nicht fehlschlagen. An seine Stelle tritt der Mechanismus,
   auf dem der Leak-Schutz wirklich beruht: die Grenzschicht ERSETZT den rohen
   Bibliotheksfehler durch ihren normalisierten — nur deshalb bleibt der
   Servertext draußen. */
check("testConnection().asset reicht keinen rohen Servertext an die Oberfläche",
  !assetTexte.some((t) => t.includes("INTERNAL_TABLE_DETAIL"))
  && !errorText(assetPruefung.asset.fehler).includes("INTERNAL_TABLE_DETAIL")
  && assetPruefung.asset.fehler instanceof BoundaryError
  && assetPruefung.asset.fehler.code === ERROR_CODES.SERVER);
globalThis.fetch = fetchVorher;

const guest = guestSession();
check("Gast ist ein gültiger betriebsbereiter Sessionzustand",
  guest.mode === SESSION_MODES.GUEST && guest.state === "ready" && guest.account === null);
check("Gast-Snapshot enthält keine Tokens",
  !Object.keys(guest).some((key) => /token/i.test(key)));
let invalidAccountRejected = false;
try { accountSession({}); } catch (error) {
  invalidAccountRejected = error.code === ERROR_CODES.INVALID_RESPONSE;
}
check("Accountmodus verlangt eine verifizierte Account-ID", invalidAccountRejected);

let subscriptionCalls = 0;
const auth = createAuthService({
  loadSession: async () => ({
    mode: "account",
    account: { id: "konto-1", displayName: "Max" },
    capabilities: { remoteStorage: true, personalAi: true },
  }),
});
const unsubscribe = auth.subscribe(() => { subscriptionCalls++; });
await auth.initialize();
unsubscribe();
check("Accountstatus bewahrt serverseitige Identität und Capabilities",
  auth.getSnapshot().account.id === "konto-1"
  && auth.getSnapshot().capabilities.remoteStorage
  && auth.getSnapshot().capabilities.personalAi
  && subscriptionCalls === 1);

let guestBlocked = false;
try {
  await createAiService({
    auth: createAuthService(),
    config,
    transport: async () => ({ ok: true }),
  }).runTask("intelligent-search", { query: "Alien" });
} catch (error) {
  guestBlocked = error.code === ERROR_CODES.UNAUTHENTICATED;
}
check("Gastzugriff auf persönliche KI endet kontrolliert unauthenticated", guestBlocked);

let transportRequest = null;
const ai = createAiService({
  auth,
  config,
  transport: async (request) => {
    transportRequest = request;
    return { ok: true, data: { title: "Alien" } };
  },
});
const aiResult = await ai.runTask("intelligent-search", { query: "Alien" });
check("KI-Transport ist mockbar und kennt nur internen Endpoint plus Account-ID",
  aiResult.ok && transportRequest.endpointName === "ai-v1"
  && transportRequest.accountId === "konto-1"
  && !Object.keys(transportRequest).some((key) => /provider|secret|api.?key/i.test(key)));
let limitMapped = false;
try {
  await createAiService({
    auth, config, transport: async () => ({ ok: false, status: 429 }),
  }).runTask("masterlist-enrichment", { id: "alien" });
} catch (error) { limitMapped = error.code === ERROR_CODES.LIMIT; }
check("KI-Limit wird einheitlich als limit gemeldet", limitMapped);

await storageService.set("kd:architekturtest", "lokal");
check("Persönliche lokale Ablage bleibt im Gastmodus unverändert nutzbar",
  (await storageService.get("kd:architekturtest"))?.value === "lokal"
  && storageService.mode === "guest-local");
await storageService.delete("kd:architekturtest");
const storageSource = fs.readFileSync("src/services/storage.js", "utf8");
const sharedSource = fs.readFileSync("src/services/sharedArticles.js", "utf8");
check("Persönlicher Storage kennt den Legacy-Shared-Treiber nicht mehr",
  !/supabaseDriver|publishSharedArticle|unpublishSharedArticle/.test(storageSource));
check("Shared Blogs besitzen eine eigene kleine Service-Grenze",
  /createSharedArticlesService/.test(sharedSource)
  && /kd_shared_articles/.test(sharedSource)
  && !/kd_store|x-kd-key/.test(sharedSource));

const uiRoots = ["src/App.jsx", "src/components", "src/tabs"];
const jsFiles = [];
/* Rekursiv: eine Oberflächendatei in einem Unterordner würde sonst an ALLEN
   Grenzprüfungen vorbeilaufen — auch am Verbot direkter Netzwerkaufrufe. */
function sammle(root) {
  const stat = fs.statSync(root);
  if (stat.isFile()) { if (/\.[cm]?[jt]sx?$/.test(root)) jsFiles.push(root); return; }
  for (const name of fs.readdirSync(root)) sammle(path.join(root, name));
}
for (const root of uiRoots) sammle(root);
check("Oberflächen-Prüfung erfasst auch Dateien in Unterordnern",
  jsFiles.length >= fs.readdirSync("src/components").filter((n) => /\.jsx?$/.test(n)).length);
const uiSource = jsFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
check("UI importiert keine Netzwerk- oder Storage-Treiber direkt",
  !/from\s+["'][^"']*lib\/(?:gitDriver|supabaseDriver|accountDriver|authDriver|katalog|storage|aiDriver)\.js["']/.test(uiSource));
check("UI greift nicht selbst auf die Sitzungsablage zu",
  !/kd:auth:/.test(uiSource));
check("Aktive UI kennt keine treiberspezifischen Service-Namen",
  !/\b(?:git|supabase)SyncService\b/.test(uiSource));
check("UI führt keine direkten Netzwerkaufrufe aus",
  !/\bfetch\s*\(/.test(uiSource.replace(/fetch\(\) würde blockiert/g, "")));
check("App macht Gast- und Accountmodus technisch unterscheidbar",
  /data-session-mode=\{session\.mode\}/.test(fs.readFileSync("src/App.jsx", "utf8")));
const sessionEintritte = uiSource + "\n" + fs.readFileSync("src/main.jsx", "utf8");
check("Alle verändernden Sitzungswege laufen über den SessionCoordinator",
  !/authService\.(?:initialize|signIn|signOut|refresh|changePassword)\s*\(/.test(sessionEintritte)
  && /sessionCoordinator\.(?:initialize|signIn|signOut|refresh)/.test(sessionEintritte));
check("Katalogzugang spiegelt keine Credentials in persönlichen Sync",
  !/setSupabaseConfig/.test(fs.readFileSync("src/components/KatalogZugang.jsx", "utf8")));

/* P5 — der Boot darf für die Frage „passt der gespeicherte Programm-Topf zur
   Betriebsart?" NICHT auf activeVariant() zurückfallen. Das ginge über
   getAccessToken() und stieße bei fast abgelaufener Sitzung eine Erneuerung mit
   Netz-Zeitgrenze an; die App stünde dann bei hängender Verbindung vor der
   Startseite. Der tokenfreie, synchrone Weg ist storedVariant() — das Verhalten
   selbst ist in katalog_test.mjs (P5) gepinnt, hier die Aufrufstelle. */
const appQuelle = fs.readFileSync("src/App.jsx", "utf8");
check("Boot urteilt über die Betriebsart tokenfrei (storedVariant), nicht über activeVariant",
  /catalogService\.storedVariant\(\)/.test(appQuelle)
  && !/await\s+catalogService\.activeVariant\(\)/.test(appQuelle));
/* B6 — bewusst ein QUELLCODE-Pin, kein Verhaltensnachweis.
   `autoFetched` heißt „es wurde etwas geladen", nicht „es wurde einmal
   versucht". Bleibt es nach einem erfolglosen Betriebsart-Nachladen gesetzt, ist
   der Autoload für den Rest der Sitzung stillgelegt.
   Warum das hier steht und nicht als Browsertest: der Autoload-Effekt hängt an
   [bootDone, programm, snapshotFreigabe]. Nach einem gescheiterten Wechsel
   ändert sich keine dieser Abhängigkeiten je wieder — `programm` bleibt null,
   `snapshotFreigabe` kippt ausschließlich false→true, und jeder weitere Wechsel
   setzt `autoFetched` ohnehin selbst. Beobachtbar bliebe allein das Wettrennen
   zwischen der Freigabe und Reacts Re-Render (personalmodus R2). Darauf einen
   Check zu gründen hieße, eine Scheduling-Reihenfolge festzunageln — deshalb
   wird hier die Zeile selbst gepinnt, mit ehrlichem Namen. */
check("Quellcode-Pin: der Wechsel-Effekt gibt autoFetched nach erfolglosem Nachladen wieder frei",
  /if \(!programmOk\) autoFetched\.current = false;/.test(appQuelle));

/* N1–N3 — Quellcode-Pin für den STREAMING-Zwilling.
   Verhaltensseitig sind `anmeldungNoetig` und `code` von `streamingInfo` im
   Ergänzen-Zweig nicht beobachtbar: beide werden ausschließlich gerendert, wenn
   GAR KEINE Katalogdaten dastehen (StreamingTab: `!datenDa`; StartTab: nur wenn
   `katalog == null`). Der Ergänzen-Zweig setzt aber voraus, dass Daten weiter
   angezeigt werden — genau dann zeigt keine Oberfläche diese beiden Felder.
   Nachgewiesen: der Rückbau beider Felder im Streaming-Zwilling ließ die volle
   Suite mit 129/129 grün. `abgelaufen` ist dagegen sichtbar und deshalb in
   personalmodus Y/N3 verhaltensseitig gepinnt — beide Zwillinge einzeln.
   Was hier bleibt, ist die tragende Aussage: beide Zwillinge formulieren den
   Ergänzen-Zweig IDENTISCH. Fällt einer von beiden zurück, sinkt die Zahl. */
const ergaenzenZweig = /\?\s*\{\s*\.\.\.vorher,\s*abgelaufen: Number\.isFinite\(vorher\.gueltigBis\) \? vorher\.gueltigBis < Date\.now\(\) : vorher\.abgelaufen,\s*anmeldungNoetig, fehler: text, code,\s*\}/g;
check("Quellcode-Pin: beide Info-Zwillinge formulieren den Ergänzen-Zweig identisch (N1–N3)",
  (appQuelle.match(ergaenzenZweig) || []).length === 2);

/* N4 — Quellcode-Pin, und zwar bewusst.
   Die Zusicherung lautet: ein Wurf aus `ladeStreamingDateien` darf die IIFE des
   Wechsel-Effekts nicht abbrechen, sonst wird `autoFetched` nie freigegeben.
   Eine Verhaltensprobe scheitert an zwei Dingen gleichzeitig:
   · Zum Werfen braucht es den `file:`-Zweig im catch von ladeStreamingDateien
     (`ladeEntdeckenBeilage()`). Der verlangt ein file://-Dokument — in jsdom ein
     opaker Ursprung ohne localStorage, und der Programmpfad schaltet dort
     ebenfalls auf seinen eingebetteten Snapshot um. Gefahren würde also eine
     andere Betriebsart als die, um die es geht.
   · Selbst dann wäre die FOLGE (`autoFetched` wieder frei) dieselbe
     strukturell unbeobachtbare Eigenschaft wie beim Pin darunter: der
     Autoload-Effekt hängt an [bootDone, programm, snapshotFreigabe], von denen
     sich nach einem gescheiterten Wechsel keine mehr ändert.
   Statt einer Notlösung also die Zeile selbst — mit ehrlichem Namen. */
check("Quellcode-Pin: der Wechsel-Effekt fängt einen Wurf des Streaming-Laufs ab (allSettled, N4)",
  /const \[programmErgebnis\] = await Promise\.allSettled\(\[/.test(appQuelle)
  && /programmErgebnis\.status === "fulfilled" && programmErgebnis\.value/.test(appQuelle));

check("storedVariant() bleibt in der Grenzschicht ohne Token- und ohne Netzweg",
  /function gespeicherteVariante\(\)\s*\{[^}]*authDriver\.konto\(\)[^}]*\}/
    .test(fs.readFileSync("src/services/catalog.js", "utf8"))
  && !/function gespeicherteVariante\(\)\s*\{[^}]*(?:await|getAccessToken|fetch)/
    .test(fs.readFileSync("src/services/catalog.js", "utf8")));

/* ---------- Etappe 3: Accountgrenzen ---------- */
const { SESSION_STATES, abgelaufeneSession } = await import("./src/services/auth.js");
const { createAccountDriver, ACCOUNT_SYNC_KEYS } = await import("./src/lib/accountDriver.js");
const { AUTH_SESSION_KEY } = await import("./src/lib/authDriver.js");

/* Ein Token darf nirgends in einem an die Oberfläche gereichten Objekt auftauchen —
   weder als Feldname noch als Wert. Deshalb rekursiv über beides. */
function enthaeltToken(objekt) {
  const jwtMuster = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\./;
  const gesehen = new Set();
  function pruefe(wert) {
    if (wert == null) return false;
    if (typeof wert === "string") return jwtMuster.test(wert);
    if (typeof wert !== "object") return false;
    if (gesehen.has(wert)) return false;
    gesehen.add(wert);
    for (const [k, v] of Object.entries(wert)) {
      if (/access.?token|refresh.?token|\btoken\b|passwor[dt]/i.test(k)) return true;
      if (pruefe(v)) return true;
    }
    return false;
  }
  return pruefe(objekt);
}
const kontoSnapshot = accountSession({
  id: "konto-1", displayName: "max", expiresAt: new Date().toISOString(),
  capabilities: { remoteStorage: true, personalAi: false },
});
check("Account-Snapshot enthält rekursiv weder Tokenfelder noch Tokenwerte",
  !enthaeltToken(kontoSnapshot) && !enthaeltToken(guestSession()));
check("Der Tokenscan würde ein Leck auch wirklich finden",
  enthaeltToken({ account: { tief: { access_token: "x" } } })
  && enthaeltToken({ irgendwas: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig" }));

check("Abgelaufene Anmeldung bleibt ein betriebsbereiter Gast mit Hinweis", (() => {
  const s = abgelaufeneSession();
  return s.mode === SESSION_MODES.GUEST && s.state === "ready"
    && s.error?.code === ERROR_CODES.UNAUTHENTICATED && s.account === null;
})());
check("Eingeschränkte Verbindung bleibt Accountmodus (kein stiller Logout)", (() => {
  const s = accountSession({ id: "k", state: SESSION_STATES.DEGRADED });
  return s.mode === SESSION_MODES.ACCOUNT && s.state === "degraded";
})());

/* Der Account-Treiber ist die einzige Stelle, die Kontodaten schreibt — und er
   darf ohne Sitzung überhaupt nichts tun. */
let netzZugriffe = 0;
const stummerTreiber = createAccountDriver({
  config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_publishable_test" },
  getAccessToken: async () => null,
  fetchImpl: async () => { netzZugriffe++; return { ok: true, status: 200, json: async () => [] }; },
});
await stummerTreiber.set("kd:master", "x");
await new Promise((r) => setTimeout(r, 20));
check("Ohne Sitzung stellt der Account-Treiber keine Netzwerkanfrage", netzZugriffe === 0);
check("Ohne Sitzung bleibt der Wert trotzdem lokal erhalten",
  (await stummerTreiber.get("kd:master"))?.value === "x");

check("Sitzungsablage und Datentöpfe liegen in getrennten Namensräumen",
  AUTH_SESSION_KEY.startsWith("kd:auth:") && !ACCOUNT_SYNC_KEYS.some((k) => k.startsWith("kd:auth")));

/* Der Gastbetrieb ist die Rückfallebene: er muss ohne Konto vollständig laufen. */
check("Gastbetrieb bleibt die Standardbetriebsart", storageService.mode === "guest-local");
await storageService.set("kd:architekturtest2", "gast");
check("Gast schreibt und liest weiterhin ohne jede Anmeldung",
  (await storageService.get("kd:architekturtest2"))?.value === "gast");
await storageService.delete("kd:architekturtest2");

console.log(`\n${ok} Architekturgrenzen-Checks bestanden.`);

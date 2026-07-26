/* Auth-Service + Auth-Treiber (Etappe 3) — GoTrue gemockt, kein Netz.
   Prüft die Zusagen, an denen Vertrauen hängt:
   - Tokens erreichen weder UI-Snapshot noch Datentöpfe.
   - Offline/Serverausfall loggt NIEMANDEN aus (nur ein eindeutig totes
     Refresh-Token tut das).
   - Abmelden räumt die Sitzung, lässt persönliche Daten aber unangetastet. */

const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => void _ls.set(k, String(v)),
  removeItem: (k) => void _ls.delete(k),
  clear: () => _ls.clear(),
  key: (i) => [..._ls.keys()][i] ?? null,
  get length() { return _ls.size; },
};

const A = await import("./src/lib/authDriver.js");
const S = await import("./src/services/auth.js");
const { ERROR_CODES } = await import("./src/services/errors.js");

const checks = [];
const check = (n, p) => checks.push([n, !!p]);

const URL_OK = "https://projekt.supabase.co";
const CONFIG = { supabaseUrl: URL_OK, supabasePublishableKey: "sb_publishable_test" };

/* ---------- GoTrue-Mock ---------- */
let calls = [];
let jetztMs = 1_700_000_000_000;
const jetzt = () => jetztMs;
let refreshZaehler = 0;
let szenario = "ok";

function antwort(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function mockFetch(url, opt = {}) {
  const body = opt.body ? JSON.parse(opt.body) : null;
  calls.push({ url: String(url), method: opt.method || "GET", headers: opt.headers || {}, body });
  const pfad = String(url).replace(URL_OK, "");

  if (pfad.startsWith("/auth/v1/token?grant_type=password")) {
    if (szenario === "netz") return Promise.reject(new TypeError("Failed to fetch"));
    if (body?.password !== "geheim1234") {
      return Promise.resolve(antwort(400, { error: "invalid_grant", error_description: "Invalid login credentials" }));
    }
    return Promise.resolve(antwort(200, {
      access_token: "at-1", refresh_token: "rt-1", expires_in: 3600,
      user: { id: "konto-abc", email: "max@login.kinodreieck.at" },
    }));
  }
  if (pfad.startsWith("/auth/v1/token?grant_type=refresh_token")) {
    refreshZaehler++;
    if (szenario === "netz") return Promise.reject(new TypeError("Failed to fetch"));
    if (szenario === "server") return Promise.resolve(antwort(503, { message: "paused" }));
    if (szenario === "tot") return Promise.resolve(antwort(400, { error: "invalid_grant", error_description: "refresh_token_not_found" }));
    return Promise.resolve(antwort(200, {
      access_token: "at-" + (refreshZaehler + 1), refresh_token: "rt-" + (refreshZaehler + 1), expires_in: 3600,
      user: { id: "konto-abc", email: "max@login.kinodreieck.at" },
    }));
  }
  if (pfad.startsWith("/auth/v1/user")) {
    if (szenario === "pwfehler") return Promise.resolve(antwort(422, { message: "same password" }));
    return Promise.resolve(antwort(200, { id: "konto-abc" }));
  }
  if (pfad.startsWith("/auth/v1/logout")) return Promise.resolve(antwort(204, null));
  if (pfad.startsWith("/auth/v1/signup")) return Promise.resolve(antwort(403, { message: "Signups not allowed for this instance" }));
  return Promise.resolve(antwort(404, {}));
}

function neuerTreiber(extra = {}) {
  calls = []; refreshZaehler = 0;
  return A.createAuthDriver({ config: CONFIG, fetchImpl: mockFetch, jetzt, ...extra });
}

/* ---------- Benutzername → synthetische Adresse ---------- */
check("Benutzername wird normalisiert und zur synthetischen Adresse",
  A.benutzernameZuMail("  Max Rinke ") === "maxrinke@login.kinodreieck.at"
  && A.benutzernameZuMail("MAX") === "max@login.kinodreieck.at");
check("Bereits vollqualifizierte Eingabe wird nicht doppelt ergänzt",
  A.benutzernameZuMail("max@login.kinodreieck.at") === "max@login.kinodreieck.at");

/* ---------- A1: Anmelden ---------- */
_ls.clear();
let d = neuerTreiber();
const konto = await d.signIn("max", "geheim1234");
check("A1 Anmeldung liefert Konto-Identität vom Server",
  konto.id === "konto-abc" && konto.benutzername === "max");
check("A1 Anmeldung sendet die synthetische Adresse, nicht den rohen Namen",
  calls[0]?.body?.email === "max@login.kinodreieck.at");

/* ---------- A2: Passwort hinterlässt keine Spur ---------- */
const alleWerte = [..._ls.entries()].map(([k, v]) => k + "=" + v).join("|");
check("A2 Passwort steht in keinem gespeicherten Wert", !alleWerte.includes("geheim1234"));

/* ---------- A3: Tokens nur im eigenen Schlüssel, nie im Snapshot ---------- */
const tokenSchluessel = [..._ls.keys()].filter((k) => /at-1|rt-1/.test(_ls.get(k) || ""));
check("A3 Tokens liegen ausschließlich unter kd:auth:session",
  tokenSchluessel.length === 1 && tokenSchluessel[0] === A.AUTH_SESSION_KEY);
const service = S.createAuthService({ driver: d });
await service.initialize();
const snap = service.getSnapshot();
const snapText = JSON.stringify(snap);
check("A3 Session-Snapshot enthält weder Token-Felder noch Tokenwerte",
  snap.mode === "account" && !/token/i.test(snapText) && !snapText.includes("at-") && !snapText.includes("rt-"));
check("A3 Snapshot trägt Anzeigename und Fähigkeiten",
  snap.account.displayName === "max" && snap.capabilities.remoteStorage === true && snap.capabilities.personalAi === true);

/* ---------- A4: Erneuerung nur einmal, auch bei parallelen Anfragen ---------- */
jetztMs += 3600_000;                        // Token ist jetzt abgelaufen
refreshZaehler = 0;
const parallel = await Promise.all([d.getAccessToken(), d.getAccessToken(), d.getAccessToken()]);
check("A4 Parallele Zugriffe lösen genau EINE Erneuerung aus", refreshZaehler === 1);
check("A4 Alle Aufrufer bekommen dasselbe frische Token",
  parallel[0] === parallel[1] && parallel[1] === parallel[2] && parallel[0] === "at-2");
check("A4 Das erneuerte Token ersetzt das alte in der Ablage",
  JSON.parse(_ls.get(A.AUTH_SESSION_KEY)).access_token === "at-2");

/* ---------- A5: Endgültig totes Refresh-Token ---------- */
szenario = "tot"; jetztMs += 3600_000;
const totesToken = await d.getAccessToken();
check("A5 Totes Refresh-Token beendet die Sitzung", totesToken === null && !_ls.has(A.AUTH_SESSION_KEY));
check("A5 Zustand wird als abgelaufen gemeldet", d.getZustand() === A.AUTH_ZUSTAND.ABGELAUFEN);
const svcTot = S.createAuthService({ driver: d });
await svcTot.initialize();
check("A5 Abgelaufene Sitzung ergibt einen betriebsbereiten Gast MIT Hinweis",
  svcTot.getSnapshot().mode === "guest" && svcTot.getSnapshot().state === "ready"
  && svcTot.getSnapshot().error?.code === ERROR_CODES.UNAUTHENTICATED);

/* ---------- A6: Offline ist KEIN Logout ---------- */
_ls.clear(); szenario = "ok"; d = neuerTreiber();
await d.signIn("max", "geheim1234");
szenario = "netz"; jetztMs += 3600_000;
const offlineToken = await d.getAccessToken();
check("A6 Netzwerkfehler behält die Sitzung (kein stiller Logout)",
  !!_ls.get(A.AUTH_SESSION_KEY) && offlineToken === "at-1");
check("A6 Zustand wird als eingeschränkt gemeldet", d.getZustand() === A.AUTH_ZUSTAND.DEGRADIERT);

/* ---------- A6b: 5xx (pausiertes Projekt) verhält sich wie offline ---------- */
szenario = "server"; jetztMs += 3600_000;
await d.getAccessToken();
check("A6b Serverfehler räumt die Sitzung NICHT weg",
  !!_ls.get(A.AUTH_SESSION_KEY) && d.getZustand() === A.AUTH_ZUSTAND.DEGRADIERT);
const svcDeg = S.createAuthService({ driver: d });
await svcDeg.initialize();
check("A6b Eingeschränkte Sitzung bleibt Accountmodus mit erkennbarem Zustand",
  svcDeg.getSnapshot().mode === "account" && svcDeg.getSnapshot().state === "degraded");

/* ---------- A7: Abmelden ---------- */
szenario = "ok";
_ls.set("kd:master", JSON.stringify({ filme: [{ id: "f1" }] }));
_ls.set("kd:artikel", JSON.stringify({ artikel: [] }));
const svcAb = S.createAuthService({ driver: d });
await svcAb.initialize();
await svcAb.signOut();
check("A7 Abmelden räumt die Sitzung", !_ls.has(A.AUTH_SESSION_KEY));
check("A7 Abmelden lässt persönliche Daten unangetastet",
  JSON.parse(_ls.get("kd:master")).filme[0].id === "f1" && _ls.has("kd:artikel"));
check("A7 Abmelden führt zurück in den Gastmodus ohne Fehlerzustand",
  svcAb.getSnapshot().mode === "guest" && svcAb.getSnapshot().error === null);

/* Abmelden gilt auch, wenn der Serverruf scheitert. */
_ls.clear(); szenario = "ok"; d = neuerTreiber();
await d.signIn("max", "geheim1234");
szenario = "netz";
await d.signOut();
check("A7b Abmelden gilt lokal auch bei Serverfehler", !_ls.has(A.AUTH_SESSION_KEY));

/* ---------- A8: Fehlerabbildung ---------- */
_ls.clear(); szenario = "ok"; d = neuerTreiber();
let falschesPasswort = null;
try { await d.signIn("max", "falsch"); } catch (e) { falschesPasswort = e; }
check("A8 Falsches Passwort wird als Anmeldefehler geführt (400-Sonderfall)",
  falschesPasswort?.code === ERROR_CODES.UNAUTHENTICATED);
check("A8 Fehlermeldung ist verständlich und verrät nichts Internes",
  /Benutzername oder Passwort/.test(falschesPasswort.message) && !/invalid_grant/i.test(falschesPasswort.message));
check("A8 Fehlgeschlagene Anmeldung hinterlässt keine Sitzung", !_ls.has(A.AUTH_SESSION_KEY));

let netzFehler = null;
szenario = "netz";
try { await d.signIn("max", "geheim1234"); } catch (e) { netzFehler = e; }
check("A8 Netzwerkfehler bei der Anmeldung wird als offline gemeldet",
  netzFehler?.code === ERROR_CODES.OFFLINE && netzFehler.retryable);

/* ---------- A9: fremde Auth-URL ---------- */
const fremd = A.createAuthDriver({
  config: { supabaseUrl: "https://boese.example", supabasePublishableKey: "sb_publishable_test" },
  fetchImpl: mockFetch, jetzt,
});
calls = [];
let fremdFehler = null;
try { await fremd.signIn("max", "geheim1234"); } catch (e) { fremdFehler = e; }
check("A9 Fremde Auth-Adresse wird abgelehnt — ohne einen einzigen Request",
  !!fremdFehler && calls.length === 0 && fremd.istKonfiguriert() === false);

/* ---------- Passwort ändern ---------- */
_ls.clear(); szenario = "ok"; d = neuerTreiber();
await d.signIn("max", "geheim1234");
calls = [];
const pw = await d.changePassword("neuesGeheim99");
check("Passwortänderung geht mit Bearer-Token an /user",
  pw.ok && calls.some((c) => /\/auth\/v1\/user$/.test(c.url) && c.method === "PUT"
    && c.headers.Authorization === "Bearer at-1" && c.body.password === "neuesGeheim99"));
let kurz = null;
try { await d.changePassword("kurz"); } catch (e) { kurz = e; }
check("Zu kurzes Passwort wird vor dem Senden abgefangen", !!kurz && /8 Zeichen/.test(kurz.message));

/* ---------- Ohne Treiber bleibt alles Gast ---------- */
const nurGast = S.createAuthService();
await nurGast.initialize();
check("Ohne eingerichtetes Anmeldeverfahren bleibt es beim Gast",
  nurGast.getSnapshot().mode === "guest" && nurGast.getSnapshot().error === null);
let ohneTreiber = null;
try { await nurGast.signIn("max", "geheim1234"); } catch (e) { ohneTreiber = e; }
check("Anmeldeversuch ohne Verfahren endet kontrolliert", !!ohneTreiber);

/* ---------- Keine Anfrage ohne gespeicherte Sitzung ---------- */
_ls.clear(); d = neuerTreiber(); calls = [];
const gastLaden = await d.loadSession();
check("Ohne gespeicherte Sitzung geht beim Start KEIN Netzwerkruf raus",
  gastLaden.mode === "guest" && calls.length === 0);

let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
console.log(`\n${checks.filter(([, p]) => p).length}/${checks.length} Auth-Checks bestanden.`);
process.exit(ok ? 0 : 1);

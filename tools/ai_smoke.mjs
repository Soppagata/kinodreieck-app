#!/usr/bin/env node
/* Rauchprobe für den geschützten KI-Endpunkt (Etappe 5) — läuft gegen die
   ECHTE deployte Edge Function.
   ============================================================================
   Bewusst NICHT Teil von `npm test`: braucht ein erreichbares Supabase-Projekt
   und ein echtes Testkonto. Nach jedem Deploy der Function ausführen.

   Konfiguration ausschließlich über Umgebungsvariablen — nie in Dateien, nie im
   Repo, nie im Chat:

     KD_SB_URL=https://<projekt>.supabase.co \
     KD_SB_ANON=<publishable-key> \
     KD_TESTA_USER=testa KD_TESTA_PASS=... \
     node tools/ai_smoke.mjs

   Was geprüft wird (Exit-Code != 0 bei jeder Abweichung):
     P1 CORS-Preflight ohne Anmeldung kommt durch      — sonst scheitert jeder
                                                         Browseraufruf schon vor
                                                         dem eigentlichen Request
     P2 POST ohne Authorization wird abgewiesen
     P3 POST mit dem ÖFFENTLICHEN Schlüssel als Bearer wird abgewiesen
        -> die sicherheitskritische Frage: der Endpunkt darf nur echte
           Nutzersitzungen akzeptieren, nicht den öffentlichen Projektschlüssel
     P4 POST mit unbrauchbarem Token wird abgewiesen
     P5 POST mit echter Sitzung liefert den Gesundheitsbericht
     P6 unbekannte Aufgabe endet als not-implemented, nicht als Serverfehler
     P7 fremder Origin bekommt keine CORS-Freigabe
     P8 der Anbieter ist erreichbar und nennt seine Modell-IDs
        -> belegt die IDs am echten Anbieter, statt sie der Doku zu glauben
     P9 Kettenbeweis: echter Modellaufruf mit striktem Antwortschema
        -> kostet einen Bruchteil eines Cent; der einzige zahlende Aufruf hier
     P10 derselbe Vorgang wird nicht zweimal abgerechnet (eigener Code, nicht
         faelschlich „Limit erreicht")
     P11 der Gesundheitsbericht zeigt Betriebswerte und eigenen Verbrauch

   Der Gesundheitsbericht aus P5 wird vollständig ausgegeben. Er enthält
   ausschließlich Namen und Formen (welche Umgebungsvariablen gesetzt sind,
   welche Claims ein Token trägt) — niemals Werte, Schlüssel oder Tokens.
   ============================================================================ */

const URL_BASIS = (process.env.KD_SB_URL || "").trim().replace(/\/+$/, "");
const ANON = (process.env.KD_SB_ANON || "").trim();
const USER = (process.env.KD_TESTA_USER || "testa").trim();
const PASS = process.env.KD_TESTA_PASS || "";
const MAIL_DOMAIN = (process.env.KD_MAIL_DOMAIN || "login.kinodreieck.at").trim();
const FUNKTION = (process.env.KD_AI_FUNKTION || "ai-task").trim();
const ORIGIN = (process.env.KD_ORIGIN || "https://kinodreieck.at").trim();

if (!URL_BASIS || !ANON || !PASS) {
  console.error("Fehlende Konfiguration. Erwartet: KD_SB_URL, KD_SB_ANON, KD_TESTA_PASS.");
  console.error("Siehe Kopf dieser Datei.");
  process.exit(2);
}

const ENDPUNKT = `${URL_BASIS}/functions/v1/${FUNKTION}`;
let fehler = 0;
let nummer = 0;

function pruefe(name, bedingung, details) {
  nummer += 1;
  const ok = !!bedingung;
  if (!ok) fehler += 1;
  console.log(`${ok ? "✓" : "✗"} P${nummer} ${name}`);
  if (details) console.log(`     ${details}`);
}

async function ruf(methode, kopf = {}, koerper = null, extraKopf = {}) {
  const antwort = await fetch(ENDPUNKT, {
    method: methode,
    headers: { Origin: ORIGIN, ...kopf, ...extraKopf },
    body: koerper === null ? undefined : JSON.stringify(koerper),
  });
  let daten = null;
  const text = await antwort.text();
  try { daten = text ? JSON.parse(text) : null; } catch { daten = { rohtext: text.slice(0, 300) }; }
  return {
    status: antwort.status,
    daten,
    allowOrigin: antwort.headers.get("access-control-allow-origin"),
    allowHeaders: antwort.headers.get("access-control-allow-headers"),
  };
}

async function meldeAn() {
  const antwort = await fetch(`${URL_BASIS}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${USER}@${MAIL_DOMAIN}`, password: PASS }),
  });
  const daten = await antwort.json().catch(() => null);
  if (!antwort.ok || !daten?.access_token) {
    console.error(`\nAnmeldung als ${USER}@${MAIL_DOMAIN} fehlgeschlagen (HTTP ${antwort.status}).`);
    console.error(`Grund laut Server: ${daten?.error_description || daten?.msg || daten?.error || "unbekannt"}`);
    console.error("Existiert das Konto, und ist 'Confirm email' im Dashboard aus?");
    process.exit(2);
  }
  return daten.access_token;
}

const JSON_KOPF = { "Content-Type": "application/json" };

console.log(`KI-Endpunkt-Rauchprobe gegen ${ENDPUNKT}\n`);

/* --- P1: Preflight ohne Anmeldung ---------------------------------------- */
const p1 = await ruf("OPTIONS", {
  "Access-Control-Request-Method": "POST",
  "Access-Control-Request-Headers": "authorization, content-type",
});
pruefe(
  "CORS-Preflight ohne Anmeldung kommt durch",
  p1.status >= 200 && p1.status < 300 && p1.allowOrigin === ORIGIN,
  `HTTP ${p1.status}, Allow-Origin: ${p1.allowOrigin ?? "(keiner)"}`,
);

/* --- P2: ohne Authorization ----------------------------------------------- */
const p2 = await ruf("POST", JSON_KOPF, { task: "health" });
pruefe(
  "POST ohne Authorization wird abgewiesen",
  p2.status === 401,
  `HTTP ${p2.status}, Antwort: ${JSON.stringify(p2.daten)?.slice(0, 160)}`,
);

/* --- P3: öffentlicher Schlüssel als Bearer -------------------------------- */
const p3 = await ruf("POST", { ...JSON_KOPF, Authorization: `Bearer ${ANON}`, apikey: ANON }, { task: "health" });
pruefe(
  "Öffentlicher Projektschlüssel gilt NICHT als Anmeldung",
  p3.status === 401,
  `HTTP ${p3.status}, Antwort: ${JSON.stringify(p3.daten)?.slice(0, 160)}`,
);

/* --- P4: Müll-Token -------------------------------------------------------- */
const p4 = await ruf("POST", { ...JSON_KOPF, Authorization: "Bearer nicht.ein.token" }, { task: "health" });
pruefe(
  "Unbrauchbares Token wird abgewiesen",
  p4.status === 401,
  `HTTP ${p4.status}`,
);

/* --- P5: echte Sitzung ----------------------------------------------------- */
const token = await meldeAn();
const p5 = await ruf(
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  { task: "health", vorgangId: "00000000-0000-4000-8000-000000000001" },
);
pruefe(
  "Echte Sitzung kommt durch und liefert den Gesundheitsbericht",
  p5.status === 200 && p5.daten?.ok === true && p5.daten?.aufrufer?.rolle === "authenticated",
  `HTTP ${p5.status}`,
);

/* --- P6: unbekannte Aufgabe ------------------------------------------------ */
const p6 = await ruf(
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  { task: "gibt-es-nicht" },
);
pruefe(
  "Unbekannte Aufgabe endet als not-implemented, nicht als Serverfehler",
  p6.status === 501 && p6.daten?.code === "not-implemented",
  `HTTP ${p6.status}, code: ${p6.daten?.code}`,
);

/* --- P7: fremder Origin ---------------------------------------------------- */
const p7 = await ruf("OPTIONS", { "Access-Control-Request-Method": "POST" }, null, { Origin: "https://boese.example" });
pruefe(
  "Fremder Origin bekommt keine CORS-Freigabe",
  !p7.allowOrigin,
  `Allow-Origin: ${p7.allowOrigin ?? "(keiner) — richtig"}`,
);

/* --- P8: Modell-IDs am echten Anbieter belegen ----------------------------- */
const p8 = await ruf(
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  { task: "anbieter-modelle" },
);
const modellIds = (p8.daten?.modelle ?? []).map((m) => m.id).filter(Boolean);
pruefe(
  "Anbieter ist erreichbar und nennt seine Modelle",
  p8.status === 200 && modellIds.length > 0,
  p8.status === 200 ? `${modellIds.length} Modelle` : `HTTP ${p8.status}: ${JSON.stringify(p8.daten)?.slice(0, 200)}`,
);

/* --- P9: echter Mini-Aufruf mit striktem Schema ----------------------------- */
const vorgangEcho = crypto.randomUUID();
const p9 = await ruf(
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  { task: "echo-struct", vorgangId: vorgangEcho, payload: { wort: "Kinodreieck" } },
);
pruefe(
  "Kettenbeweis: echter Modellaufruf liefert schemakonformes JSON",
  /* Kosten > 0, nicht bloss "eine Zahl": ein stiller Nullpreis (unbekannte
     Modell-ID in der Preistabelle) machte das Monatsbudget wirkungslos und
     waere von einer typeof-Pruefung nicht bemerkt worden. */
  p9.status === 200 && p9.daten?.ok === true && p9.daten?.data?.echo === "Kinodreieck"
    && typeof p9.daten?.verbrauch?.kostenUsdCent === "number"
    && p9.daten.verbrauch.kostenUsdCent > 0,
  p9.status === 200
    ? `Modell ${p9.daten?.modellAlias}, ${p9.daten?.verbrauch?.inputTokens}+${p9.daten?.verbrauch?.outputTokens} Tokens, ${p9.daten?.verbrauch?.kostenUsdCent} US-Cent, ${p9.daten?.verbrauch?.dauerMs} ms`
    : `HTTP ${p9.status}: ${JSON.stringify(p9.daten)?.slice(0, 300)}`,
);

/* --- P10: Doppelklick-Schutz ------------------------------------------------ */
const p10 = await ruf(
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  { task: "echo-struct", vorgangId: vorgangEcho, payload: { wort: "Kinodreieck" } },
);
pruefe(
  "Derselbe Vorgang wird nicht zweimal abgerechnet — und heisst nicht Limit",
  p10.status === 409 && p10.daten?.code === "ai-duplicate",
  `HTTP ${p10.status}, code: ${p10.daten?.code}, grund: ${p10.daten?.grund}`,
);

/* --- P11: Verbrauch ist im Gesundheitsbericht sichtbar ---------------------- */
const p11 = await ruf(
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  { task: "health" },
);
pruefe(
  "Gesundheitsbericht zeigt Betriebswerte und den eigenen Verbrauch",
  p11.status === 200 && p11.daten?.betrieb?.aiAktiv === true
    && typeof p11.daten?.betrieb?.stand?.heuteAuftraege === "number",
  `heute ${p11.daten?.betrieb?.stand?.heuteAuftraege}/${p11.daten?.betrieb?.tageslimit} Auftraege, eigener Monatsverbrauch ${p11.daten?.betrieb?.stand?.monatVerbrauchtUsdCent} US-Cent, Budget erschoepft: ${p11.daten?.betrieb?.stand?.budgetErschoepft}`,
);

/* --- Diagnose -------------------------------------------------------------- */
if (modellIds.length) {
  console.log("\n───────── Modell-IDs laut Anbieter (fuer die Konfiguration) ─────────");
  for (const m of p8.daten.modelle) console.log(`  ${m.id}${m.name ? "   (" + m.name + ")" : ""}`);
  console.log("─────────────────────────────────────────────────────────────────────");
}

console.log("\n───────── Gesundheitsbericht (nur Namen und Formen, keine Werte) ─────────");
console.log(JSON.stringify(p5.daten, null, 2));
console.log("──────────────────────────────────────────────────────────────────────────\n");

console.log(`${nummer - fehler}/${nummer} Proben bestanden.`);
if (fehler) {
  console.log("RAUCHPROBE FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("RAUCHPROBE BESTANDEN");

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
     npm run test:ai:live

   Autonome Agenten dürfen dieses Skript nicht direkt starten. Das npm-Skript
   legt den Kostenwächter davor und danach.

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
     P9 der Gesundheitsbericht zeigt Betriebswerte und eigenen Verbrauch
     S1 intelligente Suche
     S2 persönliche Profilextraktion mit wörtlich belegtem Signal
     S3 persönliche Vorbewertung mit getrenntem WARUM
     S4 quellengeführte Filmwissen-Synthese plus enge Lese-RPC
     S5 Ein-Artikel-Blogprofilextraktion mit beleggebundenen Geschmackszügen
     S6 Text-Stapelimport ohne Bildpfad

   Jede Nutzerszene wird genau einmal potenziell zahlend aufgerufen. Ihre
   Antwort läuft anschließend durch den echten Clientparser und einen lokalen
   bzw. providerfreien Persistenz-/Readback-Vertrag. Es gibt keine Retries.

   Der Gesundheitsbericht aus P5 wird vollständig ausgegeben. Er enthält
   ausschließlich Namen und Formen (welche Umgebungsvariablen gesetzt sind,
   welche Claims ein Token trägt) — niemals Werte, Schlüssel oder Tokens.
   ============================================================================ */

import {
  BUDGET_UNBEKANNT_EXIT,
  LiveLaufWache,
  LiveSicherheitsStopp,
  SMOKE_MAX_ANBIETER_REQUESTS,
  fetchMitZeitgrenze,
  holeBudgetStand,
  liesJsonOderNull,
} from "./ai_budget_guard.mjs";
import {
  AI_USER_TASKS,
  pruefeAiUserTaskReadback,
} from "./ai_user_task_contract.mjs";
import {
  BLOG_PROFILE_ANALYSE_PROMPT_VERSION,
  hatBlogProfileAnalyseCapability,
} from "../src/lib/blogProfilAnalyse.js";
import { erteileEinwilligung, leeresProfil } from "../src/lib/profil.js";
import { readFileSync } from "node:fs";
import {
  OWNER_CORE_SIX_GUARD_ENV,
  OWNER_CORE_SIX_GUARD_VALUE,
  captureProviderRawResponse,
  providerDiagnosticHeaders,
  providerRawCaptureEnabled,
} from "./provider_raw_capture.mjs";

const FINDER_VOKABULAR = JSON.parse(readFileSync(
  new URL("../src/data/finder_vokabular.json", import.meta.url),
  "utf8",
));

const URL_BASIS = (process.env.KD_SB_URL || "").trim().replace(/\/+$/, "");
const ANON = (process.env.KD_SB_ANON || "").trim();
const USER = (process.env.KD_TESTA_USER || "testa").trim();
const PASS = process.env.KD_TESTA_PASS || "";
const MAIL_DOMAIN = (process.env.KD_MAIL_DOMAIN || "login.kinodreieck.at").trim();
const FUNKTION = (process.env.KD_AI_FUNKTION || "ai-task").trim();
const ORIGIN = (process.env.KD_ORIGIN || "https://kinodreieck.at").trim();
const OWNER_CORE_SIX = process.env[OWNER_CORE_SIX_GUARD_ENV]
  === OWNER_CORE_SIX_GUARD_VALUE;

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
  try {
    const antwort = await fetchMitZeitgrenze(ENDPUNKT, {
      method: methode,
      headers: { Origin: ORIGIN, ...kopf, ...extraKopf },
      body: koerper === null ? undefined : JSON.stringify(koerper),
    });
    let daten = null;
    const text = await antwort.text();
    try { daten = text ? JSON.parse(text) : null; } catch { daten = { antwortForm: "kein-json" }; }
    return {
      status: antwort.status,
      daten,
      allowOrigin: antwort.headers.get("access-control-allow-origin"),
      allowHeaders: antwort.headers.get("access-control-allow-headers"),
    };
  } catch (error) {
    stoppeLiveLauf(error);
  }
}

async function meldeAn() {
  const antwort = await fetchMitZeitgrenze(`${URL_BASIS}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${USER}@${MAIL_DOMAIN}`, password: PASS }),
  });
  const daten = await liesJsonOderNull(antwort);
  if (!antwort.ok || !daten?.access_token) {
    console.error(`\nAnmeldung als ${USER}@${MAIL_DOMAIN} fehlgeschlagen (HTTP ${antwort.status}).`);
    console.error(`Grund laut Server: ${daten?.error_description || daten?.msg || daten?.error || "unbekannt"}`);
    console.error("Existiert das Konto, und ist 'Confirm email' im Dashboard aus?");
    process.exit(2);
  }
  return daten.access_token;
}

async function rpc(name, token, body) {
  try {
    const antwort = await fetchMitZeitgrenze(`${URL_BASIS}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const daten = await liesJsonOderNull(antwort);
    return { status: antwort.status, daten };
  } catch (error) {
    stoppeLiveLauf(error);
  }
}

const JSON_KOPF = { "Content-Type": "application/json" };

function pruefeBlogProfilCapabilityAbschnitt(abschnitt, healthAntwort) {
  const healthOk = hatBlogProfileAnalyseCapability(healthAntwort?.daten);
  pruefe(
    `${abschnitt}: Health belegt ai-task-v5/blog-profile-extract Capability`,
    healthOk,
    healthAntwort?.status === 200
      ? `HTTP ${healthAntwort.status}, ok=${healthAntwort.daten?.ok}`
      : `HTTP ${healthAntwort?.status || "(Unbekannt)"}`,
  );
  if (!healthOk) {
    stoppeLiveLauf(new LiveSicherheitsStopp(
      "unbekannt",
      `${abschnitt}: health schlägt die Blog-Profile-Capability nicht exakt nach.`,
    ));
  }
}

function pruefeAktivierungsvertrag(abschnitt, healthAntwort) {
  const activation = healthAntwort?.daten?.activation;
  const ok = activation
    && typeof activation === "object"
    && !Array.isArray(activation)
    && Object.keys(activation).sort().join(",") === "enabled,gate,requiredValue,userTasks"
    && activation.gate === "KD_AI_TASK_ENABLED"
    && activation.requiredValue === "true"
    && activation.enabled === true
    && JSON.stringify(activation.userTasks) === JSON.stringify(AI_USER_TASKS);
  pruefe(
    `${abschnitt}: Health bindet die Aktivierung exakt an sechs Nutzeraufgaben`,
    ok,
    `Gate ${activation?.gate ?? "(fehlt)"}, aktiviert ${activation?.enabled === true ? "ja" : "nein"}`,
  );
  if (!ok) {
    stoppeLiveLauf(new LiveSicherheitsStopp(
      "unbekannt",
      `${abschnitt}: KD_AI_TASK_ENABLED ist nicht exakt true oder der Sechs-Aufgaben-Vertrag driftet.`,
    ));
  }
}

function pruefeNutzerTaskReadback(label, task, antwort, kontext = {}) {
  try {
    const auswertung = pruefeAiUserTaskReadback({ task, antwort, kontext });
    pruefe(
      `${label}: Produktionsparser, Speicherung und Readback sind grün`,
      auswertung.ok === true && !!auswertung.persistenz && !!auswertung.gelesen,
      `Persistenz ${auswertung.persistenz}`,
    );
    return auswertung;
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "UNBEKANNT";
    pruefe(`${label}: Produktionsparser, Speicherung und Readback sind grün`, false, `Code ${code}`);
    stoppeLiveLauf(new LiveSicherheitsStopp(
      "unbekannt",
      `${label}: Parser-/Persistenz-/Readback-Vertrag scheiterte (${code}).`,
    ));
  }
}

// Capabilities werden nur einmal anhand des bereits vorhandenen P5-Health-Berichts geprüft.

function stoppeLiveLauf(error) {
  const stopp = error instanceof LiveSicherheitsStopp
    ? error
    : new LiveSicherheitsStopp(
      "unbekannt",
      error?.message || "Anbieterrequest oder Kostenmessung ist fehlgeschlagen.",
    );
  const kennung = stopp.exitCode === BUDGET_UNBEKANNT_EXIT
    ? "BUDGET_UNBEKANNT"
    : "AUTONOMIE_STOPP";
  console.error(`${kennung}: ${stopp.message}`);
  console.error("Keine automatische Wiederholung; keine weiteren echten KI-Requests.");
  process.exit(stopp.exitCode);
}

console.log(`KI-Endpunkt-Rauchprobe gegen ${ENDPUNKT}\n`);

let PROVIDER_DIAGNOSTIC_HEADERS = Object.freeze({});
if (OWNER_CORE_SIX) {
  try {
    if (!providerRawCaptureEnabled(process.env)) {
      throw new Error("privater Capture-Guard fehlt");
    }
    PROVIDER_DIAGNOSTIC_HEADERS = providerDiagnosticHeaders(process.env);
  } catch {
    stoppeLiveLauf(new LiveSicherheitsStopp(
      "unbekannt",
      "Owner-Sechserlauf hat keine sichere private Provider-Capture-Senke.",
    ));
  }
}

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
let token;
try {
  token = await meldeAn();
} catch (error) {
  stoppeLiveLauf(error);
}
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
pruefeAktivierungsvertrag("P5", p5);

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

pruefeBlogProfilCapabilityAbschnitt("P5", p5);

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

if (!(p8.status === 200 && modellIds.length > 0)) {
  stoppeLiveLauf(new LiveSicherheitsStopp(
    "unbekannt",
    "Anbieterdiagnose ist unbekannt; zahlende Proben werden nicht begonnen.",
  ));
}

const laufWache = new LiveLaufWache({
  maxAnbieterRequests: OWNER_CORE_SIX ? 6 : SMOKE_MAX_ANBIETER_REQUESTS,
  standLeser: () => holeBudgetStand({
    verbindung: {
      urlBasis: URL_BASIS,
      anon: ANON,
      funktion: FUNKTION,
      origin: ORIGIN,
    },
    token,
  }),
});
try {
  await laufWache.initialisiere();
} catch (error) {
  stoppeLiveLauf(error);
}

async function rufAnbieterBewacht(label, methode, kopf, koerper, extraKopf = {}) {
  let markierung;
  try {
    markierung = await laufWache.vorAnbieterRequest(label);
    const ergebnis = await ruf(methode, kopf, koerper, {
      ...extraKopf,
      ...PROVIDER_DIAGNOSTIC_HEADERS,
    });
    let captureError = null;
    if (OWNER_CORE_SIX) {
      const fileName = ({
        "P12 intelligent-search": "01-intelligent-search.json",
        "P14 profile-extract": "02-profile-extract.json",
        "P17 film-forecast": "03-film-forecast.json",
        "P18 filmwissen-synthese": "04-filmwissen-synthese.json",
        "P22 blog-profile-extract": "05-blog-profile-extract.json",
        "P23 media-batch-extract": "06-media-batch-extract.json",
      })[label];
      try {
        if (!fileName) throw new Error("unbekannter Sechserpfad");
        captureProviderRawResponse(ergebnis.daten, fileName, {
          env: process.env,
          repoRoot: new URL("..", import.meta.url).pathname.replace(/\/$/, ""),
        });
      } catch {
        captureError = new LiveSicherheitsStopp(
          "unbekannt",
          `${label}: unveraenderter Providerpayload wurde nicht sicher privat erfasst.`,
        );
      }
    }
    const kostenRoh = ergebnis.daten?.verbrauch?.kostenUsdCent;
    const kosten = kostenRoh === undefined || kostenRoh === null ? null : kostenRoh;
    await laufWache.nachAnbieterRequest(markierung, kosten);
    if (captureError) throw captureError;
    if (ergebnis.status !== 200) {
      throw new LiveSicherheitsStopp(
        ergebnis.status === 429 ? "limit" : "unbekannt",
        `${label} endete mit HTTP ${ergebnis.status}.`,
      );
    }
    return ergebnis;
  } catch (error) {
    stoppeLiveLauf(error);
  }
}

/* --- P9: Verbrauch ist im Gesundheitsbericht sichtbar ---------------------- */
const p9 = await ruf(
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  { task: "health" },
);
pruefe(
  "Gesundheitsbericht zeigt Betriebswerte und den eigenen Verbrauch",
  p9.status === 200 && p9.daten?.betrieb?.aiAktiv === true
    && typeof p9.daten?.betrieb?.stand?.heuteAuftraege === "number",
  `heute ${p9.daten?.betrieb?.stand?.heuteAuftraege}/${p9.daten?.betrieb?.tageslimit} Auftraege, eigener Monatsverbrauch ${p9.daten?.betrieb?.stand?.monatVerbrauchtUsdCent} US-Cent, Budget erschoepft: ${p9.daten?.betrieb?.stand?.budgetErschoepft}`,
);

/* ===========================================================================
   S1: intelligente Suche — genau ein potenziell zahlender Nutzerfall
   =========================================================================== */

/* Realistische Wertelisten wie im Client. Die Bestandgenres sind eine kleine
   Testauswahl; alle statischen Achsen werden aus derselben kanonischen
   Vokabeldatei wie `bekannteWerte()` gelesen. So kann die Rauchprobe keine
   entfernten Finder-Werte versehentlich weiter am Leben halten. */
const SUCH_LISTEN = {
  genres: ["sci-fi", "horror", "drama", "komödie", "romance", "crime", "thriller", "action", "western", "anime"],
  kategorien: Object.keys(FINDER_VOKABULAR.kategorien || {}),
  stimmungen: Object.keys(FINDER_VOKABULAR.stimmungen || {}),
  quellen: Object.keys(FINDER_VOKABULAR.quellen || {}),
  zeit: Object.keys(FINDER_VOKABULAR.zeit || {}),
};
const READBACK_ZEIT = new Date().toISOString();

const ausListe = (werte, erlaubt) => (werte ?? []).every((w) => erlaubt.includes(w));

/* --- P12: der Kettenbeweis der Suche (kostet) ------------------------------- */
const suchsatzEcht = "Was Melancholisches von frueher, aber bitte kein Liebesfilm und nichts nach 1985";
const p12 = await rufAnbieterBewacht(
  "P12 intelligent-search",
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  {
    task: "intelligent-search",
    vorgangId: crypto.randomUUID(),
    promptVersion: "v2",
    payload: { suchsatz: suchsatzEcht, listen: SUCH_LISTEN },
  },
);
const d12 = p12.daten?.data;
pruefe(
  "Intelligente Suche liefert ein gueltiges Filterschema aus erlaubten Werten",
  p12.status === 200 && !!d12
    && ausListe(d12.harte_filter?.genres, SUCH_LISTEN.genres)
    && ausListe(d12.ausschluesse?.genres, SUCH_LISTEN.genres)
    && ausListe(d12.weiche_wuensche?.stimmungen, SUCH_LISTEN.stimmungen)
    && ausListe(d12.harte_filter?.kategorien, SUCH_LISTEN.kategorien)
    && Array.isArray(d12.nicht_unterstuetzt)
    && p12.daten?.modellAlias === "gross"
    && p12.daten?.verbrauch?.kostenUsdCent > 0,
  `HTTP ${p12.status}, Modell ${p12.daten?.modellAlias}, ${p12.daten?.verbrauch?.kostenUsdCent} US-Cent`,
);
pruefeNutzerTaskReadback("S1 intelligent-search", "intelligent-search", p12.daten, {
  master: [],
  zusatzGenres: SUCH_LISTEN.genres,
});

/* ===========================================================================
   P14: Persönliche Profilextraktion mit repräsentativem Beleg-/Schemafall
   =========================================================================== */
const PROFILE_ANTWORTEN = {
  K1: "Ich liebe Horrorfilme, wenn sie langsam Spannung aufbauen und die Kamera lange beobachtet.",
  K2: "Alien begeistert mich durch seine düstere Atmosphäre; hektische Schnitte stoßen mich ab.",
  K4: "Am wichtigsten sind mir präzise Inszenierung und eine Wirkung, die nach dem Abspann bleibt.",
};
const p14 = await rufAnbieterBewacht(
  "P14 profile-extract",
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  {
    task: "profile-extract",
    vorgangId: crypto.randomUUID(),
    promptVersion: "v1",
    payload: { antworten: PROFILE_ANTWORTEN, listen: SUCH_LISTEN },
  },
);
const d14 = p14.daten?.data;
const profileBelegeSindWoertlich = (d14?.signale ?? []).every((signal) =>
  typeof signal?.beleg === "string"
  && typeof PROFILE_ANTWORTEN[signal?.quelle] === "string"
  && PROFILE_ANTWORTEN[signal.quelle].includes(signal.beleg));
pruefe(
  "Profilextraktion liefert ein striktes Schema mit wörtlich zuordenbaren Belegen",
  p14.status === 200 && p14.daten?.ok === true
    && Array.isArray(d14?.signale) && d14.signale.length > 0
    && Array.isArray(d14?.filme)
    && Array.isArray(d14?.nicht_deutbar)
    && d14?.achsen_tendenz && typeof d14.achsen_tendenz === "object"
    && profileBelegeSindWoertlich
    && p14.daten?.verbrauch?.kostenUsdCent > 0,
  p14.status === 200
    ? `${d14?.signale?.length ?? 0} Signal(e), alle Belege wörtlich: ${profileBelegeSindWoertlich}`
    : `HTTP ${p14.status}: ${JSON.stringify(p14.daten)?.slice(0, 300)}`,
);
pruefeNutzerTaskReadback("S2 profile-extract", "profile-extract", p14.daten, {
  jetzt: READBACK_ZEIT,
});

/* ===========================================================================
   S3: Vorbewertung — genau ein potenziell zahlender Nutzerfall

   Die Prognose nutzt synthetische, aber fachlich realistische Profilsignale.
   Weder andere Filme noch Bewertungen, Notizen oder Profilbelege werden
   mitgeschickt. Die Aufgabe besitzt keine Websuche.
   =========================================================================== */
const FORECAST_FILM = {
  titel: "Alien",
  originaltitel: "Alien",
  jahr: 1979,
  typ: "film",
  genres: ["Horror", "Science-Fiction"],
  tags: ["düster", "konzentriert"],
};
const FORECAST_SIGNALE = [
  { art: "genre", wert: "Horror", richtung: "zieht_an", staerke: 5, sicherheit: "hoch" },
  { art: "ton", wert: "düster", richtung: "zieht_an", staerke: 4, sicherheit: "hoch" },
  { art: "tempo", wert: "langsamer Aufbau", richtung: "zieht_an", staerke: 4, sicherheit: "mittel" },
  { art: "inszenierung", wert: "atmosphärisch", richtung: "zieht_an", staerke: 5, sicherheit: "hoch" },
  { art: "haltung", wert: "unironisch", richtung: "zieht_an", staerke: 3, sicherheit: "mittel" },
];

/* --- S3: genau eine echte Vorbewertung ------------------------------------- */
const p17 = await rufAnbieterBewacht(
  "P17 film-forecast",
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  {
    task: "film-forecast",
    vorgangId: crypto.randomUUID(),
    promptVersion: "v1",
    profilVersion: "p-test",
    payload: {
      film: FORECAST_FILM,
      profil: {
        signale: FORECAST_SIGNALE,
        achsen: { wie: 4, was: 4, warum: null },
      },
    },
  },
);
const d17 = p17.daten?.data;
pruefe(
  "Echte Vorbewertung bleibt getrennt, nachvollziehbar und weist reale Kosten aus",
  p17.status === 200 && p17.daten?.ok === true
    && p17.daten?.modellAlias === "gross"
    && typeof p17.daten?.modell === "string"
    && p17.daten.modell.length > 0
    && d17?.format === "film-prognose-v1"
    && (d17?.achsen?.warum === null
      || (Number.isInteger(d17.achsen.warum) && d17.achsen.warum >= 0 && d17.achsen.warum <= 5))
    && Number.isInteger(d17?.passung)
    && d17.passung >= 0 && d17.passung <= 100
    && Array.isArray(d17?.verwendete_signale)
    && d17.verwendete_signale.length > 0
    && d17.verwendete_signale.every((s) =>
      /^S[1-9][0-9]*$/.test(s?.id)
      && Object.keys(s || {}).sort().join(",") === "art,id,richtung,wert")
    && p17.daten?.verbrauch?.kostenUsdCent > 0,
  p17.status === 200
    ? `Modell ${p17.daten?.modell}, ${p17.daten?.verbrauch?.kostenUsdCent} US-Cent, Sicherheit ${d17?.sicherheit}`
    : `HTTP ${p17.status}: ${JSON.stringify(p17.daten)?.slice(0, 300)}`,
);
pruefeNutzerTaskReadback("S3 film-forecast", "film-forecast", p17.daten, {
  profilVersion: "p-test",
  promptVersion: "v1",
  jetzt: READBACK_ZEIT,
});

/* ===========================================================================
   S4: gemeinsames Filmwissen und seine enge providerfreie Lese-RPC

   P18 ist der einzige möglicherweise zahlende Syntheselauf. Der veröffentlichte
   Bericht wird danach ausschließlich über die providerfreie Lese-RPC geprüft.
   =========================================================================== */
function liesFilmwissenKennung() {
  if (!OWNER_CORE_SIX) return { namespace: "imdb", kennung: "tt0078748" };
  const raw = String(process.env.KD_FILMWISSEN_TARGET_ID || "").trim();
  const match = raw.match(/^(imdb|tmdb|wikidata):([^\s:]{1,150})$/i);
  if (!match) {
    stoppeLiveLauf(new LiveSicherheitsStopp(
      "unbekannt",
      "Owner-Sechserlauf hat keine starke reale Filmwissen-Kennung.",
    ));
  }
  return { namespace: match[1].toLowerCase(), kennung: match[2] };
}
const FILMWISSEN_KENNUNG = liesFilmwissenKennung();
const p18 = await rufAnbieterBewacht(
  "P18 filmwissen-synthese",
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  {
    task: "filmwissen-synthese",
    vorgangId: crypto.randomUUID(),
    payload: FILMWISSEN_KENNUNG,
  },
);
const d18 = p18.daten?.data;
const p18Erfolg = p18.status === 200
  && p18.daten?.ok === true
  && (OWNER_CORE_SIX ? d18?.status === "belegt" : ["belegt", "cache_hit"].includes(d18?.status))
  && typeof d18?.versionId === "string";
pruefe(
  "Quellengeführte Synthese veröffentlicht Alien oder findet dieselbe Cache-Version",
  p18Erfolg,
  p18.status === 200
    ? `Status ${d18?.status}, Version ${d18?.versionId}, Kosten ${p18.daten?.verbrauch?.kostenUsdCent ?? 0} US-Cent`
    : `HTTP ${p18.status}: ${JSON.stringify(p18.daten)?.slice(0, 300)}`,
);

const p20 = p18Erfolg
  ? await rpc("kd_filmwissen_aktuell_lesen", token, {
    p_namespace: FILMWISSEN_KENNUNG.namespace,
    p_kennung: FILMWISSEN_KENNUNG.kennung,
  })
  : null;
pruefe(
  "Der veröffentlichte gemeinsame Bericht ist über die enge Lese-RPC sichtbar",
  p20?.status === 200
    && p20?.daten?.status === "belegt"
    && p20?.daten?.version?.id === d18?.versionId
    && Number.isInteger(p20?.daten?.warum?.wert),
  p20
    ? `HTTP ${p20.status}, WARUM ${p20.daten?.warum?.wert}, Version ${p20.daten?.version?.id}`
    : "übersprungen, weil P18 fehlgeschlagen ist",
);
pruefeNutzerTaskReadback("S4 filmwissen-synthese", "filmwissen-synthese", p18.daten, {
  rpcReadback: p20?.daten,
});

/* ===========================================================================
   S5: Synthetische Ein-Artikel-Blog-Profilextraktion

   Der erste Pfad nutzt eine einzelne Review als Input — kein Batch und keine
   weitere externe Datenquelle. Er bleibt ein echter kostenpflichtiger Aufruf.
   =========================================================================== */
const BLOG_PROFILE_ARTIKEL = {
  id: "artikel_17b",
  titel: "Ein strenger Filmtext",
  text: "Die Kamera bleibt lange still und beobachtet, wie sich jede kleinste Bewegung verändert.",
};
const BLOG_PROFILE_LISTEN = {
  genres: ["Drama", "Science-Fiction"],
  tags: ["ruhig", "präzise"],
};
const p22 = await rufAnbieterBewacht(
  "P22 blog-profile-extract",
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  {
    task: "blog-profile-extract",
    vorgangId: crypto.randomUUID(),
    payload: {
      artikel: BLOG_PROFILE_ARTIKEL,
      listen: BLOG_PROFILE_LISTEN,
    },
  },
);
const d22 = p22.daten?.data;
pruefe(
  "Synthetische Ein-Artikel-Profilextraktion bleibt ein bezahlter Pfad mit belegten Ergebnissen",
  p22.status === 200 && p22.daten?.ok === true
    && Array.isArray(d22?.geschmackszuege)
    && Array.isArray(d22?.vokabular)
    && (d22.geschmackszuege.length > 0 || d22.vokabular.length > 0)
    && p22.daten?.verbrauch?.kostenUsdCent > 0,
  p22.status === 200
    ? `${d22?.geschmackszuege?.length ?? 0} Geschmackszug, ${d22?.vokabular?.length ?? 0} Vokabular, ${p22.daten?.verbrauch?.kostenUsdCent} US-Cent`
    : `HTTP ${p22.status}: ${JSON.stringify(p22.daten)?.slice(0, 300)}`,
);
pruefeNutzerTaskReadback("S5 blog-profile-extract", "blog-profile-extract", p22.daten, {
  artikelPayload: {
    artikel: BLOG_PROFILE_ARTIKEL,
    listen: BLOG_PROFILE_LISTEN,
  },
  profil: erteileEinwilligung(leeresProfil(), READBACK_ZEIT),
  vokabular: [],
  vorschaukopf: {
    quelle: "bloganalyse",
    articleId: BLOG_PROFILE_ARTIKEL.id,
    contentHash: "a".repeat(64),
    analyzedAt: READBACK_ZEIT,
    promptVersion: BLOG_PROFILE_ANALYSE_PROMPT_VERSION,
  },
});

/* ===========================================================================
   S6: Text-Stapelimport strukturiert synthetische Medien ohne Bildpfad
   =========================================================================== */
const p23 = await rufAnbieterBewacht(
  "P23 media-batch-extract text-only",
  "POST",
  { ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
  {
    task: "media-batch-extract",
    vorgangId: crypto.randomUUID(),
    promptVersion: "v1",
    payload: {
      liste: [
        "Alien | 1979 | Blu-ray",
        "Kind of Blue | CD",
        "The Expanse | Staffel 1-3 | DVD",
      ],
      standardQuelle: "unklar",
      vorbeurteilen: false,
      bewertungen: [],
    },
  },
);
const d23 = p23.daten?.data;
pruefe(
  "Text-Stapelimport ist live gebaut, bleibt unbewertet und benötigt keinen Bildpfad",
  p23.status === 200 && p23.daten?.ok === true
    && p23.daten?.modellAlias === "klein"
    && Array.isArray(d23?.kandidaten)
    && d23.kandidaten.length > 0
    && d23.kandidaten.every((kandidat) =>
      typeof kandidat?.titel === "string" && kandidat.titel.length > 0
      && ["film", "serie", "musik"].includes(kandidat?.typ)
      && kandidat?.vorbeurteilung === "offen"
      && kandidat?.begruendung === "")
    && Array.isArray(d23?.warnungen)
    && p23.daten?.verbrauch?.kostenUsdCent > 0,
  p23.status === 200
    ? `${d23?.kandidaten?.length ?? 0} Kandidat(en), ${p23.daten?.verbrauch?.kostenUsdCent} US-Cent`
    : `HTTP ${p23.status}: ${JSON.stringify(p23.daten)?.slice(0, 300)}`,
);
pruefeNutzerTaskReadback("S6 media-batch-extract", "media-batch-extract", p23.daten, {
  master: [],
});

/* --- Diagnose -------------------------------------------------------------- */
if (d12) {
  console.log("\n───────── Deutung von P12 (zum Abnicken oder Korrigieren) ─────────");
  console.log(`  Anfrage: ${suchsatzEcht}`);
  console.log(JSON.stringify(d12, null, 2));
  console.log("───────────────────────────────────────────────────────────────────");
}
if (d14) {
  console.log("\n───────── Belegte Profilextraktion (P14) ─────────");
  console.log(JSON.stringify(d14, null, 2));
  console.log("──────────────────────────────────────────────────");
}
if (d17) {
  console.log("\n───────── Etappe-8-Vorbewertung (P17) ─────────");
  console.log(JSON.stringify(d17, null, 2));
  console.log("───────────────────────────────────────────────");
}
if (p20?.daten?.status === "belegt") {
  console.log("\n───────── Gemeinsames Filmwissen (P20, gekürzt) ─────────");
  console.log(JSON.stringify({
    status: p20.daten.status,
    werk: p20.daten.werk,
    version: p20.daten.version,
    warum: p20.daten.warum,
    fundstellen: (p20.daten.fundstellen || []).map((f) => ({
      quelle: f.quelle,
      attribution: f.attribution,
      kernaussagen: f.kernaussagen,
    })),
  }, null, 2));
  console.log("─────────────────────────────────────────────────────────");
}

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

/* Vorlade-Fixture fuer den vollstaendigen Acht-Pfade-Harness-Test.
   Jeder Transport ist lokal gemockt; weder DNS noch Netzwerk werden benutzt. */

const ORIGIN = "https://staging.fixture.invalid";
const ANON = "sb_publishable_fixture_key_1234567890";
const SESSION = "fixture-owner-session";
const BUILD = "a".repeat(40);
const AI_TASKS = [
  "intelligent-search",
  "profile-extract",
  "film-forecast",
  "filmwissen-synthese",
  "media-batch-extract",
  "blog-profile-extract",
];
let radarFeedReads = 0;

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function health(vorgangId) {
  return {
    ok: true,
    task: "health",
    vorgangId: vorgangId || "00000000-0000-4000-8000-000000000001",
    phase: "fixture",
    contractVersion: "ai-task-v5",
    buildVersion: BUILD,
    laufzeit: { deno: "fixture", region: "local" },
    schluesselHerkunft: { oeffentlich: "fixture", geheim: "fixture" },
    anbieterSecretGesetzt: true,
    aufrufer: {
      rolle: "authenticated", fachrolle: "owner", weg: "token", accountIdVorhanden: true,
    },
    activation: {
      gate: "KD_AI_TASK_ENABLED",
      requiredValue: "true",
      enabled: true,
      userTasks: AI_TASKS,
    },
    betrieb: {
      aiAktiv: true,
      stand: {
        heuteAuftraege: 0,
        monatVerbrauchtUsdCent: 10,
        budgetErschoepft: false,
      },
      tageslimit: 30,
      monatsbudgetUsdCent: 1000,
      anbieterRequestMaxUsdCent: 500,
      anbieterRequestOwnerMaxUsdCent: 500,
      anbieterRequestTimeoutMs: 135000,
      anbieterRequestTimeoutOwnerMaxMs: 135000,
    },
    zeit: "2030-01-01T10:00:00.000Z",
    capabilities: {
      blogProfileExtract: {
        ready: true,
        task: "blog-profile-extract",
        promptVersion: "blog-profile-v2",
        modelAlias: "klein",
        maxTokens: 2048,
        taskMaxReservationUsdCent: 5,
      },
    },
  };
}

function radarFeed() {
  return {
    format: "kd-radar-pilot-feed-v2",
    revision: 0,
    checksum: null,
    reconciledAt: "2030-01-01T10:00:00.000Z",
    subscriptions: [],
    events: [],
    receipts: [],
    operationAcks: [],
    radarReview: true,
    personResults: [],
  };
}

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  let body = {};
  try { body = options.body ? JSON.parse(String(options.body)) : {}; } catch { /* unbenutzt */ }

  if (url.endsWith("/auth/v1/token?grant_type=password")) {
    return json(200, { access_token: SESSION });
  }
  if (url.includes("/rest/v1/kd_account_access?")) {
    return json(200, [{ active: true, personal_ai: true, role: "owner" }]);
  }
  if (url.endsWith("/rest/v1/rpc/kd_radar_pilot_feed")) {
    radarFeedReads += 1;
    if (radarFeedReads === 2) throw new TypeError("fixture-radar-readback-error");
    return json(200, radarFeed());
  }
  if (url.endsWith("/functions/v1/entdecken-daily-task")) {
    if (method === "GET") {
      return json(200, { ok: false, status: "empty", feed: null });
    }
    console.log("FIXTURE_PROVIDER_PATH entdecken-daily-task");
    throw new TypeError("fixture-known-zero-transport-error");
  }
  if (url.endsWith("/functions/v1/radar-websearch-task")) {
    console.log("FIXTURE_PROVIDER_PATH radar-websearch-task");
    const freitextSubmit = /^text:[a-f0-9]{16}$/.test(body.targetId || "")
      && body.targetText === "Star Wars: Starfighter Kinostart Österreich"
      && Object.keys(body).sort().join(",") === "targetId,targetText";
    console.log(`FIXTURE_RADAR_SUBMIT ${freitextSubmit ? "valid" : "invalid"}`);
    return json(500, { ok: false, code: "fixture-path-error" });
  }
  if (!url.endsWith("/functions/v1/ai-task")) {
    throw new Error("fixture-unexpected-url");
  }

  if (method === "OPTIONS") {
    const allowed = headers.get("origin") === ORIGIN;
    return new Response(null, {
      status: 204,
      headers: allowed ? {
        "access-control-allow-origin": ORIGIN,
        "access-control-allow-headers": "authorization, content-type",
      } : {},
    });
  }

  const authorization = headers.get("authorization");
  if (authorization !== `Bearer ${SESSION}`) return json(401, { code: "unauthorized" });
  if (body.task === "health") return json(200, health(body.vorgangId));
  if (body.task === "gibt-es-nicht") return json(501, { code: "not-implemented" });
  if (body.task === "anbieter-modelle") {
    return json(200, { modelle: [{ id: "fixture-model", name: "Fixture" }] });
  }
  if (AI_TASKS.includes(body.task)) {
    console.log(`FIXTURE_PROVIDER_PATH ${body.task}`);
    return json(500, { ok: false, code: "fixture-path-error" });
  }
  return json(400, { code: "fixture-unexpected-task", anonMatched: authorization === `Bearer ${ANON}` });
};

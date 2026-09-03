import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import {
  PRIVATE_MAIL_ERROR_CODES,
  PRIVATE_MAIL_SCHEMA_VERSION,
  PRIVATE_MAIL_TYPES,
  createPrivateMailFailureResponse,
  createPrivateMailSuccessResponse,
} from "./supabase/functions/_shared/privateMailContract.js";
import {
  PRIVATE_MAIL_CLIENT_STATUS,
  PRIVATE_MAIL_TIMEOUT_MS,
  createPrivateMailService,
} from "./src/services/privateMail.js";

const moduleRoot = process.env.KD_TEST_NODE_MODULES || path.join(process.cwd(), "node_modules");
const requireFromTestEnv = createRequire(path.join(moduleRoot, "__kd_test_resolver__.cjs"));
const { JSDOM } = requireFromTestEnv("jsdom");
let esbuild;
try { esbuild = requireFromTestEnv("esbuild"); }
catch { esbuild = requireFromTestEnv("vite/node_modules/esbuild"); }
const { build } = esbuild;

let checks = 0;
function check(name, callback) {
  callback();
  checks++;
  console.log("✓ " + name);
}

const operationIds = [
  "11111111-2222-4333-8444-555555555551",
  "11111111-2222-4333-8444-555555555552",
  "11111111-2222-4333-8444-555555555553",
  "11111111-2222-4333-8444-555555555554",
  "11111111-2222-4333-8444-555555555555",
];
const session = Object.freeze({
  mode: "account", state: "ready", account: Object.freeze({ id: "konto-intern" }),
});
const config = Object.freeze({
  privateMailEnabled: true,
  privateMailEndpointName: "private-mail",
  supabaseUrl: "https://projekt.supabase.co",
  supabasePublishableKey: "sb_publishable_test",
});
function serviceWith(fetchImpl, extra = {}) {
  let idIndex = 0;
  return createPrivateMailService({
    config,
    auth: { getSnapshot: () => session },
    getAccount: () => ({ id: "konto-intern" }),
    getAccessToken: async (options) => {
      assert.deepEqual(options, { erwarteteKontoId: "konto-intern" });
      return "session-token";
    },
    createOperationId: () => operationIds[idIndex++],
    fetchImpl,
    ...extra,
  });
}

check("Der feste Client-Timeout lässt dem 20-Sekunden-Serverweg Abschlussluft", () => {
  assert.equal(PRIVATE_MAIL_TIMEOUT_MS, 30_000);
});

let fetches = 0;
const disabled = createPrivateMailService({
  config: { ...config, privateMailEnabled: false },
  fetchImpl: async () => { fetches++; },
});
assert.equal((await disabled.submitFeedback("Hallo")).status, PRIVATE_MAIL_CLIENT_STATUS.UNAVAILABLE);
check("Ohne exakt aktives Runtime-Flag bleibt der Transport vollständig aus", () => {
  assert.equal(fetches, 0);
});

let feedbackCall;
const acceptedService = serviceWith(async (url, options) => {
  feedbackCall = { url, options, body: JSON.parse(options.body) };
  return {
    ok: true,
    json: async () => createPrivateMailSuccessResponse({
      type: feedbackCall.body.type,
      operationId: feedbackCall.body.operationId,
    }),
  };
});
const accepted = await acceptedService.submitFeedback("  Filmwunsch 🎬\r\nDanke  ");
check("Feedback nutzt Route, Token, no-store und das exakte v1-Browserschema", () => {
  assert.equal(accepted.status, PRIVATE_MAIL_CLIENT_STATUS.ACCEPTED);
  assert.equal(feedbackCall.url, "https://projekt.supabase.co/functions/v1/private-mail");
  assert.equal(feedbackCall.options.method, "POST");
  assert.equal(feedbackCall.options.cache, "no-store");
  assert.equal(feedbackCall.options.headers.Authorization, "Bearer session-token");
  assert.equal(feedbackCall.options.headers.apikey, "sb_publishable_test");
  assert.equal(Object.hasOwn(feedbackCall.options.headers, "Cache-Control"), false);
  assert.ok(feedbackCall.options.signal instanceof AbortSignal);
  assert.deepEqual(feedbackCall.body, {
    schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
    operationId: operationIds[0],
    type: PRIVATE_MAIL_TYPES.FEEDBACK,
    text: "Filmwunsch 🎬\nDanke",
  });
  assert.equal(Object.keys(feedbackCall.body).some((key) => /account|address|email|header|subject|html|profile|diagnos|browser/i.test(key)), false);
});

let deletionBody;
const deletionService = serviceWith(async (_url, options) => {
  deletionBody = JSON.parse(options.body);
  return {
    ok: true,
    json: async () => createPrivateMailSuccessResponse({
      type: deletionBody.type,
      operationId: deletionBody.operationId,
    }),
  };
});
assert.equal((await deletionService.requestAccountDeletion()).status, PRIVATE_MAIL_CLIENT_STATUS.ACCEPTED);
check("Kontolöschanfrage ist eine getrennte Operation ohne Browser-Kontoidentität", () => {
  assert.deepEqual(deletionBody, {
    schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
    operationId: operationIds[0],
    type: PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST,
  });
});

for (const [name, payload, expected] of [
  ["explizite Ablehnung", createPrivateMailFailureResponse(PRIVATE_MAIL_ERROR_CODES.DELIVERY_REJECTED), PRIVATE_MAIL_CLIENT_STATUS.REJECTED],
  ["unklarer Zustellstatus", createPrivateMailFailureResponse(PRIVATE_MAIL_ERROR_CODES.DELIVERY_STATUS_UNKNOWN), PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN],
  ["nicht verfügbarer Serverpfad", createPrivateMailFailureResponse(PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE), PRIVATE_MAIL_CLIENT_STATUS.UNAVAILABLE],
]) {
  const mapped = serviceWith(async () => ({ ok: false, json: async () => payload }));
  assert.equal((await mapped.submitFeedback("Text")).status, expected);
  check(`Client übersetzt ${name} ohne Rohfehler`, () => {});
}

const mismatched = serviceWith(async () => ({
  ok: true,
  json: async () => createPrivateMailSuccessResponse({
    type: PRIVATE_MAIL_TYPES.FEEDBACK,
    operationId: operationIds[1],
  }),
}));
check("Ein nicht zum Request passender Erfolg wird nur als unknown akzeptiert", () => {});
assert.equal((await mismatched.submitFeedback("Text")).status, PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN);

const timeout = serviceWith((_url, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener("abort", () => reject(new Error("interner Timeout")), { once: true });
}), { timeoutMs: 2 });
assert.equal((await timeout.submitFeedback("Text")).status, PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN);
check("Timeout löst keinen Retry aus und bleibt ehrlich unknown", () => {});

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://local.invalid/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent"]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let copied = "";
Object.defineProperty(globalThis.navigator, "clipboard", {
  value: { writeText: async (value) => { copied = value; } }, configurable: true,
});

const bundle = await build({
  stdin: {
    contents: `
      export { default as React, act } from "react";
      export { createRoot } from "react-dom/client";
      export { FeedbackOhneNamensangabe, Kontoloeschanfrage, PrivateMailPrivacyNote } from "./src/components/PrivateMailRequests.jsx";
    `,
    sourcefile: "private-mail-ui-entry.jsx",
    resolveDir: process.cwd(),
    loader: "jsx",
  },
  write: false,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  nodePaths: [moduleRoot],
});
const ui = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const root = ui.createRoot(document.getElementById("root"));
const uiCalls = { feedback: 0, deletion: 0 };
let finishFeedback;
const uiService = {
  submitFeedback: () => {
    uiCalls.feedback++;
    return new Promise((resolve) => { finishFeedback = resolve; });
  },
  requestAccountDeletion: async () => {
    uiCalls.deletion++;
    return { status: PRIVATE_MAIL_CLIENT_STATUS.ACCEPTED };
  },
};
async function renderUi({ enabled = true, accountActive = true } = {}) {
  await ui.act(async () => {
    root.render(ui.React.createElement(ui.React.Fragment, null,
      ui.React.createElement(ui.PrivateMailPrivacyNote, { config: { ...config, privateMailEnabled: enabled } }),
      ui.React.createElement(ui.FeedbackOhneNamensangabe, { config: { ...config, privateMailEnabled: enabled }, accountActive, service: uiService }),
      ui.React.createElement(ui.Kontoloeschanfrage, { config: { ...config, privateMailEnabled: enabled }, accountActive, service: uiService }),
    ));
    await Promise.resolve();
  });
}

await renderUi({ enabled: false });
check("Flag false versteckt die gesamte Request- und Datenschutz-UI", () => {
  assert.equal(document.querySelector("[data-private-mail-feedback]"), null);
  assert.equal(document.querySelector("[data-private-mail-account-deletion]"), null);
  assert.equal(document.querySelector("[data-private-mail-privacy]"), null);
});

await renderUi({ accountActive: false });
check("Ohne aktives Konto bleiben beide authentifizierten Requestwege unsichtbar", () => {
  assert.equal(document.querySelector("[data-private-mail-feedback]"), null);
  assert.equal(document.querySelector("[data-private-mail-account-deletion]"), null);
});

await renderUi();
check("Aktiver Weg erklärt US-Verarbeitung, 30 Tage und manuelle Löschung ohne Privatadresse", () => {
  assert.match(document.body.textContent, /USA/);
  assert.match(document.body.textContent, /30 Tage/);
  assert.match(document.body.textContent, /manuell geprüft und bearbeitet/);
  assert.match(document.body.textContent, /nicht sofort/);
  assert.doesNotMatch(document.body.innerHTML, /mailto:|@[a-z0-9.-]+\.[a-z]{2,}/i);
});

const textarea = document.querySelector("textarea");
await ui.act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")
    .set.call(textarea, "🎬".repeat(2001));
  textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});
check("Feedback wird nach exakt 2000 Codepoints begrenzt", () => {
  assert.equal([...textarea.value].length, 2000);
  assert.match(document.querySelector("[data-private-mail-codepoints]").textContent, /^2000 \/ 2000/);
});

const feedbackButton = [...document.querySelectorAll("button")].find((button) => button.textContent === "Feedback senden");
await ui.act(async () => {
  feedbackButton.click();
  feedbackButton.click();
  await Promise.resolve();
});
check("Doppelsubmit ist während des laufenden Requests gesperrt", () => {
  assert.equal(uiCalls.feedback, 1);
  assert.equal(feedbackButton.disabled, true);
});
await ui.act(async () => {
  finishFeedback({ status: PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN });
  await Promise.resolve();
});
check("Unknown erhält den Feedbacktext und zeigt keinen Rohfehler", () => {
  assert.equal([...textarea.value].length, 2000);
  assert.match(document.querySelector('[data-private-mail-status="unknown"]').textContent, /Ausgang ist gerade unklar/);
  assert.doesNotMatch(document.body.textContent, /interner Timeout/);
});
const copyButton = [...document.querySelectorAll("button")].find((button) => button.textContent === "Text kopieren");
await ui.act(async () => { copyButton.click(); await Promise.resolve(); });
check("Erhaltener Fehlertext ist kopierbar", () => {
  assert.equal([...copied].length, 2000);
});

const deletionSection = document.querySelector("[data-private-mail-account-deletion]");
const deletionButton = deletionSection.querySelector("button");
check("Kontolöschung ist eine getrennte bestätigungspflichtige UI-Operation", () => {
  assert.equal(deletionButton.disabled, true);
});
await ui.act(async () => {
  deletionSection.querySelector('input[type="checkbox"]').click();
  await Promise.resolve();
  deletionButton.click();
  await Promise.resolve();
});
check("Bestätigte Kontolöschanfrage behauptet nur Annahme, keine endgültige Zustellung", () => {
  assert.equal(uiCalls.deletion, 1);
  assert.match(deletionSection.textContent, /endgültige Zustellung ist damit noch nicht bestätigt/);
});

await ui.act(async () => root.unmount());
dom.window.close();
esbuild.stop?.();
console.log(`private_mail_ui_test: ${checks} Checks bestanden (nur Mocks).`);
process.exit(0);

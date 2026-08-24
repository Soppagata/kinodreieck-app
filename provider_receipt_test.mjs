import assert from "node:assert/strict";
import {
  createProviderReceipt,
  isProviderReceipt,
  normalizeProviderReceipt,
} from "./supabase/functions/_shared/providerReceipt.js";
import {
  erstelleAnbieterPfadBelege,
  providerReceiptBelegAusAntwort,
} from "./tools/ai_smoke_contract.mjs";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const rawResponse = JSON.stringify({
  model: "claude-haiku-4-5",
  content: [{
    type: "text",
    text: "api_key=sk-ant-synthetic-secret und https://private.example/pfad",
  }, { type: "thinking", thinking: "nicht ausgeben" }],
  usage: {
    input_tokens: 120,
    output_tokens: 80,
    server_tool_use: { web_search_requests: 1 },
  },
});

const receiptInput = Object.freeze({
  provider: "anthropic",
  rawResponse,
  model: "claude-haiku-4-5",
  inputTokens: 120,
  outputTokens: 80,
  webSearchRequests: 1,
  resultMode: "partial",
  serverLogId: 71,
  providerRequests: 1,
  reservationUsdCent: 1.5,
  costUsdCent: 1.052,
});

await check("Receipt hasht deterministisch und enthaelt keine reversiblen Providerinhalte", async () => {
  const first = await createProviderReceipt(receiptInput);
  const second = await createProviderReceipt(receiptInput);
  const changed = await createProviderReceipt({
    ...receiptInput,
    rawResponse: rawResponse.replace("nicht ausgeben", "anderer Inhalt"),
  });
  assert.equal(isProviderReceipt(first), true);
  assert.equal(first.responseSha256, second.responseSha256);
  assert.notEqual(first.responseSha256, changed.responseSha256);
  assert.match(first.responseSha256, /^[a-f0-9]{64}$/);
  const visible = JSON.stringify(first);
  for (const forbidden of [
    "sk-ant-synthetic-secret", "private.example", "nicht ausgeben", "thinking",
  ]) assert.equal(visible.includes(forbidden), false);
});

await check("Receipt faellt bei fehlender Usage oder manipulierter Korrelation geschlossen aus", async () => {
  assert.equal(await createProviderReceipt({ ...receiptInput, inputTokens: undefined }), null);
  assert.equal(await createProviderReceipt({ ...receiptInput, serverLogId: 0 }), null);
  const valid = await createProviderReceipt(receiptInput);
  assert.equal(normalizeProviderReceipt({
    ...valid,
    server: { ...valid.server, providerRequests: 2 },
  }), null);
});

await check("Harness belegt eine normale Function-Antwort ohne Diagnoseheader oder Rawcapture", async () => {
  const valid = await createProviderReceipt(receiptInput);
  const proven = erstelleAnbieterPfadBelege(["radar-websearch-task"], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  proven.registriere("radar-websearch-task");
  proven.erfasseProviderReceipt(
    "radar-websearch-task",
    providerReceiptBelegAusAntwort("radar-websearch-task", {
      ok: true,
      status: "confirmed",
      writes: 1,
      providerRequests: 1,
      searchRequests: 1,
      responseMode: "partial",
      providerReceipt: valid,
    }, 1.052),
  );
  proven.erfassePfadErgebnis("radar-websearch-task", { ok: true });
  assert.equal(proven.abschluss().ok, true);

  const uncorrelated = erstelleAnbieterPfadBelege(["radar-websearch-task"], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  uncorrelated.registriere("radar-websearch-task");
  assert.throws(() => uncorrelated.erfasseProviderReceipt(
    "radar-websearch-task",
    providerReceiptBelegAusAntwort("radar-websearch-task", {
      ok: true,
      providerRequests: 1,
      searchRequests: 1,
      responseMode: "partial",
      providerReceipt: valid,
    }, 0),
  ), /nicht mit Functionkosten/);

  const unproven = erstelleAnbieterPfadBelege(["radar-websearch-task"], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  unproven.registriere("radar-websearch-task");
  unproven.erfasseProviderReceipt(
    "radar-websearch-task",
    providerReceiptBelegAusAntwort("radar-websearch-task", {
      ok: false,
      status: "provider_error",
    }, 0),
  );
  const zero = unproven.abschluss();
  assert.equal(zero.ok, false);
  assert.deepEqual(zero.unbelegt, ["radar-websearch-task"]);
  assert.equal(zero.provenProviderRequests, 0);

  const paidMissing = erstelleAnbieterPfadBelege(["radar-websearch-task"], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  paidMissing.registriere("radar-websearch-task");
  assert.throws(() => paidMissing.erfasseProviderReceipt(
    "radar-websearch-task",
    providerReceiptBelegAusAntwort("radar-websearch-task", {
      ok: false,
      status: "provider_error",
    }, 0.01),
  ), /Providerbeleg fehlt/);

  const unknownMissing = erstelleAnbieterPfadBelege(["radar-websearch-task"], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  unknownMissing.registriere("radar-websearch-task");
  assert.throws(() => unknownMissing.erfasseProviderReceipt(
    "radar-websearch-task",
    providerReceiptBelegAusAntwort("radar-websearch-task", {
      ok: false,
      status: "provider_error",
    }, null),
  ), /Providerbeleg fehlt/);
});

await check("Harness schliesst alle acht normalen Produktpfade seriell mit eigenen Receipts", async () => {
  const paths = [
    "intelligent-search",
    "profile-extract",
    "film-forecast",
    "filmwissen-synthese",
    "blog-profile-extract",
    "media-batch-extract",
    "entdecken-daily-task",
    "radar-websearch-task",
  ];
  const proofs = erstelleAnbieterPfadBelege(paths, {
    maxPotentialRequests: 9,
    requireProviderReceipt: true,
  });
  for (const [index, path] of paths.entries()) {
    const webSearch = path.endsWith("-daily-task") || path === "radar-websearch-task";
    const costUsdCent = 0.1 + (index / 100);
    const receipt = await createProviderReceipt({
      ...receiptInput,
      rawResponse: `${rawResponse}\n${path}`,
      webSearchRequests: webSearch ? 1 : null,
      resultMode: "structured",
      serverLogId: 100 + index,
      reservationUsdCent: 2 + index,
      costUsdCent,
    });
    proofs.registriere(path);
    const normalResponse = webSearch
      ? {
        ok: true,
        status: path === "entdecken-daily-task" ? "fresh" : "confirmed",
        writes: 1,
        providerRequests: 1,
        searchRequests: 1,
        responseMode: "structured",
        providerReceipt: receipt,
      }
      : {
        ok: true,
        task: path,
        responseMode: "structured",
        providerReceipt: receipt,
        verbrauch: { kostenUsdCent: costUsdCent },
      };
    proofs.erfasseProviderReceipt(
      path,
      providerReceiptBelegAusAntwort(path, normalResponse, costUsdCent),
    );
    proofs.erfassePfadErgebnis(path, { ok: true });
  }
  const complete = proofs.abschluss();
  assert.equal(complete.ok, true);
  assert.equal(complete.attemptedProviderRequests, 8);
  assert.equal(complete.provenProviderRequests, 8);
  assert.equal(complete.provenPaths, 8);
  assert.deepEqual(complete.ausgefuehrt, paths);
});

console.log(`\nProvider-Receipt: ${checks}/${checks} Prüfungen grün`);

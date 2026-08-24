import assert from "node:assert/strict";
import {
  createProviderReceipt,
  isProviderReceipt,
  normalizeProviderReceipt,
} from "./supabase/functions/_shared/providerReceipt.js";
import {
  ProviderReceiptEvidenceError,
  erstelleAnbieterPfadBelege,
  istTerminalerAnbieterPfadHttpStatus,
  providerReceiptBelegAusAntwort,
  schliesseBekanntenAnbieterPfad,
} from "./tools/ai_smoke_contract.mjs";
import {
  AiUserTaskContractError,
  pruefeAiUserTaskReadback,
} from "./tools/ai_user_task_contract.mjs";
import {
  AUTONOMIE_STOPP_EXIT,
  LiveSicherheitsStopp,
} from "./tools/ai_budget_guard.mjs";

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
  providerResponseText: rawResponse,
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
    providerResponseText: rawResponse.replace("nicht ausgeben", "anderer Inhalt"),
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

await check("Receipt bindet auch den vom toleranten Parser konsumierten leeren Text", async () => {
  const empty = await createProviderReceipt({
    ...receiptInput,
    providerResponseText: "",
    webSearchRequests: null,
    resultMode: "degraded",
  });
  assert.equal(isProviderReceipt(empty), true);
  assert.equal(
    empty.responseSha256,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(empty.resultMode, "degraded");
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
  const uncorrelatedStatus = uncorrelated.erfasseProviderReceipt(
    "radar-websearch-task",
    providerReceiptBelegAusAntwort("radar-websearch-task", {
      ok: true,
      providerRequests: 1,
      searchRequests: 1,
      responseMode: "partial",
      providerReceipt: valid,
    }, 0),
  );
  assert.equal(uncorrelatedStatus.status, "failed");
  assert.equal(uncorrelatedStatus.providerProof, "unproven");
  assert.equal(uncorrelatedStatus.receiptState, "uncorrelated");

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
  assert.equal(zero.pfade[0].receiptState, "absent");

  const paidMissing = erstelleAnbieterPfadBelege(["radar-websearch-task"], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  paidMissing.registriere("radar-websearch-task");
  const paidMissingStatus = paidMissing.erfasseProviderReceipt(
    "radar-websearch-task",
    providerReceiptBelegAusAntwort("radar-websearch-task", {
      ok: false,
      status: "provider_error",
    }, 0.01),
  );
  assert.equal(paidMissingStatus.status, "failed");
  assert.equal(paidMissingStatus.providerProof, "unproven");
  assert.equal(paidMissingStatus.receiptState, "absent");
  assert.equal(paidMissing.abschluss().potentialProviderRequests, 1);

  const malformed = erstelleAnbieterPfadBelege(["radar-websearch-task"], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  malformed.registriere("radar-websearch-task");
  const malformedStatus = malformed.erfasseProviderReceipt(
    "radar-websearch-task",
    providerReceiptBelegAusAntwort("radar-websearch-task", {
      ok: true,
      providerRequests: 1,
      searchRequests: 1,
      responseMode: "partial",
      providerReceipt: { ...valid, reversiblesZusatzfeld: "nicht erlaubt" },
    }, 0.01),
  );
  assert.equal(malformedStatus.status, "failed");
  assert.equal(malformedStatus.providerProof, "unproven");
  assert.equal(malformedStatus.receiptState, "malformed");
  assert.equal(malformed.abschluss().provenProviderRequests, 0);

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
  ), (error) => error instanceof ProviderReceiptEvidenceError
    && error.code === "COST_UNKNOWN"
    && error.terminalCode === "BUDGET_UNBEKANNT");
});

await check("Bekannte Receipt-Fehlkosten lassen exakt den naechsten seriellen Pfad einmal zu", async () => {
  const paths = ["intelligent-search", "media-batch-extract"];
  const proofs = erstelleAnbieterPfadBelege(paths, {
    maxPotentialRequests: 2,
    requireProviderReceipt: true,
  });
  proofs.registriere(paths[0]);
  const failed = proofs.erfasseProviderReceipt(
    paths[0],
    providerReceiptBelegAusAntwort(paths[0], {
      ok: false,
      responseMode: "degraded",
      verbrauch: { kostenUsdCent: 0.25 },
    }, 0.25),
  );
  assert.equal(failed.status, "failed");
  assert.equal(failed.providerProof, "unproven");
  assert.equal(failed.receiptState, "absent");

  const nextReceipt = await createProviderReceipt({
    ...receiptInput,
    providerResponseText: '{"kandidaten":[{"titel":"Alien"}]}',
    webSearchRequests: null,
    resultMode: "partial",
    serverLogId: 72,
    costUsdCent: 0.42,
  });
  proofs.registriere(paths[1]);
  const next = proofs.erfasseProviderReceipt(
    paths[1],
    providerReceiptBelegAusAntwort(paths[1], {
      ok: true,
      responseMode: "partial",
      providerReceipt: nextReceipt,
      verbrauch: { kostenUsdCent: 0.42 },
    }, 0.42),
  );
  assert.equal(next.providerProof, "proven");
  proofs.erfassePfadErgebnis(paths[1], { ok: true });

  const complete = proofs.abschluss();
  assert.deepEqual(complete.ausgefuehrt, paths);
  assert.equal(complete.attemptedProviderRequests, 2);
  assert.equal(complete.potentialProviderRequests, 2);
  assert.equal(complete.provenProviderRequests, 1);
  assert.equal(complete.provenPaths, 1);
  assert.deepEqual(complete.fehlgeschlagen, [paths[0]]);
  assert.deepEqual(complete.offen, []);
});

await check("Bekannte Kosten plus gueltiger Receipt machen DATA_FORM rot und starten den Folgepfad genau einmal", async () => {
  const paths = ["blog-profile-extract", "media-batch-extract"];
  const proofs = erstelleAnbieterPfadBelege(paths, {
    maxPotentialRequests: 2,
    requireProviderReceipt: true,
  });
  const blogReceipt = await createProviderReceipt({
    ...receiptInput,
    webSearchRequests: null,
    resultMode: "partial",
  });
  const blogAntwort = {
    ok: true,
    task: paths[0],
    vorgangId: "11111111-2222-4333-8444-555555555555",
    modellAlias: "klein",
    modell: "claude-haiku-4-5",
    data: null,
    responseMode: "partial",
    displayText: "Keine sicher belegten Vorschlaege.",
    warnings: ["no-safe-structure"],
    providerReceipt: blogReceipt,
    verbrauch: {
      inputTokens: 120,
      outputTokens: 80,
      kostenUsdCent: 1.052,
      dauerMs: 150,
      stopReason: "end_turn",
    },
  };

  proofs.registriere(paths[0]);
  const provider = proofs.erfasseProviderReceipt(
    paths[0],
    providerReceiptBelegAusAntwort(paths[0], blogAntwort, 1.052),
  );
  assert.equal(provider.providerProof, "proven");
  let readbackCode = null;
  try {
    pruefeAiUserTaskReadback({ task: paths[0], antwort: blogAntwort });
  } catch (error) {
    assert.equal(error instanceof AiUserTaskContractError, true);
    readbackCode = error.code;
  }
  assert.equal(readbackCode, "DATA_FORM");
  const failed = schliesseBekanntenAnbieterPfad({
    belege: proofs,
    pfad: paths[0],
    ok: false,
    reason: `readback-${readbackCode}`,
    requestKostenUsdCent: 1.052,
  });
  assert.equal(failed.ergebnis, "FAIL/UNPROVEN");
  assert.equal(failed.status, "failed");
  assert.equal(failed.providerProof, "proven");
  assert.equal(failed.reason, "readback-DATA_FORM");

  const nextReceipt = await createProviderReceipt({
    ...receiptInput,
    providerResponseText: '{"kandidaten":[{"titel":"Alien"}]}',
    webSearchRequests: null,
    resultMode: "structured",
    serverLogId: 72,
    costUsdCent: 0.42,
  });
  proofs.registriere(paths[1]);
  proofs.erfasseProviderReceipt(
    paths[1],
    providerReceiptBelegAusAntwort(paths[1], {
      ok: true,
      responseMode: "structured",
      providerReceipt: nextReceipt,
      verbrauch: { kostenUsdCent: 0.42 },
    }, 0.42),
  );
  schliesseBekanntenAnbieterPfad({
    belege: proofs,
    pfad: paths[1],
    ok: true,
    requestKostenUsdCent: 0.42,
  });
  const complete = proofs.abschluss();
  assert.deepEqual(complete.ausgefuehrt, paths);
  assert.equal(complete.attemptedProviderRequests, 2);
  assert.deepEqual(complete.fehlgeschlagen, [paths[0]]);
  assert.deepEqual(complete.offen, []);
});

await check("Unbekannte Kosten bleiben terminal und lassen den Folgepfad unangetastet", async () => {
  const paths = ["intelligent-search", "media-batch-extract"];
  const proofs = erstelleAnbieterPfadBelege(paths, {
    maxPotentialRequests: 2,
    requireProviderReceipt: true,
  });
  proofs.registriere(paths[0]);
  assert.throws(() => proofs.erfasseProviderReceipt(
    paths[0],
    providerReceiptBelegAusAntwort(paths[0], { ok: false }, Number.NaN),
  ), (error) => error instanceof ProviderReceiptEvidenceError
    && error.terminalCode === "BUDGET_UNBEKANNT");
  const stopped = proofs.abschluss();
  assert.deepEqual(stopped.ausgefuehrt, [paths[0]]);
  assert.equal(stopped.attemptedProviderRequests, 1);
  assert.equal(stopped.potentialProviderRequests, 1);
  assert.equal(stopped.pfade[1].status, "not-attempted");
});

await check("Unbekannter Pfadabschluss und Exit75 bleiben terminal", async () => {
  const paths = ["blog-profile-extract", "media-batch-extract"];
  const proofs = erstelleAnbieterPfadBelege(paths, {
    maxPotentialRequests: 2,
    requireProviderReceipt: true,
  });
  proofs.registriere(paths[0]);
  assert.throws(() => schliesseBekanntenAnbieterPfad({
    belege: proofs,
    pfad: paths[0],
    ok: false,
    reason: "readback-DATA_FORM",
    requestKostenUsdCent: Number.NaN,
  }), (error) => error instanceof ProviderReceiptEvidenceError
    && error.terminalCode === "BUDGET_UNBEKANNT");
  assert.deepEqual(proofs.abschluss().ausgefuehrt, [paths[0]]);
  assert.equal(proofs.abschluss().pfade[1].status, "not-attempted");

  const exit75 = new LiveSicherheitsStopp("limit", "Testlimit erreicht");
  assert.equal(exit75.exitCode, AUTONOMIE_STOPP_EXIT);
  assert.equal(exit75.exitCode, 75);
});

await check("Timeout-, Lock-, Owner- und Limitstatus bleiben trotz Receipt-Fortsetzung terminal", async () => {
  for (const status of [401, 403, 408, 409, 423, 429, 504, 524]) {
    assert.equal(istTerminalerAnbieterPfadHttpStatus(status), true, String(status));
  }
  for (const status of [200, 400, 422, 500, null, "429"]) {
    assert.equal(istTerminalerAnbieterPfadHttpStatus(status), false, String(status));
  }
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
      providerResponseText: `${rawResponse}\n${path}`,
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

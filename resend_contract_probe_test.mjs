#!/usr/bin/env node
/* Ausschliesslich lokale Mocks: kein Keychain-Write, kein Resend-, DNS-,
   Browser-, Login- oder sonstiger Netzaufruf. */

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXECUTION_MARKER,
  EXIT,
  FIXED_PROBE_PAYLOAD,
  MAX_REQUESTS,
  RESEND_ENDPOINT,
  RESEND_KEYCHAIN,
  ResendProbeFailure,
  main,
  readResendApiKey,
  runResendContractProbe,
} from "./tools/resend_contract_probe.mjs";

const SECRET = "re_fixture_secret_never_persist_or_log";
const REQUEST_KEY = "11111111-1111-4111-8111-111111111111";

let tests = 0;
async function test(name, fn) {
  await fn();
  tests += 1;
  console.log(`✓ ${name}`);
}

async function withPrivateRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "kinodreieck-resend-probe-test-"));
  chmodSync(root, 0o700);
  try {
    return await fn(root);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "kinodreieck-resend-probe-test-")));
    rmSync(root, { recursive: true, force: true });
  }
}

function mockResponse(status, rawBody, headers = {}, statusText = "") {
  return new Response(Buffer.from(rawBody, "utf8"), {
    status,
    statusText,
    headers,
  });
}

function captureTree(directory) {
  return readdirSync(directory)
    .sort()
    .map((name) => ({
      name,
      bytes: readFileSync(join(directory, name)),
      mode: statSync(join(directory, name)).mode & 0o777,
    }));
}

await test("Einmalplan sendet exakt Original, Wiederholung und eine minimale Body-Abweichung", async () => {
  await withPrivateRoot(async (root) => {
    const calls = [];
    const rawBodies = [
      "opaque-success-one\n",
      "opaque-success-one\n",
      "opaque-conflict-three\n",
    ];
    const statuses = [200, 200, 409];
    const statusTexts = ["OK", "OK", "Conflict"];
    const result = await runResendContractProbe({
      apiKey: SECRET,
      outputRoot: root,
      uuidFactory: () => REQUEST_KEY,
      signalFactory: () => undefined,
      async fetchImpl(url, options) {
        const index = calls.length;
        calls.push({
          url,
          method: options.method,
          headers: { ...options.headers },
          body: options.body,
          redirect: options.redirect,
        });
        return mockResponse(
          statuses[index],
          rawBodies[index],
          {
            "content-type": "application/json",
            "ratelimit-limit": "10",
            "x-request-id": `request-${index + 1}`,
          },
          statusTexts[index],
        );
      },
    });

    assert.equal(result.exitCode, EXIT.NON_2XX);
    assert.equal(result.responseCount, MAX_REQUESTS);
    assert.equal(calls.length, MAX_REQUESTS);
    assert.ok(calls.every((call) => call.url === RESEND_ENDPOINT));
    assert.ok(calls.every((call) => call.method === "POST"));
    assert.ok(calls.every((call) => call.redirect === "error"));
    assert.ok(calls.every((call) => call.headers.Authorization === `Bearer ${SECRET}`));
    assert.ok(calls.every((call) => call.headers["Idempotency-Key"] === REQUEST_KEY));
    assert.ok(calls.every((call) => call.headers["Content-Type"] === "application/json"));
    assert.ok(calls.every((call) => call.headers["User-Agent"] === "Kinodreieck-Resend-Contract-Probe/1.0"));
    assert.equal(calls[0].body, calls[1].body);
    assert.notEqual(calls[1].body, calls[2].body);

    const original = JSON.parse(calls[0].body);
    const changed = JSON.parse(calls[2].body);
    assert.deepEqual(original, FIXED_PROBE_PAYLOAD);
    assert.deepEqual(
      Object.keys(original).filter(
        (key) => JSON.stringify(original[key]) !== JSON.stringify(changed[key]),
      ),
      ["text"],
    );
    assert.equal(changed.text, "Synthetische Vertragsprobe B.");

    assert.equal(statSync(result.captureDirectory).mode & 0o777, 0o700);
    const files = captureTree(result.captureDirectory);
    assert.deepEqual(files.map(({ name }) => name), [
      "response-01.body.raw",
      "response-01.meta.json",
      "response-02.body.raw",
      "response-02.meta.json",
      "response-03.body.raw",
      "response-03.meta.json",
    ]);
    assert.ok(files.every(({ mode }) => mode === 0o600));
    assert.deepEqual(
      files.filter(({ name }) => name.endsWith(".body.raw")).map(({ bytes }) => bytes),
      rawBodies.map((body) => Buffer.from(body, "utf8")),
    );
    const thirdMeta = JSON.parse(readFileSync(join(result.captureDirectory, "response-03.meta.json"), "utf8"));
    assert.equal(thirdMeta.status, 409);
    assert.equal(thirdMeta.statusText, "Conflict");
    assert.ok(thirdMeta.headers.some(([name, value]) => name === "x-request-id" && value === "request-3"));

    const persisted = Buffer.concat(files.map(({ bytes }) => bytes)).toString("utf8");
    assert.doesNotMatch(persisted, new RegExp(SECRET));
    assert.doesNotMatch(persisted, new RegExp(REQUEST_KEY));
    assert.doesNotMatch(persisted, /Authorization/i);
  });
});

await test("erster Nicht-2xx stoppt sofort nach genau einer privat erfassten Antwort", async () => {
  await withPrivateRoot(async (root) => {
    let calls = 0;
    const result = await runResendContractProbe({
      apiKey: SECRET,
      outputRoot: root,
      uuidFactory: () => REQUEST_KEY,
      signalFactory: () => undefined,
      async fetchImpl() {
        calls += 1;
        return mockResponse(503, "temporarily unavailable", { "retry-after": "1" }, "Unavailable");
      },
    });
    assert.equal(result.exitCode, EXIT.NON_2XX);
    assert.equal(result.responseCount, 1);
    assert.equal(calls, 1);
    assert.deepEqual(
      captureTree(result.captureDirectory).map(({ name }) => name),
      ["response-01.body.raw", "response-01.meta.json"],
    );
  });
});

await test("Netzwerkfehler wird niemals automatisch wiederholt", async () => {
  await withPrivateRoot(async (root) => {
    let calls = 0;
    await assert.rejects(
      runResendContractProbe({
        apiKey: SECRET,
        outputRoot: root,
        uuidFactory: () => REQUEST_KEY,
        signalFactory: () => undefined,
        async fetchImpl() {
          calls += 1;
          throw new Error(`mock network error ${SECRET}`);
        },
      }),
      (error) => error instanceof ResendProbeFailure && error.code === "NETWORK_FAILED",
    );
    assert.equal(calls, 1);
  });
});

await test("CLI bleibt ohne exakt einen Einmalmarker vor Keychain, Dateien und Netzwerk wirkungslos", async () => {
  await withPrivateRoot(async (root) => {
    for (const argv of [[], ["--execute"], [EXECUTION_MARKER, "extra"]]) {
      let keychainReads = 0;
      let networkCalls = 0;
      const lines = [];
      const code = await main(argv, {
        outputRoot: root,
        keychainReader() { keychainReads += 1; return SECRET; },
        async fetchImpl() { networkCalls += 1; throw new Error("must not run"); },
        log: (line) => lines.push(line),
        logError: (line) => lines.push(line),
      });
      assert.equal(code, EXIT.NOT_STARTED);
      assert.equal(keychainReads, 0);
      assert.equal(networkCalls, 0);
      assert.equal(readdirSync(root).length, 0);
      assert.doesNotMatch(lines.join("\n"), new RegExp(SECRET));
      assert.doesNotMatch(lines.join("\n"), new RegExp(REQUEST_KEY));
    }
  });
});

await test("fehlender oder leerer Keychain-Wert stoppt fail-closed vor Netzwerk und Rohablage", async () => {
  await withPrivateRoot(async (root) => {
    for (const keychainReader of [
      () => { throw new Error(`missing ${SECRET}`); },
      () => "",
    ]) {
      let networkCalls = 0;
      const lines = [];
      const code = await main([EXECUTION_MARKER], {
        outputRoot: root,
        keychainReader,
        async fetchImpl() { networkCalls += 1; throw new Error("must not run"); },
        log: (line) => lines.push(line),
        logError: (line) => lines.push(line),
      });
      assert.equal(code, EXIT.KEYCHAIN_MISSING);
      assert.equal(networkCalls, 0);
      assert.equal(readdirSync(root).length, 0);
      assert.doesNotMatch(lines.join("\n"), new RegExp(SECRET));
      assert.doesNotMatch(lines.join("\n"), /missing/i);
    }
  });
});

await test("Rohablage im Repository wird vor dem ersten Request abgelehnt", async () => {
  let networkCalls = 0;
  await assert.rejects(
    runResendContractProbe({
      apiKey: SECRET,
      outputRoot: fileURLToPath(new URL(".", import.meta.url)),
      uuidFactory: () => REQUEST_KEY,
      signalFactory: () => undefined,
      async fetchImpl() {
        networkCalls += 1;
        throw new Error("must not run");
      },
    }),
    (error) => error instanceof ResendProbeFailure && error.code === "PRIVATE_CAPTURE_FAILED",
  );
  assert.equal(networkCalls, 0);
});

await test("Keychain-Leser adressiert genau einen Service und Account und schreibt nie", async () => {
  const calls = [];
  const value = readResendApiKey({
    platform: "darwin",
    securityRun(file, argv, options) {
      calls.push({ file, argv, options });
      return { status: 0, signal: null, stdout: `${SECRET}\n`, stderr: "" };
    },
  });
  assert.equal(value, SECRET);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "/usr/bin/security");
  assert.deepEqual(calls[0].argv, [
    "find-generic-password",
    "-s",
    RESEND_KEYCHAIN.service,
    "-a",
    RESEND_KEYCHAIN.account,
    "-w",
  ]);
  assert.equal(calls[0].options.shell, false);
  assert.ok(!calls[0].argv.includes("add-generic-password"));

  let invoked = false;
  assert.throws(
    () => readResendApiKey({
      platform: "linux",
      securityRun() { invoked = true; },
    }),
    (error) => error instanceof ResendProbeFailure && error.code === "RESEND_KEYCHAIN_UNAVAILABLE",
  );
  assert.equal(invoked, false);
});

await test("sensible Echo-Antwort wird vor jeder Persistenz und ohne Log-Leak gestoppt", async () => {
  await withPrivateRoot(async (root) => {
    const lines = [];
    let calls = 0;
    const code = await main([EXECUTION_MARKER], {
      outputRoot: root,
      keychainReader: () => SECRET,
      uuidFactory: () => REQUEST_KEY,
      signalFactory: () => undefined,
      async fetchImpl() {
        calls += 1;
        return mockResponse(200, `echo ${SECRET} ${REQUEST_KEY}`);
      },
      log: (line) => lines.push(line),
      logError: (line) => lines.push(line),
    });
    assert.equal(code, EXIT.SENSITIVE_ECHO);
    assert.equal(calls, 1);
    const captureDirectories = readdirSync(root);
    assert.equal(captureDirectories.length, 1);
    assert.equal(readdirSync(join(root, captureDirectories[0])).length, 0);
    assert.doesNotMatch(lines.join("\n"), new RegExp(SECRET));
    assert.doesNotMatch(lines.join("\n"), new RegExp(REQUEST_KEY));
  });
});

await test("Package verdrahtet nur den Mocktest in die Standardsuite und haelt den Live-Marker draussen", async () => {
  const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["probe:resend-contract"], "node tools/resend_contract_probe.mjs");
  assert.equal(packageJson.scripts["test:resend-contract-probe"], "node resend_contract_probe_test.mjs");
  assert.match(packageJson.scripts.test, /npm run test:resend-contract-probe/);
  assert.doesNotMatch(packageJson.scripts.test, /tools\/resend_contract_probe\.mjs/);
  assert.doesNotMatch(packageJson.scripts["probe:resend-contract"], new RegExp(EXECUTION_MARKER));

  const source = readFileSync(new URL("./tools/resend_contract_probe.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /add-generic-password/);
  assert.equal((source.match(/find-generic-password/g) || []).length, 1);
  assert.equal((source.match(/https:\/\/api\.resend\.com\/emails/g) || []).length, 1);
});

console.log(`resend_contract_probe_test: ${tests}/${tests} gruen (nur lokale Mocks, keine Aussenwirkung)`);

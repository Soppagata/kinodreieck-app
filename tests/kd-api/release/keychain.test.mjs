import assert from "node:assert/strict";
import test from "node:test";
import {
  createMacKeychain,
  executeKeyLifecycle,
} from "../../../tools/kd-api-keychain.mjs";

const ids = {
  operation: "11111111-1111-4111-8111-111111111111",
  account: "22222222-2222-4222-8222-222222222222",
  access: "33333333-3333-4333-8333-333333333333",
  rotate: "44444444-4444-4444-8444-444444444444",
  revoke: "55555555-5555-4555-8555-555555555555",
};

function memoryKeychain() {
  const entries = new Map();
  return {
    entries,
    read(account, { missing = false } = {}) {
      if (!entries.has(account)) {
        if (missing) return null;
        throw new Error("missing");
      }
      return entries.get(account);
    },
    write(account, value) { entries.set(account, value); },
    delete(account, { missing = false } = {}) {
      if (!entries.delete(account) && !missing) throw new Error("missing");
    },
  };
}

function metadataFrom(payload, { revoked = false } = {}) {
  return {
    operationId: payload.p_operation_id,
    accessId: payload.p_access_id || ids.access,
    accountId: payload.p_account_id || ids.account,
    assistantProfile: "personal_owner",
    permissions: ["library.read"],
    keyFingerprint: payload.p_key_fingerprint || payload.p_new_key_fingerprint || "kd_0123456789abcdef",
    keyEpoch: payload.p_expected_key_epoch === undefined ? 0 : payload.p_expected_key_epoch + 1,
    createdAt: "2026-09-26T12:00:00.000Z",
    expiresAt: null,
    revokedAt: revoked ? "2026-09-26T13:00:00.000Z" : null,
  };
}

function jsonResponse(value) {
  return { status: 200, async json() { return value; } };
}

test("Issue hält Rohkey bei unklarem Ausgang fest und wiederholt Digest plus Operation", async () => {
  const keychain = memoryKeychain();
  const payloads = [];
  const args = [
    "issue", "--base-url", "https://example.supabase.co",
    "--keychain-account", "owner-assistant", "--account-id", ids.account,
    "--assistant-profile", "personal_owner", "--permissions", "library.read",
  ];
  await assert.rejects(() => executeKeyLifecycle(args, {
    keychain, adminCredentialReader: () => "service-secret",
    random: () => Buffer.alloc(32, 7), uuid: () => ids.operation,
    fetchImpl: async (_url, options) => { payloads.push(JSON.parse(options.body)); throw new TypeError("offline"); },
  }), new RegExp(`operationId=${ids.operation}`));
  const pending = JSON.parse(keychain.entries.get("owner-assistant::issue-pending"));
  assert.match(pending.rawKey, /^kd_v1_/);
  assert.equal(JSON.stringify(payloads).includes(pending.rawKey), false);

  const result = await executeKeyLifecycle(args, {
    keychain, adminCredentialReader: () => "service-secret",
    random: () => { throw new Error("must reuse pending raw key"); }, uuid: () => { throw new Error("must reuse operation id"); },
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body); payloads.push(payload);
      return jsonResponse(metadataFrom(payload));
    },
  });
  assert.equal(result.operationId, ids.operation);
  assert.equal(result.keychainService, "at.kinodreieck.kd-api.access-v1");
  assert.equal(result.keychainAccount, "owner-assistant");
  assert.equal(result.keychainEnvelopeVersion, "kd-api-keychain-v1");
  assert.equal(Object.hasOwn(result, "accountId"), false);
  assert.equal(keychain.entries.has("owner-assistant::issue-pending"), false);
  const active = JSON.parse(keychain.entries.get("owner-assistant"));
  assert.deepEqual(Object.keys(active).sort(), [
    "alias", "command", "metadata", "rawKey", "request", "version",
  ]);
  assert.equal(active.metadata.accountId, ids.account);
  assert.equal(JSON.stringify(result).includes(pending.rawKey), false);
  assert.equal(payloads[0].p_key_digest, payloads[1].p_key_digest);
  assert.equal(payloads[1].p_key_digest, payloads[2].p_key_digest);
  assert.equal(payloads.every((payload) => !Object.values(payload).includes(pending.rawKey)), true);
});

test("Rotate und Revoke verwenden exakt die eingefrorenen RPC-Payloads", async () => {
  const keychain = memoryKeychain();
  keychain.entries.set("owner-assistant", JSON.stringify({
    version: "kd-api-keychain-v1", alias: "owner-assistant", command: "issue",
    request: { operationId: ids.operation }, rawKey: "kd_v1_old",
  }));
  const calls = [];
  const fetchImpl = async (url, options) => {
    const payload = JSON.parse(options.body); calls.push([url, payload]);
    return jsonResponse(metadataFrom(payload, { revoked: url.endsWith("kd_api_revoke_access_v1") }));
  };
  await executeKeyLifecycle([
    "rotate", "--base-url", "https://example.supabase.co", "--keychain-account", "owner-assistant",
    "--access-id", ids.access, "--expected-key-epoch", "0", "--operation-id", ids.rotate,
  ], {
    keychain, adminCredentialReader: () => "service-secret", fetchImpl,
    random: () => Buffer.alloc(32, 8), uuid: () => { throw new Error("explicit id"); },
  });
  assert.deepEqual(Object.keys(calls[0][1]).sort(), [
    "p_access_id", "p_expected_key_epoch", "p_new_key_digest", "p_new_key_fingerprint", "p_operation_id",
  ]);

  await executeKeyLifecycle([
    "revoke", "--base-url", "https://example.supabase.co", "--keychain-account", "owner-assistant",
    "--access-id", ids.access, "--expected-key-epoch", "1", "--reason-code", "OWNER_REQUEST",
    "--operation-id", ids.revoke,
  ], { keychain, adminCredentialReader: () => "service-secret", fetchImpl });
  assert.deepEqual(Object.keys(calls.at(-1)[1]).sort(), [
    "p_access_id", "p_expected_key_epoch", "p_operation_id", "p_reason_code",
  ]);
  assert.equal(keychain.entries.has("owner-assistant"), false);
  assert.equal(keychain.entries.has("owner-assistant::revoked"), true);
});

test("macOS-Keychain-Writer transportiert Geheimnis nur über stdin", () => {
  const seen = [];
  const keychain = createMacKeychain({ run(command, args, options) {
    seen.push({ command, args, options });
    return { status: 0, stdout: "" };
  } });
  const secret = "kd_v1_never-in-argv";
  keychain.write("fixture", secret);
  assert.equal(seen[0].args.includes(secret), false);
  assert.ok(seen[0].args.includes("at.kinodreieck.kd-api.access-v1"));
  assert.equal(seen[0].args.at(-1), "-w");
  assert.equal(seen[0].options.input, `${secret}\n`);
});

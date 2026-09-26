import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  KD_API_KEYCHAIN_SERVICE,
  createCredentialProvider,
  projectKeychainCredential,
} from "../src/credentials.mjs";

const alias = "owner-assistant";
const rawKey = `kd_v1_${"A".repeat(43)}`;
const ids = {
  operation: "11111111-1111-4111-8111-111111111111",
  access: "22222222-2222-4222-8222-222222222222",
  account: "33333333-3333-4333-8333-333333333333",
};
const now = Date.parse("2026-09-26T12:00:00.000Z");

function fingerprint(key) {
  return `kd_${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

function record(command = "issue") {
  const request = command === "issue"
    ? { operationId: ids.operation, accountId: ids.account, assistantProfile: "personal_owner", permissions: ["library.*"], expiresAt: null, label: null }
    : { operationId: ids.operation, accessId: ids.access, expectedKeyEpoch: 2 };
  return {
    version: "kd-api-keychain-v1",
    service: KD_API_KEYCHAIN_SERVICE,
    alias,
    command,
    request,
    rawKey,
    metadata: {
      operationId: ids.operation,
      accessId: ids.access,
      accountId: ids.account,
      assistantProfile: "personal_owner",
      permissions: ["library.*"],
      keyFingerprint: fingerprint(rawKey),
      keyEpoch: command === "rotate" ? 3 : 0,
      createdAt: "2026-09-26T10:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
    },
  };
}

function privateSafeFailure(candidate) {
  assert.throws(
    () => projectKeychainCredential(JSON.stringify(candidate), { alias, now }),
    (error) => error.message === "KD_API_KEYCHAIN_ACTIVE_RECORD_INVALID"
      && !error.message.includes(rawKey) && !error.message.includes(ids.account),
  );
}

test("B3 keychain handoff projects only active rawKey", async (t) => {
  await t.test("accepts exact active issue and rotate envelopes", async () => {
    for (const command of ["issue", "rotate"]) {
      const envelope = JSON.stringify(record(command));
      let lookup;
      const provider = createCredentialProvider({
        KD_API_KEYCHAIN_SERVICE,
        KD_API_KEYCHAIN_ACCOUNT: alias,
      }, {
        keychainRead: async (service, account) => {
          lookup = { service, account };
          return envelope;
        },
        now: () => now,
      });
      assert.equal(await provider(), rawKey);
      assert.deepEqual(lookup, { service: KD_API_KEYCHAIN_SERVICE, account: alias });
    }
  });

  await t.test("rejects pending, revoked and mismatched active records without reading", async () => {
    for (const suffix of ["issue-pending", "rotate-pending", "revoke-pending", "revoked"]) {
      let read = false;
      assert.throws(() => createCredentialProvider({
        KD_API_KEYCHAIN_SERVICE,
        KD_API_KEYCHAIN_ACCOUNT: `${alias}::${suffix}`,
      }, { keychainRead: async () => { read = true; return JSON.stringify(record()); } }), /KD_API_KEYCHAIN_ACCOUNT_INACTIVE/);
      assert.equal(read, false);
    }
    assert.throws(() => createCredentialProvider({
      KD_API_KEYCHAIN_SERVICE: "at.example.unknown",
      KD_API_KEYCHAIN_ACCOUNT: alias,
    }), /KD_API_KEYCHAIN_SERVICE_INVALID/);
    privateSafeFailure({ ...record(), alias: "other-alias" });
    privateSafeFailure({ ...record(), command: "revoke" });
  });

  await t.test("rejects inactive metadata, fingerprint drift and unknown JSON", () => {
    const revoked = record();
    revoked.metadata.revokedAt = "2026-09-26T11:00:00.000Z";
    privateSafeFailure(revoked);
    const expired = record();
    expired.metadata.expiresAt = "2026-09-26T11:00:00.000Z";
    privateSafeFailure(expired);
    const drifted = record();
    drifted.metadata.keyFingerprint = "kd_0000000000000000";
    privateSafeFailure(drifted);
    for (const value of ["{}", "[]", '"json-string"', "{broken"]) {
      assert.throws(() => projectKeychainCredential(value, { alias, now }), /KD_API_KEYCHAIN_ACTIVE_RECORD_INVALID/);
    }
  });

  await t.test("keeps controlled raw environment and 0600 file sources compatible", async () => {
    assert.equal(await createCredentialProvider({ KD_API_KEY: rawKey })(), rawKey);
    assert.equal(projectKeychainCredential(rawKey, { alias, now }), rawKey);
    const directory = await mkdtemp(join(tmpdir(), "kd-assistant-credential-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, "key");
    await writeFile(path, `${rawKey}\n`, { mode: 0o600 });
    await chmod(path, 0o600);
    assert.equal(await createCredentialProvider({ KD_API_KEY_FILE: path })(), rawKey);
  });
});

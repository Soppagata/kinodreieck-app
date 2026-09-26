import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.KD_API_INTEGRATION_BASE_URL;
const credential = process.env.KD_API_INTEGRATION_KEY;
const required = process.env.KD_API_E6_REQUIRED === "1";

test("local assistant client -> kd-api -> PostgreSQL revision/idempotency roundtrip", {
  skip: !baseUrl || !credential ? "E6 supplies the local API URL and synthetic fixture key" : false,
}, async () => {
  const { createKdApiClient } = await import("../../../integrations/kd-assistant/src/client.mjs");
  const client = createKdApiClient({ baseUrl, credential: async () => credential, fetch });
  const before = await client.call("library_search", { limit: 20 });
  assert.ok(Number.isInteger(before.revision));
  const operationId = randomUUID(); const id = `e6-${operationId}`;
  const created = await client.call("library_add", { operationId, expectedRevision: before.revision,
    item: { id, titel: "Lokaler E6 Vertrag", typ: "film", jahr: 2026 } });
  assert.equal(created.status, "succeeded");
  const replayed = await client.call("library_add", { operationId, expectedRevision: before.revision,
    item: { id, titel: "Lokaler E6 Vertrag", typ: "film", jahr: 2026 } });
  assert.equal(replayed.replayed, true);
  const read = await client.call("library_get", { id });
  assert.equal(read.item.id, id);
  const conflict = await client.call("library_update", { id, operationId: randomUUID(), expectedRevision: before.revision,
    patch: { notiz: "muss konkurrieren" } }).catch((error) => error);
  assert.equal(conflict.code, "REVISION_CONFLICT");
});

if (required && (!baseUrl || !credential)) {
  throw new Error("KD_API_E6_REQUIRED needs KD_API_INTEGRATION_BASE_URL and KD_API_INTEGRATION_KEY");
}

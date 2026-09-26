import assert from "node:assert/strict";
import test from "node:test";
import { verifyKdApiFunctionSetSnapshot } from "../../../tools/kd-api-function-set-readback.mjs";

const valid = [
  { slug: "ai-task", status: "ACTIVE", verify_jwt: true, version: 101 },
  { slug: "kd-api", status: "ACTIVE", verify_jwt: false, version: 1 },
  { slug: "unrelated-function", status: "ACTIVE", verify_jwt: false, version: 9 },
];

test("Management-Readback bindet den tatsächlichen Zweifunctionsatz und seine JWT-Modi", () => {
  const result = verifyKdApiFunctionSetSnapshot(valid);
  assert.deepEqual(result.functions, [
    { slug: "ai-task", status: "ACTIVE", verifyJwt: true, version: 101 },
    { slug: "kd-api", status: "ACTIVE", verifyJwt: false, version: 1 },
  ]);
  assert.throws(() => verifyKdApiFunctionSetSnapshot(
    valid.map((entry) => entry.slug === "ai-task" ? { ...entry, verify_jwt: false } : entry),
  ), /FUNCTION_SET_INVALID_ai-task/);
  assert.throws(() => verifyKdApiFunctionSetSnapshot(
    valid.filter((entry) => entry.slug !== "kd-api"),
  ), /FUNCTION_SET_MISSING_kd-api/);
});

import { runMotnSync } from "./runner.js";

function equal(left, right) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export function createMotnHandler({ serviceKeys = [], apiKey = "", fetchImpl = fetch, now = Date.now, rpc } = {}) {
  return async (request) => {
    if (request.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    const key = request.headers.get("apikey") || "";
    const bearer = request.headers.get("authorization") || "";
    if (request.headers.has("origin") || !serviceKeys.some(expected => typeof expected === "string" && expected
      && equal(key, expected) && equal(bearer, `Bearer ${expected}`))) {
      return json({ ok: false, code: "FORBIDDEN" }, 403);
    }
    const operation = request.headers.get("x-kd-motn");
    if (!["scheduled-at-v1", "usage-at-v1"].includes(operation)) {
      return json({ ok: false, code: "INVALID_OPERATION" }, 400);
    }
    if ((await request.text()) !== "") return json({ ok: false, code: "UNEXPECTED_BODY" }, 400);
    if (typeof rpc !== "function") return json({ ok: false, code: "MOTN_STORAGE_UNAVAILABLE" }, 503);
    try {
      if (operation === "usage-at-v1") {
        return json({ ok: true, status: "read", providerRequests: 0, usage: await rpc("kd_motn_usage_status") });
      }
      const result = await runMotnSync({ apiKey, fetchImpl, now, rpc });
      return json(result, result.ok ? 200 : 502);
    } catch { return json({ ok: false, code: "MOTN_STORAGE_FAILED" }, 502); }
  };
}

import { MOTN_CATALOGS, createMotnClient } from "../_shared/motnClient.js";
import { normalizeMotnPage } from "../_shared/motnData.js";

export async function runMotnSync({ apiKey, rpc, fetchImpl = fetch, now = Date.now, randomUUID = () => crypto.randomUUID() }) {
  if (!apiKey) return { ok: false, code: "MOTN_NOT_CONFIGURED", providerRequests: 0 };
  const token = randomUUID();
  const claim = await rpc("kd_motn_claim", { p_token: token });
  if (claim?.claimed !== true) return { ok: claim?.ok === true, status: claim?.status || "not_claimed", providerRequests: 0 };
  const client = createMotnClient({ apiKey, fetchImpl, maxRequests: 24 });
  const startedAt = now();
  let accepted = 0, skipped = 0, completed = 0;
  try {
    for (const type of ["new", "removed"]) {
      const checkpoint = claim.checkpoints[type];
      if (!checkpoint) continue;
      let cursor = checkpoint.cursor;
      for (let pages = 0; pages < 12; pages += 1) {
        if (now() - startedAt >= 90000) break;
        const reservation = await rpc("kd_motn_reserve", { p_token: token, p_kind: type });
        if (reservation?.reserved !== true) {
          if (reservation?.status !== "quota_limit") throw new Error("MOTN_RESERVATION_FAILED");
          await rpc("kd_motn_reconcile_watchmode");
          await rpc("kd_motn_finish", { p_token: token, p_status: "limited" });
          return { ok: true, status: "limited", providerRequests: client.requests, accepted, skipped, completed };
        }
        const page = await client.changes({ type, from: checkpoint.from, to: checkpoint.to, cursor, catalogs: MOTN_CATALOGS });
        const normalized = normalizeMotnPage(page, {
          type, from: checkpoint.from, to: checkpoint.to, checkedAt: new Date(now()).toISOString(), catalogs: MOTN_CATALOGS,
        });
        if (normalized.hasMore && normalized.nextCursor === cursor) throw new Error("MOTN_CURSOR_NOT_ADVANCING");
        const committed = await rpc("kd_motn_commit_page", { p_token: token, p_kind: type,
          p_cursor: cursor, p_next_cursor: normalized.nextCursor, p_records: normalized.records,
          p_skipped: normalized.skipped.length });
        if (committed?.ok !== true) throw new Error("MOTN_PAGE_NOT_COMMITTED");
        accepted += normalized.records.length; skipped += normalized.skipped.length;
        cursor = normalized.nextCursor;
        if (!normalized.hasMore) { completed += 1; break; }
      }
    }
    const status = completed === 2 ? "succeeded" : "limited";
    await rpc("kd_motn_reconcile_watchmode");
    await rpc("kd_motn_finish", { p_token: token, p_status: status });
    return { ok: true, status, providerRequests: client.requests, accepted, skipped, completed };
  } catch (error) {
    try { await rpc("kd_motn_finish", { p_token: token, p_status: "error" }); } catch { /* existing lease expires; never replay a page in this run */ }
    return { ok: false, status: "error", providerRequests: client.requests, accepted, skipped, completed,
      code: /^MOTN_[A-Z_]+$/.test(error?.code || error?.message || "") ? (error.code || error.message) : "MOTN_SYNC_FAILED" };
  }
}

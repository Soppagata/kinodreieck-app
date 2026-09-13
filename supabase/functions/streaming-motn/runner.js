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
  const prefetched = new Map();
  const finish = async (status) => {
    if ((await rpc("kd_motn_finish", { p_token: token, p_status: status }))?.ok !== true) throw new Error("MOTN_FINISH_FAILED");
    return { ok: true, status, providerRequests: client.requests, accepted, skipped, completed };
  };
  const readPage = async (type, checkpoint, cursor) => {
    if (client.requests >= 24 || now() - startedAt >= 90000) return null;
    const reservation = await rpc("kd_motn_reserve", { p_token: token, p_kind: type });
    if (reservation?.reserved !== true) {
      if (reservation?.status !== "quota_limit") throw new Error("MOTN_RESERVATION_FAILED");
      return null;
    }
    const page = await client.changes({ type, from: checkpoint.from, to: checkpoint.to, cursor, catalogs: MOTN_CATALOGS });
    const normalized = normalizeMotnPage(page, {
      type, from: checkpoint.from, to: checkpoint.to, checkedAt: new Date(now()).toISOString(), catalogs: MOTN_CATALOGS,
    });
    if (normalized.hasMore && normalized.nextCursor === cursor) throw new Error("MOTN_CURSOR_NOT_ADVANCING");
    return { normalized, hasChanges: page.changes.length > 0 || normalized.hasMore };
  };
  try {
    if (claim.mode === "probe") {
      // Read both kinds once. The same pages become the first imported pages
      // when due; a cooldown keeps the stored import high-water mark intact.
      for (const type of ["new", "removed"]) {
        const page = await readPage(type, claim.checkpoints[type], null);
        if (!page) return await finish("limited");
        prefetched.set(type, page);
      }
      const decision = await rpc("kd_motn_probe_result", { p_token: token,
        p_has_changes: [...prefetched.values()].some(page => page.hasChanges) });
      if (decision?.ok !== true || !["sync", "unchanged", "cooldown"].includes(decision.status)) throw new Error("MOTN_PROBE_NOT_COMMITTED");
      if (decision.status !== "sync") return await finish(decision.status);
    }
    for (const type of ["new", "removed"]) {
      const checkpoint = claim.checkpoints[type];
      if (!checkpoint) continue;
      if (checkpoint.done) { completed += 1; continue; }
      let cursor = checkpoint.cursor;
      for (let pages = 0; pages < 12; pages += 1) {
        const page = pages === 0 && prefetched.has(type) ? prefetched.get(type) : await readPage(type, checkpoint, cursor);
        if (!page) {
          await rpc("kd_motn_reconcile_watchmode");
          return await finish("limited");
        }
        const { normalized } = page;
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
    return await finish(status);
  } catch (error) {
    try { await rpc("kd_motn_finish", { p_token: token, p_status: "error" }); } catch { /* existing lease expires; never replay a page in this run */ }
    return { ok: false, status: "error", providerRequests: client.requests, accepted, skipped, completed,
      code: /^MOTN_[A-Z_]+$/.test(error?.code || error?.message || "") ? (error.code || error.message) : "MOTN_SYNC_FAILED" };
  }
}

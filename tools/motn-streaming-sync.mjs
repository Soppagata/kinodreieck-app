const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) {
  console.error("MotN: server configuration unavailable."); process.exit(1);
}
try {
  const response = await fetch(`${url}/functions/v1/streaming-motn`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(135000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "x-kd-motn": "scheduled-at-v1" },
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true || !["succeeded","limited","not_due","busy","unchanged","cooldown"].includes(body.status)
      || !Number.isSafeInteger(body.providerRequests) || body.providerRequests < 0 || body.providerRequests > 24) {
    console.error(`MotN: sync failed (HTTP ${response.status}); no retry.`); process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ status: body.status, providerRequests: body.providerRequests,
      accepted: body.accepted ?? 0, skipped: body.skipped ?? 0, completed: body.completed ?? 0 }));
  }
} catch {
  console.error("MotN: response unavailable; no retry. Completed pages remain stored."); process.exitCode = 1;
}

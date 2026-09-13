// Server-side JSON source for the later staging dashboard. Never query MotN.
const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) {
  console.error("MotN: server configuration unavailable."); process.exit(1);
}
try {
  const response = await fetch(`${url}/functions/v1/streaming-motn`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "x-kd-motn": "usage-at-v1" },
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true || body.status !== "read" || body.providerRequests !== 0
      || body.usage?.format !== 1 || body.usage.source !== "kinodreieck-reservations") throw new Error("invalid response");
  console.log(JSON.stringify(body.usage, null, 2));
} catch {
  console.error("MotN: usage unavailable; no provider request or retry."); process.exitCode = 1;
}

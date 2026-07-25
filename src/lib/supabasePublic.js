export function istSupabaseProjektUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(url || "").trim().replace(/\/+$/, ""));
}

export function publicSupabaseHeaders(key, extra = {}) {
  const sauber = String(key || "").trim();
  const headers = { ...extra, apikey: sauber };
  if (/^eyJ/.test(sauber)) headers.Authorization = "Bearer " + sauber;
  return headers;
}

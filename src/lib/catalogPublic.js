/* Öffentliche Demo-Nebenbereiche aus kd_store. Dieser Übergangspfad verwendet
   nur den Katalogzugang und sendet niemals persönliche Header. Shared Blogs
   liegen nicht mehr hier; dafür gibt es services/sharedArticles.js. */
import { SB_DEFAULT_URL, SB_DEFAULT_ANON } from "./supabaseDefaults.js";
import { getKatalogZugang } from "./katalog.js";
import { istSupabaseProjektUrl, publicSupabaseHeaders } from "./supabasePublic.js";

const TABLE = "kd_store";

function publicConnection() {
  const katalog = getKatalogZugang();
  return {
    url: (katalog.url || SB_DEFAULT_URL || "").replace(/\/+$/, ""),
    key: katalog.key || SB_DEFAULT_ANON || "",
  };
}

export async function ladeDemoBlobs() {
  const { url, key } = publicConnection();
  if (!istSupabaseProjektUrl(url) || !key) {
    throw new Error("Demo-Quelle nicht konfiguriert (Supabase-URL/Publishable-Key).");
  }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
  try {
    const res = await fetch(url + "/rest/v1/" + TABLE + "?scope=eq.demo&select=key,value", {
      headers: publicSupabaseHeaders(key),
      signal: ctrl ? ctrl.signal : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* leerer Body */ }
    if (!res.ok || !Array.isArray(data)) {
      const error = new Error("Demo-Read fehlgeschlagen: HTTP " + res.status);
      error.status = res.status;
      throw error;
    }
    const blobs = {};
    for (const row of data) {
      if (row && typeof row.key === "string") {
        blobs[row.key] = row.value == null ? null : String(row.value);
      }
    }
    return blobs;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

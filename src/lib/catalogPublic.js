/* Öffentliche Katalog-Nebenbereiche aus kd_store. Diese Reads verwenden nur den
   Katalogzugang und senden niemals persönliche Owner- oder Sync-Header. */
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

export async function ladeSharedBlogs() {
  const { url, key } = publicConnection();
  if (!istSupabaseProjektUrl(url) || !key) {
    return { ok: false, blogs: [], message: "nicht konfiguriert" };
  }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
  try {
    const res = await fetch(url + "/rest/v1/" + TABLE + "?scope=eq.shared&select=owner,key,value,author,updated_at", {
      headers: publicSupabaseHeaders(key),
      signal: ctrl ? ctrl.signal : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* leerer Body */ }
    if (!res.ok || !Array.isArray(data)) {
      return { ok: false, blogs: [], status: res.status };
    }
    const blogs = [];
    for (const row of data) {
      if (!row || typeof row.key !== "string") continue;
      let artikel = null;
      try { artikel = JSON.parse(row.value); } catch { continue; }
      if (!artikel || !artikel.titel) continue;
      blogs.push({
        db_owner: row.owner,
        db_key: row.key,
        author: row.author || artikel.autor || row.owner,
        updated_at: row.updated_at || null,
        artikel,
      });
    }
    return { ok: true, blogs };
  } catch (error) {
    return { ok: false, blogs: [], error: String(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

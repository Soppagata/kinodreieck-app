/* Öffentliche Blog-Projektionen.
   --------------------------------
   Ein privater Artikel lebt weiterhin ausschließlich im persönlichen
   `kd:artikel`-Topf. Dieser Dienst verwaltet nur seine veröffentlichte Kopie:

   - list(): öffentlich und immer OHNE Sitzungstoken
   - publish()/unpublish(): mit der normalen Account-Sitzung
   - die Account-ID wird nie gesendet; die Datenbank setzt sie aus auth.uid()

   Shared Blogs sind damit weder persönlicher Storage noch Filmkatalog. Die
   eigene kleine Grenze ersetzt beide früheren Umwege über storageService,
   catalogService und den geheimen Legacy-Sync-Schlüssel. */
import { runtimeConfig } from "../config/runtime.js";
import { authDriver, authService } from "./auth.js";
import { BoundaryError, ERROR_CODES, errorFromStatus, normalizeBoundaryError } from "./errors.js";
import { istSupabaseProjektUrl, publicSupabaseHeaders } from "../lib/supabasePublic.js";

const TABLE = "kd_shared_articles";
const LIST_RPC = "kd_list_shared_articles";
const MAX_REFERENZEN = 15;

function text(wert) { return String(wert == null ? "" : wert).trim(); }
function q(wert) { return encodeURIComponent(String(wert)); }

/* Ausschließlich die öffentliche Projektion erzeugen. Lokale IDs innerhalb
   der Referenzliste, Abgleichfelder und Publikationszustände verlassen das
   Gerät nicht. */
export function sharedArticlePayload(article) {
  const titel = text(article?.titel);
  const autor = text(article?.autor);
  const inhalt = String(article?.text == null ? "" : article.text);
  if (!text(article?.id) || !titel || !autor || !inhalt.trim()) {
    throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
      source: "shared-articles",
      operation: "article.project",
      reason: "invalid-article",
    });
  }
  return {
    id: text(article.id),
    titel,
    autor,
    text: inhalt,
    geordnet: !!article.geordnet,
    erstellt_am: article.erstellt_am || null,
    liste: (Array.isArray(article.liste) ? article.liste : [])
      .slice(0, MAX_REFERENZEN)
      .map((eintrag) => ({
        eingabe: text(eintrag?.eingabe),
        jahr: eintrag?.jahr == null ? null : Number(eintrag.jahr),
        typ: text(eintrag?.typ) || null,
      }))
      .filter((eintrag) => !!eintrag.eingabe),
  };
}

function parsePublicRows(data) {
  if (!Array.isArray(data)) {
    throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
      source: "shared-articles",
      operation: "article.list",
      reason: "rows-not-array",
    });
  }
  const blogs = [];
  for (const row of data) {
    let artikel = row?.payload;
    if (typeof artikel === "string") {
      try { artikel = JSON.parse(artikel); } catch { continue; }
    }
    if (!artikel || typeof artikel !== "object" || !text(artikel.titel)) continue;
    const publicationId = text(row.publication_id);
    if (!publicationId) continue;
    blogs.push({
      publication_id: publicationId,
      /* Kompatibilitätsfelder für bereits exportierte lokale Snapshots. Sie
         enthalten keine Account-ID; `publication_id` ist die öffentliche,
         zufällige Identität der Projektion. */
      db_owner: "public",
      db_key: publicationId,
      author: text(row.author) || text(artikel.autor) || "?",
      updated_at: row.updated_at || null,
      artikel,
    });
  }
  return blogs;
}

export function createSharedArticlesService({
  config = runtimeConfig,
  auth = authService,
  getAccessToken = (options) => authDriver.getAccessToken(options),
  fetchImpl = null,
} = {}) {
  const basis = text(config.supabaseUrl).replace(/\/+$/, "");
  const publishableKey = text(config.supabasePublishableKey);

  function konfiguriert() {
    return istSupabaseProjektUrl(basis) && publishableKey.length > 0;
  }
  function netz() {
    return fetchImpl || (typeof fetch === "function" ? fetch : null);
  }
  function kontoId() {
    const snapshot = auth?.getSnapshot?.();
    const id = text(snapshot?.account?.id);
    if (snapshot?.mode !== "account" || !id) {
      throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, {
        source: "shared-articles",
        operation: "session.require-account",
      });
    }
    return id;
  }
  function konfigurationVerlangen(operation) {
    if (!konfiguriert()) {
      throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
        source: "shared-articles",
        operation,
        reason: "unconfigured",
      });
    }
    const f = netz();
    if (!f) {
      throw new BoundaryError(ERROR_CODES.OFFLINE, {
        source: "shared-articles",
        operation,
        reason: "fetch-unavailable",
      });
    }
    return f;
  }

  async function publicRequest() {
    const operation = "article.list";
    const f = konfigurationVerlangen(operation);
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
    try {
      const res = await f(`${basis}/rest/v1/rpc/${LIST_RPC}`, {
        method: "POST",
        headers: { ...publicSupabaseHeaders(publishableKey), "Content-Type": "application/json" },
        body: "{}",
        signal: ctrl?.signal,
      });
      let data = null;
      try { data = await res.json(); } catch { /* wird unten validiert */ }
      if (!res.ok) throw errorFromStatus(res.status, { source: "shared-articles", operation });
      return parsePublicRows(data);
    } catch (error) {
      throw normalizeBoundaryError(error, { source: "shared-articles", operation });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* Accountwechsel-Schutz wie beim persönlichen Treiber: Vor Token, nach Token
     und nach Request muss dieselbe Konto-ID gelten. Eine verspätete Antwort von
     Konto A darf im Zustand von Konto B nicht als Erfolg ankommen. */
  async function accountRequest(method, path, {
    body = null,
    prefer = null,
    operation,
    erneuert = false,
    expectedAccountId = null,
  } = {}) {
    const accountId = kontoId();
    if (expectedAccountId && expectedAccountId !== accountId) {
      throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, {
        source: "shared-articles", operation, reason: "account-changed",
      });
    }
    const f = konfigurationVerlangen(operation);
    const token = await getAccessToken({ erzwingeErneuerung: erneuert });
    if (!token || kontoId() !== accountId) {
      throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, {
        source: "shared-articles", operation, reason: "missing-or-changed-session",
      });
    }
    const headers = {
      apikey: publishableKey,
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    };
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
    try {
      const res = await f(`${basis}/rest/v1/${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl?.signal,
      });
      let data = null;
      try { data = await res.json(); } catch { /* 204 */ }
      if (kontoId() !== accountId) {
        throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, {
          source: "shared-articles", operation, reason: "account-changed",
        });
      }
      if (res.status === 401 && !erneuert) {
        return accountRequest(method, path, {
          body, prefer, operation, erneuert: true, expectedAccountId: accountId,
        });
      }
      if (!res.ok) throw errorFromStatus(res.status, { source: "shared-articles", operation });
      return { status: res.status, data };
    } catch (error) {
      throw normalizeBoundaryError(error, { source: "shared-articles", operation });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return Object.freeze({
    configured: konfiguriert,
    async list() {
      if (!konfiguriert()) return { ok: false, blogs: [], reason: "unconfigured" };
      return { ok: true, blogs: await publicRequest() };
    },
    async publish(article) {
      const payload = sharedArticlePayload(article);
      const result = await accountRequest(
        "POST",
        `${TABLE}?on_conflict=account_id,article_id&select=publication_id,updated_at`,
        {
          operation: "article.publish",
          prefer: "resolution=merge-duplicates,return=representation",
          /* account_id fehlt mit Absicht: Default + Trigger beziehen sie aus
             auth.uid(); ein Client kann keine fremde Autoren-ID wählen. */
          body: { article_id: payload.id, author: payload.autor, payload },
        },
      );
      const row = Array.isArray(result.data) ? result.data[0] : null;
      return {
        ok: true,
        status: result.status,
        publicationId: text(row?.publication_id) || null,
        updatedAt: row?.updated_at || null,
      };
    },
    async unpublish(articleId) {
      const id = text(articleId);
      if (!id) {
        throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
          source: "shared-articles", operation: "article.unpublish", reason: "missing-article-id",
        });
      }
      const result = await accountRequest(
        "DELETE",
        `${TABLE}?article_id=eq.${q(id)}&select=publication_id`,
        {
          operation: "article.unpublish",
          prefer: "return=representation",
        },
      );
      return { ok: true, status: result.status };
    },
  });
}

export const sharedArticlesService = createSharedArticlesService();

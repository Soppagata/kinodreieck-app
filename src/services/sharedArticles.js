/* Veröffentlichte Blog-Projektionen für aktive KD-Konten.
   --------------------------------
   Ein privater Artikel lebt weiterhin ausschließlich im persönlichen
   `kd:artikel`-Topf. Dieser Dienst verwaltet nur seine veröffentlichte Kopie:

   - list(): die schmale veröffentlichte Projektion mit aktiver Account-Sitzung
   - publish()/unpublish()/claim(): nur mit bereiter, fachlich aktiver
     Account-Sitzung (`remoteStorage === true`)
   - die Account-ID wird nie gesendet; die Datenbank setzt sie aus auth.uid()

   Shared Blogs sind damit weder persönlicher Storage noch Filmkatalog. Die
   eigene kleine Grenze ersetzt beide früheren Umwege über storageService,
   catalogService und den geheimen Legacy-Sync-Schlüssel. */
import { runtimeConfig } from "../config/runtime.js";
import { authDriver, authService } from "./auth.js";
import { BoundaryError, ERROR_CODES, errorFromStatus, normalizeBoundaryError } from "./errors.js";
import { istSupabaseProjektUrl } from "../lib/supabasePublic.js";
import {
  BLOG_CONTRACT_VERSION,
  BLOG_LIST_DEFAULT_LIMIT,
  BLOG_LIST_MAX_LIMIT,
  BLOG_NEUTRAL_AUTHOR,
  BLOG_PUBLIC_OUTCOME,
  BLOG_RPC,
  hasBlogPublicationCapability,
  isBlogPublicCinemaTarget,
  isBlogPublicStreamingTarget,
} from "../lib/blogContract.js";

const TABLE = "kd_shared_articles";
const LIST_RPC = "kd_list_shared_articles";
const CLAIM_RPC = "kd_claim_shared_article";
const MAX_REFERENZEN = 15;

function text(wert) { return String(wert == null ? "" : wert).trim(); }
function q(wert) { return encodeURIComponent(String(wert)); }
function plain(wert) { return !!wert && typeof wert === "object" && !Array.isArray(wert); }
function exactKeys(wert, keys) {
  return plain(wert) && Object.keys(wert).length === keys.length
    && Object.keys(wert).every((key) => keys.includes(key));
}
function rpcValue(data) { return Array.isArray(data) && data.length === 1 && plain(data[0]) ? data[0] : data; }

function invalid(operation, reason) {
  return new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
    source: "shared-articles", operation, reason,
  });
}

function parseMutation(data, operationId, allowed) {
  const value = rpcValue(data);
  if (!plain(value) || value.contractVersion !== BLOG_CONTRACT_VERSION
      || text(value.operationId) !== text(operationId)
      || !allowed.includes(value.outcome)) throw invalid("blog.mutate", "invalid-v1-mutation");
  return value;
}

function parseOwnerReadback(data, privateArticleId) {
  const value = rpcValue(data);
  if (!plain(value) || value.contractVersion !== BLOG_CONTRACT_VERSION
      || text(value.privateArticleId) !== text(privateArticleId)
      || !(value.currentPublication === null || plain(value.currentPublication))
      || !(value.operation === null || plain(value.operation))
      || typeof value.legacyReloadRequired !== "boolean") {
    throw invalid("blog.owner-readback", "invalid-owner-readback");
  }
  return value;
}

function parsePublicReference(reference) {
  if (!exactKeys(reference, ["referenceId", "rank", "title", "year", "mediaType", "resolution", "sources"])
      || !text(reference.referenceId) || !Number.isInteger(reference.rank)
      || !text(reference.title)
      || !exactKeys(reference.resolution, ["status", "workKey"])
      || !exactKeys(reference.sources, ["status", "checkedAt", "validUntil", "streamingRevision", "cinemaRevision", "streaming", "cinema"])) return null;
  const streaming = Array.isArray(reference.sources.streaming) ? reference.sources.streaming : null;
  const cinema = Array.isArray(reference.sources.cinema) ? reference.sources.cinema : null;
  if (!streaming || !cinema || !streaming.every(isBlogPublicStreamingTarget)
      || !cinema.every(isBlogPublicCinemaTarget)) return null;
  return {
    referenceId: reference.referenceId, rank: reference.rank, title: reference.title,
    year: reference.year, mediaType: reference.mediaType,
    resolution: { status: reference.resolution.status, workKey: reference.resolution.workKey },
    sources: {
      status: reference.sources.status,
      checkedAt: reference.sources.checkedAt,
      validUntil: reference.sources.validUntil,
      streamingRevision: reference.sources.streamingRevision,
      cinemaRevision: reference.sources.cinemaRevision,
      streaming: streaming.map((target) => ({
        kind: target.kind, sourceId: target.sourceId, art: target.art, ref: target.ref,
        titel: target.titel, sourceRevision: target.sourceRevision,
        checkedAt: target.checkedAt, validUntil: target.validUntil,
      })),
      cinema: cinema.map((target) => ({
        kind: target.kind, art: target.art, ref: target.ref, titel: target.titel,
        sourceRevision: target.sourceRevision, checkedAt: target.checkedAt, validUntil: target.validUntil,
      })),
    },
  };
}

function parseV1Page(data) {
  const value = rpcValue(data);
  if (!plain(value) || value.contractVersion !== BLOG_CONTRACT_VERSION
      || !text(value.snapshotAt) || !Array.isArray(value.items)
      || !(value.nextCursor === null || typeof value.nextCursor === "string")
      || typeof value.complete !== "boolean") throw invalid("blog.list", "invalid-v1-page");
  const items = value.items.map((item) => {
    const article = item?.article;
    if (!exactKeys(item, ["publicationId", "shareToken", "author", "publicRevision", "contentVersion", "publishedAt", "updatedAt", "article"])
        || !exactKeys(article, ["id", "title", "text", "ordered", "references"])
        || !text(item.publicationId)
        || !text(item.shareToken) || item.author !== BLOG_NEUTRAL_AUTHOR
        || article.id !== item.publicationId || !text(article.title)
        || typeof article.text !== "string" || typeof article.ordered !== "boolean"
        || !Array.isArray(article.references)) {
      throw invalid("blog.list", "unsafe-v1-item");
    }
    const references = article.references.map(parsePublicReference);
    if (references.some((reference) => !reference)) throw invalid("blog.list", "unsafe-v1-reference");
    return {
      publicationId: item.publicationId, shareToken: item.shareToken, author: item.author,
      publicRevision: item.publicRevision, contentVersion: item.contentVersion,
      publishedAt: item.publishedAt, updatedAt: item.updatedAt,
      article: { id: article.id, title: article.title, text: article.text, ordered: article.ordered, references },
    };
  });
  return { ...value, items };
}

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
    const shareToken = text(row.share_token);
    if (!publicationId || !shareToken) continue;
    blogs.push({
      publication_id: publicationId,
      share_token: shareToken,
      /* Kompatibilitätsfelder für bereits exportierte lokale Snapshots. Sie
         enthalten keine Account-ID; der Upload-Token ist die öffentliche,
         zufällige Identität für die einmalige Übernahme. */
      db_owner: "public",
      db_key: shareToken,
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
  getStoredAccountId = () => authDriver.konto()?.id || null,
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
    if (snapshot?.state !== "ready" || snapshot?.capabilities?.remoteStorage !== true) {
      throw new BoundaryError(ERROR_CODES.FORBIDDEN, {
        source: "shared-articles",
        operation: "session.require-capability",
        reason: "remoteStorage",
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

  /* Accountwechsel-/Widerrufsschutz wie beim persönlichen Treiber: Vor Token,
     nach Token und nach Request müssen dieselbe Konto-ID UND die aktive
     Remote-Capability gelten. Eine verspätete Antwort von Konto A oder aus der
     Zeit vor einem Widerruf darf nicht als Erfolg ankommen. */
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
    const token = await getAccessToken({
      erzwingeErneuerung: erneuert,
      erwarteteKontoId: accountId,
    });
    if (!token || kontoId() !== accountId
        || (getStoredAccountId?.() && text(getStoredAccountId()) !== accountId)) {
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
    let requestStarted = false;
    let responseReceived = false;
    try {
      requestStarted = true;
      const res = await f(`${basis}/rest/v1/${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl?.signal,
      });
      responseReceived = true;
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
      const normalized = normalizeBoundaryError(error, { source: "shared-articles", operation });
      normalized.requestStarted = requestStarted;
      normalized.responseReceived = responseReceived;
      throw normalized;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return Object.freeze({
    configured: konfiguriert,
    async list() {
      if (!konfiguriert()) return { ok: false, blogs: [], reason: "unconfigured" };
      const result = await accountRequest("POST", `rpc/${LIST_RPC}`, {
        body: {}, operation: "article.list",
      });
      return { ok: true, blogs: parsePublicRows(result.data) };
    },
    async publish(article) {
      const payload = sharedArticlePayload(article);
      const result = await accountRequest(
        "POST",
        `${TABLE}?on_conflict=account_id,article_id&select=publication_id,share_token,updated_at`,
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
        shareToken: text(row?.share_token) || null,
        updatedAt: row?.updated_at || null,
      };
    },
    async claim(shareToken) {
      const token = text(shareToken);
      if (!token) {
        throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
          source: "shared-articles", operation: "article.claim", reason: "missing-share-token",
        });
      }
      const result = await accountRequest(
        "POST",
        `rpc/${CLAIM_RPC}`,
        {
          operation: "article.claim",
          body: { p_share_token: token },
        },
      );
      const row = Array.isArray(result.data) ? result.data[0] : null;
      if (!row) {
        throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
          source: "shared-articles", operation: "article.claim", reason: "unknown-share-token",
        });
      }
      const [blog] = parsePublicRows([row]);
      if (!blog) {
        throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
          source: "shared-articles", operation: "article.claim", reason: "invalid-claimed-row",
        });
      }
      return {
        ok: true,
        status: result.status,
        claimed: row.claimed === true,
        blog,
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
    async capability() {
      if (!konfiguriert()) return { ok: false, capability: null, reason: "unconfigured" };
      const result = await accountRequest("POST", `rpc/${BLOG_RPC.capability}`, {
        body: {}, operation: "blog.capability",
      });
      const capability = rpcValue(result.data);
      return hasBlogPublicationCapability(capability)
        ? { ok: true, capability }
        : { ok: false, capability: null, reason: "contract-mismatch" };
    },
    async listV1({ cursor = null, limit = BLOG_LIST_DEFAULT_LIMIT } = {}) {
      const boundedLimit = Number.isInteger(limit) && limit >= 1 && limit <= BLOG_LIST_MAX_LIMIT
        ? limit : BLOG_LIST_DEFAULT_LIMIT;
      const result = await accountRequest("POST", `rpc/${BLOG_RPC.list}`, {
        body: { p_request: { contractVersion: BLOG_CONTRACT_VERSION, limit: boundedLimit, cursor } },
        operation: "blog.list",
      });
      return { ok: true, page: parseV1Page(result.data) };
    },
    async publishV1(request) {
      const result = await accountRequest("POST", `rpc/${BLOG_RPC.publish}`, {
        body: { p_request: request }, operation: "blog.publish",
      });
      return parseMutation(result.data, request?.operationId, [
        BLOG_PUBLIC_OUTCOME.PUBLISHED, BLOG_PUBLIC_OUTCOME.DECISION_REQUIRED,
        BLOG_PUBLIC_OUTCOME.CONFLICT,
      ]);
    },
    async updateV1(request) {
      const result = await accountRequest("POST", `rpc/${BLOG_RPC.update}`, {
        body: { p_request: request }, operation: "blog.update",
      });
      return parseMutation(result.data, request?.operationId, [
        BLOG_PUBLIC_OUTCOME.UPDATED, BLOG_PUBLIC_OUTCOME.DECISION_REQUIRED,
        BLOG_PUBLIC_OUTCOME.CONFLICT,
      ]);
    },
    async withdrawV1(request) {
      const result = await accountRequest("POST", `rpc/${BLOG_RPC.withdraw}`, {
        body: { p_request: request }, operation: "blog.withdraw",
      });
      return parseMutation(result.data, request?.operationId, [
        BLOG_PUBLIC_OUTCOME.WITHDRAWN, BLOG_PUBLIC_OUTCOME.ABSENT,
        BLOG_PUBLIC_OUTCOME.CONFLICT,
      ]);
    },
    async ownerReadback(privateArticleId, operationId = null) {
      const id = text(privateArticleId);
      if (!id) throw invalid("blog.owner-readback", "missing-private-article-id");
      const result = await accountRequest("POST", `rpc/${BLOG_RPC.ownerReadback}`, {
        body: { p_request: {
          contractVersion: BLOG_CONTRACT_VERSION,
          privateArticleId: id,
          operationId: operationId || null,
        } },
        operation: "blog.owner-readback",
      });
      return parseOwnerReadback(result.data, id);
    },
  });
}

export const sharedArticlesService = createSharedArticlesService();

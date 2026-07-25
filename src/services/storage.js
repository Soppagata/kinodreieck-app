/* Persönliche Daten-Grenze. UI und App importieren nur diese Fassade; die alten
   Git-/Sync-Key-Treiber bleiben Legacy-Adapter und sind kein Accountmodell. */
export {
  store, K, PROGRAMM_TTL_MS,
  activeSyncStatus, activePull,
  getTreiber, setTreiber,
} from "../lib/storage.js";

import { store as personalStore } from "../lib/storage.js";
import * as git from "../lib/gitDriver.js";
import * as supabase from "../lib/supabaseDriver.js";
import {
  BoundaryError, ERROR_CODES, errorFromStatus, normalizeBoundaryError,
} from "./errors.js";

function requireSuccessfulResult(result, operation) {
  if (result?.ok) return result;
  if (Number.isFinite(result?.status) && result.status > 0) {
    throw errorFromStatus(result.status, { source: "storage", operation });
  }
  throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
    source: "storage",
    operation,
    message: "Die persönliche Datenablage ist nicht verbunden.",
    reason: "legacy-storage-unconfigured",
  });
}

export const storageService = Object.freeze({
  mode: "guest-local",
  async get(key) {
    try { return await personalStore.get(key); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "local.get" }); }
  },
  async set(key, value) {
    try { return await personalStore.set(key, value); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "local.set" }); }
  },
  async delete(key) {
    try { return await personalStore.delete(key); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "local.delete" }); }
  },
  async list() {
    try { return await personalStore.list(); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "local.list" }); }
  },
  hasLegacyGitConnection() {
    return git.isGitConfigured();
  },
  async publishSharedArticle(article) {
    try { return requireSuccessfulResult(await supabase.publishBlog(article), "article.publish"); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "article.publish" }); }
  },
  async unpublishSharedArticle(articleId) {
    try { return requireSuccessfulResult(await supabase.unpublishBlog(articleId), "article.unpublish"); }
    catch (error) { throw normalizeBoundaryError(error, { source: "storage", operation: "article.unpublish" }); }
  },
});

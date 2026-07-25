/* Gemeinsames read-only Film-/Programmwissen. Diese Grenze verwendet nur die
   öffentliche Katalogkonfiguration und sendet niemals persönliche Sync-Keys. */
import {
  getKatalogZugang, setKatalogZugang, hatKatalogZugang,
  testeKatalogZugang, ladeKatalogAsset, baueStreamingAnsichten,
} from "../lib/katalog.js";
import { ladeDemoBlobs, ladeSharedBlogs } from "../lib/catalogPublic.js";
import { errorFromStatus, normalizeBoundaryError } from "./errors.js";

export const catalogService = Object.freeze({
  getConnection: getKatalogZugang,
  setConnection: setKatalogZugang,
  hasConnection: hatKatalogZugang,
  async testConnection() {
    try {
      const result = await testeKatalogZugang();
      if (result?.ok) return result;
      if (Number.isFinite(result?.status)) {
        throw errorFromStatus(result.status, { source: "catalog", operation: "connection.test" });
      }
      throw new Error(result?.message || "Katalog-Verbindung fehlgeschlagen");
    } catch (error) {
      throw normalizeBoundaryError(error, { source: "catalog", operation: "connection.test" });
    }
  },
  buildStreamingViews: baueStreamingAnsichten,
  async loadAsset(name, options) {
    try { return await ladeKatalogAsset(name, options); }
    catch (error) { throw normalizeBoundaryError(error, { source: "catalog", operation: "asset.load" }); }
  },
  async loadDemo() {
    try { return await ladeDemoBlobs(); }
    catch (error) { throw normalizeBoundaryError(error, { source: "catalog", operation: "demo.load" }); }
  },
  async listSharedBlogs() {
    try {
      const result = await ladeSharedBlogs();
      if (!result?.ok && Number.isFinite(result?.status)) {
        throw errorFromStatus(result.status, { source: "catalog", operation: "shared-blogs.list" });
      }
      return result;
    }
    catch (error) { throw normalizeBoundaryError(error, { source: "catalog", operation: "shared-blogs.list" }); }
  },
});

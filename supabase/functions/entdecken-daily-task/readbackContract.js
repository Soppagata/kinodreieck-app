/* Inhaltsfreier Beleg fuer den unabhaengig aus der Datenbank gelesenen
   Entdecken-Wochenfeed. Titel, URLs, Konten und Providerrohtext bleiben im
   normalen Feed beziehungsweise im Server und erscheinen nie im Beleg. */

import {
  ENTDECKEN_WEEKLY_FEED_FORMAT,
  ENTDECKEN_WEEKLY_FEED_ID,
  ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS,
  ENTDECKEN_WEEKLY_REFRESH_MIN_ITEMS,
  validateEntdeckenDailyFeed,
} from "./contract.js";
import {
  ENTDECKEN_PUBLIC_FEED_FORMAT,
  ENTDECKEN_PUBLIC_FEED_ID,
  ENTDECKEN_PUBLIC_POOL_SIZE,
  ENTDECKEN_PUBLIC_SOURCE_ID,
} from "./publicChartAdapter.js";
import {
  ENTDECKEN_MIXED_FEED_FORMAT,
  ENTDECKEN_MIXED_FEED_ID,
  ENTDECKEN_MIXED_POOL_SIZE,
  ENTDECKEN_MIXED_SOURCE_ID,
} from "./publicMixAdapter.js";
import { normalizeProviderReceipt } from "../_shared/providerReceipt.js";

export const ENTDECKEN_WEEKLY_READBACK_VERSION = "entdecken-weekly-readback-v1";
export const ENTDECKEN_PUBLIC_READBACK_VERSION = "entdecken-public-weekly-readback-v1";
export const ENTDECKEN_MIXED_READBACK_VERSION = "entdecken-mixed-weekly-readback-v1";

const OPERATION_ID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!plain(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]))
}
function sameJson(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}
function freshFeed(value) {
  const checked = validateEntdeckenDailyFeed(value);
  return checked.ok
    && checked.value.format === ENTDECKEN_WEEKLY_FEED_FORMAT
    && checked.value.feedId === ENTDECKEN_WEEKLY_FEED_ID
    && checked.value.items.length >= ENTDECKEN_WEEKLY_REFRESH_MIN_ITEMS
    && checked.value.items.length <= ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS
    ? checked.value : null;
}
function evidenceCount(feed) {
  return feed.items.reduce((sum, item) => sum + item.evidence.length, 0);
}
export function normalizeEntdeckenFeedReadback(value, {
  feed,
  providerReceipt,
} = {}) {
  const checkedFeed = freshFeed(feed);
  const receipt = normalizeProviderReceipt(providerReceipt);
  if (!checkedFeed || !receipt || !exactKeys(value, [
    "schemaVersion", "feedId", "region", "isoWeek", "refreshedOn",
    "validUntil", "itemCount", "evidenceCount", "sourceCount",
    "approvedSourceCount", "providerLogId", "costUsdCent",
  ])
      || value.schemaVersion !== ENTDECKEN_WEEKLY_READBACK_VERSION
      || value.feedId !== checkedFeed.feedId || value.region !== "AT"
      || value.isoWeek !== checkedFeed.isoWeek
      || value.refreshedOn !== checkedFeed.refreshedOn
      || value.validUntil !== checkedFeed.validUntil
      || value.itemCount !== checkedFeed.items.length
      || value.evidenceCount !== evidenceCount(checkedFeed)
      || !positiveInteger(value.sourceCount)
      || value.sourceCount > value.evidenceCount
      || !positiveInteger(value.approvedSourceCount)
      || value.approvedSourceCount < value.sourceCount
      || value.approvedSourceCount > 10
      || value.providerLogId !== receipt.server.logId
      || value.costUsdCent !== receipt.server.costUsdCent) return null;
  return freezeDeep({ ...value });
}

export function normalizeEntdeckenPersistenceReadback(value, {
  expectedFeed,
  fenceToken,
  providerReceipt,
} = {}) {
  const receipt = normalizeProviderReceipt(providerReceipt);
  const persistedFeed = freshFeed(value?.feed);
  if (!receipt || !persistedFeed || !positiveInteger(fenceToken)
      || !exactKeys(value, [
        "ok", "status", "feed", "fenceToken", "providerLog", "provenance",
      ])
      || value.ok !== true || value.status !== "verified"
      || value.fenceToken !== fenceToken
      || !sameJson(persistedFeed, freshFeed(expectedFeed))
      || !exactKeys(value.providerLog, [
        "logId", "operationId", "task", "status", "model", "inputTokens",
        "outputTokens", "costUsdCent",
      ])
      || value.providerLog.logId !== receipt.server.logId
      || typeof value.providerLog.operationId !== "string"
      || !OPERATION_ID_FORM.test(value.providerLog.operationId)
      || value.providerLog.task !== "entdecken-daily"
      || value.providerLog.status !== "fertig"
      || value.providerLog.model !== receipt.model
      || value.providerLog.inputTokens !== receipt.usage.inputTokens
      || value.providerLog.outputTokens !== receipt.usage.outputTokens
      || value.providerLog.costUsdCent !== receipt.server.costUsdCent
      || !finitePositive(value.providerLog.costUsdCent)
      || !exactKeys(value.provenance, [
        "evidenceCount", "sourceCount", "approvedSourceCount",
      ])
      || !nonNegativeInteger(value.provenance.evidenceCount)
      || !positiveInteger(value.provenance.sourceCount)
      || !positiveInteger(value.provenance.approvedSourceCount)) return null;

  const readback = normalizeEntdeckenFeedReadback({
    schemaVersion: ENTDECKEN_WEEKLY_READBACK_VERSION,
    feedId: persistedFeed.feedId,
    region: persistedFeed.region,
    isoWeek: persistedFeed.isoWeek,
    refreshedOn: persistedFeed.refreshedOn,
    validUntil: persistedFeed.validUntil,
    itemCount: persistedFeed.items.length,
    evidenceCount: value.provenance.evidenceCount,
    sourceCount: value.provenance.sourceCount,
    approvedSourceCount: value.provenance.approvedSourceCount,
    providerLogId: value.providerLog.logId,
    costUsdCent: value.providerLog.costUsdCent,
  }, { feed: persistedFeed, providerReceipt: receipt });
  return readback ? freezeDeep({ feed: persistedFeed, readback }) : null;
}

/* Providerfreier Readback: Er bindet denselben gespeicherten 50er-Payload an
   Fence und owner_private-Quellenstatus, ohne einen erfundenen Kosten- oder
   Anbieterbeleg zu verlangen. */
export function normalizeEntdeckenPublicPersistenceReadback(value, {
  expectedFeed,
  fenceToken,
} = {}) {
  const persisted = validateEntdeckenDailyFeed(value?.feed);
  const expected = validateEntdeckenDailyFeed(expectedFeed);
  const mixed = persisted.ok && persisted.value.format === ENTDECKEN_MIXED_FEED_FORMAT;
  if (mixed) {
    if (!expected.ok || expected.value.format !== ENTDECKEN_MIXED_FEED_FORMAT
        || persisted.value.feedId !== ENTDECKEN_MIXED_FEED_ID
        || persisted.value.sourceId !== ENTDECKEN_MIXED_SOURCE_ID
        || persisted.value.items.length !== ENTDECKEN_MIXED_POOL_SIZE
        || !positiveInteger(fenceToken)
        || !exactKeys(value, ["ok", "status", "feed", "fenceToken", "provenance"])
        || value.ok !== true || value.status !== "verified" || value.fenceToken !== fenceToken
        || !sameJson(persisted.value, expected.value)
        || !exactKeys(value.provenance, ["itemCount", "sourceCount", "sourceIds", "rightsStatus"])
        || value.provenance.itemCount !== ENTDECKEN_MIXED_POOL_SIZE
        || value.provenance.sourceCount !== 2 || value.provenance.rightsStatus !== "owner_private"
        || !Array.isArray(value.provenance.sourceIds)
        || !sameJson([...value.provenance.sourceIds].sort(), [...persisted.value.sourceIds].sort())) return null;
    return freezeDeep({
      feed: persisted.value,
      readback: {
        schemaVersion: ENTDECKEN_MIXED_READBACK_VERSION,
        feedId: persisted.value.feedId,
        region: persisted.value.region,
        isoWeek: persisted.value.isoWeek,
        refreshedOn: persisted.value.refreshedOn,
        validUntil: persisted.value.validUntil,
        itemCount: persisted.value.items.length,
        sourceCount: 2,
        sourceIds: [...persisted.value.sourceIds],
        rightsStatus: "owner_private",
        providerRequests: 0,
      },
    });
  }
  if (!persisted.ok || !expected.ok
      || persisted.value.format !== ENTDECKEN_PUBLIC_FEED_FORMAT
      || persisted.value.feedId !== ENTDECKEN_PUBLIC_FEED_ID
      || persisted.value.sourceId !== ENTDECKEN_PUBLIC_SOURCE_ID
      || persisted.value.items.length !== ENTDECKEN_PUBLIC_POOL_SIZE
      || !positiveInteger(fenceToken)
      || !exactKeys(value, ["ok", "status", "feed", "fenceToken", "provenance"])
      || value.ok !== true || value.status !== "verified"
      || value.fenceToken !== fenceToken
      || !sameJson(persisted.value, expected.value)
      || !exactKeys(value.provenance, ["itemCount", "sourceCount", "sourceId", "rightsStatus"])
      || value.provenance.itemCount !== ENTDECKEN_PUBLIC_POOL_SIZE
      || value.provenance.sourceCount !== 1
      || value.provenance.sourceId !== ENTDECKEN_PUBLIC_SOURCE_ID
      || value.provenance.rightsStatus !== "owner_private") return null;
  return freezeDeep({
    feed: persisted.value,
    readback: {
      schemaVersion: ENTDECKEN_PUBLIC_READBACK_VERSION,
      feedId: persisted.value.feedId,
      region: persisted.value.region,
      isoWeek: persisted.value.isoWeek,
      refreshedOn: persisted.value.refreshedOn,
      validUntil: persisted.value.validUntil,
      itemCount: persisted.value.items.length,
      sourceCount: 1,
      sourceId: ENTDECKEN_PUBLIC_SOURCE_ID,
      rightsStatus: "owner_private",
      providerRequests: 0,
    },
  });
}

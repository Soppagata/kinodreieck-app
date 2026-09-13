import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { streamingPagesService, isStreamingPageRpcMissing } from "../services/streamingPages.js";
import {
  mergeStreamingPageItems,
  normalizeStreamingPageRequest,
  stableStreamingPageString,
  streamingPageQueryKey,
  STREAMING_PAGE_BACKGROUND_LIMIT,
  STREAMING_PAGE_INITIAL_LIMIT,
} from "../lib/streamingPage.js";

export const STREAMING_PAGE_SESSION_FRESH_MS = 5 * 60 * 1000;

export function streamingPageShouldBeActive(tab, visibilityState = "visible") {
  return tab === "streaming" && visibilityState !== "hidden";
}

function initialState(enabled = false) {
  return Object.freeze({
    enabled,
    status: "idle",
    view: "library",
    queryKey: "",
    version: null,
    items: Object.freeze([]),
    counts: null,
    total: null,
    loaded: 0,
    hasMore: false,
    backgroundLoading: false,
    fromCache: false,
    error: null,
    nextExpiryAt: null,
  });
}

const defaultYield = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 0);
});

export function createStreamingPageController({
  service = streamingPagesService,
  mapItems = (items) => items,
  legacyFallback = null,
  yieldMainThread = defaultYield,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let context = { enabled: false, accountKey: "", services: [], library: [], personal: {} };
  let contextSignature = "";
  let generation = 0;
  let active = false;
  let currentKey = "";
  let lastQuery = null;
  let snapshot = initialState(false);
  let expiryTimer = null;
  let legacyAttempted = false;
  const records = new Map();
  const listeners = new Set();

  const emit = (next) => {
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  };
  const isCurrent = (record) => record.generation === generation && currentKey === record.key;
  const isAttemptCurrent = (record, epoch) => isCurrent(record) && record.epoch === epoch;
  const clearExpiry = () => {
    if (expiryTimer != null) clearTimer(expiryTimer);
    expiryTimer = null;
  };
  const publicState = (record) => ({
    enabled: context.enabled === true,
    status: record.status,
    view: record.request.view,
    queryKey: record.publicKey,
    version: record.version,
    items: Object.freeze(record.items),
    counts: record.counts,
    total: record.total,
    loaded: record.items.length,
    hasMore: !!record.nextCursor && record.complete !== true,
    backgroundLoading: record.backgroundLoading === true,
    fromCache: record.fromCache === true,
    error: record.error,
    nextExpiryAt: record.nextExpiryAt,
  });
  const publish = (record) => { if (isCurrent(record)) emit(publicState(record)); };

  const resetForRefresh = (record, { expired = false, preserveItems = true } = {}) => {
    record.epoch += 1;
    record.initialEpoch = null;
    record.pumpingEpoch = null;
    record.version = null;
    record.nextCursor = null;
    record.complete = false;
    record.refreshStarted = false;
    record.nextExpiryAt = null;
    record.fromCache = false;
    record.error = null;
    record.backgroundLoading = false;
    record.lastValidatedAt = 0;
    if (!preserveItems || expired && record.request.view === "new") record.items = [];
    if (expired) {
      record.counts = null;
      record.total = null;
    }
    record.status = record.items.length ? "refreshing" : "idle";
  };

  const hasExpired = (record) => {
    const expiry = Date.parse(record.nextExpiryAt || "");
    return Number.isFinite(expiry) && expiry <= now();
  };

  const scheduleExpiry = (record) => {
    clearExpiry();
    if (!isCurrent(record) || !record.nextExpiryAt) return;
    const expiry = Date.parse(record.nextExpiryAt);
    if (!Number.isFinite(expiry)) return;
    const epoch = record.epoch;
    const expire = () => {
      expiryTimer = null;
      if (!isAttemptCurrent(record, epoch)) return;
      resetForRefresh(record, { expired: true });
      publish(record);
      if (active) void loadInitial(record, { allowVersionRestart: false, skipCache: true });
    };
    const delay = expiry - now();
    if (delay <= 0) expire();
    else expiryTimer = setTimer(expire, Math.min(delay + 5, 2147483647));
  };

  const applyPage = (record, page, { append = false, fromCache = false, epoch = record.epoch } = {}) => {
    if (!isAttemptCurrent(record, epoch) || page.status !== "ready") return false;
    if (append && record.version && record.version !== page.version) return false;
    const mapped = mapItems(page.items, context);
    record.items = append ? mergeStreamingPageItems(record.items, mapped) : [...mapped];
    record.version = page.version;
    record.counts = page.counts;
    record.total = page.total;
    record.nextCursor = page.nextCursor;
    record.complete = page.complete;
    if (append && record.nextExpiryAt && page.nextExpiryAt) {
      record.nextExpiryAt = Date.parse(record.nextExpiryAt) <= Date.parse(page.nextExpiryAt)
        ? record.nextExpiryAt : page.nextExpiryAt;
    } else if (!append || !record.nextExpiryAt) record.nextExpiryAt = page.nextExpiryAt;
    record.fromCache = fromCache;
    if (!fromCache) record.lastValidatedAt = now();
    record.error = null;
    record.status = fromCache ? "refreshing" : "ready";
    record.backgroundLoading = false;
    publish(record);
    scheduleExpiry(record);
    return true;
  };

  const disableForLegacy = async (record) => {
    if (legacyAttempted || !isCurrent(record)) return;
    legacyAttempted = true;
    if (typeof legacyFallback === "function") await legacyFallback();
    if (!isCurrent(record)) return;
    context = { ...context, enabled: false };
    records.clear();
    currentKey = "";
    clearExpiry();
    emit(initialState(false));
  };

  const loadBackground = async (record) => {
    const epoch = record.epoch;
    if (record.pumpingEpoch === epoch || !active || !isAttemptCurrent(record, epoch)
        || !record.nextCursor || record.complete) return;
    record.pumpingEpoch = epoch;
    try {
      while (active && isAttemptCurrent(record, epoch) && record.nextCursor && !record.complete) {
        const cursor = record.nextCursor;
        record.status = "refreshing";
        record.backgroundLoading = true;
        publish(record);
        let page;
        try {
          page = await service.loadPage({
            ...record.request,
            limit: STREAMING_PAGE_BACKGROUND_LIMIT,
            cursor,
          });
        } catch (error) {
          if (!isAttemptCurrent(record, epoch)) return;
          if (isStreamingPageRpcMissing(error)) { await disableForLegacy(record); return; }
          record.error = error;
          record.status = "error";
          record.backgroundLoading = false;
          publish(record);
          return;
        }
        if (!isAttemptCurrent(record, epoch)) return;
        if (page.status === "version_changed") {
          resetForRefresh(record, { preserveItems: false });
          publish(record);
          void loadInitial(record, { allowVersionRestart: false, skipCache: true });
          return;
        }
        if (record.version && page.version !== record.version) {
          record.error = new Error("Streaming-Seite lieferte einen gemischten Katalogstand");
          record.status = "error";
          record.backgroundLoading = false;
          publish(record);
          return;
        }
        if (!applyPage(record, page, { append: true, epoch })) return;
        if (active && isAttemptCurrent(record, epoch) && record.nextCursor && !record.complete) await yieldMainThread();
      }
    } finally {
      if (record.pumpingEpoch === epoch) record.pumpingEpoch = null;
      if (isAttemptCurrent(record, epoch) && record.status === "refreshing") {
        record.status = "ready";
        record.backgroundLoading = false;
        publish(record);
      }
      if (active && isAttemptCurrent(record, epoch) && record.nextCursor && !record.complete && !record.error) {
        void loadBackground(record);
      }
    }
  };

  async function loadInitial(record, { allowVersionRestart = true, skipCache = false } = {}) {
    const epoch = record.epoch;
    if (record.initialEpoch === epoch || !active || !isAttemptCurrent(record, epoch) || !context.enabled) return;
    record.initialEpoch = epoch;
    record.refreshStarted = true;
    record.status = record.items.length ? "refreshing" : "loading";
    record.backgroundLoading = false;
    record.error = null;
    publish(record);
    const request = { ...record.request, limit: STREAMING_PAGE_INITIAL_LIMIT, cursor: null };
    try {
      const cached = skipCache ? null : await service.loadCachedPage?.(request);
      if (cached && isAttemptCurrent(record, epoch)) applyPage(record, cached, { fromCache: true, epoch });
    } catch {
      /* Cachefehler sperren die unabhängige Aktualisierung nicht. */
    }
    if (!isAttemptCurrent(record, epoch)) return;
    try {
      const page = await service.loadPage(request);
      if (!isAttemptCurrent(record, epoch)) return;
      if (page.status === "version_changed") {
        if (allowVersionRestart) {
          resetForRefresh(record, { preserveItems: false });
          publish(record);
          Promise.resolve().then(() => loadInitial(record, { allowVersionRestart: false, skipCache: true }));
          return;
        }
        throw new Error("Streaming-Katalog änderte sich während des Neustarts");
      }
      applyPage(record, page, { epoch });
      record.status = "ready";
      publish(record);
    } catch (error) {
      if (!isAttemptCurrent(record, epoch)) return;
      if (isStreamingPageRpcMissing(error)) { await disableForLegacy(record); return; }
      record.error = error;
      record.status = record.items.length ? "error" : "error";
      record.backgroundLoading = false;
      publish(record);
      return;
    } finally {
      if (record.initialEpoch === epoch) record.initialEpoch = null;
      if (isAttemptCurrent(record, epoch) && (!record.version || record.fromCache)) record.refreshStarted = false;
    }
    if (active && isAttemptCurrent(record, epoch)) void loadBackground(record);
  }

  const resumeRecord = (record) => {
    if (!isCurrent(record)) return;
    if (hasExpired(record)) {
      resetForRefresh(record, { expired: true });
      publish(record);
      if (active) void loadInitial(record, { allowVersionRestart: false, skipCache: true });
      return;
    }
    if (record.lastValidatedAt > 0 && now() - record.lastValidatedAt >= STREAMING_PAGE_SESSION_FRESH_MS) {
      resetForRefresh(record, { preserveItems: true });
      publish(record);
      if (active) void loadInitial(record, { skipCache: true });
      return;
    }
    scheduleExpiry(record);
    if (!active) return;
    if (!record.refreshStarted) void loadInitial(record);
    else if (record.nextCursor && !record.complete && !record.error) void loadBackground(record);
  };

  const query = ({ view = "library", filters = {} } = {}) => {
    if (!context.enabled) return snapshot;
    const request = normalizeStreamingPageRequest({
      format: 1,
      services: context.services,
      view,
      limit: STREAMING_PAGE_INITIAL_LIMIT,
      cursor: null,
      filters,
      library: context.library,
      personal: context.personal,
    });
    lastQuery = { view: request.view, filters: request.filters };
    const signature = `${context.accountKey}\n${stableStreamingPageString(request)}`;
    const key = signature;
    currentKey = key;
    let record = records.get(key);
    if (!record) {
      record = {
        key, publicKey: streamingPageQueryKey(request, context.accountKey), request, generation,
        epoch: 0, status: "idle", items: [], counts: null, total: null,
        version: null, nextCursor: null, complete: false, nextExpiryAt: null,
        fromCache: false, error: null, backgroundLoading: false,
        initialEpoch: null, refreshStarted: false, pumpingEpoch: null, lastValidatedAt: 0,
      };
      records.set(key, record);
    }
    publish(record);
    resumeRecord(record);
    return snapshot;
  };

  const setContext = (next = {}) => {
    const normalized = {
      enabled: next.enabled === true,
      accountKey: String(next.accountKey || ""),
      services: Array.isArray(next.services) ? next.services : [],
      library: Array.isArray(next.library) ? next.library : [],
      personal: next.personal && typeof next.personal === "object" ? next.personal : {},
      revision: String(next.revision || ""),
    };
    const signature = stableStreamingPageString(normalized);
    if (signature === contextSignature) return;
    const previousQuery = lastQuery;
    context = normalized;
    contextSignature = signature;
    generation += 1;
    currentKey = "";
    records.clear();
    legacyAttempted = false;
    clearExpiry();
    emit(initialState(normalized.enabled));
    if (normalized.enabled && active && previousQuery) {
      query(previousQuery);
    }
  };

  const setActive = (value) => {
    active = value === true;
    const record = records.get(currentKey);
    if (!record || !isCurrent(record)) {
      if (active && context.enabled && lastQuery) query(lastQuery);
      return;
    }
    if (!active) {
      if (record.initialEpoch == null) {
        record.backgroundLoading = false;
        if (record.status === "refreshing") record.status = "ready";
        publish(record);
      }
      return;
    }
    resumeRecord(record);
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    query,
    setContext,
    setActive,
    destroy() { generation += 1; lastQuery = null; clearExpiry(); records.clear(); listeners.clear(); },
  });
}

export function useStreamingPageController({
  tab,
  enabled,
  accountKey,
  services,
  library,
  personal,
  revision,
  legacyFallback,
  service = streamingPagesService,
  mapItems,
} = {}) {
  const fallbackRef = useRef(legacyFallback);
  fallbackRef.current = legacyFallback;
  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createStreamingPageController({
      service,
      mapItems,
      legacyFallback: () => fallbackRef.current?.(),
    });
  }
  const controller = controllerRef.current;
  const streamingPage = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.setContext({ enabled, accountKey, services, library, personal, revision });
  }, [controller, enabled, accountKey, services, library, personal, revision]);
  useEffect(() => {
    const doc = typeof document !== "undefined" ? document : null;
    const win = typeof window !== "undefined" ? window : null;
    const update = () => controller.setActive(streamingPageShouldBeActive(tab, doc?.visibilityState));
    const pause = () => controller.setActive(false);
    update();
    doc?.addEventListener?.("visibilitychange", update);
    win?.addEventListener?.("pageshow", update);
    win?.addEventListener?.("pagehide", pause);
    return () => {
      doc?.removeEventListener?.("visibilitychange", update);
      win?.removeEventListener?.("pageshow", update);
      win?.removeEventListener?.("pagehide", pause);
      pause();
    };
  }, [controller, tab]);
  useEffect(() => () => controller.destroy(), [controller]);
  const onStreamingPageQuery = useCallback((query) => controller.query(query), [controller]);
  return { streamingPage, onStreamingPageQuery };
}

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
  const clearExpiry = () => {
    if (expiryTimer != null) clearTimer(expiryTimer);
    expiryTimer = null;
  };
  const publicState = (record) => ({
    enabled: context.enabled === true,
    status: record.status,
    view: record.request.view,
    queryKey: record.key,
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

  const scheduleExpiry = (record) => {
    clearExpiry();
    if (!isCurrent(record) || !record.nextExpiryAt) return;
    const expiry = Date.parse(record.nextExpiryAt);
    if (!Number.isFinite(expiry)) return;
    const expire = () => {
      expiryTimer = null;
      if (!isCurrent(record)) return;
      record.counts = null;
      record.total = null;
      record.nextCursor = null;
      record.complete = false;
      record.refreshStarted = false;
      record.nextExpiryAt = null;
      record.fromCache = false;
      if (record.request.view === "new") record.items = [];
      record.status = active ? "refreshing" : "ready";
      publish(record);
      if (active) void loadInitial(record, false);
    };
    const delay = expiry - now();
    if (delay <= 0) expire();
    else expiryTimer = setTimer(expire, Math.min(delay + 5, 2147483647));
  };

  const applyPage = (record, page, { append = false, fromCache = false } = {}) => {
    if (!isCurrent(record) || page.status !== "ready") return false;
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
    if (record.pumping || !active || !isCurrent(record) || !record.nextCursor || record.complete) return;
    record.pumping = true;
    try {
      while (active && isCurrent(record) && record.nextCursor && !record.complete) {
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
          if (!isCurrent(record)) return;
          if (isStreamingPageRpcMissing(error)) { await disableForLegacy(record); return; }
          record.error = error;
          record.status = "error";
          record.backgroundLoading = false;
          publish(record);
          return;
        }
        if (!isCurrent(record)) return;
        if (page.status === "version_changed") {
          record.items = [];
          record.counts = null;
          record.total = null;
          record.version = null;
          record.nextCursor = null;
          record.complete = false;
          record.backgroundLoading = false;
          record.refreshStarted = false;
          await loadInitial(record, false);
          return;
        }
        if (record.version && page.version !== record.version) {
          record.error = new Error("Streaming-Seite lieferte einen gemischten Katalogstand");
          record.status = "error";
          record.backgroundLoading = false;
          publish(record);
          return;
        }
        if (!applyPage(record, page, { append: true })) return;
        if (active && isCurrent(record) && record.nextCursor && !record.complete) await yieldMainThread();
      }
    } finally {
      record.pumping = false;
      if (isCurrent(record) && record.status === "refreshing") {
        record.status = "ready";
        record.backgroundLoading = false;
        publish(record);
      }
      if (active && isCurrent(record) && record.nextCursor && !record.complete && !record.error) {
        void loadBackground(record);
      }
    }
  };

  async function loadInitial(record, allowVersionRestart = true) {
    if (record.initialLoading || !isCurrent(record) || !context.enabled) return;
    record.initialLoading = true;
    record.refreshStarted = true;
    record.status = record.items.length ? "refreshing" : "loading";
    record.backgroundLoading = false;
    record.error = null;
    publish(record);
    const request = { ...record.request, limit: STREAMING_PAGE_INITIAL_LIMIT, cursor: null };
    try {
      const cached = await service.loadCachedPage?.(request);
      if (cached && isCurrent(record)) applyPage(record, cached, { fromCache: true });
    } catch {
      /* Cachefehler sperren die unabhängige Aktualisierung nicht. */
    }
    if (!isCurrent(record)) { record.initialLoading = false; return; }
    try {
      const page = await service.loadPage(request);
      if (!isCurrent(record)) return;
      if (page.status === "version_changed") {
        if (allowVersionRestart) {
          record.initialLoading = false;
          record.refreshStarted = false;
          Promise.resolve().then(() => loadInitial(record, false));
          return;
        }
        throw new Error("Streaming-Katalog änderte sich während des Neustarts");
      }
      applyPage(record, page);
      record.status = "ready";
      publish(record);
    } catch (error) {
      if (!isCurrent(record)) return;
      if (isStreamingPageRpcMissing(error)) { await disableForLegacy(record); return; }
      record.error = error;
      record.status = record.items.length ? "error" : "error";
      record.backgroundLoading = false;
      publish(record);
      return;
    } finally {
      record.initialLoading = false;
      if (!record.version || record.fromCache) record.refreshStarted = false;
    }
    if (active && isCurrent(record)) void loadBackground(record);
  }

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
    const key = `${context.accountKey}:${streamingPageQueryKey(request)}`;
    currentKey = key;
    let record = records.get(key);
    if (!record) {
      record = {
        key, request, generation, status: "idle", items: [], counts: null, total: null,
        version: null, nextCursor: null, complete: false, nextExpiryAt: null,
        fromCache: false, error: null, backgroundLoading: false,
        initialLoading: false, refreshStarted: false, pumping: false,
      };
      records.set(key, record);
    }
    publish(record);
    if (!record.refreshStarted) void loadInitial(record);
    else if (active && record.nextCursor && !record.complete && !record.error) void loadBackground(record);
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
    const previousRequest = records.get(currentKey)?.request || null;
    context = normalized;
    contextSignature = signature;
    generation += 1;
    currentKey = "";
    records.clear();
    legacyAttempted = false;
    clearExpiry();
    emit(initialState(normalized.enabled));
    if (normalized.enabled && active && previousRequest) {
      query({ view: previousRequest.view, filters: previousRequest.filters });
    }
  };

  const setActive = (value) => {
    active = value === true;
    const record = records.get(currentKey);
    if (!record || !isCurrent(record)) return;
    if (!active) {
      if (!record.initialLoading) {
        record.backgroundLoading = false;
        if (record.status === "refreshing") record.status = "ready";
        publish(record);
      }
      return;
    }
    if (!record.refreshStarted) void loadInitial(record);
    else if (record.nextCursor && !record.complete && !record.error) void loadBackground(record);
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    query,
    setContext,
    setActive,
    destroy() { generation += 1; clearExpiry(); records.clear(); listeners.clear(); },
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
  useEffect(() => { controller.setActive(tab === "streaming"); }, [controller, tab]);
  useEffect(() => () => controller.destroy(), [controller]);
  const onStreamingPageQuery = useCallback((query) => controller.query(query), [controller]);
  return { streamingPage, onStreamingPageQuery };
}

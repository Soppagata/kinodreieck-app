import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { slugId } from "../lib/match.js";
import { mustwatchCandidatesService } from "../services/mustwatchCandidates.js";
import { streamingPagesService } from "../services/streamingPages.js";
import { STREAMING_PAGE_BACKGROUND_LIMIT, stableStreamingPageString } from "../lib/streamingPage.js";

const text = (value) => String(value == null ? "" : value).trim();
const MAX_LINKED_TARGETS = 5000;
const SESSION_TTL_MS = 5 * 60 * 1000;

export function collectMustwatchStreamingIds(entries) {
  return [...new Set((Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.verknuepfung?.ziel === "streaming")
    .map((entry) => text(entry.verknuepfung.id)).filter(Boolean))];
}

export function candidateRefreshDelay(response, currentTime = Date.now()) {
  if (response?.status !== "ready") return null;
  const expiresAt = Date.parse(String(response?.expiresAt || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= currentTime) return null;
  return Math.min(2147483647, expiresAt - currentTime);
}

export function istMustwatchZeitAbgelaufen(value, currentTime = Date.now()) {
  if (value == null || value === "") return false;
  const numeric = typeof value === "number" ? value : Number(value);
  const expiresAt = Number.isFinite(numeric) ? numeric : Date.parse(String(value));
  return Number.isFinite(expiresAt) && expiresAt <= currentTime;
}

export function istMustwatchDokumentSichtbar(doc = globalThis.document) {
  return !doc || doc.visibilityState === "visible";
}

export function buildMustwatchProgramCandidates(programm, expired = false) {
  if (expired) return [];
  return (programm?.filme || []).map((film) => {
    const stableId = film.film_at_id ?? film.id ?? null;
    return {
      ...film,
      id: stableId,
      projection_id: stableId ?? `auto:${slugId(film.t, film.j)}`,
      titel: film.t,
      originaltitel: film.ot,
      jahr: film.j,
      typ: film.typ || film.type || "film",
    };
  });
}

function exactTargets(items = []) {
  const byId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = text(item?.id);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(item);
  }
  return byId;
}

function linkedIdentity(item, id) {
  return Object.freeze({
    id,
    watchmode_id: item?.watchmode_id ?? null,
    streaming_id: item?.streaming_id ?? null,
    imdb_id: item?.imdb_id ?? null,
    tmdb_id: item?.tmdb_id ?? null,
    titel: item?.titel ?? item?.t ?? null,
    originaltitel: item?.originaltitel ?? item?.ot ?? null,
    jahr: item?.jahr ?? item?.j ?? null,
    typ: item?.typ ?? item?.type ?? null,
  });
}

/* Ausschliesslich explizite, im aktuellen lokalen Zielbestand eindeutig
   aufloesbare Verknuepfungen verlassen diese Grenze. Must-Watch-Text, Notizen
   und Bewertungen sind kein Teil des neutralen Katalogrequests. */
export function buildMustwatchLinkedLibrary(entries, master, programmCandidates) {
  const targets = {
    master: exactTargets(master),
    programm: exactTargets(programmCandidates),
  };
  const refs = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const ziel = entry?.verknuepfung?.ziel;
    const id = text(entry?.verknuepfung?.id);
    if (!id || !["master", "programm"].includes(ziel)) continue;
    const matches = targets[ziel].get(id);
    if (matches?.length === 1) refs.add(`${ziel}:${id}`);
  }
  if (refs.size > MAX_LINKED_TARGETS) throw new Error("mustwatch-linked-targets-bounded");
  const library = [...refs].sort((a, b) => a.localeCompare(b, "de-AT")).map((refKey) => {
    const separator = refKey.indexOf(":");
    const ziel = refKey.slice(0, separator);
    const id = refKey.slice(separator + 1);
    return linkedIdentity(targets[ziel].get(id)[0], refKey);
  });
  return Object.freeze({ library: Object.freeze(library), refKeys: Object.freeze(library.map((item) => item.id)) });
}

function sourceRevision(version) {
  const value = text(version);
  return /^mw1-([0-9a-f]+)$/iu.exec(value)?.[1]
    || /^sp1-([0-9a-f]+)-/iu.exec(value)?.[1]
    || null;
}

function localExpiry(responses, currentTime = Date.now(), sessionTtlMs = SESSION_TTL_MS) {
  const deadlines = [currentTime + Math.max(1, Math.min(SESSION_TTL_MS, Number(sessionTtlMs) || SESSION_TTL_MS))];
  for (const value of responses) {
    const parsed = Date.parse(String(value || ""));
    if (Number.isFinite(parsed) && parsed > currentTime) deadlines.push(parsed);
  }
  return Math.min(...deadlines);
}

export async function loadMustwatchLinkedStreaming(plan, selectedServices, {
  service = streamingPagesService, signal = null,
} = {}) {
  const library = Array.isArray(plan?.library) ? plan.library : [];
  if (!library.length || !selectedServices.length) {
    return Object.freeze({ status: "ready", version: "", nextExpiryAt: null, byRef: Object.freeze({}) });
  }
  const personal = { seenIds: [], mustWatchIds: [], ratedIds: [], newEntries: [], legacyNew: [] };
  let cursor = null;
  let version = null;
  let nextExpiryAt = null;
  let pages = 0;
  const grouped = new Map();
  const allowedRefs = new Set(plan.refKeys);
  do {
    pages += 1;
    if (pages > Math.ceil(MAX_LINKED_TARGETS / STREAMING_PAGE_BACKGROUND_LIMIT)) {
      throw new Error("mustwatch-linked-pages-bounded");
    }
    const page = await service.loadPage({
      format: 1,
      services: selectedServices,
      view: "library",
      limit: STREAMING_PAGE_BACKGROUND_LIMIT,
      cursor,
      filters: {},
      library,
      personal,
    }, { signal });
    if (signal?.aborted) throw Object.assign(new Error("Must-Watch-Seitenabgleich abgebrochen"), { name: "AbortError" });
    if (page?.status !== "ready" || version && page.version !== version) {
      throw new Error("mustwatch-linked-catalog-version");
    }
    version = page.version;
    if (page.nextExpiryAt && (!nextExpiryAt || Date.parse(page.nextExpiryAt) < Date.parse(nextExpiryAt))) {
      nextExpiryAt = page.nextExpiryAt;
    }
    for (const item of page.items || []) {
      const refKey = text(item?.library_id);
      if (!allowedRefs.has(refKey)) continue;
      if (!grouped.has(refKey)) grouped.set(refKey, []);
      grouped.get(refKey).push(Object.freeze({ ...item }));
    }
    cursor = page.complete === true ? null : text(page.nextCursor);
    if (!page.complete && !cursor) throw new Error("mustwatch-linked-cursor");
  } while (cursor);
  const byRef = {};
  for (const refKey of plan.refKeys) {
    const matches = grouped.get(refKey) || [];
    if (matches.length === 1) byRef[refKey] = matches[0];
  }
  return Object.freeze({ status: "ready", version, nextExpiryAt, byRef: Object.freeze(byRef) });
}

export function useMustwatchCandidatesController({
  entries = [], master = [], programm = null, programmAbgelaufen = false,
  programmExpiresAt = null, contextKey = "", active = true,
  service = mustwatchCandidatesService,
  pageService = streamingPagesService, selectedServices = [],
  sessionTtlMs = SESSION_TTL_MS,
} = {}) {
  const ids = useMemo(() => collectMustwatchStreamingIds(entries), [entries]);
  const idsKey = ids.join("\n");
  const services = useMemo(() => [...new Set((Array.isArray(selectedServices) ? selectedServices : [])
    .map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de-AT")), [selectedServices]);
  const servicesKey = services.join("\n");
  const [reload, setReload] = useState(0);
  const [streamingState, setStreamingState] = useState(() => ({ requestKey: "", items: [], linked: {}, ready: false, expiresAt: null }));
  const [programmZeitlichAbgelaufen, setProgrammZeitlichAbgelaufen] = useState(false);
  const [dokumentSichtbar, setDokumentSichtbar] = useState(() => istMustwatchDokumentSichtbar());
  const conflictRetryKeyRef = useRef(null);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const aktualisieren = () => setDokumentSichtbar(istMustwatchDokumentSichtbar(document));
    document.addEventListener("visibilitychange", aktualisieren);
    aktualisieren();
    return () => document.removeEventListener("visibilitychange", aktualisieren);
  }, []);

  useEffect(() => {
    if (programmExpiresAt == null || programmExpiresAt === "") {
      setProgrammZeitlichAbgelaufen(false);
      return undefined;
    }
    const numeric = typeof programmExpiresAt === "number" ? programmExpiresAt : Number(programmExpiresAt);
    const expiresAt = Number.isFinite(numeric) ? numeric : Date.parse(String(programmExpiresAt));
    if (!Number.isFinite(expiresAt)) { setProgrammZeitlichAbgelaufen(false); return undefined; }
    const delay = expiresAt - Date.now();
    if (delay <= 0) { setProgrammZeitlichAbgelaufen(true); return undefined; }
    setProgrammZeitlichAbgelaufen(false);
    const timer = setTimeout(() => setProgrammZeitlichAbgelaufen(true), Math.min(2147483647, delay));
    return () => clearTimeout(timer);
  }, [programmExpiresAt]);

  const masterCandidates = useMemo(() => (Array.isArray(master) ? master : []).map((film) => ({
    ...film, id: film.id, titel: film.titel, jahr: film.jahr,
  })), [master]);
  const programmCandidates = useMemo(() => buildMustwatchProgramCandidates(
    programm, programmAbgelaufen || programmZeitlichAbgelaufen,
  ), [programm, programmAbgelaufen, programmZeitlichAbgelaufen]);
  const linkedPlan = useMemo(() => {
    try { return buildMustwatchLinkedLibrary(entries, masterCandidates, programmCandidates); }
    catch (error) {
      return Object.freeze({ library: Object.freeze([]), refKeys: Object.freeze([]), error });
    }
  }, [entries, masterCandidates, programmCandidates]);
  const linkedKey = useMemo(() => stableStreamingPageString(linkedPlan.library), [linkedPlan]);
  const requestKey = `${contextKey}\n${servicesKey}\n${idsKey}\n${linkedKey}`;

  useEffect(() => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let mounted = true;
    let expiryTimer = null;
    if (!active || !dokumentSichtbar) return () => { mounted = false; controller?.abort(); };
    if (!services.length || linkedPlan.error || (!ids.length && !linkedPlan.library.length)) {
      setStreamingState({ requestKey, items: [], linked: {}, ready: true, expiresAt: null });
      return () => { mounted = false; controller?.abort(); };
    }
    setStreamingState((previous) => previous.requestKey === requestKey
      && Number.isFinite(previous.expiresAt) && previous.expiresAt > Date.now()
      ? previous : { requestKey, items: [], linked: {}, ready: false, expiresAt: null });
    const directRun = ids.length
      ? service.loadByIds(ids, { signal: controller?.signal })
      : Promise.resolve({ status: "ready", version: "", expiresAt: null, items: [] });
    const linkedRun = loadMustwatchLinkedStreaming(linkedPlan, services, {
      service: pageService, signal: controller?.signal,
    });
    Promise.all([directRun, linkedRun]).then(([response, linkedResponse]) => {
      if (!mounted || controller?.signal.aborted) return;
      const directRevision = sourceRevision(response?.version);
      const linkedRevision = sourceRevision(linkedResponse?.version);
      const responsesReady = response?.status === "ready" && linkedResponse?.status === "ready";
      const versionsCompatible = !directRevision || !linkedRevision || directRevision === linkedRevision;
      const compatible = responsesReady && versionsCompatible;
      const versionConflict = responsesReady && !versionsCompatible;
      const items = compatible && Array.isArray(response.items) ? response.items : [];
      const linked = compatible ? linkedResponse.byRef : {};
      const expiresAt = localExpiry(
        versionConflict ? [] : [response?.expiresAt, linkedResponse?.nextExpiryAt],
        Date.now(), sessionTtlMs,
      );
      setStreamingState({ requestKey, items, linked, ready: !versionConflict, expiresAt });
      if (compatible) conflictRetryKeyRef.current = null;
      const darfKonfliktNeuPruefen = versionConflict && conflictRetryKeyRef.current !== requestKey;
      if ((compatible || darfKonfliktNeuPruefen) && Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        const delay = Math.min(2147483647, expiresAt - Date.now());
        expiryTimer = setTimeout(() => {
          if (!mounted) return;
          if (versionConflict) conflictRetryKeyRef.current = requestKey;
          setStreamingState({ requestKey, items: [], linked: {}, ready: false, expiresAt: null });
          setReload((value) => value + 1);
        }, delay);
      }
    }).catch(() => {
      if (mounted && !controller?.signal.aborted) {
        setStreamingState({ requestKey, items: [], linked: {}, ready: true, expiresAt: null });
      }
    });
    return () => {
      mounted = false;
      if (expiryTimer) clearTimeout(expiryTimer);
      controller?.abort();
    };
  }, [active, dokumentSichtbar, idsKey, linkedKey, pageService, reload, requestKey, service, servicesKey, sessionTtlMs]);

  const kandidaten = useMemo(() => ({
    master: masterCandidates,
    programm: programmCandidates,
    streaming: streamingState.requestKey === requestKey ? streamingState.items : [],
    linkedStreaming: streamingState.requestKey === requestKey ? streamingState.linked : {},
    abgleichBereit: streamingState.requestKey === requestKey && streamingState.ready,
  }), [masterCandidates, programmCandidates, requestKey, streamingState]);

  const searchStreaming = useCallback(async (query, options = {}) => {
    if (!active || !dokumentSichtbar) return [];
    try {
      const response = await service.search(query, options);
      return response?.status === "ready" && Array.isArray(response.items) ? response.items : [];
    } catch { return []; }
  }, [active, contextKey, dokumentSichtbar, service]);

  return Object.freeze({ kandidaten, searchStreaming, abgleichBereit: kandidaten.abgleichBereit });
}

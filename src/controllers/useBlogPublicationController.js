import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLOG_MAX_REFERENCES,
  BLOG_AUTHOR_MODE,
  BLOG_CONTRACT_VERSION,
  BLOG_PUBLIC_OUTCOME,
  BLOG_SAVE_INTENT,
  BLOG_STREAMING_SOURCE_IDS,
  blogPublicationDisplayState,
} from "../lib/blogContract.js";
import {
  buildBlogLibraryIndex,
  buildPrivateBlogTargetIndex,
  canonicalBlogSourceIds,
  projectPrivateArticleForPublication,
  projectPrivateBlogReferences,
  projectPublicBlogReferences,
} from "../lib/blogReferenceProjection.js";
import {
  gleicheArtikelAb,
  mitNeuerBlogFassung,
  neueArtikelId,
  neueBlogZeilenId,
  normalisiereBlogZeilen,
} from "../lib/artikel.js";
import {
  applyOwnerPublication,
  beginBlogPublication,
  completeBlogPublication,
  markBlogPublicationUnknown,
  needsRemoteRemoval,
  publicationContentVersion,
  publicationOperationId,
  publicationSnapshot,
} from "../lib/sharedPublication.js";
import { sharedArticlesService } from "../services/sharedArticles.js";
import { blogReferenceContentHash } from "../lib/blogReferenceExtraction.js";
import { normalisiereTyp } from "../lib/typen.js";

export async function readBlogLibraryBootState(readMaster, decodeMaster) {
  try {
    const record = await readMaster();
    return {
      status: "loaded",
      value: record ? decodeMaster(record) : null,
      error: null,
    };
  } catch (error) {
    return { status: "failed", value: null, error };
  }
}

export function isBlogLibraryReady(bootDone, masterReadStatus, hasMaterializedLibrary = false) {
  return bootDone === true && (masterReadStatus === "loaded" || hasMaterializedLibrary === true);
}

function text(value) { return String(value == null ? "" : value).trim(); }
function excerpt(value) {
  const full = String(value == null ? "" : value).trim();
  return full.length > 280 ? `${full.slice(0, 280).replace(/\s+\S*$/, "")} …` : full;
}
function actionResult(status, extra = {}) {
  return {
    status, articleId: null, rowId: null, mediaWriteConfirmed: null,
    reference: null, errorCode: null, ...extra,
  };
}
function emptyPublication(status = BLOG_PUBLIC_OUTCOME.NOT_REQUESTED, extra = {}) {
  return {
    status, operationId: null, publicationId: null, publicRevision: null,
    publishedContentVersion: null, decisionRequests: [], errorCode: null, ...extra,
  };
}
function saveResult(privatePart, publication = emptyPublication()) {
  return { private: privatePart, publication };
}
function privateFailed(articleId = null, errorCode = "private-save-failed") {
  return saveResult({ status: "failed", articleId, contentVersion: null, errorCode });
}
function publicationMayExist(article) {
  return needsRemoteRemoval(article)
    || !!article?.publikation?.pending
    || !!article?.publikation?.publicationId
    || article?.geteilt === true;
}
export function createBlogSaveRequest(article, operationId, intent, library, authorDecision) {
  const snapshot = publicationSnapshot(article);
  return {
    contractVersion: BLOG_CONTRACT_VERSION,
    operationId,
    contentVersion: article.contentVersion,
    privateArticleId: article.id,
    expectedPublicRevision: intent === BLOG_SAVE_INTENT.UPDATE ? snapshot.publicRevision : null,
    article: projectPrivateArticleForPublication(article, library),
    authorDecision,
  };
}

export function reconcileBlogOwnerReadback(article, readback) {
  if (!article || readback?.privateArticleId !== article.id) return article;
  const pending = article?.publikation?.pending || null;
  const operation = readback?.operation;
  if (pending && operation?.operationId === pending.operationId && operation.status === "applied"
      && operation.result) return completeBlogPublication(article, pending.operationId, operation.result);
  if (pending && operation?.operationId === pending.operationId && operation.status === "not_applied") {
    return applyOwnerPublication(article, readback.currentPublication, {
      pending,
      errorCode: operation.errorCode || operation.status,
    });
  }
  if (pending && operation?.operationId === pending.operationId && operation.status === "conflict") {
    return applyOwnerPublication(article, readback.currentPublication, {
      pending: null,
      errorCode: operation.errorCode || operation.status,
    });
  }
  return applyOwnerPublication(article, readback?.currentPublication || null, {
    pending,
    errorCode: pending ? (operation?.errorCode || article?.publikation?.errorCode || "unknown") : null,
    decisionRequests: article?.publikation?.decisionRequests || [],
  });
}

function mutationPublicationResult(response, operationId) {
  return emptyPublication(response?.outcome || BLOG_PUBLIC_OUTCOME.FAILED, {
    operationId,
    publicationId: response?.publication?.publicationId || response?.publicationId || null,
    publicRevision: response?.publication?.publicRevision || response?.actualPublicRevision || null,
    publishedContentVersion: response?.publication?.publishedContentVersion || null,
    authorMode: response?.publication?.authorMode || null,
    author: response?.publication?.author || null,
    decisionRequests: Array.isArray(response?.decisionRequests) ? response.decisionRequests : [],
    errorCode: response?.errorCode || null,
  });
}

function editorReference(row, index) {
  return {
    ...row,
    rowId: text(row?.rowId) || neueBlogZeilenId(),
    rank: index + 1,
    title: text(row?.title || row?.eingabe),
    year: Number.isInteger(row?.year ?? row?.jahr) ? (row?.year ?? row?.jahr) : null,
    mediaType: text(row?.mediaType || row?.typ) || "sonstiges",
    resolutionIntent: row?.resolutionIntent || (row?.rotlink_ok
      ? { kind: "keep_redlink" } : { kind: "auto" }),
    decisionCandidates: Array.isArray(row?.decisionCandidates) ? row.decisionCandidates : [],
    decisionRequired: row?.decisionRequired === true
      || (row?.decisionRequired == null && Array.isArray(row?.decisionCandidates) && row.decisionCandidates.length > 0),
  };
}

const BLOG_REFERENCE_APPLICATION_KEYS = Object.freeze([
  "candidateId", "selectionId", "sourceKind", "ref", "title", "year", "mediaType", "resolutionIntent",
]);
const BLOG_REFERENCE_MEDIA_TYPES = new Set(["film", "serie", "musik", "sonstiges"]);

function exactKeys(value, expected) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function sourceItemForCandidate(candidate, library, mustwatch) {
  const source = candidate.sourceKind === "library" ? library
    : candidate.sourceKind === "mustwatch" ? mustwatch : null;
  if (!source || typeof candidate.ref !== "string" || !candidate.ref.trim()) return null;
  const matches = source.filter((item) => String(item?.id == null ? "" : item.id) === candidate.ref);
  return matches.length === 1 ? matches[0] : null;
}

function normalizeReferenceApplication(candidate, library, mustwatch) {
  if (!exactKeys(candidate, BLOG_REFERENCE_APPLICATION_KEYS)
      || typeof candidate.candidateId !== "string" || !candidate.candidateId
      || typeof candidate.selectionId !== "string" || !candidate.selectionId
      || typeof candidate.title !== "string" || !candidate.title.trim()
      || candidate.title.trim().length > 240
      || !BLOG_REFERENCE_MEDIA_TYPES.has(candidate.mediaType)
      || (candidate.year !== null && (!Number.isInteger(candidate.year)
        || candidate.year < (["film", "serie"].includes(candidate.mediaType) ? 1870 : 1)
        || candidate.year > 2200))) return null;
  if (candidate.sourceKind === "manual") {
    if (candidate.ref !== null || !exactKeys(candidate.resolutionIntent, ["kind"])
        || candidate.resolutionIntent.kind !== "keep_redlink") return null;
    return {
      identity: null,
      row: editorReference({
        title: candidate.title.trim(), year: candidate.year, mediaType: candidate.mediaType,
        ref: null, resolutionIntent: { kind: "keep_redlink" }, decisionCandidates: [],
      }, 0),
    };
  }
  if (!["library", "mustwatch"].includes(candidate.sourceKind)
      || !exactKeys(candidate.resolutionIntent, ["kind"])
      || candidate.resolutionIntent.kind !== "auto") return null;
  const item = sourceItemForCandidate(candidate, library, mustwatch);
  if (!item) return null;
  const itemTitle = text(item?.titel || item?.title);
  const itemYear = Number.isInteger(item?.jahr ?? item?.year) ? (item.jahr ?? item.year) : null;
  const itemType = normalisiereTyp(text(item?.typ || item?.mediaType) || "sonstiges");
  if (candidate.title.trim() !== itemTitle || candidate.year !== itemYear
      || candidate.mediaType !== itemType) return null;
  return {
    identity: String(candidate.ref),
    row: editorReference({
      title: itemTitle, year: itemYear, mediaType: itemType, ref: String(candidate.ref),
      resolutionIntent: { kind: "auto" }, decisionCandidates: [],
    }, 0),
  };
}

export function applyBlogReferenceSuggestionsToDraft(draft, {
  draftKey, candidates, library = [], mustwatch = [],
} = {}) {
  if (!draft || draft.draftKey !== draftKey || draft.saveStatus === "saving"
      || !Array.isArray(draft.references) || !Array.isArray(candidates)
      || candidates.length < 1 || candidates.length > BLOG_MAX_REFERENCES) {
    return { status: "failed", errorCode: "invalid-selection", addedCount: 0, draft };
  }
  const seenSelections = new Set();
  const seenIdentities = new Set(draft.references
    .map((row) => row?.ref == null ? null : String(row.ref)).filter(Boolean));
  const additions = [];
  for (const candidate of candidates) {
    if (seenSelections.has(candidate?.selectionId)) {
      return { status: "failed", errorCode: "invalid-selection", addedCount: 0, draft };
    }
    seenSelections.add(candidate?.selectionId);
    const normalized = normalizeReferenceApplication(candidate, library, mustwatch);
    if (!normalized) return { status: "failed", errorCode: "invalid-selection", addedCount: 0, draft };
    if (normalized.identity && seenIdentities.has(normalized.identity)) continue;
    if (normalized.identity) seenIdentities.add(normalized.identity);
    additions.push(normalized.row);
  }
  if (draft.references.length + additions.length > BLOG_MAX_REFERENCES) {
    return { status: "failed", errorCode: "selection-too-large", addedCount: 0, draft };
  }
  const references = [...draft.references, ...additions].map(editorReference);
  return {
    status: "applied", errorCode: null, addedCount: additions.length,
    draft: additions.length ? { ...draft, references, dirty: true, saveStatus: "idle" } : draft,
  };
}

function draftFromArticle(article, accountScope, draftKey = publicationOperationId()) {
  const references = normalisiereBlogZeilen(article?.liste || []).map(editorReference);
  return {
    draftKey, accountScope, articleId: article?.id || null,
    contentVersion: article?.contentVersion || null,
    publicationId: article?.publikation?.publicationId || null,
    title: article?.titel || "", text: article?.text || "",
    ordered: article?.geordnet === true,
    references,
    anonymousPublication: !!article?.publikation?.publicationId
      && article?.publikation?.authorMode !== BLOG_AUTHOR_MODE.PROFILE,
    authorDecisionTouched: false,
    dirty: false, saveStatus: "idle",
  };
}

function articleFromDraft(draft, previous, articleId, contentVersion, nowIso, referenceItems = []) {
  const references = draft.references.map((row, index) => ({
    ...((previous?.liste || []).find((old) => old.rowId === row.rowId) || {}),
    rowId: row.rowId,
    eingabe: text(row.title),
    jahr: Number.isInteger(row.year) ? row.year : null,
    typ: text(row.mediaType) || "sonstiges",
    ref: row.ref == null ? null : String(row.ref),
    rotlink_ok: row.resolutionIntent?.kind === "keep_redlink",
    resolutionIntent: row.resolutionIntent || { kind: "auto" },
    decisionCandidates: Array.isArray(row.decisionCandidates) ? row.decisionCandidates : [],
    decisionRequired: row.decisionRequired === true
      || (row.decisionRequired == null && Array.isArray(row.decisionCandidates) && row.decisionCandidates.length > 0),
    rank: index + 1,
  }));
  const next = {
    ...(previous || {}), id: articleId, titel: text(draft.title), autor: previous?.autor || "",
    text: String(draft.text || ""), geordnet: draft.ordered === true,
    erstellt_am: previous?.erstellt_am || nowIso,
    status: references.some((row) => row.decisionRequired === true && row.resolutionIntent?.kind === "auto")
      ? "wartet" : "freigegeben",
    liste: references,
  };
  const versioned = mitNeuerBlogFassung(next, contentVersion, nowIso);
  const matched = gleicheArtikelAb(versioned, Array.isArray(referenceItems) ? referenceItems : []);
  const { abgleichStat: _ignored, ...article } = matched;
  return {
    ...article,
    liste: matched.liste.map(({ abgleich: _rowIgnored, ...row }) => row),
  };
}

export function useBlogPublicationController({
  accountScope,
  enabled = false,
  articles = [],
  articlesReady = false,
  writeArticles,
  library = [],
  libraryReady = false,
  mustwatch = [],
  mustwatchReady = false,
  selectedServices = [],
  selectedServicesReady = false,
  service = sharedArticlesService,
  addLibraryItem,
  navigateTarget,
  focusedArticleId = null,
  onFocusConsumed,
  setError,
  clock = () => new Date().toISOString(),
} = {}) {
  const [publicationCapability, setPublicationCapability] = useState({
    status: enabled ? "checking" : "unavailable", reason: enabled ? null : "account-unavailable",
  });
  const [view, setView] = useState({ area: "mine", mode: "list", articleId: null, returnToken: null });
  const [editor, setEditor] = useState(null);
  const [redlinkForm, setRedlinkForm] = useState(null);
  const [publishedPage, setPublishedPage] = useState({
    status: "idle", items: [], nextCursor: null, complete: false, errorCode: null,
  });
  const scopeRef = useRef(accountScope);
  const articlesRef = useRef(articles);
  const editorRef = useRef(editor);
  const viewRef = useRef(view);
  const redlinkContextRef = useRef(null);
  const mutationRef = useRef(null);
  const epochRef = useRef(0);
  articlesRef.current = articles;
  editorRef.current = editor;
  viewRef.current = view;

  const beginMutation = useCallback((kind) => {
    if (mutationRef.current) return null;
    const token = { epoch: ++epochRef.current, scope: scopeRef.current, kind };
    mutationRef.current = token;
    return token;
  }, []);
  const mutationCurrent = useCallback((token) => (
    !!token && mutationRef.current === token
    && token.epoch === epochRef.current && token.scope === scopeRef.current
  ), []);
  const finishMutation = useCallback((token) => {
    if (mutationRef.current === token) mutationRef.current = null;
  }, []);

  const libraryIndex = useMemo(() => buildBlogLibraryIndex(library), [library]);
  const privateTargetIndex = useMemo(() => buildPrivateBlogTargetIndex(library, mustwatch), [library, mustwatch]);
  const publicationReferenceItems = useMemo(() => [...(Array.isArray(library) ? library : []), ...(Array.isArray(mustwatch) ? mustwatch : [])], [library, mustwatch]);
  const selectedSourceIds = useMemo(() => {
    const selected = canonicalBlogSourceIds(selectedServices);
    return selectedServicesReady && Array.isArray(selectedServices) && selectedServices.length === 0
      ? [...BLOG_STREAMING_SOURCE_IDS] : selected;
  }, [selectedServices, selectedServicesReady]);

  useEffect(() => {
    epochRef.current += 1;
    mutationRef.current = null;
    scopeRef.current = accountScope;
    redlinkContextRef.current = null;
    setEditor(null);
    setRedlinkForm(null);
    setView({ area: "mine", mode: "list", articleId: null, returnToken: null });
    setPublishedPage({ status: "idle", items: [], nextCursor: null, complete: false, errorCode: null });
    if (!enabled) {
      setPublicationCapability({ status: "unavailable", reason: "account-unavailable" });
      return undefined;
    }
    let active = true;
    const scope = accountScope;
    setPublicationCapability({ status: "checking", reason: null });
    service.capability().then((result) => {
      if (!active || scopeRef.current !== scope) return;
      setPublicationCapability(result?.ok
        ? { status: "ready", reason: null, value: result.capability }
        : { status: "unavailable", reason: result?.reason || "contract-mismatch" });
    }).catch((error) => {
      if (active && scopeRef.current === scope) {
        setPublicationCapability({ status: "unavailable", reason: error?.code || "capability-failed" });
      }
    });
    return () => { active = false; };
  }, [accountScope, enabled, service]);

  useEffect(() => {
    if (publicationCapability.status !== "ready" || !articlesReady || !articles.length
        || typeof writeArticles !== "function") return undefined;
    let active = true;
    const scope = accountScope;
    Promise.all(articles.filter((article) => article?.herkunft !== "gezogen").map(async (article) => {
      const pendingId = article?.publikation?.pending?.operationId || null;
      const readback = await service.ownerReadback(article.id, pendingId);
      return [article.id, article.contentVersion || null, pendingId, readback];
    })).then((readbacks) => {
      if (!active || scopeRef.current !== scope) return;
      void writeArticles((previous) => previous.map((article) => {
        const entry = readbacks.find(([id]) => id === article.id);
        if (!entry || entry[1] !== (article.contentVersion || null)
            || entry[2] !== (article?.publikation?.pending?.operationId || null)) return article;
        return reconcileBlogOwnerReadback(article, entry[3]);
      }));
    }).catch((error) => {
      if (active && scopeRef.current === scope) setError?.(`Veröffentlichungsstand konnte nicht geladen werden (${error?.code || "server"}).`);
    });
    return () => { active = false; };
  }, [accountScope, articlesReady, publicationCapability.status, service, writeArticles]); // Artikelinhalt absichtlich kein Trigger

  useEffect(() => {
    if (!focusedArticleId) return;
    const article = articlesRef.current.find((item) => item.id === focusedArticleId);
    if (article) setView({ area: "mine", mode: "reader", articleId: article.id, returnToken: "external-focus" });
    onFocusConsumed?.();
  }, [focusedArticleId, onFocusConsumed]);

  useEffect(() => {
    setEditor((current) => {
      if (!current?.articleId || current.dirty || current.accountScope !== accountScope) return current;
      /* Owner-Readback hydriert die Autorwahl nur, solange der Nutzer sie im
         aktiven Entwurf noch nicht selbst getroffen hat. */
      if (current.authorDecisionTouched === true) return current;
      const article = articles.find((entry) => entry.id === current.articleId);
      if (!article) return current;
      const snapshot = publicationSnapshot(article);
      if (!snapshot.publicationId) return current;
      const anonymousPublication = !!snapshot.publicationId
        && snapshot.authorMode !== BLOG_AUTHOR_MODE.PROFILE;
      if ((current.publicationId || null) === snapshot.publicationId
          && current.anonymousPublication === anonymousPublication) return current;
      return {
        ...current,
        publicationId: snapshot.publicationId,
        anonymousPublication,
      };
    });
  }, [accountScope, articles]);

  const publicItems = useMemo(() => publishedPage.items.map((item) => {
    const referenceViews = projectPublicBlogReferences(item?.article?.references, {
      selectedSourceIds,
      libraryIndex,
      library,
      libraryReady: libraryReady && selectedServicesReady,
      now: clock(),
    });
    return {
      articleId: item.publicationId,
      publicationId: item.publicationId,
      shareToken: item.shareToken,
      author: item.author,
      title: item.article.title,
      excerpt: excerpt(item.article.text),
      updatedAt: item.updatedAt,
      ordered: item.article.ordered,
      referencePreview: referenceViews.slice(0, 15),
      referenceViews,
      publicRevision: item.publicRevision,
      contentVersion: item.contentVersion,
      displayState: "published",
      publicationError: null,
      article: item.article,
    };
  }), [clock, library, libraryIndex, libraryReady, publishedPage.items, selectedServicesReady, selectedSourceIds]);

  const articleCards = useMemo(() => articles.map((article) => ({
    articleId: article.id,
    title: article.titel,
    excerpt: excerpt(article.text),
    updatedAt: article.updatedAt || article.erstellt_am || null,
    ordered: article.geordnet === true,
    displayState: blogPublicationDisplayState({
      publicationId: article?.publikation?.publicationId,
      contentVersion: article?.contentVersion,
      publishedContentVersion: article?.publikation?.publishedContentVersion,
    }),
    referencePreview: projectPrivateBlogReferences(article.liste, privateTargetIndex, {
      ready: libraryReady && mustwatchReady,
    }).slice(0, 15),
    publicationError: article?.publikation?.errorCode ? {
      status: article?.publikation?.pending?.status === "unknown" ? "unknown" : "failed",
      errorCode: article.publikation.errorCode,
      operationId: article?.publikation?.pending?.operationId || article?.publikation?.operationId || null,
    } : null,
  })), [articles, libraryReady, mustwatchReady, privateTargetIndex]);

  const editorView = useMemo(() => {
    if (!editor) return null;
    const saved = editor.articleId ? articles.find((article) => article.id === editor.articleId) : null;
    const snapshot = publicationSnapshot(saved || editor);
    const displayState = editor.dirty && snapshot.publicationId
      ? blogPublicationDisplayState({
        publicationId: snapshot.publicationId,
        contentVersion: "open-draft",
        publishedContentVersion: snapshot.publishedContentVersion,
      })
      : blogPublicationDisplayState({
        publicationId: snapshot.publicationId,
        contentVersion: saved?.contentVersion || editor.contentVersion,
        publishedContentVersion: snapshot.publishedContentVersion,
      });
    return {
      ...editor,
      publicationId: snapshot.publicationId || editor.publicationId || null,
      displayState,
      references: projectPrivateBlogReferences(editor.references, privateTargetIndex, {
        ready: libraryReady && mustwatchReady,
      }),
    };
  }, [articles, editor, libraryReady, mustwatchReady, privateTargetIndex]);

  const reader = useMemo(() => {
    if (view.mode !== "reader" || !view.articleId) return null;
    if (view.area === "published") {
      const item = publicItems.find((entry) => entry.articleId === view.articleId);
      if (!item) return null;
      return {
        scope: "published",
        article: { articleId: item.articleId, title: item.article.title, text: item.article.text, ordered: item.article.ordered },
        referenceViews: item.referenceViews,
        canEdit: false,
        returnToken: view.returnToken,
      };
    }
    const article = articles.find((entry) => entry.id === view.articleId);
    if (!article) return null;
    return {
      scope: "private",
      article: { articleId: article.id, title: article.titel, text: article.text, ordered: article.geordnet === true },
      referenceViews: projectPrivateBlogReferences(article.liste, privateTargetIndex, {
        ready: libraryReady && mustwatchReady,
      }),
      canEdit: true,
      returnToken: view.returnToken,
    };
  }, [articles, libraryReady, mustwatchReady, privateTargetIndex, publicItems, view]);

  const onNewArticle = useCallback(() => {
    if (editorRef.current?.dirty) {
      return actionResult("failed", { articleId: editorRef.current.articleId, errorCode: "unsaved-draft" });
    }
    const draft = draftFromArticle(null, accountScope);
    setEditor(draft);
    setView({ area: "mine", mode: "editor", articleId: null, returnToken: "mine:list" });
    return actionResult("opened");
  }, [accountScope]);

  const onEditArticle = useCallback(({ articleId }) => {
    const openDraft = editorRef.current;
    if (openDraft?.articleId === articleId && openDraft.accountScope === scopeRef.current) {
      setView({ area: "mine", mode: "editor", articleId, returnToken: "mine:list" });
      return actionResult("opened", { articleId });
    }
    if (openDraft?.dirty) {
      return actionResult("failed", { articleId, errorCode: "unsaved-draft" });
    }
    const article = articlesRef.current.find((entry) => entry.id === articleId);
    if (!article) return actionResult("failed", { articleId, errorCode: "article-not-found" });
    setEditor(draftFromArticle(article, accountScope));
    setView({ area: "mine", mode: "editor", articleId, returnToken: "mine:list" });
    return actionResult("opened", { articleId });
  }, [accountScope]);

  const onReadArticle = useCallback(({ scope, articleId, returnToken }) => {
    const area = scope === "published" ? "published" : "mine";
    setView({ area, mode: "reader", articleId, returnToken: returnToken || `${area}:list` });
    return actionResult("opened", { articleId });
  }, []);

  const onBack = useCallback(({ returnToken } = {}) => {
    const area = returnToken == null
      ? "mine"
      : String(returnToken || view.returnToken || "").startsWith("published") ? "published" : "mine";
    setRedlinkForm(null);
    setView({ area, mode: "list", articleId: null, returnToken: returnToken || view.returnToken || null });
    return actionResult("opened");
  }, [view.area, view.returnToken]);

  const onEditorChange = useCallback((patch) => {
    setEditor((current) => {
      if (!current || current.accountScope !== scopeRef.current || current.saveStatus === "saving") return current;
      const next = { ...current };
      for (const key of ["title", "text", "ordered", "anonymousPublication"]) {
        if (Object.prototype.hasOwnProperty.call(patch || {}, key)) next[key] = patch[key];
      }
      if (Object.prototype.hasOwnProperty.call(patch || {}, "anonymousPublication")) {
        next.authorDecisionTouched = true;
      }
      next.dirty = true;
      next.saveStatus = "idle";
      return next;
    });
  }, []);

  const onAddReference = useCallback(({ draftKey, reference }) => {
    setEditor((current) => {
      if (!current || current.draftKey !== draftKey || current.saveStatus === "saving" || current.references.length >= BLOG_MAX_REFERENCES) return current;
      const row = editorReference({ ...reference, rowId: neueBlogZeilenId() }, current.references.length);
      return { ...current, references: [...current.references, row], dirty: true, saveStatus: "idle" };
    });
  }, []);

  const onApplyReferenceSuggestions = useCallback(async ({ draftKey, contentHash, candidates }) => {
    const before = editorRef.current;
    if (!before || before.draftKey !== draftKey || before.accountScope !== scopeRef.current
        || typeof contentHash !== "string") {
      return actionResult("failed", { errorCode: "stale-draft" });
    }
    let actualHash;
    try {
      actualHash = await blogReferenceContentHash({ title: before.title, text: before.text });
    } catch {
      return actionResult("failed", { errorCode: "hash-failed" });
    }
    const current = editorRef.current;
    if (actualHash !== contentHash || current !== before || current.accountScope !== scopeRef.current) {
      return actionResult("failed", { errorCode: "stale-draft" });
    }
    const result = applyBlogReferenceSuggestionsToDraft(current, {
      draftKey, candidates, library, mustwatch,
    });
    if (result.status !== "applied") return actionResult("failed", { errorCode: result.errorCode });
    editorRef.current = result.draft;
    setEditor(result.draft);
    return actionResult("applied", { addedCount: result.addedCount });
  }, [library, mustwatch]);

  const onMoveReference = useCallback(({ draftKey, rowId, direction }) => {
    setEditor((current) => {
      if (!current || current.draftKey !== draftKey || current.saveStatus === "saving") return current;
      const index = current.references.findIndex((row) => row.rowId === rowId);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= current.references.length) return current;
      const references = [...current.references];
      [references[index], references[target]] = [references[target], references[index]];
      return { ...current, references: references.map(editorReference), dirty: true, saveStatus: "idle" };
    });
  }, []);

  const onRemoveReference = useCallback(({ draftKey, rowId }) => {
    setEditor((current) => {
      if (!current || current.draftKey !== draftKey || current.saveStatus === "saving") return current;
      return {
        ...current,
        references: current.references.filter((row) => row.rowId !== rowId).map(editorReference),
        dirty: true,
        saveStatus: "idle",
      };
    });
  }, []);

  const invalidatePublishedPage = useCallback(() => {
    setPublishedPage({ status: "idle", items: [], nextCursor: null, complete: false, errorCode: null });
  }, []);

  const applyMutationResponse = useCallback(async (articleId, operationId, response, token) => {
    if (!mutationCurrent(token)) return false;
    let accepted = false;
    let resolvedArticle = null;
    await writeArticles((previous) => previous.map((article) => {
      if (article.id !== articleId || article?.publikation?.pending?.operationId !== operationId) return article;
      accepted = true;
      let next = completeBlogPublication(article, operationId, response);
      if (response?.outcome === BLOG_PUBLIC_OUTCOME.DECISION_REQUIRED) {
        const byRow = new Map((response.decisionRequests || []).map((decision) => [decision.rowId, decision.candidates || []]));
        next = { ...next, liste: next.liste.map((row) => byRow.has(row.rowId)
          ? { ...row, decisionCandidates: byRow.get(row.rowId), decisionRequired: true } : row) };
      }
      resolvedArticle = next;
      return next;
    }));
    if (!mutationCurrent(token)) return false;
    if (accepted && resolvedArticle) {
      const candidates = new Map((response?.decisionRequests || [])
        .map((decision) => [decision.rowId, decision.candidates || []]));
      setEditor((current) => current?.articleId === articleId && current.accountScope === token.scope
        ? {
          ...current,
          publicationId: publicationSnapshot(resolvedArticle).publicationId,
          anonymousPublication: response?.publication
            ? response.publication.authorMode !== BLOG_AUTHOR_MODE.PROFILE
            : current.anonymousPublication,
          authorDecisionTouched: response?.publication ? false : current.authorDecisionTouched,
          references: current.references.map((row) => candidates.has(row.rowId)
            ? { ...row, decisionCandidates: candidates.get(row.rowId), decisionRequired: true } : row),
          saveStatus: response?.outcome || "saved",
        }
        : current);
      if ([BLOG_PUBLIC_OUTCOME.PUBLISHED, BLOG_PUBLIC_OUTCOME.UPDATED,
        BLOG_PUBLIC_OUTCOME.WITHDRAWN, BLOG_PUBLIC_OUTCOME.ABSENT].includes(response?.outcome)) {
        invalidatePublishedPage();
      }
    }
    return accepted;
  }, [invalidatePublishedPage, mutationCurrent, writeArticles]);

  const sendMutation = useCallback(async (article, action, request, token) => {
    try {
      const response = action === "publish" ? await service.publishV1(request)
        : action === "update" ? await service.updateV1(request)
          : await service.withdrawV1(request);
      if (!mutationCurrent(token)) {
        return emptyPublication(BLOG_PUBLIC_OUTCOME.UNKNOWN, {
          operationId: request.operationId,
          errorCode: "account-changed",
        });
      }
      await applyMutationResponse(article.id, request.operationId, response, token);
      return mutationPublicationResult(response, request.operationId);
    } catch (error) {
      if (!mutationCurrent(token)) {
        return emptyPublication(BLOG_PUBLIC_OUTCOME.UNKNOWN, {
          operationId: request.operationId,
          errorCode: "account-changed",
        });
      }
      const unknown = error?.requestStarted === true && error?.responseReceived !== true;
      await writeArticles((previous) => previous.map((entry) => entry.id === article.id
        ? (unknown
          ? markBlogPublicationUnknown(entry, request.operationId, error?.code || "unknown")
          : completeBlogPublication(entry, request.operationId, { outcome: "failed", errorCode: error?.code || "server" }))
        : entry));
      if (!mutationCurrent(token)) {
        return emptyPublication(BLOG_PUBLIC_OUTCOME.UNKNOWN, {
          operationId: request.operationId, errorCode: "account-changed",
        });
      }
      return emptyPublication(unknown ? BLOG_PUBLIC_OUTCOME.UNKNOWN : BLOG_PUBLIC_OUTCOME.FAILED, {
        operationId: request.operationId,
        publicationId: publicationSnapshot(article).publicationId,
        publicRevision: publicationSnapshot(article).publicRevision,
        publishedContentVersion: publicationSnapshot(article).publishedContentVersion,
        errorCode: error?.code || "server",
      });
    }
  }, [applyMutationResponse, mutationCurrent, service, writeArticles]);

  const saveDraft = useCallback(async ({ draftKey, anonymousPublication, publishRequested = false }) => {
    const token = beginMutation("save");
    if (!token) return privateFailed(editorRef.current?.articleId, "busy");
    const draft = editorRef.current;
    try {
      if (!draft || draft.draftKey !== draftKey || draft.accountScope !== token.scope
          || typeof writeArticles !== "function") return privateFailed(draft?.articleId, "stale-draft");
      setEditor((current) => current?.draftKey === draftKey ? { ...current, saveStatus: "saving" } : current);
      const existing = draft.articleId ? articlesRef.current.find((entry) => entry.id === draft.articleId) : null;
      const articleId = existing?.id || neueArtikelId(draft.title, articlesRef.current);
      const contentVersion = publicationContentVersion();
      const nowIso = clock();
      let savedArticle = null;
      const privateOk = await writeArticles((previous) => {
        const previousArticle = previous.find((entry) => entry.id === articleId) || null;
        savedArticle = articleFromDraft({ ...draft, anonymousPublication }, previousArticle,
          articleId, contentVersion, nowIso, publicationReferenceItems);
        return previousArticle
          ? previous.map((entry) => entry.id === articleId ? savedArticle : entry)
          : [...previous, savedArticle];
      });
      if (!mutationCurrent(token)) return privateFailed(articleId, "account-changed");
      if (!privateOk || !savedArticle) {
        setEditor((current) => current?.draftKey === draftKey ? { ...current, saveStatus: "failed" } : current);
        return privateFailed(articleId);
      }
      setEditor((current) => current?.draftKey === draftKey ? {
        ...draftFromArticle(savedArticle, token.scope, draftKey),
        anonymousPublication: !!anonymousPublication,
        authorDecisionTouched: draft.authorDecisionTouched === true,
        dirty: false,
        saveStatus: "saving",
      } : current);
      setView((current) => ({ ...current, articleId }));
      const privatePart = { status: "saved", articleId, contentVersion, errorCode: null };
      if (!publishRequested) {
        setEditor((current) => current?.draftKey === draftKey ? { ...current, saveStatus: "saved" } : current);
        return saveResult(privatePart);
      }
      const intent = publicationSnapshot(savedArticle).publicationId
        ? BLOG_SAVE_INTENT.UPDATE : BLOG_SAVE_INTENT.PUBLISH;
      if (publicationCapability.status !== "ready") {
        setEditor((current) => current?.draftKey === draftKey ? { ...current, saveStatus: "failed" } : current);
        return saveResult(privatePart, emptyPublication(BLOG_PUBLIC_OUTCOME.FAILED, { errorCode: "capability-unavailable" }));
      }
      const operationId = publicationOperationId();
      const profileAuthor = publicationCapability.value?.profileAuthor || null;
      const authorDecision = anonymousPublication
        ? { mode: BLOG_AUTHOR_MODE.ANONYMOUS, expectedAuthor: null }
        : { mode: BLOG_AUTHOR_MODE.PROFILE, expectedAuthor: profileAuthor };
      if (!anonymousPublication && !profileAuthor) {
        setEditor((current) => current?.draftKey === draftKey ? { ...current, saveStatus: "failed" } : current);
        return saveResult(privatePart, emptyPublication(BLOG_PUBLIC_OUTCOME.FAILED, { errorCode: "profile-author-unavailable" }));
      }
      const request = createBlogSaveRequest(savedArticle, operationId, intent, publicationReferenceItems, authorDecision);
      const action = intent === BLOG_SAVE_INTENT.UPDATE ? "update" : "publish";
      let operationArticle = null;
      const operationSaved = await writeArticles((previous) => previous.map((entry) => {
        if (entry.id !== articleId || entry.contentVersion !== contentVersion) return entry;
        operationArticle = beginBlogPublication(entry, { action, operationId, request });
        return operationArticle;
      }));
      if (!mutationCurrent(token)) return saveResult(privatePart,
        emptyPublication(BLOG_PUBLIC_OUTCOME.UNKNOWN, { operationId, errorCode: "account-changed" }));
      if (!operationSaved || !operationArticle) {
        setEditor((current) => current?.draftKey === draftKey ? { ...current, saveStatus: "failed" } : current);
        return saveResult(privatePart, emptyPublication(BLOG_PUBLIC_OUTCOME.FAILED, { operationId, errorCode: "operation-save-failed" }));
      }
      const publication = await sendMutation(operationArticle, action, request, token);
      if (mutationCurrent(token)) setEditor((current) => current?.draftKey === draftKey
        ? { ...current, saveStatus: publication.status } : current);
      return saveResult(privatePart, publication);
    } catch (error) {
      if (mutationCurrent(token)) {
        setEditor((current) => current?.draftKey === draftKey
          ? { ...current, saveStatus: "failed" } : current);
      }
      return privateFailed(draft?.articleId || null, error?.code || "private-save-failed");
    } finally {
      finishMutation(token);
    }
  }, [beginMutation, clock, finishMutation, mutationCurrent, publicationCapability.status, publicationCapability.value,
    publicationReferenceItems, sendMutation, writeArticles]);

  const onPrivateSave = useCallback(({ draftKey }) => saveDraft({
    draftKey,
    anonymousPublication: editorRef.current?.anonymousPublication === true,
    publishRequested: false,
  }), [saveDraft]);
  const onPublish = useCallback(({ draftKey, anonymousPublication }) => saveDraft({
    draftKey, anonymousPublication: anonymousPublication === true, publishRequested: true,
  }), [saveDraft]);
  /* Übergangsnaht für bereits vorhandene Integrationen. Neue Oberflächen
     verwenden die zwei expliziten Aktionen. */
  const onSave = useCallback((input = {}) => saveDraft({
    ...input, publishRequested: input.publishRequested === true || input.anonymousPublication === true,
  }), [saveDraft]);

  const onReferenceDecision = useCallback(async ({ articleId, rowId, decision }) => {
    const token = beginMutation("reference-decision");
    if (!token) return actionResult("failed", { articleId, rowId, errorCode: "busy" });
    try {
      let nextArticle = null;
      const ok = await writeArticles((previous) => previous.map((article) => {
        if (article.id !== articleId) return article;
        if (!article.liste.some((row) => row.rowId === rowId)) return article;
        nextArticle = mitNeuerBlogFassung({
          ...article,
          liste: article.liste.map((row) => row.rowId === rowId
            ? { ...row, resolutionIntent: decision, decisionCandidates: [], decisionRequired: false } : row),
        }, publicationContentVersion(), clock());
        return nextArticle;
      }));
      if (!mutationCurrent(token)) return actionResult("failed", { articleId, rowId, errorCode: "account-changed" });
      if (!ok || !nextArticle) return actionResult("failed", { articleId, rowId, errorCode: "private-save-failed" });
      setEditor((current) => current?.articleId === articleId && current.accountScope === token.scope ? {
        ...current,
        contentVersion: nextArticle.contentVersion,
        publicationId: publicationSnapshot(nextArticle).publicationId,
        references: current.references.map((row) => row.rowId === rowId
          ? { ...row, resolutionIntent: decision, decisionCandidates: [], decisionRequired: false } : row),
      } : current);
      return actionResult("saved", { articleId, rowId });
    } finally {
      finishMutation(token);
    }
  }, [beginMutation, clock, finishMutation, mutationCurrent, writeArticles]);

  const onNavigateReference = useCallback(({ referenceId, target }) => {
    if (!target || !["library", "streaming", "cinema"].includes(target.kind)) {
      return actionResult("failed", { rowId: referenceId, errorCode: "invalid-target" });
    }
    const result = navigateTarget?.(target);
    return result === false
      ? actionResult("failed", { rowId: referenceId, errorCode: "target-not-found" })
      : undefined;
  }, [navigateTarget]);

  const onOpenRedlinkForm = useCallback(({ articleId, rowId }) => {
    const openDraft = editorRef.current;
    const editorRow = openDraft
      && (openDraft.articleId === articleId || (!openDraft.articleId && articleId == null))
      ? openDraft.references.find((entry) => entry.rowId === rowId) : null;
    const article = articlesRef.current.find((entry) => entry.id === articleId);
    const privateRow = article?.liste?.find((entry) => entry.rowId === rowId) || null;
    const publicItem = publicItems.find((entry) => entry.articleId === articleId);
    const publicRow = publicItem?.referenceViews?.find((entry) => entry.rowId === rowId) || null;
    const row = editorRow || privateRow || publicRow;
    if (!row) return actionResult("failed", { articleId, rowId, errorCode: "reference-not-found" });
    const source = editorRow ? "editor" : privateRow ? "private" : "published";
    const returnView = { ...viewRef.current };
    redlinkContextRef.current = {
      scope: scopeRef.current, source, articleId, rowId,
      draftKey: editorRow ? openDraft.draftKey : null,
      returnView,
    };
    setRedlinkForm({
      articleId, rowId, status: "open",
      initial: {
        titel: row.title || row.eingabe,
        jahr: row.year ?? row.jahr ?? null,
        typ: row.mediaType || row.typ || "sonstiges",
      },
      errorCode: null,
    });
    setView((current) => ({ ...current, mode: "redlink_form", articleId }));
    return actionResult("opened", { articleId, rowId });
  }, [publicItems]);

  const onCancelRedlinkForm = useCallback(({ articleId, rowId }) => {
    const context = redlinkContextRef.current;
    if (!context || context.scope !== scopeRef.current
        || context.articleId !== articleId || context.rowId !== rowId) {
      return actionResult("failed", { articleId, rowId, mediaWriteConfirmed: false, errorCode: "stale-redlink" });
    }
    redlinkContextRef.current = null;
    setRedlinkForm(null);
    setView(context.returnView);
    return actionResult("cancelled", { articleId, rowId, mediaWriteConfirmed: false });
  }, []);

  const onConfirmRedlinkForm = useCallback(async ({ articleId, rowId, mediaInput }) => {
    const token = beginMutation("redlink");
    if (!token) return actionResult("failed", { articleId, rowId, mediaWriteConfirmed: false, errorCode: "busy" });
    const context = redlinkContextRef.current;
    if (!context || context.scope !== token.scope
        || context.articleId !== articleId || context.rowId !== rowId) {
      finishMutation(token);
      return actionResult("failed", { articleId, rowId, mediaWriteConfirmed: false, errorCode: "stale-redlink" });
    }
    const submittedInput = {
      titel: text(mediaInput?.titel),
      jahr: Number.isInteger(mediaInput?.jahr) ? mediaInput.jahr : null,
      typ: text(mediaInput?.typ) || "sonstiges",
    };
    setRedlinkForm((current) => current?.articleId === articleId && current?.rowId === rowId
      ? { ...current, status: "saving", initial: submittedInput, errorCode: null } : current);
    try {
      const privateRef = await addLibraryItem?.(mediaInput);
      if (!mutationCurrent(token)) return actionResult("failed", {
        articleId, rowId, mediaWriteConfirmed: !!text(privateRef), errorCode: "account-changed",
      });
      if (!text(privateRef)) {
        setRedlinkForm((current) => current ? {
          ...current, status: "failed", initial: submittedInput, errorCode: "media-save-failed",
        } : current);
        return actionResult("failed", { articleId, rowId, mediaWriteConfirmed: false, errorCode: "media-save-failed" });
      }

      if (context.source === "published") {
        redlinkContextRef.current = null;
        setRedlinkForm(null);
        setView(context.returnView);
        return actionResult("saved", {
          articleId, rowId, mediaWriteConfirmed: true,
          reference: { rowId, title: text(mediaInput?.titel), year: mediaInput?.jahr ?? null,
            mediaType: text(mediaInput?.typ) || "sonstiges", linked: true },
        });
      }

      let saved = null;
      let persistedArticleId = articleId;
      if (context.source === "editor") {
        const draft = editorRef.current;
        if (!draft || draft.draftKey !== context.draftKey || draft.accountScope !== token.scope) {
          return actionResult("failed", { articleId, rowId, mediaWriteConfirmed: true, errorCode: "stale-draft" });
        }
        const linkedDraft = {
          ...draft,
          references: draft.references.map((row) => row.rowId === rowId
            ? { ...row, ref: String(privateRef), resolutionIntent: { kind: "auto" }, decisionCandidates: [], decisionRequired: false }
            : row),
        };
        persistedArticleId = draft.articleId || neueArtikelId(draft.title, articlesRef.current);
        const contentVersion = publicationContentVersion();
        const ok = await writeArticles((previous) => {
          const previousArticle = previous.find((entry) => entry.id === persistedArticleId) || null;
          saved = articleFromDraft(linkedDraft, previousArticle, persistedArticleId,
            contentVersion, clock(), [...publicationReferenceItems, {
              id: String(privateRef), titel: text(mediaInput?.titel), jahr: mediaInput?.jahr ?? null,
              typ: text(mediaInput?.typ) || "sonstiges",
            }]);
          return previousArticle
            ? previous.map((entry) => entry.id === persistedArticleId ? saved : entry)
            : [...previous, saved];
        });
        if (!mutationCurrent(token)) return actionResult("failed", {
          articleId: persistedArticleId, rowId, mediaWriteConfirmed: true, errorCode: "account-changed",
        });
        if (!ok || !saved) {
          setRedlinkForm((current) => current ? {
            ...current, status: "failed", initial: submittedInput, errorCode: "reference-save-failed",
          } : current);
          return actionResult("failed", { articleId: persistedArticleId, rowId,
            mediaWriteConfirmed: true, errorCode: "reference-save-failed" });
        }
        setEditor((current) => current?.draftKey === context.draftKey ? {
          ...draftFromArticle(saved, token.scope, context.draftKey),
          anonymousPublication: current.anonymousPublication,
          saveStatus: "saved",
        } : current);
      } else {
        const ok = await writeArticles((previous) => previous.map((article) => {
          if (article.id !== articleId || !article.liste.some((row) => row.rowId === rowId)) return article;
          saved = mitNeuerBlogFassung({
            ...article,
            liste: article.liste.map((row) => row.rowId === rowId
              ? { ...row, ref: String(privateRef), rotlink_ok: false,
                resolutionIntent: { kind: "auto" }, decisionCandidates: [], decisionRequired: false }
              : row),
          }, publicationContentVersion(), clock());
          return saved;
        }));
        if (!mutationCurrent(token)) return actionResult("failed", {
          articleId, rowId, mediaWriteConfirmed: true, errorCode: "account-changed",
        });
        if (!ok || !saved) {
          setRedlinkForm((current) => current ? {
            ...current, status: "failed", initial: submittedInput, errorCode: "reference-save-failed",
          } : current);
          return actionResult("failed", { articleId, rowId, mediaWriteConfirmed: true, errorCode: "reference-save-failed" });
        }
      }
      const row = saved.liste.find((entry) => entry.rowId === rowId);
      redlinkContextRef.current = null;
      setRedlinkForm(null);
      setView({ ...context.returnView, articleId: context.source === "editor"
        ? persistedArticleId : context.returnView.articleId });
      return actionResult("saved", {
        articleId: persistedArticleId, rowId, mediaWriteConfirmed: true,
        reference: { rowId, title: row.eingabe, year: row.jahr ?? null, mediaType: row.typ || "sonstiges", linked: true },
      });
    } finally {
      finishMutation(token);
    }
  }, [addLibraryItem, beginMutation, clock, finishMutation, mutationCurrent,
    publicationReferenceItems, writeArticles]);

  const onRetryPublication = useCallback(async ({ articleId, operationId }) => {
    const token = beginMutation("retry");
    if (!token) return privateFailed(articleId, "busy");
    let article = articlesRef.current.find((entry) => entry.id === articleId);
    const pending = article?.publikation?.pending;
    try {
      if (!article || !pending || pending.operationId !== operationId
          || pending.contentVersion !== article.contentVersion) return privateFailed(articleId, "retry-stale");
      let readback;
      try {
        readback = await service.ownerReadback(articleId, operationId);
        if (!mutationCurrent(token)) return privateFailed(articleId, "account-changed");
        const reconciled = reconcileBlogOwnerReadback(article, readback);
        await writeArticles((previous) => previous.map((entry) => entry.id === articleId ? reconciled : entry));
        if (!mutationCurrent(token)) return privateFailed(articleId, "account-changed");
        article = reconciled;
        if (!article?.publikation?.pending) {
          invalidatePublishedPage();
          return saveResult({ status: "saved", articleId, contentVersion: article.contentVersion, errorCode: null },
            emptyPublication(readback?.operation?.result?.outcome || BLOG_PUBLIC_OUTCOME.FAILED, {
              operationId, publicationId: article?.publikation?.publicationId || null,
              publicRevision: article?.publikation?.publicRevision || null,
              publishedContentVersion: article?.publikation?.publishedContentVersion || null,
              errorCode: readback?.operation?.errorCode || null,
            }));
        }
      } catch (error) {
        return saveResult({ status: "saved", articleId, contentVersion: article.contentVersion, errorCode: null },
          emptyPublication(BLOG_PUBLIC_OUTCOME.UNKNOWN, { operationId, errorCode: error?.code || "readback-failed" }));
      }
      const publication = await sendMutation(article, pending.action, pending.request, token);
      return saveResult({ status: "saved", articleId, contentVersion: article.contentVersion, errorCode: null }, publication);
    } finally {
      finishMutation(token);
    }
  }, [beginMutation, finishMutation, invalidatePublishedPage, mutationCurrent, sendMutation, service, writeArticles]);

  const withdrawArticle = useCallback(async (originalArticle, token) => {
    let article = originalArticle;
    let snapshot = publicationSnapshot(article);
    const pendingId = article?.publikation?.pending?.operationId || null;
    const mustConfirm = publicationMayExist(article) && (!snapshot.publicationId || !!pendingId);
    if (mustConfirm) {
      try {
        const readback = await service.ownerReadback(article.id, pendingId);
        if (!mutationCurrent(token)) return {
          status: BLOG_PUBLIC_OUTCOME.UNKNOWN, operationId: pendingId,
          publicationId: snapshot.publicationId, expectedPublicRevision: snapshot.publicRevision,
          actualPublicRevision: null, errorCode: "account-changed",
        };
        article = readback?.currentPublication
          ? reconcileBlogOwnerReadback(article, readback)
          : applyOwnerPublication(article, null, { pending: null, errorCode: null, decisionRequests: [] });
        await writeArticles((previous) => previous.map((entry) => entry.id === article.id ? article : entry));
        if (!mutationCurrent(token)) return {
          status: BLOG_PUBLIC_OUTCOME.UNKNOWN, operationId: pendingId,
          publicationId: snapshot.publicationId, expectedPublicRevision: snapshot.publicRevision,
          actualPublicRevision: null, errorCode: "account-changed",
        };
        snapshot = publicationSnapshot(article);
      } catch (error) {
        return {
          status: BLOG_PUBLIC_OUTCOME.UNKNOWN, operationId: pendingId,
          publicationId: snapshot.publicationId, expectedPublicRevision: snapshot.publicRevision,
          actualPublicRevision: null, errorCode: error?.code || "readback-failed",
        };
      }
    }
    if (!snapshot.publicationId) {
      if (publicationMayExist(article)) return {
        status: BLOG_PUBLIC_OUTCOME.UNKNOWN, operationId: pendingId,
        publicationId: null, expectedPublicRevision: null,
        actualPublicRevision: null, errorCode: "publication-unconfirmed",
      };
      invalidatePublishedPage();
      return {
      status: BLOG_PUBLIC_OUTCOME.ABSENT, operationId: null, publicationId: null,
      expectedPublicRevision: null, actualPublicRevision: null, errorCode: null,
      };
    }
    const operationId = publicationOperationId();
    const request = {
      contractVersion: BLOG_CONTRACT_VERSION, operationId,
      privateArticleId: article.id, expectedPublicRevision: snapshot.publicRevision,
    };
    let operationArticle = null;
    if (!mutationCurrent(token)) return {
      status: BLOG_PUBLIC_OUTCOME.UNKNOWN, operationId, publicationId: snapshot.publicationId,
      expectedPublicRevision: snapshot.publicRevision, actualPublicRevision: null, errorCode: "account-changed",
    };
    const saved = await writeArticles((previous) => previous.map((entry) => {
      if (entry.id !== article.id) return entry;
      operationArticle = beginBlogPublication(entry, { action: "withdraw", operationId, request });
      return operationArticle;
    }));
    if (!mutationCurrent(token)) return {
      status: BLOG_PUBLIC_OUTCOME.UNKNOWN, operationId, publicationId: snapshot.publicationId,
      expectedPublicRevision: snapshot.publicRevision, actualPublicRevision: null, errorCode: "account-changed",
    };
    if (!saved || !operationArticle) return {
      status: BLOG_PUBLIC_OUTCOME.FAILED, operationId, publicationId: snapshot.publicationId,
      expectedPublicRevision: snapshot.publicRevision, actualPublicRevision: null, errorCode: "operation-save-failed",
    };
    const result = await sendMutation(operationArticle, "withdraw", request, token);
    return {
      status: result.status, operationId,
      publicationId: result.publicationId || snapshot.publicationId,
      expectedPublicRevision: snapshot.publicRevision,
      actualPublicRevision: result.status === BLOG_PUBLIC_OUTCOME.CONFLICT ? result.publicRevision : null,
      errorCode: result.errorCode,
    };
  }, [invalidatePublishedPage, mutationCurrent, sendMutation, service, writeArticles]);

  const onWithdraw = useCallback(async ({ articleId }) => {
    const token = beginMutation("withdraw");
    if (!token) return {
      status: BLOG_PUBLIC_OUTCOME.FAILED, operationId: null, publicationId: null,
      expectedPublicRevision: null, actualPublicRevision: null, errorCode: "busy",
    };
    const article = articlesRef.current.find((entry) => entry.id === articleId);
    try {
      if (!article) return {
        status: BLOG_PUBLIC_OUTCOME.FAILED, operationId: null, publicationId: null,
        expectedPublicRevision: null, actualPublicRevision: null, errorCode: "article-not-found",
      };
      return await withdrawArticle(article, token);
    } finally {
      finishMutation(token);
    }
  }, [beginMutation, finishMutation, withdrawArticle]);

  const onDelete = useCallback(async ({ articleId }) => {
    const token = beginMutation("delete");
    if (!token) return {
      publication: { status: BLOG_PUBLIC_OUTCOME.FAILED, operationId: null, expectedPublicRevision: null, actualPublicRevision: null, errorCode: "busy" },
      private: { status: "kept", articleId, errorCode: null },
    };
    const article = articlesRef.current.find((entry) => entry.id === articleId);
    try {
      if (!article) return {
        publication: { status: BLOG_PUBLIC_OUTCOME.ABSENT, operationId: null, expectedPublicRevision: null, actualPublicRevision: null, errorCode: null },
        private: { status: "failed", articleId, errorCode: "article-not-found" },
      };
      const publication = await withdrawArticle(article, token);
      if (![BLOG_PUBLIC_OUTCOME.WITHDRAWN, BLOG_PUBLIC_OUTCOME.ABSENT].includes(publication.status)) {
        return { publication, private: { status: "kept", articleId, errorCode: null } };
      }
      if (!mutationCurrent(token)) return {
        publication: { ...publication, status: BLOG_PUBLIC_OUTCOME.UNKNOWN, errorCode: "account-changed" },
        private: { status: "kept", articleId, errorCode: null },
      };
      const deleted = await writeArticles((previous) => previous.filter((entry) => entry.id !== articleId));
      if (!mutationCurrent(token)) return {
        publication: { ...publication, status: BLOG_PUBLIC_OUTCOME.UNKNOWN, errorCode: "account-changed" },
        private: { status: "kept", articleId, errorCode: null },
      };
      return {
        publication,
        private: { status: deleted ? "deleted" : "failed", articleId, errorCode: deleted ? null : "private-delete-failed" },
      };
    } finally {
      finishMutation(token);
    }
  }, [beginMutation, finishMutation, mutationCurrent, withdrawArticle, writeArticles]);

  const onLoadPublished = useCallback(async ({ cursor = null, replace = false } = {}) => {
    if (replace) setView({ area: "published", mode: "list", articleId: null, returnToken: null });
    if (publicationCapability.status !== "ready") {
      const errorCode = publicationCapability.status === "checking"
        ? "capability-checking"
        : publicationCapability.reason || "capability-unavailable";
      setPublishedPage((current) => ({ ...current, status: "failed", errorCode }));
      return actionResult("failed", { errorCode });
    }
    if (!replace && cursor !== publishedPage.nextCursor) return actionResult("failed", { errorCode: "cursor-mismatch" });
    const token = beginMutation("load-published");
    if (!token) {
      setPublishedPage((current) => ({ ...current, status: "failed", errorCode: "busy" }));
      return actionResult("failed", { errorCode: "busy" });
    }
    setPublishedPage((current) => ({ ...current, status: "loading", errorCode: null }));
    try {
      const result = await service.listV1({ cursor });
      if (!mutationCurrent(token)) return actionResult("failed", { errorCode: "account-changed" });
      setPublishedPage((current) => ({
        status: "loaded",
        items: replace ? result.page.items : [...current.items, ...result.page.items],
        nextCursor: result.page.nextCursor,
        complete: result.page.complete,
        errorCode: null,
      }));
      return actionResult("loaded");
    } catch (error) {
      if (!mutationCurrent(token)) return actionResult("failed", { errorCode: "account-changed" });
      setPublishedPage((current) => ({ ...current, status: "failed", errorCode: error?.code || "server" }));
      return actionResult("failed", { errorCode: error?.code || "server" });
    } finally {
      finishMutation(token);
    }
  }, [beginMutation, finishMutation, mutationCurrent, publicationCapability.reason,
    publicationCapability.status, publishedPage.nextCursor, service]);

  return {
    publicationCapability,
    view,
    editor: editorView,
    reader,
    redlinkForm,
    articleCards,
    publishedPage: { ...publishedPage, items: publicItems },
    actions: {
      onNewArticle, onEditArticle, onReadArticle, onBack, onEditorChange,
      onAddReference, onApplyReferenceSuggestions, onMoveReference, onRemoveReference,
      onPrivateSave, onPublish, onSave,
      onReferenceDecision, onNavigateReference, onOpenRedlinkForm,
      onCancelRedlinkForm, onConfirmRedlinkForm, onRetryPublication,
      onWithdraw, onDelete, onLoadPublished,
    },
  };
}

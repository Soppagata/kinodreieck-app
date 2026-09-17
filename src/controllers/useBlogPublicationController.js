import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLOG_CONTRACT_VERSION,
  BLOG_PUBLIC_OUTCOME,
  BLOG_SAVE_INTENT,
  BLOG_STREAMING_SOURCE_IDS,
  blogPublicationDisplayState,
  blogSaveIntent,
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
  publicationContentVersion,
  publicationOperationId,
  publicationSnapshot,
} from "../lib/sharedPublication.js";
import { sharedArticlesService } from "../services/sharedArticles.js";

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
function currentPublication(article) {
  const snapshot = publicationSnapshot(article);
  return snapshot.publicationId ? snapshot : null;
}

export function createBlogSaveRequest(article, operationId, intent, library) {
  const snapshot = publicationSnapshot(article);
  return {
    contractVersion: BLOG_CONTRACT_VERSION,
    operationId,
    contentVersion: article.contentVersion,
    privateArticleId: article.id,
    expectedPublicRevision: intent === BLOG_SAVE_INTENT.UPDATE ? snapshot.publicRevision : null,
    article: projectPrivateArticleForPublication(article, library),
  };
}

export function reconcileBlogOwnerReadback(article, readback) {
  if (!article || readback?.privateArticleId !== article.id) return article;
  const pending = article?.publikation?.pending || null;
  const operation = readback?.operation;
  if (pending && operation?.operationId === pending.operationId && operation.status === "applied"
      && operation.result) return completeBlogPublication(article, pending.operationId, operation.result);
  if (pending && operation?.operationId === pending.operationId
      && ["not_applied", "conflict"].includes(operation.status)) {
    return applyOwnerPublication(article, readback.currentPublication, {
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
    references, anonymousPublication: false, dirty: false, saveStatus: "idle",
  };
}

function articleFromDraft(draft, previous, articleId, contentVersion, nowIso) {
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
    rank: index + 1,
  }));
  const next = {
    ...(previous || {}), id: articleId, titel: text(draft.title), autor: previous?.autor || "",
    text: String(draft.text || ""), geordnet: draft.ordered === true,
    erstellt_am: previous?.erstellt_am || nowIso,
    status: references.some((row) => row.decisionCandidates.length && row.resolutionIntent?.kind === "auto")
      ? "wartet" : "freigegeben",
    liste: references,
  };
  return mitNeuerBlogFassung(next, contentVersion, nowIso);
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
  articlesRef.current = articles;
  editorRef.current = editor;

  const libraryIndex = useMemo(() => buildBlogLibraryIndex(library), [library]);
  const privateTargetIndex = useMemo(() => buildPrivateBlogTargetIndex(library, mustwatch), [library, mustwatch]);
  const publicationReferenceItems = useMemo(() => [...(Array.isArray(library) ? library : []), ...(Array.isArray(mustwatch) ? mustwatch : [])], [library, mustwatch]);
  const selectedSourceIds = useMemo(() => {
    const selected = canonicalBlogSourceIds(selectedServices);
    return selectedServicesReady && Array.isArray(selectedServices) && selectedServices.length === 0
      ? [...BLOG_STREAMING_SOURCE_IDS] : selected;
  }, [selectedServices, selectedServicesReady]);

  useEffect(() => {
    scopeRef.current = accountScope;
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
        ? { status: "ready", reason: null }
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
      return [article.id, readback];
    })).then((readbacks) => {
      if (!active || scopeRef.current !== scope) return;
      void writeArticles((previous) => previous.map((article) => {
        const entry = readbacks.find(([id]) => id === article.id);
        return entry ? reconcileBlogOwnerReadback(article, entry[1]) : article;
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

  const publicItems = useMemo(() => publishedPage.items.map((item) => {
    const referenceViews = projectPublicBlogReferences(item?.article?.references, {
      selectedSourceIds,
      libraryIndex,
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
      referencePreview: referenceViews.slice(0, 3),
      referenceViews,
      publicRevision: item.publicRevision,
      contentVersion: item.contentVersion,
      displayState: "published",
      publicationError: null,
      article: item.article,
    };
  }), [clock, libraryIndex, libraryReady, publishedPage.items, selectedServicesReady, selectedSourceIds]);

  const articleCards = useMemo(() => articles.map((article) => ({
    articleId: article.id,
    title: article.titel,
    excerpt: excerpt(article.text),
    updatedAt: article.updatedAt || article.erstellt_am || null,
    displayState: blogPublicationDisplayState({
      publicationId: article?.publikation?.publicationId,
      contentVersion: article?.contentVersion,
      publishedContentVersion: article?.publikation?.publishedContentVersion,
    }),
    referencePreview: projectPrivateBlogReferences(article.liste, privateTargetIndex, {
      ready: libraryReady && mustwatchReady,
    }).slice(0, 3),
    publicationError: article?.publikation?.errorCode ? {
      status: article?.publikation?.pending?.status === "unknown" ? "unknown" : "failed",
      errorCode: article.publikation.errorCode,
      operationId: article?.publikation?.pending?.operationId || article?.publikation?.operationId || null,
    } : null,
  })), [articles, libraryReady, mustwatchReady, privateTargetIndex]);

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
    const draft = draftFromArticle(null, accountScope);
    setEditor(draft);
    setView({ area: "mine", mode: "editor", articleId: null, returnToken: "mine:list" });
    return actionResult("opened");
  }, [accountScope]);

  const onEditArticle = useCallback(({ articleId }) => {
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
      if (!current || current.accountScope !== scopeRef.current) return current;
      const next = { ...current };
      for (const key of ["title", "text", "ordered", "anonymousPublication"]) {
        if (Object.prototype.hasOwnProperty.call(patch || {}, key)) next[key] = patch[key];
      }
      next.dirty = true;
      next.saveStatus = "idle";
      return next;
    });
  }, []);

  const onAddReference = useCallback(({ draftKey, reference }) => {
    setEditor((current) => {
      if (!current || current.draftKey !== draftKey || current.references.length >= 15) return current;
      const row = editorReference({ ...reference, rowId: neueBlogZeilenId() }, current.references.length);
      return { ...current, references: [...current.references, row], dirty: true, saveStatus: "idle" };
    });
  }, []);

  const onMoveReference = useCallback(({ draftKey, rowId, direction }) => {
    setEditor((current) => {
      if (!current || current.draftKey !== draftKey) return current;
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
      if (!current || current.draftKey !== draftKey) return current;
      return {
        ...current,
        references: current.references.filter((row) => row.rowId !== rowId).map(editorReference),
        dirty: true,
        saveStatus: "idle",
      };
    });
  }, []);

  const applyMutationResponse = useCallback(async (articleId, operationId, response) => {
    let accepted = false;
    await writeArticles((previous) => previous.map((article) => {
      if (article.id !== articleId || article?.publikation?.pending?.operationId !== operationId) return article;
      accepted = true;
      let next = completeBlogPublication(article, operationId, response);
      if (response?.outcome === BLOG_PUBLIC_OUTCOME.DECISION_REQUIRED) {
        const byRow = new Map((response.decisionRequests || []).map((decision) => [decision.rowId, decision.candidates || []]));
        next = { ...next, liste: next.liste.map((row) => byRow.has(row.rowId)
          ? { ...row, decisionCandidates: byRow.get(row.rowId) } : row) };
      }
      return next;
    }));
    return accepted;
  }, [writeArticles]);

  const sendMutation = useCallback(async (article, action, request) => {
    const operationScope = scopeRef.current;
    try {
      const response = action === "publish" ? await service.publishV1(request)
        : action === "update" ? await service.updateV1(request)
          : await service.withdrawV1(request);
      if (scopeRef.current !== operationScope) {
        return emptyPublication(BLOG_PUBLIC_OUTCOME.UNKNOWN, {
          operationId: request.operationId,
          errorCode: "account-changed",
        });
      }
      await applyMutationResponse(article.id, request.operationId, response);
      return mutationPublicationResult(response, request.operationId);
    } catch (error) {
      if (scopeRef.current !== operationScope) {
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
      return emptyPublication(unknown ? BLOG_PUBLIC_OUTCOME.UNKNOWN : BLOG_PUBLIC_OUTCOME.FAILED, {
        operationId: request.operationId,
        publicationId: publicationSnapshot(article).publicationId,
        publicRevision: publicationSnapshot(article).publicRevision,
        publishedContentVersion: publicationSnapshot(article).publishedContentVersion,
        errorCode: error?.code || "server",
      });
    }
  }, [applyMutationResponse, service, writeArticles]);

  const onSave = useCallback(async ({ draftKey, anonymousPublication }) => {
    const draft = editorRef.current;
    if (!draft || draft.draftKey !== draftKey || draft.accountScope !== scopeRef.current
        || typeof writeArticles !== "function") return privateFailed(draft?.articleId, "stale-draft");
    const existing = draft.articleId ? articlesRef.current.find((entry) => entry.id === draft.articleId) : null;
    const articleId = existing?.id || neueArtikelId(draft.title, articlesRef.current);
    const contentVersion = publicationContentVersion();
    const nowIso = clock();
    let savedArticle = null;
    const privateOk = await writeArticles((previous) => {
      const previousArticle = previous.find((entry) => entry.id === articleId) || null;
      savedArticle = articleFromDraft({ ...draft, anonymousPublication }, previousArticle, articleId, contentVersion, nowIso);
      return previousArticle
        ? previous.map((entry) => entry.id === articleId ? savedArticle : entry)
        : [...previous, savedArticle];
    });
    if (!privateOk || !savedArticle) return privateFailed(articleId);
    setEditor((current) => current?.draftKey === draftKey ? {
      ...draftFromArticle(savedArticle, scopeRef.current, draftKey),
      anonymousPublication: !!anonymousPublication,
      dirty: false,
      saveStatus: "saved",
    } : current);
    setView((current) => ({ ...current, articleId }));
    const privatePart = { status: "saved", articleId, contentVersion, errorCode: null };
    const intent = blogSaveIntent({
      hasPublication: !!publicationSnapshot(savedArticle).publicationId,
      anonymousPublication: !!anonymousPublication,
    });
    if (intent === BLOG_SAVE_INTENT.PRIVATE_ONLY) return saveResult(privatePart);
    if (publicationCapability.status !== "ready") {
      return saveResult(privatePart, emptyPublication(BLOG_PUBLIC_OUTCOME.FAILED, { errorCode: "capability-unavailable" }));
    }
    const operationId = publicationOperationId();
    const request = createBlogSaveRequest(savedArticle, operationId, intent, publicationReferenceItems);
    const action = intent === BLOG_SAVE_INTENT.UPDATE ? "update" : "publish";
    let operationArticle = null;
    const operationSaved = await writeArticles((previous) => previous.map((entry) => {
      if (entry.id !== articleId || entry.contentVersion !== contentVersion) return entry;
      operationArticle = beginBlogPublication(entry, { action, operationId, request });
      return operationArticle;
    }));
    if (!operationSaved || !operationArticle) {
      return saveResult(privatePart, emptyPublication(BLOG_PUBLIC_OUTCOME.FAILED, { operationId, errorCode: "operation-save-failed" }));
    }
    return saveResult(privatePart, await sendMutation(operationArticle, action, request));
  }, [clock, publicationCapability.status, publicationReferenceItems, sendMutation, writeArticles]);

  const onReferenceDecision = useCallback(async ({ articleId, rowId, decision }) => {
    let nextArticle = null;
    const ok = await writeArticles((previous) => previous.map((article) => {
      if (article.id !== articleId) return article;
      if (!article.liste.some((row) => row.rowId === rowId)) return article;
      nextArticle = mitNeuerBlogFassung({
        ...article,
        liste: article.liste.map((row) => row.rowId === rowId
          ? { ...row, resolutionIntent: decision, decisionCandidates: [] } : row),
      }, publicationContentVersion(), clock());
      return nextArticle;
    }));
    if (!ok || !nextArticle) return actionResult("failed", { articleId, rowId, errorCode: "private-save-failed" });
    if (editorRef.current?.articleId === articleId) setEditor(draftFromArticle(nextArticle, scopeRef.current, editorRef.current.draftKey));
    return actionResult("saved", { articleId, rowId });
  }, [clock, writeArticles]);

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
    const article = articlesRef.current.find((entry) => entry.id === articleId);
    const row = article?.liste?.find((entry) => entry.rowId === rowId);
    if (!row) return actionResult("failed", { articleId, rowId, errorCode: "reference-not-found" });
    setRedlinkForm({
      articleId, rowId, status: "open",
      initial: { titel: row.eingabe, jahr: row.jahr ?? null, typ: row.typ || "sonstiges" },
      errorCode: null,
    });
    setView((current) => ({ ...current, mode: "redlink_form", articleId }));
    return actionResult("opened", { articleId, rowId });
  }, []);

  const onCancelRedlinkForm = useCallback(({ articleId, rowId }) => {
    setRedlinkForm(null);
    setView((current) => ({ ...current, mode: "reader", articleId }));
    return actionResult("cancelled", { articleId, rowId, mediaWriteConfirmed: false });
  }, []);

  const onConfirmRedlinkForm = useCallback(async ({ articleId, rowId, mediaInput }) => {
    setRedlinkForm((current) => current?.articleId === articleId && current?.rowId === rowId
      ? { ...current, status: "saving", errorCode: null } : current);
    const privateRef = await addLibraryItem?.(mediaInput);
    if (!text(privateRef)) {
      setRedlinkForm((current) => current ? { ...current, status: "failed", errorCode: "media-save-failed" } : current);
      return actionResult("failed", { articleId, rowId, mediaWriteConfirmed: false, errorCode: "media-save-failed" });
    }
    let saved = null;
    const ok = await writeArticles((previous) => previous.map((article) => {
      if (article.id !== articleId || !article.liste.some((row) => row.rowId === rowId)) return article;
      saved = mitNeuerBlogFassung({
        ...article,
        liste: article.liste.map((row) => row.rowId === rowId
          ? { ...row, ref: String(privateRef), rotlink_ok: false, resolutionIntent: { kind: "auto" }, decisionCandidates: [] }
          : row),
      }, publicationContentVersion(), clock());
      return saved;
    }));
    if (!ok || !saved) {
      setRedlinkForm((current) => current ? { ...current, status: "failed", errorCode: "reference-save-failed" } : current);
      return actionResult("failed", { articleId, rowId, mediaWriteConfirmed: true, errorCode: "reference-save-failed" });
    }
    const row = saved.liste.find((entry) => entry.rowId === rowId);
    setRedlinkForm(null);
    setView((current) => ({ ...current, mode: "reader", articleId }));
    return actionResult("saved", {
      articleId, rowId, mediaWriteConfirmed: true,
      reference: { rowId, title: row.eingabe, year: row.jahr ?? null, mediaType: row.typ || "sonstiges", linked: true },
    });
  }, [addLibraryItem, clock, writeArticles]);

  const onRetryPublication = useCallback(async ({ articleId, operationId }) => {
    let article = articlesRef.current.find((entry) => entry.id === articleId);
    const pending = article?.publikation?.pending;
    if (!article || !pending || pending.operationId !== operationId
        || pending.contentVersion !== article.contentVersion) return privateFailed(articleId, "retry-stale");
    try {
      const readback = await service.ownerReadback(articleId, operationId);
      const reconciled = reconcileBlogOwnerReadback(article, readback);
      await writeArticles((previous) => previous.map((entry) => entry.id === articleId ? reconciled : entry));
      article = reconciled;
      if (!article?.publikation?.pending) {
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
    const publication = await sendMutation(article, pending.action, pending.request);
    return saveResult({ status: "saved", articleId, contentVersion: article.contentVersion, errorCode: null }, publication);
  }, [sendMutation, service, writeArticles]);

  const withdrawArticle = useCallback(async (article) => {
    const snapshot = publicationSnapshot(article);
    if (!snapshot.publicationId) return {
      status: BLOG_PUBLIC_OUTCOME.ABSENT, operationId: null, publicationId: null,
      expectedPublicRevision: null, actualPublicRevision: null, errorCode: null,
    };
    const operationId = publicationOperationId();
    const request = {
      contractVersion: BLOG_CONTRACT_VERSION, operationId,
      privateArticleId: article.id, expectedPublicRevision: snapshot.publicRevision,
    };
    let operationArticle = null;
    const saved = await writeArticles((previous) => previous.map((entry) => {
      if (entry.id !== article.id) return entry;
      operationArticle = beginBlogPublication(entry, { action: "withdraw", operationId, request });
      return operationArticle;
    }));
    if (!saved || !operationArticle) return {
      status: BLOG_PUBLIC_OUTCOME.FAILED, operationId, publicationId: snapshot.publicationId,
      expectedPublicRevision: snapshot.publicRevision, actualPublicRevision: null, errorCode: "operation-save-failed",
    };
    const result = await sendMutation(operationArticle, "withdraw", request);
    return {
      status: result.status, operationId,
      publicationId: result.publicationId || snapshot.publicationId,
      expectedPublicRevision: snapshot.publicRevision,
      actualPublicRevision: result.status === BLOG_PUBLIC_OUTCOME.CONFLICT ? result.publicRevision : null,
      errorCode: result.errorCode,
    };
  }, [sendMutation, writeArticles]);

  const onWithdraw = useCallback(async ({ articleId }) => {
    const article = articlesRef.current.find((entry) => entry.id === articleId);
    if (!article) return {
      status: BLOG_PUBLIC_OUTCOME.FAILED, operationId: null, publicationId: null,
      expectedPublicRevision: null, actualPublicRevision: null, errorCode: "article-not-found",
    };
    return withdrawArticle(article);
  }, [withdrawArticle]);

  const onDelete = useCallback(async ({ articleId }) => {
    const article = articlesRef.current.find((entry) => entry.id === articleId);
    if (!article) return {
      publication: { status: BLOG_PUBLIC_OUTCOME.ABSENT, operationId: null, expectedPublicRevision: null, actualPublicRevision: null, errorCode: null },
      private: { status: "failed", articleId, errorCode: "article-not-found" },
    };
    const publication = currentPublication(article) ? await withdrawArticle(article) : {
      status: BLOG_PUBLIC_OUTCOME.ABSENT, operationId: null, expectedPublicRevision: null, actualPublicRevision: null, errorCode: null,
    };
    if (![BLOG_PUBLIC_OUTCOME.WITHDRAWN, BLOG_PUBLIC_OUTCOME.ABSENT].includes(publication.status)) {
      return { publication, private: { status: "kept", articleId, errorCode: null } };
    }
    const deleted = await writeArticles((previous) => previous.filter((entry) => entry.id !== articleId));
    return {
      publication,
      private: { status: deleted ? "deleted" : "failed", articleId, errorCode: deleted ? null : "private-delete-failed" },
    };
  }, [withdrawArticle, writeArticles]);

  const onLoadPublished = useCallback(async ({ cursor = null, replace = false } = {}) => {
    if (publicationCapability.status !== "ready") return actionResult("failed", { errorCode: "capability-unavailable" });
    if (!replace && cursor !== publishedPage.nextCursor) return actionResult("failed", { errorCode: "cursor-mismatch" });
    setPublishedPage((current) => ({ ...current, status: "loading", errorCode: null }));
    try {
      const result = await service.listV1({ cursor });
      setPublishedPage((current) => ({
        status: "loaded",
        items: replace ? result.page.items : [...current.items, ...result.page.items],
        nextCursor: result.page.nextCursor,
        complete: result.page.complete,
        errorCode: null,
      }));
      setView({ area: "published", mode: "list", articleId: null, returnToken: null });
      return actionResult("loaded");
    } catch (error) {
      setPublishedPage((current) => ({ ...current, status: "failed", errorCode: error?.code || "server" }));
      return actionResult("failed", { errorCode: error?.code || "server" });
    }
  }, [publicationCapability.status, publishedPage.nextCursor, service]);

  return {
    publicationCapability,
    view,
    editor,
    reader,
    redlinkForm,
    articleCards,
    publishedPage: { ...publishedPage, items: publicItems },
    actions: {
      onNewArticle, onEditArticle, onReadArticle, onBack, onEditorChange,
      onAddReference, onMoveReference, onRemoveReference, onSave,
      onReferenceDecision, onNavigateReference, onOpenRedlinkForm,
      onCancelRedlinkForm, onConfirmRedlinkForm, onRetryPublication,
      onWithdraw, onDelete, onLoadPublished,
    },
  };
}

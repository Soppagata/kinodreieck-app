/* Persistierter Zustandsautomat für die öffentliche Projektion eines Artikels.
   Die Fachregel bleibt klein: ein Vorgang besitzt eine ID; nur seine eigene
   Antwort darf ihn abschließen. So kann eine verspätete Publish-Antwort keinen
   später begonnenen Unpublish-Vorgang überschreiben. */

export const SHARED_PUBLICATION_STATUS = Object.freeze({
  LOCAL: "local",
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  UNPUBLISHING: "unpublishing",
  ERROR: "error",
});

export const SHARED_PUBLICATION_ACTION = Object.freeze({
  PUBLISH: "publish",
  UPDATE: "update",
  UNPUBLISH: "unpublish",
  WITHDRAW: "withdraw",
  DELETE: "delete",
});

function uuidFallback() {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function publicationOperationId(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  try {
    if (randomUUID) return randomUUID();
  } catch { /* Fallback unten */ }
  return uuidFallback();
}

export const publicationContentVersion = publicationOperationId;

export function publicationSnapshot(article) {
  const state = article?.publikation;
  return {
    publicationId: state?.publicationId || null,
    shareToken: state?.shareToken || null,
    publicRevision: Number.isInteger(state?.publicRevision) && state.publicRevision > 0
      ? state.publicRevision : null,
    publishedContentVersion: state?.publishedContentVersion || null,
    updatedAt: state?.updatedAt || null,
  };
}

export function applyOwnerPublication(article, currentPublication, {
  pending = article?.publikation?.pending || null,
  errorCode = null,
  decisionRequests = article?.publikation?.decisionRequests || [],
} = {}) {
  const current = currentPublication && typeof currentPublication === "object"
    ? currentPublication : null;
  return {
    ...article,
    geteilt: !!current,
    publikation: {
      status: current ? SHARED_PUBLICATION_STATUS.PUBLISHED : SHARED_PUBLICATION_STATUS.LOCAL,
      action: pending?.action || null,
      operationId: pending?.operationId || null,
      pending,
      errorCode,
      decisionRequests: Array.isArray(decisionRequests) ? decisionRequests : [],
      publicationId: current?.publicationId || null,
      shareToken: current?.shareToken || null,
      publicRevision: Number.isInteger(current?.publicRevision) ? current.publicRevision : null,
      publishedContentVersion: current?.publishedContentVersion || null,
      updatedAt: current?.updatedAt || null,
    },
  };
}

export function beginBlogPublication(article, { action, operationId, request }) {
  return applyOwnerPublication(article, publicationSnapshot(article).publicationId
    ? publicationSnapshot(article) : null, {
    pending: { action, operationId, request, contentVersion: request?.contentVersion || article?.contentVersion || null },
  });
}

export function completeBlogPublication(article, operationId, response) {
  const pending = article?.publikation?.pending;
  if (!pending || pending.operationId !== operationId) return article;
  const outcome = response?.outcome;
  if (["published", "updated"].includes(outcome) && response?.publication) {
    return applyOwnerPublication(article, response.publication, {
      pending: null,
      decisionRequests: response?.decisionRequests || [],
    });
  }
  if (["withdrawn", "absent"].includes(outcome)) return applyOwnerPublication(article, null, { pending: null });
  return applyOwnerPublication(article, publicationSnapshot(article).publicationId
    ? publicationSnapshot(article) : null, {
    pending: null,
    errorCode: response?.errorCode || outcome || "server",
    decisionRequests: response?.decisionRequests || [],
  });
}

export function markBlogPublicationUnknown(article, operationId, errorCode = "unknown") {
  const pending = article?.publikation?.pending;
  if (!pending || pending.operationId !== operationId) return article;
  return applyOwnerPublication(article, publicationSnapshot(article).publicationId
    ? publicationSnapshot(article) : null, {
    pending: { ...pending, status: "unknown" },
    errorCode,
  });
}

export function publicationState(article) {
  const p = article?.publikation;
  if (p && Object.values(SHARED_PUBLICATION_STATUS).includes(p.status)) return p;
  /* Bei bestehenden Legacy-Artikeln beweist der lokale Schalter keine erfolg-
     reiche Veröffentlichung. Der ehrliche Zustand ist „nicht bestätigt“ mit
     Retry; für eine Löschung gilt er trotzdem als möglicherweise öffentlich. */
  return article?.geteilt
    ? {
      status: SHARED_PUBLICATION_STATUS.ERROR,
      action: SHARED_PUBLICATION_ACTION.PUBLISH,
      operationId: null,
      errorCode: "legacy-unconfirmed",
    }
    : { status: SHARED_PUBLICATION_STATUS.LOCAL, action: null, operationId: null, errorCode: null };
}

export function beginPublication(article, action, operationId, nowIso = new Date().toISOString()) {
  const status = action === SHARED_PUBLICATION_ACTION.PUBLISH
    ? SHARED_PUBLICATION_STATUS.PUBLISHING
    : SHARED_PUBLICATION_STATUS.UNPUBLISHING;
  return {
    ...article,
    publikation: {
      ...publicationState(article),
      status,
      action,
      operationId,
      errorCode: null,
      updatedAt: nowIso,
    },
  };
}

export function completePublication(article, operationId, result = {}, nowIso = new Date().toISOString()) {
  const current = publicationState(article);
  if (!operationId || current.operationId !== operationId) return article;
  const published = current.action === SHARED_PUBLICATION_ACTION.PUBLISH;
  return {
    ...article,
    publikation: {
      status: published ? SHARED_PUBLICATION_STATUS.PUBLISHED : SHARED_PUBLICATION_STATUS.LOCAL,
      action: null,
      operationId: null,
      errorCode: null,
      publicationId: published ? (result.publicationId || current.publicationId || null) : null,
      shareToken: published ? (result.shareToken || current.shareToken || null) : null,
      updatedAt: result.updatedAt || nowIso,
    },
  };
}

export function failPublication(article, operationId, errorCode, nowIso = new Date().toISOString()) {
  const current = publicationState(article);
  if (!operationId || current.operationId !== operationId) return article;
  return {
    ...article,
    publikation: {
      ...current,
      status: SHARED_PUBLICATION_STATUS.ERROR,
      operationId: null,
      errorCode: errorCode || "server",
      updatedAt: nowIso,
    },
  };
}

/* Ein Browserneustart beendet jeden noch als laufend gespeicherten Request.
   Beim Laden wird daraus ein ehrlicher, wiederholbarer Fehler statt eines
   ewigen „wird veröffentlicht …“. */
export function recoverInterruptedPublication(article, nowIso = new Date().toISOString()) {
  const current = publicationState(article);
  if (current.status !== SHARED_PUBLICATION_STATUS.PUBLISHING
    && current.status !== SHARED_PUBLICATION_STATUS.UNPUBLISHING) return article;
  return {
    ...article,
    publikation: {
      ...current,
      status: SHARED_PUBLICATION_STATUS.ERROR,
      operationId: null,
      errorCode: "interrupted",
      updatedAt: nowIso,
    },
  };
}

export function needsRemoteRemoval(article) {
  if (!article || article.herkunft === "gezogen") return false;
  const state = publicationState(article);
  return !!article.geteilt || state.status !== SHARED_PUBLICATION_STATUS.LOCAL;
}

export function publicationRetryAction(article) {
  const state = publicationState(article);
  if (state.status !== SHARED_PUBLICATION_STATUS.ERROR) return null;
  return state.action || (article?.geteilt
    ? SHARED_PUBLICATION_ACTION.PUBLISH
    : SHARED_PUBLICATION_ACTION.UNPUBLISH);
}

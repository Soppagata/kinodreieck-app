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
  UNPUBLISH: "unpublish",
  DELETE: "delete",
});

export function publicationOperationId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* Fallback unten */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

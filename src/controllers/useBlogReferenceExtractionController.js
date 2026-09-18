import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiService } from "../services/ai.js";
import { errorText } from "../services/errors.js";
import {
  BLOG_REFERENCE_EXTRACT_MAX_CANDIDATES,
  BLOG_REFERENCE_EXTRACT_TASK,
  blogReferenceContentHash,
  blogReferenceHealthPayload,
  buildBlogReferenceSuggestions,
  readBlogReferenceExtractCapability,
  validateBlogReferenceExtractionInput,
  validateBlogReferenceExtractionResponse,
} from "../lib/blogReferenceExtraction.js";
import { BLOG_MAX_REFERENCES } from "../lib/blogContract.js";

const idleScan = () => ({
  status: "idle", binding: null, suggestions: [], partial: false, expiresAt: null,
  errorCode: null, message: null, appliedCount: 0,
});

function requestId() {
  if (typeof globalThis?.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.random() * 16 | 0;
    return (token === "x" ? value : (value & 0x3 | 0x8)).toString(16);
  });
}

function sameEditor(snapshot, current) {
  return !!snapshot && !!current
    && snapshot.accountScope === current.accountScope
    && snapshot.draftKey === current.draftKey
    && snapshot.title === current.title
    && snapshot.text === current.text;
}

function localError(reason) {
  return ({
    "title-too-long": "Die Überschrift ist für die KI-Erkennung zu lang. Du kannst normal weiterschreiben und speichern.",
    "text-too-long": "Der Blogtext ist länger als 18.000 Bytes. Er wird nicht gekürzt; du kannst ihn normal speichern und Referenzen manuell ergänzen.",
    "empty-title": "Schreibe zuerst eine Überschrift. Dein Entwurf und das Speichern bleiben davon unberührt.",
    "empty-text": "Schreibe zuerst einen Blogtext. Dein Entwurf und das Speichern bleiben davon unberührt.",
    "reference-limit": "Bei 50 Referenzen startet keine KI-Erkennung. Entferne zuerst eine Referenz oder arbeite manuell weiter.",
    "capability-unavailable": "Die KI-Erkennung ist derzeit nicht verfügbar. Schreiben, Speichern und manuelle Referenzen funktionieren weiter.",
    "stale-draft": "Der Entwurf hat sich geändert. Die alten Vorschläge wurden nicht übernommen.",
    "result-expired": "Die Vorschläge sind abgelaufen. Starte die Erkennung bei Bedarf erneut.",
    "selection-too-large": "Für die gesamte Auswahl ist nicht genug Platz. Es wurde nichts übernommen.",
  })[reason] || "Die KI-Erkennung konnte nicht sicher abgeschlossen werden. Schreiben und Speichern funktionieren weiter.";
}

export function useBlogReferenceExtractionController({
  accountScope,
  enabled = false,
  personalAi = false,
  editor = null,
  library = [],
  libraryReady = false,
  mustwatch = [],
  mustwatchReady = false,
  service = aiService,
  onApplyReferenceSuggestions,
  digest,
  clock = () => Date.now(),
} = {}) {
  const [capability, setCapability] = useState({ status: "unavailable", value: null, reason: "disabled" });
  const [scan, setScan] = useState(idleScan);
  const propsRef = useRef(null);
  const requestRef = useRef(null);
  const startRef = useRef(null);
  const applyRef = useRef(null);
  const healthRef = useRef(null);
  const visible = enabled === true && personalAi === true && !!editor;
  const editorSnapshot = editor ? {
    accountScope, draftKey: editor.draftKey, title: String(editor.title || ""),
    text: String(editor.text || ""), referenceCount: Array.isArray(editor.references) ? editor.references.length : 0,
  } : null;
  propsRef.current = {
    accountScope, enabled, personalAi, editor: editorSnapshot,
    library: libraryReady ? library : [], mustwatch: mustwatchReady ? mustwatch : [],
    onApplyReferenceSuggestions,
  };

  const invalidateRequest = useCallback(() => {
    startRef.current = null;
    requestRef.current?.controller?.abort();
    requestRef.current = null;
  }, []);

  const invalidateApply = useCallback(() => {
    applyRef.current?.controller?.abort();
    applyRef.current = null;
  }, []);

  useEffect(() => {
    invalidateRequest();
    invalidateApply();
    setScan(idleScan());
  }, [accountScope, editor?.draftKey, editor?.title, editor?.text, enabled, personalAi, invalidateApply, invalidateRequest]);

  useEffect(() => {
    healthRef.current?.abort();
    setCapability({ status: "unavailable", value: null, reason: "disabled" });
    if (!enabled || !personalAi || !accountScope || typeof service?.runTask !== "function") return undefined;
    const controller = new AbortController();
    healthRef.current = controller;
    const scope = accountScope;
    setCapability({ status: "checking", value: null, reason: null });
    Promise.resolve(service.runTask("health", blogReferenceHealthPayload(), { signal: controller.signal }))
      .then((response) => {
        if (controller.signal.aborted || propsRef.current.accountScope !== scope
            || !propsRef.current.enabled || !propsRef.current.personalAi) return;
        const value = readBlogReferenceExtractCapability(response);
        setCapability(value
          ? { status: "ready", value, reason: null }
          : { status: "unavailable", value: null, reason: "contract-mismatch" });
      })
      .catch((error) => {
        if (!controller.signal.aborted && propsRef.current.accountScope === scope) {
          setCapability({ status: "unavailable", value: null, reason: error?.code || "health-failed" });
        }
      });
    return () => controller.abort();
  }, [accountScope, enabled, personalAi, service]);

  const startReason = useMemo(() => {
    if (!visible) return "disabled";
    if (capability.status !== "ready") return "capability-unavailable";
    if (editorSnapshot.referenceCount >= BLOG_MAX_REFERENCES) return "reference-limit";
    const input = validateBlogReferenceExtractionInput(editorSnapshot);
    return input.ok ? null : input.reason;
  }, [capability.status, editorSnapshot?.referenceCount, editorSnapshot?.text, editorSnapshot?.title, visible]);

  const start = useCallback(async () => {
    const current = propsRef.current;
    const snapshot = current.editor;
    if (!current.enabled || !current.personalAi || capability.status !== "ready" || !snapshot) return false;
    if (startRef.current) return false;
    if (snapshot.referenceCount >= BLOG_MAX_REFERENCES) {
      setScan({ ...idleScan(), status: "error", errorCode: "reference-limit", message: localError("reference-limit") });
      return false;
    }
    const input = validateBlogReferenceExtractionInput(snapshot);
    if (!input.ok) {
      setScan({ ...idleScan(), status: "error", errorCode: input.reason, message: localError(input.reason) });
      return false;
    }
    invalidateRequest();
    const startToken = Object.freeze({});
    startRef.current = startToken;
    const controller = new AbortController();
    const localRequestId = requestId();
    setScan({ ...idleScan(), status: "running" });
    let contentHash;
    try {
      contentHash = await blogReferenceContentHash(input.payload, digest);
    } catch {
      if (startRef.current === startToken) {
        startRef.current = null;
        setScan({ ...idleScan(), status: "error", errorCode: "hash-failed", message: localError("hash-failed") });
      }
      return false;
    }
    if (startRef.current !== startToken || !sameEditor(snapshot, propsRef.current.editor)
        || !propsRef.current.enabled || !propsRef.current.personalAi || capability.status !== "ready") {
      if (startRef.current === startToken) startRef.current = null;
      return false;
    }
    const binding = Object.freeze({
      accountScope: snapshot.accountScope, draftKey: snapshot.draftKey,
      contentHash, requestId: localRequestId,
    });
    const run = { controller, binding, snapshot };
    requestRef.current = run;
    setScan({ ...idleScan(), status: "running", binding });
    try {
      const response = await service.runTask(BLOG_REFERENCE_EXTRACT_TASK, input.payload, {
        signal: controller.signal, vorgangId: localRequestId,
      });
      if (requestRef.current !== run || controller.signal.aborted
          || !sameEditor(snapshot, propsRef.current.editor)
          || !propsRef.current.enabled || !propsRef.current.personalAi) return false;
      const validated = validateBlogReferenceExtractionResponse(response, input.payload);
      if (!validated.ok || validated.value.requestId !== localRequestId) {
        setScan({ ...idleScan(), status: "error", binding, errorCode: "invalid-response", message: localError("invalid-response") });
        return false;
      }
      const suggestions = buildBlogReferenceSuggestions(validated.value.candidates, {
        library: propsRef.current.library,
        mustwatch: propsRef.current.mustwatch,
      });
      setScan({
        status: "result", binding, suggestions,
        partial: validated.value.partial, expiresAt: validated.value.expiresAt,
        errorCode: null, message: suggestions.length === 0 ? "Keine Titel gefunden." : null,
        appliedCount: 0,
      });
      return true;
    } catch (error) {
      if (requestRef.current !== run || controller.signal.aborted) return false;
      setScan({ ...idleScan(), status: "error", binding, errorCode: error?.code || "server", message: errorText(error) });
      return false;
    } finally {
      if (requestRef.current === run) requestRef.current = null;
      if (startRef.current === startToken) startRef.current = null;
    }
  }, [capability.status, digest, invalidateRequest, service]);

  const cancel = useCallback(() => {
    invalidateRequest();
    setScan(idleScan());
  }, [invalidateRequest]);

  const apply = useCallback(async (candidates) => {
    const current = propsRef.current;
    const binding = scan.binding;
    const snapshot = current.editor;
    if (scan.status !== "result" || !binding || !snapshot
        || !current.enabled || !current.personalAi || capability.status !== "ready"
        || snapshot.accountScope !== binding.accountScope || snapshot.draftKey !== binding.draftKey) {
      setScan((value) => ({ ...value, status: "error", errorCode: "stale-draft", message: localError("stale-draft") }));
      return { status: "failed", errorCode: "stale-draft" };
    }
    if (Date.parse(scan.expiresAt) <= clock()) {
      setScan((value) => ({ ...value, status: "error", errorCode: "result-expired", message: localError("result-expired") }));
      return { status: "failed", errorCode: "result-expired" };
    }
    const selected = Array.isArray(candidates) ? candidates : [];
    if (selected.length === 0 || selected.length > BLOG_REFERENCE_EXTRACT_MAX_CANDIDATES
        || snapshot.referenceCount + selected.length > BLOG_MAX_REFERENCES) {
      const reason = snapshot.referenceCount + selected.length > BLOG_MAX_REFERENCES
        ? "selection-too-large" : "invalid-selection";
      setScan((value) => ({ ...value, errorCode: reason, message: localError(reason) }));
      return { status: "failed", errorCode: reason };
    }
    if (applyRef.current) return { status: "failed", errorCode: "busy" };
    const applyToken = { controller: new AbortController() };
    applyRef.current = applyToken;
    setScan((value) => ({ ...value, status: "applying", errorCode: null, message: null }));
    const stillBound = () => sameEditor(snapshot, propsRef.current.editor)
      && propsRef.current.enabled && propsRef.current.personalAi
      && propsRef.current.accountScope === binding.accountScope;
    try {
      const health = await service.runTask("health", blogReferenceHealthPayload(), {
        signal: applyToken.controller.signal,
      });
      if (!readBlogReferenceExtractCapability(health) || !stillBound()) {
        throw Object.assign(new Error("stale-draft"), { code: "stale-draft" });
      }
      const freshHash = await blogReferenceContentHash({ title: snapshot.title, text: snapshot.text }, digest);
      if (freshHash !== binding.contentHash || !stillBound()) {
        throw Object.assign(new Error("stale-draft"), { code: "stale-draft" });
      }
      const result = await current.onApplyReferenceSuggestions?.({
        draftKey: binding.draftKey, contentHash: binding.contentHash, candidates: selected,
      });
      if (!stillBound()) {
        if (applyRef.current === applyToken) setScan(idleScan());
        return { status: "failed", errorCode: "stale-draft" };
      }
      if (result?.status !== "applied") {
        const reason = result?.errorCode || "apply-failed";
        if (applyRef.current === applyToken) {
          setScan((value) => ({ ...value, status: "result", errorCode: reason, message: localError(reason) }));
        }
        return result || { status: "failed", errorCode: reason };
      }
      if (applyRef.current === applyToken) {
        setScan((value) => ({ ...value, status: "result", appliedCount: result.addedCount || 0,
          message: result.addedCount ? `${result.addedCount} Referenz${result.addedCount === 1 ? "" : "en"} in den Entwurf übernommen.`
            : "Die gewählten Werke waren bereits im Entwurf. Es wurde nichts doppelt angelegt.",
          errorCode: null }));
      }
      return result;
    } catch (error) {
      const reason = error?.code || "apply-failed";
      if (reason === "stale-draft" || !stillBound() || applyToken.controller.signal.aborted) {
        if (applyRef.current === applyToken) setScan(idleScan());
        return { status: "failed", errorCode: "stale-draft" };
      }
      if (applyRef.current === applyToken) {
        setScan((value) => ({ ...value, status: "result", errorCode: reason, message: localError(reason) }));
      }
      return { status: "failed", errorCode: reason };
    } finally {
      if (applyRef.current === applyToken) applyRef.current = null;
    }
  }, [capability.status, clock, digest, scan, service]);

  useEffect(() => () => {
    invalidateRequest();
    invalidateApply();
    healthRef.current?.abort();
  }, [invalidateApply, invalidateRequest]);

  return {
    visible,
    capability,
    status: scan.status,
    binding: scan.binding,
    suggestions: scan.suggestions,
    partial: scan.partial,
    expiresAt: scan.expiresAt,
    errorCode: scan.errorCode,
    message: scan.message,
    appliedCount: scan.appliedCount,
    canStart: visible && startReason === null && !["running", "applying"].includes(scan.status),
    startReason,
    start,
    cancel,
    apply,
  };
}

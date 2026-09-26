import {
  analysiereAuswaehlbareIds,
  kanonischeStabileId,
} from "./mediathekSelection.js";
import { bauePaket } from "./paket.js";
import { TYP_GRUPPEN, normalisiereTyp } from "./typen.js";

export const KD_API_CONTRACT_VERSION = "kd-api-v1";

export const LIBRARY_WRITABLE_FIELDS = Object.freeze([
  "titel", "originaltitel", "jahr", "jahr_bis", "typ", "quelle",
  "kategorie", "bewertung", "genre", "tags", "begruendung",
  "beschreibung", "art", "film_at_id", "notiz", "status", "staffeln",
]);

export const BLOG_DRAFT_WRITABLE_FIELDS = Object.freeze([
  "titel", "text", "geordnet", "liste", "autor",
]);

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function stableId(value, field = "id") {
  const id = kanonischeStabileId(value);
  if (!id) fail("VALIDATION_FAILED", `${field} muss eine stabile, nichtleere ID sein.`);
  return id;
}

function pickPatch(patch, fields) {
  if (!plain(patch)) fail("VALIDATION_FAILED", "Aenderungen muessen ein Objekt sein.");
  const allowed = new Set(fields);
  const entries = Object.entries(patch).filter(([key]) => allowed.has(key));
  if (!entries.length) fail("VALIDATION_FAILED", "Keine erlaubte Aenderung enthalten.");
  return Object.fromEntries(entries);
}

function requireUniqueEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const analysis = analysiereAuswaehlbareIds(list);
  if (analysis.ungueltigeAnzahl || analysis.doppelteIds.size) {
    fail("AMBIGUOUS_ID", "Der Bestand enthaelt fehlende oder doppelte stabile IDs.");
  }
  return list;
}

export function applyLibraryMutation(entries, command) {
  const list = requireUniqueEntries(entries);
  if (!plain(command) || !["add", "update", "remove"].includes(command.operation)) {
    fail("VALIDATION_FAILED", "Unbekannte Mediathekoperation.");
  }
  if (command.operation === "add") {
    if (!plain(command.entry)) fail("VALIDATION_FAILED", "Eintrag fehlt.");
    const id = stableId(command.entry);
    if (list.some((entry) => stableId(entry) === id)) fail("ALREADY_EXISTS", "Eintrag existiert bereits.");
    const entry = { ...command.entry, id };
    return Object.freeze({ entries: Object.freeze([...list, entry]), entity: entry, changed: true });
  }
  const id = stableId(command.id, "id");
  const index = list.findIndex((entry) => stableId(entry) === id);
  if (index < 0) fail("NOT_FOUND", "Eintrag wurde nicht gefunden.");
  if (command.operation === "remove") {
    return Object.freeze({
      entries: Object.freeze(list.filter((_, position) => position !== index)),
      entity: list[index], changed: true,
    });
  }
  const patch = pickPatch(command.patch, LIBRARY_WRITABLE_FIELDS);
  const entity = { ...list[index], ...patch, id };
  const next = [...list];
  next[index] = entity;
  return Object.freeze({ entries: Object.freeze(next), entity, changed: true });
}

export function applyBlogDraftMutation(drafts, command) {
  const list = requireUniqueEntries(drafts);
  if (!plain(command) || !["create", "update", "remove"].includes(command.operation)) {
    fail("VALIDATION_FAILED", "Unbekannte Blogoperation.");
  }
  if (command.operation === "create") {
    if (!plain(command.draft)) fail("VALIDATION_FAILED", "Entwurf fehlt.");
    const id = stableId(command.draft);
    if (list.some((entry) => stableId(entry) === id)) fail("ALREADY_EXISTS", "Entwurf existiert bereits.");
    const fields = pickPatch(command.draft, BLOG_DRAFT_WRITABLE_FIELDS);
    const draft = { ...fields, id, status: "wartet" };
    return Object.freeze({ drafts: Object.freeze([...list, draft]), entity: draft, changed: true });
  }
  const id = stableId(command.id, "id");
  const index = list.findIndex((entry) => stableId(entry) === id);
  if (index < 0) fail("NOT_FOUND", "Entwurf wurde nicht gefunden.");
  if (command.operation === "remove") {
    return Object.freeze({
      drafts: Object.freeze(list.filter((_, position) => position !== index)),
      entity: list[index], changed: true,
    });
  }
  const patch = pickPatch(command.patch, BLOG_DRAFT_WRITABLE_FIELDS);
  const entity = { ...list[index], ...patch, id };
  const next = [...list];
  next[index] = entity;
  return Object.freeze({ drafts: Object.freeze(next), entity, changed: true });
}

function selectedInRequestedOrder(entries, requestedIds) {
  const list = requireUniqueEntries(entries);
  if (!Array.isArray(requestedIds) || !requestedIds.length) {
    fail("VALIDATION_FAILED", "Mindestens eine Auswahl-ID ist erforderlich.");
  }
  const normalized = requestedIds.map((id) => stableId(id, "ids"));
  if (new Set(normalized).size !== normalized.length) fail("VALIDATION_FAILED", "Auswahl-IDs muessen eindeutig sein.");
  const byId = new Map(list.map((entry) => [stableId(entry), entry]));
  return normalized.map((id) => {
    const entry = byId.get(id);
    if (!entry) fail("NOT_FOUND", `Auswahl-ID ${id} ist nicht lesbar.`);
    return entry;
  });
}

function displayTitle(entry) {
  const title = String(entry?.titel || "Ohne Titel").replace(/\s+/g, " ").trim() || "Ohne Titel";
  const year = entry?.jahr == null ? "" : String(entry.jahr).replace(/\s+/g, " ").trim();
  return year ? `${title} (${year})` : title;
}

function packageAreas(entries) {
  return Object.keys(TYP_GRUPPEN).filter((area) => entries.some(
    (entry) => TYP_GRUPPEN[area].includes(normalisiereTyp(entry?.typ)),
  ));
}

export function exportLibrarySelection({
  entries, ids, format, author = "unbekannt", createdAt = new Date().toISOString(),
} = {}) {
  if (!["text", "json"].includes(format)) fail("VALIDATION_FAILED", "format muss text oder json sein.");
  const selected = selectedInRequestedOrder(entries, ids);
  const selectedIds = Object.freeze(selected.map((entry) => stableId(entry)));
  if (format === "text") {
    return Object.freeze({
      contractVersion: KD_API_CONTRACT_VERSION,
      format, filename: "kinodreieck-auswahl.txt", mimeType: "text/plain;charset=utf-8",
      count: selected.length, selectedIds, content: selected.map(displayTitle).join("\n"),
    });
  }
  const packet = bauePaket({
    master: selected, artikel: [], bereiche: packageAreas(selected), autor: author, erstellt: createdAt,
  });
  return Object.freeze({
    contractVersion: KD_API_CONTRACT_VERSION,
    format, filename: "kinodreieck-auswahl.json", mimeType: "application/json",
    count: selected.length, selectedIds, content: JSON.stringify(packet, null, 2),
  });
}

export function createKdActionAdapter({ library, blog } = {}) {
  const required = [
    [library, ["search", "get", "add", "update", "remove"]],
    [blog, ["list", "get", "create", "update", "remove", "publish", "unpublish"]],
  ];
  for (const [group, names] of required) {
    if (!plain(group) || names.some((name) => typeof group[name] !== "function")) {
      fail("ADAPTER_INCOMPLETE", "Der Fachadapter ist unvollstaendig.");
    }
  }
  return Object.freeze({
    contractVersion: KD_API_CONTRACT_VERSION,
    library: Object.freeze({ ...library }), blog: Object.freeze({ ...blog }),
    exportSelection: exportLibrarySelection,
  });
}

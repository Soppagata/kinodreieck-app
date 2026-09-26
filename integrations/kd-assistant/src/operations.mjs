export const CONTRACT_VERSION = "kd-api-v1";

const query = (...names) => ({ names });
const item = (base) => ({ path: ({ id }) => `${base}/${encodeURIComponent(id)}` });
const mutation = (method, path, body) => ({ method, path, body, mutation: true });

export const OPERATIONS = Object.freeze({
  capabilities_get: { method: "GET", path: "/capabilities" },
  library_search: { method: "GET", path: "/library", query: query("query", "type", "cursor", "limit") },
  library_get: { method: "GET", ...item("/library") },
  library_add: mutation("POST", "/library", ({ value }) => value),
  library_update: mutation("PATCH", ({ id }) => `/library/${encodeURIComponent(id)}`, ({ patch }) => patch),
  library_remove: mutation("DELETE", ({ id }) => `/library/${encodeURIComponent(id)}`),
  library_export_selection: { method: "POST", path: "/library/selection/export", body: ({ ids, format }) => ({ ids, format }) },
  mustwatch_list: { method: "GET", path: "/must-watch", query: query("cursor", "limit") },
  mustwatch_add: mutation("POST", "/must-watch", ({ value }) => value),
  mustwatch_update: mutation("PATCH", ({ id }) => `/must-watch/${encodeURIComponent(id)}`, ({ patch }) => patch),
  mustwatch_remove: mutation("DELETE", ({ id }) => `/must-watch/${encodeURIComponent(id)}`),
  blog_drafts_list: { method: "GET", path: "/blog-drafts", query: query("cursor", "limit") },
  blog_draft_get: { method: "GET", ...item("/blog-drafts") },
  blog_draft_create: mutation("POST", "/blog-drafts", ({ value }) => value),
  blog_draft_update: mutation("PATCH", ({ id }) => `/blog-drafts/${encodeURIComponent(id)}`, ({ patch }) => patch),
  blog_draft_remove: mutation("DELETE", ({ id }) => `/blog-drafts/${encodeURIComponent(id)}`),
  blog_publish: mutation("POST", ({ id }) => `/blog-drafts/${encodeURIComponent(id)}/publish`, ({ anonymous, expectedPublicRevision }) => ({
    anonymous,
    ...(expectedPublicRevision === undefined ? {} : { expectedPublicRevision }),
  })),
  blog_unpublish: mutation("POST", ({ id }) => `/blog-publications/${encodeURIComponent(id)}/unpublish`),
  blog_publications_list: { method: "GET", path: "/blog-publications", query: query("cursor", "limit") },
  blog_publication_get: { method: "GET", ...item("/blog-publications") },
  settings_get: { method: "GET", path: "/settings" },
  settings_update: mutation("PATCH", "/settings", ({ patch }) => patch),
  account_export: { method: "POST", path: "/account/export" },
  package_preview: { method: "POST", path: "/packages/preview", body: ({ package: value }) => ({ package: value }) },
  package_apply: mutation("POST", "/packages/apply", ({ previewId, sections }) => ({ previewId, sections })),
  schedule_list: { method: "GET", path: "/schedule", query: query("cursor", "limit") },
  schedule_add: mutation("POST", "/schedule", ({ value }) => value),
  schedule_update: mutation("PATCH", ({ id }) => `/schedule/${encodeURIComponent(id)}`, ({ patch }) => patch),
  schedule_remove: mutation("DELETE", ({ id }) => `/schedule/${encodeURIComponent(id)}`),
  radar_list: { method: "GET", path: "/radar", query: query("cursor", "limit") },
  radar_add: mutation("POST", "/radar", ({ value }) => value),
  radar_update: mutation("PATCH", ({ id }) => `/radar/${encodeURIComponent(id)}`, ({ patch }) => patch),
  radar_remove: mutation("DELETE", ({ id }) => `/radar/${encodeURIComponent(id)}`),
  ai_job_start: { method: "POST", path: "/ai/jobs", body: ({ kind, payload }) => ({ kind, payload }), idempotent: true },
  ai_job_get: { method: "GET", ...item("/ai/jobs") },
  usage_get: { method: "GET", path: "/assistant/usage", query: query("from", "to") },
  requests_list: { method: "GET", path: "/assistant/requests", query: query("cursor", "limit") },
  backend_status_get: { method: "GET", path: "/assistant/backend/status" },
  backend_diagnostics_get: { method: "GET", path: "/assistant/backend/diagnostics", query: query("cursor", "limit") },
  backend_usage_get: { method: "GET", path: "/assistant/backend/usage", query: query("from", "to") },
});

export function operationNames() {
  return Object.freeze(Object.keys(OPERATIONS));
}

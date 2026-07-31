/* Shared-Articles-Test: komplett gemockt, kein echter Datenbankzugriff.
   Prüft den öffentlichen Read, accountgebundene Writes, Accountwechsel,
   idempotente URLs, die persistierte Statusmaschine und die SQL-Leitplanken. */
import fs from "node:fs";

const local = new Map();
globalThis.localStorage = {
  getItem: (key) => local.has(key) ? local.get(key) : null,
  setItem: (key, value) => void local.set(key, String(value)),
  removeItem: (key) => void local.delete(key),
};

const {
  createSharedArticlesService, sharedArticlePayload,
} = await import("./src/services/sharedArticles.js");
const {
  SHARED_PUBLICATION_ACTION,
  SHARED_PUBLICATION_STATUS,
  beginPublication,
  completePublication,
  failPublication,
  needsRemoteRemoval,
  publicationRetryAction,
  publicationState,
  recoverInterruptedPublication,
} = await import("./src/lib/sharedPublication.js");

let ok = 0;
const check = (name, value) => {
  if (!value) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
};
const response = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

const config = {
  supabaseUrl: "https://shared-test.supabase.co",
  supabasePublishableKey: "sb_publishable_shared_test",
};
let snapshot = { mode: "account", account: { id: "konto-a" } };
const auth = { getSnapshot: () => snapshot };
let calls = [];
let tokenCalls = [];
let nextResponses = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return nextResponses.shift() || response(200, []);
};
const service = createSharedArticlesService({
  config,
  auth,
  getAccessToken: async (options) => {
    tokenCalls.push(options);
    return options?.erzwingeErneuerung ? "token-neu" : "token-alt";
  },
  fetchImpl,
});

const article = {
  id: "alien_essay",
  titel: "Warum Alien bleibt",
  autor: "Max",
  text: "Ein öffentlicher Text.",
  geordnet: false,
  erstellt_am: "2026-07-31T10:00:00Z",
  geteilt: true,
  publikation: { status: "publishing", operationId: "lokal" },
  liste: [{
    eingabe: "Alien", jahr: 1979, typ: "film", ref: "alien_1979",
    abgleich: { status: "verlinkt" },
  }],
};

const payload = sharedArticlePayload(article);
check("Projektion enthält die fachlichen Blogfelder",
  payload.id === article.id && payload.titel === article.titel && payload.liste[0].eingabe === "Alien");
check("Projektion enthält keine lokalen Referenzen oder Publikationsmetadaten",
  !("ref" in payload.liste[0]) && !("publikation" in payload) && !("geteilt" in payload));

nextResponses = [response(200, [{
  publication_id: "11111111-1111-4111-8111-111111111111",
  article_id: article.id,
  author: "Max",
  payload,
  updated_at: "2026-07-31T11:00:00Z",
}])];
calls = [];
const listed = await service.list();
const listCall = calls[0];
check("Öffentlicher Read verwendet ausschließlich die schmale Listen-RPC",
  listed.ok && listed.blogs[0].artikel.titel === article.titel
  && listCall.url.endsWith("/rest/v1/rpc/kd_list_shared_articles"));
check("Öffentlicher Read sendet niemals ein Sitzungstoken",
  listCall.options.headers.apikey === config.supabasePublishableKey
  && !listCall.options.headers.Authorization);
check("Öffentliche Herkunft enthält keine Account-ID",
  listed.blogs[0].db_key === "11111111-1111-4111-8111-111111111111"
  && listed.blogs[0].db_owner === "public");

nextResponses = [response(201, [{
  publication_id: "22222222-2222-4222-8222-222222222222",
  updated_at: "2026-07-31T12:00:00Z",
}])];
calls = []; tokenCalls = [];
const published = await service.publish(article);
const publishCall = calls[0];
const publishBody = JSON.parse(publishCall.options.body);
check("Publish ist ein accountgebundener, idempotenter Upsert",
  publishCall.url.includes("/rest/v1/kd_shared_articles?on_conflict=account_id,article_id")
  && publishCall.options.headers.Authorization === "Bearer token-alt"
  && /resolution=merge-duplicates/.test(publishCall.options.headers.Prefer));
check("Der Client sendet niemals account_id",
  !("account_id" in publishBody) && publishBody.article_id === article.id);
check("Publish liefert die öffentliche Projektions-ID zurück",
  published.ok && published.publicationId === "22222222-2222-4222-8222-222222222222");

nextResponses = [response(200, [])];
calls = [];
await service.unpublish("id mit leerzeichen");
check("Unpublish löscht nur nach eigener Artikel-ID; RLS bindet den Account",
  calls[0].options.method === "DELETE"
  && calls[0].url.includes("article_id=eq.id%20mit%20leerzeichen")
  && !calls[0].url.includes("account_id="));

nextResponses = [response(401, {}), response(200, [])];
calls = []; tokenCalls = [];
await service.unpublish(article.id);
check("401 führt zu genau einem erzwungenen Token-Retry",
  calls.length === 2 && tokenCalls.length === 2
  && tokenCalls[0].erzwingeErneuerung === false
  && tokenCalls[1].erzwingeErneuerung === true
  && calls[1].options.headers.Authorization === "Bearer token-neu");

snapshot = { mode: "guest", account: null };
calls = [];
let guestError = null;
try { await service.publish(article); } catch (error) { guestError = error; }
check("Gast kann keine öffentliche Projektion schreiben",
  guestError?.code === "unauthenticated" && calls.length === 0);

snapshot = { mode: "account", account: { id: "konto-a" } };
const wechselService = createSharedArticlesService({
  config,
  auth,
  getAccessToken: async () => "token-a",
  fetchImpl: async () => {
    snapshot = { mode: "account", account: { id: "konto-b" } };
    return response(200, []);
  },
});
let wechselError = null;
try { await wechselService.unpublish(article.id); } catch (error) { wechselError = error; }
check("Verspätete Antwort eines anderen Kontos wird verworfen",
  wechselError?.code === "unauthenticated");
snapshot = { mode: "account", account: { id: "konto-a" } };

const started = beginPublication(article, SHARED_PUBLICATION_ACTION.PUBLISH, "op-1", "2026-07-31T12:00:00Z");
check("Statusmaschine beginnt sichtbar mit publishing",
  publicationState(started).status === SHARED_PUBLICATION_STATUS.PUBLISHING);
const recovered = recoverInterruptedPublication(started, "2026-07-31T12:00:30Z");
check("Ein beim Neustart unterbrochener Request wird wiederholbar",
  publicationState(recovered).status === SHARED_PUBLICATION_STATUS.ERROR
  && publicationRetryAction(recovered) === SHARED_PUBLICATION_ACTION.PUBLISH);
const stale = completePublication(started, "fremde-op", {});
check("Eine alte Antwort kann keinen neueren Vorgang abschließen", stale === started);
const done = completePublication(started, "op-1", {
  publicationId: "33333333-3333-4333-8333-333333333333",
}, "2026-07-31T12:01:00Z");
check("Bestätigtes Publish endet dauerhaft als published",
  publicationState(done).status === SHARED_PUBLICATION_STATUS.PUBLISHED
  && publicationState(done).publicationId === "33333333-3333-4333-8333-333333333333");
const deleting = beginPublication(done, SHARED_PUBLICATION_ACTION.DELETE, "op-2");
const failed = failPublication(deleting, "op-2", "offline");
check("Fehler bewahrt die wiederholbare Löschabsicht",
  publicationState(failed).status === SHARED_PUBLICATION_STATUS.ERROR
  && publicationRetryAction(failed) === SHARED_PUBLICATION_ACTION.DELETE
  && needsRemoteRemoval(failed));
check("Gezogene Snapshots verlangen niemals Remote-Löschung",
  !needsRemoteRemoval({ ...failed, herkunft: "gezogen" }));

const schema = fs.readFileSync("supabase/migrations/20260731120000_shared_articles.sql", "utf8");
check("Migration bindet alle Schreibwege per RLS an auth.uid()",
  /for insert to authenticated[\s\S]*with check \(account_id = \(select auth\.uid\(\)\)\)/.test(schema)
  && /for update to authenticated[\s\S]*using[\s\S]*auth\.uid/.test(schema)
  && /for delete to authenticated[\s\S]*auth\.uid/.test(schema));
check("Öffentliche RPC gibt account_id nicht zurück",
  /returns table \([\s\S]*publication_id uuid[\s\S]*payload jsonb/.test(schema)
  && !/returns table \([\s\S]*account_id/.test(schema));
check("anon besitzt kein Tabellenrecht, nur RPC-Ausführung",
  /revoke all on table public\.kd_shared_articles from public, anon/.test(schema)
  && /grant execute on function public\.kd_list_shared_articles\(\) to anon, authenticated/.test(schema));

const archive = fs.readFileSync("supabase/migrations/20260731121000_archive_legacy_shared.sql", "utf8");
check("Legacy-Shared wird vor dem Löschen reversibel archiviert",
  archive.indexOf("insert into public.kd_legacy_shared_archive")
    < archive.indexOf("delete from public.kd_store"));
check("Alte Clients können keine neuen Legacy-Shared-Zeilen anlegen",
  /before insert or update on public\.kd_store/.test(archive)
  && /new\.scope = 'shared'/.test(archive));

console.log(`sharedarticles_test: ${ok} Checks bestanden.`);

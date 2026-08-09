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
const aktiveSession = (id = "konto-a") => ({
  mode: "account", state: "ready", account: { id },
  capabilities: { remoteStorage: true, personalAi: false },
});
let snapshot = aktiveSession();
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
  share_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
  listed.blogs[0].db_key === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  && listed.blogs[0].share_token === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  && listed.blogs[0].db_owner === "public");

nextResponses = [response(201, [{
  publication_id: "22222222-2222-4222-8222-222222222222",
  share_token: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
  !("account_id" in publishBody) && !("share_token" in publishBody) && publishBody.article_id === article.id);
check("Publish liefert Projektions-ID und unveränderlichen Upload-Token zurück",
  published.ok
  && published.publicationId === "22222222-2222-4222-8222-222222222222"
  && published.shareToken === "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  && publishCall.url.includes("select=publication_id,share_token,updated_at"));

nextResponses = [response(200, [{
  publication_id: "11111111-1111-4111-8111-111111111111",
  share_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  article_id: article.id,
  author: "Max",
  payload,
  updated_at: "2026-07-31T11:00:00Z",
  claimed: true,
}])];
calls = [];
const claimed = await service.claim("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
const claimCall = calls[0];
check("Blog-Übernahme claimt den Upload-Token accountgebunden über die RPC",
  claimed.ok && claimed.claimed && claimed.blog.db_key === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  && claimCall.url.endsWith("/rest/v1/rpc/kd_claim_shared_article")
  && claimCall.options.headers.Authorization === "Bearer token-alt"
  && JSON.parse(claimCall.options.body).p_share_token === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

nextResponses = [response(200, [{
  publication_id: "11111111-1111-4111-8111-111111111111",
  share_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  article_id: article.id,
  author: "Max",
  payload,
  updated_at: "2026-07-31T11:00:00Z",
  claimed: false,
}])];
const claimedAgain = await service.claim("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
check("Ein bereits verbrauchter Upload-Token erzeugt keine zweite lokale Übernahme",
  claimedAgain.ok && claimedAgain.claimed === false);

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

snapshot = aktiveSession();
calls = []; tokenCalls = [];
let inactiveError = null;
snapshot = {
  mode: "account", state: "ready", account: { id: "konto-a" },
  capabilities: { remoteStorage: false, personalAi: false },
};
try { await service.publish(article); } catch (error) { inactiveError = error; }
check("Inaktives Konto kann keine öffentliche Projektion schreiben und holt kein Token",
  inactiveError?.code === "forbidden" && inactiveError?.reason === "remoteStorage"
  && calls.length === 0 && tokenCalls.length === 0);

calls = []; tokenCalls = [];
snapshot = { mode: "account", state: "ready", account: { id: "konto-a" }, capabilities: {} };
let alteSessionError = null;
try { await service.claim("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); } catch (error) { alteSessionError = error; }
check("Alte Session ohne Capability bleibt beim Claim fail-closed",
  alteSessionError?.code === "forbidden" && calls.length === 0 && tokenCalls.length === 0);

snapshot = {
  mode: "account", state: "degraded", account: { id: "konto-a" },
  capabilities: { remoteStorage: true, personalAi: false },
};
nextResponses = [response(200, [])];
calls = []; tokenCalls = [];
const publicWhileBlocked = await service.list();
check("Öffentliche Shared-Liste bleibt bei unbekannter Freigabe tokenfrei lesbar",
  publicWhileBlocked.ok && calls.length === 1 && tokenCalls.length === 0
  && !calls[0].options.headers.Authorization);

snapshot = aktiveSession();
const wechselService = createSharedArticlesService({
  config,
  auth,
  getAccessToken: async () => "token-a",
  fetchImpl: async () => {
    snapshot = aktiveSession("konto-b");
    return response(200, []);
  },
});
let wechselError = null;
try { await wechselService.unpublish(article.id); } catch (error) { wechselError = error; }
check("Verspätete Antwort eines anderen Kontos wird verworfen",
  wechselError?.code === "unauthenticated");
snapshot = aktiveSession();

const widerrufService = createSharedArticlesService({
  config,
  auth,
  getAccessToken: async () => "token-a",
  fetchImpl: async () => {
    snapshot = {
      ...aktiveSession(),
      capabilities: { remoteStorage: false, personalAi: false },
    };
    return response(200, []);
  },
});
let widerrufError = null;
try { await widerrufService.unpublish(article.id); } catch (error) { widerrufError = error; }
check("Widerruf während eines Shared-Writes kann keinen alten Erfolg bestätigen",
  widerrufError?.code === "forbidden" && widerrufError?.reason === "remoteStorage");
snapshot = aktiveSession();

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
  shareToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
}, "2026-07-31T12:01:00Z");
check("Bestätigtes Publish endet dauerhaft als published",
  publicationState(done).status === SHARED_PUBLICATION_STATUS.PUBLISHED
  && publicationState(done).publicationId === "33333333-3333-4333-8333-333333333333"
  && publicationState(done).shareToken === "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
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

const claimSchema = fs.readFileSync("supabase/migrations/20260802220000_shared_article_claim_tokens.sql", "utf8");
check("Jeder veröffentlichte Blog besitzt einen eindeutigen, unveränderlichen Upload-Token",
  /add column if not exists share_token uuid/.test(claimSchema)
  && /unique \(share_token\)/.test(claimSchema)
  && /new\.share_token := gen_random_uuid\(\)/.test(claimSchema)
  && /new\.share_token := old\.share_token/.test(claimSchema));
check("Die Datenbank erzwingt genau einen Claim je Konto und Token",
  /primary key \(account_id, share_token\)/.test(claimSchema)
  && /on conflict \(account_id, share_token\) do nothing/.test(claimSchema));
check("Der Autor kann den eigenen Upload nicht erneut übernehmen",
  /kd_seed_shared_article_owner_claim/.test(claimSchema)
  && /after insert on public\.kd_shared_articles/.test(claimSchema)
  && /revoke all on function public\.kd_seed_shared_article_owner_claim\(\) from public, anon, authenticated/.test(claimSchema));
check("Nur angemeldete Konten dürfen die atomare Claim-RPC ausführen",
  /auth\.uid\(\)/.test(claimSchema)
  && /revoke all on function public\.kd_claim_shared_article\(uuid\) from public, anon/.test(claimSchema)
  && /grant execute on function public\.kd_claim_shared_article\(uuid\) to authenticated/.test(claimSchema));

const archive = fs.readFileSync("supabase/migrations/20260731121000_archive_legacy_shared.sql", "utf8");
check("Legacy-Shared wird vor dem Löschen reversibel archiviert",
  archive.indexOf("insert into public.kd_legacy_shared_archive")
    < archive.indexOf("delete from public.kd_store"));
check("Alte Clients können keine neuen Legacy-Shared-Zeilen anlegen",
  /before insert or update on public\.kd_store/.test(archive)
  && /new\.scope = 'shared'/.test(archive));

console.log(`sharedarticles_test: ${ok} Checks bestanden.`);

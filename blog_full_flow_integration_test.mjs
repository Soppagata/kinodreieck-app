import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { BLOG_RPC, BLOG_NEUTRAL_AUTHOR } from "./src/lib/blogContract.js";
import { buildBlogLibraryIndex, projectPublicBlogReferences } from "./src/lib/blogReferenceProjection.js";
import { startBlogPublicationPgHarness } from "./tools/blog-publication-pg-harness.mjs";

const require = createRequire(import.meta.url);
let esbuild;
try { esbuild = require("esbuild"); }
catch { esbuild = require("vite/node_modules/esbuild"); }

function installLocalDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://blog.integration.invalid/",
  });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement",
    "HTMLTextAreaElement", "HTMLSelectElement", "Element", "Event", "MouseEvent",
    "KeyboardEvent", "Node", "NodeList", "getComputedStyle", "localStorage"]) {
    Object.defineProperty(globalThis, key, {
      value: key === "window" ? dom.window : dom.window[key],
      configurable: true, writable: true,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error("No external network in Blog integration test"); };
  dom.window.fetch = globalThis.fetch;
  return dom;
}

async function loadDeliveredBlogUi() {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const result = await esbuild.build({
    stdin: {
      contents: [
        'export { default as React, act } from "react";',
        'export { createRoot } from "react-dom/client";',
        'export { BlogTab } from "./src/tabs/BlogTab.jsx";',
        'export { useBlogPublicationController } from "./src/controllers/useBlogPublicationController.js";',
        'export { useArticleController } from "./src/controllers/useArticleController.js";',
        'export { localDriver, setStorageDriver } from "./src/lib/storage.js";',
        'export { createSharedArticlesService } from "./src/services/sharedArticles.js";',
      ].join("\n"),
      sourcefile: "blog-full-flow-integration-entry.jsx",
      resolveDir: directory,
      loader: "jsx",
    },
    write: false, bundle: true, platform: "node", format: "esm", jsx: "automatic",
    // Keep React's native Node scheduler; bundling its act helper would fall
    // back to browser MessageChannels and leave test-only ports open.
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    loader: { ".css": "empty" },
  });
  const temporary = mkdtempSync(path.join(directory, ".blog-integration-"));
  try {
    const filename = path.join(temporary, "fixture.mjs");
    writeFileSync(filename, result.outputFiles[0].text);
    return await import(pathToFileURL(filename).href);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

function syntheticSession(accountId) {
  return { mode: "account", state: "ready", account: { id: accountId },
    capabilities: { remoteStorage: true, personalAi: false } };
}

function localService(ui, { session, rpc, calls, afterResponse }) {
  const token = "synthetic-blog-" + session.accountId;
  return ui.createSharedArticlesService({
    config: { supabaseUrl: "https://blog-fixture.supabase.co",
      supabasePublishableKey: "sb_publishable_synthetic_blog_local" },
    auth: { getSnapshot: () => syntheticSession(session.accountId) },
    getAccessToken: async () => token,
    getStoredAccountId: () => session.accountId,
    fetchImpl: createLocalBlogRpcFetch({ rpc, calls, afterResponse,
      sessions: new Map([[token, session]]) }),
  });
}

/* The final integration test connects the delivered service/UI to a disposable
   PostgreSQL harness. No provider or public backend request is allowed. */
export function createLocalBlogRpcFetch({ rpc, sessions, calls, afterResponse }) {
  return async (url, options = {}) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://blog-fixture.supabase.co");
    assert.equal(options.method, "POST");
    assert.ok(parsed.pathname.startsWith("/rest/v1/rpc/"));
    const name = parsed.pathname.slice("/rest/v1/rpc/".length);
    assert.ok(Object.values(BLOG_RPC).includes(name), "Only Blog RPCs may be requested");
    const headers = new Headers(options.headers);
    const token = headers.get("Authorization")?.replace(/^Bearer /, "");
    const session = sessions.get(token);
    assert.ok(session, "unknown synthetic account token");
    const body = JSON.parse(options.body || "{}");
    const call = { name, account: session.accountId, body: structuredClone(body) };
    calls.push(call);
    const data = await rpc(name, body, session);
    await afterResponse?.(call, data);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function assertAnonymizedPage(page, privateIdentifiers) {
  const encoded = JSON.stringify(page);
  for (const privateValue of privateIdentifiers) {
    assert.ok(!encoded.includes(privateValue), "Private identifier leaked into public page");
  }
  for (const item of page.items) {
    assert.equal(item.author, BLOG_NEUTRAL_AUTHOR);
    assert.equal(item.article.id, item.publicationId);
    assert.deepEqual(Object.keys(item).sort(), ["article", "author", "contentVersion",
      "publicationId", "publicRevision", "publishedAt", "shareToken", "updatedAt"].sort());
    for (const reference of item.article.references) {
      assert.equal("rowId" in reference, false);
      assert.equal("ref" in reference, false);
      assert.ok(reference.referenceId);
      assert.ok(reference.sources.cinema.every((target) => target.art === "programm"));
      assert.ok([...reference.sources.streaming, ...reference.sources.cinema]
        .every((target) => target.kind !== "library"));
    }
  }
}

function buttonWithText(host, label) {
  const element = [...host.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === label);
  assert.ok(element, `Visible Blog action is missing: ${label}`);
  return element;
}

async function click(ui, dom, element) {
  assert.ok(element && !element.disabled, "Expected usable Blog control");
  await ui.act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function input(ui, dom, element, value) {
  assert.ok(element, "Expected Blog input");
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set;
  await ui.act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function settled(ui, predicate, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    await ui.act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    if (predicate()) return;
  }
  assert.fail(`Blog did not settle: ${description}`);
}

function field(host, prefix) {
  const label = [...host.querySelectorAll("label")]
    .find((element) => element.textContent.trim().startsWith(prefix));
  const control = label?.control || label?.querySelector("input,textarea,select")
    || [...host.querySelectorAll("input,textarea,select")]
      .find((element) => element.getAttribute("aria-label")?.startsWith(prefix)
        || element.getAttribute("placeholder")?.startsWith(prefix));
  assert.ok(control, `Blog field missing: ${prefix}`);
  return control;
}

async function mountAccount(ui, { accountId, service, values, initialLibrary = [], selectedServices }) {
  const writes = [];
  const navigations = [];
  const errors = [];
  const driver = {
    name: "blog-integration", owner: `account:${accountId}`,
    async get(key) { return values.has(key) ? { key, value: values.get(key) } : null; },
    async set(key, value) { values.set(key, value); writes.push({ key, value }); return { key, value }; },
    async delete(key) { values.delete(key); return { key, deleted: true }; },
    async list() { return { keys: [...values.keys()] }; },
  };
  ui.setStorageDriver(driver);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = ui.createRoot(host);
  const storedLibrary = values.has("kd:master")
    ? JSON.parse(values.get("kd:master")).filme : initialLibrary;
  let model;
  let articleApi;
  let library;
  let failMediaOnce = false;
  const clock = () => new Date().toISOString();
  const reportError = (message) => errors.push(message);
  function Harness() {
    const [items, setItems] = ui.React.useState(storedLibrary);
    const articles = ui.useArticleController({ setErr: reportError });
    const addLibraryItem = ui.React.useCallback(async (mediaInput) => {
      if (failMediaOnce) { failMediaOnce = false; return null; }
      const existing = items.find((entry) => entry.titel === mediaInput.titel && entry.jahr === mediaInput.jahr);
      if (existing) return existing.id;
      const id = `private-${accountId}-media-${items.length + 1}`;
      const next = [...items, { ...mediaInput, id }];
      await driver.set("kd:master", JSON.stringify({ filme: next, gespeichertAm: Date.now() }));
      setItems(next);
      return id;
    }, [items]);
    model = ui.useBlogPublicationController({
      accountScope: accountId, enabled: true,
      articles: articles.artikelListe, articlesReady: articles.artikelGeladen,
      writeArticles: articles.schreibeArtikel,
      library: items, libraryReady: true, mustwatch: [], mustwatchReady: true,
      selectedServices, selectedServicesReady: true,
      service, addLibraryItem, navigateTarget: (target) => { navigations.push(target); return true; },
      setError: reportError, clock,
    });
    articleApi = articles;
    library = items;
    return ui.React.createElement(ui.BlogTab, model);
  }
  await ui.act(async () => { root.render(ui.React.createElement(Harness)); });
  await settled(ui, () => articleApi?.artikelGeladen && model?.publicationCapability.status === "ready", "account and capability");
  return {
    host, writes, navigations, errors,
    get model() { return model; },
    get articles() { return articleApi.artikelListe; },
    get library() { return library; },
    failNextMediaWrite() { failMediaOnce = true; },
    async action(name, argument) {
      let result;
      await ui.act(async () => { result = await model.actions[name](argument); });
      return result;
    },
    async close() {
      await ui.act(async () => { root.unmount(); });
      host.remove();
      ui.setStorageDriver(ui.localDriver);
    },
  };
}

let checks = 0;
function check(name, predicate) {
  assert.ok(predicate, name);
  checks++;
  console.log(`✓ ${name}`);
}

const dom = installLocalDom();
const ui = await loadDeliveredBlogUi();
const pg = await startBlogPublicationPgHarness();
const calls = [];
const accounts = pg.accounts;
const alphaValues = new Map();
const betaValues = new Map();
const rpc = (name, body, session) => pg.callRpc(name, body, { role: "authenticated", accountId: session.accountId });
let dropNextPublishResponse = false;
const alphaService = localService(ui, {
  session: { accountId: accounts.alpha }, rpc, calls,
  afterResponse: (call) => {
    if (dropNextPublishResponse && call.name === BLOG_RPC.publish) {
      dropNextPublishResponse = false;
      throw new TypeError("Synthetic response lost after committed publication");
    }
  },
});
const betaService = localService(ui, { session: { accountId: accounts.beta }, rpc, calls });
let mounted;
try {
  for (const session of [{ role: "anon", accountId: null }, { role: "authenticated", accountId: accounts.inactive }]) {
    assert.throws(() => pg.callRpc(BLOG_RPC.list, { contractVersion: "blog-publication-v1", cursor: null, limit: 20 }, session));
  }
  check("Gemeinsame Blogs sind nur für aktive Konten lesbar", true);
  const alphaLibrary = [{ id: "private-alpha-new-hope", titel: "Star Wars: A New Hope", jahr: 1977, typ: "film", imdb_id: "tt0076759" }];
  const betaLibrary = [{ id: "private-beta-new-hope", titel: "Star Wars: A New Hope", jahr: 1977, typ: "film", imdb_id: "tt0076759" }];
  mounted = await mountAccount(ui, { accountId: accounts.alpha, service: alphaService, values: alphaValues, initialLibrary: alphaLibrary, selectedServices: ["Netflix"] });
  await click(ui, dom, buttonWithText(mounted.host, "+ Neuer Artikel"));
  await input(ui, dom, field(mounted.host, "Titel"), "Integration Star Wars");
  await input(ui, dom, field(mounted.host, "Text"), "Meine gemeinsame Watch-Order.");
  await click(ui, dom, mounted.host.querySelector(".kd-blog-check input"));
  const references = [
    ["Star Wars: A New Hope", 1977],
    ["Star Wars: The Empire Strikes Back", 1980],
    ["Star Wars: Return of the Jedi", 1983],
    ["Star Wars: Synthetic Missing Story", 1984],
  ];
  for (const [title, year] of references) {
    await input(ui, dom, mounted.host.querySelector("#kd-blog-add-reference"), title);
    await input(ui, dom, field(mounted.host, "Jahr"), String(year));
    await click(ui, dom, buttonWithText(mounted.host, "Hinzufügen"));
  }
  const originalRowIds = mounted.model.editor.references.map((row) => row.rowId);
  const privateStartCalls = calls.length;
  await click(ui, dom, buttonWithText(mounted.host, "Privat speichern"));
  await settled(ui, () => mounted.articles.length === 1, "private save");
  const articleId = mounted.articles[0].id;
  check("Der echte Editor speichert Rangliste und stabile Zeilen zunächst nur privat",
    mounted.articles[0].liste.length === 4 && mounted.articles[0].geordnet
      && mounted.articles[0].liste.every((row, index) => row.rowId === originalRowIds[index])
      && !calls.slice(privateStartCalls).some((call) => [BLOG_RPC.publish, BLOG_RPC.update].includes(call.name)));
  await click(ui, dom, mounted.host.querySelector(".kd-blog-publish-check input"));
  await click(ui, dom, buttonWithText(mounted.host, "Speichern & veröffentlichen"));
  await settled(ui, () => !!mounted.articles[0]?.publikation?.publicationId, "publication");
  const publicationId = mounted.articles[0].publikation.publicationId;
  let page = (await betaService.listV1()).page;
  assertAnonymizedPage(page, [accounts.alpha, articleId, ...originalRowIds, alphaLibrary[0].id]);
  check("UI, privater Controller, Service und SQL veröffentlichen genau eine anonyme Kopie",
    page.items.length === 1 && page.items[0].publicationId === publicationId
      && mounted.model.editor.publicationId === publicationId);
  await mounted.close(); mounted = null;

  mounted = await mountAccount(ui, { accountId: accounts.beta, service: betaService, values: betaValues, initialLibrary: betaLibrary, selectedServices: ["Disney+"] });
  const readStart = calls.length;
  await click(ui, dom, buttonWithText(mounted.host, "Veröffentlicht"));
  await settled(ui, () => mounted.model.publishedPage.items.length === 1, "published list");
  check("Karten begrenzen die sichtbare Referenzvorschau auf drei und zeigen die Restanzahl",
    mounted.host.querySelectorAll(".kd-blog-card .kd-blog-reference-row").length === 3
      && /1 weitere/.test(mounted.host.textContent));
  await click(ui, dom, buttonWithText(mounted.host, "Lesen"));
  const views = mounted.model.reader.referenceViews;
  check("Konto B erhält seine Mediathek, sein Disney+-Angebot, Kino und einen echten Rotlink",
    views[0].primaryTarget?.ref === betaLibrary[0].id
      && views[1].primaryTarget?.kind === "streaming" && views[1].primaryTarget?.sourceId === "disney"
      && views[2].primaryTarget?.kind === "cinema" && views[2].primaryTarget?.art === "programm"
      && views[3].state === "redlink");
  check("Vorbereitete Streamingangebote werden ausschließlich nach der Auswahl des Lesers gefiltert",
    views.flatMap((reference) => [reference.primaryTarget, ...reference.secondaryTargets]).filter(Boolean)
      .filter((target) => target.kind === "streaming").every((target) => target.sourceId === "disney"));
  for (const reference of views.slice(0, 3)) await mounted.action("onNavigateReference", { referenceId: reference.rowId, target: reference.primaryTarget });
  check("Die Leserziele werden mit den echten privaten beziehungsweise zentralen Kennungen geöffnet",
    mounted.navigations.length === 3 && mounted.navigations[0].ref === "private-beta-new-hope"
      && mounted.navigations[2].ref === "fixture-film-at-jedi");
  check("Öffnen und Navigieren fordern ausschließlich die vorbereitete Blogliste an",
    calls.slice(readStart).every((call) => call.name === BLOG_RPC.list));

  const redlink = () => [...mounted.host.querySelectorAll(".kd-blog-reference-link")]
    .find((element) => element.textContent.includes("Synthetic Missing Story"));
  await click(ui, dom, redlink());
  check("Ein Rotlink aus einem fremden Blog öffnet die eigene Ergänzung", mounted.model.view.mode === "redlink_form");
  await click(ui, dom, buttonWithText(mounted.host, "← Zurück"));
  check("Abbruch kehrt in den ursprünglichen veröffentlichten Leser zurück", mounted.model.reader?.scope === "published");
  await click(ui, dom, redlink());
  mounted.failNextMediaWrite();
  const withoutRating = [...mounted.host.querySelectorAll("label")].find((label) => label.textContent.includes("Ohne Bewertung speichern"));
  await click(ui, dom, withoutRating?.control || withoutRating?.querySelector("input"));
  await click(ui, dom, buttonWithText(mounted.host, "Hinzufügen"));
  await settled(ui, () => mounted.model.redlinkForm?.status === "failed", "failed media save");
  check("Ein fehlgeschlagener Medienwrite erhält das Ergänzungsformular und seinen Titel",
    field(mounted.host, "Titel").value === "Star Wars: Synthetic Missing Story");
  await click(ui, dom, buttonWithText(mounted.host, "Hinzufügen"));
  await settled(ui, () => mounted.model.reader?.scope === "published", "confirmed redlink return");
  check("Bestätigtes Ergänzen verknüpft nur die persönliche Mediathek des Lesers",
    mounted.model.reader.referenceViews[3].primaryTarget?.kind === "library"
      && mounted.articles.length === 0 && mounted.library.length === 2);
  page = (await betaService.listV1()).page;
  check("Rotlink-Ergänzung verändert keinen fremden Blog", page.items[0].publicRevision === 1);
  await mounted.close(); mounted = null;

  mounted = await mountAccount(ui, { accountId: accounts.beta, service: betaService, values: betaValues, initialLibrary: betaLibrary, selectedServices: ["Disney+"] });
  await click(ui, dom, buttonWithText(mounted.host, "Veröffentlicht"));
  await settled(ui, () => mounted.model.publishedPage.items.length === 1, "reader reload");
  await click(ui, dom, buttonWithText(mounted.host, "Lesen"));
  check("Die ergänzte persönliche Referenz funktioniert auch nach einem Neuladen",
    mounted.model.reader.referenceViews[3].primaryTarget?.kind === "library"
      && mounted.library.length === 2 && mounted.articles.length === 0);
  await mounted.close(); mounted = null;

  mounted = await mountAccount(ui, { accountId: accounts.alpha, service: alphaService, values: alphaValues, initialLibrary: alphaLibrary, selectedServices: ["Netflix"] });
  await settled(ui, () => mounted.articles[0]?.publikation?.publicationId === publicationId, "owner readback");
  await click(ui, dom, buttonWithText(mounted.host, "Bearbeiten"));
  check("Reload stellt die Publikation wieder her und startet die Checkbox ausgeschaltet",
    mounted.model.editor.publicationId === publicationId && !mounted.model.editor.anonymousPublication);
  await input(ui, dom, field(mounted.host, "Text"), "Diese Änderung bleibt zunächst privat.");
  await click(ui, dom, buttonWithText(mounted.host, "Änderungen privat speichern"));
  page = (await betaService.listV1()).page;
  check("Private Weiterarbeit bewahrt den veröffentlichten Inhalt und kennzeichnet den Unterschied",
    page.items[0].article.text === "Meine gemeinsame Watch-Order."
      && mounted.model.articleCards[0].displayState === "private_changes");
  await click(ui, dom, mounted.host.querySelector(".kd-blog-publish-check input"));
  await click(ui, dom, buttonWithText(mounted.host, "Speichern & aktualisieren"));
  await settled(ui, () => mounted.articles[0]?.publikation?.publicRevision === 2, "public update");
  page = (await betaService.listV1()).page;
  check("Bewusstes Aktualisieren ersetzt dieselbe öffentliche Kopie", page.items.length === 1
    && page.items[0].publicationId === publicationId && page.items[0].article.text === "Diese Änderung bleibt zunächst privat.");

  pg.sourceUpdate({ sourceRevision: 2, streamingRows: pg.defaultStreamingRows.map((row) => row.sourceKey === "stream-empire" ? { ...row, services: ["Netflix"] } : row) });
  // Execute the SQL command registered by the migration's bounded scheduler job.
  pg.runScheduledRefresh();
  page = (await betaService.listV1()).page;
  check("Quellenpflege aktualisiert vorbereitete Ziele ohne Blogtext oder Revision zu verändern",
    page.items[0].article.references[1].sources.streaming.some((target) => target.sourceId === "netflix")
      && page.items[0].publicRevision === 2 && page.items[0].article.text === "Diese Änderung bleibt zunächst privat.");
  const withdrawn = await mounted.action("onWithdraw", { articleId });
  check("Rücknahme entfernt die öffentliche Kopie und bewahrt den privaten Artikel",
    withdrawn.status === "withdrawn" && (await betaService.listV1()).page.items.length === 0
      && mounted.articles.some((article) => article.id === articleId));
  assert.deepEqual(mounted.errors, []);

  await mounted.action("onNewArticle");
  await input(ui, dom, field(mounted.host, "Titel"), "Antwortverlust Integration");
  await input(ui, dom, field(mounted.host, "Text"), "Dieser Beitrag wird bestätigt zurückgezogen.");
  await click(ui, dom, mounted.host.querySelector(".kd-blog-publish-check input"));
  dropNextPublishResponse = true;
  const uncertain = await mounted.action("onSave", { draftKey: mounted.model.editor.draftKey, anonymousPublication: true });
  check("Verlorene Antwort meldet keinen erfundenen Veröffentlichungserfolg", uncertain.publication.status === "unknown");
  const uncertainArticleId = uncertain.private.articleId;
  check("Der simulierte Antwortverlust geschieht erst nach echtem SQL-Commit", (await betaService.listV1()).page.items.length === 1);
  const deletion = await mounted.action("onDelete", { articleId: uncertainArticleId });
  check("Löschen klärt eine ungewisse Veröffentlichung und hinterlässt keine öffentliche Waise",
    deletion.private.status === "deleted" && (await betaService.listV1()).page.items.length === 0
      && !mounted.articles.some((article) => article.id === uncertainArticleId));

  const twinPublication = await alphaService.publishV1({
    contractVersion: "blog-publication-v1",
    operationId: "30000000-0000-4000-8000-000000000901",
    contentVersion: "40000000-0000-4000-8000-000000000901",
    privateArticleId: "private-alpha-identity-integration", expectedPublicRevision: null,
    article: { title: "Identitätsprobe", text: "Zwei unterschiedliche gleichnamige Werke.", ordered: true,
      references: [{ rowId: "private-twin-row", rank: 1, title: "Synthetic Twin", year: 2000,
        mediaType: "film", identityHints: [{ namespace: "imdb", value: "tt1000001" }],
        resolutionIntent: { kind: "auto" } }] },
  });
  assert.equal(twinPublication.outcome, "published");
  page = (await betaService.listV1()).page;
  assertAnonymizedPage(page, [accounts.alpha, "private-alpha-identity-integration", "private-twin-row"]);
  const twinReferences = page.items[0].article.references;
  const projectTwins = (library) => projectPublicBlogReferences(twinReferences, {
    selectedSourceIds: ["netflix", "prime"], library, libraryIndex: buildBlogLibraryIndex(library),
    libraryReady: true, now: new Date().toISOString(),
  })[0];
  const wrongTwin = { id: "private-beta-twin-b", titel: "Synthetic Twin", jahr: 2000,
    typ: "film", imdb_id: "tt1000002" };
  const correctTwin = { id: "private-beta-twin-a", titel: "Synthetic Twin", jahr: 2000,
    typ: "film", imdb_id: "tt1000001" };
  check("Gleichnamige Werke mit widersprüchlichen IMDb-IDs erhalten keinen falschen Mediatheklink",
    projectTwins([wrongTwin]).primaryTarget?.kind === "streaming");
  check("Der Leser erhält zwischen zwei gleichnamigen Werken genau seine passende Ausgabe",
    projectTwins([wrongTwin, correctTwin]).primaryTarget?.ref === correctTwin.id);
  check("Bestätigte gemeinsame Werkidentität funktioniert auch bei abweichendem gespeicherten Anzeigenamen",
    projectTwins([{ ...correctTwin, titel: "Mein anderer Anzeigename" }]).primaryTarget?.ref === correctTwin.id);
  console.log(`blog_full_flow_integration_test: ${checks} Checks bestanden (echte UI/Controller/Service, lokales PostgreSQL, zwei Konten).`);
} finally {
  if (mounted) await mounted.close();
  pg.stop();
  dom.window.close();
  esbuild.stop();
}

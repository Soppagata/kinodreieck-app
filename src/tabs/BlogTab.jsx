import { useEffect, useMemo, useState } from "react";
import { BLOG_SAVE_INTENT } from "../lib/blogContract.js";
import { BlogArticleCards } from "../components/blog/BlogArticleCards.jsx";
import { BlogEditor } from "../components/blog/BlogEditor.jsx";
import { BlogReader } from "../components/blog/BlogReader.jsx";
import { BlogRedlinkForm } from "../components/blog/BlogRedlinkForm.jsx";
import "../styles/blog.css";

const NOOP = () => {};

function publicationIdFrom(editor) {
  return editor?.publicationId || editor?.saveStatus?.publicationId
    || editor?.saveStatus?.publication?.publicationId || null;
}

function saveNotice(result) {
  const privateStatus = result?.private?.status;
  const publicStatus = result?.publication?.status;
  if (privateStatus === "failed") return { kind: "error", text: "Privates Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten." };
  if (privateStatus !== "saved") return null;
  if (publicStatus === "failed") return { kind: "error", text: "Privat gespeichert, Veröffentlichung fehlgeschlagen." };
  if (publicStatus === "unknown") return { kind: "warning", text: "Privat gespeichert. Ob die Veröffentlichung angekommen ist, wird geprüft." };
  if (publicStatus === "decision_required") return { kind: "warning", text: "Privat gespeichert. Vor der Veröffentlichung sind noch Referenzentscheidungen nötig." };
  if (publicStatus === "conflict") return { kind: "warning", text: "Privat gespeichert. Die öffentliche Fassung wurde inzwischen geändert." };
  if (publicStatus === "published") return { kind: "success", text: "Privat gespeichert und anonym veröffentlicht." };
  if (publicStatus === "updated") return { kind: "success", text: "Privat gespeichert und Veröffentlichung aktualisiert." };
  return { kind: "success", text: "Privat gespeichert." };
}

function PublishedList({ page, actions, onNotice }) {
  const items = Array.isArray(page?.items) ? page.items : [];
  const [search, setSearch] = useState("");
  const loading = page?.status === "loading";
  const failed = page?.status === "failed";
  const query = search.trim().toLocaleLowerCase("de-AT");
  const visibleItems = query ? items.filter((item) => String(item.title || "").toLocaleLowerCase("de-AT").includes(query)) : items;
  useEffect(() => {
    if (page?.status === "idle" && actions.onLoadPublished) void actions.onLoadPublished({ cursor: null, replace: true });
  }, [actions, page?.status]);
  const load = async (replace) => {
    const result = await actions.onLoadPublished?.({ cursor: replace ? null : page?.nextCursor || null, replace });
    if (result?.status === "failed") onNotice({ kind: "error", text: "Veröffentlichte Artikel konnten nicht geladen werden." });
  };
  return <section className="kd-blog-list" aria-labelledby="kd-blog-published-heading">
    <div className="kd-blog-list-head">
      <h2 id="kd-blog-published-heading">Veröffentlichte Blogs</h2>
      <button type="button" className="kd-blog-button kd-blog-button-quiet" disabled={loading} onClick={() => void load(true)}>Neu laden</button>
    </div>
    {loading && !items.length ? <p role="status" className="kd-blog-muted">Veröffentlichte Blogs werden geladen …</p> : null}
    {failed ? <p role="alert" className="kd-blog-error">Veröffentlichte Blogs sind derzeit nicht verfügbar.</p> : null}
    {!loading && !failed && !items.length ? <p className="kd-blog-muted">Noch keine veröffentlichten Blogs.</p> : null}
    {items.length ? <label className="kd-blog-field kd-blog-search">Nach Titel suchen
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
      {!page?.complete ? <small>Die Suche berücksichtigt die bereits geladenen Artikel.</small> : null}
    </label> : null}
    {query && !visibleItems.length ? <p className="kd-blog-muted">Kein geladener Artikel passt zu deiner Suche.</p> : null}
    <BlogArticleCards cards={visibleItems} scope="published" actions={actions} onNotice={onNotice} />
    {!page?.complete && page?.nextCursor ? <button type="button" className="kd-blog-button kd-blog-load-more" disabled={loading}
      onClick={() => void load(false)}>{loading ? "Lädt …" : "Weitere laden"}</button> : null}
  </section>;
}

export function BlogTab({
  publicationCapability = { status: "unavailable", reason: null },
  view = { area: "mine", mode: "list", articleId: null, returnToken: null },
  editor = null, reader = null, redlinkForm = null, articleCards = [],
  referenceExtraction = null,
  publishedPage = { status: "idle", items: [], nextCursor: null, complete: true, errorCode: null },
  actions: suppliedActions = {},
}) {
  const actions = useMemo(() => ({
    onNewArticle: NOOP, onEditArticle: NOOP, onReadArticle: NOOP, onBack: NOOP,
    onEditorChange: NOOP, onAddReference: NOOP, onMoveReference: NOOP,
    onRemoveReference: NOOP, onPrivateSave: async () => null, onPublish: async () => null,
    onSave: async () => null, onReferenceDecision: async () => null,
    onNavigateReference: NOOP, onOpenRedlinkForm: NOOP, onCancelRedlinkForm: NOOP,
    onConfirmRedlinkForm: async () => null, onRetryPublication: async () => null,
    onWithdraw: async () => null, onDelete: async () => null, onLoadPublished: async () => null,
    ...suppliedActions,
  }), [suppliedActions]);
  const [notice, setNotice] = useState(null);
  useEffect(() => { setNotice(null); }, [view.area, view.mode, view.articleId]);
  const savePrivate = async () => {
    const result = await actions.onPrivateSave({ draftKey: editor?.draftKey });
    setNotice(saveNotice(result));
    return result;
  };
  const publish = async () => {
    const result = await actions.onPublish({
      draftKey: editor?.draftKey,
      anonymousPublication: editor?.anonymousPublication === true,
    });
    setNotice(saveNotice(result));
    return result;
  };

  let content;
  if (view.mode === "editor" && editor) {
    const hasPublication = !!publicationIdFrom(editor);
    const intent = hasPublication ? BLOG_SAVE_INTENT.UPDATE : BLOG_SAVE_INTENT.PUBLISH;
    content = <BlogEditor editor={editor} capability={publicationCapability} actions={actions} intent={intent}
      hasPublication={hasPublication} referenceExtraction={referenceExtraction}
      onPrivateSave={savePrivate} onPublish={publish}
      onBack={() => actions.onBack({ returnToken: view.returnToken })} />;
  } else if (view.mode === "reader" && reader) {
    content = <BlogReader reader={reader} actions={actions} />;
  } else if (view.mode === "redlink_form" && redlinkForm) {
    content = <BlogRedlinkForm form={redlinkForm} actions={actions} />;
  } else if (view.area === "published") {
    content = <PublishedList page={publishedPage} actions={actions} onNotice={setNotice} />;
  } else {
    content = <section className="kd-blog-list" aria-labelledby="kd-blog-mine-heading">
      <div className="kd-blog-list-head"><h2 id="kd-blog-mine-heading">Meine Artikel</h2>
        <button type="button" className="kd-blog-button kd-blog-button-primary" onClick={actions.onNewArticle}>+ Neuer Artikel</button></div>
      {!articleCards.length ? <p className="kd-blog-muted">Noch keine Artikel.</p> : null}
      <BlogArticleCards cards={articleCards} scope="private" actions={actions} onNotice={setNotice} />
    </section>;
  }

  return <div className="kd-blog-v1">
    <header className="kd-blog-header"><p className="kd-blog-kicker">KINODREIECK</p><h1>Blog</h1>
      <nav className="kd-blog-tabs" aria-label="Blog-Bereiche">
        <button type="button" aria-current={view.area === "mine" ? "page" : undefined}
          onClick={() => actions.onBack({ returnToken: view.area === "mine" ? view.returnToken : null })}>Meine Artikel</button>
        <button type="button" aria-current={view.area === "published" ? "page" : undefined}
          onClick={() => void actions.onLoadPublished({ cursor: null, replace: true })}>Veröffentlicht</button>
      </nav>
      {notice ? <p className={`kd-blog-notice kd-blog-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p> : null}
    </header>
    <main className="kd-blog-content">{content}</main>
  </div>;
}

export { BLOG_SAVE_INTENT };

import { BlogReferenceList } from "./BlogReferenceList.jsx";

export function BlogReader({ reader, actions }) {
  const article = reader.article || {};
  return <article className="kd-blog-reader" aria-labelledby="kd-blog-reader-title">
    <div className="kd-blog-reader-head"><button type="button" className="kd-blog-button kd-blog-button-quiet" onClick={() => actions.onBack({ returnToken: reader.returnToken })}>← Zurück</button>
      {reader.canEdit ? <button type="button" className="kd-blog-button" onClick={() => actions.onEditArticle({ articleId: article.articleId })}>Bearbeiten</button> : null}</div>
    {reader.scope === "published" ? <p className="kd-blog-meta">Ohne Namensangabe</p> : null}
    <h2 id="kd-blog-reader-title">{article.title}</h2><div className="kd-blog-reader-text">{article.text}</div>
    {reader.referenceViews?.length ? <section className="kd-blog-reader-references" aria-labelledby="kd-blog-reader-references-heading">
      <h3 id="kd-blog-reader-references-heading">Titelliste & Verknüpfungen</h3>
      <BlogReferenceList references={reader.referenceViews.map((reference) => ({ ...reference, articleId: article.articleId }))} ordered={article.ordered === true}
        editable={false} redlinksEnabled actions={actions} />
    </section> : null}
  </article>;
}

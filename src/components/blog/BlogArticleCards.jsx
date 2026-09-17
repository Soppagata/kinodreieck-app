import { BlogReferenceList } from "./BlogReferenceList.jsx";

function displayLabel(state) {
  if (state === "published") return "Veröffentlicht";
  if (state === "private_changes") return "Änderungen privat";
  return "Privat";
}

export function BlogArticleCards({ cards = [], scope, actions, onNotice }) {
  const read = (card) => actions.onReadArticle({ scope, articleId: card.articleId, returnToken: card.returnToken || null });
  const withdraw = async (card) => {
    const result = await actions.onWithdraw({ articleId: card.articleId });
    onNotice(result?.status === "withdrawn" || result?.status === "absent" ? { kind: "success", text: "Veröffentlichung zurückgezogen. Der private Artikel bleibt erhalten." }
      : result?.status === "unknown" ? { kind: "warning", text: "Ob die Veröffentlichung entfernt wurde, wird geprüft." }
        : { kind: "error", text: "Die Veröffentlichung konnte nicht sicher zurückgezogen werden." });
  };
  const remove = async (card) => {
    if (!window.confirm(`„${card.title}“ wirklich löschen? Eine vorhandene Veröffentlichung wird zuerst sicher zurückgezogen.`)) return;
    const result = await actions.onDelete({ articleId: card.articleId });
    if (result?.private?.status === "deleted") onNotice({ kind: "success", text: "Artikel gelöscht." });
    else if (result?.private?.status === "kept") onNotice({ kind: "error", text: "Der private Artikel bleibt erhalten, weil die öffentliche Kopie nicht sicher entfernt werden konnte." });
    else onNotice({ kind: "error", text: "Artikel konnte nicht gelöscht werden." });
  };
  return <div className="kd-blog-card-grid">{cards.map((card) => {
    const publicationError = typeof card.publicationError === "string" ? { status: card.publicationError, operationId: null } : card.publicationError;
    return <article className="kd-blog-card" key={card.articleId}>
    <div className="kd-blog-meta">{scope === "published" ? <span>Ohne Namensangabe</span> : <span className="kd-blog-state">{displayLabel(card.displayState)}</span>}
      {card.updatedAt ? <time dateTime={card.updatedAt}>{new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" }).format(new Date(card.updatedAt))}</time> : null}</div>
    <h3><button type="button" className="kd-blog-card-title" onClick={() => read(card)}>{card.title}</button></h3>
    <p className="kd-blog-excerpt">{card.excerpt}</p>
    {card.referencePreview?.length ? <BlogReferenceList references={card.referencePreview.map((reference) => ({ ...reference, articleId: card.articleId }))}
      ordered={card.ordered === true} redlinksEnabled previewLimit={3} editable={false} actions={actions} /> : null}
    {publicationError ? <p role="status" className="kd-blog-error">Veröffentlichung: {publicationError.status === "unknown" ? "Ergebnis wird geprüft." : "Aktion fehlgeschlagen."}</p> : null}
    <div className="kd-blog-card-actions"><button type="button" className="kd-blog-button kd-blog-button-primary" onClick={() => read(card)}>Lesen</button>
      {scope === "private" ? <><button type="button" className="kd-blog-button kd-blog-button-quiet" onClick={() => actions.onEditArticle({ articleId: card.articleId })}>Bearbeiten</button>
        <details className="kd-blog-card-menu"><summary aria-label={`Weitere Aktionen für ${card.title}`}>⋯</summary><div className="kd-blog-menu-panel">
          {card.displayState !== "private" ? <button type="button" onClick={() => void withdraw(card)}>Veröffentlichung zurückziehen</button> : null}
          {publicationError?.operationId ? <button type="button" onClick={() => void actions.onRetryPublication({ articleId: card.articleId, operationId: publicationError.operationId })}>Veröffentlichung prüfen</button> : null}
          <button type="button" className="kd-blog-danger" onClick={() => void remove(card)}>Artikel löschen</button></div></details></> : null}</div>
  </article>})}</div>;
}

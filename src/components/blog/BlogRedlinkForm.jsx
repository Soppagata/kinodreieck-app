import { FilmForm } from "../EintragForm.jsx";

export function BlogRedlinkForm({ form, actions }) {
  const busy = form.status === "saving";
  return <section className="kd-blog-redlink-form" aria-labelledby="kd-blog-redlink-heading" aria-busy={busy}>
    <div className="kd-blog-list-head"><h2 id="kd-blog-redlink-heading">Rotlink ergänzen</h2>
      <button type="button" className="kd-blog-button kd-blog-button-quiet" disabled={busy} onClick={() => actions.onCancelRedlinkForm({ articleId: form.articleId, rowId: form.rowId })}>← Zurück</button></div>
    <p className="kd-blog-muted">Der Blogentwurf, die Reihenfolge und die Veröffentlichungswahl bleiben erhalten.</p>
    {form.status === "failed" ? <p role="alert" className="kd-blog-error">Der Eintrag konnte nicht bestätigt verknüpft werden. Deine Eingabe bleibt erhalten.</p> : null}
    <FilmForm startOffen initial={form.initial} typOptionen={[form.initial?.typ || "film"]}
      onAdd={async (mediaInput) => {
        const result = await actions.onConfirmRedlinkForm({ articleId: form.articleId, rowId: form.rowId, mediaInput });
        if (result?.status === "saved" && result?.mediaWriteConfirmed === true) return true;
        throw new Error("Eintrag und Rotlink konnten nicht bestätigt gespeichert werden. Deine Eingabe bleibt erhalten.");
      }} onDone={() => {}} />
  </section>;
}

import { useState } from "react";
import { BLOG_MAX_REFERENCES, BLOG_SAVE_INTENT } from "../../lib/blogContract.js";
import { BlogReferenceList } from "./BlogReferenceList.jsx";

const SAVE_LABELS = {
  [BLOG_SAVE_INTENT.PRIVATE_ONLY]: "Privat speichern",
  [BLOG_SAVE_INTENT.PUBLISH]: "Speichern & veröffentlichen",
  [BLOG_SAVE_INTENT.UPDATE]: "Speichern & aktualisieren",
};

export function BlogEditor({ editor, capability, actions, intent, onSave, onBack }) {
  const [newReference, setNewReference] = useState("");
  const references = Array.isArray(editor.references) ? editor.references : [];
  const saving = editor.saveStatus === "saving" || editor.saveStatus?.status === "saving";
  const publishReady = capability?.status === "ready";
  const addReference = () => {
    const title = newReference.trim();
    if (!title || references.length >= BLOG_MAX_REFERENCES) return;
    actions.onAddReference({ draftKey: editor.draftKey, reference: { title, year: null, mediaType: "film" } });
    setNewReference("");
  };
  return <section className="kd-blog-editor" aria-labelledby="kd-blog-editor-heading">
    <div className="kd-blog-list-head"><h2 id="kd-blog-editor-heading">{editor.articleId ? "Artikel bearbeiten" : "Neuer Artikel"}</h2>
      <span className="kd-blog-state">{editor.displayState === "published" ? "Veröffentlicht" : editor.displayState === "private_changes" ? "Änderungen privat" : "Privat"}</span></div>
    <label className="kd-blog-field">Titel<input type="text" value={editor.title || ""} autoComplete="off" onChange={(event) => actions.onEditorChange({ title: event.target.value })} /></label>
    <label className="kd-blog-field">Text<textarea rows={9} value={editor.text || ""} onChange={(event) => actions.onEditorChange({ text: event.target.value })} /></label>
    <section className="kd-blog-references" aria-labelledby="kd-blog-reference-heading">
      <h3 id="kd-blog-reference-heading">Titelliste & Verknüpfungen</h3>
      <label className="kd-blog-check"><input type="checkbox" checked={editor.ordered === true} onChange={(event) => actions.onEditorChange({ ordered: event.target.checked })} /><span>Als nummerierte Liste anzeigen</span></label>
      <BlogReferenceList references={references.map((reference) => ({ ...reference, articleId: editor.articleId }))} ordered={editor.ordered === true} editable actions={actions} draftKey={editor.draftKey} />
      <label className="kd-blog-field" htmlFor="kd-blog-add-reference">Titel hinzufügen</label>
      <div className="kd-blog-add-reference"><input id="kd-blog-add-reference" value={newReference} placeholder="Filmtitel" onChange={(event) => setNewReference(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addReference(); } }} />
        <button type="button" className="kd-blog-button" disabled={!newReference.trim() || references.length >= BLOG_MAX_REFERENCES} onClick={addReference}>Hinzufügen</button></div>
      <p className="kd-blog-muted">{references.length}/{BLOG_MAX_REFERENCES} Titel</p>
    </section>
    <footer className="kd-blog-finish">
      <label className={`kd-blog-check kd-blog-publish-check${!publishReady ? " is-disabled" : ""}`}><input type="checkbox" checked={editor.anonymousPublication === true} disabled={!publishReady}
        onChange={(event) => actions.onEditorChange({ anonymousPublication: event.target.checked })} />
        <span><strong>Anonym veröffentlichen</strong><small>{publishReady ? "Für angemeldete Nutzer sichtbar. Dein Kontoname wird nicht angezeigt."
          : capability?.status === "checking" ? "Veröffentlichung wird geprüft. Privat speichern ist bereits möglich." : "Veröffentlichung ist derzeit nicht verfügbar. Privat speichern bleibt möglich."}</small></span></label>
      <div className="kd-blog-footer-actions"><button type="button" className="kd-blog-button kd-blog-button-quiet" disabled={saving} onClick={onBack}>← Zurück</button>
        <button type="button" className="kd-blog-button kd-blog-button-primary" disabled={saving || !String(editor.title || "").trim() || !String(editor.text || "").trim() || (editor.anonymousPublication && !publishReady)} onClick={() => void onSave()}>
          {saving ? "Speichert …" : SAVE_LABELS[intent]}</button></div>
    </footer>
  </section>;
}

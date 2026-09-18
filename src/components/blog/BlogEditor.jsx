import { useState } from "react";
import { BLOG_MAX_REFERENCES, BLOG_SAVE_INTENT } from "../../lib/blogContract.js";
import { lesePlausiblesJahr, plausiblerJahresbereich } from "../../lib/match.js";
import { BlogReferenceList } from "./BlogReferenceList.jsx";
import { BlogReferenceSuggestions } from "./BlogReferenceSuggestions.jsx";

const SAVE_LABELS = {
  [BLOG_SAVE_INTENT.PRIVATE_ONLY]: "Privat speichern",
  [BLOG_SAVE_INTENT.PUBLISH]: "Speichern & veröffentlichen",
  [BLOG_SAVE_INTENT.UPDATE]: "Speichern & aktualisieren",
};

export function BlogEditor({ editor, capability, actions, intent, hasPublication, referenceExtraction, onSave, onBack }) {
  const [newReference, setNewReference] = useState("");
  const [newReferenceYear, setNewReferenceYear] = useState("");
  const [newReferenceType, setNewReferenceType] = useState("film");
  const [referenceError, setReferenceError] = useState("");
  const [limitNotice, setLimitNotice] = useState("");
  const references = Array.isArray(editor.references) ? editor.references : [];
  const saving = editor.saveStatus === "saving" || editor.saveStatus?.status === "saving";
  const publishReady = capability?.status === "ready";
  const addReference = () => {
    const title = newReference.trim();
    if (!title) return;
    if (references.length >= BLOG_MAX_REFERENCES) {
      setLimitNotice(`Mehr als ${BLOG_MAX_REFERENCES} Referenzen können nicht gespeichert werden.`);
      return;
    }
    const parsedYear = lesePlausiblesJahr(newReferenceYear, { typ: newReferenceType });
    if (!parsedYear.ok) {
      const { min, max } = plausiblerJahresbereich(newReferenceType);
      setReferenceError(`Jahr muss leer oder eine ganze Zahl zwischen ${min} und ${max} sein.`);
      return;
    }
    actions.onAddReference({ draftKey: editor.draftKey, reference: { title, year: parsedYear.jahr, mediaType: newReferenceType } });
    setNewReference(""); setNewReferenceYear(""); setNewReferenceType("film"); setReferenceError("");
    setLimitNotice(references.length + 1 === BLOG_MAX_REFERENCES
      ? `Die ${BLOG_MAX_REFERENCES}. Referenz wird mit diesem Artikel gespeichert.` : "");
  };
  const save = () => {
    if (references.length === BLOG_MAX_REFERENCES) {
      setLimitNotice(`Alle ${BLOG_MAX_REFERENCES} Referenzen werden mit diesem Artikel gespeichert.`);
    }
    void onSave();
  };
  return <section className="kd-blog-editor" aria-labelledby="kd-blog-editor-heading">
    <div className="kd-blog-list-head"><h2 id="kd-blog-editor-heading">{editor.articleId ? "Artikel bearbeiten" : "Neuer Artikel"}</h2>
      <span className="kd-blog-state">{editor.displayState === "published" ? "Veröffentlicht" : editor.displayState === "private_changes" ? "Änderungen privat" : "Privat"}</span></div>
    <label className="kd-blog-field">Titel<input type="text" value={editor.title || ""} autoComplete="off" onChange={(event) => actions.onEditorChange({ title: event.target.value })} /></label>
    <label className="kd-blog-field">Text<textarea rows={9} value={editor.text || ""} onChange={(event) => actions.onEditorChange({ text: event.target.value })} /></label>
    <section className="kd-blog-references" aria-labelledby="kd-blog-reference-heading">
      <h3 id="kd-blog-reference-heading">Titelliste & Verknüpfungen</h3>
      <label className="kd-blog-check kd-touch-checkbox"><input type="checkbox" checked={editor.ordered === true} onChange={(event) => actions.onEditorChange({ ordered: event.target.checked })} /><span>Als nummerierte Liste anzeigen</span></label>
      <BlogReferenceList references={references.map((reference) => ({ ...reference, articleId: editor.articleId }))} ordered={editor.ordered === true} editable actions={actions} draftKey={editor.draftKey} />
      <label className="kd-blog-field" htmlFor="kd-blog-add-reference">Titel hinzufügen</label>
      <div className="kd-blog-add-reference"><input id="kd-blog-add-reference" className="kd-blog-add-reference-title" value={newReference} placeholder="Titel" onChange={(event) => { setNewReference(event.target.value); setReferenceError(""); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addReference(); } }} />
        <input value={newReferenceYear} placeholder="Jahr" inputMode="numeric" aria-label="Jahr (optional)"
          aria-invalid={referenceError ? true : undefined} onChange={(event) => { setNewReferenceYear(event.target.value); setReferenceError(""); }} />
        <select value={newReferenceType} aria-label="Typ" onChange={(event) => { setNewReferenceType(event.target.value); setReferenceError(""); }}>
          <option value="film">Film</option><option value="serie">Serie</option><option value="musik">Musik</option><option value="sonstiges">Sonstiges</option>
        </select>
        <button type="button" className="kd-blog-button" disabled={!newReference.trim()} onClick={addReference}>Hinzufügen</button></div>
      {referenceError ? <p className="kd-blog-error" role="alert">{referenceError}</p> : null}
      {limitNotice ? <p className="kd-blog-muted" role="status">{limitNotice}</p> : null}
    </section>
    <footer className="kd-blog-finish">
      <BlogReferenceSuggestions extraction={referenceExtraction} referenceCount={references.length} />
      <label className={`kd-blog-check kd-blog-publish-check kd-touch-checkbox${!publishReady ? " is-disabled" : ""}`}><input type="checkbox" checked={editor.anonymousPublication === true} disabled={!publishReady}
        onChange={(event) => actions.onEditorChange({ anonymousPublication: event.target.checked })} />
        <span><strong>Anonym veröffentlichen</strong><small>{publishReady ? "Für angemeldete Nutzer sichtbar. Dein Kontoname wird nicht angezeigt."
          : capability?.status === "checking" ? "Veröffentlichung wird geprüft. Privat speichern ist bereits möglich." : "Veröffentlichung ist derzeit nicht verfügbar. Privat speichern bleibt möglich."}</small></span></label>
      {hasPublication && !editor.anonymousPublication ? <p className="kd-blog-private-publication-note">Die veröffentlichte Fassung bleibt unverändert.</p> : null}
      <div className="kd-blog-footer-actions"><button type="button" className="kd-blog-button kd-blog-button-quiet" disabled={saving} onClick={onBack}>← Zurück</button>
        <button type="button" className="kd-blog-button kd-blog-button-primary" disabled={saving || !String(editor.title || "").trim() || !String(editor.text || "").trim() || (editor.anonymousPublication && !publishReady)} onClick={save}>
          {saving ? "Speichert …" : hasPublication && intent === BLOG_SAVE_INTENT.PRIVATE_ONLY ? "Änderungen privat speichern" : SAVE_LABELS[intent]}</button></div>
    </footer>
  </section>;
}

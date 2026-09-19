import { useState } from "react";
import { BLOG_MAX_REFERENCES, BLOG_SAVE_INTENT } from "../../lib/blogContract.js";
import { lesePlausiblesJahr, plausiblerJahresbereich } from "../../lib/match.js";
import { BlogReferenceList } from "./BlogReferenceList.jsx";
import { BlogReferenceSuggestions } from "./BlogReferenceSuggestions.jsx";

export function BlogEditor({ editor, capability, actions, intent, hasPublication, referenceExtraction, onPrivateSave, onPublish, onBack }) {
  const [newReference, setNewReference] = useState("");
  const [newReferenceYear, setNewReferenceYear] = useState("");
  const [newReferenceType, setNewReferenceType] = useState("film");
  const [referenceError, setReferenceError] = useState("");
  const [limitNotice, setLimitNotice] = useState("");
  const [actionNotice, setActionNotice] = useState(null);
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
  const run = async (action) => {
    if (references.length === BLOG_MAX_REFERENCES) {
      setLimitNotice(`Alle ${BLOG_MAX_REFERENCES} Referenzen werden mit diesem Artikel gespeichert.`);
    }
    setActionNotice(null);
    let result;
    try {
      result = await action();
    } catch {
      setActionNotice({ kind: "error", text: "Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten." });
      return null;
    }
    if (result?.private?.status === "failed") {
      setActionNotice({ kind: "error", text: "Privates Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten." });
    } else if (result?.private?.status === "saved" && result?.publication?.status === "not_requested") {
      setActionNotice({ kind: "success", text: "Privat gespeichert." });
    } else if (result?.private?.status === "saved" && ["published", "updated"].includes(result?.publication?.status)) {
      setActionNotice({ kind: "success", text: result.publication.status === "published" ? "Privat gespeichert und veröffentlicht." : "Privat gespeichert und Veröffentlichung aktualisiert." });
    } else if (result?.private?.status === "saved") {
      setActionNotice({ kind: result?.publication?.status === "failed" ? "error" : "warning", text: result?.publication?.status === "failed"
        ? "Privat gespeichert, Veröffentlichung fehlgeschlagen." : "Privat gespeichert. Die Veröffentlichung braucht noch deine Aufmerksamkeit." });
    }
    return result;
  };
  const profileAuthor = capability?.value?.profileAuthor || null;
  const publishAsAnonymous = editor.anonymousPublication === true;
  const publishLabel = publishAsAnonymous
    ? (hasPublication ? "Anonym aktualisieren" : "Anonym veröffentlichen")
    : profileAuthor
      ? `Als ${profileAuthor} ${intent === BLOG_SAVE_INTENT.UPDATE ? "aktualisieren" : "veröffentlichen"}`
      : "Autorenname fehlt";
  return <section className="kd-blog-editor" aria-labelledby="kd-blog-editor-heading">
    <div className="kd-blog-list-head"><h2 id="kd-blog-editor-heading">{editor.articleId ? "Artikel bearbeiten" : "Neuer Artikel"}</h2>
      <span className="kd-blog-state">{editor.displayState === "published" ? "Veröffentlicht" : editor.displayState === "private_changes" ? "Änderungen privat" : "Privat"}</span></div>
    <label className="kd-blog-field">Titel<input type="text" value={editor.title || ""} autoComplete="off" onChange={(event) => actions.onEditorChange({ title: event.target.value })} /></label>
    <label className="kd-blog-field">Text<textarea rows={9} value={editor.text || ""} onChange={(event) => actions.onEditorChange({ text: event.target.value })} /></label>
    <section className="kd-blog-references" aria-labelledby="kd-blog-reference-heading">
      <h3 id="kd-blog-reference-heading">Titelliste & Verknüpfungen</h3>
      <label className="kd-blog-check kd-blog-display-check kd-touch-checkbox"><input type="checkbox" checked={editor.ordered === true} onChange={(event) => actions.onEditorChange({ ordered: event.target.checked })} /><span>Als nummerierte Liste anzeigen</span></label>
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
        <span><strong>Anonym veröffentlichen</strong></span></label>
      {!publishAsAnonymous && !profileAuthor ? <p className="kd-blog-private-publication-note">Für eine namentliche Veröffentlichung fehlt ein Profilname. Privat speichern oder anonym veröffentlichen ist weiterhin möglich.</p> : null}
      {actionNotice ? <p className={`kd-blog-local-notice kd-blog-notice-${actionNotice.kind}`} role={actionNotice.kind === "error" ? "alert" : "status"}>{actionNotice.text}</p> : null}
      <div className="kd-blog-footer-actions"><button type="button" className="kd-blog-button kd-blog-button-quiet" disabled={saving} onClick={onBack}>← Zurück</button>
        <div className="kd-blog-save-actions">
          <button type="button" className="kd-blog-button" disabled={saving || !String(editor.title || "").trim() || !String(editor.text || "").trim()} onClick={() => void run(onPrivateSave)}>
            {saving ? "Speichert …" : "Privat speichern"}</button>
          <button type="button" className="kd-blog-button kd-blog-button-primary" disabled={saving || !publishReady || (!publishAsAnonymous && !profileAuthor) || !String(editor.title || "").trim() || !String(editor.text || "").trim()} onClick={() => void run(onPublish)}>
            {saving ? "Speichert …" : publishLabel}</button>
        </div></div>
    </footer>
  </section>;
}

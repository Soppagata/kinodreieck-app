import { useEffect, useMemo, useState } from "react";
import {
  blogReferenceInterpretationLabel,
  blogReferenceKindLabel,
  buildBlogReferenceApplications,
} from "../../lib/blogReferenceExtraction.js";
import { BLOG_MAX_REFERENCES } from "../../lib/blogContract.js";

const EMPTY_SUGGESTIONS = Object.freeze([]);

function initialSelections(suggestions) {
  return Object.fromEntries((suggestions || []).map((suggestion) => [suggestion.candidateId, {
    candidateId: suggestion.candidateId,
    selected: false,
    workIdentities: [],
    manual: false,
    manualTitle: suggestion.titleSuggestion,
    manualYear: suggestion.year == null ? "" : String(suggestion.year),
    manualType: suggestion.mediaType || "sonstiges",
  }]));
}

function startMessage(reason) {
  return ({
    "reference-limit": `Bei ${BLOG_MAX_REFERENCES} Referenzen ist kein KI-Start möglich.`,
    "text-too-long": "Der Blogtext ist länger als 18.000 Bytes und wird nicht gekürzt.",
    "title-too-long": "Die Überschrift ist für die KI-Erkennung zu lang.",
    "empty-title": "Schreibe zuerst eine Überschrift.",
    "empty-text": "Schreibe zuerst einen Blogtext.",
  })[reason] || null;
}

function WorkOption({ suggestion, option, checked, onChange }) {
  const details = [option.mediaType === "serie" ? "Serie"
    : option.mediaType === "musik" ? "Musik"
      : option.mediaType === "sonstiges" ? "Sonstiges" : "Film"];
  if (option.year !== null) details.push(String(option.year));
  if (option.creator) details.push(option.creator);
  return <label className="kd-blog-suggestion-work kd-touch-checkbox">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(option.identity, event.target.checked)} />
    <span><strong>{option.title}</strong><small>{details.join(" · ")} · im geladenen Bestand belegt</small></span>
  </label>;
}

export function BlogReferenceSuggestions({ extraction, referenceCount = 0 }) {
  const suggestions = extraction?.suggestions || EMPTY_SUGGESTIONS;
  const requestKey = extraction?.binding?.requestId || "none";
  const [selections, setSelections] = useState(() => initialSelections(suggestions));
  const [selectionMessage, setSelectionMessage] = useState("");
  useEffect(() => {
    setSelections(initialSelections(suggestions));
    setSelectionMessage("");
  }, [requestKey, suggestions]);

  const selectedRows = useMemo(() => Object.values(selections), [selections]);
  const applications = useMemo(() => buildBlogReferenceApplications(suggestions, selectedRows), [selectedRows, suggestions]);
  const remaining = Math.max(0, BLOG_MAX_REFERENCES - referenceCount);
  const busy = ["running", "applying"].includes(extraction?.status);
  const selectionTooLarge = applications.ok && applications.candidates.length > remaining;

  if (!extraction?.visible) return null;

  const update = (candidateId, patch) => {
    setSelections((current) => ({
      ...current,
      [candidateId]: { ...current[candidateId], ...patch },
    }));
    setSelectionMessage("");
  };
  const toggleWork = (candidateId, identity, checked) => {
    const current = selections[candidateId];
    const workIdentities = new Set(current?.workIdentities || []);
    if (checked) workIdentities.add(identity); else workIdentities.delete(identity);
    update(candidateId, { workIdentities: [...workIdentities] });
  };
  const apply = async () => {
    if (!applications.ok) {
      setSelectionMessage(applications.reason === "work-decision-required"
        ? "Wähle für jede markierte Erwähnung mindestens ein konkretes Werk oder bestätige die unverknüpfte Übernahme."
        : "Die Auswahl ist noch nicht vollständig.");
      return;
    }
    if (applications.candidates.length > remaining) {
      setSelectionMessage(`Für alle ${applications.candidates.length} ausgewählten Werke fehlen Plätze. Es wurde nichts übernommen.`);
      return;
    }
    const result = await extraction.apply(applications.candidates);
    if (result?.status === "applied") {
      setSelections(initialSelections(suggestions));
      return;
    }
    if (result?.status !== "applied") {
      setSelectionMessage(result?.errorCode === "selection-too-large"
        ? "Für die gesamte Auswahl ist nicht genug Platz. Es wurde nichts übernommen."
        : "Die Auswahl konnte nicht sicher übernommen werden. Der Entwurf blieb erhalten.");
    }
  };

  return <section className="kd-blog-ai-references" aria-labelledby="kd-blog-ai-reference-heading">
    <div className="kd-blog-ai-reference-head">
      <div><h3 id="kd-blog-ai-reference-heading">Titel im Text erkennen</h3>
        <p>Sendet die Überschrift und diesen Blogtext an Anthropic. Persönliche Angaben im Text werden mitgesendet. Du entscheidest, welche Vorschläge übernommen werden.</p></div>
      {extraction.status === "running"
        ? <button type="button" className="kd-blog-button kd-blog-button-quiet" onClick={extraction.cancel}>Abbrechen</button>
        : <button type="button" className="kd-blog-button" disabled={!extraction.canStart || busy} onClick={() => void extraction.start()}>Titel im Text erkennen (KI)</button>}
    </div>
    {startMessage(extraction.startReason) ? <p className="kd-blog-muted">{startMessage(extraction.startReason)}</p> : null}
    {extraction.status === "running" ? <p role="status" className="kd-blog-muted">Der Text wird geprüft … Du kannst weiter schreiben oder speichern.</p> : null}
    {extraction.partial ? <p role="status" className="kd-blog-notice kd-blog-notice-warning">Die Antwort war teilweise ungültig. Angezeigt werden nur vollständig belegte Vorschläge.</p> : null}
    {extraction.message ? <p role={extraction.errorCode ? "alert" : "status"} className={extraction.errorCode ? "kd-blog-error" : "kd-blog-muted"}>{extraction.message}</p> : null}
    {suggestions.length ? <div className="kd-blog-suggestions" aria-label="Gefundene Erwähnungen">
      {suggestions.map((suggestion) => {
        const selection = selections[suggestion.candidateId] || {};
        const evidenceSource = suggestion.evidence.field === "title" ? "Überschrift" : "Blogtext";
        return <article key={suggestion.candidateId} className="kd-blog-suggestion">
          <label className="kd-blog-check kd-touch-checkbox kd-blog-suggestion-mention">
            <input type="checkbox" checked={selection.selected === true}
              onChange={(event) => update(suggestion.candidateId, { selected: event.target.checked })} />
            <span><strong>{suggestion.titleSuggestion}</strong><small>{blogReferenceKindLabel(suggestion.kind)} · {blogReferenceInterpretationLabel(suggestion.interpretation)}</small></span>
          </label>
          <p className="kd-blog-suggestion-evidence"><span>{evidenceSource}:</span> <q>{suggestion.evidence.quote}</q></p>
          {selection.selected ? <fieldset className="kd-blog-suggestion-decisions">
            <legend>Konkrete Werke auswählen</legend>
            {suggestion.workOptions.length ? suggestion.workOptions.map((option) => <WorkOption
              key={option.identity} suggestion={suggestion} option={option}
              checked={(selection.workIdentities || []).includes(option.identity)}
              onChange={(identity, checked) => toggleWork(suggestion.candidateId, identity, checked)} />)
              : <p className="kd-blog-muted">Im bereits geladenen Bestand wurde kein eindeutiges Werk gefunden.</p>}
            <label className="kd-blog-suggestion-work kd-touch-checkbox">
              <input type="checkbox" checked={selection.manual === true}
                onChange={(event) => update(suggestion.candidateId, { manual: event.target.checked })} />
              <span><strong>Manuell und unverknüpft übernehmen</strong><small>Bleibt transparent ein Rotlink, bis du ihn später ergänzt.</small></span>
            </label>
            {selection.manual ? <div className="kd-blog-suggestion-manual">
              <label>Titel<input value={selection.manualTitle || ""} onChange={(event) => update(suggestion.candidateId, { manualTitle: event.target.value })} /></label>
              <label>Jahr (optional)<input inputMode="numeric" value={selection.manualYear || ""} onChange={(event) => update(suggestion.candidateId, { manualYear: event.target.value })} /></label>
              <label>Typ<select value={selection.manualType || "sonstiges"} onChange={(event) => update(suggestion.candidateId, { manualType: event.target.value })}>
                <option value="film">Film</option><option value="serie">Serie</option><option value="musik">Musik</option><option value="sonstiges">Sonstiges</option>
              </select></label>
            </div> : null}
          </fieldset> : null}
        </article>;
      })}
      <div className="kd-blog-suggestion-apply">
        <p className="kd-blog-muted">Kein Vorschlag ist vorausgewählt.</p>
        <button type="button" className="kd-blog-button kd-blog-button-primary" disabled={busy || !applications.ok || selectionTooLarge}
          onClick={() => void apply()}>{extraction.status === "applying" ? "Übernimmt …" : "Ausgewählte übernehmen"}</button>
      </div>
      {selectionTooLarge ? <p className="kd-blog-error" role="alert">Für die gesamte Auswahl ist nicht genug Platz. Es wurde nichts übernommen.</p> : null}
      {selectionMessage ? <p className="kd-blog-error" role="alert">{selectionMessage}</p> : null}
    </div> : null}
  </section>;
}

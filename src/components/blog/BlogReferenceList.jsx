function targetLabel(target) {
  if (target?.kind === "library") return "Mediathek";
  if (target?.kind === "streaming") return target.sourceLabel || ({
    netflix: "Netflix", prime: "Prime Video", disney: "Disney+", apple: "Apple TV+",
    hbo: "HBO Max", paramount: "Paramount+", mubi: "MUBI",
    crunchyroll: "Crunchyroll", rtl: "RTL+",
  })[target.sourceId] || "Streaming";
  if (target?.kind === "cinema") return "Kino";
  return "Öffnen";
}

function ReferenceDecision({ reference, actions }) {
  const candidates = reference.decisionCandidates || reference.candidates || [];
  if (reference.decisionRequired !== true && !candidates.length) return null;
  return <div className="kd-blog-reference-decision">{candidates.length ? <select aria-label={`Zuordnung für ${reference.title}`} defaultValue=""
    onChange={(event) => { if (event.target.value) void actions.onReferenceDecision({ articleId: reference.articleId, rowId: reference.rowId, decision: { kind: "confirm_work", workKey: event.target.value } }); }}>
    <option value="" disabled>Treffer wählen …</option>
    {candidates.map((candidate) => <option key={candidate.workKey} value={candidate.workKey}>{candidate.title}{candidate.year ? ` (${candidate.year})` : ""}</option>)}</select>
    : <span className="kd-blog-reference-source">Kein gemeinsamer Treffer verfügbar.</span>}
    <button type="button" className="kd-blog-inline-action" onClick={() => void actions.onReferenceDecision({ articleId: reference.articleId, rowId: reference.rowId, decision: { kind: "keep_redlink" } })}>Als Rotlink behalten</button>
  </div>;
}

export function BlogReferenceList({ references = [], ordered = false, editable = false, redlinksEnabled = editable, previewLimit = null, actions, draftKey }) {
  const sorted = [...references].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const visible = previewLimit == null ? sorted : sorted.slice(0, previewLimit);
  return <div className="kd-blog-reference-list">
    {visible.map((reference, index) => {
      const unavailable = reference.state === "redlink" || reference.resolutionIntent?.kind === "keep_redlink";
      const target = reference.primaryTarget || null;
      const targets = [target, ...(reference.secondaryTargets || [])].filter(Boolean);
      const active = (unavailable && redlinksEnabled) || !!target;
      const Tag = active ? "button" : "span";
      return <div className={`kd-blog-reference-row${editable ? " is-editable" : ""}`} key={reference.rowId || reference.referenceId}>
        <span className="kd-blog-reference-rank">{ordered ? `${reference.rank || index + 1}.` : "·"}</span>
        <div className="kd-blog-reference-body"><Tag type={active ? "button" : undefined}
          className={`kd-blog-reference-link${unavailable ? " is-redlink" : ""}${!active ? " is-static" : ""}`}
          onClick={active ? () => unavailable && redlinksEnabled
            ? actions.onOpenRedlinkForm({ articleId: reference.articleId, rowId: reference.rowId })
            : actions.onNavigateReference({ referenceId: reference.referenceId || reference.rowId, target }) : undefined}>
          <span className="kd-blog-reference-title">{reference.title}{reference.year ? ` (${reference.year})` : ""}</span></Tag>
          {targets.length ? <span className="kd-blog-reference-sources">{targets.map((sourceTarget, targetIndex) => <span key={`${sourceTarget.kind}-${sourceTarget.ref}-${targetIndex}`}>
            <button type="button" className="kd-blog-target-link"
              aria-label={`${reference.title}: ${targetLabel(sourceTarget)} öffnen`}
              onClick={() => actions.onNavigateReference({ referenceId: reference.referenceId || reference.rowId, target: sourceTarget })}>{targetLabel(sourceTarget)}</button>
          </span>)}</span> : <span className="kd-blog-reference-source">{unavailable ? "Rotlink" : reference.state === "unchecked" ? "Verfügbarkeit ungeprüft" : "Zuordnung prüfen"}</span>}
          {editable ? <ReferenceDecision reference={reference} actions={actions} /> : null}</div>
        {editable ? <details className="kd-blog-reference-menu"><summary aria-label={`Aktionen für ${reference.title}`}>⋯</summary>
          <div className="kd-blog-menu-panel"><button type="button" disabled={index === 0} onClick={() => actions.onMoveReference({ draftKey, rowId: reference.rowId, direction: "up" })}>Nach oben</button>
            <button type="button" disabled={index === sorted.length - 1} onClick={() => actions.onMoveReference({ draftKey, rowId: reference.rowId, direction: "down" })}>Nach unten</button>
            <button type="button" className="kd-blog-danger" onClick={() => actions.onRemoveReference({ draftKey, rowId: reference.rowId })}>Entfernen</button></div>
        </details> : null}
      </div>;
    })}
    {previewLimit != null && sorted.length > previewLimit ? <p className="kd-blog-reference-more">+ {sorted.length - previewLimit} weitere Titel</p> : null}
  </div>;
}

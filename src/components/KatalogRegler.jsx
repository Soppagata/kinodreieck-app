import {
  STREAMING_ALPHABET,
  streamingJahrzehntBereich,
  streamingJahrzehntLabel,
} from "../lib/streamingSort.js";

export function AlphabetRegler({ wert, onChange, name }) {
  const index = wert ? STREAMING_ALPHABET.indexOf(wert) + 1 : 0;
  return (
    <div className="kd-streamfilter-abc" data-aktiv={wert ? "1" : "0"}>
      <div className="kd-streamfilter-abc-kopf">
        <span>Anfangsbuchstabe</span>
        <strong aria-live="polite">{wert || "Alle"}</strong>
      </div>
      <input type="range" min="0" max={STREAMING_ALPHABET.length} step="1" value={index}
        onChange={(event) => {
          const naechsterIndex = Number(event.target.value);
          onChange(naechsterIndex === 0 ? null : STREAMING_ALPHABET[naechsterIndex - 1]);
        }}
        aria-label={`${name}: Anfangsbuchstaben filtern`}
        aria-valuetext={wert ? `Buchstabe ${wert}` : "Alle Anfangsbuchstaben"} />
      <div className="kd-streamfilter-abc-skala" aria-hidden="true">
        <span className={!wert ? "aktiv alle" : "alle"}>•</span>
        {STREAMING_ALPHABET.map((buchstabe) => (
          <span key={buchstabe} className={wert === buchstabe ? "aktiv" : ""}>{buchstabe}</span>
        ))}
      </div>
    </div>
  );
}

export function JahrzehntRegler({ wert, optionen, onChange, name }) {
  if (!optionen.length) return null;
  const index = wert == null ? 0 : Math.max(0, optionen.indexOf(wert) + 1);
  const bereich = streamingJahrzehntBereich(wert);
  return (
    <div className="kd-streamfilter-abc kd-streamfilter-dekade" data-aktiv={bereich ? "1" : "0"}>
      <div className="kd-streamfilter-abc-kopf">
        <span>Jahrzehntbereich</span>
        <strong aria-live="polite">{bereich ? streamingJahrzehntLabel(wert) : "Alle"}</strong>
      </div>
      <input type="range" min="0" max={optionen.length} step="1" value={index}
        onChange={(event) => {
          const naechsterIndex = Number(event.target.value);
          onChange(naechsterIndex === 0 ? null : optionen[naechsterIndex - 1]);
        }}
        aria-label={`${name}: Jahrzehnt filtern`}
        aria-valuetext={bereich ? `${Number(wert)}er: ${bereich.von} bis ${bereich.bis}` : "Alle Jahrzehnte"} />
      <div className="kd-streamfilter-dekade-skala" aria-hidden="true" data-dicht={optionen.length > 10 ? "1" : "0"}
        style={{ gridTemplateColumns: `repeat(${optionen.length + 1}, minmax(0, 1fr))` }}>
        <span className={wert == null ? "aktiv alle" : "alle"}>•</span>
        {optionen.map((jahrzehnt) => (
          <span key={jahrzehnt} className={wert === jahrzehnt ? "aktiv" : ""}
            title={streamingJahrzehntLabel(jahrzehnt)}>{String(jahrzehnt).slice(-2)}er</span>
        ))}
      </div>
    </div>
  );
}

export function KatalogRegler({ name, buchstabe, onBuchstabe, jahrzehnt, jahrzehnte, onJahrzehnt, className = "" }) {
  return (
    <div className={`kd-streamfilter-regler ${className}`.trim()}>
      <AlphabetRegler name={name} wert={buchstabe} onChange={onBuchstabe} />
      <JahrzehntRegler name={name} wert={jahrzehnt} optionen={jahrzehnte} onChange={onJahrzehnt} />
    </div>
  );
}

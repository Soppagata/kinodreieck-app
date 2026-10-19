import { radarClaimDateLabel,radarClaimDatePrecision } from '../lib/radarStableIdentity.js';
import { formatPresentationDate } from '../lib/presentationDate.js';

const labels={kinostart_at:'Kinostart',streamingstart_at:'Streamingstart',serienstart:'Serienstart',staffelstart:'Staffelstart'};
const markets={AT:'Österreich',global:'Weltweit',unspecified:'Markt nicht belegt'};
const licenses={subscription:'Abo',rent:'Leihe',buy:'Kauf',free:'Kostenlos'};
const formatted=(date)=>formatPresentationDate(date,{fallback:date});

function dateLabel(date, history) {
  const matching=history.filter(h=>h.date===date);
  if(matching.some(h=>radarClaimDatePrecision(h.date,h.sourceClaim)==='day')) return formatted(date);
  const h=matching.find(h=>radarClaimDatePrecision(h.date,h.sourceClaim)==='month') || matching.find(h=>radarClaimDatePrecision(h.date,h.sourceClaim)==='year') || matching[0];
  return radarClaimDateLabel(date,h?.sourceClaim);
}
export function RadarStableStarts({starts=[]}) {
  return <ul className="kd-radar-starts" aria-label="Getrennte Starttermine">{starts.map(start=><li key={start.startId} className="kd-radar-start">
    <strong>{start.episodeNumber ? `Staffel ${start.seasonNumber} · Folge ${start.episodeNumber}`
      : `${labels[start.eventType] || 'Start'}${start.seasonNumber ? ` · Staffel ${start.seasonNumber}` : ''}`}</strong>
    <span>{start.platform && start.platform !== '-' ? `${start.platform} · ` : ''}{markets[start.region] || 'Markt nicht belegt'}{licenses[start.licenseKey] ? ` · ${licenses[start.licenseKey]}` : ''}</span>
    {start.editionKey !== 'original' ? <span>{start.editionKey === 'reissue:50th-anniversary' ? 'Wiederaufführung zum 50. Jubiläum' : 'Besondere Fassung oder Veröffentlichung'}</span> : null}
    <span className={start.dateConflict ? 'kd-radar-date-conflict' : undefined}>{start.dateConflict
      ? `Abweichende Quellenangaben: ${[...new Set(start.dates.map(d=>dateLabel(d,start.history)))].join(' / ')}`
      : dateLabel(start.dates[0],start.history)}</span>
    <details className="kd-radar-belege"><summary>{start.history.length} {start.history.length === 1 ? 'Quellenstand' : 'Quellenstände'} ansehen</summary>
      <ul>{start.history.map(observation=><li key={observation.observationId}>
        <span>{radarClaimDatePrecision(observation.date,observation.sourceClaim) === "day" ? formatted(observation.date) : radarClaimDateLabel(observation.date,observation.sourceClaim)} · {observation.title}</span>
        {radarClaimDatePrecision(observation.date,observation.sourceClaim) !== "day" ? <small>Ursprünglich gespeichert: {formatted(observation.date)} · Tag nicht belegt</small> : null}
        <p>Quelle nennt: {observation.sourceClaim}</p>
        <a href={observation.sourceUrl} target="_blank" rel="noopener noreferrer">{observation.sourceDomain}</a>
      </li>)}</ul>
    </details>
  </li>)}</ul>;
}

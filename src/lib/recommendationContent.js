/* Kleine, überprüfbare Brücke zwischen deutschen Geschmacksbegriffen und
   deutschen/englischen Beschreibungen. Nur explizit gepflegte Sachthemen
   zählen; freie Wortüberschneidungen werden bewusst nicht bewertet. */

const THEMEN = Object.freeze([
  ["horror", "Horror", ["horror", "horrorfilm", "horror movie"]],
  ["comedy", "Komödie", ["komodie", "komoedie", "comedy"]],
  ["crime", "Krimi", ["krimi", "crime", "crime drama", "crime thriller"]],
  ["thriller", "Thriller", ["thriller"]],
  ["documentary", "Dokumentarfilm", ["dokumentarfilm", "dokumentation", "documentary"]],
  ["western", "Western", ["western"]],
  ["fantasy", "Fantasy", ["fantasy"]],
  ["animation", "Animationsfilm", ["animationsfilm", "animated film", "animation"]],
  ["romance", "Liebesfilm", ["liebesfilm", "romance", "romantic drama", "romantic comedy"]],
  ["war-film", "Kriegsfilm", ["kriegsfilm", "war film", "wartime drama"]],
  ["science-fiction", "Science-Fiction", ["science fiction", "science-fiction", "sci fi", "sci-fi"]],
  ["space", "Weltraum und Raumfahrt", ["weltraum", "raumfahrt", "raumschiff", "raumschiffe", "astronaut", "astronauten", "astronauts", "deep space", "spacecraft", "spaceship", "spaceships", "space mission"]],
  ["artificial-intelligence", "Künstliche Intelligenz", ["kunstliche intelligenz", "kuenstliche intelligenz", "artificial intelligence", "machine intelligence"]],
  ["time-travel", "Zeitreisen", ["zeitreise", "zeitreisen", "time travel", "travels through time", "travel through time"]],
  ["dystopia", "Dystopie", ["dystopie", "dystopisch", "dystopian", "dystopia"]],
  ["heist", "Raubüberfall", ["raububerfall", "raubueberfall", "bankraub", "heist", "bank robbery"]],
  ["revenge", "Rache", ["rache", "vergeltung", "revenge", "vengeance"]],
  ["serial-killer", "Serienmörder", ["serienmorder", "serienmoerder", "serial killer"]],
  ["organized-crime", "Organisiertes Verbrechen", ["organisiertes verbrechen", "organized crime", "mafia", "mob family"]],
  ["haunted-house", "Spukhaus", ["spukhaus", "verfluchtes haus", "haunted house", "haunted mansion"]],
  ["courtroom", "Gerichtsverfahren", ["gerichtsprozess", "gerichtssaal", "courtroom", "murder trial"]],
  ["investigative-journalism", "Investigativer Journalismus", ["investigativer journalismus", "investigative journalism", "investigative reporter"]],
  ["cosmic-horror", "Kosmischer Horror", ["kosmischer horror", "cosmic horror", "eldritch horror"]],
  ["coming-of-age", "Erwachsenwerden", ["erwachsenwerden", "coming of age", "coming-of-age"]],
].map(([id, label, aliases]) => Object.freeze({ id, label, aliases: Object.freeze(aliases) })));

const INHALTS_SIGNALARTEN = new Set(["genre", "thema"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function normalize(value) {
  return text(value).toLocaleLowerCase("de-AT").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function description(item) {
  return [item?.description, item?.beschreibung].map(text).filter(Boolean).join(" ");
}
function containsPhrase(haystack, phrase) {
  const needle = normalize(phrase);
  return needle && (` ${haystack} `).includes(` ${needle} `);
}

export function inhaltsthemen(value) {
  const normalized = normalize(value);
  if (!normalized) return Object.freeze([]);
  return Object.freeze(THEMEN.filter((topic) => topic.aliases.some((alias) => containsPhrase(normalized, alias)))
    .map((topic) => topic.id));
}

export function bereiteInhaltsEvidenz({ positiveSignals = [], negativeSignals = [], positiveLibrary = [] } = {}) {
  const signalTopics = (signals) => signals.filter((signal) =>
    INHALTS_SIGNALARTEN.has(normalize(signal?.art ?? signal?.kind))).map((signal) => ({
    signal,
    topics: new Set(inhaltsthemen(signal?.wert ?? signal?.value)),
  })).filter((entry) => entry.topics.size > 0);
  return Object.freeze({
    positiveSignals: Object.freeze(signalTopics(positiveSignals)),
    negativeSignals: Object.freeze(signalTopics(negativeSignals)),
    positiveLibrary: Object.freeze(positiveLibrary.map((item) => ({
      item, topics: new Set(inhaltsthemen(description(item))),
    })).filter((entry) => entry.topics.size > 0)),
  });
}

export function analysiereInhaltsPassung(candidate, evidence) {
  const candidateTopics = new Set(inhaltsthemen(description(candidate)));
  const intersects = (entry) => [...entry.topics].some((topic) => candidateTopics.has(topic));
  const positiveSignalEntries = (evidence?.positiveSignals || []).filter(intersects);
  const negativeSignalEntries = (evidence?.negativeSignals || []).filter(intersects);
  const libraryEntries = (evidence?.positiveLibrary || []).filter(intersects);
  const firstTopic = (entries) => THEMEN.find((topic) => candidateTopics.has(topic.id)
    && entries.some((entry) => entry.topics.has(topic.id)));
  const profileTopic = firstTopic(positiveSignalEntries);
  const libraryTopic = firstTopic(libraryEntries);
  const profileReason = profileTopic ? `Inhalt: ${profileTopic.label} aus deinem bestätigten Profil` : null;
  const libraryReason = libraryTopic ? `Inhalt: ${libraryTopic.label} wie in positiv bewerteter Mediathek` : null;
  return Object.freeze({
    positiveSignals: Object.freeze(positiveSignalEntries.map((entry) => entry.signal)),
    negativeSignals: Object.freeze(negativeSignalEntries.map((entry) => entry.signal)),
    libraryMatches: libraryEntries.length,
    profileReason,
    libraryReason,
    reasons: Object.freeze([profileReason, libraryReason].filter(Boolean)),
  });
}

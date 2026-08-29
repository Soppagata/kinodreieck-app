/* Versionierter, providerfreier Staging-Pool fuer Entdecken.
   Prime Video, Disney+ und Apple TV+ sind manuell verifizierte, datierte
   oesterreichische FlixPatrol-Snapshots. OeFI und Netflix stammen aus den
   bereits belegten offiziellen AT-Chartpfaden. Zur Laufzeit entstehen keine
   Provider-, Such- oder KI-Requests. */

export const VERSIONED_DISCOVERY_FEED_FORMAT = 7;
export const VERSIONED_DISCOVERY_FEED_ID = "public:versioned-market-mix-at";
export const VERSIONED_DISCOVERY_SOURCE_ID = "snapshot:market-mix-at-2026-08-29";
export const VERSIONED_DISCOVERY_POOL_VERSION = "2026-08-29-at-v1";
export const VERSIONED_DISCOVERY_POOL_SIZE = 50;
export const VERSIONED_DISCOVERY_SOURCE_IDS = Object.freeze([
  "chart:oefi-weekend-at",
  "chart:netflix-weekly-at",
  "snapshot:prime-video-at",
  "snapshot:disney-plus-at",
  "snapshot:apple-tv-plus-at",
]);
export const VERSIONED_DISCOVERY_SOURCE_COUNTS = Object.freeze({
  "chart:oefi-weekend-at": 15,
  "chart:netflix-weekly-at": 10,
  "snapshot:prime-video-at": 10,
  "snapshot:disney-plus-at": 10,
  "snapshot:apple-tv-plus-at": 5,
});
export const VERSIONED_DISCOVERY_SEGMENT_COUNTS = Object.freeze({
  cinema: 15,
  netflixFilm: 5,
  netflixSeries: 5,
  primeFilm: 5,
  primeSeries: 5,
  disneyFilm: 5,
  disneySeries: 5,
  appleTotal: 5,
});

const FETCHED_AT = "2026-08-29T10:00:00.000Z";
const SOURCES = Object.freeze({
  oefi: Object.freeze({
    sourceId: "chart:oefi-weekend-at",
    sourceLabel: "Österreichisches Filminstitut",
    service: null,
    market: "cinema",
    metric: "weekend-chart-rank",
    measuredOn: "2026-08-23",
    url: "https://filminstitut.at/charts",
  }),
  netflix: Object.freeze({
    sourceId: "chart:netflix-weekly-at",
    sourceLabel: "Netflix Top 10 Österreich",
    service: "Netflix",
    market: "streaming",
    metric: "weekly-country-rank",
    measuredOn: "2026-08-23",
    urls: Object.freeze({
      film: "https://www.netflix.com/tudum/top10/austria/films",
      series: "https://www.netflix.com/tudum/top10/austria/tv",
    }),
  }),
  prime: Object.freeze({
    sourceId: "snapshot:prime-video-at",
    sourceLabel: "Prime Video · Aktuell beliebt (FlixPatrol)",
    service: "Prime Video",
    market: "streaming",
    metric: "daily-provider-rank",
    measuredOn: "2026-08-29",
    url: "https://flixpatrol.com/top10/amazon-prime/austria/",
  }),
  disney: Object.freeze({
    sourceId: "snapshot:disney-plus-at",
    sourceLabel: "Disney+ · Aktuell beliebt (FlixPatrol)",
    service: "Disney+",
    market: "streaming",
    metric: "daily-provider-rank",
    measuredOn: "2026-08-29",
    url: "https://flixpatrol.com/top10/disney/austria/",
  }),
  apple: Object.freeze({
    sourceId: "snapshot:apple-tv-plus-at",
    sourceLabel: "Apple TV+ · Aktuell beliebt (FlixPatrol)",
    service: "Apple TV+",
    market: "streaming",
    metric: "daily-provider-rank",
    measuredOn: "2026-08-27",
    url: "https://flixpatrol.com/top10/apple-tv/austria/",
  }),
});

const RAW_ITEMS = Object.freeze([
  ["oefi", "film", "Steckerlfischfiasko", 2026],
  ["oefi", "film", "Spider-Man: Brand New Day", 2026],
  ["oefi", "film", "Die Odyssee", 2026],
  ["oefi", "film", "Insidious: Out of the Further", 2026],
  ["oefi", "film", "Paw Patrol: Der Dino Film", 2026],
  ["oefi", "film", "Toy Story 5", 2026],
  ["oefi", "film", "The End of Oak Street", 2026],
  ["oefi", "film", "Vaiana (Live Action)", 2026],
  ["oefi", "film", "Minions & Monster", 2026],
  ["oefi", "film", "Marsupilami", 2026],
  ["oefi", "film", "Obsession - Du sollst mich lieben", 2026],
  ["oefi", "film", "The Invite", 2026],
  ["oefi", "film", "Exit 8", 2025],
  ["oefi", "film", "Teenage Sex and Death at Camp Miasma", 2026],
  ["oefi", "film", "Chéri, ich komme! - Die Erfindung der Lust", 2025],

  ["netflix", "film", "My Best Friend, His Girlfriend and Me", 2026],
  ["netflix", "film", "Facing El Chapo", 2026],
  ["netflix", "film", "Don't Say Good Luck", 2026],
  ["netflix", "film", "The Last House", 2026],
  ["netflix", "film", "To the Max", 2026],
  ["netflix", "series", "Blood Sacrifice", 2026],
  ["netflix", "series", "Outer Banks", 2020],
  ["netflix", "series", "My Life With the Walter Boys", 2023],
  ["netflix", "series", "My Brilliant Career", 2026],
  ["netflix", "series", "Conversations with a Killer: The Charles Manson Tapes", 2026],

  ["prime", "film", "The Last Sunrise", 2026],
  ["prime", "film", "Murder at the Embassy", 2025],
  ["prime", "film", "Summer Camp", 2024],
  ["prime", "film", "The Retirement Plan", 2023],
  ["prime", "film", "Back to the 90s", 2026],
  ["prime", "series", "Reacher", 2022],
  ["prime", "series", "Sterling Point", 2026],
  ["prime", "series", "Dan Brown's The Lost Symbol", 2021],
  ["prime", "series", "Off Campus", 2026],
  ["prime", "series", "LOL: Last One Laughing", 2018],

  ["disney", "film", "Yellow Mirror", 2026],
  ["disney", "film", "The Devil Wears Prada 2", 2026],
  ["disney", "film", "Camp Rock 3", 2026],
  ["disney", "film", "Avengers: Infinity War", 2018],
  ["disney", "film", "Avengers: Endgame", 2019],
  ["disney", "series", "The Shards", 2026],
  ["disney", "series", "Furious", 2026],
  ["disney", "series", "Lion", 2026],
  ["disney", "series", "High Potential", 2024],
  ["disney", "series", "Loki", 2021],

  ["apple", "film", "The Dink", 2026],
  ["apple", "film", "F1", 2025],
  ["apple", "film", "The Gorge", 2025],
  ["apple", "film", "Napoleon", 2023],
  ["apple", "film", "Fountain of Youth", 2025],
]);

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function itemId(mediaType, provider, rank) {
  return `${mediaType === "film" ? "f" : "s"}_${provider}-${String(rank).padStart(2, "0")}`;
}

const ranks = new Map();
const items = RAW_ITEMS.map(([provider, mediaType, title, releaseYear]) => {
  const source = SOURCES[provider];
  const rankKey = `${provider}|${mediaType}`;
  const rank = (ranks.get(rankKey) || 0) + 1;
  ranks.set(rankKey, rank);
  return {
    title,
    sourceItemId: itemId(mediaType, provider, rank),
    sourceId: source.sourceId,
    sourceLabel: source.sourceLabel,
    mediaType,
    releaseYear,
    externalIds: {},
    genres: [],
    availability: {
      region: "AT",
      market: source.market,
      service: source.service,
      licenseTypes: source.market === "streaming" ? ["SVOD"] : [],
    },
    popularity: {
      metric: source.metric,
      rank,
      measuredOn: source.measuredOn,
      value: null,
    },
    sourceUrl: source.urls?.[mediaType] || source.url,
    fetchedAt: FETCHED_AT,
  };
});

export const ENTDECKEN_MARKET_POOL_50 = freezeDeep({
  format: VERSIONED_DISCOVERY_FEED_FORMAT,
  feedId: VERSIONED_DISCOVERY_FEED_ID,
  region: "AT",
  sourceId: VERSIONED_DISCOVERY_SOURCE_ID,
  sourceIds: [...VERSIONED_DISCOVERY_SOURCE_IDS],
  poolVersion: VERSIONED_DISCOVERY_POOL_VERSION,
  refreshedOn: "2026-08-29",
  validUntil: "2026-09-04",
  items,
});

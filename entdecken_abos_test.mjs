import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEntdeckenRecommendations } from "./src/lib/entdeckenUi.js";
import {
  currentCinemaDiscoveryCandidates,
  fillPopularWithCinema,
  projectTransientDescriptions,
  serviceAllowedDiscoveryEntry,
} from "./src/lib/entdeckenProjection.js";
import { createEntdeckenPin } from "./src/lib/entdeckenPins.js";
import { ENTDECKEN_MARKET_POOL_50 } from "./src/data/entdeckenMarketPool50.js";

let passed = 0;
const check = (name, fn) => {
  fn(); passed += 1; console.log(`✓ ${name}`);
};
const NOW = new Date("2026-09-10T12:00:00+02:00");

const selected = ["Netflix", "Disney+", "Prime Video", "Crunchyroll Premium (Via Amazon Prime)", "Paramount+ (Via Amazon Prime)"];
const allowed = createEntdeckenRecommendations({
  streamingEntdecken: { region: "AT", titel: [] }, streamingKnown: { region: "AT", titel: [] },
  master: [], profile: {}, selectedServices: selected, webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
  selectionDay: "2026-09-10", now: NOW,
});

check("ausgewählte Dienste gelten in Für mich und Beliebte Titel; Apple TV bleibt draußen", () => {
  const rows = [...allowed.personal, ...allowed.popularPool];
  assert.ok(rows.length > 0);
  assert.ok(rows.every((entry) => entry.availability?.market === "cinema"
    || selected.some((service) => serviceAllowedDiscoveryEntry(entry, [service]))));
  assert.ok(rows.every((entry) => !/^Apple TV/u.test(entry.availability?.service || "")));
});
check("Ohne Profil oder positive Bewertungen gibt es beliebte Titel, aber keine vorgetäuschte persönliche Auswahl", () => {
  assert.deepEqual(allowed.personal, []);
  assert.ok(allowed.popularPool.length > 0);
});

check("Dienste-Aliasse normalisieren Plus-, Premium- und Amazon-Channel-Schreibweisen", () => {
  assert.equal(serviceAllowedDiscoveryEntry({ services: ["Apple TV+"] }, ["AppleTV+"]), true);
  assert.equal(serviceAllowedDiscoveryEntry({ services: ["Apple TV"] }, ["Apple TV+"]), true);
  assert.equal(serviceAllowedDiscoveryEntry({ services: ["Apple TV"] }, ["Netflix"]), false);
  assert.equal(serviceAllowedDiscoveryEntry({ services: ["Crunchyroll"] }, ["Crunchyroll Premium (Via Prime)"]), true);
  assert.equal(serviceAllowedDiscoveryEntry({ services: ["Paramount+"] }, ["Paramount Plus (Via Amazon Prime)"]), true);
  assert.equal(serviceAllowedDiscoveryEntry({ services: ["Prime Video"] }, ["prime_video"]), true);
});

const kinoOnly = createEntdeckenRecommendations({
  streamingEntdecken: { region: "AT", titel: [] }, master: [], profile: {}, selectedServices: [],
  webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50, selectionDay: "2026-09-10", now: NOW,
});
check("ohne Streamingauswahl bleiben unbelegte Charttitel aus Für mich; Beliebte Titel zeigen den Kinomarkt", () => {
  assert.equal(kinoOnly.personal.length, 0);
  assert.ok(kinoOnly.popularPool.length > 0);
  assert.ok([...kinoOnly.personal, ...kinoOnly.popularPool]
    .every((entry) => entry.availability?.market === "cinema"));
});

const programFilms = Array.from({ length: 40 }, (_, index) => ({
  film_at_id: String(91000 + index),
  t: index === 0 ? ENTDECKEN_MARKET_POOL_50.items[0].title : `Aktueller Kinofilm ${index}`,
  j: index === 0 ? ENTDECKEN_MARKET_POOL_50.items[0].releaseYear : 2026,
  z: ["Do 10.9. 23:30 · Testkino"], g: index % 2 ? [] : ["Drama"],
  b: index === 2 ? "Beschreibung aus dem aktuellen Kinokatalog." : null,
}));
programFilms.push(
  { film_at_id: "91998", t: "Schon vorbei", j: 2026, z: ["Do 10.9. 09:00 · Testkino"] },
  { film_at_id: "91999", t: "Doppelte ID eins", j: 2026, z: ["Do 10.9. 23:30 · Testkino"] },
  { film_at_id: "91999", t: "Doppelte ID zwei", j: 2026, z: ["Do 10.9. 23:30 · Testkino"] },
);
const program = { status: { archiviert: false }, filme: programFilms };
const filled = createEntdeckenRecommendations({
  streamingEntdecken: { region: "AT", titel: [] }, master: [], profile: {}, selectedServices: ["Netflix"],
  webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50, program, programInfo: { abgelaufen: false },
  selectionDay: "2026-09-10", now: NOW,
});
check("weggefilterte Streamingplätze werden bis 50 mit echten künftigen Kinotiteln aufgefüllt", () => {
  assert.equal(filled.popularPool.length, 50);
  assert.deepEqual(filled.personal, []);
  assert.ok(filled.popularPool.some((entry) => entry.targetId === "film-at:91002"));
  assert.ok(!filled.popularPool.some((entry) => entry.title === "Schon vorbei"));
  assert.ok(!filled.popularPool.some((entry) => /^Doppelte ID/u.test(entry.title)));
  assert.equal(new Set(filled.popularPool.map((entry) => `${entry.title}|${entry.year}|${entry.type}`)).size, 50);
  const extra = filled.popularPool.find((entry) => entry.targetId === "film-at:91002");
  assert.equal(extra.popularity, undefined);
  assert.equal(createEntdeckenPin(extra, 1)?.pinId, "film_at:91002");
});

const cinemaPersonal = createEntdeckenRecommendations({
  streamingEntdecken: { region: "AT", titel: [] }, streamingKnown: { region: "AT", titel: [] },
  master: [],
  profile: { signale: [{ art: "genre", wert: "Drama", richtung: "zieht_an", staerke: 4 }] },
  selectedServices: ["Netflix"], webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
  factsSnapshot: {}, program: { status: { archiviert: false }, filme: [{
    film_at_id: "92001", t: "Passender Programmfueller", j: 2026,
    z: ["Do 10.9. 23:30 · Testkino"], g: ["Drama"], b: "Ein sicherer Programmtext.",
  }] }, programInfo: { abgelaufen: false }, selectionDay: "2026-09-10", now: NOW,
});
check("Für mich zeigt einen belegten Treffer und füllt freie Plätze nicht mit neutralen Titeln auf", () => {
  assert.equal(cinemaPersonal.personal.length, 1);
  assert.equal(cinemaPersonal.personal[0]?.targetId, "film-at:92001");
  assert.ok(cinemaPersonal.personal[0]?.reasons.includes("Profil: Drama"));
  assert.ok(cinemaPersonal.popularPool.some((entry) => entry.targetId === "film-at:92001"));
});

const contentPersonal = createEntdeckenRecommendations({
  streamingEntdecken: { region: "AT", titel: [] }, master: [],
  profile: { signale: [{ art: "genre", wert: "Science-Fiction", richtung: "zieht_an", staerke: 4 }] },
  selectedServices: [], webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50, factsSnapshot: {},
  program: { status: { archiviert: false }, filme: [{
    film_at_id: "92002", t: "Forschungsstation", j: 2026, g: [],
    z: ["Do 10.9. 23:30 · Testkino"], b: "A science fiction film about a distant research station.",
  }] }, programInfo: { abgelaufen: false }, selectionDay: "2026-09-10", now: NOW,
});
check("Konkrete Profilgründe aus Handlungsbeschreibungen bleiben in Für mich erhalten", () => {
  const match = contentPersonal.personal.find((entry) => entry.targetId === "film-at:92002");
  assert.ok(match?.reasons.includes("Inhalt: Science-Fiction aus deinem bestätigten Profil"));
  assert.ok(contentPersonal.personal.every((entry) => entry.reasons.length > 0));
});

check("Kino-Engpass bleibt ehrlich kleiner; abgelaufene und archivierte Programme liefern keine Füller", () => {
  const short = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] }, master: [], profile: {}, selectedServices: [],
    webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
    program: { status: { archiviert: false }, filme: programFilms.slice(0, 2) },
    programInfo: { abgelaufen: false }, selectionDay: "2026-09-10", now: NOW,
  });
  assert.ok(short.popularPool.length < 50);
  assert.deepEqual(currentCinemaDiscoveryCandidates({ program, programInfo: { abgelaufen: true }, now: NOW }), []);
  assert.deepEqual(currentCinemaDiscoveryCandidates({
    program: { ...program, status: { archiviert: true } }, programInfo: { abgelaufen: false }, now: NOW,
  }), []);
});

check("Dedup trennt Remakes und widersprechende starke IDs, entfernt aber echte Titel-Jahr-Typ-Duplikate", () => {
  const rows = fillPopularWithCinema([
    { targetId: "imdb:tt0000001", title: "Werk", year: 2000, type: "film", externalIds: { imdb: "tt0000001" } },
    { targetId: "imdb:tt0000002", title: "Werk", year: 2000, type: "film", externalIds: { imdb: "tt0000002" } },
    { targetId: "record:remake", title: "Werk", year: 2020, type: "film" },
    { targetId: "record:duplicate", title: "Werk", year: 2020, type: "film" },
  ], [], 50);
  assert.deepEqual(rows.map((entry) => entry.targetId), [
    "imdb:tt0000001", "imdb:tt0000002", "record:remake",
  ]);
});

const oneNetflix = ENTDECKEN_MARKET_POOL_50.items.find((item) => item.availability?.service === "Netflix");
const hardFeed = {
  ...ENTDECKEN_MARKET_POOL_50,
  items: ENTDECKEN_MARKET_POOL_50.items.map((item) => item.sourceItemId === oneNetflix.sourceItemId
    ? { ...item, genres: ["Drama"] } : item),
};
const guarded = createEntdeckenRecommendations({
  streamingEntdecken: { region: "AT", titel: [] }, master: [{
    titel: ENTDECKEN_MARKET_POOL_50.items[0].title,
    jahr: ENTDECKEN_MARKET_POOL_50.items[0].releaseYear,
    typ: "film", gesehen: true,
  }],
  profile: { signale: [{ art: "genre", wert: "Drama", richtung: "stoesst_ab", blocking: true }] },
  selectedServices: ["Netflix"], webDiscoveryFeed: hardFeed, selectionDay: "2026-09-10", now: NOW,
});
check("gesehen bleibt überall ausgeschlossen; hart abgelehnte Charts bleiben nur aus Für mich", () => {
  assert.ok(!guarded.personal.some((entry) => entry.title === ENTDECKEN_MARKET_POOL_50.items[0].title));
  assert.ok(!guarded.personal.some((entry) => entry.sourceItemId === oneNetflix.sourceItemId));
  assert.ok(!guarded.popularPool.some((entry) => entry.title === ENTDECKEN_MARKET_POOL_50.items[0].title));
  assert.ok(guarded.popularPool.some((entry) => entry.sourceItemId === oneNetflix.sourceItemId));
  assert.equal(guarded.personal.length, 0);
  assert.equal(guarded.diagnostics.profileMatches,
    guarded.personal.filter((entry) => entry.reasons.length > 0).length);
});

check("film.at-ID sperrt einen gesehenen Programmfüller auch bei lokal korrigiertem Titel", () => {
  const seenCinema = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] },
    master: [{ film_at_id: "91002", titel: "Mein korrigierter Titel", jahr: 2026, typ: "film", gesehen: true }],
    profile: {}, selectedServices: [], webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
    program, programInfo: { abgelaufen: false }, selectionDay: "2026-09-10", now: NOW,
  });
  assert.ok(!seenCinema.personal.some((entry) => entry.targetId === "film-at:91002"));
  assert.ok(!seenCinema.popularPool.some((entry) => entry.targetId === "film-at:91002"));
});

const originals = [
  { id: "own", titel: "Dune", jahr: 2021, typ: "film", imdb_id: "tt1160419", beschreibung: "Mein Text" },
  { id: "empty", titel: "Arrival", jahr: 2016, typ: "film", imdb_id: "tt2543164" },
  { id: "remake", titel: "Dune", jahr: 1984, typ: "film" },
  { id: "conflict", titel: "Twin", jahr: 2020, typ: "film", externalIds: { imdb: "tt1111111" } },
];
const frozenInput = JSON.stringify(originals);
const described = projectTransientDescriptions(originals, { catalogEntries: [{
  titel: "Arrival", jahr: 2016, typ: "movie", imdb_id: "tt2543164", description: "Sicher zugeordnet",
}, {
  title: "Twin", year: 2020, type: "film", externalIds: { imdb: "tt2222222" }, description: "Konflikttext",
}], facts: [{ titel: "Dune", jahr: 2021, typ: "film", imdb_id: "tt1160419", beschreibung: "Fremder Text" }] });
check("Beschreibungen ergänzen nur sichere Lücken und mutieren oder überschreiben nichts", () => {
  assert.equal(described[0].beschreibung, "Mein Text");
  assert.equal(described[1].beschreibung, "Sicher zugeordnet");
  assert.equal(described[2].beschreibung, undefined);
  assert.equal(described[3].beschreibung, undefined);
  assert.equal(JSON.stringify(originals), frozenInput);
});

const netflixItems = ENTDECKEN_MARKET_POOL_50.items.filter((item) => item.availability?.service === "Netflix");
const describedRecommendations = createEntdeckenRecommendations({
  streamingEntdecken: { region: "AT", titel: [] },
  streamingKnown: { region: "AT", titel: [{
    watchmode_id: 77101, titel: netflixItems[0].title, jahr: netflixItems[0].releaseYear,
    typ: netflixItems[0].mediaType, dienste: ["Netflix"], beschreibung: "Text aus dem Katalog",
  }] },
  flixpatrolFacts: [{
    sourceId: "ttl_12345678901234567890", flixpatrol_id: "ttl_12345678901234567890",
    titel: netflixItems[1].title, jahr: netflixItems[1].releaseYear,
    typ: netflixItems[1].mediaType, beschreibung: "Text aus dem gemeinsamen Fakten-Cache",
  }],
  master: [], profile: {}, selectedServices: ["Netflix"],
  webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50, selectionDay: "2026-09-10", now: NOW,
});
check("Entdecken-Kandidaten erhalten flüchtige Beschreibungen aus Katalog und gemeinsamem Fakten-Cache", () => {
  const rows = [...describedRecommendations.personal, ...describedRecommendations.popularPool];
  assert.equal(rows.find((entry) => entry.title === netflixItems[0].title)?.description, "Text aus dem Katalog");
  assert.equal(rows.find((entry) => entry.title === netflixItems[1].title)?.description,
    "Text aus dem gemeinsamen Fakten-Cache");
});

const rawRankingMaster = [{
  id: "rated", titel: "Bibliotheksfilm", jahr: 2020, typ: "film", genre: ["Drama"],
  bewertung: { wie: 4, was: 4, warum: 4 }, watchmode_id: 77881,
}];
const rawRankingSnapshot = JSON.stringify(rawRankingMaster);
const libraryEvidence = createEntdeckenRecommendations({
  streamingEntdecken: { region: "AT", titel: [] },
  streamingKnown: { region: "AT", titel: [
    { watchmode_id: 77881, titel: "Bibliotheksfilm", jahr: 2020, typ: "movie", dienste: ["Netflix"], beschreibung: "Nur flüchtig ergänzt." },
    { watchmode_id: 77882, titel: netflixItems[0].title, jahr: netflixItems[0].releaseYear, typ: netflixItems[0].mediaType, dienste: ["Netflix"], genres: ["Drama"] },
  ] },
  master: rawRankingMaster,
  profile: { signale: [] }, selectedServices: ["Netflix"], webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
  selectionDay: "2026-09-10", now: NOW,
});
check("flüchtig beschriebene positiv bewertete Mediathek speist nur das Entdecken-Ranking und lässt Rohdaten unverändert", () => {
  assert.ok(libraryEvidence.personal.some((entry) => entry.reasons.length > 0));
  assert.equal(JSON.stringify(rawRankingMaster), rawRankingSnapshot);
  assert.equal(rawRankingMaster[0].beschreibung, undefined);
});

check("beschädigtes Profil wird nicht durch neutrale Vorschläge als gesund behandelt", () => {
  const damaged = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] }, master: [], profile: { beschaedigt: true },
    selectedServices: ["Netflix"], webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
  });
  assert.deepEqual(damaged.personal, []);
  assert.equal(damaged.diagnostics.profileMatches, 0);
});

const uiSource = await readFile(new URL("./src/tabs/EntdeckenTab.jsx", import.meta.url), "utf8");
const appSource = await readFile(new URL("./src/App.jsx", import.meta.url), "utf8");
check("UI behauptet nur belegte persönliche Passung, zeigt den Stand und Mediathek erhält Rohmaster", () => {
  assert.match(uiSource, /Persönliche Passung/);
  assert.doesNotMatch(uiSource, /Noch ohne persönliche Passung/);
  assert.match(uiSource, /`Stand: \$\{formatPresentationDate\(webDiscoveryFeed\.refreshedOn\)\}`/);
  assert.doesNotMatch(uiSource, /Titel deiner ausgewählten Streamingdienste|Popularitätsaussage/);
  assert.match(appSource, /master=\{master \?\? LEERER_MEDIATHEK_MASTER\}/);
  assert.doesNotMatch(appSource, /mediathekMaster|projectTransientDescriptions/);
});

console.log(`\n${passed}/${passed} E9-Checks bestanden.`);

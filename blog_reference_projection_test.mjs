import fs from "node:fs";
import { heileRotlinks } from "./src/lib/artikel.js";
import {
  blogIdentityHints,
  buildBlogLibraryIndex,
  buildPrivateBlogTargetIndex,
  canonicalBlogSourceIds,
  projectPrivateArticleForPublication,
  projectPrivateBlogReferences,
  projectPublicBlogReferences,
} from "./src/lib/blogReferenceProjection.js";

let ok = 0;
function check(name, value) {
  if (!value) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const fixture = JSON.parse(fs.readFileSync("tests/fixtures/blog-contract-v1.json", "utf8"));
const references = fixture.publicPage.items[0].article.references;
const alpha = fixture.readerContexts[0];
const beta = fixture.readerContexts[1];

const alphaIndex = new Map(Object.entries(alpha.libraryByWorkKey));
const betaIndex = new Map(Object.entries(beta.libraryByWorkKey));
const alphaViews = projectPublicBlogReferences(references, {
  selectedSourceIds: alpha.selectedSourceIds,
  libraryIndex: alphaIndex,
  libraryReady: alpha.libraryReady,
  now: fixture.testClock,
});
const betaViews = projectPublicBlogReferences(references, {
  selectedSourceIds: beta.selectedSourceIds,
  libraryIndex: betaIndex,
  libraryReady: beta.libraryReady,
  now: fixture.testClock,
});

check("Leser A und B erhalten ihre getrennten Quellen- und Mediathekansichten",
  alphaViews.map((row) => row.state).join(",") === fixture.expectedReferenceViews[alpha.id].join(",")
  && betaViews.map((row) => row.state).join(",") === fixture.expectedReferenceViews[beta.id].join(","));
check("Öffentliche UI-Handles sind ausschließlich serverseitige referenceIds",
  alphaViews.every((row, index) => row.rowId === references[index].referenceId)
  && alphaViews.every((row) => row.referenceId === row.rowId));
check("Flache Views führen Anzeige-Titeldaten und echte Navigationsziele mit",
  alphaViews[1].title.includes("Empire")
  && alphaViews[1].primaryTarget.kind === "streaming"
  && alphaViews[2].primaryTarget.kind === "cinema"
  && alphaViews[0].primaryTarget.kind === "library");
check("Mediathektreffer steht stabil vor Streaming und Kino",
  alphaViews[0].primaryTarget.kind === "library"
  && alphaViews[0].secondaryTargets.every((target) => target.kind !== "library"));
check("Fehlende oder veraltete Quellen bleiben ungeprüft statt Rotlink",
  alphaViews[4].state === "unchecked" && alphaViews[7].state === "unchecked"
  && alphaViews[9].state === "unchecked");

check("Anzeigenamen werden auf vorhandene kanonische Backend-IDs abgebildet",
  canonicalBlogSourceIds(["Netflix", "Prime Video", "Disney+", "Apple TV+", "HBO Max", "Paramount Plus", "MUBI", "Crunchyroll Premium", "RTL+", "Hayu"])
    .join(",") === "netflix,prime,disney,apple,hbo,paramount,mubi,crunchyroll,rtl");

const library = [
  { id: "private-new-hope", titel: "Star Wars", imdb_id: "tt0076759", tmdb_id: 11 },
  { id: "private-empire", titel: "Empire", watchmode_id: "fixture-watchmode-empire" },
  { id: "private-opaque", titel: "Opaque", workKey: "opaque:server-key" },
];
const index = buildBlogLibraryIndex(library);
check("Mediathekindex nutzt nur gemeinsame Werkkennung oder starke IDs",
  index.get("imdb:tt0076759")?.ref === "private-new-hope"
  && index.get("tmdb:11")?.ref === "private-new-hope"
  && index.get("watchmode:fixture-watchmode-empire")?.ref === "private-empire"
  && index.get("opaque:server-key")?.ref === "private-opaque"
  && !index.has("Star Wars"));
check("Mehrdeutige starke IDs werden fail-closed nicht in den Index aufgenommen",
  !buildBlogLibraryIndex([...library, { id: "duplicate", titel: "Dublette", imdb_id: "tt0076759" }]).has("imdb:tt0076759"));

const opaqueReference = [{
  referenceId: "opaque-ref", rank: 1, title: "Opaque Server Film", year: 2029, mediaType: "film",
  resolution: { status: "matched", workKey: "work:opaque-backend-key" },
  sources: { status: "checked", checkedAt: "2032-05-04T11:00:00.000Z", validUntil: "2032-05-05T12:00:00.000Z", streaming: [], cinema: [] },
}];
const opaqueLibrary = [{ id: "private-opaque-title", titel: "Opaque Server Film", jahr: 2029, typ: "film" }];
check("Opaque Server-Werkkennungen fallen konservativ auf eindeutigen Titel, Jahr und Typ zurück",
  projectPublicBlogReferences(opaqueReference, {
    library: opaqueLibrary, libraryIndex: buildBlogLibraryIndex(opaqueLibrary), libraryReady: true,
    selectedSourceIds: [], now: fixture.testClock,
  })[0].primaryTarget?.ref === "private-opaque-title");
check("Mehrdeutige persönliche Titel bleiben trotz opaque Werkkennung Rotlink",
  projectPublicBlogReferences(opaqueReference, {
    library: [...opaqueLibrary, { ...opaqueLibrary[0], id: "private-opaque-duplicate" }],
    libraryIndex: new Map(), libraryReady: true, selectedSourceIds: [], now: fixture.testClock,
  })[0].state === "redlink");
check("Titelgleichheit mit abweichendem Jahr bleibt beim öffentlichen Fallback ungelöst",
  projectPublicBlogReferences(opaqueReference, {
    library: [{ ...opaqueLibrary[0], jahr: 2030 }], libraryIndex: new Map(), libraryReady: true,
    selectedSourceIds: [], now: fixture.testClock,
  })[0].state === "redlink");
check("Widersprüchliche starke Werkkennungen werden nicht durch Titelgleichheit überstimmt",
  projectPublicBlogReferences([{ ...opaqueReference[0], resolution: { status: "matched", workKey: "imdb:tt-wrong" } }], {
    library: opaqueLibrary, libraryIndex: buildBlogLibraryIndex(opaqueLibrary), libraryReady: true,
    selectedSourceIds: [], now: fixture.testClock,
  })[0].state === "redlink");
check("Mehrdeutige explizite Werkkennungen werden ebenfalls nicht über den Titel umgangen",
  projectPublicBlogReferences(opaqueReference, {
    library: [
      { ...opaqueLibrary[0], workKey: "work:opaque-backend-key" },
      { id: "workkey-conflict", titel: "Anderer Titel", jahr: 2035, typ: "film", workKey: "work:opaque-backend-key" },
    ],
    libraryIndex: buildBlogLibraryIndex([
      { ...opaqueLibrary[0], workKey: "work:opaque-backend-key" },
      { id: "workkey-conflict", titel: "Anderer Titel", jahr: 2035, typ: "film", workKey: "work:opaque-backend-key" },
    ]),
    libraryReady: true, selectedSourceIds: [], now: fixture.testClock,
  })[0].state === "redlink");
check("Ein leerer, aber geladener persönlicher Bestand zeigt einen echten Rotlink",
  projectPublicBlogReferences(opaqueReference, {
    library: [], libraryIndex: new Map(), libraryReady: true,
    selectedSourceIds: [], now: fixture.testClock,
  })[0].state === "redlink");

const twinReference = [{
  ...opaqueReference[0], referenceId: "twin-public", title: "Twin", year: 2000, mediaType: "film",
  resolution: { status: "matched", workKey: "work:twin-a",
    identityHints: [{ namespace: "imdb", value: "tt1000001" }] },
}];
const wrongTwin = { id: "twin-b", titel: "Twin", jahr: 2000, typ: "film", imdb_id: "tt1000002" };
check("Widersprüchliche verifizierte IMDb-Identität sperrt den Titel-Zwilling",
  projectPublicBlogReferences(twinReference, {
    library: [wrongTwin], libraryIndex: buildBlogLibraryIndex([wrongTwin]), libraryReady: true,
    selectedSourceIds: [], now: fixture.testClock,
  })[0].state === "redlink");
const rightTwin = { id: "twin-a-private", titel: "Ganz anderer Anzeigename", jahr: 1999,
  typ: "film", imdb_id: "tt1000001" };
check("Gleiche starke ID verbindet unabhängig von Anzeigename und Jahr",
  projectPublicBlogReferences(twinReference, {
    library: [wrongTwin, rightTwin], libraryIndex: buildBlogLibraryIndex([wrongTwin, rightTwin]),
    libraryReady: true, selectedSourceIds: [], now: fixture.testClock,
  })[0].primaryTarget?.ref === "twin-a-private");
check("Widerspruch in einer zweiten gemeinsamen ID blockiert auch einen einzelnen ID-Kandidaten",
  projectPublicBlogReferences([{
    ...twinReference[0], resolution: { ...twinReference[0].resolution,
      identityHints: [{ namespace: "imdb", value: "tt1000001" }, { namespace: "tmdb", value: "42" }] },
  }], {
    library: [{ ...rightTwin, tmdb_id: 43 }], libraryIndex: new Map(), libraryReady: true,
    selectedSourceIds: [], now: fixture.testClock,
  })[0].state === "redlink");
check("Doppelte persönliche Treffer derselben starken ID bleiben mehrdeutig offen",
  projectPublicBlogReferences(twinReference, {
    library: [rightTwin, { ...rightTwin, id: "twin-a-duplicate" }], libraryIndex: new Map(),
    libraryReady: true, selectedSourceIds: [], now: fixture.testClock,
  })[0].state === "redlink");
check("Legacy-Mediathekzeile ohne starke ID darf weiterhin eindeutig über Titel, Jahr und Typ heilen",
  projectPublicBlogReferences(twinReference, {
    library: [{ id: "legacy-twin", titel: "Twin", jahr: 2000, typ: "film" }],
    libraryIndex: new Map(), libraryReady: true, selectedSourceIds: [], now: fixture.testClock,
  })[0].primaryTarget?.ref === "legacy-twin");

const tmdbTypedReference = [{
  ...opaqueReference[0], referenceId: "typed-tmdb", title: "Gleiche Nummer", year: 2020, mediaType: "film",
  resolution: { status: "matched", workKey: "work:typed",
    identityHints: [{ namespace: "tmdb", value: "700" }] },
}];
check("Gleiche TMDB-Zahl trennt Film und Serie über den normalisierten Medientyp",
  projectPublicBlogReferences(tmdbTypedReference, {
    library: [
      { id: "tmdb-series", titel: "Serienzwilling", jahr: 2020, typ: "serie", tmdb_id: 700 },
      { id: "tmdb-film", titel: "Filmzwilling", jahr: 2019, typ: "film", tmdb_id: 700 },
    ], libraryIndex: new Map(), libraryReady: true, selectedSourceIds: [], now: fixture.testClock,
  })[0].primaryTarget?.ref === "tmdb-film");
const privateTargets = buildPrivateBlogTargetIndex(library, [
  { id: "mw-library", titel: "A", verknuepfung: { ziel: "master", id: "private-new-hope" } },
  { id: "mw-stream", titel: "B", verknuepfung: { ziel: "streaming", id: "watchmode-2" } },
  { id: "mw-cinema", titel: "C", verknuepfung: { ziel: "programm", id: "film-at-3" } },
]);
check("Bestehende Must-Watch-Rückverweise bleiben echte Bibliotheks-, Streaming- oder Kinoziele",
  privateTargets.get("mw-library")?.kind === "library"
  && privateTargets.get("mw-stream")?.kind === "streaming"
  && privateTargets.get("mw-cinema")?.kind === "cinema");
const directStreamingRow = {
  rowId: "direct-stream", eingabe: "Evil Dead Burn", jahr: 2026, typ: "film", ref: "1768658",
  sourceTarget: { kind: "streaming", art: "entdecken", ref: "1768658", titel: "Evil Dead Burn" },
  identityHints: [{ namespace: "imdb", value: "tt31170389" }, { namespace: "watchmode", value: "1768658" }],
  resolutionIntent: { kind: "auto" },
};
check("Direkt bestätigte Streamingziele bleiben nach privatem Reload ohne Mediathekzeile navigierbar",
  projectPrivateBlogReferences([directStreamingRow], new Map(), { ready: true })[0].primaryTarget?.ref === "1768658");
check("Direkt belegte starke IDs gelangen ohne private Ref in die Publikationsprojektion", (() => {
  const projected = projectPrivateArticleForPublication({ titel: "Scan", text: "Evil Dead Burn", liste: [directStreamingRow] }, []);
  return projected.references[0].identityHints?.some((hint) => hint.namespace === "imdb"
    && hint.value === "tt31170389") && !("ref" in projected.references[0]);
})());
const workReference = {
  rowId: "work-2001", eingabe: "2001: A Space Odyssey", jahr: 1968, typ: "film", ref: null,
  workIdentity: { title: "2001: A Space Odyssey", year: 1968, mediaType: "film",
    identityHints: [{ namespace: "imdb", value: "tt0062622" }] },
  sourceObservations: [], resolutionIntent: { kind: "auto" },
};
const currentLibrary = [{ id: "private-2001", titel: "2001", jahr: 1968, typ: "film", imdb_id: "tt0062622" }];
const currentMustwatch = [{ id: "watch-2001", titel: "2001: A Space Odyssey", jahr: 1968, typ: "film",
  imdb_id: "tt0062622", verknuepfung: { ziel: "streaming", id: "stream-2001" } }];
const currentTargets = buildPrivateBlogTargetIndex(currentLibrary, currentMustwatch);
const dynamicView = projectPrivateBlogReferences([workReference], currentTargets, {
  ready: true, library: currentLibrary, mustwatch: currentMustwatch,
  cinema: [{ film_at_id: "kino-2001", t: "2001: A Space Odyssey", j: 1968 }],
});
check("Eine Werkreferenz löst aktuelle kontoeigene Mediathek-, Streaming- und Kinoziele gemeinsam auf",
  dynamicView[0].primaryTarget?.ref === "private-2001"
  && dynamicView[0].secondaryTargets.map((target) => target.ref).join(",") === "stream-2001,kino-2001");
check("Dieselbe gespeicherte Werkreferenz bleibt ohne Treffer im anderen Konto unverknüpft",
  projectPrivateBlogReferences([workReference], new Map(), {
    ready: true, library: [], mustwatch: [], cinema: [],
  })[0].state === "redlink");
check("Ein späterer Mediathektreffer wird für Werkreferenzen projiziert statt dauerhaft eingetragen", (() => {
  const article = { id: "work-article", liste: [workReference] };
  const [healed, count] = heileRotlinks([article], currentLibrary);
  return count === 0 && healed[0] === article && healed[0].liste[0].ref === null;
})());
check("Publikation übernimmt nur öffentliche Werkhinweise und keine privaten Fundorte", (() => {
  const projected = projectPrivateArticleForPublication({ titel: "Scan", text: "2001", liste: [workReference] }, currentLibrary);
  const serialized = JSON.stringify(projected.references[0]);
  return projected.references[0].resolutionIntent.kind === "auto"
    && projected.references[0].identityHints?.[0]?.value === "tt0062622"
    && !serialized.includes("private-2001") && !serialized.includes("sourceObservations")
    && !serialized.includes("workIdentity");
})());
check("Starke Hinweise enthalten keine private Mediathek-ID",
  JSON.stringify(blogIdentityHints(library[0])) === JSON.stringify([
    { namespace: "imdb", value: "tt0076759" }, { namespace: "tmdb", value: "11" },
  ]));

const privateArticle = {
  id: fixture.ownerArticle.privateArticleId,
  titel: fixture.ownerArticle.title,
  text: fixture.ownerArticle.text,
  geordnet: true,
  liste: fixture.ownerArticle.references.map((row, index) => ({
    rowId: row.rowId, eingabe: row.title, jahr: row.year, typ: row.mediaType,
    ref: index === 0 ? "private-new-hope" : null,
    resolutionIntent: row.resolutionIntent,
  })),
};
const publication = projectPrivateArticleForPublication(privateArticle, library);
check("Publikationsprojektion bewahrt stabile rowIds und lückenlose Ränge",
  publication.references.every((row, index) => row.rowId === `row-${String(index + 1).padStart(2, "0")}` && row.rank === index + 1));
check("Publikationsprojektion gibt niemals private refs oder Quellenbehauptungen weiter",
  publication.references.every((row) => !("ref" in row) && !("sources" in row))
  && publication.references[0].identityHints.some((hint) => hint.namespace === "imdb"));
check("Umordnen ändert Ränge, aber keine Zeilenidentität",
  projectPrivateArticleForPublication({ ...privateArticle, liste: [...privateArticle.liste].reverse() }, library)
    .references.map((row) => row.rowId).join(",") === [...fixture.ownerArticle.references].reverse().map((row) => row.rowId).join(","));

console.log(`blog_reference_projection_test: ${ok} Checks bestanden.`);

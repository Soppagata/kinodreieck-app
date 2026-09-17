import fs from "node:fs";
import {
  blogIdentityHints,
  buildBlogLibraryIndex,
  buildPrivateBlogTargetIndex,
  canonicalBlogSourceIds,
  projectPrivateArticleForPublication,
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
const privateTargets = buildPrivateBlogTargetIndex(library, [
  { id: "mw-library", titel: "A", verknuepfung: { ziel: "master", id: "private-new-hope" } },
  { id: "mw-stream", titel: "B", verknuepfung: { ziel: "streaming", id: "watchmode-2" } },
  { id: "mw-cinema", titel: "C", verknuepfung: { ziel: "programm", id: "film-at-3" } },
]);
check("Bestehende Must-Watch-Rückverweise bleiben echte Bibliotheks-, Streaming- oder Kinoziele",
  privateTargets.get("mw-library")?.kind === "library"
  && privateTargets.get("mw-stream")?.kind === "streaming"
  && privateTargets.get("mw-cinema")?.kind === "cinema");
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

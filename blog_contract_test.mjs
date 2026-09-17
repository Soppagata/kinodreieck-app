import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BLOG_CONTRACT_VERSION,
  BLOG_MAX_REFERENCES,
  BLOG_NEUTRAL_AUTHOR,
  BLOG_PUBLICATION_DISPLAY,
  BLOG_REFERENCE_VIEW,
  BLOG_SAVE_INTENT,
  blogPublicationDisplayState,
  blogSaveIntent,
  hasBlogPublicationCapability,
  isBlogSourceTargetCurrent,
  projectBlogReferenceForReader,
} from "./src/lib/blogContract.js";

const fixture = JSON.parse(await readFile(new URL("./tests/fixtures/blog-contract-v1.json", import.meta.url), "utf8"));
let checks = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  checks += 1;
  console.log(`✓ ${name}`);
};

check("Fixture und Laufzeit verwenden denselben v1-Vertrag",
  fixture.contractVersion === BLOG_CONTRACT_VERSION
  && fixture.publicPage.contractVersion === BLOG_CONTRACT_VERSION);
check("Capability ist exakt und unbekannte oder alte Server bleiben fail-closed",
  hasBlogPublicationCapability(fixture.capability)
  && !hasBlogPublicationCapability({ ...fixture.capability, contractVersion: "blog-publication-v0" })
  && !hasBlogPublicationCapability({ ...fixture.capability, anonymousProjection: false })
  && !hasBlogPublicationCapability({ ...fixture.capability, extra: true }));
check("Referenzgrenze und stabile Zeilenidentitaet gelten unabhaengig von Rangfolge",
  fixture.ownerArticle.references.length <= BLOG_MAX_REFERENCES
  && new Set(fixture.ownerArticle.references.map((entry) => entry.rowId)).size === fixture.ownerArticle.references.length
  && fixture.ownerArticle.references.every((entry, index) => entry.rank === index + 1));

const article = fixture.publicPage.items[0].article;
check("Oeffentliche Projektion ist neutral und enthaelt keine privaten Zeilen- oder Konto-IDs",
  fixture.publicPage.items[0].author === BLOG_NEUTRAL_AUTHOR
  && fixture.publicPage.items[0].article.id === fixture.publicPage.items[0].publicationId
  && !JSON.stringify(fixture.publicPage).includes(fixture.ownerArticle.privateArticleId)
  && !JSON.stringify(fixture.publicPage).includes("row-01")
  && !JSON.stringify(fixture.publicPage).includes("fixture-account-alpha"));
check("Gleiche Werke koennen mehrfach mit eigener stabiler Referenz dargestellt werden",
  article.references.filter((entry) => entry.resolution.workKey === "fixture:work:new-hope-1977").length === 3
  && new Set(article.references.map((entry) => entry.referenceId)).size === article.references.length);
check("Gleicher Titel mit abweichendem Jahr wird nicht still zusammengelegt",
  article.references.some((entry) => entry.title === "Star Wars" && entry.year === 1977 && entry.resolution.status === "matched")
  && article.references.some((entry) => entry.title === "Star Wars" && entry.year === 2025 && entry.resolution.status === "not_found"));

const now = fixture.testClock;
const contexts = new Map(fixture.readerContexts.map((context) => [context.id, context]));
for (const [accountId, expected] of Object.entries(fixture.expectedReferenceViews)) {
  const context = contexts.get(accountId);
  const actual = article.references.map((reference) => projectBlogReferenceForReader(reference, {
    selectedSourceIds: context.selectedSourceIds,
    libraryReady: context.libraryReady,
    libraryTarget: context.libraryByWorkKey[reference.resolution.workKey] || null,
    now,
  }).state);
  check(`${accountId} erhaelt nur eigene Mediathek- und gewaehlte Quellenziele`,
    JSON.stringify(actual) === JSON.stringify(expected));
}

const streamingOnly = article.references[1];
const cinemaOnly = article.references[2];
const unknownSource = article.references[4];
const expiredCinema = article.references[7];
check("Streamingziel nutzt die vorbereitete echte App-Zielform",
  projectBlogReferenceForReader(streamingOnly, {
    selectedSourceIds: ["disney"], libraryReady: true, now,
  }).primaryTarget?.kind === "streaming"
  && projectBlogReferenceForReader(streamingOnly, {
    selectedSourceIds: ["disney"], libraryReady: true, now,
  }).primaryTarget?.art === "programm"
  && projectBlogReferenceForReader(streamingOnly, {
    selectedSourceIds: ["disney"], libraryReady: true, now,
  }).primaryTarget?.titel === "Star Wars: The Empire Strikes Back");
check("Kinoziel nutzt film_at-kompatible Programmreferenz und explizite Gueltigkeit",
  projectBlogReferenceForReader(cinemaOnly, { libraryReady: true, now }).primaryTarget?.ref === "fixture-film-at-jedi"
  && isBlogSourceTargetCurrent(cinemaOnly.sources.cinema[0], now));
check("Ungepruefte Quelle ist kein Rotlink",
  projectBlogReferenceForReader(unknownSource, { libraryReady: true, now }).state === BLOG_REFERENCE_VIEW.UNCHECKED
  && projectBlogReferenceForReader({
    ...streamingOnly, sources: { ...streamingOnly.sources, checkedAt: null, streaming: [] },
  }, { libraryReady: true, now }).state === BLOG_REFERENCE_VIEW.UNCHECKED);
check("Abgelaufener Kinotermin gilt an injizierter Uhr als ungeprueft statt aktuell oder Rotlink",
  !isBlogSourceTargetCurrent(expiredCinema.sources.cinema[0], now)
  && projectBlogReferenceForReader(expiredCinema, { libraryReady: true, now }).state === BLOG_REFERENCE_VIEW.UNCHECKED);
check("Ohne injizierte Uhr wird keine statische Fixture-Verfuegbarkeit behauptet",
  !isBlogSourceTargetCurrent(cinemaOnly.sources.cinema[0], undefined));

check("Checkbox bildet ausschliesslich private, Publish- und Update-Intents ab",
  blogSaveIntent({ hasPublication: false, anonymousPublication: false }) === BLOG_SAVE_INTENT.PRIVATE_ONLY
  && blogSaveIntent({ hasPublication: false, anonymousPublication: true }) === BLOG_SAVE_INTENT.PUBLISH
  && blogSaveIntent({ hasPublication: true, anonymousPublication: false }) === BLOG_SAVE_INTENT.PRIVATE_ONLY
  && blogSaveIntent({ hasPublication: true, anonymousPublication: true }) === BLOG_SAVE_INTENT.UPDATE);
check("Content-Version trennt veroeffentlichte Fassung von privaten Aenderungen",
  blogPublicationDisplayState({}) === BLOG_PUBLICATION_DISPLAY.PRIVATE
  && blogPublicationDisplayState({ publicationId: "p", contentVersion: "v1", publishedContentVersion: "v1" }) === BLOG_PUBLICATION_DISPLAY.PUBLISHED
  && blogPublicationDisplayState({ publicationId: "p", contentVersion: "v2", publishedContentVersion: "v1" }) === BLOG_PUBLICATION_DISPLAY.PRIVATE_CHANGES);
check("Teilergebnis bewahrt privaten Erfolg und unbekannte Publikation getrennt",
  fixture.saveOutcomes.publishPartialFailure.private.status === "saved"
  && fixture.saveOutcomes.publishPartialFailure.publication.status === "failed"
  && fixture.saveOutcomes.publishUnknown.publication.status === "unknown"
  && fixture.saveOutcomes.publishUnknown.publication.operationId);
check("Ruecknahme und Loeschung bestaetigen oeffentlichen und privaten Ausgang getrennt",
  fixture.actionOutcomes.withdraw.status === "withdrawn"
  && fixture.actionOutcomes.withdraw.operationId
  && fixture.actionOutcomes.deleteBlockedAfterWithdrawFailure.publication.status === "failed"
  && fixture.actionOutcomes.deleteBlockedAfterWithdrawFailure.private.status === "kept");
check("Paginierte Liste ist begrenzt und hat einen opaken Folgekursor",
  fixture.publicPage.items.length === 1
  && Number.isFinite(Date.parse(fixture.publicPage.snapshotAt))
  && fixture.publicPage.complete === false
  && typeof fixture.publicPage.nextCursor === "string"
  && fixture.publicPage.nextCursor.length > 0);

console.log(`blog_contract_test: ${checks} Checks bestanden.`);

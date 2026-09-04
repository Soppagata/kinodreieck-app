import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  TITLE_MATCH_KIND,
  maxTitleEditDistance,
  rankTitleMatches,
  titleEditDistance,
} from "./src/lib/titleSearch.js";
import {
  formatPresentationDate,
  PRESENTATION_TIME_ZONE,
} from "./src/lib/presentationDate.js";
import {
  buildCatalogPhaseBalance,
  catalogPhase,
} from "./src/lib/catalogAudit.js";
import {
  assertReleaseCompatibility,
  evaluateReleaseCompatibility,
} from "./src/lib/releaseCompatibility.js";

const tests = [];
const test = (name, run) => tests.push({ name, run });

const catalog = [
  { id: "obsession-2024", titel: "Obsession", originaltitel: "Obsession", jahr: 2024, bereich: "mediathek" },
  { id: "obsessed-2009", titel: "Obsessed", jahr: 2009, bereich: "streaming" },
  { id: "blade-runner", titel: "Blade Runner", jahr: 1982, bereich: "mediathek" },
  { id: "blade-runner-2049", titel: "Blade Runner 2049", jahr: 2017, bereich: "kino" },
  { id: "the-office-uk", titel: "The Office", jahr: 2001, bereich: "streaming" },
  { id: "the-office-us", titel: "The Office", jahr: 2005, bereich: "mediathek" },
  { id: "arrival", titel: "Arrival", originaltitel: "Arrival", alternativtitel: ["Story of Your Life"], bereich: "streaming" },
  { id: "rival", titel: "Rival", bereich: "kino" },
];

test("Titelranking priorisiert stabile Identität vor Titel und Bereich", () => {
  const result = rankTitleMatches({ text: "Obsession", identities: ["id:obsessed-2009"] }, catalog, {
    currentArea: "mediathek",
  });
  assert.equal(result[0].item.id, "obsessed-2009");
  assert.equal(result[0].match.kind, TITLE_MATCH_KIND.IDENTITY);
  assert.equal(result[1].item.id, "obsession-2024");
  assert.equal(result[1].match.kind, TITLE_MATCH_KIND.EXACT);
});

test("Exakter Treffer aus anderem Bereich bleibt vor schwacher Bereichsnähe", () => {
  const result = rankTitleMatches("Obsession", catalog, { currentArea: "streaming" });
  assert.deepEqual(result.map((entry) => entry.item.id), ["obsession-2024"]);
});

test("Original- und Alternativtitel sind gleichwertige exakte Titel", () => {
  assert.equal(rankTitleMatches("Story of Your Life", catalog)[0].item.id, "arrival");
});

test("Starker Worttreffer bleibt konservativ", () => {
  const result = rankTitleMatches("Blade Runner", catalog);
  assert.deepEqual(result.map((entry) => entry.item.id), ["blade-runner", "blade-runner-2049"]);
  assert.equal(result[0].match.kind, TITLE_MATCH_KIND.EXACT);
  assert.equal(result[1].match.kind, TITLE_MATCH_KIND.STRONG);
  assert.equal(rankTitleMatches("it", [{ id: "it", titel: "Titanic" }]).length, 0);
});

test("Einzelne, doppelte und vertauschte Zeichen liefern nur eindeutiges Fuzzy", () => {
  for (const query of ["Obsesion", "Obsessiion", "Obsesison"]) {
    const result = rankTitleMatches(query, catalog);
    assert.equal(result.length, 1, query);
    assert.equal(result[0].item.id, "obsession-2024", query);
    assert.equal(result[0].match.kind, TITLE_MATCH_KIND.FUZZY, query);
  }
  assert.equal(titleEditDistance("Obsesison", "Obsession"), 1);
  assert.equal(maxTitleEditDistance(4), 0);
  assert.equal(maxTitleEditDistance(8), 2);
});

test("Mehrdeutige Fuzzy- und bewusste Nicht-Matches bleiben leer", () => {
  assert.equal(rankTitleMatches("The Ofice", catalog).length, 0);
  assert.equal(rankTitleMatches("Arrival", [{ id: "arrival", titel: "Arrival" }, { id: "rival", titel: "Rival" }]).length, 1);
  assert.equal(rankTitleMatches("Riviera", catalog).length, 0);
});

test("Sichtbare Daten sind de-AT, Europe/Vienna; ISO bleibt unverändert", () => {
  const iso = "2026-09-04";
  assert.equal(formatPresentationDate(iso), "04.09.2026");
  assert.equal(iso, "2026-09-04");
  assert.equal(formatPresentationDate(iso, { format: "long" }), "4. September 2026");
  assert.equal(formatPresentationDate("2026-03-29T22:30:00Z"), "30.03.2026");
  assert.equal(formatPresentationDate("2026-02-31", { fallback: "unbekannt" }), "unbekannt");
  assert.equal(PRESENTATION_TIME_ZONE, "Europe/Vienna");
});

test("Katalogbilanz kennt belegte Zähler und markiert Provenienzlücken", () => {
  const balance = buildCatalogPhaseBalance({
    snapshotId: "streaming-2026-09-04",
    generatedAt: "2026-09-04T11:00:48Z",
    completeness: "limited",
    phases: {
      rawBySource: { netflix: 6000, disney: 1800 },
      validAtAvailability: 7200,
      snapshot: 11152,
      visible: 11049,
    },
    comparison: { added: 311, removed: 1802 },
  });
  assert.equal(catalogPhase(balance, "rawBySource").count, 7800);
  assert.equal(catalogPhase(balance, "identityResolved").status, "unknown");
  assert.equal(balance.comparison.reidentified.status, "unknown");
  assert.equal(balance.marketInterpretation.status, "unknown");
  assert.equal(balance.marketInterpretation.reason, "snapshot-difference-does-not-prove-market-exit");
  assert.equal(balance.complete, false);
});

test("Teilweise Quellenzählung erfindet keine Rohsumme", () => {
  const balance = buildCatalogPhaseBalance({ phases: { rawBySource: { netflix: 10, disney: null } } });
  assert.equal(catalogPhase(balance, "rawBySource").count, null);
  assert.deepEqual(catalogPhase(balance, "rawBySource").unknownSources, ["disney"]);
});

const expectedRelease = {
  webCommit: "9b54577c165806c2124e4543ad9575a38642aa99",
  functions: [
    { name: "ai-task", metadata: { version: 80, sha256: "a".repeat(64), verifyJwt: true } },
    { name: "entdecken-daily-task", metadata: { version: 59, sha256: "b".repeat(64) } },
  ],
  requiredMigrations: ["20260902130000_private_account_size_report"],
};

const observedRelease = {
  webCommit: "9b54577c165806c2124e4543ad9575a38642aa99",
  functions: [
    { name: "ai-task", metadata: { version: 80, sha256: "a".repeat(64), verifyJwt: true, status: "ACTIVE" } },
    { name: "entdecken-daily-task", metadata: { version: 59, sha256: "b".repeat(64) } },
  ],
  migrations: ["20260902130000_private_account_size_report", "20260903213000"],
};

test("Releaseparität akzeptiert nur vollständige passende Readbacks", () => {
  const result = evaluateReleaseCompatibility({ expected: expectedRelease, observed: observedRelease });
  assert.equal(result.ok, true);
  assert.equal(assertReleaseCompatibility({ expected: expectedRelease, observed: observedRelease }).ok, true);
});

test("Releaseparität scheitert geschlossen bei fehlender Migration oder Metadaten", () => {
  const missingMigration = evaluateReleaseCompatibility({
    expected: expectedRelease,
    observed: { ...observedRelease, migrations: [] },
  });
  assert.equal(missingMigration.ok, false);
  assert.ok(missingMigration.errors.includes("migration:20260902130000_private_account_size_report"));
  const missingMetadata = evaluateReleaseCompatibility({
    expected: expectedRelease,
    observed: { ...observedRelease, functions: [{ name: "ai-task", metadata: {} }] },
  });
  assert.equal(missingMetadata.ok, false);
  assert.ok(missingMetadata.errors.includes("function:ai-task"));
  assert.equal(evaluateReleaseCompatibility().ok, false);
  assert.equal(evaluateReleaseCompatibility({
    expected: { webCommit: expectedRelease.webCommit, functions: [], requiredMigrations: [] },
    observed: { webCommit: expectedRelease.webCommit, functions: [], migrations: [] },
  }).ok, false);
});

test("SelectionControl rendert eine verbundene semantische Checkbox-Hitbox", async () => {
  const moduleRoot = process.env.KD_TEST_NODE_MODULES || path.join(process.cwd(), "node_modules");
  const requireFromModules = createRequire(path.join(moduleRoot, "__kd_cleanup_foundation__.cjs"));
  let esbuild;
  try { esbuild = requireFromModules("esbuild"); }
  catch { esbuild = requireFromModules("vite/node_modules/esbuild"); }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "kd-cleanup-foundation-"));
  const outfile = path.join(temporary, "selection-control.cjs");
  try {
    await esbuild.build({
      stdin: {
        contents: [
          'import React from "react";',
          'import { renderToStaticMarkup } from "react-dom/server";',
          'import { SelectionControl } from "./src/components/SelectionControl.jsx";',
          'export const render = (props) => renderToStaticMarkup(React.createElement(SelectionControl, props));',
        ].join("\n"),
        resolveDir: process.cwd(),
        sourcefile: "cleanup-foundation-selection-entry.jsx",
        loader: "jsx",
      },
      outfile,
      bundle: true,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
      target: "es2022",
      nodePaths: [moduleRoot],
      logLevel: "silent",
    });
    esbuild.stop?.();
    const rendered = requireFromModules(outfile).render({
      id: "owned",
      checked: true,
      label: "Im Besitz",
      description: "Bleibt privat",
    });
    assert.match(rendered, /<label[^>]+for="owned"[^>]+kd-selection-control-hitbox/);
    assert.match(rendered, /<input[^>]+id="owned"[^>]+type="checkbox"[^>]+checked/);
    assert.match(rendered, /aria-describedby="owned-description"/);
    assert.match(rendered, /id="owned-description"[^>]*>Bleibt privat/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
console.log(`cleanup_foundation_test: ${passed}/${tests.length} Checks bestanden.`);

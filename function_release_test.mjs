/* Rein lokaler Vertrag für die Zuordnung eines Function-Artefakts zu Git. */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  deployContractHash,
  releaseInfo,
  sourceHash,
} from "./tools/function-release-info.mjs";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const dateien = [
  "supabase/functions/ai-task/index.ts",
  "supabase/functions/ai-task/providerContract.ts",
  "supabase/functions/ai-task/requestContract.ts",
  "supabase/functions/filmwissen-task/quellen.ts",
  "supabase/functions/filmwissen-task/vertrag.ts",
];
const configDatei = "supabase/config.toml";
const validConfig = Buffer.from(
  '# comment\nproject_id = "bscjgwcntapobyxsiyce"\n\n[functions.ai-task]\nverify_jwt = true\n',
  "utf8",
);
const validSource = new Map(
  dateien.map((datei, index) => [datei, Buffer.from(`inhalt-${index}\n`)]),
);

function makeGitStub({ commit = "a1", source = validSource, config = validConfig, status = {} }) {
  const aufrufe = [];
  const git = (args, opts = {}) => {
    aufrufe.push([args, opts]);
    if (args[0] === "rev-parse") return commit;
    if (args[0] === "status") {
      return status[JSON.stringify(args)] || "";
    }
    if (args[0] === "show") {
      const pfad = args[1].slice(commit.length + 1);
      if (pfad === configDatei) return config;
      const wert = source.get(pfad);
      if (!wert) throw new Error(`Unbekannte Datei: ${pfad}`);
      return wert;
    }
    throw new Error("unerwarteter Git-Aufruf");
  };
  return { git, aufrufe };
}

const statusKey = JSON.stringify([
  "status",
  "--short",
  "--",
  ...dateien,
  configDatei,
]);

const basisRelease = makeGitStub({});
const info = releaseInfo({ git: basisRelease.git });
check(
  "Release-Info verwendet den vollständigen Commit als Build-Version",
  info.commit === "a1" && info.buildVersion === "a1",
);
check("Release-Info gibt exakt die ai-task-Closure in fester Reihenfolge aus", JSON.stringify(info.dateien) === JSON.stringify(dateien));
check("Release-Info enthält configDatei im Output", info.configDatei === configDatei);
check(
  "Release-Info enthält Projektdaten, Funktionsnamen und verifyJwt im Output",
  info.projectId === "bscjgwcntapobyxsiyce" &&
    info.functionName === "ai-task" &&
    info.verifyJwt === true,
);
check(
  "Release-Info hasht exakt diese Closure mit Raw-Byte-Quelle in fester Reihenfolge",
  JSON.stringify(
    basisRelease.aufrufe.filter(([args]) => args[0] === "show").map(([args, opts]) =>
      JSON.stringify({
        args: args[1],
        encoding: opts?.encoding,
      }),
    ),
  ) ===
    JSON.stringify([
      ...dateien.map((datei) =>
        JSON.stringify({
          args: `${info.commit}:${datei}`,
          encoding: null,
        }),
      ),
      JSON.stringify({ args: `${info.commit}:${configDatei}`, encoding: null }),
    ]),
);
check(
  "Dirty-Gate prüft exakt Source-Closure plus Config in einem Status-Aufruf",
  JSON.stringify(
    basisRelease.aufrufe.find(([args]) => args[0] === "status")[0],
  ) === statusKey,
);
check(
  "Alle getrennten Hashes sind 64-stellige SHA-256-Werte",
  [info.sourceSha256, info.configSha256, info.deployContractSha256]
    .every((wert) => /^[0-9a-f]{64}$/.test(wert)),
);
check(
  "Release-Info liefert deterministische Deploy-Hashes",
  releaseInfo({ git: makeGitStub({}).git }).deployContractSha256 ===
    info.deployContractSha256,
);
const configOnlyChanged = new Map(validSource);
const changedConfig = Buffer.from(
  '# comment\nproject_id = "bscjgwcntapobyxsiyce"\n[functions.ai-task]\nverify_jwt = true\n',
  "utf8",
);
const altInfo = releaseInfo({
  git: makeGitStub({ config: changedConfig }).git,
});
check(
  "Config-Byteänderungen ändern configSha256",
  altInfo.configSha256 !== info.configSha256,
);
check(
  "Config-Byteänderung verändert Deploy-Vertrag, nicht Source-Hash",
  altInfo.configSha256 !== info.configSha256 &&
    altInfo.sourceSha256 === info.sourceSha256 &&
    altInfo.deployContractSha256 !== info.deployContractSha256,
);

const sourceBlobA = new Map([
  ["pfad/a.ts", Buffer.from([0x61, 0x62, 0x63])],
  ["pfad/b.ts", Buffer.from([0x64, 0x65, 0x66, 0])],
]);
const sourceBlobB = new Map([
  ["pfad/a.ts", Buffer.from([0x61, 0x62, 0x63, 0x0a])],
  ["pfad/b.ts", Buffer.from([0x64, 0x65, 0x66, 0])],
]);
const sourceBlobC = new Map([
  ["pfad/a.ts", Buffer.from([0x61, 0x62, 0x63])],
  ["pfad/b.ts", Buffer.from([0x64, 0x65, 0x66, 0xff])],
]);
const baseSourceHash = sourceHash([...sourceBlobA.keys()], (datei) => sourceBlobA.get(datei));
check("Fehlender/zusätzlicher LF ändert Source-Hash", sourceHash([...sourceBlobB.keys()], (datei) => sourceBlobB.get(datei)) !== baseSourceHash);
check(
  "Nicht-UTF-8- und NUL-Bytes ändern den Source-Hash bytegenau",
  sourceHash([...sourceBlobC.keys()], (datei) => sourceBlobC.get(datei)) !== baseSourceHash,
);
check(
  "Quellpfad beeinflusst den Hash",
  sourceHash(["pfad/x.ts", "pfad/b.ts"], (datei) => sourceBlobA.get(datei === "pfad/x.ts" ? "pfad/a.ts" : datei)) !== baseSourceHash,
);
check(
  "Reihenfolge beeinflusst den Hash",
  sourceHash(["pfad/b.ts", "pfad/a.ts"], (datei) => sourceBlobA.get(datei)) !== baseSourceHash,
);
check(
  "Quellinhalt beeinflusst den Hash",
  sourceHash([...sourceBlobA.keys()], (datei) =>
    datei === "pfad/a.ts" ? Buffer.from([0x61, 0x62, 0x64]) : sourceBlobA.get(datei),
  ) !== baseSourceHash,
);

const kollisionsA = new Map([
  ["a", Buffer.alloc(0)],
  ["b", Buffer.from("Y\0b\0Z")],
]);
const kollisionsB = new Map([
  ["a", Buffer.from("\0b\0Y")],
  ["b", Buffer.from("Z")],
]);
check(
  "Längenrahmung verhindert Mehrdeutigkeit bei eingebetteten Pfadtrennern",
  sourceHash(["a", "b"], (datei) => kollisionsA.get(datei)) !==
    sourceHash(["a", "b"], (datei) => kollisionsB.get(datei)),
);

for (const dirtyPfad of [...dateien, configDatei]) {
  let gesperrt = false;
  let blobZugriff = false;
  try {
    releaseInfo({
      git(args) {
        if (args[0] === "rev-parse") return "b2";
        if (args[0] === "status" && JSON.stringify(args) === statusKey) {
          return ` M ${dirtyPfad}`;
        }
        blobZugriff = true;
        throw new Error("Dirty-Gate muss vor Blobzugriff sperren");
      },
    });
  } catch {
    gesperrt = true;
  }
  check(`Dirty-Gate sperrt ${dirtyPfad}`, gesperrt && !blobZugriff);
}

function releaseWithConfig(config) {
  return releaseInfo({ git: makeGitStub({ config }).git });
}

let blocked = false;
try {
  releaseWithConfig(Buffer.from('project_id = "andere-id"\n[functions.ai-task]\nverify_jwt = true\n'));
} catch {
  blocked = true;
}
check("Falsche Projekt-ID wird blockiert", blocked);

blocked = false;
try {
  releaseWithConfig(Buffer.from('[other]\nproject_id = "bscjgwcntapobyxsiyce"\n[functions.ai-task]\nverify_jwt = true\n'));
} catch {
  blocked = true;
}
check("Projekt-ID außerhalb des Top-Levels wird blockiert", blocked);

blocked = false;
try {
  releaseWithConfig(Buffer.from("[functions.ai-task]\nverify_jwt = true\n"));
} catch {
  blocked = true;
}
check("Fehlende Projekt-ID wird blockiert", blocked);

blocked = false;
try {
  releaseWithConfig(Buffer.from('project_id = "bscjgwcntapobyxsiyce"\n[functions.ai-task]\nverify_jwt = "true"\n'));
} catch {
  blocked = true;
}
check("String-förmiges verify_jwt wird blockiert", blocked);

blocked = false;
try {
  releaseWithConfig(Buffer.from('project_id = "bscjgwcntapobyxsiyce"\n[functions.ai-task]\nverify_jwt = false\n'));
} catch {
  blocked = true;
}
check("Falsches verify_jwt wird blockiert", blocked);

blocked = false;
try {
  releaseWithConfig(Buffer.from('project_id = "bscjgwcntapobyxsiyce"\n[functions.ai-task]\n'));
} catch {
  blocked = true;
}
check("Fehlendes verify_jwt wird blockiert", blocked);

blocked = false;
try {
  releaseWithConfig(Buffer.from('project_id = "bscjgwcntapobyxsiyce"\n[functions.other]\nverify_jwt = true\n'));
} catch {
  blocked = true;
}
check("fehlende [functions.ai-task] wird blockiert", blocked);

const duplicateSectionConfig = Buffer.from(
  'project_id = "bscjgwcntapobyxsiyce"\n[functions.ai-task]\nverify_jwt = true\n[functions.ai-task]\nverify_jwt = true\n',
);
blocked = false;
try {
  releaseWithConfig(duplicateSectionConfig);
} catch {
  blocked = true;
}
check("doppelte Functions-sektion blockiert", blocked);

const duplicateVerifyJwtConfig = Buffer.from(
  'project_id = "bscjgwcntapobyxsiyce"\n[functions.ai-task]\nverify_jwt = true\nverify_jwt = true\n',
);
blocked = false;
try {
  releaseWithConfig(duplicateVerifyJwtConfig);
} catch {
  blocked = true;
}
check("Doppeltes verify_jwt wird blockiert", blocked);

const duplicateProjectIdConfig = Buffer.from(
  'project_id = "bscjgwcntapobyxsiyce"\nproject_id = "bscjgwcntapobyxsiyce"\n[functions.ai-task]\nverify_jwt = true\n',
);
blocked = false;
try {
  releaseWithConfig(duplicateProjectIdConfig);
} catch {
  blocked = true;
}
check("doppelte project_id blockiert", blocked);

check(
  "Deploy-Vertrag weicht bei Configwechsel erwartungsgemäß",
  releaseWithConfig(changedConfig).deployContractSha256 !== info.deployContractSha256,
);

const runbook = readFileSync(
  new URL("./docs/FUNCTION_RELEASES.md", import.meta.url),
  "utf8",
);
const deployPosition = runbook.indexOf("npx supabase functions deploy ai-task");
const secretPosition = runbook.indexOf("&& npx supabase secrets set");
const versionPosition = runbook.indexOf(
  "KD_FUNCTION_BUILD_VERSION=\"$KD_FUNCTION_COMMIT\"",
  secretPosition,
);
check(
  "Release-Runbook deployt Code vor dem sofort wirksamen Build-Version-Secret",
  deployPosition >= 0 && secretPosition > deployPosition && versionPosition > secretPosition,
);

const canonicalDeployFields = {
  projectId: "bscjgwcntapobyxsiyce",
  functionName: "ai-task",
  verifyJwt: true,
  sourceSha256: info.sourceSha256,
  configSha256: info.configSha256,
};
const canonicalDeployHash = () => createHash("sha256")
  .update(
    [
      "version=release-contract-v1\n",
      `projectId=${canonicalDeployFields.projectId}\n`,
      `functionName=${canonicalDeployFields.functionName}\n`,
      `verifyJwt=${canonicalDeployFields.verifyJwt}\n`,
      `sourceSha256=${canonicalDeployFields.sourceSha256}\n`,
      `configSha256=${canonicalDeployFields.configSha256}\n`,
    ].join(""),
    "utf8",
  )
  .digest("hex");
check(
  "Deploy-Contract-Hash ist reproduzierbar aus der versionierten Canonical-Form",
  info.deployContractSha256 === canonicalDeployHash(),
);
for (const [feld, wert] of [
  ["projectId", "anderes-projekt"],
  ["functionName", "andere-function"],
  ["verifyJwt", false],
]) {
  check(
    `Deploy-Contract-Hash bindet ${feld}`,
    deployContractHash({ ...canonicalDeployFields, [feld]: wert }) !==
      info.deployContractSha256,
  );
}

console.log(`function_release_test: ${ok} Checks bestanden.`);

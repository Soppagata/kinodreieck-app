/* Rein lokaler Vertrag für die Zuordnung eines Function-Artefakts zu Git. */

import { readFileSync } from "node:fs";
import { releaseInfo, sourceHash } from "./tools/function-release-info.mjs";

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
const statusArgs = ["status", "--short", "--", ...dateien];
const aufrufe = [];
function gitSauber(args) {
  aufrufe.push(args);
  if (args[0] === "rev-parse") return "a1";
  if (args[0] === "status") return "";
  if (args[0] === "show") return `Inhalt von ${args[1]}`;
  throw new Error("unerwarteter Git-Aufruf");
}
const info = releaseInfo({ git: gitSauber });
check("Release-Info verwendet den vollständigen Git-Commit als Build-Version",
  info.commit === "a1" && info.buildVersion === "a1");
check("Release-Info gibt exakt die ai-task-Closure in fester Reihenfolge aus",
  JSON.stringify(info.dateien) === JSON.stringify(dateien));
check("Release-Info hasht exakt diese Closure in fester Reihenfolge",
  JSON.stringify(aufrufe.filter(([befehl]) => befehl === "show"))
    === JSON.stringify(dateien.map((datei) => ["show", `a1:${datei}`])));
check("Release-Info verwendet SHA-256",
  /^[0-9a-f]{64}$/.test(info.sourceSha256));
check("Identischer Commit und identische Inhalte ergeben denselben Hash",
  releaseInfo({ git: gitSauber }).sourceSha256 === info.sourceSha256);
check("Dirty-Gate prüft exakt die ai-task-Closure",
  JSON.stringify(aufrufe.find(([befehl]) => befehl === "status"))
    === JSON.stringify(statusArgs));

let gesperrt = false;
let dirtyStatusArgs;
try {
  releaseInfo({
    git(args) {
      if (args[0] === "rev-parse") return "b2";
      if (args[0] === "status") {
        dirtyStatusArgs = args;
        return JSON.stringify(args) === JSON.stringify(statusArgs)
          ? " M supabase/functions/ai-task/index.ts"
          : "";
      }
      return "";
    },
  });
} catch {
  gesperrt = true;
}
check("Nicht committierte Quellen aus exakt dieser Closure sperren",
  gesperrt && JSON.stringify(dirtyStatusArgs) === JSON.stringify(statusArgs));

const hashDateien = ["pfad/a.ts", "pfad/b.ts"];
const hashInhalte = new Map([
  ["pfad/a.ts", "Inhalt A"],
  ["pfad/b.ts", "Inhalt B"],
]);
const basisHash = sourceHash(hashDateien, (datei) => hashInhalte.get(datei));
check("Die Reihenfolge der Quellen beeinflusst den Hash",
  sourceHash([...hashDateien].reverse(), (datei) => hashInhalte.get(datei))
    !== basisHash);
check("Der Quellpfad beeinflusst den Hash",
  sourceHash(["pfad/x.ts", "pfad/b.ts"], (datei) => (
    datei === "pfad/x.ts" ? "Inhalt A" : hashInhalte.get(datei)
  )) !== basisHash);
check("Der Quellinhalt beeinflusst den Hash",
  sourceHash(hashDateien, (datei) => (
    datei === "pfad/a.ts" ? "Geänderter Inhalt A" : hashInhalte.get(datei)
  )) !== basisHash);

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
  deployPosition >= 0
    && secretPosition > deployPosition
    && versionPosition > secretPosition,
);

console.log(`function_release_test: ${ok} Checks bestanden.`);

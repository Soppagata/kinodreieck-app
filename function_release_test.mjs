/* Rein lokaler Vertrag für die Zuordnung eines Function-Artefakts zu Git. */

import { readFileSync } from "node:fs";
import { releaseInfo } from "./tools/function-release-info.mjs";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const inhalte = new Map([
  ["a1:commit", "a1"],
  ["a1:status", ""],
]);
const info = releaseInfo({
  git(args) {
    if (args[0] === "rev-parse") return inhalte.get("a1:commit");
    if (args[0] === "status") return inhalte.get("a1:status");
    if (args[0] === "show") return `Inhalt von ${args[1]}`;
    throw new Error("unerwarteter Git-Aufruf");
  },
});
check("Release-Info verwendet den vollständigen Git-Commit als Build-Version",
  info.commit === "a1" && info.buildVersion === "a1");
check("Release-Info bindet alle Function-Quellen in einen SHA-256",
  info.dateien.length === 6
  && info.dateien.includes("supabase/functions/account-self-service/index.ts")
  && /^[0-9a-f]{64}$/.test(info.sourceSha256));

let gesperrt = false;
try {
  releaseInfo({
    git(args) {
      if (args[0] === "rev-parse") return "b2";
      if (args[0] === "status") return " M supabase/functions/ai-task/index.ts";
      return "";
    },
  });
} catch {
  gesperrt = true;
}
check("Nicht committierte Function-Quellen sind nicht deployfähig", gesperrt);

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

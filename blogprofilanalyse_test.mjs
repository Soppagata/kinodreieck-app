/* Etappe 8, Phase 2b — Capability-Prüfung für blog-profile-extract in der
   Health-Ansicht.
   -------------------------------------------------------------------------
   Fokus: pure Logik, ausschließlich fail-closed. Es wird nur geprüft, ob die
   spätere UI den neuen Pfad sicher aktivieren darf. Kein Netz, keine KI, kein
   Storage und keine Nebenwirkungen.
*/

import { hatBlogProfileAnalyseCapability } from "./src/lib/blogProfilAnalyse.js";

const ok = [];
const rot = [];

const check = (name, wert) => {
  if (wert) {
    ok.push(name);
    console.log("✓", name);
    return;
  }
  rot.push(name);
  console.log("✗", name);
};

const BASIS_HEALTH = {
  ok: true,
  task: "health",
  vorgangId: "00000000-0000-4000-8000-000000000001",
  phase: "etappe-5",
  contractVersion: "ai-task-v5",
  buildVersion: "unversioned",
  laufzeit: { deno: "2.0", region: "eu" },
  schluesselHerkunft: { oeffentlich: "pub", geheim: "sec" },
  anbieterSecretGesetzt: true,
  aufrufer: { rolle: "member", fachrolle: "owner", weg: "token", accountIdVorhanden: true },
  betrieb: { aiAktiv: true },
  zeit: "2026-08-17T06:00:00.000Z",
  capabilities: {
    blogProfileExtract: {
      ready: true,
      task: "blog-profile-extract",
      promptVersion: "blog-profile-v1",
      modelAlias: "klein",
      maxTokens: 2048,
      taskMaxReservationUsdCent: 5,
    },
  },
};

const mit = (mutator) => {
  const kopie = structuredClone(BASIS_HEALTH);
  mutator(kopie);
  return kopie;
};

check("gültige, erwartete Health-Antwort wird akzeptiert", hatBlogProfileAnalyseCapability(BASIS_HEALTH));
check("missing old fields failen: contractVersion fehlt",
  !hatBlogProfileAnalyseCapability(mit((h) => { delete h.contractVersion; })));
check("ok !== true failt", !hatBlogProfileAnalyseCapability(mit((h) => { h.ok = false; })));
check("task != \"health\" failt", !hatBlogProfileAnalyseCapability(mit((h) => { h.task = "other"; })));
check("contractVersion != \"ai-task-v5\" failt", !hatBlogProfileAnalyseCapability(mit((h) => { h.contractVersion = "ai-task-v4"; })));
check("betrieb.aiAktiv !== true failt", !hatBlogProfileAnalyseCapability(mit((h) => { h.betrieb.aiAktiv = false; })));
check("fehlt capabilities.blogProfileExtract", !hatBlogProfileAnalyseCapability(mit((h) => { delete h.capabilities.blogProfileExtract; })));
check("falscher capability.task failt", !hatBlogProfileAnalyseCapability(mit((h) => { h.capabilities.blogProfileExtract.task = "other"; })));
check("falscher promptVersion failt", !hatBlogProfileAnalyseCapability(mit((h) => { h.capabilities.blogProfileExtract.promptVersion = "v1"; })));
check("stringer maxTokens failt", !hatBlogProfileAnalyseCapability(mit((h) => { h.capabilities.blogProfileExtract.maxTokens = "2048"; })));
check("stringer taskMaxReservationUsdCent failt", !hatBlogProfileAnalyseCapability(mit((h) => { h.capabilities.blogProfileExtract.taskMaxReservationUsdCent = "5"; })));
check("null in capability.taskMaxReservationUsdCent failt", !hatBlogProfileAnalyseCapability(mit((h) => { h.capabilities.blogProfileExtract.taskMaxReservationUsdCent = null; })));
check("Zusatzfeld auf Root wird nicht toleriert", !hatBlogProfileAnalyseCapability(mit((h) => { h.data = {}; })));
check("Zusatzfeld bei capabilities.blogProfileExtract wird nicht toleriert",
  !hatBlogProfileAnalyseCapability(mit((h) => {
    h.capabilities.blogProfileExtract.extra = "nope";
  })));
check("Zusatzfeld in capabilities wird nicht toleriert", !hatBlogProfileAnalyseCapability(mit((h) => {
  h.capabilities.extra = { ready: true };
})));

console.log("\\nErgebnis:", ok.length, "ok,", rot.length, "offen");
if (rot.length > 0) {
  console.error("Fehlgeschlagene Checks:", rot.join(" | "));
  process.exit(1);
}

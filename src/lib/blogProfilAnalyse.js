const istObjekt = (wert) => !!wert && typeof wert === "object" && !Array.isArray(wert);

const exaktSchluessel = (wert, schluessel) => istObjekt(wert)
  && Object.keys(wert).length === schluessel.length
  && schluessel.every((name) => Object.prototype.hasOwnProperty.call(wert, name));

const istText = (wert) => typeof wert === "string" && wert.length > 0;
const istGanzzahl = (wert) => Number.isInteger(wert);

const HEALTH_ROOT_KEYS = Object.freeze([
  "ok",
  "task",
  "vorgangId",
  "phase",
  "contractVersion",
  "buildVersion",
  "laufzeit",
  "schluesselHerkunft",
  "anbieterSecretGesetzt",
  "aufrufer",
  "betrieb",
  "zeit",
  "capabilities",
]);

const BLOG_PROFILE_EXTRACT_KEYS = Object.freeze([
  "ready",
  "task",
  "promptVersion",
  "modelAlias",
  "maxTokens",
  "taskMaxReservationUsdCent",
]);

/* Fail-closed für die spätere UI: nur exakt den erwarteten Vertrag.
   - keine data-hülle
   - keine Zusatzfelder
   - keine Typ-Umdeutung (Stringzahlen usw. sind ungültig)
   - betrieb.aiAktiv muss explizit true sein
   - capabilities.blogProfileExtract muss exakt vorliegen
 */
export function hatBlogProfileAnalyseCapability(healthAntwort) {
  if (!exaktSchluessel(healthAntwort, HEALTH_ROOT_KEYS)) return false;
  if (healthAntwort.ok !== true) return false;
  if (healthAntwort.task !== "health") return false;
  if (healthAntwort.contractVersion !== "ai-task-v5") return false;
  if (!istText(healthAntwort.vorgangId)) return false;
  if (!istText(healthAntwort.phase)) return false;
  if (!istText(healthAntwort.buildVersion)) return false;
  if (!istText(healthAntwort.zeit)) return false;
  if (!istObjekt(healthAntwort.laufzeit)
    || !istObjekt(healthAntwort.schluesselHerkunft)
    || !istObjekt(healthAntwort.aufrufer)) return false;

  if (!istObjekt(healthAntwort.betrieb)
    || healthAntwort.betrieb.aiAktiv !== true) return false;

  if (!exaktSchluessel(healthAntwort.capabilities, ["blogProfileExtract"])) return false;
  if (!exaktSchluessel(healthAntwort.capabilities.blogProfileExtract, BLOG_PROFILE_EXTRACT_KEYS)) return false;
  const eintrag = healthAntwort.capabilities.blogProfileExtract;

  if (eintrag.ready !== true) return false;
  if (eintrag.task !== "blog-profile-extract") return false;
  if (eintrag.promptVersion !== "blog-profile-v1") return false;
  if (eintrag.modelAlias !== "klein") return false;
  if (eintrag.maxTokens !== 2048 || !istGanzzahl(eintrag.maxTokens)) return false;
  if (eintrag.taskMaxReservationUsdCent !== 5 || !istGanzzahl(eintrag.taskMaxReservationUsdCent)) return false;

  return true;
}

export const BLOG_PROFILE_CAPABILITY_KEYS = BLOG_PROFILE_EXTRACT_KEYS;

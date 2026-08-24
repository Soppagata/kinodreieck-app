/* Reiner Vertrag fuer die GitHub-Deployment-Metadaten des manuellen
   Staging-Workflows. Keine API-, Cloudflare- oder GitHub-Wirkung. */

const COMMIT_FORM = /^[0-9a-f]{40}$/;
const EXPECTED_ENVIRONMENTS = Object.freeze(["preview", "staging"]);

export class DeploymentEffectContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DeploymentEffectContractError";
    this.code = code;
  }
}

function stop(code, message) {
  throw new DeploymentEffectContractError(code, message);
}

export function pruefeStagingWorkflowDeploymentEffects({
  expectedHead,
  expectedRunId,
  records,
} = {}) {
  if (!COMMIT_FORM.test(String(expectedHead || ""))
      || !(typeof expectedRunId === "string" || Number.isSafeInteger(expectedRunId))
      || String(expectedRunId).trim() === "" || !Array.isArray(records)) {
    stop("WORKFLOW_EFFECT_INPUT_INVALID", "Workflow-Effektbeleg ist formfremd.");
  }
  const normalized = records.map((record) => ({
    head: String(record?.head || "").toLowerCase(),
    runId: String(record?.runId ?? ""),
    environment: String(record?.environment || "").trim().toLowerCase(),
    state: String(record?.state || "").trim().toLowerCase(),
  }));
  if (normalized.some((record) => record.head !== expectedHead
      || record.runId !== String(expectedRunId))) {
    stop("WORKFLOW_EFFECT_SCOPE_DRIFT", "Deployment-Metadaten gehoeren nicht exakt zu Lauf und HEAD.");
  }

  const productionCount = normalized.filter(({ environment }) => environment === "production").length;
  const environments = normalized.map(({ environment }) => environment).sort();
  if (productionCount !== 0
      || JSON.stringify(environments) !== JSON.stringify(EXPECTED_ENVIRONMENTS)
      || normalized.some(({ state }) => state !== "success")) {
    stop(
      "WORKFLOW_EFFECT_DRIFT",
      "Staging erwartet genau erfolgreiche Preview- und Staging-Metadaten ohne Production.",
    );
  }
  return Object.freeze({
    ok: true,
    head: expectedHead,
    runId: String(expectedRunId),
    preview: 1,
    staging: 1,
    production: 0,
  });
}

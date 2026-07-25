import { runtimeConfig } from "../config/runtime.js";
import { authService } from "./auth.js";
import { BoundaryError, ERROR_CODES, errorFromStatus, normalizeBoundaryError } from "./errors.js";

export const AI_TASKS = Object.freeze(["intelligent-search", "masterlist-enrichment"]);

export function createAiService({ auth = authService, config = runtimeConfig, transport } = {}) {
  const send = transport || (async () => {
    throw new BoundaryError(ERROR_CODES.SERVER, {
      source: "ai", operation: "task.run", reason: "transport-not-configured",
    });
  });
  return Object.freeze({
    async runTask(task, payload, options = {}) {
      if (!AI_TASKS.includes(task) || !payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
          source: "ai", operation: "task.validate", reason: "invalid-task-or-payload",
        });
      }
      const session = auth.requireAccount("personalAi");
      try {
        const result = await send({
          endpointName: config.aiEndpointName,
          schemaVersion: config.schemaVersion,
          task,
          payload,
          accountId: session.account.id,
          signal: options.signal,
        });
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
            source: "ai", operation: "task.decode", reason: "non-object-response",
          });
        }
        if (result.ok === false && Number.isFinite(result.status)) {
          throw errorFromStatus(result.status, { source: "ai", operation: "task.run" });
        }
        return result;
      } catch (error) {
        throw normalizeBoundaryError(error, { source: "ai", operation: "task.run" });
      }
    },
  });
}

export const aiService = createAiService();

import toolContract from "../contracts/tool-schemas.json" with { type: "json" };
import { CONTRACT_VERSION, OPERATIONS } from "./operations.mjs";
import { KdApiError } from "./client.mjs";

const TOOL_BY_NAME = new Map(toolContract.tools.map((tool) => [tool.name, tool]));
const PRIVILEGED_PREFIXES = ["ai_", "usage_", "requests_", "backend_"];

function clone(value) {
  return structuredClone(value);
}

function resolvedSchema(tool) {
  const ref = tool.inputSchema?.$ref;
  if (!ref) return clone(tool.inputSchema);
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!match || !toolContract.$defs[match[1]]) throw new Error(`Unresolvable schema for ${tool.name}`);
  return clone(toolContract.$defs[match[1]]);
}

export const ALL_TOOLS = Object.freeze(toolContract.tools.map((tool) => Object.freeze({
  name: tool.name,
  description: tool.description,
  inputSchema: resolvedSchema(tool),
})));

export function assertCompleteOperationMap() {
  const schemaNames = [...TOOL_BY_NAME.keys()].sort();
  const operationNames = Object.keys(OPERATIONS).sort();
  if (JSON.stringify(schemaNames) !== JSON.stringify(operationNames)) {
    throw new Error("Tool schemas and HTTP operation mapping differ.");
  }
}

function isPrivileged(name) {
  return PRIVILEGED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function filterToolsForCapabilities(capabilities) {
  if (capabilities?.contractVersion !== CONTRACT_VERSION) throw new KdApiError({ title: "Capability contract version differs", code: "CAPABILITY_MISMATCH" });
  if (!["personal_owner_assistant", "member_assistant"].includes(capabilities?.identity)) {
    throw new KdApiError({ title: "Capability identity is not an assistant identity", code: "CAPABILITY_MISMATCH" });
  }
  if (!Array.isArray(capabilities.tools) || new Set(capabilities.tools).size !== capabilities.tools.length) {
    throw new KdApiError({ title: "Capability tool list is invalid", code: "CAPABILITY_MISMATCH" });
  }
  const offered = [];
  for (const name of capabilities.tools) {
    const contract = TOOL_BY_NAME.get(name);
    if (!contract) throw new KdApiError({ title: "Capability tool is unknown", code: "CAPABILITY_MISMATCH" });
    if (!contract.identities.includes(capabilities.identity)) {
      throw new KdApiError({ title: "Capability tool exceeds the effective identity", code: "CAPABILITY_MISMATCH" });
    }
    if (capabilities.identity === "member_assistant" && isPrivileged(name)) {
      throw new KdApiError({ title: "Member capability contains a privileged tool", code: "CAPABILITY_MISMATCH" });
    }
    offered.push(ALL_TOOLS.find((tool) => tool.name === name));
  }
  if (!offered.some((tool) => tool.name === "capabilities_get")) {
    throw new KdApiError({ title: "Capability inspection tool is missing", code: "CAPABILITY_MISMATCH" });
  }
  return Object.freeze(offered);
}

export async function discoverTools(client) {
  const response = await client.capabilities();
  return { capabilities: response.data, tools: filterToolsForCapabilities(response.data) };
}

export async function invokeTool(client, name, input = {}) {
  const { capabilities, tools } = await discoverTools(client);
  if (!tools.some((tool) => tool.name === name)) {
    throw new KdApiError({ title: "Tool is not currently permitted", code: "FORBIDDEN", status: 403 });
  }
  const response = await client.call(name, input);
  const result = {
    operation: name,
    identity: capabilities.identity,
    result: response.data,
    http: { status: response.status, etag: response.etag, revision: response.revision },
  };
  if (name === "library_export_selection") {
    result.targetEffect = {
      performed: false,
      action: input.format === "text" ? "copy_to_clipboard" : "save_json_file",
      responsibility: "calling_client",
    };
  }
  return result;
}

assertCompleteOperationMap();

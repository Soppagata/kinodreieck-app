import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { discoverTools, invokeTool } from "./tools.mjs";

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function safeError(error) {
  const value = typeof error?.toJSON === "function"
    ? error.toJSON()
    : { name: "Error", code: "ADAPTER_ERROR", message: error?.message || "Tool call failed" };
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], isError: true };
}

export function createKdMcpServer({ client } = {}) {
  if (!client) throw new TypeError("client is required.");
  const server = new Server(
    { name: "kinodreieck", version: "0.1.0" },
    { capabilities: { tools: { listChanged: false } }, instructions: "Kinodreieck tools are filtered from freshly checked server capabilities before every listing and call." },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const { tools } = await discoverTools(client);
    return { tools };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return toolResult(await invokeTool(client, request.params.name, request.params.arguments || {}));
    } catch (error) {
      return safeError(error);
    }
  });
  return server;
}

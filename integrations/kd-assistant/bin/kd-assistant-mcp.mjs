#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCredentialProvider, createKdApiClient, createKdMcpServer } from "../src/index.mjs";

async function main() {
  const client = createKdApiClient({
    baseUrl: process.env.KD_API_BASE_URL,
    credential: createCredentialProvider(process.env),
  });
  const server = createKdMcpServer({ client });
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  process.stderr.write(`kd-assistant-mcp: ${error?.message || "startup failed"}\n`);
  process.exitCode = 1;
});

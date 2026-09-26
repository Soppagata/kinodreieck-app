#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { createCredentialProvider, createKdApiClient } from "../src/index.mjs";

export async function runSelectionExample(client, { query = "", count = 3 } = {}) {
  const page = await client.call("library_search", { query, limit: Math.max(1, Math.min(100, count)) });
  const ids = (page.data?.items || []).slice(0, count).map((entry) => entry.id);
  if (!ids.length) throw new Error("No readable library entries matched the selection.");
  const [text, json] = await Promise.all([
    client.call("library_export_selection", { ids, format: "text" }),
    client.call("library_export_selection", { ids, format: "json" }),
  ]);
  return {
    selectedIds: ids,
    text: text.data,
    json: json.data,
    targetEffects: {
      text: { performed: false, action: "copy_to_clipboard", responsibility: "calling_client" },
      json: { performed: false, action: "save_json_file", responsibility: "calling_client" },
    },
  };
}

async function main() {
  const client = createKdApiClient({
    baseUrl: process.env.KD_API_BASE_URL,
    credential: createCredentialProvider(process.env),
  });
  const result = await runSelectionExample(client, { query: process.argv[2] || "", count: Number(process.argv[3] || 3) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error?.code || "ERROR"}: ${error?.message || "selection failed"}\n`);
    process.exitCode = 1;
  });
}

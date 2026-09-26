#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createCredentialProvider, createKdApiClient } from "../src/index.mjs";

export async function runBlogFlowExample(client, {
  initialRevision,
  title = "Beispielentwurf",
  text = "Ein privater Entwurf.",
  anonymous = false,
} = {}) {
  if (!Number.isInteger(initialRevision) || initialRevision < 0) {
    throw new TypeError("initialRevision must be the last confirmed non-negative blog revision.");
  }
  const created = await client.call("blog_draft_create", {
    operationId: randomUUID(), expectedRevision: initialRevision, value: { titel: title, text },
  });
  const draftId = created.data?.entity?.id;
  if (!draftId) throw new Error("Create result did not contain a draft ID.");
  const updated = await client.call("blog_draft_update", {
    id: draftId, operationId: randomUUID(), expectedRevision: created.data.revision,
    patch: { text: `${text}\n\nAktualisiert.` },
  });
  const published = await client.call("blog_publish", {
    id: draftId, operationId: randomUUID(), expectedRevision: updated.data.revision, anonymous,
  });
  const publicationId = published.data?.entity?.id;
  if (!publicationId) throw new Error("Publish result did not contain a publication ID.");
  const unpublished = await client.call("blog_unpublish", {
    id: publicationId, operationId: randomUUID(), expectedRevision: published.data.revision,
  });
  const removed = await client.call("blog_draft_remove", {
    id: draftId, operationId: randomUUID(), expectedRevision: unpublished.data.revision,
  });
  return { draftId, publicationId, created: created.data, updated: updated.data, published: published.data, unpublished: unpublished.data, removed: removed.data };
}

async function main() {
  const revision = Number(process.env.KD_BLOG_REVISION);
  const client = createKdApiClient({
    baseUrl: process.env.KD_API_BASE_URL,
    credential: createCredentialProvider(process.env),
  });
  process.stdout.write(`${JSON.stringify(await runBlogFlowExample(client, { initialRevision: revision }), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${error?.code || "ERROR"}: ${error?.message || "blog flow failed"}\n`);
    process.exitCode = 1;
  });
}

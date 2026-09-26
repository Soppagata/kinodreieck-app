# Kinodreieck assistant adapter

This package provides a model-independent HTTP client and a standard MCP stdio
server for the frozen `kd-api-v1` contract. It never automates the Kinodreieck
UI, chooses a model, or implements an assistant of its own.

## Install and configure

Install the package in a protected local directory with Node.js 20 or newer.
Set `KD_API_BASE_URL` to the complete logical base from the deployment contract,
including its final `/v1`, for example:

```text
https://<project>.supabase.co/functions/v1/kd-api/v1
```

The client accepts exactly one credential source:

- `KD_API_KEY`: a deliberately inherited process environment value;
- `KD_API_KEY_FILE`: an owner-only file (`0600` or stricter on Unix); or
- `KD_API_KEYCHAIN_SERVICE=at.kinodreieck.kd-api.access-v1` plus
  `KD_API_KEYCHAIN_ACCOUNT=<issued alias>`: the active macOS Keychain item
  written by `tools/kd-api-keychain.mjs` and read directly by the adapter.

Keys must never be pasted into prompts, MCP configuration committed to Git,
tool arguments, tool results, or logs. `tools/kd-api-keychain.mjs` owns issue,
rotate, and revoke. Its active alias entry is a `kd-api-keychain-v1` JSON
envelope. The adapter validates its version, alias, `issue`/`rotate` command,
active RPC metadata, expiry, epoch and key fingerprint, then uses only
`rawKey` as the Bearer credential. Pending entries (`::issue-pending`,
`::rotate-pending`, `::revoke-pending`) and the `::revoked` tombstone are never
accepted as active credentials. Rotation invalidates the old key; restart the
stdio process so the next request reads the rotated active alias entry.
Revocation is terminal until a separately issued access is configured.

For the personal Owner assistant, configure the Owner access's own Keychain
item. For a colleague, configure that person's separate Member access and
Keychain item. Never share one key between them. The adapter reads
`GET /capabilities` before every tool listing and every call. It exposes only
the intersection of the server's current list, the frozen schema, and the
effective identity. A Member can never receive `ai_*`, `usage_*`, `requests_*`
or `backend_*` tools.

## Local Codex MCP setup

The current Codex CLI supports adding a stdio server with `codex mcp add` and
shares MCP configuration with the IDE. The official setup pattern is described
in [OpenAI's MCP documentation](https://developers.openai.com/learn/docs-mcp).
After installing this package, run the following locally with your real paths
and non-secret Keychain labels. This is an example only; the package never
changes Codex configuration itself.

```sh
codex mcp add kinodreieck \
  --env KD_API_BASE_URL=https://PROJECT.supabase.co/functions/v1/kd-api/v1 \
  --env KD_API_KEYCHAIN_SERVICE=at.kinodreieck.kd-api.access-v1 \
  --env KD_API_KEYCHAIN_ACCOUNT=owner-assistant \
  -- /absolute/path/to/node /absolute/path/to/@kinodreieck/kd-assistant/bin/kd-assistant-mcp.mjs

codex mcp list
```

Use a separate MCP entry and the Member Keychain account for the colleague.
Do not use `--env KD_API_KEY=...`, because command history and configuration
would contain the raw key.

## HTTP client

```js
import { createCredentialProvider, createKdApiClient } from "@kinodreieck/kd-assistant";

const client = createKdApiClient({
  baseUrl: process.env.KD_API_BASE_URL,
  credential: createCredentialProvider(process.env),
});

const page = await client.call("library_search", { query: "Alien", limit: 20 });
console.log(page.data.items, page.revision);
```

Every write requires the last confirmed `expectedRevision` and a stable UUID
`operationId`. The client sends them as `If-Match` and `Idempotency-Key` and
does not retry writes, AI jobs, or any other request. After an unclear network
outcome, inspect the known resource or job with the same operation/job identity;
do not generate a new write blindly. Structured API failures are thrown as
`KdApiError` with safe `code`, `requestId`, `operationId`, `currentRevision`,
and `retryable` fields.

## Executable examples

`node examples/selection.mjs [query] [count]` searches readable library entries
and requests both text and JSON projections. Returned content is separate from
`targetEffects`: clipboard copying and file saving remain actions of the calling
device and are reported as `performed: false`.

`KD_BLOG_REVISION=<confirmed revision> node examples/blog-flow.mjs` executes the
full deliberate flow: create private draft, update, publish, unpublish, and
remove the retained draft. Each step uses the prior confirmed revision and a
new idempotency key; there is no retry loop.

## Package contract and evidence boundary

The published package includes exact copies of `tool-schemas.json`,
`operation-map.json`, and `openapi.yaml`, exported under `./contracts/*` so it
remains installable outside this repository. The repository originals are the
frozen source of truth.

`npm test` runs the package's single bundled mock control for Owner and Member,
all mapped routes, structured failures, revisions/idempotency, selection, the
complete blog flow, and a real MCP SDK stdio client talking to this server.
That proves the adapter transport against a mock API. It does not prove a real
LLM, colleague setup, B1 backend integration, provider request, or iPhone use;
those are separate E6/device checks.

# E6 local final evidence

`client-api-db.test.mjs` starts and stops a disposable PostgreSQL 17 cluster,
the real `kd-api` HTTP handler, a local Supabase REST transport backed by that
database, and the real `ai-task` handler. Only the Anthropic provider boundary
is replaced by a deterministic fixture. No operator URL, key, or environment
switch is needed.

It covers the 39 domain tools plus capability inspection, roles and account
boundaries, revisions and replay, exports and import, Blog v3, diagnostics,
AI dispatch, B3 key lifecycle, B2 credential/client/tools/MCP, Git-bound
release hashes, JWT boundaries, and closed/open version readback.

The delivery message records the authoritative command and exit evidence after
`npm run test:kd-api:final` runs against the committed harness.

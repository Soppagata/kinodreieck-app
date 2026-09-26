# E6 local final evidence

Tested integrated base: `3e3d4686ef49934271fbdad833064cf40c29899c`.
Tested code candidate after targeted repairs:
`1ef5b159f85c6a4a18931900cb3da11eb63dae1d`. The evidence-only commit that
contains this report does not alter the tested code.

`client-api-db.test.mjs` starts and stops a disposable PostgreSQL 17 cluster,
the real `kd-api` HTTP handler, a local Supabase REST transport backed by that
database, and the real `ai-task` handler. Only the Anthropic provider boundary
is replaced by a deterministic fixture. No operator URL, key, or environment
switch is needed.

The connected test covers 40 operations: the 39 frozen domain tools plus
`capabilities_get`. It covers media CRUD and series progress, Must-Watch,
selection text/JSON with stable IDs and field allowlists, settings, account
export, package preview/apply, private and shared Blog v3, schedule/radar,
personal AI/job status, and diagnostics. Its negative paths include anonymous,
member, inactive, demoted, revoked, rotated, and foreign-account credentials;
revision/PWA conflicts; same and changed idempotency payloads; indirect AI
denial; and hidden operational numbers.

The same test uses the real B2 credential/client/tool/MCP exports and the B3
in-memory synthetic key lifecycle. It verifies Git-bound release hashes for
`kd-api` and `ai-task`, their distinct JWT modes, and closed/open local
`_meta/version` readback. It made exactly one deterministic provider-boundary
fixture call and no remote, live-provider, or macOS Keychain call.

## Command evidence

The frozen `npm run test:kd-api:final` was started once. It preserved green
contract and backend results, then stopped with exit 1 when the sandbox denied
PostgreSQL `shmget` before the DB stage could run. Per the E6 rule, already
green stages were not repeated. Remaining stages and invalidated evidence were
continued narrowly:

- `npm run test:kd-api:db` outside the sandbox: exit 0, 15 checks.
- `npm run test:kd-api:assistant` outside the sandbox: exit 0, 13/13.
- `npm run test:kd-api:release`: exit 0, 12/12.
- B3 manifest delta `729ef76083ec8c91f4f67fee2b063c91be84413d`
  (cherry-picked as `259ef8d`): focused nested-migration fixtures 2/2, exit 0;
  the connected release-manifest path then passed in integration.
- `npm run test:kd-api:integration` outside the sandbox after the targeted
  harness and lifecycle repairs: exit 0, 1/1 connected test.
- `node live_function_readback_test.mjs` outside the sandbox after adding the
  new `kd-api` slug to the deployable-function inventory: exit 0, 12/12 plus
  its imported local PostgreSQL contract groups.
- `node profil_test.mjs` after accepting F0's injectable deterministic package
  timestamp while retaining the profile exclusion: exit 0, 308/308.
- The `npm test` command sequence was resumed only at each first unstarted
  command after those two repaired expectations. All remaining mock suites and
  its build/Pages tail passed; the final tail
  `./node_modules/.bin/vite build && node tools/prepare-online-build.mjs && node pages_test.mjs`
  exited 0 with Pages 72/72. A temporary direct-shell continuation ended 127
  at `vite` solely because it did not inherit npm's `node_modules/.bin` PATH;
  no test or product assertion failed there.
- `npm run test:function`: exit 0, 357 passed and 0 failed.
- `npm run build:online`: exit 0.

External gateway/LLM/colleague clients, remote Supabase, real provider billing,
real Keychain storage, and physical iPhone/PWA acceptance remain outside this
provider-free local E6 evidence.

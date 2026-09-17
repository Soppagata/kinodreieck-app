// Runs actual old/new Functions, actual old/new identity helpers, synthetic SQL
// responses and the existing complete HTTP/provider mock harness. No net grant.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = mkdtempSync(join(tmpdir(), 'kd-rollout-p06-functions-'));
const generated = new URL(`./review49_rollout_p06_generated_${process.pid}.ts`, import.meta.url);
const run = (exe, args, opts = {}) => {
  const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 120000, ...opts });
  assert.equal(r.status, 0, String(r.error || r.stderr || r.stdout));
  return r.stdout;
};
try {
  const archive = spawnSync('git', ['archive', '14804ce389d69114feed27b92fb11ac78423cc0e', 'supabase/functions', 'src/lib/filmwissen.js']);
  assert.equal(archive.status, 0);
  run('tar', ['-x', '-C', root], { input: archive.stdout });
  writeFileSync(generated, readFileSync(new URL('./ai_task_test.ts', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('./review49_rollout_p06_function_cases.ts', import.meta.url), 'utf8'));
  for (const old of [false, true]) {
    console.log(run('node_modules/.bin/deno', ['test', '--allow-env', '--allow-read', '--node-modules-dir=manual', '--no-lock', '--cached-only', '--filter', 'R-P06', generated.pathname], {
      env: { ...process.env, KD_ROLLOUT_OLD_FUNCTION: old ? '1' : '0', KD_ROLLOUT_OLD_CLIENT: `file://${root}/src/lib/filmwissen.js`,
        KD_IMPL: old ? `${root}/supabase/functions/ai-task/index.ts` : './supabase/functions/ai-task/index.ts' },
    }));
  }
} finally { rmSync(root, { recursive: true, force: true }); rmSync(generated, { force: true }); }

// Test-only: positive provenance fixtures come from the immutable approved commit.
// Production guards continue to read the real working tree and reject its drift.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export function historicalSourceReader(commit, entries, repoRoot) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("Invalid fixture commit");
  const files = new Map(entries.map(({ path }) => {
    const result = spawnSync("git", ["show", `${commit}:${path}`], {
      cwd: repoRoot, timeout: 10_000, maxBuffer: 8_000_000,
    });
    if (result.status !== 0) throw new Error(`Historical fixture missing: ${path}`);
    return [resolve(repoRoot, path), result.stdout];
  }));
  return (absolutePath) => {
    const bytes = files.get(resolve(String(absolutePath)));
    if (!bytes) throw new Error("Path outside historical fixture");
    return Buffer.from(bytes);
  };
}

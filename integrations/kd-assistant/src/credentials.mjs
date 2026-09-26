import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function clean(value) {
  const key = String(value || "").trim();
  if (!key) throw new Error("KD API key is empty.");
  return key;
}

async function fromFile(path) {
  const info = await stat(path);
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    throw new Error("KD_API_KEY_FILE must be readable only by its owner (mode 0600 or stricter).");
  }
  return clean(await readFile(path, "utf8"));
}

async function fromMacKeychain(service, account) {
  if (process.platform !== "darwin") throw new Error("macOS Keychain lookup is available only on macOS.");
  const { stdout } = await execFileAsync("/usr/bin/security", [
    "find-generic-password", "-w", "-s", service, "-a", account,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 });
  return clean(stdout);
}

export function createCredentialProvider(env = process.env) {
  const direct = env.KD_API_KEY;
  const file = env.KD_API_KEY_FILE;
  const service = env.KD_API_KEYCHAIN_SERVICE;
  const account = env.KD_API_KEYCHAIN_ACCOUNT;
  const configured = [Boolean(direct), Boolean(file), Boolean(service || account)].filter(Boolean).length;
  if (configured !== 1) {
    throw new Error("Configure exactly one credential source: KD_API_KEY, KD_API_KEY_FILE, or both KD_API_KEYCHAIN_SERVICE and KD_API_KEYCHAIN_ACCOUNT.");
  }
  if ((service && !account) || (!service && account)) throw new Error("Keychain service and account must be configured together.");
  if (direct) return async () => clean(direct);
  if (file) return async () => fromFile(file);
  return async () => fromMacKeychain(service, account);
}

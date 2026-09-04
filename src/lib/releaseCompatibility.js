export const RELEASE_COMPATIBILITY_FORMAT = 1;

const COMMIT = /^[a-f0-9]{7,64}$/i;
const MIGRATION = /^\d{8,20}(?:_[a-z0-9_]+)?$/i;
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const plainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

function addCheck(checks, code, ok, detail) {
  checks.push(Object.freeze({ code, ok: !!ok, detail }));
}

function functionsByName(value) {
  if (!Array.isArray(value)) return null;
  const map = new Map();
  for (const entry of value) {
    const name = text(entry?.name);
    if (!name || map.has(name)) return null;
    map.set(name, entry);
  }
  return map;
}

function metadataOf(entry) {
  if (plainObject(entry?.metadata)) return entry.metadata;
  if (!plainObject(entry)) return null;
  const { name: _name, ...metadata } = entry;
  return metadata;
}

function sameMetadata(expected, observed) {
  const expectedMetadata = metadataOf(expected);
  const observedMetadata = metadataOf(observed);
  if (!plainObject(expectedMetadata) || !Object.keys(expectedMetadata).length
      || !plainObject(observedMetadata)) return false;
  return Object.entries(expectedMetadata).every(([key, value]) =>
    Object.hasOwn(observedMetadata, key)
      && JSON.stringify(observedMetadata[key]) === JSON.stringify(value));
}

/* Reine, read-only Paritaetsauswertung. Der Aufrufer beschafft Web-, Function-
   und Migrationsmetadaten getrennt und reicht nur Snapshots herein. Fehlende
   erwartete oder beobachtete Angaben sind immer inkompatibel. */
export function evaluateReleaseCompatibility({ expected, observed } = {}) {
  const checks = [];
  const expectedCommit = text(expected?.webCommit);
  const observedCommit = text(observed?.webCommit);
  addCheck(checks, "web-commit-present", COMMIT.test(expectedCommit || "") && COMMIT.test(observedCommit || ""),
    "Erwarteter und beobachteter Webcommit müssen angegeben sein.");
  addCheck(checks, "web-commit-match", !!expectedCommit && expectedCommit === observedCommit,
    expectedCommit && observedCommit ? `${observedCommit} / erwartet ${expectedCommit}` : "Webcommit fehlt.");

  const expectedFunctions = functionsByName(expected?.functions);
  const observedFunctions = functionsByName(observed?.functions);
  addCheck(checks, "function-metadata-present", expectedFunctions !== null && expectedFunctions.size > 0
    && observedFunctions !== null,
    "Function-Metadaten müssen als eindeutige Liste vorliegen.");
  if (expectedFunctions && observedFunctions) {
    for (const [name, expectedFunction] of expectedFunctions.entries()) {
      const observedFunction = observedFunctions.get(name);
      addCheck(checks, `function:${name}`, !!observedFunction && sameMetadata(expectedFunction, observedFunction),
        observedFunction ? "Erwartete Function-Metadaten stimmen überein." : "Function fehlt im Readback.");
    }
  }

  const expectedMigrations = Array.isArray(expected?.requiredMigrations)
    ? expected.requiredMigrations.map(text) : null;
  const observedMigrations = Array.isArray(observed?.migrations)
    ? new Set(observed.migrations.map(text)) : null;
  const migrationsValid = expectedMigrations !== null && observedMigrations !== null
    && expectedMigrations.every((migration) => MIGRATION.test(migration || ""))
    && [...observedMigrations].every((migration) => MIGRATION.test(migration || ""));
  addCheck(checks, "migration-metadata-present", migrationsValid,
    "Notwendige und beobachtete Migrationen müssen explizit angegeben sein.");
  if (migrationsValid) {
    for (const migration of expectedMigrations) {
      addCheck(checks, `migration:${migration}`, observedMigrations.has(migration),
        observedMigrations.has(migration) ? "Migration vorhanden." : "Notwendige Migration fehlt.");
    }
  }

  const ok = checks.length > 0 && checks.every((check) => check.ok);
  return Object.freeze({
    format: RELEASE_COMPATIBILITY_FORMAT,
    ok,
    status: ok ? "compatible" : "incompatible",
    checks: Object.freeze(checks),
    errors: Object.freeze(checks.filter((check) => !check.ok).map((check) => check.code)),
  });
}

export function assertReleaseCompatibility(contract) {
  const result = evaluateReleaseCompatibility(contract);
  if (!result.ok) throw new Error(`Release nicht kompatibel: ${result.errors.join(", ")}`);
  return result;
}

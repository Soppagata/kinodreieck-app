import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const basePath = "./supabase/migrations/20260809180000_event_radar_local_basis.sql";
const pilotPath = "./supabase/migrations/20260814120000_radar_max_manual_pilot.sql";
const schemaPath = "./supabase/current_schema.sql";
const runbookPath = "./docs/ETAPPE_16A1_RADAR_MAX_PILOT_DB.md";

assert.ok(
  fs.existsSync(new URL(pilotPath, import.meta.url)),
  `W1-Vertrag rot: Zielmigration fehlt noch: ${pilotPath}`,
);

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const baseSql = read(basePath);
const pilotSql = read(pilotPath);
const currentSchema = read(schemaPath);
const runbook = read(runbookPath);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stripComments = (value) => value
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\r\n]*/g, " ");
const compact = (value) => stripComments(value).toLowerCase().replace(/\s+/g, " ").trim();
const canonical = (value) => compact(value).replace(/\s*([(),])\s*/g, "$1");
const executable = compact(pilotSql);
const canonicalExecutable = canonical(pilotSql);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findBalancedEnd = (source, openAt) => {
  let depth = 0;
  let quoted = false;
  for (let index = openAt; index < source.length; index++) {
    const char = source[index];
    if (char === "'") {
      if (quoted && source[index + 1] === "'") {
        index++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (quoted) continue;
    if (char === "(") depth++;
    if (char === ")" && --depth === 0) return index;
  }
  return -1;
};

const functionSql = (source, name) => {
  const startMatch = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${escapeRegex(name)}\\s*\\(`, "i").exec(source);
  assert.ok(startMatch, `Funktion ${name} fehlt`);
  const start = startMatch.index;
  const asMatch = /\bas\s+(\$[a-zA-Z0-9_]*\$)/i.exec(source.slice(start));
  assert.ok(asMatch, `Funktionsrumpf ${name} fehlt`);
  const delimiter = asMatch[1];
  const bodyStart = start + asMatch.index + asMatch[0].length;
  const bodyEnd = source.indexOf(delimiter, bodyStart);
  assert.ok(bodyEnd >= 0, `Funktionsende ${name} fehlt`);
  const semicolon = source.indexOf(";", bodyEnd + delimiter.length);
  assert.ok(semicolon >= 0, `Funktionsabschluss ${name} fehlt`);
  return source.slice(start, semicolon + 1);
};

const tableSql = (source, name) => {
  const match = new RegExp(`create\\s+table\\s+public\\.${escapeRegex(name)}\\s*\\(`, "i").exec(source);
  assert.ok(match, `Tabelle ${name} fehlt`);
  const openAt = source.indexOf("(", match.index);
  const closeAt = findBalancedEnd(source, openAt);
  assert.ok(closeAt > openAt, `Tabellenabschluss ${name} fehlt`);
  return source.slice(match.index, closeAt + 1);
};

const splitTopLevel = (value) => {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "'") {
      if (quoted && value[index + 1] === "'") {
        index++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (quoted) continue;
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
};

const calls = (source, callName) => {
  const found = [];
  const regex = new RegExp(`\\b${escapeRegex(callName)}\\s*\\(`, "ig");
  for (const match of source.matchAll(regex)) {
    const openAt = source.indexOf("(", match.index);
    const closeAt = findBalancedEnd(source, openAt);
    assert.ok(closeAt > openAt, `Unvollständiger ${callName}-Aufruf`);
    found.push(source.slice(openAt + 1, closeAt));
  }
  return found;
};

const jsonObjectPairs = (source) => calls(source, "jsonb_build_object").map((argumentsSql) => {
  const args = splitTopLevel(argumentsSql);
  assert.equal(args.length % 2, 0, "jsonb_build_object braucht Schlüssel/Wert-Paare");
  const pairs = [];
  for (let index = 0; index < args.length; index += 2) {
    const literal = args[index].match(/^'([^']+)'(?:::text)?$/i)?.[1];
    if (literal) pairs.push([literal, args[index + 1]]);
  }
  return pairs;
});

const statementsFor = (source, pattern) => source
  .split(";")
  .map((statement) => compact(statement))
  .filter((statement) => pattern.test(statement));

const actorVariables = (source) => {
  const normalized = compact(source);
  const variables = new Set();
  for (const pattern of [
    /\b([a-z_][a-z0-9_]*)\s+uuid\s*(?::=|default)\s*auth\.uid\(\)/g,
    /\b([a-z_][a-z0-9_]*)\s*:=\s*auth\.uid\(\)/g,
    /\bselect\s+auth\.uid\(\)\s+into\s+([a-z_][a-z0-9_]*)/g,
  ]) {
    for (const match of normalized.matchAll(pattern)) variables.add(match[1]);
  }
  return [...variables];
};

const hasOwnAccountBinding = (statement, functionSource) => {
  const normalized = compact(statement);
  const directUid = "(?:\\(\\s*)?(?:select\\s+)?auth\\.uid\\(\\)(?:\\s*\\))?";
  if (new RegExp(`(?:\\b[a-z_][a-z0-9_]*\\.)?account_id\\s*=\\s*${directUid}`).test(normalized)) return true;
  if (new RegExp(`${directUid}\\s*=\\s*(?:\\b[a-z_][a-z0-9_]*\\.)?account_id`).test(normalized)) return true;
  return actorVariables(functionSource).some((variable) => {
    const actor = escapeRegex(variable);
    return new RegExp(`(?:\\b[a-z_][a-z0-9_]*\\.)?account_id\\s*=\\s*${actor}\\b|\\b${actor}\\s*=\\s*(?:[a-z_][a-z0-9_]*\\.)?account_id\\b`).test(normalized);
  });
};

const statementsUsingTable = (source, table) => statementsFor(
  source,
  new RegExp(`(?:from|join|into|update) public\\.${escapeRegex(table)}\\b`),
);

const jsonTextTokens = (source, key) => {
  const normalized = compact(source);
  const keyPattern = escapeRegex(key.toLowerCase());
  const variables = new Set();
  for (const pattern of [
    new RegExp(`\\b([a-z_][a-z0-9_]*)\\s+(?:text|varchar|date)\\s*(?::=|default)\\s*\\(?p_payload\\s*->>\\s*'${keyPattern}'`, "g"),
    new RegExp(`\\b([a-z_][a-z0-9_]*)\\s*:=\\s*\\(?p_payload\\s*->>\\s*'${keyPattern}'`, "g"),
    new RegExp(`\\bselect\\s+\\(?p_payload\\s*->>\\s*'${keyPattern}'\\)?\\s+into\\s+([a-z_][a-z0-9_]*)`, "g"),
  ]) {
    for (const match of normalized.matchAll(pattern)) variables.add(match[1]);
  }
  return [...variables];
};

const tokenPattern = (tokens) => tokens.length
  ? `(?:${tokens.map((token) => `\\b${escapeRegex(token)}\\b`).join("|")})`
  : "(?!)";

const hasTokenLiteralComparison = (source, tokens, operators, literal) => {
  const token = tokenPattern(tokens);
  const op = `(?:${operators.join("|")})`;
  const value = escapeRegex(literal);
  return new RegExp(`${token}\\s*${op}\\s*'${value}'|'${value}'\\s*${op}\\s*${token}`).test(compact(source));
};

const exactMembershipFor = (source, tokens, expectedValues) => {
  const normalized = compact(source);
  const expected = [...expectedValues].sort();
  const candidates = [
    ...normalized.matchAll(/\b(?:not\s+)?in\s*\(([^()]*)\)/g),
    ...normalized.matchAll(/\b(?:any|all)\s*\(\s*array\s*\[([^\]]*)\]\s*\)/g),
  ];
  for (const match of candidates) {
    const values = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]).sort();
    if (values.length !== expected.length || values.some((value, index) => value !== expected[index])) continue;
    const prefix = normalized.slice(Math.max(0, match.index - 240), match.index);
    if (tokens.some((token) => new RegExp(`\\b${escapeRegex(token)}\\b`).test(prefix))) return true;
  }
  return false;
};

const privilegesForTableRole = (table, role) => statementsFor(
  pilotSql,
  new RegExp(`^grant [^;]* on (?:table )?public\\.${escapeRegex(table)} to[^;]*\\b${escapeRegex(role)}\\b`),
).join(" ");

const assertBefore = (source, earlier, later, message) => {
  const first = source.indexOf(earlier);
  const second = source.indexOf(later);
  assert.ok(first >= 0 && second > first, message);
};

const assertFunctionEnvelope = (name, expectedSignature) => {
  const fn = functionSql(pilotSql, name);
  const normalized = compact(fn);
  assert.match(canonical(fn), new RegExp(`^create (?:or replace )?function public\\.${escapeRegex(name)}\\(${escapeRegex(expectedSignature)}\\)returns `));
  assert.match(normalized, /\bsecurity definer\b/);
  assert.match(normalized, /\bset search_path\s*=\s*pg_catalog\s*,\s*public\b/);
  return { fn, normalized };
};

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`✓ ${name}`);
};

check("Basismigration und current_schema bleiben bitidentisch; Pilotmigration ist additiv und atomar", () => {
  assert.equal(sha256(baseSql), "d2bfe936e7ecf3b20c2c0fb5a761a87dbee42149b8b733e0e63fec5af82b94c4");
  assert.equal(sha256(currentSchema), "d7124bdd16b06ba7924d71e6f5d9324ca5d9b10e860e9c9a3995bc7b99f66225");
  assert.match(executable, /^begin\s*;/);
  assert.match(executable, /commit\s*;$/);
  assert.doesNotMatch(executable, /\b(?:drop|truncate)\s+(?:table\s+)?public\.kd_radar_/);
});

check("Runbook trennt Source-/Pages-Lieferung von jeder Backendaktivierung", () => {
  assert.match(runbook, /Source-Push/);
  assert.match(runbook, /Fast-Forward/);
  assert.match(runbook, /Pages-Staging/);
  assert.match(runbook, /weder Backendänderung noch Migrationsanwendung, Pilotaktivierung oder praktische Abnahme/);
  assert.doesNotMatch(runbook, /kein Push und kein Deployment/i);
});

check("Capability-Erweiterung ist fail-closed und Review setzt Pilot voraus", () => {
  assert.match(executable, /alter table public\.kd_radar_capabilities\s+add (?:column )?(?:if not exists )?radar_pilot boolean not null default false/);
  assert.match(executable, /check\s*\(\s*not radar_review\s+or\s+radar_pilot\s*\)/);
  assert.doesNotMatch(executable, /insert into public\.kd_radar_capabilities|update public\.kd_radar_capabilities|radar_pilot\s*=\s*true/);
});

check("Parameterlose Capability-Helper sind fail-closed und identitätsgebunden", () => {
  const pilot = assertFunctionEnvelope("kd_radar_pilot_allowed", "");
  const review = assertFunctionEnvelope("kd_radar_review_allowed", "");
  assert.match(pilot.normalized, /auth\.uid\(\)/);
  assert.match(pilot.normalized, /public\.kd_account_active\(\)/);
  assert.match(pilot.normalized, /from public\.kd_radar_capabilities/);
  assert.match(pilot.normalized, /radar_pilot/);
  assert.ok(
    statementsUsingTable(pilot.fn, "kd_radar_capabilities").some((statement) => hasOwnAccountBinding(statement, pilot.fn)),
    "Pilot-Helper muss die Capability explizit an den eigenen auth.uid()-Actor binden",
  );
  assert.ok(/coalesce\s*\([^;]*radar_pilot[^;]*false\s*\)|radar_pilot\s+is\s+true/.test(pilot.normalized));
  assert.doesNotMatch(pilot.normalized, /kd_radar_settings|radar_aktiv/);
  assert.doesNotMatch(pilot.normalized, /p_account|account_id\s+uuid/);
  assert.match(review.normalized, /public\.kd_radar_pilot_allowed\(\)/);
  assert.match(review.normalized, /auth\.uid\(\)/);
  assert.match(review.normalized, /from public\.kd_radar_capabilities/);
  assert.match(review.normalized, /radar_review/);
  assert.ok(
    statementsUsingTable(review.fn, "kd_radar_capabilities").some((statement) => hasOwnAccountBinding(statement, review.fn)),
    "Review-Helper muss die Capability explizit an den eigenen auth.uid()-Actor binden",
  );
  assert.ok(/coalesce\s*\([^;]*radar_review[^;]*false\s*\)|radar_review\s+is\s+true/.test(review.normalized));
  assert.doesNotMatch(review.normalized, /p_account|account_id\s+uuid/);
});

const rpcContracts = [
  ["kd_radar_pilot_set_subscription", "p_target_key text,p_scope text,p_status text,p_operation_id uuid", "jsonb"],
  ["kd_radar_pilot_feed", "p_operation_ids uuid[]", "jsonb"],
  ["kd_radar_pilot_set_receipt", "p_event_version_id uuid,p_status text", "void"],
  ["kd_radar_pilot_import_event", "p_operation_id uuid,p_payload jsonb", "jsonb"],
];

check("Vier neue RPC-Signaturen sind SECURITY DEFINER mit fixem search_path", () => {
  for (const [name, signature, result] of rpcContracts) {
    const { normalized } = assertFunctionEnvelope(name, signature);
    assert.match(normalized, new RegExp(`\\) returns ${result}\\b`));
  }
});

check("Alle Pilot-RPCs verlangen Pilot; Import verlangt zusätzlich Review, Feed kann Review nur für Projektion referenzieren", () => {
  for (const [name] of rpcContracts) {
    const fn = compact(functionSql(pilotSql, name));
    assert.match(fn, /public\.kd_radar_pilot_allowed\(\)/);
    assert.doesNotMatch(fn, /public\.kd_radar_settings|radar_aktiv/);
    if (name === "kd_radar_pilot_import_event") {
      assert.match(fn, /public\.kd_radar_review_allowed\(\)/);
    } else if (["kd_radar_pilot_set_subscription", "kd_radar_pilot_set_receipt"].includes(name)) {
      assert.doesNotMatch(fn, /kd_radar_review_allowed|radar_review/);
    }
  }
});

check("Pilot-Subscription löst nur aktive target_keys auf und schreibt eigene idempotente Operationen", () => {
  const fn = functionSql(pilotSql, "kd_radar_pilot_set_subscription");
  const normalized = compact(fn);
  assert.match(normalized, /(?:from|join) public\.kd_radar_targets/);
  assert.match(normalized, /target_key\s*=\s*p_target_key/);
  assert.match(normalized, /target_status\s*=\s*'active'/);
  assert.doesNotMatch(normalized, /insert into public\.kd_radar_targets|public\.kd_set_radar_subscription\s*\(/);
  for (const scope of ["all", "cinema", "streaming"]) assert.match(fn, new RegExp(`'${scope}'`));
  for (const status of ["active", "paused", "removed"]) assert.match(fn, new RegExp(`'${status}'`));
  assert.match(normalized, /public\.kd_radar_operations/);
  assert.match(normalized, /insert into public\.kd_radar_operations/);
  assert.ok(statementsUsingTable(fn, "kd_radar_operations").some((statement) => hasOwnAccountBinding(statement, fn)));
  assert.match(normalized, /operation_id\s*=\s*p_operation_id/);
  const ack = jsonObjectPairs(fn).find((pairs) => {
    const keys = pairs.map(([key]) => key);
    return keys.length === 5 && ["operationId", "targetId", "status", "revision", "checksum"].every((key) => keys.includes(key));
  });
  assert.ok(ack, "Explizite sichere Subscription-ACK-Projektion fehlt");
  assert.match(compact(ack.find(([key]) => key === "targetId")[1]), /target_key|p_target_key/);
});

check("Pilot-Receipt bleibt auf ein eigenes aktives Abo und die Basisschema-Statuswerte begrenzt", () => {
  const fn = functionSql(pilotSql, "kd_radar_pilot_set_receipt");
  const normalized = compact(fn);
  assert.match(normalized, /(?:from|join) public\.kd_radar_event_versions/);
  assert.match(normalized, /(?:from|join) public\.kd_radar_events/);
  assert.match(normalized, /(?:from|join) public\.kd_radar_subscriptions/);
  assert.match(normalized, /event_version_id\s*=\s*p_event_version_id/);
  assert.ok(statementsUsingTable(fn, "kd_radar_subscriptions").some((statement) => hasOwnAccountBinding(statement, fn)));
  assert.match(normalized, /subscription_status\s*=\s*'active'/);
  for (const status of ["new", "seen", "dismissed", "accepted_week", "exported_ics"]) {
    assert.match(fn, new RegExp(`'${status}'`));
  }
  assert.match(normalized, /insert into public\.kd_radar_receipts/);
  assert.doesNotMatch(normalized, /public\.kd_set_radar_receipt\s*\(/);
});

check("Alte Browser-RPC-Rechte werden entzogen und service_role bleibt erhalten", () => {
  for (const signature of [
    "kd_set_radar_subscription(uuid,text,text,uuid)",
    "kd_get_radar_feed()",
    "kd_set_radar_receipt(uuid,text)",
  ]) {
    const escaped = escapeRegex(`public.${signature}`);
    assert.match(canonicalExecutable, new RegExp(`revoke (?:all|execute) on function ${escaped}from[^;]*\\bauthenticated\\b`));
    const revokes = statementsFor(pilotSql, new RegExp(`revoke .*${escaped}`, "i"));
    assert.ok(revokes.every((statement) => !/\bservice_role\b/.test(statement)), `${signature}: service_role wurde entzogen`);
    assert.match(compact(baseSql), new RegExp(`grant execute on function ${escaped} to[^;]*\\bservice_role\\b`));
  }
});

check("Neue RPCs sind nur für authenticated und service_role ausführbar", () => {
  for (const [name, signature] of rpcContracts) {
    const call = `public.${name}(${signature.split(",").map((part) => part.trim().split(/\s+/).at(-1)).join(",")})`;
    const escaped = escapeRegex(call);
    assert.match(canonicalExecutable, new RegExp(`revoke (?:all|execute) on function ${escaped}from[^;]*\\bpublic\\b`));
    assert.match(canonicalExecutable, new RegExp(`revoke (?:all|execute) on function ${escaped}from[^;]*\\banon\\b`));
    assert.match(canonicalExecutable, new RegExp(`grant execute on function ${escaped}to[^;]*\\bauthenticated\\b`));
    assert.match(canonicalExecutable, new RegExp(`grant execute on function ${escaped}to[^;]*\\bservice_role\\b`));
  }
});

const importFn = functionSql(pilotSql, "kd_radar_pilot_import_event");
const importNormalized = compact(importFn);

check("Import akzeptiert genau ein Objekt mit exakt sechs Rootkeys und zwei exakten Evidence-Objekten", () => {
  assert.match(importNormalized, /jsonb_typeof\s*\(\s*p_payload\s*\)\s*(?:<>|!=)\s*'object'/);
  assert.doesNotMatch(importNormalized, /jsonb_array_elements\s*\(\s*p_payload\s*\)/);
  assert.match(importNormalized, /p_payload\s*->\s*'evidence'/);
  assert.match(importNormalized, /jsonb_array_length\s*\([^)]*evidence[^)]*\)\s*(?:<>|!=)\s*2/);
  const keyEnumerations = [...importNormalized.matchAll(/jsonb_(?:object_keys|each(?:_text)?)\s*\(/g)];
  assert.ok(keyEnumerations.length >= 2, "Root- und Evidence-Keysets müssen explizit geprüft werden");
  assert.match(importNormalized, /\bcount\s*\(/);
  for (const key of ["targetKey", "eventType", "date", "region", "platform", "evidence"]) {
    assert.match(importFn, new RegExp(`'${key}'`));
  }
  for (const key of ["sourceId", "url", "retrievedAt"]) {
    assert.match(importFn, new RegExp(`'${key}'`));
  }
  assert.match(importNormalized, /jsonb_array_elements\s*\([^)]*evidence[^)]*\)/);
  assert.match(importNormalized, /jsonb_typeof\s*\([^)]*\)\s*(?:<>|!=)\s*'object'/);
  assert.ok(/(?:<>|!=)\s*6\b|=\s*6\b/.test(importNormalized), "Root-Keyanzahl sechs wird nicht geprüft");
  assert.ok(/(?:<>|!=)\s*3\b|=\s*3\b/.test(importNormalized), "Evidence-Keyanzahl drei wird nicht geprüft");
});

check("Region, Datum, Eventtyp und Plattform folgen den realen Basisschema-Constraints", () => {
  const events = tableSql(baseSql, "kd_radar_events");
  const eventTypeBlock = events.match(/event_type\s+text[\s\S]*?check\s*\(\s*event_type\s+in\s*\(([^)]*)\)/i)?.[1] || "";
  const allowedTypes = [...eventTypeBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(allowedTypes, ["kinostart_at", "streamingstart_at", "serienstart", "staffelstart"]);
  const eventTypeTokens = jsonTextTokens(importFn, "eventType");
  const regionTokens = jsonTextTokens(importFn, "region");
  const dateTokens = jsonTextTokens(importFn, "date");
  const platformTokens = jsonTextTokens(importFn, "platform");
  assert.ok(eventTypeTokens.length > 0, "eventType muss aus p_payload abgeleitet werden");
  assert.ok(regionTokens.length > 0, "region muss aus p_payload abgeleitet werden");
  assert.ok(dateTokens.length > 0, "date muss aus p_payload abgeleitet werden");
  assert.ok(platformTokens.length > 0, "platform muss aus p_payload abgeleitet werden");
  assert.ok(exactMembershipFor(importFn, eventTypeTokens, allowedTypes), "eventType braucht eine exakte Vierer-Membershipprüfung");
  const region = tokenPattern(regionTokens);
  assert.ok(
    hasTokenLiteralComparison(importFn, regionTokens, ["<>", "!=", "is\\s+distinct\\s+from"], "at")
      || new RegExp(`not\\s*\\([^)]*${region}\\s*=\\s*'at'[^)]*\\)`).test(importNormalized),
    "region muss fail-closed exakt gegen AT geprüft werden",
  );
  assert.ok(
    importFn.includes("^[0-9]{4}-[0-9]{2}-[0-9]{2}$") || importFn.includes("^\\d{4}-\\d{2}-\\d{2}$"),
    "Datum braucht eine taggenaue YYYY-MM-DD-Formprüfung",
  );
  assert.ok(dateTokens.some((token) => new RegExp(`\\b${escapeRegex(token)}\\b\\s*::\\s*date`).test(importNormalized)), "Datum muss als date geparst werden");
  const dateToken = tokenPattern(dateTokens);
  const roundtrip = new RegExp(`to_char\\s*\\([^;]*'yyyy-mm-dd'\\s*\\)[^;]*${dateToken}|${dateToken}[^;]*to_char\\s*\\([^;]*'yyyy-mm-dd'\\s*\\)`).test(importNormalized)
    || new RegExp(`::\\s*text\\s*(?:<>|!=|is\\s+distinct\\s+from|=)\\s*${dateToken}|${dateToken}\\s*(?:<>|!=|is\\s+distinct\\s+from|=)[^;]*::\\s*text`).test(importNormalized);
  assert.ok(roundtrip, "Geparstes Datum muss taggenau gegen YYYY-MM-DD rückverglichen werden");
  assert.ok(hasTokenLiteralComparison(importFn, eventTypeTokens, ["="], "streamingstart_at"), "Streaming-Zweig fehlt");
  assert.ok(hasTokenLiteralComparison(importFn, platformTokens, ["="], "-"), "Streaming-Zweig muss '-' abweisen");
  const platform = tokenPattern(platformTokens);
  assert.ok(
    new RegExp(`${platform}\\s+is\\s+null|btrim\\s*\\(\\s*${platform}\\s*\\)\\s*=\\s*''|char_length\\s*\\(\\s*btrim\\s*\\(\\s*${platform}\\s*\\)\\s*\\)\\s*=\\s*0|nullif\\s*\\(\\s*btrim\\s*\\(\\s*${platform}\\s*\\)\\s*,\\s*''\\s*\\)\\s+is\\s+null|coalesce\\s*\\(\\s*btrim\\s*\\(\\s*${platform}\\s*\\)\\s*,\\s*''\\s*\\)\\s*=\\s*''`).test(importNormalized),
    "Streaming-Plattform muss null/leer/blank abweisen",
  );
  assert.ok(
    hasTokenLiteralComparison(importFn, eventTypeTokens, ["<>", "!=", "is\\s+distinct\\s+from"], "streamingstart_at")
      || /\belse\b/.test(importNormalized),
    "Nicht-Streaming-Zweig fehlt",
  );
  assert.ok(
    hasTokenLiteralComparison(importFn, platformTokens, ["<>", "!=", "is\\s+distinct\\s+from"], "-"),
    "Nicht-Streaming-Typen müssen exakt '-' verlangen",
  );
});

check("Import nutzt nur vorregistriertes aktives Target und zwei freigegebene unabhängige Quellen", () => {
  assert.match(importNormalized, /from public\.kd_radar_targets/);
  assert.match(importNormalized, /target_key/);
  assert.match(importNormalized, /target_status\s*=\s*'active'/);
  assert.doesNotMatch(importNormalized, /insert into public\.kd_radar_targets|update public\.kd_radar_targets/);
  assert.match(importNormalized, /from public\.kd_radar_sources/);
  assert.match(importNormalized, /rights_status\s*=\s*'approved'/);
  assert.match(importNormalized, /attribution_approved/);
  assert.match(importNormalized, /\bactive\b/);
  assert.match(importNormalized, /count\s*\(\s*distinct\s+[^)]*source_id[^)]*\)\s*(?:<>|!=|=)\s*2/);
  assert.match(importNormalized, /count\s*\(\s*distinct\s+[^)]*publisher_family[^)]*\)\s*(?:<>|!=|=)\s*2/);
  assert.doesNotMatch(executable, /disable trigger kd_radar_evidence_guard|drop trigger kd_radar_evidence_guard/);
});

const createdTables = [...pilotSql.matchAll(/create\s+table\s+public\.(kd_[a-z0-9_]+)/ig)].map((match) => match[1]);
const ledgerCandidates = createdTables.filter((name) => {
  const block = compact(tableSql(pilotSql, name));
  return ["actor_id", "operation_id", "request_hash", "result"].every((column) => block.includes(column));
});

check("Importledger bindet Actor und Operation eindeutig und trägt Requesthash plus Resultat", () => {
  assert.equal(ledgerCandidates.length, 1, "Genau ein eigenes Importledger erwartet");
  const ledger = compact(tableSql(pilotSql, ledgerCandidates[0]));
  assert.match(ledger, /actor_id\s+uuid\s+not null/);
  assert.match(ledger, /operation_id\s+uuid\s+not null/);
  assert.match(ledger, /request_hash\s+text\s+not null/);
  assert.match(ledger, /result\s+jsonb\s+not null/);
  assert.match(ledger, /(?:primary key|unique)\s*\(\s*actor_id\s*,\s*operation_id\s*\)/);
  assert.match(ledger, /references auth\.users\s*\(\s*id\s*\)\s+on delete cascade/);
  assert.match(executable, new RegExp(`alter table public\\.${escapeRegex(ledgerCandidates[0])} enable row level security`));
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(canonicalExecutable, new RegExp(`revoke all on (?:table )?public\\.${escapeRegex(ledgerCandidates[0])} from[^;]*\\b${role}\\b`));
  }
  const servicePrivileges = privilegesForTableRole(ledgerCandidates[0], "service_role");
  assert.ok(
    /\ball\b/.test(servicePrivileges) || (/\bselect\b/.test(servicePrivileges) && /\binsert\b/.test(servicePrivileges)),
    "service_role braucht administrativen oder mindestens Select-/Insert-Zugriff",
  );
  assert.doesNotMatch(importNormalized, new RegExp(`(?:update|delete from) public\\.${escapeRegex(ledgerCandidates[0])}`));
});

check("Neue Migration öffnet keine Browser-Direktgrants auf globale Radarwahrheit", () => {
  const sensitiveTables = [
    "kd_radar_capabilities", "kd_radar_targets", "kd_radar_sources",
    "kd_radar_evidence", "kd_radar_reviews",
  ];
  for (const table of sensitiveTables) {
    const grants = statementsFor(
      pilotSql,
      new RegExp(`^grant [^;]* on (?:table )?public\\.${escapeRegex(table)} to`),
    );
    for (const grant of grants) assert.doesNotMatch(grant, /\b(?:public|anon|authenticated)\b/);
  }
});

check("Idempotenz ist vor dem Eventwrite gelockt, wiederholbar und kollisionsfest", () => {
  const locks = calls(importFn, "pg_advisory_xact_lock").map(compact);
  const importActors = actorVariables(importFn);
  assert.ok(
    locks.some((lock) => /p_operation_id/.test(lock) && (importActors.some((actor) => new RegExp(`\\b${escapeRegex(actor)}\\b`).test(lock)) || /auth\.uid\(\)/.test(lock))),
    "Actor-/Operation-Lock fehlt",
  );
  const eventKeyVariables = new Set();
  for (const match of importNormalized.matchAll(/(?:\b[a-z_][a-z0-9_]*\.)?event_key\s*=\s*([a-z_][a-z0-9_]*)\b|\b([a-z_][a-z0-9_]*)\s*=\s*(?:[a-z_][a-z0-9_]*\.)?event_key\b/g)) {
    eventKeyVariables.add(match[1] || match[2]);
  }
  assert.ok(
    locks.some((lock) => eventKeyVariables.size > 0 && [...eventKeyVariables].some((key) => new RegExp(`\\b${escapeRegex(key)}\\b`).test(lock))),
    "Event-Key-Lock fehlt",
  );
  const ledgerName = `public.${ledgerCandidates[0]}`;
  assertBefore(importNormalized, "pg_advisory_xact_lock", ledgerName, "Operation muss vor Ledger-Read gelockt werden");
  assert.match(importNormalized, /select[\s\S]*request_hash[\s\S]*result[\s\S]*from public\./);
  assert.match(importNormalized, /(?:<>|!=|is distinct from)[\s\S]{0,180}request_hash|request_hash[\s\S]{0,180}(?:<>|!=|is distinct from)/);
  assert.match(importNormalized, /if\s+(?:found|[a-z_][a-z0-9_.]*\s+is\s+not\s+null)[\s\S]{0,600}\breturn\s+/);
  assert.match(importNormalized, /raise exception/);
});

check("Import-Requesthash ist deterministisch payloadgebunden und wird gegen das Ledger verglichen", () => {
  const payloadHashes = ["md5", "digest"].flatMap((name) => calls(importFn, name))
    .map(compact)
    .filter((argumentsSql) => /p_payload/.test(argumentsSql));
  assert.ok(payloadHashes.length > 0, "Deterministischer Hash über p_payload fehlt");
  for (const hashArguments of payloadHashes) {
    assert.doesNotMatch(hashArguments, /account|actor|user|uid|auth\.|p_operation_id/);
  }

  const computedHashVariables = new Set();
  for (const pattern of [
    /\b([a-z_][a-z0-9_]*)\s+(?:text|bytea)\s*(?::=|default)\s*[^;]*(?:md5|digest)\s*\([^;]*p_payload[^;]*;/g,
    /\b([a-z_][a-z0-9_]*)\s*:=\s*[^;]*(?:md5|digest)\s*\([^;]*p_payload[^;]*;/g,
    /\bselect\s+[^;]*(?:md5|digest)\s*\([^;]*p_payload[^;]*\s+into\s+([a-z_][a-z0-9_]*)\s*;/g,
  ]) {
    for (const match of importNormalized.matchAll(pattern)) computedHashVariables.add(match[1]);
  }

  const ledgerName = escapeRegex(ledgerCandidates[0]);
  const ledgerReads = statementsFor(importFn, new RegExp(`from public\\.${ledgerName}`))
    .filter((statement) => /request_hash/.test(statement));
  assert.ok(ledgerReads.length > 0, "Ledger-request_hash wird nicht rückgelesen");
  const ledgerHashVariables = new Set();
  for (const statement of ledgerReads) {
    const intoList = statement.match(/\binto\s+([a-z0-9_.,\s]+?)\s+from\b/)?.[1] || "";
    for (const identifier of intoList.match(/[a-z_][a-z0-9_]*/g) || []) ledgerHashVariables.add(identifier);
  }
  const comparedDirectly = /request_hash\s*(?:<>|!=|is\s+distinct\s+from)[^;]*(?:md5|digest)[^;]*p_payload|(?:md5|digest)[^;]*p_payload[^;]*(?:<>|!=|is\s+distinct\s+from)[^;]*request_hash/.test(importNormalized);
  const comparedViaVariable = [...computedHashVariables].some((variable) => {
    const hashVariable = escapeRegex(variable);
    return [...ledgerHashVariables].some((ledgerVariable) => {
      const storedHash = `(?:${escapeRegex(ledgerVariable)}|${escapeRegex(ledgerVariable)}\\.request_hash)`;
      return new RegExp(`${storedHash}\\s*(?:<>|!=|is\\s+distinct\\s+from)\\s*${hashVariable}\\b|\\b${hashVariable}\\s*(?:<>|!=|is\\s+distinct\\s+from)\\s*${storedHash}`).test(importNormalized);
    });
  });
  assert.ok(comparedDirectly || comparedViaVariable, "Payloadhash wird nicht gegen den gespeicherten Ledgerhash verglichen");
});

check("Einzelimport schreibt Event, Candidate, zwei Evidenzen, Confirm, Pointer, Review und zuletzt Ledger", () => {
  const ledgerName = `public.${ledgerCandidates[0]}`;
  assert.equal((importNormalized.match(/insert into public\.kd_radar_events\b/g) || []).length, 1);
  assert.equal((importNormalized.match(/insert into public\.kd_radar_event_versions\b/g) || []).length, 1);
  assert.equal((importNormalized.match(/insert into public\.kd_radar_evidence\b/g) || []).length, 1);
  assert.equal((importNormalized.match(/insert into public\.kd_radar_reviews\b/g) || []).length, 1);
  assert.equal((importNormalized.match(new RegExp(`insert into ${escapeRegex(ledgerName)}\\b`, "g")) || []).length, 1);
  assert.match(importNormalized, /insert into public\.kd_radar_event_versions[\s\S]*'candidate'/);
  assertBefore(importNormalized, "insert into public.kd_radar_events", "insert into public.kd_radar_event_versions", "Event muss vor Candidate entstehen");
  assertBefore(importNormalized, "insert into public.kd_radar_event_versions", "insert into public.kd_radar_evidence", "Candidate muss vor Evidenz entstehen");
  assertBefore(importNormalized, "insert into public.kd_radar_evidence", "update public.kd_radar_event_versions", "Evidenz muss vor Bestätigung entstehen");
  assert.match(importNormalized, /update public\.kd_radar_event_versions[\s\S]{0,500}verification_status\s*=\s*'confirmed'/);
  assertBefore(importNormalized, "update public.kd_radar_event_versions", "update public.kd_radar_events", "Bestätigung muss vor Eventpointer stehen");
  assert.match(importNormalized, /update public\.kd_radar_events[\s\S]{0,500}current_candidate_version_id[\s\S]{0,500}current_confirmed_version_id/);
  assertBefore(importNormalized, "update public.kd_radar_events", "insert into public.kd_radar_reviews", "Pointer muss vor Review stehen");
  assert.match(importNormalized, /insert into public\.kd_radar_reviews[\s\S]{0,500}'confirm'/);
  assertBefore(importNormalized, "insert into public.kd_radar_reviews", `insert into ${ledgerName}`, "Ledger muss der letzte fachliche Write sein");
});

check("Bestehende Event-Key-Kollision scheitert fail-closed und es gibt keinen Batchpfad", () => {
  const eventInsert = importNormalized.indexOf("insert into public.kd_radar_events");
  const collisionRead = importNormalized.lastIndexOf("from public.kd_radar_events", eventInsert);
  const eventLock = calls(importFn, "pg_advisory_xact_lock").map(compact).find((lock) => /event_key/.test(lock));
  assert.ok(eventLock);
  assert.ok(collisionRead >= 0 && collisionRead < eventInsert, "Event-Key-Kollision wird nicht vor dem Insert geprüft");
  assert.match(importNormalized.slice(collisionRead, eventInsert), /event_key/);
  assert.match(importNormalized.slice(collisionRead, eventInsert), /raise exception/);
  assert.doesNotMatch(importNormalized, /foreach|jsonb_to_recordset\s*\(\s*p_payload|jsonb_array_elements\s*\(\s*p_payload\s*\)/);
});

const feedFn = functionSql(pilotSql, "kd_radar_pilot_feed");
const feedNormalized = compact(feedFn);
const feedPairs = jsonObjectPairs(feedFn);
const expectedTopKeys = [
  "format", "revision", "checksum", "reconciledAt", "subscriptions",
  "events", "receipts", "operationAcks", "radarReview",
];
const expectedNestedKeysets = [
  ["targetId", "targetType", "title", "region", "scope", "status", "updatedAt"],
  ["eventId", "eventVersionId", "targetId", "eventType", "date", "region", "platform", "lifecycleStatus", "verificationStatus"],
  ["eventVersionId", "status", "updatedAt"],
  ["operationId", "targetId", "status", "revision", "checksum"],
];

check("Operation-ACKs verwenden einen gültigen Nichtleer-/Exaktschlüssel-Guard", () => {
  assert.doesNotMatch(pilotSql, /\bjsonb_object_length\s*\(/i);
  const operationAcks = statementsUsingTable(feedFn, "kd_radar_operations")
    .find((statement) => /'operationid'/.test(statement) && /'targetid'/.test(statement));
  assert.ok(operationAcks, "Operation-ACK-Projektionsquery fehlt");
  assert.match(operationAcks, /(?:\b[a-z_][a-z0-9_]*\.)?result\s*\?&\s*array\s*\[/);
  const guards = [...operationAcks.matchAll(/\bnot\s+exists\s*\(/g)].map((match) => {
    const openAt = operationAcks.indexOf("(", match.index);
    const closeAt = findBalancedEnd(operationAcks, openAt);
    return closeAt > openAt ? operationAcks.slice(match.index, closeAt + 1) : "";
  });
  const exactKeyGuard = guards.find((guard) => /jsonb_object_keys\s*\(\s*(?:[a-z_][a-z0-9_]*\.)?result\s*\)/.test(guard));
  assert.ok(exactKeyGuard, "jsonb_object_keys-basierter Exaktschlüssel-Guard fehlt");
  const expectedExactKeys = ["operationid", "targetid", "status", "revision", "checksum"];
  const exactGuardMatch = /not\s+in\s*\(/i.exec(exactKeyGuard);
  assert.ok(exactGuardMatch, "jsonb_object_keys-basierter NOT-IN-Guard fehlt");
  const openAt = exactKeyGuard.indexOf("(", exactGuardMatch.index);
  const closeAt = findBalancedEnd(exactKeyGuard, openAt);
  assert.ok(closeAt > openAt, "NOT-IN-Guard ist unvollständig");
  const exactKeys = Array.from(
    exactKeyGuard.slice(openAt + 1, closeAt).matchAll(/'([^']+)'/g),
    (match) => match[1]
  );
  assert.equal(new Set(exactKeys).size, expectedExactKeys.length, "NOT-IN-Whitelist enthält Duplikate oder abweichende Länge");
  assert.equal(exactKeys.length, expectedExactKeys.length, "NOT-IN-Whitelist hat nicht exakt 5 Einträge");
  const exactKeySet = new Set(exactKeys);
  for (const key of expectedExactKeys) {
    assert.ok(exactKeySet.has(key), `NOT-IN-Whitelist fehlt erwarteten Schlüssel: ${key}`);
  }
});

check("Feed besitzt exakt den vereinbarten Top-Level und explizite verschachtelte Projektionen", () => {
  const topLevel = feedPairs.find((pairs) => {
    const keys = pairs.map(([key]) => key);
    return keys.length === expectedTopKeys.length && expectedTopKeys.every((key) => keys.includes(key));
  });
  assert.ok(topLevel, "Exaktes Feed-Top-Level fehlt");
  assert.deepEqual(new Set(topLevel.map(([key]) => key)).size, expectedTopKeys.length);
  const nested = feedPairs.filter((pairs) => pairs !== topLevel);
  for (const expectedKeys of expectedNestedKeysets) {
    const projection = nested.find((pairs) => {
      const keys = pairs.map(([key]) => key);
      return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
    });
    assert.ok(projection, `Explizite Feed-Projektion fehlt: ${expectedKeys.join(", ")}`);
    assert.equal(new Set(projection.map(([key]) => key)).size, expectedKeys.length);
  }
  assert.doesNotMatch(feedNormalized, /\brow_to_json\s*\(|\bto_jsonb\s*\(\s*[a-z_][a-z0-9_]*\s*\)|\bjsonb?_agg\s*\(\s*[a-z_][a-z0-9_]*\s*\)|\bselect\s+(?:[a-z_][a-z0-9_]*\.)?\*/);
});

check("Feed gibt target_key als targetId aus und leakt keine internen IDs oder globale Metadaten", () => {
  const allPairs = feedPairs.flat();
  const targetPairs = allPairs.filter(([key]) => key === "targetId");
  assert.ok(targetPairs.length >= 2, "Subscription- und Event-Targetprojektion fehlen");
  for (const [, value] of targetPairs) {
    assert.match(compact(value), /target_key/);
    assert.doesNotMatch(compact(value), /(?:^|\W)target_id(?:\W|$)/);
  }
  const forbiddenKeys = new Set([
    "accountId", "account_id", "actorId", "actor_id", "event_id",
    "event_version_id", "versionId", "target_id", "sourceId",
    "publisherFamily", "canonicalUrl", "url", "subscriberCount", "subscribers",
  ]);
  for (const [key] of allPairs) assert.equal(forbiddenKeys.has(key), false, `Verbotener Feed-Key: ${key}`);
  assert.doesNotMatch(feedNormalized, /publisher_family|canonical_url|subscriber_count|count\s*\([^)]*account_id/);
});

check("Jede Feed-Datenquelle ist in ihrer eigenen Query an den Aufrufer gebunden", () => {
  const projectionStatement = (table, keys) => statementsUsingTable(feedFn, table).find(
    (statement) => keys.every((key) => statement.includes(`'${key.toLowerCase()}'`)),
  );
  const subscriptions = projectionStatement("kd_radar_subscriptions", ["targetId", "scope"]);
  const receipts = projectionStatement("kd_radar_receipts", ["eventVersionId", "status"]);
  const operationAcks = projectionStatement("kd_radar_operations", ["operationId", "targetId"]);
  const events = projectionStatement("kd_radar_events", ["eventId", "eventType"]);
  assert.ok(subscriptions, "Subscription-Projektionsquery fehlt");
  assert.ok(receipts, "Receipt-Projektionsquery fehlt");
  assert.ok(operationAcks, "Operation-ACK-Projektionsquery fehlt");
  assert.ok(events, "Event-Projektionsquery fehlt");
  assert.ok(hasOwnAccountBinding(subscriptions, feedFn), "Subscriptions sind nicht an eigene account_id gebunden");
  assert.ok(hasOwnAccountBinding(receipts, feedFn), "Receipts sind nicht an eigene account_id gebunden");
  assert.ok(hasOwnAccountBinding(operationAcks, feedFn), "Operation-Acks sind nicht an eigene account_id gebunden");
  assert.ok(hasOwnAccountBinding(events, feedFn), "Events sind nicht über eigene Subscription gebunden");
  assert.match(events, /(?:from|join) public\.kd_radar_subscriptions/);
  assert.match(events, /subscription_status\s*=\s*'active'/);
  assert.match(events, /current_confirmed_version_id/);
  assert.match(events, /verification_status\s*=\s*'confirmed'/);
  assert.match(events, /lifecycle_status\s*(?:<>|!=|is\s+distinct\s+from)\s*'retracted'/);
  assert.ok(
    /operation_id\s*=\s*any\s*\(\s*p_operation_ids\s*\)/.test(operationAcks)
      || /unnest\s*\(\s*p_operation_ids\s*\)[\s\S]*operation_id|operation_id[\s\S]*unnest\s*\(\s*p_operation_ids\s*\)/.test(operationAcks),
    "ACK-Auswahl muss in derselben Query auf p_operation_ids begrenzt sein",
  );
  assert.doesNotMatch(feedNormalized, new RegExp(`public\\.${escapeRegex(ledgerCandidates[0])}\\b`));
});

check("radarReview ist ein fail-closed Boolean aus der eigenen Capability", () => {
  const capabilityStatements = statementsUsingTable(feedFn, "kd_radar_capabilities")
    .filter((statement) => /radar_review/.test(statement));
  const radarReviewValues = feedPairs.flat().filter(([key]) => key === "radarReview").map(([, value]) => compact(value));
  assert.equal(radarReviewValues.length, 1);
  assert.doesNotMatch(radarReviewValues[0], /^(?:true|false|null)$/);
  const viaVerifiedHelper = /public\.kd_radar_review_allowed\(\)/.test(radarReviewValues[0]);
  assert.ok(
    viaVerifiedHelper || capabilityStatements.some((statement) => hasOwnAccountBinding(statement, feedFn)),
    "radarReview ist weder über den geprüften Helper noch direkt an eigene account_id gebunden",
  );
  assert.ok(
    viaVerifiedHelper
      || capabilityStatements.some((statement) => /coalesce\s*\([^;]*radar_review[^;]*false\s*\)|radar_review\s+is\s+true/.test(statement))
      || /coalesce\s*\([^;]*false\s*\)/.test(radarReviewValues[0]),
    "radarReview muss nullsicher als boolean projiziert werden",
  );
});

check("Review-Immutable-Vertrag und globale Fail-closed-Schalter bleiben unangetastet", () => {
  assert.doesNotMatch(executable, /(?:update|delete from) public\.kd_radar_reviews/);
  assert.doesNotMatch(executable, /grant (?:all|update|delete)[^;]*on table public\.kd_radar_reviews/);
  assert.doesNotMatch(executable, /(?:alter table(?: if exists)?(?: only)?|insert into|update) public\.kd_radar_settings/);
  assert.doesNotMatch(executable, /(?:insert into|update) public\.kd_radar_capabilities/);
  for (const flag of [
    "radar_aktiv", "radar_shares_aktiv", "radar_provider_aktiv",
    "radar_scheduler_aktiv", "radar_proposal_import_aktiv",
  ]) {
    assert.doesNotMatch(executable, new RegExp(`${flag}\\s*=\\s*true`));
  }
});

check("Migration enthält keine Aktivierung, personenbezogene Kennung oder externe Routine", () => {
  const forbiddenIdentifier = /\b(?:max(?:imilian)?|rinke)\b/i;
  const uuidLiteral = /['"]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]?/i;
  const email = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
  assert.doesNotMatch(pilotSql, email);
  assert.doesNotMatch(runbook, email);
  assert.doesNotMatch(pilotSql, uuidLiteral);
  assert.doesNotMatch(runbook, uuidLiteral);
  assert.doesNotMatch(pilotSql, forbiddenIdentifier);
  assert.doesNotMatch(runbook, forbiddenIdentifier);
  assert.doesNotMatch(executable, /\bauth\.users\b[\s\S]{0,100}\bvalues\b/);
  assert.doesNotMatch(executable, /pg_cron|cron\.schedule|create extension|net\.http|http_post|webhook|\bfetch\s*\(|edge[_ -]?function|provider[_ -]?run|scheduler[_ -]?run/i);
  assert.doesNotMatch(executable, /create (?:or replace )?function[\s\S]{0,160}(?:cron|scheduler|provider|workflow|ai_|ki_)/i);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("RADAR-PILOT-MIGRATION-TEST BESTANDEN");

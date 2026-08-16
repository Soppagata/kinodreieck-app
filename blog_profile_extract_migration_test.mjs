/* Statischer Scope- und Driftvertrag fuer die additive E17A-Konfiguration. */
import { readFileSync } from "node:fs";

const pfad = new URL(
  "./supabase/migrations/20260817120000_blog_profile_extract_config.sql",
  import.meta.url,
);
const sql = readFileSync(pfad, "utf8");
let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok += 1;
  console.log("✓ " + name);
}

check("Migration beruehrt ausschliesslich vorhandene kd_ai_limits-Objekte",
  !/\binsert\b/i.test(sql)
  && !/\b(?:create|alter|drop|truncate|delete)\b/i.test(sql)
  && (sql.match(/update\s+public\.kd_ai_limits/gi) || []).length === 3);
check("Genau die drei eingefrorenen Konfigurationsobjekte werden adressiert",
  ["task_modell", "task_max_tokens", "task_max_reservierung_usd_cent"]
    .every((name) => new RegExp(`schluessel\\s*=\\s*'${name}'`, "i").test(sql))
  && !/\b(?:notiz|geaendert_at|changed_at|ai_aktiv|modell_alias|preise_usd_cent_pro_mtok)\b/i.test(sql));
check("Alle drei Updates setzen nur blog-profile-extract und behalten andere JSON-Schluessel",
  (sql.match(/jsonb_set\s*\(\s*wert\s*,\s*'\{blog-profile-extract\}'/gi) || []).length === 3
  && !/\bwert\s*=\s*'\{/i.test(sql));
check("Fehlende oder formfremde Konfigurationsobjekte stoppen statt anzulegen",
  (sql.match(/jsonb_typeof\s*\(\s*v_wert\s*\)\s+is\s+distinct\s+from\s+'object'/gi) || []).length === 3
  && /raise\s+exception/i.test(sql));
check("Vorhandene abweichende Taskwerte stoppen fail-closed",
  (sql.match(/\?\s*'blog-profile-extract'/g) || []).length >= 3
  && (sql.match(/is\s+distinct\s+from/gi) || []).length >= 6);
check("Exakt gleiche Werte bleiben idempotent erlaubt",
  /to_jsonb\s*\(\s*'klein'::text\s*\)/i.test(sql)
  && /to_jsonb\s*\(\s*2048\s*\)/i.test(sql)
  && /to_jsonb\s*\(\s*5\s*\)/i.test(sql));
check("Migration enthaelt keine generische RPC-, ACL-, RLS- oder Nutzer-Aenderung",
  !/\b(?:function|procedure|policy|grant|revoke|row level security|account_id|auth\.)\b/i.test(sql));

console.log(`blog_profile_extract_migration_test: ${ok} Checks bestanden.`);

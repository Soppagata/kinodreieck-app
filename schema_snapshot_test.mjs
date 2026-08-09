/* Geheimnisfreier Current-Schema-Vertrag. Der Snapshot ist kein Datendump. */

import fs from "node:fs";

const sql = fs.readFileSync("supabase/current_schema.sql", "utf8");
const accessBasis = fs.readFileSync(
  "supabase/migrations/20260809120000_rollen_v1_access_basis.sql", "utf8",
);
const accessEnforcement = fs.readFileSync(
  "supabase/migrations/20260809121000_rollen_v1_access_enforcement.sql", "utf8",
);
const aiKostenzaun = fs.readFileSync(
  "supabase/migrations/20260808120000_ai_anbieter_request_kostenzaun.sql", "utf8",
);
let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const treffer = (muster) => (sql.match(muster) || []).length;
function dollarBody(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const lowerAs = text.indexOf("as $$", start);
  const upperAs = text.indexOf("AS $$", start);
  const as = lowerAs < 0 ? upperAs : upperAs < 0 ? lowerAs : Math.min(lowerAs, upperAs);
  if (as < 0) return null;
  const ende = text.indexOf("$$;", as + 5);
  return ende < 0 ? null : text.slice(as + 5, ende).trim();
}
check("Snapshot erklärt Herkunft und Datenfreiheit",
  /Current-Schema-Snapshot/.test(sql)
  && /Keine Tabellenzeilen, Konten oder Secrets/.test(sql));
check("Snapshot enthält keine Tabelleninhalte",
  !/^(?:COPY|INSERT INTO|\\connect)\b/m.test(sql));
check("Snapshot enthält keine erkennbaren Zugangsdaten",
  !/sb_secret_|sk-ant-|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|PASSWORD\s*=/i.test(sql)
  && !/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(sql));
check("Erwarteter Stand enthält alle 21 Anwendungstabellen",
  treffer(/^CREATE TABLE IF NOT EXISTS "public"\./gm) === 21);
check("Schemastand enthält Funktionen, Trigger und Policies",
  treffer(/^CREATE OR REPLACE FUNCTION "public"\./gm) === 47
  && treffer(/^CREATE OR REPLACE TRIGGER /gm) === 15
  && treffer(/^CREATE POLICY /gm) === 26);
for (const tabelle of [
  "kd_account_access",
  "kd_catalog",
  "kd_personal",
  "kd_series_watch",
  "kd_shared_article_claims",
  "kd_shared_articles",
  "kd_ai_log",
  "kd_filmwerke",
  "kd_store",
]) {
  check(`Snapshot enthält ${tabelle}`,
    sql.includes(`CREATE TABLE IF NOT EXISTS "public"."${tabelle}"`));
}
check("Legacy-kd_store ist vollständig statt nur als Tabellenname dokumentiert",
  /FUNCTION "public"\."kd_key_ok"/.test(sql)
  && /TRIGGER "kd_touch_trg"/.test(sql)
  && /POLICY "sel_demo" ON "public"\."kd_store"/.test(sql)
  && /POLICY "sel_user" ON "public"\."kd_store"/.test(sql));
check("Accountdaten bleiben über auth.uid kontogebunden",
  /POLICY "kdp_sel"[\s\S]+?"account_id" = \( SELECT "auth"\."uid"\(\)/.test(sql)
  && /POLICY "kdsa_owner_select"[\s\S]+?"account_id" = \( SELECT "auth"\."uid"\(\)/.test(sql)
  && /POLICY "kdsw_sel"[\s\S]+?"account_id" = \( SELECT "auth"\."uid"\(\)/.test(sql)
  && treffer(/CREATE POLICY "(?:kdp|kdsw|kdsa_)[^\n]+"kd_account_active"/g) === 12);
check("Rollen-v1-Access ist klein, own-select-only und fail-closed",
  /CREATE TABLE IF NOT EXISTS "public"\."kd_account_access"[\s\S]+?"role" "text" DEFAULT 'member'/.test(sql)
  && /"kd_account_access_role_valid" CHECK[\s\S]+?'member'[\s\S]+?'owner'/.test(sql)
  && /"kd_account_access_personal_ai_requires_active" CHECK \(\(NOT "personal_ai" OR "active"\)\)/.test(sql)
  && /POLICY "kdaa_own_select"[^\n]+"account_id" = \( SELECT "auth"\."uid"\(\)/.test(sql)
  && /FUNCTION "public"\."kd_account_active"\(\) RETURNS boolean[\s\S]+?STABLE SECURITY DEFINER[\s\S]+?SET "search_path" TO 'pg_catalog', 'public'/.test(sql)
  && /GRANT SELECT ON TABLE "public"\."kd_account_access" TO "authenticated"/.test(sql)
  && !/GRANT (?:ALL|INSERT|UPDATE|DELETE)[^\n]+"kd_account_access" TO "authenticated"/.test(sql));
check("Snapshot enthält den vollständigen Anbieterrequest-Kostenzaun",
  dollarBody(
    aiKostenzaun,
    "create or replace function public.kd_ai_auftrag_starten(",
  ) === dollarBody(
    sql,
    "CREATE OR REPLACE FUNCTION \"public\".\"kd_ai_auftrag_starten\"(",
  )
  && /anbieter_request_max_usd_cent/.test(sql)
  && /media-batch-extract/.test(sql)
  && /anbieter-request-kostenlimit-ueberschritten/.test(sql));
check("Wochenplan und atomare Serienbeobachtung sind im Schemavertrag",
  /'kd:wochenplan'::"text"/.test(sql)
  && /FUNCTION "public"\."kd_set_series_watch"/.test(sql)
  && /REVOKE ALL ON FUNCTION "public"\."kd_set_series_watch"[^\n]+FROM PUBLIC/.test(sql));
check("Blog-Uploads haben atomare, kontogebundene Einmal-Tokens",
  /"kd_shared_articles_share_token_key" UNIQUE \("share_token"\)/.test(sql)
  && /"kd_shared_article_claims_pkey" PRIMARY KEY \("account_id", "share_token"\)/.test(sql)
  && /FUNCTION "public"\."kd_claim_shared_article"/.test(sql)
  && /REVOKE ALL ON FUNCTION "public"\."kd_claim_shared_article"[^\n]+FROM "anon"/.test(sql));
check("Öffentlicher Katalogvertrag enthält den gemeinsamen Demo-Seed",
  /POLICY "kd_catalog_read_public"[\s\S]+?'demo_seed'::"text"/.test(sql));
check("Streaming-Katalog ist getrennt und bleibt für alte Publisher kompatibel",
  /'streaming_bekannt'::"text"/.test(sql)
  && /'streaming_entdecken'::"text"/.test(sql)
  && /FUNCTION "public"\."kd_catalog_streaming_aufteilen"/.test(sql)
  && /TRIGGER "kd_catalog_streaming_split"/.test(sql));
check("Nur die beiden getrennten Demo-Teile sind zusätzlich öffentlich",
  /POLICY "kd_catalog_read_public"[\s\S]+?'streaming_bekannt_demo'::"text"[\s\S]+?'streaming_entdecken_demo'::"text"/.test(sql)
  && /POLICY "kd_catalog_read_konto"[^\n]+?"kd_account_active"/.test(sql));

check("Access-Basis kollidiert fail-closed und enthält keine Bootstrap-ID",
  /create table public\.kd_account_access\s*\(/i.test(accessBasis)
  && !/create table if not exists public\.kd_account_access/i.test(accessBasis)
  && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(accessBasis)
  && /revoke all on table public\.kd_account_access\s+from public, anon, authenticated/i.test(accessBasis)
  && /grant select on table public\.kd_account_access to authenticated/i.test(accessBasis)
  && /grant select, insert, update, delete on table public\.kd_account_access\s+to service_role/i.test(accessBasis));

const preflightEnde = accessEnforcement.indexOf("-- Persoenlicher Sync-Speicher");
const erstePolicyAenderung = accessEnforcement.search(/\b(?:drop|create) policy\b/i);
check("Enforcement prüft Not-Aus und vollständigen Bootstrap vor jeder Policy",
  /rollen_v1_preflight_ai_aktiv_muss_false_sein/.test(accessEnforcement)
  && /lock table auth\.users in share mode/.test(accessEnforcement)
  && /where schluessel = 'ai_aktiv'\s+for update/.test(accessEnforcement)
  && /from auth\.users as u\s+left join public\.kd_account_access/i.test(accessEnforcement)
  && /v_access_rows <> v_auth_accounts/.test(accessEnforcement)
  && preflightEnde > 0
  && erstePolicyAenderung > preflightEnde
  && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(accessEnforcement));

for (const policy of [
  "kdp_sel", "kdp_ins", "kdp_upd", "kdp_del",
  "kdsw_sel", "kdsw_ins", "kdsw_upd", "kdsw_del",
  "kdsa_owner_select", "kdsa_owner_insert", "kdsa_owner_update", "kdsa_owner_delete",
  "kdai_log_sel", "kd_catalog_read_konto", "kd_quellen_read_konto",
]) {
  const start = accessEnforcement.indexOf(`create policy ${policy}`);
  const next = accessEnforcement.indexOf(";", start);
  check(`Enforcement schützt Policy ${policy} mit active`,
    start >= 0 && next > start
    && accessEnforcement.slice(start, next).includes("kd_account_active"));
}

check("SECURITY-DEFINER- und Serien-RPCs prüfen active vor Datenzugriff",
  /function public\.kd_claim_shared_article[\s\S]+?if not public\.kd_account_active\(\)[\s\S]+?insert into public\.kd_shared_article_claims/i.test(accessEnforcement)
  && /function public\.kd_filmwissen_aktuell_lesen[\s\S]+?if not public\.kd_account_active\(\)[\s\S]+?select w\.\* into v_werk/i.test(accessEnforcement)
  && /function public\.kd_set_series_watch[\s\S]+?if not public\.kd_account_active\(\)[\s\S]+?delete from public\.kd_series_watch/i.test(accessEnforcement));

check("Serien-RPC nutzt in Migration und Snapshot denselben sicheren Search-Path",
  /function public\.kd_set_series_watch\(p_watchmode_ids bigint\[\]\)[\s\S]{0,180}?set search_path = pg_catalog, public/i.test(accessEnforcement)
  && /FUNCTION "public"\."kd_set_series_watch"\("p_watchmode_ids" bigint\[\]\)[\s\S]{0,180}?SET "search_path" TO 'pg_catalog', 'public'/.test(sql));

check("Enforcement entzieht RLS-Umgehungsrechte auf den geschützten Browserflächen",
  /revoke all on table public\.kd_personal from public, anon, authenticated/.test(accessEnforcement)
  && /revoke all on table public\.kd_shared_articles from public, anon, authenticated/.test(accessEnforcement)
  && /revoke all on table public\.kd_catalog from public, anon, authenticated/.test(accessEnforcement)
  && /revoke all on sequence public\.kd_ai_log_id_seq from public, anon, authenticated/.test(accessEnforcement)
  && /grant select on table public\.kd_catalog to anon, authenticated/.test(accessEnforcement));

check("Legacy-Tabellenrechte schließen TRUNCATE und MAINTAIN ohne active-Umdeutung aus",
  /revoke all on table public\.kd_store from public, anon, authenticated/.test(accessEnforcement)
  && /grant select, insert, update, delete on table public\.kd_store to anon/.test(accessEnforcement)
  && /revoke all on table public\.kd_owner from public, anon, authenticated/.test(accessEnforcement)
  && /grant execute on function public\.kd_key_ok\(text\)\s+to anon, service_role/.test(accessEnforcement)
  && !/grant (?:all|[^;]*(?:truncate|maintain)[^;]*) on table public\.kd_store to (?:anon|authenticated)/i.test(accessEnforcement)
  && !/grant [^;]+ on table public\.kd_owner to (?:anon|authenticated)/i.test(accessEnforcement));

check("Snapshot hält den tokenfreien Legacy-ACL-Vertrag exakt fest",
  /GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"\."kd_store" TO "anon"/.test(sql)
  && !/GRANT (?:ALL|[^\n]*(?:TRUNCATE|MAINTAIN)[^\n]*) ON TABLE "public"\."kd_store" TO "(?:anon|authenticated)"/.test(sql)
  && !/GRANT [^\n]+ ON TABLE "public"\."kd_owner" TO "(?:anon|authenticated)"/.test(sql)
  && /REVOKE ALL ON FUNCTION "public"\."kd_key_ok"\("the_owner" "text"\) FROM PUBLIC/.test(sql)
  && /GRANT ALL ON FUNCTION "public"\."kd_key_ok"\("the_owner" "text"\) TO "anon"/.test(sql)
  && !/GRANT ALL ON FUNCTION "public"\."kd_key_ok"\("the_owner" "text"\) TO "authenticated"/.test(sql));

check("Öffentliche und Legacy-Policies bleiben außerhalb der active-Enforcement",
  !/create\s+policy\s+kd_catalog_read_public/i.test(accessEnforcement)
  && !/(?:alter table|drop policy|create policy)[^;\n]*kd_store/i.test(accessEnforcement)
  && !/(?:alter table|drop policy|create policy)[^;\n]*kd_owner/i.test(accessEnforcement)
  && !/(?:create|replace)\s+function\s+public\.kd_key_ok/i.test(accessEnforcement));

console.log(`schema_snapshot_test: ${ok} Checks bestanden.`);

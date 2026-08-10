import assert from "node:assert/strict";
import fs from "node:fs";

const path = "./supabase/migrations/20260809180000_event_radar_local_basis.sql";
const sql = fs.readFileSync(new URL(path, import.meta.url), "utf8");
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };

check("Migration liegt nach Rollen-v1 und ist ausdrücklich nur lokal", () => {
  assert.match(path, /20260809180000/);
  assert.match(sql, /NUR LOKAL VORBEREITET\. NICHT REMOTE ANGEWANDT/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

check("kd_personal-Allowlist enthält exakt die 18 bekannten persönlichen Töpfe", () => {
  const block = sql.match(/add constraint kd_personal_key_erlaubt[\s\S]*?check \(key in \(([\s\S]*?)\)\);/)?.[1] || "";
  const keys = [...block.matchAll(/'((?:kd:)[^']+)'/g)].map((match) => match[1]);
  assert.equal(keys.length, 18);
  assert.equal(new Set(keys).size, 18);
  assert.ok(keys.includes("kd:radar"));
  assert.ok(keys.includes("kd:master"));
  assert.ok(keys.includes("kd:geschmacksprofil"));
});

check("Alle fünf Wirkungswege starten fail-closed auf false", () => {
  for (const flag of [
    "radar_aktiv", "radar_shares_aktiv", "radar_provider_aktiv",
    "radar_scheduler_aktiv", "radar_proposal_import_aktiv",
  ]) {
    assert.match(sql, new RegExp(`${flag}\\s+boolean\\s+not null default false`));
  }
  assert.match(sql, /not radar_provider_aktiv or radar_aktiv/);
  assert.match(sql, /not radar_shares_aktiv or radar_aktiv/);
  assert.match(sql, /not radar_scheduler_aktiv or radar_aktiv/);
  assert.match(sql, /not radar_proposal_import_aktiv or radar_aktiv/);
});

check("Event-Radar-Tabellen sind additiv und Personen-Automatik bleibt absent", () => {
  for (const table of [
    "kd_radar_settings", "kd_radar_capabilities", "kd_radar_sources", "kd_radar_targets",
    "kd_radar_checks", "kd_radar_account_state", "kd_radar_subscriptions",
    "kd_radar_target_shares", "kd_radar_operations", "kd_radar_share_operations",
    "kd_radar_events", "kd_radar_event_versions",
    "kd_radar_evidence", "kd_radar_reviews", "kd_radar_receipts",
  ]) assert.match(sql, new RegExp(`create table public\\.${table}\\b`));
  assert.doesNotMatch(sql, /create table public\.kd_radar_(?:discovery|person)/i);
  assert.doesNotMatch(sql, /radar_discovery_aktiv/i);
});

check("Kreisfreigaben sind vom Abo getrennt und werden bei Widerruf zweckgebunden entfernt", () => {
  const shares = sql.match(/create table public\.kd_radar_target_shares \(([\s\S]*?)\n\);/)?.[1] || "";
  assert.match(shares, /primary key \(account_id, target_id\)/);
  assert.match(shares, /share_status\s+text[\s\S]*?check \(share_status = 'active'\)/);
  assert.doesNotMatch(shares, /person|discovery|receipt|subscription_status/i);
  assert.match(sql, /create table public\.kd_radar_share_operations/);
  assert.match(sql, /if p_share_enabled then[\s\S]*?else\s+delete from public\.kd_radar_target_shares/);
  assert.match(sql, /if p_status <> 'active' then\s+delete from public\.kd_radar_target_shares/);
});

check("Globaler Targetstatus bleibt vom persönlichen Subscriptionstatus getrennt", () => {
  assert.match(sql, /target_status\s+text[\s\S]*?active','ambiguous','retired/);
  assert.match(sql, /subscription_status\s+text[\s\S]*?active','paused/);
  assert.match(sql, /primary key \(account_id, target_id\)/);
  assert.doesNotMatch(sql, /update public\.kd_radar_targets[\s\S]{0,300}subscription_status/);
});

check("Scopeänderung bleibt dieselbe Account-Target-Zeile", () => {
  const fn = sql.match(/create or replace function public\.kd_set_radar_subscription[\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(fn, /on conflict \(account_id, target_id\) do update/);
  assert.match(fn, /scope = excluded\.scope/);
  assert.match(fn, /region = 'AT'/);
});

check("Quota ist kontoweit atomar und nur radar_unlimited hebt sie auf", () => {
  const fn = sql.match(/create or replace function public\.kd_set_radar_subscription[\s\S]*?\n\$\$;/)?.[0] || "";
  const lockAt = fn.indexOf("pg_advisory_xact_lock");
  const countAt = fn.indexOf("select count(*) into v_active_others");
  const writeAt = fn.indexOf("insert into public.kd_radar_subscriptions");
  assert.ok(lockAt > 0 && countAt > lockAt && writeAt > countAt);
  assert.match(fn, /v_active_others >= 10/);
  assert.match(fn, /select radar_unlimited/);
  assert.doesNotMatch(fn, /\bowner\b/i);
});

check("Idempotenzledger erkennt gleiche Operation und abweichenden Payload", () => {
  const fn = sql.match(/create or replace function public\.kd_set_radar_subscription[\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(fn, /where account_id = v_account_id and operation_id = p_operation_id/);
  assert.match(fn, /radar_operation_conflict/);
  assert.match(fn, /return v_previous_result/);
  assert.match(fn, /insert into public\.kd_radar_operations/);
});

check("Eventidentität enthält kein Datum; Datum lebt nur in unveränderlicher Version", () => {
  const events = sql.match(/create table public\.kd_radar_events \(([\s\S]*?)\n\);/)?.[1] || "";
  const versions = sql.match(/create table public\.kd_radar_event_versions \(([\s\S]*?)\n\);/)?.[1] || "";
  assert.match(events, /event_key\s+text\s+not null unique/);
  assert.doesNotMatch(events, /event_date/);
  assert.match(versions, /event_date\s+date\s+not null/);
  assert.match(versions, /verification_status\s+text\s+not null default 'candidate'/);
  assert.match(sql, /create trigger kd_radar_event_version_guard/);
  assert.match(sql, /radar_event_version_identity_immutable/);
  assert.match(sql, /radar_confirmed_version_immutable/);
});

check("Kandidaten- und Bestätigt-Zeiger sind getrennt und eventgebunden", () => {
  assert.match(sql, /current_candidate_version_id uuid/);
  assert.match(sql, /current_confirmed_version_id uuid/);
  assert.match(sql, /foreign key \(event_id, current_candidate_version_id\)/);
  assert.match(sql, /foreign key \(event_id, current_confirmed_version_id\)/);
  assert.match(sql, /unique \(event_id, event_version_id\)/);
});

check("Evidence und Review referenzieren zwingend die Terminversion", () => {
  assert.match(sql, /event_version_id\s+uuid\s+not null references public\.kd_radar_event_versions/);
  assert.match(sql, /create table public\.kd_radar_reviews[\s\S]*?event_version_id/);
  assert.match(sql, /grant select, insert on table public\.kd_radar_reviews to service_role/);
  assert.doesNotMatch(sql, /grant (?:update|delete|all) on table public\.kd_radar_reviews/);
  assert.match(sql, /create trigger kd_radar_evidence_guard/);
  assert.match(sql, /create trigger kd_radar_source_identity_guard/);
  assert.match(sql, /radar_evidence_claim_mismatch/);
  assert.match(sql, /count\(distinct ev\.publisher_family\)/);
  assert.match(sql, /v_family_count < 2/);
});

check("Globale Radarwahrheit bleibt ohne Browser-SELECT", () => {
  for (const table of [
    "kd_radar_targets", "kd_radar_checks", "kd_radar_events", "kd_radar_event_versions",
    "kd_radar_evidence", "kd_radar_sources", "kd_radar_operations",
    "kd_radar_target_shares", "kd_radar_share_operations",
  ]) {
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
    assert.doesNotMatch(sql, new RegExp(`grant select on table public\\.${table} to authenticated`));
  }
});

check("Eigene Cache-, Subscription- und Receipt-Zeilen sind RLS-geschützt", () => {
  for (const policy of ["kdras_own_select", "kdrsub_own_select", "kdrrec_own_select"]) {
    assert.match(sql, new RegExp(`create policy ${policy}`));
  }
  assert.match(sql, /account_id = \(select auth\.uid\(\)\) and \(select public\.kd_account_active\(\)\)/);
  assert.doesNotMatch(sql, /create policy \w+ on public\.kd_radar_target_shares/);
});

check("RPCs prüfen Login, active und Radar-Not-Aus vor Fachwrite", () => {
  for (const name of [
    "kd_set_radar_subscription", "kd_set_radar_target_share", "kd_get_radar_feed",
    "kd_get_radar_shared_targets", "kd_set_radar_receipt",
  ]) {
    const fn = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`))?.[0] || "";
    assert.match(fn, /v_account_id is null/);
    assert.match(fn, /public\.kd_account_active\(\)/);
    assert.match(fn, /radar_disabled/);
  }
});

check("Minimierter Feed liest nur eigene Abos und bestätigte Terminversion", () => {
  const fn = sql.match(/create or replace function public\.kd_get_radar_feed[\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(fn, /s\.account_id = v_account_id/);
  assert.match(fn, /s\.subscription_status = 'active'/);
  assert.match(fn, /v\.event_version_id = e\.current_confirmed_version_id/);
  assert.match(fn, /v\.verification_status = 'confirmed'/);
  assert.match(fn, /'shares', v_shares/);
  assert.doesNotMatch(fn, /subscriber|publisher_family|canonical_url|accountId/);
});

check("Share-RPC verlangt eigenes aktives Abo und ist separat idempotent", () => {
  const fn = sql.match(/create or replace function public\.kd_set_radar_target_share[\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(fn, /s\.account_id = v_account_id/);
  assert.match(fn, /s\.subscription_status = 'active'/);
  assert.match(fn, /radar_active_subscription_required/);
  assert.match(fn, /public\.kd_radar_share_operations/);
  assert.match(fn, /radar_share_operation_conflict/);
  assert.match(fn, /p_share_enabled and not coalesce[\s\S]*?radar_shares_aktiv/);
  assert.doesNotMatch(fn, /kd_radar_operations[^_]/);
});

check("Kreisfeed ist dedupliziert und enthält keine Identitäts- oder Zeitmetadaten", () => {
  const fn = sql.match(/create or replace function public\.kd_get_radar_shared_targets[\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(fn, /select distinct t\.target_id, t\.target_type, t\.canonical_title/);
  assert.match(fn, /sh\.share_status = 'active'/);
  assert.match(fn, /s\.subscription_status = 'active'/);
  assert.match(fn, /radar_shares_disabled/);
  assert.doesNotMatch(fn, /accountId|actor|author|shareId|createdAt|updatedAt|count\s*\(/i);
});

check("Receipt-RPC verlangt ein eigenes aktives Abo für genau das Event", () => {
  const fn = sql.match(/create or replace function public\.kd_set_radar_receipt[\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(fn, /s\.account_id = v_account_id/);
  assert.match(fn, /s\.subscription_status = 'active'/);
  assert.match(fn, /radar_event_not_subscribed/);
});

check("Migration richtet keinerlei Routine, Netzwerktransport oder Providerlauf ein", () => {
  assert.doesNotMatch(sql, /pg_cron|cron\.schedule|create extension|net\.http|http_post|webhook|fetch\s*\(/i);
  assert.doesNotMatch(sql, /create (?:trigger|function)[\s\S]{0,120}(?:scheduler|provider_run|proposal_import)/i);
});

check("Bestehende Serien-, Rollen- und Shared-Article-Verträge werden nicht verändert", () => {
  assert.doesNotMatch(sql, /alter table public\.(?:kd_series_watch|kd_account_access|kd_shared_articles)/i);
  assert.doesNotMatch(sql, /create or replace function public\.(?:kd_set_series_watch|kd_account_active|kd_share_article)/i);
});

check("Remote-Reihenfolge und Rückweg bleiben ein neuer STOP", () => {
  assert.match(sql, /Spaeterer Remote-Preflight \(NICHT in Phase 2 ausfuehren\)/);
  assert.match(sql, /diese Datei einzeln anwenden und alle fuenf false-Flags ruecklesen/);
  assert.match(sql, /Kein Scheduler-, Function-, Provider- oder Proposal-Import-Start/);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("RADAR-MIGRATION-TEST BESTANDEN");

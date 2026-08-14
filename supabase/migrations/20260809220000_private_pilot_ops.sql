-- Kinodreieck · Private-Pilot Betrieb (Etappe 10)
-- Additiv vorbereitet; Provider, Scheduler, Purge-Cadence und Self-Delete
-- beginnen/enden AUS. Kein Browser erhält Schreib- oder EXECUTE-Rechte.
begin;

create table public.kd_private_settings (
  singleton boolean primary key default true check (singleton),
  export_enabled boolean not null default false,
  provider_requests_enabled boolean not null default false,
  scheduler_enabled boolean not null default false,
  purge_enabled boolean not null default false,
  delete_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.kd_private_settings (singleton) values (true);

create table public.kd_private_provider_registry (
  provider_id text primary key check (provider_id ~ '^[a-z0-9_]{2,40}$'),
  purpose text not null check (char_length(purpose) between 3 and 300),
  feature_enabled boolean not null default false,
  rights_confirmed boolean not null default false,
  dpa_transfer_confirmed boolean not null default false,
  retention_confirmed boolean not null default false,
  price_budget_confirmed boolean not null default false,
  legal_status text not null default 'LEGAL_OR_PROVIDER_REVIEW_REQUIRED',
  official_source text not null,
  reviewed_at date,
  updated_at timestamptz not null default now(),
  constraint kd_private_provider_activation_guard check (
    not feature_enabled or (
      rights_confirmed and dpa_transfer_confirmed and retention_confirmed
      and price_budget_confirmed and legal_status = 'APPROVED'
      and reviewed_at is not null
    )
  )
);

insert into public.kd_private_provider_registry
  (provider_id, purpose, official_source)
values
  ('anthropic', 'ausdruecklich aktivierte KI-Aufgaben', 'https://privacy.claude.com/en/articles/15425996-data-retention-practices-for-covered-models'),
  ('watchmode', 'Streaming-Kataloganreicherung', 'https://api.watchmode.com/docs/'),
  ('wikidata', 'deterministische Filmmetadaten', 'https://www.wikidata.org/wiki/Wikidata:Data_access'),
  ('loc', 'gemeinfreie Filmmetadaten', 'https://www.loc.gov/apis/'),
  ('film_at', 'Kinoprogrammquelle', 'https://www.film.at/'),
  ('nonstopkino', 'Kinoprogrammquelle', 'https://nonstopkino.at/datenschutz/');

create or replace function public.kd_private_provider_allowed(p_provider_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'ok', coalesce(s.provider_requests_enabled, false)
      and coalesce(p.feature_enabled, false)
      and coalesce(p.rights_confirmed, false)
      and coalesce(p.dpa_transfer_confirmed, false)
      and coalesce(p.retention_confirmed, false)
      and coalesce(p.price_budget_confirmed, false)
      and p.legal_status = 'APPROVED'
      and p.reviewed_at >= current_date - 90,
    'code', case
      when not coalesce(s.provider_requests_enabled, false) then 'PROVIDER_GLOBAL_OFF'
      when p.provider_id is null or not p.feature_enabled then 'PROVIDER_REGISTRY_OFF'
      when not p.rights_confirmed or not p.dpa_transfer_confirmed
        or not p.retention_confirmed or p.legal_status <> 'APPROVED'
        then 'LEGAL_OR_PROVIDER_REVIEW_REQUIRED'
      when not p.price_budget_confirmed then 'BUDGET_UNKNOWN'
      when p.reviewed_at is null or p.reviewed_at < current_date - 90 then 'PROVIDER_REVIEW_STALE'
      else 'PROVIDER_ALLOWED'
    end
  )
  from public.kd_private_settings s
  left join public.kd_private_provider_registry p on p.provider_id = p_provider_id
  where s.singleton
$$;

create table public.kd_private_retention_registry (
  data_class text primary key,
  retention_days integer check (retention_days in (0, 7, 30, 90) or retention_days is null),
  purpose_bound boolean not null default false,
  purge_trigger text not null,
  constraint kd_private_retention_shape check ((retention_days is null) = purpose_bound)
);
insert into public.kd_private_retention_registry values
  ('raw_payload_prompt_snippet_image_export_copy', 0, false, 'never_persist'),
  ('local_restore_adoption_snapshot', 7, false, 'local_read_write_boot'),
  ('terminal_operation_orphan_detail_support', 30, false, 'manual_service_purge'),
  ('content_free_run_cost_review_capability', 90, false, 'manual_service_purge'),
  ('active_personal_subscription_receipt_preference_share', null, true, 'revoke_subscription_end_account_delete');

-- Die Retention-Spalten entstehen bereits in der unmittelbar vorhergehenden,
-- auf diesem Ziel noch nicht angewandten Radar-Erstmigration. Dadurch braucht
-- dieser Pre-Write-Lauf weder Daten-Backfills noch nachträgliche Constraint-
-- DROP-Schritte.
create index kd_radar_operations_expires on public.kd_radar_operations (expires_at) where expires_at is not null;
create index kd_radar_share_operations_expires on public.kd_radar_share_operations (expires_at) where expires_at is not null;
create index kd_radar_targets_orphaned on public.kd_radar_targets (orphaned_at) where orphaned_at is not null;
create index kd_radar_checks_expires on public.kd_radar_checks (expires_at) where expires_at is not null;

create or replace function public.kd_private_mark_operation_ttl()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.terminal_at := coalesce(new.terminal_at, now());
  new.expires_at := coalesce(new.expires_at, new.terminal_at + interval '30 days');
  return new;
end
$$;
create trigger kd_radar_operations_private_ttl
  before insert or update on public.kd_radar_operations
  for each row execute function public.kd_private_mark_operation_ttl();
create trigger kd_radar_share_operations_private_ttl
  before insert or update on public.kd_radar_share_operations
  for each row execute function public.kd_private_mark_operation_ttl();

create or replace function public.kd_private_mark_check_ttl()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.check_status in ('ok','no_change','failed','ambiguous','deferred_budget') then
    new.terminal_at := coalesce(new.terminal_at, now());
    new.expires_at := coalesce(new.expires_at, new.terminal_at + interval '30 days');
    new.active := false;
  else
    new.terminal_at := null;
    new.expires_at := null;
  end if;
  return new;
end
$$;
create trigger kd_radar_checks_private_ttl
  before insert or update on public.kd_radar_checks
  for each row execute function public.kd_private_mark_check_ttl();

create or replace function public.kd_private_refresh_target_orphan()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare v_target_id uuid;
begin
  v_target_id := case when tg_op = 'DELETE' then old.target_id else new.target_id end;
  update public.kd_radar_targets t
     set orphaned_at = case
       when exists (select 1 from public.kd_radar_subscriptions s where s.target_id = v_target_id)
         or exists (select 1 from public.kd_radar_target_shares sh where sh.target_id = v_target_id)
       then null else coalesce(t.orphaned_at, now()) end
   where t.target_id = v_target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
create trigger kd_radar_subscriptions_private_orphan
  after insert or update or delete on public.kd_radar_subscriptions
  for each row execute function public.kd_private_refresh_target_orphan();
create trigger kd_radar_target_shares_private_orphan
  after insert or update or delete on public.kd_radar_target_shares
  for each row execute function public.kd_private_refresh_target_orphan();

alter table public.kd_series_watch
  add constraint kd_series_watch_account_id_fkey
    foreign key (account_id) references auth.users(id) on delete cascade;

create table public.kd_private_delete_map (
  storage_class text primary key,
  account_column text,
  action text not null check (action in ('cascade', 'explicit_delete', 'intentionally_retained')),
  reason text not null
);
insert into public.kd_private_delete_map values
  ('auth.users', 'id', 'cascade', 'Auth user is deleted last by server-only admin API'),
  ('kd_account_access', 'account_id', 'cascade', 'private-pilot access row'),
  ('kd_personal', 'account_id', 'cascade', 'all registered personal pots including Radar and profile'),
  ('kd_ai_log', 'account_id', 'cascade', 'personal content-free AI operation metadata'),
  ('kd_series_watch', 'account_id', 'cascade', 'series observations'),
  ('kd_shared_articles', 'account_id', 'cascade', 'explicitly published projections'),
  ('kd_shared_article_claims', 'account_id', 'cascade', 'personal shared claims'),
  ('kd_radar_capabilities', 'account_id', 'cascade', 'account capability'),
  ('kd_radar_account_state', 'account_id', 'cascade', 'account checksum state'),
  ('kd_radar_subscriptions', 'account_id', 'cascade', 'personal subscriptions'),
  ('kd_radar_target_shares', 'account_id', 'cascade', 'personal shares'),
  ('kd_radar_operations', 'account_id', 'cascade', 'idempotency results'),
  ('kd_radar_share_operations', 'account_id', 'cascade', 'share idempotency results'),
  ('kd_radar_receipts', 'account_id', 'cascade', 'personal receipts'),
  ('kd_radar_reviews', 'actor_id', 'cascade', 'review actor link'),
  ('browser_auth_session', null, 'explicit_delete', 'removed only after server confirmation'),
  ('browser_account_cache', null, 'explicit_delete', 'removed only after server confirmation'),
  ('logical_dumps', null, 'intentionally_retained', 'maximum 30 days with deletion ledger; provider review required');

create table public.kd_private_delete_operations (
  account_hash text not null check (account_hash ~ '^[a-f0-9]{64}$'),
  operation_id uuid not null,
  status text not null check (status in ('started', 'data_deleted', 'complete', 'auth_failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  primary key (account_hash, operation_id)
);
create index kd_private_delete_operations_expires on public.kd_private_delete_operations (expires_at);

create or replace function public.kd_private_own_data(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text := encode(extensions.digest(convert_to(p_account_id::text, 'UTF8'), 'sha256'), 'hex');
  v_result jsonb;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'access', (select to_jsonb(a) - 'account_id' from public.kd_account_access a where a.account_id = p_account_id),
    'personal', coalesce((select jsonb_agg(to_jsonb(p) - 'account_id' order by p.key) from public.kd_personal p where p.account_id = p_account_id), '[]'::jsonb),
    'aiLogs', coalesce((select jsonb_agg(jsonb_build_object('operationId', l.vorgang_id, 'task', l.task, 'status', l.status, 'modelAlias', l.modell_alias, 'promptVersion', l.prompt_version, 'profileVersion', l.profil_version, 'costUsdCent', l.kosten_usd_cent, 'startedAt', l.gestartet_at, 'finishedAt', l.beendet_at) order by l.gestartet_at) from public.kd_ai_log l where l.account_id = p_account_id), '[]'::jsonb),
    'seriesWatch', coalesce((select jsonb_agg(to_jsonb(w) - 'account_id' order by w.updated_at) from public.kd_series_watch w where w.account_id = p_account_id), '[]'::jsonb),
    'sharedArticles', coalesce((select jsonb_agg(to_jsonb(a) - 'account_id' order by a.updated_at) from public.kd_shared_articles a where a.account_id = p_account_id), '[]'::jsonb),
    'sharedClaims', coalesce((select jsonb_agg(to_jsonb(c) - 'account_id' order by c.claimed_at) from public.kd_shared_article_claims c where c.account_id = p_account_id), '[]'::jsonb),
    'radar', jsonb_build_object(
      'capabilities', (select to_jsonb(c) - 'account_id' from public.kd_radar_capabilities c where c.account_id = p_account_id),
      'accountState', (select to_jsonb(st) - 'account_id' from public.kd_radar_account_state st where st.account_id = p_account_id),
      'subscriptions', coalesce((select jsonb_agg(to_jsonb(s) - 'account_id' order by s.updated_at) from public.kd_radar_subscriptions s where s.account_id = p_account_id), '[]'::jsonb),
      'receipts', coalesce((select jsonb_agg(to_jsonb(r) - 'account_id' order by r.updated_at) from public.kd_radar_receipts r where r.account_id = p_account_id), '[]'::jsonb),
      'shares', coalesce((select jsonb_agg(to_jsonb(sh) - 'account_id' order by sh.updated_at) from public.kd_radar_target_shares sh where sh.account_id = p_account_id), '[]'::jsonb),
      'operations', coalesce((select jsonb_agg(to_jsonb(o) - 'account_id' order by o.created_at) from public.kd_radar_operations o where o.account_id = p_account_id), '[]'::jsonb),
      'shareOperations', coalesce((select jsonb_agg(to_jsonb(o) - 'account_id' order by o.created_at) from public.kd_radar_share_operations o where o.account_id = p_account_id), '[]'::jsonb),
      'reviews', coalesce((select jsonb_agg(to_jsonb(rv) - 'actor_id' order by rv.created_at) from public.kd_radar_reviews rv where rv.actor_id = p_account_id), '[]'::jsonb)
    ),
    'retention', (select coalesce(jsonb_agg(to_jsonb(rr) order by rr.data_class), '[]'::jsonb) from public.kd_private_retention_registry rr),
    'deletion', jsonb_build_object(
      'enabled', coalesce((select s.delete_enabled from public.kd_private_settings s where s.singleton), false),
      'lastStatus', (select o.status from public.kd_private_delete_operations o where o.account_hash = v_hash order by o.started_at desc limit 1)
    )
  ) into v_result;
  return v_result;
end
$$;

create or replace function public.kd_private_delete_begin(
  p_account_id uuid, p_operation_id uuid, p_account_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_existing public.kd_private_delete_operations%rowtype;
begin
  if current_user not in ('postgres', 'service_role') then raise exception 'service role required' using errcode = '42501'; end if;
  if not exists (select 1 from public.kd_private_settings where singleton and delete_enabled) then return jsonb_build_object('ok', false, 'code', 'DELETE_DISABLED'); end if;
  if p_account_hash !~ '^[a-f0-9]{64}$' or p_account_hash <> encode(extensions.digest(convert_to(p_account_id::text, 'UTF8'), 'sha256'), 'hex') then return jsonb_build_object('ok', false, 'code', 'ACCOUNT_HASH_MISMATCH'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account_hash, 0));
  select * into v_existing from public.kd_private_delete_operations where account_hash = p_account_hash and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'already_deleted', v_existing.status = 'complete', 'status', v_existing.status); end if;
  if exists (select 1 from public.kd_private_delete_operations where account_hash = p_account_hash and started_at > now() - interval '1 hour') then return jsonb_build_object('ok', false, 'code', 'DELETE_RATE_LIMIT'); end if;
  insert into public.kd_private_delete_operations(account_hash, operation_id, status) values (p_account_hash, p_operation_id, 'started');
  return jsonb_build_object('ok', true, 'already_deleted', false, 'status', 'started');
end
$$;

create or replace function public.kd_private_delete_finish(
  p_operation_id uuid, p_account_hash text, p_succeeded boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if current_user not in ('postgres', 'service_role') then raise exception 'service role required' using errcode = '42501'; end if;
  update public.kd_private_delete_operations
     set status = case when p_succeeded then 'complete' else 'auth_failed' end,
         finished_at = now()
   where account_hash = p_account_hash and operation_id = p_operation_id and status in ('started', 'auth_failed');
  return jsonb_build_object('ok', found, 'status', case when p_succeeded then 'complete' else 'auth_failed' end);
end
$$;

create or replace function public.kd_private_retention_run(p_dry_run boolean default true, p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_ops integer; v_share_ops integer; v_checks integer; v_ai integer; v_delete integer; v_targets integer;
  v_target_id uuid;
begin
  if current_user not in ('postgres', 'service_role') then raise exception 'service role required' using errcode = '42501'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('kd_private_retention_run', 0)) then return jsonb_build_object('ok', false, 'code', 'LOCKED'); end if;
  select least(count(*), v_limit)::integer into v_ops from public.kd_radar_operations where coalesce(expires_at, created_at + interval '30 days') <= now();
  select least(count(*), v_limit)::integer into v_share_ops from public.kd_radar_share_operations where coalesce(expires_at, created_at + interval '30 days') <= now();
  select least(count(*), v_limit)::integer into v_checks from public.kd_radar_checks where expires_at <= now();
  select least(count(*), v_limit)::integer into v_ai from public.kd_ai_log where gestartet_at <= now() - interval '90 days';
  select least(count(*), v_limit)::integer into v_delete from public.kd_private_delete_operations where expires_at <= now();
  select least(count(*), v_limit)::integer into v_targets from public.kd_radar_targets t where t.orphaned_at <= now() - interval '30 days' and not exists (select 1 from public.kd_radar_subscriptions s where s.target_id = t.target_id) and not exists (select 1 from public.kd_radar_target_shares sh where sh.target_id = t.target_id) and not exists (select 1 from public.kd_radar_events e where e.target_id = t.target_id);
  if not p_dry_run then
    if not exists (select 1 from public.kd_private_settings where singleton and purge_enabled) then return jsonb_build_object('ok', false, 'code', 'PURGE_DISABLED', 'dryRun', false); end if;
    delete from public.kd_radar_operations where ctid in (select ctid from public.kd_radar_operations where coalesce(expires_at, created_at + interval '30 days') <= now() limit v_limit);
    delete from public.kd_radar_share_operations where ctid in (select ctid from public.kd_radar_share_operations where coalesce(expires_at, created_at + interval '30 days') <= now() limit v_limit);
    update public.kd_radar_checks newer
       set superseded_by = null
     where newer.superseded_by in (select expired.check_id from public.kd_radar_checks expired where expired.expires_at <= now() limit v_limit);
    delete from public.kd_radar_checks where check_id in (select check_id from public.kd_radar_checks where expires_at <= now() limit v_limit);
    delete from public.kd_ai_log where ctid in (select ctid from public.kd_ai_log where gestartet_at <= now() - interval '90 days' limit v_limit);
    delete from public.kd_private_delete_operations where ctid in (select ctid from public.kd_private_delete_operations where expires_at <= now() limit v_limit);
    for v_target_id in
      select t.target_id from public.kd_radar_targets t
       where t.orphaned_at <= now() - interval '30 days'
         and not exists (select 1 from public.kd_radar_subscriptions s where s.target_id = t.target_id)
         and not exists (select 1 from public.kd_radar_target_shares sh where sh.target_id = t.target_id)
         and not exists (select 1 from public.kd_radar_events e where e.target_id = t.target_id)
       order by t.orphaned_at limit v_limit
    loop
      begin
        delete from public.kd_radar_targets where target_id = v_target_id;
      exception when others then
        update public.kd_radar_targets set orphaned_at = now() where target_id = v_target_id;
      end;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'dryRun', p_dry_run, 'due', jsonb_build_object('operations', v_ops, 'shareOperations', v_share_ops, 'checks', v_checks, 'aiLogs', v_ai, 'deleteLedger', v_delete, 'orphanTargets', v_targets));
end
$$;

alter table public.kd_private_settings enable row level security;
alter table public.kd_private_provider_registry enable row level security;
alter table public.kd_private_retention_registry enable row level security;
alter table public.kd_private_delete_map enable row level security;
alter table public.kd_private_delete_operations enable row level security;
revoke all on table public.kd_private_settings, public.kd_private_provider_registry,
  public.kd_private_retention_registry, public.kd_private_delete_map,
  public.kd_private_delete_operations from public, anon, authenticated;
grant select, insert, update, delete on table public.kd_private_settings,
  public.kd_private_provider_registry, public.kd_private_retention_registry,
  public.kd_private_delete_map, public.kd_private_delete_operations to service_role;
revoke all on function public.kd_private_provider_allowed(text), public.kd_private_own_data(uuid),
  public.kd_private_delete_begin(uuid, uuid, text), public.kd_private_delete_finish(uuid, text, boolean),
  public.kd_private_retention_run(boolean, integer) from public, anon, authenticated;
grant execute on function public.kd_private_provider_allowed(text), public.kd_private_own_data(uuid),
  public.kd_private_delete_begin(uuid, uuid, text), public.kd_private_delete_finish(uuid, text, boolean),
  public.kd_private_retention_run(boolean, integer) to service_role;

notify pgrst, 'reload schema';
commit;

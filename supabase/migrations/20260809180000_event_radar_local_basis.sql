-- Kinodreieck · Event-Radar Phase 2 · lokale additive Grundlage
-- ==========================================================================
-- STATUS: NUR LOKAL VORBEREITET. NICHT REMOTE ANGEWANDT.
--
-- Diese Migration baut ausschließlich den Event-Radar. Die nach dem
-- Pflichtspike geparkte Personen-Automatik besitzt hier weder Tabelle noch
-- RPC noch Flag. Alle Radar-, Share-, Provider-, Scheduler- und Proposal-Importschalter
-- starten fail-closed auf false. Es wird kein Job und keine Extension für eine
-- Routine angelegt.
--
-- Späterer Remote-Lauf ausschließlich nach neuem Owner-STOP, einzeln gegen den
-- exakt rückgelesenen Rollen-v1-Stand. Kein `supabase db push`. Bei einem
-- Fehler: Transaktion zurückrollen beziehungsweise additiv vorwärts reparieren;
-- keine vorhandenen persönlichen Daten löschen.
-- ==========================================================================

begin;

-- Der neue persönliche Cache-/Outbox-/Receipt-Topf reist über den bestehenden
-- kd_personal-Vertrag. Die vollständige Allowlist wird bewusst neu gesetzt,
-- damit ein Tippfehler keinen alten Topf verliert.
alter table public.kd_personal
  drop constraint if exists kd_personal_key_erlaubt;
alter table public.kd_personal
  add constraint kd_personal_key_erlaubt
  check (key in (
    'kd:master', 'kd:artikel', 'kd:kino-pins', 'kd:wochenplan', 'kd:radar',
    'kd:merkliste', 'kd:vokabular', 'kd:einstellungen',
    'kd:entdecken-status', 'kd:autor-name', 'kd:streaming-dienste',
    'kd:mustwatch', 'kd:achievements', 'kd:zeitgrenze',
    'kd:filter-mediathek', 'kd:filter-kino', 'kd:filter-streaming',
    'kd:geschmacksprofil'
  ));
comment on constraint kd_personal_key_erlaubt on public.kd_personal is
  'Erlaubte persoenliche Toepfe (18, Event-Radar Phase 2).';

create table public.kd_radar_settings (
  singleton              boolean     primary key default true check (singleton),
  radar_aktiv             boolean     not null default false,
  radar_shares_aktiv      boolean     not null default false,
  radar_provider_aktiv    boolean     not null default false,
  radar_scheduler_aktiv   boolean     not null default false,
  radar_proposal_import_aktiv boolean  not null default false,
  updated_at              timestamptz not null default now(),
  constraint kd_radar_provider_requires_radar
    check (not radar_provider_aktiv or radar_aktiv),
  constraint kd_radar_shares_require_radar
    check (not radar_shares_aktiv or radar_aktiv),
  constraint kd_radar_scheduler_requires_radar
    check (not radar_scheduler_aktiv or radar_aktiv),
  constraint kd_radar_proposal_import_requires_radar
    check (not radar_proposal_import_aktiv or radar_aktiv)
);

insert into public.kd_radar_settings (singleton) values (true);

comment on table public.kd_radar_settings is
  'Service-only Not-Aus. Phase-2-Defaults bleiben vollstaendig false.';

create table public.kd_radar_capabilities (
  account_id       uuid        primary key references auth.users(id) on delete cascade,
  radar_unlimited  boolean     not null default false,
  radar_review     boolean     not null default false,
  updated_at       timestamptz not null default now()
);

comment on table public.kd_radar_capabilities is
  'Getrennte Radar-Fachcapabilities; Rollen-v1 owner wird nicht umgedeutet.';

create table public.kd_radar_sources (
  source_id             text        primary key,
  domain                text        not null unique,
  publisher_family      text        not null,
  source_class          text        not null
                                    check (source_class in ('official','editorial','aggregator','unknown')),
  rights_status         text        not null
                                    check (rights_status in ('approved','blocked','re_audit','manual_only','parked')),
  attribution_approved  boolean     not null default false,
  subdomains_allowed    boolean     not null default false,
  active                boolean     not null default false,
  terms_checked_at      date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint kd_radar_source_id_form check (char_length(source_id) between 3 and 128),
  constraint kd_radar_source_domain_form
    check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+$'),
  constraint kd_radar_source_activation_guard
    check (not active or (rights_status = 'approved' and attribution_approved))
);

create table public.kd_radar_targets (
  target_id       uuid        primary key default gen_random_uuid(),
  target_key      text        not null unique,
  target_type     text        not null check (target_type in ('work','series','franchise')),
  target_status   text        not null default 'active'
                              check (target_status in ('active','ambiguous','retired')),
  canonical_title text        not null,
  external_ids    jsonb       not null default '{}'::jsonb
                              check (jsonb_typeof(external_ids) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  orphaned_at     timestamptz,
  constraint kd_radar_target_key_form check (char_length(target_key) between 3 and 160),
  constraint kd_radar_target_title_form check (char_length(canonical_title) between 1 and 200)
);

comment on table public.kd_radar_targets is
  'Globale kanonische Event-Ziele. Browser besitzen keinen Direktzugriff.';

create table public.kd_radar_checks (
  check_id               uuid        primary key default gen_random_uuid(),
  target_id              uuid        not null references public.kd_radar_targets(target_id) on delete cascade,
  check_key              text        not null unique,
  region                 text        not null default 'AT' check (region = 'AT'),
  scope                  text        not null default 'all' check (scope in ('all','cinema','streaming')),
  query_version          text        not null,
  provider_version       text        not null,
  check_status           text        not null default 'idle'
                                      check (check_status in ('idle','leased','ok','no_change','failed','ambiguous','deferred_budget')),
  request_state          text        not null default 'not_started'
                                      check (request_state in ('not_started','reserved','sent','settled','unknown')),
  active                 boolean     not null default false,
  next_check_at          timestamptz,
  last_attempt_at        timestamptz,
  last_successful_check  timestamptz,
  result_hash            text,
  revalidate_after       timestamptz,
  lease_until            timestamptz,
  fencing_token          uuid,
  superseded_by          uuid        references public.kd_radar_checks(check_id),
  terminal_at            timestamptz,
  expires_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint kd_radar_check_key_form check (char_length(check_key) between 3 and 500),
  constraint kd_radar_check_versions_form
    check (char_length(query_version) between 1 and 64 and char_length(provider_version) between 1 and 64),
  constraint kd_radar_check_lease_fenced
    check ((lease_until is null and fencing_token is null) or (lease_until is not null and fencing_token is not null))
);

create unique index kd_radar_checks_one_active_route
  on public.kd_radar_checks (target_id, region, scope)
  where active;

create table public.kd_radar_account_state (
  account_id    uuid        primary key references auth.users(id) on delete cascade,
  revision      bigint      not null default 0 check (revision >= 0),
  checksum      text,
  updated_at    timestamptz not null default now(),
  constraint kd_radar_account_checksum_form
    check (checksum is null or checksum ~ '^[a-f0-9]{64}$')
);

create table public.kd_radar_subscriptions (
  account_id        uuid        not null references auth.users(id) on delete cascade,
  target_id         uuid        not null references public.kd_radar_targets(target_id) on delete cascade,
  region            text        not null default 'AT' check (region = 'AT'),
  scope             text        not null default 'all' check (scope in ('all','cinema','streaming')),
  subscription_status text      not null default 'active' check (subscription_status in ('active','paused')),
  server_revision   bigint      not null check (server_revision > 0),
  last_operation_id uuid        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint kd_radar_subscriptions_pkey primary key (account_id, target_id)
);

create index kd_radar_subscriptions_active_target
  on public.kd_radar_subscriptions (target_id)
  where subscription_status = 'active';

create table public.kd_radar_target_shares (
  account_id        uuid        not null references auth.users(id) on delete cascade,
  target_id         uuid        not null references public.kd_radar_targets(target_id) on delete cascade,
  share_status      text        not null default 'active' check (share_status = 'active'),
  last_operation_id uuid        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint kd_radar_target_shares_pkey primary key (account_id, target_id)
);

create index kd_radar_target_shares_active_target
  on public.kd_radar_target_shares (target_id)
  where share_status = 'active';

comment on table public.kd_radar_target_shares is
  'Explizite Event-Ziel-Freigaben; getrennt von Abo, Receipt und Personen-Discovery.';

create table public.kd_radar_operations (
  account_id    uuid        not null references auth.users(id) on delete cascade,
  operation_id  uuid        not null,
  request_hash  text        not null check (request_hash ~ '^[a-f0-9]{32}$'),
  result        jsonb       not null check (jsonb_typeof(result) = 'object'),
  terminal_at   timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint kd_radar_operations_pkey primary key (account_id, operation_id)
);

create table public.kd_radar_share_operations (
  account_id    uuid        not null references auth.users(id) on delete cascade,
  operation_id  uuid        not null,
  request_hash  text        not null check (request_hash ~ '^[a-f0-9]{32}$'),
  result        jsonb       not null check (jsonb_typeof(result) = 'object'),
  terminal_at   timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint kd_radar_share_operations_pkey primary key (account_id, operation_id)
);

create table public.kd_radar_events (
  event_id                     uuid        primary key default gen_random_uuid(),
  event_key                    text        not null unique,
  target_id                    uuid        not null references public.kd_radar_targets(target_id) on delete cascade,
  event_type                   text        not null check (event_type in ('kinostart_at','streamingstart_at','serienstart','staffelstart')),
  region                       text        not null default 'AT' check (region = 'AT'),
  platform                     text        not null default '-',
  lifecycle_status             text        not null default 'scheduled'
                                           check (lifecycle_status in ('announced','scheduled','retracted')),
  current_candidate_version_id uuid,
  current_confirmed_version_id uuid,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint kd_radar_event_key_form check (char_length(event_key) between 3 and 500),
  constraint kd_radar_event_platform_contract
    check ((event_type = 'streamingstart_at' and platform <> '-') or (event_type <> 'streamingstart_at' and platform = '-'))
);

comment on column public.kd_radar_events.event_key is
  'Stabile Identitaet aus Werk, Eventtyp, Region und Plattform; enthaelt kein Datum.';

create table public.kd_radar_event_versions (
  event_version_id    uuid        primary key default gen_random_uuid(),
  event_id            uuid        not null references public.kd_radar_events(event_id) on delete cascade,
  event_date          date        not null,
  date_precision      text        not null default 'day' check (date_precision = 'day'),
  verification_status text        not null default 'candidate'
                                  check (verification_status in ('candidate','corroborated','confirmed','ambiguous')),
  last_verified_at    timestamptz,
  source_state_hash   text,
  created_at          timestamptz not null default now(),
  constraint kd_radar_event_versions_event_version_unique unique (event_id, event_version_id),
  constraint kd_radar_event_version_hash_form
    check (source_state_hash is null or source_state_hash ~ '^[a-f0-9]{64}$'),
  constraint kd_radar_event_version_verified_fields
    check (verification_status not in ('corroborated','confirmed')
      or (last_verified_at is not null and source_state_hash is not null))
);

alter table public.kd_radar_events
  add constraint kd_radar_event_candidate_pointer
  foreign key (event_id, current_candidate_version_id)
  references public.kd_radar_event_versions(event_id, event_version_id)
  deferrable initially deferred;

alter table public.kd_radar_events
  add constraint kd_radar_event_confirmed_pointer
  foreign key (event_id, current_confirmed_version_id)
  references public.kd_radar_event_versions(event_id, event_version_id)
  deferrable initially deferred;

create table public.kd_radar_evidence (
  evidence_id       uuid        primary key default gen_random_uuid(),
  event_version_id  uuid        not null references public.kd_radar_event_versions(event_version_id) on delete cascade,
  source_id         text        not null references public.kd_radar_sources(source_id),
  canonical_url     text        not null,
  publisher_family  text        not null,
  source_class      text        not null check (source_class in ('official','editorial','aggregator','unknown')),
  claimed_date      date        not null,
  event_type        text        not null check (event_type in ('kinostart_at','streamingstart_at','serienstart','staffelstart')),
  region            text        not null check (region = 'AT'),
  platform          text        not null default '-',
  fingerprint       text        not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  retrieved_at      timestamptz not null,
  created_at        timestamptz not null default now(),
  constraint kd_radar_evidence_url_unique unique (event_version_id, canonical_url),
  constraint kd_radar_evidence_fingerprint_unique unique (event_version_id, fingerprint),
  constraint kd_radar_evidence_url_form
    check (canonical_url ~ '^https://[^[:space:]]+$')
);

create or replace function public.kd_guard_radar_source_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.kd_radar_evidence where source_id = old.source_id)
     and (
       new.source_id is distinct from old.source_id
       or new.domain is distinct from old.domain
       or new.publisher_family is distinct from old.publisher_family
       or new.source_class is distinct from old.source_class
       or new.subdomains_allowed is distinct from old.subdomains_allowed
     ) then
    raise exception 'radar_source_identity_immutable_after_evidence' using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger kd_radar_source_identity_guard
  before update on public.kd_radar_sources
  for each row execute function public.kd_guard_radar_source_identity();

-- Evidence ist kein frei beschriftbares JSON: Quelle, Publisherfamilie und
-- Ereignisbehauptung muessen der registrierten Quelle sowie exakt derselben
-- Terminversion entsprechen. Ein einmal gespeicherter Beleg ist unveraenderlich.
create or replace function public.kd_guard_radar_evidence()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_source_domain       text;
  v_publisher_family    text;
  v_source_class        text;
  v_subdomains_allowed  boolean;
  v_event_date          date;
  v_event_type          text;
  v_region              text;
  v_platform            text;
  v_url_authority       text;
  v_url_host            text;
begin
  if tg_op = 'UPDATE' and new is distinct from old then
    raise exception 'radar_evidence_immutable' using errcode = '55000';
  end if;

  select s.domain, s.publisher_family, s.source_class, s.subdomains_allowed,
         v.event_date, e.event_type, e.region, e.platform
    into v_source_domain, v_publisher_family, v_source_class, v_subdomains_allowed,
         v_event_date, v_event_type, v_region, v_platform
    from public.kd_radar_event_versions v
    join public.kd_radar_events e on e.event_id = v.event_id
    join public.kd_radar_sources s on s.source_id = new.source_id
   where v.event_version_id = new.event_version_id
     and s.active
     and s.rights_status = 'approved'
     and s.attribution_approved;
  if not found then
    raise exception 'radar_evidence_source_or_version_unavailable' using errcode = '23514';
  end if;

  if new.publisher_family <> v_publisher_family or new.source_class <> v_source_class
     or new.claimed_date <> v_event_date or new.event_type <> v_event_type
     or new.region <> v_region or new.platform <> v_platform then
    raise exception 'radar_evidence_claim_mismatch' using errcode = '23514';
  end if;

  v_url_authority := substring(new.canonical_url from '^https://([^/]+)');
  if v_url_authority is null or position('@' in v_url_authority) > 0
     or position(':' in v_url_authority) > 0 then
    raise exception 'radar_evidence_url_mismatch' using errcode = '23514';
  end if;
  v_url_host := lower(v_url_authority);
  if v_url_host <> v_source_domain and not (
    v_subdomains_allowed and right(v_url_host, char_length(v_source_domain) + 1) = '.' || v_source_domain
  ) then
    raise exception 'radar_evidence_url_mismatch' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger kd_radar_evidence_guard
  before insert or update on public.kd_radar_evidence
  for each row execute function public.kd_guard_radar_evidence();

create or replace function public.kd_guard_radar_evidence_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.kd_radar_event_versions
     where event_version_id = old.event_version_id
       and verification_status in ('corroborated','confirmed')
  ) then
    raise exception 'radar_verified_evidence_delete_forbidden' using errcode = '55000';
  end if;
  return old;
end
$$;

create trigger kd_radar_evidence_delete_guard
  before delete on public.kd_radar_evidence
  for each row execute function public.kd_guard_radar_evidence_delete();

-- Das Datum und die Ereigniszuordnung einer Version werden nie umgeschrieben.
-- Korroboration/Bestaetigung ist nur mit passenden, unabhaengigen Belegen
-- moeglich; bestaetigte Versionen werden bei Rueckzug ueber das Event markiert,
-- nicht zu einem schwaecheren Verifikationsstatus zurueckgestuft.
create or replace function public.kd_guard_radar_event_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_family_count integer := 0;
begin
  if tg_op = 'UPDATE' and (
    new.event_id is distinct from old.event_id
    or new.event_date is distinct from old.event_date
    or new.date_precision is distinct from old.date_precision
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'radar_event_version_identity_immutable' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.verification_status = 'confirmed'
     and new.verification_status <> 'confirmed' then
    raise exception 'radar_confirmed_version_immutable' using errcode = '55000';
  end if;

  if new.verification_status in ('corroborated','confirmed') then
    select count(distinct ev.publisher_family) into v_family_count
      from public.kd_radar_evidence ev
      join public.kd_radar_sources s on s.source_id = ev.source_id
     where ev.event_version_id = new.event_version_id
       and ev.publisher_family = s.publisher_family
       and ev.source_class = s.source_class
       and ev.source_class in ('official','editorial')
       and s.active and s.rights_status = 'approved' and s.attribution_approved;
  end if;
  if new.verification_status = 'corroborated' and v_family_count < 1 then
    raise exception 'radar_corroboration_evidence_insufficient' using errcode = '23514';
  end if;
  if new.verification_status = 'confirmed' and v_family_count < 2 then
    raise exception 'radar_confirmation_evidence_insufficient' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger kd_radar_event_version_guard
  before insert or update on public.kd_radar_event_versions
  for each row execute function public.kd_guard_radar_event_version();

create or replace function public.kd_check_radar_event_pointers()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_candidate_id uuid;
  v_confirmed_id uuid;
begin
  select current_candidate_version_id, current_confirmed_version_id
    into v_candidate_id, v_confirmed_id
    from public.kd_radar_events
   where event_id = new.event_id;
  if v_candidate_id is not null and not exists (
    select 1 from public.kd_radar_event_versions
     where event_id = new.event_id and event_version_id = v_candidate_id
  ) then
    raise exception 'radar_candidate_pointer_invalid' using errcode = '23514';
  end if;
  if v_confirmed_id is not null and not exists (
    select 1 from public.kd_radar_event_versions
     where event_id = new.event_id and event_version_id = v_confirmed_id
       and verification_status = 'confirmed'
  ) then
    raise exception 'radar_confirmed_pointer_invalid' using errcode = '23514';
  end if;
  if v_confirmed_id is null and exists (
    select 1 from public.kd_radar_event_versions
     where event_id = new.event_id and verification_status = 'confirmed'
  ) then
    raise exception 'radar_confirmed_pointer_missing' using errcode = '23514';
  end if;
  return new;
end
$$;

create constraint trigger kd_radar_event_pointer_guard
  after insert or update on public.kd_radar_events
  deferrable initially deferred
  for each row execute function public.kd_check_radar_event_pointers();

create or replace function public.kd_check_radar_confirmed_version_pointer()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.verification_status = 'confirmed' and (
    select current_confirmed_version_id from public.kd_radar_events where event_id = new.event_id
  ) is distinct from new.event_version_id then
    raise exception 'radar_confirmed_version_pointer_missing' using errcode = '23514';
  end if;
  return new;
end
$$;

create constraint trigger kd_radar_confirmed_version_pointer_guard
  after insert or update of verification_status on public.kd_radar_event_versions
  deferrable initially deferred
  for each row
  when (new.verification_status = 'confirmed')
  execute function public.kd_check_radar_confirmed_version_pointer();

revoke all on function public.kd_guard_radar_evidence() from public, anon, authenticated;
revoke all on function public.kd_guard_radar_source_identity() from public, anon, authenticated;
revoke all on function public.kd_guard_radar_evidence_delete() from public, anon, authenticated;
revoke all on function public.kd_guard_radar_event_version() from public, anon, authenticated;
revoke all on function public.kd_check_radar_event_pointers() from public, anon, authenticated;
revoke all on function public.kd_check_radar_confirmed_version_pointer() from public, anon, authenticated;
grant execute on function public.kd_guard_radar_evidence() to service_role;
grant execute on function public.kd_guard_radar_source_identity() to service_role;
grant execute on function public.kd_guard_radar_evidence_delete() to service_role;
grant execute on function public.kd_guard_radar_event_version() to service_role;
grant execute on function public.kd_check_radar_event_pointers() to service_role;
grant execute on function public.kd_check_radar_confirmed_version_pointer() to service_role;

create table public.kd_radar_reviews (
  review_id         uuid        primary key default gen_random_uuid(),
  event_version_id  uuid        not null references public.kd_radar_event_versions(event_version_id) on delete restrict,
  actor_id          uuid        not null,
  decision          text        not null check (decision in ('confirm','reject','ambiguous')),
  reason            text        not null check (char_length(reason) between 3 and 500),
  source_id         text        references public.kd_radar_sources(source_id),
  created_at        timestamptz not null default now(),
  constraint kd_radar_reviews_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete cascade
);

create table public.kd_radar_receipts (
  account_id       uuid        not null references auth.users(id) on delete cascade,
  event_version_id uuid        not null references public.kd_radar_event_versions(event_version_id) on delete cascade,
  receipt_status   text        not null check (receipt_status in ('new','seen','dismissed','accepted_week','exported_ics')),
  updated_at       timestamptz not null default now(),
  constraint kd_radar_receipts_pkey primary key (account_id, event_version_id)
);

-- RLS: Browser sehen nur ihre persönliche Cacheautorität. Globale Wahrheit,
-- Capabilities, Quellen, Evidenz und Operations bleiben service-only.
alter table public.kd_radar_settings enable row level security;
alter table public.kd_radar_capabilities enable row level security;
alter table public.kd_radar_sources enable row level security;
alter table public.kd_radar_targets enable row level security;
alter table public.kd_radar_checks enable row level security;
alter table public.kd_radar_account_state enable row level security;
alter table public.kd_radar_subscriptions enable row level security;
alter table public.kd_radar_target_shares enable row level security;
alter table public.kd_radar_operations enable row level security;
alter table public.kd_radar_share_operations enable row level security;
alter table public.kd_radar_events enable row level security;
alter table public.kd_radar_event_versions enable row level security;
alter table public.kd_radar_evidence enable row level security;
alter table public.kd_radar_reviews enable row level security;
alter table public.kd_radar_receipts enable row level security;

create policy kdras_own_select on public.kd_radar_account_state
  for select to authenticated
  using (account_id = (select auth.uid()) and (select public.kd_account_active()));

create policy kdrsub_own_select on public.kd_radar_subscriptions
  for select to authenticated
  using (account_id = (select auth.uid()) and (select public.kd_account_active()));

create policy kdrrec_own_select on public.kd_radar_receipts
  for select to authenticated
  using (account_id = (select auth.uid()) and (select public.kd_account_active()));

-- Alle Mutationen laufen über RPC. Es gibt absichtlich keine Browser-Write-
-- Policy und keinen direkten Browser-SELECT auf globale Tabellen.
revoke all on table public.kd_radar_settings from public, anon, authenticated;
revoke all on table public.kd_radar_capabilities from public, anon, authenticated;
revoke all on table public.kd_radar_sources from public, anon, authenticated;
revoke all on table public.kd_radar_targets from public, anon, authenticated;
revoke all on table public.kd_radar_checks from public, anon, authenticated;
revoke all on table public.kd_radar_account_state from public, anon, authenticated;
revoke all on table public.kd_radar_subscriptions from public, anon, authenticated;
revoke all on table public.kd_radar_target_shares from public, anon, authenticated;
revoke all on table public.kd_radar_operations from public, anon, authenticated;
revoke all on table public.kd_radar_share_operations from public, anon, authenticated;
revoke all on table public.kd_radar_events from public, anon, authenticated;
revoke all on table public.kd_radar_event_versions from public, anon, authenticated;
revoke all on table public.kd_radar_evidence from public, anon, authenticated;
revoke all on table public.kd_radar_reviews from public, anon, authenticated;
revoke all on table public.kd_radar_receipts from public, anon, authenticated;

grant select on table public.kd_radar_account_state to authenticated;
grant select on table public.kd_radar_subscriptions to authenticated;
grant select on table public.kd_radar_receipts to authenticated;

grant all on table public.kd_radar_settings to service_role;
grant all on table public.kd_radar_capabilities to service_role;
grant all on table public.kd_radar_sources to service_role;
grant all on table public.kd_radar_targets to service_role;
grant all on table public.kd_radar_checks to service_role;
grant all on table public.kd_radar_account_state to service_role;
grant all on table public.kd_radar_subscriptions to service_role;
grant all on table public.kd_radar_target_shares to service_role;
grant all on table public.kd_radar_operations to service_role;
grant all on table public.kd_radar_share_operations to service_role;
grant all on table public.kd_radar_events to service_role;
grant all on table public.kd_radar_event_versions to service_role;
grant all on table public.kd_radar_evidence to service_role;
grant select, insert on table public.kd_radar_reviews to service_role;
grant all on table public.kd_radar_receipts to service_role;

create or replace function public.kd_radar_account_checksum(p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select md5(v_basis) || md5('kd-radar-v1:' || v_basis)
    from (
      select coalesce((
        select string_agg(
          target_id::text || ':' || region || ':' || scope || ':' || subscription_status,
          '|' order by target_id
        )
          from public.kd_radar_subscriptions
         where account_id = p_account_id
      ), '') || '#shares#' || coalesce((
        select string_agg(target_id::text || ':' || share_status, '|' order by target_id)
          from public.kd_radar_target_shares
         where account_id = p_account_id
      ), '') as v_basis
    ) checksum_input
$$;

revoke all on function public.kd_radar_account_checksum(uuid)
  from public, anon, authenticated;
grant execute on function public.kd_radar_account_checksum(uuid) to service_role;

create or replace function public.kd_set_radar_subscription(
  p_target_id uuid,
  p_scope text,
  p_status text,
  p_operation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id     uuid := auth.uid();
  v_request_hash   text;
  v_previous_hash  text;
  v_previous_result jsonb;
  v_unlimited      boolean := false;
  v_active_others  integer := 0;
  v_revision       bigint := 0;
  v_checksum       text;
  v_result         jsonb;
begin
  if v_account_id is null then
    raise exception 'anmeldung_noetig' using errcode = '42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if not coalesce((select radar_aktiv from public.kd_radar_settings where singleton), false) then
    raise exception 'radar_disabled' using errcode = '55000';
  end if;
  if p_target_id is null or p_operation_id is null
     or p_scope is null or p_scope not in ('all','cinema','streaming')
     or p_status is null or p_status not in ('active','paused','removed') then
    raise exception 'radar_request_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.kd_radar_targets where target_id = p_target_id) then
    raise exception 'radar_target_unavailable' using errcode = '22023';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.kd_radar_targets
     where target_id = p_target_id and target_status = 'active'
  ) then
    raise exception 'radar_target_unavailable' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_account_id::text, 0));
  v_request_hash := md5(p_target_id::text || '|' || p_scope || '|' || p_status);

  select request_hash, result
    into v_previous_hash, v_previous_result
    from public.kd_radar_operations
   where account_id = v_account_id and operation_id = p_operation_id;
  if found then
    if v_previous_hash <> v_request_hash then
      raise exception 'radar_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  v_unlimited := coalesce((
    select radar_unlimited
      from public.kd_radar_capabilities
     where account_id = v_account_id
  ), false);

  if p_status = 'active' and not v_unlimited then
    select count(*) into v_active_others
      from public.kd_radar_subscriptions
     where account_id = v_account_id
       and subscription_status = 'active'
       and target_id <> p_target_id;
    if v_active_others >= 10 then
      raise exception 'radar_quota_exceeded' using errcode = '23514';
    end if;
  end if;

  insert into public.kd_radar_account_state (account_id, revision)
  values (v_account_id, 0)
  on conflict (account_id) do nothing;

  select revision into v_revision
    from public.kd_radar_account_state
   where account_id = v_account_id
   for update;
  v_revision := v_revision + 1;

  if p_status = 'removed' then
    delete from public.kd_radar_subscriptions
     where account_id = v_account_id and target_id = p_target_id;
  else
    insert into public.kd_radar_subscriptions (
      account_id, target_id, region, scope, subscription_status,
      server_revision, last_operation_id, created_at, updated_at
    ) values (
      v_account_id, p_target_id, 'AT', p_scope, p_status,
      v_revision, p_operation_id, now(), now()
    )
    on conflict (account_id, target_id) do update
      set region = 'AT',
          scope = excluded.scope,
          subscription_status = excluded.subscription_status,
          server_revision = excluded.server_revision,
          last_operation_id = excluded.last_operation_id,
          updated_at = now();
  end if;

  if p_status <> 'active' then
    delete from public.kd_radar_target_shares
     where account_id = v_account_id and target_id = p_target_id;
  end if;
  if p_status = 'removed' then
    delete from public.kd_radar_receipts r
     using public.kd_radar_event_versions v, public.kd_radar_events e
     where r.account_id = v_account_id
       and r.event_version_id = v.event_version_id
       and v.event_id = e.event_id
       and e.target_id = p_target_id;
  end if;

  v_checksum := public.kd_radar_account_checksum(v_account_id);

  update public.kd_radar_account_state
     set revision = v_revision, checksum = v_checksum, updated_at = now()
   where account_id = v_account_id;

  v_result := jsonb_build_object(
    'format', 'kd-radar-subscription-ack-v1',
    'operationId', p_operation_id,
    'targetId', p_target_id,
    'status', p_status,
    'revision', v_revision,
    'checksum', v_checksum
  );

  insert into public.kd_radar_operations (account_id, operation_id, request_hash, result)
  values (v_account_id, p_operation_id, v_request_hash, v_result);
  return v_result;
end
$$;

comment on function public.kd_set_radar_subscription(uuid,text,text,uuid) is
  'Atomare eigene Event-Radar-Aenderung mit Not-Aus, Idempotenz und Zehnerlimit.';

create or replace function public.kd_set_radar_target_share(
  p_target_id uuid,
  p_share_enabled boolean,
  p_operation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id      uuid := auth.uid();
  v_request_hash    text;
  v_previous_hash   text;
  v_previous_result jsonb;
  v_revision        bigint := 0;
  v_checksum        text;
  v_status          text;
  v_result          jsonb;
begin
  if v_account_id is null then
    raise exception 'anmeldung_noetig' using errcode = '42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if not coalesce((select radar_aktiv from public.kd_radar_settings where singleton), false) then
    raise exception 'radar_disabled' using errcode = '55000';
  end if;
  if p_share_enabled and not coalesce((
    select radar_shares_aktiv from public.kd_radar_settings where singleton
  ), false) then
    raise exception 'radar_shares_disabled' using errcode = '55000';
  end if;
  if p_target_id is null or p_share_enabled is null or p_operation_id is null then
    raise exception 'radar_share_request_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.kd_radar_targets where target_id = p_target_id) then
    raise exception 'radar_target_unavailable' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_account_id::text, 0));
  v_request_hash := md5('share|' || p_target_id::text || '|' || p_share_enabled::text);

  select request_hash, result
    into v_previous_hash, v_previous_result
    from public.kd_radar_share_operations
   where account_id = v_account_id and operation_id = p_operation_id;
  if found then
    if v_previous_hash <> v_request_hash then
      raise exception 'radar_share_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  if p_share_enabled and not exists (
    select 1
      from public.kd_radar_subscriptions s
      join public.kd_radar_targets t on t.target_id = s.target_id
     where s.account_id = v_account_id
       and s.target_id = p_target_id
       and s.subscription_status = 'active'
       and t.target_status = 'active'
  ) then
    raise exception 'radar_active_subscription_required' using errcode = '23514';
  end if;

  insert into public.kd_radar_account_state (account_id, revision)
  values (v_account_id, 0)
  on conflict (account_id) do nothing;
  select revision into v_revision
    from public.kd_radar_account_state
   where account_id = v_account_id
   for update;
  v_revision := v_revision + 1;
  v_status := case when p_share_enabled then 'active' else 'revoked' end;

  if p_share_enabled then
    insert into public.kd_radar_target_shares (
      account_id, target_id, share_status, last_operation_id, created_at, updated_at
    ) values (
      v_account_id, p_target_id, 'active', p_operation_id, now(), now()
    )
    on conflict (account_id, target_id) do update
      set share_status = 'active',
          last_operation_id = excluded.last_operation_id,
          updated_at = now();
  else
    delete from public.kd_radar_target_shares
     where account_id = v_account_id and target_id = p_target_id;
  end if;

  v_checksum := public.kd_radar_account_checksum(v_account_id);
  update public.kd_radar_account_state
     set revision = v_revision, checksum = v_checksum, updated_at = now()
   where account_id = v_account_id;

  v_result := jsonb_build_object(
    'format', 'kd-radar-share-ack-v1',
    'operationId', p_operation_id,
    'targetId', p_target_id,
    'status', v_status,
    'revision', v_revision,
    'checksum', v_checksum
  );
  insert into public.kd_radar_share_operations (account_id, operation_id, request_hash, result)
  values (v_account_id, p_operation_id, v_request_hash, v_result);
  return v_result;
end
$$;

comment on function public.kd_set_radar_target_share(uuid,boolean,uuid) is
  'Eigener widerrufbarer Share-Pfad; verlangt ein aktives eigenes Event-Radar-Abo.';

create or replace function public.kd_get_radar_feed()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid := auth.uid();
  v_revision bigint := 0;
  v_checksum text;
  v_subscriptions jsonb := '[]'::jsonb;
  v_shares jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
begin
  if v_account_id is null then
    raise exception 'anmeldung_noetig' using errcode = '42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if not coalesce((select radar_aktiv from public.kd_radar_settings where singleton), false) then
    raise exception 'radar_disabled' using errcode = '55000';
  end if;

  select revision, checksum into v_revision, v_checksum
    from public.kd_radar_account_state
   where account_id = v_account_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'targetId', s.target_id,
    'targetType', t.target_type,
    'title', t.canonical_title,
    'region', s.region,
    'scope', s.scope,
    'status', s.subscription_status,
    'updatedAt', s.updated_at
  ) order by t.canonical_title, s.target_id), '[]'::jsonb)
    into v_subscriptions
    from public.kd_radar_subscriptions s
    join public.kd_radar_targets t on t.target_id = s.target_id
   where s.account_id = v_account_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'targetId', sh.target_id,
    'status', sh.share_status,
    'updatedAt', sh.updated_at
  ) order by sh.target_id), '[]'::jsonb)
    into v_shares
    from public.kd_radar_target_shares sh
   where sh.account_id = v_account_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', e.event_id,
    'eventVersionId', v.event_version_id,
    'targetId', e.target_id,
    'eventType', e.event_type,
    'date', v.event_date,
    'region', e.region,
    'platform', e.platform,
    'lifecycleStatus', e.lifecycle_status,
    'verificationStatus', v.verification_status
  ) order by v.event_date, e.event_id), '[]'::jsonb)
    into v_events
    from public.kd_radar_subscriptions s
    join public.kd_radar_events e on e.target_id = s.target_id
    join public.kd_radar_event_versions v
      on v.event_id = e.event_id
     and v.event_version_id = e.current_confirmed_version_id
   where s.account_id = v_account_id
     and s.subscription_status = 'active'
     and e.lifecycle_status <> 'retracted'
     and v.verification_status = 'confirmed';

  return jsonb_build_object(
    'format', 'kd-radar-feed-v1',
    'revision', coalesce(v_revision, 0),
    'checksum', v_checksum,
    'subscriptions', v_subscriptions,
    'shares', v_shares,
    'events', v_events
  );
end
$$;

comment on function public.kd_get_radar_feed() is
  'Minimierter Own-Subscription-Feed ohne Account-ID, Evidence oder Subscriberzahl.';

create or replace function public.kd_get_radar_shared_targets()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid := auth.uid();
  v_targets jsonb := '[]'::jsonb;
begin
  if v_account_id is null then
    raise exception 'anmeldung_noetig' using errcode = '42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if not coalesce((select radar_aktiv from public.kd_radar_settings where singleton), false) then
    raise exception 'radar_disabled' using errcode = '55000';
  end if;
  if not coalesce((select radar_shares_aktiv from public.kd_radar_settings where singleton), false) then
    raise exception 'radar_shares_disabled' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'targetId', visible.target_id,
    'targetType', visible.target_type,
    'title', visible.canonical_title
  ) order by visible.canonical_title, visible.target_id), '[]'::jsonb)
    into v_targets
    from (
      select distinct t.target_id, t.target_type, t.canonical_title
        from public.kd_radar_target_shares sh
        join public.kd_radar_subscriptions s
          on s.account_id = sh.account_id and s.target_id = sh.target_id
        join public.kd_radar_targets t on t.target_id = sh.target_id
       where sh.share_status = 'active'
         and s.subscription_status = 'active'
         and t.target_status = 'active'
    ) visible;
  return jsonb_build_object('format', 'kd-radar-shared-targets-v1', 'targets', v_targets);
end
$$;

comment on function public.kd_get_radar_shared_targets() is
  'Deduplizierte Kreisprojektion ohne Account, Autor, Share-ID, Zeitpunkt oder Anzahl.';

create or replace function public.kd_set_radar_receipt(
  p_event_version_id uuid,
  p_status text
) returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid := auth.uid();
begin
  if v_account_id is null then
    raise exception 'anmeldung_noetig' using errcode = '42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if not coalesce((select radar_aktiv from public.kd_radar_settings where singleton), false) then
    raise exception 'radar_disabled' using errcode = '55000';
  end if;
  if p_status is null or p_status not in ('new','seen','dismissed','accepted_week','exported_ics') then
    raise exception 'radar_receipt_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.kd_radar_event_versions v
      join public.kd_radar_events e on e.event_id = v.event_id
      join public.kd_radar_subscriptions s on s.target_id = e.target_id
     where v.event_version_id = p_event_version_id
       and s.account_id = v_account_id
       and s.subscription_status = 'active'
  ) then
    raise exception 'radar_event_not_subscribed' using errcode = '42501';
  end if;

  insert into public.kd_radar_receipts (account_id, event_version_id, receipt_status, updated_at)
  values (v_account_id, p_event_version_id, p_status, now())
  on conflict (account_id, event_version_id) do update
    set receipt_status = excluded.receipt_status, updated_at = excluded.updated_at;
end
$$;

revoke all on function public.kd_set_radar_subscription(uuid,text,text,uuid)
  from public, anon;
revoke all on function public.kd_set_radar_target_share(uuid,boolean,uuid)
  from public, anon;
revoke all on function public.kd_get_radar_feed()
  from public, anon;
revoke all on function public.kd_get_radar_shared_targets()
  from public, anon;
revoke all on function public.kd_set_radar_receipt(uuid,text)
  from public, anon;

grant execute on function public.kd_set_radar_subscription(uuid,text,text,uuid)
  to authenticated, service_role;
grant execute on function public.kd_set_radar_target_share(uuid,boolean,uuid)
  to authenticated, service_role;
grant execute on function public.kd_get_radar_feed()
  to authenticated, service_role;
grant execute on function public.kd_get_radar_shared_targets()
  to authenticated, service_role;
grant execute on function public.kd_set_radar_receipt(uuid,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- Spaeterer Remote-Preflight (NICHT in Phase 2 ausfuehren):
-- 1. exaktes Zielprojekt und letzten Remote-Migrationsstand ruecklesen;
-- 2. Rollen-v1 active-Matrix und aktuellen kd_personal-Constraint belegen;
-- 3. Backup-/Forward-Fix-Beleg freigeben;
-- 4. diese Datei einzeln anwenden und alle fuenf false-Flags ruecklesen;
-- 5. Grants/RLS/RPCs mit Wegwerfzeilen testen und vollstaendig bereinigen.
-- Gegenprobe: ein persoenlicher Key 'kd:boeser-topf' muss mit 23514 scheitern
-- und darf keinerlei Zeile oder sonstigen Testrest hinterlassen.
-- Kein Scheduler-, Function-, Provider- oder Proposal-Import-Start in diesem Lauf.

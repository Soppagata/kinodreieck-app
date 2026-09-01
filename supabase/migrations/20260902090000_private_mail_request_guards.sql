begin;

-- Inhaltsfreier, providerunabhaengiger Zaun fuer private Mailanforderungen.
-- Der Request-Hash und der optionale Account-Hash werden vom Server vorbereitet;
-- Inhalte, Adressen, Netzmetadaten und Providerantworten gehoeren nie hierher.
create table public.kd_private_mail_request_operations (
  kind            text        not null,
  operation_id    uuid        not null,
  request_sha256  text        not null,
  account_sha256  text,
  status          text        not null default 'claimed',
  result_code     text        not null default 'request-in-progress',
  claimed_at      timestamptz not null default now(),
  finished_at     timestamptz,
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '7 days'),
  constraint kd_private_mail_request_operations_pkey
    primary key (operation_id),
  constraint kd_private_mail_request_operations_kind_check
    check (kind in ('feedback','account-deletion-request','operational-retry')),
  constraint kd_private_mail_request_operations_request_sha256_check
    check (request_sha256 ~ '^[a-f0-9]{64}$'),
  constraint kd_private_mail_request_operations_account_sha256_check
    check (account_sha256 is null or account_sha256 ~ '^[a-f0-9]{64}$'),
  constraint kd_private_mail_request_operations_account_scope_check
    check (
      (kind = 'account-deletion-request' and account_sha256 is not null)
      or (kind <> 'account-deletion-request' and account_sha256 is null)
    ),
  constraint kd_private_mail_request_operations_status_check
    check (status in ('claimed','accepted','rejected','unknown')),
  constraint kd_private_mail_request_operations_result_check
    check (
      (status = 'claimed'
        and result_code = 'request-in-progress'
        and finished_at is null)
      or (status = 'accepted'
        and result_code = 'accepted'
        and finished_at is not null)
      or (status = 'rejected'
        and result_code = 'delivery-rejected'
        and finished_at is not null)
      or (status = 'unknown'
        and result_code = 'delivery-status-unknown'
        and finished_at is not null)
    ),
  constraint kd_private_mail_request_operations_time_check
    check (
      updated_at >= claimed_at
      and (finished_at is null or finished_at >= claimed_at)
    ),
  constraint kd_private_mail_request_operations_expiry_check
    check (expires_at = claimed_at + interval '7 days')
);

comment on table public.kd_private_mail_request_operations is
  'Content-free private-mail idempotency states; never stores message, address, account id, request metadata or provider data.';
comment on column public.kd_private_mail_request_operations.account_sha256 is
  'Server-prepared account digest, required only after authenticated account-deletion authorization.';

-- Das Rate-Ledger ist absichtlich nicht mit einer Operation verknuepft. Beide
-- Bucketwerte muessen bereits serverseitig mit HMAC-SHA256 erzeugt worden sein.
create table public.kd_private_mail_rate_buckets (
  kind               text        not null,
  bucket_scope       text        not null,
  bucket_sha256      text        not null,
  window_started_at  timestamptz not null,
  window_seconds     integer     not null,
  request_count      integer     not null,
  updated_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  constraint kd_private_mail_rate_buckets_pkey
    primary key (kind, bucket_scope, bucket_sha256, window_started_at, window_seconds),
  constraint kd_private_mail_rate_buckets_kind_check
    check (kind in ('feedback','account-deletion-request','operational-retry')),
  constraint kd_private_mail_rate_buckets_scope_check
    check (bucket_scope in ('global','subject')),
  constraint kd_private_mail_rate_buckets_sha256_check
    check (bucket_sha256 ~ '^[a-f0-9]{64}$'),
  constraint kd_private_mail_rate_buckets_window_check
    check (window_seconds between 1 and 86400),
  constraint kd_private_mail_rate_buckets_count_check
    check (request_count between 1 and 10000),
  constraint kd_private_mail_rate_buckets_time_check
    check (
      updated_at >= window_started_at
      and updated_at < expires_at
      and expires_at = window_started_at + interval '24 hours'
    )
);

comment on table public.kd_private_mail_rate_buckets is
  'Detached rate counters keyed only by server-prepared HMAC-SHA256 buckets; no operation or request linkage.';
comment on column public.kd_private_mail_rate_buckets.bucket_sha256 is
  'Opaque server-prepared HMAC-SHA256 value; never a raw account, IP, origin or other subject.';

alter table public.kd_private_mail_request_operations enable row level security;
alter table public.kd_private_mail_rate_buckets enable row level security;

revoke all on table public.kd_private_mail_request_operations
  from public, anon, authenticated, service_role;
revoke all on table public.kd_private_mail_rate_buckets
  from public, anon, authenticated, service_role;

create function public.kd_private_mail_request_begin(
  p_kind text,
  p_operation_id uuid,
  p_request_sha256 text,
  p_account_sha256 text,
  p_global_bucket_sha256 text,
  p_subject_bucket_sha256 text,
  p_global_limit integer,
  p_global_window_seconds integer,
  p_subject_limit integer,
  p_subject_window_seconds integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now                    timestamptz;
  v_existing               public.kd_private_mail_request_operations%rowtype;
  v_global_window_epoch    bigint;
  v_subject_window_epoch   bigint;
  v_global_window_start    timestamptz;
  v_subject_window_start   timestamptz;
  v_global_count           integer;
  v_subject_count          integer;
  v_lock_key               bigint;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_kind is null
     or p_kind not in ('feedback','account-deletion-request','operational-retry')
     or p_operation_id is null
     or p_request_sha256 is null
     or p_request_sha256 !~ '^[a-f0-9]{64}$'
     or p_global_bucket_sha256 is null
     or p_global_bucket_sha256 !~ '^[a-f0-9]{64}$'
     or p_subject_bucket_sha256 is null
     or p_subject_bucket_sha256 !~ '^[a-f0-9]{64}$'
     or p_global_limit is null
     or p_global_limit not between 1 and 10000
     or p_subject_limit is null
     or p_subject_limit not between 1 and 10000
     or p_global_window_seconds is null
     or p_global_window_seconds not between 1 and 86400
     or p_subject_window_seconds is null
     or p_subject_window_seconds not between 1 and 86400
     or (p_kind = 'account-deletion-request'
       and (p_account_sha256 is null or p_account_sha256 !~ '^[a-f0-9]{64}$'))
     or (p_kind <> 'account-deletion-request' and p_account_sha256 is not null) then
    return jsonb_build_object('ok', false, 'code', 'invalid-request');
  end if;

  v_now := clock_timestamp();

  -- Derselbe Idempotency-Key wird zuerst serialisiert. Replay und Konflikt
  -- kehren vor jeder Rate-Pruefung und damit ohne zweiten Verbrauch zurueck.
  perform pg_advisory_xact_lock(
    hashtextextended('kd-private-mail-operation:' || p_operation_id::text, 0)
  );

  select o.*
    into v_existing
    from public.kd_private_mail_request_operations o
   where o.operation_id = p_operation_id
   for update;

  if found then
    if v_existing.kind is distinct from p_kind
       or v_existing.request_sha256 is distinct from p_request_sha256
       or v_existing.account_sha256 is distinct from p_account_sha256 then
      return jsonb_build_object('ok', false, 'code', 'idempotency-conflict');
    end if;

    -- Eine nie abgeschlossene, abgelaufene Anforderung darf nicht neu geoeffnet
    -- werden. Ihr Ausgang bleibt unbekannt und damit dauerhaft fail-closed.
    if v_existing.status = 'claimed' and v_existing.expires_at <= v_now then
      update public.kd_private_mail_request_operations
         set status = 'unknown',
             result_code = 'delivery-status-unknown',
             finished_at = v_now,
             updated_at = v_now
       where operation_id = p_operation_id
       returning * into v_existing;
    end if;

    return jsonb_build_object(
      'ok', true,
      'replay', true,
      'status', v_existing.status,
      'resultCode', v_existing.result_code
    );
  end if;

  v_global_window_epoch := (
    floor(extract(epoch from v_now) / p_global_window_seconds)
      * p_global_window_seconds
  )::bigint;
  v_subject_window_epoch := (
    floor(extract(epoch from v_now) / p_subject_window_seconds)
      * p_subject_window_seconds
  )::bigint;
  v_global_window_start := to_timestamp(v_global_window_epoch);
  v_subject_window_start := to_timestamp(v_subject_window_epoch);

  -- Beide Ratelocks werden kanonisch sortiert genommen. Dadurch gibt es bei
  -- parallelen Requests weder Deadlock-Reihenfolgen noch Teilverbrauch.
  for v_lock_key in
    select lock_key
      from (values
        (hashtextextended(
          'kd-private-mail-rate:' || p_kind || ':global:'
            || p_global_bucket_sha256 || ':'
            || v_global_window_epoch::text || ':'
            || p_global_window_seconds::text,
          0
        )),
        (hashtextextended(
          'kd-private-mail-rate:' || p_kind || ':subject:'
            || p_subject_bucket_sha256 || ':'
            || v_subject_window_epoch::text || ':'
            || p_subject_window_seconds::text,
          0
        ))
      ) as locks(lock_key)
     order by lock_key
  loop
    perform pg_advisory_xact_lock(v_lock_key);
  end loop;

  select b.request_count
    into v_global_count
    from public.kd_private_mail_rate_buckets b
   where b.kind = p_kind
     and b.bucket_scope = 'global'
     and b.bucket_sha256 = p_global_bucket_sha256
     and b.window_started_at = v_global_window_start
     and b.window_seconds = p_global_window_seconds;
  v_global_count := coalesce(v_global_count, 0);

  select b.request_count
    into v_subject_count
    from public.kd_private_mail_rate_buckets b
   where b.kind = p_kind
     and b.bucket_scope = 'subject'
     and b.bucket_sha256 = p_subject_bucket_sha256
     and b.window_started_at = v_subject_window_start
     and b.window_seconds = p_subject_window_seconds;
  v_subject_count := coalesce(v_subject_count, 0);

  if v_global_count >= p_global_limit or v_subject_count >= p_subject_limit then
    return jsonb_build_object('ok', false, 'code', 'rate-limited');
  end if;

  insert into public.kd_private_mail_rate_buckets (
    kind, bucket_scope, bucket_sha256, window_started_at, window_seconds,
    request_count, updated_at, expires_at
  ) values (
    p_kind, 'global', p_global_bucket_sha256, v_global_window_start,
    p_global_window_seconds, 1, v_now, v_global_window_start + interval '24 hours'
  )
  on conflict (kind, bucket_scope, bucket_sha256, window_started_at, window_seconds)
  do update
        set request_count = kd_private_mail_rate_buckets.request_count + 1,
            updated_at = excluded.updated_at;

  insert into public.kd_private_mail_rate_buckets (
    kind, bucket_scope, bucket_sha256, window_started_at, window_seconds,
    request_count, updated_at, expires_at
  ) values (
    p_kind, 'subject', p_subject_bucket_sha256, v_subject_window_start,
    p_subject_window_seconds, 1, v_now, v_subject_window_start + interval '24 hours'
  )
  on conflict (kind, bucket_scope, bucket_sha256, window_started_at, window_seconds)
  do update
        set request_count = kd_private_mail_rate_buckets.request_count + 1,
            updated_at = excluded.updated_at;

  insert into public.kd_private_mail_request_operations (
    kind, operation_id, request_sha256, account_sha256, status, result_code,
    claimed_at, updated_at, expires_at
  ) values (
    p_kind, p_operation_id, p_request_sha256, p_account_sha256,
    'claimed', 'request-in-progress', v_now, v_now, v_now + interval '7 days'
  );

  return jsonb_build_object(
    'ok', true,
    'replay', false,
    'status', 'claimed',
    'resultCode', 'request-in-progress'
  );
end
$$;

create function public.kd_private_mail_request_finish(
  p_kind text,
  p_operation_id uuid,
  p_request_sha256 text,
  p_terminal_status text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now       timestamptz;
  v_existing  public.kd_private_mail_request_operations%rowtype;
  v_status    text;
  v_code      text;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_kind is null
     or p_kind not in ('feedback','account-deletion-request','operational-retry')
     or p_operation_id is null
     or p_request_sha256 is null
     or p_request_sha256 !~ '^[a-f0-9]{64}$'
     or p_terminal_status is null
     or p_terminal_status not in ('accepted','rejected','unknown') then
    return jsonb_build_object('ok', false, 'code', 'invalid-request');
  end if;

  v_now := clock_timestamp();
  perform pg_advisory_xact_lock(
    hashtextextended('kd-private-mail-operation:' || p_operation_id::text, 0)
  );

  select o.*
    into v_existing
    from public.kd_private_mail_request_operations o
   where o.operation_id = p_operation_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;
  if v_existing.kind is distinct from p_kind
     or v_existing.request_sha256 is distinct from p_request_sha256 then
    return jsonb_build_object('ok', false, 'code', 'idempotency-conflict');
  end if;

  if v_existing.status <> 'claimed' then
    return jsonb_build_object(
      'ok', true,
      'replay', true,
      'status', v_existing.status,
      'resultCode', v_existing.result_code
    );
  end if;

  -- Ein Ergebnis nach Ablauf kann nicht mehr sicher dem geclaimten Request
  -- zugeordnet werden und wird deshalb unabhaengig vom Aufrufer als unknown
  -- abgeschlossen.
  v_status := case
    when v_existing.expires_at <= v_now then 'unknown'
    else p_terminal_status
  end;
  v_code := case v_status
    when 'accepted' then 'accepted'
    when 'rejected' then 'delivery-rejected'
    else 'delivery-status-unknown'
  end;

  update public.kd_private_mail_request_operations
     set status = v_status,
         result_code = v_code,
         finished_at = v_now,
         updated_at = v_now
   where operation_id = p_operation_id
   returning * into v_existing;

  return jsonb_build_object(
    'ok', true,
    'replay', false,
    'status', v_existing.status,
    'resultCode', v_existing.result_code
  );
end
$$;

revoke all on function public.kd_private_mail_request_begin(
  text,uuid,text,text,text,text,integer,integer,integer,integer
) from public, anon, authenticated, service_role;
revoke all on function public.kd_private_mail_request_finish(
  text,uuid,text,text
) from public, anon, authenticated, service_role;

grant execute on function public.kd_private_mail_request_begin(
  text,uuid,text,text,text,text,integer,integer,integer,integer
) to service_role;
grant execute on function public.kd_private_mail_request_finish(
  text,uuid,text,text
) to service_role;

commit;

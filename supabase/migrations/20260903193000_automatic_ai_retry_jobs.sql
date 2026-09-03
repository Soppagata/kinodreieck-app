begin;

-- Dauerhafter, inhaltsfreier +6h-Zustand fuer tatsaechlich automatische
-- Anbieterjobs. Der einzige derzeit erlaubte Ursprung ist der bestehende
-- Radar-Scheduler. Titel, Suchtext, Adresse, Prompt, Payload und Provider-
-- Antwort werden weder angenommen noch gespeichert.
do $$
begin
  if to_regclass('auth.users') is null
     or to_regclass('public.kd_ai_log') is null
     or to_regclass('public.kd_radar_targets') is null
     or to_regclass('public.kd_radar_daily_runs') is null
     or to_regprocedure('auth.role()') is null then
    raise exception 'automatic ai retry baseline missing' using errcode = '55000';
  end if;
end
$$;

create table public.kd_automatic_ai_retry_jobs (
  logical_job_id                 uuid        not null,
  task_id                        text        not null,
  trigger_source                 text        not null default 'scheduled',
  account_id                     uuid        not null,
  target_id                      uuid        not null,
  radar_vienna_day               date        not null,
  initial_provider_operation_id  uuid        not null,
  triggered_at                   timestamptz not null,
  check_due_at                   timestamptz not null,
  check_claimed_at               timestamptz,
  initial_evidence_status        text        not null default 'pending',
  initial_api_call               text,
  initial_cost                   text,
  initial_reason_code            text,
  retry_consumed                 boolean     not null default false,
  retry_provider_operation_id    uuid,
  retry_status                   text        not null default 'not-started',
  retry_reason_code              text,
  retry_finished_at              timestamptz,
  mail_status                    text        not null default 'not-required',
  mail_operation_id              uuid,
  mail_claimed_at                timestamptz,
  mail_finished_at               timestamptz,
  updated_at                     timestamptz not null default clock_timestamp(),

  constraint kd_automatic_ai_retry_jobs_pkey
    primary key (logical_job_id),
  constraint kd_automatic_ai_retry_jobs_account_fkey
    foreign key (account_id) references auth.users(id) on delete cascade,
  constraint kd_automatic_ai_retry_jobs_target_fkey
    foreign key (target_id) references public.kd_radar_targets(target_id) on delete cascade,
  constraint kd_automatic_ai_retry_jobs_daily_run_fkey
    foreign key (account_id, target_id, radar_vienna_day)
    references public.kd_radar_daily_runs(account_id, target_id, vienna_day)
    on delete cascade,
  constraint kd_automatic_ai_retry_jobs_daily_run_unique
    unique (account_id, target_id, radar_vienna_day),
  constraint kd_automatic_ai_retry_jobs_initial_operation_unique
    unique (account_id, initial_provider_operation_id),
  constraint kd_automatic_ai_retry_jobs_task_check
    check (task_id = 'radar-websearch-task'),
  constraint kd_automatic_ai_retry_jobs_source_check
    check (trigger_source = 'scheduled'),
  constraint kd_automatic_ai_retry_jobs_operation_identity_check
    check (
      logical_job_id <> initial_provider_operation_id
      and (
        retry_provider_operation_id is null
        or (
          retry_provider_operation_id <> logical_job_id
          and retry_provider_operation_id <> initial_provider_operation_id
        )
      )
      and (
        mail_operation_id is null
        or (
          mail_operation_id <> logical_job_id
          and mail_operation_id <> initial_provider_operation_id
          and mail_operation_id is distinct from retry_provider_operation_id
        )
      )
    ),
  constraint kd_automatic_ai_retry_jobs_due_check
    check (check_due_at = triggered_at + interval '6 hours'),
  constraint kd_automatic_ai_retry_jobs_check_time_check
    check (
      updated_at >= triggered_at
      and (check_claimed_at is null or check_claimed_at >= check_due_at)
    ),
  constraint kd_automatic_ai_retry_jobs_initial_status_check
    check (initial_evidence_status in ('pending','succeeded','retry-required')),
  constraint kd_automatic_ai_retry_jobs_initial_api_call_check
    check (initial_api_call is null or initial_api_call in ('made','unproven')),
  constraint kd_automatic_ai_retry_jobs_initial_cost_check
    check (initial_cost is null or initial_cost in ('confirmed','unproven')),
  constraint kd_automatic_ai_retry_jobs_initial_reason_check
    check (
      initial_reason_code is null
      or initial_reason_code in (
        'initial-call-unproven',
        'initial-completion-unproven',
        'initial-cost-unproven',
        'initial-usage-unproven',
        'initial-execution-failed'
      )
    ),
  constraint kd_automatic_ai_retry_jobs_initial_state_check
    check (
      (
        initial_evidence_status = 'pending'
        and check_claimed_at is null
        and initial_api_call is null
        and initial_cost is null
        and initial_reason_code is null
      )
      or (
        initial_evidence_status = 'succeeded'
        and check_claimed_at is not null
        and initial_api_call = 'made'
        and initial_cost = 'confirmed'
        and initial_reason_code is null
      )
      or (
        initial_evidence_status = 'retry-required'
        and check_claimed_at is not null
        and initial_api_call in ('made','unproven')
        and initial_cost in ('confirmed','unproven')
        and initial_reason_code is not null
        and (
          (
            initial_api_call = 'unproven'
            and initial_cost = 'unproven'
            and initial_reason_code = 'initial-call-unproven'
          )
          or (
            initial_api_call = 'made'
            and initial_reason_code in (
              'initial-completion-unproven',
              'initial-cost-unproven',
              'initial-usage-unproven',
              'initial-execution-failed'
            )
            and not (
              initial_cost = 'confirmed'
              and initial_reason_code = 'initial-cost-unproven'
            )
          )
        )
      )
    ),
  constraint kd_automatic_ai_retry_jobs_retry_status_check
    check (retry_status in ('not-started','claimed','succeeded','failed','unproven')),
  constraint kd_automatic_ai_retry_jobs_retry_reason_check
    check (
      retry_reason_code is null
      or retry_reason_code in (
        'retry-blocked','retry-execution-failed','retry-status-unproven'
      )
    ),
  constraint kd_automatic_ai_retry_jobs_retry_state_check
    check (
      (
        retry_status = 'not-started'
        and retry_consumed is false
        and retry_provider_operation_id is null
        and retry_reason_code is null
        and retry_finished_at is null
        and initial_evidence_status in ('pending','succeeded')
      )
      or (
        retry_status = 'claimed'
        and retry_consumed is true
        and retry_provider_operation_id is not null
        and retry_reason_code is null
        and retry_finished_at is null
        and initial_evidence_status = 'retry-required'
      )
      or (
        retry_status = 'succeeded'
        and retry_consumed is true
        and retry_provider_operation_id is not null
        and retry_reason_code is null
        and retry_finished_at is not null
        and initial_evidence_status = 'retry-required'
      )
      or (
        retry_status = 'failed'
        and retry_consumed is true
        and retry_provider_operation_id is not null
        and retry_reason_code in ('retry-blocked','retry-execution-failed')
        and retry_finished_at is not null
        and initial_evidence_status = 'retry-required'
      )
      or (
        retry_status = 'unproven'
        and retry_consumed is true
        and retry_provider_operation_id is not null
        and retry_reason_code = 'retry-status-unproven'
        and retry_finished_at is not null
        and initial_evidence_status = 'retry-required'
      )
    ),
  constraint kd_automatic_ai_retry_jobs_retry_time_check
    check (
      retry_finished_at is null
      or (check_claimed_at is not null and retry_finished_at >= check_claimed_at)
    ),
  constraint kd_automatic_ai_retry_jobs_mail_status_check
    check (mail_status in ('not-required','pending','claimed','accepted','rejected','unknown')),
  constraint kd_automatic_ai_retry_jobs_mail_state_check
    check (
      (
        mail_status = 'not-required'
        and mail_operation_id is null
        and mail_claimed_at is null
        and mail_finished_at is null
        and retry_status in ('not-started','claimed')
      )
      or (
        mail_status = 'pending'
        and mail_operation_id is null
        and mail_claimed_at is null
        and mail_finished_at is null
        and retry_status in ('succeeded','failed','unproven')
      )
      or (
        mail_status = 'claimed'
        and mail_operation_id is not null
        and mail_claimed_at is not null
        and mail_finished_at is null
        and retry_status in ('succeeded','failed','unproven')
      )
      or (
        mail_status in ('accepted','rejected','unknown')
        and mail_operation_id is not null
        and mail_claimed_at is not null
        and mail_finished_at is not null
        and retry_status in ('succeeded','failed','unproven')
      )
    ),
  constraint kd_automatic_ai_retry_jobs_mail_time_check
    check (
      (mail_claimed_at is null or (
        retry_finished_at is not null and mail_claimed_at >= retry_finished_at
      ))
      and (mail_finished_at is null or (
        mail_claimed_at is not null and mail_finished_at >= mail_claimed_at
      ))
    )
);

create unique index kd_automatic_ai_retry_jobs_retry_operation_unique
  on public.kd_automatic_ai_retry_jobs (retry_provider_operation_id)
  where retry_provider_operation_id is not null;
create unique index kd_automatic_ai_retry_jobs_mail_operation_unique
  on public.kd_automatic_ai_retry_jobs (mail_operation_id)
  where mail_operation_id is not null;
create index kd_automatic_ai_retry_jobs_due
  on public.kd_automatic_ai_retry_jobs (check_due_at, logical_job_id)
  where initial_evidence_status = 'pending';
create index kd_automatic_ai_retry_jobs_mail_due
  on public.kd_automatic_ai_retry_jobs (retry_finished_at, logical_job_id)
  where mail_status = 'pending';

alter table public.kd_automatic_ai_retry_jobs enable row level security;
revoke all on table public.kd_automatic_ai_retry_jobs
  from public, anon, authenticated, service_role;

comment on table public.kd_automatic_ai_retry_jobs is
  'Service-only, content-free state for one +6h proof, at most one retry and one operational-mail claim per automatic Radar provider job.';
comment on column public.kd_automatic_ai_retry_jobs.check_due_at is
  'Immutable one-time check deadline, exactly initial provider-operation start plus six hours; never reset by retry or mail state.';

create function public.kd_automatic_ai_retry_jobs_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.logical_job_id is distinct from old.logical_job_id
     or new.task_id is distinct from old.task_id
     or new.trigger_source is distinct from old.trigger_source
     or new.account_id is distinct from old.account_id
     or new.target_id is distinct from old.target_id
     or new.radar_vienna_day is distinct from old.radar_vienna_day
     or new.initial_provider_operation_id is distinct from old.initial_provider_operation_id
     or new.triggered_at is distinct from old.triggered_at
     or new.check_due_at is distinct from old.check_due_at then
    raise exception 'automatic ai retry identity is immutable' using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger kd_automatic_ai_retry_jobs_immutable
before update on public.kd_automatic_ai_retry_jobs
for each row execute function public.kd_automatic_ai_retry_jobs_immutable();

create function public.kd_automatic_ai_retry_job_begin(
  p_logical_job_id uuid,
  p_task_id text,
  p_account_id uuid,
  p_target_id uuid,
  p_radar_vienna_day date,
  p_initial_provider_operation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now          timestamptz := clock_timestamp();
  v_triggered_at timestamptz;
  v_existing     public.kd_automatic_ai_retry_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_logical_job_id is null
     or p_task_id is distinct from 'radar-websearch-task'
     or p_account_id is null
     or p_target_id is null
     or p_radar_vienna_day is null
     or p_initial_provider_operation_id is null
     or p_logical_job_id = p_initial_provider_operation_id then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('kd-automatic-ai-retry-job:' || p_logical_job_id::text, 0)
  );
  select job.* into v_existing
    from public.kd_automatic_ai_retry_jobs job
   where job.logical_job_id = p_logical_job_id
   for update;
  if found then
    if v_existing.task_id is distinct from p_task_id
       or v_existing.account_id is distinct from p_account_id
       or v_existing.target_id is distinct from p_target_id
       or v_existing.radar_vienna_day is distinct from p_radar_vienna_day
       or v_existing.initial_provider_operation_id is distinct from p_initial_provider_operation_id then
      return jsonb_build_object('ok',false,'code','idempotency-conflict');
    end if;
    return jsonb_build_object(
      'ok',true,
      'replay',true,
      'status',v_existing.initial_evidence_status,
      'logicalJobId',v_existing.logical_job_id,
      'checkDueAt',v_existing.check_due_at
    );
  end if;

  -- Der Zeitanker stammt ausschliesslich von der exakten initialen
  -- kd_ai_log-Operation. Die Operation muss waehrend des referenzierten,
  -- bereits atomar geclaimten Radar-Tageslaufs begonnen worden sein.
  select log.gestartet_at into v_triggered_at
    from public.kd_radar_daily_runs run
    join public.kd_ai_log log
      on log.account_id = run.account_id
     and log.vorgang_id = p_initial_provider_operation_id
     and log.task = 'radar-websearch'
   where run.account_id = p_account_id
     and run.target_id = p_target_id
     and run.vienna_day = p_radar_vienna_day
     and log.gestartet_at >= run.claimed_at
     and log.gestartet_at <= run.lease_expires_at
     and log.gestartet_at <= v_now;
  if v_triggered_at is null then
    return jsonb_build_object('ok',false,'code','invalid-reference');
  end if;

  insert into public.kd_automatic_ai_retry_jobs (
    logical_job_id,task_id,trigger_source,account_id,target_id,radar_vienna_day,
    initial_provider_operation_id,triggered_at,check_due_at,updated_at
  ) values (
    p_logical_job_id,p_task_id,'scheduled',p_account_id,p_target_id,p_radar_vienna_day,
    p_initial_provider_operation_id,v_triggered_at,v_triggered_at + interval '6 hours',v_now
  ) returning * into v_existing;

  return jsonb_build_object(
    'ok',true,
    'replay',false,
    'status','pending',
    'logicalJobId',v_existing.logical_job_id,
    'checkDueAt',v_existing.check_due_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'code','idempotency-conflict');
end
$$;

create function public.kd_automatic_ai_retry_due_claim()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now             timestamptz := clock_timestamp();
  v_job             public.kd_automatic_ai_retry_jobs%rowtype;
  v_log_status      text;
  v_log_finished_at timestamptz;
  v_cost             numeric;
  v_input_tokens     integer;
  v_output_tokens    integer;
  v_log_found        boolean;
  v_call_made        boolean;
  v_cost_confirmed   boolean;
  v_usage_valid      boolean;
  v_success          boolean;
  v_initial_call     text;
  v_initial_cost     text;
  v_initial_reason   text;
  v_retry_operation  uuid;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('claim',false,'status','forbidden');
  end if;

  select job.* into v_job
    from public.kd_automatic_ai_retry_jobs job
   where job.initial_evidence_status = 'pending'
     and job.check_due_at <= v_now
   order by job.check_due_at, job.logical_job_id
   for update skip locked
   limit 1;
  if not found then
    return jsonb_build_object('claim',false,'status','idle');
  end if;

  select log.status,log.beendet_at,log.kosten_usd_cent,
         log.input_tokens,log.output_tokens
    into v_log_status,v_log_finished_at,v_cost,v_input_tokens,v_output_tokens
    from public.kd_ai_log log
   where log.account_id = v_job.account_id
     and log.vorgang_id = v_job.initial_provider_operation_id
     and log.task = 'radar-websearch';

  v_log_found := found;
  v_usage_valid := v_log_found
    and v_input_tokens is not null and v_input_tokens >= 0
    and v_output_tokens is not null and v_output_tokens >= 0;
  v_call_made := v_usage_valid or (
    v_log_found and v_log_status = 'fertig' and v_log_finished_at is not null
  );
  v_cost_confirmed := v_log_found and v_log_finished_at is not null and v_cost > 0;
  v_success := v_log_found
    and v_log_status = 'fertig'
    and v_log_finished_at is not null
    and v_cost_confirmed
    and v_usage_valid;
  v_initial_call := case when v_call_made then 'made' else 'unproven' end;
  v_initial_cost := case when v_cost_confirmed then 'confirmed' else 'unproven' end;

  if v_success then
    update public.kd_automatic_ai_retry_jobs
       set check_claimed_at = v_now,
           initial_evidence_status = 'succeeded',
           initial_api_call = 'made',
           initial_cost = 'confirmed',
           initial_reason_code = null,
           updated_at = v_now
     where logical_job_id = v_job.logical_job_id
     returning * into v_job;
    return jsonb_build_object(
      'claim',true,
      'status','initial-succeeded',
      'action','none',
      'logicalJobId',v_job.logical_job_id,
      'taskId',v_job.task_id,
      'initialProviderOperationId',v_job.initial_provider_operation_id
    );
  end if;

  v_initial_reason := case
    when not v_call_made then 'initial-call-unproven'
    when v_log_status = 'fehler' then 'initial-execution-failed'
    when v_log_status is distinct from 'fertig' or v_log_finished_at is null
      then 'initial-completion-unproven'
    when not v_cost_confirmed then 'initial-cost-unproven'
    else 'initial-usage-unproven'
  end;
  -- Der eine Retry wird bereits mit dem Due-Claim verbraucht und erhaelt
  -- atomar seine neue Operation. Ein Crash danach darf nie einen zweiten
  -- Providerstart oder einen neuen +6h-Termin ermoeglichen.
  v_retry_operation := gen_random_uuid();
  update public.kd_automatic_ai_retry_jobs
     set check_claimed_at = v_now,
         initial_evidence_status = 'retry-required',
         initial_api_call = v_initial_call,
         initial_cost = case
           when v_initial_call = 'unproven' then 'unproven'
           else v_initial_cost
         end,
         initial_reason_code = v_initial_reason,
         retry_consumed = true,
         retry_provider_operation_id = v_retry_operation,
         retry_status = 'claimed',
         updated_at = v_now
   where logical_job_id = v_job.logical_job_id
   returning * into v_job;

  return jsonb_build_object(
    'claim',true,
    'status','retry-claimed',
    'action','retry',
    'logicalJobId',v_job.logical_job_id,
    'taskId',v_job.task_id,
    'accountId',v_job.account_id,
    'targetId',v_job.target_id,
    'radarViennaDay',v_job.radar_vienna_day,
    'initialProviderOperationId',v_job.initial_provider_operation_id,
    'retryProviderOperationId',v_job.retry_provider_operation_id,
    'initialApiCall',v_job.initial_api_call,
    'initialCost',v_job.initial_cost,
    'initialReasonCode',v_job.initial_reason_code
  );
end
$$;

create function public.kd_automatic_ai_retry_finish(
  p_logical_job_id uuid,
  p_retry_provider_operation_id uuid,
  p_retry_result text,
  p_retry_reason_code text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now       timestamptz := clock_timestamp();
  v_job       public.kd_automatic_ai_retry_jobs%rowtype;
  v_result    text;
  v_reason    text;
  v_succeeded boolean;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_logical_job_id is null
     or p_retry_provider_operation_id is null
     or p_retry_result is null
     or not (
       (p_retry_result = 'succeeded' and p_retry_reason_code is null)
       or (p_retry_result = 'failed'
         and p_retry_reason_code in ('retry-blocked','retry-execution-failed'))
       or (p_retry_result = 'unproven'
         and p_retry_reason_code = 'retry-status-unproven')
     ) then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;

  select job.* into v_job
    from public.kd_automatic_ai_retry_jobs job
   where job.logical_job_id = p_logical_job_id
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','unavailable');
  end if;
  if v_job.retry_provider_operation_id is distinct from p_retry_provider_operation_id then
    return jsonb_build_object('ok',false,'code','idempotency-conflict');
  end if;
  if v_job.retry_status in ('succeeded','failed','unproven') then
    return jsonb_build_object(
      'ok',true,'replay',true,'status',v_job.retry_status,
      'reasonCode',v_job.retry_reason_code
    );
  end if;
  if v_job.initial_evidence_status <> 'retry-required'
     or v_job.retry_consumed is distinct from true
     or v_job.retry_status <> 'claimed' then
    return jsonb_build_object('ok',false,'code','state-invalid');
  end if;

  select exists (
    select 1 from public.kd_ai_log log
     where log.account_id = v_job.account_id
       and log.vorgang_id = v_job.retry_provider_operation_id
       and log.task = 'radar-websearch'
       and log.status = 'fertig'
       and log.beendet_at is not null
       and log.kosten_usd_cent > 0
       and log.input_tokens is not null and log.input_tokens >= 0
       and log.output_tokens is not null and log.output_tokens >= 0
  ) into v_succeeded;

  if p_retry_result = 'succeeded' and v_succeeded then
    v_result := 'succeeded';
    v_reason := null;
  elsif p_retry_result = 'failed' then
    v_result := 'failed';
    v_reason := p_retry_reason_code;
  else
    -- Ein behaupteter Erfolg ohne exakt finalisierten kd_ai_log-Beleg bleibt
    -- dauerhaft unbewiesen und darf spaeter nicht zu Erfolg hochgestuft werden.
    v_result := 'unproven';
    v_reason := 'retry-status-unproven';
  end if;

  update public.kd_automatic_ai_retry_jobs
     set retry_status = v_result,
         retry_reason_code = v_reason,
         retry_finished_at = v_now,
         mail_status = 'pending',
         updated_at = v_now
   where logical_job_id = v_job.logical_job_id
   returning * into v_job;
  return jsonb_build_object(
    'ok',true,'replay',false,'status',v_job.retry_status,
    'reasonCode',v_job.retry_reason_code,'mailStatus',v_job.mail_status
  );
end
$$;

create function public.kd_automatic_ai_retry_mail_claim(
  p_logical_job_id uuid,
  p_mail_operation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_job public.kd_automatic_ai_retry_jobs%rowtype;
  v_replay boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_logical_job_id is null or p_mail_operation_id is null
     or p_mail_operation_id = p_logical_job_id then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;

  select job.* into v_job
    from public.kd_automatic_ai_retry_jobs job
   where job.logical_job_id = p_logical_job_id
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','unavailable');
  end if;

  if v_job.mail_status = 'pending' then
    if p_mail_operation_id in (
      v_job.initial_provider_operation_id,v_job.retry_provider_operation_id
    ) then
      return jsonb_build_object('ok',false,'code','invalid-request');
    end if;
    update public.kd_automatic_ai_retry_jobs
       set mail_status = 'claimed',
           mail_operation_id = p_mail_operation_id,
           mail_claimed_at = v_now,
           updated_at = v_now
     where logical_job_id = v_job.logical_job_id
     returning * into v_job;
  elsif v_job.mail_operation_id = p_mail_operation_id
        and v_job.mail_status in ('claimed','accepted','rejected','unknown') then
    v_replay := true;
  elsif v_job.mail_status = 'not-required' then
    return jsonb_build_object('ok',false,'code','not-ready');
  else
    return jsonb_build_object('ok',false,'code','idempotency-conflict');
  end if;

  return jsonb_build_object(
    'ok',true,
    'replay',v_replay,
    'status',v_job.mail_status,
    'mailOperationId',v_job.mail_operation_id,
    'occurredAt',v_job.retry_finished_at,
    'taskId',v_job.task_id,
    'initialOperationId',v_job.initial_provider_operation_id,
    'initialApiCall',v_job.initial_api_call,
    'initialCost',v_job.initial_cost,
    'initialReasonCode',v_job.initial_reason_code,
    'retryTriggered',true,
    'retryOperationId',v_job.retry_provider_operation_id,
    'retryResult',v_job.retry_status,
    'retryReasonCode',v_job.retry_reason_code
  );
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'code','idempotency-conflict');
end
$$;

create function public.kd_automatic_ai_retry_mail_finish(
  p_logical_job_id uuid,
  p_mail_operation_id uuid,
  p_terminal_status text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_job public.kd_automatic_ai_retry_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_logical_job_id is null or p_mail_operation_id is null
     or p_terminal_status is null
     or p_terminal_status not in ('accepted','rejected','unknown') then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;

  select job.* into v_job
    from public.kd_automatic_ai_retry_jobs job
   where job.logical_job_id = p_logical_job_id
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','unavailable');
  end if;
  if v_job.mail_operation_id is distinct from p_mail_operation_id then
    return jsonb_build_object('ok',false,'code','idempotency-conflict');
  end if;
  if v_job.mail_status in ('accepted','rejected','unknown') then
    return jsonb_build_object(
      'ok',true,'replay',true,'status',v_job.mail_status
    );
  end if;
  if v_job.mail_status <> 'claimed' then
    return jsonb_build_object('ok',false,'code','state-invalid');
  end if;

  update public.kd_automatic_ai_retry_jobs
     set mail_status = p_terminal_status,
         mail_finished_at = v_now,
         updated_at = v_now
   where logical_job_id = v_job.logical_job_id
   returning * into v_job;
  return jsonb_build_object(
    'ok',true,'replay',false,'status',v_job.mail_status
  );
end
$$;

revoke all on function public.kd_automatic_ai_retry_jobs_immutable()
  from public, anon, authenticated, service_role;
revoke all on function public.kd_automatic_ai_retry_job_begin(uuid,text,uuid,uuid,date,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.kd_automatic_ai_retry_due_claim()
  from public, anon, authenticated, service_role;
revoke all on function public.kd_automatic_ai_retry_finish(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.kd_automatic_ai_retry_mail_claim(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.kd_automatic_ai_retry_mail_finish(uuid,uuid,text)
  from public, anon, authenticated, service_role;

grant execute on function public.kd_automatic_ai_retry_job_begin(uuid,text,uuid,uuid,date,uuid)
  to service_role;
grant execute on function public.kd_automatic_ai_retry_due_claim()
  to service_role;
grant execute on function public.kd_automatic_ai_retry_finish(uuid,uuid,text,text)
  to service_role;
grant execute on function public.kd_automatic_ai_retry_mail_claim(uuid,uuid)
  to service_role;
grant execute on function public.kd_automatic_ai_retry_mail_finish(uuid,uuid,text)
  to service_role;

comment on function public.kd_automatic_ai_retry_job_begin(uuid,text,uuid,uuid,date,uuid) is
  'Binds one scheduled Radar run to its exact initial provider operation and immutable +6h deadline; service_role only.';
comment on function public.kd_automatic_ai_retry_due_claim() is
  'Claims one due job atomically, proves the exact initial kd_ai_log row or consumes exactly one retry operation; service_role only.';
comment on function public.kd_automatic_ai_retry_finish(uuid,uuid,text,text) is
  'Finalizes the single retry with allowlisted status/reason and opens one operational-mail claim; service_role only.';
comment on function public.kd_automatic_ai_retry_mail_claim(uuid,uuid) is
  'Claims the one content-free operational-mail handoff after retry completion; service_role only.';
comment on function public.kd_automatic_ai_retry_mail_finish(uuid,uuid,text) is
  'Persists one allowlisted terminal mail outcome without reopening the retry; service_role only.';

notify pgrst, 'reload schema';
commit;

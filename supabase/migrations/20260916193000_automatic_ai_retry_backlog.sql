begin;

-- Der Checker darf den inhaltsfreien Rueckstand lesen, ohne den nur ueber
-- RPCs zugreifbaren Jobzustand fuer direkte Tabellenabfragen freizugeben.
create function public.kd_automatic_ai_retry_backlog(p_as_of timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'automatic ai backlog forbidden' using errcode = '42501';
  end if;
  if p_as_of is null or not isfinite(p_as_of) then
    raise exception 'automatic ai backlog timestamp invalid' using errcode = '22023';
  end if;

  return (
    select jsonb_build_object(
      'remainingDueJobs', count(*),
      'oldestDueAt', min(job.check_due_at)
    )
    from public.kd_automatic_ai_retry_jobs job
    where job.initial_evidence_status = 'pending'
      and job.check_due_at <= p_as_of
  );
end
$$;

revoke all on function public.kd_automatic_ai_retry_backlog(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.kd_automatic_ai_retry_backlog(timestamptz)
  to service_role;

comment on function public.kd_automatic_ai_retry_backlog(timestamptz) is
  'Read-only aggregate of pending automatic AI checks due at the supplied instant; service_role only, no job identities or claims.';

notify pgrst, 'reload schema';
commit;

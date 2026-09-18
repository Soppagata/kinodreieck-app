-- Blog publication v2: additive 50-reference contract with bounded work.
-- v1 remains byte-for-byte discoverable at maxReferences=15. Its public and
-- legacy readers intentionally omit v2 publications so old clients cannot
-- truncate a longer list and write it back.
begin;

alter table public.kd_blog_publication_references
  drop constraint if exists kd_blog_publication_references_rank_check;
alter table public.kd_blog_publication_references
  add constraint kd_blog_publication_references_rank_check check (rank between 1 and 50);

create table if not exists public.kd_blog_publication_starts (
  account_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  primary key(account_id,operation_id)
);
create index if not exists kd_blog_publication_starts_recent
  on public.kd_blog_publication_starts(account_id,started_at desc);
alter table public.kd_blog_publication_starts enable row level security;
revoke all on public.kd_blog_publication_starts from public,anon,authenticated;
grant all on public.kd_blog_publication_starts to service_role;

create or replace function public.kd_blog_validate_write_request(p_request jsonb,p_action text)
returns void
language plpgsql immutable
set search_path = pg_catalog
as $$
declare
  v_refs jsonb;
  v_ref jsonb;
  v_hint jsonb;
  v_rank integer;
  v_version text;
  v_max integer;
begin
  v_version:=p_request->>'contractVersion';
  v_max:=case v_version when 'blog-publication-v1' then 15
    when 'blog-publication-v2' then 50 else 0 end;
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or not (p_request ?& array['contractVersion','operationId','contentVersion','privateArticleId','expectedPublicRevision','article'])
    or p_request - array['contractVersion','operationId','contentVersion','privateArticleId','expectedPublicRevision','article'] <> '{}'::jsonb
    or v_max=0
    or (v_version='blog-publication-v2' and octet_length(p_request::text)>131072)
    or coalesce(p_request->>'operationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(p_request->>'contentVersion','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or char_length(coalesce(p_request->>'privateArticleId','')) not between 1 and 160
    or jsonb_typeof(p_request->'article')<>'object'
    or not (p_request->'article' ?& array['title','text','ordered','references'])
    or (p_request->'article') - array['title','text','ordered','references'] <> '{}'::jsonb
    or char_length(btrim(coalesce(p_request->'article'->>'title',''))) not between 1 and 240
    or char_length(btrim(coalesce(p_request->'article'->>'text',''))) < 1
    or jsonb_typeof(p_request->'article'->'ordered')<>'boolean'
    or jsonb_typeof(p_request->'article'->'references')<>'array'
    or jsonb_array_length(p_request->'article'->'references')>v_max then
    raise exception 'invalid_blog_publication_request' using errcode='22023';
  end if;
  if (p_action='publish' and jsonb_typeof(p_request->'expectedPublicRevision')<>'null')
    or (p_action='update' and (jsonb_typeof(p_request->'expectedPublicRevision')<>'number'
      or public.kd_blog_int(p_request->>'expectedPublicRevision') is null
      or public.kd_blog_int(p_request->>'expectedPublicRevision')<1)) then
    raise exception 'invalid_expected_public_revision' using errcode='22023';
  end if;
  v_refs:=p_request->'article'->'references';
  if (select count(*)<>count(distinct value->>'rowId') from jsonb_array_elements(v_refs))
    or (select count(*)<>count(distinct public.kd_blog_int(value->>'rank')) from jsonb_array_elements(v_refs)) then
    raise exception 'duplicate_blog_reference_identity_or_rank' using errcode='22023';
  end if;
  v_rank:=0;
  for v_ref in select value from jsonb_array_elements(v_refs) order by public.kd_blog_int(value->>'rank')
  loop
    v_rank:=v_rank+1;
    if jsonb_typeof(v_ref)<>'object'
      or not (v_ref ?& array['rowId','rank','title','year','mediaType','resolutionIntent'])
      or v_ref - array['rowId','rank','title','year','mediaType','identityHints','resolutionIntent'] <> '{}'::jsonb
      or char_length(coalesce(v_ref->>'rowId','')) not between 1 and 160
      or public.kd_blog_int(v_ref->>'rank')<>v_rank
      or char_length(btrim(coalesce(v_ref->>'title',''))) not between 1 and 240
      or jsonb_typeof(v_ref->'year') not in ('number','null')
      or (jsonb_typeof(v_ref->'year')='number' and public.kd_blog_int(v_ref->>'year') not between 1870 and 2200)
      or coalesce(v_ref->>'mediaType','') not in ('film','serie','musik','sonstiges')
      or jsonb_typeof(v_ref->'resolutionIntent')<>'object'
      or coalesce(v_ref->'resolutionIntent'->>'kind','') not in ('auto','keep_redlink','confirm_work')
      or (v_ref->'resolutionIntent'->>'kind'='confirm_work'
        and (v_ref->'resolutionIntent')-array['kind','workKey']<>'{}'::jsonb)
      or (v_ref->'resolutionIntent'->>'kind'<>'confirm_work'
        and (v_ref->'resolutionIntent')-array['kind']<>'{}'::jsonb)
      or (v_ref->'resolutionIntent'->>'kind'='confirm_work'
        and char_length(coalesce(v_ref->'resolutionIntent'->>'workKey',''))<1)
      or (v_ref->'resolutionIntent'->>'kind'<>'confirm_work' and v_ref->'resolutionIntent' ? 'workKey') then
      raise exception 'invalid_blog_reference' using errcode='22023';
    end if;
    if v_ref ? 'identityHints' then
      if jsonb_typeof(v_ref->'identityHints')<>'array' or jsonb_array_length(v_ref->'identityHints')>4
        or (select count(*)<>count(distinct value->>'namespace') from jsonb_array_elements(v_ref->'identityHints')) then
        raise exception 'invalid_blog_identity_hints' using errcode='22023';
      end if;
      for v_hint in select value from jsonb_array_elements(v_ref->'identityHints')
      loop
        if jsonb_typeof(v_hint)<>'object'
          or not (v_hint ?& array['namespace','value'])
          or v_hint-array['namespace','value']<>'{}'::jsonb
          or coalesce(v_hint->>'namespace','') not in ('imdb','tmdb','watchmode','film_at')
          or char_length(btrim(coalesce(v_hint->>'value',''))) not between 1 and 160 then
          raise exception 'invalid_blog_identity_hint' using errcode='22023';
        end if;
      end loop;
    end if;
  end loop;
end
$$;

create or replace function public.kd_blog_v2_conflict(
  p_request jsonb,p_error text,p_publication jsonb default null)
returns jsonb language sql immutable set search_path=pg_catalog as $$
  select jsonb_build_object('contractVersion','blog-publication-v2','outcome','conflict',
    'operationId',p_request->>'operationId','contentVersion',p_request->>'contentVersion',
    'publication',p_publication,'referenceResults','[]'::jsonb,
    'decisionRequests','[]'::jsonb,'errorCode',p_error)
$$;

create or replace function public.kd_blog_apply_publication_v2(p_request jsonb,p_action text)
returns jsonb
language plpgsql volatile security definer
set search_path=pg_catalog,public
as $$
declare
  v_account uuid;
  v_operation uuid;
  v_existing_op public.kd_blog_publication_operations%rowtype;
  v_response jsonb;
  v_slot integer;
  v_locked boolean:=false;
begin
  perform public.kd_blog_validate_write_request(p_request,p_action);
  if p_request->>'contractVersion'<>'blog-publication-v2' then
    raise exception 'invalid_blog_publication_request' using errcode='22023';
  end if;
  v_account:=public.kd_blog_require_owner();
  v_operation:=(p_request->>'operationId')::uuid;

  select * into v_existing_op from public.kd_blog_publication_operations
   where account_id=v_account and operation_id=v_operation;
  if v_existing_op.operation_id is not null then
    if v_existing_op.article_id<>p_request->>'privateArticleId'
      or v_existing_op.action<>p_action or v_existing_op.request_hash<>md5(p_request::text) then
      update public.kd_blog_publication_operations set conflict_detected=true
       where account_id=v_account and operation_id=v_operation;
      return public.kd_blog_v2_conflict(p_request,'OPERATION_ID_CONFLICT');
    end if;
    if v_existing_op.status<>'unknown' and v_existing_op.response is not null then
      return v_existing_op.response;
    end if;
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended('kd-blog-v2-account:'||v_account::text,0)) then
    return public.kd_blog_v2_conflict(p_request,'PUBLICATION_ACCOUNT_BUSY');
  end if;
  for v_slot in 0..7 loop
    if pg_try_advisory_xact_lock(hashtextextended('kd-blog-v2-global:'||v_slot::text,0)) then
      v_locked:=true; exit;
    end if;
  end loop;
  if not v_locked then return public.kd_blog_v2_conflict(p_request,'PUBLICATION_CAPACITY_BUSY'); end if;

  delete from public.kd_blog_publication_starts
   where account_id=v_account and started_at<=clock_timestamp()-interval '10 minutes';
  if (select count(*) from public.kd_blog_publication_starts
      where account_id=v_account and started_at>clock_timestamp()-interval '1 minute')>=5 then
    return public.kd_blog_v2_conflict(p_request,'PUBLICATION_RATE_LIMIT');
  end if;
  insert into public.kd_blog_publication_starts(account_id,operation_id)
  values(v_account,v_operation) on conflict do nothing;

  v_response:=public.kd_blog_apply_publication(p_request,p_action)
    || jsonb_build_object('contractVersion','blog-publication-v2');
  if v_response->>'outcome' in ('published','updated') then
    update public.kd_shared_articles set contract_version='blog-publication-v2',
      payload=jsonb_set(payload,'{contractVersion}','"blog-publication-v2"'::jsonb,true)
     where account_id=v_account and article_id=p_request->>'privateArticleId';
  end if;
  update public.kd_blog_publication_operations set response=v_response
   where account_id=v_account and operation_id=v_operation;
  return v_response;
end
$$;

create or replace function public.kd_publish_blog_v2(p_request jsonb) returns jsonb
language sql volatile security definer set search_path=pg_catalog,public as $$
  select public.kd_blog_apply_publication_v2(p_request,'publish')
$$;
create or replace function public.kd_update_blog_publication_v2(p_request jsonb) returns jsonb
language sql volatile security definer set search_path=pg_catalog,public as $$
  select public.kd_blog_apply_publication_v2(p_request,'update')
$$;

create or replace function public.kd_update_blog_publication_v1(p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_contract text;
begin
  perform public.kd_blog_require_owner();
  select contract_version into v_contract from public.kd_shared_articles
   where account_id=auth.uid() and article_id=p_request->>'privateArticleId';
  if v_contract='blog-publication-v2' then
    return public.kd_blog_v2_conflict(p_request,'CLIENT_UPGRADE_REQUIRED')
      || jsonb_build_object('contractVersion','blog-publication-v1');
  end if;
  return public.kd_blog_apply_publication(p_request,'update');
end
$$;

create or replace function public.kd_blog_public_article(p_publication uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public
as $$
declare v_shared public.kd_shared_articles%rowtype; v_refs jsonb;
begin
  select * into v_shared from public.kd_shared_articles where publication_id=p_publication;
  if v_shared.publication_id is null then return null; end if;
  if v_shared.contract_version in ('blog-publication-v1','blog-publication-v2') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'referenceId',r.reference_id,'rank',r.rank,'title',r.title,'year',r.release_year,
      'mediaType',r.media_type,'resolution',jsonb_build_object(
        'status',r.resolution_status,'workKey',r.work_key)
        || case when r.resolution_status='matched'
          and jsonb_array_length(coalesce(w.identity_hints,'[]'::jsonb))>0
          then jsonb_build_object('identityHints',w.identity_hints) else '{}'::jsonb end,
      'sources',coalesce(w.sources,r.sources)) order by r.rank),'[]'::jsonb)
      into v_refs from public.kd_blog_publication_references r
      left join public.kd_blog_work_sources w on w.work_key=r.work_key
     where r.publication_id=p_publication;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'referenceId','legacy:'||p_publication::text||':'||x.ord::text,'rank',x.ord,
      'title',coalesce(x.value->>'eingabe',x.value->>'title',x.value->>'titel'),
      'year',public.kd_blog_int(coalesce(x.value->>'jahr',x.value->>'year')),
      'mediaType',public.kd_blog_media_type(coalesce(x.value->>'typ',x.value->>'type')),
      'resolution',jsonb_build_object('status','unchecked','workKey',null),
      'sources',jsonb_build_object('status','unchecked','checkedAt',null,'validUntil',null,
        'streamingRevision',null,'cinemaRevision',null,'streaming','[]'::jsonb,'cinema','[]'::jsonb)
      ) order by x.ord),'[]'::jsonb) into v_refs
    from jsonb_array_elements(case when jsonb_typeof(v_shared.payload->'liste')='array'
      then v_shared.payload->'liste' else '[]'::jsonb end) with ordinality x(value,ord);
  end if;
  return jsonb_build_object('id',v_shared.publication_id,
    'title',coalesce(v_shared.payload->>'title',v_shared.payload->>'titel',''),
    'text',coalesce(v_shared.payload->>'text',''),
    'ordered',coalesce((v_shared.payload->>'ordered')::boolean,
      (v_shared.payload->>'geordnet')::boolean,false),'references',v_refs);
exception when invalid_text_representation then
  return jsonb_build_object('id',v_shared.publication_id,
    'title',coalesce(v_shared.payload->>'title',v_shared.payload->>'titel',''),
    'text',coalesce(v_shared.payload->>'text',''),'ordered',false,
    'references',coalesce(v_refs,'[]'::jsonb));
end
$$;

create or replace function public.kd_list_shared_articles_v1(p_request jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public
as $$
declare
  v_limit integer; v_cursor jsonb; v_snapshot timestamptz;
  v_last_updated timestamptz; v_last_id uuid; v_items jsonb:='[]'::jsonb;
  v_count integer:=0; v_has_more boolean:=false; v_row record; v_next text;
begin
  perform public.kd_blog_require_owner();
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or not (p_request ?& array['contractVersion','limit','cursor'])
    or p_request-array['contractVersion','limit','cursor']<>'{}'::jsonb
    or p_request->>'contractVersion'<>'blog-publication-v1'
    or jsonb_typeof(p_request->'limit')<>'number'
    or public.kd_blog_int(p_request->>'limit') not between 1 and 50
    or jsonb_typeof(p_request->'cursor') not in ('string','null') then
    raise exception 'invalid_blog_list_request' using errcode='22023';
  end if;
  v_limit:=public.kd_blog_int(p_request->>'limit');
  v_cursor:=public.kd_blog_cursor_decode(p_request->>'cursor');
  if v_cursor is null then v_snapshot:=clock_timestamp();
  else
    begin
      v_snapshot:=(v_cursor->>'snapshotAt')::timestamptz;
      v_last_updated:=(v_cursor->>'lastUpdatedAt')::timestamptz;
      v_last_id:=(v_cursor->>'lastPublicationId')::uuid;
    exception when others then raise exception 'invalid_blog_cursor' using errcode='22023'; end;
  end if;
  for v_row in select s.* from public.kd_shared_articles s
    where s.updated_at<=v_snapshot and s.contract_version is distinct from 'blog-publication-v2'
      and (v_last_updated is null or (s.updated_at,s.publication_id)<(v_last_updated,v_last_id))
    order by s.updated_at desc,s.publication_id desc limit v_limit+1
  loop
    v_count:=v_count+1; if v_count>v_limit then v_has_more:=true; exit; end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'publicationId',v_row.publication_id,'shareToken',v_row.share_token,
      'author','Ohne Namensangabe','publicRevision',v_row.public_revision,
      'contentVersion',coalesce(v_row.published_content_version,v_row.publication_id),
      'publishedAt',v_row.published_at,'updatedAt',v_row.updated_at,
      'article',public.kd_blog_public_article(v_row.publication_id)));
    v_last_updated:=v_row.updated_at; v_last_id:=v_row.publication_id;
  end loop;
  if v_has_more then v_next:=replace(encode(convert_to(jsonb_build_object(
    'contractVersion','blog-publication-v1','snapshotAt',v_snapshot,
    'lastUpdatedAt',v_last_updated,'lastPublicationId',v_last_id)::text,'UTF8'),'base64'),E'\n',''); end if;
  return jsonb_build_object('contractVersion','blog-publication-v1','snapshotAt',v_snapshot,
    'items',v_items,'nextCursor',v_next,'complete',not v_has_more);
end
$$;

create or replace function public.kd_list_shared_articles_v2(p_request jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public
as $$
declare
  v_limit integer; v_cursor jsonb; v_snapshot timestamptz;
  v_last_updated timestamptz; v_last_id uuid; v_items jsonb:='[]'::jsonb;
  v_count integer:=0; v_has_more boolean:=false; v_row record; v_next text;
begin
  perform public.kd_blog_require_owner();
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or not (p_request ?& array['contractVersion','limit','cursor'])
    or p_request-array['contractVersion','limit','cursor']<>'{}'::jsonb
    or p_request->>'contractVersion'<>'blog-publication-v2'
    or jsonb_typeof(p_request->'limit')<>'number'
    or public.kd_blog_int(p_request->>'limit') not between 1 and 50
    or jsonb_typeof(p_request->'cursor') not in ('string','null') then
    raise exception 'invalid_blog_list_request' using errcode='22023';
  end if;
  v_limit:=public.kd_blog_int(p_request->>'limit');
  v_cursor:=public.kd_blog_cursor_decode(p_request->>'cursor');
  if v_cursor is null then v_snapshot:=clock_timestamp();
  else
    begin
      v_snapshot:=(v_cursor->>'snapshotAt')::timestamptz;
      v_last_updated:=(v_cursor->>'lastUpdatedAt')::timestamptz;
      v_last_id:=(v_cursor->>'lastPublicationId')::uuid;
    exception when others then raise exception 'invalid_blog_cursor' using errcode='22023'; end;
  end if;
  for v_row in select s.* from public.kd_shared_articles s
    where s.updated_at<=v_snapshot
      and (v_last_updated is null or (s.updated_at,s.publication_id)<(v_last_updated,v_last_id))
    order by s.updated_at desc,s.publication_id desc limit v_limit+1
  loop
    v_count:=v_count+1; if v_count>v_limit then v_has_more:=true; exit; end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'publicationId',v_row.publication_id,'shareToken',v_row.share_token,
      'author','Ohne Namensangabe','publicRevision',v_row.public_revision,
      'contentVersion',coalesce(v_row.published_content_version,v_row.publication_id),
      'publishedAt',v_row.published_at,'updatedAt',v_row.updated_at,
      'article',public.kd_blog_public_article(v_row.publication_id)));
    v_last_updated:=v_row.updated_at; v_last_id:=v_row.publication_id;
  end loop;
  if v_has_more then v_next:=replace(encode(convert_to(jsonb_build_object(
    'contractVersion','blog-publication-v2','snapshotAt',v_snapshot,
    'lastUpdatedAt',v_last_updated,'lastPublicationId',v_last_id)::text,'UTF8'),'base64'),E'\n',''); end if;
  return jsonb_build_object('contractVersion','blog-publication-v2','snapshotAt',v_snapshot,
    'items',v_items,'nextCursor',v_next,'complete',not v_has_more);
end
$$;

create or replace function public.kd_blog_publication_capabilities_v2() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.kd_blog_require_owner();
  return jsonb_build_object('contractVersion','blog-publication-v2','enabled',true,
    'anonymousProjection',true,'maxReferences',50,'cursorPagination',true,
    'ownerReadback',true,'legacyProjectionSafe',true,'rpcs',jsonb_build_array(
      'kd_publish_blog_v2','kd_update_blog_publication_v2','kd_withdraw_blog_publication_v2',
      'kd_read_own_blog_publication_v2','kd_list_shared_articles_v2'));
end
$$;

create or replace function public.kd_read_own_blog_publication_v2(p_request jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_response jsonb;
begin
  if p_request->>'contractVersion'<>'blog-publication-v2' then
    raise exception 'invalid_blog_owner_readback_request' using errcode='22023';
  end if;
  v_response:=public.kd_read_own_blog_publication_v1(
    jsonb_set(p_request,'{contractVersion}','"blog-publication-v1"'::jsonb,false));
  return v_response||jsonb_build_object('contractVersion','blog-publication-v2');
end
$$;

create or replace function public.kd_withdraw_blog_publication_v2(p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_legacy jsonb; v_response jsonb; v_account uuid; v_operation uuid;
begin
  if p_request->>'contractVersion'<>'blog-publication-v2' then
    raise exception 'invalid_blog_withdraw_request' using errcode='22023';
  end if;
  v_account:=public.kd_blog_require_owner(); v_operation:=(p_request->>'operationId')::uuid;
  v_legacy:=jsonb_set(p_request,'{contractVersion}','"blog-publication-v1"'::jsonb,false);
  v_response:=public.kd_withdraw_blog_publication_v1(v_legacy)
    || jsonb_build_object('contractVersion','blog-publication-v2');
  update public.kd_blog_publication_operations set response=v_response
   where account_id=v_account and operation_id=v_operation;
  return v_response;
end
$$;

create or replace function public.kd_list_shared_articles()
returns table(publication_id uuid,share_token uuid,article_id text,author text,payload jsonb,updated_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.kd_blog_require_owner();
  return query select s.publication_id,s.share_token,s.publication_id::text,
    'Ohne Namensangabe'::text,public.kd_blog_legacy_payload(s.publication_id),s.updated_at
  from public.kd_shared_articles s
  where s.contract_version is distinct from 'blog-publication-v2'
  order by s.updated_at desc,s.publication_id desc;
end
$$;

create or replace function public.kd_claim_shared_article(p_share_token uuid)
returns table(publication_id uuid,share_token uuid,article_id text,author text,payload jsonb,
  updated_at timestamptz,claimed boolean)
language plpgsql volatile security definer set search_path=pg_catalog,public
as $$
declare v_account uuid:=auth.uid(); v_claimed boolean:=false;
begin
  if v_account is null then raise exception 'authenticated account required' using errcode='42501'; end if;
  if not public.kd_account_active() then raise exception 'account_inactive' using errcode='42501'; end if;
  if p_share_token is null then raise exception 'share token required' using errcode='22023'; end if;
  insert into public.kd_shared_article_claims(account_id,share_token)
    select v_account,s.share_token from public.kd_shared_articles s
    where s.share_token=p_share_token and s.contract_version is distinct from 'blog-publication-v2'
    on conflict on constraint kd_shared_article_claims_pkey do nothing returning true into v_claimed;
  return query select s.publication_id,s.share_token,s.publication_id::text,
    'Ohne Namensangabe'::text,public.kd_blog_legacy_payload(s.publication_id),s.updated_at,
    coalesce(v_claimed,false) from public.kd_shared_articles s
   where s.share_token=p_share_token and s.contract_version is distinct from 'blog-publication-v2';
end
$$;

revoke all on function public.kd_blog_v2_conflict(jsonb,text,jsonb),
  public.kd_blog_apply_publication_v2(jsonb,text)
  from public,anon,authenticated;
revoke all on function public.kd_blog_publication_capabilities_v2(),
  public.kd_publish_blog_v2(jsonb),public.kd_update_blog_publication_v2(jsonb),
  public.kd_withdraw_blog_publication_v2(jsonb),
  public.kd_read_own_blog_publication_v2(jsonb),
  public.kd_list_shared_articles_v2(jsonb) from public,anon;
grant execute on function public.kd_blog_publication_capabilities_v2(),
  public.kd_publish_blog_v2(jsonb),public.kd_update_blog_publication_v2(jsonb),
  public.kd_withdraw_blog_publication_v2(jsonb),
  public.kd_read_own_blog_publication_v2(jsonb),
  public.kd_list_shared_articles_v2(jsonb) to authenticated,service_role;

commit;

-- Additive v3 blog publication contract with an explicit, account-bound author
-- decision. v1/v2 RPCs and their anonymous reader projections stay available.
begin;

alter table public.kd_shared_articles
  add column if not exists author_mode text not null default 'anonymous';
alter table public.kd_shared_articles
  drop constraint if exists kd_shared_articles_author_mode_valid;
alter table public.kd_shared_articles
  add constraint kd_shared_articles_author_mode_valid
  check (author_mode in ('anonymous','profile'));

create or replace function public.kd_blog_public_author(p_account uuid)
returns text language plpgsql stable security definer
set search_path=pg_catalog,public,auth as $$
declare v_name text; v_email text;
begin
  if p_account is null or p_account<>auth.uid() then return null; end if;
  select lower(btrim(email)) into v_email from auth.users where id=p_account;
  if v_email is null or v_email !~ '^[^@]+@login\.kinodreieck\.at$' then return null; end if;
  v_name:=split_part(v_email,'@',1);
  if char_length(v_name)>120 or octet_length(v_name)>480
    or v_name !~ '^[a-z0-9][a-z0-9._-]*$' then return null; end if;
  return v_name;
end
$$;

create or replace function public.kd_blog_validate_write_request(p_request jsonb,p_action text)
returns void language plpgsql immutable set search_path=pg_catalog as $$
declare v_refs jsonb; v_ref jsonb; v_hint jsonb; v_rank integer;
  v_version text; v_max integer; v_author jsonb;
begin
  v_version:=p_request->>'contractVersion';
  v_max:=case v_version when 'blog-publication-v1' then 15
    when 'blog-publication-v2' then 50 when 'blog-publication-v3' then 50 else 0 end;
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or not (p_request ?& array['contractVersion','operationId','contentVersion','privateArticleId','expectedPublicRevision','article'])
    or p_request - (case when v_version='blog-publication-v3'
      then array['contractVersion','operationId','contentVersion','privateArticleId','expectedPublicRevision','article','authorDecision']
      else array['contractVersion','operationId','contentVersion','privateArticleId','expectedPublicRevision','article'] end) <> '{}'::jsonb
    or v_max=0 or octet_length(p_request::text)>131072
    or coalesce(p_request->>'operationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(p_request->>'contentVersion','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or char_length(coalesce(p_request->>'privateArticleId','')) not between 1 and 160
    or jsonb_typeof(p_request->'article')<>'object'
    or not (p_request->'article' ?& array['title','text','ordered','references'])
    or (p_request->'article')-array['title','text','ordered','references']<>'{}'::jsonb
    or char_length(btrim(coalesce(p_request->'article'->>'title',''))) not between 1 and 240
    or char_length(btrim(coalesce(p_request->'article'->>'text','')))<1
    or jsonb_typeof(p_request->'article'->'ordered')<>'boolean'
    or jsonb_typeof(p_request->'article'->'references')<>'array'
    or jsonb_array_length(p_request->'article'->'references')>v_max then
    raise exception 'invalid_blog_publication_request' using errcode='22023';
  end if;
  if v_version='blog-publication-v3' then
    v_author:=p_request->'authorDecision';
    if jsonb_typeof(v_author)<>'object'
      or not (v_author ?& array['mode','expectedAuthor'])
      or v_author-array['mode','expectedAuthor']<>'{}'::jsonb
      or coalesce(v_author->>'mode','') not in ('anonymous','profile')
      or (v_author->>'mode'='anonymous' and jsonb_typeof(v_author->'expectedAuthor')<>'null')
      or (v_author->>'mode'='profile' and (jsonb_typeof(v_author->'expectedAuthor')<>'string'
        or char_length(btrim(coalesce(v_author->>'expectedAuthor',''))) not between 1 and 120
        or v_author->>'expectedAuthor'<>btrim(v_author->>'expectedAuthor')
        or octet_length(v_author->>'expectedAuthor')>480
        or v_author->>'expectedAuthor' ~ '[[:cntrl:]]')) then
      raise exception 'invalid_blog_author_decision' using errcode='22023';
    end if;
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
  for v_ref in select value from jsonb_array_elements(v_refs) order by public.kd_blog_int(value->>'rank') loop
    v_rank:=v_rank+1;
    if jsonb_typeof(v_ref)<>'object'
      or not (v_ref ?& array['rowId','rank','title','year','mediaType','resolutionIntent'])
      or v_ref-array['rowId','rank','title','year','mediaType','identityHints','resolutionIntent']<>'{}'::jsonb
      or char_length(coalesce(v_ref->>'rowId','')) not between 1 and 160
      or public.kd_blog_int(v_ref->>'rank')<>v_rank
      or char_length(btrim(coalesce(v_ref->>'title',''))) not between 1 and 240
      or jsonb_typeof(v_ref->'year') not in ('number','null')
      or (jsonb_typeof(v_ref->'year')='number' and (((v_version='blog-publication-v1'
        or coalesce(v_ref->>'mediaType','') in ('film','serie')) and public.kd_blog_int(v_ref->>'year') not between 1870 and 2200)
        or (v_version in ('blog-publication-v2','blog-publication-v3')
          and coalesce(v_ref->>'mediaType','') in ('musik','sonstiges')
          and public.kd_blog_int(v_ref->>'year') not between 1 and 2200)))
      or coalesce(v_ref->>'mediaType','') not in ('film','serie','musik','sonstiges')
      or jsonb_typeof(v_ref->'resolutionIntent')<>'object'
      or coalesce(v_ref->'resolutionIntent'->>'kind','') not in ('auto','keep_redlink','confirm_work')
      or (v_ref->'resolutionIntent'->>'kind'='confirm_work' and (v_ref->'resolutionIntent')-array['kind','workKey']<>'{}'::jsonb)
      or (v_ref->'resolutionIntent'->>'kind'<>'confirm_work' and (v_ref->'resolutionIntent')-array['kind']<>'{}'::jsonb)
      or (v_ref->'resolutionIntent'->>'kind'='confirm_work' and char_length(coalesce(v_ref->'resolutionIntent'->>'workKey',''))<1)
      or (v_ref->'resolutionIntent'->>'kind'<>'confirm_work' and v_ref->'resolutionIntent'?'workKey') then
      raise exception 'invalid_blog_reference' using errcode='22023';
    end if;
    if v_ref?'identityHints' then
      if jsonb_typeof(v_ref->'identityHints')<>'array' or jsonb_array_length(v_ref->'identityHints')>4
        or (select count(*)<>count(distinct value->>'namespace') from jsonb_array_elements(v_ref->'identityHints')) then
        raise exception 'invalid_blog_identity_hints' using errcode='22023';
      end if;
      for v_hint in select value from jsonb_array_elements(v_ref->'identityHints') loop
        if jsonb_typeof(v_hint)<>'object' or not (v_hint?&array['namespace','value'])
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

create or replace function public.kd_blog_apply_publication_guarded(p_request jsonb,p_action text,p_contract text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,auth as $$
declare v_account uuid; v_operation uuid; v_existing_op public.kd_blog_publication_operations%rowtype;
  v_response jsonb; v_slot integer; v_locked boolean:=false; v_mode text; v_author text;
begin
  perform public.kd_blog_validate_write_request(p_request,p_action);
  if p_contract not in ('blog-publication-v1','blog-publication-v2','blog-publication-v3')
    or p_request->>'contractVersion'<>p_contract then
    raise exception 'invalid_blog_publication_request' using errcode='22023';
  end if;
  v_account:=public.kd_blog_require_owner(); v_operation:=(p_request->>'operationId')::uuid;
  if p_contract='blog-publication-v3' then
    v_mode:=p_request->'authorDecision'->>'mode';
    v_author:=case when v_mode='profile' then public.kd_blog_public_author(v_account) else 'Ohne Namensangabe' end;
  end if;
  select * into v_existing_op from public.kd_blog_publication_operations
   where account_id=v_account and operation_id=v_operation;
  if v_existing_op.operation_id is not null then
    if v_existing_op.article_id<>p_request->>'privateArticleId' or v_existing_op.action<>p_action
      or v_existing_op.request_hash<>md5(p_request::text) then
      update public.kd_blog_publication_operations set conflict_detected=true
       where account_id=v_account and operation_id=v_operation;
      return public.kd_blog_guard_conflict(p_request,p_contract,'OPERATION_ID_CONFLICT');
    end if;
    if v_existing_op.status<>'unknown' and v_existing_op.response is not null then return v_existing_op.response; end if;
  end if;
  if p_contract='blog-publication-v3' and v_mode='profile'
    and (v_author is null or v_author<>p_request->'authorDecision'->>'expectedAuthor') then
    return public.kd_blog_guard_conflict(p_request,p_contract,'AUTHOR_CHANGED');
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('kd-blog-publication-account:'||v_account::text,0)) then
    return public.kd_blog_guard_conflict(p_request,p_contract,'PUBLICATION_ACCOUNT_BUSY'); end if;
  if p_contract in ('blog-publication-v1','blog-publication-v2') and p_action='update' and exists(select 1 from public.kd_shared_articles
    where account_id=v_account and article_id=p_request->>'privateArticleId'
      and ((p_contract='blog-publication-v1' and contract_version in ('blog-publication-v2','blog-publication-v3'))
        or (p_contract='blog-publication-v2' and contract_version='blog-publication-v3'))) then
    return public.kd_blog_guard_conflict(p_request,p_contract,'CLIENT_UPGRADE_REQUIRED'); end if;
  for v_slot in 0..7 loop
    if pg_try_advisory_xact_lock(hashtextextended('kd-blog-publication-global:'||v_slot::text,0)) then v_locked:=true; exit; end if;
  end loop;
  if not v_locked then return public.kd_blog_guard_conflict(p_request,p_contract,'PUBLICATION_CAPACITY_BUSY'); end if;
  delete from public.kd_blog_publication_starts where account_id=v_account and started_at<=clock_timestamp()-interval '10 minutes';
  if (select count(*) from public.kd_blog_publication_starts where account_id=v_account
      and started_at>clock_timestamp()-interval '1 minute')>=5 then
    return public.kd_blog_guard_conflict(p_request,p_contract,'PUBLICATION_RATE_LIMIT'); end if;
  insert into public.kd_blog_publication_starts(account_id,operation_id) values(v_account,v_operation) on conflict do nothing;
  v_response:=public.kd_blog_apply_publication(p_request,p_action);
  if p_contract in ('blog-publication-v2','blog-publication-v3') then
    v_response:=v_response||jsonb_build_object('contractVersion',p_contract);
  end if;
  if p_contract in ('blog-publication-v2','blog-publication-v3') and v_response->>'outcome' in ('published','updated') then
    update public.kd_shared_articles set contract_version=p_contract,
      author=case when p_contract='blog-publication-v3' then v_author else 'Ohne Namensangabe' end,
      author_mode=case when p_contract='blog-publication-v3' then v_mode else 'anonymous' end,
      payload=jsonb_set(payload,'{contractVersion}',to_jsonb(p_contract),true)
     where account_id=v_account and article_id=p_request->>'privateArticleId';
    if p_contract='blog-publication-v3' then
      v_response:=jsonb_set(v_response,'{publication}',
        (v_response->'publication')||jsonb_build_object('authorMode',v_mode,'author',v_author),false);
    end if;
  elsif p_contract='blog-publication-v3' and jsonb_typeof(v_response->'publication')='object' then
    select author_mode,author into v_mode,v_author from public.kd_shared_articles
      where account_id=v_account and article_id=p_request->>'privateArticleId';
    v_response:=jsonb_set(v_response,'{publication}',
      (v_response->'publication')||jsonb_build_object('authorMode',v_mode,'author',v_author),false);
  end if;
  update public.kd_blog_publication_operations set response=v_response
   where account_id=v_account and operation_id=v_operation;
  return v_response;
end
$$;

create function public.kd_publish_blog_v3(p_request jsonb) returns jsonb
language sql volatile security definer set search_path=pg_catalog,public as $$
  select public.kd_blog_apply_publication_guarded(p_request,'publish','blog-publication-v3')
$$;
create function public.kd_update_blog_publication_v3(p_request jsonb) returns jsonb
language sql volatile security definer set search_path=pg_catalog,public as $$
  select public.kd_blog_apply_publication_guarded(p_request,'update','blog-publication-v3')
$$;

create or replace function public.kd_blog_public_article(p_publication uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_shared public.kd_shared_articles%rowtype; v_refs jsonb;
begin
  select * into v_shared from public.kd_shared_articles where publication_id=p_publication;
  if v_shared.publication_id is null then return null; end if;
  if v_shared.contract_version in ('blog-publication-v1','blog-publication-v2','blog-publication-v3') then
    select coalesce(jsonb_agg(jsonb_build_object('referenceId',r.reference_id,'rank',r.rank,
      'title',r.title,'year',r.release_year,'mediaType',r.media_type,'resolution',jsonb_build_object(
      'status',r.resolution_status,'workKey',r.work_key)||case when r.resolution_status='matched'
      and jsonb_array_length(coalesce(w.identity_hints,'[]'::jsonb))>0 then jsonb_build_object('identityHints',w.identity_hints)
      else '{}'::jsonb end,'sources',coalesce(w.sources,r.sources)) order by r.rank),'[]'::jsonb)
      into v_refs from public.kd_blog_publication_references r left join public.kd_blog_work_sources w on w.work_key=r.work_key
      where r.publication_id=p_publication;
  else v_refs:='[]'::jsonb; end if;
  return jsonb_build_object('id',v_shared.publication_id,'title',coalesce(v_shared.payload->>'title',v_shared.payload->>'titel',''),
    'text',coalesce(v_shared.payload->>'text',''),'ordered',coalesce((v_shared.payload->>'ordered')::boolean,false),'references',v_refs);
end
$$;

create function public.kd_list_shared_articles_v3(p_request jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_limit integer; v_cursor jsonb; v_snapshot timestamptz; v_last_updated timestamptz; v_last_id uuid;
  v_items jsonb:='[]'::jsonb; v_count integer:=0; v_has_more boolean:=false; v_row record; v_next text;
begin
  perform public.kd_blog_require_owner();
  if p_request is null or jsonb_typeof(p_request)<>'object' or not (p_request?&array['contractVersion','limit','cursor'])
    or p_request-array['contractVersion','limit','cursor']<>'{}'::jsonb or p_request->>'contractVersion'<>'blog-publication-v3'
    or jsonb_typeof(p_request->'limit')<>'number' or public.kd_blog_int(p_request->>'limit') not between 1 and 50
    or jsonb_typeof(p_request->'cursor') not in ('string','null') then
    raise exception 'invalid_blog_list_request' using errcode='22023'; end if;
  v_limit:=public.kd_blog_int(p_request->>'limit'); v_cursor:=public.kd_blog_cursor_decode(p_request->>'cursor');
  if v_cursor is null then v_snapshot:=clock_timestamp(); else
    begin v_snapshot:=(v_cursor->>'snapshotAt')::timestamptz; v_last_updated:=(v_cursor->>'lastUpdatedAt')::timestamptz;
      v_last_id:=(v_cursor->>'lastPublicationId')::uuid;
    exception when others then raise exception 'invalid_blog_cursor' using errcode='22023'; end; end if;
  for v_row in select s.* from public.kd_shared_articles s where s.updated_at<=v_snapshot
    and (v_last_updated is null or (s.updated_at,s.publication_id)<(v_last_updated,v_last_id))
    order by s.updated_at desc,s.publication_id desc limit v_limit+1 loop
    v_count:=v_count+1; if v_count>v_limit then v_has_more:=true; exit; end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('publicationId',v_row.publication_id,
      'shareToken',v_row.share_token,'author',case when v_row.author_mode='profile' then v_row.author else 'Ohne Namensangabe' end,
      'publicRevision',v_row.public_revision,'contentVersion',coalesce(v_row.published_content_version,v_row.publication_id),
      'publishedAt',v_row.published_at,'updatedAt',v_row.updated_at,'article',public.kd_blog_public_article(v_row.publication_id)));
    v_last_updated:=v_row.updated_at; v_last_id:=v_row.publication_id;
  end loop;
  if v_has_more then v_next:=replace(encode(convert_to(jsonb_build_object('contractVersion','blog-publication-v3',
    'snapshotAt',v_snapshot,'lastUpdatedAt',v_last_updated,'lastPublicationId',v_last_id)::text,'UTF8'),'base64'),E'\n',''); end if;
  return jsonb_build_object('contractVersion','blog-publication-v3','snapshotAt',v_snapshot,
    'items',v_items,'nextCursor',v_next,'complete',not v_has_more);
end
$$;

create function public.kd_blog_publication_capabilities_v3() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_account uuid;
begin
  v_account:=public.kd_blog_require_owner();
  return jsonb_build_object('contractVersion','blog-publication-v3','enabled',true,
    'anonymousProjection',true,'namedAuthorProjection',true,'profileAuthor',public.kd_blog_public_author(v_account),
    'maxAuthorCharacters',120,'maxReferences',50,'cursorPagination',true,'ownerReadback',true,
    'legacyProjectionSafe',true,'rpcs',jsonb_build_array('kd_publish_blog_v3','kd_update_blog_publication_v3',
      'kd_withdraw_blog_publication_v3','kd_read_own_blog_publication_v3','kd_list_shared_articles_v3'));
end
$$;

create function public.kd_read_own_blog_publication_v3(p_request jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_account uuid; v_article text; v_operation uuid; v_shared public.kd_shared_articles%rowtype;
  v_op public.kd_blog_publication_operations%rowtype; v_current jsonb; v_operation_result jsonb;
begin
  if p_request is null or jsonb_typeof(p_request)<>'object' or not (p_request?&array['contractVersion','privateArticleId'])
    or p_request-array['contractVersion','privateArticleId','operationId']<>'{}'::jsonb
    or p_request->>'contractVersion'<>'blog-publication-v3' or char_length(coalesce(p_request->>'privateArticleId','')) not between 1 and 160
    or (p_request?'operationId' and jsonb_typeof(p_request->'operationId') not in ('string','null')) then
    raise exception 'invalid_blog_owner_readback_request' using errcode='22023'; end if;
  v_account:=public.kd_blog_require_owner(); v_article:=p_request->>'privateArticleId';
  if nullif(p_request->>'operationId','') is not null then v_operation:=(p_request->>'operationId')::uuid; end if;
  select * into v_shared from public.kd_shared_articles where account_id=v_account and article_id=v_article;
  if v_shared.publication_id is not null then v_current:=jsonb_build_object('publicationId',v_shared.publication_id,
    'shareToken',v_shared.share_token,'publicRevision',v_shared.public_revision,
    'publishedContentVersion',case when v_shared.contract_version in ('blog-publication-v2','blog-publication-v3') then v_shared.published_content_version else null end,
    'authorMode',case when v_shared.author_mode='profile' then 'profile' else 'anonymous' end,
    'author',case when v_shared.author_mode='profile' then v_shared.author else 'Ohne Namensangabe' end,'updatedAt',v_shared.updated_at); end if;
  if v_operation is not null then select * into v_op from public.kd_blog_publication_operations
    where account_id=v_account and operation_id=v_operation;
    if v_op.operation_id is not null then
      if v_op.article_id<>v_article or v_op.conflict_detected then v_operation_result:=jsonb_build_object(
        'operationId',v_operation,'action',v_op.action,'status','conflict','result',null,'errorCode','OPERATION_ID_CONFLICT');
      else v_operation_result:=jsonb_build_object('operationId',v_operation,'action',v_op.action,'status',v_op.status,
        'result',case when v_op.status='applied' then v_op.response else null end,'errorCode',v_op.error_code); end if;
    end if; end if;
  return jsonb_build_object('contractVersion','blog-publication-v3','privateArticleId',v_article,
    'currentPublication',v_current,'operation',v_operation_result,'legacyReloadRequired',coalesce(
      v_shared.publication_id is not null and v_shared.contract_version not in ('blog-publication-v2','blog-publication-v3'),false));
end
$$;

create function public.kd_withdraw_blog_publication_v3(p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_legacy jsonb; v_response jsonb; v_account uuid; v_operation uuid;
begin
  if p_request->>'contractVersion'<>'blog-publication-v3' then raise exception 'invalid_blog_withdraw_request' using errcode='22023'; end if;
  v_account:=public.kd_blog_require_owner(); v_operation:=(p_request->>'operationId')::uuid;
  v_legacy:=jsonb_set(p_request,'{contractVersion}','"blog-publication-v2"'::jsonb,false);
  v_response:=public.kd_withdraw_blog_publication_v2(v_legacy)||jsonb_build_object('contractVersion','blog-publication-v3');
  update public.kd_blog_publication_operations set response=v_response where account_id=v_account and operation_id=v_operation;
  return v_response;
end
$$;

-- Legacy clients keep their anonymous projection and cannot mutate v3 rows.
create or replace function public.kd_list_shared_articles()
returns table(publication_id uuid,share_token uuid,article_id text,author text,payload jsonb,updated_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.kd_blog_require_owner(); return query select s.publication_id,s.share_token,s.publication_id::text,
  'Ohne Namensangabe'::text,public.kd_blog_legacy_payload(s.publication_id),s.updated_at from public.kd_shared_articles s
  where s.contract_version not in ('blog-publication-v2','blog-publication-v3') order by s.updated_at desc,s.publication_id desc; end
$$;

do $$
declare v_definition text; v_old text := 's.contract_version is distinct from ''blog-publication-v2''';
begin
  select pg_get_functiondef('public.kd_list_shared_articles_v1(jsonb)'::regprocedure) into v_definition;
  if position(v_old in v_definition)=0 then raise exception 'blog v1 list projection drift'; end if;
  execute replace(v_definition,v_old,'s.contract_version not in (''blog-publication-v2'',''blog-publication-v3'')');
  select pg_get_functiondef('public.kd_claim_shared_article(uuid)'::regprocedure) into v_definition;
  if position(v_old in v_definition)=0 then raise exception 'legacy blog claim projection drift'; end if;
  execute replace(v_definition,v_old,'s.contract_version not in (''blog-publication-v2'',''blog-publication-v3'')');
end
$$;

revoke all on function public.kd_blog_public_author(uuid) from public,anon,authenticated;
revoke all on function public.kd_publish_blog_v3(jsonb),public.kd_update_blog_publication_v3(jsonb),
  public.kd_withdraw_blog_publication_v3(jsonb),public.kd_read_own_blog_publication_v3(jsonb),
  public.kd_list_shared_articles_v3(jsonb),public.kd_blog_publication_capabilities_v3() from public,anon;
grant execute on function public.kd_publish_blog_v3(jsonb),public.kd_update_blog_publication_v3(jsonb),
  public.kd_withdraw_blog_publication_v3(jsonb),public.kd_read_own_blog_publication_v3(jsonb),
  public.kd_list_shared_articles_v3(jsonb),public.kd_blog_publication_capabilities_v3() to authenticated,service_role;

commit;

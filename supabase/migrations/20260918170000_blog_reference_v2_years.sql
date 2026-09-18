-- Explicitly approved additive M7 follow-up: v2 music/other references may use
-- years 1..2200. v1 and v2 film/series remain restricted to 1870..2200.
begin;

do $$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.kd_blog_validate_write_request(jsonb,text)'::regprocedure
  ) into v_definition;

  v_old := 'or (jsonb_typeof(v_ref->''year'')=''number'' and public.kd_blog_int(v_ref->>''year'') not between 1870 and 2200)';
  v_new := 'or (jsonb_typeof(v_ref->''year'')=''number'' and (((v_version<>''blog-publication-v2'' or coalesce(v_ref->>''mediaType'','''') in (''film'',''serie'')) and public.kd_blog_int(v_ref->>''year'') not between 1870 and 2200) or (v_version=''blog-publication-v2'' and coalesce(v_ref->>''mediaType'','''') in (''musik'',''sonstiges'') and public.kd_blog_int(v_ref->>''year'') not between 1 and 2200)))';

  if position(v_old in v_definition) = 0 then
    raise exception 'M7 blog v2 year validator drift';
  end if;
  execute replace(v_definition, v_old, v_new);
end
$$;

commit;

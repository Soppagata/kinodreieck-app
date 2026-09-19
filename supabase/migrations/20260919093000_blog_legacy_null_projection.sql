-- Preserve unversioned legacy rows after the additive v3 publication migration.
-- SQL NOT IN excludes NULL, whereas the historical IS DISTINCT FROM filter did
-- not. Replace only the three legacy/v1 projections changed by v3.
begin;

do $$
declare
  v_signature text;
  v_definition text;
  v_old constant text := 's.contract_version not in (''blog-publication-v2'',''blog-publication-v3'')';
  v_new constant text := 's.contract_version is distinct from ''blog-publication-v2'' and s.contract_version is distinct from ''blog-publication-v3''';
begin
  foreach v_signature in array array[
    'public.kd_list_shared_articles()',
    'public.kd_list_shared_articles_v1(jsonb)',
    'public.kd_claim_shared_article(uuid)'
  ] loop
    select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
    if v_definition is null or position(v_old in v_definition)=0 then
      raise exception 'blog legacy NULL projection drift: %',v_signature;
    end if;
    execute replace(v_definition,v_old,v_new);
  end loop;
end
$$;

commit;

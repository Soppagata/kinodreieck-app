-- READ-ONLY REVIEW, nicht Teil der Forward-Kette und kein Laufnachweis.
-- Erst nach einem getrennt freigegebenen Migrationslauf ausführen.
select table_schema,table_name,is_insertable_into
from information_schema.tables
where (table_schema='private' and table_name like 'kd_api_%_v1')
   or (table_schema='public' and table_name='kd_api_job_v1')
order by table_schema,table_name;

select routine_schema,routine_name,security_type
from information_schema.routines
where routine_schema='public' and routine_name like 'kd_api_%_v1'
order by routine_name;

select routine_name,grantee,privilege_type
from information_schema.routine_privileges
where routine_schema='public' and routine_name like 'kd_api_%_v1'
order by routine_name,grantee;

select table_schema,table_name,grantee,privilege_type
from information_schema.role_table_grants
where (table_schema='private' and table_name like 'kd_api_%_v1')
   or (table_schema='public' and table_name='kd_api_job_v1')
order by table_schema,table_name,grantee,privilege_type;

select n.nspname schema_name,p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('private','public') and p.proname like 'kd_api_%_v1'
order by n.nspname,p.proname,arguments;

-- Narrow prerequisite for the bounded blog-reference maintenance job.
-- Supabase Cron installs pg_cron in pg_catalog and exposes its job tables in cron.
begin;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

commit;

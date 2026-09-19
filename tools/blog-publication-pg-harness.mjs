import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const BLOG_TEST_ACCOUNTS = Object.freeze({
  alpha: "10000000-0000-4000-8000-000000000001",
  beta: "10000000-0000-4000-8000-000000000002",
  inactive: "10000000-0000-4000-8000-000000000003",
});

const MIGRATION = "supabase/migrations/20260918120000_blog_publication_v1.sql";
const PERSONAL_MIGRATION = "supabase/migrations/20260725120000_kd_personal.sql";
const CRON_PREREQUISITE = "supabase/migrations/20260918115900_blog_publication_pg_cron.sql";
const SETWISE_MIGRATION = "supabase/migrations/20260918130000_blog_catalog_setwise.sql";
const LOOKUP_MIGRATION = "supabase/migrations/20260918133000_blog_catalog_lookup.sql";
const REFERENCE_V2_MIGRATION = "supabase/migrations/20260918140000_blog_reference_limit_v2.sql";
const AUTHOR_V3_MIGRATION = "supabase/migrations/20260919090000_blog_publication_author_v3.sql";

function verifyCronPrerequisiteSql() {
  const sql = readFileSync(CRON_PREREQUISITE, "utf8");
  const required = [
    /create\s+extension\s+if\s+not\s+exists\s+pg_cron\s+with\s+schema\s+pg_catalog/i,
    /grant\s+usage\s+on\s+schema\s+cron\s+to\s+postgres/i,
    /grant\s+all\s+privileges\s+on\s+all\s+tables\s+in\s+schema\s+cron\s+to\s+postgres/i,
  ];
  if (!required.every((pattern) => pattern.test(sql)) || /https?:\/\/|net\.http|webhook/i.test(sql)) {
    throw new Error("invalid blog pg_cron prerequisite migration");
  }
}

function pgBin() {
  const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
  const candidates = [
    process.env.KD_TEST_PG_BIN,
    "/Applications/Postgres.app/Contents/Versions/17/bin",
    configured.status === 0 ? configured.stdout.trim() : null,
    "/usr/lib/postgresql/17/bin",
  ].filter(Boolean);
  const required = ["initdb", "pg_ctl", "psql"];
  const selected = [...new Set(candidates)].find((dir) => required.every((name) => existsSync(join(dir, name))));
  if (!selected) throw new Error(`PostgreSQL 17 binaries required: ${required.join(", ")}`);
  return selected;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonLiteral(value) {
  return `${literal(JSON.stringify(value))}::jsonb`;
}

function baseSchemaSql() {
  return `
create extension if not exists pgcrypto;
create role anon; create role authenticated; create role service_role bypassrls;
create schema cron;
create table cron.job(
  jobid bigint generated always as identity primary key,
  jobname text not null unique,schedule text not null,command text not null
);
create function cron.schedule(p_jobname text,p_schedule text,p_command text) returns bigint
language plpgsql as $$declare v_jobid bigint; begin
  insert into cron.job(jobname,schedule,command) values(p_jobname,p_schedule,p_command)
  returning jobid into v_jobid; return v_jobid;
end$$;
create function cron.unschedule(p_jobid bigint) returns boolean
language plpgsql as $$begin delete from cron.job where jobid=p_jobid; return found; end$$;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role',true),'')
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.role(),auth.uid() to anon,authenticated,service_role;
create table public.kd_account_access(
  account_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default false
);
create function public.kd_account_active() returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select coalesce((select active from public.kd_account_access where account_id=auth.uid()),false)
$$;
create table public.kd_shared_articles(
  publication_id uuid primary key default gen_random_uuid(),
  share_token uuid not null default gen_random_uuid() unique,
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  article_id text not null check(char_length(article_id) between 1 and 160),
  author text not null check(char_length(author) between 1 and 120),
  payload jsonb not null check(jsonb_typeof(payload)='object' and payload?'titel' and payload?'text'),
  published_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(account_id,article_id)
);
create function public.kd_shared_article_touch() returns trigger language plpgsql
set search_path=pg_catalog,public as $$begin
  if tg_op='INSERT' then
    if auth.uid() is null then raise exception 'authenticated account required' using errcode='42501'; end if;
    new.account_id:=auth.uid(); new.publication_id:=coalesce(new.publication_id,gen_random_uuid());
    new.share_token:=gen_random_uuid(); new.published_at:=now();
  else
    new.account_id:=old.account_id; new.publication_id:=old.publication_id;
    new.share_token:=old.share_token; new.article_id:=old.article_id; new.published_at:=old.published_at;
  end if;
  new.updated_at:=now(); return new;
end$$;
create trigger kd_shared_article_touch_trg before insert or update on public.kd_shared_articles
for each row execute function public.kd_shared_article_touch();
create table public.kd_shared_article_claims(
  account_id uuid not null references auth.users(id) on delete cascade,
  share_token uuid not null references public.kd_shared_articles(share_token) on delete cascade,
  claimed_at timestamptz not null default now(),primary key(account_id,share_token)
);
create function public.kd_seed_shared_article_owner_claim() returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$begin
  insert into public.kd_shared_article_claims(account_id,share_token) values(new.account_id,new.share_token)
  on conflict do nothing; return new;
end$$;
create trigger kd_shared_article_owner_claim_trg after insert on public.kd_shared_articles
for each row execute function public.kd_seed_shared_article_owner_claim();
create function public.kd_list_shared_articles() returns table(
  publication_id uuid,share_token uuid,article_id text,author text,payload jsonb,updated_at timestamptz)
language sql stable security definer set search_path=pg_catalog,public as $$
  select publication_id,share_token,article_id,author,payload,updated_at from public.kd_shared_articles
$$;
create function public.kd_claim_shared_article(p_share_token uuid) returns table(
  publication_id uuid,share_token uuid,article_id text,author text,payload jsonb,updated_at timestamptz,claimed boolean)
language sql volatile security definer set search_path=pg_catalog,public as $$
  select s.publication_id,s.share_token,s.article_id,s.author,s.payload,s.updated_at,false
  from public.kd_shared_articles s where s.share_token=p_share_token
$$;
alter table public.kd_shared_articles enable row level security;
alter table public.kd_shared_article_claims enable row level security;
grant all on public.kd_shared_articles to authenticated,service_role;
grant all on public.kd_shared_article_claims to service_role;
create table public.kd_catalog(
  name text primary key,payload jsonb not null,sha256 text,updated_at timestamptz not null default now(),
  quelle text,stand timestamptz,gueltig_bis timestamptz
);
create table public.kd_streaming_page_state(
  singleton boolean primary key default true check(singleton),
  source_revision bigint not null default 0,generated_at timestamptz not null default now(),meta jsonb not null default '{}'
);
create table public.kd_streaming_page_base(
  source_key text primary key,payload jsonb not null,services text[] not null default '{}',genres text[] not null default '{}',
  aliases text[] not null default '{}',identity_keys text[] not null default '{}',title_keys text[] not null default '{}',
  title_norms text[] not null default '{}',title_sort text,title_order text,provider_sort text,work_type text,
  release_year integer,watchmode_id text,imdb_id text,tmdb_id text,known boolean not null default false
);
create table public.kd_streaming_page_motn(
  show_id text primary key,base_key text,output_key text not null unique,payload jsonb not null,
  services text[] not null default '{}',genres text[] not null default '{}',aliases text[] not null default '{}',
  identity_keys text[] not null default '{}',title_keys text[] not null default '{}',title_norms text[] not null default '{}',
  title_sort text,title_order text,provider_sort text,work_type text,release_year integer,
  watchmode_id text,imdb_id text,tmdb_id text,known boolean not null default false,hidden boolean not null default false,
  match_kind text not null default 'unmatched'
);
grant all on public.kd_catalog,public.kd_streaming_page_state,
  public.kd_streaming_page_base,public.kd_streaming_page_motn to service_role;
insert into auth.users(id,email) values
  ('${BLOG_TEST_ACCOUNTS.alpha}','alpha@login.kinodreieck.at'),
  ('${BLOG_TEST_ACCOUNTS.beta}','beta@login.kinodreieck.at'),
  ('${BLOG_TEST_ACCOUNTS.inactive}','inactive@login.kinodreieck.at');
insert into public.kd_account_access(account_id,active) values
  ('${BLOG_TEST_ACCOUNTS.alpha}',true),('${BLOG_TEST_ACCOUNTS.beta}',true),('${BLOG_TEST_ACCOUNTS.inactive}',false);
`;
}

export const BLOG_DEFAULT_STREAMING_ROWS = Object.freeze([
  { sourceKey: "stream-new-hope", title: "Star Wars: A New Hope", year: 1977, type: "film", services: ["Netflix"], watchmode: "900001", imdb: "tt0076759", tmdb: "11" },
  { sourceKey: "stream-empire", title: "Star Wars: The Empire Strikes Back", year: 1980, type: "film", services: ["Disney+"], watchmode: "fixture-watchmode-empire", imdb: "tt0080684", tmdb: "1891" },
  { sourceKey: "stream-twin-a", title: "Synthetic Twin", year: 2000, type: "film", services: ["Netflix"], watchmode: "twin-a", imdb: "tt1000001", tmdb: "1001" },
  { sourceKey: "stream-twin-b", title: "Synthetic Twin", year: 2000, type: "film", services: ["Prime Video"], watchmode: "twin-b", imdb: "tt1000002", tmdb: "1002" },
  { sourceKey: "stream-remake-old", title: "Synthetic Remake", year: 1984, type: "film", services: ["MUBI"], watchmode: "remake-old", imdb: "tt1000010", tmdb: "1010" },
  { sourceKey: "stream-remake-new", title: "Synthetic Remake", year: 2021, type: "film", services: ["HBO Max"], watchmode: "remake-new", imdb: "tt1000011", tmdb: "1011" },
]);

function defaultProgram(now = Date.now()) {
  return {
    filme: [{
      film_at_id: "fixture-film-at-jedi",
      titel: "Star Wars: Return of the Jedi",
      jahr: 1983,
      vorstellungen: [{ kino: "Fixture Kino", zeit: new Date(now + 8 * 60 * 60 * 1000).toISOString() }],
    }],
  };
}

export async function startBlogPublicationPgHarness({
  applySetwiseMigration = true,
  applyLookupMigration = applySetwiseMigration,
  applyAuthorMigration = false,
} = {}) {
  const pg = pgBin();
  const root = mkdtempSync(join(tmpdir(), "kd-blog-pg-"));
  const data = join(root, "data");
  const socket = join(root, "socket");
  const port = String(47000 + process.pid % 10000);
  const env = { PATH: `${pg}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
  const psqlArgs = ["-h", socket, "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"];
  let running = false;

  const run = (binary, args, input, maxBuffer = 64_000_000) => {
    const result = spawnSync(join(pg, binary), args, { input, encoding: "utf8", timeout: 120_000, maxBuffer, env });
    if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error || result.status}`);
    return result.stdout.trim();
  };
  const rawSql = (statement) => run("psql", psqlArgs, statement);
  const session = (statement, { role = "service_role", accountId = null, commit = true } = {}) => rawSql(`
    begin; set local role ${role};
    select set_config('request.jwt.claim.role',${literal(role)},true);
    select set_config('request.jwt.claim.sub',${literal(accountId || "")},true);
    ${statement}
    ${commit ? "commit" : "rollback"};
  `);
  const lastJson = (output) => {
    const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
    return JSON.parse(lines.at(-1));
  };

  const sourceUpdate = ({
    streamingRows = BLOG_DEFAULT_STREAMING_ROWS,
    sourceRevision = 1,
    streamingGeneratedAt = new Date().toISOString(),
    programPayload = defaultProgram(),
    programUpdatedAt = new Date().toISOString(),
    programValidUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  } = {}) => {
    const inserts = streamingRows.map((row) => `(${literal(row.sourceKey)},${jsonLiteral({
      titel: row.title, jahr: row.year, typ: row.type,
      watchmode_id: row.watchmode ?? null, imdb_id: row.imdb ?? null, tmdb_id: row.tmdb ?? null,
      dienste: row.services || [],
    })},array[${(row.services || []).map(literal).join(",")}],${literal(row.type)},${Number(row.year)},${row.watchmode == null ? "null" : literal(row.watchmode)},${row.imdb == null ? "null" : literal(row.imdb)},${row.tmdb == null ? "null" : literal(row.tmdb)},true)`).join(",\n");
    rawSql(`begin;
      delete from public.kd_streaming_page_motn; delete from public.kd_streaming_page_base;
      delete from public.kd_streaming_page_state;
      insert into public.kd_streaming_page_state(singleton,source_revision,generated_at,meta)
        values(true,${Number(sourceRevision)},${literal(streamingGeneratedAt)}::timestamptz,'{}');
      ${inserts ? `insert into public.kd_streaming_page_base(source_key,payload,services,work_type,release_year,watchmode_id,imdb_id,tmdb_id,known) values ${inserts};` : ""}
      insert into public.kd_catalog(name,payload,updated_at,quelle,stand,gueltig_bis)
        values('programm',${jsonLiteral(programPayload)},${literal(programUpdatedAt)}::timestamptz,'fixture-film-at',${literal(programUpdatedAt)}::timestamptz,${literal(programValidUntil)}::timestamptz)
      on conflict(name) do update set payload=excluded.payload,updated_at=excluded.updated_at,
        quelle=excluded.quelle,stand=excluded.stand,gueltig_bis=excluded.gueltig_bis;
      commit;`);
  };

  const seedScaleCatalog = ({
    baseCount = 24_678,
    motnCount = 1_115,
    programCount = 753,
    sourceRevision = 90,
    streamingGeneratedAt = new Date().toISOString(),
  } = {}) => {
    if (!Number.isInteger(baseCount) || baseCount < 20 || !Number.isInteger(motnCount)
      || motnCount < 0 || motnCount > baseCount || !Number.isInteger(programCount)
      || programCount < 0 || !Number.isInteger(sourceRevision)) {
      throw new Error("invalid scale catalog dimensions");
    }
    rawSql(`begin;
      delete from public.kd_streaming_page_motn;
      delete from public.kd_streaming_page_base;
      delete from public.kd_streaming_page_state;
      insert into public.kd_streaming_page_state(singleton,source_revision,generated_at,meta)
        values(true,${sourceRevision},${literal(streamingGeneratedAt)}::timestamptz,'{}');
      insert into public.kd_streaming_page_base(
        source_key,payload,services,work_type,release_year,watchmode_id,imdb_id,tmdb_id,known
      )
      select
        'scale-'||lpad(g::text,5,'0'),
        jsonb_build_object(
          'titel',case when g in (1,2) then 'Scale Ambiguous Twin'
            when g>${baseCount - 128} then 'Scale Wide Sources'
            else 'Scale Film '||lpad(g::text,5,'0') end,
          'jahr',case when g in (1,2) then 2000 when g>${baseCount - 128} then 2024 else 1950+(g%75) end,
          'typ','film'
        ),
        case when g=11045 then array['MUBI','Synthetic Unknown Service']
          when g>${baseCount - 128} then array[case g%8 when 0 then 'Netflix'
            when 1 then 'Prime Video' when 2 then 'Disney+' when 3 then 'Apple TV+'
            when 4 then 'HBO Max' when 5 then 'Paramount Plus' when 6 then 'MUBI' else 'Crunchyroll' end]
          when g<=11045 then array[case g%4 when 0 then 'Netflix' when 1 then 'Prime Video'
          when 2 then 'Disney+' else 'MUBI' end]
          when g=11046 then array['Netflix','Prime Video','Disney+','Apple TV+',
            'HBO Max','Paramount Plus','MUBI','Crunchyroll']
          else '{}'::text[] end,
        'film',case when g in (1,2) then 2000 when g>${baseCount - 128} then 2024 else 1950+(g%75) end,
        case when g>${baseCount - 128} then 'wm-scale-wide' else 'wm-scale-'||g::text end,
        case when g>${baseCount - 128} then 'tt7999999' else 'tt'||lpad((7000000+g)::text,7,'0') end,
        case when g>${baseCount - 128} then '8999999' else (8000000+g)::text end,
        true
      from generate_series(1,${baseCount}) g;
      insert into public.kd_streaming_page_motn(
        show_id,base_key,output_key,payload,services,work_type,release_year,
        watchmode_id,imdb_id,tmdb_id,known,hidden,match_kind
      )
      select
        'motn-scale-'||g::text,
        'scale-'||lpad(g::text,5,'0'),
        'scale-'||lpad(g::text,5,'0'),
        jsonb_build_object(
          'titel',case when g in (1,2) then 'Scale Ambiguous Twin'
            when g>${baseCount - 128} then 'Scale Wide Sources'
            else 'Scale Film '||lpad(g::text,5,'0') end,
          'jahr',case when g in (1,2) then 2000 when g>${baseCount - 128} then 2024 else 1950+(g%75) end,
          'typ','film'
        ),
        case when g=11045 then array['MUBI','Synthetic Unknown Service']
          when g>${baseCount - 128} then array[case g%8 when 0 then 'Netflix'
            when 1 then 'Prime Video' when 2 then 'Disney+' when 3 then 'Apple TV+'
            when 4 then 'HBO Max' when 5 then 'Paramount Plus' when 6 then 'MUBI' else 'Crunchyroll' end]
          when g<=11045 then array[case g%4 when 0 then 'Netflix' when 1 then 'Prime Video'
          when 2 then 'Disney+' else 'MUBI' end]
          when g=11046 then array['Netflix','Prime Video','Disney+','Apple TV+',
            'HBO Max','Paramount Plus','MUBI','Crunchyroll']
          else '{}'::text[] end,
        'film',case when g in (1,2) then 2000 when g>${baseCount - 128} then 2024 else 1950+(g%75) end,
        case when g>${baseCount - 128} then 'wm-scale-wide' else 'wm-scale-'||g::text end,
        case when g>${baseCount - 128} then 'tt7999999' else 'tt'||lpad((7000000+g)::text,7,'0') end,
        case when g>${baseCount - 128} then '8999999' else (8000000+g)::text end,
        true,false,'strong_identity'
      from generate_series(1,${motnCount}) g;
      update public.kd_catalog set
        payload=jsonb_build_object('filme',coalesce((select jsonb_agg(jsonb_build_object(
          'film_at_id','scale-cinema-'||g::text,
          'titel','Scale Cinema '||lpad(g::text,4,'0'),
          'jahr',1950+(g%75),
          'vorstellungen',jsonb_build_array(jsonb_build_object(
            'kino','Scale Kino','zeit',(now()+interval '12 hours')::text))
        )) from generate_series(1,${programCount}) g),'[]'::jsonb)),
        updated_at=now(),stand=now(),gueltig_bis=now()+interval '24 hours'
      where name='programm';
      commit;`);
  };

  try {
    mkdirSync(socket);
    run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--set", "shared_memory_type=mmap", "--pgdata", data]);
    run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"), "--options",
      `-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`, "--wait", "start"]);
    running = true;
    /* pg_cron is not installed into the disposable local cluster. The schema
       above is a narrow test double; this check binds it to the declarative
       prerequisite without claiming a real extension installation. */
    verifyCronPrerequisiteSql();
    rawSql(baseSchemaSql());
    rawSql(readFileSync(PERSONAL_MIGRATION, "utf8"));
    sourceUpdate();
    rawSql(readFileSync(MIGRATION, "utf8"));
    if (applySetwiseMigration) rawSql(readFileSync(SETWISE_MIGRATION, "utf8"));
    if (applyLookupMigration) {
      if (!applySetwiseMigration) throw new Error("lookup migration requires setwise migration");
      rawSql(readFileSync(LOOKUP_MIGRATION, "utf8"));
    }
    rawSql(readFileSync(REFERENCE_V2_MIGRATION, "utf8"));
    if (applyAuthorMigration) rawSql(readFileSync(AUTHOR_V3_MIGRATION, "utf8"));

    const scalarRpcs = new Set([
      "kd_blog_publication_capabilities", "kd_publish_blog_v1", "kd_update_blog_publication_v1",
      "kd_withdraw_blog_publication_v1", "kd_read_own_blog_publication_v1",
      "kd_list_shared_articles_v1", "kd_refresh_blog_reference_sources_v1",
      "kd_blog_publication_capabilities_v2", "kd_publish_blog_v2",
      "kd_update_blog_publication_v2", "kd_withdraw_blog_publication_v2",
      "kd_read_own_blog_publication_v2", "kd_list_shared_articles_v2",
      "kd_blog_publication_capabilities_v3", "kd_publish_blog_v3",
      "kd_update_blog_publication_v3", "kd_withdraw_blog_publication_v3",
      "kd_read_own_blog_publication_v3", "kd_list_shared_articles_v3",
    ]);
    const tableRpcs = new Set(["kd_list_shared_articles", "kd_claim_shared_article"]);
    const callRpc = (name, args, {
      role = "authenticated",
      accountId = BLOG_TEST_ACCOUNTS.alpha,
      statementTimeoutMs = null,
    } = {}) => {
      if (!scalarRpcs.has(name) && !tableRpcs.has(name)) throw new Error(`unsupported RPC: ${name}`);
      if (statementTimeoutMs !== null
        && (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1 || statementTimeoutMs > 120_000)) {
        throw new Error("invalid statement timeout");
      }
      let invocation;
      if (name === "kd_blog_publication_capabilities" || name === "kd_blog_publication_capabilities_v2"
        || name === "kd_blog_publication_capabilities_v3"
        || name === "kd_list_shared_articles") invocation = `public.${name}()`;
      else if (name === "kd_claim_shared_article") invocation = `public.${name}(${literal(args?.p_share_token)}::uuid)`;
      else invocation = `public.${name}(${jsonLiteral(args?.p_request ?? args)})`;
      const select = scalarRpcs.has(name)
        ? `select to_jsonb(${invocation});`
        : `select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from ${invocation} r;`;
      const timeout = statementTimeoutMs === null ? "" : `set local statement_timeout=${statementTimeoutMs};`;
      return lastJson(session(`${timeout}${select}`, { role, accountId }));
    };
    const runScheduledRefresh = () => {
      const command = rawSql("select command from cron.job where jobname='kd-blog-reference-refresh-v1';");
      if (!command) throw new Error("blog refresh scheduler job missing");
      return lastJson(rawSql(command));
    };
    const scheduledRefreshJob = () => lastJson(rawSql(`select to_jsonb(j) from (
      select jobname,schedule,command from cron.job where jobname='kd-blog-reference-refresh-v1'
    ) j;`));
    const holdBlogAccountLock = (accountId) => new Promise((resolve, reject) => {
      const child = spawn(join(pg, "psql"), psqlArgs, { env, stdio: ["pipe", "pipe", "pipe"] });
      let output = ""; let errors = ""; let settled = false;
      const finish = (error, value) => {
        if (settled) return; settled = true;
        if (error) reject(error); else resolve(value);
      };
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("BLOG_LOCK_READY")) {
          finish(null, { stop() {
            if (child.exitCode !== null) return Promise.resolve();
            return new Promise((done) => {
              child.once("exit", () => done());
              child.kill("SIGINT");
            });
          } });
        }
      });
      child.stderr.on("data", (chunk) => { errors += chunk; });
      child.on("error", (error) => finish(error));
      child.on("exit", (code) => {
        if (!settled) finish(new Error(`blog lock holder exited ${code}: ${errors}`));
      });
      child.stdin.end(`begin;
        select pg_advisory_xact_lock(hashtextextended('kd-blog-publication-account:${accountId}',0));
        select 'BLOG_LOCK_READY';
        select pg_sleep(30);
        rollback;`);
    });
    const holdBlogGlobalLocks = () => new Promise((resolve, reject) => {
      const child = spawn(join(pg, "psql"), psqlArgs, { env, stdio: ["pipe", "pipe", "pipe"] });
      let output = ""; let errors = ""; let settled = false;
      const finish = (error, value) => {
        if (settled) return; settled = true;
        if (error) reject(error); else resolve(value);
      };
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("BLOG_GLOBAL_LOCKS_READY")) {
          finish(null, { stop() {
            if (child.exitCode !== null) return Promise.resolve();
            return new Promise((done) => {
              child.once("exit", () => done());
              child.kill("SIGINT");
            });
          } });
        }
      });
      child.stderr.on("data", (chunk) => { errors += chunk; });
      child.on("error", (error) => finish(error));
      child.on("exit", (code) => {
        if (!settled) finish(new Error(`blog global lock holder exited ${code}: ${errors}`));
      });
      child.stdin.end(`begin;
        select pg_advisory_xact_lock(hashtextextended(
          'kd-blog-publication-global:'||g::text,0)) from generate_series(0,7) g;
        select 'BLOG_GLOBAL_LOCKS_READY';
        select pg_sleep(30);
        rollback;`);
    });

    return Object.freeze({
      accounts: BLOG_TEST_ACCOUNTS,
      defaultStreamingRows: BLOG_DEFAULT_STREAMING_ROWS,
      callRpc,
      runScheduledRefresh,
      scheduledRefreshJob,
      holdBlogAccountLock,
      holdBlogGlobalLocks,
      seedScaleCatalog,
      sourceUpdate,
      sql(statement, options = {}) { return session(statement, options); },
      sqlJson(statement, options = {}) { return lastJson(session(statement, options)); },
      stop() {
        if (running) { run("pg_ctl", ["--pgdata", data, "--wait", "stop"]); running = false; }
        rmSync(root, { recursive: true, force: true });
      },
    });
  } catch (error) {
    if (running) { try { run("pg_ctl", ["--pgdata", data, "--wait", "stop"]); } catch { /* keep original */ } }
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

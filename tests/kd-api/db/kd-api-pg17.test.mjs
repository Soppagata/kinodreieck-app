import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

test("KD API persistence enforces account, role, revocation, idempotency and revision boundaries", { timeout: 120_000 }, () => {
  const required = ["initdb","pg_ctl","postgres","psql"];
  const candidates = [process.env.KD_TEST_PG_BIN,"/Applications/Postgres.app/Contents/Versions/17/bin","/usr/lib/postgresql/17/bin"].filter(Boolean);
  const pg = candidates.find((dir) => required.every((name) => existsSync(join(dir,name))));
  assert.ok(pg,"PostgreSQL 17 binaries required");
  const root=mkdtempSync("/private/tmp/kd-api-pg-"); const data=join(root,"data"); const socket=join(root,"socket"); mkdirSync(socket);
  const port=String(61000+(process.pid%3000)); let running=false;
  const env={PATH:`${pg}:/usr/bin:/bin`,LANG:"C",LC_ALL:"C"};
  function run(binary,args,input,allow=false){const commandEnv=binary==="initdb"?{...env,PGOPTIONS:"-c shared_memory_type=mmap -c dynamic_shared_memory_type=posix"}:env;const r=spawnSync(join(pg,binary),args,{input,encoding:"utf8",timeout:90_000,maxBuffer:12_000_000,env:commandEnv});if(!allow&&r.status!==0)throw new Error(`${binary}: ${r.stderr||r.error}`);return r;}
  const args=["-h",socket,"-p",port,"-U","postgres","-d","postgres","-X","-qAt","-v","ON_ERROR_STOP=1","-f","-"];
  const sql=(q,allow=false)=>run("psql",args,q,allow);
  const scalar=(q)=>sql(q).stdout.trim().split("\n").filter(Boolean).at(-1);
  const service=(q,allow=false)=>allow
    ? sql(`begin; set local role service_role; select set_config('request.jwt.claim.role','service_role',true); ${q}; commit;`,true)
    : scalar(`begin; set local role service_role; select set_config('request.jwt.claim.role','service_role',true); ${q}; commit;`);
  const authenticated=(account,q,allow=false)=>sql(`begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','${account}',true); ${q}; commit;`,allow);
  const json=(value)=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
  const owner="10000000-0000-4000-8000-000000000001", member="10000000-0000-4000-8000-000000000002", stranger="10000000-0000-4000-8000-000000000003";
  const op=(n)=>`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`; const digest=(c)=>c.repeat(64);
  let checks=0; const check=(name,fn)=>{fn();checks++;};
  try {
    run("initdb",["--no-locale","--encoding=UTF8","--auth=trust","--username=postgres","--set","shared_memory_type=mmap","--set","dynamic_shared_memory_type=posix","--pgdata",data]);
    run("pg_ctl",["--pgdata",data,"--log",join(root,"postgres.log"),"--options",`-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,"--wait","start"]); running=true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema extensions;
      create extension pgcrypto with schema extensions; grant usage on schema auth,extensions to anon,authenticated,service_role;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.kd_account_access(account_id uuid primary key references auth.users(id),role text not null,active boolean not null,personal_ai boolean not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
      grant select,insert,update,delete on public.kd_account_access to service_role;
      create table public.kd_personal(account_id uuid not null references auth.users(id),key text not null,value text not null,revision bigint not null default 1,updated_at timestamptz not null default now(),primary key(account_id,key));
      create function public.kd_personal_touch() returns trigger language plpgsql as $$begin new.revision=old.revision+1;new.updated_at=now();return new;end$$;
      create trigger kd_personal_touch before update on public.kd_personal for each row execute function public.kd_personal_touch();
      alter table public.kd_personal enable row level security;
      create policy own_personal on public.kd_personal to authenticated using(account_id=auth.uid()) with check(account_id=auth.uid());
      grant select,insert,update,delete on public.kd_personal to authenticated,service_role;
      create table public.kd_shared_articles(publication_id uuid primary key default gen_random_uuid(),account_id uuid,article_id text,share_token uuid default gen_random_uuid(),author text,author_mode text default 'anonymous',payload jsonb default '{}',public_revision bigint default 1,published_content_version uuid,published_at timestamptz default now(),updated_at timestamptz default now(),contract_version text default 'blog-publication-v3');
      create function public.kd_publish_blog_v3(jsonb) returns jsonb language sql as $$select jsonb_build_object('outcome','published')$$;
      create function public.kd_update_blog_publication_v3(jsonb) returns jsonb language sql as $$select jsonb_build_object('outcome','updated')$$;
      create function public.kd_withdraw_blog_publication_v3(jsonb) returns jsonb language sql as $$select jsonb_build_object('outcome','withdrawn')$$;
      create function public.kd_list_shared_articles_v3(jsonb) returns jsonb language sql as $$select jsonb_build_object('items','[]'::jsonb,'nextCursor',null,'complete',true)$$;
      create function public.kd_blog_public_article(uuid) returns jsonb language sql as $$select jsonb_build_object('references','[]'::jsonb)$$;
      insert into auth.users(id,email) values('${owner}','owner@login.kinodreieck.at'),('${member}','member@login.kinodreieck.at'),('${stranger}','stranger@login.kinodreieck.at');
      insert into public.kd_account_access(account_id,role,active,personal_ai) values('${owner}','owner',true,true),('${member}','member',true,false),('${stranger}','member',true,false);`);
    sql(readFileSync("supabase/migrations/20260926120000_kd_api_v1.sql","utf8"));

    const ownerPermissions=["library.read","library.write","blog.read","blog.write","blog.publish","personal.read","personal.write","account.export","package.preview","package.apply","schedule.read","schedule.write","radar.read","radar.write","ai.run","diagnostics.read"];
    const ownerIssue=JSON.parse(service(`select public.kd_api_issue_access_v1('${op(1)}','${owner}','personal_owner',array[${ownerPermissions.map(x=>`'${x}'`).join(",")}],'${digest("a")}','owner-fp-0001',null,'owner');`));
    const memberPermissions=["library.read","library.write","personal.read","personal.write","radar.read","radar.write"];
    const memberIssue=JSON.parse(service(`select public.kd_api_issue_access_v1('${op(2)}','${member}','member',array[${memberPermissions.map(x=>`'${x}'`).join(",")}],'${digest("b")}','member-fp-001',null,'member');`));
    check("service-only issue returns metadata without raw key or digest",()=>{assert.equal(ownerIssue.assistantProfile,"personal_owner");assert.equal(JSON.stringify(ownerIssue).includes(digest("a")),false);assert.equal(Object.keys(ownerIssue).sort().join(","),["accessId","accountId","assistantProfile","createdAt","expiresAt","keyEpoch","keyFingerprint","operationId","permissions","revokedAt"].sort().join(","));});
    check("authenticated cannot invoke lifecycle or resolver",()=>{const r=authenticated(owner,`select public.kd_api_resolve_key_v1('${digest("a")}','${op(10)}',now());`,true);assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied/);});

    const ownerContext=JSON.parse(service(`select public.kd_api_resolve_key_v1('${digest("a")}','${op(11)}',now());`));
    const memberContext=JSON.parse(service(`select public.kd_api_resolve_key_v1('${digest("b")}','${op(12)}',now());`));
    check("resolver binds effective owner/member identity",()=>{assert.equal(ownerContext.aiAuthorized,true);assert.equal(memberContext.aiAuthorized,false);assert.equal(memberContext.accountId,member);});
    check("member cannot enqueue direct or indirect AI",()=>{const r=service(`select public.kd_api_enqueue_ai_job_v1('${memberContext.contextId}','${op(13)}','${digest("c")}','echo-struct','{}',${json({requestId:op(14),rootOperationId:op(13),surface:"test",clientVersion:"1"})});`,true);assert.notEqual(r.status,0);assert.match(r.stderr,/FORBIDDEN|AI_DISABLED/);});

    const first=JSON.parse(service(`select public.kd_api_mutate_personal_v1('${ownerContext.contextId}','kd:master',0,'${op(15)}','${digest("d")}','create','film-1',${json({id:"film-1",titel:"Eins",typ:"film"})},'{}');`));
    check("first personal mutation creates revision one",()=>{assert.equal(first.revision,1);assert.equal(first.entity.id,"film-1");});
    const replay=JSON.parse(service(`select public.kd_api_mutate_personal_v1('${ownerContext.contextId}','kd:master',0,'${op(15)}','${digest("d")}','create','film-1',${json({id:"film-1",titel:"Eins",typ:"film"})},'{}');`));
    const mismatch=JSON.parse(service(`select public.kd_api_mutate_personal_v1('${ownerContext.contextId}','kd:master',1,'${op(15)}','${digest("e")}','update','film-1',${json({titel:"Anders"})},'{}');`));
    check("idempotent replay is stable and hash drift conflicts",()=>{assert.equal(replay.replayed,true);assert.equal(mismatch.code,"IDEMPOTENCY_MISMATCH");});

    authenticated(owner,`update public.kd_personal set value=jsonb_set(value::jsonb,'{filme,0,titel}','"PWA"')::text where key='kd:master';`);
    const conflict=JSON.parse(service(`select public.kd_api_mutate_personal_v1('${ownerContext.contextId}','kd:master',1,'${op(16)}','${digest("f")}','update','film-1',${json({titel:"API"})},'{}');`));
    check("PWA concurrency yields revision conflict without overwrite",()=>{assert.equal(conflict.code,"REVISION_CONFLICT");assert.equal(conflict.currentRevision,2);assert.equal(scalar(`select value::jsonb#>>'{filme,0,titel}' from public.kd_personal where account_id='${owner}' and key='kd:master'`),"PWA");});
    check("foreign account never sees owner bucket",()=>{const read=JSON.parse(service(`select public.kd_api_read_personal_v1('${memberContext.contextId}','kd:master',null,'{}');`));assert.equal(read.revision,0);assert.deepEqual(read.items,[]);});

    const packet={format:"kinodreieck-paket",version:1,autor:"Test",bereiche:{filme:[{titel:"Paketfilm",jahr:2026,typ:"film"}]}};
    const preview=JSON.parse(service(`select public.kd_api_preview_package_v1('${ownerContext.contextId}',${json(packet)});`));
    const applied=JSON.parse(service(`select public.kd_api_apply_preview_v1('${ownerContext.contextId}','${preview.previewId}',array['library'],'${op(22)}','${digest("2")}',${json({requestId:op(23),rootOperationId:op(22),surface:"test",clientVersion:"1"})});`));
    check("package preview is write-free and apply uses the frozen revision plan",()=>{assert.deepEqual(preview.sections,["library"]);assert.equal(applied.status,"succeeded");assert.equal(scalar(`select count(*) from jsonb_array_elements((select value::jsonb->'filme' from public.kd_personal where account_id='${owner}' and key='kd:master')) x where x->>'titel'='Paketfilm'`),"1");});
    const page1=JSON.parse(service(`select public.kd_api_read_personal_v1('${ownerContext.contextId}','kd:master',null,${json({limit:1})});`));
    const page2=JSON.parse(service(`select public.kd_api_read_personal_v1('${ownerContext.contextId}','kd:master',null,${json({limit:1,cursor:"__CURSOR__"}).replace("__CURSOR__",page1.nextCursor)});`));
    check("pagination cursor is signed, account/revision bound and rejects tampering",()=>{assert.equal(page1.items.length,1);assert.equal(page2.items.length,1);assert.match(page1.nextCursor,/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);const tampered=page1.nextCursor.slice(0,-1)+(page1.nextCursor.endsWith("0")?"1":"0");const r=service(`select public.kd_api_read_personal_v1('${ownerContext.contextId}','kd:master',null,${json({limit:1,cursor:tampered})});`,true);assert.notEqual(r.status,0);assert.match(r.stderr,/VALIDATION_FAILED/);});

    const job=JSON.parse(service(`select public.kd_api_enqueue_ai_job_v1('${ownerContext.contextId}','${op(17)}','${digest("1")}','echo-struct','{}',${json({requestId:op(18),rootOperationId:op(17),surface:"test",clientVersion:"1"})});`));
    check("owner job has stable server origin and once-only claim",()=>{assert.equal(job.status,"queued");const claim=JSON.parse(service(`select public.kd_api_claim_ai_job_v1('${job.id}');`));assert.equal(claim.execute,true);assert.equal(claim.accountId,owner);});

    service(`update public.kd_account_access set role='member',updated_at=clock_timestamp()+interval '1 second' where account_id='${owner}';`);
    check("role downgrade invalidates old context before diagnostics/provider",()=>{const r=service(`select public.kd_api_backend_status_v1('${ownerContext.contextId}');`,true);assert.notEqual(r.status,0);assert.match(r.stderr,/ACCOUNT_INACTIVE/);const claim=JSON.parse(service(`select public.kd_api_claim_ai_job_v1('${job.id}');`));assert.equal(claim.code,"AI_DISABLED");});
    service(`update public.kd_account_access set role='owner',personal_ai=true,updated_at=clock_timestamp()+interval '2 seconds' where account_id='${owner}';`);
    const fresh=JSON.parse(service(`select public.kd_api_resolve_key_v1('${digest("a")}','${op(19)}',now());`));
    const revoked=JSON.parse(service(`select public.kd_api_revoke_access_v1('${op(20)}','${ownerIssue.accessId}',1,'OWNER_REQUEST');`));
    check("revoke increments epoch and invalidates live contexts",()=>{assert.equal(revoked.keyEpoch,2);const r=service(`select public.kd_api_read_personal_v1('${fresh.contextId}','kd:master',null,'{}');`,true);assert.notEqual(r.status,0);assert.match(r.stderr,/ACCESS_REVOKED/);const resolve=JSON.parse(service(`select public.kd_api_resolve_key_v1('${digest("a")}','${op(21)}',now());`));assert.equal(resolve.code,"ACCESS_REVOKED");});
    service(`update public.kd_account_access set active=false,updated_at=clock_timestamp()+interval '3 seconds' where account_id='${member}';`);
    check("account deactivation invalidates member context",()=>{const r=service(`select public.kd_api_read_personal_v1('${memberContext.contextId}','kd:master',null,'{}');`,true);assert.notEqual(r.status,0);assert.match(r.stderr,/ACCOUNT_INACTIVE/);});
    check("private schema stays outside anon/authenticated grants",()=>{assert.equal(scalar(`select count(*) from information_schema.role_table_grants where table_schema='private' and grantee in ('anon','authenticated')`),"0");assert.equal(scalar(`select count(*) from information_schema.routine_privileges where routine_schema='public' and routine_name like 'kd_api_%_v1' and grantee='authenticated'`),"0");});
    console.log(`KD_API_PG17: ${checks} checks passed`);
  } finally { if(running)run("pg_ctl",["--pgdata",data,"--mode","immediate","--wait","stop"],undefined,true);rmSync(root,{recursive:true,force:true}); }
});

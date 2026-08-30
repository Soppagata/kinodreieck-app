/* Disposable local PostgreSQL, real Radar migration chain, synthetic accounts.
   No credentials, remote connection, provider request or shared database. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { validateRadarPilotFeed } from "./src/lib/radarPilotContracts.js";
import { createLocalTextRadarTargetId } from "./src/lib/localEventRadar.js";
import { parseAnthropicRadarWebsearchResponse } from "./supabase/functions/radar-websearch-task/anthropicAdapter.js";
import { evaluateTextRadarWebsearchResponse } from "./supabase/functions/radar-websearch-task/contract.js";

const PG = "/Applications/Postgres.app/Contents/Versions/17/bin";
const root = mkdtempSync("/private/tmp/kd-text-pg-");
const data = join(root, "data");
const socket = join(root, "socket");
mkdirSync(socket);
let running = false;
let checks = 0;
function run(binary, args, input) {
  const result = spawnSync(join(PG,binary), args, {
    input, encoding:"utf8", timeout:60_000, maxBuffer:8_000_000,
    env:{ PATH:`${PG}:/usr/bin:/bin`, LANG:"C", LC_ALL:"C" },
  });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function sql(query) {
  return run("psql",["-h",socket,"-p","65449","-U","postgres","-d","postgres","-X","-qAt","-v","ON_ERROR_STOP=1","-f","-"],query);
}
const a = "a1000000-0000-4000-8000-000000000001";
const b = "a1000000-0000-4000-8000-000000000002";
const targetText = "Synthetische Sternenreihe";
const targetId = createLocalTextRadarTargetId(targetText);
const quote = (value) => `'${String(value).replaceAll("'","''")}'`;
const session = (id,query,role="authenticated") => sql(`begin; set local role ${role}; select set_config('request.jwt.claim.sub',${quote(id)},true); select set_config('request.jwt.claim.role',${quote(role)},true); ${query}; commit;`).split("\n").at(-1);
const ack = (status) => session(a,`select public.kd_radar_pilot_set_text_subscription(${quote(targetText)},${quote(status)},gen_random_uuid())`);
const feed = (id=a) => JSON.parse(session(id,"select public.kd_radar_pilot_feed('{}'::uuid[])"));
function check(name,fn) { fn(); checks++; console.log(`✓ ${name}`); }
try {
  run("initdb",["--no-locale","--encoding=UTF8","--auth=trust","--username=postgres","--pgdata",data]);
  run("pg_ctl",["--pgdata",data,"--log",join(root,"postgres.log"),"--options",`-c listen_addresses= -c unix_socket_directories=${socket} -p 65449 -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,"--wait","start"]);
  running = true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema auth,extensions to anon,authenticated,service_role;
  `);
  sql(readFileSync("supabase/current_schema.sql","utf8"));
  sql(`insert into public.kd_ai_limits(schluessel,wert) values
    ('task_modell','{}'),('task_max_tokens','{}'),('task_max_reservierung_usd_cent','{}');`);
  const selected = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql") && file >= "20260809180000" && (
      /radar|event_radar|private_pilot|private_export/.test(file)
    ));
  for (const file of selected) {
    if (file.startsWith("20260825120000")) sql("update public.kd_radar_settings set radar_aktiv=true,radar_provider_aktiv=true");
    try { sql(readFileSync(join("supabase/migrations",file),"utf8")); }
    catch (error) { throw new Error(`${file}: ${error.message}`); }
  }
  sql(`insert into auth.users(id) values ('${a}'),('${b}');
    insert into public.kd_account_access(account_id,role,active,personal_ai) values
      ('${a}','owner',true,true),('${b}','owner',true,true);
    insert into public.kd_radar_capabilities(account_id,radar_pilot,radar_review) values
      ('${a}',true,true),('${b}',true,true);`);
  const today = new Date().toISOString().slice(0,10);
  const checkedAt = new Date().toISOString();
  const request = {kind:"text",targetId,targetText,region:"AT",scopes:["series_start"]};
  const setup = {radarEnabled:true,radarProviderEnabled:true,radarSchedulerEnabled:false,providerAllowed:true,
    modelAlias:"klein",model:"claude-haiku-4-5",maxTokens:2400,taskCapUsdCent:20,searchFeeUsdCent:1,
    globalRequestCapUsdCent:500,timeoutMs:30_000,inputPriceUsdCentPerMtok:100,outputPriceUsdCentPerMtok:500,sourceRegistry:[]};
  const url = "https://press.example/start";
  const parsed = parseAnthropicRadarWebsearchResponse({model:setup.model,stop_reason:"end_turn",
    usage:{input_tokens:100,output_tokens:100,server_tool_use:{web_search_requests:1}},content:[
      {type:"server_tool_use",id:"tool1",name:"web_search",input:{}},
      {type:"web_search_tool_result",tool_use_id:"tool1",content:[{type:"web_search_result",url}]},
      {type:"text",text:JSON.stringify({status:"confirmed",candidates:[{
        title:"Synthetischer Morgen",eventType:"serienstart",eventDate:today,category:"special",platform:"Beispiel+",region:"global",
        evidence:[{url,sourceDomain:"www.press.example",publishedAt:"unknown"}],
      }]})},
    ]},request,setup,checkedAt);
  const evaluated = evaluateTextRadarWebsearchResponse(parsed.envelope,request,[]);
  assert.equal(evaluated.status,"confirmed");
  const candidate = evaluated.textResult.candidates[0];
  const payload = {
    targetKey:candidate.targetId, textTargetKey:targetId, targetText,
    workTitle:candidate.title,workTargetType:candidate.targetType,category:candidate.category,
    eventType:candidate.eventType,date:candidate.date,region:candidate.region,platform:candidate.platform,seasonNumber:null,
    checkedAt,evidence:candidate.evidence,
  };
  const persist = (id=a,value=payload) => JSON.parse(session(id,
    `select public.kd_radar_websearch_upsert_text_finding('${id}',gen_random_uuid(),${quote(JSON.stringify(value))}::jsonb)`,"service_role"));
  check("Ohne eigenes aktives Abo scheitert der Schreibpfad",() => assert.throws(() => persist(),/radar_websearch_forbidden/));
  check("Providerfreies Save legt nur ein Textziel an",() => {
    ack("active"); assert.equal(feed().subscriptions.length,1); assert.equal(feed().events.length,0);
  });
  let stored;
  check("URL-only-Beleg mit intern normalisierten Metadaten schreibt durch echten Feed und Browservalidator",() => {
    stored=persist(); assert.equal(stored.status,"confirmed");
    const value=feed(); assert.equal(validateRadarPilotFeed(value).ok,true,JSON.stringify(validateRadarPilotFeed(value).errors));
    assert.equal(value.events.length,1); assert.equal(value.events[0].title,payload.workTitle);
    assert.equal(value.events[0].platform,"Beispiel+"); assert.equal(value.events[0].category,"special");
    assert.equal(value.subscriptions.length,1); assert.equal(value.subscriptions[0].title,targetText);
  });
  check("Identischer Fund ist no_change mit stabiler Version",() => {
    const again=persist(); assert.equal(again.status,"no_change"); assert.equal(again.eventVersionId,stored.eventVersionId);
  });
  check("Fremdkonto kann weder fremde Funde lesen noch schreiben",() => {
    assert.equal(feed(b).events.length,0);
    assert.equal(session(b,"select count(*) from public.kd_radar_text_findings"),"0");
    assert.throws(() => persist(b),/radar_websearch_forbidden/);
  });
  check("Browser besitzt weder direkten Write noch Service-RPC-Recht",() => {
    assert.throws(() => session(a,"delete from public.kd_radar_text_findings"),/permission denied/);
    assert.throws(() => session(a,`select public.kd_radar_websearch_upsert_text_finding('${a}',gen_random_uuid(),'{}')`),/permission denied/);
  });
  check("Export enthält nur eigene Funde",() => {
    assert.equal(JSON.parse(session(a,`select public.kd_private_own_data('${a}')`,"service_role")).radar.textFindings.length,1);
    assert.equal(JSON.parse(session(b,`select public.kd_private_own_data('${b}')`,"service_role")).radar.textFindings.length,0);
  });
  check("Ungültiger Fund blockiert späteren validen Geschwisterwrite nicht",() => {
    assert.throws(() => persist(a,{...payload,date:"2026-02-30"}),/date\/time|range/);
    assert.equal(persist(a,{...payload,targetKey:"release:v1:1122334455667788",workTitle:"Zweiter Fund",platform:"-"}).status,"confirmed");
    assert.equal(feed().events.length,2);
  });
  check("Pause versteckt Funde und Check reaktiviert nichts",() => {
    ack("paused"); assert.equal(feed().events.length,0); assert.throws(() => persist(),/radar_websearch_forbidden/);
    assert.equal(feed().subscriptions[0].status,"paused");
  });
  check("Capabilityentzug stoppt vor Context und Write",() => {
    ack("active"); sql(`update public.kd_radar_capabilities set radar_review=false where account_id='${a}'`);
    assert.throws(() => persist(),/radar_websearch_forbidden/);
    sql(`update public.kd_radar_capabilities set radar_review=true where account_id='${a}'`);
  });
  check("Bestehender Scheduler claimt nur autorisierte Ziele und verbraucht Fehler retryfrei für 144h",() => {
    sql(`update public.kd_radar_settings set radar_scheduler_aktiv=true;
      update public.kd_private_settings set provider_requests_enabled=true;
      update public.kd_private_provider_registry set feature_enabled=true,rights_confirmed=true,
        dpa_transfer_confirmed=true,retention_confirmed=true,price_budget_confirmed=true,
        legal_status='APPROVED',reviewed_at=current_date where provider_id='anthropic';
      update public.kd_radar_capabilities set radar_review=false where account_id='${a}';`);
    const claim=() => JSON.parse(session(a,"select public.kd_radar_daily_claim()","service_role"));
    assert.equal(claim().claim,false);
    sql(`update public.kd_radar_capabilities set radar_review=true where account_id='${a}'`);
    const claimed=claim(); assert.equal(claimed.claim,true); assert.equal(claimed.targetId,targetId);
    const finish=JSON.parse(session(a,`select public.kd_radar_daily_finish('${a}',${quote(claimed.targetRowId)},${quote(claimed.viennaDay)},${quote(claimed.fenceToken)},'storage_error')`,"service_role"));
    assert.equal(finish.ok,true); assert.equal(claim().claim,false);
    const hours=Number(sql(`select extract(epoch from (s.next_check_at-r.terminal_at))/3600
      from public.kd_radar_subscriptions s join public.kd_radar_daily_runs r using(account_id,target_id)
      where s.account_id='${a}'`));
    assert.equal(hours,144);
    session(a,"select public.kd_radar_pilot_set_text_subscription('Zweites unabhängiges Ziel','active',gen_random_uuid())");
    const second=claim(); assert.equal(second.claim,true); assert.notEqual(second.targetId,targetId);
    session(a,"select public.kd_radar_pilot_set_text_subscription('Zweites unabhängiges Ziel','removed',gen_random_uuid())");
  });
  check("Entfernen kaskadiert eigene Funde ohne neue Werkabos",() => {
    ack("removed"); assert.equal(sql(`select count(*) from public.kd_radar_text_findings where account_id='${a}'`),"0");
    assert.equal(feed().subscriptions.length,0);
  });
  check("Accountlöschung kaskadiert den gesamten neuen Pfad",() => {
    ack("active"); persist(); sql(`delete from auth.users where id='${a}'`);
    assert.equal(sql(`select count(*) from public.kd_radar_text_findings where account_id='${a}'`),"0");
  });
  console.log(`RADAR_TEXT_PG17: ${checks}/${checks} real migration/write/feed/RLS/export/delete checks passed`);
} finally {
  if (running) run("pg_ctl",["--pgdata",data,"--wait","stop"]);
  rmSync(root,{recursive:true,force:true});
}

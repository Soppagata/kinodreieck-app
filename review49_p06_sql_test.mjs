/* Real PostgreSQL; fresh synthetic cluster, Unix socket only, no remote IO. */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8', timeout: 5000 });
const candidates = [
  process.env.KD_TEST_PG_BIN,
  process.env.PG17_BIN,
  pgConfig.status === 0 ? pgConfig.stdout.trim() : null,
  '/Applications/Postgres.app/Contents/Versions/17/bin',
  '/usr/lib/postgresql/17/bin',
  '/usr/lib/postgresql/16/bin',
].filter(Boolean);
const required = ['initdb', 'pg_ctl', 'postgres', 'psql'];
const bin = [...new Set(candidates)].find(directory => required.every(binary => existsSync(join(directory, binary))));
assert.ok(bin, `PostgreSQL server binaries are required (${required.join(', ')}); set KD_TEST_PG_BIN`);
console.log(`PostgreSQL binaries: ${bin}`);
const root = mkdtempSync(join(tmpdir(), 'kd-p06-pg-'));
const data = join(root, 'data');
let started = false, checks = 0;
function run(exe, args, input) {
  const result = spawnSync(join(bin, exe), args, { input, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(`${exe}: ${result.error || result.stderr || result.stdout}`);
  return result.stdout.trim();
}
const sql = text => run('psql', ['-X', '-qAt', '-h', root, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], text);
const file = name => readFileSync(new URL(`./supabase/migrations/${name}`, import.meta.url), 'utf8');
const func = (source, name) => source.slice(source.indexOf(`create or replace function public.${name}(`)).split('\n$$;')[0] + '\n$$;';
const check = (name, query, expected) => { assert.equal(sql(query), expected, name); checks++; console.log(`PASS ${name}`); };
try {
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust', '--username=postgres']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'server.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${root}'`, '-w', 'start']); started = true;
  sql(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function public.kd_account_active() returns boolean language sql stable as $$ select coalesce(current_setting('test.active', true), 'true') <> 'false' $$;
    grant usage on schema auth to authenticated, service_role;
    create table public.kd_ai_limits (schluessel text, wert jsonb);
    insert into public.kd_ai_limits values ('timeout_ms', '30000');`);
  sql(file('20260729220000_etappe8_filmwissen_cache.sql'));
  sql(file('20260730110000_etappe8_filmwissen_synthese_sicherung.sql'));
  sql(func(file('20260730140000_etappe8_filmwissen_adapter_sperren.sql'), 'kd_filmwissen_verwaiste_schliessen'));
  sql(`insert into public.kd_filmwerke(id,typ,titel,jahr,identitaetsstatus) values
    ('11111111-1111-4111-8111-111111111111','film','Fixture Movie',2000,'geprueft'),
    ('22222222-2222-4222-8222-222222222222','serie','Legacy Series',2000,'geprueft');
    insert into public.kd_filmwerk_kennungen(namespace,kennung,werk_id,status,geprueft_at) values
    ('tmdb','348','11111111-1111-4111-8111-111111111111','geprueft',now()),
    ('imdb','tt1234567','11111111-1111-4111-8111-111111111111','geprueft',now()),
    ('tmdb','99','22222222-2222-4222-8222-222222222222','geprueft',now());`);
  sql(file('20260917110000_review_filmwissen_identity.sql'));
  check('legacy movie migrated without losing verification', `select kennung||'/'||status from kd_filmwerk_kennungen where namespace='tmdb' and werk_id='11111111-1111-4111-8111-111111111111';`, 'movie:348/geprueft');
  check('legacy series quarantined until explicit typed verification', `select kennung||'/'||status||'/'||(geprueft_at is null)::text from kd_filmwerk_kennungen where namespace='tmdb' and werk_id='22222222-2222-4222-8222-222222222222';`, 'tv:99/gesperrt/true');
  check('untyped input never normalizes', `select kd_filmwissen_kennung_norm('tmdb','348') is null;`, 't');
  sql(`select kd_filmwissen_werk_sicherstellen('serie','Fixture Series',null,2000,'{"tmdb":"tv:348","imdb":"tt2345678"}');
    select kd_filmwissen_werk_pruefen(id,'{"tmdb":"tv:348","imdb":"tt2345678"}') from kd_filmwerke where titel='Fixture Series';
    insert into kd_filmwissen_quellen(slug,domain,betreiber,status,cache_erlaubt,paraphrase_erlaubt,anzeige_erlaubt) values ('fixture','example.test','Fixture','freigegeben',true,true,true);
    insert into kd_filmwissen_versionen(werk_id,version_nr,schema_version,rubrik_version,pipeline_version,warum,sicherheit,kurztext,paket_sha256)
      select id,1,'v1','v1','v1',4,'hoch','Fixture evidence',repeat('a',64) from kd_filmwerke;
    insert into kd_filmwissen_belege(version_id,quelle_slug,url,seitentitel,abgerufen_at,attribution_snapshot,kernaussagen,abruf_sha256)
      select id,'fixture','https://example.test/fixture','Fixture',now(),'Fixture','["Fixture evidence"]',repeat('b',64) from kd_filmwissen_versionen;
    update kd_filmwerke w set aktuelle_version_id=v.id from kd_filmwissen_versionen v where v.werk_id=w.id;`);
  const auth = `set role authenticated; set test.uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';`;
  for (const [key, type] of [['movie:348', 'film'], ['tv:348', 'serie']]) {
    check(`${key} selects its own cache work`, `${auth} select kd_filmwissen_aktuell_lesen('tmdb','${key}')#>>'{werk,typ}';`, type);
    const expectedId = sql(`select id from kd_filmwerke where titel='${type === 'film' ? 'Fixture Movie' : 'Fixture Series'}';`);
    check(`${key} service synthesis resolves same typed identity`, `set role service_role; select x.status||'/'||x."werkId"::text from jsonb_to_record(kd_filmwissen_synthese_vorbereiten('tmdb','${key}',gen_random_uuid())) as x(status text,"werkId" uuid);`, 'cache_hit/' + expectedId);
  }
  check('IMDb cache unaffected', `${auth} select kd_filmwissen_aktuell_lesen('imdb','tt1234567')#>>'{werk,typ}';`, 'film');
  check('legacy series remains cache miss', `${auth} select kd_filmwissen_aktuell_lesen('tmdb','tv:99')->>'status';`, 'cache_miss');
  check('unknown television key never reads movie', `${auth} select kd_filmwissen_aktuell_lesen('tmdb','tv:555')->>'status';`, 'cache_miss');
  check('RPC and table ACLs retained', `select has_function_privilege('authenticated','kd_filmwissen_aktuell_lesen(text,text)','execute') and not has_function_privilege('anon','kd_filmwissen_aktuell_lesen(text,text)','execute') and not has_function_privilege('authenticated','kd_filmwissen_synthese_vorbereiten(text,text,uuid)','execute') and has_function_privilege('service_role','kd_filmwissen_synthese_vorbereiten(text,text,uuid)','execute') and not has_table_privilege('authenticated','kd_filmwerk_kennungen','select');`, 't');
  check('untyped legacy read terminates without evidence', `${auth} select kd_filmwissen_aktuell_lesen('tmdb','348')->>'status';`, 'gesperrt');
  const rejects = [
    ['untyped synthesis', `set role service_role; select kd_filmwissen_synthese_vorbereiten('tmdb','348',gen_random_uuid());`, 'kennung_ungueltig'],
    ['wrong typed key for movie', `select kd_filmwissen_werk_sicherstellen('film','Wrong',null,2000,'{"tmdb":"tv:348"}');`, 'tmdb_werktyp_widerspruch'],
    ['direct mismatched key write', `insert into kd_filmwerk_kennungen(namespace,kennung,werk_id) values ('tmdb','tv:555','11111111-1111-4111-8111-111111111111');`, 'tmdb_werktyp_widerspruch'],
    ['direct work type change', `update kd_filmwerke set typ='serie' where id='11111111-1111-4111-8111-111111111111';`, 'tmdb_werktyp_widerspruch'],
    ['inactive account', `${auth} set test.active='false'; select kd_filmwissen_aktuell_lesen('tmdb','movie:348');`, 'account_inactive'],
    ['no auth UID', `set role authenticated; select kd_filmwissen_aktuell_lesen('tmdb','movie:348');`, 'anmeldung_noetig'],
    ['anon cannot read', `set role anon; select kd_filmwissen_aktuell_lesen('tmdb','movie:348');`, 'permission denied'],
  ];
  for (const [name, query, message] of rejects) { assert.throws(() => sql(query), e => e.message.includes(message), name); checks++; console.log(`PASS ${name}`); }
  console.log(`${checks}/${checks} real PostgreSQL identity checks passed`);
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(root, { recursive: true, force: true });
}

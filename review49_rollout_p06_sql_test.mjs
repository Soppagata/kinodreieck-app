/* Real PostgreSQL; fresh synthetic cluster, Unix socket only, no remote IO. */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
// The old helper and service below are unchanged baseline source bodies.
// Only relative module imports are pointed at their existing local dependencies.
const baseline = '14804ce389d69114feed27b92fb11ac78423cc0e';
const oldSource = path => {
  const r = spawnSync('git', ['show', `${baseline}:${path}`], { encoding: 'utf8' });
  assert.equal(r.status, 0); return r.stdout;
};
const oldHelperPath = join(root, 'legacy-filmwissen.mjs');
writeFileSync(oldHelperPath, oldSource('src/lib/filmwissen.js'));
const oldServicePath = join(root, 'legacy-service.mjs');
writeFileSync(oldServicePath, oldSource('src/services/filmwissen.js').replace(/from "(\.[^"]+)"/g, (_, path) => {
  const url = path === '../lib/filmwissen.js' ? `file://${oldHelperPath}` : new URL(path, new URL('./src/services/filmwissen.js', import.meta.url)).href;
  return `from "${url}"`;
}));
const oldClient = await import(`file://${oldHelperPath}`);
const { createFilmwissenService: oldService } = await import(`file://${oldServicePath}`);
const { createFilmwissenService: newService } = await import('./src/services/filmwissen.js');
const authSql = `set role authenticated; set test.uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';`;
const snapshot = { mode: 'account', state: 'ready', account: { id: 'fixture-account' }, capabilities: { remoteStorage: true, personalAi: true } };
const auth = { getSnapshot: () => snapshot, requireAccount: () => snapshot };
const movie = { typ: 'film', titel: 'Fixture Movie', jahr: 2000, tmdb_id: '348' };
const series = { ...movie, typ: 'serie', titel: 'Fixture Series' };
function service(factory) {
  let ai = 0, reads = 0;
  return { service: factory({ auth, transport: async ({ namespace, kennung }) => {
    assert.match(namespace, /^[a-z_]+$/); assert.match(kennung, /^[a-z0-9:]+$/);
    reads++;
    return { ok: true, data: JSON.parse(sql(`${authSql} select kd_filmwissen_aktuell_lesen('${namespace}','${kennung}');`)) };
  }, ai: { runTask: async () => { ai++; throw Error('unexpected research'); } } }), counts: () => ({ ai, reads }) };
}
const seedReports = () => sql(`
  insert into kd_filmwissen_quellen(slug,domain,betreiber,status,cache_erlaubt,paraphrase_erlaubt,anzeige_erlaubt)
    values ('fixture','example.test','Fixture','freigegeben',true,true,true) on conflict do nothing;
  insert into kd_filmwissen_versionen(werk_id,version_nr,schema_version,rubrik_version,pipeline_version,warum,sicherheit,kurztext,paket_sha256)
    select w.id,1,'v1','v1','v1',4,'hoch','Fixture evidence',repeat('a',64) from kd_filmwerke w
    where not exists(select 1 from kd_filmwissen_versionen v where v.werk_id=w.id);
  insert into kd_filmwissen_belege(version_id,quelle_slug,url,seitentitel,abgerufen_at,attribution_snapshot,kernaussagen,abruf_sha256)
    select v.id,'fixture','https://example.test/fixture','Fixture',now(),'Fixture','["Fixture evidence"]',repeat('b',64)
    from kd_filmwissen_versionen v where not exists(select 1 from kd_filmwissen_belege b where b.version_id=v.id);
  update kd_filmwerke w set aktuelle_version_id=v.id from kd_filmwissen_versionen v where v.werk_id=w.id;`);
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
  sql(func(file('20260809121000_rollen_v1_access_enforcement.sql'), 'kd_filmwissen_aktuell_lesen'));
  sql(`insert into public.kd_filmwerke(id,typ,titel,jahr,identitaetsstatus) values
    ('11111111-1111-4111-8111-111111111111','film','Fixture Movie',2000,'geprueft'),
    ('22222222-2222-4222-8222-222222222222','serie','Legacy Series',2000,'geprueft');
    insert into public.kd_filmwerk_kennungen(namespace,kennung,werk_id,status,geprueft_at) values
    ('tmdb','348','11111111-1111-4111-8111-111111111111','geprueft',now()),
    ('imdb','tt1234567','11111111-1111-4111-8111-111111111111','geprueft',now()),
    ('tmdb','99','22222222-2222-4222-8222-222222222222','geprueft',now());`);
  seedReports();
  assert.deepEqual(oldClient.filmwissenKennungen(movie), oldClient.filmwissenKennungen(series)); checks++;
  const oldBefore = service(oldService);
  assert.equal((await oldBefore.service.read(movie)).werk.typ, 'film'); checks++;
  assert.equal((await oldBefore.service.read(series)).werk.typ, 'film'); checks++;
  check('old SQL rejects typed request (known old-server limit)', `select kd_filmwissen_kennung_norm('tmdb','tv:348') is null;`, 't');
  await assert.rejects(() => service(newService).service.read(series)); checks++;
  console.log('PASS actual baseline helper/service reproduces byte-identical requests and wrong film read');
  sql(file('20260917110000_review_filmwissen_identity.sql'));
  check('legacy movie migrated and remains verified', `select kennung||'/'||status from kd_filmwerk_kennungen where namespace='tmdb' and werk_id='11111111-1111-4111-8111-111111111111';`, 'movie:348/geprueft');
  check('legacy series quarantined', `select kennung||'/'||status from kd_filmwerk_kennungen where namespace='tmdb' and werk_id='22222222-2222-4222-8222-222222222222';`, 'tv:99/gesperrt');
  sql(`select kd_filmwissen_werk_sicherstellen('serie','Fixture Series',null,2000,'{"tmdb":"tv:348","imdb":"tt2345678"}');
    select kd_filmwissen_werk_pruefen(id,'{"tmdb":"tv:348","imdb":"tt2345678"}') from kd_filmwerke where titel='Fixture Series';`);
  seedReports();
  for (const [name, factory] of [['old', oldService], ['new', newService]]) for (const entry of [movie, series]) {
    for (const imdbMiss of [false, true]) {
      const s = service(factory);
      const target = imdbMiss ? { ...entry, imdb_id: 'tt9999999' } : entry;
      const result = await s.service.recherchiere(target);
      assert.equal(result.status, name === 'old' ? 'gesperrt' : 'belegt');
      if (name === 'new') assert.equal(result.werk.typ, entry.typ);
      assert.equal(s.counts().ai, 0); assert.equal(s.counts().reads, imdbMiss ? 2 : 1);
      checks++; console.log(`PASS ${name} service / new SQL / ${entry.typ} / IMDb miss=${imdbMiss}: no research`);
      s.service.dispose();
    }
  }
  for (const factory of [oldService, newService]) {
    const s = service(factory);
    assert.equal((await s.service.recherchiere({ ...movie, imdb_id: 'tt1234567' })).status, 'belegt');
    assert.equal((await s.service.recherchiere({ ...series, imdb_id: 'tt2345678' })).werk.typ, 'serie');
    assert.equal(s.counts().ai, 0); checks++; s.service.dispose();
  }
  for (const reader of ['kd_filmwissen_aktuell_lesen']) {
    for (const [key, typ] of [['movie:348','film'], ['tv:348','serie']]) {
      check(`${reader} ${key} exact work`, `${authSql} select ${reader}('tmdb','${key}')#>>'{werk,typ}';`, typ);
    }
    check(`${reader} no table grant`, `select has_function_privilege('authenticated','${reader}(text,text)','execute') and not has_function_privilege('anon','${reader}(text,text)','execute') and not has_table_privilege('authenticated','kd_filmwerk_kennungen','select');`, 't');
    for (const [prefix, error] of [[`set role authenticated;`, 'anmeldung_noetig'], [`${authSql} set test.active='false';`, 'account_inactive'], ['set role anon;', 'permission denied']]) {
      for (const key of ['348','movie:348']) {
        assert.throws(() => sql(`${prefix} select ${reader}('tmdb','${key}');`), e => e.message.includes(error)); checks++;
      }
    }
  }
  check('normalizer stays strict', `select kd_filmwissen_kennung_norm('tmdb','348') is null;`, 't');
  check('leading zeros still terminal', `${authSql} select kd_filmwissen_aktuell_lesen('tmdb','00348')->>'status';`, 'gesperrt');
  for (const query of [
    `${authSql} select kd_filmwissen_aktuell_lesen('tmdb','0');`,
    `set role service_role; select kd_filmwissen_synthese_vorbereiten('tmdb','348',gen_random_uuid());`,
  ]) { assert.throws(() => sql(query), e => e.message.includes('kennung_ungueltig')); checks++; }
  check('write ACL remains service only', `select not has_function_privilege('authenticated','kd_filmwissen_synthese_vorbereiten(text,text,uuid)','execute') and has_function_privilege('service_role','kd_filmwissen_synthese_vorbereiten(text,text,uuid)','execute');`, 't');
  check('no work or version changed by reads', `select (select count(*) from kd_filmwerke)||'/'||(select count(*) from kd_filmwissen_versionen)||'/'||(select count(*) from kd_filmwissen_auftraege);`, '3/3/0');
  console.log(`${checks}/${checks} SQL/actual client checks passed; local synthetic cluster only`);
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(root, { recursive: true, force: true });
}

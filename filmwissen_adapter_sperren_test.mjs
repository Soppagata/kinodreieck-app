import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("./supabase/migrations/20260730140000_etappe8_filmwissen_adapter_sperren.sql", import.meta.url),
  "utf8",
);
let ok = 0;
const fehler = [];
function check(name, fn) {
  try {
    if (!fn()) throw new Error("falsch");
    ok++;
    console.log("✓ " + name);
  } catch (error) {
    fehler.push(name);
    console.error("✗ " + name + ": " + error.message);
  }
}

check("A1 Quellen bleiben Kandidaten und alle Rechte bleiben aus", () =>
  (sql.match(/'kandidat',\s*false,false,false,false,false,false/gi) || []).length === 2
  && !/update public\.kd_filmwissen_quellen[\s\S]{0,300}set[\s\S]{0,120}status\s*=\s*'freigegeben'/i.test(sql));
check("A2 Adapter haben feste Schluessel, Domains, Urspruenge und Limits", () =>
  /'wikidata','www\.wikidata\.org'[\s\S]+'wikidata-action-v1',60,'wikidata-community'/i.test(sql)
  && /'loc-nfr','www\.loc\.gov'[\s\S]+'loc-nfr-listing-v1',10,'loc-national-film-registry'/i.test(sql)
  && /unique index[\s\S]+adapter_key/i.test(sql));
check("A3 quellenweites Rate-Limit ist atomar und Browserrollen sind gesperrt", () =>
  /pg_advisory_xact_lock\(hashtextextended\('filmwissen-abruf:'/i.test(sql)
  && /on conflict \(quelle_slug,fenster\) do update/i.test(sql)
  && /revoke all on table public\.kd_filmwissen_quellen_abrufe[\s\S]+from public, anon, authenticated/i.test(sql));
check("A4 Reaper wartet mindestens doppelten Timeout und nullt keine Kosten", () => {
  const reaper = sql.match(/create or replace function public\.kd_filmwissen_verwaiste_schliessen\(\)[\s\S]+?end\n\$\$;/i)?.[0] ?? "";
  return /greatest\(120, ceil\(v_timeout_ms \* 2\.0/i.test(reaper)
    && /fehlerklasse = 'abgebrochen-ohne-abschluss'/i.test(reaper)
    && !/kosten_usd_cent\s*=/i.test(reaper);
});
check("A5 Vorbereitung bereinigt vor der laufenden Dublettenpruefung", () => {
  const prepare = sql.match(/create or replace function public\.kd_filmwissen_synthese_vorbereiten[\s\S]+?end\n\$\$;/i)?.[0] ?? "";
  return prepare.indexOf("kd_filmwissen_verwaiste_schliessen")
    < prepare.indexOf("status in ('bereit','laufend')")
    && !/insert into public\.kd_filmwissen_auftraege/i.test(prepare);
});
check("A6 Herkunft wird DB-seitig gesetzt und bei Publikation doppelt geprueft", () =>
  /before insert on public\.kd_filmwissen_belege/i.test(sql)
  && /count\(distinct q\.domain\), count\(distinct q\.ursprung\)/i.test(sql)
  && /v_domains < 2 or v_urspruenge < 2/i.test(sql));
check("A7 Filmwissen hat 5-Cent-Cap, gross und 2048 Tokens", () =>
  /'\{"filmwissen-synthese":5\}'::jsonb/i.test(sql)
  && /\{filmwissen-synthese\}','"gross"'/i.test(sql)
  && /\{filmwissen-synthese\}','2048'/i.test(sql));
check("A8 Start-RPC stoppt fehlenden, formfremden oder ueberschrittenen Task-Cap", () => {
  const start = sql.match(/create or replace function public\.kd_ai_auftrag_starten\([\s\S]+?end\n\$\$;/i)?.[0] ?? "";
  return /jsonb_typeof\(v_cap\) is distinct from 'number'/i.test(start)
    && /p_reservierung::text !~ '\^\[0-9\]/i.test(start)
    && /p_reservierung > \(v_cap #>> '\{\}'\)::numeric/i.test(start)
    && /task-kostenlimit-ueberschritten/i.test(start);
});
check("A9 Publikation prueft auch Istkosten erneut gegen denselben Cap", () => {
  const publish = sql.match(/create or replace function public\.kd_filmwissen_veroeffentlichen\([\s\S]+?end\n\$\$;/i)?.[0] ?? "";
  return /v_kosten > \(v_cap #>> '\{\}'\)::numeric/i.test(publish)
    && /filmwissen_kostenlimit/i.test(publish);
});
check("A10 neue Steuer-RPCs sind nur service-only", () =>
  (sql.match(/revoke all on function public\.kd_filmwissen_(?:quelle_abruf_reservieren|verwaiste_schliessen|synthese_vorbereiten|veroeffentlichen)[\s\S]+?from public, anon, authenticated;/gi) || []).length === 4
  && (sql.match(/grant execute on function public\.kd_filmwissen_(?:quelle_abruf_reservieren|verwaiste_schliessen|synthese_vorbereiten|veroeffentlichen)[\s\S]+?to service_role;/gi) || []).length === 4);

console.log(`\n${ok}/${ok + fehler.length} Filmwissen-Adaptersperren-Checks bestanden.`);
if (fehler.length) process.exit(1);

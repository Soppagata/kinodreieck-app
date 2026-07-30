import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("./supabase/migrations/20260730180000_etappe8_filmwissen_belegklassen.sql", import.meta.url),
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

check("K1 genau drei geschlossene Belegklassen", () =>
  /belegklasse in \('strukturiert','institutionell','redaktionell'\)/i.test(sql));
check("K2 unbekannte Altquellen werden konservativ strukturiert", () =>
  /else 'strukturiert'/i.test(sql)
  && /where belegklasse is null/i.test(sql));
check("K3 Wikidata ist strukturell und LOC institutionell", () =>
  /when 'wikidata' then 'strukturiert'/i.test(sql)
  && /when 'loc-nfr' then 'institutionell'/i.test(sql));
check("K4 Trigger friert Ursprung und Belegklasse serverseitig ein", () =>
  /select q\.ursprung, q\.belegklasse[\s\S]+into new\.ursprung, new\.belegklasse/i.test(sql)
  && /q\.status = 'freigegeben'/i.test(sql));
check("K5 eine institutionelle Einordnung erfuellt die Mindestbelegung", () => {
  const publish = sql.match(/create or replace function public\.kd_filmwissen_veroeffentlichen[\s\S]+?end\n\$\$;/i)?.[0] ?? "";
  return /v_institutionell < 1\s+and/i.test(publish);
});
check("K6 sonst braucht es zwei verantwortete Domains und Urspruenge", () =>
  /v_verantwortete < 2/i.test(sql)
  && /v_verantwortete_domains < 2/i.test(sql)
  && /v_verantwortete_urspruenge < 2/i.test(sql));
check("K7 Strukturquellen zaehlen nicht als verantwortete Einordnung", () =>
  (sql.match(/where q\.belegklasse in \('institutionell','redaktionell'\)/gi) || []).length === 3);
check("K8 Kostenlimit und interner Publikationskern bleiben erhalten", () =>
  /v_kosten > \(v_cap #>> '\{\}'\)::numeric/i.test(sql)
  && /kd_filmwissen_veroeffentlichen_ohne_ursprungspruefung/i.test(sql));
check("K9 Migration aktiviert keine Quelle", () =>
  !/set status\s*=\s*'freigegeben'/i.test(sql)
  && !/insert into public\.kd_filmwissen_quellen/i.test(sql));
check("K10 Browser kann weder Trigger noch Publikations-RPC ausfuehren", () =>
  /revoke all on function public\.kd_filmwissen_beleg_ursprung_setzen\(\)[\s\S]+from public, anon, authenticated, service_role/i.test(sql)
  && /revoke all on function public\.kd_filmwissen_veroeffentlichen\(uuid,jsonb,jsonb\)[\s\S]+from public, anon, authenticated/i.test(sql));

console.log(`\n${ok}/${ok + fehler.length} Filmwissen-Belegklassen-Checks bestanden.`);
if (fehler.length) process.exit(1);

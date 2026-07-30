import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("./supabase/migrations/20260730160000_etappe8_filmwissen_atomarer_abschluss.sql", import.meta.url),
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
const erfolg = sql.match(/create or replace function public\.kd_filmwissen_synthese_abschliessen[\s\S]+?end\n\$\$;/i)?.[0] ?? "";
const fehlschlag = sql.match(/create or replace function public\.kd_filmwissen_synthese_fehlgeschlagen[\s\S]+?end\n\$\$;/i)?.[0] ?? "";

check("T1 Erfolg und Fehler haben je eine eigene Security-Definer-RPC", () =>
  /security definer/i.test(erfolg) && /security definer/i.test(fehlschlag));
check("T2 beide Wege koppeln Auftrag und KI-Log ueber dieselbe Vorgangs-ID", () =>
  [erfolg, fehlschlag].every((teil) =>
    /vorgang_id = v_vorgang/i.test(teil)
    && /task = 'filmwissen-synthese'/i.test(teil)
    && /status = 'laufend'/i.test(teil)));
check("T3 Erfolg publiziert vor dem exakten KI-Abschluss in derselben Funktion", () =>
  erfolg.indexOf("kd_filmwissen_veroeffentlichen")
    < erfolg.indexOf("update public.kd_ai_log")
  && /if not found then[\s\S]+filmwissen_ai_log_abschluss_kollision/i.test(erfolg));
check("T4 Erfolg speichert Modell, Tokens und Istkosten ohne best effort", () =>
  /modell = p_modell/i.test(erfolg)
  && /input_tokens = p_input_tokens/i.test(erfolg)
  && /output_tokens = p_output_tokens/i.test(erfolg)
  && /kosten_usd_cent = p_kosten/i.test(erfolg)
  && !/exception when|catch/i.test(erfolg));
check("T5 Fehler schliesst Filmwissen und KI-Log gemeinsam", () =>
  /kd_filmwissen_auftrag_fehlgeschlagen/i.test(fehlschlag)
  && /set status = 'fehler'/i.test(fehlschlag)
  && /if not found then[\s\S]+filmwissen_ai_log_abschluss_kollision/i.test(fehlschlag));
check("T6 unbekannte Fehlerkosten werden nicht zu null", () =>
  /kosten_usd_cent = coalesce\(p_kosten,kosten_usd_cent\)/i.test(fehlschlag)
  && /kd_filmwissen_auftrag_fehlgeschlagen\(\s*p_auftrag,p_kosten/i.test(fehlschlag));
check("T7 Erfolg akzeptiert keine negativen, NaN- oder unendlichen Kosten", () =>
  /p_kosten is null/i.test(erfolg)
  && /p_kosten::text !~ '\^\[0-9\]/i.test(erfolg)
  && /kostenUsdCent'\)::numeric is distinct from p_kosten/i.test(erfolg)
  && /p_version->>'modell' is distinct from p_modell/i.test(erfolg));
check("T8 Browserrollen haben auf beide RPCs kein Ausfuehrungsrecht", () =>
  (sql.match(/revoke all on function public\.kd_filmwissen_synthese_(?:abschliessen|fehlgeschlagen)\([\s\S]+?\) from public, anon, authenticated;/gi) || []).length === 2
  && (sql.match(/grant execute on function public\.kd_filmwissen_synthese_(?:abschliessen|fehlgeschlagen)\([\s\S]+?\) to service_role;/gi) || []).length === 2);
check("T9 die Migration aktiviert weder Quellen noch Provider", () =>
  !/update public\.kd_filmwissen_quellen/i.test(sql)
  && !/insert into public\.kd_filmwissen_quellen/i.test(sql)
  && !/http|fetch|anbieter/i.test(sql.replace(/^--.*$/gm, "")));

console.log(`\n${ok}/${ok + fehler.length} atomare Filmwissen-Abschlusschecks bestanden.`);
if (fehler.length) process.exit(1);

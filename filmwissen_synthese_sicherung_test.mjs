/* Statischer Vertrag fuer die Phase-D-Sicherung. Der echte PostgreSQL-Lauf
   folgt vor dem Deployment; diese Checks verhindern Aufweichungen in CI. */
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("./supabase/migrations/20260730110000_etappe8_filmwissen_synthese_sicherung.sql", import.meta.url),
  "utf8",
);
let ok = 0;
const fehler = [];
function check(name, fn) {
  try {
    if (!fn()) throw new Error("falsch");
    ok++;
    console.log("✓ " + name);
  } catch (e) {
    fehler.push(name);
    console.error("✗ " + name + ": " + e.message);
  }
}

check("S1 Vorbereitung und Fehlerabschluss sind Security-Definer-RPCs", () =>
  /kd_filmwissen_synthese_vorbereiten[\s\S]+security definer/i.test(sql)
  && /kd_filmwissen_auftrag_fehlgeschlagen[\s\S]+security definer/i.test(sql));
check("S2 beide RPCs bleiben fuer Browserrollen gesperrt", () =>
  (sql.match(/revoke all on function public\.kd_filmwissen_[^(]+\([^;]+from public, anon, authenticated;/gi) || []).length === 2
  && (sql.match(/grant execute on function public\.kd_filmwissen_[^(]+\([^;]+to service_role;/gi) || []).length === 2);
check("S3 ohne Adapter entsteht niemals der Zustand bereit", () =>
  /return jsonb_build_object\('status','quellen_nicht_verfuegbar'/i.test(sql)
  && !/return jsonb_build_object\('status','bereit'/i.test(sql)
  && !/insert into public\.kd_filmwissen_auftraege/i.test(sql));
check("S4 Cache-Treffer prueft Rechte, Ablauf und Domain erneut", () =>
  /q\.status <> 'freigegeben'[\s\S]+not q\.cache_erlaubt[\s\S]+not q\.paraphrase_erlaubt[\s\S]+not q\.anzeige_erlaubt/i.test(sql)
  && /q\.gueltig_bis < current_date/i.test(sql)
  && /substring\(b\.url from '\^https:\/\//i.test(sql));
check("S5 Browser liefert nur eine normalisierte starke Kennung", () =>
  /kd_filmwissen_kennung_norm\(v_namespace, p_kennung\)/i.test(sql)
  && !/\bp_werk\b|\bp_quellen\b|\bp_fundstellen\b|\bp_url\b/i.test(sql));
check("S6 Fehlerabschluss loest den aktiven Unique-Slot", () =>
  /set status = 'fehler'/i.test(sql)
  && /where id = p_auftrag[\s\S]+status in \('bereit','laufend'\)/i.test(sql)
  && /abgeschlossen_at = now\(\)/i.test(sql));
check("S7 Fehlerklasse und Kosten werden eng geprueft", () =>
  /p_kosten is not null and p_kosten < 0/i.test(sql)
  && /p_fehlerklasse !~ '\^\[a-z\]/i.test(sql));
check("S8 Migration aktiviert weiterhin keine Quelle", () =>
  !/insert into public\.kd_filmwissen_quellen/i.test(sql)
  && !/update public\.kd_filmwissen_quellen[\s\S]+status\s*=\s*'freigegeben'/i.test(sql));

console.log(`\n${ok}/${ok + fehler.length} Filmwissen-Synthese-Sicherungschecks bestanden.`);
if (fehler.length) process.exit(1);

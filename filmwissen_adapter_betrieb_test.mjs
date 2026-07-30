import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("./supabase/migrations/20260730210000_etappe8_filmwissen_adapter_betrieb.sql", import.meta.url),
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

check("B1 nur die zwei festen Adapter werden freigegeben", () => {
  const update = sql.match(/update public\.kd_filmwissen_quellen[\s\S]+?where \([\s\S]+?\n     \);/i)?.[0] ?? "";
  return /slug = 'wikidata'[\s\S]+adapter_key = 'wikidata-action-v1'/i.test(update)
    && /slug = 'loc-nfr'[\s\S]+adapter_key = 'loc-nfr-listing-v1'/i.test(update)
    && /status = 'freigegeben'/i.test(update)
    && !/slug\s+not in|status\s*<>\s*'gesperrt'/i.test(update);
});
check("B2 alle für Bericht und Anzeige nötigen Rechte werden explizit gesetzt", () =>
  /websuche_erlaubt = true[\s\S]+seitenabruf_erlaubt = true[\s\S]+cache_erlaubt = true[\s\S]+paraphrase_erlaubt = true[\s\S]+anzeige_erlaubt = true/i.test(sql)
  && /subdomains_erlaubt = false/i.test(sql));
check("B3 LOC-Snapshot ist service-only, kurzlebig und größenbegrenzt", () =>
  /create table if not exists public\.kd_filmwissen_adapter_snapshots/i.test(sql)
  && /jsonb_array_length\(payload\) between 900 and 1200/i.test(sql)
  && /octet_length\(payload::text\) <= 262144/i.test(sql)
  && /gueltig_bis <= abgerufen_at \+ interval '7 days'/i.test(sql)
  && /v_abgerufen \+ interval '24 hours'/i.test(sql)
  && /force row level security/i.test(sql)
  && /revoke all on table public\.kd_filmwissen_adapter_snapshots[\s\S]+from public, anon, authenticated/i.test(sql));
check("B4 Snapshot-Lesen prüft den aktuellen Quellenentscheid erneut", () => {
  const lesen = sql.match(/create or replace function public\.kd_filmwissen_loc_snapshot_lesen\(\)[\s\S]+?end\n\$\$;/i)?.[0] ?? "";
  return /status = 'freigegeben'/i.test(lesen)
    && /seitenabruf_erlaubt/i.test(lesen)
    && /cache_erlaubt/i.test(lesen)
    && /gueltig_bis > now\(\)/i.test(lesen);
});
check("B5 Snapshot-Schreiben akzeptiert exakt den festen Adaptervertrag", () => {
  const speichern = sql.match(/create or replace function public\.kd_filmwissen_loc_snapshot_speichern[\s\S]+?end\n\$\$;/i)?.[0] ?? "";
  return /count\(\*\) from jsonb_object_keys\(p_snapshot\)\) <> 5/i.test(speichern)
    && /adapterVersion' is distinct from 'loc-nfr-listing-v1'/i.test(speichern)
    && /abrufSha256/i.test(speichern)
    && /abgerufenAm/i.test(speichern);
});
check("B6 Werkprüfung und Auftragsstart sind eine DB-Transaktion", () => {
  const vorbereiten = sql.match(/create or replace function public\.kd_filmwissen_adapter_vorbereiten[\s\S]+?end\n\$\$;/i)?.[0] ?? "";
  return /kd_filmwissen_werk_sicherstellen/i.test(vorbereiten)
    && /kd_filmwissen_werk_pruefen/i.test(vorbereiten)
    && /kd_filmwissen_auftrag_starten/i.test(vorbereiten)
    && /v_werk_id\s*,\s*p_vorgang\s*,\s*'ausdruecklich'\s*,\s*p_quellen/i.test(vorbereiten)
    && !/auto-bericht/i.test(vorbereiten)
    && vorbereiten.indexOf("kd_filmwissen_werk_sicherstellen")
      < vorbereiten.indexOf("kd_filmwissen_werk_pruefen")
    && vorbereiten.indexOf("kd_filmwissen_werk_pruefen")
      < vorbereiten.indexOf("kd_filmwissen_auftrag_starten");
});
check("B7 Browserrollen können keine neue Betriebsnaht ausführen", () =>
  (sql.match(/revoke all on function public\.kd_filmwissen_(?:loc_snapshot_lesen|loc_snapshot_speichern|adapter_vorbereiten)[\s\S]+?from public, anon, authenticated;/gi) || []).length === 3
  && (sql.match(/grant execute on function public\.kd_filmwissen_(?:loc_snapshot_lesen|loc_snapshot_speichern|adapter_vorbereiten)[\s\S]+?to service_role;/gi) || []).length === 3);
check("B8 Synthese ist explizit auf Sonnet und 2048 Tokens geroutet", () => {
  const routing = sql.match(/do \$ki_routing\$[\s\S]+?\$ki_routing\$;/i)?.[0] ?? "";
  return /'\{filmwissen-synthese\}'[\s\S]+?'"gross"'[\s\S]+?where schluessel = 'task_modell'/i.test(routing)
    && /'\{filmwissen-synthese\}'[\s\S]+?'2048'[\s\S]+?where schluessel = 'task_max_tokens'/i.test(routing)
    && /if not found then[\s\S]+?task_modell fehlt/i.test(routing)
    && /if not found then[\s\S]+?task_max_tokens fehlt/i.test(routing);
});

console.log(`\n${ok}/${ok + fehler.length} Filmwissen-Adapterbetriebs-Checks bestanden.`);
if (fehler.length) process.exit(1);

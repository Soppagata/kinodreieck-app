/* Statischer Vertragstest fuer Etappe 8, Block 2.
   Er ersetzt keinen Lauf gegen PostgreSQL, stoppt aber versehentliche
   Aufweichungen des gemeinsamen, nicht-persoenlichen Filmwissens-Caches.
   Aufruf: node filmwissen_migration_test.mjs */

import { readFileSync } from "node:fs";

const pfad = new URL(
  "./supabase/migrations/20260729220000_etappe8_filmwissen_cache.sql",
  import.meta.url,
);
const sql = readFileSync(pfad, "utf8");
const sicherstellenSql = sql.split(
  "create or replace function public.kd_filmwissen_werk_sicherstellen",
)[1]?.split("create or replace function public.kd_filmwissen_werk_pruefen")[0] || "";
const pruefenSql = sql.split(
  "create or replace function public.kd_filmwissen_werk_pruefen",
)[1]?.split("create or replace function public.kd_filmwissen_auftrag_starten")[0] || "";
const pruefungen = [];

function pruefe(name, bedingung) {
  pruefungen.push({ name, ok: Boolean(bedingung) });
}

const tabellen = [
  "kd_filmwissen_quellen",
  "kd_filmwerke",
  "kd_filmwerk_kennungen",
  "kd_filmwissen_auftraege",
  "kd_filmwissen_versionen",
  "kd_filmwissen_belege",
  "kd_filmwissen_zeigerlog",
];

for (const tabelle of tabellen) {
  pruefe(
    `Tabelle ${tabelle} wird angelegt`,
    new RegExp(`create table if not exists public\\.${tabelle}\\b`, "i").test(sql),
  );
  pruefe(
    `RLS fuer ${tabelle} ist aktiv`,
    new RegExp(`alter table public\\.${tabelle}\\s+enable row level security`, "i").test(sql),
  );
}

pruefe("Es gibt keine Browser-Policy auf den Cache-Tabellen", !/\bcreate\s+policy\b/i.test(sql));
pruefe(
  "Direkte Tabellenrechte werden auch service_role entzogen",
  /revoke all on table[\s\S]+from public, anon, authenticated, service_role;/i.test(sql),
);
pruefe(
  "Nur authenticated erhaelt die enge Lese-RPC",
  /grant execute on function public\.kd_filmwissen_aktuell_lesen\(text,text\) to authenticated;/i.test(sql),
);
pruefe(
  "Die Lese-RPC fordert eine echte Sitzung",
  /if auth\.uid\(\) is null then[\s\S]+anmeldung_noetig/i.test(sql),
);
pruefe(
  "Alle sechs Schreib-RPCs werden nur service_role gewaehrt",
  (sql.match(/grant execute on function public\.kd_filmwissen_(?!aktuell_lesen)[^(]+\([^;]+to service_role;/gi) || []).length === 6,
);
pruefe(
  "Trigger-Helfer sind nicht direkt ausfuehrbar",
  /revoke all on function public\.kd_filmwissen_touch\(\) from public, anon, authenticated, service_role;/i.test(sql)
    && /revoke all on function public\.kd_filmwissen_unveraenderlich\(\) from public, anon, authenticated, service_role;/i.test(sql),
);

pruefe(
  "Nur starke Kennungsraeume sind erlaubt",
  /namespace in \('imdb','tmdb','watchmode','film_at','wikidata','kinodreieck'\)/i.test(sql),
);
pruefe(
  "Provider-Kennungen werden namespace-spezifisch kanonisiert",
  /kd_filmwissen_kennung_norm/i.test(sql)
    && /\^tt\[0-9\]\{7,10\}\$/i.test(sql)
    && /\^Q\[1-9\]\[0-9\]\{0,17\}\$/i.test(sql),
);
pruefe(
  "Titel und Jahr werden nicht als globale Identitaet unique gesetzt",
  !/unique\s*\(\s*(?:titel\s*,\s*jahr|jahr\s*,\s*titel)\s*\)/i.test(sql),
);
pruefe(
  "Ein Werk braucht mindestens eine starke Kennung",
  /count\(\*\) not between 1 and 6[\s\S]+jsonb_object_keys\(p_kennungen\)/i.test(sql),
);
pruefe(
  "Kennungskonflikte werden abgebrochen",
  (sql.match(/werkkennung_konflikt/g) || []).length >= 2,
);
pruefe(
  "Pro Werk bleibt hoechstens eine aktive Kennung je Anbieter",
  /kd_fwk_ein_namespace_pro_werk[\s\S]+on public\.kd_filmwerk_kennungen\(werk_id, namespace\)[\s\S]+where status <> 'gesperrt'/i.test(sql),
);
pruefe(
  "Werk-Sicherstellung verwechselt v_werk nicht mit einem fremden p_werk",
  !/\bp_werk\b/i.test(sicherstellenSql) && /\bv_werk\b/i.test(sicherstellenSql),
);
pruefe(
  "Werk-Pruefung setzt Same-Namespace-Konflikte persistent auf gesperrt",
  /mehrere_kennungen_eines_anbieters/i.test(pruefenSql)
    && /identitaetsstatus = 'gesperrt'/i.test(pruefenSql),
);
pruefe(
  "Identitaetspruefung ist gegen parallele Kennungspruefung gesperrt",
  (sql.match(/pg_advisory_xact_lock/g) || []).length >= 2,
);

pruefe(
  "Quellen sind standardmaessig fail-closed",
  /websuche_erlaubt\s+boolean not null default false/i.test(sql)
    && /seitenabruf_erlaubt\s+boolean not null default false/i.test(sql)
    && /cache_erlaubt\s+boolean not null default false/i.test(sql)
    && /paraphrase_erlaubt\s+boolean not null default false/i.test(sql)
    && /anzeige_erlaubt\s+boolean not null default false/i.test(sql),
);
pruefe(
  "Auftraege akzeptieren nur vollstaendig freigegebene Quellen",
  /q\.status <> 'freigegeben'[\s\S]+not q\.websuche_erlaubt[\s\S]+not q\.seitenabruf_erlaubt[\s\S]+not q\.cache_erlaubt[\s\S]+not q\.paraphrase_erlaubt[\s\S]+not q\.anzeige_erlaubt/i.test(sql),
);
pruefe(
  "Pro Auftrag sind hoechstens fuenf unterschiedliche Quellen erlaubt",
  /cardinality\(p_quellen\) not between 1 and 5/i.test(sql)
    && /count\(distinct slug\) <> count\(\*\)/i.test(sql),
);
pruefe(
  "Quellen- und Pakethash werden serverseitig berechnet",
  /kd_filmwissen_quellen_hash\(v_quellen\)/i.test(sql)
    && /v_paket_sha256 := encode\(extensions\.digest/i.test(sql)
    && !/\bp_quellen_hash\b/i.test(sql),
);
pruefe(
  "Beleg-URLs muessen HTTPS und auf der freigegebenen Domain sein",
  /url ~ '\^https:\/\//i.test(sql)
    && /v_host = v_quelle\.domain/i.test(sql)
    && /v_quelle\.subdomains_erlaubt/i.test(sql),
);
pruefe(
  "Kernaussagen sind kurze Strings statt gespeicherter Artikelseiten",
  /jsonb_typeof\(a\.wert\) is distinct from 'string'/i.test(sql)
    && /char_length\(trim\(a\.wert #>> '\{\}'\)\) not between 1 and 500/i.test(sql),
);
pruefe(
  "Attribution kommt aus dem kontrollierten Quellenregister, nicht aus KI-Daten",
  !/'attribution','kernaussagen','inhaltSha256'/i.test(sql)
    && /coalesce\(nullif\(trim\(v_quelle\.attribution\), ''\), v_quelle\.betreiber\)/i.test(sql),
);
pruefe(
  "Belegte WARUM-Werte brauchen mindestens zwei Domains",
  /warum_braucht_zwei_domains/i.test(sql)
    && /count\(distinct domain\) < 2[\s\S]+unnest\(v_domains\)/i.test(sql),
);
pruefe(
  "Veroeffentlichte Fassungen und Belege sind unveraenderlich",
  /before update or delete on public\.kd_filmwissen_versionen/i.test(sql)
    && /before update or delete on public\.kd_filmwissen_belege/i.test(sql),
);
pruefe(
  "Publikation, Ablauf und manueller Rollback hinterlassen eine unveraenderliche Zeigerspur",
  /before update or delete on public\.kd_filmwissen_zeigerlog/i.test(sql)
    && /'veroeffentlichung'/i.test(sql)
    && /'quelle_gesperrt'/i.test(sql)
    && /'abgelaufen'/i.test(sql)
    && /'manuell'/i.test(sql),
);
pruefe(
  "Der aktuelle Zeiger verweist nur auf eine Version desselben Werks",
  /foreign key \(id, aktuelle_version_id\)[\s\S]+references public\.kd_filmwissen_versionen\(werk_id, id\)/i.test(sql),
);
pruefe(
  "Quellenwiderruf entfernt betroffene aktuelle Zeiger sofort",
  /if v_ungueltig[\s\S]+then/i.test(sql)
    && /b\.quelle_slug = v_slug[\s\S]+set aktuelle_version_id = null/i.test(sql),
);
pruefe(
  "Lesen prueft Quellenrechte nochmals fail-closed",
  /status','gesperrt'/i.test(sql)
    && /q\.status <> 'freigegeben'[\s\S]+not q\.cache_erlaubt[\s\S]+not q\.paraphrase_erlaubt[\s\S]+not q\.anzeige_erlaubt/i.test(sql),
);
pruefe(
  "Shared Filmwissen kopiert keine persoenlichen Profil- oder Bewertungsfelder",
  !/\b(?:account_id|ai_log_id|kd_personal|kd:master|geschmacksprofil|prognose_wie|prognose_was|persoenliche_passung)\b/i.test(sql),
);

let fehler = 0;
for (const { name, ok } of pruefungen) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) fehler += 1;
}
console.log(`\n${pruefungen.length - fehler}/${pruefungen.length} Filmwissen-Migrationspruefungen bestanden.`);
if (fehler) process.exit(1);

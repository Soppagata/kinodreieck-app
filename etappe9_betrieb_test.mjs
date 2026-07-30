import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const pruefungen = [];
function check(name, wert, detail = "") {
  const bestanden = Boolean(wert);
  pruefungen.push({ name, bestanden, detail });
  console.log(`${bestanden ? "✓" : "✗"} ${name}${!bestanden && detail ? ` — ${detail}` : ""}`);
}

function lies(pfad) {
  return existsSync(pfad) ? readFileSync(pfad, "utf8") : "";
}

function ohneSqlKommentare(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

const MIGRATIONEN = join("supabase", "migrations");
const migrationsnamen = readdirSync(MIGRATIONEN)
  .filter((name) => /\.sql$/i.test(name))
  .sort();
const limitName = migrationsnamen
  .filter((name) => /etappe9.*tageslimit.*\.sql$/i.test(name))
  .at(-1);
const limitPfad = limitName ? join(MIGRATIONEN, limitName) : "";
const limitSql = limitPfad ? lies(limitPfad) : "";
const limitCode = ohneSqlKommentare(limitSql);

check(
  "Etappe 9 besitzt eine eigene, spätere Beta-Limitmigration",
  Boolean(limitName) && limitName > "20260727190000_etappe6_tageslimit_bauphase.sql",
  limitName ? `gefunden: ${limitName}` : "erwartet: *etappe9*tageslimit*.sql",
);
check(
  "Die Beta-Migration setzt tageslimit_auftraege gezielt auf 10",
  /update\s+public\.kd_ai_limits[\s\S]*?set\s+wert\s*=\s*'10'::jsonb[\s\S]*?where\s+schluessel\s*=\s*'tageslimit_auftraege'/i
    .test(limitCode),
  "UPDATE auf kd_ai_limits mit wert 10 und eindeutigem Schlüssel fehlt",
);
check(
  "Der Bauwert 200 bleibt in der Etappe-9-Migration nicht ausführbar",
  !/set\s+wert\s*=\s*'200'::jsonb[\s\S]*?where\s+schluessel\s*=\s*'tageslimit_auftraege'/i
    .test(limitCode),
  "200 darf höchstens als dokumentierter Rückweg in einem SQL-Kommentar stehen",
);

const functionCode = lies(join("supabase", "functions", "ai-task", "index.ts"));
const hauptStart = functionCode.indexOf('"kd_ai_auftrag_starten"', functionCode.indexOf("const reservierung"));
const hauptAnbieter = functionCode.indexOf("ergebnis = await rufeAnbieter", hauptStart);
const diagnoseBeginn = functionCode.indexOf('task === "anbieter-modelle"');
const diagnoseStart = functionCode.indexOf('"kd_ai_auftrag_starten"', diagnoseBeginn);
const diagnoseAnbieter = functionCode.indexOf("fetch(ANBIETER_MODELLE_URL", diagnoseBeginn);

check(
  "Der normale Anbieterpfad liegt weiterhin hinter der serverseitigen Startschleuse",
  hauptStart >= 0 && hauptAnbieter > hauptStart,
  "kd_ai_auftrag_starten muss vor rufeAnbieter stehen",
);
check(
  "Auch die Modelldiagnose liegt weiterhin hinter der serverseitigen Startschleuse",
  diagnoseBeginn >= 0 && diagnoseStart > diagnoseBeginn && diagnoseAnbieter > diagnoseStart,
  "auch der kostenfreie Diagnosepfad darf den Not-Aus nicht umgehen",
);

const alleMigrationen = migrationsnamen
  .map((name) => lies(join(MIGRATIONEN, name)))
  .join("\n");
const grundSchleuse = lies(
  join(MIGRATIONEN, "20260726180000_etappe5_ki_unterbau_haertung.sql"),
);
const notausLesen = grundSchleuse.indexOf("where schluessel = 'ai_aktiv'");
const notausAblehnen = grundSchleuse.indexOf("if v_aktiv is distinct from true");
const logSchreiben = grundSchleuse.indexOf("insert into public.kd_ai_log");
const capWrapperDelegiert = alleMigrationen.includes(
  "rename to kd_ai_auftrag_starten_ohne_task_cap",
) && alleMigrationen.includes(
  "return public.kd_ai_auftrag_starten_ohne_task_cap(",
);
check(
  "Die Datenbankschleuse prüft den Not-Aus atomar vor Reservierung und Freigabe",
  notausLesen >= 0
    && notausAblehnen > notausLesen
    && logSchreiben > notausAblehnen
    && grundSchleuse.includes("'not-aus-gesetzt'")
    && capWrapperDelegiert,
  "ai_aktiv muss in der Grundschleuse fail-closed liegen; spätere Wrapper müssen dorthin delegieren",
);

const functionTests = lies("ai_task_test.ts");
check(
  "Der gemockte Function-Vertrag belegt: abgelehnter Start ruft keinen Anbieter",
  functionTests.includes(
    "H5b anbieter-modelle: ein abgelehnter Start verhindert den Anbieteraufruf VOLLSTÄNDIG",
  )
    && functionTests.includes('grund: "not-aus-gesetzt"')
    && functionTests.includes('gleich(modelleGerufen, 0, "der echte Schlüssel wird NICHT angefasst")')
    && functionTests.includes('gleich(modelleAufrufe().length, 0, "kein fetch an den Anbieter")'),
  "die bestehende kostenfreie Negativprobe darf nicht aus dem Function-Test verschwinden",
);

const betriebPfad = join("docs", "ETAPPE_9B_BETRIEB.md");
const betaPfad = join("docs", "ETAPPE_9C_BETA.md");
const betrieb = lies(betriebPfad);
const beta = lies(betaPfad);

check(
  "Das kurze Betriebs- und Deployment-Runbook ist vorhanden",
  Boolean(betrieb),
  betriebPfad,
);
check(
  "Das geschlossene Beta-Dokument ist vorhanden",
  Boolean(beta),
  betaPfad,
);

const stoerungen = [
  ["KI-Not-Aus", /KI-Kosten|Not-Aus|ai_aktiv/i],
  ["Supabase-Ausfall", /Supabase[^|\n]*(?:aus|nicht erreichbar)|Supabase-Ausfall/i],
  ["Pages-Rollback", /Pages|Frontend-Deployment/i],
  ["Function-Rollback", /Function-Deployment|Edge Function/i],
  ["Schlüsselrotation", /Schlüssel[^|\n]*(?:kompromittiert|rotier)|Secret[^|\n]*rotier/i],
  ["Accountlöschung", /Accountlöschung|Kontolöschung/i],
];
const runbookZeilen = betrieb.split(/\r?\n/).filter((zeile) => /^\s*\|/.test(zeile));
const runbookKopf = runbookZeilen.some((zeile) =>
  /\|\s*Störung\s*\|\s*Erster Griff\s*\|\s*Beleg\s*\|\s*Rückweg\s*\|/i.test(zeile)
);
check(
  "Das Runbook macht Beleg und Rückweg zu Pflichtspalten",
  runbookKopf,
  "erwartet: Störung | Erster Griff | Beleg | Rückweg",
);
for (const [name, muster] of stoerungen) {
  const zeile = runbookZeilen.find((kandidat) => muster.test(kandidat));
  const spalten = zeile?.split("|").slice(1, -1).map((wert) => wert.trim()) ?? [];
  check(
    `${name} hat einen konkreten Griff, Beleg und Rückweg`,
    spalten.length >= 4 && spalten.slice(1, 4).every((wert) => wert.length >= 4),
    zeile ? "eine der Pflichtspalten ist leer" : "Störungszeile fehlt",
  );
}

check(
  "Das Deployment-Runbook koppelt Rollback an eine überprüfbare Version",
  /Deployment|Deploy/i.test(betrieb)
    && /Build(?:version|-Version)|Commit|Version/i.test(betrieb)
    && /Domain-Smoke|Remote-Smoke|Smoke-Test/i.test(betrieb)
    && /Rückweg|Rollback|zurückroll/i.test(betrieb),
  "Version, Smoke-Beleg und Rückweg müssen gemeinsam dokumentiert sein",
);
check(
  "Das Beta-Dokument beschreibt Kohorte, Stoppsignal und kontrollierten Rückweg",
  /geschlossen(?:e|en|er)? Beta|Kohorte/i.test(beta)
    && /vier bis fünf|4\s*(?:bis|–|-)\s*5/i.test(beta)
    && /Stopp|Abbruch|nicht fortsetzen/i.test(beta)
    && /Rückweg|Rücknahme|zurück/i.test(beta),
  "die kleine Kohorte braucht ein explizites Abbruch- und Rücknahmekriterium",
);
check(
  "Die Beta bleibt ein manueller Einladungsweg ohne offene Registrierung",
  /manuell[^.\n]*(?:Konto|einlad)|eingeladen/i.test(beta)
    && /(?:Sign-?ups?|Registrierung)[^.\n]*(?:aus|geschlossen|deaktiviert)/i.test(beta)
    && !/Selbstregistrierung[^.\n]*(?:aktiv|offen)|offene Registrierung erlaub/i.test(beta),
  "Konten werden manuell eingeladen; Sign-ups bleiben geschlossen",
);

const artefaktVertrag = betrieb + "\n" + beta;
check(
  "Betriebsartefakte schließen Secrets und Zugangsdaten ausdrücklich aus",
  /(?:Artefakt|Protokoll|Dump|Backup)[\s\S]{0,800}(?:keine|nie|nicht)[\s\S]{0,180}(?:Secret|Token|Schlüsselwert|Passwort)/i
    .test(artefaktVertrag),
  "Runbook/Beta-Hinweis müssen die Geheimnisgrenze ausdrücklich nennen",
);
check(
  "Betriebsartefakte schließen Prompts und persönliche Inhalte ausdrücklich aus",
  /(?:Artefakt|Protokoll|Diagnose|Log)[\s\S]{0,900}(?:keine|nie|nicht|verboten)[\s\S]{0,240}(?:Systemprompt|vollständige Suchanfrage|Blogtext|Scanbild|Notiz|Profilbeleg)/i
    .test(artefaktVertrag)
    && /(?:Artefakt|Protokoll|Dump|Backup)[\s\S]{0,900}(?:keine|nie|nicht|verboten)[\s\S]{0,240}(?:personenbezogen|persönliche Inhalte|Personennamen|E-Mail-Adresse|Konto-Payload)/i
      .test(artefaktVertrag),
  "keine Prompts, Freitexte oder Personenbezüge in Diagnose-/Releaseartefakten",
);

const neueArtefakte = [limitPfad, betriebPfad, betaPfad]
  .filter(Boolean)
  .map((pfad) => ({ pfad, inhalt: lies(pfad) }));
const secretMuster = [
  /sb_secret_[a-z0-9_-]+/i,
  /sk-ant-[a-z0-9_-]{16,}/i,
  /sk-proj-[a-z0-9_-]{16,}/i,
  /ghp_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];
const secretTreffer = neueArtefakte.filter(({ inhalt }) =>
  secretMuster.some((muster) => muster.test(inhalt))
);
check(
  "Die neuen 9b/9c-Artefakte enthalten keinen erkennbaren Secret-Wert",
  secretTreffer.length === 0,
  secretTreffer.map(({ pfad }) => basename(pfad)).join(", "),
);

const personenMuster = [
  /\b(?:Tester|Testerin|Kontakt|E-Mail|Account-ID)\s*:\s*[^\n<{[]+/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];
const personenTreffer = neueArtefakte.filter(({ inhalt }) =>
  personenMuster.some((muster) => muster.test(inhalt))
);
check(
  "Die neuen Betriebsartefakte nennen keine konkreten Tester oder Kontokennungen",
  personenTreffer.length === 0,
  personenTreffer.map(({ pfad }) => basename(pfad)).join(", "),
);

const fehler = pruefungen.filter(({ bestanden }) => !bestanden);
console.log(`\n${pruefungen.length - fehler.length}/${pruefungen.length} Checks bestanden.`);
console.log(
  fehler.length
    ? `ETAPPE-9-BETRIEBS-TEST ROT (${fehler.length} Befund${fehler.length === 1 ? "" : "e"})`
    : "ETAPPE-9-BETRIEBS-TEST GRÜN",
);
process.exit(fehler.length ? 1 : 0);

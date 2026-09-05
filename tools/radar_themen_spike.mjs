#!/usr/bin/env node
/* Themen-Radar — Kernschleife, einzeln lauffähig.
   ================================================================
   Zweck: Beweisen, dass die eigentliche Sache funktioniert, BEVOR
   irgendetwas deployt, migriert oder verdrahtet wird.

   Ein Aufruf = genau eine Websuche = ein paar US-Cent. Kein Retry,
   keine Schleife, kein Supabase, keine Datenbank, keine Flags.

   Aufruf:
     export ANTHROPIC_API_KEY=sk-ant-...
     node tools/radar_themen_spike.mjs "Nicolas Cage"
     node tools/radar_themen_spike.mjs "Greta Gerwig" --json
     node tools/radar_themen_spike.mjs "Dune" --modell=claude-haiku-4-5

   Transport (Endpoint, Tool-Form, Result-/Usage-Felder) ist 1:1 aus
   supabase/functions/radar-websearch-task/anthropicAdapter.js
   übernommen — dort ist er gegen echte Antworten belegt.
   ================================================================ */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const WEB_SEARCH_TOOL = "web_search_20250305";

const STANDARD_MODELL = "claude-sonnet-5";
const MAX_TOKENS = 2000;
const ZEITGRENZE_MS = 120_000;
const MAX_TREFFER = 5;

/* Preisannahmen in US-Cent je Million Token, aus den Preisböden des
   bestehenden KI-Unterbaus. Dient nur der Anzeige, nicht der Abrechnung. */
const PREISE = {
  "claude-sonnet-5": { ein: 300, aus: 1500 },
  "claude-haiku-4-5": { ein: 100, aus: 500 },
};
const SUCHGEBUEHR_USD_CENT = 1;

/* Genau der Satz, den Max beschrieben hat: Thema an einen festen
   Suchbegriff hängen. Keine Katalogbindung, keine starke ID. */
export function baueSuchbegriff(thema) {
  return `${thema} neuer Film neue Serie Kinostart Streaming Start Termin`;
}

const SYSTEM_PROMPT = [
  "Du bist ein Termin-Radar für Filme und Serien.",
  "Du bekommst ein Thema: einen Filmtitel, einen Serientitel oder eine Person (Schauspiel, Regie, Drehbuch, Musik — egal).",
  "Führe genau eine Websuche aus.",
  "",
  "Gib ausschliesslich Werke zurück, für die die Quellen einen konkreten Starttermin nennen:",
  "Kinostart, Streamingstart, Disc-/UHD-Veröffentlichung, Wiederaufführung oder Festivaltermin.",
  "Nennt eine Meldung keinen Termin, gehört sie NICHT in die Antwort — auch dann nicht, wenn sie interessant ist.",
  "Lieber eine leere Liste als ein geratenes Datum.",
  "",
  "Datum so genau, wie es belegt ist: taggenau bevorzugt, sonst Monat, sonst Jahr.",
  "Setze genauigkeit entsprechend auf tag, monat oder jahr.",
  "Region: übernimm, was die Quelle sagt (AT, DE, US, weltweit). Rate niemals einen Österreich-Termin dazu.",
  "Jeder Treffer braucht mindestens eine Quelle mit vollständiger URL.",
  "",
  `Höchstens ${MAX_TREFFER} Treffer, die zeitlich nächsten zuerst.`,
  "Antworte im letzten Textblock ausschliesslich als JSON, ohne Fliesstext und ohne Code-Zaun:",
  '{"status":"treffer"|"keine_treffer","treffer":[{"titel":"","art":"film|serie|staffel|sonstiges",',
  '"ereignis":"kinostart|streamingstart|disc|wiederauffuehrung|festival","datum":"YYYY-MM-DD|YYYY-MM|YYYY",',
  '"genauigkeit":"tag|monat|jahr","region":"","plattform":"","notiz":"",',
  '"quellen":[{"url":"","domain":"","titel":""}]}]}',
  "plattform und notiz dürfen leer sein. notiz ist höchstens ein Satz, sachlich, ohne Wertung.",
].join("\n");

function argumente(argv) {
  const rest = [];
  const optionen = { modell: STANDARD_MODELL, json: false };
  for (const wert of argv) {
    if (wert === "--json") optionen.json = true;
    else if (wert.startsWith("--modell=")) optionen.modell = wert.slice("--modell=".length).trim();
    else rest.push(wert);
  }
  return { thema: rest.join(" ").trim(), optionen };
}

function stopp(text, code = 1) {
  console.error(`\n  ${text}\n`);
  process.exit(code);
}

/* Der letzte Textblock trägt die Antwort; davor liegen Such- und
   Ergebnisblöcke. Genau so macht es der bestehende Adapter. */
function letzterTextblock(content) {
  const bloecke = content.filter((b) => b?.type === "text" && String(b.text || "").trim());
  return bloecke.length ? bloecke[bloecke.length - 1].text.trim() : null;
}

function entzaeuneJson(rohtext) {
  const ohneZaun = rohtext.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(ohneZaun); } catch { return null; }
}

function kosten(modell, nutzung) {
  const preis = PREISE[modell];
  if (!preis || !nutzung) return null;
  return (nutzung.input_tokens * preis.ein) / 1_000_000
    + (nutzung.output_tokens * preis.aus) / 1_000_000
    + (nutzung.suchen * SUCHGEBUEHR_USD_CENT);
}

function zeigeTreffer(treffer) {
  const EREIGNIS = {
    kinostart: "Kino", streamingstart: "Streaming", disc: "Disc/UHD",
    wiederauffuehrung: "Wiederaufführung", festival: "Festival",
  };
  for (const [index, t] of treffer.entries()) {
    const marke = t.genauigkeit === "tag" ? "" : `  (nur ${t.genauigkeit}genau)`;
    console.log(`\n  ${index + 1}. ${t.titel}`);
    console.log(`     ${EREIGNIS[t.ereignis] || t.ereignis} · ${t.datum}${marke}`
      + `${t.region ? ` · ${t.region}` : ""}${t.plattform ? ` · ${t.plattform}` : ""}`);
    if (t.notiz) console.log(`     ${t.notiz}`);
    for (const q of t.quellen || []) console.log(`     → ${q.domain}  ${q.url}`);
  }
}

export async function pruefeThema(thema, { modell = STANDARD_MODELL, apiKey, fetchImpl = globalThis.fetch } = {}) {
  const koerper = {
    model: modell,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Thema: ${thema}\nSuchbegriff: ${baueSuchbegriff(thema)}` }],
    /* Bewusst OHNE allowed_domains: die datierten Meldungen stehen in der
       deutschsprachigen Filmpresse und bei den Branchenblättern. Eine feste
       Domainliste war im alten Radar genau der Grund, warum nie etwas ankam. */
    tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 1 }],
  };

  const abbruch = AbortSignal.timeout(ZEITGRENZE_MS);
  const antwort = await fetchImpl(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(koerper),
    signal: abbruch,
  });

  const nutzlast = await antwort.json().catch(() => null);
  if (!antwort.ok) {
    return { ok: false, fehler: `HTTP ${antwort.status}`, roh: nutzlast };
  }

  const content = Array.isArray(nutzlast?.content) ? nutzlast.content : [];
  const suchen = nutzlast?.usage?.server_tool_use?.web_search_requests ?? 0;
  const nutzung = nutzlast?.usage
    ? { input_tokens: nutzlast.usage.input_tokens, output_tokens: nutzlast.usage.output_tokens, suchen }
    : null;

  /* pause_turn heisst: das Modell will weitersuchen. Der alte Radar hat das
     hart als Fehler behandelt — hier wird es ehrlich gemeldet statt still
     verschluckt. */
  if (nutzlast?.stop_reason === "pause_turn") {
    return { ok: false, fehler: "Modell pausiert (pause_turn) — Suche war nicht abgeschlossen", nutzung, roh: nutzlast };
  }

  const rohtext = letzterTextblock(content);
  if (!rohtext) return { ok: false, fehler: "Keine Textantwort im letzten Block", nutzung, roh: nutzlast };

  const ergebnis = entzaeuneJson(rohtext);
  if (!ergebnis || !Array.isArray(ergebnis.treffer)) {
    return { ok: false, fehler: "Antwort war kein verwertbares JSON", nutzung, rohtext, roh: nutzlast };
  }

  const treffer = ergebnis.treffer
    .filter((t) => t && t.titel && t.datum && Array.isArray(t.quellen) && t.quellen.length)
    .slice(0, MAX_TREFFER);

  return {
    ok: true,
    status: treffer.length ? "treffer" : "keine_treffer",
    treffer,
    verworfen: ergebnis.treffer.length - treffer.length,
    nutzung,
    modell: nutzlast?.model || modell,
    stopGrund: nutzlast?.stop_reason || null,
  };
}

async function main() {
  const { thema, optionen } = argumente(process.argv.slice(2));
  if (!thema) {
    stopp('Kein Thema angegeben.  Beispiel:  node tools/radar_themen_spike.mjs "Nicolas Cage"');
  }
  if (thema.length > 120) stopp("Thema ist zu lang (höchstens 120 Zeichen).");

  const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) stopp("ANTHROPIC_API_KEY ist nicht gesetzt.  export ANTHROPIC_API_KEY=sk-ant-...");

  console.log(`\n  Thema:       ${thema}`);
  console.log(`  Suchbegriff: ${baueSuchbegriff(thema)}`);
  console.log(`  Modell:      ${optionen.modell}`);
  console.log("\n  … eine Websuche läuft, das dauert typisch 15-40 Sekunden.");

  let ergebnis;
  try {
    ergebnis = await pruefeThema(thema, { modell: optionen.modell, apiKey });
  } catch (fehler) {
    stopp(`Aufruf fehlgeschlagen: ${fehler?.message || fehler}`);
  }

  if (optionen.json) {
    console.log(`\n${JSON.stringify(ergebnis, null, 2)}`);
    return;
  }

  if (!ergebnis.ok) {
    console.log(`\n  FEHLER: ${ergebnis.fehler}`);
    if (ergebnis.rohtext) console.log(`\n  Rohtext des Modells:\n${ergebnis.rohtext.slice(0, 1500)}`);
    process.exitCode = 1;
  } else if (!ergebnis.treffer.length) {
    console.log("\n  Kein Treffer mit konkretem Termin. Das ist ein gültiges Ergebnis,");
    console.log("  kein Fehler — zu diesem Thema steht gerade kein datierter Start im Netz.");
  } else {
    console.log(`\n  ${ergebnis.treffer.length} Treffer mit Termin:`);
    zeigeTreffer(ergebnis.treffer);
    if (ergebnis.verworfen > 0) {
      console.log(`\n  (${ergebnis.verworfen} Antwortzeile(n) ohne Datum oder Quelle verworfen.)`);
    }
  }

  const preis = kosten(optionen.modell, ergebnis.nutzung);
  if (ergebnis.nutzung) {
    console.log(`\n  Verbrauch:   ${ergebnis.nutzung.input_tokens} ein / ${ergebnis.nutzung.output_tokens} aus`
      + ` / ${ergebnis.nutzung.suchen} Suche(n)`);
  }
  if (preis != null) console.log(`  Kosten:      etwa ${preis.toFixed(3)} US-Cent für diesen Lauf`);
  console.log("");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

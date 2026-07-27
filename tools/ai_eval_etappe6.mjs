#!/usr/bin/env node
/* Eval der intelligenten Suche (Etappe 6) — laeuft gegen die ECHTE deployte
   Edge Function und ruft fuer JEDE Anfrage den Anbieter.
   ============================================================================
   Zweck: Max' 20 goldene Anfragen in EINEM Lauf durchschicken und in einer
   Tabelle zeigen, was die KI daraus gemacht hat. Kein Pass/Fail-Urteil — die
   Deutung einer Stimmungsanfrage ist Geschmack, und darueber entscheidet nicht
   ein Skript. Ausgegeben wird deshalb nebeneinander: die Anfrage, das ERWARTETE
   Verhalten (aus eval_demo_anfragen_max.md) und die tatsaechliche Deutung.

   ABGEPRUEFT wird nur, was objektiv falsch waere:
     - ein Wert ausserhalb der mitgeschickten Weissliste (das Modell erfindet)
     - ein Titel in `interpretation_klartext`, der nicht in der Anfrage stand
     - eine C-Anfrage (ausserhalb der Etappe), die NICHT als nicht unterstuetzt
       gemeldet wird, sondern stillschweigend zu Filtern wird
     - eine leere Deutung ohne jede Meldung (stilles Verschwinden)
   Diese vier zaehlen in den Exit-Code. Alles andere ist Material fuer dein Auge.

   KOSTEN: 20 Anfragen * ~0,82 US-Cent = **rund 16 US-Cent**. Der Lauf zaehlt
   auf das Tageslimit. Vor dem Start wird die Summe genannt und eine Bestaetigung
   verlangt (ausser mit KD_EVAL_JA=1).

   Konfiguration ausschliesslich ueber Umgebungsvariablen — nie in Dateien, nie
   im Repo, nie im Chat. Den Schluessel NICHT als Argument tippen; die
   Eingabeaufforderung unten liest ihn verdeckt:

     read -rs "A?Publishable Key: " && read -rs "P?Passwort testa: " && \
     KD_SB_URL=https://<projekt>.supabase.co KD_SB_ANON="$A" KD_TESTA_PASS="$P" \
     node tools/ai_eval_etappe6.mjs; unset A P

   Nicht Teil von `npm test`: braucht ein erreichbares Projekt, ein Testkonto
   und kostet Geld.
   ========================================================================== */

const URL_BASIS = (process.env.KD_SB_URL || "").trim().replace(/\/+$/, "");
const ANON = (process.env.KD_SB_ANON || "").trim();
const USER = (process.env.KD_TESTA_USER || "testa").trim();
const PASS = process.env.KD_TESTA_PASS || "";
const MAIL_DOMAIN = (process.env.KD_MAIL_DOMAIN || "login.kinodreieck.at").trim();
const FUNKTION = (process.env.KD_AI_FUNKTION || "ai-task").trim();
const ORIGIN = (process.env.KD_ORIGIN || "https://kinodreieck.at").trim();

if (!URL_BASIS || !ANON || !PASS) {
  console.error("Fehlende Konfiguration. Erwartet: KD_SB_URL, KD_SB_ANON, KD_TESTA_PASS.");
  console.error("Siehe Kopf dieser Datei.");
  process.exit(2);
}

/* Wertelisten wie der Client sie aus dem eigenen Bestand baut. Der Endpunkt
   bekommt NUR diese Listen — nie den Katalog, nie einen Film. */
const LISTEN = {
  genres: [
    "sci-fi", "romance", "komödie", "crime", "film-noir", "neo-noir", "horror", "drama",
    "thriller", "action", "abenteuer", "fantasy", "anime", "animation", "western", "satire",
    "parodie", "mystery", "familie", "musical", "musikfilm", "arthouse", "exploitation",
    "superheldenfilm", "monsterfilm", "martial-arts", "kriegsfilm", "historienfilm",
    "tragikomödie", "biopic", "stunt",
  ],
  kategorien: ["sicher_gut", "wahrscheinlich_passend", "referenz", "zu_pruefen"],
  stimmungen: [
    "traurig", "melancholisch", "duster", "gemutlich", "spannend", "oldschool", "modern",
    "kult", "klassiker", "trash", "damlich", "bloed", "stylisch", "wohlfuhl", "nett",
    "cool", "sinnlos", "brutal", "leicht", "anspruchsvoll",
  ],
  achsen: ["wie", "was", "warum"],
  quellen: ["kino", "streaming", "dvd"],
  zeit: ["heute", "morgen"],
};

/* Max' goldene Anfragen. Originalschreibweise ABSICHTLICH erhalten — Tippfehler
   und Wiener Slang sind Teil des Testfalls, nicht ein Versehen.
   `aussen: true` heisst: liegt ausserhalb der Etappe-6-Grenzen. Die richtige
   Antwort ist dort eine ehrliche Meldung, NIE ein Filter und NIE eine Titelliste. */
const ANFRAGEN = [
  { id: "A1", text: "Ich bin heut echt nicht gut drauf", soll: "weich: wohlfühl/gemütlich, keine harten Filter" },
  { id: "A2", text: "Huet möcht ich was kuhles schaun", soll: "weich: cool/stylisch → WIE-Achse; Tippfehler-Toleranz" },
  { id: "A3", text: "Irgendwas nettes, nicht so spannend, kein powpow, aber nett", soll: "weich: nett/wohlfühl; Ausschluss action; Abschlag spannend" },
  { id: "A4", text: "ich will den geilsten scheiß sehn", soll: "hart: Kategorie sicher_gut (Top-Bewertung)" },
  { id: "A5", text: "Ich brauch was sinnloses", soll: "hart/weich: trash oder dämlich" },
  { id: "A6", text: "Stumpfe Gewalt, aber ur kuhl", soll: "hart: action; weich: WIE-Achse/stylisch. 'ur' darf nicht stören" },
  { id: "A7", text: "Einen der besten Filme aller Zeiten", soll: "hart: Kategorie referenz/kult; weich: WARUM-Achse" },

  { id: "B1", text: "Welchen Nightmare hab ich noch nicht gesehen?", soll: "hart: Reihe 'Nightmare'; ehrlich: Vollständigkeitsabgleich nicht möglich" },

  { id: "C1", text: "Welceh Filme von Nic Cage hab ich schon und welche fehlen mir noch?", aussen: true, soll: "nicht unterstützt: Schauspieler ist kein Datenfeld. KEINE Filmliste" },
  { id: "C2", text: "Welche FIlme werden so in Scary Movie 1 refereiert? Was muss ich gesehen haben?", aussen: true, soll: "nicht unterstützt: Filmwissen. KEINE Titelliste aus Weltwissen" },

  { id: "D1", text: "was läuft morgen im kino das stylisch ist", soll: "hart: Quelle kino + Zeit morgen; weich: WIE-Achse" },
  { id: "D2", text: "irgendwas düsteres aus den 80ern, aber kein horror", soll: "hart: Jahrzehnt 1980; Ausschluss horror; weich: düster" },
  { id: "D3", text: "was zwischen 1970 und 1985", soll: "hart: jahrMin 1970, jahrMax 1985" },
  { id: "D4", text: "was hab ich auf netflix das lustig ist", soll: "hart: Quelle streaming, Genre komödie" },
  { id: "D5", text: "irgendwas aus meinem regal, aber nix aus den 2000ern", soll: "hart: Quelle dvd; Dekaden-Ausschluss 2000" },
  { id: "D6", text: "unter zwei stunden bitte", aussen: true, soll: "nicht unterstützt: Laufzeit ist kein verlässliches Katalogfeld" },

  /* Vier Ergaenzungen, die die Grenzfaelle der Deutung treffen — sie stammen
     nicht aus Max' Liste, sondern aus den Faellen, die beim Bau schwierig waren. */
  { id: "E1", text: "nichts nach 1985", soll: "hart: jahrMax 1985 (negierte offene Grenze kehrt sich um)" },
  { id: "E2", text: "kein alter Film, aber auch nichts von heute", soll: "beide Grenzen oder ehrliche Meldung — nur nichts Widersprüchliches" },
  { id: "E3", text: "was Stylisches aus den 80ern im Kino, aber keine Komödie", soll: "hart: 1980 + kino; Ausschluss komödie; weich: stylisch" },
  { id: "E4", text: "ich will was schauen", soll: "leere oder minimale Deutung — aber gemeldet, nicht still" },
];

const ENDPUNKT = `${URL_BASIS}/functions/v1/${FUNKTION}`;
const JSON_KOPF = { "Content-Type": "application/json" };
const KOSTEN_JE_ANFRAGE_CENT = 0.82;

async function meldeAn() {
  const antwort = await fetch(`${URL_BASIS}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${USER}@${MAIL_DOMAIN}`, password: PASS }),
  });
  const daten = await antwort.json().catch(() => null);
  if (!antwort.ok || !daten?.access_token) {
    console.error(`\nAnmeldung als ${USER}@${MAIL_DOMAIN} fehlgeschlagen (HTTP ${antwort.status}).`);
    console.error(`Grund laut Server: ${daten?.error_description || daten?.msg || daten?.error || "unbekannt"}`);
    process.exit(2);
  }
  return daten.access_token;
}

/* Bestaetigung vor dem Geld. Ein Eval-Lauf ist billig, aber nicht kostenlos,
   und ein versehentlicher Doppellauf soll auffallen, bevor er passiert. */
async function bestaetige(summeCent) {
  if (process.env.KD_EVAL_JA === "1") return;
  if (!process.stdin.isTTY) {
    console.error("Kein Terminal — Abbruch. Mit KD_EVAL_JA=1 laufen lassen, wenn das gewollt ist.");
    process.exit(2);
  }
  process.stdout.write(
    `\n${ANFRAGEN.length} Anfragen an den Anbieter, geschaetzt ${summeCent.toFixed(1)} US-Cent.\n`
    + "Weiter? [j/N] ",
  );
  const antwort = await new Promise((loese) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (d) => loese(String(d).trim().toLowerCase()));
  });
  if (antwort !== "j" && antwort !== "ja") {
    console.log("Abgebrochen. Kein Aufruf, keine Kosten.");
    process.exit(0);
  }
}

const alleWerte = new Set([
  ...LISTEN.genres, ...LISTEN.kategorien, ...LISTEN.stimmungen,
  ...LISTEN.achsen, ...LISTEN.quellen, ...LISTEN.zeit,
]);

/* Kurzfassung der Deutung fuer die Tabelle. */
function fasse(d) {
  const teile = [];
  const h = d.harte_filter || {};
  const w = d.weiche_wuensche || {};
  const a = d.ausschluesse || {};
  const liste = (name, x) => { if (Array.isArray(x) && x.length) teile.push(`${name}=${x.join("/")}`); };
  liste("genre", h.genres);
  liste("kat", h.kategorien);
  liste("quelle", h.quellen);
  liste("zeit", h.zeit);
  liste("dek", h.dekaden);
  if (h.jahrMin != null) teile.push(`ab ${h.jahrMin}`);
  if (h.jahrMax != null) teile.push(`bis ${h.jahrMax}`);
  if (Array.isArray(h.titel) && h.titel.length) teile.push(`titel=${h.titel.join("/")}`);
  if (Array.isArray(h.reihen) && h.reihen.length) teile.push(`reihe=${h.reihen.map((r) => r.name).join("/")}`);
  liste("stimmung", w.stimmungen);
  liste("achse", w.achsen);
  liste("ohne-genre", a.genres);
  liste("ohne-dek", a.dekaden);
  if (d.entdecken === true) teile.push("entdecken");
  return teile.length ? teile.join(", ") : "— nichts —";
}

/* Jeder Wert, den das Modell genannt hat, in einer flachen Liste — fuer die
   Weisslisten-Pruefung. Jahre und Jahrzehnte sind Zahlen und zaehlen nicht mit. */
function genannteWerte(d) {
  const h = d.harte_filter || {};
  const w = d.weiche_wuensche || {};
  const a = d.ausschluesse || {};
  return [
    ...(h.genres || []), ...(h.kategorien || []), ...(h.quellen || []), ...(h.zeit || []),
    ...(w.stimmungen || []), ...(w.achsen || []), ...(a.genres || []),
  ].filter((x) => typeof x === "string");
}

const token = await meldeAn();
await bestaetige(ANFRAGEN.length * KOSTEN_JE_ANFRAGE_CENT);

console.log(`\nEval Etappe 6 — ${ANFRAGEN.length} Anfragen gegen ${ENDPUNKT}\n`);

let fehler = 0;
const zeilen = [];

for (const anfrage of ANFRAGEN) {
  const antwort = await fetch(ENDPUNKT, {
    method: "POST",
    headers: { Origin: ORIGIN, ...JSON_KOPF, Authorization: `Bearer ${token}`, apikey: ANON },
    body: JSON.stringify({
      task: "intelligent-search",
      vorgangId: crypto.randomUUID(),
      promptVersion: "eval1",
      payload: { suchsatz: anfrage.text, listen: LISTEN },
    }),
  });
  const roh = await antwort.json().catch(() => null);
  const d = roh?.data;

  if (antwort.status !== 200 || !d) {
    fehler += 1;
    zeilen.push({ ...anfrage, ist: `FEHLER HTTP ${antwort.status}: ${roh?.grund || roh?.code || "?"}`, offen: [], befund: "Aufruf gescheitert" });
    console.log(`✗ ${anfrage.id}  HTTP ${antwort.status} — ${roh?.grund || roh?.code || "?"}`);
    continue;
  }

  const offen = (d.nicht_unterstuetzt || []).map((e) => (typeof e === "string" ? e : `${e.wunsch} (${e.grund})`));
  const befunde = [];

  /* 1. Erfundener Wert. Der Endpunkt setzt die Weissliste durch — schlaegt das
        hier an, ist die Durchsetzung selbst kaputt, nicht das Modell. */
  const fremd = genannteWerte(d).filter((x) => !alleWerte.has(x));
  if (fremd.length) befunde.push(`Wert ausserhalb der Weissliste: ${fremd.join(", ")}`);

  /* 2. Titel im Klartext, der nicht in der Anfrage stand. Grob geprueft: ein
        Wort mit Grossbuchstaben im Klartext, das in der Anfrage fehlt. */
  const klartext = String(d.interpretation_klartext || "");
  const anfrageWorte = new Set(anfrage.text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const verdacht = (klartext.match(/\p{Lu}[\p{L}]{3,}/gu) || [])
    .filter((wort) => !anfrageWorte.has(wort.toLowerCase()))
    .filter((wort) => !["Filme", "Film", "Kino", "Suche", "Nutzer", "Genre", "Der", "Die", "Das", "Ein", "Eine", "Es", "Ich", "Du"].includes(wort));
  if (verdacht.length) befunde.push(`moeglicher erfundener Name im Klartext: ${verdacht.join(", ")}`);

  /* 3. Eine Anfrage ausserhalb der Etappe MUSS gemeldet werden. Wird sie
        stattdessen zu Filtern, ist das der schlimmste Fall: der Nutzer haelt
        seinen Wunsch fuer erfuellt. */
  const hatFilter = fasse(d) !== "— nichts —";
  if (anfrage.aussen && !offen.length) {
    befunde.push("ausserhalb der Etappe, aber NICHT als nicht unterstuetzt gemeldet");
  }

  /* 4. Nichts verstanden und nichts gesagt. */
  if (!hatFilter && !offen.length && !klartext) befunde.push("leere Deutung ohne jede Meldung");

  if (befunde.length) fehler += 1;
  zeilen.push({ ...anfrage, ist: fasse(d), offen, klartext, befund: befunde.join(" | ") });
  console.log(`${befunde.length ? "✗" : "✓"} ${anfrage.id}  ${anfrage.text.slice(0, 58)}`);
}

console.log("\n".padEnd(1) + "=".repeat(100));
console.log("EVAL-TABELLE — die Spalte 'IST' ist zum Abnicken oder Korrigieren, nicht zum Bestehen.\n");

for (const z of zeilen) {
  console.log(`${z.id}${z.aussen ? " (ausserhalb)" : ""}  „${z.text}"`);
  console.log(`     SOLL: ${z.soll}`);
  console.log(`     IST:  ${z.ist}`);
  if (z.klartext) console.log(`     Text: ${z.klartext}`);
  if (z.offen?.length) console.log(`     offen: ${z.offen.join(" · ")}`);
  if (z.befund) console.log(`     BEFUND: ${z.befund}`);
  console.log("");
}

console.log("=".repeat(100));
console.log(`${ANFRAGEN.length - fehler}/${ANFRAGEN.length} ohne objektiven Befund.`);
console.log(`Geschaetzte Kosten dieses Laufs: ${(ANFRAGEN.length * KOSTEN_JE_ANFRAGE_CENT).toFixed(1)} US-Cent.`);
console.log(
  fehler === 0
    ? "\nKeine erfundenen Werte, keine stillen Ablehnungen. Die Deutungsqualitaet beurteilst du."
    : `\n${fehler} Anfrage(n) mit objektivem Befund — siehe BEFUND-Zeilen oben.`,
);
process.exit(fehler === 0 ? 0 : 1);

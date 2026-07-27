#!/usr/bin/env node
/* Eval der intelligenten Suche (Etappe 6).
   ============================================================================
   ZWEI GETRENNTE SCHRITTE. Das ist die Lehre aus dem ersten Lauf am 26.07.:
   die Bewertung war falsch, die Antworten waren es nicht — und weil beides in
   einem Durchgang lief, war das Material weg und die Korrektur haette einen
   zweiten bezahlten Lauf gekostet.

     node tools/ai_eval_etappe6.mjs --holen    ruft den Anbieter, schreibt die
                                               Rohantworten in eine Datei. KOSTET.
     node tools/ai_eval_etappe6.mjs --pruefen  liest die Datei und urteilt.
                                               Kostenlos, beliebig oft.

   Ohne Argument laeuft --holen und direkt danach --pruefen.

   Die Rohdatei heisst `eval_rohdaten_<zeitstempel>.json`, liegt im Arbeits-
   verzeichnis und ist in .gitignore. Sie enthaelt Suchsaetze und Modell-
   ausgaben, keine Schluessel.

   WAS GEPRUEFT WIRD. Nicht die Deutungsqualitaet — ob „nicht gut drauf" eher
   gemuetlich oder eher melancholisch heisst, ist Geschmack und kein
   Skriptthema. In den Exit-Code zaehlen nur Faelle, die objektiv falsch sind:

     1. ein Filterwert ausserhalb der mitgeschickten Weissliste
        -> dann ist die Durchsetzung im Endpunkt kaputt, nicht das Modell
     2. ein TITEL in harte_filter.titel, dessen Woerter in der Anfrage fehlen
        -> das waere ein erfundener Titel an der einzigen Stelle, an der ein
           Titel etwas bewirkt
     3. eine Anfrage AUSSERHALB der Etappe, die nicht als nicht unterstuetzt
        gemeldet wird, sondern still zu Filtern wird
        -> der schlimmste Fall: der Nutzer haelt seinen Wunsch fuer erfuellt
     4. eine voellig leere Deutung ohne jede Meldung

   AUSDRUECKLICH NICHT MEHR GEPRUEFT: grossgeschriebene Woerter im Klartext.
   Der erste Entwurf hat sie als moegliche Filmtitel gemeldet — im Deutschen
   ist jedes Substantiv gross, und so wurden „Anfrage", „Wuensche",
   „Einschraenkungen" zu angeblich erfundenen Titeln. 18 von 20 Anfragen rot,
   alle falsch. Ein Hinweis auf Anfuehrungszeichen im Klartext bleibt, aber
   nur als Notiz fuer das Auge, NICHT im Exit-Code: der Klartext ist reiner
   Anzeigetext, er kann keinen Treffer erzeugen.

   Konfiguration nur ueber Umgebungsvariablen. Den Schluessel NICHT als
   Argument tippen — die Eingabeaufforderung liest ihn verdeckt:

     cd <repo> && \
     read -rs "A?Publishable Key: " && echo && read -rs "P?Passwort testa: " && echo && \
     KD_SB_URL=https://<projektref>.supabase.co KD_SB_ANON="$A" KD_TESTA_PASS="$P" \
     node tools/ai_eval_etappe6.mjs --holen; unset A P

   Nicht Teil von `npm test`: braucht ein erreichbares Projekt, ein Testkonto
   und kostet Geld.
   ========================================================================== */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const MODUS = process.argv.includes("--pruefen") ? "pruefen"
  : process.argv.includes("--holen") ? "holen"
    : "beides";

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

const KOSTEN_JE_ANFRAGE_CENT = 0.82;

/* ===================== HOLEN (kostet) ===================================== */

async function holen() {
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
  if (URL_BASIS.includes("<") || URL_BASIS.includes(">")) {
    console.error("KD_SB_URL enthaelt spitze Klammern — da steht noch ein Platzhalter drin.");
    process.exit(2);
  }

  const ENDPUNKT = `${URL_BASIS}/functions/v1/${FUNKTION}`;
  const anmeldung = await fetch(`${URL_BASIS}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${USER}@${MAIL_DOMAIN}`, password: PASS }),
  });
  const anmeldeDaten = await anmeldung.json().catch(() => null);
  if (!anmeldung.ok || !anmeldeDaten?.access_token) {
    console.error(`\nAnmeldung als ${USER}@${MAIL_DOMAIN} fehlgeschlagen (HTTP ${anmeldung.status}).`);
    console.error(`Grund laut Server: ${anmeldeDaten?.error_description || anmeldeDaten?.msg || anmeldeDaten?.error || "unbekannt"}`);
    process.exit(2);
  }
  const token = anmeldeDaten.access_token;

  /* Bestaetigung vor dem Geld. */
  if (process.env.KD_EVAL_JA !== "1") {
    if (!process.stdin.isTTY) {
      console.error("Kein Terminal — Abbruch. Mit KD_EVAL_JA=1 laufen lassen, wenn das gewollt ist.");
      process.exit(2);
    }
    process.stdout.write(
      `\n${ANFRAGEN.length} Anfragen an den Anbieter, geschaetzt `
      + `${(ANFRAGEN.length * KOSTEN_JE_ANFRAGE_CENT).toFixed(1)} US-Cent.\nWeiter? [j/N] `,
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

  console.log(`\nHole ${ANFRAGEN.length} Deutungen von ${ENDPUNKT}\n`);
  const roh = [];
  for (const anfrage of ANFRAGEN) {
    const antwort = await fetch(ENDPUNKT, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: ANON },
      body: JSON.stringify({
        task: "intelligent-search",
        vorgangId: crypto.randomUUID(),
        promptVersion: "eval1",
        payload: { suchsatz: anfrage.text, listen: LISTEN },
      }),
    });
    const koerper = await antwort.json().catch(() => null);
    roh.push({ id: anfrage.id, status: antwort.status, antwort: koerper });
    console.log(`  ${antwort.status === 200 ? "·" : "✗"} ${anfrage.id}  ${anfrage.text.slice(0, 56)}`);
  }

  /* Zeitstempel ohne Doppelpunkte — der Dateiname soll auf jedem System gehen. */
  const stempel = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const datei = `eval_rohdaten_${stempel}.json`;
  writeFileSync(datei, JSON.stringify({ erstellt: new Date().toISOString(), listen: LISTEN, roh }, null, 2));
  console.log(`\nRohantworten geschrieben: ${datei}`);

  /* Die TATSAECHLICHEN Kosten, nicht die geschaetzten. Vorher stand hier die
     Schaetzung mal Anzahl der Anfragen -- unabhaengig davon, was wirklich
     passiert ist. Am 27.07. liefen alle 20 Anfragen ins Tageslimit, es gab
     keinen einzigen Anbieteraufruf, und das Skript meldete trotzdem "rund
     16.4 US-Cent". Ein Werkzeug, das Kosten meldet, die es nicht kennt, ist
     schlimmer als eines, das schweigt: man glaubt ihm.

     Bezahlt wird nur, was den Anbieter erreicht hat. 429 (Limit) und 400
     (Payload abgewiesen) werden VOR der Reservierung abgewiesen und kosten
     nichts; 502 dagegen bedeutet, dass der Aufruf lief und abgebrochen ist --
     der ist bezahlt. */
  const bezahlt = roh.filter((r) => r.status === 200 || r.status === 502).length;
  const gelimitet = roh.filter((r) => r.status === 429).length;
  console.log(bezahlt === 0
    ? "Kosten dieses Laufs: KEINE - kein Aufruf hat den Anbieter erreicht."
    : `Kosten dieses Laufs: rund ${(bezahlt * KOSTEN_JE_ANFRAGE_CENT).toFixed(1)} US-Cent `
      + `(${bezahlt} von ${roh.length} Anfragen sind beim Anbieter angekommen).`);

  if (gelimitet) {
    console.log("");
    console.log(`ACHTUNG: ${gelimitet} von ${roh.length} Anfragen wurden mit "tageslimit-erreicht"`);
    console.log("abgewiesen. Diese Rohdatei ist als Eval damit WERTLOS - sie misst nicht die");
    console.log("Deutungsqualitaet, sondern nur, dass das Limit greift.");
    console.log("Das Tageslimit gilt je Konto und Kalendertag (Europe/Vienna) und steht in");
    console.log("kd_ai_limits unter tageslimit_auftraege. Entweder morgen erneut laufen lassen");
    console.log("oder den Wert fuer die Bauphase anheben.");
  }
  console.log("Ab jetzt kostenlos beliebig oft auswertbar: node tools/ai_eval_etappe6.mjs --pruefen");
  return datei;
}

/* ===================== PRUEFEN (kostenlos) ================================ */

function neuesteRohdatei() {
  const treffer = readdirSync(".").filter((n) => /^eval_rohdaten_.*\.json$/.test(n)).sort();
  if (!treffer.length) {
    console.error("Keine Rohdatei gefunden. Erst `node tools/ai_eval_etappe6.mjs --holen` laufen lassen.");
    process.exit(2);
  }
  return treffer[treffer.length - 1];
}

const wortMenge = (s) => new Set(String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));

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
  if (Array.isArray(w.reihen) && w.reihen.length) teile.push(`reihe=${w.reihen.map((r) => r.name).join("/")}`);
  liste("stimmung", w.stimmungen);
  liste("achse", w.achsen);
  liste("ohne-genre", a.genres);
  liste("ohne-dek", a.dekaden);
  if (d.entdecken === true) teile.push("entdecken");
  return teile.length ? teile.join(", ") : "— nichts —";
}

function genannteWerte(d) {
  const h = d.harte_filter || {};
  const w = d.weiche_wuensche || {};
  const a = d.ausschluesse || {};
  return [
    ...(h.genres || []), ...(h.kategorien || []), ...(h.quellen || []), ...(h.zeit || []),
    ...(w.stimmungen || []), ...(w.achsen || []), ...(a.genres || []),
  ].filter((x) => typeof x === "string");
}

function pruefen(datei) {
  const inhalt = JSON.parse(readFileSync(datei, "utf8"));
  const listen = inhalt.listen || LISTEN;
  const erlaubt = new Set([
    ...listen.genres, ...listen.kategorien, ...listen.stimmungen,
    ...listen.achsen, ...listen.quellen, ...listen.zeit,
  ]);
  const nachId = new Map(inhalt.roh.map((r) => [r.id, r]));

  console.log(`\nAusgewertet: ${datei}   (erstellt ${inhalt.erstellt})\n`);
  console.log("=".repeat(100));

  let befunde = 0;
  let hinweise = 0;
  let abgewiesen = 0;   // 429: nie beim Anbieter gewesen, nicht bewertbar

  for (const anfrage of ANFRAGEN) {
    const r = nachId.get(anfrage.id);
    const d = r?.antwort?.data;
    const zeilen = [];

    console.log(`\n${anfrage.id}${anfrage.aussen ? "  (ausserhalb der Etappe)" : ""}  „${anfrage.text}"`);
    console.log(`     SOLL: ${anfrage.soll}`);

    if (!r || r.status !== 200 || !d) {
      const grund = r?.antwort?.grund || r?.antwort?.code || "?";
      console.log(`     IST:  FEHLER HTTP ${r?.status ?? "?"} — ${grund}`);
      /* Ein Limit ist kein Befund AN DER SUCHE. Der Aufruf hat den Anbieter nie
         erreicht, es gibt nichts zu beurteilen. Das als "Befund" zu zaehlen
         wuerde eine Aussage ueber die Deutungsqualitaet vortaeuschen, die diese
         Zeile gar nicht treffen kann. */
      if (r?.status === 429) { abgewiesen += 1; console.log("     (nicht bewertbar: Aufruf abgewiesen, bevor er den Anbieter erreicht hat)"); }
      else { befunde += 1; console.log("     BEFUND: Aufruf gescheitert"); }
      continue;
    }

    const offen = (d.nicht_unterstuetzt || []).map((e) => (typeof e === "string" ? e : `${e.wunsch} (${e.grund})`));
    const klartext = String(d.interpretation_klartext || "");
    const ist = fasse(d);
    console.log(`     IST:  ${ist}`);
    if (klartext) console.log(`     Text: ${klartext}`);
    if (offen.length) console.log(`     offen: ${offen.join(" · ")}`);

    /* 1. Wert ausserhalb der Weissliste — das waere ein Riss im Endpunkt. */
    const fremd = genannteWerte(d).filter((x) => !erlaubt.has(x));
    if (fremd.length) zeilen.push(`Wert ausserhalb der Weissliste: ${fremd.join(", ")}`);

    /* 2. Erfundener TITEL. Nur `harte_filter.titel` zaehlt — das ist die
          einzige Stelle, an der ein Titel etwas bewirkt. Geprueft wird, ob
          mindestens ein Wort des Titels in der Anfrage vorkommt; ein Titel,
          den der Nutzer nicht genannt hat, hat dort nichts verloren.
          Ein-Buchstaben-Woerter zaehlen nicht als Beleg. */
    const anfrageWorte = wortMenge(anfrage.text);
    const erfundeneTitel = (d.harte_filter?.titel || [])
      .filter((t) => typeof t === "string")
      .filter((t) => ![...wortMenge(t)].some((wort) => wort.length > 1 && anfrageWorte.has(wort)));
    if (erfundeneTitel.length) zeilen.push(`Titel ohne Entsprechung in der Anfrage: ${erfundeneTitel.join(", ")}`);

    /* 3. Ausserhalb der Etappe, aber nicht gemeldet. */
    if (anfrage.aussen && !offen.length) {
      zeilen.push("ausserhalb der Etappe, aber NICHT als nicht unterstuetzt gemeldet");
    }

    /* 4. Nichts verstanden und nichts gesagt. */
    if (ist === "— nichts —" && !offen.length && !klartext) {
      zeilen.push("leere Deutung ohne jede Meldung");
    }

    /* HINWEIS, nicht Befund: etwas in Anfuehrungszeichen im Klartext, das nicht
       aus der Anfrage stammt. Modelle setzen Filmtitel gern in Anfuehrungs-
       zeichen. Das ist reiner Anzeigetext und kann keinen Treffer erzeugen —
       deshalb nur fuers Auge, nicht im Exit-Code. */
    const zitate = (klartext.match(/[„"»']([^„"»']{2,60})["«']/g) || [])
      .map((z) => z.replace(/^[„"»']|["«']$/g, ""))
      .filter((z) => ![...wortMenge(z)].some((wort) => anfrageWorte.has(wort)));
    if (zitate.length) {
      hinweise += 1;
      console.log(`     Hinweis: Zitat im Klartext, nicht aus der Anfrage: ${zitate.join(" · ")}`);
    }

    if (zeilen.length) {
      befunde += 1;
      console.log(`     BEFUND: ${zeilen.join(" | ")}`);
    }
  }

  console.log(`\n${"=".repeat(100)}`);
  if (abgewiesen) {
    console.log(`${abgewiesen} von ${ANFRAGEN.length} Anfragen wurden abgewiesen, bevor sie den Anbieter erreicht haben.`);
    console.log("Dieser Lauf taugt NICHT als Abnahme. Erst wiederholen, wenn das Limit wieder Luft hat.");
    console.log("");
  }
  const bewertbar = ANFRAGEN.length - abgewiesen;
  console.log(`${bewertbar - befunde}/${bewertbar} bewertbare Anfragen ohne objektiven Befund.`);
  if (hinweise) console.log(`${hinweise} Hinweis(e) zum Anschauen — zaehlen nicht als Fehler.`);
  console.log(
    bewertbar === 0
      ? "\nNichts gemessen, also auch nichts belegt. Keine Aussage ueber die Deutungsqualitaet."
      : befunde === 0
        ? "\nKeine erfundenen Werte, keine erfundenen Titel, keine stillen Ablehnungen.\nOb die Deutung GUT ist, beurteilst du an den SOLL/IST-Paaren oben."
        : `\n${befunde} Anfrage(n) mit objektivem Befund — siehe BEFUND-Zeilen.`,
  );
  return { befunde, abgewiesen };
}

/* ===================== Ablauf ============================================= */

let datei = null;
if (MODUS === "holen" || MODUS === "beides") datei = await holen();
if (MODUS === "holen") process.exit(0);
/* Ein Lauf, der wegen Limits gar nicht stattgefunden hat, darf nicht mit 0
   enden -- das laese sich als bestandene Abnahme lesen. */
const ergebnis = pruefen(datei || neuesteRohdatei());
process.exit(ergebnis.befunde === 0 && ergebnis.abgewiesen === 0 ? 0 : 1);

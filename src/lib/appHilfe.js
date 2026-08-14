import {
  HILFE_AKTIONEN,
  HILFE_BEREICHE,
  HILFE_FALLBACK,
  holeHilfeBereich,
  normalisiereHilfeText,
} from "./hilfeInhalte.js";

const HILFE_INTENT = Object.freeze([
  "hilfe", "anleitung", "settings", "setting", "einstellung", "einstellungen",
  "wo finde ich", "wo finde", "wo ist", "wie kann ich", "wie ändere ich",
  "wie aendere ich", "wie stelle ich", "wie funktioniert", "wie geht",
]);
const ALLGEMEINER_HILFE_INTENT = Object.freeze([
  "hilfe", "anleitung", "settings", "setting", "einstellung", "einstellungen",
]);
const HILFE_GEGENSTAND_HUELLE = Object.freeze(new Set([
  "der", "die", "das", "den", "dem", "des",
  "ein", "eine", "einen", "einem", "einer",
]));

function enthaeltPhrase(text, phrase) {
  return text === phrase || text.startsWith(`${phrase} `) || text.endsWith(` ${phrase}`)
    || text.includes(` ${phrase} `);
}

function hatHilfeIntent(text) {
  return HILFE_INTENT.some((phrase) => enthaeltPhrase(text, phrase));
}

function hatAllgemeinenHilfeIntent(text) {
  return ALLGEMEINER_HILFE_INTENT.some((phrase) => enthaeltPhrase(text, phrase));
}

function entfernePhrase(text, phrase) {
  if (text === phrase) return "";
  if (text.startsWith(`${phrase} `)) return text.slice(phrase.length + 1);
  if (text.endsWith(` ${phrase}`)) return text.slice(0, -(phrase.length + 1));
  return text.replace(` ${phrase} `, " ");
}

function hatExaktenIntentGegenstand(text, suchwoerter) {
  for (const intent of HILFE_INTENT) {
    if (!enthaeltPhrase(text, intent)) continue;
    const ohneIntent = entfernePhrase(text, intent);
    for (const suchwort of suchwoerter) {
      if (!enthaeltPhrase(ohneIntent, suchwort)) continue;
      const rest = entfernePhrase(ohneIntent, suchwort).trim();
      if (!rest || rest.split(" ").every((wort) => HILFE_GEGENSTAND_HUELLE.has(wort))) {
        return true;
      }
    }
  }
  return false;
}

function werteTreffer(text, suchwoerter) {
  const treffer = suchwoerter.filter((phrase) => enthaeltPhrase(text, phrase));
  if (!treffer.length) return null;
  const tokenAnzahlen = treffer.map((phrase) => phrase.split(" ").length);
  return {
    exakt: treffer.some((phrase) => phrase === text) ? 1 : 0,
    spezifitaet: tokenAnzahlen.reduce((summe, anzahl) => summe + (anzahl * anzahl), 0),
    signale: treffer.length,
    laenge: treffer.reduce((summe, phrase) => summe + phrase.length, 0),
    starkePhrase: tokenAnzahlen.some((anzahl) => anzahl > 1),
  };
}

function vergleicheKandidaten(a, b) {
  return b.wertung.exakt - a.wertung.exakt
    || b.wertung.spezifitaet - a.wertung.spezifitaet
    || b.wertung.signale - a.wertung.signale
    || b.wertung.laenge - a.wertung.laenge
    || a.quellIndex - b.quellIndex;
}

function sichereAntwort(inhalt, text) {
  const bereich = holeHilfeBereich(inhalt.bereichId || inhalt.id);
  if (!bereich) return null;
  return Object.freeze({
    id: inhalt.id,
    titel: inhalt.titel,
    text,
    ziel: bereich.ziel,
    bereichId: bereich.id,
    bereichTitel: bereich.titel,
  });
}

export function appHilfeAntwort(frage) {
  const text = normalisiereHilfeText(frage);
  if (!text) return null;
  const intent = hatHilfeIntent(text);
  const allgemeinerIntent = hatAllgemeinenHilfeIntent(text);
  const kandidaten = [];

  for (const [quellIndex, aktion] of HILFE_AKTIONEN.entries()) {
    const wertung = werteTreffer(text, aktion.suchwoerter);
    if (wertung && (wertung.exakt || wertung.starkePhrase || allgemeinerIntent
        || hatExaktenIntentGegenstand(text, aktion.suchwoerter))) {
      kandidaten.push({ art: "aktion", inhalt: aktion, wertung, quellIndex });
    }
  }
  if (intent) {
    const versatz = HILFE_AKTIONEN.length;
    for (const [index, bereich] of HILFE_BEREICHE.entries()) {
      const wertung = werteTreffer(text, bereich.suchwoerter);
      if (wertung && (wertung.starkePhrase || allgemeinerIntent
          || hatExaktenIntentGegenstand(text, bereich.suchwoerter))) {
        kandidaten.push({
          art: "bereich", inhalt: bereich, wertung, quellIndex: versatz + index,
        });
      }
    }
  }

  kandidaten.sort(vergleicheKandidaten);
  const treffer = kandidaten[0];
  if (treffer?.art === "aktion") {
    return sichereAntwort(treffer.inhalt, treffer.inhalt.text);
  }
  if (treffer?.art === "bereich") {
    return sichereAntwort(treffer.inhalt, treffer.inhalt.kurztext);
  }
  return allgemeinerIntent
    ? sichereAntwort(HILFE_FALLBACK, HILFE_FALLBACK.text)
    : null;
}

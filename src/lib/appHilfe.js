import {
  HILFE_AKTIONEN,
  HILFE_BEREICHE,
  HILFE_FALLBACK,
  holeHilfeBereich,
  normalisiereHilfeText,
} from "./hilfeInhalte.js";

const ALLGEMEINER_HILFE_INTENT = Object.freeze([
  "hilfe", "anleitung", "settings", "setting", "einstellung", "einstellungen",
]);
const HILFE_AUFRUF_MARKER = Object.freeze(new Set([
  "bei", "zu", "zum", "zur", "für", "fuer", "mit", "über", "ueber",
]));
const HANDLUNGS_INTENT = Object.freeze([
  "wie kann ich", "wie ändere ich", "wie aendere ich", "wie stelle ich",
  "wie funktioniert", "wie geht",
]);
const ORTS_INTENT = Object.freeze([
  "wo kann ich", "wo finde ich", "wo finde", "wo ist",
]);
const HILFE_GEGENSTAND_HUELLE = Object.freeze(new Set([
  "der", "die", "das", "den", "dem", "des",
  "ein", "eine", "einen", "einem", "einer",
  "bei", "zu", "zum", "zur", "in", "im", "unter", "auf", "an", "am",
]));

function enthaeltPhrase(text, phrase) {
  return text === phrase || text.startsWith(`${phrase} `) || text.endsWith(` ${phrase}`)
    || text.includes(` ${phrase} `);
}

function restNachStartPhrase(text, phrase) {
  if (text === phrase) return "";
  return text.startsWith(`${phrase} `) ? text.slice(phrase.length + 1) : null;
}

function entfernePhrase(text, phrase) {
  if (text === phrase) return "";
  if (text.startsWith(`${phrase} `)) return text.slice(phrase.length + 1);
  if (text.endsWith(` ${phrase}`)) return text.slice(0, -(phrase.length + 1));
  return text.replace(` ${phrase} `, " ");
}

function erkenneAllgemeinenHilfeIntent(text) {
  for (const phrase of ALLGEMEINER_HILFE_INTENT) {
    const rest = restNachStartPhrase(text, phrase);
    if (rest === null) continue;
    if ((phrase === "hilfe" || phrase === "anleitung") && rest) {
      const marker = rest.split(" ")[0];
      if (!HILFE_AUFRUF_MARKER.has(marker)) continue;
    }
    const gegenstand = rest || ((phrase === "hilfe" || phrase === "anleitung") ? "" : phrase);
    return { art: "allgemein", phrase, rest, gegenstand, aktional: false };
  }
  return null;
}

function erkenneHilfeIntent(text) {
  const allgemein = erkenneAllgemeinenHilfeIntent(text);
  if (allgemein) return allgemein;
  for (const phrase of HANDLUNGS_INTENT) {
    const rest = restNachStartPhrase(text, phrase);
    if (rest !== null) return { art: "bedienung", phrase, rest, gegenstand: rest, aktional: true };
  }
  for (const phrase of ORTS_INTENT) {
    const rest = restNachStartPhrase(text, phrase);
    if (rest !== null) return { art: "bedienung", phrase, rest, gegenstand: rest, aktional: false };
  }
  return null;
}

function entfernePhrasen(text, phrasen) {
  let rest = text;
  let entfernt = false;
  const sortiert = [...new Set(phrasen)].sort((a, b) => b.length - a.length);
  for (const phrase of sortiert) {
    while (phrase && enthaeltPhrase(rest, phrase)) {
      rest = entfernePhrase(rest, phrase).trim();
      entfernt = true;
    }
  }
  return { rest, entfernt };
}

function istNurHuelle(text) {
  return !text || text.split(" ").every((wort) => HILFE_GEGENSTAND_HUELLE.has(wort));
}

function analysiereGegenstand(text, inhalt, { aktion = false } = {}) {
  const suchwoerter = [...inhalt.suchwoerter].sort((a, b) => b.length - a.length);
  for (const suchwort of suchwoerter) {
    if (!enthaeltPhrase(text, suchwort)) continue;
    let rest = entfernePhrase(text, suchwort).trim();
    let aktionsKontext = false;
    if (aktion) {
      const titelWoerter = normalisiereHilfeText(inhalt.titel).split(" ").filter(Boolean);
      const ohneAktionswoerter = entfernePhrasen(rest, titelWoerter);
      rest = ohneAktionswoerter.rest;
      aktionsKontext = ohneAktionswoerter.entfernt;
      const bereich = holeHilfeBereich(inhalt.bereichId);
      const ohneZielkontext = entfernePhrasen(rest, bereich?.suchwoerter || []);
      rest = ohneZielkontext.rest;
      aktionsKontext ||= ohneZielkontext.entfernt;
    }
    if (istNurHuelle(rest)) {
      return {
        suchwort,
        direkt: !!inhalt.direkteSuchwoerter?.includes(suchwort),
        aktionsKontext,
      };
    }
  }
  return null;
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
  return b.rang - a.rang
    || b.wertung.exakt - a.wertung.exakt
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
  const intent = erkenneHilfeIntent(text);
  const gegenstand = intent?.gegenstand || text;
  const kandidaten = [];

  for (const [quellIndex, aktion] of HILFE_AKTIONEN.entries()) {
    const analyse = intent
      ? analysiereGegenstand(gegenstand, aktion, { aktion: true })
      : (aktion.direkteSuchwoerter.includes(text) ? { direkt: true, aktionsKontext: false } : null);
    if (!analyse) continue;
    if (intent?.art === "bedienung" && !intent.aktional
        && !analyse.direkt && !analyse.aktionsKontext) continue;
    const wertung = werteTreffer(gegenstand, aktion.suchwoerter);
    if (!wertung) continue;
    const spezifisch = analyse.direkt || analyse.aktionsKontext || intent?.aktional;
    kandidaten.push({
      art: "aktion", inhalt: aktion, wertung, rang: spezifisch ? 2 : 0, quellIndex,
    });
  }
  if (intent) {
    const versatz = HILFE_AKTIONEN.length;
    for (const [index, bereich] of HILFE_BEREICHE.entries()) {
      const analyse = analysiereGegenstand(gegenstand, bereich);
      const wertung = analyse && werteTreffer(gegenstand, bereich.suchwoerter);
      if (!wertung) continue;
      kandidaten.push({
        art: "bereich", inhalt: bereich, wertung, rang: 1, quellIndex: versatz + index,
      });
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
  return intent?.art === "allgemein" && istNurHuelle(intent.rest)
    ? sichereAntwort(HILFE_FALLBACK, HILFE_FALLBACK.text)
    : null;
}

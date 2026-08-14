import {
  HILFE_AKTIONEN,
  HILFE_BEREICHE,
  HILFE_FALLBACK,
  holeHilfeBereich,
  normalisiereHilfeText,
} from "./hilfeInhalte.js";
import { QUELLEN } from "./quellen.js";

const ALLGEMEINE_HILFE_FORMEN = Object.freeze([
  "hilfe", "anleitung", "ich brauche hilfe",
]);
const HILFE_AUFRUF_MARKER = Object.freeze(new Set([
  "bei", "zu", "zum", "zur", "für", "fuer", "mit", "über", "ueber",
]));
const EINSTELLUNGS_INTENT = Object.freeze([
  "settings", "setting", "einstellung", "einstellungen",
]);
const HANDLUNGS_INTENT = Object.freeze([
  Object.freeze({ phrase: "wie ändere ich", stark: true }),
  Object.freeze({ phrase: "wie aendere ich", stark: true }),
  Object.freeze({ phrase: "wie kann ich", stark: false }),
]);
const EINSTELLUNGS_FRAGEN = Object.freeze([
  Object.freeze({ phrase: "wie stelle ich", endwort: "ein" }),
]);
const ERKLAERUNGS_INTENT = Object.freeze([
  "wie funktioniert", "wie geht",
]);
const ORTS_INTENT = Object.freeze([
  "wo kann ich", "wo finde ich", "wo finde", "wo ist",
]);
const HANDLUNGS_ENDVERBEN = Object.freeze(new Set([
  "ändern", "aendern", "einstellen",
]));
const HILFE_GEGENSTAND_HUELLE = Object.freeze(new Set([
  "der", "die", "das", "den", "dem", "des",
  "ein", "eine", "einen", "einem", "einer",
  "bei", "zu", "zum", "zur", "in", "im", "unter", "auf", "an", "am",
]));
const QUELLEN_BEGRIFFE = Object.freeze(QUELLEN.map((quelle) => Object.freeze({
  key: normalisiereHilfeText(quelle.key),
  label: normalisiereHilfeText(quelle.label),
})));
const AKTIONS_SUCHWOERTER = Object.freeze(new Set(
  HILFE_AKTIONEN.flatMap((aktion) => aktion.suchwoerter),
));

function enthaeltPhrase(text, phrase) {
  return text === phrase || text.startsWith(`${phrase} `) || text.endsWith(` ${phrase}`)
    || text.includes(` ${phrase} `);
}

function restNachStartPhrase(text, phrase) {
  if (text === phrase) return "";
  return text.startsWith(`${phrase} `) ? text.slice(phrase.length + 1) : null;
}

function restVorEndwort(text, wort) {
  if (text === wort) return "";
  return text.endsWith(` ${wort}`) ? text.slice(0, -(wort.length + 1)) : null;
}

function entfernePhrase(text, phrase) {
  if (text === phrase) return "";
  if (text.startsWith(`${phrase} `)) return text.slice(phrase.length + 1);
  if (text.endsWith(` ${phrase}`)) return text.slice(0, -(phrase.length + 1));
  return text.replace(` ${phrase} `, " ");
}

function erkenneAllgemeinenHilfeIntent(text) {
  for (const phrase of ALLGEMEINE_HILFE_FORMEN) {
    const rest = restNachStartPhrase(text, phrase);
    if (rest === null) continue;
    if (rest) {
      const marker = rest.split(" ")[0];
      if (!HILFE_AUFRUF_MARKER.has(marker)) continue;
    }
    return { art: "allgemein", phrase, rest, gegenstand: rest, stark: false };
  }
  return null;
}

function erkenneHilfeIntent(text) {
  const allgemein = erkenneAllgemeinenHilfeIntent(text);
  if (allgemein) return allgemein;
  for (const phrase of EINSTELLUNGS_INTENT) {
    const rest = restNachStartPhrase(text, phrase);
    if (rest !== null) {
      return {
        art: "einstellung", phrase, rest, gegenstand: rest || "settings",
        stark: true, zielBereichId: "daten",
      };
    }
  }
  for (const form of EINSTELLUNGS_FRAGEN) {
    const rest = restNachStartPhrase(text, form.phrase);
    if (rest === null) continue;
    const gegenstand = restVorEndwort(rest, form.endwort);
    return {
      art: "einstellung", phrase: form.phrase, rest,
      gegenstand: gegenstand === null ? rest : gegenstand,
      stark: gegenstand !== null,
    };
  }
  for (const form of HANDLUNGS_INTENT) {
    const rest = restNachStartPhrase(text, form.phrase);
    if (rest === null) continue;
    let gegenstand = rest;
    let stark = form.stark;
    if (!stark) {
      const endwort = rest.split(" ").at(-1);
      if (HANDLUNGS_ENDVERBEN.has(endwort)) {
        gegenstand = restVorEndwort(rest, endwort);
        stark = true;
      }
    }
    return { art: "handlung", phrase: form.phrase, rest, gegenstand, stark };
  }
  for (const phrase of ERKLAERUNGS_INTENT) {
    const rest = restNachStartPhrase(text, phrase);
    if (rest !== null) {
      return { art: "erklaerung", phrase, rest, gegenstand: rest, stark: false };
    }
  }
  for (const phrase of ORTS_INTENT) {
    const rest = restNachStartPhrase(text, phrase);
    if (rest !== null) return { art: "ort", phrase, rest, gegenstand: rest, stark: false };
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

function istPossessivDeterminer(wort) {
  return /^(?:mein|dein|sein|ihr)(?:e|en|em|er|es)?$/u.test(wort)
    || /^unser(?:e|en|em|er|es)?$/u.test(wort)
    || /^(?:euer|eur(?:e|en|em|er|es))$/u.test(wort);
}

function istNurHuelle(text) {
  return !text || text.split(" ").every((wort) => HILFE_GEGENSTAND_HUELLE.has(wort)
    || istPossessivDeterminer(wort));
}

function aktionsSuchphrasen(aktion) {
  const phrasen = new Map(aktion.suchwoerter.map((suchwort) => [suchwort, {
    phrase: suchwort, suchwort, quellenAlias: false,
  }]));
  const suchwoerter = new Set(aktion.suchwoerter);
  for (const quelle of QUELLEN_BEGRIFFE) {
    const kanonisch = suchwoerter.has(quelle.key)
      ? quelle.key
      : (suchwoerter.has(quelle.label) ? quelle.label : null);
    if (!kanonisch) continue;
    for (const phrase of new Set([quelle.key, quelle.label])) {
      if (!phrase) continue;
      phrasen.set(phrase, { phrase, suchwort: kanonisch, quellenAlias: true });
    }
  }
  return [...phrasen.values()].sort((a, b) => b.phrase.length - a.phrase.length);
}

function analysiereGegenstand(text, inhalt, { aktion = false } = {}) {
  const suchphrasen = aktion
    ? aktionsSuchphrasen(inhalt)
    : [...inhalt.suchwoerter]
      .sort((a, b) => b.length - a.length)
      .map((suchwort) => ({ phrase: suchwort, suchwort, quellenAlias: false }));
  for (const { phrase, suchwort, quellenAlias } of suchphrasen) {
    if (!enthaeltPhrase(text, phrase)) continue;
    let rest = entfernePhrase(text, phrase).trim();
    let aktionsKontext = false;
    if (aktion) {
      const titelWoerter = normalisiereHilfeText(inhalt.titel).split(" ").filter(Boolean);
      const ohneAktionswoerter = entfernePhrasen(rest, titelWoerter);
      rest = ohneAktionswoerter.rest;
      aktionsKontext = ohneAktionswoerter.entfernt;
      const bereich = holeHilfeBereich(inhalt.bereichId);
      const zielSuchwoerter = (bereich?.suchwoerter || [])
        .filter((suchwort) => !AKTIONS_SUCHWOERTER.has(suchwort));
      const ohneZielkontext = entfernePhrasen(rest, zielSuchwoerter);
      rest = ohneZielkontext.rest;
      aktionsKontext ||= ohneZielkontext.entfernt;
    }
    if (istNurHuelle(rest)) {
      return {
        suchwort,
        direkt: !!inhalt.direkteSuchwoerter?.includes(suchwort),
        aktionsKontext,
        quellenAlias,
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

function aktionsRang(intent, analyse, aktion) {
  if (analyse.direkt || analyse.aktionsKontext) return 4;
  if (!intent || intent.art === "ort") return null;
  if (intent.art === "allgemein") return 1;
  if (intent.art === "einstellung") {
    if (intent.zielBereichId && aktion.bereichId !== intent.zielBereichId) return null;
    return intent.stark ? 3 : null;
  }
  if (intent.art === "handlung" && intent.stark) return 3;
  if (intent.art === "erklaerung" || intent.art === "handlung") {
    return analyse.quellenAlias ? null : 1;
  }
  return null;
}

function istMehrdeutigeAktionsspitze(kandidaten, treffer) {
  if (treffer?.art !== "aktion") return false;
  const ids = new Set(kandidaten
    .filter((kandidat) => kandidat.art === "aktion" && kandidat.rang === treffer.rang)
    .map((kandidat) => kandidat.inhalt.id));
  return ids.size > 1;
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
    const rang = aktionsRang(intent, analyse, aktion);
    if (rang === null) continue;
    const wertung = werteTreffer(gegenstand, aktion.suchwoerter);
    if (!wertung) continue;
    kandidaten.push({
      art: "aktion", inhalt: aktion, wertung, rang, quellIndex,
    });
  }
  if (intent) {
    const versatz = HILFE_AKTIONEN.length;
    for (const [index, bereich] of HILFE_BEREICHE.entries()) {
      const analyse = analysiereGegenstand(gegenstand, bereich);
      const wertung = analyse && werteTreffer(gegenstand, bereich.suchwoerter);
      if (!wertung) continue;
      kandidaten.push({
        art: "bereich", inhalt: bereich, wertung, rang: 2, quellIndex: versatz + index,
      });
    }
  }

  kandidaten.sort(vergleicheKandidaten);
  const treffer = kandidaten[0];
  if (istMehrdeutigeAktionsspitze(kandidaten, treffer)) return null;
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

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
const APP_ERKLAERUNGS_INTENT = Object.freeze([
  ...ERKLAERUNGS_INTENT,
  "was kann",
  "erkläre mir", "erklaere mir", "erklär mir", "erklaer mir",
]);
const APP_GEGENSTAENDE = Object.freeze(new Set([
  "app", "die app", "diese app",
  "kinodreieck", "kinodreieck app", "die kinodreieck app",
]));
const ORTS_INTENT = Object.freeze([
  "wo kann ich", "wo finde ich", "wo finde", "wo ist",
]);
const AENDERUNGS_ENDVERBEN = Object.freeze(["ändern", "aendern"]);
const HANDLUNGS_ENDVERBEN = Object.freeze(new Set([
  ...AENDERUNGS_ENDVERBEN, "einstellen",
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

function intentVarianten(gegenstand, zusaetzlicheVarianten = []) {
  const varianten = [{ text: gegenstand, huellwoerter: [] }, ...zusaetzlicheVarianten];
  const gesehen = new Set();
  return varianten.filter((variante) => {
    const schluessel = `${variante.text}\u0000${[...variante.huellwoerter].sort().join(" ")}`;
    if (gesehen.has(schluessel)) return false;
    gesehen.add(schluessel);
    return true;
  });
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

function erkenneAppErklaerungsIntent(text) {
  for (const phrase of APP_ERKLAERUNGS_INTENT) {
    const rest = restNachStartPhrase(text, phrase);
    if (rest !== null && APP_GEGENSTAENDE.has(rest)) {
      return {
        art: "app-erklaerung", phrase, rest, gegenstand: rest, stark: true,
      };
    }
  }
  return null;
}

function erkenneHilfeIntent(text) {
  const appErklaerung = erkenneAppErklaerungsIntent(text);
  if (appErklaerung) return appErklaerung;
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
    const objekt = restVorEndwort(rest, form.endwort);
    const zusaetzlicheVarianten = objekt === null ? [] : [{
      text: `${objekt} einstellen`.trim(),
      huellwoerter: ["einstellen"],
    }];
    return {
      art: "einstellung", phrase: form.phrase, rest,
      gegenstand: rest,
      gegenstandsVarianten: intentVarianten(rest, zusaetzlicheVarianten),
      stark: objekt !== null,
    };
  }
  for (const form of HANDLUNGS_INTENT) {
    const rest = restNachStartPhrase(text, form.phrase);
    if (rest === null) continue;
    let stark = form.stark;
    const zusaetzlicheVarianten = [];
    const huellwoerter = [];
    if (form.stark) {
      for (const endverb of AENDERUNGS_ENDVERBEN) {
        zusaetzlicheVarianten.push({
          text: `${rest} ${endverb}`.trim(),
          huellwoerter: [endverb],
        });
      }
    }
    if (!stark) {
      const endwort = rest.split(" ").at(-1);
      if (HANDLUNGS_ENDVERBEN.has(endwort)) {
        stark = true;
        huellwoerter.push(endwort);
        const objekt = restVorEndwort(rest, endwort);
        if (objekt !== null && AENDERUNGS_ENDVERBEN.includes(endwort)) {
          for (const endverb of AENDERUNGS_ENDVERBEN) {
            if (endverb === endwort) continue;
            zusaetzlicheVarianten.push({
              text: `${objekt} ${endverb}`.trim(),
              huellwoerter: [endverb],
            });
          }
        }
      }
    }
    return {
      art: "handlung", phrase: form.phrase, rest, gegenstand: rest, stark,
      gegenstandsVarianten: intentVarianten(rest, [
        { text: rest, huellwoerter },
        ...zusaetzlicheVarianten,
      ]),
    };
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

function istNurHuelle(text, zusaetzlicheHuellwoerter = []) {
  const huellwoerter = new Set([...HILFE_GEGENSTAND_HUELLE, ...zusaetzlicheHuellwoerter]);
  return !text || text.split(" ").every((wort) => HILFE_GEGENSTAND_HUELLE.has(wort)
    || huellwoerter.has(wort) || istPossessivDeterminer(wort));
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

const AKTIONS_SIGNALPHRASEN = Object.freeze(HILFE_AKTIONEN.flatMap((aktion) =>
  aktionsSuchphrasen(aktion).map(({ phrase }) => Object.freeze({
    aktionsId: aktion.id,
    tokens: Object.freeze(phrase.split(" ").filter(Boolean)),
  }))));
const AKTIONS_KONTEXTSIGNALPHRASEN = Object.freeze(HILFE_BEREICHE.flatMap((bereich) =>
  bereich.suchwoerter.flatMap((phrase) => {
    if (AKTIONS_SUCHWOERTER.has(phrase)) return [];
    const aktionsIds = new Set(HILFE_AKTIONEN
      .filter((aktion) => aktion.bereichId === bereich.id
        && aktion.suchwoerter.some((suchwort) => suchwort.startsWith(`${phrase} `)))
      .map((aktion) => aktion.id));
    if (aktionsIds.size !== 1) return [];
    return [Object.freeze({
      bereichId: bereich.id,
      aktionsId: [...aktionsIds][0],
      tokens: Object.freeze(phrase.split(" ").filter(Boolean)),
    })];
  })));

function aktionssignalIds(text, zusaetzlicheSignalphrasen = []) {
  const tokens = text.split(" ").filter(Boolean);
  const signale = [];
  for (const signalphrase of [...AKTIONS_SIGNALPHRASEN, ...zusaetzlicheSignalphrasen]) {
    const laenge = signalphrase.tokens.length;
    if (!laenge || laenge > tokens.length) continue;
    for (let start = 0; start <= tokens.length - laenge; start += 1) {
      if (!signalphrase.tokens.every((token, index) => token === tokens[start + index])) continue;
      signale.push({
        aktionsId: signalphrase.aktionsId,
        start,
        ende: start + laenge,
      });
    }
  }
  const verbleibend = signale.filter((signal) => !signale.some((anderes) =>
    anderes.aktionsId !== signal.aktionsId
      && anderes.start <= signal.start
      && anderes.ende >= signal.ende
      && (anderes.start < signal.start || anderes.ende > signal.ende)));
  return new Set(verbleibend.map((signal) => signal.aktionsId));
}

function hatMehrereAktionssignale(varianten, intent) {
  const aktionsIds = new Set();
  const kontextSignalphrasen = intent?.art === "einstellung" && intent.zielBereichId
    ? AKTIONS_KONTEXTSIGNALPHRASEN
      .filter((signalphrase) => signalphrase.bereichId === intent.zielBereichId)
    : [];
  for (const variante of varianten) {
    for (const aktionsId of aktionssignalIds(variante.text, kontextSignalphrasen)) {
      aktionsIds.add(aktionsId);
    }
  }
  return aktionsIds.size > 1;
}

function analysiereGegenstand(text, inhalt, {
  aktion = false,
  huellwoerter = [],
} = {}) {
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
    if (istNurHuelle(rest, huellwoerter)) {
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

function vergleicheFachlich(a, b) {
  return b.rang - a.rang
    || b.wertung.exakt - a.wertung.exakt
    || b.wertung.spezifitaet - a.wertung.spezifitaet
    || b.wertung.signale - a.wertung.signale
    || b.wertung.laenge - a.wertung.laenge;
}

function vergleicheKandidaten(a, b) {
  return vergleicheFachlich(a, b) || a.quellIndex - b.quellIndex;
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
    .filter((kandidat) => kandidat.art === "aktion"
      && vergleicheFachlich(kandidat, treffer) === 0)
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
  const varianten = intent?.gegenstandsVarianten || [{ text: gegenstand, huellwoerter: [] }];
  if (hatMehrereAktionssignale(varianten, intent)) return null;
  const kandidaten = [];

  for (const [quellIndex, aktion] of HILFE_AKTIONEN.entries()) {
    let besterKandidat = null;
    for (const variante of varianten) {
      const analyse = intent
        ? analysiereGegenstand(variante.text, aktion, {
          aktion: true,
          huellwoerter: variante.huellwoerter,
        })
        : (aktion.direkteSuchwoerter.includes(text)
          ? { direkt: true, aktionsKontext: false }
          : null);
      if (!analyse) continue;
      const rang = aktionsRang(intent, analyse, aktion);
      if (rang === null) continue;
      const wertung = werteTreffer(variante.text, aktion.suchwoerter);
      if (!wertung) continue;
      const kandidat = {
        art: "aktion", inhalt: aktion, wertung, rang, quellIndex,
      };
      if (!besterKandidat || vergleicheFachlich(kandidat, besterKandidat) < 0) {
        besterKandidat = kandidat;
      }
    }
    if (besterKandidat) kandidaten.push(besterKandidat);
  }
  if (intent) {
    const versatz = HILFE_AKTIONEN.length;
    for (const [index, bereich] of HILFE_BEREICHE.entries()) {
      let besterKandidat = null;
      for (const variante of varianten) {
        const analyse = analysiereGegenstand(variante.text, bereich, {
          huellwoerter: variante.huellwoerter,
        });
        const wertung = analyse && werteTreffer(variante.text, bereich.suchwoerter);
        if (!wertung) continue;
        const kandidat = {
          art: "bereich", inhalt: bereich, wertung, rang: 2,
          quellIndex: versatz + index,
        };
        if (!besterKandidat || vergleicheFachlich(kandidat, besterKandidat) < 0) {
          besterKandidat = kandidat;
        }
      }
      if (besterKandidat) kandidaten.push(besterKandidat);
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
  return (intent?.art === "allgemein" && istNurHuelle(intent.rest))
    || intent?.art === "app-erklaerung"
    ? sichereAntwort(HILFE_FALLBACK, HILFE_FALLBACK.text)
    : null;
}

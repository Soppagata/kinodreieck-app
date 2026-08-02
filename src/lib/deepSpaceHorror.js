import { norm } from "./match.js";

export const DEEP_SPACE_HORROR_ID = "deep-space-horror";
export const DEEP_SPACE_HORROR_SCHWELLE = 4;

const referenzen = [
  {
    id: "alien-1979",
    jahr: 1979,
    titel: ["Alien", "Alien – Das unheimliche Wesen aus einer fremden Welt"],
  },
  {
    id: "aliens-1986",
    jahr: 1986,
    titel: ["Aliens", "Aliens – Die Rückkehr"],
  },
  {
    id: "alien-3-1992",
    jahr: 1992,
    titel: ["Alien 3", "Alien³"],
  },
  {
    id: "alien-resurrection-1997",
    jahr: 1997,
    titel: ["Alien: Resurrection", "Alien – Die Wiedergeburt"],
  },
  {
    id: "alien-vs-predator-2004",
    jahr: 2004,
    titel: ["Alien vs. Predator", "AVP: Alien vs. Predator"],
  },
  {
    id: "aliens-vs-predator-requiem-2007",
    jahr: 2007,
    titel: ["Aliens vs. Predator: Requiem", "Aliens vs. Predator 2", "AVPR: Aliens vs. Predator – Requiem"],
  },
  {
    id: "prometheus-2012",
    jahr: 2012,
    titel: ["Prometheus", "Prometheus – Dunkle Zeichen"],
  },
  {
    id: "alien-covenant-2017",
    jahr: 2017,
    titel: ["Alien: Covenant", "Alien – Covenant"],
  },
  {
    id: "alien-romulus-2024",
    jahr: 2024,
    titel: ["Alien: Romulus"],
  },
  {
    id: "event-horizon-1997",
    jahr: 1997,
    titel: ["Event Horizon", "Event Horizon – Am Rande des Universums"],
  },
  {
    id: "2001-a-space-odyssey-1968",
    jahr: 1968,
    titel: ["2001: A Space Odyssey", "2001: Odyssee im Weltraum"],
  },
];

export const DEEP_SPACE_REFERENZEN = Object.freeze(referenzen.map((referenz) => Object.freeze({
  ...referenz,
  titel: Object.freeze([...referenz.titel]),
})));

const referenzIndex = new Map();
const normalisiereReferenztitel = (wert) => norm(String(wert || "").replaceAll("³", "3"));
for (const referenz of DEEP_SPACE_REFERENZEN) {
  for (const titel of referenz.titel) {
    referenzIndex.set(`${referenz.jahr}|${normalisiereReferenztitel(titel)}`, referenz);
  }
}

/** Exakter Titel-/Jahr-Treffer für einen Film; Serien und andere Typen zählen nie. */
export function findeDeepSpaceReferenz(eintrag) {
  if (!eintrag || String(eintrag.typ || "").toLocaleLowerCase("de-AT") !== "film") return null;
  const jahr = Number(eintrag.jahr);
  if (!Number.isInteger(jahr)) return null;

  const titel = [eintrag.titel, eintrag.originaltitel]
    .map((wert) => normalisiereReferenztitel(wert))
    .filter(Boolean);
  for (const kandidat of titel) {
    const referenz = referenzIndex.get(`${jahr}|${kandidat}`);
    if (referenz) return referenz;
  }
  return null;
}

export function istDeepSpaceFilm(eintrag) {
  return findeDeepSpaceReferenz(eintrag) !== null;
}

/** Zählt verschiedene Werke, nicht verschiedene Mediathekseinträge. */
export function zaehleDeepSpaceReferenzen(mediathek) {
  const eindeutig = new Set();
  for (const eintrag of Array.isArray(mediathek) ? mediathek : []) {
    const referenz = findeDeepSpaceReferenz(eintrag);
    if (referenz) eindeutig.add(referenz.id);
  }
  return eindeutig.size;
}

export function istDeepSpaceFreigeschaltet(mediathek) {
  return zaehleDeepSpaceReferenzen(mediathek) >= DEEP_SPACE_HORROR_SCHWELLE;
}

// Lesbare Aliasnamen für Integrationsstellen, ohne eine zweite Implementierung.
export const matchDeepSpaceReferenz = findeDeepSpaceReferenz;
export const zaehleDeepSpaceFilme = zaehleDeepSpaceReferenzen;
export const deepSpaceFreigeschaltet = istDeepSpaceFreigeschaltet;

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "kd:deep-space-horror:rhythmus:";
const DATUM_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function zweiStellen(wert) {
  return String(wert).padStart(2, "0");
}

function lokalerTag(datum) {
  if (!(datum instanceof Date) || !Number.isFinite(datum.getTime())) return null;
  return `${datum.getFullYear()}-${zweiStellen(datum.getMonth() + 1)}-${zweiStellen(datum.getDate())}`;
}

function tagAlsLokalesMittag(datumsSchluessel) {
  const treffer = DATUM_RE.exec(String(datumsSchluessel || ""));
  if (!treffer) return null;
  const jahr = Number(treffer[1]);
  const monat = Number(treffer[2]);
  const tag = Number(treffer[3]);
  const datum = new Date(jahr, monat - 1, tag, 12, 0, 0, 0);
  if (datum.getFullYear() !== jahr || datum.getMonth() !== monat - 1 || datum.getDate() !== tag) return null;
  return datum;
}

function addiereLokaleKalendertage(datumsSchluessel, anzahl) {
  const datum = tagAlsLokalesMittag(datumsSchluessel);
  if (!datum) return null;
  datum.setDate(datum.getDate() + anzahl);
  return lokalerTag(datum);
}

function istDatumswert(wert) {
  return wert === null || tagAlsLokalesMittag(wert) !== null;
}

function leererZustand() {
  return {
    version: STORAGE_VERSION,
    lastAttempt: null,
    nextEligible: null,
    halloweenAttempt: null,
    lastSeen: null,
  };
}

function normalisiereZustand(roherZustand) {
  if (!roherZustand || typeof roherZustand !== "object" || roherZustand.version !== STORAGE_VERSION) return null;
  const zustand = {
    version: STORAGE_VERSION,
    lastAttempt: roherZustand.lastAttempt ?? null,
    nextEligible: roherZustand.nextEligible ?? null,
    halloweenAttempt: roherZustand.halloweenAttempt ?? null,
    lastSeen: roherZustand.lastSeen ?? null,
  };
  return [zustand.lastAttempt, zustand.nextEligible, zustand.halloweenAttempt, zustand.lastSeen].every(istDatumswert)
    ? zustand
    : null;
}

function ergebnis(gewuerfelt, treffer, grund, naechsterTermin) {
  return { gewuerfelt, treffer, grund, naechsterTermin: naechsterTermin ?? null };
}

function speicherSchluessel(ownerKey) {
  if (typeof ownerKey !== "string" || !ownerKey.trim()) return null;
  return STORAGE_PREFIX + encodeURIComponent(ownerKey.trim());
}

function sicherSchreiben(storage, schluessel, zustand) {
  const serialisiert = JSON.stringify(zustand);
  try {
    storage.setItem(schluessel, serialisiert);
    return storage.getItem(schluessel) === serialisiert;
  } catch {
    return false;
  }
}

/**
 * Reserviert einen zulässigen Eintritt vor dem Zufallswurf. Das injizierte
 * Storage-Objekt entspricht der synchronen localStorage-Schnittstelle.
 */
export function pruefeDeepSpaceEintritt({ jetzt, zufall, storage, ownerKey } = {}) {
  const heute = lokalerTag(jetzt);
  if (!heute) return ergebnis(false, false, "datum-ungueltig", null);

  const schluessel = speicherSchluessel(ownerKey);
  if (!schluessel) return ergebnis(false, false, "owner-fehlt", null);
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    return ergebnis(false, false, "speicher-nicht-verfuegbar", null);
  }

  let roh;
  try {
    roh = storage.getItem(schluessel);
  } catch {
    return ergebnis(false, false, "speicher-lesefehler", null);
  }

  let zustand;
  if (roh == null) {
    zustand = leererZustand();
  } else {
    try {
      zustand = normalisiereZustand(JSON.parse(roh));
    } catch {
      zustand = null;
    }
    if (!zustand) return ergebnis(false, false, "speicher-ungueltig", null);
  }

  if (zustand.lastSeen && heute < zustand.lastSeen) {
    return ergebnis(false, false, "uhr-zurueckgestellt", zustand.nextEligible);
  }

  // lastAttempt deckt reguläre und Halloween-Versuche ab: nie zwei Würfe am selben Tag.
  if (zustand.lastAttempt === heute || zustand.halloweenAttempt === heute) {
    return ergebnis(false, false, "heute-bereits-versucht", zustand.nextEligible);
  }

  const datum = tagAlsLokalesMittag(heute);
  const halloween = datum.getMonth() === 9 && datum.getDate() === 31;
  const regulaerFaellig = !zustand.nextEligible || heute >= zustand.nextEligible;
  const halloweenBonus = halloween && zustand.halloweenAttempt !== heute;

  if (!regulaerFaellig && !halloweenBonus) {
    if (zustand.lastSeen !== heute) {
      const gesehen = { ...zustand, lastSeen: heute };
      if (!sicherSchreiben(storage, schluessel, gesehen)) {
        return ergebnis(false, false, "speicher-schreibfehler", zustand.nextEligible);
      }
    }
    return ergebnis(false, false, "noch-gesperrt", zustand.nextEligible);
  }

  const bonusWaehrendSperre = halloweenBonus && !regulaerFaellig;
  const reserviert = {
    ...zustand,
    lastAttempt: heute,
    nextEligible: bonusWaehrendSperre
      ? zustand.nextEligible
      : addiereLokaleKalendertage(heute, 3),
    halloweenAttempt: halloween ? heute : zustand.halloweenAttempt,
    lastSeen: heute,
  };

  if (!sicherSchreiben(storage, schluessel, reserviert)) {
    return ergebnis(false, false, "speicher-schreibfehler", zustand.nextEligible);
  }

  const rng = typeof zufall === "function" ? zufall : Math.random;
  let zufallswert;
  try {
    zufallswert = rng();
  } catch {
    return ergebnis(false, false, "zufall-fehler", reserviert.nextEligible);
  }
  const getroffen = Number.isFinite(zufallswert) && zufallswert >= 0 && zufallswert < 0.1;

  if (!getroffen) {
    return ergebnis(true, false, bonusWaehrendSperre ? "halloween-fehlwurf" : "fehlwurf", reserviert.nextEligible);
  }

  const trefferZustand = {
    ...reserviert,
    nextEligible: addiereLokaleKalendertage(heute, 5),
  };
  if (!sicherSchreiben(storage, schluessel, trefferZustand)) {
    return ergebnis(true, false, "treffer-nicht-persistiert", reserviert.nextEligible);
  }
  return ergebnis(true, true, halloween ? "halloween-treffer" : "treffer", trefferZustand.nextEligible);
}

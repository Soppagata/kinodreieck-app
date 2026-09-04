/**
 * @typedef {"start"|"kino"|"mediathek"|"streaming"|"finder"|"blog"|"daten"} HilfeZiel
 * @typedef {{
 *   id: HilfeZiel,
 *   titel: string,
 *   kurztext: string,
 *   details: readonly string[],
 *   suchwoerter: readonly string[],
 *   ziel: HilfeZiel,
 * }} HilfeBereich
 * @typedef {{
 *   id: string,
 *   titel: string,
 *   text: string,
 *   suchwoerter: readonly string[],
 *   direkteSuchwoerter: readonly string[],
 *   bereichId: HilfeZiel,
 *   ziel: HilfeZiel,
 * }} HilfeAktion
 */

export const HILFE_ZIELE = Object.freeze([
  "start", "kino", "mediathek", "streaming", "finder", "blog", "daten",
]);

const BEREICH_SCHLUESSEL = Object.freeze([
  "id", "titel", "kurztext", "details", "suchwoerter", "ziel",
]);
const AKTION_SCHLUESSEL = Object.freeze([
  "id", "titel", "text", "suchwoerter", "direkteSuchwoerter", "bereichId", "ziel",
]);
const FALLBACK_SCHLUESSEL = Object.freeze([
  "id", "titel", "text", "bereichId", "ziel",
]);

export function normalisiereHilfeText(wert) {
  return String(wert ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("de-AT")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tiefFrieren(wert) {
  if (!wert || typeof wert !== "object" || Object.isFrozen(wert)) return wert;
  for (const kind of Object.values(wert)) tiefFrieren(kind);
  return Object.freeze(wert);
}

/** @type {HilfeBereich[]} */
const BEREICHE = [
  {
    id: "start",
    titel: "Start",
    kurztext: "Dein persönlicher Überblick über anstehende und zuletzt bearbeitete Filme und Serien.",
    details: [
      "Auf Start bündelt Kinodreieck deine angepinnten Kinotermine, Deine Woche, Must-Watch und zuletzt hinzugefügte Einträge.",
      "Die Karten führen in den jeweils zuständigen Bereich; Änderungen an Filmen und persönlichen Listen nimmst du dort vor.",
    ],
    suchwoerter: ["start", "startseite", "dashboard", "überblick", "deine woche", "zuletzt hinzugefügt"],
    ziel: "start",
  },
  {
    id: "kino",
    titel: "Kino",
    kurztext: "Kinoprogramm filtern, Termine anpinnen und bekannte Filme wiederfinden.",
    details: [
      "Kino zeigt das in Kinodreieck bereitgestellte Programm. Filter grenzen die sichtbaren Termine nach den angebotenen Merkmalen ein.",
      "Mit der Raute vor einer Uhrzeit pinnst du einen Termin an. Angepinnte Termine erscheinen gesammelt und zusätzlich auf Start.",
      "Ein Programmtreffer kann zu einem vorhandenen Mediathek-Eintrag führen oder als eigener Programmeintrag geöffnet werden.",
    ],
    suchwoerter: ["kino", "kinoprogramm", "spielzeit", "vorstellung", "termin", "anpinnen", "kinofilter"],
    ziel: "kino",
  },
  {
    id: "mediathek",
    titel: "Mediathek",
    kurztext: "Eigene Einträge pflegen, auswählen und die aktuell sichtbare Auswahl kontrolliert löschen.",
    details: [
      "Die Mediathek verwaltet deine Filme, Serien, Musik und sonstigen Einträge. Karten öffnen Details und Bearbeitung; neue Einträge legst du direkt im passenden Typ an.",
      "Im Auswahlmodus bleibt die globale Auswahl erhalten, wenn du Suche, Filter, Typ oder Sortierung wechselst. Ein Wechsel zwischen Einträge, Im Besitz und Must-Watch beendet dagegen den Auswahlmodus.",
      "Sichtbare Auswahl löschen betrifft ausschließlich die aktuell sichtbare Schnittmenge der globalen Auswahl. Verborgene ausgewählte Einträge bleiben ausgewählt und werden nicht gelöscht.",
      "Die Vorschau nennt die Folgen für Mediathek-Einträge, Artikelverweise und Must-Watch-Masterlinks, bevor du den Vorgang bestätigst.",
      "Artikel und Must-Watch-Einträge bleiben bestehen. Nur ihre Referenzen beziehungsweise Verknüpfungen zu den gelöschten Mediathek-Einträgen werden gelöst.",
      "Dieser Vorgang ist lokal kompensierend und referenziell fail-safe für genau Mediathek, Artikel und Must-Watch. Er ist keine crash-, server- oder geräteübergreifend atomare beziehungsweise ACID-Transaktion.",
    ],
    suchwoerter: ["mediathek", "eintrag", "auswahl", "sichtbare auswahl", "film bearbeiten", "serie bearbeiten", "mehrfach löschen"],
    ziel: "mediathek",
  },
  {
    id: "streaming",
    titel: "Streaming",
    kurztext: "Verfügbare Titel auf deinen gewählten Diensten ansehen und neue Titel entdecken.",
    details: [
      "Mein Programm zeigt passende bekannte Titel für deine gewählten Streamingdienste. Ein Schnellfilter grenzt die sichtbare Liste auf einen Dienst ein.",
      "Unter Alles findest du weitere Katalogtitel, kannst sie als gesehen markieren oder für später merken.",
      "Welche Streamingdienste berücksichtigt werden, stellst du in Settings unter Streaming-Quellen ein.",
    ],
    suchwoerter: ["streaming", "streamingdienst", "mein programm", "streaming entdecken", "gesehen", "merkliste"],
    ziel: "streaming",
  },
  {
    id: "finder",
    titel: "Suche",
    kurztext: "Filme und App-Hilfe mit einer deterministischen Suche finden.",
    details: [
      "Die Suche wertet Titel sowie erkannte Filter- und Stimmungssignale deterministisch aus und zeigt passende Treffer aus den verfügbaren App-Bereichen.",
      "Konkrete Fragen wie Wo finde ich die Schriftgröße werden ebenfalls deterministisch aus dieser Hilfe beantwortet.",
      "Eine optional aktivierte KI-Deutung ist eine getrennte, bewusst ausgelöste Ergänzung; die normale Suche bleibt davon unabhängig erhalten.",
    ],
    suchwoerter: ["suche", "finder", "filmsuche", "suchanfrage", "stimmung", "app hilfe"],
    ziel: "finder",
  },
  {
    id: "blog",
    titel: "Entdecken",
    kurztext: "Empfehlungen, Radar-Einträge und den eigenen Blog getrennt verwalten.",
    details: [
      "Entdecken trennt Empfehlungen, Radar und Blog in eigene Ansichten.",
      "Im Blog schreibst und verwaltest du eigene Artikel. Verweise können mit Einträgen aus Mediathek oder Must-Watch verbunden sein.",
      "Wird eine solche Verbindung gelöst, bleibt der Artikel bestehen und der offene Verweis kann später erneut zugeordnet werden.",
    ],
    suchwoerter: ["entdecken", "empfehlungen", "radar", "meinungen", "artikel", "blog", "rotlink"],
    ziel: "blog",
  },
  {
    id: "daten",
    titel: "Settings",
    kurztext: "Darstellung, Konto, Sicherung, Quellen und optionale Funktionen einstellen.",
    details: [
      "In Settings verwaltest du Darstellung und Verhalten, optionale KI-Funktionen, dein Geschmacksprofil, Konto und Geräte-Sync, Datenrechte, die Sicherheitskopie dieses Geräts, Streaming-Quellen und Suchvokabular.",
      "Bei einem echten Katalogfehler erscheint dort ausschließlich der begrenzte Bereich Verbindung wiederherstellen.",
      "Die rechtlichen Hinweise bleiben ausschließlich im bestehenden Abschnitt Über & Rechtliches außerhalb dieser Anleitung.",
    ],
    suchwoerter: ["settings", "einstellungen", "darstellung", "konto", "sicherung", "backup", "quellen"],
    ziel: "daten",
  },
];

/** @type {HilfeAktion[]} */
const AKTIONEN = [
  {
    id: "schriftgroesse-aendern",
    titel: "Schriftgröße ändern",
    text: "Öffne Settings → Darstellung & Verhalten → Schriftgröße.",
    suchwoerter: ["schrift", "schriftgröße", "schriftgroesse", "schrift größer", "schrift groesser", "textgröße", "textgroesse"],
    direkteSuchwoerter: ["schriftgröße", "schriftgroesse"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "darstellung-aendern",
    titel: "Darstellung ändern",
    text: "Öffne Settings → Darstellung & Verhalten → Erscheinung.",
    suchwoerter: ["darstellung ändern", "erscheinung", "erscheinung ändern", "theme", "theme ändern", "hell dunkel", "farben ändern"],
    direkteSuchwoerter: ["darstellung ändern", "erscheinung ändern", "theme ändern"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "konto-verwalten",
    titel: "Konto verwalten",
    text: "Öffne Settings → Konto & Geräte-Sync.",
    suchwoerter: ["konto verwalten", "anmelden", "abmelden", "passwort", "geräte sync", "geraete sync"],
    direkteSuchwoerter: ["konto verwalten", "geräte sync", "geraete sync"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "daten-sichern",
    titel: "Daten sichern",
    text: "Öffne Settings → Sicherheitskopie dieses Geräts.",
    suchwoerter: ["backup", "sicherung", "daten sichern", "gesamt backup", "backup erstellen", "sicherung erstellen"],
    direkteSuchwoerter: ["daten sichern", "gesamt backup", "backup erstellen", "sicherung erstellen"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "datenrechte-anfragen",
    titel: "Datenrechte anfragen",
    text: "Öffne Settings → Über & Rechtliches → Datenschutz & Datenübersicht. Der Kontoexport ist in diesem Release kein Self-Service. Für Auskunft, Berichtigung, Übertragbarkeit oder Kontolöschung nutzt du den privaten Kontaktweg, über den du deinen Zugang von Max erhalten hast; die App veröffentlicht keine private Adresse und versendet nichts automatisch.",
    suchwoerter: ["datenrechte", "betroffenenrechte", "kontoexport", "auskunft anfragen", "daten übertragen", "kontodaten löschen", "kontoloeschung anfragen"],
    direkteSuchwoerter: ["datenrechte", "betroffenenrechte", "kontoexport"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "streamingdienste-waehlen",
    titel: "Streamingdienste wählen",
    text: "Öffne Settings → Streaming-Quellen.",
    suchwoerter: ["streamingdienst", "streamingdienste", "netflix", "prime", "streamingdienste wählen", "streamingdienste waehlen", "streaming quellen", "dienst auswählen", "dienst auswaehlen", "abo einstellen"],
    direkteSuchwoerter: ["streamingdienste wählen", "streamingdienste waehlen", "streaming quellen", "dienst auswählen", "dienst auswaehlen", "abo einstellen"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "ki-funktionen-einstellen",
    titel: "KI-Funktionen einstellen",
    text: "Öffne Settings → KI-Funktionen. Dort steuerst du die optionalen KI-Funktionen der App.",
    suchwoerter: ["ki funktionen", "ki einstellen", "prognose", "prognose einstellen", "filmwissen", "filmwissen einstellen", "deutung", "ki deutung"],
    direkteSuchwoerter: ["ki funktionen", "ki einstellen", "prognose einstellen", "filmwissen einstellen", "ki deutung"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "suchvokabular-verwalten",
    titel: "Eigenes Suchvokabular",
    text: "Öffne Settings → KI-Vokabular.",
    suchwoerter: ["eigenes suchvokabular", "suchvokabular", "vokabular", "stimmung", "stimmungswort", "suchwort", "suchwort speichern"],
    direkteSuchwoerter: ["eigenes suchvokabular", "suchvokabular", "suchwort speichern"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "startbereich-waehlen",
    titel: "Startbereich wählen",
    text: "Öffne Settings → Darstellung & Verhalten → Startbereich.",
    suchwoerter: ["startbereich", "startseite", "dashboard", "startbereich wählen", "startbereich waehlen", "startseite einstellen", "dashboard einstellen"],
    direkteSuchwoerter: ["startbereich", "startbereich wählen", "startbereich waehlen", "startseite einstellen", "dashboard einstellen"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "daten-importieren",
    titel: "Datenimport im Privatrelease",
    text: "Ein Rohdatenimport ist in diesem Privatrelease nicht freigeschaltet. Neue Einträge legst du direkt in der Mediathek an; für die Sicherung nutzt du Settings → Sicherheitskopie dieses Geräts.",
    suchwoerter: ["import", "masterliste", "programmdatei", "daten importieren", "masterliste importieren", "datei einlesen"],
    direkteSuchwoerter: ["daten importieren", "masterliste importieren", "datei einlesen"],
    bereichId: "daten",
    ziel: "daten",
  },
  {
    id: "eintrag-erstellen",
    titel: "Neuen Eintrag erstellen",
    text: "Öffne die Mediathek und wähle im passenden Typ + Eintrag hinzufügen.",
    suchwoerter: ["hinzufügen", "hinzufuegen", "neuen eintrag", "eintrag erstellen", "eintrag anlegen", "eintrag hinzufügen", "eintrag hinzufuegen", "film hinzufügen", "film hinzufuegen"],
    direkteSuchwoerter: ["eintrag erstellen", "eintrag anlegen", "eintrag hinzufügen", "eintrag hinzufuegen", "film hinzufügen", "film hinzufuegen"],
    bereichId: "mediathek",
    ziel: "mediathek",
  },
  {
    id: "eintrag-loeschen",
    titel: "Mediathek-Eintrag löschen",
    text: "Öffne den Eintrag in der Mediathek und wähle Eintrag löschen.",
    suchwoerter: ["löschen", "loeschen", "eintrag löschen", "eintrag loeschen", "eintrag entfernen", "film löschen", "film loeschen"],
    direkteSuchwoerter: ["eintrag löschen", "eintrag loeschen", "eintrag entfernen", "film löschen", "film loeschen"],
    bereichId: "mediathek",
    ziel: "mediathek",
  },
  {
    id: "sichtbare-auswahl-loeschen",
    titel: "Sichtbare Auswahl löschen",
    text: "Starte in der Mediathek den Auswahlmodus und wähle Sichtbare Auswahl löschen. Nur die beim Öffnen sichtbare Schnittmenge wird nach einer Folgenvorschau bestätigt gelöscht; verborgene Auswahl bleibt bestehen.",
    suchwoerter: ["sichtbare auswahl löschen", "sichtbare auswahl loeschen", "mehrere einträge löschen", "mehrere eintraege loeschen", "mehrfach löschen", "mehrfach loeschen"],
    direkteSuchwoerter: ["sichtbare auswahl löschen", "sichtbare auswahl loeschen", "mehrere einträge löschen", "mehrere eintraege loeschen"],
    bereichId: "mediathek",
    ziel: "mediathek",
  },
  {
    id: "gesehen-markieren",
    titel: "Gesehen markieren",
    text: "Öffne Streaming → Alles und markiere den Titel dort als gesehen.",
    suchwoerter: ["gesehen", "erledigt", "gesehen markieren", "als gesehen", "erledigt markieren"],
    direkteSuchwoerter: ["gesehen markieren", "erledigt markieren"],
    bereichId: "streaming",
    ziel: "streaming",
  },
];

const FALLBACK = {
  id: "allgemeine-hilfe",
  titel: "Kinodreieck kurz erklärt",
  text: "Kinodreieck bündelt Kinoprogramm, deine Mediathek und Streaming in einer App. Entdecken zeigt Empfehlungen und Radar-Neuigkeiten; die Suche findet Filme und beantwortet Fragen zur App. Einstellungen, Konto, Quellen und optionale KI-Funktionen verwaltest du in Settings. Die Anleitung ist mobil direkt im Menü als Anleitung & Hilfe erreichbar und bleibt zusätzlich in Settings verfügbar.",
  bereichId: "daten",
  ziel: "daten",
};

function istEinfachesObjekt(wert) {
  return !!wert && typeof wert === "object" && !Array.isArray(wert)
    && Object.getPrototypeOf(wert) === Object.prototype;
}

function pruefeSchluessel(objekt, erwartet, art) {
  const wirklich = Object.keys(objekt).sort();
  const soll = [...erwartet].sort();
  if (wirklich.length !== soll.length || wirklich.some((key, index) => key !== soll[index])) {
    throw new TypeError(`${art}: unbekannte oder fehlende Felder`);
  }
}

function pruefeText(wert, feld) {
  if (typeof wert !== "string" || !wert.trim() || /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(wert)) {
    throw new TypeError(`${feld}: erwarteter sicherer, nichtleerer Text`);
  }
}

function pruefeTextListe(liste, feld, { normalisiert = false } = {}) {
  if (!Array.isArray(liste) || liste.length === 0) {
    throw new TypeError(`${feld}: erwartete nichtleere Textliste`);
  }
  const gesehen = new Set();
  for (const [index, wert] of liste.entries()) {
    pruefeText(wert, `${feld}[${index}]`);
    const norm = normalisiereHilfeText(wert);
    if (!norm || (normalisiert && norm !== wert) || gesehen.has(norm)) {
      throw new TypeError(`${feld}[${index}]: Suchwort nicht eindeutig normalisiert`);
    }
    gesehen.add(norm);
  }
}

export function validiereHilfeInhalte() {
  const erlaubteZiele = new Set(HILFE_ZIELE);
  const bereichIds = new Set();
  if (!Array.isArray(BEREICHE) || BEREICHE.length !== HILFE_ZIELE.length) {
    throw new TypeError("Hilfe-Bereiche: unerwartete Anzahl");
  }
  for (const [index, bereich] of BEREICHE.entries()) {
    if (!istEinfachesObjekt(bereich)) throw new TypeError(`Bereich ${index}: erwartetes Objekt`);
    pruefeSchluessel(bereich, BEREICH_SCHLUESSEL, `Bereich ${index}`);
    pruefeText(bereich.id, `Bereich ${index}.id`);
    pruefeText(bereich.titel, `Bereich ${index}.titel`);
    pruefeText(bereich.kurztext, `Bereich ${index}.kurztext`);
    pruefeTextListe(bereich.details, `Bereich ${index}.details`);
    pruefeTextListe(bereich.suchwoerter, `Bereich ${index}.suchwoerter`, { normalisiert: true });
    if (!erlaubteZiele.has(bereich.ziel) || bereich.id !== bereich.ziel || bereichIds.has(bereich.id)) {
      throw new TypeError(`Bereich ${index}: ungültige oder doppelte ID/Ziel-Referenz`);
    }
    bereichIds.add(bereich.id);
  }
  if (HILFE_ZIELE.some((ziel, index) => BEREICHE[index]?.id !== ziel)) {
    throw new TypeError("Hilfe-Bereiche: Quellreihenfolge ist nicht stabil");
  }

  const aktionsIds = new Set();
  const direkteSuchwoerter = new Set();
  for (const [index, aktion] of AKTIONEN.entries()) {
    if (!istEinfachesObjekt(aktion)) throw new TypeError(`Aktion ${index}: erwartetes Objekt`);
    pruefeSchluessel(aktion, AKTION_SCHLUESSEL, `Aktion ${index}`);
    pruefeText(aktion.id, `Aktion ${index}.id`);
    pruefeText(aktion.titel, `Aktion ${index}.titel`);
    pruefeText(aktion.text, `Aktion ${index}.text`);
    pruefeTextListe(aktion.suchwoerter, `Aktion ${index}.suchwoerter`, { normalisiert: true });
    pruefeTextListe(aktion.direkteSuchwoerter, `Aktion ${index}.direkteSuchwoerter`, { normalisiert: true });
    if (aktion.direkteSuchwoerter.length >= aktion.suchwoerter.length) {
      throw new TypeError(`Aktion ${index}.direkteSuchwoerter: erwartete echte Teilmenge`);
    }
    for (const suchwort of aktion.direkteSuchwoerter) {
      if (!aktion.suchwoerter.includes(suchwort)) {
        throw new TypeError(`Aktion ${index}.direkteSuchwoerter: unbekannter Suchbegriff`);
      }
      if (direkteSuchwoerter.has(suchwort)) {
        throw new TypeError(`Aktion ${index}.direkteSuchwoerter: Kollision zwischen Aktionen`);
      }
      direkteSuchwoerter.add(suchwort);
    }
    if (aktionsIds.has(aktion.id) || !bereichIds.has(aktion.bereichId)
        || aktion.ziel !== aktion.bereichId) {
      throw new TypeError(`Aktion ${index}: ungültige ID oder Bereichs-/Zielreferenz`);
    }
    aktionsIds.add(aktion.id);
  }

  if (!istEinfachesObjekt(FALLBACK)) throw new TypeError("Fallback: erwartetes Objekt");
  pruefeSchluessel(FALLBACK, FALLBACK_SCHLUESSEL, "Fallback");
  for (const feld of ["id", "titel", "text", "bereichId", "ziel"]) {
    pruefeText(FALLBACK[feld], `Fallback.${feld}`);
  }
  if (!bereichIds.has(FALLBACK.bereichId) || FALLBACK.ziel !== FALLBACK.bereichId
      || aktionsIds.has(FALLBACK.id) || bereichIds.has(FALLBACK.id)) {
    throw new TypeError("Fallback: ungültige ID oder Bereichs-/Zielreferenz");
  }
  return true;
}

validiereHilfeInhalte();

export const HILFE_BEREICHE = tiefFrieren(BEREICHE);
export const HILFE_AKTIONEN = tiefFrieren(AKTIONEN);
export const HILFE_FALLBACK = tiefFrieren(FALLBACK);

export function holeHilfeBereich(id) {
  return HILFE_BEREICHE.find((bereich) => bereich.id === id) || null;
}

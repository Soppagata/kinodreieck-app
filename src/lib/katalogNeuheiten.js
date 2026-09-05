/* Katalog-Neuheiten — deterministischer Diff, kein LLM, kein Netzwerk.
   ===================================================================
   Beantwortet genau eine Frage: Was ist seit dem letzten Katalogstand
   neu dazugekommen?

   Zwei Arten von "neu", getrennt gehalten (Entscheidung 09.08.2026,
   ENTSCHEIDUNGSLOG: Neuveröffentlichung und neue Dienstverfügbarkeit
   sind nicht dasselbe Ereignis):

     "neu"     Die watchmode_id war im Katalog vorher nicht vorhanden.
     "dienst"  Der Titel war bekannt, ist jetzt aber auf einem Dienst
               verfügbar, auf dem er vorher nicht war.

   Bewusste Grenzen, ehrlich benannt:
   - Der Diff sieht nur, was der AT-Katalog führt. Was Watchmode nicht
     kennt, existiert hier nicht.
   - Neue STAFFELN einer bereits bekannten Serie erkennt er NICHT. Dafür
     bräuchte es `staffeln_verfuegbar`/`folgen_verfuegbar` im Katalog;
     diese Felder sind derzeit bei allen 3.627 Serien leer. Eine neue
     Serie mit eigener watchmode_id wird dagegen gefunden.
   - Der erste Lauf meldet nichts. Er setzt still die Basis, genau wie
     `setzeSerienBeobachtung` beim Anhaken den Staffelstand einfriert.
     Ohne diese Regel wäre der erste Blick 12.540 "Neuheiten".

   Die Basis ist ein abgeleiteter Gerätecache, kein persönlicher Topf:
   Sie enthält keine Nutzeraussage, nur den zuletzt gesehenen
   Katalogzustand. Sie gehört deshalb nicht in die Kontosynchronisation. */

export const KATALOG_BASIS_VERSION = 1;
export const NEUHEITEN_FENSTER_TAGE = 30;
export const NEUHEITEN_MAX = 300;

function text(wert) { return String(wert == null ? "" : wert).trim(); }
function liste(wert) { return Array.isArray(wert) ? wert : []; }

/* Bewusst dieselbe Normalisierung wie `selectedServiceSet`/`matchingServices`
   in entdeckenUi.js. Ein zweiter, abweichender Dienstvergleich wäre eine
   stille Fehlerquelle: Der Katalog schreibt "Prime Video", die Auswahl im
   Zweifel "prime video". */
function normiert(wert) { return text(wert).toLocaleLowerCase("de-AT"); }

function ganzzahlPositiv(wert) {
  const zahl = Number(wert);
  return Number.isInteger(zahl) && zahl > 0 ? zahl : null;
}

export function kalendertag(wert) {
  const datum = wert instanceof Date ? wert : new Date(wert);
  if (!Number.isFinite(datum.getTime())) return null;
  const pad = (zahl) => String(zahl).padStart(2, "0");
  return `${datum.getFullYear()}-${pad(datum.getMonth() + 1)}-${pad(datum.getDate())}`;
}

function tageDazwischen(vonTag, bisTag) {
  const von = Date.parse(`${vonTag}T00:00:00.000Z`);
  const bis = Date.parse(`${bisTag}T00:00:00.000Z`);
  if (!Number.isFinite(von) || !Number.isFinite(bis)) return null;
  return Math.round((bis - von) / 86_400_000);
}

/* Dienstnamen werden einmal in ein Wörterbuch gelegt und danach nur noch
   als Index gespeichert. Das hält die Basis klein genug für den lokalen
   Speicher, ohne dass ein Hash Kollisionen einschleppen könnte. */
function dienstIndex(woerterbuch, name) {
  const sauber = text(name);
  if (!sauber) return null;
  let index = woerterbuch.indexOf(sauber);
  if (index < 0) { woerterbuch.push(sauber); index = woerterbuch.length - 1; }
  return index;
}

function dienstSchluessel(dienste, woerterbuch) {
  const indizes = [];
  for (const name of liste(dienste)) {
    const index = dienstIndex(woerterbuch, name);
    if (index != null && !indizes.includes(index)) indizes.push(index);
  }
  return indizes.sort((a, b) => a - b).join(",");
}

function katalogZeilen(katalog) {
  const zeilen = new Map();
  for (const zeile of liste(katalog?.titel)) {
    const id = ganzzahlPositiv(zeile?.watchmode_id);
    if (id == null || !text(zeile?.titel)) continue;
    zeilen.set(id, zeile);
  }
  return zeilen;
}

export function erstelleKatalogBasis(katalog, { heute = kalendertag(new Date()) } = {}) {
  const woerterbuch = [];
  const eintraege = {};
  for (const [id, zeile] of katalogZeilen(katalog)) {
    eintraege[id] = dienstSchluessel(zeile.dienste, woerterbuch);
  }
  return Object.freeze({
    version: KATALOG_BASIS_VERSION,
    gesetztAm: heute,
    stand: text(katalog?.katalog_stand || katalog?.stand) || null,
    region: text(katalog?.region) || null,
    dienste: Object.freeze([...woerterbuch]),
    eintraege,
  });
}

export function istGueltigeBasis(basis) {
  return !!basis && typeof basis === "object" && !Array.isArray(basis)
    && basis.version === KATALOG_BASIS_VERSION
    && Array.isArray(basis.dienste)
    && !!basis.eintraege && typeof basis.eintraege === "object" && !Array.isArray(basis.eintraege);
}

/* Der Vergleich läuft immer über den GANZEN Katalog, nie über die
   Dienstewahl. Sonst würde das Anhaken eines neuen Abos schlagartig
   tausende Titel als "neu" melden, die längst da waren. Gefiltert wird
   erst bei der Anzeige. */
export function vergleicheKatalog(basis, katalog, { heute = kalendertag(new Date()) } = {}) {
  const zeilen = katalogZeilen(katalog);
  if (!zeilen.size) {
    return Object.freeze({ status: "kein-katalog", basis, funde: Object.freeze([]) });
  }
  const neueBasis = erstelleKatalogBasis(katalog, { heute });
  if (!istGueltigeBasis(basis)) {
    return Object.freeze({ status: "basis-gesetzt", basis: neueBasis, funde: Object.freeze([]) });
  }

  const alteDienste = liste(basis.dienste);
  const funde = [];
  for (const [id, zeile] of zeilen) {
    const alterSchluessel = basis.eintraege[id];
    const jetztDienste = liste(zeile.dienste).map(text).filter(Boolean);

    if (alterSchluessel === undefined) {
      funde.push({
        watchmodeId: id,
        titel: text(zeile.titel),
        jahr: ganzzahlPositiv(zeile.jahr),
        typ: text(zeile.typ) || null,
        art: "neu",
        dienste: jetztDienste,
        neueDienste: jetztDienste,
        gefundenAm: heute,
      });
      continue;
    }

    const vorherNamen = new Set(
      text(alterSchluessel) === "" ? []
        : text(alterSchluessel).split(",").map((index) => alteDienste[Number(index)]).filter(Boolean),
    );
    const dazu = jetztDienste.filter((name) => !vorherNamen.has(name));
    if (dazu.length) {
      funde.push({
        watchmodeId: id,
        titel: text(zeile.titel),
        jahr: ganzzahlPositiv(zeile.jahr),
        typ: text(zeile.typ) || null,
        art: "dienst",
        dienste: jetztDienste,
        neueDienste: dazu,
        gefundenAm: heute,
      });
    }
  }

  funde.sort((links, rechts) => (
    links.titel.localeCompare(rechts.titel, "de-AT") || links.watchmodeId - rechts.watchmodeId
  ));
  return Object.freeze({
    status: funde.length ? "funde" : "keine-aenderung",
    basis: neueBasis,
    funde: Object.freeze(funde.map((fund) => Object.freeze(fund))),
  });
}

/* Neue Funde vorne, alte fallen nach dem Fenster heraus. Ein Titel wird
   nur einmal geführt: der erste Fund gewinnt, damit ein Dienstwechsel
   einen echten Neuzugang nicht verdrängt. */
export function fuehreNeuheitenFort(bisher, funde, {
  heute = kalendertag(new Date()), tage = NEUHEITEN_FENSTER_TAGE, max = NEUHEITEN_MAX,
} = {}) {
  const nachId = new Map();
  for (const eintrag of liste(bisher)) {
    const id = ganzzahlPositiv(eintrag?.watchmodeId);
    if (id != null && !nachId.has(id)) nachId.set(id, eintrag);
  }
  for (const fund of liste(funde)) {
    if (!nachId.has(fund.watchmodeId)) nachId.set(fund.watchmodeId, fund);
  }
  return Object.freeze([...nachId.values()]
    .filter((eintrag) => {
      const alter = tageDazwischen(text(eintrag?.gefundenAm), heute);
      return alter != null && alter >= 0 && alter <= tage;
    })
    .sort((links, rechts) => (
      rechts.gefundenAm.localeCompare(links.gefundenAm)
      || links.titel.localeCompare(rechts.titel, "de-AT")
    ))
    .slice(0, max)
    .map((eintrag) => Object.freeze({ ...eintrag })));
}

function istGesehen(status) {
  if (typeof status === "string") return status === "gesehen";
  return !!status && typeof status === "object" && status.status === "gesehen";
}

/* Erst hier wirkt die Dienstewahl. `dienste` leer bedeutet: kein Filter. */
export function waehleNeuheiten(neuheiten, {
  dienste = [], entdeckenStatus = {}, typ = "alle", limit = 0,
} = {}) {
  const gewaehlt = new Set(liste(dienste).map(normiert).filter(Boolean));
  const gefiltert = liste(neuheiten).filter((eintrag) => {
    if (istGesehen(entdeckenStatus?.[eintrag.watchmodeId])) return false;
    if (typ === "serie" && !["tv_series", "serie"].includes(text(eintrag.typ))) return false;
    if (typ === "film" && ["tv_series", "serie"].includes(text(eintrag.typ))) return false;
    if (!gewaehlt.size) return true;
    const relevante = eintrag.art === "dienst" ? eintrag.neueDienste : eintrag.dienste;
    return liste(relevante).some((name) => gewaehlt.has(normiert(name)));
  });
  return Object.freeze((limit > 0 ? gefiltert.slice(0, limit) : gefiltert)
    .map((eintrag) => Object.freeze({ ...eintrag })));
}

export function zaehleNeuheiten(neuheiten, optionen = {}) {
  const treffer = waehleNeuheiten(neuheiten, { ...optionen, limit: 0 });
  return Object.freeze({
    gesamt: treffer.length,
    neu: treffer.filter((eintrag) => eintrag.art === "neu").length,
    dienst: treffer.filter((eintrag) => eintrag.art === "dienst").length,
    serien: treffer.filter((eintrag) => ["tv_series", "serie"].includes(text(eintrag.typ))).length,
  });
}

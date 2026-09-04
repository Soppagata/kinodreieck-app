/* Persönlicher Wochenplan: reine, zeitzonenfeste Kalenderlogik. */

import { viennaCalendarDay as wienerKalendertag } from "./mustwatch.js";

export const WOCHENTAGE = Object.freeze([
  { nr: 1, kurz: "Mo", name: "Montag" },
  { nr: 2, kurz: "Di", name: "Dienstag" },
  { nr: 3, kurz: "Mi", name: "Mittwoch" },
  { nr: 4, kurz: "Do", name: "Donnerstag" },
  { nr: 5, kurz: "Fr", name: "Freitag" },
  { nr: 6, kurz: "Sa", name: "Samstag" },
  { nr: 7, kurz: "So", name: "Sonntag" },
]);

export const LEERER_WOCHENPLAN = Object.freeze({ version: 1, eintraege: [] });

export const WOCHENPLAN_ARTEN = Object.freeze(["folge", "staffel", "kino", "termin", "konzert"]);

export function artHatUhrzeit(art) {
  return ["kino", "termin", "konzert"].includes(art);
}

export function normalisiereReminderJahr(wert, jetzt = new Date()) {
  if (wert === "" || wert == null) return null;
  const jahr = Number(wert);
  const maxJahr = new Date(jetzt).getFullYear() + 5;
  return Number.isInteger(jahr) && jahr >= 1870 && jahr <= maxJahr ? jahr : null;
}

/* Derselbe vollständige, unbewertete Serien-Datensatz wie bei einer regulären
   Mediathek-Anlage. Ohne belastbares Jahr gibt es bewusst keinen Kandidaten:
   die stabile Master-ID besteht aus Titel und Jahr. */
export function mediathekEintragAusReminder(reminder, jetzt = new Date()) {
  const titel = String(reminder?.titel || "").trim();
  const jahr = normalisiereReminderJahr(reminder?.jahr, jetzt);
  if (!titel || !jahr || !["folge", "staffel"].includes(reminder?.art)) return null;
  return {
    titel,
    originaltitel: titel,
    jahr,
    jahr_bis: null,
    typ: "serie",
    quelle: "must_watch",
    kategorie: null,
    bewertet_von: null,
    bewertung: null,
    genre: [],
    tags: [],
    begruendung: "",
    notiz: "",
    status: "gesetzt",
    ...(reminder?.ref?.watchmode_id != null ? { watchmode_id: reminder.ref.watchmode_id } : {}),
  };
}

const TAG_MS = 86400000;

function zwei(n) { return String(n).padStart(2, "0"); }

export function datumLokal(datum = new Date()) {
  const d = datum instanceof Date ? datum : new Date(datum);
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

export function lokalesDatum(wert) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(wert || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return datumLokal(d) === wert ? d : null;
}

export function wochentagFuerDatum(wert) {
  const datum = lokalesDatum(wert);
  return datum ? (datum.getDay() || 7) : null;
}

export function montagDerWoche(datum = new Date()) {
  const d = new Date(datum);
  d.setHours(12, 0, 0, 0);
  const tag = d.getDay() || 7;
  d.setDate(d.getDate() - tag + 1);
  return d;
}

export function datumPlusTage(datum, tage) {
  const d = new Date(datum);
  d.setDate(d.getDate() + Number(tage || 0));
  return d;
}

function eindeutigeWochentage(wert, fallback = 1) {
  const roh = Array.isArray(wert) ? wert : [wert ?? fallback];
  const tage = [...new Set(roh.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))];
  return tage.length ? tage.sort((a, b) => a - b) : [fallback];
}

function rhythmus(wert) {
  const n = Number(wert);
  return Number.isInteger(n) && n >= 1 && n <= 52 ? n : 1;
}

function normalisiereEnde(ende) {
  if (!ende || typeof ende !== "object" || !["datum", "anzahl"].includes(ende.typ)) return { typ: "nie" };
  if (ende.typ === "datum" && lokalesDatum(ende.datum)) return { typ: "datum", datum: ende.datum };
  const anzahl = Number(ende.anzahl);
  if (ende.typ === "anzahl" && Number.isInteger(anzahl) && anzahl >= 1) return { typ: "anzahl", anzahl };
  return { typ: "nie" };
}

export function normalisiereWochenplan(roh, jetzt = new Date()) {
  const liste = Array.isArray(roh) ? roh : (roh && Array.isArray(roh.eintraege) ? roh.eintraege : []);
  const heute = datumLokal(jetzt);
  const ids = new Set();
  const eintraege = [];
  for (const e of liste) {
    if (!e || typeof e !== "object" || !String(e.titel || "").trim()) continue;
    let id = String(e.id || `folge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    while (ids.has(id)) id += "x";
    ids.add(id);
    const art = WOCHENPLAN_ARTEN.includes(e.art) ? e.art : "folge";
    const startdatum = lokalesDatum(e.startdatum) ? e.startdatum : heute;
    const jahr = normalisiereReminderJahr(e.jahr, jetzt);
    const uhrzeit = artHatUhrzeit(art) && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(e.uhrzeit || ""))
      ? String(e.uhrzeit)
      : "";
    const ref = e.ref && typeof e.ref === "object"
      ? Object.fromEntries(Object.entries(e.ref).filter(([, v]) => v !== "" && v != null))
      : null;
    eintraege.push({
      id,
      art,
      titel: String(e.titel).trim(),
      ...(jahr ? { jahr } : {}),
      plattform: String(e.plattform || "").trim(),
      wochentage: eindeutigeWochentage(e.wochentage ?? e.wochentag),
      intervall_wochen: rhythmus(e.intervall_wochen ?? e.rhythmus),
      startdatum,
      uhrzeit,
      ende: normalisiereEnde(e.ende),
      notiz: String(e.notiz || "").trim(),
      ref: ref && Object.keys(ref).length ? ref : null,
      link_modus: ["auto", "manuell", "keiner"].includes(e.link_modus) ? e.link_modus : "auto",
      aktiv: e.aktiv !== false,
      erstellt_am: e.erstellt_am || jetzt.toISOString(),
      geaendert_am: e.geaendert_am || jetzt.toISOString(),
    });
  }
  return { version: 1, eintraege };
}

export function neuerFolgenReminder(felder = {}, jetzt = new Date()) {
  return normalisiereWochenplan({ eintraege: [{
    ...felder,
    id: felder.id || `folge_${jetzt.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    art: felder.art || "folge",
    startdatum: felder.startdatum || datumLokal(jetzt),
  }] }, jetzt).eintraege[0] || null;
}

function tageZwischen(a, b) {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
    - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / TAG_MS);
}

export function vorkommnisIndex(eintrag, datum) {
  const ziel = lokalesDatum(typeof datum === "string" ? datum : datumLokal(datum));
  const start = lokalesDatum(eintrag && eintrag.startdatum);
  if (!ziel || !start || ziel < start) return -1;
  const tage = eindeutigeWochentage(eintrag.wochentage);
  const startWoche = montagDerWoche(start);
  const zielWoche = montagDerWoche(ziel);
  const wochen = Math.round(tageZwischen(startWoche, zielWoche) / 7);
  if (wochen < 0 || wochen % rhythmus(eintrag.intervall_wochen) !== 0) return -1;
  const wochentag = ziel.getDay() || 7;
  if (!tage.includes(wochentag)) return -1;

  let index = 0;
  for (let w = 0; w <= wochen; w += rhythmus(eintrag.intervall_wochen)) {
    const montag = datumPlusTage(startWoche, w * 7);
    for (const tag of tage) {
      const kandidat = datumPlusTage(montag, tag - 1);
      if (kandidat < start) continue;
      if (datumLokal(kandidat) === datumLokal(ziel)) return index;
      index++;
    }
  }
  return -1;
}

export function reminderFaellig(eintrag, datum = new Date()) {
  if (!eintrag || eintrag.aktiv === false) return false;
  const ziel = lokalesDatum(typeof datum === "string" ? datum : datumLokal(datum));
  if (!ziel) return false;
  const index = vorkommnisIndex(eintrag, ziel);
  if (index < 0) return false;
  const ende = normalisiereEnde(eintrag.ende);
  if (ende.typ === "datum" && ziel > lokalesDatum(ende.datum)) return false;
  if (ende.typ === "anzahl" && index >= ende.anzahl) return false;
  return true;
}

export function tageDerWoche(wochenstart = new Date()) {
  const montag = montagDerWoche(wochenstart);
  return WOCHENTAGE.map((tag, index) => ({ ...tag, datum: datumPlusTage(montag, index), iso: datumLokal(datumPlusTage(montag, index)) }));
}

/* Das Dashboard ist kein Wochenkalender mit blätterbaren Kalenderwochen,
   sondern ein stets aktueller Sieben-Tage-Ausblick: heute zuerst, danach die
   sechs tatsächlich folgenden Kalendertage (auch über Monats-/Jahresgrenzen). */
export function naechsteSiebenTage(ab = new Date()) {
  const start = typeof ab === "string" ? (lokalesDatum(ab) || new Date(NaN)) : new Date(ab);
  start.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const datum = datumPlusTage(start, index);
    const nr = datum.getDay() || 7;
    const tag = WOCHENTAGE.find((eintrag) => eintrag.nr === nr);
    return { ...tag, datum, iso: datumLokal(datum) };
  });
}

function titelNormiert(wert) {
  return String(wert || "").toLocaleLowerCase("de").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function anbieterWerte(titel) {
  const werte = [
    titel?.plattform, titel?.anbieter, titel?.kino,
    ...(Array.isArray(titel?.kinos) ? titel.kinos : []),
    ...(Array.isArray(titel?.k) ? titel.k : []),
    ...(Array.isArray(titel?.dienste) ? titel.dienste : []),
  ];
  return [...new Set(werte.map(titelNormiert).filter(Boolean))];
}

export function findeReminderVerknuepfung(reminder, katalog = [], master = []) {
  const alle = [...(Array.isArray(katalog) ? katalog : []), ...(Array.isArray(master) ? master : [])];
  const dedupe = new Map();
  for (const t of alle) {
    if (!t || typeof t !== "object") continue;
    const titel = titelNormiert(t.titel || t.originaltitel);
    if (t.watchmode_id == null && t.id == null && !titel) continue;
    const key = t.watchmode_id != null ? `w:${t.watchmode_id}`
      : t.id != null ? `m:${t.id}` : `t:${t.typ || ""}:${titel}:${t.jahr || ""}`;
    dedupe.set(key, { ...(dedupe.get(key) || {}), ...t });
  }
  const liste = [...dedupe.values()];
  const ref = reminder && reminder.ref;
  const stark = liste.filter((t) => (
    ref?.watchmode_id != null && t.watchmode_id != null && String(ref.watchmode_id) === String(t.watchmode_id)
  ) || (ref?.master_id != null && t.id != null && String(ref.master_id) === String(t.id)));
  if (stark.length === 1) return { status: "eindeutig", treffer: stark[0], grund: "starke-id" };

  const titel = titelNormiert(reminder && reminder.titel);
  if (!titel) return { status: "kein-treffer", treffer: null };
  let exakt = liste.filter((t) => {
    if (titelNormiert(t.titel) !== titel && titelNormiert(t.originaltitel) !== titel) return false;
    return !reminder.jahr || !t.jahr || Number(reminder.jahr) === Number(t.jahr);
  });
  const anbieter = titelNormiert(reminder && reminder.plattform);
  if (anbieter) {
    const beimAnbieter = exakt.filter((t) => anbieterWerte(t).includes(anbieter));
    if (beimAnbieter.length) exakt = beimAnbieter;
  }
  if (exakt.length === 1) return { status: "eindeutig", treffer: exakt[0], grund: "exakter-titel" };
  if (exakt.length > 1) return { status: "mehrdeutig", treffer: null, kandidaten: exakt };
  return { status: "kein-treffer", treffer: null };
}

function streamingTitelFuerReminder(reminder, katalog = []) {
  const liste = Array.isArray(katalog) ? katalog : [];
  if (reminder?.art !== "folge" && reminder?.art !== "staffel") return liste;
  return liste.filter((titel) => {
    const typ = titelNormiert(titel?.typ);
    return !typ || ["tv series", "serie", "staffel", "folge"].includes(typ);
  });
}

function streamingZiel(treffer, fallbackBereich = "entdecken") {
  const bereich = treffer?.wochen_bereich || fallbackBereich || "entdecken";
  const ref = bereich === "programm"
    ? (treffer?.id ?? treffer?.watchmode_id)
    : (treffer?.watchmode_id ?? treffer?.id);
  return ref == null ? null : { art: "streaming", bereich, ref };
}

function kinoProgrammRef(treffer) {
  return treffer?.programm_ref ?? treffer?.prog_ref ?? treffer?.id ?? null;
}

function externeReminderUrl(ref) {
  if (!ref?.url) return null;
  try {
    const url = new URL(String(ref.url));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/* Ein persönlicher Reminder gehört dem Nutzer, nicht dem Katalog. Fehlt sein
   verknüpftes Ziel vorübergehend oder dauerhaft, bleibt der Termin deshalb
   sichtbar; nur die Zielaktion fällt weg. Echte Kinoprogramm-Pins werden
   getrennt verarbeitet und dürfen nach Ablauf weiterhin verschwinden. */
function fehlendeReminderQuelle(ref) {
  const url = externeReminderUrl(ref);
  return {
    quelle: null,
    ziel: url ? { art: "extern", url } : null,
    abgelaufen: false,
    verknuepfungFehlt: true,
  };
}

/* Beim Speichern wird nur innerhalb des fachlich gewählten Pools verknüpft.
   `auto` unterscheidet den eindeutigen Titelabgleich von einer bewussten Wahl;
   jede tatsächlich gespeicherte Katalog-Referenz läuft mit ihrem Ziel ab. */
export function automatischeReminderRef(reminder, { kinoKatalog = [], katalog = [], master = [] } = {}, jetzt = new Date()) {
  if (!reminder || typeof reminder !== "object") return null;
  const probe = { ...reminder, ref: null };
  if (probe.art === "kino") {
    const treffer = findeReminderVerknuepfung(probe, kinoKatalog, []).treffer;
    const ref = kinoProgrammRef(treffer);
    return ref != null ? { kino_programm_id: ref, auto: true } : null;
  }
  if (probe.art === "folge" || probe.art === "staffel") {
    const treffer = findeReminderVerknuepfung(probe, streamingTitelFuerReminder(probe, katalog), []).treffer;
    return treffer?.watchmode_id != null
      ? { watchmode_id: treffer.watchmode_id, streaming_art: treffer.wochen_bereich || "entdecken", auto: true }
      : null;
  }
  const treffer = findeReminderVerknuepfung(probe, [], master).treffer;
  return treffer?.id != null ? { master_id: treffer.id, auto: true } : null;
}

/* Der Editor zeigt nur bei echten Mehrfachtreffern eine Auswahl. Die Art legt
   dabei den fachlichen Pool fest; innerhalb dieses Pools gilt ausschließlich
   der normalisierte, vollständige Titel (Ort/Anbieter darf weiter eindeutig
   eingrenzen). Eine Auswahl ist bewusst manuell und kann abgewählt werden. */
export function reminderVerknuepfungsOptionen(reminder, { kinoKatalog = [], katalog = [], master = [] } = {}) {
  if (!reminder || typeof reminder !== "object") return [];
  const probe = { ...reminder, ref: null };
  let ergebnis;
  let refFuer;
  let metaFuer;
  if (probe.art === "kino") {
    ergebnis = findeReminderVerknuepfung(probe, kinoKatalog, []);
    refFuer = (treffer) => {
      const id = kinoProgrammRef(treffer);
      return id == null ? null : { kino_programm_id: id, auto: false };
    };
    metaFuer = (treffer) => [treffer.jahr, ...(treffer.kinos || treffer.k || []).slice(0, 2)];
  } else if (probe.art === "folge" || probe.art === "staffel") {
    ergebnis = findeReminderVerknuepfung(probe, streamingTitelFuerReminder(probe, katalog), []);
    refFuer = (treffer) => treffer.watchmode_id == null ? null : {
      watchmode_id: treffer.watchmode_id,
      streaming_art: treffer.wochen_bereich || "entdecken",
      auto: false,
    };
    metaFuer = (treffer) => [treffer.jahr, ...(treffer.dienste || []).slice(0, 2)];
  } else {
    ergebnis = findeReminderVerknuepfung(probe, [], master);
    refFuer = (treffer) => treffer.id == null ? null : { master_id: treffer.id, auto: false };
    metaFuer = (treffer) => [treffer.jahr, treffer.typ];
  }
  const treffer = ergebnis?.treffer ? [ergebnis.treffer] : (ergebnis?.kandidaten || []);
  return treffer.map((eintrag, index) => {
    const ref = refFuer(eintrag);
    if (!ref) return null;
    const meta = metaFuer(eintrag).filter(Boolean).join(" · ");
    const id = ref.kino_programm_id ?? ref.watchmode_id ?? ref.master_id;
    return {
      key: `${probe.art}:${id}:${index}`,
      titel: eintrag.titel || eintrag.originaltitel || probe.titel,
      meta,
      ref,
    };
  }).filter(Boolean);
}

export function reminderVerknuepfung(reminder, {
  kinoKatalog = [], katalog = [], master = [],
} = {}, jetzt = new Date()) {
  if (reminder?.link_modus === "keiner") {
    return { quelle: null, ziel: null, abgelaufen: false };
  }
  const ref = reminder?.ref && typeof reminder.ref === "object" ? reminder.ref : {};
  if (ref.master_id != null) {
    const quelle = (Array.isArray(master) ? master : [])
      .find((treffer) => String(treffer?.id) === String(ref.master_id)) || null;
    return quelle
      ? { quelle, ziel: { art: "mediathek", ref: quelle.id } }
      : fehlendeReminderQuelle(ref);
  }
  if (ref.watchmode_id != null) {
    const quelle = streamingTitelFuerReminder(reminder, katalog)
      .find((treffer) => String(treffer?.watchmode_id) === String(ref.watchmode_id)) || null;
    return quelle
      ? { quelle, ziel: streamingZiel(quelle, ref.streaming_art) }
      : fehlendeReminderQuelle(ref);
  }
  if (ref.kino_programm_id != null) {
    const quelle = (Array.isArray(kinoKatalog) ? kinoKatalog : [])
      .find((treffer) => String(kinoProgrammRef(treffer)) === String(ref.kino_programm_id)) || null;
    return quelle
      ? { quelle, ziel: { art: "kino", ref: kinoProgrammRef(quelle) } }
      : fehlendeReminderQuelle(ref);
  }

  let quelle = null;
  let ziel = null;
  if (reminder?.art === "kino") {
    quelle = findeReminderVerknuepfung(reminder, kinoKatalog, []).treffer;
    if (quelle) ziel = { art: "kino", ref: kinoProgrammRef(quelle) };
  } else if (reminder?.art === "folge" || reminder?.art === "staffel") {
    quelle = findeReminderVerknuepfung(reminder, streamingTitelFuerReminder(reminder, katalog), []).treffer;
    if (quelle) ziel = streamingZiel(quelle);
  }
  if (!ziel) {
    const url = externeReminderUrl(ref);
    if (url) ziel = { art: "extern", url };
  }
  return { quelle, ziel, abgelaufen: false };
}

export function refAusTreffer(t) {
  if (!t) return null;
  const ref = {};
  if (t.id != null) ref.master_id = t.id;
  if (t.watchmode_id != null) ref.watchmode_id = t.watchmode_id;
  if (t.web_url) ref.url = t.web_url;
  else if (Array.isArray(t.web_urls) && t.web_urls[0]) ref.url = t.web_urls[0];
  return Object.keys(ref).length ? ref : null;
}

export function folgenstandText(t) {
  if (!t) return "";
  const exakt = Number(t.folge_aktuell ?? t.letzte_folge?.episode_number ?? t.letzte_folge?.nummer);
  const staffel = Number(t.letzte_folge?.season_number ?? t.letzte_folge?.staffel);
  if (Number.isInteger(exakt) && exakt >= 1) return `${Number.isInteger(staffel) && staffel >= 1 ? `Staffel ${staffel} · ` : ""}Folge ${exakt}`;
  const anzahl = Number(t.folgen_verfuegbar);
  return Number.isInteger(anzahl) && anzahl >= 1 ? `${anzahl} Folgen verfügbar` : "";
}

export function kinoPinTermin(pin, jetzt = new Date()) {
  if (pin?.termin_iso) {
    /* Kinoprogramme liefern die Uhrzeit am Veranstaltungsort. Für den
       Wochenplan ist deshalb die ausgeschriebene Kalenderzeit maßgeblich,
       nicht die Zeitzone des Browsers oder CI-Runners. Ein Offset bleibt
       für Transporte erlaubt, darf 20:30 in Wien aber nicht zu 18:30 in
       einem UTC-Prozess verschieben. */
    const lokal = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(pin.termin_iso));
    if (lokal) {
      const d = new Date(
        Number(lokal[1]), Number(lokal[2]) - 1, Number(lokal[3]),
        Number(lokal[4]), Number(lokal[5]), Number(lokal[6] || 0),
      );
      if (Number.isFinite(d.getTime())) return d;
    }
    const d = new Date(pin.termin_iso);
    if (Number.isFinite(d.getTime())) return d;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(pin?.z || ""));
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4]), Number(iso[5]));
    if (Number.isFinite(d.getTime())) return d;
  }
  const md = /(\d{1,2})\.(\d{1,2})\.?/.exec(String(pin?.z || ""));
  const hm = /(\d{1,2}):(\d{2})/.exec(String(pin?.z || ""));
  if (!md || !hm) return null;
  const basis = new Date(jetzt);
  let d = new Date(basis.getFullYear(), Number(md[2]) - 1, Number(md[1]), Number(hm[1]), Number(hm[2]));
  if (d.getTime() < basis.getTime() - 2 * TAG_MS) d = new Date(basis.getFullYear() + 1, Number(md[2]) - 1, Number(md[1]), Number(hm[1]), Number(hm[2]));
  return d;
}

function kinoName(pin) {
  return pin?.kino || pin?.k || String(pin?.z || "").split("·").slice(1).join("·").trim() || "Kino";
}

function kinoSlotSchluessel(pin, termin) {
  /* Ein Pin speichert ältere Programmtermine als vollständigen Anzeigestring,
     z. B. „Di 4.8. 18:45 · Lugner Kino City (DF)“. Die Klammer ist die
     Fassung, nicht Teil des Kinos. Vorschläge tragen das Kino dagegen separat.
     Für denselben realen Termin müssen deshalb Datum, Uhrzeit und der von
     Fassungs-/Abo-Suffixen bereinigte Kinoname verglichen werden. */
  const kino = kinoName(pin)
    .replace(/\s*✓\s*abo\s*$/i, "")
    .replace(/\s*\([^()]*(?:df|ov|omu|omeu|o\.m\.u\.|original|deutsch|englisch|fassung)[^()]*\)\s*$/i, "");
  return [
    datumLokal(termin),
    `${zwei(termin.getHours())}:${zwei(termin.getMinutes())}`,
    titelNormiert(kino),
  ].join("|");
}

function kinoWochenEintrag(pin, termin, { vorschlag = false } = {}) {
  const programmRef = pin.prog_ref ?? pin.programm_ref ?? pin.ref?.prog_ref ?? pin.ref?.programm_ref;
  const filmRef = pin.film_ref ?? pin.ref?.film_ref;
  return {
    id: `${vorschlag ? "kino_vorschlag" : "kino"}_${pin.t || "film"}_${termin.getTime()}`,
    art: "kino",
    titel: pin.t || "Kinotermin",
    plattform: kinoName(pin),
    termin,
    uhrzeit: `${zwei(termin.getHours())}:${zwei(termin.getMinutes())}`,
    ...(vorschlag ? { vorschlag: true } : {}),
    ...(filmRef != null ? { film_ref: filmRef } : {}),
    ...(programmRef != null ? { programm_ref: programmRef } : {}),
    pin,
  };
}

export function findeKinoPinImKatalog(pin, kinoKatalog = [], jetzt = new Date()) {
  const pinTermin = kinoPinTermin(pin, jetzt);
  if (!pinTermin) return null;
  const slot = kinoSlotSchluessel(pin, pinTermin);
  const titel = titelNormiert(pin?.t);
  const passend = kinoKatalog.filter((eintrag) => {
    if (titelNormiert(eintrag?.titel) !== titel && titelNormiert(eintrag?.originaltitel) !== titel) return false;
    if (pin?.j && eintrag?.jahr && Number(pin.j) !== Number(eintrag.jahr)) return false;
    return (eintrag.termine || []).some((wert) => {
      /* Normalisierte film.at-Termine tragen ihr konkretes Kino bereits im
         Terminstring. Bei Filmen in mehreren Häusern darf deshalb nicht das
         erste Kino des gesamten Filmeintrags auf jeden Termin gelegt werden.
         Nur alte Formate ohne „· Kino“ brauchen diesen Fallback. */
      const hatKinoImTermin = String(wert).includes("·");
      const fallbackKino = (eintrag.kinos || eintrag.k || [])[0];
      const probe = { z: wert, ...(!hatKinoImTermin && fallbackKino ? { kino: fallbackKino } : {}) };
      const termin = kinoPinTermin(probe, jetzt);
      return termin && kinoSlotSchluessel(probe, termin) === slot;
    });
  });
  return passend.length === 1 ? passend[0] : null;
}

export function wochenansicht({
  wochenplan, kinoPins = [], kinoVorschlaege = [], kinoKatalog = [], katalog = [], master = [],
  startdatum = null, wochenstart = null, jetzt = new Date(),
} = {}) {
  const plan = normalisiereWochenplan(wochenplan, jetzt);
  /* `wochenstart` bleibt als lesbarer Alt-Parameter erhalten, damit ältere
     Einzeldateien/Tests nicht brechen. Die App selbst übergibt nur noch jetzt. */
  const ausblickStart = startdatum || wochenstart || wienerKalendertag(jetzt) || jetzt;
  const tage = naechsteSiebenTage(ausblickStart).map((tag) => ({ ...tag, eintraege: [] }));
  for (const e of plan.eintraege) {
    const verknuepfung = reminderVerknuepfung(e, { kinoKatalog, katalog, master }, jetzt);
    for (const tag of tage) if (reminderFaellig(e, tag.iso)) tag.eintraege.push({
      ...e,
      quelle: verknuepfung.quelle,
      ziel: verknuepfung.ziel,
      ...(verknuepfung.verknuepfungFehlt ? { verknuepfungFehlt: true } : {}),
      folgenstand: folgenstandText(verknuepfung.quelle),
    });
  }
  const gepinnteKinoSlots = new Set();
  for (const pin of Array.isArray(kinoPins) ? kinoPins : []) {
    const termin = kinoPinTermin(pin, jetzt);
    if (!termin) continue;
    const tag = tage.find((t) => t.iso === datumLokal(termin));
    if (!tag) continue;
    const katalogTreffer = kinoKatalog.length ? findeKinoPinImKatalog(pin, kinoKatalog, jetzt) : null;
    if (kinoKatalog.length && !katalogTreffer) continue;
    gepinnteKinoSlots.add(kinoSlotSchluessel(pin, termin));
    tag.eintraege.push(kinoWochenEintrag(katalogTreffer ? {
      ...pin,
      programm_ref: kinoProgrammRef(katalogTreffer),
      film_ref: katalogTreffer.film_ref,
    } : pin, termin));
  }
  for (const vorschlag of Array.isArray(kinoVorschlaege) ? kinoVorschlaege : []) {
    if (!vorschlag || typeof vorschlag !== "object" || !String(vorschlag.t || "").trim()) continue;
    const termin = kinoPinTermin(vorschlag, jetzt);
    if (!termin) continue;
    const tag = tage.find((t) => t.iso === datumLokal(termin));
    if (!tag) continue;
    if (gepinnteKinoSlots.has(kinoSlotSchluessel(vorschlag, termin))) continue;
    tag.eintraege.push(kinoWochenEintrag(vorschlag, termin, { vorschlag: true }));
  }
  for (const tag of tage) tag.eintraege.sort((a, b) => String(a.uhrzeit || "99:99").localeCompare(String(b.uhrzeit || "99:99")) || a.titel.localeCompare(b.titel, "de"));
  return tage;
}

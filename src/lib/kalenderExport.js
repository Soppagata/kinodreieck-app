import { artHatUhrzeit, datumLokal, datumPlusTage, reminderFaellig, WOCHENTAGE } from "./wochenplan.js";

const WOCHENTAG_ICS = Object.freeze({ 1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA", 7: "SU" });
const KALENDER_ZEITZONE = "Europe/Vienna";
const WIEN_VTIMEZONE = Object.freeze([
  "BEGIN:VTIMEZONE",
  `TZID:${KALENDER_ZEITZONE}`,
  `X-LIC-LOCATION:${KALENDER_ZEITZONE}`,
  "BEGIN:DAYLIGHT",
  "DTSTART:19960331T020000",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "DTSTART:19961027T030000",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
]);

function esc(wert) {
  return String(wert ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function fold(line) {
  const teile = [];
  let rest = String(line);
  while (new TextEncoder().encode(rest).length > 73) {
    let pos = Math.min(70, rest.length);
    while (pos > 1 && new TextEncoder().encode(rest.slice(0, pos)).length > 73) pos--;
    teile.push(rest.slice(0, pos));
    rest = " " + rest.slice(pos);
  }
  teile.push(rest);
  return teile.join("\r\n");
}

function icsDatum(wert) {
  /* Ein YYYY-MM-DD ist ein Kalendertag, kein UTC-Zeitpunkt. `new Date(wert)`
     würde ihn z. B. in America/New_York auf den Vortag verschieben. */
  const kalenderdatum = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(wert || ""));
  if (kalenderdatum) return `${kalenderdatum[1]}${kalenderdatum[2]}${kalenderdatum[3]}`;
  return datumLokal(wert).replaceAll("-", "");
}
function icsZeit(datum) {
  const d = new Date(datum);
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}T${z(d.getHours())}${z(d.getMinutes())}00`;
}
function utcZeit(datum = new Date()) {
  return new Date(datum).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function hash(wert) {
  let h = 2166136261;
  for (const c of String(wert)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function uidFuer(event) {
  return `${hash(`${event.id || "termin"}|${event.start || event.datum || ""}|${event.summary || ""}`)}@kinodreieck.app`;
}

function gueltigeUhrzeit(wert) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(wert || ""));
}

function hatUhrzeit(event) {
  return event?.start instanceof Date || gueltigeUhrzeit(event?.uhrzeit);
}

function wienerLokalzeitAlsUtc(datum, uhrzeit) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(datum || ""));
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(uhrzeit || ""));
  if (!d || !t) return "";
  const ziel = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  const teileFuer = (zeitpunkt) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: KALENDER_ZEITZONE,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(zeitpunkt)).filter((teil) => teil.type !== "literal").map((teil) => [teil.type, Number(teil.value)]));
  let utc = ziel;
  /* Zweimaliges Nachführen deckt beide Wiener UTC-Offsets ab, ohne von der
     Zeitzone des Browsers beziehungsweise Testprozesses abzuhängen. */
  for (let i = 0; i < 2; i++) {
    const p = teileFuer(utc);
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utc;
    utc = ziel - offset;
  }
  return utcZeit(new Date(utc));
}

function eventZeilen(event, dtstamp) {
  const zeilen = ["BEGIN:VEVENT", `UID:${esc(event.uid || uidFuer(event))}`, `DTSTAMP:${dtstamp}`];
  if (event.start instanceof Date) zeilen.push(`DTSTART;TZID=${KALENDER_ZEITZONE}:${icsZeit(event.start)}`);
  else if (gueltigeUhrzeit(event.uhrzeit)) zeilen.push(`DTSTART;TZID=${KALENDER_ZEITZONE}:${icsDatum(event.datum)}T${String(event.uhrzeit).replace(":", "")}00`);
  else zeilen.push(`DTSTART;VALUE=DATE:${icsDatum(event.datum)}`);
  if (event.rrule) zeilen.push(`RRULE:${event.rrule}`);
  zeilen.push(`SUMMARY:${esc(event.summary || "Kinodreieck")}`);
  if (event.description) zeilen.push(`DESCRIPTION:${esc(event.description)}`);
  if (event.location) zeilen.push(`LOCATION:${esc(event.location)}`);
  if (event.url) zeilen.push(`URL:${String(event.url).replace(/[\r\n]/g, "")}`);
  zeilen.push("END:VEVENT");
  return zeilen;
}

export function erstelleIcs(events, { name = "Kinodreieck", jetzt = new Date() } = {}) {
  const dtstamp = utcZeit(jetzt);
  const liste = Array.isArray(events) ? events : [];
  const enthaeltUhrzeit = liste.some(hatUhrzeit);
  const zeilen = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kinodreieck//Deine Woche//DE",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`,
  ];
  if (enthaeltUhrzeit) zeilen.push(`X-WR-TIMEZONE:${KALENDER_ZEITZONE}`, ...WIEN_VTIMEZONE);
  for (const event of liste) zeilen.push(...eventZeilen(event, dtstamp));
  zeilen.push("END:VCALENDAR", "");
  return zeilen.map(fold).join("\r\n");
}

function ersteFaelligkeit(reminder) {
  const start = new Date(`${reminder.startdatum}T12:00:00`);
  for (let i = 0; i < 370; i++) {
    const d = datumPlusTage(start, i);
    if (reminderFaellig(reminder, d)) return datumLokal(d);
  }
  return reminder.startdatum;
}

function terminZusammenfassung(eintrag) {
  const titel = String(eintrag?.titel || "Kinodreieck");
  if (eintrag?.art === "staffel") return `Neue Staffel: ${titel}`;
  if (eintrag?.art === "kino") return `Kino: ${titel}`;
  if (eintrag?.art === "termin") return `Termin: ${titel}`;
  if (eintrag?.art === "konzert") return `Konzert: ${titel}`;
  return `Neue Folge: ${titel}`;
}

export function reminderIcsEvent(reminder, { url = "" } = {}) {
  const uhrzeit = artHatUhrzeit(reminder.art) ? reminder.uhrzeit || "" : "";
  const tage = (reminder.wochentage || [1]).map((n) => WOCHENTAG_ICS[n]).filter(Boolean);
  const teile = ["FREQ=WEEKLY", `INTERVAL=${Number(reminder.intervall_wochen) || 1}`];
  if (tage.length) teile.push(`BYDAY=${tage.join(",")}`);
  if (reminder.ende?.typ === "datum") {
    /* RFC 5545 verlangt bei einem DTSTART mit TZID ein UTC-UNTIL. Ganztägige
       Serien behalten dagegen ihren bisherigen DATE-Vertrag. */
    const until = uhrzeit
      ? wienerLokalzeitAlsUtc(reminder.ende.datum, uhrzeit)
      : String(reminder.ende.datum).replaceAll("-", "");
    teile.push(`UNTIL=${until}`);
  }
  if (reminder.ende?.typ === "anzahl") teile.push(`COUNT=${Number(reminder.ende.anzahl)}`);
  const stand = reminder.folgenstand || "";
  return {
    id: reminder.id,
    datum: ersteFaelligkeit(reminder),
    uhrzeit,
    summary: terminZusammenfassung(reminder),
    description: [reminder.plattform, stand, reminder.notiz].filter(Boolean).join(" · "),
    location: reminder.plattform || "",
    url: reminder.ref?.url || url,
    rrule: teile.join(";"),
  };
}

export function kalenderEventAusWochenEintrag(eintrag, datum) {
  if (eintrag.art === "kino" && eintrag.termin instanceof Date) return {
    id: eintrag.id, start: eintrag.termin, summary: terminZusammenfassung(eintrag),
    location: eintrag.plattform || "Kino", description: eintrag.pin?.notiz || "",
    url: eintrag.pin?.url || "",
  };
  return {
    id: `${eintrag.id}_${datum}`,
    datum,
    uhrzeit: artHatUhrzeit(eintrag.art) ? eintrag.uhrzeit || "" : "",
    summary: terminZusammenfassung(eintrag),
    description: [eintrag.plattform, eintrag.folgenstand, eintrag.notiz].filter(Boolean).join(" · "),
    location: eintrag.plattform || "",
    url: eintrag.ref?.url || "",
  };
}

export function tagAlsIcs(tag, optionen = {}) {
  return erstelleIcs((tag?.eintraege || []).map((e) => kalenderEventAusWochenEintrag(e, tag.iso)), {
    name: `${WOCHENTAGE.find((w) => w.nr === tag?.nr)?.name || "Tag"} · Kinodreieck`, ...optionen,
  });
}

export function wocheAlsIcs(tage, optionen = {}) {
  const events = [];
  for (const tag of Array.isArray(tage) ? tage : []) for (const e of tag.eintraege || []) events.push(kalenderEventAusWochenEintrag(e, tag.iso));
  return erstelleIcs(events, { name: "Deine Woche · Kinodreieck", ...optionen });
}

export function dateinameIcs(name = "kinodreieck") {
  return `${String(name).toLocaleLowerCase("de").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kinodreieck"}.ics`;
}

export function ladeIcsHerunter(inhalt, dateiname = "kinodreieck.ics") {
  const blob = new Blob([inhalt], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = dateiname; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

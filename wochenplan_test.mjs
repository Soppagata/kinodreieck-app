import assert from "node:assert/strict";
import {
  datumLokal, montagDerWoche, normalisiereWochenplan, neuerFolgenReminder,
  reminderFaellig, wochenansicht, findeReminderVerknuepfung, folgenstandText,
  naechsteSiebenTage, kinoPinTermin,
} from "./src/lib/wochenplan.js";
import { erstelleIcs, reminderIcsEvent, tagAlsIcs, wocheAlsIcs } from "./src/lib/kalenderExport.js";

let checks = 0;
const ok = (name, fn) => { fn(); checks++; console.log("✓ " + name); };

ok("Woche beginnt lokal am Montag", () => {
  assert.equal(datumLokal(montagDerWoche(new Date(2026, 7, 2, 23, 30))), "2026-07-27");
});

ok("Sieben-Tage-Ausblick beginnt heute statt zwingend am Montag", () => {
  const tage = naechsteSiebenTage(new Date(2026, 7, 2, 23, 30));
  assert.deepEqual(tage.map((tag) => tag.iso), [
    "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05",
    "2026-08-06", "2026-08-07", "2026-08-08",
  ]);
  assert.equal(tage[0].name, "Sonntag");
  assert.equal(tage[6].name, "Samstag");
});

ok("Normalisierung erhält mehrere Wochentage und repariert ungültige Werte", () => {
  const plan = normalisiereWochenplan({ eintraege: [{ id: "a", titel: "One Piece", wochentage: [2, 7, 2, 9], intervall_wochen: 2, startdatum: "2026-07-28", link_modus: "keiner" }] });
  assert.deepEqual(plan.eintraege[0].wochentage, [2, 7]);
  assert.equal(plan.eintraege[0].intervall_wochen, 2);
  assert.equal(plan.eintraege[0].link_modus, "keiner");
});

ok("Normalisierung unterstützt allgemeine Terminarten und begrenzt Uhrzeiten fachlich", () => {
  const plan = normalisiereWochenplan({ eintraege: [
    { id: "folge", titel: "Serie", art: "folge", uhrzeit: "20:15", startdatum: "2026-08-02", ref: { watchmode_id: 42, url: "https://example.test/altbestand" } },
    { id: "staffel", titel: "Staffel", art: "staffel", uhrzeit: "20:15", startdatum: "2026-08-02" },
    { id: "kino", titel: "Film", art: "kino", uhrzeit: "20:15", startdatum: "2026-08-02" },
    { id: "termin", titel: "Treffen", art: "termin", uhrzeit: "08:30", startdatum: "2026-08-02", ref: { master_id: 7, url: "https://example.test/termin" } },
    { id: "konzert", titel: "Band", art: "konzert", uhrzeit: "21:00", startdatum: "2026-08-02" },
  ] });
  assert.deepEqual(plan.eintraege.map((e) => e.art), ["folge", "staffel", "kino", "termin", "konzert"]);
  assert.deepEqual(plan.eintraege.map((e) => e.uhrzeit), ["", "", "20:15", "08:30", "21:00"]);
  assert.deepEqual(plan.eintraege[0].ref, { watchmode_id: 42, url: "https://example.test/altbestand" });
  assert.deepEqual(plan.eintraege[3].ref, { master_id: 7, url: "https://example.test/termin" });
});

ok("Alte und unbekannte Arten bleiben als Folge rückwärtskompatibel", () => {
  const [ohneArt, unbekannt] = normalisiereWochenplan({ eintraege: [
    { id: "alt", titel: "Altbestand", startdatum: "2026-08-02" },
    { id: "fremd", titel: "Altbestand 2", art: "episode", startdatum: "2026-08-02" },
  ] }).eintraege;
  assert.equal(ohneArt.art, "folge");
  assert.equal(unbekannt.art, "folge");
});

ok("Wöchentlicher Reminder ist am gesetzten Tag fällig", () => {
  const e = neuerFolgenReminder({ titel: "One Piece", wochentage: [2], startdatum: "2026-07-28" }, new Date("2026-07-28T10:00:00Z"));
  assert.equal(reminderFaellig(e, "2026-08-04"), true);
  assert.equal(reminderFaellig(e, "2026-08-05"), false);
});

ok("Zweiwöchiger Rhythmus wird an der Startwoche verankert", () => {
  const e = neuerFolgenReminder({ titel: "Serie", wochentage: [2], intervall_wochen: 2, startdatum: "2026-07-28" });
  assert.equal(reminderFaellig(e, "2026-08-04"), false);
  assert.equal(reminderFaellig(e, "2026-08-11"), true);
});

ok("Automatisches Ende nach Anzahl zählt einzelne Termine", () => {
  const e = neuerFolgenReminder({ titel: "Serie", wochentage: [2, 5], startdatum: "2026-07-28", ende: { typ: "anzahl", anzahl: 3 } });
  assert.equal(reminderFaellig(e, "2026-07-28"), true);
  assert.equal(reminderFaellig(e, "2026-07-31"), true);
  assert.equal(reminderFaellig(e, "2026-08-04"), true);
  assert.equal(reminderFaellig(e, "2026-08-07"), false);
});

ok("Enddatum gilt einschließlich", () => {
  const e = neuerFolgenReminder({ titel: "Serie", wochentage: [2], startdatum: "2026-07-28", ende: { typ: "datum", datum: "2026-08-04" } });
  assert.equal(reminderFaellig(e, "2026-08-04"), true);
  assert.equal(reminderFaellig(e, "2026-08-11"), false);
});

ok("Auto-Verknüpfung verlangt starke ID oder exakt eindeutigen Katalogtitel", () => {
  const katalog = [
    { watchmode_id: 42, titel: "One Piece", typ: "tv_series" },
    { watchmode_id: 77, titel: "One Piece", typ: "tv_series" },
  ];
  assert.equal(findeReminderVerknuepfung({ titel: "One Piece" }, katalog).status, "mehrdeutig");
  assert.equal(findeReminderVerknuepfung({ titel: "One Piece", ref: { watchmode_id: 42 } }, katalog).treffer.watchmode_id, 42);
  assert.equal(findeReminderVerknuepfung({ titel: "one-piece" }, [katalog[0]]).treffer.watchmode_id, 42);
  assert.equal(findeReminderVerknuepfung({ titel: "Event Horizon" }, [
    { id: "film-1", titel: "Event Horizon", typ: "film" },
  ]).treffer.id, "film-1");
});

ok("Exakte API-Folgennummer erscheint bevorzugt", () => {
  assert.equal(folgenstandText({ folge_aktuell: 1266, folgen_verfuegbar: 1200 }), "Folge 1266");
  assert.equal(folgenstandText({ letzte_folge: { season_number: 2, episode_number: 8 } }), "Staffel 2 · Folge 8");
  assert.equal(folgenstandText({ folgen_verfuegbar: 1266 }), "1266 Folgen verfügbar");
});

ok("Rollierender Ausblick enthält sieben Tage, Reminder und Kinopin", () => {
  const plan = { version: 1, eintraege: [{ id: "a", titel: "One Piece", art: "folge", plattform: "Netflix", wochentage: [2], intervall_wochen: 1, startdatum: "2026-07-28", ende: { typ: "nie" }, aktiv: true, ref: { watchmode_id: 42 } }] };
  const tage = wochenansicht({ wochenplan: plan, wochenstart: new Date(2026, 7, 2), jetzt: new Date(2026, 7, 2), katalog: [{ watchmode_id: 42, titel: "One Piece", typ: "tv_series", folge_aktuell: 1266 }], kinoPins: [{ t: "Jaws", z: "So 02.08. 20:30", kino: "Gartenbaukino" }] });
  assert.equal(tage.length, 7);
  assert.equal(tage[2].eintraege[0].folgenstand, "Folge 1266");
  assert.equal(tage[0].eintraege[0].art, "kino");
  assert.equal(tage[0].eintraege[0].plattform, "Gartenbaukino");
});

ok("Ältere ISO-Kinopins werden weiterhin dem richtigen Tag zugeordnet", () => {
  const tage = wochenansicht({ wochenstart: new Date(2026, 7, 3), jetzt: new Date(2026, 7, 3), kinoPins: [{ t: "Jaws", z: "2026-08-04T20:30:00+02:00" }] });
  assert.equal(tage[1].eintraege[0].titel, "Jaws");
  assert.equal(tage[1].eintraege[0].uhrzeit, "20:30");
});

ok("ISO-Kinotermine behalten die lokale Veranstaltungszeit unabhängig vom Runner", () => {
  const termin = kinoPinTermin({ termin_iso: "2026-08-04T20:30:00+02:00" });
  assert.equal(datumLokal(termin), "2026-08-04");
  assert.equal(`${String(termin.getHours()).padStart(2, "0")}:${String(termin.getMinutes()).padStart(2, "0")}`, "20:30");
});

ok("Kinovorschläge erscheinen am Termintag und ein Pin blendet denselben Titel an diesem Tag aus", () => {
  const pin = { t: "Event Horizon", j: 1997, kino: "Gartenbaukino", termin_iso: "2026-08-02T20:15:00+02:00", film_ref: "film-1" };
  const tage = wochenansicht({
    startdatum: new Date(2026, 7, 2),
    jetzt: new Date(2026, 7, 2),
    kinoPins: [pin],
    kinoVorschlaege: [
      { ...pin, kino: "Anderes Kino", termin_iso: "2026-08-02T22:45:00+02:00", prog_ref: "programm-1" },
      { t: "Terminator", kino: "Apollo", termin_iso: "2026-08-04T20:30:00+02:00", film_ref: "film-2", prog_ref: "programm-2" },
      { t: "Zu spät", kino: "Apollo", termin_iso: "2026-08-12T20:30:00+02:00" },
    ],
  });
  const eventHorizon = tage[0].eintraege.filter((e) => e.titel === "Event Horizon");
  assert.equal(eventHorizon.length, 1);
  assert.equal(eventHorizon[0].vorschlag, undefined);
  assert.equal(eventHorizon[0].pin, pin);
  assert.deepEqual(tage[2].eintraege.map((e) => ({ titel: e.titel, art: e.art, vorschlag: e.vorschlag, kino: e.plattform, uhrzeit: e.uhrzeit })), [
    { titel: "Terminator", art: "kino", vorschlag: true, kino: "Apollo", uhrzeit: "20:30" },
  ]);
  assert.equal(tage[2].eintraege[0].film_ref, "film-2");
  assert.equal(tage[2].eintraege[0].programm_ref, "programm-2");
  assert.equal(tage[2].eintraege[0].pin.prog_ref, "programm-2");
  assert.equal(tage.flatMap((tag) => tag.eintraege).some((e) => e.titel === "Zu spät"), false);
});

ok("ICS faltet Kalender, escaped Text und exportiert RRULE", () => {
  const e = neuerFolgenReminder({ id: "op", titel: "One Piece", plattform: "Netflix, AT", wochentage: [2], startdatum: "2026-07-28", ende: { typ: "anzahl", anzahl: 5 } });
  const ics = erstelleIcs([reminderIcsEvent(e)], { jetzt: new Date("2026-08-02T10:00:00Z") });
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;COUNT=5/);
  assert.match(ics, /LOCATION:Netflix\\, AT/);
  assert.match(ics, /SUMMARY:Neue Folge: One Piece/);
});

ok("ICS benennt alle Terminarten passend und ignoriert Serien-Uhrzeiten", () => {
  const basis = { id: "x", titel: "Titel", wochentage: [1], intervall_wochen: 1, startdatum: "2026-08-03", ende: { typ: "nie" } };
  assert.equal(reminderIcsEvent({ ...basis, art: "folge", uhrzeit: "20:15" }).summary, "Neue Folge: Titel");
  assert.equal(reminderIcsEvent({ ...basis, art: "staffel" }).summary, "Neue Staffel: Titel");
  assert.equal(reminderIcsEvent({ ...basis, art: "kino" }).summary, "Kino: Titel");
  assert.equal(reminderIcsEvent({ ...basis, art: "termin" }).summary, "Termin: Titel");
  assert.equal(reminderIcsEvent({ ...basis, art: "konzert" }).summary, "Konzert: Titel");
  assert.equal(reminderIcsEvent({ ...basis, art: "folge", uhrzeit: "20:15" }).uhrzeit, "");
  assert.equal(reminderIcsEvent({ ...basis, art: "konzert", uhrzeit: "20:15" }).uhrzeit, "20:15");
});

ok("Tag- und Wochenexport erzeugen konkrete Ereignisse ohne RRULE", () => {
  const tag = { nr: 2, iso: "2026-08-04", eintraege: [{ id: "a", art: "konzert", titel: "Band", plattform: "Arena", uhrzeit: "20:15" }] };
  assert.doesNotMatch(tagAlsIcs(tag), /RRULE/);
  assert.match(wocheAlsIcs([tag]), /DTSTART:20260804T201500/);
  assert.match(wocheAlsIcs([tag]), /SUMMARY:Konzert: Band/);
  assert.match(wocheAlsIcs([{ ...tag, eintraege: [{ ...tag.eintraege[0], art: "folge" }] }]), /DTSTART;VALUE=DATE:20260804/);
  assert.match(wocheAlsIcs([{ ...tag, eintraege: [{ ...tag.eintraege[0], art: "kino" }] }]), /SUMMARY:Kino: Band/);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("WOCHENPLAN-TEST BESTANDEN");

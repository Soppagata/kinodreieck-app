import assert from "node:assert/strict";
import {
  automatischeReminderRef, datumLokal, montagDerWoche, normalisiereWochenplan, neuerFolgenReminder,
  reminderFaellig, wochenansicht, findeReminderVerknuepfung, folgenstandText,
  naechsteSiebenTage, kinoPinTermin, reminderVerknuepfung, reminderVerknuepfungsOptionen,
  wochentagFuerDatum, findeKinoPinImKatalog,
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

ok("Lokales Kalenderdatum liefert den zugehörigen Wochentag", () => {
  assert.equal(wochentagFuerDatum("2026-08-02"), 7);
  assert.equal(wochentagFuerDatum("2026-08-05"), 3);
  assert.equal(wochentagFuerDatum("2026-02-30"), null);
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

ok("Automatische Pins gleichen nur im Art-Pool und bei bekanntem Anbieter ab", () => {
  const streaming = [
    { watchmode_id: 42, titel: "One Piece", dienste: ["Crunchyroll"], wochen_bereich: "programm" },
    { watchmode_id: 77, titel: "One Piece", dienste: ["Netflix"], wochen_bereich: "entdecken" },
  ];
  const kino = [{
    id: "kino-1", programm_ref: "programm-1", titel: "Event Horizon", jahr: 1997,
    kinos: ["Gartenbaukino"], termine: ["Mi 5.8. 20:15 · Gartenbaukino"],
  }];
  assert.deepEqual(automatischeReminderRef({
    art: "folge", titel: "One Piece", plattform: "Crunchyroll",
  }, { katalog: streaming }), {
    watchmode_id: 42, streaming_art: "programm", auto: true,
  });
  assert.deepEqual(automatischeReminderRef({
    art: "kino", titel: "Event Horizon", plattform: "Gartenbaukino",
    startdatum: "2026-08-05", uhrzeit: "20:15",
  }, { kinoKatalog: kino }, new Date(2026, 7, 2)), {
    kino_programm_id: "programm-1", auto: true,
  });
  assert.deepEqual(automatischeReminderRef({
    art: "kino", titel: "Event Horizon", plattform: "Gartenbaukino",
    startdatum: "2026-08-05", uhrzeit: "21:15",
  }, { kinoKatalog: kino }, new Date(2026, 7, 2)), {
    kino_programm_id: "programm-1", auto: true,
  });
  assert.deepEqual(automatischeReminderRef({
    art: "konzert", titel: "Stop Making Sense", plattform: "Arena",
  }, { master: [{ id: "master-1", titel: "Stop Making Sense", typ: "film" }] }), {
    master_id: "master-1", auto: true,
  });
});

ok("Mehrfachtreffer bleiben eine freiwillige Auswahl im richtigen Art-Pool", () => {
  const katalog = [
    { id: "programm-one-piece", watchmode_id: 42, titel: "One Piece", typ: "tv_series", dienste: ["Crunchyroll"], wochen_bereich: "programm" },
    { watchmode_id: 77, titel: "One Piece", typ: "tv_series", dienste: ["Netflix"], wochen_bereich: "entdecken" },
    { watchmode_id: 88, titel: "One Piece", typ: "movie", dienste: ["Prime Video"], wochen_bereich: "entdecken" },
  ];
  const optionen = reminderVerknuepfungsOptionen({ art: "folge", titel: "One Piece" }, { katalog });
  assert.deepEqual(optionen.map((option) => option.ref.watchmode_id), [42, 77]);
  assert.equal(optionen.every((option) => option.ref.auto === false), true);
  assert.equal(automatischeReminderRef({ art: "folge", titel: "One Piece" }, { katalog }), null);
});

ok("Streaming-Wochenpins zielen mit Watchmode-Identität auf die konkrete Programmkarte", () => {
  const reminder = neuerFolgenReminder({
    art: "folge", titel: "One Piece", startdatum: "2026-08-05", wochentage: [3],
    ref: { watchmode_id: 42, streaming_art: "programm", auto: true },
  }, new Date(2026, 7, 2));
  const verknuepfung = reminderVerknuepfung(reminder, { katalog: [{
    id: "programm-one-piece", watchmode_id: 42, titel: "One Piece",
    typ: "tv_series", wochen_bereich: "programm",
  }] });
  assert.deepEqual(verknuepfung.ziel, { art: "streaming", bereich: "programm", ref: "programm-one-piece" });
});

ok("Verknüpfte Pins laufen ab, freie persönliche Termine bleiben", () => {
  const streamingPin = neuerFolgenReminder({
    id: "stream", art: "folge", titel: "One Piece", startdatum: "2026-08-05",
    wochentage: [3], ref: { watchmode_id: 42, streaming_art: "programm", auto: true },
  }, new Date(2026, 7, 2));
  assert.equal(reminderVerknuepfung(streamingPin, { katalog: [] }).abgelaufen, true);
  const tage = wochenansicht({
    jetzt: new Date(2026, 7, 2),
    wochenplan: { eintraege: [
      streamingPin,
      { id: "frei", art: "termin", titel: "Zahnarzt", startdatum: "2026-08-05", wochentage: [3] },
    ] },
    katalog: [],
  });
  assert.deepEqual(tage[3].eintraege.map((e) => e.titel), ["Zahnarzt"]);

  const kinoPin = neuerFolgenReminder({
    id: "kino", art: "kino", titel: "Event Horizon", plattform: "Gartenbaukino",
    startdatum: "2026-08-05", uhrzeit: "20:15", wochentage: [3],
    ref: { kino_programm_id: "programm-1", auto: true },
  }, new Date(2026, 7, 2));
  const andererTermin = [{
    id: "kino-1", programm_ref: "programm-1", titel: "Event Horizon",
    kinos: ["Gartenbaukino"], termine: ["Mi 5.8. 21:15 · Gartenbaukino"],
  }];
  assert.equal(reminderVerknuepfung(kinoPin, { kinoKatalog: andererTermin }, new Date(2026, 7, 2)).abgelaufen, undefined);
  assert.equal(reminderVerknuepfung(kinoPin, { kinoKatalog: [] }, new Date(2026, 7, 2)).abgelaufen, true);
});

ok("Nicht mehr im Programm gefundene Kinopins verschwinden aus der Woche", () => {
  const kinoKatalog = [{
    id: "kino-1", programm_ref: "programm-1", titel: "Event Horizon", jahr: 1997,
    kinos: ["Gartenbaukino"], termine: ["Mi 5.8. 20:15 · Gartenbaukino"],
  }];
  const tage = wochenansicht({
    jetzt: new Date(2026, 7, 2), kinoKatalog,
    kinoPins: [
      { t: "Event Horizon", j: 1997, z: "Mi 5.8. 20:15 · Gartenbaukino" },
      { t: "Verschwunden", j: 1999, z: "Mi 5.8. 22:15 · Gartenbaukino" },
    ],
  });
  assert.deepEqual(tage[3].eintraege.map((e) => e.titel), ["Event Horizon"]);
  assert.equal(tage[3].eintraege[0].programm_ref, "programm-1");
});

ok("Ein Kinopin wird beim konkreten zweiten Kino eines Films nicht verworfen", () => {
  const kinoKatalog = [{
    id: "kino-obsession", programm_ref: "programm-obsession",
    titel: "Obsession - Du sollst mich lieben", jahr: 2026,
    kinos: ["Gartenbaukino", "Apollo"],
    termine: [
      "Mi 5.8. 18:30 · Gartenbaukino (OmU)",
      "Mi 5.8. 21:00 · Apollo (OV)",
    ],
  }];
  const pin = {
    t: "Obsession - Du sollst mich lieben", j: 2026,
    z: "Mi 5.8. 21:00 · Apollo (OV)",
  };
  assert.equal(
    findeKinoPinImKatalog(pin, kinoKatalog, new Date(2026, 7, 3))?.programm_ref,
    "programm-obsession",
  );
  const tage = wochenansicht({
    jetzt: new Date(2026, 7, 3), kinoKatalog, kinoPins: [pin],
  });
  assert.deepEqual(tage[2].eintraege.map((eintrag) => eintrag.titel), ["Obsession - Du sollst mich lieben"]);
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

ok("Ein Pin blendet nur den Vorschlag desselben Kino-Slots aus und lässt alle echten Pins stehen", () => {
  const pins = [
    { t: "Terminator", j: 1984, z: "Di 4.8. 18:45 · Lugner Kino City (DF)" },
    { t: "Terminator", j: 1984, z: "Di 4.8. 20:30 · Lugner Kino City (OV)" },
  ];
  const tage = wochenansicht({
    startdatum: new Date(2026, 7, 2),
    jetzt: new Date(2026, 7, 2),
    kinoPins: pins,
    kinoVorschlaege: [
      { t: "The Terminator", kino: "Lugner Kino City", termin_iso: "2026-08-04T18:45:00+02:00", film_ref: "film-1", prog_ref: "programm-1" },
      { t: "Terminator", kino: "Apollo", termin_iso: "2026-08-04T18:45:00+02:00", film_ref: "film-2", prog_ref: "programm-2" },
      { t: "Terminator", kino: "Lugner Kino City", termin_iso: "2026-08-04T21:45:00+02:00", film_ref: "film-3", prog_ref: "programm-3" },
      { t: "Zu spät", kino: "Apollo", termin_iso: "2026-08-12T20:30:00+02:00" },
    ],
  });
  const dienstag = tage[2].eintraege;
  assert.equal(dienstag.filter((e) => !e.vorschlag).length, 2, "beide echten Pins desselben Films bleiben sichtbar");
  assert.equal(dienstag.some((e) => e.titel === "The Terminator"), false, "abweichender Titel ändert den Slotabgleich nicht");
  assert.deepEqual(dienstag.filter((e) => e.vorschlag).map((e) => ({ kino: e.plattform, uhrzeit: e.uhrzeit })), [
    { kino: "Apollo", uhrzeit: "18:45" },
    { kino: "Lugner Kino City", uhrzeit: "21:45" },
  ], "anderes Kino oder andere Uhrzeit bleiben als Empfehlung sichtbar");
  assert.equal(dienstag.find((e) => e.vorschlag && e.plattform === "Apollo").film_ref, "film-2");
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

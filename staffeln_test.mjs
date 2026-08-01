import assert from "node:assert/strict";
import {
  statusVon, mediathekIdVon, mitMediathekEintrag, ohneMediathekEintrag,
  gleicheMediathekStatusAb,
  neuerGesehenEintrag, initialisiereStaffelstaende,
  staffelHinweis, neueStaffeln, bestaetigeStaffel, serienBeobachten,
} from "./src/lib/staffeln.js";

let checks = 0;
const ok = (name, fn) => { fn(); checks++; console.log("✓ " + name); };
const serie = (extra = {}) => ({ watchmode_id: 42, titel: "Testserie", typ: "tv_series", ...extra });

ok("Status: alter String gesehen", () => assert.equal(statusVon("gesehen"), "gesehen"));
ok("Status: alter String erstellt", () => assert.equal(statusVon("erstellt"), "erstellt"));
ok("Status: neues Objekt", () => assert.equal(statusVon({ status: "gesehen" }), "gesehen"));
ok("Status: kaputter Wert fail-safe", () => assert.equal(statusVon({ foo: 1 }), null));
ok("Mediathek-Verknüpfung bleibt orthogonal zum Gesehen-Status", () => {
  const gesehen = neuerGesehenEintrag(serie({ staffeln_verfuegbar: 3 }), new Date("2026-07-21T10:00:00Z"));
  const verknuepft = mitMediathekEintrag(gesehen, serie(), "testserie_2026");
  assert.equal(statusVon(verknuepft), "gesehen");
  assert.equal(mediathekIdVon(verknuepft), "testserie_2026");
  assert.equal(ohneMediathekEintrag(verknuepft).staffel_bestaetigt, 3);
  assert.equal(mediathekIdVon(ohneMediathekEintrag(verknuepft)), null);
});
ok("Legacy-Erstellt lässt sich nach einer Filmlöschung vollständig lösen", () => {
  assert.equal(mediathekIdVon("erstellt"), true);
  assert.equal(ohneMediathekEintrag("erstellt"), null);
});
ok("Mediathek-Abgleich verknüpft starke IDs, ohne gesehen zu erfinden", () => {
  const r = gleicheMediathekStatusAb({}, [
    { watchmode_id: 42, titel: "Testfilm", typ: "movie" },
  ], [{ id: "testfilm_2026", watchmode_id: 42 }]);
  assert.equal(mediathekIdVon(r[42]), "testfilm_2026");
  assert.equal(statusVon(r[42]), "erstellt");
});
ok("Mediathek-Abgleich erhält einen echten Gesehen-Status", () => {
  const r = gleicheMediathekStatusAb({ 42: neuerGesehenEintrag(serie()) }, [serie()], [
    { id: "testserie_2026", watchmode_id: 42 },
  ]);
  assert.equal(statusVon(r[42]), "gesehen");
  assert.equal(mediathekIdVon(r[42]), "testserie_2026");
});
ok("Mediathek-Abgleich toleriert ID-Typen und erhält gesehen-only nach Löschung", () => {
  const film = { watchmode_id: 7, typ: "movie", titel: "Film" };
  const gesehen = mitMediathekEintrag(neuerGesehenEintrag(film), film, 123);
  const vorhanden = gleicheMediathekStatusAb({ 7: gesehen }, [film], [{ id: "123", watchmode_id: 7 }]);
  assert.equal(mediathekIdVon(vorhanden[7]), "123");
  const geloescht = gleicheMediathekStatusAb(vorhanden, [film], []);
  assert.equal(statusVon(geloescht[7]), "gesehen");
  assert.equal(mediathekIdVon(geloescht[7]), null);
});

ok("Neues Serien-Häkchen übernimmt belegten Staffelstand", () => {
  const e = neuerGesehenEintrag(serie({ staffeln_verfuegbar: 3 }), new Date("2026-07-21T10:00:00Z"));
  assert.equal(e.staffel_bestaetigt, 3);
  assert.equal(e.status, "gesehen");
});
ok("Neues Film-Häkchen wird nicht als Serienbeobachtung gespeichert", () => {
  assert.equal(neuerGesehenEintrag({ titel: "Testfilm", typ: "movie" }).typ, "movie");
});
ok("Neues Serien-Häkchen erfindet keinen Staffelstand", () => {
  assert.equal("staffel_bestaetigt" in neuerGesehenEintrag(serie()), false);
});

ok("Legacy-Häkchen erhält ersten Stand still als Basis", () => {
  const r = initialisiereStaffelstaende({ 42: "gesehen", 7: "erstellt" }, [serie({ staffeln_verfuegbar: 4 })], new Date("2026-07-21T10:00:00Z"));
  assert.equal(r[42].staffel_bestaetigt, 4);
  assert.equal(r[7], "erstellt");
  assert.equal(staffelHinweis(serie({ staffeln_verfuegbar: 4 }), r[42]), null);
});
ok("Unbekannter Stand verändert Legacy-Häkchen nicht", () => {
  const alt = { 42: "gesehen" };
  assert.equal(initialisiereStaffelstaende(alt, [serie()]), alt);
});

ok("Hinweis nur bei strikt größerem belegtem Stand", () => {
  assert.equal(staffelHinweis(serie({ staffeln_verfuegbar: 3 }), { status: "gesehen", staffel_bestaetigt: 3 }), null);
  assert.equal(staffelHinweis(serie({ staffeln_verfuegbar: 2 }), { status: "gesehen", staffel_bestaetigt: 3 }), null);
  assert.equal(staffelHinweis(serie(), { status: "gesehen", staffel_bestaetigt: 3 }), null);
  assert.equal(staffelHinweis(serie({ staffeln_verfuegbar: 4 }), "gesehen"), null);
  assert.equal(staffelHinweis(serie({ staffeln_verfuegbar: 4 }), { status: "gesehen", staffel_bestaetigt: 3 }).staffel_verfuegbar, 4);
});
ok("Hinweise werden stabil nach Titel sortiert", () => {
  const titel = [serie({ watchmode_id: 2, titel: "Zulu", staffeln_verfuegbar: 2 }), serie({ watchmode_id: 1, titel: "Alpha", staffeln_verfuegbar: 4 })];
  const status = { 1: { status: "gesehen", staffel_bestaetigt: 3 }, 2: { status: "gesehen", staffel_bestaetigt: 1 } };
  assert.deepEqual(neueStaffeln(titel, status).map((x) => x.titel), ["Alpha", "Zulu"]);
});
ok("Bestätigen erhöht, aber senkt den Stand nie", () => {
  const alt = { status: "gesehen", typ: "tv_series", staffel_bestaetigt: 5 };
  assert.equal(bestaetigeStaffel(alt, serie({ staffeln_verfuegbar: 4 })).staffel_bestaetigt, 5);
  assert.equal(bestaetigeStaffel(alt, serie({ staffeln_verfuegbar: 6 })).staffel_bestaetigt, 6);
});

ok("Config: nur explizit gesehene Serien mit stabiler ID", () => {
  const status = {
    42: { status: "gesehen", typ: "tv_series", staffel_bestaetigt: 3 },
    43: "gesehen",
    44: "gesehen",
    45: "erstellt",
  };
  const katalog = [serie(), { watchmode_id: 43, typ: "tv_series" }, { watchmode_id: 44, typ: "movie" }];
  assert.deepEqual(serienBeobachten(status, katalog), [
    { watchmode_id: 42, staffel_bestaetigt: 3 },
    { watchmode_id: 43 },
  ]);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("STAFFELN-TEST BESTANDEN");

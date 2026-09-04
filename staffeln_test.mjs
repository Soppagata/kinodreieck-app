import assert from "node:assert/strict";
import {
  statusVon, mediathekIdVon, mitMediathekEintrag, ohneMediathekEintrag,
  gleicheMediathekStatusAb, neuerGesehenEintrag, toggleGesehenInStatus,
} from "./src/lib/staffeln.js";

let checks = 0;
const ok = (name, fn) => { fn(); checks++; console.log("✓ " + name); };
const serie = (extra = {}) => ({ watchmode_id: 42, titel: "Testserie", typ: "tv_series", ...extra });

ok("Alte und neue Gesehen-Status bleiben lesbar", () => {
  assert.equal(statusVon("gesehen"), "gesehen");
  assert.equal(statusVon({ status: "gesehen" }), "gesehen");
  assert.equal(statusVon({ foo: 1 }), null);
});
ok("Mediathek-Verknüpfung bleibt orthogonal zum Gesehen-Status", () => {
  const gesehen = neuerGesehenEintrag(serie(), new Date("2026-07-21T10:00:00Z"));
  const linked = mitMediathekEintrag(gesehen, serie(), "testserie_2026");
  assert.equal(statusVon(linked), "gesehen");
  assert.equal(mediathekIdVon(linked), "testserie_2026");
  assert.equal(mediathekIdVon(ohneMediathekEintrag(linked)), null);
});
ok("Legacy-Erstellt lässt sich nach einer Filmlöschung vollständig lösen", () => {
  assert.equal(mediathekIdVon("erstellt"), true);
  assert.equal(ohneMediathekEintrag("erstellt"), null);
});
ok("Mediathek-Abgleich verknüpft starke IDs, ohne gesehen zu erfinden", () => {
  const result = gleicheMediathekStatusAb({}, [serie()], [{ id: "testserie_2026", watchmode_id: 42 }]);
  assert.equal(mediathekIdVon(result[42]), "testserie_2026");
  assert.equal(statusVon(result[42]), "erstellt");
});
ok("Mediathek-Abgleich erhält Gesehen nach einer späteren Filmlöschung", () => {
  const linked = mitMediathekEintrag(neuerGesehenEintrag(serie()), serie(), "testserie_2026");
  const result = gleicheMediathekStatusAb({ 42: linked }, [serie()], []);
  assert.equal(statusVon(result[42]), "gesehen");
  assert.equal(mediathekIdVon(result[42]), null);
});
ok("Gesehen-Toggle erzeugt keinen Staffel- oder Beobachtet-Status", () => {
  const entry = neuerGesehenEintrag(serie());
  assert.equal(entry.status, "gesehen");
  assert.equal("staffel_bestaetigt" in entry, false);
  assert.equal("beobachtet" in entry, false);
});
ok("Gesehen-Toggle bewahrt unbekannte historische Zusatzfelder ohne sie auszuwerten", () => {
  const initial = { 42: { status: "gesehen", historisch: true, mediathek_id: "x" } };
  const result = toggleGesehenInStatus(initial, serie());
  assert.deepEqual(result[42], { historisch: true, mediathek_id: "x" });
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("STREAMING-STATUS-TEST BESTANDEN");

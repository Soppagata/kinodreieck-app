import assert from "node:assert/strict";
import {
  cacheGueltig, staffelstandAusQuellen, pruefeBeobachteteSerien,
  reichereBeobachteteSerienAn,
} from "./tools/staffel_pipeline_entwurf.mjs";

let checks = 0;
const ok = async (name, fn) => { await fn(); checks++; console.log("✓ " + name); };
const setup = { quellen_at: [{ id: 1, name: "Netflix" }, { id: 2, name: "Disney+" }, { id: 3, name: "Prime Video" }] };

await ok("Quellen: nur AT + ausgewählte Dienste", () => {
  const r = staffelstandAusQuellen([
    { source_id: 1, region: "AT", seasons: 4 },
    { source_id: 2, region: "AT", seasons: 6 },
    { source_id: 3, region: "AT", seasons: 9 },
    { source_id: 1, region: "US", seasons: 12 },
  ], ["Netflix", "Disney+"], setup);
  assert.deepEqual(r, { staffeln_verfuegbar: 6, staffel_dienste: ["Disney+"] });
});
await ok("Quellen: null/fehlende Staffelwerte sind folgenlos", () => {
  assert.equal(staffelstandAusQuellen([{ source_id: 1, region: "AT", seasons: null }], ["Netflix"], setup), null);
});
await ok("Cache: innerhalb TTL gültig", () => assert.equal(cacheGueltig({ geprueft_am: "2026-07-20T12:00:00Z" }, new Date("2026-07-21T12:00:00Z").getTime(), 2), true));
await ok("Cache: nach TTL ungültig", () => assert.equal(cacheGueltig({ geprueft_am: "2026-07-18T12:00:00Z" }, new Date("2026-07-21T12:00:00Z").getTime(), 2), false));

await ok("Pipeline: nur beobachtete IDs, seriell und Region AT", async () => {
  const aufrufe = [];
  const r = await pruefeBeobachteteSerien({
    config: { quellen: ["Netflix"], serien_beobachten: [{ watchmode_id: 42 }, { watchmode_id: 42 }, { watchmode_id: 77 }] },
    setup, jetzt: new Date("2026-07-21T12:00:00Z"),
    quotaGuard: () => true,
    holeQuellen: async (id, opts) => { aufrufe.push([id, opts]); return id === 42 ? [{ source_id: 1, region: "AT", seasons: 5 }] : []; },
  });
  assert.deepEqual(aufrufe, [[42, { regions: "AT" }], [77, { regions: "AT" }]]);
  assert.equal(r.calls, 2);
  assert.equal(r.staende[42].staffeln_verfuegbar, 5);
  assert.equal(r.staende[77], undefined);
});
await ok("Pipeline: Cache verhindert erneuten Call", async () => {
  const r = await pruefeBeobachteteSerien({
    config: { quellen: ["Netflix"], serien_beobachten: [{ watchmode_id: 42 }] }, setup,
    cache: { 42: { geprueft_am: "2026-07-21T11:00:00Z", wert: { staffeln_verfuegbar: 5, staffel_dienste: ["Netflix"] } } },
    jetzt: new Date("2026-07-21T12:00:00Z"), holeQuellen: async () => { throw new Error("darf nicht laufen"); },
  });
  assert.equal(r.calls, 0);
  assert.equal(r.staende[42].staffeln_verfuegbar, 5);
});
await ok("Pipeline: Quota-Guard stoppt vor jedem Call", async () => {
  const r = await pruefeBeobachteteSerien({
    config: { quellen: ["Netflix"], serien_beobachten: [{ watchmode_id: 42 }] }, setup,
    holeQuellen: async () => { throw new Error("darf nicht laufen"); }, quotaGuard: () => false,
  });
  assert.equal(r.calls, 0);
  assert.equal(r.fehler.length, 1);
});
await ok("Pipeline: Einzelfehler erzeugt keinen Stand", async () => {
  const r = await pruefeBeobachteteSerien({
    config: { quellen: ["Netflix"], serien_beobachten: [{ watchmode_id: 42 }] }, setup,
    holeQuellen: async () => { throw new Error("Fixture-Fehler"); }, quotaGuard: () => true,
  });
  assert.equal(r.staende[42], undefined);
  assert.equal(r.fehler[0].watchmode_id, 42);
});
await ok("Ausgabe: nur beobachtete Treffer werden angereichert", () => {
  const alt = [{ watchmode_id: 42, titel: "A" }, { watchmode_id: 77, titel: "B" }];
  const neu = reichereBeobachteteSerienAn(alt, { 42: { staffeln_verfuegbar: 5, staffel_dienste: ["Netflix"] } });
  assert.equal(neu[0].staffeln_verfuegbar, 5);
  assert.equal(neu[1], alt[1]);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("STAFFEL-PIPELINE-ENTWURF-TEST BESTANDEN (0 API-Calls)");

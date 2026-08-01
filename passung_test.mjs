import assert from "node:assert/strict";
import fs from "node:fs";
import { istPassend, lesbaresPassungsSignal, passungStufe } from "./src/lib/passung.js";

let checks = 0;
const ok = (name, fn) => { fn(); checks++; console.log("✓ " + name); };
const titel = (relevanz_signale, relevanz = 99) => ({ relevanz, relevanz_signale });

ok("Jahrzehnt allein bleibt auch bei hoher Rohzahl gering", () => {
  assert.equal(passungStufe(titel(["jahrzehnt:2000er(+9.9)"])), "gering");
});
ok("Publikumswert und Neuheit erfinden keine persönliche Passung", () => {
  assert.equal(passungStufe(titel(["user_score:95(+0.5)", "neu(+1)"])), "gering");
  assert.equal(istPassend(titel(["user_score:95(+0.5)", "neu(+1)"])), false);
});
ok("Ein starkes Profilsignal ergibt mittel", () => {
  assert.equal(passungStufe(titel(["genre:horror(+1.7)", "jahrzehnt:2000er(+1.5)"])), "mittel");
});
ok("Hoch braucht zwei unabhängige sinnvolle Signale samt starkem Signal", () => {
  assert.equal(passungStufe(titel(["genre:horror(+1.7)", "tag:duester(+0.5)"])), "hoch");
  assert.equal(istPassend(titel(["genre:horror(+1.7)", "tag:duester(+0.5)"])), true);
});
ok("Doppelte Signale zählen nicht doppelt", () => {
  assert.equal(passungStufe(titel(["genre:horror(+1)", "genre:horror(+2)"])), "mittel");
});
ok("Fehlende Rohzahl zeigt keine erfundene Stufe", () => {
  assert.equal(passungStufe({ relevanz_signale: ["genre:horror(+2)"] }), null);
});
ok("Signale werden verständlich beschriftet", () => {
  assert.equal(lesbaresPassungsSignal("jahrzehnt:2000er(+1.5)"), "Jahrzehnt 2000er");
  assert.equal(lesbaresPassungsSignal("genre:horror(+1.7)"), "Genre horror");
});
ok("Der gebündelte Katalogvertrag erzeugt aus schwachen Signalen keine Empfehlung", () => {
  const snapshot = JSON.parse(fs.readFileSync(new URL("./src/data/streaming_entdecken_snapshot.json", import.meta.url), "utf8"));
  const schwacheEintraege = snapshot.titel.filter((eintrag) => (eintrag.relevanz_signale || []).every((signal) => (
    /^(jahrzehnt|user_score|neu)(:|\(|$)/i.test(String(signal))
  )));
  assert.ok(schwacheEintraege.length > 0);
  assert.ok(schwacheEintraege.every((eintrag) => passungStufe(eintrag) === "gering"));
  assert.ok(schwacheEintraege.every((eintrag) => !istPassend(eintrag)));
});
ok("Unbekannte künftige Signalarten werden defensiv nicht hoch gestuft", () => {
  assert.equal(passungStufe(titel(["unbekannt:irgendwas(+99)"])), "gering");
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("PASSUNG-TEST BESTANDEN");

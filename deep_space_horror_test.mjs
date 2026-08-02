import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEEP_SPACE_REFERENZEN,
  findeDeepSpaceReferenz,
  istDeepSpaceFreigeschaltet,
  pruefeDeepSpaceEintritt,
  zaehleDeepSpaceReferenzen,
} from "./src/lib/deepSpaceHorror.js";

let fehler = 0;
function test(name, pruefung) {
  try {
    pruefung();
    console.log(`✓ ${name}`);
  } catch (error) {
    fehler += 1;
    console.error(`✗ ${name}`);
    console.error(error && error.stack ? error.stack : error);
  }
}

class MemoryStorage {
  constructor() {
    this.daten = new Map();
  }
  getItem(key) {
    return this.daten.has(key) ? this.daten.get(key) : null;
  }
  setItem(key, wert) {
    this.daten.set(key, String(wert));
  }
  zustand(ownerFragment = "") {
    const eintrag = [...this.daten.entries()].find(([key]) => decodeURIComponent(key).includes(ownerFragment));
    return eintrag ? JSON.parse(eintrag[1]) : null;
  }
}

const datum = (jahr, monat, tag, stunde = 12) => new Date(jahr, monat - 1, tag, stunde, 0, 0, 0);
const film = (titel, jahr, extra = {}) => ({ typ: "film", titel, jahr, ...extra });
const eintritt = (storage, jetzt, zufall = () => 0.5, ownerKey = "gast") =>
  pruefeDeepSpaceEintritt({ storage, jetzt, zufall, ownerKey });

test("Konfiguration enthält genau elf eindeutige Filmreferenzen", () => {
  assert.equal(DEEP_SPACE_REFERENZEN.length, 11);
  assert.equal(new Set(DEEP_SPACE_REFERENZEN.map((ref) => ref.id)).size, 11);
  const erwartet = [
    ["Alien", 1979], ["Aliens", 1986], ["Alien 3", 1992], ["Alien: Resurrection", 1997],
    ["Alien vs. Predator", 2004], ["Aliens vs. Predator: Requiem", 2007],
    ["Prometheus", 2012], ["Alien: Covenant", 2017], ["Alien: Romulus", 2024],
    ["Event Horizon", 1997], ["2001: A Space Odyssey", 1968],
  ];
  for (const [titel, jahr] of erwartet) assert.ok(findeDeepSpaceReferenz(film(titel, jahr)), `${titel} (${jahr}) fehlt`);
});

test("deutsche und originale Titel treffen nur mit exaktem Jahr", () => {
  assert.equal(findeDeepSpaceReferenz(film("Aliens – Die Rückkehr", 1986))?.id, "aliens-1986");
  assert.equal(findeDeepSpaceReferenz(film("Aliens", 1986))?.id, "aliens-1986");
  assert.equal(findeDeepSpaceReferenz(film("Alien – Die Wiedergeburt", 1997))?.id, "alien-resurrection-1997");
  assert.equal(findeDeepSpaceReferenz(film("Prometheus – Dunkle Zeichen", 2012))?.id, "prometheus-2012");
  assert.equal(findeDeepSpaceReferenz(film("Event Horizon – Am Rande des Universums", 1997))?.id, "event-horizon-1997");
  assert.equal(findeDeepSpaceReferenz(film("2001: Odyssee im Weltraum", 1968))?.id, "2001-a-space-odyssey-1968");
  assert.equal(findeDeepSpaceReferenz(film("Alien³", 1992))?.id, "alien-3-1992");
  assert.equal(findeDeepSpaceReferenz(film("Aliens", 1987)), null);
  assert.equal(findeDeepSpaceReferenz(film("Alien", 1992)), null);
});

test("Originaltitel-Feld wird berücksichtigt, ohne unscharfe Teiltreffer", () => {
  assert.equal(findeDeepSpaceReferenz(film("Die Rückkehr", 1986, { originaltitel: "Aliens" }))?.id, "aliens-1986");
  assert.equal(findeDeepSpaceReferenz(film("Alien Fan Documentary", 1979)), null);
  assert.equal(findeDeepSpaceReferenz(film("Alien: Romulus Extended", 2024)), null);
});

test("nur Typ Film zählt", () => {
  assert.equal(findeDeepSpaceReferenz({ typ: "serie", titel: "Alien", jahr: 1979 }), null);
  assert.equal(findeDeepSpaceReferenz({ typ: "kurzfilm", titel: "Alien", jahr: 1979 }), null);
  assert.equal(findeDeepSpaceReferenz({ typ: "dokumentation", titel: "Alien", jahr: 1979 }), null);
  assert.equal(findeDeepSpaceReferenz({ titel: "Alien", jahr: 1979 }), null);
});

test("Dubletteneinträge derselben Referenz zählen nur einmal", () => {
  const liste = [
    film("Aliens", 1986),
    film("Aliens – Die Rückkehr", 1986),
    film("Prometheus", 2012),
    film("Event Horizon", 1997),
  ];
  assert.equal(zaehleDeepSpaceReferenzen(liste), 3);
  assert.equal(istDeepSpaceFreigeschaltet(liste), false);
  assert.equal(istDeepSpaceFreigeschaltet([...liste, film("Alien: Romulus", 2024)]), true);
});

test("erster zulässiger Eintritt würfelt sofort und Fehlwurf sperrt drei Kalendertage", () => {
  const storage = new MemoryStorage();
  const erster = eintritt(storage, datum(2026, 8, 2));
  assert.deepEqual(erster, { gewuerfelt: true, treffer: false, grund: "fehlwurf", naechsterTermin: "2026-08-05" });
  assert.equal(eintritt(storage, datum(2026, 8, 4)).gewuerfelt, false);
  assert.equal(eintritt(storage, datum(2026, 8, 5)).gewuerfelt, true);
});

test("RNG-Grenze: 0.099999 trifft, 0.1 verfehlt", () => {
  const treffer = eintritt(new MemoryStorage(), datum(2026, 1, 1), () => 0.099999);
  const fehlwurf = eintritt(new MemoryStorage(), datum(2026, 1, 1), () => 0.1);
  assert.equal(treffer.treffer, true);
  assert.equal(treffer.naechsterTermin, "2026-01-06");
  assert.equal(fehlwurf.treffer, false);
  assert.equal(fehlwurf.naechsterTermin, "2026-01-04");
});

test("Treffer sperrt fünf Tage, danach gilt für den nächsten Fehlwurf wieder +3", () => {
  const storage = new MemoryStorage();
  assert.equal(eintritt(storage, datum(2026, 3, 10), () => 0).naechsterTermin, "2026-03-15");
  assert.equal(eintritt(storage, datum(2026, 3, 14)).gewuerfelt, false);
  const danach = eintritt(storage, datum(2026, 3, 15), () => 0.7);
  assert.equal(danach.gewuerfelt, true);
  assert.equal(danach.naechsterTermin, "2026-03-18");
});

test("Kalenderarithmetik funktioniert über Monat, Jahr und Schaltjahr", () => {
  assert.equal(eintritt(new MemoryStorage(), datum(2026, 1, 30)).naechsterTermin, "2026-02-02");
  assert.equal(eintritt(new MemoryStorage(), datum(2026, 12, 30)).naechsterTermin, "2027-01-02");
  assert.equal(eintritt(new MemoryStorage(), datum(2028, 2, 27)).naechsterTermin, "2028-03-01");
  assert.equal(eintritt(new MemoryStorage(), datum(2028, 2, 27), () => 0).naechsterTermin, "2028-03-03");
});

test("Kalendertage bleiben auch über die Sommerzeit lokale Tage", () => {
  const storage = new MemoryStorage();
  const ergebnis = eintritt(storage, datum(2026, 3, 27, 23));
  assert.equal(ergebnis.naechsterTermin, "2026-03-30");
  assert.equal(eintritt(storage, datum(2026, 3, 30, 0)).gewuerfelt, true);
});

test("Halloween gewährt während einer Sperre genau einen Bonuswurf und erhält bei Fehlwurf den Termin", () => {
  const storage = new MemoryStorage();
  assert.equal(eintritt(storage, datum(2026, 10, 29), () => 0).naechsterTermin, "2026-11-03");
  const halloween = eintritt(storage, datum(2026, 10, 31), () => 0.9);
  assert.deepEqual(halloween, { gewuerfelt: true, treffer: false, grund: "halloween-fehlwurf", naechsterTermin: "2026-11-03" });
  assert.equal(eintritt(storage, datum(2026, 10, 31), () => 0).gewuerfelt, false);
});

test("Halloween-Treffer während Sperre setzt den Termin auf +5", () => {
  const storage = new MemoryStorage();
  eintritt(storage, datum(2026, 10, 29), () => 0);
  const halloween = eintritt(storage, datum(2026, 10, 31), () => 0.01);
  assert.equal(halloween.treffer, true);
  assert.equal(halloween.naechsterTermin, "2026-11-05");
});

test("regulärer Halloween-Termin verdoppelt die Chance nicht", () => {
  const storage = new MemoryStorage();
  let aufrufe = 0;
  const halloween = eintritt(storage, datum(2026, 10, 31), () => { aufrufe += 1; return 0.9; });
  assert.equal(halloween.gewuerfelt, true);
  assert.equal(aufrufe, 1);
  assert.equal(eintritt(storage, datum(2026, 10, 31), () => { aufrufe += 1; return 0; }).gewuerfelt, false);
  assert.equal(aufrufe, 1);
});

test("Gast und Konten besitzen getrennte Rhythmuszyklen", () => {
  const storage = new MemoryStorage();
  assert.equal(eintritt(storage, datum(2026, 8, 2), () => 0.5, "gast").gewuerfelt, true);
  assert.equal(eintritt(storage, datum(2026, 8, 2), () => 0.5, "konto-a").gewuerfelt, true);
  assert.equal(eintritt(storage, datum(2026, 8, 2), () => 0.5, "konto-b").gewuerfelt, true);
  assert.equal(eintritt(storage, datum(2026, 8, 2), () => 0.5, "konto-a").gewuerfelt, false);
  assert.ok(storage.zustand("konto-a"));
  assert.ok(storage.zustand("konto-b"));
});

test("Reload und wiederholtes Umschalten erzeugen am selben Tag keinen Mehrfachwurf", () => {
  const storage = new MemoryStorage();
  let aufrufe = 0;
  const rng = () => { aufrufe += 1; return 0.5; };
  eintritt(storage, datum(2026, 6, 1, 8), rng);
  eintritt(storage, datum(2026, 6, 1, 12), rng);
  eintritt(storage, datum(2026, 6, 1, 23), rng);
  assert.equal(aufrufe, 1);
});

test("verspäteter Start sammelt keine Termine, sondern rechnet vom tatsächlichen Versuchstag", () => {
  const storage = new MemoryStorage();
  eintritt(storage, datum(2026, 4, 1), () => 0.5);
  const spaet = eintritt(storage, datum(2026, 4, 20), () => 0.5);
  assert.equal(spaet.gewuerfelt, true);
  assert.equal(spaet.naechsterTermin, "2026-04-23");
  assert.equal(eintritt(storage, datum(2026, 4, 20), () => 0).gewuerfelt, false);
});

test("zurückgestellte Gerätezeit blockiert weitere Versuche", () => {
  const storage = new MemoryStorage();
  eintritt(storage, datum(2026, 8, 1), () => 0.5);
  // Auch ein gesperrter Besuch schreibt lastSeen fort.
  assert.equal(eintritt(storage, datum(2026, 8, 3), () => 0.5).gewuerfelt, false);
  let aufrufe = 0;
  const rueckwaerts = eintritt(storage, datum(2026, 8, 2), () => { aufrufe += 1; return 0; });
  assert.equal(rueckwaerts.grund, "uhr-zurueckgestellt");
  assert.equal(aufrufe, 0);
});

test("Lesefehler blockiert fail-closed und ruft RNG nicht auf", () => {
  let aufrufe = 0;
  const storage = { getItem() { throw new Error("kaputt"); }, setItem() {} };
  const ergebnis = pruefeDeepSpaceEintritt({
    jetzt: datum(2026, 8, 2), ownerKey: "gast", storage,
    zufall: () => { aufrufe += 1; return 0; },
  });
  assert.equal(ergebnis.grund, "speicher-lesefehler");
  assert.equal(aufrufe, 0);
});

test("ungültiger gespeicherter Zustand wird nicht als Erstversuch behandelt", () => {
  let aufrufe = 0;
  const storage = { getItem() { return "{kaputt"; }, setItem() {} };
  const ergebnis = pruefeDeepSpaceEintritt({
    jetzt: datum(2026, 8, 2), ownerKey: "gast", storage,
    zufall: () => { aufrufe += 1; return 0; },
  });
  assert.equal(ergebnis.grund, "speicher-ungueltig");
  assert.equal(aufrufe, 0);
});

test("Schreibfehler und stilles Nichtschreiben blockieren vor dem RNG", () => {
  for (const storage of [
    { getItem() { return null; }, setItem() { throw new Error("voll"); } },
    { getItem() { return null; }, setItem() {} },
  ]) {
    let aufrufe = 0;
    const ergebnis = pruefeDeepSpaceEintritt({
      jetzt: datum(2026, 8, 2), ownerKey: "gast", storage,
      zufall: () => { aufrufe += 1; return 0; },
    });
    assert.equal(ergebnis.grund, "speicher-schreibfehler");
    assert.equal(ergebnis.gewuerfelt, false);
    assert.equal(aufrufe, 0);
  }
});

test("ein Treffer wird erst sichtbar zurückgegeben, nachdem die Fünf-Tage-Sperre gespeichert ist", () => {
  class ZweiterSchreibzugriffScheitert extends MemoryStorage {
    setItem(key, wert) {
      this.aufrufe = (this.aufrufe || 0) + 1;
      if (this.aufrufe === 2) throw new Error("zweiter Schreibzugriff fehlgeschlagen");
      super.setItem(key, wert);
    }
  }
  const storage = new ZweiterSchreibzugriffScheitert();
  const ergebnis = eintritt(storage, datum(2026, 8, 2), () => 0);
  assert.equal(ergebnis.gewuerfelt, true);
  assert.equal(ergebnis.treffer, false);
  assert.equal(ergebnis.grund, "treffer-nicht-persistiert");
  assert.equal(storage.zustand("gast").nextEligible, "2026-08-05");
});

test("gespeicherter Zustand enthält ausschließlich die spezifizierten Rhythmusfelder", () => {
  const storage = new MemoryStorage();
  eintritt(storage, datum(2026, 8, 2), () => 0.5);
  assert.deepEqual(Object.keys(storage.zustand("gast")).sort(), [
    "halloweenAttempt", "lastAttempt", "lastSeen", "nextEligible", "version",
  ]);
});

test("Animationswerkstatt ist an DEV und einen ausdrücklichen Query-Parameter gebunden", () => {
  const appQuelle = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
  assert.match(appQuelle, /deepSpaceTestmodusAktiv\s*=\s*import\.meta\.env\.DEV/);
  assert.match(appQuelle, /get\("deep-space-test"\)\s*===\s*"1"/);
  assert.match(appQuelle, /neonNoirAktiv:\s*!deepSpaceTestmodusAktiv/);
  assert.match(appQuelle, /data-kd-deep-space-test=/);
});

if (fehler) {
  console.error(`\n${fehler} Deep-Space-Horror-Test(s) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle Deep-Space-Horror-Tests bestanden.");

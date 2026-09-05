/* Katalog-Neuheiten — Diff gegen den ECHTEN Katalogschnitt.
   ==========================================================
   Diese Datei existiert wegen einer konkreten Lehre: Die vorhandenen
   Entdecken-Fixtures setzen `genres: ["drama"]`. Im echten Katalog ist
   `genres` bei allen 12.540 Titeln `null`, `staffeln_verfuegbar` bei
   allen 3.627 Serien leer. Grüne Tests gegen eine Datenform, die es
   nicht gibt, haben zwei Funktionen still totgelegt.

   Die Fixtures hier tragen deshalb bewusst die ECHTE Form:
   genres null, keine Staffelfelder, Dienstnamen wörtlich wie im
   Katalog ("Prime Video", nicht "Amazon Prime Video"), relevanz_signale
   mit der einzigen real vorkommenden Art `jahrzehnt`.

   Läuft zusätzlich gegen dist-single-beta/streaming_entdecken.json,
   falls vorhanden. Fehlt die Datei, wird das gemeldet, nicht verschwiegen. */

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  KATALOG_BASIS_VERSION,
  erstelleKatalogBasis,
  fuehreNeuheitenFort,
  istGueltigeBasis,
  vergleicheKatalog,
  waehleNeuheiten,
  zaehleNeuheiten,
} from "./src/lib/katalogNeuheiten.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };

const zeile = (id, titel, extra = {}) => ({
  watchmode_id: id, titel, jahr: 2024, typ: "movie",
  genres: null, user_score: null, tmdb_id: null, imdb_id: null,
  dienste: ["Netflix"], relevanz: 1.5, relevanz_signale: ["jahrzehnt:2020er(+1.5)"],
  ...extra,
});
const katalog = (titel) => ({
  region: "AT", stand: "2026-08-22T00:00:00.000Z", katalog_stand: "2026-08-22", titel,
});

const gestern = katalog([
  zeile(1, "Bekannter Film"),
  zeile(2, "Bekannte Serie", { typ: "tv_series", dienste: ["Disney+"] }),
]);
const heute = katalog([
  zeile(1, "Bekannter Film"),
  zeile(2, "Bekannte Serie", { typ: "tv_series", dienste: ["Disney+", "Netflix"] }),
  zeile(3, "The Ninth Jedi", { typ: "tv_series", dienste: ["Disney+"] }),
]);

check("Basis trägt Version, Region und Dienstwörterbuch", () => {
  const basis = erstelleKatalogBasis(gestern, { heute: "2026-08-21" });
  assert.equal(basis.version, KATALOG_BASIS_VERSION);
  assert.equal(basis.region, "AT");
  assert.equal(istGueltigeBasis(basis), true);
  assert.deepEqual([...basis.dienste].sort(), ["Disney+", "Netflix"]);
});

check("Fehlende oder kaputte Basis wird erkannt", () => {
  for (const wert of [null, undefined, {}, [], { version: 99, dienste: [], eintraege: {} }]) {
    assert.equal(istGueltigeBasis(wert), false);
  }
});

/* Der teuerste denkbare Fehler: Beim ersten Blick sind alle 12.540
   Titel "neu". Der erste Lauf muss still die Basis setzen. */
check("Erster Lauf meldet nichts und setzt nur die Basis", () => {
  const ergebnis = vergleicheKatalog(null, heute, { heute: "2026-08-22" });
  assert.equal(ergebnis.status, "basis-gesetzt");
  assert.deepEqual(ergebnis.funde, []);
  assert.equal(istGueltigeBasis(ergebnis.basis), true);
});

check("Leerer Katalog ändert die Basis nicht", () => {
  const basis = erstelleKatalogBasis(gestern, { heute: "2026-08-21" });
  const ergebnis = vergleicheKatalog(basis, katalog([]), { heute: "2026-08-22" });
  assert.equal(ergebnis.status, "kein-katalog");
  assert.equal(ergebnis.basis, basis);
});

check("Neue watchmode_id wird als 'neu' gemeldet", () => {
  const basis = erstelleKatalogBasis(gestern, { heute: "2026-08-21" });
  const funde = vergleicheKatalog(basis, heute, { heute: "2026-08-22" }).funde;
  const neu = funde.filter((fund) => fund.art === "neu");
  assert.equal(neu.length, 1);
  assert.equal(neu[0].titel, "The Ninth Jedi");
  assert.equal(neu[0].typ, "tv_series");
  assert.equal(neu[0].gefundenAm, "2026-08-22");
});

check("Zusätzlicher Dienst wird als 'dienst' gemeldet, nicht als 'neu'", () => {
  const basis = erstelleKatalogBasis(gestern, { heute: "2026-08-21" });
  const funde = vergleicheKatalog(basis, heute, { heute: "2026-08-22" }).funde;
  const dienst = funde.filter((fund) => fund.art === "dienst");
  assert.equal(dienst.length, 1);
  assert.equal(dienst[0].titel, "Bekannte Serie");
  assert.deepEqual(dienst[0].neueDienste, ["Netflix"]);
});

check("Unveränderter Katalog meldet nichts", () => {
  const basis = erstelleKatalogBasis(heute, { heute: "2026-08-22" });
  const ergebnis = vergleicheKatalog(basis, heute, { heute: "2026-08-22" });
  assert.equal(ergebnis.status, "keine-aenderung");
  assert.deepEqual(ergebnis.funde, []);
});

check("Ein verschwundener Dienst erzeugt keine Meldung", () => {
  const basis = erstelleKatalogBasis(heute, { heute: "2026-08-22" });
  const weniger = katalog([
    zeile(1, "Bekannter Film"),
    zeile(2, "Bekannte Serie", { typ: "tv_series", dienste: ["Disney+"] }),
    zeile(3, "The Ninth Jedi", { typ: "tv_series", dienste: ["Disney+"] }),
  ]);
  assert.deepEqual(vergleicheKatalog(basis, weniger, { heute: "2026-08-23" }).funde, []);
});

check("Dienstvergleich ist schreibweisenunabhängig wie in entdeckenUi", () => {
  const funde = [{
    watchmodeId: 3, titel: "The Ninth Jedi", jahr: 2026, typ: "tv_series",
    art: "neu", dienste: ["Disney+"], neueDienste: ["Disney+"], gefundenAm: "2026-08-22",
  }];
  assert.equal(waehleNeuheiten(funde, { dienste: ["disney+"] }).length, 1);
  assert.equal(waehleNeuheiten(funde, { dienste: [" Disney+ "] }).length, 1);
  assert.equal(waehleNeuheiten(funde, { dienste: ["Netflix"] }).length, 0);
});

check("Gesehenes verschwindet aus der Anzeige", () => {
  const funde = [{
    watchmodeId: 3, titel: "The Ninth Jedi", jahr: 2026, typ: "tv_series",
    art: "neu", dienste: ["Disney+"], neueDienste: ["Disney+"], gefundenAm: "2026-08-22",
  }];
  assert.equal(waehleNeuheiten(funde, { entdeckenStatus: { 3: { status: "gesehen" } } }).length, 0);
  assert.equal(waehleNeuheiten(funde, { entdeckenStatus: { 3: "gesehen" } }).length, 0);
  assert.equal(waehleNeuheiten(funde, { entdeckenStatus: { 3: { beobachtet: true } } }).length, 1);
});

check("Alte Funde fallen nach dem Fenster heraus", () => {
  const alt = [{
    watchmodeId: 9, titel: "Alt", jahr: 2020, typ: "movie",
    art: "neu", dienste: ["Netflix"], neueDienste: ["Netflix"], gefundenAm: "2026-06-01",
  }];
  const neu = [{
    watchmodeId: 3, titel: "Neu", jahr: 2026, typ: "movie",
    art: "neu", dienste: ["Netflix"], neueDienste: ["Netflix"], gefundenAm: "2026-08-22",
  }];
  const gefuehrt = fuehreNeuheitenFort(alt, neu, { heute: "2026-08-22" });
  assert.deepEqual(gefuehrt.map((eintrag) => eintrag.watchmodeId), [3]);
});

check("Der erste Fund eines Titels gewinnt gegen einen späteren Dienstfund", () => {
  const erst = [{
    watchmodeId: 3, titel: "Neu", jahr: 2026, typ: "movie",
    art: "neu", dienste: ["Netflix"], neueDienste: ["Netflix"], gefundenAm: "2026-08-20",
  }];
  const spaeter = [{
    watchmodeId: 3, titel: "Neu", jahr: 2026, typ: "movie",
    art: "dienst", dienste: ["Netflix", "Disney+"], neueDienste: ["Disney+"], gefundenAm: "2026-08-22",
  }];
  const gefuehrt = fuehreNeuheitenFort(erst, spaeter, { heute: "2026-08-22" });
  assert.equal(gefuehrt.length, 1);
  assert.equal(gefuehrt[0].art, "neu");
});

check("Serien- und Filmfilter trennen sauber", () => {
  const funde = [
    { watchmodeId: 1, titel: "F", jahr: 2026, typ: "movie", art: "neu", dienste: [], neueDienste: [], gefundenAm: "2026-08-22" },
    { watchmodeId: 2, titel: "S", jahr: 2026, typ: "tv_series", art: "neu", dienste: [], neueDienste: [], gefundenAm: "2026-08-22" },
  ];
  assert.equal(waehleNeuheiten(funde, { typ: "film" }).length, 1);
  assert.equal(waehleNeuheiten(funde, { typ: "serie" })[0].titel, "S");
  assert.equal(zaehleNeuheiten(funde, {}).serien, 1);
});

/* Der zweite teure Fehler: Ein neues Abo darf keine Flut alter Titel
   als "neu" ausweisen. Der Diff läuft über den ganzen Katalog; die
   Dienstewahl wirkt erst bei der Anzeige. */
check("Ein neu angehaktes Abo erzeugt keine Scheinneuheiten", () => {
  const gross = katalog(Array.from({ length: 500 }, (unused, index) => (
    zeile(1000 + index, `Titel ${index}`, { dienste: ["Joyn"] })
  )));
  const basis = erstelleKatalogBasis(gross, { heute: "2026-08-21" });
  const ergebnis = vergleicheKatalog(basis, gross, { heute: "2026-08-22" });
  assert.deepEqual(ergebnis.funde, []);
  assert.equal(waehleNeuheiten(ergebnis.funde, { dienste: ["Joyn"] }).length, 0);
});

/* Echtdatenprobe. Sie ist der eigentliche Grund für diese Datei. */
const echtPfad = new URL("./dist-single-beta/streaming_entdecken.json", import.meta.url);
if (fs.existsSync(echtPfad)) {
  const echt = JSON.parse(fs.readFileSync(echtPfad, "utf8"));
  check("Echtkatalog: Basis entsteht und bleibt speicherbar", () => {
    const basis = erstelleKatalogBasis(echt, { heute: "2026-08-22" });
    const bytes = JSON.stringify(basis).length;
    assert.equal(istGueltigeBasis(basis), true);
    assert.ok(Object.keys(basis.eintraege).length > 10_000, "Katalog wirkt unerwartet klein");
    assert.ok(bytes < 1_000_000, `Basis zu groß für den lokalen Speicher: ${bytes} Bytes`);
    console.log(`  → ${Object.keys(basis.eintraege).length} Titel, ${basis.dienste.length} Dienste, ${(bytes / 1024).toFixed(0)} KB`);
  });

  check("Echtkatalog: entfernte Titel tauchen als Neuheiten wieder auf", () => {
    const fehlend = new Set(echt.titel.slice(500, 540).map((eintrag) => eintrag.watchmode_id));
    const vorher = { ...echt, titel: echt.titel.filter((eintrag) => !fehlend.has(eintrag.watchmode_id)) };
    const basis = erstelleKatalogBasis(vorher, { heute: "2026-08-21" });
    const funde = vergleicheKatalog(basis, echt, { heute: "2026-08-22" }).funde;
    assert.equal(funde.filter((fund) => fund.art === "neu").length, 40);
  });

  check("Echtkatalog: Serien sind erkennbar, Staffelfelder fehlen weiterhin", () => {
    const serien = echt.titel.filter((eintrag) => eintrag.typ === "tv_series");
    assert.ok(serien.length > 1000, "Keine Serien im Katalog gefunden");
    const mitStaffel = serien.filter((eintrag) => eintrag.staffeln_verfuegbar != null).length;
    assert.equal(mitStaffel, 0,
      "staffeln_verfuegbar ist jetzt gefüllt — dann kann 'Beobachtet' endlich neue Staffeln melden "
      + "und dieser Test gehört zusammen mit staffeln.js neu bewertet.");
    console.log(`  → ${serien.length} Serien, davon ${mitStaffel} mit Staffelstand (Pipeline-Lücke, siehe staffeln.js)`);
  });
} else {
  console.log("… dist-single-beta/streaming_entdecken.json fehlt — Echtdatenprobe übersprungen.");
}

console.log(`\n${checks}/${checks} Checks bestanden.`);

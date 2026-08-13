import assert from "node:assert";

import {
  analysiereAuswaehlbareIds,
  ausgewaehlteSichtbareEintraege,
  erstelleTitelliste,
  bereinigeAuswahl,
  kanonischeStabileId,
  schalteAuswahlUm,
} from "./src/lib/mediathekSelection.js";

const check = (beschreibung, fn) => {
  try {
    fn();
  } catch (fehler) {
    console.error(`✗ ${beschreibung}`);
    console.error(String(fehler && fehler.stack ? fehler.stack : fehler));
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${beschreibung}`);
};

const vis = [
  { id: 2, titel: "  Erste  Zeile\nNeue", jahr: "2002" },
  { id: "1", titel: "Zweite Zeile\tTitel", jahr: null },
  { id: "1 ", titel: "Duplikat", jahr: 2003 },
  { id: 3, titel: "Dritte Zeile", jahr: 2015 },
  { id: "3", titel: "Unsichtbar", jahr: 2016 },
];

const auswErlaubt = new Set(["1", "2", "3"]);
const sichtAuswahl = new Set(["1", "2", "3"]);

check("kanonischeStabileId: string und number werden getrimmt/gecastet", () => {
  assert.equal(kanonischeStabileId("  7 "), "7");
  assert.equal(kanonischeStabileId(7), "7");
  assert.equal(kanonischeStabileId({ id: " 9 " }), "9");
});

check("kanonischeStabileId: fehlende, leere und nicht unterstützte IDs werden Null", () => {
  assert.equal(kanonischeStabileId({}), null);
  assert.equal(kanonischeStabileId("   "), null);
  assert.equal(kanonischeStabileId({ id: null }), null);
  assert.equal(kanonischeStabileId({ id: {} }), null);
  assert.equal(kanonischeStabileId([]), null);
});

check("kanonischeStabileId: Objekte nutzen exklusiv nur id, keine Aliasfelder", () => {
  assert.equal(kanonischeStabileId({ id: "9", stabileId: "10", stabile_id: "11", stableId: "12", _id: "13" }), "9");
  assert.equal(kanonischeStabileId({ stabileId: "10", stabile_id: "11", stableId: "12", _id: "13" }), null);
});

check("analysiereAuswaehlbareIds: Duplikate inkl. 1 vs \"1\" werden ausgeschlossen", () => {
  const { auswaehlbareIds, doppelteIds, ungueltigeAnzahl } = analysiereAuswaehlbareIds([
    { id: 1 },
    { id: "1" },
    { id: " 2 " },
    { id: 3 },
    { id: undefined },
  ]);
  assert.deepEqual([...auswaehlbareIds].sort(), ["2", "3"]);
  assert.deepEqual([...doppelteIds].sort(), ["1"]);
  assert.equal(ungueltigeAnzahl, 1);
});

check("schalteAuswahlUm: arbeitet ohne Mutation am Eingangset und ignoriert unzulässige IDs", () => {
  const basis = new Set(["1", "3"]);
  const ergebnis = schalteAuswahlUm(basis, "1", auswErlaubt);
  assert.deepEqual([...basis].sort(), ["1", "3"]);
  assert.deepEqual([...ergebnis].sort(), ["3"]);
  assert.deepEqual([...schalteAuswahlUm(basis, "9", auswErlaubt)].sort(), ["1", "3"]);
});

check("bereinigeAuswahl: entfernt ungültige, nicht auswählbare und normalisiert Typen", () => {
  const roh = new Set(["1", 2, "3", "9", null]);
  const sauber = bereinigeAuswahl(roh, auswErlaubt);
  assert.deepEqual([...sauber].sort(), ["1", "2", "3"]);
});

check("ausgewaehlteSichtbareEintraege: sichtbare Schnittmenge in Reihenfolge, doppelte IDs nur einmal", () => {
  const sicht = [
    { id: 3, titel: "C", jahr: 2020 },
    { id: "2", titel: "B", jahr: 2001 },
    { id: "3", titel: "C2", jahr: 2022 },
    { id: "1", titel: "A", jahr: null },
  ];
  const result = ausgewaehlteSichtbareEintraege(sicht, sichtAuswahl, auswErlaubt);
  assert.deepEqual(result.map((e) => e.id), ["3", "2", "1"]);
});

check("ausgewaehlteSichtbareEintraege: ignoriert unsichtbare Auswahl", () => {
  const visible = [
    { id: "1", titel: "Sichtbar", jahr: 2000 },
  ];
  const result = ausgewaehlteSichtbareEintraege(visible, new Set(["1", "2"]), new Set(["1", "2"]));
  assert.deepEqual(result.map((e) => e.id), ["1"]);
});

check("ausgewaehlteSichtbareEintraege: vollständig unsichtbare globale Auswahl ergibt leere Schnittmenge", () => {
  const result = ausgewaehlteSichtbareEintraege(
    [{ id: "1", titel: "Sichtbar", jahr: 2000 }],
    new Set(["2", "3"]),
    new Set(["1", "2", "3"]),
  );
  assert.deepEqual(result, []);
});

check("globale Bereinigung behält IDs über Filter- und Typgrenzen", () => {
  const alleIds = new Set(["film-a", "film-b", "serie-a"]);
  const global = bereinigeAuswahl(new Set(["film-a", "film-b"]), alleIds);
  const nurAlpha = ausgewaehlteSichtbareEintraege(
    [{ id: "film-a", titel: "Alpha", jahr: 2001 }], global, alleIds,
  );
  const keineFilme = ausgewaehlteSichtbareEintraege(
    [{ id: "serie-a", titel: "Serie", jahr: 2020 }], global, alleIds,
  );
  const filmeZurueck = ausgewaehlteSichtbareEintraege(
    [
      { id: "film-b", titel: "Zulu", jahr: 1999 },
      { id: "film-a", titel: "Alpha", jahr: 2001 },
    ],
    global,
    alleIds,
  );
  assert.deepEqual([...global].sort(), ["film-a", "film-b"]);
  assert.deepEqual(nurAlpha.map((e) => e.id), ["film-a"]);
  assert.deepEqual(keineFilme, []);
  assert.deepEqual(filmeZurueck.map((e) => e.id), ["film-b", "film-a"]);
});

check("erstelleTitelliste: nur sichtbare Auswahl, sortiert nach sichtbarer Reihenfolge", () => {
  const text = erstelleTitelliste(vis, sichtAuswahl, auswErlaubt);
  assert.equal(
    text,
    "Erste Zeile Neue (2002)\nZweite Zeile Titel\nDritte Zeile (2015)"
  );
});

check("erstelleTitelliste: bereinigt Whitespace/Zeilenumbrüche und Jahr bei fehlendem Jahr", () => {
  const text = erstelleTitelliste(
    [
      { id: "4", titel: "  A\nB\tC ", jahr: " 2001 \n" },
      { id: "5", titel: "Titel ohne Jahr", jahr: " " },
    ],
    new Set(["4", "5"]),
    new Set(["4", "5"])
  );
  assert.equal(text, "A B C (2001)\nTitel ohne Jahr");
});

check("erstelleTitelliste: leere/missing Titel erzeugen sichere Einzelzeile mit Jahr-Formatierung", () => {
  const text = erstelleTitelliste(
    [
      { id: "4", titel: "   ", jahr: 2024 },
      { id: "5", titel: "", jahr: null },
      { id: "6", titel: null, jahr: "2010" },
    ],
    new Set(["4", "5", "6"]),
    new Set(["4", "5", "6"])
  );
  assert.equal(text, "Ohne Titel (2024)\nOhne Titel\nOhne Titel (2010)");
  assert.equal(text.split("\n").length, 3);
});

check("erstelleTitelliste: schließt private Zusatzfelder aus der Ausgabe aus", () => {
  const text = erstelleTitelliste(
    [{ id: "9", titel: "X", jahr: 2026, intern: "secret", typ: "film" }],
    new Set(["9"]),
    new Set(["9"])
  );
  assert.equal(text, "X (2026)");
  assert.ok(!text.includes("secret"));
  assert.ok(!text.includes("file"));
});

check("analysiereAuswaehlbareIds + bereinigeAuswahl + toggle: End-to-End", () => {
  const analyse2 = analysiereAuswaehlbareIds([
    { id: "1" },
    { id: 2 },
    { id: "1" },
    { id: "3" },
    { id: undefined },
    { title: "ohne id" },
  ]);
  assert.deepEqual([...analyse2.auswaehlbareIds].sort(), ["2", "3"]);
  assert.deepEqual([...analyse2.doppelteIds].sort(), ["1"]);
  assert.equal(analyse2.ungueltigeAnzahl, 2);

  const schritt1 = schalteAuswahlUm(new Set(), "1", analyse2.auswaehlbareIds);
  const schritt2 = schalteAuswahlUm(schritt1, "3", analyse2.auswaehlbareIds);
  assert.deepEqual([...bereinigeAuswahl(new Set(["3", 1]), analyse2.auswaehlbareIds)], ["3"]);
  assert.deepEqual([...schritt2], ["3"]);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("alle Mediathek-Auswahl-Logik-Tests grün");

import assert from "node:assert/strict";
import test from "node:test";
import {
  ergaenzeFehlendeExterneKennungen,
  externeTitelKennungen,
  externesReferenzjahr,
  normalisiereExterneTitelkennung,
  normalisiereExterneWerkart,
  normalisiereExternenTitel,
  ordneExternenTitelZu,
  pruefeExterneTitelIdentitaet,
} from "./src/lib/externalTitleIdentity.js";

const film = (werte = {}) => ({ titel: "Dune", jahr: 2021, typ: "film", ...werte });
const extern = (werte = {}) => ({ titel: "Dune", jahr: 2021, typ: "movie", ...werte });

test("normalisiert nur belegte Identitaetsfelder", () => {
  assert.equal(normalisiereExternenTitel("  Mondsüchtig!  "), "mondsuchtig");
  assert.equal(normalisiereExterneWerkart({ mediaType: "TV_SERIES" }), "series");
  assert.equal(normalisiereExterneWerkart({ typ: "filmreihe" }), null);
  assert.equal(externesReferenzjahr({ releaseYear: "2021" }), 2021);
  assert.equal(externesReferenzjahr({ jahr: "ungewiss" }), null);
  assert.equal(normalisiereExterneTitelkennung("imdb", "1234567"), "tt1234567");
  assert.equal(normalisiereExterneTitelkennung("watchmode", "00042"), "42");
  assert.deepEqual(externeTitelKennungen({ imdbId: "TT1234567", tmdb_id: 438631 }), {
    imdb: "tt1234567", tmdb: "438631",
  });
});

test("matcht den eindeutigen exakten Titel oder Originaltitel nur mit Jahr und Typ", () => {
  assert.deepEqual(
    pruefeExterneTitelIdentitaet(extern({ titel: "Blade Runner" }),
      film({ titel: "Der Blade Runner", originaltitel: "Blade Runner" })),
    { status: "matched", matchedBy: "title-year-type", namespaces: [] },
  );
  assert.equal(ordneExternenTitelZu(extern(), [film()]).match?.titel, "Dune");
});

test("blockiert Remakes und die alte Plus-minus-zwei-Jahre-Heuristik", () => {
  assert.equal(pruefeExterneTitelIdentitaet(extern({ jahr: 1984 }), film()).status, "conflict");
  assert.equal(pruefeExterneTitelIdentitaet(extern({ jahr: 2019 }), film()).status, "conflict");
  assert.equal(pruefeExterneTitelIdentitaet(extern({ jahr: 2023 }), film()).status, "conflict");
});

test("blockiert fehlende oder unklare Pflichtbelege", () => {
  assert.equal(pruefeExterneTitelIdentitaet(extern({ jahr: null }), film()).reason,
    "identity-evidence-missing");
  assert.equal(pruefeExterneTitelIdentitaet(extern({ typ: null }), film()).reason,
    "identity-evidence-missing");
  assert.equal(pruefeExterneTitelIdentitaet(extern(), film({ typ: "sonstiges" })).reason,
    "identity-evidence-missing");
});

test("trennt gleiche Titel zwischen Film und Serie", () => {
  const ergebnis = pruefeExterneTitelIdentitaet(extern(), film({ typ: "serie" }));
  assert.deepEqual(ergebnis, {
    status: "conflict", reason: "media-type-conflict", matchingNamespaces: [],
  });
});

test("starke IDs schlagen Titelmehrdeutigkeit, widersprechende IDs blockieren", () => {
  const kandidaten = [
    film({ id: "remake-ohne-id" }),
    film({ id: "starke-id", watchmode_id: "77" }),
  ];
  const stark = ordneExternenTitelZu(extern({ watchmode_id: 77 }), kandidaten);
  assert.equal(stark.status, "matched");
  assert.equal(stark.matchedBy, "strong-id");
  assert.equal(stark.match.id, "starke-id");
  assert.equal(pruefeExterneTitelIdentitaet(
    extern({ titel: "Externer Alias", watchmode_id: 77 }),
    film({ titel: "Eigener Titel", watchmode_id: "77" }),
  ).matchedBy, "strong-id");

  const konflikt = pruefeExterneTitelIdentitaet(
    extern({ watchmode_id: 77, imdb_id: "tt1234567" }),
    film({ watchmode_id: "77", imdb_id: "tt7654321" }),
  );
  assert.equal(konflikt.status, "conflict");
  assert.equal(konflikt.reason, "external-id-conflict");
  assert.deepEqual(konflikt.namespaces, ["imdb"]);
  assert.deepEqual(konflikt.matchingNamespaces, ["watchmode"]);
});

test("blockiert doppelt vergebene starke IDs mit widersprechenden Belegen", () => {
  const ergebnis = ordneExternenTitelZu(extern({ watchmode_id: 77, imdb_id: "tt1234567" }), [
    film({ id: "sauber", watchmode_id: 77, imdb_id: "tt1234567" }),
    film({ id: "widerspruch", watchmode_id: 77, imdb_id: "tt7654321" }),
  ]);
  assert.deepEqual(ergebnis, { status: "conflict", reason: "shared-strong-id-conflict" });
});

test("laesst mehrdeutige titelbasierte Kandidaten leer", () => {
  const ergebnis = ordneExternenTitelZu(extern(), [film({ id: "a" }), film({ id: "b" })]);
  assert.deepEqual(ergebnis, { status: "ambiguous", reason: "multiple-title-year-type-matches" });
});

test("waehlt keinen ID-losen Titel neben einem gleichnamigen ID-Konflikt", () => {
  const ergebnis = ordneExternenTitelZu(extern({ watchmode_id: 77 }), [
    film({ id: "ohne-id" }),
    film({ id: "andere-id", watchmode_id: 88 }),
  ]);
  assert.deepEqual(ergebnis, { status: "conflict", reason: "candidate-conflict" });
});

test("ergaenzt nur fehlende IDs und mutiert keine Eingabe", () => {
  const eigen = film({ watchmode_id: "77", imdb_id: "tt1111111" });
  const quelle = extern({ watchmode_id: 77, imdb_id: "tt9999999", tmdb_id: 438631,
    flixpatrol_id: "title-123" });
  const eigenVorher = structuredClone(eigen);
  const quelleVorher = structuredClone(quelle);
  const ergaenzt = ergaenzeFehlendeExterneKennungen(eigen, quelle);
  assert.equal(ergaenzt.watchmode_id, "77");
  assert.equal(ergaenzt.imdb_id, "tt1111111");
  assert.equal(ergaenzt.tmdb_id, 438631);
  assert.equal(ergaenzt.flixpatrol_id, "title-123");
  assert.deepEqual(eigen, eigenVorher);
  assert.deepEqual(quelle, quelleVorher);
  assert.notEqual(ergaenzt, eigen);
});

test("verbindet fremde Datensaetze mit abweichenden IDs nicht als Konflikt", () => {
  const ergebnis = ordneExternenTitelZu(
    extern({ titel: "Arrival", jahr: 2016, watchmode_id: 2 }),
    [film({ titel: "Alien", jahr: 1979, watchmode_id: 1 })],
  );
  assert.deepEqual(ergebnis, { status: "unmatched", reason: "no-candidate" });
});

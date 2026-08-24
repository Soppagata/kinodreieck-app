/* Sanitisiertes Schemafixture des am 24.08.2026 providerfrei beobachteten
   LOC-Payloads. Es uebernimmt keine Titel, IDs, URLs oder Rohinhalte aus dem
   beobachteten Payload; der bestehende Filmwissen-Testtitel bleibt synthetisch
   in die Form eingesetzt.

   Beobachtete Strukturzaehler, die dieses Fixture bewahrt:
   - zwei Komponenten, davon genau eine mit `items`;
   - 925 Items und 925 String-Titel;
   - 924 String-Werte `year_inducted`;
   - 923 String-Werte `year_released`;
   - 900 Items mit beiden Jahren als vierstellige Strings.
*/

export function baueLocNfrComponentsV2Fixture({
  titelSuffix = "",
  ignorierterMarker = "NICHT-UEBERNEHMEN",
} = {}) {
  const items = [{ title: `Fixture Tabellenkopf${titelSuffix}` }];
  for (let index = 0; index < 900; index++) {
    items.push({
      title: index === 0 ? `Alien${titelSuffix}` : `Fixture Film ${index}${titelSuffix}`,
      year_released: index === 0 ? "1979" : String(1870 + (index % 150)),
      year_inducted: index === 0 ? "2002" : String(1989 + (index % 37)),
      ...(index === 0
        ? {
          description: ignorierterMarker,
          contributors: [{ name: ignorierterMarker, role: ignorierterMarker }],
        }
        : {}),
    });
  }
  for (let index = 0; index < 23; index++) {
    items.push({
      title: `Fixture Datumsbereich ${index}${titelSuffix}`,
      year_released: "1975-76",
      year_inducted: String(1989 + (index % 37)),
    });
  }
  items.push({
    title: `Fixture ohne Erscheinungsjahr${titelSuffix}`,
    year_inducted: "2025",
  });

  return {
    "content.markup": {},
    "content.components.items": [
      {
        id: "fixture-intro",
        type: "text",
        blurb: "",
        files: [],
        html: `<p>${ignorierterMarker}</p>`,
      },
      {
        id: "fixture-registry",
        type: "template",
        blurb: "",
        files: [],
        sort_keys: "fixture",
        template: `<template>${ignorierterMarker}</template>`,
        items,
      },
    ],
  };
}

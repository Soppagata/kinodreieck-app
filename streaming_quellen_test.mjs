import assert from "node:assert/strict";

import { baueStreamingQuellenGruppen } from "./src/lib/streamingQuellen.js";

const check = (name, fn) => {
  try {
    fn();
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(String(error && error.stack ? error.stack : error));
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
};

check("Nicht-Demo nutzt verfügbare_quellen vollständig, nicht nur bekannte Dienste", () => {
  const gruppen = baueStreamingQuellenGruppen({
    bekannt: {
      verfuegbare_quellen: [
        { name: " Joyn ", typ: "free" },
        { name: "Netflix", typ: "sub" },
        { name: "MUBI", typ: "other" },
      ],
    },
    katalogInfo: { variante: "live" },
    auswahl: ["AbwahlNurTest"],
  });

  const sub = gruppen.find((g) => g.typ === "sub");
  const free = gruppen.find((g) => g.typ === "free");
  const sonst = gruppen.find((g) => g.typ === "sonst");
  const auswahl = gruppen.find((g) => g.typ === "auswahl");
  assert.deepEqual(sub?.quellen, ["Netflix"]);
  assert.deepEqual(free?.quellen, ["Joyn"]);
  assert.deepEqual(sonst?.quellen, ["MUBI"]);
  assert.deepEqual(auswahl?.quellen, ["AbwahlNurTest"]);
});

check("Demo- oder ungeeigneter Katalog bleibt auf Default-Gruppen als Fallback", () => {
  const gruppen = baueStreamingQuellenGruppen({
    bekannt: {
      verfuegbare_quellen: [{ name: "Zensurtest", typ: "sub" }],
    },
    katalogInfo: { variante: "demo" },
    standardGruppen: [{ name: "Abos (Subscription)", typ: "sub", quellen: ["Netflix", "Prime Video"] }],
    auswahl: ["UnbekannteAuswahlQuelle"],
  });

  assert.equal(gruppen.at(0)?.name, "Abos (Subscription)");
  assert.equal(gruppen.at(-2)?.typ, "sub");
  assert.equal(gruppen.at(-1)?.name, "Deine Auswahl (nicht in der Liste)");
  assert.equal(gruppen.at(-1)?.quellen.at(0), "UnbekannteAuswahlQuelle");
  assert.equal(gruppen.length >= 2, true);
});

check("Auswahl außerhalb der verfügbaren Liste bleibt sichtbar als separate Auswahlguppe", () => {
  const gruppen = baueStreamingQuellenGruppen({
    bekannt: {
      verfuegbare_quellen: [
        { name: "Netflix", typ: "sub" },
      ],
    },
    katalogInfo: { variante: "live" },
    auswahl: ["MUBI", "Netflix", "Amazon", "MUBI"],
  });

  const auswahl = gruppen.at(-1);
  assert.equal(auswahl?.typ, "auswahl");
  assert.deepEqual(auswahl?.quellen, ["Amazon", "MUBI"]);
});

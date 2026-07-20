/* Blog-Shared-Test (Node, reine Logik aus src/lib/artikel.js).
   Prüft das Ziehen eines geteilten Blogs (Herkunft, Referenz-Neuauflösung/Rotlinks)
   und die Start-Reconciliation (verwaiste gezogene raus, eigene geschützt).
   Aufruf: node blog_test.mjs */

const A = await import("./src/lib/artikel.js");

const checks = [];
const check = (n, p) => checks.push([n, !!p]);

/* ---------- Testdaten ---------- */
const master = [
  { id: "blade_runner_1982", titel: "Blade Runner", originaltitel: null, jahr: 1982, typ: "film" },
];
const shared = {
  db_owner: "eva", db_key: "kd:blog:top-noir", author: "Eva",
  artikel: {
    id: "top-noir", titel: "Noir-Klassiker", autor: "Eva",
    text: "Absatz eins.\n\nAbsatz zwei.", geordnet: true,
    liste: [
      { eingabe: "Blade Runner", jahr: 1982, typ: "film" }, // in DEINER Master -> verlinkt
      { eingabe: "Gibt es nicht", jahr: 1999, typ: "film" }, // fehlt -> Rotlink
    ],
  },
};

/* ---------- 1) blogZuArtikel: Ziehen ---------- */
const art = A.blogZuArtikel(shared, [], master, "2026-01-01T00:00:00Z");
check("Herkunft = gezogen", art.herkunft === "gezogen");
check("DB-Referenz übernommen", art.db_owner === "eva" && art.db_key === "kd:blog:top-noir");
check("status = freigegeben (sofort lesbar)", art.status === "freigegeben");
check("geteilt = false (lokale Kopie, nicht republiziert)", art.geteilt === false);
check("Autor vom Original übernommen", art.autor === "Eva");
check("Text/geordnet übernommen", art.geordnet === true && art.text.includes("Absatz zwei"));
check("vorhandene Referenz -> verlinkt (ref gesetzt)", art.liste[0].ref === "blade_runner_1982");
check("fehlende Referenz -> Rotlink (ref null)", art.liste[1].ref === null);
check("Eingabe für Rotlink-Anzeige erhalten", art.liste[1].eingabe === "Gibt es nicht");
check("keine internen Abgleich-Felder am Eintrag", art.liste[0].abgleich === undefined);

/* ID-Kollision: zweimal dasselbe ziehen -> verschiedene lokale IDs */
const a1 = A.blogZuArtikel(shared, [], master, "2026-01-01T00:00:00Z");
const a2 = A.blogZuArtikel(shared, [a1], master, "2026-01-01T00:00:00Z");
check("gezogene IDs kollisionsfrei", a1.id !== a2.id);

/* ---------- 2) reconcileGezogene: Start-Abgleich ---------- */
const liste = [
  { id: "eigen1", herkunft: "eigen" },
  { id: "importiert" },                                                   // kein herkunft => geschützt
  { id: "gez_da", herkunft: "gezogen", db_owner: "eva", db_key: "kd:blog:a" },
  { id: "gez_weg", herkunft: "gezogen", db_owner: "tom", db_key: "kd:blog:b" },
];
const [next, entfernt] = A.reconcileGezogene(liste, new Set(["eva|kd:blog:a"]));
check("genau 1 verwaister gezogener entfernt", entfernt === 1);
check("verwaister gezogener ist raus", !next.find((a) => a.id === "gez_weg"));
check("lebender gezogener bleibt", !!next.find((a) => a.id === "gez_da"));
check("eigener bleibt (geschützt)", !!next.find((a) => a.id === "eigen1"));
check("importierter ohne Herkunft bleibt (geschützt)", !!next.find((a) => a.id === "importiert"));

const [n2, e2] = A.reconcileGezogene(liste, new Set(["eva|kd:blog:a", "tom|kd:blog:b"]));
check("nichts entfernt, wenn alle Originale da (Referenz-Identität)", e2 === 0 && n2 === liste);

const [n3, e3] = A.reconcileGezogene([{ id: "e", herkunft: "eigen" }], new Set());
check("leere shared-Menge fasst eigene NICHT an", e3 === 0 && n3.length === 1);

/* ---------- Ergebnis ---------- */
const fails = checks.filter(([, p]) => !p);
for (const [n, p] of checks) if (!p) console.log("FAIL:", n);
console.log(`blog_test: ${checks.length - fails.length}/${checks.length} Checks bestanden.`);
if (fails.length) process.exit(1);

/* Blog-Shared-Test (Node, reine Logik aus src/lib/artikel.js).
   Prüft das Ziehen eines geteilten Blogs als stabilen Snapshot
   (Herkunft, Referenz-Neuauflösung/Rotlinks).
   Aufruf: node blog_test.mjs */

const A = await import("./src/lib/artikel.js");

const checks = [];
const check = (n, p) => checks.push([n, !!p]);

/* ---------- Testdaten ---------- */
const master = [
  { id: "blade_runner_1982", titel: "Blade Runner", originaltitel: null, jahr: 1982, typ: "film" },
];
const shared = {
  publication_id: "11111111-1111-4111-8111-111111111111",
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
check("öffentliche Projektions-ID als Snapshot-Herkunft übernommen",
  art.source_publication_id === shared.publication_id);
check("Ladezeit des Snapshots ist stabil gespeichert",
  art.source_loaded_at === "2026-01-01T00:00:00Z");
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

/* Es gibt absichtlich keine Start-Reconciliation mehr: eine einmal geladene
   Kopie ist eigener lokaler Bestand und wird nie durch fremdes Unpublish
   automatisch entfernt. */
check("Snapshot-Modul exportiert keine löschende Reconciliation mehr",
  typeof A.reconcileGezogene === "undefined");

/* ---------- Ergebnis ---------- */
const fails = checks.filter(([, p]) => !p);
for (const [n, p] of checks) if (!p) console.log("FAIL:", n);
console.log(`blog_test: ${checks.length - fails.length}/${checks.length} Checks bestanden.`);
if (fails.length) process.exit(1);

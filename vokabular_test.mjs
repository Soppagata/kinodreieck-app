import {
  hatOfflineDefinition,
  uebernimmBlogVokabular,
  vokabularEintragAusDeutung,
  vokabularZuMap,
} from "./src/lib/vokabular.js";

let ok = 0;
const check = (name, wert) => {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
};

const eintrag = vokabularEintragAusDeutung({
  wort: " Kuhl ",
  beschreibung: "Rule of Cool von Blues Brothers bis Riddick",
  deutung: {
    klartext: "Action, Kult und stilisierte Coolness",
    sig: {
      genres: ["Action"],
      stimmungen: ["kult"],
      kategorien: ["sehenswert"],
      titel: [{ id: "riddick" }],
    },
  },
  stimmungen: { kult: { genres: ["Komödie"], tags: ["Kult"] } },
  master: [{ id: "riddick", genre: ["Action", "Sci-Fi"], tags: ["düster"] }],
});

check("Begriff wird stabil normalisiert", eintrag.wort === "kuhl");
check("KI-Signale und Filmbeispiele werden als Offline-Regel gespeichert",
  ["action", "komödie", "sci-fi"].every((wert) => eintrag.genres.includes(wert))
  && ["kult", "düster", "sehenswert"].every((wert) => eintrag.tags.includes(wert)));
check("gespeicherte Definition braucht danach keine KI", hatOfflineDefinition(eintrag));
const map = vokabularZuMap([eintrag]);
check("Finder-Map enthält nur deterministische Genres und Tags",
  map.kuhl.genres.includes("action") && map.kuhl.tags.includes("kult")
  && !("beschreibung" in map.kuhl));

const KOPF = Object.freeze({
  quelle: "bloganalyse",
  articleId: "eigener_blog_17",
  contentHash: "a".repeat(64),
  analyzedAt: "2026-08-17T14:00:00.000Z",
  promptVersion: "blog-profile-v2",
});

const kandidat = (wort, aenderung = {}) => ({
  wort,
  beschreibung: "Eine präzise lokale Bedeutung",
  genres: ["Action"],
  tags: ["Kult"],
  beleg: "Dieser ausreichend lange Beleg stammt aus dem Artikel.",
  ...aenderung,
});

const abgewiesen = (resultat) => resultat.abgelehnt === true
  && resultat.uebernommen === 0
  && Array.isArray(resultat.fehler)
  && resultat.fehler.length > 0;

const bestand = [{
  wort: "Bestehend",
  beschreibung: "Legacy-Eintrag",
  interpretation: "bleibt kompatibel",
  genres: ["Drama", "Action", "Komödie"],
  tags: ["ruhig", "klug", "warm"],
  erstellt_am: "2026-08-01T10:00:00.000Z",
}];
const kandidaten = [
  kandidat(" Erster ", { genres: ["Sci-Fi"], tags: ["Kult"] }),
  kandidat("Zweiter", { genres: [], tags: ["Düster"] }),
];
const bestandVorher = JSON.stringify(bestand);
const kandidatenVorher = JSON.stringify(kandidaten);
const erfolg = uebernimmBlogVokabular(bestand, KOPF, kandidaten);

check("gültige Kandidaten werden unverändert und in Reihenfolge angehängt",
  !erfolg.abgelehnt && erfolg.uebernommen === 2 && erfolg.bereitsVorhanden === 0
  && erfolg.vokabular.length === 3 && erfolg.vokabular[0] === bestand[0]
  && erfolg.vokabular[1].wort === " Erster " && erfolg.vokabular[2].wort === "Zweiter"
  && erfolg.vokabular[1].genres[0] === "Sci-Fi" && erfolg.vokabular[1].tags[0] === "Kult");
check("neue Einträge tragen exakt die übergebene Provenienz ohne Nutzerwertung",
  ["quelle", "articleId", "contentHash", "analyzedAt", "promptVersion"]
    .every((feld) => erfolg.vokabular[1][feld] === KOPF[feld])
  && !("wertung" in erfolg.vokabular[1]) && !("nutzerwertung" in erfolg.vokabular[1])
  && JSON.stringify(erfolg.fehler) === "[]");
check("Erfolg mutiert weder Bestand noch Kandidaten",
  JSON.stringify(bestand) === bestandVorher && JSON.stringify(kandidaten) === kandidatenVorher
  && erfolg.vokabular !== bestand && erfolg.vokabular[1].genres !== kandidaten[0].genres);

const gefrorenerBestand = Object.freeze([]);
const gefrorenerKandidat = Object.freeze({
  ...kandidat("Gefroren"),
  genres: Object.freeze(["Action"]),
  tags: Object.freeze(["Kult"]),
});
check("gefrorene Eingaben belegen den nicht mutierenden Vertrag",
  uebernimmBlogVokabular(gefrorenerBestand, KOPF, Object.freeze([gefrorenerKandidat])).uebernommen === 1);

const identischerBestand = [{ wort: "Kuhl", genres: ["Sci-Fi"], tags: ["Kult"] }];
const nfkcDedupe = uebernimmBlogVokabular(identischerBestand, KOPF, [
  kandidat(" ＫＵＨＬ ", { genres: ["  sci-fi  "], tags: ["Ｋｕｌｔ"] }),
]);
check("NFKC, Whitespace, trim und lowercase bestimmen Wort- und Mapping-Identität",
  !nfkcDedupe.abgelehnt && nfkcDedupe.uebernommen === 0
  && nfkcDedupe.bereitsVorhanden === 1 && nfkcDedupe.vokabular === identischerBestand);

const kandidatDedupe = uebernimmBlogVokabular([], KOPF, [
  kandidat("Mehrfach", { genres: ["Sci-Fi"], tags: ["Kult"] }),
  kandidat("  ＭＥＨＲＦＡＣＨ  ", { genres: ["sci-fi"], tags: ["kult"] }),
]);
check("identische Kandidaten werden ohne Duplikat sichtbar dedupliziert",
  !kandidatDedupe.abgelehnt && kandidatDedupe.uebernommen === 1
  && kandidatDedupe.bereitsVorhanden === 1 && kandidatDedupe.vokabular.length === 1);

const getrennteMengen = [{ wort: "Tausch", genres: ["Action"], tags: ["Kult"] }];
const mengenTausch = uebernimmBlogVokabular(getrennteMengen, KOPF, [
  kandidat("tausch", { genres: ["Kult"], tags: ["Action"] }),
]);
check("Genres und Tags bleiben getrennte Mengen statt einer gemeinsamen Menge",
  abgewiesen(mengenTausch) && mengenTausch.vokabular === getrennteMengen);

const kandidatenKonflikt = [
  kandidat("Konflikt", { genres: ["Action"], tags: [] }),
  kandidat(" konflikt ", { genres: ["Drama"], tags: [] }),
  kandidat("Darf nicht teilweise hinein"),
];
const kandidatenKonfliktVorher = JSON.stringify(kandidatenKonflikt);
const kandidatenKonfliktResultat = uebernimmBlogVokabular([], KOPF, kandidatenKonflikt);
check("abweichende Zuordnungen desselben Kandidatenworts sind atomarer Konflikt",
  abgewiesen(kandidatenKonfliktResultat) && kandidatenKonfliktResultat.vokabular.length === 0
  && JSON.stringify(kandidatenKonflikt) === kandidatenKonfliktVorher);

const konfliktBestand = [{ wort: "Konflikt", genres: ["Drama"], tags: [] }];
const konfliktBestandVorher = JSON.stringify(konfliktBestand);
const bestandsKonflikt = uebernimmBlogVokabular(konfliktBestand, KOPF, [
  kandidat("Neu zuerst", { genres: [], tags: ["Kult"] }),
  kandidat(" KONFLIKT ", { genres: ["Action"], tags: [] }),
]);
check("Bestandskonflikt verhindert jede Teilübernahme und Überschreibung",
  abgewiesen(bestandsKonflikt) && bestandsKonflikt.vokabular === konfliktBestand
  && JSON.stringify(konfliktBestand) === konfliktBestandVorher);

const leer = uebernimmBlogVokabular(bestand, KOPF, []);
check("wenn nichts neu ist bleibt die Originalreferenz erhalten",
  !leer.abgelehnt && leer.uebernommen === 0 && leer.bereitsVorhanden === 0 && leer.vokabular === bestand);

const sechs = Array.from({ length: 6 }, (_, index) => kandidat(`Wort ${index}`));
check("maximal sechs Kandidaten werden akzeptiert", uebernimmBlogVokabular([], KOPF, sechs).uebernommen === 6);
check("sieben Kandidaten werden fail-closed abgelehnt",
  abgewiesen(uebernimmBlogVokabular([], KOPF, [...sechs, kandidat("Wort 7")])));

const rawByteFaelle = [
  [kandidat("ä".repeat(20)), true],
  [kandidat(`${"ä".repeat(20)}a`), false],
  [kandidat("wort", { beschreibung: "ä".repeat(48) }), true],
  [kandidat("wort", { beschreibung: `${"ä".repeat(48)}a` }), false],
  [kandidat("wort", { beleg: "ä".repeat(8) }), true],
  [kandidat("wort", { beleg: `${"ä".repeat(7)}a` }), false],
  [kandidat("wort", { beleg: "ä".repeat(48) }), true],
  [kandidat("wort", { beleg: `${"ä".repeat(48)}a` }), false],
  [kandidat("wort", { genres: ["ä".repeat(20)], tags: [] }), true],
  [kandidat("wort", { genres: [`${"ä".repeat(20)}a`], tags: [] }), false],
];
check("raw UTF-8-Bytegrenzen 40/96/16 werden exakt geprüft",
  rawByteFaelle.every(([item, erwartet]) => !uebernimmBlogVokabular([], KOPF, [item]).abgelehnt === erwartet));

const feldTypFaelle = [
  kandidat("wort", { wort: 7 }),
  kandidat("wort", { beschreibung: ["Text"] }),
  kandidat("wort", { beleg: null }),
  kandidat("wort", { genres: "Action" }),
  kandidat("wort", { tags: {} }),
];
check("alle Kandidatenfelder werden typstreng geprüft",
  feldTypFaelle.every((item) => abgewiesen(uebernimmBlogVokabular([], KOPF, [item]))));

const flachFaelle = [
  kandidat("wort\nbruch"),
  kandidat("wort", { beschreibung: "Zeile\nmit Umbruch" }),
  kandidat("wort", { beleg: "Ausreichend lang\u2028aber nicht flach" }),
  kandidat("wort", { genres: ["Ac\u0000tion"], tags: [] }),
];
check("Wort, Beschreibung, Beleg und Zuordnungen müssen flach und steuerzeichenfrei sein",
  flachFaelle.every((item) => abgewiesen(uebernimmBlogVokabular([], KOPF, [item]))));

check("leere oder mehr als drei Zuordnungen werden abgelehnt",
  abgewiesen(uebernimmBlogVokabular([], KOPF, [kandidat("leer", { genres: [], tags: [] })]))
  && abgewiesen(uebernimmBlogVokabular([], KOPF, [kandidat("viel", { genres: ["A", "B"], tags: ["C", "D"] })])));
check("normalisierte Zuordnungen sind auch listenübergreifend eindeutig",
  abgewiesen(uebernimmBlogVokabular([], KOPF, [kandidat("doppelt", { genres: ["Kult"], tags: [" ＫＵＬＴ "] })])));

check("unbekannte oder fehlende Kandidatenschlüssel werden abgelehnt",
  abgewiesen(uebernimmBlogVokabular([], KOPF, [{ ...kandidat("extra"), extra: true }]))
  && abgewiesen(uebernimmBlogVokabular([], KOPF, [{ wort: "lücke" }])));

const kopfFaelle = [
  { ...KOPF, quelle: "anders" },
  { ...KOPF, articleId: "Ungültig" },
  { ...KOPF, contentHash: null },
  { ...KOPF, contentHash: "A".repeat(64) },
  { ...KOPF, contentHash: "0".repeat(64) },
  { ...KOPF, analyzedAt: "2026-08-17T14:00:00Z" },
  { ...KOPF, promptVersion: "blog-profile-v3" },
  { ...KOPF, extra: true },
];
check("Quelle, articleId, Hash, canonical UTC, Promptversion und Kopfschlüssel sind fail-closed",
  kopfFaelle.every((kopf) => abgewiesen(uebernimmBlogVokabular([], kopf, [kandidat("wort")]))));
check("Gespeicherte v1-Vokabularkandidaten bleiben nach dem v2-Upgrade lesbar",
  !abgewiesen(uebernimmBlogVokabular([], { ...KOPF, promptVersion: "blog-profile-v1" }, [kandidat("alt")])));

const malformedFaelle = [
  () => uebernimmBlogVokabular(null, KOPF, []),
  () => uebernimmBlogVokabular({}, KOPF, []),
  () => uebernimmBlogVokabular([], null, []),
  () => uebernimmBlogVokabular([], KOPF, null),
  () => uebernimmBlogVokabular([], KOPF, [null]),
  () => uebernimmBlogVokabular([{ wort: "kaputt", genres: null, tags: [] }], KOPF, []),
];
check("null, formfremde, lückenhafte und ungültige Eingaben liefern Abweisung statt Throw",
  malformedFaelle.every((aufruf) => abgewiesen(aufruf())));

console.log(`\n${ok} Checks bestanden.`);

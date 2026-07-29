import {
  PROGNOSE_FORMAT, PROGNOSE_SICHERHEIT, PROGNOSE_STATUS,
  deckeleSicherheit, erstellePrognose, lesePrognose,
  passungsBand, prognoseIstVeraltet, pruefePrognose, pruefePrognoseErgebnis,
  setzePrognoseStatus,
} from "./src/lib/prognose.js";
import { BEWERTUNGSKATEGORIE_IDS } from "./src/lib/kategorien.js";

let ok = 0;
const rot = [];
function check(name, fn) {
  try {
    if (!fn()) throw new Error("falsch");
    ok++;
    console.log("✓ " + name);
  } catch (e) {
    rot.push(name + ": " + (e?.message || e));
    console.error("✗ " + name + ": " + (e?.message || e));
  }
}

const ZEIT = "2026-07-29T12:00:00.000Z";
const ergebnis = {
  format: PROGNOSE_FORMAT,
  achsen: { wie: 4, was: 3, warum: null },
  passung: 72,
  kategorie_vorschlag: "sehenswert",
  sicherheit: "mittel",
  begruendung: "Formale Energie und trockener Humor passen zu deinem Profil.",
  verwendete_signale: [
    { id: "S1", art: "genre", wert: "horror", richtung: "zieht_an" },
    { id: "S2", art: "haltung", wert: "trash", richtung: "ambivalent" },
  ],
};
const meta = {
  profilVersion: "p3",
  modell: "claude-sonnet-5-20260715",
  modellAlias: "gross",
  vorgangId: "forecast-1",
  verbrauch: { inputTokens: 800, outputTokens: 220, kostenUsdCent: 0.42, dauerMs: 2300 },
  jetzt: ZEIT,
};
const gebaut = erstellePrognose({ ergebnis, ...meta });
const prognose = gebaut.prognose;

check("gültige Prognose wird offen und getrennt aufgebaut", () =>
  gebaut.ok && prognose.status === "offen" && !("bewertung" in prognose));
check("vollständige Prognose besteht die strikte Prüfung", () => pruefePrognose(prognose).length === 0);
check("Format und geschlossene Status-/Sicherheitsmengen sind versioniert", () =>
  PROGNOSE_FORMAT === "film-prognose-v1"
  && JSON.stringify(PROGNOSE_STATUS) === JSON.stringify(["offen", "angenommen", "korrigiert", "verworfen"])
  && JSON.stringify(PROGNOSE_SICHERHEIT) === JSON.stringify(["sehr_niedrig", "niedrig", "mittel", "hoch"]));

for (const kat of BEWERTUNGSKATEGORIE_IDS) {
  check(`Kategorie ${kat} ist als Vorschlag erlaubt`, () =>
    pruefePrognoseErgebnis({ ...ergebnis, kategorie_vorschlag: kat }).length === 0);
}
check("null ist als unbelegter Kategorie-Vorschlag erlaubt", () =>
  pruefePrognoseErgebnis({ ...ergebnis, kategorie_vorschlag: null }).length === 0);
check("alter Vier-Kategorien-Zwischenwert wird abgewiesen", () =>
  pruefePrognoseErgebnis({ ...ergebnis, kategorie_vorschlag: "wahrscheinlich_passend" }).length > 0);
check("WARUM bleibt im MVP zwingend null", () =>
  pruefePrognoseErgebnis({ ...ergebnis, achsen: { ...ergebnis.achsen, warum: 4 } }).some((f) => /WARUM/.test(f)));
check("WIE/WAS akzeptieren nur ganze 0..5 oder null", () =>
  [-1, 2.5, 6, "4"].every((wie) =>
    pruefePrognoseErgebnis({ ...ergebnis, achsen: { ...ergebnis.achsen, wie } }).length > 0)
  && pruefePrognoseErgebnis({ ...ergebnis, achsen: { ...ergebnis.achsen, wie: null } }).length === 0);
check("Passung akzeptiert nur ganze 0..100", () =>
  [-1, 42.5, 101, "72"].every((passung) =>
    pruefePrognoseErgebnis({ ...ergebnis, passung }).length > 0));
check("mehrzeilige oder überlange Begründung wird abgewiesen", () =>
  pruefePrognoseErgebnis({ ...ergebnis, begruendung: "erste\nzweite" }).length > 0
  && pruefePrognoseErgebnis({ ...ergebnis, begruendung: "x".repeat(281) }).length > 0);
check("verwendete Signale haben neutrale eindeutige IDs", () =>
  pruefePrognoseErgebnis({
    ...ergebnis,
    verwendete_signale: [
      ergebnis.verwendete_signale[0],
      { ...ergebnis.verwendete_signale[1], id: "S1" },
    ],
  }).some((f) => /doppelt/.test(f)));
check("freie oder formfremde Signal-IDs werden abgewiesen", () =>
  ["horror", "S0", "S10000", 7].every((id) =>
    pruefePrognoseErgebnis({
      ...ergebnis,
      verwendete_signale: [{ ...ergebnis.verwendete_signale[0], id }],
    }).length > 0));
check("Zusatzfelder im Ergebnis werden nicht still übernommen", () =>
  pruefePrognoseErgebnis({ ...ergebnis, warum_text: "Kult!" }).length > 0);
check("Zusatzfelder in Metadaten werden nicht ungeprüft angezeigt", () =>
  pruefePrognose({ ...prognose, providerRohtext: "intern" }).length > 0);
check("Kosten, Tokenzahlen, Modell und Versionen werden geprüft", () =>
  pruefePrognose({ ...prognose, verbrauch: { ...prognose.verbrauch, kostenUsdCent: -1 } }).length > 0
  && pruefePrognose({ ...prognose, modell: "Claude Sonnet" }).length > 0
  && pruefePrognose({ ...prognose, profilVersion: "../p3" }).length > 0);

check("offen → angenommen ist erlaubt und ändert nur Status/Zeit", () => {
  const r = setzePrognoseStatus(prognose, "angenommen", "2026-07-29T13:00:00.000Z");
  return r.ok && r.prognose.status === "angenommen"
    && r.prognose.ergebnis === prognose.ergebnis
    && r.prognose.geaendert !== prognose.geaendert;
});
check("offen → korrigiert und offen → verworfen sind erlaubt", () =>
  setzePrognoseStatus(prognose, "korrigiert", ZEIT).ok
  && setzePrognoseStatus(prognose, "verworfen", ZEIT).ok);
check("angenommen darf später korrigiert oder verworfen werden", () => {
  const a = setzePrognoseStatus(prognose, "angenommen", ZEIT).prognose;
  return setzePrognoseStatus(a, "korrigiert", ZEIT).ok
    && setzePrognoseStatus(a, "verworfen", ZEIT).ok;
});
check("Endstatus darf nicht zurück auf offen oder angenommen", () => {
  const k = setzePrognoseStatus(prognose, "korrigiert", ZEIT).prognose;
  const v = setzePrognoseStatus(prognose, "verworfen", ZEIT).prognose;
  return !setzePrognoseStatus(k, "offen", ZEIT).ok
    && !setzePrognoseStatus(v, "angenommen", ZEIT).ok;
});
check("Annehmen erzeugt weiterhin keine echte Bewertung", () => {
  const r = setzePrognoseStatus(prognose, "angenommen", ZEIT);
  return !("bewertung" in r.prognose) && !("kategorie" in r.prognose);
});
check("ungültige gespeicherte Prognose wird beim Lesen quarantänisiert", () => {
  const r = lesePrognose({ titel: "Test", prognose: { ...prognose, status: "erfunden" } });
  return !r.ok && r.prognose === null && r.fehler.length > 0;
});
check("fehlende Prognose ist ein sauberer Leerzustand", () => {
  const r = lesePrognose({ titel: "Test" });
  return r.ok && r.prognose === null && r.fehler.length === 0;
});

check("0 bis 2 Signale deckeln auf sehr niedrig", () =>
  [0, 1, 2].every((signalAnzahl) =>
    deckeleSicherheit("hoch", { signalAnzahl, signalArten: 2, achsen: { wie: 4, was: 3 } }) === "sehr_niedrig"));
check("3 bis 4 Signale deckeln auf niedrig", () =>
  [3, 4].every((signalAnzahl) =>
    deckeleSicherheit("hoch", { signalAnzahl, signalArten: 2, achsen: { wie: 4, was: 3 } }) === "niedrig"));
check("auch viele Signale nur einer Art deckeln auf niedrig", () =>
  deckeleSicherheit("hoch", { signalAnzahl: 8, signalArten: 1, achsen: { wie: 4, was: 3 } }) === "niedrig");
check("ab 5 Signalen aus 2 Arten kann hoch bestehen bleiben", () =>
  deckeleSicherheit("hoch", { signalAnzahl: 5, signalArten: 2, achsen: { wie: 4, was: 3 } }) === "hoch");
check("fehlendes WIE oder WAS deckelt hoch auf mittel", () =>
  deckeleSicherheit("hoch", { signalAnzahl: 5, signalArten: 2, achsen: { wie: null, was: 3 } }) === "mittel");
check("unbekannte Sicherheit fällt sicher auf sehr niedrig", () =>
  deckeleSicherheit("sicher!", { signalAnzahl: 20, signalArten: 5, achsen: { wie: 5, was: 5 } }) === "sehr_niedrig");
check("abweichende Profilversion markiert die Prognose als veraltet", () =>
  prognoseIstVeraltet(prognose, "p4") && !prognoseIstVeraltet(prognose, "p3"));
check("Passung wird als Band statt als scheinpräzise Prozentzahl formuliert", () =>
  [[0, "sehr_unwahrscheinlich"], [24, "sehr_unwahrscheinlich"], [25, "eher_nicht"],
    [49, "eher_nicht"], [50, "eher_passend"], [74, "eher_passend"],
    [75, "sehr_passend"], [100, "sehr_passend"]]
    .every(([wert, id]) => passungsBand(wert)?.id === id)
  && passungsBand(72.5) === null);

console.log(`\n${ok}/${ok + rot.length} Prognose-Checks bestanden.`);
if (rot.length) {
  for (const r of rot) console.error("  " + r);
  process.exit(1);
}

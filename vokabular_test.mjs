import { hatOfflineDefinition, vokabularEintragAusDeutung, vokabularZuMap } from "./src/lib/vokabular.js";

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

console.log(`\n${ok} Checks bestanden.`);

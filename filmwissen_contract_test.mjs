import {
  FILMWISSEN_SYNTHESE_FORMAT, baueSyntheseAnbieterKoerper,
  pruefeSyntheseAusgabe, pruefeSyntheseEingabe,
} from "./supabase/functions/filmwissen-task/vertrag.ts";
let ok = 0; const fehler = [];
function check(name, fn) { try { if (!fn()) throw new Error("falsch"); ok++; console.log("✓ " + name); } catch (e) { fehler.push(name); console.error("✗ " + name + ": " + e.message); } }
const werk = { typ: "film", titel: "Alien", originaltitel: "Alien", jahr: 1979 };
const fundstellen = [
  { id: "F1", quelle: "quelle-a", domain: "a.example", titel: "A", veroeffentlichtAm: null, kernaussagen: ["Praegte das Genre."] },
  { id: "F2", quelle: "quelle-b", domain: "b.example", titel: "B", veroeffentlichtAm: null, kernaussagen: ["Wurde breit rezipiert."] },
];
check("D1 verlangt 2-5 unterschiedliche Quellen und zwei Domains", () =>
  pruefeSyntheseEingabe(werk, fundstellen).length === 0
  && pruefeSyntheseEingabe(werk, [fundstellen[0]]).includes("fundstellen-anzahl")
  && pruefeSyntheseEingabe(werk, [fundstellen[0], { ...fundstellen[1], domain: "a.example" }]).includes("zwei-domains"));
check("D2 Anbieterkoerper enthaelt keine URLs oder persoenliche Felder", () => {
  const body = baueSyntheseAnbieterKoerper(werk, fundstellen); const serialisiert = JSON.stringify(body);
  return !/https?:\/\//.test(serialisiert) && !/account|profil|notiz|passung/i.test(serialisiert)
    && body.output_config.format.schema.properties.belegIds.items.enum.join(",") === "F1,F2";
});
check("D3 ungueltige Eingabe stoppt vor dem Anbieter", () => {
  try { baueSyntheseAnbieterKoerper(werk, [{ ...fundstellen[0], kernaussagen: [] }, fundstellen[1]]); return false; } catch { return true; }
});
check("D4 Ausgabe darf keine unbekannten Belege erfinden", () => {
  const gut = { format: FILMWISSEN_SYNTHESE_FORMAT, warum: 5, sicherheit: "mittel", kurztext: "Relevant.", belegIds: ["F1", "F2"] };
  return pruefeSyntheseAusgabe(gut, fundstellen).length === 0
    && pruefeSyntheseAusgabe({ ...gut, belegIds: ["F1", "F9"] }, fundstellen).includes("belegIds");
});
console.log(`\n${ok}/${ok + fehler.length} Filmwissen-Synthesevertrag-Checks bestanden.`);
if (fehler.length) process.exit(1);

import {
  FILMWISSEN_SYNTHESE_FORMAT, baueSyntheseAuftrag,
  pruefeSyntheseAusgabe, pruefeSyntheseEingabe,
} from "./supabase/functions/filmwissen-task/vertrag.ts";
let ok = 0; const fehler = [];
function check(name, fn) { try { if (!fn()) throw new Error("falsch"); ok++; console.log("✓ " + name); } catch (e) { fehler.push(name); console.error("✗ " + name + ": " + e.message); } }
const werk = { typ: "film", titel: "Alien", originaltitel: "Alien", jahr: 1979 };
const fundstellen = [
  { id: "F1", quelle: "quelle-a", domain: "a.example", ursprung: "archiv-a", titel: "A", veroeffentlichtAm: null, kernaussagen: ["Praegte das Genre."] },
  { id: "F2", quelle: "quelle-b", domain: "b.example", ursprung: "redaktion-b", titel: "B", veroeffentlichtAm: null, kernaussagen: ["Wurde breit rezipiert."] },
];
check("D1 verlangt 2-5 unterschiedliche Quellen, Domains und Urspruenge", () =>
  pruefeSyntheseEingabe(werk, fundstellen).length === 0
  && pruefeSyntheseEingabe(werk, [fundstellen[0]]).includes("fundstellen-anzahl")
  && pruefeSyntheseEingabe(werk, [fundstellen[0], { ...fundstellen[1], domain: "a.example" }]).includes("zwei-domains")
  && pruefeSyntheseEingabe(werk, [fundstellen[0], { ...fundstellen[1], ursprung: "archiv-a" }]).includes("zwei-urspruenge"));
check("D2 Auftrag enthaelt keine URLs oder persoenliche Felder", () => {
  const body = baueSyntheseAuftrag(werk, fundstellen); const serialisiert = JSON.stringify(body);
  return !/https?:\/\//.test(serialisiert) && !/account|profil|notiz|passung/i.test(serialisiert)
    && body.schema.properties.belegIds.items.enum.join(",") === "F1,F2";
});
check("D3 ungueltige Eingabe stoppt vor dem Anbieter", () => {
  try { baueSyntheseAuftrag(werk, [{ ...fundstellen[0], kernaussagen: [] }, fundstellen[1]]); return false; } catch { return true; }
});
check("D4 Ausgabe darf keine unbekannten Belege erfinden", () => {
  const gut = { format: FILMWISSEN_SYNTHESE_FORMAT, warum: 5, sicherheit: "mittel", kurztext: "Relevant.", belegIds: ["F1", "F2"] };
  return pruefeSyntheseAusgabe(gut, fundstellen).length === 0
    && pruefeSyntheseAusgabe({ ...gut, belegIds: ["F1", "F9"] }, fundstellen).includes("belegIds");
});
check("D5 Schema bleibt auf der bewaehrten Provider-Teilmenge", () => {
  const schema = baueSyntheseAuftrag(werk, fundstellen).schema;
  const serialisiert = JSON.stringify(schema);
  return !/"const"|"minItems"|"maxItems"|"uniqueItems"|"strict"|"name"/.test(serialisiert)
    && schema.properties.format.enum[0] === FILMWISSEN_SYNTHESE_FORMAT;
});
check("D6 Ausgabe hat exakt fuenf Felder und keine Steuerzeichen", () => {
  const gut = { format: FILMWISSEN_SYNTHESE_FORMAT, warum: 5, sicherheit: "mittel", kurztext: "Relevant.", belegIds: ["F1", "F2"] };
  return pruefeSyntheseAusgabe({ ...gut, extra: true }, fundstellen).includes("schluessel")
    && pruefeSyntheseAusgabe({ ...gut, kurztext: "Zeile\nZwei" }, fundstellen).includes("kurztext");
});
check("D7 ausgewaehlte Belege muessen selbst zwei unabhaengige Urspruenge tragen", () => {
  const drei = [
    fundstellen[0],
    { ...fundstellen[1], id: "F2", domain: "b.example", ursprung: "archiv-a" },
    { ...fundstellen[1], id: "F3", quelle: "quelle-c", domain: "c.example", ursprung: "redaktion-c" },
  ];
  const basis = { format: FILMWISSEN_SYNTHESE_FORMAT, warum: 4, sicherheit: "mittel", kurztext: "Relevant." };
  return pruefeSyntheseEingabe(werk, drei).length === 0
    && pruefeSyntheseAusgabe({ ...basis, belegIds: ["F1", "F2"] }, drei).includes("belegIds-zwei-urspruenge")
    && pruefeSyntheseAusgabe({ ...basis, belegIds: ["F1", "F3"] }, drei).length === 0;
});
console.log(`\n${ok}/${ok + fehler.length} Filmwissen-Synthesevertrag-Checks bestanden.`);
if (fehler.length) process.exit(1);

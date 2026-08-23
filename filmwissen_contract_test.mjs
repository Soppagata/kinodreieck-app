import {
  FILMWISSEN_SYNTHESE_FORMAT, baueSyntheseAuftrag,
  bereinigeSyntheseAusgabe, pruefeSyntheseAusgabe, pruefeSyntheseEingabe,
} from "./supabase/functions/filmwissen-task/vertrag.ts";
let ok = 0; const fehler = [];
function check(name, fn) { try { if (!fn()) throw new Error("falsch"); ok++; console.log("✓ " + name); } catch (e) { fehler.push(name); console.error("✗ " + name + ": " + e.message); } }
const werk = { typ: "film", titel: "Alien", originaltitel: "Alien", jahr: 1979 };
const fundstellen = [
  { id: "F1", quelle: "quelle-a", domain: "a.example", belegklasse: "redaktionell", ursprung: "archiv-a", titel: "A", veroeffentlichtAm: null, kernaussagen: ["Praegte das Genre."] },
  { id: "F2", quelle: "quelle-b", domain: "b.example", belegklasse: "redaktionell", ursprung: "redaktion-b", titel: "B", veroeffentlichtAm: null, kernaussagen: ["Wurde breit rezipiert."] },
];
const evidenz = [
  { id: "F1", url: "https://a.example/alien" },
  { id: "F2", url: "https://b.example/alien" },
];
const claim = (belegId, zitat, aenderung = {}) => ({
  werk: { typ: werk.typ, titel: werk.titel, jahr: werk.jahr },
  aussage: zitat,
  belegId,
  zitat,
  ...aenderung,
});
check("D1 verlangt zwei unabhaengige verantwortete Quellen", () =>
  pruefeSyntheseEingabe(werk, fundstellen).length === 0
  && pruefeSyntheseEingabe(werk, [fundstellen[0]]).includes("mindestbelegung")
  && pruefeSyntheseEingabe(werk, [fundstellen[0], { ...fundstellen[1], domain: "a.example" }]).includes("mindestbelegung")
  && pruefeSyntheseEingabe(werk, [fundstellen[0], { ...fundstellen[1], ursprung: "archiv-a" }]).includes("mindestbelegung"));
check("D1a eine ausdrueckliche institutionelle Einordnung darf allein tragen", () => {
  const institution = {
    ...fundstellen[0],
    quelle: "loc-nfr",
    domain: "www.loc.gov",
    belegklasse: "institutionell",
    ursprung: "loc-national-film-registry",
  };
  const struktur = {
    ...fundstellen[1],
    quelle: "wikidata",
    domain: "www.wikidata.org",
    belegklasse: "strukturiert",
    ursprung: "wikidata-community",
  };
  return pruefeSyntheseEingabe(werk, [institution]).length === 0
    && pruefeSyntheseEingabe(werk, [struktur]).includes("mindestbelegung")
    && pruefeSyntheseEingabe(werk, [struktur, institution]).length === 0;
});
check("D2 Auftrag enthaelt keine URLs oder persoenliche Felder", () => {
  const body = baueSyntheseAuftrag(werk, fundstellen); const serialisiert = JSON.stringify(body);
  return !/https?:\/\//.test(serialisiert) && !/account|profil|notiz|passung/i.test(serialisiert)
    && body.schema.properties.claims.items.properties.belegId.items === undefined
    && body.schema.properties.claims.items.properties.belegId.enum.join(",") === "F1,F2";
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
    && pruefeSyntheseAusgabe({ ...basis, belegIds: ["F1", "F2"] }, drei).includes("belegIds-mindestbelegung")
    && pruefeSyntheseAusgabe({ ...basis, belegIds: ["F1", "F3"] }, drei).length === 0;
});
check("D8 Ausgabe darf genau einen institutionellen Beleg waehlen", () => {
  const institution = { ...fundstellen[0], belegklasse: "institutionell" };
  const basis = { format: FILMWISSEN_SYNTHESE_FORMAT, warum: 4, sicherheit: "mittel", kurztext: "Relevant." };
  return pruefeSyntheseAusgabe({ ...basis, belegIds: ["F1"] }, [institution]).length === 0
    && pruefeSyntheseAusgabe({ ...basis, belegIds: ["F1"] }, [fundstellen[0]]).includes("belegIds-mindestbelegung");
});
check("D9 einzelne sichere Claims bleiben trotz kaputtem Nachbarn erhalten", () => {
  const roh = {
    format: FILMWISSEN_SYNTHESE_FORMAT,
    warum: 4,
    sicherheit: "mittel",
    claims: [
      claim("F1", fundstellen[0].kernaussagen[0]),
      claim("F2", fundstellen[1].kernaussagen[0]),
      claim("F9", "Unbelegt und fremd."),
    ],
    zusatz: "ignorieren",
  };
  const result = bereinigeSyntheseAusgabe(roh, werk, fundstellen, evidenz);
  return result.daten?.publizierbar === true
    && result.daten.claims.length === 2
    && result.daten.belegIds.join(",") === "F1,F2"
    && result.warnings.includes("invalid-items-ignored")
    && result.warnings.includes("extra-fields-ignored");
});
check("D10 falsche Werkidentitaet, Quelle, Zitat oder URL werden nie publizierbar", () => {
  const roh = {
    format: FILMWISSEN_SYNTHESE_FORMAT,
    warum: 4,
    sicherheit: "mittel",
    claims: [
      claim("F1", fundstellen[0].kernaussagen[0]),
      claim("F2", fundstellen[1].kernaussagen[0], {
        werk: { typ: "film", titel: "Blade Runner", jahr: 1982 },
      }),
      claim("F2", "Dieses Zitat steht in keiner Quelle."),
    ],
  };
  const ohneUrl = [{ id: "F1", url: evidenz[0].url }];
  const result = bereinigeSyntheseAusgabe(roh, werk, fundstellen, ohneUrl);
  return result.daten?.publizierbar === false
    && result.daten.claims.length === 1
    && result.warnings.includes("invalid-items-ignored");
});
check("D11 der alte belegIds-Vertrag bleibt fail-closed lesbar, freier Kurztext wird nicht publiziert", () => {
  const alt = {
    format: FILMWISSEN_SYNTHESE_FORMAT,
    warum: 5,
    sicherheit: "hoch",
    kurztext: "Freie Modellparaphrase.",
    belegIds: ["F1", "F2"],
  };
  const result = bereinigeSyntheseAusgabe(alt, werk, fundstellen, evidenz);
  return result.daten?.publizierbar === true
    && result.daten.claims.length === 2
    && result.daten.kurztext === "Praegte das Genre. Wurde breit rezipiert."
    && !result.daten.kurztext.includes("Modellparaphrase");
});
console.log(`\n${ok}/${ok + fehler.length} Filmwissen-Synthesevertrag-Checks bestanden.`);
if (fehler.length) process.exit(1);

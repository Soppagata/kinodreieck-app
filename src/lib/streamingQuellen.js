const GUELTIGE_QUELLENTYPEN = new Set(["sub", "free", "purchase", "tve"]);

const GRUPPEN_LABEL = {
  sub: "Abos (Subscription)",
  free: "Gratis (Free)",
  purchase: "Kauf & Leihe",
  tve: "TV-Anbieter",
  sonst: "Weitere",
};

const TYP_KURZ = {
  sub: "Abo",
  free: "Gratis",
  purchase: "Kauf/Leihe",
  tve: "TV",
  sonst: "Weitere",
  auswahl: "Deine Auswahl",
};
const normalisiereQuelle = (name) => (typeof name === "string" ? name.trim() : "");
const typAusQuelle = (q) => GUELTIGE_QUELLENTYPEN.has(q?.typ) ? q.typ : "sonst";
const istDemoKatalog = (katalogInfo) => katalogInfo?.variante === "demo";

const gruppenAusVerfuegbareQuellen = (quellenListe, standardGruppen = []) => {
  const gruppen = {};
  for (const quelle of quellenListe) {
    const name = normalisiereQuelle(quelle?.name);
    if (!name) continue;
    const typ = typAusQuelle(quelle);
    (gruppen[typ] ||= []).push(name);
  }

  const basis = [];
  for (const [typ, quellen] of Object.entries(gruppen)) {
    const bereinigt = [...new Set(quellen.map((q) => normalisiereQuelle(q)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (!bereinigt.length) continue;
    basis.push({
      name: GRUPPEN_LABEL[typ] || typ,
      typ,
      quellen: bereinigt,
      warnung: typ === "purchase"
        ? standardGruppen.find((x) => x.typ === "purchase")?.warnung
        : undefined,
    });
  }
  return basis;
};

function istGueltigesQuellenProfil(objekt) {
  return objekt && typeof objekt === "object" && Array.isArray(objekt.verfuegbare_quellen);
}

export function baueStreamingQuellenGruppen({
  bekannt = {},
  katalogInfo = null,
  auswahl = [],
  standardGruppen = [],
}) {
  const fallbackGruppen = Array.isArray(standardGruppen) ? [...standardGruppen] : [];
  const verfuegbareQuellen = istDemoKatalog(katalogInfo) || !istGueltigesQuellenProfil(bekannt)
    ? []
    : (bekannt.verfuegbare_quellen || []);
  let basis = verfuegbareQuellen.length
    ? gruppenAusVerfuegbareQuellen(verfuegbareQuellen, fallbackGruppen)
    : [...fallbackGruppen];

  if (!basis.length) basis = [...fallbackGruppen];

  const bekannteNamen = new Set(basis.flatMap((g) => g.quellen || []));
  const fehlendeAuswahl = [...new Set((Array.isArray(auswahl) ? auswahl : []).map(normalisiereQuelle))]
    .filter((q) => q && !bekannteNamen.has(q))
    .sort((a, b) => a.localeCompare(b));
  if (fehlendeAuswahl.length) {
    return [...basis, { name: "Deine Auswahl (nicht in der Liste)", typ: "auswahl", quellen: fehlendeAuswahl }];
  }
  return basis;
}

export { GRUPPEN_LABEL, TYP_KURZ };

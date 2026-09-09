/* Sichere, reine Zuordnung externer Titel zu eigenen Katalogeintraegen.
   Eine automatische Verbindung braucht eine vollstaendige Werkidentitaet:
   Bezugsjahr und Film-/Serientyp muessen auf beiden Seiten belegt sein.
   Danach gewinnt eine gemeinsame starke ID. Ohne gemeinsame ID ist nur der
   eindeutige exakte Titel-/Originaltitel-Abgleich erlaubt. */

export const EXTERNAL_TITLE_MATCH_STATUSES = Object.freeze([
  "matched", "unmatched", "ambiguous", "conflict",
]);

const MEDIA_TYPES = Object.freeze({
  film: "film", movie: "film",
  serie: "series", series: "series", tv: "series", tv_series: "series",
  "tv series": "series", show: "series",
});

const ID_FIELDS = Object.freeze({
  watchmode: Object.freeze(["watchmode_id", "watchmodeId"]),
  imdb: Object.freeze(["imdb_id", "imdbId"]),
  tmdb: Object.freeze(["tmdb_id", "tmdbId"]),
  flixpatrol: Object.freeze(["flixpatrol_id", "flixpatrolId"]),
});

function ersterWert(eintrag, felder) {
  for (const feld of felder) {
    const wert = eintrag?.[feld];
    if (wert !== null && wert !== undefined && String(wert).trim()) return wert;
  }
  return null;
}

export function normalisiereExterneTitelkennung(namespace, wert) {
  if (namespace === "flixpatrol" && typeof wert === "string") {
    const roh = wert.trim();
    const id = roh.startsWith("flixpatrol:") ? roh.slice("flixpatrol:".length) : roh;
    return /^ttl_[A-Za-z0-9]{20,40}$/.test(id) ? id : null;
  }
  const roh = String(wert ?? "").trim().toLowerCase();
  if (!roh) return null;
  if (namespace === "imdb") {
    const match = roh.match(/^(?:imdb:)?(?:tt)?([0-9]{5,12})$/);
    return match && /[1-9]/.test(match[1]) ? `tt${match[1]}` : null;
  }
  if (["tmdb", "watchmode"].includes(namespace)) {
    const prefix = new RegExp(`^(?:${namespace}:)?([0-9]+)$`);
    const match = roh.match(prefix);
    return match && BigInt(match[1]) > 0n ? String(BigInt(match[1])) : null;
  }
  return null;
}

export function externeTitelKennungen(eintrag) {
  const kennungen = {};
  for (const [namespace, felder] of Object.entries(ID_FIELDS)) {
    const normalisiert = normalisiereExterneTitelkennung(namespace, ersterWert(eintrag, felder));
    if (normalisiert) kennungen[namespace] = normalisiert;
  }
  return kennungen;
}

export function normalisiereExterneWerkart(eintrag) {
  const wert = String(eintrag?.typ ?? eintrag?.type ?? eintrag?.mediaType ?? "")
    .trim().toLowerCase();
  return MEDIA_TYPES[wert] || null;
}

export function externesReferenzjahr(eintrag) {
  const roh = eintrag?.jahr ?? eintrag?.year ?? eintrag?.releaseYear;
  if (roh === "" || roh === null || roh === undefined) return null;
  const jahr = Number(roh);
  return Number.isInteger(jahr) && jahr >= 1870 && jahr <= 2999 ? jahr : null;
}

export function normalisiereExternenTitel(wert) {
  return String(wert ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function titelmenge(eintrag) {
  return new Set([
    eintrag?.titel, eintrag?.title, eintrag?.originaltitel, eintrag?.originalTitle,
  ].map(normalisiereExternenTitel).filter(Boolean));
}

function gemeinsamerTitel(a, b) {
  const links = titelmenge(a);
  return [...titelmenge(b)].some((titel) => links.has(titel));
}

function idVergleich(extern, eigen) {
  const a = externeTitelKennungen(extern);
  const b = externeTitelKennungen(eigen);
  const gemeinsam = Object.keys(a).filter((namespace) => b[namespace]);
  return {
    gemeinsam,
    passend: gemeinsam.filter((namespace) => a[namespace] === b[namespace]),
    widerspruch: gemeinsam.filter((namespace) => a[namespace] !== b[namespace]),
  };
}

export function pruefeExterneTitelIdentitaet(extern, eigen) {
  const ids = idVergleich(extern, eigen);
  const titelPasst = gemeinsamerTitel(extern, eigen);
  if (!ids.passend.length && !titelPasst) {
    return Object.freeze({ status: "unmatched", reason: "identity-not-equal" });
  }
  const externTyp = normalisiereExterneWerkart(extern);
  const eigenTyp = normalisiereExterneWerkart(eigen);
  const externJahr = externesReferenzjahr(extern);
  const eigenJahr = externesReferenzjahr(eigen);
  if (!externTyp || !eigenTyp || externJahr == null || eigenJahr == null) {
    return Object.freeze({ status: "unmatched", reason: "identity-evidence-missing" });
  }
  if (externTyp !== eigenTyp || externJahr !== eigenJahr) {
    /* Ohne gemeinsame starke ID belegen Jahr und Typ gerade, dass ein
       gleichnamiger Eintrag ein anderes Werk ist (z. B. ein Remake oder eine
       Serie). Mit derselben starken ID ist der Widerspruch dagegen real. */
    if (!ids.passend.length) {
      return Object.freeze({ status: "unmatched", reason: "different-work" });
    }
    return Object.freeze({
      status: "conflict",
      reason: externTyp !== eigenTyp ? "media-type-conflict" : "reference-year-conflict",
      matchingNamespaces: Object.freeze(ids.passend),
    });
  }

  if (ids.widerspruch.length) {
    return Object.freeze({ status: "conflict", reason: "external-id-conflict",
      namespaces: Object.freeze(ids.widerspruch),
      matchingNamespaces: Object.freeze(ids.passend) });
  }
  if (ids.passend.length) {
    return Object.freeze({ status: "matched", matchedBy: "strong-id",
      namespaces: Object.freeze(ids.passend) });
  }
  if (titelPasst) {
    return Object.freeze({ status: "matched", matchedBy: "title-year-type",
      namespaces: Object.freeze([]) });
  }
  return Object.freeze({ status: "unmatched", reason: "identity-not-equal" });
}

export function ordneExternenTitelZu(extern, eigeneEintraege = []) {
  const kandidaten = (Array.isArray(eigeneEintraege) ? eigeneEintraege : [])
    .map((eintrag) => ({ eintrag, pruefung: pruefeExterneTitelIdentitaet(extern, eintrag) }));
  const starke = kandidaten.filter(({ pruefung }) =>
    pruefung.status === "matched" && pruefung.matchedBy === "strong-id");
  const geteilterIdKonflikt = kandidaten.some(({ pruefung }) =>
    pruefung.status === "conflict" && pruefung.matchingNamespaces?.length);
  if (starke.length === 1 && !geteilterIdKonflikt) {
    return Object.freeze({ ...starke[0].pruefung, match: starke[0].eintrag });
  }
  if (starke.length === 1 && geteilterIdKonflikt) {
    return Object.freeze({ status: "conflict", reason: "shared-strong-id-conflict" });
  }
  if (starke.length > 1) return Object.freeze({ status: "ambiguous", reason: "multiple-strong-id-matches" });

  const titel = kandidaten.filter(({ pruefung }) =>
    pruefung.status === "matched" && pruefung.matchedBy === "title-year-type");
  const konflikt = kandidaten.some(({ pruefung }) => pruefung.status === "conflict");
  if (titel.length === 1 && !konflikt) {
    return Object.freeze({ ...titel[0].pruefung, match: titel[0].eintrag });
  }
  if (titel.length === 1 && konflikt) {
    return Object.freeze({ status: "conflict", reason: "candidate-conflict" });
  }
  if (titel.length > 1) return Object.freeze({ status: "ambiguous", reason: "multiple-title-year-type-matches" });
  if (konflikt) {
    return Object.freeze({ status: "conflict", reason: "candidate-conflict" });
  }
  return Object.freeze({ status: "unmatched", reason: "no-candidate" });
}

/* Erst nach bestaetigter Identitaet verwenden. Eigene Werte fuehren; nur
   fehlende Kennungen werden aus der externen Projektion ergaenzt. */
export function ergaenzeFehlendeExterneKennungen(eigen, extern) {
  const ergebnis = { ...eigen };
  for (const [namespace, felder] of Object.entries(ID_FIELDS)) {
    const eigenWert = ersterWert(eigen, felder);
    const externWert = ersterWert(extern, felder);
    if (eigenWert !== null || externWert === null
        || !normalisiereExterneTitelkennung(namespace, externWert)) continue;
    ergebnis[felder[0]] = externWert;
  }
  return ergebnis;
}

const text = (wert) => String(wert || "").trim();

function eindeutig(werte) {
  const raus = [];
  const gesehen = new Set();
  for (const wert of werte || []) {
    const sauber = text(wert).toLowerCase();
    if (!sauber || gesehen.has(sauber)) continue;
    gesehen.add(sauber);
    raus.push(sauber);
  }
  return raus;
}

const BLOG_VOKABULAR_QUELLE = "bloganalyse";
const BLOG_VOKABULAR_PROMPT_VERSION = "blog-profile-v2";
const BLOG_VOKABULAR_PROMPT_VERSIONEN = new Set([
  "blog-profile-v1",
  BLOG_VOKABULAR_PROMPT_VERSION,
]);
const BLOG_VOKABULAR_ARTICLE_ID = /^[a-z0-9][a-z0-9_]{0,119}$/;
const BLOG_VOKABULAR_CONTENT_HASH = /^[a-f0-9]{64}$/;
const BLOG_VOKABULAR_NULL_HASH = /^0{64}$/;
const BLOG_VOKABULAR_CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BLOG_VOKABULAR_STEUERZEICHEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const BLOG_VOKABULAR_KANDIDAT_KEYS = Object.freeze(["wort", "beschreibung", "genres", "tags", "beleg"]);
const BLOG_VOKABULAR_KOPF_KEYS = Object.freeze(["quelle", "articleId", "contentHash", "analyzedAt", "promptVersion"]);
const utf8Bytes = (wert) => new TextEncoder().encode(wert).length;

const istObjekt = (wert) => !!wert && typeof wert === "object" && !Array.isArray(wert);

const hatExakteSchluessel = (wert, erwartet) => {
  if (!istObjekt(wert)) return false;
  const schluessel = Reflect.ownKeys(wert);
  return schluessel.length === erwartet.length
    && schluessel.every((name) => typeof name === "string" && erwartet.includes(name));
};

const normalisiereIdentitaet = (wert) => wert
  .normalize("NFKC")
  .replace(/\s+/gu, " ")
  .trim()
  .toLowerCase();

const istFlacherString = (wert, minBytes, maxBytes) => typeof wert === "string"
  && !BLOG_VOKABULAR_STEUERZEICHEN.test(wert)
  && utf8Bytes(wert) >= minBytes
  && utf8Bytes(wert) <= maxBytes;

const istCanonicalUtc = (wert) => {
  if (typeof wert !== "string" || !BLOG_VOKABULAR_CANONICAL_UTC.test(wert)) return false;
  const datum = new Date(wert);
  return Number.isFinite(datum.getTime()) && datum.toISOString() === wert;
};

const pruefeZuordnungen = (genres, tags, { maxDrei = true } = {}) => {
  const fehler = [];
  if (!Array.isArray(genres)) fehler.push("genres ist keine Liste");
  if (!Array.isArray(tags)) fehler.push("tags ist keine Liste");
  if (fehler.length) return { fehler, genres: [], tags: [] };

  const gesamt = [...genres, ...tags];
  if (gesamt.length < 1 || (maxDrei && gesamt.length > 3)) {
    fehler.push(maxDrei ? "Zuordnungen muessen zusammen 1..3 Eintraege haben" : "Zuordnungen duerfen nicht leer sein");
  }

  const normalisiert = [];
  gesamt.forEach((wert, index) => {
    if (!istFlacherString(wert, 1, 40) || !normalisiereIdentitaet(wert)) {
      fehler.push(`Zuordnung[${index}] ist ungueltig`);
      normalisiert.push(null);
      return;
    }
    normalisiert.push(normalisiereIdentitaet(wert));
  });
  if (normalisiert.includes(null)) return { fehler, genres: [], tags: [] };
  if (new Set(normalisiert).size !== normalisiert.length) {
    fehler.push("Zuordnungen sind normalisiert nicht eindeutig");
  }

  return {
    fehler,
    genres: normalisiert.slice(0, genres.length).sort(),
    tags: normalisiert.slice(genres.length).sort(),
  };
};

const gleicheMenge = (links, rechts) => links.length === rechts.length
  && links.every((wert, index) => wert === rechts[index]);

const gleicheZuordnung = (links, rechts) => gleicheMenge(links.genres, rechts.genres)
  && gleicheMenge(links.tags, rechts.tags);

const pruefeVorschaukopf = (vorschaukopf) => {
  const fehler = [];
  if (!hatExakteSchluessel(vorschaukopf, BLOG_VOKABULAR_KOPF_KEYS)) {
    return ["Vorschaukopf hat nicht exakt die erlaubten Schluessel"];
  }
  if (vorschaukopf.quelle !== BLOG_VOKABULAR_QUELLE) fehler.push("Vorschaukopf hat eine ungueltige Quelle");
  if (typeof vorschaukopf.articleId !== "string" || !BLOG_VOKABULAR_ARTICLE_ID.test(vorschaukopf.articleId)) {
    fehler.push("Vorschaukopf hat eine ungueltige articleId");
  }
  if (typeof vorschaukopf.contentHash !== "string"
      || !BLOG_VOKABULAR_CONTENT_HASH.test(vorschaukopf.contentHash)
      || BLOG_VOKABULAR_NULL_HASH.test(vorschaukopf.contentHash)) {
    fehler.push("Vorschaukopf hat einen ungueltigen contentHash");
  }
  if (!istCanonicalUtc(vorschaukopf.analyzedAt)) fehler.push("Vorschaukopf hat kein canonical UTC analyzedAt");
  if (!BLOG_VOKABULAR_PROMPT_VERSIONEN.has(vorschaukopf.promptVersion)) {
    fehler.push("Vorschaukopf hat eine ungueltige promptVersion");
  }
  return fehler;
};

const pruefeKandidat = (kandidat, index) => {
  const fehler = [];
  const prefix = `kandidaten[${index}]`;
  if (!hatExakteSchluessel(kandidat, BLOG_VOKABULAR_KANDIDAT_KEYS)) {
    return { fehler: [`${prefix} hat nicht exakt die erlaubten Schluessel`] };
  }
  if (!istFlacherString(kandidat.wort, 1, 40) || !normalisiereIdentitaet(kandidat.wort)) {
    fehler.push(`${prefix}.wort ist ungueltig`);
  }
  if (!istFlacherString(kandidat.beschreibung, 1, 96) || !normalisiereIdentitaet(kandidat.beschreibung)) {
    fehler.push(`${prefix}.beschreibung ist ungueltig`);
  }
  if (!istFlacherString(kandidat.beleg, 16, 96) || !normalisiereIdentitaet(kandidat.beleg)) {
    fehler.push(`${prefix}.beleg ist ungueltig`);
  }
  const zuordnung = pruefeZuordnungen(kandidat.genres, kandidat.tags);
  fehler.push(...zuordnung.fehler.map((grund) => `${prefix}: ${grund}`));
  if (fehler.length) return { fehler };
  return {
    fehler: [],
    wort: normalisiereIdentitaet(kandidat.wort),
    zuordnung,
  };
};

const pruefeBestand = (bestand) => {
  if (!Array.isArray(bestand)) return { fehler: ["vokabular ist keine Liste"], map: new Map() };
  const fehler = [];
  const map = new Map();
  bestand.forEach((eintrag, index) => {
    const prefix = `vokabular[${index}]`;
    if (!istObjekt(eintrag)) {
      fehler.push(`${prefix} ist kein Objekt`);
      return;
    }
    if (!istFlacherString(eintrag.wort, 1, 40) || !normalisiereIdentitaet(eintrag.wort)) {
      fehler.push(`${prefix}.wort ist ungueltig`);
      return;
    }
    const zuordnung = pruefeZuordnungen(eintrag.genres, eintrag.tags, { maxDrei: false });
    if (zuordnung.fehler.length) {
      fehler.push(...zuordnung.fehler.map((grund) => `${prefix}: ${grund}`));
      return;
    }
    const wort = normalisiereIdentitaet(eintrag.wort);
    const bekannte = map.get(wort) || [];
    bekannte.push(zuordnung);
    map.set(wort, bekannte);
  });
  return { fehler, map };
};

export function vokabularZuMap(liste) {
  const map = {};
  for (const eintrag of liste || []) {
    const wort = text(eintrag?.wort).toLowerCase();
    if (!wort) continue;
    map[wort] = {
      genres: eindeutig(eintrag.genres),
      tags: eindeutig(eintrag.tags),
    };
  }
  return map;
}

/* Reiner Schreibvertrag fuer den ausdruecklichen Speicherklick der
   Blog-Vokabular-Vorschau. Er schreibt weder Storage noch Eingaben und
   uebernimmt nur eine vollstaendig konfliktfreie Kandidatenmenge. */
export function uebernimmBlogVokabular(vokabular, vorschaukopf, kandidaten) {
  const abbruch = (fehler) => ({
    vokabular,
    uebernommen: 0,
    bereitsVorhanden: 0,
    abgelehnt: true,
    fehler: Array.isArray(fehler) ? fehler : [fehler],
  });

  try {
    const bestand = pruefeBestand(vokabular);
    if (bestand.fehler.length) return abbruch(bestand.fehler);

    const kopfFehler = pruefeVorschaukopf(vorschaukopf);
    if (kopfFehler.length) return abbruch(kopfFehler);
    if (!Array.isArray(kandidaten)) return abbruch("kandidaten ist keine Liste");
    if (kandidaten.length > 6) return abbruch("kandidaten darf hoechstens 6 Eintraege haben");

    const validiert = kandidaten.map((kandidat, index) => pruefeKandidat(kandidat, index));
    const kandidatFehler = validiert.flatMap((ergebnis) => ergebnis.fehler);
    if (kandidatFehler.length) return abbruch(kandidatFehler);

    const kandidatenNachWort = new Map();
    for (const kandidat of validiert) {
      const bekannteKandidaten = kandidatenNachWort.get(kandidat.wort) || [];
      if (bekannteKandidaten.some((zuordnung) => !gleicheZuordnung(zuordnung, kandidat.zuordnung))) {
        return abbruch("Dasselbe Kandidatenwort hat unterschiedliche Genre-/Tag-Zuordnungen");
      }
      bekannteKandidaten.push(kandidat.zuordnung);
      kandidatenNachWort.set(kandidat.wort, bekannteKandidaten);

      const bekannteBestandswerte = bestand.map.get(kandidat.wort) || [];
      if (bekannteBestandswerte.some((zuordnung) => !gleicheZuordnung(zuordnung, kandidat.zuordnung))) {
        return abbruch("Kandidatenwort widerspricht der bestehenden Genre-/Tag-Zuordnung");
      }
    }

    const meta = {
      quelle: vorschaukopf.quelle,
      articleId: vorschaukopf.articleId,
      contentHash: vorschaukopf.contentHash,
      analyzedAt: vorschaukopf.analyzedAt,
      promptVersion: vorschaukopf.promptVersion,
    };
    const imAufruf = new Map();
    const neu = [];
    let bereitsVorhanden = 0;
    kandidaten.forEach((kandidat, index) => {
      const geprueft = validiert[index];
      const bekannteBestandswerte = bestand.map.get(geprueft.wort) || [];
      const bekannteKandidaten = imAufruf.get(geprueft.wort) || [];
      if (bekannteBestandswerte.some((zuordnung) => gleicheZuordnung(zuordnung, geprueft.zuordnung))
          || bekannteKandidaten.some((zuordnung) => gleicheZuordnung(zuordnung, geprueft.zuordnung))) {
        bereitsVorhanden++;
        return;
      }
      bekannteKandidaten.push(geprueft.zuordnung);
      imAufruf.set(geprueft.wort, bekannteKandidaten);
      neu.push({
        wort: kandidat.wort,
        beschreibung: kandidat.beschreibung,
        genres: [...kandidat.genres],
        tags: [...kandidat.tags],
        beleg: kandidat.beleg,
        ...meta,
      });
    });

    if (!neu.length) {
      return {
        vokabular,
        uebernommen: 0,
        bereitsVorhanden,
        abgelehnt: false,
        fehler: [],
      };
    }
    return {
      vokabular: [...vokabular, ...neu],
      uebernommen: neu.length,
      bereitsVorhanden,
      abgelehnt: false,
      fehler: [],
    };
  } catch {
    return abbruch("Eingaben konnten nicht sicher geprueft werden");
  }
}

/* Eine KI-Deutung wird genau einmal in eine kleine lokale Regel übersetzt.
   Danach braucht der Finder weder Netz noch Modell: Das Wort verhält sich wie
   jede eingebaute Stimmung und boostet passende Genres/Tags deterministisch. */
export function vokabularEintragAusDeutung({
  wort,
  beschreibung,
  deutung,
  master = [],
  stimmungen = {},
}) {
  const sig = deutung?.sig || {};
  const genres = [...(sig.genres || [])];
  const tags = [];

  for (const stimmung of sig.stimmungen || []) {
    const definition = stimmungen[stimmung] || {};
    genres.push(...(definition.genres || []));
    tags.push(...(definition.tags || []));
  }

  const filmIds = new Set((sig.titel || []).map((film) => String(film.id)));
  for (const film of master || []) {
    if (!filmIds.has(String(film.id))) continue;
    genres.push(...(film.genre || []));
    tags.push(...(film.tags || []));
  }

  /* Kategorien wie „Kult“ sind im Bestand häufig gleichzeitig Tags. Als
     weiches Tag bleiben sie nützlich, ohne wie ein harter Kategorienfilter
     alle anderen Rule-of-Cool-Beispiele auszusortieren. */
  tags.push(...(sig.kategorien || []));

  return {
    wort: text(wort).toLowerCase(),
    beschreibung: text(beschreibung),
    interpretation: text(deutung?.klartext),
    genres: eindeutig(genres),
    tags: eindeutig(tags),
    erstellt_am: new Date().toISOString(),
  };
}

export function hatOfflineDefinition(eintrag) {
  return !!(eintrag?.wort && ((eintrag.genres || []).length || (eintrag.tags || []).length));
}

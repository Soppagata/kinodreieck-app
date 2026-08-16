const istObjekt = (wert) => !!wert && typeof wert === "object" && !Array.isArray(wert);

const exaktSchluessel = (wert, schluessel) => istObjekt(wert)
  && Object.keys(wert).length === schluessel.length
  && schluessel.every((name) => Object.prototype.hasOwnProperty.call(wert, name));

const istText = (wert) => typeof wert === "string" && wert.length > 0;
const istGanzzahl = (wert) => Number.isInteger(wert);

const BYTE_LAENGE = (text) => new TextEncoder().encode(String(text)).length;
const NFKC_WHITESPACE = /\s+/gu;
const ZEILENWECHSEL_OHNE_TEXT = /[\r\n\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

const BLOG_PROFILE_ID = /^[a-z0-9][a-z0-9_]{0,119}$/;
const BLOG_PROFILE_ARTEN = Object.freeze([
  "genre", "thema", "erzaehlweise", "inszenierung", "tempo", "ton", "haltung", "regie", "epoche", "land", "kritikpunkt",
]);
const BLOG_PROFILE_RICHTUNGEN = Object.freeze(["zieht_an", "stoesst_ab", "ambivalent"]);
const BLOG_PROFILE_SICHERHEITEN = Object.freeze(["hoch", "mittel", "niedrig"]);

export const BLOG_PROFILE_ANALYSE_SOURCE = "bloganalyse";
export const BLOG_PROFILE_ANALYSE_PROMPT_VERSION = "blog-profile-v1";
export const BLOG_PROFILE_IDMUSTER = BLOG_PROFILE_ID;
export const BLOG_PROFILE_ARTEN_SET = BLOG_PROFILE_ARTEN;
export const BLOG_PROFILE_RICHTUNG_SET = BLOG_PROFILE_RICHTUNGEN;
export const BLOG_PROFILE_SICHERHEIT_SET = BLOG_PROFILE_SICHERHEITEN;

const BLOG_PROFILE_STORAGE_KEY = "kd:blog-profile-analyse:nachweis:v1";

export const BLOG_PROFILE_LIST_MAX_EINZEL = 80;
export const BLOG_PROFILE_LIST_MAX_ZUSAMMEN = 120;
export const BLOG_PROFILE_LIST_MAX_BYTES = 40;
export const BLOG_PROFILE_TITEL_MAX_BYTES = 160;
export const BLOG_PROFILE_TEXT_MAX_BYTES = 18000;
export const BLOG_PROFILE_WORT_MAX_BYTES = 40;
export const BLOG_PROFILE_WERT_MAX_BYTES = 60;
export const BLOG_PROFILE_BELG_MAX_BYTES = 96;
export const BLOG_PROFILE_BELG_MIN_BYTES = 16;
export const BLOG_PROFILE_MAX_GESCHMAKSE = 12;
export const BLOG_PROFILE_MAX_VOKABULAR = 6;

const normalisiereIdentitaet = (wert) => String(wert).normalize("NFKC").replace(NFKC_WHITESPACE, " ").trim().toLowerCase();
const istEinzeilig = (wert) => !ZEILENWECHSEL_OHNE_TEXT.test(String(wert));
const istZeilenfreierBeleg = (wert) => typeof wert === "string" && istEinzeilig(wert);

const fehlschlag = (grund) => ({ ok: false, fehler: [grund], payload: null });
const erfolg = (payload) => ({ ok: true, fehler: [], payload });

const setAusListe = (liste) => {
  const exact = new Set();
  const normalisiert = new Set();
  return liste.reduce((acc, raw) => {
    const normal = normalisiereIdentitaet(raw);
    if (raw !== undefined) acc.exact.add(raw);
    if (normal) acc.normalisiert.add(normal);
    return acc;
  }, { exact, normalisiert });
};

const istListeWert = (wert, minBytes, maxBytes, zeilenfrei = true) => {
  if (typeof wert !== "string") return false;
  if (zeilenfrei && !istEinzeilig(wert)) return false;
  const bytes = BYTE_LAENGE(wert);
  return bytes >= minBytes && bytes <= maxBytes;
};

const validateListenWerte = (werte, listeName, errors) => {
  if (!Array.isArray(werte)) return { ok: false, werte: [], key: `${listeName}:` + " keine Liste" };
  if (werte.length > BLOG_PROFILE_LIST_MAX_EINZEL) return { ok: false, werte: [], key: `${listeName}:zu viele` };
  for (const eintrag of werte) {
    if (typeof eintrag !== "string") return { ok: false, werte: [], key: `${listeName}:kein String` };
    if (!istEinzeilig(eintrag)) return { ok: false, werte: [], key: `${listeName}:steuerelement` };
    const bytes = BYTE_LAENGE(eintrag);
    if (bytes < 1 || bytes > BLOG_PROFILE_LIST_MAX_BYTES) return { ok: false, werte: [], key: `${listeName}:falsche byteLaenge` };
  }
  return { ok: true, werte: [...werte] };
};

function valideEinzelnachweis(article) {
  if (!istObjekt(article)) return fehlschlag("artikel ist kein Objekt");
  if (typeof article.herkunft !== "string" || article.herkunft === "gezogen") return fehlschlag("artikel ist nicht eigen");
  if ("finderGenreKey" in article) return fehlschlag("finderGenreKey ist verboten");
  if (!BLOG_PROFILE_ID.test(String(article.id || ""))) return fehlschlag("artikelId ungültig");
  if (!istText(String(article.titel))) return fehlschlag("titel fehlt");
  if (BYTE_LAENGE(article.titel) < 1 || BYTE_LAENGE(article.titel) > BLOG_PROFILE_TITEL_MAX_BYTES) return fehlschlag("titel-Länge ungültig");
  if (!istText(String(article.text))) return fehlschlag("text fehlt");
  if (BYTE_LAENGE(article.text) < 1 || BYTE_LAENGE(article.text) > BLOG_PROFILE_TEXT_MAX_BYTES) return fehlschlag("text-Länge ungültig");

  const genresErgebnis = validateListenWerte(article.genres, "genres");
  if (!genresErgebnis.ok) return fehlschlag(genresErgebnis.key);
  if (genresErgebnis.werte.length === 0) return fehlschlag("genres darf nicht leer sein");

  const tagsErgebnis = validateListenWerte(article.tags, "tags");
  if (!tagsErgebnis.ok) return fehlschlag(tagsErgebnis.key);
  if (genresErgebnis.werte.length + tagsErgebnis.werte.length > BLOG_PROFILE_LIST_MAX_ZUSAMMEN) return fehlschlag("listen zu lang");

  const normSet = new Set();
  const exactSet = new Set();
  for (const wert of [...genresErgebnis.werte, ...tagsErgebnis.werte]) {
    if (exactSet.has(wert)) return fehlschlag("doppelte Werte");
    exactSet.add(wert);
    const normal = normalisiereIdentitaet(wert);
    if (normSet.has(normal)) return fehlschlag("duplikat über Listen");
    normSet.add(normal);
  }

  return erfolg({
    artikel: {
      id: String(article.id),
      titel: String(article.titel),
      text: String(article.text),
    },
    listen: {
      genres: genresErgebnis.werte,
      tags: tagsErgebnis.werte,
    },
  });
}

export function waehleBlogProfilArtikel({ artikel = [], artikelId }) {
  if (!Array.isArray(artikel)) return fehlschlag("artikel ist keine Liste");
  const id = String(artikelId || "");
  if (!BLOG_PROFILE_ID.test(id)) return fehlschlag("artikelId ungültig");

  const treffer = artikel.filter((a) => istObjekt(a) && String(a.id || "") === id);
  if (treffer.length !== 1) return fehlschlag("artikelId führt nicht zu exakt einem Treffer");

  return valideEinzelnachweis(treffer[0]);
}

const KEIN_STEUERZEICHEN = /[\u0000-\u001f\u007f-\u009f]/u;
const listenkonflikt = (liste, erlaubte, name, errors) => {
  if (!Array.isArray(liste)) {
    errors.push(`${name} is not array`);
    return;
  }
  if (liste.length > BLOG_PROFILE_MAX_GESCHMAKSE) {
    errors.push(`${name} too many`);
  }
};

const validateGeschmackszuegeItem = (item, erlaubteGenres, allowedKeys, alleFehler, artikelText) => {
  const itemKeys = ["art", "wert", "richtung", "staerke", "sicherheit", "beleg"];
  if (!exaktSchluessel(item, itemKeys)) {
    alleFehler.push("geschmackszuege-item hat falsche Schlüssel");
    return;
  }
  if (!BLOG_PROFILE_ARTEN.includes(item.art)) alleFehler.push("geschmackszueg.art ungültig");
  if (!istListeWert(item.wert, 1, BLOG_PROFILE_WERT_MAX_BYTES)) alleFehler.push("geschmackszueg.wert byte ungültig");
  if (item.art === "genre" && !erlaubteGenres.includes(item.wert)) alleFehler.push("genre-Wert nicht erlaubt");
  if (!BLOG_PROFILE_RICHTUNGEN.includes(item.richtung)) alleFehler.push("geschmackszueg.richtung ungültig");
  if (!istGanzzahl(item.staerke) || item.staerke < 1 || item.staerke > 5) alleFehler.push("geschmackszueg.staerke ungültig");
  if (!BLOG_PROFILE_SICHERHEITEN.includes(item.sicherheit)) alleFehler.push("geschmackszueg.sicherheit ungültig");
  if (!istZeilenfreierBeleg(item.beleg) || !istListeWert(item.beleg, BLOG_PROFILE_BELG_MIN_BYTES, BLOG_PROFILE_BELG_MAX_BYTES)) alleFehler.push("geschmackszueg.beleg ungültig");
  if (typeof artikelText === "string" && !artikelText.includes(item.beleg)) alleFehler.push("geschmackszueg.beleg nicht im Artikel");
};

const normalizeTagSet = (werte) => Array.from(new Set((werte || []).map((w) => normalisiereIdentitaet(w))))
  .filter((w) => w.length > 0)
  .sort();

const sameSet = (a, b) => {
  if (a.length !== b.length) return false;
  return a.every((v, idx) => v === b[idx]);
};

const validiereVokabularItem = (item, erlaubteGenres, erlaubteTags, alleFehler, artikelText) => {
  const itemKeys = ["wort", "beschreibung", "genres", "tags", "beleg"];
  if (!exaktSchluessel(item, itemKeys)) {
    alleFehler.push("vokabular-item hat falsche Schlüssel");
    return;
  }
  if (!istListeWert(item.wort, 1, BLOG_PROFILE_WORT_MAX_BYTES)) alleFehler.push("vokabular.wort byte ungültig");
  if (!istListeWert(item.beschreibung, 1, BLOG_PROFILE_BELG_MAX_BYTES)) alleFehler.push("vokabular.beschreibung byte ungültig");
  if (!Array.isArray(item.genres)) alleFehler.push("vokabular.genres ist keine Liste");
  if (!Array.isArray(item.tags)) alleFehler.push("vokabular.tags ist keine Liste");

  const zuordnung = [...(item.genres || []), ...(item.tags || [])];
  if (zuordnung.length < 1 || zuordnung.length > 3) alleFehler.push("vokabular-Zuordnung darf nicht 0 oder >3 sein");

  for (const wert of item.genres || []) {
    if (!erlaubteGenres.includes(wert)) alleFehler.push("vokabular.genres enthält unbekanntes Genre");
  }
  for (const wert of item.tags || []) {
    if (!erlaubteTags.includes(wert)) alleFehler.push("vokabular.tags enthält unbekanntes Tag");
  }

  const normSet = normalizeTagSet(zuordnung);
  if (new Set(zuordnung).size !== zuordnung.length) alleFehler.push("vokabular.Zuordnung enthält exakte Dublette");
  if (new Set(normSet).size !== normSet.length) alleFehler.push("vokabular.Zuordnung enthält normalisierte Dublette");

  if (!istZeilenfreierBeleg(item.beleg) || !istListeWert(item.beleg, BLOG_PROFILE_BELG_MIN_BYTES, BLOG_PROFILE_BELG_MAX_BYTES)) alleFehler.push("vokabular.beleg byte ungültig");
  if (typeof artikelText === "string" && !artikelText.includes(item.beleg)) alleFehler.push("vokabular.beleg nicht im Artikel");
};

export function pruefeBlogProfilAnalyseAntwort(antwort, articlePayload) {
  const fehler = [];
  if (!exaktSchluessel(antwort, ["geschmackszuege", "vokabular"])) {
    return fehlschlag("antwort hat nicht genau geschmackszuege/vokabular");
  }

  const erlaubteGenres = istObjekt(articlePayload?.listen) && Array.isArray(articlePayload.listen.genres)
    ? articlePayload.listen.genres
    : [];
  const erlaubteTags = istObjekt(articlePayload?.listen) && Array.isArray(articlePayload.listen.tags)
    ? articlePayload.listen.tags
    : [];
  const artikelText = istText(articlePayload?.artikel?.text) ? articlePayload.artikel.text : "";

  if (!Array.isArray(antwort.geschmackszuege)) return fehlschlag("geschmackszuege ist keine Liste");
  if (!Array.isArray(antwort.vokabular)) return fehlschlag("vokabular ist keine Liste");
  if (antwort.geschmackszuege.length > BLOG_PROFILE_MAX_GESCHMAKSE) fehler.push("zu viele geschmackszuege");
  if (antwort.vokabular.length > BLOG_PROFILE_MAX_VOKABULAR) fehler.push("zu viele vokabular");

  antwort.geschmackszuege.forEach((item) => validateGeschmackszuegeItem(item, erlaubteGenres, true, fehler, artikelText));
  antwort.vokabular.forEach((item) => validiereVokabularItem(item, erlaubteGenres, erlaubteTags, fehler, artikelText));

  if (fehler.length > 0) return fehlschlag(fehler.join(" | "));
  return erfolg({
    geschmackszuege: antwort.geschmackszuege.map((item) => ({ ...item })),
    vokabular: antwort.vokabular.map((item) => ({ ...item })),
  });
};

const sha256Hex = async (text) => {
  if (typeof crypto?.subtle?.digest !== "function") {
    return Promise.resolve("".padEnd(64, "0"));
  }
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const bytes = new Uint8Array(hashBuffer);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const statusFuerProfilItem = (item, existingSetsByKey) => {
  const art = String(item.art);
  const wert = normalisiereIdentitaet(item.wert);
  const richtung = String(item.richtung);
  const key = `${art}|${wert}|${richtung}`;
  const keyOhneRichtung = `${art}|${wert}`;
  const bekannteRichtungen = existingSetsByKey.get(keyOhneRichtung) || new Set();
  if (bekannteRichtungen.has(richtung)) return { status: "bereits_vorhanden", editierbar: false };
  if (bekannteRichtungen.size > 0) return { status: "konflikt", editierbar: true };
  if (key) return { status: "neu", editierbar: true };
  return { status: "neu", editierbar: true };
};

const statusFuerVokabularItem = (item, existingMap) => {
  const wort = normalisiereIdentitaet(item.wort);
  const zuordnung = normalizeTagSet([...(item.genres || []), ...(item.tags || [])]);
  const liste = existingMap.get(wort) || [];
  if (liste.length === 0) return { status: "neu", editierbar: true };

  const same = liste.some((mapping) => sameSet(mapping, zuordnung));
  if (same) return { status: "bereits_vorhanden", editierbar: false };
  return { status: "konflikt", editierbar: true };
};

const buildExistingSignalMap = (existing = {}) => {
  const map = new Map();
  for (const signal of (existing.geschmackszuege || [])) {
    if (!signal || typeof signal !== "object") continue;
    if (!BLOG_PROFILE_ARTEN.includes(signal.art)) continue;
    if (!istText(signal.wert)) continue;
    if (!BLOG_PROFILE_RICHTUNGEN.includes(signal.richtung)) continue;
    const art = String(signal.art);
    const wert = normalisiereIdentitaet(signal.wert);
    const richtung = String(signal.richtung);
    const key = `${art}|${wert}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(richtung);
  }
  return map;
};

const buildExistingVokabularMap = (existing = {}) => {
  const map = new Map();
  for (const eintrag of (existing.vokabular || [])) {
    if (!eintrag || typeof eintrag !== "object") continue;
    if (typeof eintrag.wort !== "string") continue;
    const wort = normalisiereIdentitaet(eintrag.wort);
    const zuordnung = normalizeTagSet([...(eintrag.genres || []), ...(eintrag.tags || [])]);
    if (!map.has(wort)) map.set(wort, []);
    map.get(wort).push(zuordnung);
  }
  return map;
};

const storageKey = (accountId) => `${BLOG_PROFILE_STORAGE_KEY}:${String(accountId || "")}`;

const validiereNachweisMarker = (raw) => {
  if (!istObjekt(raw)) return null;
  if (!exaktSchluessel(raw, ["articleId", "contentHash", "analyzedAt"])) return null;
  if (!BLOG_PROFILE_ID.test(String(raw.articleId || ""))) return null;
  if (!/^[a-f0-9]{64}$/.test(String(raw.contentHash || ""))) return null;
  if (!istText(raw.analyzedAt)) return null;
  return { articleId: String(raw.articleId), contentHash: String(raw.contentHash), analyzedAt: String(raw.analyzedAt) };
};

export function liesBlogProfilAnalyseNachweis(storage, accountId) {
  if (!storage || typeof storage.getItem !== "function") return null;
  const raw = storage.getItem(storageKey(accountId));
  if (typeof raw !== "string") return null;
  try {
    return validiereNachweisMarker(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function speichereBlogProfilAnalyseNachweis(storage, accountId, marker) {
  if (!storage || typeof storage.setItem !== "function") return false;
  const valid = validiereNachweisMarker(marker);
  if (!valid) return false;
  storage.setItem(storageKey(accountId), JSON.stringify(valid));
  return true;
}

export async function isArtikelUnveraendert(storage, accountId, artikelPayload, options = {}) {
  if (!istObjekt(artikelPayload?.artikel)) return false;
  if (typeof artikelPayload.artikel.id !== "string" || !BLOG_PROFILE_ID.test(artikelPayload.artikel.id)) return false;
  if (typeof artikelPayload.artikel.titel !== "string" || typeof artikelPayload.artikel.text !== "string") return false;

  const digest = options.digest || sha256Hex;
  const hash = await digest(`${artikelPayload.artikel.titel}\u0000${artikelPayload.artikel.text}`);
  if (!/^[a-f0-9]{64}$/.test(hash)) return false;
  const nachweis = liesBlogProfilAnalyseNachweis(storage, accountId);
  if (!nachweis) return false;

  return nachweis.articleId === artikelPayload.artikel.id && nachweis.contentHash === hash;
}

export async function erzeugeBlogProfilAnalyseVorschau({
  artikelPayload,
  modelAntwort,
  bestehendesProfil = {},
  storage,
  accountId,
  digest = sha256Hex,
  clock = () => new Date().toISOString(),
}) {
  if (!istObjekt(artikelPayload)) return fehlschlag("artikelPayload fehlt");
  const validation = pruefeBlogProfilAnalyseAntwort(modelAntwort, artikelPayload);
  if (!validation.ok) return validation;

  const hash = await digest(`${artikelPayload.artikel.titel}\u0000${artikelPayload.artikel.text}`);
  if (!/^[a-f0-9]{64}$/.test(hash)) return fehlschlag("hash nicht berechenbar");
  const analyzedAt = String(clock());

  const signalMap = buildExistingSignalMap(bestehendesProfil);
  const vokabularMap = buildExistingVokabularMap(bestehendesProfil);

  const geschmackszuege = validation.payload.geschmackszuege.map((item) => {
    const statusInfo = statusFuerProfilItem(item, signalMap);
    return {
      ...item,
      status: statusInfo.status,
      editierbar: statusInfo.editierbar,
    };
  });
  const vokabular = validation.payload.vokabular.map((item) => {
    const statusInfo = statusFuerVokabularItem(item, vokabularMap);
    return {
      ...item,
      status: statusInfo.status,
      editierbar: statusInfo.editierbar,
    };
  });

  const widerspruch = [...geschmackszuege, ...vokabular].some((item) => item.status === "konflikt");
  const bereits = [...geschmackszuege, ...vokabular].every((item) => item.status === "bereits_vorhanden");
  const status = widerspruch ? "konflikt" : bereits ? "bereits_vorhanden" : "editierbar";
  const unveraendert = await isArtikelUnveraendert(storage, accountId, artikelPayload, { digest });

  return erfolg({
    quelle: BLOG_PROFILE_ANALYSE_SOURCE,
    promptVersion: BLOG_PROFILE_ANALYSE_PROMPT_VERSION,
    articleId: artikelPayload.artikel.id,
    contentHash: hash,
    analyzedAt,
    status,
    unveraendert,
    geschmackszuege,
    vokabular,
  });
}

export function revalidiereBlogProfilAnalyseVorschau({
  artikelPayload,
  modelAntwort,
  bestehendesProfil,
  storage,
  accountId,
  digest,
  clock,
}) {
  return erzeugeBlogProfilAnalyseVorschau({
    artikelPayload,
    modelAntwort,
    bestehendesProfil,
    storage,
    accountId,
    digest,
    clock,
  });
}

const HEALTH_ROOT_KEYS = Object.freeze([
  "ok",
  "task",
  "vorgangId",
  "phase",
  "contractVersion",
  "buildVersion",
  "laufzeit",
  "schluesselHerkunft",
  "anbieterSecretGesetzt",
  "aufrufer",
  "betrieb",
  "zeit",
  "capabilities",
]);

const BLOG_PROFILE_EXTRACT_KEYS = Object.freeze([
  "ready",
  "task",
  "promptVersion",
  "modelAlias",
  "maxTokens",
  "taskMaxReservationUsdCent",
]);

/* Fail-closed für die spätere UI: nur exakt den erwarteten Vertrag.
   - keine data-hülle
   - keine Zusatzfelder
   - keine Typ-Umdeutung (Stringzahlen usw. sind ungültig)
   - betrieb.aiAktiv muss explizit true sein
   - capabilities.blogProfileExtract muss exakt vorliegen
 */
export function hatBlogProfileAnalyseCapability(healthAntwort) {
  if (!exaktSchluessel(healthAntwort, HEALTH_ROOT_KEYS)) return false;
  if (healthAntwort.ok !== true) return false;
  if (healthAntwort.task !== "health") return false;
  if (healthAntwort.contractVersion !== "ai-task-v5") return false;
  if (!istText(healthAntwort.vorgangId)) return false;
  if (!istText(healthAntwort.phase)) return false;
  if (!istText(healthAntwort.buildVersion)) return false;
  if (!istText(healthAntwort.zeit)) return false;
  if (!istObjekt(healthAntwort.laufzeit)
    || !istObjekt(healthAntwort.schluesselHerkunft)
    || !istObjekt(healthAntwort.aufrufer)) return false;

  if (!istObjekt(healthAntwort.betrieb)
    || healthAntwort.betrieb.aiAktiv !== true) return false;

  if (!exaktSchluessel(healthAntwort.capabilities, ["blogProfileExtract"])) return false;
  if (!exaktSchluessel(healthAntwort.capabilities.blogProfileExtract, BLOG_PROFILE_EXTRACT_KEYS)) return false;
  const eintrag = healthAntwort.capabilities.blogProfileExtract;

  if (eintrag.ready !== true) return false;
  if (eintrag.task !== "blog-profile-extract") return false;
  if (eintrag.promptVersion !== "blog-profile-v1") return false;
  if (eintrag.modelAlias !== "klein") return false;
  if (eintrag.maxTokens !== 2048 || !istGanzzahl(eintrag.maxTokens)) return false;
  if (eintrag.taskMaxReservationUsdCent !== 5 || !istGanzzahl(eintrag.taskMaxReservationUsdCent)) return false;

  return true;
}

export const BLOG_PROFILE_CAPABILITY_KEYS = BLOG_PROFILE_EXTRACT_KEYS;

// Backward-compatiblity alias for external callers.
export const pruefeBlogProfileAnalyseAntwort = pruefeBlogProfilAnalyseAntwort;

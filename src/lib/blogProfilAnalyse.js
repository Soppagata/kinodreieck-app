const istObjekt = (wert) => !!wert && typeof wert === "object" && !Array.isArray(wert);

const exaktSchluessel = (wert, schluessel) => istObjekt(wert)
  && Object.keys(wert).length === schluessel.length
  && schluessel.every((name) => Object.prototype.hasOwnProperty.call(wert, name));

const istText = (wert) => typeof wert === "string";
const istGanzzahl = (wert) => Number.isInteger(wert);

const BYTE_LAENGE = (text) => new TextEncoder().encode(text).length;
const NFKC_WHITESPACE = /\s+/gu;
const KEINE_STEUERZEICHEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

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

const BLOG_PROFILE_ARTICLE_ROOT_KEYS = Object.freeze(["id", "titel", "text"]);
const BLOG_PROFILE_LISTEN_KEYS = Object.freeze(["genres", "tags"]);
const BLOG_PROFILE_HASH_RE = /^[a-f0-9]{64}$/;
const BLOG_PROFILE_HASH_NOT_ZERO_RE = /^0{64}$/;
const BLOG_PROFILE_ARTICLE_KEYS = Object.freeze(["artikel", "listen"]);
const SUPABASE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const normalisiereIdentitaet = (wert) => String(wert)
  .normalize("NFKC")
  .replace(NFKC_WHITESPACE, " ")
  .trim()
  .toLowerCase();

const istEinzeilig = (wert) => istText(wert) && !KEINE_STEUERZEICHEN.test(wert);
const istSemantischNichtLeer = (wert) => istText(wert) && wert
  .normalize("NFKC")
  .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
  .trim()
  .length > 0;

const istStringImByteBereich = (wert, minBytes, maxBytes, einzeilig = false) => {
  if (!istText(wert)) return false;
  if (einzeilig && !istEinzeilig(wert)) return false;
  if (!istSemantischNichtLeer(wert)) return false;
  const bytes = BYTE_LAENGE(wert);
  return bytes >= minBytes && bytes <= maxBytes;
};

const fehlschlag = (grund) => ({ ok: false, fehler: [grund], payload: null });
const erfolg = (payload) => ({ ok: true, fehler: [], payload });

const isCanonicalIsoDate = (wert) => {
  if (!istText(wert) || !CANONICAL_UTC.test(wert)) return false;
  const parsed = new Date(wert);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === wert;
};

const valideEinzelnachweis = ({ artikel, listen }, errors) => {
  if (!exaktSchluessel(artikel, BLOG_PROFILE_ARTICLE_ROOT_KEYS)) {
    errors.push("artikelPayload.artikel hat nicht exakt id/titel/text");
    return { ok: false, payload: null };
  }

  if (typeof artikel.id !== "string" || !BLOG_PROFILE_ID.test(artikel.id)) {
    errors.push("artikelPayload.artikel.id ungültig");
    return { ok: false, payload: null };
  }

  if (!istStringImByteBereich(artikel.titel, 1, BLOG_PROFILE_TITEL_MAX_BYTES, true)) {
    errors.push("artikelPayload.artikel.titel ungültig");
    return { ok: false, payload: null };
  }

  if (!istText(artikel.text) || !istStringImByteBereich(artikel.text, 1, BLOG_PROFILE_TEXT_MAX_BYTES, false)) {
    errors.push("artikelPayload.artikel.text ungültig");
    return { ok: false, payload: null };
  }

  if (!exaktSchluessel(listen, BLOG_PROFILE_LISTEN_KEYS)) {
    errors.push("artikelPayload.listen hat nicht exakt genres/tags");
    return { ok: false, payload: null };
  }

  if (!Array.isArray(listen.genres)) {
    errors.push("artikelPayload.listen.genres ist keine Liste");
    return { ok: false, payload: null };
  }

  if (!Array.isArray(listen.tags)) {
    errors.push("artikelPayload.listen.tags ist keine Liste");
    return { ok: false, payload: null };
  }

  const listenErgebnis = validiereArtikelListen(listen.genres, listen.tags);
  if (!listenErgebnis.ok) {
    errors.push(listenErgebnis.fehler);
    return { ok: false, payload: null };
  }

  return {
    ok: true,
    payload: {
      artikel: {
        id: artikel.id,
        titel: artikel.titel,
        text: artikel.text,
      },
      listen: listenErgebnis.listen,
    },
  };
};

const validiereListeWerte = (werte) => {
  const valid = [];
  const exact = new Set();
  const norm = new Set();

  if (werte.length > BLOG_PROFILE_LIST_MAX_EINZEL) {
    return { ok: false, fehler: "liste zu lang" };
  }

  for (const wert of werte) {
    if (!istText(wert)) {
      return { ok: false, fehler: "liste enthält non-string" };
    }

    if (!istStringImByteBereich(wert, 1, BLOG_PROFILE_LIST_MAX_BYTES, true)) {
      return { ok: false, fehler: "liste-Eintrag hat falsche Byte-Länge" };
    }

    const normiert = normalisiereIdentitaet(wert);
    if (exact.has(wert)) {
      return { ok: false, fehler: "liste enthält exakte Dublette" };
    }

    if (norm.has(normiert)) {
      return { ok: false, fehler: "liste enthält normalisierte Dublette" };
    }

    exact.add(wert);
    norm.add(normiert);
    valid.push(wert);
  }

  return { ok: true, liste: valid };
};

const validiereArtikelListen = (genres, tags) => {
  const genresPruefung = validiereListeWerte(genres);
  if (!genresPruefung.ok) return { ok: false, fehler: `genres: ${genresPruefung.fehler}` };

  if (genresPruefung.liste.length === 0) return { ok: false, fehler: "genres darf nicht leer sein" };

  const tagsPruefung = validiereListeWerte(tags);
  if (!tagsPruefung.ok) return { ok: false, fehler: `tags: ${tagsPruefung.fehler}` };

  if (genresPruefung.liste.length + tagsPruefung.liste.length > BLOG_PROFILE_LIST_MAX_ZUSAMMEN) {
    return { ok: false, fehler: "listen zu lang" };
  }

  const exact = new Set();
  const norm = new Set();
  for (const wert of [...genresPruefung.liste, ...tagsPruefung.liste]) {
    if (exact.has(wert)) return { ok: false, fehler: "doppelte Werte über beide Listen" };
    exact.add(wert);

    const normiert = normalisiereIdentitaet(wert);
    if (norm.has(normiert)) return { ok: false, fehler: "normalisierte Dublette über beide Listen" };
    norm.add(normiert);
  }

  return {
    ok: true,
    listen: {
      genres: genresPruefung.liste,
      tags: tagsPruefung.liste,
    },
  };
};

export function waehleBlogProfilArtikel({ artikel = [], artikelId, listen }) {
  if (!Array.isArray(artikel)) return fehlschlag("artikel ist keine Liste");
  if (typeof artikelId !== "string" || !BLOG_PROFILE_ID.test(artikelId)) return fehlschlag("artikelId ungültig");

  const treffer = artikel.filter((a) => istObjekt(a) && typeof a.id === "string" && a.id === artikelId);
  if (treffer.length !== 1) return fehlschlag("artikelId führt nicht zu exakt einem Treffer");

  const artikelObjekt = treffer[0];

  if (Object.prototype.hasOwnProperty.call(artikelObjekt, "herkunft") && typeof artikelObjekt.herkunft !== "string") {
    return fehlschlag("herkunft ist formfremd");
  }

  if (artikelObjekt.herkunft === "gezogen") {
    return fehlschlag("artikel ist nicht eigen");
  }

  if (!istObjekt(listen)) return fehlschlag("listen sind nicht vorhanden");

  const fehler = [];
  const validiert = valideEinzelnachweis({
    artikel: {
      id: artikelObjekt.id,
      titel: artikelObjekt.titel,
      text: artikelObjekt.text,
    },
    listen,
  }, fehler);

  if (!validiert.ok) return fehlschlag(fehler.length > 0 ? fehler.join(" | ") : "liste ungültig");

  return erfolg(validiert.payload);
}

const istBeleg = (beleg, artikelText) => {
  if (!istStringImByteBereich(beleg, BLOG_PROFILE_BELG_MIN_BYTES, BLOG_PROFILE_BELG_MAX_BYTES, true)) return false;
  return typeof artikelText === "string" && artikelText.includes(beleg);
};

const validateGeschmackszuegeItem = (item, erlaubteGenres, alleFehler, artikelText) => {
  const itemKeys = ["art", "wert", "richtung", "staerke", "sicherheit", "beleg"];
  if (!exaktSchluessel(item, itemKeys)) {
    alleFehler.push("geschmackszuege-item hat falsche Schlüssel");
    return;
  }

  if (!BLOG_PROFILE_ARTEN.includes(item.art)) alleFehler.push("geschmackszueg.art ungültig");
  if (!istStringImByteBereich(item.wert, 1, BLOG_PROFILE_WERT_MAX_BYTES, true)) alleFehler.push("geschmackszueg.wert byte ungültig");
  if (item.art === "genre" && !erlaubteGenres.includes(item.wert)) alleFehler.push("genre-Wert nicht erlaubt");
  if (!BLOG_PROFILE_RICHTUNGEN.includes(item.richtung)) alleFehler.push("geschmackszueg.richtung ungültig");
  if (!istGanzzahl(item.staerke) || item.staerke < 1 || item.staerke > 5) alleFehler.push("geschmackszueg.staerke ungültig");
  if (!BLOG_PROFILE_SICHERHEITEN.includes(item.sicherheit)) alleFehler.push("geschmackszueg.sicherheit ungültig");
  if (!istBeleg(item.beleg, artikelText)) alleFehler.push("geschmackszueg.beleg ungültig");
};

const normalizeZuordnung = (werte) => {
  const exact = new Set();
  const norm = new Set();
  const ergebnis = [];

  for (const wert of werte) {
    if (!istText(wert)) return { ok: false, fehler: "zuordnung enthält non-string" };
    if (!istStringImByteBereich(wert, 1, BLOG_PROFILE_LIST_MAX_BYTES, true)) return { ok: false, fehler: "zuordnung enthält invaliden string" };

    if (exact.has(wert)) return { ok: false, fehler: "zuordnung enthält exakte Dublette" };
    exact.add(wert);

    const normiert = normalisiereIdentitaet(wert);
    if (norm.has(normiert)) return { ok: false, fehler: "zuordnung enthält normalisierte Dublette" };
    norm.add(normiert);
    ergebnis.push(wert);
  }

  return { ok: true, liste: ergebnis, norm: [...norm].sort() };
};

const validateZuordnungsMenge = (item, erlaubteGenres, erlaubteTags, alleFehler, artikelText) => {
  const itemKeys = ["wort", "beschreibung", "genres", "tags", "beleg"];
  if (!exaktSchluessel(item, itemKeys)) {
    alleFehler.push("vokabular-item hat falsche Schlüssel");
    return;
  }

  if (!istStringImByteBereich(item.wort, 1, BLOG_PROFILE_WORT_MAX_BYTES, true)) alleFehler.push("vokabular.wort byte ungültig");
  if (!isStringImBeschreibung(item.beschreibung)) {
    alleFehler.push("vokabular.beschreibung byte ungültig");
    return;
  }

  if (!Array.isArray(item.genres)) alleFehler.push("vokabular.genres ist keine Liste");
  if (!Array.isArray(item.tags)) alleFehler.push("vokabular.tags ist keine Liste");

  if (alleFehler.length > 0) return;

  for (const wert of item.genres || []) {
    if (!erlaubteGenres.includes(wert)) alleFehler.push("vokabular.genres enthält unbekanntes Genre");
  }

  for (const wert of item.tags || []) {
    if (!erlaubteTags.includes(wert)) alleFehler.push("vokabular.tags enthält unbekanntes Tag");
  }

  const zuordnungGenres = normalizeZuordnung(item.genres || []);
  if (!zuordnungGenres.ok) alleFehler.push(`vokabular.genres ${zuordnungGenres.fehler}`);

  const zuordnungTags = normalizeZuordnung(item.tags || []);
  if (!zuordnungTags.ok) alleFehler.push(`vokabular.tags ${zuordnungTags.fehler}`);

  const gesamtliste = [...item.genres, ...item.tags];
  if (gesamtliste.length < 1 || gesamtliste.length > 3) alleFehler.push("vokabular-Zuordnung muss 1..3 sein");

  const normGesamt = new Set([...zuordnungGenres.norm || [], ...zuordnungTags.norm || []]);
  if (normGesamt.size !== gesamtliste.length) {
    alleFehler.push("vokabular-Zuordnung enthält normalisierte Dublette über beide Listen");
  }

  if (!istBeleg(item.beleg, artikelText)) alleFehler.push("vokabular.beleg ungültig");
};

const isStringImBeschreibung = (wert) => {
  return istStringImByteBereich(wert, 1, BLOG_PROFILE_BELG_MAX_BYTES, true);
};

export function pruefeBlogProfilAnalyseAntwort(antwort, articlePayload) {
  const fehler = [];
  const artikelPayloadResult = pruefeArtikelPayload(articlePayload);
  if (!artikelPayloadResult.ok) {
    return fehlschlag(`artikelPayload ungültig: ${artikelPayloadResult.fehler.join(" | ")}`);
  }

  const payload = artikelPayloadResult.payload;

  if (!exaktSchluessel(antwort, ["geschmackszuege", "vokabular"])) {
    return fehlschlag("antwort hat nicht exakt geschmackszuege/vokabular");
  }

  const erlaubteGenres = [...payload.listen.genres];
  const erlaubteTags = [...payload.listen.tags];
  const artikelText = payload.artikel.text;

  if (!Array.isArray(antwort.geschmackszuege)) return fehlschlag("geschmackszuege ist keine Liste");
  if (!Array.isArray(antwort.vokabular)) return fehlschlag("vokabular ist keine Liste");
  if (antwort.geschmackszuege.length > BLOG_PROFILE_MAX_GESCHMAKSE) fehler.push("zu viele geschmackszuege");
  if (antwort.vokabular.length > BLOG_PROFILE_MAX_VOKABULAR) fehler.push("zu viele vokabular");

  antwort.geschmackszuege.forEach((item) => validateGeschmackszuegeItem(item, erlaubteGenres, fehler, artikelText));
  antwort.vokabular.forEach((item) => validateZuordnungsMenge(item, erlaubteGenres, erlaubteTags, fehler, artikelText));

  if (fehler.length > 0) return fehlschlag(fehler.join(" | "));
  return erfolg({
    geschmackszuege: antwort.geschmackszuege.map((item) => ({ ...item })),
    vokabular: antwort.vokabular.map((item) => ({ ...item })),
  });
}

const pruefeArtikelPayload = (articlePayload) => {
  if (!exaktSchluessel(articlePayload, BLOG_PROFILE_ARTICLE_KEYS)) {
    return fehlschlag("articlePayload hat nicht exakt artikel/listen");
  }

  const fehler = [];
  const validiert = valideEinzelnachweis(articlePayload, fehler);
  if (!validiert.ok) return fehlschlag(fehler.join(" | "));

  return erfolg(validiert.payload);
};

const sha256Hex = async (text) => {
  if (typeof globalThis?.crypto?.subtle?.digest !== "function") {
    throw new Error("kein crypto.subtle.digest verfügbar");
  }

  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const bytes = new Uint8Array(hashBuffer);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const berechneContentHash = async (artikelPayload, digest) => {
  const hash = await digest(`${artikelPayload.artikel.titel}\u0000${artikelPayload.artikel.text}`);
  if (
    typeof hash !== "string"
    || !BLOG_PROFILE_HASH_RE.test(hash)
    || BLOG_PROFILE_HASH_NOT_ZERO_RE.test(hash)
  ) return null;
  return hash;
};

const statusFuerProfilItem = (item, existingSetsByKey) => {
  const art = item.art;
  const wert = normalisiereIdentitaet(item.wert);
  const richtung = item.richtung;
  const key = `${art}|${wert}`;
  const bekannteRichtungen = existingSetsByKey.get(key) || new Set();

  if (bekannteRichtungen.has(richtung)) {
    return { status: "bereits_vorhanden", editierbar: true };
  }

  if (bekannteRichtungen.size > 0) {
    return { status: "konflikt", editierbar: true };
  }

  return { status: "neu", editierbar: true };
};

const sameSet = (a, b) => {
  if (a.length !== b.length) return false;
  const normA = [...a].sort();
  const normB = [...b].sort();
  return normA.every((value, idx) => value === normB[idx]);
};

const normalizeZuordnungsSet = (werte) => {
  const norm = (werte || [])
    .filter((wert) => istText(wert))
    .map((wert) => normalisiereIdentitaet(wert))
    .filter((wert) => wert.length > 0)
    .sort();

  return [...new Set(norm)];
};

const statusFuerVokabularItem = (item, existingMap) => {
  const wort = normalisiereIdentitaet(item.wort);
  const itemGenres = normalizeZuordnungsSet(item.genres || []);
  const itemTags = normalizeZuordnungsSet(item.tags || []);
  const eintraege = existingMap.get(wort);

  if (!eintraege || eintraege.length === 0) {
    return { status: "neu", editierbar: true };
  }

  const identisch = eintraege.some((eintrag) => sameSet(eintrag.genres, itemGenres) && sameSet(eintrag.tags, itemTags));
  if (identisch) return { status: "bereits_vorhanden", editierbar: true };
  return { status: "konflikt", editierbar: true };
};

export const ermittleVokabularStatus = (item, bestehendesVokabular = []) => statusFuerVokabularItem(
  item,
  buildExistingVokabularMap(bestehendesVokabular),
);

const buildExistingSignalMap = (bestehendesProfil = {}) => {
  const signale = Array.isArray(bestehendesProfil.signale) ? bestehendesProfil.signale : [];
  const offen = Array.isArray(bestehendesProfil.offen) ? bestehendesProfil.offen : [];
  const profilSignalQuelle = [...signale, ...offen];
  if (signale.length === 0 && offen.length === 0 && Array.isArray(bestehendesProfil.geschmackszuege)) {
    profilSignalQuelle.push(...bestehendesProfil.geschmackszuege);
  }

  const map = new Map();
  for (const signal of (profilSignalQuelle || [])) {
    if (!istObjekt(signal)) continue;
    if (!BLOG_PROFILE_ARTEN.includes(signal.art)) continue;
    if (!istText(signal.wert)) continue;
    if (!BLOG_PROFILE_RICHTUNGEN.includes(signal.richtung)) continue;

    const key = `${signal.art}|${normalisiereIdentitaet(signal.wert)}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(signal.richtung);
  }
  return map;
};

const buildExistingVokabularMap = (bestehendesVokabular = []) => {
  const map = new Map();
  for (const eintrag of (bestehendesVokabular || [])) {
    if (!istObjekt(eintrag)) continue;
    if (!istText(eintrag.wort)) continue;

    const wort = normalisiereIdentitaet(eintrag.wort);
    const genres = normalizeZuordnungsSet(eintrag.genres || []);
    const tags = normalizeZuordnungsSet(eintrag.tags || []);

    if (!map.has(wort)) map.set(wort, []);
    map.get(wort).push({ genres, tags });
  }
  return map;
};

const storageKey = (accountId) => `${BLOG_PROFILE_STORAGE_KEY}:${accountId}`;

const validierePreserveMetadata = (modelAntwort, articlePayload) => {
  if (!exaktSchluessel(modelAntwort, ["articleId", "contentHash", "analyzedAt", "promptVersion", "quelle"])) {
    return null;
  }
  if (typeof modelAntwort.articleId !== "string" || !BLOG_PROFILE_ID.test(modelAntwort.articleId)) {
    return null;
  }
  if (modelAntwort.articleId !== articlePayload.artikel.id) {
    return null;
  }
  if (typeof modelAntwort.contentHash !== "string"
    || !BLOG_PROFILE_HASH_RE.test(modelAntwort.contentHash)
    || BLOG_PROFILE_HASH_NOT_ZERO_RE.test(modelAntwort.contentHash)) {
    return null;
  }
  if (typeof modelAntwort.analyzedAt !== "string" || !isCanonicalIsoDate(modelAntwort.analyzedAt)) {
    return null;
  }
  if (modelAntwort.promptVersion !== BLOG_PROFILE_ANALYSE_PROMPT_VERSION) {
    return null;
  }
  if (modelAntwort.quelle !== BLOG_PROFILE_ANALYSE_SOURCE) {
    return null;
  }

  return {
    articleId: modelAntwort.articleId,
    contentHash: modelAntwort.contentHash,
    analyzedAt: modelAntwort.analyzedAt,
    promptVersion: modelAntwort.promptVersion,
    quelle: modelAntwort.quelle,
  };
};

const validiereNachweisMarker = (raw) => {
  if (!exaktSchluessel(raw, ["articleId", "contentHash", "analyzedAt"])) return null;
  if (typeof raw.articleId !== "string" || typeof raw.contentHash !== "string") return null;
  if (!BLOG_PROFILE_ID.test(raw.articleId)) return null;
  if (!BLOG_PROFILE_HASH_RE.test(raw.contentHash) || BLOG_PROFILE_HASH_NOT_ZERO_RE.test(raw.contentHash)) return null;
  if (!isCanonicalIsoDate(raw.analyzedAt)) return null;
  return {
    articleId: raw.articleId,
    contentHash: raw.contentHash,
    analyzedAt: raw.analyzedAt,
  };
};

const accountIdIstGueltig = (accountId) => istText(accountId) && SUPABASE_UUID_RE.test(accountId);

export function liesBlogProfilAnalyseNachweis(storage, accountId) {
  if (!accountIdIstGueltig(accountId)) return null;
  if (!storage || typeof storage.getItem !== "function") return null;

  try {
    const raw = storage.getItem(storageKey(accountId));
    if (typeof raw !== "string") return null;
    return validiereNachweisMarker(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function speichereBlogProfilAnalyseNachweis(storage, accountId, marker) {
  if (!accountIdIstGueltig(accountId)) return false;
  if (!storage || typeof storage.setItem !== "function") return false;

  const valid = validiereNachweisMarker(marker);
  if (!valid) return false;

  try {
    storage.setItem(storageKey(accountId), JSON.stringify(valid));
    return true;
  } catch {
    return false;
  }
}

export async function isArtikelUnveraendert(storage, accountId, artikelPayload, options = {}) {
  const validiert = pruefeArtikelPayload(artikelPayload);
  if (!validiert.ok) return false;
  if (!accountIdIstGueltig(accountId)) return false;

  const contentHashUebergeben = Object.prototype.hasOwnProperty.call(options, "contentHash");
  if (contentHashUebergeben && (
    typeof options.contentHash !== "string"
    || !BLOG_PROFILE_HASH_RE.test(options.contentHash)
    || BLOG_PROFILE_HASH_NOT_ZERO_RE.test(options.contentHash)
  )) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(options, "digest") && typeof options.digest !== "function") return false;
  const digest = options.digest || sha256Hex;

  let hash;
  try {
    hash = await berechneContentHash(validiert.payload, digest);
  } catch {
    return false;
  }
  if (!BLOG_PROFILE_HASH_RE.test(hash || "")) return false;
  if (contentHashUebergeben && hash !== options.contentHash) return false;

  const nachweis = liesBlogProfilAnalyseNachweis(storage, accountId);
  if (!nachweis) return false;

  return nachweis.articleId === validiert.payload.artikel.id
    && nachweis.contentHash === hash
    && (!contentHashUebergeben || nachweis.contentHash === options.contentHash);
}

const bereinigeVorschauAntwort = (modelAntwort) => {
  const bereinigt = {
    geschmackszuege: [],
    vokabular: [],
  };

  if (Array.isArray(modelAntwort?.geschmackszuege)) {
    bereinigt.geschmackszuege = modelAntwort.geschmackszuege.map((item) => {
      if (!istObjekt(item)) return item;
      const { status: _status, editierbar: _editierbar, ...rest } = item;
      return rest;
    });
  }

  if (Array.isArray(modelAntwort?.vokabular)) {
    bereinigt.vokabular = modelAntwort.vokabular.map((item) => {
      if (!istObjekt(item)) return item;
      const { status: _status, editierbar: _editierbar, ...rest } = item;
      return rest;
    });
  }

  return bereinigt;
};

const extrahierePreserveMeta = (modelAntwort, articlePayload) => {
  if (!istObjekt(modelAntwort)) return null;

  const meta = {
    articleId: modelAntwort.articleId,
    contentHash: modelAntwort.contentHash,
    analyzedAt: modelAntwort.analyzedAt,
    promptVersion: modelAntwort.promptVersion,
    quelle: modelAntwort.quelle,
  };

  return validierePreserveMetadata(meta, articlePayload);
};

export async function erzeugeBlogProfilAnalyseVorschau({
  artikelPayload,
  modelAntwort,
  bestehendesProfil = {},
  bestehendesVokabular = [],
  storage,
  accountId,
  digest = sha256Hex,
  clock = () => new Date().toISOString(),
  preserveMetadata = null,
}) {
  const artikelPayloadResult = pruefeArtikelPayload(artikelPayload);
  if (!artikelPayloadResult.ok) return artikelPayloadResult;

  const payload = artikelPayloadResult.payload;

  const validation = pruefeBlogProfilAnalyseAntwort(modelAntwort, payload);
  if (!validation.ok) return validation;

  if (preserveMetadata) {
    const validMeta = validierePreserveMetadata(preserveMetadata, payload);
    if (!validMeta) {
      return fehlschlag("preserveMetadata ist ungültig");
    }
    preserveMetadata = validMeta;
  }

  let contentHash = null;
  let analyzedAt = null;

  if (preserveMetadata) {
    contentHash = preserveMetadata.contentHash || null;
    analyzedAt = preserveMetadata.analyzedAt || null;
    if (!BLOG_PROFILE_HASH_RE.test(contentHash || "") || BLOG_PROFILE_HASH_NOT_ZERO_RE.test(contentHash || "")) {
      return fehlschlag("contentHash ist ungültig");
    }
    if (!isCanonicalIsoDate(analyzedAt)) {
      return fehlschlag("analyzedAt ist ungültig");
    }
    if (preserveMetadata.articleId !== payload.artikel.id) {
      return fehlschlag("articleId passt nicht zum artikelPayload");
    }

    let frischerContentHash = null;
    try {
      frischerContentHash = await berechneContentHash(payload, digest);
    } catch {
      return fehlschlag("hash nicht berechenbar");
    }
    if (frischerContentHash !== contentHash) {
      return fehlschlag("contentHash passt nicht zum aktuellen artikelPayload");
    }
  } else {
    try {
      contentHash = await berechneContentHash(payload, digest);
    } catch {
      return fehlschlag("hash nicht berechenbar");
    }

    if (!BLOG_PROFILE_HASH_RE.test(contentHash || "")) {
      return fehlschlag("hash nicht berechenbar");
    }

    try {
      analyzedAt = clock();
    } catch {
      return fehlschlag("analyzedAt nicht berechenbar");
    }

    if (!isCanonicalIsoDate(analyzedAt)) {
      return fehlschlag("analyzedAt ist ungültig");
    }
  }

  const signalMap = buildExistingSignalMap(bestehendesProfil);
  const vokabularMap = buildExistingVokabularMap(
    Array.isArray(bestehendesVokabular) ? bestehendesVokabular : bestehendesProfil.vokabular,
  );

  const geschmackszuege = validation.payload.geschmackszuege.map((item) => {
    const statusInfo = statusFuerProfilItem(item, signalMap);
    return { ...item, ...statusInfo };
  });

  const vokabular = validation.payload.vokabular.map((item) => {
    const statusInfo = statusFuerVokabularItem(item, vokabularMap);
    return { ...item, ...statusInfo };
  });

  const kandidaten = [...geschmackszuege, ...vokabular];
  const hatKonflikt = kandidaten.some((item) => item.status === "konflikt");
  const hatBestehend = kandidaten.length > 0 && kandidaten.every((item) => item.status === "bereits_vorhanden");
  const status = hatKonflikt
    ? "konflikt"
    : hatBestehend
      ? "bereits_vorhanden"
      : "editierbar";

  const unveraendert = await isArtikelUnveraendert(storage, accountId, payload, {
    digest,
    contentHash,
  });

  return erfolg({
    quelle: preserveMetadata ? preserveMetadata.quelle : BLOG_PROFILE_ANALYSE_SOURCE,
    promptVersion: preserveMetadata ? preserveMetadata.promptVersion : BLOG_PROFILE_ANALYSE_PROMPT_VERSION,
    articleId: payload.artikel.id,
    contentHash,
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
  bestehendesVokabular,
  storage,
  accountId,
  digest,
  clock,
}) {
  const artikelPayloadResult = pruefeArtikelPayload(artikelPayload);
  if (!artikelPayloadResult.ok) return artikelPayloadResult;

  const payload = artikelPayloadResult.payload;
  const bereinigt = bereinigeVorschauAntwort(modelAntwort);
  const preserveMetadata = extrahierePreserveMeta(modelAntwort, payload);
  if (!preserveMetadata) return fehlschlag("metadaten fehlen");

  return erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: payload,
    modelAntwort: bereinigt,
    bestehendesProfil,
    bestehendesVokabular,
    storage,
    accountId,
    digest,
    clock,
    preserveMetadata,
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
  if (!istText(healthAntwort.vorgangId) || healthAntwort.vorgangId.trim().length === 0) return false;
  if (!istText(healthAntwort.phase) || healthAntwort.phase.trim().length === 0) return false;
  if (!istText(healthAntwort.buildVersion)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{6,63}$/.test(healthAntwort.buildVersion)
    || healthAntwort.buildVersion === "unversioned") return false;
  if (healthAntwort.anbieterSecretGesetzt !== true) return false;
  if (!isCanonicalIsoDate(healthAntwort.zeit)) return false;
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

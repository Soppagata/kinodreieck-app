/* Etappe 8, Phase 2b — Bloganalyse-Kernlogik.

   Reine, UI-freie Funktionen plus fail-closed Regressionstests.
*/

import {
  hatBlogProfileAnalyseCapability,
  waehleBlogProfilArtikel,
  pruefeBlogProfilAnalyseAntwort,
  erzeugeBlogProfilAnalyseVorschau,
  revalidiereBlogProfilAnalyseVorschau,
  liesBlogProfilAnalyseNachweis,
  speichereBlogProfilAnalyseNachweis,
  isArtikelUnveraendert,
  BLOG_PROFILE_ARTEN_SET,
  BLOG_PROFILE_RICHTUNG_SET,
  BLOG_PROFILE_SICHERHEIT_SET,
} from "./src/lib/blogProfilAnalyse.js";

const ok = [];
const rot = [];

const check = (name, wert) => {
  if (wert) {
    ok.push(name);
    console.log("✓", name);
    return;
  }
  rot.push(name);
  console.log("✗", name);
};

const checkAsync = async (name, promise) => {
  try {
    return check(name, await promise);
  } catch (error) {
    rot.push(name);
    console.log("✗", name, "-", error.message || String(error));
  }
};

const BASE_ARTICLE = {
  id: "artikel_001",
  herkunft: "eigene_quelle",
  titel: "Musterbeispiel ohne Nebenregeln",
  text: "Diese Rezension enthält einen brauchbaren Beleg. Der Satz enthält eine klare Struktur. Ein weiterer Satz für sauberen Nachweis.",
  genres: ["Drama", "Noir", "Action", "Klassiker", "Nocturne"],
  tags: ["einprägsam", "kristallklar"],
  status: "ok",
};

const makeArticle = (overrides = {}) => {
  const basis = structuredClone(BASE_ARTICLE);
  return { ...basis, ...overrides };
};

const makeStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: (key) => {
      const wert = map.get(key);
      return wert === undefined ? null : wert;
    },
    setItem: (key, wert) => {
      map.set(key, String(wert));
    },
  };
};

const validModelResponse = (articlePayload) => ({
  geschmackszuege: [
    {
      art: BLOG_PROFILE_ARTEN_SET[0],
      wert: articlePayload.listen.genres[0],
      richtung: BLOG_PROFILE_RICHTUNG_SET[0],
      staerke: 3,
      sicherheit: BLOG_PROFILE_SICHERHEIT_SET[0],
      beleg: "Diese Rezension enthält einen brauchbaren Beleg.",
    },
  ],
  vokabular: [
    {
      wort: "Tempo",
      beschreibung: "klarer Abschnitt mit Tempo",
      genres: [articlePayload.listen.genres[0]],
      tags: [articlePayload.listen.tags[0]],
      beleg: "Diese Rezension enthält einen brauchbaren Beleg.",
    },
  ],
});

// 1) Capability
const BASIS_HEALTH = {
  ok: true,
  task: "health",
  vorgangId: "00000000-0000-4000-8000-000000000001",
  phase: "etappe-5",
  contractVersion: "ai-task-v5",
  buildVersion: "unversioned",
  laufzeit: { deno: "2.0", region: "eu" },
  schluesselHerkunft: { oeffentlich: "pub", geheim: "sec" },
  anbieterSecretGesetzt: true,
  aufrufer: { rolle: "member", fachrolle: "owner", weg: "token", accountIdVorhanden: true },
  betrieb: { aiAktiv: true },
  zeit: "2026-08-17T06:00:00.000Z",
  capabilities: {
    blogProfileExtract: {
      ready: true,
      task: "blog-profile-extract",
      promptVersion: "blog-profile-v1",
      modelAlias: "klein",
      maxTokens: 2048,
      taskMaxReservationUsdCent: 5,
    },
  },
};

const mutiere = (mutator) => {
  const kopie = structuredClone(BASIS_HEALTH);
  mutator(kopie);
  return kopie;
};

check("gültige Health-Antwort wird akzeptiert", hatBlogProfileAnalyseCapability(BASIS_HEALTH));
check("contractVersion fehlt wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { delete h.contractVersion; })));
check("ok != true wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.ok = false; })));
check("task != health wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.task = "other"; })));
check("betrieb.aiAktiv != true wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.betrieb.aiAktiv = false; })));
check("Zusatzfeld in capabilities wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.capabilities.extra = { a: 1 }; })));

// 2) Auswahl + Payload
const payloadResult = waehleBlogProfilArtikel({ artikel: [BASE_ARTICLE], artikelId: BASE_ARTICLE.id });
check("gültiges eigenes Artikel-Payload", payloadResult.ok);
check("Payload hat exakt artikelfokussierte Felder", payloadResult.ok
  && payloadResult.payload.artikel.id === BASE_ARTICLE.id
  && payloadResult.payload.artikel.titel === BASE_ARTICLE.titel
  && payloadResult.payload.artikel.text === BASE_ARTICLE.text
  && Array.isArray(payloadResult.payload.listen.genres)
  && Array.isArray(payloadResult.payload.listen.tags));
check("ID-Match muss exakt einen Treffer haben", !waehleBlogProfilArtikel({
  artikel: [makeArticle(), makeArticle({ id: "duplikat", titel: "x" }), makeArticle({ id: "duplikat", titel: "y" })],
  artikelId: "duplikat",
}).ok);
check("fremde ID wird abgelehnt", !waehleBlogProfilArtikel({ artikel: [BASE_ARTICLE], artikelId: "fremd" }).ok);
check("finderGenreKey wird als fremd abgelehnt", !waehleBlogProfilArtikel({ artikel: [makeArticle({ finderGenreKey: "skip" })], artikelId: BASE_ARTICLE.id }).ok);
check("Titel mit 160+ Byte scheitert", !waehleBlogProfilArtikel({ artikel: [makeArticle({ id: "titel_zu_lang", titel: "ä".repeat(81) })], artikelId: "titel_zu_lang" }).ok);
check("Titel mit genau 160 Byte wird akzeptiert", waehleBlogProfilArtikel({ artikel: [makeArticle({ id: "titel_ok", titel: "ä".repeat(80) })], artikelId: "titel_ok" }).ok);
check("Text mit 18.000 Byte wird akzeptiert", waehleBlogProfilArtikel({ artikel: [makeArticle({ id: "text_ok", text: "a".repeat(18000), genres: ["Drama"] })], artikelId: "text_ok" }).ok);
check("Text mit 18.001 Byte wird abgelehnt", !waehleBlogProfilArtikel({ artikel: [makeArticle({ id: "text_zu_lang", text: "a".repeat(18001), genres: ["Drama"] })], artikelId: "text_zu_lang" }).ok);
check("genres darf nicht leer sein", !waehleBlogProfilArtikel({ artikel: [makeArticle({ id: "no_genres", genres: [], tags: [] })], artikelId: "no_genres" }).ok);
check("Maximal 80 Einträge je Liste", !waehleBlogProfilArtikel({ artikel: [makeArticle({ id: "genres_too_many", genres: Array.from({ length: 81 }, (_, i) => `g${i}`) })], artikelId: "genres_too_many" }).ok);
check("Maximal 120 Einträge gemeinsam", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "lists_too_many", genres: Array.from({ length: 80 }, (_, i) => `g${i}`), tags: Array.from({ length: 41 }, (_, i) => `t${i}`) })],
  artikelId: "lists_too_many",
}).ok);
check("Cross-List-Dublette (exakt) wird abgelehnt", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "dupe", genres: ["Noir"], tags: ["Noir"] })],
  artikelId: "dupe",
}).ok);
check("Cross-List-Dublette (normalisiert) wird abgelehnt", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "dupe_norm", genres: ["Noir Noir"], tags: ["  noir   noir  "] })],
  artikelId: "dupe_norm",
}).ok);

// 3) Whole-response
const responseBasePayload = payloadResult.ok ? payloadResult.payload : waehleBlogProfilArtikel({ artikel: [BASE_ARTICLE], artikelId: BASE_ARTICLE.id }).payload;
const validResponse = validModelResponse(responseBasePayload);
check("gültige Modellantwort wird akzeptiert", pruefeBlogProfilAnalyseAntwort(validResponse, responseBasePayload).ok);
check("root darf keine Zusatzfelder haben", !pruefeBlogProfilAnalyseAntwort({ ...validResponse, extra: true }, responseBasePayload).ok);

const maxSchmacks = Array.from({ length: 12 }, (_, i) => ({
  art: BLOG_PROFILE_ARTEN_SET[1],
  wert: `Wert-${i + 1}`,
  richtung: BLOG_PROFILE_RICHTUNG_SET[0],
  staerke: 3,
  sicherheit: BLOG_PROFILE_SICHERHEIT_SET[0],
  beleg: "Diese Rezension enthält einen brauchbaren Beleg.",
}));
const zuVieleSchmacks = [
  ...maxSchmacks,
  {
    ...validResponse.geschmackszuege[0],
    art: BLOG_PROFILE_ARTEN_SET[1],
    wert: "Noir",
    richtung: BLOG_PROFILE_RICHTUNG_SET[1],
    beleg: "Diese Rezension enthält einen brauchbaren Beleg.",
  },
];
check("12 geschmackszuege werden akzeptiert", pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  geschmackszuege: maxSchmacks,
}, responseBasePayload).ok);
check("13 geschmackszuege werden abgelehnt", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  geschmackszuege: zuVieleSchmacks,
}, responseBasePayload).ok);

const sechsVok = Array.from({ length: 6 }, (_, i) => ({
  wort: `Wort-${i}`,
  beschreibung: "passt exakt im Rahmen",
  genres: [responseBasePayload.listen.genres[0]],
  tags: [responseBasePayload.listen.tags[0]],
  beleg: "Diese Rezension enthält einen brauchbaren Beleg.",
}));
const siebenVok = Array.from({ length: 7 }, (_, i) => ({
  wort: `WortNeu-${i}`,
  beschreibung: "passt exakt im Rahmen",
  genres: [responseBasePayload.listen.genres[0]],
  tags: [responseBasePayload.listen.tags[0]],
  beleg: "Diese Rezension enthält einen brauchbaren Beleg.",
}));
check("6 vokabular-Einträge werden akzeptiert", pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  vokabular: sechsVok,
}, responseBasePayload).ok);
check("7 vokabular-Einträge werden abgelehnt", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  vokabular: siebenVok,
}, responseBasePayload).ok);

check("Beleg muss exakter Substring sein", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  geschmackszuege: [{ ...validResponse.geschmackszuege[0], beleg: "nicht im artikel" }],
}, responseBasePayload).ok);
check("Beleg darf keine Zeilenumbrüche haben", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  geschmackszuege: [{ ...validResponse.geschmackszuege[0], beleg: "ein\nbruch" }],
}, responseBasePayload).ok);
check("Vokabel-Beleg muss substring sein", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  vokabular: [{ ...validResponse.vokabular[0], beleg: "nicht im artikel" }],
}, responseBasePayload).ok);
check("vokabular hat zu viele Zuordnungen (3+1) → abgelehnt", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  vokabular: [{ ...validResponse.vokabular[0], genres: ["Drama", "Action", "Noir"], tags: ["einprägsam"] }],
}, responseBasePayload).ok);
check("genre-art darf nur übergebene Genres nutzen", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  geschmackszuege: [{ ...validResponse.geschmackszuege[0], wert: "NichtInList" }],
}, responseBasePayload).ok);

// 4) Vorschau + Revalidation
const existingProfile = {
  geschmackszuege: [
    {
      art: BLOG_PROFILE_ARTEN_SET[0],
      wert: responseBasePayload.listen.genres[0],
      richtung: BLOG_PROFILE_RICHTUNG_SET[0],
      staerke: 5,
      sicherheit: BLOG_PROFILE_SICHERHEIT_SET[1],
      beleg: "bestehender beleg",
    },
  ],
  vokabular: [
    {
      wort: "Tempo",
      beschreibung: "bereits vorhanden",
      genres: [responseBasePayload.listen.genres[0]],
      tags: [responseBasePayload.listen.tags[0]],
      beleg: "bestehender beleg",
    },
  ],
};

const konfliktResponse = validModelResponse(responseBasePayload);
konfliktResponse.geschmackszuege.push({
  ...validResponse.geschmackszuege[0],
  richtung: BLOG_PROFILE_RICHTUNG_SET[1],
});
konfliktResponse.vokabular.push({
  ...validResponse.vokabular[0],
  beschreibung: "abweichende Zuordnung",
  tags: [responseBasePayload.listen.tags[1]],
});

await checkAsync("Vorschau liefert Status und Provenienz-Kopf", (async () => {
  const preview = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: konfliktResponse,
    bestehendesProfil: existingProfile,
    digest: async () => "a".repeat(64),
    clock: () => "2026-08-17T08:00:00.000Z",
  });
  if (!preview.ok) return false;
  const firstSignal = preview.payload.geschmackszuege[0];
  const secondSignal = preview.payload.geschmackszuege[1];
  const firstWord = preview.payload.vokabular[0];
  const secondWord = preview.payload.vokabular[1];
  return preview.payload.quelle === "bloganalyse"
    && preview.payload.promptVersion === "blog-profile-v1"
    && preview.payload.contentHash === "a".repeat(64)
    && firstSignal.status === "bereits_vorhanden"
    && secondSignal.status === "konflikt"
    && firstWord.status === "bereits_vorhanden"
    && secondWord.status === "konflikt"
    && preview.payload.status === "konflikt"
    && firstSignal.editierbar === false
    && secondSignal.editierbar === true;
} )());

await checkAsync("Revalidation bewertet Edits erneut nach Vertrag", (async () => {
  const first = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: konfliktResponse,
    bestehendesProfil: existingProfile,
    digest: async () => "b".repeat(64),
    clock: () => "2026-08-17T08:00:00.000Z",
  });
  if (!first.ok) return false;

  const corrected = {
    ...konfliktResponse,
    geschmackszuege: [
      { ...konfliktResponse.geschmackszuege[0], richtung: BLOG_PROFILE_RICHTUNG_SET[0] },
      { ...konfliktResponse.geschmackszuege[1], richtung: BLOG_PROFILE_RICHTUNG_SET[0] },
    ],
    vokabular: [
      { ...konfliktResponse.vokabular[0], genres: [responseBasePayload.listen.genres[0]], tags: [responseBasePayload.listen.tags[0]] },
      {
        ...konfliktResponse.vokabular[1],
        genres: [responseBasePayload.listen.genres[0]],
        tags: [responseBasePayload.listen.tags[0]],
      },
  ],
};

  const second = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: corrected,
    bestehendesProfil: existingProfile,
    digest: async () => "b".repeat(64),
    clock: () => "2026-08-17T08:00:00.000Z",
  });
  if (!second.ok) return false;
  return second.payload.status === "bereits_vorhanden"
    && second.payload.geschmackszuege.every((item) => item.status === "bereits_vorhanden")
    && second.payload.vokabular.every((item) => item.status === "bereits_vorhanden");
} )());

// 5) Nachweis
await checkAsync("Marker ist account-namespaced und formfremd fail-closed", (async () => {
  const storageA = makeStorage();
  const storageB = makeStorage();
  const markerA = { articleId: responseBasePayload.artikel.id, contentHash: "c".repeat(64), analyzedAt: "2026-08-17T10:00:00.000Z" };
  const markerB = { articleId: "anders", contentHash: "d".repeat(64), analyzedAt: "2026-08-17T10:00:00.000Z" };

  if (!speichereBlogProfilAnalyseNachweis(storageA, "kontoA", markerA)) return false;
  if (!speichereBlogProfilAnalyseNachweis(storageB, "kontoB", markerB)) return false;

  const gelesenA = liesBlogProfilAnalyseNachweis(storageA, "kontoA");
  const gelesenB = liesBlogProfilAnalyseNachweis(storageB, "kontoB");
  const vermischt = liesBlogProfilAnalyseNachweis(storageA, "kontoB");

  if (!gelesenA || !gelesenB || vermischt) return false;
  return !("titel" in gelesenA) && !("text" in gelesenA) && !("beleg" in gelesenA);
} )());

await checkAsync("Korruptes Marker-JSON wird abgewiesen", (async () => {
  const storage = makeStorage();
  storage.setItem("kd:blog-profile-analyse:nachweis:v1:kontoCorrupt", "not-json");
  return liesBlogProfilAnalyseNachweis(storage, "kontoCorrupt") === null;
} )());

await checkAsync("Unveränderten Artikel per Marker erkennen", (async () => {
  const storage = makeStorage();
  const marker = { articleId: responseBasePayload.artikel.id, contentHash: "f".repeat(64), analyzedAt: "2026-08-17T10:00:00.000Z" };
  if (!speichereBlogProfilAnalyseNachweis(storage, "kontoA", marker)) return false;
  return isArtikelUnveraendert(storage, "kontoA", responseBasePayload, { digest: async () => "f".repeat(64) });
} )());

console.log("\\nErgebnis:", ok.length, "ok,", rot.length, "offen");
if (rot.length > 0) {
  console.error("Fehlgeschlagene Checks:", rot.join(" | "));
  process.exit(1);
}

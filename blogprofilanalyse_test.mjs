/* Etappe 8, Phase 2b — Bloganalyse-Kernlogik.

   Reine, UI-freie Funktionen plus fail-closed Regressionstests.
*/

import { createHash } from "node:crypto";

import {
  hatBlogProfileAnalyseCapability,
  waehleBlogProfilArtikel,
  pruefeBlogProfilAnalyseAntwort,
  erzeugeBlogProfilAnalyseVorschau,
  revalidiereBlogProfilAnalyseVorschau,
  liesBlogProfilAnalyseNachweis,
  speichereBlogProfilAnalyseNachweis,
  isArtikelUnveraendert,
  ermittleVokabularStatus,
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

const sha256Hex = async (text) => createHash("sha256").update(text).digest("hex");
const contentHashFuer = (payload) => createHash("sha256")
  .update(`${payload.artikel.titel}\u0000${payload.artikel.text}`)
  .digest("hex");

const BASE_LISTEN = {
  genres: ["Drama", "Noir", "Action", "Klassiker", "Nocturne"],
  tags: ["einprägsam", "kristallklar"],
};

const ACCOUNT_ID_VALID_1 = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID_VALID_2 = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID_VALID_3 = "33333333-3333-4333-8333-333333333333";

const BASE_ARTICLE = {
  id: "artikel_001",
  herkunft: "eigene_quelle",
  titel: "Musterbeispiel ohne Nebenregeln",
  text: "Diese Rezension enthält einen brauchbaren Beleg. Der Satz enthält eine klare Struktur. Ein weiterer Satz für sauberen Nachweis.",
  status: "ok",
};

const UNSICHTBARE_INHALTE = [
  ["U+200B", "\u200B"],
  ["U+200C", "\u200C"],
  ["U+200D", "\u200D"],
  ["U+00AD", "\u00AD"],
  ["U+FE0F", "\uFE0F"],
  ["U+2066", "\u2066"],
  ["U+202E", "\u202E"],
  ["Whitespace-Mix I", " \t\u200B\n "],
  ["Whitespace-Mix II", "\u00A0\u200C\u200D\uFE0F\u2066\u202E\u3000"],
];

const SICHTBARE_UNICODE_SEQUENZEN = [
  ["Emoji-ZWJ", "👩‍👩‍👧‍👦"],
  ["Variation-Selector", "✈️"],
  ["Keycap", "1️⃣"],
  ["Persisch mit ZWNJ", "می‌خواهم"],
];

const UNSICHTBARE_BELEGE = [
  ["sechs U+200B", "\u200B".repeat(6), 18],
  ["gemischte DICP", "\u200C\u200D\u00AD\uFE0F\u2066\u202E", 17],
];

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

const throwingStorage = {
  getItem: () => {
    throw new Error("get failed");
  },
  setItem: () => {
    throw new Error("set failed");
  },
};

const validModelResponse = (listen) => ({
  geschmackszuege: [
    {
      art: BLOG_PROFILE_ARTEN_SET[0],
      wert: listen.genres[0],
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
      genres: [listen.genres[0]],
      tags: [listen.tags[0]],
      beleg: "Diese Rezension enthält einen brauchbaren Beleg.",
    },
  ],
});

const validHealth = {
  ok: true,
  task: "health",
  vorgangId: "00000000-0000-4000-8000-000000000001",
  phase: "etappe-5",
  contractVersion: "ai-task-v5",
  buildVersion: "abcdef1",
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
  const kopie = structuredClone(validHealth);
  mutator(kopie);
  return kopie;
};

// 1) Capability
check("gültige Health-Antwort wird akzeptiert", hatBlogProfileAnalyseCapability(validHealth));
check("contractVersion fehlt wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { delete h.contractVersion; })));
check("ok != true wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.ok = false; })));
check("task != health wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.task = "other"; })));
check("betrieb.aiAktiv != true wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.betrieb.aiAktiv = false; })));
check("Zusatzfeld in capabilities wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.capabilities.extra = { a: 1 }; })));
check("vorgangId darf kein Leerwert sein", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.vorgangId = ""; })));
check("phase darf keine Leerzeichenfolge sein", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.phase = "   "; })));
check("buildVersion darf kein Leerwert sein", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.buildVersion = ""; })));
check("buildVersion unversioned wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.buildVersion = "unversioned"; })));
check("buildVersion mit formfremden Zeichen wird abgelehnt", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.buildVersion = "build version"; })));
check("fehlendes Anbieter-Secret sperrt die Capability", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.anbieterSecretGesetzt = false; })));
check("zeit muss kanonische ISO sein", !hatBlogProfileAnalyseCapability(mutiere((h) => { h.zeit = "2026-08-17T06:00:00Z"; })));

// 2) Auswahl + Payload
check("gültiges eigenes Artikel-Payload", waehleBlogProfilArtikel({
  artikel: [BASE_ARTICLE],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).ok);

const validSelection = waehleBlogProfilArtikel({
  artikel: [BASE_ARTICLE],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
});
check("Payload hat exakt artikelfokussierte Felder",
  validSelection.ok
    && validSelection.payload.artikel.id === BASE_ARTICLE.id
    && validSelection.payload.artikel.titel === BASE_ARTICLE.titel
    && validSelection.payload.artikel.text === BASE_ARTICLE.text
    && Array.isArray(validSelection.payload.listen.genres)
    && Array.isArray(validSelection.payload.listen.tags));

check("ID-Match muss exakt einen Treffer haben", !waehleBlogProfilArtikel({
  artikel: [makeArticle(), makeArticle({ id: "duplikat", titel: "x" }), makeArticle({ id: "duplikat", titel: "y" })],
  artikelId: "duplikat",
  listen: BASE_LISTEN,
}).ok);
check("fremde ID wird abgelehnt", !waehleBlogProfilArtikel({ artikel: [BASE_ARTICLE], artikelId: "fremd", listen: BASE_LISTEN }).ok);
check("fehlende herkunft wird akzeptiert", waehleBlogProfilArtikel({
  artikel: [(() => {
    const artikel = makeArticle();
    delete artikel.herkunft;
    return artikel;
  })()],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).ok);
check("formfremde Herkunft wird abgelehnt", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ herkunft: 12 })],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).ok);
check("gezogene Herkunft wird abgelehnt", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ herkunft: "gezogen" })],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).ok);
check("finderGenreKey wird nicht blockiert", waehleBlogProfilArtikel({
  artikel: [makeArticle({ finderGenreKey: "skip" })],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).ok);
check("Titel muss echter String sein", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ titel: undefined })],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).ok);
check("Titel darf keine Steuerzeichen enthalten", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ titel: "Muster\nZeile" })],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).ok);
check("Titel darf nach NFKC+trim nicht leer sein", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ titel: "   " })],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).ok);
check("Titel mit 160+ Byte scheitert", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "titel_zu_lang", titel: "ä".repeat(81) })],
  artikelId: "titel_zu_lang",
  listen: BASE_LISTEN,
}).ok);
check("Titel mit genau 160 Byte wird akzeptiert", waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "titel_ok", titel: "ä".repeat(80) })],
  artikelId: "titel_ok",
  listen: BASE_LISTEN,
}).ok);
check("Text mit 18.000 Byte wird akzeptiert", waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "text_ok", text: "a".repeat(18000) })],
  artikelId: "text_ok",
  listen: BASE_LISTEN,
}).ok);
check("Text mit 18.001 Byte wird abgelehnt", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "text_zu_lang", text: "a".repeat(18001) })],
  artikelId: "text_zu_lang",
  listen: BASE_LISTEN,
}).ok);
check("Text darf nach NFKC+trim nicht leer sein", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ text: "\u00a0\u00a0" })],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).ok);
check("genres darf nicht leer sein", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "no_genres", text: "abc" })],
  artikelId: "no_genres",
  listen: { ...BASE_LISTEN, genres: [] },
}).ok);
check("Maximal 80 Einträge je Liste", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "genres_too_many" })],
  artikelId: "genres_too_many",
  listen: { genres: Array.from({ length: 81 }, (_, i) => `g${i}`), tags: ["x"] },
}).ok);
check("Maximal 120 Einträge gemeinsam", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "lists_too_many" })],
  artikelId: "lists_too_many",
  listen: { genres: Array.from({ length: 80 }, (_, i) => `g${i}`), tags: Array.from({ length: 41 }, (_, i) => `t${i}`) },
}).ok);
check("Cross-List-Dublette (exakt) wird abgelehnt", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "dupe" })],
  artikelId: "dupe",
  listen: { genres: ["Noir"], tags: ["Noir"] },
}).ok);
check("Cross-List-Dublette (normalisiert) wird abgelehnt", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "dupe_norm" })],
  artikelId: "dupe_norm",
  listen: { genres: ["Noir Noir"], tags: ["  noir   noir  "] },
}).ok);
check("Listenwert darf nach NFKC+trim nicht leer sein", !waehleBlogProfilArtikel({
  artikel: [makeArticle({ id: "blank_list" })],
  artikelId: "blank_list",
  listen: { genres: ["\u00a0"], tags: [] },
}).ok);

for (const [name, wert] of UNSICHTBARE_INHALTE) {
  for (const [feld, artikelAenderung, listen] of [
    ["Titel", { titel: wert }, BASE_LISTEN],
    ["Artikeltext", { text: wert }, BASE_LISTEN],
    ["Listenwert", {}, { genres: [wert], tags: [] }],
  ]) {
    check(`${name} bleibt als ${feld} unsichtbar`, !waehleBlogProfilArtikel({
      artikel: [makeArticle(artikelAenderung)],
      artikelId: BASE_ARTICLE.id,
      listen,
    }).ok);
  }
}

for (const [name, wert] of SICHTBARE_UNICODE_SEQUENZEN) {
  const ergebnis = waehleBlogProfilArtikel({
    artikel: [makeArticle({ titel: wert, text: wert })],
    artikelId: BASE_ARTICLE.id,
    listen: { genres: [wert], tags: [] },
  });
  check(`${name} bleibt sichtbar und roh identisch`, ergebnis.ok
    && ergebnis.payload.artikel.titel === wert
    && ergebnis.payload.artikel.text === wert
    && ergebnis.payload.listen.genres[0] === wert);
}

// 3) Whole-response-Validator
const responseBasePayload = validSelection.ok ? validSelection.payload : waehleBlogProfilArtikel({
  artikel: [BASE_ARTICLE],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).payload;

const validResponse = validModelResponse(responseBasePayload.listen);
check("gültige Modellantwort wird akzeptiert", pruefeBlogProfilAnalyseAntwort(validResponse, responseBasePayload).ok);
for (const [name, beleg, bytes] of UNSICHTBARE_BELEGE) {
  const belegPayload = {
    ...responseBasePayload,
    artikel: {
      ...responseBasePayload.artikel,
      text: `Vorspann${beleg}Nachspann`,
    },
  };
  check(`${name} hat die belegte UTF-8-Bytelänge`, new TextEncoder().encode(beleg).length === bytes);
  check(`${name} wird trotz exaktem Rohsubstring als Beleg abgewiesen`, !pruefeBlogProfilAnalyseAntwort({
    geschmackszuege: [{ ...validResponse.geschmackszuege[0], beleg }],
    vokabular: [],
  }, belegPayload).ok);
}

for (const [name, wert] of UNSICHTBARE_INHALTE) {
  const outputFelder = [
    ["geschmackszueg.wert", {
      geschmackszuege: [{ ...validResponse.geschmackszuege[0], art: "ton", wert }],
      vokabular: [],
    }],
    ["vokabular.wort", {
      geschmackszuege: [],
      vokabular: [{ ...validResponse.vokabular[0], wort: wert }],
    }],
    ["vokabular.beschreibung", {
      geschmackszuege: [],
      vokabular: [{ ...validResponse.vokabular[0], beschreibung: wert }],
    }],
  ];
  for (const [feld, antwort] of outputFelder) {
    const ergebnis = pruefeBlogProfilAnalyseAntwort(antwort, responseBasePayload);
    check(`${name} verwirft die gesamte Antwort bei ${feld}`, !ergebnis.ok && ergebnis.payload === null);
  }
}

for (const [name, wert] of SICHTBARE_UNICODE_SEQUENZEN) {
  const ergebnis = pruefeBlogProfilAnalyseAntwort({
    geschmackszuege: [{ ...validResponse.geschmackszuege[0], art: "ton", wert }],
    vokabular: [{
      ...validResponse.vokabular[0],
      wort: wert,
      beschreibung: wert,
    }],
  }, responseBasePayload);
  check(`${name} bleibt in allen Outputfeldern roh identisch`, ergebnis.ok
    && ergebnis.payload.geschmackszuege[0].wert === wert
    && ergebnis.payload.vokabular[0].wort === wert
    && ergebnis.payload.vokabular[0].beschreibung === wert);
}
check("root darf keine Zusatzfelder haben", !pruefeBlogProfilAnalyseAntwort({ ...validResponse, extra: true }, responseBasePayload).ok);
check("artikelPayload mit Zusatzfeld wird abgelehnt", !pruefeBlogProfilAnalyseAntwort(validResponse, { ...responseBasePayload, extra: "x" }).ok);
check("artikelPayload ohne artikel wird abgelehnt", !pruefeBlogProfilAnalyseAntwort(validResponse, { listen: responseBasePayload.listen }).ok);

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
check("vokabular-Dupllette über beide Listen wird erkannt", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  vokabular: [{
    ...validResponse.vokabular[0],
    genres: ["Drama"],
    tags: [" drama "],
  }],
}, responseBasePayload).ok);
check("genre-art darf nur übergebene Genres nutzen", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  geschmackszuege: [{ ...validResponse.geschmackszuege[0], wert: "NichtInList" }],
}, responseBasePayload).ok);
check("geschmackszueg.wert darf nach NFKC+trim nicht leer sein", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  geschmackszuege: [{ ...validResponse.geschmackszuege[0], art: "thema", wert: "   " }],
}, responseBasePayload).ok);
check("vokabular.wort darf nach NFKC+trim nicht leer sein", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  vokabular: [{ ...validResponse.vokabular[0], wort: "\u00a0" }],
}, responseBasePayload).ok);
check("vokabular.beschreibung darf nach NFKC+trim nicht leer sein", !pruefeBlogProfilAnalyseAntwort({
  ...validResponse,
  vokabular: [{ ...validResponse.vokabular[0], beschreibung: "   " }],
}, responseBasePayload).ok);
check("16-Spaces-Beleg wird trotz Byte-Minimum und Substring abgelehnt", !pruefeBlogProfilAnalyseAntwort({
  geschmackszuege: [{ ...validResponse.geschmackszuege[0], beleg: " ".repeat(16) }],
  vokabular: [{ ...validResponse.vokabular[0], beleg: " ".repeat(16) }],
}, {
  ...responseBasePayload,
  artikel: {
    ...responseBasePayload.artikel,
    text: `Vorspann${" ".repeat(16)}Nachspann`,
  },
}).ok);

// 4) Vorschau + Revalidation
const existingProfile = {
  signale: [
    {
      art: BLOG_PROFILE_ARTEN_SET[0],
      wert: responseBasePayload.listen.genres[0],
      richtung: BLOG_PROFILE_RICHTUNG_SET[0],
      staerke: 5,
      sicherheit: BLOG_PROFILE_SICHERHEIT_SET[1],
      beleg: "bestehender beleg",
    },
  ],
};

const existingProfileMitOffenen = {
  offen: [
    {
      art: BLOG_PROFILE_ARTEN_SET[1],
      wert: responseBasePayload.listen.genres[1],
      richtung: BLOG_PROFILE_RICHTUNG_SET[1],
      staerke: 4,
      sicherheit: BLOG_PROFILE_SICHERHEIT_SET[2],
      beleg: "offener beleg",
    },
  ],
};

const existingVokabular = [
  {
    wort: "Tempo",
    beschreibung: "bestehende Zuordnung",
    genres: [responseBasePayload.listen.genres[0]],
    tags: [responseBasePayload.listen.tags[0]],
  },
];

const konfliktResponse = validModelResponse(responseBasePayload.listen);
konfliktResponse.geschmackszuege.push({
  ...validResponse.geschmackszuege[0],
  richtung: BLOG_PROFILE_RICHTUNG_SET[1],
});
konfliktResponse.vokabular.push({
  ...validResponse.vokabular[0],
  genres: [responseBasePayload.listen.genres[1]],
});

await checkAsync("Vorschau liefert Status und Provenienz-Kopf", (async () => {
  const preview = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: konfliktResponse,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
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
    && preview.payload.articleId === responseBasePayload.artikel.id
    && preview.payload.contentHash === "a".repeat(64)
    && preview.payload.status === "konflikt"
    && firstSignal.status === "bereits_vorhanden"
    && secondSignal.status === "konflikt"
    && firstSignal.editierbar === true
    && secondSignal.editierbar === true
    && firstWord.status === "bereits_vorhanden"
    && secondWord.status === "konflikt"
    && firstWord.editierbar === true
    && secondWord.editierbar === true;
})());

await checkAsync("Bereits vorhandene Kandidaten bleiben editierbar", (async () => {
  const bereitsVorhandenVorschau = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: validResponse,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => "c".repeat(64),
    clock: () => "2026-08-17T09:00:00.000Z",
  });

  if (!bereitsVorhandenVorschau.ok) return false;
  return bereitsVorhandenVorschau.payload.status === "bereits_vorhanden"
    && bereitsVorhandenVorschau.payload.geschmackszuege.every((item) => item.editierbar === true)
    && bereitsVorhandenVorschau.payload.vokabular.every((item) => item.editierbar === true);
})());

await checkAsync("Leere Antwort wird nicht als bereits_vorhanden klassifiziert", (async () => {
  const leer = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: { geschmackszuege: [], vokabular: [] },
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => "d".repeat(64),
    clock: () => "2026-08-17T09:30:00.000Z",
  });
  if (!leer.ok) return false;
  return leer.payload.status !== "bereits_vorhanden";
})());

await checkAsync("vorhandene offene Signale werden bei der Dedupe berücksichtigt", (async () => {
  const mitOffenenSignalen = {
    ...konfliktResponse,
    geschmackszuege: [
      {
        art: BLOG_PROFILE_ARTEN_SET[1],
        wert: responseBasePayload.listen.genres[1],
        richtung: BLOG_PROFILE_RICHTUNG_SET[0],
        staerke: 3,
        sicherheit: BLOG_PROFILE_SICHERHEIT_SET[0],
        beleg: "Diese Rezension enthält einen brauchbaren Beleg.",
      },
    ],
  };

  const preview = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: mitOffenenSignalen,
    bestehendesProfil: existingProfileMitOffenen,
    bestehendesVokabular: existingVokabular,
    digest: async () => "d".repeat(64),
    clock: () => "2026-08-17T09:45:00.000Z",
  });

  if (!preview.ok) return false;
  return preview.payload.geschmackszuege[0].status === "konflikt";
})());

await checkAsync("Vokabular-Mappings werden genres/tags getrennt verglichen", (async () => {
  const existing = [
    {
      wort: "Tempo",
      genres: ["Drama"],
      tags: ["einprägsam"],
    },
  ];

  const unchanged = ermittleVokabularStatus({
    wort: "Tempo",
    beschreibung: "bestehend",
    genres: ["Drama"],
    tags: ["einprägsam"],
    beleg: "bestehender beleg",
  }, existing);

  const moved = ermittleVokabularStatus({
    wort: "Tempo",
    beschreibung: "verschoben",
    genres: ["einprägsam"],
    tags: ["Drama"],
    beleg: "bestehender beleg",
  }, existing);

  return unchanged.status === "bereits_vorhanden" && moved.status === "konflikt";
})());

await checkAsync("Hash-Fallback mit 64 Nullen wird abgelehnt", (async () => {
  const invalid = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: validResponse,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => "0".repeat(64),
    clock: () => "2026-08-17T12:00:00.000Z",
  });

  return !invalid.ok;
}));

await checkAsync("Clock-Fehler wird nicht nach außen geworfen", (async () => {
  const invalid = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: validResponse,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => "b".repeat(64),
    clock: () => {
      throw new Error("clock-break");
    },
  });

  return !invalid.ok;
}));

await checkAsync("Revalidation verarbeitet editierte Vorschau mit frischem Hash und ohne neue Clock", (async () => {
  const first = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: konfliktResponse,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: sha256Hex,
    clock: () => "2026-08-17T11:00:00.000Z",
  });
  if (!first.ok) return false;

  const edited = {
    ...first.payload,
    geschmackszuege: first.payload.geschmackszuege.map((item) => {
      if (item.art === BLOG_PROFILE_ARTEN_SET[0] && item.wert === responseBasePayload.listen.genres[0]) {
        return { ...item, richtung: BLOG_PROFILE_RICHTUNG_SET[0] };
      }
      return item;
    }),
    vokabular: first.payload.vokabular.map((item) => ({
      ...item,
      genres: item.genres,
      tags: item.tags,
    })),
  };

  const second = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: edited,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: sha256Hex,
    clock: () => { throw new Error("should-not-run"); },
  });

  if (!second.ok) return false;
  return second.payload.articleId === first.payload.articleId
    && second.payload.contentHash === first.payload.contentHash
    && second.payload.analyzedAt === first.payload.analyzedAt
    && second.payload.quelle === first.payload.quelle
    && second.payload.promptVersion === first.payload.promptVersion;
})());

await checkAsync("Revalidation lehnt gleichen supplied Hash bei geändertem Titel ab", (async () => {
  const first = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: validResponse,
    digest: sha256Hex,
    clock: () => "2026-08-17T11:15:00.000Z",
  });
  if (!first.ok) return false;

  const geaendert = structuredClone(responseBasePayload);
  geaendert.artikel.titel = `${geaendert.artikel.titel} geändert`;
  const second = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: geaendert,
    modelAntwort: first.payload,
    digest: sha256Hex,
  });
  return !second.ok;
})());

await checkAsync("Revalidation lehnt gleichen supplied Hash bei geändertem Text ab", (async () => {
  const first = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: validResponse,
    digest: sha256Hex,
    clock: () => "2026-08-17T11:20:00.000Z",
  });
  if (!first.ok) return false;

  const geaendert = structuredClone(responseBasePayload);
  geaendert.artikel.text = `${geaendert.artikel.text} Inhaltliche Drift.`;
  const second = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: geaendert,
    modelAntwort: first.payload,
    digest: sha256Hex,
  });
  return !second.ok;
})());

await checkAsync("Revalidation lehnt Preserve ohne frischen Digest fail-closed ab", (async () => {
  const first = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: validResponse,
    digest: sha256Hex,
    clock: () => "2026-08-17T11:25:00.000Z",
  });
  if (!first.ok) return false;

  const second = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: first.payload,
    digest: async () => null,
  });
  return !second.ok;
})());

await checkAsync("erzeugeBlogProfilAnalyseVorschau lehnt direkte ungültige Preserve-Metadaten ab", (async () => (
  !(
    await erzeugeBlogProfilAnalyseVorschau({
      artikelPayload: responseBasePayload,
      modelAntwort: validResponse,
      bestehendesProfil: existingProfile,
      bestehendesVokabular: existingVokabular,
      preserveMetadata: {
        articleId: responseBasePayload.artikel.id,
        contentHash: "a".repeat(64),
        analyzedAt: "2026-08-17T14:00:00.000Z",
        promptVersion: "other",
        quelle: "bloganalyse",
      },
      digest: async () => "a".repeat(64),
      clock: () => "2026-08-17T14:00:00.000Z",
    })
  ).ok
))());

await checkAsync("Revalidation vergleicht gespeicherten contentHash mit frischem Hash ohne neue Clock", (async () => {
  const storage = makeStorage();
  const marker = {
    articleId: responseBasePayload.artikel.id,
    contentHash: contentHashFuer(responseBasePayload),
    analyzedAt: "2026-08-17T13:00:00.000Z",
  };
  if (!speichereBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_1, marker)) return false;

  let digestCalled = 0;
  let clockCalled = 0;

  const revalidated = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: {
      ...validResponse,
      articleId: responseBasePayload.artikel.id,
      contentHash: marker.contentHash,
      analyzedAt: marker.analyzedAt,
      quelle: "bloganalyse",
      promptVersion: "blog-profile-v1",
    },
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    storage,
    accountId: ACCOUNT_ID_VALID_1,
    digest: async () => {
      digestCalled += 1;
      return contentHashFuer(responseBasePayload);
    },
    clock: () => {
      clockCalled += 1;
      throw new Error("clock sollte nicht laufen");
    },
  });

  return revalidated.ok
    && revalidated.payload.unveraendert
    && digestCalled > 0
    && clockCalled === 0;
})());

await checkAsync("Revalidation lehnt fehlende/fehlangepasste Metadaten ab und berechnet keine neuen Hash/Clock", (async () => {
  const erste = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: validResponse,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => "a".repeat(64),
    clock: () => "2026-08-17T14:00:00.000Z",
  });
  if (!erste.ok) return false;

  let digestCalled = 0;
  let clockCalled = 0;

  const ohneMetadaten = { ...erste.payload };
  delete ohneMetadaten.articleId;
  const fehlend = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: ohneMetadaten,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => {
      digestCalled += 1;
      return "0".repeat(64);
    },
    clock: () => {
      clockCalled += 1;
      return "2026-08-17T15:00:00.000Z";
    },
  });

  const manipuliertQuelle = {
    ...erste.payload,
    quelle: "anderer-kontext",
  };
  const quelleFail = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: manipuliertQuelle,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => {
      digestCalled += 1;
      return "a".repeat(64);
    },
    clock: () => {
      clockCalled += 1;
      return "2026-08-17T15:00:00.000Z";
    },
  });

  const falschPrompt = {
    ...erste.payload,
    promptVersion: "other",
  };
  const promptFail = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: falschPrompt,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => {
      digestCalled += 1;
      return "a".repeat(64);
    },
    clock: () => {
      clockCalled += 1;
      return "2026-08-17T15:00:00.000Z";
    },
  });

  const nullHash = {
    ...erste.payload,
    contentHash: null,
  };
  const nullHashFail = await revalidiereBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: nullHash,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => {
      digestCalled += 1;
      return "a".repeat(64);
    },
    clock: () => {
      clockCalled += 1;
      return "2026-08-17T15:00:00.000Z";
    },
  });

  return !fehlend.ok
    && !quelleFail.ok
    && !promptFail.ok
    && !nullHashFail.ok
    && digestCalled === 0
    && clockCalled === 0;
})());

// 5) Nachweis
await checkAsync("Marker ist account-namespaced und formfremd fail-closed", (async () => {
  const storageA = makeStorage();
  const storageB = makeStorage();
  const markerA = { articleId: responseBasePayload.artikel.id, contentHash: "c".repeat(64), analyzedAt: "2026-08-17T10:00:00.000Z" };
  const markerB = { articleId: "anders", contentHash: "d".repeat(64), analyzedAt: "2026-08-17T10:00:00.000Z" };

  if (!speichereBlogProfilAnalyseNachweis(storageA, ACCOUNT_ID_VALID_1, markerA)) return false;
  if (!speichereBlogProfilAnalyseNachweis(storageB, ACCOUNT_ID_VALID_2, markerB)) return false;

  const gelesenA = liesBlogProfilAnalyseNachweis(storageA, ACCOUNT_ID_VALID_1);
  const gelesenB = liesBlogProfilAnalyseNachweis(storageB, ACCOUNT_ID_VALID_2);
  const vermischt = liesBlogProfilAnalyseNachweis(storageA, ACCOUNT_ID_VALID_2);

  if (!gelesenA || !gelesenB || vermischt) return false;
  return !Object.prototype.hasOwnProperty.call(gelesenA, "titel")
    && !Object.prototype.hasOwnProperty.call(gelesenA, "text")
    && !Object.prototype.hasOwnProperty.call(gelesenA, "beleg");
})());

await checkAsync("Leere accountId wird bei Leseversuch abgewiesen", (async () => (
  liesBlogProfilAnalyseNachweis(makeStorage(), "") === null
))());

await checkAsync("AccountId mit Whitespace wird abgewiesen", (async () => (
  liesBlogProfilAnalyseNachweis(makeStorage(), `${ACCOUNT_ID_VALID_1} `) === null
))());

await checkAsync("Leere accountId wird bei Schreibversuch abgewiesen", (async () => (
  !speichereBlogProfilAnalyseNachweis(makeStorage(), "", { articleId: responseBasePayload.artikel.id, contentHash: "a".repeat(64), analyzedAt: "2026-08-17T10:00:00.000Z" })
))());

await checkAsync("Storage-Getter-Exception führt zu fail-closed Leseergebnis", (async () => (
  liesBlogProfilAnalyseNachweis(throwingStorage, ACCOUNT_ID_VALID_1) === null
))());

await checkAsync("Storage-Setter-Exception führt zu fail-closed Schreibergebnis", (async () => (
  !speichereBlogProfilAnalyseNachweis(throwingStorage, ACCOUNT_ID_VALID_1, { articleId: responseBasePayload.artikel.id, contentHash: "e".repeat(64), analyzedAt: "2026-08-17T10:00:00.000Z" })
))());

await checkAsync("Korruptes Marker-JSON wird abgewiesen", (async () => {
  const storage = makeStorage();
  storage.setItem(`kd:blog-profile-analyse:nachweis:v1:${ACCOUNT_ID_VALID_3}`, "not-json");
  return liesBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_3) === null;
})());

await checkAsync("analyseAt muss kanonische ISO sein", (async () => {
  const storage = makeStorage();
  return !speichereBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_1, {
    articleId: responseBasePayload.artikel.id,
    contentHash: "f".repeat(64),
    analyzedAt: "2026-08-17T10:00:00Z",
  });
})());

await checkAsync("Marker mit 64 Nullen wird abgelehnt", (async () => (
  !speichereBlogProfilAnalyseNachweis(makeStorage(), ACCOUNT_ID_VALID_1, {
    articleId: responseBasePayload.artikel.id,
    contentHash: "0".repeat(64),
    analyzedAt: "2026-08-17T10:00:00.000Z",
  })
)));

await checkAsync("Marker mit nicht-string Typen wird explizit abgelehnt", (async () => {
  const storage = makeStorage();
  return !speichereBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_1, {
    articleId: 123,
    contentHash: 123,
    analyzedAt: "2026-08-17T10:00:00.000Z",
  });
}));

await checkAsync("Unveränderten Artikel per Marker erkennen", (async () => {
  const storage = makeStorage();
  const marker = { articleId: responseBasePayload.artikel.id, contentHash: "f".repeat(64), analyzedAt: "2026-08-17T10:00:00.000Z" };
  if (!speichereBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_1, marker)) return false;
  return isArtikelUnveraendert(storage, ACCOUNT_ID_VALID_1, responseBasePayload, { digest: async () => "f".repeat(64) });
})());

await checkAsync("Supplied Hash akzeptiert unveränderten aktuellen Inhalt", (async () => {
  const storage = makeStorage();
  const contentHash = contentHashFuer(responseBasePayload);
  const marker = { articleId: responseBasePayload.artikel.id, contentHash, analyzedAt: "2026-08-17T10:05:00.000Z" };
  if (!speichereBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_1, marker)) return false;
  return isArtikelUnveraendert(storage, ACCOUNT_ID_VALID_1, responseBasePayload, { contentHash, digest: sha256Hex });
})());

await checkAsync("Supplied Hash schützt gegen Titel-Drift", (async () => {
  const storage = makeStorage();
  const contentHash = contentHashFuer(responseBasePayload);
  const marker = { articleId: responseBasePayload.artikel.id, contentHash, analyzedAt: "2026-08-17T10:10:00.000Z" };
  if (!speichereBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_1, marker)) return false;
  const geaendert = structuredClone(responseBasePayload);
  geaendert.artikel.titel = `${geaendert.artikel.titel} geändert`;
  return !(await isArtikelUnveraendert(storage, ACCOUNT_ID_VALID_1, geaendert, { contentHash, digest: sha256Hex }));
})());

await checkAsync("Supplied Hash schützt gegen Text-Drift", (async () => {
  const storage = makeStorage();
  const contentHash = contentHashFuer(responseBasePayload);
  const marker = { articleId: responseBasePayload.artikel.id, contentHash, analyzedAt: "2026-08-17T10:15:00.000Z" };
  if (!speichereBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_1, marker)) return false;
  const geaendert = structuredClone(responseBasePayload);
  geaendert.artikel.text = `${geaendert.artikel.text} geändert`;
  return !(await isArtikelUnveraendert(storage, ACCOUNT_ID_VALID_1, geaendert, { contentHash, digest: sha256Hex }));
})());

await checkAsync("Null-Hash und ungültiger Digest bleiben fail-closed", (async () => {
  const storage = makeStorage();
  const contentHash = contentHashFuer(responseBasePayload);
  const marker = { articleId: responseBasePayload.artikel.id, contentHash, analyzedAt: "2026-08-17T10:20:00.000Z" };
  if (!speichereBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_1, marker)) return false;
  const nullHash = await isArtikelUnveraendert(storage, ACCOUNT_ID_VALID_1, responseBasePayload, {
    contentHash: null,
    digest: sha256Hex,
  });
  const invalidDigest = await isArtikelUnveraendert(storage, ACCOUNT_ID_VALID_1, responseBasePayload, {
    contentHash,
    digest: null,
  });
  return !nullHash && !invalidDigest;
})());

console.log("\nErgebnis:", ok.length, "ok,", rot.length, "offen");
if (rot.length > 0) {
  console.error("Fehlgeschlagene Checks:", rot.join(" | "));
  process.exit(1);
}

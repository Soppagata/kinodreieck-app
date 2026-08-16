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

// 3) Whole-response-Validator
const responseBasePayload = validSelection.ok ? validSelection.payload : waehleBlogProfilArtikel({
  artikel: [BASE_ARTICLE],
  artikelId: BASE_ARTICLE.id,
  listen: BASE_LISTEN,
}).payload;

const validResponse = validModelResponse(responseBasePayload.listen);
check("gültige Modellantwort wird akzeptiert", pruefeBlogProfilAnalyseAntwort(validResponse, responseBasePayload).ok);
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

await checkAsync("Revalidation verarbeitet editierte Vorschau ohne neue Hash-/Clock-Berechnung", (async () => {
  const first = await erzeugeBlogProfilAnalyseVorschau({
    artikelPayload: responseBasePayload,
    modelAntwort: konfliktResponse,
    bestehendesProfil: existingProfile,
    bestehendesVokabular: existingVokabular,
    digest: async () => "f".repeat(64),
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
    digest: async () => { throw new Error("should-not-run"); },
    clock: () => { throw new Error("should-not-run"); },
  });

  if (!second.ok) return false;
  return second.payload.contentHash === first.payload.contentHash
    && second.payload.analyzedAt === first.payload.analyzedAt
    && second.payload.quelle === first.payload.quelle
    && second.payload.promptVersion === first.payload.promptVersion;
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

await checkAsync("Unveränderten Artikel per Marker erkennen", (async () => {
  const storage = makeStorage();
  const marker = { articleId: responseBasePayload.artikel.id, contentHash: "f".repeat(64), analyzedAt: "2026-08-17T10:00:00.000Z" };
  if (!speichereBlogProfilAnalyseNachweis(storage, ACCOUNT_ID_VALID_1, marker)) return false;
  return isArtikelUnveraendert(storage, ACCOUNT_ID_VALID_1, responseBasePayload, { digest: async () => "f".repeat(64) });
})());

console.log("\nErgebnis:", ok.length, "ok,", rot.length, "offen");
if (rot.length > 0) {
  console.error("Fehlgeschlagene Checks:", rot.join(" | "));
  process.exit(1);
}

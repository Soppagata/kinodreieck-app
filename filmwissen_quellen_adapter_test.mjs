import {
  LOC_NFR_ADAPTER_VERSION,
  LOC_NFR_URL,
  QuellenFehler,
  WIKIDATA_ACTION_URL,
  findeLocNfrEintrag,
  fundstellenFuerSynthese,
  holeLocNfrFundstelle,
  holeLocNfrSnapshot,
  holeWikidataFundstelle,
  normalisiereLocTitel,
  parseLocNfrAntwort,
  parseLocNfrTabelle,
} from "./supabase/functions/filmwissen-task/quellen.ts";
import { baueLocNfrComponentsV2Fixture } from "./tests/fixtures/loc_nfr_components_v2.js";

let ok = 0;
const fehler = [];
async function check(name, fn) {
  try {
    if (!await fn()) throw new Error("falsch");
    ok++;
    console.log("✓ " + name);
  } catch (error) {
    fehler.push(name);
    console.error("✗ " + name + ": " + error.message);
  }
}

const jsonAntwort = (wert, status = 200, header = {}) => {
  const text = JSON.stringify(wert);
  return new Response(text, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "content-length": String(Buffer.byteLength(text)), ...header },
  });
};
const claim = (value, rank = "normal", references = undefined) => ({
  rank,
  mainsnak: { snaktype: "value", datavalue: { value } },
  ...(references ? { references } : {}),
});
const qwert = (id) => ({ "entity-type": "item", id, "numeric-id": Number(id.slice(1)) });
const entityAlien = {
  id: "Q103569",
  type: "item",
  lastrevid: 2345678901,
  modified: "2026-07-29T12:00:00Z",
  labels: {
    de: { language: "de", value: "Alien – Das unheimliche Wesen aus einer fremden Welt" },
    en: { language: "en", value: "Alien" },
  },
  claims: {
    P31: [claim(qwert("Q11424"))],
    P345: [claim("tt0078748")],
    P4947: [claim("348")],
    P1476: [claim({ language: "en", text: "Alien" })],
    P577: [claim({ time: "+1979-05-25T00:00:00Z", precision: 11 })],
    P57: [claim(qwert("Q56005"))],
    P166: [
      claim(qwert("Q19020"), "normal", [{
        snaks: { P248: [{ snaktype: "value", datavalue: { value: qwert("Q131454") } }] },
      }]),
    ],
    P444: [claim("8.5/10")],
  },
};

function wikidataFetcher({ searchTotal = 1, entity = entityAlien, label = "Ridley Scott", onUrl } = {}) {
  return async (input, init) => {
    const url = new URL(String(input));
    onUrl?.(url, init);
    if (url.origin + url.pathname !== WIKIDATA_ACTION_URL) throw new Error("fremder Host");
    if (url.searchParams.get("action") === "query") {
      return jsonAntwort({
        query: {
          searchinfo: { totalhits: searchTotal },
          search: searchTotal === 1 ? [{ ns: 0, title: "Q103569", pageid: 1 }] : [],
        },
      });
    }
    const ids = url.searchParams.get("ids");
    if (ids === "Q56005") {
      return jsonAntwort({
        entities: { Q56005: { id: "Q56005", type: "item", labels: { en: { value: label } } } },
      });
    }
    return jsonAntwort({ entities: { Q103569: entity } }, 200, { etag: "\"wd-1\"" });
  };
}

await check("Q1 ungueltige Kennung und fehlender Kontakt stoppen vor Netz", async () => {
  let aufrufe = 0;
  for (const [eingabe, kontakt] of [
    [{ namespace: "imdb", kennung: "tt1 OR 1=1" }, "https://kinodreieck.example/kontakt"],
    [{ namespace: "imdb", kennung: "tt0078748" }, ""],
  ]) {
    try {
      await holeWikidataFundstelle(eingabe, { kontakt, fetcher: async () => { aufrufe++; return jsonAntwort({}); } });
      return false;
    } catch (error) {
      if (!(error instanceof QuellenFehler)) return false;
    }
  }
  return aufrufe === 0;
});

await check("Q2 IMDb wird nur per exaktem haswbstatement aufgeloest", async () => {
  const urls = [];
  await holeWikidataFundstelle(
    { namespace: "imdb", kennung: "tt0078748" },
    {
      kontakt: "https://kinodreieck.example/kontakt",
      fetcher: wikidataFetcher({ onUrl: (url, init) => urls.push({ url, init }) }),
      now: () => new Date("2026-07-30T10:00:00Z"),
    },
  );
  const suche = urls[0];
  return suche.url.searchParams.get("srsearch") === "haswbstatement:P345=tt0078748"
    && suche.url.searchParams.get("srlimit") === "2"
    && !suche.url.searchParams.has("maxlag")
    && suche.init.redirect === "manual"
    && /KinodreieckFilmwissenBot\/1\.0 \(https:\/\/kinodreieck\.example\/kontakt\)/.test(suche.init.headers["User-Agent"]);
});

await check("Q3 0 oder mehrere Wikidata-Treffer werden nie geraten", async () => {
  for (const total of [0, 2]) {
    try {
      await holeWikidataFundstelle(
        { namespace: "imdb", kennung: "tt0078748" },
        { kontakt: "support@example.com", fetcher: wikidataFetcher({ searchTotal: total }) },
      );
      return false;
    } catch (error) {
      if (!["wikidata-nicht-gefunden", "wikidata-kennung-mehrdeutig"].includes(error.code)) return false;
    }
  }
  return true;
});

await check("Q3b Wikidata-maxlag ist ein vorübergehender Quellenfehler, keine Mehrdeutigkeit", async () => {
  try {
    await holeWikidataFundstelle(
      { namespace: "imdb", kennung: "tt0078748" },
      {
        kontakt: "support@example.com",
        fetcher: async () => jsonAntwort({
          error: { code: "maxlag", info: "Waiting for replicas" },
        }),
      },
    );
    return false;
  } catch (error) {
    return error instanceof QuellenFehler && error.code === "wikidata-voruebergehend";
  }
});

await check("Q4 Filmtyp und externe Kennung werden am Objekt erneut geprueft", async () => {
  for (const entity of [
    { ...entityAlien, claims: { ...entityAlien.claims, P31: [claim(qwert("Q5398426"))] } },
    { ...entityAlien, claims: { ...entityAlien.claims, P345: [claim("tt9999999")] } },
  ]) {
    try {
      await holeWikidataFundstelle(
        { namespace: "imdb", kennung: "tt0078748" },
        { kontakt: "support@example.com", fetcher: wikidataFetcher({ entity }) },
      );
      return false;
    } catch (error) {
      if (!["wikidata-kein-film", "wikidata-imdb-widerspruch"].includes(error.code)) return false;
    }
  }
  return true;
});

await check("Q5 nur erlaubte strukturierte Fakten gelangen in die Fundstelle", async () => {
  const ergebnis = await holeWikidataFundstelle(
    { namespace: "imdb", kennung: "tt0078748" },
    {
      kontakt: "support@example.com",
      fetcher: wikidataFetcher(),
      now: () => new Date("2026-07-30T10:00:00Z"),
    },
  );
  const text = ergebnis.fundstelle.kernaussagen.join(" ");
  const passt = ergebnis.identitaet.canonicalQid === "Q103569"
    && ergebnis.identitaet.erscheinungsjahre.join(",") === "1979"
    && /Regie: Ridley Scott/.test(text)
    && !/8\.5|Auszeichnung/.test(text)
    && ergebnis.fundstelle.ursprung === "wikidata-community"
    && /^[a-f0-9]{64}$/.test(ergebnis.fundstelle.abrufSha256);
  if (!passt) throw new Error(JSON.stringify({ text, ergebnis }));
  return true;
});

await check("Q6 Redirect, Rate-Limit, HTML und Uebergroesse scheitern geschlossen", async () => {
  const antworten = [
    new Response("", { status: 301, headers: { location: "https://evil.example/" } }),
    new Response("", { status: 429, headers: { "retry-after": "60" } }),
    new Response("<html>captcha</html>", { status: 200, headers: { "content-type": "text/html" } }),
    new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": "9999999" } }),
  ];
  for (const antwort of antworten) {
    try {
      await holeWikidataFundstelle(
        { namespace: "wikidata", kennung: "Q103569" },
        { kontakt: "support@example.com", fetcher: async () => antwort },
      );
      return false;
    } catch (error) {
      if (!(error instanceof QuellenFehler)) return false;
    }
  }
  return true;
});

const miniMarkup = (rows) => `<table>
  <thead><tr><th>Film Title</th><th>Year of Release</th><th>Year Inducted</th></tr></thead>
  <tbody>${rows.join("")}</tbody>
</table>`;
const row = (titel, jahr, aufnahme, attr = "") =>
  `<tr><th scope="row" ${attr}>${titel}</th><td>${jahr}</td><td>${aufnahme}</td></tr>`;

await check("Q7 LOC-Parser versteht Attribute und HTML-Entities, aber keine Bereiche", () => {
  const parsed = parseLocNfrTabelle(miniMarkup([
    row("Alambrista!", "1977", "2023", 'class="inverted-exclamation"'),
    row("Love &amp; Basketball", "2000", "2023"),
    row("Zora Lathan Student Films", "1975-76", "2023"),
    row("Martha Graham Dance Films", "", "2023"),
  ]), { minRows: 4, maxRows: 4, vollstaendig: false });
  return parsed.length === 2 && parsed[1].titel === "Love & Basketball";
});

await check("Q8 LOC-Matching verlangt genaues Jahr und konservativen Titel", () => {
  const eintraege = [
    { titel: "The Thing", erscheinungsjahr: 1982, aufnahmejahr: 2025 },
    { titel: "The Thing from Another World", erscheinungsjahr: 1951, aufnahmejahr: 2001 },
    { titel: "Dracula", erscheinungsjahr: 1931, aufnahmejahr: 2000 },
    { titel: "Dracula (Spanish language version)", erscheinungsjahr: 1931, aufnahmejahr: 2015 },
  ];
  const basis = { requestedIdentifier: { namespace: "wikidata", kennung: "Q1" }, requestedQid: "Q1", canonicalQid: "Q1", revision: 1, modifiedAt: "", typ: "film" };
  return findeLocNfrEintrag(eintraege, { ...basis, titelAliase: ["The Thing"], erscheinungsjahre: [1982] })?.aufnahmejahr === 2025
    && findeLocNfrEintrag(eintraege, { ...basis, titelAliase: ["The Thing"], erscheinungsjahre: [1981] }) === null
    && findeLocNfrEintrag(eintraege, { ...basis, titelAliase: ["Dracula (Spanish language version)"], erscheinungsjahre: [1931] })?.aufnahmejahr === 2015;
});

await check("Q9 Katalog-Inversion verschiebt Artikel, entfernt ihn aber nicht", () =>
  normalisiereLocTitel("Last Waltz, The") === normalisiereLocTitel("The Last Waltz")
  && normalisiereLocTitel("Phenix City Story, The") === normalisiereLocTitel("The Phenix City Story")
  && normalisiereLocTitel("The Thing") !== normalisiereLocTitel("Thing"));

await check("Q10 LOC-Snapshot wird vollstaendig validiert und ergibt starken Beleg", async () => {
  const rows = [];
  for (let jahr = 1989; jahr <= 2025; jahr++) {
    for (let index = 0; index < 25; index++) {
      const titel = jahr === 2002 && index === 0 ? "Alien" : `Fixture ${jahr}-${index}`;
      const release = jahr === 2002 && index === 0
        ? "1979"
        : jahr === 1990 && index === 1
          ? "1975-76"
          : String(1900 + ((jahr + index) % 120));
      rows.push(row(titel, release, String(jahr)));
    }
  }
  const body = { "content.markup": miniMarkup(rows) };
  let ziel = "";
  const beleg = await holeLocNfrFundstelle({
    requestedIdentifier: { namespace: "wikidata", kennung: "Q103569" },
    requestedQid: "Q103569",
    canonicalQid: "Q103569",
    revision: 1,
    modifiedAt: "2026-01-01",
    titelAliase: ["Alien"],
    erscheinungsjahre: [1979],
    typ: "film",
  }, {
    fetcher: async (url, init) => {
      ziel = String(url);
      if (init.redirect !== "manual") throw new Error("redirect");
      return jsonAntwort(body, 200, { etag: "\"loc-1\"" });
    },
    now: () => new Date("2026-07-30T10:00:00Z"),
  });
  return ziel === LOC_NFR_URL && beleg?.ursprung === "loc-national-film-registry"
    && /2002/.test(beleg.kernaussagen[0]) && /^[a-f0-9]{64}$/.test(beleg.abrufSha256);
});

await check("Q10b aktuelles LOC-components/items-Schema bleibt eng, sauber und deterministisch", async () => {
  const marker = "IGNORIERTER-FREMDTEXT-771";
  const body = baueLocNfrComponentsV2Fixture({ ignorierterMarker: marker });
  body["content.components.items"][1].items[1].title = "<b>Alien</b>";
  const raw = JSON.stringify(body);
  const rawBytes = new TextEncoder().encode(raw);
  const hashBytes = new Uint8Array(8 + rawBytes.byteLength);
  new DataView(hashBytes.buffer).setBigUint64(0, BigInt(rawBytes.byteLength));
  hashBytes.set(rawBytes, 8);
  const erwarteterHash = [...new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    hashBytes,
  ))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const hole = () => holeLocNfrSnapshot({
    fetcher: async () => new Response(raw, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(raw)),
        etag: "\"loc-v2-test\"",
      },
    }),
    now: () => new Date("2026-08-24T10:00:00Z"),
  });
  const [a, b] = await Promise.all([hole(), hole()]);
  return a.adapterVersion === LOC_NFR_ADAPTER_VERSION
    && LOC_NFR_ADAPTER_VERSION === "loc-nfr-listing-v2"
    && a.eintraege.length === 900
    && a.eintraege[0].titel === "Alien"
    && Object.keys(a.eintraege[0]).join(",") === "titel,erscheinungsjahr,aufnahmejahr"
    && !JSON.stringify(a.eintraege).includes(marker)
    && a.abrufSha256 === erwarteterHash
    && b.abrufSha256 === a.abrufSha256
    && JSON.stringify(b.eintraege) === JSON.stringify(a.eintraege);
});

await check("Q11 Schema-Drift und doppelte LOC-Identitaeten blockieren", () => {
  const faelle = [
    miniMarkup([row("A", "1979", "2002")]).replace("Year Inducted", "Status"),
    miniMarkup([row("A", "1979", "2002"), row("A", "1979", "2003")]),
  ];
  return faelle.every((markup, index) => {
    try {
      parseLocNfrTabelle(markup, { minRows: index + 1, maxRows: index + 1, vollstaendig: false });
      return false;
    } catch (error) {
      return error instanceof QuellenFehler;
    }
  });
});

await check("Q11b current-Schema bleibt bei unbekannten Typen und leerer Form fail-closed", () => {
  const falscherJahrtyp = baueLocNfrComponentsV2Fixture();
  falscherJahrtyp["content.components.items"][1].items[1].year_inducted = 2002;
  const fehlenderJahrgang = baueLocNfrComponentsV2Fixture();
  for (const item of fehlenderJahrgang["content.components.items"][1].items) {
    if (item.year_inducted === "1989") item.year_inducted = "1990";
  }
  const faelle = [
    {},
    { "content.markup": {} },
    { "content.components.items": {} },
    { "content.components.items": [null] },
    falscherJahrtyp,
    fehlenderJahrgang,
  ];
  return faelle.every((wert) => {
    try {
      parseLocNfrAntwort(wert);
      return false;
    } catch (error) {
      return error instanceof QuellenFehler;
    }
  });
});

await check("Q11c current-Schema begrenzt kumulativ nur die drei akzeptierten Textfelder", () => {
  try {
    parseLocNfrAntwort(baueLocNfrComponentsV2Fixture({
      titelSuffix: "x".repeat(80),
    }));
    return false;
  } catch (error) {
    return error instanceof QuellenFehler
      && error.code === "loc-komponenten-text-zu-gross";
  }
});

await check("Q11d LOC-v2-Antwortzaun stoppt vor Parser und Rohtextausgabe", async () => {
  try {
    await holeLocNfrSnapshot({
      fetcher: async () => new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(2 * 1024 * 1024 + 1),
        },
      }),
    });
    return false;
  } catch (error) {
    return error instanceof QuellenFehler && error.code === "antwort-zu-gross";
  }
});

await check("Q12 ohne LOC-Treffer gibt es keine scheinbar belegte Synthese", async () => {
  const wd = await holeWikidataFundstelle(
    { namespace: "wikidata", kennung: "Q103569" },
    { kontakt: "support@example.com", fetcher: wikidataFetcher() },
  );
  return fundstellenFuerSynthese(wd, null).length === 1;
});

console.log(`\n${ok}/${ok + fehler.length} Quellenadapter-Checks bestanden.`);
if (fehler.length) process.exit(1);

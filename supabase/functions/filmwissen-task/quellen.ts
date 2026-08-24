/* Feste, serverseitige Quellenadapter fuer Etappe 8.
   Kein Browserwert kann Host, Pfad oder Fundstellentext bestimmen. Alle
   Netzwerkgrenzen sind fail-closed; 429/503 werden nicht automatisch
   wiederholt. */

import type { Fundstelle, Werk } from "./vertrag.ts";

export const WIKIDATA_ADAPTER_VERSION = "wikidata-action-v1";
export const LOC_NFR_ADAPTER_VERSION = "loc-nfr-listing-v2";
export const WIKIDATA_ACTION_URL = "https://www.wikidata.org/w/api.php";
export const LOC_NFR_URL = "https://www.loc.gov/programs/national-film-preservation-board/film-registry/complete-national-film-registry-listing/?fo=json&at=content.markup,content.components.items";

const QID = /^Q[1-9][0-9]{0,17}$/;
const IMDB = /^tt[0-9]{7,10}$/;
const TMDB = /^[1-9][0-9]{0,7}$/;
const STEUERZEICHEN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const UNGUELTIGE_MARKUP_ZEICHEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/;
const FILMTYPEN = new Set(["Q11424", "Q24862", "Q506240"]);
const LOC_ORGANISATION = "Q131454";
const LOC_LEGACY_MARKUP_FELD = "content.markup";
const LOC_COMPONENTS_ITEMS_FELD = "content.components.items";
/* Providerfreier Schema-Spike 24.08.2026: 1_779_153 Antwortbytes,
   2 Komponenten, 925 Items, 23_466 Bytes in den drei akzeptierten Feldern
   und 900 exakt datierbare Eintraege; die lueckenlosen Aufnahmejahrgaenge
   1989-2025 enthalten je 23-26 Rohitems. Die Grenzen geben begrenzte
   Driftluft, ohne Beschreibungen, Templates oder Links zum Nutztext zu machen. */
const LOC_ANTWORT_MAX_BYTES = 2 * 1024 * 1024;
const LOC_KOMPONENTEN_MAX = 4;
const LOC_ITEMS_MIN = 900;
const LOC_ITEMS_MAX = 1_200;
const LOC_TITEL_MAX_BYTES = 512;
const LOC_JAHR_TEXT_MAX_BYTES = 32;
const LOC_NUTZTEXT_MAX_BYTES = 64 * 1024;

export type StarkeFilmkennung =
  | { namespace: "wikidata"; kennung: string }
  | { namespace: "imdb"; kennung: string }
  | { namespace: "tmdb"; kennung: string };

export type AdapterFundstelle = Fundstelle & {
  url: string;
  abgerufenAm: string;
  abrufSha256: string;
  adapterVersion: string;
  lizenz: string;
  etag: string | null;
};

export type WikidataErgebnis = {
  fundstelle: AdapterFundstelle;
  identitaet: {
    requestedIdentifier: StarkeFilmkennung;
    requestedQid: string | null;
    canonicalQid: string;
    revision: number;
    modifiedAt: string;
    titelAliase: string[];
    erscheinungsjahre: number[];
    typ: "film";
  };
};

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type AbrufOptionen = {
  fetcher?: Fetcher;
  timeoutMs?: number;
  now?: () => Date;
};
type WikimediaOptionen = AbrufOptionen & {
  kontakt: string;
  botVersion?: string;
};

export class QuellenFehler extends Error {
  code: string;
  retryAfter: string | null;

  constructor(code: string, retryAfter: string | null = null) {
    super(code);
    this.name = "QuellenFehler";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function normalisiereText(wert: unknown, max = 160): string | null {
  if (typeof wert !== "string") return null;
  const text = wert.normalize("NFC").trim();
  if (!text || text.length > max || STEUERZEICHEN.test(text)) return null;
  return text;
}

function sichereKontaktangabe(kontakt: string): string {
  const text = normalisiereText(kontakt, 240);
  if (
    !text || !/^https:\/\/[^\s()]+$|^[^@\s()]+@[^@\s()]+\.[^@\s()]+$/.test(text)
  ) {
    throw new QuellenFehler("wikimedia-kontakt-fehlt");
  }
  return text;
}

function pruefeKennung(eingabe: StarkeFilmkennung): void {
  if (eingabe.namespace === "wikidata" && QID.test(eingabe.kennung)) return;
  if (eingabe.namespace === "imdb" && IMDB.test(eingabe.kennung)) return;
  if (eingabe.namespace === "tmdb" && TMDB.test(eingabe.kennung)) return;
  throw new QuellenFehler("kennung-ungueltig");
}

function wikidataUrl(parameter: Record<string, string>): string {
  const url = new URL(WIKIDATA_ACTION_URL);
  for (const [key, value] of Object.entries(parameter)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function liesBegrenzt(
  antwort: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const laenge = antwort.headers.get("content-length");
  if (laenge && (!/^[0-9]+$/.test(laenge) || Number(laenge) > maxBytes)) {
    throw new QuellenFehler("antwort-zu-gross");
  }
  if (!antwort.body) throw new QuellenFehler("antwort-ohne-body");
  const leser = antwort.body.getReader();
  const teile: Uint8Array[] = [];
  let gesamt = 0;
  while (true) {
    const { done, value } = await leser.read();
    if (done) break;
    gesamt += value.byteLength;
    if (gesamt > maxBytes) {
      await leser.cancel();
      throw new QuellenFehler("antwort-zu-gross");
    }
    teile.push(value);
  }
  const ausgabe = new Uint8Array(gesamt);
  let offset = 0;
  for (const teil of teile) {
    ausgabe.set(teil, offset);
    offset += teil.byteLength;
  }
  return ausgabe;
}

async function holeJson(
  url: string,
  erwarteteUrl: string,
  maxBytes: number,
  header: Record<string, string>,
  optionen: AbrufOptionen,
): Promise<
  { json: unknown; bytes: Uint8Array; etag: string | null; status: number }
> {
  if (url !== erwarteteUrl && !url.startsWith(WIKIDATA_ACTION_URL + "?")) {
    throw new QuellenFehler("adapter-url-ungueltig");
  }
  const ziel = new URL(url);
  if (
    ziel.protocol !== "https:" ||
    !["www.wikidata.org", "www.loc.gov"].includes(ziel.hostname)
  ) {
    throw new QuellenFehler("adapter-host-ungueltig");
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    optionen.timeoutMs ?? 8_000,
  );
  let antwort: Response;
  try {
    antwort = await (optionen.fetcher ?? fetch)(url, {
      method: "GET",
      headers: header,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new QuellenFehler("adapter-timeout");
    }
    throw new QuellenFehler("adapter-netzfehler");
  } finally {
    clearTimeout(timer);
  }
  if (antwort.status >= 300 && antwort.status < 400) {
    throw new QuellenFehler("adapter-redirect");
  }
  if (antwort.status === 429 || antwort.status === 503) {
    throw new QuellenFehler(
      "adapter-rate-limit",
      antwort.headers.get("retry-after"),
    );
  }
  if (!antwort.ok) throw new QuellenFehler("adapter-http-" + antwort.status);
  if (antwort.url && antwort.url !== url) {
    throw new QuellenFehler("adapter-antwort-url");
  }
  const contentType = (antwort.headers.get("content-type") ?? "").split(";")[0]
    .trim().toLowerCase();
  if (
    !(contentType === "application/json" ||
      /^application\/[^/]+\+json$/.test(contentType))
  ) {
    throw new QuellenFehler("adapter-content-type");
  }
  const bytes = await liesBegrenzt(antwort, maxBytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new QuellenFehler("adapter-utf8");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new QuellenFehler("adapter-json");
  }
  return {
    json,
    bytes,
    etag: antwort.headers.get("etag"),
    status: antwort.status,
  };
}

function objekt(wert: unknown): Record<string, unknown> | null {
  return wert && typeof wert === "object" && !Array.isArray(wert) ? wert as Record<string, unknown> : null;
}

function aktiveAussagen(
  entity: Record<string, unknown>,
  property: string,
): Record<string, unknown>[] {
  const claims = objekt(entity.claims);
  const liste = claims?.[property];
  if (!Array.isArray(liste)) return [];
  const aktiv = liste.map(objekt).filter((v): v is Record<string, unknown> => Boolean(v) && v?.rank !== "deprecated");
  const bevorzugt = aktiv.filter((v) => v.rank === "preferred");
  return bevorzugt.length ? bevorzugt : aktiv.filter((v) => v.rank === "normal");
}

function datavalue(aussage: Record<string, unknown>): unknown {
  const mainsnak = objekt(aussage.mainsnak);
  if (mainsnak?.snaktype !== "value") return null;
  return objekt(mainsnak.datavalue)?.value ?? null;
}

function snakWert(snak: unknown): unknown {
  const wert = objekt(snak);
  if (wert?.snaktype !== "value") return null;
  return objekt(wert.datavalue)?.value ?? null;
}

function entityId(wert: unknown): string | null {
  const o = objekt(wert);
  const id = typeof o?.id === "string" ? o.id : (Number.isInteger(o?.["numeric-id"]) ? "Q" + o?.["numeric-id"] : null);
  return id && QID.test(id) ? id : null;
}

function stringWert(wert: unknown): string | null {
  return normalisiereText(wert, 240);
}

function zeitJahr(wert: unknown): number | null {
  const time = objekt(wert)?.time;
  if (typeof time !== "string") return null;
  const match = /^\+([0-9]{4})-[0-9]{2}-[0-9]{2}T/.exec(time);
  const jahr = match ? Number(match[1]) : NaN;
  return Number.isInteger(jahr) && jahr >= 1870 && jahr <= 2200 ? jahr : null;
}

function monolingual(wert: unknown): string | null {
  return normalisiereText(objekt(wert)?.text, 240);
}

function hatLocReferenz(aussage: Record<string, unknown>): boolean {
  const refs = aussage.references;
  if (!Array.isArray(refs)) return false;
  return refs.some((referenz) => {
    const snaks = objekt(objekt(referenz)?.snaks);
    if (!snaks) return false;
    const statedIn = Array.isArray(snaks.P248) ? snaks.P248 : [];
    if (
      statedIn.some((snak) => entityId(snakWert(snak)) === LOC_ORGANISATION)
    ) {
      return true;
    }
    const urls = Array.isArray(snaks.P854) ? snaks.P854 : [];
    return urls.some((snak) => {
      const url = stringWert(snakWert(snak));
      if (!url) return false;
      try {
        const host = new URL(url).hostname.toLowerCase();
        return host === "loc.gov" || host.endsWith(".loc.gov");
      } catch {
        return false;
      }
    });
  });
}

function eindeutigeStringKennung(
  entity: Record<string, unknown>,
  property: string,
): string | null {
  const werte = aktiveAussagen(entity, property)
    .map((a) => stringWert(datavalue(a)))
    .filter((v): v is string => Boolean(v));
  return werte.length === 1 ? werte[0] : null;
}

function entityLabel(entity: Record<string, unknown>): string | null {
  const labels = objekt(entity.labels);
  for (const sprache of ["de", "en"]) {
    const label = normalisiereText(objekt(labels?.[sprache])?.value, 160);
    if (label) return label;
  }
  return null;
}

function entityMap(json: unknown): Record<string, Record<string, unknown>> {
  const entities = objekt(objekt(json)?.entities);
  if (!entities) throw new QuellenFehler("wikidata-entity-schema");
  const ausgabe: Record<string, Record<string, unknown>> = {};
  for (const [id, wert] of Object.entries(entities)) {
    const entity = objekt(wert);
    if (entity && QID.test(id) && entity.missing === undefined) {
      ausgabe[id] = entity;
    }
  }
  return ausgabe;
}

function laengenHashTeile(teile: Uint8Array[]): Uint8Array {
  const gesamt = teile.reduce((summe, teil) => summe + 8 + teil.byteLength, 0);
  const bytes = new Uint8Array(gesamt);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const teil of teile) {
    view.setBigUint64(offset, BigInt(teil.byteLength));
    offset += 8;
    bytes.set(teil, offset);
    offset += teil.byteLength;
  }
  return bytes;
}

async function sha256(teile: Uint8Array[]): Promise<string> {
  const bytes = laengenHashTeile(teile);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer as ArrayBuffer,
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function wikimediaHeader(optionen: WikimediaOptionen): Record<string, string> {
  const kontakt = sichereKontaktangabe(optionen.kontakt);
  const version = normalisiereText(optionen.botVersion ?? "1.0", 30);
  if (!version || !/^[A-Za-z0-9._-]+$/.test(version)) {
    throw new QuellenFehler("adapter-version");
  }
  return {
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate",
    "User-Agent": `KinodreieckFilmwissenBot/${version} (${kontakt})`,
  };
}

function basisParameter(): Record<string, string> {
  /* `maxlag` ist für schreibende Bots ein sinnvoller Rückstau-Schutz, lehnt
     aber auch unsere rein lesenden, bereits serverseitig ratenbegrenzten
     Requests mit HTTP 200 + Fehlerobjekt ab. Die gelesene Revision und ihr
     Änderungszeitpunkt werden ohnehin als Provenienz eingefroren. */
  return { format: "json", formatversion: "2" };
}

function pruefeWikidataApiAntwort(json: unknown): void {
  const fehler = objekt(objekt(json)?.error);
  if (!fehler) return;
  const code = normalisiereText(fehler.code, 80);
  if (code === "maxlag") throw new QuellenFehler("wikidata-voruebergehend");
  throw new QuellenFehler("wikidata-api-fehler");
}

export async function holeWikidataFundstelle(
  eingabe: StarkeFilmkennung,
  optionen: WikimediaOptionen,
): Promise<WikidataErgebnis> {
  pruefeKennung(eingabe);
  const header = wikimediaHeader(optionen);
  const rohteile: Uint8Array[] = [];
  let requestedQid: string | null = eingabe.namespace === "wikidata" ? eingabe.kennung : null;
  if (!requestedQid) {
    const property = eingabe.namespace === "imdb" ? "P345" : "P4947";
    const url = wikidataUrl({
      ...basisParameter(),
      action: "query",
      list: "search",
      srsearch: `haswbstatement:${property}=${eingabe.kennung}`,
      srnamespace: "0",
      srlimit: "2",
      srinfo: "totalhits",
      srprop: "",
    });
    const abruf = await holeJson(url, url, 128 * 1024, header, optionen);
    rohteile.push(abruf.bytes);
    pruefeWikidataApiAntwort(abruf.json);
    const query = objekt(objekt(abruf.json)?.query);
    const total = objekt(query?.searchinfo)?.totalhits;
    const search = query?.search;
    if (total === 0) throw new QuellenFehler("wikidata-nicht-gefunden");
    if (total !== 1 || !Array.isArray(search) || search.length !== 1) {
      throw new QuellenFehler("wikidata-kennung-mehrdeutig");
    }
    const treffer = objekt(search[0]);
    requestedQid = treffer?.ns === 0 && typeof treffer.title === "string" &&
        QID.test(treffer.title)
      ? treffer.title
      : null;
    if (!requestedQid) throw new QuellenFehler("wikidata-suchantwort");
  }

  const entityUrl = wikidataUrl({
    ...basisParameter(),
    action: "wbgetentities",
    ids: requestedQid,
    redirects: "yes",
    props: "info|labels|claims",
    languages: "de|en",
    languagefallback: "1",
  });
  const entityAbruf = await holeJson(
    entityUrl,
    entityUrl,
    2 * 1024 * 1024,
    header,
    optionen,
  );
  rohteile.push(entityAbruf.bytes);
  pruefeWikidataApiAntwort(entityAbruf.json);
  const entities = entityMap(entityAbruf.json);
  const entityListe = Object.values(entities);
  if (entityListe.length !== 1) {
    throw new QuellenFehler("wikidata-entity-anzahl");
  }
  const entity = entityListe[0];
  const canonicalQid = typeof entity.id === "string" && QID.test(entity.id) ? entity.id : Object.keys(entities)[0];
  if (!QID.test(canonicalQid) || entity.type !== "item") {
    throw new QuellenFehler("wikidata-entity-identitaet");
  }

  const typen = aktiveAussagen(entity, "P31")
    .map((a) => entityId(datavalue(a))).filter((v): v is string => Boolean(v));
  if (!typen.some((id) => FILMTYPEN.has(id))) {
    throw new QuellenFehler("wikidata-kein-film");
  }
  if (
    eingabe.namespace === "imdb" &&
    eindeutigeStringKennung(entity, "P345") !== eingabe.kennung
  ) {
    throw new QuellenFehler("wikidata-imdb-widerspruch");
  }
  if (
    eingabe.namespace === "tmdb" &&
    eindeutigeStringKennung(entity, "P4947") !== eingabe.kennung
  ) {
    throw new QuellenFehler("wikidata-tmdb-widerspruch");
  }

  const label = entityLabel(entity);
  if (!label) throw new QuellenFehler("wikidata-label-fehlt");
  const originaltitel = aktiveAussagen(entity, "P1476")
    .map((a) => monolingual(datavalue(a))).filter((v): v is string => Boolean(v));
  const jahre = [
    ...new Set(
      aktiveAussagen(entity, "P577")
        .map((a) => zeitJahr(datavalue(a))).filter((v): v is number => v !== null),
    ),
  ].sort();

  const entityProperties: Array<[string, string]> = [
    ["P57", "Regie"],
    ["P136", "Genre"],
    ["P495", "Produktionsland"],
    ["P364", "Originalsprache"],
    ["P166", "Auszeichnung"],
    ["P1411", "Nominierung"],
    ["P5072", "Festivalpräsentation"],
    ["P921", "Hauptthema"],
    ["P144", "Basiert auf"],
  ];
  const verknuepfungen: Array<
    { property: string; bezeichnung: string; qid: string }
  > = [];
  for (const [property, bezeichnung] of entityProperties) {
    for (const aussage of aktiveAussagen(entity, property)) {
      if (hatLocReferenz(aussage)) continue;
      const qid = entityId(datavalue(aussage));
      if (qid && verknuepfungen.length < 50) {
        verknuepfungen.push({ property, bezeichnung, qid });
      }
    }
  }

  const labels = new Map<string, string>();
  const labelIds = [...new Set(verknuepfungen.map((v) => v.qid))].slice(0, 50);
  if (labelIds.length) {
    const labelUrl = wikidataUrl({
      ...basisParameter(),
      action: "wbgetentities",
      ids: labelIds.join("|"),
      redirects: "no",
      props: "labels",
      languages: "de|en",
      languagefallback: "1",
    });
    const labelAbruf = await holeJson(
      labelUrl,
      labelUrl,
      512 * 1024,
      header,
      optionen,
    );
    rohteile.push(labelAbruf.bytes);
    pruefeWikidataApiAntwort(labelAbruf.json);
    for (
      const [id, linkedEntity] of Object.entries(entityMap(labelAbruf.json))
    ) {
      const linkedLabel = entityLabel(linkedEntity);
      if (linkedLabel) labels.set(id, linkedLabel);
    }
  }

  const kernaussagen: string[] = [];
  if (jahre[0]) kernaussagen.push(`Erstveröffentlichung: ${jahre[0]}.`);
  if (originaltitel[0]) {
    kernaussagen.push(`Originaltitel: ${originaltitel[0]}.`);
  }
  for (const verknuepfung of verknuepfungen) {
    const linkedLabel = labels.get(verknuepfung.qid);
    if (linkedLabel) {
      kernaussagen.push(`${verknuepfung.bezeichnung}: ${linkedLabel}.`);
    }
    if (kernaussagen.length >= 10) break;
  }
  const eindeutig = [...new Set(kernaussagen)].slice(0, 10);
  if (!eindeutig.length) throw new QuellenFehler("wikidata-keine-fakten");
  const revision = entity.lastrevid;
  const modifiedAt = entity.modified;
  if (!Number.isInteger(revision) || typeof modifiedAt !== "string") {
    throw new QuellenFehler("wikidata-provenienz");
  }
  const abgerufenAm = (optionen.now ?? (() => new Date()))().toISOString();
  return {
    fundstelle: {
      id: "F1",
      quelle: "wikidata",
      domain: "www.wikidata.org",
      belegklasse: "strukturiert",
      ursprung: "wikidata-community",
      url: `https://www.wikidata.org/wiki/${canonicalQid}`,
      titel: `Wikidata: ${label} (${canonicalQid})`,
      veroeffentlichtAm: null,
      kernaussagen: eindeutig,
      abgerufenAm,
      abrufSha256: await sha256(rohteile),
      adapterVersion: WIKIDATA_ADAPTER_VERSION,
      lizenz: "CC0-1.0",
      etag: entityAbruf.etag,
    },
    identitaet: {
      requestedIdentifier: eingabe,
      requestedQid,
      canonicalQid,
      revision: revision as number,
      modifiedAt,
      titelAliase: [...new Set([label, ...originaltitel])],
      erscheinungsjahre: jahre,
      typ: "film",
    },
  };
}

export type LocEintrag = {
  titel: string;
  erscheinungsjahr: number;
  aufnahmejahr: number;
};
export type LocNfrSnapshot = {
  adapterVersion: string;
  eintraege: LocEintrag[];
  abgerufenAm: string;
  abrufSha256: string;
  etag: string | null;
};

function decodeHtml(text: string): string {
  const benannt: Record<string, string> = {
    amp: "&",
    apos: "'",
    quot: '"',
    nbsp: " ",
    lt: "<",
    gt: ">",
  };
  return text.replace(
    /&(#(?:x[0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);/g,
    (_, entity: string) => {
      if (entity[0] === "#") {
        const hex = entity[1]?.toLowerCase() === "x";
        const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isInteger(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : "\uFFFD";
      }
      return benannt[entity] ?? `&${entity};`;
    },
  );
}

function ohneTags(html: string): string | null {
  const text = decodeHtml(html.replace(/<[^>]*>/g, "")).replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ").trim().normalize("NFKC");
  return normalisiereText(text, 300);
}

function utf8Laenge(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function parseLocNfrKomponenten(rohKomponenten: unknown): LocEintrag[] {
  if (
    !Array.isArray(rohKomponenten) || rohKomponenten.length < 1 ||
    rohKomponenten.length > LOC_KOMPONENTEN_MAX
  ) {
    throw new QuellenFehler("loc-komponenten-schema");
  }
  const eintraege: LocEintrag[] = [];
  let itemAnzahl = 0;
  let nutztextBytes = 0;
  let itemListeGefunden = false;
  const rohProAufnahmejahr = new Map<number, number>();

  for (const rohKomponente of rohKomponenten) {
    const komponente = objekt(rohKomponente);
    if (!komponente) throw new QuellenFehler("loc-komponenten-schema");
    if (!("items" in komponente)) continue;
    if (!Array.isArray(komponente.items)) {
      throw new QuellenFehler("loc-komponenten-schema");
    }
    itemListeGefunden = true;
    itemAnzahl += komponente.items.length;
    if (itemAnzahl > LOC_ITEMS_MAX) {
      throw new QuellenFehler("loc-komponenten-items-zu-viele");
    }

    for (const rohItem of komponente.items) {
      const item = objekt(rohItem);
      if (!item) throw new QuellenFehler("loc-komponenten-item-schema");
      const titelRoh = item.title;
      const erscheinungsjahrRoh = item.year_released;
      const aufnahmejahrRoh = item.year_inducted;
      for (const [index, feld] of [
        titelRoh,
        erscheinungsjahrRoh,
        aufnahmejahrRoh,
      ].entries()) {
        if (feld !== undefined && typeof feld !== "string") {
          throw new QuellenFehler("loc-komponenten-item-schema");
        }
        if (typeof feld === "string") {
          const bytes = utf8Laenge(feld);
          if (
            bytes > (index === 0 ? LOC_TITEL_MAX_BYTES : LOC_JAHR_TEXT_MAX_BYTES)
          ) throw new QuellenFehler("loc-komponenten-text-zu-gross");
          nutztextBytes += bytes;
        }
      }
      if (nutztextBytes > LOC_NUTZTEXT_MAX_BYTES) {
        throw new QuellenFehler("loc-komponenten-text-zu-gross");
      }

      /* Der echte v2-Payload enthaelt genau eine reine Titelzeile sowie
         einzelne nicht exakt datierbare Werke. Nur die drei belegten
         Textfelder werden betrachtet; Beschreibungen, Templates, Links und
         sonstige Felder werden weder normalisiert noch weitergegeben. */
      if (typeof titelRoh !== "string") {
        throw new QuellenFehler("loc-komponenten-item-schema");
      }
      const titel = ohneTags(titelRoh);
      if (!titel) throw new QuellenFehler("loc-komponenten-titel");
      if (aufnahmejahrRoh === undefined) {
        if (erscheinungsjahrRoh === undefined) continue;
        throw new QuellenFehler("loc-komponenten-item-schema");
      }
      if (typeof aufnahmejahrRoh !== "string") {
        throw new QuellenFehler("loc-komponenten-item-schema");
      }
      const aufnahmejahrText = ohneTags(aufnahmejahrRoh);
      if (!/^[0-9]{4}$/.test(aufnahmejahrText ?? "")) {
        throw new QuellenFehler("loc-jahr-ungueltig");
      }
      const aufnahmejahr = Number(aufnahmejahrText);
      if (
        aufnahmejahr < 1989 || aufnahmejahr > new Date().getUTCFullYear()
      ) throw new QuellenFehler("loc-jahr-ungueltig");
      rohProAufnahmejahr.set(
        aufnahmejahr,
        (rohProAufnahmejahr.get(aufnahmejahr) ?? 0) + 1,
      );
      if (erscheinungsjahrRoh === undefined) continue;
      if (typeof erscheinungsjahrRoh !== "string") {
        throw new QuellenFehler("loc-komponenten-item-schema");
      }
      const erscheinungsjahrText = ohneTags(erscheinungsjahrRoh);
      if (!/^[0-9]{4}$/.test(erscheinungsjahrText ?? "")) {
        continue;
      }
      const erscheinungsjahr = Number(erscheinungsjahrText);
      if (
        erscheinungsjahr < 1870 || erscheinungsjahr > 2200
      ) {
        throw new QuellenFehler("loc-jahr-ungueltig");
      }
      eintraege.push({ titel, erscheinungsjahr, aufnahmejahr });
    }
  }

  if (!itemListeGefunden || itemAnzahl < LOC_ITEMS_MIN) {
    throw new QuellenFehler("loc-komponenten-items-anzahl");
  }
  if (eintraege.length < LOC_ITEMS_MIN || eintraege.length > LOC_ITEMS_MAX) {
    throw new QuellenFehler("loc-zeilenanzahl");
  }
  const maxJahr = Math.max(...rohProAufnahmejahr.keys());
  if (maxJahr < new Date().getUTCFullYear() - 1) {
    throw new QuellenFehler("loc-jahrgang-fehlt");
  }
  for (let jahr = 1989; jahr <= maxJahr; jahr++) {
    const anzahl = rohProAufnahmejahr.get(jahr) ?? 0;
    if (anzahl < 20 || anzahl > 30) {
      throw new QuellenFehler("loc-jahrgang-unvollstaendig");
    }
  }
  const keys = eintraege.map((eintrag) =>
    `${normalisiereLocTitel(eintrag.titel)}\0${eintrag.erscheinungsjahr}`
  );
  if (new Set(keys).size !== keys.length) {
    throw new QuellenFehler("loc-doppelte-identitaet");
  }
  return eintraege;
}

export function parseLocNfrAntwort(wert: unknown): LocEintrag[] {
  const json = objekt(wert);
  if (!json) throw new QuellenFehler("loc-json-schema");
  const komponenten = json[LOC_COMPONENTS_ITEMS_FELD];
  if (Array.isArray(komponenten)) return parseLocNfrKomponenten(komponenten);
  const markup = json[LOC_LEGACY_MARKUP_FELD];
  if (typeof markup === "string") return parseLocNfrTabelle(markup);
  throw new QuellenFehler("loc-json-schema");
}

export function parseLocNfrTabelle(
  markup: string,
  grenzen: {
    minRows?: number;
    maxRows?: number;
    vollstaendig?: boolean;
    erwartetesLetztesAufnahmejahr?: number;
  } = {},
): LocEintrag[] {
  if (
    typeof markup !== "string" || markup.length > 512 * 1024 ||
    UNGUELTIGE_MARKUP_ZEICHEN.test(markup)
  ) {
    throw new QuellenFehler("loc-markup-ungueltig");
  }
  const tabellen = markup.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
  if (tabellen.length !== 1) throw new QuellenFehler("loc-tabellenanzahl");
  const tabelle = tabellen[0];
  const headerMatch = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(tabelle);
  if (!headerMatch) throw new QuellenFehler("loc-header-fehlt");
  const header = [...headerMatch[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
    .map((match) => ohneTags(match[1]));
  if (header.join("|") !== "Film Title|Year of Release|Year Inducted") {
    throw new QuellenFehler("loc-header-schema");
  }
  const bodyMatch = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(tabelle);
  if (!bodyMatch) throw new QuellenFehler("loc-body-fehlt");
  const zeilen = [...bodyMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const eintraege: LocEintrag[] = [];
  const rohProAufnahmejahr = new Map<number, number>();
  for (const zeile of zeilen) {
    const th = [...zeile[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)];
    const td = [...zeile[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
    if (th.length !== 1 || td.length !== 2) {
      throw new QuellenFehler("loc-zeilen-schema");
    }
    const titel = ohneTags(th[0][1]);
    const jahrText = ohneTags(td[0][1]);
    const aufnahmeText = ohneTags(td[1][1]);
    if (!titel || !/^[0-9]{4}$/.test(aufnahmeText ?? "")) {
      throw new QuellenFehler("loc-jahr-ungueltig");
    }
    const aufnahmejahr = Number(aufnahmeText);
    if (aufnahmejahr < 1989 || aufnahmejahr > new Date().getUTCFullYear()) {
      throw new QuellenFehler("loc-jahr-ungueltig");
    }
    rohProAufnahmejahr.set(
      aufnahmejahr,
      (rohProAufnahmejahr.get(aufnahmejahr) ?? 0) + 1,
    );
    if (!/^[0-9]{4}$/.test(jahrText ?? "")) {
      continue; // Bereiche, Jahrzehnte und leere Erscheinungsjahre sind nicht adressierbar.
    }
    const erscheinungsjahr = Number(jahrText);
    if (erscheinungsjahr < 1870 || erscheinungsjahr > 2200) {
      throw new QuellenFehler("loc-jahr-ungueltig");
    }
    eintraege.push({ titel, erscheinungsjahr, aufnahmejahr });
  }
  const minRows = grenzen.minRows ?? 900;
  const maxRows = grenzen.maxRows ?? 1_200;
  if (zeilen.length < minRows || zeilen.length > maxRows) {
    throw new QuellenFehler("loc-zeilenanzahl");
  }
  const keys = eintraege.map((e) => `${normalisiereLocTitel(e.titel)}\0${e.erscheinungsjahr}`);
  if (new Set(keys).size !== keys.length) {
    throw new QuellenFehler("loc-doppelte-identitaet");
  }
  if (grenzen.vollstaendig !== false) {
    const maxJahr = Math.max(...rohProAufnahmejahr.keys());
    const erwartet = grenzen.erwartetesLetztesAufnahmejahr ??
      new Date().getUTCFullYear() - 1;
    if (maxJahr < erwartet) throw new QuellenFehler("loc-jahrgang-fehlt");
    for (let jahr = 1989; jahr <= maxJahr; jahr++) {
      if (rohProAufnahmejahr.get(jahr) !== 25) {
        throw new QuellenFehler("loc-jahrgang-unvollstaendig");
      }
    }
  }
  return eintraege;
}

export function normalisiereLocTitel(titel: string): string {
  let text = titel.normalize("NFKC").replace(/\u00A0/g, " ").replace(
    /[’‘]/g,
    "'",
  )
    .replace(/\s+/g, " ").trim();
  const inversion = /^(.*), (The|A|An)$/.exec(text);
  if (inversion) text = `${inversion[2]} ${inversion[1]}`;
  return text.toLocaleLowerCase("en-US");
}

export function pruefeLocNfrSnapshot(wert: unknown): LocNfrSnapshot {
  const snapshot = objekt(wert);
  if (
    !snapshot || !Array.isArray(snapshot.eintraege) ||
    snapshot.adapterVersion !== LOC_NFR_ADAPTER_VERSION ||
    typeof snapshot.abgerufenAm !== "string" ||
    !Number.isFinite(Date.parse(snapshot.abgerufenAm)) ||
    typeof snapshot.abrufSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(snapshot.abrufSha256) ||
    !(snapshot.etag === null || typeof snapshot.etag === "string") ||
    snapshot.eintraege.length < 900 || snapshot.eintraege.length > 1_200
  ) {
    throw new QuellenFehler("loc-snapshot-schema");
  }
  const eintraege: LocEintrag[] = [];
  const identitaeten = new Set<string>();
  for (const roh of snapshot.eintraege) {
    const eintrag = objekt(roh);
    if (
      !eintrag || Object.keys(eintrag).sort().join(",") !==
        "aufnahmejahr,erscheinungsjahr,titel"
    ) {
      throw new QuellenFehler("loc-snapshot-eintrag");
    }
    const titel = normalisiereText(eintrag.titel, 300);
    const erscheinungsjahr = eintrag.erscheinungsjahr;
    const aufnahmejahr = eintrag.aufnahmejahr;
    if (
      !titel || !Number.isInteger(erscheinungsjahr) ||
      Number(erscheinungsjahr) < 1870 || Number(erscheinungsjahr) > 2200 ||
      !Number.isInteger(aufnahmejahr) ||
      Number(aufnahmejahr) < 1989 ||
      Number(aufnahmejahr) > new Date().getUTCFullYear()
    ) {
      throw new QuellenFehler("loc-snapshot-eintrag");
    }
    const key = `${normalisiereLocTitel(titel)}\0${erscheinungsjahr}`;
    if (identitaeten.has(key)) throw new QuellenFehler("loc-snapshot-doppelt");
    identitaeten.add(key);
    eintraege.push({
      titel,
      erscheinungsjahr: Number(erscheinungsjahr),
      aufnahmejahr: Number(aufnahmejahr),
    });
  }
  const maxJahr = Math.max(...eintraege.map((e) => e.aufnahmejahr));
  if (maxJahr < new Date().getUTCFullYear() - 1) {
    throw new QuellenFehler("loc-snapshot-jahrgang-fehlt");
  }
  return {
    adapterVersion: LOC_NFR_ADAPTER_VERSION,
    eintraege,
    abgerufenAm: snapshot.abgerufenAm,
    abrufSha256: snapshot.abrufSha256,
    etag: snapshot.etag,
  };
}

export function findeLocNfrEintrag(
  eintraege: LocEintrag[],
  identitaet: WikidataErgebnis["identitaet"],
): LocEintrag | null {
  if (identitaet.typ !== "film" || identitaet.erscheinungsjahre.length !== 1) {
    throw new QuellenFehler("loc-identitaet-ungeeignet");
  }
  const jahr = identitaet.erscheinungsjahre[0];
  const titel = new Set(identitaet.titelAliase.map(normalisiereLocTitel));
  const treffer = eintraege.filter((e) => e.erscheinungsjahr === jahr && titel.has(normalisiereLocTitel(e.titel)));
  if (treffer.length > 1) throw new QuellenFehler("loc-treffer-mehrdeutig");
  return treffer[0] ?? null;
}

export async function holeLocNfrSnapshot(
  optionen: AbrufOptionen = {},
): Promise<LocNfrSnapshot> {
  const abruf = await holeJson(LOC_NFR_URL, LOC_NFR_URL, LOC_ANTWORT_MAX_BYTES, {
    "Accept": "application/json",
    "User-Agent": "KinodreieckFilmwissenBot/1.0",
  }, optionen);
  const eintraege = parseLocNfrAntwort(abruf.json);
  return pruefeLocNfrSnapshot({
    adapterVersion: LOC_NFR_ADAPTER_VERSION,
    eintraege,
    abgerufenAm: (optionen.now ?? (() => new Date()))().toISOString(),
    abrufSha256: await sha256([abruf.bytes]),
    etag: abruf.etag,
  });
}

export function fundstelleAusLocNfrSnapshot(
  identitaet: WikidataErgebnis["identitaet"],
  rohSnapshot: unknown,
): AdapterFundstelle | null {
  const snapshot = pruefeLocNfrSnapshot(rohSnapshot);
  const eintraege = snapshot.eintraege;
  const treffer = findeLocNfrEintrag(eintraege, identitaet);
  if (!treffer) return null;
  return {
    id: "F2",
    quelle: "loc-nfr",
    domain: "www.loc.gov",
    belegklasse: "institutionell",
    ursprung: "loc-national-film-registry",
    url: LOC_NFR_URL,
    titel: `Library of Congress: Complete National Film Registry Listing — ${treffer.titel}`,
    veroeffentlichtAm: null,
    kernaussagen: [
      `${treffer.titel} (${treffer.erscheinungsjahr}) wurde ${treffer.aufnahmejahr} in das National Film Registry aufgenommen.`,
      "Die Aufnahme kennzeichnet ein Werk von kultureller, historischer oder ästhetischer Bedeutung und dauerhafter Relevanz; das konkrete Kriterium wird nicht einzeln ausgewiesen.",
    ],
    abgerufenAm: snapshot.abgerufenAm,
    abrufSha256: snapshot.abrufSha256,
    adapterVersion: snapshot.adapterVersion,
    lizenz: "US-federal-facts-only",
    etag: snapshot.etag,
  };
}

export async function holeLocNfrFundstelle(
  identitaet: WikidataErgebnis["identitaet"],
  optionen: AbrufOptionen = {},
): Promise<AdapterFundstelle | null> {
  return fundstelleAusLocNfrSnapshot(
    identitaet,
    await holeLocNfrSnapshot(optionen),
  );
}

export function fundstellenFuerSynthese(
  wikidata: WikidataErgebnis,
  loc: AdapterFundstelle | null,
): Fundstelle[] {
  return loc
    ? [wikidata.fundstelle, loc].map((f) => ({
      id: f.id,
      quelle: f.quelle,
      domain: f.domain,
      belegklasse: f.belegklasse,
      ursprung: f.ursprung,
      titel: f.titel,
      veroeffentlichtAm: f.veroeffentlichtAm,
      kernaussagen: f.kernaussagen,
    }))
    : [wikidata.fundstelle];
}

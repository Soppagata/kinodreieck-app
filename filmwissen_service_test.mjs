import { FILMWISSEN_STATUS, dekodiereFilmwissen, filmwissenKennungen, normalisiereFilmkennung } from "./src/lib/filmwissen.js";
import { createFilmwissenTransport } from "./src/lib/filmwissenTransport.js";
import { createFilmwissenService } from "./src/services/filmwissen.js";
let ok = 0; const fehler = [];
async function check(name, fn) { try { if (!await fn()) throw new Error("falsch"); ok++; console.log("✓ " + name); } catch (e) { fehler.push(name); console.error("✗ " + name + ": " + e.message); } }
function authDoppel(id = "konto-a") {
  const aktiv = (kontoId, capabilities = { remoteStorage: true, personalAi: true }) => ({
    mode: "account", state: "ready", account: { id: kontoId }, capabilities,
  });
  let snapshot = aktiv(id); const listener = new Set(); const required = [];
  const emit = () => listener.forEach((fn) => fn(snapshot));
  return { getSnapshot: () => snapshot, required,
    requireAccount(capability = null) {
      required.push(capability);
      if (snapshot.mode !== "account" || snapshot.state !== "ready") {
        throw Object.assign(new Error("unauthenticated"), { code: "unauthenticated" });
      }
      if (capability && snapshot.capabilities?.[capability] !== true) {
        throw Object.assign(new Error("forbidden"), { code: "forbidden", reason: capability });
      }
      return snapshot;
    },
    subscribe(fn) { listener.add(fn); return () => listener.delete(fn); },
    wechsel(neu) { snapshot = neu ? aktiv(neu) : { mode: "guest", state: "ready", capabilities: {} }; emit(); },
    setCapabilities(capabilities) { snapshot = aktiv(snapshot.account?.id || id, capabilities); emit(); },
  };
}
const bereit = { format: "filmwissen-cache-v1", status: "belegt",
  werk: { id: "11111111-1111-4111-8111-111111111111", typ: "film", titel: "Alien", originaltitel: "Alien", jahr: 1979 },
  version: { id: "22222222-2222-4222-8222-222222222222", nr: 1, schemaVersion: "v1", rubrikVersion: "v1", stand: "2026-07-29T12:00:00Z" },
  warum: { wert: 5, sicherheit: "hoch", kurztext: "Kulturell einflussreicher Science-Fiction-Horror." },
  fundstellen: [{ quelle: "quelle-a", domain: "example.org", titel: "Alien", url: "https://example.org/alien",
    veroeffentlichtAm: null, abgerufenAm: "2026-07-29T12:00:00Z", attribution: "Example", kernaussagen: ["Praegte das Genre nachhaltig."] }] };
await check("Kennungen folgen dem kanonischen DB-Vertrag", () =>
  normalisiereFilmkennung("imdb", "TT0078748") === "tt0078748"
  && normalisiereFilmkennung("tmdb", "000348") === "348"
  && normalisiereFilmkennung("wikidata", "q24871") === "Q24871");
await check("Titel und Jahr sind keine Identitaet", () =>
  filmwissenKennungen({ titel: "Alien", jahr: 1979 }).length === 0
  && filmwissenKennungen({ imdb_id: "tt0078748", watchmode_id: 42 }).map((x) => x.namespace).join(",") === "imdb,watchmode");
await check("Gueltige Antworten sind tief eingefroren", () => {
  const x = dekodiereFilmwissen(bereit); return x.status === "belegt" && Object.isFrozen(x.fundstellen[0]);
});
await check("Widerspruch und HTTP-URL werden abgewiesen", () => {
  let a = false; let b = false;
  try { dekodiereFilmwissen({ ...bereit, status: "nicht_belegt" }); } catch { a = true; }
  try { dekodiereFilmwissen({ ...bereit, fundstellen: [{ ...bereit.fundstellen[0], url: "http://evil.test" }] }); } catch { b = true; }
  return a && b;
});
await check("Transport sendet nur Kennung an die feste RPC", async () => {
  let req; const t = createFilmwissenTransport({
    config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_test" },
    getAccessToken: async () => "TOKEN", fetchImpl: async (url, options) => {
      req = { url, options }; return { ok: true, status: 200, json: async () => ({ format: "filmwissen-cache-v1", status: "cache_miss" }) };
    } });
  await t({ namespace: "imdb", kennung: "tt0078748" }); const body = JSON.parse(req.options.body);
  return req.url.endsWith("/rpc/kd_filmwissen_aktuell_lesen") && req.options.headers.Authorization === "Bearer TOKEN"
    && Object.keys(body).sort().join(",") === "p_kennung,p_namespace";
});
await check("Cache-Miss faellt auf die naechste starke ID zurueck", async () => {
  const auth = authDoppel(); const rufe = []; const s = createFilmwissenService({ auth, transport: async (id) => {
    rufe.push(id.namespace); return { ok: true, data: id.namespace === "imdb" ? { format: "filmwissen-cache-v1", status: "cache_miss" } : bereit };
  } });
  return (await s.read({ imdb_id: "tt0078748", watchmode_id: 42 })).status === "belegt"
    && rufe.join(",") === "imdb,watchmode" && auth.required[0] === "remoteStorage";
});
await check("Parallele Reads werden dedupliziert", async () => {
  let rufe = 0; let resolve; const s = createFilmwissenService({ auth: authDoppel(), transport: () => { rufe++; return new Promise((r) => { resolve = r; }); } });
  const a = s.read({ imdb_id: "tt0078748" }); const b = s.read({ imdb_id: "tt0078748" });
  resolve({ ok: true, data: { format: "filmwissen-cache-v1", status: "cache_miss" } });
  return (await a).status === "cache_miss" && (await b).status === "cache_miss" && rufe === 1;
});
await check("Kontowechsel entwertet laufende Antworten", async () => {
  const auth = authDoppel(); let resolve; const s = createFilmwissenService({ auth, transport: () => new Promise((r) => { resolve = r; }) });
  const lauf = s.read({ imdb_id: "tt0078748" }); auth.wechsel("konto-b"); resolve({ ok: true, data: bereit });
  return (await lauf).status === FILMWISSEN_STATUS.VERALTET;
});
await check("Inaktive oder alte Session liest kein Filmwissen und startet keinen Transport", async () => {
  const auth = authDoppel(); let rufe = 0;
  auth.setCapabilities({ remoteStorage: false, personalAi: false });
  const s = createFilmwissenService({ auth, transport: async () => { rufe++; } });
  let error = null;
  try { await s.read({ imdb_id: "tt0078748" }); } catch (e) { error = e; }
  return error?.code === "forbidden" && error?.reason === "remoteStorage" && rufe === 0;
});
await check("Widerruf bei gleicher Konto-ID entwertet eine laufende Leseantwort", async () => {
  const auth = authDoppel(); let resolve;
  const s = createFilmwissenService({ auth, transport: () => new Promise((r) => { resolve = r; }) });
  const lauf = s.read({ imdb_id: "tt0078748" });
  auth.setCapabilities({ remoteStorage: false, personalAi: false });
  resolve({ ok: true, data: bereit });
  return (await lauf).status === FILMWISSEN_STATUS.VERALTET;
});
await check("Aktives Konto ohne Personal-AI darf vorhandenes Filmwissen lesen", async () => {
  const auth = authDoppel();
  auth.setCapabilities({ remoteStorage: true, personalAi: false });
  const s = createFilmwissenService({ auth, transport: async () => ({ ok: true, data: bereit }) });
  return (await s.read({ imdb_id: "tt0078748" })).status === "belegt";
});
await check("Ohne starke ID gibt es keinen Netzaufruf", async () => {
  let rufe = 0; const s = createFilmwissenService({ auth: authDoppel(), transport: async () => { rufe++; } });
  return (await s.read({ titel: "Alien", jahr: 1979 })).status === "nicht_zuordenbar" && rufe === 0;
});
await check("Recherche liest zuerst den gemeinsamen Cache und spart bei Treffer die KI", async () => {
  let kiRufe = 0;
  const s = createFilmwissenService({
    auth: authDoppel(),
    transport: async () => ({ ok: true, data: bereit }),
    ai: { runTask: async () => { kiRufe++; } },
  });
  return (await s.recherchiere({ imdb_id: "tt0078748" })).status === "belegt" && kiRufe === 0;
});
await check("Cache-Miss startet genau eine kennungsenge Synthese und liest danach die Version", async () => {
  let liest = 0; const kiRufe = [];
  const s = createFilmwissenService({
    auth: authDoppel(),
    transport: async () => {
      liest++;
      return { ok: true, data: liest === 1
        ? { format: "filmwissen-cache-v1", status: "cache_miss" }
        : bereit };
    },
    ai: { runTask: async (task, payload) => {
      kiRufe.push({ task, payload });
      return { ok: true, data: { status: "belegt", versionId: bereit.version.id } };
    } },
  });
  const ergebnis = await s.recherchiere({ imdb_id: "TT0078748", titel: "wird nicht gesendet" });
  return ergebnis.status === "belegt" && liest === 2 && kiRufe.length === 1
    && kiRufe[0].task === "filmwissen-synthese"
    && JSON.stringify(kiRufe[0].payload) === JSON.stringify({ namespace: "imdb", kennung: "tt0078748" });
});
await check("Partielle Synthese zeigt den festen Hinweis am belegten Readback", async () => {
  let liest = 0;
  const hinweis = "Die Filmwissen-Antwort war teilweise unvollständig. Nur einzeln belegte Wissensbausteine wurden berücksichtigt.";
  const s = createFilmwissenService({
    auth: authDoppel(),
    transport: async () => ({
      ok: true,
      data: liest++ === 0
        ? { format: "filmwissen-cache-v1", status: "cache_miss" }
        : bereit,
    }),
    ai: { runTask: async () => ({
      ok: true,
      data: { status: "belegt", versionId: bereit.version.id },
      responseMode: "partial",
      displayText: hinweis,
      warnings: ["json-extracted-from-text", "invalid-items-ignored"],
    }) },
  });
  const result = await s.recherchiere({ imdb_id: "tt0078748" });
  return result.status === "belegt" && result.responseMode === "partial"
    && result.displayText === hinweis && liest === 2
    && Object.isFrozen(result.warnings);
});
await check("Degradierter Freitext bleibt unverbindlicher Hinweis ohne Belegt-Readback", async () => {
  let liest = 0;
  const hinweis = "Die Antwort ließ sich nicht sicher als Filmwissen gliedern.";
  const s = createFilmwissenService({
    auth: authDoppel(),
    transport: async () => {
      liest++;
      return { ok: true, data: { format: "filmwissen-cache-v1", status: "cache_miss" } };
    },
    ai: { runTask: async () => ({
      ok: true,
      data: null,
      responseMode: "degraded",
      displayText: hinweis,
      warnings: ["unstructured-provider-text"],
    }) },
  });
  const result = await s.recherchiere({ imdb_id: "tt0078748" });
  return result.status === "nicht_belegt" && result.responseMode === "degraded"
    && result.displayText === hinweis && liest === 1;
});
await check("Sichere, aber nicht publizierbare Claims bleiben ungespeicherte Vorschauitems", async () => {
  let liest = 0;
  const hinweis = "Nur sichere Einzelclaims werden als unverbindliche Vorschau angezeigt.";
  const s = createFilmwissenService({
    auth: authDoppel(),
    transport: async () => {
      liest++;
      return { ok: true, data: { format: "filmwissen-cache-v1", status: "cache_miss" } };
    },
    ai: { runTask: async () => ({
      ok: true,
      data: {
        format: "filmwissen-entwurf-v1",
        status: "entwurf",
        claims: [
          { aussage: "Erstveröffentlichung: 1979.", quelle: "wikidata", titel: "Wikidata: Alien", url: "https://www.wikidata.org/wiki/Q103569" },
          { aussage: "Aufnahme in das National Film Registry.", quelle: "loc-nfr", titel: "Library of Congress: Alien", url: "https://www.loc.gov/alien" },
        ],
      },
      responseMode: "partial",
      displayText: hinweis,
      warnings: ["invalid-fields-ignored"],
    }) },
  });
  const result = await s.recherchiere({ imdb_id: "tt0078748" });
  return result.status === "entwurf" && result.claims.length === 2
    && result.displayText === hinweis && liest === 1
    && Object.isFrozen(result.claims[0]);
});
await check("Noch nicht zugeordnete starke ID darf den ersten Bericht anlegen", async () => {
  let liest = 0; let kiRufe = 0;
  const s = createFilmwissenService({
    auth: authDoppel(),
    transport: async () => ({
      ok: true,
      data: liest++ === 0
        ? { format: "filmwissen-cache-v1", status: "cache_miss" }
        : bereit,
    }),
    ai: { runTask: async () => {
      kiRufe++;
      return { ok: true, data: { status: "belegt", versionId: bereit.version.id } };
    } },
  });
  return (await s.recherchiere({ imdb_id: "tt0078748" })).status === "belegt"
    && kiRufe === 1;
});
await check("Parallele Recherchen werden bis zum Abschluss dedupliziert", async () => {
  let kiRufe = 0; let loese;
  const s = createFilmwissenService({
    auth: authDoppel(),
    transport: async () => ({ ok: true, data: { format: "filmwissen-cache-v1", status: "cache_miss" } }),
    ai: { runTask: () => {
      kiRufe++;
      return new Promise((resolve) => { loese = resolve; });
    } },
  });
  const a = s.recherchiere({ imdb_id: "tt0078748" });
  const b = s.recherchiere({ imdb_id: "tt0078748" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  loese({ ok: true, data: { status: "nicht_belegt" } });
  return (await a).status === "nicht_belegt" && (await b).status === "nicht_belegt" && kiRufe === 1;
});
await check("Personal-AI-Widerruf während der Recherche verwirft den alten KI-Erfolg", async () => {
  const auth = authDoppel(); let loese; let liest = 0;
  const s = createFilmwissenService({
    auth,
    transport: async () => ({
      ok: true,
      data: liest++ === 0 ? { format: "filmwissen-cache-v1", status: "cache_miss" } : bereit,
    }),
    ai: { runTask: () => new Promise((resolve) => { loese = resolve; }) },
  });
  const lauf = s.recherchiere({ imdb_id: "tt0078748" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  auth.setCapabilities({ remoteStorage: true, personalAi: false });
  loese({ ok: true, data: { status: "belegt", versionId: bereit.version.id } });
  return (await lauf).status === FILMWISSEN_STATUS.VERALTET && liest === 1;
});
await check("Watchmode allein darf keine Quellenrecherche ausloesen", async () => {
  let kiRufe = 0; let reads = 0;
  const s = createFilmwissenService({
    auth: authDoppel(),
    transport: async () => { reads++; },
    ai: { runTask: async () => { kiRufe++; } },
  });
  return (await s.recherchiere({ watchmode_id: "42" })).status === "nicht_zuordenbar"
    && kiRufe === 0 && reads === 0;
});
console.log(`\n${ok}/${ok + fehler.length} Filmwissen-Service-Checks bestanden.`);
if (fehler.length) process.exit(1);

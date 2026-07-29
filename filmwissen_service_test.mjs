import { FILMWISSEN_STATUS, dekodiereFilmwissen, filmwissenKennungen, normalisiereFilmkennung } from "./src/lib/filmwissen.js";
import { createFilmwissenTransport } from "./src/lib/filmwissenTransport.js";
import { createFilmwissenService } from "./src/services/filmwissen.js";
let ok = 0; const fehler = [];
async function check(name, fn) { try { if (!await fn()) throw new Error("falsch"); ok++; console.log("✓ " + name); } catch (e) { fehler.push(name); console.error("✗ " + name + ": " + e.message); } }
function authDoppel(id = "konto-a") {
  let snapshot = { mode: "account", state: "ready", account: { id } }; const listener = new Set();
  return { getSnapshot: () => snapshot, requireAccount: () => snapshot,
    subscribe(fn) { listener.add(fn); return () => listener.delete(fn); },
    wechsel(neu) { snapshot = neu ? { mode: "account", state: "ready", account: { id: neu } } : { mode: "guest", state: "ready" }; listener.forEach((fn) => fn(snapshot)); } };
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
  const rufe = []; const s = createFilmwissenService({ auth: authDoppel(), transport: async (id) => {
    rufe.push(id.namespace); return { ok: true, data: id.namespace === "imdb" ? { format: "filmwissen-cache-v1", status: "cache_miss" } : bereit };
  } });
  return (await s.read({ imdb_id: "tt0078748", watchmode_id: 42 })).status === "belegt" && rufe.join(",") === "imdb,watchmode";
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
await check("Ohne starke ID gibt es keinen Netzaufruf", async () => {
  let rufe = 0; const s = createFilmwissenService({ auth: authDoppel(), transport: async () => { rufe++; } });
  return (await s.read({ titel: "Alien", jahr: 1979 })).status === "nicht_zuordenbar" && rufe === 0;
});
console.log(`\n${ok}/${ok + fehler.length} Filmwissen-Service-Checks bestanden.`);
if (fehler.length) process.exit(1);

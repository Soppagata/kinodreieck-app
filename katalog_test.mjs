import { baueStreamingAnsichten, getKatalogZugang, setKatalogZugang, testeKatalogZugang } from "./src/lib/katalog.js";

const map = new Map();
globalThis.localStorage = {
  getItem: (k) => map.has(k) ? map.get(k) : null,
  setItem: (k, v) => map.set(k, String(v)),
  removeItem: (k) => map.delete(k),
};
let fetchCalls = [];
globalThis.fetch = async (url, opts = {}) => {
  fetchCalls.push({ url: String(url), headers: opts.headers || {} });
  return {
    ok: true, status: 200,
    json: async () => [{ payload: { stand: "2026-07-22T12:00:00Z" }, updated_at: "2026-07-22T12:00:00Z" }],
  };
};

let ok = 0;
const check = (name, wert) => { if (!wert) throw new Error("Fehlgeschlagen: " + name); ok++; console.log("✓ " + name); };
const publishable = "sb_publishable_katalogtest";
setKatalogZugang({ url: "https://test.supabase.co/", key: " " + publishable + " " });
const cfg = getKatalogZugang();
check("Zugang normalisiert URL und Schlüssel", cfg.url === "https://test.supabase.co" && cfg.key === publishable);
check("Manifest-Verbindung funktioniert", (await testeKatalogZugang()).ok === true);
check("Publishable-Key wird als apikey gesendet", fetchCalls.at(-1)?.headers?.apikey === publishable);
check("Publishable-Key wird nicht als Bearer gesendet", !fetchCalls.at(-1)?.headers?.Authorization);

const jwt = "eyJ" + "x".repeat(40);
setKatalogZugang({ key: jwt });
fetchCalls = [];
check("JWT-Katalogzugang funktioniert weiterhin", (await testeKatalogZugang()).ok === true);
check("JWT-Key wird als apikey und Bearer gesendet",
  fetchCalls.at(-1)?.headers?.apikey === jwt && fetchCalls.at(-1)?.headers?.Authorization === "Bearer " + jwt);

const ansichten = baueStreamingAnsichten({
  bekannt: { stand: "x", dienste: ["Netflix"], titel: [{ watchmode_id: 1, titel: "Alien", jahr: 1979, dienste: ["Netflix"] }] },
  entdecken: { stand: "x", dienste: ["Netflix"], titel: [{ watchmode_id: 2, titel: "Arrival", jahr: 2016, dienste: ["Netflix"] }] },
}, [{ id: "alien_1979", titel: "Alien", jahr: 1979, bewertung: { wie: 5, was: 5, warum: 5 } }]);
check("aktiver Master wird lokal zu Mein Programm gematcht", ansichten.bekannt.titel.length === 1 && ansichten.bekannt.titel[0].id === "alien_1979");
check("übriger Titel bleibt in Entdecken", ansichten.entdecken.titel.length === 1 && ansichten.entdecken.titel[0].titel === "Arrival");
console.log(`\n${ok} Checks bestanden.`);

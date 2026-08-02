import {
  buildMetaFehler,
  demoKatalogFehler,
  serviceWorkerBuildFehler,
  serviceWorkerRevalidiert,
} from "./deployment_contract.mjs";

const basis = String(process.env.APP_URL || process.argv[2] || "").replace(/\/+$/, "");
if (!basis.startsWith("https://")) throw new Error("APP_URL muss eine HTTPS-URL sein.");
const erwarteteVersion = String(process.env.EXPECTED_BUILD_VERSION || "").trim();
const domainRetry = process.env.SMOKE_RETRY_BUILD_META === "1";

async function hole(pfad, erwarteterTyp) {
  const url = basis + pfad;
  const res = await fetch(url, { redirect: "follow", headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const typ = res.headers.get("content-type") || "";
  if (erwarteterTyp && !typ.includes(erwarteterTyp)) throw new Error(`${url}: unerwarteter Content-Type ${typ}`);
  return res;
}

const start = await hole("/", "text/html");
const csp = start.headers.get("content-security-policy") || "";
for (const direktive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'"]) {
  if (!csp.includes(direktive)) throw new Error(`CSP fehlt oder ist unvollständig: ${direktive}`);
}
if (start.headers.get("x-content-type-options") !== "nosniff") throw new Error("X-Content-Type-Options fehlt.");
if (start.headers.get("x-frame-options") !== "DENY") throw new Error("X-Frame-Options fehlt.");

await hole("/manifest.webmanifest", "application/manifest+json");
const sw = await hole("/sw.js", "javascript");
const swCache = (sw.headers.get("cache-control") || "").toLowerCase();
const swSharedCache = [
  sw.headers.get("cloudflare-cdn-cache-control"),
  sw.headers.get("cdn-cache-control"),
].filter(Boolean);
if (!serviceWorkerRevalidiert(swCache, swSharedCache)) {
  throw new Error(
    `/sw.js: Browsercache ist nicht kurzlebig (${swCache || "Header fehlt"}). `
    + "Cloudflare muss die _headers-Regel respektieren; sonst bleiben PWA-Updates bis zum TTL-Ablauf liegen.");
}
const ersterSwText = await sw.text();
await hole("/download/", "text/html");

const metaVersuche = domainRetry ? 6 : 1;
let metaFehler = "nicht geprüft";
for (let versuch = 1; versuch <= metaVersuche; versuch++) {
  try {
    const parameter = new URLSearchParams();
    if (erwarteteVersion) parameter.set("expected", erwarteteVersion);
    parameter.set("attempt", String(versuch));
    const metaAntwort = await hole(`/build-meta.json?${parameter}`, "application/json");
    const meta = await metaAntwort.json().catch(() => null);
    metaFehler = buildMetaFehler(meta, erwarteteVersion);
    if (!metaFehler) {
      const swText = versuch === 1
        ? ersterSwText
        : await (await hole(`/sw.js?${parameter}`, "javascript")).text();
      metaFehler = serviceWorkerBuildFehler(swText, erwarteteVersion || meta?.buildVersion);
    }
  } catch (fehler) {
    metaFehler = fehler instanceof Error ? fehler.message : String(fehler);
  }
  if (!metaFehler) break;
  if (versuch < metaVersuche) await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (metaFehler) throw new Error(`Build-Auslieferung: ${metaFehler}.`);

/* --- Katalog-Sichtprüfung als anon ---------------------------------------
   Die Prüfungen oben belegen nur, dass Dateien und Header ausgeliefert werden —
   eine funktional leere App käme damit grün durch. Diese Prüfung fragt den
   Katalog so ab, wie ihn ein nicht angemeldeter Besucher sieht.

   ZENTRAL: PostgREST liefert bei RLS-Filterung HTTP 200 mit LEEREM Array, nie
   einen 403. Geprüft wird deshalb ausschließlich der Zeileninhalt.

   Erwartung seit Etappe 4 (Migration 20260725220000, 25.07.2026):
     manifest                      → muss da sein (sonst ist der Katalog tot)
     programm_demo, streaming_demo sowie die zwei getrennten Demo-Streamingteile
       → müssen für den öffentlichen Auftritt da sein
     programm, streaming und die getrennten Live-Streamingteile
       → dürfen für anon NIE sichtbar sein

   Konfiguration über Umgebungsvariablen (keine Werte im Code):
     VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY  (so heißen sie im
     Deploy-Job) oder ersatzweise KD_SB_URL / KD_SB_ANON für Läufe von Hand.
   Fehlt eine davon, wird die Prüfung sichtbar ÜBERSPRUNGEN statt den Deploy
   zu brechen. */

const sbUrl = String(process.env.VITE_SUPABASE_URL || process.env.KD_SB_URL || "").trim().replace(/\/+$/, "");
const sbKey = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.KD_SB_ANON || "").trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(sbUrl) || !sbKey) {
  console.warn("");
  console.warn("!! ÜBERSPRUNGEN: Katalog-Sichtprüfung als anon.");
  console.warn("   Grund: VITE_SUPABASE_URL und/oder VITE_SUPABASE_PUBLISHABLE_KEY sind in diesem");
  console.warn("   Schritt nicht gesetzt (alternativ KD_SB_URL / KD_SB_ANON).");
  console.warn("   Solange das so bleibt, prüft der Smoke-Test NUR Auslieferung und Header —");
  console.warn("   eine funktional leere App käme grün durch.");
  console.warn("");
} else {
  const kopf = { apikey: sbKey, "Cache-Control": "no-cache" };
  if (/^eyJ/.test(sbKey)) kopf.Authorization = "Bearer " + sbKey;

  const res = await fetch(`${sbUrl}/rest/v1/kd_catalog?select=name&order=name`, { headers: kopf });
  if (!res.ok) {
    // Kein Key/keine URL im Text: nur Status und Fehlercode der Datenbank.
    const rohtext = await res.text().catch(() => "");
    const code = (rohtext.match(/"code"\s*:\s*"([^"]{0,20})"/) || [])[1] || "-";
    throw new Error(`Katalog-Sichtprüfung: kd_catalog nicht abrufbar (HTTP ${res.status}, Code ${code}).`);
  }

  const daten = await res.json().catch(() => null);
  if (!Array.isArray(daten)) throw new Error("Katalog-Sichtprüfung: unerwartete Antwortform von kd_catalog.");
  const sichtbar = daten.map((zeile) => zeile?.name).filter(Boolean);

  // Harter Fehlschlag: die Rechte-Regression, gegen die Etappe 4 gebaut wurde.
  const geleakt = ["programm", "streaming", "streaming_bekannt", "streaming_entdecken"]
    .filter((name) => sichtbar.includes(name));
  if (geleakt.length) {
    throw new Error(
      `Katalog-Sichtprüfung FEHLGESCHLAGEN: anon sieht Live-Zeilen ${geleakt.join(", ")}. `
      + "Der getrennte Lesezugriff aus Migration 20260725220000 ist nicht (mehr) aktiv.");
  }

  // Harter Fehlschlag: ohne manifest ist der Katalog für Besucher tot.
  if (!sichtbar.includes("manifest")) {
    throw new Error(
      `Katalog-Sichtprüfung FEHLGESCHLAGEN: anon sieht die Zeile manifest nicht (sichtbar: ${sichtbar.join(", ") || "nichts"}).`);
  }

  // Etappe 9a: Ohne beide Demo-Zeilen wäre der öffentliche Einstieg funktional leer.
  const demoFehler = demoKatalogFehler(sichtbar);
  if (demoFehler) {
    throw new Error(
      `Katalog-Sichtprüfung FEHLGESCHLAGEN: ${demoFehler}. `
      + "Der öffentliche Einstieg darf nicht ohne Programm- und Streaming-Demo ausgeliefert werden.");
  }

  console.log(`Katalog-Sichtprüfung als anon bestanden (sichtbar: ${sichtbar.join(", ")}).`);
}

console.log(`HTTPS-Smoke-Test und Sicherheitsheader bestanden: ${basis}`);

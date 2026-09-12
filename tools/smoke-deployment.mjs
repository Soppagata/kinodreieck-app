import {
  buildMetaFehler,
  gebundeneShellBundlePfade,
  privateReleaseAnonKatalogFehler,
  privateReleaseLoginFehler,
  serviceWorkerBuildFehler,
  serviceWorkerPrecacheFehler,
  serviceWorkerRevalidiert,
} from "./deployment_contract.mjs";

const basis = String(process.env.APP_URL || process.argv[2] || "").replace(/\/+$/, "");
if (!basis.startsWith("https://")) throw new Error("APP_URL muss eine HTTPS-URL sein.");
const erwarteteVersion = String(process.env.EXPECTED_BUILD_VERSION || "").trim();
const erwarteteUmgebung = String(process.env.DEPLOY_TARGET || "").trim();
if (erwarteteUmgebung && !["staging", "production"].includes(erwarteteUmgebung)) {
  throw new Error("DEPLOY_TARGET muss staging oder production sein.");
}
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
await start.text();

await hole("/manifest.webmanifest", "application/manifest+json");
await hole("/download/", "text/html");

// Eine feste Cloudflare-Custom-Domain kann dem bereits grünen atomaren
// Deployment deutlich später folgen. 23 Pausen à fünf Sekunden decken die
// belegte Latenz von mehr als 55 Sekunden ab, ohne eine Prüfung abzuschwächen.
const metaVersuche = domainRetry ? 24 : 1;
let metaFehler = "nicht geprüft";
for (let versuch = 1; versuch <= metaVersuche; versuch++) {
  try {
    const parameter = new URLSearchParams();
    if (erwarteteVersion) parameter.set("expected", erwarteteVersion);
    parameter.set("attempt", String(versuch));
    const metaAntwort = await hole(`/build-meta.json?${parameter}`, "application/json");
    const meta = await metaAntwort.json().catch(() => null);
    metaFehler = buildMetaFehler(meta, erwarteteVersion);
    if (!metaFehler && erwarteteUmgebung) {
      metaFehler = buildMetaFehler(meta, erwarteteVersion, erwarteteUmgebung);
    }
    if (!metaFehler) {
      const swAntwort = await hole(`/sw.js?${parameter}`, "javascript");
      const swCache = (swAntwort.headers.get("cache-control") || "").toLowerCase();
      const swSharedCache = [
        swAntwort.headers.get("cloudflare-cdn-cache-control"),
        swAntwort.headers.get("cdn-cache-control"),
      ].filter(Boolean);
      if (!serviceWorkerRevalidiert(swCache, swSharedCache)) {
        throw new Error(
          `/sw.js: Browsercache ist nicht kurzlebig (${swCache || "Header fehlt"}). `
          + "Cloudflare muss die _headers-Regel respektieren; sonst bleiben PWA-Updates bis zum TTL-Ablauf liegen.");
      }
      const swText = await swAntwort.text();
      metaFehler = serviceWorkerBuildFehler(swText, erwarteteVersion || meta?.buildVersion);
      if (!metaFehler) {
        const loginStartText = await (await hole(`/?${parameter}`, "text/html")).text();
        const shell = gebundeneShellBundlePfade(loginStartText, basis + "/");
        const precacheFehler = serviceWorkerPrecacheFehler(swText, shell.bundlePfade);
        if (precacheFehler) throw new Error(`Login-Readback: ${precacheFehler}.`);
        const shellBundles = await Promise.all(shell.bundlePfade.map(async (pfad) => (
          await (await hole(pfad, "javascript")).text()
        )));
        const loginFehler = privateReleaseLoginFehler(loginStartText, shellBundles.join("\n"));
        if (loginFehler) throw new Error(`Login-Readback: ${loginFehler}.`);
      }
    }
  } catch (fehler) {
    metaFehler = fehler instanceof Error ? fehler.message : String(fehler);
  }
  if (!metaFehler) break;
  if (versuch < metaVersuche) await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (metaFehler) throw new Error(`Build-Auslieferung: ${metaFehler}.`);

/* Build-Meta, Service Worker, Startseite, Entry-Asset und Minimal-Login wurden
   im selben erfolgreichen Versuch gelesen. Dadurch kann die verzögerte
   Custom-Domain-Propagation keinen gemischten grünen Readback erzeugen. */

/* --- Private Kataloggrenze als anon --------------------------------------
   Build, Service Worker und Minimal-Login werden oben aus der echten
   Auslieferung gelesen. Diese Prüfung fragt zusätzlich den Katalog so ab, wie
   ihn ein nicht angemeldeter Besucher nach der Private-Release-Migration sieht.

   Zulässig sind ausschließlich zwei äquivalente private Zustände:
     - PostgREST/RLS liefert HTTP 200 mit leerem Array;
     - das entzogene Tabellenrecht stoppt mit HTTP 401/403 und SQLSTATE 42501.
   Eine ungültige API-Konfiguration oder irgendeine sichtbare Zeile bleibt rot.

   Erwartung seit der Private-Release-Access-Migration 20260901193000:
     manifest, Demo- und Livezeilen sind sämtlich privat und für anon unsichtbar.

   Konfiguration über Umgebungsvariablen (keine Werte im Code):
     VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY  (so heißen sie im
     Deploy-Job) oder ersatzweise KD_SB_URL / KD_SB_ANON für Läufe von Hand.
   Fehlt eine davon, wird die Prüfung sichtbar ÜBERSPRUNGEN statt den Deploy
   zu brechen; der bereits geprüfte Login-Readback bleibt davon unberührt. */

const sbUrl = String(process.env.VITE_SUPABASE_URL || process.env.KD_SB_URL || "").trim().replace(/\/+$/, "");
const sbKey = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.KD_SB_ANON || "").trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(sbUrl) || !sbKey) {
  console.warn("");
  console.warn("!! ÜBERSPRUNGEN: Katalog-Sichtprüfung als anon.");
  console.warn("   Grund: VITE_SUPABASE_URL und/oder VITE_SUPABASE_PUBLISHABLE_KEY sind in diesem");
  console.warn("   Schritt nicht gesetzt (alternativ KD_SB_URL / KD_SB_ANON).");
  console.warn("   Build, Service Worker und Minimal-Login sind geprüft; die anonyme DB-Grenze nicht.");
  console.warn("");
} else {
  const kopf = { apikey: sbKey, "Cache-Control": "no-cache" };
  if (/^eyJ/.test(sbKey)) kopf.Authorization = "Bearer " + sbKey;

  const res = await fetch(`${sbUrl}/rest/v1/kd_catalog?select=name&order=name`, { headers: kopf });
  let daten = null;
  let code = "";
  if (!res.ok) {
    // Kein Key/keine URL im Text: nur Status und Fehlercode der Datenbank.
    const rohtext = await res.text().catch(() => "");
    code = (rohtext.match(/"code"\s*:\s*"([^"]{0,20})"/) || [])[1] || "";
  } else {
    daten = await res.json().catch(() => null);
  }

  const katalogFehler = privateReleaseAnonKatalogFehler({ status: res.status, code, daten });
  if (katalogFehler) throw new Error(`Private Kataloggrenze FEHLGESCHLAGEN: ${katalogFehler}.`);
  console.log(res.ok
    ? "Private Kataloggrenze als anon bestanden (sichtbar: nichts)."
    : `Private Kataloggrenze als anon bestanden (HTTP ${res.status}, Code ${code}).`);
}

console.log(`HTTPS-Smoke-Test, Build-/SW-/Login-Readback und Sicherheitsheader bestanden: ${basis}`);

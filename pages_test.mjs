/* Hosting-Build-Test für Cloudflare Pages. Prüft relative Pfade, PWA-Dateien,
   Security Header, Download-Ausgabe und Secretfreiheit des fertigen dist/. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildMetaFehler,
  serviceWorkerRevalidiert,
} from "./tools/deployment_contract.mjs";

const DIST = "dist";
const checks = [];
const check = (n, p) => { checks.push([n, p]); console.log((p ? "✓ " : "✗ ") + n); };

const indexHtml = readFileSync(join(DIST, "index.html"), "utf8");
const assets = readdirSync(join(DIST, "assets"));
const jsDatei = assets.find((f) => f.endsWith(".js"));
const cssDatei = assets.find((f) => f.endsWith(".css"));
const js = jsDatei ? readFileSync(join(DIST, "assets", jsDatei), "utf8") : "";
const css = cssDatei ? readFileSync(join(DIST, "assets", cssDatei), "utf8") : "";
const headers = existsSync(join(DIST, "_headers")) ? readFileSync(join(DIST, "_headers"), "utf8") : "";

/* 1) Keine absoluten Pfade — auf Pages zeigt "/x" auf die Domain-Root, nicht die App. */
check("index.html: alle src/href relativ (kein =\"/…\")", !/(?:src|href)="\/(?!\/)/.test(indexHtml));
check("JS-Bundle: kein fetch(\"/…\") (absoluter Datenpfad)", !/fetch\(\s*["']\//.test(js));
check("JS-Bundle: Katalog läuft über Supabase/PostgREST", js.includes("kd_catalog") && js.includes("/rest/v1/"));

/* 2) Fonts: im Web-Build eigene Assets, NICHT ins CSS eingebettet. */
check("CSS: keine eingebetteten Fonts (kein data:font)", !css.includes("data:font"));
check("CSS: referenziert .woff2-Assets", css.includes(".woff2"));
check("assets/: .woff2-Dateien vorhanden", assets.some((f) => f.endsWith(".woff2")));

/* 3) PWA-Dateien im Deploy vorhanden + SW-Regeln aktuell. */
check("dist/sw.js vorhanden", existsSync(join(DIST, "sw.js")));
const sw = existsSync(join(DIST, "sw.js")) ? readFileSync(join(DIST, "sw.js"), "utf8") : "";
check("sw.js: versionierter Cache-Name (v2+)", /kd-shell-v(?!1\b)\d+/.test(sw));
check("sw.js: .json-Datendateien network-first (kein Einfrieren)", sw.includes('endsWith(".json")'));
check("sw.js: gehashte JS-/CSS-App-Shell wird vorab gecacht",
  /PRECACHE[^\n]+assets\/[^"]+\.js/.test(sw) && /PRECACHE[^\n]+assets\/[^"]+\.css/.test(sw));
check("dist/manifest.webmanifest vorhanden", existsSync(join(DIST, "manifest.webmanifest")));
check("index.html: Manifest verlinkt", indexHtml.includes("manifest.webmanifest"));
const manifest = existsSync(join(DIST, "manifest.webmanifest"))
  ? JSON.parse(readFileSync(join(DIST, "manifest.webmanifest"), "utf8")) : {};
check("Manifest: relative Start-URL und Scope", manifest.start_url === "." && manifest.scope === ".");
check("Manifest: 192- und 512-PWA-Icon", [192, 512].every((groesse) =>
  manifest.icons?.some((icon) => icon.sizes === `${groesse}x${groesse}`)
  && existsSync(join(DIST, `icon-${groesse}.png`))));
check("Apple-Touch-Icon vorhanden", existsSync(join(DIST, "icon-180.png")));
const buildMeta = existsSync(join(DIST, "build-meta.json"))
  ? JSON.parse(readFileSync(join(DIST, "build-meta.json"), "utf8")) : {};
check("Build-Metadaten belegen Version und Umgebung für den Domain-Smoke",
  buildMeta.format === 1
  && buildMeta.buildVersion === String(process.env.VITE_BUILD_VERSION || "local").trim()
  && buildMeta.appEnvironment === String(process.env.VITE_APP_ENV || "local").trim());

/* 4) Cloudflare-Sicherheitsregeln und Cache-Disziplin. */
check("Cloudflare _headers vorhanden", Boolean(headers));
for (const wert of [
  "Content-Security-Policy:", "default-src 'self'", "frame-ancestors 'none'",
  "Referrer-Policy:", "X-Content-Type-Options: nosniff",
  "Permissions-Policy:", "X-Frame-Options: DENY",
]) check(`_headers enthält ${wert}`, headers.includes(wert));
check("_headers: gehashte Assets immutable", /\/assets\/\*[\s\S]*?max-age=31536000, immutable/.test(headers));
check("_headers: Service Worker muss revalidieren", /\/sw\.js[\s\S]*?max-age=0, must-revalidate/.test(headers));

const workflow = readFileSync(join(".github", "workflows", "deploy.yml"), "utf8");
check("Staging-Deploys teilen über Push und manuellen Lauf dieselbe Concurrency-Gruppe",
  /deploy-staging:[\s\S]*?concurrency:\s*\n\s+group: kinodreieck-cloudflare-pages-staging/.test(workflow));
check("Production-Deploys teilen über Push und manuellen Lauf dieselbe Concurrency-Gruppe",
  /deploy-production:[\s\S]*?concurrency:\s*\n\s+group: kinodreieck-cloudflare-pages-production/.test(workflow));
check("Feste Domains werden gegen den erwarteten Commit geprüft",
  (workflow.match(/EXPECTED_BUILD_VERSION:\s*\$\{\{\s*github\.sha\s*\}\}/g) || []).length === 2
  && (workflow.match(/SMOKE_RETRY_BUILD_META:\s*"1"/g) || []).length === 2
  && readFileSync(join("tools", "smoke-deployment.mjs"), "utf8")
    .includes("buildMetaFehler(meta, erwarteteVersion)"));
check("Remote-Smoke weist den gemessenen Vier-Stunden-Cache von sw.js zurück",
  !serviceWorkerRevalidiert("public, max-age=14400, must-revalidate")
  && !serviceWorkerRevalidiert("")
  && !serviceWorkerRevalidiert("public, max-age=0, s-maxage=14400, must-revalidate")
  && !serviceWorkerRevalidiert("public, max-age=0", ["public, max-age=14400"])
  && serviceWorkerRevalidiert("public, max-age=0, must-revalidate")
  && serviceWorkerRevalidiert("no-cache")
  && serviceWorkerRevalidiert("no-store"));
check("Remote-Smoke erkennt eine feste Domain mit falschem Commit",
  buildMetaFehler({ format: 1, buildVersion: "alt" }, "neu") !== null
  && buildMetaFehler({ format: 1, buildVersion: "neu" }, "neu") === null);

/* 5) Single-File bleibt ein getrennter Download und wird nicht versehentlich gecacht. */
check("Downloadseite vorhanden", existsSync(join(DIST, "download", "index.html")));
check("Single-File als Download vorhanden", existsSync(join(DIST, "download", "Kinodreieck.html")));
check("Single-File wird als Attachment ausgeliefert", headers.includes('Content-Disposition: attachment; filename="Kinodreieck.html"'));
check("Service Worker umgeht Downloadpfade", sw.includes("(?:api|auth|download)"));

/* 6) Keine hochsicheren Secret-Signaturen im ausgelieferten HTML/JS.
   Der Scan umfasst auch die Download-Einzeldatei — sie wird mit ausgeliefert. */
const downloadHtmlPfad = join(DIST, "download", "Kinodreieck.html");
const downloadHtml = existsSync(downloadHtmlPfad) ? readFileSync(downloadHtmlPfad, "utf8") : "";
const auslieferung = indexHtml + "\n" + js + "\n" + downloadHtml;
const secretMuster = [
  /sb_secret_[a-z0-9_-]+/i,
  /sk-ant-[a-z0-9_-]{16,}/i,
  /sk-proj-[a-z0-9_-]{16,}/i,
  /ghp_[A-Za-z0-9]{30,}/,          // klassischer GitHub-PAT (Legacy-Git-Sync)
  /github_pat_[A-Za-z0-9_]{30,}/,  // fine-grained GitHub-PAT
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /* Etappe 3: ein versehentlich fest eingetragenes Sitzungs- oder Erneuerungstoken.
     Bewusst nur die DREIteilige JWT-Form — die zweiteilige Attrappe aus den
     Testdateien (alte anon-JWTs) soll hier nicht anschlagen, und der
     Publishable-Key (sb_publishable_…) gehört ausdrücklich ins Bundle und
     darf NIE in diese Liste. */
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /* Ein gespeicherter Sitzungsschlüssel MIT Wert (der Schlüsselname allein ist Code). */
  /kd:auth:session["']\s*[,:]\s*["'][A-Za-z0-9._-]{20,}/,
];
check("Browser-Bundle enthält keine bekannte Secret-Signatur",
  !secretMuster.some((muster) => muster.test(auslieferung)));
check("Der öffentliche Publishable-Key bleibt erlaubt (er MUSS im Bundle stehen)",
  !secretMuster.some((muster) => muster.test("sb_publishable_abcdefghijklmnop")));
check("Ein eingebautes Sitzungstoken würde erkannt",
  secretMuster.some((muster) => muster.test("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk")));

/* 7) Keine Personen- oder Rohprogrammdaten im öffentlichen Deploy.
   Programm/Streaming kommen zur Laufzeit aus dem read-only Supabase-Katalog
   (kd_catalog); persönliche Bewertungen gehören nie in dist/. Die früheren
   public/-Rohdateien (programm.json, streaming_bekannt.json,
   streaming_entdecken.json) sind entfernt und dürfen nicht zurückkehren. */
for (const alt of ["programm.json", "streaming_bekannt.json", "streaming_entdecken.json"]) {
  check(`dist/ enthält keine Rohdatendatei ${alt}`, !existsSync(join(DIST, alt)));
}
function alleDateien(ordner) {
  return readdirSync(ordner, { withFileTypes: true }).flatMap((e) => {
    const pfad = join(ordner, e.name);
    return e.isDirectory() ? alleDateien(pfad) : [pfad];
  });
}
const persoenlichMuster = /"bewertet_von"\s*:\s*"max"/;
const persoenlichTreffer = alleDateien(DIST).filter((pfad) =>
  /\.(?:json|js|html|webmanifest|txt|css)$/.test(pfad)
  && persoenlichMuster.test(readFileSync(pfad, "utf8")));
check("dist/ enthält keine persönlichen Bewertungsdaten (bewertet_von: max)",
  persoenlichTreffer.length === 0);
if (persoenlichTreffer.length) console.log("  Treffer: " + persoenlichTreffer.join(", "));

const fails = checks.filter(([, p]) => !p);
console.log(`\n${checks.length - fails.length}/${checks.length} Checks bestanden.`);
console.log(fails.length ? "PAGES-BUILD-TEST: BEFUNDE OBEN" : "PAGES-BUILD-TEST BESTANDEN");
process.exit(fails.length ? 1 : 0);

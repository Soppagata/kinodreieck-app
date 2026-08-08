/* Hosting-Build-Test für Cloudflare Pages. Prüft relative Pfade, PWA-Dateien,
   Security Header, Download-Ausgabe und Secretfreiheit des fertigen dist/. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildMetaFehler,
  demoKatalogFehler,
  serviceWorkerBuildFehler,
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
const downloadSeitePfad = join(DIST, "download", "index.html");
const downloadInstallPfad = join(DIST, "download", "install.js");
const downloadSeite = existsSync(downloadSeitePfad) ? readFileSync(downloadSeitePfad, "utf8") : "";
const downloadInstall = existsSync(downloadInstallPfad) ? readFileSync(downloadInstallPfad, "utf8") : "";
const headerBlock = (pfad) => {
  const escaped = pfad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return headers.match(new RegExp(`^${escaped}\\n(?:^  .+\\n?)*`, "m"))?.[0] || "";
};

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
const erwarteteBuildVersion = String(process.env.VITE_BUILD_VERSION || "local").trim();
check("sw.js: Shell-Cache ist an denselben Build wie die App gebunden",
  serviceWorkerBuildFehler(sw, erwarteteBuildVersion) === null
  && !sw.includes("__KD_BUILD_VERSION__"));
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
check("_headers: aktiver Client darf nur zur eigenen Supabase-Instanz verbinden",
  /connect-src 'self' https:\/\/\*\.supabase\.co/.test(headers)
  && !/api\.github\.com/.test(headers));

const workflow = readFileSync(join(".github", "workflows", "deploy.yml"), "utf8");
const remoteSmoke = readFileSync(join("tools", "smoke-deployment.mjs"), "utf8");
check("CI trennt Suiten und beide Mobile-Browser, behält aber den stabilen Test-Gate-Namen",
  /test-suiten:[\s\S]*?npm test[\s\S]*?npm run test:function/.test(workflow)
  && /test-mobile:[\s\S]*?browser: \[chromium, webkit\]/.test(workflow)
  && /\n  test:\n\s+name: test\n\s+if: \$\{\{ always\(\) \}\}\n\s+needs: \[test-suiten, test-mobile\]/.test(workflow));
check("PR-Tests bleiben erhalten und prüfen weiterhin den Merge-Commit",
  !workflow.includes("github.event.pull_request.head.repo.full_name")
  && !workflow.includes("github.head_ref != 'staging'"));
check("Nur automatische Testläufe verdrängen überholte Läufe",
  (workflow.match(/cancel-in-progress: \$\{\{ github\.event_name != 'workflow_dispatch' \}\}/g) || []).length === 2
  && (workflow.match(/github\.event_name == 'workflow_dispatch' && github\.run_id \|\| github\.ref/g) || []).length === 2);
check("Playwright-Cache ist Lockfile- und Architektur-gebunden und wird immer repariert",
  workflow.includes("runner.arch")
  && workflow.includes("hashFiles('package-lock.json')")
  && /npx playwright install --with-deps \$\{\{ matrix\.browser \}\}/.test(workflow));
check("Der stabile Test-Gate blockiert beide Deploys",
  (workflow.match(/needs: test/g) || []).length === 2
  && workflow.includes('SUITEN_RESULT: ${{ needs.test-suiten.result }}')
  && workflow.includes('MOBILE_RESULT: ${{ needs.test-mobile.result }}'));
check("Deployment-Schreibrecht gilt nur in den beiden Deploy-Jobs",
  !workflow.slice(0, workflow.indexOf("jobs:")).includes("deployments: write")
  && (workflow.match(/deployments: write/g) || []).length === 2);
check("Staging-Deploys teilen über Push und manuellen Lauf dieselbe Concurrency-Gruppe",
  /deploy-staging:[\s\S]*?concurrency:\s*\n\s+group: kinodreieck-cloudflare-pages-staging\n\s+cancel-in-progress: false/.test(workflow));
check("Production-Deploys teilen über Push und manuellen Lauf dieselbe Concurrency-Gruppe",
  /deploy-production:[\s\S]*?concurrency:\s*\n\s+group: kinodreieck-cloudflare-pages-production\n\s+cancel-in-progress: false/.test(workflow));
check("Feste Domains werden gegen den erwarteten Commit geprüft",
  (workflow.match(/EXPECTED_BUILD_VERSION:\s*\$\{\{\s*github\.sha\s*\}\}/g) || []).length === 2
  && (workflow.match(/SMOKE_RETRY_BUILD_META:\s*"1"/g) || []).length === 2
  && remoteSmoke.includes("buildMetaFehler(meta, erwarteteVersion)"));
check("Feste Domains erhalten ein ausreichendes Propagationsfenster",
  remoteSmoke.includes("const metaVersuche = domainRetry ? 12 : 1;")
  && remoteSmoke.includes("setTimeout(resolve, 5000)"));
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
  && buildMetaFehler({ format: 1, buildVersion: "neu" }, "neu") === null
  && serviceWorkerBuildFehler('const BUILD_VERSION = "alt";\nconst CACHE = `kd-shell-v3-${BUILD_VERSION}`;', "neu") !== null
  && serviceWorkerBuildFehler('const BUILD_VERSION = "neu";\nconst CACHE = `kd-shell-v3-${BUILD_VERSION}`;', "neu") === null);
check("Remote-Smoke stoppt ein Release ohne beide öffentlichen Demo-Zeilen",
  demoKatalogFehler(["manifest"])?.includes("programm_demo, streaming_demo")
  && demoKatalogFehler(["manifest", "programm_demo"])?.includes("streaming_demo")
  && demoKatalogFehler([
    "manifest", "programm_demo", "streaming_demo",
    "streaming_bekannt_demo", "streaming_entdecken_demo",
  ]) === null
  && remoteSmoke.includes("const demoFehler = demoKatalogFehler(sichtbar);")
  && remoteSmoke.includes("if (demoFehler) {"));

/* 5) Single-File bleibt ein getrennter Download und wird nicht versehentlich gecacht. */
check("Öffentliche Distributionsseite vorhanden", Boolean(downloadSeite));
check("Single-File als Download vorhanden", existsSync(join(DIST, "download", "Kinodreieck.html")));
check("Single-File wird als Attachment ausgeliefert", headers.includes('Content-Disposition: attachment; filename="Kinodreieck.html"'));
check("Service Worker umgeht Downloadpfade", sw.includes("(?:api|auth|download)"));
check("Distributionsseite darf indexiert werden, nur die Einzeldatei bleibt noindex",
  !/<meta[^>]+noindex/i.test(downloadSeite)
  && !headerBlock("/download/*").includes("X-Robots-Tag:")
  && headerBlock("/download/Kinodreieck.html").includes("X-Robots-Tag: noindex, nofollow"));
check("Demo- und Clean-Einstieg geben keinen fresh-Resetauftrag aus",
  downloadSeite.includes('href="../?start=demo"')
  && downloadSeite.includes('href="../?start=clean"')
  && !/[?&]fresh=/.test(downloadSeite));
check("Distributionsseite erklärt Konto- und Live-KI-Grenze ehrlich",
  /eingeladenes Konto schaltet[\s\S]*?Live-KI frei/.test(downloadSeite)
  && /Settings → Konto &amp; Geräte-Sync/.test(downloadSeite)
  && /unabhängig davon, ob du mit Demo oder leer startest/.test(downloadSeite)
  && !/registrier|konto erstellen|kostenlos anmelden/i.test(downloadSeite));
check("PWA-Installation nutzt Manifest und ein externes, CSP-taugliches Skript",
  downloadSeite.includes('rel="manifest" href="../manifest.webmanifest"')
  && downloadSeite.includes('src="./install.js"')
  && Boolean(downloadInstall)
  && downloadInstall.includes('"beforeinstallprompt"')
  && downloadInstall.includes('navigator.serviceWorker.register("../sw.js", { scope: "../" })'));
check("Distributionsseite eröffnet keinen KI- oder Fremdtransport",
  !/\bfetch\s*\(/.test(downloadInstall)
  && !/(?:src|href)=["']https?:\/\//i.test(downloadSeite)
  && !/ai-task|functions\/v1|anbieter/i.test(downloadSeite + "\n" + downloadInstall));

/* 6) Keine hochsicheren Secret-Signaturen im ausgelieferten HTML/JS.
   Der Scan umfasst auch die Download-Einzeldatei — sie wird mit ausgeliefert. */
const downloadHtmlPfad = join(DIST, "download", "Kinodreieck.html");
const downloadHtml = existsSync(downloadHtmlPfad) ? readFileSync(downloadHtmlPfad, "utf8") : "";
check("Ausgelieferte Einzeldatei enthält Demo-, Kino- und Streaming-Seeds selbst",
  (downloadHtml.match(/data-kd-einzeldatei-seed/g) || []).length === 1
  && downloadHtml.includes("window.__KD_DEMO_SEED__")
  && downloadHtml.includes("Der letzte Vorführer")
  && downloadHtml.includes("Sommer der Kometen")
  && downloadHtml.includes("Der stille Zeuge"));
check("Ausgelieferte Einzeldatei hat keine versteckte Programmdateien-Abhängigkeit",
  !downloadHtml.includes("Programmdateien/System/demo_masterliste.js")
  && !downloadHtml.includes("Programmdateien/System/streaming_entdecken.js"));
check("Einzeldatei bezeichnet den alten Programmstand als Archiv statt als live",
  downloadHtml.includes("Archiviertes synthetisches Offline-Beispiel")
  && downloadHtml.includes("kein aktuelles Kinoprogramm"));
check("Web-Build behält seine bisherigen Sidecar-Kompatibilitätswege getrennt vom Download",
  js.includes("Programmdateien/System/demo_masterliste.js")
  && js.includes("Programmdateien/System/streaming_entdecken.js")
  && existsSync(join(DIST, "Programmdateien", "System", "demo_masterliste.js")));
const auslieferung = indexHtml + "\n" + js + "\n" + downloadHtml
  + "\n" + downloadSeite + "\n" + downloadInstall;
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
/* Die beiden ehemaligen Secret-Schlüsselnamen müssen als reine
   Upgrade-Löschliste im Bundle bleiben: Nur so entfernt ein normaler Boot
   Altinstallationen zuverlässig. Aktiver Legacy-Sync verrät sich dagegen an
   seinen Transport-/Konfigurationsmarkern, die die Cleanup-Liste nicht braucht. */
check("Browser-Bundle enthält keine aktiven Legacy-Sync-Transporte",
  !/api\.github\.com|kd:git:(?:repo|branch|sha|status)|kd:sb:(?:url|anon|owner|ver|status)/
    .test(js + "\n" + downloadHtml));
check("Browser-Bundle liefert die gezielte Legacy-Secret-Bereinigung aus",
  [js, downloadHtml].every((artefakt) => artefakt.includes("kd:git:token")
    && artefakt.includes("kd:sb:key")));
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

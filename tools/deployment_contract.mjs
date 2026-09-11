/* Reine Regeln des Remote-Smokes. Getrennt vom Netzlauf, damit die
   entscheidenden Negativfälle lokal und ohne Deployment prüfbar bleiben. */

export function serviceWorkerRevalidiert(cacheControl, sharedCacheControls = []) {
  const browserDirektiven = String(cacheControl || "")
    .toLowerCase()
    .split(",")
    .map((teil) => teil.trim());
  const browserKurz = browserDirektiven.some((direktive) =>
      direktive === "no-cache"
      || direktive === "no-store"
      || /^max-age\s*=\s*0$/.test(direktive));
  const sharedPositiv = [
    ...browserDirektiven.filter((direktive) => /^s-maxage\s*=/.test(direktive)),
    ...sharedCacheControls.flatMap((wert) =>
      String(wert || "").toLowerCase().split(",").map((teil) => teil.trim())
        .filter((direktive) => /^(?:s-maxage|max-age)\s*=/.test(direktive))),
  ].some((direktive) => {
    const sekunden = Number((direktive.split("=")[1] || "").trim());
    return Number.isFinite(sekunden) && sekunden > 0;
  });
  return browserKurz && !sharedPositiv;
}

export function buildMetaFehler(meta, erwarteteVersion = "", erwarteteUmgebung = "") {
  if (!meta || meta.format !== 1 || typeof meta.buildVersion !== "string" || !meta.buildVersion) {
    return "unerwartete oder unvollständige Build-Metadaten";
  }
  if (erwarteteVersion && meta.buildVersion !== erwarteteVersion) {
    return `Build ${meta.buildVersion}, erwartet war ${erwarteteVersion}`;
  }
  if (erwarteteUmgebung && !["staging", "production"].includes(meta.appEnvironment)) {
    return "unerwartete oder unvollständige Build-Metadaten";
  }
  if (erwarteteUmgebung && meta.appEnvironment !== erwarteteUmgebung) {
    return `Umgebung ${meta.appEnvironment}, erwartet war ${erwarteteUmgebung}`;
  }
  return null;
}

export function serviceWorkerBuildFehler(quelltext, erwarteteVersion = "") {
  const text = String(quelltext || "");
  const treffer = text.match(/const BUILD_VERSION = ("(?:[^"\\]|\\.)*");/);
  if (!treffer) return "Build-Version fehlt im Service Worker";
  let version = "";
  try { version = JSON.parse(treffer[1]); } catch { return "ungültige Build-Version im Service Worker"; }
  if (!version || version === "__KD_BUILD_VERSION__") {
    return "Build-Platzhalter wurde im Service Worker nicht ersetzt";
  }
  if (!text.includes("`kd-shell-v3-${BUILD_VERSION}`")) {
    return "Shell-Cache ist nicht an die Build-Version gebunden";
  }
  if (erwarteteVersion && version !== erwarteteVersion) {
    return `Service Worker ${version}, erwartet war ${erwarteteVersion}`;
  }
  return null;
}

export function serviceWorkerPrecacheFehler(quelltext, bundlePfade = []) {
  const treffer = String(quelltext || "").match(/const PRECACHE = (\[[^\n]+\]);/);
  if (!treffer) return "Service-Worker-PRECACHE fehlt";
  let precache;
  try { precache = JSON.parse(treffer[1]); } catch { return "Service-Worker-PRECACHE ist ungültig"; }
  if (!Array.isArray(precache)) return "Service-Worker-PRECACHE ist ungültig";
  const erwartet = [...new Set(bundlePfade.map((pfad) => String(pfad).replace(/^\//, "")))].sort();
  const vorhanden = [...new Set(precache.filter((pfad) => typeof pfad === "string" && pfad.endsWith(".js")))].sort();
  return JSON.stringify(vorhanden) === JSON.stringify(erwartet)
    ? null
    : `Service-Worker-PRECACHE enthält andere JS-Bundles: ${vorhanden.join(", ") || "keine"}`;
}

export function gebundeneShellBundlePfade(indexHtml, basisUrl) {
  const html = String(indexHtml || "");
  let basis;
  try { basis = new URL(basisUrl); } catch { throw new Error("Shell-Bundles: ungültige Basis-URL."); }

  const attribut = (tag, name) => (
    tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i")) || []
  )[1] || "";
  const tags = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
  const entries = tags
    .filter((tag) => /^<script\b/i.test(tag) && attribut(tag, "type").toLowerCase() === "module")
    .map((tag) => attribut(tag, "src"))
    .filter(Boolean);
  if (entries.length !== 1) {
    throw new Error(`Shell-Bundles: genau ein Modul-Entry erwartet, erhalten: ${entries.length}.`);
  }
  const preloads = tags
    .filter((tag) => /^<link\b/i.test(tag)
      && attribut(tag, "rel").toLowerCase().split(/\s+/).includes("modulepreload"))
    .map((tag) => attribut(tag, "href"))
    .filter(Boolean);
  if (!preloads.length) throw new Error("Shell-Bundles: JS-modulepreload-Assets fehlen.");

  const pfade = [...new Set([...entries, ...preloads].map((referenz) => {
    const url = new URL(referenz, basis);
    if (url.origin !== basis.origin || url.search || url.hash
      || !/^\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{6,}\.js$/.test(url.pathname)) {
      throw new Error(`Shell-Bundles: ungebundenes oder ungehashtes JS-Asset ${referenz}.`);
    }
    return url.pathname;
  }))];
  return { entryPfad: pfade[0], bundlePfade: pfade };
}

export function privateReleaseLoginFehler(indexHtml, bundleText) {
  const html = String(indexHtml || "");
  const bundle = String(bundleText || "");
  if (!/<div\s+id=["']root["']><\/div>/.test(html)) {
    return "React-Einstiegspunkt fehlt in index.html";
  }
  const fehlend = [
    "Benutzername", "Passwort", "Anmelden", "Ohne Konto fortfahren",
    "Datenschutz & Rechtliches", "datenschutz-rechtliches", "kd-entry-login",
  ].filter((anker) => !bundle.includes(anker));
  return fehlend.length
    ? `Minimal-Login fehlt im ausgelieferten Bundle: ${fehlend.join(", ")}`
    : null;
}

export function privateReleaseAnonKatalogFehler({ status, code = "", daten = null } = {}) {
  if ((status === 401 || status === 403) && code === "42501") return null;
  if (status !== 200) {
    return `unerwarteter Katalogstatus HTTP ${status || 0}, Code ${code || "-"}`;
  }
  if (!Array.isArray(daten)) return "unerwartete Antwortform von kd_catalog";
  const sichtbar = daten.map((zeile) => zeile?.name).filter(Boolean);
  return sichtbar.length
    ? `anon sieht private Katalogzeilen: ${sichtbar.join(", ")}`
    : null;
}

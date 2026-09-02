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

export function buildMetaFehler(meta, erwarteteVersion = "") {
  if (!meta || meta.format !== 1 || typeof meta.buildVersion !== "string" || !meta.buildVersion) {
    return "unerwartete oder unvollständige Build-Metadaten";
  }
  if (erwarteteVersion && meta.buildVersion !== erwarteteVersion) {
    return `Build ${meta.buildVersion}, erwartet war ${erwarteteVersion}`;
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

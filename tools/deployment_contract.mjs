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

export function demoKatalogFehler(sichtbar) {
  if (!Array.isArray(sichtbar)) return "unerwartete Katalog-Sicht";
  const fehlend = [
    "programm_demo", "streaming_demo",
    "streaming_bekannt_demo", "streaming_entdecken_demo",
  ]
    .filter((name) => !sichtbar.includes(name));
  return fehlend.length
    ? `Demo-Zeilen fehlen für anon: ${fehlend.join(", ")}`
    : null;
}

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

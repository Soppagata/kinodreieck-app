const ONLINE_UMGEBUNGEN = new Set(["staging", "production"]);

export function pruefbareUmgebung(
  appEnvironment,
  protokoll = globalThis.location?.protocol,
) {
  /* Die heruntergeladene Datei kann mit einer staging-/production-Konfiguration
     gebaut worden sein. Unter file:// gibt es dennoch weder build-meta.json
     noch einen Service Worker — dort nie Timer-/Fokus-Abrufe starten. */
  if (String(protokoll || "").toLowerCase() === "file:") return false;
  return ONLINE_UMGEBUNGEN.has(String(appEnvironment || "").trim());
}

export function buildMetaUrl(baseUrl = "./", zeit = Date.now()) {
  const basis = String(baseUrl || "./");
  return `${basis}build-meta.json?kd-check=${encodeURIComponent(String(zeit))}`;
}

export function neuerBuild(meta, lokaleVersion) {
  const remote = String(meta?.buildVersion || "").trim();
  const lokal = String(lokaleVersion || "").trim();
  if (meta?.format !== 1 || !remote || !lokal || lokal === "dev") return null;
  return remote === lokal ? null : remote;
}

/* Ein geschlossener Hinweis gilt nur für genau diesen Build und nur solange
   die Komponente lebt. Erscheint später ein anderer Build, darf der Nutzer
   wieder darauf hingewiesen werden. */
export function sichtbarerUpdateBuild(version, geschlossenerBuild = "") {
  const kandidat = String(version || "").trim();
  const geschlossen = String(geschlossenerBuild || "").trim();
  return kandidat && kandidat !== geschlossen ? kandidat : "";
}

export async function ladeBuildMeta({
  baseUrl = "./",
  fetchFn = globalThis.fetch,
  zeit = Date.now(),
  protokoll = globalThis.location?.protocol,
} = {}) {
  /* Zweite, fail-safe Grenze: auch ein künftiger direkter Aufrufer darf unter
     file:// keinen scheinbaren Versionsabruf erzeugen. */
  if (String(protokoll || "").toLowerCase() === "file:") return null;
  if (typeof fetchFn !== "function") return null;
  const antwort = await fetchFn(buildMetaUrl(baseUrl, zeit), {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!antwort?.ok) return null;
  const meta = await antwort.json();
  return meta?.format === 1 ? meta : null;
}

export async function aktualisiereServiceWorker({
  serviceWorker = globalThis.navigator?.serviceWorker,
  baseUrl = "./",
} = {}) {
  if (!serviceWorker) return null;
  let registrierung = null;
  try {
    registrierung = await serviceWorker.getRegistration?.(baseUrl);
    await registrierung?.update?.();
  } catch {
    /* Der anschließende Navigation-Reload bleibt auch ohne Service Worker
       wirksam. Updates dürfen nie den normalen App-Betrieb blockieren. */
  }
  return registrierung;
}

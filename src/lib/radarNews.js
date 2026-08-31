/* Read-only display projection. Explicit title markers only; no query matching,
   provider calls, inferred identity or changes to stored findings. */
const SERIES_CATEGORIES = new Set(["series", "season"]);
const MARKER = /\b(?:staffel|season|folge|episode)\s*\d|\bS\d+\s*E\d+/iu;
const VIENNA_DAY = new Intl.DateTimeFormat("en", {
  timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
});

export function radarViennaDay(now = new Date()) {
  const parts = Object.fromEntries(VIENNA_DAY.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function radarEpisodeIdentity(entry) {
  if (!SERIES_CATEGORIES.has(entry.category)
      || entry.targetType === "work" || entry.eventType === "kinostart_at") return null;
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  const match = title.match(/^(.+?)\s*(?:[-–—:,]\s*)?(?:\b(?:Staffel|Season)\s+(\d{1,3})(?:\s*[,\-–—:]?\s*(?:Folge|Episode)\s+(\d{1,4}))?|\bS(\d{1,3})\s*E(\d{1,4}))(?:(?:\s*[:–—-]\s*)(.+))?$/iu);
  if (!match) return null;
  const seriesTitle = match[1].trim().replace(/[\s:–—,-]+$/u, "");
  const seasonNumber = Number(match[2] || match[4]);
  const episodeNumber = match[3] || match[5] ? Number(match[3] || match[5]) : null;
  const episodeTitle = match[6]?.trim() || null;
  if (!seriesTitle || MARKER.test(seriesTitle) || seasonNumber < 1
      || (episodeNumber !== null && episodeNumber < 1)
      || (entry.seasonNumber != null && entry.seasonNumber !== seasonNumber)
      || (episodeTitle && (MARKER.test(episodeTitle) || /^\d|^(?:und|and|bis|to)\b/iu.test(episodeTitle)))
      || (episodeNumber === null && (entry.eventType !== "staffelstart" || episodeTitle))) return null;
  return { seriesTitle, seasonNumber, episodeNumber, episodeTitle,
    key: JSON.stringify([seriesTitle.normalize("NFC").toLowerCase().replace(/\s+/gu, " "), seasonNumber]) };
}

function byDate(a, b) { return `${a.date}|${a.title}`.localeCompare(`${b.date}|${b.title}`, "de-AT"); }
function unanimous(entries, field) {
  const values = new Set(entries.map((entry) => entry[field] || null));
  return values.size === 1 ? [...values][0] : null;
}

export function projectRadarNews(events, today) {
  const singles = [];
  const seasons = new Map();
  for (const event of events || []) {
    if (event.verificationStatus !== "confirmed" || typeof event.title !== "string" || !event.title.trim()) continue;
    const entry = { ...event, title: event.title.trim() };
    const identity = radarEpisodeIdentity(entry);
    if (!identity) { if (entry.date >= today) singles.push(entry); continue; }
    const group = seasons.get(identity.key) || [];
    group.push({ ...entry, ...identity });
    seasons.set(identity.key, group);
  }
  for (const [key, entries] of seasons) {
    // Determine the existing group before filtering: its last upcoming episode
    // stays in the season card without changing or pruning the stored cache.
    const wasGrouped = entries.filter((entry) => entry.episodeNumber !== null).length >= 2;
    const upcoming = entries.filter((entry) => entry.date >= today);
    const episodes = upcoming.filter((entry) => entry.episodeNumber !== null)
      .sort((a, b) => a.episodeNumber - b.episodeNumber || byDate(a, b));
    if (!wasGrouped || !episodes.length) { singles.push(...upcoming); continue; }
    const chronological = [...episodes].sort(byDate);
    const premiere = upcoming.filter((entry) => entry.episodeNumber === null || entry.episodeNumber === 1).sort(byDate)[0];
    const dated = premiere || chronological[0];
    singles.push({ kind: "season", eventVersionId: `season:${key}`,
      title: `${entries[0].seriesTitle} · Staffel ${entries[0].seasonNumber}`,
      date: dated.date, dateLabel: premiere ? "Staffelstart" : "Nächste Folge",
      category: "season", platform: unanimous(upcoming, "platform"), region: unanimous(upcoming, "region"),
      episodes,
    });
  }
  return singles.sort(byDate);
}

export function radarSearchStatusLabel(searchStatuses, targetId) {
  const entry = searchStatuses?.find((status) => status.targetId === targetId);
  if (!entry) return "Suchstatus nicht verfügbar";
  if (entry.status === "never") return "Noch keine Suche";
  const timestamp = new Intl.DateTimeFormat("de-AT", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Vienna",
  }).format(new Date(entry.checkedAt));
  // This can be cached: never promise that a past lease is still running.
  if (entry.status === "searching") return `Suche gestartet ${timestamp}`;
  const label = { confirmed: "Treffer gefunden", no_change: "keine neuen Treffer",
    insufficient_evidence: "keine belegten neuen Treffer", timeout: "Suche nicht abgeschlossen",
    provider_error: "Suche fehlgeschlagen", storage_error: "Ergebnis nicht gespeichert",
    forbidden: "Suche nicht verfügbar", unavailable: "Suche nicht verfügbar" }[entry.status];
  return `Zuletzt gesucht ${timestamp} · ${label}`;
}

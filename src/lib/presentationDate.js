export const PRESENTATION_TIME_ZONE = "Europe/Vienna";
export const PRESENTATION_LOCALE = "de-AT";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function presentationDateValue(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const calendar = raw.match(DATE_ONLY);
  if (calendar) {
    const [, yearRaw, monthRaw, dayRaw] = calendar;
    const year = Number(yearRaw), month = Number(monthRaw), day = Number(dayRaw);
    /* Mittag UTC behaelt das fachliche Kalenderdatum in Europe/Vienna auch
       an Sommerzeitgrenzen. Die Eingabe selbst wird dabei nicht veraendert. */
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day) return null;
    return date;
  }
  const millis = Date.parse(raw);
  return Number.isFinite(millis) ? new Date(millis) : null;
}

const formatOptions = Object.freeze({
  short: Object.freeze({ day: "2-digit", month: "2-digit", year: "numeric" }),
  long: Object.freeze({ day: "numeric", month: "long", year: "numeric" }),
});

const formatterCache = new Map();
function formatter({ format, includeTime, timeZone }) {
  const key = `${format}|${includeTime ? "time" : "date"}|${timeZone}`;
  if (!formatterCache.has(key)) {
    formatterCache.set(key, new Intl.DateTimeFormat(PRESENTATION_LOCALE, {
      ...(formatOptions[format] || formatOptions.short),
      ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
      timeZone,
    }));
  }
  return formatterCache.get(key);
}

/* Nur fuer sichtbare Texte verwenden. Sortierung, Inputs, API- und
   Persistenzwerte behalten weiterhin ihren urspruenglichen ISO-Wert. */
export function formatPresentationDate(value, {
  format = "short",
  includeTime = false,
  timeZone = PRESENTATION_TIME_ZONE,
  fallback = "",
} = {}) {
  const date = presentationDateValue(value);
  if (!date) return fallback;
  try {
    return formatter({ format, includeTime, timeZone }).format(date);
  } catch {
    return fallback;
  }
}

export const formatiereSichtbaresDatum = formatPresentationDate;

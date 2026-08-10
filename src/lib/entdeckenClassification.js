/* Reine Klassifikation für „Neu“, Remake und Kult/Wiederaufführung. */

import { isStableContractId } from "./radarContracts.js";

function text(value) { return String(value == null ? "" : value).trim(); }
function day(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const millis = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === normalized
    ? Math.floor(millis / 86400000)
    : null;
}
function reply(value) { return Object.freeze(value); }

export function classifyNewCandidate(candidate, { today } = {}) {
  const todayDay = day(today);
  const releaseDay = day(candidate?.releaseDate);
  if (todayDay == null || releaseDay == null) return reply({ eligible: false, category: null, label: null, reason: "date-invalid" });
  if (candidate?.region !== "AT" || !["streaming", "cinema"].includes(candidate?.medium)) {
    return reply({ eligible: false, category: null, label: null, reason: "region-or-medium-invalid" });
  }

  const distance = releaseDay - todayDay;
  if (distance < -7 || distance > 90) return reply({ eligible: false, category: null, label: null, reason: "outside-window" });

  const olderWork = Number.isInteger(candidate.workYear)
    && candidate.workYear < Number(text(today).slice(0, 4));
  if (
    candidate.medium === "streaming" && olderWork && candidate.newToService === true
    && text(candidate.service) && distance <= 0 && distance >= -7
  ) {
    return reply({ eligible: true, category: "new_on_service", label: `Neu auf ${text(candidate.service)}`, reason: null });
  }

  if (distance <= 0 && candidate.firstAvailableInSource === true) {
    return reply({ eligible: true, category: "recently_available", label: "Seit kurzem verfügbar", reason: null });
  }

  return reply({
    eligible: distance >= 0,
    category: distance >= 0 ? (candidate.medium === "cinema" ? "upcoming_cinema" : "upcoming_streaming") : null,
    label: distance >= 0 ? (candidate.medium === "cinema" ? "Kommender Kinostart" : "Kommender Streamingstart") : null,
    reason: distance >= 0 ? null : "past-not-first-available",
  });
}

export function classifyRemakeRelation(relation) {
  const basisAllowed = relation?.basis === "structured" && relation?.strength === "strong"
    || relation?.basis === "manual" && relation?.verified === true;
  const year = Number(relation?.originalYear);
  if (
    relation?.type !== "remake_of" || !basisAllowed
    || !isStableContractId(relation.originalTargetId) || !text(relation.originalTitle)
    || !Number.isInteger(year) || year < 1888 || year > 2200
  ) return reply({ isRemake: false, label: null });
  return reply({ isRemake: true, label: `Remake von ${text(relation.originalTitle)} (${year})` });
}

export function classifyCultScreening(screening, { today } = {}) {
  const todayDay = day(today);
  const showingDay = day(screening?.showingDate);
  const reasons = Array.isArray(screening?.fitReasons) ? screening.fitReasons.filter((reason) => text(reason)) : [];
  const eligible = todayDay != null && showingDay != null && showingDay >= todayDay
    && screening?.region === "AT" && screening?.actualShowing === true
    && isStableContractId(screening?.canonicalTargetId) && reasons.length > 0;
  return reply({
    eligible,
    block: eligible ? "cult_and_back_in_cinema" : null,
    label: eligible ? "Kult & wieder im Kino" : null,
    reasons: Object.freeze(reasons.slice(0, 3)),
  });
}

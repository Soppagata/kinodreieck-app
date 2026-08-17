function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function createRadarWebsearchMockAdapter(responses = []) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls = [];
  return Object.freeze({
    calls,
    async search(request) {
      calls.push(clone(request));
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      if (typeof next === "function") return clone(await next(request));
      return clone(next);
    },
  });
}

function uuidFrom(number) {
  return `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
}
function eventIdentity(event) {
  return [event.targetKey, event.eventType, event.region, event.platform, event.seasonNumber || "-"].join("|");
}
function sourceFingerprint(event) {
  return JSON.stringify(event.evidence.map((entry) => [entry.sourceId, entry.url]).sort());
}

/* Kleine persistente In-memory-Doppelung der bereits vorhandenen
   Target/Subscription/Event/Version/Evidence/Feed-Grenze. Nur Mocktests nutzen
   sie; Produktcode erhält weder Fixture-Abo noch simulierte Evidenz. */
export function createRadarWebsearchMemoryRepository({ target, sources = [], accountId = "max-account" } = {}) {
  const events = new Map();
  let nextId = 1;
  const sourceById = new Map(sources.map((source) => [source.sourceId, clone(source)]));
  const targetCopy = clone(target);
  const updatedAt = "2026-08-17T12:00:00.000Z";
  const subscriptions = new Map([[`${accountId}|${targetCopy.targetId}`, { active: true }]]);

  return Object.freeze({
    events,
    async loadAuthorizedTarget(input) {
      if (input.accountId !== accountId || input.targetId !== targetCopy.targetId
          || !subscriptions.get(`${input.accountId}|${input.targetId}`)?.active) return null;
      return clone(targetCopy);
    },
    async resolveSources(domains) {
      return [...sourceById.values()].filter((source) => domains.some((domain) => (
        domain === source.domain || (source.subdomainsAllowed && domain.endsWith(`.${source.domain}`))
      ))).map(clone);
    },
    async upsertConfirmedEvent({ accountId: actor, event }) {
      if (actor !== accountId || !subscriptions.get(`${actor}|${event.targetKey}`)?.active) {
        return { status: "forbidden" };
      }
      const key = eventIdentity(event);
      let stored = events.get(key);
      if (!stored) {
        stored = { eventId: uuidFrom(nextId++), versions: [] };
        events.set(key, stored);
      }
      const previous = stored.versions.at(-1);
      const fingerprint = sourceFingerprint(event);
      if (previous?.date === event.date && previous?.sourceFingerprint === fingerprint) {
        return { status: "no_change", eventId: stored.eventId, eventVersionId: previous.eventVersionId };
      }
      const version = {
        eventVersionId: uuidFrom(nextId++), date: event.date,
        sourceFingerprint: fingerprint, event: clone(event),
      };
      stored.versions.push(version);
      return { status: "confirmed", eventId: stored.eventId, eventVersionId: version.eventVersionId };
    },
    async loadFeed({ accountId: actor }) {
      if (actor !== accountId) return { subscriptions: [], events: [] };
      return {
        subscriptions: [{
          targetId: targetCopy.targetId,
          targetType: targetCopy.mediaType === "series" ? "series" : "work",
          title: targetCopy.canonicalTitle,
          region: "AT", scope: "all", status: "active", updatedAt,
        }],
        events: [...events.values()].map((stored) => {
          const version = stored.versions.at(-1);
          return {
            eventId: stored.eventId,
            eventVersionId: version.eventVersionId,
            targetId: version.event.targetKey,
            eventType: version.event.eventType,
            date: version.event.date,
            region: "AT",
            platform: version.event.platform,
            ...(version.event.seasonNumber == null ? {} : { seasonNumber: version.event.seasonNumber }),
            lifecycleStatus: "scheduled",
            verificationStatus: "confirmed",
            evidence: version.event.evidence.map((entry) => ({
              sourceId: entry.sourceId,
              sourceDomain: entry.sourceDomain,
              url: entry.url,
              retrievedAt: entry.retrievedAt,
            })),
          };
        }),
      };
    },
  });
}

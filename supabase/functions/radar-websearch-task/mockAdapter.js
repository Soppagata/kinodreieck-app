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
  const personChecks = new Map();
  let nextId = 1;
  const sourceById = new Map(sources.map((source) => [source.sourceId, clone(source)]));
  const targetCopy = clone(target);
  const person = targetCopy.kind === "person";
  const titleGroup = targetCopy.kind === "title_group";
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
    async upsertConfirmedEvent({ accountId: actor, event, personContext = null, titleGroupContext = null }) {
      const catalogContext = person ? personContext : titleGroup ? titleGroupContext : null;
      const catalogMatch = (person || titleGroup) && catalogContext
        ? targetCopy.catalog.filter((entry) => entry.targetId === event.targetKey)
        : [];
      const authorized = person || titleGroup
        ? subscriptions.get(`${actor}|${catalogContext?.targetId}`)?.active
          && catalogContext.targetId === targetCopy.targetId
          && (!titleGroup || (
            catalogContext.queryVersion === targetCopy.queryVersion
            && catalogContext.queryKey === targetCopy.queryKey
            && catalogContext.displayName === targetCopy.displayName
          ))
          && (!person || (
            personContext.personExternalId === targetCopy.personExternalId
          && personContext.canonicalName === targetCopy.canonicalName
          && personContext.role === targetCopy.role
          ))
          && catalogMatch.length === 1
          && catalogMatch[0].targetType === event.targetType
          && catalogMatch[0].title === event.title
          && catalogMatch[0].year === event.year
        : subscriptions.get(`${actor}|${event.targetKey}`)?.active;
      if (actor !== accountId || !authorized) {
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
      const unchanged = previous?.date === event.date && previous?.sourceFingerprint === fingerprint;
      const version = unchanged ? previous : {
        eventVersionId: uuidFrom(nextId++), date: event.date,
        sourceFingerprint: fingerprint, event: clone(event),
      };
      if (!unchanged) stored.versions.push(version);
      if (person) {
        const candidate = {
          targetId: event.targetKey,
          targetType: event.targetType,
          title: event.title,
          year: event.year,
          role: personContext.role,
          eventType: event.eventType,
          date: event.date,
          region: event.region,
          platform: event.platform,
          evidence: clone(event.evidence),
        };
        const prior = personChecks.get(personContext.targetId);
        const sameCheck = prior?.checkedAt === personContext.checkedAt;
        const candidates = sameCheck ? [...prior.candidates] : [];
        const candidateKey = [candidate.targetId, candidate.eventType, candidate.platform].join("|");
        const index = candidates.findIndex((entry) => (
          [entry.targetId, entry.eventType, entry.platform].join("|") === candidateKey
        ));
        if (index >= 0) candidates[index] = candidate;
        else candidates.push(candidate);
        candidates.sort((a, b) => `${a.date}|${a.title}`.localeCompare(`${b.date}|${b.title}`));
        personChecks.set(personContext.targetId, {
          targetId: personContext.targetId,
          status: "confirmed",
          checkedAt: personContext.checkedAt,
          windowStart: personContext.windowStart,
          windowEnd: personContext.windowEnd,
          person: {
            personExternalId: personContext.personExternalId,
            name: personContext.canonicalName,
            role: personContext.role,
            canonical: true,
          },
          candidates,
        });
      }
      return {
        status: unchanged ? "no_change" : "confirmed",
        eventId: stored.eventId,
        eventVersionId: version.eventVersionId,
      };
    },
    async loadFeed({ accountId: actor }) {
      if (actor !== accountId) return { subscriptions: [], events: [] };
      return {
        subscriptions: [{
          targetId: targetCopy.targetId,
          targetType: person ? "person" : titleGroup ? "franchise" : targetCopy.mediaType === "series" ? "series" : "work",
          title: person ? targetCopy.canonicalName : titleGroup ? targetCopy.displayName : targetCopy.canonicalTitle,
          region: "AT", scope: "all", status: "active", updatedAt,
          ...(person ? {
            personExternalId: targetCopy.personExternalId,
            personRole: targetCopy.role,
          } : titleGroup ? {
            titleGroup: {
              format: "kd-radar-title-group-v1",
              queryVersion: targetCopy.queryVersion,
              queryKey: targetCopy.queryKey,
              displayName: targetCopy.displayName,
              members: targetCopy.catalog.map(clone),
            },
          } : {}),
        }],
        events: person ? [] : [...events.values()].map((stored) => {
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
        personResults: person ? [...personChecks.values()].map(clone) : [],
      };
    },
  });
}

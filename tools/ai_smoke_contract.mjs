/* Reiner Zustandsvertrag fuer die serielle Live-Pfadfolge.
   Keine Netzwerk-, Provider- oder Persistenzwirkung. */

const PFAD_STATUS = Object.freeze({
  OFFEN: "not-attempted",
  VERSUCHT: "attempted",
  PROVIDER_BELEGT: "provider-proven",
  UNBELEGT: "unproven",
  FEHLGESCHLAGEN: "failed",
  BELEGT: "proven",
});

function normalisiereErwartetePfade(erwartetePfade) {
  if (!Array.isArray(erwartetePfade) || erwartetePfade.length < 1
      || erwartetePfade.some((pfad) => typeof pfad !== "string" || !pfad)
      || new Set(erwartetePfade).size !== erwartetePfade.length) {
    throw new Error("Erwartete Anbieterpfade sind nicht eindeutig festgelegt.");
  }
  return Object.freeze([...erwartetePfade]);
}

function normalisiereOptionen(erwartet, optionen) {
  const maxPotentialRequests = optionen?.maxPotentialRequests ?? erwartet.length;
  if (!Number.isInteger(maxPotentialRequests) || maxPotentialRequests < 1
      || erwartet.length > maxPotentialRequests) {
    throw new Error("Potentialzaun deckt die erwartete Anbieterpfadfolge nicht sicher ab.");
  }
  return Object.freeze({
    maxPotentialRequests,
    requireProviderCapture: optionen?.requireProviderCapture !== false,
  });
}

function kurzeUrsache(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= 160 ? text : fallback;
}

function snapshot(record) {
  return Object.freeze({
    pfad: record.pfad,
    status: record.status,
    attempted: record.attempted,
    potentialProviderRequests: record.potentialProviderRequests,
    providerProof: record.providerProof,
    quality: record.quality,
    captureState: record.captureState,
    reason: record.reason,
  });
}

function istProviderBelegt(pfad, capture) {
  return capture?.task === pfad
    && capture.captureState === "raw"
    && capture.proofState === "proven"
    && capture.providerRequests === 1
    && capture.attemptedProviderRequests === 1
    && capture.potentialProviderRequests === 1
    && capture.provenProviderRequests === 1;
}

function istNullkostenUnbelegt(pfad, capture) {
  return capture?.task === pfad
    && capture.captureState === "pending-no-raw"
    && capture.proofState === "unproven"
    && capture.measuredCostUsdCent === 0
    && capture.providerRequests === null
    && capture.attemptedProviderRequests === 1
    && capture.potentialProviderRequests === 1
    && capture.provenProviderRequests === 0;
}

export function erstelleAnbieterPfadBelege(erwartetePfade, optionen = {}) {
  const erwartet = normalisiereErwartetePfade(erwartetePfade);
  const vertrag = normalisiereOptionen(erwartet, optionen);
  const records = new Map(erwartet.map((pfad) => [pfad, {
    pfad,
    status: PFAD_STATUS.OFFEN,
    attempted: false,
    potentialProviderRequests: 0,
    providerProof: vertrag.requireProviderCapture ? "pending" : "not-required",
    quality: "open",
    captureState: null,
    reason: null,
  }]));
  const ausgefuehrt = [];

  function versuchterRecord(pfad) {
    const record = records.get(pfad);
    if (!record || !record.attempted) {
      throw new Error("Anbieterpfadstatus ist keinem gestarteten Funktionsversuch zugeordnet.");
    }
    return record;
  }

  return Object.freeze({
    registriere(pfad) {
      const soll = erwartet[ausgefuehrt.length];
      if (pfad !== soll) {
        throw new Error(
          `Live-Pfadfolge driftet: erwartet ${soll || "Laufende"}, erhalten ${pfad}.`,
        );
      }
      if (ausgefuehrt.length >= vertrag.maxPotentialRequests) {
        throw new Error("Fester Potentialzaun fuer Anbieterrequests ist erreicht.");
      }
      const record = records.get(pfad);
      record.attempted = true;
      record.potentialProviderRequests = 1;
      record.status = PFAD_STATUS.VERSUCHT;
      ausgefuehrt.push(pfad);
    },

    erfasseProviderCapture(pfad, capture) {
      const record = versuchterRecord(pfad);
      if (istProviderBelegt(pfad, capture)) {
        record.providerProof = "proven";
        record.captureState = "raw";
        record.status = PFAD_STATUS.PROVIDER_BELEGT;
        return;
      }
      if (istNullkostenUnbelegt(pfad, capture)) {
        record.providerProof = "unproven";
        record.captureState = "pending-no-raw";
        record.status = PFAD_STATUS.UNBELEGT;
        record.quality = "open";
        record.reason = "missing-private-raw-after-zero-cost";
        return;
      }
      throw new Error("Provider-Capture ist keinem sicheren Pfadbelegzustand zugeordnet.");
    },

    erfassePfadErgebnis(pfad, { ok, reason = null } = {}) {
      const record = versuchterRecord(pfad);
      if (record.status === PFAD_STATUS.UNBELEGT) {
        throw new Error("Unbelegter Pfad darf fachlich nicht ausgewertet werden.");
      }
      if (vertrag.requireProviderCapture && record.providerProof !== "proven") {
        throw new Error("Pfadergebnis darf ohne privaten Providerbeleg nicht bestaetigt werden.");
      }
      record.quality = ok === true ? "proven" : "failed";
      record.status = ok === true ? PFAD_STATUS.BELEGT : PFAD_STATUS.FEHLGESCHLAGEN;
      record.reason = ok === true ? null : kurzeUrsache(reason, "quality-contract-failed");
    },

    erfassePfadFehler(pfad, reason = null) {
      const record = versuchterRecord(pfad);
      record.status = PFAD_STATUS.FEHLGESCHLAGEN;
      record.quality = "failed";
      record.reason = kurzeUrsache(reason, "live-path-failed");
    },

    abschluss() {
      const pfade = erwartet.map((pfad) => snapshot(records.get(pfad)));
      const attemptedProviderRequests = pfade.filter((pfad) => pfad.attempted).length;
      const potentialProviderRequests = pfade.reduce(
        (summe, pfad) => summe + pfad.potentialProviderRequests,
        0,
      );
      const provenProviderRequests = pfade.filter(
        (pfad) => pfad.providerProof === "proven",
      ).length;
      const provenPaths = pfade.filter((pfad) => pfad.status === PFAD_STATUS.BELEGT).length;
      const unbelegt = pfade.filter((pfad) => pfad.status === PFAD_STATUS.UNBELEGT)
        .map((pfad) => pfad.pfad);
      const fehlgeschlagen = pfade.filter((pfad) => pfad.status === PFAD_STATUS.FEHLGESCHLAGEN)
        .map((pfad) => pfad.pfad);
      const offen = pfade.filter((pfad) => ![
        PFAD_STATUS.BELEGT,
        PFAD_STATUS.UNBELEGT,
        PFAD_STATUS.FEHLGESCHLAGEN,
      ].includes(pfad.status)).map((pfad) => pfad.pfad);
      const pfadeVollstaendig = attemptedProviderRequests === erwartet.length;
      const providerBelegeVollstaendig = !vertrag.requireProviderCapture
        || provenProviderRequests === erwartet.length;
      return Object.freeze({
        ok: pfadeVollstaendig && provenPaths === erwartet.length,
        pfadeVollstaendig,
        providerBelegeVollstaendig,
        attemptedProviderRequests,
        potentialProviderRequests,
        provenProviderRequests,
        provenPaths,
        maxPotentialRequests: vertrag.maxPotentialRequests,
        ausgefuehrt: Object.freeze([...ausgefuehrt]),
        erwartet,
        unbelegt: Object.freeze(unbelegt),
        fehlgeschlagen: Object.freeze(fehlgeschlagen),
        offen: Object.freeze(offen),
        pfade: Object.freeze(pfade),
      });
    },
  });
}

export function formatiereAnbieterPfadZusammenfassung(abschluss) {
  if (!abschluss || !Array.isArray(abschluss.pfade)) {
    throw new Error("Anbieterpfad-Abschluss fehlt.");
  }
  const zeilen = [
    `LIVE-ANBIETERREQUESTS: attempted=${abschluss.attemptedProviderRequests}`
      + ` · potential=${abschluss.potentialProviderRequests}/${abschluss.maxPotentialRequests}`
      + ` · provider-proven=${abschluss.provenProviderRequests}`
      + ` · path-proven=${abschluss.provenPaths}`,
    "LIVE-PFADSTATUS:",
  ];
  for (const pfad of abschluss.pfade) {
    const capture = pfad.captureState ? `/${pfad.captureState}` : "";
    zeilen.push(`  ${pfad.pfad}: ${pfad.status}${capture} · quality=${pfad.quality}`);
  }
  return Object.freeze(zeilen);
}

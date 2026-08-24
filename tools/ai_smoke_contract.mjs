/* Reiner Zustandsvertrag fuer die serielle Live-Pfadfolge.
   Keine Netzwerk-, Provider- oder Persistenzwirkung. */

import { normalizeProviderReceipt } from
  "../supabase/functions/_shared/providerReceipt.js";

const PFAD_STATUS = Object.freeze({
  OFFEN: "not-attempted",
  VERSUCHT: "attempted",
  PROVIDER_BELEGT: "provider-proven",
  UNBELEGT: "unproven",
  FEHLGESCHLAGEN: "failed",
  BELEGT: "proven",
});

const WEBSEARCH_PFADE = new Set([
  "entdecken-daily-task",
  "radar-websearch-task",
]);
const TERMINALE_PFAD_HTTP_STATUS = new Set([
  401, 403, // Sitzung oder Ownerfreigabe
  408, 504, 524, // explizite Server-/Gateway-Zeitgrenzen
  409, 423, // Claim- oder Lauf-Lock
  429, // Budget-/Requestlimit
]);
const COST_EPSILON_USD_CENT = 0.000001;

export class ProviderReceiptEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderReceiptEvidenceError";
    this.code = "COST_UNKNOWN";
    this.terminalCode = "BUDGET_UNBEKANNT";
  }
}

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

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
    requireProviderReceipt: optionen?.requireProviderReceipt !== false,
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
    receiptState: record.receiptState,
    reason: record.reason,
  });
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function exactNumber(a, b) {
  return typeof a === "number" && typeof b === "number"
    && Number.isFinite(a) && Number.isFinite(b) && a === b;
}

export function istTerminalerAnbieterPfadHttpStatus(status) {
  return Number.isInteger(status) && TERMINALE_PFAD_HTTP_STATUS.has(status);
}

function uncorrelated(detail) {
  return Object.freeze({
    kind: "invalid",
    receipt: null,
    receiptState: "uncorrelated",
    detail,
  });
}

function bewerteReceiptProof(proof) {
  if (!finiteNonNegative(proof?.measuredCostUsdCent)) {
    return Object.freeze({
      kind: "unknown-cost",
      receipt: null,
      receiptState: "cost-unknown",
      detail: null,
    });
  }
  const receipt = normalizeProviderReceipt(proof?.receipt);
  if (!receipt) {
    return Object.freeze({
      kind: "invalid",
      receipt: null,
      receiptState: proof?.receiptState === "malformed" ? "malformed" : "absent",
      detail: null,
    });
  }
  if (proof?.responseProviderRequests !== 1) {
    return uncorrelated("provider-count");
  }
  if (!exactNumber(receipt.server.costUsdCent, proof?.responseCostUsdCent)) {
    return uncorrelated("response-cost");
  }
  if (receipt.server.costUsdCent <= 0) {
    return uncorrelated("receipt-cost-not-positive");
  }
  if (proof.measuredCostUsdCent + COST_EPSILON_USD_CENT < receipt.server.costUsdCent) {
    return uncorrelated("measured-cost");
  }
  if (receipt.resultMode !== proof?.expectedResultMode) {
    return uncorrelated("result-mode");
  }
  if (proof?.responseSearchRequests === null) {
    if ("webSearchRequests" in receipt.usage) {
      return uncorrelated("search-count");
    }
  } else if (!Number.isSafeInteger(proof?.responseSearchRequests)
      || receipt.usage.webSearchRequests !== proof.responseSearchRequests) {
    return uncorrelated("search-count");
  }
  return Object.freeze({ kind: "valid", receipt, receiptState: "valid", detail: null });
}

function zeroCostWithoutReceipt(proof, bewertung) {
  return bewertung?.receiptState === "absent"
    && proof?.measuredCostUsdCent === 0
    && (proof?.responseCostUsdCent === null
      || proof?.responseCostUsdCent === undefined
      || proof?.responseCostUsdCent === 0);
}

/* Baut den Providerbeleg ausschliesslich aus der normalen Produktantwort und
   der bereits vorgeschriebenen serverseitigen Vor-/Nachmessung. Diagnoseheader,
   Rawpayload-Dateien und private Antwortfelder sind fuer diesen Vertrag weder
   noetig noch erlaubt. */
export function providerReceiptBelegAusAntwort(
  pfad,
  antwort,
  measuredCostUsdCent,
) {
  if (typeof pfad !== "string" || !pfad || !plain(antwort)) {
    return Object.freeze({
      receipt: null,
      receiptState: "absent",
      measuredCostUsdCent,
      responseCostUsdCent: null,
      responseProviderRequests: null,
      responseSearchRequests: null,
      expectedResultMode: null,
    });
  }
  const hatReceipt = Object.prototype.hasOwnProperty.call(antwort, "providerReceipt");
  const receipt = normalizeProviderReceipt(antwort.providerReceipt);
  const websearch = WEBSEARCH_PFADE.has(pfad);
  return Object.freeze({
    receipt,
    receiptState: hatReceipt ? (receipt ? "valid-shape" : "malformed") : "absent",
    measuredCostUsdCent,
    responseCostUsdCent: websearch
      ? (receipt?.server.costUsdCent ?? null)
      : (antwort.verbrauch?.kostenUsdCent ?? null),
    responseProviderRequests: websearch
      ? antwort.providerRequests
      : (receipt?.server.providerRequests ?? null),
    responseSearchRequests: websearch ? antwort.searchRequests : null,
    expectedResultMode: antwort.responseMode ?? null,
  });
}

export function erstelleAnbieterPfadBelege(erwartetePfade, optionen = {}) {
  const erwartet = normalisiereErwartetePfade(erwartetePfade);
  const vertrag = normalisiereOptionen(erwartet, optionen);
  const records = new Map(erwartet.map((pfad) => [pfad, {
    pfad,
    status: PFAD_STATUS.OFFEN,
    attempted: false,
    potentialProviderRequests: 0,
    providerProof: vertrag.requireProviderReceipt ? "pending" : "not-required",
    quality: "open",
    receiptState: null,
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

    erfasseProviderReceipt(pfad, proof) {
      const record = versuchterRecord(pfad);
      const bewertung = bewerteReceiptProof(proof);
      if (bewertung.kind === "unknown-cost") {
        throw new ProviderReceiptEvidenceError(
          "Serverseitige Requestkosten sind nicht verlaesslich messbar.",
        );
      }
      if (bewertung.kind === "valid") {
        record.providerProof = "proven";
        record.receiptState = "valid";
        record.status = PFAD_STATUS.PROVIDER_BELEGT;
        return snapshot(record);
      }
      if (zeroCostWithoutReceipt(proof, bewertung)) {
        record.providerProof = "unproven";
        record.receiptState = "absent";
        record.status = PFAD_STATUS.UNBELEGT;
        record.quality = "open";
        record.reason = "provider-receipt-absent-zero-cost";
        return snapshot(record);
      }
      /* Ein bekannter serverseitiger Kostenstand bleibt bekannt, auch wenn der
         Produktbeleg fehlt oder nicht korreliert. Der Pfad ist dann klar rot und
         niemals PROVEN, aber die serielle Folge darf innerhalb ihrer festen
         Request-/Kostenzaeune weiterlaufen. */
      record.providerProof = "unproven";
      record.receiptState = bewertung.receiptState;
      record.status = PFAD_STATUS.FEHLGESCHLAGEN;
      record.quality = "failed";
      const detail = bewertung.detail ? `-${bewertung.detail}` : "";
      record.reason = `provider-receipt-${bewertung.receiptState}${detail}-known-cost`;
      return snapshot(record);
    },

    erfassePfadErgebnis(pfad, { ok, reason = null } = {}) {
      const record = versuchterRecord(pfad);
      if (record.status === PFAD_STATUS.UNBELEGT) {
        throw new Error("Unbelegter Pfad darf fachlich nicht ausgewertet werden.");
      }
      if (vertrag.requireProviderReceipt && record.providerProof !== "proven") {
        throw new Error("Pfadergebnis darf ohne normalen Providerbeleg nicht bestaetigt werden.");
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
      const providerBelegeVollstaendig = !vertrag.requireProviderReceipt
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
    const receipt = pfad.receiptState ? `/${pfad.receiptState}` : "";
    const reason = pfad.reason ? ` · reason=${pfad.reason}` : "";
    zeilen.push(
      `  ${pfad.pfad}: ${pfad.status}${receipt}`
        + ` · provider=${pfad.providerProof} · quality=${pfad.quality}${reason}`,
    );
  }
  return Object.freeze(zeilen);
}

import assert from "node:assert/strict";
import fs from "node:fs";
import * as privateMailMessages from "./supabase/functions/_shared/privateMailMessages.js";

import {
  PRIVATE_MAIL_BROWSER_TYPES,
  PRIVATE_MAIL_ERROR_CODES,
  PRIVATE_MAIL_LIMITS,
  PRIVATE_MAIL_SCHEMA_VERSION,
  PRIVATE_MAIL_SUCCESS_STATUS,
  PRIVATE_MAIL_TYPES,
  createPrivateMailFailureResponse,
  createPrivateMailSuccessResponse,
  normalizePrivateMailResponse,
  privateMailUtf8Bytes,
  validatePrivateMailRequest,
} from "./supabase/functions/_shared/privateMailContract.js";
import {
  PRIVATE_MAIL_ADAPTER_STATUS,
  PRIVATE_MAIL_DISPATCH_CODES,
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES,
  buildPrivateAccountDeletionMessage,
  buildPrivateFeedbackMessage,
  buildPrivateOperationalRetryMessage,
  createPrivateAccountDeletionDispatcher,
  createPrivateFeedbackDispatcher,
  createPrivateOperationalRetryDispatcher,
  escapePrivateMailHtml,
  privateMailBodiesFit,
} from "./supabase/functions/_shared/privateMailMessages.js";

let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks += 1;
  console.log(`✓ ${name}`);
}

const operationId = "1111111a-222b-433c-844d-55555555555e";
const accountId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const initialOperationId = "22222222-3333-4444-8555-666666666666";
const retryOperationId = "33333333-4444-4555-8666-777777777777";
const now = "2026-09-01T20:00:00.000Z";

const feedbackRequest = validatePrivateMailRequest({
  schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  text: "  Erste Zeile\r\nZweite Zeile  ",
});
check("Feedbackrequest wird exakt normalisiert und eingefroren",
  feedbackRequest.ok
  && feedbackRequest.request.text === "Erste Zeile\nZweite Zeile"
  && Object.isFrozen(feedbackRequest)
  && Object.isFrozen(feedbackRequest.request));

const deletionRequest = validatePrivateMailRequest({
  schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
  type: PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST,
  operationId,
});
check("Kontolöschanfrage ist der zweite und letzte Browsertyp",
  deletionRequest.ok
  && PRIVATE_MAIL_BROWSER_TYPES.length === 2
  && PRIVATE_MAIL_BROWSER_TYPES.includes(PRIVATE_MAIL_TYPES.FEEDBACK)
  && PRIVATE_MAIL_BROWSER_TYPES.includes(PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST));

check("Interne Betriebs-Mail ist als Browserrequest ausgeschlossen",
  validatePrivateMailRequest({
    schemaVersion: 1,
    type: PRIVATE_MAIL_TYPES.OPERATIONAL_RETRY,
    operationId,
  }).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);

class ConstructedRequest {
  constructor() {
    this.schemaVersion = 1;
    this.type = PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST;
    this.operationId = operationId;
  }
}
check("Nur echte Plain-Object-Requests werden angenommen",
  validatePrivateMailRequest(new ConstructedRequest()).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST
  && validatePrivateMailRequest([]).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);

for (const forbidden of [
  "from", "to", "headers", "subject", "attachments", "html", "accountId",
  "profile", "diagnostics", "browser", "payload",
]) {
  const result = validatePrivateMailRequest({
    schemaVersion: 1,
    type: PRIVATE_MAIL_TYPES.FEEDBACK,
    operationId,
    text: "Hallo",
    [forbidden]: "nicht erlaubt",
  });
  check(`Browserrequest lehnt Zusatzfeld ${forbidden} ab`,
    result.code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);
}

check("Kontolöschanfrage nimmt keine vom Browser gelieferte Kontoidentität an",
  validatePrivateMailRequest({
    schemaVersion: 1,
    type: PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST,
    operationId,
    accountId,
  }).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);

check("Leerer oder kontrollzeichentragender Feedbacktext ist ungültig",
  validatePrivateMailRequest({ schemaVersion: 1, type: PRIVATE_MAIL_TYPES.FEEDBACK, operationId, text: "  " }).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST
  && validatePrivateMailRequest({ schemaVersion: 1, type: PRIVATE_MAIL_TYPES.FEEDBACK, operationId, text: "a\u0000b" }).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);

const emojiLimitRequest = {
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  text: "🎬".repeat(PRIVATE_MAIL_LIMITS.feedbackCodePoints),
};
check("Feedback-Zeichengrenze zählt N/N+1 für Umlaut und Emoji als Codepoints",
  validatePrivateMailRequest(emojiLimitRequest).ok
  && validatePrivateMailRequest({ ...emojiLimitRequest, text: `${emojiLimitRequest.text}🎬` }).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST
  && validatePrivateMailRequest({ ...emojiLimitRequest, text: "ä".repeat(PRIVATE_MAIL_LIMITS.feedbackCodePoints) }).ok
  && validatePrivateMailRequest({ ...emojiLimitRequest, text: "ä".repeat(PRIVATE_MAIL_LIMITS.feedbackCodePoints + 1) }).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);

check("UTF-8-Bytezählung unterscheidet ASCII, Umlaut und Emoji",
  privateMailUtf8Bytes("a") === 1
  && privateMailUtf8Bytes("ä") === 2
  && privateMailUtf8Bytes("🎬") === 4);

check("Request-Bytegrenze akzeptiert N und verwirft N+1 vor der Feldverarbeitung",
  validatePrivateMailRequest({
    schemaVersion: 1,
    type: PRIVATE_MAIL_TYPES.FEEDBACK,
    operationId,
    text: "Hallo",
  }, { rawByteLength: PRIVATE_MAIL_LIMITS.requestBytes }).ok
  &&
  validatePrivateMailRequest({}, { rawByteLength: PRIVATE_MAIL_LIMITS.requestBytes + 1 }).code === PRIVATE_MAIL_ERROR_CODES.REQUEST_TOO_LARGE
  && validatePrivateMailRequest({}, { rawByteLength: -1 }).code === PRIVATE_MAIL_ERROR_CODES.REQUEST_TOO_LARGE);

const oversizedWrapper = { ...emojiLimitRequest, text: "🎬".repeat(2048) };
check("Gesamter JSON-Wrapper wird in UTF-8 gemessen",
  privateMailUtf8Bytes(JSON.stringify(emojiLimitRequest)) <= PRIVATE_MAIL_LIMITS.requestBytes
  && privateMailUtf8Bytes(JSON.stringify(oversizedWrapper)) > PRIVATE_MAIL_LIMITS.requestBytes
  && validatePrivateMailRequest(oversizedWrapper).code === PRIVATE_MAIL_ERROR_CODES.REQUEST_TOO_LARGE);

check("Finale Text-Bytecap akzeptiert N und verwirft N+1",
  privateMailBodiesFit({
    text: "x".repeat(PRIVATE_MAIL_LIMITS.messageTextBytes),
    html: "",
  })
  && !privateMailBodiesFit({
    text: "x".repeat(PRIVATE_MAIL_LIMITS.messageTextBytes + 1),
    html: "",
  }));

check("Finale HTML-Bytecap zählt Umlaut und Emoji an N/N+1 exakt",
  privateMailBodiesFit({
    text: "",
    html: "ä".repeat(PRIVATE_MAIL_LIMITS.messageHtmlBytes / 2),
  })
  && !privateMailBodiesFit({
    text: "",
    html: `${"ä".repeat(PRIVATE_MAIL_LIMITS.messageHtmlBytes / 2)}a`,
  })
  && privateMailBodiesFit({
    text: "",
    html: "🎬".repeat(PRIVATE_MAIL_LIMITS.messageHtmlBytes / 4),
  })
  && !privateMailBodiesFit({
    text: "",
    html: `${"🎬".repeat(PRIVATE_MAIL_LIMITS.messageHtmlBytes / 4)}a`,
  }));

check("Operation-ID ist kanonisch und nicht beliebig",
  validatePrivateMailRequest({ schemaVersion: 1, type: PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST, operationId: operationId.toUpperCase() }).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST
  && validatePrivateMailRequest({ schemaVersion: 1, type: PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST, operationId: "frei" }).code === PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);

const success = createPrivateMailSuccessResponse({
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
});
check("Erfolgsantwort hat eine exakte generische Form",
  JSON.stringify(Object.keys(success).sort()) === JSON.stringify(["ok", "schemaVersion", "type", "operationId", "status"].sort())
  && success.status === PRIVATE_MAIL_SUCCESS_STATUS
  && normalizePrivateMailResponse(success, {
    expectedType: PRIVATE_MAIL_TYPES.FEEDBACK,
    expectedOperationId: operationId,
  })?.ok === true);

check("Erfolgsantwort scheitert bei fremdem Kontext oder Zusatzfeld",
  normalizePrivateMailResponse(success, { expectedOperationId: accountId }) === null
  && normalizePrivateMailResponse({ ...success, transportDetail: "nicht erlaubt" }) === null
  && normalizePrivateMailResponse({ ...success, status: "pending" }) === null
  && normalizePrivateMailResponse({ ...success, status: "unknown" }) === null
  && createPrivateMailSuccessResponse({
    type: PRIVATE_MAIL_TYPES.OPERATIONAL_RETRY,
    operationId,
  }) === null);

const failure = createPrivateMailFailureResponse(PRIVATE_MAIL_ERROR_CODES.RATE_LIMITED);
check("Fehlerantwort hat nur einen generischen allowlisted Code",
  normalizePrivateMailResponse(failure)?.code === PRIVATE_MAIL_ERROR_CODES.RATE_LIMITED
  && createPrivateMailFailureResponse("roher-fehler").code === PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE
  && normalizePrivateMailResponse({ ...failure, detail: "roh" }) === null);

check("Browserzustände unterscheiden Konflikt, laufenden Request, Ablehnung und unbekannte Zustellung",
  [
    PRIVATE_MAIL_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    PRIVATE_MAIL_ERROR_CODES.REQUEST_IN_PROGRESS,
    PRIVATE_MAIL_ERROR_CODES.DELIVERY_REJECTED,
    PRIVATE_MAIL_ERROR_CODES.DELIVERY_STATUS_UNKNOWN,
  ].every((code) => normalizePrivateMailResponse(createPrivateMailFailureResponse(code))?.code === code));

const maliciousText = `<img src=x onerror="boom"> & 'Text'\nZweite Zeile`;
const feedbackMessage = buildPrivateFeedbackMessage({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: maliciousText,
});
check("Feedback erzeugt festen Text- und HTML-Inhalt ohne Kontokontext",
  feedbackMessage.ok
  && feedbackMessage.message.subject === "Kinodreieck: Feedback ohne Namensangabe"
  && feedbackMessage.message.text.includes(maliciousText)
  && !feedbackMessage.message.text.includes(accountId)
  && !feedbackMessage.message.text.includes(operationId)
  && !feedbackMessage.message.html.includes(operationId)
  && feedbackMessage.message.operationId === operationId
  && !Object.hasOwn(feedbackMessage.message, "to")
  && !Object.hasOwn(feedbackMessage.message, "from")
  && !Object.hasOwn(feedbackMessage.message, "headers")
  && !Object.hasOwn(feedbackMessage.message, "attachments"));

check("Eingereichtes HTML wird ausschließlich escaped dargestellt",
  !feedbackMessage.message.html.includes("<img")
  && !feedbackMessage.message.html.includes("onerror=\"boom\"")
  && feedbackMessage.message.html.includes("&lt;img src=x onerror=&quot;boom&quot;&gt;")
  && feedbackMessage.message.html.includes("&amp;")
  && feedbackMessage.message.html.includes("&#39;Text&#39;")
  && feedbackMessage.message.html.includes("<br>Zweite Zeile")
  && feedbackMessage.message.html === `<p>${escapePrivateMailHtml(feedbackMessage.message.text).replace(/\n/g, "<br>")}</p>`);

check("Erzeugte Nachricht hat nur feste Inhaltsfelder und ist eingefroren",
  JSON.stringify(Object.keys(feedbackMessage.message).sort())
    === JSON.stringify(["schemaVersion", "type", "operationId", "subject", "text", "html"].sort())
  && Object.isFrozen(feedbackMessage.message)
  && privateMailUtf8Bytes(feedbackMessage.message.text) <= PRIVATE_MAIL_LIMITS.messageTextBytes
  && privateMailUtf8Bytes(feedbackMessage.message.html) <= PRIVATE_MAIL_LIMITS.messageHtmlBytes);

const deletionMessage = buildPrivateAccountDeletionMessage({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST,
  operationId,
  requestedAt: now,
  accountId,
});
check("Kontolösch-Mail enthält nur serverseitig ergänzbare notwendige Konto-ID und löscht nichts",
  deletionMessage.ok
  && deletionMessage.message.text.includes(accountId)
  && !deletionMessage.message.text.includes(operationId)
  && deletionMessage.message.text.includes("manuell geprüft")
  && deletionMessage.message.text.includes("löscht kein Konto")
  && !/passwort|backup|e-mail/i.test(deletionMessage.message.text));

check("Kontolösch-Mail lehnt zusätzliche Adress- oder Profildaten ab",
  buildPrivateAccountDeletionMessage({
    schemaVersion: 1,
    type: PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST,
    operationId,
    requestedAt: now,
    accountId,
    accountEmail: "nicht-erlaubt",
  }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE);

const operationalInput = {
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.OPERATIONAL_RETRY,
  operationId,
  occurredAt: now,
  taskId: "radar-six-day-trigger",
  initialOperationId,
  initialApiCall: "made",
  initialCost: "confirmed",
  initialErrorCode: "UPSTREAM_TIMEOUT",
  initialReasonCode: PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_USAGE_UNPROVEN,
  retryTriggered: true,
  retryOperationId,
  retryResult: "failed",
  retryErrorCode: "UPSTREAM_UNAVAILABLE",
  retryReasonCode: PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_EXECUTION_FAILED,
};
const operationalMessage = buildPrivateOperationalRetryMessage(operationalInput);
check("Interner Betriebstyp bildet ausschließlich die festgelegten Belegfelder ab",
  operationalMessage.ok
  && operationalMessage.message.text.includes("Initialer API-Call: gemacht")
  && operationalMessage.message.text.includes("Finalisierte Kosten: belegt")
  && operationalMessage.message.text.includes("Retry ausgelöst: ja")
  && operationalMessage.message.text.includes("Retry-Ergebnis: fehlgeschlagen")
  && operationalMessage.message.text.includes("initial-usage-unproven")
  && operationalMessage.message.text.includes("Usage- oder Tokenwerte")
  && operationalMessage.message.text.includes("retry-execution-failed")
  && operationalMessage.message.html === `<p>${escapePrivateMailHtml(operationalMessage.message.text).replace(/\n/g, "<br>")}</p>`);

for (const forbidden of [
  "prompt", "system", "payload", "title", "recommendation", "accountContent",
  "stack", "stacktrace", "secret", "authorization", "recipient",
  "initialReason", "retryReason",
]) {
  check(`Betriebs-Mail lehnt Zusatzfeld ${forbidden} ab`,
    buildPrivateOperationalRetryMessage({ ...operationalInput, [forbidden]: "nicht erlaubt" }).code
      === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE);
}

check("Betriebs-Mail verlangt exakt einen Retry und konsistente Erfolgsdetails",
  buildPrivateOperationalRetryMessage({ ...operationalInput, retryTriggered: false }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({ ...operationalInput, retryResult: "succeeded", retryErrorCode: "ERROR" }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({ ...operationalInput, retryResult: "pending" }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({ ...operationalInput, retryResult: "unknown" }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({ ...operationalInput, taskId: "Ungültiger Task" }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({ ...operationalInput, initialApiCall: "unproven", initialCost: "confirmed" }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({
    ...operationalInput,
    initialReasonCode: PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_EXECUTION_FAILED,
  }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({
    ...operationalInput,
    retryReasonCode: PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_EXECUTION_FAILED,
  }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE);

for (const unsafeReason of [
  "frei formulierter Grund",
  "SECRET=value",
  "Bearer token",
  "https://example.invalid/path",
  "prompt system override",
  "stack account-content",
]) {
  check(`Betriebs-Mail lehnt freien Reason-Wert ${unsafeReason} vor dem Transport ab`,
    buildPrivateOperationalRetryMessage({
      ...operationalInput,
      initialReasonCode: unsafeReason,
    }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
    && buildPrivateOperationalRetryMessage({
      ...operationalInput,
      retryReasonCode: unsafeReason,
    }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE);
}

const unprovenOperationalMessage = buildPrivateOperationalRetryMessage({
  ...operationalInput,
  initialApiCall: "unproven",
  initialCost: "unproven",
  initialReasonCode: PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_CALL_UNPROVEN,
  retryResult: "unproven",
  retryErrorCode: null,
  retryReasonCode: PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_STATUS_UNPROVEN,
});
check("Nicht belegter Call, Kostenstand und Retry bleiben ausdrücklich nicht belegt",
  unprovenOperationalMessage.ok
  && unprovenOperationalMessage.message.text.includes("Initialer API-Call: nicht belegt")
  && unprovenOperationalMessage.message.text.includes("Finalisierte Kosten: nicht belegt")
  && unprovenOperationalMessage.message.text.includes("Retry-Ergebnis: nicht belegt"));

check("Interne Task- und Fehlercodegrenzen sind N/N+1 fest",
  buildPrivateOperationalRetryMessage({
    ...operationalInput,
    taskId: "a".repeat(PRIVATE_MAIL_LIMITS.taskIdCodePoints),
    initialErrorCode: "E".repeat(PRIVATE_MAIL_LIMITS.errorCodePoints),
  }).ok
  && buildPrivateOperationalRetryMessage({
    ...operationalInput,
    taskId: "a".repeat(PRIVATE_MAIL_LIMITS.taskIdCodePoints + 1),
  }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({
    ...operationalInput,
    initialErrorCode: "E".repeat(PRIVATE_MAIL_LIMITS.errorCodePoints + 1),
  }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({
    ...operationalInput,
    initialErrorCode: "SECRET=value",
  }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateOperationalRetryMessage({
    ...operationalInput,
    retryErrorCode: "Bearer token",
  }).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE);

check("Es gibt keinen generischen Raw-Type-Builder oder -Dispatcher",
  !Object.hasOwn(privateMailMessages, "buildPrivateMailMessage")
  && !Object.hasOwn(privateMailMessages, "createPrivateMailDispatcher")
  && buildPrivateFeedbackMessage(operationalInput).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && buildPrivateAccountDeletionMessage(operationalInput).code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE);

let transportCalls = 0;
const noTransport = await createPrivateFeedbackDispatcher().send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
check("Fehlender Adapter endet fail-closed ohne Transportaufruf",
  noTransport.code === PRIVATE_MAIL_DISPATCH_CODES.TRANSPORT_UNAVAILABLE
  && transportCalls === 0);

const invalidFeedbackDispatcher = createPrivateFeedbackDispatcher({
  transport: async () => {
    transportCalls += 1;
    return { ok: true, status: PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED };
  },
});
const invalidFeedbackDispatch = await invalidFeedbackDispatcher.send(operationalInput);
check("Feedback-Dispatcher kann den internen Betriebstyp strukturell nicht senden",
  invalidFeedbackDispatch.code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && transportCalls === 0);

const invalidDeletionDispatcher = createPrivateAccountDeletionDispatcher({
  transport: async () => {
    transportCalls += 1;
    return { ok: true, status: PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED };
  },
});
const invalidDeletionDispatch = await invalidDeletionDispatcher.send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
check("Löschanfrage-Dispatcher kann Feedback strukturell nicht senden",
  invalidDeletionDispatch.code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && transportCalls === 0);

const invalidOperationalDispatcher = createPrivateOperationalRetryDispatcher({
  transport: async () => {
    transportCalls += 1;
    return { ok: true, status: PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED };
  },
});
const invalidOperationalDispatch = await invalidOperationalDispatcher.send({
  ...operationalInput,
  initialReasonCode: "Authorization=Bearer secret",
});
check("Freier Betriebsgrund scheitert vor dem internen Transport",
  invalidOperationalDispatch.code === PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE
  && transportCalls === 0);

const dispatcherWithOptions = createPrivateFeedbackDispatcher({
  transport: async () => {
    transportCalls += 1;
    return { ok: true, status: PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED };
  },
  headers: { "x-not-allowed": "value" },
});
const optionsDispatch = await dispatcherWithOptions.send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
check("Transport-Injektion nimmt keine freien Header oder Optionen an",
  optionsDispatch.code === PRIVATE_MAIL_DISPATCH_CODES.TRANSPORT_UNAVAILABLE
  && transportCalls === 0);

let deliveredMessage = null;
const dispatcher = createPrivateFeedbackDispatcher({
  transport: async (message) => {
    transportCalls += 1;
    deliveredMessage = message;
    return { ok: true, status: PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED };
  },
});
const delivered = await dispatcher.send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
check("Ein send-Aufruf startet keinen versteckten Transport-Retry",
  delivered.ok
  && delivered.status === PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED
  && delivered.type === PRIVATE_MAIL_TYPES.FEEDBACK
  && delivered.operationId === operationId
  && transportCalls === 1
  && Object.isFrozen(deliveredMessage));

const malformedTransport = await createPrivateFeedbackDispatcher({
  transport: async () => ({
    ok: true,
    status: PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED,
    raw: "verboten",
  }),
}).send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
check("Adapterantworten mit Roh- oder Zusatzdaten werden als unbekannt verworfen",
  malformedTransport.code === PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_STATUS_UNKNOWN);

const pendingTransport = await createPrivateFeedbackDispatcher({
  transport: async () => ({ ok: true, status: "pending" }),
}).send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
const unstatedTransport = await createPrivateFeedbackDispatcher({
  transport: async () => ({ ok: true }),
}).send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
const unknownTransport = await createPrivateFeedbackDispatcher({
  transport: async () => ({ ok: false, status: "unknown" }),
}).send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
check("Pending oder unbekannt bleibt ein unbekannter Zustellstatus",
  pendingTransport.code === PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_STATUS_UNKNOWN
  && unstatedTransport.code === PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_STATUS_UNKNOWN
  && unknownTransport.code === PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_STATUS_UNKNOWN);

const rejectedTransport = await createPrivateFeedbackDispatcher({
  transport: async () => ({
    ok: false,
    status: PRIVATE_MAIL_ADAPTER_STATUS.REJECTED,
  }),
}).send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
check("Nur die exakte Adapter-Rejection gilt als sichere Ablehnung",
  rejectedTransport.code === PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_REJECTED);

let failedCalls = 0;
const failedTransport = await createPrivateFeedbackDispatcher({
  transport: async () => {
    failedCalls += 1;
    const timeout = new Error("roher Timeout");
    timeout.name = "TimeoutError";
    throw timeout;
  },
}).send({
  schemaVersion: 1,
  type: PRIVATE_MAIL_TYPES.FEEDBACK,
  operationId,
  submittedAt: now,
  text: "Hallo",
});
check("Throw oder Timeout bleibt unbekannt und startet keinen automatischen Retry",
  failedTransport.code === PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_STATUS_UNKNOWN
  && failedCalls === 1
  && !Object.hasOwn(failedTransport, "cause"));

const source = [
  fs.readFileSync("supabase/functions/_shared/privateMailContract.js", "utf8"),
  fs.readFileSync("supabase/functions/_shared/privateMailMessages.js", "utf8"),
].join("\n");
check("Foundation enthält keine URL, Adresse oder externe Transportaktivierung",
  !/https?:\/\//i.test(source)
  && !/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(source)
  && !/\bfetch\s*\(/.test(source));

check("Shared-Module bleiben Deno-/Node-kompatibles ESM mit Web APIs",
  !/from\s+["']node:/.test(source)
  && !/\b(?:Buffer|process|Deno)\b/.test(source));

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
check("Fokussierter Mocktest ist im Standard-Gate verdrahtet",
  packageJson.scripts["test:private-mail-contract"] === "node private_mail_contract_test.mjs"
  && packageJson.scripts.test.includes("npm run test:private-mail-contract"));

console.log(`\nPRIVATE-MAIL-CONTRACT-TEST BESTANDEN (${checks}/${checks})`);

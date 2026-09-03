/* Serverinterne Bindung der Betriebs-Mail an den vorhandenen Resend-Adapter.

   Diese Grenze besitzt keinen Browser- oder Retryweg. Sie macht auch keine
   Einmaligkeitszusage: Der spaetere Checker darf `send` erst nach seinem
   atomaren Ledger-Mailclaim genau einmal aufrufen. Jeder explizite Aufruf hier
   fuehrt hoechstens einen Transportaufruf aus und gibt nur einen sicheren Code
   ohne Adressen, Secrets oder Providerdetails zurueck. */

import {
  privateMailUtf8Bytes,
} from "./privateMailContract.js";
import {
  PRIVATE_MAIL_ADAPTER_STATUS,
  PRIVATE_MAIL_DISPATCH_CODES,
  createPrivateOperationalRetryDispatcher,
} from "./privateMailMessages.js";
import {
  createResendPrivateMailTransport,
} from "../private-mail-request/resendAdapter.js";

export const OPERATIONAL_RETRY_MAIL_CODES = Object.freeze({
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  UNKNOWN: "unknown",
});

const MIN_ACTIVATION_SECRET_BYTES = 32;
const SAFE_RESULTS = Object.freeze({
  [OPERATIONAL_RETRY_MAIL_CODES.ACCEPTED]: Object.freeze({
    code: OPERATIONAL_RETRY_MAIL_CODES.ACCEPTED,
  }),
  [OPERATIONAL_RETRY_MAIL_CODES.REJECTED]: Object.freeze({
    code: OPERATIONAL_RETRY_MAIL_CODES.REJECTED,
  }),
  [OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN]: Object.freeze({
    code: OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN,
  }),
});

function activationReady(value) {
  return typeof value === "string"
    && privateMailUtf8Bytes(value) >= MIN_ACTIVATION_SECRET_BYTES;
}

function safeResult(code) {
  return SAFE_RESULTS[code] || SAFE_RESULTS[OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN];
}

export function createOperationalRetryMailSender({
  transportActivationSecret,
  apiKey,
  sender,
  recipient,
  fetchImpl = globalThis.fetch,
  signalFactory,
} = {}) {
  let transport = null;
  if (activationReady(transportActivationSecret)) {
    try {
      transport = createResendPrivateMailTransport({
        apiKey,
        sender,
        recipient,
        fetchImpl,
        signalFactory,
      });
    } catch {
      transport = null;
    }
  }

  const dispatcher = createPrivateOperationalRetryDispatcher({ transport });
  return Object.freeze({
    async send(input) {
      let dispatched;
      try {
        dispatched = await dispatcher.send(input);
      } catch {
        return safeResult(OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN);
      }
      if (dispatched?.ok === true
          && dispatched.status === PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED) {
        return safeResult(OPERATIONAL_RETRY_MAIL_CODES.ACCEPTED);
      }
      if (dispatched?.ok === false
          && dispatched.code === PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_REJECTED) {
        return safeResult(OPERATIONAL_RETRY_MAIL_CODES.REJECTED);
      }
      return safeResult(OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN);
    },
  });
}

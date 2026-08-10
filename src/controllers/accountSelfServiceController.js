export const ACCOUNT_SELF_SERVICE_ERROR = Object.freeze({
  ACCOUNT_CONTEXT_REQUIRED: "account-context-required",
  ACCOUNT_CONTEXT_CHANGED: "account-context-changed",
  EXPORT_REQUIRED: "export-required",
  EXPORT_FAILED: "export-failed",
  REAUTH_REQUIRED: "reauth-required",
  INVALID_CONFIRMATION: "invalid-confirmation",
  OPERATION_ID_UNAVAILABLE: "operation-id-unavailable",
  LOCAL_FINALIZATION_FAILED: "local-finalization-failed",
});

const text = (value) => String(value == null ? "" : value).trim();

function failure(code, { cause, serverDeleted = false, operationId = "" } = {}) {
  const error = new Error(code, cause ? { cause } : undefined);
  error.code = code;
  error.serverDeleted = serverDeleted;
  error.operationId = operationId;
  return error;
}

export function accountSelfServiceKey({ accountId, accountEmail } = {}) {
  const id = text(accountId);
  const email = text(accountEmail).toLocaleLowerCase("en-US");
  return id && email ? JSON.stringify([id, email]) : "";
}

export function expectedAccountDeleteConfirmation(accountEmail) {
  const email = text(accountEmail);
  return email ? `DELETE ${email}` : "";
}

export function exportReceiptMatchesAccount(receipt, account) {
  const key = accountSelfServiceKey(account);
  return !!key && receipt?.accountKey === key && Number.isFinite(receipt?.completedAt);
}

function assertCurrentAccount(accountKey, readCurrentAccountKey) {
  if (!accountKey) throw failure(ACCOUNT_SELF_SERVICE_ERROR.ACCOUNT_CONTEXT_REQUIRED);
  if (typeof readCurrentAccountKey === "function" && readCurrentAccountKey() !== accountKey) {
    throw failure(ACCOUNT_SELF_SERVICE_ERROR.ACCOUNT_CONTEXT_CHANGED);
  }
}

export async function runExportBeforeAccountDeletion({
  account,
  exportPersonalData,
  readCurrentAccountKey,
  now = Date.now,
} = {}) {
  const accountKey = accountSelfServiceKey(account);
  assertCurrentAccount(accountKey, readCurrentAccountKey);
  if (typeof exportPersonalData !== "function") {
    throw failure(ACCOUNT_SELF_SERVICE_ERROR.EXPORT_FAILED);
  }
  const exported = await exportPersonalData();
  assertCurrentAccount(accountKey, readCurrentAccountKey);
  if (exported !== true) throw failure(ACCOUNT_SELF_SERVICE_ERROR.EXPORT_FAILED);
  const completedAt = Number(typeof now === "function" ? now() : now);
  if (!Number.isFinite(completedAt)) throw failure(ACCOUNT_SELF_SERVICE_ERROR.EXPORT_FAILED);
  return Object.freeze({ accountKey, completedAt });
}

export async function runCurrentAccountDeletion({
  account,
  exportReceipt,
  password,
  confirmation,
  reauthenticate,
  deleteRemote,
  finalizeLocal,
  createOperationId = () => globalThis.crypto?.randomUUID?.(),
  readCurrentAccountKey,
} = {}) {
  const accountKey = accountSelfServiceKey(account);
  assertCurrentAccount(accountKey, readCurrentAccountKey);
  if (!exportReceiptMatchesAccount(exportReceipt, account)) {
    throw failure(ACCOUNT_SELF_SERVICE_ERROR.EXPORT_REQUIRED);
  }
  if (!text(password) || typeof reauthenticate !== "function") {
    throw failure(ACCOUNT_SELF_SERVICE_ERROR.REAUTH_REQUIRED);
  }
  const expected = expectedAccountDeleteConfirmation(account?.accountEmail);
  if (!expected || confirmation !== expected) {
    throw failure(ACCOUNT_SELF_SERVICE_ERROR.INVALID_CONFIRMATION);
  }
  if (typeof deleteRemote !== "function" || typeof finalizeLocal !== "function") {
    throw failure(ACCOUNT_SELF_SERVICE_ERROR.ACCOUNT_CONTEXT_REQUIRED);
  }

  await reauthenticate(password);
  assertCurrentAccount(accountKey, readCurrentAccountKey);
  const operationId = text(createOperationId?.());
  if (!operationId) throw failure(ACCOUNT_SELF_SERVICE_ERROR.OPERATION_ID_UNAVAILABLE);
  await deleteRemote({ operationId, confirmation });

  try {
    assertCurrentAccount(accountKey, readCurrentAccountKey);
    await finalizeLocal();
  } catch (cause) {
    throw failure(ACCOUNT_SELF_SERVICE_ERROR.LOCAL_FINALIZATION_FAILED, {
      cause,
      serverDeleted: true,
      operationId,
    });
  }
  return Object.freeze({ serverDeleted: true, operationId });
}

export async function finalizeDeletedAccountLocally(finalizeLocal) {
  if (typeof finalizeLocal !== "function") {
    throw failure(ACCOUNT_SELF_SERVICE_ERROR.LOCAL_FINALIZATION_FAILED, { serverDeleted: true });
  }
  try {
    await finalizeLocal();
  } catch (cause) {
    throw failure(ACCOUNT_SELF_SERVICE_ERROR.LOCAL_FINALIZATION_FAILED, { cause, serverDeleted: true });
  }
  return Object.freeze({ serverDeleted: true });
}

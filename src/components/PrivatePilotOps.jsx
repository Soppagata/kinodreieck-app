import { useEffect, useMemo, useRef, useState } from "react";
import { PRIVATE_DATA_INVENTORY, PRIVATE_PROVIDER_REGISTRY, RETENTION_CLASSES } from "../lib/privatePilotOps.js";
import { supportBundleText } from "../lib/supportBundle.js";
import {
  clearLocalDiagnostics,
  localDiagnosticsEnabled,
  readLocalDiagnostics,
  setLocalDiagnosticsEnabled,
} from "../lib/localDiagnostics.js";
import { T, btnStyle } from "../lib/tokens.js";
import { runtimeConfig } from "../config/runtime.js";
import { accountSelfService } from "../services/accountSelfService.js";
import { sessionCoordinator } from "../services/sessionCoordinator.js";
import {
  accountSelfServiceKey,
  expectedAccountDeleteConfirmation,
  exportReceiptMatchesAccount,
  finalizeDeletedAccountLocally,
  runCurrentAccountDeletion,
  runExportBeforeAccountDeletion,
} from "../controllers/accountSelfServiceController.js";

export function DatenschutzUebersicht({ accountActive = false }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, color: T.rauch, fontSize: 13, lineHeight: 1.6 }}>
        {PRIVATE_DATA_INVENTORY.length} feste Datenklassen sind im Register. Persönliche Inhalte liegen lokal{accountActive ? " und bei aktiviertem Kontospeicher zusätzlich im eigenen Supabase-Konto" : " im Browser"}. Externe Anbieter bleiben ohne abgeschlossene Rechts- und Aufbewahrungsprüfung serverseitig gesperrt.
      </p>
      <dl className="kd-statusliste">
        <div><dt>Persönliche Töpfe</dt><dd>{PRIVATE_DATA_INVENTORY.filter((entry) => entry.retention === RETENTION_CLASSES.PURPOSE_BOUND.id).length}</dd></div>
        <div><dt>Kurzzeit-Rückholpunkte</dt><dd>{RETENTION_CLASSES.TRANSIENT_7.label}</dd></div>
        <div><dt>Betriebsnachweise</dt><dd>höchstens {RETENTION_CLASSES.AUDIT_90.label}</dd></div>
        <div><dt>Externe Empfänger/Quellen</dt><dd>{PRIVATE_PROVIDER_REGISTRY.length} registriert · standardmäßig geschlossen</dd></div>
      </dl>
      <details>
        <summary style={{ cursor: "pointer", color: T.rauch, fontSize: 13 }}>Datenklassen und Aufbewahrung anzeigen</summary>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "grid", gap: 8, color: T.rauch, fontSize: 12, lineHeight: 1.5 }}>
          {PRIVATE_DATA_INVENTORY.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.label}</strong>: {entry.purpose}. Ort: {entry.locations.join(", ")}. Aufbewahrung: {Object.values(RETENTION_CLASSES).find((item) => item.id === entry.retention)?.label || "zweckgebunden"}. Export: {entry.export}. Löschung: {entry.deleteTrigger}.
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary style={{ cursor: "pointer", color: T.rauch, fontSize: 13 }}>Empfänger und Quellen anzeigen</summary>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "grid", gap: 8, color: T.rauch, fontSize: 12, lineHeight: 1.5 }}>
          {PRIVATE_PROVIDER_REGISTRY.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.name}</strong>: {entry.purpose}; übertragene Klasse: {entry.data}. Region: {entry.region}. Status: {entry.legalStatus}. <a href={entry.officialSource} target="_blank" rel="noreferrer">Offizielle Quelle (Abruf {entry.retrievedAt})</a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function BestaetigteSupportDaten({ ownerBestaetigt }) {
  const [copied, setCopied] = useState(false);
  const [diagnoseAktiv, setDiagnoseAktiv] = useState(() => localDiagnosticsEnabled({
    ownerConfirmed: ownerBestaetigt,
  }));
  const [diagnosen, setDiagnosen] = useState(() => readLocalDiagnostics({
    ownerConfirmed: ownerBestaetigt,
  }));
  const bundle = useMemo(() => supportBundleText({
    checks: [{ id: "browser", code: globalThis.navigator?.onLine === false ? "OFFLINE" : "OK" }],
    diagnostics: diagnosen,
  }), [diagnosen]);
  const toggleDiagnose = (event) => {
    const next = event.target.checked === true;
    const saved = setLocalDiagnosticsEnabled(next, { ownerConfirmed: ownerBestaetigt });
    setDiagnoseAktiv(saved ? next : false);
  };
  const clearDiagnose = () => {
    if (clearLocalDiagnostics({ ownerConfirmed: ownerBestaetigt })) setDiagnosen([]);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(bundle); setCopied(true); }
    catch { setCopied(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([bundle], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kinodreieck_support_${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, color: T.rauch, fontSize: 13, lineHeight: 1.6 }}>
        Diese Supportdaten dienen ausschließlich der Fehlerdiagnose auf Anfrage. Du kannst das kleine Paket bewusst kopieren oder herunterladen; es wird nie automatisch versendet.
      </p>
      <div style={{ border: `1px solid ${T.leinwandTief}`, borderRadius: 6, padding: "12px 14px", display: "grid", gap: 10 }}>
        <strong style={{ fontSize: 14 }}>Lokale technische Fehlerdiagnose</strong>
        <p style={{ margin: 0, color: T.rauch, fontSize: 12, lineHeight: 1.55 }}>
          Die Erfassung ist standardmäßig aus und bleibt lokal in diesem Browser. Ein späterer DB-Transport ist nur als gesperrter Vertrag vorbereitet: ohne bestätigte Servercapability, separates Flag und Adapter ist er inaktiv.
        </p>
        <label style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" data-local-diagnostics-toggle="true" checked={diagnoseAktiv} onChange={toggleDiagnose} />
          Sichere technische Fehler lokal erfassen
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: T.rauch, fontSize: 11 }}>{diagnosen.length} von maximal 20 Einträgen · 7 Tage Aufbewahrung</span>
          <button type="button" style={btnStyle(false)} disabled={!diagnosen.length} onClick={clearDiagnose}>Lokale Diagnosen leeren</button>
        </div>
        {diagnosen.length > 0 && (
          <details>
            <summary style={{ cursor: "pointer", color: T.rauch, fontSize: 12 }}>Lokale Diagnoseeinträge einsehen</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 6, color: T.rauch, fontSize: 11, lineHeight: 1.5 }}>
              {diagnosen.map((entry) => (
                <li key={`${entry.reference}:${entry.timestamp}`}>
                  <code>{entry.code}</code> · {entry.source}/{entry.operation} · {entry.timestamp} · {entry.count}× · {entry.reference}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btnStyle(false)} onClick={copy}>{copied ? "Supportdaten kopiert" : "Supportdaten kopieren"}</button>
        <button type="button" style={btnStyle(false)} onClick={download}>Supportdatei herunterladen</button>
      </div>
      <p style={{ margin: 0, color: T.rauch, fontSize: 11, lineHeight: 1.5 }}>Das Paket enthält nur Build, Umgebung, grobe Laufzeitklassen und feste Statuscodes – keine Namen, E-Mail-Adressen, URLs, Titel, Bewertungen, Notizen, Konto-IDs, Rohfehler, Freitexte, Stack-/Cause-Daten oder Speicherinhalte.</p>
    </div>
  );
}

export function SupportDaten({ ownerBestaetigt = false }) {
  if (ownerBestaetigt !== true) return null;
  return <BestaetigteSupportDaten ownerBestaetigt={ownerBestaetigt} />;
}

export function KontoLoeschung({
  accountActive = false,
  accountId = "",
  accountEmail = "",
  config = runtimeConfig,
  exportBeforeDelete,
  selfService = accountSelfService,
  reauthenticate = (password) => sessionCoordinator.reauthenticate(password),
  onAccountDeleted = () => sessionCoordinator.finalizeDeletedAccount(),
  createOperationId = () => globalThis.crypto?.randomUUID?.(),
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportReceipt, setExportReceipt] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("");
  const [runningAction, setRunningAction] = useState("");
  const [serverDeleted, setServerDeleted] = useState(false);
  const [localFinalizationPending, setLocalFinalizationPending] = useState(false);
  const operationRef = useRef(null);
  const account = { accountId, accountEmail };
  const accountKey = accountSelfServiceKey(account);
  const accountKeyRef = useRef(accountKey);
  accountKeyRef.current = accountKey;
  const serverExportDone = exportReceiptMatchesAccount(exportReceipt, account);
  const deleteEnabled = accountActive && config.privateSelfServiceEnabled === true
    && config.accountDeleteEnabled === true && !!accountKey && typeof exportBeforeDelete === "function";
  const expectedConfirmation = expectedAccountDeleteConfirmation(accountEmail);
  const operationRunning = !!runningAction;
  useEffect(() => {
    setExportReceipt(null);
    setPassword("");
    setConfirmation("");
    setDeleteStatus("");
    setServerDeleted(false);
    setLocalFinalizationPending(false);
  }, [accountKey]);
  const beginOperation = (kind) => {
    if (operationRef.current) return null;
    const token = Symbol(kind);
    operationRef.current = token;
    setRunningAction(kind);
    return token;
  };
  const finishOperation = (token) => {
    if (operationRef.current !== token) return;
    operationRef.current = null;
    setRunningAction("");
  };
  const downloadOwnData = async () => {
    const token = beginOperation("export");
    if (!token) return;
    const startedFor = accountKey;
    setDeleteStatus("");
    setExportReceipt(null);
    try {
      const receipt = await runExportBeforeAccountDeletion({
        account,
        exportPersonalData: exportBeforeDelete,
        readCurrentAccountKey: () => accountKeyRef.current,
      });
      if (accountKeyRef.current !== startedFor) return;
      setExportReceipt(receipt);
      setDeleteStatus("Vollständiges Gesamt-Backup wurde heruntergeladen. Prüfe die Datei vor der Löschung.");
    } catch {
      if (accountKeyRef.current !== startedFor) return;
      setDeleteStatus("Server-Eigendaten konnten nicht vollständig exportiert werden. Die Löschung bleibt gesperrt.");
    } finally { finishOperation(token); }
  };
  const deleteAccount = async () => {
    if (!deleteEnabled || serverDeleted || !serverExportDone || confirmation !== expectedConfirmation || !password) return;
    const token = beginOperation("delete");
    if (!token) return;
    const startedFor = accountKey;
    const submittedPassword = password;
    setPassword("");
    setDeleteStatus("");
    try {
      await runCurrentAccountDeletion({
        account,
        exportReceipt,
        password: submittedPassword,
        confirmation,
        reauthenticate,
        deleteRemote: (input) => selfService.deleteCurrentAccount(input),
        finalizeLocal: onAccountDeleted,
        createOperationId,
        readCurrentAccountKey: () => accountKeyRef.current,
      });
      if (accountKeyRef.current !== startedFor) return;
      setServerDeleted(true);
      setLocalFinalizationPending(false);
      setExportReceipt(null);
      setDeleteStatus("Konto serverseitig gelöscht und lokale Sitzung getrennt.");
    } catch (error) {
      if (accountKeyRef.current !== startedFor) return;
      if (error?.serverDeleted === true) {
        setServerDeleted(true);
        setLocalFinalizationPending(true);
        setExportReceipt(null);
        setDeleteStatus("Serverlöschung bestätigt. Die lokale Sitzung konnte noch nicht getrennt werden; bitte lokale Trennung erneut ausführen.");
      } else {
        setDeleteStatus("Kontolöschung serverseitig nicht bestätigt. Die lokale Sitzung und Daten bleiben unangetastet.");
      }
    } finally { finishOperation(token); }
  };
  const retryLocalFinalization = async () => {
    if (!serverDeleted) return;
    const token = beginOperation("local");
    if (!token) return;
    setDeleteStatus("");
    try {
      await finalizeDeletedAccountLocally(onAccountDeleted);
      setLocalFinalizationPending(false);
      setDeleteStatus("Lokale Sitzung und Kontodaten wurden getrennt.");
    } catch {
      setLocalFinalizationPending(true);
      setDeleteStatus("Das Konto ist serverseitig gelöscht. Die lokale Trennung ist weiterhin offen; bitte erneut versuchen.");
    } finally { finishOperation(token); }
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {!deleteEnabled && <p style={{ margin: 0, color: T.rauch, fontSize: 13, lineHeight: 1.6 }}>
        Die Kontolöschung ist derzeit nicht freigeschaltet. Bis zur abgeschlossenen Wegwerfkonto-Abnahme bleibt der Self-Service geschlossen.
      </p>}
      {deleteEnabled && (
        <details open={deleteOpen} onToggle={(event) => setDeleteOpen(event.currentTarget.open)}>
          <summary style={{ cursor: "pointer", color: T.gefahr, fontSize: 13 }}>Konto und Serverdaten endgültig löschen</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10, maxWidth: 520 }}>
            <p style={{ margin: 0, color: T.rauch, fontSize: 12, lineHeight: 1.55 }}>Zuerst ist ein vollständiges Gesamt-Backup mit lokalen und Server-Eigendaten Pflicht. Danach bestätigst du dein aktuelles Passwort und den exakten Löschsatz. Lokale Kontodaten und Sitzung werden erst nach bestätigter Serverlöschung getrennt.</p>
            <button type="button" style={btnStyle(false)} disabled={operationRunning || serverDeleted} onClick={downloadOwnData}>{runningAction === "export" ? "Gesamt-Backup wird erstellt …" : "Vollständiges Gesamt-Backup herunterladen"}</button>
            {!serverDeleted && <label style={{ color: T.rauch, fontSize: 12 }}>Aktuelles Passwort
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>}
            {!serverDeleted && <label style={{ color: T.rauch, fontSize: 12 }}>Zur Bestätigung exakt eingeben: <code>{expectedConfirmation}</code>
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>}
            {!serverDeleted && <button type="button" style={btnStyle(false)} disabled={operationRunning || !serverExportDone || !password || confirmation !== expectedConfirmation} onClick={deleteAccount}>{runningAction === "delete" ? "Löschung wird geprüft …" : "Konto endgültig löschen"}</button>}
            {serverDeleted && localFinalizationPending && <button type="button" style={btnStyle(false)} disabled={operationRunning} onClick={retryLocalFinalization}>{runningAction === "local" ? "Lokale Trennung läuft …" : "Lokale Sitzung jetzt trennen"}</button>}
            {deleteStatus && <p role="status" style={{ margin: 0, color: T.rauch, fontSize: 12 }}>{deleteStatus}</p>}
          </div>
        </details>
      )}
    </div>
  );
}

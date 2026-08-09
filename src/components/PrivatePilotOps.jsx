import { useMemo, useState } from "react";
import { PRIVATE_DATA_INVENTORY, PRIVATE_PROVIDER_REGISTRY, RETENTION_CLASSES } from "../lib/privatePilotOps.js";
import { supportBundleText } from "../lib/supportBundle.js";
import { T, btnStyle } from "../lib/tokens.js";
import { runtimeConfig } from "../config/runtime.js";
import { accountSelfService } from "../services/accountSelfService.js";
import { sessionCoordinator } from "../services/sessionCoordinator.js";

export function PrivatePilotOps({
  accountActive = false,
  accountEmail = "",
  selfService = accountSelfService,
  reauthenticate = (password) => sessionCoordinator.reauthenticate(password),
  onAccountDeleted = () => sessionCoordinator.finalizeDeletedAccount(),
}) {
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [serverExportDone, setServerExportDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("");
  const [deleteRunning, setDeleteRunning] = useState(false);
  const bundle = useMemo(() => supportBundleText({ checks: [{ id: "browser", code: globalThis.navigator?.onLine === false ? "OFFLINE" : "OK" }] }), []);
  const deleteEnabled = accountActive && runtimeConfig.privateSelfServiceEnabled === true
    && runtimeConfig.accountDeleteEnabled === true && !!accountEmail;
  const expectedConfirmation = `DELETE ${accountEmail}`;
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
  const downloadOwnData = async () => {
    setDeleteStatus("");
    setServerExportDone(false);
    try {
      const data = await selfService.getOwnData();
      const payload = JSON.stringify({ format: "kinodreieck-own-data", version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kinodreieck_eigendaten_${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setServerExportDone(true);
      setDeleteStatus("Server-Eigendaten wurden exportiert. Prüfe die Datei vor der Löschung.");
    } catch {
      setDeleteStatus("Server-Eigendaten konnten nicht vollständig exportiert werden. Die Löschung bleibt gesperrt.");
    }
  };
  const deleteAccount = async () => {
    if (!deleteEnabled || !serverExportDone || confirmation !== expectedConfirmation || !password) return;
    setDeleteRunning(true);
    setDeleteStatus("");
    try {
      await reauthenticate(password);
      const operationId = globalThis.crypto?.randomUUID?.();
      if (!operationId) throw new Error("operation-id-unavailable");
      await selfService.deleteCurrentAccount({ operationId, confirmation });
      setPassword("");
      await onAccountDeleted();
      setDeleteStatus("Konto serverseitig gelöscht und lokale Sitzung getrennt.");
    } catch {
      setDeleteStatus("Kontolöschung nicht bestätigt. Die lokale Sitzung und Daten bleiben unangetastet.");
    } finally { setDeleteRunning(false); }
  };
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
        <div><dt>Kontolöschung</dt><dd>{deleteEnabled ? "Self-Service technisch freigeschaltet" : "global deaktiviert; erst nach Wegwerfkonto-Abnahme freischaltbar"}</dd></div>
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btnStyle(false)} onClick={copy}>{copied ? "Supportdaten kopiert" : "Supportdaten kopieren"}</button>
        <button type="button" style={btnStyle(false)} onClick={download}>Supportdatei laden</button>
      </div>
      <p style={{ margin: 0, color: T.rauch, fontSize: 11, lineHeight: 1.5 }}>Das Supportpaket enthält nur Build, Umgebung, Online-Status und feste Statuscodes – keine Titel, Bewertungen, Konto-ID, URL, Speicherinhalte oder Zugangsdaten.</p>
      {deleteEnabled && (
        <details open={deleteOpen} onToggle={(event) => setDeleteOpen(event.currentTarget.open)}>
          <summary style={{ cursor: "pointer", color: T.gefahr, fontSize: 13 }}>Konto und Serverdaten endgültig löschen</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10, maxWidth: 520 }}>
            <p style={{ margin: 0, color: T.rauch, fontSize: 12, lineHeight: 1.55 }}>Zuerst ist ein vollständiger Server-Eigendatenexport Pflicht. Danach bestätigst du dein aktuelles Passwort und den exakten Löschsatz. Lokale Kontodaten und Sitzung werden erst nach bestätigter Serverlöschung getrennt.</p>
            <button type="button" style={btnStyle(false)} disabled={deleteRunning} onClick={downloadOwnData}>Server-Eigendaten herunterladen</button>
            <label style={{ color: T.rauch, fontSize: 12 }}>Aktuelles Passwort
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>
            <label style={{ color: T.rauch, fontSize: 12 }}>Zur Bestätigung exakt eingeben: <code>{expectedConfirmation}</code>
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>
            <button type="button" style={btnStyle(false)} disabled={deleteRunning || !serverExportDone || !password || confirmation !== expectedConfirmation} onClick={deleteAccount}>{deleteRunning ? "Löschung wird geprüft …" : "Konto endgültig löschen"}</button>
            {deleteStatus && <p role="status" style={{ margin: 0, color: T.rauch, fontSize: 12 }}>{deleteStatus}</p>}
          </div>
        </details>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  ACCOUNT_EXPORT_RELEASE_CONTRACT,
  ACCOUNT_EXPORT_REQUIRED_SCOPE,
  PRIVATE_DATA_INVENTORY,
  PRIVATE_PROVIDER_REGISTRY,
  RETENTION_CLASSES,
  istKontoExportVertragVollstaendig,
} from "../lib/privatePilotOps.js";
import { supportBundleText } from "../lib/supportBundle.js";
import {
  clearLocalDiagnostics,
  localDiagnosticsEnabled,
  readLocalDiagnostics,
  setLocalDiagnosticsEnabled,
} from "../lib/localDiagnostics.js";
import { T, btnStyle } from "../lib/tokens.js";
import { runtimeConfig } from "../config/runtime.js";
import {
  FeedbackOhneNamensangabe,
  Kontoloeschanfrage,
  PrivateMailPrivacyNote,
} from "./PrivateMailRequests.jsx";

function kontoExportIstFreigegeben({
  accountActive,
  config,
  accountExportContract,
  exportAccountData,
}) {
  return accountActive && config.privateSelfServiceEnabled === true
    && config.accountDeleteEnabled === true
    && istKontoExportVertragVollstaendig(accountExportContract)
    && typeof exportAccountData === "function";
}

export function DatenschutzUebersicht({
  accountActive = false,
  config = runtimeConfig,
  accountExportContract = ACCOUNT_EXPORT_RELEASE_CONTRACT,
  exportAccountData,
}) {
  const accountExportEnabled = kontoExportIstFreigegeben({
    accountActive,
    config,
    accountExportContract,
    exportAccountData,
  });
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
      <ManuellerDatenrechteWeg kontoExportFreigegeben={accountExportEnabled} />
      <PrivateMailPrivacyNote config={config} />
      <FeedbackOhneNamensangabe accountActive={accountActive} config={config} />
    </div>
  );
}

export function ManuellerDatenrechteWeg({ kontoExportFreigegeben = false }) {
  return (
    <section data-manual-data-rights="private-contact" style={{ display: "grid", gap: 6 }}>
      <strong style={{ color: T.leinwand, fontSize: 13 }}>Datenrechte manuell anfragen</strong>
      <p style={{ margin: 0, color: T.rauch, fontSize: 12, lineHeight: 1.55 }}>
        {kontoExportFreigegeben
          ? "Der vollständige Kontoexport ist unten separat verfügbar. Für weitere Auskunft, "
          : "Der Kontoexport ist in diesem Release nicht als Self-Service freigeschaltet. Für Auskunft, "}
        Berichtigung, Übertragbarkeit oder die Löschung deines Kontos nutzt du, falls du einen Kontozugang
        von Max erhalten hast, denselben privaten Kontaktweg. Die App veröffentlicht dafür keine private
        Adresse und versendet keine Anfrage automatisch. Die Sicherheitskopie dieses Geräts ist kein Kontoexport.
      </p>
    </section>
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

export function KontoDatenrechte({
  accountActive = false,
  config = runtimeConfig,
  accountExportContract = ACCOUNT_EXPORT_RELEASE_CONTRACT,
  exportAccountData,
}) {
  const [exportRunning, setExportRunning] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const accountExportEnabled = kontoExportIstFreigegeben({
    accountActive,
    config,
    accountExportContract,
    exportAccountData,
  });
  const downloadAccountData = async () => {
    if (!accountExportEnabled || exportRunning) return;
    setExportRunning(true);
    setExportStatus("");
    try {
      const exported = await exportAccountData();
      setExportStatus(exported === true
        ? "Vollständiger Kontoexport wurde heruntergeladen. Prüfe und verwahre die Datei selbst."
        : "Der vollständige Kontoexport konnte nicht erstellt werden.");
    } catch {
      setExportStatus("Der vollständige Kontoexport konnte nicht erstellt werden.");
    } finally {
      setExportRunning(false);
    }
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {!accountExportEnabled && (
        <p data-account-rights-location="privacy-overview" style={{ margin: 0, color: T.rauch, fontSize: 13, lineHeight: 1.6 }}>
          Den tatsächlichen Exportstatus und den manuellen Rechteweg findest du unter
          Über &amp; Rechtliches → Datenschutz &amp; Datenübersicht.
        </p>
      )}
      {accountExportEnabled && (
        <section data-account-export="verified" style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <strong style={{ color: T.leinwand, fontSize: 13 }}>Vollständiger Kontoexport</strong>
          <p style={{ margin: 0, color: T.rauch, fontSize: 12, lineHeight: 1.55 }}>
            Dieser Export ist vom lokalen Geräte-Download getrennt und umfasst exakt die folgenden Kontodaten:
          </p>
            <details>
              <summary style={{ cursor: "pointer", color: T.rauch, fontSize: 12 }}>Exakten Exportumfang anzeigen</summary>
              <ul data-account-export-scope="verified" style={{ margin: "8px 0 0", paddingLeft: 20, color: T.rauch, fontSize: 11, lineHeight: 1.5 }}>
                {ACCOUNT_EXPORT_REQUIRED_SCOPE.map((entry) => <li key={entry.id}>{entry.label}</li>)}
              </ul>
            </details>
          <button type="button" style={btnStyle(false)} disabled={exportRunning} onClick={downloadAccountData}>
            {exportRunning ? "Kontoexport wird erstellt …" : "Vollständigen Kontoexport herunterladen"}
          </button>
          {exportStatus && <p role="status" style={{ margin: 0, color: T.rauch, fontSize: 12 }}>{exportStatus}</p>}
        </section>
      )}
      <Kontoloeschanfrage accountActive={accountActive} config={config} />
    </div>
  );
}

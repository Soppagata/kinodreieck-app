import { T } from "../lib/tokens.js";
import { PRIVATE_RELEASE_CATALOG_AUDIT } from "../lib/catalogAudit.js";
import { MANDALORIAN_GROGU_TRACE } from "../lib/entdeckenFreshness.js";
import { formatPresentationDate } from "../lib/presentationDate.js";

const ZAHL = new Intl.NumberFormat("de-AT");

function Status({ value }) {
  const label = value === "known" || value === "passed" ? "belegt"
    : value === "limited" ? "limitiert"
      : value === "excluded" ? "ausgeschlossen"
        : value === "absent" || value === "expired" ? "fehlt"
          : "unbekannt";
  const color = ["known", "passed"].includes(value) ? T.wolfram
    : ["limited", "excluded", "absent", "expired"].includes(value) ? T.warum : T.rauch;
  return <span style={{ color, fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{label}</span>;
}

export function KatalogAuditStatus({
  audit = PRIVATE_RELEASE_CATALOG_AUDIT,
  titleTrace = MANDALORIAN_GROGU_TRACE,
}) {
  const cell = { padding: "7px 8px", borderBottom: `1px solid ${T.saalHoch}`, textAlign: "left" };
  return <div data-testid="streaming-catalog-audit" style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
    <p style={{ color: T.leinwandTief, fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
      <strong>{audit.scope}</strong> · Audit {formatPresentationDate(audit.observedOn)} · gespeicherter
      Snapshotvergleich <strong>voll</strong>, Beleg der vorgelagerten Pipeline <strong>limitiert</strong>.
    </p>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <caption style={{ textAlign: "left", color: T.rauch, paddingBottom: 6 }}>Zwei datierte Katalogstände</caption>
        <thead><tr><th style={cell}>Stand</th><th style={cell}>Discover</th><th style={cell}>Known</th><th style={cell}>Gesamt</th></tr></thead>
        <tbody>
          {[audit.previous, audit.current].map((snapshot) => <tr key={snapshot.date}>
            <td style={cell}>{formatPresentationDate(snapshot.date)}</td>
            <td style={cell}>{ZAHL.format(snapshot.discover)}</td>
            <td style={cell}>{ZAHL.format(snapshot.known)}</td>
            <td style={cell}>{ZAHL.format(snapshot.total)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p style={{ color: T.leinwandTief, fontSize: 12, lineHeight: 1.6, margin: "12px 0" }}>
      Discover-Vergleich: {ZAHL.format(audit.comparison.retained)} geblieben · {ZAHL.format(audit.comparison.removed)} entfernt · {ZAHL.format(audit.comparison.added)} hinzugekommen · {ZAHL.format(audit.comparison.reidentified)} nur umidentifiziert · {ZAHL.format(audit.comparison.strongIdDuplicates)} starke ID-Duplikate. Dieselben {audit.comparison.serviceCount} Dienste.
    </p>
    <p role="status" style={{ color: T.warum, fontSize: 12, lineHeight: 1.6, margin: "0 0 12px" }}>
      Die Differenz ist eine Snapshotdifferenz. Sie belegt keinen Marktabgang.
    </p>
    <details>
      <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: T.wolfram, fontSize: 13 }}>
        Acht Pipelinephasen anzeigen
      </summary>
      <ol style={{ margin: "4px 0 14px", paddingLeft: 22 }}>
        {audit.phases.map((phase) => <li key={phase.id} style={{ marginBottom: 8 }}>
          <strong>{phase.label}</strong> · <Status value={phase.status} />
          <div style={{ color: T.rauch, fontSize: 11, lineHeight: 1.5 }}>{phase.evidence}</div>
        </li>)}
      </ol>
    </details>
    <details data-testid="mandalorian-grogu-trace">
      <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: T.wolfram, fontSize: 13 }}>
        Warum fehlt „Mandalorian &amp; Grogu“?
      </summary>
      <p style={{ color: T.leinwandTief, fontSize: 12, lineHeight: 1.6 }}>
        Aktueller Vollkatalog: stabile Identität und Disney+-Verfügbarkeit belegt. Im alten Snapshot und im geprüften Format-6-Feed fehlt der Titel. Dieser Feed umfasst ausschließlich Joyn und den ÖFI-Wochenend-Kinopool; damit ist der Ausschluss erklärbar, aber kein Marktfehlen bewiesen. Profilmetadaten fehlen ebenfalls; gesehen oder in der Mediathek ist der Titel nicht.
      </p>
      <ul style={{ paddingLeft: 20 }}>
        {titleTrace.gates.map((gate) => <li key={gate.id} style={{ marginBottom: 7, fontSize: 12 }}>
          <strong>{gate.label}</strong> · <Status value={gate.status} />
          <div style={{ color: T.rauch, fontSize: 11, lineHeight: 1.5 }}>{gate.evidence}</div>
        </li>)}
      </ul>
      <p style={{ color: T.rauch, fontSize: 11, lineHeight: 1.6, marginBottom: 0 }}>
        Lokaler Kandidat für den providerfreien Entdecken-Pool: {titleTrace.targetRefreshSlaHours}-Stunden-Intervall.
        Die passende Migration wurde im Repository erstellt, aber weder auf die gemeinsame Datenbank angewandt noch deployt.
        Welches Intervall live für Entdecken oder Radar aktiv ist, ist nicht belegt. Letzter Versuch und letzter
        erfolgreicher Lauf waren im Audit nicht belegt; eine Live-Aktualisierung wurde nicht gestartet.
      </p>
    </details>
  </div>;
}

import { T } from "../lib/tokens.js";
import { PRIVATE_RELEASE_CATALOG_AUDIT } from "../lib/catalogAudit.js";
import { formatPresentationDate } from "../lib/presentationDate.js";

const ZAHL = new Intl.NumberFormat("de-AT");

export function KatalogAuditStatus({ audit = PRIVATE_RELEASE_CATALOG_AUDIT }) {
  const cell = { padding: "7px 8px", borderBottom: `1px solid ${T.saalHoch}`, textAlign: "left" };
  return <div data-testid="streaming-catalog-audit" style={{ background: T.saalHoch, borderRadius: 6, padding: "16px 18px" }}>
    <p style={{ color: T.leinwandTief, fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
      Gespeicherte Katalogstände vom {formatPresentationDate(audit.previous.date)} und {formatPresentationDate(audit.current.date)}.
    </p>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <caption style={{ textAlign: "left", color: T.rauch, paddingBottom: 6 }}>Streaming-Titel im gespeicherten Bestand</caption>
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
  </div>;
}

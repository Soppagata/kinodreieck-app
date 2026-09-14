import { PRIVATE_PROVIDER_REGISTRY } from "../lib/privatePilotOps.js";
import { T } from "../lib/tokens.js";

const textStyle = { margin: 0, fontSize: 12, lineHeight: 1.55 };

export function DatenschutzDienste({ titel = "Dienste, Empfänger und Datenquellen" }) {
  const linkStyle = { color: T.wolfram, textDecoration: "underline", textUnderlineOffset: 3 };
  return (
    <section data-datenschutz-dienste="central-registry" aria-label={titel} style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>{titel}</h3>
      <p style={textStyle}>
        Kinodreieck nutzt die folgenden Dienste und Quellen. „Optional“ bedeutet, dass der Datenweg nur bei der beschriebenen Funktion entsteht. Externe Kino- oder Beleglinks stellen erst beim Öffnen eine direkte Verbindung vom Browser zum jeweiligen Ziel her.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {PRIVATE_PROVIDER_REGISTRY.map((entry) => (
          <article key={entry.id} data-datenschutz-dienst={entry.id} style={{ border: "1px solid currentColor", borderRadius: 8, padding: 12, display: "grid", gap: 6 }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>{entry.name}</h4>
            <p style={textStyle}><strong>Zweck:</strong> {entry.purpose}</p>
            <p style={textStyle}><strong>Dabei verarbeitet:</strong> {entry.data}</p>
            <p style={textStyle}><strong>Nutzung:</strong> {entry.usage}</p>
            {entry.retentionNote && <p style={textStyle}>{entry.retentionNote}</p>}
            <p style={textStyle}>
              <a href={entry.officialSource} target="_blank" rel="noopener noreferrer" style={linkStyle}>{entry.officialSourceLabel}</a>
              {entry.technicalSource && <> · <a href={entry.technicalSource} target="_blank" rel="noopener noreferrer" style={linkStyle}>Technische Informationen</a></>}
              {entry.termsSource && <> · <a href={entry.termsSource} target="_blank" rel="noopener noreferrer" style={linkStyle}>Bedingungen</a></>}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

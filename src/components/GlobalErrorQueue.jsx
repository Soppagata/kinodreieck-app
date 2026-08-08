import { T } from "../lib/tokens.js";

export function GlobalErrorQueue({ errors, onDismiss }) {
  if (!errors?.length) return null;
  return (
    <div aria-label="Fehlermeldungen">
      {errors.map((fehler) => (
        <div key={fehler.id} role="alert" style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          background: "rgba(217,106,90,0.12)", border: "1px solid " + T.gefahr,
          borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 14,
        }}>
          <span style={{ flex: 1 }}>{fehler.text}</span>
          <button type="button" onClick={() => onDismiss(fehler.id)}
            aria-label={`Meldung schließen: ${fehler.text}`}
            style={{ border: 0, background: "transparent", color: T.leinwand, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

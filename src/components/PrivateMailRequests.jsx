import { useRef, useState } from "react";
import { runtimeConfig } from "../config/runtime.js";
import { T, btnStyle, inputStyle } from "../lib/tokens.js";
import {
  PRIVATE_MAIL_CLIENT_STATUS,
  privateMailRuntimeEnabled,
  privateMailService,
} from "../services/privateMail.js";
import { PRIVATE_MAIL_LIMITS } from "../../supabase/functions/_shared/privateMailContract.js";

const STATUS_TEXT = Object.freeze({
  [PRIVATE_MAIL_CLIENT_STATUS.ACCEPTED]: "Die Anfrage wurde angenommen. Die endgültige Zustellung ist damit noch nicht bestätigt.",
  [PRIVATE_MAIL_CLIENT_STATUS.REJECTED]: "Die Anfrage wurde nicht angenommen. Bitte versuche es später erneut.",
  [PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN]: "Der Ausgang ist gerade unklar. Sende nicht automatisch erneut; dein Text bleibt hier erhalten.",
  [PRIVATE_MAIL_CLIENT_STATUS.UNAVAILABLE]: "Der private Anfrageweg ist gerade nicht verfügbar. Bitte versuche es später erneut.",
});

function codePoints(value) { return [...String(value || "")]; }

function RequestStatus({ status }) {
  if (!status) return null;
  return <p role="status" data-private-mail-status={status} style={{ margin: 0, color: T.rauch, fontSize: 12, lineHeight: 1.55 }}>{STATUS_TEXT[status]}</p>;
}

export function PrivateMailPrivacyNote({ config = runtimeConfig }) {
  if (!privateMailRuntimeEnabled(config)) return null;
  return (
    <p data-private-mail-privacy="resend" style={{ margin: 0, color: T.rauch, fontSize: 11, lineHeight: 1.5 }}>
      Für diesen Versand verarbeitet Resend in den USA technische Zustellmetadaten und bewahrt sie standardmäßig 30 Tage auf. Feedback wird nicht mit Konto-, Profil-, Diagnose- oder Browserdaten ergänzt. Das ist eine verständliche Produktinformation, keine juristische Endfreigabe.
    </p>
  );
}

export function FeedbackOhneNamensangabe({
  accountActive = false,
  config = runtimeConfig,
  service = privateMailService,
}) {
  const [value, setValue] = useState("");
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [status, setStatus] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  if (!accountActive || !privateMailRuntimeEnabled(config)) return null;
  const count = codePoints(value).length;

  const submit = async (event) => {
    event.preventDefault();
    if (runningRef.current || count < 1 || count > PRIVATE_MAIL_LIMITS.feedbackCodePoints) return;
    runningRef.current = true;
    setRunning(true);
    setStatus("");
    try {
      const next = await service.submitFeedback(value);
      setStatus(Object.values(PRIVATE_MAIL_CLIENT_STATUS).includes(next?.status)
        ? next.status : PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN);
      if (next?.status === PRIVATE_MAIL_CLIENT_STATUS.ACCEPTED) setValue("");
    } catch {
      setStatus(PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus("Text kopiert.");
    } catch {
      setCopyStatus("Kopieren ist gerade nicht verfügbar.");
    }
  };

  return (
    <section data-private-mail-feedback="true" style={{ display: "grid", gap: 10 }}>
      <strong style={{ color: T.leinwand, fontSize: 13 }}>Feedback ohne Namensangabe</strong>
      <p style={{ margin: 0, color: T.rauch, fontSize: 12, lineHeight: 1.55 }}>
        Teile einen kurzen Hinweis über den privaten Versandweg. Es werden keine Kontaktadresse und kein Name mitgesendet.
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
        <label htmlFor="kd-private-feedback" style={{ color: T.rauch, fontSize: 12 }}>Dein Feedback</label>
        <textarea
          id="kd-private-feedback"
          rows={5}
          value={value}
          disabled={running}
          onChange={(event) => setValue(codePoints(event.target.value).slice(0, PRIVATE_MAIL_LIMITS.feedbackCodePoints).join(""))}
          style={{ ...inputStyle, resize: "vertical", width: "100%", boxSizing: "border-box" }}
        />
        <span data-private-mail-codepoints="true" style={{ color: T.rauch, fontSize: 11 }}>{count} / {PRIVATE_MAIL_LIMITS.feedbackCodePoints} Zeichen</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" style={btnStyle(true)} disabled={running || count < 1}>
            {running ? "Anfrage wird gesendet …" : "Feedback senden"}
          </button>
          {value && <button type="button" style={btnStyle(false)} disabled={running} onClick={copy}>Text kopieren</button>}
        </div>
      </form>
      <RequestStatus status={status} />
      {copyStatus && <p role="status" style={{ margin: 0, color: T.rauch, fontSize: 11 }}>{copyStatus}</p>}
    </section>
  );
}

export function Kontoloeschanfrage({
  accountActive = false,
  config = runtimeConfig,
  service = privateMailService,
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [status, setStatus] = useState("");
  if (!accountActive || !privateMailRuntimeEnabled(config)) return null;

  const submit = async () => {
    if (!confirmed || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setStatus("");
    try {
      const next = await service.requestAccountDeletion();
      setStatus(Object.values(PRIVATE_MAIL_CLIENT_STATUS).includes(next?.status)
        ? next.status : PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN);
    } catch {
      setStatus(PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  return (
    <section data-private-mail-account-deletion="true" style={{ display: "grid", gap: 10, maxWidth: 520 }}>
      <strong style={{ color: T.leinwand, fontSize: 13 }}>Kontolöschanfrage</strong>
      <p style={{ margin: 0, color: T.rauch, fontSize: 12, lineHeight: 1.55 }}>
        Diese authentifizierte Anfrage wird manuell geprüft und bearbeitet. Sie löscht dein Konto oder deine Daten nicht sofort.
      </p>
      <label style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 10, color: T.rauch, fontSize: 12 }}>
        <input type="checkbox" checked={confirmed} disabled={running} onChange={(event) => setConfirmed(event.target.checked === true)} />
        Ich möchte eine manuelle Kontolöschung anfragen.
      </label>
      <button type="button" style={btnStyle(false)} disabled={!confirmed || running} onClick={submit}>
        {running ? "Anfrage wird gesendet …" : "Kontolöschung anfragen"}
      </button>
      <RequestStatus status={status} />
    </section>
  );
}

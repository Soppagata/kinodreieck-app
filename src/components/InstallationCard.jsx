import { useState } from "react";
import { btnStyle } from "../lib/tokens.js";
import { installiereApp, useInstallationsStatus } from "../lib/installation.js";

export function InstallationCard({ kompakt = false }) {
  const status = useInstallationsStatus();
  const [meldung, setMeldung] = useState("");

  return (
    <section className={"kd-installkarte" + (kompakt ? " kd-installkarte-kompakt" : "")} aria-labelledby="kd-install-titel">
      <p className="kd-kicker">Auf diesem Gerät behalten</p>
      {/* Titel folgt dem Zustand — „installieren" wäre falsch, wenn die App
          bereits installiert ist oder als Einzeldatei läuft (Befund B5). */}
      <h2 id="kd-install-titel">{status.datei ? "Kinodreieck als Einzeldatei" : status.standalone ? "Kinodreieck ist installiert" : "Kinodreieck installieren"}</h2>
      {status.datei ? (
        <p className="kd-install-status">
          <strong>Du nutzt bereits die Einzeldatei.</strong> Sie läuft ohne PWA-Installation direkt aus dieser Datei. Die eingebauten Kino- und Streamingdaten sind synthetische Archivbeispiele, kein aktuelles Programm.
        </p>
      ) : status.standalone ? (
        <p className="kd-install-status"><strong>Bereits installiert.</strong> Kinodreieck läuft hier als App.</p>
      ) : status.ios ? (
        <div className="kd-install-anleitung">
          <p>Auf iPhone und iPad:</p>
          <ol>
            <li>In Safari unten auf <strong>Teilen</strong> tippen.</li>
            <li><strong>Zum Home-Bildschirm</strong> wählen.</li>
            <li>Mit <strong>Hinzufügen</strong> bestätigen.</li>
          </ol>
        </div>
      ) : status.installierbar ? (
        <button type="button" style={btnStyle(true)} onClick={async () => {
          const ergebnis = await installiereApp();
          if (!ergebnis.angenommen) setMeldung("Installation wurde nicht abgeschlossen. Du kannst sie jederzeit erneut starten.");
        }}>Als App installieren</button>
      ) : (
        <p className="kd-install-status">
          Öffne das Menü deines Browsers und wähle dort „App installieren“ oder „Zum Home-Bildschirm“.
        </p>
      )}

      {meldung && <p role="status" className="kd-inline-meldung">{meldung}</p>}
    </section>
  );
}

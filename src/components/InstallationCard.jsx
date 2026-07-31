import { useState } from "react";
import { T, btnStyle } from "../lib/tokens.js";
import { installiereApp, useInstallationsStatus } from "../lib/installation.js";

function downloadUrl(datei = "") {
  return import.meta.env.BASE_URL + "download/" + datei;
}

export function InstallationCard({ kompakt = false, zeigeEinzeldatei = true }) {
  const status = useInstallationsStatus();
  const [meldung, setMeldung] = useState("");

  return (
    <section className={"kd-installkarte" + (kompakt ? " kd-installkarte-kompakt" : "")} aria-labelledby="kd-install-titel">
      <p className="kd-kicker">Auf diesem Gerät behalten</p>
      <h2 id="kd-install-titel">Kinodreieck installieren</h2>
      {status.datei ? (
        <p className="kd-install-status"><strong>Du nutzt bereits die Einzeldatei.</strong> Sie läuft ohne PWA-Installation direkt aus dieser Datei.</p>
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
        <p className="kd-install-status">Die genaue Anleitung für deinen Browser findest du auf der Download-Seite.</p>
      )}

      {!status.datei && !status.standalone && !status.installierbar && (
        <a className="kd-linkbutton" href={downloadUrl()}>Installationsanleitung öffnen</a>
      )}
      {meldung && <p role="status" className="kd-inline-meldung">{meldung}</p>}
      {zeigeEinzeldatei && !status.datei && (
        <p className="kd-einzeldatei">
          Lieber ohne Installation? <a href={downloadUrl("Kinodreieck.html")} download>Einzeldatei herunterladen</a>
        </p>
      )}
    </section>
  );
}

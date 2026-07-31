import { Component } from "react";
import { baueBackup } from "../lib/backup.js";

function technischeFehlerId() {
  try {
    return "KD-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  } catch {
    return "KD-" + Date.now().toString(36).toUpperCase();
  }
}

function ladeJsonHerunter(dateiname, daten) {
  const blob = new Blob([JSON.stringify(daten, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = dateiname;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class AppErrorBoundary extends Component {
  state = {
    fehler: null,
    fehlerId: null,
    backupStatus: "",
  };

  static getDerivedStateFromError() {
    return {
      fehler: true,
      fehlerId: technischeFehlerId(),
      backupStatus: "",
    };
  }

  componentDidCatch() {
    /* Kein Telemetrieversand und bewusst auch kein Fehlertext im DOM:
       eine geworfene Meldung kann Titel, Notiz oder andere Nutzerdaten tragen. */
  }

  async notfallBackup() {
    this.setState({ backupStatus: "Backup wird vorbereitet …" });
    try {
      const backup = await baueBackup({ pull: false });
      ladeJsonHerunter(
        "kinodreieck_notfall_backup_"
          + new Date().toISOString().slice(0, 10)
          + ".json",
        backup,
      );
      this.setState({ backupStatus: "Backup wurde heruntergeladen." });
    } catch {
      this.setState({
        backupStatus: "Das Backup konnte leider nicht erstellt werden.",
      });
    }
  }

  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <main style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#171519",
        color: "#ece8df",
        fontFamily: "system-ui, sans-serif",
      }}>
        <section style={{
          width: "min(42rem, 100%)",
          border: "1px solid rgba(236,232,223,.2)",
          borderRadius: 12,
          padding: "clamp(1.25rem, 4vw, 2.5rem)",
          background: "#211e26",
        }}>
          <p style={{
            color: "#e3a63b",
            fontWeight: 800,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}>
            Kinodreieck wurde angehalten
          </p>
          <h1 style={{ fontSize: "clamp(2rem, 7vw, 3.5rem)", lineHeight: 1 }}>
            Die Ansicht konnte nicht sicher aufgebaut werden.
          </h1>
          <p style={{ color: "#c8c2ce", lineHeight: 1.6 }}>
            Deine gespeicherten Daten wurden dadurch nicht absichtlich
            verändert. Versuche zuerst ein lokales Gesamt-Backup und lade die
            App anschließend neu.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="button" onClick={() => this.notfallBackup()}>
              Gesamt-Backup versuchen
            </button>
            <button type="button" onClick={() => location.reload()}>
              App neu laden
            </button>
          </div>
          {this.state.backupStatus && (
            <p role="status">{this.state.backupStatus}</p>
          )}
          <p style={{ color: "#aaa4b1", fontSize: ".82rem" }}>
            Technische Fehler-ID: {this.state.fehlerId}
          </p>
        </section>
      </main>
    );
  }
}

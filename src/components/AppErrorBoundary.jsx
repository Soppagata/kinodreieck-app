import { Component } from "react";
import { baueBackup } from "../lib/backup.js";
import { createDiagnosticReference, recordLocalDiagnostic } from "../lib/localDiagnostics.js";

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
      fehlerId: createDiagnosticReference(),
      backupStatus: "",
    };
  }

  componentDidCatch() {
    /* Das Error-Objekt wird absichtlich nicht entgegengenommen. Meldung, Stack
       und Cause können Titel, Notizen oder andere Nutzerdaten enthalten. */
    try {
      recordLocalDiagnostic({
        code: "UI_RENDER_CRASH",
        source: "APP_ERROR_BOUNDARY",
        operation: "RENDER",
        reference: this.state.fehlerId,
      }, { ownerConfirmed: this.props.ownerDiagnosticsConfirmed === true });
    } catch { /* Lokale Diagnose darf die sichere Fehleransicht nie blockieren. */ }
  }

  async notfallBackup() {
    this.setState({ backupStatus: "Lokale Sicherheitskopie wird vorbereitet …" });
    try {
      const backup = await baueBackup({ pull: false });
      ladeJsonHerunter(
        "kinodreieck_notfall_sicherheitskopie_geraet_"
          + new Date().toISOString().slice(0, 10)
          + ".json",
        backup,
      );
      this.setState({ backupStatus: "Die Sicherheitskopie dieses Geräts wurde als Download ausgelöst." });
    } catch {
      this.setState({
        backupStatus: "Die Sicherheitskopie dieses Geräts konnte leider nicht erstellt werden.",
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
            verändert. Versuche zuerst, eine Sicherheitskopie dieses Geräts
            herunterzuladen, und lade die App anschließend neu.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button type="button" onClick={() => this.notfallBackup()}>
              Sicherheitskopie dieses Geräts versuchen
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

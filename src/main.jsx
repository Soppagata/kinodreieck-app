import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/design-foundation.css";
import "./styles/design-primary.css";
import "./styles/design-secondary.css";
import "./styles/design-shell.css";
import App from "./App.jsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import { sessionCoordinator, STORAGE_SESSION_STATES } from "./services/sessionCoordinator.js";
import { activeSyncStatus, subscribeStorageContext } from "./services/storage.js";
import { startAccountAutoSync } from "./services/accountAutoSync.js";
import { EinstiegsGate } from "./components/EinstiegsGate.jsx";
import { AppUpdateHinweis } from "./components/AppUpdateHinweis.jsx";
import { bereinigeVeralteteImportSnapshots } from "./lib/personalDataRegistry.js";
import { purgeExpiredLocalData } from "./lib/localRetention.js";
import { hatBestaetigteOwnerRolle } from "./lib/accountAccess.js";
import { purgeLocalDiagnostics } from "./lib/localDiagnostics.js";

/* Startreihenfolge (Etappe 3):
   1. Sitzung laden/erneuern — ohne gespeicherte Anmeldung bleibt es beim Gast.
   2. Die Konto-/Cache-Grenze aus einer Stelle ausrichten. Nur ein bereits für
      dieses Konto bestätigter Cache wird aktiviert und abgeglichen; andernfalls
      bleibt der Alltagsspeicher bis zur Übernahmeentscheidung lokal.
   3. Erst danach den freigegebenen App-Baum rendern.
   Ein gewöhnlicher Netzfehler behält die lokale, kontogebundene Sitzung. Kann
   die Konto-/Gast-Grenze dagegen nicht sicher hergestellt werden, bleibt der
   persönliche Speicher maskiert und nur die Privacy-Wiederherstellung wird
   gerendert. Offline heißt nie automatisch "ausgeloggt". */
const root = createRoot(document.getElementById("root"));
let bootGerendert = false;

function PrivacyRecovery() {
  const [benutzer, setBenutzer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  async function anmelden(event) {
    event.preventDefault();
    if (laeuft) return;
    setLaeuft(true); setFehler("");
    try { await sessionCoordinator.signIn(benutzer, passwort); setPasswort(""); }
    catch (error) {
      setFehler(error?.message || "Der geschützte Kontocache konnte nicht freigegeben werden.");
    } finally { setLaeuft(false); }
  }
  return (
    <main className="kd-privacy-recovery">
      <section className="kd-privacy-recovery-karte" aria-labelledby="kd-privacy-recovery-titel">
      <h1 id="kd-privacy-recovery-titel">Persönliche Daten sind geschützt</h1>
      <p>
        Der lokale Kontocache konnte nicht sicher vom Gastbetrieb getrennt werden.
        Deshalb zeigt Kinodreieck vorerst keine persönlichen Daten an. Lokale Kontodaten
        und noch ungesicherte Änderungen bleiben auf diesem Gerät geschützt. Melde dich
        mit demselben Konto erneut an oder lade die Seite neu; lösche bis dahin keine Browserdaten.
      </p>
      <form className="kd-privacy-recovery-form" onSubmit={anmelden}>
        <label>Benutzername<input value={benutzer} onChange={(e) => setBenutzer(e.target.value)} autoComplete="username" required /></label>
        <label>Passwort<input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="current-password" required /></label>
        <button type="submit" disabled={laeuft}>{laeuft ? "Prüft …" : "Mit demselben Konto entsperren"}</button>
        {fehler && <p className="kd-privacy-recovery-fehler" role="alert">{fehler}</p>}
      </form>
      </section>
    </main>
  );
}

function appBaum() {
  if (sessionCoordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED) {
    return <PrivacyRecovery />;
  }
  return (
    <StrictMode>
      <AppErrorBoundary ownerDiagnosticsConfirmed={hatBestaetigteOwnerRolle(sessionCoordinator.getSnapshot())}>
        <AppUpdateHinweis />
        <EinstiegsGate><App /></EinstiegsGate>
      </AppErrorBoundary>
    </StrictMode>
  );
}

function renderSicherenBaum() {
  root.render(appBaum());
}

/* Bei einem späteren Sessionablauf wird zuerst der Coordinator-Zaun geprüft.
   Schlägt selbst die Quarantäne fehl, hängt dieser Listener den gesamten App-
   Baum (und damit auch bereits geladene Account-State-Objekte) sofort aus. */
sessionCoordinator.subscribe(() => {
  if (bootGerendert) renderSicherenBaum();
});
subscribeStorageContext(() => {
  if (bootGerendert) renderSicherenBaum();
});

async function boot() {
  /* Datenschutzmigration: tote Import-Rohsnapshots und Geheimnisreste der
     stillgelegten Legacy-Treiber verschwinden auch bei Upgrade-Nutzern. */
  bereinigeVeralteteImportSnapshots();
  purgeExpiredLocalData();
  purgeLocalDiagnostics();
  try { await sessionCoordinator.initialize(); }
  catch { /* Der Coordinator hat Gast-, Konto- oder Privacy-Lock bereits fail-closed gesetzt. */ }

  bootGerendert = true;
  renderSicherenBaum();
  startAccountAutoSync({ coordinator: sessionCoordinator, status: activeSyncStatus });
}

boot();

/* PWA: Service Worker nur in echten Browser-Kontexten registrieren. Unter
   file:// kann die API zwar vorhanden sein; eine Registrierung ist dort aber
   nicht nutzbar und wird bewusst nicht versucht. */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator
  && String(globalThis.location?.protocol || "").toLowerCase() !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", {
      updateViaCache: "none",
    }).catch(() => { /* PWA optional */ });
  });
}

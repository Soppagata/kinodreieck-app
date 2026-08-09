import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import { sessionCoordinator, STORAGE_SESSION_STATES } from "./services/sessionCoordinator.js";
import { subscribeStorageContext } from "./services/storage.js";
import { EinstiegsGate } from "./components/EinstiegsGate.jsx";
import { AppUpdateHinweis } from "./components/AppUpdateHinweis.jsx";
import { bereinigeVeralteteImportSnapshots } from "./lib/personalDataRegistry.js";
import { purgeExpiredLocalData } from "./lib/localRetention.js";

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
    <main style={{ maxWidth: 680, margin: "48px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24 }}>Persönliche Daten sind geschützt</h1>
      <p>
        Der lokale Kontocache konnte nicht sicher vom Gastbetrieb getrennt werden.
        Deshalb zeigt Kinodreieck vorerst keine persönlichen Daten an. Lokale Kontodaten
        und noch ungesicherte Änderungen bleiben auf diesem Gerät geschützt. Melde dich
        mit demselben Konto erneut an oder lade die Seite neu; lösche bis dahin keine Browserdaten.
      </p>
      <form onSubmit={anmelden} style={{ display: "grid", gap: 10, maxWidth: 360 }}>
        <label>Benutzername<input value={benutzer} onChange={(e) => setBenutzer(e.target.value)} autoComplete="username" required style={{ display: "block", width: "100%", marginTop: 4 }} /></label>
        <label>Passwort<input type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="current-password" required style={{ display: "block", width: "100%", marginTop: 4 }} /></label>
        <button type="submit" disabled={laeuft}>{laeuft ? "Prüft …" : "Mit demselben Konto entsperren"}</button>
        {fehler && <p role="alert" style={{ color: "#b42318", margin: 0 }}>{fehler}</p>}
      </form>
    </main>
  );
}

function appBaum() {
  if (sessionCoordinator.getStorageState() === STORAGE_SESSION_STATES.PRIVACY_LOCKED) {
    return <PrivacyRecovery />;
  }
  return (
    <StrictMode>
      <AppErrorBoundary>
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
  try { await sessionCoordinator.initialize(); }
  catch { /* Der Coordinator hat Gast-, Konto- oder Privacy-Lock bereits fail-closed gesetzt. */ }

  bootGerendert = true;
  renderSicherenBaum();
}

boot();

/* Die Sitzung wird beim Sichtbarwerden geprüft, nicht per Zeitgeber: iOS hält
   Zeitgeber in der installierten App an, sobald sie in den Hintergrund geht. */
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sessionCoordinator.refresh().catch(() => { /* stiller Versuch */ });
    }
  });
}

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

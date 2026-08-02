import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import { sessionCoordinator } from "./services/sessionCoordinator.js";
import { EinstiegsGate } from "./components/EinstiegsGate.jsx";
import { AppUpdateHinweis } from "./components/AppUpdateHinweis.jsx";

/* Startreihenfolge (Etappe 3):
   1. Sitzung laden/erneuern — ohne gespeicherte Anmeldung bleibt es beim Gast.
   2. Die Konto-/Cache-Grenze aus einer Stelle ausrichten. Nur ein bereits für
      dieses Konto bestätigter Cache wird aktiviert und abgeglichen; andernfalls
      bleibt der Alltagsspeicher bis zur Übernahmeentscheidung lokal.
   3. Rendern.
   Jeder Schritt ist fehlertolerant: schlägt etwas fehl, startet die App als
   Gast bzw. mit dem lokalen Stand. Offline heißt nie "ausgeloggt". */
const root = createRoot(document.getElementById("root"));

async function boot() {
  try { await sessionCoordinator.initialize(); }
  catch { /* Gastmodus beziehungsweise lokaler Stand bleibt verfügbar */ }

  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <AppUpdateHinweis />
        <EinstiegsGate><App /></EinstiegsGate>
      </AppErrorBoundary>
    </StrictMode>,
  );
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

/* PWA: Service Worker registrieren (nur echte Browser mit Support; in file://
   und jsdom fehlt navigator.serviceWorker → übersprungen, kein Testbruch). */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", {
      updateViaCache: "none",
    }).catch(() => { /* PWA optional */ });
  });
}

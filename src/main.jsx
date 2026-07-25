import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { authService } from "./services/auth.js";
import { aktiviereKontoTreiber, activePull } from "./services/storage.js";

/* Startreihenfolge (Etappe 3):
   1. Sitzung laden/erneuern — ohne gespeicherte Anmeldung bleibt es beim Gast.
   2. Bei gültiger Anmeldung den Account-Treiber aktivieren.
   3. Einen Abgleich versuchen (best effort, mit Zeitlimit) — die App liest ihre
      Töpfe beim ersten Rendern genau einmal, deshalb vor dem Rendern.
   4. Rendern.
   Jeder Schritt ist fehlertolerant: schlägt etwas fehl, startet die App als
   Gast bzw. mit dem lokalen Stand. Offline heißt nie "ausgeloggt". */
const root = createRoot(document.getElementById("root"));

async function boot() {
  try {
    const session = await authService.initialize();
    if (session?.mode === "account" && session.account?.id) {
      aktiviereKontoTreiber(session.account.id);
      try { await activePull(); } catch { /* Start gelingt auch ohne frischen Abgleich */ }
    }
  } catch { /* Gastmodus bleibt verfügbar */ }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();

/* Die Sitzung wird beim Sichtbarwerden geprüft, nicht per Zeitgeber: iOS hält
   Zeitgeber in der installierten App an, sobald sie in den Hintergrund geht. */
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      authService.refresh().catch(() => { /* stiller Versuch */ });
    }
  });
}

/* PWA: Service Worker registrieren (nur echte Browser mit Support; in file://
   und jsdom fehlt navigator.serviceWorker → übersprungen, kein Testbruch). */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => { /* PWA optional */ });
  });
}

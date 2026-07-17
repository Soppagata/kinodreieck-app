import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { setStorageDriver } from "./lib/storage.js";
import { gitDriver, isGitConfigured, syncPull, syncFlush } from "./lib/gitDriver.js";

/* Boot: Ist ein Git-Sync konfiguriert, wird der Git-Treiber aktiviert und VOR
   dem Mounten der App einmal gepullt (Pull-on-start) — so füllt der Pull den
   localStorage-Cache, bevor die App ihn (teils synchron) liest. Ohne Konfig
   bleibt der lokale Treiber aktiv: identisches Verhalten wie bisher. */
const root = createRoot(document.getElementById("root"));

function ladeanzeige(text) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#171519", color: "#e8b64c", fontFamily: "system-ui, sans-serif", fontSize: 15 }}>
      {text}
    </div>
  );
}

async function boot() {
  if (isGitConfigured()) {
    setStorageDriver(gitDriver);
    root.render(ladeanzeige("Synchronisiere mit deinem Daten-Repo …"));
    try { await syncPull(); } catch { /* offline: Cache bleibt gültig, App startet trotzdem */ }
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // Nach dem Mounten ausstehende (offline liegen gebliebene) Commits nachreichen.
  if (isGitConfigured()) { syncFlush().catch(() => { /* still, Status zeigt Pending */ }); }
}

boot();

/* PWA: Service Worker registrieren (nur echte Browser mit Support; in file://
   und jsdom fehlt navigator.serviceWorker → übersprungen, kein Testbruch). */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => { /* PWA optional */ });
  });
}

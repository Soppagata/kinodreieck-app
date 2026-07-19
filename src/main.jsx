import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { setStorageDriver, getTreiber } from "./lib/storage.js";
import { gitDriver, isGitConfigured, syncPull as gitPull, syncFlush as gitFlush } from "./lib/gitDriver.js";
import { supabaseDriver, isSupabaseConfigured, syncPull as sbPull, syncFlush as sbFlush } from "./lib/supabaseDriver.js";

/* Boot: Der aktive Treiber ergibt sich aus der Wahl kd:treiber:
     "supabase" (+ konfiguriert) => Supabase-Treiber
     "git" oder fehlend (+ Git konfiguriert) => Git-Treiber (bisheriges Verhalten)
     sonst => lokaler Treiber (identisch wie bisher).
   Der gewählte Treiber wird VOR dem Mounten einmal gepullt (Pull-on-start) — so
   füllt der Pull den localStorage-Cache, bevor die App ihn (teils synchron) liest. */
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
  const t = getTreiber(); // "git" | "supabase" | null
  let flush = null;
  if (t === "supabase" && isSupabaseConfigured()) {
    setStorageDriver(supabaseDriver);
    root.render(ladeanzeige("Synchronisiere mit deiner Datenbank …"));
    try { await sbPull(); } catch { /* offline: Cache bleibt gültig, App startet trotzdem */ }
    flush = sbFlush;
  } else if ((t === "git" || t == null) && isGitConfigured()) {
    setStorageDriver(gitDriver);
    root.render(ladeanzeige("Synchronisiere mit deinem Daten-Repo …"));
    try { await gitPull(); } catch { /* offline: Cache bleibt gültig, App startet trotzdem */ }
    flush = gitFlush;
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // Nach dem Mounten ausstehende (offline liegen gebliebene) Commits nachreichen.
  if (flush) { flush().catch(() => { /* still, Status zeigt Pending */ }); }
}

boot();

/* PWA: Service Worker registrieren (nur echte Browser mit Support; in file://
   und jsdom fehlt navigator.serviceWorker → übersprungen, kein Testbruch). */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => { /* PWA optional */ });
  });
}

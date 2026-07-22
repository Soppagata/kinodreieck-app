import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

/* Persönliche Tester-Daten starten lokal. Der gemeinsame Kino-/Streamingkatalog
   wird unabhängig davon mit einem reinen Leseschlüssel aus Supabase geladen. */
const root = createRoot(document.getElementById("root"));

async function boot() {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();

/* PWA: Service Worker registrieren (nur echte Browser mit Support; in file://
   und jsdom fehlt navigator.serviceWorker → übersprungen, kein Testbruch). */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => { /* PWA optional */ });
  });
}

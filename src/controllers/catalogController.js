/* Gemeinsame Projektion und lokale Fallbacks des Katalog-Lebenszyklus.
   Die App verwaltet weiterhin React-State; dieses Modul entscheidet nur, wie
   Online-Katalog und Downloadbeilage in dieselbe fachliche Form gelangen. */

import { catalogService } from "../services/catalog.js";
import { demoSeedZuLadung } from "../lib/catalogProjection.js";
import streamingBekanntSnapshot from "../data/streaming_bekannt_snapshot.json";
import streamingEntdeckenSnapshot from "../data/streaming_entdecken_snapshot.json";
import programmSnapshot from "../data/programm-snapshot.json";

export { streamingBekanntSnapshot, streamingEntdeckenSnapshot, programmSnapshot };
export { zeitpunkt, IMPORT_INFO, demoSeedZuLadung } from "../lib/catalogProjection.js";

let demoLadePromise = null;
function ladeDemoGlobal() {
  if (typeof window !== "undefined" && window.__KD_DEMO_SEED__) {
    return Promise.resolve(window.__KD_DEMO_SEED__);
  }
  if (typeof window !== "undefined" && window.__KD_DEMO_MASTER__) {
    return Promise.resolve({ format: 1, master: window.__KD_DEMO_MASTER__ });
  }
  if (demoLadePromise) return demoLadePromise;
  demoLadePromise = new Promise((resolve, reject) => {
    try {
      const script = document.createElement("script");
      script.src = "Programmdateien/System/demo_masterliste.js";
      script.onload = () => {
        if (window.__KD_DEMO_SEED__) resolve(window.__KD_DEMO_SEED__);
        else if (window.__KD_DEMO_MASTER__) resolve({ format: 1, master: window.__KD_DEMO_MASTER__ });
        else reject(new Error("demo_masterliste.js geladen, aber leer."));
      };
      script.onerror = () => {
        demoLadePromise = null;
        reject(new Error("demo_masterliste.js nicht ladbar — fehlt Programmdateien/System/demo_masterliste.js im Paket?"));
      };
      document.head.appendChild(script);
    } catch (error) {
      demoLadePromise = null;
      reject(error);
    }
  });
  return demoLadePromise;
}

export async function demoLadung() {
  try {
    return demoSeedZuLadung(await catalogService.loadDemo());
  } catch (error) {
    /* Gehostet müssen DB-Fehler sichtbar bleiben. Nur file:// und ausdrücklich
       injizierte Test-/Legacybeilagen dürfen autark zurückfallen. */
    const file = typeof location !== "undefined" && location.protocol === "file:";
    const beilageVorhanden = typeof window !== "undefined"
      && (!!window.__KD_DEMO_SEED__ || !!window.__KD_DEMO_MASTER__);
    if (!file && !beilageVorhanden) throw error;
  }
  return demoSeedZuLadung(await ladeDemoGlobal());
}

let entdeckenBeilagePromise = null;
export function ladeEntdeckenBeilage() {
  if (typeof window !== "undefined" && window.__KD_STREAMING_ENTDECKEN__) {
    return Promise.resolve(window.__KD_STREAMING_ENTDECKEN__);
  }
  if (entdeckenBeilagePromise) return entdeckenBeilagePromise;
  entdeckenBeilagePromise = new Promise((resolve) => {
    try {
      const script = document.createElement("script");
      script.src = "Programmdateien/System/streaming_entdecken.js";
      script.onload = () => resolve(window.__KD_STREAMING_ENTDECKEN__ || null);
      script.onerror = () => {
        entdeckenBeilagePromise = null;
        resolve(null);
      };
      document.head.appendChild(script);
    } catch {
      entdeckenBeilagePromise = null;
      resolve(null);
    }
  });
  return entdeckenBeilagePromise;
}

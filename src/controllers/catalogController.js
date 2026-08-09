/* Gemeinsame Projektion und lokale Fallbacks des Katalog-Lebenszyklus.
   Die App verwaltet weiterhin React-State; dieses Modul entscheidet nur, wie
   Online-Katalog und Downloadbeilage in dieselbe fachliche Form gelangen. */

import { catalogService } from "../services/catalog.js";
import { demoSeedZuLadung } from "../lib/catalogProjection.js";
import streamingBekanntSnapshot from "../data/streaming_bekannt_snapshot.json";
import streamingEntdeckenSnapshot from "../data/streaming_entdecken_snapshot.json";
import programmSnapshotRoh from "../data/programm-snapshot.json";

/* Nur der Single-File-Build ersetzt diese Konstante. Modul-/Node-Tests und der
   normale Web-Build bleiben ohne globalen Schalter lauffähig. */
const EINZELDATEI_BUILD = typeof __KD_SINGLE_FILE__ !== "undefined"
  && __KD_SINGLE_FILE__ === true;
const programmSnapshot = EINZELDATEI_BUILD ? Object.freeze({
  ...programmSnapshotRoh,
  archiviert: true,
  quelle_hinweis: "Archiviertes synthetisches Offline-Beispiel – kein aktuelles Kinoprogramm",
}) : programmSnapshotRoh;

export { streamingBekanntSnapshot, streamingEntdeckenSnapshot, programmSnapshot };
export {
  zeitpunkt,
  IMPORT_INFO,
  demoSeedZuLadung,
  streamingPayloadMitMetadaten,
} from "../lib/catalogProjection.js";

function hatUnsicherenLegacyDemoSeed() {
  try {
    const seed = JSON.parse(globalThis.localStorage?.getItem("kd:demo-seed") || "null");
    return !!seed && (
      (seed.pins && !Array.isArray(seed.pinKeys))
      || (seed.merkliste && !Array.isArray(seed.merklisteIds))
      || (seed.streaming && !Array.isArray(seed.streamingQuellen))
    );
  } catch {
    return false;
  }
}

let demoLadePromise = null;
function ladeDemoGlobal() {
  if (typeof window !== "undefined" && window.__KD_DEMO_SEED__) {
    return Promise.resolve(window.__KD_DEMO_SEED__);
  }
  if (typeof window !== "undefined" && window.__KD_DEMO_MASTER__) {
    return Promise.resolve({ format: 1, master: window.__KD_DEMO_MASTER__ });
  }
  /* Im Einzeldatei-Build ist der Seed ein harter Buildvertrag. Fehlt er trotz
     Validierung, darf die App keine nicht mitgelieferte Nachbardatei suchen. */
  if (EINZELDATEI_BUILD) {
    return Promise.reject(new Error("Eingebetteter Demo-Seed der Einzeldatei fehlt."));
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
    /* Ein alter Boolean-Seed verrät nicht, aus welcher früheren Demo-Version
       Pins/Merker/Quellen stammen. Der aktuelle Inline-Seed wäre dafür kein
       belastbarer Löschbeleg; hier bleibt der bisherige fail-closed Vertrag. */
    if (hatUnsicherenLegacyDemoSeed()) throw error;
  }
  return demoSeedZuLadung(await ladeDemoGlobal());
}

let entdeckenBeilagePromise = null;
export function ladeEntdeckenBeilage() {
  if (typeof window !== "undefined" && window.__KD_STREAMING_ENTDECKEN__) {
    return Promise.resolve(window.__KD_STREAMING_ENTDECKEN__);
  }
  /* Der Snapshot ist ohnehin Teil des Bundles. Damit führt file:// weder einen
     nutzlosen Dateiaufruf aus noch hängt seine Funktion an einem Nebenordner. */
  if (EINZELDATEI_BUILD) return Promise.resolve(streamingEntdeckenSnapshot);
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

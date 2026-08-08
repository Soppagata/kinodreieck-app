import { useCallback, useEffect, useRef, useState } from "react";
import { runtimeConfig } from "../config/runtime.js";
import {
  aktualisiereServiceWorker,
  ladeBuildMeta,
  neuerBuild,
  pruefbareUmgebung,
  sichtbarerUpdateBuild,
} from "../lib/appUpdate.js";

const PRUEF_INTERVALL_MS = 5 * 60 * 1000;
const MINDEST_ABSTAND_MS = 15 * 1000;

export function AppUpdateHinweis() {
  const [neueVersion, setNeueVersion] = useState("");
  const [laedt, setLaedt] = useState(false);
  const aktivRef = useRef(true);
  const prueftRef = useRef(false);
  const letztePruefungRef = useRef(0);
  const geschlossenerBuildRef = useRef("");
  const baseUrl = import.meta.env.BASE_URL || "./";

  const zeigeBuild = useCallback((version) => {
    const sichtbar = sichtbarerUpdateBuild(version, geschlossenerBuildRef.current);
    if (!aktivRef.current || !sichtbar) return false;
    setNeueVersion(sichtbar);
    return true;
  }, []);

  const pruefe = useCallback(async () => {
    const jetzt = Date.now();
    if (!pruefbareUmgebung(runtimeConfig.appEnvironment)
      || prueftRef.current
      || jetzt - letztePruefungRef.current < MINDEST_ABSTAND_MS) return;
    letztePruefungRef.current = jetzt;
    prueftRef.current = true;
    try {
      const meta = await ladeBuildMeta({ baseUrl });
      const version = neuerBuild(meta, runtimeConfig.buildVersion);
      if (zeigeBuild(version)) {
        /* Den neuen Worker bereits laden. Aktiv neu navigiert wird bewusst erst
           nach Nutzerbestätigung, damit kein offenes Formular verloren geht. */
        aktualisiereServiceWorker({ baseUrl }).catch(() => {});
      }
    } catch {
      /* Offline ist ein normaler PWA-Zustand. Beim nächsten Fokus wird erneut geprüft. */
    } finally {
      prueftRef.current = false;
    }
  }, [baseUrl, zeigeBuild]);

  useEffect(() => {
    aktivRef.current = true;
    if (!pruefbareUmgebung(runtimeConfig.appEnvironment)) return undefined;

    const beiSichtbar = () => {
      if (document.visibilityState === "visible") pruefe();
    };
    const beiWorkerNachricht = (event) => {
      if (event?.data?.type !== "KD_BUILD_ACTIVATED") return;
      const version = neuerBuild(
        { format: 1, buildVersion: event.data.buildVersion },
        runtimeConfig.buildVersion,
      );
      zeigeBuild(version);
    };

    pruefe();
    const intervall = window.setInterval(pruefe, PRUEF_INTERVALL_MS);
    window.addEventListener("focus", pruefe);
    window.addEventListener("online", pruefe);
    window.addEventListener("pageshow", pruefe);
    document.addEventListener("visibilitychange", beiSichtbar);
    navigator.serviceWorker?.addEventListener?.("message", beiWorkerNachricht);

    return () => {
      aktivRef.current = false;
      window.clearInterval(intervall);
      window.removeEventListener("focus", pruefe);
      window.removeEventListener("online", pruefe);
      window.removeEventListener("pageshow", pruefe);
      document.removeEventListener("visibilitychange", beiSichtbar);
      navigator.serviceWorker?.removeEventListener?.("message", beiWorkerNachricht);
    };
  }, [pruefe]);

  const aktualisieren = async () => {
    setLaedt(true);
    await aktualisiereServiceWorker({ baseUrl });
    /* HTML und JSON laufen im Worker network-first. Der Reload übernimmt daher
       den aktuellen index.html samt neuer, gehashter JS-/CSS-Dateien. */
    window.location.reload();
  };

  const schliessen = () => {
    geschlossenerBuildRef.current = neueVersion;
    setNeueVersion("");
  };

  if (!neueVersion) return null;
  return (
    <aside className="kd-app-update" role="status" aria-live="polite">
      <div>
        <strong>Neue Kinodreieck-Version verfügbar</strong>
        <span>Deine Daten bleiben erhalten. Aktualisiere, sobald du offene Eingaben gespeichert hast.</span>
      </div>
      <button type="button" onClick={aktualisieren} disabled={laedt}>
        {laedt ? "Wird geladen …" : "Jetzt aktualisieren"}
      </button>
      <button type="button" onClick={schliessen} disabled={laedt}
        aria-label="Update-Hinweis für diese Sitzung schließen">
        Schließen
      </button>
    </aside>
  );
}

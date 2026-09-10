import { useEffect, useState } from "react";

let installAufruf = null;
const beobachter = new Set();

function meldeAenderung() {
  for (const fn of beobachter) fn(installationsStatus());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installAufruf = event;
    meldeAenderung();
  });
  window.addEventListener("appinstalled", () => {
    installAufruf = null;
    meldeAenderung();
  });
}

export function installationsStatus() {
  const datei = typeof location !== "undefined" && location.protocol === "file:";
  const standalone = typeof window !== "undefined" && (
    window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.navigator?.standalone === true
  );
  const navigatorObj = typeof navigator !== "undefined" ? navigator : {};
  const userAgent = navigatorObj.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(userAgent)
    || (/Macintosh/.test(userAgent) && Number(navigatorObj.maxTouchPoints || 0) > 1);
  return { datei, standalone, ios, installierbar: !!installAufruf };
}

export function beobachteInstallation(fn) {
  beobachter.add(fn);
  fn(installationsStatus());
  return () => beobachter.delete(fn);
}

export async function installiereApp() {
  if (!installAufruf) {
    return { moeglich: false, angenommen: false, status: "nicht-verfuegbar" };
  }
  const aufruf = installAufruf;
  /* BeforeInstallPromptEvent.prompt() ist nur einmal nutzbar. Der verbrauchte
     Aufruf darf deshalb weder nach Abbruch noch nach einem Fehler als erneut
     installierbar erscheinen. Ein späteres Browserereignis setzt den Status
     wieder auf installierbar und bleibt von diesem Versuch unberührt. */
  installAufruf = null;
  meldeAenderung();
  try {
    const promptResult = await aufruf.prompt();
    const ergebnis = promptResult?.outcome ? promptResult : await aufruf.userChoice;
    const angenommen = ergebnis?.outcome === "accepted";
    return {
      moeglich: true,
      angenommen,
      status: angenommen ? "angenommen" : "abgebrochen",
    };
  } catch {
    return { moeglich: true, angenommen: false, status: "fehlgeschlagen" };
  } finally {
    meldeAenderung();
  }
}

export function useInstallationsStatus() {
  const [status, setStatus] = useState(() => installationsStatus());
  useEffect(() => beobachteInstallation(setStatus), []);
  return status;
}

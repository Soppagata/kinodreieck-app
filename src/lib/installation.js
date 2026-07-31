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
  if (!installAufruf) return { moeglich: false, angenommen: false };
  const aufruf = installAufruf;
  await aufruf.prompt();
  const ergebnis = await aufruf.userChoice;
  if (ergebnis?.outcome === "accepted") installAufruf = null;
  meldeAenderung();
  return { moeglich: true, angenommen: ergebnis?.outcome === "accepted" };
}

export function useInstallationsStatus() {
  const [status, setStatus] = useState(() => installationsStatus());
  useEffect(() => beobachteInstallation(setStatus), []);
  return status;
}

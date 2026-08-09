const installButton = document.querySelector("[data-install-app]");
const diagnoseButton = document.querySelector("[data-diagnose-android]");
const copyButton = document.querySelector("[data-copy-diagnose]");
const downloadButton = document.querySelector("[data-download-diagnose]");
const installHinweis = document.querySelector("#install-hinweis");
const diagnoseErgebnis = document.querySelector("#diagnose-ergebnis");
let installAufruf = null;
let diagnoseBericht = null;
let installationBestaetigt = false;

function zeigeHinweis(text) {
  if (installHinweis) installHinweis.textContent = text;
}

function standalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true
    || window.navigator?.standalone === true;
}

function zeigeDiagnose(bericht) {
  diagnoseBericht = bericht;
  if (!diagnoseErgebnis) return;
  const finding = bericht?.findings?.find((item) => item.code === bericht.primaryCode);
  diagnoseErgebnis.textContent = finding
    ? `${finding.code}: ${finding.message} ${finding.nextAction}`
    : "KD-PWA-ANDROID-090: Diagnosebericht konnte nicht sicher erzeugt werden.";
  diagnoseErgebnis.dataset.code = bericht?.primaryCode || "KD-PWA-ANDROID-090";
  const fehlerOderHinweis = bericht?.primaryCode !== "KD-PWA-ANDROID-000";
  if (copyButton) copyButton.hidden = !fehlerOderHinweis;
  if (downloadButton) downloadButton.hidden = !fehlerOderHinweis;
}

function berichtJson() {
  if (!diagnoseBericht || !window.KdPwaDiagnostics) return null;
  return JSON.stringify(window.KdPwaDiagnostics.sanitizeReport(diagnoseBericht), null, 2) + "\n";
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installAufruf = event;
  zeigeHinweis("Bereit zur Installation.");
});

installButton?.addEventListener("click", async () => {
  if (!installAufruf) {
    zeigeHinweis("Falls kein Dialog erscheint: Browsermenü öffnen und „App installieren“ wählen.");
    return;
  }

  const aufruf = installAufruf;
  installAufruf = null;
  try {
    const promptResult = await aufruf.prompt();
    const ergebnis = promptResult?.outcome ? promptResult : await aufruf.userChoice;
    const angenommen = ergebnis?.outcome === "accepted";
    zeigeHinweis(angenommen
      ? "Installation wurde angenommen; der Browser schließt sie jetzt ab."
      : "Installation nicht gestartet. Du kannst es jederzeit erneut versuchen.");
    if (diagnoseBericht && window.KdPwaDiagnostics) {
      zeigeDiagnose(window.KdPwaDiagnostics.withPromptOutcome(
        diagnoseBericht, angenommen ? "accepted" : "dismissed",
      ));
    }
    if (angenommen) window.setTimeout(() => {
      if (!installationBestaetigt && !standalone() && diagnoseBericht && window.KdPwaDiagnostics) {
        zeigeDiagnose(window.KdPwaDiagnostics.withPromptOutcome(diagnoseBericht, "accepted"));
      }
    }, 5000);
  } catch {
    zeigeHinweis("Der Installationsdialog konnte nicht sicher geöffnet werden. Bitte Diagnose ausführen.");
  }
});

window.addEventListener("appinstalled", () => {
  installationBestaetigt = true;
  installAufruf = null;
  zeigeHinweis("Kinodreieck ist installiert.");
  if (diagnoseBericht && window.KdPwaDiagnostics) {
    zeigeDiagnose(window.KdPwaDiagnostics.withPromptOutcome(diagnoseBericht, "installed"));
  }
});

diagnoseButton?.addEventListener("click", async () => {
  diagnoseButton.disabled = true;
  if (diagnoseErgebnis) diagnoseErgebnis.textContent = "Android-Installation wird lokal geprüft …";
  if (copyButton) copyButton.hidden = true;
  if (downloadButton) downloadButton.hidden = true;
  try {
    if (!window.KdPwaDiagnostics) throw new Error("diagnostics-unavailable");
    const bericht = await window.KdPwaDiagnostics.runDiagnostics({
      promptState: {
        available: !!installAufruf,
        standalone: standalone(),
        installed: installationBestaetigt,
      },
    });
    zeigeDiagnose(bericht);
  } catch {
    const definition = window.KdPwaDiagnostics?.finding?.("KD-PWA-ANDROID-090");
    if (diagnoseErgebnis) diagnoseErgebnis.textContent = definition
      ? `${definition.code}: ${definition.message} ${definition.nextAction}`
      : "KD-PWA-ANDROID-090: Die lokale Diagnose ist fehlgeschlagen.";
  } finally {
    diagnoseButton.disabled = false;
  }
});

copyButton?.addEventListener("click", async () => {
  const text = berichtJson();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    zeigeHinweis("Sanitizter Diagnosebericht wurde kopiert.");
  } catch {
    zeigeHinweis("Kopieren ist nicht verfügbar. Bitte Bericht herunterladen.");
  }
});

downloadButton?.addEventListener("click", () => {
  const text = berichtJson();
  if (!text) return;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kinodreieck_android_diagnose_${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  zeigeHinweis("Sanitizter Diagnosebericht wurde heruntergeladen.");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(() => {
    zeigeHinweis("Die Installation ist gerade nicht verfügbar. Die Browser-App funktioniert weiterhin.");
  });
}

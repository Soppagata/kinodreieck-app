const installButton = document.querySelector("[data-install-app]");
const installHinweis = document.querySelector("#install-hinweis");
let installAufruf = null;

function zeigeHinweis(text) {
  if (installHinweis) installHinweis.textContent = text;
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

  installAufruf.prompt();
  const ergebnis = await installAufruf.userChoice;
  installAufruf = null;
  zeigeHinweis(ergebnis.outcome === "accepted"
    ? "Kinodreieck wird installiert."
    : "Installation nicht gestartet. Du kannst es jederzeit erneut versuchen.");
});

window.addEventListener("appinstalled", () => {
  installAufruf = null;
  zeigeHinweis("Kinodreieck ist installiert.");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(() => {
    zeigeHinweis("Die Installation ist gerade nicht verfügbar. Die Browser-App funktioniert weiterhin.");
  });
}

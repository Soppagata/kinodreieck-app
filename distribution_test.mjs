import { readFileSync } from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const html = readFileSync("public/download/index.html", "utf8");
const installCode = readFileSync("public/download/install.js", "utf8");
const appCode = readFileSync("src/App.jsx", "utf8");
const mainCode = readFileSync("src/main.jsx", "utf8");
const onboardingCode = readFileSync("src/controllers/onboardingController.js", "utf8");
const dom = new JSDOM(html);
const dokument = dom.window.document;
const startLinks = [...dokument.querySelectorAll('a[href*="start="]')]
  .map((link) => link.getAttribute("href"));

check("Landingpage hat genau die zwei Startarten Demo und leer",
  startLinks.filter((href) => href === "../?start=demo").length === 1
  && startLinks.filter((href) => href === "../?start=clean").length === 2
  && startLinks.every((href) => !href.includes("fresh=")));
check("Hero-Logo bleibt als dreifarbiges Dreieck ohne verrutschende dunkle Achsentexte",
  dokument.querySelectorAll(".triangle > div").length === 3
  && dokument.querySelectorAll(".triangle .axis").length === 0
  && /Wie, Was und Warum/.test(dokument.querySelector(".triangle-card")?.getAttribute("aria-label") || ""));
check("Landingpage verspricht keinen allgemeinen Datenverlustschutz",
  !/löschen keine|keine Daten (?:löschen|überschreiben)|verlustfrei/i.test(dokument.body.textContent));
check("Der echte Resetpfad verlangt Startart, fresh-Token und strenge Tokenform",
  appCode.includes("verbraucheFrischenStart")
  && onboardingCode.includes('if (!/^[A-Za-z0-9._~-]{8,160}$/.test(token))')
  && onboardingCode.includes('return { art: "ungueltig"'));
check("Der App-Start versucht unter file:// keine Service-Worker-Registrierung",
  /location\?\.protocol[\s\S]*?!==\s*"file:"/.test(mainCode)
  && /kann die API zwar vorhanden sein/.test(mainCode));

function ladeInstallSkript({ registrierung = () => Promise.resolve({}), diagnostics = null } = {}) {
  const fensterListener = {};
  const elemente = new Map();
  for (const selector of [
    "[data-install-app]", "[data-diagnose-android]", "[data-copy-diagnose]",
    "[data-download-diagnose]", "#install-hinweis", "#diagnose-ergebnis",
  ]) elemente.set(selector, {
    textContent: "", hidden: false, disabled: false, dataset: {},
    listener: {}, addEventListener(name, fn) { this.listener[name] = fn; },
  });
  const knopf = elemente.get("[data-install-app]");
  const hinweis = elemente.get("#install-hinweis");
  const registrierungen = [];
  const navigator = {
    serviceWorker: {
      register(pfad, optionen) {
        registrierungen.push([pfad, optionen]);
        return registrierung(pfad, optionen);
      },
    },
  };
  const kontext = {
    window: {
      addEventListener(name, fn) { fensterListener[name] = fn; },
      matchMedia() { return { matches: false }; },
      navigator,
      setTimeout() {},
      KdPwaDiagnostics: diagnostics,
    },
    document: {
      querySelector(selector) { return elemente.get(selector) || null; },
    },
    navigator,
    URL, Blob, Date,
  };
  vm.runInNewContext(installCode, kontext, { filename: "public/download/install.js" });
  return {
    fensterListener,
    knopf,
    knopfListener: knopf.listener,
    diagnoseListener: elemente.get("[data-diagnose-android]").listener,
    diagnoseErgebnis: elemente.get("#diagnose-ergebnis"),
    hinweis,
    registrierungen,
  };
}

const direkt = ladeInstallSkript();
check("Installationsseite registriert genau den bestehenden Root-Service-Worker",
  JSON.stringify(direkt.registrierungen) === JSON.stringify([["../sw.js", { scope: "../" }]]));

let verhindert = 0;
let prompts = 0;
const installEreignis = {
  preventDefault() { verhindert++; },
  prompt() { prompts++; },
  userChoice: Promise.resolve({ outcome: "accepted" }),
};
direkt.fensterListener.beforeinstallprompt(installEreignis);
check("Browser-Installationsereignis wird übernommen und sichtbar bereit gemeldet",
  verhindert === 1 && direkt.hinweis.textContent === "Bereit zur Installation.");
await direkt.knopfListener.click();
check("Android-Knopf öffnet den echten Browserdialog genau einmal",
  prompts === 1 && /Installation wurde angenommen/.test(direkt.hinweis.textContent));

direkt.fensterListener.appinstalled();
check("Browserbestätigung wird als installiert gemeldet",
  direkt.hinweis.textContent === "Kinodreieck ist installiert.");

const fallback = ladeInstallSkript();
await fallback.knopfListener.click();
check("Ohne Browserdialog erscheint die manuelle Installationsanleitung",
  /Browsermenü öffnen/.test(fallback.hinweis.textContent));

const diagnoseOutcomes = [];
const abgelehnt = ladeInstallSkript({
  diagnostics: {
    async runDiagnostics() {
      return {
        primaryCode: "KD-PWA-ANDROID-000",
        findings: [{ code: "KD-PWA-ANDROID-000", message: "bereit", nextAction: "keine" }],
      };
    },
    withPromptOutcome(bericht, outcome) {
      diagnoseOutcomes.push(outcome);
      const code = outcome === "dismissed" ? "KD-PWA-ANDROID-041" : "KD-PWA-ANDROID-000";
      return { ...bericht, primaryCode: code, findings: [{ code, message: "Status", nextAction: "Prüfen" }] };
    },
  },
});
let abgelehntePrompts = 0;
abgelehnt.fensterListener.beforeinstallprompt({
  preventDefault() {},
  prompt() { abgelehntePrompts++; },
  userChoice: Promise.resolve({ outcome: "dismissed" }),
});
await abgelehnt.knopfListener.click();
check("Ein abgebrochener Browserdialog bleibt ehrlich wiederholbar",
  abgelehntePrompts === 1 && abgelehnt.knopf.disabled === false
  && /sobald der Browser ihn wieder anbietet/.test(abgelehnt.hinweis.textContent));
await abgelehnt.diagnoseListener.click();
check("Eine spätere Diagnose bewahrt die belegte Prompt-Ablehnung",
  diagnoseOutcomes.at(-1) === "dismissed"
  && abgelehnt.diagnoseErgebnis.dataset.code === "KD-PWA-ANDROID-041");
await abgelehnt.knopfListener.click();
check("Ein verbrauchtes Prompt-Ereignis wird nicht fälschlich ein zweites Mal verwendet",
  abgelehntePrompts === 1 && /Browsermenü öffnen/.test(abgelehnt.hinweis.textContent));
let neuerPrompt = 0;
abgelehnt.fensterListener.beforeinstallprompt({
  preventDefault() {}, prompt() { neuerPrompt++; },
  userChoice: Promise.resolve({ outcome: "accepted" }),
});
await abgelehnt.knopfListener.click();
check("Ein später neu angebotenes Browserereignis macht den Installationsknopf wieder nutzbar",
  neuerPrompt === 1 && /Installation wurde angenommen/.test(abgelehnt.hinweis.textContent));

const promptFehler = ladeInstallSkript();
promptFehler.fensterListener.beforeinstallprompt({
  preventDefault() {}, async prompt() { throw new Error("prompt-unavailable"); },
  userChoice: Promise.resolve({ outcome: "dismissed" }),
});
await promptFehler.knopfListener.click();
check("Ein nicht verfügbarer Prompt entsperrt die Bedienung und verspricht keine Wiederholung",
  promptFehler.knopf.disabled === false
  && /gerade nicht verfügbar/.test(promptFehler.hinweis.textContent));

const swFehler = ladeInstallSkript({
  registrierung: () => Promise.reject(new Error("offline")),
});
await Promise.resolve();
await Promise.resolve();
check("Fehlgeschlagene Service-Worker-Registrierung lässt die Browser-App nutzbar",
  /Browser-App funktioniert weiterhin/.test(swFehler.hinweis.textContent));

check("Installationsskript eröffnet keinen eigenen Daten- oder KI-Transport",
  !/\bfetch\s*\(/.test(installCode)
  && !/ai-task|functions\/v1|https?:\/\//i.test(installCode));

console.log(`DISTRIBUTIONS-TEST BESTANDEN (${ok}/${ok})`);

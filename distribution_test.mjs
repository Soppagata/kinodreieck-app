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
const dom = new JSDOM(html);
const dokument = dom.window.document;
const startLinks = [...dokument.querySelectorAll('a[href*="start="]')]
  .map((link) => link.getAttribute("href"));

check("Landingpage hat genau die zwei Startarten Demo und leer",
  startLinks.filter((href) => href === "../?start=demo").length === 1
  && startLinks.filter((href) => href === "../?start=clean").length === 2
  && startLinks.every((href) => !href.includes("fresh=")));
check("Landingpage verspricht keinen allgemeinen Datenverlustschutz",
  !/löschen keine|keine Daten (?:löschen|überschreiben)|verlustfrei/i.test(dokument.body.textContent));
check("Der echte Resetpfad verlangt Startart, fresh-Token und strenge Tokenform",
  appCode.includes("if (!startMatch || !tokenMatch) return null;")
  && appCode.includes('if (!/^[A-Za-z0-9._~-]{8,160}$/.test(token)) return null;'));

function ladeInstallSkript({ registrierung = () => Promise.resolve({}) } = {}) {
  const fensterListener = {};
  const knopfListener = {};
  const hinweis = { textContent: "" };
  const knopf = {
    addEventListener(name, fn) { knopfListener[name] = fn; },
  };
  const registrierungen = [];
  const kontext = {
    window: {
      addEventListener(name, fn) { fensterListener[name] = fn; },
    },
    document: {
      querySelector(selector) {
        if (selector === "[data-install-app]") return knopf;
        if (selector === "#install-hinweis") return hinweis;
        return null;
      },
    },
    navigator: {
      serviceWorker: {
        register(pfad, optionen) {
          registrierungen.push([pfad, optionen]);
          return registrierung(pfad, optionen);
        },
      },
    },
  };
  vm.runInNewContext(installCode, kontext, { filename: "public/download/install.js" });
  return { fensterListener, knopfListener, hinweis, registrierungen };
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
  prompts === 1 && direkt.hinweis.textContent === "Kinodreieck wird installiert.");

direkt.fensterListener.appinstalled();
check("Browserbestätigung wird als installiert gemeldet",
  direkt.hinweis.textContent === "Kinodreieck ist installiert.");

const fallback = ladeInstallSkript();
await fallback.knopfListener.click();
check("Ohne Browserdialog erscheint die manuelle Installationsanleitung",
  /Browsermenü öffnen/.test(fallback.hinweis.textContent));

const abgelehnt = ladeInstallSkript();
abgelehnt.fensterListener.beforeinstallprompt({
  preventDefault() {},
  prompt() {},
  userChoice: Promise.resolve({ outcome: "dismissed" }),
});
await abgelehnt.knopfListener.click();
check("Ein abgebrochener Browserdialog bleibt ehrlich wiederholbar",
  /nicht gestartet/.test(abgelehnt.hinweis.textContent));

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

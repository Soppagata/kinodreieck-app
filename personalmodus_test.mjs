/* Privatrelease-Regression fuer die lokale Einzeldatei. Historische
   Demo-/Startwahlmarker duerfen die neue leere Localmodus-Grenze nicht
   umgehen. Die getrennten eingebetteten Beilagen duerfen als lokaler
   Einzeldatei-Bestand erhalten bleiben, werden aber nicht automatisch geladen. */
import { readFileSync } from "node:fs";
import { TextEncoder } from "node:util";
import { JSDOM } from "jsdom";

/* Der historische Volltest setzt den entfernten öffentlichen Demo-Einstieg
   voraus. Im Privat-Release prüft der Standardlauf stattdessen den fertigen
   Single-File-Localmodus mit echten lokalen Inhalten und ohne Netzverkehr. */
if (process.env.KD_LEGACY_PUBLIC_PERSONALMODE !== "1") {
  await import("./private_release_personalmodus_test.mjs");
  throw new Error("Der private Personalmodus-Test wurde ohne Abschluss verlassen.");
}

const pfad = process.argv[2] || "dist-single/Kinodreieck.html";
const html = readFileSync(pfad, "utf8");
const requests = [];
let cacheZugriffe = 0;
const warte = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let checks = 0;
function check(name, condition) {
  if (!condition) throw new Error("Fehlgeschlagen: " + name);
  checks++;
  console.log("✓ " + name);
}

check("Einzeldatei behaelt ihre ausdruecklich eingebettete Offline-Beilage",
  html.includes("data-kd-einzeldatei-seed")
  && html.includes("window.__KD_DEMO_SEED__")
  && html.includes("Der letzte Vorführer"));
check("Einzeldatei enthaelt keinen sichtbaren Demo- oder Startwahl-Aufruf",
  !html.includes("Demo ansehen") && !html.includes("Leer starten"));

const dom = new JSDOM(html, {
  url: "http://localhost/Kinodreieck.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.scrollTo = () => {};
    window.TextEncoder = TextEncoder;
    window.matchMedia ||= () => ({
      matches: false, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
    });
    window.fetch = async (url) => {
      requests.push(String(url));
      throw new Error("Netz im Localmodus gesperrt (Test)");
    };
    window.caches = {
      async open() {
        cacheZugriffe++;
        return {
          async match() { cacheZugriffe++; return undefined; },
          async put() { cacheZugriffe++; },
          async delete() { cacheZugriffe++; return false; },
        };
      },
    };
    window.localStorage.setItem("kd:start", "demo");
    window.localStorage.setItem("kd:start-version", "local-v1");
    window.localStorage.setItem("kd:demo-seed", JSON.stringify({
      masterIds: ["alt-demo"], artikelIds: ["alt-demo-artikel"], geladenAm: "2026-07-22",
    }));
  },
});

const { document } = dom.window;
await warte(700);
const knopf = (text) => [...document.querySelectorAll("button")]
  .find((button) => button.textContent.trim() === text);
check("Alte Demo- und Startmarker oeffnen keinen Demo- oder Startwahlweg",
  !knopf("Demo ansehen") && !knopf("Leer starten"));

knopf("Ohne Konto fortfahren")?.click();
await warte(1800);
const navigation = [...document.querySelectorAll('nav[aria-label="Hauptnavigation"] button')]
  .map((button) => button.textContent.trim());
check("Localmodus bleibt auf die persoenliche Mediathek begrenzt",
  JSON.stringify(navigation) === JSON.stringify(["Mediathek"]));
const sichtbarerText = document.getElementById("root")?.textContent || "";
check("Eingebettete Demo-Beilage wird im Localmodus nicht sichtbar",
  !sichtbarerText.includes("Der letzte Vorführer")
  && !sichtbarerText.includes("Sommer der Kometen"));
check("Alte Marker loesen weder Katalog-, Programm- noch Cachezugriffe aus",
  requests.length === 0 && cacheZugriffe === 0);
check("Bewusster Localmodus normalisiert nur die alte Startwahl zu clean",
  dom.window.localStorage.getItem("kd:start") === "clean"
  && JSON.parse(dom.window.localStorage.getItem("kd:einstieg") || "{}").abgeschlossen === true);
check("Localmodus behaelt den sichtbaren Rueckweg zum bestehenden Login",
  !!knopf("Anmelden"));

dom.window.close();
console.log(`\npersonalmodus_test: ${checks}/${checks} Checks bestanden.`);

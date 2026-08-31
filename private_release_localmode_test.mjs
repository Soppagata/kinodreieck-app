import { readFileSync } from "node:fs";
import { TextEncoder } from "node:util";
import { JSDOM } from "jsdom";

const html = readFileSync(process.argv[2] || "dist-single/Kinodreieck.html", "utf8");
const warte = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requests = [];
let cacheZugriffe = 0;
const gastMaster = JSON.stringify({
  meta: { name: "Lokaler Test" },
  filme: [{ id: "lokal-1", typ: "film", titel: "Eigener Lokalfilm", jahr: 2024 }],
});

const dom = new JSDOM(html, {
  url: "http://localhost/Kinodreieck.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.scrollTo = () => {};
    window.confirm = () => true;
    window.TextEncoder = TextEncoder;
    window.matchMedia ||= () => ({
      matches: false, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
    });
    window.URL.createObjectURL ||= () => "blob:test";
    window.URL.revokeObjectURL ||= () => {};
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
    window.localStorage.setItem("kd:master", gastMaster);
    window.localStorage.setItem("kd:einstieg", JSON.stringify({
      version: "private-v1", abgeschlossen: false, weg: "gast", grund: "abmeldung",
    }));
  },
});

const { document } = dom.window;
await warte(700);
const ohneKonto = [...document.querySelectorAll("button")]
  .find((button) => button.textContent.trim() === "Ohne Konto fortfahren");
if (!ohneKonto) throw new Error("Minimaler Gastweg fehlt");
ohneKonto.click();
await warte(1800);

let checks = 0;
function check(name, condition) {
  if (!condition) throw new Error("Fehlgeschlagen: " + name);
  checks++;
  console.log("✓ " + name);
}

const navigation = [...document.querySelectorAll('nav[aria-label="Hauptnavigation"] button')]
  .map((button) => button.textContent.trim());
check("Localmodus zeigt nur die persönliche Mediathek-Navigation",
  JSON.stringify(navigation) === JSON.stringify(["Mediathek"]));
check("Bereitgestellte Flächen und globale Suche sind nicht im DOM",
  !["Kino", "Streaming", "Entdecken", "Start", "Settings", "Suche"].some((name) => navigation.includes(name))
  && !document.querySelector(".kd-globalsuche")
  && !document.querySelector(".kd-syncchip-head"));
check("Eigener lokaler Eintrag bleibt sichtbar und bytegleich gespeichert",
  document.body.textContent.includes("Eigener Lokalfilm")
  && dom.window.localStorage.getItem("kd:master") === gastMaster);
check("Lokale Eintragsfunktionen bleiben erreichbar",
  [...document.querySelectorAll("button")].some((button) => /Eintrag|Film hinzufügen|Neu/.test(button.textContent)));
check("Localmodus erzeugt keine Katalog-, Programm- oder Cache-Requests",
  requests.length === 0 && cacheZugriffe === 0);
const masterVorLogin = dom.window.localStorage.getItem("kd:master");
const anmelden = [...document.querySelectorAll("button")]
  .find((button) => button.textContent.trim() === "Anmelden");
check("Localmodus bietet einen schlichten sichtbaren Anmelden-Weg", !!anmelden);
anmelden.click();
await warte(100);
check("Anmelden öffnet den bestehenden Minimal-Login",
  !!document.querySelector(".kd-entry-login")
  && !!document.querySelector('input[autocomplete="username"]')
  && !!document.querySelector('input[autocomplete="current-password"]'));
const loginText = document.querySelector(".kd-entry")?.textContent || "";
check("Der wieder geöffnete Login legt keine Settings-, Sync- oder Backup-Technik frei",
  !loginText.includes("Settings")
  && !loginText.includes("Backup")
  && !loginText.includes("Sicherung")
  && !document.querySelector(".kd-syncchip-head"));
check("Re-Entry verändert persönliche Localdaten nicht und bleibt requestfrei",
  dom.window.localStorage.getItem("kd:master") === masterVorLogin
  && masterVorLogin === gastMaster
  && requests.length === 0 && cacheZugriffe === 0);

dom.window.close();
console.log(`PRIVATE-RELEASE-LOCALMODUS-TEST BESTANDEN (${checks}/${checks})`);
process.exit(0);

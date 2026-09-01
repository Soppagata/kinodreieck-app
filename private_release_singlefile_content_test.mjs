import { readFileSync } from "node:fs";
import { TextEncoder } from "node:util";
import { JSDOM, VirtualConsole } from "jsdom";

const html = readFileSync(process.argv[2] || "dist-single/Kinodreieck.html", "utf8");
const warte = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requests = [];
const downloads = [];
const konsolenfehler = [];
let cacheZugriffe = 0;
let confirmAufrufe = 0;

const masterFixture = JSON.stringify({
  meta: { name: "Eigene lokale Mediathek" },
  filme: [
    {
      id: "local-film-unrated", typ: "film", titel: "Physisch unbewertet", jahr: 1980,
      originaltitel: "Physisch unbewertet", quelle: "dvd+prime", kategorie: null,
      bewertet_von: null, bewertung: null, genre: [], tags: [], begruendung: "", status: "gesetzt",
    },
    {
      id: "local-film-rated", typ: "film", titel: "Blu-ray bewertet", jahr: 1990,
      originaltitel: "Blu-ray bewertet", quelle: "bluray", kategorie: "sehenswert",
      bewertet_von: "lokal", bewertung: { wie: 3, was: 4, warum: 2 }, genre: ["Drama"],
      tags: [], begruendung: "Lokales Fixture", status: "gesetzt",
    },
    {
      id: "local-film-digital", typ: "film", titel: "Nur digital gekauft", jahr: 2000,
      originaltitel: "Nur digital gekauft", quelle: "apple", kategorie: "sehenswert",
      bewertet_von: "lokal", bewertung: { wie: 2, was: 2, warum: 2 }, genre: [],
      tags: [], begruendung: "Lokales Fixture", status: "gesetzt",
    },
    {
      id: "local-series", typ: "serie", titel: "Eigene Lokalserie", jahr: 2020,
      originaltitel: "Eigene Lokalserie", quelle: "bluray", kategorie: "sehenswert",
      bewertet_von: "lokal", bewertung: { wie: 4, was: 3, warum: 3 }, genre: [],
      tags: [], begruendung: "Lokales Fixture", status: "gesetzt",
    },
    {
      id: "local-music", typ: "musik", titel: "Eigenes Lokalkonzert", jahr: 2021,
      art: "Konzert", beschreibung: "Lokales Fixture", bewertung: { wie: null, was: null, warum: null },
      bewertet_von: null,
    },
    {
      id: "local-other", typ: "sonstiges", titel: "Eigenes Filmbuch", jahr: 2022,
      art: "Buch", beschreibung: "Lokales Fixture", bewertung: { wie: null, was: null, warum: null },
      bewertet_von: null,
    },
  ],
});
const mustwatchFixture = JSON.stringify({
  eintraege: [
    {
      id: "mw_local-film", titel: "Lokaler Merkfilm", jahr: 2024, typ: "film",
      im_besitz: true, beschreibung: "", notiz: "", verknuepfung: null,
      erstellt_am: "2026-08-01T10:00:00.000Z",
    },
    {
      id: "mw_local-series", titel: "Lokale Merkserie", jahr: 2023, typ: "serie",
      im_besitz: false, beschreibung: "", notiz: "", verknuepfung: null,
      erstellt_am: "2026-08-02T10:00:00.000Z",
    },
  ],
  gespeichertAm: 1788256800000,
});

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", (...args) => konsolenfehler.push(args.map(String).join(" ").slice(0, 200)));
virtualConsole.on("jsdomError", (error) => {
  if (!/Could not load/.test(error.message)) konsolenfehler.push(String(error.message).slice(0, 200));
});

const dom = new JSDOM(html, {
  url: "http://localhost/Kinodreieck.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.TextEncoder = TextEncoder;
    window.scrollTo = () => {};
    window.matchMedia ||= () => ({
      matches: false, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
    });
    window.URL.createObjectURL ||= () => "blob:test";
    window.URL.revokeObjectURL ||= () => {};
    window.HTMLAnchorElement.prototype.click = function click() {
      downloads.push({ href: this.href, download: this.download });
    };
    window.confirm = () => { confirmAufrufe += 1; return false; };
    window.fetch = async (url) => {
      requests.push(String(url));
      throw new Error("Netz im Localmodus gesperrt (Inhaltstest)");
    };
    window.caches = {
      async open() {
        cacheZugriffe += 1;
        return {
          async match() { cacheZugriffe += 1; return undefined; },
          async put() { cacheZugriffe += 1; },
          async delete() { cacheZugriffe += 1; return false; },
        };
      },
    };
    window.localStorage.setItem("kd:master", masterFixture);
    window.localStorage.setItem("kd:mustwatch", mustwatchFixture);
    window.localStorage.setItem("kd:einstieg", JSON.stringify({
      version: "private-v1", abgeschlossen: false, weg: "gast", grund: "abmeldung",
    }));
  },
});

const { document } = dom.window;
const rootText = () => document.getElementById("root")?.textContent || "";
const knopf = (pattern) => [...document.querySelectorAll("button")]
  .find((button) => pattern.test((button.textContent || "").trim()));
const setValue = (element, value) => {
  const prototype = element.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement
    : element.tagName === "SELECT" ? dom.window.HTMLSelectElement
      : dom.window.HTMLInputElement;
  Object.getOwnPropertyDescriptor(prototype.prototype, "value").set.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
};

let checks = 0;
function check(name, condition) {
  if (!condition) throw new Error(`Fehlgeschlagen: ${name}`);
  checks += 1;
  console.log(`✓ ${name}`);
}

await warte(700);
check("Minimaler Einstieg bleibt vor der lokalen Mediathek",
  !!document.querySelector(".kd-entry-login") && !document.querySelector('nav[aria-label="Hauptnavigation"]'));
const ohneKonto = knopf(/^Ohne Konto fortfahren$/);
check("Bewusster Localmodus-Einstieg ist erreichbar", !!ohneKonto);
ohneKonto.click();
await warte(1800);

const navigation = [...document.querySelectorAll('nav[aria-label="Hauptnavigation"] button')]
  .map((button) => button.textContent.trim());
check("Single-File-Localmodus zeigt ausschließlich die Mediathek-Navigation",
  JSON.stringify(navigation) === JSON.stringify(["Mediathek"]));
check("Kein Online-, Demo-, Such-, Sync- oder Settings-Bereich ist erreichbar",
  !["Start", "Kino", "Streaming", "Entdecken", "Blog", "Suche", "Settings"]
    .some((name) => navigation.includes(name))
  && !document.querySelector(".kd-globalsuche")
  && !document.querySelector(".kd-syncchip-head")
  && !/Demo-Zeilen-Marker|Demo-Schnappschuss|Demo-Beispieldaten/.test(rootText()));
check("Eigener lokaler Inhalt gewinnt unverändert vor jeder eingebetteten Beilage",
  rootText().includes("Physisch unbewertet")
  && !rootText().includes("Der letzte Vorführer")
  && dom.window.localStorage.getItem("kd:master") === masterFixture);

for (const [typ, titel] of [
  ["Serien", "Eigene Lokalserie"],
  ["Musik", "Eigenes Lokalkonzert"],
  ["Sonstiges", "Eigenes Filmbuch"],
  ["Filme", "Physisch unbewertet"],
]) {
  const typKnopf = knopf(new RegExp(`^${typ}( \\(|$)`));
  check(`Typ-Ansicht ${typ} ist lokal erreichbar`, !!typKnopf);
  typKnopf.click();
  await warte(120);
  check(`Typ-Ansicht ${typ} zeigt nur eigenes Fixture`, rootText().includes(titel));
}

const lokalsuche = document.querySelector('input[placeholder="Titel oder Originaltitel suchen …"]');
check("Lokaler Mediathek-Filter ist verfügbar", !!lokalsuche);
setValue(lokalsuche, "Physisch unbewertet");
await warte(150);
check("Lokaler Filter grenzt nur den eigenen Bestand ein",
  rootText().includes("Physisch unbewertet") && !rootText().includes("Blu-ray bewertet"));
setValue(lokalsuche, "");
await warte(100);

const besitzKnopf = knopf(/^Im Besitz \(/);
check("Lokale Ansicht Im Besitz ist erreichbar", !!besitzKnopf);
besitzKnopf.click();
await warte(200);
check("Besitz zeigt physische Quellen und schließt reinen Digitalkauf aus",
  rootText().includes("Physisch unbewertet")
  && rootText().includes("Blu-ray bewertet")
  && !rootText().includes("Nur digital gekauft"));
const nurUnbewertet = knopf(/^nur unbewertete/);
check("Besitzfilter nur unbewertete ist lokal erreichbar", !!nurUnbewertet);
nurUnbewertet.click();
await warte(150);
check("Besitzfilter behält nur den unbewerteten physischen Eintrag",
  rootText().includes("Physisch unbewertet") && !rootText().includes("Blu-ray bewertet"));

const mustwatchKnopf = knopf(/^Must-Watch \(/);
check("Lokale Must-Watch-Ansicht ist erreichbar", !!mustwatchKnopf);
mustwatchKnopf.click();
await warte(200);
check("Must-Watch zeigt eigene Film- und Serieneinträge",
  rootText().includes("Lokaler Merkfilm") && rootText().includes("Lokale Merkserie"));
const mustwatchFilme = knopf(/^Filme$/);
check("Must-Watch-Typfilter Filme ist erreichbar", !!mustwatchFilme);
mustwatchFilme.click();
await warte(150);
check("Must-Watch-Typfilter trennt Film und Serie lokal",
  rootText().includes("Lokaler Merkfilm") && !rootText().includes("Lokale Merkserie"));

const eintraegeKnopf = knopf(/^Einträge$/);
check("Rückkehr zur lokalen Eintragsansicht ist erreichbar", !!eintraegeKnopf);
eintraegeKnopf.click();
await warte(150);
knopf(/^Filme( \(|$)/)?.click();
await warte(100);
const hinzufuegen = knopf(/^\+ Eintrag hinzufügen$/);
check("Lokales Einzelformular ist erreichbar", !!hinzufuegen);
hinzufuegen.click();
await warte(120);
const titelFeld = [...document.querySelectorAll("input")].find((input) => input.placeholder === "Titel *");
const jahrFeld = [...document.querySelectorAll("input")].find((input) => input.placeholder === "Jahr *");
const ohneBewertung = [...document.querySelectorAll('input[type="checkbox"]')].find((input) => (
  /Ohne Bewertung speichern/.test(input.closest("label")?.textContent || "")
));
check("Lokales Formular bietet Titel, Jahr und unbewertetes Speichern",
  !!titelFeld && !!jahrFeld && !!ohneBewertung);
setValue(titelFeld, "Neu lokal angelegt");
setValue(jahrFeld, "2025");
ohneBewertung.click();
await warte(80);
knopf(/^Hinzufügen$/)?.click();
await warte(300);
const masterNachAnlegen = dom.window.localStorage.getItem("kd:master") || "";
check("Neuer Eintrag erscheint und wird im lokalen Master persistiert",
  rootText().includes("Neu lokal angelegt") && masterNachAnlegen.includes("Neu lokal angelegt"));

const lokaleSicherheitskopie = knopf(/^Lokale Sicherheitskopie herunterladen$/);
check("Lokale Sicherheitsfläche ist direkt in der Mediathek verfügbar",
  !!document.querySelector('[data-local-data-safety="guest-only"]')
  && !!lokaleSicherheitskopie
  && rootText().includes("kein Server- oder Kontoexport"));
lokaleSicherheitskopie.click();
await warte(150);
check("Lokale Sicherheitskopie bleibt ein einzelner präziser Dateidownload",
  downloads.length === 1
  && /^kinodreieck_sicherheitskopie_geraet_\d{4}-\d{2}-\d{2}\.json$/.test(downloads[0].download)
  && confirmAufrufe === 0);

const mustwatchVorReentry = dom.window.localStorage.getItem("kd:mustwatch");
const anmelden = knopf(/^Anmelden$/);
check("Wechsel zum bestehenden Minimal-Login bleibt erreichbar", !!anmelden);
anmelden.click();
await warte(150);
check("Reentry öffnet nur den Login und keine Konto- oder Onlinefläche",
  !!document.querySelector(".kd-entry-login")
  && !document.querySelector('nav[aria-label="Hauptnavigation"]')
  && !document.querySelector(".kd-syncchip-head"));
check("Reentry bewahrt Master und Must-Watch bytegleich",
  dom.window.localStorage.getItem("kd:master") === masterNachAnlegen
  && dom.window.localStorage.getItem("kd:mustwatch") === mustwatchVorReentry);
check("Gesamter Localmodus bleibt ohne HTTP-, Katalog- oder Cachezugriff",
  requests.length === 0 && cacheZugriffe === 0);
check("Single-File-Inhaltspfad bleibt ohne React- oder Konsolenfehler", konsolenfehler.length === 0);

dom.window.close();
console.log(`PRIVATE-RELEASE-SINGLEFILE-CONTENT-TEST BESTANDEN (${checks}/${checks})`);
process.exit(0);

/* Einstellungen-Contract: neue Reihenfolge, Produktions-Guard und Checkbox-Token. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const lese = (rel) => fs.readFileSync(path.join(WURZEL, rel), "utf8");

let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks += 1;
  console.log(`✓ ${name}`);
}

const datenTab = lese("src/tabs/DatenTab.jsx");
const css = lese("src/index.css");

check("Streaming-Katalogbestand ist lokal und auf Staging sichtbar, aber nicht in Production",
  /const showKatalogbestand = runtimeConfig\.appEnvironment !== "production";/.test(datenTab)
    && /\{showKatalogbestand && <Klappe titel="Streaming-Katalogbestand">/.test(datenTab));

const darstellung = datenTab.indexOf('titel="Darstellung & Verhalten"');
const streaming = datenTab.indexOf('titel="Streaming-Quellen"');
const katalog = datenTab.indexOf('titel="Streaming-Katalogbestand"');
const personalisierung = datenTab.indexOf('titel="Personalisierung & KI"');
const kontoDatenSicherung = datenTab.indexOf('titel="Konto, Daten & Sicherung"');
const rechtliches = datenTab.indexOf('titel="Über Kinodreieck, Anleitung & Rechtliches"');
check("Release-Settings-Abschnitte stehen in der geforderten Reihenfolge",
  darstellung >= 0
    && streaming > darstellung
    && katalog > streaming
    && personalisierung > katalog
    && kontoDatenSicherung > personalisierung
    && rechtliches > kontoDatenSicherung);
check("Personalisierung und Konto sind jeweils genau eine Hauptklappe",
  !datenTab.includes('<Klappe titel="KI-Funktionen">')
    && !datenTab.includes('<Klappe titel="Geschmacksprofil">')
    && !datenTab.includes('<Klappe titel="KI-Vokabular"')
    && !datenTab.includes('<Klappe titel="Konto & Geräte-Sync">')
    && !datenTab.includes('<Klappe titel="Datenrechte & Konto">')
    && !datenTab.includes('<Klappe id="gesamt-backup" titel="Sicherheitskopie dieses Geräts"'));

const checkboxRegel = /input\[type="checkbox"\]\s*\{([^}]*)\}/.exec(css)?.[1] || "";
check("Alle nativen Checkboxen sind spät global auf 18px und Wolfram normalisiert",
  css.lastIndexOf('input[type="checkbox"]') > css.lastIndexOf("label.kd-touch-checkbox")
    && /width:18px;\s*height:18px;/.test(checkboxRegel)
    && /min-width:18px;\s*min-height:18px;/.test(checkboxRegel)
    && /flex:0 0 18px;\s*margin:1px 0 0;/.test(checkboxRegel)
    && /accent-color:var\(--kd-wolfram,#e3a63b\);/.test(checkboxRegel));

const labelRegel = /label\.kd-touch-checkbox\s*\{([^}]*)\}/.exec(css)?.[1] || "";
check("Label-Touchfläche bleibt 44px-fähig ohne globales Zeilenlayout",
  /min-width:44px;\s*min-height:44px;/.test(labelRegel)
    && !/display:|align-items:|gap:/.test(labelRegel));

console.log(`settings_polish_contract_test: ${checks} Checks bestanden.`);

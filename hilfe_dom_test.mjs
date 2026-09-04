#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = source("./src/App.jsx");
const navigation = source("./src/components/AppNavigation.jsx");
const start = source("./src/tabs/StartTab.jsx");
const settings = source("./src/tabs/DatenTab.jsx");
const css = source("./src/index.css");

let checks = 0;
const check = (name, callback) => {
  callback();
  checks += 1;
  console.log(`✓ ${name}`);
};

check("Der Startbereich behält genau den sichtbaren Hilfe-Einstieg", () => {
  assert.match(start, /\? Anleitung &amp; Hilfe/);
  assert.match(start, /onHilfe\(\)/);
});

check("Der Hilfe-Einstieg navigiert nach Settings und erzeugt einen Fokusauftrag", () => {
  assert.match(app, /const oeffneHilfe = useCallback\(\(\) => \{\s*navigiere\("daten"\);\s*setAnleitungAuftrag/u);
  assert.match(app, /anleitungAuftrag=\{anleitungAuftrag\}/);
  assert.doesNotMatch(app, /HilfeSheet|hilfeOffen|schliesseHilfe/);
});

check("Settings öffnet und fokussiert Über Kinodreieck & Anleitung", () => {
  assert.match(settings, /if \(!anleitungAuftrag\) return undefined/);
  assert.match(settings, /setUeberOffen\(true\)/);
  assert.match(settings, /knopf\?\.closest\("details"\)/);
  assert.match(settings, /knopf\?\.focus\?\.\(\{ preventScroll: true \}\)/);
  assert.match(settings, /ref=\{anleitungKnopfRef\}[\s\S]*aria-expanded=\{ueberOffen\}[\s\S]*Über Kinodreieck &amp; Anleitung/);
});

check("Das mobile Menü und die Styles enthalten keinen Hilfe-Modalpfad mehr", () => {
  assert.doesNotMatch(navigation, /Anleitung &amp; Hilfe|kd-mobile-menu-hilfe|onHilfe/);
  assert.doesNotMatch(css, /kd-help-(?:layer|panel|lead|grid)|kd-mobile-menu-hilfe/);
});

assert.equal(checks, 4);
console.log(`HILFE_NAVIGATION: ${checks}/${checks} checks passed`);

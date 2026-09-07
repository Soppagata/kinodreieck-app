import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEMES, T, btnStyle, inputStyle, kontrastFarbe, lightInput, setzeTheme } from "./src/lib/tokens.js";

let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`✓ ${name}`);
};
const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

check("Dunkel- und Hellthema haben die freigegebenen semantischen Kontrastrollen", () => {
  assert.deepEqual(
    [THEMES.dunkel.saal, THEMES.dunkel.saalHoch, THEMES.dunkel.leinwand, THEMES.dunkel.tinte, THEMES.dunkel.tinteWeich, THEMES.dunkel.rauch, THEMES.dunkel.wolfram],
    ["#17151A", "#211E26", "#ECE8DF", "#1C1A1E", "#57525C", "#B6AFBE", "#E3A63B"],
  );
  assert.deepEqual(
    [THEMES.hell.saal, THEMES.hell.saalHoch, THEMES.hell.leinwand, THEMES.hell.tinte, THEMES.hell.tinteWeich, THEMES.hell.rauch, THEMES.hell.wolfram],
    ["#EDEAE3", "#FBFAF7", "#23202A", "#F0EDE6", "#C8C2D1", "#595363", "#825B14"],
  );
  for (const theme of Object.values(THEMES)) {
    assert.ok(theme.kartenText && theme.kartenTextWeich && theme.linie);
  }
});

check("Primäraktionen bestimmen ihren Textkontrast aus der tatsächlichen Akzentfarbe", () => {
  for (const theme of ["dunkel", "hell"]) {
    setzeTheme(theme);
    assert.equal(btnStyle(true).color, kontrastFarbe(T.wolfram));
    assert.equal(btnStyle(true).minHeight, 44);
    assert.equal(btnStyle(false).borderRadius, 8);
  }
});

check("Eingaben bleiben auch bei kleiner Schrift mindestens 16px und 44px hoch", () => {
  assert.equal(inputStyle.minHeight, 44);
  assert.equal(lightInput.minHeight, 44);
  assert.match(inputStyle.fontSize, /max\(16px/);
  assert.match(lightInput.fontSize, /max\(16px/);
});

check("Gemeinsame CSS-Rollen frieren Schrift, Radien, Fokus und Kartenvertrag ein", () => {
  const css = source("./src/styles/design-foundation.css");
  for (const role of ["--kd-radius-karte: 12px", "--kd-radius-control: 8px", "--kd-radius-label: 5px", "font-family: 'Fraunces'", "font-family: 'Barlow Condensed'", "font-family: 'Space Grotesk'", "font-family: 'Space Mono'", ":focus-visible", ".kd-bereichshero", ".kd-chip", ".kd-seg-control", ".kd-klappe", ".kd-tag"]) {
    assert.ok(css.includes(role), role);
  }
  assert.ok(!css.includes("!important"));
});

check("Primitives bewahren ihre Props und exportieren die gemeinsamen SVG-Hilfsicons", () => {
  const ui = source("./src/components/ui.jsx");
  for (const contract of [
    "export function Chip({ active, onClick, children, color, title })",
    "export function SegmentedControl({ options, value, onChange, dataTour, style, className = \"\" })",
    "export function Klappe({ titel, offen = false, tour, id, markiert = false, status = null, children })",
    "IconSearch", "IconClose", "IconPlus", "IconChevronDown", "IconArrowRight", "IconPin", "IconClock", "IconHelp",
  ]) assert.ok(ui.includes(contract), contract);
});

check("Foundation wird vor den drei reservierten Bereichs-Slots geladen", () => {
  const main = source("./src/main.jsx");
  const positions = ["./index.css", "./styles/design-foundation.css", "./styles/design-primary.css", "./styles/design-secondary.css", "./styles/design-shell.css"].map((part) => main.indexOf(part));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

console.log(`design_foundation_test: ${checks} Checks bestanden.`);

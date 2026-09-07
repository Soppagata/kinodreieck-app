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
    ["#EDEAE3", "#FBFAF7", "#23202A", "#F0EDE6", "#C8C2D1", "#595363", "#B07E1F"],
  );
  for (const theme of Object.values(THEMES)) {
    assert.ok(theme.kartenText && theme.kartenTextWeich && theme.kartenAkzent && theme.linie && theme.wolframText);
  }
});

check("Helles Gold und Kartenbeschriftung behalten getrennte lesbare Farbrollen", () => {
  const luminanz = (hex) => {
    const channels = String(hex).match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16) / 255)
      .map((value) => (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4));
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const contrast = (a, b) => {
    const [hell, dunkel] = [luminanz(a), luminanz(b)].sort((left, right) => right - left);
    return (hell + .05) / (dunkel + .05);
  };
  for (const theme of Object.values(THEMES)) {
    assert.ok(contrast(theme.kartenText, theme.leinwand) >= 4.5);
    assert.ok(contrast(kontrastFarbe(theme.kartenAkzent), theme.kartenAkzent) >= 4.5);
  }
  assert.equal(THEMES.dunkel.kartenAkzent, THEMES.dunkel.wolfram);
  assert.match(source("./src/styles/design-foundation.css"), /--kd-tag-text: var\(--kd-kartenText\)/);
  assert.match(source("./src/styles/design-foundation.css"), /--kd-achse-text: var\(--kd-kartenText\)/);
  assert.equal(THEMES.dunkel.wolframText, kontrastFarbe(THEMES.dunkel.wolfram));
  assert.equal(THEMES.hell.wolframText, kontrastFarbe(THEMES.hell.wolfram));
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
  for (const role of ["--kd-radius-karte: 12px", "--kd-radius-control: 8px", "--kd-radius-label: 5px", "--kd-kartenAkzent", "--kd-wolframText", "font-family: 'Fraunces'", "font-family: 'Barlow Condensed'", "font-family: 'Space Grotesk'", "font-family: 'Space Mono'", ":focus-visible", ".kd-bereichshero", ".kd-chip", ".kd-seg-control", ".kd-klappe", ".kd-tag", ".kd-achse-wert"]) {
    assert.ok(css.includes(role), role);
  }
  // Existing inline input shorthands require a narrow exception for the
  // closed native select's CSS chevron. Text and button roles stay ordinary
  // cascade rules; no other selector or property may use this escape hatch.
  const nativeSelectProperties = new Set(["background-image", "background-position", "background-size", "background-repeat", "padding-right"]);
  const uncommented = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  for (const [, selector, declarations] of uncommented.matchAll(/([^{}]+)\{([^{}]*!important[^{}]*)\}/gu)) {
    assert.equal(selector.trim(), "select");
    for (const [, property] of declarations.matchAll(/([a-z-]+)\s*:[^;{}]*!important/gu)) assert.ok(nativeSelectProperties.has(property));
  }
});

check("Alte gemeinsame Hero- und Segmentregeln überstimmen die Foundation nicht mehr", () => {
  const css = source("./src/index.css");
  assert.match(css, /\.kd-bereichshero h1 \{[^}]*clamp\(calc\(38px/);
  assert.doesNotMatch(css, /\.kd-bereichshero h1 \{[^}]*!important/);
  assert.doesNotMatch(css, /\.kd-seg > button \{[^}]*!important/);
});

check("Primitives bewahren ihre Props und exportieren die gemeinsamen SVG-Hilfsicons", () => {
  const ui = source("./src/components/ui.jsx");
  for (const contract of [
    "export function Chip({ active, onClick, children, color, title })",
    "export function SegmentedControl({ options, value, onChange, dataTour, style, className = \"\" })",
    "export function Klappe({ titel, offen = false, tour, id, markiert = false, status = null, children })",
    "IconSearch", "IconClose", "IconPlus", "IconChevronDown", "IconArrowRight", "IconPin", "IconClock", "IconHelp",
  ]) assert.ok(ui.includes(contract), contract);
  assert.match(ui, /className="kd-chip"[\s\S]*?borderRadius: 8/);
  assert.match(ui, /className="kd-seg-control"[\s\S]*?borderRadius: 8/);
});

check("Foundation wird vor den drei reservierten Bereichs-Slots geladen", () => {
  const main = source("./src/main.jsx");
  const positions = ["./index.css", "./styles/design-foundation.css", "./styles/design-primary.css", "./styles/design-secondary.css", "./styles/design-shell.css"].map((part) => main.indexOf(part));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

console.log(`design_foundation_test: ${checks} Checks bestanden.`);

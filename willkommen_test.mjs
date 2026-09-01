/* Oberflächentest für src/components/DreieckRegler.jsx
   + Quelltext-Zusicherungen an den Vollseiten-Einstieg (EinstiegsGate/App)
   ===========================================================================
   HERKUNFT & UMBAU
   ---------------------------------------------------------------------------
   Die frühere Willkommens-Box ist entfernt; der Dateiname bleibt wegen des
   npm-Skripts bestehen. Der lebende DreieckRegler bleibt als Erklärstück und
   als gesteuerte Bewertungseingabe vollständig geprüft:
     D1  alle 216 Startkombinationen in Reglern, Zahlen, Glyph und Geometrie,
     D2  jede Achse über 0..5 einschließlich Nachbar- und Grenzprüfung,
     D3  keine abgeleitete Schlagseiten-Kategorie und kein Rankingbonus mehr,
     D4  die vollständige gesteuert/ungesteuert-Naht.
   G und F behalten die Gate- bzw. Rückruf-Zusicherungen. Die am 08.08.2026
   ausdrücklich entfernte Produktfunktion wird nicht durch Löschen des
   Reglertests kaschiert, sondern durch positive Abwesenheits- und Scorechecks
   abgesichert.

   WIE JSX UNTER NODE LAUFBAR WIRD
   ---------------------------------------------------------------------------
   Technik exakt übernommen aus findertab_test.mjs:
     * esbuild (steckt in vite, keine neue Abhängigkeit) bündelt VOR dem Test
       zu einem ESM-Modul. Bündeln statt bloß übersetzen, weil DreieckRegler
       weiter auf ui.jsx und tokens.js zieht; D3 bindet zusätzlich match.js ein.
     * react/react-dom bleiben EXTERN — sonst hätte das Bündel eine zweite
       React-Instanz und `act()` aus dem Testprozess griffe ins Leere.
     * Ausgabe unter node_modules/.cache/ — kein Artefakt im Repo.
     * Kein Netz, kein Anbieter: der Baum der Komponente enthält keinen
       services/-Import. Es gibt nichts zu stubben.

   AUSTAUSCHBARE QUELLEN (Mutationstest)
   ---------------------------------------------------------------------------
       DREIECKREGLER_QUELLE  src/components/DreieckRegler.jsx
       MATCH_QUELLE          src/lib/match.js   (der Grundscore ohne
                             abgeleiteten Achsenbonus)
       APP_QUELLE            src/App.jsx — NUR als Quelltext gelesen, nicht
                             montiert.
   Beispiel:
       DREIECKREGLER_QUELLE=/tmp/mut4_grenze.jsx node willkommen_test.mjs

   WAS GEPRÜFT WIRD
   ---------------------------------------------------------------------------
     G   Gate-Zusicherungen für den Vollseiten-Einstieg.
     D1  Startwerte aus der start-Prop über alle 216 Kombinationen.
     D2  Reglerbewegungen, Zahlen, Glyph-Geometrie und Achsenzuordnung.
     D3  Die entfernte Ableitung bleibt aus UI und Score verschwunden.
     D4  Rückrufnaht, gesteuerter und ungesteuerter Betrieb.
     F   Nicht exit-relevante Beobachtung an der onChange-Prüfung.

   Kein Framework, keine neue Abhängigkeit. Aufruf: node willkommen_test.mjs
   =========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const WURZEL = path.dirname(fileURLToPath(import.meta.url));
const startZeit = Date.now();

/* ---------------------------------------------------------------- Zählwerk */
const gruppen = new Map();
const rot = [];
const rotF = [];
let okF = 0;
const check = (gruppe, name, wert) => {
  let ergebnis;
  try {
    ergebnis = typeof wert === "function" ? wert() : wert;
  } catch (e) {
    ergebnis = false;
    name += "  [Ausnahme: " + e.message + "]";
  }
  const voll = "[" + gruppe + "] " + name;
  if (gruppe === "F") {
    if (ergebnis) { okF++; console.log("✓ " + voll); } else { rotF.push(voll); console.log("○ OFFEN: " + voll); }
    return;
  }
  const z = gruppen.get(gruppe) || { ok: 0, rot: 0 };
  if (ergebnis) { z.ok++; console.log("✓ " + voll); } else { z.rot++; rot.push(voll); console.log("✗ FEHLGESCHLAGEN: " + voll); }
  gruppen.set(gruppe, z);
};

/* =========================================================================
   BÜNDELN
   ========================================================================= */
async function ladeEsbuild() {
  try {
    return await import("esbuild");
  } catch {
    /* esbuild kommt mit vite; liegt es nicht flach im Wurzel-node_modules,
       wird es aus vites Sicht aufgelöst. Kein npm install im Test. */
    const req = createRequire(import.meta.resolve("vite"));
    return req("esbuild");
  }
}

const QUELLEN = {
  regler: {
    datei: process.env.DREIECKREGLER_QUELLE || path.join(WURZEL, "src/components/DreieckRegler.jsx"),
    loader: "jsx", dir: path.join(WURZEL, "src/components"),
  },
  match: {
    datei: process.env.MATCH_QUELLE || path.join(WURZEL, "src/lib/match.js"),
    loader: "js", dir: path.join(WURZEL, "src/lib"),
  },
};
for (const q of Object.values(QUELLEN)) q.text = fs.readFileSync(q.datei, "utf8");
const GETAUSCHT = Object.entries(QUELLEN)
  .filter(([k]) => process.env[{ regler: "DREIECKREGLER_QUELLE", match: "MATCH_QUELLE" }[k]])
  .map(([k, q]) => k + "=" + q.datei);

/* src/App.jsx wird NICHT gebündelt — die Datei zieht die komplette App samt
   Speicher, Diensten und Datenimporten nach; sie hier zu montieren wäre ein
   zweiter Integrationstest, kein Komponententest. Die Gate-Zusicherungen
   (Abschnitt G) sind deshalb Quelltext-Zusicherungen — dasselbe Mittel, das
   architekturgrenzen_test.mjs für App.jsx benutzt. Tauschbar über APP_QUELLE,
   damit auch diese Hälfte eine Mutationsprobe hat. */
const APP_DATEI = process.env.APP_QUELLE || path.join(WURZEL, "src/App.jsx");
const APP_TEXT = fs.readFileSync(APP_DATEI, "utf8");
const EINSTIEG_TEXT = fs.readFileSync(path.join(WURZEL, "src/components/EinstiegsGate.jsx"), "utf8");
if (process.env.APP_QUELLE) GETAUSCHT.push("app=" + APP_DATEI);

/* Der Eintritt ist ein virtuelles Modul, damit die Regler-Quelle tauschbar
   bleibt und relative Importe weiter gegen das echte src/ auflösen. */
const EINTRITT = `
export { DreieckRegler } from "./DreieckRegler.jsx";
export { score } from "../lib/match.js";
`;

const AUSGABE_DIR = path.join(WURZEL, "node_modules/.cache/willkommen-test");
const AUSGABE = path.join(AUSGABE_DIR, "dreieckregler.bundle.mjs");

const esbuild = await ladeEsbuild();
fs.mkdirSync(AUSGABE_DIR, { recursive: true });
const gebautAb = Date.now();
await esbuild.build({
  entryPoints: ["regler-eintritt"],
  bundle: true,
  format: "esm",
  outfile: AUSGABE,
  jsx: "automatic",
  target: "es2022",
  logLevel: "warning",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  plugins: [{
    name: "dreieckregler-test",
    setup(bau) {
      bau.onResolve({ filter: /^regler-eintritt$/ }, () => ({ path: "eintritt", namespace: "wk" }));
      bau.onResolve({ filter: /(^|[\\/])DreieckRegler\.jsx$/ }, () => ({ path: "regler", namespace: "wk" }));
      bau.onResolve({ filter: /(^|[\\/])match\.js$/ }, () => ({ path: "match", namespace: "wk" }));
      bau.onLoad({ filter: /.*/, namespace: "wk" }, (args) => {
        if (args.path === "eintritt") {
          return { contents: EINTRITT, loader: "js", resolveDir: path.join(WURZEL, "src/components") };
        }
        const q = QUELLEN[args.path];
        return { contents: q.text, loader: q.loader, resolveDir: q.dir };
      });
    },
  }],
});
const bauDauer = Date.now() - gebautAb;

/* =========================================================================
   JSDOM + React — Reihenfolge zählt: die Browser-Globalen müssen stehen,
   bevor react-dom geladen wird.
   ========================================================================= */
const dom = new JSDOM(
  "<!doctype html><html><body>" +
  "<div id=\"reglerwurzel\"></div>" +
  "</body></html>", { url: "http://localhost/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLButtonElement",
  "SVGElement", "Element", "Event", "MouseEvent", "KeyboardEvent", "CustomEvent", "Node", "NodeList", "getComputedStyle", "localStorage"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act, useState, createElement: h } = React;

const { DreieckRegler, score } = await import(AUSGABE);

/* ------------------------------------------------------------ Bedienhilfen */
/* `feld` bestimmt den Suchraum — hier immer der eigene Montagepunkt. */
let feld = () => document.getElementById("reglerwurzel");
const regler = (achse) => { const f = feld(); return f ? f.querySelector("input[aria-label=\"" + achse + "\"]") : null; };
const reglerAlle = () => { const f = feld(); return f ? [...f.querySelectorAll("input[type=\"range\"]")] : []; };
/* Die Zahl rechts vom Regler: letztes <span> in derselben Zeile. */
const anzeige = (achse) => {
  const el = regler(achse); if (!el) return null;
  const spans = [...el.parentElement.querySelectorAll("span")];
  return spans.length ? spans[spans.length - 1].textContent.trim() : null;
};
const glyph = () => { const f = feld(); return f ? f.querySelector("svg") : null; };
const glyphLabel = () => { const g = glyph(); return g ? g.getAttribute("aria-label") : null; };
/* Der zweite <polygon> ist das gefüllte Innendreieck — dort steckt die
   Geometrie, die aus den Werten folgt. */
const innenPunkte = () => {
  const g = glyph(); if (!g) return null;
  const p = g.querySelectorAll("polygon");
  if (p.length < 2) return null;
  return p[1].getAttribute("points").split(" ").map((s) => s.split(",").map(Number));
};
const wertSetzer = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
const ziehe = async (achse, wert) => {
  const el = regler(achse);
  if (!el) throw new Error("Regler nicht gefunden: " + achse);
  await act(async () => {
    wertSetzer.call(el, String(wert));
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
};

/* Geometrie aus ui.jsx: c = size/2, r = size/2-3, Ecken bei -90°/30°/150°,
   Eckenradius = max(wert, 0.35)/5 * r.  Nachgerechnet, nicht importiert. */
const erwarteterRadius = (wert, size) => (Math.max(wert, 0.35) / 5) * (size / 2 - 3);
const eckenAbstand = (punkt, size) => Math.hypot(punkt[0] - size / 2, punkt[1] - size / 2);

/* Jeder Abschnitt läuft in seiner eigenen Funktion. Reisst einer ab (etwa weil
   eine Mutation einen Knopf entfernt hat), wird das als roter Check dieses
   Abschnitts vermerkt und die übrigen laufen weiter — ein roter Check darf
   nichts verdecken (Regel aus finder_test.mjs). */
const ABSCHNITTE = [];
const abschnitt = (name, lauf) => ABSCHNITTE.push([name, lauf]);
const steuer = {};

/* =========================================================================
   G — GATE-ZUSICHERUNGEN (Quelltext; vorher Teil von W5)
   Der alte Willkommen-Dialog und seine KI-/Demo-Auswahl sind entfernt. Der
   lokale Weg speichert nur den clean-Marker; online bleibt er ausgeblendet.
   ========================================================================= */
abschnitt("G", async () => {
console.log("\n--- G: Gate-Zusicherungen (Quelltext) ---");

check("G", "App.jsx montiert den alten Willkommen-Dialog nicht mehr", () => !/<Willkommen\b/.test(APP_TEXT));
check("G", "Minimal-Einstieg bietet keine Demo-, Startwahl- oder KI-Auswahl",
  () => !/Demo ansehen|StartWahl|setWillkommen|kiAn/.test(EINSTIEG_TEXT));
check("G", "lokaler Einstieg speichert nur clean und schliesst danach das Gate",
  () => /localStorage\.setItem\(K\.start, "clean"\)[\s\S]+schliesseEinstieg\("gast"\)[\s\S]+setOffen\(false\)/.test(EINSTIEG_TEXT));
check("G", "Online-Gast sieht keinen Localmodus-Knopf",
  () => /!onlineLoginPflicht && <button[\s\S]+Ohne Konto fortfahren/.test(EINSTIEG_TEXT));
});

/* =========================================================================
   D — DREIECKREGLER
   Der Regler wird eigenständig montiert. Der Schlüssel erzwingt eine
   Neumontage, denn `start` wird nur beim ersten Rendern gelesen
   (useState-Initialwert).
   ========================================================================= */
const reglerWurzel = createRoot(document.getElementById("reglerwurzel"));
let montageNr = 0;
const montiere = async (props) => {
  montageNr++;
  await act(async () => { reglerWurzel.render(h(DreieckRegler, { ...props, key: "m" + montageNr })); });
};
const montiereGleich = async (props) => {   // ohne Schlüsselwechsel: kein Neuaufbau
  await act(async () => { reglerWurzel.render(h(DreieckRegler, { ...props, key: "m" + montageNr })); });
};

abschnitt("D1", async () => {
console.log("\n--- D1: Startwerte aus der start-Prop ---");

await montiere({});
check("D1", "ohne Props steht der Regler auf dem Vorgabewert 4/2/5",
  () => anzeige("WIE") === "4" && anzeige("WAS") === "2" && anzeige("WARUM") === "5"
    && glyphLabel() === "wie 4, was 2, warum 5");
check("D1", "ohne Props: Vorgabe size=54 und scale=2.1",
  () => glyph().getAttribute("width") === "54" && glyph().parentElement.style.transform === "scale(2.1)");

await montiere({ start: { wie: 5, was: 2, warum: 4 }, scale: 1.7, size: 44 });
check("D1", "die Aufrufstelle aus Erklaerstuecke.jsx kommt unverändert durch: 5/2/4, scale 1.7, size 44",
  () => anzeige("WIE") === "5" && anzeige("WAS") === "2" && anzeige("WARUM") === "4"
    && glyph().getAttribute("width") === "44" && glyph().getAttribute("height") === "44"
    && glyph().parentElement.style.transform === "scale(1.7)");

/* Alle 216 Kombinationen: jeder Startwert muss in Regler, Anzeige, Glyph-
   Beschriftung UND Glyph-Geometrie ankommen. Nicht ein Beispiel — alle. */
const f = { regler: [], anzeige: [], label: [], geo: [] };
for (let w = 0; w <= 5; w++) for (let a = 0; a <= 5; a++) for (let r = 0; r <= 5; r++) {
  await montiere({ start: { wie: w, was: a, warum: r } });
  const marke = w + "/" + a + "/" + r;
  if (!(regler("WIE").value === String(w) && regler("WAS").value === String(a) && regler("WARUM").value === String(r))) f.regler.push(marke);
  if (!(anzeige("WIE") === String(w) && anzeige("WAS") === String(a) && anzeige("WARUM") === String(r))) f.anzeige.push(marke);
  if (glyphLabel() !== "wie " + w + ", was " + a + ", warum " + r) f.label.push(marke);
  const p = innenPunkte();
  const geoOk = p && [w, a, r].every((v, i) => Math.abs(eckenAbstand(p[i], 54) - erwarteterRadius(v, 54)) < 0.01);
  if (!geoOk) f.geo.push(marke);
}
check("D1", "alle 216 Startkombinationen landen im Regler-Wert  [Fehler: " + f.regler.length + (f.regler[0] ? ", zuerst " + f.regler[0] : "") + "]",
  () => f.regler.length === 0);
check("D1", "alle 216 Startkombinationen landen in der Zahlenanzeige  [Fehler: " + f.anzeige.length + (f.anzeige[0] ? ", zuerst " + f.anzeige[0] : "") + "]",
  () => f.anzeige.length === 0);
check("D1", "alle 216 Startkombinationen landen in der Glyph-Beschriftung  [Fehler: " + f.label.length + (f.label[0] ? ", zuerst " + f.label[0] : "") + "]",
  () => f.label.length === 0);
check("D1", "alle 216 Startkombinationen verziehen die Glyph-Geometrie achsenrichtig  [Fehler: " + f.geo.length + (f.geo[0] ? ", zuerst " + f.geo[0] : "") + "]",
  () => f.geo.length === 0);
});

abschnitt("D2", async () => {
console.log("\n--- D2: Reglerbewegung wirkt ---");

/* Jede Achse einzeln über den vollen Wertebereich. Geprüft wird nicht nur,
   dass der Wert zurückkommt, sondern dass er WIRKT: Zahl, Glyph-Beschriftung
   und Glyph-Geometrie müssen mitgehen — und die beiden anderen
   Achsen dürfen sich NICHT mitbewegen (fängt vertauschte Achsen). */
const ACHSEN = [["WIE", 0], ["WAS", 1], ["WARUM", 2]];
const f = { zahl: [], label: [], geo: [], nachbar: [] };
for (const [achse, idx] of ACHSEN) {
  await montiere({ start: { wie: 3, was: 3, warum: 3 } });
  for (const wert of [0, 1, 2, 3, 4, 5]) {
    await ziehe(achse, wert);
    const v = [3, 3, 3]; v[idx] = wert;
    const marke = achse + "→" + wert;
    if (anzeige(achse) !== String(wert)) f.zahl.push(marke + " (zeigt " + anzeige(achse) + ")");
    if (glyphLabel() !== "wie " + v[0] + ", was " + v[1] + ", warum " + v[2]) f.label.push(marke + " (" + glyphLabel() + ")");
    const nachbarn = ACHSEN.filter(([, i]) => i !== idx);
    if (!nachbarn.every(([an]) => anzeige(an) === "3")) f.nachbar.push(marke);
    const p = innenPunkte();
    if (!(p && v.every((x, i) => Math.abs(eckenAbstand(p[i], 54) - erwarteterRadius(x, 54)) < 0.01))) f.geo.push(marke);
  }
}
check("D2", "jede Achse nimmt jeden Wert 0..5 an und zeigt ihn  [Fehler: " + f.zahl.length + (f.zahl[0] ? ", zuerst " + f.zahl[0] : "") + "]",
  () => f.zahl.length === 0);
check("D2", "jede Reglerbewegung schlägt achsenrichtig in die Glyph-Beschriftung durch  [Fehler: " + f.label.length + (f.label[0] ? ", zuerst " + f.label[0] : "") + "]",
  () => f.label.length === 0);
check("D2", "jede Reglerbewegung verzieht die Glyph-Geometrie an der richtigen Ecke  [Fehler: " + f.geo.length + (f.geo[0] ? ", zuerst " + f.geo[0] : "") + "]",
  () => f.geo.length === 0);
check("D2", "eine Achse zu ziehen lässt die beiden anderen unberührt  [Fehler: " + f.nachbar.length + (f.nachbar[0] ? ", zuerst " + f.nachbar[0] : "") + "]",
  () => f.nachbar.length === 0);
/* Mehrere Bewegungen hintereinander: der Zustand ist kumulativ, nicht
   je Regler getrennt. */
await montiere({ start: { wie: 0, was: 0, warum: 0 } });
await ziehe("WIE", 5); await ziehe("WAS", 3); await ziehe("WARUM", 1);
check("D2", "drei Bewegungen nacheinander summieren sich zu 5/3/1",
  () => glyphLabel() === "wie 5, was 3, warum 1"
    && anzeige("WIE") === "5" && anzeige("WAS") === "3" && anzeige("WARUM") === "1");

/* Werte außerhalb 0..5 kommen gar nicht erst an — die Regler begrenzen. */
await ziehe("WIE", 9);
check("D2", "ein Wert über 5 wird auf 5 begrenzt", () => anzeige("WIE") === "5" && regler("WIE").value === "5");
await ziehe("WAS", -3);
check("D2", "ein Wert unter 0 wird auf 0 begrenzt", () => anzeige("WAS") === "0" && regler("WAS").value === "0");
});

abschnitt("D3", async () => {
console.log("\n--- D3: keine abgeleitete Kategorie oder Rankingprämie ---");

check("D3", "match.js exportiert keine Schlagseiten-Ermittlung mehr",
  () => !/export\s+function\s+schlagseite(?:n)?\b/.test(QUELLEN.match.text));
check("D3", "DreieckRegler importiert keine Ableitung aus match.js",
  () => !/from\s+["']\.\.\/lib\/match\.js["']/.test(QUELLEN.regler.text));
check("D3", "DreieckRegler enthält keine abgeleitete Kategorieanzeige",
  () => !/Kategorie:|-lastig|schlagseite/i.test(QUELLEN.regler.text));

const scoreFehler = [];
for (let w = 0; w <= 5; w++) for (let a = 0; a <= 5; a++) for (let r = 0; r <= 5; r++) {
  const ist = score({ bewertung: { wie: w, was: a, warum: r } });
  if (ist !== w + a + r) scoreFehler.push(w + "/" + a + "/" + r + " → " + ist);
}
check("D3", "alle 216 Wertekombinationen ergeben exakt die Summe der drei Achsen"
  + "  [Fehler: " + scoreFehler.length + (scoreFehler[0] ? ", zuerst " + scoreFehler[0] : "") + "]",
  () => scoreFehler.length === 0);

await montiere({ start: { wie: 5, was: 0, warum: 4 } });
check("D3", "im gerenderten Erklärstück erscheint keine abgeleitete Kategorie",
  () => !/Kategorie:|-lastig|schlagseite/i.test(feld().textContent));
await ziehe("WAS", 5);
check("D3", "auch nach einer Reglerbewegung bleiben nur Werte und Dreieck sichtbar",
  () => glyphLabel() === "wie 5, was 5, warum 4"
    && !/Kategorie:|-lastig|schlagseite/i.test(feld().textContent));
});

abschnitt("D4", async () => {
console.log("\n--- D4: die Naht nach außen — nur, wenn der Aufrufer sie benutzt ---");

/* HERKUNFT: Der frühere Teil D4/1 maß die Props, die die WILLKOMMENS-BOX an
   den Regler übergab (keine Rückrufnaht). Er ist mit der Box entfernt
   (Entscheid Max 03.08.2026: Tour entfernt, Hilfe gestärkt) — die Zusage
   „ein Erklärstück stört niemanden nach außen" wird für die verbliebenen
   Erklär-Aufrufer weiterhin von D4/2 getragen: OHNE übergebene Naht feuert
   nichts. Die übrigen Teile (D4/2–D4/7) stehen unverändert. */

/* ---------------------------------------------------------------- D4/2
   Der Spion-Check: OHNE eine übergebene Naht feuert nichts. Die Namen
   stehen, weil jeder von ihnen eine plausible künftige Naht benennt und der
   Check sie weiterhin ausschliesst. */
const spionRufe = [];
const NAMEN = ["onAendern", "onAenderung", "onBw", "onWerte", "setBw", "onSlider", "onKategorie", "onCategoryChange", "aendere", "onStartChange"];
const spione = {};
for (const n of NAMEN) spione[n] = (...a) => spionRufe.push([n, a]);

await montiere({ start: { wie: 2, was: 2, warum: 2 }, ...spione });
for (const achse of ["WIE", "WAS", "WARUM"]) for (const wert of [0, 1, 2, 3, 4, 5]) await ziehe(achse, wert);
check("D4", "18 Reglerbewegungen OHNE onChange: kein einziger Aufruf nach außen  [gemessen: "
  + spionRufe.length + " Aufruf(e)" + (spionRufe[0] ? " an " + spionRufe[0][0] : "") + "]",
  () => spionRufe.length === 0);
check("D4", "die Bewegungen sind trotzdem angekommen (der Spion-Lauf war kein Leerlauf)",
  () => glyphLabel() === "wie 5, was 5, warum 5");
check("D4", "unbekannte Props landen auch nicht als DOM-Attribute auf dem Wurzelelement",
  () => { const w = feld().firstElementChild; return !!w && NAMEN.every((n) => !w.hasAttribute(n.toLowerCase())); });

/* ---------------------------------------------------------------- D4/3
   Der ungesteuerte Betrieb mit Naht: Der Regler hält den Zustand selbst UND
   meldet. Das ist der Zwischenfall, den `gesteuert = !!wert` erzeugt — er wird
   hier gemessen, nicht angenommen. */
const meldungen = [];
await montiere({ start: { wie: 1, was: 1, warum: 1 }, onChange: (v) => meldungen.push(v) });
await ziehe("WIE", 4);
check("D4", "onChange OHNE `wert`: der Regler bewegt sich selbst  [gemessen: " + glyphLabel() + "]",
  () => glyphLabel() === "wie 4, was 1, warum 1");
check("D4", "…und meldet die vollständige Wertegruppe  [gemessen: " + JSON.stringify(meldungen) + "]",
  () => meldungen.length === 1 && JSON.stringify(meldungen[0]) === JSON.stringify({ wie: 4, was: 1, warum: 1 }));
await ziehe("WAS", 0);
check("D4", "…und meldet beim zweiten Zug den fortgeschriebenen Stand, nicht den Startwert"
  + "  [gemessen: " + JSON.stringify(meldungen[1]) + "]",
  () => JSON.stringify(meldungen[1]) === JSON.stringify({ wie: 4, was: 0, warum: 1 }));

/* ---------------------------------------------------------------- D4/4
   Der GESTEUERTE Betrieb. 18 Bewegungen, 18 Meldungen — das Gegenteil von
   D4/2, mit demselben Verfahren gemessen. */
const gesteuerteMeldungen = [];
await montiere({ wert: { wie: 2, was: 2, warum: 2 }, onChange: (v) => gesteuerteMeldungen.push(v) });
for (const achse of ["WIE", "WAS", "WARUM"]) for (const wert of [0, 1, 2, 3, 4, 5]) await ziehe(achse, wert);
/* 18 Zugversuche, aber 15 Meldungen — und das ist richtig: Die Anzeige steht
   im gesteuerten Betrieb dauerhaft auf 2, drei der 18 Züge setzen den Regler
   also auf den Wert, den er schon zeigt, und der Browser feuert dafür kein
   Ereignis. Gemessen und ausgewiesen statt auf 18 gerundet — eine Zahl, die
   nur mit einer Ausrede stimmt, ist keine Messung. */
check("D4", "gesteuert: 18 Zugversuche ergeben 15 Meldungen nach außen (3 Züge treffen "
  + "den bereits angezeigten Wert 2)  [gemessen: " + gesteuerteMeldungen.length + "]",
  () => gesteuerteMeldungen.length === 15);
check("D4", "jede Meldung trägt genau die drei Achsen  [gemessen: "
  + JSON.stringify(Object.keys(gesteuerteMeldungen[0] || {})) + "]",
  () => gesteuerteMeldungen.every((m) => JSON.stringify(Object.keys(m).sort()) === JSON.stringify(["warum", "was", "wie"])));
/* Und jetzt die Trennung: Der Aufrufer hat den Wert NICHT übernommen, also
   darf sich nichts bewegt haben. Ein innerer Zustand, der im gesteuerten
   Betrieb weiter die Anzeige bestimmte, wäre ein zweiter Speicherort. */
check("D4", "…die ANZEIGE bleibt trotzdem beim Wert des Aufrufers  [gemessen: " + glyphLabel() + "]",
  () => glyphLabel() === "wie 2, was 2, warum 2");
check("D4", "…auch die Reglerstellungen selbst  [gemessen: "
  + JSON.stringify(reglerAlle().map((e) => e.value)) + "]",
  () => reglerAlle().every((e) => e.value === "2"));
check("D4", "…und die Zahlen rechts daneben  [gemessen: "
  + JSON.stringify(["WIE", "WAS", "WARUM"].map(anzeige)) + "]",
  () => ["WIE", "WAS", "WARUM"].every((a) => anzeige(a) === "2"));
/* Die Meldung selbst rechnet auf dem Wert des Aufrufers weiter, nicht auf
   einem eigenen Stand: Die letzte Bewegung war WARUM=5, gemeldet werden muss
   2/2/5 und nicht 5/5/5. */
check("D4", "die Meldungen rechnen auf dem Wert des AUFRUFERS, nicht auf einem eigenen Stand"
  + "  [gemessen: letzte Meldung " + JSON.stringify(gesteuerteMeldungen[gesteuerteMeldungen.length - 1]) + "]",
  () => JSON.stringify(gesteuerteMeldungen[gesteuerteMeldungen.length - 1])
    === JSON.stringify({ wie: 2, was: 2, warum: 5 }));
check("D4", "…und keine einzige Meldung trägt einen Wert, den der Aufrufer nie gesetzt hat "
  + "(je Meldung genau EINE Achse abweichend von 2/2/2)  [gemessen: "
  + gesteuerteMeldungen.filter((m) => ["wie", "was", "warum"].filter((a) => m[a] !== 2).length > 1).length
  + " Ausreisser]",
  () => gesteuerteMeldungen.every((m) => ["wie", "was", "warum"].filter((a) => m[a] !== 2).length <= 1));

/* ---------------------------------------------------------------- D4/5
   Übernimmt der Aufrufer, folgt die Anzeige — sonst wäre der gesteuerte
   Betrieb eine Sackgasse. Ein Halter mit echtem Zustand, wie ihn das
   Geschmacks-Onboarding baut. */
function ReglerHalter() {
  const [w, setW] = useState({ wie: 1, was: 1, warum: 1 });
  steuer.reglerWert = w;
  return h(DreieckRegler, { wert: w, onChange: setW });
}
await act(async () => { reglerWurzel.render(h(ReglerHalter, { key: "halter" })); });
await ziehe("WIE", 4); await ziehe("WARUM", 5); await ziehe("WAS", 0);
check("D4", "übernimmt der Aufrufer, folgt die Anzeige  [gemessen: " + glyphLabel() + "]",
  () => glyphLabel() === "wie 4, was 0, warum 5");
check("D4", "…und der Aufrufer hält denselben Wert  [gemessen: " + JSON.stringify(steuer.reglerWert) + "]",
  () => JSON.stringify(steuer.reglerWert) === JSON.stringify({ wie: 4, was: 0, warum: 5 }));
/* ---------------------------------------------------------------- D4/6
   Keine Vermischung: Der ungesteuerte Regler funktioniert weiter allein, und
   der gesteuerte trägt keinen Rest aus dem ungesteuerten Betrieb. */
await montiere({ start: { wie: 0, was: 0, warum: 0 } });
await ziehe("WAS", 4);
check("D4", "ungesteuert bleibt ungesteuert: der Regler funktioniert allein  [gemessen: "
  + glyphLabel() + "]", () => glyphLabel() === "wie 0, was 4, warum 0");
await montiere({ start: { wie: 5, was: 5, warum: 5 }, wert: { wie: 1, was: 1, warum: 1 }, onChange: () => {} });
check("D4", "gesteuert schlägt `start`: die Anzeige folgt `wert`, nicht dem Startwert"
  + "  [gemessen: " + glyphLabel() + "]", () => glyphLabel() === "wie 1, was 1, warum 1");
/* NACHGEZOGEN AM 28.07.2026 (F7b-Fix). Vorher stand hier: „`wert` ohne
   `onChange`: der Regler steht still" — das war das gemeldete Problem, nicht
   die gewollte Grenze. `gesteuert` hängt jetzt an BEIDEN Props, ein
   vergessener `onChange` ergibt also keinen stummen Regler mehr, sondern
   einen ganz normalen ungesteuerten. Der Check ist nicht gestrichen, sondern
   umgedreht und um die Frage erweitert, die dabei offenblieb: Wirkt `wert` im
   ungesteuerten Betrieb wenigstens als Startwert? Nachgemessen: NEIN, er wird
   vollständig ignoriert, die Anzeige kommt aus `start`. Das ist die Grenze,
   die jetzt gepinnt gehört — sie ist die eigentliche Falle für den nächsten
   Aufrufer, der „ich gebe halt mal `wert` mit" denkt. */
await montiere({ wert: { wie: 1, was: 2, warum: 3 } });
check("D4", "`wert` ohne `onChange` macht NICHT gesteuert: die Anzeige kommt aus `start`"
  + " (Vorgabe 4/2/5), nicht aus `wert`  [gemessen: " + glyphLabel() + "]",
  () => glyphLabel() === "wie 4, was 2, warum 5");
await ziehe("WIE", 5);
check("D4", "…und der Regler lässt sich ganz normal bewegen (kein stummer Regler mehr)"
  + "  [gemessen: " + glyphLabel() + "]", () => glyphLabel() === "wie 5, was 2, warum 5");
await montiere({ wert: { wie: 1, was: 2, warum: 3 }, start: { wie: 0, was: 0, warum: 0 } });
check("D4", "…`wert` wirkt dabei auch nicht als Startwert — `start` gewinnt  [gemessen: "
  + glyphLabel() + "]", () => glyphLabel() === "wie 0, was 0, warum 0");
/* Und die Gegenprobe: Erst BEIDE Props zusammen schalten den gesteuerten
   Betrieb ein. Sonst wäre die neue Bedingung nicht belegt, sondern geraten. */
await montiere({ wert: { wie: 1, was: 2, warum: 3 }, start: { wie: 0, was: 0, warum: 0 }, onChange: () => {} });
check("D4", "erst `wert` UND `onChange` zusammen machen gesteuert  [gemessen: "
  + glyphLabel() + "]", () => glyphLabel() === "wie 1, was 2, warum 3");

/* ---------------------------------------------------------------- D4/7
   Unverändert übernommen: Die `start`-Prop wird nur beim Aufbau gelesen
   (useState-Initialwert). Ein neuer Wert von außen erreicht die Anzeige
   NICHT — das ist genau der Grund, warum es die `wert`-Naht braucht. */
await montiere({ start: { wie: 1, was: 1, warum: 1 } });
await ziehe("WIE", 5);
await montiereGleich({ start: { wie: 0, was: 0, warum: 0 } });
check("D4", "eine neue start-Prop OHNE Neuaufbau wirkt nicht — der Regler behält 5/1/1",
  () => glyphLabel() === "wie 5, was 1, warum 1");
await montiere({ start: { wie: 0, was: 0, warum: 0 } });
check("D4", "erst der Neuaufbau übernimmt die neue start-Prop",
  () => glyphLabel() === "wie 0, was 0, warum 0");
});

/* =========================================================================
   F — AUFFÄLLIGKEITEN AM IST-VERHALTEN
   Nicht exit-relevant, damit die Kette grün bleibt; sie stehen hier, damit
   die Befunde nicht in einem Bericht verschwinden.
   Die früheren F-Beobachtungen an der Willkommens-Box (F7 Privatmodus,
   F8 KI-Zusage ohne Fähigkeitsprüfung) sind MIT DER BOX entfernt (Entscheid
   Max 03.08.2026: Tour entfernt, Hilfe gestärkt) — die entsprechenden
   Zusagen der KI-Wahl leben heute im EinstiegsGate (Quelltext-Checks in
   Abschnitt G und in einstieg_test.mjs; der fail-closed-Speicherweg in
   kischalter_test.mjs). Übrig bleibt die Beobachtung am Regler selbst.
   ========================================================================= */
abschnitt("F", async () => {
console.log("\n--- F: Auffälligkeiten (nicht exit-relevant) ---");

/* F8 (Regler) — die Aufrufstelle prüft `onChange` genauso streng wie
   `gesteuert`; ein truthy Nicht-Funktionswert darf nicht erst bei der ersten
   Reglerbewegung werfen. */
check("F", "F8: die Aufrufstelle prüft `onChange` genauso streng wie `gesteuert`"
  + "  [gemessen: gesteuert=" + JSON.stringify((QUELLEN.regler.text.match(/const gesteuert = [^;]*/) || [])[0])
  + ", Aufruf=" + JSON.stringify((QUELLEN.regler.text.match(/^\s*onChange\??\.?\(neu\);/m) || [])[0]?.trim()
    || (QUELLEN.regler.text.match(/typeof onChange === "function"\) onChange\(neu\)/) || [])[0]) + "]",
  () => /typeof onChange === "function"\)\s*onChange\(neu\)/.test(QUELLEN.regler.text));
});

for (const [name, lauf] of ABSCHNITTE) {
  try {
    await lauf();
  } catch (e) {
    check(name, "Abschnitt " + name + " abgebrochen: " + e.message, false);
  }
}

/* =========================================================================
   BILANZ
   ========================================================================= */
const TITEL = {
  G: "Gate-Zusicherungen (Quelltext)",
  D1: "Startwerte aus der start-Prop",
  D2: "Reglerbewegung wirkt",
  D3: "keine abgeleitete Kategorie",
  D4: "Naht nach außen: nur auf Verlangen",
};
let ok = 0, schlecht = 0;
console.log("\n===========================================================");
for (const [k, q] of Object.entries(QUELLEN)) {
  console.log("Quelle " + (k + ":").padEnd(12) + path.relative(WURZEL, q.datei));
}
if (GETAUSCHT.length) console.log("MUTATIONSLAUF:  " + GETAUSCHT.join("   "));
console.log("Bündel:   esbuild, " + bauDauer + " ms   ·   kein Netz, kein Anbieter im Baum");
for (const [g, t] of Object.entries(TITEL)) {
  const z = gruppen.get(g) || { ok: 0, rot: 0 };
  ok += z.ok; schlecht += z.rot;
  console.log(`${g}  ${(t + " ").padEnd(46, ".")} ${z.ok}/${z.ok + z.rot}`);
}
console.log(`\n${ok}/${ok + schlecht} Checks bestanden.   Laufzeit ${((Date.now() - startZeit) / 1000).toFixed(1)} s`);
if (rot.length) {
  console.log("\nROTE CHECKS:");
  for (const n of rot) console.log("  ✗ " + n);
}
console.log(`\nF  Auffälligkeiten am Ist-Verhalten: ${okF}/${okF + rotF.length} unauffällig`
  + (rotF.length ? " — " + rotF.length + " offen:" : ""));
for (const n of rotF) console.log("  ○ " + n);
if (rotF.length) {
  console.log("  (Bewusst NICHT als grüner Check auf das Ist-Verhalten gepinnt und nicht");
  console.log("   exit-relevant. WILLKOMMEN_FORDERUNG=1 schaltet sie scharf.)");
}
const streng = process.env.WILLKOMMEN_FORDERUNG === "1";
const fehlschlag = schlecht > 0 || (streng && rotF.length > 0);
console.log(fehlschlag ? "\nDREIECKREGLER/GATE-TEST: BEFUNDE OBEN" : "\nDREIECKREGLER/GATE-TEST BESTANDEN");
process.exit(fehlschlag ? 1 : 0);

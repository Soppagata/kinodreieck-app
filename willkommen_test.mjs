/* Oberflächentest für src/components/DreieckRegler.jsx
   + Quelltext-Zusicherungen an den Vollseiten-Einstieg (EinstiegsGate/App)
   ===========================================================================
   HERKUNFT & UMBAU 04.08.2026 — Entscheid Max 03.08.2026: Tour entfernt,
   Hilfe gestärkt.
   ---------------------------------------------------------------------------
   Diese Datei prüfte ursprünglich die Willkommens-Box
   (src/components/Willkommen.jsx; Abschnitte W1–W6 samt KI-Karte). Die Box
   war seit dem Vollseiten-Einstieg (EinstiegsGate) nirgends mehr montiert
   und wurde mit den übrigen Tour-Ruinen aus dem Quellbaum entfernt. Die
   zugehörigen Checks W1–W6 und die F-Beobachtungen AN DER BOX sind deshalb
   ENTFERNT, nicht verschoben — das geprüfte Subsystem existiert nicht mehr;
   die KI-Wahl-Zusagen leben heute im EinstiegsGate und werden dort von
   einstieg_test.mjs / personalmodus_test.mjs gedeckt. ERHALTEN bleiben:
     D1–D4  der vollständige DreieckRegler-Vertrag. Die Komponente lebt
            weiter (Erklaerstuecke.jsx, Geschmacks-Onboarding) — kein
            einziger D-Check wurde gestrichen; nur D4/1 (Props, die die
            Willkommens-Box hereinreichte) fiel mit der Box weg.
     G      die Gate-Zusicherungen, die vorher in W5 mitliefen: App montiert
            keine Willkommens-Box; der Einstieg markiert die Erklärung erst
            nach erfolgreich GESPEICHERTER KI-Wahl.
     F      die verbliebene Quelltext-Beobachtung am Regler (F8).
   Der Dateiname bleibt wegen npm-Skript (test:willkommen) und Suite-Kette
   unverändert.

   WIE JSX UNTER NODE LAUFBAR WIRD
   ---------------------------------------------------------------------------
   Technik exakt übernommen aus findertab_test.mjs:
     * esbuild (steckt in vite, keine neue Abhängigkeit) bündelt VOR dem Test
       zu einem ESM-Modul. Bündeln statt bloß übersetzen, weil DreieckRegler
       weiter auf ui.jsx, tokens.js und match.js zieht.
     * react/react-dom bleiben EXTERN — sonst hätte das Bündel eine zweite
       React-Instanz und `act()` aus dem Testprozess griffe ins Leere.
     * Ausgabe unter node_modules/.cache/ — kein Artefakt im Repo.
     * Kein Netz, kein Anbieter: der Baum der Komponente enthält keinen
       services/-Import. Es gibt nichts zu stubben.

   AUSTAUSCHBARE QUELLEN (Mutationstest)
   ---------------------------------------------------------------------------
       DREIECKREGLER_QUELLE  src/components/DreieckRegler.jsx
       MATCH_QUELLE          src/lib/match.js   (dort stehen `schlagseite`
                             und `schlagseiten`, aus denen die Kategorie folgt)
       APP_QUELLE            src/App.jsx — NUR als Quelltext gelesen, nicht
                             montiert.
   Beispiel:
       DREIECKREGLER_QUELLE=/tmp/mut4_grenze.jsx node willkommen_test.mjs

   WAS GEPRÜFT WIRD
   ---------------------------------------------------------------------------
     G   Quelltext-Zusicherungen: App montiert die alte Box nicht; der
         Vollseiten-Einstieg schreibt erst, dann markiert, dann schließt er.
     D1  Startwerte aus der `start`-Prop landen in Reglern, Anzeige und Glyph —
         über ALLE 216 Kombinationen von 0..5³.
     D2  Reglerbewegung wirkt: Zahl, Glyph-Geometrie, Glyph-Beschriftung und
         Kategorie folgen — jeder Achse über den vollen Wertebereich.
     D3  Kategorie-Ableitung über den gesamten Wertebereich: 216er-Schleife,
         die DREITEILUNG (36 ausgewogen / 12 zu schwach / 168 mit Schlagseite)
         als Partition über alle 216, die Deckungsprüfung beider
         Nicht-Schlagseiten-Aussagen, die Paarungsprüfung Label↔Formel, alle
         drei Kanten (Spanne, Mindesthöhe, Gleichstand) benannt UND erfahren,
         und die VOLLSTÄNDIGE Menge der 27 geteilten Spitzen.
     D4  Die Naht nach außen — nur, wenn der Aufrufer sie benutzt: ohne
         übergebene Naht feuert nichts, der gesteuerte Betrieb meldet jede
         Bewegung, beide Betriebsarten vermischen sich nicht.
     F   Auffälligkeiten am Ist-Verhalten. Nicht exit-relevant;
         WILLKOMMEN_FORDERUNG=1 schaltet sie scharf.

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

const { DreieckRegler } = await import(AUSGABE);

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
/* Kategorie-Zeile: der innerste <div>, dessen Text mit "Kategorie:" beginnt. */
const kategorieZeile = () => {
  const f = feld(); if (!f) return null;
  const d = [...f.querySelectorAll("div")].filter((x) => x.textContent.replace(/\s+/g, " ").trim().startsWith("Kategorie:"));
  return d.length ? d[d.length - 1] : null;
};
const kategorieText = () => { const z = kategorieZeile(); return z ? z.textContent.replace(/\s+/g, " ").trim() : null; };
const kategorieTeile = () => {
  const t = kategorieText(); if (!t) return null;
  const m = /^Kategorie:\s*(.+?)\s+—\s+(.+)$/.exec(t);
  return m ? { label: m[1], formel: m[2] } : null;
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

/* --- Erwartungswerte. BEWUSST hier neu geschrieben und NICHT aus
       src/lib/match.js importiert: würde der Test `schlagseite`/`schlagseiten`
       importieren, wäre jede Mutation an Schwelle oder Gleichstandsregel auf
       beiden Seiten der Gleichung und damit unsichtbar. Lehre aus Etappe 6.

   VERTRAGSÄNDERUNG 27.07.2026 (Etappe 7) — hier standen vorher zwei Regeln,
   jetzt sind es drei. Was sich geändert hat und warum:

   (1) SPANNE >= 2   — unverändert seit jeher.
   (2) SPITZE >= 3   — NEU (Befund F3 der Testhand). Vorher kannte die Regel
       nur die Spanne, nicht die Höhe: 0/0/2 galt als „WARUM-lastig — Relevanz
       vor Form und Stoff", obwohl 2 von 5 das Gegenteil von Relevanz ist.
       Nachgerechnet: die Mindesthöhe ändert GENAU 12 der 216 Kombinationen,
       und alle zwölf enthalten eine 0 (0/0/2 0/1/2 0/2/0 0/2/1 0/2/2 1/0/2
       1/2/0 2/0/0 2/0/1 2/0/2 2/1/0 2/2/0). Das ist kein Zufall, sondern
       zwingend: mx < 3 UND mx - mn >= 2 erzwingt mx = 2 und mn = 0.
   (3) ALLE Achsen auf der Spitze werden genannt — NEU (Befund F2). Vorher
       entschied `v.indexOf(mx)` den Gleichstand still zugunsten der zuerst
       genannten Achse: 4/2/4 las sich als „WIE-lastig — Handwerk vor Stoff",
       obwohl WARUM gleich stark ist. Jetzt: „WIE/WARUM-lastig — gleichauf
       vorn". Nachgerechnet: 27 der 216 Kombinationen haben eine geteilte
       Spitze, 141 eine eindeutige.
   (4) ZWEI GRÜNDE für „keine Schlagseite" — NEU (Befund F5), zweite Runde.
       Vorher fielen beide auf „Ausgewogen — alle drei im Gleichgewicht"
       zusammen. Für 3/3/3 stimmt das; für 2/0/0 war es nachweislich falsch —
       der Glyph zeichnet daneben sichtbar schief. Seither:
         Spanne < 2              → „Ausgewogen — alle drei im Gleichgewicht"
         Spanne >= 2, Spitze < 3 → „Ohne Schlagseite — alle drei kaum
                                    ausgeprägt"
       Der Wertebereich ist damit DREIgeteilt, nicht mehr zweigeteilt:
       36 gleichgewicht + 12 schwach + 168 mit Schlagseite = 216.
   Wichtig: die Anzeige folgt `schlagseiten()`; `schlagseite()` (Einzahl)
   bleibt einwertig und trägt weiter Filter, score() und Suchranking. */
const ACHSNAME = ["WIE", "WAS", "WARUM"];
const FORMEL = ["Handwerk vor Stoff", "Stoff vor Handwerk", "Relevanz vor Form und Stoff"];
const SPITZE_MIN_SOLL = 3;
const SPANNE_MIN_SOLL = 2;
const erwarteteAchsen = (wie, was, warum) => {
  const v = [wie, was, warum];
  const mx = Math.max(...v), mn = Math.min(...v);
  if (mx - mn < SPANNE_MIN_SOLL) return []; // (1) Spanne zu klein
  if (mx < SPITZE_MIN_SOLL) return [];      // (2) Spitze zu niedrig
  return [0, 1, 2].filter((i) => v[i] === mx);   // (3) ALLE Höchstwerte
};
/* ACHTUNG — hier liegt die Bruchstelle des F5-Fixes, deshalb rechnet der Test
   anders als die Implementierung: `ohneSchlagseiteGrund` in DreieckRegler.jsx
   leitet „schwach" ALLEIN AUS DER SPANNE ab und prüft die Höhe gar nicht. Es
   verlässt sich darauf, dass die niedrige Spitze der einzig verbleibende
   Grund ist. Heute stimmt das; der Test prüft die Höhe trotzdem eigens nach
   (D3: „die Aussage 'kaum ausgeprägt' ist gedeckt"), damit die Annahme selbst
   beobachtet wird und nicht bloß ihr heutiges Ergebnis. */
const erwarteterGrund = (w, a, r) => {
  const v = [w, a, r];
  return Math.max(...v) - Math.min(...v) < SPANNE_MIN_SOLL ? "gleichgewicht" : "schwach";
};
const erwartetesLabel = (w, a, r) => {
  const idx = erwarteteAchsen(w, a, r);
  if (idx.length) return idx.map((i) => ACHSNAME[i]).join("/") + "-lastig";
  return erwarteterGrund(w, a, r) === "gleichgewicht" ? "Ausgewogen" : "Ohne Schlagseite";
};
const erwarteteFormel = (w, a, r) => {
  const idx = erwarteteAchsen(w, a, r);
  if (!idx.length) {
    return erwarteterGrund(w, a, r) === "gleichgewicht"
      ? "alle drei im Gleichgewicht"
      : "alle drei kaum ausgeprägt";
  }
  /* Bei geteilter Spitze gibt es keine Vorrang-Aussage, weil es keinen
     Vorrang gibt — die alte Tabelle hätte hier eine erfunden. */
  return idx.length > 1 ? "gleichauf vorn" : FORMEL[idx[0]];
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
   Der alte Willkommen-Dialog ist entfernt; der Vollseiten-Einstieg markiert
   die Erklärung erst nach erfolgreich gespeicherter KI-Wahl.
   ========================================================================= */
abschnitt("G", async () => {
console.log("\n--- G: Gate-Zusicherungen (Quelltext) ---");

check("G", "App.jsx montiert den alten Willkommen-Dialog nicht mehr", () => !/<Willkommen\b/.test(APP_TEXT));
check("G", "der neue Einstieg stoppt bei einer nicht gespeicherten KI-Wahl",
  () => /gespeichert === false\)[\s\S]+setFehler[\s\S]+return;/.test(EINSTIEG_TEXT));
check("G", "setWillkommen(true) liegt im erfolgreichen Abschluss des Vollseiten-Einstiegs",
  () => /const abschliessen = \(kiAn\)[\s\S]+setWillkommen\(true\)/.test(EINSTIEG_TEXT));
check("G", "erst nach dem Markieren wird der Einstieg geschlossen",
  () => /setWillkommen\(true\)[\s\S]+schliesseEinstieg\(weg\)[\s\S]+onFertig\(\)/.test(EINSTIEG_TEXT));
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
    && glyph().parentElement.style.transform === "scale(1.7)"
    && kategorieText() === "Kategorie: WIE-lastig — Handwerk vor Stoff");

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
   dass der Wert zurückkommt, sondern dass er WIRKT: Zahl, Glyph-Beschriftung,
   Glyph-Geometrie und Kategorie müssen mitgehen — und die beiden anderen
   Achsen dürfen sich NICHT mitbewegen (fängt vertauschte Achsen). */
const ACHSEN = [["WIE", 0], ["WAS", 1], ["WARUM", 2]];
const f = { zahl: [], label: [], geo: [], kat: [], nachbar: [] };
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
    const soll = "Kategorie: " + erwartetesLabel(v[0], v[1], v[2]) + " — " + erwarteteFormel(v[0], v[1], v[2]);
    if (kategorieText() !== soll) f.kat.push(marke + " (" + kategorieText() + " statt " + soll + ")");
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
check("D2", "die Kategorie folgt jeder einzelnen Reglerbewegung  [Fehler: " + f.kat.length + (f.kat[0] ? ", zuerst " + f.kat[0] : "") + "]",
  () => f.kat.length === 0);

/* Mehrere Bewegungen hintereinander: der Zustand ist kumulativ, nicht
   je Regler getrennt. */
await montiere({ start: { wie: 0, was: 0, warum: 0 } });
await ziehe("WIE", 5); await ziehe("WAS", 3); await ziehe("WARUM", 1);
check("D2", "drei Bewegungen nacheinander summieren sich zu 5/3/1",
  () => glyphLabel() === "wie 5, was 3, warum 1"
    && anzeige("WIE") === "5" && anzeige("WAS") === "3" && anzeige("WARUM") === "1"
    && kategorieText() === "Kategorie: WIE-lastig — Handwerk vor Stoff");

/* Werte außerhalb 0..5 kommen gar nicht erst an — die Regler begrenzen. */
await ziehe("WIE", 9);
check("D2", "ein Wert über 5 wird auf 5 begrenzt", () => anzeige("WIE") === "5" && regler("WIE").value === "5");
await ziehe("WAS", -3);
check("D2", "ein Wert unter 0 wird auf 0 begrenzt", () => anzeige("WAS") === "0" && regler("WAS").value === "0");
});

abschnitt("D3", async () => {
console.log("\n--- D3: Kategorie-Ableitung über den vollen Wertebereich ---");

/* Alle 216 Kombinationen gegen die im Test NEU gerechnete Erwartung.
   Zusätzlich wird gezählt, wie oft jedes der möglichen Ergebnisse
   vorkommt — ein Test, der nur „kommt was zurück" prüft, hätte in Etappe 6
   drei Viertel einer kaputten Funktion durchgelassen. */
const f = [];
const gesehen = new Map();
/* Der beobachtete Fall wird aus dem DOM ZURÜCKGELESEN, nicht aus der
   Erwartung übernommen — nur so lässt sich unten prüfen, ob die Aussage der
   Oberfläche durch die Werte gedeckt ist. */
const istFall = (label) => {
  if (label === "Ausgewogen") return "gleichgewicht";
  if (label === "Ohne Schlagseite") return "schwach";
  if (/-lastig$/.test(label)) return "schlagseite";
  return "unbekannt(" + label + ")";
};
const faelle = new Map();       // beobachteter Fall -> Liste der Kombinationen
const paare = new Set();        // beobachtete Label|Formel-Paarungen
for (let w = 0; w <= 5; w++) for (let a = 0; a <= 5; a++) for (let r = 0; r <= 5; r++) {
  await montiere({ start: { wie: w, was: a, warum: r } });
  const soll = { label: erwartetesLabel(w, a, r), formel: erwarteteFormel(w, a, r) };
  const ist = kategorieTeile();
  gesehen.set(soll.label, (gesehen.get(soll.label) || 0) + 1);
  if (ist) {
    const fall = istFall(ist.label);
    if (!faelle.has(fall)) faelle.set(fall, []);
    faelle.get(fall).push([w, a, r]);
    paare.add(ist.label.replace(/^(WIE|WAS|WARUM)(\/(WIE|WAS|WARUM))*-lastig$/,
      (m) => (m.split("/").length > 1 ? "<geteilt>-lastig" : "<achse>-lastig")) + " | " + ist.formel);
  }
  if (!ist || ist.label !== soll.label || ist.formel !== soll.formel) {
    f.push(w + "/" + a + "/" + r + ": „" + (ist ? ist.label + " — " + ist.formel : kategorieText()) + "\" statt „" + soll.label + " — " + soll.formel + "\"");
  }
}
check("D3", "alle 216 Kombinationen ergeben Label UND Formel wie gerechnet  [Fehler: " + f.length + (f[0] ? ", zuerst " + f[0] : "") + "]",
  () => f.length === 0);
/* VERTRAGSÄNDERUNG 27.07.2026: erst vier mögliche Ergebnisse, dann sieben
   (die drei geteilten Spitzen), jetzt ACHT — „Ohne Schlagseite" ist der
   zweite Grund für „keine Schlagseite" (Befund F5). Die
   Vollständigkeitszählung wird jedes Mal mitgezogen, sonst prüfte sie ab dann
   nur noch einen Teil des Wertebereichs (genau der Etappe-6-Fehler, gegen den
   sie ursprünglich gebaut wurde). */
const ALLE_LABEL = ["Ausgewogen", "Ohne Schlagseite", "WIE-lastig", "WAS-lastig", "WARUM-lastig",
  "WIE/WAS-lastig", "WIE/WARUM-lastig", "WAS/WARUM-lastig"];
check("D3", "die Schleife hat alle ACHT möglichen Ergebnisse erreicht (keine tote Hälfte)"
  + "  [" + ALLE_LABEL.map((k) => k + " " + (gesehen.get(k) || 0)).join(", ") + "]",
  () => ALLE_LABEL.every((k) => (gesehen.get(k) || 0) > 0));
/* Ein Dreifach-Gleichstand ist nicht bloß selten, sondern UNMÖGLICH: teilen
   sich alle drei Achsen die Spitze, ist die Spanne 0 und es gibt gar keine
   Schlagseite. Über alle 216 Kombinationen nachgezählt — 0 Fälle. Der Check
   sichert die Invariante, damit ein künftiger Umbau von `schlagseiten()`
   nicht still ein „WIE/WAS/WARUM-lastig" erzeugt, das inhaltlich Unsinn ist. */
check("D3", "ein Dreifach-Gleichstand kommt in keiner der 216 Kombinationen vor (Spanne 0 schließt ihn aus)",
  () => ![...gesehen.keys()].some((k) => k.split("/").length === 3));

/* ---------------------------------------------------------------------
   DIE DREITEILUNG (Vertrag seit dem F5-Fix)
   Jede Kombination gehört in GENAU EINEN von drei Fällen. Die Prüfung läuft
   gegen das, was die Oberfläche gesagt hat, nicht gegen die Erwartung —
   sonst prüfte sie nur die Erwartungsfunktion gegen sich selbst.
   --------------------------------------------------------------------- */
const anzahl = (k) => (faelle.get(k) || []).length;
check("D3", "jede der 216 Kombinationen fällt in genau einen der drei Fälle — kein unbekanntes Label"
  + "  [" + [...faelle.keys()].map((k) => k + " " + anzahl(k)).join(", ") + "]",
  () => [...faelle.keys()].every((k) => ["gleichgewicht", "schwach", "schlagseite"].includes(k))
    && anzahl("gleichgewicht") + anzahl("schwach") + anzahl("schlagseite") === 216);
check("D3", "die Dreiteilung hat die richtigen Mengen: 36 ausgewogen, 12 zu schwach, 168 mit Schlagseite"
  + "  [gemessen: " + anzahl("gleichgewicht") + " / " + anzahl("schwach") + " / " + anzahl("schlagseite") + "]",
  () => anzahl("gleichgewicht") === 36 && anzahl("schwach") === 12 && anzahl("schlagseite") === 168);
const anzahlEindeutig = ["WIE-lastig", "WAS-lastig", "WARUM-lastig"].reduce((s, k) => s + (gesehen.get(k) || 0), 0);
const anzahlGeteilt = ["WIE/WAS-lastig", "WIE/WARUM-lastig", "WAS/WARUM-lastig"].reduce((s, k) => s + (gesehen.get(k) || 0), 0);
check("D3", "und die 168 teilen sich in 141 eindeutige und 27 geteilte Spitzen"
  + "  [gemessen: " + anzahlEindeutig + " / " + anzahlGeteilt + "]",
  () => anzahlEindeutig === 141 && anzahlGeteilt === 27 && anzahlEindeutig + anzahlGeteilt === 168);

/* Sind die drei Aussagen durch die Werte GEDECKT? Das ist der eigentliche
   Punkt, nicht die Menge. Die Implementierung leitet „schwach" allein aus der
   Spanne ab und prüft die Höhe nie — hier wird sie geprüft. Sagt die
   Oberfläche „alle drei kaum ausgeprägt", muss die Spitze auch wirklich
   niedrig sein; sagt sie „im Gleichgewicht", muss die Spanne wirklich klein
   sein. Genau diese beiden Checks schlagen an, wenn die Schwelle in
   src/lib/match.js und die in DreieckRegler.jsx auseinanderlaufen. */
const ungedecktSchwach = (faelle.get("schwach") || []).filter((v) => Math.max(...v) >= SPITZE_MIN_SOLL);
check("D3", "jede als „Ohne Schlagseite — alle drei kaum ausgeprägt\" gemeldete Lage hat auch wirklich eine Spitze < 3"
  + "  [ungedeckt: " + ungedecktSchwach.length + (ungedecktSchwach[0] ? ", zuerst " + ungedecktSchwach[0].join("/") : "") + "]",
  () => ungedecktSchwach.length === 0);
const ungedecktGleich = (faelle.get("gleichgewicht") || []).filter((v) => Math.max(...v) - Math.min(...v) >= SPANNE_MIN_SOLL);
check("D3", "jede als „Ausgewogen — alle drei im Gleichgewicht\" gemeldete Lage hat auch wirklich eine Spanne < 2"
  + "  [ungedeckt: " + ungedecktGleich.length + (ungedecktGleich[0] ? ", zuerst " + ungedecktGleich[0].join("/") : "") + "]",
  () => ungedecktGleich.length === 0);
/* Und umgekehrt: keine Lage mit kleiner Spanne darf als „schief, aber zu
   schwach" durchgehen — sonst wäre die Dreiteilung an der anderen Kante undicht. */
const falschSchwach = (faelle.get("schwach") || []).filter((v) => Math.max(...v) - Math.min(...v) < SPANNE_MIN_SOLL);
check("D3", "keine Lage mit Spanne < 2 wird als „Ohne Schlagseite\" ausgegeben  [Fehler: " + falschSchwach.length + "]",
  () => falschSchwach.length === 0);

/* Laufen Label und Formel je auseinander? Über alle 216 Kombinationen wurden
   die tatsächlich aufgetretenen Paarungen gesammelt; erlaubt sind genau diese.
   Eine weitere Paarung hieße, dass die beiden Funktionen den Fall verschieden
   beantworten — etwa „Ohne Schlagseite — alle drei im Gleichgewicht". */
const ERLAUBTE_PAARE = [
  "Ausgewogen | alle drei im Gleichgewicht",
  "Ohne Schlagseite | alle drei kaum ausgeprägt",
  "<achse>-lastig | Handwerk vor Stoff",
  "<achse>-lastig | Stoff vor Handwerk",
  "<achse>-lastig | Relevanz vor Form und Stoff",
  "<geteilt>-lastig | gleichauf vorn",
];
const fremdePaare = [...paare].filter((p) => !ERLAUBTE_PAARE.includes(p));
check("D3", "Label und Formel laufen in keiner der 216 Kombinationen auseinander"
  + "  [" + paare.size + " Paarungen aufgetreten, fremd: " + fremdePaare.length
  + (fremdePaare[0] ? " → „" + fremdePaare[0] + "\"" : "") + "]",
  () => fremdePaare.length === 0 && paare.size === ERLAUBTE_PAARE.length);

/* Die Grenzfälle einzeln und namentlich. Drei Kanten hängen hier:
   SPANNE (1 vs. 2), SPITZE (2 vs. 3, seit 27.07.) und GLEICHSTAND. */
const einzeln = [
  [[3, 3, 3], "Ausgewogen", "alle drei im Gleichgewicht", "Spanne 0"],
  [[0, 0, 0], "Ausgewogen", "alle drei im Gleichgewicht", "Spanne 0 am unteren Rand"],
  [[5, 5, 5], "Ausgewogen", "alle drei im Gleichgewicht", "Spanne 0 am oberen Rand"],
  [[4, 3, 3], "Ausgewogen", "alle drei im Gleichgewicht", "Spanne 1 — noch ausgewogen"],
  [[3, 4, 3], "Ausgewogen", "alle drei im Gleichgewicht", "Spanne 1 auf WAS"],
  [[3, 3, 4], "Ausgewogen", "alle drei im Gleichgewicht", "Spanne 1 auf WARUM"],
  [[5, 3, 3], "WIE-lastig", "Handwerk vor Stoff", "Spanne 2 — kippt"],
  [[3, 5, 3], "WAS-lastig", "Stoff vor Handwerk", "Spanne 2 auf WAS"],
  [[3, 3, 5], "WARUM-lastig", "Relevanz vor Form und Stoff", "Spanne 2 auf WARUM"],

  /* --- Kante MINDESTHÖHE (Befund F3) und die DREITEILUNG (Befund F5).
     Alle 12 Kombinationen dieses Falls haben Spitze 2 und eine 0; „kaum
     ausgeprägt" ist damit für jede einzelne durch die Werte gedeckt. */
  [[2, 0, 0], "Ohne Schlagseite", "alle drei kaum ausgeprägt", "Spitze 2 < Mindesthöhe 3 — schief, aber zu schwach"],
  [[0, 0, 2], "Ohne Schlagseite", "alle drei kaum ausgeprägt", "Spitze 2 auf WARUM"],
  [[0, 2, 0], "Ohne Schlagseite", "alle drei kaum ausgeprägt", "Spitze 2 auf WAS"],
  [[3, 0, 0], "WIE-lastig", "Handwerk vor Stoff", "Spitze 3 = Mindesthöhe, Spanne 3 — kippt gerade noch"],
  [[3, 1, 1], "WIE-lastig", "Handwerk vor Stoff", "Spitze 3 = Mindesthöhe, Spanne 2 — die engste kippende Lage"],
  [[3, 2, 1], "WIE-lastig", "Handwerk vor Stoff", "Spitze 3, Spanne 2, alle Werte verschieden"],
  [[2, 1, 0], "Ohne Schlagseite", "alle drei kaum ausgeprägt", "Spanne 2 erfüllt, Spitze 2 nicht — die Höhe entscheidet allein"],
  /* Die dritte Kante, die es vorher gar nicht gab: gleichgewicht vs. schwach.
     Beide Lagen haben eine niedrige Spitze; allein die Spanne trennt sie. */
  [[1, 0, 0], "Ausgewogen", "alle drei im Gleichgewicht", "Spanne 1 bei niedrigen Werten — echt ausgewogen"],
  [[2, 1, 1], "Ausgewogen", "alle drei im Gleichgewicht", "Spanne 1, Spitze 2 — knapp diesseits der Schief-Kante"],
  [[2, 2, 1], "Ausgewogen", "alle drei im Gleichgewicht", "Spanne 1 bei geteilter Spitze — trotzdem ausgewogen"],
  [[2, 0, 2], "Ohne Schlagseite", "alle drei kaum ausgeprägt", "Spanne 2, Spitze 2 — ein Schritt weiter, schon schief"],

  [[5, 0, 0], "WIE-lastig", "Handwerk vor Stoff", "maximale Spanne auf WIE"],
  [[0, 5, 0], "WAS-lastig", "Stoff vor Handwerk", "maximale Spanne auf WAS"],
  [[0, 0, 5], "WARUM-lastig", "Relevanz vor Form und Stoff", "maximale Spanne auf WARUM"],
  [[1, 1, 5], "WARUM-lastig", "Relevanz vor Form und Stoff", "das 1/1/5 aus dem Erklärtext"],

  /* --- Kante GLEICHSTAND (Befund F2). Gemessen an Max' Bestand betraf das
     10 von 250 Einträgen (Sin City, Kill Bill Vol. 1, The Fifth Element,
     Scott Pilgrim: je 4/2/4). */
  [[5, 5, 0], "WIE/WAS-lastig", "gleichauf vorn", "geteilte Spitze WIE+WAS — vorher still „WIE-lastig“"],
  [[0, 5, 5], "WAS/WARUM-lastig", "gleichauf vorn", "geteilte Spitze WAS+WARUM — vorher still „WAS-lastig“"],
  [[5, 0, 5], "WIE/WARUM-lastig", "gleichauf vorn", "geteilte Spitze WIE+WARUM — vorher still „WIE-lastig“"],
  [[4, 2, 4], "WIE/WARUM-lastig", "gleichauf vorn", "der Sin-City-Fall aus Max' Bestand"],
  [[3, 3, 1], "WIE/WAS-lastig", "gleichauf vorn", "geteilte Spitze an der Mindesthöhe (3), Spanne 2"],
  [[3, 1, 3], "WIE/WARUM-lastig", "gleichauf vorn", "geteilte Spitze an beiden Kanten zugleich"],
  [[2, 2, 0], "Ohne Schlagseite", "alle drei kaum ausgeprägt", "geteilte Spitze UNTER der Mindesthöhe — Höhe schlägt Gleichstand, und der Grund wird benannt"],
];
for (const [[w, a, r], label, formel, warum] of einzeln) {
  await montiere({ start: { wie: w, was: a, warum: r } });
  check("D3", w + "/" + a + "/" + r + " → „" + label + " — " + formel + "\"  (" + warum + ")",
    () => kategorieText() === "Kategorie: " + label + " — " + formel);
}

/* --- GETEILTE SPITZE über den vollen Wertebereich (Vertrag seit 27.07.2026).
   Nicht ein Beispiel, sondern jedes Paar auf jeder erreichbaren Höhe: Für
   jede der drei Achsenpaarungen und jede Spitzenhöhe 3..5 wird die dritte
   Achse über alle Werte gefahren, die eine Schlagseite überhaupt zulassen.
   Geprüft wird, dass BEIDE Achsen im Label stehen, in kanonischer Reihenfolge
   (WIE vor WAS vor WARUM — nicht in Klickreihenfolge), und dass die Formel
   „gleichauf vorn" lautet statt einer erfundenen Vorrang-Aussage. */
const PAARE = [[0, 1, "WIE/WAS"], [0, 2, "WIE/WARUM"], [1, 2, "WAS/WARUM"]];
const fPaar = [];
let paarFaelle = 0;
for (const [i, j, name] of PAARE) {
  for (const spitze of [3, 4, 5]) {
    for (let dritt = 0; dritt <= spitze - 2; dritt++) {
      const v = [dritt, dritt, dritt]; v[i] = spitze; v[j] = spitze;
      paarFaelle++;
      await montiere({ start: { wie: v[0], was: v[1], warum: v[2] } });
      const soll = "Kategorie: " + name + "-lastig — gleichauf vorn";
      if (kategorieText() !== soll) fPaar.push(v.join("/") + ": „" + kategorieText() + "\" statt „" + soll + "\"");
    }
  }
}
/* Die 27 Fälle sind nicht eine Stichprobe, sondern die VOLLSTÄNDIGE Menge:
   eine geteilte Spitze verlangt zwei Achsen auf `spitze` und die dritte auf
   höchstens `spitze - 2`, und genau das zählt die Schleife ab. Die Zahl muss
   deshalb mit der Zählung aus der 216er-Schleife oben übereinstimmen. */
check("D3", "jede geteilte Spitze nennt beide Achsen in kanonischer Reihenfolge  [" + paarFaelle
  + " Fälle = alle, Fehler: " + fPaar.length + (fPaar[0] ? ", zuerst " + fPaar[0] : "") + "]",
  () => fPaar.length === 0 && paarFaelle === 27 && paarFaelle === anzahlGeteilt);
/* Gegenprobe zur Reihenfolge: die Anzeige darf NICHT der Bewegungsreihenfolge
   folgen. Erst WARUM hochziehen, dann WIE — das Label bleibt „WIE/WARUM". */
await montiere({ start: { wie: 0, was: 0, warum: 0 } });
await ziehe("WARUM", 5); await ziehe("WIE", 5);
check("D3", "die Reihenfolge im Label ist kanonisch, nicht die der Reglerbewegung (erst WARUM, dann WIE → „WIE/WARUM\")",
  () => kategorieText() === "Kategorie: WIE/WARUM-lastig — gleichauf vorn");

/* --- Die Kanten noch einmal ERFAHREN statt gesetzt.
   (a) SPANNE: 3/3/3 → WARUM 4 → 5 → 4. */
await montiere({ start: { wie: 3, was: 3, warum: 3 } });
await ziehe("WARUM", 4);
check("D3", "Regler von 3 auf 4 (Spanne 1): bleibt Ausgewogen",
  () => kategorieText() === "Kategorie: Ausgewogen — alle drei im Gleichgewicht");
await ziehe("WARUM", 5);
check("D3", "ein weiterer Schritt auf 5 (Spanne 2): kippt auf WARUM-lastig",
  () => kategorieText() === "Kategorie: WARUM-lastig — Relevanz vor Form und Stoff");
await ziehe("WARUM", 4);
check("D3", "der Schritt zurück auf 4 macht es wieder Ausgewogen — die Kante ist in beide Richtungen dicht",
  () => kategorieText() === "Kategorie: Ausgewogen — alle drei im Gleichgewicht");

/* (b) EIN ZUG DURCH ALLE DREI FÄLLE, an einer einzigen Achse erfahren:
   0/0/0 → WIE 1 → 2 → 3 → 2 → 1. Das ist die schärfste Form der Prüfung, weil
   beide Kanten in einer Bewegung liegen und beide Richtungen mitlaufen. */
await montiere({ start: { wie: 0, was: 0, warum: 0 } });
check("D3", "Zug 0/0/0 — Ausgangslage ist echtes Gleichgewicht",
  () => kategorieText() === "Kategorie: Ausgewogen — alle drei im Gleichgewicht");
await ziehe("WIE", 1);
check("D3", "Zug WIE=1 (Spanne 1): noch echtes Gleichgewicht — die Spannen-Kante hält",
  () => kategorieText() === "Kategorie: Ausgewogen — alle drei im Gleichgewicht");
await ziehe("WIE", 2);
check("D3", "Zug WIE=2 (Spanne 2, Spitze 2): schief, aber zu schwach — „Ohne Schlagseite\"",
  () => kategorieText() === "Kategorie: Ohne Schlagseite — alle drei kaum ausgeprägt");
await ziehe("WIE", 3);
check("D3", "Zug WIE=3 (Spitze = Mindesthöhe): kippt auf WIE-lastig — die Höhen-Kante ist erreicht",
  () => kategorieText() === "Kategorie: WIE-lastig — Handwerk vor Stoff");
await ziehe("WIE", 2);
check("D3", "Zug zurück auf 2: wieder „Ohne Schlagseite\" — die Höhen-Kante ist beidseitig dicht",
  () => kategorieText() === "Kategorie: Ohne Schlagseite — alle drei kaum ausgeprägt");
await ziehe("WIE", 1);
check("D3", "Zug zurück auf 1: wieder „Ausgewogen\" — auch die Spannen-Kante ist beidseitig dicht",
  () => kategorieText() === "Kategorie: Ausgewogen — alle drei im Gleichgewicht");
/* Und dieselbe Dreiteilung auf einer anderen Achse, damit sie nicht an WIE
   hängt: 0/2/2 (geteilte Spitze, zu schwach) → 0/3/3. */
await montiere({ start: { wie: 0, was: 2, warum: 2 } });
check("D3", "0/2/2: geteilte Spitze, aber Spitze 2 — „Ohne Schlagseite\", nicht „WAS/WARUM-lastig\"",
  () => kategorieText() === "Kategorie: Ohne Schlagseite — alle drei kaum ausgeprägt");
await ziehe("WAS", 3); await ziehe("WARUM", 3);
check("D3", "0/3/3: dieselbe Form eine Stufe höher — jetzt „WAS/WARUM-lastig — gleichauf vorn\"",
  () => kategorieText() === "Kategorie: WAS/WARUM-lastig — gleichauf vorn");

/* (c) GLEICHSTAND: 5/0/0 → WARUM hoch bis 5 und wieder runter. Der Übergang
   von einer eindeutigen zu einer geteilten Spitze und zurück. */
await montiere({ start: { wie: 5, was: 0, warum: 0 } });
check("D3", "5/0/0 ist eindeutig WIE-lastig", () => kategorieText() === "Kategorie: WIE-lastig — Handwerk vor Stoff");
await ziehe("WARUM", 4);
check("D3", "WARUM auf 4: die Spitze bleibt bei WIE, kein Gleichstand",
  () => kategorieText() === "Kategorie: WIE-lastig — Handwerk vor Stoff");
await ziehe("WARUM", 5);
check("D3", "WARUM auf 5: die Spitze wird geteilt, die Formel verliert ihre Vorrang-Aussage",
  () => kategorieText() === "Kategorie: WIE/WARUM-lastig — gleichauf vorn");
await ziehe("WARUM", 4);
check("D3", "WARUM zurück auf 4: die Vorrang-Aussage kommt zurück",
  () => kategorieText() === "Kategorie: WIE-lastig — Handwerk vor Stoff");
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
check("D4", "…und die Kategorie-Zeile  [gemessen: " + JSON.stringify(kategorieText()) + "]",
  () => kategorieText() === "Kategorie: Ausgewogen — alle drei im Gleichgewicht");
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
check("D4", "…und die Kategorie folgt mit  [gemessen: " + JSON.stringify(kategorieText()) + "]",
  () => kategorieText() === "Kategorie: WARUM-lastig — Relevanz vor Form und Stoff");

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
  D3: "Kategorie-Ableitung",
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

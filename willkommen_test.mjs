/* Etappe 7 — Oberflächentest für src/components/Willkommen.jsx
                                 + src/components/DreieckRegler.jsx
   ===========================================================================
   WARUM DIESE DATEI EXISTIERT
   ---------------------------------------------------------------------------
   Das Phase-0-Audit hat festgestellt: kein einziger Test rendert diese beiden
   Komponenten. personalmodus_test.mjs schaltet die Willkommen-Box im Seed
   sogar aktiv weg (`willkommen: true` in kd:tutorial, Zeile 221) — genau
   damit die App danach ohne Dialog startet. Der gesamte Erstkontakt der App
   ist damit unbeobachtet.

   Etappe 7 baut hier um: die hartcodierte Kartenfolge (`karte === 1 ? … : …`)
   wird auf eine Schrittliste umgestellt, DreieckRegler bekommt eine
   Anzeige-Naht. Diese Datei nagelt VORHER das heutige Verhalten fest, damit
   der Umbau beweisbar nichts kaputt macht.

   IST, NICHT SOLL
   ---------------------------------------------------------------------------
   Jeder Check hier pinnt, was HEUTE passiert — auch dort, wo das Verhalten
   fragwürdig ist. Was fragwürdig ist, steht im Abschnitt F am Ende (nicht
   exit-relevant, wie in findertab_test.mjs) und im Bericht der Testhand.

   WIE JSX UNTER NODE LAUFBAR WIRD
   ---------------------------------------------------------------------------
   Technik exakt übernommen aus findertab_test.mjs (Zeilen 100–200):
     * esbuild (steckt in vite, keine neue Abhängigkeit) bündelt VOR dem Test
       zu einem ESM-Modul. Bündeln statt bloß übersetzen, weil Willkommen.jsx
       über DreieckRegler.jsx weiter auf ui.jsx, tokens.js und match.js zieht.
     * react/react-dom bleiben EXTERN — sonst hätte das Bündel eine zweite
       React-Instanz und `act()` aus dem Testprozess griffe ins Leere.
     * Ausgabe unter node_modules/.cache/ — kein Artefakt im Repo, und die
       externen react-Importe finden sich von dort über die normale Auflösung.
     * Kein Netz, kein Anbieter: der Baum dieser beiden Komponenten enthält
       keinen services/-Import. Es gibt nichts zu stubben.

   VIER AUSTAUSCHBARE QUELLEN (Mutationstest)
   ---------------------------------------------------------------------------
   Nicht nur der Eintritt, sondern jede getestete Datei lässt sich über eine
   Umgebungsvariable gegen eine Kopie tauschen; die relativen Importe lösen
   dabei weiter gegen das echte src/ auf (resolveDir):
       WILLKOMMEN_QUELLE     src/components/Willkommen.jsx
       DREIECKREGLER_QUELLE  src/components/DreieckRegler.jsx
       MATCH_QUELLE          src/lib/match.js   (dort stehen `schlagseite`
                             und `schlagseiten`, aus denen die Kategorie folgt)
       APP_QUELLE            src/App.jsx — NUR als Quelltext gelesen, nicht
                             montiert (siehe Kommentar an APP_TEXT).
   Beispiel:
       DREIECKREGLER_QUELLE=/tmp/mut4_grenze.jsx node willkommen_test.mjs

   WAS GEPRÜFT WIRD
   ---------------------------------------------------------------------------
     W1  Startzustand und Karte 1 (Texte, genau ein Knopf, kein Regler).
     W2  „Weiter" → Karte 2: DOM, Fokus-Übergabe, aria-label der Karte.
     W3  Karte 2 enthält den DreieckRegler, mit den Props aus Willkommen,
         inkl. Live-Region und den beiden neuen Kategorie-Regeln in der Box.
     W4  „Zurück" → Karte 1 (der Rückweg EXISTIERT), Fokus auch rückwärts,
         und was dabei verloren geht.
     W5  „Los geht's" und Escape → onClose: ein Aufruf, EIN Objektargument
         `{ durchgeklickt }`, plus Fokus-Falle und Fokus-Rückgabe. Dazu die
         Quelltext-Zusicherung an App.jsx, das darauf verzweigen MUSS.
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
     D4  Der Zustand dringt heute NICHT nach außen (kein Callback) und die
         `start`-Prop wirkt nach der Montage nicht mehr.
     F   Auffälligkeiten am Ist-Verhalten. Heute rot, NICHT exit-relevant.
         Bewusst nicht als grüner Check auf das Ist-Verhalten gepinnt: ein Pin
         auf falsches Verhalten macht die Reparatur später zur „Regression"
         (Regel aus dem Kopf von finder_test.mjs). WILLKOMMEN_FORDERUNG=1
         schaltet sie scharf.

   STAND 27.07.2026 — was sich gegenüber der ersten Fassung geändert hat
   ---------------------------------------------------------------------------
   Diese Datei ist in drei Runden gewachsen und jedes Mal NACHGEZOGEN, nicht
   neu geschrieben:
     Runde 1  91 Checks. Pinnte das IST-Verhalten vor Etappe 7 und meldete
              acht Auffälligkeiten (F1–F4 im Test, B/G/H/I/J im Bericht).
     Runde 2  126 Checks. Fünf Befunde umgesetzt: onClose-Argument, Fokus je
              Karte, aria-live, aria-label je Karte, Mindesthöhe, geteilte
              Spitze. Die vier F-Checks wurden scharf und zogen um.
     Runde 3  142 Checks. Die Dreiteilung (Befund F5) und die Folgen von B1/B2
              aus dem Testbericht (Filterchips und Chipfarbe).
   An jeder betroffenen Stelle steht im Kommentar, was vorher galt und warum
   es sich geändert hat — teils in drei Stufen, etwa an der 0/2/0-Bewegung in
   W3. Der Test soll die Entscheidung tragen, nicht bloß den neuen Zustand
   konservieren.

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
  willkommen: {
    datei: process.env.WILLKOMMEN_QUELLE || path.join(WURZEL, "src/components/Willkommen.jsx"),
    loader: "jsx", dir: path.join(WURZEL, "src/components"),
  },
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
  .filter(([k]) => process.env[{ willkommen: "WILLKOMMEN_QUELLE", regler: "DREIECKREGLER_QUELLE", match: "MATCH_QUELLE" }[k]])
  .map(([k, q]) => k + "=" + q.datei);

/* src/App.jsx wird NICHT gebündelt — die Datei zieht die komplette App samt
   Speicher, Diensten und Datenimporten nach; sie hier zu montieren wäre ein
   zweiter Integrationstest, kein Komponententest. Die Hälfte des Vertrags
   liegt aber dort: der Knopf meldet `durchgeklickt`, und NUR wenn der
   Aufrufer darauf verzweigt, ist Befund B wirklich behoben. Deshalb eine
   Quelltext-Zusicherung — dasselbe Mittel, das architekturgrenzen_test.mjs
   ab Zeile 246 für App.jsx benutzt. Tauschbar über APP_QUELLE, damit auch
   diese Hälfte eine Mutationsprobe hat. */
const APP_DATEI = process.env.APP_QUELLE || path.join(WURZEL, "src/App.jsx");
const APP_TEXT = fs.readFileSync(APP_DATEI, "utf8");
if (process.env.APP_QUELLE) GETAUSCHT.push("app=" + APP_DATEI);

/* Der Eintritt ist ein virtuelles Modul: es holt beide Komponenten aus den
   (tauschbaren) Quellen, damit DreieckRegler auch einzeln montierbar ist. */
const EINTRITT = `
export { Willkommen } from "./Willkommen.jsx";
export { DreieckRegler } from "./DreieckRegler.jsx";
`;

const AUSGABE_DIR = path.join(WURZEL, "node_modules/.cache/willkommen-test");
const AUSGABE = path.join(AUSGABE_DIR, "willkommen.bundle.mjs");

const esbuild = await ladeEsbuild();
fs.mkdirSync(AUSGABE_DIR, { recursive: true });
const gebautAb = Date.now();
await esbuild.build({
  entryPoints: ["willkommen-eintritt"],
  bundle: true,
  format: "esm",
  outfile: AUSGABE,
  jsx: "automatic",
  target: "es2022",
  logLevel: "warning",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  plugins: [{
    name: "willkommen-test",
    setup(bau) {
      bau.onResolve({ filter: /^willkommen-eintritt$/ }, () => ({ path: "eintritt", namespace: "wk" }));
      bau.onResolve({ filter: /(^|[\\/])Willkommen\.jsx$/ }, () => ({ path: "willkommen", namespace: "wk" }));
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
  "<button id=\"aussen\">außen</button>" +
  "<div id=\"wurzel\"></div><div id=\"reglerwurzel\"></div>" +
  "</body></html>", { url: "http://localhost/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLButtonElement",
  "SVGElement", "Element", "Event", "MouseEvent", "KeyboardEvent", "CustomEvent", "Node", "NodeList", "getComputedStyle"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act, useState, createElement: h } = React;
const { T } = await import("./src/lib/tokens.js");
const { Willkommen, DreieckRegler } = await import(AUSGABE);

/* ------------------------------------------------------------ Bedienhilfen */
const dialog = () => document.querySelector("[role=\"dialog\"]");
const inDialog = (sel) => { const d = dialog(); return d ? [...d.querySelectorAll(sel)] : []; };
const knoepfe = () => inDialog("button");
const knopf = (t) => knoepfe().find((b) => b.textContent.trim() === t);
const knopfTeil = (t) => knoepfe().find((b) => b.textContent.includes(t));
const dialogText = () => { const d = dialog(); return d ? d.textContent.replace(/\s+/g, " ").trim() : ""; };
const ruhe = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const klick = async (b) => {
  if (!b) throw new Error("Knopf nicht gefunden");
  await act(async () => { b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await ruhe();
};
const taste = async (key, opts = {}) => {
  const ziel = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
  await act(async () => {
    ziel.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
  });
  await ruhe();
};

/* Farbvergleich: React schreibt Hex in style, jsdom liest rgb() zurück. */
const messFarbe = dom.window.document.createElement("i");
const alsRgb = (hex) => { messFarbe.style.color = hex; return messFarbe.style.color; };

/* --- Regler-Zugriffe. `feld` bestimmt den Suchraum: Karte 2 der Willkommen-
       Box oder der eigenständig montierte DreieckRegler. */
let feld = () => dialog();
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
       Deshalb ist die Regel in Max' Bestand (nie eine 0 vergeben) inert —
       für Beta-Konten, denen Karte 2 die 0 ausdrücklich erlaubt, nicht.
   (3) ALLE Achsen auf der Spitze werden genannt — NEU (Befund F2). Vorher
       entschied `v.indexOf(mx)` den Gleichstand still zugunsten der zuerst
       genannten Achse: 4/2/4 las sich als „WIE-lastig — Handwerk vor Stoff",
       obwohl WARUM gleich stark ist. Jetzt: „WIE/WARUM-lastig — gleichauf
       vorn". Nachgerechnet: 27 der 216 Kombinationen haben eine geteilte
       Spitze, 141 eine eindeutige.
   (4) ZWEI GRÜNDE für „keine Schlagseite" — NEU (Befund F5), zweite Runde.
       Vorher fielen beide auf „Ausgewogen — alle drei im Gleichgewicht"
       zusammen. Für 3/3/3 stimmt das; für 2/0/0 war es nachweislich falsch —
       der Glyph zeichnet daneben sichtbar schief, und die Erklär-Karte legt
       mit „Schlagseite schlägt Ausgewogenheit" das Gegenteil nahe. Seither:
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
/* Welcher der drei Fälle liegt vor? Grundlage der Partitionsprüfung. */
const erwarteterFall = (w, a, r) =>
  erwarteteAchsen(w, a, r).length ? "schlagseite" : erwarteterGrund(w, a, r);
/* Geometrie aus ui.jsx: c = size/2, r = size/2-3, Ecken bei -90°/30°/150°,
   Eckenradius = max(wert, 0.35)/5 * r.  Nachgerechnet, nicht importiert. */
const erwarteterRadius = (wert, size) => (Math.max(wert, 0.35) / 5) * (size / 2 - 3);
const eckenAbstand = (punkt, size) => Math.hypot(punkt[0] - size / 2, punkt[1] - size / 2);

/* =========================================================================
   MONTAGE — Willkommen wie in App.jsx Zeile 2077: eine Komponente, die
   ein onClose hereinreicht. Die Argumente jedes Aufrufs werden mitgeschrieben.
   ========================================================================= */
const schliessRufe = [];
const steuer = {};
function Harnisch() {
  const [offen, setOffen] = useState(true);
  steuer.setOffen = setOffen;
  if (!offen) return h("div", null, "GESCHLOSSEN");
  return h(Willkommen, { onClose: (...args) => { schliessRufe.push(args); } });
}

const aussen = document.getElementById("aussen");
aussen.focus();
const fokusVorMontage = document.activeElement;
const wurzel = createRoot(document.getElementById("wurzel"));
await act(async () => { wurzel.render(h(Harnisch)); });
const fokusNachMontage = document.activeElement;

/* Jeder Abschnitt läuft in seiner eigenen Funktion. Reisst einer ab (etwa weil
   eine Mutation einen Knopf entfernt hat), wird das als roter Check dieses
   Abschnitts vermerkt und die übrigen laufen weiter — ein roter Check darf
   nichts verdecken (Regel aus finder_test.mjs). */
const ABSCHNITTE = [];
const abschnitt = (name, lauf) => ABSCHNITTE.push([name, lauf]);

/* =========================================================================
   W1 — STARTZUSTAND UND KARTE 1
   ========================================================================= */
abschnitt("W1", async () => {
console.log("\n--- W1: Startzustand und Karte 1 ---");

check("W1", "die Box hängt als Portal an document.body, nicht im Montagepunkt",
  () => !!dialog() && dialog().parentElement === document.body
    && document.getElementById("wurzel").children.length === 0);
check("W1", "die Box ist ein modaler Dialog mit Beschriftung „Willkommen bei Kinodreieck\"",
  () => dialog().getAttribute("role") === "dialog"
    && dialog().getAttribute("aria-modal") === "true"
    && dialog().getAttribute("aria-label") === "Willkommen bei Kinodreieck");

/* Der Startzustand: karte === 1. Alles Folgende hängt daran. */
check("W1", "Startkarte ist Karte 1 — Überschrift „Willkommen bei Kinodreieck.\"",
  () => { const hh = inDialog("h2"); return hh.length === 1 && hh[0].textContent.trim() === "Willkommen bei Kinodreieck."; });
check("W1", "Karte 1 zeigt den Abgleich-Absatz",
  () => dialogText().includes("Die App gleicht das Wiener Kinoprogramm gegen deine Liste ab, verwaltet deinen Bestand und schlägt dir vor, was zu dir passt."));
check("W1", "Karte 1 zeigt den Modell-Absatz („es steckt im Namen\")",
  () => dialogText().includes("Bevor du losläufst, ein Blick auf das Modell dahinter — es steckt im Namen und taucht überall wieder auf."));
check("W1", "Karte 1 hat GENAU EINEN Knopf, beschriftet „Weiter\"",
  () => knoepfe().length === 1 && knoepfe()[0].textContent.trim() === "Weiter");
check("W1", "der „Weiter\"-Knopf ist der primäre Stil (Hintergrund = T.wolfram)",
  () => knopf("Weiter").style.background === alsRgb(T.wolfram));
check("W1", "Karte 1 enthält KEINEN DreieckRegler (kein Regler, kein Glyph, keine Kategorie)",
  () => reglerAlle().length === 0 && !glyph() && kategorieZeile() === null);
check("W1", "Karte 1 zeigt weder „Zurück\" noch „Los geht's\" noch den Dreieck-Text",
  () => !knopfTeil("Zurück") && !knopfTeil("Los geht") && !dialogText().includes("Jeder Eintrag bekommt drei Werte"));
check("W1", "beim Öffnen wandert der Fokus auf den ersten Knopf der Box",
  () => fokusNachMontage === knopf("Weiter") && fokusVorMontage === aussen);
check("W1", "noch kein onClose-Aufruf allein durch das Öffnen", schliessRufe.length === 0);
});

/* =========================================================================
   W2 — „WEITER" FÜHRT AUF KARTE 2
   ========================================================================= */
abschnitt("W2", async () => {
console.log("\n--- W2: „Weiter\" → Karte 2 ---");

await klick(knopf("Weiter"));
const fokusNachWechsel = document.activeElement;
check("W2", "nach dem Klick lautet die Überschrift „Das Dreieck\"",
  () => { const hh = inDialog("h2"); return hh.length === 1 && hh[0].textContent.trim() === "Das Dreieck"; });

/* NEUE ZUSAGE 27.07.2026 (war Befund F4 der Testhand, stand vorher als offener
   F-Check am Ende der Datei — jetzt scharf, weil behoben).
   Der Fokus-Effekt lief mit [] genau einmal, beim Aufbau. Der Kartenwechsel
   tauscht den kompletten Inhalt aus und zerstört dabei den fokussierten
   Knopf; gemessen fiel der Fokus danach auf document.body. Tastatur- und
   Screenreader-Nutzer landeten nach „Weiter" im Nichts. Der zweite Effekt
   hängt jetzt an [karte]. Die Zusage lautet: nach JEDEM Kartenwechsel liegt
   der Fokus auf dem ersten fangbaren Element der neuen Karte. */
check("W2", "nach dem Kartenwechsel liegt der Fokus im Dialog, nicht auf document.body"
  + "  [gemessen: " + (fokusNachWechsel === document.body ? "document.body" : fokusNachWechsel.tagName
    + (fokusNachWechsel.getAttribute("aria-label") ? "[" + fokusNachWechsel.getAttribute("aria-label") + "]" : "")) + "]",
  () => !!dialog() && dialog().contains(fokusNachWechsel) && fokusNachWechsel !== document.body);
check("W2", "und zwar auf dem ERSTEN fangbaren Element der neuen Karte (dem WIE-Regler)",
  () => fokusNachWechsel === regler("WIE"));
/* Die Beschriftung des Dialogs zieht mit — sonst sagt der Screenreader beim
   Betreten der zweiten Karte weiter „Willkommen bei Kinodreieck" an. */
check("W2", "das aria-label des Dialogs folgt der Karte („Das Dreieck\")",
  () => dialog().getAttribute("aria-label") === "Das Dreieck");
check("W2", "der Text von Karte 1 ist vollständig weg",
  () => !dialogText().includes("Die App gleicht das Wiener Kinoprogramm")
    && !dialogText().includes("Bevor du losläufst"));
check("W2", "Karte 2 hat GENAU ZWEI Knöpfe: „Zurück\" und „Los geht's\"",
  () => knoepfe().length === 2
    && knoepfe()[0].textContent.trim() === "Zurück"
    && knoepfe()[1].textContent.trim() === "Los geht's");
check("W2", "„Zurück\" ist sekundär (transparent), „Los geht's\" primär (T.wolfram)",
  () => knopf("Zurück").style.background === "transparent"
    && knopf("Los geht's").style.background === alsRgb(T.wolfram));
check("W2", "der Kartenwechsel schließt die Box NICHT (kein onClose)", schliessRufe.length === 0);
check("W2", "Karte 2 erklärt alle drei Achsen im Text",
  () => ["WIE — wie ist es gemacht?", "WAS — was erzählt es?", "WARUM — warum sollte man ihn gesehen haben?"]
    .every((s) => dialogText().includes(s)));
check("W2", "Karte 2 nennt die Skala 0 bis 5 und dass die Kategorie folgt, nicht eingetippt wird",
  () => dialogText().includes("Jeder Eintrag bekommt drei Werte von 0 bis 5.")
    && dialogText().includes("tippst du nicht ein — sie folgt aus den drei Werten"));
check("W2", "Karte 2 nennt „Schlagseite schlägt Ausgewogenheit\" mit dem 1/1/5-Beispiel",
  () => dialogText().includes("Schlagseite schlägt Ausgewogenheit")
    && dialogText().includes("Ein Film mit 1/1/5 kann als kultureller Bezugspunkt entscheidender sein als ein rundes 3/3/3."));
});

/* =========================================================================
   W3 — KARTE 2 ENTHÄLT DEN DREIECKREGLER
   ========================================================================= */
abschnitt("W3", async () => {
console.log("\n--- W3: DreieckRegler auf Karte 2 ---");

check("W3", "Karte 2 enthält genau drei Regler, beschriftet WIE / WAS / WARUM, in dieser Reihenfolge",
  () => reglerAlle().length === 3
    && reglerAlle().map((r) => r.getAttribute("aria-label")).join(",") === "WIE,WAS,WARUM");
check("W3", "Karte 2 enthält den Dreieck-Glyph und die Kategorie-Zeile",
  () => !!glyph() && !!kategorieZeile());
check("W3", "Willkommen startet den Regler auf 4/2/5 (start-Prop)",
  () => anzeige("WIE") === "4" && anzeige("WAS") === "2" && anzeige("WARUM") === "5"
    && regler("WIE").value === "4" && regler("WAS").value === "2" && regler("WARUM").value === "5");
check("W3", "der Glyph trägt die Startwerte als Beschriftung",
  () => glyphLabel() === "wie 4, was 2, warum 5");
check("W3", "Willkommen reicht size=54 an den Glyph durch",
  () => glyph().getAttribute("width") === "54" && glyph().getAttribute("height") === "54");
check("W3", "Willkommen reicht scale=2.1 an den Glyph-Rahmen durch",
  () => glyph().parentElement.style.transform === "scale(2.1)");
check("W3", "die Startkombination 4/2/5 ergibt WARUM-lastig",
  () => kategorieText() === "Kategorie: WARUM-lastig — Relevanz vor Form und Stoff");
check("W3", "die Regler laufen von 0 bis 5 in Einerschritten",
  () => reglerAlle().every((r) => r.getAttribute("min") === "0" && r.getAttribute("max") === "5" && r.getAttribute("step") === "1"));
/* accent-color kennt jsdom nicht als Eigenschaft und lässt den Wert roh
   stehen (kein rgb()-Umbau wie bei background) — deshalb beide Formen. */
const farbeGleich = (ist, hex) => ist === hex || ist === alsRgb(hex);
check("W3", "jeder Regler trägt die Achsenfarbe aus den Tokens",
  () => farbeGleich(regler("WIE").style.accentColor, T.wie)
    && farbeGleich(regler("WAS").style.accentColor, T.was)
    && farbeGleich(regler("WARUM").style.accentColor, T.warum));
/* Die Achsenbeschriftung links trägt dieselbe Farbe — hier greift der
   rgb()-Umbau, T.wie und T.was sind unterscheidbar (T.warum == T.wolfram). */
check("W3", "die Achsen-Beschriftungen tragen die Achsenfarben (WIE ≠ WAS ≠ WARUM im DOM)",
  () => {
    const spanne = (achse) => regler(achse).parentElement.querySelector("span").style.color;
    return spanne("WIE") === alsRgb(T.wie) && spanne("WAS") === alsRgb(T.was) && spanne("WARUM") === alsRgb(T.warum)
      && new Set([spanne("WIE"), spanne("WAS"), spanne("WARUM")]).size === 3;
  });

/* aria-live an der Kategorie-Zeile: Karte 2 fordert „Zieh die Regler und sieh
   zu" — ohne Ansage bekommt ein Screenreader-Nutzer die einzige Lehre der
   Karte nie mit (Befund I der Testhand, seit 27.07.2026 umgesetzt).
   Die Zusage sitzt am selben Knoten wie der Text, sonst wird die Änderung
   nicht als Region gemeldet. */
check("W3", "die Kategorie-Zeile ist eine höfliche Live-Region (aria-live=\"polite\")",
  () => kategorieZeile().getAttribute("aria-live") === "polite");

/* Der Regler wirkt auch INNERHALB der Willkommen-Box, nicht nur einzeln.
   Diese Bewegung endet auf 0/2/0 und hat schon dreimal etwas anderes gepinnt
   — sie ist absichtlich stehen geblieben, weil sie jede Vertragsstufe dort
   zeigt, wo der Nutzer sie erlebt: auf der Erklär-Karte selbst.
     bis 27.07.  „WAS-lastig — Stoff vor Handwerk"  (nur die Spanne zählte)
     Zwischenstand  „Ausgewogen — alle drei im Gleichgewicht"  (Mindesthöhe
       kam dazu, Befund F3 — aber beide Gründe fielen zusammen)
     jetzt  „Ohne Schlagseite — alle drei kaum ausgeprägt"  (Befund F5: 0/2/0
       ist NICHT ausgewogen, der Glyph zeichnet daneben sichtbar schief; es
       ist bloß zu schwach für eine Schlagseiten-Aussage) */
await ziehe("WIE", 0);
await ziehe("WARUM", 0);
check("W3", "eine Reglerbewegung in der Box ändert Anzeige, Glyph und Kategorie"
  + " — 0/2/0 ist schief, aber zu schwach: „Ohne Schlagseite\"",
  () => anzeige("WIE") === "0" && anzeige("WARUM") === "0"
    && glyphLabel() === "wie 0, was 2, warum 0"
    && kategorieText() === "Kategorie: Ohne Schlagseite — alle drei kaum ausgeprägt");
/* Und der dritte Fall in derselben Box: 0/0/0 ist ECHT ausgewogen. Zwei
   verschiedene Texte für zwei verschiedene Lagen — das ist der Kern von F5. */
await ziehe("WAS", 0);
check("W3", "0/0/0 ist dagegen echt ausgewogen — die Box unterscheidet die beiden Gründe",
  () => kategorieText() === "Kategorie: Ausgewogen — alle drei im Gleichgewicht");
/* Dieselbe Achse eine Stufe höher: ab Spitze 3 kippt es. Beweist, dass die
   Bewegung wirkt und nicht bloß alles „Ausgewogen" heißt. */
await ziehe("WAS", 3);
check("W3", "0/3/0 überschreitet die Mindesthöhe und wird WAS-lastig",
  () => kategorieText() === "Kategorie: WAS-lastig — Stoff vor Handwerk");
/* Und die geteilte Spitze, ebenfalls in der echten Box: 3/0/3 nennt BEIDE
   Achsen. Vorher hätte hier still „WIE-lastig — Handwerk vor Stoff"
   gestanden (Befund F2). */
await ziehe("WIE", 3); await ziehe("WAS", 0); await ziehe("WARUM", 3);
check("W3", "3/0/3 nennt beide Spitzenachsen: „WIE/WARUM-lastig — gleichauf vorn\"",
  () => kategorieText() === "Kategorie: WIE/WARUM-lastig — gleichauf vorn");
check("W3", "eine Reglerbewegung löst kein onClose aus", schliessRufe.length === 0);
});

/* =========================================================================
   W4 — DER RÜCKWEG EXISTIERT
   ========================================================================= */
abschnitt("W4", async () => {
console.log("\n--- W4: „Zurück\" → Karte 1 ---");

await klick(knopf("Zurück"));
const fokusNachZurueck = document.activeElement;
check("W4", "„Zurück\" führt zurück auf Karte 1 — der Rückweg existiert",
  () => inDialog("h2")[0].textContent.trim() === "Willkommen bei Kinodreieck."
    && knoepfe().length === 1 && knoepfe()[0].textContent.trim() === "Weiter"
    && reglerAlle().length === 0);
/* Der Fokus-Effekt hängt an [karte] und muss deshalb in BEIDE Richtungen
   greifen — auf dem Rückweg genauso wie vorwärts (Befund F4/C). Die
   Vorwärtsrichtung allein zu prüfen hätte einen Effekt mit [] nicht von
   einem mit [karte] unterschieden, wenn er nur beim ersten Wechsel liefe. */
check("W4", "auch der Rückweg setzt den Fokus auf das erste Element der Karte („Weiter\")"
  + "  [gemessen: " + (fokusNachZurueck === document.body ? "document.body" : fokusNachZurueck.tagName) + "]",
  () => fokusNachZurueck === knopf("Weiter"));
check("W4", "das aria-label des Dialogs geht auf Karte 1 zurück",
  () => dialog().getAttribute("aria-label") === "Willkommen bei Kinodreieck");
check("W4", "„Zurück\" löst kein onClose aus", schliessRufe.length === 0);

await klick(knopf("Weiter"));
check("W4", "der Weg vor und zurück ist beliebig oft gangbar",
  () => inDialog("h2")[0].textContent.trim() === "Das Dreieck" && reglerAlle().length === 3);
/* IST-Zustand: Karte 2 wird beim Rückweg abgebaut, der Regler verliert seinen
   Zustand und steht wieder auf der start-Prop. Das ist heute so — gepinnt,
   damit der Umbau auf eine Schrittliste es nicht unbemerkt ändert. */
check("W4", "der Reglerzustand überlebt den Rückweg NICHT — 4/2/5 sind wieder da",
  () => anzeige("WIE") === "4" && anzeige("WAS") === "2" && anzeige("WARUM") === "5"
    && glyphLabel() === "wie 4, was 2, warum 5");
});

/* =========================================================================
   W5 — „LOS GEHT'S", ESCAPE, FOKUS
   ========================================================================= */
abschnitt("W5", async () => {
console.log("\n--- W5: onClose, Escape, Fokus ---");

/* Messung null-sicher, damit ein ausbleibender Aufruf den Abschnitt nicht
   beim Bauen des Checknamens abreißen lässt (er soll ROT werden, nicht
   die restlichen Checks verschlucken). */
const ruf = (i) => schliessRufe[i] || [];
await klick(knopf("Los geht's"));
check("W5", "„Los geht's\" ruft onClose GENAU EINMAL  [gemessen: " + schliessRufe.length + "]",
  schliessRufe.length === 1);
/* VERTRAGSÄNDERUNG 27.07.2026 (Etappe 7) — dieser Check hat schon zweimal
   etwas anderes gepinnt, und die Reihenfolge ist die Begründung:
     Stand 0 (bis 27.07.): `onClick={onClose}`. React reichte das
       SyntheticEvent durch, der Knopf rief also mit EINEM Argument, Escape
       mit KEINEM. Zwei Verträge für denselben Callback (Befund F1).
     Stand 1 (Zwischenschritt): beide Pfade argumentlos — gemeinsame
       Grundlage, damit ein späteres Argument überhaupt eindeutig sein KANN.
     Stand 2 (jetzt): beide Pfade rufen mit GENAU EINEM Argument, einem
       schlichten Objekt `{ durchgeklickt: bool }`. Es sagt, WIE geschlossen
       wurde. Nur der Knopf gilt als durchgeklickt.
   Das Argument ist die Voraussetzung für Befund B: vorher verbrannte ein
   versehentliches Escape auf Karte 1 die einmalige Erklärung, weil der
   Aufrufer beide Pfade nicht unterscheiden konnte.
   Gepinnt wird die GENAUE Form — ein SyntheticEvent hätte auch ein „Argument"
   gewesen sein können, deshalb Objektform und Schlüsselmenge mitprüfen. */
const artVon = (i) => (ruf(i)[0] && typeof ruf(i)[0] === "object" ? ruf(i)[0] : null);
check("W5", "onClose bekommt beim Knopf GENAU EIN Argument, und zwar ein schlichtes Objekt"
  + "  [gemessen: " + ruf(0).length + " Argument(e), " + JSON.stringify(artVon(0)) + "]",
  () => ruf(0).length === 1 && artVon(0) !== null
    && Object.keys(artVon(0)).join(",") === "durchgeklickt"
    && artVon(0).type === undefined);          // kein durchgereichtes Ereignis
check("W5", "der Knopf meldet durchgeklickt = true (nur er markiert die Erklärung als gesehen)",
  () => artVon(0) !== null && artVon(0).durchgeklickt === true);
check("W5", "„Los geht's\" schließt die Box nicht selbst — das entscheidet der Aufrufer",
  () => !!dialog() && inDialog("h2")[0].textContent.trim() === "Das Dreieck");

const vorEscape = schliessRufe.length;
await taste("Escape");
check("W5", "Escape ruft onClose ein weiteres Mal  [gemessen: " + vorEscape + " → " + schliessRufe.length + "]",
  schliessRufe.length === vorEscape + 1);
check("W5", "Escape ruft onClose mit DERSELBEN Form wie der Knopf — ein Objekt, ein Schlüssel"
  + "  [gemessen: " + ruf(vorEscape).length + " Argument(e), " + JSON.stringify(artVon(vorEscape)) + "]",
  () => schliessRufe.length === vorEscape + 1 && ruf(vorEscape).length === 1
    && artVon(vorEscape) !== null
    && Object.keys(artVon(vorEscape)).join(",") === "durchgeklickt");
check("W5", "Escape meldet durchgeklickt = false — abgebrochen, nicht durchgeklickt",
  () => artVon(vorEscape) !== null && artVon(vorEscape).durchgeklickt === false);
/* Beide Pfade sind formgleich und inhaltlich unterscheidbar. Genau das war
   vorher nicht der Fall und ist der Kern der Änderung. */
check("W5", "beide Pfade haben dieselbe Stelligkeit und dieselben Schlüssel, aber verschiedene Werte",
  () => ruf(0).length === ruf(vorEscape).length
    && Object.keys(artVon(0) || {}).join(",") === Object.keys(artVon(vorEscape) || {}).join(",")
    && artVon(0).durchgeklickt !== artVon(vorEscape).durchgeklickt);

/* Fokus-Falle: die Liste der fangbaren Elemente umfasst auch die drei Regler.
   Reihenfolge auf Karte 2: WIE, WAS, WARUM, Zurück, Los geht's. */
const fangbar = () => [...dialog().querySelectorAll("button, [href], input, [tabindex]")].filter((n) => !n.disabled);
check("W5", "auf Karte 2 sind fünf Elemente fangbar: drei Regler, dann zwei Knöpfe",
  () => fangbar().length === 5
    && fangbar()[0] === regler("WIE") && fangbar()[4] === knopf("Los geht's"));

knopf("Los geht's").focus();
await taste("Tab");
check("W5", "Tab auf dem letzten Element springt auf das erste (Fokus-Falle)",
  () => document.activeElement === regler("WIE"));
await taste("Tab", { shiftKey: true });
check("W5", "Shift+Tab auf dem ersten Element springt auf das letzte",
  () => document.activeElement === knopf("Los geht's"));
aussen.focus();
await taste("Tab");
check("W5", "Tab von außerhalb der Box holt den Fokus zurück auf das erste Element",
  () => document.activeElement === regler("WIE"));
const standNachTasten = schliessRufe.length;
check("W5", "Tab und Fokuswechsel lösen kein zusätzliches onClose aus", standNachTasten === vorEscape + 1);

/* Abbau: der Fokus geht an das Element zurück, das ihn vor der Montage hatte. */
await act(async () => { steuer.setOffen(false); });
check("W5", "beim Abbau verschwindet die Box vollständig aus dem body",
  () => dialog() === null && document.body.textContent.includes("GESCHLOSSEN"));
check("W5", "beim Abbau geht der Fokus an das Element vor der Montage zurück",
  () => document.activeElement === aussen);
await taste("Escape");
check("W5", "nach dem Abbau ist der Escape-Horcher abgemeldet — kein weiterer Aufruf",
  () => schliessRufe.length === standNachTasten);

/* --- Die andere Hälfte des Vertrags, als Quelltext-Zusicherung an App.jsx.
   Ohne sie wäre Befund B nur halb behoben: Willkommen könnte sauber
   „durchgeklickt: false" melden und der Aufrufer die Erklärung trotzdem als
   gesehen markieren. Beobachtet wird die eine Zeile, an der es hängt. */
const wkAufruf = /<Willkommen\s+onClose=\{([\s\S]*?)\}\s*\/>/.exec(APP_TEXT);
check("W5", "App.jsx montiert Willkommen mit einem onClose-Handler", () => !!wkAufruf);
check("W5", "App.jsx verzweigt im onClose auf `durchgeklickt` (Escape markiert nicht mehr als gesehen)",
  () => !!wkAufruf && /durchgeklickt/.test(wkAufruf[1]));
check("W5", "in App.jsx steht setWillkommen(true) INNERHALB der durchgeklickt-Verzweigung",
  () => {
    if (!wkAufruf) return false;
    const koerper = wkAufruf[1];
    const i = koerper.indexOf("durchgeklickt");
    const j = koerper.indexOf("setWillkommen(true)");
    /* setWillkommen darf nur NACH der Prüfung vorkommen und genau einmal —
       ein zweites, ungeschütztes Vorkommen würde die Sperre aushebeln. */
    return i >= 0 && j > i && koerper.split("setWillkommen(true)").length === 2;
  });
check("W5", "App.jsx schließt die Box in BEIDEN Fällen (setWillkommenOffen(false) ungeschützt)",
  () => !!wkAufruf && /setWillkommenOffen\(false\)/.test(wkAufruf[1])
    && wkAufruf[1].indexOf("setWillkommenOffen(false)") > wkAufruf[1].indexOf("setWillkommen(true)"));
});

/* =========================================================================
   D — DREIECKREGLER EINZELN
   Ab hier wird der Regler eigenständig montiert; `feld` zeigt auf den
   eigenen Montagepunkt. Der Schlüssel erzwingt eine Neumontage, denn `start`
   wird nur beim ersten Rendern gelesen (useState-Initialwert).
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
feld = () => document.getElementById("reglerwurzel");

await montiere({});
check("D1", "ohne Props steht der Regler auf dem Vorgabewert 4/2/5",
  () => anzeige("WIE") === "4" && anzeige("WAS") === "2" && anzeige("WARUM") === "5"
    && glyphLabel() === "wie 4, was 2, warum 5");
check("D1", "ohne Props: Vorgabe size=54 und scale=2.1",
  () => glyph().getAttribute("width") === "54" && glyph().parentElement.style.transform === "scale(2.1)");

await montiere({ start: { wie: 5, was: 2, warum: 4 }, scale: 1.7, size: 44 });
check("D1", "die zweite Aufrufstelle (Erklaerstuecke.jsx:81) kommt unverändert durch: 5/2/4, scale 1.7, size 44",
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
feld = () => document.getElementById("reglerwurzel");

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
feld = () => document.getElementById("reglerwurzel");

/* Alle 216 Kombinationen gegen die im Test NEU gerechnete Erwartung.
   Zusätzlich wird gezählt, wie oft jedes der vier möglichen Ergebnisse
   vorkommt — ein Test, der nur „kommt was zurück" prüft, hätte in Etappe 6
   drei Viertel einer kaputten Funktion durchgelassen. */
const f = [];
const gesehen = new Map();
/* Der beobachtete Fall wird aus dem DOM ZURÜCKGELESEN, nicht aus der
   Erwartung übernommen — nur so lässt sich unten prüfen, ob die Aussage der
   Oberfläche durch die Werte gedeckt ist. */
const istFall = (label, formel) => {
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
    const fall = istFall(ist.label, ist.formel);
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
   DIE DREITEILUNG (neuer Vertrag seit dem F5-Fix)
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
   die tatsächlich aufgetretenen Paarungen gesammelt; erlaubt sind genau vier.
   Eine fünfte Paarung hieße, dass die beiden Funktionen den Fall verschieden
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
     Diese Zeilen haben zweimal gewechselt, und beide Male aus demselben
     Grund — die Aussage stimmte für die Werte nicht:
       bis 27.07.  „WIE-lastig — Handwerk vor Stoff"  (nur die Spanne zählte;
         2/0/0 behauptete Handwerk, wo eine 2 von 5 steht)
       Zwischenstand  „Ausgewogen — alle drei im Gleichgewicht"  (Mindesthöhe
         kam dazu — aber 2/0/0 ist NICHT ausgewogen, es ist schief)
       jetzt  „Ohne Schlagseite — alle drei kaum ausgeprägt"
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

  /* --- Kante GLEICHSTAND (neu 27.07.2026, Befund F2).
     Diese drei pinnten vorher „der erste gewinnt": 5/5/0 hieß „WIE-lastig —
     Handwerk vor Stoff", obwohl WAS gleich stark ist. Gemessen an Max'
     Bestand betraf das 10 von 250 Einträgen (Sin City, Kill Bill Vol. 1,
     The Fifth Element, Scott Pilgrim: je 4/2/4) — mehr als die Hälfte der
     als „WIE-lastig" geführten Filme waren in Wahrheit WIE+WARUM. */
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
   beide Kanten in einer Bewegung liegen und beide Richtungen mitlaufen.
   VERTRAGSÄNDERUNG: Die Stufe WIE=2 hieß bis eben „Ausgewogen — alle drei im
   Gleichgewicht" (nur zwei Fälle). Sie heißt jetzt „Ohne Schlagseite — alle
   drei kaum ausgeprägt", weil 2/0/0 schief ist und nur zu schwach für eine
   Schlagseiten-Aussage (Befund F5). */
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
   hängt: 1/1/1 → WARUM 3 (schwach wäre falsch, Spitze 3 reicht) und
   0/2/2 (geteilte Spitze, zu schwach). */
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
console.log("\n--- D4: keine Naht nach außen (IST-Zustand) ---");
feld = () => document.getElementById("reglerwurzel");

/* Der Zustand bleibt heute IM Regler. Gepinnt mit Spionen auf allen Namen,
   unter denen eine Anzeige-Naht plausibel hieße: keiner darf feuern.
   ACHTUNG BAUENDE HAND: genau dieser Check geht rot, sobald die Naht
   eingezogen wird. Das ist beabsichtigt — er markiert die Stelle, an der
   der Vertrag der Komponente sich ändert, und muss dann BEWUSST angepasst
   werden (nicht stillschweigend). Alle übrigen Checks müssen grün bleiben. */
const spionRufe = [];
const NAMEN = ["onChange", "onAendern", "onAenderung", "onBw", "onWerte", "setBw", "onSlider", "onKategorie", "onCategoryChange", "aendere", "onStartChange"];
const spione = {};
for (const n of NAMEN) spione[n] = (...a) => spionRufe.push([n, a]);

await montiere({ start: { wie: 2, was: 2, warum: 2 }, ...spione });
for (const achse of ["WIE", "WAS", "WARUM"]) for (const wert of [0, 1, 2, 3, 4, 5]) await ziehe(achse, wert);
check("D4", "18 Reglerbewegungen, kein einziger Aufruf nach außen  [gemessen: " + spionRufe.length + " Aufruf(e)"
  + (spionRufe[0] ? " an " + spionRufe[0][0] : "") + "]",
  () => spionRufe.length === 0);
check("D4", "die Bewegungen sind trotzdem angekommen (der Spion-Lauf war kein Leerlauf)",
  () => glyphLabel() === "wie 5, was 5, warum 5");
check("D4", "unbekannte Props landen auch nicht als DOM-Attribute auf dem Wurzelelement",
  () => { const w = feld().firstElementChild; return !!w && NAMEN.every((n) => !w.hasAttribute(n.toLowerCase())); });

/* Die start-Prop wird nur beim Aufbau gelesen (useState-Initialwert). Ein
   neuer Wert von außen erreicht die Anzeige heute NICHT. */
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
   Heute rot. Nicht exit-relevant, damit die Kette grün bleibt; sie stehen
   hier, damit die Befunde nicht in einem Bericht verschwinden.
   ========================================================================= */
abschnitt("F", async () => {
console.log("\n--- F: Auffälligkeiten (heute offen, nicht exit-relevant) ---");

/* ABGERÄUMT AM 27.07.2026 — die vier F-Checks der ersten Fassung sind alle
   behoben und als SCHARFE Checks umgezogen, statt hier als „unauffällig"
   mitzulaufen. Wo sie jetzt stehen und warum sie hier redundant wären:
     F1  onClose-Stelligkeit  → W5, jetzt als positive Zusage („beide Pfade,
         ein Objekt, ein Schlüssel, verschiedene Werte"). Die alte Fassung
         prüfte nur „gleich lang"; das ist in der neuen Form enthalten.
     F1a kein SyntheticEvent  → W5, im selben Check (`artVon(0).type ===
         undefined` und die Schlüsselmenge).
     F2  Gleichstand benannt  → D3, und zwar stärker: die alte Fassung war
         eine Verneinung an EINEM Wert (5/5/0 ≠ „WIE-lastig"), jetzt sind es
         27 positiv geprüfte Fälle — die vollständige Menge.
     F3  Mindesthöhe          → D3, sechs benannte Kantenfälle plus die
         216er-Schleife plus die erfahrene Kante 2→3→2.
     F4  Fokus nach Wechsel   → W2 (vorwärts) und W4 (rückwärts). Der Rückweg
         ist neu: nur er unterscheidet einen Effekt an [karte] von einem, der
         bloß beim ersten Wechsel liefe.
     F5  zwei Gründe für „keine Schlagseite"  → D3. Die alte Fassung prüfte
         eine Verneinung an 2/0/0 und dass sich 2/0/0 und 3/3/3 unterscheiden.
         Beides steckt jetzt in der Dreiteilung: Partition über alle 216, die
         Mengen 36/12/168, die Deckungsprüfung („kaum ausgeprägt" verlangt
         Spitze < 3) und der Zug durch alle drei Fälle an einer Achse.
         Zusätzlich wird die Glyph-Geometrie schon in D1/D2 auf jede der 216
         Kombinationen geprüft — die „sichtbar schief"-Messung von F5 ist
         darin enthalten und braucht keinen eigenen Pin.
   Ein doppelter Pin auf dieselbe Zusage macht die spätere Änderung teurer,
   ohne mehr zu beweisen — deshalb gestrichen, nicht behalten.

   OFFEN GEBLIEBEN — F6: der Erklärtext kennt den dritten Fall nicht.
   Der Fix hat die Kategorie-Zeile ehrlich gemacht, aber die Karte, die das
   Modell erklärt, spricht weiter von zwei Zuständen. Willkommen-Karte 2 nennt
   „Schlagseite schlägt Ausgewogenheit" und erklärt die 0 als legitim; ein
   Nutzer, der daraufhin 2/0/0 zieht, liest darunter „Ohne Schlagseite — alle
   drei kaum ausgeprägt" — eine dritte Kategorie, die im Text nicht vorkommt
   und die auch nicht selbsterklärend ist (warum ist 2/0/0 keine Schlagseite,
   wenn WIE doch vorn liegt? Antwort: die Mindesthöhe — steht nirgends).
   Dasselbe in Erklaerstuecke.jsx:86: der Satz ist seit heute korrekt für die
   Schlagseite, nennt aber nur sie und ihr Gegenteil, nicht die Dreiteilung.
   Gemessen wird am Quelltext von Willkommen.jsx, weil die Lücke im TEXT liegt
   und nicht im Verhalten. Kein Codefehler — zwei Halbsätze räumen es aus. */
const kartenText = QUELLEN.willkommen.text;
check("F", "F6: Karte 2 erklärt den dritten Fall („Ohne Schlagseite\" / die Mindesthöhe) im Fließtext"
  + "  [gemessen: „Ohne Schlagseite\" im Kartentext=" + /Ohne Schlagseite/.test(kartenText)
  + ", Mindesthöhe erwähnt=" + /mindestens\s+3|Mindesth[öo]he|erreicht selbst/.test(kartenText) + "]",
  () => /Ohne Schlagseite/.test(kartenText)
    && /mindestens\s+3|Mindesth[öo]he|erreicht selbst/.test(kartenText));
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
  W1: "Startzustand und Karte 1",
  W2: "„Weiter\" → Karte 2",
  W3: "DreieckRegler auf Karte 2",
  W4: "Rückweg Karte 2 → Karte 1",
  W5: "onClose, Escape, Fokus",
  D1: "Startwerte aus der start-Prop",
  D2: "Reglerbewegung wirkt",
  D3: "Kategorie-Ableitung",
  D4: "keine Naht nach außen",
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
console.log(fehlschlag ? "\nWILLKOMMEN-TEST: BEFUNDE OBEN" : "\nWILLKOMMEN-TEST BESTANDEN");
process.exit(fehlschlag ? 1 : 0);

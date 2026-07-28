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
export { Willkommen, SCHRITTE } from "./Willkommen.jsx";
export { DreieckRegler } from "./DreieckRegler.jsx";
`;

/* Der Stub steht fuer src/services/auth.js. Er kennt kein Netz, keinen
   Endpunkt und keinen Treiber; jeder Aufruf landet in einem Zaehler im
   Testprozess. */
const AUTH_STUB = `
export const authService = {
  getSnapshot: () => globalThis.__WK_AUTH__.snapshot(),
  signIn: (b, p) => globalThis.__WK_AUTH__.signIn(b, p),
  subscribe: () => () => {},
};
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
      /* services/auth.js wird beim Buendeln durch einen Stub ERSETZT (Plugin,
         nicht Monkeypatching: `authService` ist eine Modulkonstante). Damit ist
         ausgeschlossen, dass eine echte Anmeldung ueber die Leitung geht --
         der Netzpfad ist nicht bloss ungenutzt, er ist nicht im Buendel.
         Das Anmelde-Angebot auf Karte 3 ist seit Phase 2b Teil der Box. */
      bau.onResolve({ filter: /services[/\\\\]auth\.js$/ }, () => ({ path: "auth-stub", namespace: "wk-stub" }));
      bau.onLoad({ filter: /.*/, namespace: "wk-stub" }, () => ({ contents: AUTH_STUB, loader: "js" }));
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
  "SVGElement", "Element", "Event", "MouseEvent", "KeyboardEvent", "CustomEvent", "Node", "NodeList", "getComputedStyle", "localStorage"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act, useState, createElement: h } = React;
const { T } = await import("./src/lib/tokens.js");
/* ---------------------------------------------------- Attrappe der Anmeldung */
/* Zwei Betriebsarten und ein Zaehler. „haengen" ist die wichtigste: sie haelt
   die Anmeldung offen, so wie ein echter fetch offen bleibt, waehrend der
   Nutzer Escape drueckt. */
/* FÄHIGKEITEN (28.07.2026, Phase 2b): Das Doppel lieferte bis heute nur
   `{ mode }`. Damit war der Unterschied zwischen „angemeldet" und „darf KI"
   im Test gar nicht darstellbar — jede Fähigkeitsprüfung der Box wäre
   stillschweigend als richtig durchgegangen. Die Box hängt seit dem F8-Fix an
   `capabilities.personalAi === true`, weil `aiService` hart
   `requireAccount("personalAi")` verlangt.
   Die Vorgabewerte sind aus `src/services/auth.js` abgeschrieben (Zeile 20
   für den Gast, Zeile 117 für ein Konto): ein Gast trägt sehr wohl ein
   `capabilities`-Objekt, nur mit lauter `false`. Ein Doppel, das dem Gast
   gar keine Fähigkeiten gäbe, ließe eine Prüfung „hat überhaupt
   capabilities" schon als Fähigkeitsprüfung durchgehen.
   `faehigkeiten === undefined` heißt: wie der echte Dienst. Ein gesetzter
   Wert überschreibt für beide Modi; `null` heißt ÜBERHAUPT KEIN
   `capabilities`-Feld (alter Server). Das ist ein anderer Fall als
   `{ personalAi: false }`, und beide müssen unterscheidbar bleiben — sonst
   ginge eine Prüfung `capabilities?.personalAi !== false` als richtig durch,
   die den fehlenden Schlüssel großzügig als „ja" liest.

   ZUSTAND (28.07.2026, nachgezogen): Dasselbe Versäumnis eine Dimension
   weiter. Das Doppel kannte `state` nicht — und damit ging jede Prüfung
   darauf still durch, genau wie vorher bei `capabilities`. `requireAccount`
   (`services/auth.js:148`) verlangt DREI Dinge: Modus, `state === "ready"`
   und die Fähigkeit. `SESSION_STATES.DEGRADED` (`auth.js:11`) heißt: die
   Anmeldung gilt weiter, der Server ist nur gerade nicht erreichbar — ein
   Zustand, den ein echtes Konto jederzeit erreicht.
   `guestSession()` (auth.js:17) und `accountSession()` (auth.js:41/51)
   setzen beide `"ready"`; das ist deshalb der Vorgabewert. `zustand = null`
   heißt ÜBERHAUPT KEIN `state`-Feld — derselbe Trennschnitt wie bei den
   Fähigkeiten, damit eine Prüfung `state !== "degraded"` nicht als richtig
   durchgeht. */
const GAST_FAEHIG = { remoteStorage: false, personalAi: false };   // auth.js:20
const KONTO_FAEHIG = { remoteStorage: true, personalAi: true };    // auth.js:117
const auth = {
  rufe: [],
  modus: "erfolg",            // erfolg | fehler | haengen
  konto: false,               // Ausgangslage: Gast
  fehler: null,
  faehigkeiten: undefined,    // undefined = wie echt · null = ohne capabilities
  zustand: undefined,         // undefined = wie echt ("ready") · null = ohne state
  aufloesen: null, ablehnen: null,
  snapshot() {
    const s = { mode: this.konto ? "account" : "guest" };
    const z = this.zustand === undefined ? "ready" : this.zustand;   // auth.js:17/51
    if (z !== null) s.state = z;
    const f = this.faehigkeiten === undefined
      ? (this.konto ? KONTO_FAEHIG : GAST_FAEHIG)
      : this.faehigkeiten;
    if (f !== null) s.capabilities = f;
    return s;
  },
  signIn(b, pw) {
    this.rufe.push({ benutzer: b, passwort: pw });
    if (this.modus === "haengen") return new Promise((res, rej) => { this.aufloesen = res; this.ablehnen = rej; });
    if (this.modus === "fehler") return Promise.reject(this.fehler || new Error("Anmeldung fehlgeschlagen"));
    this.konto = true;
    /* Wie der echte Dienst: signIn liefert denselben Snapshot, den getSnapshot
       danach liefert — samt Fähigkeiten. */
    return Promise.resolve(this.snapshot());
  },
};
globalThis.__WK_AUTH__ = { snapshot: () => auth.snapshot(), signIn: (b, pw) => auth.signIn(b, pw) };
const authAuf = () => {
  auth.rufe = []; auth.modus = "erfolg"; auth.konto = false; auth.fehler = null;
  auth.faehigkeiten = undefined; auth.zustand = undefined;   // zurück auf „wie echt"
};

/* ---------------------------------------------------- KI-Schalter im Test */
/* Der echte Schalter, nicht gestubbt: Karte 3 schreibt ihn, und genau das ist
   die Zusage. Gelesen wird ueber `globalThis.localStorage` (JSDOM). */
const KS = await import("./src/lib/kiSchalter.js");
/* errorText und die Codes sind rein — der Test benutzt dieselbe Quelle wie die
   Box, statt einen Fehlertext zu erraten. `errorText` bildet auf den CODE ab,
   nicht auf die Message; ein blanker Error liefert deshalb den Server-Text. */
const ERR = await import("./src/services/errors.js");
const kiTopfLeeren = () => { dom.window.localStorage.removeItem("kd:ki"); dom.window.localStorage.removeItem("kd:ki-version"); };
const kiTopf = () => {
  const roh = dom.window.localStorage.getItem("kd:ki");
  return { roh, marke: dom.window.localStorage.getItem("kd:ki-version"),
    stand: roh ? (() => { try { return JSON.parse(roh); } catch { return null; } })() : null };
};

const { Willkommen, DreieckRegler, SCHRITTE } = await import(AUSGABE);

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
/* Dieselbe Liste, die Willkommen.jsx fuer die Fokus-Falle benutzt. Sie steht
   hier bewusst als Kopie: der Test soll bemerken, wenn sie sich aendert. */
const FOKUS_SELEKTOR_TEST = "button, [href], input, select, textarea, area[href], [tabindex]";
const wertSetzer = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
const tippeIn = async (el, wert) => {
  if (!el) throw new Error("Feld nicht gefunden");
  await act(async () => {
    wertSetzer.call(el, String(wert));
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
};
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
/* VERTRAGSÄNDERUNG 28.07.2026 (Etappe 7, Phase 2b) — DIE KARTENFOLGE IST
   GEWACHSEN. Aus zwei Karten sind DREI geworden, und die hartcodierte
   `karte === 1 ? … : …`-Verzweigung ist einer Kette gewichen; `SCHRITTE`
   ist jetzt exportiert (Befund C2 der Testhand aus Runde 1, eingelöst).
   Karte 3 ist die KI-Frage, und sie sitzt bewusst HINTER der Dreieck-Karte:
   erst dort weiß der Nutzer, wofür KI in dieser App überhaupt gut wäre.
   Folge für diesen Check: „Los geht's" steht nicht mehr auf Karte 2. Karte 2
   trägt jetzt „Zurück" und „Weiter" — der Abschluss ist eine Karte weiter. */
check("W2", "Karte 2 hat GENAU ZWEI Knöpfe: „Zurück\" und „Weiter\"",
  () => knoepfe().length === 2
    && knoepfe()[0].textContent.trim() === "Zurück"
    && knoepfe()[1].textContent.trim() === "Weiter");
check("W2", "„Zurück\" ist sekundär (transparent), „Weiter\" primär (T.wolfram)",
  () => knopf("Zurück").style.background === "transparent"
    && knopf("Weiter").style.background === alsRgb(T.wolfram));
check("W2", "auf Karte 2 gibt es „Los geht's\" NICHT — der Abschluss sitzt hinter der KI-Frage",
  () => !knopfTeil("Los geht"));
check("W2", "SCHRITTE ist exportiert und nennt die drei Schritte in ihrer Reihenfolge",
  () => Array.isArray(SCHRITTE) && SCHRITTE.join(",") === "was,dreieck,ki");
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
const artVon = (i) => (ruf(i)[0] && typeof ruf(i)[0] === "object" ? ruf(i)[0] : null);

/* VERTRAGSÄNDERUNG 28.07.2026 (Phase 2b): „Los geht's" sitzt seit der dritten
   Karte NICHT mehr hier. Dieser Abschnitt prüft nur noch den Escape-Pfad und
   die Fokus-Falle; der Abschluss samt onClose-Argument steht in W6, weil er
   ohne die KI-Wahl gar nicht auslösbar ist (der Knopf ist deaktiviert,
   solange nichts gewählt wurde).
   Der Escape-Pfad ist hier genau richtig aufgehoben: Er muss von JEDER Karte
   aus funktionieren, und Karte 2 ist die mittlere. */
const vorEscape = schliessRufe.length;
await taste("Escape");
check("W5", "Escape ruft onClose  [gemessen: " + vorEscape + " → " + schliessRufe.length + "]",
  schliessRufe.length === vorEscape + 1);
/* Gepinnt wird die GENAUE Form — ein SyntheticEvent wäre auch ein „Argument"
   gewesen, deshalb Objektform und Schlüsselmenge mitprüfen (Befund F1). */
check("W5", "Escape ruft onClose mit GENAU EINEM Argument, einem schlichten Objekt"
  + "  [gemessen: " + ruf(vorEscape).length + " Argument(e), " + JSON.stringify(artVon(vorEscape)) + "]",
  () => ruf(vorEscape).length === 1 && artVon(vorEscape) !== null
    && artVon(vorEscape).type === undefined);
check("W5", "Escape meldet durchgeklickt = false — abgebrochen, nicht durchgeklickt",
  () => artVon(vorEscape) !== null && artVon(vorEscape).durchgeklickt === false);
/* Escape von der MITTLEREN Karte darf keine KI-Wahl hinterlassen — auf Karte 2
   ist noch gar nichts gewählt, und der Topf muss unberührt bleiben. */
check("W5", "Escape von Karte 2 schreibt nichts in den KI-Topf"
  + "  [gemessen: " + JSON.stringify(kiTopf().roh) + "]",
  () => kiTopf().roh === null && kiTopf().marke === null);

/* Fokus-Falle: die Liste der fangbaren Elemente umfasst auch die drei Regler.
   Reihenfolge auf Karte 2 seit Phase 2b: WIE, WAS, WARUM, Zurück, Weiter. */
const fangbar = () => [...dialog().querySelectorAll("button, [href], input, [tabindex]")].filter((n) => !n.disabled);
check("W5", "auf Karte 2 sind fünf Elemente fangbar: drei Regler, dann zwei Knöpfe",
  () => fangbar().length === 5
    && fangbar()[0] === regler("WIE") && fangbar()[4] === knopf("Weiter"));

knopf("Weiter").focus();
await taste("Tab");
check("W5", "Tab auf dem letzten Element springt auf das erste (Fokus-Falle)",
  () => document.activeElement === regler("WIE"));
await taste("Tab", { shiftKey: true });
check("W5", "Shift+Tab auf dem ersten Element springt auf das letzte",
  () => document.activeElement === knopf("Weiter"));
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
   W6 — KARTE 3: DIE KI-FRAGE (neu in Phase 2b)
   Der Abschluss der Box ist zugleich die Entscheidung über einen bezahlten
   Pfad. Vier Zusagen hängen hier:
     1. „Los geht's" ist gesperrt, solange nichts gewählt ist.
     2. Die Wahl wird ERST beim Durchklicken geschrieben — wer zurückgeht und
        abbricht, hat nichts hinterlassen.
     3. onClose trägt { durchgeklickt, ki }.
     4. Das Anmelde-Angebot ist ein ANGEBOT, kein Tor — und erscheint nur bei
        „Mit KI" und ohne Konto.
   Jeder Fall startet mit einer frischen Box UND einem leeren KI-Topf, damit
   kein Rest aus dem vorigen Fall die Messung trägt.
   ========================================================================= */
abschnitt("W6", async () => {
console.log("\n--- W6: Karte 3, die KI-Frage ---");

/* Frische Box, leerer Topf, Gast — und bis Karte 3 durchklicken.
   `sitzung` stellt die Anmeldelage ein, BEVOR die Box aufgebaut wird. Nur so
   ist der useState-Initialweg von `kiFaehig` überhaupt messbar; wer die Lage
   erst nach dem Aufbau ändert, misst immer den signIn-Weg. */
const zuKarte3 = async (sitzung = null) => {
  kiTopfLeeren();
  authAuf();
  if (sitzung) {
    auth.konto = sitzung.konto;
    if ("faehigkeiten" in sitzung) auth.faehigkeiten = sitzung.faehigkeiten;
    if ("zustand" in sitzung) auth.zustand = sitzung.zustand;
  }
  schliessRufe.length = 0;
  await act(async () => { steuer.setOffen(false); });
  await act(async () => { steuer.setOffen(true); });
  await klick(knopf("Weiter"));   // 1 → 2
  await klick(knopf("Weiter"));   // 2 → 3
};
const ruf = (i) => schliessRufe[i] || [];
const artVon = (i) => (ruf(i)[0] && typeof ruf(i)[0] === "object" ? ruf(i)[0] : null);
const losKnopf = () => knopf("Los geht's");

await zuKarte3();
check("W6", "Karte 3 trägt die Überschrift „Mit oder ohne KI?“",
  () => inDialog("h2").length === 1 && inDialog("h2")[0].textContent.trim() === "Mit oder ohne KI?");
check("W6", "das aria-label des Dialogs folgt auf die dritte Karte",
  () => dialog().getAttribute("aria-label") === "Mit oder ohne KI");
check("W6", "Karte 3 nennt ausdrücklich, dass ohne KI alles funktioniert",
  () => /Ohne KI funktioniert alles/.test(dialogText())
    && /vollständig und kostenlos auf deinem Gerät/.test(dialogText()));
check("W6", "Karte 3 sagt zu, dass jede Funktion einzeln schaltbar bleibt",
  () => /in den Einstellungen an- und abschalten/.test(dialogText()));
check("W6", "Karte 3 hat die vier Knöpfe: Mit KI, Ohne KI, Zurück, Los geht's",
  () => knoepfe().map((b) => b.textContent.trim()).join("|") === "Mit KI|Ohne KI|Zurück|Los geht's");
check("W6", "der Fokus-Eintritt greift auch auf Karte 3 — er landet auf „Mit KI“",
  () => document.activeElement === knopf("Mit KI"));

/* ---- Zusage 1: gesperrt, solange nichts gewählt ist. */
check("W6", "vor der Wahl ist „Los geht's“ DEAKTIVIERT",
  () => losKnopf().disabled === true);
check("W6", "und trägt eine Begründung als Tooltip",
  () => /zuerst mit oder ohne KI/i.test(losKnopf().getAttribute("title") || ""));
check("W6", "vor der Wahl steht kein aria-pressed auf true",
  () => knopf("Mit KI").getAttribute("aria-pressed") === "false"
    && knopf("Ohne KI").getAttribute("aria-pressed") === "false");
/* Ein gesperrter Knopf darf auch per Klick-Ereignis nicht auslösen — und
   ebenso wenig per Tastatur. Beides wird ausdrücklich versucht. */
await klick(losKnopf());
check("W6", "ein Klick auf den gesperrten Knopf löst NICHTS aus"
  + "  [gemessen: " + schliessRufe.length + " onClose, Topf " + JSON.stringify(kiTopf().roh) + "]",
  () => schliessRufe.length === 0 && kiTopf().roh === null);
losKnopf().focus();
for (const key of ["Enter", " ", "Spacebar"]) {
  await act(async () => {
    losKnopf().dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    losKnopf().dispatchEvent(new dom.window.KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
  });
}
check("W6", "auch Enter und Leertaste lösen den gesperrten Knopf nicht aus"
  + "  [gemessen: " + schliessRufe.length + " onClose]",
  () => schliessRufe.length === 0 && kiTopf().roh === null);
/* Ein gesperrter Knopf gehört auch nicht in die Fokus-Falle — sonst liefe
   die Tab-Reihenfolge auf ein Element zu, das nichts tut. */
const fangbar3 = () => [...dialog().querySelectorAll(FOKUS_SELEKTOR_TEST)].filter((n) => !n.disabled);
check("W6", "der gesperrte Knopf ist nicht fangbar — die Falle endet auf „Zurück“"
  + "  [fangbar: " + fangbar3().map((n) => n.textContent.trim() || n.getAttribute("aria-label")).join(", ") + "]",
  () => fangbar3().length === 3 && fangbar3()[2] === knopf("Zurück"));

/* ---- Zusage 1b: nach der Wahl offen. */
await klick(knopf("Ohne KI"));
check("W6", "nach der Wahl ist „Los geht's“ freigegeben",
  () => losKnopf().disabled === false && !losKnopf().getAttribute("title"));
check("W6", "die Wahl ist über aria-pressed ablesbar",
  () => knopf("Ohne KI").getAttribute("aria-pressed") === "true"
    && knopf("Mit KI").getAttribute("aria-pressed") === "false");
check("W6", "„Ohne KI“ bekommt eine Bestätigung, die auf die Einstellungen zeigt",
  () => /jederzeit in den Einstellungen einschalten/.test(dialogText()));
/* ---- Zusage 2: NICHTS ist geschrieben, bevor „Los geht's" geklickt wurde. */
check("W6", "das ANTIPPEN der Wahl schreibt noch nichts in den KI-Topf"
  + "  [gemessen: " + JSON.stringify(kiTopf().roh) + "]",
  () => kiTopf().roh === null && kiTopf().marke === null);
await klick(knopf("Mit KI"));
check("W6", "auch das Umentscheiden schreibt nichts",
  () => kiTopf().roh === null && knopf("Mit KI").getAttribute("aria-pressed") === "true");

/* ---- Zusage 2b: der Abbruch hinterlässt nichts. Drei Wege raus. */
await klick(knopf("Zurück"));
check("W6", "„Zurück“ von Karte 3 führt auf Karte 2 und schreibt nichts",
  () => inDialog("h2")[0].textContent.trim() === "Das Dreieck" && kiTopf().roh === null);
await klick(knopf("Weiter"));
check("W6", "der Rückweg 3 → 2 → 3 verliert die Wahl NICHT",
  () => knopf("Mit KI").getAttribute("aria-pressed") === "true" && losKnopf().disabled === false);
await taste("Escape");
check("W6", "Escape nach getroffener Wahl schreibt NICHTS — abgebrochen ist abgebrochen"
  + "  [gemessen: Topf " + JSON.stringify(kiTopf().roh) + ", onClose " + JSON.stringify(artVon(0)) + "]",
  () => kiTopf().roh === null && kiTopf().marke === null
    && artVon(0) !== null && artVon(0).durchgeklickt === false);
check("W6", "und der Escape-Ruf trägt kein `ki` — es gab keine Entscheidung",
  () => artVon(0).ki === undefined);
/* NEU 28.07.2026 — die Schlüsselmenge des Abbruchwegs, exakt.
   Sie ist am 28.07. gemessen worden (ein Schlüssel: `durchgeklickt`) und
   danach gepinnt. Der Abschlussweg trägt seit dem F7-Fix DREI Schlüssel; der
   Abbruchweg darf davon keinen einzigen mitbekommen. Ein `gespeichert: false`
   hier wäre besonders tückisch: App.jsx:2111 verzweigt auf
   `art.gespeichert !== false`, und die Verzweigung würde damit auf einem Weg
   greifen, auf dem gar nichts zu speichern war — der Abbruch sähe aus wie ein
   fehlgeschlagener Schreibvorgang. */
check("W6", "der Escape-Ruf trägt GENAU einen Schlüssel: durchgeklickt"
  + "  [gemessen: " + JSON.stringify(Object.keys(artVon(0) || {}).sort()) + "]",
  () => artVon(0) !== null && Object.keys(artVon(0)).sort().join(",") === "durchgeklickt");
check("W6", "insbesondere kein `gespeichert` auf dem Abbruchweg — es wurde nichts versucht",
  () => artVon(0) !== null && !("gespeichert" in artVon(0)));

/* ---- Zusage 3: beide Wege schreiben den richtigen Wert. */
for (const [label, erwartet] of [["Ohne KI", false], ["Mit KI", true]]) {
  await zuKarte3();
  await klick(knopf(label));
  await klick(losKnopf());
  const topf = kiTopf();
  check("W6", "„" + label + "“ + „Los geht's“ schreibt global = " + erwartet
    + "  [gemessen: " + JSON.stringify(topf.stand && topf.stand.global) + "]",
    () => !!topf.stand && topf.stand.global === erwartet);
  check("W6", "„" + label + "“ setzt die Versionsmarke — ohne sie zählt die Wahl nicht"
    + "  [gemessen: " + JSON.stringify(topf.marke) + "]",
    () => topf.marke === KS.KI_WAHL_VERSION);
  check("W6", "„" + label + "“: die Wahl gilt danach auch für den Schalter selbst",
    () => KS.wahlBestaetigt(dom.window.localStorage) === true
      && KS.kiGrundsaetzlichAn(dom.window.localStorage) === erwartet
      && KS.kiAn("suche", dom.window.localStorage) === erwartet);
  /* VERTRAGSÄNDERUNG 28.07.2026 (F7-Fix) — DER ABSCHLUSSWEG TRÄGT DREI
     SCHLÜSSEL. Vorher waren es zwei; `gespeichert` sagt dem Aufrufer, ob die
     Wahl den Speicher wirklich erreicht hat. App.jsx:2111 hängt daran:
     `art.gespeichert !== false` entscheidet, ob die Box je wiederkommt.
     Die Schlüsselmenge wird EXAKT geprüft, nicht als Teilmenge — ein
     vierter Schlüssel wäre eine stille Vertragserweiterung, ein fehlender
     eine stille Verengung, und beides bemerkt ein Teilmengen-Check nicht. */
  check("W6", "„" + label + "“: onClose trägt GENAU { durchgeklickt, ki, gespeichert }"
    + "  [gemessen: " + JSON.stringify(Object.keys(artVon(0) || {}).sort()) + "]",
    () => artVon(0) !== null && Object.keys(artVon(0)).sort().join(",") === "durchgeklickt,gespeichert,ki");
  check("W6", "„" + label + "“: die Werte sind { durchgeklickt: true, ki: " + erwartet + " }"
    + "  [gemessen: " + JSON.stringify(artVon(0)) + "]",
    () => artVon(0) !== null && artVon(0).durchgeklickt === true && artVon(0).ki === erwartet);
  /* Der Gegenpol zum blockierten Speicher weiter unten: Wenn das Schreiben
     WIRKLICH durchging, muss `gespeichert === true` stehen. Gegengeprüft am
     Topf selbst — sonst wäre auch ein fest verdrahtetes `true` grün. */
  check("W6", "„" + label + "“: erfolgreiches Schreiben meldet gespeichert === true"
    + "  [gemessen: " + JSON.stringify(artVon(0) && artVon(0).gespeichert)
    + ", Topf wirklich beschrieben: " + (kiTopf().marke === KS.KI_WAHL_VERSION) + "]",
    () => artVon(0) !== null && artVon(0).gespeichert === true
      && kiTopf().marke === KS.KI_WAHL_VERSION);
  check("W6", "„" + label + "“: genau ein onClose", schliessRufe.length === 1);
  check("W6", "„" + label + "“: der Topf trägt einen Zeitstempel",
    () => typeof topf.stand.gefragtAm === "string" && topf.stand.gefragtAm.length > 0);
}

/* ---- Zusage 3b (NEU 28.07.2026, F7-Fix): BLOCKIERTER SPEICHER.
   Im Privatmodus und bei voller Quote wirft `storage.setItem`. `setzeGlobal`
   fängt das ab und bleibt fail-closed — die Wahl ist dann NICHT wirksam.
   Genau das muss die Box nach außen melden: App.jsx:2111 markiert die
   Willkommensbox nur bei `gespeichert !== false` als gesehen. Ohne die
   Meldung wäre die einzige Stelle, an der je nach KI gefragt wird, verbrannt
   — der Nutzer hätte ausdrücklich „Mit KI" gewählt, fände keine einzige
   KI-Funktion und bekäme nie wieder eine Gelegenheit.
   Geprüft wird das ganze Bündel: die Meldung, die Wahl darin, die Form der
   Meldung, ihre Einmaligkeit und der Zustand, den der Rest der App danach
   tatsächlich vorfindet. */
const echterSpeicherW6 = dom.window.localStorage;
const setzeSpeicher = (s) => Object.defineProperty(globalThis, "localStorage",
  { value: s, configurable: true, writable: true });
/* Privatmodus: nichts drin, nichts geht rein. */
const totalBlockiert = {
  getItem: () => null,
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => {},
};
for (const [label, wahl] of [["Mit KI", true], ["Ohne KI", false]]) {
  await zuKarte3();
  await klick(knopf(label));
  setzeSpeicher(totalBlockiert);
  await klick(losKnopf());
  setzeSpeicher(echterSpeicherW6);
  const art = artVon(0);
  check("W6", "blockierter Speicher, „" + label + "“: onClose meldet gespeichert === false"
    + "  [gemessen: " + JSON.stringify(art) + "]",
    () => art !== null && art.gespeichert === false);
  check("W6", "blockierter Speicher, „" + label + "“: `ki` trägt trotzdem die getroffene Wahl (" + wahl + ")"
    + "  [gemessen: ki=" + JSON.stringify(art && art.ki) + "]",
    () => art !== null && art.durchgeklickt === true && art.ki === wahl);
  check("W6", "blockierter Speicher, „" + label + "“: dieselbe Schlüsselmenge wie sonst — kein Sonderformat"
    + "  [gemessen: " + JSON.stringify(Object.keys(art || {}).sort()) + "]",
    () => art !== null && Object.keys(art).sort().join(",") === "durchgeklickt,gespeichert,ki");
  check("W6", "blockierter Speicher, „" + label + "“: trotzdem GENAU ein onClose"
    + "  [gemessen: " + schliessRufe.length + "]",
    () => schliessRufe.length === 1);
  check("W6", "blockierter Speicher, „" + label + "“: im echten Topf steht nichts — auch keine Versionsmarke"
    + "  [gemessen: Topf " + JSON.stringify(kiTopf().roh) + ", Marke " + JSON.stringify(kiTopf().marke) + "]",
    () => kiTopf().roh === null && kiTopf().marke === null);
  check("W6", "blockierter Speicher, „" + label + "“: die Frage gilt als UNBEANTWORTET — fail-closed"
    + "  [gemessen: wahlBestaetigt=" + KS.wahlBestaetigt(echterSpeicherW6)
    + ", kiGrundsaetzlichAn=" + KS.kiGrundsaetzlichAn(echterSpeicherW6) + "]",
    () => KS.wahlBestaetigt(echterSpeicherW6) === false
      && KS.kiGrundsaetzlichAn(echterSpeicherW6) === false
      && KS.kiAn("suche", echterSpeicherW6) === false);
}

/* ---- Zusage 3c: DER HALBE SCHREIBVORGANG.
   Der schlimmere Fall, und der einzige, in dem die Versionsmarke wirklich
   arbeitet: `kd:ki` geht durch, die Marke wirft (die Quote läuft genau
   dazwischen voll). Im Topf steht danach `global: true` — die Wahl ist aber
   nicht bestätigt. Erst die Marken-Prüfung in `kiGrundsaetzlichAn` (K1) hält
   das fail-closed; ohne sie stünde der bezahlte Pfad offen, während die Box
   nach außen `gespeichert: false` meldet und App.jsx die Frage wiederholt.
   kischalter_test prüft K1 an synthetischen Töpfen — hier entsteht der halbe
   Topf zum ersten Mal auf dem echten Schreibweg der Box. */
await zuKarte3();
await klick(knopf("Mit KI"));
const halbGeschrieben = {
  getItem: (k) => echterSpeicherW6.getItem(k),
  setItem: (k, v) => {
    if (k === "kd:ki-version") throw new Error("QuotaExceededError");
    echterSpeicherW6.setItem(k, v);
  },
  removeItem: (k) => echterSpeicherW6.removeItem(k),
};
setzeSpeicher(halbGeschrieben);
await klick(losKnopf());
setzeSpeicher(echterSpeicherW6);
check("W6", "halber Schreibvorgang: der Wert steht im Topf, die Versionsmarke fehlt"
  + "  [gemessen: global=" + JSON.stringify(kiTopf().stand && kiTopf().stand.global)
  + ", Marke=" + JSON.stringify(kiTopf().marke) + "]",
  () => !!kiTopf().stand && kiTopf().stand.global === true && kiTopf().marke === null);
check("W6", "halber Schreibvorgang: die Box meldet trotzdem gespeichert === false"
  + "  [gemessen: " + JSON.stringify(artVon(0)) + "]",
  () => artVon(0) !== null && artVon(0).gespeichert === false && artVon(0).ki === true
    && schliessRufe.length === 1);
check("W6", "halber Schreibvorgang: der halbe Topf schaltet NICHTS frei — fail-closed über die Marke"
  + "  [gemessen: wahlBestaetigt=" + KS.wahlBestaetigt(echterSpeicherW6)
  + ", kiGrundsaetzlichAn=" + KS.kiGrundsaetzlichAn(echterSpeicherW6)
  + ", kiAn('suche')=" + KS.kiAn("suche", echterSpeicherW6) + "]",
  () => KS.wahlBestaetigt(echterSpeicherW6) === false
    && KS.kiGrundsaetzlichAn(echterSpeicherW6) === false
    && KS.kiAn("suche", echterSpeicherW6) === false);
kiTopfLeeren();

/* ---- Zusage 4: das Anmelde-Angebot. */
const anmeldeBlock = () => dialogText().includes("KI-Funktionen laufen über dein Konto");
const feld = (label) => inDialog("input").find((i) => i.getAttribute("aria-label") === label);
/* BEFUND AN MIR SELBST, behoben am 28.07.2026: Bis eben prüften diese Checks
   die Zusage mit `/Angemeldet/` auf dem Dialogtext. Seit dem F9-Fix beginnt
   auch der Hinweis für ein Konto OHNE KI-Freischaltung mit „Angemeldet" —
   zu Recht, der Nutzer IST angemeldet. Damit matchte das Muster in der
   Zusage UND in ihrer Verneinung: gemessen trägt der kontoOhneKi-Zweig
   `wortAngemeldet = true` bei `zusage = false`. Ein Wächter über eine
   Zusage darf nicht auf einem Wort stehen, das auch in ihrem Gegenteil
   vorkommt — sonst wäre der dritte Zweig als „Zusage steht" durchgegangen.
   Deshalb ab hier die VOLLEN Sätze, alle drei wörtlich aus Willkommen.jsx.

   NACHGEZOGEN 28.07.2026 (F10-Fix): Es sind jetzt DREI Lagen, nicht zwei.
   Der Hinweis hat zwei Wortlaute, weil `kiFaehig` die Zusage aus zwei
   verschiedenen Gründen zurückhält — fehlende Freischaltung (dagegen hilft
   nur der Betreiber) und degradierte Sitzung (gibt sich von selbst). Genau
   diese Unterscheidung WAR der Befund F10; ein Prädikat, das bloß „irgendein
   Hinweis steht da" prüft, hätte ihn nicht gefunden und würde seine
   Rückkehr nicht bemerken. Deshalb zwei getrennte Prädikate, und
   `hinweisOhneKi()` nur noch dort, wo wirklich „einer von beiden" gemeint
   ist. */
const ZUSAGE_SATZ = "Angemeldet — die KI-Funktionen stehen dir zur Verfügung.";
const HINWEIS_DEGRADIERT = "Angemeldet — die KI-Funktionen sind gerade nicht erreichbar.";
const HINWEIS_NICHT_FREI = "Angemeldet — dein Konto ist für die KI-Funktionen aber noch nicht freigeschaltet.";
/* Ohne Satzzeichen: Der degradierte Text setzt danach ein Semikolon fort,
   der andere einen Punkt. Gemessen — die Zusage selbst ist wortgleich. */
const WEITERBETRIEB = "Alles andere funktioniert unverändert weiter";
const zusage = () => dialogText().includes(ZUSAGE_SATZ);
const hinweisDegradiert = () => dialogText().includes(HINWEIS_DEGRADIERT);
const hinweisNichtFrei = () => dialogText().includes(HINWEIS_NICHT_FREI);
const hinweisOhneKi = () => hinweisDegradiert() || hinweisNichtFrei();
/* Was von einer „Angemeldet"-Zeile tatsächlich dasteht — für die Messwerte
   in den Check-Beschriftungen. Die Lagen müssen unterscheidbar bleiben,
   sonst meldet die Messhilfe bei einer Vertragsänderung nur „irgendetwas". */
const angemeldetLage = () => (zusage() ? "ZUSAGE"
  : hinweisDegradiert() ? "HINWEIS degradiert"
  : hinweisNichtFrei() ? "HINWEIS nicht freigeschaltet"
  : /Angemeldet/.test(dialogText()) ? "irgendein anderer Angemeldet-Text" : "(nichts)");
await zuKarte3();
check("W6", "vor der Wahl gibt es kein Anmelde-Angebot", () => !anmeldeBlock());
await klick(knopf("Ohne KI"));
check("W6", "bei „Ohne KI“ gibt es NIE ein Anmelde-Angebot", () => !anmeldeBlock() && !feld("Benutzername"));
await klick(knopf("Mit KI"));
/* Verschärft am 28.07.2026: Der Gast bekommt WEDER Zusage NOCH einen der
   beiden Hinweise — ihm fehlt tatsächlich die Anmeldung, nicht eine
   Freischaltung und auch keine Verbindung. Das ist dieselbe Zusage, die
   weiter unten der Gast-mit-personalAi-Fall bewacht; sie steht zusätzlich
   HIER, weil diese Stelle als erste im Abschnitt läuft. Eine Mutation, die
   `kontoOhneKi` den Modus vergessen lässt, riss W6 bisher an genau dieser
   Stelle ab, bevor der gezielte Check überhaupt drankam — jetzt benennt der
   erste rote Check auch gleich die Ursache. */
check("W6", "bei „Mit KI“ und ohne Konto erscheint das Angebot mit zwei Feldern"
  + "  [gemessen: " + angemeldetLage() + "]",
  () => anmeldeBlock() && !!feld("Benutzername") && !!feld("Passwort")
    && !zusage() && !hinweisOhneKi());
check("W6", "das Passwortfeld ist als solches ausgezeichnet",
  () => feld("Passwort").getAttribute("type") === "password");
/* Die Zusage aus KontoBereich.jsx: „Anmelden ist ein Angebot, kein Tor." */
check("W6", "das Angebot sagt sichtbar, dass ohne Anmeldung alles nutzbar bleibt",
  () => /Ohne Anmeldung bleibt alles nutzbar/.test(dialogText()));
check("W6", "„Los geht's“ bleibt trotz leerem Anmeldeformular freigegeben — kein Pflichtschritt",
  () => losKnopf().disabled === false);
check("W6", "der Anmelde-Knopf ist gesperrt, solange Benutzername oder Passwort fehlen",
  () => knopf("Anmelden").disabled === true);
await tippeIn(feld("Benutzername"), "max");
check("W6", "nur Benutzername genügt nicht", () => knopf("Anmelden").disabled === true);
await tippeIn(feld("Passwort"), "geheim");
check("W6", "mit beiden Angaben ist der Anmelde-Knopf offen", () => knopf("Anmelden").disabled === false);
check("W6", "bis hierher ist KEIN Anmeldeversuch gelaufen", auth.rufe.length === 0);

/* Die neuen Felder müssen in der Fokus-Falle auftauchen — sonst führt Tab
   aus dem Dialog heraus, sobald das Angebot erscheint. */
check("W6", "die Anmeldefelder sind Teil der Fokus-Falle"
  + "  [fangbar: " + fangbar3().length + "]",
  () => fangbar3().includes(feld("Benutzername")) && fangbar3().includes(feld("Passwort"))
    && fangbar3().includes(knopf("Anmelden")));
knopf("Los geht's").focus();
await taste("Tab");
check("W6", "Tab am Ende springt zurück auf „Mit KI“ — die Falle hält mit dem Angebot",
  () => document.activeElement === knopf("Mit KI"));

/* Der Anmeldeweg selbst. */
await klick(knopf("Anmelden"));
check("W6", "die Anmeldung geht mit genau den eingegebenen Daten an authService"
  + "  [gemessen: " + JSON.stringify(auth.rufe) + "]",
  () => auth.rufe.length === 1 && auth.rufe[0].benutzer === "max" && auth.rufe[0].passwort === "geheim");
check("W6", "nach erfolgreicher Anmeldung verschwindet das Formular",
  () => !anmeldeBlock() && !feld("Benutzername"));
check("W6", "und die Box gibt die VOLLE Zusage — wörtlich, nicht bloß das Wort „Angemeldet“"
  + "  [gemessen: " + angemeldetLage() + "]",
  () => zusage() && !hinweisOhneKi());
check("W6", "die Anmeldung allein schließt die Box nicht und schreibt keine KI-Wahl",
  () => !!dialog() && schliessRufe.length === 0 && kiTopf().roh === null);
await klick(losKnopf());
check("W6", "danach schreibt „Los geht's“ ganz normal die Wahl",
  () => kiTopf().stand.global === true && artVon(0).ki === true);

/* Ein fehlgeschlagener Anmeldeversuch. */
await zuKarte3();
auth.modus = "fehler";
auth.fehler = new ERR.BoundaryError(ERR.ERROR_CODES.UNAUTHENTICATED, { source: "auth", operation: "signIn" });
await klick(knopf("Mit KI"));
await tippeIn(feld("Benutzername"), "max");
await tippeIn(feld("Passwort"), "falsch");
await klick(knopf("Anmelden"));
check("W6", "ein Fehlschlag zeigt GENAU den Text aus errorText und lässt das Formular stehen"
  + "  [erwartet: „" + ERR.errorText(auth.fehler).slice(0, 40) + "…“]",
  () => dialogText().includes(ERR.errorText(auth.fehler)) && !!feld("Benutzername"));
check("W6", "ein Fehlschlag schließt die Box nicht und sperrt „Los geht's“ nicht",
  () => !!dialog() && schliessRufe.length === 0 && losKnopf().disabled === false);
check("W6", "der Fehlschlag ist kein Server-Sammeltext, sondern der Code-genaue",
  () => ERR.errorText(auth.fehler) !== ERR.errorText({ code: ERR.ERROR_CODES.SERVER })
    && dialogText().includes(ERR.errorText(auth.fehler)));
await klick(losKnopf());
check("W6", "„Los geht's“ funktioniert auch nach einem gescheiterten Anmeldeversuch"
  + "  [gemessen: " + JSON.stringify(artVon(0)) + "]",
  () => artVon(0) !== null && artVon(0).durchgeklickt === true && artVon(0).ki === true
    && kiTopf().stand.global === true);

/* Escape MITTEN in einer laufenden Anmeldung. Der Fall ist real: der Nutzer
   tippt sich vertippt, wartet, verliert die Geduld. Geprüft wird, dass die
   Box sauber zumacht und dass die spätere Auflösung des Anmelde-Versprechens
   nichts mehr umwirft. */
await zuKarte3();
auth.modus = "haengen";
await klick(knopf("Mit KI"));
await tippeIn(feld("Benutzername"), "max");
await tippeIn(feld("Passwort"), "geheim");
await klick(knopf("Anmelden"));
check("W6", "während der Anmeldung ist der Anmelde-Knopf gesperrt und zeigt es an",
  () => auth.rufe.length === 1 && !!knopfTeil("…") && knopfTeil("…").disabled === true);
check("W6", "während der Anmeldung bleibt „Los geht's“ bedienbar — die Anmeldung ist kein Tor",
  () => losKnopf().disabled === false);
const vorEsc = schliessRufe.length;
await taste("Escape");
check("W6", "Escape während laufender Anmeldung schließt sauber ab"
  + "  [gemessen: " + JSON.stringify(artVon(vorEsc)) + "]",
  () => schliessRufe.length === vorEsc + 1 && artVon(vorEsc).durchgeklickt === false);
check("W6", "und schreibt keine KI-Wahl", () => kiTopf().roh === null);
/* Die Box ist danach abgebaut; die Auflösung darf nicht werfen. */
await act(async () => { steuer.setOffen(false); });
let aufloesungWarf = false;
try { await act(async () => { auth.aufloesen({ mode: "account" }); await new Promise((r) => setTimeout(r, 0)); }); }
catch { aufloesungWarf = true; }
check("W6", "die Auflösung nach dem Abbau wirft nicht  [gemessen: " + (aufloesungWarf ? "wirft" : "sauber") + "]",
  () => !aufloesungWarf);
auth.modus = "erfolg";

/* Wer bereits angemeldet ist, bekommt kein Formular. */
await zuKarte3();
auth.konto = true;
await act(async () => { steuer.setOffen(false); });
await act(async () => { steuer.setOffen(true); });
await klick(knopf("Weiter")); await klick(knopf("Weiter"));
await klick(knopf("Mit KI"));
/* Der GRÜNE Weg des F8-Fixes: Konto UND `capabilities.personalAi === true`.
   Das Doppel liefert die Fähigkeit seit dem 28.07.2026 mit — vorher war
   dieser Fall vom Gegenfall darunter gar nicht zu unterscheiden. */
check("W6", "wer schon ein Konto MIT personalAi hat, sieht kein Anmeldeformular, sondern die Zusage"
  + "  [gemessen: " + angemeldetLage() + "]",
  () => !anmeldeBlock() && !feld("Benutzername") && zusage() && !hinweisOhneKi());

/* ---- Zusage 5 (NEU 28.07.2026, F8-Fix): ANGEMELDET IST NICHT GENUG.
   „Angemeldet — die KI-Funktionen stehen dir zur Verfügung" ist eine Zusage
   über einen Pfad, den die Box selbst nicht öffnet: `aiService` verlangt
   `requireAccount("personalAi")`. Fehlt die Fähigkeit, ist die Zeile eine
   Lüge, die der Nutzer erst beim ersten Klick auf eine KI-Funktion als
   solche erkennt — nachdem die Box ihm das Gegenteil versprochen hat.
   Die Box wendet `kiFaehig` an ZWEI Stellen an (der Snapshot beim Aufbau,
   der Snapshot nach `signIn`). Beide werden einzeln geprüft; eine Prüfung
   an nur einer Stelle ließe die andere ungeschützt.

   NACHGEZOGEN 28.07.2026: `kiFaehig` prüft seither DREI Bedingungen, weil
   `requireAccount` drei prüft — Modus, `state === "ready"` und die
   Fähigkeit. Jede fehlende Bedingung erzeugt dieselbe Sorte Lüge, nur eine
   Stelle weiter. Die Fälle unten decken alle drei ab. */

/* (a) Der AUFBAU-Weg: die Sitzung steht schon, bevor die Box aufgeht.
   Sieben Spielarten von „nicht freigeschaltet". `{}` und `capabilities:
   null` trennen die strenge Prüfung `=== true` von einem großzügigen
   `!== false`, das den fehlenden Schlüssel als Ja läse; `"ja"` trennt sie
   von einer bloßen Wahrheitswert-Prüfung; die drei `state`-Fälle trennen
   sie von einer Prüfung, die den Zustand gar nicht ansieht. „degraded mit
   personalAi === true" ist der eigentlich gefährliche: Modus und Fähigkeit
   stimmen, nur der Zustand nicht — die Zusage wäre erteilt worden, und der
   erste Klick wäre durch `requireAccount` gefallen. */
/* Die vierte Spalte ist neu (F10): WELCHER der beiden Hinweise fallen muss.
   Sie wird EXKLUSIV geprüft — der jeweils andere Text darf nicht dastehen.
   Genau daran hing der Befund: Vorher bekam auch die degradierte Sitzung
   den Satz „dein Konto ist nicht freigeschaltet", also eine Diagnose über
   eine Berechtigung, die das Konto in Wahrheit besitzt. */
for (const [name, faehigkeiten, zustand, erwartet] of [
  ["personalAi === false", { personalAi: false }, undefined, "nichtFrei"],
  ["capabilities fehlt ganz (alter Server)", null, undefined, "nichtFrei"],
  ["capabilities ist leer", {}, undefined, "nichtFrei"],
  ["personalAi ist wahrheitswertig, aber nicht true", { personalAi: "ja" }, undefined, "nichtFrei"],
  ["state === degraded, personalAi === true", { personalAi: true }, "degraded", "degradiert"],
  ["VORRANGREGEL: degraded UND personalAi === false", { personalAi: false }, "degraded", "degradiert"],
  ["state fehlt ganz, personalAi === true", { personalAi: true }, null, "nichtFrei"],
]) {
  await zuKarte3({ konto: true, faehigkeiten, zustand });
  await klick(knopf("Mit KI"));
  /* Zwei getrennte Checks mit Absicht: Der erste bewacht, dass die Zusage
     NICHT fällt — das ist die Lüge, um die es geht. Der zweite bewacht, dass
     der RICHTIGE Grund genannt wird. Zusammengelegt könnte eine spätere
     Änderung am Hinweistext eine echte Regression an der Zusage verdecken. */
  check("W6", "Konto ohne KI-Freischaltung (" + name + "): KEINE Zusage, die KI stünde bereit"
    + "  [gemessen: " + angemeldetLage() + "]",
    () => !zusage());
  check("W6", "Konto ohne KI-Freischaltung (" + name + "): genau der Hinweis „" + erwartet
    + "“ — und der andere NICHT  [gemessen: " + angemeldetLage() + "]",
    () => hinweisDegradiert() === (erwartet === "degradiert")
      && hinweisNichtFrei() === (erwartet === "nichtFrei"));
}

/* (b) Die erste Hälfte der Bedingung: `mode === "account"`. Ein Gast mit
   `personalAi` im Snapshot ist keine Anmeldung — ohne diesen Fall wäre eine
   Prüfung, die den Modus vergisst, durch alles andere hier grün. Der Gast
   bekommt WEDER Zusage NOCH Hinweis, sondern das Angebot: Ihm fehlt
   tatsächlich die Anmeldung, nicht die Freischaltung. */
await zuKarte3({ konto: false, faehigkeiten: { personalAi: true } });
await klick(knopf("Mit KI"));
check("W6", "Gast MIT personalAi im Snapshot gilt trotzdem nicht als angemeldet"
  + "  [gemessen: " + angemeldetLage() + ", Formular=" + anmeldeBlock() + "]",
  () => !zusage() && !hinweisOhneKi() && anmeldeBlock());

/* (c) Der signIn-Weg: die Anmeldung SELBST liefert ein Konto ohne
   `personalAi`. Der Aufruf geht durch, wirft nicht, meldet keinen Fehler —
   und trotzdem darf die Box die Zusage nicht geben. */
await zuKarte3({ konto: false, faehigkeiten: { personalAi: false } });
await klick(knopf("Mit KI"));
await tippeIn(feld("Benutzername"), "max");
await tippeIn(feld("Passwort"), "geheim");
await klick(knopf("Anmelden"));
check("W6", "die Anmeldung ohne personalAi läuft erfolgreich durch — kein Fehler, keine Ausnahme"
  + "  [gemessen: " + auth.rufe.length + " Ruf(e), Sitzung " + JSON.stringify(auth.snapshot()) + "]",
  () => auth.rufe.length === 1 && auth.snapshot().mode === "account" && !!dialog());
check("W6", "eine ERFOLGREICHE Anmeldung ohne personalAi bekommt trotzdem keine KI-Zusage"
  + "  [gemessen: " + angemeldetLage() + "]",
  () => !zusage());
check("W6", "und „Los geht's“ bleibt dabei offen — der Nutzer sitzt nicht fest",
  () => losKnopf().disabled === false);

/* (c2) Derselbe Weg mit der neuen dritten Bedingung: Die Anmeldung liefert
   ein Konto, das `personalAi` SEHR WOHL trägt — aber degradiert ist. Ohne
   die `state`-Prüfung sähe dieser Snapshot aus wie ein voll berechtigtes
   Konto. Das ist der Fall, den das Doppel bis heute gar nicht darstellen
   konnte, weil es `state` nicht kannte. */
await zuKarte3({ konto: false, faehigkeiten: { personalAi: true }, zustand: "degraded" });
await klick(knopf("Mit KI"));
check("W6", "vor der Anmeldung steht das Angebot — der Gast ist noch kein Konto",
  () => anmeldeBlock() && !zusage() && !hinweisOhneKi());
await tippeIn(feld("Benutzername"), "max");
await tippeIn(feld("Passwort"), "geheim");
await klick(knopf("Anmelden"));
check("W6", "Anmeldung liefert ein DEGRADIERTES Konto mit personalAi: die Anmeldung selbst glückt"
  + "  [gemessen: " + auth.rufe.length + " Ruf(e), Sitzung " + JSON.stringify(auth.snapshot()) + "]",
  () => auth.rufe.length === 1 && auth.snapshot().state === "degraded"
    && auth.snapshot().capabilities.personalAi === true);
check("W6", "…und trotzdem fällt die Zusage NICHT — `state` zählt mit"
  + "  [gemessen: " + angemeldetLage() + "]",
  () => !zusage() && hinweisDegradiert() && !hinweisNichtFrei());

/* (d) Der Rückfall `s || authService.getSnapshot()`: Ein Dienst, der nach
   erfolgreicher Anmeldung nichts zurückgibt, darf die Box nicht in „nicht
   angemeldet" stehen lassen. Sonst hinge der grüne Weg allein am Rückgabewert
   von `signIn` — einer Zusage, die `services/auth.js` nirgends schriftlich
   gibt. */
await zuKarte3({ konto: false, faehigkeiten: { personalAi: true } });
const echterSignIn = auth.signIn;
auth.signIn = function (b, pw) {
  this.rufe.push({ benutzer: b, passwort: pw }); this.konto = true;
  return Promise.resolve(undefined);   // liefert nichts zurück
};
await klick(knopf("Mit KI"));
await tippeIn(feld("Benutzername"), "max");
await tippeIn(feld("Passwort"), "geheim");
await klick(knopf("Anmelden"));
check("W6", "liefert signIn nichts zurück, zieht die Box den Snapshot nach"
  + "  [gemessen: " + angemeldetLage() + ", Formular=" + anmeldeBlock() + "]",
  () => zusage() && !hinweisOhneKi() && !anmeldeBlock());
auth.signIn = echterSignIn;

/* ---- Zusage 6 (NEU 28.07.2026, F9-Fix): DER DRITTE ZWEIG SELBST.
   Die Checks oben bewachen, dass die Zusage ausbleibt. Hier steht, was
   stattdessen passiert — und das war der eigentliche Befund F9: Vorher
   stellte die Box dem Nutzer wortlos wieder das Anmeldeformular hin, das er
   gerade erfolgreich ausgefüllt hatte, mit geleertem Passwortfeld und
   gesperrtem Knopf. Eine geglückte Anmeldung sah aus wie ein stiller
   Fehlschlag. Der dritte Zweig ist die Zusage, dass das nicht mehr
   passiert; er wird deshalb hier vollständig festgenagelt, statt als
   offener F-Hinweis mitzulaufen.
   (F9 stand bis heute im F-Abschnitt und ist NICHT verschwunden, sondern
   hierher umgezogen — dieselbe Buchführung wie bei F1–F5.)

   ERWEITERT 28.07.2026 (F10-Fix): Der Zweig hat zwei Wortlaute. Alles, was
   ihn ausmacht — Formular weg, Grund genannt, Weiterbetrieb zugesagt, keine
   Fehlerfarbe, nicht festgesteckt — muss für BEIDE gelten, sonst hätte der
   zweite Wortlaut keine einzige Zusage hinter sich. Deshalb läuft die
   ganze Gruppe zweimal, einmal je Ursache, und jeder Durchgang prüft
   zusätzlich, dass der jeweils ANDERE Text nicht dasteht. */
/* Eigene Farbhilfe: `farbeGleich` liegt im Funktionsrumpf von W3 und ist
   hier nicht sichtbar. React schreibt Hex, jsdom liest rgb() zurück. */
const farbeIst = (ist, hex) => ist === hex || ist === alsRgb(hex);
const gefahrRgb = alsRgb(T.gefahr);
for (const [ursache, faehigkeiten, zustand, satz, gegensatz] of [
  ["Freischaltung fehlt", { personalAi: false }, undefined, HINWEIS_NICHT_FREI, HINWEIS_DEGRADIERT],
  ["Sitzung degradiert", { personalAi: true }, "degraded", HINWEIS_DEGRADIERT, HINWEIS_NICHT_FREI],
]) {
  await zuKarte3({ konto: false, faehigkeiten, zustand });
  await klick(knopf("Mit KI"));
  const textVorAnmeldung = dialogText();
  await tippeIn(feld("Benutzername"), "max");
  await tippeIn(feld("Passwort"), "geheim");
  await klick(knopf("Anmelden"));
  check("W6", "F9 (" + ursache + "): die geglückte Anmeldung ändert die Box sichtbar"
    + "  [gemessen: Text ändert sich=" + (textVorAnmeldung !== dialogText()) + "]",
    () => textVorAnmeldung !== dialogText());
  check("W6", "F9 (" + ursache + "): das Anmeldeformular steht NICHT wieder da"
    + "  [gemessen: Block=" + anmeldeBlock() + ", Benutzerfeld=" + !!feld("Benutzername")
    + ", Anmelden-Knopf=" + !!knopf("Anmelden") + "]",
    () => !anmeldeBlock() && !feld("Benutzername") && !knopf("Anmelden"));
  check("W6", "F9 (" + ursache + "): genau dieser Grund steht da, der andere nicht"
    + "  [gemessen: " + angemeldetLage() + "]",
    () => dialogText().includes(satz) && !dialogText().includes(gegensatz));
  check("W6", "F9 (" + ursache + "): der Weiterbetrieb wird ausdrücklich zugesagt"
    + "  [gemessen: " + dialogText().includes(WEITERBETRIEB) + "]",
    () => dialogText().includes(WEITERBETRIEB));
  /* Der Hinweis ist KEIN Fehler. Der Unterschied ist nicht kosmetisch: Eine
     Fehlerfarbe sagt „du hast etwas falsch gemacht, versuch es nochmal" —
     und genau das kann der Nutzer in beiden Fällen nicht. Gegenprobe ist der
     echte Anmeldefehler weiter oben, der sehr wohl in T.gefahr steht. */
  const hinweisAbsatz = () => [...dialog().querySelectorAll("p")]
    .find((el) => el.textContent.replace(/\s+/g, " ").includes(satz));
  check("W6", "F9 (" + ursache + "): steht nicht in der Fehlerfarbe, sondern im Fließtext"
    + "  [gemessen: " + JSON.stringify(hinweisAbsatz() && hinweisAbsatz().style.color)
    + ", T.gefahr wäre " + JSON.stringify(gefahrRgb) + "]",
    () => !!hinweisAbsatz() && farbeIst(hinweisAbsatz().style.color, T.leinwand)
      && !farbeIst(hinweisAbsatz().style.color, T.gefahr));
  check("W6", "F9 (" + ursache + "): sitzt in einem ruhigen Kasten (T.saal), nicht in einer Warnfläche"
    + "  [gemessen: " + JSON.stringify(hinweisAbsatz() && hinweisAbsatz().parentElement.style.background) + "]",
    () => !!hinweisAbsatz() && farbeIst(hinweisAbsatz().parentElement.style.background, T.saal));
  check("W6", "F9 (" + ursache + "): im ganzen Dialog steht kein Element in der Fehlerfarbe"
    + "  [gemessen: " + [...dialog().querySelectorAll("*")]
      .filter((el) => el.style && el.style.color === gefahrRgb).length + " Treffer]",
    () => [...dialog().querySelectorAll("*")].every((el) => !el.style || el.style.color !== gefahrRgb));
  /* Und der Nutzer steckt nicht fest: Er kann die Box ganz normal abschließen,
     seine KI-Wahl wird geschrieben wie in jedem anderen Fall. */
  check("W6", "F9 (" + ursache + "): „Los geht's“ ist offen und trägt keine Sperrbegründung",
    () => losKnopf().disabled === false && !losKnopf().getAttribute("title"));
  await klick(losKnopf());
  check("W6", "F9 (" + ursache + "): der Abschluss schreibt die Wahl ganz normal"
    + "  [gemessen: " + JSON.stringify(artVon(0)) + ", Topf global="
    + JSON.stringify(kiTopf().stand && kiTopf().stand.global) + "]",
    () => artVon(0) !== null && schliessRufe.length === 1
      && Object.keys(artVon(0)).sort().join(",") === "durchgeklickt,gespeichert,ki"
      && artVon(0).durchgeklickt === true && artVon(0).ki === true && artVon(0).gespeichert === true
      && !!kiTopf().stand && kiTopf().stand.global === true
      && kiTopf().marke === KS.KI_WAHL_VERSION);
}
authAuf();
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

/* ---------------------------------------------------------------------------
   NEU AUS PHASE 2b — die KI-Frage auf Karte 3.
   --------------------------------------------------------------------------- */

/* F7 — DER PRIVATMODUS VERBRENNT DIE KI-FRAGE, STATT SIE ZU WIEDERHOLEN.
   `setzeGlobal` liefert seit K3 `{ stand, gespeichert }` — genau damit ein
   Aufrufer merken kann, dass nichts geschrieben wurde. Willkommen.jsx wertet
   die Rückgabe nicht aus:
       setzeGlobal(kiWahl === true, jetzt || new Date().toISOString());
       if (onClose) onClose({ durchgeklickt: true, ki: kiWahl === true });
   Bei blockiertem Storage (Privatmodus, volle Quote) heißt das: die Box meldet
   `{ durchgeklickt: true, ki: true }`, App.jsx:2106 setzt daraufhin
   `setWillkommen(true)` — und die Box kommt NIE wieder. Die Frage ist damit
   verbrannt UND unbeantwortet: `wahlBestaetigt()` bleibt false, `kiAn()` ist
   fail-closed aus, und der Nutzer, der ausdrücklich „Mit KI" gewählt hat,
   findet keine einzige KI-Funktion und keinen Hinweis, warum.
   Die Frage aus dem Auftrag war, ob „beim nächsten Start kommt die Frage
   wieder" der richtige Ausgang sei — sie kommt eben NICHT wieder, und das ist
   der schlechtere von beiden.
   Billigster Fix: `gespeichert` durchreichen —
   `onClose({ durchgeklickt: true, ki, gespeichert })` — und in App.jsx nur bei
   `gespeichert` als gesehen markieren. Dann fragt die Box beim nächsten Start
   erneut, was ehrlich ist. Eine sichtbare Zeile in der Box wäre die Kür. */
const echterSpeicher = dom.window.localStorage;
const blockierterSpeicher = {
  getItem: () => null,
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => {},
};
schliessRufe.length = 0;
authAuf();
await act(async () => { steuer.setOffen(false); });
await act(async () => { steuer.setOffen(true); });
await klick(knopf("Weiter")); await klick(knopf("Weiter"));
await klick(knopf("Mit KI"));
Object.defineProperty(globalThis, "localStorage", { value: blockierterSpeicher, configurable: true, writable: true });
await klick(knopf("Los geht's"));
Object.defineProperty(globalThis, "localStorage", { value: echterSpeicher, configurable: true, writable: true });
const privatRuf = (schliessRufe[0] || [])[0] || {};
check("F", "F7: bei blockiertem Storage meldet die Box nicht „durchgeklickt“, als wäre alles gespeichert"
  + "  [gemessen: onClose = " + JSON.stringify(privatRuf)
  + ", gespeichert-Feld = " + JSON.stringify(privatRuf.gespeichert) + "]",
  () => privatRuf.gespeichert === false || privatRuf.durchgeklickt === false);
check("F", "F7a: der Aufrufer kann erkennen, dass die KI-Wahl nicht angekommen ist"
  + "  [gemessen: Schlüssel " + JSON.stringify(Object.keys(privatRuf)) + "]",
  () => Object.keys(privatRuf).includes("gespeichert"));

/* F8 — „ANGEMELDET — DIE KI-FUNKTIONEN STEHEN DIR ZUR VERFÜGUNG" IST EINE
   ZUSAGE, DIE DIE BOX NICHT PRÜFEN KANN. Sie hängt allein an
   `authService.getSnapshot().mode === "account"`. Der KI-Pfad verlangt aber
   mehr: `aiService` fordert `requireAccount("personalAi")`, und diese
   Fähigkeit steht in `session.capabilities`. Ein angemeldetes Konto OHNE
   `personalAi` bekommt hier die Auskunft, die KI-Funktionen stünden bereit —
   und läuft beim ersten Versuch in einen Fehler.
   Der Snapshot trägt die Antwort bereits mit; es ist eine Bedingung mehr. */
schliessRufe.length = 0;
authAuf();
/* Der Fall wird über das Doppel eingestellt, NICHT durch Überschreiben von
   `auth.snapshot`: Die frühere Fassung ersetzte die Methode und stellte
   danach eine ALTE, fähigkeitslose Variante wieder her — jeder Abschnitt
   nach F hätte damit stillschweigend ohne `capabilities` gemessen. */
auth.konto = true; auth.faehigkeiten = { personalAi: false };
await act(async () => { steuer.setOffen(false); });
await act(async () => { steuer.setOffen(true); });
await klick(knopf("Weiter")); await klick(knopf("Weiter"));
await klick(knopf("Mit KI"));
const behauptung = dialogText();
/* Der volle Satz, nicht das Wort „Angemeldet": Seit dem F9-Fix beginnt auch
   der Hinweis für ein Konto ohne Freischaltung mit „Angemeldet". */
check("F", "F8: ein Konto OHNE personalAi bekommt keine Zusage, die KI stünde bereit"
  + "  [gemessen: " + (behauptung.includes("Angemeldet — die KI-Funktionen stehen dir zur Verfügung.")
    ? "ZUSAGE" : behauptung.includes("Angemeldet — dein Konto ist für die KI-Funktionen aber noch nicht freigeschaltet.")
    ? "HINWEIS ohne KI" : "(nichts)") + "]",
  () => !behauptung.includes("Angemeldet — die KI-Funktionen stehen dir zur Verfügung."));
authAuf();

/* F9 — UMGEZOGEN AM 28.07.2026, NICHT GESTRICHEN.
   Der Befund lautete: Die erfolgreiche Anmeldung ohne `personalAi` endete
   in einer Sackgasse ohne ein Wort Erklärung — `signIn` lief durch, die Box
   stellte wortlos wieder das Anmeldeformular hin, mit geleertem Passwortfeld
   und dadurch gesperrtem Knopf, ohne Fehlerzeile. Eine geglückte Anmeldung
   sah aus wie ein stiller Fehlschlag, und der zweite Versuch endete
   zwangsläufig genauso.
   Er ist behoben: Karte 3 hat jetzt einen dritten Zweig (`kontoOhneKi`) mit
   einem erklärenden Hinweis. Damit gehört der Fall nicht mehr in die Liste
   der Auffälligkeiten, sondern unter die scharfen Zusagen — er steht als
   Gruppe „Zusage 6" in W6 und prüft dort deutlich mehr als die alte
   F-Fassung: dass der Text sich ändert, dass das Formular NICHT wieder
   dasteht, dass der Hinweis den Grund nennt und den Weiterbetrieb zusagt,
   dass er nicht in der Fehlerfarbe steht, und dass „Los geht's" offen
   bleibt und die Wahl ganz normal schreibt.
   Dieselbe Buchführung wie bei F1–F5: hier dokumentiert, dort geprüft. */
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
  W5: "Escape und Fokus-Falle",
  W6: "Karte 3: die KI-Frage",
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

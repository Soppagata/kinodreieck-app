/* Etappe 6 — Oberflächentest für src/tabs/FinderTab.jsx
   ===========================================================================
   WARUM DIESE DATEI EXISTIERT
   ---------------------------------------------------------------------------
   Zwei Reviews haben unabhängig festgestellt: kein einziger Test rendert
   FinderTab. Am 26.07. sind dort drei Zustandsfehler behoben worden (S6, S7,
   S8), und alle drei sind ausschließlich durch INTERAKTION prüfbar — Auf- und
   Abbau des Tabs, zwei Klicks hintereinander, ein Aufruf, der noch unterwegs
   ist. Kein Modultest an finder.js hätte einen davon gesehen. Diese Datei
   schließt genau diese Lücke: sie montiert die echte Komponente, klickt, baut
   den Tab ab und wieder auf und zählt die Aufrufe.

   WIE JSX UNTER NODE LAUFBAR WIRD  (Punkt 1 des Berichts)
   ---------------------------------------------------------------------------
   FinderTab.jsx ist JSX und zieht über finder.js ein JSON mit Import-Attribut;
   Node führt beides so nicht aus. Statt eines Frameworks wird die Komponente
   VOR dem Test mit esbuild (steckt in vite, keine neue Abhängigkeit) zu einem
   einzigen ESM-Bündel übersetzt — 1 Aufruf, ~40 ms. Warum bündeln und nicht
   nur übersetzen: FinderTab importiert selbst wieder JSX (ui.jsx,
   EintragForm.jsx); eine reine Transformation der einen Datei würde beim
   ersten Unterimport scheitern. Warum nicht `vite build`: das schreibt CSS,
   Assets und eine Manifest-Struktur, die hier niemand braucht.

   Drei Feinheiten des Bündelwegs, jede aus einem Grund:
     * react/react-dom bleiben EXTERN. Sonst hätte das Bündel eine zweite
       React-Instanz und `act()` aus dem Testprozess würde ins Leere greifen.
     * Das Bündel liegt unter node_modules/.cache/ — von dort findet Node die
       externen react-Importe über die normale Auflösung, ohne dass im Repo ein
       Artefakt entsteht.
     * services/ai.js wird beim Bündeln durch einen Stub ERSETZT (Plugin, nicht
       Monkeypatching: `aiService` ist Object.freeze't und ließe sich zur
       Laufzeit nicht überschreiben). Damit ist ausgeschlossen, dass ein echter,
       bezahlter Aufruf stattfindet — der Netzpfad ist nicht bloß ungenutzt, er
       ist nicht im Bündel. Die Suite läuft offline und kostenlos.
   Die Quelle der Komponente kann über FINDERTAB_QUELLE=<pfad> getauscht werden;
   genau dafür ist der Mutationstest gebaut (siehe unten).

   WAS GEPRÜFT WIRD
   ---------------------------------------------------------------------------
     G1  Die Sperre gegen zwei bezahlte Deutungen überlebt den Tab-Wechsel (S6).
     G2  Die Fehlermeldung hängt am Verlaufseintrag, nicht an einem Index (S6/S8).
     G3  „Neue Suche" fragt zurück, wenn eine bezahlte Deutung im Verlauf steht (S7).
     G4  Chip-Klassen (hart/weich/ausschluss) und Abwählbarkeit jedes Chips.
     G5  Die 300-Zeichen-Grenze greift VOR dem Bezahlen.
     G6  Keine Antwortform des Endpunkts stürzt die Oberfläche ab.
     F   Forderungen an die Implementierung — Checks, die HEUTE ROT sind, weil
         die Implementierung an dieser Stelle falsch oder unvollständig ist.
         Sie zählen NICHT in den Exit-Code (die Kette bleibt grün), werden aber
         berichtet und tragen ihre Messung im Namen. FINDERTAB_FORDERUNG=1
         schaltet sie scharf. Sie stehen dort, wo sie gemessen werden — F5 also
         mitten in G1 —, die Sammlung steht in der Bilanz am Ende.
         Bewusst NICHT als grüner Check auf das Ist-Verhalten gepinnt: ein Pin
         auf falsches Verhalten macht die Reparatur später zur „Regression"
         (dieselbe Regel wie im Kopf von finder_test.mjs).

   MUTATIONSTEST (Belege im Bericht)
   ---------------------------------------------------------------------------
   Für jeden Fix wurde src/tabs/FinderTab.jsx nach /tmp kopiert, dort GENAU
   dieser eine Fix zurückgenommen und die Suite gegen die Kopie gefahren:
       FINDERTAB_QUELLE=/tmp/mut1_sperre.jsx node findertab_test.mjs
   Welcher Check dabei rot wird, steht am jeweiligen Check als „[M<n>]":
       M1  Sperre als Komponenten-State statt Modulvariable
       M2  kiFehler als { idx, text } im Tab-State statt am Verlaufseintrag
       M3  „Neue Suche" wieder einstufig
       M4  Reihen-Chip wieder als „weich" ausgezeichnet
       M5  300-Zeichen-Grenze im Client entfernt
   Belegt sind alle fünf; die Tabelle steht im Bericht.

   Kein Framework, keine neue Abhängigkeit. Aufruf: node findertab_test.mjs
   =========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const WURZEL = path.dirname(fileURLToPath(import.meta.url));

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
   BÜNDELN — JSX + JSON-Import-Attribut in ein ESM-Modul, ai.js als Stub
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

const QUELL_DATEI = process.env.FINDERTAB_QUELLE || path.join(WURZEL, "src/tabs/FinderTab.jsx");
const QUELLTEXT = fs.readFileSync(QUELL_DATEI, "utf8");
const AUSGABE_DIR = path.join(WURZEL, "node_modules/.cache/findertab-test");
const AUSGABE = path.join(AUSGABE_DIR, "findertab.bundle.mjs");

/* Der Stub steht für src/services/ai.js. Er kennt kein Netz, keinen Anbieter
   und keinen Schlüssel; jeder Aufruf landet in einem Zähler im Testprozess. */
const AI_STUB = `
export const aiService = { runTask: (task, payload, optionen) => globalThis.__FINDERTAB_STUB__.runTask(task, payload, optionen) };
export const AI_TASKS = ["health", "echo-struct", "intelligent-search", "masterlist-enrichment"];
export const AI_PROMPT_VERSION = "v1";
`;

const esbuild = await ladeEsbuild();
fs.mkdirSync(AUSGABE_DIR, { recursive: true });
const gebautAb = Date.now();
await esbuild.build({
  entryPoints: ["findertab-eintritt"],
  bundle: true,
  format: "esm",
  outfile: AUSGABE,
  jsx: "automatic",
  target: "es2022",
  logLevel: "warning",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  plugins: [{
    name: "findertab-test",
    setup(bau) {
      /* Eintritt als virtuelles Modul: so kann der Mutationstest eine Kopie aus
         /tmp einspeisen, während die relativen Importe weiter gegen das echte
         src/tabs/ auflösen (resolveDir). */
      bau.onResolve({ filter: /^findertab-eintritt$/ }, () => ({ path: "findertab-eintritt", namespace: "ft-virtuell" }));
      bau.onLoad({ filter: /.*/, namespace: "ft-virtuell" }, () => ({
        contents: QUELLTEXT, loader: "jsx", resolveDir: path.join(WURZEL, "src/tabs"),
      }));
      bau.onResolve({ filter: /services[/\\]ai\.js$/ }, () => ({ path: "ai-stub", namespace: "ft-stub" }));
      bau.onLoad({ filter: /.*/, namespace: "ft-stub" }, () => ({ contents: AI_STUB, loader: "js" }));
    },
  }],
});
const bauDauer = Date.now() - gebautAb;

/* =========================================================================
   JSDOM + React — Reihenfolge zählt: die Browser-Globalen müssen stehen,
   bevor react-dom geladen wird.
   ========================================================================= */
const dom = new JSDOM("<!doctype html><html><body><div id=\"wurzel\"></div></body></html>", { url: "http://localhost/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Element",
  "Event", "MouseEvent", "KeyboardEvent", "CustomEvent", "Node", "NodeList", "getComputedStyle", "localStorage"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* =========================================================================
   VERTRAGSÄNDERUNG 27.07.2026 (Etappe 7, Phase 2) — DER KI-SCHALTER
   -------------------------------------------------------------------------
   „Mit KI deuten" hängt seit Phase 2 zusätzlich an `kiAn("suche")`
   (FinderTab.jsx:552). Der Schalter ist FAIL-CLOSED: ohne beantwortete Frage
   ist KI aus — und diese Suite rendert bis eben ohne jeden Schalterstand,
   weshalb G1, G2, G3 und G5 mit „Knopf nicht gefunden" abbrachen.
   Das war kein Testfehler, sondern die Zusage bei der Arbeit: Eine
   unbeantwortete Frage darf nie „dann halt an" heißen, sonst öffnet der
   erste Start einen bezahlten Pfad, bevor der Nutzer gefragt wurde.
   `localStorage` steht deshalb jetzt in den Globalen (der Schalter liest es
   über `globalThis.localStorage`), und die Grundeinstellung dieser Suite ist
   „KI an" — sie prüft schließlich den KI-Pfad. Die Gegenrichtung, dass der
   Knopf bei KI=aus NICHT existiert und NULL Aufrufe entstehen, steht als
   eigene Gruppe G7 am Ende.
   Nebenwirkung des Gates, die eine echte Lücke schließt: Der Knopf wurde
   bisher auch GÄSTEN angeboten, obwohl `aiService` ein Konto verlangt — der
   Fehlschlag kam erst nach dem Klick. */
const KS = await import("./src/lib/kiSchalter.js");
const kiStand = (stand, marke = KS.KI_WAHL_VERSION) => {
  if (stand === null) dom.window.localStorage.removeItem("kd:ki");
  else dom.window.localStorage.setItem("kd:ki", JSON.stringify(stand));
  if (marke === null) dom.window.localStorage.removeItem("kd:ki-version");
  else dom.window.localStorage.setItem("kd:ki-version", marke);
};
const kiAnSetzen = () => kiStand({ global: true, funktionen: {}, gefragtAm: "2026-07-27T22:00:00.000Z" });
kiAnSetzen();

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act, useState, createElement: h } = React;
const { T } = await import("./src/lib/tokens.js");
const { FinderTab, erstelleFinderAntwort, kompakteFinderTreffer } = await import(AUSGABE);

/* ---------------------------------------------------- Stub des KI-Aufrufs */
/* Ein Zähler und drei Betriebsarten. „haengen" ist die wichtigste: sie hält
   den Aufruf offen, so wie ein echter fetch offen bleibt, während der Nutzer
   den Tab wechselt. */
const stub = {
  rufe: [],
  modus: "sofort",           // sofort | haengen | fehler
  antwort: { ok: true, data: {} },
  fehler: null,
  aufloesen: null,
  ablehnen: null,
  runTask(task, payload) {
    this.rufe.push({ task, payload });
    if (this.modus === "haengen") {
      return new Promise((res, rej) => { this.aufloesen = res; this.ablehnen = rej; });
    }
    if (this.modus === "fehler") return Promise.reject(this.fehler);
    return Promise.resolve(this.antwort);
  },
};
globalThis.__FINDERTAB_STUB__ = { runTask: (t, p, o) => stub.runTask(t, p, o) };
const zaehlerAuf = () => { stub.rufe = []; };

/* =========================================================================
   FIXTURES — klein, sprechend, deterministisch.
   Genre-Schreibweisen sind die ECHTEN aus Max' Masterliste (177 Einträge,
   geprüft 26.07.2026): durchgehend klein, "sci-fi", "komödie", "romance".
   Begründung steht im Kopf von finder_test.mjs ab Zeile 87: die Demo-Datei
   src/data/masterliste.json behauptet eine andere Datenform und verdeckt damit
   echte Vokabular-Lücken. Prüfmaßstab ist die Nutzerdatenform.
   Titel enthalten KEINES der Abfragewörter der Tests — sonst überstimmt die
   Titel-Erkennung (umgeht alle Filter) die Chip- und Filtertests.
   reihe/franchise/regie sind gesetzt, weil der Reihen-Chip (Fix 4) daran hängt;
   die Namen tragen je ein markantes Wort >=5 Zeichen, sonst greift das Signal
   nicht (finder.js: `w.length >= 5`).
   ========================================================================= */
const MASTER = [
  { id: "nacht_der_glut_1984", titel: "Nacht der Glut", originaltitel: "Night of Embers", jahr: 1984, typ: "film",
    quelle: "dvd", kategorie: "sehenswert", genre: ["horror"], tags: ["duester", "kult"],
    bewertung: { wie: 4, was: 2, warum: 4 }, reihe: ["Glutnacht Zyklus"], regie: ["Orla Vendtberg"] },
  { id: "stiller_hafen_1972", titel: "Stiller Hafen", originaltitel: "Quiet Harbour", jahr: 1972, typ: "film",
    quelle: "dvd", kategorie: "kult_klassiker", genre: ["drama"], tags: ["melancholisch"],
    bewertung: { wie: 3, was: 5, warum: 2 } },
  { id: "zwei_linke_pfoten_2015", titel: "Zwei linke Pfoten", originaltitel: "Two Left Paws", jahr: 2015, typ: "film",
    quelle: "netflix", kategorie: "immer_gut", genre: ["komödie"], tags: ["feelgood"],
    bewertung: { wie: 2, was: 3, warum: 2 } },
  { id: "sternenpfad_2019", titel: "Sternenpfad", originaltitel: "Starpath", jahr: 2019, typ: "film",
    quelle: "kino", kategorie: "daemlich_aber_herrlich", genre: ["sci-fi"], tags: ["weltenbau"],
    bewertung: { wie: 5, was: 3, warum: 3 }, franchise: ["Kosmoswacht Saga"] },
];
const KINO_MATCHES = { matched: [], rest: [] };
const STREAMING_BEKANNT = { titel: [] };
const STREAMING_ENTDECKEN = { titel: [] };

/* G0 — Regression der globalen Suche: Der konkrete Fehler trat auf, obwohl
   der Titel sichtbar im Entdecken-Katalog lag. Ein fremder Seitenkontext darf
   ihn nur nach hinten sortieren, niemals aus dem Ergebnis entfernen. */
const VALHALLA_ENTDECKEN = { titel: [{
  watchmode_id: 90125, titel: "Valhalla Rising", originaltitel: "Valhalla Rising",
  jahr: 2009, genres: ["drama"], dienste: ["Paramount+ (via Amazon Prime)"], relevanz: 4,
}] };
const valhallaAntwort = erstelleFinderAntwort({
  text: "Valhalla Rising", bevorzugterBereich: "kino", master: MASTER,
  kinoMatches: KINO_MATCHES, streamingBekannt: STREAMING_BEKANNT,
  streamingEntdecken: VALHALLA_ENTDECKEN, artikel: [],
});
const valhallaKompakt = kompakteFinderTreffer(valhallaAntwort, "kino");
check("G0", "globale Suche findet Valhalla Rising trotz fremdem Seitenkontext", () =>
  valhallaAntwort.entdecken.length === 1
  && valhallaKompakt.items.some((item) => item.titel === "Valhalla Rising" && item.bereich === "streaming"));
const streamingPriorisiert = kompakteFinderTreffer({
  ...valhallaAntwort,
  treffer: [{ film: MASTER[0], herkunft: { streaming: null, kino: null } }],
}, "streaming");
check("G0", "aktuelle Seite priorisiert nur die Reihenfolge und behält Fallback-Treffer", () =>
  streamingPriorisiert.items[0]?.titel === "Valhalla Rising"
  && streamingPriorisiert.items.some((item) => item.titel === "Nacht der Glut"));
const kinoAusStreamingKontext = kompakteFinderTreffer({
  ...valhallaAntwort,
  entdecken: [],
  treffer: [{ film: MASTER[0], herkunft: { streaming: null, kino: { kinos: ["Filmcasino"] } } }],
}, "streaming");
check("G0", "tatsächliche Kino-Herkunft schlägt einen fremden Streaming-Kontext", () =>
  kinoAusStreamingKontext.items[0]?.bereich === "kino"
  && kinoAusStreamingKontext.items[0]?.ref === MASTER[0].id);
const globalLeisteQuelle = fs.readFileSync(path.join(WURZEL, "src/components/GlobalSearchBar.jsx"), "utf8");
const appQuelle = fs.readFileSync(path.join(WURZEL, "src/App.jsx"), "utf8");
check("G0", "globale Leiste hat weder Bereichsauswahl noch Filterknopf", () =>
  !/<select/.test(globalLeisteQuelle) && !/globalsuche-filter|toggle-bereichsfilter/.test(globalLeisteQuelle));
check("G0", "globale Suche rendert ein eigenes Dialog-Ergebnis und öffnet Finder erst ausführlich", () =>
  /kd-globalsuche-antwort/.test(globalLeisteQuelle)
  && /oeffneAusfuehrlicheSuche/.test(appQuelle)
  && /setGlobaleSuchantwort/.test(appQuelle));
check("G0", "globale Suche wartet auf den Vollkatalog und nutzt dessen direkte Antwort", () =>
  /await ladeStreamingDateienRef\.current\?\.\(true\)/.test(appQuelle)
  && /streamingEntdecken:\s*geladeneAnsichten\?\.entdecken/.test(appQuelle));

/* Zwei Sätze, die der deterministische Parser NICHT deuten kann — nur dann
   bietet die Oberfläche „Mit KI deuten" überhaupt an (E1). */
const UNKLAR = "blubbergrunzel schwibbelwatz";
const UNKLAR_2 = "knarzelpfusch";

/* =========================================================================
   HARNISCH — spielt App: Verlauf und Eingabe liegen HIER, der Tab wird
   bedingt gerendert (genau wie `{tab === "finder" && <FinderTab …/>}` in
   src/App.jsx Zeile 2229). Der Tab-Wechsel im Test ist derselbe Auf- und
   Abbau wie in der App, nicht eine Nachbildung davon.
   ========================================================================= */
const steuer = {};
function Harnisch() {
  const [tab, setTab] = useState("finder");
  const [verlauf, setVerlauf] = useState([]);
  const [eingabe, setEingabe] = useState("");
  steuer.setTab = setTab;
  steuer.verlauf = verlauf;
  steuer.setVerlauf = setVerlauf;
  steuer.setEingabe = setEingabe;
  if (tab !== "finder") return h("div", null, "ANDERER TAB");
  return h(FinderTab, {
    master: MASTER, kinoMatches: KINO_MATCHES,
    streamingBekannt: STREAMING_BEKANNT, streamingEntdecken: STREAMING_ENTDECKEN,
    mustwatchIds: new Set(), auswahl: [],
    verlauf, setVerlauf, eingabe, setEingabe,
    vokabular: [], saveVokabular: null,
  });
}

const wurzel = createRoot(document.getElementById("wurzel"));
await act(async () => { wurzel.render(h(Harnisch)); });

/* ------------------------------------------------------------- Bedienhilfen */
const knoepfe = () => [...document.querySelectorAll("button")];
const knopf = (text) => knoepfe().find((b) => b.textContent.includes(text));
const text = () => document.body.textContent;
/* Nach jedem Klick eine Makrotask-Runde: `deuteMitKi` ist async, und die Kette
   await runTask -> setVerlauf -> finally setKiLaeuft braucht mehrere
   Mikrotask-Ticks. Ohne dieses Ausruhen liefe eine schon aufgelöste Deutung
   erst irgendwann später zu Ende — mitten im nächsten Test. */
const ruhe = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const klick = async (b) => {
  if (!b) throw new Error("Knopf nicht gefunden");
  await act(async () => { b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await ruhe();
};
/* Einen hängenden Stub-Aufruf auflösen und die Folgekette zu Ende laufen lassen. */
const loeseAuf = async (wert) => { stub.aufloesen(wert); await ruhe(); };
const wertSetzer = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
const tippe = async (s) => {
  const feld = document.querySelector("input");
  await act(async () => {
    wertSetzer.call(feld, s);
    feld.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
};
const suche = async (s) => { await tippe(s); await klick(knopf("Suchen")); };
const leere = async () => { await act(async () => { steuer.setVerlauf([]); steuer.setEingabe(""); }); };
/* Tab-Wechsel = Abbau, Rückkehr = Aufbau. Genau der Vorgang, an dem S6/S8 hingen. */
const tabWeg = async () => { await act(async () => { steuer.setTab("kino"); }); };
const tabHin = async () => { await act(async () => { steuer.setTab("finder"); }); };
const abUndAuf = async () => { await tabWeg(); await tabHin(); };
const deutenKnopf = () => knoepfe().find((b) => /Mit KI deuten|deutet …/.test(b.textContent));
const loeschKnopf = () => knoepfe().find((b) => /Neue Suche|KI-Deutung mitlöschen\?/.test(b.textContent));

/* Chip-Klasse aus dem DOM lesen. Der Tooltip (`title`) kommt nicht an — die
   Chip-Komponente in ui.jsx reicht ihn nicht an den Knopf durch (siehe
   Abschnitt F). Beobachtbar bleibt die Farbe des Klassen-Markers:
     hart       T.leinwandTief
     weich      T.wolfram
     ausschluss T.warum, zusätzlich das „− " im Marker
   T.wolfram und T.warum sind in BEIDEN Themes derselbe Wert, deshalb
   entscheidet über „ausschluss" das Minuszeichen, nicht die Farbe. */
const messFarbe = dom.window.document.createElement("i");
const alsRgb = (hex) => { messFarbe.style.color = hex; return messFarbe.style.color; };
const F_HART = alsRgb(T.leinwandTief), F_WEICH = alsRgb(T.wolfram);
const chips = () => knoepfe()
  .filter((b) => b.firstElementChild && b.firstElementChild.tagName === "SPAN" && /×$/.test(b.textContent.trim()))
  .map((b) => {
    const marker = b.firstElementChild;
    const label = b.textContent.replace(/^−\s*/, "").replace(/\s*×$/, "");
    const art = marker.textContent.includes("−") ? "ausschluss"
      : marker.style.color === F_HART ? "hart"
        : marker.style.color === F_WEICH ? "weich"
          : "unbekannt(" + marker.style.color + ")";
    return { label, art, knopf: b, titel: b.getAttribute("title") || "" };
  });
const chip = (teilLabel) => chips().find((c) => c.label.includes(teilLabel));
const chipArt = (teilLabel) => (chip(teilLabel) || {}).art;

/* =========================================================================
   G1 — DIE SPERRE GEGEN ZWEI BEZAHLTE DEUTUNGEN ÜBERLEBT DEN TAB-WECHSEL
   (Befund S6). Wahrheitswert liegt in der Modulvariablen `laufendeDeutung`;
   der State spiegelt sie nur und wird beim Aufbau daraus initialisiert.
   ========================================================================= */
/* Jeder Abschnitt läuft in seiner eigenen Funktion. Reisst einer ab (etwa weil
   eine Mutation einen Knopf entfernt hat), wird das als roter Check dieses
   Abschnitts vermerkt und die übrigen laufen weiter — ein roter Check darf
   nichts verdecken (Regel aus finder_test.mjs).
   ES-Module haben top-level await; die Abschnitte werden unten der Reihe nach
   abgearbeitet, die Reihenfolge bleibt also die des Textes. */
const ABSCHNITTE = [];
const abschnitt = (name, lauf) => ABSCHNITTE.push([name, lauf]);

abschnitt("G1", async () => {
console.log("\n--- G1: Sperre gegen zwei bezahlte Deutungen (S6) ---");
await leere();
zaehlerAuf();
stub.modus = "haengen";
await suche(UNKLAR);
check("G1", "unklare Anfrage bietet „Mit KI deuten" + '"' + " an (Angebot statt Automatik)",
  () => !!knopf("Mit KI deuten") && (steuer.verlauf[0].sig.nichtZugeordnet || []).length > 0);
check("G1", "vor dem Klick ist noch kein Aufruf passiert", stub.rufe.length === 0);

await klick(knopf("Mit KI deuten"));
check("G1", "ein Klick löst GENAU EINEN runTask aus", stub.rufe.length === 1);
check("G1", "der Aufruf geht an die Aufgabe intelligent-search und schickt nur den Satz + Wertelisten",
  () => stub.rufe[0].task === "intelligent-search"
    && stub.rufe[0].payload.suchsatz === UNKLAR
    && Object.keys(stub.rufe[0].payload).sort().join(",") === "listen,suchsatz");
check("G1", "während des Laufs: Knopf zeigt „deutet …" + '"' + " und ist gesperrt",
  () => deutenKnopf().textContent.trim() === "deutet …" && deutenKnopf().disabled === true);

/* Ein zweiter Verlaufseintrag darf während des Laufs ebenfalls nicht deuten:
   die Sperre gilt für den Pfad, nicht für den Eintrag. */
await suche(UNKLAR_2);
check("G1", "während des Laufs ist auch ein NEUER Eintrag nicht deutbar",
  () => knoepfe().filter((b) => /Mit KI deuten|deutet …/.test(b.textContent)).every((b) => b.disabled === true));
await klick(knoepfe().find((b) => b.textContent.includes("Mit KI deuten")));
check("G1", "Klick auf den gesperrten Zweitknopf löst keinen Aufruf aus", stub.rufe.length === 1);

/* Der Kern: Tab weg, Tab wieder her. Der State ist mit dem Abbau weg, der
   fetch läuft weiter. */
await abUndAuf();
check("G1", "[M1] nach Tab-Wechsel und Rückkehr ist der Deuten-Knopf WEITERHIN gesperrt",
  () => deutenKnopf() && deutenKnopf().disabled === true);
check("G1", "[M1] nach der Rückkehr zeigt der laufende Eintrag weiter „deutet …" + '"',
  () => knoepfe().some((b) => b.textContent.trim() === "deutet …"));
await klick(deutenKnopf());
check("G1", "[M1] Klick nach der Rückkehr löst KEINE zweite bezahlte Deutung aus (Zähler bleibt 1)",
  stub.rufe.length === 1);

/* Auflösen — die Sperre muss danach wieder offen sein, sonst wäre sie ein
   Dauerschloss und der Nutzer könnte nie mehr deuten. */
await loeseAuf({ ok: true, data: { harte_filter: { genres: ["horror"] } } });
check("G1", "die Deutung landet als ki am Verlaufseintrag", () => !!steuer.verlauf[0].ki);
check("G1", "die aufgelöste Deutung zieht keinen weiteren Aufruf nach sich", stub.rufe.length === 1);

/* F5 — genau hier bleibt die Sperre hängen. Der auflösende `finally` gehört zur
   Closure der ABGEBAUTEN Instanz: `laufendeDeutung` wird geleert, der
   State-Spiegel der neu aufgebauten Instanz nicht — die liest ihn nur beim
   Aufbau. Der Knopf bleibt gesperrt, bis der Nutzer noch einmal den Tab
   wechselt. Messung steht im Checknamen. */
const gesperrtNachLauf = (knoepfe().find((x) => x.textContent.includes("Mit KI deuten")) || {}).disabled;
check("F", "F5: nach Auflösung ist die Sperre OHNE erneuten Tab-Wechsel offen"
  + "  [gemessen: Deuten-Knopf disabled=" + gesperrtNachLauf + ", obwohl laufendeDeutung geleert ist]",
  () => gesperrtNachLauf === false);

/* Nach einem erneuten Aufbau liest die Komponente die Modulvariable neu — dann
   ist die Sperre nachweislich offen. Das belegt: geleert WURDE sie, nur der
   Spiegel hing. */
await abUndAuf();
check("G1", "nach erneutem Aufbau ist die Modulsperre offen (laufendeDeutung wurde geleert)",
  () => { const b = knoepfe().find((x) => x.textContent.includes("Mit KI deuten")); return !!b && b.disabled === false; });
stub.modus = "sofort";
stub.antwort = { ok: true, data: {} };
await klick(knoepfe().find((b) => b.textContent.includes("Mit KI deuten")));
check("G1", "danach ist ein NEUER Aufruf möglich (Zähler 2) — kein Dauerschloss", stub.rufe.length === 2);

/* =========================================================================
   G2 — FEHLERMELDUNG AM VERLAUFSEINTRAG, NICHT AN EINEM INDEX
   (Befunde S6 und S8).
   ========================================================================= */
});

abschnitt("G2", async () => {
console.log("\n--- G2: Fehlermeldung am Verlaufseintrag (S6/S8) ---");
const LIMIT_TEXT = "Das Nutzungslimit ist erreicht. Bitte später erneut versuchen.";
await leere();
zaehlerAuf();
stub.modus = "fehler";
stub.fehler = Object.assign(new Error("limit"), { code: "limit", name: "BoundaryError" });
await suche(UNKLAR);
const trefferVorher = JSON.stringify((steuer.verlauf[0].treffer || []).map((t) => t.film.id));
await klick(knopf("Mit KI deuten"));
check("G2", "Fehlschlag zeigt die Meldung aus errorText()", () => text().includes(LIMIT_TEXT));
check("G2", "die Meldung hängt am Verlaufseintrag (verlauf[0].kiFehler)",
  () => steuer.verlauf[0].kiFehler === LIMIT_TEXT);
check("G2", "die deterministische Antwort bleibt bei Fehler unangetastet",
  () => JSON.stringify((steuer.verlauf[0].treffer || []).map((t) => t.film.id)) === trefferVorher);
await abUndAuf();
check("G2", "[M2] die Meldung überlebt den Tab-Wechsel (der Nutzer erfährt weiter, warum es scheiterte)",
  () => text().includes(LIMIT_TEXT) && steuer.verlauf[0].kiFehler === LIMIT_TEXT);

/* Ein zweiter Eintrag darf die Meldung des ersten nicht tragen. */
await suche(UNKLAR_2);
check("G2", "ein NEUER Eintrag trägt keine Meldung, der alte behält seine",
  () => steuer.verlauf.length === 2 && steuer.verlauf[0].kiFehler === LIMIT_TEXT
    && !steuer.verlauf[1].kiFehler);
check("G2", "die Meldung steht genau EINMAL im Bild (nicht an beiden Einträgen)",
  () => text().split(LIMIT_TEXT).length - 1 === 1);

/* Der scharfe Fall aus S8: Verlauf leeren, neu suchen — der neue Eintrag
   bekommt DENSELBEN Index wie der gescheiterte und darf dessen Meldung nicht
   erben. Er wurde nie gedeutet. */
await klick(loeschKnopf());
check("G2", "„Neue Suche" + '"' + " nimmt die Meldung mit (Verlauf leer, kein Rest im Bild)",
  () => steuer.verlauf.length === 0 && !text().includes(LIMIT_TEXT));
await suche(UNKLAR_2);
check("G2", "[M2] neue Suche am selben Index erbt die alte Meldung NICHT",
  () => steuer.verlauf.length === 1 && !steuer.verlauf[0].kiFehler && !text().includes(LIMIT_TEXT));

/* Erfolg löscht die Meldung des Eintrags. */
await leere();
await suche(UNKLAR);
await klick(knopf("Mit KI deuten"));
check("G2", "Vorbedingung: Meldung steht am Eintrag", () => steuer.verlauf[0].kiFehler === LIMIT_TEXT);
stub.modus = "sofort";
stub.antwort = { ok: true, data: { interpretation_klartext: "jetzt hat es geklappt" } };
await klick(knopf("Mit KI deuten"));
check("G2", "eine erfolgreiche Deutung löscht die Meldung des Eintrags",
  () => steuer.verlauf[0].kiFehler === null && !text().includes(LIMIT_TEXT)
    && text().includes("jetzt hat es geklappt"));

/* =========================================================================
   G3 — „NEUE SUCHE" WIRFT EINE BEZAHLTE DEUTUNG NICHT MEHR OHNE NACHFRAGE WEG
   (Befund S7). Zweistufig NUR, wenn eine KI-Deutung im Verlauf steht.
   ========================================================================= */
});

abschnitt("G3", async () => {
console.log("\n--- G3: Neue Suche zweistufig, nur bei bezahlter Deutung (S7) ---");
await leere();
check("G3", "leerer Verlauf: kein Löschknopf", () => !loeschKnopf());

/* Weg 1: ohne Deutung genügt ein Klick. */
await suche("horror");
check("G3", "ohne KI-Deutung heißt der Knopf „Neue Suche" + '"',
  () => loeschKnopf().textContent.trim() === "Neue Suche"
    && loeschKnopf().getAttribute("title") === "Verlauf leeren, neue Suche beginnen");
await klick(loeschKnopf());
check("G3", "ohne KI-Deutung löscht EIN Klick (keine Rückfrage im Weg)", () => steuer.verlauf.length === 0);

/* Weg 2 + 3: mit Deutung erst Rückfrage, dann löschen. */
stub.modus = "sofort";
stub.antwort = { ok: true, data: { harte_filter: { genres: ["horror"] }, interpretation_klartext: "bezahlt gedeutet" } };
await suche(UNKLAR);
await klick(knopf("Mit KI deuten"));
check("G3", "Vorbedingung: eine bezahlte Deutung steht im Verlauf", () => !!steuer.verlauf[0].ki);
await klick(loeschKnopf());
check("G3", "[M3] mit KI-Deutung löscht der ERSTE Klick NICHT", () => steuer.verlauf.length === 1 && !!steuer.verlauf[0].ki);
check("G3", "[M3] der Knopftext wechselt auf „KI-Deutung mitlöschen?" + '"',
  () => loeschKnopf().textContent.trim() === "KI-Deutung mitlöschen?"
    && /bezahlten KI-Deutung/.test(loeschKnopf().getAttribute("title") || ""));
await klick(loeschKnopf());
check("G3", "der ZWEITE Klick löscht", () => steuer.verlauf.length === 0);

/* Weg 4: eine neue Suche zwischen den Klicks setzt die Rückfrage zurück. */
await suche(UNKLAR);
await klick(knopf("Mit KI deuten"));
await klick(loeschKnopf());
check("G3", "Vorbedingung: Rückfrage steht", () => loeschKnopf().textContent.trim() === "KI-Deutung mitlöschen?");
await suche("horror");
check("G3", "[M3] eine neue Suche setzt die Rückfrage zurück (Text wieder „Neue Suche" + '")',
  () => steuer.verlauf.length === 2 && loeschKnopf().textContent.trim() === "Neue Suche");
await klick(loeschKnopf());
check("G3", "[M3] nach dem Zurücksetzen löscht der nächste Klick nicht sofort — er fragt erneut",
  () => steuer.verlauf.length === 2 && loeschKnopf().textContent.trim() === "KI-Deutung mitlöschen?");
await klick(loeschKnopf());
check("G3", "und der darauf folgende Klick löscht", () => steuer.verlauf.length === 0);

/* =========================================================================
   G4 — CHIP-KLASSEN UND ABWÄHLBARKEIT
   Abnahmekriterium „Filter sind sichtbar und änderbar". Der Reihen-Chip war
   als „weich — sortiert nur um" ausgezeichnet, schränkt aber ein
   (sucheFinder: `if (!istTitelTreffer && !treff.length) continue;`).
   ========================================================================= */
});

abschnitt("G4", async () => {
console.log("\n--- G4: Chip-Klassen (hart/weich/ausschluss) und Abwählbarkeit ---");
await leere();
/* Harte Signale. „ab 1990 bis 2020" wird als Bereich gelesen -> beide Grenzen. */
await suche("horror solide 80er dvd heute ab 1990 bis 2020");
check("G4", "hart: Genre", () => chipArt("Genre: horror") === "hart");
check("G4", "hart: Kategorie", () => chipArt("sehenswert") === "hart");
check("G4", "hart: Jahrzehnt", () => chipArt("1980er") === "hart");
check("G4", "hart: Quelle", () => chipArt("Quelle: dvd") === "hart");
check("G4", "hart: Zeit", () => chipArt("heute") === "hart");
check("G4", "hart: genannte Untergrenze", () => chipArt("ab 1990") === "hart");
check("G4", "hart: genannte Obergrenze", () => chipArt("bis 2020") === "hart");

await leere();
await suche("stylisch spannend");
check("G4", "weich: Achse (sortiert nur um)", () => chipArt("WIE-lastig") === "weich");
check("G4", "weich: Stimmung (sortiert nur um)", () => chipArt("Stimmung: spannend") === "weich");

await leere();
await suche("kein drama ohne 70er nicht spannend nicht stylisch kein sehenswert");
check("G4", "ausschluss: Genre", () => chipArt("ohne drama") === "ausschluss");
check("G4", "ausschluss: Jahrzehnt", () => chipArt("ohne 1970er") === "ausschluss");
check("G4", "ausschluss: Stimmungsabschlag", () => chipArt("nicht spannend") === "ausschluss");
check("G4", "ausschluss: Achsenabschlag", () => chipArt("nicht WIE-lastig") === "ausschluss");
check("G4", "ausschluss: Kategorie", () => chipArt("ohne sehenswert") === "ausschluss");
check("G4", "Ausschluss-Chips tragen das Minuszeichen als Vorzeichen",
  () => chips().filter((c) => c.art === "ausschluss").every((c) => /^−/.test(c.knopf.textContent.trim())));

await leere();
await suche("was neues");
check("G4", "hart: Entdecken (schränkt die Menge auf den ungeprüften Katalog ein)",
  () => chipArt("Entdecken (ungeprüft)") === "hart");

await leere();
await suche("Nacht der Glut");
check("G4", "hart: Titel", () => chipArt("Titel: Nacht der Glut") === "hart");

/* DER FIX: Reihe, Franchise und Regie sind harte Filter. Alle drei Typen,
   weil jeder ein eigenes Label baut und ein Umschreiben leicht einen
   vergisst. */
await leere();
await suche("kosmoswacht");
check("G4", "[M4] hart: Franchise — ein Reihen-Signal schränkt die Treffer ein",
  () => chipArt("Franchise: Kosmoswacht Saga") === "hart");
await leere();
await suche("glutnacht");
check("G4", "[M4] hart: Reihe", () => chipArt("Reihe: Glutnacht Zyklus") === "hart");
await leere();
await suche("vendtberg");
check("G4", "[M4] hart: Regie", () => chipArt("Regie: Orla Vendtberg") === "hart");
check("G4", "der Reihen-Chip sagt die Wahrheit: das Signal siebt aus (nur der Film der Reihe bleibt)",
  () => steuer.verlauf[0].treffer.map((t) => t.film.id).join(",") === "nacht_der_glut_1984");

/* Abwählbarkeit: der Klick muss die Suche NEU RECHNEN, nicht nur den Chip
   verstecken. Nachgewiesen an einem Fall, in dem das Ergebnis messbar kippt. */
await leere();
await suche("horror");
const trefferMitGenre = steuer.verlauf[0].treffer.map((t) => t.film.id);
await klick(chip("Genre: horror").knopf);
check("G4", "Abwählen entfernt das Signal", () => steuer.verlauf[0].sig.genres.length === 0);
check("G4", "Abwählen rechnet die Suche neu (mit Genre 1 Treffer, ohne Signal 0)",
  () => trefferMitGenre.join(",") === "nacht_der_glut_1984" && steuer.verlauf[0].treffer.length === 0);
check("G4", "der abgewählte Chip ist verschwunden", () => !chip("Genre: horror"));

/* Jahresgrenzen einzeln — auch die aus einer Stimmung abgeleitete. */
await leere();
await suche("oldschool horror");
check("G4", "Stimmung setzt eine Jahresgrenze, die als eigener Chip erscheint",
  () => chipArt("bis 1989") === "hart" && !!chip("Stimmung: oldschool"));
await klick(chip("bis 1989").knopf);
check("G4", "die aus der Stimmung abgeleitete Grenze ist EINZELN abwählbar — die Stimmung bleibt",
  () => !chip("bis 1989") && !!chip("Stimmung: oldschool")
    && steuer.verlauf[0].sig.jahrUnterdrueckt.max === true
    && steuer.verlauf[0].sig.jahrMax == null);
await leere();
await suche("horror ab 1970 bis 2020");
await klick(chip("bis 2020").knopf);
check("G4", "genannte Grenzen sind je Seite einzeln abwählbar",
  () => !chip("bis 2020") && !!chip("ab 1970")
    && steuer.verlauf[0].sig.jahrMax == null && steuer.verlauf[0].sig.jahrMin === 1970);

/* Jeder Chip ist abwählbar — reihum, nicht nur an Einzelbeispielen. */
await leere();
const MISCH = "horror solide 80er dvd heute ab 1990 stylisch spannend kein drama ohne 70er";
await suche(MISCH);
const mischLabels = chips().map((c) => c.label);
check("G4", "Mischanfrage erzeugt Chips aller drei Klassen",
  () => new Set(chips().map((c) => c.art)).size === 3 && mischLabels.length >= 10);
let alleAbwaehlbar = true;
const nichtAbwaehlbar = [];
for (const label of mischLabels) {
  await leere();
  await suche(MISCH);
  const c = chip(label);
  if (!c) { alleAbwaehlbar = false; nichtAbwaehlbar.push(label + " (nicht gefunden)"); continue; }
  await klick(c.knopf);
  if (chip(label)) { alleAbwaehlbar = false; nichtAbwaehlbar.push(label); }
}
check("G4", "JEDER Chip der Mischanfrage ist abwählbar (" + mischLabels.length + " Chips)", () => {
  for (const l of nichtAbwaehlbar) console.log("    NICHT ABWÄHLBAR: " + l);
  return alleAbwaehlbar;
});

/* =========================================================================
   G5 — DIE 300-ZEICHEN-GRENZE GREIFT VOR DEM BEZAHLEN
   ========================================================================= */
});

abschnitt("G5", async () => {
console.log("\n--- G5: Längengrenze vor dem Bezahlen ---");
await leere();
zaehlerAuf();
stub.modus = "sofort";
stub.antwort = { ok: true, data: {} };
const LANG = "blubbergrunzel schwibbelwatz knarzelpfusch ".repeat(8).trim();
check("G5", "Vorbedingung: der Satz ist länger als 300 Zeichen (" + LANG.length + ")", LANG.length > 300);
await suche(LANG);
await klick(knopf("Mit KI deuten"));
check("G5", "zu langer Satz: runTask wird GAR NICHT gerufen (nichts bezahlt)", stub.rufe.length === 0);
check("G5", "die Meldung nennt die tatsächliche Zeichenzahl und die Grenze",
  () => { const m = steuer.verlauf[0].kiFehler || ""; return m.includes(String(LANG.length)) && m.includes("300"); });
check("G5", "die Meldung steht am Verlaufseintrag und im Bild",
  () => !!steuer.verlauf[0].kiFehler && text().includes(String(LANG.length)));
check("G5", "die Meldung redet nicht von einer ungültigen Serverantwort — sie benennt die Eingabe",
  () => !/ungültige Antwort/i.test(steuer.verlauf[0].kiFehler || ""));

/* Grenze ist „größer als 300", nicht „ab 300": genau 300 muss durchgehen,
   sonst wäre ein erlaubter Satz still gesperrt.
   Nebenbefund, bewusst NICHT als Forderung geführt: der Endpunkt zählt NACH dem
   Einziehen von Leerraum (`replace(/\s+/g, " ")`, ai-task/index.ts Zeile 668),
   der Client zählt den rohen, getrimmten Satz. Der Client ist damit strenger —
   ein Satz mit viel Leerraum wird abgewiesen, den der Endpunkt genommen hätte.
   Die Richtung ist die sichere (es wird nie umsonst bezahlt); wer es genau will,
   spiegelt die Normalisierung. */
await leere();
zaehlerAuf();
const GRENZE = ("blubbergrunzel schwibbelwatz ".repeat(11) + "x".repeat(300)).slice(0, 300);
check("G5", "Vorbedingung: Satz mit genau 300 Zeichen", GRENZE.length === 300);
await suche(GRENZE);
await klick(knopf("Mit KI deuten"));
check("G5", "genau 300 Zeichen werden gedeutet (die Grenze selbst ist erlaubt)", stub.rufe.length === 1);

/* =========================================================================
   G6 — ROBUSTHEIT GEGEN DIE ANTWORT DES ENDPUNKTS
   sigAusSchema bekommt Modellausgabe als Rohmaterial. Ein Absturz war schon
   einmal real (TypeError: s.toLowerCase is not a function). Deshalb eine
   Schleife über Formen, keine Einzelbeispiele.
   ========================================================================= */
});

abschnitt("G6", async () => {
console.log("\n--- G6: Robustheit gegen jede Antwortform ---");
const FORMEN = [
  ["Antwort ist null", null],
  ["Antwort ohne data", { ok: true }],
  ["data ist null", { ok: true, data: null }],
  ["data ist leeres Objekt", { ok: true, data: {} }],
  ["data ist eine Zahl", { ok: true, data: 42 }],
  ["data ist eine Zeichenkette", { ok: true, data: "kaputt" }],
  ["data ist eine Liste", { ok: true, data: [] }],
  ["harte_filter ist null", { ok: true, data: { harte_filter: null } }],
  ["harte_filter ist eine Liste", { ok: true, data: { harte_filter: [] } }],
  ["harte_filter ist eine Zahl", { ok: true, data: { harte_filter: 7 } }],
  ["Genres: Zahl, Objekt, null und ein gültiger Wert gemischt", { ok: true, data: { harte_filter: { genres: [42, {}, null, "horror"] } } }],
  ["Genres sind keine Liste", { ok: true, data: { harte_filter: { genres: "horror" } } }],
  ["Titel: Zahl, Objekt und ein echter Titel", { ok: true, data: { harte_filter: { titel: [7, { t: "x" }, "Sternenpfad"] } } }],
  ["Reihen ohne name / mit Zahl als name / als Zeichenkette", { ok: true, data: { harte_filter: { reihen: [{ typ: "regie" }, { name: 5 }, "text", null] } } }],
  ["Reihen am alten Ort (weiche_wuensche)", { ok: true, data: { weiche_wuensche: { reihen: [{ typ: "franchise", name: "Kosmoswacht Saga" }] } } }],
  ["Dekaden als Text, krumme Zahl, null, Objekt", { ok: true, data: { harte_filter: { dekaden: ["1980", 1985, null, {}] } } }],
  ["Jahre als Text und widersprüchlich (ab 2010, bis 1995)", { ok: true, data: { harte_filter: { jahrMin: "2010", jahrMax: "1995" } } }],
  ["Stimmungen/Achsen mit Objekten und Zahlen", { ok: true, data: { weiche_wuensche: { stimmungen: [{}, 7, "kult"], achsen: [null, "wie"] } } }],
  ["Kategorien/Quellen/Zeit mit Zahlen und Objekten", { ok: true, data: { harte_filter: { kategorien: [3], quellen: [{}], zeit: [null, "heute"] } } }],
  ["nicht_unterstuetzt ist eine Zeichenkette statt einer Liste", { ok: true, data: { nicht_unterstuetzt: "gar keine Liste" } }],
  ["nicht_unterstuetzt: Zeichenketten, null, Zahlen, halbe Objekte", { ok: true, data: { nicht_unterstuetzt: ["nach Laufzeit", null, 5, { grund: "x" }, { wunsch: "nach Sprache", grund: 7 }] } }],
  ["nicht_unterstuetzt ist ein Objekt", { ok: true, data: { nicht_unterstuetzt: { wunsch: "x" } } }],
  ["ausschluesse mit Unsinn", { ok: true, data: { ausschluesse: { genres: [{}, "horror"], dekaden: ["1970", 7] } } }],
  ["interpretation_klartext ist eine Zahl", { ok: true, data: { interpretation_klartext: 42 } }],
  ["entdecken ist eine Zeichenkette", { ok: true, data: { entdecken: "ja" } }],
  ["das Modell liefert Treffer statt Filter (Fremdfelder)", { ok: true, data: { treffer: [{ titel: "erfunden" }], foo: 1 } }],
  ["alle Abschnitte auf einmal, alle vermüllt", { ok: true, data: {
    harte_filter: { genres: [1, null], kategorien: "immer_gut", dekaden: {}, titel: 5, reihen: 9, jahrMin: "ja", jahrMax: [] },
    weiche_wuensche: { stimmungen: null, achsen: 3, reihen: "x" },
    ausschluesse: 7, nicht_unterstuetzt: 1, interpretation_klartext: {}, entdecken: 1,
  } }],
];
stub.modus = "sofort";
const abstuerze = [];
for (const [name, antwort] of FORMEN) {
  await leere();
  stub.antwort = antwort;
  let ausnahme = null;
  try {
    await suche(UNKLAR);
    await klick(knopf("Mit KI deuten"));
    /* Der Chip-Klick gehört dazu: ein von der KI gebautes Signalobjekt kann ein
       Feld gar nicht haben, und `toggleSignal` greift dann ins Leere. */
    for (const c of chips()) { await klick(c.knopf); break; }
  } catch (e) { ausnahme = e; }
  const heil = !ausnahme && !!steuer.verlauf[0] && !!steuer.verlauf[0].ki
    && text().includes("Deterministische Suche");
  if (!heil) abstuerze.push(name + (ausnahme ? " — " + ausnahme.message : " — Oberfläche nicht heil"));
  check("G6", "Antwortform überlebt: " + name, heil);
}
check("G6", "keine Antwortform hat die Oberfläche abgerissen (" + FORMEN.length + " Formen)", () => {
  for (const a of abstuerze) console.log("    ABSTURZ: " + a);
  return abstuerze.length === 0;
});

/* Zwei Formen mit inhaltlicher Erwartung — Robustheit heißt nicht „still
   verschlucken": was nicht auflösbar ist, muss benannt werden. */
await leere();
stub.antwort = { ok: true, data: { harte_filter: { titel: [7, { t: "x" }, "Sternenpfad", "Gibt Es Nicht"] } } };
await suche(UNKLAR);
await klick(knopf("Mit KI deuten"));
check("G6", "aufgelöster Titel wird Filter, unauflösbarer wird als „nicht in deinen Daten" + '"' + " benannt",
  () => steuer.verlauf[0].sig.titel.length === 1
    && steuer.verlauf[0].sig.titel[0].id === "sternenpfad_2019"
    && steuer.verlauf[0].ki.nichtInDaten.some((e) => e.art === "titel" && e.name === "Gibt Es Nicht")
    && text().includes("Nicht in deinen Daten"));
await leere();
stub.antwort = { ok: true, data: { harte_filter: { genres: ["horror"], jahrMin: "2010", jahrMax: "1995" } } };
await suche(UNKLAR);
await klick(knopf("Mit KI deuten"));
check("G6", "widersprüchliches Jahrespaar fällt weg, wird benannt, die übrigen Filter bleiben",
  () => steuer.verlauf[0].sig.jahrMin == null && steuer.verlauf[0].sig.jahrMax == null
    && steuer.verlauf[0].sig.genres.length === 1
    && steuer.verlauf[0].ki.nichtInDaten.some((e) => e.art === "jahr"));
await leere();
stub.antwort = { ok: true, data: { nicht_unterstuetzt: ["nach Laufzeit", { wunsch: "nach Sprache", grund: "kein Feld" }] } };
await suche(UNKLAR);
await klick(knopf("Mit KI deuten"));
check("G6", "nicht umsetzbare Wünsche werden sichtbar gemacht, auch die als reine Zeichenkette",
  () => text().includes("Nicht umsetzbar") && text().includes("nach Laufzeit") && text().includes("nach Sprache"));

});

/* =========================================================================
   G7 — DER KI-SCHALTER: DIE GEGENRICHTUNG
   Alles oben prüft den KI-Pfad bei KI=AN. Hier steht die eigentliche Zusage
   von Phase 2: Bei KI=AUS existiert der Knopf NICHT — und es entsteht KEIN
   einziger Aufruf. Ausblenden statt erklären: `ai-disabled` aus
   services/errors.js wäre die falsche Meldung, die heißt „der Betreiber hat
   abgeschaltet", nicht „du hast abgeschaltet".
   Der Schalter wird zwischen den Fällen umgesetzt und der Tab ab- und wieder
   aufgebaut — genau der Vorgang, den die App beim Wechsel in die
   Einstellungen und zurück ausführt.
   ========================================================================= */
abschnitt("G7", async () => {
console.log("\n--- G7: KI-Schalter, Gegenrichtung ---");

/* Ein unklarer Satz steht im Verlauf: Bei KI=an gäbe es den Knopf hier
   garantiert — das ist die Eichung, ohne die alle Aus-Fälle wertlos wären. */
const AUS_FAELLE = [
  ["global aus", { global: false, funktionen: {}, gefragtAm: "2026-07-27T22:00:00.000Z" }, KS.KI_WAHL_VERSION],
  ["global an, `suche` einzeln abgewählt", { global: true, funktionen: { suche: false }, gefragtAm: "2026-07-27T22:00:00.000Z" }, KS.KI_WAHL_VERSION],
  ["gar keine Wahl getroffen (Topf fehlt)", null, null],
  ["Topf da, aber global null", { global: null, funktionen: {}, gefragtAm: null }, KS.KI_WAHL_VERSION],
  ["kaputtes JSON im Topf", "@@KAPUTT@@", KS.KI_WAHL_VERSION],
];

for (const [name, stand, marke] of AUS_FAELLE) {
  await leere();
  zaehlerAuf();
  kiAnSetzen();
  await suche(UNKLAR);
  const eichung = !!knopf("Mit KI deuten");
  /* Umschalten und den Tab neu aufbauen — wie nach einem Besuch der
     Einstellungen. */
  if (stand === "@@KAPUTT@@") { dom.window.localStorage.setItem("kd:ki", "{kein json"); dom.window.localStorage.setItem("kd:ki-version", marke); }
  else kiStand(stand, marke);
  await abUndAuf();
  check("G7", "Eichung für „" + name + "“: bei KI=an ist der Knopf da", eichung === true);
  check("G7", "KI=aus (" + name + "): der Knopf EXISTIERT NICHT",
    () => !knopf("Mit KI deuten") && !knoepfe().some((b) => /Mit KI deuten|deutet …/.test(b.textContent)));
  check("G7", "KI=aus (" + name + "): kein einziger runTask  [gemessen: " + stub.rufe.length + "]",
    stub.rufe.length === 0);
  /* Und die deterministische Suche bleibt vollwertig — der Finder verliert
     keine Funktion, er verliert nur das Angebot. */
  check("G7", "KI=aus (" + name + "): der Verlauf und die deterministische Deutung stehen weiter",
    () => steuer.verlauf.length === 1 && steuer.verlauf[0].frage === UNKLAR && !!steuer.verlauf[0].sig);
  check("G7", "KI=aus (" + name + "): es erscheint auch KEIN Erklärtext statt des Knopfes",
    () => !/ai-disabled|KI ist ausgeschaltet|nicht verfügbar|abgeschaltet/i.test(text()));
}

/* Die Versionsmarke: eine Wahl aus einem früheren Dialog darf nicht
   weitergelten. Dieser Fall ist HEUTE ROT — siehe Abschnitt F (F6). Er steht
   deshalb dort und nicht hier, damit die Kette grün bleibt und der Befund
   trotzdem nicht verschwindet. */

/* Zurück auf den Normalzustand dieser Suite. */
await leere();
zaehlerAuf();
kiAnSetzen();
await abUndAuf();
await suche(UNKLAR);
check("G7", "nach dem Zurückschalten auf KI=an ist der Knopf wieder da",
  () => !!knopf("Mit KI deuten"));
check("G7", "und ein Klick löst wieder genau einen Aufruf aus",
  () => { const vorher = stub.rufe.length; return vorher === 0; });
await klick(knopf("Mit KI deuten"));
check("G7", "der wiederhergestellte Pfad funktioniert vollständig", stub.rufe.length === 1);
});

/* =========================================================================
   F — FORDERUNGEN AN DIE IMPLEMENTIERUNG
   Diese Checks sind heute rot. Sie stehen hier, damit die Befunde nicht in
   einem Bericht verschwinden, und zählen NICHT in den Exit-Code.
   ========================================================================= */
abschnitt("F", async () => {
console.log("\n--- F: Forderungen (heute offen, nicht exit-relevant) ---");

/* F1 — Der Tooltip jedes Signal-Chips ist nicht beobachtbar: `Chip` in
   src/components/ui.jsx (Zeile 52) nimmt kein `title` an und reicht es nicht
   an den <button> durch. SignalChips übergibt für jede Klasse einen eigenen
   Tooltip; keiner erreicht das DOM. Betroffen ist auch der „merken"-Chip. */
await leere();
await suche("horror stylisch kein drama");
check("F", "F1: jeder Signal-Chip trägt seinen Tooltip im DOM (Chip reicht `title` durch)",
  () => chips().length > 0 && chips().every((c) => c.titel.length > 0));
check("F", "F1a: der harte Chip nennt seine Wirkung im Tooltip",
  () => (chip("Genre: horror") || {}).titel === "Harter Filter — schränkt die Treffer ein");

/* F2 — Die Klassen weich und ausschluss sind farblich nicht unterscheidbar:
   T.wolfram und T.warum sind in beiden Themes derselbe Wert (#E3A63B dunkel,
   #B07E1F hell). Unterscheidbar bleibt allein das Minuszeichen. */
check("F", "F2: die drei Chip-Klassen haben drei verschiedene Farben (T.wolfram ≠ T.warum)",
  () => T.wolfram !== T.warum);

/* F3 — Die vierte Klasse „info" aus dem Kommentarkopf von SignalChips gibt es
   nicht: kein Chip benutzt sie, `farbe.info` ist undefiniert und der
   Tooltip-Ternär bildet alles, was nicht hart/weich ist, auf „Ausschluss" ab.
   Ein künftiger info-Chip wäre damit still als Ausschluss beschriftet. */
check("F", "F3: eine Signalart „info" + '"' + " existiert und ist von „ausschluss" + '"' + " unterscheidbar",
  () => false);

/* F4 — Der Erfolgspfad der Deutung heftet sich weiter an einen INDEX. Fix 2
   hat die Fehlermeldung vom Index gelöst, `setVerlauf(v => v.map((x,i) =>
   i === idx ? …))` in deuteMitKi ist aber geblieben. Messung unten: die
   bezahlte Deutung von Satz A landet am Verlaufseintrag von Satz B. */
await leere();
zaehlerAuf();
stub.modus = "haengen";
await suche(UNKLAR);                       // Eintrag 0: "blubbergrunzel schwibbelwatz"
await klick(knopf("Mit KI deuten"));       // Aufruf läuft, Sperre greift
await klick(loeschKnopf());                // "Neue Suche": Verlauf leer (noch keine ki -> ein Klick)
await suche(UNKLAR_2);                     // Eintrag 0 ist jetzt "knarzelpfusch"
const labelWaehrendLauf = deutenKnopf() ? deutenKnopf().textContent.trim() : "(kein Knopf)";
await loeseAuf({ ok: true, data: { harte_filter: { genres: ["horror"] }, interpretation_klartext: "gedeutet aus " + UNKLAR } });
const fremdeDeutung = steuer.verlauf[0] && steuer.verlauf[0].ki
  && steuer.verlauf[0].frage === UNKLAR_2
  && steuer.verlauf[0].ki.klartext.includes(UNKLAR);
check("F", "F4: eine laufende Deutung landet nicht am falschen Verlaufseintrag, wenn der Verlauf sich ändert"
  + "  [gemessen: Eintrag „" + (steuer.verlauf[0] || {}).frage + "“ trägt die Deutung von „" + UNKLAR + "“]",
  () => !fremdeDeutung);
check("F", "F4a: ein nie gedeuteter Eintrag zeigt nicht „deutet …" + '"'
  + "  [gemessen: „" + labelWaehrendLauf + "“ am Eintrag „" + UNKLAR_2 + "“]",
  () => labelWaehrendLauf !== "deutet …");

/* F6 — `kiAn()` PRÜFT DIE VERSIONSMARKE NICHT. `wahlBestaetigt()` verlangt
   sie, `kiAn()` — die Funktion, die die ganze App fragt — liest
   `kd:ki-version` nie. Eine „mit KI"-Wahl aus einem früheren Build wirkt
   damit weiter, obwohl der Modulkopf ausdrücklich sagt: „Nur eine Wahl, die
   im aktuellen Dialog bewusst getroffen wurde, zählt. Ein alter Wert aus
   einem früheren Build darf die ausdrücklich verlangte Entscheidung nicht
   für immer überspringen."
   Wirkung hier sichtbar: veraltete Marke → der Knopf ist trotzdem da, der
   Nutzer kann bezahlen, bevor er den neuen Dialog gesehen hat. */
await leere();
zaehlerAuf();
kiStand({ global: true, funktionen: {}, gefragtAm: "2026-01-01T00:00:00.000Z" }, "e6-alte-marke");
await abUndAuf();
await suche(UNKLAR);
const knopfTrotzAlterMarke = !!knopf("Mit KI deuten");
check("F", "F6: eine Wahl mit VERALTETER Versionsmarke schaltet die KI nicht frei"
  + "  [gemessen: Knopf vorhanden = " + knopfTrotzAlterMarke + "]",
  () => !knopfTrotzAlterMarke);
kiStand({ global: true, funktionen: {}, gefragtAm: "2026-01-01T00:00:00.000Z" }, null);
await abUndAuf();
const knopfOhneMarke = !!knopf("Mit KI deuten");
check("F", "F6a: eine Wahl OHNE Versionsmarke ebenso"
  + "  [gemessen: Knopf vorhanden = " + knopfOhneMarke + "]",
  () => !knopfOhneMarke);
kiAnSetzen();
await abUndAuf();
stub.modus = "sofort";

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
  G0: "Globale Mehrbereichssuche und Popup-Übergabe",
  G1: "Sperre gegen zwei bezahlte Deutungen (S6)",
  G2: "Fehlermeldung am Verlaufseintrag (S6/S8)",
  G3: "Neue Suche zweistufig (S7)",
  G4: "Chip-Klassen und Abwählbarkeit",
  G5: "300-Zeichen-Grenze vor dem Bezahlen",
  G6: "Robustheit gegen jede Antwortform",
  G7: "KI-Schalter, Gegenrichtung (Phase 2)",
};
/* Wache: Eine Gruppe, die es gibt, aber in TITEL fehlt, wuerde weder
   gezaehlt noch exit-relevant sein — ihre roten Checks verschwaenden
   lautlos. Genau das ist beim Einbau von G7 zunaechst passiert. */
const unbekannteGruppen = [...gruppen.keys()].filter((g) => g !== "F" && !TITEL[g]);
let ok = 0, schlecht = 0;
console.log("\n===========================================================");
console.log("Quelle:   " + path.relative(WURZEL, QUELL_DATEI) + (process.env.FINDERTAB_QUELLE ? "   (MUTATIONSLAUF)" : ""));
console.log("Bündel:   esbuild, " + bauDauer + " ms   ·   KI-Aufrufe: nur Stub, kein Netz");
for (const [g, t] of Object.entries(TITEL)) {
  const z = gruppen.get(g) || { ok: 0, rot: 0 };
  ok += z.ok; schlecht += z.rot;
  console.log(`${g}  ${(t + " ").padEnd(46, ".")} ${z.ok}/${z.ok + z.rot}`);
}
console.log(`\n${ok}/${ok + schlecht} Checks bestanden.`);
if (unbekannteGruppen.length) {
  console.log("\nFEHLER IM TEST: Gruppen ohne Eintrag in TITEL — nicht gezaehlt: " + unbekannteGruppen.join(", "));
}
if (rot.length) {
  console.log("\nROTE CHECKS:");
  for (const n of rot) console.log("  ✗ " + n);
}
console.log(`\nF  Forderungen an die Implementierung: ${okF}/${okF + rotF.length} erfüllt`
  + (rotF.length ? " — " + rotF.length + " offen:" : ""));
for (const n of rotF) console.log("  ○ " + n);
if (rotF.length) {
  console.log("  (Diese Befunde sind bewusst NICHT als grüner Check auf das Ist-Verhalten gepinnt");
  console.log("   und zählen nicht in den Exit-Code. FINDERTAB_FORDERUNG=1 schaltet sie scharf.)");
}
const streng = process.env.FINDERTAB_FORDERUNG === "1";
const fehlschlag = schlecht > 0 || unbekannteGruppen.length > 0 || (streng && rotF.length > 0);
console.log(fehlschlag ? "\nFINDERTAB-TEST: BEFUNDE OBEN" : "\nFINDERTAB-TEST BESTANDEN");
process.exit(fehlschlag ? 1 : 0);

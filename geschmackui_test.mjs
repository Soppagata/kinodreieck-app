/* Etappe 7, Phase 2c — Oberflächentest für das Geschmacksprofil
     src/components/GeschmackBereich.jsx    (neu, die einzige schreibende Stelle)
     src/components/GeschmackOnboarding.jsx (neu, der KI-freie Erhebungsweg)
     src/components/ProfilAnsicht.jsx       (neu, ansehen/korrigieren/löschen)
     src/tabs/DatenTab.jsx                  (geändert, Klappe „Geschmacksprofil")
   ===========================================================================
   WARUM DIESE DATEI EXISTIERT
   ---------------------------------------------------------------------------
   Die Zusage der Etappe lautet „ohne Zustimmung kein Profil", und sie gilt für
   die DATEN, nicht für die Anzeige. In Phase 1 war genau das schon einmal
   falsch gebaut (Befund P2: das Opt-in-Gate saß nur am Ausgang, `sammle` legte
   ohne Einwilligung ein vollständiges Profil an — und weil
   `kd:geschmacksprofil` in ACCOUNT_SYNC_KEYS steht, wären diese Signale auf den
   Server gewandert). Ein Test, der nur prüft, dass ein Knopf nicht sichtbar
   ist, hätte P2 nicht gefunden.

   Deshalb misst diese Datei das Gate an der SPEICHERSCHICHT: `GeschmackBereich`
   nimmt eine Prop `speicher` entgegen, die hier durch ein Doppel ersetzt wird,
   das jeden Lade-, Schreib- und Löschversuch mit Zeitpunkt und Nutzlast
   mitschreibt. „Kein Profil" heißt in dieser Datei nachweisbar: NULL
   Schreibversuche — nicht „kein Knopf".

   DER ZWEITE PRÜFSTOFF: DIE REIHENFOLGE
   ---------------------------------------------------------------------------
   Beim Widerruf begründet `GeschmackBereich` die Reihenfolge (erst löschen,
   dann den Vermerk auf „widerrufen" setzen) damit, dass sonst zwischendurch ein
   Profil MIT Inhalt und OHNE Einwilligung im Topf stünde — und genau der
   Zustand über den Sync zum Server wanderte. Ein Endergebnis-Test sieht diesen
   Zwischenstand nicht. Das Doppel schreibt deshalb nach JEDER Operation einen
   Schnappschuss des Topfes mit, und ein Wächter (Abschnitt I) prüft alle
   Schnappschüsse aller Abschnitte gegen die Zusage.

   WIE JSX UNTER NODE LAUFBAR WIRD
   ---------------------------------------------------------------------------
   Technik übernommen aus willkommen_test.mjs / findertab_test.mjs:
     * esbuild (steckt in vite, keine neue Abhängigkeit) bündelt VOR dem Test zu
       einem ESM-Modul — bündeln statt bloß übersetzen, weil der Baum über
       GeschmackOnboarding → DreieckRegler → ui.jsx/match.js weiterzieht und
       geschmack.js ein JSON mit Import-Attribut lädt.
     * react/react-dom bleiben EXTERN, sonst hätte das Bündel eine zweite
       React-Instanz und `act()` aus dem Testprozess griffe ins Leere.
     * Ausgabe unter node_modules/.cache/ — kein Artefakt im Repo.
     * `services/ai.js`, `services/auth.js` und `services/storage.js` werden
       beim Bündeln durch Stubs ERSETZT (Plugin, nicht Monkeypatching: die
       Dienste sind Modulkonstanten). Sie hängen an DatenTab, nicht am
       Geschmacksprofil. Damit ist ausgeschlossen, dass ein echter, bezahlter
       Aufruf stattfindet — der Netzpfad ist nicht bloß ungenutzt, er ist nicht
       im Bündel.
     * `src/lib/storage.js` bleibt ECHT (localStorage über JSDOM). Nur so lässt
       sich prüfen, dass der Bereich OHNE die `speicher`-Prop — also so, wie
       DatenTab ihn einhängt — genauso funktioniert.

   ZWEI BÜNDEL
   ---------------------------------------------------------------------------
   „echt"   — die Quellen wie im Repo.
   „altbau" — dieselben Quellen, aber `geschmack_schlagwoerter.json` um EINEN
              Eintrag ergänzt, dessen `art` das Modell nicht kennt. Das ist der
              Fall „Schlagwort aus einem alten Build": Der Chip wird angeboten,
              die Umrechnung muss ihn übergehen, und die Vorschau muss ihn
              NENNEN statt ihn still zu schlucken. Über die echte Datei ist der
              Fall nicht erreichbar; die Alternative wäre gewesen, ihn gar nicht
              zu prüfen.

   SIEBEN AUSTAUSCHBARE QUELLEN (Mutationsprobe)
   ---------------------------------------------------------------------------
       GESCHMACKBEREICH_QUELLE    src/components/GeschmackBereich.jsx
       GESCHMACKONBOARDING_QUELLE src/components/GeschmackOnboarding.jsx
       PROFILANSICHT_QUELLE       src/components/ProfilAnsicht.jsx
       DREIECKREGLER_QUELLE       src/components/DreieckRegler.jsx
       GESCHMACK_QUELLE           src/lib/geschmack.js
       PROFIL_QUELLE              src/lib/profil.js
       DATENTAB_QUELLE            src/tabs/DatenTab.jsx
   Beispiel:
       GESCHMACKBEREICH_QUELLE=/tmp/mut5_version.jsx node geschmackui_test.mjs

   WAS GEPRÜFT WIRD
   ---------------------------------------------------------------------------
     A  Aufbau, Ladezustand, leeres Profil — und die Wirklichkeitstreue des
        Speicher-Doppels gegen den echten `loescheProfil`.
     B  Das Opt-in-Gate AN DEN DATEN: Schreibzähler über „Jetzt nicht",
        Abbruch, jeden Schritt und jeden Rückweg — und über die Abkürzung
        für bereits zustimmende Nutzer, die das Gate nicht weichmachen darf.
     C  Die Drei-Zustands-Chips: Kreis, Exklusivität, Zustand im aria-pressed
        UND im sichtbaren Text (rot/grün-unabhängig).
     D  Der Weg durch die fünf Schritte; die Auswahl überlebt Hin und Zurück.
     E  Die Vorschau lügt nicht: was dort steht, landet im Profil — inklusive
        Richtungen und inklusive der „Nicht übernommen"-Zeile.
     G  Die Fassungsnummer steigt um GENAU EINS je Durchlauf, in allen
        Kombinationen und im zweiten Durchlauf.
     H  Es wandern GENAU die berührten Achsen ins Profil — eine bewegte
        schreibt eine, zwei schreiben zwei, eine zurückgezogene gilt
        weiterhin als berührt, keine schreibt keine; bestehende Achsen
        überleben einen Durchlauf ohne Reglerbewegung.
     I  Der Widerruf: Reihenfolge der Schreibvorgänge, nichts Inhaltliches
        übrig, „widerrufen" bleibt von „nie gefragt" unterscheidbar. Dazu der
        Wächter über ALLE Schnappschüsse aller Abschnitte.
     J  Das beschädigte Profil wird nicht als leer behandelt und nicht
        überschrieben.
     K  Schreibfehler: der Nutzer bekommt eine Meldung, der Zustand steht
        danach nicht halb verändert da, der zweite Versuch trägt.
     L  Ansehen, korrigieren, entfernen; der KI=aus-Hinweis in beiden
        Richtungen.
     M  Erreichbarkeit ohne KI: die Klappe in DatenTab hängt NICHT am
        KI-Schalter und ist dort vollständig bedienbar. Dazu die Zusage,
        dass DatenTab bei JEDEM Stand des Schalters überhaupt rendert.
     F  Auffälligkeiten am Ist-Verhalten. Heute rot, NICHT exit-relevant —
        ein Pin auf falsches Verhalten macht die Reparatur später zur
        „Regression" (Regel aus dem Kopf von finder_test.mjs).
        GESCHMACKUI_FORDERUNG=1 schaltet sie scharf. Stand 28.07.2026: alle
        vier Auffälligkeiten der ersten Fassung sind behoben und als scharfe
        Checks umgezogen; der Abschnitt führt die Buchführung darüber.

   STAND 28.07.2026 — was sich gegenüber der ersten Fassung geändert hat
   ---------------------------------------------------------------------------
   Runde 1  218 Checks, vier Auffälligkeiten (F1–F4).
   Runde 2  248 Checks. Alle vier Befunde sind gebaut, die vier F-Checks sind
            scharf geworden und umgezogen (siehe Abschnitt F). Dazu ein
            eigener Fehler dieser Datei, der teuer war: Die Messanzeigen in
            den Check-Namen schnitten am ersten Großbuchstaben ab und liessen
            „Achsen: WIE 5, WARUM 1" wie „Achsen: WIE" aussehen — es sah aus,
            als lüge die Vorschau. Sie tat es nicht. Die Ausschnitte laufen
            jetzt über `ausschnitt()` bis zum nächsten Bedienelement.

   Kein Framework, keine neue Abhängigkeit. Aufruf: node geschmackui_test.mjs
   =========================================================================== */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const WURZEL = path.dirname(fileURLToPath(import.meta.url));
const startZeit = Date.now();

/* Unbehandelte Zusagen-Brüche einsammeln statt daran zu sterben.
   Ohne diesen Fang beendet Node den ganzen Lauf, sobald ein Klick-Handler in
   eine unbehandelte Ablehnung läuft — und ein Test, der stirbt, meldet NULL
   rote Checks. Genau das ist bei der Mutationsprobe MU10 (Fang in `schreibe`
   entfernt) passiert: Der Lauf brach ab, statt den Befund zu zeigen. Ein
   Abbruch, der wie ein grüner Lauf aussieht, ist die schlechteste Ausgabe,
   die eine Testdatei haben kann. Abschnitt K prüft den Zähler ausdrücklich. */
const unbehandelt = [];
process.on("unhandledRejection", (e) => { unbehandelt.push(String(e?.message || e)); });

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
  bereich:    { umgebung: "GESCHMACKBEREICH_QUELLE",    datei: "src/components/GeschmackBereich.jsx",    loader: "jsx", dir: "src/components", marke: /(^|[\\/])GeschmackBereich\.jsx$/ },
  onboarding: { umgebung: "GESCHMACKONBOARDING_QUELLE", datei: "src/components/GeschmackOnboarding.jsx", loader: "jsx", dir: "src/components", marke: /(^|[\\/])GeschmackOnboarding\.jsx$/ },
  ansicht:    { umgebung: "PROFILANSICHT_QUELLE",       datei: "src/components/ProfilAnsicht.jsx",       loader: "jsx", dir: "src/components", marke: /(^|[\\/])ProfilAnsicht\.jsx$/ },
  regler:     { umgebung: "DREIECKREGLER_QUELLE",       datei: "src/components/DreieckRegler.jsx",       loader: "jsx", dir: "src/components", marke: /(^|[\\/])DreieckRegler\.jsx$/ },
  geschmack:  { umgebung: "GESCHMACK_QUELLE",           datei: "src/lib/geschmack.js",                   loader: "js",  dir: "src/lib",        marke: /(^|[\\/])geschmack\.js$/ },
  profil:     { umgebung: "PROFIL_QUELLE",              datei: "src/lib/profil.js",                      loader: "js",  dir: "src/lib",        marke: /(^|[\\/])profil\.js$/ },
  datentab:   { umgebung: "DATENTAB_QUELLE",            datei: "src/tabs/DatenTab.jsx",                  loader: "jsx", dir: "src/tabs",       marke: /(^|[\\/])DatenTab\.jsx$/ },
};
const GETAUSCHT = [];
for (const [name, q] of Object.entries(QUELLEN)) {
  q.pfad = process.env[q.umgebung] || path.join(WURZEL, q.datei);
  q.text = fs.readFileSync(q.pfad, "utf8");
  q.dir = path.join(WURZEL, q.dir);
  if (process.env[q.umgebung]) GETAUSCHT.push(name + "=" + q.pfad);
}

/* Die kuratierte Liste. Für das „altbau"-Bündel bekommt sie EINEN zusätzlichen
   Eintrag mit einer Art, die `SIGNAL_ARTEN` nicht kennt. Genau das kann
   passieren: die Liste ist eine Datei, sie kann aus einem alten Build stammen
   oder von Hand bearbeitet worden sein — `signaleAusAuswahl` fängt den Fall
   ausdrücklich ab („Art nicht im Modell"). Über die echte Datei ist er nicht
   erreichbar. */
const LISTE_DATEI = path.join(WURZEL, "src/data/geschmack_schlagwoerter.json");
const LISTE = JSON.parse(fs.readFileSync(LISTE_DATEI, "utf8"));
const RELIKT = {
  id: "altbau_relikt", gruppe: "genre", anzeige: "Relikt aus altem Build",
  art: "stimmung", wert: "relikt", beleg: "schlagwort:altbau_relikt",
};
const LISTE_ALTBAU = { ...LISTE, schlagwoerter: [...LISTE.schlagwoerter, RELIKT] };

/* KEIN NETZ — aber ohne Stub-Module.
   willkommen_test.mjs ersetzt `services/auth.js` beim Bündeln durch einen
   Stub; das geht dort, weil das Bündel nur die Willkommens-Box enthält und
   genau drei Mitglieder braucht. Hier hängt über DatenTab der halbe
   Dienste-Baum drin (Konto, Übernahme, Speicher, KI), und ein Stub müsste
   jedes einzelne Mitglied nachbilden — er wäre bei der nächsten neuen Funktion
   still veraltet und würde einen Fehler VERSTECKEN statt ihn zu zeigen.

   Stattdessen die Falle eine Ebene tiefer: `fetch` und `XMLHttpRequest` werden
   im Testprozess durch Zähler ersetzt, die jeden Versuch mitschreiben und
   werfen. Das deckt JEDEN Weg nach draußen ab, auch den, den ein Stub nicht
   kennt. Abschnitt M prüft am Ende, dass der Zähler auf null steht. */
const netzVersuche = [];
const netzFalle = (was) => (...a) => {
  netzVersuche.push({ was, ziel: String(a[0]).slice(0, 200) });
  throw new Error("Netzzugriff im Test: " + was + " " + String(a[0]).slice(0, 80));
};

const EINTRITT_ECHT = `
export { GeschmackBereich } from "./GeschmackBereich.jsx";
export { GeschmackOnboarding } from "./GeschmackOnboarding.jsx";
export { ProfilAnsicht } from "./ProfilAnsicht.jsx";
export { DatenTab } from "../tabs/DatenTab.jsx";
`;
const EINTRITT_ALTBAU = `
export { GeschmackBereich } from "./GeschmackBereich.jsx";
`;

const AUSGABE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kd-geschmackui-test-"));
const AUSGABE_NODE_MODULES = path.join(AUSGABE_DIR, "node_modules");
process.on("exit", () => {
  try {
    fs.rmSync(AUSGABE_DIR, { recursive: true, force: true });
  } catch {}
});
if (!fs.existsSync(AUSGABE_NODE_MODULES)) {
  fs.symlinkSync(path.join(WURZEL, "node_modules"), AUSGABE_NODE_MODULES, "dir");
}
fs.mkdirSync(AUSGABE_DIR, { recursive: true });
const esbuild = await ladeEsbuild();

async function buendle(name, eintritt, liste, mitDiensten) {
  const ziel = path.join(AUSGABE_DIR, name + ".bundle.mjs");
  await esbuild.build({
    entryPoints: ["geschmack-eintritt"],
    bundle: true, format: "esm", outfile: ziel,
    jsx: "automatic", target: "es2022", logLevel: "warning",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
    plugins: [{
      name: "geschmackui-test",
      setup(bau) {
        bau.onResolve({ filter: /^geschmack-eintritt$/ }, () => ({ path: "eintritt", namespace: "gu" }));
        for (const [k, q] of Object.entries(QUELLEN)) {
          if (!mitDiensten && k === "datentab") continue;
          bau.onResolve({ filter: q.marke }, () => ({ path: k, namespace: "gu" }));
        }
        bau.onResolve({ filter: /geschmack_schlagwoerter\.json$/ }, () => ({ path: "liste", namespace: "gu-json" }));
        bau.onLoad({ filter: /.*/, namespace: "gu-json" }, () => ({ contents: JSON.stringify(liste), loader: "json" }));
        bau.onLoad({ filter: /.*/, namespace: "gu" }, (a) => {
          if (a.path === "eintritt") {
            return { contents: eintritt, loader: "js", resolveDir: path.join(WURZEL, "src/components") };
          }
          const q = QUELLEN[a.path];
          return { contents: q.text, loader: q.loader, resolveDir: q.dir };
        });
      },
    }],
  });
  return ziel;
}

const gebautAb = Date.now();
const ZIEL_ECHT = await buendle("echt", EINTRITT_ECHT, LISTE, true);
const ZIEL_ALTBAU = await buendle("altbau", EINTRITT_ALTBAU, LISTE_ALTBAU, false);
const bauDauer = Date.now() - gebautAb;

/* =========================================================================
   JSDOM + React — die Browser-Globalen müssen stehen, bevor react-dom lädt.
   ========================================================================= */
const dom = new JSDOM(
  "<!doctype html><html><body>" +
  "<button id=\"aussen\">außen</button>" +
  "<div id=\"wurzel\"></div><div id=\"altbauwurzel\"></div><div id=\"tabwurzel\"></div>" +
  "</body></html>", { url: "http://localhost/" });
dom.window.scrollTo = () => {};
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLButtonElement",
  "HTMLSelectElement", "HTMLOptionElement", "SVGElement", "Element", "Event", "MouseEvent", "KeyboardEvent",
  "CustomEvent", "Node", "NodeList", "getComputedStyle", "localStorage"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
/* Die Netzfalle scharf schalten — im Testprozess UND im JSDOM-Fenster. */
globalThis.fetch = netzFalle("fetch");
dom.window.fetch = netzFalle("window.fetch");
dom.window.XMLHttpRequest = function () { netzFalle("XMLHttpRequest")("(kein Ziel)"); };
globalThis.XMLHttpRequest = dom.window.XMLHttpRequest;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act, createElement: h } = React;
const { T } = await import("./src/lib/tokens.js");
/* Das echte Profil-Modul — für die Wirklichkeitstreue des Doppels (A) und für
   die Erwartungswerte, die sonst hier abgeschrieben werden müssten. */
const P = await import("./src/lib/profil.js");
const G = await import("./src/lib/geschmack.js");
const { K: TOPF } = await import("./src/lib/storage.js");

const { GeschmackBereich, GeschmackOnboarding, ProfilAnsicht, DatenTab } = await import(ZIEL_ECHT);
const { GeschmackBereich: GeschmackBereichAltbau } = await import(ZIEL_ALTBAU);

/* =========================================================================
   BEDIENHILFEN
   ========================================================================= */
const ruhe = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

/* `feld` zeigt auf den gerade bespielten Montagepunkt. */
let feld = () => document.getElementById("wurzel");
const alles = (sel) => { const f = feld(); return f ? [...f.querySelectorAll(sel)] : []; };
const knoepfe = () => alles("button");
const knopf = (t) => knoepfe().find((b) => b.textContent.trim() === t);
const knopfTeil = (t) => knoepfe().find((b) => b.textContent.includes(t));
const text = () => { const f = feld(); return f ? f.textContent.replace(/\s+/g, " ").trim() : ""; };
const setzeWert = (el, wert) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  setter.call(el, wert);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
};
const klick = async (b, wer) => {
  if (!b) throw new Error("Knopf nicht gefunden: " + (wer || "?"));
  await act(async () => { b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await ruhe();
};
const klickT = async (t) => {
  let ziel = knopfTeil(t);
  /* Die kompakte Profilansicht zeigt Erhebungswege erst hinter „Ändern“.
     Fachtests dürfen den neuen Navigationsschritt bedienen, ohne die
     Datenfluss-Prüfungen an jeder Stelle mit UI-Boilerplate zu überladen. */
  if (!ziel && /Weitere Angaben|Erhebung starten/.test(t) && knopf("Ändern")) {
    await klick(knopf("Ändern"), "Ändern");
    ziel = knopfTeil("Weitere Angaben");
  }
  return klick(ziel, t);
};
const wertSetzer = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
const ziehe = async (achse, wert) => {
  const el = alles("input[type=\"range\"][aria-label=\"" + achse + "\"]")[0];
  if (!el) throw new Error("Regler nicht gefunden: " + achse);
  await act(async () => {
    wertSetzer.call(el, String(wert));
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await ruhe();
};
const waehleAus = async (el, wert) => {
  await act(async () => {
    el.value = wert;
    el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await ruhe();
};
/* Die Drei-Zustands-Chips. Sie sind die einzigen Knöpfe mit `aria-pressed` —
   bewusst darüber gesucht und nicht über eine Klasse: Wer das Attribut
   entfernt, verliert damit auch den Zugriff des Tests, und das ist richtig so. */
const chips = () => alles("button[aria-pressed]");
const chipMit = (t) => chips().find((c) => c.textContent.includes(t));
const chipZustand = (c) => ({
  gedrueckt: c.getAttribute("aria-pressed"),
  text: c.textContent.trim(),
  zeichen: c.textContent.trim().startsWith("+ ") ? "+" : c.textContent.trim().startsWith("− ") ? "−" : "",
});
const liveRegionen = () => alles("[aria-live]").map((e) => e.textContent.replace(/\s+/g, " ").trim());

/* Ausschnitt aus dem Sichttext für die Messanzeige im Check-Namen.
   NACHGEZOGEN AM 28.07.2026: Vorher standen hier Muster, die am ersten
   Großbuchstaben nach dem Doppelpunkt abschnitten (Zeichenklasse ohne
   A-Z) — die
   Zeile „Achsen: WIE 5, WARUM 1" wurde als „Achsen: WIE" angezeigt. Das hat
   bei der Abnahme von F1 ein „die Vorschau lügt" vorgetäuscht, das es nicht
   gab. Eine Messanzeige, die kürzt, ist schlimmer als keine: Sie sieht aus
   wie eine Messung. Jetzt: ab dem Treffer bis zum nächsten Bedienelement. */
const STOPPWORTE = ["Zurück", "Weiter", "Zur Übersicht", "Ins Profil übernehmen", "Abbrechen",
  "Weitere Angaben", "Einwilligung widerrufen", "Filme:", "Achsen:", "Nicht übernommen:", "Fassung "];
const ausschnitt = (start) => {
  const t = text();
  const i = t.indexOf(start);
  if (i < 0) return null;
  let ende = t.length;
  for (const w of STOPPWORTE) {
    const j = t.indexOf(w, i + start.length);
    if (j >= 0 && j < ende) ende = j;
  }
  return t.slice(i, ende).trim();
};

/* Farbvergleich: React schreibt Hex in style, jsdom liest rgb() zurück. */
const messFarbe = dom.window.document.createElement("i");
const alsRgb = (hex) => { messFarbe.style.color = hex; return messFarbe.style.color; };

/* =========================================================================
   DAS SPEICHER-DOPPEL
   -------------------------------------------------------------------------
   Der Kern dieser Datei. Es schreibt JEDEN Zugriff mit — Reihenfolge, Nutzlast
   und den Zustand des Topfes NACH der Operation. Erst damit ist die Zusage
   „ohne Zustimmung kein Profil" an den Daten messbar statt an der Anzeige.

   `loescheProfil` ist HANDGESCHRIEBEN und bildet die dokumentierte Semantik
   des echten nach (Inhalte weg, Einwilligungsvermerk und Version bleiben) —
   nicht aus dem echten Modul importiert, denn ein Doppel, das den Prüfling
   aufruft, prüft nichts. Dass die Nachbildung stimmt, misst Abschnitt A gegen
   den ECHTEN `loescheProfil` über localStorage.
   ========================================================================= */
const LEER = () => ({
  format: P.PROFIL_FORMAT, version: "p0", erstellt: null, geaendert: null,
  einwilligung: null, signale: [], offen: [],
  achsen: { wie: null, was: null, warum: null }, filme: [], nichtDeutbar: [],
});
const tief = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

/* ALLE Schnappschüsse aller Doppel dieses Laufs — der Wächter in I liest sie. */
const alleSchnappschuesse = [];

function neuerSpeicher(start = null) {
  const z = {
    ops: [],                 // { op, p? }  in Aufrufreihenfolge
    topf: tief(start),
    wirftBeimSchreiben: null,
    wirftBeimLoeschen: null,
    wirftBeimLaden: null,
    langsam: false,
    aufloesenLaden: null,
  };
  const merke = (op) => {
    /* Der Schnappschuss NACH der Operation. Ein Endergebnis-Test sähe den
       Zwischenstand nicht, um den es beim Widerruf geht. */
    const s = { op, topf: tief(z.topf), quelle: z };
    z.ops.push(s);
    alleSchnappschuesse.push(s);
    return s;
  };
  z.api = {
    ladeProfil: async () => {
      if (z.wirftBeimLaden) { merke("lade-wirft"); throw new Error(z.wirftBeimLaden); }
      if (z.langsam) await new Promise((r) => { z.aufloesenLaden = r; });
      merke("lade");
      return tief(z.topf);
    },
    speichereProfil: async (p) => {
      if (z.wirftBeimSchreiben) {
        z.ops.push({ op: "schreib-versuch-abgewiesen", p: tief(p), topf: tief(z.topf), quelle: z });
        alleSchnappschuesse.push(z.ops[z.ops.length - 1]);
        throw new Error(z.wirftBeimSchreiben);
      }
      z.topf = tief(p);
      const s = merke("schreibe");
      s.p = tief(p);
      return p;
    },
    loescheProfil: async (jetzt = null) => {
      if (z.wirftBeimLoeschen) { merke("loesche-wirft"); throw new Error(z.wirftBeimLoeschen); }
      const alt = z.topf;
      const leer = LEER();
      if (alt && !alt.beschaedigt) {
        if (alt.einwilligung) leer.einwilligung = { ...alt.einwilligung };
        if (P.VERSION_FORM.test(String(alt.version || ""))) leer.version = alt.version;
        leer.erstellt = alt.erstellt || null;
      }
      leer.geaendert = jetzt;
      z.topf = leer;
      merke("loesche");
      return tief(leer);
    },
  };
  /* Nur die Operationen, die den Topf ANFASSEN — Lesen zählt nicht als
     Schreibversuch, und genau diese Zahl muss vor der Einwilligung null sein. */
  z.schreibOps = () => z.ops.filter((o) => o.op !== "lade" && o.op !== "lade-wirft");
  z.folge = () => z.ops.map((o) => o.op);
  z.leeren = () => { z.ops.length = 0; };
  return z;
}

/* =========================================================================
   FIXTUREN
   ========================================================================= */
/* Titel für den Filmschritt. `filmAuswahl` nimmt nur die Kategorien aus
   FILM_KATEGORIEN und höchstens einen Titel je Reihe — „Jackass Number Two"
   und „Jackass Forever" teilen sich also einen Platz. Die weiche Mitte
   (`sehenswert`) bleibt draußen; „Der Sehenswerte" ist hier, damit der Test
   das auch misst statt es zu glauben. */
const TITEL = [
  { id: "m1", titel: "Alien", jahr: 1979, kategorie: "kult", genre: ["Science-Fiction", "Horror"] },
  { id: "m2", titel: "Jackass Number Two", jahr: 2006, kategorie: "trash", genre: ["Komödie"] },
  { id: "m3", titel: "Jackass Forever", jahr: 2022, kategorie: "trash", genre: ["Komödie"] },
  { id: "m4", titel: "Casablanca", jahr: 1942, kategorie: "immer_gut", genre: ["Drama"] },
  { id: "m5", titel: "Der Sehenswerte", jahr: 2001, kategorie: "sehenswert", genre: ["Drama"] },
];

/* =========================================================================
   MONTAGE
   ========================================================================= */
const wurzel = createRoot(document.getElementById("wurzel"));
const tabWurzel = createRoot(document.getElementById("tabwurzel"));
let letzteProps = {};
const fehlerRufe = [];
const montiere = async (props = {}) => {
  letzteProps = { bekannteTitel: TITEL, ...props };
  await act(async () => { wurzel.render(h(GeschmackBereich, letzteProps)); });
  await ruhe();
};
/* Neu aufbauen: erst abräumen, damit `useEffect` wirklich noch einmal läuft. */
const neuMontieren = async (props = {}) => {
  await act(async () => { wurzel.render(null); });
  feld = () => document.getElementById("wurzel");
  await montiere(props);
};
const abraeumen = async () => { await act(async () => { wurzel.render(null); }); };

/* Ein vollständiger Onboarding-Durchlauf. `bis` erlaubt, unterwegs anzuhalten. */
async function durchlauf({ schlagwort = null, film = null, achse = null, achsen = null, bis = "fertig" } = {}) {
  let start = knopfTeil("Profil anlegen") || knopfTeil("Weitere Angaben");
  if (!start && knopf("Ändern")) {
    await klick(knopf("Ändern"), "Ändern");
    start = knopfTeil("Weitere Angaben");
  }
  await klick(start, "Erhebung starten");
  if (bis === "einwilligung") return;
  /* Seit dem F4-Fix (28.07.2026) überspringt ein bereits zustimmender Nutzer
     den Einwilligungsschritt. Der Helfer klickt den Knopf deshalb nur, wenn es
     ihn gibt — WELCHER Fall vorliegt, prüfen B und D ausdrücklich, hier wird
     er nur bedient. Ein Helfer, der ihn erzwänge, machte jeden zweiten
     Durchlauf unmöglich; einer, der stillschweigend danebengriffe, verdeckte
     die Zusage. */
  if (knopfTeil("Einverstanden")) await klickT("Einverstanden");
  if (schlagwort) for (let i = 0; i < schlagwort.mal; i++) await klick(chipMit(schlagwort.text), schlagwort.text);
  if (bis === "schlagwoerter") return;
  await klick(knopf("Weiter"), "Weiter (Schlagwörter)");
  if (film) for (let i = 0; i < film.mal; i++) await klick(chipMit(film.text), film.text);
  if (bis === "filme") return;
  await klick(knopf("Weiter"), "Weiter (Filme)");
  if (achse) await ziehe(achse.achse, achse.wert);
  for (const [a, w] of Object.entries(achsen || {})) await ziehe(a, w);
  if (bis === "achsen") return;
  await klick(knopf("Zur Übersicht"), "Zur Übersicht");
  if (bis === "vorschau") return;
  await klickT("Ins Profil übernehmen");
}

/* Jeder Abschnitt läuft in seiner eigenen Funktion. Reisst einer ab (etwa weil
   eine Mutation einen Knopf entfernt hat), wird das als roter Check dieses
   Abschnitts vermerkt und die übrigen laufen weiter — ein roter Check darf
   nichts verdecken (Regel aus finder_test.mjs). */
const ABSCHNITTE = [];
const abschnitt = (name, lauf) => ABSCHNITTE.push([name, lauf]);

/* =========================================================================
   A — AUFBAU, LADEZUSTAND, LEERES PROFIL
   ========================================================================= */
abschnitt("A", async () => {
console.log("\n--- A: Aufbau, Ladezustand, leeres Profil ---");

/* (1) Der Ladezustand ist ein eigener Zustand, nicht „leer". Ein Bereich, der
   während des Ladens schon „du hast kein Profil" behauptet, lädt den Nutzer
   ein, ein zweites anzulegen. */
const sp = neuerSpeicher(null);
sp.langsam = true;
await abraeumen();
await act(async () => { wurzel.render(h(GeschmackBereich, { bekannteTitel: TITEL, speicher: sp.api })); });
check("A", "während des Ladens steht „Profil wird geladen…\" — nicht „kein Profil\"",
  () => text() === "Profil wird geladen…");
check("A", "im Ladezustand gibt es keinen einzigen Knopf", () => knoepfe().length === 0);
check("A", "im Ladezustand ist noch nichts geschrieben worden  [gemessen: "
  + sp.schreibOps().length + " Schreibversuch(e)]", () => sp.schreibOps().length === 0);
await act(async () => { sp.aufloesenLaden?.(); await new Promise((r) => setTimeout(r, 0)); });
check("A", "nach dem Laden steht der Text für „noch kein Profil\"",
  () => text().startsWith("Du hast noch kein Geschmacksprofil."));
check("A", "der leere Zustand nennt ausdrücklich, was OHNE Profil weiterläuft",
  () => text().includes("Suche, Sammlung und Bewertungen funktionieren unverändert."));
check("A", "der leere Zustand hat GENAU EINEN Knopf, beschriftet „Profil anlegen\"",
  () => knoepfe().length === 1 && knoepfe()[0].textContent.trim() === "Profil anlegen");
check("A", "„Profil anlegen\" ist der primäre Stil (Hintergrund = T.wolfram)",
  () => knoepfe()[0].style.background === alsRgb(T.wolfram));
check("A", "das Laden selbst schreibt nichts  [gemessen: Folge " + JSON.stringify(sp.folge()) + "]",
  () => sp.schreibOps().length === 0 && sp.folge().filter((o) => o === "lade").length === 1);

/* (2) Ein Profil OHNE Einwilligung (nie gefragt) sieht aus wie kein Profil —
   das ist beabsichtigt, und es wird hier gepinnt, damit der Unterschied zum
   WIDERRUFENEN Profil (Abschnitt I) messbar bleibt. */
const sp2 = neuerSpeicher(LEER());
await neuMontieren({ speicher: sp2.api });
check("A", "ein leerer Topf ohne Einwilligungsvermerk führt in denselben Zustand",
  () => text().startsWith("Du hast noch kein Geschmacksprofil.") && knoepfe().length === 1);
check("A", "und schreibt ebenfalls nichts", () => sp2.schreibOps().length === 0);

/* (3) Die Wirklichkeitstreue des Doppels. Ein handgeschriebenes Doppel, das
   sich anders verhält als das Original, macht jede Messung darauf wertlos.
   Deshalb derselbe Ablauf einmal gegen den ECHTEN `loescheProfil` (über
   localStorage, den JSDOM mitbringt). */
const vorbild = { ...LEER(), version: "p3", erstellt: "2026-07-01T00:00:00.000Z",
  einwilligung: { erteilt: true, am: "2026-07-01T00:00:00.000Z", textVersion: "v1" },
  signale: [{ art: "genre", wert: "drama", richtung: "zieht_an", staerke: 4,
    sicherheit: "hoch", quelle: "schlagwort", beleg: "schlagwort:drama" }],
  achsen: { wie: 5, was: 1, warum: 2 },
  filme: [{ titel: "Alien", jahr: 1979, masterId: "m1", sicher: true, richtung: "zieht_an" }] };
dom.window.localStorage.setItem(TOPF.geschmacksprofil, JSON.stringify(vorbild));
const echtGeloescht = await P.loescheProfil("2026-07-28T00:00:00.000Z");
const doppel = neuerSpeicher(vorbild);
const doppelGeloescht = await doppel.api.loescheProfil("2026-07-28T00:00:00.000Z");
check("A", "das Doppel bildet `loescheProfil` wirklichkeitsgetreu ab (Feld für Feld gleich)",
  () => JSON.stringify(echtGeloescht) === JSON.stringify(doppelGeloescht));
check("A", "…und beide behalten den Einwilligungsvermerk  [gemessen: "
  + JSON.stringify(echtGeloescht.einwilligung) + "]",
  () => echtGeloescht.einwilligung?.erteilt === true && doppelGeloescht.einwilligung?.erteilt === true);
check("A", "…und beide behalten die Fassungsnummer p3",
  () => echtGeloescht.version === "p3" && doppelGeloescht.version === "p3");
check("A", "…und beide räumen Signale, Filme und Achsen ab",
  () => echtGeloescht.signale.length === 0 && echtGeloescht.filme.length === 0
    && Object.values(echtGeloescht.achsen).every((v) => v === null)
    && doppelGeloescht.signale.length === 0 && doppelGeloescht.filme.length === 0
    && Object.values(doppelGeloescht.achsen).every((v) => v === null));
dom.window.localStorage.removeItem(TOPF.geschmacksprofil);
});

/* =========================================================================
   B — DAS OPT-IN-GATE AN DEN DATEN
   -------------------------------------------------------------------------
   Der Kernabschnitt. Gemessen wird NICHT, ob ein Knopf sichtbar ist, sondern
   wie oft die Speicherschicht angefasst wurde. Solange „Jetzt nicht" gilt oder
   die Einwilligung nicht erteilt ist, muss diese Zahl null sein.
   ========================================================================= */
abschnitt("B", async () => {
console.log("\n--- B: Opt-in-Gate an den DATEN (Schreibzähler) ---");

/* (1) Der erste Schritt IST die Einwilligung — und er zeigt noch nichts zum
   Einsammeln. Der bequeme Bau wäre umgekehrt (erst alles einsammeln, am Ende
   fragen); genau den verbietet die Zusage. */
const sp = neuerSpeicher(null);
await neuMontieren({ speicher: sp.api });
await klick(knopf("Profil anlegen"), "Profil anlegen");
check("B", "Schritt 1 ist die Einwilligung, ausgewiesen im aria-label der Gruppe  [gemessen: "
  + JSON.stringify(alles("[role=\"group\"]")[0]?.getAttribute("aria-label")) + "]",
  () => alles("[role=\"group\"]")[0]?.getAttribute("aria-label") === "Geschmacksprofil anlegen — Schritt 1 von 5");
check("B", "auf Schritt 1 gibt es KEINEN einzigen Auswahl-Chip  [gemessen: " + chips().length + "]",
  () => chips().length === 0);
check("B", "auf Schritt 1 gibt es keinen Achsen-Regler", () => alles("input[type=\"range\"]").length === 0);
check("B", "Schritt 1 sagt zu, dass ohne Zustimmung kein Profil entsteht",
  () => text().includes("Ohne deine Zustimmung entsteht kein Profil."));
check("B", "Schritt 1 beschreibt die Speicherung wahr für Gast und Konto",
  () => text().includes("Im Gastmodus bleibt das Profil auf diesem Gerät")
    && text().includes("mit einem Konto gehört es zu deinem Konto"));
check("B", "Schritt 1 nennt Widerruf und Löschung",
  () => text().includes("die Einwilligung widerrufen") && text().includes("dann wird es gelöscht"));
check("B", "Schritt 1 hat genau zwei Knöpfe: zustimmen und ablehnen  [gemessen: "
  + JSON.stringify(knoepfe().map((b) => b.textContent.trim())) + "]",
  () => knoepfe().length === 2
    && knoepfe()[0].textContent.trim() === "Einverstanden — Profil anlegen"
    && knoepfe()[1].textContent.trim() === "Jetzt nicht");
check("B", "das blosse Öffnen des Einwilligungsschritts schreibt NICHTS  [gemessen: "
  + sp.schreibOps().length + " Schreibversuch(e), Folge " + JSON.stringify(sp.folge()) + "]",
  () => sp.schreibOps().length === 0);

/* (2) „Jetzt nicht" — der Ablehnungspfad. NULL Schreibversuche, und zwar
   auch kein Vermerk „wurde gefragt". */
await klick(knopf("Jetzt nicht"), "Jetzt nicht");
check("B", "nach „Jetzt nicht\" steht wieder der leere Zustand",
  () => text().startsWith("Du hast noch kein Geschmacksprofil."));
check("B", "„Jetzt nicht\" schreibt NICHTS — kein Profil, kein Vermerk  [gemessen: "
  + sp.schreibOps().length + " Schreibversuch(e)]", () => sp.schreibOps().length === 0);
check("B", "der Topf ist danach unverändert leer  [gemessen: " + JSON.stringify(sp.topf) + "]",
  () => sp.topf === null);

/* (3) Der lange Weg OHNE Zustimmung gibt es nicht — aber der lange Weg MIT
   Zustimmung darf bis zur Vorschau ebenfalls nichts schreiben. Erst der Klick
   auf „Ins Profil übernehmen" ist die Übernahme. */
sp.leeren();
await durchlauf({ schlagwort: { text: "Drama", mal: 1 }, film: { text: "Alien", mal: 1 },
  achse: { achse: "WIE", wert: 5 }, bis: "vorschau" });
check("B", "Zustimmung + Schlagwort + Film + Regler + Vorschau: immer noch NICHTS geschrieben"
  + "  [gemessen: " + sp.schreibOps().length + " Schreibversuch(e), Folge " + JSON.stringify(sp.folge()) + "]",
  () => sp.schreibOps().length === 0);
check("B", "die Vorschau steht (der Lauf war kein Leerlauf)",
  () => text().includes("Das käme ins Profil") && !!knopfTeil("Ins Profil übernehmen"));

/* (4) „Abbrechen" aus der Vorschau — der letzte Ausstieg vor dem Schreiben. */
await klick(knopf("Abbrechen"), "Abbrechen");
check("B", "„Abbrechen\" aus der Vorschau schreibt NICHTS  [gemessen: "
  + sp.schreibOps().length + " Schreibversuch(e)]", () => sp.schreibOps().length === 0);
check("B", "…und führt zurück in den leeren Zustand",
  () => text().startsWith("Du hast noch kein Geschmacksprofil."));
check("B", "der Topf ist auch nach dem vollen Weg unberührt", () => sp.topf === null);

/* (5) Erst die Übernahme schreibt — GENAU EINMAL, und das Geschriebene trägt
   die Einwilligung. Ein Schreibvorgang mit Inhalt und ohne Einwilligung ist
   der Zustand aus Befund P2. */
sp.leeren();
await durchlauf({ schlagwort: { text: "Drama", mal: 1 } });
const geschrieben = sp.ops.filter((o) => o.op === "schreibe");
check("B", "die Übernahme schreibt GENAU EINMAL  [gemessen: " + geschrieben.length + "]",
  () => geschrieben.length === 1);
check("B", "das Geschriebene trägt die erteilte Einwilligung  [gemessen: "
  + JSON.stringify(geschrieben[0]?.p?.einwilligung) + "]",
  () => geschrieben[0]?.p?.einwilligung?.erteilt === true);
check("B", "das Geschriebene trägt den Inhalt (1 bestätigtes Signal)",
  () => geschrieben[0]?.p?.signale?.length === 1 && geschrieben[0].p.signale[0].wert === "drama");
check("B", "nichts liegt unbestätigt in `offen` — der Nutzer hat die Vorschau ja gesehen",
  () => geschrieben[0]?.p?.offen?.length === 0);
check("B", "das Geschriebene besteht `pruefeProfil` (es wäre auch am echten Speicher durchgekommen)"
  + "  [gemessen: " + JSON.stringify(P.pruefeProfil(geschrieben[0]?.p || {}).slice(0, 2)) + "]",
  () => P.pruefeProfil(geschrieben[0].p).length === 0);

/* (6) DIE ABKÜRZUNG (F4-Fix, 28.07.2026) DARF DAS GATE NICHT WEICHMACHEN.
   Ein bereits zustimmender Nutzer überspringt seit dem Fix den
   Einwilligungsschritt. Das ist der Punkt, an dem F4 gefährlich werden
   könnte: Wer den Schritt überspringt, überspringt beinahe die Zustimmung.
   Geprüft wird deshalb beides — dass die Abkürzung NUR mit erteilter
   Einwilligung greift, und dass der Schreibzähler in BEIDEN Fällen bei null
   bleibt, bis die Vorschau bestätigt ist. */
sp.leeren();
await klickT("Weitere Angaben");
check("B", "mit erteilter Einwilligung beginnt der Weg auf Schritt 2  [gemessen: "
  + JSON.stringify(alles("[role=\"group\"]")[0]?.getAttribute("aria-label")) + "]",
  () => alles("[role=\"group\"]")[0]?.getAttribute("aria-label")
    === "Geschmacksprofil anlegen — Schritt 2 von 5");
check("B", "…der Einwilligungstext wird nicht erneut vorgelegt",
  () => !text().includes("Ohne deine Zustimmung entsteht kein Profil.") && !knopfTeil("Einverstanden"));
check("B", "…und trotz Abkürzung ist bis hierhin NICHTS geschrieben  [gemessen: "
  + sp.schreibOps().length + "]", () => sp.schreibOps().length === 0);
await klick(knopf("Zurück"), "Zurück (Abkürzung)");
check("B", "…„Zurück\" bleibt auf Schritt 2, statt in die Einwilligung zu führen  [gemessen: "
  + JSON.stringify(alles("[role=\"group\"]")[0]?.getAttribute("aria-label")) + "]",
  () => alles("[role=\"group\"]")[0]?.getAttribute("aria-label")
    === "Geschmacksprofil anlegen — Schritt 2 von 5"
    && !text().includes("Ohne deine Zustimmung entsteht kein Profil."));
await klick(chipMit("Komödie"), "Komödie");
await klick(knopf("Weiter"), "Weiter"); await klick(knopf("Weiter"), "Weiter");
await klick(knopf("Zur Übersicht"), "Zur Übersicht");
check("B", "…auch bis zur Vorschau ist nichts geschrieben  [gemessen: " + sp.schreibOps().length + "]",
  () => sp.schreibOps().length === 0);
await klick(knopf("Abbrechen"), "Abbrechen");
check("B", "…und der Abbruch schreibt weiterhin nichts  [gemessen: " + sp.schreibOps().length + "]",
  () => sp.schreibOps().length === 0);

/* Und die Gegenprobe, die den gefährlichen Fall abdeckt: Ein WIDERRUFENES
   Profil trägt einen Einwilligungsvermerk — aber `erteilt: false`. Läse die
   Abkürzung nur „es gibt einen Vermerk", käme genau der Nutzer ohne Frage
   durch, der ausdrücklich Nein gesagt hat. */
const spW = neuerSpeicher({ ...LEER(), version: "p2",
  einwilligung: { erteilt: false, am: "2026-07-01T00:00:00.000Z", textVersion: "v1" } });
await neuMontieren({ speicher: spW.api });
check("B", "ein widerrufenes Profil führt zurück in den Anlege-Zustand",
  () => text().startsWith("Du hast noch kein Geschmacksprofil.") && !!knopf("Profil anlegen"));
await klick(knopf("Profil anlegen"), "Profil anlegen");
check("B", "…und bekommt den Einwilligungsschritt WIEDER vorgelegt  [gemessen: "
  + JSON.stringify(alles("[role=\"group\"]")[0]?.getAttribute("aria-label")) + "]",
  () => alles("[role=\"group\"]")[0]?.getAttribute("aria-label")
    === "Geschmacksprofil anlegen — Schritt 1 von 5"
    && text().includes("Ohne deine Zustimmung entsteht kein Profil."));
check("B", "…die Abkürzung greift also nur bei erteilt===true, nicht bei „es gibt einen Vermerk\"",
  () => !!knopfTeil("Einverstanden"));
check("B", "…und ein widerrufenes Profil wird dabei nicht angefasst  [gemessen: "
  + spW.schreibOps().length + "]", () => spW.schreibOps().length === 0);

/* (7) Der Umkehrschluss, damit der Zähler nicht bloss ein toter Zähler ist:
   Ein Doppel, das NIE schreibt, würde alle Checks oben ebenfalls bestehen.
   Hier wird bewiesen, dass der Zähler überhaupt zählen kann. */
await neuMontieren({ speicher: sp.api });
sp.leeren();
await durchlauf({ schlagwort: { text: "Horror", mal: 2 } });
check("B", "der Schreibzähler zählt wirklich (sonst wären alle Null-Messungen wertlos)"
  + "  [gemessen: " + sp.schreibOps().length + " nach einer echten Übernahme]",
  () => sp.schreibOps().length === 1);
});


/* =========================================================================
   C — DIE DREI-ZUSTANDS-CHIPS
   -------------------------------------------------------------------------
   Ein Knopf statt zweier Radiogruppen, weil 21 Einträge sonst 42 Radioknöpfe
   am Handy wären. Der Preis dafür ist, dass der Zustand ABLESBAR sein muss —
   und zwar nicht an der Farbe: Für rot/grün-unterscheidungsschwache Nutzer
   sind 21 gleich aussehende Chips ohne Textmarke nicht prüfbar.
   ========================================================================= */
abschnitt("C", async () => {
console.log("\n--- C: Drei-Zustands-Chips ---");

const sp = neuerSpeicher(null);
await neuMontieren({ speicher: sp.api });
await durchlauf({ bis: "schlagwoerter" });

check("C", "die kuratierte Liste wird vollständig angeboten  [gemessen: " + chips().length
  + " Chips, Liste führt " + G.schlagwoerter().length + "]",
  () => chips().length === G.schlagwoerter().length);
check("C", "die drei Gruppen der Liste sind überschrieben  [gemessen: "
  + JSON.stringify(G.gruppen().map((g) => g.titel)) + "]",
  () => G.gruppen().every((g) => text().includes(g.titel)));
check("C", "die Bedienung wird in Worten erklärt (einmal/zweimal/dreimal)",
  () => text().includes("Einmal antippen heißt") && text().includes("dreimal wieder aus"));

const drama = () => chipMit("Drama");
check("C", "im Ausgangszustand ist kein Chip gedrückt  [gemessen: "
  + chips().filter((c) => c.getAttribute("aria-pressed") === "true").length + " gedrückt]",
  () => chips().every((c) => c.getAttribute("aria-pressed") === "false"));
check("C", "ein ungewählter Chip trägt KEIN Vorzeichen im Text  [gemessen: "
  + JSON.stringify(chipZustand(drama()).text) + "]", () => chipZustand(drama()).zeichen === "");

/* Der Kreis: aus → zieht_an → stoesst_ab → aus. Jede Stufe an BEIDEN
   Anzeigen gemessen — aria-pressed UND sichtbarer Text. */
await klick(drama(), "Drama 1x");
const z1 = chipZustand(drama());
check("C", "1x antippen = zieht_an: aria-pressed=true UND „+\" im Text  [gemessen: "
  + z1.gedrueckt + " / " + JSON.stringify(z1.text) + "]",
  () => z1.gedrueckt === "true" && z1.zeichen === "+");
check("C", "…und die Farbe ist T.ok — sie kommt ZUSÄTZLICH, nicht statt des Textes",
  () => drama().style.background === alsRgb(T.ok));
await klick(drama(), "Drama 2x");
const z2 = chipZustand(drama());
check("C", "2x antippen = stoesst_ab: aria-pressed=true UND „−\" im Text  [gemessen: "
  + z2.gedrueckt + " / " + JSON.stringify(z2.text) + "]",
  () => z2.gedrueckt === "true" && z2.zeichen === "−");
check("C", "…und die Farbe wechselt auf T.gefahr", () => drama().style.background === alsRgb(T.gefahr));
await klick(drama(), "Drama 3x");
const z3 = chipZustand(drama());
check("C", "3x antippen = wieder aus: aria-pressed=false UND kein Vorzeichen  [gemessen: "
  + z3.gedrueckt + " / " + JSON.stringify(z3.text) + "]",
  () => z3.gedrueckt === "false" && z3.zeichen === "");
check("C", "…und der Hintergrund ist wieder durchsichtig", () => drama().style.background === "transparent");
await klick(drama(), "Drama 4x");
check("C", "4x antippen schliesst den Kreis (wieder zieht_an)",
  () => chipZustand(drama()).zeichen === "+" && drama().getAttribute("aria-pressed") === "true");

/* Die beiden Richtungen sind unterscheidbar OHNE Farbe. Das ist die
   eigentliche Zusage: „+" ≠ „−", auch wenn beide `aria-pressed=true` sind. */
await klick(drama(), "Drama 5x");   // stoesst_ab
const gegen = chipZustand(drama());
await klick(chipMit("Komödie"), "Komödie");   // zieht_an
const fuer = chipZustand(chipMit("Komödie"));
check("C", "zieht_an und stoesst_ab sind allein am TEXT unterscheidbar  [gemessen: "
  + JSON.stringify(fuer.zeichen) + " vs " + JSON.stringify(gegen.zeichen) + "]",
  () => fuer.zeichen === "+" && gegen.zeichen === "−" && fuer.zeichen !== gegen.zeichen);
check("C", "…obwohl beide dasselbe aria-pressed tragen (der Text ist die einzige Trennung)",
  () => fuer.gedrueckt === gegen.gedrueckt && fuer.gedrueckt === "true");

/* Exklusivität: Ein Schlagwort kann nie beide Richtungen gleichzeitig tragen.
   Die Auswahl wird als Abbildung `id -> richtung` geführt, damit das in der
   DATENFORM erzwungen ist. Hier an der Ausgabe nachgemessen. */
check("C", "kein Chip trägt beide Vorzeichen gleichzeitig",
  () => chips().every((c) => !(c.textContent.includes("+ ") && c.textContent.includes("− "))));
await klick(knopf("Weiter"), "Weiter"); await klick(knopf("Weiter"), "Weiter");
await klick(knopf("Zur Übersicht"), "Zur Übersicht");
const vorschau = text();
check("C", "…und die Umrechnung erzeugt je Schlagwort höchstens EIN Signal  [gemessen: "
  + JSON.stringify((vorschau.match(/(mag|meidet) \w+/g) || [])) + "]",
  () => {
    const zeilen = alles("li").map((li) => li.textContent.replace(/\s+/g, " ").trim());
    const werte = zeilen.map((z) => z.replace(/^(mag|meidet)\s+/, "").replace(/\s*\(.*$/, ""));
    return werte.length === new Set(werte).size;
  });
check("C", "die Vorschau nennt für Drama genau die zuletzt gewählte Richtung („meidet\")",
  () => alles("li").some((li) => /meidet\s+drama/.test(li.textContent.replace(/\s+/g, " "))));
check("C", "…und NICHT zusätzlich „mag drama\"",
  () => !alles("li").some((li) => /mag\s+drama/.test(li.textContent.replace(/\s+/g, " "))));

/* Der Tooltip trägt die gemessene Trefferzahl — die Belegpflicht aus der
   Kuration, für den Nutzer sichtbar gemacht. */
await klick(knopf("Zurück"), "Zurück"); await klick(knopf("Zurück"), "Zurück"); await klick(knopf("Zurück"), "Zurück");
check("C", "jeder Chip mit gemessenen Treffern trägt die Zahl im title  [gemessen: "
  + JSON.stringify(chipMit("Drama")?.getAttribute("title")) + "]",
  () => {
    const mitTreffer = G.schlagwoerter().filter((s) => s.treffer);
    return mitTreffer.every((s) => {
      const c = chips().find((x) => x.textContent.replace(/^[+−]\s*/, "").trim() === s.anzeige);
      return c && c.getAttribute("title") === "traf bei der letzten Belegmessung " + (s.treffer.gesamt || 0) + " Filme";
    });
  });
check("C", "die Auswahl im Schlagwortschritt schreibt weiterhin nichts  [gemessen: "
  + sp.schreibOps().length + "]", () => sp.schreibOps().length === 0);
});

/* =========================================================================
   D — DER WEG DURCH DIE FÜNF SCHRITTE
   ========================================================================= */
abschnitt("D", async () => {
console.log("\n--- D: Weg durch die Schritte, Auswahl überlebt ---");

const sp = neuerSpeicher(null);
await neuMontieren({ speicher: sp.api });
const label = () => alles("[role=\"group\"]")[0]?.getAttribute("aria-label");

await durchlauf({ bis: "einwilligung" });
check("D", "Schritt 1 von 5", () => label() === "Geschmacksprofil anlegen — Schritt 1 von 5");
await klickT("Einverstanden");
check("D", "Schritt 2 von 5 — Schlagwörter", () => label() === "Geschmacksprofil anlegen — Schritt 2 von 5"
  && text().includes("Was zieht dich an, was stößt dich ab?"));
check("D", "der Stand wird angesagt (aria-live), zunächst „noch nichts gewählt\"  [gemessen: "
  + JSON.stringify(liveRegionen()) + "]", () => liveRegionen().includes("noch nichts gewählt"));
await klick(chipMit("Drama"), "Drama");
await klick(chipMit("Horror"), "Horror"); await klick(chipMit("Horror"), "Horror");
check("D", "…und zählt mit  [gemessen: " + JSON.stringify(liveRegionen()) + "]",
  () => liveRegionen().includes("2 gewählt"));
await klick(knopf("Weiter"), "Weiter");
check("D", "Schritt 3 von 5 — Filme", () => label() === "Geschmacksprofil anlegen — Schritt 3 von 5"
  && text().includes("Welche Filme treffen dich?"));
check("D", "der Filmschritt bietet nur wiedererkennbare und trennscharfe Titel an, "
  + "einen je Reihe  [gemessen: " + JSON.stringify(chips().map((c) => c.textContent.trim())) + "]",
  () => {
    const t = chips().map((c) => c.textContent.trim());
    return t.includes("Alien (1979)") && t.includes("Casablanca (1942)")
      && t.filter((x) => x.startsWith("Jackass")).length === 1
      && !t.some((x) => x.includes("Sehenswerte"));
  });
await klick(chipMit("Alien"), "Alien");
await klick(chipMit("Jackass"), "Jackass"); await klick(chipMit("Jackass"), "Jackass");
await klick(knopf("Weiter"), "Weiter");
check("D", "Schritt 4 von 5 — Achsen, mit den drei Reglern",
  () => label() === "Geschmacksprofil anlegen — Schritt 4 von 5"
    && alles("input[type=\"range\"]").length === 3);
check("D", "solange unberührt, sagt der Schritt das ausdrücklich",
  () => text().includes("Noch unberührt — so wandert keine Achsen-Angabe ins Profil.")
    && liveRegionen().includes("bleibt offen"));
/* NACHGEZOGEN AM 28.07.2026 (F1-Fix): Der Hinweis hat jetzt DREI Zustände,
   weil die Berührung je Achse geführt wird. Vorher stand hier ein Check auf
   zwei („unberührt" / „kippt"); er ist nicht gestrichen, sondern in alle drei
   Zustände aufgefächert — die mittlere Stufe ist die neue Zusage und die
   einzige, die dem Nutzer sagt, WELCHE Achsen er gerade bestätigt. */
await ziehe("WIE", 5);
check("D", "nach der ersten Bewegung nennt der Hinweis die berührte Achse  [gemessen: "
  + JSON.stringify(ausschnitt("Nur bewegte Regler")) + "]",
  () => !text().includes("Noch unberührt")
    && text().includes("Nur bewegte Regler wandern ins Profil: WIE."));
check("D", "…und die Fußleiste zählt sie  [gemessen: " + JSON.stringify(liveRegionen()) + "]",
  () => liveRegionen().includes("1 von 3 wird übernommen"));
await ziehe("WARUM", 1);
check("D", "eine zweite Achse wird ergänzt, nicht ersetzt  [gemessen: "
  + JSON.stringify(ausschnitt("Nur bewegte Regler")) + "]",
  () => text().includes("Nur bewegte Regler wandern ins Profil: WIE, WARUM.")
    && liveRegionen().includes("2 von 3 wird übernommen"));
await ziehe("WAS", 4);
check("D", "sind alle drei berührt, verschwindet der Hinweis (er hätte nichts mehr zu sagen)"
  + "  [gemessen: " + JSON.stringify(ausschnitt("Nur bewegte Regler")) + " / "
  + JSON.stringify(liveRegionen()) + "]",
  () => !text().includes("Nur bewegte Regler") && !text().includes("Noch unberührt")
    && liveRegionen().includes("3 von 3 wird übernommen"));
/* Für den Rückweg-Check unten wieder auf den alten Stand: nur WIE bewegt
   lässt sich nicht zurücknehmen (berührt bleibt berührt, siehe H), der Wert
   aber schon. */
await ziehe("WAS", 3); await ziehe("WARUM", 3);
await klick(knopf("Zur Übersicht"), "Zur Übersicht");
check("D", "Schritt 5 von 5 — Vorschau", () => label() === "Geschmacksprofil anlegen — Schritt 5 von 5"
  && text().includes("Das käme ins Profil"));

/* Der Rückweg. Die Auswahl darf dabei nicht verlorengehen — sonst ist der
   Rückweg eine Falle statt einer Korrekturmöglichkeit. */
await klick(knopf("Zurück"), "Zurück → Achsen");
check("D", "zurück auf die Achsen: der gezogene Wert steht noch",
  () => alles("input[type=\"range\"][aria-label=\"WIE\"]")[0].value === "5");
await klick(knopf("Zurück"), "Zurück → Filme");
check("D", "zurück auf die Filme: Alien „+\", Jackass „−\"  [gemessen: "
  + JSON.stringify(chips().map((c) => c.textContent.trim())) + "]",
  () => chipZustand(chipMit("Alien")).zeichen === "+" && chipZustand(chipMit("Jackass")).zeichen === "−");
await klick(knopf("Zurück"), "Zurück → Schlagwörter");
check("D", "zurück auf die Schlagwörter: Drama „+\", Horror „−\"",
  () => chipZustand(chipMit("Drama")).zeichen === "+" && chipZustand(chipMit("Horror")).zeichen === "−");
check("D", "…und der Zähler zählt weiterhin 2", () => liveRegionen().includes("2 gewählt"));
await klick(knopf("Zurück"), "Zurück → Einwilligung");
check("D", "der Rückweg führt bis zur Einwilligung zurück", () => label() === "Geschmacksprofil anlegen — Schritt 1 von 5");
await klickT("Einverstanden");
check("D", "…und ein zweites „Einverstanden\" verliert die Auswahl NICHT",
  () => chipZustand(chipMit("Drama")).zeichen === "+" && chipZustand(chipMit("Horror")).zeichen === "−");
check("D", "der gesamte Hin- und Rückweg hat nichts geschrieben  [gemessen: "
  + sp.schreibOps().length + "]", () => sp.schreibOps().length === 0);

/* Leerlauf: Wer nichts wählt, bekommt keinen aktiven Übernahmeknopf. Ein
   leerer Vorschlag hätte die Fassungsnummer gehoben, ohne dass sich etwas
   ändert — `vorschlagRahmen` weist ihn eigens ab (Z3). */
const sp2 = neuerSpeicher(null);
await neuMontieren({ speicher: sp2.api });
await durchlauf({ bis: "vorschau" });
check("D", "ohne jede Auswahl sagt die Vorschau das ehrlich",
  () => text().includes("Du hast nichts ausgewählt — es gibt nichts zu übernehmen."));
check("D", "…und „Ins Profil übernehmen\" ist gesperrt  [gemessen: disabled="
  + knopfTeil("Ins Profil übernehmen")?.disabled + "]",
  () => knopfTeil("Ins Profil übernehmen").disabled === true);
check("D", "…mit einer Begründung im title  [gemessen: "
  + JSON.stringify(knopfTeil("Ins Profil übernehmen")?.getAttribute("title")) + "]",
  () => knopfTeil("Ins Profil übernehmen").getAttribute("title") === "Es ist nichts ausgewählt");
await klick(knopfTeil("Ins Profil übernehmen"), "gesperrter Knopf");
check("D", "…und ein Klick darauf schreibt nichts  [gemessen: " + sp2.schreibOps().length + "]",
  () => sp2.schreibOps().length === 0);

/* Der Filmschritt bei leerem Bestand: überspringbar statt Sackgasse. */
const sp3 = neuerSpeicher(null);
await neuMontieren({ speicher: sp3.api, bekannteTitel: [] });
await durchlauf({ bis: "filme" });
check("D", "ohne bewertete Filme sagt der Schritt, dass er übersprungen werden kann",
  () => text().includes("Für diesen Schritt fehlen noch bewertete Filme im Bestand.")
    && text().includes("Du kannst ihn überspringen"));
check("D", "…und bietet keine Film-Chips an  [gemessen: " + chips().length + "]", () => chips().length === 0);
check("D", "…der Weg geht trotzdem weiter", () => !!knopf("Weiter"));
});

/* =========================================================================
   E — DIE VORSCHAU LÜGT NICHT
   -------------------------------------------------------------------------
   Was in der Vorschau steht, muss genau das sein, was danach im Profil landet.
   Gemessen wird beides gegeneinander: der Text der Vorschau und die Nutzlast
   des Schreibvorgangs.
   ========================================================================= */
abschnitt("E", async () => {
console.log("\n--- E: Die Vorschau lügt nicht ---");

const sp = neuerSpeicher(null);
await neuMontieren({ speicher: sp.api });
await durchlauf({ bis: "schlagwoerter" });
await klick(chipMit("Drama"), "Drama");                                   // zieht_an
await klick(chipMit("Horror"), "H"); await klick(chipMit("Horror"), "H"); // stoesst_ab
await klick(knopf("Weiter"), "Weiter");
await klick(chipMit("Alien"), "Alien");                                   // zieht_an
await klick(chipMit("Jackass"), "J"); await klick(chipMit("Jackass"), "J"); // stoesst_ab
await klick(knopf("Weiter"), "Weiter");
await ziehe("WIE", 5); await ziehe("WARUM", 1);
await klick(knopf("Zur Übersicht"), "Zur Übersicht");

const zeilen = alles("li").map((li) => li.textContent.replace(/\s+/g, " ").trim());
check("E", "die Vorschau nennt beide Richtungen im Wortlaut  [gemessen: " + JSON.stringify(zeilen) + "]",
  () => zeilen.some((z) => /^mag drama/.test(z)) && zeilen.some((z) => /^meidet horror/.test(z)));
check("E", "…und jeweils die Art in Klammern",
  () => zeilen.every((z) => /\((genre|ton|epoche)\)$/.test(z)));
check("E", "die Richtung steht auch in der FARBE, aber nicht nur dort  [gemessen: "
  + JSON.stringify(alles("li span").map((s) => s.textContent.trim())) + "]",
  () => {
    const s = alles("li > span");
    return s.some((x) => x.textContent.trim() === "mag" && x.style.color === alsRgb(T.ok))
      && s.some((x) => x.textContent.trim() === "meidet" && x.style.color === alsRgb(T.gefahr));
  });
const vorschauText = text();
check("E", "die Filmzeile nennt beide Richtungen mit Vorzeichen  [gemessen: "
  + JSON.stringify(ausschnitt("Filme:")) + "]",
  () => /Filme:\s*\+ Alien,\s*− Jackass Number Two/.test(vorschauText)
    || /Filme:\s*− Jackass Number Two,\s*\+ Alien/.test(vorschauText));
/* NACHGEZOGEN AM 28.07.2026 (F1-Fix). Vorher stand hier die Erwartung
   „WIE 5, WAS 3, WARUM 1" — der alte Vertrag, in dem eine einzige Bewegung
   alle drei Achsen festschrieb. Sie ist nicht gestrichen, sondern durch die
   schärfere Fassung ersetzt: Die Erwartung wird nicht mehr hingeschrieben,
   sondern AUS DER VORSCHAU GELESEN und gegen die Schreib-Nutzlast gehalten.
   Ein hingeschriebener Sollwert prüft, ob der Test aktuell ist; ein
   gelesener prüft, ob die Vorschau die Wahrheit sagt — und nur das ist die
   Zusage dieses Abschnitts.
   (Bei der Abnahme sah es kurz so aus, als zeige die Vorschau „Achsen: WIE",
   während WIE und WARUM geschrieben würden. Das war die Messanzeige dieses
   Checks, die am ersten Großbuchstaben abschnitt — siehe `ausschnitt` oben.
   Nachgemessen: die Zeile lautete „Achsen: WIE 5, WARUM 1", die Nutzlast
   `{wie:5, was:null, warum:1}`. Die Vorschau hat nicht gelogen.) */
const achsZeile = ausschnitt("Achsen:");
check("E", "die Achsenzeile nennt GENAU die berührten Achsen  [gemessen: "
  + JSON.stringify(achsZeile) + "]",
  () => achsZeile === "Achsen: WIE 5, WARUM 1");
check("E", "…und NICHT die unberührte  [gemessen: WAS genannt="
  + JSON.stringify(/WAS/.test(achsZeile || "")) + "]", () => !/WAS/.test(achsZeile));

/* Jetzt gegen das Geschriebene. Was die Vorschau behauptet hat, muss Feld für
   Feld dort stehen. */
await klickT("Ins Profil übernehmen");
const p = sp.ops.filter((o) => o.op === "schreibe").pop()?.p;
check("E", "Signale: genau die zwei aus der Vorschau, mit denselben Richtungen  [gemessen: "
  + JSON.stringify((p?.signale || []).map((s) => s.richtung + " " + s.wert)) + "]",
  () => p.signale.length === 2
    && p.signale.some((s) => s.wert === "drama" && s.richtung === "zieht_an")
    && p.signale.some((s) => s.wert === "horror" && s.richtung === "stoesst_ab"));
check("E", "Filme: genau die zwei aus der Vorschau, mit denselben Richtungen  [gemessen: "
  + JSON.stringify((p?.filme || []).map((f) => f.richtung + " " + f.titel)) + "]",
  () => p.filme.length === 2
    && p.filme.some((f) => f.titel === "Alien" && f.richtung === "zieht_an")
    && p.filme.some((f) => f.titel === "Jackass Number Two" && f.richtung === "stoesst_ab"));
/* Der eigentliche Vergleich: was in der Achsenzeile STAND, muss im Profil
   stehen — und was dort nicht stand, darf das Profil nicht verändert haben.
   Die Erwartung wird aus der Zeile abgeleitet, nicht danebengeschrieben. */
const genannteAchsen = Object.fromEntries((achsZeile || "").replace("Achsen:", "")
  .split(",").map((t) => t.trim()).filter(Boolean)
  .map((t) => { const [a, w] = t.split(/\s+/); return [a.toLowerCase(), Number(w)]; }));
check("E", "jede in der Vorschau genannte Achse steht so im Profil  [gemessen: genannt "
  + JSON.stringify(genannteAchsen) + " · geschrieben " + JSON.stringify(p?.achsen) + "]",
  () => Object.entries(genannteAchsen).every(([a, w]) => p.achsen[a] === w));
check("E", "…und jede NICHT genannte Achse blieb unverändert (hier: unbekannt)",
  () => ["wie", "was", "warum"].filter((a) => !(a in genannteAchsen))
    .every((a) => p.achsen[a] === null));
check("E", "…die Vorschau hat also weder etwas verschwiegen noch etwas erfunden  [gemessen: "
  + Object.keys(genannteAchsen).length + " genannt, "
  + Object.values(p?.achsen || {}).filter((v) => v !== null).length + " geschrieben]",
  () => Object.keys(genannteAchsen).length
    === Object.values(p.achsen).filter((v) => v !== null).length);
check("E", "jedes Signal trägt seinen Beleg — die Belegpflicht gilt auch deterministisch",
  () => p.signale.every((s) => typeof s.beleg === "string" && s.beleg.startsWith("schlagwort:")));
check("E", "jedes Signal trägt die Quelle `schlagwort`", () => p.signale.every((s) => s.quelle === "schlagwort"));
check("E", "die Filme tragen die masterId aus dem Angebot, nicht nur den Titel",
  () => p.filme.every((f) => typeof f.masterId === "string" && f.masterId.length > 0));
check("E", "in der Vorschau stand nichts, was NICHT im Profil landete (kein Zug zu viel)",
  () => zeilen.length === p.signale.length);

/* Der übergangene Eintrag. „Nicht übernommen" muss GENANNT werden — ein
   Schlagwort aus einem alten Build verschwände sonst wortlos, und der Nutzer
   glaubte, es sei übernommen. Zwei Fälle: eine Art, die das Modell nicht
   kennt (altbau-Bündel), und ein Film, der nicht mehr im Angebot steht. */
const altbauWurzel = createRoot(document.getElementById("altbauwurzel"));
const spA = neuerSpeicher(null);
feld = () => document.getElementById("altbauwurzel");
await act(async () => { altbauWurzel.render(h(GeschmackBereichAltbau, { bekannteTitel: TITEL, speicher: spA.api })); });
await ruhe();
await durchlauf({ bis: "schlagwoerter" });
check("E", "das altbau-Bündel bietet den Relikt-Chip wirklich an  [gemessen: "
  + chips().length + " Chips]", () => !!chipMit("Relikt aus altem Build"));
await klick(chipMit("Relikt aus altem Build"), "Relikt");
await klick(chipMit("Drama"), "Drama");
await klick(knopf("Weiter"), "Weiter");
await klick(chipMit("Alien"), "Alien");
await klick(knopf("Weiter"), "Weiter");
await klick(knopf("Zur Übersicht"), "Zur Übersicht");
const altText = text();
check("E", "ein Schlagwort mit unbekannter Art wird in der Vorschau GENANNT  [gemessen: "
  + JSON.stringify((altText.match(/Nicht übernommen:[^Z]*/) || [])[0]) + "]",
  () => /Nicht übernommen:.*altbau_relikt/.test(altText));
check("E", "…mit dem GRUND, nicht nur mit dem Namen",
  () => /altbau_relikt \(Art nicht im Modell: stimmung\)/.test(altText));
check("E", "…in der Warnfarbe T.gefahr",
  () => alles("p").some((x) => x.textContent.includes("Nicht übernommen") && x.style.color === alsRgb(T.gefahr)));
check("E", "…und es verschwindet NICHT still: die übrigen Züge stehen weiter da",
  () => altText.includes("mag drama"));
/* Der Film fällt aus dem Angebot, weil der Bestand sich unter der Hand
   ändert — der Aufrufer reicht eine andere Titelliste herein. */
await act(async () => { altbauWurzel.render(h(GeschmackBereichAltbau, { bekannteTitel: [{ id: "m9", titel: "Solaris", jahr: 1972, kategorie: "kult" }], speicher: spA.api })); });
await ruhe();
const altText2 = text();
check("E", "ein Film, der nicht mehr im Angebot steht, wird ebenfalls genannt  [gemessen: "
  + JSON.stringify((altText2.match(/Nicht übernommen:[^Z]*/) || [])[0]) + "]",
  () => /m1 \(nicht im Angebot\)/.test(altText2));
await klickT("Ins Profil übernehmen");
const pA = spA.ops.filter((o) => o.op === "schreibe").pop()?.p;
check("E", "…und beide landen nachweislich NICHT im Profil  [gemessen: signale="
  + JSON.stringify((pA?.signale || []).map((s) => s.wert)) + " filme=" + JSON.stringify(pA?.filme) + "]",
  () => pA.signale.length === 1 && pA.signale[0].wert === "drama" && pA.filme.length === 0);
check("E", "…und das Profil ist trotzdem gültig (kein halbes Signal gespeichert)",
  () => P.pruefeProfil(pA).length === 0);
await act(async () => { altbauWurzel.render(null); });
feld = () => document.getElementById("wurzel");
});


/* =========================================================================
   G — DIE FASSUNGSNUMMER STEIGT UM GENAU EINS JE DURCHLAUF
   -------------------------------------------------------------------------
   `uebernimmAlle` und `uebernimmRahmen` heben die Fassung JEWEILS selbst. Ohne
   die Korrektur am Ende von `uebernehmen` käme, wer Schlagwörter UND Filme
   wählt, von p0 auf p2, wer nur Schlagwörter wählt, auf p1 — die Zahl hinge
   also davon ab, wie viele Teilschritte zufällig etwas enthielten, und sagte
   nichts mehr über die Zahl der Änderungen aus.
   ========================================================================= */
abschnitt("G", async () => {
console.log("\n--- G: Fassungsnummer, genau eins je Durchlauf ---");

const KOMBIS = [
  ["nur Schlagwörter", { schlagwort: { text: "Drama", mal: 1 } }],
  ["nur Filme", { film: { text: "Alien", mal: 1 } }],
  ["nur Achsen", { achse: { achse: "WIE", wert: 5 } }],
  ["Schlagwörter + Filme", { schlagwort: { text: "Drama", mal: 1 }, film: { text: "Alien", mal: 1 } }],
  ["Schlagwörter + Achsen", { schlagwort: { text: "Drama", mal: 1 }, achse: { achse: "WAS", wert: 0 } }],
  ["Filme + Achsen", { film: { text: "Alien", mal: 1 }, achse: { achse: "WARUM", wert: 2 } }],
  ["alles zusammen", { schlagwort: { text: "Drama", mal: 1 }, film: { text: "Alien", mal: 1 }, achse: { achse: "WIE", wert: 4 } }],
];
for (const [name, kombi] of KOMBIS) {
  const sp = neuerSpeicher(null);
  await neuMontieren({ speicher: sp.api });
  await durchlauf(kombi);
  const p = sp.ops.filter((o) => o.op === "schreibe").pop()?.p;
  check("G", "p0 → p1 bei „" + name + "\"  [gemessen: " + p?.version + ", "
    + sp.ops.filter((o) => o.op === "schreibe").length + " Schreibvorgang/-gänge]",
    () => p?.version === "p1" && sp.ops.filter((o) => o.op === "schreibe").length === 1);
}

/* Zweiter Durchlauf auf einem BESTEHENDEN Profil — der Fall, in dem die
   Doppelzählung am ehesten durchrutscht, weil `sammle`/`uebernimmAlle` und
   `vorschlagRahmen`/`uebernimmRahmen` beide etwas zu tun haben. */
const sp = neuerSpeicher(null);
await neuMontieren({ speicher: sp.api });
await durchlauf({ schlagwort: { text: "Drama", mal: 1 } });
const v1 = sp.topf.version;
await durchlauf({ schlagwort: { text: "Komödie", mal: 1 }, film: { text: "Alien", mal: 1 }, achse: { achse: "WIE", wert: 5 } });
const v2 = sp.topf.version;
await durchlauf({ schlagwort: { text: "Horror", mal: 2 } });
const v3 = sp.topf.version;
check("G", "zweiter Durchlauf auf bestehendem Profil: p1 → p2  [gemessen: " + v1 + " → " + v2 + "]",
  () => v1 === "p1" && v2 === "p2");
check("G", "dritter Durchlauf: p2 → p3  [gemessen: " + v2 + " → " + v3 + "]", () => v3 === "p3");
check("G", "…und die Inhalte summieren sich statt sich zu ersetzen  [gemessen: "
  + JSON.stringify(sp.topf.signale.map((s) => s.richtung + " " + s.wert)) + "]",
  () => sp.topf.signale.length === 3
    && sp.topf.signale.some((s) => s.wert === "drama")
    && sp.topf.signale.some((s) => s.wert === "komoedie")
    && sp.topf.signale.some((s) => s.wert === "horror" && s.richtung === "stoesst_ab"));
check("G", "die Fassungsnummer bleibt in der Form, die die Edge Function akzeptiert",
  () => P.VERSION_FORM.test(sp.topf.version));
check("G", "…und jeder Zwischenstand war eine gültige Fassung  [gemessen: "
  + JSON.stringify(sp.ops.filter((o) => o.op === "schreibe").map((o) => o.p.version)) + "]",
  () => sp.ops.filter((o) => o.op === "schreibe").every((o) => P.VERSION_FORM.test(o.p.version)));

/* Ein Durchlauf, der NICHTS Neues bringt (dasselbe Schlagwort noch einmal):
   `sammle` erkennt die Dublette, `uebernimmAlle` hebt nichts — aber die
   Endkorrektur setzt die Fassung trotzdem. Gemessen, nicht behauptet. */
const vorher = sp.topf.version;
await durchlauf({ schlagwort: { text: "Drama", mal: 1 } });
check("G", "ein Durchlauf mit einer reinen Dublette hebt die Fassung dennoch  [gemessen: "
  + vorher + " → " + sp.topf.version + "]", () => sp.topf.version === "p4");
check("G", "…und legt das Signal nicht ein zweites Mal an  [gemessen: "
  + sp.topf.signale.filter((s) => s.wert === "drama").length + "x drama]",
  () => sp.topf.signale.filter((s) => s.wert === "drama").length === 1);
});

/* =========================================================================
   H — UNBERÜHRTE ACHSEN
   -------------------------------------------------------------------------
   Der Datenverlust-Fall aus Phase 1: Ein Vorschlag mit nur einer Achse setzte
   die anderen beiden auf null. `pickRahmen` mischt seither gegen das
   BESTEHENDE Profil, und das Onboarding schickt unberührte Regler gar nicht
   erst mit. Beides wird hier an der Oberfläche nachgemessen.
   ========================================================================= */
abschnitt("H", async () => {
console.log("\n--- H: Achsen — nur die berührten, und nur die ---");

/* NACHGEZOGEN AM 28.07.2026. Bis zum F1-Fix war `achsenBeruehrt` EIN Merker
   für alle drei Regler: Wer nur WIE anfasste, schrieb auch WAS 3 und WARUM 3
   — Werte, die nur die Stelle waren, an der ein Regler stehen musste. Der
   Abschnitt prüfte das nicht, er konnte es nicht: Er hatte für „unberührt"
   nur den Alles-oder-nichts-Fall. Jetzt wird jede Achse einzeln gemessen.
   Die alten beiden Zusagen („gar nicht angefasst → keine Angabe", „bestehende
   Achsen überleben") stehen unverändert weiter unten; sie sind nicht
   gestrichen, sie sind jetzt Sonderfälle einer schärferen Regel. */

/* ---------------------------------------------------------------- H/1
   Wer keine Achse bewegt, schreibt keine. */
const sp = neuerSpeicher(null);
await neuMontieren({ speicher: sp.api });
await durchlauf({ schlagwort: { text: "Drama", mal: 1 } });
const p1 = sp.ops.filter((o) => o.op === "schreibe").pop().p;
check("H", "keine Reglerbewegung → KEINE Achsen-Angabe  [gemessen: " + JSON.stringify(p1.achsen) + "]",
  () => Object.values(p1.achsen).every((v) => v === null));
check("H", "…und die Ansicht zeigt folgerichtig keine Achsen-Tendenz",
  () => !text().includes("Achsen-Tendenz"));

/* ---------------------------------------------------------------- H/2
   Wer genau eine Achse bewegt, schreibt genau eine — und zwar diese. Der
   Kern des F1-Fixes: Vorher standen hier zwangsläufig drei Werte. */
await durchlauf({ achse: { achse: "WIE", wert: 5 } });
const p2 = sp.ops.filter((o) => o.op === "schreibe").pop().p;
check("H", "genau EINE bewegte Achse → genau EINE geschriebene  [gemessen: "
  + JSON.stringify(p2.achsen) + "]",
  () => p2.achsen.wie === 5 && p2.achsen.was === null && p2.achsen.warum === null);
await klickT("Ändern");
await klickT("Aktuelle Infos");
check("H", "…die Ansicht weist nur diese aus  [gemessen: "
  + JSON.stringify(ausschnitt("Achsen-Tendenz:")) + "]",
  () => ausschnitt("Achsen-Tendenz:").startsWith("Achsen-Tendenz: WIE 5 (von 5)"));

/* ---------------------------------------------------------------- H/3
   Wer zwei bewegt, schreibt zwei — die dritte bleibt, was sie war. */
await durchlauf({ achsen: { WAS: 1, WARUM: 4 } });
const p3 = sp.ops.filter((o) => o.op === "schreibe").pop().p;
check("H", "zwei bewegte Achsen → zwei geschriebene  [gemessen: " + JSON.stringify(p3.achsen) + "]",
  () => p3.achsen.was === 1 && p3.achsen.warum === 4);
check("H", "…und die dritte behält ihren alten Wert, statt überschrieben zu werden"
  + "  [gemessen: WIE " + p3.achsen.wie + ", vorher " + p2.achsen.wie + "]",
  () => p3.achsen.wie === p2.achsen.wie);

/* ---------------------------------------------------------------- H/4
   Ein Regler, den der Nutzer auf seinen alten Wert ZURÜCKZIEHT, gilt
   weiterhin als berührt — er hat sich mit dem Wert befasst und ihn bestätigt.
   Das ist eine bewusste Entscheidung, kein Nebeneffekt; sie wird hier gepinnt,
   damit ein späteres „Optimieren" (Endwert == Startwert, also nichts tun) sie
   nicht still umdreht. Gebaut auf einem FRISCHEN Profil, damit der Beweis
   nicht darauf beruht, dass der Wert ohnehin schon dastand. */
const sp2 = neuerSpeicher(null);
await neuMontieren({ speicher: sp2.api });
await durchlauf({ bis: "achsen", schlagwort: { text: "Drama", mal: 1 } });
await ziehe("WAS", 0);
await ziehe("WAS", 3);   // zurück auf den Startwert
check("H", "eine hin- und zurückgezogene Achse gilt weiterhin als berührt  [gemessen: "
  + JSON.stringify(liveRegionen().filter((t) => /von 3/.test(t))) + " / "
  + JSON.stringify(ausschnitt("Nur bewegte Regler")) + "]",
  () => liveRegionen().includes("1 von 3 wird übernommen")
    && text().includes("Nur bewegte Regler wandern ins Profil: WAS."));
await klick(knopf("Zur Übersicht"), "Zur Übersicht");
check("H", "…und steht in der Vorschau  [gemessen: " + JSON.stringify(ausschnitt("Achsen:")) + "]",
  () => ausschnitt("Achsen:") === "Achsen: WAS 3");
await klickT("Ins Profil übernehmen");
const p4 = sp2.ops.filter((o) => o.op === "schreibe").pop().p;
check("H", "…und wird geschrieben, obwohl der Wert derselbe ist wie beim Start  [gemessen: "
  + JSON.stringify(p4.achsen) + "]",
  () => p4.achsen.was === 3 && p4.achsen.wie === null && p4.achsen.warum === null);

/* ---------------------------------------------------------------- H/5
   Der Phase-1-Datenverlust: Ein Durchlauf ohne Reglerbewegung darf bestehende
   Achsen nicht auf null setzen. */
const vorAchsen = JSON.stringify(sp.topf.achsen);
await neuMontieren({ speicher: sp.api });
await durchlauf({ schlagwort: { text: "Komödie", mal: 1 } });
const p5 = sp.ops.filter((o) => o.op === "schreibe").pop().p;
check("H", "ein Durchlauf OHNE Reglerbewegung lässt bestehende Achsen unangetastet"
  + "  [gemessen: vorher " + vorAchsen + " → nachher " + JSON.stringify(p5.achsen) + "]",
  () => JSON.stringify(p5.achsen) === vorAchsen);
check("H", "…und das ist der Phase-1-Datenverlust: keine Achse fiel auf null",
  () => Object.values(p5.achsen).every((v) => Number.isInteger(v)));

/* ---------------------------------------------------------------- H/6
   Die Regler starten auf dem BESTEHENDEN Profilwert, nicht auf einer Mitte.
   Sonst nähme ein Onboarding dem Nutzer stillschweigend eine Aussage weg. */
await klickT("Weitere Angaben");
await klick(knopf("Weiter"), "Weiter"); await klick(knopf("Weiter"), "Weiter");
check("H", "die Regler starten auf den bestehenden Profilwerten  [gemessen: "
  + JSON.stringify(alles("input[type=\"range\"]").map((i) => i.getAttribute("aria-label") + "=" + i.value)) + "]",
  () => JSON.stringify(alles("input[type=\"range\"]").map((i) => Number(i.value)))
    === JSON.stringify([sp.topf.achsen.wie, sp.topf.achsen.was, sp.topf.achsen.warum]));
check("H", "…und gelten trotzdem als unberührt, solange niemand zieht",
  () => text().includes("Noch unberührt — so wandert keine Achsen-Angabe ins Profil.")
    && liveRegionen().includes("bleibt offen"));

/* ---------------------------------------------------------------- H/7
   0 ist ein ECHTER Wert, kein fehlender — die App führt „0/0/0 ist eine echte
   Bewertung". Ein Bau, der 0 als „nicht gesetzt" läse, verlöre die Aussage
   „WAS interessiert mich gar nicht". */
await ziehe("WAS", 0);
await klick(knopf("Zur Übersicht"), "Zur Übersicht");
check("H", "eine 0 steht in der Vorschau als Wert  [gemessen: " + JSON.stringify(ausschnitt("Achsen:")) + "]",
  () => ausschnitt("Achsen:") === "Achsen: WAS 0");
await klickT("Ins Profil übernehmen");
const p6 = sp.ops.filter((o) => o.op === "schreibe").pop().p;
check("H", "…und landet als 0 im Profil, nicht als null  [gemessen: " + JSON.stringify(p6.achsen) + "]",
  () => p6.achsen.was === 0);
check("H", "…und die 0 verdrängt die übrigen Achsen nicht  [gemessen: "
  + JSON.stringify(p6.achsen) + "]",
  () => p6.achsen.wie === p5.achsen.wie && p6.achsen.warum === p5.achsen.warum);
});

/* =========================================================================
   I — DER WIDERRUF
   -------------------------------------------------------------------------
   Erst löschen, dann den Vermerk setzen. Andersherum stünde zwischendurch ein
   Profil MIT Inhalt und OHNE Einwilligung im Topf — und genau der Zustand
   wandert über ACCOUNT_SYNC_KEYS zum Server, wenn der Sync dazwischenfunkt.
   Geprüft wird die REIHENFOLGE der Schreibvorgänge, nicht das Endergebnis.
   ========================================================================= */
abschnitt("I", async () => {
console.log("\n--- I: Widerruf — Reihenfolge, Rest, Unterscheidbarkeit ---");

const sp = neuerSpeicher(null);
await neuMontieren({ speicher: sp.api });
await durchlauf({ schlagwort: { text: "Drama", mal: 1 }, film: { text: "Alien", mal: 1 }, achse: { achse: "WIE", wert: 5 } });
const vorWiderruf = tief(sp.topf);
sp.leeren();

check("I", "der Widerruf fragt zurück, bevor er wirkt", () => {
  return !!knopfTeil("Einwilligung widerrufen") && !knopfTeil("Ja, Profil löschen");
});
await klickT("Einwilligung widerrufen");
check("I", "die Rückfrage benennt, was genau gelöscht wird  [gemessen: "
  + JSON.stringify((text().match(/Das löscht[^D]*/) || [])[0]) + "]",
  () => text().includes("Das löscht dein Geschmacksprofil vollständig")
    && text().includes("bestätigten Angaben, offene Vorschläge, Filme, Achsen und nicht gedeuteten Angaben"));
check("I", "…und sagt zu, was UNBERÜHRT bleibt",
  () => text().includes("Deine Bewertungen, deine Sammlung und alles andere bleiben unberührt."));
check("I", "die Rückfrage lässt sich abbrechen", () => !!knopf("Abbrechen"));
await klick(knopf("Abbrechen"), "Abbrechen");
check("I", "…und das Abbrechen schreibt nichts  [gemessen: " + sp.schreibOps().length + "]",
  () => sp.schreibOps().length === 0);
check("I", "…das Profil steht danach unverändert da",
  () => JSON.stringify(sp.topf) === JSON.stringify(vorWiderruf));

await klickT("Einwilligung widerrufen");
await klickT("Ja, Profil löschen");
const folge = sp.folge();
check("I", "die ERSTE Topf-Operation des Widerrufs ist das Löschen, nicht das Schreiben"
  + "  [gemessen: " + JSON.stringify(folge) + "]",
  () => sp.schreibOps()[0]?.op === "loesche");
check("I", "die Reihenfolge ist löschen → lesen → schreiben  [gemessen: " + JSON.stringify(folge) + "]",
  () => JSON.stringify(folge) === JSON.stringify(["loesche", "lade", "schreibe"]));
const nachLoeschen = sp.ops.find((o) => o.op === "loesche").topf;
check("I", "nach dem Löschen steht schon KEIN Inhalt mehr im Topf  [gemessen: signale="
  + nachLoeschen.signale.length + " filme=" + nachLoeschen.filme.length + " achsen=" + JSON.stringify(nachLoeschen.achsen) + "]",
  () => nachLoeschen.signale.length === 0 && nachLoeschen.filme.length === 0
    && Object.values(nachLoeschen.achsen).every((v) => v === null));
check("I", "…und die Einwilligung stand zu diesem Zeitpunkt noch auf erteilt — "
  + "es gab also nie Inhalt ohne Zustimmung  [gemessen: " + JSON.stringify(nachLoeschen.einwilligung) + "]",
  () => nachLoeschen.einwilligung?.erteilt === true);
const nachSchreiben = sp.ops.find((o) => o.op === "schreibe").topf;
check("I", "erst der zweite Schritt setzt den Vermerk auf widerrufen  [gemessen: "
  + JSON.stringify(nachSchreiben.einwilligung) + "]",
  () => nachSchreiben.einwilligung?.erteilt === false);
check("I", "nach dem Widerruf ist nichts Inhaltliches übrig  [gemessen: "
  + JSON.stringify({ signale: sp.topf.signale.length, offen: sp.topf.offen.length,
    filme: sp.topf.filme.length, achsen: sp.topf.achsen, nichtDeutbar: sp.topf.nichtDeutbar.length }) + "]",
  () => sp.topf.signale.length === 0 && sp.topf.offen.length === 0 && sp.topf.filme.length === 0
    && sp.topf.nichtDeutbar.length === 0 && Object.values(sp.topf.achsen).every((v) => v === null));
check("I", "…aber der Topf ist NICHT weg: „widerrufen\" bleibt von „nie gefragt\" unterscheidbar"
  + "  [gemessen: " + JSON.stringify(sp.topf.einwilligung) + "]",
  () => sp.topf !== null && sp.topf.einwilligung !== null && sp.topf.einwilligung.erteilt === false
    && typeof sp.topf.einwilligung.am === "string");
check("I", "die Fassungsnummer fällt nicht auf p0 zurück  [gemessen: " + sp.topf.version + "]",
  () => sp.topf.version === vorWiderruf.version);
check("I", "das Ergebnis ist ein gültiges Profil", () => P.pruefeProfil(sp.topf).length === 0);
check("I", "der Nutzer bekommt eine Rückmeldung  [gemessen: " + JSON.stringify(liveRegionen()) + "]",
  () => liveRegionen().some((t) => t.includes("Profil gelöscht, Einwilligung widerrufen.")));
check("I", "…und steht wieder vor dem Angebot, eines anzulegen",
  () => text().includes("Du hast noch kein Geschmacksprofil.") && !!knopf("Profil anlegen"));

/* Nach dem Widerruf noch einmal zustimmen: Der Vermerk muss wieder auf
   „erteilt" springen, und der Inhalt fängt bei null an. */
sp.leeren();
await durchlauf({ schlagwort: { text: "Komödie", mal: 1 } });
check("I", "nach dem Widerruf kann erneut zugestimmt werden  [gemessen: "
  + JSON.stringify(sp.topf.einwilligung) + "]", () => sp.topf.einwilligung?.erteilt === true);
check("I", "…und das alte Signal ist nicht wieder da  [gemessen: "
  + JSON.stringify(sp.topf.signale.map((s) => s.wert)) + "]",
  () => sp.topf.signale.length === 1 && sp.topf.signale[0].wert === "komoedie");

/* Der Wächter über ALLE Schnappschüsse dieses Laufs — jeder Abschnitt, jede
   Operation. Er ist der eigentliche Ersatz für Befund P2: Nicht „an dieser
   Stelle war es richtig", sondern „an KEINER Stelle war es falsch". */
const inhaltOhneZustimmung = alleSchnappschuesse.filter((s) => {
  const p = s.topf;
  if (!p || p.beschaedigt) return false;
  const hatInhalt = (p.signale || []).length > 0 || (p.offen || []).length > 0
    || (p.filme || []).length > 0 || (p.nichtDeutbar || []).length > 0
    || Object.values(p.achsen || {}).some((v) => v != null);
  return hatInhalt && p.einwilligung?.erteilt !== true;
});
check("I", "WÄCHTER: in KEINEM Schnappschuss dieses Laufs stand Inhalt ohne erteilte "
  + "Einwilligung im Topf  [gemessen: " + alleSchnappschuesse.length + " Schnappschüsse, "
  + inhaltOhneZustimmung.length + " Verstöße"
  + (inhaltOhneZustimmung[0] ? ", erster bei „" + inhaltOhneZustimmung[0].op + "\"" : "") + "]",
  () => inhaltOhneZustimmung.length === 0);
check("I", "…und der Wächter hat wirklich etwas gesehen (kein Leerlauf)  [gemessen: "
  + alleSchnappschuesse.filter((s) => s.topf && (s.topf.signale || []).length > 0).length
  + " Schnappschüsse mit Inhalt]",
  () => alleSchnappschuesse.filter((s) => s.topf && (s.topf.signale || []).length > 0).length > 5);
});


/* =========================================================================
   J — DAS BESCHÄDIGTE PROFIL
   -------------------------------------------------------------------------
   `ladeProfil` markiert ein unlesbares Profil ausdrücklich als beschädigt,
   damit es nicht überschrieben wird. Die Oberfläche darf es deshalb weder als
   „leer" ausgeben noch etwas darüber schreiben.
   ========================================================================= */
abschnitt("J", async () => {
console.log("\n--- J: Das beschädigte Profil ---");

/* Die Schadensmarke wird nicht erfunden, sondern vom ECHTEN `ladeProfil`
   erzeugt: kaputtes JSON in den echten Topf, echt laden, Ergebnis ins Doppel.
   Ein selbst gebastelter Schadensfall wäre bloß eine Vermutung darüber, wie
   Schaden aussieht. */
dom.window.localStorage.setItem(TOPF.geschmacksprofil, "{das ist kein JSON");
const echterSchaden = await P.ladeProfil();
dom.window.localStorage.removeItem(TOPF.geschmacksprofil);
check("J", "der echte `ladeProfil` liefert für unlesbares JSON eine Schadensmarke  [gemessen: "
  + JSON.stringify(echterSchaden).slice(0, 110) + "]",
  () => echterSchaden?.beschaedigt === true && Array.isArray(echterSchaden.fehler) && echterSchaden.fehler.length > 0);

const sp = neuerSpeicher(null);
sp.topf = echterSchaden;
await neuMontieren({ speicher: sp.api });
check("J", "die Oberfläche behandelt es NICHT als leer  [gemessen: " + JSON.stringify(text().slice(0, 60)) + "]",
  () => !text().includes("Du hast noch kein Geschmacksprofil."));
check("J", "sie nennt den Befund ehrlich",
  () => text().includes("Dein gespeichertes Profil ist nicht lesbar."));
check("J", "…und sagt ausdrücklich zu, dass nichts verändert und nichts überschrieben wurde",
  () => text().includes("Es wurde nicht verändert und nicht überschrieben."));
check("J", "…und dass alles andere unberührt bleibt", () => text().includes("alles andere bleibt unberührt"));
check("J", "die Fehlergründe stehen da, nicht nur „irgendwas kaputt\"  [gemessen: "
  + JSON.stringify(echterSchaden.fehler.slice(0, 2)) + "]",
  () => echterSchaden.fehler.slice(0, 3).every((f) => text().includes(f)));
check("J", "der Befund steht in der Warnfarbe T.gefahr",
  () => alles("p").some((x) => x.textContent.includes("nicht lesbar") && x.style.color === alsRgb(T.gefahr)));
check("J", "es gibt GENAU EINEN Knopf, und der heisst nicht „Profil anlegen\"  [gemessen: "
  + JSON.stringify(knoepfe().map((b) => b.textContent.trim())) + "]",
  () => knoepfe().length === 1 && knoepfe()[0].textContent.trim() === "Profil verwerfen");
check("J", "das Anzeigen allein schreibt NICHTS  [gemessen: " + sp.schreibOps().length
  + " Schreibversuch(e), Folge " + JSON.stringify(sp.folge()) + "]", () => sp.schreibOps().length === 0);
check("J", "…und der beschädigte Topf steht unverändert da",
  () => JSON.stringify(sp.topf) === JSON.stringify(echterSchaden));

/* Ein beschädigtes Profil darf nicht heimlich als Grundlage für ein neues
   dienen — sonst wanderten die kaputten Reste mit. */
await klick(knopf("Profil verwerfen"), "Profil verwerfen");
check("J", "erst der ausdrückliche Klick schreibt  [gemessen: " + JSON.stringify(sp.folge()) + "]",
  () => JSON.stringify(sp.folge()) === JSON.stringify(["lade", "loesche", "lade", "schreibe"]));
check("J", "das Ergebnis ist ein gültiges, leeres Profil ohne Schadensmarke  [gemessen: "
  + JSON.stringify(sp.topf).slice(0, 120) + "]",
  () => !sp.topf.beschaedigt && P.pruefeProfil(sp.topf).length === 0 && sp.topf.signale.length === 0);
check("J", "…und trägt keine Zustimmung, die niemand gegeben hat  [gemessen: "
  + JSON.stringify(sp.topf.einwilligung) + "]", () => sp.topf.einwilligung?.erteilt !== true);
});

/* =========================================================================
   K — FEHLER BEIM SCHREIBEN
   -------------------------------------------------------------------------
   Eine Oberfläche, die auf den Klick gar nicht reagiert, ist der schlechteste
   Ausgang: Der Nutzer klickt noch einmal, und noch einmal.
   ========================================================================= */
abschnitt("K", async () => {
console.log("\n--- K: Fehler beim Schreiben ---");

const sp = neuerSpeicher(null);
await neuMontieren({ speicher: sp.api });
sp.wirftBeimSchreiben = "Speicher voll";
await durchlauf({ schlagwort: { text: "Drama", mal: 1 }, film: { text: "Alien", mal: 1 } });
check("K", "der Schreibversuch fand statt und wurde abgewiesen  [gemessen: "
  + JSON.stringify(sp.folge()) + "]", () => sp.folge().includes("schreib-versuch-abgewiesen"));
check("K", "der Klick endet NICHT in einem unbehandelten Fehler  [gemessen: "
  + unbehandelt.length + " unbehandelte Ablehnung(en)"
  + (unbehandelt[0] ? ": " + JSON.stringify(unbehandelt.slice(0, 2)) : "") + "]",
  () => unbehandelt.length === 0);
check("K", "der Nutzer bekommt eine Meldung — nicht Schweigen  [gemessen: "
  + JSON.stringify(liveRegionen()) + "]",
  () => liveRegionen().some((t) => t.includes("Konnte nicht gespeichert werden: Speicher voll")));
check("K", "die Meldung steht in einer aria-live-Region (auch für Screenreader)",
  () => alles("[aria-live=\"polite\"]").some((e) => e.textContent.includes("Konnte nicht gespeichert werden")));
check("K", "der Topf ist unberührt geblieben  [gemessen: " + JSON.stringify(sp.topf) + "]",
  () => sp.topf === null);
check("K", "die Oberfläche steht NICHT halb verändert da — die Vorschau ist noch offen",
  () => text().includes("Das käme ins Profil") && !!knopfTeil("Ins Profil übernehmen"));
check("K", "…und die Auswahl ist nicht verlorengegangen",
  () => alles("li").some((li) => /mag drama/.test(li.textContent.replace(/\s+/g, " "))));
check("K", "…und der Bereich ist nicht in die Profil-Ansicht gesprungen",
  () => !text().includes("Weitere Angaben machen"));

/* Der zweite Versuch nach behobenem Fehler muss durchgehen — und darf nichts
   doppelt anlegen. Ein Bau, der den halben Zustand behalten hätte, erzeugte
   hier zwei Signale statt eines. */
sp.wirftBeimSchreiben = null;
await klickT("Ins Profil übernehmen");
check("K", "der zweite Versuch trägt  [gemessen: " + JSON.stringify(sp.folge()) + "]",
  () => sp.folge().filter((o) => o === "schreibe").length === 1 && !!sp.topf);
check("K", "…und legt nichts doppelt an  [gemessen: signale="
  + JSON.stringify(sp.topf.signale.map((s) => s.wert)) + " filme=" + sp.topf.filme.length + "]",
  () => sp.topf.signale.length === 1 && sp.topf.filme.length === 1);
check("K", "…und die Fassung steht auf p1, nicht auf p2  [gemessen: " + sp.topf.version + "]",
  () => sp.topf.version === "p1");
check("K", "…die Fehlermeldung ist durch die Erfolgsmeldung ersetzt  [gemessen: "
  + JSON.stringify(liveRegionen()) + "]",
  () => liveRegionen().some((t) => t.includes("Profil gespeichert."))
    && !liveRegionen().some((t) => t.includes("Konnte nicht gespeichert werden")));

/* Derselbe Fall beim Korrigieren und beim Widerruf — dort sitzt der Fang an
   anderen Stellen. */
sp.wirftBeimSchreiben = "Netz weg";
await klickT("Ändern");
await klickT("Aktuelle Infos");
/* „Mag“ startet offen und enthält den Richtungswähler. */
const wahl = alles("select")[0];
await waehleAus(wahl, "stoesst_ab");
check("K", "eine fehlgeschlagene Korrektur meldet sich ebenfalls  [gemessen: "
  + JSON.stringify(liveRegionen()) + "]",
  () => liveRegionen().some((t) => t.includes("Konnte nicht gespeichert werden: Netz weg")));
check("K", "…und die Anzeige behauptet die Korrektur nicht  [gemessen: "
  + JSON.stringify(alles("select")[0].value) + "]",
  () => alles("select")[0].value === "zieht_an" && sp.topf.signale[0].richtung === "zieht_an");
await klickT("Einwilligung widerrufen");
await klickT("Ja, Profil löschen");
check("K", "ein fehlgeschlagener Widerruf meldet sich  [gemessen: " + JSON.stringify(liveRegionen()) + "]",
  () => liveRegionen().some((t) => t.includes("Widerruf fehlgeschlagen: Netz weg")
    || t.includes("Konnte nicht gespeichert werden: Netz weg")));
sp.wirftBeimSchreiben = null;

/* Auch ein Fehler beim LADEN darf nicht als „kein Profil" durchgehen. */
const sp2 = neuerSpeicher(null);
sp2.wirftBeimLaden = "Speicher nicht erreichbar";
fehlerRufe.length = 0;
await neuMontieren({ speicher: sp2.api, onFehler: (e) => fehlerRufe.push(String(e?.message || e)) });
check("K", "ein Ladefehler wird an `onFehler` gemeldet  [gemessen: " + JSON.stringify(fehlerRufe) + "]",
  () => fehlerRufe.some((t) => t.includes("Speicher nicht erreichbar")));
check("K", "…und der Bereich hängt nicht ewig im Ladezustand",
  () => text() !== "Profil wird geladen…");
});

/* =========================================================================
   L — ANSEHEN, KORRIGIEREN, ENTFERNEN, KI=AUS
   ========================================================================= */
abschnitt("L", async () => {
console.log("\n--- L: Ansehen, korrigieren, entfernen, KI=aus ---");

const sp = neuerSpeicher(null);
await neuMontieren({ speicher: sp.api });
await durchlauf({ schlagwort: { text: "Drama", mal: 1 }, film: { text: "Alien", mal: 1 }, achse: { achse: "WIE", wert: 5 } });
sp.topf.signale[0] = {
  ...sp.topf.signale[0],
  quelle: "bloganalyse",
  articleId: "blogartikel_1",
  contentHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  analyzedAt: "2026-08-16T00:00:00.000Z",
  promptVersion: "blog-profile-v1",
};
await neuMontieren({ speicher: sp.api });
await klickT("Ändern");
await klickT("Aktuelle Infos");

check("L", "die Ansicht nennt Fassung, Änderungsdatum und die Zahl der Angaben  [gemessen: "
  + JSON.stringify((text().match(/Fassung [^m]*/) || [])[0]) + "]",
  () => /Fassung p1 · zuletzt geändert \d{4}-\d{2}-\d{2} · 1 bestätigte Angabe/.test(text()));
check("L", "jeder Zug trägt seine HERKUNFT  [gemessen: "
  + JSON.stringify(text().includes("von dir angekreuzt")) + "]",
  () => text().includes("von dir angekreuzt"));
check("L", "jeder Zug hat einen Richtungswähler mit sprechendem aria-label  [gemessen: "
  + JSON.stringify(alles("select").map((s) => s.getAttribute("aria-label"))) + "]",
  () => alles("select").some((s) => s.getAttribute("aria-label") === "Richtung für drama"));
check("L", "…und der Wähler bietet genau die drei Richtungen des Modells  [gemessen: "
  + JSON.stringify([...alles("select")[0].options].map((o) => o.value)) + "]",
  () => JSON.stringify([...alles("select")[0].options].map((o) => o.value)) === JSON.stringify(P.RICHTUNGEN));
check("L", "…in Worten statt in Kennungen  [gemessen: "
  + JSON.stringify([...alles("select")[0].options].map((o) => o.textContent)) + "]",
  () => JSON.stringify([...alles("select")[0].options].map((o) => o.textContent))
    === JSON.stringify(["mag", "meidet", "zwiespältig zu"]));
check("L", "der Entfernen-Knopf sagt im aria-label, WAS er entfernt  [gemessen: "
  + JSON.stringify(alles("button").find((b) => b.getAttribute("aria-label") === "„mag drama“ entfernen")?.getAttribute("aria-label")) + "]",
  () => Boolean(alles("button").find((b) => b.getAttribute("aria-label") === "„mag drama“ entfernen")));

sp.leeren();
await waehleAus(alles("select")[0], "stoesst_ab");
check("L", "die Korrektur schreibt genau einmal  [gemessen: " + JSON.stringify(sp.folge()) + "]",
  () => sp.folge().filter((o) => o === "schreibe").length === 1);
check("L", "…und dreht die Richtung  [gemessen: " + JSON.stringify(sp.topf.signale[0].richtung) + "]",
  () => sp.topf.signale[0].richtung === "stoesst_ab");
check("L", "…hebt die Fassung um eins  [gemessen: " + sp.topf.version + "]", () => sp.topf.version === "p2");
check("L", "…trägt den ursprünglichen Beleg WEITER (die Belegpflicht ist über die "
  + "Korrektur nicht aushebelbar)  [gemessen: " + JSON.stringify(sp.topf.signale[0].beleg) + "]",
  () => sp.topf.signale[0].beleg === "schlagwort:drama");
check("L", "…und schreibt die Quelle auf `korrektur`  [gemessen: "
  + JSON.stringify(sp.topf.signale[0].quelle) + "]", () => sp.topf.signale[0].quelle === "korrektur");
check("L", "…und entfernt exakt alle Blog-Metadaten  [gemessen: " + JSON.stringify(
  {
    articleId: Object.prototype.hasOwnProperty.call(sp.topf.signale[0], "articleId"),
    contentHash: Object.prototype.hasOwnProperty.call(sp.topf.signale[0], "contentHash"),
    analyzedAt: Object.prototype.hasOwnProperty.call(sp.topf.signale[0], "analyzedAt"),
    promptVersion: Object.prototype.hasOwnProperty.call(sp.topf.signale[0], "promptVersion"),
  },
) + "]",
  () => !Object.prototype.hasOwnProperty.call(sp.topf.signale[0], "articleId")
    && !Object.prototype.hasOwnProperty.call(sp.topf.signale[0], "contentHash")
    && !Object.prototype.hasOwnProperty.call(sp.topf.signale[0], "analyzedAt")
    && !Object.prototype.hasOwnProperty.call(sp.topf.signale[0], "promptVersion"));
check("L", "…die korrigierte Anzeige bleibt ein valides Profil  [gemessen: " + JSON.stringify(P.pruefeProfil(sp.topf)) + "]",
  () => P.pruefeProfil(sp.topf).length === 0);
/* NACHGEZOGEN AM 28.07.2026 (F3-Fix). `herkunft()` fragte zuerst
   `ausSchlagwort(s)`; weil der Beleg bei einer Korrektur ausdrücklich
   mitwandert, traf dieser Zweig immer, und die Ansicht sagte „von dir
   angekreuzt", wo der Nutzer der Angabe gerade widersprochen hatte. Im
   KI-losen Weg gibt es keine andere Signalquelle — der Korrektur-Zweig war
   dort vollständig tot. Die Zusage steht jetzt scharf statt als
   Auffälligkeit. */
check("L", "…und die Ansicht weist den Zug als KORRIGIERT aus, nicht als angekreuzt"
  + "  [gemessen: " + JSON.stringify(text().includes("von dir korrigiert") ? "von dir korrigiert"
    : text().includes("von dir angekreuzt") ? "von dir angekreuzt" : "(anderes)") + "]",
  () => text().includes("von dir korrigiert") && !text().includes("von dir angekreuzt"));
check("L", "…und der Beleg bleibt trotzdem sichtbar am Zug (nicht gegen die Belegpflicht "
  + "eingetauscht)  [gemessen: " + JSON.stringify(sp.topf.signale[0].beleg) + "]",
  () => sp.topf.signale[0].beleg === "schlagwort:drama");
check("L", "…die Anzeige folgt  [gemessen: " + JSON.stringify(text().slice(0, 60)) + "]",
  () => text().includes("meidet") && liveRegionen().some((t) => t.includes("Korrigiert.")));
check("L", "…und das Ergebnis bleibt ein gültiges Profil", () => P.pruefeProfil(sp.topf).length === 0);

sp.leeren();
await klick(alles("button").find((b) => b.getAttribute("aria-label") === "„meidet drama“ entfernen"));
check("L", "das Entfernen schreibt genau einmal und wirkt sofort  [gemessen: "
  + JSON.stringify(sp.folge()) + ", signale=" + sp.topf.signale.length + "]",
  () => sp.folge().filter((o) => o === "schreibe").length === 1 && sp.topf.signale.length === 0);
check("L", "…hebt die Fassung  [gemessen: " + sp.topf.version + "]", () => sp.topf.version === "p3");
check("L", "…lässt Filme und Achsen unberührt  [gemessen: filme=" + sp.topf.filme.length
  + " achsen=" + JSON.stringify(sp.topf.achsen) + "]",
  () => sp.topf.filme.length === 1 && sp.topf.achsen.wie === 5);
check("L", "…und sagt es  [gemessen: " + JSON.stringify(liveRegionen()) + "]",
  () => liveRegionen().some((t) => t.includes("Entfernt.")));
check("L", "…die Ansicht sagt danach ehrlich, dass nichts Bestätigtes mehr da ist",
  () => text().includes("Im Profil steht noch nichts Bestätigtes."));

/* `nichtDeutbar` ist persönlicher Modelltext und läuft über Backup/Sync.
   Deshalb muss er nach der Übernahme genauso einsehbar und einzeln löschbar
   sein wie ein Signal — Gesamtwiderruf allein ist keine Korrekturfunktion. */
sp.topf = { ...sp.topf, version: "p4", nichtDeutbar: ["das Ende blieb unklar"] };
await neuMontieren({ speicher: sp.api });
await klickT("Ändern");
await klickT("Aktuelle Infos");
check("L", "nicht gedeutete Modellangaben sind im gespeicherten Profil sichtbar",
  () => text().includes("Nicht gedeutet:") && text().includes("das Ende blieb unklar"));
const unklarEntfernen = alles("button").find((b) =>
  b.getAttribute("aria-label") === "„das Ende blieb unklar“ entfernen");
check("L", "…und haben einen einzeln beschrifteten Entfernen-Knopf", () => !!unklarEntfernen);
sp.leeren();
await klick(unklarEntfernen, "nicht gedeutete Angabe entfernen");
check("L", "…der persönliche Modelltext wird mit genau einem Schreibvorgang entfernt",
  () => sp.schreibOps().length === 1 && sp.topf.nichtDeutbar.length === 0);
check("L", "…und die Löschung hebt die Profilfassung", () => sp.topf.version === "p5");

/* Der KI=aus-Hinweis. Der Schalter ist gerätelokal, das Profil kontogebunden —
   beides schweigend zu übergehen wäre irreführend, beides gleichzusetzen auch. */
await montiere({ speicher: sp.api, kiGeraeteweiseAus: true });
check("L", "bei KI=aus steht der Hinweis  [gemessen: "
  + JSON.stringify(text().slice(0, 80)) + "]",
  () => text().includes("Dein Profil ist angelegt und bleibt erhalten."));
check("L", "…er sagt, dass das Profil ERHALTEN bleibt (nicht: gelöscht/inaktiv)",
  () => text().includes("bleibt erhalten") && !text().includes("inaktiv"));
check("L", "…er benennt die Gerätelokalität",
  () => text().includes("Auf diesem Gerät steht der KI-Schalter allerdings auf „aus“")
    || text().includes("Auf diesem Gerät steht der KI-Schalter allerdings auf „aus\""));
check("L", "…und sagt zu, dass es woanders und später wirkt",
  () => text().includes("Auf anderen Geräten und sobald du KI einschaltest, wird es verwendet."));
check("L", "…steht aber NICHT in der Warnfarbe (es ist kein Fehler)",
  () => alles("p").filter((x) => x.textContent.includes("bleibt erhalten"))
    .every((x) => x.style.color !== alsRgb(T.gefahr)));
check("L", "…und blockiert nichts: weitere Angaben bleiben möglich", () => !!knopfTeil("Weitere Angaben"));
await montiere({ speicher: sp.api, kiGeraeteweiseAus: false });
check("L", "bei KI=an steht der Hinweis NICHT  [gemessen: "
  + JSON.stringify(text().includes("bleibt erhalten")) + "]",
  () => !text().includes("Dein Profil ist angelegt und bleibt erhalten."));
check("L", "…und die übrige Ansicht ist dieselbe",
  () => text().includes("Fassung " + sp.topf.version));

/* Offene Vorschläge werden genannt, auch wenn sie hier nicht bestätigt werden
   können — sonst hält der Nutzer das Profil für vollständig. */
const mitOffen = { ...tief(sp.topf), offen: [
  { art: "genre", wert: "horror", richtung: "stoesst_ab", staerke: 3, sicherheit: "mittel", quelle: "K1", beleg: "text:xyz" },
] };
const sp2 = neuerSpeicher(mitOffen);
await neuMontieren({ speicher: sp2.api, kiGeraeteweiseAus: false });
check("L", "wartende Vorschläge werden genannt  [gemessen: "
  + JSON.stringify((text().match(/\d+ Vorschl[^.]*/) || [])[0]) + "]",
  () => /1 Vorschlag wartet auf deine Bestätigung/.test(text()));
check("L", "…und das blosse Anzeigen schreibt nichts  [gemessen: " + sp2.schreibOps().length + "]",
  () => sp2.schreibOps().length === 0);
});

/* =========================================================================
   M — ERREICHBARKEIT OHNE KI (DatenTab)
   -------------------------------------------------------------------------
   Der Abnahme-Anker der Etappe: „ein KI-loser Start ist vollwertig". Ein
   Profil-Block, der sich mit dem KI-Schalter versteckt, hätte ihn in der
   Oberfläche zurückgenommen.
   ========================================================================= */
abschnitt("M", async () => {
console.log("\n--- M: Erreichbarkeit ohne KI ---");

feld = () => document.getElementById("tabwurzel");
const tabProps = (kiStand, extra = {}) => ({
  master: TITEL, masterMeta: {}, programm: [], einstellungen: {}, kiStand,
  /* Echte Laufzeitform: Streamingdateien sind Hüllen mit `titel`, nicht
     direkt die Titelliste. Der alte Test hatte dadurch den falschen
     `bekannteTitel={streamingBekannt}`-Pfad versehentlich grün gehalten. */
  streamingBekannt: { stand: "test", titel: TITEL }, streamingEntdecken: { titel: [] },
  auswahl: [], vokabular: [], artikelListe: [],
  ...extra,
});
const klappen = () => alles("details").map((d) => ({ el: d, titel: d.querySelector("summary")?.textContent.trim() }));
const geschmackKlappe = () => klappen().find((k) => k.titel === "Geschmacksprofil")?.el || null;
const kiKlappe = () => klappen().find((k) => k.titel === "KI-Funktionen")?.el || null;

/* Alle Stände des Schalters: nie entschieden (null), ausdrücklich aus
   (false), an (true). Der Block muss in allen da sein — und DatenTab muss in
   allen überhaupt RENDERN.

   NACHGEZOGEN AM 28.07.2026. Bis zum F2-Fix warf `global: true` eine
   ReferenceError: `KI_FUNKTIONEN` war in DatenTab.jsx benutzt und nirgends
   importiert, und die App hat keine Fehlergrenze — die Einstellungen wurden
   zur weißen Seite. Der Befund stand seit `df4cc36` im Repo und ist durch
   alle Gates gerutscht, weil KEIN Test DatenTab je gerendert hat: Ein
   fehlender Import ist für den Bündler ein Global, für `vite build` also
   unauffällig. Der Fall stand hier zuerst als abgefangene Auffälligkeit; er
   ist jetzt eine scharfe Zusage, denn genau diese Sorte Fehler soll beim
   nächsten Mal SOFORT auffallen. Gemessen wird nicht der Import, sondern das
   Rendern — ein Quelltextcheck auf „importiert kiSchalter" ginge beim
   nächsten fehlenden Import einer anderen Datei wieder durch. */
for (const stand of [null, false, true]) {
  dom.window.localStorage.removeItem(TOPF.geschmacksprofil);
  let bruch = null;
  try {
    await act(async () => { tabWurzel.render(h(DatenTab, tabProps({ global: stand, funktionen: {} }))); });
    await ruhe();
  } catch (e) { bruch = e.message; }
  check("M", "DatenTab rendert bei kiStand.global=" + JSON.stringify(stand)
    + " ohne Fehler  [gemessen: " + (bruch ? "ABSTURZ: " + bruch : "kein Fehler") + "]",
    () => bruch === null);
  const g = geschmackKlappe();
  check("M", "bei kiStand.global=" + JSON.stringify(stand) + " gibt es die Klappe „Geschmacksprofil\""
    + "  [gemessen: " + JSON.stringify(klappen().map((k) => k.titel)) + "]", () => !!g);
  check("M", "…und sie steckt NICHT in der Klappe „KI-Funktionen\"",
    () => !!g && !!kiKlappe() && !kiKlappe().contains(g));
  check("M", "…und sie zeigt den Bereich  [gemessen: "
    + JSON.stringify(g?.textContent.replace(/\s+/g, " ").trim().slice(16, 60)) + "]",
    () => !!g && g.textContent.includes("Du hast noch kein Geschmacksprofil."));
}

/* Der Dienst schützt den Transport bereits mit `requireAccount`, aber die
   Oberfläche muss die persönlichen Antworten VOR dem Formular abfangen.
   Gleichzeitig pinnt diese Probe den echten Genrepfad: Nur wenn DatenTab die
   Genres aus der Masterliste bis zu GeschmackBereich führt, darf der KI-Weg
   für ein berechtigtes Konto sichtbar werden. */
const montiereTabNeu = async (props) => {
  await act(async () => { tabWurzel.render(null); });
  dom.window.localStorage.removeItem(TOPF.geschmacksprofil);
  feld = () => document.getElementById("tabwurzel");
  await act(async () => { tabWurzel.render(h(DatenTab, props)); });
  await ruhe();
  const bereich = geschmackKlappe();
  feld = () => bereich;
};
await montiereTabNeu(tabProps(
  { global: true, funktionen: { profil: true } },
  { kiProfilFaehig: false },
));
check("M", "Gast/fehlende KI-Fähigkeit: das persönliche Freitextformular öffnet gar nicht",
  () => !text().includes("Mit drei Fragen anlegen"));

await montiereTabNeu(tabProps(
  { global: true, funktionen: { profil: true } },
  { kiProfilFaehig: true },
));
check("M", "Konto + Schalter + echte Master-Genres: der Drei-Fragen-Weg ist erreichbar",
  () => text().includes("Mit drei Fragen anlegen"));

/* Und vollständig bedienbar bei KI=aus — mit dem ECHTEN Speicher, also ohne
   die `speicher`-Prop. Das ist der Weg, den DatenTab tatsächlich einhängt. */
dom.window.localStorage.removeItem(TOPF.geschmacksprofil);
feld = () => document.getElementById("tabwurzel");
await act(async () => { tabWurzel.render(h(DatenTab, tabProps({ global: false, funktionen: {} }))); });
await ruhe();
const g = geschmackKlappe();
feld = () => g;
check("M", "bei KI=aus steht im Bereich der KI=aus-Hinweis noch nicht (kein Profil)",
  () => !text().includes("Dein Profil ist angelegt"));
await klick(knopf("Profil anlegen"), "Profil anlegen (DatenTab)");
await klickT("Einverstanden");
check("M", "der Erhebungsweg öffnet sich bei KI=aus vollständig  [gemessen: "
  + chips().length + " Chips]", () => chips().length === G.schlagwoerter().length);
await klick(chipMit("Drama"), "Drama");
await klick(knopf("Weiter"), "Weiter");
await klick(knopf("Weiter"), "Weiter");
await klick(knopf("Zur Übersicht"), "Zur Übersicht");
await klickT("Ins Profil übernehmen");
const ausTopf = JSON.parse(dom.window.localStorage.getItem(TOPF.geschmacksprofil) || "null");
check("M", "…und schreibt ohne die `speicher`-Prop in den ECHTEN Topf  [gemessen: "
  + JSON.stringify(ausTopf && { v: ausTopf.version, s: ausTopf.signale.map((x) => x.wert) }) + "]",
  () => !!ausTopf && ausTopf.version === "p1" && ausTopf.signale.length === 1
    && ausTopf.signale[0].wert === "drama");
check("M", "…mit erteilter Einwilligung", () => ausTopf.einwilligung?.erteilt === true);
check("M", "…und der KI=aus-Hinweis steht jetzt da",
  () => text().includes("Dein Profil ist angelegt und bleibt erhalten."));
check("M", "…das Ergebnis ist ein gültiges Profil", () => P.pruefeProfil(ausTopf).length === 0);
dom.window.localStorage.removeItem(TOPF.geschmacksprofil);

/* Quelltext-Zusicherung: Das Geschmacksprofil darf NICHTS aus services/ai.js
   brauchen. Ein Import dort machte den KI-losen Weg von der KI abhängig — die
   Bündelprüfung sähe das nicht, weil DatenTab die Datei ohnehin mitzieht. */
/* Phase 3 VERENGT diese Zusage bewusst, statt sie aufzugeben. Der Container
   `GeschmackBereich` importiert seit dem KI-Weg `services/ai.js` und macht
   den bezahlten Aufruf. Das zusammengesetzte Gate liegt in DatenTab, wo
   Konto-Fähigkeit, globaler Schalter, Funktionsschalter und Werteliste
   gleichzeitig vorliegen. Die drei inhaltlichen Komponenten duerfen beides
   weiterhin NICHT: Sobald das
   Formular, die Ansicht oder die Umrechnung von der KI abhaengen, ist der
   KI-lose Weg keiner mehr, und der Abnahme-Anker der Etappe faellt.
   `bereich` steht deshalb nicht mehr in der Liste -- aber die Verengung ist
   nur dann ehrlich, wenn stattdessen GEPRUEFT wird, dass der Container ohne
   KI vollstaendig bedienbar bleibt. Das tun die Checks im Abschnitt L
   (`kiWegOffen === false`) und der komplette Durchlauf weiter oben. */
const ohneKi = ["onboarding", "ansicht", "geschmack"];
/* Auf IMPORT-Zeilen geprüft, nicht auf das blosse Vorkommen der Zeichenkette:
   der Modulkopf von geschmack.js NENNT `services/ai.js` ausdrücklich („dieses
   Modul darf davon nichts brauchen und tut es nicht"), und ein Test, der über
   einen Kommentar stolpert, misst die Rechtschreibung statt der Abhängigkeit. */
const importiert = (k, muster) => new RegExp("^\\s*(import|export)[^\\n]*" + muster, "m").test(QUELLEN[k].text);
check("M", "ausser dem Container importiert kein Geschmacks-Modul services/ai.js  [gemessen: "
  + JSON.stringify(ohneKi.filter((k) => importiert(k, "services/ai\\.js"))) + "]",
  () => ohneKi.every((k) => !importiert(k, "services/ai\\.js")));
check("M", "…und keines von ihnen den KI-Schalter (`kiSchalter.js`)  [gemessen: "
  + JSON.stringify(ohneKi.filter((k) => importiert(k, "kiSchalter"))) + "]",
  () => ohneKi.every((k) => !importiert(k, "kiSchalter")));
/* Die Gegenrichtung, damit die Verengung keine Luecke wird: Der Container
   führt den Aufruf, DatenTab setzt das fertige Gate als Boolean. */
check("M", "Container führt den Aufruf, DatenTab das zusammengesetzte Gate  [gemessen: ai="
  + importiert("bereich", "services/ai\\.js") + ", kiAktiv="
  + /kiAktiv=\{kiProfilFaehig/.test(QUELLEN.datentab.text) + "]",
  () => importiert("bereich", "services/ai\\.js")
    && /kiAktiv=\{kiProfilFaehig/.test(QUELLEN.datentab.text)
    && !importiert("bereich", "kiSchalter"));
check("M", "in DatenTab hängt die Klappe nicht an einer Bedingung mit `kiStand`"
  + "  [gemessen: " + JSON.stringify((QUELLEN.datentab.text.match(/.{0,60}Klappe titel="Geschmacksprofil"/s) || [])[0]?.slice(-60)) + "]",
  () => {
    const i = QUELLEN.datentab.text.indexOf("<Klappe titel=\"Geschmacksprofil\">");
    if (i < 0) return false;
    /* Die 200 Zeichen davor: dort stünde ein `{kiStand… && (` einer
       bedingten Einbettung. */
    return !/kiStand[^]{0,80}&&\s*\(\s*$/.test(QUELLEN.datentab.text.slice(Math.max(0, i - 200), i));
  });

check("M", "kein einziger Netzzugriff im ganzen Lauf  [gemessen: " + netzVersuche.length + "]",
  () => netzVersuche.length === 0);
await act(async () => { tabWurzel.render(null); });
feld = () => document.getElementById("wurzel");
});


/* =========================================================================
   N — BLOGDIALOG-INTEGRATION (E17A)
   ========================================================================= */
abschnitt("N", async () => {
console.log("\n--- N: Blogdialog in Einstellungen ---");

const bereichText = QUELLEN.bereich.text;
const datentabText = QUELLEN.datentab.text;
const blogAktivAusdruck = (bereichText.match(/const blogAktiv\s*=\s*([\s\S]*?);/) || ["", ""])[1] || "";

check("N", "DatenTab reicht Blog-Basisdaten deterministisch an den Geschmacksbereich weiter",
  () => datentabText.includes("<GeschmackBereich")
    && datentabText.includes("artikelListe={artikelListe}")
    && datentabText.includes("bekannteTags={bekannteTags}")
    && datentabText.includes("vokabular={vokabular}")
    && datentabText.includes("kontoId={kontoId}")
    && datentabText.includes("onVokabularSpeichern={saveVokabular}"));

check("N", "DatenTab berechnet Blog-Tags ausschließlich aus master[].tags, mit NFKC/Whitespace/Dedupe",
  () => datentabText.includes("const bekannteTags = useMemo(() => {")
    && datentabText.includes('eintrag?.tags')
    && datentabText.includes('normalisiereAnzeige(')
    && datentabText.includes('normalisiereTagDedupe(')
    && datentabText.includes('genresSet'));

check("N", "GeschmackBereich verdrahtet den Blogdialog mit Profil-/Vokabular-Propertie",
  () => bereichText.includes("<BlogProfilAnalyse")
    && bereichText.includes("artikelListe={artikelListe}")
    && bereichText.includes("bekannteTags={bekannteTags}")
    && bereichText.includes("accountId={kontoId}")
    && bereichText.includes("vokabular={vokabular}")
    && bereichText.includes("onVokabularSpeichern={vokabularWriter}")
    && /<BlogProfilAnalyse[\s\S]*onFehler=\{onFehlerText\}/.test(bereichText));

check("N", "Blog-Pfad bleibt auf KI-, Konto-, Profil-Geltigkeit und Writer-Existenz gebremst",
  () => blogAktivAusdruck.includes("kiWegOffen")
    && blogAktivAusdruck.includes("kontoBereit")
    && blogAktivAusdruck.includes("profil?.einwilligung?.erteilt === true")
    && blogAktivAusdruck.includes("profilGueltig()")
    && blogAktivAusdruck.includes("typeof onVokabularSpeichern === \"function\""));

dom.window.localStorage.setItem(TOPF.geschmacksprofil, JSON.stringify(P.erteileEinwilligung(LEER(), "2026-08-17T00:00:00.000Z")));
feld = () => document.getElementById("tabwurzel");
await act(async () => { tabWurzel.render(h(DatenTab, {
  master: [{ titel: "Demo", genre: ["Drama"], tags: ["Drama"] }],
  masterMeta: {}, masterHerkunft: { basis: "test" },
  nachtragCount: 0,
  exportMaster: () => {},
  importMaster: () => {},
  importProgramm: () => {},
  importNonstop: () => {},
  programm: [],
  clearProgrammCache: () => {},
  startWahl: null,
  saveVokabular: null,
  kiStand: { global: true, funktionen: { profil: true, suche: true } },
  kiProfilFaehig: true,
  artikelListe: [{ id: "artikel_001", titel: "Mein eigener Beitrag", text: "Text für den Testlauf, präzise und deutlich." }],
  kontoAktiv: true,
  kontoId: "11111111-1111-1111-8000-111111111111",
  kontoEmail: "test@example.com",
  onKontoDatenGeaendert: () => {},
})) });
await ruhe();
check("N", "Der Blogdialog sitzt tatsächlich im geschachtelten Settings-Pfad", () =>
  text().includes("Eigene Blogartikel für dein Profil auswerten"));
check("N", "Ohne Vokabular-Writer bleibt der kostenpflichtige Pfad im Dialog geschlossen",
  () => {
    const blog = document.getElementById("tabwurzel").querySelector(".kd-blogprofilanalyse");
    return !!blog && !blog.querySelector('input[type="checkbox"]');
  });

await act(async () => { tabWurzel.render(null); });
dom.window.localStorage.removeItem(TOPF.geschmacksprofil);
feld = () => document.getElementById("wurzel");
});

/* =========================================================================
   O — VOKABULAR-SPEICHERN UND BLOGANALYSE HAPPYPATH (E17A)
   ========================================================================= */
abschnitt("O", async () => {
console.log("\n--- O: Vokabularwrite-Contracts & nested Bloganalyse-Happy-Path ---");

const mockStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
};
const defer = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const aiMock = ({
  health = {},
  responses = [],
  calls = [],
} = {}) => {
  const taskCalls = calls;
  return {
    calls: taskCalls,
    api: {
      runTask(task, payload, options) {
        taskCalls.push({ task, payload, options });
        if (task === "health") return Promise.resolve(health);
        const response = responses.find((r) => r.task === task);
        if (response) return Promise.resolve(response.factory(payload));
        return Promise.reject(new Error("unbekannte Task"));
      },
    },
  };
};

const AI_HEALTH = {
  ok: true,
  task: "health",
  vorgangId: "11111111-1111-4000-8000-111111111111",
  phase: "etappe-5",
  contractVersion: "ai-task-v5",
  buildVersion: "ui-test",
  laufzeit: { deno: "2", region: "eu" },
  schluesselHerkunft: { oeffentlich: "gesetzt", geheim: "gesetzt" },
  anbieterSecretGesetzt: true,
  aufrufer: { rolle: "authenticated", fachrolle: "owner", weg: "token", accountIdVorhanden: true },
  betrieb: { aiAktiv: true },
  zeit: "2026-08-17T00:00:00.000Z",
  capabilities: {
    blogProfileExtract: {
      ready: true,
      task: "blog-profile-extract",
      promptVersion: "blog-profile-v1",
      modelAlias: "klein",
      maxTokens: 2048,
      taskMaxReservationUsdCent: 5,
    },
  },
};

const BLOG_BELEG = "Dieser präzise Satz ist im Artikeltext enthalten.";
const BLOG_ARTIKEL = {
  id: "blog_001",
  titel: "Mein genauer Blick auf den Film",
  text: `Der Satz ist eindeutig vorhanden und dient als sicherer Beleg für den Test.
${BLOG_BELEG}
Danach noch ein neutraler Schlussteil.`,
};
const BLOG_VORSCHAU = {
  geschmackszuege: [{
    art: "genre",
    wert: "Drama",
    richtung: "zieht_an",
    staerke: 4,
    sicherheit: "hoch",
    beleg: BLOG_BELEG,
  }],
  vokabular: [{
    wort: "nachtkino",
    beschreibung: "Schwärzestich am Abend im Saal.",
    genres: ["Drama"],
    tags: ["präzise"],
    beleg: BLOG_BELEG,
  }],
};

const makeBlogAnalyseResponse = () => ({
  data: {
    geschmackszuege: BLOG_VORSCHAU.geschmackszuege,
    vokabular: BLOG_VORSCHAU.vokabular,
  },
});

/* ---------------- VokabularEditor Save-Contract (truthy-failure, no double click, kein KI-Rerun) */
const vokabularSave = aiMock({
  health: AI_HEALTH,
  responses: [{ task: "intelligent-search", factory: () => ({ data: {
    harte_filter: { genres: ["Drama"] },
  } }) }],
});
const firstSave = defer();
const savePlan = [
  () => firstSave.promise,
  () => Promise.resolve(false),
  () => Promise.resolve(null),
  () => { throw new Error("vokabular-save-failed"); },
  () => Promise.resolve(true),
];
let vokabularCall = 0;
const vokabularSpeichern = async () => {
  const task = savePlan[vokabularCall] || (() => Promise.resolve(false));
  vokabularCall += 1;
  return task();
};
await act(async () => { tabWurzel.render(h(DatenTab, {
  master: [{ titel: "Demo", genre: ["Drama"], tags: ["Drama"] }],
  masterMeta: {}, masterHerkunft: { basis: "test" }, nachtragCount: 0,
  exportMaster: () => {}, importMaster: () => {}, importProgramm: () => {}, importNonstop: () => {},
  programm: [], clearProgrammCache: () => {}, startWahl: null,
  vokabular: [],
  saveVokabular: vokabularSpeichern,
  kiStand: { global: true, funktionen: { profil: true } },
  kiProfilFaehig: true,
  kiSperrgrund: "",
  streamingBekannt: { stand: "test", titel: [] },
  streamingEntdecken: { titel: [] },
  artikelListe: [],
  kontoId: "",
  kontoEmail: "",
  kontoAktiv: false,
  onKontoDatenGeaendert: () => {},
  ai: vokabularSave.api,
  }));
});
await ruhe();
const wort = document.querySelector("#tabwurzel input[placeholder=\"Begriff (z. B. kuhl)\"]");
  const beschreibung = document.querySelector("#tabwurzel textarea[placeholder=\"Was bedeutet der Begriff für dich? Beispiele, Stimmung, Genres …\"]");
  check("O", "Vokabular-Editor im Settings-Pfad ist auffindbar", () => !!wort && !!beschreibung);
  if (wort && beschreibung) {
    feld = () => document.getElementById("tabwurzel");
    await act(async () => {
      setzeWert(wort, "Nacht");
      setzeWert(beschreibung, "ruhig, düster, genau");
    await ruhe();
  });
  const deutenKnopf = knopf("Mit KI deuten") || knopfTeil("KI deutet") || knopfTeil("deuten");
  check("O", "Vokabular-Editor zeigt den KI-Button", () => !!deutenKnopf);
  await klick(deutenKnopf, "Mit KI deuten");
  check("O", "Vokabular-KI-Lauf startet genau einmal  [gemessen: " + vokabularSave.calls.length + "]",
    () => vokabularSave.calls.length === 1 && vokabularSave.calls[0].task === "intelligent-search");
  const speichern = knopf("Definition speichern");
    await act(async () => {
      speichern.click();
      await ruhe();
    });
  await ruhe();
  check("O", "Beim ausstehenden Speichern ist der Save-Button semantisch gesperrt",
    () => {
      const b = knopf("Definition wird gespeichert …");
      return !!b || (speichern && speichern.disabled);
    });
  check("O", "Wort- und Beschreibungsfelder sind während des Speicherns gesperrt",
    () => wort.disabled && beschreibung.disabled);
  check("O", "Während Save-Write ist der deuten-Pfad gesperrt",
    () => {
      const b = knopfTeil("Mit KI deuten");
      return !!b && b.disabled;
    });
  check("O", "Beim ausstehenden Speichern steht ein Live-Status",
    () => text().includes("Definition wird gespeichert"));
  check("O", "Beim ausstehenden Speichern entsteht kein zusätzlicher KI-Aufruf",
    () => vokabularSave.calls.length === 1);
  check("O", "Eingaben bleiben nach ausstehendem Speichern sichtbar",
    () => wort.value === "Nacht" && beschreibung.value === "ruhig, düster, genau");
  firstSave.resolve(false);
  await ruhe();
  check("O", "Fehlgeschlagene Speicherung bleibt inhaltlich unverändert",
    () => wort.value === "Nacht" && beschreibung.value === "ruhig, düster, genau"
      && text().includes("Bitte erneut versuchen"));
  check("O", "Fehlgeschlagene Speicherung zeigt inhaltsfreie Nutzer-Fehlermeldung",
    () => text().includes("Die Definition konnte nicht gespeichert werden."));
  check("O", "Nach Fehlversuch bleibt Vorschlag erhalten",
    () => !!knopf("Definition speichern"));
  await klick(knopf("Definition speichern"), "Definition speichern (Retry, false)");
  await ruhe();
  check("O", "Retry nach false-Antwort bleibt ohne neuen KI-Lauf",
    () => vokabularSave.calls.length === 1 && !!knopf("Definition speichern"));
  await klick(knopf("Definition speichern"), "Definition speichern (Retry, null)");
  await ruhe();
  check("O", "Retry nach null bleibt ohne neuen KI-Lauf",
    () => vokabularSave.calls.length === 1 && !!knopf("Definition speichern"));
  await klick(knopf("Definition speichern"), "Definition speichern (Retry, Reject)");
  await ruhe();
  await klick(knopf("Definition speichern"), "Definition speichern (Retry, true)");
  await ruhe();
  check("O", "Finaler Retry nutzt die vorhandene KI-Suggestion (kein neuer Run)",
    () => vokabularSave.calls.length === 1 && !knopf("Definition speichern"));
  check("O", "Bestätigte Speicherung löscht Wort, Beschreibung und Vorschlag",
    () => wort.value === "" && beschreibung.value === "" && !knopf("Definition speichern"));
}
await act(async () => { tabWurzel.render(null); });
feld = () => document.getElementById("wurzel");

/* ---------------- Nested Settings → Geschmacksprofil → Bloganalyse Happy-Path ---------------- */
const blogAi = aiMock({
  health: AI_HEALTH,
  responses: [{ task: "blog-profile-extract", factory: makeBlogAnalyseResponse }],
});
let parentProfil = P.erteileEinwilligung(LEER(), "2026-08-17T00:00:00.000Z");
let parentVokabular = [];
let parentProfilWrites = 0;
let parentVokabularWrites = 0;
const vorigerSessionStorage = globalThis.sessionStorage;
const vorigerWindowSessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
const blogSessionStorage = mockStorage();

const BlogHarness = () => {
  const [profil, setProfil] = React.useState(parentProfil);
  const [vokabular, setVokabular] = React.useState(parentVokabular);
  React.useEffect(() => { parentProfil = profil; parentVokabular = vokabular; }, [profil, vokabular]);
  return h(DatenTab, {
    master: [{ titel: "Demo", genre: ["Drama"], tags: ["Drama", "präzise"] }],
    masterMeta: {}, masterHerkunft: { basis: "test" }, nachtragCount: 0,
    exportMaster: () => {}, importMaster: () => {}, importProgramm: () => {}, importNonstop: () => {},
    programm: [], clearProgrammCache: () => {}, startWahl: null,
    vokabular,
    saveVokabular: async (neu) => {
      parentVokabularWrites += 1;
      setVokabular(neu);
      return true;
    },
    kiStand: { global: true, funktionen: { profil: true } },
    kiProfilFaehig: true,
    streamingBekannt: { stand: "test", titel: [] }, streamingEntdecken: { titel: [] },
    artikelListe: [BLOG_ARTIKEL],
    kontoId: "11111111-1111-1111-8000-111111111111",
    kontoEmail: "test@example.com", kontoAktiv: true,
    onKontoDatenGeaendert: () => {},
    ai: blogAi.api,
    speicher: {
      ladeProfil: async () => profil,
      speichereProfil: async (wert) => { parentProfilWrites += 1; setProfil(wert); return true; },
      loescheProfil: async () => ({ ...profil, signale: [], achsen: profil?.achsen || { wie: null, was: null, warum: null }, filme: [], nichtDeutbar: [] }),
    },
    kiSperrgrund: "",
    setErr: () => {},
  });
};
const setBlogSessionStorage = (storage) => {
  const globalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  if (globalDescriptor?.configurable) {
    Object.defineProperty(globalThis, "sessionStorage", {
      value: storage,
      configurable: true,
      enumerable: true,
      writable: false,
    });
  } else {
    globalThis.sessionStorage = storage;
  }
  if (vorigerWindowSessionStorageDescriptor?.configurable) {
    Object.defineProperty(window, "sessionStorage", {
      value: storage,
      configurable: true,
      enumerable: vorigerWindowSessionStorageDescriptor.enumerable !== false,
      writable: false,
    });
  }
};
const restoreBlogSessionStorage = () => {
  const globalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  if (globalDescriptor?.configurable) {
    if (vorigerSessionStorage == null) {
      delete globalThis.sessionStorage;
    } else {
      Object.defineProperty(globalThis, "sessionStorage", {
        value: vorigerSessionStorage,
        configurable: true,
        enumerable: true,
        writable: false,
      });
    }
  } else {
    globalThis.sessionStorage = vorigerSessionStorage;
  }
  if (vorigerWindowSessionStorageDescriptor?.configurable) {
    Object.defineProperty(window, "sessionStorage", vorigerWindowSessionStorageDescriptor);
  }
};
setBlogSessionStorage(blogSessionStorage);
await act(async () => { tabWurzel.render(h(BlogHarness)); });
feld = () => document.getElementById("tabwurzel");
await ruhe();
const blog = () => document.getElementById("tabwurzel").querySelector(".kd-blogprofilanalyse");
check("O", "Nested Bloganalyse-Container ist eingebunden", () => !!blog());
const k = blog();
if (k) {
  const cb = k.querySelector('input[type="checkbox"]');
  const start = [...k.querySelectorAll("button")].find((b) => b.textContent.includes("Artikel"));
  check("O", "Der kostenpflichtige Bloganalyse-Start ist initial gesperrt", () => cb && start && start.disabled);
  if (cb && start) {
    await act(async () => { cb.click(); await ruhe(); });
    check("O", "Nach Aktivierung der Checkbox ist der kostenpflichtige Bloganalyse-Start aktiv",
      () => !start.disabled);
    await act(async () => { start.click(); await ruhe(); });
    // Der aktuelle Dialog schliesst Markerprobe, SHA-256 und Vorschauprojektion
    // in getrennten Microtask-Runden ab. Genau zwei Ticks nutzt auch sein
    // eigener Lifecycle-Harness; ein einzelner Tick misst nur den Zwischenstand.
    await ruhe();
    check("O", "Beide Gruppen erscheinen nach erfolgreicher Analyse-Vorschau", () => {
      return !!k.querySelector(".kd-blogprofilanalyse-vorschau")
        && !![...k.querySelectorAll("button")].find((b) => b.textContent.trim() === "Geschmacksprofil speichern")
        && !![...k.querySelectorAll("button")].find((b) => b.textContent.trim() === "Vokabular speichern");
    });
    check("O", "Blog-Analyse-Nachweis nutzt einen lokalen Marker (kein Netzwerk-Klartext)", () => {
      return blogSessionStorage.map.size === 1;
    });
    const blogMarkerInhalt = [...blogSessionStorage.map.values()].map((wert) => {
      try { return JSON.parse(wert); } catch { return null; }
    });
    check("O", "Nachweis enthält keine Artikelinhalte",
      () => blogMarkerInhalt.every((eintrag) => eintrag && typeof eintrag === "object"
        && !eintrag.articleText
        && !JSON.stringify(eintrag).includes(BLOG_ARTIKEL.text)
        && !JSON.stringify(eintrag).includes(BLOG_BELEG)));
    const btnProfil = [...k.querySelectorAll("button")].find((b) => b.textContent.trim() === "Geschmacksprofil speichern");
    const btnVokabular = [...k.querySelectorAll("button")].find((b) => b.textContent.trim() === "Vokabular speichern");
    check("O", "Profil-Save ist zuerst unabhängig bestätigbar",
      () => !!btnProfil);
    if (btnProfil && btnVokabular) {
      const vorProfilWrite = parentProfilWrites;
      const vorVokWrite = parentVokabularWrites;
      await act(async () => { btnProfil.click(); await ruhe(); });
      await ruhe();
      check("O", `Nach Profilsave steigt nur der Profil-Zähler [gemessen: profil ${parentProfilWrites}/${vorProfilWrite + 1}, vokabular ${parentVokabularWrites}/${vorVokWrite}]`,
        () => parentProfilWrites === vorProfilWrite + 1 && parentVokabularWrites === vorVokWrite);
      check("O", "Nach Profilsave bleibt Vokabular-Write unabhängig verfügbar",
        () => !!btnVokabular && !btnVokabular.disabled);
      const nachProfil = parentProfilWrites;
      const nachVok = parentVokabularWrites;
      await act(async () => { btnVokabular.click(); await ruhe(); });
      await ruhe();
      check("O", `Nach Vokabular-Save bleibt der Profil-Zähler stabil, Vokabular steigt [gemessen: profil ${parentProfilWrites}/${nachProfil}, vokabular ${parentVokabularWrites}/${nachVok + 1}]`,
        () => parentProfilWrites === nachProfil && parentVokabularWrites === nachVok + 1);
      check("O", "Nach getrennten Saven sind Profil UND Vokabular in Parent-Status wirklich aktualisiert",
        () => Array.isArray(parentProfil?.signale) && parentProfil.signale.length > 0
          && Array.isArray(parentVokabular) && parentVokabular.some((eintrag) => eintrag.wort === "nachtkino"));
      check("O", "Bestätigung erscheint erst nach beiden erfolgreichen Writes",
        () => k.textContent.includes("Beide Gruppen wurden gespeichert"));
    }
  }
}
await act(async () => { tabWurzel.render(null); });
feld = () => document.getElementById("wurzel");
restoreBlogSessionStorage();
});


/* =========================================================================
   F — AUFFÄLLIGKEITEN AM IST-VERHALTEN
   Heute rot. Nicht exit-relevant, damit die Kette grün bleibt; sie stehen
   hier, damit die Befunde nicht in einem Bericht verschwinden. Bewusst NICHT
   als grüner Check auf das Ist-Verhalten gepinnt: ein Pin auf falsches
   Verhalten macht die Reparatur später zur „Regression" (Regel aus dem Kopf
   von finder_test.mjs). GESCHMACKUI_FORDERUNG=1 schaltet sie scharf.
   ========================================================================= */
abschnitt("F", async () => {
console.log("\n--- F: Auffälligkeiten (heute offen, nicht exit-relevant) ---");

/* ABGERÄUMT AM 28.07.2026 — alle vier Auffälligkeiten der ersten Fassung sind
   behoben und als SCHARFE Checks umgezogen, statt hier als „unauffällig"
   mitzulaufen. Wo sie jetzt stehen und was sie dort MEHR prüfen als vorher:

     F1  `achsenBeruehrt` war EIN Merker für alle drei Regler; wer nur WIE
         anfasste, schrieb auch WAS 3 und WARUM 3.
         → H, und dort deutlich mehr als die alte Fassung: eine bewegte Achse
           schreibt eine (H/2), zwei schreiben zwei und lassen die dritte in
           Ruhe (H/3), eine hin- und zurückgezogene gilt weiterhin als berührt
           (H/4, ausdrücklich gepinnt, damit ein späteres „Optimieren" sie
           nicht still umdreht), keine schreibt keine (H/1), bestehende
           überleben (H/5). Dazu in D die drei Zustände des Hinweistextes und
           der Zähler „n von 3 wird übernommen".
         Und in E die eigentliche Zusage dieses Fixes: Die Erwartung an die
         Achsenzeile wird nicht mehr hingeschrieben, sondern AUS DER VORSCHAU
         GELESEN und gegen die Schreib-Nutzlast gehalten — genannt = geschrieben,
         nicht genannt = unverändert.

     F2  `KI_FUNKTIONEN` in DatenTab.jsx benutzt und nicht importiert; mit
         KI=an eine weiße Seite.
         → M, als scharfe Zusage „DatenTab rendert bei jedem kiStand ohne
           Fehler". Bewusst am RENDERN gemessen und nicht am Importzeilen-Text:
           Ein Quelltextcheck auf `kiSchalter` ginge beim nächsten fehlenden
           Import einer anderen Datei wieder durch. Der Befund stand seit
           `df4cc36` im Repo — durch alle Gates gerutscht, weil kein Test
           DatenTab je gerendert hat.

     F3  Der `korrektur`-Zweig in `ProfilAnsicht.herkunft` war unerreichbar.
         → L, samt der Gegenprobe, dass der Beleg dabei am Zug bleibt (die
           Belegpflicht darf nicht gegen die ehrliche Herkunft eingetauscht
           werden).

     F4  Ein zustimmender Nutzer bekam den Einwilligungstext erneut vorgelegt.
         → B, und dort an der GEFÄHRLICHEN Stelle: nicht nur „der Schritt ist
           weg", sondern auch, dass der Schreibzähler trotz Abkürzung bei null
           bleibt, dass „Zurück" nicht unter den Einstiegsschritt führt, und —
           die eigentliche Falle — dass ein WIDERRUFENES Profil (Vermerk
           vorhanden, `erteilt: false`) sehr wohl wieder gefragt wird. Läse die
           Abkürzung nur „es gibt einen Vermerk", käme genau der Nutzer ohne
           Frage durch, der ausdrücklich Nein gesagt hat.

   Dieselbe Buchführung wie in willkommen_test.mjs: hier dokumentiert, dort
   geprüft. Kein Check ist gestrichen worden.

   NICHT ALS BEFUND GEZÄHLT, aber notiert: Wirft eine eingesetzte
   `speicher.ladeProfil`, behandelt der Bereich das Ergebnis wie „kein Profil".
   Der echte `ladeProfil` kann nicht ablehnen — er fängt alles und liefert die
   Schadensmarke —, der Fall ist also nur über die Test-/Demo-Prop erreichbar.
   K pinnt immerhin, dass der Fehler an `onFehler` gemeldet wird und der
   Bereich nicht im Ladezustand hängenbleibt. */

/* Der Abschnitt bleibt bestehen und leer. Er ist der vorgesehene Platz für
   die nächste Auffälligkeit; ihn zu löschen hiesse, die nächste Hand müsste
   die Bauform neu erfinden — und die Versuchung wäre gross, den Befund
   stattdessen als grünen Check auf das Ist-Verhalten zu pinnen. */
});

/* ===EINFUEGEMARKE=== */

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
const TITEL_GRUPPEN = {
  A: "Aufbau, Ladezustand, leeres Profil",
  B: "Opt-in-Gate an den DATEN",
  C: "Drei-Zustands-Chips",
  D: "Weg durch die Schritte",
  E: "Die Vorschau lügt nicht",
  G: "Fassungsnummer: genau eins je Durchlauf",
  H: "Achsen: nur die berührten",
  I: "Widerruf: Reihenfolge und Rest",
  J: "Das beschädigte Profil",
  K: "Fehler beim Schreiben",
  L: "Ansehen, korrigieren, entfernen",
  M: "Erreichbarkeit ohne KI",
  N: "Blogdialog in Einstellungen verdrahtet",
  O: "Vokabular-Speichern + nested Bloganalyse-Happy-Path",
};
let ok = 0, schlecht = 0;
console.log("\n===========================================================");
for (const [k, q] of Object.entries(QUELLEN)) {
  console.log("Quelle " + (k + ":").padEnd(13) + path.relative(WURZEL, q.pfad));
}
if (GETAUSCHT.length) console.log("MUTATIONSLAUF:  " + GETAUSCHT.join("   "));
console.log("Bündel:   esbuild, 2 Bündel (echt + altbau), " + bauDauer + " ms");
console.log("Netz:     " + (netzVersuche.length === 0 ? "kein einziger Versuch" : netzVersuche.length + " VERSUCHE: " + JSON.stringify(netzVersuche.slice(0, 3))));
console.log("Fehler:   " + (unbehandelt.length === 0 ? "keine unbehandelte Ablehnung"
  : unbehandelt.length + " UNBEHANDELTE ABLEHNUNG(EN): " + JSON.stringify(unbehandelt.slice(0, 3))));
for (const [g, t] of Object.entries(TITEL_GRUPPEN)) {
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
  console.log("   exit-relevant. GESCHMACKUI_FORDERUNG=1 schaltet sie scharf.)");
}
const streng = process.env.GESCHMACKUI_FORDERUNG === "1";
const fehlschlag = schlecht > 0 || (streng && rotF.length > 0);
console.log(fehlschlag ? "\nGESCHMACK-UI-TEST: BEFUNDE OBEN" : "\nGESCHMACK-UI-TEST BESTANDEN");
process.exit(fehlschlag ? 1 : 0);

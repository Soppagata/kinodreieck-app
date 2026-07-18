/* Personal-Modus-Test (Regression zu den Review-Befunden P1-P3 + Scrim-Bug,
   2026-07): prüft die Beta↔Personal-Naht gegen die GEBAUTE Single-File —
   genau der Pfad (frisches Gerät, kein kd:setup), den die übrige Suite nicht
   abdeckt. Aufruf: node personalmodus_test.mjs [dist-single/Kinodreieck.html] */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const pfad = process.argv[2] || "dist-single/Kinodreieck.html";
const html = readFileSync(pfad, "utf8");
const checks = [];
const check = (n, p) => { checks.push([n, p]); console.log((p ? "✓ " : "✗ ") + n); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

function baueDom({ url = "http://localhost/Kinodreieck.html", seed = () => {} } = {}) {
  return new JSDOM(html, {
    url, runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = () => Promise.reject(new Error("offline (Test)"));
      if (!window.URL.createObjectURL) window.URL.createObjectURL = () => "blob:test";
      if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      seed(window);
    },
  });
}
const helpers = (dom) => {
  const doc = dom.window.document;
  return {
    doc,
    text: () => (doc.getElementById("root") || {}).textContent || "",
    knopf: (re) => [...doc.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim())),
  };
};

/* ---------- A: frisches Gerät — Daten-Gate darf im Personal-Modus NICHT greifen (P2) ---------- */
{
  const dom = baueDom(); // KEIN kd:setup, KEIN master — wie ein frisches iPhone
  const { text, knopf } = helpers(dom);
  await warte(2500);
  check("A: App bootet ohne StartWahl-Modal", !/Demo ansehen|Schaufenster/.test(text()) && text().length > 300);
  const kino = knopf(/^kino$/i);
  if (kino) { kino.click(); await warte(500); }
  check("A: Kino-Tab OHNE Beta-Sperrtext", !/Clean ohne Terminal-Installation/.test(text()));
  const streaming = knopf(/^streaming$/i);
  if (streaming) { streaming.click(); await warte(500); }
  check("A: Streaming-Tab OHNE Beta-Sperrtext", !/Clean ohne Terminal-Installation/.test(text()));
  const daten = knopf(/^einstellungen$/i);
  if (daten) { daten.click(); await warte(600); }
  check("A: Streaming-Quellen (Abo-Checkboxen) erreichbar — Migrationsschritt frei", /Streaming-Quellen/.test(text()) && !/Streaming gesperrt/.test(text()));
  dom.window.close();
}

/* ---------- B: Token-Feld — Tippen zerstört den gespeicherten Token NICHT (P1) ---------- */
{
  const ECHT = "github_pat_ECHTERTOKEN12345";
  const dom = baueDom({
    seed(w) {
      w.localStorage.setItem("kd:git:repo", "max/kinodreieck-daten");
      w.localStorage.setItem("kd:git:token", ECHT);
      w.localStorage.setItem("kd:git:branch", "main");
      w.localStorage.setItem("kd:master", JSON.stringify({ meta: null, filme: [{ id: "t_2000", titel: "T", jahr: 2000, typ: "film", quelle: "dvd", kategorie: "sehenswert", bewertung: { wie: 1, was: 1, warum: 1 } }], herkunft: { typ: "storage" }, gespeichertAm: 1 }));
    },
  });
  const { doc, text, knopf } = helpers(dom);
  await warte(3500); // Boot inkl. fehlgeschlagenem syncPull (offline)
  check("B: App bootet trotz Offline-Pull", text().length > 300);
  const daten = knopf(/^einstellungen$/i);
  if (daten) { daten.click(); await warte(600); }
  const tokenInput = [...doc.querySelectorAll("input")].find((i) => i.placeholder === "github_pat_…");
  check("B: Token-Feld gefunden (type=password)", !!tokenInput && tokenInput.type === "password");
  if (tokenInput) {
    check("B: value ist der ECHTE Token, keine Punkte-Maske", tokenInput.value === ECHT);
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
    setter.call(tokenInput, tokenInput.value + "X"); // Nutzer tippt ein Zeichen an
    tokenInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await warte(300);
    const speichern = knopf(/Speichern & verbinden/i);
    if (speichern) { speichern.click(); await warte(200); }
    const gespeichert = dom.window.localStorage.getItem("kd:git:token") || "";
    check("B: gespeicherter Token intakt (Original + getipptes Zeichen, keine •)",
      gespeichert === ECHT + "X" && !gespeichert.includes("•"));
  }
  dom.window.close();
}

/* ---------- C: ?start=clean&fresh=… löscht im Personal-Modus NICHTS (P3) ---------- */
{
  const dom = baueDom({
    url: "http://localhost/Kinodreieck.html?start=clean&fresh=boeserlink123",
    seed(w) {
      w.localStorage.setItem("kd:master", JSON.stringify({ meta: null, filme: [{ id: "wichtig_1999", titel: "Wichtig", jahr: 1999, typ: "film", quelle: "dvd", kategorie: "sehenswert", bewertung: { wie: 5, was: 5, warum: 5 } }], herkunft: { typ: "storage" }, gespeichertAm: 1 }));
      w.localStorage.setItem("kd:artikel", JSON.stringify({ artikel: [{ id: "a1", titel: "Mein Blog" }], gespeichertAm: 1 }));
    },
  });
  await warte(2500);
  check("C: kd:master überlebt den fresh-Link", dom.window.localStorage.getItem("kd:master") !== null);
  check("C: kd:artikel überlebt den fresh-Link", dom.window.localStorage.getItem("kd:artikel") !== null);
  dom.window.close();
}

/* ---------- D: Struktur-Kanarien in der gebauten Datei (Scrim-Bug + Fonts) ---------- */
{
  check("D: kein Inline-zIndex:40 mehr im Bundle (Scrim-Bug-Ursache)", !/zIndex:\s*40/.test(html));
  check("D: Mobil-CSS führt Panel über dem Scrim (60 > 58)", html.includes("z-index:60") && html.includes("z-index:58"));
  check("D: Single-File trägt eingebettete Fonts (data:font)", html.includes("data:font"));
}

const fails = checks.filter(([, p]) => !p);
console.log(`\n${checks.length - fails.length}/${checks.length} Checks bestanden.`);
console.log(fails.length ? "PERSONAL-MODUS-TEST: BEFUNDE OBEN" : "PERSONAL-MODUS-TEST BESTANDEN");
process.exit(fails.length ? 1 : 0);

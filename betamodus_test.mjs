/* Beta-Gegen-Beleg (Etappe 4, Risiko 8 des UI-Polish-Audits):
   Die Suite testet sonst nur den AKTUELL gebauten Modus (PERSONAL_MODE=true,
   Dashboard). Dieser Test baut die Beta-Variante wirklich (KD_BETA=1 dreht
   den Schalter in lib/modus.js beim Bundeln auf false — vite.singlefile.
   config.js, Plugin kd-beta-modus; Quellcode bleibt unangetastet) und belegt
   in jsdom, dass der PERSONAL_MODE=false-Pfad weiterhin die komplette
   Landing rendert (Hero, Ecken, Pinboard, Quicklinks, Anleitung) und NICHT
   das Dashboard. Aufruf: node betamodus_test.mjs */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

console.log("Beta-Build (KD_BETA=1 -> dist-single-beta) …");
execSync("node build-single.mjs", {
  env: { ...process.env, KD_BETA: "1", KD_OUT: "dist-single-beta" },
  stdio: "inherit",
});

const html = readFileSync(new URL("./dist-single-beta/Kinodreieck.html", import.meta.url), "utf8");
const checks = [];
const check = (n, p) => { checks.push([n, p]); console.log((p ? "✓ " : "✗ ") + n); };
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, {
  url: "http://localhost/Kinodreieck.html", runScripts: "dangerously", pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error("offline (Test)"));
    w.scrollTo = () => {};
    if (!w.URL.createObjectURL) w.URL.createObjectURL = () => "blob:test";
    if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    /* Wie strukturtest: Setup bestätigt, Demo-Start, Tour aus — so rendert die
       Beta direkt die Landing statt StartWahl-/Installer-Modal. */
    w.localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: true, skip: [], am: "2026-07-15", version: "beta-2026-07-datenfreigabe-2" }));
    w.localStorage.setItem("kd:start", "demo");
    w.localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: ["kino", "pinboard", "mediathek", "eintrag", "streaming", "entdecken", "blog", "teilen", "vokabular", "streaming-quellen", "waechter"] }));
    w.__KD_DEMO_MASTER__ = JSON.parse(readFileSync(new URL("./src/data/masterliste.json", import.meta.url), "utf8"));
  },
});
await warte(3000);
const doc = dom.window.document;
const text = () => (doc.getElementById("root") || {}).textContent || "";
const knopf = (re) => [...doc.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim()));

/* ---- Landing komplett da (die früheren echtdatei-Landing-Checks leben hier) ---- */
const t = text();
check("Beta: Hero + Claim auf der Startseite", /LOKALE FILM-PLATTFORM/.test(t) && /Deine Filme, dein Kino, dein Urteil/.test(t));
check("Beta: drei Ecken erklärt", /Wie ist es gemacht\?/.test(t) && /Was erzählt es\?/.test(t) && /Warum gerade für dich\?/.test(t));
check("Beta: Pinboard-Sektion", /Pinboard/.test(t));
check("Beta: Quicklinks (Direkt hinein)", /Direkt hinein/.test(t));
const dokuKnopf = knopf(/Anleitung & Hilfe öffnen/i);
check("Beta: Doku-Knopf auf der Landing", !!dokuKnopf);
if (dokuKnopf) {
  dokuKnopf.click(); await warte(300);
  check("Beta: Doku-Ansicht öffnet (inkl. Rechtliches)", /Automatik/.test(text()) && /Die vollständige Anleitung liegt als ANLEITUNG\.md/.test(text()));
}

/* ---- Kein Dashboard im Beta-Pfad ---- */
check("Beta: KEINE Vertrauens-Zeile (Dashboard-Marker) auf der Landing", !doc.querySelector(".kd-vertrauen"));

/* ---- Beta-Signatur: Startart-Knopf existiert nur bei PERSONAL_MODE=false ---- */
const daten = knopf(/^einstellungen$/i);
if (daten) { daten.click(); await warte(600); }
check("Beta: Startart-wechseln-Knopf in den Einstellungen (nur !PERSONAL_MODE)", !!knopf(/Startart wechseln/i));

const fails = checks.filter(([, p]) => !p);
console.log(`\n${checks.length - fails.length}/${checks.length} Checks bestanden.`);
console.log(fails.length ? "BETA-MODUS-TEST: BEFUNDE OBEN" : "BETA-MODUS-TEST BESTANDEN");
process.exit(fails.length ? 1 : 0);

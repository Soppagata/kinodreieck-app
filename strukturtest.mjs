/* Struktur-Volltest: klickt jeden Tab, jeden Schalter, jedes Button-Mapping
   in der FERTIGEN Kinodreieck.html durch und sammelt React-/Konsolen-Fehler.
   Ergänzt echtdatei_test.mjs (Inhalts-Flows) um die Verdrahtungs-Ebene. */
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const pfad = process.argv[2] || "/tmp/kd-single/Kinodreieck.html";
const fehlerKonsole = [];
process.on("uncaughtException", (e) => fehlerKonsole.push("uncaught: " + String((e && e.message) || e).slice(0, 200)));
const vc = new VirtualConsole();
vc.on("error", (...a) => fehlerKonsole.push(a.map(String).join(" ").slice(0, 160)));
vc.on("jsdomError", (e) => { if (!/Could not load/.test(e.message)) fehlerKonsole.push("jsdom: " + e.message.slice(0, 160)); });

const dom = new JSDOM(readFileSync(pfad, "utf8"), {
  url: "http://localhost/Kinodreieck.html", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error("offline (Test)"));
      w.scrollTo = () => {};
    if (!w.URL.createObjectURL) w.URL.createObjectURL = () => "blob:test";
    if (!w.URL.revokeObjectURL) w.URL.revokeObjectURL = () => {}; // jsdom kennt es nicht
    w.confirm = () => false; // Reset-Knopf: anklicken ja, ausführen nein
    w.localStorage.setItem("kd:start", "demo"); // Beta-Startwahl: Demo-Master laden (sonst Startwahl-Modal, master=null)
    w.localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: ["kino","pinboard","mediathek","eintrag","streaming","entdecken","blog","teilen","vokabular","streaming-quellen","waechter"] })); // Tour aus: dieser Test prüft die App, nicht das Tutorial
    w.__KD_DEMO_MASTER__ = JSON.parse(readFileSync(new URL("./src/data/masterliste.json", import.meta.url), "utf8")); // Demo-Beilage (in prod: demo_masterliste.js)
  },
});
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const doc = dom.window.document;
const text = () => doc.getElementById("root").textContent || "";
const knopf = (re) => [...doc.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim()));
const wrapper = () => doc.getElementById("root").firstElementChild;
const setValue = (el, v) => {
  const proto = el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement
    : el.tagName === "SELECT" ? dom.window.HTMLSelectElement
    : dom.window.HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, v);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
};
await warte(3000);
const checks = [];
const check = (n, p) => checks.push([n, p]);

/* ---- 1. Start: Quicklink-Mapping (Klick wechselt wirklich den Tab) ---- */
const quickMediathek = [...doc.querySelectorAll("button")].find((b) => /Bestand, Bewertungen/.test(b.textContent || ""));
check("Start: Quicklink-Karten vorhanden", !!quickMediathek);
if (quickMediathek) {
  quickMediathek.click(); await warte(500);
  check("Start: Quicklink navigiert zur Mediathek", /Unbewerteter Besitz|Filme \(/.test(text()) || /typ als Diskriminator|Apple/.test(text()));
}

/* ---- 2. Mediathek: Typ-Tabs, Chips, Formular-Knöpfe, Daten&Teilen ---- */
for (const t of ["Serien", "Musik", "Sonstiges", "Filme"]) {
  const k = knopf(new RegExp("^" + t + "( \\(|$)"));
  if (k) { k.click(); await warte(200); }
  check("Mediathek: Typ-Tab " + t + " klickbar", !!k);
}
check("Mediathek: Eintrag-hinzufügen-Knopf", !!knopf(/\+ Eintrag hinzufügen/));
check("Mediathek: Daten & Teilen-Leiste", /Daten & Teilen/.test(text()));

/* ---- 2b. Ansicht-Umschalter: Bestand · Im Besitz · Must-Watch ---- */
const besitzBtn = knopf(/^Im Besitz \(/);
check("Mediathek: Ansicht 'Im Besitz' vorhanden", !!besitzBtn);
if (besitzBtn) {
  besitzBtn.click(); await warte(300);
  check("Besitz-Ansicht rendert (Hinweis physische Quellen)", /physische Quellen/.test(text()));
  check("Besitz-Ansicht: Chip 'nur unbewertete'", !!knopf(/^nur unbewertete/));
}
const mwBtn = knopf(/^Must-Watch \(/);
check("Mediathek: Ansicht 'Must-Watch' vorhanden", !!mwBtn);
if (mwBtn) {
  mwBtn.click(); await warte(300);
  const mwNeu = knopf(/^\+ Eintrag$/);
  check("Must-Watch: eigene Liste rendert (+ Eintrag)", !!mwNeu);
  if (mwNeu) {
    mwNeu.click(); await warte(200);
    const titelFeld = [...doc.querySelectorAll("input")].find((i) => i.placeholder === "Titel *");
    check("Must-Watch: Formular öffnet", !!titelFeld);
    if (titelFeld) {
      setValue(titelFeld, "Struktur-Testeintrag");
      await warte(100);
      const hinzu = knopf(/^Hinzufügen$/);
      if (hinzu) { hinzu.click(); await warte(300); }
      check("Must-Watch: Eintrag angelegt + im Topf persistiert",
        /Struktur-Testeintrag/.test(text()) && /Struktur-Testeintrag/.test(dom.window.localStorage.getItem("kd:mustwatch") || ""));
    }
  }
}
const bestandBtn = knopf(/^Bestand$/);
if (bestandBtn) { bestandBtn.click(); await warte(200); }
/* FilmForm: unbewertet-Schalter (Besitz erfassen ohne Dreieck) */
const plusForm = knopf(/\+ Eintrag hinzufügen/);
if (plusForm) {
  plusForm.click(); await warte(200);
  check("FilmForm: 'Ohne Bewertung speichern'-Schalter", /Ohne Bewertung speichern/.test(text()));
  const abbr = knopf(/^Abbrechen$/);
  if (abbr) { abbr.click(); await warte(150); }
} else check("FilmForm: 'Ohne Bewertung speichern'-Schalter", false);

/* ---- 3. Suche: Anfrage absenden -> Verlauf reagiert ---- */
const sucheTab = knopf(/^suche$/i);
if (sucheTab) { sucheTab.click(); await warte(400); }
const sucheFeld = [...doc.querySelectorAll("main input, main textarea")][0];
check("Suche: Eingabefeld vorhanden", !!sucheFeld);
if (sucheFeld) {
  setValue(sucheFeld, "kult aus den 80ern");
  await warte(150);
  const senden = knopf(/^(Suchen|Fragen|Los|→)$/i) || [...doc.querySelectorAll("button")].find((b) => b.type === "submit");
  if (senden) senden.click();
  else sucheFeld.form && sucheFeld.form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await warte(500);
  check("Suche: Anfrage erzeugt Antwort im Verlauf", /kult aus den 80ern/i.test(text()));
}

/* ---- 4. Blog: Erstellen-Maske öffnet ---- */
const blogTab = knopf(/^blog$/i);
if (blogTab) { blogTab.click(); await warte(400); }
const neuKnopf = [...doc.querySelectorAll("button")].find((b) => /neuer artikel|artikel schreiben|erstellen/i.test(b.textContent || ""));
check("Blog: Erstellen-Knopf vorhanden", !!neuKnopf);
if (neuKnopf) {
  neuKnopf.click(); await warte(300);
  check("Blog: Maske öffnet (Titel-Feld)", [...doc.querySelectorAll("input")].some((i) => /titel/i.test(i.placeholder || "")));
}

/* ---- 5. Streaming: Ansichts-Schalter + Quellen-Checkboxen + Config-Export ---- */
const streamingTab = knopf(/^streaming$/i);
if (streamingTab) { streamingTab.click(); await warte(600); }
check("Streaming: Ansicht Mein Programm/Entdecken", !!knopf(/^Mein Programm/) || !!knopf(/^Entdecken/));
// Streaming-Quellen sind jetzt im Einstellungen-Tab (verschoben)
const einstNav5 = [...doc.querySelectorAll("nav button")].find((b) => /^einstellungen$/i.test((b.textContent || "").trim()));
if (einstNav5) { einstNav5.click(); await warte(500); }
check("Streaming-Quellen im Einstellungen-Tab", /Streaming-Quellen/.test(text()));
check("Config-Export-Knopf", !!knopf(/Config exportieren/i));
const checkbox = [...doc.querySelectorAll('input[type="checkbox"]')][0];
check("Quellen-Checkboxen vorhanden", !!checkbox);

/* ---- 6. Einstellungen: alle Schalter wirken ---- */
const tabs = [...doc.querySelectorAll("nav button")];
const einstellungenTab = tabs.find((b) => /^einstellungen$/i.test((b.textContent || "").trim()));
check("Einstellungen-Tab in der Nav", !!einstellungenTab);
if (einstellungenTab) { einstellungenTab.click(); await warte(500); }
// Easter-Egg-Modi: unter dem "Max"-Link versteckt, theme-abhängiger Toggle-Knopf
const maxLink = [...doc.querySelectorAll("span")].find((s) => (s.textContent || "").trim() === "Max" && s.style && s.style.cursor === "pointer");
check("Easter-Egg 'Max'-Link vorhanden", !!maxLink);
if (maxLink) {
  maxLink.click(); await warte(200);
  const egg = [...doc.querySelectorAll("button")].find((b) => /^(Mit Stil|Weils cool ist)$/.test((b.textContent || "").trim()));
  check("Easter-Egg-Modus-Knopf erscheint", !!egg);
  if (egg) {
    egg.click(); await warte(300);
    check("Modus-Klasse am Wrapper aktiv", /kd-(kurosawa|grindhouse)/.test(wrapper().className || ""));
    const egg2 = [...doc.querySelectorAll("button")].find((b) => /^(Mit Stil|Weils cool ist)$/.test((b.textContent || "").trim()));
    if (egg2) { egg2.click(); await warte(200); }
    check("Modus wieder aus (Toggle)", !/kd-(kurosawa|grindhouse)/.test(wrapper().className || ""));
  }
}
// Schriftgröße -> zoom am Wrapper
const gross = knopf(/^Groß$/);
if (gross) {
  gross.click(); await warte(300);
  check("Schriftgröße Groß setzt zoom", String(wrapper().style.zoom) === "1.12");
  const normal = knopf(/^Normal$/); if (normal) { normal.click(); await warte(200); }
} else check("Schriftgröße-Knöpfe", false);
// Startbereich-Select persistiert
const startSelect = [...doc.querySelectorAll("select")].find((s) => [...s.options].some((o) => /Dashboard/.test(o.textContent)));
check("Startbereich-Select vorhanden", !!startSelect);
if (startSelect) {
  setValue(startSelect, "mediathek");
  startSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await warte(300);
  const gespeichert = JSON.parse(dom.window.localStorage.getItem("kd:einstellungen") || "{}");
  check("Startbereich persistiert im Storage", gespeichert.startTab === "mediathek");
  setValue(startSelect, "start");
  startSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}
// Vokabular: Merken-Flow
const wortFeld = [...doc.querySelectorAll("input")].find((i) => /Wort \(z\.B\./.test(i.placeholder || ""));
check("Vokabular-Editor: Felder da", !!wortFeld);
if (wortFeld) {
  setValue(wortFeld, "testwort");
  const genresFeld = [...doc.querySelectorAll("input")].find((i) => /Genres, kommagetrennt/.test(i.placeholder || ""));
  if (genresFeld) setValue(genresFeld, "action");
  await warte(150);
  const merken = knopf(/^Merken$/);
  if (merken) { merken.click(); await warte(300); }
  check("Vokabular: Wort gespeichert + gelistet", /testwort/.test(text()) && /"wort":"testwort"/.test(dom.window.localStorage.getItem("kd:vokabular") || ""));
}
// Backup-Knopf crasht nicht
const backup = knopf(/Gesamt-Backup herunterladen/);
check("Backup-Knopf vorhanden", !!backup);
if (backup) { backup.click(); await warte(400); check("Backup-Klick ohne Fehler", true); }
// Erweitert-Dropdown: Inhalte + Reset-Knopf (confirm=false -> folgenlos)
const erwSummary = [...doc.querySelectorAll("summary")].find((s) => /Erweitert — Dateien/.test(s.textContent || ""));
check("Erweitert-Dropdown vorhanden", !!erwSummary);
if (erwSummary) {
  erwSummary.click(); await warte(300);
  check("Erweitert: Master-Export-Knopf", !!knopf(/^Master exportieren/));
  check("Erweitert: Programm-Snapshot-Import", /Programm-Snapshot/.test(text()));
  check("Erweitert: Artikel-Block", /Blog-Artikel/.test(text()));
  check("Erweitert: Cache-Knopf", !!knopf(/Programm-Cache leeren/));
  const reset = knopf(/Browser-Stand verwerfen/);
  check("Reset-Knopf vorhanden", !!reset);
  if (reset) { reset.click(); await warte(300); check("Reset mit confirm=false folgenlos (App lebt)", text().length > 500); }
}

/* ---- 7. Kino: Filter-Schalter ---- */
const kinoTab = tabs.find((b) => /^kino$/i.test((b.textContent || "").trim()));
if (kinoTab) { kinoTab.click(); await warte(600); }
/* Filterleiste ist default zugeklappt -> vor den Filter-Checks aufklappen */
const kFilter = [...doc.querySelectorAll("button")].find((b) => /Filter$/.test((b.textContent || "").trim()) && /[▸▾]/.test(b.textContent || ""));
if (kFilter && /▸/.test(kFilter.textContent)) { kFilter.click(); await warte(300); }
const aboChip = knopf(/^(Abo: alle|Nur NonStop|Kein NonStop)$/);
check("Kino: Abo-Tri-State-Chip", !!aboChip);
if (aboChip) { aboChip.click(); await warte(300); aboChip.click(); await warte(200); aboChip.click(); await warte(200); check("Kino: Abo-Filter zyklisch ohne Fehler", text().length > 500); }
check("Kino: Ganzes-Tagesprogramm-Schalter", !!knopf(/Ganzes Tagesprogramm|Zeitfilter an/));
check("Kino: Nonstop-Link korrekt", [...doc.querySelectorAll("a")].some((a) => a.href === "https://www.nonstopkino.at/programm"));
check("Kino: Kino-Filter-Select", [...doc.querySelectorAll("select")].some((s) => [...s.options].some((o) => /Alle Kinos/.test(o.textContent))));

/* ---- Ergebnis ---- */
let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
const echteFehler = fehlerKonsole.filter((f) => !/offline \(Test\)|Not implemented|scrollIntoView/.test(f));
console.log("Konsolen-/React-Fehler:", echteFehler.length);
echteFehler.slice(0, 5).forEach((f) => console.log("  !", f));
console.log(ok && !echteFehler.length ? "STRUKTURTEST BESTANDEN" : "STRUKTURTEST: BEFUNDE OBEN");
process.exit(ok && !echteFehler.length ? 0 : 1);

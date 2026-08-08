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

/* Test-Uhr in den Snapshot-Zeitraum fixieren (wie echtdatei_test), sonst filtert die App
   vergangene Vorstellungen weg, sobald das echte Datum an den Demo-Terminen vorbei ist:
   Kino-Tab rendert leeres Programm -> #root-Text < 500 -> "Abo-Filter zyklisch" kippt zeitgebunden. */
const snap = JSON.parse(readFileSync(new URL("./src/data/programm-snapshot.json", import.meta.url), "utf8"));
const streamingBekanntTest = JSON.parse(readFileSync(new URL("./src/data/streaming_bekannt_snapshot.json", import.meta.url), "utf8"));
const streamingEntdeckenTest = JSON.parse(readFileSync(new URL("./src/data/streaming_entdecken_snapshot.json", import.meta.url), "utf8"));
const FIXED_ISO = ((snap.zeitraum && snap.zeitraum.von) || new Date().toISOString().slice(0, 10)) + "T12:00:00+02:00";

/* ---- Katalog-Mock mit echtem Datenbankverhalten (Etappe 4) ----
   `anon` sieht nur manifest + die beiden *_demo-Zeilen; die Live-Zeilen
   programm/streaming verlangen eine angemeldete Sitzung. PostgREST filtert per
   RLS OHNE 403 — die Antwort ist HTTP 200 mit LEEREM Array. Der Mock bildet das
   nach: ohne Authorization-Header bleiben die Live-Zeilen leer. Dieser Test läuft
   als Gast, sieht also genau das, was ein Tester ohne Konto sieht.
   Die Demo-Payloads haben dieselbe Struktur wie ihr Live-Pendant (filme[] bzw.
   bekannt/entdecken) und tragen die neuen Spalten quelle/stand/gueltig_bis. */
const KATALOG_GUELTIG_BIS = new Date(Date.parse(FIXED_ISO) + 30 * 86400000).toISOString();
/* Demo- und Live-Zeile MÜSSEN unterscheidbar sein: mit identischer Payload könnte
   kein Check sagen, WELCHE Zeile in der Oberfläche gelandet ist. Die Demo-Zeile
   trägt einen zusätzlichen, klar markierten Film (ans Ende sortiert, damit die
   Reihenfolge der Bestandsfilme unberührt bleibt) und — wie der echte
   Demo-Schnappschuss — demo: true im Streamingkatalog; die Live-Zeile nicht. */
const DEMO_MARKER_TITEL = "Demo-Zeilen-Marker";
const SPAETESTE_ZEIT = (snap.filme || []).flatMap((f) => (f.vorstellungen || []).map((v) => v.zeit)).sort().at(-1);
const snapDemo = {
  ...snap,
  filme: [...(snap.filme || []), {
    ...(snap.filme || [])[0],
    film_at_id: 999000001, titel: DEMO_MARKER_TITEL, originaltitel: DEMO_MARKER_TITEL,
    vorstellungen: [{ ...((snap.filme || [])[0].vorstellungen || [])[0], zeit: SPAETESTE_ZEIT }],
  }],
};
const KATALOG_ZEILEN = {
  manifest: { payload: { stand: FIXED_ISO }, quelle: "manifest" },
  programm: { payload: snap, quelle: "film-at" },
  programm_demo: { payload: snapDemo, quelle: "demo-schnappschuss" },
  streaming: { payload: { bekannt: { ...streamingBekanntTest, demo: false }, entdecken: { ...streamingEntdeckenTest, demo: false } }, quelle: "watchmode" },
  streaming_demo: { payload: { bekannt: streamingBekanntTest, entdecken: streamingEntdeckenTest }, quelle: "demo-schnappschuss" },
};
const NUR_ANGEMELDET = new Set(["programm", "streaming"]);
function katalogAntwort(url, opts = {}) {
  const name = new URL(String(url)).searchParams.get("name")?.replace(/^eq\./, "");
  const zeile = KATALOG_ZEILEN[name];
  const mitToken = !!(opts.headers && opts.headers.Authorization);
  const sichtbar = !!zeile && (mitToken || !NUR_ANGEMELDET.has(name));
  const zeilen = sichtbar
    ? [{ payload: zeile.payload, updated_at: FIXED_ISO, stand: FIXED_ISO, gueltig_bis: KATALOG_GUELTIG_BIS, quelle: zeile.quelle }]
    : [];
  return { ok: true, status: 200, json: async () => zeilen, text: async () => "" };
}

const dom = new JSDOM(readFileSync(pfad, "utf8"), {
  url: "http://localhost/Kinodreieck.html", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    const FIXED = Date.parse(FIXED_ISO);
    const RealDate = w.Date;
    class MockDate extends RealDate {
      constructor(...a) { super(...(a.length ? a : [FIXED])); }
      static now() { return FIXED; }
    }
    w.Date = MockDate;
    w.fetch = async (url, opts = {}) => {
      const s = String(url);
      if (s.includes("/rest/v1/kd_catalog")) return katalogAntwort(s, opts);
      throw new Error("offline (Test)");
    };
      w.scrollTo = () => {};
    if (!w.URL.createObjectURL) w.URL.createObjectURL = () => "blob:test";
    if (!w.URL.revokeObjectURL) w.URL.revokeObjectURL = () => {}; // jsdom kennt es nicht
    w.confirm = () => false; // Reset-Knopf: anklicken ja, ausführen nein
    w.localStorage.setItem("kd:start", "demo"); // Beta-Startwahl: Demo-Master laden (sonst Startwahl-Modal, master=null)
    w.localStorage.setItem("kd:start-version", "demo-v1");
    w.localStorage.setItem("kd:katalog:url", "https://test.supabase.co");
    w.localStorage.setItem("kd:katalog:key", "x".repeat(30));
    w.localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: ["kino","pinboard","mediathek","eintrag","streaming","entdecken","blog","vokabular","streaming-quellen","erweitert","waechter"] })); // Tour aus: dieser Test prüft die App, nicht das Tutorial
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

/* ---- 1. Start: Dashboard (Etappe 4, Personal-Build) — Vertrauens-Zeile +
   Modul-Link-Mapping (→-Link wechselt wirklich den Tab). Die Quicklinks der
   Beta-Landing prüft betamodus_test.mjs gegen den Beta-Build. ---- */
check("Start: Dashboard-Vertrauens-Zeile (Programm-/Katalog-Stand)", !!doc.querySelector(".kd-vertrauen") && /Programm: \d{2}\.\d{2}\./.test(text()));
const modulLink = [...doc.querySelectorAll("button")].find((b) => /^→ (Kino|Mediathek|Streaming)$/.test((b.textContent || "").trim()));
if (modulLink) {
  const ziel = (modulLink.textContent || "").replace("→", "").trim();
  modulLink.click(); await warte(500);
  check("Start: Modul-→-Link navigiert (" + ziel + ")",
    ziel === "Mediathek" ? (/Unbewerteter Besitz|Filme \(|Apple/.test(text()))
      : ziel === "Kino" ? (/Läuft auch|Läuft & passt zu dir|Kinoprogramm/.test(text()))
        : /Mein Programm|Entdecken/.test(text()));
} else {
  /* Demo-Stand ohne Module (keine Pins/Must-Watch/Matches mit Termin) — dann
     muss wenigstens der Leer-Hinweis stehen und das Menü navigieren. */
  check("Start: Dashboard-Leerzustand mit Hinweis", /Noch leer/.test(text()));
}
const zurMediathek = knopf(/^mediathek$/i);
if (zurMediathek) { zurMediathek.click(); await warte(500); }
check("Start: Menü navigiert zur Mediathek", /Unbewerteter Besitz|Filme \(/.test(text()) || /typ als Diskriminator|Apple/.test(text()));

/* ---- 2. Mediathek: Typ-Tabs, Chips und Formular-Knöpfe ---- */
for (const t of ["Serien", "Musik", "Sonstiges", "Filme"]) {
  const k = knopf(new RegExp("^" + t + "( \\(|$)"));
  if (k) { k.click(); await warte(200); }
  check("Mediathek: Typ-Tab " + t + " klickbar", !!k);
}
check("Mediathek: Eintrag-hinzufügen-Knopf", !!knopf(/\+ Eintrag hinzufügen/));
check("Mediathek: kein redundanter Daten-&-Teilen-Block", !/Daten & Teilen/.test(text()));

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
const bestandBtn = knopf(/^Einträge$/);
if (bestandBtn) { bestandBtn.click(); await warte(200); }
/* FilmForm: unbewertet-Schalter (Besitz erfassen ohne Dreieck) */
const plusForm = knopf(/\+ Eintrag hinzufügen/);
if (plusForm) {
  plusForm.click(); await warte(200);
  check("FilmForm: 'Ohne Bewertung speichern'-Schalter", /Ohne Bewertung speichern/.test(text()));
  const abbr = knopf(/^Abbrechen$/);
  if (abbr) { abbr.click(); await warte(150); }
} else check("FilmForm: 'Ohne Bewertung speichern'-Schalter", false);

/* ---- 3. Globale Suche: Desktop/iPad haben wieder einen eigenen Zugang ---- */
const sucheTab = knopf(/^suche$/i);
check("Globale Suche: eigener Desktop-Menübereich vorhanden", !!sucheTab);
if (sucheTab) { sucheTab.click(); await warte(200); }
const sucheFeld = doc.querySelector('input[aria-label="Sucheingabe"]');
check("Globale Suche: Eingabefeld im Suche-Bereich vorhanden", !!sucheFeld);
if (sucheFeld) {
  setValue(sucheFeld, "kult aus den 80ern");
  await warte(150);
  const senden = doc.querySelector('.kd-globalsuche-los') || [...doc.querySelectorAll("button")].find((b) => b.type === "submit");
  if (senden) senden.click();
  else sucheFeld.form && sucheFeld.form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await warte(500);
  check("Globale Suche: Anfrage erzeugt Antwort im Popup", /Suchergebnisse/.test(text()) && /kult aus den 80ern/i.test(text()));
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

/* ---- 5. Streaming: Ansichts-Schalter + Quellen-Auswahl ---- */
const streamingTab = knopf(/^streaming$/i);
if (streamingTab) { streamingTab.click(); await warte(600); }
check("Streaming: Ansicht Mein Programm/Entdecken", !!knopf(/^Mein Programm/) || !!knopf(/^Entdecken/));
/* Etappe 2: Umschalter ist jetzt SegmentedControl — der Tour-Anker
   data-tour="streaming-views" muss am neuen .kd-seg-Container hängen. */
check("Etappe 2: SegmentedControl trägt Tour-Anker streaming-views (kd-seg)", !!doc.querySelector('.kd-seg[data-tour="streaming-views"]'));
// Streaming-Quellen sind jetzt im Einstellungen-Tab (verschoben)
const einstNav5 = [...doc.querySelectorAll("nav button")].find((b) => /^settings$/i.test((b.textContent || "").trim()));
if (einstNav5) { einstNav5.click(); await warte(500); }
check("Streaming-Quellen im Einstellungen-Tab", /Streaming-Quellen/.test(text()));
check("Kein überholter Config-Export", !knopf(/Config exportieren/i));
check("Quellen-Suchfeld vorhanden", [...doc.querySelectorAll("input")].some((i) => (i.placeholder || "").startsWith("Quelle suchen")));

/* ---- 6. Einstellungen: alle Schalter wirken ---- */
const tabs = [...doc.querySelectorAll("nav button")];
const einstellungenTab = tabs.find((b) => /^settings$/i.test((b.textContent || "").trim()));
check("Einstellungen-Tab in der Nav", !!einstellungenTab);
if (einstellungenTab) { einstellungenTab.click(); await warte(500); }
/* Etappe 2: Hauptblöcke als <details>-Accordions (Klappe); nur
   "Darstellung & Verhalten" startet offen. */
const klappen = [...doc.querySelectorAll("details.kd-klappe")];
check("Etappe 2: Einstellungen-Accordions (kd-klappe), Darstellung startet offen",
  klappen.length >= 6 && klappen.some((d) => d.open && /Darstellung & Verhalten/.test((d.querySelector("summary") || {}).textContent || "")));
// Easter-Egg-Modi: unter dem "Max"-Link versteckt, theme-abhängiger Toggle-Knopf
const maxLink = [...doc.querySelectorAll("span")].find((s) => (s.textContent || "").trim() === "Max" && s.style && s.style.cursor === "pointer");
check("Easter-Egg 'Max'-Link vorhanden", !!maxLink);
if (maxLink) {
  maxLink.click(); await warte(200);
  const egg = [...doc.querySelectorAll("button")].find((b) => /^(Classix|Schon kuhl)$/.test((b.textContent || "").trim()));
  check("Unklar beschrifteter Easter-Egg-Knopf erscheint", !!egg && !/(Showa|Neon Noir|NERV)/.test(egg.textContent || ""));
  if (egg) {
    egg.click(); await warte(300);
    check("Modus-Klasse am Wrapper aktiv", /kd-(showa|neon-noir)/.test(wrapper().className || ""));
    if (wrapper().classList.contains("kd-neon-noir")) {
      const neonOverlay = doc.querySelector('.kd-fx-neon-noir[aria-hidden="true"]');
      check("Neon Noir setzt das globale Theme-Attribut", !!doc.querySelector('[data-kd-theme="neon-noir"]'));
      check("Neon-Noir-Overlay blockiert und fokussiert nichts", !!neonOverlay
        && dom.window.getComputedStyle(neonOverlay).pointerEvents === "none"
        && !neonOverlay.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    }
    const egg2 = [...doc.querySelectorAll("button")].find((b) => /^(Classix|Schon kuhl)$/.test((b.textContent || "").trim()));
    if (egg2) { egg2.click(); await warte(200); }
    check("Modus wieder aus (Toggle)", !/kd-(showa|neon-noir|nerv)/.test(wrapper().className || ""));
  }
}
// Schriftgröße: Zustandsklasse statt mobilem Layout-Zoom
const gross = knopf(/^Groß$/);
if (gross) {
  gross.click(); await warte(300);
  check("Schriftgröße Groß setzt Zustand ohne Inline-Zoom", wrapper().classList.contains("kd-schrift-gross") && !wrapper().style.zoom);
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
// KI-Vokabular: Semantik wird frei beschrieben; ohne Konto gibt es bewusst
// keinen manuellen Genre-/Tag-Hintereingang.
const wortFeld = [...doc.querySelectorAll("input")].find((i) => /Begriff \(z\.\s*B\./.test(i.placeholder || ""));
const bedeutungsFeld = [...doc.querySelectorAll("textarea")].find((i) => /Was bedeutet der Begriff/.test(i.placeholder || ""));
check("KI-Vokabular: Begriff und freie Bedeutung vorhanden", !!wortFeld && !!bedeutungsFeld);
check("KI-Vokabular: keine manuelle Genre-/Tag-Zuordnung mehr",
  ![...doc.querySelectorAll("input")].some((i) => /Genres, kommagetrennt|Tags, kommagetrennt/.test(i.placeholder || "")));
// Demo-Reihenfolge: Streaming-Quellen exakt an Position 5, Erweitert nach Status.
const einstellTexte = [...doc.querySelectorAll("summary")].map((s) => (s.textContent || "").trim());
const darstellungIndex = einstellTexte.findIndex((s) => /^Darstellung & Verhalten/.test(s));
const modusIndex = einstellTexte.findIndex((s) => /^Datenmodus & Verbindung/.test(s));
const masterIndex = einstellTexte.findIndex((s) => /^Masterliste/.test(s));
const backupIndex = einstellTexte.findIndex((s) => /^Gesamt-Backup/.test(s));
const streamingIndex = einstellTexte.findIndex((s) => /^Streaming-Quellen/.test(s));
const vokIndex = einstellTexte.findIndex((s) => /^KI-Vokabular/.test(s));
const statusIndex = einstellTexte.findIndex((s) => /^Katalog-Status/.test(s));
const erweitertIndex = einstellTexte.findIndex((s) => /^Erweitert — manuelle Aktualisierung & Wartung/.test(s));
check("Demo: feste Reihenfolge inkl. Streaming-Quellen auf Platz 5",
  darstellungIndex < modusIndex && modusIndex < masterIndex && masterIndex < backupIndex && backupIndex < streamingIndex && streamingIndex < vokIndex && vokIndex < statusIndex && statusIndex < erweitertIndex);
check("Teilen & Tauschen aus Einstellungen entfernt", !einstellTexte.some((s) => /Teilen & Tauschen/.test(s)));
check("Phase 2: Restore nicht mehr als eigene Hauptklappe", !einstellTexte.some((s) => s === "Backup wiederherstellen"));
// Backup-Knopf crasht nicht
const backup = knopf(/Gesamt-Backup herunterladen/);
check("Backup-Knopf vorhanden", !!backup);
if (backup) { backup.click(); await warte(400); check("Backup-Klick ohne Fehler", true); }
// Erweitert-Dropdown: Inhalte + Reset-Knopf (confirm=false -> folgenlos)
const erwSummary = [...doc.querySelectorAll("summary")].find((s) => /Erweitert — manuelle Aktualisierung & Wartung/.test(s.textContent || ""));
check("Erweitert-Dropdown vorhanden", !!erwSummary);
if (erwSummary) {
  erwSummary.click(); await warte(300);
  const erwDetails = erwSummary.parentElement;
  check("Erweitert: Datenbank-Refresh", !!knopf(/^Katalog jetzt neu laden/));
  check("Erweitert: Programm-Snapshot-Import", /Programm-Snapshot/.test(text()));
  check("Erweitert: Cache-Knopf", !!knopf(/Programm-Cache leeren/));
  check("Erweitert: kein Geräte-Sync und kein Blog-Doppelimport", !/Geräte-Sync|Blog-Artikel/.test(erwDetails.textContent || ""));
}

/* ---- 7. Kino: Filter-Schalter ---- */
const kinoTab = tabs.find((b) => /^kino$/i.test((b.textContent || "").trim()));
if (kinoTab) { kinoTab.click(); await warte(600); }
/* Filterleiste ist default zugeklappt -> vor den Filter-Checks aufklappen */
const kFilter = [...doc.querySelectorAll("button")].find((b) => /Filter$/.test((b.textContent || "").trim()) && /[▸▾]/.test(b.textContent || ""));
if (kFilter && /▸/.test(kFilter.textContent)) { kFilter.click(); await warte(300); }
const aboChip = knopf(/^(Abo: alle|Nur NonStop|Kein NonStop)$/);
check("Kino: Abo-Tri-State-Chip", !!aboChip);
/* Etappe 2: Filterzeilen sind ChipReihen (eine wischbare Zeile am Handy). */
check("Etappe 2: ChipReihe (kd-chiprow) im Kino-Tab gerendert", doc.querySelectorAll(".kd-chiprow").length > 0);
if (aboChip) { aboChip.click(); await warte(300); aboChip.click(); await warte(200); aboChip.click(); await warte(200); check("Kino: Abo-Filter zyklisch ohne Fehler", text().length > 500); }
check("Kino: Ganzes-Tagesprogramm-Schalter", !!knopf(/Ganzes Tagesprogramm|Zeitfilter an/));
check("Kino: Nonstop-Link korrekt", [...doc.querySelectorAll("a")].some((a) => a.href === "https://www.nonstopkino.at/programm"));
check("Kino: Kino-Filter-Select", [...doc.querySelectorAll("select")].some((s) => [...s.options].some((o) => /Alle Kinos/.test(o.textContent))));
/* Etappe 4: dieser Durchlauf hat keine Sitzung. Der Gastbetrieb muss die
   DEMO-Zeile bekommen — nachweisbar am Marker, den nur die Demo-Payload trägt. */
check("Gastbetrieb: die Demo-Payload landet wirklich im Kino-Tab (Marker-Titel sichtbar)", text().includes(DEMO_MARKER_TITEL));
/* Der Marker des STAND-Etiketts („· Demo-Schnappschuss"). Ein blankes
   /Demo-Schnappschuss/ über das ganze #root träfe auch den Fehlerkasten des
   Kino-Tabs, der genau dann erscheint, wenn gar kein Stand angezeigt wird. */
check("Gastbetrieb: technischer Programm-Stand ist nur ein unsichtbarer Diagnoseanker",
  doc.querySelector('.kd-kino-status-anker[aria-hidden="true"]')?.classList.contains("kd-visually-hidden"));

/* ---- Ergebnis ---- */
let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
const echteFehler = fehlerKonsole.filter((f) => !/offline \(Test\)|Not implemented|scrollIntoView/.test(f));
console.log("Konsolen-/React-Fehler:", echteFehler.length);
echteFehler.slice(0, 5).forEach((f) => console.log("  !", f));
console.log(ok && !echteFehler.length ? "STRUKTURTEST BESTANDEN" : "STRUKTURTEST: BEFUNDE OBEN");
process.exit(ok && !echteFehler.length ? 0 : 1);

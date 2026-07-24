/* Regressionstest der login-freien Tester-PWA: Erstwahl, Katalog-Gate,
   aufgeräumte Einstellungen, versteckte Modi und gezieltes Demo-Entfernen. */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const pfad = process.argv[2] || "dist-single/Kinodreieck.html";
const html = readFileSync(pfad, "utf8");
const programm = JSON.parse(readFileSync(new URL("./src/data/programm-snapshot.json", import.meta.url), "utf8"));
const bekannt = JSON.parse(readFileSync(new URL("./src/data/streaming_bekannt_snapshot.json", import.meta.url), "utf8"));
const entdecken = JSON.parse(readFileSync(new URL("./src/data/streaming_entdecken_snapshot.json", import.meta.url), "utf8"));
const masterDatei = JSON.parse(readFileSync(new URL("./src/data/masterliste.json", import.meta.url), "utf8"));
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok) => { checks.push([name, !!ok]); console.log((ok ? "✓ " : "✗ ") + name); };

function katalogAntwort(url) {
  const name = new URL(String(url)).searchParams.get("name")?.replace(/^eq\./, "");
  const payload = name === "manifest" ? { stand: "2026-07-22T12:00:00Z" }
    : name === "programm" ? programm
      : name === "streaming" ? { bekannt, entdecken } : null;
  return { ok: true, status: 200, json: async () => payload ? [{ payload, updated_at: "2026-07-22T12:00:00Z" }] : [], text: async () => "" };
}

function baueDom(seed = () => {}, demoRows = null) {
  return new JSDOM(html, {
    url: "http://localhost/Kinodreieck.html", runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.confirm = () => true;
      if (!w.URL.createObjectURL) w.URL.createObjectURL = () => "blob:test";
      if (!w.URL.revokeObjectURL) w.URL.revokeObjectURL = () => {};
      if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.fetch = async (url) => {
        const s = String(url);
        if (s.includes("/rest/v1/kd_catalog")) return katalogAntwort(s);
        if (s.includes("/rest/v1/kd_store") && demoRows) return { ok: true, status: 200, json: async () => demoRows, text: async () => "" };
        throw new Error("offline (Test)");
      };
      seed(w);
    },
  });
}

function hilfen(dom) {
  const doc = dom.window.document;
  return {
    doc,
    text: () => (doc.getElementById("root") || {}).textContent || "",
    knopf: (re) => [...doc.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim())),
  };
}

function setWert(dom, el, wert) {
  const proto = el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement : dom.window.HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, wert);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function seedKatalog(w, start = "clean") {
  w.localStorage.setItem("kd:start", start);
  w.localStorage.setItem("kd:start-version", "demo-v1");
  w.localStorage.setItem("kd:katalog:url", "https://test.supabase.co");
  w.localStorage.setItem("kd:katalog:key", "x".repeat(30));
  w.localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: ["kino", "pinboard", "mediathek", "eintrag", "streaming", "entdecken", "blog", "vokabular", "streaming-quellen", "erweitert", "waechter"] }));
}

/* A — die produktive PWA enthält beide zwingenden Erststart-Dialoge. Der alte
   Single-File-Kompatibilitätspfad selbst startet absichtlich ohne Netzdialog;
   der Web-Build wird zusätzlich im Browsertest geprüft. */
{
  check("A: Build enthält Clean- und Demo-Entscheidung", html.includes("Leer starten") && html.includes("Demo ansehen"));
  check("A: Build enthält den DB-Leseschlüssel-Dialog", html.includes("Programmdaten verbinden") && html.includes("Mitgeschickter Leseschlüssel"));
  check("A: kein Terminal-Installer mehr erwähnt", !/Installation-(Mac|Windows)|Terminal-Installation/.test(html));

  const alt = baueDom((w) => {
    w.localStorage.setItem("kd:start", "clean"); // Wert eines alten Builds, noch nicht bewusst bestätigt
    w.localStorage.setItem("kd:katalog:url", "https://test.supabase.co");
    w.localStorage.setItem("kd:katalog:key", "x".repeat(30));
  });
  await warte(1200);
  const a = hilfen(alt);
  check("A: alter stiller Clean-Wert überspringt die neue Startwahl nicht", !!a.knopf(/^Leer starten$/) && !!a.knopf(/^Demo ansehen$/));
  alt.window.close();

  const leer = baueDom();
  await warte(1200);
  const l = hilfen(leer);
  check("A: vollständig leerer Browser zeigt zuerst die Startwahl", !!l.knopf(/^Leer starten$/) && !!l.knopf(/^Demo ansehen$/));
  leer.window.close();
}

/* B — Settings-Reihenfolge und die namenlosen Max-Modi. */
{
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { doc, text, knopf } = hilfen(dom);
  await warte(2200);
  check("B: Clean bootet ins leere Dashboard mit DB-Katalog", /Dein Abend/.test(text()) && !/Programmdaten verbinden/.test(text()));
  knopf(/^Einstellungen$/i)?.click(); await warte(400);
  const summaries = [...doc.querySelectorAll("summary")].map((s) => (s.textContent || "").trim());
  const ids = ["Darstellung & Verhalten", "Datenmodus & Verbindung", "Masterliste", "Gesamt-Backup", "Streaming-Quellen", "Suche-Vokabular", "Katalog-Status", "Erweitert — manuelle Aktualisierung & Wartung"]
    .map((x) => summaries.findIndex((s) => s.startsWith(x)));
  check("B: neue Settings-Reihenfolge vollständig", ids.every((x) => x >= 0) && ids.every((x, i) => i === 0 || x > ids[i - 1]));
  check("B: Vorführmodus und Teilen & Tauschen entfernt", !/Vorführmodus|Teilen & Tauschen/.test(text()));
  const startmodus = knopf(/^Startmodus wählen$/);
  check("B: Startmodus bleibt in den Einstellungen erneut wählbar", !!startmodus);
  startmodus?.click(); await warte(100);
  check("B: bestätigte Startwahl lässt sich ohne Änderung abbrechen", !!knopf(/^Abbrechen$/));
  knopf(/^Abbrechen$/)?.click(); await warte(100);
  check("B: Abbrechen schließt die Startwahl und erhält Clean", !knopf(/^Demo ansehen$/) && dom.window.localStorage.getItem("kd:start") === "clean");
  knopf(/^Startmodus wählen$/)?.click(); await warte(100);
  knopf(/^Leer starten$/)?.click(); await warte(100);
  check("B: erneute Wahl desselben Modus ist nicht destruktiv", !knopf(/^Demo ansehen$/) && dom.window.localStorage.getItem("kd:start") === "clean");
  const ki = knopf(/^KI-Prompt öffnen$/);
  check("B: KI-Masterlistenwerkzeug ist sichtbar", !!ki);
  ki?.click(); await warte(100);
  check("B: KI-Prompt öffnet sich", !!doc.getElementById("kd-ingestion-prompt") && !!knopf(/^Prompt kopieren$/));
  const paste = [...doc.querySelectorAll("textarea")].find((t) => /JSON aus der KI-Antwort/.test(t.placeholder || ""));
  if (paste) {
    setWert(dom, paste, JSON.stringify({
      format: "kinodreieck-paket", version: 1, autor: "Tester", quelle: "ki-ingestion",
      bereiche: { filme: [{ titel: "KI-Testfilm", jahr: 2020, typ: "film", quelle: "dvd", kategorie: "sehenswert", bewertung: { wie: 3, was: 3, warum: 3 }, genre: ["Drama"], tags: [], begruendung: "Test." }] },
    }));
    knopf(/^Eingefügtes importieren$/)?.click(); await warte(120);
    check("B: KI-Antwort erzeugt eine Import-Vorschau", /Masterlisten-Vorschau/.test(text()) && /KI-Testfilm/.test(text()));
    knopf(/^Auswahl übernehmen$/)?.click(); await warte(180);
    let gespeichert = null;
    try { gespeichert = JSON.parse(dom.window.localStorage.getItem("kd:master") || "null"); } catch { /* */ }
    check("B: KI-Masterlistenimport übernimmt den neuen Eintrag", !!gespeichert?.filme?.some((f) => f.titel === "KI-Testfilm"));
  } else {
    check("B: KI-Antwort erzeugt eine Import-Vorschau", false);
    check("B: KI-Masterlistenimport übernimmt den neuen Eintrag", false);
  }
  const max = [...doc.querySelectorAll("span")].find((s) => (s.textContent || "").trim() === "Max" && s.style.cursor === "pointer");
  max?.click(); await warte(100);
  const dunkelEgg = knopf(/^Dauerburner$/);
  check("B: dunkler Max-Knopf nennt NERV nicht", !!dunkelEgg && !/NERV|Showa/.test(dunkelEgg.textContent || ""));
  dunkelEgg?.click(); await warte(120);
  check("B: dunkler Knopf aktiviert genau NERV", !!doc.querySelector(".kd-wrap.kd-nerv") && !doc.querySelector(".kd-wrap.kd-showa"));
  knopf(/^Dauerburner$/)?.click(); await warte(120);
  knopf(/^Foyer \(hell\)$/)?.click(); await warte(120);
  const hellEgg = knopf(/^Back to the Roots$/);
  hellEgg?.click(); await warte(120);
  check("B: heller Knopf aktiviert genau Showa", !!doc.querySelector(".kd-wrap.kd-showa") && !doc.querySelector(".kd-wrap.kd-nerv"));
  dom.window.close();
}

/* C — Demo übernimmt Dienste und lässt sich ohne Katalogverlust entfernen. */
{
  const demoRows = [
    { key: "kd:master", value: JSON.stringify(masterDatei) },
    { key: "kd:streaming-dienste", value: JSON.stringify({ quellen: ["Netflix", "Disney+", "Prime Video", "Paramount+ (Via Amazon Prime)", "Crunchyroll Premium (Via Amazon Prime)"], heuristik: true }) },
    { key: "kd:artikel", value: JSON.stringify({ artikel: [{ id: "demo_artikel", titel: "Demo" }] }) },
    { key: "kd:kino-pins", value: JSON.stringify([{ t: "Demo-Pin", j: 2000, z: "22.7. 20:00 · Demo-Kino", seit: 1 }]) },
    { key: "kd:merkliste", value: JSON.stringify([{ watchmode_id: 999001, titel: "Demo-Merker", jahr: 2001 }]) },
    { key: "kd:mustwatch", value: JSON.stringify({ eintraege: [] }) },
  ];
  const dom = baueDom((w) => {
    seedKatalog(w, "demo");
    w.localStorage.setItem("kd:sb:url", "https://test.supabase.co");
    w.localStorage.setItem("kd:sb:anon", "x".repeat(30));
  }, demoRows);
  const { doc, text, knopf } = hilfen(dom);
  await warte(2600);
  knopf(/^Einstellungen$/i)?.click(); await warte(400);
  check("C: Demo übernimmt Max' Streamingdienste", /Netflix/.test(text()) && /Disney\+/.test(text()) && /Crunchyroll \(Prime\)/.test(text()));
  const quellenSuche = doc.querySelector('input[placeholder^="Quelle suchen"]');
  if (quellenSuche) {
    setWert(dom, quellenSuche, "MUBI"); await warte(100);
    [...doc.querySelectorAll("button")].find((b) => /MUBI/.test(b.textContent || "") && /hinzufügen/.test(b.title || ""))?.click();
    await warte(120);
  }
  const entfernen = knopf(/^Demo-Daten entfernen$/);
  check("C: Demo hat klaren Entfernen-Knopf", !!entfernen);
  const ersetzen = knopf(/^Masterliste ersetzen$/);
  const dateiInput = ersetzen?.parentElement?.querySelector('input[type="file"]');
  let dateiDialog = false;
  if (dateiInput) dateiInput.click = () => { dateiDialog = true; };
  ersetzen?.click();
  check("C: Masterliste ersetzen öffnet bei leerem Text den Dateidialog", !!ersetzen && dateiDialog);
  entfernen?.click(); await warte(500);
  check("C: Entfernen schaltet auf Clean und löscht Demo-Protokoll", dom.window.localStorage.getItem("kd:start") === "clean" && !dom.window.localStorage.getItem("kd:demo-seed"));
  let cfg = null, pins = null, merker = null;
  try {
    cfg = JSON.parse(dom.window.localStorage.getItem("kd:streaming-dienste") || "null");
    pins = JSON.parse(dom.window.localStorage.getItem("kd:kino-pins") || "null");
    merker = JSON.parse(dom.window.localStorage.getItem("kd:merkliste") || "null");
  } catch { /* */ }
  check("C: Demo-Löschung entfernt nur Demo-Quellen und erhält spätere Auswahl", cfg?.quellen?.includes("MUBI") && !cfg.quellen.includes("Netflix"));
  check("C: Demo-Pins und Demo-Merker werden gezielt entfernt", Array.isArray(pins) && pins.length === 0 && Array.isArray(merker) && merker.length === 0);
  knopf(/^Kino$/i)?.click(); await warte(350);
  check("C: gemeinsames Kinoprogramm bleibt erhalten", /Kinoprogramm neu laden/.test(text()) && !/Datenbank noch nicht verbunden/.test(text()));
  dom.window.close();
}

/* D — Demo-Erkennung hängt am Seed, nicht nur an einem möglicherweise alten
   oder versehentlich auf Clean gesetzten Modusnamen. */
{
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:demo-seed", JSON.stringify({ masterIds: [], artikelIds: [], geladenAm: "2026-07-22" }));
  });
  const { text, knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Einstellungen$/i)?.click(); await warte(300);
  check("D: vorhandener Demo-Seed zeigt trotz Clean-Wert den Demo-Modus", /Demo-Modus/.test(text()));
  check("D: vorhandener Demo-Seed bietet Demo-Daten entfernen an", !!knopf(/^Demo-Daten entfernen$/));
  dom.window.close();
}

/* E — Übergangsformat mit Boolean-Markern wird über die Demo-DB auf exakte
   Einträge aufgelöst; eigene spätere Ergänzungen bleiben erhalten. */
{
  const heute = new Date();
  const heuteTermin = `${heute.getDate()}.${heute.getMonth() + 1}.`;
  const demoTermin = `${heuteTermin} 20:00 · Demo`;
  const eigenerTermin = `${heuteTermin} 21:00 · Eigenes Kino`;
  const demoRows = [
    { key: "kd:master", value: JSON.stringify(masterDatei) },
    { key: "kd:streaming-dienste", value: JSON.stringify({ quellen: ["Netflix"], heuristik: true }) },
    { key: "kd:kino-pins", value: JSON.stringify([{ t: "Alt-Demo", z: demoTermin }]) },
    { key: "kd:merkliste", value: JSON.stringify([{ watchmode_id: 7001, titel: "Alt-Demo" }]) },
  ];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:demo-seed", JSON.stringify({ masterIds: [], artikelIds: [], pins: true, merkliste: true, streaming: true }));
    w.localStorage.setItem("kd:kino-pins", JSON.stringify([{ t: "Alt-Demo", z: demoTermin }, { t: "Eigener Pin", z: eigenerTermin }]));
    w.localStorage.setItem("kd:merkliste", JSON.stringify([{ watchmode_id: 7001, titel: "Alt-Demo" }, { watchmode_id: 7002, titel: "Eigener Merker" }]));
    w.localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["Netflix", "MUBI"], heuristik: true }));
  }, demoRows);
  const { knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Einstellungen$/i)?.click(); await warte(300);
  knopf(/^Demo-Daten entfernen$/)?.click(); await warte(450);
  const pins = JSON.parse(dom.window.localStorage.getItem("kd:kino-pins") || "[]");
  const merker = JSON.parse(dom.window.localStorage.getItem("kd:merkliste") || "[]");
  const cfg = JSON.parse(dom.window.localStorage.getItem("kd:streaming-dienste") || "{}");
  check("E: alter Demo-Seed entfernt nur den exakten Demo-Pin", pins.length === 1 && pins[0].t === "Eigener Pin");
  check("E: alter Demo-Seed entfernt nur den exakten Demo-Merker", merker.length === 1 && merker[0].watchmode_id === 7002);
  if (pins.length !== 1 || pins[0]?.t !== "Eigener Pin" || merker.length !== 1 || merker[0]?.watchmode_id !== 7002) {
    console.log("  Ist-Wert Pins:", JSON.stringify(pins));
    console.log("  Ist-Wert Merkliste:", JSON.stringify(merker));
  }
  check("E: alter Demo-Seed erhält eigene Streamingquelle", JSON.stringify(cfg.quellen) === JSON.stringify(["MUBI"]));
  dom.window.close();
}

/* F — Kann ein alter Boolean-Seed ohne Demo-Read nicht auf exakte Einträge
   aufgelöst werden, bleibt alles samt Seed für einen späteren Versuch erhalten. */
{
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:demo-seed", JSON.stringify({ masterIds: [], artikelIds: [], pins: true, merkliste: true, streaming: true }));
    w.localStorage.setItem("kd:kino-pins", JSON.stringify([{ t: "Unklarer Pin", z: "31.12. 20:00 · Test" }]));
    w.localStorage.setItem("kd:merkliste", JSON.stringify([{ watchmode_id: 8001, titel: "Unklarer Merker" }]));
    w.localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["MUBI"], heuristik: true }));
  });
  const { text, knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Einstellungen$/i)?.click(); await warte(300);
  knopf(/^Demo-Daten entfernen$/)?.click(); await warte(450);
  check("F: Offline-Legacy-Seed bleibt für einen späteren Versuch erhalten", !!dom.window.localStorage.getItem("kd:demo-seed"));
  check("F: Offline-Legacy-Bereinigung löscht keine Pins oder Merker",
    JSON.parse(dom.window.localStorage.getItem("kd:kino-pins") || "[]").length === 1
    && JSON.parse(dom.window.localStorage.getItem("kd:merkliste") || "[]").length === 1);
  check("F: Offline-Legacy-Bereinigung erhält eigene Streamingauswahl",
    JSON.stringify(JSON.parse(dom.window.localStorage.getItem("kd:streaming-dienste") || "{}").quellen) === JSON.stringify(["MUBI"]));
  check("F: Offline-Legacy-Bereinigung erklärt den sicheren Abbruch", /nichts gelöscht/i.test(text()));
  dom.window.close();
}

/* G — Ein abgebrochener Wechsel mit persönlichen Daten verändert weder Modus
   noch gespeicherten Inhalt. */
{
  const artikel = { artikel: [{ id: "eigener_artikel", titel: "Eigener Artikel", text: "Bleibt.", liste: [] }] };
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.confirm = () => false;
    w.localStorage.setItem("kd:artikel", JSON.stringify(artikel));
  });
  const { knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Einstellungen$/i)?.click(); await warte(300);
  knopf(/^Startmodus wählen$/)?.click(); await warte(100);
  knopf(/^Demo ansehen$/)?.click(); await warte(150);
  check("G: abgebrochener Wechsel bleibt im Clean-Modus", dom.window.localStorage.getItem("kd:start") === "clean");
  check("G: abgebrochener Wechsel erhält persönliche Artikel",
    JSON.parse(dom.window.localStorage.getItem("kd:artikel") || "{}").artikel?.[0]?.id === "eigener_artikel");
  check("G: Startwahl bleibt nach dem Abbruch offen", !!knopf(/^Demo ansehen$/));
  dom.window.close();
}

/* H — Der generische MasterImport öffnet bei leerem Text die Datei und
   importiert bei nichtleerem Text weiterhin direkt. */
{
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { doc, knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Einstellungen$/i)?.click(); await warte(300);
  const importKnopf = knopf(/^Masterliste importieren$/);
  const dateiInput = importKnopf?.parentElement?.querySelector('input[type="file"]');
  let dateiDialog = false;
  if (dateiInput) dateiInput.click = () => { dateiDialog = true; };
  importKnopf?.click();
  check("H: leere neue Masterliste öffnet den Dateidialog", !!importKnopf && dateiDialog);
  const textarea = [...doc.querySelectorAll("textarea")].find((t) => /JSON hier einfügen/.test(t.placeholder || ""));
  if (textarea) setWert(dom, textarea, JSON.stringify({ filme: [{ titel: "Direktimport", jahr: 2024, typ: "film" }] }));
  importKnopf?.click(); await warte(180);
  let master = null;
  try { master = JSON.parse(dom.window.localStorage.getItem("kd:master") || "null"); } catch { /* */ }
  check("H: nichtleerer Text importiert weiterhin ohne Dateidialog", !!textarea && master?.filme?.some((f) => f.titel === "Direktimport"));
  dom.window.close();
}

/* I — KI-Übernahme ergänzt einen bestehenden Master, ohne vorhandene Einträge
   zu ersetzen. */
{
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:master", JSON.stringify({
      meta: null,
      filme: [{ id: "bestand_2020", titel: "Bestand", jahr: 2020, typ: "film", notiz: "unverändert" }],
      herkunft: { typ: "storage" },
      gespeichertAm: 1,
    }));
  });
  const { doc, knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Einstellungen$/i)?.click(); await warte(300);
  knopf(/^KI-Prompt öffnen$/)?.click(); await warte(100);
  const paste = [...doc.querySelectorAll("textarea")].find((t) => /JSON aus der KI-Antwort/.test(t.placeholder || ""));
  if (paste) {
    setWert(dom, paste, JSON.stringify({
      format: "kinodreieck-paket", version: 1, autor: "Tester", quelle: "ki-ingestion",
      bereiche: { filme: [{ titel: "Ergänzung", jahr: 2025, typ: "film", quelle: "dvd", kategorie: "sehenswert", bewertung: { wie: 3, was: 3, warum: 3 }, genre: [], tags: [], begruendung: "Test." }] },
    }));
    knopf(/^Eingefügtes importieren$/)?.click(); await warte(120);
    knopf(/^Auswahl übernehmen$/)?.click(); await warte(180);
  }
  let master = null;
  try { master = JSON.parse(dom.window.localStorage.getItem("kd:master") || "null"); } catch { /* */ }
  check("I: KI-Übernahme erhält bestehenden Mastereintrag",
    master?.filme?.some((f) => f.id === "bestand_2020" && f.notiz === "unverändert"));
  check("I: KI-Übernahme ergänzt den neuen Eintrag",
    master?.filme?.some((f) => f.titel === "Ergänzung"));
  dom.window.close();
}

const fehler = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - fehler.length}/${checks.length} Checks bestanden.`);
process.exit(fehler.length ? 1 : 0);

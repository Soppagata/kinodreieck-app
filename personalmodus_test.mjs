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

function seedKatalog(w, start = "clean") {
  w.localStorage.setItem("kd:start", start);
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
  const max = [...doc.querySelectorAll("span")].find((s) => (s.textContent || "").trim() === "Max" && s.style.cursor === "pointer");
  max?.click(); await warte(100);
  const dunkelEgg = knopf(/^Weils cool ist$/);
  check("B: dunkler Max-Knopf nennt NERV nicht", !!dunkelEgg && !/NERV|Showa/.test(dunkelEgg.textContent || ""));
  dunkelEgg?.click(); await warte(120);
  check("B: dunkler Knopf aktiviert genau NERV", !!doc.querySelector(".kd-wrap.kd-nerv") && !doc.querySelector(".kd-wrap.kd-showa"));
  knopf(/^Weils cool ist$/)?.click(); await warte(120);
  knopf(/^Foyer \(hell\)$/)?.click(); await warte(120);
  const hellEgg = knopf(/^Mit Stil$/);
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
    { key: "kd:kino-pins", value: "[]" }, { key: "kd:merkliste", value: "[]" }, { key: "kd:mustwatch", value: JSON.stringify({ eintraege: [] }) },
  ];
  const dom = baueDom((w) => {
    seedKatalog(w, "demo");
    w.localStorage.setItem("kd:sb:url", "https://test.supabase.co");
    w.localStorage.setItem("kd:sb:anon", "x".repeat(30));
  }, demoRows);
  const { text, knopf } = hilfen(dom);
  await warte(2600);
  knopf(/^Einstellungen$/i)?.click(); await warte(400);
  check("C: Demo übernimmt Max' Streamingdienste", /Netflix/.test(text()) && /Disney\+/.test(text()) && /Crunchyroll \(Prime\)/.test(text()));
  const entfernen = knopf(/^Demo-Daten entfernen$/);
  check("C: Demo hat klaren Entfernen-Knopf", !!entfernen);
  entfernen?.click(); await warte(500);
  check("C: Entfernen schaltet auf Clean und löscht Demo-Protokoll", dom.window.localStorage.getItem("kd:start") === "clean" && !dom.window.localStorage.getItem("kd:demo-seed"));
  knopf(/^Kino$/i)?.click(); await warte(350);
  check("C: gemeinsames Kinoprogramm bleibt erhalten", /Kinoprogramm neu laden/.test(text()) && !/Datenbank noch nicht verbunden/.test(text()));
  dom.window.close();
}

const fehler = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - fehler.length}/${checks.length} Checks bestanden.`);
process.exit(fehler.length ? 1 : 0);

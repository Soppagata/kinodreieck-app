/* Regressionstest des begrenzten Minimal-Login-Checkpoints sowie bestehender
   persönlicher Funktionen. Kein Nachweis vollständiger Konto-/Inhaltsgrenzen. */
import { readFileSync } from "node:fs";
import { TextEncoder } from "node:util";
import { JSDOM } from "jsdom";

const pfad = process.argv[2] || "dist-single/Kinodreieck.html";
const htmlRoh = readFileSync(pfad, "utf8");
/* Der Doppelklick-Build ist absichtlich ohne Online-Runtime konfiguriert. Die
   Account-Wechsel-Regressionsfälle weiter unten brauchen seit Rollen-v1 aber
   zusätzlich zur synthetischen Auth-Sitzung eine echte (gemockte) Own-Row-
   Freigabeabfrage. Nur die im Test ausgeführte HTML-Kopie bekommt deshalb eine
   öffentliche Testprojekt-Konfiguration; das ausgelieferte Artefakt bleibt
   unverändert und enthält weiterhin weder Schlüssel noch Zugangsdaten. */
const html = htmlRoh.replace(
  /supabaseUrl:([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.VITE_SUPABASE_URL\),supabasePublishableKey:([A-Za-z_$][\w$]*)\(\2\.VITE_SUPABASE_PUBLISHABLE_KEY\)/,
  (_match, urlFn, envName, textFn) => `supabaseUrl:${urlFn}(${envName}.VITE_SUPABASE_URL)||"https://test.supabase.co",supabasePublishableKey:${textFn}(${envName}.VITE_SUPABASE_PUBLISHABLE_KEY)||"sb_publishable_test"`,
);
const programm = JSON.parse(readFileSync(new URL("./src/data/programm-snapshot.json", import.meta.url), "utf8"));
const bekannt = JSON.parse(readFileSync(new URL("./src/data/streaming_bekannt_snapshot.json", import.meta.url), "utf8"));
const entdecken = JSON.parse(readFileSync(new URL("./src/data/streaming_entdecken_snapshot.json", import.meta.url), "utf8"));
const masterDatei = JSON.parse(readFileSync(new URL("./src/data/masterliste.json", import.meta.url), "utf8"));
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok) => {
  checks.push([name, !!ok]);
  console.log((ok ? "✓ " : "✗ ") + name);
  if (!ok && katalogRufe.length) {
    console.log("  Katalogrufe:", JSON.stringify(Object.fromEntries(
      [...new Set(katalogRufe.map((r) => r.name))].map((n) => [n, zaehle(n)]),
    )));
  }
};

/* Katalog-Mock mit echtem Datenbankverhalten (Etappe 4): `anon` sieht nur
   manifest + die *_demo-Zeilen, programm/streaming verlangen eine angemeldete
   Sitzung. PostgREST filtert per RLS OHNE 403 — HTTP 200 mit LEEREM Array. Ohne
   Authorization-Header liefert der Mock die Live-Zeilen deshalb leer. Dieser
   Test prüft die login-freie Tester-PWA, sieht also den Demo-Weg.
   `gueltig_bis` liegt bewusst in der Zukunft (sonst gilt der Snapshot als
   abgelaufen); die Demo-Payloads haben die Struktur ihres Live-Pendants. */
const KATALOG_STAND = "2026-07-22T12:00:00Z";
/* Die LIVE-Zeilen tragen einen anderen Stand als die Demo-Zeilen. Ohne diesen
   Unterschied könnte kein Check sagen, WESSEN Antwort im Topf bzw. auf dem
   Schirm gelandet ist: eine spät eintreffende Live-Antwort sähe exakt aus wie
   der Demo-Stand, und ein Check gegen sie wäre wertlos (P3). */
const KATALOG_STAND_LIVE = "2026-07-20T12:00:00Z";
const KATALOG_GUELTIG_BIS = new Date(Date.now() + 30 * 86400000).toISOString();
/* Demo- und Live-Zeile MÜSSEN unterscheidbar sein: mit identischer Payload könnte
   kein Check sagen, WELCHE Zeile geliefert wurde. Die Demo-Zeile trägt deshalb
   einen zusätzlichen, klar markierten Film (ans Ende des Programms sortiert) und
   — wie der echte Demo-Schnappschuss — demo: true im Streamingkatalog; die
   Live-Zeile hat beides nicht. Struktur und Bestandsfilme bleiben identisch. */
const DEMO_MARKER_TITEL = "Demo-Zeilen-Marker";
const SPAETESTE_ZEIT = programm.filme.flatMap((f) => (f.vorstellungen || []).map((v) => v.zeit)).sort().at(-1);
const programmDemo = {
  ...programm,
  filme: [...programm.filme, {
    ...programm.filme[0],
    film_at_id: 999000001, titel: DEMO_MARKER_TITEL, originaltitel: DEMO_MARKER_TITEL,
    vorstellungen: [{ ...(programm.filme[0].vorstellungen || [])[0], zeit: SPAETESTE_ZEIT }],
  }],
};
const KATALOG_ZEILEN = {
  manifest: { payload: { stand: KATALOG_STAND }, quelle: "manifest" },
  programm: { payload: programm, quelle: "film-at", stand: KATALOG_STAND_LIVE },
  programm_demo: { payload: programmDemo, quelle: "demo-schnappschuss" },
  streaming: { payload: { bekannt: { ...bekannt, demo: false }, entdecken: { ...entdecken, demo: false } }, quelle: "watchmode", stand: KATALOG_STAND_LIVE },
  streaming_demo: { payload: { bekannt, entdecken }, quelle: "demo-schnappschuss" },
  streaming_bekannt: { payload: { ...bekannt, demo: false }, quelle: "watchmode", stand: KATALOG_STAND_LIVE },
  streaming_entdecken: { payload: { ...entdecken, demo: false }, quelle: "watchmode", stand: KATALOG_STAND_LIVE },
  streaming_bekannt_demo: { payload: bekannt, quelle: "demo-schnappschuss" },
  streaming_entdecken_demo: { payload: entdecken, quelle: "demo-schnappschuss" },
  demo_seed: {
    payload: {
      format: 1,
      master: masterDatei,
      mustwatch: { eintraege: [] },
      streaming_dienste: { quellen: [], heuristik: true },
      artikel: { artikel: [] },
      kino_pins: [],
      merkliste: [],
    },
    quelle: "kinodreieck_demo",
  },
};
const NUR_ANGEMELDET = new Set([
  "programm", "streaming", "streaming_bekannt", "streaming_entdecken",
]);
/* Mitschrift der Katalog-Requests. Nur damit lässt sich zeigen, dass ein Boot
   NICHT nachlädt (Gegenproben zu F1/F2) bzw. ein Betriebsart-Wechsel genau
   einmal nachlädt und danach Ruhe gibt (F3). */
let katalogRufe = [];
let accessRole = "member";
let katalogGueltigBis = KATALOG_GUELTIG_BIS;
/* Steuerpult der Attrappe für die Wechsel-Blöcke (N–R). `fehlend` lässt eine
   Zeile auch MIT Token leer zurückkommen (der heutige Produktionsfall: die
   *_demo-Zeilen sind noch nicht veröffentlicht), `verzoegerung` macht eine
   Antwort langsam — nur damit lässt sich eine überholte Antwort überhaupt
   erzeugen. Alle älteren Blöcke lassen beides leer. */
/* `tokenAbgelehnt` beantwortet NUR die Requests MIT Token mit HTTP 401 (der
   abgelaufene/abgewiesene JWT). Der anon-Rückfall von direktLesen läuft danach
   normal weiter und bekommt für eine Live-Zeile das leere RLS-Ergebnis — genau
   so entsteht produktiv „Anmeldung nötig".
   `schluesselAbgelehnt` antwortet JEDEM Request mit 401, auch dem anon-Rückfall
   — das ist der abgelehnte apikey und ergibt INVALID_KEY.
   `serverFehler` ist der schlichte 503, `kaputtePayload` eine Zeile, die die
   Strukturprüfung besteht und erst in der Normalisierung platzt (der einzige
   Weg zu einem Fehler OHNE eigenen Code). */
const netz = {
  fehlend: new Set(), verzoegerung: new Map(),
  tokenAbgelehnt: new Set(), schluesselAbgelehnt: new Set(),
  serverFehler: new Set(), kaputtePayload: new Set(),
};
const netzReset = () => {
  netz.fehlend.clear(); netz.verzoegerung.clear();
  netz.tokenAbgelehnt.clear(); netz.schluesselAbgelehnt.clear();
  netz.serverFehler.clear(); netz.kaputtePayload.clear();
};
/* Besteht pruefePayload (filme[] ist da), bringt aber normalisiereProgramm zu
   Fall: `vorstellungen` ist wahrheitswertig, aber kein Array — .filter() gibt es
   darauf nicht. Der Wurf trägt keinen `code`; das ist der Punkt. */
const KAPUTTE_PROGRAMM_PAYLOAD = { filme: [{ titel: "Kaputter Eintrag", vorstellungen: "kein-array" }] };
const zaehle = (name) => katalogRufe.filter((r) => r.name === name).length;
async function katalogAntwort(url, opts = {}) {
  const name = new URL(String(url)).searchParams.get("name")?.replace(/^eq\./, "");
  const zeile = KATALOG_ZEILEN[name];
  const mitToken = !!(opts.headers && opts.headers.Authorization);
  katalogRufe.push({ name, mitToken });
  const ms = netz.verzoegerung.get(name) || 0;
  if (ms) await warte(ms);
  if (netz.serverFehler.has(name)) {
    return { ok: false, status: 503, json: async () => ({ message: "Service Unavailable" }), text: async () => "" };
  }
  if (netz.schluesselAbgelehnt.has(name) || (netz.tokenAbgelehnt.has(name) && mitToken)) {
    return { ok: false, status: 401, json: async () => ({ message: "JWT expired" }), text: async () => "" };
  }
  if (netz.kaputtePayload.has(name)) {
    return {
      ok: true,
      status: 200,
      json: async () => [{
        payload: KAPUTTE_PROGRAMM_PAYLOAD, updated_at: KATALOG_STAND, stand: KATALOG_STAND,
        gueltig_bis: katalogGueltigBis, quelle: "film-at",
      }],
      text: async () => "",
    };
  }
  const sichtbar = !!zeile && !netz.fehlend.has(name) && (mitToken || !NUR_ANGEMELDET.has(name));
  const stand = (zeile && zeile.stand) || KATALOG_STAND;
  const zeilen = sichtbar
    ? [{ payload: zeile.payload, updated_at: stand, stand, gueltig_bis: katalogGueltigBis, quelle: zeile.quelle }]
    : [];
  return { ok: true, status: 200, json: async () => zeilen, text: async () => "" };
}

/* Ein gespeicherter Programm-Topf (K.programm = kd:programm-cache) wie ihn die
   App selbst schreibt. `extra` setzt gezielt die Felder, um die es geht. */
const programmTopf = (extra = {}) => JSON.stringify({
  fetchedAt: Date.now(), stand: KATALOG_STAND, art: "datenbank", data: programm, ...extra,
});
/* Eine gültige Sitzung im Ablageformat des Auth-Treibers (kd:auth:session).
   Platzhalter, keine echten Schlüssel — der Treiber prüft nur Form und Ablauf. */
const sitzungsTopf = () => JSON.stringify({
  v: 1,
  access_token: "test-zugriffstoken-platzhalter",
  refresh_token: "test-erneuerungswert-platzhalter",
  gueltigBis: Date.now() + 3600000,
  kontoId: "test-konto", mail: "tester@login.kinodreieck.at", benutzername: "tester",
});
/* Die App prüft die Sitzung beim Sichtbarwerden (main.jsx: visibilitychange ->
   authService.refresh()). Das ist der produktive Weg, auf dem eine Betriebsart
   während der Laufzeit wechselt. */
const sichtbarWerden = (dom) => dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));

/* Der Kino-Tab zeigt den Stand als „Stand TT.MM., hh:mm". Aus einem ISO-Wert das
   passende Muster bauen — nur so lässt sich prüfen, WESSEN Stand dort steht. */
const standMuster = (iso) => new RegExp("Stand "
  + new Date(iso).toLocaleString("de-AT", { day: "2-digit", month: "2-digit" }).replace(/\./g, "\\."));

/* Cache-Storage-Attrappe. jsdom bringt weder `caches` noch `Response` mit —
   ohne beides liefe der Cache-Zweig von lib/katalog.js im Browsertest gar nicht,
   und „der Wechsel verwirft die Cache-Einträge NICHT" wäre eine Aussage über
   einen Speicher, den es im Test nie gab. `loeschungen` schreibt jeden
   Verwurf mit; `speicher` ist der Inhalt. */
function seedCacheStorage(w, speicher, loeschungen) {
  w.Response = class {
    constructor(body) { this._b = String(body); }
    async text() { return this._b; }
    async json() { return JSON.parse(this._b); }
  };
  w.caches = {
    async open() {
      return {
        async put(url, res) { speicher.set(String(url), await res.text()); },
        async match(url) {
          const roh = speicher.get(String(url));
          return roh == null ? undefined : new w.Response(roh);
        },
        async delete(url) { loeschungen.push(String(url)); return speicher.delete(String(url)); },
      };
    },
  };
}
const cacheSchluessel = (name) => "http://localhost/__kd_katalog_cache__/" + name;

function baueDom(seed = () => {}, demoRows = null) {
  if (Array.isArray(demoRows)) {
    const blobs = {};
    for (const row of demoRows) {
      try { blobs[row.key] = JSON.parse(row.value); } catch { /* ungültig bleibt fehlend */ }
    }
    KATALOG_ZEILEN.demo_seed = {
      payload: {
        format: 1,
        master: blobs["kd:master"] || { meta: {}, filme: [] },
        mustwatch: blobs["kd:mustwatch"] || { eintraege: [] },
        streaming_dienste: blobs["kd:streaming-dienste"] || { quellen: [], heuristik: true },
        artikel: blobs["kd:artikel"] || { artikel: [] },
        kino_pins: blobs["kd:kino-pins"] || [],
        merkliste: blobs["kd:merkliste"] || [],
      },
      quelle: "kinodreieck_demo",
    };
  }
  return new JSDOM(html, {
    url: "http://localhost/Kinodreieck.html", runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.confirm = () => true;
      w.TextEncoder = TextEncoder;
      if (!w.URL.createObjectURL) w.URL.createObjectURL = () => "blob:test";
      if (!w.URL.revokeObjectURL) w.URL.revokeObjectURL = () => {};
      if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.fetch = async (url, opts = {}) => {
        const s = String(url);
        if (s.includes("/rest/v1/kd_account_access")) {
          return {
            ok: true, status: 200,
            json: async () => [{ role: accessRole, active: true, personal_ai: false }],
            text: async () => "",
          };
        }
        if (s.includes("/rest/v1/kd_catalog")) return katalogAntwort(s, opts);
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

/* Der Kinoprogramm-Status des Einstellungen-Tabs, punktgenau gelesen: das LETZTE
   <strong> im Absatz mit „Datenbankzugang:" (DatenTab rendert dort erst den
   Verbindungs-, dann den Programmstatus). Ein Regex über das ganze #root wäre
   hier die schon einmal gestellte Falle — Texte wie „Anmeldung nötig" oder
   „noch keine Beispieldaten veröffentlicht" stehen zeitgleich im Fehlerband und
   im Kino-Tab, ohne etwas über programmInfo auszusagen. */
function programmStatusText(doc) {
  const p = [...doc.querySelectorAll("p")].find((el) => /Datenbankzugang:/.test(el.textContent || ""));
  const strongs = p ? [...p.querySelectorAll("strong")] : [];
  return strongs.length ? (strongs.at(-1).textContent || "").trim() : null;
}

async function katalogNeuLaden(doc, knopf) {
  knopf(/^Settings$/i)?.click(); await warte(300);
  const erweitert = [...doc.querySelectorAll("summary")].find((s) => /^Erweitert/.test((s.textContent || "").trim()));
  if (erweitert && !erweitert.parentElement?.open) { erweitert.click(); await warte(150); }
  (knopf(/^Katalog jetzt neu laden$/) || knopf(/^Katalog neu laden$/))?.click();
  await warte(1200);
}

function setWert(dom, el, wert) {
  const proto = el.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement : dom.window.HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, wert);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function seedKatalog(w, start = "clean") {
  w.localStorage.setItem("kd:start", start);
  w.localStorage.setItem("kd:start-version", "local-v1");
  w.localStorage.setItem("kd:katalog:url", "https://test.supabase.co");
  w.localStorage.setItem("kd:katalog:key", "x".repeat(30));
  w.localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: ["kino", "pinboard", "mediathek", "eintrag", "streaming", "entdecken", "blog", "vokabular", "streaming-quellen", "erweitert", "waechter"] }));
}

/* A — Minimal-Login: Ohne Konto führt direkt in den lokalen Einstieg, ohne
   Demo-/Intro-/KI-Entscheidung. Noch vorhandene Legacy-Katalogpfade im Bundle
   sind ausdrücklich kein Beleg der vollständigen Privatrelease-Grenze. */
{
  check("A: Build enthält Minimal-Login und Legal-Link", html.includes("Ohne Konto fortfahren")
    && html.includes("Datenschutz & Rechtliches") && html.includes("Zurück zum Login"));
  check("A: Build enthält den DB-Leseschlüssel-Dialog", html.includes("Programmdaten verbinden") && html.includes("Mitgeschickter Leseschlüssel"));
  check("A: kein Terminal-Installer mehr erwähnt", !/Installation-(Mac|Windows)|Terminal-Installation/.test(html));
  check("A: Build enthält keine sichtbaren NERV-Texte, -Klassen oder Referenzassets",
    !/(?:\bNERV\b|kd-(?:fx-)?nerv|nerv-logo-reference|ABSOLUTE TERROR FIELD|警報)/.test(html));

  const alt = baueDom((w) => {
    w.localStorage.setItem("kd:start", "clean"); // Wert eines alten Builds, noch nicht bewusst bestätigt
    w.localStorage.setItem("kd:katalog:url", "https://test.supabase.co");
    w.localStorage.setItem("kd:katalog:key", "x".repeat(30));
  });
  await warte(1200);
  const a = hilfen(alt);
  check("A: alter stiller Clean-Wert überspringt den neuen Ersteinstieg nicht",
    !!a.knopf(/^Ohne Konto fortfahren$/) && !a.knopf(/^Leer starten$/) && !a.knopf(/^Demo ansehen$/));
  a.knopf(/^Ohne Konto fortfahren$/)?.click(); await warte(1000);
  check("A: bewusste Gastwahl führt direkt in die App, ohne zweiten Entscheidungsschritt",
    !!a.doc.querySelector(".kd-app") && !a.doc.querySelector(".kd-entry")
    && !a.knopf(/^Leer starten/) && !a.knopf(/^Demo ansehen/)
    && !/Drei Wege zu deinem Film|Du entscheidest über KI/.test(a.text()));
  check("A: lokaler Einstieg wird bestätigt, ohne Demo-Seed oder KI-Wahl zu erzeugen",
    alt.window.localStorage.getItem("kd:start") === "clean"
    && JSON.parse(alt.window.localStorage.getItem("kd:einstieg") || "{}").abgeschlossen === true
    && alt.window.localStorage.getItem("kd:demo-seed") === null
    && alt.window.localStorage.getItem("kd:ki") === null);
  alt.window.close();

  const leer = baueDom();
  await warte(1200);
  const l = hilfen(leer);
  check("A: vollständig leerer Browser zeigt Minimal-Login ohne Installation oder Startauswahl",
    !!l.knopf(/^Ohne Konto fortfahren$/) && !!l.knopf(/^Anmelden$/)
    && !/Kinodreieck installieren/.test(l.text())
    && !l.knopf(/^Leer starten$/) && !l.knopf(/^Demo ansehen$/));
  check("A: Legal ist separat verborgen und besitzt genau einen Einstiegslink",
    l.doc.querySelector("#datenschutz-rechtliches")?.hidden === true
    && l.doc.querySelectorAll('a[href="#datenschutz-rechtliches"]').length === 1);
  leer.window.close();

  const vorher = JSON.stringify({ filme: [{ id: "lokal-bleibt", titel: "Eigener Testeintrag", jahr: 2024, typ: "film", notiz: "unverändert" }] });
  const bestand = baueDom((w) => {
    w.localStorage.setItem("kd:master", vorher);
    w.localStorage.setItem("kd:einstieg", JSON.stringify({
      version: "private-v1", abgeschlossen: false, weg: "gast", grund: "abmeldung",
    }));
  });
  await warte(1200);
  const b = hilfen(bestand);
  check("A: explizit offener Einstieg lässt vorhandenen persönlichen Stand unverändert",
    !!b.knopf(/^Ohne Konto fortfahren$/) && bestand.window.localStorage.getItem("kd:master") === vorher);
  b.knopf(/^Ohne Konto fortfahren$/)?.click(); await warte(1000);
  check("A: direkter lokaler Einstieg bewahrt persönliche Daten bytegenau",
    !!b.doc.querySelector(".kd-app") && bestand.window.localStorage.getItem("kd:master") === vorher);
  bestand.window.close();
}

/* B — Settings-Reihenfolge und die namenlosen Max-Modi. */
{
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { doc, text, knopf } = hilfen(dom);
  await warte(2200);
  check("B: Clean bootet ins leere Dashboard mit DB-Katalog", /Dein Abend/.test(text()) && !/Programmdaten verbinden/.test(text()));
  knopf(/^Settings$/i)?.click(); await warte(400);
  const summaries = [...doc.querySelectorAll("summary")].map((s) => (s.textContent || "").trim());
  const ids = ["Darstellung & Verhalten", "Masterliste", "Gesamt-Backup", "Streaming-Quellen", "KI-Vokabular", "Über & Rechtliches"]
    .map((x) => summaries.findIndex((s) => s.startsWith(x)));
  check("B: normale Gast-Settings bleiben vollständig und verständlich geordnet",
    ids.every((x) => x >= 0) && ids.every((x, i) => i === 0 || x > ids[i - 1]));
  check("B: Gast-DOM enthält keine Betriebs-, Demo- oder Owner-Technik",
    !summaries.some((s) => /^(Datenmodus & Verbindung|Technik & Support|Kinoprogramm-Status|Katalog-Status|Erweitert —)/.test(s))
      && !knopf(/^Demo-Daten entfernen$/) && !knopf(/^Supportdaten kopieren$/));
  check("B: Datenschutz liegt unter Über & Rechtliches", /Datenschutz & Datenübersicht/.test(text()));
  check("B: Vorführmodus und Teilen & Tauschen entfernt", !/Vorführmodus|Teilen & Tauschen/.test(text()));
  const startmodus = knopf(/^Startmodus wählen$/);
  check("B: Startmodus ist keine allgemeine Wartungsfläche mehr", !startmodus
    && dom.window.localStorage.getItem("kd:start") === "clean");
  const stapelKlappe = [...doc.querySelectorAll("summary")].find((s) => /^Stapelimport/.test((s.textContent || "").trim()));
  check("B: Text-Stapelimport ist sichtbar", !!stapelKlappe);
  if (stapelKlappe && !stapelKlappe.parentElement.open) { stapelKlappe.click(); await warte(100); }
  const titelliste = [...doc.querySelectorAll("textarea")].find((t) => /Je Zeile ein Titel/.test(t.placeholder || ""));
  check("B: Textimport nimmt eine einfache Titelliste an", !!titelliste && !!knopf(/^Nur Sammlung erfassen$/));
  check("B: interne Kamera- und Bildupload-Aktionen sind entfernt", !knopf(/^Foto aufnehmen$/) && !knopf(/^Bilder wählen$/));
  setWert(dom, titelliste, "Alien\nBlade Runner\nHeat\nArrival\nStalker");
  knopf(/^Erfassen & vorbeurteilen$/)?.click(); await warte(100);
  check("B: Vorbeurteilung fordert WIE, WAS und WARUM für fünf Beispiele",
    doc.querySelectorAll('select[aria-label^="WIE für"]').length === 5
      && doc.querySelectorAll('select[aria-label^="WAS für"]').length === 5
      && doc.querySelectorAll('select[aria-label^="WARUM für"]').length === 5);
  const externKlappe = [...doc.querySelectorAll("summary")].find((s) => /extern mit GPT, Claude/i.test(s.textContent || ""));
  if (externKlappe && !externKlappe.parentElement.open) { externKlappe.click(); await warte(100); }
  check("B: externer Foto-Prompt öffnet sich",
    [...doc.querySelectorAll("textarea")].some((t) => /Kinodreieck – Mediathek-Erfassung/.test(t.value || ""))
      && !!knopf(/^Workflow kopieren$/) && !!knopf(/^Workflow \(\.md\) herunterladen$/));
  const paste = [...doc.querySelectorAll("textarea")].find((t) => /JSON-Antwort hier einfügen/.test(t.placeholder || ""));
  if (paste) {
    setWert(dom, paste, JSON.stringify({
      kandidaten: [{ titel: "KI-Testfilm", jahr: 2020, typ: "film", ereignisart: "liste", hinweis: "Test.", sicherheit: "hoch" }],
      warnungen: [],
    }));
    knopf(/^Antwort prüfen$/)?.click(); await warte(120);
    check("B: KI-Antwort erzeugt eine Stapel-Vorschau", /Vorschau – noch ist nichts gespeichert/.test(text()) && /KI-Testfilm/.test(text()));
    knopf(/^Auswahl übernehmen$/)?.click(); await warte(180);
    let gespeichert = null;
    try { gespeichert = JSON.parse(dom.window.localStorage.getItem("kd:master") || "null"); } catch { /* */ }
    check("B: Stapelimport übernimmt den neuen Mediathek-Eintrag", !!gespeichert?.filme?.some((f) => f.titel === "KI-Testfilm"));
  } else {
    check("B: KI-Antwort erzeugt eine Stapel-Vorschau", false);
    check("B: Stapelimport übernimmt den neuen Mediathek-Eintrag", false);
  }
  const max = [...doc.querySelectorAll("span")].find((s) => (s.textContent || "").trim() === "Max" && s.style.cursor === "pointer");
  max?.click(); await warte(100);
  const dunkelEgg = knopf(/^Schon kuhl$/);
  check("B: dunkler Max-Knopf verrät den Spezialmodus nicht", !!dunkelEgg && !/Neon Noir|NERV|Showa/.test(dunkelEgg.textContent || ""));
  dunkelEgg?.click(); await warte(120);
  let gespeicherteDarstellung = null;
  try { gespeicherteDarstellung = JSON.parse(dom.window.localStorage.getItem("kd:einstellungen") || "null"); } catch { /* */ }
  const neonOverlay = doc.querySelector('.kd-fx-neon-noir[aria-hidden="true"]');
  check("B: dunkler Knopf aktiviert genau Neon Noir",
    !!doc.querySelector(".kd-wrap.kd-neon-noir") && !doc.querySelector(".kd-wrap.kd-showa, .kd-wrap.kd-nerv"));
  check("B: Neon Noir wird beim Gast gerätelokal gespeichert", gespeicherteDarstellung?.modus === "neon-noir");
  check("B: Theme-Attribut erreicht die globale Dokumentwurzel",
    !!doc.querySelector('[data-kd-theme="neon-noir"]'));
  check("B: Neon-Noir-Kulisse ist rein dekorativ",
    !!neonOverlay && dom.window.getComputedStyle(neonOverlay).pointerEvents === "none"
    && !neonOverlay.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'));
  knopf(/^Schon kuhl$/)?.click(); await warte(120);
  try { gespeicherteDarstellung = JSON.parse(dom.window.localStorage.getItem("kd:einstellungen") || "null"); } catch { /* */ }
  check("B: erneuter Toggle entfernt den Spezialmodus dauerhaft", gespeicherteDarstellung?.modus === ""
    && !doc.querySelector(".kd-wrap.kd-neon-noir"));
  knopf(/^Foyer \(hell\)$/)?.click(); await warte(120);
  const hellEgg = knopf(/^Classix$/);
  hellEgg?.click(); await warte(120);
  check("B: heller Knopf aktiviert genau Showa", !!doc.querySelector(".kd-wrap.kd-showa") && !doc.querySelector(".kd-wrap.kd-neon-noir, .kd-wrap.kd-nerv"));
  dom.window.close();
}

/* B2 — der interne Altwert bleibt ausschließlich als Lese-Migration erhalten.
   Bestehende Geräte sollen Neon Noir erhalten; nach dem ersten Boot darf der
   alte Wert aber weder weitergeschrieben noch als alte Klasse gerendert werden. */
{
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:einstellungen", JSON.stringify({
      theme: "dunkel", startTab: "start", schrift: "normal", modus: "nerv", basisTheme: "dunkel",
    }));
  });
  const { doc } = hilfen(dom);
  await warte(2200);
  let migriert = null;
  try { migriert = JSON.parse(dom.window.localStorage.getItem("kd:einstellungen") || "null"); } catch { /* */ }
  check("B2: gespeichertes NERV migriert einmalig zu Neon Noir", migriert?.modus === "neon-noir");
  check("B2: Migration rendert ausschließlich die neue Theme-Identität",
    !!doc.querySelector('.kd-wrap.kd-neon-noir[data-kd-theme="neon-noir"], .kd-wrap.kd-neon-noir')
    && !!doc.querySelector('.kd-fx-neon-noir[aria-hidden="true"]')
    && !doc.querySelector('.kd-nerv, .kd-fx-nerv, [aria-label="NERV"]'));
  dom.window.close();
}

/* C — Demo übernimmt Dienste; ihre Löschung ist keine allgemeine Settings-
   Oberfläche mehr. Der Löschvertrag selbst bleibt im fokussierten Seed-Test. */
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
  knopf(/^Settings$/i)?.click(); await warte(400);
  check("C: Demo übernimmt Max' Streamingdienste in Settings mit ihren Rohbezeichnungen", /Netflix/.test(text()) && /Disney\+/.test(text()) && /Crunchyroll Premium \(Via Amazon Prime\)/.test(text()));
  const quellenSuche = doc.querySelector('input[placeholder^="Quelle suchen"]');
  if (quellenSuche) {
    setWert(dom, quellenSuche, "MUBI"); await warte(100);
    [...doc.querySelectorAll("button")].find((b) => /MUBI/.test(b.textContent || "") && /hinzufügen/.test(b.title || ""))?.click();
    await warte(120);
  }
  const entfernen = knopf(/^Demo-Daten entfernen$/);
  check("C: Demo-Löschung fehlt in normalen Settings vollständig", !entfernen);
  const ersetzen = knopf(/^Masterliste ersetzen$/);
  const dateiInput = ersetzen?.parentElement?.querySelector('input[type="file"]');
  let dateiDialog = false;
  if (dateiInput) dateiInput.click = () => { dateiDialog = true; };
  ersetzen?.click();
  check("C: Masterliste ersetzen öffnet bei leerem Text den Dateidialog", !!ersetzen && dateiDialog);
  let cfg = null;
  try {
    cfg = JSON.parse(dom.window.localStorage.getItem("kd:streaming-dienste") || "null");
  } catch { /* */ }
  check("C: Verdeckte Löschung verändert weder Demo-Stand noch spätere Auswahl",
    dom.window.localStorage.getItem("kd:start") === "demo"
      && cfg?.quellen?.includes("MUBI") && cfg?.quellen?.includes("Netflix"));
  knopf(/^Kino$/i)?.click(); await warte(350);
  check("C: gemeinsames Kinoprogramm bleibt erhalten", /Stand \d{2}\.\d{2}\./.test(text()) && !/Datenbank noch nicht verbunden/.test(text()));
  dom.window.close();
}

/* D — Ein alter Demo-Marker darf keine Betriebsfläche für Gäste öffnen. */
{
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:demo-seed", JSON.stringify({ masterIds: [], artikelIds: [], geladenAm: "2026-07-22" }));
  });
  const { text, knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Settings$/i)?.click(); await warte(300);
  check("D: vorhandener Demo-Seed öffnet weder Datenmodus noch Demo-Löschung",
    !/Demo-Modus/.test(text()) && !knopf(/^Demo-Daten entfernen$/));
  dom.window.close();
}

/* E — Ein Legacy-Marker bleibt ohne sichtbare Löschaktion vollständig
   unangetastet; die eigentliche Bereinigung prüft demo_seed_test.mjs. */
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
  knopf(/^Settings$/i)?.click(); await warte(300);
  check("E: normale Settings bieten keine Legacy-Demo-Löschung an", !knopf(/^Demo-Daten entfernen$/));
  const pins = JSON.parse(dom.window.localStorage.getItem("kd:kino-pins") || "[]");
  const merker = JSON.parse(dom.window.localStorage.getItem("kd:merkliste") || "[]");
  const cfg = JSON.parse(dom.window.localStorage.getItem("kd:streaming-dienste") || "{}");
  check("E: verdeckte Löschung verändert weder Demo- noch Eigen-Pin", pins.length === 2);
  check("E: verdeckte Löschung verändert weder Demo- noch Eigen-Merker", merker.length === 2);
  if (pins.length !== 2 || merker.length !== 2) {
    console.log("  Ist-Wert Pins:", JSON.stringify(pins));
    console.log("  Ist-Wert Merkliste:", JSON.stringify(merker));
  }
  check("E: verdeckte Löschung erhält Demo- und eigene Streamingquelle",
    JSON.stringify(cfg.quellen) === JSON.stringify(["Netflix", "MUBI"]));
  dom.window.close();
}

/* F — Ohne allgemeine Löschaktion bleibt auch ein offline unklarer Legacy-
   Marker unverändert und löst keinen Bereinigungsrequest aus. */
{
  netzReset();
  netz.fehlend.add("demo_seed");
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:demo-seed", JSON.stringify({ masterIds: [], artikelIds: [], pins: true, merkliste: true, streaming: true }));
    w.localStorage.setItem("kd:kino-pins", JSON.stringify([{ t: "Unklarer Pin", z: "31.12. 20:00 · Test" }]));
    w.localStorage.setItem("kd:merkliste", JSON.stringify([{ watchmode_id: 8001, titel: "Unklarer Merker" }]));
    w.localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["MUBI"], heuristik: true }));
  });
  const { text, knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Settings$/i)?.click(); await warte(300);
  check("F: Offline-Legacy-Seed bietet keine allgemeine Löschaktion", !knopf(/^Demo-Daten entfernen$/));
  check("F: Offline-Legacy-Seed bleibt für einen späteren Versuch erhalten", !!dom.window.localStorage.getItem("kd:demo-seed"));
  check("F: Offline-Legacy-Bereinigung löscht keine Pins oder Merker",
    JSON.parse(dom.window.localStorage.getItem("kd:kino-pins") || "[]").length === 1
    && JSON.parse(dom.window.localStorage.getItem("kd:merkliste") || "[]").length === 1);
  check("F: Offline-Legacy-Bereinigung erhält eigene Streamingauswahl",
    JSON.stringify(JSON.parse(dom.window.localStorage.getItem("kd:streaming-dienste") || "{}").quellen) === JSON.stringify(["MUBI"]));
  check("F: Settings behaupten keinen ausgeführten Bereinigungsversuch", !/nichts gelöscht/i.test(text()));
  dom.window.close();
  netzReset();
}

/* G — Die frühere allgemeine Startmodus-Wartung bleibt verborgen und verändert
   weder Modus noch persönliche Inhalte. */
{
  const artikel = { artikel: [{ id: "eigener_artikel", titel: "Eigener Artikel", text: "Bleibt.", liste: [] }] };
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.confirm = () => false;
    w.localStorage.setItem("kd:artikel", JSON.stringify(artikel));
  });
  const { knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Settings$/i)?.click(); await warte(300);
  check("G: Settings bieten keinen allgemeinen Startmodus-Wechsel", !knopf(/^Startmodus wählen$/));
  check("G: verborgener Wechsel lässt den Clean-Modus bestehen", dom.window.localStorage.getItem("kd:start") === "clean");
  check("G: verborgener Wechsel erhält persönliche Artikel",
    JSON.parse(dom.window.localStorage.getItem("kd:artikel") || "{}").artikel?.[0]?.id === "eigener_artikel");
  dom.window.close();
}

/* H — Der generische MasterImport öffnet bei leerem Text die Datei und
   importiert bei nichtleerem Text weiterhin direkt. */
{
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { doc, knopf } = hilfen(dom);
  await warte(1800);
  knopf(/^Settings$/i)?.click(); await warte(300);
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

/* I — Der externe Stapelimport ergänzt einen bestehenden Master, ohne vorhandene
   Einträge zu ersetzen. */
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
  knopf(/^Settings$/i)?.click(); await warte(300);
  const stapelKlappe = [...doc.querySelectorAll("summary")].find((s) => /^Stapelimport/.test((s.textContent || "").trim()));
  if (stapelKlappe && !stapelKlappe.parentElement.open) { stapelKlappe.click(); await warte(100); }
  const externKlappe = [...doc.querySelectorAll("summary")].find((s) => /extern mit GPT, Claude/i.test(s.textContent || ""));
  if (externKlappe && !externKlappe.parentElement.open) { externKlappe.click(); await warte(100); }
  const paste = [...doc.querySelectorAll("textarea")].find((t) => /JSON-Antwort hier einfügen/.test(t.placeholder || ""));
  if (paste) {
    setWert(dom, paste, JSON.stringify({
      kandidaten: [{ titel: "Ergänzung", jahr: 2025, typ: "film", ereignisart: "liste", hinweis: "Test.", sicherheit: "hoch" }],
      warnungen: [],
    }));
    knopf(/^Antwort prüfen$/)?.click(); await warte(120);
    knopf(/^Auswahl übernehmen$/)?.click(); await warte(180);
  }
  let master = null;
  try { master = JSON.parse(dom.window.localStorage.getItem("kd:master") || "null"); } catch { /* */ }
  check("I: Stapelimport erhält bestehenden Mastereintrag",
    master?.filme?.some((f) => f.id === "bestand_2020" && f.notiz === "unverändert"));
  check("I: Stapelimport ergänzt den neuen Eintrag",
    master?.filme?.some((f) => f.titel === "Ergänzung"));
  dom.window.close();
}

/* J — Etappe 3: Anmelden ist ein Angebot, kein Tor.
   Der Gastbetrieb ist die Rückfallebene der ganzen App. Wenn ein Konto ihn je
   verstellt (Login-Overlay beim Start, Zwangsanmeldung vor der Mediathek), ist
   das ein Etappenfehler — genau davor bewacht dieser Block. */
{
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { doc, text, knopf } = hilfen(dom);
  await warte(2200);
  check("J: Ohne Konto startet die App direkt ins Dashboard (kein Anmeldefenster)",
    /Dein Abend/.test(text()) && !/Anmelden/.test(text()));

  knopf(/^Mediathek$/i)?.click(); await warte(300);
  check("J: Die Mediathek ist ohne jede Anmeldung erreichbar", !/Anmelden/i.test(text()));
  knopf(/^Kino$/i)?.click(); await warte(300);
  check("J: Der Kinobereich ist ohne jede Anmeldung erreichbar", !/Anmelden/i.test(text()));

  knopf(/^Settings$/i)?.click(); await warte(400);
  const summaries = [...doc.querySelectorAll("summary")].map((s) => (s.textContent || "").trim());
  check("J: Konto & Geräte-Sync ist als eigener Bereich vorhanden",
    summaries.some((s) => /Konto & Geräte-Sync/.test(s)));

  const kontoKlappe = [...doc.querySelectorAll("details")]
    .find((d) => /Konto & Geräte-Sync/.test(d.querySelector("summary")?.textContent || ""));
  if (kontoKlappe) { kontoKlappe.open = true; await warte(250); }
  const kontoText = kontoKlappe?.textContent || "";
  check("J: Der Kontobereich erklärt den Gastbetrieb ehrlich",
    /ohne Konto/i.test(kontoText) || /Ohne Konto bleibt alles/i.test(kontoText));
  check("J: Im Gastmodus steht dort weder ein Benutzername noch ein Token",
    !/Angemeldet als/.test(kontoText) && !/eyJ/.test(kontoText) && !/kd:auth/.test(kontoText));
  check("J: Es gibt bewusst keinen Passwort-vergessen-Automatismus",
    !/Passwort zurücksetzen/i.test(kontoText));

  const gespeichert = Object.keys(dom.window.localStorage).filter((k) => /^kd:(auth|acct)/.test(k));
  check("J: Ein Gast legt weder Sitzungs- noch Kontodaten an", gespeichert.length === 0);
  dom.window.close();
}

/* K — Etappe 4/F1: ein abgelaufener Programm-Topf überlebt den Neustart nicht.
   Der Autoload feuerte früher NUR bei leerem `programm`; ein gespeicherter, aber
   abgelaufener Schnappschuss blieb damit nach jedem Neustart als „aktuelles
   Kinoprogramm" stehen. Hier ist auch der frisch gelesene Stand abgelaufen —
   sonst wäre der Ablaufzustand nach dem Nachladen wieder weg und nicht prüfbar. */
{
  const TOPF_ABGELAUFEN = new Date(Date.now() - 10 * 86400000).toISOString();
  const DB_ABGELAUFEN = new Date(Date.now() - 2 * 86400000).toISOString();
  katalogGueltigBis = DB_ABGELAUFEN;
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:programm-cache", programmTopf({ gueltigBis: TOPF_ABGELAUFEN, variante: "demo" }));
  });
  const { text, knopf } = hilfen(dom);
  await warte(2400);
  check("K/F1: abgelaufener Programm-Topf löst beim Boot ein Nachladen aus", zaehle("programm_demo") >= 1);
  let neuerTopf = null;
  try { neuerTopf = JSON.parse(dom.window.localStorage.getItem("kd:programm-cache") || "null"); } catch { /* */ }
  check("K/F1: der abgelaufene Topf wird durch den frisch gelesenen Stand ersetzt (gueltigBis wandert mit)",
    neuerTopf?.gueltigBis === Date.parse(DB_ABGELAUFEN) && neuerTopf?.variante === "demo");
  knopf(/^Kino$/i)?.click(); await warte(500);
  /* Bewusst der programm-eigene Marker aus dem Kino-Tab („Stand … · abgelaufen"):
     ein bloßes /abgelaufen/ träfe auch den Streaming-Hinweis und wäre damit
     grün, ohne über das Programm irgendetwas auszusagen. */
  check("K/F1: der abgelaufene Programm-Stand wird in der Oberfläche als abgelaufen ausgewiesen",
    /· abgelaufen/.test(text()));
  dom.window.close();
  katalogGueltigBis = KATALOG_GUELTIG_BIS;
}

/* K2 — Ein Topf mit gueltigBis in der ZUKUNFT ist ein gültiger sofortiger
   Anzeigestand. Datenbankstände werden trotzdem einmal im Hintergrund
   revalidiert, damit ein neuer Publisher-Lauf nicht tagelang unsichtbar bleibt. */
{
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:programm-cache", programmTopf({ gueltigBis: KATALOG_GUELTIG_BIS, variante: "demo" }));
  });
  const { text, knopf } = hilfen(dom);
  await warte(2400);
  check("K2/F1-Gegenprobe: gültiger Cache wird einmal im Hintergrund revalidiert",
    zaehle("programm_demo") >= 1);
  knopf(/^Kino$/i)?.click(); await warte(500);
  check("K2/F1-Gegenprobe: der gültige Stand wird angezeigt und nicht als abgelaufen markiert",
    /Stand \d/.test(text()) && !/· abgelaufen/.test(text()));
  dom.window.close();
}

/* K3 — dritte Probe zu F1: ein Topf aus der Zeit VOR dem Feld. Ohne gueltigBis
   gibt es kein Urteil über den Ablauf — er bleibt lesbar, wird als DB-Cache
   aber ebenfalls im Hintergrund revalidiert. */
{
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:programm-cache", programmTopf());   // weder gueltigBis noch variante
  });
  const { text, knopf } = hilfen(dom);
  await warte(2400);
  check("K3/F1: alter Topf ohne gueltigBis bleibt lesbar und wird revalidiert",
    zaehle("programm_demo") >= 1);
  knopf(/^Kino$/i)?.click(); await warte(500);
  check("K3/F1: ohne gueltigBis fällt kein Ablaufurteil",
    /Stand \d/.test(text()) && !/· abgelaufen/.test(text()));
  dom.window.close();
}

/* L — Etappe 4/F2: die Betriebsart des gespeicherten Topfes muss zur Sitzung
   passen. Ein als „live" gespeicherter Topf ist für einen Gast kein gültiger
   Anzeigestand — sonst stünde eine Live-Payload als frischer Gast-Stand da. */
{
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:programm-cache", programmTopf({ gueltigBis: KATALOG_GUELTIG_BIS, variante: "live" }));
  });
  const { text, knopf } = hilfen(dom);
  await warte(2400);
  check("L/F2: ein „live“-Topf wird im Gastbetrieb nicht übernommen, sondern die Demo-Zeile nachgeladen",
    zaehle("programm_demo") >= 1);
  let topfDanach = null;
  try { topfDanach = JSON.parse(dom.window.localStorage.getItem("kd:programm-cache") || "null"); } catch { /* */ }
  check("L/F2: nach dem Nachladen steht die Betriebsart des Gastes im Topf", topfDanach?.variante === "demo");
  knopf(/^Kino$/i)?.click(); await warte(500);
  /* Bewusst der Marker des STAND-Etiketts („· Demo-Schnappschuss", KinoTab).
     Ein blankes /Demo-Schnappschuss/ über das ganze #root träfe auch den
     Fehlerkasten („Als Gast siehst du ohnehin nur den Demo-Schnappschuss"), der
     genau dann erscheint, wenn GAR KEIN Stand angezeigt wird — der Check wäre
     ausgerechnet im Schadensfall grün. Nachgewiesen: mit dauerhaft scheiterndem
     Programm-Laden blieb die alte Fassung grün. */
  check("L/F2: der angezeigte Stand ist danach als Demo-Schnappschuss ausgewiesen",
    /· Demo-Schnappschuss/.test(text()));
  dom.window.close();
}

/* L2 — Gegenprobe zu F2: passende Betriebsart wird sofort übernommen und dann
   im Hintergrund revalidiert. L3 — manuelle Importe tragen KEIN variante-Feld und bleiben
   ausdrücklich unangetastet; das ist gewolltes Verhalten, kein Schlupfloch. */
{
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:programm-cache", programmTopf({ gueltigBis: KATALOG_GUELTIG_BIS, variante: "demo" }));
  });
  await warte(2400);
  check("L2/F2-Gegenprobe: passende Betriebsart wird übernommen und revalidiert",
    zaehle("programm_demo") >= 1);
  dom.window.close();
}
{
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:programm-cache", programmTopf({ art: "manuell", gueltigBis: KATALOG_GUELTIG_BIS }));
  });
  const { text, knopf } = hilfen(dom);
  await warte(2400);
  check("L3/F2: manueller Import ohne Betriebsart-Feld bleibt unangetastet (kein Nachladen)",
    zaehle("programm_demo") === 0 && zaehle("programm") === 0);
  knopf(/^Kino$/i)?.click(); await warte(500);
  check("L3/F2: der manuelle Import wird nicht als Demo- oder Live-Stand etikettiert",
    /Stand \d/.test(text()) && !/Demo-Schnappschuss/.test(text()));
  dom.window.close();
}

/* M — Etappe 4/F3: der Wechsel der Betriebsart lädt wirklich nach. Drei Dinge
   auf einmal: der Startzustand ist KEIN Wechsel (sonst lädt der Start doppelt),
   der Wechsel lädt Programm UND Streaming der anderen Zeile nach und verwirft
   den Topf der alten Betriebsart, und danach ist Ruhe (keine Ladeschleife). */
{
  katalogRufe = [];
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { text, knopf } = hilfen(dom);
  await warte(2600);
  check("M/F3: der Startzustand ist kein Wechsel — je Bereich genau ein Request",
    zaehle("programm_demo") === 1 && zaehle("streaming_bekannt_demo") === 1
    && zaehle("programm") === 0 && zaehle("streaming_bekannt") === 0);
  knopf(/^Kino$/i)?.click(); await warte(500);
  /* Wie in L/F2: der Marker des Stand-Etiketts, nicht das blanke Wort — sonst
     antwortet der Fehlerkasten für den Stand mit. */
  check("M: im Gastbetrieb weist der Kino-Tab den angezeigten Stand als Demo-Schnappschuss aus",
    /· Demo-Schnappschuss/.test(text()));

  dom.window.localStorage.setItem("kd:auth:session", sitzungsTopf());
  sichtbarWerden(dom);
  await warte(1800);
  check("M/F3: Gast → Konto lädt Programm und Streaming der Live-Zeile nach",
    zaehle("programm") >= 1 && zaehle("streaming_bekannt") >= 1);
  check("M/F3: der Nachlade-Request trägt das Sitzungstoken — sonst bliebe die Live-Zeile leer",
    katalogRufe.some((r) => r.name === "programm" && r.mitToken));
  let topfLive = null;
  try { topfLive = JSON.parse(dom.window.localStorage.getItem("kd:programm-cache") || "null"); } catch { /* */ }
  /* P7: Dieser Check misst die ERSETZUNG — die das Nachladen ohnehin vornimmt —
     und sagt das jetzt auch. Sein alter Text behauptete zusätzlich ein
     Verwerfen; er blieb deshalb grün, als der komplette zerstörerische Teil des
     Wechsel-Effekts testweise entfernt wurde. Dass der Wechsel selbst NICHTS
     löscht, ist eine eigene Aussage und in N/P1 bzw. O/P2 gepinnt.
     Der Stand wird mitgeprüft: `variante` allein ließe eine Live-Payload mit
     dem Zeitstempel der Demo-Zeile durchgehen. */
  check("M/F3: nach dem Wechsel trägt der Topf den Live-Stand — das Nachladen hat ihn ersetzt",
    topfLive?.variante === "live" && topfLive?.stand === Date.parse(KATALOG_STAND_LIVE));
  check("M/F3: nach dem Wechsel ist der Demo-Schnappschuss-Hinweis weg", !/Demo-Schnappschuss/.test(text()));

  const nachWechsel = ["programm", "streaming_bekannt", "programm_demo", "streaming_bekannt_demo"].map(zaehle);
  await warte(1600);
  check("M/F3: nach dem Wechsel entsteht keine Ladeschleife (kein weiterer Request)",
    ["programm", "streaming_bekannt", "programm_demo", "streaming_bekannt_demo"].every((n, i) => zaehle(n) === nachWechsel[i]));

  const vorRueckwechsel = [zaehle("programm_demo"), zaehle("streaming_bekannt_demo")];
  dom.window.localStorage.removeItem("kd:auth:session");
  sichtbarWerden(dom);
  await warte(1800);
  check("M/F3: Konto → Gast lädt ebenso nach und fällt auf die Demo-Zeile zurück",
    zaehle("programm_demo") > vorRueckwechsel[0] && zaehle("streaming_bekannt_demo") > vorRueckwechsel[1]);
  let topfDemo = null;
  try { topfDemo = JSON.parse(dom.window.localStorage.getItem("kd:programm-cache") || "null"); } catch { /* */ }
  check("M/F3: nach dem Rückwechsel steht wieder der Demo-Stand im Topf",
    topfDemo?.variante === "demo" && topfDemo?.stand === Date.parse(KATALOG_STAND));
  dom.window.close();
}

/* ================== N — P1: der Wechsel löscht den Programm-Topf NICHT ==========
   Ein über den Notfallweg eingespieltes Programm (art "manuell", ohne variante)
   ist die einzige Kopie auf dem Gerät und ausgerechnet die Quelle für den Fall,
   dass die Datenbank nicht liefert. Der Wechsel-Effekt löschte K.programm früher
   unbedingt — scheiterte danach das Nachladen, war sie unwiederbringlich weg.
   Genau dieser Fall wird hier gefahren: Wechsel MIT scheiterndem Nachladen. */
{
  netzReset();
  netz.fehlend.add("programm");      // Live-Zeile fehlt -> das Nachladen scheitert
  netz.fehlend.add("streaming_bekannt");
  katalogRufe = [];
  const topfVorher = programmTopf({ art: "manuell", gueltigBis: KATALOG_GUELTIG_BIS });
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:programm-cache", topfVorher);
  });
  const { text, knopf } = hilfen(dom);
  await warte(2400);
  check("N/P1-Vorbedingung: der manuelle Import ist der Anzeigestand und löst kein Nachladen aus",
    zaehle("programm_demo") === 0 && zaehle("programm") === 0
    && dom.window.localStorage.getItem("kd:programm-cache") === topfVorher);

  dom.window.localStorage.setItem("kd:auth:session", sitzungsTopf());
  sichtbarWerden(dom);
  await warte(1800);
  check("N/P1-Vorbedingung: der Wechsel hat wirklich nachzuladen versucht (und ist gescheitert)",
    zaehle("programm") >= 1);
  check("N/P1: der manuell eingespielte Topf überlebt den Betriebsart-Wechsel Byte für Byte",
    dom.window.localStorage.getItem("kd:programm-cache") === topfVorher);
  knopf(/^Kino$/i)?.click(); await warte(500);
  const nText = text();
  const nEhrlich = /Für das aktuelle Kinoprogramm ist eine Anmeldung nötig|Kinoprogramm (?:nicht ladbar|konnte nicht geladen werden)/.test(nText)
    && !/Stand \d/.test(nText);
  check("N/P1: trotz erhaltenem Topf zeigt der Kino-Tab den ehrlichen Fehlzustand, nicht den alten Stand",
    nEhrlich);
  dom.window.close();
  netzReset();
}

/* ================== O — P2: kein fail-open beim gescheiterten Wechsel ==========
   Der Wechsel verwirft auch die Cache-Storage-Einträge nicht mehr. Das ist
   gefahrlos, weil cacheUrl(name) nach ZEILENNAMEN schlüsselt: `programm` und
   `programm_demo` liegen getrennt und können sich nicht überlagern. Beide
   Hälften gehören geprüft — sonst wäre „nichts gelöscht" nur die halbe Aussage:
   Topf UND Cache bleiben erhalten, UND die Oberfläche zeigt trotzdem den
   ehrlichen Fehlzustand statt des Stands der alten Betriebsart. */
{
  netzReset();
  const cacheInhalt = new Map();
  const cacheLoeschungen = [];
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    seedCacheStorage(w, cacheInhalt, cacheLoeschungen);
    w.localStorage.setItem("kd:auth:session", sitzungsTopf());   // Start im Konto-Betrieb
  });
  const { text, knopf } = hilfen(dom);
  await warte(2600);
  /* Ohne diese Vorbedingung wäre „nichts gelöscht" trivial wahr — ein leerer
     Speicher bleibt immer leer. */
  check("O/P2-Vorbedingung: der Live-Start hat Topf und Cache-Storage wirklich gefüllt",
    cacheInhalt.has(cacheSchluessel("programm")) && cacheInhalt.has(cacheSchluessel("streaming_bekannt"))
    && JSON.parse(dom.window.localStorage.getItem("kd:programm-cache") || "null")?.variante === "live");
  knopf(/^Kino$/i)?.click(); await warte(400);
  check("O/P2-Vorbedingung: der Live-Stand steht sichtbar im Kino-Tab",
    standMuster(KATALOG_STAND_LIVE).test(text()));

  netz.fehlend.add("programm_demo");    // heutiger Produktionsfall: Demo-Zeilen fehlen
  netz.fehlend.add("streaming_bekannt_demo");
  dom.window.localStorage.removeItem("kd:auth:session");
  sichtbarWerden(dom);
  await warte(2000);
  check("O/P2-Vorbedingung: der Wechsel hat die Demo-Zeile wirklich vergeblich versucht",
    zaehle("programm_demo") >= 1);
  const topfNachher = JSON.parse(dom.window.localStorage.getItem("kd:programm-cache") || "null");
  check("O/P2: der Programm-Topf bleibt beim gescheiterten Wechsel unangetastet erhalten",
    topfNachher?.variante === "live" && topfNachher?.stand === Date.parse(KATALOG_STAND_LIVE));
  check("O/P2: die Cache-Storage-Einträge werden nicht verworfen (kein einziger Verwurf)",
    cacheLoeschungen.length === 0
    && cacheInhalt.has(cacheSchluessel("programm")) && cacheInhalt.has(cacheSchluessel("streaming_bekannt")));
  await warte(400);
  check("O/P2: die Oberfläche zeigt den ehrlichen Fehlzustand …",
    /Für den öffentlichen Zugang sind noch keine Beispieldaten veröffentlicht/.test(text()));
  /* `!/Stand \d/` ist die stärkere Aussage und schließt den Live-Stand mit ein;
     das frühere zusätzliche `!standMuster(KATALOG_STAND_LIVE)` war davon
     logisch impliziert und prüfte nichts Eigenes. */
  check("O/P2: … und eben NICHT den Stand der alten Betriebsart",
    !/Stand \d/.test(text()));
  /* Der erhaltene Live-Cache ist auch kein Schlupfloch: er liegt unter einem
     anderen Zeilennamen und springt für die Demo-Zeile nicht ein. */
  check("O/P2: der erhaltene Live-Cache springt für die Demo-Zeile nicht ein (Schlüssel je Zeilenname)",
    !/aus dem Browser-Speicher/.test(text()));
  dom.window.close();
  netzReset();
}

/* ================== P — P3: eine überholte Antwort schreibt nicht mehr =========
   Langsamer Read der alten Betriebsart, schnelle Folge Anmelden → Abmelden.
   Trifft die späte Live-Antwort ein, gehört sie zu einer Zeile, die die App gar
   nicht mehr lesen darf — sie darf weder Anzeige noch Topf berühren. Live- und
   Demo-Zeile tragen dafür verschiedene Stände; mit identischer Payload bewiese
   der Check nichts. */
{
  netzReset();
  netz.verzoegerung.set("programm", 2600);
  netz.verzoegerung.set("streaming_bekannt", 2600);
  katalogRufe = [];
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { text, knopf } = hilfen(dom);
  /* Eichung der ganzen P/Q-Anordnung: sie kann nur dann zeigen, WESSEN Antwort
     angekommen ist, wenn Demo- und Live-Zeile wirklich verschiedene Stände
     tragen. Fielen die beiden Konstanten je zusammen, wären sämtliche
     „…schreibt nicht"-Checks darunter ohne Aussage — und zwar lautlos. */
  check("P/P3-Eichung: Demo- und Live-Zeile tragen unterscheidbare Stände",
    Date.parse(KATALOG_STAND) !== Date.parse(KATALOG_STAND_LIVE)
    && Number.isFinite(Date.parse(KATALOG_STAND)) && Number.isFinite(Date.parse(KATALOG_STAND_LIVE)));
  await warte(2600);
  knopf(/^Kino$/i)?.click(); await warte(400);
  check("P/P3-Vorbedingung: der Gast sieht zunächst den Demo-Stand",
    standMuster(KATALOG_STAND).test(text()) && /· Demo-Schnappschuss/.test(text()));

  dom.window.localStorage.setItem("kd:auth:session", sitzungsTopf());
  sichtbarWerden(dom);
  await warte(800);
  check("P/P3-Vorbedingung: der langsame Live-Read ist unterwegs und noch nicht beantwortet",
    zaehle("programm") === 1 && !standMuster(KATALOG_STAND_LIVE).test(text()));

  dom.window.localStorage.removeItem("kd:auth:session");
  sichtbarWerden(dom);
  await warte(1200);                       // der schnelle Demo-Read gewinnt
  check("P/P3-Vorbedingung: der schnelle Demo-Read der neuen Betriebsart ist durch",
    standMuster(KATALOG_STAND).test(text()));

  await warte(2800);                       // jetzt trifft die späte Live-Antwort ein
  const topfSpaet = JSON.parse(dom.window.localStorage.getItem("kd:programm-cache") || "null");
  /* Das frühere dritte Glied (`stand !== Date.parse(KATALOG_STAND_LIVE)`) war
     durch das zweite bereits erzwungen und konnte nie eigenständig anschlagen —
     dass die beiden Stände überhaupt verschieden sind, prüft jetzt die Eichung
     oben, und zwar an genau einer Stelle. */
  check("P/P3: die späte Live-Antwort schreibt nicht in den Topf — dort steht der Demo-Stand",
    topfSpaet?.variante === "demo" && topfSpaet?.stand === Date.parse(KATALOG_STAND));
  check("P/P3: sie ändert auch den angezeigten Stand nicht",
    standMuster(KATALOG_STAND).test(text()) && !standMuster(KATALOG_STAND_LIVE).test(text())
    && /· Demo-Schnappschuss/.test(text()));
  dom.window.close();
  netzReset();
}

/* Q — dieselbe Frage für den FEHLER-Zweig: eine überholte Antwort darf auch
   dann nichts anfassen, wenn sie scheitert. Sonst überschriebe ein spät
   eintreffendes „Live-Zeile fehlt" den gerade erst korrekt geladenen Demo-Stand
   mit einer Fehlermeldung, die zur alten Betriebsart gehört. */
{
  netzReset();
  netz.verzoegerung.set("programm", 2600);
  netz.verzoegerung.set("streaming_bekannt", 2600);
  netz.fehlend.add("programm");            // die späte Antwort ist ein Fehler
  netz.fehlend.add("streaming_bekannt");
  katalogRufe = [];
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { text, knopf } = hilfen(dom);
  await warte(2600);
  knopf(/^Kino$/i)?.click(); await warte(400);

  dom.window.localStorage.setItem("kd:auth:session", sitzungsTopf());
  sichtbarWerden(dom);
  await warte(800);
  check("Q/P3-Vorbedingung: der langsame, scheiternde Live-Read ist unterwegs", zaehle("programm") === 1);
  dom.window.localStorage.removeItem("kd:auth:session");
  sichtbarWerden(dom);
  await warte(1200);
  check("Q/P3-Vorbedingung: der Demo-Stand der neuen Betriebsart steht bereits",
    standMuster(KATALOG_STAND).test(text()) && /· Demo-Schnappschuss/.test(text()));

  await warte(2800);                       // die späte Absage trifft ein
  check("Q/P3: die späte Absage der alten Betriebsart verdrängt den gültigen Demo-Stand nicht",
    standMuster(KATALOG_STAND).test(text()) && /· Demo-Schnappschuss/.test(text()));
  check("Q/P3: sie schreibt auch keine Fehlermeldung der alten Betriebsart in die Oberfläche",
    !/Kinoprogramm konnte nicht geladen werden/.test(text())
    && !/nicht ladbar/.test(text()) && !/Anmeldung nötig/.test(text()));
  const topfQ = JSON.parse(dom.window.localStorage.getItem("kd:programm-cache") || "null");
  check("Q/P3: der Topf trägt weiterhin den Demo-Stand", topfQ?.variante === "demo");
  dom.window.close();
  netzReset();
}

/* ================== R — P6: keine Ladeschleife trotz freigegebenem autoFetched ==
   Der Wechsel-Effekt gibt `autoFetched` nach einem erfolglosen Nachladen wieder
   frei, damit der Autoload nicht für den Rest der Sitzung stillgelegt bleibt.
   Genau diese Freigabe kann eine Schleife erzeugen. Gemessen wird deshalb die
   ZAHL der Katalog-Requests über ein Ruhefenster — behauptet wird nichts, was
   nicht gezählt wurde.

   Gemessen, nicht übernommen: die Deckelung liegt NICHT pauschal bei zwei
   Requests. Antwortet die Datenbank mit realistischer Verzögerung, bleibt es bei
   genau einem Versuch pro Bereich (R1). Antwortet sie in derselben Mikrotask
   (Attrappe ohne Verzögerung), gewinnt die Freigabe von `autoFetched` das Rennen
   gegen Reacts Re-Render und der Programm-Bereich wird ein ZWEITES Mal geholt
   (R2) — dann ist aber Schluss, weil `programm` null bleibt und keine Abhängigkeit
   des Autoload-Effekts sich mehr ändert. Beide Fälle werden gefahren; der
   verbindliche Befund ist die Konstanz über das Ruhefenster. */
{
  netzReset();
  netz.fehlend.add("programm_demo");       // dauerhaft scheiterndes Nachladen
  netz.fehlend.add("streaming_bekannt_demo");
  netz.verzoegerung.set("programm_demo", 120);   // realistische Antwortzeit
  netz.verzoegerung.set("streaming_bekannt_demo", 120);
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:auth:session", sitzungsTopf());
  });
  await warte(2600);
  check("R1/P6-Vorbedingung: der Live-Start ist durch", zaehle("programm") === 1 && zaehle("streaming_bekannt") === 1);

  dom.window.localStorage.removeItem("kd:auth:session");
  sichtbarWerden(dom);
  await warte(2000);
  check("R1/P6: bei antwortender Datenbank bleibt es bei genau einem Versuch je Bereich",
    zaehle("programm_demo") === 1 && zaehle("streaming_bekannt_demo") === 1);
  const r1Alle = katalogRufe.length;
  await warte(3000);                       // Ruhefenster
  check("R1/P6: über ein Ruhefenster von 3 s kommt kein einziger Request dazu",
    katalogRufe.length === r1Alle && zaehle("programm_demo") === 1 && zaehle("streaming_bekannt_demo") === 1);
  dom.window.close();
  netzReset();
}
{
  netzReset();
  netz.fehlend.add("programm_demo");
  netz.fehlend.add("streaming_bekannt_demo"); // ohne Verzögerung: Worst Case fürs Wettrennen
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:auth:session", sitzungsTopf());
  });
  await warte(2600);
  check("R2/P6-Vorbedingung: der Live-Start ist durch", zaehle("programm") === 1 && zaehle("streaming_bekannt") === 1);

  dom.window.localStorage.removeItem("kd:auth:session");
  sichtbarWerden(dom);
  await warte(2000);
  const r2Programm = zaehle("programm_demo");
  const r2Streaming = zaehle("streaming_bekannt_demo");
  check("R2/P6: auch bei sofortiger Absage bleibt es bei höchstens zwei Versuchen je Bereich",
    r2Programm >= 1 && r2Programm <= 2 && r2Streaming >= 1 && r2Streaming <= 2);
  const r2Alle = katalogRufe.length;
  await warte(3000);                       // Ruhefenster
  check("R2/P6: danach ist Ruhe — über 3 s kommt kein weiterer Request dazu",
    katalogRufe.length === r2Alle
    && zaehle("programm_demo") === r2Programm && zaehle("streaming_bekannt_demo") === r2Streaming);
  dom.window.close();
  netzReset();
}

/* ============ S — C1: ein gescheiterter Versuch nimmt den weiterhin ANGEZEIGTEN
   Daten ihre Etiketten nicht weg (Programm) ==================================
   Invariante: solange Programmdaten auf dem Schirm stehen, beschreibt
   `programmInfo` genau diese Daten. Der Fehlerzweig von ladeProgrammDatei räumt
   `programm`, `programmArt` und `progStand` bewusst NICHT weg — dann darf er
   auch ihre Beschreibung nicht durch ein reines Fehlerobjekt ersetzen. Sonst
   verlöre ein weiter sichtbarer, abgelaufener Demo-Stand nach einem
   misslungenen „Katalog jetzt neu laden" seine Warnfarbe und stünde als
   gültiges Programm da: „· Demo-Schnappschuss" und „· abgelaufen" kommen beide
   allein aus programmInfo. Gemessen wird deshalb NACH dem Fehlversuch, ob Stand
   UND Etiketten noch beisammen sind. */
{
  netzReset();
  katalogRufe = [];
  katalogGueltigBis = new Date(Date.now() - 2 * 86400000).toISOString();   // abgelaufener Schnappschuss
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { text, knopf } = hilfen(dom);
  await warte(2600);
  knopf(/^Kino$/i)?.click(); await warte(500);
  check("S/C1-Vorbedingung: der Gast sieht einen abgelaufenen Demo-Stand mit beiden Etiketten",
    standMuster(KATALOG_STAND).test(text()) && /· Demo-Schnappschuss/.test(text()) && /· abgelaufen/.test(text()));

  netz.fehlend.add("programm_demo");     // der nächste Versuch geht ins Leere
  netz.fehlend.add("streaming_bekannt_demo");
  knopf(/^Settings$/i)?.click(); await warte(400);
  (knopf(/^Katalog jetzt neu laden$/) || knopf(/^Katalog neu laden$/))?.click(); await warte(1400);
  check("S/C1-Vorbedingung: der Nachladeversuch ist wirklich gelaufen und gescheitert",
    zaehle("programm_demo") >= 2 && /noch keine Beispieldaten veröffentlicht/.test(text()));

  knopf(/^Kino$/i)?.click(); await warte(500);
  check("S/C1: der gescheiterte Versuch lässt die bisherigen Daten stehen (Stand weiterhin sichtbar)",
    standMuster(KATALOG_STAND).test(text()));
  check("S/C1: … und nimmt ihnen ihre Etiketten nicht weg (Demo-Schnappschuss UND abgelaufen)",
    /· Demo-Schnappschuss/.test(text()) && /· abgelaufen/.test(text()));
  dom.window.close();
  katalogGueltigBis = KATALOG_GUELTIG_BIS;
  netzReset();
}

/* ============ T — dieselbe Invariante für den Streamingkatalog ==============
   `streamingBekannt`/`streamingEntdecken` bleiben im Fehlerzweig ebenfalls
   stehen. Verschwände dabei `streamingInfo`, verschwänden mit ihm die
   Hinweisbänder „Abgelaufener Schnappschuss" und „Aus dem Browser-Speicher" —
   während genau diese Daten weiter angezeigt werden. */
{
  netzReset();
  katalogRufe = [];
  katalogGueltigBis = new Date(Date.now() - 2 * 86400000).toISOString();
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { text, knopf } = hilfen(dom);
  await warte(2600);
  knopf(/^Streaming$/i)?.click(); await warte(900);
  check("T/C1-Vorbedingung: der Streaming-Tab weist den abgelaufenen Schnappschuss aus",
    /Abgelaufener Schnappschuss/.test(text()));

  netz.fehlend.add("streaming_bekannt_demo");
  netz.fehlend.add("programm_demo");
  knopf(/^Settings$/i)?.click(); await warte(400);
  (knopf(/^Katalog jetzt neu laden$/) || knopf(/^Katalog neu laden$/))?.click(); await warte(1400);
  check("T/C1-Vorbedingung: der Streaming-Nachladeversuch ist gelaufen und gescheitert",
    zaehle("streaming_bekannt_demo") >= 2);

  knopf(/^Streaming$/i)?.click(); await warte(900);
  check("T/C1: die Katalogdaten bleiben sichtbar (der Tab ist nicht leer)",
    !/Streaming-Tab leer/.test(text()));
  check("T/C1: … und ihr Ablauf-Hinweis überlebt den gescheiterten Versuch",
    /Abgelaufener Schnappschuss/.test(text()));
  dom.window.close();
  katalogGueltigBis = KATALOG_GUELTIG_BIS;
  netzReset();
}

/* ============ U — der manuelle Import trägt sein EIGENES Etikett ============
   Der Notfallweg (Einstellungen → Erweitert) spielt Daten aus der Hand des
   Nutzers ein. Sie stammen nicht aus dem Katalog: kein Ablaufurteil, keine
   Betriebsart — und vor allem kein geerbter Fehler des vorherigen Versuchs.
   Ohne eigenes Etikett behielte der Import die Beschreibung des gescheiterten
   Laufs; der Einstellungen-Tab meldete für frisch eingespielte Daten weiter
   „noch keine Beispieldaten veröffentlicht".
   Gelesen wird gezielt das Status-Element des Einstellungen-Tabs, NICHT das
   ganze #root: die Fehlermeldung des alten Versuchs steht als Bandtext noch
   im Dokument, ein Regex über alles träfe sie und bewiese nichts. */
{
  netzReset();
  accessRole = "owner";
  netz.fehlend.add("programm");     // der Owner-Boot-Versuch scheitert
  netz.fehlend.add("streaming_bekannt");
  katalogRufe = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:auth:session", sitzungsTopf());
  });
  const { doc, text, knopf } = hilfen(dom);
  const status = () => programmStatusText(doc);
  await warte(2600);
  knopf(/^Settings$/i)?.click(); await warte(500);
  check("U-Vorbedingung: der Einstellungen-Tab meldet den gescheiterten Owner-Versuch",
    status() === "nicht geladen");

  const feld = [...doc.querySelectorAll("textarea")].find((t) => /Programm-JSON einfügen/.test(t.placeholder || ""));
  check("U-Vorbedingung: der Notfallweg „Programm manuell importieren“ ist erreichbar", !!feld);
  if (feld) {
    setWert(dom, feld, JSON.stringify({
      erstellt: KATALOG_STAND,
      data: { filme: [{ titel: "Handimport-Testfilm", jahr: 2024, vorstellungen: [] }] },
    }));
    knopf(/^Programm-Snapshot importieren$/)?.click(); await warte(800);
  }
  check("U: der Import ist angekommen (die App springt in den Kino-Tab und zeigt einen Stand)",
    /Stand \d/.test(text()));
  check("U: er erbt weder Betriebsart noch Ablaufurteil noch Cache-Vermerk",
    !/· Demo-Schnappschuss/.test(text()) && !/· abgelaufen/.test(text())
    && !/· aus dem Browser-Speicher/.test(text()));
  knopf(/^Settings$/i)?.click(); await warte(500);
  const programmStatus = [...doc.querySelectorAll("summary")]
    .find((summary) => /^Kinoprogramm-Status$/.test((summary.textContent || "").trim()))?.parentElement;
  check("U: der Owner-Status meldet dafür nicht den alten Katalogstand, sondern den Import",
    /BetriebsartManuellerNotfallimport/.test((programmStatus?.textContent || "").replace(/\s+/g, ""))
      && /Speichermanuelleingespielt/.test((programmStatus?.textContent || "").replace(/\s+/g, "")));
  dom.window.close();
  accessRole = "member";
  netzReset();
}

/* ============ V — P3 für den STREAMING-Pfad ================================
   Dieselbe Frage wie in P/Q, nur für den Katalog: eine langsame Live-Antwort,
   die nach dem Abmelden eintrifft, gehört zu einer Zeile, die die App gar nicht
   mehr lesen darf. Ohne Generationsprüfung im Erfolgszweig von
   ladeStreamingDateien ersetzte sie den gerade korrekt geladenen Demo-Katalog.
   Unterscheidbar sind die beiden Zeilen am `demo`-Merker der Payload: nur der
   Demo-Katalog zeigt das Band „Demo-Beispieldaten", die Live-Zeile trägt
   demo: false. */
{
  netzReset();
  netz.verzoegerung.set("streaming_bekannt", 2600);
  katalogRufe = [];
  const dom = baueDom((w) => seedKatalog(w, "clean"));
  const { text, knopf } = hilfen(dom);
  await warte(2600);
  knopf(/^Streaming$/i)?.click(); await warte(900);
  check("V/P3-Vorbedingung: der Gast sieht den Demo-Streamingkatalog",
    /Demo-Beispieldaten/.test(text()));

  dom.window.localStorage.setItem("kd:auth:session", sitzungsTopf());
  sichtbarWerden(dom);
  await warte(800);
  check("V/P3-Vorbedingung: der langsame Live-Read des Katalogs ist unterwegs",
    zaehle("streaming_bekannt") === 1);

  dom.window.localStorage.removeItem("kd:auth:session");
  sichtbarWerden(dom);
  await warte(1400);                     // der schnelle Demo-Read gewinnt
  check("V/P3-Vorbedingung: der Demo-Katalog der neuen Betriebsart steht wieder",
    /Demo-Beispieldaten/.test(text()));

  await warte(2800);                     // jetzt trifft die späte Live-Antwort ein
  check("V/P3: die späte Live-Antwort des Katalogs verdrängt den Demo-Katalog nicht",
    /Demo-Beispieldaten/.test(text()));
  dom.window.close();
  netzReset();
}

/* ============ W — N1: die Diagnose des JÜNGSTEN Versuchs gilt ===============
   `anmeldungNoetig` darf im Ergänzen-Zweig NICHT mit dem alten Wert verodert
   werden. Sonst klebt das Flag: stand einmal „Anmeldung nötig" (hier auf dem
   produktiven Weg — abgewiesener JWT, anon-Rückfall sieht die Live-Zeile leer,
   der Cache springt ein), meldete der Einstellungen-Tab auch nach einem
   späteren 503 weiter „Anmeldung nötig" — und ein erneutes Anmelden heilte es
   nicht, weil kein Zustand das Flag je zurücknahm.
   Gemessen wird am Status-Element des Einstellungen-Tabs, nicht am ganzen DOM. */
{
  netzReset();
  katalogRufe = [];
  accessRole = "owner";
  const cacheInhalt = new Map();
  const cacheLoeschungen = [];
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    seedCacheStorage(w, cacheInhalt, cacheLoeschungen);
    w.localStorage.setItem("kd:auth:session", sitzungsTopf());   // angemeldet: Live-Zeile
  });
  const { doc, knopf } = hilfen(dom);
  const status = () => programmStatusText(doc);
  await warte(2600);
  check("W/N1-Vorbedingung: der Live-Stand ist geladen und im Cache-Storage abgelegt",
    cacheInhalt.has(cacheSchluessel("programm")));

  /* Der JWT wird abgewiesen; der anon-Rückfall sieht die Live-Zeile leer.
     Genau daraus entsteht „Anmeldung nötig" — und der Cache trägt die Anzeige. */
  netz.tokenAbgelehnt.add("programm");
  await katalogNeuLaden(doc, knopf);
  check("W/N1-Vorbedingung: der Einstellungen-Tab meldet jetzt „Anmeldung nötig“",
    status() === "Anmeldung nötig");

  /* Zweiter Versuch, andere Ursache: schlichter 503, kein Cache mehr. */
  netz.tokenAbgelehnt.delete("programm");
  netz.serverFehler.add("programm");
  cacheInhalt.clear();
  await katalogNeuLaden(doc, knopf);
  check("W/N1: nach einem 503 meldet der Einstellungen-Tab nicht länger „Anmeldung nötig“",
    status() === "nicht geladen");
  dom.window.close();
  accessRole = "member";
  netzReset();
}

/* ============ X — N2: der Code des jüngsten Versuchs gilt ==================
   `code` darf nicht mit `code || vorher.code` hinterfangen werden. Ein
   Folgefehler OHNE eigenen Code (hier: die Zeile besteht die Strukturprüfung
   und platzt erst in normalisiereProgramm) konservierte sonst den alten Code —
   der Einstellungen-Tab bliebe bei „Zugangsschlüssel wird abgelehnt", während
   der Schlüssel längst wieder akzeptiert wird und die Ursache eine ganz andere
   ist. */
{
  netzReset();
  katalogRufe = [];
  accessRole = "owner";
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:auth:session", sitzungsTopf());
  });
  const { doc, knopf } = hilfen(dom);
  const status = () => programmStatusText(doc);
  await warte(2600);
  knopf(/^Settings$/i)?.click(); await warte(500);
  check("X/N2-Vorbedingung: zunächst steht ein sauber geladener Owner-Stand",
    status() === "aktuell geladen");

  /* Erster Fehlversuch: der apikey wird durchgehend abgewiesen (auch im
     anon-Rückfall) — das ist INVALID_KEY, nicht „melde dich an". */
  netz.schluesselAbgelehnt.add("programm");
  await katalogNeuLaden(doc, knopf);
  check("X/N2-Vorbedingung: der Einstellungen-Tab meldet den abgelehnten Schlüssel",
    status() === "Zugangsschlüssel wird abgelehnt");

  /* Zweiter Fehlversuch, ganz andere Ursache und ohne eigenen Fehlercode. */
  netz.schluesselAbgelehnt.delete("programm");
  netz.kaputtePayload.add("programm");
  await katalogNeuLaden(doc, knopf);
  check("X/N2: ein Folgefehler ohne eigenen Code konserviert den alten Code nicht",
    status() === "nicht geladen");
  dom.window.close();
  accessRole = "member";
  netzReset();
}

/* ============ Y — N3: der Ablauf wird beim Ergänzen NEU bewertet ============
   Ein Stand kann zwischen seiner Ladung und dem nächsten Fehlversuch ablaufen.
   Wird `abgelaufen` im Ergänzen-Zweig bloß durchgereicht, führt die App ihn
   weiter als gültig — ausgerechnet in dem Moment, in dem sie ohnehin nichts
   Frisches mehr bekommt. Hier laufen beide Zwillinge in einem Durchgang:
   Programm („· abgelaufen" am Stand-Etikett) und Streaming („Abgelaufener
   Schnappschuss"-Band). Die Gültigkeit ist bewusst knapp bemessen — bei der
   Ladung noch gültig, beim Fehlversuch abgelaufen. */
{
  netzReset();
  katalogRufe = [];
  accessRole = "owner";
  katalogGueltigBis = new Date(Date.now() + 4000).toISOString();
  const dom = baueDom((w) => {
    seedKatalog(w, "clean");
    w.localStorage.setItem("kd:auth:session", sitzungsTopf());
  });
  const { text, knopf } = hilfen(dom);
  await warte(2600);
  knopf(/^Kino$/i)?.click(); await warte(400);
  check("Y/N3-Vorbedingung: der frisch geladene Stand gilt noch und trägt KEIN Ablaufurteil",
    standMuster(KATALOG_STAND_LIVE).test(text()) && !/· abgelaufen/.test(text()));
  knopf(/^Streaming$/i)?.click(); await warte(900);
  check("Y/N3-Vorbedingung: auch der Streamingkatalog gilt noch",
    !/Abgelaufener Schnappschuss/.test(text()));

  await warte(2200);                     // die Gültigkeit läuft ab
  netz.fehlend.add("programm");          // und der nächste Owner-Versuch scheitert
  netz.fehlend.add("streaming_bekannt");
  knopf(/^Settings$/i)?.click(); await warte(400);
  (knopf(/^Katalog jetzt neu laden$/) || knopf(/^Katalog neu laden$/))?.click(); await warte(1400);
  check("Y/N3-Vorbedingung: beide Nachladeversuche sind gelaufen und gescheitert",
    zaehle("programm") >= 2 && zaehle("streaming_bekannt") >= 2);

  knopf(/^Kino$/i)?.click(); await warte(500);
  check("Y/N3 (Programm): der inzwischen abgelaufene Stand wird beim Ergänzen als abgelaufen erkannt",
    standMuster(KATALOG_STAND_LIVE).test(text()) && /· abgelaufen/.test(text()));
  knopf(/^Streaming$/i)?.click(); await warte(900);
  check("Y/N3 (Streaming-Zwilling): ebenso im Streamingkatalog",
    /Abgelaufener Schnappschuss/.test(text()));
  dom.window.close();
  accessRole = "member";
  katalogGueltigBis = KATALOG_GUELTIG_BIS;
  netzReset();
}

const fehler = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - fehler.length}/${checks.length} Checks bestanden.`);
process.exit(fehler.length ? 1 : 0);

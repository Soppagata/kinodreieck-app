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
  /* Etappe 4: Git ist konfiguriert -> die Vertrauens-Zeile im Start-Dashboard
     zeigt den Sync-Status (Nachfolger des Griff-Punkts; ableiten() liefert
     konfiguriert immer einen der vier Zustände). */
  check("B: Vertrauens-Zeile zeigt Sync-Status (synchron/ausstehend/nicht aktuell/Konflikt)",
    !!doc.querySelector(".kd-vertrauen") && /(synchron|ausstehend \d|nicht aktuell|Konflikt)/.test(text()));
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

/* ---------- E: Credits-Reset-Anzeige koppelt an den konfigurierten Reset-Tag ---------- */
{
  const dom = baueDom({
    seed(w) {
      w.localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["Netflix", "Crunchyroll Premium (Via Amazon Prime)", "Spezialkanal 9000"], heuristik: true, reset_tag: 11 }));
    },
  });
  const { doc, text, knopf } = helpers(dom);
  await warte(2500);
  const daten = knopf(/^einstellungen$/i);
  if (daten) { daten.click(); await warte(600); }
  check("E: Credits-Reset-Datum wird angezeigt (aus reset_tag)", /Credits-Reset:\s*11\./.test(text().replace(/ /g, " ")) || /Credits-Reset: \d{2}\.\d{2}\.\d{4}/.test(text()));
  check("E: falscher 30-Tage-Countdown ist weg", !/Tage bis zum Monats-Refresh/.test(text()));
  check("E: Reset-Tag-Eingabefeld vorhanden", /Credits-Reset-Tag \(1–28\)/.test(text()));
  /* Neue Quellen-UI (Etappe 1): Angehakte immer sichtbar, Rest NUR als
     Suchtreffer. Der alte Check "Hayu sichtbar" (Gruppen-Layout) zieht um:
     Hayu ist nicht angehakt -> erst die Suche beweist die echte AT-Liste. */
  check("E: Angehakt-Liste zeigt gewählte Quellen ohne Suche", /Crunchyroll Premium \(Via Amazon Prime\)/.test(text()) && /Netflix/.test(text()));
  check("E: gewählte Quelle außerhalb der Liste bleibt sichtbar (Union)", /Spezialkanal 9000/.test(text()));
  check("E: nicht angehakte Quelle ist ohne Suche unsichtbar", !/Hayu/.test(text()));
  const sucheInput = [...doc.querySelectorAll("input")].find((i) => (i.placeholder || "").startsWith("Quelle suchen"));
  check("E: Quellen-Suchfeld vorhanden", !!sucheInput);
  if (sucheInput) {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
    setter.call(sucheInput, "hayu");
    sucheInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await warte(300);
    check("E: Suchfeld findet nicht angehakte Quelle (Hayu, echte AT-Startliste statt Demo)", /Hayu/.test(text()));
  }
  check("E: Demo-Daten sind als solche gekennzeichnet", /Demo-Beispieldaten/.test(text()));
  /* Etappe 2: Einstellungs-Blöcke als Accordions — Streaming-Quellen startet offen. */
  check("E: Accordion-Köpfe (kd-klappe) da, Streaming-Quellen startet offen",
    [...doc.querySelectorAll("details.kd-klappe")].some((d) => d.open && /Streaming-Quellen/.test((d.querySelector("summary") || {}).textContent || "")));
  dom.window.close();
}

/* ---------- F: Joyn-Fix — Badges taggen nur Dienste der Abo-Auswahl ---------- */
{
  /* Master enthält zwei Titel aus dem Demo-Streaming-Snapshot:
     "Regenbogen über Kreuzberg" (nur Netflix — angehakt) und
     "Der stille Zeuge" (nur Prime Video — NICHT angehakt).
     Erwartung in der Mediathek: Netflix-Badge ja, Prime-Video-Badge nein. */
  const dom = baueDom({
    seed(w) {
      w.localStorage.setItem("kd:streaming-dienste", JSON.stringify({ quellen: ["Netflix"], heuristik: true }));
      w.localStorage.setItem("kd:master", JSON.stringify({
        meta: null,
        filme: [
          { id: "regenbogen_ueber_kreuzberg_2016", titel: "Regenbogen über Kreuzberg", jahr: 2016, typ: "film", quelle: "dvd", kategorie: "sehenswert", bewertung: { wie: 4, was: 4, warum: 4 } },
          { id: "der_stille_zeuge_2008", titel: "Der stille Zeuge", jahr: 2008, typ: "film", quelle: "dvd", kategorie: "sehenswert", bewertung: { wie: 3, was: 3, warum: 3 } },
        ],
        herkunft: { typ: "storage" }, gespeichertAm: 1,
      }));
    },
  });
  const { text, knopf } = helpers(dom);
  await warte(2500);
  const mediathek = knopf(/^mediathek$/i);
  if (mediathek) { mediathek.click(); await warte(600); }
  check("F: beide Titel in der Mediathek gerendert", /Regenbogen über Kreuzberg/i.test(text()) && /Der stille Zeuge/i.test(text()));
  check("F: angehakter Dienst taggt weiter (Netflix-Badge)", /Netflix/.test(text()));
  check("F: abgewählter Dienst taggt NICHT mehr (kein Prime-Video-Badge)", !/Prime Video/.test(text()));
  dom.window.close();
}

/* ---------- G: Drawer-Redesign (Etappe 3) — Menü-Reihenfolge + Linkshänder ---------- */
{
  const dom = baueDom({
    seed(w) {
      w.localStorage.setItem("kd:einstellungen", JSON.stringify({ theme: "dunkel", startTab: "start", schrift: "normal", modus: "", linkshaender: true }));
      /* Etappe 4: Pin mit ROHER ISO-Zeit (fremd/alt geseedet) — das Pinboard-
         Modul muss ihn über formatiereTermin lesbar machen (Mo 20.7. 21:30). */
      w.localStorage.setItem("kd:kino-pins", JSON.stringify([{ t: "ISO-Pin-Test", j: null, z: "2026-07-20T21:30:00+02:00", seit: 1 }]));
    },
  });
  const { doc, text, knopf } = helpers(dom);
  await warte(2500);
  /* DOM-Reihenfolge = bottom-up-Wichtigkeit; column-reverse stellt Kino nach unten. */
  const labels = [...doc.querySelectorAll(".kd-menu button")].map((b) => (b.textContent || "").trim());
  check("G: Menü-DOM-Reihenfolge bottom-up (Kino zuerst im DOM)",
    labels.join("|") === "Kino|Streaming|Mediathek|Suche|Blog|Start|Einstellungen");
  check("G: Griff mit drei Strichen im DOM (kd-navband + i)", doc.querySelectorAll(".kd-navband i").length === 3);
  /* Etappe 4: der Übergangs-Sync-Punkt am Griff ist ENTFERNT — die Vertrauens-
     Zeile im Start-Dashboard ist jetzt der einzige Sync-Ort (Sync-Anzeige
     selbst: Block B, mit konfiguriertem Git). */
  check("G: Sync-Punkt am Griff entfernt (Vertrauens-Zeile übernimmt)", !doc.querySelector(".kd-navband-dot"));
  check("G: Vertrauens-Zeile im Start-Dashboard vorhanden (kd-vertrauen)", !!doc.querySelector(".kd-vertrauen"));
  /* Sync-Semantik: OHNE Git-Konfiguration zeigt die Vertrauens-Zeile bewusst
     KEIN Sync-Segment (kein „nicht verbunden"-Rauschen) — Gegenprobe mit
     konfiguriertem Git: Block B. */
  check("G: ohne Git-Konfiguration KEIN Sync-Segment in der Vertrauens-Zeile",
    !/(synchron|ausstehend \d|nicht aktuell|Konflikt|nicht verbunden)/.test((doc.querySelector(".kd-vertrauen") || {}).textContent || ""));
  /* Pinboard-Modul: ISO-Pin formatiert wie das Kino-für-dich-Modul (gemeinsamer
     Helper formatiereTermin), roher ISO-String taucht nicht auf. */
  check("G: Pinboard-Modul formatiert ISO-Pin-Termin (Mo 20.7. 21:30)",
    /Pinboard/.test(text()) && /ISO-Pin-Test/.test(text()) && /Mo 20\.7\. 21:30/.test(text()) && !/2026-07-20T21:30/.test(text()));
  check("G: Linkshänder-Einstellung setzt kd-links am Wrapper", !!doc.querySelector(".kd-wrap.kd-links"));
  const daten = knopf(/^einstellungen$/i);
  if (daten) { daten.click(); await warte(600); }
  check("G: Bedienhand-Umschalter (Rechts/Links) in Darstellung & Verhalten", /Bedienhand/.test(text()));
  /* Roundtrip: eine ANDERE Einstellung speichern darf linkshaender (und die
     Bestandsfelder) nicht verlieren. */
  const gross = knopf(/^Groß$/);
  if (gross) { gross.click(); await warte(300); }
  let gespeichert = {};
  try { gespeichert = JSON.parse(dom.window.localStorage.getItem("kd:einstellungen") || "{}"); } catch { /* */ }
  check("G: linkshaender übersteht Laden + Speichern (Roundtrip, Bestandsfelder intakt)",
    gespeichert.linkshaender === true && gespeichert.schrift === "gross"
    && gespeichert.theme === "dunkel" && gespeichert.startTab === "start" && gespeichert.modus === "");
  dom.window.close();
}

/* ---------- D: Struktur-Kanarien in der gebauten Datei (Scrim-Bug + Fonts) ---------- */
{
  check("D: kein Inline-zIndex:40 mehr im Bundle (Scrim-Bug-Ursache)", !/zIndex:\s*40/.test(html));
  check("D: Mobil-CSS führt Panel über dem Scrim (60 > 58)", html.includes("z-index:60") && html.includes("z-index:58"));
  check("D: Single-File trägt eingebettete Fonts (data:font)", html.includes("data:font"));
  /* Etappe 3: Griff-Ebene + Blur-Scrim (mit -webkit-Präfix) müssen im Bundle-CSS stehen. */
  check("D: Griff-Ebene 62 im Bundle-CSS (Scrim 58 < Panel 60 < Griff 62)", html.includes("z-index:62"));
  check("D: Scrim-Blur im Bundle-CSS (blur(14px) inkl. -webkit-backdrop-filter)",
    /backdrop-filter:\s*blur\(14px\)/.test(html) && /-webkit-backdrop-filter/.test(html));
  check("D: Blur-Fallback (@supports not …) mit Dim 50% im Bundle-CSS",
    /@supports not/.test(html) && /#00000080|rgba\(0,\s*0,\s*0,\s*0?\.5\)/.test(html));
}

const fails = checks.filter(([, p]) => !p);
console.log(`\n${checks.length - fails.length}/${checks.length} Checks bestanden.`);
console.log(fails.length ? "PERSONAL-MODUS-TEST: BEFUNDE OBEN" : "PERSONAL-MODUS-TEST BESTANDEN");
process.exit(fails.length ? 1 : 0);

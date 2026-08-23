import {
  EXTERNER_STAPEL_WORKFLOW_DATEINAME, EXTERNER_STAPEL_WORKFLOW_VERSION, STAPEL_MAX_ZEILEN,
  baueStapelPayload, baueStapelUebernahme, externerStapelPrompt,
  normalisiereStapelAntwort, vorbereiteTitelliste,
} from "./src/lib/stapelimport.js";

let ok = 0;
function check(name, wert) { if (!wert) throw new Error("Fehlgeschlagen: " + name); ok++; console.log("✓ " + name); }

check("Textgrenze hält einen KI-Durchgang überschaubar", STAPEL_MAX_ZEILEN === 60);
check("Titelliste entfernt Nummerierung, Leerzeilen und exakte Dubletten", JSON.stringify(vorbereiteTitelliste("1. Alien\n\nAlien\n- The Expanse")) === JSON.stringify(["Alien", "The Expanse"]));
const kurzbewertungen = ["Alien", "Blade Runner", "Heat", "Arrival", "Stalker"].map((titel, i) => ({ titel, wie: 4, was: i % 5, warum: 3 }));
const payload = baueStapelPayload("Alien\nBlade Runner\nHeat\nArrival\nStalker", "bluray", true, kurzbewertungen);
check("Vorbeurteilungs-Payload enthält fünf echte Kurzbewertungen", payload.vorbeurteilen && payload.bewertungen.length === 5 && payload.standardQuelle === "bluray");
let zuWenig = false;
try { baueStapelPayload("Alien\nBlade Runner", "dvd", true, kurzbewertungen.slice(0, 2)); } catch { zuWenig = true; }
check("Vorbeurteilung startet nicht mit weniger als fünf Bewertungen", zuWenig);

const antwort = { data: { kandidaten: [
  { titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null, vorbeurteilung: "passt", begruendung: "Düstere Science-Fiction passt zum Profil.", sicherheit: "hoch" },
  { titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null, vorbeurteilung: "offen", begruendung: "doppelt", sicherheit: "mittel" },
  { titel: "The Expanse", typ: "serie", jahr: 2015, quelle: "amazon", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "mittel" },
  { titel: "Kind of Blue", typ: "musik", jahr: 1959, quelle: "cd", staffeln: null, vorbeurteilung: "passt", begruendung: "Die Kurzbewertungen zeigen eine Nähe zu konzentrierten Klassikern.", sicherheit: "mittel" },
  { titel: "Blue Train", typ: "musik", jahr: 1957, quelle: "cd", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch" },
], warnungen: ["Eine Staffel war nicht lesbar."] } };
const v = normalisiereStapelAntwort(antwort, [{ titel: "Alien", jahr: 1979 }]);
check("Dubletten im KI-Ergebnis werden zusammengefuehrt", v.kandidaten.length === 4);
check("Film, Serie und Musik werden als Mediathek-Kandidaten normalisiert", v.kandidaten.every((k) => ["film", "serie", "musik"].includes(k.typ)));
check("CD bleibt als eigene physische Quelle erhalten", v.kandidaten.find((k) => k.titel === "Kind of Blue")?.quelle === "cd");
check("Vorhandene Mediathektitel werden erkannt", v.kandidaten[0].vorhandenMediathek === true);
check("Unklare Serienstaffeln bleiben freiwillig ergänzbar", v.kandidaten[1].staffeln === null);

const teilantwort = normalisiereStapelAntwort({
  responseMode: "partial",
  displayText: "wird nicht ungeprüft angezeigt",
  data: {
    kandidaten: [
      { eingabeIndex: 0, titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch", zusatz: true },
      { eingabeIndex: 1, titel: "", typ: "film", jahr: null, quelle: "dvd", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "niedrig" },
      { eingabeIndex: 2, titel: "Kind of Blue", typ: "musik", jahr: 1959, quelle: "cd", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch" },
    ],
    warnungen: [],
  },
}, [], { indexMap: [0, 1, 2] });
check("Teilantwort behält zwei sichere Medien und weist das kaputte Item separat aus",
  teilantwort.kandidaten.length === 2 && teilantwort.fehlmenge.length === 1
  && teilantwort.fehlmenge[0].id === "stapel-1" && teilantwort.fehlmenge[0].zustand === "fehlgeschlagen");
check("Teilantwort verwendet ausschließlich den festen sicheren Anzeigehinweis",
  teilantwort.displayText === "Die Medienliste war teilweise unvollständig. Nur sichere Einträge werden angezeigt; offene Zeilen bleiben separat erhalten.");
teilantwort.kandidaten[1].ausgewaehlt = false;
check("Nur ausdrücklich ausgewählte sichere Vorschauitems erreichen die Übernahme",
  baueStapelUebernahme(teilantwort.kandidaten).mediathek.map((eintrag) => eintrag.titel).join("|") === "Alien");

const degradiert = normalisiereStapelAntwort({
  responseMode: "degraded",
  displayText: "Beliebiger Anbietertext",
  warnings: ["unstructured-provider-text"],
  data: null,
}, [], { indexMap: [0, 1, 2] });
check("Degraded bleibt ein fester Hinweis mit vollständiger offener Menge",
  degradiert.kandidaten.length === 0 && degradiert.fehlmenge.length === 3
  && degradiert.displayText === "Die KI-Antwort konnte nicht sicher in Medieneinträge umgewandelt werden.");
check("Degraded kann niemals einen Mediatheksimport erzeugen",
  baueStapelUebernahme(degradiert.kandidaten).mediathek.length === 0);

const uebernahme = baueStapelUebernahme(v.kandidaten);
check("Vorhandenes wird nicht nochmals in die Mediathek geschrieben", uebernahme.mediathek.length === 3);
check("Digitale Käufe bleiben von Streaming-Abos unterscheidbar", uebernahme.mediathek[0].quelle === "amazon");
check("Importierte Titel bleiben trotz KI-Voreindruck unbewertet", uebernahme.mediathek.every((e) => e.bewertung === null && e.kategorie === null));
const prompt = externerStapelPrompt("Max");
check("Externer Workflow ist eine versionierte Markdown-Datei", EXTERNER_STAPEL_WORKFLOW_DATEINAME === `kinodreieck-${EXTERNER_STAPEL_WORKFLOW_VERSION}.md` && prompt.startsWith("# Kinodreieck") && prompt.includes(`\`${EXTERNER_STAPEL_WORKFLOW_VERSION}\``) && prompt.endsWith("\n"));
check("Externer Workflow sammelt vor dem Abschluss stapelweise", /Foto N: X Titel erkannt/.test(prompt) && /SAMMLUNG ABSCHLIESSEN/.test(prompt) && /noch kein JSON und keine Gesamtliste/.test(prompt));
check("Externer Workflow bleibt auf verwertbare Medienfelder begrenzt", /film.*serie.*musik/.test(prompt) && /dvd.*bluray.*cd.*unklar/.test(prompt) && /Keine Bewertungen, Genres, Originaltitel/.test(prompt));
check("Externer Workflow erhält den bestehenden Importvertrag", /\"kandidaten\"/.test(prompt) && /\"vorbeurteilung\":\"offen\"/.test(prompt) && /\"begruendung\":\"\"/.test(prompt) && /höchstens 50 Kandidaten/.test(prompt));
check("Free-tauglicher Fotoweg nutzt drei lesbare Abschnitte mit Überlappung", /bis zu drei Fotos/.test(prompt) && /40–50 Rücken/.test(prompt) && /3–5 bereits fotografierte Rücken überlappen/.test(prompt));
check("Fotoweg belegt Bearbeitungsende und fordert fehlende Titel als Text an", /Abgedeckter Bereich/.test(prompt) && /Auswertung gestoppt nach/.test(prompt) && /offenen Stellen und mögliche Lücken/.test(prompt) && /zeilenweise als Text/.test(prompt));

console.log(`stapelimport_test: ${ok} Checks bestanden.`);

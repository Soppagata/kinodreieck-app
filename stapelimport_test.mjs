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

const uebernahme = baueStapelUebernahme(v.kandidaten);
check("Vorhandenes wird nicht nochmals in die Mediathek geschrieben", uebernahme.mediathek.length === 3);
check("Digitale Käufe bleiben von Streaming-Abos unterscheidbar", uebernahme.mediathek[0].quelle === "amazon");
check("Importierte Titel bleiben trotz KI-Voreindruck unbewertet", uebernahme.mediathek.every((e) => e.bewertung === null && e.kategorie === null));
const prompt = externerStapelPrompt("Max");
check("Externer Workflow ist eine versionierte Markdown-Datei", EXTERNER_STAPEL_WORKFLOW_DATEINAME === `kinodreieck-${EXTERNER_STAPEL_WORKFLOW_VERSION}.md` && prompt.startsWith("# Kinodreieck") && prompt.includes(`\`${EXTERNER_STAPEL_WORKFLOW_VERSION}\``) && prompt.endsWith("\n"));
check("Externer Workflow sammelt vor dem Abschluss stapelweise", /Stapel N erfasst/.test(prompt) && /SAMMLUNG ABSCHLIESSEN/.test(prompt) && /vorher keine Gesamtliste und kein JSON/.test(prompt));
check("Externer Workflow bleibt auf verwertbare Medienfelder begrenzt", /film.*serie.*musik/.test(prompt) && /dvd.*bluray.*cd.*unklar/.test(prompt) && /Keine Bewertungen, Genres, Originaltitel/.test(prompt));
check("Externer Workflow erhält den bestehenden Importvertrag", /\"kandidaten\"/.test(prompt) && /\"vorbeurteilung\":\"offen\"/.test(prompt) && /\"begruendung\":\"\"/.test(prompt) && /höchstens 50 Kandidaten/.test(prompt));

console.log(`stapelimport_test: ${ok} Checks bestanden.`);

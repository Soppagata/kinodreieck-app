import {
  STAPEL_MAX_BILDER, baueStapelUebernahme, externerStapelPrompt,
  normalisiereStapelAntwort, schaetzeBildTokens,
} from "./src/lib/stapelimport.js";

let ok = 0;
function check(name, wert) { if (!wert) throw new Error("Fehlgeschlagen: " + name); ok++; console.log("✓ " + name); }

check("Bildgrenze ist klein und kostenkontrolliert", STAPEL_MAX_BILDER === 4);
check("Bildtoken werden nach Pixelzahl geschaetzt", schaetzeBildTokens([{ width: 960, height: 720 }]) === Math.ceil(960 * 720 / 750));

const antwort = { data: { kandidaten: [
  { titel: "Alien", typ: "film", jahr: 1979, ereignisart: "poster", datum: null, uhrzeit: null, ort: null, hinweis: "Plakat", sicherheit: "hoch" },
  { titel: "Alien", typ: "film", jahr: 1979, ereignisart: "poster", datum: null, uhrzeit: null, ort: null, hinweis: "doppelt", sicherheit: "mittel" },
  { titel: "Live at Wembley", typ: "musik", jahr: null, ereignisart: "ticket", datum: "2026-09-03", uhrzeit: "20:00", ort: "Wien", hinweis: "Konzert", sicherheit: "mittel" },
], warnungen: ["Ein Jahr war nicht lesbar."] } };
const v = normalisiereStapelAntwort(antwort, [{ titel: "Alien", jahr: 1979 }], []);
check("Dubletten im KI-Ergebnis werden zusammengefuehrt", v.kandidaten.length === 2);
check("Poster und Ticket schlagen vorsichtig Must-Watch vor", v.kandidaten.every((k) => k.ziel === "mustwatch"));
check("Vorhandene Mediathektitel werden erkannt", v.kandidaten[0].vorhandenMediathek === true);

v.kandidaten[0].ziel = "mediathek";
v.kandidaten[1].ziel = "mustwatch";
const uebernahme = baueStapelUebernahme(v.kandidaten);
check("Vorhandenes wird nicht nochmals in die Mediathek geschrieben", uebernahme.mediathek.length === 0);
check("Termine landen nur als sichtbare Must-Watch-Notiz", uebernahme.mustwatch.length === 1 && uebernahme.mustwatch[0].beschreibung.includes("2026-09-03 20:00") && uebernahme.mustwatch[0].im_besitz === false);
const prompt = externerStapelPrompt("Max");
check("Externer Prompt verbietet Bewertungen und sensible Ticketdaten", /beweist keine Bewertung/.test(prompt) && /QR-\/Barcodes/.test(prompt) && /ausschließlich rohes JSON/.test(prompt));

console.log(`stapelimport_test: ${ok} Checks bestanden.`);

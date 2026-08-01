import {
  STAPEL_MAX_BILDER, baueStapelUebernahme, externerStapelPrompt,
  normalisiereStapelAntwort, schaetzeBildTokens,
} from "./src/lib/stapelimport.js";

let ok = 0;
function check(name, wert) { if (!wert) throw new Error("Fehlgeschlagen: " + name); ok++; console.log("✓ " + name); }

check("Bildgrenze ist klein und kostenkontrolliert", STAPEL_MAX_BILDER === 4);
check("Bildtoken werden nach Pixelzahl geschaetzt", schaetzeBildTokens([{ width: 960, height: 720 }]) === Math.ceil(960 * 720 / 750));

const antwort = { data: { kandidaten: [
  { titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null, vorbeurteilung: "passt", begruendung: "Düstere Science-Fiction passt zum Profil.", sicherheit: "hoch" },
  { titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null, vorbeurteilung: "offen", begruendung: "doppelt", sicherheit: "mittel" },
  { titel: "The Expanse", typ: "serie", jahr: 2015, quelle: "amazon", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "mittel" },
  { titel: "Blue Train", typ: "musik", jahr: 1957, quelle: "cd", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch" },
], warnungen: ["Eine Staffel war nicht lesbar."] } };
const v = normalisiereStapelAntwort(antwort, [{ titel: "Alien", jahr: 1979 }]);
check("Dubletten im KI-Ergebnis werden zusammengefuehrt", v.kandidaten.length === 2);
check("Nur Film und Serie werden als Mediathek-Kandidaten normalisiert", v.kandidaten.every((k) => ["film", "serie"].includes(k.typ)));
check("Andere Medientypen werden nicht stillschweigend zu Filmen", !v.kandidaten.some((k) => k.titel === "Blue Train"));
check("Vorhandene Mediathektitel werden erkannt", v.kandidaten[0].vorhandenMediathek === true);
check("Unklare Serienstaffeln bleiben freiwillig ergänzbar", v.kandidaten[1].staffeln === null);

const uebernahme = baueStapelUebernahme(v.kandidaten);
check("Vorhandenes wird nicht nochmals in die Mediathek geschrieben", uebernahme.mediathek.length === 1);
check("Digitale Käufe bleiben von Streaming-Abos unterscheidbar", uebernahme.mediathek[0].quelle === "amazon");
const prompt = externerStapelPrompt("Max");
check("Externer Prompt fragt Bewertungen ab und schließt Tickets sowie Musik aus", /5 bis 10/.test(prompt) && /Kinotickets/.test(prompt) && /Musik/.test(prompt) && /ausschließlich rohes JSON/.test(prompt));

console.log(`stapelimport_test: ${ok} Checks bestanden.`);

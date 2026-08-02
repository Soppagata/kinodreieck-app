const EINTRAEGE = Object.freeze([
  { woerter: ["schrift", "schriftgröße", "schriftgroesse", "größer", "groesser"], titel: "Schriftgröße ändern", text: "Öffne Settings → Darstellung & Verhalten → Schriftgröße.", ziel: "daten" },
  { woerter: ["theme", "hell", "dunkel", "erscheinung", "farbe"], titel: "Darstellung ändern", text: "Öffne Settings → Darstellung & Verhalten → Erscheinung.", ziel: "daten" },
  { woerter: ["konto", "anmelden", "abmelden", "passwort", "sync"], titel: "Konto verwalten", text: "Öffne Settings → Konto & Geräte-Sync.", ziel: "daten" },
  { woerter: ["backup", "sicherung", "wiederherstellen", "export"], titel: "Daten sichern", text: "Öffne Settings → Sichern & Wiederherstellen.", ziel: "daten" },
  { woerter: ["streamingdienst", "streamingdienste", "abo", "netflix", "prime"], titel: "Streamingdienste wählen", text: "Öffne Settings → Streaming-Quellen.", ziel: "daten" },
  { woerter: ["ki", "prognose", "filmwissen", "deutung"], titel: "KI-Funktionen einstellen", text: "Öffne Settings → KI-Funktionen. Prognosen selbst findest du am geöffneten unbewerteten Mediathek-Eintrag.", ziel: "daten" },
  { woerter: ["vokabular", "stimmung", "suchwort"], titel: "Eigenes Suchvokabular", text: "Öffne Settings → Suche & Vokabular.", ziel: "daten" },
  { woerter: ["startbereich", "startseite", "dashboard"], titel: "Startbereich wählen", text: "Öffne Settings → Darstellung & Verhalten → Startbereich.", ziel: "daten" },
  { woerter: ["import", "masterliste", "programmdatei"], titel: "Daten importieren", text: "Masterliste und Notfall-Importe findest du in Settings → Masterliste beziehungsweise Erweitert.", ziel: "daten" },
  { woerter: ["neuen eintrag", "eintrag erstellen", "eintrag anlegen", "hinzufügen", "hinzufuegen"], titel: "Neuen Eintrag erstellen", text: "Öffne die Mediathek und tippe auf „+ Eintrag hinzufügen“. Dort kannst du Film oder Serie samt Quelle erfassen; technische Filmkennungen brauchst du dafür nicht.", ziel: "mediathek" },
  { woerter: ["löschen", "loeschen", "eintrag entfernen"], titel: "Mediathek-Eintrag löschen", text: "Öffne den Eintrag in der Mediathek und wähle „Eintrag löschen“.", ziel: "mediathek" },
  { woerter: ["gesehen", "erledigt"], titel: "Gesehen markieren", text: "Im Bereich Streaming → Entdecken setzt das Häkchen den Gesehen-Status. Dabei kannst du den Titel auch in die Mediathek übernehmen.", ziel: "streaming" },
]);

const norm = (text) => String(text || "").toLocaleLowerCase("de-AT");

export function appHilfeAntwort(frage) {
  const text = norm(frage);
  const direkt = EINTRAEGE.find((eintrag) => eintrag.woerter.some((wort) => (
    wort.length <= 2 ? new RegExp(`(^|\\s)${wort}(?=\\s|$|[?.!,])`).test(text) : text.includes(wort)
  )));
  if (direkt) return direkt;
  if (/wo (finde|ist)|wie (kann|stelle|ändere|aendere)|setting|einstellung/.test(text)) {
    return {
      titel: "Funktion in Kinodreieck finden",
      text: "Die meisten App- und Kontoeinstellungen findest du im Bereich Settings. Such dort nach Darstellung, Konto, KI, Sicherung oder Quellen.",
      ziel: "daten",
    };
  }
  return null;
}

/* ---------- Tour-Engine (Tutorial Teil A, Phase 3) ----------
   Just-in-Time-Hinweise. Jeder Hinweis = ein Thema, ein bis drei Ziele
   (data-tour-Anker), ein Absatz pro Ziel. Mehrere in derselben Ansicht fällige
   Hinweise werden zu EINEM verschmolzen (max. 3 Löcher).

   Zwei Auslöser-Arten (siehe App.jsx):
   - Top-Anker: feuern beim Öffnen des Tabs / einer Aktion (Element ist oben,
     sofort sichtbar). Der Overlay misst OHNE zu scrollen.
   - Sichtbar-Anker (IntersectionObserver): feuern, sobald das Element im Blick
     ist — kein Scroll-Sprung, der Rahmen sitzt. Für tiefer liegende Bereiche
     (Pinboard, Vokabular, Streaming-Quellen, Erweitert).

   gesehen-Tracking über kd:tutorial.gesehen[] (lib/tutorial.js).
   Texte sind Starter-Formulierungen. Easter-Eggs werden NIRGENDS erwähnt. */

const DEF = {
  /* --- Kino --- */
  kino: {
    titel: "Kinoprogramm",
    absaetze: [{ ziel: "kino-filter", text: "Das Wiener Programm der nächsten ~2 Wochen. „Läuft & passt zu dir“ zeigt Filme aus deiner Liste, die gerade laufen. Der Filter grenzt nach Kino, Tag, Abo und Fassung ein — „Nur Abo“ zeigt, was in deinen Abo-Kinos ohne Aufpreis läuft." }],
  },

  /* --- Dashboard: Schwarzes Brett (erklärt das Anpinnen konzeptuell) --- */
  pinboard: {
    titel: "Schwarzes Brett",
    absaetze: [{ ziel: "pinboard", text: "Hier sammeln sich deine angepinnten Kinotermine und gemerkten Filme — damit du keine Vorstellung und keinen Titel mehr verpasst. Angepinnt wird im Kino mit dem ◇ vor der Uhrzeit, im Entdecken mit ★. Angepinntes übersteht den täglichen Programm-Wechsel." }],
  },

  /* --- Mediathek --- */
  mediathek: {
    titel: "Deine Mediathek",
    absaetze: [{ ziel: "eintrag-neu", text: "Dein Bestand: Filme, Serien, Musik, Sonstiges. Eine Karte antippen öffnet Details und Bewertung; der Filter grenzt nach Besitz, Schlagseite, Kategorie und Genre ein. Neu anlegen über „+ Eintrag hinzufügen“ — oder eine ganze Titelliste auf einmal über „Bestand per KI erfassen“." }],
  },
  eintrag: {
    titel: "Wie ein Eintrag aussieht",
    absaetze: [{ ziel: "eintrag-form", text: "Titel und Jahr sind Pflicht (das Jahr ist der Schlüssel für den Programm-Abgleich). Dann Typ, Quelle (wo der Titel liegt) und Genre — und das Dreieck: WIE für das Handwerk, WAS für den Gehalt und WARUM für die filmhistorische oder popkulturelle Relevanz, je 0 bis 5. Die Bewertung darfst du leer lassen und später nachtragen; die Kategorie folgt aus den Werten." }],
  },

  /* --- Streaming --- */
  streaming: {
    titel: "Streaming",
    absaetze: [{ ziel: "streaming-views", text: "„Mein Programm“ zeigt, welche deiner Filme gerade auf deinen Diensten laufen; „Entdecken“ liefert Vorschläge aus den Katalogen. Welche Dienste du hast, stellst du in den Einstellungen ein." }],
  },
  entdecken: {
    titel: "Entdecken",
    absaetze: [{ ziel: "entdecken-relevanz", text: "Vorschläge nach Relevanz sortiert — kein Live-API-Call, nur vorberechnete Kataloge. Mit ★ merkst du dir Titel; sie erscheinen im Dashboard." }],
  },

  /* --- Blog --- */
  blog: {
    titel: "Blog",
    absaetze: [{ ziel: "blog", text: "Eigene Artikel schreiben und Filme oder Personen aus deiner Mediathek referenzieren. Nicht auflösbare Referenzen bleiben „Rotlinks“ (rot) — sie blockieren die Freigabe nie und heilen automatisch, sobald du den passenden Eintrag anlegst. Freigegebene Artikel erscheinen als „Kommt vor in“ bei den referenzierten Einträgen." }],
  },

  /* --- Einstellungen: getrennte Sichtbar-Hinweise (kein Scroll-Sprung) --- */
  vokabular: {
    titel: "Such-Vokabular",
    absaetze: [{ ziel: "daten-vokabular", text: "Hinterlege eigene Stimmungswörter, damit die natürlichsprachige Suche deinen Wortschatz kennt — etwa „wohlfühl“, „kopfkino“ oder „sonntagabend“. Danach findet die Suche deine Filme auch über diese Begriffe." }],
  },
  "streaming-quellen": {
    titel: "Streaming-Quellen",
    absaetze: [{ ziel: "streaming-quellen", text: "Welche Dienste du nutzt, wählst du hier — die Auswahl filtert den gemeinsamen Streamingkatalog sofort. Im Demo-Modus sind Max’ Dienste bereits gesetzt; im Clean Mode bestimmst du sie selbst." }],
  },
  erweitert: {
    titel: "Manuell aktualisieren",
    absaetze: [{ ziel: "erweitert", text: "Unter „Erweitert“ kannst du Kino- und Streamingdaten manuell aus der Datenbank neu laden, Notfall-Importe ausführen und den lokalen Programm-Cache leeren. Der Import und Export deiner Masterliste bleibt weiter oben als eigener, leichter auffindbarer Bereich." }],
  },

  /* --- Wächter: Sonderfall (A8) — feuert bei erster ungesicherter Änderung --- */
  waechter: {
    titel: "Der Browser-Speicher ist kein Backup.",
    gefahr: true,
    keinEscape: true,
    export: true,
    absaetze: [{ ziel: "daten-waechter", text: "Seit dem letzten separaten Rohdaten-Export wurden Bewertungen im Browser geändert. Der Export erzeugt eine neue Momentaufnahme; er aktualisiert keine Projektdatei automatisch. Für eine vollständige Sicherung aller persönlichen App-Daten verwende zusätzlich das Gesamt-Backup." }],
  },
};

/* Baut den Hinweis für einen Trigger. skip aus kd:setup (derzeit ungenutzt,
   für spätere bedingte Zusätze vorbereitet). Null = nichts zu zeigen. */
export function baueHinweis(id, skip = []) {
  const d = DEF[id];
  if (!d) return null;
  let absaetze = [...(d.absaetze || [])];
  if (d.wenn) {
    for (const flag of Object.keys(d.wenn)) {
      if (skip.includes(flag)) absaetze = absaetze.concat(d.wenn[flag]);
    }
  }
  if (!absaetze.length) return null;
  absaetze = absaetze.slice(0, 3); // nie mehr als drei Löcher
  return {
    id,
    titel: d.titel,
    gefahr: !!d.gefahr,
    keinEscape: !!d.keinEscape,
    export: !!d.export,
    absaetze,
  };
}

export function hinweisIds() { return Object.keys(DEF); }

/* Anker, die per IntersectionObserver feuern (Sichtbar-Anker) -> Hinweis-ID. */
export const SICHTBAR_TRIGGER = {
  pinboard: "pinboard",
  "daten-vokabular": "vokabular",
  "streaming-quellen": "streaming-quellen",
  erweitert: "erweitert",
};

/* Event-Bus: Kind-Komponenten feuern Trigger (feuere), App reagiert (onTour). */
let _handler = null;
export function onTour(fn) { _handler = fn; return () => { if (_handler === fn) _handler = null; }; }
export function feuere(id) { if (typeof _handler === "function") _handler(id); }

/* Kollision Teil A/B: Feld-Tooltips sind aus, solange ein Tutorial-Overlay offen ist. */
let _tourOffen = false;
export function setTourOffen(v) { _tourOffen = !!v; }
export function istTourOffen() { return _tourOffen; }

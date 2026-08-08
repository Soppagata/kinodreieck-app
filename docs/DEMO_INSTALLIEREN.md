# Kinodreieck-Demo installieren

Kinodreieck wird in zwei gleichwertig gepflegten Formen gebaut:

- als installierbare Web-App mit automatischen Updates,
- als einzelne lokale HTML-Datei mit eingebetteter Demo-Basis.

## Fertiges Paket lokal erzeugen

```bash
npm install
npm run build:online
```

Danach liegen die Ergebnisse hier:

- `dist/` – vollständiges Web-/PWA-Paket,
- `dist/download/Kinodreieck.html` – kopierbare Einzeldatei.

## PWA auf einem Gerät installieren

Zum lokalen Prüfen:

```bash
npm run preview
```

Die im Terminal angezeigte `localhost`-Adresse öffnen und dort
`/download/` aufrufen. Eine PWA lässt sich aus Sicherheitsgründen nur über
HTTPS oder `localhost` installieren, nicht direkt aus einer `file://`-Datei.

- Android/Chrome: auf „Auf Android installieren“ tippen; alternativ im
  Browsermenü „App installieren“ wählen.
- iPhone/iPad/Safari: Teilen → „Zum Home-Bildschirm“ → „Als Web-App öffnen“.
- Desktop/Chrome oder Edge: das Installationssymbol in der Adressleiste oder
  „App installieren“ im Browsermenü verwenden.

Nach dem ersten vollständigen Laden liegt die App-Shell offline im
Browsercache. Konto, Live-Katalog und Live-KI benötigen weiterhin eine
Verbindung.

## Einzeldatei verwenden

`dist/download/Kinodreieck.html` an den gewünschten Ort kopieren und per
Doppelklick öffnen. Dafür sind weder Installation noch Webserver nötig. Die
Datei enthält eine echte lokale Demo-Basis für Mediathek und Kernfunktionen;
persönliche Änderungen bleiben im Browserprofil des Geräts und können über
„Settings → Gesamt-Backup“ exportiert werden.

Die mitgelieferten Kino- und Streamingdaten sind synthetische, archivierte
Beispiele und werden mit ihrem tatsächlichen Stand ausgewiesen. Sie sind kein
aktuelles Programm; dafür braucht die App eine Verbindung zum Konto-Katalog.

Für automatische App-Updates ist die PWA die passendere Form. Für ein
transportables, archiviertes Datenpaket ist die Einzeldatei gedacht.

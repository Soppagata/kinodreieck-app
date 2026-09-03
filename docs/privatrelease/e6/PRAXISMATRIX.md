# E6-Praxismatrix: kurze physische Abnahme

Zielstand ist die bereits ausgelieferte Staging-PWA auf
`1f0bd01615078f501e52c865e6095841a30b4ca1`. Diese Matrix ergänzt nur die
wenigen Beobachtungen, die ein echtes iPhone beziehungsweise ein zweites Gerät
besser belegen als ein automatisierter Test. Dauer: etwa **5–10 Minuten**.

## Sicherheitsrahmen für diesen Durchgang

- Vorhandenes Privatkonto und vorhandene Inhalte nur ansehen. Keine Testdaten
  anlegen, ändern, importieren, wiederherstellen oder löschen.
- Im Radar ausschließlich vorhandene Ziele und Funde ansehen. **Kein Ziel
  anlegen, keine Suche oder Aktualisierung starten**, weil daraus ein
  Anbieteraufruf entstehen kann.
- Kein Feedback und keine Kontolöschanfrage absenden. Die
  Kontolöschbestätigung nicht aktivieren.
- Keine KI-Funktion starten und keine KI-Schalter ändern. Einen
  Anbieterausfall nicht künstlich erzeugen.
- Der lokale Sicherheitsdownload ist optional. Er schreibt nichts zum Server;
  die Datei danach nur lokal verwahren oder löschen. Keinen Restore versuchen.
- Bei einem unerwarteten Konflikt-, Lösch-, Import-, Kosten- oder
  Sendebildschirm abbrechen und den sichtbaren Wortlaut notieren.

## Bereits technisch belegt – nicht noch einmal prüfen

| Bereich | Übernommener Beleg | Folgerung für Max |
|---|---|---|
| Exakter Staging-RC | GitHub-Lauf `33796531485` war einschließlich Gesamtsuite, Chromium, WebKit und `deploy-staging` grün; feste Domain, Buildmetadaten und Service Worker lieferten `1f0bd016` | Kein erneuter Build-, CI-, Bundle-, Secret- oder Service-Worker-Audit in dieser Praxisrunde |
| Login, Legal und PWA-Shell | Frischer isolierter Chromium-Kontext belegte Minimal-Login, Legal-Fläche, Build und aktiven Service Worker; Login-/Legal- und Localmodus-Verträge sind automatisiert grün | Physisch nur Bedienbarkeit, Tastatur und installierte PWA ansehen; keinen neuen leeren Datenbestand erzeugen |
| Kontotrennung und Fehlerfälle | Automatisiert belegt sind zwei Geräte desselben Kontos, A/B-Daten und -Revisionen, Logout/Relogin, konkurrierende Revisionen ohne Überschreiben sowie beschädigter Cache/Owner/Epoch fail-closed | Keine zweite Testidentität, keine künstliche Konfliktmutation und kein beschädigter Cache auf echten Geräten |
| Sicherheitsdownload und Datenrechte | Download-vor-Löschbestätigung, verborgener unvollständiger Kontoexport und manueller Rechteweg sind in den E2-Verträgen grün | Nur Oberfläche ansehen; lokaler Download höchstens optional, Löschung und Restore nie ausführen |
| Mailweg | Domain/DNS, aktive Function, CORS und genau ein synthetischer Staging-Send bis `delivered` sind belegt | Weder Feedback noch Löschanfrage noch Testmail erneut senden |
| Mobile Kino-/Radar-/Entdecken-Flächen | Kino ist automatisiert bei 320/393/1280 Pixeln geprüft; E5-Verträge, Gesamtsuite und Browserläufe für die sichtbaren RC-Flächen sind grün | Physisch nur auf echte Touch-, Tastatur- und Lesbarkeitshindernisse prüfen; keine Radar- oder Inhaltsmutation |

## Jetzt physisch sinnvoll – ein kompakter Lauf

Vorbereitung: iPhone mit der installierten Staging-PWA, das vorhandene
Privatkonto und ein zweites Gerät bereithalten. Das zweite Gerät darf ein
Desktop-Browser sein. Keine Browserdaten oder PWA-Installation löschen.

| Zeit | Gerät | Ausführung | Bestanden, wenn |
|---:|---|---|---|
| 1 min | iPhone-PWA | PWA vollständig schließen, online neu öffnen und einen angebotenen App-Update-Hinweis einmal bestätigen. Am Login Benutzername und Passwort jeweils fokussieren, die Tastatur wieder schließen und `Datenschutz & Rechtliches` öffnen sowie zum Login zurückgehen. | PWA startet ohne leere/alte Shell; Login bleibt mit offener Tastatur vollständig erreichbar, die Seite lässt sich nicht störend horizontal verschieben, Legal ist lesbar und der Rückweg funktioniert. |
| 2 min | iPhone-PWA + zweites Gerät | Auf beiden Geräten mit **demselben vorhandenen Konto** anmelden. Nach abgeschlossenem Laden auf beiden Geräten zwei oder drei unverwechselbare vorhandene Anker vergleichen, zum Beispiel einen Mediathek-Titel sowie vorhandene Radarziele/Funde. Einmal normal neu laden beziehungsweise die PWA schließen und öffnen. | Beide Geräte zeigen den erkennbar gleichen Kontostand; kein Merge-/Importdialog erscheint; kein fremder Gast- oder Kontostand blitzt auf; Reload beziehungsweise Wiederöffnung verliert den Stand nicht. |
| 2 min | iPhone-PWA | `Kino` öffnen, vorhandene Datum-/Kino- und Zusatzfilter aufklappen und je einen verfügbaren Filter kurz wählen, danach wieder auf den Ausgangszustand zurückstellen. Anschließend `Entdecken` öffnen und vorhandene Karten lesen. Im Radar nur vorhandene Ziele und vorhandene Funde auf- und zuklappen. | Touchziele sind erreichbar, Filter und Reset liegen nicht übereinander, es gibt bei normaler Hochkantnutzung keine horizontale Seitwärtsfahrt, Entdecken ist nicht leer/wirkungslos und Ziel/Fund bleiben im Radar klar getrennt. |
| 1 min | iPhone-PWA | Die globale Suche fokussieren, wenige Buchstaben tippen und wieder löschen, ohne eine KI- oder Radar-Aktion auszulösen. Tastatur öffnen/schließen und danach die mobile Navigation benutzen. | Suchfeld und Schließen bleiben über der Tastatur erreichbar; Hintergrund und Navigation springen nicht dauerhaft; nach dem Schließen ist normales Scrollen wieder möglich. Die reale Gerätebreite genügt – 320/393 wurden bereits automatisiert geprüft. |
| 1–2 min | iPhone-PWA | `Settings` öffnen. Nur die sichtbaren Kernflächen überfliegen: `KI-Funktionen`, `Geschmacksprofil`, `Konto & Geräte-Sync`, `Datenrechte & Konto`, `Sicherheitskopie dieses Geräts`, Streamingquellen und `Datenschutz & Datenübersicht`. Die Feedback- und Kontolöschflächen nur ansehen. Optional genau einmal `Sicherheitskopie dieses Geräts herunterladen` und prüfen, dass eine `.json`-Datei entsteht. | Keine Import-/Restore-/Wartungs-/Veröffentlichungsfläche wird angeboten; Kontoexport ist verborgen und der manuelle Rechteweg sichtbar; Feedback und Löschanfrage sind verständlich, lösen aber ohne bewusstes Absenden nichts aus; der optionale Download bleibt lokal. |
| 1 min | iPhone-PWA | Ohne vorherige Inhaltsänderung abmelden. Den danach sichtbaren lokalen Gaststand kurz ansehen; anschließend den Login wieder öffnen, aber nicht zwingend erneut anmelden. Das zweite Gerät bleibt angemeldet. | Kontoinhalte sind auf dem iPhone nach Logout nicht als Gastinhalt sichtbar; ein vorher vorhandener lokaler Gaststand bleibt getrennt; das zweite Gerät zeigt weiterhin nur den unveränderten Kontostand. |

Hat das vorhandene Konto kein Radarziel oder keinen Fund, wird dieser Teil als
`NICHT PRÜFBAR – kein vorhandener Bestand` notiert und übersprungen. Das ist
kein Anlass, für die Abnahme ein Ziel oder einen Anbieterauftrag zu erzeugen.

Für die Abnahme genügt eine einzige Zeile:

```text
E6-Praxis iPhone [Modell/iOS] + Zweitgerät [Browser]: PASS | FAIL – [nur konkrete Auffälligkeit]
```

Ein `FAIL` erfordert keine Wiederholung des ganzen Laufs. Nur der betroffene
Schritt wird nach einer Korrektur erneut ausgeführt.

## Nicht Teil dieser 5–10 Minuten

- Die einmalige aggregierte Größenmessung des realen Max-Kontos ist ein
  eigener inhaltsfreier Betriebsreadback, keine physische UI-Probe.
- A/B-Kontotrennung, Revisionskonflikt, beschädigter Cache und veralteter
  Sieben-Tage-Zustand bleiben bei ihren deterministischen Belegen; sie werden
  nicht durch riskante Echtdatenmanöver nachgestellt.
- Formelle rechtliche Endfreigabe ist durch das bloße Lesen der Legal-Fläche
  nicht erbracht.

## Erst später bei Default-Branch-Aktivierung

- Der periodische +6h-Checker ist auf Staging nur versioniert. Erst wenn der
  Workflow auf dem Default-Branch tatsächlich aktiviert wurde, werden der
  dauerhafte Termin, atomare Claim, höchstens ein normaler Retry und die genau
  einmalige datenminimierte Betriebs-Mail am real entstandenen Fall belegt.
  Dafür wird **kein** Radarziel, Providerlauf oder Mailversand nur zur Abnahme
  erzeugt.
- `staging` → `main`, Production-Deploy, Production-Smoke, Release-Tag und die
  anschließende physische Production-PWA-Probe bleiben eigene, später
  autorisierte Liefergrenzen. Diese Staging-Matrix behauptet keinen
  Production- oder Releasebeleg.

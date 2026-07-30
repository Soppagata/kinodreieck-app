# Etappe 9c: Paket für die geschlossene Beta

Stand: 30.07.2026

Status: Vorlage; vor der ersten Einladung ausfüllen und freigeben

Geltungsbereich: genau eine Kohorte mit vier bis fünf persönlich eingeladenen
Testern

## Zweck und Grenze

Diese Beta prüft den vollständigen Produktweg auf echten Geräten. Sie ist kein
öffentlicher Start und kein Ersatz für Etappe 10. Es gibt:

- keine öffentliche Registrierung,
- keine zweite Kohorte,
- keine neue Telemetrie und kein Session Replay,
- kein neues Feedbackwerkzeug,
- keine Zugangsdaten, privaten Inhalte oder Schlüssel in diesem Dokument.

Verbesserungswünsche ohne Sicherheits-, Datenverlust- oder Funktionsblocker
gehen in den Backlog. Sie verlängern die Beta nicht automatisch.

## 1. Einladungsvoraussetzungen

Einladungen dürfen erst versendet werden, wenn alle Kästchen belegt sind.

### Produkt und Release

- [ ] Etappe 8 ist vollständig abgenommen und in Produktion.
- [ ] Etappe 9a ist abgenommen; Demo, PWA-Installation und Download funktionieren.
- [ ] Etappe 9b ist abgenommen; Nutzerbackup, Datenbank-Restore, Not-Aus,
      Accountlöschung und Pages-Rollback wurden praktisch geprüft.
- [ ] Der einzuladende Build ist auf Staging und Produktion per Domain-Smoke
      belegt; Build- und Function-Version stehen im Releaseprotokoll.
- [ ] `npm test`, `npm run test:function` und `npm run test:rls` sind für diesen
      Stand grün.
- [ ] Bundle-, Secret-, CSP- und RLS-Prüfung sind grün.
- [ ] `programm_demo` und `streaming_demo` sind öffentlich verfügbar und enthalten
      nur freigegebene Daten.

### Konten, Kosten und Rückweg

- [ ] Selbstregistrierung ist aus; Konten werden manuell angelegt.
- [ ] Für jede Rolle A bis D und optional E ist ein Konto vorbereitet.
- [ ] Startpasswörter und Zugangsdaten werden nur einzeln über einen vertraulichen
      Weg weitergegeben und stehen weder im Ergebnisbogen noch im Feedbackkanal.
- [ ] Tageslimit, Monatsbudget und Parallelgrenze entsprechen der abgenommenen
      Etappe-9b-Konfiguration.
- [ ] KI-Not-Aus und verantwortliche Bedienung sind geklärt.
- [ ] Jeder Tester weiß vor der ersten Datenübernahme, wie ein Gesamt-Backup
      heruntergeladen wird.
- [ ] Ein Wegwerfkonto ist für Lösch- und Kontowechselproben vorhanden.

### Durchführung

- [ ] Vier bis fünf konkrete Personen sind den anonymen Rollen A bis E
      zugeordnet; Namen stehen nur in Max' privater Einladungsliste.
- [ ] Der eine private Feedbackkanal ist entschieden und unten eingetragen.
- [ ] Der Beta-Hinweis wurde unverändert oder inhaltlich gleichwertig übermittelt.
- [ ] Jeder Tester hat Teilnahme und Beta-Hinweis bewusst bestätigt.
- [ ] Start, Ende, Beta-Version und erreichbarer Ansprechpartner sind in der
      Einladung benannt.
- [ ] Der interne Trockenlauf aller elf Szenarien ist ohne offenen Stop-Befund
      abgeschlossen.

## 2. Beta-Hinweis für Tester

Folgender Text wird vor der Teilnahme übermittelt. Die Platzhalter werden vorher
ausgefüllt.

> **Geschlossene Kinodreieck-Beta**
>
> Du testest eine noch nicht öffentlich freigegebene Version von Kinodreieck im
> Zeitraum **[START–ENDE]**. Deine Teilnahme ist freiwillig und du kannst sie
> jederzeit beenden.
>
> Ohne Konto bleiben deine Mediathek, Listen und Einstellungen auf deinem Gerät.
> Mit dem eingeladenen Konto werden persönliche Bereiche wie Mediathek,
> Bewertungen, Listen, Blogartikel, Einstellungen und Geschmacksprofil in
> Supabase gespeichert und zwischen deinen Geräten abgeglichen. Eine lokale
> Kopie kann nach Abmeldung oder serverseitiger Kontolöschung auf deinen Geräten
> bestehen bleiben.
>
> Live-KI ist freiwillig und lässt sich insgesamt oder je Funktion abschalten.
> Wenn du eine KI-Funktion bewusst verwendest, können die für diese Aufgabe
> nötigen Inhalte an den KI-Anbieter gesendet werden, zum Beispiel eine
> Suchanfrage, Profilantworten, Filmangaben, ein freigegebener Blogtext oder ein
> Scanbild. Vollständige Suchanfragen, Blogtexte, Scanbilder, Notizen,
> Passwörter und Tokens gehören nicht in das Kinodreieck-Diagnoseprotokoll.
> Protokolliert werden technische Metadaten wie Funktion, Status, Modell,
> Tokenzahl, Kosten, Dauer und Fehlerklasse. Kinodreieck baut für diese Beta
> keine zusätzliche Nutzungsanalyse oder Sitzungsaufzeichnung ein; die
> eingesetzten Plattformen können eigene technische Betriebs- und Auth-Logs
> führen.
>
> Passwort-Reset und serverseitige Kontolöschung laufen in dieser Beta über
> Max. Lade vor Migration, Restore oder Löschtest ein Gesamt-Backup herunter.
> Sende niemals Passwort, Backup-Datei, Scanbild, privaten Blogtext, Token oder
> Schlüssel in den Feedbackkanal. Beschreibe einen Fehler stattdessen mit
> Szenario-ID, Zeitpunkt, Gerät, Browser und sichtbarer Meldung.
>
> Feedbackkanal: **[PRIVATEN KANAL EINSETZEN]**
>
> Ansprechpartner: **[VOR DEM START EINSETZEN]**
>
> Beta-Version: **[BUILD-VERSION EINSETZEN]**

Dieser Hinweis ist eine Produktinformation für die geschlossene Testphase und
keine vollständige Datenschutzerklärung für einen öffentlichen Start.

## 3. Rollen und Verteilung

Die Rollen ersetzen Namen in allen gemeinsamen Ergebnissen.

| Rolle | Schwerpunkt | Szenarien |
|---|---|---|
| A | erster Einstieg und KI-Wahl | 1, 11 |
| B | vorhandener Bestand und Rückweg | 2, 8, 9 |
| C | mehrere Geräte und Offlinebetrieb | 3, 4 |
| D | Sitzungs-, Limit- und Ausfallverhalten | 5, 6, 7 |
| E, optional | gemeinsame Isolationsprobe | 10 zusammen mit A |

Bei vier Testern übernimmt A die Rolle E für Szenario 10. Dabei werden keine
Passwörter zwischen Testern geteilt: Max stellt die beiden benötigten
Wegwerfkonten beziehungsweise getrennten Sitzungen bereit.

## 4. Die elf Testszenarien

Für jedes Szenario wird ein eigener Ergebnisbogen ausgefüllt. Persönliche
Inhalte werden nicht hineinkopiert.

### 1 — Neuer Account ohne Daten · Rolle A

**Vorbereitung:** neues leeres Konto, frisches Browserprofil.

**Ablauf:** App öffnen, leer starten, anmelden, einen kleinen Eintrag anlegen,
abgleichen und neu laden.

**Erwartung:** kein fremder oder Demo-Bestand erscheint; der neue Eintrag bleibt
erhalten und der Syncstatus ist verständlich.

### 2 — Lokalen Bestand übernehmen · Rolle B

**Vorbereitung:** kleiner lokaler Testbestand und Gesamt-Backup.

**Ablauf:** anmelden, Übernahmevorschau lesen, Bestand übernehmen, Prüfbericht
kontrollieren und neu laden.

**Erwartung:** Vorschau und Prüfsummen stimmen; nichts wird still
zusammengeführt oder überschrieben.

### 3 — Zweites Gerät · Rolle C

**Vorbereitung:** dasselbe Konto auf zwei eigenen Geräten oder Browserprofilen.

**Ablauf:** auf Gerät 1 einen eindeutig erkennbaren Testeintrag speichern, Sync
abwarten, auf Gerät 2 anmelden und abgleichen.

**Erwartung:** derselbe Stand erscheint genau einmal; Konto- und Gerätestatus
sind verständlich.

### 4 — Offlineänderung und späterer Sync · Rolle C

**Vorbereitung:** beide Geräte besitzen denselben abgeglichenen Stand und ein
aktuelles Backup.

**Ablauf:** Gerät 1 offline schalten, einen Testeintrag ändern, App schließen,
wieder online gehen und abgleichen.

**Erwartung:** offline bleibt die App nutzbar; die Änderung wird später
übertragen oder ein echter Konflikt wird sichtbar zur Entscheidung gestellt.

### 5 — Abgelaufene Sitzung · Rolle D

**Vorbereitung:** Max stellt nach dem Etappe-9b-Runbook eine ungültig gewordene
Testsitzung her; Tokens werden weder angezeigt noch weitergegeben.

**Ablauf:** App erneut öffnen und eine kontogebundene Aktion versuchen.

**Erwartung:** die App erklärt die abgelaufene Anmeldung, läuft als Gast weiter
und löscht keine lokalen Daten.

### 6 — KI-Limit erreicht · Rolle D

**Vorbereitung:** geplanter Termin mit einem Konto am bereits erreichten oder
sicher vorbereiteten Limit. Es werden keine Aufrufschleifen erzeugt, um das
Limit künstlich zu verbrauchen.

**Ablauf:** genau eine bewusst gewählte KI-Aktion versuchen.

**Erwartung:** verständlicher Limithinweis, kein unkontrollierter Anbieteraufruf
und alle deterministischen Funktionen bleiben nutzbar.

### 7 — Anbieter oder Supabase vorübergehend nicht erreichbar · Rolle D

**Vorbereitung:** ausschließlich der sichere, reversible Ausfallweg aus dem
Etappe-9b-Runbook; kein absichtlicher Produktionsausfall für andere Tester.

**Ablauf:** eine betroffene Funktion und anschließend eine deterministische
Kernfunktion verwenden.

**Erwartung:** ehrlicher Ausfallhinweis; Sitzung und lokale Daten bleiben
erhalten; Sammlung, Bewertungen und normale Suche funktionieren weiter.

### 8 — Backup, Export und Restore · Rolle B

**Vorbereitung:** abgeglichener Testbestand, Gesamt-Backup und festgehaltene
Stückzahlen.

**Ablauf:** kontrollierte Änderung durchführen, Backup wiederherstellen,
Zählbericht prüfen, neu laden und anschließend den Restore rückgängig machen.

**Erwartung:** beide Richtungen stellen den erwarteten Stand her; Warnungen
werden nicht als Erfolg ausgegeben.

### 9 — Accountlöschung · Rolle B

**Vorbereitung:** ausschließlich das Wegwerfkonto, vollständiges Backup und
Bestätigung durch Max.

**Ablauf:** serverseitige Löschung nach Runbook, erneute Anmeldung versuchen und
verbliebenen lokalen Stand prüfen.

**Erwartung:** Anmeldung und serverseitige Kontozeilen sind entfernt; kein
anderes Konto ist betroffen; lokale Daten bleiben als lokale Kopie ehrlich
erkennbar.

### 10 — Trennung zweier Accounts · Rollen E und A

**Vorbereitung:** zwei Wegwerfkonten mit verschiedenen markierten Testeinträgen,
getrennte Browserprofile; keine Weitergabe von Zugangsdaten zwischen Testern.

**Ablauf:** jeweils eigenen Bestand laden; danach unter Aufsicht auf einem
Gerät kontrolliert das Konto wechseln und den angebotenen Übernahmeweg prüfen.

**Erwartung:** kein Konto sieht oder verändert Daten des anderen; fremde
Gerätedaten werden nicht still in das nächste Konto übernommen.

### 11 — Ohne KI starten, einzeln zuschalten und widerrufen · Rolle A

**Vorbereitung:** neues Konto ohne aktivierte KI-Funktionen.

**Ablauf:** deterministischen Einstieg und Profilweg nutzen, KI insgesamt
einschalten, genau eine Funktion zuschalten, anschließend Funktion und KI wieder
abschalten sowie eine vorhandene Profil-Einwilligung widerrufen.

**Erwartung:** Start ohne KI ist vollwertig; Schalter wirken je Gerät; Widerruf
entfernt das Profil wie angekündigt; echte Bewertungen bleiben unberührt.

## 5. Ergebnisbogen

Eine Kopie dieses Blocks wird je Szenario ausgefüllt:

```text
Beta-Version / Build:
Szenario-ID:
Rolle: A | B | C | D | E
Datum und Uhrzeit:
Gerät / Betriebssystem:
Browser und Version:

Vorbedingungen erfüllt: ja | nein
Ergebnis: bestanden | mit kleinem Befund | blockiert | abgebrochen
Erwartetes Verhalten eingetreten: ja | teilweise | nein
Sichtbare Fehlermeldung verständlich: ja | nein | entfällt
Lokale Daten verloren: nein | ja | unklar
Fremde Kontodaten sichtbar oder veränderbar: nein | ja | unklar
Sync-Konflikt: nein | sichtbar lösbar | unverständlich | Daten verloren
KI bewusst aufgerufen: nein | ja
KI-Limit/Not-Aus korrekt: ja | nein | entfällt
Kosten laut bestehendem Protokoll: [WERT ODER ENTFÄLLT]
Zeit bis zum Suchergebnis: [WERT ODER ENTFÄLLT]
KI-Filter/Profilvorschlag korrigiert: nein | ja | entfällt
Fallback/deterministischer Weg nutzbar: ja | nein | entfällt

Kurze Beobachtung, ohne private Inhalte:
Reproduzierbar: ja | nein | nicht erneut versucht
Nächster sicherer Schritt:
```

Keine Screenshots mit persönlichen Filmen, Blogtexten, Scanbildern,
E-Mail-/Loginwerten, Tokens oder Schlüsseln anhängen. Eine Vorgangs-ID darf nur
intern zur Zuordnung zum bestehenden Diagnoseprotokoll notiert und nicht in
einen gemeinsamen Kanal kopiert werden.

## 6. Feedbackkanal

Entscheidung vor Einladung:

```text
Gewählter bestehender privater Kanal: [EINSETZEN]
Wer liest und beantwortet Meldungen: [EINSETZEN]
Erwartete Antwortzeit in der Beta: [EINSETZEN]
Ersatzweg bei Ausfall des Kanals: [EINSETZEN]
```

Es wird genau ein bereits verwendeter privater Kanal gewählt. Es entsteht kein
Feedbackformular, Bot, Tracker, öffentliches Board oder neues Konto-System.

Jede Meldung beginnt mit:

```text
[BETA] Rolle [A–E] · Szenario [1–11] · Build [VERSION]
```

Danach genügen Zeitpunkt, Gerät/Browser, Ergebnisstatus und eine kurze
Beschreibung. Passwörter, Backups, private Inhalte, Schlüssel und vollständige
KI-Eingaben werden nie gesendet.

## 7. Abbruch- und Pausenkriterien

### Sofort die gesamte Beta stoppen

- persönliche Daten eines anderen Kontos sind sichtbar oder veränderbar,
- persönliche Daten gehen verloren und lassen sich nicht aus dem geprüften
  Rückweg wiederherstellen,
- ein Secret, Token, Passwort oder privater Inhalt erscheint im Bundle,
  Diagnoseprotokoll oder falschen Konto,
- Kostenlimit oder KI-Not-Aus greift nicht,
- ein nicht bewusst ausgelöster oder wiederholter KI-Kostenpfad entsteht,
- Accountlöschung betrifft das falsche Konto oder hinterlässt persönliche
  Serverdaten entgegen dem Runbook,
- Backup oder Restore beschädigt den Ausgangsstand ohne funktionierenden
  Rückweg.

Vorgehen: keine weiteren Wiederholungen, keine weiteren KI-Aufrufe, Zeitpunkt
und Build festhalten, lokale Daten unangetastet lassen und Max über den
festgelegten privaten Kanal informieren. Bei Kostenrisiko wird zuerst der
Etappe-9b-Not-Aus verwendet.

### Betroffenes Szenario pausieren

- Anmeldung, Sync oder eine Kernfunktion ist reproduzierbar blockiert,
- eine Fehlermeldung führt zu einer riskanten oder falschen Handlung,
- ein Sync-Konflikt ist nicht verständlich auflösbar,
- ein externer Dienst ist vorübergehend nicht erreichbar.

Andere Szenarien dürfen nur weiterlaufen, wenn Daten-, Konto- und Kostenwege
nachweislich nicht betroffen sind.

### Kein Abbruchgrund

- reine Text-, Abstands- oder Darstellungswünsche,
- zusätzliche Funktionsideen,
- persönliche Geschmacksabweichungen bei einem korrigierbaren KI-Vorschlag,
- verständlich gemeldete und korrekt begrenzte externe Ausfälle.

Nach einem Stop wird dieselbe Kohorte nicht um neue Personen ergänzt. Eine
Fortsetzung braucht Fehlerbehebung, grüne relevante Tests, Staging-Smoke und
eine dokumentierte Freigabe. Sicherheitskritische Szenarien werden zuerst
intern mit Wegwerfkonten wiederholt.

## 8. Abschlussauswertung

Nach dem letzten Test werden ausschließlich die Ergebnisbögen und das
bestehende technische Kostenprotokoll zusammengeführt.

### Zusammenfassung

```text
Beta-Version:
Zeitraum:
Teilnehmende Rollen: A | B | C | D | E
Ausgefüllte Szenarien: __ / 11
Bestanden:
Mit kleinem Befund:
Blockiert:
Abgebrochen:

Login erfolgreich / fehlgeschlagen:
Sync-Konflikte insgesamt / verständlich gelöst:
KI-Aufrufe laut Protokoll:
Gesamtkosten und Kosten je Funktion:
Suchzeiten:
Korrigierte KI-Filter:
Korrigierte Profilvorschläge:
Genutzte deterministische Fallbacks:
Unverständliche Fehlermeldungen:
Datenverlustbefunde:
Account-/Berechtigungsbefunde:
Offene Quellen- oder Freigabebefunde:
```

### Freigabetor

Etappe 9c ist nur bestanden, wenn:

- alle elf Szenarien einen belastbaren Ergebnisbogen besitzen,
- kein Account-Isolationsfehler offen ist,
- keine persönlichen Daten verloren gingen,
- Backup und Restore praktisch funktioniert haben,
- Kostenlimits und Not-Aus greifen,
- KI-Ausfall die deterministischen Kernfunktionen nicht blockiert,
- Tester bei Fehlern eine sichere nächste Handlung erkennen,
- keine ungeklärte Quelle in öffentlich ausgelieferten Daten liegt.

### Entscheidung

Genau eine Entscheidung wird festgehalten:

1. **Etappe 9c abgenommen:** harte Tore erfüllt; Produktwünsche wandern in den
   Backlog, nächster Schritt ist Etappe 10.
2. **Intern nachbessern:** kein Daten-/Konto-/Kostenleck, aber ein
   Beta-Kernpfad ist blockiert; nach Fix nur gezielte interne Wiederholung.
3. **Beta abgebrochen:** mindestens ein Stop-Kriterium ist eingetreten;
   Ursache, Schutzmaßnahme und Rückweg werden vor jeder Fortsetzung geklärt.

Auch nach erfolgreicher Beta gibt es keine öffentliche Erweiterung, bevor die
Datenschutz-, Transparenz-, Lösch-, Support- und Betriebsanforderungen aus
Etappe 10 erfüllt sind.

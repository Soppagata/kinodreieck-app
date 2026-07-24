# Etappe 0: Abnahme des stabilen Ausgangsstands

Stand: 24. Juli 2026

## Ergebnis

Etappe 0 der `ROADMAP_TO_ONLINE.md` ist abgeschlossen. Die Tester-PWA besitzt
einen reproduzierbaren Clean- und Demo-Start, der alte Demo-Seed kann
verlustsicher bereinigt werden und beide vorgesehenen Buildformen laufen durch.

Diese Abnahme enthält noch keine Arbeiten aus Etappe 1:

- keine neue Accountarchitektur,
- kein Hosting- oder Domainumbau,
- keinen produktiven KI-Endpunkt,
- keinen State-Management- oder UI-Rewrite.

## Geprüfter Stand

- Ausgangspunkt: `76c78e3` (`PWA Demo v1 - Codex`)
- Etappe-0-Kandidat vor diesem Bericht: `361bcdc`
- Branch: `main`
- Node.js: `v24.18.0`
- npm: `11.16.0`
- Stabilitätsmarke: `online-etappe-0-stabil-2026-07-24`

## Behobene Blocker

1. Moderne Supabase-Publishable-Keys werden bei öffentlichen Katalog- und
   Demo-Reads nur als `apikey` gesendet. JWT-Anon-Keys bleiben mit Bearer-Header
   kompatibel.
2. Ein alter, still gespeicherter Clean-Wert überspringt die bewusste
   Clean-/Demo-Erstwahl nicht mehr.
3. Demo-Einträge werden über protokollierte IDs und Schlüssel selektiv entfernt;
   später ergänzte Pins, Merker und Streamingdienste bleiben erhalten.
4. Das alte Boolean-Demo-Seed-Format wird vor dem Löschen auf exakte Einträge
   aufgelöst. Ist die Demo-Quelle offline, bleiben Daten und Seed vollständig
   für einen späteren Versuch erhalten.
5. Die Pin-Ablaufprüfung vergleicht Kalendertage statt Terminmitternacht mit der
   aktuellen Uhrzeit. Ein Pin von gestern bleibt dadurch wie vorgesehen noch
   bis zum Ende des heutigen Tages sichtbar.
6. Der Masterlistenimport öffnet bei leerem Text den Dateidialog und importiert
   nichtleeren Text weiterhin direkt.

## Modussemantik

Die frühere technische Beta-/Personalmodus-Gabel ist nicht mehr aktiv.
`PERSONAL_MODE` ist im einheitlichen Tester-Build `false`. Für diese Abnahme
bedeutet „persönlicher Datenpfad“ deshalb:

- Clean- oder Demo-Start innerhalb derselben Tester-PWA,
- persönliche Daten ausschließlich im lokalen beziehungsweise ausgewählten
  Storage-Treiber,
- gemeinsamer Katalog weiterhin read-only und getrennt von persönlichen Daten.

Die Regressionstests decken unter anderem ab:

- vollständig leeren Erststart,
- alten unbestätigten Clean-Wert,
- bestätigten Clean- und Demo-Start,
- Abbrechen und erneute Wahl desselben Modus,
- abgebrochenen Wechsel mit persönlichen Artikeln,
- selektive Demo-Bereinigung,
- Offline-Verhalten eines alten Demo-Seeds,
- Erhalt eigener Pins, Merker und Streamingdienste,
- Dateidialog- und Textpfad des Masterimports,
- KI-Ergänzung eines bereits vorhandenen Masters.

## Verifikation

Im Arbeitsbaum und zusätzlich durch einen unabhängigen Subagenten:

```text
npm test                 erfolgreich
npm run build:single     erfolgreich
git diff --check         erfolgreich
```

Relevante Ergebnisse der vollständigen Testkette:

- Supabase-Treiber: 68/68
- Katalog: 8 Checks
- Restore: 49/49
- Must-Watch: 24/24
- Blog: 18/18
- Eggs: 59/59
- Staffeln: 12/12
- Staffel-Pipeline: 9/9
- Personal-/Testermodus: 42/42
- Betamodus-Semantik: 6/6
- Pages-Build: 11/11
- Strukturtest und Echtdatei-Test: bestanden
- Konsolen-/React-Fehler: 0

Der Web-Build und der Single-File-Build verarbeiten jeweils 103 Module. Die
erzeugte `dist-single/Kinodreieck.html` ist validiert, verwendet ein klassisches
Script und ist doppelklickfähig.

## Prüfung aus frischem Kandidatenverzeichnis

Der Kandidat wurde zusätzlich aus dem unveränderten Ausgangs-Commit plus dem
vollständigen Etappe-0-Patch in einem neuen temporären Verzeichnis aufgebaut.

```text
npm ci       erfolgreich, 130 Pakete installiert
npm test     vollständig erfolgreich
```

Damit hängt der Build nicht von alten lokalen `dist/`-Dateien oder einem
vorhandenen `node_modules/`-Verzeichnis des Arbeitsbaums ab.

## Bekannter Nicht-Blocker

Vite warnt beim Web-Build vor einem JavaScript-Bundle von rund 521 kB
unkomprimiert. Der Build bleibt erfolgreich; das ist kein Etappe-0-Blocker.
Code-Splitting kann in Etappe 1 oder 2 bewertet werden.

## Freigabetor

- vollständige Testsuite grün,
- Web- und Single-File-Build grün,
- Demo- und Clean-Start reproduzierbar,
- persönlicher Datenpfad vor unbeabsichtigter Demo-Bereinigung geschützt,
- Änderungen fachlich getrennt,
- klarer lokaler Rückkehrpunkt vorhanden,
- keine Account-, Hosting- oder produktive KI-Arbeit vorgezogen.

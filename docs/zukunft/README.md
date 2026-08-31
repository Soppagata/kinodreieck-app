# Kinodreieck: Zukunftsplanungen nach der privaten Demo

## Aktiver Auftrag seit 31.08.2026

Der [Road-to-Live-Etappenplan](NAECHSTER_MASTERCHAT_PRIVATRELEASE_ETAPPENPLAN.md)
ist durch Max' ausdrücklichen Abschluss- und Bauauftrag aktiviert. Sein
[Masterregister](NAECHSTER_MASTERCHAT_PRIVATRELEASE_ETAPPENPLAN.md#4-master-pflichtliste-und-einziges-fortschrittsregister)
ist der einzige aktuelle Fortschrittsstand für den privaten Release.
Diese gezielte Ausnahme erlaubt lokale Umsetzung in isolierten Worktrees;
sie aktiviert keine anderen Zukunftspläne und keine externen Wirkungen.
Die folgenden Datums-, Demo-, Prüf- und Statusangaben sind historische
Herkunft und werden für diesen Auftrag vom aktuellen Plan und
Orchestrierungsskill überstimmt.

## Historische Ablagegrenze

Stand: 09.08.2026
Erstellungsreferenz: `7a51ce7` auf `codex/rollenlogik-private-demo`
Planungsfortschreibung: `staging`/`origin/staging` `65a92df`, Produktion `3898152`
Audit-Scope der Planungsdateien: `FUTURE_PLAN_METADATA_ONLY`

> **Status: Planung plus lokale, nicht aktivierte Phase-2- und Phase-3-Belege.**
> Die Planungsdateien bleiben aus Rollen-v1 und der privaten
> Demo-Schlussabnahme ausgeschlossen. Die gesonderten Lieferbelege
> dokumentieren ausschließlich lokale Commits; sie sind weder gepusht, remote
> migriert, deployed noch aktiviert.

## Zweck

Hier liegen Ideen, die erst **nach** dem stabilen privaten Demo-Checkpoint als
eigene Funktionsblöcke auf `staging` gebaut werden sollen. Die Dokumente sollen
so vollständig sein, dass eine frische Bau-Session nicht auf den ursprünglichen
Chatverlauf angewiesen ist.

Die Ablage ist versioniert gedacht. Sie ist kein Rohdaten-, Screenshot-,
Export- oder Geheimnisordner.

Für Entdecken/Radar ist ausschließlich eine geschlossene Privat-Beta mit Max
und höchstens zehn weiteren kuratierten Logins geplant. Eine Veröffentlichung,
öffentliche Registrierung oder Indexierung ist nicht Teil der Planung.

### Ablagestatus bei Erstellung

Die Planungsdateien wurden am 09.08.2026 zunächst bewusst ungetrackt geschützt
und danach getrennt von Rollen-v1 im lokalen Radar-Phase-1-Commit `a52a6c4`
versioniert. Phase 2 folgte separat als lokaler Commit `66640d3`; Phase 3 folgt
als eigener lokaler Liefercommit mit dem unten verlinkten Beleg. Keiner dieser
Commits wurde gepusht, deployed oder aktiviert.

## Geltungsgrenze für Audit und Cleanup

Für alle Dateien unter `docs/zukunft/` gilt:

- Technische Audits behandeln nicht gebaute Zukunftsfunktionen **nicht** als
  fehlende Implementierung, Defekt, tote Route oder Cleanup-Aufgabe.
- Die Dokumente zählen nicht zur Definition of Done der privaten Demo, der
  formalen Etappe 9c oder eines aktuellen Releases.
- Zulässig bleiben reine Hygieneprüfungen: Secrets, personenbezogene Daten,
  rechtswidrige Quellenannahmen, gefährliche Ausführungsanweisungen,
  widersprüchliche Ist-Behauptungen und beschädigte Markdown-Dateien.
- Ein späterer Bau darf nie allein deshalb beginnen, weil hier ein Plan liegt.
  Er benötigt einen eigenen Auftrag, einen aktuellen Phase-0-Audit und Max'
  ausdrückliche Freigabe an den vorgesehenen STOP-Punkten.
- Vor Umsetzung werden Branch, ausgelieferter Staging-/Produktionsstand,
  Remote-Schema, Rollenvertrag, Providerpreise und Nutzungsbedingungen erneut
  empirisch geprüft. Die Erstellungsreferenz ist keine spätere Autorität.
- Ziel einer ersten Umsetzung ist ausschließlich `staging`. `main`, das
  Produktionsfrontend und das gemeinsam genutzte produktive Supabase-Projekt
  bleiben bis zu ihren jeweiligen ausdrücklichen Remote-STOPs unverändert.

Es gibt bewusst keine erfundene `.auditignore`: Im Repository existiert kein
Werkzeug, das eine solche Datei auswertet. Diese README ist der verbindliche
Scope-Vertrag für Menschen und Bau-Sessions. Jeder spätere Auditauftrag muss
`docs/zukunft/` zusätzlich ausdrücklich als `FUTURE_PLAN_METADATA_ONLY`
filtern; der Marker allein ist keine technische Ausschlussautomatik.

## Enthaltene Planung

| Datei | Inhalt | Status |
|---|---|---|
| `ENTDECKEN_RADAR_EMPFEHLUNGEN_PLAN.md` | verbindlicher Produktvertrag für Entdecken, getrennte globale Suchaktionen, Statusgrenzen, Personen im Radar, kuratierte Radar-Freigaben, deterministische Empfehlungen und getrennte Österreich-Charts | ausformuliert; echte Chart-Ingestion ist bis zu Quellenrechten blockiert |
| `RADAR_BEOBACHTUNGEN_PLAN.md` | technischer Daten-, Evidenz-, Kosten-, Datenschutz- und Rolloutplan für den global deduplizierten aktiven Webradar | ausformuliert; sichtbare UI und Begriffswahl werden vom Entdecken-Plan überstimmt |
| `AUFTRAG_ENTDECKEN_RADAR.md` | Standalone-Bauauftrag mit Phase-0-, Remote-, Rechte-, Provider-, Kosten- und Staging-STOPs | Phasen 1–3 lokal umgesetzt; Phasen 4–6 bleiben an ihren Remote-STOPs blockiert |
| `AUFTRAG_RADAR_NACH_DEMO.md` | älterer ausführlicher Radar-Auftrag | technische Referenz; nicht mehr als primären Handoff verwenden |
| `DISCOVERY_TARGETS_SKIZZE.md` | Ergänzungsvertrag für Schauspiel-/Regiepersonen direkt in `Mein Radar`, intern als eigene Discovery-Schicht; Bücher, Spiele und weitere Rollen bleiben geparkt | erste Personenstufe entschieden; Umsetzung bleibt bis Pflichtspike und Baufreigabe blockiert |
| `ENTSCHEIDUNGSLOG.md` | Entschiedenes, Geparktes und in der besprochenen Form Verworfenes | bei neuen Fakten fortschreiben |
| `RADAR_PHASE2_LOCAL_2026-08-09.md` | lokaler Liefer-, Test- und STOP-Beleg für Event-Radar, getrennte Shares, Proposal-Validator und vorbereitete SQL-Basis | lokal committed als `66640d3`, nicht gepusht, nicht remote angewandt, nicht aktiviert |
| `RADAR_PHASE3_LOCAL_2026-08-09.md` | lokaler Liefer-, Test- und STOP-Beleg für die sichtbare Entdecken-Oberfläche, Suchaktionen, Radar-/Proposal-Vorschauen und Mobile-Abnahme | gebaut, vollständig lokal getestet und separat committed; nicht gepusht, deployed oder aktiviert |

## Beförderungsvertrag

Eine Planung verlässt diesen Ordner erst, wenn:

1. die private Demo als eigener stabiler Ausgangsstand festgehalten ist,
2. Max den konkreten Funktionsblock zur Umsetzung freigibt,
3. Phase 0 des zugehörigen Auftrags den aktuellen Ist-Stand neu belegt,
4. offene Produkt-, Quellen-, Budget- und Remote-Entscheidungen gefallen sind,
5. ein eigener Implementierungsbranch beziehungsweise isolierter Worktree
   verwendet wird,
6. Tests, Dokumentation und Rückweg Teil desselben Lieferblocks sind.

Für Chartquellen ist ein kuratiertes Login kein Ersatz für die schriftliche
Erlaubnis zu Automatisierung, Speicherung und Anzeige. Jede Quelle besitzt ein
eigenes Rechte-Gate; ihre Blockade hält den Radar-Kern nicht auf.

Nach erfolgreicher Auslieferung bleibt die historische Planung erhalten, wird
aber oben sichtbar auf `umgesetzt` gesetzt und verlinkt den maßgeblichen
Commit, die Abnahme und den Deploymentbeleg. Sie wird nicht still als aktuelle
Betriebsdokumentation weiterverwendet.

## Harte Ablageregeln

In diesen Ordner gehören niemals:

- API-Schlüssel, Tokens, Kontonamen, E-Mail-Adressen oder Account-UUIDs,
- echte Anbieterpayloads oder vollständige Artikeltexte,
- produktive Dumps, Screenshots oder private Testerlisten,
- ausführbare Migrationen, Workflows oder Function-Quellen,
- Behauptungen, eine geplante Funktion sei bereits gebaut, deployed oder
  abgenommen.

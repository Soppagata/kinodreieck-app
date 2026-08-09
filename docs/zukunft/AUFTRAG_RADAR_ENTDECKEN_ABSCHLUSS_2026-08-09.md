# Übergabe: Radar und Entdecken lokal fertigstellen

Stand: 09.08.2026
Repository: `/Users/max/Documents/GitHub/kinodreieck-app`
Branch: `codex/entdecken-radar-local-phase2`
HEAD: `a52a6c4` (`feat(radar): establish phase one contracts`)

## Ziel

Phase 2 selektiv committen und danach ausschließlich Phase 3 aus
`docs/zukunft/AUFTRAG_ENTDECKEN_RADAR.md` lokal bauen: den sichtbaren Bereich
`Entdecken` mit `Empfehlungen | Radar | Meinungen`, lokalem Event-Radar und
read-only Proposal-Vorschau. Danach lokal testen und committen.

Nicht Teil dieses Auftrags sind Push, Remote-Migration, Deploy, CI-/Routine-
Aktivierung, Featureflag-Öffnung sowie echte oder potenziell zahlende Aufrufe.

## Gesicherter Ist-Stand

- Phase 1 ist lokal als `a52a6c4` committed, aber nicht gepusht oder deployed.
- Phase 2 liegt lokal uncommitted vor; der Lieferbeleg steht in
  `docs/zukunft/RADAR_PHASE2_LOCAL_2026-08-09.md`.
- `npm test` war vollständig grün; Phase 2 darin 94/94, die SQL-Migration aber
  mangels lokaler PostgreSQL-Laufzeit nur statisch geprüft.
- `src/lib/localEventRadar.js` und `src/lib/radarProposalValidator.js` sind noch
  nicht in die Oberfläche eingebunden. Navigation und globale Suche zeigen
  weiterhin `Blog`.
- Die Personen-Automatik bleibt nach dem `NO_GO` aus §6.1 geparkt. §8 ist hier
  enger auszulegen: keine aktive Personen-Discovery, keine Personen-Migration,
  kein RPC, kein Env-Schalter und kein Control, das Automatik verspricht.
- `docs/zukunft/AUFTRAG_SOL_PRIVATPILOT_ABSCHLUSS_2026-08-09.md` gehört einem
  anderen Task: nicht ändern, nicht stagen, nicht committen.

## Phase A – Audit, dann STOP

1. Arbeitsbaum, Branch, HEAD, Staging und alle Diffs neu prüfen.
2. Phase-2-Dateien gegen den Lieferbeleg und §7/§8 prüfen; fremde Änderungen
   ausgrenzen.
3. Gebaut, getestet, committed, gepusht, deployed und aktiviert getrennt
   berichten.

Bis hier ausschließlich read-only arbeiten und auf Max' ausdrückliches
`WEITER` warten.

## Phase B – lokaler Abschluss nach WEITER

1. Phase 2 nach erneut grünen Verträgen selektiv in einen eigenen Commit
   aufnehmen; die SOL-Datei und sonstige fremde Änderungen strikt ausschließen.
2. Den technischen Tab-Key `blog` und bestehende Blog-Daten, Deep-Links und
   Shared-Article-Verträge kompatibel lassen, sichtbar aber `Entdecken` zeigen.
3. Lokal die Ansichten `Empfehlungen | Radar | Meinungen` bauen:
   - Empfehlungen ausschließlich deterministisch, erklärbar und read-only aus
     bestätigten lokalen Signalen; kein Profilwrite.
   - Radar an den lokalen Event-Radar anbinden; Gastlimit zehn, private Defaults,
     Shares separat, Events nur aus Fixtures bzw. bestätigter lokaler Evidenz.
   - Meinungen öffnet die bestehende Blog-Funktion ohne Datenumbau.
4. `Entdecken verwalten` als Desktop-Dialog und mobiles Full-Sheet umsetzen.
   Fokus, Escape/Zurück, Scroll-Lock, Overflow sowie leere und gefüllte Zustände
   testen.
5. In der globalen Suche Titel/Serien mit getrennten Aktionen `Beobachten` und
   `Ins Radar` anbieten. `Pin` bleibt ausschließlich bei einem konkreten
   Kinotermin. Personen bleiben sichtbar geparkt statt scheinbar aktiv.
6. Der Proposal-Validator darf nur eine Vorschau liefern: kein Importer, kein
   Schreiben, keine Routine, kein Retry, kein Provider.
7. Neue gezielte UI-/Vertragstests, `npm run test:entdecken-contracts`,
   `npm run test:radar-phase2-local`, vollständiges `npm test`,
   `npm run test:mobile` und `git diff --check` ausführen. Keine Live-KI-Tests.
8. Phase 3 nach grüner Prüfung separat lokal committen und einen Lieferbeleg mit
   den sechs Zuständen gebaut/getestet/committed/gepusht/deployed/aktiviert
   hinterlassen.

Danach STOP. Weder pushen noch eine Migration anwenden oder deployen.

## Harte Grenzen

- Kein `git push`, kein PR und kein `main`.
- Kein Supabase-/Cloudflare-Remotezugriff, kein `db push`, kein Deploy.
- Alle Radar-/Share-/Provider-/Scheduler-/Proposal-Import-Flags bleiben aus.
- Keine Routine, kein Scheduler, keine Provider-, KI- oder sonstige potenziell
  zahlende Anfrage.
- Keine Personen-Automatik und kein Ausweichen um das §6.1-`NO_GO`.
- Keine Secrets ausgeben oder ins Repository schreiben.

## Lokal fertig, wenn

- Phase 2 und Phase 3 als getrennte lokale Commits auf dem Codex-Branch liegen,
- `Entdecken` auf Desktop und echten iPhone-Viewports bedienbar ist,
- Blog/Meinungen und bestehende Deep-Links unverändert funktionieren,
- Radar und Proposal-Vorschau fail-closed und ohne Remote-Wirkung arbeiten,
- Personen-Automatik nachweislich geparkt bleibt,
- die vollständigen Mock-, Build-, Mobile- und Privacy-Regressionen grün sind,
- Push, Remote-Migration, Deploy und Aktivierung ausdrücklich als offen
  ausgewiesen sind.

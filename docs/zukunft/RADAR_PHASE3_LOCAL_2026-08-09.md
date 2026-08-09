# Entdecken und Radar Phase 3 – lokaler Liefer- und STOP-Beleg

Stand: 09.08.2026
Branch: `codex/entdecken-radar-local-phase2`
Phase-1-Basis: `a52a6c4` (`feat(radar): establish phase one contracts`)
Phase-2-Basis: `66640d3` (`feat(radar): add local phase two foundation`)
Phase-3-Commit: separater lokaler Commit dieser Lieferung
Liefergrenze: `LOCAL_ONLY_NOT_ACTIVATED`

## Ergebnis

§8 aus `AUFTRAG_ENTDECKEN_RADAR.md` ist lokal gebaut. Der sichtbare Bereich
heißt `Entdecken`; der technische Key `blog`, vorhandene Blogdaten,
Shared-Article-Verträge und Artikel-Deep-Links bleiben erhalten. Die drei
internen Ansichten heißen `Empfehlungen | Radar | Meinungen`.

Die Umsetzung ist bewusst deterministisch und fail-closed. Sie startet keinen
Provider, keine KI, keine Routine und keinen Scheduler. Es gab weder Push noch
Remote-Migration, Deploy oder Featureflag-Aktivierung.

## Gelieferte Oberfläche

- `Empfehlungen` ordnet den vorhandenen lokalen Streamingkatalog ausschließlich
  aus bestätigten Profilsignalen und optional ausdrücklich bewerteten
  Mediathek-Einträgen. Gründe werden sichtbar erklärt; Katalog und Profil
  werden nicht verändert.
- Reale Streaming-Chart- und ÖFI-/Kinostart-Adapter bleiben deaktiviert. Der
  Blockgrund `Rechtefreigabe fehlt` ist sichtbar.
- `Radar` zeigt lokale Abos, bestätigte Fixture-Ereignisse der aktuellen Woche,
  ausstehende Kontomodifikation und eine synthetische, nicht als echte
  Community-Auswertung ausgegebene Kreis-Feed-Karte.
- Die Proposal-Ansicht prüft nur lokales Fixture-JSON. Das Ergebnis weist
  ausdrücklich `writes=false`, `routineActivated=false` und
  `automaticRetry=false` aus; es gibt keinen Importpfad.
- `Meinungen` rendert die bestehende Blog-Komponente ohne Datenumbau. Ein
  Artikel-Deep-Link wechselt direkt in diese Ansicht.
- `Entdecken verwalten` ist am Desktop ein Dialog und mobil ein Full-Sheet mit
  Fokusfalle, Escape-/Zurück-Schließen, Fokusrückgabe, Scroll-Lock und
  überlauffreien leeren wie gefüllten Zuständen.
- Globale Suchtreffer halten `Beobachten` und `Ins Radar` als getrennte
  Aktionen. `Beobachten` bleibt auf Serien mit stabiler Watchmode-ID begrenzt;
  Radar verlangt ebenfalls eine kanonische Identität. Keine Aktion schreibt in
  den jeweils anderen Topf.
- Gast-Radar bleibt lokal und auf zehn aktive Ziele begrenzt. Im Kontomodus
  wirken nur serverbestätigte Cache-Einträge; Aktionen landen lokal in der
  Outbox. Shares bleiben getrennt, private-default und setzen ein
  serverbestätigtes aktives Abo voraus.
- Personen-Automatik bleibt vollständig geparkt: kein Personen-Control, keine
  Discovery-Migration, kein RPC, kein Env-Schalter und keine automatische
  Übernahme.

## Lokale Verifikation

Alle Prüfungen liefen ausschließlich lokal und mit Mocks:

- `npm run test:entdecken-contracts`: 55/55,
- `npm run test:radar-phase2-local`: 95/95,
- `npm run test:entdecken-phase3`: 17/17,
- `npm test`: Exit 0, einschließlich Controller 65 Checks,
  Single-File-/Vite-Build, Strukturtest ohne Konsolen-/React-Fehler,
  Privacy-/Personalmodus 140/140 und Pages-Paket 62/62,
- `npm run test:mobile`: 116/116 in Chromium und WebKit; vier echte
  iPhone-Viewportgrößen von 320×568 bis 430×932 sowie Desktop-Dialog,
  Fokus, Escape, Scroll-Lock und Overflow,
- `git diff --check`: ohne Befund.

Die bekannte Vite-Warnung zum Bundle über 500 kB bleibt ein Hinweis, kein
Buildfehler. Es wurde kein Live-KI-Test und kein echter oder potenziell
zahlender Anbieterrequest ausgeführt.

## Lieferstand am STOP

| Zustand | Stand |
|---|---|
| Gebaut | ja, lokal |
| Getestet | ja, vollständige lokale Mock-, Build-, Mobile- und Privacy-Gates grün |
| Committed | ja, als separater lokaler Phase-3-Commit dieser Lieferung |
| Gepusht | nein |
| Deployed | nein |
| Aktiviert | nein |

CI wurde nicht gestartet; die Abnahme ist lokal automatisiert. Eine praktische
Owner-Abnahme steht ebenso aus wie jeder Remote-Schritt. Der nächste erlaubte
Schritt ist ausschließlich ein von Max ausdrücklich freigegebener Push. Eine
Remote-Migration, ein Deploy oder eine Aktivierung benötigen weiterhin einen
eigenen Auftrag und STOP.

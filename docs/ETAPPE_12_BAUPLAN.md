# Etappe 12: Bauplan und Eigentumsmatrix

Stand: 14.08.2026, Phase 0

## Verifizierte Integrationsbasis

- Baumeister-Worktree: `/Users/max/.codex/worktrees/c3b5/kinodreieck-app`
- Arbeitsbranch: `codex/e12-visible-batch-delete`
- lokaler Ausgangs-HEAD: `c7be72099afa1879feb4e25b70753454db655aaa`
- direkter Remote-Abgleich: `origin/staging` = `c7be72099afa1879feb4e25b70753454db655aaa`
- ausgeschlossene Basis und Grenze: `origin/main` = `3898152c88abf450823e88936f89919e967e2903`
- Staging-Build-Metadaten: `c7be72099afa1879feb4e25b70753454db655aaa`, Umgebung `staging`
- GitHub Actions Run 31749461701 / Nummer 128: Test-Suiten, Chromium,
  WebKit, Sammelgate und Staging-Deployment erfolgreich; Produktion übersprungen
- lokaler Ausgangsstand: sauber; 15 Auswahl-Logik-, 74 Auswahl-DOM-,
  65 Controller- und 15 Mehrtopf-Transaktionschecks erfolgreich

Klassifikation: **erwartungsgleich**. E11 ist als Integrationsbasis bestätigt;
E12 ist noch nicht gebaut. Das Hauptcheckout, seine ungetrackte Nutzerdatei und
alle fremden Worktrees bleiben unberührt.

## Festgelegter E12-Vertrag

1. Eine reine Batchprojektion verarbeitet eine nichtleere Liste eindeutiger,
   kanonischer stabiler Master-IDs. Ziel-ID-Kollisionen durch Zahl/String oder
   Whitespace sowie fehlende oder mehrfach im Master vorkommende Ziele führen
   fail-closed zum Abbruch. Index- und Titelfallbacks sind ausgeschlossen.
2. Eine kanonische Kollision einer Ziel-Master-ID mit einer Must-Watch-ID bricht
   ab. Artikelrefs teilen diesen Namensraum und dürfen nicht irrtümlich zum
   Rotlink werden.
3. Master, Artikelzeilen und Must-Watch werden je genau einmal durchlaufen. Die
   Projektion liefert den neuen Master, die referenziell bereinigten beiden
   anderen Töpfe, unveränderte Referenzidentitäten für unbetroffene Töpfe und
   exakte Zähler für gelöschte Mastereinträge, Blogrefs und MW-Verknüpfungen.
4. Eine Vorschau bindet die kanonische Ziel-ID-Folge und exakt die verwendeten
   Master-, Artikel- und Must-Watch-Arrayinstanzen sowie den gebundenen
   Storage-/Datenkontext. Jede Abweichung macht sie vor dem ersten Write
   ungültig. Der Nutzer muss danach neu prüfen beziehungsweise neu auswählen.
5. Der öffentliche Batchpfad `loescheFilme(ids, options)` führt ausschließlich
   den einen vorbereiteten Batchplan durch die bestehende Sperrfolge
   Must-Watch -> Artikel -> Master. Vorwärtswrites bleiben Artikel ->
   Must-Watch -> Master, je verändertem Topf höchstens einer. `loescheFilm`
   delegiert für genau ein Element auf denselben Vertrag.
6. Auch ein vollständig geleerter Master wird genau einmal mit `set` als
   leerer Mastertopf geschrieben. `delete(K.master)` ist für E12 verboten.
7. Bestehende Kompensation bleibt erhalten: MW vor Artikel zurückrollen; bei
   Rollbackfehlern bleibt die bewusst sichere Rotlink-Restlage sichtbar.
8. Die Zusage ist lokal kompensierend und referenziell fail-safe innerhalb der
   drei bestehenden Töpfe Master, Artikel und Must-Watch. Sie ist keine
   Crash-, Server- oder geräteübergreifende ACID-Transaktion und umfasst keine
   anderen persönlichen Töpfe oder beliebige weitere `film_ref`-Felder.
9. Die UI bildet Ziele nur aus der aktuell sichtbaren Schnittmenge in ihrer
   sichtbaren Reihenfolge. Global ausgewählte, derzeit verborgene IDs bleiben
   ausgewählt, werden aber weder vorgeschaut noch gelöscht.
10. Der Dialog zeigt Zielanzahl, Titel/Jahr, alle drei Folgenzahlen und die
    verborgene Nicht-Zielmenge. Pending sperrt Doppelbestätigung und relevante
    Hintergrundaktionen. Fehler oder Stale erhalten Auswahl und alle Drafts.
    Erfolg leert Auswahl/Dialog und beendet den Modus, ohne nicht betroffene
    Neu-, Edit-, Rotlink- oder Nachtrag-Drafts durch den erwarteten
    Master-Identitätswechsel zu verlieren.

## Eigentumsmatrix

| Welle | Paket / messbares Ergebnis | Chatrolle | Modell / Begründung | vorausgesetzter Commit | primäre Dateien / Schnittstellen | gesperrte Flächen | Abhängigkeiten | fokussierte Gates | Checkpoint danach |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A: eine reine Mengenprojektion, gebundene Drei-Basis-Vorschau und genau eine kompensierende Batchtransaktion samt Einzeldelegation | komplexer Bauchat | `gpt-5.6-sol`/`high` - destruktiver öffentlicher Vertrag, drei persistente Töpfe, CAS, Kontext, Sperren und Rollback | Phase-0-Commit auf Basis `c7be720` | `src/lib/libraryProjection.js`, `src/controllers/libraryController.js`, `src/controllers/personalDataTransactionController.js`, erforderliche Basis-Gates in `src/controllers/useArticleController.js` und `src/controllers/useMustwatchController.js`; `article_transaction_test.mjs`, `controllers_test.mjs`, neue fokussierte Batch-Testdatei und ausschließlich deren Registrierung in `package.json` | `src/App.jsx`, `src/tabs/MediathekTab.jsx`, `src/index.css`, DOM-/Mobiletest, Functions, Migrationen, Shared Backend, andere Töpfe | festgelegter Vertrag oben | Projektion mit Mehrzielen/Invalidität/Kollisionen/Identität/Aggregation; ein Batch, Writezahlen, Fehler/Rollbacks, Concurrent/Stale, drei Basen, Storage-/Accountkontext, leerer Master per set | Checkpoint A = kontrolliert integrierter Paket-A-Commit |
| 2 | A-Prüfung: Vertrag und fokussierte Tests auf unveränderlichem Hash | Phasenprüfer read-only | `gpt-5.3-codex-spark`/`xhigh` - fester deterministischer Checkpoint ohne Vertragsänderung | exakter Checkpoint A | read-only | alle Quellen und Remoteaktionen | Paket A vollständig statisch geprüft und integriert | benannte Paket-A-Tests, sauberer Worktree, Hash- und Diffbeleg | keiner |
| 3 | B: ausschließlich sichtbare Zielbildung, gekoppelte Vorschau, responsiver zugänglicher Dialog, Pending/Stale/Fehler/Erfolg und Draft-Erhalt | komplexer Bauchat | `gpt-5.6-sol`/`high` - destruktiver Async-Dialog, React-Identität, Fokus, Daten-/Accountgrenzen und Drafts | exakter Checkpoint A | `src/App.jsx`, `src/tabs/MediathekTab.jsx`, `src/index.css`, optional eine neue reine Dialogkomponente; nötige UI-Helfer in `src/lib/mediathekSelection.js`; `mediathek_selection_logic_test.mjs`, `mediathek_selection_dom_test.mjs`, `tests/mobile-layout.spec.mjs` | Paket-A-Dateien und dessen öffentlicher Vertrag, Functions, Migrationen, Shared Backend, andere Produktbereiche | Paket-A-API und Checkpoint-A-Prüfung | sichtbare/verborgene Ziele, exakte Vorschau, Abbruch, ein Batchaufruf, Doppelklick, Stale/Fehler, Erfolg, Drafts, Fokus/Escape/A11y; Chromium und WebKit mobil | Checkpoint B = kontrolliert integrierter Paket-B-Commit |
| 4 | B-Prüfung: UI-/DOM-/Mobilevertrag auf unveränderlichem Hash | Phasenprüfer read-only | `gpt-5.3-codex-spark`/`xhigh` - fester Browser-/Assertiongegenstand | exakter Checkpoint B | read-only | alle Quellen und Remoteaktionen | Paket B vollständig statisch geprüft und integriert | Logik-/DOM-Test und gezielte Chromium-/WebKit-Mobilefälle | keiner |
| 5 | Gesamtdiff gegen E11 auf Destruktion, Identität, Stale, Kontext, Rollback, Races und Drafts prüfen | Integrationsreviewer read-only | `gpt-5.6-sol`/`high` - gekoppelte transaktionale und asynchrone Risikogrenzen | exakter, vollständig fokussiert grüner Checkpoint B | read-only | Änderungen, Push, Deployment und Findings-Reparatur | beide Baupakete integriert | vollständiger E12-Diff und alle im Auftrag benannten Reviewfragen | nur bei Finding: frischer Korrekturcommit und neuer Checkpoint |
| 6 | bestätigte kleine A11y-/Harness-/Assertionfindings ohne Vertragsänderung | Korrekturchat | `gpt-5.3-codex-spark`/`xhigh` - nur nach reproduziertem lokalem Finding | dann aktueller exakter Checkpoint | exakt im Finding benannte Dateihoheit | alle nicht benannten Verträge/Dateien | bestätigtes Finding | Regression plus engster passender Test | neuer Korrekturcheckpoint |
| 6 | bestätigte Transaktions-, Daten-, Zustands- oder Async-Findings | komplexer Korrekturchat | `gpt-5.6-sol`/`high` - Risiko bleibt tragend und wird nicht auf Spark herabgestuft | dann aktueller exakter Checkpoint | exakt im Finding benannte Datei-/Schnittstellenhoheit | alle nicht benannten Verträge/Dateien | bestätigtes Finding | Regression plus betroffene fokussierte Gates | neuer Korrekturcheckpoint |

## Überlappungs- und Integrationsentscheidung

- Die zwei Baupakete laufen **sequenziell**, nicht parallel. Paket B hängt von
  der finalen Preview-/Controller-Schnittstelle aus Paket A ab.
- Paket A verändert weder App noch Mediathek/Dialog; Paket B verändert den
  fest geprüften Batchvertrag nicht. Die einzige Integrationslinie ist der
  Aufruf der Paket-A-API in App/Mediathek.
- Der Baumeister behält vollständige statische Beitragsprüfung, kontrolliertes
  Einspielen der Commits, Checkpoints, Gesamtgates, Remote-Gate, Push,
  Staging-Lieferung und praktische Gastabnahme.
- Bau-, Prüf- und Reviewchats arbeiten in frischen isolierten Worktrees. Sie
  dürfen weder pushen/deployen noch Workflowläufe, Shared Backend, Migrationen,
  echte Anbieterläufe, `main`, Produktion oder fremde Worktrees berühren.

## Checkpoints und Gates

1. Phase-0-Dokumentationscommit; kein Verhaltenscheckpoint.
2. Checkpoint A nach vollständiger statischer Prüfung und Integration von A;
   danach separater Spark/xhigh-Prüfchat auf exakt diesem Hash.
3. Checkpoint B nach vollständiger statischer Prüfung und Integration von B;
   danach separater Spark/xhigh-Prüfchat auf exakt diesem Hash.
4. Sol/high-Integrationsreview auf dem vollständigen E12-Diff vor jedem Push.
   Bestätigte Findings werden in frischen, passend gerouteten Chats repariert;
   jeder neue Commit entwertet frühere Prüfbelege.
5. Final beim Baumeister: neue fokussierte Tests, `npm test`,
   `npm run test:function`, `npm run build:online`, `npm run test:mobile`.
   Alle Läufe bleiben secretfreie Mock-/Buildläufe; echte Anbieterläufe sind
   ausdrücklich ausgeschlossen.
6. Unmittelbar vor Push: `origin/staging` und `origin/main` direkt neu prüfen.
   Nur Fast-forward des final geprüften Hashs auf E12-Branch und `staging`.
7. Nach vollständig grünem CI, übersprungener Produktion und passender
   Staging-Build-Metadatei führt ausschließlich der Baumeister die autorisierte
   ephemere Desktop-/Mobile-Gastprobe durch.

## Entschieden und verworfen

| Entscheidung | Begründung | Randbedingung |
|---|---|---|
| Zwei sequenzielle Sol/high-Baupakete | ein fester Datenvertrag vor der UI minimiert Überlappung | Paket B startet erst auf Checkpoint A |
| Vorschau speichert exakte drei Datenbasen plus Storage-/Datenkontext | jede Abweichung muss vor dem ersten Write scheitern | neue Vorschau nach Stale |
| Leerer Master wird gesetzt, nicht gelöscht | der Account-Treiber spiegelt Remote-Delete bewusst nicht sicher | gilt für E12-Batchlöschung |
| Nicht betroffene Drafts bleiben beim erwarteten Lösch-Masterwechsel gemountet | vermeidet stille Verluste fremder Eingaben | echte Restore-/Accountgrenzen resetten weiterhin hart |

| Verworfen - nicht wieder aufmachen | Grund | Datum |
|---|---|---|
| Schleife über `loescheFilm` oder wiederholte Einzelprojektion | verletzt Batch-, Write- und Stale-Vertrag | 14.08.2026 |
| Drei parallele Baupakete mit eigenständigem Controller-, UI- und Dialogvertrag | überlappt an Preview-/Pending-Schnittstelle | 14.08.2026 |
| `delete(K.master)` beim Löschen aller Ziele | kann im Accounttreiber Wiederauferstehung begünstigen | 14.08.2026 |
| Zusage strikter ACID-Atomarität oder Bereinigung weiterer persönlicher Töpfe | vorhandene Browserkompensation trägt diese Aussage nicht | 14.08.2026 |

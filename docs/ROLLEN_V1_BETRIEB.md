# Rollen-v1: Betrieb und private Demo

Stand: 09.08.2026

Dieser Leitfaden konkretisiert den freigegebenen Entwurf aus
`AUFTRAG_ROLLENLOGIK_PRIVATE_DEMO.md`. Er enthält keine Zugangsdaten,
Konto-IDs oder Freigabezeilen. Das Supabase-Projekt und die `ai-task`-Function
werden vom Staging- und Produktionsfrontend gemeinsam verwendet; jeder dortige
Write bleibt deshalb ein eigenes Produktions-Backend-Gate.

## Remote-Stand nach Phase 2

Am 09.08.2026 wurde Phase 2 nach dem ausdrücklichen STOP auf dem bestätigten
Projekt `bscjgwcntapobyxsiyce` abgeschlossen:

- `ai_aktiv=false` wurde vor dem ersten Schema-Write gesetzt und unabhängig
  rückgelesen; die KI blieb während der gesamten Phase aus.
- Access-Basis und Enforcement wurden einzeln in der dokumentierten Reihenfolge
  angewandt und als Migrationen `20260809120000` sowie `20260809121000`
  rückgelesen. Lokal und remote stehen damit 29 Migrationsversionen.
- Alle drei Auth-Konten besitzen wieder exakt ihre bestätigte Access-Zeile:
  privates Konto `owner`/aktiv/KI, Test A `member`/aktiv/keine KI und Test B
  `member`/inaktiv/keine KI. Es gibt keine fehlende Zeile und keine verletzte
  `personal_ai => active`-Invariante.
- Der echte RLS-Vertrag ist in den Modi `active` mit 73/73, `inactive` mit
  14/14 und `missing` mit 14/14 grün. Danach blieben keine persönlichen,
  Shared- oder KI-Testzeilen und keine verwaisten Claims zurück.
- 15/15 geschützte Policies und 3/3 RPCs wurden mit Active-Gate rückgelesen;
  öffentliche Demo-Lesewege und der verengte tokenfreie Legacy-Vertrag blieben
  erhalten. Browserrollen besitzen auf den geschützten Flächen kein
  `TRUNCATE` oder `MAINTAIN`.
- Die bestehende Edge Function blieb unverändert auf Version 26; weder
  Function noch Frontend wurden deployt oder gepusht. Der nächste Schritt
  bleibt deshalb hinter dem STOP vor Function-/Staging-Auslieferung.

Ein bereits vor Phase 2 vorhandener, rund 13,9 Tage alter `laufend`-Status im
KI-Log wurde als verwaister Betriebsdatensatz erkannt und bewusst nicht im
Rollenauftrag verändert. Vor einem späteren Wiederanschalten der KI gehört er
in den bestehenden 9b-Betriebsweg; er war kein aktueller Anbieterrequest.

## Vertrag

- Technische Authentifizierung erteilt noch keinen fachlichen Zugriff.
- Fachrollen sind ausschließlich `member` und `owner`. Beide haben in v1
  dieselben Rechte.
- `owner` ist weder der lokale Cachemarker `kd:acct:owner` noch die
  Legacy-Tabelle `kd_owner`.
- `active` erlaubt kontogebundenen Remote-Speicher und geschützte Reads.
- `personal_ai` erlaubt die persönliche KI nur gemeinsam mit `active`.
- Fehlende, mehrfache, formfremde oder nicht lesbare Freigaben sind
  fail-closed.
- Nutzer dürfen nur ihre eigene Freigabe lesen. Sämtliche Browser-Schreibwege
  sowie Fremdlesen bleiben gesperrt.

| Zustand | Remote-Speicher | persönliche KI | Produktoberfläche |
|---|---:|---:|---|
| Gast | nein | nein | öffentliche Demo-Daten |
| angemeldet, keine lesbare Freigabe | nein | nein | lokaler Kontocache geschützt und maskiert; öffentliche Demo-Daten |
| `active=false` | nein | nein | wie oben |
| `active=true`, `personal_ai=false` | ja | nein | Sync und deterministische App |
| `active=true`, `personal_ai=true` | ja | ja | bestehende KI-Schalter und Kostenzäune gelten zusätzlich |

## Bewusst öffentliche und geschützte Oberflächen

Bei fehlender oder inaktiver Freigabe bleiben serverseitig ausschließlich die
bereits öffentlichen Demo-Katalogdaten und die schmale öffentliche
Shared-Leseliste erreichbar. Bereits veröffentlichte Beiträge werden durch
eine Kontosperre nicht automatisch gelöscht oder zurückgezogen. Die lokale
Anzeigegrenze alter Frontends ist davon getrennt und am Rollout-STOP unten
ausdrücklich festgehalten.

Zusätzlich mit `active` geschützt werden:

- `kd_personal`;
- `kd_series_watch` und `kd_set_series_watch`;
- eigene `kd_shared_articles` sowie Publish-/Claim-Wege;
- eigenes `kd_ai_log`;
- authentifizierter Live-Katalog und `kd_quellen`;
- die Filmwissen-Lese-RPC.

Zielvertrag ab Phase 3: Die gesamte `ai-task`-Function einschließlich Health
und Anbieterdiagnose verlangt `active=true` und `personal_ai=true`. Die Prüfung
geschieht nach der JWT-/Accountprüfung und vor Admin-Konfiguration,
Diagnoseinhalt, Protokoll, Reservierung oder Anbieterzugriff.

Legacy-`kd_store`, `kd_owner`, `kd_key_ok` und die loginfreie Legacy-UI bleiben
vom active-Rollenvertrag getrennt. Datenmodell und Policies werden nicht
umgedeutet; lediglich die zu breiten Tabellenrechte werden auf den bestehenden
tokenfreien Vertrag verengt: anon-DML auf `kd_store`, kein Browser-Direktzugriff
auf `kd_owner`, anon-Zugriff auf `kd_key_ok` als SECURITY-DEFINER-Grenze.

## Entschieden

| Entscheidung | Begründung | Randbedingung |
|---|---|---|
| Inaktive Konten erhalten nur dieselben öffentlichen Reads wie Gäste. | Ein JWT allein darf keine Live-Katalog-, Quellen- oder Filmwissenfreigabe sein. | Öffentliche Shared-Inhalte bleiben lesbar; Schreiben und Claim sind gesperrt. |
| Demo-Matrix: privates Konto `owner`/aktiv/KI; Testkonto A `member`/aktiv/keine KI; Testkonto B `member`/inaktiv/keine KI. | Deckt Positivfall, deterministischen Betrieb ohne KI und fachlich gesperrte Authentifizierung ohne neue Konten ab. | IDs und Passwörter stehen nie in Git oder Berichten. Der Bootstrap erfolgte kontrolliert am Remote-STOP. |
| Kein allgemeines Rollenframework und keine Custom-JWT-Claims. | Eine eigene, per RLS lesbare Access-Zeile deckt den v1-Vertrag direkt ab. | Neue Rollen oder Owner-Sonderrechte brauchen einen eigenen Auftrag. |
| Nach aktivierter Durchsetzung kein Rückrollen auf auth-only. | Ein alter Function-/RLS-Stand würde die bekannte Autorisierungslücke wieder öffnen. | Im Fehlerfall KI aus, Zugriff fail-closed und Forward-Fix. |

## Geparkt

| Ansatz | Bedingung für eine Wiederaufnahme |
|---|---|
| Katalogübergreifende Beobachtungsregeln beziehungsweise Radar-Regeln | Erst nach vollständig abgenommener Rollen-v1 und privater Demo als eigener Task. |
| Aus Beobachtung automatisch eine Geschmackspräferenz ableiten | Nur nach eigenem Produkt-, Datenschutz- und Reversibilitätsvertrag; Rollen-v1 erzeugt keinerlei solche Ableitung. |

Der bestehende Serien-Watch-Pfad speichert weiterhin ausschließlich explizit
beobachtete IDs. Rollen-v1 versieht ihn nur mit derselben Access-Grenze wie
andere persönliche Daten.

## Demo-Kontomatrix

| Kontoart | Rolle | `active` | `personal_ai` |
|---|---|---:|---:|
| privates Konto | `owner` | ja | ja |
| Testkonto A | `member` | ja | nein |
| Testkonto B | `member` | nein | nein |

Vor der Durchsetzung müssen alle vorhandenen Konten eine ausdrücklich
bestätigte Zeile erhalten. Der fehlende-Zeile-Fall wird mit einer dedizierten
Testidentität vor deren finalem Bootstrap geprüft; er darf nicht als
ungeplanter Zwischenzustand eines verwendeten Produktionskontos entstehen.

## Rollout mit STOPs

### 1. Lokales Paket

1. `20260809120000_rollen_v1_access_basis.sql` und
   `20260809121000_rollen_v1_access_enforcement.sql` als getrennte Migrationen
   bauen.
2. Client, Function, RLS-Vertrag und Regressionstests lokal fertigstellen.
3. Vollständige kostenfreie Unit-, Function- und Mobile-Gates ausführen.
4. Diff, Migrationen, Zielprojekt, Kontoanzahl und Zwischenzustände vorlegen.
5. **STOP vor jedem Supabase-Write.**

### 2. Access-Basis und RLS

Nur nach ausdrücklicher Remote-Freigabe:

1. `ai_aktiv=false` setzen und unabhängig rücklesen.
2. Ausschließlich `20260809120000_rollen_v1_access_basis.sql` anwenden und
   Schema, RLS, Grants und Routinen unabhängig rücklesen. Solange beide
   Dateien pending sind, ist ein unqualifiziertes `supabase db push` verboten.
3. Vorhandene Konten über den vertrauenswürdigen Adminweg gemäß bestätigter
   Matrix bootstrappen und jede Zeile rücklesen.
4. Erst danach `20260809121000_rollen_v1_access_enforcement.sql` einzeln
   anwenden. Ihr transaktionaler Preflight verlangt weiterhin
   `ai_aktiv=false` und exakt eine Access-Zeile je vorhandenem Auth-Konto.
5. Dedizierte RLS-Testdaten für keine Zeile, inaktiv, aktiv ohne KI und aktiv
   mit KI verwenden; danach kontrolliert bereinigen und Ausgangszustand
   rücklesen.
6. KI ausgeschaltet lassen.
7. **STOP vor Function-, Push- oder Staging-Auslieferung.**

### 3. Function und Staging

Nur nach erneuter Freigabe:

1. Neue fail-closed Function ausliefern.
2. Health-/Negativmatrix ohne Anbieterrequest prüfen.
3. Frontend ausschließlich nach `staging` ausliefern und CI vollständig
   abwarten.
4. Exakten Staging-Build und das unveränderte Produktionsfrontend gegen den
   gemeinsamen Backendvertrag prüfen.
5. Erst nach grüner Autorisierungsmatrix `ai_aktiv=true` setzen und rücklesen.
6. Konto-, Tab-, Geräte- und 9b-Journeys durchführen.

Eine echte KI-Rauchprobe ist nicht Bestandteil dieses Ablaufs. Sie benötigt
einen weiteren ausdrücklichen STOP und darf nur nach `AGENTS.md` erfolgen.

## Zwischenzustände und Kompatibilität

| Zwischenzustand | Verhalten |
|---|---|
| Vor Access-Basis | bisheriger Stand; noch keine Rollenwirkung |
| Access-Basis vorhanden, Enforcement noch aus | alter Produktionsclient unverändert; Tabelle selbst ist own-read-only und sonst ohne Produktwirkung |
| Konten vollständig gebootstrappt, Enforcement aktiv, Frontend `bf82304` | vollständig aktiv gebootstrappte Konten funktionieren serverseitig weiter und erleiden keinen Lockout; mit gültigem Sitzungstoken wählt das Frontend weiterhin live; bei `active=false` liefert die Live-RLS HTTP 200 mit leerer Menge und Serverwrites bleiben gesperrt, ein bereits vorhandener lokaler Live- oder persönlicher Altcache kann aber weiter angezeigt werden; KI bleibt global aus |
| Neue Function, altes Frontend | Function erzwingt Personal-AI serverseitig; nicht freigegebene Aufrufe enden vor Diagnose, Log und Anbieter |
| Neues Staging-Frontend | Client projiziert dieselbe serverseitige Freigabe und maskiert bei Widerruf oder Access-Fehler sicher |

**STOP-Einschränkung:** Das unveränderte Produktionsfrontend `bf82304` kennt
noch keine Access-Maske für lokale persönliche Caches. Ein dediziertes
inaktives Testkonto kann dort trotz korrekt gesperrter Serverdaten und
Serverwrites bereits vorhandene lokale Altdaten sehen. Dieser Zwischenzustand
ist kein Beleg für die fertige Produktoberfläche und darf am Remote-STOP nicht
als „inaktiv sieht nur öffentliche Daten“ abgenommen werden. Erst das neue
Staging-Frontend muss die lokale Maskierung nachweisen.

## Rückweg

- Scheitert eine Migration innerhalb ihrer Transaktion, wird sie vollständig
  zurückgerollt; `ai_aktiv` bleibt aus.
- Nach der Access-Basis kann die ungenutzte additive Tabelle bestehen bleiben.
  Sie wird nicht unter Zeitdruck gelöscht.
- Nach aktiviertem Enforcement werden Policies oder Function niemals auf den
  schwächeren auth-only-Vertrag zurückgesetzt. Zugriff bleibt gesperrt und der
  Fehler wird vorwärts behoben.
- Scheitert die neue Function, bleibt KI aus. Eine alte auth-only-Function darf
  nicht mit eingeschalteter KI reaktiviert werden.
- Scheitert das Staging-Frontend, kann Staging auf den vorher belegten Commit
  zurückgestellt werden. Backend-Enforcement bleibt bestehen und KI bleibt bis
  zur erneuten Abnahme aus.
- Kein Rückweg löscht Konten, Access-Zeilen, persönliche Daten, lokale Caches,
  Cache-Owner, Epoch oder offene Sync-Warteschlangen.

## Abnahme

Kostenfreie technische Gates:

- vollständiges `npm test`;
- `npm run test:function`;
- `npm run test:mobile`;
- lokaler Schema-/Migrationsvertrag;
- nach Remote-Freigabe die erweiterte RLS-Matrix;
- `git diff --check` und exakter Build-/Commitbeleg.

Praktische Demo-Journeys:

- aktives Konto: Login, Übernahme, Sync, Logout und erneuter Login;
- aktives Konto ohne Personal-AI: deterministische App grün, Function gesperrt;
- inaktives Konto im neuen Staging-Frontend: Authentifizierung möglich,
  Remotezugriff gesperrt, lokaler Kontocache geschützt und maskiert;
- A → B → Gast ohne Datenvermischung;
- Widerruf und Access-Ausfall mit offenen Änderungen ohne Queueverlust;
- zweiter Tab und zweites Gerät mit demselben Vertrag;
- offene 9b-Praxisblöcke Backup/Restore/Undo, Ausfall-Trockenlauf und
  Function-Rollback.

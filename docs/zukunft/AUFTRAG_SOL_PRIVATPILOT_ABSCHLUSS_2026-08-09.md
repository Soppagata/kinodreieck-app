# Auftrag an GPT-5.6 Sol (xhigh): privater Abschlusskandidat nach dem Radar-Handoff

Stand der Planung: 09. August 2026. Diesen Auftrag erst verwenden, nachdem der
aktuell laufende Radar-Task seinen letzten lokalen Commit, Teststand und Handoff
gemeldet hat. Die Empfänger-Session besitzt keinen verlässlichen Chatverlauf;
diese Datei ist deshalb der vollständige Auftrag.

## Ein Satz zum Starten

> Arbeite mit GPT-5.6 Sol auf xhigh diese Datei vollständig und ohne Rückfragen bis zum bestmöglichen grünen Staging-Kandidaten ab; entscheide alle Varianten anhand der hier festgelegten sicheren Fallbacks selbst, führe alle ausdrücklich erlaubten lokalen Änderungen, Commits, Pushes, exakt begrenzten Shared-Backend-Schritte und das Staging-Deployment autonom aus, arbeite nach jedem nicht sicher ausführbaren Einzelpunkt mit dem übrigen Auftrag weiter und verändere `main` niemals.

## 1. Ziel und ehrlicher Zielzustand

Nach dem finalen Radar-Handoff sollen alle noch agentenfähig schließbaren Punkte
zu einem einzigen privaten Release-Kandidaten gebündelt werden:

1. vorhandene Radar-Arbeit übernehmen, nicht duplizieren, und nur deren echte
   Datenschutz-/Integrationslücken schließen,
2. Etappe 9a mit automatischer PWA-Abnahme und einer verwertbaren
   Android-Installationsdiagnose schließen,
3. die drei offenen 9b-Praxisproben so real wie sicher möglich durchführen,
4. Filmscan und Bloganalyse endgültig aus dem Release-Tor einordnen,
5. keine formale 9c-Kohorte starten,
6. den privaten Technikteil von Etappe 10 bauen: Dateninventar,
   Transparenztexte, Retention, Auftragsverarbeiter-Register, Selbstexport,
   Selbstlöschung, Monitoring und Supportdiagnose,
7. alles committen, auf einen `codex/`-Branch pushen, nach `staging`
   integrieren, CI und Deployment vollständig abwarten und den exakten
   Staging-Build belegen.

`main` bleibt unverändert. Am Morgen soll technisch nur noch die bewusste
`main`-Entscheidung übrig sein. Praktische oder rechtliche Belege werden nicht
erfunden: Sie stehen im Endbericht getrennt von gebaut, getestet, committed,
gepusht, remote angewandt, deployed und praktisch bestätigt.

Der autonome Lauf endet immer in genau einem Zustand:

- `STAGING_GREEN`: lokaler Branch, erlaubtes Shared Backend, `staging`, CI und
  exakter Staging-Build sind grün; nur dieser Zustand erhält eine klare
  `main`-Mergeempfehlung.
- `BRANCH_SAFE_SKIPPED`: alle sicher ausführbaren Änderungen sind lokal grün,
  committed und auf dem Featurebranch gepusht, aber mindestens ein Backend-
  oder Stagingpfad blieb fail-closed `SAFE_SKIPPED`; keine `main`-Empfehlung,
  dennoch vollständiger Endbericht ohne Rückfrage.

## 2. Verbindliche Kürzungen und Entscheidungen

Diese Entscheidungen sind Teil des Auftrags und werden nicht erneut
aufdiskutiert:

1. **Rollen-v1 ist erledigt.** Nicht neu bauen, nicht umdeuten und nicht in
   Radar- oder Etappe-10-Rollen aufblähen. Der schmale Vertrag `active` plus
   `personal_ai` bleibt fail-closed.
2. **Der letzte Radar-Handoff ist die Wahrheit.** Neuere, sauber gelieferte
   Arbeit schlägt alle in dieser Datei genannten historischen Referenzen. Nur
   nachweislich offene Lücken bearbeiten.
3. **Personen-Automatik bleibt aus.** Der Wikidata-Pflichtspike erreichte nur
   50 Prozent Recall und ist `NO_GO`. Keine andere Quelle, kein LLM und kein
   Webscraping hineinraten. Service-neutrale Typen oder manuell validierte
   Vorschauen dürfen bestehen; Provider-, Scheduler- und automatische
   Personen-Discovery bleiben technisch verriegelt.
4. **Filmscan wird nicht noch einmal als In-App-Kamera-/Uploadpfad gebaut.**
   Der vorhandene externe Foto-/Textbatch mit versioniertem Workflow,
   Vorschau, Kandidatenprüfung und expliziter Übernahme ist der dauerhafte
   Ersatz. Sol belegt die Zuordnung gegen die Filmscan-Sicherheitsziele und
   schließt nur echte kleine Vertrags-/Doku-/Testlücken.
5. **Bloganalyse verlässt das 9c- und Merge-Tor.** Sie bleibt im Zukunftsbacklog.
   Kein neuer sensibler Blogtext-, Opt-in-, Provider- oder Geschmacksprofilpfad
   in diesem Nachtlauf.
6. **Formale 9c findet jetzt nicht statt.** Das bestehende Paket bleibt als
   Option erhalten, wird aber weder gestartet noch als abgenommen bezeichnet.
7. **Etappe 10 umfasst nur den privaten Betrieb.** Öffentliche Registrierung,
   Indexierung, Warteliste, Stores, öffentliche Statusseite und öffentlicher
   Supportkanal bleiben geparkt.
8. **Geräteproben sind für diesen Merge-Kandidaten ersetzt und nicht
   blockierend.** Die
   Android-Installierbarkeit wird auf Max' Entscheidung hin angenommen und
   durch die Diagnose aus Abschnitt 6 abgesichert. Ein aktueller realer
   Android-Beleg wird nicht behauptet. Für iOS werden die bestehenden realen
   iPhone-PWA-Erfahrungen und die aktuelle WebKit-/PWA-Regression verwendet;
   auch hier keinen neuen physischen Test erfinden. Die physische
   Zweitgeräte-Probe wird verbindlich durch zwei vollständig isolierte
   Browserprofile mit feldweisem Backup-/Restore-/Undo-Vergleich ersetzt.
9. **Kein historischer Function-Downgrade.** `53aff49` / Function v26 liegt vor
   Rollen-v1 und ist kein zulässiges Rollbackziel. Recovery bedeutet
   Forward-Redeploy eines live verifizierten, sicheren post-Rollen-v1-Stands.
10. **Öffentlicher Start bleibt geparkt.** Keine Nebenarbeit daran, auch wenn
    Etappe-10-Dokumente ihn noch enthalten.

## 3. Verbindliche Quellen im Repository

Vor Änderungen vollständig lesen und gegeneinander abgleichen:

- `AGENTS.md`,
- finaler Handoff und letzter Commit des gerade abgeschlossenen Radar-Tasks,
- `docs/zukunft/AUFTRAG_ENTDECKEN_RADAR.md`,
- `docs/zukunft/PERSONEN_DISCOVERY_PFLICHTSPIKE_2026-08-09.md`,
- `docs/zukunft/RADAR_BEOBACHTUNGEN_PLAN.md`,
- `docs/zukunft/ENTSCHEIDUNGSLOG.md`,
- `docs/ETAPPE_9_ABNAHME.md`,
- `docs/ETAPPE_9B_BETRIEB.md`,
- `docs/ETAPPE_9C_BETA.md`,
- `docs/ROADMAP_TO_ONLINE.md`,
- `docs/KI_ZWISCHENPROJEKT_LEITFADEN.md`,
- `docs/FUNCTION_RELEASES.md`,
- `docs/ROLLEN_V1_BETRIEB.md`,
- `src/lib/personalDataRegistry.js`, Backup-/Restore-, Auth-, Storage- und
  Account-Treiber,
- vorhandene PWA-Flächen in `public/download/`, `public/sw.js`,
  `src/lib/installation.js` und `src/components/InstallationCard.jsx`.

Historische Orientierung, niemals ungeprüft als Startbasis verwenden:

- Rollen-v1 begann in `619826d`; der damalige lokale Staging-Stand war
  `65a92df`.
- Radar-Phase 1 wurde im damaligen Verlauf als `a52a6c4` committed; Phase 2
  lief danach weiter und muss beim Start dieser Session einen neueren finalen
  Handoff besitzen.
- `main` stand bei der Planung auf `3898152`.
- `docs/FUNCTION_RELEASES.md` enthält noch einen pre-Rollen-v1-Releasebeleg und
  ist für Recovery allein nicht ausreichend.

## 4. Harte Regeln

1. Diagnose vor Fix. Keine Vermutung als Ist-Stand ausgeben.
2. Ein fremder Dirty-Stand wird weder gestasht, resettet, überschrieben noch
   mitcommitted. Kein `git reset --hard`, kein Force-Push, kein pauschales
   `git add .`.
3. Wenn die Session bereits in einem isolierten Worktree läuft, dort bleiben.
   Sonst nach sauberem Handoff einen neuen Branch mit Präfix `codex/` am exakten
   Handoff-Commit anlegen. Kein zweiter unnötiger Worktree.
4. `main` und das Produktionsfrontend nie ändern, mergen oder pushen.
5. Bestehendes Verhalten erhalten; insbesondere Rollen-v1,
   `kd_series_watch`, Blogdaten, Shared Articles, `Beobachten`, Kino-Pins,
   Backups und Konto-/Privacy-Grenzen.
6. Provider, Radar-Scheduler, Personen-Automatik, Popularity und neue
   Hintergrundverarbeitung starten aus. Kein echter Radar-/Search-Request.
7. Keine echten KI-Tests. `npm run test:ai:live` und
   `npm run test:ai:eval` werden in diesem Auftrag nicht benötigt und deshalb
   nicht gestartet. Niemals deren Unterskripte direkt aufrufen. Bei
   geerbtem `AUTONOMIE_STOPP`, Exit 75, `BUDGET_UNBEKANNT`, Lock oder Timeout
   keine echten KI-Läufe starten; ohne Retry rein lokal mit dem übrigen Auftrag
   weiterarbeiten.
8. Secrets, Passwörter, Tokens, Service-Role-Keys, Sessiondaten und interne
   Projektzugänge nie in Code, Doku, Chat, Logs, Diagnoseexport oder Commit.
9. Externe API-/Vertragsfakten nur aus aktuellen offiziellen Primärquellen
   übernehmen und mit Abrufdatum/URL festhalten. Keine rechtliche Freigabe
   erfinden.
10. Testfehler innerhalb des vereinbarten Scopes unterbrechen den Auftrag nicht:
    Ursache diagnostizieren, eng beheben und kostenfreie Tests wiederholen.
    Nicht sicher lösbare Einzelpunkte wechseln in den festgelegten fail-closed
    Fallback; alle unabhängigen Arbeitspakete laufen weiter.
11. Batch-/Purge-Läufe sind idempotent, begrenzt, dry-run-fähig und setzen nur
    die Fehlmenge fort. Nie blind alles erneut verarbeiten.
12. Personenbezogene Rohpayloads, Prompts, vollständige Snippets, Blogtexte,
    Bilder und serverseitige Exportkopien werden nicht persistiert.

## 5. Phase 0 – Audit und autonomes Entscheideraster

Phase 0 ist read-only. Noch nichts ändern.

1. `git status`, Branch, HEAD, Worktrees, Branchgraph und lokale/remote Refs
   prüfen; Remote-Refs frisch fetchen.
2. Den finalen Radar-Handoff identifizieren und dessen Commit, Dateiliste,
   Teststand, nicht angewandte Migrationen, Flags und Restpunkte erfassen.
3. Prüfen, dass kein anderer Task mehr in diesem Checkout schreibt und dass
   jede vorhandene Änderung eindeutig zugeordnet und committed ist. Diese
   Auftragsdatei darf als absichtlich untracked vorhanden sein.
4. Aktuellen `staging`- und `main`-Stand sowie CI-/Deploymentstand read-only
   erfassen.
5. Lokale Migrationen gegen den remote Migrationsstand vergleichen, ohne etwas
   anzuwenden.
6. Den live gemeldeten Function-Build, Function-Version, KI-Not-Aus-Zustand und
   reproduzierbaren lokalen Source-Hash read-only erfassen. Keine Healthantwort
   mit unklarem Build akzeptieren.
7. Alle offenen Punkte in genau diesen Zuständen ausgeben:
   `nicht gebaut | gebaut | getestet | committed | gepusht | remote angewandt |
   CI-grün | deployed | praktisch bestätigt | bewusst geparkt | SAFE_SKIPPED`.
8. Einen Manifestbericht mit folgenden Zeilen ausgeben:

   | Grenze | Erwartung |
   |---|---|
   | Radar-Handoff | finaler Commit vorhanden und Baum sauber |
   | Rollen-v1 | vorhanden, unverändert, fail-closed |
   | Personen-Automatik | aus / nicht vorhanden |
   | Provider/Scheduler | aus |
   | `main` | unverändert |
   | Shared Backend | Zielprojekt eindeutig, Backupweg verfügbar |
   | Function | live post-Rollen-v1 reproduzierbar |
   | Migrationen | angekündigt, reviewbar, ohne Datenverlust |
   | Fremdarbeit | keine aktive oder unklare Änderung |

### Autonome Entscheidung nach dem Audit

Sol fragt Max in dieser Nacht nicht. Nach dem Manifestbericht beginnt Phase 1
immer. Bei einer Abweichung gilt ohne Rückfrage:

- fremder Dirty-Stand: nicht anfassen; bei eindeutigem finalem Radar-Commit in
  einem isolierten Worktree von genau diesem Commit weiterarbeiten, sonst vom
  frisch verifizierten `origin/staging`,
- fehlender oder nicht eindeutig erreichbarer finaler Handoff: Radar-Deltas
  `SAFE_SKIPPED` lassen, nichts davon nachbauen und vom frisch verifizierten
  `origin/staging` nur die unabhängigen 9a-/9b-/Etappe-10-Pakete bearbeiten,
- unbekanntes Remoteziel oder Schema-Drift: Remote-Write auslassen, lokal alles
  fertigstellen, committen und pushen,
- nicht reproduzierbare Function: kein Function-Deploy; alle übrigen 9b- und
  Releasepunkte fortsetzen,
- Rollenabweichung: Rollen-v1 nicht reparieren oder neu bauen; betroffenen
  Remoteweg auslassen und übrigen Scope fortsetzen,
- Datenverlust- oder Secret-Risiko: genau diesen Schritt verwerfen, sensible
  Ausgabe sanitizen und mit den unabhängigen Paketen weiterarbeiten.

Jeder Fallback wird im Endbericht belegt. Sol erschöpft vorher alle sicheren,
read-only oder vorwärtskompatiblen Alternativen, wartet aber nie auf eine
Nutzereingabe.

## 6. Phase 1 – Radar übernehmen und Datenschutzlücken schließen

Nur Deltas zum finalen Radar-Handoff bauen. Keine abgeschlossene Phase erneut
implementieren.

Pflichtvertrag des verbleibenden Radars:

- persönliche Subscription, Receipt und Share getrennt von globalem Target,
  Check, Event, Evidenz und Review,
- eigene Kontodaten per RLS; Browser sehen keine globale Service-Wahrheit,
- private-default Share, explizites Opt-in, Revoke und identity-hidden
  Kreisprojektion,
- global deduplizierte Checks; normale Konten atomar exakt zehn aktive
  Radar-Abos, Superadmin umgeht nur das Fachlimit und nie Privacy/Kosten,
- `Beobachten`, `Ins Radar` und Kino-`Pin` bleiben getrennt,
- keine stillen Geschmacks-, Kalender-, Wochenplan- oder `.ics`-Writes,
- kein bestätigtes Event ohne offizielle Quelle oder zwei wirklich
  unabhängige Publisherfamilien,
- Account A/B, Logout, Offline-Outbox, Reconciliation, Backup, Restore, Export,
  Revoke und Löschung fail-closed,
- Personenpfad und alle externen Quellen bleiben aus.

Eine vorhandene lokale Radar-Migration darf remote nur nach der Prüfung in
Phase 4 angewandt werden. Der bekannte Austausch der
`kd_personal_key_erlaubt`-Constraint ist ausschließlich als transaktionaler,
vorher/nachher rückgelesener Superset-Wechsel um `kd:radar` zulässig. Kein
anderes `DROP`, keine Datenumschreibung und keine RLS-Abschwächung.

## 7. Phase 2 – Etappe 9a und Android-Installationsdiagnose

Die bestehende PWA wird erweitert, nicht ersetzt. Manifest, Service Worker,
Scope, Start-URL, Icons, HTTPS, Offline-App-Shell, Updateweg und
`beforeinstallprompt`/`appinstalled` bleiben regressionsgetestet.

### Diagnoseprodukt

Auf der vorhandenen Installationsseite entsteht eine sichtbare Aktion
`Android-Installation prüfen` beziehungsweise bei Fehlschlag
`Diagnosebericht kopieren/herunterladen`. Der Bericht wird nur durch den Nutzer
erzeugt und nie automatisch übertragen.

Stabile Codes:

| Code | Bedeutung | Erwartete nächste Maßnahme |
|---|---|---|
| `KD-PWA-ANDROID-000` | installierbar oder bereits im Standalone-Modus | kein Fix |
| `KD-PWA-ANDROID-010` | kein sicherer HTTPS-/localhost-Kontext | Hosting/URL korrigieren |
| `KD-PWA-ANDROID-020` | Manifest nicht erreichbar oder ungültig | Response, MIME/CSP und JSON prüfen |
| `KD-PWA-ANDROID-021` | Name, Start-URL, Scope oder Display unbrauchbar | Manifestfelder korrigieren |
| `KD-PWA-ANDROID-022` | 192-/512-Icon fehlt oder ist nicht abrufbar | Iconpfad und Asset prüfen |
| `KD-PWA-ANDROID-030` | Service Worker nicht unterstützt | unterstützten Android-Browser verwenden |
| `KD-PWA-ANDROID-031` | Registrierung/Activation fehlgeschlagen | SW-URL, Scope, CSP und Fehler prüfen |
| `KD-PWA-ANDROID-032` | Seite liegt außerhalb des kontrollierten SW-Scopes | Scope/Startpfad angleichen |
| `KD-PWA-ANDROID-033` | SW ist registriert/aktiv, die Seite besitzt aber keinen Controller | kontrollierten Reload, Scope und Claim/Activation prüfen |
| `KD-PWA-ANDROID-040` | alle App-Prüfungen grün, Browser stellt aber keinen Prompt bereit | bereits installiert, Engagement/Browserberechtigung und Browsermenü prüfen; nicht als Appfehler behaupten |
| `KD-PWA-ANDROID-041` | Nutzer hat den nativen Dialog abgelehnt | erneut nur auf bewusste Nutzeraktion anbieten |
| `KD-PWA-ANDROID-042` | Prompt akzeptiert, aber kein `appinstalled`-/Standalone-Beleg beobachtet | Homescreen/Browserzustand prüfen und Bericht sichern |
| `KD-PWA-ANDROID-050` | Offline-App-Shell oder Start-URL nicht nutzbar | Precache/Fallback/Headers prüfen |
| `KD-PWA-ANDROID-060` | Cache-/Storagefähigkeit lokal nicht verfügbar | Browser-/Speicherzustand prüfen |
| `KD-PWA-ANDROID-090` | sonstiger sanitizter Clientfehler | Codepfad mit Build und Prüfschritt untersuchen |

`beforeinstallprompt` ist kein vollständiges Diagnose-API. Sein Ausbleiben kann
auch „bereits installiert“, Browserheuristik oder Geräte-/Berechtigungszustand
bedeuten. Deshalb immer beobachtete Appfehler von `040` trennen.

Der Export enthält nur:

- primären Code und alle Findings mit Schweregrad/Nächste-Maßnahme,
- Zeitpunkt, App-Build/Commit, Origin plus Pfad ohne Query/Hash,
- grobe Browserfamilie/-Hauptversion und Android-Hauptversion, soweit ohne
  Gerätekennung verfügbar,
- Capability-Booleans, Manifest-/SW-/Scope-/Offline-Prüfergebnis und
  Prompt-/Standalone-/`appinstalled`-Status.

Er enthält keine rohe User-Agent-Zeile, Geräte-ID, Modellkennung, E-Mail,
Account-ID, Token, Cookie, Local-Storage-Inhalte, Query/Hash, freien Nutztext
oder ungefilterten Stacktrace. Der Bericht entsteht flüchtig im Arbeitsspeicher
und wird nur auf bewusste Nutzeraktion kopiert/heruntergeladen; keine lokale
Berichtshistorie.

Die Serialisierung verwendet eine feste enum-/längenbegrenzte Positiv-Allowlist.
Nie ganze `Error`-, `Response`-, `Navigator`- oder Eventobjekte, rohe URLs oder
Stacks serialisieren. Negative Tests schleusen Token, Query/Hash, Stacktrace und
überlange Werte ein und müssen deren vollständige Entfernung belegen.

Die Offline-Prüfung lädt die aufgelöste Manifest-`start_url` nach einem
erfolgreichen Online-Lauf kontrolliert offline neu. Eine bloße Cache-/API-
Capability zählt nicht als bestandener Offline-Start.

Tests: reine Unit-Verträge plus `distribution_test.mjs`,
`serviceworker_test.mjs`, `pages_test.mjs` und Chromium-Mobile. Android gilt
danach als technisch geprüft und von Max risikobewusst angenommen, nicht als
real auf einem aktuellen Gerät installiert.

Aktuelle Ausgangsquellen, beim Bau erneut offiziell prüfen:

- <https://web.dev/articles/install-criteria>
- <https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event>

## 8. Phase 3 – die drei offenen 9b-Praxisproben

### 8.1 Backup, zweiter Kontext, Restore und Undo

Vor Phase 6 mit zwei vollständig isolierten Browserprofilen, synthetischer
Kontoautorität und ausschließlich lokalen Adaptern durchführen; Kontoanlage,
echter Remote-Sync und Remote-RLS folgen nur nach grünem Phase-6-Pre-Write-
Manifest:

1. definierten persönlichen Stand A mit Radar einschließen,
2. frisches Gesamtbackup erzeugen und Prüfsumme festhalten,
3. in Profil/Gerät B wiederherstellen und alle Registry-Töpfe vergleichen,
4. bewusst eine Änderung erzeugen, synchronisieren und den vorbereiteten
   Undo-/Restoreweg durchführen,
5. A/B, Remote, Backup und erneuten Export feldweise vergleichen,
6. Gast-/Konto-, Logout-, Offline- und Privacy-Lock-Verhalten belegen.

Das ist die automatisierte praktische Probe. Kein physisches Zweitgerät
behaupten.

### 8.2 Supabase-/Anbieterausfall-Trockenlauf

Keinen realen Plattformausfall erzeugen. Im Browser-/Adaptertest Requests
gezielt blockieren und kontrolliert 503, Timeout und Wiederkehr simulieren:

- keine Datenverluste oder falsche Erfolgsmeldung,
- ausstehende Änderung sichtbar und idempotent wiederaufnehmbar,
- Konto-/Privacy-Grenze bleibt geschlossen,
- Provider-/KI-/Radar-Ausfall erzeugt keinen echten Anbieterrequest,
- Circuit-/Not-Aus-Verhalten und Supportcode sind belegt.

### 8.3 Sichere Function-Recovery

Das bisher dokumentierte `53aff49`/v26 darf nicht redeployt werden. Dieser
Abschnitt bereitet Zuordnung, Plan und lokale Belege vor; der einzige erlaubte
Remote-Redeploy geschieht später im Pre-Write-Block von Phase 6. Ablauf:

1. Den aktuellen KI-Zustand nur read-only erfassen und die spätere
   Ausschaltaktion vorbereiten; vor dem grünen Phase-6-Pre-Write-Manifest keinen
   Zustandswrite ausführen.
2. Live-Health-Build, Supabase-Version und lokalen Source-SHA des tatsächlich
   sicheren post-Rollen-v1-Stands eindeutig zuordnen.
3. Fehlt diese Zuordnung trotz Git-, Health- und Release-Audit: nicht raten und
   keinen Function-Deploy ausführen; den Befund dokumentieren und mit allen
   übrigen Paketen weiterarbeiten.
4. Exakt denselben oder einen nachweislich vorwärts reparierten sicheren Stand
   aus committed Quellen als Redeploy-Paket festlegen; keine
   Rollen-/RLS-Abschwächung.
5. Das spätere Build-Metadatum darf erst nach erfolgreichem Code-Deploy gesetzt
   werden.
6. Nur kostenfreie Health-, Auth-, Rollen-, RLS- und Contractchecks ausführen;
   kein Smoke/Eval/Providerrequest.
7. Den vorgesehenen Releaseprotokoll-Eintrag mit Commit, Source-SHA,
   Function-Version, Zeit und Rückweg vorbereiten. Tatsächliche KI-/Deploy-
   Zustände werden ausschließlich in Phase 6 verändert.

## 9. Phase 4 – private Etappe 10 bauen

### 9.1 Reales Dateninventar und Transparenz

Aus Code, Migrationen und Runtime-Konfiguration eine maschinenlesbare Registry
erzeugen: Datenklasse, Zweck, Eigentümer, lokal/remote, Empfänger/Provider,
Export, Löschtrigger, Retention, Featureflag und offener Rechts-/Providerstatus.
Die App zeigt daraus eine verständliche technische Datenschutz- und
KI-Transparenzansicht.

Verantwortliche Stelle, Adresse, Rechtsgrundlage, DPA-/SCC-Akzeptanz,
Unterauftragsverarbeiter, Region und Supportkontakt niemals erfinden. Fehlende
Fakten sichtbar mit `LEGAL_OR_PROVIDER_REVIEW_REQUIRED` markieren und die
betroffene Funktion fail-closed lassen. Für jeden tatsächlich genutzten Dienst
nur aktuelle offizielle Quellen mit Abrufdatum eintragen.

Dieser Status ist ein serverseitiges Aktivierungsprädikat, nicht nur UI-Text:
Rechte, DPA/Transfer, Retention, Preis/Budget und frisches Prüfdatum müssen alle
grün sein, bevor Function oder Scheduler einen Providerrequest erreichen
können. Ein fehlender/alter/unknown Wert sperrt den Requestpfad.

### 9.2 Technischer Retention-Vertrag `0 / 7 / 30 / 90`

Das ist ein konservativer Technikdefault, keine Rechtsberatung. Kürzere
Provider-/Vertragsfristen gewinnen; unbekanntes Speicherrecht bedeutet null
Tage und Provider aus.

| Klasse | Default |
|---|---:|
| Rohpayloads, Prompts, vollständige Snippets, Bilder, serverseitige Exportkopien | 0 Tage / nie persistieren |
| lokale Restore-/Adoption-Snapshots | 7 Tage |
| Android-Diagnosebericht | 0 Tage; nur flüchtig bis manueller Export |
| terminale Operationen/Idempotenz, verwaiste Radarobjekte, Detailfehler, abgeschlossenes Supportbundle | 30 Tage |
| inhaltsfreie Run-/Kosten-/Review-/Capability-Metadaten und bestehendes `kd_ai_log` | 90 Tage |
| aktive persönliche Abos, Receipts, Präferenzen und Shares | zweckgebunden bis Revoke/Aboende/Kontolöschung, dann sofort |
| globale Radarziele/-ereignisse | solange mindestens ein wirksames Abo besteht; bei null sofort deaktivieren, nach 30 Tagen purgen |
| kontrollierte logische Dumps | höchstens 30 Tage und höchstens vier Wochenstände |

Zentrale Registry statt verstreuter Zahlen. Additive Felder wie `terminal_at`,
`orphaned_at` oder `expires_at`; service-only, begrenzte, idempotente Dry-run-
und Purge-Funktion mit Lock. Kein Browser-EXECUTE, kein Remote-Cron in diesem
Lauf. Monitoring meldet nur fällige Zählwerte ohne Payload.

Vorrang: Kontolöschung/Revoke „sofort“ überstimmt jede längere Frist. Der
30-Tage-Orphan-Purge entfernt alle Target- und Accountbezüge. 90 Tage gelten nur
für vollständig entkoppelte, inhaltsfreie Aggregate. Lokale TTLs werden bei
Boot, Lesen und Schreiben bereinigt. Ohne aktivierte Remote-Cadence lautet der
Status ehrlich `gebaut, manuell betreibbar, Scheduler SAFE_SKIPPED`.

Für kontrollierte Dumps ein minimales Löschledger bis zum Ablauf der letzten
Kopie führen, damit ein Restore gelöschte Konten nicht unbemerkt wiederbelebt;
danach Ledger und Dump fristgerecht entfernen. Tatsächliche Plattformbackups
bleiben bis zur aktuellen Anbieterprüfung
`LEGAL_OR_PROVIDER_REVIEW_REQUIRED`.

### 9.3 Vollständiger Selbstexport

Den bestehenden Gesamtbackup-/`personalDataRegistry`-Weg erweitern und
Exhaustiveness-Tests schreiben. Jede aktuelle persönliche Datenklasse,
Radar-Abos/Receipts/Shares, Profil-/KI-Ableitungen und Lösch-/Retentionstatus
muss enthalten sein. Dazu einen authentifizierten Own-Data-Endpunkt für die
eigenen Auth-/Zugangsmetadaten, inhaltsfreien persönlichen KI-Logzeilen,
Serienbeobachtungen, Shared-Claims sowie Radar-Abos/Receipts/Shares bauen; die
streng validierte Antwort wird nur clientseitig in den Export eingefügt. Ist
die sichere Remote-Aktivierung nicht möglich, Endpoint und Tests fertig bauen,
Flag aus lassen und nur diesen Praxisbeleg `SAFE_SKIPPED` markieren. Keine
serverseitige Exportkopie.

### 9.4 Selbstlöschung

Zuerst aktuelles Supabase-Verhalten anhand offizieller Doku und installierter
Version prüfen. `auth.admin.deleteUser` benötigt einen Secret-/Service-Role-Key
und darf nur serverseitig laufen. Nutzer-JWT muss serverseitig validiert werden;
der Key gelangt nie in Browser, Bundle oder Logs.

Vertrag:

1. vollständigen Export anbieten und dessen Ergebnis nicht vortäuschen,
2. frische Anmeldung/Reauth und starke, kontobezogene Bestätigung,
3. ausschließlich aktuelles Konto, keine frei übergebene Account-ID,
4. idempotenter serverseitiger Vorgang mit CSRF-/Origin-/Rate-Limit-Grenzen,
5. aus Datenregistry und aktuellem Schema eine exhaustive Liste jeder
   accountgebundenen Tabelle/Storageklasse erzeugen und für jede Zeile
   `cascade | explizite Löschung | bewusst erhalten` maschinenprüfbar festlegen;
   unbekannte oder fehlende Zuordnung hält nur Self-Delete aus,
6. Cascade und Residuen für jede Tabellen-/Storageklasse kontrollieren,
7. Auth-Nutzer erst im sicheren Ablauf löschen,
8. erst nach Serverbestätigung lokale Session und Kontocache trennen,
9. Teilfehler offen lassen und nie „gelöscht“ melden,
10. ausschließlich ein im Lauf neu angelegtes Wegwerfkonto real löschen und
   danach Residuen prüfen.

Die Funktion startet und endet hinter einem ausgeschalteten Not-Aus. Für die
Staging-Probe wird sie nur kurzlebig und ausschließlich für das neu angelegte
Wegwerfkonto freigeschaltet; nach jedem Ergebnis werden Allowlist und Flag
automatisch wieder gesperrt. Der Release-Endzustand ist immer **gebaut und bei
grüner Probe praktisch belegt, aber global aus**. Bei ausbleibender Probe Code
und UI-Vertrag fertig bauen, Flag aus lassen und nur den Praxisbeleg
`SAFE_SKIPPED` markieren.

Aktuelle Ausgangsquellen, beim Bau erneut offiziell prüfen:

- <https://supabase.com/docs/reference/javascript/auth-admin-deleteuser>
- <https://supabase.com/docs/guides/functions/auth>
- <https://supabase.com/docs/reference/javascript/auth-reauthenticate>

### 9.5 Privates Monitoring und Support

Keinen neuen Anbieter einführen. Bestehende GitHub-, Cloudflare- und
Supabase-Flächen erweitern um payloadfreie Zustände:

- Deployment-/Build-SHA und Function-Build,
- Auth/DB/Health erreichbar,
- Rollen-/Radar-/Provider-/Scheduler-/Delete-Flags,
- Budget-/Circuit-Zustand ohne bezahlten Request,
- fällige Purge-Anzahlen,
- letzter erfolgreicher kostenfreier Smoke/CI-Lauf.

Nutzerinitiierter Supportexport: Build, Zeitpunkt, stabile Fehlercodes,
Featureflags und grober Syncstatus. Keine automatische Übertragung, keine
Account-ID, Query, Inhalte oder Secrets. Fehlt ein freigegebener Supportkontakt,
nur Download/Kopieren anbieten. Incident-/Lösch-/Recovery-Runbook mit Owner,
Schweregrad, Erstmaßnahme, Beleg und Abschlussregel aktualisieren.

Betriebsminimum ohne neuen Anbieter: nach jedem Deploy vollständiger Smoke und
ein täglicher read-only GitHub-Check, je Netzwerkcheck 20 Sekunden und je Lauf
höchstens fünf Minuten. Build-/Function-SHA-Mismatch, unerreichbares Auth/DB,
unerwartet aktiver Provider/Scheduler/Delete-Schalter, unbekannter Budgetstatus
oder RLS-Modusfehler machen den Workflow rot; fällige Purges erzeugen einen
payloadfreien Warning-Count. Alarmziel ist ausschließlich der fehlgeschlagene
GitHub-Workflow. Fehlende Secrets liefern pro Check `NOT_CONFIGURED` und lassen
den übrigen Lauf weitergehen. Eine tatsächlich an den Betreiber übermittelte
Supportkopie wird nach Abschluss spätestens nach 30 Tagen gelöscht;
Nutzerdownloads liegen außerhalb der Betreiberhoheit.

### 9.6 Filmscan, Bloganalyse und 9c dokumentarisch schließen

- Filmscan-Soll gegen externen Foto-/Textbatch mappen und als **ersetzt**
  dokumentieren; die Abdeckungsmatrix prüft Poster, Ticket und Programmheft,
  Kandidatenabgleich gegen echte Katalog-/Programmdaten, Korrektur, explizite
  Bestätigung und Bildverwerfung. Nicht abgedeckte Kino-/Datum-/Zeitdetails
  werden ehrlich als kleiner Zukunftsteil geparkt; keine In-App-Bildpersistenz
  und kein neuer Uploadpfad.
- Bloganalyse als **bewusst geparkt, kein Gate** dokumentieren.
- Formale 9c als **nicht gewählt / nicht durchgeführt** erhalten.
- Stale Hinweise „Rollen-v1 folgt“ und widersprüchliche Statuszeilen anhand des
  tatsächlich gelieferten Stands korrigieren.
- Öffentlichen Startteil unverändert geparkt lassen.

## 10. Phase 5 – Reviews, vollständige lokale Gates und Paket

Nach zielnahen Tests drei unabhängige read-only Reviews parallel einsetzen:

1. Scope/Re-use/Rollen-v1/keine Doppelimplementierung,
2. Privacy/RLS/Retention/Export/Löschung/Secrets,
3. Android-PWA/9b-Function-Recovery/Release/CI.

Review-Agenten ändern keine Dateien. P0/P1-Befunde vor Auslieferung beheben und
betroffene kostenfreie Tests wiederholen.

Danach mindestens:

```text
npm ci
npm run test:entdecken-contracts
npm test
npm run test:function
KD_TEST_PORT=<frischer freier isolierter Port> npm run test:mobile
npm run check:function-release       # wenn eine Function berührt wird
git diff --check
```

Zusätzlich alle neu eingeführten Android-, Retention-, Export-, Delete-,
Monitoring-, lokalen RLS- und Migrationstests ausführen. Der kostenfreie
Remote-Befehl `npm run test:rls` sowie Kontoanlage/Live-Sync gehören
ausschließlich in Phase 6 nach dem grünen Pre-Write-Manifest. Dort aktive,
inaktive und fehlende Rollen/RLS-Modi ausführen und belegen, dass
`KD_RLS_ACCESS_MODE` den Kindprozess wirklich erreicht. Keine aktiven Ergebnisse
als Ersatz für inactive/missing verwenden.

Saubere thematische Commits; nie fremde Dateien mitnehmen. Featurebranch
pushen. Noch keine Staging- oder Backend-Anwendung, bevor das Remote-Manifest
aus Phase 6 grün ist.

Zieltests nach einer Reparatur nach Bedarf wiederholen; die komplette lokale
Suite und eine remote CI-Kette höchstens initial plus zwei reparierte
Wiederholungen. Bleibt ein Gate rot oder stimmt der Build-SHA nicht, kein
Staging-Deploy behaupten: Ursache und `SAFE_SKIPPED` festhalten, Branch sichern
und ohne Nutzerrückfrage zum vollständigen Endbericht weitergehen.

## 11. Phase 6 – begrenztes Shared Backend und Staging

Staging und Produktion teilen Supabase/Functions. Der Ein-Satz-Start autorisiert
den folgenden engen Remoteweg nur bei komplett grünem Manifest:

1. ein sanitiztes Pre-Write-Manifest ausgeben: Ziel-Fingerprint, Remote-
   Migrationsstand, jede geplante Migration mit SHA-256, Backupdatei mit
   Prüfsumme/Restore-Lesetest, Function-Commit/Source-SHA/Liveversion, aktueller
   Zustand aller KI-/Radar-/Provider-/Scheduler-/Delete-Flags sowie Anzahl und
   nicht rückrechenbare Lauf-Fingerprints der Wegwerfkonten; rohe Account-UUIDs
   bleiben ausschließlich prozessintern,
2. exaktes Projekt und aktuellen Remotezustand rücklesen,
3. frisches logisches Backup außerhalb des Repositories erstellen und prüfen,
4. vorhandene KI-/Radar-/Provider-/Scheduler-/Purge-/Delete-Zustände zuerst nur
   rücklesen; nach eindeutigem Ziel-Fingerprint neue Features default-off
   anlegen und KI für den Function-Redeploy sicher ausschalten,
5. ausschließlich committed und einzeln reviewte Migrationen anwenden,
6. erlaubt sind neue Tabellen/Felder/Indizes/RLS/RPCs und genau der in Phase 1
   beschriebene transaktionale `kd:radar`-Constraint-Superset-Wechsel,
7. nicht erlaubt sind Datenumschreibung, Löschung bestehender Daten,
   RLS-Abschwächung, Rechte auf globale Radarwahrheit, Personenmigration,
   Provider-/Scheduleraktivierung oder ein weiteres `DROP`,
8. alte Clients gegen das additive Schema prüfen,
9. erst jetzt Wegwerfkonten anlegen, die Remote-Variante von Backup/Restore/Undo
   aus 8.1 sowie `npm run test:rls` in active/inactive/missing ausführen und
   danach RLS-/Konto-A/B-/Quota-/Concurrent-/Revoke-/Delete-Gates ausschließlich
   mit diesen Konten durchführen und vollständig bereinigen,
10. sichere Function-Recovery aus 8.3, falls deren Livezuordnung eindeutig ist,
11. Self-Delete-Function zunächst flag-off deployen, ein neues Wegwerfkonto
    anlegen, serverseitig ausschließlich dessen exakte Account-ID über eine
    kurzlebige Allowlist freigeben, nur dieses Konto testen, Residuen prüfen und
    Allowlist/Flag danach automatisch wieder vollständig sperren; nie allgemein
    für bestehende Konten aktivieren und kein Cron,
12. bei jedem Teilfehler Features/KI aus lassen, eng vorwärts reparieren und
    erneut kostenfrei prüfen; ist das nicht sicher möglich, diesen Remoteschritt
    auslassen und mit dem übrigen Auftrag weiterarbeiten, niemals rückwärts auf
    schwächeren Code deployen.

Weicht ein Pre-Write-Wert ab, werden sämtliche Backendwrites `SAFE_SKIPPED`.
Neue Flags bleiben default-off; bestehende Remotezustände werden unverändert
und ehrlich protokolliert. Ein Not-Aus-Write ist nur bei eindeutigem
Ziel-Fingerprint zulässig. Frontend-Staging ist dann nur zulässig, wenn dessen
Altbackend-Kompatibilität explizit grün ist; sonst bleibt der gepushte
Featurebranch das sichere Paket.

Danach Featurebranch ohne Force-Push mit dem inzwischen frisch gefetchten
`staging` versöhnen, alle betroffenen Gates erneut ausführen, nach `staging`
pushen, GitHub Actions und Cloudflare vollständig abwarten und den exakten
Build-SHA auf der Staging-Domain read-only smoken. Unbekannte zwischenzeitliche
Staging-Änderung bedeutet Review und erneute Tests, nicht Überschreiben.

Nach jedem erfolgreichen Remote-Write Releaseprotokoll und sanitizte
Remote-Belege aktualisieren, separat committen und den Featurebranch erneut
pushen. Erst danach `staging` frisch fetchen und integrieren. Bei unbekanntem
Commit oder Konflikt keine Staging-Integration erzwingen; Featurebranch sichern
und autonom den Endbericht fertigstellen.

`main` bleibt unverändert. Keine Produktionsfrontend-Auslieferung und keine
Nachricht an Tester.

## 12. Autonome Fallback-Matrix – keine Rückfragen

Keine dieser Lagen beendet den gesamten Auftrag. Sol sichert den Befund, wählt
die angegebene konservative Entscheidung und arbeitet alle unabhängigen Pakete
weiter ab.

| Lage | Verbindliche autonome Entscheidung |
|---|---|
| weiterlaufende Fremdarbeit, unklarer Dateibesitz, Dirty-Handoff | fremde Dateien unangetastet lassen; isoliert vom letzten sauberen Commit arbeiten |
| unbekannter Branch-/Remote-/Projektstand | read-only weiter auflösen; falls weiterhin unbekannt, keine Remote-Writes, lokalen Branch fertigstellen und pushen |
| Backup vor Shared-Backend-Write fehlt oder ist ungeprüft | keinen Shared-Backend-Write; übrige lokale/Staging-Vorbereitung fortsetzen |
| unerwartete oder nicht additive Migration | nicht anwenden; nur sichere vorwärtskompatible Alternative bauen/testen, sonst Migration committed aber inaktiv lassen |
| Datenverlust-, Kontoverwechslungs-, Secret-, RLS- oder Rollenrisiko | betroffenen Pfad fail-closed auslassen, sanitizen und übrigen Scope fortsetzen |
| ungeprüfte Quelle, Personen-Automatik, Popularity, Scheduler oder echter Anbieterrequest wäre nötig | Funktion aus/geparkt lassen; niemals als live behaupten |
| `AUTONOMIE_STOPP`, Exit 75, `BUDGET_UNBEKANNT`, Live-Lock oder Timeout | keine echten KI-Läufe; lokale Mock-/Build-Arbeit ohne Retry fortsetzen |
| post-Rollen-v1-Function nicht reproduzierbar oder Downgrade droht | kein Deploy; ohne eindeutigen Ziel-Fingerprint keinen KI-Zustandswrite, vorhandenen Zustand protokollieren und übrige 9b-Punkte fortsetzen |
| Löschung eines bestehenden realen Kontos/Nutzerdatums wäre nötig | niemals ausführen; nur neues Wegwerfkonto verwenden, sonst reale Probe auslassen |
| Rechts-, Betreiber-, Kontakt-, DPA-, Transfer- oder Provider-Retentionfakt fehlt | nicht erfinden; `LEGAL_OR_PROVIDER_REVIEW_REQUIRED`, Feature aus, Technik fertig bauen |
| P0/P1-Reviewbefund nicht eng lösbar | betroffene Funktion aus/ausgelassen, übrige Findings und Pakete weiter bearbeiten |
| Handlung würde `main` oder Produktionsfrontend verändern | nicht ausführen; Staging-Kandidat und exakten späteren Mergeweg liefern |

Sol darf am Ende einen Einzelpunkt als sicher ausgelassen ausweisen, aber niemals
wegen dieses Punkts auf eine Antwort warten oder den restlichen Lauf abbrechen.

## 13. Definition of Done

Der Auftrag ist erst beendet, wenn:

1. der finale Radar-Handoff ohne Doppelbau übernommen und Rollen-v1
   unverändert belegt ist,
2. alle Radar-Privacy-, RLS-, Quota-, Backup-, Revoke-, Offline- und
   Account-A/B-Verträge des freigegebenen Eventkerns grün sind,
3. Personen-Automatik, Provider, Scheduler und Popularity aus bleiben,
4. Android-PWA-Vertrag und `KD-PWA-ANDROID-*`-Diagnose gebaut, getestet und auf
   Staging nutzbar sind,
5. die drei 9b-Proben mit ehrlichem Automations-/Remotebeleg abgeschlossen sind
   oder der jeweils sichere autonome Fallback exakt belegt ist,
6. Filmscan als externer Batch-Ersatz und Bloganalyse als Zukunft ohne
   9c-Gate konsistent dokumentiert sind,
7. keine formale 9c-Kohorte oder menschliches Feedback erfunden wurde,
8. Dateninventar, technischer Transparenztext, Provider-Privacy-Registry,
   `0/7/30/90`-Retention, Purge-Dry-run, vollständiger Selbstexport,
   Self-Delete-Vertrag, Monitoring und Supportbundle gebaut und getestet sind,
9. Self-Delete vollständig gebaut ist, nach einer möglichen grünen
   Wegwerfkonto-Probe als praktisch belegt gilt und im Release-Endzustand
   trotzdem global aus bleibt,
10. vollständige Mock-, Function-, RLS-, Mobile-, Build-, Secret- und
    Migrationstests grün sind,
11. alle eigenen Änderungen committed und auf einem `codex/`-Branch gepusht
    sind,
12. der Abschlussstatus exakt einer der beiden oben definierten Zustände ist;
    bei `STAGING_GREEN` sind die erlaubten Shared-Backend-Schritte angewandt und
    nachgeprüft, `staging` gepusht, CI grün, Deployment fertig und der exakte
    Build bestätigt; bei `BRANCH_SAFE_SKIPPED` sind diese Punkte einzeln mit
    sicherem Grund ausgelassen, neue Flags default-off und bestehende
    Remotezustände unverändert sowie ehrlich protokolliert,
13. `main`, Produktionsfrontend, bestehende echte Konten und öffentlicher Start
    unverändert sind,
14. ein Endbericht jeden Punkt getrennt als gebaut, getestet, committed,
    gepusht, remote angewandt, CI-grün, deployed, praktisch bestätigt oder
    bewusst geparkt/`SAFE_SKIPPED` ausweist.

Im Endbericht außerdem den exakten Featurebranch-/Staging-Commit, CI-Run,
Staging-Build, angewandte Migrationen, Function-Build, verbleibende Flags und
den sicheren `main`-Mergeweg nennen. Keine pauschale Aussage „alles fertig“,
wenn ein autonom ausgelassener Sicherheitsgrenzpunkt oder eine nicht erneut
reale Geräte-/Rechtsabnahme offen ist. Eine `main`-Mergeempfehlung ausschließlich
bei `STAGING_GREEN` aussprechen.

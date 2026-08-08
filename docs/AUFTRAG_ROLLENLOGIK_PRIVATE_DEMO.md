# Auftrag: Rollen-v1 für die nächste private Demo

Stand: 09.08.2026

Projekt: `/Users/max/Documents/GitHub/kinodreieck-app`

## Ziel

Baue eine minimale, serverseitig erzwungene Konto- und Berechtigungslogik für
die nächste private Demo. Frontendziel ist zunächst `staging`; das vorhandene
Supabase-Projekt und die `ai-task`-Function werden jedoch auch vom aktuellen
Produktionsfrontend verwendet. Jede Backendänderung ist deshalb eine
Produktionsänderung und braucht ihr eigenes Gate, einen Kompatibilitätsbeleg
für den aktuellen Produktionsclient sowie einen fail-closed Rückweg.

Der kleinste gewünschte Vertrag ist:

- fachliche Rollen zunächst nur `member` und `owner`. Der Rollenwert `owner`
  ist ausdrücklich nicht der lokale Cache-Besitzmarker `kd:acct:owner` und
  nicht die Legacy-Tabelle `kd_owner`; beide dürfen dafür weder umgedeutet noch
  wiederverwendet werden;
- getrennte Freigaben `active` und `personal_ai`;
- kontogebundener Remote-Speicher ist nur bei aktiver fachlicher Freigabe
  erlaubt; anonyme/Legacy-Sync-Wege werden in Phase 0 getrennt inventarisiert
  und nicht still in diesen Vertrag umgedeutet;
- fehlende, inaktive oder nicht lesbare Freigabe bedeutet fail-closed;
- Nutzer dürfen nur ihre eigene Freigabe lesen und keine Freigabe verändern;
- die KI-Function prüft `personal_ai` vor Log, Reservierung und Anbieterpfad;
- `owner` erhält in v1 keine stillen Sonderrechte. Jede zusätzliche Befugnis
  braucht einen eigenen Vertrag und Tests.

Ziel ist keine möglichst große RBAC-Plattform, sondern eine kleine belastbare
Autorisierungsgrenze, auf der die Demo-Konten sicher freigeschaltet werden
können.

## Nicht-Ziele

Nicht Teil dieses Auftrags sind:

- keine Rollen `editor` oder `admin`;
- keine Admin-Oberfläche und keine Selbstregistrierung;
- kein allgemeines RBAC-Framework und keine Custom-JWT-Claims ohne belegten
  Bedarf;
- kein Cloudflare-Access-Umbau für die statische Staging-Seite;
- keine Filmscan-, Bloganalyse-, Etappe-10- oder formale 9c-Arbeit;
- keine öffentliche Kontoanlage und keine Zugangsdatenübergabe im Repository;
- keine Änderung an `main` oder am Cloudflare-Produktionsfrontend;
- keine Shared-Supabase- oder Function-Änderung ohne eigenes Produktions-
  Backend-Gate, Altclient-Kompatibilität und Rückweg;
- kein neuer KI-Eval.

## Ausgangslage und Quellen

Die bei Erstellung verifizierte Referenz war `staging` auf `289abff`. Der
Dokumentationsabschluss danach ist ein reiner Nachfolger. Zu Beginn zählt
immer der tatsächlich verifizierte aktuelle Stand von `origin/staging`, nicht
eine starre alte SHA.

Vor jeder Arbeit vollständig lesen:

1. `AGENTS.md`;
2. `docs/AUDIT_FORTSETZUNG_2026-08-08.md`;
3. `docs/ROADMAP_TO_ONLINE.md`;
4. `docs/ETAPPE_9_PLAN.md` und `docs/ETAPPE_9_ABNAHME.md`;
5. `src/services/auth.js`, `src/lib/authDriver.js` und die zugehörigen
   Login-/Cache-/Privacy-Tests;
6. `supabase/functions/ai-task/index.ts` und Function-Tests;
7. alle persönlichen Tabellen, RLS-Policies, Migrationen und den aktuellen
   Schema-Snapshot.

Bekannte Ausgangsbefunde, die empirisch neu zu bestätigen sind:

- Nach erfolgreicher Anmeldung setzt der Client `remoteStorage` und
  `personalAi` derzeit hart auf `true`.
- Die KI-Function prüft die technische JWT-Rolle `authenticated`, aber noch
  keine fachliche Personal-AI-Freigabe.
- Persönliche Daten sind heute per `auth.uid()` kontoisoliert. Diese Isolation
  muss erhalten bleiben und bei `active=false` auch direkten API-Zugriff
  serverseitig sperren; eine bloße UI-Ausblendung genügt nicht.
- A bis E in `ETAPPE_9C_BETA.md` sind Testgruppen, keine Berechtigungsrollen.
- `kd:acct:owner` bindet einen lokalen Kontocache an eine Account-ID; `kd_owner`
  ist eine alte Datenstruktur. Keine dieser beiden Owner-Bedeutungen ist eine
  fachliche Rolle oder darf zur Rollenquelle werden.

## Harte Regeln

- Diagnose vor Änderung; Phase 0 ist vollständig read-only.
- Authentifizierung allein erteilt keine fachliche Berechtigung.
- Client-Flags und UI-Ausblendungen sind niemals die Autorisierungsgrenze.
- Fehlende, inaktive, widersprüchliche oder nicht erreichbare Freigabe wird
  abgelehnt.
- Bestehende Konto-, Owner-, Epoch-, Multi-Tab- und Privacy-Locks bleiben
  erhalten. Ein gesperrter Kontocache darf nie als Gastdaten geöffnet werden.
- Keine vorhandenen Konten, Caches oder persönlichen Daten löschen, leeren,
  umhängen oder automatisch migrieren.
- Nutzer dürfen Berechtigungen weder selbst erhöhen noch fremde Freigaben
  lesen.
- `service_role`, Passwörter, Tokens, Konto-IDs und Schlüssel bleiben aus
  Browser-Bundle, Repository, Chat und Testberichten.
- Bestehende lokale oder fremde Änderungen nicht überschreiben oder
  mitcommitten.
- Keine Supabase-Migration, Remote-Datenänderung, Kontoanlage,
  Function-Auslieferung, Push-/Staging-Auslieferung, bezahlte KI-Probe oder
  Änderung an `main` ohne den dafür bezeichneten STOP und Max' ausdrückliche
  Freigabe.
- Das geteilte Supabase-Projekt ist produktiv. Vor jedem dortigen Write müssen
  der aktuelle Produktionsclient, alle bestehenden freigegebenen Konten und
  der Rückweg nachweislich kompatibel sein.
- Für echte KI-Proben gelten `AGENTS.md` und alle dortigen Stoppsignale
  vollständig. Kein direkter Skriptaufruf, kein Retry, kein Umgehen eines
  Locks oder Limits.

## Phase 0 — Read-only-Audit und exakter Entwurf

Noch keinen Branch anlegen, nichts ändern, nichts stagen und keine Remote-
Schreiboperation oder Auslieferung ausführen. Read-only `git fetch`, CI- und
Build-Metadaten, Function-Health ohne Anbieterpfad sowie Schema-, Policy-,
Grant- und Konfigurationsabfragen sind ausdrücklich erlaubt.

1. Branch, HEAD, Tracking und Arbeitsbaum sowie die wirklich ausgelieferten
   Staging- und Produktionscommits, Function-Buildversion und Remote-
   Migrationsstand feststellen. Genannte SHAs sind nur Erstellungsreferenzen;
   neueren kompatiblen Vorwärtsfortschritt verifizieren und übernehmen, nicht
   als Abweichung stoppen.
2. Login, Refresh, Logout, Kontoübernahme, Kontowechsel, Offlinezustand,
   Multi-Tab und Privacy-Recovery samt Tests erfassen.
3. Alle Stellen inventarisieren, an denen `remoteStorage`, `personalAi` oder
   vergleichbare Capabilities entstehen oder verbraucht werden.
4. Alle Tabellen, Views, Grants, Policies, RPCs und SECURITY-DEFINER-Funktionen
   inventarisieren, die `authenticated` heute verwenden darf. Jede Oberfläche
   klassifizieren: bei `active=false` zu sperren oder bewusst öffentlich/
   weiterhin lesbar. Das umfasst mindestens persönliche Tabellen,
   `kd_catalog`, `kd_quellen`, Filmwissen, eigenes KI-Log sowie Shared-Publish-
   und Claim-Wege. Zusätzlich anonyme/Legacy-Wege über `kd_store`, `kd_owner`,
   `kd_key_ok` und `src/legacy/SupabaseSyncEinstellungen.jsx` als getrennt,
   eingefroren oder abzubauen klassifizieren. Für jeden Pfad belegen, ob
   fehlende/inaktive Freigabe direkten Zugriff tatsächlich sperrt oder warum
   er bewusst außerhalb des neuen Kontovertrags liegt.
5. Die KI-Function bis zum ersten Log-, Budget-, Reservierungs- und
   Anbieterzugriff verfolgen und den frühestmöglichen fachlichen
   Autorisierungscheck bestimmen.
6. Ein minimales Schema entwerfen, bevorzugt eine autoritative Tabelle wie
   `kd_account_access`: UUID-Primär-/Fremdschlüssel auf `auth.users` mit bewusst
   gewähltem Löschverhalten, eingeschränkter Rollenwert, `active` und
   `personal_ai` als `NOT NULL DEFAULT false`, Invariante
   `personal_ai => active` und Auditzeitstempel. Feldnamen und Constraints sind
   aus dem realen Schema abzuleiten, nicht aus diesem Vorschlag blind zu
   übernehmen. Keine Bootstrap-UUIDs in Git.
7. RLS und Rechte für die Freigabetabelle entwerfen: `anon`/`public` explizit
   entziehen, eigener Datensatz read-only, Fremdlesen und sämtliche
   Browser-Schreibwege verboten; Verwaltung nur über einen vertrauenswürdigen
   serverseitigen/Admin-Weg. Hilfsfunktionen bekommen festen `search_path` und
   enges `EXECUTE`; Default Privileges dürfen keinen neuen Schreib- oder
   Umgehungspfad öffnen.
8. Die Zustandsmatrix vollständig festlegen:
   - keine Freigabe;
   - `active=false`;
   - `active=true`, `personal_ai=false`;
   - `active=true`, `personal_ai=true`;
   - Freigabequelle nicht erreichbar;
   - `member` und `owner`.
9. Einen gestaffelten Rollout ohne Aussperrfenster planen: additive Grundlage,
   sichere Bootstrap-Reihenfolge für ausdrücklich bestätigte bestehende
   Konten, RLS-/Function-Durchsetzung, Clientprojektion und Rückweg. Keine
   echten IDs oder Freigabezeilen in Git schreiben.
10. Jeden SECURITY-DEFINER-/RPC-Weg, insbesondere Shared-Claim/Publish,
    ausdrücklich gegen fehlende/inaktive Freigabe prüfen. Ein bloßes
    `auth.uid()` genügt für fachliche Autorisierung nicht.
11. Den zu Taskbeginn tatsächlich ausgelieferten Produktionsclient gegen jeden
    geplanten Zwischenzustand prüfen. Function und RLS dürfen ihn weder
    unkontrolliert aussperren noch einen auth-only Zugriff offen lassen.
12. Für KI den verbindlichen fail-closed Rollout planen: `ai_aktiv=false` vor
    jeder durchsetzenden Änderung und über alle STOPs hinweg, danach neue
    Function vor dem neuen Frontend. Ein Rollback darf nie auf die bekannte
    auth-only Autorisierung zurücköffnen; im Zweifel KI aus und Forward-Fix.
13. Prüfen, ob direkte serverseitige Abfragen genügen. Custom-JWT-Claims nur
    vorschlagen, wenn ein konkreter nicht anders lösbarer Bedarf belegt ist.

Ausgabe als kompakte Tabelle:

| Befund/Codebeleg | Sollverhalten | Risiko | geplante Änderung | Test |
|---|---|---|---|---|

Danach zusätzlich vorlegen:

- exaktes vorgeschlagenes Schema und alle betroffenen RLS-Policies;
- Migrations- und Bootstrap-Reihenfolge mit Rollback;
- betroffene Dateien und Tests;
- eine accountweise Owner-Entscheidungsmatrix ohne IDs im Bericht: aktiv ja/nein,
  `member`/`owner` und Personal-AI ja/nein;
- die Produktentscheidung, welche `authenticated`-Katalog-/Filmwissenpfade bei
  inaktivem Konto lesbar bleiben. Neue Shared-Publish-/Claim-Operationen müssen
  bei inaktiv immer gesperrt sein; zu entscheiden ist nur, ob bereits
  veröffentlichte Inhalte öffentlich lesbar bleiben oder administrativ
  widerrufen werden.

**Dann STOP und auf Freigabe warten.**

## Phase 1 — Lokale Umsetzung

Nur nach ausdrücklicher Freigabe von Phase 0:

1. Vom dann bestätigten `origin/staging` einen Branch
   `codex/rollenlogik-private-demo` anlegen.
2. Freigegebene additive Migration(en), Schema-Snapshot und Tests lokal
   umsetzen, aber remote noch nichts anwenden.
3. Freigabetabelle fail-closed absichern: eigenes Lesen ja, Selbst-/Fremdwrite
   und Fremdlesen nein.
4. Alle in Phase 0 als fachlich geschützt klassifizierten RLS-, Grant-, View-,
   RPC- und SECURITY-DEFINER-Pfade so erweitern, dass Account-ID-Isolation
   erhalten bleibt und fehlende/inaktive Freigabe direkten Serverzugriff
   sperrt. Bewusst öffentliche Reads bleiben davon klar getrennt.
5. Hart codierte Client-Capabilities durch die bestätigte serverseitige
   Projektion ersetzen. Ladefehler oder fehlende Zeile ergeben `false`, niemals
   optimistische Freigabe. `remoteStorage=false` oder unbekannt muss
   `prepare`, `confirm`, Pull, Flush, Adoption und accountgebundene
   Shared-Writes wirklich sperren; nur Flags umzubenennen genügt nicht.
   Wechselt ein bereits aktiver Client auf `active=false` oder unbekannt, wird
   der Remote-Driver sofort ohne weiteren Flush deaktiviert beziehungsweise
   sicher maskiert. Offene lokale Queue-Einträge, Owner und Epoch bleiben
   erhalten, werden weder verworfen noch als Gast geöffnet und dürfen nach
   kontrollierter Reaktivierung fortgesetzt werden.
6. Die KI-Function direkt nach Token-/Accountprüfung um die fachliche
   Freigabe erweitern. Ablehnung muss vor Diagnoseinhalt, Nutzungslog,
   Kostenreservierung und Anbieterrequest erfolgen.
7. Login, Refresh, Logout, Konto-/Gastwechsel, Offline- und Privacy-Lock ohne
   Abschwächung erhalten.

Pflichttests mindestens:

- fehlende und inaktive Freigabe werden serverseitig abgelehnt;
- `personal_ai=false` ergibt Client-Capability `false` und Function-Ablehnung
  vor jedem Kostenpfad;
- erlaubter Mock-Pfad bleibt grün;
- kein Selbst-/Fremdschreiben an Freigaben und kein Fremdlesen;
- direkter persönlicher Tabellenzugriff bei `active=false` scheitert;
- Account A/B, Gast, Refresh, Logout, Cache-Epoch und Multi-Tab bleiben
  isoliert;
- verspätete Freigabeantwort von A nach Wechsel/Logout schaltet weder B noch
  Gast frei; Widerruf/Refresh lädt Capabilities neu;
- Widerruf und Access-Timeout während `account-ready`, jeweils mit offenen
  Änderungen und in mehreren Tabs, stoppen jeden neuen Sync ohne Datenverlust;
- fehlend/inaktiv sperrt jede in Phase 0 klassifizierte Oberfläche, auch RPCs;
- Function-Matrix für Health, Anbietermodelle und zahlende Tasks endet bei
  fehlend/inaktiv/Personal-AI-aus ohne Providercall;
- `npm test`;
- `npm run test:function`;
- `npm run test:mobile`;
- `git diff --check`.

## STOP vor Supabase-Änderungen

Vor jeder Remote-Migration oder Bootstrap-Änderung vorlegen:

- exakte Migration(en) und Rückweg;
- exaktes Zielprojekt;
- lokaler vollständiger Teststand;
- Zahl und Art betroffener bestehender Konten ohne IDs oder Secrets im Bericht;
- sichere Bootstrap-Reihenfolge ohne Aussperrfenster;
- erwartetes Verhalten in jedem Zwischenzustand;
- Kompatibilitätsbeleg für den zu diesem Zeitpunkt tatsächlich ausgelieferten
  Produktionsclient;
- KI-Not-Aus-/Function-Reihenfolge ohne auth-only Zwischenfenster.

**Dann STOP und auf Freigabe warten.**

## Phase 2 — Remote-Migration und RLS-Beleg

Nur nach ausdrücklicher Freigabe:

1. Vor jeder durchsetzenden Änderung `ai_aktiv=false` setzen und unabhängig
   rücklesen. Die KI bleibt über den folgenden STOP hinweg ausgeschaltet, bis
   die neue Function samt Autorisierungsbelegen verifiziert ist.
2. Additive Grundlage kontrolliert anwenden und unabhängig rücklesen.
3. Freigaben ausschließlich für die von Max bestätigten bestehenden Konten
   über den vertrauenswürdigen Weg setzen.
4. Durchsetzende RLS-Änderung erst anwenden, wenn der Bootstrap vollständig
   rückgelesen und der Rückweg bereit ist.
5. Den erweiterten `npm run test:rls`-Lauf ausschließlich mit dedizierten
   Wegwerfkonten/-zeilen gegen den vorher rückgelesenen Target-Fingerprint
   ausführen, einschließlich aktiv,
   inaktiv, kein Zugriff, kein Selbstwrite, kein Fremdlesen und aller in Phase 0
   klassifizierten RPC-/SECURITY-DEFINER-Pfade. Dieser Remote-Lauf ist nicht in
   `npm test` enthalten. Bestehende Demo-/Produktionskonten nicht mutieren;
   Testdaten danach kontrolliert bereinigen und den Ausgangszustand rücklesen.
6. Noch keinen Anbieterrequest starten und KI nicht wieder einschalten.

## STOP vor Function-/Staging-Auslieferung

Vor Push, Function-Deploy oder Staging-Auslieferung vorlegen:

- Branch und Commit;
- vollständigen Diff- und Teststand;
- bestätigten Remote-Migrations- und RLS-Stand;
- Reihenfolge für Function, Frontend und Rollback;
- belegte Kompatibilität des unveränderten Produktionsfrontends;
- Positiv-/Negativfälle und bekannte Einschränkungen.

**Dann STOP und auf Freigabe warten.**

## Phase 3 — Staging und Demo-Journeys

Nur nach ausdrücklicher Freigabe die geteilte Function und das neue Frontend in
der bestätigten Reihenfolge liefern: fail-closed Backend/Function zuerst,
danach Frontend nur nach `staging`. CI vollständig abwarten, den exakten
Staging-Commit per Build-Metadaten prüfen und das unveränderte
Produktionsfrontend gegen den geteilten Backendvertrag gegenprüfen. Vor dem
Wiederanschalten der KI müssen Function-Health und Buildversion exakt dem
freigegebenen Commit entsprechen; Remote-Autorisierungstests für erlaubt,
fehlend/inaktiv und `personal_ai=false` müssen ohne Anbieterpfad grün sein.
Erst danach darf `ai_aktiv=true` gesetzt und rückgelesen werden.

Danach mindestens:

- erlaubtes Konto: Login, Übernahme, Sync, Logout und erneuter Login;
- gesperrtes Konto: technische Auth kann gelingen, fachlicher Remotezugriff
  bleibt gesperrt und lokale Privatdaten bleiben geschützt;
- erlaubtes Konto ohne Personal-AI: deterministische App funktioniert, KI
  bleibt gesperrt;
- Kontowechsel A → B und Gast vermischen keine Daten;
- zweiter Tab und zweites Gerät halten den gleichen Vertrag.

## Optionaler STOP vor einer echten KI-Rauchprobe

Eine bezahlte Rauchprobe ist kein Automatismus. Falls der neue
Function-Autorisierungspfad nach Mock-, RLS- und Remote-Health-Tests noch eine
echte Anbieterprobe braucht, zuerst Begründung, aktuellen messbaren
Budgetstatus, Request-Obergrenze und den exakten erlaubten npm-Befehl vorlegen.

**Dann STOP und auf ausdrückliche Freigabe warten.**

Die Owner-Freigabe vom 08.08.2026 für den Budget-Override galt nur für den
damaligen finalen Audit und wird nicht fortgeschrieben. Nach einer neuen,
ausdrücklichen Freigabe höchstens ein serieller Lauf über
`npm run test:ai:live -- --owner-approved-server-budget`. Kein Retry und kein
Eval. Bei Exit 75, `AUTONOMIE_STOPP`, `BUDGET_UNBEKANNT`, Timeout oder Lock
sofort alle echten KI-Tests beenden und den Stand melden.

## Abschluss-STOP

Das Staging-Paket muss enthalten:

- Commit, Migrationen und Rollback;
- CI-, Unit-, Function-, Mobile- und RLS-Belege;
- erlaubte und verweigerte reale Journey;
- ausdrücklich, ob eine bezahlte Rauchprobe stattfand;
- bekannte Grenzen und den verbleibenden kombinierten 9b-/Geräteblock;
- sichere Demo-Konto-Übergabe ohne IDs, Passwörter oder Secrets im Dokument.

`main` und das Cloudflare-Produktionsfrontend bleiben unverändert. Das geteilte
produktive Supabase-Backend darf nur innerhalb des eigens freigegebenen Gates
geändert worden sein. Ein Merge, Frontend-Produktionsdeploy oder Versand der
Demo braucht danach eine eigene ausdrückliche Freigabe mit Zielcommit und
Rückweg.

**Dann STOP und auf Freigabe warten.**

## Definition of Done

1. Authentifizierung und fachliche Freigabe sind getrennt.
2. Keine Capability wird nach Login hart auf `true` gesetzt.
3. Fehlende/inaktive Freigabe sperrt persönliche Serverdaten fail-closed.
4. `personal_ai=false` wird im Client und in der Function serverseitig
   erzwungen; Ablehnung erfolgt vor jedem Kosten- oder Anbieterpfad.
5. Nutzer können Freigaben weder erhöhen noch fremde lesen.
6. Login-, Cache-, Multi-Tab-, Kontowechsel- und Privacy-Schutz bleiben
   erhalten.
7. Alle kostenfreien lokalen und Remote-Gates sind grün.
8. Staging liefert exakt den belegten Commit und Positiv-/Negativ-Journeys.
9. Rollback und Demo-Übergabe sind dokumentiert.
10. `main` und das Cloudflare-Produktionsfrontend wurden nicht verändert; jede
    Änderung am geteilten Supabase-Backend ist freigegeben, rückrollbar und für
    den aktuellen Produktionsclient kompatibel belegt.

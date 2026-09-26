# Kinodreieck-API: Etappenplan und Masterchat-Übergabe

Stand: 26.09.2026. Status: **Lokale Umsetzung gestartet; Foundation wird gebaut.**
Der ausführende Meister arbeitet in einem eigenen Integrationsworktree.
Neue Endpunkte, Migrationen, Keys und Deployments sind erst durch die jeweils
zugeordneten Lieferbelege umgesetzt beziehungsweise freigeschaltet.

Produktgrundlage ist der
[API-v1-Entwurf](KINODREIECK_API_V1_ENTWURF_2026-09-26.md).
Er beschreibt die entschiedenen Funktionen und Rechte. Dieses Dokument
besitzt den Etappenablauf und das einzige Masterregister für den API-Bau.

Arbeitsablauf: ausschließlich
[kinodreieck-etappen-orchestrierung](/Users/max/.agents/skills/kinodreieck-etappen-orchestrierung/SKILL.md)
mit der
[Meister-Referenz](/Users/max/.agents/skills/kinodreieck-etappen-orchestrierung/references/meister-ablauf.md).
Keine zusätzlichen allgemeinen Prüf-, Release-, Kontext- oder Handoff-Skills.
Passende Fachskills kommen erst bei der jeweiligen tatsächlichen Arbeit hinzu.

**Verbindliche Präzisierung durch den Nutzer vom 26.09.2026:** Baumeister
kontrollieren ihren fertig gebauten/geschriebenen Paketstand genau einmal.
Masterchats kontrollieren ausschließlich dessen Verbindungen zur Basis und
zu den anderen Paketen. Der Gesamtlauf über alle neu gebauten Wege gehört
ausschließlich in die letzte API-Etappe 6. Diese aufgabenspezifische Vorgabe
hat Vorrang vor weiter gefassten Prüfaufträgen im Orchestrierungsskill und
wird unverändert in jeden Baumeister- und Folgeauftrag übernommen.

## 1. Ziel und feststehende Entscheidungen

Nach den Etappen 1–6 gibt es eine dokumentierte, geschützte KD-API mit
benutzbaren Assistentenwerkzeugen und zwei getrennten Zugängen:

- Der persönliche Owner-Assistent darf die erlaubten Nutzerfunktionen,
  KD-KI-Recherche sowie Backenddiagnose, Nutzung und Requestzahlen bedienen.
- Der fremde Member-Assistent darf die eigenen erlaubten Nutzerfunktionen
  lesen und schreiben. Er erhält weder KD-KI noch eigene oder globale
  Diagnose-/Nutzungszahlen. Dies gilt auch für indirekte KI-Folgeaktionen.
- Beide dürfen Filme/Serien auswählen und die Auswahl als Titelliste oder
  JSON ausgeben. Es entsteht keine neue Verwaltung gespeicherter Sammlungen.
- Die normale App behält ihre Produktrechte. Ein Member-Assistent erhält
  durch seinen API-Key keine eventuell vorhandenen manuellen KI-Rechte des Kontos.
- Der spätere Apple-Client soll dieselben Fachverträge verwenden können.
  Seine lokale Modell-/Werkzeuganbindung wird jetzt vorbereitet und in
  einem separaten späteren Apple-Auftrag tatsächlich gebaut.

Die Produktfragen sind entschieden. Sie werden im neuen Masterchat nicht
erneut gestellt. Routineentscheidungen wie Modulnamen und Fehlercode-Namen
trifft der Bau innerhalb dieser Vorgaben. Änderungen an Nutzerweg, Rechten
oder Funktionsumfang werden vorher konkret begründet.

## 2. Etappen nach Plattform

| Etappe | Plattform | Ergebnis für den Nutzer |
|---|---|---|
| **1** | **App-Code / Repository** | Bestehende KD-Aktionen, Auswahl und Export erhalten einen stabilen, dokumentierten Vertrag, den App und Assistenten gemeinsam verwenden können. |
| **2** | **Supabase: Datenbank und Rechte** | Getrennte, widerrufbare Owner-/Member-Zugänge; sichere Kontobindung, atomare Änderungen und verlässliche Vorgangsstände. |
| **3** | **Supabase Edge Functions** | Die eigentlichen HTTP-Endpunkte führen Nutzeraktionen, persönliche KI-Aufträge und geschützte Diagnoseabfragen aus. |
| **4** | **Assistenten / Tool-Anbindung** | Eine installierbare Referenzanbindung bietet jedem Assistenten genau seine erlaubten KD-Werkzeuge an. |
| **5** | **GitHub Actions / Cloudflare** | Automatische Prüfung und eine reproduzierbare, gezielte Auslieferung von API und gegebenenfalls PWA sind vorbereitet. |
| **6, letzte API-Etappe** | **Gesamtsystem / Freischaltung / Abnahme** | Ein Gesamtlauf prüft alle neu gebauten Wege am integrierten Kandidaten. Danach folgen autorisierte Freischaltung und gezielter Nachweis der realen Owner-/Member-Zugänge. |
| **Später, eigener Auftrag** | **Apple / SwiftUI / lokales iPhone-Modell** | Die native App kann über lokale Werkzeuge bedient werden und synchronisiert Änderungen bei Verbindung mit derselben API. |

Die Nummern erklären die Plattformen. Der Bau darf unabhängige Teile nach
dem gemeinsamen Vertrag parallel ausführen; die konkrete Welle steht unten.

**Plattformzuordnung:** Supabase Edge Functions beherbergen die API-Logik.
GitHub Actions automatisiert Tests und Auslieferung. Cloudflare Pages bleibt
der vorhandene Web-/PWA-Host. Eine zusätzliche Cloudflare Function oder ein
neuer Worker ist für den beschriebenen Grundaufbau nicht erforderlich.
Eine eigene API-Domain bleibt optional; der Client verwendet eine
konfigurierbare Basisadresse. Diese Zuordnung folgt dem vorhandenen Stack
und den offiziellen Beschreibungen von
[Supabase](https://supabase.com/docs/guides/functions),
[GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions)
und [Cloudflare Pages](https://developers.cloudflare.com/pages/).

## 3. Kurzer Einstieg des neuen Meisters

Der Start ist eine begrenzte Bestandsaufnahme, keine eigene Audit-Etappe.

1. `AGENTS.md`, `docs/arbeitsweise/START.md`, diesen Plan und den Produktentwurf
   lesen. Branch, HEAD, Dirty-State und die benötigten aktuellen Quellpfade prüfen.
2. Eine belegte aktuelle Nicht-main-Basis und einen gemeinsamen
   Integrationsbranch mit Präfix `codex/` festlegen. Der neue API-Code entsteht
   in separaten Worktrees. Den Primärcheckout nicht bereinigen, resetten oder stashen.
3. Bei Planerstellung enthalten Primärcheckout und Dokumentation fremde
   Änderungen; beide API-Planungsdateien sind noch ungetrackt. Sie müssen
   gezielt und vollständig in den neuen Integrationsworktree übernommen
   werden. Ein neuer Worktree enthält ungetrackte Dateien nicht automatisch.
4. Relevante aktuelle App-, Schema- und Function-Verträge abgleichen. Der
   vorliegende Checkout ist keine Behauptung über Production. Im Register
   die tatsächliche Basis und später den Kandidaten nachtragen.
5. Die gemeinsame Foundation und ihre Write-Owner festlegen; dann gemäß
   Abschnitt 5 bauen lassen. Kein neuer Plan und kein zweites Statusregister.

Vor Remote-Arbeit werden Zielprojekt und tatsächliche Kopplung von Staging
und Production frisch gelesen. Ein Staging-Hostname belegt keine isolierte
Datenbank. Diese Klärung blockiert den lokalen Bau nicht.

## 4. Inhalt und Fertigkriterien der Etappen

Alle Paket-Fertigkriterien der Etappen 1–5 gehören zur einmaligen
Selbstkontrolle des zuständigen Baumeisters. Sie sind kein Auftrag an den
Meister, dieselben Dateien oder Tests nochmals zu prüfen. Die vollständige
Prüfung der verbundenen neuen Nutzerwege findet erst in Etappe 6 statt.

### Etappe 1 — App-Code und gemeinsamer Vertrag

**Ergebnis:** Jede gewünschte Nutzeraktion lässt sich eindeutig aufrufen und
liefert ein überprüfbares Ergebnis; die funktionierende App bleibt nutzbar.

- Eine kompakte Funktionszuordnung erstellen: bestehende Nutzeraktion →
  Fachoperation → API-Route → Tool → erlaubte Identität. Mediathek und Blog
  sind der Kern; die Zusage „alles, was ein Nutzer kann“ umfasst auch die
  weiteren aktiven Bereiche wie Serienfortschritt, Merkliste, Einstellungen
  und Import/Export. Fehlende Zuordnungen nicht still aus dem Ziel streichen.
- OpenAPI-Vertrag und Tool-Schemata für die in der Produktgrundlage genannten
  Routen festlegen: IDs, Eingaben, Antworten, Pagination, Fehler, Revisionen,
  Idempotenz, Jobstatus und Berechtigungen. Erforderliche Ergänzungen ergeben
  sich aus der Funktionszuordnung, nicht aus beliebigen neuen Features.
- Die notwendigen vorhandenen Fachfunktionen von DOM, Clipboard und Download
  trennen beziehungsweise über schmale Adapter verfügbar machen. Kein
  pauschaler App-Umbau und keine vorsorgliche Ablösung der Datentöpfe.
- Auswahl über stabile IDs; Text entsprechend `Titel (Jahr)` und JSON mit
  den Feldfreigaben des vorhandenen KD-Paketformats. Export erzeugt keine
  dauerhafte Sammlung. Die konkrete UI-Verbindung des JSON-Auswahlexports
  am aktuellen Checkout prüfen, statt aus dem alten Plan eine Ist-Zusage abzuleiten.
- Für iPhone und Remote-Clients dieselben fachlichen Befehle und Ergebnisse
  beschreiben; Clipboard und Dateispeicherung gehören zum jeweiligen Client.
- Die gemeinsame Persistenz-/RPC-Schnittstelle, Herkunft eines Auftrags und
  die benötigten Skript-/Dependency-Einträge vor der Parallelwelle einfrieren.

**Anschlussstellen:** `src/services/`, `src/lib/accountDriver.js`,
`src/lib/personalDataRegistry.js`, `src/lib/mediathekSelection.js`,
`src/lib/paket.js`, Mediathek-/Blog-Controller; neue API-Verträge an einem
vom Foundation-Baumeister eindeutig festgelegten Pfad.

**Fertig, wenn:** Repräsentative Medien-/Blogänderung und Auswahlexport mit
dem Vertrag ausführbar geprüft sind; bestehende Auswahl-/Sync-Semantik
erhalten bleibt; Backend und Tool-Adapter gegen eingefrorene Schnittstellen
unabhängig gebaut werden können. Benötigte Laufzeitimporte tatsächlich
prüfen, bevor Browser-/Deno-Kompatibilität behauptet wird.

### Etappe 2 — Supabase-Datenbank und Rechte

**Ergebnis:** Ein Key ist genau einem Konto und einem erlaubten
Assistentenprofil zugeordnet. Wiederholungen und parallele Änderungen sind sicher.

- Additive, gezielte Migrationen für Key-Prüfwerte, Key-Lebenszyklus,
  Berechtigungen, Vorgangs-/Idempotenzstatus und erforderliche Nutzungsmetadaten.
  Keine echten Kontodaten oder Schlüssel in Migrationen und Fixtures.
- Sichere zufällige Keys, getrennte Widerrufbarkeit/Rotation, Sperre bei
  inaktivem Konto und wirksame Herabstufung bestehender Rechte vorsehen.
  Owner-/Member-Zuordnung kommt ausschließlich vom Server.
- Opaque KD-Keys sind keine normalen Supabase-Sitzungen. Ihre Kontobindung
  muss bewusst in die Datenzugriffe überführt werden; `auth.uid()` entsteht
  nicht allein durch das Vorhandensein eines solchen Keys. Eng begrenzte
  serverseitige Operationen erhalten den geprüften Kontext. Clients dürfen
  weder einen Accountparameter noch einen privilegierten RPC-Aufruf als
  Umweg verwenden.
- Eintragsänderungen in den bestehenden Datenpaketen atomar und unter
  Versionsprüfung durchführen. PWA-Sync und API dürfen sich nicht unbemerkt
  überschreiben. Gleiche Vorgangs-ID plus gleicher Inhalt wiederholt keine
  Veröffentlichung oder Änderung; abweichender Inhalt ergibt einen Konflikt.
- Herkunft und KI-Berechtigung bis zu Hintergrundaufgaben binden. Eine
  Member-Schreibaktion darf keine neue KD-KI-Auswertung auslösen.
- Datensparsame Zähler, definierte Aufbewahrung, begrenzte Abfragen und
  konfigurierbare Request-/Exportgrenzen integrieren. Detailstatistiken sind
  auch für den eigenen Member-Account nicht lesbar.

**Anschlussstellen:** `supabase/migrations/`, bestehende `kd_personal`-,
Rollen-, Blog-, KI- und Vorgangsverträge. Konkrete neue Objektnamen gehören
zum eingefrorenen Persistenzvertrag.

**Fertig, wenn:** Lokale Datenbanktests Owner/Member, fremde Datensätze,
Widerruf, inaktive Konten, doppelte Vorgänge, Paralleländerungen und direkte
RPC-Umgehungen abdecken. Migration und Rückweg sind reviewbar; remote wurde
damit noch nichts angewandt.

### Etappe 3 — Supabase Edge Functions: die eigentliche API

**Ergebnis:** Eine HTTP-Anfrage führt genau die berechtigte KD-Aktion aus.

- Einen versionierten API-Einstieg mit Routing, Key-Prüfung, Eingabeprüfung
  und begrenzten Antworten implementieren. Die Gateway-Konfiguration für
  opaque Keys ausdrücklich prüfen: Eine neue eigene Key-Verifikation kann
  nicht voraussetzen, dass die bestehende JWT-Prüfung diese Keys akzeptiert.
  Anpassungen betreffen nur den neuen Einstieg; jeder Fachhandler verlangt
  den erfolgreich geprüften Kontext.
- Medien-/Blogoperationen, Veröffentlichung/Rücknahme und Auswahlexport an
  die vorhandene Fachlogik und die atomaren Datenbankoperationen anbinden.
- KD-KI ausschließlich dem persönlichen Assistenten anbieten. Vorhandene
  Provider-, Kosten-, Aktivierungs- und Laufzeitgrenzen wiederverwenden.
  Ein neu geprüfter Key darf nicht gegen ein breiter berechtigtes
  Nutzer-Sitzungstoken ausgegeben werden.
- KI-Auftragsstatus nach unklaren Abbrüchen abfragbar machen. Statuslesen
  erzeugt keine Recherche; Wiederholen eines Auftrags startet keinen
  weiteren Provideraufruf. Abgleich zwischen Vorgang, Ergebnis und
  Kostenreservierung muss den bestehenden KI-Pfaden entsprechen.
- Diagnose, Nutzung und Requestzahlen nur dem persönlichen Assistenten
  liefern. Vorhandene `health`-/RPC-/Schedulerpfade auf alternative
  Zugriffswege und unerlaubte Folgeaktionen prüfen und gezielt anbinden.
- Requests, logische Aufträge, Provideraufrufe, Cachetreffer und Kosten
  auseinanderhalten. Erfassungsbeginn, Zeitfenster und Datenabdeckung
  angeben; fehlende historische Werte bleiben unbekannt. Relevante bestehende
  Backendpfade mit erfassen, soweit die Gesamtzahlen sie einschließen sollen.
  Vorhandene Jobzahlen nicht als vollständige HTTP-/Providerstatistik ausgeben.
- Fehler einer normalen Member-Aktion bleiben verständlich; Antwortfelder
  enthalten keine Diagnosehistorie, Kosten- oder Verbrauchszahlen.

**Anschlussstellen:** `supabase/functions/`, `supabase/config.toml`,
`ai-task`, zuständige Blog-/Recherche-/Scheduleradapter. Gemeinsam geänderte
Backenddateien haben einen einzigen Paket-Owner.

**Fertig, wenn:** Direkte HTTP-Vertragstests den gesamten erlaubten Weg und
die Ablehnungen belegen; anonyme/memberseitige direkte und indirekte KI-
Aufrufe kostenfrei vor dem Provider enden; Erfolg auf den tatsächlichen
gespeicherten Stand beziehungsweise eine eindeutige Job-ID verweist.

### Etappe 4 — Assistentenwerkzeuge und Referenzclient

**Ergebnis:** Ein Assistent kann die KD-Funktionen ohne UI-Automation verwenden.

- Einen kleinen HTTP-Client und einen lauffähigen Referenzadapter bauen.
  Die Tool-Namen und Schemata stammen aus Etappe 1. Die Anbindung bleibt
  unabhängig vom gewählten Sprachmodell und vom noch nicht fertigen Buddy-Kern.
- Für verbreitete Assistenten ist ein kleiner MCP-Adapter ein geeigneter
  Standardvorschlag. Transport und Bibliothek werden beim Bau gegen den
  tatsächlichen Zielclient geprüft; kein eigener Assistent und keine neue
  Modellplattform werden dadurch Teil des API-Auftrags.
- Tool-Angebot anhand der tatsächlich geprüften Berechtigungen bilden.
  Member sehen Nutzeraktionen und Export; persönliche KI-/Diagnosetools
  werden nur dem dafür registrierten persönlichen Zugang angeboten.
- Schlüssel außerhalb von Prompts, Chatprotokollen und Tool-Ergebnissen
  speichern. Setup für Owner und Kollegen beschreiben, einschließlich
  Key-Austausch, Widerruf und verständlicher Fehlerbehandlung.
- Den Ablauf „Filme finden → auswählen → Text/JSON ausgeben“ sowie einen
  vollständigen Blogablauf als ausführbare Beispiele liefern. Ein fremdes
  Modell darf die Auswahl selbst begründen, ohne KD-KI zu verwenden.
- Text-/Dateiinhalt und tatsächlichen Clipboard-/Dateieffekt unterscheiden.
  Ein Export auf dem Mac ist kein Nachweis für einen Clipboard-Effekt am iPhone.

**Write-Fläche:** Ein neues, in Etappe 1 festgelegtes Integrationsverzeichnis
mit Client, Adapter, eigenen Tests und Anleitung; gemeinsame Verträge nur lesen.

**Fertig, wenn:** Der Referenzadapter in der einmaligen Paketkontrolle gegen
die Mock-API beide Rechteprofile korrekt anbietet und verwendet. Der
vollständige Weg gegen die integrierte echte API gehört in Etappe 6.
Eine konkrete LLM-/Clientprobe wird dort getrennt belegt; ein bestandener
Adaptertest behauptet sie nicht.

### Etappe 5 — GitHub Actions und Cloudflare: Auslieferung vorbereiten

**Ergebnis:** Der genaue geprüfte Kandidat kann kontrolliert ausgeliefert
und anschließend eindeutig wiedererkannt werden.

- Vorhandene CI um notwendige Vertrags-, API-, Datenbank- und Tool-Prüfungen
  ergänzen. Keine Live-Provideraufrufe im normalen CI-Pfad. Root-Skripte und
  Dependencies sind bereits in der Foundation einem Owner zugeordnet.
  Keine zusätzlichen Vollsuiten oder CI-Läufe pro Paketübergabe einführen.
  Verbindliche vorhandene CI-Prüfungen bleiben bestehen; ihre Ergebnisse
  lösen keine weitere manuelle Wiederholung derselben Prüfungen aus.
- Gezielt ausführbare Function-Deploys mit gebundener Quellversion,
  Konfiguration und Readback vorbereiten. Den bestehenden Release-Nachweis
  passend erweitern; ein PWA-Build-SHA belegt keine Function-/DB-Parität.
- Cloudflare-PWA nur ausliefern, wenn die App-Anpassungen dies erfordern.
  Die vorhandene Deploykette weiterverwenden. Keine eigene API-Domain oder
  zusätzliche Cloudflare-Laufzeit ohne konkreten Bedarf erzwingen.
- Datenbankmigrationen nicht an einen gewöhnlichen Push hängen. Die minimale
  `supabase/config.toml` beschreibt nicht das Gesamtprojekt. Ihr Verbot von
  `supabase config push` und `supabase db push` bleibt maßgeblich; den
  gezielten Schemaweg aus `supabase/migrations/LIESMICH.md` verwenden.
- Einen kurzen Ablauf für Abschalten der neuen API, Widerrufen der Keys und
  Rückkehr zur vorherigen Function-Version bereitstellen. Rücknahme einer
  Datenmutation nicht mit einem Frontend-Rollback verwechseln.

**Anschlussstellen:** `.github/workflows/deploy.yml`, gegebenenfalls ein
gezielter API-Workflow, `tools/function-release-info.mjs`,
`tools/release-compatibility.mjs`, neue API-Readback-Helfer.

**Fertig, wenn:** Die geprüften Workflows/Skripte Ziel und Version binden,
Secrets nicht ausgeben und einen sicheren deaktivierten Anfangszustand
erlauben. Vorhandene PWA-/Function-Prüfungen werden passend ergänzt und nicht
als zweite parallele Releasekette dupliziert.

### Etappe 6 — Letzte API-Etappe: Gesamtlauf, Freischaltung und Abnahme

**Ergebnis:** Alle neu gebauten Wege sind am gemeinsamen Kandidaten geprüft;
die anschließend ausgelieferte API ist mit beiden Rollen nutzbar.

**Beginn erst nach dem Bau:** Alle Pakete sind geliefert und integriert,
ihre einmaligen Selbstkontrollen liegen vor und der Meister hat nur ihre
Verbindungen geprüft. Bis hierhin gab es keinen zusätzlichen Gesamtlauf.

**Ausführung:** Ein bereits beteiligter Baumeister, vorzugsweise B1 nach
Abschluss seines Backendpakets, übernimmt den Abschlusslauf auf dem exakt
integrierten Kandidaten. Es entsteht kein zusätzlicher Review-/Kontrollchat.
Der Meister koordiniert die Etappe und übernimmt die gebundenen Ergebnisse;
er kontrolliert die Paketimplementierungen nicht erneut.

**6a — Ein gebündelter lokaler Gesamtlauf vor Freischaltung:**

- Alle neu gebauten Routen und Tool-Wege anhand der Funktionszuordnung aus
  Etappe 1 abdecken: erlaubte Nutzeraktionen, Mediathek/Blog, Auswahl/Text/JSON,
  persönliche KD-KI und Diagnose, Ablehnung für Member und Fremdkonten,
  indirekte KI-Sperren, Widerruf, Paralleländerung und doppelte Vorgänge.
- Den tatsächlichen verbundenen Weg Client/Tool → API → Datenbank/Fachlogik
  → Ergebnis prüfen. Providerwirkung zunächst mocken; einen bisher nur gegen
  Mocks geprüften Adapter nicht als echten Integrationsnachweis übernehmen.
- Notwendige vollständige Mocksuite, Function-Mocks, Build und neue
  Integrationsprüfungen in diesen einen Abschlussdurchgang bündeln. Für
  jeden Weg genau einen zuständigen Nachweis festlegen; keine zusätzlichen
  Prüfrunden nach Plattform, Paket oder Rollenwechsel anhängen.
- Fehler als enges Delta an den zuständigen Baumeister geben. Nach einer
  Korrektur nur konkret entwertete Nachweise erneuern. Ein erneuter gesamter
  Abschlusslauf braucht eine benannte Änderung, die dessen Gesamtaussage
  ungültig macht; er ist kein automatischer Neustart nach jeder Kleinigkeit.

**6b — Nach bestandenem lokalen Gesamtlauf gezielt freischalten:**
Zielprojekt und Wirkung konkret binden; Freigaben siehe Abschnitt 7.
Diese Schritte belegen die echte Zielumgebung und wiederholen nicht die
vollständige lokale Prüfsuite. Funktionale Proben liegen beim zugewiesenen
Baumeister; der Meister führt die freigegebene Lieferung aus beziehungsweise
koordiniert sie und prüft nur Ziel-, Versions- und Anschlusszuordnung.

1. Die tatsächlich betroffenen Schema-/Rechte-/Function-Änderungen am
   benannten Ziel ausführen und rücklesen. Bei gemeinsamem Backend ist das
   auch während einer Staging-Erprobung eine Shared-Wirkung.
2. Die neue API zunächst geschlossen beziehungsweise nur für die benannten
   Zugänge aktivieren. Alte normale App-Zugriffe bleiben kompatibel.
3. Owner- und Member-Zugang den bestätigten jeweiligen Konten zuordnen und
   die zwei Keys über einen geeigneten geschützten Weg ausgeben. Keine Keys
   oder privaten Konto-IDs in Git, Chat, Logs oder CI-Artefakten ablegen.
4. Mit begrenzten vereinbarten Testdaten Medien-/Blogaktionen, Auswahl und
   JSON-/Text-Export prüfen. Publication, Löschung und Cleanup sind Teil
   derselben vorher benannten Testdatenwirkung.
5. Mit dem Member-Key direkte und indirekte KI-/Diagnoseaufrufe ablehnen;
   eigener und fremder Datensatz, Widerruf und Wiederholung werden geprüft.
   Mit dem persönlichen Key Diagnose und Nutzungsansichten rücklesen.
6. Einen echten persönlichen KI-Auftrag nur bei eigener begrenzter
   Providerfreigabe über den erlaubten Testweg prüfen. Ohne diese Freigabe
   bleibt ausschließlich dieser Live-Nachweis offen; Mock-/API-Ergebnisse
   werden nicht als echte Providerprobe bezeichnet.
7. Gebauten Kandidaten, Ziel-Ref, CI, Function-Konfiguration, Schemastand und
   praktische Owner-/Member-Probe den Meilensteinen zuordnen. Für einen
   anschließend ausdrücklich beauftragten Produktionsschritt denselben
   belegten Kandidaten und die gebundene Lieferkette verwenden.

Ein Key im Referenzclient belegt dessen Funktion. Die tatsächliche Verwendung
im Assistenten des Kollegen ist erst nach einer entsprechenden Probe belegt.
Der Meister sendet dem Kollegen ohne ausdrücklichen Auftrag keine Nachricht.

### Späterer eigener Auftrag — Apple/SwiftUI und lokales iPhone-Modell

**Jetzt vorzubereiten:** Plattformneutrale Befehle, Datenschemata, Rechte,
Versions-/Konfliktregeln, Exportformate und die Trennung von Fachoperation und
lokalem Clipboard-/Dateizugriff. Dafür ist keine Apple-App erforderlich.

**Später zu bauen:** Swift-Client und native Datenhaltung, Anbindung des
App-Logins, lokale Werkzeugausführung, sichere Credential-Ablage,
Offline-Schreibstände, Synchronisation und Konfliktanzeige. Ein Modell kann
lokale Daten bearbeiten; KD-KI und aktuelle Backenddiagnose benötigen
Verbindung und die persönliche Berechtigung.

Die Integration hängt davon ab, ob das Modell innerhalb der KD-App oder in
einer anderen iPhone-App läuft. Diese iOS-Verbindung und die Fähigkeit des
gewählten Modells werden dann praktisch geprüft. Keine aktuelle Aussage
über Offline-Zuverlässigkeit, Modellqualität oder fertige native Integration.
Dieser spätere Auftrag ist kein Abschlussblocker für die API-Etappen 1–6.
Die letzte Etappe des aktuellen API-Baus bleibt Etappe 6.

## 5. Bauweise: Foundation, dann eine disjunkte Welle

**Vorgeschlagener Modus: FOUNDATION → PARALLEL_WAVE.** Plattformetappen und
Agentenpakete sind verschieden: Datenbank und Function-Code bilden wegen
ihrer engen Kopplung ein gemeinsames Backendpaket.

| Paket | Etappen / Ergebnis | Exklusive Write-Fläche | Abhängigkeit |
|---|---|---|---|
| **F0 — gemeinsame Grundlage** | E1; Fach-/API-/Tool-/Persistenzvertrag und kleinste notwendige App-Anpassungen | Gemeinsame Verträge, betroffene `src/`-Module, zugehörige App-Tests, Root-`package.json`/Lockfile und gemeinsame Laufzeitkonfiguration | Aktuelle Nicht-main-Basis |
| **B1 — Backend** | E2 + E3; Rollen, Datenoperationen, API, KI- und Diagnosesperren | Benannte neue/geänderte Supabase-Migrationen, `supabase/functions/**`, `supabase/config.toml`, eindeutig zugeordnete DB-/Function-/API-Tests | Integrierter F0-Vertrag |
| **B2 — Assistentenanbindung** | E4; Client, Tool-Adapter und Beispiele | Neues Integrationsverzeichnis samt eigenen Tests/Fixtures und Anleitung | Integrierter F0-Vertrag; arbeitet zunächst gegen dessen Mock |
| **B3 — Lieferung** | E5; CI, Versionsnachweis, Deploy-/Readback-/Rückweg | Benannte `.github/workflows/`- und `tools/`-Dateien sowie eigene Workflow-/Release-Tests | Integrierter F0-Vertrag; keine Backend-/Adapterdateien ändern |

Vor Dispatch konkretisiert der Meister die Pfade einschließlich neuer
Dateien, generierter Artefakte und sämtlicher Tests. Gemeinsame Vertrags-
und Dependency-Dateien bleiben während der Welle eingefroren. Braucht ein
Paket dort Änderungen, geht ein enges Delta an den zuständigen Owner; keine
gleichzeitigen Änderungen an Root-Skripten oder Lockfiles.

B1, B2 und B3 dürfen nur dann parallel starten, wenn sie tatsächlich keine
noch zu erzeugenden Outputs voneinander benötigen. B2 prüft seine Seite
gegen die eingefrorene API; B3 bereitet die im Vertrag benannten Befehle vor.
Live-Backend-/Client-Integration und die echte CI-Ausführung erfolgen am
gemeinsamen Kandidaten. Bei konkreter Kollision nur das betroffene Paket
verschieben; alternativ zwei Baumeister und B3 als Folgeschritt.

Alle Baumeister und der saubere Integrationsworktree starten vom selben
exakten F0-Commit. Der Meister behält Modell und Denktiefe seines Tasks;
Profile für die Baumeister erst beim Dispatch aus der Skill-Referenz lesen.
Subaufträge über die vorhandenen Multi-Agent-Werkzeuge ausführen; keine
zusätzlichen nutzereigenen Tasks ohne ausdrücklichen Auftrag erzeugen.

Baumeister liefern Paket/Basis/Commit/Dateien sowie einen kompakten Beleg
ihrer einmaligen Selbstkontrolle und die bekannte Integrationsnaht.
Der Meister integriert sequenziell **B1 → B2 → B3**. Er prüft ausschließlich
die Verbindungen zur Basis und zwischen Paketen: Imports/Exports,
Aufrufverträge, Routing, Konfiguration und Schema-/RPC-Anschlüsse. Er
kontrolliert nicht erneut die interne Fachlogik, schreibt keine parallelen
Ersatztests und führt die Pakettests nicht nochmals aus. Für eine konkrete
Integrationsnaht genügt die kleinste aussagekräftige Verbindungsprüfung.
Ein dabei gefundener fachlicher Fehler geht als enges Delta zurück an den
Paket-Owner. Keine Kartierungs-, Kontroll- oder Review-Agenten.

## 6. Einziges Masterregister

Aktuelle Basis: **`c7b4febbcbca06ef8a973156510f738d6a5739db`**, am 26.09.2026
über `git ls-remote origin refs/heads/staging refs/heads/main` frisch gelesen;
gewählte Nicht-main-Quelle: `origin/staging`. Kein Production-Paritätsnachweis.
Gemeinsamer Ziel-/Integrationsbranch: **`codex/api-master-20260926`**.
Integrationsworktree: **`/private/tmp/kd-api-master-20260926`**.
Finaler Kandidat: **noch keiner**. Remote-Lieferziel und reale Kontozuordnung
werden am reviewbaren Kandidaten gebunden.

Die zwei zuvor ungetrackten API-Planungsdateien wurden vollständig übernommen.
Der fremd veränderte Primärcheckout bleibt unberührt. Es gilt verbindlich
**FOUNDATION → PARALLEL_WAVE → E6**, Integration **B1 → B2 → B3**.

| Paket | Agent / Profil | Branch / Worktree | Basis / DELIVERED / INTEGRATED | Write-Owner und eingefrorene Anschlüsse |
|---|---|---|---|---|
| F0 | `api_f0` / Sol high; tragende Kontobindungs- und Parallelitätsverträge | `codex/api-f0-20260926` / `/private/tmp/kd-api-f0-20260926` | Basis: Dokumentationsstart auf `c7b4febb`; Bau beauftragt | `contracts/kd-api/**`, notwendige `src/**`-Adapter, zugehörige gezielte App-Tests, Root-`package.json`/Lockfile und notwendige gemeinsame Laufzeitkonfiguration. Konkretisiert alle Befehle/Dateipfade im eingefrorenen Vertrag. |
| B1 | nach F0 zu dispatchen | `codex/api-b1-20260926` / `/private/tmp/kd-api-b1-20260926` | wartet auf F0 | Neue API-Migrationen, `supabase/functions/**`, `supabase/config.toml`, `tests/kd-api/backend/**`, `tests/kd-api/db/**`, `tests/kd-api/integration/**`; nötige bestehende Backendtests ausschließlich diesem Owner. |
| B2 | nach F0 zu dispatchen | `codex/api-b2-20260926` / `/private/tmp/kd-api-b2-20260926` | wartet auf F0 | `integrations/kd-assistant/**` samt eigener Tests, Fixtures, Anleitung und gegebenenfalls eigenem Package/Lockfile; gemeinsame Verträge read-only. |
| B3 | nach F0 zu dispatchen | `codex/api-b3-20260926` / `/private/tmp/kd-api-b3-20260926` | wartet auf F0 | `.github/workflows/deploy.yml`, gezielter API-Workflow, `tools/function-release-info.mjs`, `tools/release-compatibility.mjs`, neue `tools/kd-api-*`, `tests/kd-api/release/**`, API-Lieferanleitung; keine Backend-/Adapterdateien. |
| E6 | bereits beteiligter B1 | eigener Worktree vom exakt integrierten Kandidaten | erst nach vollständiger Integration | Ein gebündelter Gesamtlauf; nur konkret entwertete Nachweise nachprüfen. |

Root-Skripte, Lockfile und `contracts/kd-api/**` gehören während der Welle F0
und bleiben eingefroren. Das Masterregister gehört ausschließlich dem Meister.
Liefergrenzen bisher: lokal gestartet; Tests / finaler Commit / Push / CI /
Deployment / praktische Owner-/Member-Verwendung **noch nicht belegt**.

| ID | Nutzerergebnis | Pakete | Status | Kandidat / Evidenz / Rest |
|---|---|---|---|---|
| API-01 | Erlaubte eigene Nutzeraktionen einschließlich Mediathek und Blog funktionieren über die API ohne Verlust bestehender App-Funktionen. | F0, B1, B2 | OFFEN | — |
| API-02 | Beide Assistenten können eine Auswahl zusammenstellen und identisch als Text oder JSON ausgeben. | F0, B1, B2 | OFFEN | — |
| API-03 | Zwei getrennte widerrufbare Zugänge binden Owner und Member sicher an Konto und Rechte. | B1, B2, E6 | OFFEN | — |
| API-04 | Nur der persönliche Assistent kann KD-KI auslösen; Kosten-/Wiederholungsgrenzen greifen auch bei Abbruch und Folgeaktionen. | B1, B2 | OFFEN | — |
| API-05 | Nur der persönliche Assistent erhält aussagekräftige Diagnose-, Nutzungs- und Requestdaten; der Member erhält keine solchen Zahlen. | B1, B2 | OFFEN | — |
| API-06 | Der geprüfte API-/Tool-Kandidat ist am gebundenen Ziel ausgeliefert und mit beiden Zugängen praktisch nutzbar; sein Vertrag ist für den späteren Apple-Client vorbereitet. | F0, B1, B2, B3, E6 | OFFEN | — |

OFFEN = Ergebnis fehlt; GEBAUT = durch die einmalige Baumeisterkontrolle
belegt; DONE = dem finalen Kandidaten und Zielbranch zugeordnet,
Gesamtlauf der letzten Etappe 6 bestanden
und das jeweilige Nutzerergebnis belegt. Liefergrenzen separat notieren:
gebaut / getestet / committed / gepusht / CI-grün / deployed / praktisch
abgenommen. Ein lokales DONE ist keine automatische Remote-Zusage.
Der Live-KI-Nachweis wird bei API-04 ausdrücklich als belegt oder offen geführt.

Nur der Meister pflegt dieses Register. Die verbindliche Wellenzuordnung
ergänzt er hier einmal um tatsächliche Basis, Agent, Branch, Worktree und
DELIVERED-/INTEGRATED-Commit; kein zweites Fortschrittsdokument.

## 7. Prüfungen und tatsächliche Wirkungsgrenzen

### Verbindliche Prüfungsteilung: bauen, einmal selbst kontrollieren, verbinden

1. **Baumeister:** Erst das zugeordnete Paket fertig bauen beziehungsweise
   schreiben. Danach **genau eine gebündelte Selbstkontrolle pro fachlich
   geändertem, lieferfähigem Paketstand**: eigener Code/Vertrag und die
   notwendigen gezielten Funktionsprüfungen. „Build“ meint diesen Paketstand,
   nicht jeden Edit, Commit oder Compileraufruf. Keine routinemäßigen
   Komplettprüfungen nach jedem Zwischenschritt. Ein konkreter Fehler darf
   natürlich gezielt untersucht und behoben werden.
2. **Masterchats:** Ausschließlich die Verbindungen des Gebauten zur Basis
   und zu anderen Paketen kontrollieren. Den einmaligen Baumeisterbeleg
   übernehmen und dem Commit zuordnen. **Verboten sind erneute Paketreviews,
   Pakettests, vollständige Fachprüfungen, Zusatz-Audits und Kontrollagenten.**
   Eine Kontrolle einer konkreten Naht darf nicht zu einem Paket-Audit wachsen.
3. **Letzte Etappe 6:** Erst nach Abschluss sämtlicher Baupakete übernimmt
   ein vorhandener Baumeister den einen Gesamtlauf über alle neuen Wege.
   Der Meister organisiert und dokumentiert dessen Ergebnis, führt aber
   keinen zweiten Gesamtlauf oder inhaltlichen Gegenreview durch.
4. **Wiederholung nur mit Ursache:** Ein Fehlschlag oder eine fachlich
   relevante Korrektur erlaubt nur die dadurch nötige Nachprüfung. Kurz
   benennen, welcher vorhandene Nachweis entwertet wurde. Unveränderte Teile
   werden nicht nochmals kontrolliert. Neuer Masterchat, Übergabe,
   Cherry-Pick ohne inhaltliche Änderung, Compaction oder reine Unsicherheit
   sind kein Wiederholungsgrund. Fehlgeschlagene Prüfungen werden nicht
   allein wegen der Einmalregel als bestanden behandelt.

Die vollständigen Suiten und der Build gehören in den einen Abschlusslauf
der letzten Etappe; außerhalb davon nur die beschriebene Paketkontrolle und
konkret notwendige Verbindungsprüfungen.
Im derzeitigen Checkout sind `npm test`, `npm run test:function` und
`npm run build:online` getrennte Befehle; die erste Suite enthält die
Function-Suite nicht. Neue Prüfbefehle ergänzt F0 gezielt. Keine zweite
Vollprüfung durch einen Zusatzskill. Verbindliche CI ist danach der
eigenständige Liefernachweis; sie wird nicht abgeschaltet, vorsorglich
mehrfach gestartet oder zum Anlass weiterer lokaler Vollprüfungen genommen.

Lokaler Bau, Mocktests, Build, Commit und Integration laufen im späteren
Bauauftrag ohne Zwischenfreigaben. In diesem Planungstask wurden weder
Shared-Mutationen noch kostenpflichtige Anbieteraufrufe freigegeben.

Der aktive Orchestrierungsskill verlangt vor diesen zwei Wirkungen:

- Abschnitt 6, Datenwirkung: „Vor der ersten benannten Shared-Datenmutation,
  Migration, Löschung oder vergleichbar schwer rückrollbaren Wirkung braucht
  der Task eine ausdrückliche Freigabe.“ Dafür erstellt der Meister zuerst
  den konkreten reviewbaren Kandidaten und bündelt Zielprojekt, Migrationen,
  Key-Zuordnung, Testdaten, nötige Sicherung, Ausführung, Readback und Cleanup
  in eine Anfrage. Die Antwort gilt für die ganze benannte Kette.
- Abschnitt 6, Kosten: „Vor dem ersten potenziell kostenpflichtigen Request
  braucht der Task eine ausdrückliche Freigabe mit Anbieter, Zweck und festem
  Kosten-/Requestlimit.“ Eine frühere Audit-Ausnahme ist keine neue
  taskweite Freigabe. Tatsächliche Tests ausschließlich über die in
  `AGENTS.md` erlaubten npm-Live-/Eval-Wege, seriell und mit allen Budgetzäunen.
  Wenn der neue API-Pfad dort noch nicht geprüft werden kann, den Testweg
  innerhalb dieses Schutzrahmens ergänzen oder den Live-Nachweis offen lassen.

Quelle dieser beiden Grenzen:
[SKILL.md, Abschnitt 6](/Users/max/.agents/skills/kinodreieck-etappen-orchestrierung/SKILL.md).
Keine Freigabe pro Einzeltest, Readback oder erneutem lokalen Commit erfinden.
Unabhängige lokale Arbeit läuft während offener Remote-Fragen weiter.

Der spätere Lieferauftrag bindet Push/CI/Deploy/Readback einmal an das
konkrete Ziel. Ein Staging-Auftrag umfasst die nötigen normalen
Auslieferungsschritte; eine nicht benannte Produktionsbeförderung wird daraus
nicht abgeleitet. Nach unklarem Ausgang einer bereits gestarteten Außenwirkung
zuerst lesen, nicht blind erneut ausführen.

## 8. Kopierfertiger Startprompt für den neuen Masterchat

```text
Nutze $kinodreieck-etappen-orchestrierung als einzigen Orchestrierungsskill.
Du bist der dauerhafte Meister für den Bau der Kinodreieck-API.

Lies zuerst AGENTS.md und docs/arbeitsweise/START.md, danach vollständig:
/Users/max/Documents/GitHub/kinodreieck-app/docs/zukunft/KINODREIECK_API_ETAPPENPLAN_2026-09-26.md
/Users/max/Documents/GitHub/kinodreieck-app/docs/zukunft/KINODREIECK_API_V1_ENTWURF_2026-09-26.md

Setze die dort beschriebenen API-Etappen 1–6 um. Etappe 6 ist ausdrücklich
die letzte Etappe mit dem Gesamtlauf über alle neu gebauten Wege und der
anschließenden Freischaltung. Apple/SwiftUI ist ein separater späterer
Auftrag; bereite jetzt nur seinen Schnittstellenvertrag vor.
Die Produktentscheidungen sind getroffen: persönlicher Assistent mit
Nutzerfunktionen, KD-KI und Diagnose; fremde Assistenten nur mit erlaubten
Nutzerfunktionen, ohne KD-KI und ohne jegliche Betriebszahlen. Beide können
die bestehende Mehrfachauswahl als Text oder JSON ausgeben. Keine neuen
gespeicherten Sammlungen. Ziel sind ein Owner- und ein Member-Zugang.

Ermittle eine aktuelle belegte Nicht-main-Basis, erhalte den fremd veränderten
Primärcheckout und übernimm die beiden gegebenenfalls ungetrackten Planungs-
dateien gezielt in deinen eigenen Integrationsworktree. Nutze das einzige
Masterregister im Etappenplan. Behalte Modell und Denktiefe dieses Tasks;
lies Baumeisterprofile erst beim tatsächlichen Dispatch aus dem Skill.

Lass die gemeinsame Foundation und danach tatsächlich disjunkte Pakete
gemäß Plan durch Baumeister in eigenen Worktrees bauen. Der Schwerpunkt
liegt auf fertiggestellten Funktionen, nicht auf vorgezogenen Prüfschleifen.

VERBINDLICHE PRÜFREGELN AUS MEINER NUTZERANWEISUNG:
Diese Regeln haben für diesen Auftrag Vorrang vor weiter gefassten
Prüfaufträgen in Skills und älteren Plänen. Gib sie jedem Baumeister und
jedem übernehmenden Masterchat unverändert weiter.

- Jeder Baumeister kontrolliert sein gebautes/geschriebenes Paket selbst:
  genau einmal gebündelt pro fachlich geändertem, fertiggestelltem Build.
  Dazu gehören sein eigener Code/Vertrag und die nötigen fokussierten Tests.
  Ein Build ist ein lieferfähiger Paketstand, nicht jeder Edit oder Commit.
  Keine wiederholten Komplettprüfungen während einzelner Bauschritte.
- Du als Master kontrollierst NUR die Verbindungen des Gebauten zur Basis
  und zu anderen Paketen: Imports/Exports, Aufrufverträge, Routing,
  Konfiguration und Schema-/RPC-Anschlüsse. Übernimm die Baumeisterbelege.
  KEINE erneute Kontrolle ihrer internen Fachlogik, KEIN Wiederholen ihrer
  Tests, KEINE parallelen Ersatztests, KEINE Zusatzreviews oder Prüfagenten.
- Vor der letzten Etappe KEIN Gesamtlauf und KEINE Prüfung aller neuen
  Nutzerwege durch den Master. Erst alle Pakete bauen und integrieren.
- Plane in der letzten Etappe 6 EINEN Gesamtlauf auf dem finalen gemeinsamen
  Kandidaten, der ALLE neu gebauten Wege samt erforderlicher Rollen-,
  Fehler- und Konfliktfälle abdeckt. Bündle vollständige Mocksuite,
  Function-Mocks, Build und Integration darin. Beauftrage dafür einen
  bereits beteiligten Baumeister; du koordinierst und übernimmst den Beleg,
  ohne einen zweiten Gesamtlauf oder Gegenreview auszuführen.
- Nach einem echten Fehler oder einer relevanten Korrektur nur die dadurch
  entwerteten Nachweise erneuern. Benenne den Grund. Unveränderte Teile,
  bloße Übergaben, neue Chats und Compaction rechtfertigen keine Wiederholung.
  Fehlgeschlagene Prüfungen müssen behoben werden; die Einmalregel macht
  sie nicht grün. Ein kompletter Wiederanlauf braucht einen konkreten Grund,
  der die Aussage des vorherigen Gesamtlaufs tatsächlich entwertet.
- Bestehende notwendige CI- und Wirkungsgrenzen bleiben bestehen. Keine
  zusätzlichen CI-Starts oder manuellen Prüfrunden aus Gewohnheit.

Beginne mit der lokalen Umsetzung und arbeite autonom bis zum reviewbaren
Lieferkandidaten. Bereite anschließend die reale Freischaltung mit zwei Keys
vor. Vor einer benannten Shared-Migration, Key-Ausgabe oder entsprechenden
Testdatenmutation bündelst du den konkreten Ziel- und Wirkungsumfang zur
taskweiten Freigabe. Ein echter kostenpflichtiger KI-Test braucht seine
eigene begrenzte Freigabe und läuft nur über den erlaubten AGENTS.md-Testweg.
Frage nicht erneut nach bereits entschiedenen Produktdetails oder nach
Routinefreigaben für lokalen Bau, Tests, Commit, Integration und Readback.

Belege lokalen Bau, Tests, Commit, Push, CI, Deployment und praktische
Owner-/Member-Verwendung getrennt. Ein offener späterer Apple-Teil oder
Live-Provider-Nachweis darf nicht als bereits erfolgreich erscheinen.
```

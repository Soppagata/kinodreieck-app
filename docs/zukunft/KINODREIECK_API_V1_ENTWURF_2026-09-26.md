# Kinodreieck-API v1: Mediathek, Blog und Assistenten

Stand: 26.09.2026, nach Präzisierung von Rechten und Listenfunktion durch den
Nutzer. Status: Produktumfang entschieden, technische Schnittstelle im Entwurf.
Die unten genannten neuen Routen, Tools und API-Keys sind
noch nicht implementiert oder ausgegeben. Die Bestandsprüfung bezieht sich
auf den lokalen Checkout, nicht auf einen verifizierten Produktionsstand.

Der [Etappenplan mit Masterchat-Startprompt](KINODREIECK_API_ETAPPENPLAN_2026-09-26.md)
regelt Baufolge, Pakete, Abnahme und das einzige Fortschrittsregister.
Dieses Dokument bleibt die Produkt- und Rechtegrundlage.

## Vom Nutzer festgelegt

- Die vorgeschlagenen Endpunkte für Mediathek-Suche, einzelne Einträge,
  Anlegen, Ändern, Blogentwürfe und Veröffentlichung gehören zum Umfang.
- Die KD-Funktionen sollen zusätzlich als Werkzeuge für Assistenten vorliegen.
- Zielgruppen sind der persönliche Assistent, die spätere Apple-App und
  weitere ausdrücklich zugelassene Personen mit eigenem Key.
- Zum Start werden mindestens zwei getrennte Zugänge gebraucht: ein
  Owner-Key und ein Member-Key für einen Kollegen.
- Der persönliche Assistent soll sämtliche freigegebenen Nutzerfunktionen,
  die KD-KI-Funktionen zur Recherche sowie Backendanalyse, Diagnose,
  Nutzungs- und Requestzahlen bedienen können.
- Fremde Assistenten dürfen ausschließlich lesen und schreiben, was der
  jeweilige Nutzer sehen und bearbeiten darf. Sie erhalten keinerlei
  KD-KI-Funktionen und keinerlei Diagnose-, Nutzungs- oder Requeststatistiken,
  auch keine eigenen. Ihr eigenes KI-Modell kann die erlaubten Daten
  selbst auswerten und die normalen Werkzeuge bedienen.
- Hauptanwendungen sind Film-/Serienmediathek, Blog und das Zusammenstellen
  von Filmlisten.
- Ein späteres kleines Modell auf dem eigenen iPhone soll die native App
  auch lokal bedienen können.
- Filmlisten entsprechen der vorhandenen Mehrfachauswahl mit Text für die
  Zwischenablage oder JSON-Datei. Diese Funktion steht auch fremden
  Assistenten offen. Neue dauerhaft gespeicherte, benannte Sammlungen sind
  ausdrücklich nicht gewünscht.

## Entschiedene Abgrenzungen

1. **Persönlicher Assistent:** Nutzerfunktionen, KD-KI und sämtliche hier
   beschriebenen Betriebs-/Diagnosefunktionen mit seinem persönlichen Zugang.
2. **Fremder Assistent:** Nur kontogebundene Nutzerfunktionen einschließlich
   Mehrfachauswahl und Text-/JSON-Export. Keine KD-KI und keine Betriebszahlen.
3. **Listen:** Flüchtige Auswahl und Ausgabe einer Titelliste beziehungsweise
   Exportdatei; keine zusätzliche Sammlungstabelle und keine `/v1/lists`-CRUD-API.

Diese drei Produktfragen sind geklärt und müssen vor der Umsetzung nicht
erneut gestellt werden. Die technische Ausgestaltung der Routen ist noch ein
Entwurf. Die Exklusivität der KI-Werkzeuge bezieht sich auf Assistentenzugänge;
eine Abschaffung bereits vorhandener manueller KI-Funktionen in der normalen
App wurde nicht beauftragt. Normale App-Anmeldung vermittelt keine neuen
Assistenten-Diagnoserechte.

## Zugänge und Rechte

Ein KD-Key gehört zu genau einem Konto und einem registrierten Zugang.
Owner/Member bezeichnen Berechtigungsprofile, keine gemeinsam genutzten
Schlüssel für alle Personen einer Rolle. Weitere Geräte oder Integrationen
können später eigene, separat widerrufbare Keys erhalten.

Wirksame Rechte ergeben sich aus dem aktiven Konto, seiner aktuellen Rolle,
dem registrierten Assistentenzugang und den ausdrücklich vergebenen
Key-Berechtigungen. Für KD-KI braucht es zusätzlich sowohl die aktuelle
KI-Freigabe des Kontos als auch die Berechtigung des persönlichen Assistenten.
Eine eventuell vorhandene manuelle KI-Freigabe eines Members wird niemals
auf dessen Assistenten-Key übertragen.
Eine Rolle oder Konto-ID im Request darf die serverseitige Zuordnung nicht
überschreiben. Ein entzogener Zugang oder eine herabgesetzte Rolle muss auch
bei bereits ausgegebenen Keys wirksam werden.

| Funktion | Persönlicher Owner-Assistent | Fremder Member-Assistent |
|---|---|---|
| Eigene Mediathek und eigene Blogtexte lesen/bearbeiten | Ja | Ja |
| Veröffentlichen/zurücknehmen, soweit für den Nutzer erlaubt | Ja | Ja |
| Freigegebene gemeinsame Katalog-/Blogdaten | Gemäß bestehenden Produktrechten | Gemäß bestehenden Produktrechten |
| Auswahl zusammenstellen, Text-/JSON-Export erzeugen | Ja | Ja |
| KD-KI-Aufträge starten oder deren Job-Werkzeuge verwenden | Mit KI-Freigabe und bestehenden Limits | Nein |
| Eigene Nutzungszahlen und Requestdiagnose | Ja | Nein |
| Globale Betriebszahlen und Backenddiagnose | Ja | Nein |
| Fremde private Mediatheken/Entwürfe | Kein allgemeines Recht allein durch Owner-Key | Nein |

„Der persönliche Assistent kann alles“ umfasst die hier beschriebenen KD-
Produktfunktionen, KD-KI und Betriebsdiagnose. Beliebige SQL-Ausführung,
Provider-Secret-Ausgabe oder ein pauschales Lesen fremder privater Inhalte
sind keine daraus abgeleiteten neuen Endpunkte.

Die neue Assistentenberechtigung wird serverseitig an die ausgestellte
Identität gebunden. Die exklusiven Rechte werden nur dem persönlichen
Assistenten erteilt; die bloße Rolle `owner` reicht als Clientnachweis nicht.
Ein frei gesetztes Feld wie `client=assistant`, ein
User-Agent oder CORS ist kein Berechtigungsnachweis. Ein Bearer-Key beweist
den Besitz des Schlüssels, nicht dass tatsächlich ein KI-Modell den Aufruf
ausgelöst hat. Exklusivität bedeutet Zugriff nur für die jeweils freigegebene
Assistentenidentität; der Key darf entsprechend nur dort hinterlegt werden.

Die eigenen KD-Keys werden zufällig erzeugt, serverseitig nur als sichere
Prüfwerte abgelegt, einmalig über einen geeigneten geschützten Weg ausgegeben
und einzeln widerrufbar/rotierbar gemacht. Sie sind keine Supabase-
`service_role`- oder Secret-Keys. Die spätere Apple-App erhält keine
eingebauten persönlichen Assistenten- oder Owner-Geheimnisse.

## Vorgeschlagene Routen und Werkzeuge

Alle Pfade sind Entwürfe. `/v1` ist der logische API-Vertrag; Hostingadresse
und die konkrete serverseitige Einbindung werden beim Bau festgelegt.
Routen und Tools verwenden dieselbe fachliche Prüfung. Die Tool-Liste eines
Members enthält ausschließlich seine erlaubten Funktionen. Die API prüft
dieselben Rechte auch bei direktem Aufruf einer nicht angebotenen Route.

| Zweck | API-Entwurf | Assistentenwerkzeug |
|---|---|---|
| Mediathek suchen/filtern | `GET /v1/library` | `library_search` |
| Eintrag lesen | `GET /v1/library/{id}` | `library_get` |
| Film/Serie hinzufügen | `POST /v1/library` | `library_add` |
| Bewertung, Status, Notiz ändern | `PATCH /v1/library/{id}` | `library_update` |
| Eigenen Eintrag entfernen | `DELETE /v1/library/{id}` | `library_remove` |
| Gewählte Einträge als Text oder JSON ausgeben | `POST /v1/library/selection/export` | `library_export_selection` |
| Blogentwürfe auflisten/lesen | `GET /v1/blog-drafts`, `GET /v1/blog-drafts/{id}` | `blog_drafts_list`, `blog_draft_get` |
| Blogentwurf anlegen/ändern/entfernen | `POST /v1/blog-drafts`, `PATCH /v1/blog-drafts/{id}`, `DELETE /v1/blog-drafts/{id}` | `blog_draft_create`, `blog_draft_update`, `blog_draft_remove` |
| Bewusst veröffentlichen | `POST /v1/blog-drafts/{id}/publish` | `blog_publish` |
| Eigene Veröffentlichung zurücknehmen | `POST /v1/blog-publications/{id}/unpublish` | `blog_unpublish` |
| Verfügbare Funktionen/Rechte anzeigen | `GET /v1/capabilities` | `capabilities_get` |
| Persönlichen KD-KI-Auftrag starten | `POST /v1/ai/jobs` | `ai_job_start` |
| Persönlichen KI-Auftragsstatus/-ergebnis lesen | `GET /v1/ai/jobs/{id}` | `ai_job_get` |
| Eigene Nutzungszahlen des persönlichen Assistenten | `GET /v1/assistant/usage` | `usage_get` |
| Eigene Request-Metadaten des persönlichen Assistenten | `GET /v1/assistant/requests` | `requests_list` |
| Owner-Betriebsübersicht | `GET /v1/assistant/backend/status` | `backend_status_get` |
| Owner-Diagnosebefunde | `GET /v1/assistant/backend/diagnostics` | `backend_diagnostics_get` |
| Globale Betriebszahlen | `GET /v1/assistant/backend/usage` | `backend_usage_get` |

Sämtliche `/v1/ai/*`- und `/v1/assistant/*`-Routen in dieser Tabelle sind dem
persönlichen Assistenten vorbehalten. Für den Member-Key sind sie gesperrt.
`/v1/capabilities` liefert ihm nur seine erlaubten Produktfunktionen, keine
internen Betriebsdaten oder Nutzungszähler.

Der Auswahlexport ist eine reine Datenprojektion, auch wenn wegen der
übergebenen ID-Liste `POST` verwendet wird. Eingabe sind eindeutige Eintrags-
IDs, die gewünschte Reihenfolge und das Ausgabeformat `text` oder `json`.
Jede ID wird gegen den lesbaren Kontobestand geprüft. Ausgabe sind die
Titelliste beziehungsweise JSON-Inhalt und ein passender Dateiname/MIME-Typ.
Es wird keine neue Sammlung gespeichert und kein KI-Auftrag gestartet.
Text folgt dem vorhandenen Format `Titel (Jahr)`; der JSON-Vertrag soll das
vorhandene KD-Austauschformat und dessen Feldfreigaben wiederverwenden.

Die Zielvorgabe „alles, was ein Nutzer kann“ reicht über diese Kernrouten
hinaus. Vor einer entsprechenden Vollständigkeitszusage werden die dann
aktiven Nutzerfunktionen ihren Operationen zugeordnet, beispielsweise
Serienfortschritt, Merkliste/Must-Watch, Profil/Einstellungen, Import/Export
und gegebenenfalls Radar. Featureabschaltungen und Produktrechte gelten auch
für den Assistenten. Backenddiagnose ist hier lesend beschrieben; daraus
folgt keine allgemeine Datenbank-, Reparatur- oder Administrationsvollmacht.

## Beispiel: „Stell mir eine Liste von Filmen zusammen“

Der Assistent klärt nur entscheidende Unklarheiten wie Thema, Anzahl oder
eine ausdrücklich benötigte Streamingverfügbarkeit. Er nutzt vorhandene
Mediathek-/Katalogdaten und wählt daraus eindeutige Einträge aus. Der
persönliche Assistent kann bei Bedarf zusätzlich eine freigegebene KD-KI-
Funktion nutzen. Ein fremder Assistent stellt die Auswahl mit seinem eigenen
Modell und den normalen KD-Lese-/Exportwerkzeugen zusammen.
Die tatsächlichen Recherchefähigkeiten ergeben sich aus der jeweiligen
Funktion; ein allgemeiner neuer Webrecherche-Endpunkt ist damit nicht schon
gebaut oder festgelegt.

„Kopiere die Auswahl“ liefert den Text für die Zwischenablage;
„Speichere die Auswahl als JSON“ erzeugt die Exportdatei. Die Server-API
liefert den Inhalt. Die App oder Assistentenanbindung auf dem Zielgerät
übernimmt den tatsächlichen Clipboard-/Dateizugriff. Ein API-Erfolg allein
belegt nicht, dass auf einem anderen Gerät bereits kopiert oder gespeichert
wurde. Die Auswahl schreibt keine neuen Mediathek-Einträge und veröffentlicht
keinen Blog. Ein eindeutiger Auftrag zur konkreten Änderung benötigt keine
zweite pauschale Bestätigung. Unklare Werke oder ein unklarer
Veröffentlichungswunsch werden geklärt.

## Lokale Bedienung der späteren iPhone-App

Der spätere native KD-Kern bietet seine Nutzeraktionen auch als lokale
Werkzeuge an. Das Modell auf dem iPhone ruft darüber die Fachfunktionen der
App mit deren aktivem Konto- beziehungsweise lokalem Datenkontext auf.
Kontoprüfungen, Validierung, IDs, Auswahl und Export haben dieselbe Bedeutung
wie bei der entfernten API. Ein lokal gehaltenes Modell erhält dadurch
keinen eingebauten allgemeinen Owner-Key.

Vorhandene lokale Daten können lokal gelesen, ausgewählt, bearbeitet und
exportiert werden. Bei kontogebundenen Änderungen unterscheidet die App
zwischen lokal gespeichert, für Synchronisation ausstehend und serverseitig
bestätigt. Reconnect, Vorgangs-IDs und Konfliktprüfung müssen zu den anderen
Clients passen. Nicht lokal vorhandene Backenddaten, KD-KI und aktuelle
Backenddiagnose benötigen eine Verbindung und die dafür freigegebene
persönliche Identität. Sie werden nicht als offline verfügbare Fähigkeiten
des kleinen Modells ausgegeben.

Die lokale Werkzeuganbindung ist eine Architekturanforderung an die spätere
Apple-App. Ein konkretes iPhone-Modell, Laufzeitsystem und die Qualität seiner
Werkzeugaufrufe sind damit noch nicht ausgewählt oder praktisch belegt.
Die konkrete iOS-Anbindung hängt auch davon ab, ob das Modell innerhalb der
KD-App oder in einer separaten Assistenten-App läuft. Diese Verbindung wird
beim Apple-Teil geprüft; der HTTP-API-Vertrag allein stellt sie nicht her.

## KI, Zähler und Diagnose

Nur der persönliche Assistent darf über die Assistentenschnittstelle KD-KI
auslösen. Die Member-Sperre gilt auch für indirekte KI-Folgeschritte eines
Imports, einer Blogänderung oder einer sonstigen Nutzeraktion. Der
serverseitig geprüfte Auftragsursprung muss deshalb bis zu möglichen
Hintergrundaufgaben erhalten bleiben. Die üblichen Nutzeraktionen selbst
bleiben ohne KI durchführbar; bereits für den Nutzer sichtbare Inhalte
bleiben im Rahmen seiner normalen Leserechte verfügbar.

KI-Aufträge behalten Kontozuordnung, aktive KI-Freigabe, serverseitige Budgets,
Requestgrenzen, Zeitgrenzen und stabile Vorgangs-ID. Der Owner-Key umgeht
diese Grenzen nicht. Das Lesen von Status oder Ergebnissen startet keine
neue bezahlte Recherche. Nach einem unklaren Verbindungsabbruch wird derselbe
Auftrag abgefragt; ein Wiederholen erzeugt keinen zweiten Providerauftrag.

Zähler unterscheiden mindestens:

- eingegangene KD-API-Requests einschließlich erlaubter und abgewiesener Aufrufe;
- logische Nutzer-/KI-Aufträge, damit Polling nicht als neue Recherche zählt;
- tatsächliche Providerrequests und, soweit erfasst, Websuch-Toolaufrufe;
- Erfolg, Fehler, Laufzeit, Cachetreffer und Kosten/Reservierungen.

Eine behauptete Anzahl aktiver Nutzer braucht eine festgelegte Definition
(beispielsweise Konten mit erfolgreicher Aktion im Zeitraum). Antworten
benennen Zeitraum, Zeitzone, Erfassungsbeginn und Datenabdeckung.
Historisch nicht erfasste Zahlen werden als unbekannt ausgegeben, nicht als
Null. Kostenreservierungen und endgültig gebuchte Kosten werden kenntlich
gemacht. Bestehende KI-Auftragslogs belegen nicht automatisch alle HTTP- oder
Providerrequests.

Alle folgenden Diagnose-/Statistikausgaben sind ausschließlich für den
persönlichen Assistenten bestimmt. Ein Member erhält die normale Antwort
seiner Nutzeraktion oder deren notwendigen Fehlercode, aber keine
Diagnosehistorie, Verbrauchswerte, Requestzahlen oder Kostenfelder.

Diagnose liefert begrenzte strukturierte Befunde: betroffene Komponente,
Fehlercode, Häufigkeit, Zeitpunkt, Status und beobachtete Version, soweit
ermittelbar. Sie liefert keine Secrets, Auth-Header, vollständigen Requests,
privaten Blogtexte oder fremden Mediatheken. Ein erreichbarer Health-Endpunkt
belegt nicht automatisch die Funktionsfähigkeit jeder Hintergrundaufgabe.

## Im lokalen Code belegte Anschlussstellen

| Quelle | Befund und Bedeutung |
|---|---|
| `src/lib/accountAccess.js` | Rollen `owner`/`member`, aktive Kontofreigabe und getrennte persönliche KI-Freigabe vorhanden. Neue Key-Rechte müssen damit verbunden werden. |
| `src/lib/accountDriver.js` | Persönliche Datenpakete in `kd_personal`, Kontozuordnung über Sitzung, Versionsprüfung gegen konkurrierende Änderungen. Neue Eintragsoperationen müssen mit dem bestehenden Sync zusammenarbeiten. |
| `src/lib/personalDataRegistry.js` | Gemeinsames Register persönlicher Datenbereiche. Für die gewählte flüchtige Mehrfachauswahl ist kein neuer persönlicher Datentopf vorgesehen. |
| `src/lib/mediathekSelection.js`, `src/tabs/MediathekTab.jsx` | Mehrfachauswahl über stabile IDs und Textausgabe über `erstelleTitelliste`; Format `Titel (Jahr)` und sichtbare Auswahl sind im Checkout belegt. |
| `src/lib/paket.js`, `src/components/TeilenBlock.jsx` | JSON-Austauschformat `kinodreieck-paket` v1 mit expliziten Exportfeldern vorhanden. Die genaue Verbindung mit dem Auswahlexport wird am aktuellen Bau-Checkout geprüft; ein ausgewählter JSON-Export ist durch diese beiden Quellen allein noch nicht als UI-Funktion belegt. |
| `src/services/ai.js`, `supabase/functions/ai-task/requestContract.ts` | Bestehende aufgabenspezifische KI-Verträge, darunter Suche, Filmprognose, Filmwissen und Bloganalyse. |
| `supabase/functions/ai-task/index.ts`, Zweig `health` | Vorhandene Statusantwort enthält bereits Betriebs-/Laufzeitinformationen. Assistentenexklusivität muss bestehende Zugriffswege und erlaubte App-Anzeigen berücksichtigen. |
| `supabase/migrations/20260726180000_etappe5_ki_unterbau_haertung.sql`, `kd_ai_stand` | Eigener monatlicher KI-Verbrauch, heutige Aufträge und laufende Aufträge; keine vollständige neue API-Requeststatistik. |

Die vorhandene gewöhnliche Nutzeranmeldung darf nicht über einen anderen
Endpoint an dieselben neu exklusiven Diagnosedaten gelangen. Gleichzeitig
müssen für normale Nutzer notwendige Aussagen wie „Kontingent erschöpft“
weiter funktionieren. Die Sperre für Member-Assistenten muss an allen
relevanten direkten und indirekten Pfaden greifen, einschließlich
bestehender `health`-/RPC-Antworten. Ein Member-Key darf nicht gegen einen
allgemeinen Nutzer-Token mit weitergehenden KI-/Diagnoserechten getauscht
werden können.

## Umsetzung und Abnahme

Prüfzuständigkeit gemäß der konkretisierten Nutzeranweisung im Etappenplan:
Jeder Baumeister kontrolliert seinen fertigen Paketstand einmal. Masterchats
prüfen ausschließlich die Verbindungen zur Basis und zwischen Paketen;
sie wiederholen keine Paketreviews oder Pakettests. Der Gesamtlauf über alle
neu gebauten Wege findet ausschließlich in der letzten API-Etappe 6 statt
und wird einem bereits beteiligten Baumeister zugeordnet. Nachprüfungen
beschränken sich auf durch echte Fehler oder Änderungen entwertete Nachweise.

Auf Grundlage der entschiedenen Produktfragen entsteht der konkrete
OpenAPI-Vertrag mit
Eingabe-/Ausgabeschemata, Pagination, Fehlercodes, Rechtezuordnung und
Werkzeugbeschreibungen. Darauf folgen die Kontobindung der Keys, die
Fachoperationen und die gefilterten Diagnose-/Nutzungsansichten.

Schreiboperationen brauchen eine eindeutige Ziel-ID, Konfliktprüfung und
Schutz vor doppelter Ausführung. Daten werden serverseitig geprüft. Key-
Verifikation darf keinen ungeprüften allgemeinen Zugriff über privilegierte
Datenbankcredentials eröffnen; die minimale technische Einbindung in die
bestehenden Sitzung-/RLS-/KI-Verträge wird vor Umsetzung konkretisiert.

Die wesentlichen Abnahmefälle sind: eigener/fremder Datensatz; Owner/Member;
App-/persönlichem/fremdem Assistentenzugang; widerrufener Key/inaktives Konto;
Member ohne direkte oder indirekte KD-KI; Member ohne eigene oder globale
Betriebszahlen; fehlende persönliche KI-Freigabe;
parallele Änderung durch PWA; wiederholter Schreibauftrag; KI-Abbruch und
Statusabfrage; private Speicherung gegenüber Veröffentlichung; Diagnose ohne
Inhalts-/Secretweitergabe; identische Auswahl in Text-/JSON-Ausgabe; keine
persistente Sammlung durch einen Export. Sie laufen zunächst ohne bezahlte
Providercalls. Die spätere lokale iPhone-Anbindung braucht darüber hinaus
eigene Offline-/Reconnect- und reale Gerätetests.

Bei Ausgabe der zwei echten Keys werden die Zielkonten und die sichere
Übergabe konkret gebunden. Produktionsfreischaltung, tatsächlich ausgegebene
Keys und Tests mit realen Clients werden jeweils separat belegt.

## Technische Referenzen

- [Supabase: API-Keys und ihre Berechtigungen](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [OpenAPI-Spezifikation](https://spec.openapis.org/oas/latest.html)
- [MCP: Architektur und Werkzeuge](https://modelcontextprotocol.io/docs/learn/architecture)

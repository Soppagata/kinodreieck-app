# Blogreferenzen aus Freitext: Entwurf für die optionale KI-Funktion

Stand: 18.09.2026. **Ausgeplant, noch nicht implementiert oder aktiviert.**
Codeprüfung gegen `664413e4ffe0d396b49379ffc3d598d38fa9e654`; M6 erhöht
parallel den manuellen Referenzvertrag auf 50. Das einzige Fortschritts- und
Paketregister bleibt [BLOG_BAUEBENEN_2026-09-18.md](BLOG_BAUEBENEN_2026-09-18.md).
Dieses Dokument beschreibt das Produkt und seine konkreten Anschlüsse.
Es wurde kein zahlender Anbieterrequest gestartet.

## Entscheidung und Verbesserungen am bisherigen Vier-Schritte-Plan

**Begrenzten Artikeltext einmal verstehen → Vorschläge im Code prüfen →
Nutzer wählt aus → ausgewählte Titel regulär als Referenzen übernehmen.**
Sonnet 5 ohne zusätzliches Thinking ist die vorgesehene erste Variante.
Haiku 4.5 bleibt die günstigere Vergleichsvariante für einen später ausdrücklich
freigegebenen Qualitätstest. Die Empfehlung beruht auf Aufgabenpassung und
Integrationsaufwand; eine gemessene Überlegenheit auf unseren Blogs liegt nicht vor.

| Ansatz | Nutzen | Grenze / Entscheidung |
|---|---|---|
| Deterministisch im bereits geladenen Bestand suchen | Keine Anbietergebühr, starke lokale Werkkennungen nutzbar | Gut für das Verknüpfen. Als vorgeschaltete Ausschlussregel ungeeignet: unbekannte Werke, Schreibfehler, Übersetzungen und „Es“/„Her“ können verloren gehen. Kein zusätzlicher Vollkatalogdownload. |
| Ein Sonnet-Aufruf auf den Text | Behält Zusammenhang, kann Abkürzungen und Film-/Serienerwähnungen unterscheiden | Erzeugt ausschließlich überprüfbare Vorschläge. Code und Nutzer entscheiden über ihre Übernahme. Empfohlener Anfang. |
| Ein Haiku-Aufruf auf den Text | Geringerer Tokenpreis; bereits im Backend vorhanden | Vergleichskandidat. Trefferquote und Laufzeit auf dieser Aufgabe sind noch ungemessen. |
| Erst Haiku, dann gegebenenfalls Sonnet | Könnte einfache Texte günstiger behandeln | Vorerst zurückstellen: Ein Modell erkennt seine ausgelassenen Titel nicht zuverlässig selbst; zwei Aufrufe erhöhen Fehlerpfade, Kosten und Wartezeit. |
| Vorfilter und automatische Websuche | Könnte zu unbekannten Titeln Informationen finden | Keine automatische Suche für diese Funktion. Gesucht sind Erwähnungen im Artikel. Suchtreffer ersetzen diesen Beleg nicht und erzeugen zusätzliche Anfragen. |

Verbesserungen gegenüber der ersten Skizze: ein eigener standardmäßig
ausgeschalteter Settings-Schalter; vollständige überprüfbare Textfundstellen
auch bei sehr kurzen Titeln; bewusst ausgeschaltetes Sonnet-Thinking;
Ergebniswiederverwendung ohne erneuten Anbieteraufruf; ein kompatibler
Health-Vertrag; getrennte Behandlung von direkter Nennung und Interpretation.
Ungeklärte Werke bleiben manuell korrigierbar und gegebenenfalls Rotlinks.
Eine spätere ausdrücklich gestartete Werkrecherche wäre eine eigene Funktion.

## Nutzerweg und kompakte Oberfläche

1. Der Nutzer schreibt wie bisher seinen Blog und kann jederzeit privat speichern.
2. Bei eingeschalteter Funktion erscheint im Speicherbereich von `BlogEditor`
   die Nebenaktion **„Titel im Text erkennen (KI)“**. Direkt daneben steht:
   „Sendet die Überschrift und diesen Blogtext an Anthropic. Du entscheidest,
   welche Vorschläge übernommen werden.“ Der Klick startet genau einen Auftrag;
   kein zweiter Bestätigungsdialog und kein automatischer Start beim Speichern.
3. Im selben Editor erscheint eine schlichte Liste mit Checkbox, Titel und
   gegebenenfalls Jahr/Typ. Eine kurze Textfundstelle hilft beim Prüfen;
   längerer Kontext wird nur bei Bedarf aufgeklappt. Keine Poster, verschachtelten
   Karten oder neue Pflichtstufe. Kein Vorschlag ist vorgewählt.
4. **„Ausgewählte übernehmen“** ergänzt nur neue gewählte Einträge im offenen
   Entwurf. Vorhandene Referenzen und ihre Reihenfolge bleiben erhalten.
   Neue Einträge folgen zunächst der Reihenfolge ihrer ersten Erwähnung.
   Danach gelten die bestehenden Aktionen zum Ordnen, Speichern und Publizieren.

Es gibt weiterhin keinen dauerhaften Referenzzähler. Der M6-Hinweis beim
Erreichen der 50. Referenz gilt auch bei Mehrfachübernahme. Eine Auswahl über
den verbleibenden Platz wird erklärt und nicht teilweise gespeichert.
Bei bereits 50 Referenzen startet der Client keinen kostenpflichtigen Auftrag.
Diese Komfortprüfung ersetzt keine serverseitigen Kosten- und Aufrufgrenzen.

„Keine Titel gefunden“, „Text zu lang“, Abbruch, Budgetgrenze oder Anbieterfehler
bleiben kleine Meldungen im Editor. Text, manuelle Referenzen und Speichern
funktionieren weiter. Die Anonym-Checkbox bleibt unverändert. Die Extraktion
veröffentlicht nichts, verändert kein Geschmacksprofil und erstellt keine
Mediathek-Einträge. Kritisch erwähnte Filme dürfen ebenfalls vorgeschlagen werden.

## Eingaben, Interpretation und Belege

Neuer Task: `blog-reference-extract`. Er ist getrennt von
`blog-profile-extract`, der bereits Geschmacksinformationen aus Artikeln ableitet.
Serverseitiger Prompt und Ergebnisvertrag: jeweils `blog-reference-extract-v1`.

Der Client sendet ausschließlich `{ title, text }` als Fachpayload. Vorgangs-ID,
Sitzung und technische Vertragsversion gehören zum bestehenden eigenen
API-Umschlag. Der Server leitet das Konto aus der Sitzung ab. An Anthropic
gehen nur Überschrift, Text, feste Arbeitsanweisungen und ein festes Schema;
keine Konto-/Artikel-ID, vorhandene Referenzliste, Mediathek, Bewertungen,
Profilsignale, ausgewählten Abos oder sonstige Artikel. Personenbezogene
Angaben, die jemand selbst in den Text schreibt, sind dennoch Teil des Texts.

Vorgesehene Grenzen, beim Vertragsbau mit Grenzwert-Fixtures festzuschreiben:

| Grenze | Wert und Verhalten |
|---|---|
| Text | 18.000 UTF-8-Bytes; keine stille Kürzung. Längere Blogs bleiben manuell speicherbar. |
| Überschrift | Höchstens 512 UTF-8-Bytes, zusätzlich der reguläre Blogtitelvertrag. |
| Eigener Request | Höchstens 32 KiB einschließlich JSON-Umschlag; vor Providerarbeit prüfen. |
| Vollständig gebauter Providerbody | Höchstens 48 KiB einschließlich Prompt/Schema/JSON-Escaping; derselbe Body für Reservierung und Versand. |
| Kandidaten | Höchstens 50 verschiedene Vorschläge; weniger oder keine sind gültig. Bei mehr Erwähnungen kenntlich machen, dass die Vorschau begrenzt ist. |
| Ausgabe / Zeit | Startwerte 8.192 Ausgabetokens, 64 KiB Providerantwort, 60 Sekunden einschließlich Bodylesen; keine automatische Fortsetzung oder Wiederholung. |
| Reservierung | Vorgesehener Taskdeckel 30 US-Cent, zusätzlich alle strengeren Konto-, Tages-, Monats- und globalen Grenzen. |

Die Tokenwerte sind technische Obergrenzen, keine erwartete Rechnung.
Mit dem derzeit konservativen Sonnet-Preisboden im Code ($3/$15 pro Million)
und seiner 4.096-Token-Eingabereserve ergibt der 48-KiB-Bodyzaun zusammen mit
8.192 Ausgabetokens höchstens rund 28,27 US-Cent vor Rundung. Der tatsächliche
Reservierungsalgorithmus und alle zulässigen Modell-/Preisvarianten müssen
diesen Zusammenhang im Test belegen. Höhere konfigurierte Preise dürfen den
Auftrag vor Versand ablehnen; sie dürfen den 30-Cent-Deckel nicht anheben.
Passt eine korrekte 50er-Antwort nicht, Vertrag vor dem Bauabschluss bewusst
anpassen, nicht im Betrieb still mehr Tokens erlauben.

Vorgesehene Antwortfelder je Vorschlag:

```text
mention           exakte erwähnte Zeichenfolge
titleSuggestion   vorgeschlagener Titel, höchstens 160 Zeichen
kind              film | series | title_group | unclear
year              belegtes Jahr oder null
interpretation    direct | interpreted | ambiguous
evidence          { field: title | text, quote: exakter Ausschnitt }
```

`quote` bleibt höchstens 320 UTF-8-Bytes lang; `mention` muss darin vorkommen,
der gesamte Ausschnitt muss exakt im bezeichneten unveränderten Eingabefeld
stehen. Positionen und stabile Vorschlags-IDs bildet der eigene Server,
nicht das Modell. Bei wiederholter identischer Fundstelle genügt die erste
nachweisbare Position. Jahre müssen aus derselben Fundstelle stammen;
das Modell darf fehlende Jahreszahlen nicht aus seinem Weltwissen ergänzen.
Der Client hält zusätzlich eine lokale Bindung an Konto, Entwurf und Textfassung.

Direkte Nennung und Deutung bleiben erkennbar verschieden: Aus „Episode IV“
im Star-Wars-Kontext kann ein als **interpretiert** gekennzeichneter Vorschlag
entstehen. „Star Wars“ allein erzeugt keine Liste aller Episoden. Titelgruppen
und mehrdeutige Nennungen brauchen zunächst die konkrete Werkauswahl oder
eine manuelle Korrektur; sie werden nicht still als einzelner Film verknüpft.
Ein kurzer Name wie „Es“ braucht einen passenden Kontext, keine Mindestlänge
von 16 Zeichen. Exakte Textbelege beweisen die Erwähnung, nicht die Richtigkeit
der Modellinterpretation.

Der vorhandene Helfer `baueBlogBeleganker` in `providerContract.ts` wurde für
Geschmacksbelege gebaut: Er verwendet Ausschnitte von 16–96 Bytes und bei
vielen Ausschnitten eine Auswahl von höchstens 256 Ankern. Ihn ungeändert als
einzige Titelfundstellenquelle zu übernehmen würde kurze Listenzeilen und
nicht ausgewählte Passagen ausschließen. Für diesen Task deshalb den ganzen
begrenzten Text und direkt überprüfte Ausschnitte verwenden; den alten
Geschmacksauftrag nicht umbauen.

Striktes JSON, bekannte Felder und zulässige Typen sind notwendig, reichen
aber nicht aus. Eigene Prüfungen begrenzen Mengen/Strings/Bytes und bestätigen
die Belege. Ein gültiger Teil darf nur nach einzelner Belegprüfung als
ausdrücklich unvollständige Vorschau erscheinen. Ein abgeschnittener JSON-Body,
eine Providerverweigerung oder eine strukturell unlesbare Antwort wird nicht
durch einen zweiten KI-Aufruf „repariert“. Keine Modell-URLs/IDs, kein HTML,
keine Werkzeuge und keine Ausführung von Anweisungen aus dem Artikel.

## Werkzuordnung, Mehrfachübernahme und Lebensdauer

Die KI liefert keine Streamingverfügbarkeit und keine verbindliche Werkidentität.
Nach der Antwort verwendet der Client die bereits vorhandenen lokalen
Identitäten und Matchingregeln: starke IDs oder eine eindeutige zulässige
Kombination aus Titel, Jahr und Typ. Reiner Titelgleichstand reicht bei Remakes
oder widersprüchlichen IDs nicht. Interpretierte Titel bleiben bis zur
bewussten Entscheidung unbestätigt. Keine neue Schleife externer Suchen pro Titel.
Die Zustände bleiben getrennt: eindeutig zugeordnet, nicht gefunden und
mehrdeutig. Bekannte widersprüchliche Erscheinungsjahre oder Film-/Serientypen
verbieten eine automatische Zuordnung. Keine automatische unscharfe Suche
nach Teilstrings; etwa „The Odyssey“ und „2001: A Space Odyssey“ sind kein
Match. Bereits bestätigte Werkidentitäten verwenden weiterhin den vorhandenen
Katalog-/Quellencache mit dessen Frischeprüfung. Der unten beschriebene
kurzlebige KI-Ergebnisbestand speichert Vorschläge zu Textfassungen und ist
keine zweite Quelle für Werkidentitäten oder Verfügbarkeiten.

Beim Übernehmen erneut gegen die **aktuelle** Referenzliste deduplizieren und
die gesamte neue Liste atomar prüfen. Keine 50 einzelnen `onAddReference`-
Aufrufe mit zwischenzeitlich veralteten Zuständen. Eine neue
`onApplyReferenceSuggestions({ draftKey, contentHash, candidates })`-Aktion
gehört zum bestehenden Publikationscontroller. Sie liefert denselben
Aktions-/Fehlervertrag wie manuelle Änderungen und benutzt den M6-Mengenvertrag.
Nur bestätigte lokale Werkbezüge dürfen private IDs tragen; sie gelangen
weiterhin nicht in die öffentliche Projektion.

Der normale Publikationsweg erledigt erst beim Veröffentlichen den gemeinsamen
Streaming-/Kinoabgleich. Das Lesen verwendet anschließend vorbereitete Tags
und die persönliche Mediathek/Quellenauswahl. KI-Vorschläge führen somit weder
zu einem neuen Feed-Ladeweg noch zu einer zweiten Verfügbarkeitsdatenbank.

Ein laufender Auftrag ist an `{ accountScope, draftKey, contentHash, requestId }`
gebunden. Textänderung, anderer Entwurf, Logout/Kontowechsel oder Ausschalten
der Funktion verwerfen die Übernahmeberechtigung und brechen den Clientaufruf
ab. Nachträgliche Antworten überschreiben nichts. Eine schon gesendete
Anbieteranfrage kann trotzdem Kosten verursacht haben. Der Nutzer kann während
der Analyse normal speichern; ein danach geschlossenes/verändertes Editorfenster
nimmt keine verspäteten Vorschläge auf.

## Aufrufschutz, Ergebniswiederverwendung und Datenschutz im Backend

Zunächst ein neuer Auftrag pro Konto gleichzeitig, höchstens drei neue Starts
pro Minute und zehn pro Tag, zusätzlich zu vorhandenen strengeren AI-Limits
und zunächst höchstens vier gleichzeitig laufenden Extraktionen über alle
Konten. Alle Grenzen gelten atomar
im Backend auch für direkte API-Aufrufe. Validierung erfolgt vor
Budgetreservierung; Cachetreffer kosten keinen neuen Anbieterrequest und
zählen nicht als neuer bezahlter Start. Billige API-Leseraten bleiben begrenzt.
Lokale Settings sind eine Geräteentscheidung, kein Schutz gegen einen
manipulierten API-Client; serverseitige Berechtigung/Budgets bleiben verbindlich.

Vorgesehen ist eine kleine private Ergebnishaltung im bestehenden Supabase-
Projekt, nicht im Blog-Sammelspeicher: neuer Serverbereich
`kd_blog_reference_extractions`, ausschließlich über die eigene AI-Function
zugänglich. Ein Schlüssel aus Konto, serverseitigem Inhalts-HMAC, Modell,
Prompt- und Ergebnisversion verhindert Doppelläufe auch mit neuen Vorgangs-IDs.
Der unveränderte Rohtext wird dort nicht zusätzlich gespeichert. Validierte
Vorschläge enthalten allerdings Titel und Textausschnitte und sind deshalb
persönliche Inhaltsdaten, keine inhaltsfreien Betriebsmetadaten.

Vorgesehen: höchstens zehn Ergebnisdatensätze und 320 KiB normalisierte
Ergebnisse pro Konto, 24 Stunden ab Erstellung (keine Verlängerung bei Lesen).
Auch das bestätigte leere Ergebnis wird gespeichert. Zugriff prüft das Ablaufdatum
unmittelbar; ein vorhandener periodischer Cleanup bekommt die explizite
Löschung. Die verbindliche physische Löschfrist muss an dessen nachgewiesene
Kadenz gebunden werden, beispielsweise spätestens 25 Stunden bei stündlichem
Cleanup. Accountlöschung entfernt die Ergebnisse per geprüfter Kaskade.
Der Rechte-/Exportweg umfasst noch vorhandene Ergebnisse; sie werden nicht
als bloße „Diagnose ohne Inhalte“ ausgegeben.

Ein atomarer Start verknüpft Ergebnisslot, eindeutigen Inhaltsauftrag und
`kd_ai_auftrag_starten`/Budgetreservierung; bei Grenzverletzung dürfen keine
verwaisten laufenden Slots bleiben. Bei unklarem Providerausgang bleibt der
bekannte Vorgang terminal/unklar und konservativ verbucht. Lease-Ablauf allein
berechtigt niemals zu einem weiteren Providerrequest. Identisches Wiederholen
liest nur den bekannten Zustand. Ein neuer Versuch nach endgültigem Fehler
braucht einen bewussten Nutzerstart und verbleibendes Budget; kein automatischer
Haiku-/Sonnet-Fallback. Logs enthalten Status, Dauer, Modell, Tokens und Kosten,
aber keinen Text, Fundstellen oder Titel; private Ergebnistabelle und
inhaltsfreie Kostenprotokolle haben getrennte Löschregeln.

## Settings und alle sichtbaren DS-Anschlüsse

### Settings-Vertrag

`src/lib/kiSchalter.js`: neuer Eintrag `blogReferenzen` mit `standardAn: false`
und `beiAus: "ausblenden"`. Die vorhandene `KI_WAHL_VERSION = "e8-v1"` bleibt
gültig. Das bestehende Muster von Filmwissen erlaubt den neuen Opt-in, ohne
alte Entscheidungen zu überschreiben oder den Einstieg erneut zu öffnen.

Vorgeschlagener sichtbarer Text:

> **Titel aus Blogtexten mit KI erkennen**
>
> Auf deinen Klick die Überschrift und den aktuellen Blogtext an Anthropic
> senden. Du prüfst die Vorschläge und wählst die Referenzen selbst aus.

`src/tabs/DatenTab.jsx` rendert `KI_FUNKTIONEN` bereits zentral. Die neue Zeile
erscheint unter Settings → Personalisierung & KI → Manuelle KI-Funktionen.
Den einleitenden Text um Blogreferenzen ergänzen; den Hinweis „nur dieser
Browser/dieses Gerät, nicht synchronisiert oder gesichert“ beibehalten.
Der bestehende globale Schalter bleibt Voraussetzung. Ein Link aus der
Bloghilfe kann dorthin führen, aber niemals den globalen Schalter mitaktivieren.

Die Schaltfläche und die Aktion selbst prüfen `kiAn("blogReferenzen")`;
zusätzlich braucht es ein aktives `personalAi`-Konto und eine bereite
serverseitige Feature-Capability. Die Rechteprüfung erfolgt erneut beim Start
und vor der Ergebnisübernahme. Bereits manuell oder bewusst per KI übernommene
Referenzen bleiben bei KI aus erhalten. Die Geräteentscheidung ist unabhängig
von anonymem Veröffentlichen und vom serverseitigen Hintergrund-Radar.

### DS-Texte als konkrete Entwürfe

Diese Texte werden **erst mit der tatsächlich gebauten Funktion** in die App
übernommen. Jetzt enthält nur dieser Plan die neue Funktion.

| Datei / Stelle | Geplante Änderung |
|---|---|
| `src/lib/privatePilotOps.js`, `PRIVATE_PROVIDER_REGISTRY`, Anthropic | Zweck um optionale Erkennung von Blogreferenzen ergänzen; Daten und bewussten Einzelstart benennen. Gemeinsame Quelle für Login und Settings. Aktuelle offizielle Quellen/Stand und Aufbewahrungshinweis hinterlegen. |
| `src/components/DatenschutzDienste.jsx` | Darstellung aus derselben Registry beibehalten; keine zweite abweichende Anbieterliste. Falls zusätzliche Retentionsdetails notwendig sind, zentralen Vertrag erweitern. |
| `src/components/EinstiegsGate.jsx`, „KI- und Suchanbieter“ | Eigenen Listenpunkt für Referenzerkennung; Stapelimport, Blog-Geschmacksanalyse und Referenzerkennung auseinanderhalten. Kurzfassung ebenfalls auf die vollständige Beschreibung verweisen lassen. |
| `src/components/PrivatePilotOps.jsx`, Kurzfassung/Datenübersicht | Den ausdrücklich gestarteten Blogtext-Transfer und die private, kurzlebige Vorschlagshaltung erwähnen. |
| `src/lib/privatePilotOps.js`, `PRIVATE_DATA_INVENTORY` und Retentionsklassen | Neue Inhaltsklasse für KI-Vorschläge, tatsächliche TTL/Purge-Kadenz, Empfänger, Zugriff, Konto-/Export-/Löschweg; nicht unter `NO_CONTENT_PAYLOAD` einsortieren. |
| `src/lib/personalDataRegistry.js` | Übernommene Referenzen bleiben Bestandteil des vorhandenen Blog-Exports. Kein neuer Gerätesicherungs-Topf für nicht übernommene Vorschläge; serverseitigen Rechteweg gesondert dokumentieren. |
| `supabase/functions/account-self-service/index.ts` und zugehörige Export-/Lösch-RPCs | Neue Tabelle bei Kontoexport und Löschung berücksichtigen; Vertrags-/Scopeprüfung darf neue Inhaltsdaten nicht übersehen. Vorhandene Freigaben des Self-Service nicht ausweiten. |
| `src/lib/hilfeInhalte.js` | Bloghilfe und Settingshilfe: optionaler Klick, Mehrfachauswahl, unklare Titel prüfen, manuelles Arbeiten bleibt möglich, KI veröffentlicht nichts. |

Entwurf für den neuen DS-Listenpunkt:

> Bei „Titel im Text erkennen (KI)“ übermitteln wir auf deinen Klick die
> Überschrift und den aktuellen Text deines Blogentwurfs an die Anthropic API.
> Wir fügen keine Konto- oder Artikelkennung, Mediathek oder Geschmacksdaten
> hinzu. Persönliche Angaben, die du selbst in den Blogtext geschrieben hast,
> sind Bestandteil dieser Eingabe. Die Vorschläge werden nicht automatisch
> übernommen oder veröffentlicht.

Entwurf für Speicherung und Abgrenzung:

> Geprüfte Vorschläge und kurze Textfundstellen halten wir kontogetrennt für
> bis zu 24 Stunden zur erneuten Anzeige bereit. Anschließend sind sie nicht
> mehr abrufbar und werden im folgenden regelmäßigen Löschlauf entfernt.
> Übernommene Referenzen bleiben Teil deines Blogs. „Anonym veröffentlichen“
> betrifft die Anzeige gegenüber anderen Nutzern und anonymisiert nicht den
> Inhalt einer von dir gestarteten KI-Anfrage.

Die zweite Formulierung setzt einen tatsächlich gebauten und nachgewiesenen
Cleanup voraus; im finalen Text dessen maximale physische Löschfrist nennen.
Der bestehende DS-Satz im `EinstiegsGate` behauptet aktuell, die Artikel-ID
gehe bei Blogprofilanalyse an Anthropic. Der gelesene Prompt-Builder entfernt
diese ID vorher. Bei der DS-Erweiterung diesen Punkt für den vorhandenen
Geschmacksauftrag mit berichtigen und per Payload-Test absichern.

Anbieterhinweis, an aktuelle tatsächliche Vertragsbedingungen zu binden:

> Anthropic beschreibt für Standard-API-Eingaben und -Ausgaben eine Löschung
> innerhalb von 30 Tagen; Ausnahmen bestehen unter anderem für vertragliche
> Vereinbarungen, Sicherheitsprüfungen und rechtliche Pflichten. Verarbeitung
> kann außerhalb der EU stattfinden. Details stehen in den verlinkten
> Anbieterinformationen.

Die offiziellen Angaben sind keine Bestätigung der konkreten
Kinodreieck-Vertragskonfiguration. Vor Aktivierung die vorhandene Provider-
Registry mit dem realen Vertrag abgleichen: kein ungeprüftes Versprechen von
EU-only, Zero Data Retention oder uneingeschränkter 30-Tage-Löschung.
Anthropic nennt US-Speicherung und standardmäßig mehrere Verarbeitungsregionen.
Kommerzielle Eingaben werden laut Anbieter ohne gesonderte Teilnahme am
Development Partner Program nicht zum Training verwendet; die tatsächliche
Teilnahme-/Vertragslage ist gesondert zu prüfen. Der DPA ist laut Anbieter
Bestandteil der kommerziellen Bedingungen. Das ersetzt keine Prüfung unserer
konkreten Informationspflichten oder Rechtsgrundlage. Primärquellen: [Aufbewahrung](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data),
[Regionen](https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers),
[kommerzielle Verarbeitung](https://privacy.claude.com/en/articles/9267385-does-anthropic-act-as-a-data-processor-or-controller),
[DPA](https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa).

## Konkrete Codeanschlüsse und kompatible Bereitstellung

| Bestehende Stelle | Umsetzung im späteren Bau |
|---|---|
| `src/components/blog/BlogEditor.jsx`, `src/tabs/BlogTab.jsx`, `src/styles/blog.css` | Nebenaktion im Speicherbereich und kompakte Inline-Auswahl. Neue `BlogReferenceSuggestions.jsx` kapselt nur die Darstellung. |
| `src/controllers/useBlogPublicationController.js` | Bestehender Editor bleibt einzige Wahrheit; neue atomare Mehrfachübernahme, aktuelle Referenzen/Draftfassung prüfen. Veröffentlichungspfade unverändert weiterverwenden. |
| Neue `src/controllers/useBlogReferenceExtractionController.js`, Anschluss in `src/App.jsx` | Requestzustand, Abbruch, Kontobindung, Hash/Entwurffassung, Settings und Capability; keine zweite Kopie des Blogentwurfs. |
| Neue `src/lib/blogReferenceExtraction.js` | Reiner Clientvertrag: Eingabe/Antwortgrenzen, Vorschlagsauswahl und Zusammenführung. Keine Providerzugangsdaten. |
| `src/services/ai.js`, `src/lib/aiDriver.js` | Task-Allowlist und strikte Ergebnisvalidierung; Prompt-/Profilversion wie beim servergeführten Blogprofilauftrag nicht frei vom Client übernehmen. Bestehenden Abort-/Accountschutz nutzen. |
| Neue `supabase/functions/ai-task/blogReferenceExtract.ts` | Reiner Aufgabenvertrag, Prompt, festes Anbieterschema, direkte Belegprüfung, Ergebnisse. Kein weiterer großer Inlineblock mit lose duplizierten Grenzen. |
| `supabase/functions/ai-task/index.ts`, `requestContract.ts` | Dünne Registrierung des neuen Tasks, eigene Capability, Featureflag, atomarer Cache-/Budgetweg und Statusantworten. Den vorhandenen allgemeinen Eingangszaun von 1.000.000 Bytes bereits beim Bodylesen erzwingen; die engere Taskgrenze zusätzlich nach dem Routing prüfen. Kein Vertrauen allein auf `Content-Length`. |
| `supabase/functions/ai-task/providerContract.ts` | Taskgebundene Option für `thinking: { type: "disabled" }`; Körperbau und Kostenschätzung müssen dieselbe Option verwenden. Bestehende Aufgaben nicht global umstellen. Gebundenes Antwortlesen für den neuen Task. |
| Neue additive Migration plus Schema-/PG-Harnessstand | Neue private Ergebnistabelle und servicegeschützte Start/Finish/Cleanup-RPCs; Modellrouting, Token-/Kosten-/Ratenwerte, Default-off-Featureflag. Keine Änderung angewandter Migrationen. |

**Altclient-Kompatibilität ist eine echte Vorbedingung.**
`hatBlogProfileAnalyseCapability` in `src/lib/blogProfilAnalyse.js` verlangt
aktuell exakt `ai-task-v5`, die geordnete `activation.userTasks`-Liste und
`capabilities = { blogProfileExtract }`. Einfach einen Task und ein Feld in
die bisherige Health-Antwort einzufügen würde alte PWAs sperren.

Vorgesehene Lösung: versionierte, ausdrücklich angeforderte Health-Variante.
Ein bisheriger Health-Aufruf erhält weiterhin die v5-Projektion der alten
Aufgaben/Schlüssel. Nur ein neuer Aufruf mit vereinbartem
`payload.capabilityContract = "blog-reference-extract-v1"` erhält die neue
Capability samt eigener Versionsantwort. Unbekannte Varianten werden ohne
Provideraufruf abgewiesen. Registrierte Serveraufgaben und ausgehandelte
Health-Projektion trennen; alte Clientprüfungen bleiben gültig. Die neue
Extraktion verlangt die exakt passende Variante. Neue Aufgabenkonfiguration
zunächst aus; Backend bereitstellen, Client/DS-Texte ausliefern und erst nach
dem Vertragsnachweis für die bestehenden KI-berechtigten Konten aktivieren.
Keine Owner-only-, Staging-only- oder gesonderte Publish-Sperre hinzufügen.

## Modellpreis, Qualitätsvergleich und Nachweise

Offizielle Standardpreise am 18.09.2026; interaktive API ohne Cache-, Batch-
oder individuelle Rabatte:

| Modell | Eingabe / 1 Mio. Tokens | Ausgabe / 1 Mio. Tokens | Rechenbeispiel: 2.000 Eingabe + 1.000 Ausgabe |
|---|---:|---:|---:|
| Haiku 4.5 | $1 | $5 | $0,007 = 0,7 US-Cent |
| Sonnet 5 | $2 | $10 | $0,014 = 1,4 US-Cent |

Dies ist ein Vergleich bei gleicher Tokenmenge, keine Prognose pro Blog.
Tatsächliche Prompt-/Antwortlänge und Tokenisierung unterscheiden sich.
Anthropic hat die angekündigte Sonnet-Preiserhöhung auf $3/$15 zurückgenommen.
Der derzeitige Code reserviert weiterhin konservativ zu diesem höheren Satz;
der R50-Bau verändert diesen Kostenzaun nicht. Eine Preisanpassung wäre eine
separat geprüfte Änderung. Websuche kostet zusätzlich $10 je 1.000 Suchen
plus Tokens für Suchinhalte: schon eine Suche entspricht 1 US-Cent.
Quelle: [Anthropic-Preise](https://platform.claude.com/docs/en/about-claude/pricing).

Sonnet 5 schaltet adaptives Thinking standardmäßig ein; für diese begrenzte
Extraktion explizit ausschalten. Das bisherige `baueAnbieterKoerper` setzt diese
Option noch nicht. Nicht auf eine vermeintlich günstige Standardeinstellung
vertrauen. Quelle: [Sonnet-Migration](https://platform.claude.com/docs/en/models/sonnet-5/migration-guide).
Strukturierte Ausgaben unterstützen den gewählten Weg, doch Mengen- und
Längenbegrenzungen müssen zusätzlich im eigenen Code geprüft werden. Keine
privaten Texte in dynamische Schema-Enums oder Schemakonstanten schreiben.
Quelle: [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Zuerst reine Mocks und lokale PostgreSQL-Tests, insbesondere:

- 30/50 direkte Titel, keine Treffer, Schreibweisen/Übersetzungen, Serien gegen
  Film, Remakes, Überschrift als einzige Fundstelle, kurze Zeilen „Es“/„Her“,
  Star-Wars-Franchise gegen einzelne Episode, negativ erwähnte Werke.
- Manipulierte Artikelanweisungen, erfundene Belege, 51/1.945 Antwortobjekte,
  überlange Felder, Unicode/JSON-Escaping, abgeschnittene Antworten, Refusal:
  keine ungeprüfte Übernahme und keine automatisch neue KI-Anfrage.
- Doppelstart, derselbe Text mit neuer Vorgangs-ID, zwei Konten, Timeout vor/
  nach Versand, Cache-/Leerfundtreffer, harte Budgets, Cleanup, Löschung/Export.
- Neues Feature initial aus; global aus überstimmt an; blockierter Storage,
  Logout und verspätete Antworten bleiben geschlossen. Manuelles Schreiben
  und Publizieren benötigen diesen Schalter nie.
- Alte Health-v5-Clients bleiben funktional. UI am schmalen Bildschirm,
  Tastatur und Checkboxfokus; Mehrfachübernahme in genau einem aktuellen Draft;
  kein permanenter Referenzzähler. Vorschläge außerhalb der 50er-Grenze nicht
  teilweise übernehmen. Keine öffentliche Offenlegung privater Identitäten.

Anschlusspunkte für diese Nachweise sind unter anderem `ai_task_test.ts`,
`ai_user_task_contract_test.mjs`, `kischalter_test.mjs`,
`blogprofilanalyse_test.mjs`, `private_release_legal_test.mjs`,
`private_ops_contract_test.mjs` und die vorhandenen Blog-UI-/Gesamtwegtests.
Neue Verhaltensfälle ergänzen, statt lediglich Implementierungstext abzugleichen.

Erst mit ausdrücklich benanntem Live-Testbudget: ein kleiner Goldstandard
mit acht synthetischen, vorab vollständig annotierten Texten, beide Modelle
auf denselben Texten (höchstens 16 zahlende Requests, kein automatischer Retry).
Darin auch eine dichte 50er-Liste und Mehrdeutigkeiten. Maximal 30 US-Cent
Reservierung je Request ergäben höchstens 480 US-Cent für diese Vergleichsserie;
alle vorhandenen strengeren Monats-/Laufgrenzen gelten weiter. Ausschließlich
über den dafür passend erweiterten `npm run test:ai:eval`-Weg, niemals direkte
Providerloops. Eine vorhandene Freigabe eines früheren Audits wird nicht übernommen.

Getrennt protokollieren: korrekte direkte Nennungen, übersehene Titel,
falsche Titel, Qualität der Mehrdeutigkeitskennzeichnung, Schemagültigkeit,
Tokenkosten und Laufzeit. Sicherheitsinvarianten müssen vollständig halten;
als Qualitätsziel mindestens 98 % Präzision und 95 % Recall für eindeutig
erwähnte Einzeltitel im annotierten Satz. Die kleine Stichprobe ist ein
Startnachweis, keine allgemeine Qualitätsgarantie. Haiku wird erst dann zum
Standardkandidaten, wenn es die Kriterien ebenfalls erfüllt und im Vergleich
keine relevante Verschlechterung zeigt. Bis dahin bleibt Sonnet die geplante
Variante, ohne Behauptung einer bereits gemessenen besten Preis-Leistung.
Ein späterer Modellwechsel betrifft ausschließlich den versionierten Vertrag
dieses Tasks samt Prompt, Capability und Kostenkonfiguration. Den gemeinsamen
Alias `gross` nicht auf Haiku umbiegen; andere Sonnet-Aufgaben bleiben davon
unberührt. Kein stiller Modellwechsel bei Fehlern oder Budgetmangel.

## Spätere Bauaufteilung

Nach integriertem M6 zuerst den kleinen gemeinsamen Vertrag einfrieren:
Payload/Result, Statuscodes, Mehrfachübernahme, Settings-Key, ausgehandeltes
Health und Datenschutzfluss. Danach sind höchstens drei disjunkte Pakete
sinnvoll: Backend/SQL/Provider, Clientcontroller/Service/Settingslogik und
Blogoberfläche/DS-Texte. `App.jsx` und die zentrale Serviceanbindung gehören
ausschließlich dem Clientpaket; `privatePilotOps.js` und sichtbare DS-Texte
ausschließlich dem Oberflächen-/DS-Paket. Masterintegration prüft den
gemeinsamen Nutzerweg. Die genauen Startcommits und Dateilisten werden erst
bei einem Bauauftrag im einzigen Meilensteinregister eingetragen.

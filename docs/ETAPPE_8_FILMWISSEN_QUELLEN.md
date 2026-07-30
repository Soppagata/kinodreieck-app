# Etappe 8: Quellenfreigabe für gemeinsames Filmwissen

Stand: 30.07.2026
Geltungsbereich: öffentlich erreichbare, möglicherweise kommerzielle App;
automatisierter Abruf, kurze eigene Paraphrase und Veröffentlichung im
gemeinsamen Filmwissens-Cache.

Diese technische Produktprüfung ist keine Rechtsberatung. Jede Quelle bleibt
im Datenbankregister standardmäßig gesperrt und wird erst zusammen mit einem
engen, getesteten Adapter aktiviert.

## Adapterkandidaten

### Wikidata-Strukturdaten

Status: **Kandidat für Freigabe**, ausschließlich strukturierte Daten.

- Haupt-, Property- und Lexeme-Strukturdaten stehen unter CC0:
  <https://www.wikidata.org/wiki/Wikidata:Licensing>
- API-Nutzung braucht einen identifizierbaren User-Agent, vernünftige
  Drosselung und korrektes Verhalten bei 429:
  <https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines>
- Erlaubter enger Umfang: QID, Identität, Datierung, Länder, Sprachen,
  Urheber, Auszeichnungen und Registry-IDs.
- Wikidata ist kein alleiniger qualitativer WARUM-Beleg. Verweist ein Statement
  auf die Library of Congress, erhält es dieselbe Herkunftsgruppe wie der
  LOC-Beleg und zählt nicht als unabhängige zweite Quelle.

Implementierter Adaptervertrag:

- ausschließlich `https://www.wikidata.org/w/api.php`,
- QID direkt oder exakte Auflösung von IMDb über `P345` und TMDB über `P4947`,
- keine Titel-, Jahres- oder Freitextsuche als Fallback,
- feste Filmtyp- und Property-Positivliste; Bewertungsscores, Wikipedia-Texte
  und LOC-abgeleitete Aussagen werden verworfen,
- identifizierbarer User-Agent ist Pflicht. Vor Aktivierung muss Max eine
  öffentlich erreichbare Produkt-/Support-Kontaktangabe festlegen.

### Library of Congress / National Film Registry

Status: **Kandidat für Freigabe**, nur freigegebene offizielle Dokumenttypen.

- Die Registry dokumentiert Aufnahmen wegen kultureller, historischer oder
  ästhetischer Bedeutung:
  <https://www.loc.gov/programs/national-film-preservation-board/film-registry/>
- Öffentliche JSON-/YAML-API ohne Schlüssel; dokumentierte Grenze derzeit
  20 Anfragen pro Minute:
  <https://www.loc.gov/apis/json-and-yaml/working-within-limits/>
- Rechtehinweise:
  <https://www.loc.gov/legal/security-copyright-and-privacy/understanding-copyright/>
- Erlaubter enger Umfang: Registry-Mitgliedschaft, Aufnahmejahr und eindeutig
  LOC-/US-Government-verfasste Kurztexte.
- Gastessays, Interviews, Bilder, Filme und nachgedruckte Texte sind nicht
  pauschal freigegeben. Der Adapter braucht deshalb eine Endpoint- und
  Dokumenttyp-Allowlist, nicht bloß `loc.gov` als Domain.

Implementierter Adaptervertrag:

- ausschließlich die vollständige offizielle Registry-Liste unter
  <https://www.loc.gov/programs/national-film-preservation-board/film-registry/complete-national-film-registry-listing/?fo=json&at=content.markup>,
- genau die drei Tabellenspalten Filmtitel, Erscheinungsjahr und Aufnahmejahr;
  keine Essays, Bilder, Interviews, Filme oder verlinkten Dokumente,
- vollständige Snapshot-Prüfung mit 25 Einträgen je abgeschlossenem
  Aufnahmejahr und konservativer Größenbegrenzung,
- Zuordnung nur nach Wikidata-geprüfter Filmidentität, exaktem Titelalias und
  exakt einem vierstelligen Erscheinungsjahr; kein ±1-Jahr- oder
  Remake-Fallback,
- eine Nichtübereinstimmung bedeutet nur `kein Beleg`, niemals
  „nicht im Registry“.

### Europeana-Metadaten

Status: **Kandidat für Freigabe**, ausschließlich Metadaten.

- Europeana-Metadaten stehen unter CC0; digitale Objekte besitzen eigene
  Rechte:
  <https://www.europeana.eu/eu/rights/terms-of-use>
- Gewünschte Attribution und Provenienz:
  <https://www.europeana.eu/eu/rights/usage-guidelines-for-metadata>
- Offizielle APIs und Schlüsselzugang:
  <https://pro.europeana.eu/page/apis> und
  <https://pro.europeana.eu/page/get-api>
- Archivpräsenz ist höchstens ein Kontextsignal und keine automatische
  qualitative Relevanzbehauptung.

## Gesperrte Quellen

### The Guardian

Status: **gesperrt bis zu einem individuellen Commercial-Vertrag**.

Der Developer-Key ist nur für nichtkommerzielle Nutzung gedacht. Generative
KI, Text-/Data-Mining und abgeleitete Produkte erfordern den kommerziellen
Zugang:
<https://open-platform.theguardian.com/access/>.

### IMDb

Status: **gesperrt ohne schriftliche Datenlizenz**.

Die bereitgestellten Gratisdaten sind auf persönliche, nichtkommerzielle
Nutzung beschränkt; automatisiertes Scraping ist nicht der erlaubte Weg:
<https://help.imdb.com/article/imdb/general-information/can-i-use-imdb-data-in-my-software/G5JTRESSHJBBHTGX>.
Eine IMDb-ID darf weiterhin als Identifikator dienen, nicht als automatisch
ausgelesene Forschungsquelle.

### Rotten Tomatoes

Status: **gesperrt ohne schriftliche API-/Content-Lizenz**.

Eine Integration mit API oder Data Feed verlangt eine geschäftliche Anfrage:
<https://www.rottentomatoes.com/help_desk/licensing>. Die allgemeinen
Fandango-Bedingungen erfassen Rotten Tomatoes und untersagen unter anderem
systematische automatisierte Sammlung:
<https://www.fandango.com/policies/terms-and-policies>.

### film.at

Status: **gesperrt ohne schriftliche Vereinbarung mit dem Betreiber**.

Die verlinkten Nutzungsbedingungen erlauben keinen dokumentierten
automatisierten Recherche-, Cache- und KI-Paraphrasepfad:
<https://kurier.at/info/anb/254619647>.

## Verbindliche technische Folge

- Kein Websearch-Modell erhält freien Zugriff auf Domains.
- Nur serverseitig geladene, URL-gebundene Fundstellen gelangen in den Prompt.
- Freigabe gilt pro Adapter, Endpoint/Dokumenttyp und Inhaltsklasse.
- Redirect-Ziel, Domain, Content-Type, Größe, Zeitlimit und Abrufhash werden
  serverseitig geprüft.
- Zwei Domains zählen nur dann als zwei Belege, wenn auch ihre
  Herkunftsgruppen unabhängig sind.
- Fehlt mindestens ein starker kultureller Beleg, lautet das Ergebnis
  `nicht belegt`; es wird keine WARUM-Zahl erfunden.
- Der erste Synthesepfad braucht beide unabhängigen Herkunftsgruppen:
  `wikidata-community` und `loc-national-film-registry`.
- Beide Quellen stehen in der Produktionsdatenbank weiterhin auf `kandidat`;
  Abruf, Cache, Paraphrase und Anzeige sind noch nicht freigegeben.

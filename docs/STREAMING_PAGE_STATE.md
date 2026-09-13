# Streaming-Seitenzustand

Stand: 13.09.2026. Paket B auf Basis `75fdcd97ec7c7098d2eafcbbdd657e8fbe60de0d`.

## Gebauter Zustand

`src/services/streamingPages.js` kapselt den authentifizierten Aufruf von
`kd_streaming_page`. Vor Cache- und Netzwerkzugriff muss eine bereite
Account-Session mit `remoteStorage` vorliegen. Token, Antwort und Cachewrite
werden erneut gegen dieselbe Account-ID geprüft. Der Cachewrite läuft nach der
Netzantwort unabhängig und verzögert die erste Anzeige nicht. Nach dem
asynchronen `caches.open` wird die Account-/Capability-Grenze unmittelbar vor
`put` erneut geprüft; ein Wechsel während `put` entfernt den alten Eintrag
best effort. Ein gleicher Request besitzt
genau einen laufenden Netzwerkaufruf. Nur die eindeutige PostgREST-Klasse fuer
eine fehlende Funktion traegt die Marke `streaming-page-rpc-missing`.

Der Gerätecache liegt in CacheStorage. Seine Hülle bindet Account,
normalisierten Request, Quellenversion, Cachezeit und die unveränderte
Serverantwort der ersten Seite. Automatische Cursor-Folgeseiten werden nicht
zusätzlich persistent abgelegt, weil der Reload nur Cursor `null` liest. Der
Cache speichert weder HTML noch einen Vollkatalog in
localStorage/sessionStorage. Ein Eintrag verfällt spätestens sechs Stunden
nach dem Read oder am früheren `nextExpiryAt`. Der Cachezeitpunkt ersetzt und
verlängert keinen fachlichen Neu-Zeitstempel.

`createStreamingPageController` hält Seiten über Tabwechsel in einem
Sitzungszustand. Er zeigt eine gültige erste Cache-Seite sofort, aktualisiert
sie unabhängig im Hintergrund und lädt anschließend automatisch serielle
20er-Datenpakete. Der RPC-Vertrag akzeptiert weiterhin ausdrücklich angeforderte
Limits bis 200; der normale App-Lauf nutzt sie nicht. Beim Verlassen des
Streaming-Tabs endet die Kette nach dem
bereits laufenden Request; Items und Cursor bleiben erhalten und werden beim
Zurückkehren fortgesetzt. Filter-, Account-, Capability- und Logoutwechsel
wechseln die Generation. Antworten der alten Generation dürfen dann weder
sichtbaren State noch den Controllercache verändern.

Die öffentliche Query-Kennung ist ein kurzer stabiler Hash mit Accountscope;
sie enthält keine Dienste-, Mediathek- oder Fristparameter im Klartext und ist
damit als Session-Schlüssel geeignet. Intern bleibt die vollständige
normalisierte Signatur für Kollisions- und Kontextprüfung erhalten. Derselbe
fertige Record baut weder Items noch Mediathekzuordnungen erneut. Fehler einer späteren Seite
lassen bereits sichtbare Items stehen und starten keinen Retry. Bei
`version_changed` beginnt der Controller einmal sauber bei Cursor `null`,
statt Stände zu mischen.

Vor jeder Wiederverwendung und beim PWA-Resume prüft der Controller
`nextExpiryAt`. Abgelaufene Neu-Items und Zähler werden vor dem Neustart
entfernt. Ein Record-Epoch verwirft dabei noch laufende Seiten des alten
Stands. Fertige Sitzungsrecords werden nach fünf Minuten im Hintergrund neu
validiert; schnelle Tabwechsel bleiben ohne neuen Read. `visibilitychange`,
`pagehide` und `pageshow` pausieren und starten die Seitenkette passend zur
Sichtbarkeit. Die vier vorhandenen Sortierungen `titel`, `jahr`, `art` und
`anbieter` werden ohne stillen Fallback normalisiert.

Der Mediathekabgleich in `src/lib/staffeln.js` besitzt einen nach
Master-Arrayidentität wiederverwendeten Kandidaten-/ID-Index. MotN behält die
vorhandene strenge Strong-ID-Entscheidung; der Statuspfad behält seine bisherige
Watchmode-/IMDb-/TMDB-Parität. Die neue Seitenprojektion akzeptiert nur einen
eindeutigen konfliktfreien Strong-ID- oder Titel/Jahr/Typ-Match. Ein vom Server
mitgegebenes `library_id` wird entfernt, wenn der Client es nicht gegen den
aktuellen Master bestätigen kann.

## App-Naht und autorisierte Requestnutzlast

Max hat am 13.09.2026 ausdrücklich erlaubt, die folgenden reduzierten Angaben
für vollständige Zähler und Filter an das bestehende Supabase-Backend zu
übergeben. Bewertungswerte und Notizen sind kein Teil dieser Katalogabfrage.
`App.jsx` aktiviert damit den gemeinsamen Controller und reicht
`streamingPage` sowie die identitätsstabile Callbackfunktion
`onStreamingPageQuery` an `StreamingTab`:

- `services`: die aktuelle accountgebundene Streaming-Dienstauswahl.
- `library`: aus `master` ausschließlich `id`, `watchmode_id`, `streaming_id`,
  `imdb_id`, `tmdb_id`, `titel`, `originaltitel`, `jahr`, `typ`.
- `seenIds`: Streamingkennungen mit bestehendem Status `gesehen`.
- `mustWatchIds`: die bereits ermittelten Mediathek-IDs aus
  `mustwatchMasterIds`.
- `ratedIds`: Mediathek-IDs mit vorhandener Bewertung.
- `newEntries`: unveränderte bestehende Felder `id`, `fensterBeginn`,
  `verbrauchtBis` aus dem account-/auswahlgebundenen Fristenbuch.
- `legacyNew`: unveränderte bestehende Felder `id`, `firstSeenAt` aus dem
  ownergebundenen Übergangsstand.
- `mapItems`: `verknuepfeStreamingPageMitMediathek(items, library)`.
- `legacyFallback`: ausschließlich bei `streaming-page-rpc-missing` einmal
  `ladeStreamingDateien(true)`; jeder andere Fehler bleibt im Seitenzustand.

Der Effekt, der allein beim Öffnen von Streaming sofort
`ladeStreamingDateien(true)` startete, ist im aktiven Seitenmodus gesperrt.
Auch die gezielte Navigation zu einem Streamingtitel zieht dort nicht vorab
den Vollkatalog. Bei einem direkten Streamingstart wartet der automatische
Known-Read bis zur ersten sichtbaren Cache- oder Netzseite; bei Seitenfehlern
und beim Wechsel zu Start, Kino, Mediathek oder Entdecken läuft er sofort. Der
asynchrone Kontoboot hält dafür den gespeicherten Startbereich fest, bis die
Remote-Capability bereit ist; der vorläufige Mediathek-Tab kann den Read nicht
mehr vorzeitig öffnen. Eine inzwischen erfolgte Navigation erhöht ihre
Revision und wird von einer später eintreffenden Einstellung nicht
überschrieben. Der Known-Lader prüft diese aktuelle Freigabe nochmals direkt
vor dem Request, sodass eine bereits eingeplante Boot- oder
Betriebsart-Closure keine veraltete Renderentscheidung ausführen kann. Auch ein
sofortiger Klick auf `Alles`, solange `StreamingTab` vor seinem ersten Effect
noch den Legacy-Zustand sieht, startet im vorgesehenen Account-Seitenmodus
keinen Known- oder Vollkatalog-Read. Diese Routenentscheidung gilt bereits vor
`bootDone`; die eigentliche Seitenaktivierung wartet weiterhin auf Boot,
Snapshotfreigabe und Dienstauswahl. Die Seitenquery übernimmt anschließend die
gewählte Ansicht. Ein automatisch freigeschaltetes Cage-Alphabet behält seinen
Vollkatalogbedarf während dieser Erstantwort als offenen Versuch, startet ihn
aber noch nicht und würfelt auch keinen vorläufigen Pool. Nach der ersten
sichtbaren Seite wird genau der bisherige geteilte Cage-Katalogversuch
fortgesetzt. Der kontrollierte Missing-RPC-Fallback bleibt davon getrennt
und darf weiterhin genau einmal den Vollweg laden. Der
Known-Read behält seine vollständige MotN-Überlagerung, damit entfernte
Watchmode-Angebote weder in Badges noch in Entdecken-Kandidaten zurückkehren.
Der vorhandene große MotN-Anhang wird anschließend weiterhin übertragen und
verarbeitet; Paket B spart an dieser Stelle keine Bytes ein. Ausdrücklich
angeforderte Vollkatalognutzer bleiben bestehen. Nur wenn der neue RPC
eindeutig fehlt, lädt der Controller einmal den kompatiblen Vollkatalog und
deaktiviert den Seitenzustand. Eine noch ladende Dienstauswahl gilt weder beim
Boot noch beim gezielten Streaming-Sprung als Legacyzustand und startet keinen
Vollkatalog.

Master, Must-Watch, Entdecken-Status und Streaming-Dienste werden heute bereits
als persönliche Töpfe über `ACCOUNT_SYNC_KEYS` in `kd_personal` desselben
Supabase-Projekts gespiegelt. Die neue Naht überträgt daraus reduzierte Parameter
zusätzlich pro Seitenrequest. `newEntries` und `legacyNew` sind
derzeit abgeleitete Gerätecachewerte und keine `ACCOUNT_SYNC_KEYS`.

Die vor der Freigabe geprüfte Alternative ohne diese zusätzliche Requestnutzlast
wäre, die bereits
synchronisierten Own-Row-Töpfe innerhalb des RPC auszulesen. Sie wäre nur für
den bestätigten Serverstand exakt; lokale noch nicht synchronisierte Änderungen
und die beiden nicht synchronisierten Fristanker fehlten. Damit erreicht sie
die eingefrorenen Filter-, Zähler- und 14-Tage-Verträge nicht vollständig und
ist kein gleichwertiger lokaler Ersatz.

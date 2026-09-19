# Optionaler Blog-Scan: eingefrorener Integrationsvertrag

Stand 18.09.2026, M7. Gilt vor den Parallelpaketen A/B/C. Der ausführliche
Produktentwurf bleibt `docs/zukunft/BLOG_REFERENZEN_KI_PLAN_2026-09-18.md`;
bei Abweichungen gilt dieser um Musik und Sonstiges erweiterte Bauvertrag.
Das einzige Fortschrittsregister bleibt das Bauebenen-Dokument.

## Umfang und Typen

Ein ausdrücklicher Klick sendet Blogtitel und vollständigen begrenzten Blogtext
an Anthropic. Ein Providerrequest, keine Websuche, keine automatische
Wiederholung, keine Modellkaskade. Sonnet über den unveränderten Alias `gross`,
explizit `thinking: { type: "disabled" }`. Globale Aliase/Reserven bleiben gleich.

Der vorhandene Referenzvertrag unterstützt bereits `film`, `serie`, `musik`,
`sonstiges`. KI-Kategorien `film`, `series`, `music`, `other` werden darauf
abgebildet. `title_group` und `unclear` brauchen eine konkrete Nutzerentscheidung.
Musik/Sonstiges werden niemals als Film behandelt. Belegte Werke kommen aus
der eigenen bereits geladenen Mediathek, der Merkliste, dem bereits geladenen
aktuellen Kinoprogramm und einer nach dem ausdrücklichen Scan begrenzten Suche
im vorhandenen serverseitigen Streamingbestand. Diese Suche verwendet den
kontogebundenen `kd_mustwatch_streaming_candidates`-Pfad seriell und dedupliziert
für höchstens acht Titel mit höchstens 20 Treffern je Titel. Sein positiver und
negativer Cache wird wiederverwendet; es gibt keinen automatischen Retry, keine
Providerabfrage und keine Vollkatalogladung.
Für Musik/Sonstiges besteht kein belegter externer Resolver. Nicht gefundene
klare Inhalte bleiben als Werkreferenz mit automatischer späterer Auflösung
erfassbar. Eine fehlende Quelle ist keine Werkmehrdeutigkeit und verlangt keine
zweite Bestätigung. Nur fachlich ungeklärte Angaben dürfen bewusst
manuell/unverknüpft bestätigt werden.
Urheber/Jahr werden als Werkdaten nur angezeigt, soweit der Bestand sie belegt.

## API-Naht A/B

- Task `blog-reference-extract`, Prompt/Result `blog-reference-extract-v1`.
- Fachpayload exakt `{ title: string, text: string }`, beide nichtleer, im bestehenden ai-task-
  Umschlag. Keine Account-, Artikel-, Mediathek-IDs oder Referenzen zum Provider.
- Bestehendes `blog-profile-extract` und nicht ausgehandeltes `ai-task-v5`
  bleiben unverändert. Neuer Client fordert bei `health` ausdrücklich
  `payload: { capabilities: ["blog-reference-extract-v1"] }` an. Nur dann kommt
  zusätzlich `capabilities.blogReferenceExtract` und der neue Task in der
  angefragten Aufgabenliste. Ältere Server ohne diese Capability sind nicht bereit.
- Capability: `{ contractVersion: "blog-reference-extract-v1", enabled: boolean,
  modelAlias: "gross", maxTextBytes: 18000, maxTitleBytes: 512,
  maxCandidates: 50 }`. `enabled` setzt Konfiguration, Migration, Providerfreigabe,
  Schlüssel, versionierten Build und passende feste Reservierungsgrenze voraus.
- Erfolg enthält immer `{ ok, task, vorgangId, data }`. Eine frische normale
  ai-task-Antwort darf zusätzlich ausschließlich `modellAlias`, `modell`,
  `providerReceipt` und `verbrauch` tragen; eine Cache-Antwort darf diese vier
  Metadaten auslassen. Der Client verwendet sie nicht für Vorschläge oder
  Persistenz. `data` ist exakt
  `{ contractVersion, candidates, partial, expiresAt }`; Version wie oben,
  `partial` boolean, `expiresAt` ISO-Zeitpunkt der unverlängerten Cachefrist.
- Ein Kandidat enthält exakt `{ candidateId, mention, titleSuggestion, kind,
  year, interpretation, evidence }`. `kind` ist
  `film|series|music|other|title_group|unclear`, `interpretation` ist
  `direct|interpreted|ambiguous`, `year` Integer 1–2200 oder null; bei
  `film`/`series` bleibt die bestehende Untergrenze 1870. Der v2-Publikations-
  validator akzeptiert für `musik`/`sonstiges` gezielt Jahre ab 1, entsprechend
  dem vorhandenen Mediathekvertrag; v1 und Film-/Seriengrenzen bleiben gleich.
  Diese ausdrücklich genehmigte Shared-Validatoränderung steht in der neuen
  additiven Migration `20260918170000_blog_reference_v2_years.sql`; bereits
  angewandte Migrationen bleiben unverändert. Der neue Serverschalter wird
  erst nach dem Backend-Readback aktiviert.
  `evidence` ist `{ field: "title"|"text", quote, start, end }`, Positionen sind
  serverseitig ermittelte UTF-16-Indizes des exakten Zitats im unveränderten Feld.
  `candidateId` wird serverseitig deterministisch erzeugt (opaker String).
- Das Modell liefert nur die fachlichen Felder ohne ID/Positionen. Unbekannte
  Felder, URLs/IDs als Werkbelege, kaputtes JSON und abgeschnittene Antworten
  werden nicht repariert. Einzelne ungültige Kandidaten dürfen nur mit
  `partial: true` verworfen werden. Leere validierte Ergebnisse sind gültig.
- `mention` muss im Zitat liegen; das vollständige Zitat muss exakt im
  bezeichneten Eingabefeld stehen. Ein Jahr braucht denselben Textbeleg.
  Erwähnung/Titel jeweils maximal 160 Zeichen, Zitat maximal 320 UTF-8-Bytes.
  Der Client behandelt Ergebnisse zusätzlich als untrusted und prüft die Bindung.
- Fehler verwenden bestehende ai-task-Fehlercodes plus klaren `grund`; niemals
  einen Success mit ungeprüften Kandidaten oder eine automatische Reparaturanfrage.

## Feste Grenzen und private Lebensdauer

Titel 512 UTF-8-Bytes, Text 18.000 Bytes ohne Kürzung, eigener JSON-Request
32 KiB, gebauter Providerbody 48 KiB, Antwortlesen maximal 64 KiB,
8.192 Ausgabetokens, 60 Sekunden einschließlich Bodylesen, Taskdeckel 30 US-Cent.
Höhere konfigurierte Preise dürfen vor Versand ablehnen, den Deckel nicht erhöhen.
Alle strengeren bestehenden Konto-/Tages-/Monats-/Anbietergrenzen gelten weiter.
Providerbody und Kostenreservierung müssen dieselben Bytes verwenden.

50 Kandidaten; normalisiertes Ergebnis maximal 32 KiB. Bei Überschreitung nur
belegte vollständige Kandidaten und deutliche Teilvorschau, keine stille Kürzung.
Atomar ein Auftrag/Konto, vier global, drei neue Starts/Minute und zehn/Tag.
Identische Ergebnisse zählen nicht als neuer bezahlter Start. API-Leserate begrenzt.

Private Tabelle `kd_blog_reference_extractions`, Zugriff nur über den Dienst.
Kontogebundener serverseitiger Inhalts-HMAC plus Modell/Prompt/Resultversion;
Rohtext nicht zusätzlich speichern. Maximal zehn Ergebnisse/320 KiB pro Konto.
24 Stunden Anzeige ab Erstellung, danach stündlicher begrenzter Purge.
Rückstau oder Betriebsstörungen können die physische Entfernung verzögern;
eine feste 25-Stunden-Höchstfrist wird nicht zugesagt. Auth-Account-FK mit Cascade;
noch vorhandene Inhalte über die neue service-only RPC
`kd_blog_reference_extract_own_data(p_account_id uuid)` exportieren.
`kd_private_own_data(uuid)` bleibt unverändert. `account-self-service` ergänzt
`blogReferenceExtractions` nur bei ausdrücklich angefragtem GET-Parameter
`?include=blog-reference-extract-v1`; die normale Altantwort bleibt unverändert.
Der neue Client fordert diese Erweiterung an und validiert sie streng. Keine
Ausweitung der Löschfreigaben.
Unsicherer Providerausgang bleibt terminal/konservativ gebucht; Lease-Ablauf
startet keinen neuen Providerrequest für denselben Auftrag. Keine Rohinhalte,
Titel, Zitate oder Antworten in Logs. Cleanup und Export gehören Paket A.

## Client-/UI-Naht B/C

Neuer Geräteschalter `blogReferenzen`, `standardAn: false`, `beiAus: "ausblenden"`.
`KI_WAHL_VERSION = "e8-v1"` bleibt erhalten. A liefert die serverseitige
Berechtigung für alle aktiven entsprechend berechtigten Konten. B prüft
`kiAn("blogReferenzen")`, `personalAi`, Capability und Restkapazität bei Start
und Übernahme. C besitzt ausschließlich die Schalterdefinition und DS-Texte.

B besitzt `useBlogReferenceExtractionController`, Service und Editoranbindung.
Bindung `{ accountScope, draftKey, contentHash, requestId }`; Hash über exakte
Titel/Text-Paarung, niemals als Ersatz für Kontogrenzen. Wechsel von Text,
Entwurf, Konto, Editor oder KI-Freigabe macht Antwort/Übernahme ungültig.
Keine Vorauswahl, auch nicht bei genau einem Treffer. Erwähnungsauswahl und
konkrete Werkauswahl sichtbar unterscheiden. Mediathek, Merkliste, Streaming und
Kino sind Fundorte desselben Werks und niemals auswählbare Werkalternativen.
Fundorte werden nach starker gemeinsamer ID oder, ohne ID-Konflikt, nach exaktem
Titel, Typ und bekanntem Jahr zusammengeführt. Widersprüchliche IDs, Typen oder
Jahre sowie echte Remakes bleiben getrennte Werke; ein ID-loser Fund darf keine
widersprüchlichen ID-Gruppen transitiv verbinden. Nur bei mehreren tatsächlich
verschiedenen Werken oder fachlich ungeklärtem Typ ist eine zweite Entscheidung
nötig. Ein klarer KI-Titel wird nach der äußeren Erwähnungsauswahl unmittelbar
als Werkreferenz mit `resolutionIntent: { kind: "auto" }` übernommen, auch ohne
aktuellen Fundort. Die manuelle unverknüpfte Bestätigung bleibt auf echte
Unklarheit beschränkt und erzeugt keinen Mediathek-Eintrag.

Streaming- und Kinofunde zeigen ihre Herkunft. Nicht geladene, abgelaufene oder
fehlgeschlagene Quellen werden ausdrücklich als nicht vollständig geprüft
angezeigt. Quellenstand und Ablaufzeit gehören zur Entwurfsbindung; nach Ablauf
ist vor der Übernahme ein neuer Scan nötig. Gespeichert wird die Werkidentität,
nicht ein ausgewählter Fundort. Private, befristete Quellenbeobachtungen dürfen
die direkte Navigation nach Save/Reload ermöglichen. Beim späteren privaten
Lesen werden aktuelle kontoeigene Mediathek-, Merklisten-, Streaming- und
Kinoziele erneut aus der Werkidentität aufgelöst. In die öffentliche
Publikationsprojektion gelangen ausschließlich öffentliche starke
Identitätshinweise, niemals private Referenz- oder Fundort-IDs.

`onApplyReferenceSuggestions({ draftKey, contentHash, candidates })` prüft die
aktuelle Liste, erhält Reihenfolge/Identitäten und fügt die gesamte Auswahl in
einer Zustandsänderung hinzu. Keine Einzel-Speicherschleife. Bei zu wenig Platz
keine Teilübernahme. Bestehende Dubletten konservativ nach bestätigter Identität
behandeln, Remakes nicht zusammenwerfen. Normales Speichern/Publizieren bleibt
ein gesonderter ausdrücklicher Weg. Bei 50 Referenzen kein bezahlter Start.

UI-Nebenaktion „Titel im Text erkennen (KI)“, sofortige kleine Datenschutzhilfe:
„Sendet die Überschrift und diesen Blogtext an Anthropic. Persönliche Angaben
im Text werden mitgesendet. Du entscheidest, welche Vorschläge übernommen werden.“
Anonyme Veröffentlichung anonymisiert den KI-Eingabetext nicht. Fehler/Abbruch
blockieren weder Schreiben noch Speichern oder manuelle Referenzen.

## Exklusive Ownership dieser Welle

- A Backend: `supabase/**`, neue Backend-/PG-Tests `blog_reference_extract_backend*`,
  `blog_reference_extract_pg*`, ergänzende bestehende backendbezogene Tests.
  Keine Frontend-/Registry-/Packageänderungen. Eine additive neue M7-Migration;
  angewandte historische Migrationen und M6-Produktvertrag bleiben unverändert.
- B Editor/Client: `src/App.jsx`, `src/controllers/useBlog*`, `src/components/blog/**`,
  `src/tabs/BlogTab.jsx`, `src/styles/blog.css`, `src/services/ai.js`,
  `src/lib/aiDriver.js`, `src/lib/artikel.js`, `src/lib/blog*.js`,
  neue `blog_reference_extract_client*`/`blog_reference_extract_ui*`-Tests.
  Notwendige Änderungen an bestehenden eigenen Clienttests gehören B.
- C Settings/Datenschutz: `src/lib/kiSchalter.js`, `src/tabs/DatenTab.jsx`,
  `src/lib/privatePilotOps.js`, `src/lib/personalDataRegistry.js`,
  `src/lib/hilfeInhalte.js`, `src/components/DatenschutzDienste.jsx`,
  `src/components/EinstiegsGate.jsx`, `src/components/PrivatePilotOps.jsx`,
  neue `blog_reference_extract_privacy*`-Tests und bestehende eigene Settings-/DS-Tests.
  Benanntes Integrationsdelta: `src/services/accountSelfService.js` und dessen
  fokussierte Tests für den expliziten Export-Opt-in gehören ebenfalls C.
- Meister: Vertragsdokumente, das eine Register, Package-Testregistrierung,
  integrierter Nutzerwegtest, Integration und Auslieferung. Keine parallele
  Fachimplementierung, keine zusätzlichen Reviewagenten.

Alle Pakete starten vom selben Vertragscommit. Änderungen an dieser Naht
vorab als `BLOCKER:SCOPE_DRIFT` melden; disjunkte Arbeit läuft weiter.

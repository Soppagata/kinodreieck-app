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
der eigenen bereits geladenen Mediathek und gegebenenfalls bereits geladenen
Bestandskatalogen; keine neue externe Katalogabfrage oder Vollkatalogladung.
Für Musik/Sonstiges besteht kein belegter externer Resolver. Nicht gefundene
Inhalte bleiben nach ausdrücklicher Bestätigung manuell/unverknüpft erfassbar.
Urheber/Jahr werden als Werkdaten nur angezeigt, soweit der Bestand sie belegt.

## API-Naht A/B

- Task `blog-reference-extract`, Prompt/Result `blog-reference-extract-v1`.
- Fachpayload exakt `{ title: string, text: string }` im bestehenden ai-task-
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
- Erfolg im bisherigen `{ ok, task, vorgangId, data }`-Umschlag. `data` ist exakt
  `{ contractVersion, candidates, partial, expiresAt }`; Version wie oben,
  `partial` boolean, `expiresAt` ISO-Zeitpunkt der unverlängerten Cachefrist.
- Ein Kandidat enthält exakt `{ candidateId, mention, titleSuggestion, kind,
  year, interpretation, evidence }`. `kind` ist
  `film|series|music|other|title_group|unclear`, `interpretation` ist
  `direct|interpreted|ambiguous`, `year` Integer 1870–2200 oder null.
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
24 Stunden Anzeige ab Erstellung, stündlicher Purge, spätestens 25 Stunden
physische Entfernung im normalen Schedulerbetrieb. Auth-Account-FK mit Cascade;
noch vorhandene Inhalte in `kd_private_own_data` unter
`blogReferenceExtractions` aufnehmen. Keine Ausweitung der Löschfreigaben.
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
konkrete Werkauswahl sichtbar unterscheiden; mehrere gleichnamige Werke dürfen
bewusst übernommen werden. Mehrdeutige Film-/Musik-/Sonstiges-Werke nebeneinander
anbieten; Typ/Jahr/Urheber nur mit Bestandsbeleg. Keine reine Titelgleichheit
bei widersprechenden IDs, Typen oder Jahren; keine unscharfe automatische Bindung.

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
- Meister: Vertragsdokumente, das eine Register, Package-Testregistrierung,
  integrierter Nutzerwegtest, Integration und Auslieferung. Keine parallele
  Fachimplementierung, keine zusätzlichen Reviewagenten.

Alle Pakete starten vom selben Vertragscommit. Änderungen an dieser Naht
vorab als `BLOCKER:SCOPE_DRIFT` melden; disjunkte Arbeit läuft weiter.

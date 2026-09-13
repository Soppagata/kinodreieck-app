# Eingefrorener Vertrag: progressive Kataloganzeige

Basis: cfcaae6. Auftrag Max, 13.09.2026: Seitenrahmen, vollständige Zähler und erste 10–20 Titel zuerst; weitere Daten solange der Bereich offen ist. Wiederkehr aus Sitzung/Browsercache. Keine neue 14-Tage-Frist durch Cache oder Watchmode-Übernahme. Keine Providerabfrage durch Browserbesuche.

## Server-Lesevertrag (Owner A)

Authentifiziertes Supabase-RPC `kd_streaming_page(p_request jsonb)`. Nur fachlich aktive Konten dürfen lesen; keine Service-Keys im Browser. Liefert ausschließlich gespeicherte Daten. Kein MotN-/Watchmode-/KI-Aufruf. Bestehendes `kd_streaming_catalog` bleibt kompatibel.

Request:

```js
{
  format: 1,
  services: ["Netflix", "Disney+"], // exakte bestehende Dienstnamen
  view: "all", // all | new | library
  limit: 20, // initial 20, Vorladen maximal 200, seriell
  cursor: null, // opaque string der vorherigen Antwort
  filters: {
    suche: "", plattform: null, typ: null, genre: null,
    dekade: null, buchstabe: null, sort: "titel", richtung: "auf",
    status: null, nurWunsch: false, nurBewertet: false
  },
  library: [], // nur id, watchmode_id, streaming_id, imdb_id, tmdb_id,
               // titel, originaltitel, jahr, typ; keine Urteile/Notizen
  personal: {
    seenIds: [], mustWatchIds: [], ratedIds: [],
    // bestehende Fristanker für die aktuelle Auswahl, keine neue Historie
    newEntries: [], // {id, fensterBeginn, verbrauchtBis}
    legacyNew: [] // {id, firstSeenAt}
  }
}
```

`mustWatchIds` und `ratedIds` sind Mediathek-IDs; `seenIds` Streamingkennungen inklusive bestehender Aliasse. `newEntries`/`legacyNew` transportieren nur die bereits vorhandenen lokalen Fristanker. Server-Neu folgt demselben belegten Auswahl-/Fristvertrag wie die bestehenden reinen Projektionen. Ungültige Requests werden begrenzt abgelehnt. Limit nie mehr als 200; keine ungeprüften SQL-/Sortierausdrücke.

Erfolgsantwort:

```js
{
  format: 1, status: "ready", region: "AT",
  version: "opaque-source-version", generatedAt: "ISO timestamp",
  counts: { all: 5417, new: 205, library: 123 },
  total: 5417, // Treffer der konkreten Ansicht samt aktiven Filtern
  items: [], // bestehende Streaming-Titelobjekte, keine Kataloghülle/Offer-Liste
  nextCursor: "opaque-or-null", complete: false,
  nextExpiryAt: "ISO timestamp-or-null",
  meta: {
    stand: "ISO", katalog_stand: "version", gueltig_bis: null,
    stand_pro_quelle: {}, vergleich_stand_pro_quelle: {},
    motn_checked_at: null
  }
}
```

Counts gelten für die vollständige gewählte Dienstunion, unabhängig von geladenen Seiten und lokalen Ansichtsfiltern. `items` dürfen `library_id` als bereits sicher zugeordneten lokalen Bezug sowie `neu_seit` für die Frist enthalten. Bestehende Titel-/Dienst-/Alias-/Diff-/MotN-Felder werden erhalten. Client fügt eigene Mediathekfelder nur über bestätigte Zuordnung hinzu.

Ein Cursor bindet Quelle, Auswahl, Ansicht, Filter und die mitgelieferten persönlichen Identitäts-/Fristparameter. Bei überholtem Cursor: `{format:1,status:"version_changed",version:...}`. Keine gemischten Stände oder stillen Lücken. Die Quellenversion umfasst Watchmode UND MotN. Zeitbedingter Neu-Ablauf ist zusätzlich zum Quellenstand relevant.

Backend wählt eine kleine additive, lokal prüfbare Umsetzung mit wiederverwendbarer neutraler Projektion/Index. Kein vollständiger Neuaufbau je Seite, keine teuren Wiederholungen pro Nutzer, kein Lösch-/Umbau bestehender Originaldaten. Auth/RLS und Datenparität werden fokussiert geprüft. Migrationen werden nur lokal erstellt und getestet, nicht angewendet.

## App- und Cache-Vertrag (Owner B)

Neuer Service `src/services/streamingPages.js` exportiert `createStreamingPagesService` und `streamingPagesService`; `.loadPage(request, options?)` nutzt das RPC und bestehende Account-/Token-Grenzen. Einheitliches serviceinternes Deduplizieren laufender Requests, keine Schlüssel im Ergebnis. Browsercache speichert Daten/versionierte Hüllen, nicht fertiges HTML. Kein großer localStorage/sessionStorage-Katalog.

App besitzt einen gemeinsamen progressiven Zustand und gibt an StreamingTab:

```js
streamingPage = {
  enabled: true,
  status: "idle", // idle | loading | ready | refreshing | error
  view: "library", queryKey: "", version: null,
  items: [], counts: null, total: null, loaded: 0,
  hasMore: false, backgroundLoading: false,
  fromCache: false, error: null, nextExpiryAt: null
};
onStreamingPageQuery({ view, filters });
```

Die Callback-Identität bleibt stabil. StreamingTab sendet den initialen/aktiven Query über einen an primitiven Werten gebundenen Effekt. Der Controller kennt zusätzlich `tab === "streaming"`, pausiert beim Verlassen und hält den Zwischenstand für die Sitzung. Bereits geladene Seiten werden beim Wiederöffnen sofort benutzt. Erst 20, danach maximal 200 je Request, seriell und mit freiem Hauptthread zwischen Paketen. Sichtbare Inhalte bleiben bei einem späteren Fehler erhalten. Fehler, Logout und Filterwechsel starten keine Schleife. Kein neuer Full-Catalog-Read bei jedem Unterbereichswechsel.

Rohdaten, Ergebnisansichten und Identitätsindizes werden nach tatsächlichem Datenstand wiederverwendet. Die langsame Mediathekzuordnung wird mit gleichbleibender Identitätsprüfung indexiert. Kontobindung, Capabilitywechsel, Logout und veraltete Antworten bleiben gesichert. Neu wird mit unveränderten ursprünglichen Zeitstempeln beim Ablauf bzw. Wiederkehren geprüft; ungültige Zähler werden nicht als aktuell angezeigt.

Andere vorhandene Katalognutzer, Suche, Pins, Kino-Badges und Einzeldateibuild bleiben nutzbar. Explizite Vollbestandsnutzer dürfen einen bestehenden Vollweg behalten; der normale Streaming-/Entdecken-Einstieg darf ihn nicht unnötig auslösen. Der kleine bestehende Entdecken-Feed profitiert von Cache und nicht blockierender Anzeige, ohne neue Empfehlungsauswahl. Nur eindeutig fehlendes neues RPC erlaubt kontrollierten Legacy-Fallback; keine Authumgehung.

## Anzeigevertrag (Owner C)

`StreamingTab` erhält die zwei neuen Props zusätzlich. Wenn `streamingPage.enabled` fehlt/false ist, bleibt der Legacy-Vertrag kompatibel. Im neuen Pfad:

- Aktive Ansichten werden abgebildet: programm→library, entdecken→all, neu→new.
- Vollständige Tabzahlen kommen aus `counts`; gefilterte Ergebniszahl aus `total`, nicht aus `items.length`.
- Rahmen/Navigation zuerst, erste 20 Karten anzeigen. Weitere Daten dürfen bereits vorgeladen sein; weitere DOM-Karten in 20er-Portionen beim Scrollen/Weiterladen.
- Erneutes Anzeigen behält Ansicht, Filter, sichtbare Portion und Scrollposition je gültigem Query/Konto. Persistierung kleiner Ansichtsparameter ist erlaubt; keine Katalogdaten in Web Storage.
- Im Servermodus filtert/sortiert die UI keinen unvollständigen Bestand als wäre er vollständig. Queryänderungen gehen über den Callback; keine eigene Netzwerk-/Authlogik.
- Gleiche Kartenaktionen, sichere Navigation, Pins, Merkliste und Seen-Status. Keine vollständigen Mediathekabgleiche über 25.000 Titel während jedes UI-Wechsels.
- Entdecken zeigt seinen bestehenden Rahmen/Feed ohne Warten auf vollständigen Streamingbestand. Kein erfundener Gesamtzähler für den Empfehlungsfeed.
- Mobile Fokus-/Scrollwege bleiben nutzbar. Keine allgemeine Neugestaltung.

## Einmaliger Abschluss

Paketprüfungen belegen nur Richtigkeit im jeweiligen Scope. Meister prüft Diffs und integriert. Danach prüft genau EIN Baumeister EINMAL kontrolliert den integrierten Gesamtlauf (aktuelle Nutzervorgabe ersetzt den Skillstandard mit Meister-Abschlusslauf). Keine parallelen oder zusätzlichen Gesamtprüfer. Keine echten Providerrequests. Eventuelle konkrete Fehler gehen als Delta an den zuständigen Owner; keine vorsorglich wiederholten Gesamtaudits.

# Gemeinsame Titelfaktenprojektion

Stand: 11. September 2026. Dieser additive DTO-Vertrag ist die gemeinsame,
quellenneutrale Leseschnittstelle für Entdecken, Streaming und Faktenkontext.
Er löst keinen Anbieterabruf aus und enthält keine persönlichen Daten.

## `title-facts-projection-v1`

```js
{
  schemaVersion: "title-facts-projection-v1",
  source: "flixpatrol" | "watchmode",
  checkedAt: "ISO-8601" | null,
  fetchedAt: "ISO-8601" | null,
  freshUntil: "ISO-8601" | null,
  fresh: boolean,
  sourceUrl: "https://…" | null,
  identity: {
    flixpatrolId: "ttl_…" | null,
    imdbId: "tt…" | null,
    tmdbId: "…" | null,
    watchmodeId: "…" | null,
    title: "…" | null,
    originalTitle: "…" | null,
    year: 1979 | null,
    mediaType: "film" | "series" | null
  },
  description: "…" | null,
  descriptionLanguage: "de" | "en" | null,
  runtimeMinutes: 117 | null,
  premiere: "YYYY-MM-DD" | null,
  genres: [{ id: "gnr_…" | null, name: "…" }],
  keywords: [{ id: "kwd_…" | null, name: "…" }],
  charts: []
}
```

Unbelegte Einzelwerte sind `null`, unbelegte Mengen leer. Eine unbekannte
Beschreibungssprache bleibt `null`; sie wird insbesondere nicht als Deutsch
ausgegeben. `genres` und `keywords` enthalten nur belegte Begriffe. FlixPatrol-Begriffe
kommen aus dem zentralen Vocabulary-Cache; ein direkt belegter Watchmode-Name
darf mit `id: null` erscheinen, wenn keine ID-Zuordnung belegt ist. Provider-IDs sind opaque Strings. Chartbelege sind
Popularitätsbelege und keine Verfügbarkeitsangabe.

## Leseschnittstellen

`createFlixpatrolFactsService()` behält `load()` für die bestehenden fünf
Chartprojektionen. Additiv lädt `loadByIdentities(identities)` höchstens 50
deduplizierte Identitäten aus dem vorhandenen Cache. Eine Identität enthält nur
`flixpatrolId`, `imdbId` und/oder `tmdbId` sowie optional `mediaType`; mehrere IDs in demselben Objekt müssen
zu derselben Cachezeile gehören. TMDB wird zusammen mit `mediaType` abgefragt;
ohne Typ bleibt ein über Film und Serie mehrdeutiger Treffer leer. Namen, Freitext und persönliche Daten werden
nicht an die RPC übergeben. Der Kontextreader nutzt diese starke ID-Suche vor
dem bisherigen Chartfallback.

Die additive RPC `kd_title_facts_lookup(jsonb)` bleibt read-only, verlangt ein
aktives Konto (oder `service_role`) und liefert nur den obigen neutralen
Faktenbestand. Die alte `kd_flixpatrol_titles_read(text[])` bleibt verfügbar.
Ohne eingespielte Migration funktionieren die bestehenden Aufrufer weiter; der
neue Identitätsweg fällt leer aus.

## Providergrenze

`fetchTitles({ sourceIds, mediaTypes })` akzeptiert 1–10 eindeutige bekannte
FlixPatrol-IDs und eine gleich lange Typenliste (`film`/`series`). Es verwendet
den dokumentierten Filter `id[in]` als kommaseparierte ID-Liste. Erfolg setzt
exakt dieselbe ID-Menge, jeden erwarteten Typ und keine Duplikate voraus.

`fetchGenres({ sourceIds })` und `fetchKeywords({ sourceIds })` akzeptieren
jeweils 1–10 eindeutige, typgerechte IDs und verlangen ebenfalls die exakte
Antwortmenge. Jeder dieser Aufrufe ist genau eine Ledger-Operation mit eigenem
Requesttyp (`genres` beziehungsweise `keywords`), 15 Sekunden Obergrenze, ohne
Retry und mit `redirect: "error"`. Teilmengen, Zusatzwerte, Duplikate und
Typkonflikte enden als ungültige Antwort; aus einer Probe wird keine allgemeine
Vollständigkeit des Providers abgeleitet.

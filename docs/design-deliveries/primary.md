# D1, D3 und D4 – Hauptansichten

Paketbasis: `36772f32c2f170e199c803d551f80eda86d897d8`.

## Abdeckung

| Fläche | Lieferung |
| --- | --- |
| Start und Must-Watch | Papierkarten mit Barlow-600-Titeln in 22 px, vollständig umbrechenden Titeln, neutralen 12px-Dienstlabels sowie dem erhaltenen stabilen Fünf-Einträge-Pfad. |
| Deine Woche | Sieben rollierende Tage bleiben unverändert berechnet. Eine reine lokale Tagesansicht als native Button-Gruppe mit `aria-pressed` und der sichtbare Schalter „Ganze Woche“ steuern nur die Darstellung; im final integrierten Stand bleibt die Tageswahl ab 372px einzeilig, darunter bricht sie in zwei Reihen um. Kalenderaktionen haben 44px Zielgröße. Eintrag, Bearbeiten, Löschen, Terminansicht und Export bleiben vorhanden. |
| Kino | Die vorhandenen vorstellungsbezogenen Tickets, Pins, Filter und externen Kinolinks verwenden die Karten-, Titel-, Metadaten- und Controlrollen der Foundation. Abschnittsüberschriften sind Grotesk 600 in 15px, Filmtitel Barlow 600 in 22px; gefüllte Selects und Eingaben bleiben mindestens 16px groß. |
| Streaming | „Mein Programm“, „Alles“ und „Neu“ verwenden dieselben Papier-/Dunkelkarten sowie Titel-, Meta-, Anbieter- und Aktionsrollen. In Alles/Neu stehen die vollständigen Titel vor der eigenen umbrechenden 44px-Aktionsreihe. Titelpins, Nullwert „Alle“, Jahrzehnttoleranz, Sortierung und die Neu-Differenz bleiben unverändert. Die dichte Skala zeigt weniger 12px-Beschriftungen, behält aber ihre Rasterplätze per `visibility`. |
| Mediathek und Formulare | Filmkarten, Must-Watch-Karten, Bewertungen und Film-/Medienformulare verwenden 12-px-Kartenrundungen, 16-px Innenabstand und die Foundation-Eingabegrößen. Auswahl, Bearbeiten, Löschen, Quellenwahl und Import-nahe Formulare bleiben unverändert bedienbar. |
| P1-Komponenten | `FilmCard`, `Wochenplan`, `MustWatchListe`, `KinoLinks`, `KatalogAuditStatus`, `SelectionControl`, `EditPanel`, `EintragForm`, `MedienForm`, `QuellenWahl` und `DreieckRegler` wurden gegen die Foundation-Rollen geprüft; erforderliche Karten- und Formularquellen sind im Paket angepasst. |

Die Text- und Iconbuttons in den primären Ansichten übernehmen ihre skalierbare 14px-Schrift wieder direkt aus `btnStyle`; lokale feste Schriftgrößen wurden entfernt. Die Suchfelder behalten die skalierbare Eingaberolle, einschließlich der Kino-Verknüpfungssuche. Streaming-Dienstnamen dürfen innerhalb ihrer vorhandenen Links umbrechen.

## Fokussierte Nachweise

```sh
KD_PRIVATE_V1_TEST_PORT=4491 npx playwright test --config=playwright.private-v1.config.mjs tests/private-v1/design-primary.spec.mjs tests/private-v1/start-mustwatch-layout.spec.mjs --project=chromium
KD_PRIVATE_V1_TEST_PORT=4491 npx playwright test --config=playwright.private-v1.config.mjs tests/private-v1/design-primary.spec.mjs tests/private-v1/start-mustwatch-layout.spec.mjs --project=webkit
node mustwatch_test.mjs
node wochenplan_test.mjs
node streaming_pin_neu_test.mjs
node streamingtab_filter_panel_default_test.mjs
node kino_mobile_filter_test.mjs
node kino_personal_recommendations_test.mjs
node mediathek_selection_logic_test.mjs
node mediathek_selection_dom_test.mjs
node kartenlayout_test.mjs
```

Alle genannten Läufe sind lokal grün. Die Browserprüfung misst zusätzlich reale Streaming-Kartenfarben, neutrale Anbieterlabels, Skalenbeschriftungen und 16px-Kinoeingaben und erzeugt Leitansicht-Screenshots für Start, Streaming und Kino. Must-Watch deckt Chromium und WebKit bei 320, 393 und 430 px sowie hell/dunkel und normal/groß ab. Das private Fixture sperrt alle unbekannten Netzpfade.

## Funktionsfunde für Max

Keine Funktionsabweichung im P1-Scope festgestellt. Die Darstellungsauswahl der Woche ist absichtlich nicht persistiert.

## Integrierter Abschluss

Der abschließende Astra-Review ergänzte kleine SVG-, Theme- und Umbruchkorrekturen auf Produktstand `9e9465b`. Die vollständige lokale Prüfung des integrierten Standes ist in [integration.md](integration.md) dokumentiert.

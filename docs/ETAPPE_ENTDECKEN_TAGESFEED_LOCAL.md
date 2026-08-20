# Entdecken-Tagesfeed · Etappe 2 lokal

> Historischer Checkpoint auf Commit `7d4fa9f`. Die konkrete private
> Aktivierung, Quellenentscheidung und Datenminimierung stehen in
> [ETAPPE_ENTDECKEN_TAGESFEED_OWNER_PILOT.md](ETAPPE_ENTDECKEN_TAGESFEED_OWNER_PILOT.md).

Stand: 20.08.2026
Baseline: `0582ee80cf976e11e0093791ff6f83701daaa1d9`
Arbeitsbranch: `codex/entdecken-tagesfeed-etappe2`
Wirkungsgrenze: lokal vorbereitet; nicht gepusht, nicht deployed, keine Migration angewandt,
kein Scheduler aktiviert und kein Anbieterrequest ausgeführt.

## Evidenzkern

- Etappe 1 hat in `src/lib/entdeckenUi.js` einen injizierbaren Webtipps-Vertrag,
  lokales Passungsranking, Gesehen-Ausschluss und die tägliche Auswahl aus den
  Top 20 gebaut. `EntdeckenTab` akzeptiert `webDiscoveryFeed`, `App.jsx` liefert
  diesen Prop auf der Baseline jedoch nicht. Es existiert dort auch kein Feed-
  Loader. Der bisherige reale Pfad kann deshalb nur Merkmale aus dem lokalen
  Streamingkatalog beziehungsweise der Mediathek nutzen.
- Der Streamingkatalog kommt weiterhin über `catalogService` aus der getrennten
  Supabase-Zeile `streaming_entdecken` beziehungsweise aus dem gebündelten
  Offline-Snapshot. Er ist die lokale Wahrheit für aktuelle AT-Verfügbarkeit.
- Der vorhandene Radarpfad belegt `POST /v1/messages`, das Anthropic-Servertool
  `web_search_20250305`, genau einen Toolaufruf, erlaubte Domains, Result-/Citation-
  Blöcke und Usage-Felder. Primärbelege: [Messages API](https://platform.claude.com/docs/en/api/messages/create)
  und [Web Search Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool).
- Anthropic ist der offizielle Betreiber des API-Transports; für EEA-Nutzung
  benennt der Anbieter Anthropic Ireland, Limited. Der Produktweg bleibt unter
  den [Commercial Terms](https://www.anthropic.com/legal/commercial-terms),
  während Rechte und Eignung jeder zitierten redaktionellen Quelle getrennt
  belegt werden müssen.
- Im Repository gibt es keine konkreten, lizenz- und anzeigeseitig belegten
  redaktionellen Source-Seeds für Film-/Serientipps. Daher wird kein Domainname
  geraten oder automatisch freigeschaltet. Ein leeres Quellenregister stoppt
  vor Provider und Kosten.

## Kleinster tragender Vertrag

Der Server erzeugt einen globalen Feed für Österreich. Jeder kanonische Record
enthält:

- stabile interne `recordId`, sichtbaren Titel und optionalen Originaltitel,
- `mediaType` (`film|series`) und Veröffentlichungsjahr,
- strukturierte `genres`/`tags` sowie optional starke externe IDs,
- mindestens einen positiv belegten Meinungsnachweis mit HTTPS-URL,
  Quellenlabel, serverseitig aufgelöster `sourceId`/`sourceFamily` und kurzer
  Paraphrase,
- Abruf- und Gültigkeitstag sowie einen festen Quellenrang.

Der Anbieter erhält ausschließlich eine feste globale Suchaufgabe mit Region,
Sprache und Mengenlimit. Account-ID, Profil, Seen-Status, Mediathek,
Streamingkatalog, Dienstewahl und lokale Titel- oder ID-Listen sind verboten.

Der Client bindet Records zuerst über eine gemeinsame starke externe ID. Ohne
gemeinsame ID gilt ausschließlich exakt normalisierter Titel plus gleiches Jahr
plus gleicher Werktyp. Null Treffer bleibt `unmatched`, mehrere Treffer bleiben
`ambiguous`; Fuzzy-, Prefix- und Wahrscheinlichkeitsfallbacks schreiben nichts.

## Phasen

1. **Reine Verträge:** kanonischen Feed, Quellenauflösung, drei Matchzustände,
   Privacy- und Mengenlimits als secretfreie Module und Fixtures festlegen.
2. **Serverkern:** getrennte Supabase-Function mit dem bereits belegten
   Anthropic-Websearch-Transport; genau ein Request, kein Retry, Zitate gegen
   Toolresults und serverseitiges Source-Register validieren.
3. **Tagescache:** atomarer service-role-only Claim nach Wiener Kalendertag.
   Höchstens der erste fällige Aufruf markiert den Tagesversuch. Erfolg ersetzt
   den Feed; Fehler behält den noch gültigen vorherigen Feed. Leere oder
   abgelaufene Daten werden nicht als aktuell verkauft.
4. **Produktnaht:** ein GET beim ersten Öffnen von Entdecken pro App-Lauf, kein
   Timer und keine Requestschleife. Die Profilauswertung bleibt danach rein
   lokal und deterministisch.
5. **Gates:** fokussierter Mockpfad; anschließend finaler Diff, lokaler Commit
   und genau einmal komplette projektübliche Mocksuite plus Build.

## Serverzustände und Fehlerfälle

| Zustand | Ergebnis |
|---|---|
| heutiger Feed vorhanden | direkt `fresh`, kein Provider |
| Feed älter, aber gültig; Tagesversuch noch frei | genau ein Claim und höchstens ein Providerrequest |
| Provider, Quelle, Kosten oder Antwort ungültig | kein Retry; gültiger Altfeed als `stale`, sonst `empty` |
| Tagesversuch bereits verbraucht | kein zweiter Providerrequest; aktueller gültiger Cache |
| Feed-/Providerflag aus | kein Provider; `disabled` beziehungsweise vorhandener Cache |
| kein belegter redaktioneller Source-Seed | Fail closed vor Reservierung und Provider |

## Nicht-Ziele dieser Etappe

- keine konkrete redaktionelle Domain ohne Quellen-/Rechtebeleg,
- kein Titelresolver und kein Requestloop pro Treffer,
- kein LLM im persönlichen Ranking und kein Profilschreibpfad,
- kein Scheduler, Cron, Clienttimer oder automatischer Retry,
- kein Push, keine CI-/Deploybeobachtung, keine Backendanwendung und kein
  echter Anbieter-/KI-Lauf.

## Exakter Rest für Etappe 3

Etappe 3 muss vor jeder Aktivierung mindestens eine konkrete redaktionelle
Quelle mit Betreiber, Terms, erlaubter automatisierter Suche, Speicherung,
Paraphrase, Linkanzeige, Attribution, Quellfamilie und Prüftag belegen und als
Source-Seed festschreiben. Danach: Migration gegen den exakten Remote-Bestand
preflighten und anwenden, Function deployen, Function-/Config-Closure
attestieren, Serverflags und das staging-only Clientflag setzen, genau einen
budgetgeschützten Tageslauf ausführen, Feed/Cache/No-retry read-backen und erst
danach das Frontend deployen. Produktion, Scheduler und zusätzliche Quellen
bleiben getrennte Freigaben.

# Kinodreieck: kostenpflichtige KI-Tests

- `npm test`, `npm run test:function` und alle normalen Einzeltests verwenden
  ausschließlich Mocks und dürfen ohne Budgetprüfung laufen.
- Echte Anbieter-Rauchproben und Evals dürfen Agenten nur seriell über
  `npm run test:ai:live` beziehungsweise `npm run test:ai:eval` starten.
  Direkte Aufrufe der darunterliegenden Skripte sind für autonome Agenten
  verboten.
- Der Budgetwächter liest vor und nach jedem Live-Test den serverseitig
  gebuchten Monatsverbrauch des Testkontos. Standardgrenze: 500 US-Cent als
  konservative technische Ersatzgrenze für das gewünschte 5-Euro-Limit.
- Owner-Entscheid Max vom 08.08.2026 für diesen finalen Audit: Die lokale
  500-US-Cent-Ersatzgrenze darf mit dem exakten Zusatz
  `--owner-approved-server-budget` ignoriert werden. Zulässig bleiben nur
  `npm run test:ai:live -- --owner-approved-server-budget` und
  `npm run test:ai:eval -- --owner-approved-server-budget`; der atomare
  Serverdeckel, die Vor-/Nachmessung und die serielle Ausführung bleiben aktiv.
- Unabhängig von dieser Owner-Freigabe gilt je zahlendem Anbieterrequest ein
  nicht erhöhbarer Vorab-Zaun von 500 US-Cent. Jeder durch die beiden erlaubten
  npm-Befehle gestartete Lauf ist auf 1500 serverseitig gemessene US-Cent als
  technische 15-Euro-Näherung begrenzt. Vor jedem Request müssen deshalb noch
  500 US-Cent Laufpuffer verbleiben.
- Rauchprobe und Eval haben feste maximale zahlende/potenziell zahlende
  Anbieterrequest-Zahlen (9 bzw. 20). Die Rauchprobe besitzt zusätzlich genau
  eine tokenfreie, ebenfalls gelockte und zeitbegrenzte Modelldiagnose (P8).
  Beide laufen durch einen prozessübergreifenden lokalen Exklusiv-Lock strikt
  seriell, besitzen 135 Sekunden Request- und 15 Minuten
  Kindprozess-Zeitgrenze; Vor-/Nachmessungen sind separat auf 20 Sekunden
  begrenzt. Sie starten keine automatischen Retries. Unbekannter
  Kostenstand, Timeout oder Limit beendet den Lauf sofort.
- Ein vorhandener Live-Lock wird auch bei mutmaßlich toter PID nie autonom
  gelöscht. Erst nach manueller Prozessprüfung darf ein verwaister Lock
  entfernt werden; bis dahin bleibt jeder weitere bezahlte Start gesperrt.
- Bei Exit-Code `75` oder der Ausgabe `AUTONOMIE_STOPP` sind alle weiteren
  echten KI-Tests sofort einzustellen. Der Agent muss Max im Chat den Stand
  mitteilen und auf ausdrückliche Freigabe warten. Die Grenze darf nicht
  autonom erhöht, zurückgesetzt oder umgangen werden.
- Bei `BUDGET_UNBEKANNT` gilt dieselbe Sperre: Ein nicht messbarer Verbrauch
  ist keine Erlaubnis.
- Zugangsdaten, Testpasswörter, Sitzungs-, Service-Role-, Cloudflare- oder
  Anbieter-Keys gehören weder in den Chat noch ins Repository.

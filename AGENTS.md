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
- Bei Exit-Code `75` oder der Ausgabe `AUTONOMIE_STOPP` sind alle weiteren
  echten KI-Tests sofort einzustellen. Der Agent muss Max im Chat den Stand
  mitteilen und auf ausdrückliche Freigabe warten. Die Grenze darf nicht
  autonom erhöht, zurückgesetzt oder umgangen werden.
- Bei `BUDGET_UNBEKANNT` gilt dieselbe Sperre: Ein nicht messbarer Verbrauch
  ist keine Erlaubnis.
- Zugangsdaten, Testpasswörter, Sitzungs-, Service-Role-, Cloudflare- oder
  Anbieter-Keys gehören weder in den Chat noch ins Repository.

# Entdecken-Tagesfeed · Etappe 3 · privater Owner-Pilot

Stand: 20.08.2026
Basis: `7d4fa9f47bb16e74eb4676ac252e964fb6675f1c`
Arbeitsbranch: `codex/entdecken-tagesfeed-etappe3`

## Wirkung

Diese Etappe aktiviert ausschließlich den privaten, nichtkommerziellen
Owner-Pilot. Die Edge Function prüft eine echte Supabase-Sitzung und genau eine
Own-Row in `kd_account_access`; nur `role=owner`, `active=true` und
`personal_ai=true` dürfen Cache und Tagesrefresh erreichen. Name und E-Mail
sind kein Autorisierungssignal.

`public_enabled` und `commercial_enabled` bleiben per Datenbank-Constraint
`false`. Es gibt keinen Scheduler, keinen Clienttimer, keinen Retry und keinen
Frontend-Deploy. Der erste berechtigte GET auf Entdecken darf höchstens einen
Provider- und einen Websearch-Request je Wiener Kalendertag auslösen.

## Erlaubte Quellen

Das serverseitige Register enthält exakt zwei voneinander unabhängige
österreichische Redaktionen:

- `derstandard.at` · DER STANDARD
- `film.at` · k-digital Medien GmbH & Co KG / KURIER-Gruppe

Primärbelege, geprüft am 20.08.2026:

- [DER STANDARD · Nutzung von Inhalten](https://about.derstandard.at/nutzungsbedingungen/)
- [DER STANDARD · AGB](https://about.derstandard.at/agb/)
- [film.at · Kontakt und Impressum der Redaktion](https://www.film.at/kontakt-impressum-redaktion-filmat/401835922)
- [KURIER · Allgemeine Nutzungsbedingungen](https://kurier.at/info/anb/254619647)

Die Entscheidung gilt nur für diesen privaten, nichtkommerziellen Pilot. Eine
öffentliche oder kommerzielle Nutzung braucht eine neue Rechteprüfung und eine
additive Freigabemigration; diese Etappe kann sie nicht per Flag einschalten.

## Datenminimierung

Aus den Fundstellen werden ausschließlich gespeichert beziehungsweise
angezeigt:

- Werktitel, Jahr und Typ (`film|series`),
- kurze strukturierte Genres/Tags,
- Domain und direkter HTTPS-Artikellink,
- Publikations- und serverseitiges Abrufdatum,
- `positiveRecommendation=true`.

Nicht gespeichert oder angezeigt werden Rezensionstext, Zitat, Paraphrase,
Artikelüberschrift, Autor, Bild, Logo oder sonstiger redaktioneller Inhalt.
Providerfelder werden nur aus dem belegten Messages-/Websearch-Vertrag gelesen;
die Domain wird serverseitig aus dem Direktlink abgeleitet.

## Kosten- und Laufgrenze

Der einzige reale Lauf führt über
`npm run test:ai:live -- --owner-approved-server-budget`. Der fest verdrahtete
Discovery-Modus erlaubt genau einen Function-GET, einen Providerrequest und
einen Websearch. Zusätzlich zu den allgemeinen Grenzen gilt für diesen Lauf
ein nicht erhöhbarer Delta-Deckel von 900 US-Cent. Unbekannter Kostenstand,
Exit 75, `AUTONOMIE_STOPP` oder `BUDGET_UNBEKANNT` beendet die Etappe ohne
Retry.

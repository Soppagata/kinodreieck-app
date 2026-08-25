# Entdecken-Tagesfeed · Etappe 3 · privater Owner-Pilot

Stand: 25.08.2026
Basis: `7d4fa9f47bb16e74eb4676ac252e964fb6675f1c`
Quellenerweiterungsbasis: `e0faef9da91676249f5389b66e27f8615e5d80f1`
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

Das serverseitige Register enthält für den privaten, nichtkommerziellen Pilot
exakt vier freigegebene Redaktionsdomains:

- `derstandard.at` · DER STANDARD
- `film.at` · k-digital Medien GmbH & Co KG / KURIER-Gruppe
- `kurier.at` · KURIER / k-digital Medien GmbH & Co KG
- `filmstarts.de` · FILMSTARTS / Webedia GmbH

Primärbelege der Bestandsquellen, geprüft am 20.08.2026:

- [DER STANDARD · Nutzung von Inhalten](https://about.derstandard.at/nutzungsbedingungen/)
- [DER STANDARD · AGB](https://about.derstandard.at/agb/)
- [film.at · Kontakt und Impressum der Redaktion](https://www.film.at/kontakt-impressum-redaktion-filmat/401835922)

Primärbelege der Erweiterung, geprüft am 25.08.2026:

- [KURIER · Allgemeine Nutzungsbedingungen](https://kurier.at/info/anb/254619647)
- [FILMSTARTS · Nutzungsbedingungen](https://www.filmstarts.de/services/nutzungsbedingungen/)

Die Entscheidung gilt nur für diesen privaten, nichtkommerziellen Pilot. Eine
öffentliche oder kommerzielle Nutzung braucht für alle vier Domains eine neue
Betreiber- und Rechteprüfung sowie eine additive Freigabemigration; diese
Etappe kann sie nicht per Flag einschalten.

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

## Praktische Beleggrenzen

Vor dem Provider-Schritt liest der Livepfad mit derselben Sitzung genau die
eigene `kd_account_access`-Zeile. Nur `owner`, `active=true` und
`personal_ai=true` lassen den Provider-Qualitätssmoke beginnen. Ein vorhandenes
Member-Testkonto stoppt davor; es wird weder hochgestuft noch als Owner
ausgegeben. Für den derzeit einzigen berechtigten Owner ist in den bekannten
Projekt-Keychain-Pfaden kein Credential hinterlegt. Der reale Owner-Produktweg
bleibt deshalb offen, bis ein bereits autorisierter Credentialpfad separat
bereitsteht.

Der Remote-Ledger enthielt beim Read-Preflight bereits
`20260819220000_radar_person_server_candidate` mit 39 Statements. Diese Branch-
Basis spiegelt ausschließlich die schon remote gelaufene Quelle aus Commit
`ca4414a1108981158db143bd8e9248fb2ef54e80`, Git-Blob
`225018c2ee32270be8de14aba549cb606db2b9ca` und SHA-256
`d23f80f7073deb1197fdcb0b5a73f4abd1ad002e0b3bded6ee08c691d937f658`.
Sie darf in diesem Entdecken-Fenster nicht erneut remote angewandt werden.

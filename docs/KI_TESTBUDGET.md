# Budgetwächter für echte KI-Tests

Stand: 28.07.2026

## Zweck

Normale Projekt-, Client- und Function-Tests verwenden ausschließlich Mocks
und lösen keinen Anbieteraufruf aus. Nur die ausdrücklich als live
gekennzeichneten Rauchproben und Evals können Geld kosten.

Autonome Agenten dürfen solche Läufe nur noch über den Budgetwächter starten:

```bash
npm run test:ai:live
npm run test:ai:eval
```

Vor und nach jedem vollständigen Live-Test liest der Wächter über die
kostenfreie `health`-Aufgabe den serverseitig gebuchten Monatsverbrauch des
Testkontos. Er zeigt sowohl den Gesamtstand als auch die Differenz des Laufs.

## Grenze und Genauigkeit

Die Kinodreieck-Datenbank und die Anthropic-Preistabelle rechnen in US-Cent.
Die autonome Standardgrenze liegt deshalb bei **500 US-Cent**. Sie ist eine
bewusst konservative technische Ersatzgrenze für Max' gewünschtes
5-Euro-Limit, aber keine Wechselkurs- oder Rechnungsgarantie.

Der Stand ist genauer als eine Schätzung „Anzahl der Anfragen × Sollkosten“:
Abgeschlossene Aufträge tragen die aus den tatsächlichen Provider-Tokens
berechneten Kosten. Laufende oder ohne Abschluss abgebrochene Aufträge zählen
vorsichtshalber mit ihrer reservierten Höchstschätzung. Maßgeblich ist die
serverseitige Preistabelle; Rabatte, Steuern, Wechselkurs und die spätere
Anbieterrechnung sind nicht darin enthalten.

Zusätzlich existiert weiterhin der atomare globale Monatsdeckel des Servers.
Er liegt im Ausgangsstand bei 1000 US-Cent und zählt Produktion und Staging
gemeinsam. Der lokale Wächter ersetzt dieses harte Datenbanktor nicht.

## Stoppsignale

- `AUTONOMIE_STOPP`, Exit-Code 75: Die 500-US-Cent-Grenze oder der globale
  Serverdeckel ist erreicht.
- `BUDGET_UNBEKANNT`, Exit-Code 74: Anmeldung, Function oder Kostenstand sind
  nicht verlässlich erreichbar.

In beiden Fällen gilt fail-closed:

1. keine weiteren echten KI-Tests,
2. Max im Chat den letzten bekannten Stand nennen,
3. auf ausdrückliche Freigabe warten,
4. Grenze niemals autonom erhöhen oder umgehen.

Ein reiner Kontrollaufruf kostet nichts. Auf dem lokalen Mac lädt er das
Passwort gezielt aus dem Login-Schlüsselbund:

```bash
npm run check:ai-budget
```

Ob beide begrenzten Testkonten im Schlüsselbund vorhanden sind, prüft ohne
Anmeldung und ohne Netzaufruf:

```bash
npm run check:keychain
```

## Benötigte Werte

| Name | Geheim? | Zweck |
| --- | --- | --- |
| `KD_SB_URL` | nein | öffentliche Supabase-Projekt-URL |
| `KD_SB_ANON` | nein | öffentlicher Publishable-/Anon-Key |
| `KD_TESTA_USER` | nein | begrenztes Testkonto, Standard `testa` |
| `KD_TESTA_PASS` | **ja** | Passwort des Testkontos |
| `KD_MAIL_DOMAIN` | nein | Standard `login.kinodreieck.at` |
| `KD_AI_FUNKTION` | nein | Standard `ai-task` |
| `KD_ORIGIN` | nein | erlaubte App-Origin |
| `KD_AI_AUTONOM_LIMIT_USD_CENT` | nein | Standard 500; nur nach ausdrücklicher Freigabe ändern |

Der Anthropic-Key, ein Anthropic-Admin-Key und der Supabase-Service-Role-Key
werden nicht benötigt. Sie gehören weder in den Chat noch in lokale
Projektdateien. Zugangsdaten werden nur über die Prozessumgebung oder einen
lokalen Secret-Speicher bereitgestellt.

### Lokaler macOS-Schlüsselbund

Der feste Service heißt:

`at.kinodreieck.codex.live-tests.shared`

Darunter liegen nur die Accounts `KD_TESTA_PASS` und `KD_TESTB_PASS`. Der
Loader `tools/keychain_runner.mjs` liest diese Werte über `/usr/bin/security`,
gibt sie nie aus und übergibt sie nur an fest verdrahtete Testprogramme. Freie
Befehle oder zusätzliche Argumente sind nicht möglich. Zufällig gesetzte
Anthropic-, Service-Role-, Datenbank- oder Cloudflare-Schlüssel werden nicht
an die Kindprozesse vererbt.

Die nicht geheime Zielkonfiguration liegt lokal in `.env.live.local`, das von
Git ignoriert wird. Erlaubt sind ausschließlich:

```dotenv
KD_SB_URL=https://projekt-ref.supabase.co
KD_SB_ANON=sb_publishable_...
KD_TESTA_USER=testa
KD_TESTB_USER=testb
KD_MAIL_DOMAIN=login.kinodreieck.at
KD_AI_FUNKTION=ai-task
KD_ORIGIN=https://staging.kinodreieck.at
```

Passwörter, `KD_AI_AUTONOM_LIMIT_USD_CENT` und `KD_EVAL_JA` werden in dieser
Datei ausdrücklich abgelehnt. Die Eval-Freigabe entsteht ausschließlich für
den einen ausdrücklich gestarteten, budgetüberwachten Lauf.

Für `npm run test:rls` kommt ein zweites begrenztes Testkonto mit
`KD_TESTB_USER` und dem geheimen `KD_TESTB_PASS` hinzu. Dieser Test macht
keinen Anbieteraufruf und kostet kein KI-Budget.

## Technische Grenze

Der Wächter setzt serielle Agentenläufe voraus; `AGENTS.md` verbietet deshalb
parallele oder direkte Live-Tests. Eine auch über mehrere Rechner hinweg
atomare eigene 5-Euro-Testsession würde eine zusätzliche Datenbankmigration
mit Testlauf-ID, eingefrorenem Wechselkurs und eigener Reservierungsgrenze
benötigen. Für den jetzigen einzelnen Codex-Arbeitsfluss wäre das erheblich
mehr Infrastruktur, ohne die Genauigkeit der späteren Anbieterrechnung
garantieren zu können.

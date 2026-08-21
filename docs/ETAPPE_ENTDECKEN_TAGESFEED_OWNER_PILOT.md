# Entdecken-Tagesfeed · kanonische lokale Produkt-Closure

Stand: 21.08.2026

## Herkunft und Liefergrenze

Die Fachquelle dieser Closure ist die lokale Commitfolge
`7d4fa9f` → `28dfccd`. Für die Edge Function gilt die jüngste
CORS-Fassung aus `747edc3`; der allgemeine `ai-task` bleibt mit
`03ff280` standardmäßig aus. Die Personenradar-Migration aus `78a0855`
gehört ausdrücklich nicht zu dieser Portierung.

Diese Etappe ist ausschließlich lokal gebaut und mit Mocks geprüft. Sie
enthält keinen Push, kein Deployment, keinen Remote-Read oder -Write, keinen
Keychain-Zugriff und keinen Anbieterrequest.

Die additive Datei
`20260820200000_entdecken_daily_feed.sql` ist hier eine historische,
bytegetreue Source des bereits vorbereiteten Tagesfeed-Vertrags. Sie darf
nicht erneut remote angewandt, repariert oder über `db push` eingespielt
werden. Ein späteres Remote-Fenster muss den bestehenden Zustand zuerst
read-only gegen Hash, Function-Version, Flags und RPC-Vertrag preflighten.

## Produktvertrag

- Beim ersten berechtigten Öffnen von Entdecken läuft höchstens ein
  bodyloser GET pro App-Lauf; es gibt keinen Timer und keinen Retry.
- Der Server beansprucht einen Wiener Kalendertag atomar. Ein gültiger
  heutiger Feed kommt ohne Providerlauf zurück. Nach Fehler bleibt nur ein
  noch gültiger Altfeed als `stale`; sonst bleibt der Zustand ehrlich leer.
- Der globale Feed enthält kein Konto, Profil, Seen-Status, keine Mediathek,
  Dienstewahl oder lokale Katalogliste.
- Im Browser wird ausschließlich über exakt normalisierten Titel plus
  gleiches Jahr plus gleichen Werktyp gematcht. Null Treffer und
  Mehrdeutigkeit bleiben ausgeschlossen; es gibt keinen Fuzzy- oder
  Prefix-Fallback.
- Weitere Entdeckungen bestehen nur aus diesen belegten, lokal als verfügbar
  bestätigten Treffern. Ohne Feed gibt es keinen neutralen oder
  alphabetischen Katalogfüller.
- Persönliche Passung bleibt ein getrennter deterministischer Pfad. Standard
  ist höchste Passung zuerst; die optionale Tagesauswahl bleibt pro
  Kalendertag stabil und wählt nur aus den Top 20 bereits passenden Titeln.

## Quellen- und Datenminimierung

Das historische serverseitige Register enthält ausschließlich
`derstandard.at` und `film.at`. Der damalige Rechtecheckpoint vom
20.08.2026 ist nur für den privaten, nichtkommerziellen Owner-Pilot
dokumentiert; öffentliche oder kommerzielle Nutzung bleibt gesperrt und
braucht eine neue Rechteprüfung.

Gespeichert und angezeigt werden nur Werktitel, Jahr, Typ, kurze strukturierte
Genres/Tags, Domain, direkter HTTPS-Link sowie Publikations- und Abrufdatum.
Rezensionstext, Zitat, Paraphrase, Überschrift, Autor, Bild und Logo bleiben
außerhalb des Produkts.

## Kosten- und Aktivierungsgrenze

Der einzige vorbereitete reale Lauf hängt hinter dem bestehenden
`npm run test:ai:live -- --owner-approved-server-budget`-Wächter. Der
Discovery-Modus erlaubt genau einen Function-GET, einen Providerrequest und
einen Websearch und besitzt zusätzlich einen Laufdelta-Deckel von
900 US-Cent. `BUDGET_UNBEKANNT`, Exit 75 oder `AUTONOMIE_STOPP` beendet
den Lauf ohne Retry.

Der Daily-Client ist buildseitig standardmäßig aus, im Produktionsworkflow
hart aus und auf Staging nur über das exakte Staging-Flag aktivierbar. Diese
lokale Closure aktiviert weder Frontendflag noch Serverflags.

# Etappe 3: Echte Accounts und persönlicher Speicher

**Stand: 25. Juli 2026 — ABGESCHLOSSEN.** Code fertig, Testsuite grün, Migration
eingespielt, Account-Isolation gegen die echte Datenbank belegt, Anmeldung auf
dem echten iPhone geprüft und der Umzug des tatsächlichen Bestands vollzogen:
402 Filme, 90 Must-Watch-Einträge und der Blogartikel liegen im Konto und stehen
auf Rechner und iPhone.

## Was diese Etappe leistet

Jede Person bekommt einen eigenen, serverseitig geschützten Bereich in der
Datenbank und gleicht ihre Mediathek zwischen Handy und Rechner ab. Wer sich
nicht anmeldet, arbeitet unverändert weiter — der Gastbetrieb bleibt vollwertig
und ist die Rückfallebene, wenn irgendetwas am Onlineweg klemmt.

## Entscheidungen

### Anmeldung: Benutzername und Passwort, ohne E-Mail-Adressen

Supabase Auth mit Passwort-Anmeldung. Weil GoTrue ein E-Mail-Format verlangt,
bildet die App intern eine synthetische Adresse `<benutzername>@login.kinodreieck.at`.
Diese Domain liegt in der eigenen Cloudflare-Zone, hat keinen MX-Eintrag, und im
Projekt ist kein Mailversand konfiguriert. Es geht nie eine Mail raus.

**Bewusste Abweichung von der Roadmap:** Dort standen Magic Link oder Einmalcode.
Beide setzen echte, erreichbare Postfächer voraus — genau das ist hier nicht
gewollt. Die Anmeldung dient allein der Zuordnung „wessen Datenbereich ist das",
nicht der Identitätsprüfung. Passwort-Anmeldung ist zusätzlich der robusteste Weg
in der installierten iPhone-App: kein Kontextwechsel wie beim Magic Link, kein
Warten auf Mail.

**Folgen, die bewusst akzeptiert sind:**

- Keine Selbstregistrierung. Konten legt Max im Dashboard an.
- Kein automatisches Zurücksetzen von Passwörtern. Auch das macht Max.
- Kein eigenes Anmelde-Protokoll. (Supabase führt intern minimale Auth-Logs, die
  nicht abschaltbar sind; sie werden nicht ausgewertet.)

Vor einer öffentlichen Öffnung (Etappe 9) ist beides neu zu bewerten: ohne
Mailadresse gibt es keinen Selbstbedienungsweg zurück ins eigene Konto.

### Datenmodell: eine neue Tabelle neben der alten

`kd_personal` mit `account_id`, `key`, `value`, `revision`, `updated_at`. Ein
Dokument je Bereich, wie schon bisher lokal — kein normalisiertes Schema. Die
Zeilenzugehörigkeit setzt **der Server** (`default auth.uid()`); die App schickt
nie eine Konto-Kennung mit. Ein Client, der es doch täte, liefe in die
RLS-Prüfung.

`value` ist `text`, nicht `jsonb`. Die App legt ihre Bereiche als Zeichenketten
ab (teils als JSON, teils roh wie den Autornamen). `jsonb` käme geparst zurück
und würde diese Wörtlichkeit brechen; außerdem lässt sich die Größe von `text`
verlässlich begrenzen.

`kd_store` (der alte schlüsselbasierte Sync) bleibt **unverändert**. Demo-Start
und geteilte Blogs hängen an dessen öffentlich lesbaren Bereichen.

### Umfang: 15 Bereiche

Die elf bisherigen Sync-Bereiche plus vier Sicht- und Zeitpräferenzen
(`kd:zeitgrenze`, `kd:filter-mediathek`, `kd:filter-kino`, `kd:filter-streaming`).
Letztere lagen bisher nur im Sitzungsspeicher des Browsers und gingen bei jedem
Gerätewechsel still verloren. Sie sind jetzt dauerhaft und wandern mit.

Gerätezustand bleibt lokal: Startart, Treiberwahl, Katalogzugang,
Programm-Zwischenspeicher, Demo-Kennzeichnung.

### Grenzen gegen versehentliches Fluten

Erlaubte Bereichsnamen als Datenbankprüfung, 1 MiB je Bereich. Der größte reale
Bereich (die Masterliste mit rund 255 Filmen) liegt bei 150–400 KB. Greift die
Grenze doch, ist das ein **dauerhafter** Zustand: der Bereich wird nicht mehr
abgeglichen und in der Oberfläche benannt, statt endlos gegen denselben Fehler
zu laufen. Der lokale Stand bleibt dabei vollständig.

## Wie die Teile zusammenspielen

```text
Oberfläche (KontoBereich, KontoUebernahme)
    │  kennt nur Dienste, nie Treiber
    ├── services/auth.js ──────── lib/authDriver.js ──► GoTrue /auth/v1
    │      Sitzung, tokenfreier Snapshot     Tokens (kd:auth:session)
    ├── services/storage.js ───── lib/accountDriver.js ──► PostgREST /kd_personal
    │      Betriebsart, Konfliktfläche       Bereiche (kd:acct:*)
    └── services/uebernahme.js ── lib/uebernahme.js
           Bestandsaufnahme, Prüfbericht
```

Tokens liegen ausschließlich in `kd:auth:session` — atomar in einem einzigen
Schreibvorgang, damit ein Absturz mitten in der Erneuerung nie eine halbe Sitzung
hinterlässt. Sie erreichen weder die Oberfläche noch die Datenbereiche noch das
Backup.

### Wann eine Sitzung endet — und wann nicht

Das ist die wichtigste Regel der Etappe:

| Antwort des Servers | Folge |
|---|---|
| 400/401 mit `invalid_grant` (Token endgültig tot) | Sitzung wird verworfen, Hinweis „Anmeldung abgelaufen", App läuft als Gast weiter |
| Netzwerkfehler, Zeitüberschreitung, 5xx (z. B. pausiertes Projekt) | Sitzung **bleibt**, Betrieb „eingeschränkt", Änderungen werden nachgetragen |

Ohne diese Trennung würde ein Serverausfall Menschen aus ihren eigenen Daten
aussperren. Offline ist kein Abmeldegrund.

Erneuert wird beim Start und beim Sichtbarwerden der App sowie nach einem 401 —
**kein Zeitgeber**: iOS hält Zeitgeber in der installierten App an, sobald sie in
den Hintergrund geht.

### Übernahme des vorhandenen Bestands

1. **Bestandsaufnahme** — nur lesend, **vor** dem Aktivieren des Treibers. Ein
   Abgleich würde sonst den lokalen Stand mit dem Kontostand überschreiben.
2. **Sicherung** — Datei-Backup plus lokaler Rückholpunkt. Lässt sich der
   Rückholpunkt nicht schreiben, passiert nichts.
3. **Vorschau** — je Bereich Stückzahl *und* Größe, hier gegen Konto.
4. **Übernahme** — wiederholbar: ein Abbruch in der Mitte lässt sich gefahrlos
   erneut starten (bereits übertragene Bereiche werden erkannt, nicht doppelt
   geschrieben).
5. **Prüfbericht** — Vergleich über Prüfsummen, nicht über Stückzahlen. Zwei
   Listen gleicher Länge sind nicht dieselbe Liste.
6. **Bestätigung** — erst danach gilt der Bestand als übernommen. Rücknahme
   stellt den Gerätestand her *und* entfernt die angelegten Kontozeilen wieder.

Vier Fälle: beide leer · nur auf dem Gerät · beides belegt (bewusste Wahl, **kein
Zusammenführen**) · **Daten gehören zu einem anderen Konto**. Der letzte Fall ist
die Schutzsperre gegen den Gerätewechsel: meldet sich jemand anderes am selben
Gerät an, würde eine Übernahme sonst fremde Einträge in dessen Konto schieben.
Dieser Fall verlangt eine ausdrückliche Bestätigung und schlägt sonst „Daten aus
dem Konto laden" vor.

**Kein Zusammenführen** ist Absicht: die Bereiche sind undurchsichtige Dokumente.
Ein Feld-Merge bräuchte je Bereich eigene Regeln und würde stillschweigend Daten
beschädigen — mit freundlicher Oberfläche.

### Was im Kontobetrieb gesperrt ist

Startart wechseln und Demo-Daten entfernen. Beides leert lokale Bereiche, die der
nächste Abgleich sofort aus dem Konto zurückholen würde. Statt dieses verwirrenden
Hin und Her: klare Sperre mit Hinweis „erst abmelden". Abmelden löscht nie Daten.

## Runbook für Max

### Konto anlegen

Dashboard → Authentication → Users → **Add user → Create new user**.
Adresse `<benutzername>@login.kinodreieck.at`, Startpasswort setzen,
**„Auto Confirm User" anhaken**. Benutzername kleinschreiben, ohne Leerzeichen.
Startpasswort weitergeben; die Person ändert es in der App unter
Einstellungen → Konto & Geräte-Sync → Passwort ändern.

### Voraussetzungen im Dashboard (einmalig)

- Authentication → Sign In/Up: **„Allow new users to sign up" AUS**
  (das ist der Riegel gegen fremde Selbstregistrierung).
- E-Mail-Provider aktiv, aber **„Confirm email" AUS** — sonst wären die
  synthetischen Adressen tot.
- Kein Custom-SMTP konfigurieren. Es soll nie eine Mail rausgehen.
- Authentication → URL Configuration: Site URL `https://kinodreieck.at`.

### Passwort zurücksetzen

Dashboard → Authentication → Users → betroffenen Nutzer → Passwort neu setzen.
Es gibt bewusst keinen Selbstbedienungsweg.

### Konto löschen

Dashboard → Users → Nutzer löschen. Die zugehörigen Datenzeilen verschwinden
automatisch mit (`on delete cascade`). Der lokale Bestand auf den Geräten der
Person bleibt unberührt — das ist gewollt.

### Migration einspielen

`supabase/migrations/20260725120000_kd_personal.sql` vollständig in den
SQL-Editor kopieren und ausführen, dann eine Zeile im Laufprotokoll
(`supabase/migrations/LIESMICH.md`) ergänzen. Die Datei ist additiv und mehrfach
ausführbar. Danach die Isolationstests laufen lassen:

```
KD_SB_URL=https://<projekt>.supabase.co KD_SB_ANON=<publishable-key> \
KD_TESTA_PASS=… KD_TESTB_PASS=… npm run test:rls
```

Erst ein grüner Lauf belegt, dass sich zwei Konten wirklich nicht sehen.

### Wenn das Projekt pausiert war

Supabase pausiert Projekte im kostenlosen Tarif nach längerer Inaktivität. Der
Keepalive-Workflow beugt vor, hängt aber selbst an der Repo-Aktivität: GitHub
schaltet geplante Läufe nach 60 Tagen ohne Repo-Bewegung ab. Für angemeldete
Nutzer ist ein pausiertes Projekt kein Drama — sie bleiben angemeldet, arbeiten
lokal weiter und tragen nach, sobald es wieder läuft.

## Abnahmekriterien der Roadmap

| Kriterium | Stand |
|---|---|
| Zwei Testkonten vollständig voneinander isoliert | **erfüllt und belegt** — 18/18 Negativtests gegen die echte Datenbank am 25.07.2026 (`npm run test:rls`): anon wird abgewiesen, A sieht von B nichts, gefälschte Konto-Kennung wird abgelehnt, Bestandspfade (Demo, geteilte Blogs, Katalog) unversehrt |
| Lokale Daten verlustfrei in ein Konto übernehmbar | erfüllt, über Prüfsummen belegt (`uebernahme_test.mjs`) |
| Abmelden entfernt keine lokalen Daten ungefragt | erfüllt und geprüft (`authservice_test.mjs`) |
| Backup und Wiederherstellung funktionieren auch mit Kontodaten | erfüllt, alle 15 Bereiche (`restore_test.mjs`, Phase 5) |
| Der alte Sync-Schlüssel ist für neue Konten nicht mehr nötig | erfüllt — mit einer offen benannten Ausnahme (siehe unten) |

### Offene Ausnahme: Blogs veröffentlichen

Das Veröffentlichen geteilter Blogs läuft weiterhin über den eingefrorenen
Legacy-Weg und verlangt dessen Schlüssel. Für neue Konten ist die Funktion damit
praktisch nicht verfügbar; die Oberfläche meldet das verständlich statt technisch.
Der Weg über die Sitzung braucht eine Autorenbindung in `kd_store` — das ist ein
eigener Folgeschritt, weil diese Etappe die alte Tabelle bewusst nicht anfasst.

## Erledigt

- **Anmelde-Spike auf dem echten iPhone bestanden** (25.07.2026, installierte
  App über staging): Anmeldung erfolgreich; die Sitzung überlebt das vollständige
  Beenden und Neustarten der App; im Flugmodus bleibt die App nutzbar und meldet
  niemanden ab. Damit ist die Annahme belegt, an der die Verfahrenswahl hing —
  Passwortanmeldung trägt in der installierten iOS-App, wo der Magic-Link-Weg
  zuvor gescheitert war.
- **Migration eingespielt** (25.07.2026, SQL-Editor).
- **Account-Isolation belegt:** 18/18 Negativtests gegen die echte Datenbank.
  Darunter die beiden ernsten Fälle: anonyme Zugriffe werden abgewiesen, und ein
  angemeldetes Konto sieht die Zeilen des anderen nicht (leere Menge, kein
  Fehler, kein Leck). Gefälschte Konto-Kennungen und manipulierte Versionsstände
  laufen ins Leere; Demo-Start, geteilte Blogs und Katalog sind unversehrt.

- **Umzug des echten Bestands vollzogen** (25.07.2026). Der Bestand lag im
  Browserspeicher der alten Adresse; Browser reichen Daten nicht über
  Adressgrenzen, deshalb per Backup-Datei. Gegen die Datenbank verifiziert:
  sieben Zeilen, `kd:master` mit 402 Filmen (206 KB), `kd:mustwatch` mit 90
  Einträgen, dazu Blog, Einstellungen, Streaming-Dienste und Achievements —
  alle auf Revision 1. Leere Bereiche wurden gar nicht erst angelegt.
  Gegenprobe auf dem iPhone bestanden: derselbe Bestand nach der Anmeldung.
- **Sicherheitsprobe Wiederherstellungs-Endpunkt** (25.07.2026). Ergebnis:
  Registrierung mit fremder Adresse und Magic-Link-Anforderung werden mit
  `400 email_address_invalid` abgewiesen — Supabase verweigert die synthetische
  Domain zusätzlich zur abgeschalteten Selbstregistrierung. `/auth/v1/recover`
  antwortet mit 200 und leerem Rumpf; das ist die Standardantwort, die bewusst
  nicht verrät, ob ein Konto existiert, und bedeutet keinen Versand: es gibt
  keinen Zustellweg.

  **Auflage:** Das gilt nur, solange für `login.kinodreieck.at` kein
  Mailempfang eingerichtet ist und kein eigener Mailserver im Projekt
  hinterlegt wird. Beides würde den Übernahme-Vektor öffnen und müsste dann
  durch ein anderes Verfahren abgelöst werden.

## Kleinkram, der noch offensteht

1. **Token-Erneuerung nach über einer Stunde** — beim nächsten Öffnen beiläufig
   bestätigt, sobald die App nach längerer Pause ohne neue Anmeldung startet.
2. **Testkonten `testa` und `testb` löschen.** Ihre Datenzeilen verschwinden
   automatisch mit (`on delete cascade`).
3. Die alte Adresse `soppagata.github.io` ist ab jetzt Archiv — dort Eingetragenes
   erreicht das Konto nicht mehr.

## Geänderte und neue Dateien

**Neu:** `src/lib/authDriver.js` · `src/lib/accountDriver.js` ·
`src/lib/uebernahme.js` · `src/services/uebernahme.js` ·
`src/components/KontoBereich.jsx` · `src/components/KontoUebernahme.jsx` ·
`supabase/migrations/20260725120000_kd_personal.sql` ·
`supabase/migrations/LIESMICH.md` · `tools/rls_test_personal.mjs` ·
`authservice_test.mjs` · `accountdriver_test.mjs` · `uebernahme_test.mjs`

**Geändert:** `src/services/auth.js` (Anmelden/Abmelden/Erneuern, Zustände) ·
`src/services/storage.js` (Betriebsart, Kopplung, Konto-Fläche) ·
`src/main.jsx` (Startreihenfolge, Erneuern beim Sichtbarwerden) ·
`src/lib/storage.js` (vierter Präferenz-Schlüssel) · `src/lib/backup.js` ·
`src/lib/restore.js` · `src/App.jsx` (Sperren im Kontobetrieb) ·
`src/tabs/DatenTab.jsx` (Kontobereich) · die drei Tabs mit Filterleisten ·
`architekturgrenzen_test.mjs` · `restore_test.mjs` · `personalmodus_test.mjs` ·
`pages_test.mjs` · `serviceworker_test.mjs` · `package.json`

**Bewusst nicht angefasst:** `src/lib/supabaseDriver.js`, `src/lib/gitDriver.js`,
`src/legacy/`, `supabase/katalog_schema.sql` und alle Regeln auf `kd_store`.
Die beiden Legacy-Treiber laufen als eigener Testlauf weiter (`npm run test:legacy`).

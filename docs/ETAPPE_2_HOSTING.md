# Etappe 2: Hosting-, Domain- und Deployment-Handbuch

Stand: 25. Juli 2026

## Ergebnis und Freigabestatus

Die öffentliche App-Hülle ist im Repository technisch umgesetzt:

- reproduzierbarer Cloudflare-Pages-Build aus `dist/`,
- getrennte Staging- und Produktions-Pipeline,
- öffentliche, validierte Laufzeitkonfiguration,
- Cloudflare-Sicherheits- und Cache-Header,
- installierbare PWA mit geprüfter Cache-Strategie,
- separat ausgelieferte Single-File-Ausgabe unter `/download/`,
- lokale Build-, Secret-, Manifest-, Service-Worker- und Header-Checks,
- HTTPS-Smoke-Test nach jedem Deployment,
- dokumentierte Domain-Aktivierung und Rückrollmöglichkeit.

Cloudflare-Projekt, GitHub-Environments und beide festen Domains sind
inzwischen eingerichtet. Produktion unter `https://kinodreieck.at` und
Staging unter `https://staging.kinodreieck.at` liefern den abgenommenen
Pre-Etappe-7-Build. Offen bleibt ein nachträglich gemessener Zonenbefund:
`sw.js` erhält trotz `_headers` einen Browser-TTL von vier Stunden. Das
verschärfte Remote-Tor erkennt ihn; die Live-Abnahme des Cacheverhaltens ist
erst nach `Browser Cache TTL = Respect Existing Headers` wieder vollständig
grün.

## Umgebungen

| Umgebung | App-Marker | Deployment | Daten/Keys |
|---|---|---|---|
| lokal | `VITE_APP_ENV=local` | Vite-Devserver, kein Hosting | `.env.local`, nie committen |
| Staging | `VITE_APP_ENV=staging` | Cloudflare-Branch `staging`, eigene Staging-Subdomain | GitHub Environment `staging` |
| Produktion | `VITE_APP_ENV=production` | Cloudflare-Produktionsbranch `main`, eigene Domain | GitHub Environment `production` |

Staging und Produktion werden getrennt gebaut. Ein Produktionsbuild wird nur
von `main` ausgelöst. Das GitHub Environment `production` soll zusätzlich einen
erforderlichen Reviewer besitzen. Ein manueller Staging-Lauf kann dagegen von
einem ausgewählten Feature-Branch gestartet werden.

## Variablen und Secrets

Alle `VITE_*`-Werte sind öffentlich und werden in das Browser-Bundle
geschrieben. Sie dürfen niemals ein Secret enthalten.

### Öffentliche GitHub-Environment-Variablen

Diese Variablen werden jeweils getrennt in `staging` und `production` angelegt:

| Name | Inhalt |
|---|---|
| `APP_URL` | vollständige HTTPS-URL dieser Umgebung |
| `SUPABASE_URL` | öffentliche `https://<projekt>.supabase.co`-URL |
| `SUPABASE_PUBLISHABLE_KEY` | öffentlicher Publishable-/Anon-Key |
| `AI_ENDPOINT_NAME` | nur der öffentliche interne Endpunktname, zunächst `ai-task` |
| `CLOUDFLARE_PAGES_PROJECT` | Cloudflare-Pages-Projektname |

Der Workflow erzeugt daraus ausschließlich `VITE_APP_ENV`, `VITE_APP_URL`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_AI_ENDPOINT_NAME` und `VITE_BUILD_VERSION`.

Zusätzlich müssen `SUPABASE_URL` und `SUPABASE_PUBLISHABLE_KEY` auch als
**Repository-Variablen** (Ebene Repository, nicht Environment) angelegt werden:
Der zeitgesteuerte Keep-alive-Workflow (`keepalive.yml`) läuft ohne
GitHub-Environment. Für den reinen Keep-alive-Read genügen diese öffentlichen
Werte. Der getrennte Entdecken-Scheduler (`entdecken-six-day.yml`) benötigt
zusätzlich das bereits für private Betriebsprüfungen verwendete Repository-
Secret `SUPABASE_SERVICE_ROLE_KEY`; der Wert wird weder ausgegeben noch Teil
des Function-Payloads.

### Providerfreier Entdecken-Anstoß alle 144 Stunden

Der getrennte Schedule sendet täglich um `02:00 UTC` genau einen service-role-
authentifizierten, bodylosen Refresh-`POST` an `entdecken-daily-task`. Das ist
`03:00` in der Wiener Normalzeit und `04:00` in der Sommerzeit. Der Step hat
eine harte Zeitgrenze, folgt keinen Redirects und besitzt weder Schleife noch
Curl-Retry. Es gibt absichtlich keinen manuellen Workflow-Einstieg. Normale
Browser-, Health- und Readback-`GET`s bleiben strikt read-only.

Ausschließlich der atomare Datenbankclaim mit Fencing-Lease entscheidet, ob
seit dem letzten erfolgreichen oder verbrauchten Versuch mindestens exakt 144
Stunden vergangen sind. Ein fälliger Lauf liest genau zwei öffentliche Joyn-
Listen; Anbieter- und Websearchrequests bleiben bei null. Unbekannte Titel
dürfen danach seriell und gecacht über die offizielle Wikidata-API ergänzt
werden. Quellenblock, Timeout oder 429 führen zu keinem Retry im selben
Zeitfenster und ersetzen den letzten guten Feed nicht.

Wiederkehrende Wirkung entsteht erst nach Aufnahme in den GitHub-Default-Branch.
Ein Staging- oder Feature-Branch aktiviert für sich keinen Zeitplan automatisch;
lokale Workflowdatei, Migration oder grüne Mocks sind noch keine Aktivierung.

### Server-/Deployment-Secrets

| Name | Ablage | Zweck |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Environment Secret | nur Pages-Deployments für das Zielprojekt |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Environment Secret | Zielkonto für Wrangler |

Claude-/KI-Anbieter-Key, Supabase-Service-Role-Key, persönliche Git-Sync-Tokens
und Account-Session-Tokens dürfen weder als Repository-Variable noch mit
`VITE_` angelegt werden. Sie gehören erst in späteren Etappen in einen
serverseitigen Secret-Store.

Lokal dient `.env.example` als öffentliche Vorlage. Echte `.env`-Dateien
bleiben ignoriert.

## Cloudflare Pages einmalig einrichten

1. Ein Direct-Upload-Pages-Projekt anlegen; Produktionsbranch ist `main`.
   Der Projektname muss mit `CLOUDFLARE_PAGES_PROJECT` übereinstimmen.
2. Einen API-Token mit minimalem Pages-Schreibrecht für dieses Konto/Projekt
   erstellen und in beide GitHub Environments eintragen.
3. In GitHub die Environments `staging` und `production` samt obigen Variablen
   anlegen. Für `production` einen erforderlichen Reviewer aktivieren.
4. Den Feature-Stand zunächst manuell mit Workflow
   `Test and deploy Cloudflare Pages`, Ziel `staging`, bereitstellen oder später
   in einen dauerhaften Branch `staging` übernehmen.
5. Erst nach erfolgreichem Staging-Tor den Stand per Review nach `main`
   übernehmen. Diese Aktivierung ist ausdrücklich nicht Teil des aktuellen
   Feature-Branch-Commits.

Die Pipeline baut Web-App und Einzeldatei, prüft die öffentliche
Konfiguration, lädt exakt `dist/` hoch und testet anschließend sowohl die
atomare Deployment-URL als auch die feste Umgebungs-Domain. Jeder Build
liefert dafür eine öffentliche `build-meta.json` mit Commit und Umgebung aus;
die feste Domain muss nach dem Upload exakt den erwarteten Commit melden.
Push- und manuelle Läufe teilen pro Zielumgebung dieselbe Concurrency-Gruppe
und können daher nicht gleichzeitig nach Staging beziehungsweise Produktion
schreiben.

## Eigene Domain und Staging-Subdomain

Empfohlen:

- Produktion: die gewünschte Hauptdomain,
- Staging: `staging.<hauptdomain>`.

Die Produktionsdomain wird im Cloudflare-Pages-Projekt unter
`Custom domains` aktiviert. Bei einer Apex-Domain muss die Zone Cloudflare-
Nameserver verwenden.

Für Staging:

1. Es muss zuerst ein erfolgreiches Deployment des Branches `staging` geben.
2. `staging.<hauptdomain>` als Custom Domain am Pages-Projekt aktivieren.
3. Den proxied CNAME anschließend auf
   `staging.<pages-projekt>.pages.dev` setzen.
4. Dieselbe URL als `APP_URL` des GitHub Environments `staging` eintragen.

Eine nur manuell gesetzte CNAME-Verknüpfung ohne vorherige Aktivierung im
Pages-Projekt ist nicht ausreichend. Vorschau-Deployments sollen über
Cloudflare Access geschützt bleiben und tragen zusätzlich `noindex`.

## Sicherheitsheader

`public/_headers` wird von Vite nach `dist/_headers` kopiert. Es setzt:

- CSP mit `default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, eingeschränkten Script-, Style-, Font-, Bild-,
  Worker- und Connect-Quellen,
- `Referrer-Policy: strict-origin-when-cross-origin`,
- `X-Content-Type-Options: nosniff`,
- `X-Frame-Options: DENY`,
- restriktive `Permissions-Policy`.

`style-src 'unsafe-inline'` ist vorerst nötig, weil die bestehende React-App
Inline-Styles verwendet. Scripts bleiben davon unberührt und dürfen nicht
inline ausgeführt werden.

Gehashte Assets erhalten ein Jahr Immutable-Cache. HTML, Manifest, JSON und
Service Worker müssen bei jedem Besuch revalidieren. Die Single-File-Ausgabe
wird mit `Content-Disposition: attachment` ausgeliefert.

Wichtig bei einer vorgeschalteten Cloudflare-Zone: `Browser Cache TTL` muss
auf **Respect Existing Headers** stehen. Ein fester Mindestwert überschreibt
sonst bei cachefähigen JavaScript-Dateien die `max-age=0`-Regel aus
`_headers` — und damit ausgerechnet beim Service Worker. Der Remote-Smoke
weist einen solchen Zustand hart zurück.

## Service Worker

Die Regeln sind bewusst nach Datentyp getrennt:

- Navigation/HTML: network-first, offline letzter gültiger Stand,
- aktuelle JSON-Daten: network-first, damit Programm/Katalog nicht einfrieren,
- gehashte statische Assets: Cache-Treffer sofort, Revalidierung im Hintergrund,
- `/api/`, `/auth/`, `/download/` sowie Requests mit Auth-/API-Key oder
  `no-store`: ausschließlich Netzwerk,
- fremde Origins: keine Übernahme durch den Service Worker.

Beim Aktivieren werden nur alte `kd-shell-*`-Caches entfernt. Der getrennte
Katalog-Fallback `kinodreieck-katalog-*` bleibt erhalten. Der Online-Build
trägt die aktuellen gehashten JS-/CSS-Dateien in die Precache-Liste ein; die
Installationsphase legt sie zusammen mit Startseite, `index.html` und Manifest
als App-Shell ab.

## Deployment- und Abnahmetor

Vor Staging und Produktion laufen:

1. vollständige Regressionstests,
2. Prüfung der öffentlichen Runtime-Variablen,
3. Web- und Single-File-Build,
4. Manifest-, Icon-, Pfad-, Header- und Secretprüfung,
5. Service-Worker-Verhaltenstest,
6. Cloudflare-Upload,
7. HTTPS-Smoke-Test für atomare Deployment-URL und feste Domain.

Der Remote-Smoke prüft zusätzlich, dass `sw.js` keinen positiven Browser-TTL
trägt und dass `build-meta.json` auf der festen Domain den gerade
bereitgestellten Commit ausweist. Ein erfolgreicher Dateiaufruf allein genügt
nicht als Domain-Abnahme. Nur die feste Domain erhält für die mögliche kurze
Alias-Umschaltung ein begrenztes Wiederholungsfenster; die atomare
Deployment-URL muss sofort stimmen.

Die Live-Abnahme ist erst erfüllt, wenn beide Umgebungen folgende Prüfungen
bestehen:

- HTTPS ohne Zertifikatsfehler,
- Reload auf einem tiefen App-Zustand liefert die App-Hülle,
- Manifest, 180/192/512-Icons und Service Worker erreichbar,
- Installation und Offline-Rückfall funktionieren,
- neue JSON-Daten verdrängen den Cache,
- Sicherheitsheader sind auf der echten Domain vorhanden,
- `/download/` lädt die separate Einzeldatei als Attachment,
- Browser-Bundle enthält keine Secret-Signatur,
- Deploy enthält keine persönlichen Bewertungsdaten und keine
  Rohprogrammdateien (`programm.json`, `streaming_bekannt.json`,
  `streaming_entdecken.json` liegen nicht in `dist/`; Programm/Streaming
  kommen ausschließlich aus dem read-only Supabase-Katalog).

## Rückrollverfahren

Cloudflare speichert erfolgreiche Deployments atomar.

1. Im Pages-Projekt `Deployments` öffnen.
2. Den letzten nachweislich funktionierenden **Produktions**-Build auswählen.
3. Über das Drei-Punkte-Menü `Rollback to this deployment` bestätigen.
4. Produktionsdomain mit dem Remote-Smoke-Test prüfen.
5. Fehlerhaften Commit auf dem Feature-/Staging-Pfad korrigieren; nicht durch
   eine unkontrollierte Änderung an `main` überdecken.

Preview-Deployments sind kein Produktions-Rollbackziel. Ein Rückroll verändert
nur statische Dateien und löscht keine persönlichen oder Katalogdaten.

## Bewusste Nicht-Ziele

- keine echten Accounts oder produktiven persönlichen Onlinedaten,
- kein offener KI-Anbieterzugriff,
- keine Service-Role- oder Provider-Secrets im Browser,
- keine Änderung des Account-/RLS-Modells,
- kein Push oder direkter Umbau von `main`.

# Staging-Sandbox-Schutzvertrag

## Zweck und heutiger Status

Dieser Vertrag bereitet eine spaetere persoenliche Sandbox vor, ohne den
aktuellen Produktstand, Deployments oder Backends zu veraendern. Er ist eine
lokale, rein lesende Vorbedingungspruefung und kein Infrastruktur-Provisioner
oder Remote-Readback.

Am 6. September 2026 zeigen Production und Staging beide auf
`https://bscjgwcntapobyxsiyce.supabase.co`. Damit lautet der Status fuer echte
Sandbox-Daten-, Function-, Migrations- und Schedulerarbeit ausdruecklich
**BLOCKED**. Das ist kein Fehler des veroeffentlichten Releases, sondern eine
fehlende Isolationsvoraussetzung fuer die naechste Arbeitsflaeche.

## REQUIRED vor jeder echten Sandboxwirkung

Alle folgenden Identitaeten muessen vor Beginn explizit belegt und an den
beabsichtigten Commit gebunden sein:

| Grenze | Erforderlicher Beleg | Fail-closed-Regel |
| --- | --- | --- |
| Git und Build | eigener Sandbox-Branch sowie eigenes Buildziel, jeweils verschieden von Production | fehlend oder gleich bedeutet `BLOCKED` |
| Cloudflare Pages | explizite Account-ID, eigenes Pages-Projekt und eigene Domain | fehlend, ungueltig oder dasselbe Account-/Projekt-Tupel bedeutet `BLOCKED` |
| Supabase Projekt | eigene Projekt-URL und dazu passende Project Ref | fehlend, ungueltig, widerspruechlich oder gleich zu Production bedeutet `BLOCKED` |
| Supabase Functions, Migrationen und Daten | sie verwenden ausschliesslich die oben belegte Sandbox-Project-Ref; keine Production-Ref in Befehlen, Links, Ledgers oder Datenzielen | ohne getrennte Project Ref gibt es fuer keine dieser Flaechen eine Teilfreigabe |
| Provider | `disabled`; keine echten Anbieterrequests oder produktiven Provider-Secrets | jeder andere Zustand bedeutet `BLOCKED` |
| Scheduler | `disabled`; bestehende Scheduler bleiben unveraendert und deaktiviert | jeder andere Zustand bedeutet `BLOCKED` |

Die Project Ref ist die gemeinsame Autoritaetsgrenze fuer Supabase-Projekt,
Functions, Migrationen und Daten. Ein getrenntes Frontend allein isoliert
diese Backendwirkungen nicht. Eine erfolgreiche lokale Pruefung bestaetigt
nur die uebergebenen Identitaeten; vor spaeterer Wirkung braucht es zusaetzlich
einen autorisierten Infrastruktur-Readback.

## Read-only Check

Der Check benoetigt keine Secrets, liest keine Keychain und greift nicht auf
Remote-Systeme zu. Er gibt ausschliesslich `GO` oder `BLOCKED` und stabile
Ursachencodes aus; uebergebene Werte und eventuell vorhandene Umgebungs-Keys
werden nicht ausgegeben.

```sh
node tools/check-staging-sandbox.mjs \
  --staging-branch <sandbox-branch> \
  --production-branch <production-branch> \
  --staging-build-target <sandbox-buildziel> \
  --production-build-target <production-buildziel> \
  --staging-cloudflare-account-id <cloudflare-account-id> \
  --production-cloudflare-account-id <cloudflare-account-id> \
  --staging-pages-project <sandbox-pages-projekt> \
  --production-pages-project <production-pages-projekt> \
  --staging-domain <sandbox-domain> \
  --production-domain <production-domain> \
  --staging-supabase-url https://<sandbox-project-ref>.supabase.co \
  --production-supabase-url https://<production-project-ref>.supabase.co \
  --staging-supabase-project-ref <sandbox-project-ref> \
  --production-supabase-project-ref <production-project-ref> \
  --provider-effects disabled \
  --scheduler-effects disabled
```

Exit-Code `0` bedeutet `GO`; Exit-Code `2` bedeutet `BLOCKED`. Fehlende oder
doppelte Argumente, nicht-kanonische Supabase-URLs, abweichende URL/Project-Ref
und nicht getrennte Zielidentitaeten sperren. Der reale heutige Gleichheitsfall
liefert `SUPABASE_PROJECT_NOT_SEPARATE`.

Eine automatische CI-/Deploy-Verdrahtung ist bewusst nicht Teil von SBX-01.
Sie wird erst nach Max' Entscheidung und dem belegten Aufbau der getrennten
Frontend- und Supabase-Infrastruktur entworfen.

## Spaetere Designentscheidungen, nicht REQUIRED fuer SBX-01

- Name und Lebensdauer des persoenlichen Sandbox-Branches und der Domain.
- Ob fuer das zwingend eigene Cloudflare-Pages-Projekt auch ein eigener
  Cloudflare-Account verwendet wird. Ein anderer Branch oder eine andere Domain
  im Production-Pages-Projekt genuegt nicht als Sandbox-Isolation.
- Provisionierung, Region, Tarif, Seed-/Testdaten und Aufraeumregeln des neuen
  Supabase-Projekts.
- Ob spaetere Providerpfade ausschliesslich Mocks verwenden oder nach eigener
  Kosten-/Wirkungsfreigabe eine getrennte Testkonfiguration erhalten.
- Ob und wie ein spaeterer Sandbox-Scheduler entsteht. Bestehende Scheduler
  werden dafuer weder aktiviert noch veraendert.

## Nicht-Ziele

SBX-01 baut keine UI und insbesondere keinen `Control`-Tab. Ein spaeterer
`Control`-Pfad darf erst hinter einer expliziten Sandbox-Environmentgrenze
entstehen und muss dieselbe serverseitige Supabase-Zielbindung verwenden; UI-
Sichtbarkeit ist keine Sicherheitsgrenze. Ebenfalls nicht enthalten sind
Deploys, Migrationen, Functions, Datenkopien, Backups, Provideraufrufe,
Schedulerstarts oder Shared Writes.

# Kinodreieck — App (öffentlich)

Persönliche Kino-/Streaming-Empfehlungs-App für Wien. Bewertung nach dem **Dreieck**:
**Wie** (Ästhetik/Inszenierung), **Was** (Handlung/Thema), **Warum**
(filmhistorische und popkulturelle Relevanz/Wirkung) — je 0–5. Persönliche
Prägung darf WARUM ergänzen, ersetzt die kulturelle Wirkung aber nicht. Das
Dreieck ist kein eindimensionales Qualitätsranking.

Dieses öffentliche Repo enthält den App-Code sowie kuratierte beziehungsweise
synthetische Demo- und Referenzdaten — keine echten persönlichen Bewertungen.
Bei angemeldeten Konten liegen Filmliste, Blogs, Pins und Geschmacksprofil
kontogebunden in Supabase; Row Level Security trennt die Konten. Der frühere
private GitHub-Datenpfad bleibt nur als isolierter Legacy-Adapter
(`src/lib/gitDriver.js` und `src/legacy/`) erhalten und ist nicht der aktuelle
Online-Sync.

## Entwicklung

```
npm install
npm run dev        # lokaler Dev-Server
npm run build      # Web-Build (dist/)
npm run build:single  # eine eigenständige Kinodreieck.html (dist-single/)
npm run build:online  # Cloudflare-Paket inkl. separatem Download in dist/
npm test           # baut Single-File + jsdom-Regressionstests
npm run test:function  # 276 gemockte Function-Tests; Deno kommt aus npm
```

Staging, Produktion, Runtime-Variablen, eigene Domain, Sicherheitsheader und
Rollback sind in `docs/ETAPPE_2_HOSTING.md` beschrieben. Lokale öffentliche
Konfiguration kann aus `.env.example` abgeleitet werden.

## Demo installieren oder lokal behalten

`npm run build:online` erzeugt beide Produktformen:

- `dist/` ist die installierbare PWA. Lokal mit `npm run preview` öffnen; eine
  PWA-Installation funktioniert nur über HTTPS oder `localhost`.
- `dist/download/Kinodreieck.html` ist das echte lokale Datenpaket. Die Datei
  kann kopiert, archiviert und per Doppelklick ohne Webserver geöffnet werden.
  Sie enthält die geprüfte Demo-Basis; aktuelle Online-Daten werden nur
  ergänzend geladen.

Die Schritte für Android, iPhone/iPad und Desktop stehen in
[`docs/DEMO_INSTALLIEREN.md`](docs/DEMO_INSTALLIEREN.md).

Eine vollständige Beschreibung aller sichtbaren Produktfunktionen, ihrer
Bedienung und ihrer groben Datenwege steht im
[`docs/FUNKTIONSBERICHT.md`](docs/FUNKTIONSBERICHT.md).

## Sicherheit

Im Browser-Bundle stehen nur öffentliche Laufzeitwerte wie Supabase-URL und
Publishable-Key. Kontositzungen werden über den Auth-Dienst geführt;
Service-Role-, KI-Anbieter-, Cloudflare- und GitHub-Deployment-Schlüssel
bleiben server- beziehungsweise CI-seitig und dürfen weder ins Bundle noch in
Logs oder Exporte gelangen. Der historische Git-Sync ist nicht mehr Teil des
aktiven Clients; dessen Adapter bleibt vorerst nur als isolierter,
regressionsgetesteter Quellbestand erhalten.

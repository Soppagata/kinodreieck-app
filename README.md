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
```

Staging, Produktion, Runtime-Variablen, eigene Domain, Sicherheitsheader und
Rollback sind in `docs/ETAPPE_2_HOSTING.md` beschrieben. Lokale öffentliche
Konfiguration kann aus `.env.example` abgeleitet werden.

## Sicherheit

Im Browser-Bundle stehen nur öffentliche Laufzeitwerte wie Supabase-URL und
Publishable-Key. Kontositzungen werden über den Auth-Dienst geführt;
Service-Role-, KI-Anbieter-, Cloudflare- und GitHub-Deployment-Schlüssel
bleiben server- beziehungsweise CI-seitig und dürfen weder ins Bundle noch in
Logs oder Exporte gelangen. Ein Personal Access Token wird nur für den
optionalen Legacy-Git-Sync benötigt und bleibt ausschließlich im lokalen
Browser-Storage des jeweiligen Geräts.

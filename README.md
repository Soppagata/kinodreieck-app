# Kinodreieck — App (öffentlich)

Persönliche Kino-/Streaming-Empfehlungs-App für Wien. Bewertung nach dem **Dreieck**:
**Wie** (Ästhetik/Inszenierung), **Was** (Handlung/Thema), **Warum** (persönliche Prägung) — je 0–5.
Kein Qualitätsranking, sondern ein Prägungsprofil.

Dieses Repo enthält **nur den App-Code**. Persönliche Daten (Filmliste, Blogs, Pins) liegen in einem
**getrennten privaten Daten-Repo** und werden zur Laufzeit per GitHub Contents API geladen/gespeichert.
Die Dateien unter `src/data/` sind **synthetische Demo-Daten** — ein frischer Klon zeigt eine
lauffähige Demo, keine echten Bewertungen.

## Entwicklung
```
npm install
npm run dev        # lokaler Dev-Server
npm run build      # Web-Build (dist/) — für GitHub Pages
npm run build:single  # eine eigenständige Kinodreieck.html (dist-single/)
npm test           # baut Single-File + jsdom-Regressionstests
```

## Sicherheit
Der Personal Access Token für den Git-Sync existiert ausschließlich im lokalen Browser-Storage des
jeweiligen Geräts — nie im Code, Repo, in Logs oder Exporten.

# Zentraler PWA-Katalog einrichten

1. `katalog_schema.sql` einmal im Supabase SQL Editor ausführen.
2. Auf Max' Mac in `KinoFilm/Programmdateien/System/.env` ergänzen:

   ```env
   SUPABASE_URL=https://<projekt>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<nur-auf-diesem-mac>
   ```

3. Im System-Ordner einmal `node liefere_an_supabase.mjs` starten. Danach liegen
   `manifest`, `programm` und `streaming` in `public.kd_catalog`.
4. Im GitHub-Repo muss die Actions-Variable `SUPABASE_URL` gesetzt sein. Die PWA
   baut daraus die Projekt-URL; Tester tragen nur den Publishable-/Anon-Schlüssel
   im Popup ein.

Der Service-Role-Key darf nie in die PWA, GitHub Pages oder an Tester gelangen.
Die bisherige Datei-/Git-Lieferung `liefere_an_pwa.mjs` bleibt nur als historischer
Fallback im Datenordner und wird von den automatischen Jobs nicht mehr aufgerufen.

---

## Migrationen (seit Etappe 3)

Schemaänderungen liegen ab jetzt als versionierte Dateien in
`supabase/migrations/` und werden von Hand im SQL-Editor ausgeführt; das
Laufprotokoll steht in `supabase/migrations/LIESMICH.md`. Die erste Migration
legt `kd_personal` an — den persönlichen Speicher je Konto, geschützt allein
über die Anmeldung (`auth.uid()`), ohne jeden anon-Zugriff.

`kd_catalog` (diese Datei) und `kd_store` (der alte schlüsselbasierte Sync)
bleiben davon unberührt: Demo-Start und geteilte Blogs hängen an deren
öffentlich lesbaren Bereichen.

Isolationstest nach jeder RLS-berührenden Migration: `npm run test:rls`
(Konfiguration nur über Umgebungsvariablen, siehe Kopf von
`tools/rls_test_personal.mjs`).

**Hinweis zur Aktualität:** Die App wird seit Etappe 2 über Cloudflare Pages
auf `kinodreieck.at` ausgeliefert, nicht mehr über GitHub Pages. Ältere
Formulierungen oben beziehen sich auf den früheren Stand.

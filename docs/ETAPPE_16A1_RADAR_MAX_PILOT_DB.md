# Etappe 16A1 · Manueller Radar-Pilot DB

## Quellkandidat

Die additive Source-Migration `supabase/migrations/20260814120000_radar_max_manual_pilot.sql` ist der lokale Quellkandidat für den manuellen, capability-gebundenen Ein-Nutzer-Pilot. Der statische Vertrag wird durch `npm run test:radar-pilot-migration` geprüft.

Status außerhalb des Repository-Quellstands: **SAFE_SKIPPED**. Die Source-Migration im Repository ist noch nicht auf ein Backend angewandt. Backend-Write: **NEIN**. Migrationsanwendung: **NEIN**. Pilotaktivierung: **NEIN**. Praktische Abnahme: **NEIN**.

`supabase/current_schema.sql` bleibt bis zu einer später ausdrücklich autorisierten Remote-Anwendung samt anschließendem Readback unverändert. Es bildet keinen E16A1-Neustand ab.

## Nichtziele

- keine Capability-Zeile und keine personenbezogene Pilotkennung im Repository
- keine Änderung globaler Radarflags; sie bleiben fail-closed auf `false`
- keine Backend-, Migrations-, Function-, Workflow-, Provider- oder KI-Aktivierung
- kein Client-, UI-, Produkt- oder `current_schema`-Umbau
- ein später autorisierter Source-Push samt Quellbranch-/Fast-Forward-Lieferung und Pages-Staging bleibt ein getrenntes Liefergate; er bewirkt weder Backendänderung noch Migrationsanwendung, Pilotaktivierung oder praktische Abnahme

## Spätere Aktivierungsgates

Eine spätere Pilotaktivierung darf ausschließlich service-only und außerhalb des Repository-Quelltexts durch eine Capability-Zeile erfolgen. Vorher erforderlich sind: ausdrückliche Autorisierung der Migration, Backup, Anwendung in der freigegebenen Zielumgebung, Readback des tatsächlich angewandten Schemas, grüne Vertrags-/Berechtigungstests und ein vorbereiteter additiver Forward-Fix. Erst danach darf die getrennt autorisierte Capability-Aktivierung erfolgen; Readback und praktische Abnahme bleiben eigene, nachgelagerte Gates.

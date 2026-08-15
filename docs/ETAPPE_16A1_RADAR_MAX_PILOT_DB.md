# Etappe 16A1 · Manueller Radar-Pilot DB

## Quellkandidat

Die Forward-Kette bis und inkl. `20260815120000_private_export_radar_pilot_compat.sql` ist der lokale Quellkandidat für den privaten Export/Radar-Pilot-Vertrag. Der statische Vertrag wird durch `npm run test:private-ops-contract` mit ausschließlich statischen Sourceprüfungen validiert.

- Vorkontext: 20260814120000 ergänzt den manualen Pilotvertrag, 20260815120000 ergänzt den Export-Kompatibilitätsvertrag (`importOperations`, Forward-Keys, atomare Default-Off-Kennzeichnung).
- Basisvertrag bleibt `schemaVersion = 1`, bis ein Remote-Stand die Pilotaktivierung eindeutig bestätigt.

Remote-Stand (vorgegeben): `20260809180000`, `20260809220000`, `20260810120000` bestätigt; `20260814120000` und `20260815120000` fehlen und sind nicht aktiviert.

Status außerhalb des Repository-Quellstands: **SAFE_SKIPPED**. Die ersten drei Schritte der Forward-Kette sind verifiziert bestätigt, `20260814120000` und `20260815120000` fehlen; damit ist der vollständige E16B2-Backendvertrag remote nicht angewandt. Backend-Write: **NEIN**. Migrationsanwendung: **NEIN**. Pilotaktivierung: **NEIN**. Praktische Abnahme: **NEIN**.

`supabase/current_schema.sql` bleibt bis zu einer später ausdrücklich autorisierten Remote-Anwendung unverändert. Es bildet keinen E16A1-Neustand ab.

## Nichtziele

- keine Capability-Zeile und keine personenbezogene Pilotkennung im Repository
- keine Änderung globaler Radarflags; sie bleiben fail-closed auf `false`
- keine Backend-, Migrations-, Function-, Workflow-, Provider- oder KI-Aktivierung
- kein Client-, UI-, Produkt- oder `current_schema`-Umbau
- ein später autorisierter Source-Push samt Quellbranch-/Fast-Forward-Lieferung und Pages-Staging bleibt ein getrenntes Liefergate; er bewirkt weder Backendänderung noch Migrationsanwendung, Pilotaktivierung oder praktische Abnahme

## Spätere Aktivierungsgates

Eine spätere Pilotaktivierung darf ausschließlich service-only und außerhalb des Repository-Quelltexts durch eine Capability-Zeile erfolgen. Vorher erforderlich sind: ausdrückliche Autorisierung der Migration, Backup, Anwendung in der freigegebenen Zielumgebung, grüner Schema-/Vertrags-/Berechtigungsnachweis und ein vorbereiteter additiver Forward-Fix. Erst danach darf die getrennt autorisierte Capability-Aktivierung erfolgen; praktische Abnahme bleibt ein eigenes, nachgelagertes Gate.

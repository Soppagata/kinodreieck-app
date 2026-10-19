# Radar: stabile Werke, Starts und Quellenstände

Stand 19.10.2026. Implementierung im Feature-Branch; keine Remote-Migration oder Profilübernahme ausgeführt.

Die neue Zuordnung ergänzt die bisherigen Textfunde. Werk und Start erhalten eigene IDs; der Titel und der Termin bleiben veränderliche Quellenangaben. Kein vorhandener Fund, keine Versions-ID, kein Receipt und kein Import wird umgeschrieben oder gelöscht.

## Identität und neue Suchläufe

- Ein Start umfasst Werk, Startart, konkreten Angebotsweg/Plattformtext, Markt, Staffel/Folge, Edition und Lizenzart. Unbekannte Streamingplattformen bleiben fundbezogen. Verschiedene Plattformtexte und Channel-Wege werden ohne separate belegte Aliasentscheidung nicht gleichgesetzt.
- Ein akzeptierter Alias ist an Titel, Werktyp, konkrete Quell-URL, Startart, Plattform, Markt und Staffel/Folge gebunden. Reine Titelähnlichkeit erzeugt keinen Match. Unbekannte oder widersprüchliche Fälle bleiben einzeln sichtbar mit „Zuordnung offen“.
- Der bisherige v2-Speicherschlüssel enthielt keinen Markt. Nach einer expliziten Profilaktivierung wird für abweichende Märkte ein interner v3-Schlüssel verwendet. Bestehende passende v2-Zeilen werden weiterverwendet; ihre IDs und Schlüssel bleiben erhalten. Andere Profile behalten zunächst ihren bisherigen Pfad.
- Jede neue gespeicherte Quellenversion erhält einen unveränderlichen Snapshot. Bereits bekannte Aliase binden sie an denselben Start; andere Plattformen, Märkte, Startarten, Staffeln/Folgen oder Editionen bleiben getrennt oder ungeklärt.
- Widersprüchliche gespeicherte Termine erhalten keinen automatisch bestimmten Sieger. Der Quellentext bleibt sichtbar. Eine Monats-/Jahresangabe wird in der Ansicht als solche bezeichnet; sie bestätigt keinen erfundenen Monatsersten oder anderen exakten Tag. Diese Präzisionsprüfung ist keine neue Tatsachenprüfung der verlinkten Quelle.

## Alte Clients, Offlinezustand und Konten

Die bestehenden `kd_radar_pilot_feed`-Signaturen und `kd_radar_pilot_feed_search_access` bleiben unverändert. Der neue RPC `kd_radar_pilot_feed_stable_v1` liefert einen benannten Umschlag aus kompatiblem Feed und versionierten Zuordnungen. Frühere Quellenversionen aktiver eigener Funde bleiben darin mit ihren Original-UUIDs verfügbar.

Der Client speichert Zuordnungen getrennt in `kd:radar-identities:v1`. Der vorhandene `kd:radar`-Topf samt Outbox/Receipts behält sein bisheriges Format. Der neue Topf ist in Sync, Backup, Restore und Accountwechsel registriert. Konto-ID, Original-ID, Version und Speichergeneration verhindern die Übernahme eines fremden oder veralteten Ergebnisses. Nur ein belegter fehlender RPC führt zum alten Lesepfad; Auth-, Netz- und Serverfehler lösen keinen zweiten Versuch aus.

Neue Tabellen besitzen eigene Kontogrenzen und Löschkaskaden. `kd_radar_identity_export_v1()` exportiert den vollständigen eigenen Zuordnungsgraphen, ohne den strikten bisherigen Self-Service-Export zu erweitern.

## Kontrollierte Übernahme

1. Nur lesend den eigenen Feed, die Textfunde und den bisherigen Radar-Topf privat sichern. Persönliche Rohdaten und die konkrete Freigabeliste bleiben außerhalb des Repositorys.
2. Für jeden Fund eine konkrete Zuordnung oder einen begründeten offenen Fall erstellen. `node tools/radar-identity-preview.mjs <proposal.json> <review.html> [feed.json]` erstellt offline eine vollständige Liste mit Original-IDs, getrennten Startdimensionen, Belegen und SHA-256 des Manifests. Das Werkzeug besitzt keinen Netzwerk- oder Übernahmepfad.
3. Vor dem ersten Profilwrite die konkrete Liste dem Nutzer zur Prüfung vorlegen. Eine allgemeine Implementierungsfreigabe ersetzt diese ausdrücklich verlangte Profilprüfung nicht.
4. Erst nach dieser Freigabe die einzelne Migration `20261019200000_radar_stable_identity.sql` am bestätigten Ziel installieren und die neue Clientversion bereitstellen. Kein pauschales `db push`, kein Radar-/KI-Test, kein Scheduler-Reset.
5. Als authentifizierter eigener Owner das geprüfte Manifest genau einmal an `kd_radar_identity_apply(p_manifest)` übergeben. Der Server vergleicht sämtliche Originalfelder der vollständigen Bestandsliste atomar. Jede Abweichung bricht vor der Aktivierung ab. Fremde Konten sind nicht adressierbar.
6. Eigenen Graphen und Feed zurücklesen; Original-UUIDs, vollständige Startdimensionen, Beobachtungen und persönliche Receipts/Imports vergleichen. Neustart/Offline-Sync und Radar-Ansicht am Ziel prüfen. Kein zweiter Schreibversuch bei unklarem Ausgang, zuerst den Zustand lesend klären.

Der Rückweg `kd_radar_identity_disable()` deaktiviert nur die neue Leseprojektion des eigenen Profils. Originalfunde und persönliche Vorgänge bleiben erhalten; gespeicherte Quellenstände bleiben für Prüfung/Export verfügbar. Der Client übernimmt den deaktivierten Stand auch in seinen separaten Offline-Cache. Es erfolgt keine automatische Aktivierung anderer Profile.

## Lokale Prüfung

- `npm run test:radar-identities`: deterministische Identität, Client-/Cachegrenzen und tatsächliche React-Ansicht mit synthetischen Daten.
- `npm run test:radar-identities:pg17`: echte lokale Migrations-/RPC-/RLS-Prüfung, Snapshot-Drift, Idempotenz, Quellenhistorie, mehrere Suchziele, Export, Rückweg und Accountlöschung.
- Vorhandene Radar-, Backup-, Restore- und Kontotests bleiben wirksam. Keine kostenpflichtigen Anbieteraufrufe.

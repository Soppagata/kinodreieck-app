# Etappe 9: Abnahmeprotokoll

Stand: 30. Juli 2026

Dieses Protokoll trennt fertige Belege von den Schritten, die reale Geräte,
Personen, Material oder eine ausdrückliche externe Freigabe brauchen. Ein
vorbereiteter Schritt gilt nicht als praktisch abgenommen.

## Versionierter Stand

- Arbeitszweig: `codex/etappe-9a-distribution`
- 9a Distribution: Commit `1fb608f`
- 9b/9c Betrieb und Beta-Paket: Commit `ef8d278`
- Supabase-Projekt: Produktion, EU-West
- Cloudflare-Projekt: bestehendes Pages-Projekt `kinodreieck`

## Erledigte Belege

| Bereich | Ergebnis | Beleg |
|---|---|---|
| Öffentliche Distribution | grün | Demo- und Leereinstieg, bestehende PWA-Installation, iOS-Hinweis und Einzeldatei-Download; 11/11 Distribution-Checks |
| Datenschutz im Paket | grün | keine persönlichen Rohdaten, Sitzungswerte oder bekannte Secret-Signaturen im Build; 48/48 Pages-Checks |
| App-Backup/Restore | grün im vollständigen technischen Roundtrip | 63/63 Restore-Checks einschließlich Snapshot, Rückgängig, Konto-Treiber, Alt-Backup und Profil |
| Kontentrennung | grün gegen Produktion | 54/54 RLS-Negativtests mit zwei getrennten Testkonten |
| KI-Not-Aus | grün gegen Produktion | Schalter kurz deaktiviert; Auftrag serverseitig vor Log und Anbieter abgewiesen; im selben Lauf wieder freigegeben |
| Beta-Kostenlimit | aktiv | Tageslimit 10, Monatsdeckel unverändert 1000 US-Cent |
| Antwortlimit | aktiv | `intelligent-search` auf 4096 Ausgabetokens begrenzt |
| Function-Vertrag | grün | 276/276 kostenfreie Tests; kein echter Anbieteraufruf |
| Accountlöschung | grün gegen Produktion | technisches Wegwerfkonto samt persönlicher Testzeile angelegt, gelöscht und das Fehlen beider Ebenen direkt geprüft |
| GitHub-Produktion | gehärtet | Required Reviewer aktiv; ausschließlich `main` darf die Produktionsumgebung deployen |
| Supabase-Registrierung | geschlossen | neue Sign-ups aus; Confirm email für manuell angelegte Beta-Konten aus |
| Betriebsrunbook | grün | Not-Aus, Ausfälle, Rollback, Schlüsselrotation, Löschung sowie Rückweg und Beleg dokumentiert |
| Beta-Paket | fertig vorbereitet | Rollen, 11 Szenarien, Testerhinweis, Ergebnisbogen, Stopkriterien und Abschlussauswertung |
| Gesamtprüfung | grün | vollständiges `npm test`; 23/23 Etappe-9-Betriebschecks |

Für keinen dieser Belege wurde ein kostenpflichtiger KI-Aufruf ausgeführt.

## Noch nicht als praktisch abgenommen

### GitHub, Staging und Produktion

Der lokale Stand ist noch nicht zu GitHub übertragen. Die Sicherheitsprüfung
verlangt vor dem Export des größeren Repository-Stands eine ausdrückliche
Bestätigung des Zieles `Soppagata/kinodreieck-app`. Erst danach folgen:

1. Push des Etappe-9-Zweigs,
2. Staging-Deployment und Domain-Smoke,
3. praktischer Cloudflare-Rollback auf den letzten guten Stand,
4. erneuter Staging-Deploy,
5. geschützte Produktionsfreigabe,
6. Produktions-Domain-Smoke mit der erwarteten Commit-Version.

### Datenbank-Disaster-Recovery

Das offizielle Supabase-Dumpwerkzeug erreicht das verknüpfte Projekt, bricht
vor dem Dump aber kontrolliert ab, weil Docker Desktop auf dem Mac nicht
installiert ist. Es wurde kein Ersatzdump gebaut und kein Inhalt im Repository
gespeichert.

Vor der Beta ist eine der zwei einfachen Varianten festzulegen:

1. Free-Plan behalten, Docker bereitstellen und den dokumentierten logischen
   Dump in ein Wegwerfziel restaurieren, oder
2. Supabase Pro buchen und trotzdem einmal den unabhängigen Restore proben.

### Reale Geräte und geschlossene Kohorte

Diese Nachweise können nicht synthetisch ersetzt werden:

- Android-Installation auf einem echten Gerät,
- iOS-Installation auf einem echten Gerät,
- ein freigegebenes Scanfoto und ein freigegebener Blogtext,
- ein bestehender privater Feedbackkanal,
- vier bis fünf konkret benannte Personen,
- deren ausgefüllte Szenarien und die gemeinsame Abschlussauswertung.

Bis diese Punkte vorliegen, ist das Beta-Paket fertig, die geschlossene Beta
selbst aber noch nicht gestartet oder abgenommen.

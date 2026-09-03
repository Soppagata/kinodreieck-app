# E6: einmaliger Kontogrößen-Readback

Stand: 3. September 2026

Der aktuelle Max-Kontostand wurde genau einmal über alle 13 eingefrorenen
Releaseklassen vermessen. Die Abfrage lief in einer PostgreSQL-Transaktion mit
`transaction_read_only=on` und gab ausschließlich Datenklasse, Zeilenanzahl und
gespeicherte Bytezahl aus. Konto-ID, Schlüssel und Inhalte wurden weder
ausgegeben noch in diesen Beleg übernommen.

Die vorbereitete RPC-Migration `20260902130000` ist auf dem Zielsystem nicht
installiert. Für diesen einmaligen E6-Beleg war sie nicht nötig: dieselbe
Aggregation wurde direkt als reine Leseabfrage ausgeführt. Es gab daher keine
Schema- oder Datenmutation.

| Releaseklasse | Zeilen | Bytes |
|---|---:|---:|
| auth-account | 2 | 624 |
| account-access | 1 | 61 |
| personal-sync-pots | 14 | 86.080 |
| ai-operation-logs | 115 | 19.736 |
| series-watch | 2 | 141 |
| shared-articles | 1 | 296 |
| shared-claims | 1 | 61 |
| radar-capabilities-state | 2 | 179 |
| radar-subscriptions-receipts-shares | 3 | 381 |
| radar-operations-reviews | 22 | 7.365 |
| radar-text-findings | 14 | 5.736 |
| retention-information | 0 | 0 |
| deletion-status | 0 | 0 |
| **Gesamt** | **177** | **120.660** |

Das sind rund 118 KiB im gemessenen Kontostand. Gemeinsame oder
regenerierbare Katalog-, Such-, Feed-, Bild-, Cache- und Programmdaten sind
entsprechend dem eingefrorenen Vertrag nicht als persönliche Kontodaten
mitgezählt. Der Wert ist eine zeitgebundene Bestandsaufnahme, keine
Speichergrenze, Kapazitätszusage oder Hochrechnung.

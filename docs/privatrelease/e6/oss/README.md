# E6 OSS-Inventarbeleg

Dieser Ordner belegt eine reproduzierbare, netzfreie technische Inventur des
`package-lock.json` aus Basiscommit
`25220910879013e769b8e53295553c8d50d8a2c2`. Er ist weder Rechtsfreigabe noch
Vollstaendigkeitsnachweis und enthaelt keine extern beschafften Lizenztexte.

## Gebundene Eingabe und Werkzeugfassung

- `package-lock.json` (npm lockfile v3), SHA-256:
  `323520492a922e53fe658b8ceaa0cbcb26fcfc015883d456b266eff3d9326c7d`
- Offline-CLI `inventory-cli.mjs`, SHA-256:
  `e44165c5ad5ccb51304de1bb61ec3ef2950de8d66326d3c18aa4687e7fdf0471`
- Offline-Bibliothek `inventory-lib.mjs`, SHA-256:
  `940ea2c54fef65f32e02821f8cb06b3aa523892528c0553d831ba38a35ff95bd`
- `review-policy.json`, SHA-256:
  `4e94dc9565b843ca7c15bee0f6d9d6b19ee45cfb667162ac696b98265f622735`

Das verwendete Werkzeug liegt lokal unter
`/Users/max/Documents/Codex/2026-08-28/kd-road-live-oss-lizenzen/` und besitzt
keine externen Abhaengigkeiten oder Netzwerkzugriffe.

## Reproduktion

Vom Repository-Root aus zwei leere temporaere Ausgabeverzeichnisse anlegen
und jeweils ausfuehren:

```sh
node /Users/max/Documents/Codex/2026-08-28/kd-road-live-oss-lizenzen/src/inventory-cli.mjs \
  --lock package-lock.json \
  --out <ausgabeverzeichnis> \
  --policy docs/privatrelease/e6/oss/review-policy.json
```

Danach `inventory.json`, `inventory.csv`, `NOTICE-DRAFT.md` und
`sample-policy.json` paarweise mit `cmp` vergleichen. Die zwei getrennten
E6-Laeufe waren fuer alle vier Dateien bytegleich. Die uebernommenen
Artefakte haben folgende SHA-256-Werte:

- `inventory.json`:
  `e48c79b153138fbdcdcc400ed9d95fd5ffb6661c851b8a62ccbcd3c47493f865`
- `inventory.csv`:
  `6549cfd9b19fa6b6c400e40f34d3b95205a829673d58dce76c19644a97a48bc2`
- `NOTICE-DRAFT.md`:
  `4c0603db43f8b26182b03b304af0299724d2b8658e5da2a329b276bdf3b335f1`

## Ergebnis und offene Reviewmarker

Das Lockfile-Inventar umfasst 214 Eintraege: 2 `prod`, 211 `dev`, 0
`optional` und 1 `unknown` beim Scope. Der unbekannte Scope betrifft
`scheduler@0.27.0` und bleibt manuell zu pruefen.

Die Generatorzaehler `reviewRequired: 0`, `missingLicense: 0` und
`complexLicense: 0` bedeuten nur, dass die im Lockfile vorhandenen Felder
keinen Policy-Treffer erzeugt haben. Sie sind keine rechtliche Bewertung.
Lizenztexte, Paketquellen, Copyright-Hinweise, SPDX-Validierung und die
produktive NOTICE-Auswahl bleiben offen.

Auch `direct`/`transitive` ist nur die Pfadtiefen-Klassifikation dieses
Werkzeugs (210/4), nicht der belastbare npm-Abhaengigkeitsgraph. Der
dokumentierte Aufruf ohne `--policy` ist in dieser Werkzeugfassung defekt;
deshalb bindet dieser Beleg die eingecheckte konservative Policy explizit.

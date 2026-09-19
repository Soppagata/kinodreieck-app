# Blog-Publikation mit Autorentscheidung v3

Stand: 19. September 2026. `blog-publication-v3` ergänzt v2 additiv. Die v1- und
v2-RPCs bleiben mit ihren bisherigen Request- und Antwortformen verfügbar.

## Autorquelle und Nutzerentscheidung

Der öffentliche Profilautor ist ausschließlich der angemeldete Kinodreieck-
Benutzername. Der Server akzeptiert ihn nur aus einer synthetischen Auth-Adresse
mit exakt der internen Domain `login.kinodreieck.at`; veröffentlicht wird nur der
normalisierte Teil vor `@`. Adressen anderer Domains, mehrere `@`, leere oder
ungültige Namen ergeben `profileAuthor: null`. Die vollständige E-Mail-Adresse,
Account-ID, private Artikel- und Referenz-IDs werden nie projiziert.

`kd:autor-name` ist keine Quelle für Blog-Publikationen. Ein Profilname wird vor
dem Klick im Veröffentlichungsbutton gezeigt. Der Client sendet bei Publish und
Update zusätzlich genau eine Entscheidung:

```json
{"mode":"profile","expectedAuthor":"max"}
```

oder

```json
{"mode":"anonymous","expectedAuthor":null}
```

Der Server vergleicht `expectedAuthor` mit dem aktuellen kanonischen Login-
Benutzernamen. Eine Abweichung endet ohne Write als `AUTHOR_CHANGED`. Der volle
v3-Request einschließlich `authorDecision` fließt in den Idempotenz-Hash. Autor,
Inhalt, Referenzen und öffentliche Revision werden in derselben Transaktion
geschrieben. Bestehende Zeilen erhalten bei der Migration `author_mode =
anonymous`; sie bleiben anonym, bis ein Nutzer bei einem Update bewusst den
benannten Modus wählt.

## RPCs

- `kd_blog_publication_capabilities_v3()`
- `kd_publish_blog_v3(p_request jsonb)`
- `kd_update_blog_publication_v3(p_request jsonb)`
- `kd_withdraw_blog_publication_v3(p_request jsonb)`
- `kd_read_own_blog_publication_v3(p_request jsonb)`
- `kd_list_shared_articles_v3(p_request jsonb)`

Die Capability besitzt exakt diese Felder:

```text
contractVersion, enabled, anonymousProjection, namedAuthorProjection,
profileAuthor, maxAuthorCharacters, maxReferences, cursorPagination,
ownerReadback, legacyProjectionSafe, rpcs
```

`contractVersion` ist `blog-publication-v3`, `maxAuthorCharacters` ist `120`,
`maxReferences` ist `50`. `profileAuthor` ist ein gültiger Username oder `null`.

Publish und Update behalten die v2-Felder und ergänzen exakt `authorDecision`.
`publication` in Mutation und Owner-Readback ergänzt `authorMode` und `author`.
Öffentliche v3-Listeneinträge behalten die v2-Form; ihr vorhandenes Feld
`author` enthält den bestätigten Username oder `Ohne Namensangabe`.

## Clientnaht

Der Publikationscontroller stellt getrennte Aktionen bereit:

```text
onPrivateSave({ draftKey })
onPublish({ draftKey, anonymousPublication })
```

Privates Speichern startet keine Publikations-RPC. Die Checkbox
`Anonym veröffentlichen` steuert ausschließlich `authorDecision`; sie ist bei
neuen Artikeln aus. Beim Reload einer bestehenden Publikation stammt ihr Stand
aus `currentPublication.authorMode`. Ein fehlender Profilautor sperrt nur die
benannte Publikation, nicht privaten Save oder anonyme Publikation.

Der KI-Referenzscan bleibt ein separater, optionaler Weg. Bei ausgeschaltetem
Schalter zeigt der Editor nur den Weg zu `Personalisierung & KI`; er aktiviert
keinen Schalter und startet keinen Providerrequest.

# Apple-Plattformvertrag

Der spätere Apple-Client verwendet dieselben Operationsnamen, IDs, Payloads,
Fehlercodes, Revisionen und Idempotency-Keys wie HTTP und Tools. Swift-Typen
werden aus `openapi.yaml` beziehungsweise `tool-schemas.json` abgeleitet; ein
zweites fachliches Modell ist nicht vorgesehen.

Ein lokales iPhone-Modell erhält nur einen Prozess-internen Werkzeugdispatcher.
Es erhält keinen eingebauten Owner-Key. Der Dispatcher bindet jedes Werkzeug an
das aktive App-Konto und die aktuell erlaubten Capabilities. Lokale Resultate
unterscheiden `local_saved`, `sync_pending`, `server_confirmed` und `conflict`.
Ein lokaler Erfolg wird nicht als Serverbestätigung bezeichnet.

Jeder schreibende lokale Befehl besitzt eine UUID als `operationId`, den bei
der letzten Serverbestätigung gesehenen `expectedRevision`-Wert und eine
kanonisch gehashte Nutzlast. Nach Reconnect wird derselbe Befehl erneut
übermittelt. Gleiche ID plus gleicher Hash liefert das gespeicherte Resultat;
gleiche ID plus anderer Hash liefert `IDEMPOTENCY_MISMATCH`. Eine inzwischen
höhere Serverrevision liefert `REVISION_CONFLICT` mit der aktuellen Revision,
ohne den lokalen oder serverseitigen Stand still zu überschreiben.

Auswahl ist flüchtig und besteht aus geordneten stabilen IDs. Text- und
JSON-Projektion sind lokal ausführbar, sofern alle gewählten Einträge lokal
vorliegen. Clipboard und Dateispeicherung sind App-Effekte nach erfolgreicher
Projektion. Sie werden getrennt vom Fachresultat gemeldet. Es entsteht kein
Sammlungsdatensatz.

Offline angeboten werden ausschließlich Operationen, deren benötigte Daten
vollständig im lokalen Kontokontext liegen. KD-KI, Backenddiagnose, aktuelle
globale Nutzung und nicht lokal vorhandene Publikationen sind `online_required`.
Member-Capabilities enthalten auch lokal keine KD-KI- oder Diagnosetools.

Eine spätere reale Apple-Abnahme muss Offlineänderung, App-Neustart,
Reconnect, Konflikt mit der PWA, Wiederholung derselben Operation, Keywechsel,
Kontowechsel sowie echten Clipboard-/Dateieffekt auf einem Gerät prüfen. Dieser
Foundation-Vertrag behauptet weder eine implementierte Swift-App noch ein
ausgewähltes lokales Modell.

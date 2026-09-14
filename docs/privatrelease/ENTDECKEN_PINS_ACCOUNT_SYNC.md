# Kontogebundene Entdecken-Titelpins

Stand: 14. September 2026. Die Implementierung und Migration sind lokal
vorbereitet; dieses Dokument autorisiert keine Remoteausführung.

`kd:entdecken-pins` ist ein persönlicher Kontotopf. Er läuft über dieselbe
Storage-Fassade, Registry, Kontoübernahme, Sicherung und Wiederherstellung wie
Kino-Pins und Streaming-Dienste. Der gespeicherte Umschlag trägt den gebundenen
Storage-Owner und die Aktivierungsgeneration. Ein zweites Gerät übernimmt nur
einen serverbestätigten Topf desselben Kontos.

Alte Arraybestände besitzen keine Eigentümerbindung. Im Gastmodus bleiben sie
sichtbar und bearbeitbar. Vor einem Konto-Refresh sichert der echte
Account-Treiber diese Pins zuerst unter `kd:entdecken-pins:legacy-unbound`.
Scheitert diese Sicherung, überschreibt der Refresh den rohen Pin-Topf nicht.

Gehörte der vorhandene Cache bereits nachweislich zum selben bestätigten Konto,
wird der Altbestand mit dessen Serverpins vereinigt und in den ownergebundenen
Topf überführt. Bei einem neuen oder nicht eindeutig zuordenbaren Konto bleibt
er gerätelokal gesichert. Das normale Start-Pinboard zeigt dann Anzahl und den
Knopf „Titel-Pins in dieses Konto übernehmen“. Erst dieser Klick vereinigt den
Altbestand mit den vorhandenen Kontopins und stößt den Konto-Sync an. Ein bloßer
Login oder Refresh lädt ihn nicht still zum nächsten Konto hoch.

Die Startansicht entfernt keine Titelpins mehr aufgrund eines fehlenden oder
mehrdeutigen Katalogtreffers. Solche Pins bleiben gespeichert und können bei
einem später vollständigeren Katalog wieder eindeutig aufgelöst werden. Ein Pin
wird nur durch die ausdrückliche Pin-Umschaltung des Nutzers entfernt.

Die additive Migration
`20260914230000_entdecken_pins_personal.sql` erweitert ausschließlich den
CHECK-Constraint von `kd_personal` um `kd:entdecken-pins`. Sie legt keine Daten
an, überträgt keinen Altbestand und startet keinen Job oder Anbieteraufruf.

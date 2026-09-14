# Kontogebundene Entdecken-Titelpins

Stand: 14. September 2026. Die Implementierung und Migration sind lokal
vorbereitet; dieses Dokument autorisiert keine Remoteausführung.

`kd:entdecken-pins` ist ein persönlicher Kontotopf. Er läuft über dieselbe
Storage-Fassade, Registry, Kontoübernahme, Sicherung und Wiederherstellung wie
Kino-Pins und Streaming-Dienste. Der gespeicherte Umschlag trägt den gebundenen
Storage-Owner und die Aktivierungsgeneration. Ein zweites Gerät übernimmt nur
einen serverbestätigten Topf desselben Kontos.

Alte Arraybestände besitzen keine Eigentümerbindung. Im Gastmodus bleiben sie
sichtbar und bearbeitbar. In einem Kontokontext werden sie nur dann übernommen,
wenn der Account-Treiber für genau diesen Topf bereits eine Serverrevision
bestätigt hat, etwa nach einer bewussten Kontoübernahme. Andernfalls bleiben sie
unter `kd:entdecken-pins:legacy-unbound` lokal erhalten und erscheinen nicht als
Pins des nächsten Kontos.

Die Startansicht entfernt keine Titelpins mehr aufgrund eines fehlenden oder
mehrdeutigen Katalogtreffers. Solche Pins bleiben gespeichert und können bei
einem später vollständigeren Katalog wieder eindeutig aufgelöst werden. Ein Pin
wird nur durch die ausdrückliche Pin-Umschaltung des Nutzers entfernt.

Die additive Migration
`20260914230000_entdecken_pins_personal.sql` erweitert ausschließlich den
CHECK-Constraint von `kd_personal` um `kd:entdecken-pins`. Sie legt keine Daten
an, überträgt keinen Altbestand und startet keinen Job oder Anbieteraufruf.

#!/usr/bin/env node
/* Stillgelegter historischer Sonderweg.
   ========================================================================
   Dieser Dateiname bleibt nur als fail-closed Hinweis fuer alte Notizen und
   lokale Aufrufe erhalten. Der fruehere Code konnte einen bezahlten
   `profile-extract`-Request ausserhalb der heute verbindlichen seriellen
   Live-Laufwache senden und ist deshalb absichtlich entfernt.

   Bezahlte KI-Abnahmen laufen ausschliesslich ueber:
     npm run test:ai:live
     npm run test:ai:eval

   Die kostenfreie Profile-Vertragsprobe bleibt erreichbar ueber:
     npm run test:ai:contract
   ======================================================================== */

console.error(
  "LIVE_PROFIL_STILLGELEGT: Bezahlte KI-Tests duerfen nur ueber "
    + "test:ai:live oder test:ai:eval laufen.",
);
process.exit(64);

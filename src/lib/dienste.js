/* ================= Dienste-Anzeigefilter (Joyn-Fix, Etappe 1) =================
   Zentrale Filterfunktion für alle Stellen, die Streaming-Dienste als Badges
   oder Links rendern (badgeFuer in App, DienstBadges im StreamingTab, die
   drei FinderTab-Renderstellen). Konvention EXAKT wie `dienstOk` im
   StreamingTab: leere/fehlende Abo-Auswahl bedeutet "alles zeigen"; sonst
   bleiben nur Dienste übrig, die in der Auswahl enthalten sind — abgewählte
   Dienste (z. B. Joyn) taggen damit nirgends mehr.
   Bewusst NICHT angewendet: Katalog-Status-Zeile in den Einstellungen
   ("Quellen im Katalog") — das ist eine Statusanzeige über den Rohkatalog. */
export function sichtbareDienste(dienste, auswahl) {
  const liste = dienste || [];
  if (!auswahl || auswahl.length === 0) return liste;
  return liste.filter((d) => auswahl.includes(d));
}
